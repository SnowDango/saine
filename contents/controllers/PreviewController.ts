import { isBlobPage, isPrPage } from "../utils/UrlUtils"
import { clearContentsListCache } from "../services/DrawableService"
import { clearPrRefsCache } from "../services/PrRefsService"
import { processBlobPage } from "./BlobController"
import { isContextInvalidated, isExtensionValid } from "./extensionContext"
import { clearPanels, handleMutations, scanPage } from "./PrController"

// ─── Lifecycle management ─────────────────────────────────────────────────────

let observer: MutationObserver | null = null

/**
 * observer を切断してナビゲーションイベントリスナーを解除し、コントローラーを停止する。
 * Extension context が無効化された際や、ページからアンロードされる際に呼ぶ。
 */
function teardown(): void {
  observer?.disconnect()
  observer = null
  document.removeEventListener("turbo:load", onNavigation)
  document.removeEventListener("pjax:end", onNavigation)
}

/**
 * blob ページのプレビューを処理する。
 * processBlobPage が extension context の無効化を検知した場合は teardown を呼ぶ。
 */
async function handleBlobPage(): Promise<void> {
  const invalidated = await processBlobPage()
  if (invalidated) teardown()
}

/**
 * turbo:load / pjax:end などのナビゲーションイベント発生時に呼ばれるハンドラー。
 * 現在の URL に応じて PR ページのスキャンまたは blob ページのプレビュー処理を実行する。
 */
function onNavigation(): void {
  if (!isExtensionValid()) { teardown(); return }
  try {
    if (isPrPage(location.href)) scanPage()
    else if (isBlobPage(location.href)) handleBlobPage().catch((err) => console.warn("[VDP] blob error:", err))
  } catch (err) {
    if (isContextInvalidated(err)) teardown()
  }
}

/**
 * コントローラーを起動する。content script エントリポイントから 1 回だけ呼ぶ。
 */
export function boot(): void {
  if (!isExtensionValid()) return

  if (isPrPage(location.href)) scanPage()
  else if (isBlobPage(location.href)) handleBlobPage().catch((err) => console.warn("[VDP] blob error:", err))

  document.addEventListener("turbo:load", onNavigation)
  document.addEventListener("pjax:end", onNavigation)

  observer = new MutationObserver((mutations) => {
    if (!isExtensionValid()) { teardown(); return }
    try {
      if (isPrPage(location.href)) {
        handleMutations(mutations)
      } else if (isBlobPage(location.href)) {
        handleBlobPage().catch((err) => console.warn("[VDP] observer error:", err))
      }
    } catch (err) {
      if (isContextInvalidated(err)) { teardown(); return }
      console.warn("[VDP] observer error:", err)
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  // ── Message handler ──
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CLEAR_CACHE") {
      clearPanels()
      if (message.rescan !== false && isPrPage(location.href)) scanPage()
      try { sendResponse({ ok: true }) } catch { /* bfcache でポートが閉じている場合は無視 */ }
    }
    return true
  })

  // PAT が変更されたらパネルをリセットして最新の認証で再解決する
  chrome.storage.onChanged.addListener((changes) => {
    if ("github_pat" in changes) {
      clearPrRefsCache()
      clearContentsListCache()
      clearPanels()
      if (isPrPage(location.href)) scanPage()
    }
  })
}
