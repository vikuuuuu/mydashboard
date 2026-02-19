import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { app } from "./firebase";

/* ======================
   AUTH INSTANCE
====================== */
export const auth = getAuth(app);

/* ======================
   GET CURRENT USER
====================== */
export const getCurrentUser = () => auth.currentUser;

/* ======================
   EMAIL / PASSWORD LOGIN
====================== */
export const signInWithEmail = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

/* ======================
   GOOGLE LOGIN
====================== */
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => {
  return signInWithPopup(auth, googleProvider);
};

/* ======================
   LOGOUT
====================== */
export const signOutUser = () => {
  return signOut(auth);
};
