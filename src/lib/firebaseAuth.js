import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "firebase/auth";

import {
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";

import { app, db } from "./firebase";

/* ======================
   AUTH INSTANCE
====================== */

export const auth = getAuth(app);

/* ======================
   GET CURRENT USER
====================== */

export const getCurrentUser = () => {
  return auth.currentUser;
};

/* ======================
   EMAIL / PASSWORD LOGIN
====================== */

export const signInWithEmail = async (email, password) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

/* ======================
   GOOGLE LOGIN
====================== */

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {

  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  /* Save user in Firestore */

  await setDoc(
    doc(db, "users", user.uid),
    {
      name: user.displayName || "",
      email: user.email,
      photoURL: user.photoURL || "",
      provider: "google",
      isPrivate: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    },
    { merge: true }
  );

  return result;
};

/* ======================
   REGISTER WITH EMAIL
====================== */

export const registerWithEmail = async (name, email, password) => {

  const result = await createUserWithEmailAndPassword(auth, email, password);

  const user = result.user;

  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    photoURL: "",
    provider: "email",
    isPrivate: false,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  });

  return result;
};

/* ======================
   RESET PASSWORD
====================== */

export const changePassword = async (email) => {
  return await sendPasswordResetEmail(auth, email);
};

/* ======================
   LOGOUT
====================== */

export const signOutUser = async () => {
  return await signOut(auth);
};