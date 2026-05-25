const { fetchRecords, getSupabase, json, mapRecordRow, requireMethod, requirePassphrase } = require('./_lib');

module.exports = async function handler(req, res) {
    if (!requireMethod(req, res, 'GET')) {
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        const supabase = getSupabase();
        const rows = await fetchRecords(supabase);
        json(res, 200, rows.map(mapRecordRow));
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to load records.' });
    }
};
