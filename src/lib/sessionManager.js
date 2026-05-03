// File: lib/sessionManager.js

import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { getDeviceDetails } from "@/lib/getDeviceDetails";
import { auth } from "@/lib/firebaseAuth";

/* ───────────────────────────── */
const waitForAuth = () => {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
  });
};

/* ───────────────────────────── */
export const getSessionId = () => {
  if (typeof window === "undefined") return null;

  let sid = sessionStorage.getItem("app_session_id");

  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    sessionStorage.setItem("app_session_id", sid);
  }

  return sid;
};

/* ───────────────────────────── */
export const registerSession = async (uid) => {
  try {
    const details = await getDeviceDetails();
    const sessionId = getSessionId();

    await setDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId),
      {
        sessionId,
        uid,
        ip: details?.ip || "",
        browser: details?.browser || "",
        os: details?.os || "",
        deviceType: details?.deviceType || "",
        location: details?.location || "",
        loginAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      }
    );
  } catch (err) {
    console.warn("Session register failed:", err);
  }
};

/* ───────────────────────────── */
export const checkExistingSession = async (uid) => {
  try {
    await waitForAuth();

    const mySession = getSessionId();

    const snap = await getDocs(
      collection(db, "user_sessions", uid, "sessions")
    );

    let conflict = null;

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      if (data.sessionId !== mySession) {
        conflict = data;
      }
    });

    return conflict;
  } catch (err) {
    console.warn("Session check failed:", err);
    return null;
  }
};

/* ───────────────────────────── */
export const forceRegisterSession = async (uid) => {
  try {
    await waitForAuth();

    const snap = await getDocs(
      collection(db, "user_sessions", uid, "sessions")
    );

    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }

    await registerSession(uid);
  } catch (err) {
    console.warn("Force session failed:", err);
  }
};

/* ───────────────────────────── */
export const pingSession = async (uid) => {
  try {
    const sessionId = getSessionId();

    await setDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId),
      { lastSeen: serverTimestamp() },
      { merge: true }
    );
  } catch (_) {}
};

/* ───────────────────────────── */
export const clearSession = async (uid) => {
  try {
    const sessionId = getSessionId();

    await deleteDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId)
    );

    sessionStorage.removeItem("app_session_id");
  } catch (err) {
    console.warn("Clear session failed:", err);
  }
};