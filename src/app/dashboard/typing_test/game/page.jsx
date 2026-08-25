"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTypingSettings } from "../layout";
import { getGameWords } from "@/lib/lessonContent";
import { saveTypingSession, submitLeaderboardScore } from "@/lib/firestoreTyping";
import styles from "./page.module.css";

const ROUND_SECONDS = 60;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function GamePage() {
  const { language, difficulty, user } = useTypingSettings();

  const [status, setStatus] = useState("idle"); // idle | running | finished
  const [pool, setPool] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [saveState, setSaveState] = useState("idle");

  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  const startGame = () => {
    const words = shuffle(getGameWords(language, difficulty).concat(getGameWords(language, difficulty)));
    setPool(words);
    setWordIndex(0);
    setInput("");
    setScore(0);
    setMistakes(0);
    setTimeLeft(ROUND_SECONDS);
    setSaveState("idle");
    setStatus("running");
    startRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const finishGame = useCallback(async () => {
    setStatus("finished");
    clearInterval(timerRef.current);
    const totalAttempted = score + mistakes;
    const accuracy = totalAttempted === 0 ? 100 : Math.round((score / totalAttempted) * 100);
    const wpm = Math.round(score / (ROUND_SECONDS / 60)); // 1 word ≈ 1 "unit", rough game WPM

    if (user) {
      setSaveState("saving");
      try {
        await saveTypingSession(user.uid, {
          mode: "game",
          language,
          difficulty,
          wpm,
          accuracy,
          errorCount: mistakes,
          backspaceCount: 0,
          durationSeconds: ROUND_SECONDS,
        });
        await submitLeaderboardScore(user.uid, user.displayName || "Player", {
          language,
          difficulty,
          wpm,
          accuracy,
        });
        setSaveState("saved");
      } catch (e) {
        console.error("Failed to save game session", e);
        setSaveState("idle");
      }
    } else {
      setSaveState("guest");
    }
  }, [score, mistakes, user, language, difficulty]);

  useEffect(() => {
    if (status !== "running") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    if (status === "running" && timeLeft === 0) {
      finishGame();
    }
  }, [timeLeft, status, finishGame]);

  const handleChange = (e) => {
    const val = e.target.value;
    setInput(val);
    const target = pool[wordIndex];
    if (val.endsWith(" ") || val === target) {
      const trimmed = val.trim();
      if (trimmed === target) {
        setScore((s) => s + 1);
      } else if (trimmed.length > 0) {
        setMistakes((m) => m + 1);
      }
      setInput("");
      setWordIndex((i) => (i + 1) % pool.length);
    }
  };

  return (
    <div>
      {status === "idle" && (
        <div className={styles.startScreen}>
          <p>60-second word sprint. Type each word and press space to submit. Wrong words count as mistakes.</p>
          <button className={styles.primaryBtn} onClick={startGame}>
            Start Round
          </button>
        </div>
      )}

      {status === "running" && (
        <div className={styles.gameArea}>
          <div className={styles.hud}>
            <span className={styles.timer}>{timeLeft}s</span>
            <span>Score: {score}</span>
            <span>Mistakes: {mistakes}</span>
          </div>

          <div className={styles.wordDisplay} lang={language}>
            {pool[wordIndex]}
          </div>

          <input
            ref={inputRef}
            className={styles.gameInput}
            value={input}
            onChange={handleChange}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type the word above…"
          />
        </div>
      )}

      {status === "finished" && (
        <div className={styles.resultScreen}>
          <h3>Round Over</h3>
          <p>
            Score: {score} words · Mistakes: {mistakes} · Accuracy:{" "}
            {score + mistakes === 0 ? 100 : Math.round((score / (score + mistakes)) * 100)}%
          </p>
          {saveState === "saved" && <p>Saved to your history and the leaderboard ✓</p>}
          {saveState === "guest" && <p>Sign in to save scores and appear on the leaderboard.</p>}
          {saveState === "saving" && <p>Saving…</p>}
          <button className={styles.primaryBtn} onClick={startGame}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
