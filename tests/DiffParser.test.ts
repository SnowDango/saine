import { describe, it, expect } from "vitest"
import { parseVersionsFromDiff } from "~contents/models/DiffParser"

// ─── Helper: GitHub /files view (unified diff) の DOM を構築 ──────────────────

function buildUnifiedDiffContainer(
  lines: { marker: " " | "-" | "+"; text: string }[],
  opts?: { expandable?: boolean; deferred?: boolean }
): Element {
  const container = document.createElement("div")
  container.classList.add("file")

  if (opts?.deferred) {
    const deferred = document.createElement("div")
    deferred.setAttribute("data-deferred-diff-type", "")
    container.appendChild(deferred)
    return container
  }

  const table = document.createElement("table")
  table.classList.add("diff-table")
  container.appendChild(table)

  if (opts?.expandable) {
    const expandRow = document.createElement("tr")
    expandRow.classList.add("js-expandable-line")
    const td = document.createElement("td")
    expandRow.appendChild(td)
    table.appendChild(expandRow)
  }

  for (const { marker, text } of lines) {
    const tr = document.createElement("tr")
    const td = document.createElement("td")
    td.classList.add("blob-code")
    const span = document.createElement("span")
    span.classList.add("blob-code-inner")
    span.setAttribute("data-code-marker", marker)
    span.textContent = text
    td.appendChild(span)
    tr.appendChild(td)
    table.appendChild(tr)
  }

  return container
}

// ─── Helper: GitHub /files view (split diff) の DOM を構築 ────────────────────

function buildSplitDiffContainer(
  rows: { left?: { marker: " " | "-"; text: string }; right?: { marker: " " | "+"; text: string } }[]
): Element {
  const container = document.createElement("div")
  container.classList.add("file")

  const table = document.createElement("table")
  table.classList.add("diff-table")
  container.appendChild(table)

  for (const row of rows) {
    const tr = document.createElement("tr")

    // left cell
    const tdLeft = document.createElement("td")
    tdLeft.classList.add("blob-code")
    if (row.left) {
      const span = document.createElement("span")
      span.classList.add("blob-code-inner")
      span.setAttribute("data-code-marker", row.left.marker)
      span.textContent = row.left.text
      tdLeft.appendChild(span)
    }
    tr.appendChild(tdLeft)

    // right cell
    const tdRight = document.createElement("td")
    tdRight.classList.add("blob-code")
    if (row.right) {
      const span = document.createElement("span")
      span.classList.add("blob-code-inner")
      span.setAttribute("data-code-marker", row.right.marker)
      span.textContent = row.right.text
      tdRight.appendChild(span)
    }
    tr.appendChild(tdRight)

    table.appendChild(tr)
  }

  return container
}

// ─── Helper: GitHub /changes view の DOM を構築 ───────────────────────────────

function buildChangesViewContainer(
  rows: { left?: string; right?: string }[],
  opts?: { multipleHunks?: boolean }
): Element {
  const container = document.createElement("div")
  container.setAttribute("data-diff-anchor", "")

  // hunk header
  const hunkRow = document.createElement("tr")
  const hunkTd = document.createElement("td")
  hunkTd.setAttribute("colspan", "4")
  hunkTd.textContent = "@@ -1,5 +1,5 @@"
  hunkRow.appendChild(hunkTd)
  container.appendChild(hunkRow)

  if (opts?.multipleHunks) {
    const hunkRow2 = document.createElement("tr")
    const hunkTd2 = document.createElement("td")
    hunkTd2.setAttribute("colspan", "4")
    hunkTd2.textContent = "@@ -10,3 +10,3 @@"
    hunkRow2.appendChild(hunkTd2)
    container.appendChild(hunkRow2)
  }

  for (const row of rows) {
    const tr = document.createElement("tr")

    // non-hidden cells (for querySelectorAll("td:not([aria-hidden])"))
    const spacer = document.createElement("td")
    spacer.setAttribute("aria-hidden", "true")
    tr.appendChild(spacer)

    if (row.left !== undefined) {
      const td = document.createElement("td")
      td.setAttribute("data-diff-side", "left")
      td.classList.add("diff-text-cell")
      const code = document.createElement("code")
      code.classList.add("diff-text")
      code.textContent = row.left
      td.appendChild(code)
      tr.appendChild(td)
    }

    if (row.right !== undefined) {
      const td = document.createElement("td")
      td.setAttribute("data-diff-side", "right")
      td.classList.add("diff-text-cell")
      const code = document.createElement("code")
      code.classList.add("diff-text")
      code.textContent = row.right
      td.appendChild(code)
      tr.appendChild(td)
    }

    // need at least one non-hidden td
    if (row.left === undefined && row.right === undefined) {
      const td = document.createElement("td")
      tr.appendChild(td)
    }

    container.appendChild(tr)
  }

  return container
}

// ─── Tests: Unified diff (files view) ─────────────────────────────────────────

describe("parseVersionsFromDiff — files view (unified)", () => {
  it("added / removed / context 行を正しく分離する", () => {
    const container = buildUnifiedDiffContainer([
      { marker: " ", text: "<vector>" },
      { marker: "-", text: '  fillColor="#FF0000"' },
      { marker: "+", text: '  fillColor="#00FF00"' },
      { marker: " ", text: "</vector>" },
    ])
    const result = parseVersionsFromDiff(container)
    expect(result.before).toBe('<vector>\n  fillColor="#FF0000"\n</vector>')
    expect(result.after).toBe('<vector>\n  fillColor="#00FF00"\n</vector>')
    expect(result.isComplete).toBe(true)
  })

  it("全行が追加のみ (新規ファイル) の場合、before は null", () => {
    const container = buildUnifiedDiffContainer([
      { marker: "+", text: "<vector>" },
      { marker: "+", text: "  <path/>" },
      { marker: "+", text: "</vector>" },
    ])
    const result = parseVersionsFromDiff(container)
    expect(result.before).toBeNull()
    expect(result.after).toBe("<vector>\n  <path/>\n</vector>")
  })

  it("全行が削除のみの場合、after は null", () => {
    const container = buildUnifiedDiffContainer([
      { marker: "-", text: "<vector>" },
      { marker: "-", text: "</vector>" },
    ])
    const result = parseVersionsFromDiff(container)
    expect(result.before).toBe("<vector>\n</vector>")
    expect(result.after).toBeNull()
  })

  it("展開可能な行がある場合、isComplete は false", () => {
    const container = buildUnifiedDiffContainer(
      [{ marker: " ", text: "line" }],
      { expandable: true }
    )
    const result = parseVersionsFromDiff(container)
    expect(result.isComplete).toBe(false)
  })

  it("deferred diff は null/null/false を返す", () => {
    const container = buildUnifiedDiffContainer([], { deferred: true })
    const result = parseVersionsFromDiff(container)
    expect(result).toEqual({ before: null, after: null, isComplete: false })
  })

  it("テーブルがない場合は null/null/false を返す", () => {
    const container = document.createElement("div")
    container.classList.add("file")
    const result = parseVersionsFromDiff(container)
    expect(result).toEqual({ before: null, after: null, isComplete: false })
  })
})

// ─── Tests: Split diff (files view) ──────────────────────────────────────────

describe("parseVersionsFromDiff — files view (split)", () => {
  it("左右カラムを正しく分離する", () => {
    const container = buildSplitDiffContainer([
      { left: { marker: " ", text: "<vector>" }, right: { marker: " ", text: "<vector>" } },
      { left: { marker: "-", text: "old" }, right: { marker: "+", text: "new" } },
      { left: { marker: " ", text: "</vector>" }, right: { marker: " ", text: "</vector>" } },
    ])
    const result = parseVersionsFromDiff(container)
    expect(result.before).toBe("<vector>\nold\n</vector>")
    expect(result.after).toBe("<vector>\nnew\n</vector>")
  })
})

// ─── Tests: Changes view diff ─────────────────────────────────────────────────

describe("parseVersionsFromDiff — changes view", () => {
  it("左右セルのコードを正しく分離する", () => {
    const container = buildChangesViewContainer([
      { left: " context", right: " context" },
      { left: "-removed", right: "+added" },
    ])
    const result = parseVersionsFromDiff(container)
    expect(result.before).toBe(" context\nremoved")
    expect(result.after).toBe(" context\nadded")
    expect(result.isComplete).toBe(true)
  })

  it("複数 hunk がある場合、isComplete は false", () => {
    const container = buildChangesViewContainer(
      [{ left: " line", right: " line" }],
      { multipleHunks: true }
    )
    const result = parseVersionsFromDiff(container)
    expect(result.isComplete).toBe(false)
  })

  it("行がなければ null/null/false", () => {
    const container = document.createElement("div")
    container.setAttribute("data-diff-anchor", "")
    const result = parseVersionsFromDiff(container)
    expect(result).toEqual({ before: null, after: null, isComplete: false })
  })
})

