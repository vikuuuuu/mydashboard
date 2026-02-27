"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { Video, LogIn, ArrowLeft } from "lucide-react";

export default function PrivateVideoChatPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");

  return (
    <main className={styles.page}>
      {/* Back */}
      <button className={styles.backBtn} onClick={() => router.back()}>
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