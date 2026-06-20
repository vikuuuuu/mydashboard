// File Path: app/profile/page.js
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { auth } from "@/lib/firebaseAuth";
import { app } from "@/lib/firebase";
import styles from "./profile.module.css";

/* ── helpers ── */
const db      = getFirestore(app);
const storage = getStorage(app);

const formatDate = (ts) => {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatTool = (tool) => {
  const map = {
    "image-to-pdf":                 "🖼️ Image → PDF",
    "pdf-to-img":                   "📄 PDF → Image",
    "img-resize":                   "✂️ Image Resize",
    "My Financials - Add Trade":    "📈 Add Trade",
    "My Financials - Edit Trade":   "✏️ Edit Trade",
    "My Financials - Delete Trade": "🗑️ Delete Trade",
  };
  return map[tool] || tool;
};

const getInitials = (displayName, email) => {
  if (displayName?.trim()) {
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

/* ─────────────────────────────────────────────
   ACCOUNT DATA WIPE
   Saare collections jaha userId field hai (top-level)
   ya jo users/{uid}/ ke neeche subcollections hain.
   Note: 'rooms' (video calls) aur 'chats/messages' jaan-boojh kar
   skip kiye hain kyunki wo shared/group data hain — kisi aur user
   ka conversation ya call record nahi hatana.
───────────────────────────────────────────── */

// users/{uid}/<sub> ke andar wali subcollections
const USER_SUBCOLLECTIONS = ["watchtracker", "quicksongs", "link_checks"];

// top-level collections jinme "userId" field se ownership pata chalta hai
const USER_KEYED_COLLECTIONS = [
  "transactions",
  "khataEntries",
  "notes",
  "folders",
  "tool_usage",
  "login_logs",
  "study_tasks",
  "study_exams",
  "study_sessions",
  "study_flashcards",
  "study_todos",
  "study_notes",
  "study_achievements",
  "custom_subjects",
  "study_habits",
];

const BATCH_LIMIT = 450; // Firestore hard limit 500, safety margin rakha

// Docs ki list ko chunks me batch-delete karta hai
const batchDeleteDocs = async (docRefs) => {
  for (let i = 0; i < docRefs.length; i += BATCH_LIMIT) {
    const chunk = docRefs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

// Saara account data delete karta hai. deleteUser() se PEHLE call hona zaroori hai,
// warna auth.currentUser null ho jayega aur security rules sab reject kar dengi.
const wipeAllUserData = async (uid) => {
  // 1. users/{uid}/<subcollection> wala data
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, "users", uid, sub));
    if (!snap.empty) await batchDeleteDocs(snap.docs.map((d) => d.ref));
  }

  // 2. top-level collections jaha userId field match karta hai
  for (const colName of USER_KEYED_COLLECTIONS) {
    const q = query(collection(db, colName), where("userId", "==", uid));
    const snap = await getDocs(q);
    if (!snap.empty) await batchDeleteDocs(snap.docs.map((d) => d.ref));
  }

  // 3. subscriptions/{uid} — single doc, userId hi doc id hai
  try {
    await deleteDoc(doc(db, "subscriptions", uid));
  } catch (e) {
    console.warn("Subscription doc delete skipped:", e.message);
  }

  // 4. playlists jinka ye user owner hai
  const playlistQ = query(collection(db, "playlists"), where("ownerId", "==", uid));
  const playlistSnap = await getDocs(playlistQ);
  if (!playlistSnap.empty) await batchDeleteDocs(playlistSnap.docs.map((d) => d.ref));

  // 5. Storage avatar (agar upload kiya tha)
  try {
    await deleteObject(ref(storage, `avatars/${uid}`));
  } catch (e) {
    // Avatar nahi tha ya already deleted — ignore karo
    if (e.code !== "storage/object-not-found") console.warn("Avatar delete skipped:", e.message);
  }

  // 6. Sabse last me users/{uid} doc khud
  await deleteDoc(doc(db, "users", uid));
};

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function ProfilePage() {
  const router = useRouter();

  /* auth & data */
  const [user,        setUser]        = useState(null);
  const [userDoc,     setUserDoc]     = useState(null);
  const [name,        setName]        = useState("");
  const [bio,         setBio]         = useState("");
  const [phone,       setPhone]       = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [resetSent,   setResetSent]   = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);

  /* lists */
  const [toolHistory, setToolHistory] = useState([]);
  const [loginLogs,   setLoginLogs]   = useState([]);

  /* ── NEW FEATURE STATE ── */
  // 1. Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview,   setAvatarPreview]   = useState(null);
  const fileInputRef = useRef(null);

  // 2. Activity chart
  const [activityData, setActivityData] = useState([]);

  // 3. Active tab inside profile
  const [profileTab, setProfileTab] = useState("overview"); // overview | activity | security | danger

  // 4. Notification preferences
  const [notifPrefs, setNotifPrefs]   = useState({ emailAlerts: true, loginNotif: true, newsletter: false });
  const [notifSaved, setNotifSaved]   = useState(false);

  // 5. Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword,    setDeletePassword]    = useState("");
  const [deleting,          setDeleting]          = useState(false);
  const [deleteError,       setDeleteError]       = useState("");
  const [deleteStage,       setDeleteStage]       = useState(""); // progress text

  // 6. Export data
  const [exporting, setExporting] = useState(false);

  // 7. Copied UID
  const [uidCopied, setUidCopied] = useState(false);

  // 8. Profile completion
  const calcCompletion = (u, doc, b, ph) => {
    let score = 0;
    if (u?.displayName)   score += 25;
    if (u?.photoURL)       score += 25;
    if (b?.trim())         score += 25;
    if (ph?.trim())        score += 25;
    return score;
  };

  /* ── AUTH ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);
      setName(u.displayName || "");
      await Promise.all([
        loadUserDoc(u.uid),
        loadToolHistory(u.uid),
        loadLoginLogs(u.uid),
      ]);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const loadUserDoc = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      setUserDoc(data);
      setBio(data.bio || "");
      setPhone(data.phone || "");
      setNotifPrefs(prev => ({ ...prev, ...(data.notifPrefs || {}) }));
    }
  };

  const loadToolHistory = async (uid) => {
    const q    = query(collection(db, "tool_usage"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => d.data());
    setToolHistory(data);
    buildActivityData(data);
  };

  const loadLoginLogs = async (uid) => {
    const q    = query(collection(db, "login_logs"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setLoginLogs(snap.docs.map(d => d.data()));
  };

  /* ── BUILD LAST-7-DAYS ACTIVITY ── */
  const buildActivityData = (history) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { label: d.toLocaleDateString("en-IN", { weekday: "short" }), date: d.toDateString(), count: 0 };
    });
    history.forEach(h => {
      const ts  = h.createdAt?.toDate ? h.createdAt.toDate() : new Date(h.createdAt);
      const key = ts.toDateString();
      const day = days.find(d => d.date === key);
      if (day) day.count++;
    });
    setActivityData(days);
  };

  /* ── SAVE PROFILE ── */
  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      await updateDoc(doc(db, "users", user.uid), {
        displayName: name,
        bio,
        phone,
        updatedAt: serverTimestamp(),
      });
      alert("Profile updated!");
    } catch (e) {
      console.error(e);
      alert("Error saving profile.");
    }
    setSaving(false);
  };

  /* ── SAVE NOTIF PREFS ── */
  const saveNotifPrefs = async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), { notifPrefs, updatedAt: serverTimestamp() });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } catch (e) { console.error(e); }
  };

  /* ── AVATAR UPLOAD ── */
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Max 2 MB allowed."); return; }

    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, updatedAt: serverTimestamp() });
      setUser({ ...auth.currentUser });
      setAvatarError(false);
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
      setAvatarPreview(null);
    }
    setAvatarUploading(false);
  };

  /* ── RESET PASSWORD ── */
  const resetPassword = async () => {
    await sendPasswordResetEmail(auth, user.email);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  };

  /* ── COPY UID ── */
  const copyUID = () => {
    navigator.clipboard.writeText(user.uid);
    setUidCopied(true);
    setTimeout(() => setUidCopied(false), 1800);
  };

  /* ── EXPORT DATA ── */
  const exportData = async () => {
    setExporting(true);
    const payload = {
      profile:    { uid: user.uid, email: user.email, displayName: user.displayName, bio, phone },
      toolHistory,
      loginLogs,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `profile-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  /* ── DELETE ACCOUNT ──
     Order zaroori hai: pehle Firestore + Storage data wipe,
     SABSE LAST me deleteUser() — kyunki deleteUser() ke baad
     auth.currentUser null ho jata hai aur security rules sab
     reject kar dengi agar humne pehle ye call kar diya. */
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") { setDeleteError("Type DELETE to confirm."); return; }
    setDeleting(true);
    setDeleteError("");
    try {
      const isEmail = user.providerData?.[0]?.providerId === "password";

      // Step 1: Re-authenticate (Firebase recent-login requirement ke liye zaroori,
      // especially deleteUser() jaisa sensitive operation karne se pehle)
      if (isEmail) {
        setDeleteStage("Verifying password…");
        const cred = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(auth.currentUser, cred);
      }

      // Step 2: Saara Firestore + Storage data wipe (auth abhi valid hai)
      setDeleteStage("Deleting your data…");
      await wipeAllUserData(user.uid);

      // Step 3: Sabse last — Auth account delete (auto sign-out bhi ho jayega)
      setDeleteStage("Removing account…");
      await deleteUser(auth.currentUser);

      router.replace("/login");
    } catch (e) {
      console.error(e);
      setDeleteError(
        e.code === "auth/wrong-password" ? "Wrong password." :
        e.code === "auth/requires-recent-login" ? "Session expired — please log out and log in again, then retry." :
        "Failed: " + e.message
      );
    }
    setDeleting(false);
    setDeleteStage("");
  };

  /* ── RENDER GUARDS ── */
  if (loading) return (
    <div className={styles.loaderWrap}>
      <div className={styles.loaderSpinner} />
      <p className={styles.loaderText}>Loading profile…</p>
    </div>
  );

  const initials       = getInitials(user.displayName, user.email);
  const avatarColor    = getAvatarColor(user.email || "user");
  const photoURL       = avatarPreview || user.photoURL;
  const showPhoto      = photoURL && !avatarError;
  const completion     = calcCompletion(user, userDoc, bio, phone);
  const memberSince    = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const lastLogin = user?.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const maxActivity = Math.max(...activityData.map(d => d.count), 1);

  /* ─── TABS ─── */
  const TABS = [
    { id: "overview",  label: "👤 Overview" },
    { id: "activity",  label: "📊 Activity" },
    { id: "security",  label: "🔒 Security" },
    { id: "danger",    label: "⚠️ Danger Zone" },
  ];

  return (
    <main className={styles.page}>

      {/* ── Top Bar ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <button className={styles.exportBtn} onClick={exportData} disabled={exporting}>
          {exporting ? "Exporting…" : "⬇ Export Data"}
        </button>
      </div>

      <h1 className={styles.pageTitle}>👤 My Profile</h1>

      {/* ── Profile Completion Bar ── */}
      <div className={styles.completionBanner}>
        <div className={styles.completionLeft}>
          <span className={styles.completionLabel}>Profile Completion</span>
          <span className={styles.completionPct}>{completion}%</span>
        </div>
        <div className={styles.completionTrack}>
          <div className={styles.completionFill} style={{ width: `${completion}%` }} />
        </div>
        {completion < 100 && (
          <span className={styles.completionHint}>
            {!user.photoURL && "Upload photo · "}
            {!bio && "Add bio · "}
            {!phone && "Add phone"}
          </span>
        )}
      </div>

      {/* ── Hero Banner ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          {/* Avatar with upload */}
          <div className={styles.avatarWrap}>
            {showPhoto
              ? <img src={photoURL} className={styles.avatarImg} alt="Profile" onError={() => setAvatarError(true)} />
              : <div className={styles.avatarInitials} style={{ background: avatarColor }}>{initials}</div>
            }
            <button
              className={styles.avatarEditBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Change photo"
              disabled={avatarUploading}
            >
              {avatarUploading ? "⏳" : "📷"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
            <div className={styles.avatarOnline} />
          </div>

          <div className={styles.heroInfo}>
            <h2 className={styles.heroName}>{user.displayName || "User"}</h2>
            {bio && <p className={styles.heroBio}>{bio}</p>}
            <p className={styles.heroEmail}>{user.email}</p>
            <div className={styles.heroBadges}>
              <span className={styles.badge}>✅ Verified</span>
              <span className={styles.badgeMuted}>Member since {memberSince}</span>
              {phone && <span className={styles.badgeMuted}>📞 {phone}</span>}
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
            <span className={styles.heroStatVal} style={{ fontSize: "0.85rem" }}>{lastLogin}</span>
            <span className={styles.heroStatLabel}>Last Login</span>
          </div>
        </div>
      </div>

      {/* ── Registration Info ── */}
      {userDoc && (
        <div className={styles.regBanner}>
          <div className={styles.regBannerTitle}>🖥️ Registered From</div>
          <div className={styles.regPills}>
            {userDoc.registeredDevice   && <span className={styles.regPill}>{userDoc.registeredDevice}</span>}
            {userDoc.registeredBrowser  && <span className={styles.regPill}>🌐 {userDoc.registeredBrowser}</span>}
            {userDoc.registeredOS       && <span className={styles.regPill}>💿 {userDoc.registeredOS}</span>}
            {userDoc.registeredLocation && <span className={styles.regPill}>📍 {userDoc.registeredLocation}</span>}
            {userDoc.registeredIp       && <span className={styles.regPillMono}>🔌 {userDoc.registeredIp}</span>}
            {userDoc.registeredISP      && <span className={styles.regPillMono}>📡 {userDoc.registeredISP}</span>}
            {userDoc.registeredTimezone && <span className={styles.regPill}>🕐 {userDoc.registeredTimezone}</span>}
            {userDoc.registeredScreen   && <span className={styles.regPill}>📺 {userDoc.registeredScreen}</span>}
          </div>
        </div>
      )}

      {/* ── INNER TABS ── */}
      <div className={styles.innerTabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.innerTab} ${profileTab === t.id ? styles.innerTabActive : ""} ${t.id === "danger" ? styles.innerTabDanger : ""}`}
            onClick={() => setProfileTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════ */}
      {profileTab === "overview" && (
        <div className={styles.grid}>

          {/* Edit Profile */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>✏️</span>
              <span className={styles.cardTitle}>Edit Profile</span>
            </div>
            <div className={styles.cardBody}>
              <label className={styles.label}>Display Name</label>
              <input className={styles.input} value={name} placeholder="Your full name" onChange={e => setName(e.target.value)} />

              <label className={styles.label}>Bio</label>
              <textarea
                className={styles.textarea}
                value={bio}
                placeholder="Tell us a little about yourself…"
                rows={3}
                onChange={e => setBio(e.target.value)}
              />

              <label className={styles.label}>Phone Number</label>
              <input className={styles.input} value={phone} placeholder="+91 98765 43210" onChange={e => setPhone(e.target.value)} />

              <label className={styles.label}>Email Address</label>
              <input className={`${styles.input} ${styles.inputDisabled}`} value={user.email} disabled />

              <label className={styles.label}>User ID</label>
              <div className={styles.uidRow}>
                <input className={`${styles.input} ${styles.inputDisabled} ${styles.inputMono}`} value={user.uid} disabled />
                <button className={`${styles.copyBtn} ${uidCopied ? styles.copyBtnDone : ""}`} onClick={copyUID}>
                  {uidCopied ? "✓" : "⎘"}
                </button>
              </div>

              <button className={styles.primaryBtn} onClick={saveProfile} disabled={saving}>
                {saving ? "Saving…" : "💾 Save Profile"}
              </button>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>🔔</span>
              <span className={styles.cardTitle}>Notification Preferences</span>
            </div>
            <div className={styles.cardBody}>
              {[
                { key: "emailAlerts", label: "Email Alerts",     sub: "Get important account emails" },
                { key: "loginNotif",  label: "Login Alerts",     sub: "Email on new device login" },
                { key: "newsletter",  label: "Newsletter",       sub: "Product updates & tips" },
              ].map(({ key, label, sub }) => (
                <div key={key} className={styles.toggleRow}>
                  <div>
                    <div className={styles.toggleLabel}>{label}</div>
                    <div className={styles.toggleSub}>{sub}</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${notifPrefs[key] ? styles.toggleOn : ""}`}
                    onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                  >
                    <div className={styles.toggleKnob} />
                  </button>
                </div>
              ))}
              <button className={`${styles.primaryBtn} ${notifSaved ? styles.primaryBtnGreen : ""}`} onClick={saveNotifPrefs} style={{ marginTop: 18 }}>
                {notifSaved ? "✅ Saved!" : "Save Preferences"}
              </button>
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
                      {h.imageCount != null && `${h.imageCount} items · ${h.totalSizeKB} KB · `}
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
                <div key={i} className={styles.logItem}>
                  <div className={styles.logHeader} onClick={() => setExpandedLog(expandedLog === i ? null : i)}>
                    <div className={styles.logDot} style={{ background: i === 0 ? "var(--buy)" : "var(--text3)" }} />
                    <div className={styles.logSummary}>
                      <span className={styles.logProvider}>{log.provider === "google" ? "🔵 Google" : "📧 Email"}</span>
                      <span className={styles.logDeviceTag}>{log.deviceType || "—"}</span>
                      <span className={styles.logCity}>{log.city && log.city !== "Unknown" ? `📍 ${log.city}` : ""}</span>
                    </div>
                    <div className={styles.logRight}>
                      <span className={styles.logTime}>{formatDate(log.createdAt)}</span>
                      {i === 0 && <span className={styles.pillGreenSmall}>Latest</span>}
                      <span className={styles.logChevron}>{expandedLog === i ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {expandedLog === i && (
                    <div className={styles.logDetails}>
                      <div className={styles.logGrid}>
                        {[
                          ["📱","Device Type",       log.deviceType],
                          ["💿","Operating System",  log.os],
                          ["🌐","Browser",           log.browser],
                          ["📺","Screen Resolution", log.screen],
                          ["🔌","IP Address",        log.ip],
                          ["📡","ISP / Network",     log.isp],
                          ["📍","Location",          log.location],
                          ["🕐","Timezone",          log.timezone],
                        ].map(([icon, label, val]) => (
                          <div key={label} className={styles.logDetailItem}>
                            <span className={styles.logDetailIcon}>{icon}</span>
                            <div>
                              <div className={styles.logDetailLabel}>{label}</div>
                              <div className={`${styles.logDetailVal} ${["IP Address"].includes(label) ? styles.monoVal : ""}`}>
                                {val || "—"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB: ACTIVITY CHART
      ══════════════════════════════════════ */}
      {profileTab === "activity" && (
        <div className={styles.grid}>
          {/* 7-Day Bar Chart */}
          <div className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>📊</span>
              <span className={styles.cardTitle}>Tool Usage — Last 7 Days</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.barChart}>
                {activityData.map((d, i) => (
                  <div key={i} className={styles.barCol}>
                    <div className={styles.barCountLabel}>{d.count > 0 ? d.count : ""}</div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{ height: `${(d.count / maxActivity) * 100}%` }}
                        title={`${d.count} uses`}
                      />
                    </div>
                    <div className={styles.barLabel}>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tool Usage Breakdown donut-style */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>🥧</span>
              <span className={styles.cardTitle}>Tool Breakdown</span>
            </div>
            <div className={styles.cardBody}>
              {toolHistory.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>📭</span><p>No data yet</p></div>
              ) : (() => {
                const counts = {};
                toolHistory.forEach(h => { counts[formatTool(h.tool)] = (counts[formatTool(h.tool)] || 0) + 1; });
                const total  = toolHistory.length;
                const colors = ["#4361ee","#0f9d6e","#f77f00","#e63946","#9b5de5","#3a86ff","#f15bb5"];
                return Object.entries(counts).map(([tool, count], i) => (
                  <div key={tool} className={styles.breakdownRow}>
                    <div className={styles.breakdownDot} style={{ background: colors[i % colors.length] }} />
                    <div className={styles.breakdownLabel}>{tool}</div>
                    <div className={styles.breakdownBar}>
                      <div className={styles.breakdownFill} style={{ width: `${(count / total) * 100}%`, background: colors[i % colors.length] }} />
                    </div>
                    <div className={styles.breakdownCount}>{count}</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Login Summary */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>🌍</span>
              <span className={styles.cardTitle}>Login Locations</span>
            </div>
            <div className={styles.cardBody}>
              {loginLogs.length === 0 ? (
                <div className={styles.emptyState}><span className={styles.emptyIcon}>📭</span><p>No data yet</p></div>
              ) : (() => {
                const locs = {};
                loginLogs.forEach(l => {
                  const city = l.city && l.city !== "Unknown" ? l.city : "Unknown";
                  locs[city] = (locs[city] || 0) + 1;
                });
                return Object.entries(locs).sort((a, b) => b[1] - a[1]).map(([city, cnt]) => (
                  <div key={city} className={styles.breakdownRow}>
                    <span>📍</span>
                    <div className={styles.breakdownLabel}>{city}</div>
                    <div className={styles.breakdownBar}>
                      <div className={styles.breakdownFill} style={{ width: `${(cnt / loginLogs.length) * 100}%` }} />
                    </div>
                    <div className={styles.breakdownCount}>{cnt}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB: SECURITY
      ══════════════════════════════════════ */}
      {profileTab === "security" && (
        <div className={styles.grid}>
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
                <button className={`${styles.outlineBtn} ${resetSent ? styles.outlineBtnSent : ""}`} onClick={resetPassword} disabled={resetSent}>
                  {resetSent ? "✅ Sent!" : "Send Reset"}
                </button>
              </div>
              <div className={styles.securityRow}>
                <div>
                  <div className={styles.securityLabel}>Email Verified</div>
                  <div className={styles.securityMuted}>{user.email}</div>
                </div>
                <span className={`${styles.pill} ${user.emailVerified ? styles.pillGreen : styles.pillOrange}`}>
                  {user.emailVerified ? "✅ Verified" : "⚠️ Unverified"}
                </span>
              </div>
              <div className={styles.securityRow}>
                <div>
                  <div className={styles.securityLabel}>Auth Provider</div>
                  <div className={styles.securityMuted}>
                    {user.providerData?.[0]?.providerId === "google.com" ? "Google OAuth" : "Email / Password"}
                  </div>
                </div>
                <span className={styles.pill} style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {user.providerData?.[0]?.providerId === "google.com" ? "🔵 Google" : "📧 Email"}
                </span>
              </div>
              <div className={styles.securityRow}>
                <div>
                  <div className={styles.securityLabel}>Account Created</div>
                  <div className={styles.securityMuted}>{memberSince}</div>
                </div>
              </div>
              <div className={styles.securityRow}>
                <div>
                  <div className={styles.securityLabel}>Last Sign-In</div>
                  <div className={styles.securityMuted}>{lastLogin}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sessions / recent logins */}
          <div className={`${styles.card} ${styles.cardTall}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>🖥️</span>
              <span className={styles.cardTitle}>Recent Sessions</span>
              <span className={styles.cardBadge}>{loginLogs.slice(0,5).length}</span>
            </div>
            <div className={styles.scrollList}>
              {loginLogs.slice(0, 5).map((log, i) => (
                <div key={i} className={styles.sessionItem}>
                  <div className={styles.sessionIcon}>
                    {log.deviceType === "Mobile" ? "📱" : "🖥️"}
                  </div>
                  <div className={styles.sessionInfo}>
                    <div className={styles.sessionTitle}>
                      {log.browser || "Unknown"} on {log.os || "Unknown"}
                    </div>
                    <div className={styles.sessionMeta}>
                      {log.location || "—"} · {formatDate(log.createdAt)}
                    </div>
                  </div>
                  {i === 0 && <span className={styles.pillGreenSmall}>Current</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB: DANGER ZONE
      ══════════════════════════════════════ */}
      {profileTab === "danger" && (
        <div className={styles.dangerGrid}>
          {/* Export */}
          <div className={`${styles.card} ${styles.dangerCard}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>⬇️</span>
              <span className={styles.cardTitle}>Export Your Data</span>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.dangerDesc}>Download all your data as a JSON file — tool history, login logs, and profile info.</p>
              <button className={styles.outlineBtn} onClick={exportData} disabled={exporting}>
                {exporting ? "Preparing…" : "⬇ Download JSON"}
              </button>
            </div>
          </div>

          {/* Delete Account */}
          <div className={`${styles.card} ${styles.dangerCard} ${styles.dangerCardRed}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>🗑️</span>
              <span className={styles.cardTitle} style={{ color: "var(--danger)" }}>Delete Account</span>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.dangerDesc}>
                Permanently delete your account <strong>and all associated data</strong> — tool history,
                login logs, notes, financial records, study data, playlists you own, and your avatar.
                This action <strong>cannot be undone</strong>.
              </p>
              <button className={styles.dangerBtn} onClick={() => setShowDeleteModal(true)}>
                Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={e => !deleting && e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalIcon}>🗑️</div>
            <h3 className={styles.modalTitle}>Delete Account</h3>
            <p className={styles.modalDesc}>
              This will permanently delete your account and <strong>all your data</strong> across every
              feature (notes, financials, study tools, history, playlists, avatar). Type <strong>DELETE</strong> to confirm.
            </p>

            <label className={styles.label}>Type DELETE to confirm</label>
            <input
              className={`${styles.input} ${deleteConfirmText === "DELETE" ? styles.inputGreen : ""}`}
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
            />

            {user.providerData?.[0]?.providerId === "password" && (
              <>
                <label className={styles.label}>Your Password (to re-authenticate)</label>
                <input
                  className={styles.input}
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  placeholder="Current password"
                  disabled={deleting}
                />
              </>
            )}

            {deleting && deleteStage && (
              <div className={styles.completionHint} style={{ marginTop: 10, textAlign: "center" }}>
                ⏳ {deleteStage}
              </div>
            )}

            {deleteError && <div className={styles.errorMsg}>{deleteError}</div>}

            <div className={styles.modalActions}>
              <button
                className={styles.outlineBtn}
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeletePassword(""); setDeleteError(""); }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.dangerBtn}
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== "DELETE"}
              >
                {deleting ? (deleteStage || "Deleting…") : "🗑 Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
