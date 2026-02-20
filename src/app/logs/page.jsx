"use client";

import { useEffect, useState } from "react";
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

export default function LoginLogsPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const load = async () => {
      const db = getFirestore(app);
      const q = query(
        collection(db, "login_logs"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setLogs(snap.docs.map((d) => d.data()));
    };

    load();
  }, []);

  return (
    <main style={{ maxWidth: 600, margin: "40px auto" }}>
      <h1>Login Timeline</h1>

      {logs.map((l, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <strong>{l.provider}</strong>
          <div>{l.email}</div>
          <small>
            {l.createdAt?.toDate().toLocaleString()}
          </small>
        </div>
      ))}
    </main>
  );
}