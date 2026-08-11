"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import styles from "./page.module.css";
import { normalizeUrl, stripUndefined, getCachedScan, setCachedScan } from "@/lib/linkChecker";
import { Stat, InfoRow, formatDate, SslPanel, HeadersPanel, ThreatIntelPanel } from "./components";

export default function LinkCheckerPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [inputUrl, setInputUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [servedFromCache, setServedFromCache] = useState(false);

  const [history, setHistory] = useState([]);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const saved = localStorage.getItem("dashboard-theme");
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("dashboard-theme", next);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "link_checks"), orderBy("checkedAt", "desc"), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  const runScan = useCallback(
    async (target) => {
      setScanning(true);
      setError("");
      setResult(null);
      setServedFromCache(false);

      try {
        setScanStage("VirusTotal, SSL, headers aur domain/hosting check ho raha hai...");

        const [vtData, domainData, ipData, sslData, headersData, safeBrowsingData] = await Promise.all([
          fetch("/api/link-checker/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
          fetch("/api/link-checker/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
          fetch("/api/link-checker/ip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
          fetch("/api/link-checker/ssl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
          fetch("/api/link-checker/headers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
          fetch("/api/link-checker/safebrowsing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }).then((r) => r.json()),
        ]);

        const combined = {
          url: target,
          vt: vtData,
          domain: domainData,
          ip: ipData,
          ssl: sslData,
          headersData,
          safeBrowsing: safeBrowsingData,
          scannedAt: Date.now(),
        };

        setResult(combined);
        setCachedScan(target, combined); // session me dobara scan na ho

        if (user) {
          await addDoc(
            collection(db, "users", user.uid, "link_checks"),
            stripUndefined({
              url: target,
              verdict: vtData.verdict || "unknown",
              stats: vtData.stats || null,
              domain: domainData.domain || null,
              registrar: domainData.registrar || null,
              isp: ipData.isp || null,
              country: ipData.country || null,
              sslGrade: sslData.error ? null : sslData.isExpired ? "expired" : "ok",
              headersGrade: headersData.grade || null,
              // Poora result cache ke liye — dobara click pe rescan avoid karne ke liye
              cachedResult: combined,
              checkedAt: serverTimestamp(),
            })
          );
        }
      } catch (err) {
        console.error(err);
        setError("Scan fail ho gaya. Thodi der baad try karo.");
      } finally {
        setScanning(false);
        setScanStage("");
      }
    },
    [user]
  );

  const handleScan = useCallback(
    (urlToScan) => {
      const target = normalizeUrl(urlToScan || inputUrl);
      if (!target) return;

      const cached = getCachedScan(target);
      if (cached) {
        setResult(cached);
        setServedFromCache(true);
        setError("");
        return;
      }
      runScan(target);
    },
    [inputUrl, runScan]
  );

  // History item pe click karne se cached data load hota hai — rescan NAHI hota
  const handleHistoryClick = (h) => {
    setInputUrl(h.url);
    if (h.cachedResult) {
      setResult(h.cachedResult);
      setServedFromCache(true);
      setCachedScan(h.url, h.cachedResult); // session cache bhi warm kar do
      setError("");
    } else {
      // Purana record hai jisme full cache save nahi hui thi — sirf isi case me rescan
      runScan(normalizeUrl(h.url));
    }
  };

  const handleForceRescan = () => {
    if (!result?.url) return;
    runScan(normalizeUrl(result.url));
  };

  const handleDeleteHistory = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "link_checks", id));
  };

  if (authLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className={styles.page} data-theme={theme}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push("/dashboard")}>
          ← Back
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🛡️</div>
          <span>Link Checker</span>
        </div>
        <button className={styles.themeBtn} onClick={toggleTheme}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.scanCard}>
            <h2 className={styles.cardTitle}>Link Safety Check</h2>
            <p className={styles.cardSubtitle}>
              Koi bhi URL paste karo — malware, phishing, SSL, security headers aur full domain/hosting history check ho jayegi.
            </p>
            <div className={styles.scanRow}>
              <input
                className={styles.input}
                type="text"
                placeholder="https://example.com ya example.com"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !scanning && handleScan()}
                disabled={scanning}
              />
              <button className={styles.scanBtn} onClick={() => handleScan()} disabled={scanning || !inputUrl.trim()}>
                {scanning ? "Scanning..." : "Scan Link"}
              </button>
            </div>
            {scanning && (
              <div className={styles.scanProgress}>
                <div className={styles.miniSpinner} />
                <span>{scanStage}</span>
              </div>
            )}
            {error && <p className={styles.errorText}>{error}</p>}
          </div>

          {result && (
            <>
              {servedFromCache && (
                <div className={styles.scanProgress} style={{ margin: 0 }}>
                  <span>⚡ Cached result dikhaya ja raha hai.</span>
                  <button className={styles.historyDelete} style={{ color: "var(--accent)" }} onClick={handleForceRescan}>
                    Force Rescan
                  </button>
                </div>
              )}
              <ResultPanel result={result} styles={styles} />
            </>
          )}

          {!result && !scanning && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <p>Upar link daal kar scan karo — verdict, antivirus engine results, SSL, security headers, domain history aur hosting details yahan dikhengi.</p>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.historyCard}>
            <h3 className={styles.sectionLabel}>Recent Scans</h3>
            {history.length === 0 && <p className={styles.empty}>Abhi koi scan history nahi hai.</p>}
            <div className={styles.historyList}>
              {history.map((h) => (
                <div key={h.id} className={styles.historyItem}>
                  <div className={styles.historyMain} onClick={() => handleHistoryClick(h)}>
                    <span
                      className={`${styles.dot} ${
                        h.verdict === "dangerous" ? styles.dotDanger : h.verdict === "suspicious" ? styles.dotWarn : styles.dotSafe
                      }`}
                    />
                    <div className={styles.historyText}>
                      <p className={styles.historyUrl}>{h.url}</p>
                      <span className={styles.historyMeta}>
                        {h.domain || ""} {h.country ? `· ${h.country}` : ""} {h.headersGrade ? `· Headers ${h.headersGrade}` : ""}
                      </span>
                    </div>
                  </div>
                  <button className={styles.historyDelete} onClick={() => handleDeleteHistory(h.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result, styles }) {
  const { vt, domain, ip, ssl, headersData, safeBrowsing } = result;

  const verdictConfig = {
    safe: { label: "Safe", color: styles.verdictSafe, icon: "✅" },
    suspicious: { label: "Suspicious", color: styles.verdictWarn, icon: "⚠️" },
    dangerous: { label: "Dangerous", color: styles.verdictDanger, icon: "🚫" },
    unknown: { label: "Unknown", color: styles.verdictUnknown, icon: "❔" },
  };
  const v = verdictConfig[vt?.verdict] || verdictConfig.unknown;

  return (
    <div className={styles.resultStack}>
      <div className={`${styles.verdictBanner} ${v.color}`}>
        <span className={styles.verdictIcon}>{v.icon}</span>
        <div>
          <p className={styles.verdictLabel}>{v.label}</p>
          <p className={styles.verdictUrl}>{result.url}</p>
        </div>
        {vt?.stats && (
          <div className={styles.statsGrid}>
            <Stat styles={styles} label="Malicious" value={vt.stats.malicious} danger />
            <Stat styles={styles} label="Suspicious" value={vt.stats.suspicious} warn />
            <Stat styles={styles} label="Harmless" value={vt.stats.harmless} safe />
            <Stat styles={styles} label="Undetected" value={vt.stats.undetected} />
          </div>
        )}
      </div>

      {vt?.error && <p className={styles.errorText}>VirusTotal: {vt.error}</p>}

      {vt?.engines?.length > 0 && (
        <div className={styles.viewCard}>
          <h3 className={styles.sectionLabel}>Flagged By</h3>
          <div className={styles.engineList}>
            {vt.engines.map((e, i) => (
              <div key={i} className={styles.engineRow}>
                <span className={styles.engineName}>{e.engine}</span>
                <span className={`${styles.engineTag} ${e.category === "malicious" ? styles.tagDanger : styles.tagWarn}`}>
                  {e.result || e.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vt?.permalink && (
        <a href={vt.permalink} target="_blank" rel="noopener noreferrer" className={styles.vtLink}>
          VirusTotal pe full report dekho →
        </a>
      )}

      <ThreatIntelPanel safeBrowsing={safeBrowsing} styles={styles} />
      <SslPanel ssl={ssl} styles={styles} />
      <HeadersPanel headersData={headersData} styles={styles} />

      <div className={styles.viewCard}>
        <h3 className={styles.sectionLabel}>Domain History</h3>
        {domain?.error ? (
          <p className={styles.empty}>{domain.error}</p>
        ) : (
          <div className={styles.infoGrid}>
            <InfoRow styles={styles} label="Domain" value={domain?.domain} />
            <InfoRow styles={styles} label="Registrar" value={domain?.registrar} />
            <InfoRow styles={styles} label="Registrant Org" value={domain?.registrantOrg} />
            <InfoRow styles={styles} label="Created On" value={formatDate(domain?.createdDate)} />
            <InfoRow styles={styles} label="Expires On" value={formatDate(domain?.expiryDate)} />
            <InfoRow styles={styles} label="Last Updated" value={formatDate(domain?.lastUpdated)} />
            <InfoRow styles={styles} label="Status" value={domain?.status?.length ? domain.status.join(", ") : "—"} />
            <InfoRow styles={styles} label="Nameservers" value={domain?.nameservers?.length ? domain.nameservers.join(", ") : "—"} />
          </div>
        )}
      </div>

      <div className={styles.viewCard}>
        <h3 className={styles.sectionLabel}>Hosting & Server Info</h3>
        {ip?.error ? (
          <p className={styles.empty}>{ip.error}</p>
        ) : (
          <div className={styles.infoGrid}>
            <InfoRow styles={styles} label="IP Address" value={ip?.ip} />
            <InfoRow styles={styles} label="ISP" value={ip?.isp} />
            <InfoRow styles={styles} label="Organization" value={ip?.org} />
            <InfoRow styles={styles} label="ASN" value={ip?.asn} />
            <InfoRow styles={styles} label="Location" value={[ip?.city, ip?.region, ip?.country].filter(Boolean).join(", ")} />
            <InfoRow styles={styles} label="Reverse DNS" value={ip?.reverseDns || "—"} />
            <InfoRow styles={styles} label="Datacenter / Hosting" value={ip?.isHostingDatacenter ? "Yes" : "No"} />
            <InfoRow styles={styles} label="Proxy / VPN Detected" value={ip?.isProxyOrVpn ? "Yes ⚠️" : "No"} />
          </div>
        )}
      </div>
    </div>
  );
}
