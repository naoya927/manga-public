const { findRecordByLegacyIdentity, getSupabase, json, readJsonBody, requireMethod, requirePassphrase } = require('./_lib');

module.exports = async function handler(req, res) {
    if (!requireMethod(req, res, 'POST')) {
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        const body = await readJsonBody(req);
        const supabase = getSupabase();
        const record = await findRecordByLegacyIdentity(
            supabase,
            String(body.title || ''),
            String(body.date || '')
        );

        if (!record) {
            json(res, 404, { error: 'レコードが見つかりません' });
            return;
        }

        const nextFavorite = !record.favorite;
        const { error } = await supabase
            .from('manga_records')
            .update({ favorite: nextFavorite })
            .eq('id', record.id);

        if (error) {
            throw error;
        }

        json(res, 200, { status: 'success', favorite: nextFavorite });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to toggle favorite.' });
    }
};
