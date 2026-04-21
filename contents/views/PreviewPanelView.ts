import type { PreviewData } from "../models/types"

import { t } from "~lib/i18n"

const MIN_PREVIEW_PX = 88
const MAX_PREVIEW_PX = 240

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

function parseSvgAspectRatio(svgHtml: string): { w: number; h: number } | null {
  const vbMatch = svgHtml.match(/viewBox=["']([^"']+)["']/)
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/)
    if (parts.length === 4) {
      const w = parseFloat(parts[2])
      const h = parseFloat(parts[3])
      if (w > 0 && h > 0) return { w, h }
    }
  }
  const wMatch = svgHtml.match(/\bwidth=["'](\d+(?:\.\d+)?)["']/)
  const hMatch = svgHtml.match(/\bheight=["'](\d+(?:\.\d+)?)["']/)
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1])
    const h = parseFloat(hMatch[1])
    if (w > 0 && h > 0) return { w, h }
  }
  return null
}


function calcSvgBoxDims(svgHtml: string, maxBoxWidth: number): { w: number; h: number } {
  const aspect = parseSvgAspectRatio(svgHtml)
  const ratio = aspect ? aspect.w / aspect.h : 1
  let svgW: number, svgH: number
  if (ratio >= 1) {
    svgW = Math.min(maxBoxWidth, MAX_PREVIEW_PX * ratio)
    svgH = Math.round(svgW / ratio)
  } else {
    svgH = Math.min(MAX_PREVIEW_PX, maxBoxWidth / ratio)
    svgW = Math.round(svgH * ratio)
  }
  return { w: Math.max(svgW, MIN_PREVIEW_PX), h: Math.max(svgH, MIN_PREVIEW_PX) }
}

function makeSvgBox(svgHtml: string, bg: string, border: string, scope: string, maxBoxWidth: number): HTMLElement {
  const aspect = parseSvgAspectRatio(svgHtml)
  const ratio = aspect ? aspect.w / aspect.h : 1

  let svgW: number
  let svgH: number
  if (ratio >= 1) {
    // wider or square: fill available width, compute height
    svgW = Math.min(maxBoxWidth, MAX_PREVIEW_PX * ratio)
    svgH = Math.round(svgW / ratio)
  } else {
    // taller: fill available height, compute width
    svgH = Math.min(MAX_PREVIEW_PX, maxBoxWidth / ratio)
    svgW = Math.round(svgH * ratio)
  }
  svgW = Math.max(svgW, MIN_PREVIEW_PX)
  svgH = Math.max(svgH, MIN_PREVIEW_PX)

  const box = document.createElement("div")
  box.style.cssText = `
    width:${svgW}px;height:${svgH}px;
    display:flex;align-items:center;justify-content:center;
    background:${bg};border:1px solid ${border};
    border-radius:6px;overflow:hidden;flex-shrink:0;
  `
  box.innerHTML = uniquifySvgIds(svgHtml, scope)
  const svgEl = box.querySelector("svg")
  if (svgEl) {
    // CSS でサイズを制御することで SVG の属性値（アニメーションのベース値）を壊さない
    ;(svgEl as SVGElement).style.cssText = "width:100%;height:100%;display:block;"
  }
  return box
}

function makeEmptyBox(label: string, height = MIN_PREVIEW_PX): HTMLElement {
  const box = document.createElement("div")
  box.style.cssText = `
    width:${MIN_PREVIEW_PX}px;height:${height}px;
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
  renderKey: string,
  maxBoxWidth: number,
  forcedBoxH?: number
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
  boxes.setAttribute("data-vdp-boxes", "1")
  boxes.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;"
  if (forcedBoxH) boxes.style.minHeight = `${forcedBoxH}px`
  if (svgHtml) {
    boxes.appendChild(makeSvgBox(svgHtml, "#ffffff", "#d0d7de", `${renderKey}_light`, maxBoxWidth))
    boxes.appendChild(makeSvgBox(svgHtml, "#0d1117", "#30363d", `${renderKey}_dark`, maxBoxWidth))
  } else {
    boxes.appendChild(makeEmptyBox(emptyLabel, forcedBoxH))
    boxes.appendChild(makeEmptyBox(emptyLabel, forcedBoxH))
  }
  col.appendChild(boxes)
  const hint = document.createElement("div")
  hint.textContent = "light / dark"
  hint.style.cssText = "font-size:11px;color:#8c959f;"
  col.appendChild(hint)
  const srcDims = svgHtml ? parseSvgAspectRatio(svgHtml) : null
  if (srcDims) {
    const dimsEl = document.createElement("div")
    dimsEl.textContent = `w:${Math.round(srcDims.w)} × h:${Math.round(srcDims.h)}`
    dimsEl.style.cssText = "font-size:11px;color:#8c959f;"
    col.appendChild(dimsEl)
  }
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
  panelTitle.textContent = t("panelTitle")
  panelTitle.style.cssText = "font-size:12px;font-weight:600;color:#1f2328;"
  left.appendChild(panelTitle)
  if (!isComplete) {
    const warn = document.createElement("span")
    warn.textContent = t("diffTruncated")
    warn.style.cssText =
      "font-size:11px;color:#9a6700;background:#fff8c5;padding:1px 6px;border-radius:4px;"
    left.appendChild(warn)
  }
  headerBar.appendChild(left)

  // ── Toggle button ──
  let codeVisible = false
  const toggleBtn = document.createElement("button")
  toggleBtn.textContent = t("showCodeDiff")
  toggleBtn.style.cssText = `
    font-size:12px;color:#0969da;background:none;border:none;
    cursor:pointer;padding:2px 6px;border-radius:4px;font-family:inherit;
  `
  toggleBtn.addEventListener("mouseenter", () => { toggleBtn.style.background = "#f3f4f6" })
  toggleBtn.addEventListener("mouseleave", () => { toggleBtn.style.background = "none" })
  toggleBtn.addEventListener("click", () => {
    codeVisible = !codeVisible
    if (diffContent) diffContent.style.display = codeVisible ? "" : "none"
    toggleBtn.textContent = codeVisible ? t("hideCodeDiff") : t("showCodeDiff")
  })
  headerBar.appendChild(toggleBtn)
  panel.appendChild(headerBar)

  // ── Body ──
  const body = document.createElement("div")
  body.style.cssText = "display:flex;align-items:center;padding:16px 24px;background:#fff;"

  const divider = document.createElement("div")
  divider.style.cssText = "width:1px;background:#d0d7de;margin:0 24px;flex-shrink:0;align-self:stretch;"

  const afterBadgeText =
    changeType === "added" ? "ADDED" : changeType === "deleted" ? "DELETED" : "HEAD"
  const afterBadgeColor =
    changeType === "added" ? "#1a7f37" : changeType === "deleted" ? "#cf222e" : "#0969da"

  const buildBody = (width: number) => {
    const bodyPadding = 24 * 2
    const dividerTotalWidth = 1 + 24 * 2
    const colWidth = Math.floor((width - bodyPadding - dividerTotalWidth) / 2)
    const boxGap = 8
    const mbw = Math.max(MIN_PREVIEW_PX, Math.floor((colWidth - boxGap) / 2))

    // Compute unified box height from both SVGs before creating elements
    const unifiedBoxH = Math.max(
      baseSvg ? calcSvgBoxDims(baseSvg, mbw).h : MIN_PREVIEW_PX,
      headSvg ? calcSvgBoxDims(headSvg, mbw).h : MIN_PREVIEW_PX
    )

    // Clear previous children
    body.innerHTML = ""

    body.appendChild(
      makeColumn(
        "Before",
        changeType === "added" ? makeBadge("n/a", "#8c959f") : makeBadge("BASE", "#6e40c9"),
        baseSvg,
        changeType === "added" ? t("newFile") : t("noPreview"),
        `${panelKey}_before`,
        mbw,
        unifiedBoxH
      )
    )
    body.appendChild(divider)
    body.appendChild(
      makeColumn(
        "After",
        makeBadge(afterBadgeText, afterBadgeColor),
        headSvg,
        changeType === "deleted" ? t("deleted") : t("noPreview"),
        `${panelKey}_after`,
        mbw,
        unifiedBoxH
      )
    )
  }

  // ── Responsive layout: switch to vertical when too narrow ──
  const VERTICAL_THRESHOLD = 500
  const applyLayout = (width: number) => {
    if (width < VERTICAL_THRESHOLD) {
      body.style.flexDirection = "column"
      body.style.alignItems = "stretch"
      body.style.gap = "16px"
      divider.style.cssText = "height:1px;background:#d0d7de;flex-shrink:0;"
    } else {
      body.style.flexDirection = "row"
      body.style.alignItems = ""
      body.style.gap = "0"
      divider.style.cssText = "width:1px;background:#d0d7de;margin:0 24px;flex-shrink:0;"
    }
  }
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applyLayout(entry.contentRect.width)
      }
    })
    ro.observe(body)
  }

  // Insert panel first so we can measure the accurate width synchronously
  panel.appendChild(body)
  const anchor = diffContent ?? container.querySelector(".file-header")
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor)
  } else {
    container.appendChild(panel)
  }

  // Measure accurate width after DOM insertion and build once
  const panelWidth = panel.getBoundingClientRect().width
    || (container as HTMLElement).getBoundingClientRect?.().width
    || (container as HTMLElement).offsetWidth
    || 800
  buildBody(panelWidth)
  applyLayout(panelWidth)
}

/**
 * コンテナ内のプレビューパネルを削除し、元の diff 表示を復元する。
 */
export function removePanel(container: Element, diffContent: HTMLElement | null): void {
  container.querySelectorAll("[data-vdp-panel]").forEach((p) => p.remove())
  if (diffContent) diffContent.style.display = ""
}

// ─── Blob single-file preview ─────────────────────────────────────────────────

const MAX_BLOB_PX = 480

/**
 * blob ページ用の大きめシングルビューパネルを生成し、
 * container の直前に挿入する。
 */
export function renderBlobPanel(container: Element, svgHtml: string): void {
  const seq = panelRenderSeq++

  const panel = document.createElement("div")
  panel.setAttribute("data-vdp-panel", "1")
  panel.style.cssText =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;border-bottom:1px solid #d0d7de;"

  // ── Header ──
  const headerBar = document.createElement("div")
  headerBar.style.cssText =
    "display:flex;align-items:center;padding:8px 16px;background:#f6f8fa;border-bottom:1px solid #d0d7de;"
  const titleEl = document.createElement("span")
  titleEl.textContent = t("panelTitle")
  titleEl.style.cssText = "font-size:12px;font-weight:600;color:#1f2328;"
  headerBar.appendChild(titleEl)
  panel.appendChild(headerBar)

  // ── Body ──
  const body = document.createElement("div")
  body.style.cssText = "padding:16px 24px;background:#fff;"

  const buildBody = (panelW: number) => {
    body.innerHTML = ""
    const boxGap = 16
    const bodyPadding = 24 * 2
    const mbw = Math.max(
      MIN_PREVIEW_PX,
      Math.min(MAX_BLOB_PX, Math.floor((panelW - bodyPadding - boxGap) / 2))
    )

    const row = document.createElement("div")
    row.style.cssText =
      "display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:flex-end;"

    const mkThemeCol = (bg: string, border: string, label: string, suffix: string) => {
      const col = document.createElement("div")
      col.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;"
      col.appendChild(makeSvgBox(svgHtml, bg, border, `vdp_blob_${seq}_${suffix}`, mbw))
      const lbl = document.createElement("span")
      lbl.textContent = label
      lbl.style.cssText = "font-size:11px;color:#8c959f;"
      col.appendChild(lbl)
      return col
    }

    row.appendChild(mkThemeCol("#ffffff", "#d0d7de", "light", "l"))
    row.appendChild(mkThemeCol("#0d1117", "#30363d", "dark", "d"))
    body.appendChild(row)

    const dims = parseSvgAspectRatio(svgHtml)
    if (dims) {
      const d = document.createElement("div")
      d.textContent = `w:${Math.round(dims.w)} × h:${Math.round(dims.h)}`
      d.style.cssText = "text-align:center;font-size:11px;color:#8c959f;margin-top:6px;"
      body.appendChild(d)
    }
  }

  panel.appendChild(body)
  container.insertAdjacentElement("beforebegin", panel)

  const w = panel.getBoundingClientRect().width || 800
  buildBody(w)

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) buildBody(entry.contentRect.width)
    })
    ro.observe(panel)
  }
}
