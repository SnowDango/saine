import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { fetchRawGithub, isDrawableXml, parseBlobUrlInfo } from "../models/GitHubService"
import { renderBlobPanel } from "../views/PreviewPanelView"
import { isContextInvalidated, isExtensionValid } from "./extensionContext"

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOB_PROCESSED_ATTR = "data-vdp-blob-done"
const BLOB_CONTENT_SELECTORS = [
  "[data-selector='repos-split-pane-content']",
  "react-app[app-name='code-view']",
  "[data-target='react-app.reactRoot']",
  "[data-target='blob.content']",
  ".react-code-file-content",
  ".blob-wrapper",
  ".js-blob-wrapper",
  "#file",
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 現在の blob ページを処理してプレビューを挿入する。
 * Extension context が無効化された場合は true を返す。
 */
export async function processBlobPage(): Promise<boolean> {
  if (!isExtensionValid()) return true

  try {
    const blobInfo = parseBlobUrlInfo(location.href)
    if (!blobInfo || !isDrawableXml(blobInfo.path)) return false

    let container: Element | null = null
    for (const sel of BLOB_CONTENT_SELECTORS) {
      container = document.querySelector(sel)
      if (container) break
    }
    if (!container || container.hasAttribute(BLOB_PROCESSED_ATTR)) return false
    container.setAttribute(BLOB_PROCESSED_ATTR, "1")

    const raw = await fetchRawGithub(blobInfo.org, blobInfo.repo, blobInfo.ref, blobInfo.path)
    if (!raw || !isAndroidVectorDrawable(raw)) return false
    if (!document.contains(container)) return false
    if (!isExtensionValid()) return true

    const headSvg = vectorDrawableToSvg(raw)
    renderBlobPanel(container, headSvg)
    return false
  } catch (err) {
    if (isContextInvalidated(err)) return true
    console.warn("[VDP] blob error:", err)
    return false
  }
}
