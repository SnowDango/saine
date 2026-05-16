import type { PrUrlInfo, PrRefs, BlobUrlInfo } from "./types"

// ─── Background fetch (404 をページコンソールに出さないため background 経由) ──

interface BgFetchResult {
  ok: boolean
  status: number
  text?: string
  data?: unknown
}

function bgFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string> }
): Promise<BgFetchResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "FETCH_REQUEST",
        url,
        method: options?.method ?? "GET",
        headers: options?.headers ?? {},
      },
      (result: BgFetchResult | undefined) =>
        resolve(result ?? { ok: false, status: 0, text: "", data: null })
    )
  })
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function isPrPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)
}

export function isBlobPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/blob\//.test(url)
}

export function parseBlobUrlInfo(url: string): BlobUrlInfo | null {
  // Note: branch names containing "/" are resolved to the first segment only.
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/([^?#]+)/)
  return m ? { org: m[1], repo: m[2], ref: m[3], path: m[4] } : null
}

const DRAWABLE_RE = /drawable/i

export function isDrawableXml(path: string): boolean {
  return path.endsWith(".xml") && DRAWABLE_RE.test(path)
}

export function parsePrUrlInfo(url: string): PrUrlInfo | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  return m ? { org: m[1], repo: m[2], prNumber: m[3] } : null
}

// ─── File path extraction from DOM ────────────────────────────────────────────

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

const SHA_RE = /^[0-9a-f]{40}$/

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
  // :has() が使えないブラウザのために try/catch で囲む
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
  // (PR 説明文などに含まれる場合があるためできるだけ絞り込む)
  for (const a of document.querySelectorAll<HTMLAnchorElement>(`a[href^="${commitPrefix}"]`)) {
    const href = a.getAttribute("href") ?? ""
    const sha = href.slice(commitPrefix.length).split(/[/?#]/)[0]
    if (!SHA_RE.test(sha)) continue
    // アンカーテキストが短い SHA 表示の場合はマージコミットリンクと判断
    const text = (a.textContent ?? "").trim()
    if (/^[0-9a-f]{7,12}$/.test(text)) return sha
  }

  return null
}

export function findHeadRefFromContainer(container: Element, filePath: string | null): string | null {
  let el: Element | null = container.parentElement
  for (let depth = 0; depth < 15; depth++) {
    if (!el || el === document.body) break
    for (const a of el.querySelectorAll<HTMLAnchorElement>("a[href*='/blob/']")) {
      if (container.contains(a)) continue
      const href = a.getAttribute("href") ?? ""
      const blobIdx = href.indexOf("/blob/")
      if (blobIdx < 0) continue
      const afterBlob = href.slice(blobIdx + 6) // "/blob/".length === 6

      if (filePath) {
        const suffix = "/" + filePath
        if (afterBlob.endsWith(suffix)) {
          return afterBlob.slice(0, -suffix.length)
        }
        const encodedSuffix = "/" + filePath.split("/").map(encodeURIComponent).join("/")
        if (afterBlob.endsWith(encodedSuffix)) {
          return afterBlob.slice(0, -encodedSuffix.length)
        }
      }
      const m = afterBlob.match(/^([^/?#]+)\//)
      if (m?.[1]) return m[1]
    }
    el = el.parentElement
  }
  return null
}

// ─── Commit OID extraction from embedded page JSON ───────────────────────────

interface PageOids {
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

      // /changes view: pullRequestsChangesRoute.comparison.fullDiff
      const changesRoute = payload.pullRequestsChangesRoute
      if (changesRoute?.comparison?.fullDiff) {
        const diff = changesRoute.comparison.fullDiff
        if (diff.baseOid && diff.headOid && !baseOid) {
          baseOid = diff.baseOid
          headOid = diff.headOid
        }
      }

      // /files view: pullRequestsFilesRoute.comparison.fullDiff
      const filesRoute = payload.pullRequestsFilesRoute
      if (filesRoute?.comparison?.fullDiff) {
        const diff = filesRoute.comparison.fullDiff
        if (diff.baseOid && diff.headOid && !baseOid) {
          baseOid = diff.baseOid
          headOid = diff.headOid
        }
      }

      // layout route: pullRequestsLayoutRoute.pullRequest.comparison
      const layoutRoute = payload.pullRequestsLayoutRoute
      const pullRequest = layoutRoute?.pullRequest
      if (pullRequest?.comparison) {
        const { baseOid: b, headOid: h } = pullRequest.comparison
        if (b && h && !baseOid) {
          baseOid = b
          headOid = h
        }
      }

      // pullRequest.baseRefOid: 実際のbaseブランチ先端SHA
      // comparison.baseOid (merge base) より新しい場合があり、
      // merge base より後でbaseブランチに追加されたファイルを参照する際に必要
      if (!baseRefOid && pullRequest) {
        const ref =
          pullRequest.baseRefOid ??
          pullRequest.baseRef?.target?.oid ??
          pullRequest.baseRef?.oid
        if (typeof ref === "string" && ref.length === 40) baseRefOid = ref
      }

      // マージ済みPRのマージコミット SHA を取得 (複数のパスを試す)
      if (!mergeCommitOid) {
        const mc = pullRequest?.mergeCommit ?? pullRequest?.mergedCommit
        const sha = mc?.oid ?? mc?.sha ?? pullRequest?.mergeCommitSha ?? pullRequest?.merge_commit_sha
        if (typeof sha === "string" && sha.length === 40) mergeCommitOid = sha
      }

      // diffContents 内の oldCommitOid/newCommitOid (変化がある場合)
      const firstDiff = changesRoute?.diffContents?.[0]
      if (firstDiff?.oldCommitOid && firstDiff?.newCommitOid && !baseOid) {
        baseOid = firstDiff.oldCommitOid
        headOid = firstDiff.newCommitOid
      }

      // 上記で見つからない場合は payload 全体を再帰探索
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
  // mergeCommit / mergedCommit フィールドの oid または sha を探す
  for (const key of ["mergeCommit", "mergedCommit"]) {
    const mc = o[key]
    if (mc && typeof mc === "object") {
      const mcObj = mc as Record<string, unknown>
      const sha = mcObj.oid ?? mcObj.sha
      if (typeof sha === "string" && sha.length === 40) return sha
    }
  }
  // merge_commit_sha / mergeCommitSha を直接探す
  for (const key of ["merge_commit_sha", "mergeCommitSha"]) {
    const val = o[key]
    if (typeof val === "string" && val.length === 40) return val
  }
  // 子オブジェクトを再帰探索
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

// ─── PR refs resolution (base / head branches) ───────────────────────────────

const prRefsCache = new Map<string, Promise<PrRefs>>()

export function resolvePrRefs(org: string, repo: string, prNumber: string): Promise<PrRefs> {
  const cacheKey = `${org}/${repo}/${prNumber}`
  if (!prRefsCache.has(cacheKey)) {
    prRefsCache.set(cacheKey, doResolvePrRefs(org, repo, prNumber))
  }
  return prRefsCache.get(cacheKey)!
}

export function clearPrRefsCache(key?: string): void {
  if (key) {
    prRefsCache.delete(key)
  } else {
    prRefsCache.clear()
    contentsListCache.clear()
    drawableDirHintCache.clear()
    gitTreeCache.clear()
  }
}

interface ApiPrRefs {
  base: string | null
  head: string | null
  baseSha: string | null
  headSha: string | null
  mergeCommitSha: string | null
}

/**
 * Git Refs API でブランチの最新 HEAD コミット SHA を取得する。
 * Contents: Read-only PAT で動作するため、PR API 権限が不要。
 */
async function fetchBranchHeadSha(
  org: string,
  repo: string,
  branchName: string,
  pat: string | null
): Promise<string | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" }
    if (pat) headers["Authorization"] = `Bearer ${pat}`
    const encodedBranch = branchName.split("/").map(encodeURIComponent).join("/")
    const result = await bgFetch(
      `https://api.github.com/repos/${org}/${repo}/git/ref/heads/${encodedBranch}`,
      { headers }
    )
    if (!result.ok) return null
    return ((result.data as Record<string, unknown>)?.object as Record<string, unknown>)?.sha as string ?? null
  } catch {
    return null
  }
}

async function fetchPrRefsFromApi(
  org: string,
  repo: string,
  prNumber: string,
  pat?: string | null
): Promise<ApiPrRefs | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" }
    if (pat) headers["Authorization"] = `Bearer ${pat}`
    const result = await bgFetch(
      `https://api.github.com/repos/${org}/${repo}/pulls/${prNumber}`,
      { headers }
    )
    if (result.ok && result.data) {
      const data = result.data as Record<string, unknown>
      const mergeCommitSha = (data.merge_commit_sha as string | undefined) ?? null
      const base = data.base as Record<string, unknown> | undefined
      const head = data.head as Record<string, unknown> | undefined
      return {
        base: (base?.ref as string | undefined) ?? null,
        head: (head?.ref as string | undefined) ?? null,
        baseSha: (base?.sha as string | undefined) ?? null,
        headSha: (head?.sha as string | undefined) ?? null,
        mergeCommitSha: typeof mergeCommitSha === "string" && mergeCommitSha.length === 40 ? mergeCommitSha : null,
      }
    }
  } catch { /* ネットワークエラーは無視 */ }
  return null
}

async function doResolvePrRefs(
  org: string,
  repo: string,
  prNumber: string
): Promise<PrRefs> {
  // PAT を先に取得し、private repo の API アクセスに使用する
  const pat = await getStoredPat()

  // API を DOM 解析と並行して開始 (commit SHA 取得のため常に実行)
  const apiPromise = fetchPrRefsFromApi(org, repo, prNumber, pat)

  // 1. DOM セレクター
  let domBase: string | null = null
  let domHead: string | null = null

  for (const sel of [".base-ref .css-truncate-target", ".base-ref", "[data-testid='base-ref-name']"]) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const t = el.textContent?.trim()
      if (t && t.length > 0 && t.length < 300) { domBase = t; break }
    }
    if (domBase) break
  }

  for (const sel of [".head-ref .css-truncate-target", ".head-ref", "[data-testid='head-ref-name']"]) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const t = el.textContent?.trim()
      if (t && t.length > 0 && t.length < 300) { domHead = t; break }
    }
    if (domHead) break
  }

  // 2. compare リンク
  let compareBase: string | null = null
  let compareHead: string | null = null
  const comparePrefix = `/${org}/${repo}/compare/`
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href*='/compare/']")) {
    const href = a.getAttribute("href") ?? ""
    const idx = href.indexOf(comparePrefix)
    if (idx < 0) continue
    const tail = href.slice(idx + comparePrefix.length)
    const compareSpec = tail.split("?")[0].split("#")[0]
    const dotsIdx = compareSpec.indexOf("...")
    if (dotsIdx < 0) continue

    const baseRaw = compareSpec.slice(0, dotsIdx)
    const headRawFull = compareSpec.slice(dotsIdx + 3)
    if (!baseRaw || !headRawFull) continue

    compareBase = decodeURIComponent(baseRaw)
    const headRaw = decodeURIComponent(headRawFull)
    compareHead = headRaw.includes(":") ? headRaw.split(":").pop()! : headRaw
    break
  }

  // 3. tree リンク
  const prefix = `/${org}/${repo}/tree/`
  const seen: string[] = []
  for (const a of document.querySelectorAll<HTMLAnchorElement>(`a[href^="${prefix}"]`)) {
    const raw = a.getAttribute("href") ?? ""
    if (!raw.startsWith(prefix)) continue
    const branch = decodeURIComponent(raw.slice(prefix.length).split("?")[0].split("#")[0])
    if (!branch || branch.length > 300) continue
    if (!seen.includes(branch)) seen.push(branch)
    if (seen.length >= 2) break
  }

  const treeBase = seen[0] ?? null
  const treeHead = seen[1] ?? null

  // 4. ページ埋め込み JSON から commit SHA を抽出 (private repo でも動作)
  const pageOids = extractPrOidsFromPage()

  // 5. API 結果を待つ (public repo では SHA が取得できる)
  const apiRefs = await apiPromise

  // 6. ブランチ名を確定し、Git Refs API で実際の HEAD SHA を取得する。
  //    Contents: Read-only PAT で動作するため、PR API 権限が不要。
  //    ページJSON埋め込みの SHA はコミット範囲フィルタ等で古いコミットを指す場合がある。
  const resolvedBase = domBase ?? compareBase ?? treeBase ?? apiRefs?.base ?? null
  const resolvedHead = domHead ?? compareHead ?? treeHead ?? apiRefs?.head ?? null

  // Git Refs API でブランチ HEAD SHA を取得 (ブランチが存在する場合のみ成功)
  const [gitRefHeadSha, gitRefBaseSha] = await Promise.all([
    resolvedHead ? fetchBranchHeadSha(org, repo, resolvedHead, pat) : Promise.resolve(null),
    resolvedBase ? fetchBranchHeadSha(org, repo, resolvedBase, pat) : Promise.resolve(null),
  ])

  // 7. DOM タイムラインからマージコミット SHA を取得 (JSON で見つからない場合の補完)
  const domMergeSha = pageOids.mergeCommitOid ?? findMergeCommitShaFromDom(org, repo)

  // 7b. PR API からマージコミット SHA を補完
  const apiMergeCommitSha = apiRefs?.mergeCommitSha ?? null

  // headSha / baseSha 決定:
  //   Open PR (gitRefHeadSha あり):
  //     baseSha = gitRefBaseSha (base ブランチ現在の先端) >> pageOids.baseOid
  //     headSha = gitRefHeadSha (head ブランチ現在の先端)
  //   Merged PR (gitRefHeadSha なし = source ブランチ削除済み):
  //     baseSha の優先順位:
  //       1. pageOids.baseRefOid  : pullRequest.baseRefOid (ページ JSON に含まれる場合)
  //       2. apiRefs?.baseSha     : PR REST API の base.sha
  //                                 (マージ時点の base ブランチ tip = merge base より新しい可能性)
  //       3. pageOids.baseOid     : comparison.baseOid = merge base (最も古い、最終フォールバック)
  //     ※ merge base より後でbaseブランチに追加されたファイルは
  //        baseOid では見つからないが apiRefs.baseSha では見つかる場合がある
  //     headSha = domMergeSha / apiMergeCommitSha >> gitRefBaseSha >> apiRefs.headSha >> pageOids.headOid
  let baseSha: string | null
  let headSha: string | null
  if (gitRefHeadSha !== null) {
    // Open PR: 両ブランチ生存 → Git Refs API の結果を使用
    baseSha = gitRefBaseSha ?? apiRefs?.baseSha ?? pageOids.baseRefOid ?? pageOids.baseOid ?? null
    headSha = gitRefHeadSha
  } else {
    // Merged / closed PR: source ブランチ削除済み
    baseSha = pageOids.baseRefOid ?? apiRefs?.baseSha ?? pageOids.baseOid ?? null
    headSha = domMergeSha ?? apiMergeCommitSha ?? gitRefBaseSha ?? apiRefs?.headSha ?? pageOids.headOid ?? null
  }

  return {
    base: resolvedBase,
    head: resolvedHead,
    baseSha,
    headSha,
  }
}

// ─── Android selector helpers ─────────────────────────────────────────────────

export function isAndroidSelector(xml: string): boolean {
  return /<selector[\s>]/i.test(xml) && /android:/i.test(xml)
}

export interface ParsedSelectorItem {
  drawableName: string
  stateLabel: string
}

function inferSelectorStateLabel(attrs: string): string {
  const states: string[] = []
  const stateRe = /android:(state_\w+)="(true|false)"/g
  let m: RegExpExecArray | null
  while ((m = stateRe.exec(attrs)) !== null) {
    const name = m[1].replace("state_", "")
    states.push(m[2] === "true" ? name : `!${name}`)
  }
  return states.length > 0 ? states.join(", ") : "default"
}

export function parseSelectorItems(xml: string): ParsedSelectorItem[] {
  const items: ParsedSelectorItem[] = []
  const itemRe = /<item([^>]*?)(?:\/?>)/gs
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const attrs = m[1]
    const drawableMatch = attrs.match(/android:drawable="@drawable\/([^"]+)"/)
    if (!drawableMatch) continue
    items.push({
      drawableName: drawableMatch[1],
      stateLabel: inferSelectorStateLabel(attrs),
    })
  }
  return items
}

/**
 * ファイルパスから `src/main/res/` までのプレフィックスを抽出する。
 * 例: "app/src/main/res/drawable/foo.xml" → "app/src/main/res/"
 * 見つからない場合はファイルが属するディレクトリを返す。
 */
export function extractModuleResPrefix(filePath: string): string {
  // ファイルが属する drawable* ディレクトリの親を resPrefix として使う
  // 例: "app/src/main/res/drawable/icon.xml"                    → "app/src/main/res/"
  // 例: "legacy/src/main/res-layouts/find/drawable/sel.xml"     → "legacy/src/main/res-layouts/find/"
  const drawableMatch = filePath.match(/^(.*\/)drawable[^/]*\/[^/]+$/)
  if (drawableMatch) return drawableMatch[1]

  // Fallback: /src/main/res*/ パターン (drawable ディレクトリが直接見つからない場合)
  const resMatch = filePath.match(/^(.*\/src\/main\/res[^/]*\/)/)
  if (resMatch) return resMatch[1]

  const lastSlash = filePath.lastIndexOf("/")
  return lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : ""
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"]

export interface DrawableResult {
  xml: string | null
  imageUrl: string | null
}

// ─── GitHub Contents API ──────────────────────────────────────────────────────

interface GHContentItem {
  name: string
  path: string
  type: "file" | "dir" | "symlink" | "submodule"
}

// キャッシュキーに認証状態を含めることで PAT の有無による結果の混在を防ぐ
const contentsListCache = new Map<string, Promise<GHContentItem[] | null>>()

export function clearContentsListCache(): void {
  contentsListCache.clear()
}

/**
 * chrome.storage.local から PAT を毎回読み込む（キャッシュなし）。
 * キャッシュによる古い null 返却を防ぐため意図的に都度読み込む。
 */
async function getStoredPat(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get("github_pat")
    return (result.github_pat as string | undefined) ?? null
  } catch {
    return null
  }
}

function fetchContentsList(
  org: string,
  repo: string,
  ref: string,
  dirPath: string,
  pat: string | null
): Promise<GHContentItem[] | null> {
  // PAT の有無をキャッシュキーに含める（認証済み／未認証の結果が混在しないよう）
  const key = `${org}/${repo}/${ref}/${dirPath}:${pat ? "auth" : "noauth"}`
  if (!contentsListCache.has(key)) {
    contentsListCache.set(key, (async () => {
      const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" }
      if (pat) headers["Authorization"] = `Bearer ${pat}`
      try {
        const result = await bgFetch(
          `https://api.github.com/repos/${org}/${repo}/contents/${dirPath}?ref=${encodeURIComponent(ref)}`,
          { headers }
        )
        if (!result.ok || !result.data) return null
        return result.data as GHContentItem[]
      } catch {
        return null
      }
    })())
  }
  return contentsListCache.get(key)!
}

/**
 * GitHub Contents API を使って drawable ファイルを特定する。
 * リクエスト数: 1 (resPrefix 一覧) + N (drawable* ディレクトリ数、通常 1〜4)
 */
async function findDrawableViaContentsApi(
  org: string,
  repo: string,
  ref: string,
  resPrefix: string,
  drawableName: string,
  pat: string | null
): Promise<DrawableResult | null> {
  const prefixPath = resPrefix.replace(/\/$/, "")

  const items = await fetchContentsList(org, repo, ref, prefixPath, pat)
  if (!items) return null

  const drawableDirs = items.filter((item) => item.type === "dir" && /^drawable/i.test(item.name))
  if (drawableDirs.length === 0) return null

  const fileResults = await Promise.all(
    drawableDirs.map(async (dir) => {
      const files = await fetchContentsList(org, repo, ref, dir.path, pat)
      if (!files) return null
      return (
        files.find((f) => {
          if (f.type !== "file") return false
          const dot = f.name.lastIndexOf(".")
          return (dot >= 0 ? f.name.slice(0, dot) : f.name) === drawableName
        }) ?? null
      )
    })
  )

  const found = fileResults.find((r) => r !== null)
  if (!found) return null

  if (found.name.endsWith(".xml")) {
    const xml = await fetchRawGithub(org, repo, ref, found.path)
    return { xml, imageUrl: null }
  }
  return { xml: null, imageUrl: `https://github.com/${org}/${repo}/raw/${ref}/${found.path}` }
}

// ─── Git Trees API (SHA 全体のファイル一覧を 1 回取得してキャッシュ) ────────

/**
 * Git Trees API でコミット SHA 時点の drawable 関連パスをすべて取得してキャッシュ。
 * 同一 SHA に対する複数 drawable 検索でキャッシュを再利用するため、
 * Contents API が使えない環境でも HEAD 総当たりより大幅に少ないリクエストで済む。
 *
 * key: `${org}/${repo}/${sha}`
 * value: drawable を含む blob パスの配列 (null = API 失敗 or truncated)
 */
const gitTreeCache = new Map<string, Promise<string[] | null>>()

function fetchGitTreePaths(
  org: string,
  repo: string,
  sha: string,
  pat: string | null
): Promise<string[] | null> {
  const cacheKey = `${org}/${repo}/${sha}`
  if (!gitTreeCache.has(cacheKey)) {
    gitTreeCache.set(cacheKey, (async () => {
      try {
        const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" }
        if (pat) headers["Authorization"] = `Bearer ${pat}`
        const result = await bgFetch(
          `https://api.github.com/repos/${org}/${repo}/git/trees/${sha}?recursive=1`,
          { headers }
        )
        if (!result.ok || !result.data) return null
        const data = result.data as { truncated?: boolean; tree?: Array<{ path: string; type: string }> }
        if (data.truncated) return null // ファイル数が多すぎる場合は HEAD にフォールバック
        const items = data.tree ?? []
        // メモリ節約のため drawable を含むパスのみ保持
        return items
          .filter((i) => i.type === "blob" && /\/drawable/i.test(i.path))
          .map((i) => i.path)
      } catch {
        return null
      }
    })())
  }
  return gitTreeCache.get(cacheKey)!
}

async function findDrawableViaGitTree(
  org: string,
  repo: string,
  ref: string,
  resPrefix: string,
  drawableName: string,
  pat: string | null
): Promise<DrawableResult | null> {
  const paths = await fetchGitTreePaths(org, repo, ref, pat)
  if (!paths) return null

  const resPrefixNorm = resPrefix.replace(/\/$/, "")
  const prefix = resPrefixNorm + "/"

  for (const filePath of paths) {
    if (!filePath.startsWith(prefix)) continue
    const rest = filePath.slice(prefix.length)          // "drawable-xxxhdpi/name.png"
    const slashIdx = rest.indexOf("/")
    if (slashIdx < 0) continue
    const dir = rest.slice(0, slashIdx)
    const filename = rest.slice(slashIdx + 1)
    if (!dir || filename.includes("/")) continue         // ネストは除外
    if (!/^drawable/i.test(dir)) continue
    const dot = filename.lastIndexOf(".")
    const name = dot >= 0 ? filename.slice(0, dot) : filename
    if (name !== drawableName) continue

    // 完全一致で見つかった
    if (filename.endsWith(".xml")) {
      const xml = await fetchRawGithub(org, repo, ref, filePath)
      return { xml, imageUrl: null }
    }
    return { xml: null, imageUrl: `https://github.com/${org}/${repo}/raw/${ref}/${filePath}` }
  }
  return null
}

// ─── HEAD リクエスト総当たり (private repos フォールバック) ──────────────────

// VectorDrawable は密度修飾子ディレクトリには存在しないため API バージョン系のみ
const XML_DIR_VARIANTS = ["drawable", "drawable-v21", "drawable-v24", "drawable-night"]
// 画像は API バージョン修飾子ディレクトリには存在しないため密度系を中心に
const IMAGE_DIR_VARIANTS = ["drawable", "drawable-night", "drawable-hdpi", "drawable-xhdpi", "drawable-xxhdpi", "drawable-xxxhdpi"]

async function checkHead(url: string): Promise<string | null> {
  const result = await bgFetch(url, { method: "HEAD" })
  return result.ok ? url : null
}

type DrawableCandidate = { url: string; isXml: boolean }

async function findFirstCandidate(candidates: DrawableCandidate[]): Promise<DrawableCandidate | null> {
  const results = await Promise.all(
    candidates.map(async (c) => {
      const found = await checkHead(c.url)
      return found !== null ? c : null
    })
  )
  return results.find((r) => r !== null) ?? null
}

/**
 * 同一 resPrefix+ref で最初に成功したディレクトリ・拡張子をキャッシュ。
 * セレクターの各状態画像は通常同じディレクトリにあるため、
 * 2回目以降は 1 HEAD リクエストで解決できる。
 * key: `${org}/${repo}/${ref}/${resPrefix}`
 */
interface DrawableDirHint { dir: string; ext: string }
const drawableDirHintCache = new Map<string, DrawableDirHint>()

function saveHint(key: string, dir: string, foundUrl: string): void {
  const ext = foundUrl.split(".").pop() ?? "xml"
  drawableDirHintCache.set(key, { dir, ext })
}

async function findDrawableViaHeadRequests(
  org: string,
  repo: string,
  ref: string,
  resPrefix: string,
  drawableName: string
): Promise<DrawableResult> {
  const base = `https://github.com/${org}/${repo}/raw/${ref}/${resPrefix}`
  const hintKey = `${org}/${repo}/${ref}/${resPrefix}`

  // ヒントキャッシュ: 同一 resPrefix で前回成功したディレクトリ/拡張子を先に試す
  const hint = drawableDirHintCache.get(hintKey)
  if (hint) {
    const url = `${base}${hint.dir}/${drawableName}.${hint.ext}`
    if (await checkHead(url)) {
      if (hint.ext === "xml") {
        const xml = await fetchRawGithub(org, repo, ref, `${resPrefix}${hint.dir}/${drawableName}.xml`)
        return { xml, imageUrl: null }
      }
      return { xml: null, imageUrl: url }
    }
    // ヒントが外れた場合はキャッシュを削除してフルサーチへ
    drawableDirHintCache.delete(hintKey)
  }

  // フェーズ1: drawable/ のみを先に試す (VD・画像ともに最も一般的な場所)
  const phase1: DrawableCandidate[] = [
    { url: `${base}drawable/${drawableName}.xml`, isXml: true },
    ...IMAGE_EXTENSIONS.map((ext) => ({ url: `${base}drawable/${drawableName}.${ext}`, isXml: false })),
  ]
  const found1 = await findFirstCandidate(phase1)
  if (found1) {
    saveHint(hintKey, "drawable", found1.url)
    if (!found1.isXml) return { xml: null, imageUrl: found1.url }
    const xml = await fetchRawGithub(org, repo, ref, `${resPrefix}drawable/${drawableName}.xml`)
    return { xml, imageUrl: null }
  }

  // フェーズ2: 残りのディレクトリを並行検索 (drawable/ は Phase 1 で試済み)
  const phase2: DrawableCandidate[] = [
    ...XML_DIR_VARIANTS.slice(1).map((dir) => ({ url: `${base}${dir}/${drawableName}.xml`, isXml: true })),
    ...IMAGE_DIR_VARIANTS.slice(1).flatMap((dir) =>
      IMAGE_EXTENSIONS.map((ext) => ({ url: `${base}${dir}/${drawableName}.${ext}`, isXml: false }))
    ),
  ]
  const found2 = await findFirstCandidate(phase2)
  if (!found2) return { xml: null, imageUrl: null }

  // 成功したディレクトリをキャッシュ
  const rawBase = `https://github.com/${org}/${repo}/raw/${ref}/${resPrefix}`
  const relativePath = found2.url.slice(rawBase.length)           // "dir/name.ext"
  const dir = relativePath.split("/")[0]
  saveHint(hintKey, dir, found2.url)

  if (!found2.isXml) return { xml: null, imageUrl: found2.url }
  const rawPrefix = `https://github.com/${org}/${repo}/raw/${ref}/`
  const path = found2.url.slice(rawPrefix.length)
  const xml = await fetchRawGithub(org, repo, ref, path)
  return { xml, imageUrl: null }
}

/**
 * モジュール内の drawable ファイルを検索する。
 *
 * 1. GitHub Contents API を試みる
 *    - token あり: 認証付きリクエスト (private repos 対応)
 *    - token なし: 認証なし (public repos のみ有効)
 *
 * 2. API が失敗した場合のみ HEAD リクエストにフォールバック
 *    - token あり + API 失敗: path/SHA の解決問題などで稀に発生する緊急フォールバック
 *    - token なし + private repos: 通常のフォールバック
 *
 * 注意: PAT が設定されていても組織の SAML SSO 等により API が 404/403 を返す場合がある。
 * その場合は Contents API / Git Trees API が失敗するため、ブラウザセッション認証を使う
 * HEAD リクエストにフォールバックする（ブラウザのセッション Cookie は SSO を通過できる）。
 *
 * 解決順序:
 *   1. Contents API    : PAT 使用、ディレクトリ一覧 → ファイル特定
 *   2. Git Trees API   : PAT 使用、SHA 全体を 1 回取得 → キャッシュから特定
 *                        (truncated の場合は 3 へ)
 *   3. HEAD requests   : ブラウザ Cookie 使用、パスを総当たり (dir hint cache で最適化済み)
 */
export async function findDrawableInModule(
  org: string,
  repo: string,
  ref: string,
  resPrefix: string,
  drawableName: string
): Promise<DrawableResult> {
  const pat = await getStoredPat()

  // 1. Contents API
  const apiResult = await findDrawableViaContentsApi(org, repo, ref, resPrefix, drawableName, pat)
  if (apiResult) return apiResult

  // 2. Git Trees API (PAT 有効かつ repo が小〜中規模の場合に有効)
  const treeResult = await findDrawableViaGitTree(org, repo, ref, resPrefix, drawableName, pat)
  if (treeResult) return treeResult

  // 3. HEAD requests (ブラウザ Cookie による SAML SSO 経由フォールバック)
  return findDrawableViaHeadRequests(org, repo, ref, resPrefix, drawableName)
}

// ─── Raw file fetch ───────────────────────────────────────────────────────────

export async function fetchRawGithub(
  org: string,
  repo: string,
  ref: string,
  path: string
): Promise<string | null> {
  const url = `https://github.com/${org}/${repo}/raw/${ref}/${path}`
  const result = await bgFetch(url)
  return result.ok && result.text ? result.text : null
}

