export interface MangaRecordRow {
    id: string;
    user_id: string;
    record_type: string;
    title: string;
    title_reading: string;
    recorded_at: string;
    quote: string;
    quote_speaker: string;
    thoughts: string;
    tag: string;
    summary: string;
    favorite: boolean;
    currently_reading: boolean;
    cover_image_path: string;
    cover_image_url: string;
    created_at: string;
    updated_at: string;
}

export interface MangaRecordGalleryImageRow {
    id: string;
    record_id: string;
    position: number;
    storage_path: string;
    public_url: string;
    created_at: string;
}

export interface ReadingLogRow {
    id: string;
    user_id: string;
    reading_date: string;
    title: string;
    volume_start: string;
    volume_end: string;
    created_at: string;
    updated_at: string;
}

export interface Database {
    public: {
        Tables: {
            manga_records: {
                Row: MangaRecordRow;
                Insert: Partial<MangaRecordRow> & Pick<MangaRecordRow, 'id' | 'user_id' | 'title' | 'recorded_at'>;
                Update: Partial<MangaRecordRow>;
            };
            manga_record_gallery_images: {
                Row: MangaRecordGalleryImageRow;
                Insert: Partial<MangaRecordGalleryImageRow> & Pick<MangaRecordGalleryImageRow, 'record_id' | 'position' | 'storage_path' | 'public_url'>;
                Update: Partial<MangaRecordGalleryImageRow>;
            };
            reading_logs: {
                Row: ReadingLogRow;
                Insert: Partial<ReadingLogRow> & Pick<ReadingLogRow, 'id' | 'user_id' | 'reading_date' | 'title'>;
                Update: Partial<ReadingLogRow>;
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
}
