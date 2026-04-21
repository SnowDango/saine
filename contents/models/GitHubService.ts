import type { PrUrlInfo, PrRefs, BlobUrlInfo } from "./types"

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
  }
}

async function doResolvePrRefs(
  org: string,
  repo: string,
  prNumber: string
): Promise<PrRefs> {
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

  if (domBase && domHead) return { base: domBase, head: domHead }

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

  const resolvedBase = domBase ?? compareBase ?? treeBase
  const resolvedHead = domHead ?? compareHead ?? treeHead

  if (resolvedBase && resolvedHead) return { base: resolvedBase, head: resolvedHead }

  // 4. GitHub API
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${org}/${repo}/pulls/${prNumber}`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    )
    if (resp.ok) {
      const data = await resp.json()
      const apiBase = data.base?.ref as string | undefined
      const apiHead = data.head?.ref as string | undefined
      if (apiBase || apiHead) return { base: apiBase ?? resolvedBase, head: apiHead ?? resolvedHead }
    }
  } catch { /* ネットワークエラーは無視 */ }

  if (!resolvedBase && !resolvedHead) {
    console.warn(`[VDP] refs not found for ${org}/${repo}#${prNumber}`)
  }

  return { base: resolvedBase, head: resolvedHead }
}

// ─── Raw file fetch ───────────────────────────────────────────────────────────

export async function fetchRawGithub(
  org: string,
  repo: string,
  ref: string,
  path: string
): Promise<string | null> {
  const url = `https://github.com/${org}/${repo}/raw/${ref}/${path}`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    return (await resp.text()) || null
  } catch {
    return null
  }
}

