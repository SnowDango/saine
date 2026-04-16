interface ColorResult {
  color: string
  opacity: number
}

function parseAndroidColor(color: string): ColorResult {
  if (!color || color.startsWith("@") || color.startsWith("?")) {
    return { color: "none", opacity: 1 }
  }

  const raw = color.trim().replace(/^#/, "")

  if (raw.length === 8) {
    // AARRGGBB
    const alpha = parseInt(raw.substring(0, 2), 16) / 255
    return {
      color: "#" + raw.substring(2),
      opacity: Math.round(alpha * 1000) / 1000
    }
  }
  if (raw.length === 6) {
    return { color: "#" + raw, opacity: 1 }
  }
  if (raw.length === 4) {
    // ARGB shorthand
    const a = parseInt(raw[0] + raw[0], 16) / 255
    return {
      color: "#" + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3],
      opacity: Math.round(a * 1000) / 1000
    }
  }
  if (raw.length === 3) {
    return {
      color: "#" + raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2],
      opacity: 1
    }
  }

  return { color: "#000000", opacity: 1 }
}

function androidAttr(el: Element, name: string): string | null {
  return (
    el.getAttribute("android:" + name) ||
    el.getAttribute(name) ||
    null
  )
}

function buildGroupTransform(el: Element): string {
  const rotation = parseFloat(androidAttr(el, "rotation") ?? "0")
  const pivotX = parseFloat(androidAttr(el, "pivotX") ?? "0")
  const pivotY = parseFloat(androidAttr(el, "pivotY") ?? "0")
  const scaleX = parseFloat(androidAttr(el, "scaleX") ?? "1")
  const scaleY = parseFloat(androidAttr(el, "scaleY") ?? "1")
  const translateX = parseFloat(androidAttr(el, "translateX") ?? "0")
  const translateY = parseFloat(androidAttr(el, "translateY") ?? "0")

  const parts: string[] = []
  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${translateX} ${translateY})`)
  }
  if (rotation !== 0) {
    parts.push(`rotate(${rotation} ${pivotX} ${pivotY})`)
  }
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${scaleX} ${scaleY})`)
  }
  return parts.join(" ")
}

let idCounter = 0

function convertChildren(
  parent: Element,
  svgParent: Element,
  svgDoc: Document,
  defs: Element
): void {
  for (const child of Array.from(parent.children)) {
    const localName = child.tagName.split(":").pop()?.toLowerCase() ?? ""
    if (localName === "clip-path") continue
    const converted = convertElement(child, svgDoc, defs)
    if (converted) svgParent.appendChild(converted)
  }
}

function applyPathAttributes(
  el: Element,
  path: Element,
  defs: Element,
  svgDoc: Document
): void {
  const pathData = androidAttr(el, "pathData")
  if (pathData) path.setAttribute("d", pathData)

  const fillColor = androidAttr(el, "fillColor")
  if (fillColor) {
    if (fillColor.startsWith("#")) {
      const { color, opacity } = parseAndroidColor(fillColor)
      path.setAttribute("fill", color)
      if (opacity < 1) path.setAttribute("fill-opacity", String(opacity))
    } else {
      path.setAttribute("fill", "none")
    }
  } else {
    path.setAttribute("fill", "#000000")
  }

  const fillAlpha = androidAttr(el, "fillAlpha")
  if (fillAlpha) path.setAttribute("fill-opacity", fillAlpha)

  const fillType = androidAttr(el, "fillType")
  if (fillType) {
    path.setAttribute(
      "fill-rule",
      fillType.toLowerCase() === "evenodd" ? "evenodd" : "nonzero"
    )
  }

  const strokeColor = androidAttr(el, "strokeColor")
  if (strokeColor && strokeColor.startsWith("#")) {
    const { color, opacity } = parseAndroidColor(strokeColor)
    path.setAttribute("stroke", color)
    if (opacity < 1) path.setAttribute("stroke-opacity", String(opacity))
  }

  const strokeWidth = androidAttr(el, "strokeWidth")
  if (strokeWidth) path.setAttribute("stroke-width", strokeWidth)

  const strokeAlpha = androidAttr(el, "strokeAlpha")
  if (strokeAlpha) path.setAttribute("stroke-opacity", strokeAlpha)

  const strokeLineCap = androidAttr(el, "strokeLineCap")
  if (strokeLineCap) path.setAttribute("stroke-linecap", strokeLineCap.toLowerCase())

  const strokeLineJoin = androidAttr(el, "strokeLineJoin")
  if (strokeLineJoin) path.setAttribute("stroke-linejoin", strokeLineJoin.toLowerCase())

  const strokeMiterLimit = androidAttr(el, "strokeMiterLimit")
  if (strokeMiterLimit) path.setAttribute("stroke-miterlimit", strokeMiterLimit)
}

function convertElement(
  el: Element,
  svgDoc: Document,
  defs: Element
): Element | null {
  const localName = el.tagName.split(":").pop()?.toLowerCase() ?? ""

  if (localName === "path") {
    const path = svgDoc.createElementNS("http://www.w3.org/2000/svg", "path")
    applyPathAttributes(el, path, defs, svgDoc)
    return path
  }

  if (localName === "group") {
    const g = svgDoc.createElementNS("http://www.w3.org/2000/svg", "g")

    const transform = buildGroupTransform(el)
    if (transform) g.setAttribute("transform", transform)

    // Handle child clip-path
    const clipPathEl = Array.from(el.children).find(
      (c) => c.tagName.split(":").pop()?.toLowerCase() === "clip-path"
    )
    if (clipPathEl) {
      const clipId = `vdp_clip_${idCounter++}`
      const clipPath = svgDoc.createElementNS(
        "http://www.w3.org/2000/svg",
        "clipPath"
      )
      clipPath.setAttribute("id", clipId)
      const pd = androidAttr(clipPathEl, "pathData")
      if (pd) {
        const p = svgDoc.createElementNS("http://www.w3.org/2000/svg", "path")
        p.setAttribute("d", pd)
        clipPath.appendChild(p)
      }
      defs.appendChild(clipPath)
      g.setAttribute("clip-path", `url(#${clipId})`)
    }

    convertChildren(el, g, svgDoc, defs)
    return g
  }

  return null
}

export function isAndroidVectorDrawable(xml: string): boolean {
  return /<vector[\s>]/.test(xml) && /android:/.test(xml)
}

export function vectorDrawableToSvg(xmlString: string): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, "text/xml")

    if (doc.querySelector("parsererror")) return null

    const vector = doc.querySelector("vector")
    if (!vector) return null

    const width =
      (androidAttr(vector, "width") ?? "24dp").replace(/dp|px/g, "")
    const height =
      (androidAttr(vector, "height") ?? "24dp").replace(/dp|px/g, "")
    const vpW = androidAttr(vector, "viewportWidth") ?? width
    const vpH = androidAttr(vector, "viewportHeight") ?? height
    const alpha = androidAttr(vector, "alpha") ?? "1"

    const svgDoc = document.implementation.createDocument(
      "http://www.w3.org/2000/svg",
      "svg",
      null
    )
    const svg = svgDoc.documentElement
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    svg.setAttribute("width", width)
    svg.setAttribute("height", height)
    svg.setAttribute("viewBox", `0 0 ${vpW} ${vpH}`)
    if (parseFloat(alpha) < 1) svg.setAttribute("opacity", alpha)

    const defs = svgDoc.createElementNS("http://www.w3.org/2000/svg", "defs")
    svg.appendChild(defs)

    convertChildren(vector, svg, svgDoc, defs)

    return new XMLSerializer().serializeToString(svg)
  } catch {
    return null
  }
}
