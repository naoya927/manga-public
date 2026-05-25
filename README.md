# Manga Review Tracker

漫画の感想、名言、画像、読書履歴を記録するための個人用Webアプリです。
このリポジトリには、ローカル保存版の `v3` と、Supabase/Vercel で動かす公開運用版の `my-supabase-app` があります。

## v3

`v3` はローカル環境で動く旧バージョンです。
`index.html` が画面、`server.py` がローカルAPIを担当し、感想は `opinion.md`、読書履歴は `calendar_entries.json`、画像は `images/` に保存します。

個人の感想や画像をGitHubに載せないため、これらの保存データはGit管理から外しています。
詳しくは `v3/read.md` を参照してください。

## my-supabase-app

`my-supabase-app` は、`v3` のUIと機能をもとに、保存先を Supabase、公開先を Vercel に移したバージョンです。

- フロントエンド: `web/`
- API: `api/`
- データベース定義: `supabase/schema.sql`
- 既存データ移行: `scripts/migrate-local-data.ts`

詳しいセットアップやデプロイ手順は `my-supabase-app/README.md` を参照してください。
