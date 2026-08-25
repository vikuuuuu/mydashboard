"use client";

import { useMemo } from "react";
import { getLayout, buildCharKeyMap } from "@/lib/typingLayouts";
import styles from "./VirtualKeyboard.module.css";

/**
 * VirtualKeyboard
 *
 * @param {"en"|"hi"} language
 * @param {string} nextExpectedChar  the char the engine wants next — key lights up
 * @param {string} lastPressedCode   physical key code of last press — brief flash
 * @param {function} onVirtualKeyClick  optional (char) => void, for click-to-type
 */
export default function VirtualKeyboard({
  language = "en",
  nextExpectedChar = null,
  lastPressedCode = null,
  onVirtualKeyClick,
}) {
  const layout = useMemo(() => getLayout(language), [language]);
  const charKeyMap = useMemo(() => buildCharKeyMap(layout), [layout]);

  const activeKeyInfo = nextExpectedChar ? charKeyMap[nextExpectedChar] : null;

  return (
    <div className={styles.keyboard} aria-label={`${layout.label} virtual keyboard`}>
      {layout.rows.map((row, rowIdx) => (
        <div className={styles.row} key={rowIdx}>
          {row.map((k) => {
            const isActive = activeKeyInfo && activeKeyInfo.code === k.code;
            const isShiftNeeded = isActive && activeKeyInfo.shift;
            const isPressed = lastPressedCode === k.code;
            const display = k.label || k.key;

            return (
              <button
                key={k.code}
                type="button"
                className={[
                  styles.key,
                  k.action ? styles.controlKey : "",
                  k.home ? styles.homeKey : "",
                  isActive ? styles.activeKey : "",
                  isShiftNeeded ? styles.shiftNeeded : "",
                  isPressed ? styles.pressedKey : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ flexGrow: k.w || 1 }}
                onClick={() => onVirtualKeyClick?.(k.key)}
                tabIndex={-1}
              >
                {display}
                {k.shift && !k.action && (
                  <span className={styles.shiftChar}>{k.shift}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      {activeKeyInfo?.shift && (
        <div className={styles.hint}>Hold Shift for this character</div>
      )}
    </div>
  );
}
