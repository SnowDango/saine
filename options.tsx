import { useEffect, useState } from "react"

const PAT_KEY = "github_pat"
const PAT_CREATE_URL = "https://github.com/settings/tokens/new"

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "loading" | "connected" | "disconnected"

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  page: {
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
    maxWidth: 600,
    margin: "0 auto",
    padding: "32px 24px",
    color: "#24292f",
    fontSize: 14,
    lineHeight: 1.5,
  } as React.CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
  lead: { color: "#656d76", marginBottom: 28, fontSize: 13 } as React.CSSProperties,
  card: {
    border: "1px solid #d0d7de",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 20,
  } as React.CSSProperties,
  h2: { fontSize: 15, fontWeight: 600, marginBottom: 6, marginTop: 0 } as React.CSSProperties,
  sub: { color: "#656d76", fontSize: 13, marginBottom: 16 } as React.CSSProperties,
  badgeGreen: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "#dafbe1",
    border: "1px solid #82cfaa",
    borderRadius: 6,
    marginBottom: 14,
    fontSize: 13,
  } as React.CSSProperties,
  badgeYellow: {
    padding: "10px 14px",
    background: "#fff8c5",
    border: "1px solid #d4a017",
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 13,
    color: "#633c01",
  } as React.CSSProperties,
  btnPrimary: {
    fontSize: 13,
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #6e40c9",
    background: "#6e40c9",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,
  btnDanger: {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #d0d7de",
    background: "#fff",
    cursor: "pointer",
    color: "#cf222e",
  } as React.CSSProperties,
  guideCard: {
    border: "1px solid #d0d7de",
    borderRadius: 8,
    padding: "20px 24px",
    background: "#f6f8fa",
  } as React.CSSProperties,
  ol: { fontSize: 13, lineHeight: 1.8, paddingLeft: 20, margin: 0 } as React.CSSProperties,
  permBox: {
    margin: "6px 0 0",
    padding: "10px 12px",
    background: "#f6f1ff",
    border: "1px solid #d2b4f5",
    borderRadius: 6,
    fontSize: 12,
  } as React.CSSProperties,
  badge: (bg: string) => ({
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 4,
    background: bg,
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 4,
  } as React.CSSProperties),
  code: {
    background: "#f6f8fa",
    border: "1px solid #d0d7de",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: 11,
    fontFamily: "ui-monospace,SFMono-Regular,monospace",
  } as React.CSSProperties,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  const [status, setStatus] = useState<Status>("loading")
  const [maskedPat, setMaskedPat] = useState<string>("")
  const [manualPat, setManualPat] = useState<string>("")
  const [manualError, setManualError] = useState<string>("")

  useEffect(() => {
    chrome.storage.local.get(PAT_KEY, (result) => {
      const pat: string | undefined = result[PAT_KEY]
      if (pat) {
        setMaskedPat(pat.slice(0, 14) + "••••••••••••")
        setStatus("connected")
      } else {
        setStatus("disconnected")
      }
    })

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!(PAT_KEY in changes)) return
      const pat: string | undefined = changes[PAT_KEY].newValue
      if (pat) {
        setMaskedPat(pat.slice(0, 14) + "••••••••••••")
        setStatus("connected")
      } else {
        setMaskedPat("")
        setStatus("disconnected")
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const openPatCreation = () => {
    chrome.tabs.create({ url: PAT_CREATE_URL })
  }

  const disconnect = () => {
    chrome.storage.local.remove(PAT_KEY)
  }

  const savePat = () => {
    const trimmed = manualPat.trim()
    if (!trimmed) {
      setManualError("トークンを入力してください")
      return
    }
    if (!/^gh[ops]_[A-Za-z0-9]{36,}$/.test(trimmed)) {
      setManualError("トークンの形式が正しくありません (ghp_... の形式)")
      return
    }
    setManualError("")
    chrome.storage.local.set({ [PAT_KEY]: trimmed })
    setManualPat("")
  }

  if (status === "loading") {
    return <div style={s.page}>読み込み中...</div>
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Saine 設定</h1>
      <p style={s.lead}>Android Vector Drawable を GitHub PR 上でプレビューする拡張機能</p>

      {/* ── PAT status card ── */}
      <div style={s.card}>
        <h2 style={s.h2}>GitHub Personal Access Token</h2>
        <p style={s.sub}>
          プライベートリポジトリのプレビューに必要です。
          Fine-grained PAT を使用することで、権限を読み取り専用に限定できます。
        </p>

        {status === "connected" ? (
          <>
            <div style={s.badgeGreen}>
              <span style={{ color: "#1a7f37", fontWeight: 700 }}>✓ 接続済み</span>
              <code style={{ ...s.code, marginLeft: "auto" }}>{maskedPat}</code>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={s.btnPrimary} onClick={openPatCreation}>
                トークンを再作成する
              </button>
              <button style={s.btnDanger} onClick={disconnect}>
                トークンを削除
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={s.badgeYellow}>
              未接続 — プライベートリポジトリではプレビューに制限があります
            </div>
            <button style={s.btnPrimary} onClick={openPatCreation}>
              GitHub でトークンを作成する →
            </button>

            {/* 手動入力欄 */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #d0d7de" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#24292f", fontWeight: 600 }}>
                トークンを手動で貼り付ける
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#656d76" }}>
                GitHub でトークンを生成後、ここに貼り付けて保存できます。
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  value={manualPat}
                  onChange={(e) => { setManualPat(e.target.value); setManualError("") }}
                  onKeyDown={(e) => e.key === "Enter" && savePat()}
                  placeholder="ghp_..."
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: manualError ? "1px solid #cf222e" : "1px solid #d0d7de",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    outline: "none",
                  }}
                />
                <button style={s.btnPrimary} onClick={savePat}>
                  保存
                </button>
              </div>
              {manualError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#cf222e" }}>{manualError}</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Setup guide ── */}
      <div style={s.guideCard}>
        <h2 style={s.h2}>設定手順（Classic Token 推奨）</h2>
        <p style={{ ...s.sub, marginBottom: 12 }}>
          Organization の SAML SSO に対応するため、Classic Token の使用を推奨します。
        </p>
        <ol style={s.ol}>
          <li>「GitHub でトークンを作成する」ボタンをクリック</li>
          <li>
            <strong>Note</strong> に任意の名前を入力
            <br />
            <code style={s.code}>Saine Extension</code>
          </li>
          <li>
            <strong>Expiration</strong> で有効期限を選択
          </li>
          <li>
            <strong>Select scopes</strong> を以下の通り設定
            <div style={s.permBox}>
              <div style={{ color: "#6e40c9", fontWeight: 700, marginBottom: 4 }}>
                ✅ 必要なスコープ
              </div>
              <div>
                <span style={s.badge("#1a7f37")}>repo</span>
                <span style={{ marginLeft: 6, fontSize: 12, color: "#24292f" }}>
                  — プライベートリポジトリの読み取り
                </span>
              </div>
              <div style={{ marginTop: 6, color: "#656d76", fontSize: 11 }}>
                他のスコープはチェック不要です
              </div>
            </div>
          </li>
          <li>
            「<strong>Generate token</strong>」をクリック<br />
            <span style={{ color: "#656d76" }}>→ トークンが自動的に Saine に保存されます</span>
          </li>
          <li>
            SAML SSO が必要な場合は、Organization の{" "}
            <strong>Settings → Personal access tokens</strong> から<br />
            作成したトークンを <strong>認可</strong> する
          </li>
        </ol>
      </div>
    </div>
  )
}
