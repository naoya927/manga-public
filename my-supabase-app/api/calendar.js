const { getSupabase, json, readJsonBody, requireMethod, requireOwnerUserId, requirePassphrase } = require('./_lib');

function mapReadingLog(row) {
    return {
        id: row.id,
        date: row.reading_date,
        title: row.title,
        volumeStart: row.volume_start || '',
        volumeEnd: row.volume_end || ''
    };
}

async function fetchReadingLogs(supabase, ownerUserId) {
    const { data, error } = await supabase
        .from('reading_logs')
        .select('*')
        .eq('user_id', ownerUserId)
        .order('reading_date', { ascending: false });

    if (error) {
        throw error;
    }

    return (data || []).map(mapReadingLog);
}

module.exports = async function handler(req, res) {
    const supabase = getSupabase();
    const ownerUserId = requireOwnerUserId();

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        if (req.method === 'GET') {
            json(res, 200, await fetchReadingLogs(supabase, ownerUserId));
            return;
        }

        if (req.method === 'POST') {
            const body = await readJsonBody(req);
            const entries = Array.isArray(body.entries) ? body.entries : [];
            const normalized = entries
                .map((entry, index) => ({
                    id: String(entry?.id || `${Date.now()}-${index}`),
                    user_id: ownerUserId,
                    reading_date: String(entry?.date || '').trim(),
                    title: String(entry?.title || '').trim(),
                    volume_start: String(entry?.volumeStart || '').trim(),
                    volume_end: String(entry?.volumeEnd || '').trim()
                }))
                .filter((entry) => entry.reading_date && entry.title);

            const existing = await supabase
                .from('reading_logs')
                .select('id')
                .eq('user_id', ownerUserId);

            if (existing.error) {
                throw existing.error;
            }

            const keepIds = new Set(normalized.map((entry) => entry.id));
            const deleteIds = (existing.data || [])
                .map((row) => row.id)
                .filter((id) => !keepIds.has(id));

            if (deleteIds.length > 0) {
                const { error: deleteError } = await supabase
                    .from('reading_logs')
                    .delete()
                    .eq('user_id', ownerUserId)
                    .in('id', deleteIds);
                if (deleteError) {
                    throw deleteError;
                }
            }

            if (normalized.length > 0) {
                const { error: upsertError } = await supabase
                    .from('reading_logs')
                    .upsert(normalized, { onConflict: 'id' });

                if (upsertError) {
                    throw upsertError;
                }
            }

            json(res, 200, {
                status: 'success',
                entries: await fetchReadingLogs(supabase, ownerUserId)
            });
            return;
        }

        if (req.method === 'DELETE') {
            const body = await readJsonBody(req);
            const id = String(body.id || '').trim();

            if (!id) {
                json(res, 400, { error: 'id is required.' });
                return;
            }

            const { error } = await supabase
                .from('reading_logs')
                .delete()
                .eq('user_id', ownerUserId)
                .eq('id', id);

            if (error) {
                throw error;
            }

            json(res, 200, {
                status: 'success',
                entries: await fetchReadingLogs(supabase, ownerUserId)
            });
            return;
        }

        json(res, 405, { error: 'Method not allowed' });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to process calendar.' });
    }
};
