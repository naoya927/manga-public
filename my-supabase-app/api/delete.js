const { findRecordByLegacyIdentity, getSupabase, json, readJsonBody, removeStoragePaths, requireMethod, requirePassphrase } = require('./_lib');

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

        const storagePaths = [
            record.cover_image_path,
            ...(record.manga_record_gallery_images || []).map((item) => item.storage_path)
        ];

        const { error } = await supabase
            .from('manga_records')
            .delete()
            .eq('id', record.id);

        if (error) {
            throw error;
        }

        await removeStoragePaths(supabase, storagePaths);
        json(res, 200, { status: 'success' });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to delete record.' });
    }
};
