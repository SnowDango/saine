[English](README.md) | [日本語](README.ja.md)

これは [`plasmo init`](https://www.npmjs.com/package/plasmo) でブートストラップされた [Plasmo extension](https://docs.plasmo.com/) プロジェクトです。

## はじめに

まず、開発サーバーを起動します:

```bash
pnpm dev
# または
npm run dev
```

ブラウザを開き、適切な開発ビルドを読み込んでください。たとえば、Manifest V3 を使用した Chrome ブラウザ向けに開発する場合は `build/chrome-mv3-dev` を使用します。

`popup.tsx` を編集することでポップアップを変更できます。変更を加えると自動的に更新されます。オプションページを追加するには、プロジェクトルートに `options.tsx` ファイルを作成し、React コンポーネントをデフォルトエクスポートするだけです。同様に、コンテンツページを追加するには、プロジェクトルートに `content.ts` ファイルを作成し、モジュールをインポートしてロジックを記述した後、ブラウザで拡張機能をリロードしてください。

詳細なガイドは [ドキュメント](https://docs.plasmo.com/) をご覧ください。

## プロダクションビルド

以下のコマンドを実行してください:

```bash
pnpm build
# または
npm run build
```

拡張機能のプロダクションバンドルが生成されます。ZIP に圧縮してストアに公開する準備が整います。

## ウェブストアへの申請

Plasmo 拡張機能をデプロイする最も簡単な方法は、組み込みの [bpp](https://bpp.browser.market) GitHub Action を使用することです。このアクションを使用する前に、拡張機能をビルドして最初のバージョンをストアにアップロードし、基本的な認証情報を確立しておく必要があります。その後、[セットアップ手順](https://docs.plasmo.com/framework/workflows/submit) に従えば、自動申請の準備が整います。
