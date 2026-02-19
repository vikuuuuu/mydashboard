import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

const db = getFirestore(app);

export const logToolUsage = async ({
  userId,
  tool,
  imageCount,
  totalSizeKB,
}) => {
  await addDoc(collection(db, "tool_usage"), {
    userId,
    tool,
    imageCount,
    totalSizeKB,
    createdAt: serverTimestamp(),
  });
};
