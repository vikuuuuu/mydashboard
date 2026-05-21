// src/app/dashboard/page.js
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  onSnapshot as onDocSnapshot,
} from "firebase/firestore";
import { auth, signOutUser } from "@/lib/firebaseAuth";
import { getSessionId, pingSession, clearSession } from "@/lib/sessionManager";
import { APP_VERSION, LASTUPDATE_DATE, CHANGELOG } from "@/lib/appVersion";
import { isSubscriptionActive } from "@/lib/subscriptionManager";
import {
  LayoutDashboardIcon,
  LogOut,
  User,
  GripVertical,
  LayoutGrid,
  List,
  Columns,
  Search,
  X,
  Pin,
  PinOff,
} from "lucide-react";
import styles from "./page.module.css";

/* ─── Default Tools ─────────────────────────────────────── */
const DEFAULT_TOOLS = [
  { id: "Notes",          title: "Notes",            desc: "Create & export notes",                    icon: "📝", color: "#4361ee", pinned: false },
  { id: "myfinancials",   title: "My Financials",     desc: "Track investments & profit",               icon: "📈", color: "#0f9d6e", pinned: true  },
  { id: "img-to-pdf",     title: "Image → PDF",       desc: "Convert images to PDF",                    icon: "🖼️", color: "#f77f00", pinned: false },
  { id: "all-in-one-img", title: "All-in-One Image",  desc: "Convert, resize, crop, compress & more",   icon: "✂️", color: "#9b5de5", pinned: false },
  { id: "pdftool",        title: "PDF Tool",          desc: "Resize, convert & edit PDFs",              icon: "📄", color: "#e63946", pinned: false },
  { id: "video-to-img",   title: "Video → Image",     desc: "Capture video frames as images",           icon: "🎬", color: "#3a86ff", pinned: false },
  { id: "webchat",        title: "Web Chat",          desc: "Real-time messaging",                      icon: "💬", color: "#f15bb5", pinned: false, isWebchat: true },
  { id: "myvideoeditor",  title: "My Video Editor",   desc: "Edit short-form videos",                   icon: "🎞️", color: "#06d6a0", pinned: false },
  { id: "file-studio",    title: "All File Studio",   desc: "Preview & convert any file format",        icon: "📁", color: "#4361ee", pinned: false },
  { id: "studytool",      title: "Study Tool",        desc: "Manage Timetable and review study materials", icon: "📚", color: "#4361ee", pinned: false },
];

const VIEWS      = ["grid", "list", "compact"];
const VIEW_ICONS = {
  grid:    <LayoutGrid size={15} />,
  list:    <List size={15} />,
  compact: <Columns size={15} />,
};
const STORAGE_KEY = "dash_tool_order_v2";

const getInitials = (name, email) => {
  if (name?.trim()) {
    const p = name.trim().split(" ");
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase();
  }
  return email?.[0]?.toUpperCase() || "U";
};
const avatarPalette = ["#4361ee","#0f9d6e","#f77f00","#e63946","#9b5de5","#3a86ff","#f15bb5"];
const getAvatarColor = (str = "") => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return avatarPalette[Math.abs(h) % avatarPalette.length];
};

const TYPE_META = {
  major: { label: "Major",  color: "#4361ee", bg: "rgba(67,97,238,0.09)" },
  minor: { label: "Minor",  color: "#0f9d6e", bg: "rgba(15,157,110,0.09)" },
  patch: { label: "Patch",  color: "#f77f00", bg: "rgba(247,127,0,0.09)"  },
  fix:   { label: "Bugfix", color: "#e63946", bg: "rgba(230,57,70,0.09)"  },
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser]           = useState(null);
  const [avatarErr, setAvatarErr] = useState(false);
  const [dropOpen, setDropOpen]   = useState(false);
  const [view, setView]           = useState("grid");
  const [search, setSearch]       = useState("");
  const [tools, setTools]         = useState(DEFAULT_TOOLS);
  const [unread, setUnread]       = useState(0);
  const [missedVoice, setMissedVoice] = useState(0);
  const [missedVideo, setMissedVideo] = useState(0);
  const [kicked, setKicked]       = useState(false);

  // Subscription
  const [subChecked, setSubChecked] = useState(false);
  const [subActive, setSubActive]   = useState(false);

  // Version modal
  const [showChangelog, setShowChangelog] = useState(false);
  const [activeVersion, setActiveVersion] = useState(null); // which version is expanded

  const dragIdx  = useRef(null);
  const dragOver = useRef(null);
  const dropRef  = useRef(null);
  const pingRef  = useRef(null);

  /* ── Load saved tool order ── */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length) {
        const savedIds = saved.map((t) => t.id);
        const newTools = DEFAULT_TOOLS.filter((t) => !savedIds.includes(t.id));
        setTools([...saved, ...newTools]);
      }
    } catch (_) {}
  }, []);

  /* ── Auth + session + subscription ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setUser(u);

      const db  = getFirestore();
      const uid = u.uid;

      // Check subscription
      const active = await isSubscriptionActive(uid);
      setSubActive(active);
      setSubChecked(true);

      // Realtime session watcher
      const sessionUnsub = onDocSnapshot(doc(db, "user_sessions", uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data?.sessionId && data.sessionId !== getSessionId()) setKicked(true);
      });

      pingRef.current = setInterval(() => pingSession(uid), 60_000);

      // Firestore messages
      const ref     = collection(db, "messages");
      const unreadQ = query(ref, where("participants","array-contains",uid), where("read","==",false));
      const voiceQ  = query(ref, where("participants","array-contains",uid), where("type","==","call"), where("callStatus","==","missed"), where("callType","==","audio"), where("read","==",false));
      const videoQ  = query(ref, where("participants","array-contains",uid), where("type","==","call"), where("callStatus","==","missed"), where("callType","==","video"), where("read","==",false));

      const u1 = onSnapshot(unreadQ, (s) => setUnread(s.docs.filter((d) => d.data().senderId !== uid && d.data().type !== "call").length));
      const u2 = onSnapshot(voiceQ,  (s) => setMissedVoice(s.docs.filter((d) => d.data().senderId !== uid).length));
      const u3 = onSnapshot(videoQ,  (s) => setMissedVideo(s.docs.filter((d) => d.data().senderId !== uid).length));

      return () => { sessionUnsub(); u1(); u2(); u3(); clearInterval(pingRef.current); };
    });
    return () => { unsub(); clearInterval(pingRef.current); };
  }, [router]);

  /* ── Outside click close dropdown ── */
  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── Close changelog on Escape ── */
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") setShowChangelog(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const handleKickedLogout = useCallback(async () => {
    clearInterval(pingRef.current);
    if (user) await clearSession(user.uid);
    sessionStorage.removeItem("app_session_id");
    sessionStorage.removeItem("user_session");
    localStorage.removeItem("user_session");
    await signOutUser();
    router.replace("/login");
  }, [router, user]);

  const saveTools = (t) => { setTools(t); localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); };

  const togglePin = (id, e) => {
    e.stopPropagation();
    const updated  = tools.map((t) => t.id === id ? { ...t, pinned: !t.pinned } : t);
    const pinned   = updated.filter((t) => t.pinned);
    const unpinned = updated.filter((t) => !t.pinned);
    saveTools([...pinned, ...unpinned]);
  };

  const onDragStart = (i) => { dragIdx.current = i; };
  const onDragEnter = (i) => { dragOver.current = i; };
  const onDragEnd   = () => {
    const arr  = [...tools];
    const from = dragIdx.current;
    const to   = dragOver.current;
    if (from === null || to === null || from === to) { dragIdx.current = null; dragOver.current = null; return; }
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    dragIdx.current = null; dragOver.current = null;
    saveTools(arr);
  };

  const filtered = tools.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.desc.toLowerCase().includes(search.toLowerCase())
  );

  const handleLogout = async () => {
    try {
      clearInterval(pingRef.current);
      if (user) await clearSession(user.uid);
      sessionStorage.removeItem("app_session_id");
      sessionStorage.removeItem("user_session");
      localStorage.removeItem("user_session");
      await signOutUser();
      router.replace("/login");
    } catch (err) { console.error("Logout error:", err); }
  };

  if (!user || !subChecked) {
    return (
      <div className={styles.loaderWrap}>
        <div className={styles.loaderSpinner} />
        <p className={styles.loaderText}>Checking session…</p>
      </div>
    );
  }

  const initials    = getInitials(user.displayName, user.email);
  const avatarColor = getAvatarColor(user.email);
  const showPhoto   = user.photoURL && !avatarErr;
  const totalBadge  = unread + missedVoice + missedVideo;

  return (
    <div className={styles.page}>

      {/* ════ KICKED MODAL ════ */}
      {kicked && (
        <div className={styles.kickedOverlay}>
          <div className={styles.kickedModal}>
            <div className={styles.kickedIcon}>🔒</div>
            <h2 className={styles.kickedTitle}>Session Ended</h2>
            <p className={styles.kickedDesc}>You were logged out because your account was signed in on another device.</p>
            <div className={styles.kickedInfo}><span>If this wasn't you, change your password immediately.</span></div>
            <button className={styles.kickedBtn} onClick={handleKickedLogout}>OK, Go to Login</button>
          </div>
        </div>
      )}

      // {/* ════ SUBSCRIPTION LOCK OVERLAY ════ */}
      // {!subActive && (
      //   <div className={styles.subLockOverlay}>
      //     <div className={styles.subLockModal}>
      //       <div className={styles.subLockIcon}>💎</div>
      //       <h2 className={styles.subLockTitle}></h2>
      //       <p className={styles.subLockDesc}>
      //         Get full access to all {DEFAULT_TOOLS.length} tools — Image, PDF, Video, Financials, Chat & more.
      //       </p>
      //       <div className={styles.subLockPrice}>
      //         <div className={styles.subLockPriceLabel}>Yearly Plan</div>
      //         <div className={styles.subLockPriceBig}>₹999<span className={styles.subLockPricePer}>/year</span></div>
      //         <div className={styles.subLockPriceNote}>≈ ₹83/month</div>
      //       </div>
      //       <button className={styles.subLockBtn} onClick={() => router.push("/profile")}>
      //         🔓 Subscribe Now — Go to Profile
      //       </button>
      //       <p className={styles.subLockFooter}>Secured by Razorpay · UPI, Cards, Net Banking</p>
      //     </div>
      //   </div>
      // )}

      {/* ════ CHANGELOG MODAL ════ */}
      {showChangelog && (
        <div className={styles.clOverlay} onClick={() => setShowChangelog(false)}>
          <div className={styles.clModal} onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className={styles.clHeader}>
              <div className={styles.clHeaderLeft}>
                <div className={styles.clAppIcon}>🚀</div>
                <div>
                  <h2 className={styles.clTitle}>What's New</h2>
                  <p className={styles.clSubtitle}>MyDashboard · Release Notes</p>
                </div>
              </div>
              <button className={styles.clClose} onClick={() => setShowChangelog(false)}>✕</button>
            </div>

            {/* Current version hero */}
            <div className={styles.clHero}>
              <span className={styles.clHeroVersion}>{APP_VERSION}</span>
              <span className={styles.clHeroDate}>Released {LASTUPDATE_DATE}</span>
              <span className={styles.clLatestBadge}>● Latest</span>
            </div>

            {/* Changelog list */}
            <div className={styles.clList}>
              {CHANGELOG.map((entry, i) => {
                const meta      = TYPE_META[entry.type] || TYPE_META.minor;
                const isExpanded = activeVersion === entry.version || i === 0;
                const isLatest   = i === 0;

                return (
                  <div
                    key={entry.version}
                    className={`${styles.clEntry} ${isLatest ? styles.clEntryLatest : ""}`}
                  >
                    {/* Timeline dot */}
                    <div className={styles.clTimeline}>
                      <div
                        className={`${styles.clDot} ${isLatest ? styles.clDotLatest : ""}`}
                        style={{ borderColor: isLatest ? meta.color : undefined }}
                      />
                      {i < CHANGELOG.length - 1 && <div className={styles.clLine} />}
                    </div>

                    {/* Entry content */}
                    <div className={styles.clEntryBody}>
                      <div
                        className={styles.clEntryHeader}
                        onClick={() => setActiveVersion(isExpanded && !isLatest ? null : entry.version)}
                      >
                        <div className={styles.clEntryLeft}>
                          <span className={styles.clVersion}>{entry.version}</span>
                          <span
                            className={styles.clTypeBadge}
                            style={{ color: meta.color, background: meta.bg }}
                          >
                            {meta.label}
                          </span>
                          {entry.label && (
                            <span className={styles.clSpecialBadge}>{entry.label}</span>
                          )}
                        </div>
                        <div className={styles.clEntryRight}>
                          <span className={styles.clDate}>{entry.date}</span>
                          {!isLatest && (
                            <span className={styles.clChevron}>
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Changes list — always visible for latest, toggle for others */}
                      {isExpanded && (
                        <ul className={styles.clChanges}>
                          {entry.changes.map((change, ci) => (
                            <li key={ci} className={styles.clChange}>{change}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.clFooter}>
              MyDashboard · All versions · {CHANGELOG.length} releases
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brandMark}><LayoutDashboardIcon size={20} strokeWidth={2.5} /></div>
          <div>
            <h1 className={styles.headerTitle}>Dashboard</h1>
            <p className={styles.headerSub}>Hey, <strong>{user.displayName?.split(" ")[0] || "User"}</strong> 👋</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            {VIEWS.map((v) => (
              <button key={v} className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ""}`} onClick={() => setView(v)} title={v}>
                {VIEW_ICONS[v]}
              </button>
            ))}
          </div>

          <div className={styles.searchWrap}>
            <Search size={13} className={styles.searchIcon} />
            <input className={styles.searchInput} placeholder="Search tools…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className={styles.searchClear} onClick={() => setSearch("")}><X size={12} /></button>}
          </div>

          <div className={styles.avatarZone} ref={dropRef}>
            <button className={styles.avatarBtn} onClick={() => setDropOpen((p) => !p)}>
              {showPhoto
                ? <img src={user.photoURL} className={styles.avatarImg} alt="avatar" onError={() => setAvatarErr(true)} />
                : <div className={styles.avatarInitials} style={{ background: avatarColor }}>{initials}</div>}
              {totalBadge > 0 && <span className={styles.avatarBadge}>{totalBadge > 99 ? "99+" : totalBadge}</span>}
              <div className={styles.avatarOnline} />
            </button>

            {dropOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropUser}>
                  {showPhoto
                    ? <img src={user.photoURL} className={styles.dropAvatar} alt="av" onError={() => setAvatarErr(true)} />
                    : <div className={styles.dropAvatarInitials} style={{ background: avatarColor }}>{initials}</div>}
                  <div>
                    <div className={styles.dropName}>{user.displayName || "User"}</div>
                    <div className={styles.dropEmail}>{user.email}</div>
                  </div>
                </div>
                <div className={styles.dropDivider} />
                <button className={styles.dropItem} onClick={() => { setDropOpen(false); router.push("/profile"); }}>
                  <User size={14} /> My Profile
                </button>
                <button className={styles.dropItem} onClick={() => { setDropOpen(false); router.push("/dashboard/myfinancials"); }}>
                  <span style={{ fontSize: 14 }}>📈</span> My Financials
                </button>
                <div className={styles.dropDivider} />
                <button className={`${styles.dropItem} ${styles.dropItemDanger}`} onClick={handleLogout}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── TOOLBAR ── */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>
          {filtered.length} tools
          {search && <span className={styles.toolbarSearch}> for "{search}"</span>}
        </span>
        <span className={styles.toolbarHint}>
          <GripVertical size={13} /> Drag to rearrange · Click 📌 to pin
        </span>
      </div>

      {/* ── TOOLS GRID ── */}
      <main className={`${styles.cardGrid} ${styles["view_" + view]}`}>
        {filtered.length === 0 && (
          <div className={styles.emptySearch}>
            <span>🔍</span>
            <p>No tools match "<strong>{search}</strong>"</p>
            <button onClick={() => setSearch("")}>Clear search</button>
          </div>
        )}

        {filtered.map((tool) => (
          <div
            key={tool.id}
            className={`${styles.toolCard} ${tool.pinned ? styles.toolCardPinned : ""}`}
            style={{ "--tool-color": tool.color }}
            draggable
            onDragStart={() => onDragStart(tools.indexOf(tool))}
            onDragEnter={() => onDragEnter(tools.indexOf(tool))}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => router.push(`/dashboard/${tool.id}`)}
          >
            <div className={styles.dragHandle} onClick={(e) => e.stopPropagation()}><GripVertical size={14} /></div>
            <button className={`${styles.pinBtn} ${tool.pinned ? styles.pinBtnActive : ""}`} onClick={(e) => togglePin(tool.id, e)} title={tool.pinned ? "Unpin" : "Pin"}>
              {tool.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <div className={styles.toolIcon} style={{ background: `${tool.color}18`, color: tool.color }}>{tool.icon}</div>
            <div className={styles.toolInfo}>
              <h3 className={styles.toolTitle}>{tool.title}</h3>
              <p className={styles.toolDesc}>{tool.desc}</p>
              {tool.isWebchat && (
                <div className={styles.badgeRow}>
                  {unread > 0      && <span className={styles.badge} style={{ background:"#eef2ff",color:"#4361ee",border:"1px solid #c7d2fe" }}>💬 {unread > 99 ? "99+" : unread}</span>}
                  {missedVoice > 0 && <span className={styles.badge} style={{ background:"#f0fdf4",color:"#0f9d6e",border:"1px solid #bbf7d0" }}>📞 {missedVoice > 99 ? "99+" : missedVoice}</span>}
                  {missedVideo > 0 && <span className={styles.badge} style={{ background:"#fef3c7",color:"#d97706",border:"1px solid #fde68a" }}>📹 {missedVideo > 99 ? "99+" : missedVideo}</span>}
                </div>
              )}
            </div>
            <span className={styles.toolArrow}>→</span>
          </div>
        ))}
      </main>

      {/* ── FOOTER — click version to open changelog ── */}
      <footer className={styles.footer}>
        <button
          className={styles.versionBtn}
          onClick={() => { setShowChangelog(true); setActiveVersion(null); }}
          title="View release notes"
        >
          <span className={styles.versionDot} />
          MyDashboard {APP_VERSION}
        </button>
        <span className={styles.dot}>•</span>
        <span>Last Update {LASTUPDATE_DATE}</span>
      </footer>
    </div>
  );
}
