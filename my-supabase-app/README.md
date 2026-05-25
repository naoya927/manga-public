# Manga Review Tracker

ローカルで使っていた `v3/index.html` の UI を土台にしながら、保存先だけを `Supabase` に、公開先を `Vercel` に移した構成です。

## 構成

- UI: `v3/index.html` ベースの画面を `Vercel` で静的配信
- API: `Vercel Functions`
- データ: `Supabase Postgres`
- 画像: `Supabase Storage`
- 既存データ移行: `scripts/migrate-local-data.ts`
- ログイン: なし

## 1. Supabase 側の準備

1. Supabase プロジェクトを作成する
2. SQL Editor で `supabase/schema.sql` を実行する
3. `Authentication` で自分用ユーザーを1つ作成する
4. そのユーザーの `auth.users.id` を控える

## 2. 環境変数

`.env.example` を `.env` にコピーして埋めてください。

```bash
cp .env.example .env
```

最低限必要なのは次の値です。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `OWNER_USER_ID`
- `APP_PASSPHRASE`

AI の箇条書きまとめや読み仮名生成も使いたい場合は、追加で以下を入れます。

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## 3. 既存ローカルデータを Supabase に移行

デフォルトではリポジトリ直下の `../v3` を見に行きます。

```bash
npm run migrate:legacy
```

このスクリプトは次を行います。

- `v3/opinion.md` を `manga_records` に投入
- `v3/calendar_entries.json` を `reading_logs` に投入
- `v3/images/*` を `Supabase Storage` にアップロード
- ギャラリー画像を `manga_record_gallery_images` に登録

## 4. Vercel デプロイ

Vercel には次の環境変数を設定してください。

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=manga-images
OWNER_USER_ID=your-auth-user-id
APP_PASSPHRASE=your-private-passphrase
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_*` は任意です。

### Vercel での設定

1. Vercel にログインする
2. `Add New...` → `Project`
3. GitHub リポジトリを接続する
4. `Root Directory` を `my-supabase-app` にする
5. `Build Command` は `npm run build`
6. `Output Directory` は `web`
7. 上の環境変数を追加して `Deploy`

## 5. デプロイ後に確認すること

- 公開URLでローカル版と同じ UI が見える
- 過去の記録タブに既存感想が出る
- カレンダーに既存の読書ログが出る
- 新しい感想を保存できる
- 画像を追加すると `Supabase Storage` に入る
- カレンダーの追加・編集・削除が反映される

## ホーム画面アイコンの変更

スマホで「ホーム画面に追加」したときのアイコンは、`web/manifest.webmanifest` と次の画像で指定しています。

- `web/app-icon-180.png`: iPhone / iPad 向け
- `web/app-icon-192.png`: Android / PWA 向け
- `web/app-icon-512.png`: Android / PWA 向けの高解像度版

別の画像にしたい場合は、同じファイル名・同じ正方形サイズで置き換えてから再デプロイしてください。すでにホーム画面に追加済みの端末では、反映のために一度削除して追加し直すのが確実です。

## 注意

- ログインなし構成なので、URL を知っている人はアクセスできます
- `APP_PASSPHRASE` で簡易的な合言葉保護はできますが、本格的な認証ではありません
- 本当に自分だけで使う前提なら運用できますが、セキュリティは強くありません
- 画像は公開 URL を使うため、バケットは `public` のままです
- `SUPABASE_SERVICE_ROLE_KEY` は Vercel の server-side 環境変数にだけ置き、フロントに出さないでください
