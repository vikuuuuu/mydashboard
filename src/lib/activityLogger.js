import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

const db = getFirestore(app);

export async function logActivity({ userId, type = "page_visit", page, meta = {} }) {
  if (!userId || !page) return;

  try {
    await addDoc(collection(db, "activity_logs"), {
      userId,
      type,
      page,
      meta,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Activity log failed:", err);
  }
}

export async function logPageVisit({ userId, page, meta = {} }) {
  return logActivity({ userId, type: "page_visit", page, meta });
}
