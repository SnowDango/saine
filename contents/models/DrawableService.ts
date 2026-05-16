import { bgFetch, fetchRawGithub, getStoredPat } from "./GitHubApi"

// ─── Drawable XML detection ───────────────────────────────────────────────────

const DRAWABLE_RE = /drawable/i

export function isDrawableXml(path: string): boolean {
  return path.endsWith(".xml") && DRAWABLE_RE.test(path)
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
  const drawableMatch = filePath.match(/^(.*\/)drawable[^/]*\/[^/]+$/)
  if (drawableMatch) return drawableMatch[1]

  const resMatch = filePath.match(/^(.*\/src\/main\/res[^/]*\/)/)
  if (resMatch) return resMatch[1]

  const lastSlash = filePath.lastIndexOf("/")
  return lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : ""
}

// ─── GitHub Contents API ──────────────────────────────────────────────────────

interface GHContentItem {
  name: string
  path: string
  type: "file" | "dir" | "symlink" | "submodule"
}

// キャッシュキーに認証状態を含めることで PAT の有無による結果の混在を防ぐ
const contentsListCache = new Map<string, Promise<GHContentItem[] | null>>()

function fetchContentsList(
  org: string,
  repo: string,
  ref: string,
  dirPath: string,
  pat: string | null
): Promise<GHContentItem[] | null> {
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

// ─── Git Trees API ────────────────────────────────────────────────────────────

/**
 * Git Trees API でコミット SHA 時点の drawable 関連パスをすべて取得してキャッシュ。
 * 同一 SHA に対する複数 drawable 検索でキャッシュを再利用するため、
 * Contents API が使えない環境でも HEAD 総当たりより大幅に少ないリクエストで済む。
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
        if (data.truncated) return null
        const items = data.tree ?? []
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

// ─── HEAD リクエスト総当たり (SAML SSO 経由フォールバック) ────────────────────

const XML_DIR_VARIANTS = ["drawable", "drawable-v21", "drawable-v24", "drawable-night"]
const IMAGE_DIR_VARIANTS = ["drawable", "drawable-night", "drawable-hdpi", "drawable-xhdpi", "drawable-xxhdpi", "drawable-xxxhdpi"]
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"]

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
 * key: `${org}/${repo}/${ref}/${resPrefix}`
 */
interface DrawableDirHint { dir: string; ext: string }
const drawableDirHintCache = new Map<string, DrawableDirHint>()

function saveHint(key: string, dir: string, foundUrl: string): void {
  const ext = foundUrl.split(".").pop() ?? "xml"
  drawableDirHintCache.set(key, { dir, ext })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DrawableResult {
  xml: string | null
  imageUrl: string | null
}

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
    const rest = filePath.slice(prefix.length)
    const slashIdx = rest.indexOf("/")
    if (slashIdx < 0) continue
    const dir = rest.slice(0, slashIdx)
    const filename = rest.slice(slashIdx + 1)
    if (!dir || filename.includes("/")) continue
    if (!/^drawable/i.test(dir)) continue
    const dot = filename.lastIndexOf(".")
    const name = dot >= 0 ? filename.slice(0, dot) : filename
    if (name !== drawableName) continue

    if (filename.endsWith(".xml")) {
      const xml = await fetchRawGithub(org, repo, ref, filePath)
      return { xml, imageUrl: null }
    }
    return { xml: null, imageUrl: `https://github.com/${org}/${repo}/raw/${ref}/${filePath}` }
  }
  return null
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
    drawableDirHintCache.delete(hintKey)
  }

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

  const phase2: DrawableCandidate[] = [
    ...XML_DIR_VARIANTS.slice(1).map((dir) => ({ url: `${base}${dir}/${drawableName}.xml`, isXml: true })),
    ...IMAGE_DIR_VARIANTS.slice(1).flatMap((dir) =>
      IMAGE_EXTENSIONS.map((ext) => ({ url: `${base}${dir}/${drawableName}.${ext}`, isXml: false }))
    ),
  ]
  const found2 = await findFirstCandidate(phase2)
  if (!found2) return { xml: null, imageUrl: null }

  const rawBase = `https://github.com/${org}/${repo}/raw/${ref}/${resPrefix}`
  const relativePath = found2.url.slice(rawBase.length)
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
 * 解決順序:
 *   1. Contents API    : PAT 使用、ディレクトリ一覧 → ファイル特定
 *   2. Git Trees API   : PAT 使用、SHA 全体を 1 回取得 → キャッシュから特定
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

  const apiResult = await findDrawableViaContentsApi(org, repo, ref, resPrefix, drawableName, pat)
  if (apiResult) return apiResult

  const treeResult = await findDrawableViaGitTree(org, repo, ref, resPrefix, drawableName, pat)
  if (treeResult) return treeResult

  return findDrawableViaHeadRequests(org, repo, ref, resPrefix, drawableName)
}

// ─── Cache management ─────────────────────────────────────────────────────────

export function clearContentsListCache(): void {
  contentsListCache.clear()
}

export function clearDrawableServiceCaches(): void {
  contentsListCache.clear()
  drawableDirHintCache.clear()
  gitTreeCache.clear()
}
