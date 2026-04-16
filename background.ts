const GITHUB_REPO = "SnowDango/saine"
const CHECK_INTERVAL_HOURS = 6

interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.split(".").map(Number)
  const l = latest.split(".").map(Number)
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] ?? 0
    const lv = l[i] ?? 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}

async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = chrome.runtime.getManifest().version

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    )
    if (!resp.ok) {
      return { hasUpdate: false, latestVersion: null, currentVersion, releaseUrl: null }
    }

    const data = await resp.json()
    const tagName: string = data.tag_name ?? ""
    const latestVersion = tagName.replace(/^v/, "").replace(/-\d+$/, "")
    const releaseUrl: string = data.html_url ?? `https://github.com/${GITHUB_REPO}/releases/latest`

    const hasUpdate = compareVersions(currentVersion, latestVersion)

    await chrome.storage.local.set({
      updateInfo: { hasUpdate, latestVersion, currentVersion, releaseUrl },
      lastUpdateCheck: Date.now(),
    })

    return { hasUpdate, latestVersion, currentVersion, releaseUrl }
  } catch {
    return { hasUpdate: false, latestVersion: null, currentVersion, releaseUrl: null }
  }
}

// 定期チェック用アラーム
chrome.alarms.create("check-update", { periodInMinutes: CHECK_INTERVAL_HOURS * 60 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-update") {
    checkForUpdate()
  }
})

// インストール・更新時に即チェック
chrome.runtime.onInstalled.addListener(() => {
  checkForUpdate()
})

// popup からのメッセージに応答
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHECK_UPDATE") {
    checkForUpdate().then(sendResponse)
    return true
  }
  if (message.type === "GET_UPDATE_INFO") {
    chrome.storage.local.get(["updateInfo"]).then((result) => {
      sendResponse(result.updateInfo ?? null)
    })
    return true
  }
})

