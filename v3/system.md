# Manga Tracker (v3) システム構成と動作の仕組み

現在の `v3/index.html` で動作している漫画感想記録アプリケーションの主要な構成と操作の仕組みについて解説します。

このアプリは **「1つのHTMLファイル（SPA：シングルページアプリケーション風）」** で構成されており、ページ遷移をせずにJavaScriptを使って画面の切り替えやサーバーとの通信を裏側で行っています。

---

## 1. 画面の基本構造（HTML / CSS）
画面は大きく「左サイドバー（タブ）」と「右のメインエリア」に分かれています。
* **タブナビゲーション (`<nav class="tab-bar">`)** : 「感想を記録」「過去の記録」「お気に入り」の3つのボタンが並んでいます。
* **メインエリア (`<div class="main-area">`)** : タブごとに表示される中身（`tab-content`）が格納されています。
* **モーダル (`<div class="modal-overlay">`)** : 漫画の詳細や編集画面を画面全体に覆いかぶせて表示するための隠しレイヤーです。

## 2. タブの切り替えと画面表示 (`switchTab` 関数)
```javascript
function switchTab(tabId) {
    // 1. 全てのタブボタンから 'active' クラスを外す
    // 2. 押されたボタンに 'active' クラスをつける
    // 3. 全てのコンテンツを非表示にする
    // 4. 対応するコンテンツを表示する
    if (tabId === 'records') loadRecords();      // 過去の記録タブならデータを読み込む
    if (tabId === 'favorites') loadFavorites();  // お気に入りタブならデータを読み込む
}
```
タブをクリックするとこの関数が呼ばれ、CSSのクラス付け替えだけで画面が切り替わります。「過去の記録」を開くたびに最新のデータをサーバーから取り寄せる動きになっています。

## 3. グリッド表示（カード）の生成 (`loadRecords` 関数)
記録を「四角形のボックス」として描画する要の機能です。
```javascript
async function loadRecords() {
    // 1. サーバーから保存済みの記録一覧を取得 ( fetch('/api/records') )
    const response = await fetch('/api/records');
    allRecords = await response.json(); // 全データをJSの変数に保存

    // 2. 記録データの数だけループしてHTML（漫画カード）を生成
    allRecords.forEach((record, idx) => {
        const card = document.createElement('div');
        card.className = 'manga-card';
        card.onclick = () => openModal(idx); // クリック時にモーダルを開く設定
        
        // カード内に「タイトル」「星ボタン」「編集ボタン」を埋め込む
        card.innerHTML = `...`; 
        container.appendChild(card); // 画面( records-grid )に追加
    });
}
```
データごとに `<div>`（カード）を作り、それをCSSの `display: grid;`（`records-grid`クラス）の力で1行に最大7個ずつ整列させています。

## 4. モーダル（詳細画面）の仕組み (`openModal` / `closeModal`)
カードをクリックすると実行されます。
```javascript
function openModal(idx) {
    const record = allRecords[idx]; // クリックされたカードのデータを取り出す
    const modal = document.getElementById('modal-overlay'); // 黒い半透明の背景
    const body = document.getElementById('modal-body');     // 詳細を描画する白い枠

    // データを使って画像・名言・感想・タグなどをHTMLで組み立てる
    body.innerHTML = `...`;
    
    // CSSの 'active' クラスを付与し、画面にフワッと表示させる（ display: flex; ）
    modal.classList.add('active'); 
}

function closeModal() {
    // 'active' クラスを外してモーダルを隠す
    document.getElementById('modal-overlay').classList.remove('active');
}
```
Escapeキーを押したときも、キーボードのイベントリスナーが `Escape` を検知して `closeModal()` を呼び出し、隠す仕組みになっています。

## 5. 背景画像モードの切り替え (`toggleBg`)
画面の余白をクリックした時の動作です。
```javascript
document.getElementById('main-area').addEventListener('click', (e) => {
    // もしクリックした場所が「白いパネル」「漫画カード」「ヘッダー」等の上だったら、何もせず処理を終える (return)
    if (e.target.closest('.panel, .manga-card, .records-grid, .main-title-band, ...')) return;
    
    // それ以外の「単なる余白」がクリックされたら、背景モードをON/OFFする
    toggleBg(); 
});
```
`toggleBg()` が呼ばれると、`<body>` タグに `bg-mode` というクラスが付きます。CSS側で `bg-mode` が付いた時は、「メインエリアと左タブを画面外へスライド移動（`transform`）させ、透明化（`opacity`）する」というスタイルが適用され、奥にある背景画像のみが見える仕掛けです。

## 6. お気に入り機能 (`toggleFavorite`)
星マークが押されたときの処理です。
```javascript
async function toggleFavorite(title, date, btnEl) {
    // サーバーへ「この漫画をお気に入りにする/解除する」という命令を送る
    const resp = await fetch('/api/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date })
    });
    const result = await resp.json();
    
    // サーバーの処理が成功したら、画面上の☆を★に切り替える（色も黄色にする）
    btnEl.textContent = result.favorite ? '★' : '☆';
    btnEl.classList.toggle('favorited', result.favorite);
}
```

## 7. データの保存形式について
アップロードされた画像やアイコンは、すべてブラウザ内で特別なテキスト形式（**Base64**）に変換されて扱われています。これにより、別途画像ファイルをアップロードする処理を挟まずとも、フォームのテキストデータと一緒に一つのまとまりとしてPythonサーバー（`server.py`）に送れるようになっています。サーバー側では受け取ったデータを `opinion.md` というマークダウンファイルに書き込み、保存しています。
