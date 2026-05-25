const {
    findRecordByLegacyIdentity,
    getSupabase,
    json,
    readJsonBody,
    removeStoragePaths,
    requirePassphrase,
    uploadImageFromDataUrl
} = require('./_lib');

async function handleAdd(body, supabase, res) {
    const record = await findRecordByLegacyIdentity(
        supabase,
        String(body.title || ''),
        String(body.date || '')
    );

    if (!record) {
        json(res, 404, { error: 'レコードが見つかりません' });
        return;
    }

    const existing = (record.manga_record_gallery_images || []).slice().sort((left, right) => left.position - right.position);
    if (existing.length >= 3) {
        json(res, 400, { error: 'ギャラリーは最大3枚です' });
        return;
    }

    const uploaded = await uploadImageFromDataUrl(supabase, body.image || '', 'gallery');
    if (!uploaded) {
        json(res, 400, { error: '画像が不正です' });
        return;
    }

    const { error } = await supabase
        .from('manga_record_gallery_images')
        .insert({
            record_id: record.id,
            position: existing.length,
            storage_path: uploaded.storagePath,
            public_url: uploaded.publicUrl
        });

    if (error) {
        throw error;
    }

    const gallery = existing.map((item) => item.public_url).concat(uploaded.publicUrl);
    json(res, 200, { status: 'success', gallery });
}

async function handlePlace(body, supabase, res) {
    const slotIndex = Number(body.slot);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
        json(res, 400, { error: 'サブ画像の位置が不正です' });
        return;
    }

    const record = await findRecordByLegacyIdentity(
        supabase,
        String(body.title || ''),
        String(body.date || '')
    );

    if (!record) {
        json(res, 404, { error: 'レコードが見つかりません' });
        return;
    }

    const existing = (record.manga_record_gallery_images || [])
        .slice()
        .sort((left, right) => left.position - right.position);

    if (slotIndex > existing.length) {
        json(res, 400, { error: '左の空き枠から順番に追加してください' });
        return;
    }

    const uploaded = await uploadImageFromDataUrl(supabase, body.image || '', 'gallery');
    if (!uploaded) {
        json(res, 400, { error: '画像が不正です' });
        return;
    }

    const replacing = existing[slotIndex] || null;
    if (replacing) {
        const { error: updateError } = await supabase
            .from('manga_record_gallery_images')
            .update({
                storage_path: uploaded.storagePath,
                public_url: uploaded.publicUrl
            })
            .eq('id', replacing.id);

        if (updateError) {
            await removeStoragePaths(supabase, [uploaded.storagePath]);
            throw updateError;
        }

        await removeStoragePaths(supabase, [replacing.storage_path]);
    } else {
        const { error: insertError } = await supabase
            .from('manga_record_gallery_images')
            .insert({
                record_id: record.id,
                position: slotIndex,
                storage_path: uploaded.storagePath,
                public_url: uploaded.publicUrl
            });

        if (insertError) {
            await removeStoragePaths(supabase, [uploaded.storagePath]);
            throw insertError;
        }
    }

    const nextGallery = existing.map((item) => item.public_url);
    nextGallery[slotIndex] = uploaded.publicUrl;
    json(res, 200, {
        status: 'success',
        gallery: nextGallery.filter(Boolean)
    });
}

async function handleRemove(body, supabase, res) {
    const record = await findRecordByLegacyIdentity(
        supabase,
        String(body.title || ''),
        String(body.date || '')
    );

    if (!record) {
        json(res, 404, { error: '画像が見つかりません' });
        return;
    }

    const targetUrl = String(body.image_path || '');
    const galleryRows = (record.manga_record_gallery_images || []).slice().sort((left, right) => left.position - right.position);
    const target = galleryRows.find((item) => item.public_url === targetUrl);

    if (!target) {
        json(res, 404, { error: '画像が見つかりません' });
        return;
    }

    const remaining = galleryRows.filter((item) => item.id !== target.id);

    const { error: deleteError } = await supabase
        .from('manga_record_gallery_images')
        .delete()
        .eq('id', target.id);

    if (deleteError) {
        throw deleteError;
    }

    for (const [index, item] of remaining.entries()) {
        if (item.position === index) {
            continue;
        }
        const { error: updateError } = await supabase
            .from('manga_record_gallery_images')
            .update({ position: index })
            .eq('id', item.id);
        if (updateError) {
            throw updateError;
        }
    }

    await removeStoragePaths(supabase, [target.storage_path]);
    json(res, 200, { status: 'success', gallery: remaining.map((item) => item.public_url) });
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return;
    }

    if (!requirePassphrase(req, res)) {
        return;
    }

    try {
        const body = await readJsonBody(req);
        const supabase = getSupabase();
        const action = String(body.action || '').trim();

        switch (action) {
            case 'add':
                await handleAdd(body, supabase, res);
                break;
            case 'place':
                await handlePlace(body, supabase, res);
                break;
            case 'remove':
                await handleRemove(body, supabase, res);
                break;
            default:
                json(res, 400, { error: `Unknown action: ${action}` });
        }
    } catch (error) {
        json(res, 500, { error: error.message || 'Failed to process gallery action.' });
    }
};
