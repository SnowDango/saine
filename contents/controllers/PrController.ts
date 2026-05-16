import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { parseVersionsFromDiff } from "../models/DiffParser"
import {
  clearPrRefsCache,
  fetchRawGithub,
  findHeadShaFromContainer,
  getDiffContent,
  getFilePath,
  isDrawableXml,
  parsePrUrlInfo,
  resolvePrRefs,
} from "../models/GitHubService"
import type { ChangeType, PreviewData } from "../models/types"
import { removePanel, renderPanel } from "../views/PreviewPanelView"

// ─── Constants ────────────────────────────────────────────────────────────────

const PROCESSED_ATTR = "data-vdp-done"
export const FILE_CONTAINER_SELECTOR = ".file, [data-tagsearch-path], [data-diff-anchor]"

// ─── File container processing ────────────────────────────────────────────────

async function processFileContainer(container: Element): Promise<void> {
  if (container.hasAttribute(PROCESSED_ATTR)) return

  try {
    const filePath = getFilePath(container)
    if (!filePath || !isDrawableXml(filePath)) return

    container.setAttribute(PROCESSED_ATTR, "1")

    let before: string | null = null
    let after: string | null = null

    // 1. Primary: commit SHA でフルファイルを取得 (ブランチ削除後・private repo でも動作)
    const prInfo = parsePrUrlInfo(location.href)
    if (prInfo) {
      const prRefs = await resolvePrRefs(prInfo.org, prInfo.repo, prInfo.prNumber)
      const baseRef = prRefs.baseSha ?? prRefs.base
      const headRef = prRefs.headSha ?? findHeadShaFromContainer(container, filePath)

      if (baseRef && headRef && baseRef !== headRef) {
        const [fetchedBefore, fetchedAfter] = await Promise.all([
          fetchRawGithub(prInfo.org, prInfo.repo, baseRef, filePath),
          fetchRawGithub(prInfo.org, prInfo.repo, headRef, filePath),
        ])
        before = fetchedBefore && isAndroidVectorDrawable(fetchedBefore) ? fetchedBefore : null
        after = fetchedAfter && isAndroidVectorDrawable(fetchedAfter) ? fetchedAfter : null

        if (before !== null && after !== null && before === after) {
          console.warn("[VDP] fetched base === head content, clearing")
          before = null
          after = null
        }
      }
    }

    // 2. Fallback: diff から部分的に復元
    if (before === null && after === null) {
      const { before: diffBefore, after: diffAfter } = parseVersionsFromDiff(container)
      const isDiffBeforeVd = diffBefore ? isAndroidVectorDrawable(diffBefore) : false
      const isDiffAfterVd = diffAfter ? isAndroidVectorDrawable(diffAfter) : false
      if (isDiffBeforeVd || isDiffAfterVd) {
        before = isDiffBeforeVd ? diffBefore : null
        after = isDiffAfterVd ? diffAfter : null
      }
    }

    if (!document.contains(container)) return
    if (before === null && after === null) return

    const baseSvg = before ? vectorDrawableToSvg(before) : null
    const headSvg = after ? vectorDrawableToSvg(after) : null
    const changeType: ChangeType =
      before === null ? "added" : after === null ? "deleted" : "modified"

    const data: PreviewData = { baseSvg, headSvg, changeType, isComplete: true }
    const diffContent = getDiffContent(container)
    renderPanel(container, diffContent, data)
  } catch (err) {
    console.warn("[VDP] error:", err)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function scanPage(): void {
  document.querySelectorAll<Element>(FILE_CONTAINER_SELECTOR).forEach((c) => {
    processFileContainer(c).catch((err) => console.warn("[VDP] scan error:", err))
  })
}

export function handleMutations(mutations: MutationRecord[]): void {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches(FILE_CONTAINER_SELECTOR)) {
        processFileContainer(node).catch((err) => console.warn("[VDP] observer error:", err))
      }
      node.querySelectorAll<Element>(FILE_CONTAINER_SELECTOR).forEach((c) => {
        processFileContainer(c).catch((err) => console.warn("[VDP] observer error:", err))
      })
    }
  }
}

export function clearPanels(): void {
  clearPrRefsCache()
  document.querySelectorAll<Element>(`[${PROCESSED_ATTR}]`).forEach((el) => {
    el.removeAttribute(PROCESSED_ATTR)
    const diffContent = getDiffContent(el)
    removePanel(el, diffContent)
  })
}
