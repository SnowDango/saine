import type { BlobUrlInfo, PrUrlInfo } from "../models/types"

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * URL が GitHub PR ページかどうかを判定する。
 */
export function isPrPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)
}

/**
 * URL が GitHub blob（ファイル閲覧）ページかどうかを判定する。
 */
export function isBlobPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/blob\//.test(url)
}

/**
 * blob URL から org / repo / ref / path を抽出する。blob URL でなければ null を返す。
 */
export function parseBlobUrlInfo(url: string): BlobUrlInfo | null {
  // Note: branch names containing "/" are resolved to the first segment only.
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/([^?#]+)/)
  return m ? { org: m[1], repo: m[2], ref: m[3], path: m[4] } : null
}

/**
 * PR URL から org / repo / prNumber を抽出する。PR URL でなければ null を返す。
 */
export function parsePrUrlInfo(url: string): PrUrlInfo | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  return m ? { org: m[1], repo: m[2], prNumber: m[3] } : null
}
