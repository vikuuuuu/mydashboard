"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTypingSettings } from "./layout";
import { getTypingProfile } from "@/lib/firestoreTyping";
import styles from "./page.module.css";

const MODES = [
  { href: "/dashboard/typing_test/practice", title: "Practice", desc: "Free typing, random paragraphs, live WPM & accuracy." },
  { href: "/dashboard/typing_test/learn", title: "Learn", desc: "Step-by-step lessons with on-screen keyboard guidance." },
  { href: "/dashboard/typing_test/game", title: "Game", desc: "Time-attack and word-sprint challenges. Beat your score." },
  { href: "/dashboard/typing_test/history", title: "History", desc: "Your saved sessions, best scores, and progress." },
];

export default function TypingPracticeHome() {
  const { user } = useTypingSettings();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user) {
      getTypingProfile(user.uid).then(setProfile).catch(() => {});
    }
  }, [user]);

  return (
    <div>
      <p>Choose a mode to start. Switch language and difficulty anytime from the top bar.</p>

      {user && profile && (
        <div className={styles.statsRow}>
          <span className={styles.statPill}>Best WPM (EN): {profile.bestWpm?.english || 0}</span>
          <span className={styles.statPill}>Best WPM (HI): {profile.bestWpm?.hindi || 0}</span>
          <span className={styles.statPill}>Streak: {profile.streakDays || 0} days</span>
          <span className={styles.statPill}>Sessions: {profile.totalSessions || 0}</span>
        </div>
      )}

      <div className={styles.modeGrid}>
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className={styles.modeCard}>
            <h3 className={styles.modeCardTitle}>{m.title}</h3>
            <p className={styles.modeCardDesc}>{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
