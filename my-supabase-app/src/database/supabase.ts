import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
    }
    return value;
}

export function createSupabaseAnonClient(): SupabaseClient<any, 'public', any> {
    return createClient<any>(
        getRequiredEnv('SUPABASE_URL'),
        process.env.SUPABASE_ANON_KEY?.trim() || getRequiredEnv('SUPABASE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}

export function createSupabaseServiceRoleClient(): SupabaseClient<any, 'public', any> {
    return createClient<any>(
        getRequiredEnv('SUPABASE_URL'),
        getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}

export function getStorageBucketName(): string {
    return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'manga-images';
}
