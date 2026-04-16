import type { PlasmoCSConfig } from "plasmo"

import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"],
  run_at: "document_idle"
}

const PROCESSED_ATTR = "data-vdp-done"
const DRAWABLE_RE = /drawable/i
const PREVIEW_PX = 88

// ─── Selectors ────────────────────────────────────────────────────────────────
//
// /files  view : file container は .file div
//                diff table は table.diff-table / .js-diff-table
//                行マーカー  は span[data-code-marker]
//
// /changes view : file container は [data-diff-anchor] (diff table そのもの)
//                 行構造は <tr> + <td[data-diff-side]> + <code class="diff-text">
//                 行タイプは code.textContent の先頭文字 (- / + / それ以外)

const FILE_CONTAINER_SELECTOR = ".file, [data-tagsearch-path], [data-diff-anchor]"

// ─── URL helpers ──────────────────────────────────────────────────────────────

function isPrPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)
}

function isDrawableXml(path: string): boolean {
  return path.endsWith(".xml") && DRAWABLE_RE.test(path)
}

// ─── /changes view diff parser ────────────────────────────────────────────────

function getChangesViewCellCode(cell: HTMLElement): string | null {
  // コードは <code class="diff-text ..."> の textContent
  // インラインコメントは code 要素の後の兄弟要素にあるため影響しない
  const codeEl = cell.querySelector("code.diff-text")
  if (!codeEl) return null
  const text = codeEl.textContent ?? ""
  return text === "" ? null : text
}

function parseChangesViewDiff(table: Element): ParsedVersions {
  const rows = table.querySelectorAll<HTMLElement>("tr")
  if (rows.length === 0) return { before: null, after: null, isComplete: false }

  // hunk ヘッダー数が 2 以上なら途中にコンテキストの省略がある可能性
  const hunkHeaders = table.querySelectorAll("td[colspan='4']")
  const isComplete = hunkHeaders.length <= 1

  const beforeLines: string[] = []
  const afterLines: string[] = []

  for (const row of rows) {
    // <th> ヘッダー行をスキップ
    if (row.querySelector("th")) continue
    // hunk ヘッダー行 (@@ ... @@) をスキップ
    if (row.querySelector("td[colspan='4']")) continue
    // コメント行（全セルが aria-hidden）をスキップ
    const cells = row.querySelectorAll("td:not([aria-hidden])")
    if (cells.length === 0) continue

    // Before (left side)
    const leftCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=left].diff-text-cell"
    )
    if (leftCell) {
      const raw = getChangesViewCellCode(leftCell)
      if (raw !== null) {
        // - で始まる = 削除行（- を除去）、それ以外 = コンテキスト
        beforeLines.push(raw.startsWith("-") ? raw.slice(1) : raw)
      }
    }

    // After (right side)
    const rightCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=right].diff-text-cell"
    )
    if (rightCell) {
      const raw = getChangesViewCellCode(rightCell)
      if (raw !== null) {
        // + で始まる = 追加行（+ を除去）、それ以外 = コンテキスト
        afterLines.push(raw.startsWith("+") ? raw.slice(1) : raw)
      }
    }
  }

  return {
    before: beforeLines.length > 0 ? beforeLines.join("\n") : null,
    after: afterLines.length > 0 ? afterLines.join("\n") : null,
    isComplete
  }
}

// ─── /files view diff parser ──────────────────────────────────────────────────

function parseFilesViewDiff(fileContainer: Element): ParsedVersions {
  if (fileContainer.querySelector(".js-load-diff, [data-deferred-diff-type]")) {
    return { before: null, after: null, isComplete: false }
  }

  const table = fileContainer.querySelector<HTMLElement>(
    "table.diff-table, .js-diff-table, table.tab-size"
  )
  if (!table) return { before: null, after: null, isComplete: false }

  const isComplete = !table.querySelector(
    ".js-expandable-line:not([data-expanded])"
  )

  // Split view 判定
  const hasTwoCodeCells = !!table.querySelector(
    "tr:not(.js-expandable-line) td.blob-code ~ td.blob-code"
  )

  const beforeLines: string[] = []
  const afterLines: string[] = []

  if (hasTwoCodeCells) {
    for (const row of table.querySelectorAll<HTMLElement>(
      "tr:not(.js-expandable-line)"
    )) {
      const cells = row.querySelectorAll<HTMLElement>("td.blob-code")
      if (cells.length < 2) continue
      const leftSpan = cells[0].querySelector<HTMLElement>(".blob-code-inner[data-code-marker]")
      const rightSpan = cells[1].querySelector<HTMLElement>(".blob-code-inner[data-code-marker]")
      if (leftSpan) {
        const m = leftSpan.getAttribute("data-code-marker")
        if (m === "-" || m === " ") beforeLines.push(leftSpan.textContent ?? "")
      }
      if (rightSpan) {
        const m = rightSpan.getAttribute("data-code-marker")
        if (m === "+" || m === " ") afterLines.push(rightSpan.textContent ?? "")
      }
    }
  } else {
    for (const span of table.querySelectorAll<HTMLElement>(".blob-code-inner[data-code-marker]")) {
      const m = span.getAttribute("data-code-marker")
      const text = span.textContent ?? ""
      if (m === " ") { beforeLines.push(text); afterLines.push(text) }
      else if (m === "-") beforeLines.push(text)
      else if (m === "+") afterLines.push(text)
    }
  }

  return {
    before: beforeLines.length > 0 ? beforeLines.join("\n") : null,
    after: afterLines.length > 0 ? afterLines.join("\n") : null,
    isComplete
  }
}

// ─── Unified diff parser ──────────────────────────────────────────────────────

interface ParsedVersions {
  before: string | null
  after: string | null
  isComplete: boolean
}

function parseVersionsFromDiff(container: Element): ParsedVersions {
  if (container.hasAttribute("data-diff-anchor")) {
    return parseChangesViewDiff(container)
  }
  return parseFilesViewDiff(container)
}

// ─── File path & content helpers ──────────────────────────────────────────────

function getFilePath(container: Element): string | null {
  // /changes view: aria-label="Diff for: {path}"
  if (container.hasAttribute("data-diff-anchor")) {
    const label = container.getAttribute("aria-label")
    const m = label?.match(/Diff for:\s*(.+)/)
    return m ? m[1].trim() : null
  }

  // /files view: data-path on .file-header
  const header = container.querySelector<HTMLElement>(".file-header")
  if (header?.dataset.path) return header.dataset.path

  // フォールバック: "View file" リンクから抽出
  const viewLink = container.querySelector<HTMLAnchorElement>("a[href*='/blob/']")
  if (viewLink) {
    const m = viewLink.href.match(/\/blob\/[^/]+\/(.+)/)
    return m ? m[1] : null
  }
  return null
}

function getDiffContent(container: Element): HTMLElement | null {
  // /changes view: コンテナ自身が diff table
  if (container.hasAttribute("data-diff-anchor")) {
    return container as HTMLElement
  }
  // /files view
  return (
    container.querySelector<HTMLElement>(".js-file-content") ??
    container.querySelector<HTMLElement>(".diff-table") ??
    container.querySelector<HTMLElement>("table") ??
    null
  )
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function makeSvgBox(svgHtml: string, bg: string, border: string): HTMLElement {
  const box = document.createElement("div")
  box.style.cssText = `
    width:${PREVIEW_PX}px;height:${PREVIEW_PX}px;
    display:flex;align-items:center;justify-content:center;
    background:${bg};border:1px solid ${border};
    border-radius:6px;overflow:hidden;flex-shrink:0;
  `
  const inner = document.createElement("div")
  const sz = PREVIEW_PX - 16
  inner.style.cssText = `width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;`
  inner.innerHTML = svgHtml
  const svgEl = inner.querySelector("svg")
  if (svgEl) {
    svgEl.setAttribute("width", String(sz))
    svgEl.setAttribute("height", String(sz))
    ;(svgEl as SVGElement).style.display = "block"
  }
  box.appendChild(inner)
  return box
}

function makeEmptyBox(label: string): HTMLElement {
  const box = document.createElement("div")
  box.style.cssText = `
    width:${PREVIEW_PX}px;height:${PREVIEW_PX}px;
    display:flex;align-items:center;justify-content:center;
    background:#f6f8fa;border:1px dashed #d0d7de;
    border-radius:6px;flex-shrink:0;
  `
  const span = document.createElement("span")
  span.textContent = label
  span.style.cssText = "font-size:10px;color:#8c959f;text-align:center;padding:4px;"
  box.appendChild(span)
  return box
}

function makeBadge(text: string, bg: string): HTMLElement {
  const el = document.createElement("span")
  el.textContent = text
  el.style.cssText = `
    font-size:10px;font-weight:600;line-height:16px;
    padding:1px 6px;border-radius:10px;background:${bg};color:#fff;
  `
  return el
}

function makeColumn(
  title: string,
  badge: HTMLElement,
  svgHtml: string | null,
  emptyLabel: string
): HTMLElement {
  const col = document.createElement("div")
  col.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;"
  const titleRow = document.createElement("div")
  titleRow.style.cssText = "display:flex;align-items:center;gap:6px;"
  const titleEl = document.createElement("span")
  titleEl.textContent = title
  titleEl.style.cssText = "font-size:12px;font-weight:600;color:#57606a;"
  titleRow.appendChild(titleEl)
  titleRow.appendChild(badge)
  col.appendChild(titleRow)
  const boxes = document.createElement("div")
  boxes.style.cssText = "display:flex;gap:8px;"
  if (svgHtml) {
    boxes.appendChild(makeSvgBox(svgHtml, "#ffffff", "#d0d7de"))
    boxes.appendChild(makeSvgBox(svgHtml, "#0d1117", "#30363d"))
  } else {
    boxes.appendChild(makeEmptyBox(emptyLabel))
    boxes.appendChild(makeEmptyBox(emptyLabel))
  }
  col.appendChild(boxes)
  const hint = document.createElement("div")
  hint.textContent = "light / dark"
  hint.style.cssText = "font-size:11px;color:#8c959f;"
  col.appendChild(hint)
  return col
}

type ChangeType = "added" | "modified" | "deleted"

function buildPanel(
  container: Element,
  baseSvg: string | null,
  headSvg: string | null,
  changeType: ChangeType,
  isComplete: boolean
): void {
  const diffContent = getDiffContent(container)
  if (diffContent) diffContent.style.display = "none"

  const panel = document.createElement("div")
  panel.setAttribute("data-vdp-panel", "1")
  panel.style.cssText =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;border-bottom:1px solid #d0d7de;"

  // ── ヘッダーバー ─────────────────────────────────────────────────
  const headerBar = document.createElement("div")
  headerBar.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:8px 16px;background:#f6f8fa;border-bottom:1px solid #d0d7de;
  `
  const left = document.createElement("div")
  left.style.cssText = "display:flex;align-items:center;gap:8px;"
  const panelTitle = document.createElement("span")
  panelTitle.textContent = "Image Diff"
  panelTitle.style.cssText = "font-size:12px;font-weight:600;color:#1f2328;"
  left.appendChild(panelTitle)
  if (!isComplete) {
    const warn = document.createElement("span")
    warn.textContent = "差分が省略されています — すべて展開するとプレビューが完全になります"
    warn.style.cssText =
      "font-size:11px;color:#9a6700;background:#fff8c5;padding:1px 6px;border-radius:4px;"
    left.appendChild(warn)
  }
  headerBar.appendChild(left)

  let codeVisible = false
  const toggleBtn = document.createElement("button")
  toggleBtn.textContent = "コード差分を表示"
  toggleBtn.style.cssText = `
    font-size:12px;color:#0969da;background:none;border:none;
    cursor:pointer;padding:2px 6px;border-radius:4px;font-family:inherit;
  `
  toggleBtn.addEventListener("mouseenter", () => { toggleBtn.style.background = "#f3f4f6" })
  toggleBtn.addEventListener("mouseleave", () => { toggleBtn.style.background = "none" })
  toggleBtn.addEventListener("click", () => {
    codeVisible = !codeVisible
    if (diffContent) diffContent.style.display = codeVisible ? "" : "none"
    toggleBtn.textContent = codeVisible ? "コード差分を隠す" : "コード差分を表示"
  })
  headerBar.appendChild(toggleBtn)
  panel.appendChild(headerBar)

  // ── Before / After ────────────────────────────────────────────────
  const body = document.createElement("div")
  body.style.cssText = "display:flex;padding:16px 24px;background:#fff;"
  body.appendChild(
    makeColumn(
      "Before",
      changeType === "added" ? makeBadge("n/a", "#8c959f") : makeBadge("BASE", "#6e40c9"),
      baseSvg,
      changeType === "added" ? "New file" : "No preview"
    )
  )
  const divider = document.createElement("div")
  divider.style.cssText = "width:1px;background:#d0d7de;margin:0 24px;flex-shrink:0;"
  body.appendChild(divider)
  const afterBadgeText =
    changeType === "added" ? "ADDED" : changeType === "deleted" ? "DELETED" : "HEAD"
  const afterBadgeColor =
    changeType === "added" ? "#1a7f37" : changeType === "deleted" ? "#cf222e" : "#0969da"
  body.appendChild(
    makeColumn(
      "After",
      makeBadge(afterBadgeText, afterBadgeColor),
      headSvg,
      changeType === "deleted" ? "Deleted" : "No preview"
    )
  )
  panel.appendChild(body)

  // diffContent (または container) の直前にパネルを挿入
  const anchor = diffContent ?? container.querySelector(".file-header")
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor)
  } else {
    container.appendChild(panel)
  }
}

// ─── Core processing ──────────────────────────────────────────────────────────

function processFileContainer(container: Element): void {
  if (container.hasAttribute(PROCESSED_ATTR)) return

  try {
    const filePath = getFilePath(container)
    // file-header がまだ未ロードの場合は処理を保留（PROCESSED_ATTR を付けない）
    if (!filePath) return

    container.setAttribute(PROCESSED_ATTR, "1")

    if (!isDrawableXml(filePath)) return

    const { before, after, isComplete } = parseVersionsFromDiff(container)

    const isBeforeVd = before ? isAndroidVectorDrawable(before) : false
    const isAfterVd = after ? isAndroidVectorDrawable(after) : false
    if (!isBeforeVd && !isAfterVd) return

    const baseSvg = isBeforeVd ? vectorDrawableToSvg(before!) : null
    const headSvg = isAfterVd ? vectorDrawableToSvg(after!) : null
    const changeType: ChangeType =
      !isBeforeVd ? "added" : !isAfterVd ? "deleted" : "modified"

    buildPanel(container, baseSvg, headSvg, changeType, isComplete)
  } catch (err) {
    console.warn("[VDP] error:", err)
  }
}

function scanPage(): void {
  document.querySelectorAll<Element>(FILE_CONTAINER_SELECTOR).forEach(processFileContainer)
}

// ─── Extension context invalidation handling ──────────────────────────────────

function isExtensionValid(): boolean {
  try { return !!chrome.runtime?.id } catch { return false }
}

function isContextInvalidated(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Extension context invalidated")
}

function teardown(): void {
  observer.disconnect()
  document.removeEventListener("turbo:load", onNavigation)
  document.removeEventListener("pjax:end", onNavigation)
}

function onNavigation(): void {
  if (!isExtensionValid()) { teardown(); return }
  try { if (isPrPage(location.href)) scanPage() }
  catch (err) { if (isContextInvalidated(err)) teardown() }
}

if (isExtensionValid() && isPrPage(location.href)) scanPage()

document.addEventListener("turbo:load", onNavigation)
document.addEventListener("pjax:end", onNavigation)

const observer = new MutationObserver((mutations) => {
  if (!isExtensionValid()) { teardown(); return }
  try {
    if (!isPrPage(location.href)) return
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches(FILE_CONTAINER_SELECTOR)) processFileContainer(node)
        node.querySelectorAll<Element>(FILE_CONTAINER_SELECTOR)
          .forEach((c) => processFileContainer(c))
      }
    }
  } catch (err) {
    if (isContextInvalidated(err)) { teardown(); return }
    console.warn("[VDP] observer error:", err)
  }
})

observer.observe(document.body, { childList: true, subtree: true })
