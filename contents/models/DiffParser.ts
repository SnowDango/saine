import type { ParsedVersions } from "./types"

// ─── Selectors ────────────────────────────────────────────────────────────────
//
// /files  view : file container は .file div
//                diff table は table.diff-table / .js-diff-table
//                行マーカー  は span[data-code-marker]
//
// /changes view : file container は [data-diff-anchor] (diff table そのもの)
//                 行構造は <tr> + <td[data-diff-side]> + <code class="diff-text">
//                 行タイプは code.textContent の先頭文字 (- / + / それ以外)

// ─── /changes view diff parser ────────────────────────────────────────────────

function getChangesViewCellCode(cell: HTMLElement): string | null {
  const codeEl = cell.querySelector("code.diff-text")
  if (!codeEl) return null
  const text = codeEl.textContent ?? ""
  return text === "" ? null : text
}

function parseChangesViewDiff(table: Element): ParsedVersions {
  const rows = table.querySelectorAll<HTMLElement>("tr")
  if (rows.length === 0) return { before: null, after: null, isComplete: false }

  const hunkHeaders = table.querySelectorAll("td[colspan='4']")
  const isComplete = hunkHeaders.length <= 1

  const beforeLines: string[] = []
  const afterLines: string[] = []

  for (const row of rows) {
    if (row.querySelector("th")) continue
    if (row.querySelector("td[colspan='4']")) continue
    const cells = row.querySelectorAll("td:not([aria-hidden])")
    if (cells.length === 0) continue

    const leftCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=left].diff-text-cell"
    )
    if (leftCell) {
      const raw = getChangesViewCellCode(leftCell)
      if (raw !== null) {
        beforeLines.push(raw.startsWith("-") ? raw.slice(1) : raw)
      }
    }

    const rightCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=right].diff-text-cell"
    )
    if (rightCell) {
      const raw = getChangesViewCellCode(rightCell)
      if (raw !== null) {
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

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseVersionsFromDiff(container: Element): ParsedVersions {
  if (container.hasAttribute("data-diff-anchor")) {
    return parseChangesViewDiff(container)
  }
  return parseFilesViewDiff(container)
}

