"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import { getCurrentUser, signOutUser } from "@/lib/firebaseAuth";
import { LayoutDashboardIcon, LogOut, User } from "lucide-react";
import { APP_VERSION, LASTUPDATE_DATE } from "@/lib/appVersion";
import Avatar from "../../../public/avatar.png";

const TOOLS = [
  { id: "Notes", title: "Notes", desc: "Create & Export Notes" },
  { id: "private_video_chat", title: "Private Video Chat", desc: "Secure video calls and  it working on same Network." },
  { id: "img-to-pdf", title: "Image to PDF", desc: "Convert images to PDF" },
  { id: "video-to-img", title: "Video to Image", desc: "Capture video frames" },
  { id: "myfinancials", title: "My Financials", desc: "Track investments & profit" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [openMenu, setOpenMenu] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.replace("/login");
    } else {
      setUser(currentUser);
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

        <div
          className={styles.profile}
          onClick={() => setOpenMenu(!openMenu)}
        >
          <img
            src={user.photoURL || Avatar.src}
            alt="profile"
          />
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