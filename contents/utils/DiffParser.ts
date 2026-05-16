import type { ParsedVersions } from "../models/types"

// ─── Selectors ────────────────────────────────────────────────────────────────
//
// /files  view : file container は .file div
//                diff table は table.diff-table / .js-diff-table
//                行マーカー  は span[data-code-marker]
//
// /changes view (新) : file container は [data-diff-anchor] (diff table そのもの)
//                      行構造は <tr> + 行番号 td × 2 + td.diff-text-cell (常に right side)
//                      行タイプは行番号セルの有無で判定 (left有=before, right有=after)
//                      hunk header は <code class="diff-text-cell hunk">
//
// /changes view (旧) : file container は [data-diff-anchor] (diff table そのもの)
//                      行構造は <tr> + <td[data-diff-side]>.diff-text-cell × 1〜2
//                      行タイプは code.textContent の先頭文字 (- / + / それ以外)

// ─── /changes view diff parser ────────────────────────────────────────────────

/**
 * /changes ビューの diff セルから表示テキストを取得する。
 * 新 DOM では `code > .diff-text-inner`、旧 DOM では `code` 直下のテキストを返す。
 */
function getChangesViewCellCode(cell: HTMLElement): string | null {
  const codeEl = cell.querySelector<HTMLElement>("code.diff-text")
  if (!codeEl) return null
  // 新 DOM: code > div.diff-text-inner にテキストが入っている
  const inner = codeEl.querySelector<HTMLElement>(".diff-text-inner")
  return (inner ?? codeEl).textContent ?? ""
}

/**
 * `/changes` ビュー（`data-diff-anchor` コンテナ）の diff テーブルを解析して
 * before/after のテキストを復元する。新旧 DOM 構造の両方に対応する。
 */
function parseChangesViewDiff(table: Element): ParsedVersions {
  const rows = table.querySelectorAll<HTMLElement>("tr")
  if (rows.length === 0) return { before: null, after: null, isComplete: false }

  // 新 DOM: hunk header は <code class="diff-text-cell hunk">
  // 旧 DOM: hunk header は <td colspan="4">
  const hunkHeaders = table.querySelectorAll("code.diff-text-cell.hunk, td[colspan='4']")
  const isComplete = hunkHeaders.length <= 1

  const beforeLines: string[] = []
  const afterLines: string[] = []

  for (const row of rows) {
    if (row.querySelector("th")) continue
    if (row.querySelector("code.diff-text-cell.hunk, td[colspan='4']")) continue

    // DOM の種別判定: 行番号専用セル（.diff-text-cell を持たない data-diff-side td）が
    // あれば新 /changes view、なければ旧 /changes view として扱う
    const leftNumCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=left]:not(.diff-text-cell)"
    )
    const rightNumCell = row.querySelector<HTMLElement>(
      "td[data-diff-side=right]:not(.diff-text-cell)"
    )

    if (leftNumCell !== null || rightNumCell !== null) {
      // ── 新 /changes view: 1行につき td.diff-text-cell が1つだけ存在 ──
      //   left に番号あり  → before に含まれる行 (削除行 or 変更なし)
      //   right に番号あり → after  に含まれる行 (追加行 or 変更なし)
      const textCell = row.querySelector<HTMLElement>("td.diff-text-cell")
      if (textCell) {
        const text = getChangesViewCellCode(textCell)
        if (text !== null) {
          const hasLeft =
            leftNumCell !== null &&
            !leftNumCell.hasAttribute("aria-hidden") &&
            (leftNumCell.textContent?.trim() ?? "") !== ""
          const hasRight =
            rightNumCell !== null &&
            !rightNumCell.hasAttribute("aria-hidden") &&
            (rightNumCell.textContent?.trim() ?? "") !== ""
          if (hasLeft) beforeLines.push(text)
          if (hasRight) afterLines.push(text)
        }
      }
      continue
    }

    // ── 旧 /changes view: left/right で別々の td.diff-text-cell が存在 ──
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

/**
 * `/files` ビュー（`.file` コンテナ）の diff テーブルを解析して
 * before/after のテキストを復元する。split diff と unified diff の両方に対応する。
 */
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

/**
 * ファイルコンテナから diff を解析して before/after のテキストを返す。
 * `data-diff-anchor` 属性の有無でビュー種別を判定し、適切なパーサーに委譲する。
 */
export function parseVersionsFromDiff(container: Element): ParsedVersions {
  if (container.hasAttribute("data-diff-anchor")) {
    return parseChangesViewDiff(container)
  }
  return parseFilesViewDiff(container)
}

