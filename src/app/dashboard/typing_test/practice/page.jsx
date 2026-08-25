"use client";

import { useState, useCallback } from "react";
import { useTypingSettings } from "../layout";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { getPracticeText } from "@/lib/lessonContent";
import { saveTypingSession } from "@/lib/firestoreTyping";
import TypingCanvas from "@/components/TypingCanvas";
import VirtualKeyboard from "@/components/VirtualKeyboard";

export default function PracticePage() {
  const { language, difficulty, user } = useTypingSettings();
  const [text, setText] = useState(() => getPracticeText(language, difficulty));
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | guest

  const handleFinish = useCallback(
    async (stats) => {
      if (!user) {
        setSaveState("guest");
        return;
      }
      setSaveState("saving");
      try {
        await saveTypingSession(user.uid, {
          mode: "practice",
          language,
          difficulty,
          wpm: stats.wpm,
          accuracy: stats.accuracy,
          errorCount: stats.errorCount,
          backspaceCount: stats.backspaceCount,
          durationSeconds: stats.durationSeconds,
        });
        setSaveState("saved");
      } catch (e) {
        console.error("Failed to save session", e);
        setSaveState("idle");
      }
    },
    [user, language, difficulty]
  );

  const engine = useTypingEngine({ text, language, onFinish: handleFinish });

  const handleNewText = () => {
    setSaveState("idle");
    setText(getPracticeText(language, difficulty));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 20, fontFamily: "DM Mono, monospace", fontSize: "0.9rem" }}>
          <span>WPM: {engine.liveStats.wpm}</span>
          <span>Accuracy: {engine.liveStats.accuracy}%</span>
          <span>Errors: {engine.liveStats.errorCount}</span>
        </div>
        <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showKeyboard} onChange={(e) => setShowKeyboard(e.target.checked)} />
          Show keyboard
        </label>
      </div>

      <TypingCanvas
        chars={engine.chars}
        typed={engine.typed}
        onKeyPress={engine.onKeyPress}
        onBackspace={engine.onBackspace}
        language={language}
      />

      {showKeyboard && (
        <div style={{ marginTop: 16 }}>
          <VirtualKeyboard language={language} nextExpectedChar={engine.nextExpectedChar} />
        </div>
      )}

      {engine.status === "finished" && (
        <div style={{ marginTop: 18 }}>
          <p>
            Done — {engine.liveStats.wpm} WPM, {engine.liveStats.accuracy}% accuracy.{" "}
            {saveState === "saved" && "Saved ✓"}
            {saveState === "guest" && "Sign in to save this result."}
            {saveState === "saving" && "Saving…"}
          </p>
          <button onClick={handleNewText}>Try another</button>
        </div>
      )}
    </div>
  );
}
