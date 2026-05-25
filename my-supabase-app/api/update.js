const {
    findRecordByLegacyIdentity,
    generateTitleReading,
    getSupabase,
    isMissingQuoteSpeakerColumn,
    json,
    quoteEntriesFromPayload,
    quoteEntriesFromValues,
    quoteEntriesToLegacyQuote,
    readJsonBody,
    removeStoragePaths,
    requireMethod,
    requirePassphrase,
    serializeQuoteEntriesForStorage,
    uploadImageFromDataUrl
} = require('./_lib');

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
            String(body.orig_title || ''),
            String(body.orig_date || '')
        );

        if (!record) {
            json(res, 404, { error: 'レコードが見つかりません' });
            return;
        }

        const quoteInput = Object.prototype.hasOwnProperty.call(body, 'quote') ? body.quote : record.quote;
        const quoteSpeakerInput = Object.prototype.hasOwnProperty.call(body, 'quote_speaker')
            ? body.quote_speaker
            : record.quote_speaker;
        const quoteEntries = Array.isArray(body.quote_entries)
            ? quoteEntriesFromPayload(body)
            : quoteEntriesFromValues(quoteInput, quoteSpeakerInput);
        const quoteStorage = serializeQuoteEntriesForStorage(quoteEntries, quoteInput, quoteSpeakerInput);

        const payload = {
            record_type: String(body.record_type || record.record_type || 'record').trim() === 'next' ? 'next' : 'record',
            title: String(body.title || record.title).trim(),
            quote: quoteStorage.quote,
            quote_speaker: quoteStorage.quote_speaker,
            thoughts: String(body.thoughts || '').trim(),
            summary: String(body.summary || '').trim(),
            tag: String(body.tag || '').trim()
        };

        if (payload.title !== record.title) {
            payload.title_reading = await generateTitleReading(payload.title).catch(() => record.title_reading || '');
        }

        const oldPathsToRemove = [];
        if (body.remove_image) {
            payload.cover_image_path = '';
            payload.cover_image_url = '';
            if (record.cover_image_path) {
                oldPathsToRemove.push(record.cover_image_path);
            }
        } else if (body.image) {
            const uploaded = await uploadImageFromDataUrl(supabase, body.image, 'covers');
            payload.cover_image_path = uploaded?.storagePath || '';
            payload.cover_image_url = uploaded?.publicUrl || '';
            if (record.cover_image_path) {
                oldPathsToRemove.push(record.cover_image_path);
            }
        } else if (body.keep_image) {
            payload.cover_image_url = String(body.keep_image || '');
        }

        let { error } = await supabase
            .from('manga_records')
            .update(payload)
            .eq('id', record.id);

        if (error && isMissingQuoteSpeakerColumn(error)) {
            const legacyPayload = { ...payload };
            legacyPayload.quote = quoteEntriesToLegacyQuote(quoteEntries) || legacyPayload.quote;
            delete legacyPayload.quote_speaker;
            ({ error } = await supabase
                .from('manga_records')
                .update(legacyPayload)
                .eq('id', record.id));
        }

        if (error) {
            throw error;
        }

        await removeStoragePaths(supabase, oldPathsToRemove);
        json(res, 200, { status: 'success' });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to update record.' });
    }
};
