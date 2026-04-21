import { describe, it, expect } from "vitest"
import { isAndroidVectorDrawable, vectorDrawableToSvg } from "~lib/vectorDrawable"

// ─── Sample VD XML ────────────────────────────────────────────────────────────

const SIMPLE_VD = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF0000"
      android:pathData="M12,2L2,22h20z"/>
</vector>`

const VD_WITH_GROUP = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="48"
    android:viewportHeight="48"
    android:alpha="0.8">
  <group
      android:rotation="45"
      android:pivotX="24"
      android:pivotY="24"
      android:scaleX="1.5"
      android:scaleY="1.5"
      android:translateX="2"
      android:translateY="3">
    <path
        android:fillColor="#00FF00"
        android:pathData="M0,0h48v48H0z"/>
  </group>
</vector>`

const VD_WITH_CLIP_PATH = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <group>
    <clip-path android:pathData="M0,0h24v24H0z"/>
    <path
        android:fillColor="#0000FF"
        android:pathData="M12,2L2,22h20z"/>
  </group>
</vector>`

const VD_WITH_STROKE = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FF000000"
      android:strokeColor="#80FFFFFF"
      android:strokeWidth="2"
      android:strokeAlpha="0.5"
      android:strokeLineCap="round"
      android:strokeLineJoin="bevel"
      android:strokeMiterLimit="4"
      android:fillAlpha="0.9"
      android:fillType="evenOdd"
      android:pathData="M12,2L2,22h20z"/>
</vector>`

const VD_ARGB_SHORTHAND = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#F00"
      android:pathData="M0,0h24v24H0z"/>
</vector>`

// ─── isAndroidVectorDrawable ──────────────────────────────────────────────────

describe("isAndroidVectorDrawable", () => {
  it("正しい VD XML を検出する", () => {
    expect(isAndroidVectorDrawable(SIMPLE_VD)).toBe(true)
  })

  it("android: 名前空間がなければ false", () => {
    const xml = `<vector><path pathData="M0,0h24v24H0z"/></vector>`
    expect(isAndroidVectorDrawable(xml)).toBe(false)
  })

  it("<vector> タグがなければ false", () => {
    const xml = `<LinearLayout android:layout_width="match_parent"/>`
    expect(isAndroidVectorDrawable(xml)).toBe(false)
  })

  it("空文字列は false", () => {
    expect(isAndroidVectorDrawable("")).toBe(false)
  })

  it("通常の Android レイアウト XML は false", () => {
    const xml = `
      <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
          android:layout_width="match_parent"
          android:layout_height="match_parent"/>`
    expect(isAndroidVectorDrawable(xml)).toBe(false)
  })
})

// ─── vectorDrawableToSvg ──────────────────────────────────────────────────────

describe("vectorDrawableToSvg", () => {
  it("シンプルな VD を SVG に変換する", () => {
    const svg = vectorDrawableToSvg(SIMPLE_VD)
    expect(svg).not.toBeNull()
    expect(svg).toContain("<svg")
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('width="24"')
    expect(svg).toContain('height="24"')
    expect(svg).toContain("<path")
    expect(svg).toContain('fill="#FF0000"')
    expect(svg).toContain('d="M12,2L2,22h20z"')
  })

  it("group の transform 属性を変換する", () => {
    const svg = vectorDrawableToSvg(VD_WITH_GROUP)
    expect(svg).not.toBeNull()
    expect(svg).toContain("<g")
    expect(svg).toContain("translate(2 3)")
    expect(svg).toContain("rotate(45 24 24)")
    expect(svg).toContain("scale(1.5 1.5)")
    expect(svg).toContain('opacity="0.8"')
    expect(svg).toContain('width="48"')
  })

  it("clip-path を defs に変換する", () => {
    const svg = vectorDrawableToSvg(VD_WITH_CLIP_PATH)
    expect(svg).not.toBeNull()
    expect(svg).toContain("<clipPath")
    expect(svg).toContain("<defs")
    expect(svg).toContain("url(#")
  })

  it("stroke 属性を変換する", () => {
    const svg = vectorDrawableToSvg(VD_WITH_STROKE)
    expect(svg).not.toBeNull()
    // AARRGGBB: #FF000000 → alpha=1.0, color=#000000
    expect(svg).toContain('fill="#000000"')
    // #80FFFFFF → alpha ≈ 0.502, color=#FFFFFF
    expect(svg).toContain('stroke="#FFFFFF"')
    expect(svg).toContain('stroke-width="2"')
    expect(svg).toContain('stroke-opacity="0.5"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('stroke-linejoin="bevel"')
    expect(svg).toContain('stroke-miterlimit="4"')
    expect(svg).toContain('fill-opacity="0.9"')
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it("3桁カラーコードに対応する", () => {
    const svg = vectorDrawableToSvg(VD_ARGB_SHORTHAND)
    expect(svg).not.toBeNull()
    expect(svg).toContain('fill="#FF0000"')
  })

  it("fillColor がない path は黒になる", () => {
    const xml = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:pathData="M0,0h24v24H0z"/>
</vector>`
    const svg = vectorDrawableToSvg(xml)
    expect(svg).toContain('fill="#000000"')
  })

  it("リソース参照カラー (@color/) は none になる", () => {
    const xml = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="@color/primary" android:pathData="M0,0h24v24H0z"/>
</vector>`
    const svg = vectorDrawableToSvg(xml)
    expect(svg).toContain('fill="none"')
  })

  it("テーマ属性参照 (?attr/) は none になる", () => {
    const xml = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="?attr/colorPrimary" android:pathData="M0,0h24v24H0z"/>
</vector>`
    const svg = vectorDrawableToSvg(xml)
    expect(svg).toContain('fill="none"')
  })

  it("<animated-vector> のインライン <vector> を変換できる", () => {
    const xml = `
<animated-vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt">
  <aapt:attr name="android:drawable">
    <vector
        android:width="24dp"
        android:height="24dp"
        android:viewportWidth="24"
        android:viewportHeight="24">
      <path android:fillColor="#FF0000" android:pathData="M12,2L2,22h20z"/>
    </vector>
  </aapt:attr>
</animated-vector>`
    expect(isAndroidVectorDrawable(xml)).toBe(true)
    const svg = vectorDrawableToSvg(xml)
    expect(svg).not.toBeNull()
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('width="24"')
    expect(svg).toContain('height="24"')
    expect(svg).toContain('fill="#FF0000"')
  })

  it("不正な XML は null を返す", () => {
    expect(vectorDrawableToSvg("not xml at all")).toBeNull()
  })

  it("<vector> がない XML は null を返す", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`
    expect(vectorDrawableToSvg(xml)).toBeNull()
  })

  it("width/height が px 単位でも動作する", () => {
    const xml = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="32px" android:height="32px"
    android:viewportWidth="32" android:viewportHeight="32">
  <path android:fillColor="#000" android:pathData="M0,0h32v32H0z"/>
</vector>`
    const svg = vectorDrawableToSvg(xml)
    expect(svg).toContain('width="32"')
    expect(svg).toContain('height="32"')
  })

  it("viewportWidth/Height がなければ width/height をフォールバックに使う", () => {
    const xml = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="16dp" android:height="16dp">
  <path android:fillColor="#000" android:pathData="M0,0z"/>
</vector>`
    const svg = vectorDrawableToSvg(xml)
    expect(svg).toContain('viewBox="0 0 16 16"')
  })
})

