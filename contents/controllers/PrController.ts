import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

import { parseVersionsFromDiff } from "../models/DiffParser"
import {
  clearPrRefsCache,
  extractModuleResPrefix,
  fetchRawGithub,
  findDrawableInModule,
  findHeadShaFromContainer,
  getDiffContent,
  getFilePath,
  isAndroidSelector,
  isDrawableXml,
  parsePrUrlInfo,
  parseSelectorItems,
  resolvePrRefs,
} from "../models/GitHubService"
import type { ChangeType, PreviewData, SelectorStateItem } from "../models/types"
import { removePanel, renderPanel, renderSelectorPanel } from "../views/PreviewPanelView"

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
    let resolvedBaseRef: string | null = null
    let resolvedHeadRef: string | null = null

    // 1. Primary: commit SHA でフルファイルを取得 (ブランチ削除後・private repo でも動作)
    const prInfo = parsePrUrlInfo(location.href)
    if (prInfo) {
      const prRefs = await resolvePrRefs(prInfo.org, prInfo.repo, prInfo.prNumber)
      resolvedBaseRef = prRefs.baseSha ?? prRefs.base
      // コンテナ内の "View file" リンクSHAを最優先する。
      // マージ済みPRではこのリンクがマージコミットSHAを指すため、
      // ブランチ削除後でも drawables を正確に解決できる。
      const containerHeadSha = findHeadShaFromContainer(container, filePath)
      resolvedHeadRef = containerHeadSha ?? prRefs.headSha ?? prRefs.head ?? null

      // 片方の ref だけでも取得可能な場合はフェッチを試みる
      // (削除ファイルは HEAD に View file リンクがなく resolvedHeadRef が null になりやすい)
      if ((resolvedBaseRef || resolvedHeadRef) && resolvedBaseRef !== resolvedHeadRef) {
        const [fetchedBefore, fetchedAfter] = await Promise.all([
          resolvedBaseRef
            ? fetchRawGithub(prInfo.org, prInfo.repo, resolvedBaseRef, filePath)
            : Promise.resolve(null),
          resolvedHeadRef
            ? fetchRawGithub(prInfo.org, prInfo.repo, resolvedHeadRef, filePath)
            : Promise.resolve(null),
        ])
        before = fetchedBefore
        after = fetchedAfter

        if (before !== null && after !== null && before === after) {
          console.warn("[VDP] fetched base === head content, clearing")
          before = null
          after = null
        }
      }
    }

    // 2. Fallback: diff から部分的に復元
    if (before === null && after === null) {
      const parsed = parseVersionsFromDiff(container)
      const isDiffBeforeVd = parsed.before ? isAndroidVectorDrawable(parsed.before) : false
      const isDiffAfterVd = parsed.after ? isAndroidVectorDrawable(parsed.after) : false
      if (isDiffBeforeVd || isDiffAfterVd) {
        before = isDiffBeforeVd ? parsed.before : null
        after = isDiffAfterVd ? parsed.after : null
      }
    }

    if (!document.contains(container)) return
    if (before === null && after === null) return

    const changeType: ChangeType =
      before === null ? "added" : after === null ? "deleted" : "modified"
    const diffContent = getDiffContent(container)

    // 3. Selector preview
    if ((before && isAndroidSelector(before)) || (after && isAndroidSelector(after))) {
      if (!prInfo) return

      const resPrefix = extractModuleResPrefix(filePath)

      const buildStates = async (
        selectorXml: string | null,
        ref: string | null
      ): Promise<SelectorStateItem[] | null> => {
        if (!selectorXml || !ref) return null
        const parsed = parseSelectorItems(selectorXml)
        return Promise.all(
          parsed.map(async (item) => {
            const result = await findDrawableInModule(prInfo.org, prInfo.repo, ref, resPrefix, item.drawableName)
            const svg = result.xml && isAndroidVectorDrawable(result.xml) ? vectorDrawableToSvg(result.xml) : null
            return { stateLabel: item.stateLabel, svg, imageUrl: result.imageUrl }
          })
        )
      }

      const [baseStates, headStates] = await Promise.all([
        buildStates(before, resolvedBaseRef),
        buildStates(after, resolvedHeadRef),
      ])

      if (!document.contains(container)) return
      renderSelectorPanel(container, diffContent, { changeType, baseStates, headStates })
      return
    }

    // 4. Vector drawable preview
    const isBeforeVd = before !== null && isAndroidVectorDrawable(before)
    const isAfterVd = after !== null && isAndroidVectorDrawable(after)
    if (!isBeforeVd && !isAfterVd) return

    const baseSvg = isBeforeVd ? vectorDrawableToSvg(before!) : null
    const headSvg = isAfterVd ? vectorDrawableToSvg(after!) : null
    const data: PreviewData = { baseSvg, headSvg, changeType, isComplete: true }
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
