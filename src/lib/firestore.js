// @/lib/firestore.js
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

export async function logToolUsage({
  userId,
  tool,
  action,
  resourceId = null,
  resourceName = null,
  metadata = {}
}) {
  const db = getFirestore(app);
  await addDoc(collection(db, "tool_usage"), {
    userId,
    tool,
    action,
    resourceId,
    resourceName,
    metadata,
    createdAt: serverTimestamp(),
  });
}
