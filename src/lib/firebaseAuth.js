// File Path: lib/firebaseAuth.js
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
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

/* ── Google Login ──────────────────────────────────────────
   Strategy:
   1. Popup try karo
   2. Popup block/close → redirect fallback
   3. Redirect result → login page useEffect mein pakdo
      via getGoogleRedirectResult()
─────────────────────────────────────────────────────────── */
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    await setDoc(
      doc(db, "users", user.uid),
      {
        name:      user.displayName || "",
        email:     user.email,
        photoURL:  user.photoURL || "",
        provider:  "google",
        isPrivate: false,
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );

    return result;

  } catch (err) {
    if (
      err.code === "auth/popup-closed-by-user"    ||
      err.code === "auth/popup-blocked"            ||
      err.code === "auth/cancelled-popup-request"
    ) {
      // Browser ne popup block kiya — redirect use karo
      await signInWithRedirect(auth, googleProvider);
      return null; // Page reload hoga, result useEffect mein milega
    }
    throw err;
  }
};

/* ── Redirect Result ─────────────────────────────────────
   Login page useEffect mein yeh call karo:

   useEffect(() => {
     getGoogleRedirectResult().then(async (result) => {
       if (result?.user) {
         await logLogin({ userId: result.user.uid, provider: "google" });
         router.replace("/dashboard");
       }
     }).catch(() => {});
   }, []);
─────────────────────────────────────────────────────────── */
export const getGoogleRedirectResult = () => getRedirectResult(auth);

/* ── Register with Email ── */
export const registerWithEmail = async (name, email, password) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user   = result.user;

  await updateProfile(user, { displayName: name });

  await setDoc(doc(db, "users", user.uid), {
    name,
    email,
    photoURL:  "",
    provider:  "email",
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