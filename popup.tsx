import { useEffect, useState } from "react"

type Status = "idle" | "success" | "error" | "not-github"

interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
}

function IndexPopup() {
  const [status, setStatus] = useState<Status>("idle")
  const [withReload, setWithReload] = useState(true)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_UPDATE_INFO" }, (info) => {
      if (info) setUpdateInfo(info)
    })
  }, [])

  const handleCheckUpdate = () => {
    chrome.runtime.sendMessage({ type: "CHECK_UPDATE" }, (info) => {
      if (info) setUpdateInfo(info)
    })
  }

  const handleClearCache = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 2500)
        return
      }

      const url = tab.url ?? ""
      if (!/github\.com\/.+\/pull\/\d+/.test(url)) {
        setStatus("not-github")
        setTimeout(() => setStatus("idle"), 2500)
        return
      }

      await chrome.tabs.sendMessage(tab.id, { type: "CLEAR_CACHE", rescan: !withReload })

      if (withReload) {
        await chrome.tabs.reload(tab.id)
        // リロード後はポップアップが閉じるので表示不要
        return
      }

      setStatus("success")
      setTimeout(() => setStatus("idle"), 2500)
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 2500)
    }
  }

  const statusMessage: Record<Exclude<Status, "idle">, string> = {
    success: "キャッシュをクリアしました",
    error: "エラーが発生しました",
    "not-github": "GitHub PR ページで実行してください",
  }

  const statusColor: Record<Exclude<Status, "idle">, string> = {
    success: "#1a7f37",
    error: "#cf222e",
    "not-github": "#9a6700",
  }

  const isIdle = status === "idle"

  return (
    <div
      style={{
        width: 260,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        padding: "16px",
        boxSizing: "border-box",
      }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2328", marginBottom: 2 }}>
          Saine
        </div>
        <div style={{ fontSize: 12, color: "#57606a" }}>
          Android Vector Preview on GitHub
        </div>
      </div>

      {/* 更新通知バナー */}
      {updateInfo?.hasUpdate && (
        <a
          href={updateInfo.releaseUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            marginBottom: 12,
            background: "#ddf4ff",
            border: "1px solid #54aeff",
            borderRadius: 6,
            textDecoration: "none",
            color: "#0969da",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}>
          <span>🆕</span>
          <span>v{updateInfo.latestVersion} が利用可能です</span>
        </a>
      )}

      <hr style={{ border: "none", borderTop: "1px solid #d0d7de", margin: "0 0 16px" }} />

      {/* リロードオプション */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          cursor: "pointer",
          userSelect: "none",
        }}>
        <input
          type="checkbox"
          checked={withReload}
          onChange={(e) => setWithReload(e.target.checked)}
          style={{ cursor: "pointer", accentColor: "#0969da", width: 14, height: 14 }}
        />
        <span style={{ fontSize: 12, color: "#24292f" }}>削除後にページをリロード</span>
      </label>

      {/* キャッシュクリアボタン */}
      <button
        onClick={handleClearCache}
        disabled={!isIdle}
        style={{
          width: "100%",
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          color: isIdle ? "#24292f" : "#57606a",
          background: isIdle ? "#f6f8fa" : "#eaeef2",
          border: "1px solid #d0d7de",
          borderRadius: 6,
          cursor: isIdle ? "pointer" : "default",
          transition: "background 0.1s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}>
        <span>🗑</span>
        キャッシュをクリア
      </button>

      {/* ステータスメッセージ */}
      {status !== "idle" && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: statusColor[status],
            textAlign: "center",
          }}>
          {statusMessage[status]}
        </div>
      )}

      {/* バージョン情報 & 更新チェック */}
      <div style={{ marginTop: 16, borderTop: "1px solid #d0d7de", paddingTop: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
          <span style={{ fontSize: 11, color: "#8c959f" }}>
            v{updateInfo?.currentVersion ?? chrome.runtime.getManifest().version}
          </span>
          <button
            onClick={handleCheckUpdate}
            style={{
              fontSize: 11,
              color: "#0969da",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              borderRadius: 4,
              fontFamily: "inherit",
            }}>
            更新を確認
          </button>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
