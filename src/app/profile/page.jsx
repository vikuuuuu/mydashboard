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

  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const [toolHistory, setToolHistory] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);

  /* ================= AUTH GUARD ================= */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      setUser(u);
      setName(u.displayName || "");

      await loadToolHistory(u.uid);
      await loadLoginLogs(u.uid);

      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  /* ================= FIRESTORE LOADERS ================= */
  const loadToolHistory = async (uid) => {
    const db = getFirestore(app);
    const q = query(
      collection(db, "tool_usage"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    setToolHistory(snap.docs.map((d) => d.data()));
  };

  const loadLoginLogs = async (uid) => {
    const db = getFirestore(app);
    const q = query(
      collection(db, "login_logs"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    setLoginLogs(snap.docs.map((d) => d.data()));
  };

  /* ================= ACTIONS ================= */
  const saveProfile = async () => {
    await updateProfile(auth.currentUser, {
      displayName: name,
    });
    alert("Profile updated successfully");
  };

  const resetPassword = async () => {
    await sendPasswordResetEmail(auth, user.email);
    alert("Password reset email sent");
  };

  if (loading) {
    return <p className={styles.loading}>Loading profile…</p>;
  }

  return (
    <main className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        ← Back
      </button>
      <h1 className={styles.title}>My Profile</h1>
      <div className={styles.cardParent}>
        {/* PROFILE INFO */}
        <section className={styles.card}>
          <img src={user.photoURL || "/avatar.png"} className={styles.avatar} />

          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className={styles.label}>Email</label>
          <input className={styles.input} value={user.email} disabled />

          <button className={styles.primaryBtn} onClick={saveProfile}>
            Save Profile
          </button>
        </section>

        {/* SECURITY */}
        <section className={styles.card}>
          <h3>Security</h3>
          <button className={styles.secondaryBtn} onClick={resetPassword}>
            Send Password Reset Email
          </button>
        </section>

        {/* LOGIN LOGS */}
        <section className={styles.card}>
          <h3>Login Activity</h3>
          <div className={styles.cardContent}>
            {loginLogs.length === 0 && (
              <p className={styles.empty}>No login activity</p>
            )}

            {loginLogs.map((log, i) => (
              <div key={i} className={styles.listItem}>
                <strong>{log.provider || "Email / Google"}</strong>
                <small>{log.createdAt?.toDate().toLocaleString()}</small>
              </div>
            ))}
          </div>
        </section>

        {/* TOOL HISTORY */}
        <section className={styles.card}>
          <h3>Tool Usage History</h3>
          <div className={styles.cardContent}>
            {" "}
            {toolHistory.length === 0 && (
              <p className={styles.empty}>No tool usage yet</p>
            )}
            {toolHistory.map((h, i) => (
              <div key={i} className={styles.listItem}>
                <strong>{formatTool(h.tool)}</strong>
                <small>
                  {h.imageCount} items · {h.totalSizeKB} KB ·{" "}
                  {h.createdAt?.toDate().toLocaleString()}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ================= HELPER ================= */
function formatTool(tool) {
  if (tool === "image-to-pdf") return "Image → PDF";
  if (tool === "pdf-to-img") return "PDF → Image";
  if (tool === "img-resize") return "Image Resize";
  return tool;
}

