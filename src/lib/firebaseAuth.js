// File: lib/firebaseAuth.js

import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./firebase";

/* ── Auth Instance ── */
export const auth = getAuth(app);

/* ── Google Provider ── */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/* ── Get Current User ── */
export const getCurrentUser = () => auth.currentUser;

/* ── Email Login ── */
export const signInWithEmail = async (email, password) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

/* ── Google Login (FINAL FIXED) ── */
export const signInWithGoogle = async () => {
  try {
    // 🔥 ALWAYS redirect (no popup issues)
    await signInWithRedirect(auth, googleProvider);
    return null;
  } catch (err) {
    throw err;
  }
};

/* ── Handle Redirect Result ── */
export const getGoogleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);

    if (!result) return null;

    const user = result.user;

    // 🔥 Save user in Firestore
    await setDoc(
      doc(db, "users", user.uid),
      {
        name: user.displayName || "",
        email: user.email,
        photoURL: user.photoURL || "",
        provider: "google",
        isPrivate: false,
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );

    return result;
  } catch (err) {
    console.error("Redirect login error:", err);
    return null;
  }
};

/* ── Register with Email ── */
export const registerWithEmail = async (name, email, password) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = result.user;

  await updateProfile(user, { displayName: name });

  await setDoc(doc(db, "users", user.uid), {
    name,
    email,
    photoURL: "",
    provider: "email",
    isPrivate: false,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  });

  return result;
};

/* ── Reset Password ── */
export const changePassword = async (email) => {
  return await sendPasswordResetEmail(auth, email);
};

/* ── Logout ── */
export const signOutUser = async () => {
  return await signOut(auth);
};