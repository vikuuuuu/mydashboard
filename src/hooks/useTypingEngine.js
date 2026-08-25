"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";

// Splits text into "visual characters" — critical for Hindi, where a matra
// (े, ि, etc.) combines with the previous consonant into one rendered unit.
// Falls back to Array.from (code-point split) if Intl.Segmenter unavailable.
function segmentText(text, language) {
  try {
    const seg = new Intl.Segmenter(language === "hi" ? "hi" : "en", {
      granularity: "grapheme",
    });
    return Array.from(seg.segment(text), (s) => s.segment);
  } catch {
    return Array.from(text);
  }
}

/**
 * useTypingEngine
 * Shared by Practice + Learn modes (Game mode can wrap this per-word).
 *
 * @param {string} text        target text to type
 * @param {string} language    "en" | "hi"
 * @param {function} onFinish  called with stats when text is fully typed
 */
export function useTypingEngine({ text, language = "en", onFinish }) {
  const chars = useMemo(() => segmentText(text, language), [text, language]);

  const [typed, setTyped] = useState([]); // [{char, correct}]
  const [status, setStatus] = useState("idle"); // idle | running | finished
  const [errorCount, setErrorCount] = useState(0);
  const [backspaceCount, setBackspaceCount] = useState(0);

  const startTimeRef = useRef(null);
  const finishedRef = useRef(false);

  const reset = useCallback(() => {
    setTyped([]);
    setStatus("idle");
    setErrorCount(0);
    setBackspaceCount(0);
    startTimeRef.current = null;
    finishedRef.current = false;
  }, []);

  // Reset whenever the target text changes (new lesson/paragraph loaded)
  useEffect(() => {
    reset();
  }, [text, reset]);

  const currentIndex = typed.length;
  const nextExpectedChar = chars[currentIndex] ?? null;

  const elapsedMinutes = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return (Date.now() - startTimeRef.current) / 60000;
  }, []);

  const computeStats = useCallback(() => {
    const correctChars = typed.filter((t) => t.correct).length;
    const totalTyped = typed.length;
    const minutes = Math.max(elapsedMinutes(), 1 / 60); // avoid /0 on instant finish
    const wpm = Math.round(correctChars / 5 / minutes);
    const accuracy = totalTyped === 0 ? 100 : Math.round((correctChars / totalTyped) * 100);
    return {
      wpm: Math.max(wpm, 0),
      accuracy: Math.max(0, Math.min(100, accuracy)),
      errorCount,
      backspaceCount,
      correctChars,
      totalTyped,
      durationSeconds: Math.round(minutes * 60),
    };
  }, [typed, errorCount, backspaceCount, elapsedMinutes]);

  const onKeyPress = useCallback(
    (inputChar) => {
      if (status === "finished" || !nextExpectedChar) return;

      if (status === "idle") {
        startTimeRef.current = Date.now();
        setStatus("running");
      }

      const isCorrect = inputChar === nextExpectedChar;
      if (!isCorrect) setErrorCount((c) => c + 1);

      setTyped((prev) => {
        const next = [...prev, { char: inputChar, correct: isCorrect }];
        if (next.length === chars.length && !finishedRef.current) {
          finishedRef.current = true;
          // slight delay so state settles before computing final stats
          setTimeout(() => {
            setStatus("finished");
          }, 0);
        }
        return next;
      });
    },
    [status, nextExpectedChar, chars.length]
  );

  const onBackspace = useCallback(() => {
    if (status === "finished") return;
    setBackspaceCount((c) => c + 1);
    setTyped((prev) => prev.slice(0, -1));
  }, [status]);

  // Fire onFinish once, when status flips to "finished"
  useEffect(() => {
    if (status === "finished" && onFinish) {
      onFinish(computeStats());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return {
    chars,
    typed,
    status,
    currentIndex,
    nextExpectedChar,
    onKeyPress,
    onBackspace,
    reset,
    liveStats: computeStats(),
  };
}
