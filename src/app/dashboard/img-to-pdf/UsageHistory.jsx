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
import styles from "../pages.module.css";

export default function UsageHistory({ userId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      try {
        const db = getFirestore(app);

        const q = query(
          collection(db, "tool_usage"),
          where("userId", "==", userId),
          where("createdAt", "!=", null),
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
  }, [userId]);

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTool = (tool) => {
    if (tool === "image-to-pdf") return "Image → PDF";
    if (tool === "pdf-to-img") return "PDF → Image";
    return tool;
  };

  return (
    <aside className={styles.sidePanel}>
      <h3>Your History</h3>

      {loading && <p className={styles.emptyText}>Loading...</p>}

      {!loading && history.length === 0 && (
        <p className={styles.emptyText}>No history yet</p>
      )}

      {history.map((h) => (
        <div key={h.id} className={styles.historyItem}>
          <p>
            <strong>{formatTool(h.tool)}</strong>
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
