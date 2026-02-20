"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseAuth"; // 👈 auth export karo
import styles from "./dashboard/dashboard.module.css";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  return checking ? (
    <div className={styles.checkingSession}>
      <div className={styles.loaderSession}></div>
      <p>Checking session...</p>
    </div>
  ) : null;
}
