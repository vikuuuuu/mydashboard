"use client";

import { useEffect } from "react";
import { initializeFirebaseAnalytics } from "@/lib/firebase";

export default function FirebaseAnalyticsInit() {
  useEffect(() => {
    initializeFirebaseAnalytics();
  }, []);

  return null;
}
