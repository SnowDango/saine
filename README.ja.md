[English](README.md) | [日本語](README.ja.md)

<div align="center">

# Saine

**Android Vector Drawable Preview on GitHub**

GitHub の Pull Request 上で Android Vector Drawable XML ファイルを直接プレビューする Chrome 拡張機能です。

</div>

## ✨ 特徴

- 🖼️ **インラインプレビュー** — PR の差分ビューで Vector Drawable XML を SVG 画像として自動描画
- 🔀 **Before / After 比較** — base（変更前）と head（変更後）を横並びで表示
- 🌗 **ライト & ダーク プレビュー** — 各アイコンを明るい背景と暗い背景の両方で表示
- 🔔 **更新通知** — GitHub Releases の新バージョンをチェックしてポップアップで通知
- 🧹 **キャッシュ管理** — ポップアップからワンクリックでプレビューキャッシュをクリア
- 🌐 **多言語対応** — 英語・日本語に対応（ブラウザの言語設定から自動検出）

## 📦 インストール

### GitHub Releases から（推奨）

1. [Releases](../../releases/latest) から最新の `saine-*.crx` をダウンロード
2. Chrome で `chrome://extensions` を開く
3. 右上の **デベロッパーモード** を有効にする
4. `.crx` ファイルを拡張機能ページにドラッグ＆ドロップ

### ソースからビルド

```bash
git clone https://github.com/SnowDango/saine.git
cd saine
npm install
npm run build
```

`build/chrome-mv3-prod` を「パッケージ化されていない拡張機能」として読み込んでください。

## 🚀 使い方

1. GitHub 上で Vector Drawable XML ファイル（`drawable/` ディレクトリ内の `.xml` ファイル）を含む Pull Request を開く
2. 拡張機能が自動的にファイルを検出し、コード差分をビジュアルプレビューパネルに置き換えます
3. パネルには **Before（BASE）** と **After（HEAD）** の画像がライト・ダーク両方の背景で表示されます
4. **「コード差分を表示」** をクリックすると元のコード差分表示に切り替えられます

### ポップアップの機能

Saine の拡張機能アイコンをクリックしてポップアップを開きます：

- **🗑 キャッシュをクリア** — キャッシュされたブランチ情報を削除し、ページを再スキャン
- **更新を確認** — GitHub Releases の新バージョンを手動でチェック

## 🛠️ 開発

```bash
npm install
npm run dev
```

`build/chrome-mv3-dev` を「パッケージ化されていない拡張機能」として読み込んでください。変更は自動的にリロードされます。

### コマンド一覧

| コマンド | 説明 |
|---|---|
| `npm run dev` | ホットリロード付き開発サーバーを起動 |
| `npm run build` | プロダクションビルド |
| `npm run package` | ビルドして ZIP にパッケージ |
| `npm test` | テストを実行 |
| `npm run lint` | ESLint を実行 |

## 📄 ライセンス

MIT
