import { describe, it, expect, beforeEach } from "vitest"
import { renderPanel, removePanel } from "~contents/views/PreviewPanelView"
import type { PreviewData } from "~contents/models/types"

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M0,0z" fill="#F00"/></svg>'

function makeContainer(): { container: HTMLElement; diffContent: HTMLElement } {
  const container = document.createElement("div")
  const header = document.createElement("div")
  header.classList.add("file-header")
  container.appendChild(header)
  const diffContent = document.createElement("div")
  diffContent.classList.add("js-file-content")
  diffContent.textContent = "diff code here"
  container.appendChild(diffContent)
  document.body.appendChild(container)
  return { container, diffContent }
}

beforeEach(() => {
  document.body.innerHTML = ""
})

// ─── renderPanel ──────────────────────────────────────────────────────────────

describe("renderPanel", () => {
  it("modified パネルを生成し diff コンテンツを非表示にする", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: SIMPLE_SVG,
      changeType: "modified",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)

    expect(diffContent.style.display).toBe("none")
    const panel = container.querySelector("[data-vdp-panel]")
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain("Image Diff")
    expect(panel!.textContent).toContain("BASE")
    expect(panel!.textContent).toContain("HEAD")
    expect(panel!.textContent).toContain("Before")
    expect(panel!.textContent).toContain("After")
  })

  it("added の場合、Before に n/a、After に ADDED バッジが表示される", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: null,
      headSvg: SIMPLE_SVG,
      changeType: "added",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)

    const panel = container.querySelector("[data-vdp-panel]")!
    expect(panel.textContent).toContain("n/a")
    expect(panel.textContent).toContain("ADDED")
    expect(panel.textContent).toContain("New file")
  })

  it("deleted の場合、After に DELETED バッジが表示される", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: null,
      changeType: "deleted",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)

    const panel = container.querySelector("[data-vdp-panel]")!
    expect(panel.textContent).toContain("DELETED")
    expect(panel.textContent).toContain("Deleted")
  })

  it("isComplete=false の場合、警告メッセージが表示される", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: SIMPLE_SVG,
      changeType: "modified",
      isComplete: false,
    }
    renderPanel(container, diffContent, data)

    const panel = container.querySelector("[data-vdp-panel]")!
    expect(panel.textContent).toContain("差分が省略されています")
  })

  it("SVG がある場合、light/dark 両方のボックスが生成される", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: SIMPLE_SVG,
      changeType: "modified",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)

    const svgs = container.querySelectorAll("[data-vdp-panel] svg")
    // Before: light + dark, After: light + dark = 4 SVGs
    expect(svgs.length).toBe(4)
  })

  it("トグルボタンで diff コンテンツの表示を切り替えられる", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: SIMPLE_SVG,
      changeType: "modified",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)

    const btn = container.querySelector("[data-vdp-panel] button") as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.textContent).toBe("コード差分を表示")
    expect(diffContent.style.display).toBe("none")

    btn.click()
    expect(diffContent.style.display).toBe("")
    expect(btn.textContent).toBe("コード差分を隠す")

    btn.click()
    expect(diffContent.style.display).toBe("none")
    expect(btn.textContent).toBe("コード差分を表示")
  })

  it("diffContent が null でもエラーにならない", () => {
    const { container } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: null,
      changeType: "deleted",
      isComplete: true,
    }
    expect(() => renderPanel(container, null, data)).not.toThrow()
    expect(container.querySelector("[data-vdp-panel]")).not.toBeNull()
  })
})

// ─── removePanel ──────────────────────────────────────────────────────────────

describe("removePanel", () => {
  it("パネルを削除し diff コンテンツの表示を復元する", () => {
    const { container, diffContent } = makeContainer()
    const data: PreviewData = {
      baseSvg: SIMPLE_SVG,
      headSvg: SIMPLE_SVG,
      changeType: "modified",
      isComplete: true,
    }
    renderPanel(container, diffContent, data)
    expect(container.querySelector("[data-vdp-panel]")).not.toBeNull()
    expect(diffContent.style.display).toBe("none")

    removePanel(container, diffContent)
    expect(container.querySelector("[data-vdp-panel]")).toBeNull()
    expect(diffContent.style.display).toBe("")
  })

  it("パネルがなくてもエラーにならない", () => {
    const { container, diffContent } = makeContainer()
    expect(() => removePanel(container, diffContent)).not.toThrow()
  })
})

