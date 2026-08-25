// lib/firestoreTyping.js
// Assumes you already export `db` and `auth` from your existing
// lib/firebase.js — adjust the import path below to match your project.

import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Save a completed typing session + update the user's aggregate profile.
 * Uses a transaction so concurrent sessions (e.g. two tabs) don't clobber
 * bestWpm/streak fields.
 *
 * @param {string} uid
 * @param {object} session { mode, language, difficulty, wpm, accuracy, errorCount, backspaceCount, durationSeconds, level? }
 */
export async function saveTypingSession(uid, session) {
  if (!uid) throw new Error("saveTypingSession: uid required");

  const sessionRef = doc(collection(db, "users", uid, "typingSessions"));
  const profileRef = doc(db, "users", uid, "typingMeta", "profile");

  await runTransaction(db, async (tx) => {
    const profileSnap = await tx.get(profileRef);
    const prev = profileSnap.exists()
      ? profileSnap.data()
      : {
          currentLevel: { hindi: 1, english: 1 },
          bestWpm: { hindi: 0, english: 0 },
          bestAccuracy: { hindi: 0, english: 0 },
          totalSessions: 0,
          totalTimeSpent: 0,
          streakDays: 0,
          lastPracticeDate: null,
        };

    const langKey = session.language === "hi" ? "hindi" : "english";
    const today = new Date().toISOString().slice(0, 10);
    const isNewDay = prev.lastPracticeDate !== today;
    const wasYesterday =
      prev.lastPracticeDate &&
      new Date(today) - new Date(prev.lastPracticeDate) === 86400000;

    const updatedProfile = {
      ...prev,
      bestWpm: {
        ...prev.bestWpm,
        [langKey]: Math.max(prev.bestWpm?.[langKey] || 0, session.wpm),
      },
      bestAccuracy: {
        ...prev.bestAccuracy,
        [langKey]: Math.max(prev.bestAccuracy?.[langKey] || 0, session.accuracy),
      },
      totalSessions: (prev.totalSessions || 0) + 1,
      totalTimeSpent: (prev.totalTimeSpent || 0) + (session.durationSeconds || 0),
      streakDays: isNewDay ? (wasYesterday ? (prev.streakDays || 0) + 1 : 1) : prev.streakDays || 1,
      lastPracticeDate: today,
      updatedAt: serverTimestamp(),
    };

    // Learn-mode level unlock: only advance if this session passed the
    // difficulty's accuracy target (checked by caller before calling this
    // with `session.levelPassed = true`)
    if (session.mode === "learn" && session.levelPassed) {
      updatedProfile.currentLevel = {
        ...prev.currentLevel,
        [langKey]: Math.max(prev.currentLevel?.[langKey] || 1, (session.level || 1) + 1),
      };
    }

    tx.set(profileRef, updatedProfile, { merge: true });
    tx.set(sessionRef, {
      ...session,
      createdAt: serverTimestamp(),
    });
  });

  return sessionRef.id;
}

/** Fetch the user's aggregate typing profile (best WPM, streak, level, etc.) */
export async function getTypingProfile(uid) {
  const { getDoc } = await import("firebase/firestore");
  const profileRef = doc(db, "users", uid, "typingMeta", "profile");
  const snap = await getDoc(profileRef);
  return snap.exists() ? snap.data() : null;
}

/** Paginated session history — call again with the last doc for next page */
export async function getTypingHistory(uid, { pageSize = 20, cursor = null } = {}) {
  const base = collection(db, "users", uid, "typingSessions");
  const q = cursor
    ? query(base, orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize))
    : query(base, orderBy("createdAt", "desc"), limit(pageSize));

  const snap = await getDocs(q);
  return {
    sessions: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  };
}

/** Optional: write a leaderboard entry for Game mode (debounce/rate-limit on the caller side) */
export async function submitLeaderboardScore(uid, displayName, { language, difficulty, wpm, accuracy }) {
  const boardId = `${language}_${difficulty}`;
  await addDoc(collection(db, "typingLeaderboard", boardId, "entries"), {
    uid,
    displayName,
    wpm,
    accuracy,
    createdAt: serverTimestamp(),
  });
}
