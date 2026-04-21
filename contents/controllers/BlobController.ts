import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { fetchRawGithub, isDrawableXml, parseBlobUrlInfo } from "../models/GitHubService"
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
export async function processBlobPage(): Promise<boolean> {
  if (!isExtensionValid()) return true

  try {
    const blobInfo = parseBlobUrlInfo(location.href)
    if (!blobInfo || !isDrawableXml(blobInfo.path)) return false

    // ── 最終コミットボックスを探す ──
    // [data-testid="latest-commit"] が React でレンダリングされるまで待つ
    const commitEl = document.querySelector("[data-testid='latest-commit']")
    if (!commitEl) {
      // まだ React がレンダリングしていない → MutationObserver の次回呼び出しに委ねる
      return false
    }

    // 処理済みチェック（commitEl 自体にマーカーを付ける）
    if (commitEl.hasAttribute(BLOB_PROCESSED_ATTR)) return false
    commitEl.setAttribute(BLOB_PROCESSED_ATTR, "1")

    const raw = await fetchRawGithub(blobInfo.org, blobInfo.repo, blobInfo.ref, blobInfo.path)
    if (!raw || !isAndroidVectorDrawable(raw)) return false
    if (!document.contains(commitEl)) return false
    if (!isExtensionValid()) return true

    const headSvg = vectorDrawableToSvg(raw)

    // ── 挿入位置の決定 ──
    // 優先①: コード直前の安定したバナー要素の手前（= コミットボックスとコードの間）
    const sizeBanner = document.querySelector<HTMLElement>(".react-code-size-details-banner")
    if (sizeBanner) {
      renderBlobPanel(sizeBanner, headSvg, "beforebegin")
      return false
    }

    // 優先②: commitEl の最近傍 .border.rounded-2 祖先（コミット外枠ボックス）の直後
    const commitBox = commitEl.closest<HTMLElement>(".border.rounded-2")
    if (commitBox) {
      renderBlobPanel(commitBox, headSvg, "afterend")
      return false
    }

    // フォールバック: アンカー要素の直前に挿入
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
