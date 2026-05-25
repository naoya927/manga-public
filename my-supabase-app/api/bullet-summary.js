const { generateBulletSummary, json, quoteEntriesFromPayload, quoteEntriesToLegacyQuote, readJsonBody, requireMethod, requirePassphrase } = require('./_lib');

module.exports = async function handler(req, res) {
    if (!requireMethod(req, res, 'POST')) {
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        const body = await readJsonBody(req);
        const quoteEntries = quoteEntriesFromPayload(body);
        const summary = await generateBulletSummary(
            String(body.title || ''),
            quoteEntriesToLegacyQuote(quoteEntries) || String(body.quote || ''),
            '',
            String(body.thoughts || ''),
            String(body.tag || '')
        );
        json(res, 200, { status: 'success', summary });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to generate summary.' });
    }
};
