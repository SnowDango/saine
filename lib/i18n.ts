/**
 * chrome.i18n.getMessage のラッパー。
 * テスト環境など chrome.i18n が利用できない場合は fallback を返す。
 */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    const msg = chrome.i18n.getMessage(key, substitutions)
    return msg || key
  } catch {
    return key
  }
}

