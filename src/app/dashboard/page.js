"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import { getCurrentUser, signOutUser } from "@/lib/firebaseAuth";
import { LayoutDashboardIcon, LogOut, User } from "lucide-react";
import { APP_VERSION, LASTUPDATE_DATE } from "@/lib/appVersion";
import Avatar from "../../../public/avatar.png";

import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

const TOOLS = [
  { id: "Notes", title: "Notes", desc: "Create & Export Notes" },
  {
    id: "myfinancials",
    title: "My Financials",
    desc: "Track investments & profit",
  },
  { id: "img-to-pdf", title: "Image to PDF", desc: "Convert images to PDF" },
  {
    id: "all-in-one-img",
    title: "All-in-One Image Tool",
    desc: "Convert, resize, crop, rotate, compress, add filters, and watermark images",
  },
  { id: "pdftool", title: "pdftool", desc: "Capture video frames" },
  { id: "video-to-img", title: "Video to Image", desc: "Capture video frames" },
  {
    id: "webchat",
    title: "Web Chat",
    desc: "Real-time messaging",
    isWebchat: true,
  },
   {
    id: "myvideoeditor",
    title: "My Video Editor",
    desc: "Video Edit for short",
  }
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [openMenu, setOpenMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [missedVoiceCount, setMissedVoiceCount] = useState(0);   // ✅ NEW
  const [missedVideoCount, setMissedVideoCount] = useState(0);   // ✅ NEW

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    setUser(currentUser);

    const db = getFirestore();
    const uid = currentUser.uid;
    const messagesRef = collection(db, "messages");

    // ══════════════════════════════════════════════════
    // ✅ UNREAD MESSAGES (chat messages only, not calls)
    // ══════════════════════════════════════════════════
    const unreadQuery = query(
      messagesRef,
      where("participants", "array-contains", uid),
      where("read", "==", false)
    );

    const unreadUnsub = onSnapshot(unreadQuery, (snapshot) => {
      const count = snapshot.docs.filter((doc) => {
        const d = doc.data();
        return d.senderId !== uid && d.type !== "call";
      }).length;
      setUnreadCount(count);
    });

    // ══════════════════════════════════════════════════
    // ✅ MISSED VOICE CALLS
    // callType === "voice" (ya "audio") — apne Firestore
    // field name ke hisaab se adjust karein
    // ══════════════════════════════════════════════════
    const missedVoiceQuery = query(
  messagesRef,
  where("participants", "array-contains", uid),
  where("type", "==", "call"),
  where("callStatus", "==", "missed"),
  where("callType", "==", "audio"),
  where("read", "==", false) // 🔥 ADD THIS
);

    const missedVoiceUnsub = onSnapshot(missedVoiceQuery, (snapshot) => {
      const count = snapshot.docs.filter(
        (doc) => doc.data().senderId !== uid
      ).length;
      setMissedVoiceCount(count);
    });

    // ══════════════════════════════════════════════════
    // ✅ MISSED VIDEO CALLS
    // callType === "video"
    // ══════════════════════════════════════════════════
   const missedVideoQuery = query(
  messagesRef,
  where("participants", "array-contains", uid),
  where("type", "==", "call"),
  where("callStatus", "==", "missed"),
  where("callType", "==", "video"),
  where("read", "==", false) // 🔥 ADD THIS
);

    const missedVideoUnsub = onSnapshot(missedVideoQuery, (snapshot) => {
      const count = snapshot.docs.filter(
        (doc) => doc.data().senderId !== uid
      ).length;
      setMissedVideoCount(count);
    });

    return () => {
      unreadUnsub();
      missedVoiceUnsub();
      missedVideoUnsub();
    };
  }, [router]);

  const handleLogout = () => {
    signOutUser();
    router.replace("/login");
  };

  if (!user) {
    return (
      <div className={styles.loaderWrapper}>
        <div className={styles.loader}></div>
        <p>Checking session...</p>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.logoSection}>
          <LayoutDashboardIcon size={24} />
          <h1>Dashboard</h1>
        </div>
        <div className={styles.profile} onClick={() => setOpenMenu(!openMenu)}>
          <img src={user.photoURL || Avatar.src} alt="profile" />
          <span>{user.displayName || user.email}</span>
          {openMenu && (
            <div className={styles.dropdown}>
              <button onClick={() => router.push("/profile")}>
                <User size={16} /> Profile
              </button>
              <button onClick={handleLogout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* DASHBOARD CARDS */}
      <section className={styles.cardGrid}>
        {TOOLS.map((tool) => (
          <div
            key={tool.id}
            className={styles.toolCard}
            onClick={() => router.push(`/dashboard/${tool.id}`)}
          >
            <h3>{tool.title}</h3>
            <p>{tool.desc}</p>

            {/* ✅ WebChat card — Teen alag badges */}
            {tool.isWebchat && (
              <div className={styles.badgeRow}>
                {/* 💬 Unread Messages */}
                {unreadCount > 0 && (
                  <span className={`${styles.badge} ${styles.badgeUnread}`}>
                    💬 {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}

                {/* 📞 Missed Voice Calls */}
                {missedVoiceCount > 0 && (
                  <span className={`${styles.badge} ${styles.badgeVoice}`}>
                    📞 {missedVoiceCount > 99 ? "99+" : missedVoiceCount}
                  </span>
                )}

                {/* 📹 Missed Video Calls */}
                {missedVideoCount > 0 && (
                  <span className={`${styles.badge} ${styles.badgeVideo}`}>
                    📹 {missedVideoCount > 99 ? "99+" : missedVideoCount}
                  </span>
                )}
              </div>
            )}

            <span>Open →</span>
          </div>
        ))}
      </section>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <span>MyDashboard {APP_VERSION}</span>
        <span className={styles.dot}>•</span>
        <span>Last Update {LASTUPDATE_DATE}</span>
      </footer>
    </main>
  );
}
