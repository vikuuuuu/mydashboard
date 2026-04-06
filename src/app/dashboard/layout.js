"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseAuth";
import { logPageVisit } from "@/lib/activityLogger";
import styles from "./dashboard.module.css";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [activeUser, setActiveUser] = useState(null);
  const loggedRouteRef = useRef("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setActiveUser(user);
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!activeUser || !pathname) return;

    const routeKey = `${activeUser.uid}:${pathname}`;
    if (loggedRouteRef.current === routeKey) return;

    loggedRouteRef.current = routeKey;
    logPageVisit({
      userId: activeUser.uid,
      page: pathname,
      meta: { source: "dashboard_layout" },
    });
  }, [activeUser, pathname]);

  if (checking) {
    return (
      <div className={styles.checkingSession}>
        <div className={styles.loaderSession}></div>
        <p>Checking Authentication...</p>
      </div>
    );
  }

  return <>{children}</>;
}
