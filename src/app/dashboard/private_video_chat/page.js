"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { Video, LogIn, ArrowLeft } from "lucide-react";
import { logToolUsage } from "@/lib/firestore";
import { getCurrentUser } from "@/lib/firebaseAuth";

export default function PrivateVideoChatPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
    const user = getCurrentUser();
 useEffect(() => {
   if (!user) router.replace("/login");

  if (user) {
    logToolUsage({
      userId: user.uid,
      tool: "Private Video Chat - Page Visit",
    });
  }
}, [user, router]);

  return (
    <main className={styles.page}>
      {/* Back */}
      <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>
  <ArrowLeft size={16} /> Back
</button>

      {/* Card */}
      <div className={styles.card}>
        <div className={styles.iconBox}>
          <Video size={32} />
        </div>

        <h1 className={styles.title}>Private Video Chat</h1>
        <p className={styles.subtitle}>
          Start or join a secure one-to-one video conversation.
        </p>

        {/* Start new */}
        <button
          className={styles.primaryBtn}
          onClick={() => router.push("private_video_chat/video_call")}
        >
          
          <Video size={18} /> Start New Video Chat
        </button>

        <div className={styles.divider}>
          <span>OR</span>
        </div>

        {/* Join */}
        <div className={styles.joinSection}>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className={styles.input}
          />

          <button
            className={styles.secondaryBtn}
            onClick={() => roomId && router.push(`private_video_chat/video_accept/${roomId}`)}
            disabled={!roomId}
          >
            <LogIn size={18} /> Join Video Chat
          </button>
        </div>
      </div>
    </main>
  );

}

