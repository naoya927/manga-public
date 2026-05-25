const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'manga-images';
const OWNER_USER_ID = process.env.OWNER_USER_ID || '';
const APP_PASSPHRASE = (process.env.APP_PASSPHRASE || '').trim();
const APP_UNLOCK_COOKIE_NAME = 'manga_app_unlock';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');

function getAppUnlockToken() {
    return crypto.createHash('sha256').update(APP_PASSPHRASE).digest('hex');
}

function parseCookies(req) {
    const rawCookie = Array.isArray(req.headers.cookie)
        ? req.headers.cookie.join('; ')
        : req.headers.cookie || '';

    return rawCookie.split(';').reduce((cookies, part) => {
        const trimmed = part.trim();
        if (!trimmed) {
            return cookies;
        }

        const separatorIndex = trimmed.indexOf('=');
        const key = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : trimmed;
        const value = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1).trim() : '';
        cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function appendSetCookie(res, value) {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
        res.setHeader('Set-Cookie', value);
        return;
    }

    if (Array.isArray(existing)) {
        res.setHeader('Set-Cookie', [...existing, value]);
        return;
    }

    res.setHeader('Set-Cookie', [existing, value]);
}

function isSecureRequest(req) {
    const forwardedProto = Array.isArray(req.headers['x-forwarded-proto'])
        ? req.headers['x-forwarded-proto'][0]
        : req.headers['x-forwarded-proto'];

    return forwardedProto === 'https' || Boolean(req.connection?.encrypted);
}

function setAppUnlockCookie(req, res, value, maxAge) {
    const parts = [
        `${APP_UNLOCK_COOKIE_NAME}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`
    ];

    if (isSecureRequest(req)) {
        parts.push('Secure');
    }

    appendSetCookie(res, parts.join('; '));
}

function clearAppUnlockCookie(req, res) {
    setAppUnlockCookie(req, res, '', 0);
}

function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

function requireOwnerUserId() {
    if (!OWNER_USER_ID) {
        throw new Error('OWNER_USER_ID is required.');
    }
    return OWNER_USER_ID;
}

function json(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.end(JSON.stringify(payload));
}

function requirePassphrase(req, res) {
    if (!APP_PASSPHRASE) {
        return true;
    }

    const receivedHeader = Array.isArray(req.headers['x-app-passphrase'])
        ? req.headers['x-app-passphrase'][0]
        : req.headers['x-app-passphrase'];
    const receivedPassphrase = String(receivedHeader || '').trim();
    const cookieToken = parseCookies(req)[APP_UNLOCK_COOKIE_NAME] || '';
    const unlockToken = getAppUnlockToken();

    if (receivedPassphrase === APP_PASSPHRASE || cookieToken === unlockToken) {
        if (receivedPassphrase === APP_PASSPHRASE && cookieToken !== unlockToken) {
            setAppUnlockCookie(req, res, unlockToken, 60 * 60 * 24 * 30);
        }
        return true;
    }

    clearAppUnlockCookie(req, res);
    json(res, 401, { error: 'Unauthorized' });
    return false;
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function formatLegacyDate(value) {
    const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date(value));

    const map = {};
    for (const part of parts) {
        map[part.type] = part.value;
    }

    return `${map.year}/${map.month}/${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function parseLegacyDate(value) {
    const [datePart = '', timePart = '00:00:00'] = String(value || '').trim().split(' ');
    const [year, month, day] = datePart.split('/').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    if (!year || !month || !day) {
        throw new Error(`Invalid date: ${value}`);
    }

    const utcMillis = Date.UTC(year, month - 1, day, (hour || 0) - 9, minute || 0, second || 0);
    return new Date(utcMillis).toISOString();
}

function currentTimestampIso() {
    return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
}

function decodeDataUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
        return null;
    }

    const [header, encoded] = dataUrl.split(',', 2);
    let extension = 'png';
    let contentType = 'image/png';

    if (header.includes('jpeg') || header.includes('jpg')) {
        extension = 'jpg';
        contentType = 'image/jpeg';
    } else if (header.includes('webp')) {
        extension = 'webp';
        contentType = 'image/webp';
    } else if (header.includes('gif')) {
        extension = 'gif';
        contentType = 'image/gif';
    }

    return {
        extension,
        contentType,
        buffer: Buffer.from(encoded, 'base64')
    };
}

function storagePublicUrl(supabase, path) {
    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

async function uploadImageFromDataUrl(supabase, dataUrl, folder) {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
        return null;
    }

    const storagePath = `${requireOwnerUserId()}/${folder}/${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${decoded.extension}`;
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, decoded.buffer, {
        contentType: decoded.contentType,
        upsert: false
    });

    if (error) {
        throw error;
    }

    return {
        storagePath,
        publicUrl: storagePublicUrl(supabase, storagePath)
    };
}

async function removeStoragePaths(supabase, paths) {
    const targets = (paths || []).filter(Boolean);
    if (targets.length === 0) {
        return;
    }
    await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(targets);
}

function mapRecordRow(row) {
    return {
        title: row.title || 'タイトルなし',
        title_reading: row.title_reading || '',
        record_type: row.record_type || 'record',
        date: formatLegacyDate(row.recorded_at),
        quote: row.quote || '',
        quote_speaker: row.quote_speaker || '',
        tag: row.tag || '',
        image: row.cover_image_url || '',
        thoughts: row.thoughts || '',
        summary: row.summary || '',
        favorite: Boolean(row.favorite),
        currently_reading: Boolean(row.currently_reading),
        gallery: (row.manga_record_gallery_images || [])
            .slice()
            .sort((left, right) => left.position - right.position)
            .map((item) => item.public_url)
    };
}

function recordSelectColumns(includeQuoteSpeaker = true, includeCurrentlyReading = true) {
    return [
        'id',
        'user_id',
        'record_type',
        'title',
        'title_reading',
        'recorded_at',
        'quote',
        includeQuoteSpeaker ? 'quote_speaker' : '',
        'thoughts',
        'tag',
        'summary',
        'favorite',
        includeCurrentlyReading ? 'currently_reading' : '',
        'cover_image_path',
        'cover_image_url',
        `manga_record_gallery_images (
            id,
            record_id,
            position,
            storage_path,
            public_url,
            created_at
        )`
    ].filter(Boolean).join(',\n');
}

function isMissingQuoteSpeakerColumn(error) {
    const text = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint
    ].filter(Boolean).join(' ');

    return /quote_speaker/i.test(text);
}

function isMissingCurrentlyReadingColumn(error) {
    const text = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint
    ].filter(Boolean).join(' ');

    return /currently_reading/i.test(text);
}

function stripQuoteMarks(value) {
    const text = String(value || '').trim();
    if ((text.startsWith('「') && text.endsWith('」')) || (text.startsWith('"') && text.endsWith('"'))) {
        return text.slice(1, -1).trim();
    }
    return text;
}

function parseQuoteSpeakerList(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }
    if (raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item || '').trim());
            }
        } catch (_error) {
            // Fall through to legacy line-based parsing.
        }
    }
    return raw.split(/\r?\n/).map((item) => item.trim());
}

function parseQuoteLineWithSpeaker(value) {
    const text = String(value || '').trim();
    const quoted = text.match(/^「(.+?)」\s*[-ー—–]\s*(.+)$/);
    if (quoted) {
        return {
            text: quoted[1].trim(),
            speaker: quoted[2].trim()
        };
    }
    return {
        text: stripQuoteMarks(text),
        speaker: ''
    };
}

function normalizeQuoteEntries(entries) {
    return (entries || [])
        .map((entry) => ({
            text: stripQuoteMarks(entry?.text || entry?.quote || ''),
            speaker: String(entry?.speaker || entry?.quote_speaker || '').trim()
        }))
        .filter((entry) => entry.text);
}

function quoteEntriesFromValues(quote, quoteSpeaker) {
    const quoteLines = String(quote || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const rawSpeaker = String(quoteSpeaker || '').trim();
    const speakers = parseQuoteSpeakerList(rawSpeaker);
    const hasStructuredSpeakers = rawSpeaker.startsWith('[');

    return normalizeQuoteEntries(quoteLines.map((line, index) => {
        const fallback = rawSpeaker ? { text: stripQuoteMarks(line), speaker: '' } : parseQuoteLineWithSpeaker(line);
        return {
            text: fallback.text,
            speaker: speakers.length === 1 && quoteLines.length > 1 && !hasStructuredSpeakers
                ? speakers[0]
                : speakers[index] || fallback.speaker || ''
        };
    }));
}

function quoteEntriesFromPayload(body) {
    if (Array.isArray(body?.quote_entries)) {
        return normalizeQuoteEntries(body.quote_entries);
    }
    return quoteEntriesFromValues(body?.quote, body?.quote_speaker);
}

function serializeQuoteEntriesForStorage(entries, fallbackQuote = '', fallbackSpeaker = '') {
    const cleanEntries = normalizeQuoteEntries(entries);
    if (cleanEntries.length === 0) {
        return {
            quote: String(fallbackQuote || '').trim(),
            quote_speaker: String(fallbackSpeaker || '').trim()
        };
    }

    return {
        quote: cleanEntries.map((entry) => entry.text).join('\n'),
        quote_speaker: JSON.stringify(cleanEntries.map((entry) => entry.speaker || ''))
    };
}

function quoteEntriesToLegacyQuote(entries) {
    return normalizeQuoteEntries(entries)
        .map((entry) => entry.speaker ? `「${entry.text}」-${entry.speaker}` : entry.text)
        .join('\n');
}

async function selectRecordsWithOptionalColumns(queryFactory) {
    let includeQuoteSpeaker = true;
    let includeCurrentlyReading = true;

    while (true) {
        const result = await queryFactory(includeQuoteSpeaker, includeCurrentlyReading);
        if (!result.error) {
            return result;
        }

        if (includeQuoteSpeaker && isMissingQuoteSpeakerColumn(result.error)) {
            includeQuoteSpeaker = false;
            continue;
        }

        if (includeCurrentlyReading && isMissingCurrentlyReadingColumn(result.error)) {
            includeCurrentlyReading = false;
            continue;
        }

        return result;
    }
}

async function fetchRecords(supabase) {
    const ownerUserId = requireOwnerUserId();
    const { data, error } = await selectRecordsWithOptionalColumns(
        (includeQuoteSpeaker, includeCurrentlyReading) => supabase
            .from('manga_records')
            .select(recordSelectColumns(includeQuoteSpeaker, includeCurrentlyReading))
            .eq('user_id', ownerUserId)
            .order('recorded_at', { ascending: false })
    );

    if (error) {
        throw error;
    }

    return data || [];
}

async function findRecordByLegacyIdentity(supabase, title, legacyDate) {
    const ownerUserId = requireOwnerUserId();
    const recordedAt = parseLegacyDate(legacyDate);
    const { data, error } = await selectRecordsWithOptionalColumns(
        (includeQuoteSpeaker, includeCurrentlyReading) => supabase
            .from('manga_records')
            .select(recordSelectColumns(includeQuoteSpeaker, includeCurrentlyReading))
            .eq('user_id', ownerUserId)
            .eq('title', title)
            .eq('recorded_at', recordedAt)
            .maybeSingle()
    );

    if (error) {
        throw error;
    }

    return data;
}

async function generateTitleReading(title) {
    if (!OPENAI_API_KEY || !title) {
        return '';
    }

    if (/^[ぁ-ゖァ-ヶーa-zA-Z0-9 !！?？・\-\s]+$/.test(title)) {
        return normalizeTitleReading(title);
    }

    const payload = {
        model: OPENAI_MODEL,
        instructions: 'あなたは日本語の書誌データ編集者です。漫画タイトルの読みを、ひらがなのみで返してください。余計な説明や記号は付けず、読みだけを出力してください。',
        input: `次の漫画タイトルの読みをひらがなで返してください。\nタイトル: ${title}`,
        temperature: 0,
        max_output_tokens: 64
    };

    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to generate title reading.');
    }

    const data = await response.json();
    const text = extractOpenAiOutputText(data);
    return normalizeTitleReading(text);
}

function normalizeTitleReading(text) {
    return katakanaToHiragana(String(text || '').trim().toLowerCase())
        .replace(/[^ぁ-ゖー0-9a-z]+/g, '');
}

function katakanaToHiragana(text) {
    return Array.from(text).map((char) => {
        const code = char.charCodeAt(0);
        if (code >= 0x30A1 && code <= 0x30F6) {
            return String.fromCharCode(code - 0x60);
        }
        return char;
    }).join('');
}

function extractOpenAiOutputText(data) {
    const parts = [];
    for (const item of data.output || []) {
        if (item.type !== 'message') {
            continue;
        }
        for (const content of item.content || []) {
            if (content.type === 'output_text' && content.text) {
                parts.push(content.text);
            }
        }
    }
    if (parts.length > 0) {
        return parts.join('\n').trim();
    }
    return String(data.output_text || '').trim();
}

function normalizeBulletSummary(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const numbered = line.match(/^\d+[.)]\s*(.+)$/);
            if (numbered) {
                return numbered[1];
            }
            const bullet = line.match(/^[-・*]\s*(.+)$/);
            if (bullet) {
                return bullet[1];
            }
            return line;
        })
        .filter(Boolean)
        .slice(0, 8);

    return lines.map((line) => `- ${line}`).join('\n');
}

async function generateBulletSummary(title, quote, quoteSpeaker, thoughts, tag) {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured on Vercel.');
    }

    const payload = {
        model: OPENAI_MODEL,
        instructions: 'あなたは読書感想文の編集者です。読んだ漫画の印象を、短く自然な日本語の箇条書きで整理してください。出力は箇条書きの行だけにしてください。',
        input:
            '次の情報から、5〜8個の箇条書きに要約してください。\n' +
            '各行は必ず「- 」から始め、1行につき1要点にしてください。\n' +
            '前置き・説明・見出し・番号付けは不要です。\n\n' +
            `漫画タイトル: ${title || '(不明)'}\n` +
            `名言/お気に入りセリフ: ${quote || '(なし)'}\n` +
            `名言を言った人: ${quoteSpeaker || '(なし)'}\n` +
            `感情タグ: ${tag || '(なし)'}\n\n` +
            `感想/考察:\n${String(thoughts || '').slice(0, 6000)}\n`,
        temperature: 0.3,
        max_output_tokens: 256
    };

    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to generate summary.');
    }

    const data = await response.json();
    return normalizeBulletSummary(extractOpenAiOutputText(data));
}

function requireMethod(req, res, method) {
    if (req.method !== method) {
        json(res, 405, { error: 'Method not allowed' });
        return false;
    }
    return true;
}

module.exports = {
    OPENAI_API_KEY,
    OPENAI_API_BASE,
    OPENAI_MODEL,
    SUPABASE_STORAGE_BUCKET,
    currentTimestampIso,
    fetchRecords,
    findRecordByLegacyIdentity,
    formatLegacyDate,
    generateBulletSummary,
    generateTitleReading,
    getSupabase,
    isMissingQuoteSpeakerColumn,
    json,
    mapRecordRow,
    parseLegacyDate,
    quoteEntriesFromPayload,
    quoteEntriesFromValues,
    quoteEntriesToLegacyQuote,
    readJsonBody,
    removeStoragePaths,
    requireMethod,
    requireOwnerUserId,
    requirePassphrase,
    serializeQuoteEntriesForStorage,
    storagePublicUrl,
    uploadImageFromDataUrl
};
