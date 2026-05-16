import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/settings/tokens*"],
  run_at: "document_idle",
}

// Classic token: ghp_ + 36文字以上
const TOKEN_RE = /\bgh[ps]_[A-Za-z0-9]{36,}\b/

let captured = false

// ─── Token detection ──────────────────────────────────────────────────────────

function findToken(): string | null {
  // 1. input[value] を優先確認 (GitHub は input に入れることが多い)
  for (const input of document.querySelectorAll<HTMLInputElement>("input")) {
    const val = input.value
    const m = TOKEN_RE.exec(val)
    if (m) return m[0]
  }
  // 2. テキストコンテンツをスキャン
  const m = TOKEN_RE.exec(document.body.innerText)
  return m ? m[0] : null
}

// ─── Save & notify ────────────────────────────────────────────────────────────

async function captureToken(token: string): Promise<void> {
  if (captured) return
  captured = true

  await chrome.storage.local.set({ github_pat: token })
  showBanner()
}

function showBanner(): void {
  const existing = document.getElementById("saine-pat-banner")
  if (existing) return

  const banner = document.createElement("div")
  banner.id = "saine-pat-banner"
  banner.style.cssText = [
    "position:fixed;top:0;left:0;right:0;z-index:99999;",
    "padding:14px 24px;",
    "background:#1a7f37;color:#fff;",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;",
    "font-size:14px;font-weight:600;",
    "display:flex;align-items:center;justify-content:center;gap:12px;",
    "box-shadow:0 2px 8px rgba(0,0,0,0.2);",
  ].join("")

  const msg = document.createElement("span")
  msg.textContent = "✓ Saine: トークンを保存しました！このタブを閉じて構いません。"

  const closeBtn = document.createElement("button")
  closeBtn.textContent = "✕"
  closeBtn.style.cssText = [
    "background:rgba(255,255,255,0.2);border:none;color:#fff;",
    "padding:2px 8px;border-radius:4px;cursor:pointer;font-size:13px;",
  ].join("")
  closeBtn.addEventListener("click", () => banner.remove())

  banner.appendChild(msg)
  banner.appendChild(closeBtn)
  document.body.insertBefore(banner, document.body.firstChild)
}

// ─── Manual entry fallback ────────────────────────────────────────────────────

function showManualEntryBanner(): void {
  if (document.getElementById("saine-manual-banner")) return

  const banner = document.createElement("div")
  banner.id = "saine-manual-banner"
  banner.style.cssText = [
    "position:fixed;top:0;left:0;right:0;z-index:99999;",
    "padding:14px 24px;",
    "background:#9a6700;color:#fff;",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;",
    "font-size:14px;font-weight:600;",
    "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;",
    "box-shadow:0 2px 8px rgba(0,0,0,0.2);",
  ].join("")

  const msg = document.createElement("span")
  msg.textContent = "⚠ Saine: トークンを自動保存できませんでした。コピーして拡張機能の設定画面で手動入力してください。"

  const openBtn = document.createElement("button")
  openBtn.textContent = "設定を開く →"
  openBtn.style.cssText = [
    "background:#fff;color:#9a6700;border:none;",
    "padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:700;",
  ].join("")
  openBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }))

  const closeBtn = document.createElement("button")
  closeBtn.textContent = "✕"
  closeBtn.style.cssText = [
    "background:rgba(255,255,255,0.2);border:none;color:#fff;",
    "padding:2px 8px;border-radius:4px;cursor:pointer;font-size:13px;",
  ].join("")
  closeBtn.addEventListener("click", () => banner.remove())

  banner.appendChild(msg)
  banner.appendChild(openBtn)
  banner.appendChild(closeBtn)
  document.body.insertBefore(banner, document.body.firstChild)
}

// ─── Observe DOM ─────────────────────────────────────────────────────────────

function scan(): void {
  if (captured) return
  const token = findToken()
  if (token) captureToken(token)
}

scan()

const observer = new MutationObserver(() => scan())
observer.observe(document.body, { childList: true, subtree: true, characterData: true })

// トークン生成後のページ（/settings/tokens/{id}）で
// 一定時間内に自動取得できなかった場合は手動入力を促す
const isResultPage = /\/settings\/tokens\/\d+/.test(location.pathname)

if (isResultPage) {
  setTimeout(() => {
    if (!captured) showManualEntryBanner()
  }, 3000)
}
