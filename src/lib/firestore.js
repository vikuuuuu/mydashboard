import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

export async function logToolUsage(data) {
  const db = getFirestore(app);

  await addDoc(collection(db, "tool_usage"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}