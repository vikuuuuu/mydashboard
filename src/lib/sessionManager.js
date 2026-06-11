import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { getDeviceDetails } from "@/lib/getDeviceDetails";

export const getSessionId = () => {
  if (typeof window === "undefined") return null;

  let sid = localStorage.getItem("app_session_id");

  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem("app_session_id", sid);
  }

  return sid;
};

export const registerSession = async (uid) => {
  const details = await getDeviceDetails();

  await setDoc(doc(db, "user_sessions", uid), {
    uid,
    sessionId: getSessionId(),
    browser: details.browser || "",
    os: details.os || "",
    ip: details.ip || "",
    location: details.location || "",
    loginAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });
};

export const checkExistingSession = async (uid) => {
  const snap = await getDoc(doc(db, "user_sessions", uid));

  if (!snap.exists()) return null;

  const data = snap.data();

  if (data.sessionId !== getSessionId()) {
    return data;
  }

  return null;
};

export const forceRegisterSession = async (uid) => {
  await registerSession(uid);
};

export const pingSession = async (uid) => {
  await setDoc(
    doc(db, "user_sessions", uid),
    {
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
};

export const clearSession = async (uid) => {
  try {
    await deleteDoc(doc(db, "user_sessions", uid));

    localStorage.removeItem("app_session_id");
    sessionStorage.clear();
  } catch (err) {
    console.error(err);
  }
};
