export function Stat({ styles, label, value, danger, warn, safe }) {
  const cls = [styles.statValue, danger ? styles.statDanger : "", warn ? styles.statWarn : "", safe ? styles.statSafe : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.statBox}>
      <span className={cls}>{value ?? 0}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export function InfoRow({ styles, label, value }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value || "—"}</span>
    </div>
  );
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function SslPanel({ ssl, styles }) {
  if (!ssl) return null;
  return (
    <div className={styles.viewCard}>
      <h3 className={styles.sectionLabel}>SSL Certificate</h3>
      {ssl.error ? (
        <p className={styles.empty}>{ssl.error}</p>
      ) : (
        <>
          <div className={styles.infoGrid}>
            <InfoRow styles={styles} label="Valid" value={ssl.valid ? "Yes ✅" : `No — ${ssl.authError || "invalid"}`} />
            <InfoRow styles={styles} label="Issuer" value={ssl.issuer} />
            <InfoRow styles={styles} label="Subject" value={ssl.subject} />
            <InfoRow styles={styles} label="Valid From" value={formatDate(ssl.validFrom)} />
            <InfoRow styles={styles} label="Valid To" value={formatDate(ssl.validTo)} />
            <InfoRow
              styles={styles}
              label="Expiry"
              value={ssl.isExpired ? "Expired ⚠️" : `${ssl.daysRemaining} din baaki hain`}
            />
            <InfoRow styles={styles} label="Self-Signed" value={ssl.selfSigned ? "Yes ⚠️" : "No"} />
            <InfoRow styles={styles} label="Protocol" value={ssl.protocol} />
            <InfoRow styles={styles} label="Cipher" value={ssl.cipher} />
            <InfoRow styles={styles} label="SAN Domains" value={ssl.san?.length ? ssl.san.join(", ") : "—"} />
          </div>
        </>
      )}
    </div>
  );
}

export function HeadersPanel({ headersData, styles }) {
  if (!headersData) return null;
  if (headersData.error) {
    return (
      <div className={styles.viewCard}>
        <h3 className={styles.sectionLabel}>Security Headers</h3>
        <p className={styles.empty}>{headersData.error}</p>
      </div>
    );
  }
  return (
    <div className={styles.viewCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 className={styles.sectionLabel} style={{ margin: 0 }}>
          Security Headers
        </h3>
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 13,
            padding: "3px 12px",
            borderRadius: 999,
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {headersData.grade} · {headersData.percent}%
        </span>
      </div>
      <div className={styles.engineList}>
        {headersData.checks.map((c, i) => (
          <div key={i} className={styles.engineRow}>
            <span className={styles.engineName}>{c.label}</span>
            <span className={`${styles.engineTag} ${c.present ? styles.tagSafe : styles.tagWarn}`}>
              {c.present ? "Present" : "Missing"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThreatIntelPanel({ safeBrowsing, styles }) {
  if (!safeBrowsing || safeBrowsing.skipped) return null;
  return (
    <div className={styles.viewCard}>
      <h3 className={styles.sectionLabel}>Google Safe Browsing</h3>
      {safeBrowsing.flagged ? (
        <p className={styles.errorText}>
          Flagged: {safeBrowsing.threats.map((t) => t.type).join(", ")}
        </p>
      ) : (
        <p className={styles.empty}>Koi threat flag nahi mila ✅</p>
      )}
    </div>
  );
}
