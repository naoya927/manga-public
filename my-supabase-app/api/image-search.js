const {
    findRecordByLegacyIdentity,
    getSupabase,
    json,
    readJsonBody,
    removeStoragePaths,
    requirePassphrase
} = require('./_lib');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
};
const SEARCH_TIMEOUT_MS = 5000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map();

function normalizeResults(items) {
    const seen = new Set();
    return items
        .map((item) => ({
            thumbnail: String(item.thumbnail || item.image || '').trim(),
            image: String(item.image || '').trim(),
            title: String(item.title || '').trim(),
            source: String(item.source || '').trim()
        }))
        .filter((item) => item.image)
        .filter((item) => {
            if (seen.has(item.image)) {
                return false;
            }
            seen.add(item.image);
            return true;
        })
        .slice(0, 20);
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function buildSearchQueries(query) {
    const normalized = String(query || '').trim();
    if (!normalized) {
        return [];
    }

    const variants = [normalized];
    if (!/(漫画|コミック|単行本)/.test(normalized)) {
        variants.push(`${normalized} 漫画`);
    } else if (/漫画$/.test(normalized)) {
        variants.push(normalized.replace(/\s*漫画$/, '').trim());
    }

    return variants.filter(Boolean).filter((value, index, array) => array.indexOf(value) === index);
}

function getCachedResults(query) {
    const cacheKey = String(query || '').trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.timestamp > SEARCH_CACHE_TTL_MS) {
        searchCache.delete(cacheKey);
        return null;
    }

    return cached.results;
}

function setCachedResults(query, results) {
    if (!Array.isArray(results) || results.length === 0) {
        return;
    }
    searchCache.set(String(query || '').trim().toLowerCase(), {
        timestamp: Date.now(),
        results
    });
}

function mergeSearchResults(...groups) {
    return normalizeResults(groups.flat());
}

async function fetchText(url, headers = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
    const response = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.text();
}

async function tryDuckDuckGo(query) {
    const tokenHtml = await fetchText(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
        {
            Referer: 'https://duckduckgo.com/'
        }
    );

    const match =
        tokenHtml.match(/vqd=["']([^"']+)/) ||
        tokenHtml.match(/vqd=([^&"']+)/) ||
        tokenHtml.match(/vqd\\x3d\\x22([^"\\]+)\\"/);

    if (!match?.[1]) {
        return [];
    }

    const vqd = match[1];
    const response = await fetch(
        `https://duckduckgo.com/i.js?l=jp-jp&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
        {
            headers: {
                ...DEFAULT_HEADERS,
                Accept: 'application/json, text/javascript, */*; q=0.01',
                Referer: 'https://duckduckgo.com/'
            },
            signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
        }
    );

    if (!response.ok) {
        return [];
    }

    const data = await response.json().catch(() => ({}));
    return normalizeResults(
        (data.results || []).map((item) => ({
            thumbnail: item.thumbnail || '',
            image: item.image || '',
            title: item.title || '',
            source: item.source || 'DuckDuckGo'
        }))
    );
}

async function tryBing(query) {
    const html = await fetchText(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
        {
            Referer: 'https://www.bing.com/'
        }
    );

    const matches = html.matchAll(/\bm=(['"])(.*?)\1/g);
    const items = [];

    for (const match of matches) {
        const raw = decodeHtmlEntities(match[2]);
        if (!raw.includes('"murl"') || !raw.includes('"turl"')) {
            continue;
        }

        try {
            const parsed = JSON.parse(raw);
            items.push({
                thumbnail: parsed.turl || '',
                image: parsed.murl || '',
                title: parsed.t || '',
                source: parsed.sitename || 'Bing'
            });
        } catch (_error) {
            continue;
        }
    }

    return normalizeResults(items);
}

async function searchOnce(query) {
    const [duckDuckGo, bing] = await Promise.allSettled([
        tryDuckDuckGo(query),
        tryBing(query)
    ]);

    return mergeSearchResults(
        duckDuckGo.status === 'fulfilled' ? duckDuckGo.value : [],
        bing.status === 'fulfilled' ? bing.value : []
    );
}

// ===== GET: 画像検索 =====
async function handleSearch(req, res) {
    try {
        const query = String(req.query.q || '').trim();
        if (!query) {
            json(res, 200, []);
            return;
        }

        const cachedResults = getCachedResults(query);
        if (cachedResults) {
            json(res, 200, cachedResults);
            return;
        }

        const candidates = buildSearchQueries(query);
        let results = [];

        for (const candidate of candidates) {
            results = await searchOnce(candidate);
            if (results.length > 0) {
                break;
            }
        }

        setCachedResults(query, results);
        json(res, 200, results);
    } catch (_error) {
        json(res, 200, []);
    }
}

// ===== POST: 自動カバー画像取得 =====
async function handleAutoCover(req, res) {
    try {
        const body = await readJsonBody(req);
        const supabase = getSupabase();
        const title = String(body.title || '').trim();
        const date = String(body.date || '').trim();

        if (!title || !date) {
            json(res, 400, { error: 'title and date are required.' });
            return;
        }

        const record = await findRecordByLegacyIdentity(supabase, title, date);
        if (!record) {
            json(res, 404, { error: 'レコードが見つかりません' });
            return;
        }

        if (record.cover_image_url) {
            json(res, 200, { status: 'already_has_cover', image_url: record.cover_image_url });
            return;
        }

        // 表紙画像検索
        const coverQueries = [
            `${title} 漫画 表紙 1巻`,
            `${title} manga cover`
        ];

        let imageUrl = null;
        for (const q of coverQueries) {
            const results = await searchOnce(q);
            if (results.length > 0) {
                imageUrl = results[0].image;
                break;
            }
        }

        if (!imageUrl) {
            json(res, 200, { status: 'no_image_found' });
            return;
        }

        // 画像ダウンロード
        const imgResponse = await fetch(imageUrl, {
            headers: {
                ...DEFAULT_HEADERS,
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!imgResponse.ok) {
            json(res, 200, { status: 'download_failed' });
            return;
        }

        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let extension = 'jpg';
        if (contentType.includes('png')) extension = 'png';
        else if (contentType.includes('webp')) extension = 'webp';
        else if (contentType.includes('gif')) extension = 'gif';

        // Supabase Storageへアップロード
        const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'manga-images';
        const ownerUserId = process.env.OWNER_USER_ID || '';
        const storagePath = `${ownerUserId}/covers/auto-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(storageBucket)
            .upload(storagePath, buffer, { contentType, upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        // レコード更新
        const oldPaths = record.cover_image_path ? [record.cover_image_path] : [];
        const { error: updateError } = await supabase
            .from('manga_records')
            .update({ cover_image_path: storagePath, cover_image_url: publicUrl })
            .eq('id', record.id);

        if (updateError) throw updateError;

        await removeStoragePaths(supabase, oldPaths);
        json(res, 200, { status: 'success', image_url: publicUrl });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to auto-fetch cover image.' });
    }
}

module.exports = async function handler(req, res) {
    if (!requirePassphrase(req, res)) {
        return;
    }

    if (req.method === 'GET') {
        await handleSearch(req, res);
        return;
    }

    if (req.method === 'POST') {
        await handleAutoCover(req, res);
        return;
    }

    json(res, 405, { error: 'Method not allowed' });
};

