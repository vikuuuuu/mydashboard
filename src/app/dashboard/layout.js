"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseAuth";
import styles from "./dashboard.module.css";


export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
      }
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  if (checking) {
    return <p className={styles.checkingSession}>Checking authentication...</p>;
  }

  return <>{children}</>;
}
