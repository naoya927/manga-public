const { requireMethod, requirePassphrase } = require('./_lib');

module.exports = async function handler(req, res) {
    if (!requireMethod(req, res, 'GET')) {
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        const url = String(req.query.url || '').trim();
        if (!url) {
            res.statusCode = 400;
            res.end('');
            return;
        }

        let targetUrl;
        try {
            targetUrl = new URL(url);
        } catch (_error) {
            res.statusCode = 400;
            res.end('');
            return;
        }

        if (!/^https?:$/.test(targetUrl.protocol)) {
            res.statusCode = 400;
            res.end('');
            return;
        }

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) {
            res.statusCode = 502;
            res.end('');
            return;
        }

        const arrayBuffer = await response.arrayBuffer();
        res.statusCode = 200;
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=3600, must-revalidate');
        res.setHeader('Vary', 'Cookie, x-app-passphrase');
        res.end(Buffer.from(arrayBuffer));
    } catch (_error) {
        res.statusCode = 502;
        res.end('');
    }
};
