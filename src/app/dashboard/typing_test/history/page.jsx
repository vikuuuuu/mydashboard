"use client";

import { useState, useEffect, useCallback } from "react";
import { useTypingSettings } from "../layout";
import { getTypingHistory } from "@/lib/firestoreTyping";
import styles from "./page.module.css";

export default function HistoryPage() {
  const { user } = useTypingSettings();
  const [sessions, setSessions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (nextCursor = null) => {
      if (!user) return;
      setLoading(true);
      try {
        const { sessions: page, lastDoc, hasMore: more } = await getTypingHistory(user.uid, {
          pageSize: 15,
          cursor: nextCursor,
        });
        setSessions((prev) => (nextCursor ? [...prev, ...page] : page));
        setCursor(lastDoc);
        setHasMore(more);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) loadPage(null);
  }, [user, loadPage]);

  if (user === undefined) return <p>Loading…</p>;
  if (user === null) return <p>Sign in to view your typing history.</p>;

  return (
    <div>
      {sessions.length === 0 && !loading && <p>No sessions yet — go practice!</p>}

      <div className={styles.list}>
        {sessions.map((s) => (
          <div key={s.id} className={styles.row}>
            <span className={styles.mode}>{s.mode}</span>
            <span className={styles.lang}>{s.language === "hi" ? "हिंदी" : "EN"}</span>
            <span>{s.difficulty}</span>
            <span className={styles.wpm}>{s.wpm} WPM</span>
            <span>{s.accuracy}%</span>
            <span className={styles.date}>
              {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : "—"}
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button className={styles.loadMore} onClick={() => loadPage(cursor)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
