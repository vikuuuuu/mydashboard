import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { app } from "./firebase";

const db = getFirestore(app);



export const logToolUsage = async ({ userId, tool, imageCount, totalSizeKB }) => {
  const data = {
    userId,
    tool,
    createdAt: serverTimestamp(),
  };

  if (imageCount !== undefined) data.imageCount = imageCount;
  if (totalSizeKB !== undefined) data.totalSizeKB = totalSizeKB;

  await addDoc(collection(db, "tool_usage"), data);
};


