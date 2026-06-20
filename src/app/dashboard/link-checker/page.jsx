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

export default function LinkCheckerPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [inputUrl, setInputUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

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
    const q = query(
      collection(db, "users", user.uid, "link_checks"),
      orderBy("checkedAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  const handleScan = useCallback(
    async (urlToScan) => {
      const target = (urlToScan || inputUrl).trim();
      if (!target) return;

      setScanning(true);
      setError("");
      setResult(null);

      try {
        setScanStage("VirusTotal se malware/phishing check ho raha hai...");
        const vtPromise = fetch("/api/link-checker/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        }).then((r) => r.json());

        setScanStage("Domain registration history nikal rahe hain...");
        const domainPromise = fetch("/api/link-checker/domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        }).then((r) => r.json());

        setScanStage("Hosting aur server info check kar rahe hain...");
        const ipPromise = fetch("/api/link-checker/ip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        }).then((r) => r.json());

        const [vtData, domainData, ipData] = await Promise.all([
          vtPromise,
          domainPromise,
          ipPromise,
        ]);

        const combined = {
          url: target,
          vt: vtData,
          domain: domainData,
          ip: ipData,
        };

        setResult(combined);

        if (user) {
          await addDoc(collection(db, "users", user.uid, "link_checks"), {
            url: target,
            verdict: vtData.verdict || "unknown",
            stats: vtData.stats || null,
            domain: domainData.domain || null,
            registrar: domainData.registrar || null,
            isp: ipData.isp || null,
            country: ipData.country || null,
            checkedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error(err);
        setError("Scan fail ho gaya. Thodi der baad try karo.");
      } finally {
        setScanning(false);
        setScanStage("");
      }
    },
    [inputUrl, user]
  );

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
              Koi bhi URL paste karo — malware, phishing, aur full domain/hosting history check ho jayegi.
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
              <button
                className={styles.scanBtn}
                onClick={() => handleScan()}
                disabled={scanning || !inputUrl.trim()}
              >
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

          {result && <ResultPanel result={result} styles={styles} />}

          {!result && !scanning && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <p>Upar link daal kar scan karo — verdict, antivirus engine results, domain history aur hosting details yahan dikhengi.</p>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.historyCard}>
            <h3 className={styles.sectionLabel}>Recent Scans</h3>
            {history.length === 0 && (
              <p className={styles.empty}>Abhi koi scan history nahi hai.</p>
            )}
            <div className={styles.historyList}>
              {history.map((h) => (
                <div key={h.id} className={styles.historyItem}>
                  <div
                    className={styles.historyMain}
                    onClick={() => {
                      setInputUrl(h.url);
                      handleScan(h.url);
                    }}
                  >
                    <span
                      className={`${styles.dot} ${
                        h.verdict === "dangerous"
                          ? styles.dotDanger
                          : h.verdict === "suspicious"
                          ? styles.dotWarn
                          : styles.dotSafe
                      }`}
                    />
                    <div className={styles.historyText}>
                      <p className={styles.historyUrl}>{h.url}</p>
                      <span className={styles.historyMeta}>
                        {h.domain || ""} {h.country ? `· ${h.country}` : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.historyDelete}
                    onClick={() => handleDeleteHistory(h.id)}
                  >
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
  const { vt, domain, ip } = result;

  const verdictConfig = {
    safe: { label: "Safe", color: styles.verdictSafe, icon: "✅" },
    suspicious: { label: "Suspicious", color: styles.verdictWarn, icon: "⚠️" },
    dangerous: { label: "Dangerous", color: styles.verdictDanger, icon: "🚫" },
    unknown: { label: "Unknown", color: styles.verdictUnknown, icon: "❔" },
  };
  const v = verdictConfig[vt?.verdict] || verdictConfig.unknown;

  return (
    <div className={styles.resultStack}>
      {/* Verdict Banner */}
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

      {/* Flagged Engines */}
      {vt?.engines?.length > 0 && (
        <div className={styles.viewCard}>
          <h3 className={styles.sectionLabel}>Flagged By</h3>
          <div className={styles.engineList}>
            {vt.engines.map((e, i) => (
              <div key={i} className={styles.engineRow}>
                <span className={styles.engineName}>{e.engine}</span>
                <span
                  className={`${styles.engineTag} ${
                    e.category === "malicious" ? styles.tagDanger : styles.tagWarn
                  }`}
                >
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

      {/* Domain Info */}
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
            <InfoRow
              styles={styles}
              label="Status"
              value={domain?.status?.length ? domain.status.join(", ") : "—"}
            />
            <InfoRow
              styles={styles}
              label="Nameservers"
              value={domain?.nameservers?.length ? domain.nameservers.join(", ") : "—"}
            />
          </div>
        )}
      </div>

      {/* Hosting Info */}
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
            <InfoRow
              styles={styles}
              label="Location"
              value={[ip?.city, ip?.region, ip?.country].filter(Boolean).join(", ")}
            />
            <InfoRow styles={styles} label="Reverse DNS" value={ip?.reverseDns || "—"} />
            <InfoRow
              styles={styles}
              label="Datacenter / Hosting"
              value={ip?.isHostingDatacenter ? "Yes" : "No"}
            />
            <InfoRow styles={styles} label="Proxy / VPN Detected" value={ip?.isProxyOrVpn ? "Yes ⚠️" : "No"} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ styles, label, value, danger, warn, safe }) {
  const cls = [
    styles.statValue,
    danger ? styles.statDanger : "",
    warn ? styles.statWarn : "",
    safe ? styles.statSafe : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.statBox}>
      <span className={cls}>{value ?? 0}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function InfoRow({ styles, label, value }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value || "—"}</span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
