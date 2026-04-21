import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { parseVersionsFromDiff } from "../models/DiffParser"
import {
  clearPrRefsCache,
  fetchRawGithub,
  findHeadRefFromContainer,
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

    const { before: diffBefore, after: diffAfter, isComplete } = parseVersionsFromDiff(container)

    const isDiffBeforeVd = diffBefore ? isAndroidVectorDrawable(diffBefore) : false
    const isDiffAfterVd = diffAfter ? isAndroidVectorDrawable(diffAfter) : false

    let before: string | null
    let after: string | null
    let panelIsComplete: boolean

    if (isComplete && isDiffBeforeVd && isDiffAfterVd) {
      before = diffBefore
      after = diffAfter
      panelIsComplete = true
    } else {
      const prInfo = parsePrUrlInfo(location.href)
      if (!prInfo) return

      const prRefs = await resolvePrRefs(prInfo.org, prInfo.repo, prInfo.prNumber)
      const baseRef = prRefs.base
      let headRef = prRefs.head
      if (!headRef) {
        const containerRef = findHeadRefFromContainer(container, filePath)
        headRef = (containerRef && containerRef !== baseRef) ? containerRef : null
      }

      if (baseRef && headRef && baseRef === headRef) {
        clearPrRefsCache(`${prInfo.org}/${prInfo.repo}/${prInfo.prNumber}`)
        console.warn(`[VDP] base === head (${baseRef}), aborting`)
        return
      }

      const [fetchedBefore, fetchedAfter] = await Promise.all([
        baseRef
          ? fetchRawGithub(prInfo.org, prInfo.repo, baseRef, filePath)
          : Promise.resolve(null),
        headRef
          ? fetchRawGithub(prInfo.org, prInfo.repo, headRef, filePath)
          : Promise.resolve(null),
      ])

      before = fetchedBefore && isAndroidVectorDrawable(fetchedBefore) ? fetchedBefore : null
      after = fetchedAfter && isAndroidVectorDrawable(fetchedAfter) ? fetchedAfter : null

      // フェッチした base/head が完全一致 → ref 解決ミスの可能性
      if (before !== null && after !== null && before === after) {
        console.warn("[VDP] fetched base === head content, falling back to diff-parsed")
        if (isDiffBeforeVd && isDiffAfterVd && diffBefore !== diffAfter) {
          before = diffBefore
          after = diffAfter
          panelIsComplete = isComplete
        }
      }

      panelIsComplete = true
    }

    if (!document.contains(container)) return
    if (before === null && after === null) return

    const baseSvg = before ? vectorDrawableToSvg(before) : null
    const headSvg = after ? vectorDrawableToSvg(after) : null
    const changeType: ChangeType =
      before === null ? "added" : after === null ? "deleted" : "modified"

    const data: PreviewData = { baseSvg, headSvg, changeType, isComplete: panelIsComplete }
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
