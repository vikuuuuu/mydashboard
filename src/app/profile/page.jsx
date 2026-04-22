"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { auth } from "@/lib/firebaseAuth";
import { app } from "@/lib/firebase";
import styles from "./profile.module.css";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser]               = useState(null);
  const [name, setName]               = useState("");
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [resetSent, setResetSent]     = useState(false);
  const [toolHistory, setToolHistory] = useState([]);
  const [loginLogs, setLoginLogs]     = useState([]);
  const [avatarError, setAvatarError] = useState(false);

  /* ── Auth Guard ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);
      setName(u.displayName || "");
      await loadToolHistory(u.uid);
      await loadLoginLogs(u.uid);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  /* ── Firestore ── */
  const loadToolHistory = async (uid) => {
    const db = getFirestore(app);
    const q = query(collection(db, "tool_usage"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setToolHistory(snap.docs.map((d) => d.data()));
  };

  const loadLoginLogs = async (uid) => {
    const db = getFirestore(app);
    const q = query(collection(db, "login_logs"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setLoginLogs(snap.docs.map((d) => d.data()));
  };

  /* ── Actions ── */
  const saveProfile = async () => {
    setSaving(true);
    await updateProfile(auth.currentUser, { displayName: name });
    setSaving(false);
    alert("Profile updated successfully!");
  };

  const resetPassword = async () => {
    await sendPasswordResetEmail(auth, user.email);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  };

  /* ── Avatar initials fallback ── */
  const getInitials = (displayName, email) => {
    if (displayName && displayName.trim()) {
      const parts = displayName.trim().split(" ");
      return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    }
    return email ? email[0].toUpperCase() : "U";
  };

  const getAvatarColor = (str) => {
    const colors = ["#4361ee","#0f9d6e","#f77f00","#e63946","#9b5de5","#3a86ff","#f15bb5"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const formatTool = (tool) => {
    const map = {
      "image-to-pdf":           "Image → PDF",
      "pdf-to-img":             "PDF → Image",
      "img-resize":             "Image Resize",
      "My Financials - Add Trade":    "📈 Add Trade",
      "My Financials - Edit Trade":   "✏️ Edit Trade",
      "My Financials - Delete Trade": "🗑️ Delete Trade",
    };
    return map[tool] || tool;
  };

  const formatDate = (ts) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  const lastLogin = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  if (loading) {
    return (
      <div className={styles.loaderWrap}>
        <div className={styles.loaderSpinner} />
        <p className={styles.loaderText}>Loading profile…</p>
      </div>
    );
  }

  const initials    = getInitials(user.displayName, user.email);
  const avatarColor = getAvatarColor(user.email || "user");
  const showPhoto   = user.photoURL && !avatarError;

  return (
    <main className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
      </div>

      <h1 className={styles.pageTitle}>👤 My Profile</h1>

      {/* ── Hero Banner ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          <div className={styles.avatarWrap}>
            {showPhoto ? (
              <img
                src={user.photoURL}
                className={styles.avatarImg}
                alt="Profile"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className={styles.avatarInitials} style={{ background: avatarColor }}>
                {initials}
              </div>
            )}
            <div className={styles.avatarOnline} />
          </div>
          <div className={styles.heroInfo}>
            <h2 className={styles.heroName}>{user.displayName || "User"}</h2>
            <p className={styles.heroEmail}>{user.email}</p>
            <div className={styles.heroBadges}>
              <span className={styles.badge}>✅ Verified</span>
              <span className={styles.badgeMuted}>Member since {memberSince}</span>
            </div>
          </div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatVal}>{toolHistory.length}</span>
            <span className={styles.heroStatLabel}>Tool Uses</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroStatVal}>{loginLogs.length}</span>
            <span className={styles.heroStatLabel}>Logins</span>
          </div>
          <div className={styles.heroStatDivider} />
          <div className={styles.heroStat}>
            <span className={styles.heroStatVal} style={{ fontSize: "0.95rem" }}>{lastLogin}</span>
            <span className={styles.heroStatLabel}>Last Login</span>
          </div>
        </div>
      </div>

      {/* ── Cards Grid ── */}
      <div className={styles.grid}>

        {/* Profile Info */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}>✏️</span>
            <span className={styles.cardTitle}>Edit Profile</span>
          </div>
          <div className={styles.cardBody}>
            <label className={styles.label}>Display Name</label>
            <input
              className={styles.input}
              value={name}
              placeholder="Your full name"
              onChange={(e) => setName(e.target.value)}
            />
            <label className={styles.label}>Email Address</label>
            <input className={`${styles.input} ${styles.inputDisabled}`} value={user.email} disabled />
            <label className={styles.label}>UID</label>
            <input className={`${styles.input} ${styles.inputDisabled} ${styles.inputMono}`} value={user.uid} disabled />
            <button
              className={styles.primaryBtn}
              onClick={saveProfile}
              disabled={saving}
            >
              {saving ? "Saving…" : "💾 Save Profile"}
            </button>
          </div>
        </div>

        {/* Security */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}>🔒</span>
            <span className={styles.cardTitle}>Security</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.securityRow}>
              <div>
                <div className={styles.securityLabel}>Password</div>
                <div className={styles.securityMuted}>Reset via email link</div>
              </div>
              <button
                className={`${styles.outlineBtn} ${resetSent ? styles.outlineBtnSent : ""}`}
                onClick={resetPassword}
                disabled={resetSent}
              >
                {resetSent ? "✅ Sent!" : "Send Reset"}
              </button>
            </div>
            <div className={styles.securityRow}>
              <div>
                <div className={styles.securityLabel}>Email</div>
                <div className={styles.securityMuted}>{user.email}</div>
              </div>
              <span className={`${styles.pill} ${user.emailVerified ? styles.pillGreen : styles.pillOrange}`}>
                {user.emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            <div className={styles.securityRow}>
              <div>
                <div className={styles.securityLabel}>Auth Provider</div>
                <div className={styles.securityMuted}>
                  {user.providerData?.[0]?.providerId === "google.com" ? "Google" : "Email / Password"}
                </div>
              </div>
              <span className={styles.pill} style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {user.providerData?.[0]?.providerId === "google.com" ? "🔵 Google" : "📧 Email"}
              </span>
            </div>
          </div>
        </div>

        {/* Tool History */}
        <div className={`${styles.card} ${styles.cardTall}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}>🛠️</span>
            <span className={styles.cardTitle}>Tool Usage History</span>
            <span className={styles.cardBadge}>{toolHistory.length}</span>
          </div>
          <div className={styles.scrollList}>
            {toolHistory.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📭</span>
                <p>No tool usage yet</p>
              </div>
            ) : toolHistory.map((h, i) => (
              <div key={i} className={styles.listItem}>
                <div className={styles.listItemLeft}>
                  <div className={styles.listItemTitle}>{formatTool(h.tool)}</div>
                  <div className={styles.listItemSub}>
                    {h.imageCount != null && <span>{h.imageCount} items · {h.totalSizeKB} KB · </span>}
                    {formatDate(h.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Login Logs */}
        <div className={`${styles.card} ${styles.cardTall}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}>🔐</span>
            <span className={styles.cardTitle}>Login Activity</span>
            <span className={styles.cardBadge}>{loginLogs.length}</span>
          </div>
          <div className={styles.scrollList}>
            {loginLogs.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📭</span>
                <p>No login activity found</p>
              </div>
            ) : loginLogs.map((log, i) => (
              <div key={i} className={styles.listItem}>
                <div className={styles.listDot} style={{ background: i === 0 ? "var(--buy)" : "var(--text3)" }} />
                <div className={styles.listItemLeft}>
                  <div className={styles.listItemTitle}>
                    {log.provider === "google.com" ? "🔵 Google Sign-in" : "📧 Email Sign-in"}
                  </div>
                  <div className={styles.listItemSub}>{formatDate(log.createdAt)}</div>
                </div>
                {i === 0 && <span className={styles.pillGreenSmall}>Latest</span>}
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
