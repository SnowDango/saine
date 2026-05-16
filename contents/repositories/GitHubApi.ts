// ─── Background fetch ─────────────────────────────────────────────────────────
//
// content script の fetch をすべて background service worker 経由で実行する。
// background の fetch はページの DevTools コンソールに表示されないため、
// 404 等のエラーがユーザーのコンソールを汚染しない。

export interface BgFetchResult {
  ok: boolean
  status: number
  text?: string
  data?: unknown
}

/**
 * fetch リクエストを background service worker 経由で実行する。
 * content script から直接 fetch すると 404 等のエラーがページの DevTools コンソールに
 * 表示されてしまうため、background で実行することでコンソールへの出力を抑制する。
 */
export function bgFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string> }
): Promise<BgFetchResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "FETCH_REQUEST",
        url,
        method: options?.method ?? "GET",
        headers: options?.headers ?? {},
      },
      (result: BgFetchResult | undefined) =>
        resolve(result ?? { ok: false, status: 0, text: "", data: null })
    )
  })
}

// ─── PAT storage ──────────────────────────────────────────────────────────────

/**
 * chrome.storage.local から PAT を毎回読み込む（キャッシュなし）。
 * キャッシュによる古い null 返却を防ぐため意図的に都度読み込む。
 */
export async function getStoredPat(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get("github_pat")
    return (result.github_pat as string | undefined) ?? null
  } catch {
    return null
  }
}

// ─── Raw file fetch ───────────────────────────────────────────────────────────

/**
 * GitHub の raw ファイル URL からテキストを取得して返す。
 * 取得に失敗した場合は null を返す。
 */
export async function fetchRawGithub(
  org: string,
  repo: string,
  ref: string,
  path: string
): Promise<string | null> {
  const url = `https://github.com/${org}/${repo}/raw/${ref}/${path}`
  const result = await bgFetch(url)
  return result.ok && result.text ? result.text : null
}
