// ─── DOM reading helpers ──────────────────────────────────────────────────────
//
// GitHub のページ DOM からデータを読み取るユーティリティ群。
// Controller が Model に渡すデータを DOM から抽出する役割を担う。

const SHA_RE = /^[0-9a-f]{40}$/

// ─── File container helpers ───────────────────────────────────────────────────

export function getFilePath(container: Element): string | null {
  if (container.hasAttribute("data-diff-anchor")) {
    const label = container.getAttribute("aria-label")
    const m = label?.match(/Diff for:\s*(.+)/)
    return m ? m[1].trim() : null
  }

  const header = container.querySelector<HTMLElement>(".file-header")
  if (header?.dataset.path) return header.dataset.path

  const viewLink = container.querySelector<HTMLAnchorElement>("a[href*='/blob/']")
  if (viewLink) {
    const m = viewLink.href.match(/\/blob\/[^/]+\/(.+)/)
    return m ? m[1] : null
  }
  return null
}

export function getDiffContent(container: Element): HTMLElement | null {
  if (container.hasAttribute("data-diff-anchor")) {
    return container as HTMLElement
  }
  return (
    container.querySelector<HTMLElement>(".js-file-content") ??
    container.querySelector<HTMLElement>(".diff-table") ??
    container.querySelector<HTMLElement>("table") ??
    null
  )
}

// ─── HEAD ref heuristic from DOM blob links ───────────────────────────────────

/**
 * コンテナ内の blob リンクから HEAD commit SHA を探す。
 * GitHub PR の "Files changed" ビューでは "View file" リンク
 * (/blob/{headCommitSHA}/{path}) がコンテナ内に存在する。
 * private リポジトリなど API が利用できない場合の fallback として使用する。
 */
export function findHeadShaFromContainer(container: Element, filePath: string | null): string | null {
  const blobLinks = container.querySelectorAll<HTMLAnchorElement>("a[href*='/blob/']")
  if (blobLinks.length === 0) {
    // リンクが0件の場合は data-* 属性や他の手がかりを探す
    const viewFileBtn = container.querySelector<HTMLAnchorElement>("a[data-hotkey], a[aria-label*='View']")
    if (viewFileBtn) {
      const href = viewFileBtn.getAttribute("href") ?? ""
      const blobIdx = href.indexOf("/blob/")
      if (blobIdx >= 0) {
        const afterBlob = href.slice(blobIdx + 6)
        const m = afterBlob.match(/^([0-9a-f]{7,40})\//)
        if (m?.[1] && m[1].length === 40) return m[1]
      }
    }
    return null
  }
  for (const a of blobLinks) {
    const href = a.getAttribute("href") ?? ""
    const blobIdx = href.indexOf("/blob/")
    if (blobIdx < 0) continue
    const afterBlob = href.slice(blobIdx + 6)

    if (filePath) {
      const suffix = "/" + filePath
      if (afterBlob.endsWith(suffix)) {
        const ref = afterBlob.slice(0, -suffix.length)
        if (SHA_RE.test(ref)) return ref
      }
      const encodedSuffix = "/" + filePath.split("/").map(encodeURIComponent).join("/")
      if (afterBlob.endsWith(encodedSuffix)) {
        const ref = afterBlob.slice(0, -encodedSuffix.length)
        if (SHA_RE.test(ref)) return ref
      }
    }
    const m = afterBlob.match(/^([0-9a-f]{40})\//)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * PR のタイムライン DOM から マージコミット SHA を探す。
 * "merged commit {sha} into {branch}" という表示を含む要素を探す。
 */
export function findMergeCommitShaFromDom(org: string, repo: string): string | null {
  const commitPrefix = `/${org}/${repo}/commit/`

  // git-merge アイコンを含む TimelineItem（マージイベント）を優先的に探す
  const mergedSelectors = [
    ".TimelineItem--condensed",
    ".TimelineItem",
    "[data-testid*='merge']",
    "[class*='MergedEvent']",
    "[class*='merged']",
  ]
  for (const sel of mergedSelectors) {
    try {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const text = el.textContent ?? ""
        if (!/merged/i.test(text)) continue
        for (const a of el.querySelectorAll<HTMLAnchorElement>(`a[href*='/commit/']`)) {
          const href = a.getAttribute("href") ?? ""
          const idx = href.indexOf(commitPrefix)
          if (idx < 0) continue
          const sha = href.slice(idx + commitPrefix.length).split(/[/?#]/)[0]
          if (SHA_RE.test(sha)) return sha
        }
      }
    } catch { /* skip */ }
  }

  // Fallback: 全コミットリンクから "/commit/{40-char-sha}" を探す
  for (const a of document.querySelectorAll<HTMLAnchorElement>(`a[href^="${commitPrefix}"]`)) {
    const href = a.getAttribute("href") ?? ""
    const sha = href.slice(commitPrefix.length).split(/[/?#]/)[0]
    if (!SHA_RE.test(sha)) continue
    const text = (a.textContent ?? "").trim()
    if (/^[0-9a-f]{7,12}$/.test(text)) return sha
  }

  return null
}

// ─── Commit OID extraction from embedded page JSON ───────────────────────────

export interface PageOids {
  baseOid: string | null      // comparison の merge base (diff 計算用の共通祖先)
  headOid: string | null      // head ブランチ tip
  mergeCommitOid: string | null
  baseRefOid: string | null   // pullRequest.baseRefOid: 実際の base ブランチ tip
}

export function extractPrOidsFromPage(): PageOids {
  let baseOid: string | null = null
  let headOid: string | null = null
  let mergeCommitOid: string | null = null
  let baseRefOid: string | null = null

  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "")
      const payload = data?.payload
      if (!payload) continue

      const changesRoute = payload.pullRequestsChangesRoute
      if (changesRoute?.comparison?.fullDiff) {
        const diff = changesRoute.comparison.fullDiff
        if (diff.baseOid && diff.headOid && !baseOid) {
          baseOid = diff.baseOid
          headOid = diff.headOid
        }
      }

      const filesRoute = payload.pullRequestsFilesRoute
      if (filesRoute?.comparison?.fullDiff) {
        const diff = filesRoute.comparison.fullDiff
        if (diff.baseOid && diff.headOid && !baseOid) {
          baseOid = diff.baseOid
          headOid = diff.headOid
        }
      }

      const layoutRoute = payload.pullRequestsLayoutRoute
      const pullRequest = layoutRoute?.pullRequest
      if (pullRequest?.comparison) {
        const { baseOid: b, headOid: h } = pullRequest.comparison
        if (b && h && !baseOid) {
          baseOid = b
          headOid = h
        }
      }

      if (!baseRefOid && pullRequest) {
        const ref =
          pullRequest.baseRefOid ??
          pullRequest.baseRef?.target?.oid ??
          pullRequest.baseRef?.oid
        if (typeof ref === "string" && ref.length === 40) baseRefOid = ref
      }

      if (!mergeCommitOid) {
        const mc = pullRequest?.mergeCommit ?? pullRequest?.mergedCommit
        const sha = mc?.oid ?? mc?.sha ?? pullRequest?.mergeCommitSha ?? pullRequest?.merge_commit_sha
        if (typeof sha === "string" && sha.length === 40) mergeCommitOid = sha
      }

      const firstDiff = changesRoute?.diffContents?.[0]
      if (firstDiff?.oldCommitOid && firstDiff?.newCommitOid && !baseOid) {
        baseOid = firstDiff.oldCommitOid
        headOid = firstDiff.newCommitOid
      }

      if (!mergeCommitOid) {
        mergeCommitOid = findMergeCommitOidInObject(payload, 0)
      }
    } catch { /* skip */ }
  }
  return { baseOid, headOid, mergeCommitOid, baseRefOid }
}

/** payload オブジェクトを再帰的に探索してマージコミット SHA を返す */
function findMergeCommitOidInObject(obj: unknown, depth: number): string | null {
  if (depth > 6 || obj === null || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  for (const key of ["mergeCommit", "mergedCommit"]) {
    const mc = o[key]
    if (mc && typeof mc === "object") {
      const mcObj = mc as Record<string, unknown>
      const sha = mcObj.oid ?? mcObj.sha
      if (typeof sha === "string" && sha.length === 40) return sha
    }
  }
  for (const key of ["merge_commit_sha", "mergeCommitSha"]) {
    const val = o[key]
    if (typeof val === "string" && val.length === 40) return val
  }
  for (const val of Object.values(o)) {
    if (Array.isArray(val)) {
      for (const item of val.slice(0, 10)) {
        const found = findMergeCommitOidInObject(item, depth + 1)
        if (found) return found
      }
    } else {
      const found = findMergeCommitOidInObject(val, depth + 1)
      if (found) return found
    }
  }
  return null
}
