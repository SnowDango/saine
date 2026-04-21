import { isBlobPage, isPrPage } from "../models/GitHubService"
import { processBlobPage } from "./BlobController"
import { isContextInvalidated, isExtensionValid } from "./extensionContext"
import { FILE_CONTAINER_SELECTOR, clearPanels, handleMutations, scanPage } from "./PrController"

// ─── Lifecycle management ─────────────────────────────────────────────────────

let observer: MutationObserver | null = null

function teardown(): void {
  observer?.disconnect()
  observer = null
  document.removeEventListener("turbo:load", onNavigation)
  document.removeEventListener("pjax:end", onNavigation)
}

async function handleBlobPage(): Promise<void> {
  const invalidated = await processBlobPage()
  if (invalidated) teardown()
}

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
      sendResponse({ ok: true })
    }
    return true
  })
}
