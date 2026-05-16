バージョンを上げて `develop` ブランチ向けのPRを作成するスキルです。

## 引数

`$ARGUMENTS` にバージョン種別か具体的なバージョン番号を指定できます。
- 省略時: `patch` として扱う
- `patch` / `minor` / `major`: セマンティックバージョニングに従いバンプ
- `1.2.3` のような具体的バージョン: そのまま使用

## 手順

以下の手順を順番に実行してください。

### 1. 現在のバージョンを確認

`package.json` を読み込み、現在の `version` フィールドを取得してください。

### 2. 新バージョンを計算

引数 `$ARGUMENTS` に応じて新バージョンを決定します。
- 空 or `patch`: パッチバージョンを +1（例: 0.0.9 → 0.0.10）
- `minor`: マイナーバージョンを +1、パッチを 0 に（例: 0.0.9 → 0.1.0）
- `major`: メジャーバージョンを +1、マイナー・パッチを 0 に（例: 0.0.9 → 1.0.0）
- 具体的なバージョン番号（例: `1.2.3`）: そのまま使用

### 3. ブランチ確認

現在のブランチが `develop` でない場合は `develop` に切り替えてから作業してください。
```bash
git checkout develop && git pull origin develop
```

### 4. バージョンアップ用ブランチを作成

```bash
git checkout -b chore/bump-version-<新バージョン>
```

### 5. package.json を更新

`package.json` の `version` フィールドを新バージョンに書き換えてください（Editツール使用）。

### 6. コミット＆プッシュ

```bash
git add package.json
git commit -m "chore: bump version to <新バージョン>"
git push -u origin chore/bump-version-<新バージョン>
```

### 7. PR を作成

`develop` ブランチをベースに PR を作成してください。

```bash
gh pr create --base develop \
  --title "chore: bump version to <新バージョン>" \
  --body "## 概要

バージョンを <現バージョン> から <新バージョン> に更新します。

## 変更内容

- \`package.json\` の \`version\` を \`<現バージョン>\` → \`<新バージョン>\` に更新

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

### 8. PR の URL をユーザーに報告

作成した PR の URL を表示してください。
