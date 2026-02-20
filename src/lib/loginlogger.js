import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

const db = getFirestore(app);

export const logLogin = async ({ userId, provider }) => {
  try {
    await addDoc(collection(db, "login_logs"), {
      userId,
      provider, // "email" | "google"
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Login log failed:", err);
  }
};