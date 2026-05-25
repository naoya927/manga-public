const {
    currentTimestampIso,
    generateTitleReading,
    getSupabase,
    isMissingQuoteSpeakerColumn,
    json,
    quoteEntriesFromPayload,
    quoteEntriesToLegacyQuote,
    readJsonBody,
    requireMethod,
    requireOwnerUserId,
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
        const ownerUserId = requireOwnerUserId();
        const requestedRecordType = String(body.record_type || 'record').trim();
        const recordType = requestedRecordType === 'next' ? 'next' : 'record';
        const title = String(body.title || 'タイトルなし').trim();
        const thoughts = String(body.thoughts || '').trim();

        if (!title || (recordType === 'record' && !thoughts)) {
            json(res, 400, { error: recordType === 'record' ? 'title and thoughts are required.' : 'title is required.' });
            return;
        }

        const uploadedImage = await uploadImageFromDataUrl(supabase, body.image || '', 'covers');
        const titleReading = await generateTitleReading(title).catch(() => '');
        const quoteEntries = quoteEntriesFromPayload(body);
        const quoteStorage = serializeQuoteEntriesForStorage(quoteEntries, body.quote, body.quote_speaker);

        const payload = {
            user_id: ownerUserId,
            record_type: recordType,
            title,
            title_reading: titleReading || '',
            recorded_at: currentTimestampIso(),
            quote: quoteStorage.quote,
            quote_speaker: quoteStorage.quote_speaker,
            thoughts,
            tag: String(body.tag || '').trim(),
            summary: String(body.summary || '').trim(),
            favorite: false,
            cover_image_path: uploadedImage?.storagePath || '',
            cover_image_url: uploadedImage?.publicUrl || ''
        };

        let { error } = await supabase.from('manga_records').insert(payload);
        if (error && isMissingQuoteSpeakerColumn(error)) {
            const legacyPayload = { ...payload };
            legacyPayload.quote = quoteEntriesToLegacyQuote(quoteEntries) || legacyPayload.quote;
            delete legacyPayload.quote_speaker;
            ({ error } = await supabase.from('manga_records').insert(legacyPayload));
        }

        if (error) {
            throw error;
        }

        json(res, 200, { status: 'success' });
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to save record.' });
    }
};
