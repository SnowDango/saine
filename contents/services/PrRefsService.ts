import type { PrRefs } from "../models/types"
import { bgFetch, getStoredPat } from "../repositories/GitHubApi"
import { clearDrawableServiceCaches } from "./DrawableService"
import { extractPrOidsFromPage, findMergeCommitShaFromDom } from "../repositories/PageDomReader"

// ─── Private helpers ──────────────────────────────────────────────────────────

const SHA_RE = /^[0-9a-f]{40}$/

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

/**
 * GitHub Pulls API から PR の base/head ブランチ名と commit SHA を取得する。
 * PAT がなければ private リポジトリでは失敗する。
 */
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

/**
 * PR の base/head SHA を解決する内部実装。
 * DOM セレクター → compare リンク → tree リンク → ページ埋め込み JSON → Pulls API の順に
 * ブランチ名を取得し、Git Refs API で実際の HEAD SHA を確定する。
 * マージ済み PR ではマージコミット SHA を headSha として使用する。
 */
async function doResolvePrRefs(
  org: string,
  repo: string,
  prNumber: string
): Promise<PrRefs> {
  const pat = await getStoredPat()
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

  // 4. ページ埋め込み JSON から commit SHA を抽出
  const pageOids = extractPrOidsFromPage()

  // 5. API 結果を待つ
  const apiRefs = await apiPromise

  // 6. ブランチ名を確定し、Git Refs API で実際の HEAD SHA を取得
  const resolvedBase = domBase ?? compareBase ?? treeBase ?? apiRefs?.base ?? null
  const resolvedHead = domHead ?? compareHead ?? treeHead ?? apiRefs?.head ?? null

  const [gitRefHeadSha, gitRefBaseSha] = await Promise.all([
    resolvedHead ? fetchBranchHeadSha(org, repo, resolvedHead, pat) : Promise.resolve(null),
    resolvedBase ? fetchBranchHeadSha(org, repo, resolvedBase, pat) : Promise.resolve(null),
  ])

  // 7. マージコミット SHA を取得
  const domMergeSha = pageOids.mergeCommitOid ?? findMergeCommitShaFromDom(org, repo)
  const apiMergeCommitSha = apiRefs?.mergeCommitSha ?? null

  let baseSha: string | null
  let headSha: string | null
  if (gitRefHeadSha !== null) {
    baseSha = gitRefBaseSha ?? apiRefs?.baseSha ?? pageOids.baseRefOid ?? pageOids.baseOid ?? null
    headSha = gitRefHeadSha
  } else {
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

// ─── Public API ───────────────────────────────────────────────────────────────

const prRefsCache = new Map<string, Promise<PrRefs>>()

/**
 * PR の base/head commit SHA を解決して返す。同一 PR への重複リクエストはキャッシュで抑制する。
 */
export function resolvePrRefs(org: string, repo: string, prNumber: string): Promise<PrRefs> {
  const cacheKey = `${org}/${repo}/${prNumber}`
  if (!prRefsCache.has(cacheKey)) {
    prRefsCache.set(cacheKey, doResolvePrRefs(org, repo, prNumber))
  }
  return prRefsCache.get(cacheKey)!
}

/**
 * PR refs のキャッシュをクリアする。
 * key を指定すると該当 PR のみ、省略すると全キャッシュと DrawableService のキャッシュも合わせてクリアする。
 */
export function clearPrRefsCache(key?: string): void {
  if (key) {
    prRefsCache.delete(key)
  } else {
    prRefsCache.clear()
    clearDrawableServiceCaches()
  }
}
