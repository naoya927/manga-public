# Manga Tracker v3 アプリ構造

`v3` は、漫画の感想・名言・画像・読書カレンダーをローカル環境で記録するためのアプリです。
ブラウザ画面は `index.html`、データ保存とAPI処理は `server.py` が担当します。

## 全体像

```text
v3/
├── index.html              # 画面、スタイル、フロントエンド処理
├── server.py               # ローカルHTTPサーバーとAPI
├── start.command           # macOS向け起動用スクリプト
├── opinion.md              # 感想記録データ（GitHubには載せない）
├── calendar_entries.json   # 読書カレンダー記録（GitHubには載せない）
├── images/                 # 表紙・ギャラリー画像（GitHubには載せない）
├── .env                    # APIキーなどのローカル設定
├── .env.example            # 設定例
├── system.md               # 実装メモ
└── tab_*.svg / tab_*.png / bp.png
    # タブアイコンや背景画像などのUI素材
```

## 画面側

`index.html` は、HTML・CSS・JavaScriptを1つのファイルにまとめた構成です。
ページ遷移は行わず、タブ切り替えやモーダル表示をJavaScriptで制御します。

主な画面は次の通りです。

- 感想入力: タイトル、名言、感情タグ、感想、画像を入力する
- 過去の記録: 保存済みの感想をカード形式で一覧表示する
- お気に入り: お気に入り登録した記録だけを表示する
- カレンダー: 読んだ日付と巻数を記録する

画面操作は `fetch()` で `server.py` のAPIへ送られます。

## サーバー側

`server.py` は Python 標準ライブラリの `http.server` を使ったローカルサーバーです。
`http://localhost:8000` で `index.html` を配信し、同時に `/api/...` のエンドポイントを処理します。

主なAPIは次の通りです。

- `GET /api/records`: `opinion.md` を読み込んで感想一覧を返す
- `POST /api/save`: 新しい感想を `opinion.md` に追記する
- `POST /api/update`: 既存の感想を更新する
- `POST /api/delete`: 感想を削除する
- `POST /api/favorite`: お気に入り状態を切り替える
- `GET /api/calendar`: `calendar_entries.json` を読み込む
- `POST /api/calendar`: カレンダー記録を保存する
- `GET /api/image-search`: DuckDuckGo画像検索を中継する
- `GET /api/image-proxy`: 外部画像をプロキシして表示する
- `POST /api/bullet-summary`: OpenAI APIで感想を箇条書き要約する

## データ保存

このバージョンでは、データベースではなくローカルファイルに保存します。

- 感想本文: `opinion.md`
- 読書カレンダー: `calendar_entries.json`
- 画像: `images/`

`opinion.md` は `---` 区切りのMarkdownとして保存され、`server.py` の `parse_records()` が読み取って画面表示用のJSONに変換します。
画像はBase64で受け取ったあと、`images/image_<timestamp>.<ext>` として保存されます。

## 外部API

`.env` に `OPENAI_API_KEY` を設定すると、次の補助機能が使えます。

- 漫画タイトルのよみがな生成
- 感想本文の箇条書き要約

画像検索は DuckDuckGo の画像検索結果を `server.py` から取得し、ブラウザ側に返します。

## GitHub公開時の扱い

個人の感想や画像を公開しないため、次のファイルはGit管理から外しています。

- `v3/opinion.md`
- `v3/calendar_entries.json`
- `v3/images/`

そのため、GitHubにはアプリのコードと構造だけを載せ、実際の感想データはローカルに残す構成です。
ローカルではこれらのファイルが存在するため、旧アプリ上で感想を表示できます。
