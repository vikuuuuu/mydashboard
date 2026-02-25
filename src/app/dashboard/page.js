"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import { getCurrentUser, signOutUser } from "@/lib/firebaseAuth";
import { LayoutDashboardIcon } from "lucide-react";

const TOOLS = [
  { id: "img-to-pdf", title: "Image to PDF", desc: "Convert images into PDF" },
  { id: "pdf-to-img", title: "PDF to Image", desc: "Extract images from PDF" },
  { id: "video-to-img", title: "Video to Image", desc: "Capture video frame" },
  { id: "img-resize", title: "Image Resize", desc: "Resize image dimensions" },
  { id: "pdf-resize", title: "PDF Resize", desc: "Reduce PDF size" },
  { id: "img-format", title: "Image Format", desc: "JPG / PNG convert" },
  { id: "Notes", title: "Our Notes", desc: "Create Notes " },

];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

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
    return <div className={styles.loader}>Loading dashboard...</div>;
  }

  return (
    <main className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1> <LayoutDashboardIcon className="w-6 h-6 mr-2 inline" /> Dashboard</h1>
          <p>Welcome, {user.email}</p>
        </div>
        <div className={styles.profile}>
          <img src={user.photoURL || "/avatar.png"} />
          {/* <span>{user.email}</span> */}

          <div className={styles.dropdown}>
            <button onClick={() => router.push("/profile")}>Profile</button>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
        {/* <button className={styles.logoutBtn} onClick={handleLogout}>
          Logout
        </button> */}
      </header>

      {/* Tool Cards */}
      <section className={styles.cardGrid}>
        {TOOLS.map((tool) => (
          <div
            key={tool.id}
            className={styles.toolCard}
            onClick={() => router.push(`/dashboard/${tool.id}`)}
          >
            <h3>{tool.title}</h3>
            <p>{tool.desc}</p>
            <span className={styles.openText}>Open →</span>
          </div>
        ))}
      </section>
    </main>
  );
}
