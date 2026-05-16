import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/settings/tokens/new"],
  run_at: "document_idle",
}

// ─── Guide panel ──────────────────────────────────────────────────────────────

const GUIDE_ID = "saine-pat-guide"

function buildGuide(): HTMLElement {
  const panel = document.createElement("div")
  panel.id = GUIDE_ID
  panel.style.cssText = [
    "position:fixed;bottom:24px;right:24px;z-index:9999;",
    "width:340px;",
    "background:#ffffff;",
    "border:2px solid #6e40c9;",
    "border-radius:10px;",
    "box-shadow:0 4px 16px rgba(110,64,201,0.18);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;",
    "font-size:13px;color:#24292f;",
    "overflow:hidden;",
  ].join("")

  // ── Header ──
  const header = document.createElement("div")
  header.style.cssText = [
    "display:flex;align-items:center;justify-content:space-between;",
    "padding:10px 14px;",
    "background:#6e40c9;color:#fff;",
    "cursor:pointer;user-select:none;",
  ].join("")

  const title = document.createElement("span")
  title.style.cssText = "font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;"
  title.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM6.5 4.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0ZM8 6.75c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C9.25 7.31 8.69 6.75 8 6.75Z"/>
    </svg>
    Saine - 設定ガイド
  `

  const controls = document.createElement("div")
  controls.style.cssText = "display:flex;align-items:center;gap:6px;"

  const collapseBtn = document.createElement("button")
  collapseBtn.textContent = "▾"
  collapseBtn.title = "折りたたむ"
  collapseBtn.style.cssText = [
    "background:none;border:none;color:#fff;cursor:pointer;",
    "font-size:14px;padding:0 2px;line-height:1;",
  ].join("")

  const closeBtn = document.createElement("button")
  closeBtn.textContent = "✕"
  closeBtn.title = "閉じる"
  closeBtn.style.cssText = [
    "background:none;border:none;color:#fff;cursor:pointer;",
    "font-size:12px;padding:0 2px;line-height:1;",
  ].join("")
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    panel.remove()
  })

  controls.appendChild(collapseBtn)
  controls.appendChild(closeBtn)
  header.appendChild(title)
  header.appendChild(controls)

  // ── Body ──
  const body = document.createElement("div")
  body.style.cssText = "padding:14px;"

  body.innerHTML = `
    <p style="margin:0 0 12px;color:#656d76;font-size:12px;line-height:1.5;">
      Classic token を使うと Organization の SAML SSO 認証に対応できます。<br>
      以下の手順で設定してください。
    </p>

    <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;">
      <li>
        <strong>Note</strong><br>
        <span style="color:#656d76;">任意の名前を入力</span>
        <code style="display:inline-block;margin-top:3px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:4px;padding:1px 6px;font-size:11px;">Saine Extension</code>
      </li>
      <li>
        <strong>Expiration</strong><br>
        <span style="color:#656d76;">任意の期限を選択</span>
      </li>
      <li>
        <strong>Select scopes</strong>
        <div style="margin-top:6px;padding:10px;background:#f6f1ff;border:1px solid #d2b4f5;border-radius:6px;">
          <div style="font-size:12px;color:#6e40c9;font-weight:600;margin-bottom:4px;">✅ 必要なスコープ</div>
          <div style="font-size:12px;line-height:1.7;">
            <span style="background:#1a7f37;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;">repo</span>
            <span style="margin-left:6px;color:#656d76;">（プライベートリポジトリの読み取り）</span>
          </div>
          <div style="margin-top:6px;font-size:11px;color:#656d76;">
            自動でチェックされない場合は手動でチェックしてください。<br>
            他のスコープはチェック不要です。
          </div>
        </div>
      </li>
    </ol>

    <div style="margin-top:12px;padding:8px 10px;background:#fff8c5;border:1px solid #d4a017;border-radius:6px;font-size:12px;color:#633c01;">
      ⚠ SAML SSO が必要な場合は、生成後に Organization の Settings → Personal access tokens から認可を行ってください
    </div>

    <div style="margin-top:8px;padding:8px 10px;background:#dafbe1;border-radius:6px;font-size:12px;color:#1a7f37;">
      ✓ Generate token を押すとトークンが自動で保存されます
    </div>
  `

  // ── Collapse toggle ──
  let collapsed = false
  const toggle = () => {
    collapsed = !collapsed
    body.style.display = collapsed ? "none" : "block"
    collapseBtn.textContent = collapsed ? "▸" : "▾"
  }
  header.addEventListener("click", toggle)
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation()
    toggle()
  })

  panel.appendChild(header)
  panel.appendChild(body)
  return panel
}

// ─── Auto-fill token name ─────────────────────────────────────────────────────

const TOKEN_NAME = "Saine Extension"

function fillTokenName(): void {
  // GitHub Classic token page: Note フィールド
  const input = document.querySelector<HTMLInputElement>(
    'input#oauth_access_description, input[name="oauth_access[description]"]'
  )
  if (input && !input.value) {
    input.value = TOKEN_NAME
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }
}

// ─── Auto-check repo scope ────────────────────────────────────────────────────

function checkRepoScope(): void {
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"][value="repo"], input[type="checkbox"]#repo'
  )
  if (checkbox && !checkbox.checked) {
    checkbox.click()
  }
}

// ─── Inject ───────────────────────────────────────────────────────────────────

function injectGuide(): void {
  if (document.getElementById(GUIDE_ID)) return
  document.body.appendChild(buildGuide())
  fillTokenName()
  checkRepoScope()
}

injectGuide()

// ページがDOMを動的に構築する場合に備えて監視
const setupObserver = new MutationObserver(() => {
  fillTokenName()
  checkRepoScope()
  // 両方完了したら監視終了
  const input = document.querySelector<HTMLInputElement>(
    'input#oauth_access_description, input[name="oauth_access[description]"]'
  )
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"][value="repo"], input[type="checkbox"]#repo'
  )
  if (input?.value && checkbox?.checked) setupObserver.disconnect()
})
setupObserver.observe(document.body, { childList: true, subtree: true })
setTimeout(() => setupObserver.disconnect(), 10000)
