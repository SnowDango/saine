import { describe, it, expect, afterEach } from "vitest"
import {
  isPrPage,
  isBlobPage,
  isDrawableXml,
  parsePrUrlInfo,
  parseBlobUrlInfo,
  getFilePath,
  getDiffContent,
  findHeadShaFromContainer,
  extractPrOidsFromPage,
} from "~contents/models/GitHubService"

// ─── isPrPage ─────────────────────────────────────────────────────────────────

describe("isPrPage", () => {
  it("PR ページの URL を検出する", () => {
    expect(isPrPage("https://github.com/user/repo/pull/123")).toBe(true)
    expect(isPrPage("https://github.com/org/my-repo/pull/1")).toBe(true)
    expect(isPrPage("https://github.com/org/repo/pull/999/files")).toBe(true)
    expect(isPrPage("https://github.com/org/repo/pull/42/commits")).toBe(true)
  })

  it("PR ページでない URL は false を返す", () => {
    expect(isPrPage("https://github.com/user/repo")).toBe(false)
    expect(isPrPage("https://github.com/user/repo/issues/1")).toBe(false)
    expect(isPrPage("https://github.com/user/repo/pulls")).toBe(false)
    expect(isPrPage("https://example.com/pull/1")).toBe(false)
    expect(isPrPage("")).toBe(false)
  })
})

// ─── isBlobPage ──────────────────────────────────────────────────────────────

describe("isBlobPage", () => {
  it("Blob ページの URL を検出する", () => {
    expect(isBlobPage("https://github.com/user/repo/blob/main/path/to/file.xml")).toBe(true)
    expect(isBlobPage("https://github.com/org/repo/blob/v1.2.3/src/icon.xml")).toBe(true)
    expect(isBlobPage("https://github.com/org/repo/blob/abc123/file.xml")).toBe(true)
  })

  it("Blob ページでない URL は false を返す", () => {
    expect(isBlobPage("https://github.com/user/repo")).toBe(false)
    expect(isBlobPage("https://github.com/user/repo/pull/1")).toBe(false)
    expect(isBlobPage("https://github.com/user/repo/tree/main")).toBe(false)
    expect(isBlobPage("https://example.com/blob/main/file.xml")).toBe(false)
    expect(isBlobPage("")).toBe(false)
  })
})

// ─── parseBlobUrlInfo ─────────────────────────────────────────────────────────

describe("parseBlobUrlInfo", () => {
  it("Blob URL から org/repo/ref/path を抽出する", () => {
    const result = parseBlobUrlInfo("https://github.com/org/repo/blob/main/app/res/drawable/icon.xml")
    expect(result).toEqual({ org: "org", repo: "repo", ref: "main", path: "app/res/drawable/icon.xml" })
  })

  it("タグ名 (v1.2.3) のリファレンスも正しく抽出する", () => {
    const result = parseBlobUrlInfo("https://github.com/org/repo/blob/v1.2.3/src/icon.xml")
    expect(result).toEqual({ org: "org", repo: "repo", ref: "v1.2.3", path: "src/icon.xml" })
  })

  it("クエリパラメータを含む URL でも正しく抽出する", () => {
    const result = parseBlobUrlInfo("https://github.com/org/repo/blob/main/icon.xml?plain=1")
    expect(result).toEqual({ org: "org", repo: "repo", ref: "main", path: "icon.xml" })
  })

  it("Blob URL でなければ null を返す", () => {
    expect(parseBlobUrlInfo("https://github.com/org/repo")).toBeNull()
    expect(parseBlobUrlInfo("https://github.com/org/repo/pull/1")).toBeNull()
    expect(parseBlobUrlInfo("")).toBeNull()
  })
})

// ─── isDrawableXml ────────────────────────────────────────────────────────────

describe("isDrawableXml", () => {
  it("drawable パスの .xml ファイルを検出する", () => {
    expect(isDrawableXml("app/src/main/res/drawable/icon.xml")).toBe(true)
    expect(isDrawableXml("res/drawable-hdpi/bg.xml")).toBe(true)
    expect(isDrawableXml("drawable/test.xml")).toBe(true)
  })

  it("drawable を含まない .xml は false を返す", () => {
    expect(isDrawableXml("app/src/main/res/layout/activity_main.xml")).toBe(false)
    expect(isDrawableXml("app/src/main/res/values/strings.xml")).toBe(false)
  })

  it(".xml 以外の拡張子は false を返す", () => {
    expect(isDrawableXml("drawable/icon.png")).toBe(false)
    expect(isDrawableXml("drawable/icon.svg")).toBe(false)
    expect(isDrawableXml("drawable/icon.kt")).toBe(false)
  })

  it("大文字小文字を区別しない (drawable)", () => {
    expect(isDrawableXml("res/Drawable/icon.xml")).toBe(true)
    expect(isDrawableXml("res/DRAWABLE-HDPI/icon.xml")).toBe(true)
  })
})

// ─── parsePrUrlInfo ───────────────────────────────────────────────────────────

describe("parsePrUrlInfo", () => {
  it("PR URL から org/repo/prNumber を抽出する", () => {
    const result = parsePrUrlInfo("https://github.com/SnowDango/saine/pull/42")
    expect(result).toEqual({ org: "SnowDango", repo: "saine", prNumber: "42" })
  })

  it("/files サブパスがあっても正しく抽出する", () => {
    const result = parsePrUrlInfo("https://github.com/org/repo/pull/123/files")
    expect(result).toEqual({ org: "org", repo: "repo", prNumber: "123" })
  })

  it("PR URL でなければ null を返す", () => {
    expect(parsePrUrlInfo("https://github.com/org/repo")).toBeNull()
    expect(parsePrUrlInfo("https://github.com/org/repo/issues/1")).toBeNull()
    expect(parsePrUrlInfo("")).toBeNull()
  })
})

// ─── getFilePath ──────────────────────────────────────────────────────────────

describe("getFilePath", () => {
  it("data-diff-anchor の aria-label から抽出する", () => {
    const el = document.createElement("div")
    el.setAttribute("data-diff-anchor", "")
    el.setAttribute("aria-label", "Diff for: app/res/drawable/icon.xml")
    expect(getFilePath(el)).toBe("app/res/drawable/icon.xml")
  })

  it("aria-label にマッチしなければ null", () => {
    const el = document.createElement("div")
    el.setAttribute("data-diff-anchor", "")
    el.setAttribute("aria-label", "Some other label")
    expect(getFilePath(el)).toBeNull()
  })

  it(".file-header の data-path から抽出する", () => {
    const container = document.createElement("div")
    const header = document.createElement("div")
    header.classList.add("file-header")
    header.dataset.path = "src/drawable/ic.xml"
    container.appendChild(header)
    expect(getFilePath(container)).toBe("src/drawable/ic.xml")
  })

  it("blob リンクから抽出する", () => {
    const container = document.createElement("div")
    const a = document.createElement("a")
    a.href = "https://github.com/org/repo/blob/main/drawable/icon.xml"
    container.appendChild(a)
    expect(getFilePath(container)).toBe("drawable/icon.xml")
  })

  it("何もなければ null", () => {
    const container = document.createElement("div")
    expect(getFilePath(container)).toBeNull()
  })
})

// ─── getDiffContent ───────────────────────────────────────────────────────────

describe("getDiffContent", () => {
  it("data-diff-anchor のコンテナはそのまま返す", () => {
    const el = document.createElement("div")
    el.setAttribute("data-diff-anchor", "")
    expect(getDiffContent(el)).toBe(el)
  })

  it(".js-file-content を優先的に返す", () => {
    const container = document.createElement("div")
    const content = document.createElement("div")
    content.classList.add("js-file-content")
    container.appendChild(content)
    const table = document.createElement("table")
    container.appendChild(table)
    expect(getDiffContent(container)).toBe(content)
  })

  it("フォールバックで table を返す", () => {
    const container = document.createElement("div")
    const table = document.createElement("table")
    container.appendChild(table)
    expect(getDiffContent(container)).toBe(table)
  })

  it("何もなければ null", () => {
    const container = document.createElement("div")
    expect(getDiffContent(container)).toBeNull()
  })
})

// ─── findHeadShaFromContainer ─────────────────────────────────────────────────

const MOCK_SHA = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

describe("findHeadShaFromContainer", () => {
  it("filePath が一致する blob リンクから SHA を抽出する", () => {
    const container = document.createElement("div")
    const a = document.createElement("a")
    a.href = `https://github.com/org/repo/blob/${MOCK_SHA}/drawable/icon.xml`
    container.appendChild(a)
    expect(findHeadShaFromContainer(container, "drawable/icon.xml")).toBe(MOCK_SHA)
  })

  it("filePath が null の場合、URL 先頭の SHA を返す", () => {
    const container = document.createElement("div")
    const a = document.createElement("a")
    a.href = `https://github.com/org/repo/blob/${MOCK_SHA}/other/file.xml`
    container.appendChild(a)
    expect(findHeadShaFromContainer(container, null)).toBe(MOCK_SHA)
  })

  it("SHA 形式でない ref (ブランチ名) は返さない", () => {
    const container = document.createElement("div")
    const a = document.createElement("a")
    a.href = `https://github.com/org/repo/blob/main/drawable/icon.xml`
    container.appendChild(a)
    expect(findHeadShaFromContainer(container, "drawable/icon.xml")).toBeNull()
  })

  it("blob リンクがなければ null を返す", () => {
    const container = document.createElement("div")
    expect(findHeadShaFromContainer(container, "drawable/icon.xml")).toBeNull()
  })

  it("filePath が一致しない blob リンクは無視する", () => {
    const container = document.createElement("div")
    const a = document.createElement("a")
    a.href = `https://github.com/org/repo/blob/${MOCK_SHA}/other/file.xml`
    container.appendChild(a)
    // filePath が一致しないが URL 先頭の SHA は取得できる
    expect(findHeadShaFromContainer(container, "drawable/icon.xml")).toBe(MOCK_SHA)
  })
})

// ─── extractPrOidsFromPage ────────────────────────────────────────────────────

describe("extractPrOidsFromPage", () => {
  let addedScript: HTMLScriptElement | null = null

  function addScript(payload: unknown): void {
    const script = document.createElement("script")
    script.type = "application/json"
    script.textContent = JSON.stringify({ payload })
    document.head.appendChild(script)
    addedScript = script
  }

  afterEach(() => {
    if (addedScript) {
      document.head.removeChild(addedScript)
      addedScript = null
    }
  })

  it("pullRequestsChangesRoute から OID を抽出する", () => {
    addScript({
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: "base111", headOid: "head222" } },
      },
    })
    expect(extractPrOidsFromPage()).toEqual({ baseOid: "base111", headOid: "head222" })
  })

  it("pullRequestsFilesRoute から OID を抽出する", () => {
    addScript({
      pullRequestsFilesRoute: {
        comparison: { fullDiff: { baseOid: "base333", headOid: "head444" } },
      },
    })
    expect(extractPrOidsFromPage()).toEqual({ baseOid: "base333", headOid: "head444" })
  })

  it("pullRequestsLayoutRoute から OID を抽出する", () => {
    addScript({
      pullRequestsLayoutRoute: {
        pullRequest: { comparison: { baseOid: "base555", headOid: "head666" } },
      },
    })
    expect(extractPrOidsFromPage()).toEqual({ baseOid: "base555", headOid: "head666" })
  })

  it("diffContents の oldCommitOid/newCommitOid から OID を抽出する", () => {
    addScript({
      pullRequestsChangesRoute: {
        diffContents: [{ oldCommitOid: "base777", newCommitOid: "head888" }],
      },
    })
    expect(extractPrOidsFromPage()).toEqual({ baseOid: "base777", headOid: "head888" })
  })

  it("該当データがなければ null/null を返す", () => {
    addScript({ somethingElse: {} })
    expect(extractPrOidsFromPage()).toEqual({ baseOid: null, headOid: null })
  })
})

