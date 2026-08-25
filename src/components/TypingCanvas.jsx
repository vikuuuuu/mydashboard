"use client";

import { useEffect, useRef } from "react";
import styles from "./TypingCanvas.module.css";

/**
 * TypingCanvas
 * Renders `chars` (from useTypingEngine) with per-char state and captures
 * keystrokes via a hidden input (works on mobile too — brings up native
 * keyboard, while VirtualKeyboard is shown for visual guidance).
 *
 * @param {string[]} chars
 * @param {{char:string, correct:boolean}[]} typed
 * @param {function} onKeyPress   (char) => void
 * @param {function} onBackspace  () => void
 * @param {boolean} autoFocus
 * @param {"en"|"hi"} language    for font selection / dir
 */
export default function TypingCanvas({
  chars,
  typed,
  onKeyPress,
  onBackspace,
  autoFocus = true,
  language = "en",
}) {
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) hiddenInputRef.current?.focus();
  }, [autoFocus]);

  // Hindi input via a real <input> lets the OS/IME compose matras correctly
  // before we diff at the grapheme level ourselves.
  const handleChange = (e) => {
    const val = e.target.value;
    if (val.length === 0) return;
    // take the last inserted grapheme-ish chunk
    const lastChar = val;
    onKeyPress(lastChar);
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Backspace") {
      onBackspace();
    }
  };

  return (
    <div className={styles.wrapper} onClick={() => hiddenInputRef.current?.focus()}>
      <div
        className={styles.textDisplay}
        dir={language === "hi" ? "ltr" : "ltr"}
        lang={language}
      >
        {chars.map((char, i) => {
          const t = typed[i];
          let cls = styles.pending;
          if (t) cls = t.correct ? styles.correct : styles.incorrect;
          const isCursor = i === typed.length;

          return (
            <span key={i} className={`${cls} ${isCursor ? styles.cursor : ""}`}>
              {char === " " ? "\u00A0" : char}
            </span>
          );
        })}
      </div>

      {/* Hidden input captures real keystrokes / mobile IME composition */}
      <input
        ref={hiddenInputRef}
        className={styles.hiddenInput}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Typing input"
      />
    </div>
  );
}
