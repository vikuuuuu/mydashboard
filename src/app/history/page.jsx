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

export default function HistoryPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      const db = getFirestore(app);
      const q = query(
        collection(db, "tool_usage"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setData(snap.docs.map((d) => d.data()));
    };

    load();
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: "40px auto" }}>
      <h1>All Tool History</h1>

      {data.map((h, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <strong>{h.tool}</strong>
          <div>{h.imageCount} images</div>
          <small>
            {h.createdAt?.toDate().toLocaleString()}
          </small>
        </div>
      ))}
    </main>
  );
}