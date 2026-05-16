import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { fetchRawGithub } from "../repositories/GitHubApi"
import { isDrawableXml } from "../services/DrawableService"
import { parseBlobUrlInfo } from "../utils/UrlUtils"
import { renderBlobPanel } from "../views/PreviewPanelView"
import { isContextInvalidated, isExtensionValid } from "./extensionContext"

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOB_PROCESSED_ATTR = "data-vdp-blob-done"

/**
 * パネル挿入位置を決めるフォールバック用セレクター（優先順）。
 * 最終コミットボックスが見つからない場合にこの要素の直前に挿入する。
 */
const BLOB_ANCHOR_SELECTORS = [
  ".react-code-size-details-banner",     // 最終コミット直後・コード直前の安定したセレクター
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
/**
 * 現在の blob ページを処理してプレビューパネルを挿入する。
 * drawable XML でなければ何もしない。
 * Extension context が無効化された場合は true、それ以外は false を返す。
 */
export async function processBlobPage(): Promise<boolean> {
  if (!isExtensionValid()) return true

  try {
    const blobInfo = parseBlobUrlInfo(location.href)
    if (!blobInfo || !isDrawableXml(blobInfo.path)) return false

    // ── 最終コミットボックスを探す ──
    const commitEl = document.querySelector("[data-testid='latest-commit']")
    if (!commitEl) {
      return false
    }

    if (commitEl.hasAttribute(BLOB_PROCESSED_ATTR)) return false
    commitEl.setAttribute(BLOB_PROCESSED_ATTR, "1")

    const raw = await fetchRawGithub(blobInfo.org, blobInfo.repo, blobInfo.ref, blobInfo.path)
    if (!raw || !isAndroidVectorDrawable(raw)) return false
    if (!document.contains(commitEl)) return false
    if (!isExtensionValid()) return true

    const headSvg = vectorDrawableToSvg(raw)

    // ── 挿入位置の決定 ──
    const sizeBanner = document.querySelector<HTMLElement>(".react-code-size-details-banner")
    if (sizeBanner) {
      renderBlobPanel(sizeBanner, headSvg, "beforebegin")
      return false
    }

    const commitBox = commitEl.closest<HTMLElement>(".border.rounded-2")
    if (commitBox) {
      renderBlobPanel(commitBox, headSvg, "afterend")
      return false
    }

    for (const sel of BLOB_ANCHOR_SELECTORS) {
      const anchor = document.querySelector<HTMLElement>(sel)
      if (anchor) {
        renderBlobPanel(anchor, headSvg, "beforebegin")
        break
      }
    }
    return false
  } catch (err) {
    if (isContextInvalidated(err)) return true
    console.warn("[VDP] blob error:", err)
    return false
  }
}
