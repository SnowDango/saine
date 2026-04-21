export function isExtensionValid(): boolean {
  try { return !!chrome.runtime?.id } catch { return false }
}

export function isContextInvalidated(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Extension context invalidated")
}
