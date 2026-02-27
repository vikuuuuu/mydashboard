"use client";

import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import styles from "./toolLayout.module.css";

export default function UsageHistory({ userId, tool }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !tool) return;

    const load = async () => {
      try {
        const db = getFirestore(app);

        const q = query(
          collection(db, "tool_usage"),
          where("userId", "==", userId),
          where("tool", "==", tool), // ✅ FILTER BY TOOL
          orderBy("createdAt", "desc"),
          limit(10)
        );

        const snap = await getDocs(q);

        setHistory(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      } catch (err) {
        console.error("History error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId, tool]);

  const formatDate = (ts) => {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toolLabel = {
    "image-to-pdf": "Image → PDF",
    "video-to-image": "Video → Image",
    "pdf-to-img": "PDF → Image",
  };

  return (
    <aside className={styles.sidePanel}>
      <h3>Your History ({history.length})</h3>

      {loading && <p className={styles.emptyText}>Loading…</p>}

      {!loading && history.length === 0 && (
        <p className={styles.emptyText}>No history yet</p>
      )}

      {history.map((h) => (
        <div key={h.id} className={styles.historyItem}>
          <p>
            <strong>{toolLabel[h.tool] || h.tool}</strong>
          </p>
          <small>
            {h.imageCount} images · {h.totalSizeKB} KB
          </small>
          <br />
          <small className={styles.dateText}>
            {formatDate(h.createdAt)}
          </small>
        </div>
      ))}
    </aside>
  );
}