// lib/typingLayouts.js
// Static physical-key layouts. Each row is an array of key objects.
// `key`   = character produced normally
// `shift` = character produced with Shift held
// `code`  = a stable id (used for highlighting / finger-guide colors)
// `w`     = relative width (1 = normal key), for rendering

export const QWERTY_LAYOUT = {
  id: "qwerty",
  label: "English (QWERTY)",
  rows: [
    [
      { code: "Backquote", key: "`", shift: "~" },
      { code: "Digit1", key: "1", shift: "!" },
      { code: "Digit2", key: "2", shift: "@" },
      { code: "Digit3", key: "3", shift: "#" },
      { code: "Digit4", key: "4", shift: "$" },
      { code: "Digit5", key: "5", shift: "%" },
      { code: "Digit6", key: "6", shift: "^" },
      { code: "Digit7", key: "7", shift: "&" },
      { code: "Digit8", key: "8", shift: "*" },
      { code: "Digit9", key: "9", shift: "(" },
      { code: "Digit0", key: "0", shift: ")" },
      { code: "Minus", key: "-", shift: "_" },
      { code: "Equal", key: "=", shift: "+" },
      { code: "Backspace", key: "⌫", shift: "⌫", w: 2, action: "backspace" },
    ],
    [
      { code: "Tab", key: "Tab", shift: "Tab", w: 1.5, action: "tab" },
      { code: "KeyQ", key: "q", shift: "Q", finger: "l-pinky" },
      { code: "KeyW", key: "w", shift: "W", finger: "l-ring" },
      { code: "KeyE", key: "e", shift: "E", finger: "l-middle" },
      { code: "KeyR", key: "r", shift: "R", finger: "l-index" },
      { code: "KeyT", key: "t", shift: "T", finger: "l-index" },
      { code: "KeyY", key: "y", shift: "Y", finger: "r-index" },
      { code: "KeyU", key: "u", shift: "U", finger: "r-index" },
      { code: "KeyI", key: "i", shift: "I", finger: "r-middle" },
      { code: "KeyO", key: "o", shift: "O", finger: "r-ring" },
      { code: "KeyP", key: "p", shift: "P", finger: "r-pinky" },
      { code: "BracketLeft", key: "[", shift: "{" },
      { code: "BracketRight", key: "]", shift: "}" },
      { code: "Backslash", key: "\\", shift: "|", w: 1.5 },
    ],
    [
      { code: "CapsLock", key: "Caps", shift: "Caps", w: 1.8, action: "caps" },
      { code: "KeyA", key: "a", shift: "A", finger: "l-pinky" },
      { code: "KeyS", key: "s", shift: "S", finger: "l-ring" },
      { code: "KeyD", key: "d", shift: "D", finger: "l-middle" },
      { code: "KeyF", key: "f", shift: "F", finger: "l-index", home: true },
      { code: "KeyG", key: "g", shift: "G", finger: "l-index" },
      { code: "KeyH", key: "h", shift: "H", finger: "r-index" },
      { code: "KeyJ", key: "j", shift: "J", finger: "r-index", home: true },
      { code: "KeyK", key: "k", shift: "K", finger: "r-middle" },
      { code: "KeyL", key: "l", shift: "L", finger: "r-ring" },
      { code: "Semicolon", key: ";", shift: ":" },
      { code: "Quote", key: "'", shift: '"' },
      { code: "Enter", key: "Enter", shift: "Enter", w: 2, action: "enter" },
    ],
    [
      { code: "ShiftLeft", key: "Shift", shift: "Shift", w: 2.2, action: "shift" },
      { code: "KeyZ", key: "z", shift: "Z", finger: "l-pinky" },
      { code: "KeyX", key: "x", shift: "X", finger: "l-ring" },
      { code: "KeyC", key: "c", shift: "C", finger: "l-middle" },
      { code: "KeyV", key: "v", shift: "V", finger: "l-index" },
      { code: "KeyB", key: "b", shift: "B", finger: "l-index" },
      { code: "KeyN", key: "n", shift: "N", finger: "r-index" },
      { code: "KeyM", key: "m", shift: "M", finger: "r-index" },
      { code: "Comma", key: ",", shift: "<" },
      { code: "Period", key: ".", shift: ">" },
      { code: "Slash", key: "/", shift: "?" },
      { code: "ShiftRight", key: "Shift", shift: "Shift", w: 2.2, action: "shift" },
    ],
    [{ code: "Space", key: " ", shift: " ", w: 8, action: "space", label: "Space" }],
  ],
};

// Simplified Inscript layout (Devanagari standard keyboard).
// Covers the core consonants, vowels and matras needed for beginner→advanced
// lessons. Extend the `key`/`shift` pairs if you want full coverage
// (numerals row, nukta forms, rare conjuncts etc.)
export const INSCRIPT_LAYOUT = {
  id: "inscript",
  label: "Hindi (Inscript)",
  rows: [
    [
      { code: "Backquote", key: "॰", shift: "ऽ" },
      { code: "Digit1", key: "1", shift: "ॉ" },
      { code: "Digit2", key: "2", shift: "ं" },
      { code: "Digit3", key: "3", shift: "्र" },
      { code: "Digit4", key: "4", shift: "र्" },
      { code: "Digit5", key: "5", shift: "ज्ञ" },
      { code: "Digit6", key: "6", shift: "त्र" },
      { code: "Digit7", key: "7", shift: "क्ष" },
      { code: "Digit8", key: "8", shift: "श्र" },
      { code: "Digit9", key: "9", shift: "(" },
      { code: "Digit0", key: "0", shift: ")" },
      { code: "Minus", key: "-", shift: "ः" },
      { code: "Equal", key: "ृ", shift: "ऋ" },
      { code: "Backspace", key: "⌫", shift: "⌫", w: 2, action: "backspace" },
    ],
    [
      { code: "Tab", key: "Tab", shift: "Tab", w: 1.5, action: "tab" },
      { code: "KeyQ", key: "ौ", shift: "ौ", finger: "l-pinky" },
      { code: "KeyW", key: "ै", shift: "ै", finger: "l-ring" },
      { code: "KeyE", key: "ा", shift: "ा", finger: "l-middle" },
      { code: "KeyR", key: "ी", shift: "ी", finger: "l-index" },
      { code: "KeyT", key: "ू", shift: "ू", finger: "l-index" },
      { code: "KeyY", key: "ब", shift: "भ", finger: "r-index" },
      { code: "KeyU", key: "ह", shift: "ङ", finger: "r-index" },
      { code: "KeyI", key: "ग", shift: "घ", finger: "r-middle" },
      { code: "KeyO", key: "द", shift: "ध", finger: "r-ring" },
      { code: "KeyP", key: "ज", shift: "झ", finger: "r-pinky" },
      { code: "BracketLeft", key: "ड", shift: "ढ" },
      { code: "BracketRight", key: "़", shift: "ञ" },
      { code: "Backslash", key: "ॅ", shift: "ॅ", w: 1.5 },
    ],
    [
      { code: "CapsLock", key: "Caps", shift: "Caps", w: 1.8, action: "caps" },
      { code: "KeyA", key: "ो", shift: "ो", finger: "l-pinky" },
      { code: "KeyS", key: "े", shift: "े", finger: "l-ring" },
      { code: "KeyD", key: "्", shift: "्", finger: "l-middle" },
      { code: "KeyF", key: "ि", shift: "ि", finger: "l-index", home: true },
      { code: "KeyG", key: "ु", shift: "ु", finger: "l-index" },
      { code: "KeyH", key: "प", shift: "फ", finger: "r-index" },
      { code: "KeyJ", key: "र", shift: "ऱ", finger: "r-index", home: true },
      { code: "KeyK", key: "क", shift: "ख", finger: "r-middle" },
      { code: "KeyL", key: "त", shift: "थ", finger: "r-ring" },
      { code: "Semicolon", key: "च", shift: "छ" },
      { code: "Quote", key: "ट", shift: "ठ" },
      { code: "Enter", key: "Enter", shift: "Enter", w: 2, action: "enter" },
    ],
    [
      { code: "ShiftLeft", key: "Shift", shift: "Shift", w: 2.2, action: "shift" },
      { code: "KeyZ", key: "ं", shift: "ँ", finger: "l-pinky" },
      { code: "KeyX", key: "म", shift: "ण", finger: "l-ring" },
      { code: "KeyC", key: "न", shift: "ऩ", finger: "l-middle" },
      { code: "KeyV", key: "व", shift: "ऴ", finger: "l-index" },
      { code: "KeyB", key: "ल", shift: "ळ", finger: "l-index" },
      { code: "KeyN", key: "स", shift: "श", finger: "r-index" },
      { code: "KeyM", key: "य", shift: "ष", finger: "r-index" },
      { code: "Comma", key: "ि", shift: "ि" },
      { code: "Period", key: "।", shift: "॥" },
      { code: "Slash", key: "?", shift: "?" },
      { code: "ShiftRight", key: "Shift", shift: "Shift", w: 2.2, action: "shift" },
    ],
    [{ code: "Space", key: " ", shift: " ", w: 8, action: "space", label: "Space" }],
  ],
};

export function getLayout(language) {
  return language === "hi" ? INSCRIPT_LAYOUT : QWERTY_LAYOUT;
}

// Flat lookup: character -> { code, shift(bool) } — used by Learn mode to
// find which physical key to highlight for the next expected character.
export function buildCharKeyMap(layout) {
  const map = {};
  layout.rows.forEach((row) => {
    row.forEach((k) => {
      if (k.action) return; // skip control keys
      if (k.key) map[k.key] = { code: k.code, shift: false };
      if (k.shift && !(k.shift in map)) map[k.shift] = { code: k.code, shift: true };
    });
  });
  return map;
}
