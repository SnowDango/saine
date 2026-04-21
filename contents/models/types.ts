// ─── Shared types ─────────────────────────────────────────────────────────────

export interface ParsedVersions {
  before: string | null
  after: string | null
  isComplete: boolean
}

export interface PrUrlInfo {
  org: string
  repo: string
  prNumber: string
}

export interface BlobUrlInfo {
  org: string
  repo: string
  ref: string
  path: string
}

export interface PrRefs {
  base: string | null
  head: string | null
}

export type ChangeType = "added" | "modified" | "deleted"

export interface PreviewData {
  baseSvg: string | null
  headSvg: string | null
  changeType: ChangeType
  isComplete: boolean
}

