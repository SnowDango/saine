[English](README.md) | [日本語](README.ja.md)

<div align="center">

# Saine

**Android Vector Drawable Preview on GitHub**

Preview Android Vector Drawable XML files directly in GitHub Pull Requests.

</div>

## ✨ Features

- 🖼️ **Inline Preview** — Automatically renders Vector Drawable XML as SVG images in PR diff views
- 🔀 **Before / After Comparison** — Shows base (before) and head (after) versions side by side
- 🌗 **Light & Dark Preview** — Displays each icon on both light and dark backgrounds
- 🔔 **Update Notifications** — Checks GitHub Releases for new versions and notifies you in the popup
- 🧹 **Cache Control** — Clear preview cache from the popup with one click

## 📦 Install

### From GitHub Releases (Recommended)

1. Download the latest `saine-*.zip` from [Releases](../../releases/latest)
2. Unzip the downloaded file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (toggle in the top right)
5. Click **Load unpacked** and select the unzipped folder

### Build from Source

```bash
git clone https://github.com/SnowDango/saine.git
cd saine
npm install
npm run build
```

Then load `build/chrome-mv3-prod` as an unpacked extension.

## 🚀 Usage

1. Navigate to any Pull Request on GitHub that contains Vector Drawable XML files (files in `drawable/` directories ending with `.xml`)
2. The extension automatically detects these files and replaces the code diff with a visual preview panel
3. The panel shows **Before (BASE)** and **After (HEAD)** images, each on light and dark backgrounds
4. Click **「コード差分を表示」** to toggle the original code diff view

### Popup Actions

Click the Saine extension icon to open the popup:

- **🗑 キャッシュをクリア** — Clears cached branch refs and re-scans the page
- **更新を確認** — Manually checks for new versions on GitHub Releases

## 🛠️ Development

```bash
npm install
npm run dev
```

Load `build/chrome-mv3-dev` as an unpacked extension. Changes auto-reload.

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build |
| `npm run package` | Build and package as ZIP |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |

## 📄 License

MIT
