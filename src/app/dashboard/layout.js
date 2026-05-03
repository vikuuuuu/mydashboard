"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseAuth";

import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

import { getSessionId } from "@/lib/sessionManager";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unsubSession = null;
    let isLoggingOut = false;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        isLoggingOut = true;
        router.replace("/login");
        return;
      }

      const sessionId = getSessionId();

      const ref = collection(db, "user_sessions", user.uid, "sessions");

      unsubSession = onSnapshot(
        ref,
        (snap) => {
          if (isLoggingOut) return;

          let valid = false;

          snap.forEach((doc) => {
            if (doc.data().sessionId === sessionId) {
              valid = true;
            }
          });

          if (!valid) {
            isLoggingOut = true;

            if (unsubSession) unsubSession();

            alert("Logged out from another device");

            signOut(auth);
            router.replace("/login");
          }
        },
        () => {} // ignore errors
      );

      setChecking(false);
    });

    return () => {
      unsubAuth();
      if (unsubSession) unsubSession();
    };
  }, [router]);

  if (checking) return <p>Checking session...</p>;

  return <>{children}</>;
}