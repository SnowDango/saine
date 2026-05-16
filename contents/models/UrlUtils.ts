import type { BlobUrlInfo, PrUrlInfo } from "./types"

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function isPrPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)
}

export function isBlobPage(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/blob\//.test(url)
}

export function parseBlobUrlInfo(url: string): BlobUrlInfo | null {
  // Note: branch names containing "/" are resolved to the first segment only.
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/([^?#]+)/)
  return m ? { org: m[1], repo: m[2], ref: m[3], path: m[4] } : null
}

export function parsePrUrlInfo(url: string): PrUrlInfo | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  return m ? { org: m[1], repo: m[2], prNumber: m[3] } : null
}
