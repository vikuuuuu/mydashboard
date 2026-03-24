"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import { getCurrentUser, signOutUser } from "@/lib/firebaseAuth";
import { LayoutDashboardIcon, LogOut, User } from "lucide-react";
import { APP_VERSION, LASTUPDATE_DATE } from "@/lib/appVersion";
import Avatar from "../../../public/avatar.png";

// ✅ Firebase Realtime Database import — apne project ke hisaab se path adjust karein
import { getDatabase, ref, onValue } from "firebase/database";

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
    // ✅ isWebchat flag — badge sirf isi card pe dikhega
    isWebchat: true,
  },
  {
    id: "private_video_chat",
    title: "Private Video Chat",
    desc: "Secure video calls and it working on same Network.",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [openMenu, setOpenMenu] = useState(false);

  // ✅ Badge counts state
  const [unreadCount, setUnreadCount] = useState(0);
  const [missedCallCount, setMissedCallCount] = useState(0);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.replace("/login");
    } else {
      setUser(currentUser);

      // ✅ Firebase se unread messages count listen karein
      // Path: "webchat/unread/{userId}" — apne DB structure ke hisaab se change karein
      const db = getDatabase();

      const unreadRef = ref(db, `webchat/unread/${currentUser.uid}`);
      const unreadUnsub = onValue(unreadRef, (snapshot) => {
        const val = snapshot.val();
        // val ek number ho sakta hai ya object {chatId: count, ...}
        if (typeof val === "number") {
          setUnreadCount(val);
        } else if (val && typeof val === "object") {
          // Sabhi chats ke unread sum karein
          const total = Object.values(val).reduce(
            (acc, n) => acc + (typeof n === "number" ? n : 0),
            0
          );
          setUnreadCount(total);
        } else {
          setUnreadCount(0);
        }
      });

      // ✅ Firebase se missed calls count listen karein
      // Path: "webchat/missedCalls/{userId}" — apne DB structure ke hisaab se change karein
      const missedRef = ref(db, `webchat/missedCalls/${currentUser.uid}`);
      const missedUnsub = onValue(missedRef, (snapshot) => {
        const val = snapshot.val();
        if (typeof val === "number") {
          setMissedCallCount(val);
        } else if (val && typeof val === "object") {
          const total = Object.values(val).reduce(
            (acc, n) => acc + (typeof n === "number" ? n : 0),
            0
          );
          setMissedCallCount(total);
        } else {
          setMissedCallCount(0);
        }
      });

      // Cleanup listeners on unmount
      return () => {
        unreadUnsub();
        missedUnsub();
      };
    }
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

            {/* ✅ Sirf webchat card pe badges dikhao */}
            {tool.isWebchat && (
              <div className={styles.badgeRow}>
                {/* Unread Messages Badge */}
                {unreadCount > 0 && (
                  <span className={styles.badgeUnread} title="Unread messages">
                    💬 {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}

                {/* Missed Calls Badge */}
                {missedCallCount > 0 && (
                  <span className={styles.badgeMissed} title="Missed calls">
                    📵 {missedCallCount > 99 ? "99+" : missedCallCount}
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
