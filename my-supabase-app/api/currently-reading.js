const { findRecordByLegacyIdentity, getSupabase, json, readJsonBody, requireMethod, requirePassphrase } = require('./_lib');

function isMissingCurrentlyReadingColumn(error) {
    const text = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint
    ].filter(Boolean).join(' ');
    return /currently_reading/i.test(text);
}

function parseRequestedCurrentlyReading(value, fallback) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
    }

    return fallback;
}

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

        const currentValue = Boolean(record.currently_reading);
        const nextValue = parseRequestedCurrentlyReading(body.currently_reading, !currentValue);

        const { error } = await supabase
            .from('manga_records')
            .update({ currently_reading: nextValue })
            .eq('id', record.id);

        if (error) {
            // カラム未作成の場合は分かりやすいエラーメッセージを返す
            if (isMissingCurrentlyReadingColumn(error)) {
                json(res, 503, {
                    error: 'currently_reading カラムがまだ作成されていません。Supabase の SQL Editor で「ALTER TABLE public.manga_records ADD COLUMN IF NOT EXISTS currently_reading boolean NOT NULL DEFAULT false;」を実行してください。'
                });
                return;
            }
            throw error;
        }

        json(res, 200, { status: 'success', currently_reading: nextValue });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to toggle currently reading.' });
    }
};
