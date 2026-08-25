"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import styles from "./page.module.css";

const TypingContext = createContext(null);

export function useTypingSettings() {
  const ctx = useContext(TypingContext);
  if (!ctx) throw new Error("useTypingSettings must be used within typing-practice layout");
  return ctx;
}

export default function TypingPracticeLayout({ children }) {
  const [language, setLanguage] = useState("en"); // "en" | "hi"
  const [difficulty, setDifficulty] = useState("beginner");
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return unsub;
  }, []);

  return (
    <TypingContext.Provider value={{ language, setLanguage, difficulty, setDifficulty, user }}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <h1 className={styles.title}>Typing Practice</h1>
          <div className={styles.controls}>
            <div className={styles.toggleGroup}>
              <button
                className={language === "en" ? styles.toggleActive : styles.toggle}
                onClick={() => setLanguage("en")}
              >
                English
              </button>
              <button
                className={language === "hi" ? styles.toggleActive : styles.toggle}
                onClick={() => setLanguage("hi")}
              >
                हिंदी
              </button>
            </div>
            <select
              className={styles.select}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            {user === null && (
              <span className={styles.guestNote}>Guest mode — sign in to save progress</span>
            )}
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </TypingContext.Provider>
  );
}
