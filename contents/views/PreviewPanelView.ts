import type { PreviewData } from "../models/types"

const PREVIEW_PX = 88

// ─── SVG id uniquification ────────────────────────────────────────────────────

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function uniquifySvgIds(svgHtml: string, scope: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgHtml, "image/svg+xml")
    const svg = doc.documentElement
    if (!svg || svg.localName === "parsererror" || svg.tagName.toLowerCase() !== "svg") {
      return svgHtml
    }

    const idMap = new Map<string, string>()
    let seq = 0
    svg.querySelectorAll<HTMLElement>("[id]").forEach((el) => {
      const oldId = el.getAttribute("id")
      if (!oldId) return
      const newId = `${scope}_${seq++}`
      idMap.set(oldId, newId)
      el.setAttribute("id", newId)
    })

    if (idMap.size === 0) {
      return new XMLSerializer().serializeToString(svg)
    }

    const rewriteValue = (value: string): string => {
      let out = value
      for (const [oldId, newId] of idMap) {
        out = out.replace(
          new RegExp(`url\\(#${escapeRegExp(oldId)}\\)`, "g"),
          `url(#${newId})`
        )
        if (out === `#${oldId}`) out = `#${newId}`
      }
      return out
    }

    svg.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attrName of [
        "clip-path", "fill", "stroke", "filter", "mask",
        "marker-start", "marker-mid", "marker-end",
        "href", "xlink:href", "style",
      ]) {
        const v = el.getAttribute(attrName)
        if (!v) continue
        const rewritten = rewriteValue(v)
        if (rewritten !== v) el.setAttribute(attrName, rewritten)
      }
    })

    return new XMLSerializer().serializeToString(svg)
  } catch {
    return svgHtml
  }
}

// ─── Element builders ─────────────────────────────────────────────────────────

function makeSvgBox(svgHtml: string, bg: string, border: string, scope: string): HTMLElement {
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
  inner.innerHTML = uniquifySvgIds(svgHtml, scope)
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
  emptyLabel: string,
  renderKey: string
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
    boxes.appendChild(makeSvgBox(svgHtml, "#ffffff", "#d0d7de", `${renderKey}_light`))
    boxes.appendChild(makeSvgBox(svgHtml, "#0d1117", "#30363d", `${renderKey}_dark`))
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

// ─── Public API ───────────────────────────────────────────────────────────────

let panelRenderSeq = 0

/**
 * プレビューパネルを生成し、指定したコンテナの diff コンテンツの前に挿入する。
 */
export function renderPanel(
  container: Element,
  diffContent: HTMLElement | null,
  data: PreviewData
): void {
  if (diffContent) diffContent.style.display = "none"

  const { baseSvg, headSvg, changeType, isComplete } = data

  const panel = document.createElement("div")
  const panelKey = `vdp_panel_${panelRenderSeq++}`
  panel.setAttribute("data-vdp-panel", "1")
  panel.style.cssText =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;border-bottom:1px solid #d0d7de;"

  // ── Header bar ──
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

  // ── Toggle button ──
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

  // ── Body ──
  const body = document.createElement("div")
  body.style.cssText = "display:flex;padding:16px 24px;background:#fff;"
  body.appendChild(
    makeColumn(
      "Before",
      changeType === "added" ? makeBadge("n/a", "#8c959f") : makeBadge("BASE", "#6e40c9"),
      baseSvg,
      changeType === "added" ? "New file" : "No preview",
      `${panelKey}_before`
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
      changeType === "deleted" ? "Deleted" : "No preview",
      `${panelKey}_after`
    )
  )
  panel.appendChild(body)

  const anchor = diffContent ?? container.querySelector(".file-header")
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor)
  } else {
    container.appendChild(panel)
  }
}

/**
 * コンテナ内のプレビューパネルを削除し、元の diff 表示を復元する。
 */
export function removePanel(container: Element, diffContent: HTMLElement | null): void {
  container.querySelectorAll("[data-vdp-panel]").forEach((p) => p.remove())
  if (diffContent) diffContent.style.display = ""
}


