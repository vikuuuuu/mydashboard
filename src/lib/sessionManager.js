// File: lib/sessionManager.js
// FIXED: Logout properly clears session so login doesn't show false "already logged in" popup

import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { getDeviceDetails } from "@/lib/getDeviceDetails";
import { auth } from "@/lib/firebaseAuth";

/* ─────────────────────────────────────────────────
   Session ID — stored in sessionStorage
   Each browser tab/window gets its own session ID
───────────────────────────────────────────────── */
export const getSessionId = () => {
  if (typeof window === "undefined") return null;
  let sid = sessionStorage.getItem("app_session_id");
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("app_session_id", sid);
  }
  return sid;
};

/* ─────────────────────────────────────────────────
   Wait for Firebase Auth to be ready
───────────────────────────────────────────────── */
const waitForAuth = () =>
  new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });

/* ─────────────────────────────────────────────────
   REGISTER SESSION
   Call this after successful login.
   Clears all old sessions first, then writes this one.
   This prevents false "already logged in" detection.
───────────────────────────────────────────────── */
export const registerSession = async (uid) => {
  try {
    const sessionId = getSessionId();
    const details   = await getDeviceDetails().catch(() => ({}));

    // Delete ALL previous sessions for this user before registering new one
    // This ensures clean slate — no stale sessions from before
    const oldSessions = await getDocs(
      collection(db, "user_sessions", uid, "sessions")
    ).catch(() => null);

    if (oldSessions) {
      const deletePromises = [];
      oldSessions.forEach((d) => {
        // Only delete sessions that are NOT the current one
        if (d.id !== sessionId) {
          deletePromises.push(deleteDoc(d.ref));
        }
      });
      await Promise.allSettled(deletePromises);
    }

    // Write current session to Firestore
    await setDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId),
      {
        sessionId,
        uid,
        ip:         details?.ip         || "",
        browser:    details?.browser    || "",
        os:         details?.os         || "",
        deviceType: details?.deviceType || "",
        location:   details?.location   || "",
        loginAt:    serverTimestamp(),
        lastSeen:   serverTimestamp(),
      }
    );

    // Also update the top-level doc (used by dashboard to detect conflicts)
    await setDoc(
      doc(db, "user_sessions", uid),
      { sessionId, lastUpdated: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.warn("Session register failed:", err);
  }
};

/* ─────────────────────────────────────────────────
   CLEAR SESSION (called on logout)
   Removes this device's session from Firestore
   AND clears the top-level sessionId doc.
   This prevents the next login from seeing stale data.
───────────────────────────────────────────────── */
export const clearSession = async (uid) => {
  try {
    const sessionId = getSessionId();

    // Delete this session from sub-collection
    await deleteDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId)
    ).catch(() => {});

    // Clear the top-level doc's sessionId so login page doesn't falsely detect conflict
    await setDoc(
      doc(db, "user_sessions", uid),
      { sessionId: null, lastUpdated: serverTimestamp() },
      { merge: true }
    ).catch(() => {});

    // Clear local session storage
    sessionStorage.removeItem("app_session_id");
  } catch (err) {
    console.warn("Clear session failed:", err);
  }
};

/* ─────────────────────────────────────────────────
   PING SESSION — keeps session alive (every 60s)
───────────────────────────────────────────────── */
export const pingSession = async (uid) => {
  try {
    const sessionId = getSessionId();
    if (!sessionId || !uid) return;
    await setDoc(
      doc(db, "user_sessions", uid, "sessions", sessionId),
      { lastSeen: serverTimestamp() },
      { merge: true }
    );
  } catch (_) {
    // Silent — ping failures should not break anything
  }
};

/* ─────────────────────────────────────────────────
   CHECK EXISTING SESSION
   Used on login page to detect if user is already
   logged in on another device.

   FIX: Only shows conflict if:
   1. A session exists in Firestore AND
   2. It's a DIFFERENT session ID than ours AND
   3. The session was seen recently (< 10 minutes ago)
   
   This prevents showing popup after a clean logout.
───────────────────────────────────────────────── */
export const checkExistingSession = async (uid) => {
  try {
    await waitForAuth();
    const mySessionId = getSessionId();

    // Check the top-level doc first (faster)
    const topDoc = await getDoc(doc(db, "user_sessions", uid)).catch(() => null);
    if (topDoc?.exists()) {
      const data = topDoc.data();
      // If sessionId is null or cleared, no conflict
      if (!data?.sessionId) return null;
      // If it matches ours, no conflict
      if (data.sessionId === mySessionId) return null;
    }

    // Check sub-collection for active sessions
    const snap = await getDocs(
      collection(db, "user_sessions", uid, "sessions")
    ).catch(() => null);

    if (!snap || snap.empty) return null;

    const TEN_MINUTES = 10 * 60 * 1000;
    const now         = Date.now();
    let conflict      = null;

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.sessionId === mySessionId) return; // skip our own session

      // Check if this session is still active (seen within 10 minutes)
      const lastSeen = data.lastSeen?.toDate?.()?.getTime() || 0;
      const isActive = now - lastSeen < TEN_MINUTES;

      if (isActive) {
        conflict = data;
      }
    });

    return conflict;
  } catch (err) {
    console.warn("Session check failed:", err);
    return null; // On error, don't block login
  }
};

/* ─────────────────────────────────────────────────
   FORCE REGISTER SESSION
   Called when user chooses "Log out other device"
   Clears all sessions, then registers this one.
───────────────────────────────────────────────── */
export const forceRegisterSession = async (uid) => {
  try {
    await waitForAuth();

    // Delete all existing sessions
    const snap = await getDocs(
      collection(db, "user_sessions", uid, "sessions")
    ).catch(() => null);

    if (snap) {
      const deletePromises = [];
      snap.forEach((d) => deletePromises.push(deleteDoc(d.ref)));
      await Promise.allSettled(deletePromises);
    }

    // Register fresh session
    await registerSession(uid);
  } catch (err) {
    console.warn("Force session failed:", err);
  }
};
