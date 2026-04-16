import { thirdPartyLicenses } from "./third-party-licenses"

function LicensePage() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        padding: "32px 24px",
        color: "#1f2328",
      }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Saine</h1>
      <p style={{ fontSize: 13, color: "#57606a", marginBottom: 24 }}>
        Third-Party Licenses
      </p>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #d0d7de", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>Package</th>
            <th style={{ padding: "8px 12px" }}>License</th>
            <th style={{ padding: "8px 12px" }}>Repository</th>
          </tr>
        </thead>
        <tbody>
          {thirdPartyLicenses.map((lib) => (
            <tr key={lib.name} style={{ borderBottom: "1px solid #d0d7de" }}>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>{lib.name}</td>
              <td style={{ padding: "8px 12px" }}>{lib.license}</td>
              <td style={{ padding: "8px 12px" }}>
                {lib.repository ? (
                  <a
                    href={lib.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#0969da", textDecoration: "none" }}>
                    {lib.repository}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default LicensePage

