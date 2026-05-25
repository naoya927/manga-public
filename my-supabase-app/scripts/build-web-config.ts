import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();

const appConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '',
    storageBucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || 'manga-images'
};

async function main() {
    const jsOutputPath = path.resolve(__dirname, '../web/config.js');
    const jsonOutputPath = path.resolve(__dirname, '../web/config.json');
    const jsFileContent = `window.APP_CONFIG = Object.freeze(${JSON.stringify(appConfig, null, 2)});\n`;
    const jsonFileContent = `${JSON.stringify(appConfig, null, 2)}\n`;

    await fs.mkdir(path.dirname(jsOutputPath), { recursive: true });
    await fs.writeFile(jsOutputPath, jsFileContent, 'utf-8');
    await fs.writeFile(jsonOutputPath, jsonFileContent, 'utf-8');

    const missing = Object.entries(appConfig)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        console.warn(`Generated web/config.js and web/config.json, but these values are empty: ${missing.join(', ')}`);
        return;
    }

    console.log(`Generated ${jsOutputPath}`);
    console.log(`Generated ${jsonOutputPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
