import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createSupabaseServiceRoleClient, getStorageBucketName } from '../src/database/supabase';

dotenv.config();

type LegacyRecord = {
    title: string;
    titleReading: string;
    recordedAt: string;
    quote: string;
    tag: string;
    thoughts: string;
    summary: string;
    favorite: boolean;
    imagePath: string;
    galleryPaths: string[];
};

type LegacyCalendarEntry = {
    id: string;
    date: string;
    title: string;
    volumeStart: string;
    volumeEnd: string;
};

type UploadedImage = {
    storagePath: string;
    publicUrl: string;
};

const ownerUserId = process.env.OWNER_USER_ID?.trim() || '';

if (!ownerUserId) {
    throw new Error('OWNER_USER_ID is required for migration.');
}

const supabase = createSupabaseServiceRoleClient();
const storageBucket = getStorageBucketName();
const uploadCache = new Map<string, UploadedImage>();

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getField(block: string, label: string): string {
    const match = block.match(new RegExp(`^- \\*\\*${escapeRegex(label)}:\\*\\*\\s*(.*)$`, 'm'));
    return match?.[1]?.trim() || '';
}

function normalizeOptionalText(value: string): string {
    if (!value || value === 'なし') {
        return '';
    }
    return value.replace(/<br\s*\/?>/gi, '\n').trim();
}

function extractThoughts(block: string): string {
    const lines = block.trim().split('\n');
    const thoughts: string[] = [];
    let inThoughts = false;

    for (const line of lines) {
        if (inThoughts) {
            thoughts.push(line);
            continue;
        }

        if (!line.startsWith('## ') && !line.startsWith('- **') && line.trim()) {
            inThoughts = true;
            thoughts.push(line);
        }
    }

    return thoughts.join('\n').trim();
}

function parseRecordedAt(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return new Date().toISOString();
    }

    const normalized = trimmed.replace(/\//g, '-').replace(' ', 'T');
    return new Date(`${normalized}+09:00`).toISOString();
}

function parseLegacyRecords(markdown: string): LegacyRecord[] {
    return markdown
        .split(/\n---\n/g)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
            const titleMatch = block.match(/^##\s+(.*)$/m);
            const imageMatch = block.match(/^- \*\*画像:\*\*\s*!\[.*?\]\((.*?)\)/m);
            const galleryRaw = getField(block, 'ギャラリー');

            return {
                title: titleMatch?.[1]?.trim() || 'タイトルなし',
                titleReading: normalizeOptionalText(getField(block, 'よみがな')),
                recordedAt: parseRecordedAt(getField(block, '日時')),
                quote: normalizeOptionalText(getField(block, '名言')),
                tag: normalizeOptionalText(getField(block, '感情')),
                thoughts: extractThoughts(block),
                summary: normalizeOptionalText(getField(block, '箇条書きまとめ')),
                favorite: getField(block, 'お気に入り').toLowerCase() === 'true',
                imagePath: imageMatch?.[1]?.trim() || '',
                galleryPaths: galleryRaw
                    ? galleryRaw.split(',').map((item) => item.trim()).filter(Boolean)
                    : []
            };
        });
}

function detectContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
}

async function uploadImage(baseDir: string, relativePath: string, recordTitle: string, folder: string): Promise<UploadedImage | null> {
    if (!relativePath) {
        return null;
    }

    const absolutePath = path.resolve(baseDir, relativePath);
    if (uploadCache.has(absolutePath)) {
        return uploadCache.get(absolutePath)!;
    }

    try {
        const file = await fs.readFile(absolutePath);
        const ext = path.extname(absolutePath).toLowerCase() || '.bin';
        const storagePath = `${ownerUserId}/${folder}/${Date.now()}-${Math.random().toString(16).slice(2, 10)}${ext}`;

        const { error } = await supabase.storage
            .from(storageBucket)
            .upload(storagePath, file, {
                contentType: detectContentType(absolutePath),
                upsert: false
            });

        if (error) {
            throw error;
        }

        const { data } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
        const uploaded = {
            storagePath,
            publicUrl: data.publicUrl
        };

        uploadCache.set(absolutePath, uploaded);
        return uploaded;
    } catch (error) {
        console.warn(`Skipping image upload for ${relativePath}:`, error);
        return null;
    }
}

async function migrateRecords(legacyDir: string, records: LegacyRecord[]) {
    let migrated = 0;

    for (const legacyRecord of records) {
        const coverImage = await uploadImage(legacyDir, legacyRecord.imagePath, legacyRecord.title, 'covers');

        const recordPayload = {
            user_id: ownerUserId,
            title: legacyRecord.title,
            title_reading: legacyRecord.titleReading,
            recorded_at: legacyRecord.recordedAt,
            quote: legacyRecord.quote,
            thoughts: legacyRecord.thoughts,
            tag: legacyRecord.tag,
            summary: legacyRecord.summary,
            favorite: legacyRecord.favorite,
            cover_image_path: coverImage?.storagePath || '',
            cover_image_url: coverImage?.publicUrl || ''
        };

        const { data: savedRecord, error: recordError } = await supabase
            .from('manga_records')
            .upsert(recordPayload, { onConflict: 'user_id,title,recorded_at' })
            .select('id')
            .single();

        if (recordError || !savedRecord) {
            throw recordError || new Error(`Failed to migrate record: ${legacyRecord.title}`);
        }

        const galleryUploads = (
            await Promise.all(
                legacyRecord.galleryPaths.map((galleryPath) =>
                    uploadImage(legacyDir, galleryPath, legacyRecord.title, 'gallery')
                )
            )
        ).filter((item): item is UploadedImage => Boolean(item));

        const { error: deleteGalleryError } = await supabase
            .from('manga_record_gallery_images')
            .delete()
            .eq('record_id', savedRecord.id);

        if (deleteGalleryError) {
            throw deleteGalleryError;
        }

        if (galleryUploads.length > 0) {
            const { error: galleryError } = await supabase
                .from('manga_record_gallery_images')
                .insert(
                    galleryUploads.map((image, index) => ({
                        record_id: savedRecord.id,
                        position: index,
                        storage_path: image.storagePath,
                        public_url: image.publicUrl
                    }))
                );

            if (galleryError) {
                throw galleryError;
            }
        }

        migrated += 1;
    }

    return migrated;
}

async function migrateCalendarEntries(entries: LegacyCalendarEntry[]) {
    if (entries.length === 0) {
        return 0;
    }

    const { error } = await supabase.from('reading_logs').upsert(
        entries.map((entry) => ({
            id: String(entry.id),
            user_id: ownerUserId,
            reading_date: entry.date,
            title: entry.title,
            volume_start: entry.volumeStart || '',
            volume_end: entry.volumeEnd || ''
        })),
        { onConflict: 'id' }
    );

    if (error) {
        throw error;
    }

    return entries.length;
}

async function main() {
    const legacyDir = path.resolve(process.argv[2] || path.resolve(__dirname, '../../v3'));
    const opinionPath = path.join(legacyDir, 'opinion.md');
    const calendarPath = path.join(legacyDir, 'calendar_entries.json');

    const [markdown, calendarJson] = await Promise.all([
        fs.readFile(opinionPath, 'utf-8'),
        fs.readFile(calendarPath, 'utf-8')
    ]);

    const legacyRecords = parseLegacyRecords(markdown);
    const calendarEntries = JSON.parse(calendarJson) as LegacyCalendarEntry[];

    console.log(`Found ${legacyRecords.length} legacy records and ${calendarEntries.length} calendar entries.`);

    const migratedRecords = await migrateRecords(legacyDir, legacyRecords);
    const migratedCalendarEntries = await migrateCalendarEntries(calendarEntries);

    console.log(`Migrated ${migratedRecords} records.`);
    console.log(`Migrated ${migratedCalendarEntries} calendar entries.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
