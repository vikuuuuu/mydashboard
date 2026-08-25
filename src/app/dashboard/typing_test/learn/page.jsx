"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTypingSettings } from "../layout";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { getLearnLessons, DIFFICULTY_CONFIG } from "@/lib/lessonContent";
import { saveTypingSession, getTypingProfile } from "@/lib/firestoreTyping";
import TypingCanvas from "@/components/TypingCanvas";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import styles from "./page.module.css";

export default function LearnPage() {
  const { language, difficulty, user } = useTypingSettings();
  const lessons = useMemo(() => getLearnLessons(language), [language]);

  const [levelIndex, setLevelIndex] = useState(0);
  const [resultMsg, setResultMsg] = useState(null);
  const [lastPressedCode, setLastPressedCode] = useState(null);

  // Load user's unlocked level once profile is available, so they resume
  // where they left off instead of always starting at level 1.
  useEffect(() => {
    if (!user) return;
    getTypingProfile(user.uid).then((profile) => {
      if (!profile) return;
      const langKey = language === "hi" ? "hindi" : "english";
      const unlocked = profile.currentLevel?.[langKey] || 1;
      const idx = lessons.findIndex((l) => l.level === unlocked);
      if (idx >= 0) setLevelIndex(idx);
    });
  }, [user, language, lessons]);

  const lesson = lessons[levelIndex];
  const accuracyTarget = DIFFICULTY_CONFIG[difficulty]?.accuracyTarget ?? 85;

  const handleFinish = useCallback(
    async (stats) => {
      const passed = stats.accuracy >= accuracyTarget;
      setResultMsg(
        passed
          ? `Level cleared — ${stats.accuracy}% accuracy, ${stats.wpm} WPM. Next level unlocked.`
          : `${stats.accuracy}% accuracy — need ${accuracyTarget}% to unlock the next level. Try again.`
      );

      if (user) {
        try {
          await saveTypingSession(user.uid, {
            mode: "learn",
            language,
            difficulty,
            level: lesson.level,
            levelPassed: passed,
            wpm: stats.wpm,
            accuracy: stats.accuracy,
            errorCount: stats.errorCount,
            backspaceCount: stats.backspaceCount,
            durationSeconds: stats.durationSeconds,
          });
        } catch (e) {
          console.error("Failed to save learn session", e);
        }
      }
    },
    [user, language, difficulty, lesson, accuracyTarget]
  );

  const engine = useTypingEngine({
    text: lesson?.text || "",
    language,
    onFinish: handleFinish,
  });

  // Track last physical key for a brief "pressed" flash on the virtual keyboard
  useEffect(() => {
    const handler = (e) => {
      setLastPressedCode(e.code);
      setTimeout(() => setLastPressedCode(null), 150);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const goNextLevel = () => {
    setResultMsg(null);
    setLevelIndex((i) => Math.min(i + 1, lessons.length - 1));
  };

  const retryLevel = () => {
    setResultMsg(null);
    engine.reset();
  };

  if (!lesson) return <p>No lessons available for this language yet.</p>;

  return (
    <div>
      <div className={styles.levelHeader}>
        <span className={styles.levelBadge}>
          Level {lesson.level} — {lesson.type}
        </span>
        <div className={styles.levelDots}>
          {lessons.map((l, i) => (
            <span
              key={l.level}
              className={i === levelIndex ? styles.dotActive : i < levelIndex ? styles.dotDone : styles.dot}
            />
          ))}
        </div>
      </div>

      <div className={styles.liveStats}>
        <span>WPM: {engine.liveStats.wpm}</span>
        <span>Accuracy: {engine.liveStats.accuracy}%</span>
        <span>Target: {accuracyTarget}%</span>
      </div>

      <TypingCanvas
        chars={engine.chars}
        typed={engine.typed}
        onKeyPress={engine.onKeyPress}
        onBackspace={engine.onBackspace}
        language={language}
      />

      <div className={styles.keyboardWrap}>
        <VirtualKeyboard
          language={language}
          nextExpectedChar={engine.nextExpectedChar}
          lastPressedCode={lastPressedCode}
        />
      </div>

      {resultMsg && (
        <div className={styles.resultBar}>
          <p>{resultMsg}</p>
          <div className={styles.resultActions}>
            <button onClick={retryLevel}>Retry</button>
            {engine.liveStats.accuracy >= accuracyTarget && levelIndex < lessons.length - 1 && (
              <button onClick={goNextLevel} className={styles.primaryBtn}>
                Next Level →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
