import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { app } from "./firebase";

export async function logToolUsage({
  userId,
  tool,
  action = "visit", // 👈 Default value set kar di (Fix for undefined)
  resourceId = null,
  resourceName = null,
  metadata = {}
}) {
  if (!userId) {
    console.warn("⚠️ logToolUsage: userId missing hai!");
    return;
  }

  try {
    const db = getFirestore(app);

    await addDoc(collection(db, "tool_usage"), {
      userId,
      tool: tool || "Unknown Tool",
      action: action || "visit",
      resourceId: resourceId || null,
      resourceName: resourceName || null,
      metadata: metadata || {},
      createdAt: serverTimestamp(),
    });

    console.log("✅ Tool usage logged successfully!");
  } catch (error) {
    console.error("❌ Firestore Tool Usage Log Error:", error);
  }
}
