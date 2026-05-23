// File: app/dashboard/Notes/page.js
"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { logToolUsage } from "@/lib/firestore";
import {
  getFirestore, collection, addDoc, query, where,
  getDocs, updateDoc, deleteDoc, doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import jsPDF from "jspdf";
import { app } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import RichEditor from "@/components/RichEditor";
import styles from "./notes.module.css";

import {
  Save, Trash2, FileText, FolderPlus, Search,
  Pin, PinOff, Plus, X, Tag, Clock, FileEdit, ChevronRight,
  Hash, Grid, List, Copy, FolderInput, RotateCcw, Maximize2,
  Minimize2, Eye, EyeOff, AlignLeft, BookOpen, SortAsc,
  Download, Keyboard, Folder, Edit2, Zap, Lock, Unlock,
  Shield, ShieldOff, History, Bot, Send, Target,
} from "lucide-react";

const db = getFirestore(app);

// ─── Constants ────────────────────────────────────────────────
const LABEL_COLORS = [
  { id: "none",     hex: "transparent", label: "None"    },
  { id: "rose",     hex: "#fda4af",     label: "Rose"    },
  { id: "amber",    hex: "#fcd34d",     label: "Amber"   },
  { id: "emerald",  hex: "#6ee7b7",     label: "Emerald" },
  { id: "sky",      hex: "#7dd3fc",     label: "Sky"     },
  { id: "violet",   hex: "#c4b5fd",     label: "Violet"  },
  { id: "orange",   hex: "#fdba74",     label: "Orange"  },
  { id: "pink",     hex: "#f9a8d4",     label: "Pink"    },
];

const NOTE_BG_COLORS = [
  { id: "default",  hex: "#fdfaf5", label: "Default"  },
  { id: "cream",    hex: "#fffbeb", label: "Cream"    },
  { id: "mint",     hex: "#f0fdf4", label: "Mint"     },
  { id: "lavender", hex: "#f5f3ff", label: "Lavender" },
  { id: "rose",     hex: "#fff1f2", label: "Rose"     },
  { id: "sky",      hex: "#f0f9ff", label: "Sky"      },
  { id: "dark",     hex: "#1e1e2e", label: "Dark"     },
  { id: "charcoal", hex: "#2d2d2d", label: "Charcoal" },
];

const TEMPLATES = [
  { id: "blank",    label: "Blank Note",      icon: "📄", title: "",              content: "" },
  { id: "meeting",  label: "Meeting Notes",   icon: "📋", title: "Meeting Notes", content: "<h2>Attendees</h2><p></p><h2>Agenda</h2><ul><li></li></ul><h2>Action Items</h2><ul><li></li></ul><h2>Next Steps</h2><p></p>" },
  { id: "todo",     label: "To-Do List",      icon: "✅", title: "To-Do List",    content: "<h2>Tasks</h2><ul><li>[ ] </li><li>[ ] </li><li>[ ] </li></ul>" },
  { id: "journal",  label: "Daily Journal",   icon: "📖", title: `Journal - ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, content: "<h2>Today's Highlights</h2><p></p><h2>What I Learned</h2><p></p><h2>Gratitude</h2><p></p>" },
  { id: "idea",     label: "Idea Brainstorm", icon: "💡", title: "Idea: ",         content: "<h2>The Idea</h2><p></p><h2>Why It Matters</h2><p></p><h2>Next Steps</h2><ul><li></li></ul>" },
  { id: "research", label: "Research Note",   icon: "🔬", title: "Research: ",     content: "<h2>Overview</h2><p></p><h2>Key Points</h2><ul><li></li></ul><h2>Sources</h2><ul><li></li></ul><h2>Conclusions</h2><p></p>" },
  { id: "habit",    label: "Habit Tracker",   icon: "📊", title: `Habits - ${new Date().toLocaleDateString("en-IN")}`, content: "<h2>Daily Habits</h2><ul><li>[ ] Morning walk</li><li>[ ] Read 30 mins</li><li>[ ] Drink 8 glasses water</li><li>[ ] Meditate</li></ul><h2>Notes</h2><p></p>" },
  { id: "recipe",   label: "Recipe",          icon: "🍳", title: "Recipe: ",       content: "<h2>Ingredients</h2><ul><li></li></ul><h2>Instructions</h2><ol><li></li></ol><h2>Notes</h2><p></p>" },
  { id: "study",    label: "Study Notes",     icon: "📚", title: "Study: ",        content: "<h2>Topic Overview</h2><p></p><h2>Key Concepts</h2><ul><li></li></ul><h2>Important Formulas / Dates</h2><p></p><h2>Questions to Revisit</h2><ul><li></li></ul>" },
];

const SORT_OPTIONS = [
  { id: "updated_desc", label: "Last Modified" },
  { id: "updated_asc",  label: "Oldest First"  },
  { id: "title_asc",    label: "Title A→Z"     },
  { id: "title_desc",   label: "Title Z→A"     },
  { id: "label",        label: "By Label"      },
  { id: "words_desc",   label: "Most Words"    },
];

const AI_QUICK_PROMPTS = [
  { label: "Summarize",    prompt: "Please summarize this note in 3 bullet points." },
  { label: "Improve",      prompt: "Improve the writing quality and clarity of this note." },
  { label: "Expand",       prompt: "Expand on the key ideas in this note with more detail." },
  { label: "Fix grammar",  prompt: "Fix any grammar and spelling mistakes in this note." },
  { label: "Key points",   prompt: "Extract the 5 most important key points from this note." },
  { label: "Action items", prompt: "Extract all action items and tasks from this note as a checklist." },
];

// ─── Helpers ──────────────────────────────────────────────────
const getHtmlToText = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const readingTime = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const mins  = Math.ceil(words / 200);
  return mins < 1 ? "< 1 min" : `${mins} min read`;
};

const formatTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  );
};

const getLabelColor = (id) => LABEL_COLORS.find((c) => c.id === id)?.hex || "transparent";
const getNoteBg    = (id) => NOTE_BG_COLORS.find((c) => c.id === id)?.hex || "#fdfaf5";

// SHA-256 PIN hashing (no external dep)
const hashPin = async (pin) => {
  const data    = new TextEncoder().encode("notes_lock_salt_v1_" + pin);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// ─── Keyboard shortcut hook ───────────────────────────────────
function useHotkeys(handlers) {
  useEffect(() => {
    const fn = (e) => {
      const key =
        (e.ctrlKey || e.metaKey ? "mod+" : "") +
        (e.shiftKey ? "shift+" : "") +
        e.key.toLowerCase();
      if (handlers[key]) { e.preventDefault(); handlers[key](); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [handlers]);
}

// ─── Confirm Dialog ───────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.dialog}>
        <p className={styles.dialogMsg}>{message}</p>
        <div className={styles.dialogBtns}>
          <button className={styles.dialogCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.dialogConfirm} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ─── Security Lock Modal ──────────────────────────────────────
// mode: "set" | "unlock" | "change" | "remove"
function LockModal({ mode, onClose, onSuccess, existingHash }) {
  const [pin,     setPin    ] = useState(["", "", "", ""]);
  const [confirm, setConfirm] = useState(["", "", "", ""]);
  const [error,   setError  ] = useState("");
  // step: "verify" (change/remove - check old pin first) | "enter" | "confirm"
  const [step,    setStep   ] = useState(
    mode === "change" || mode === "remove" ? "verify" : "enter"
  );
  const [shake, setShake] = useState(false);
  const inputRefs   = useRef([]);
  const confirmRefs = useRef([]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleDigit = (index, val, arr, setArr, refs, nextAction) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...arr];
    next[index] = val;
    setArr(next);
    setError("");
    if (val && index < 3) refs.current[index + 1]?.focus();
    if (val && index === 3) nextAction(next);
  };

  const handleKeyDown = (e, index, arr, setArr, refs) => {
    if (e.key === "Backspace" && !arr[index] && index > 0) {
      const next = [...arr];
      next[index - 1] = "";
      setArr(next);
      refs.current[index - 1]?.focus();
    }
  };

  const verifyOldPin = async (digits) => {
    const entered = await hashPin(digits.join(""));
    if (entered !== existingHash) {
      setError("Incorrect PIN. Try again.");
      triggerShake();
      setPin(["", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
      return;
    }
    if (mode === "unlock") { onSuccess("unlock"); return; }
    if (mode === "remove") { onSuccess("remove"); return; }
    // change: proceed to set new pin
    setStep("enter");
    setPin(["", "", "", ""]);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleNewPin = () => {
    setStep("confirm");
    setTimeout(() => confirmRefs.current[0]?.focus(), 50);
  };

  const handleConfirmPin = async (digits) => {
    if (digits.join("") !== pin.join("")) {
      setError("PINs don't match. Try again.");
      triggerShake();
      setConfirm(["", "", "", ""]);
      setTimeout(() => confirmRefs.current[0]?.focus(), 50);
      return;
    }
    const hash = await hashPin(pin.join(""));
    onSuccess(hash);
  };

  // Which array and refs are active?
  const isConfirmStep = step === "confirm";
  const activeArr     = isConfirmStep ? confirm : pin;
  const setActiveArr  = isConfirmStep ? setConfirm : setPin;
  const activeRefs    = isConfirmStep ? confirmRefs : inputRefs;

  const activeAction =
    step === "verify"  ? verifyOldPin  :
    step === "enter"   ? () => handleNewPin() :
    handleConfirmPin;

  const titles = { set: "Set Security PIN", unlock: "Unlock Note", change: "Change PIN", remove: "Remove Lock" };

  const stepDesc = () => {
    if (mode === "unlock")                      return "Enter your 4-digit PIN to view this note.";
    if (mode === "remove" || (mode === "change" && step === "verify")) return "Enter your current PIN to continue.";
    if (step === "enter")                        return "Choose a new 4-digit PIN for this note.";
    if (step === "confirm")                      return "Re-enter the PIN to confirm.";
    return "";
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.lockModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.lockModalHeader}>
          <span className={styles.lockModalTitle}>
            <Shield size={16} /> {titles[mode]}
          </span>
          <button className={styles.iconBtnSmall} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.lockModalBody}>
          <div className={styles.lockModalIcon}>
            <div className={styles.lockModalIconBg}>
              {mode === "unlock" ? <Unlock size={28} /> : <Lock size={28} />}
            </div>
          </div>

          <p className={styles.lockModalDesc}>{stepDesc()}</p>

          {mode === "set" && step === "enter" && (
            <div className={styles.lockInfoBox}>
              ⚠️ Remember your PIN — it cannot be recovered if forgotten. Keep it safe.
            </div>
          )}

          <div className={styles.lockPinRow}>
            {activeArr.map((d, i) => (
              <input
                key={i}
                ref={(el) => (activeRefs.current[i] = el)}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={d}
                className={`${styles.lockPinDigit} ${shake ? styles.lockPinDigitError : ""}`}
                onChange={(e) =>
                  handleDigit(i, e.target.value, activeArr, setActiveArr, activeRefs, activeAction)
                }
                onKeyDown={(e) => handleKeyDown(e, i, activeArr, setActiveArr, activeRefs)}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <p className={styles.lockError}>{error}&nbsp;</p>
          {mode === "unlock" && (
            <p className={styles.lockHint}>4-digit numeric PIN required.</p>
          )}
        </div>

        <div className={styles.lockModalFooter}>
          <button className={styles.lockBtnSecondary} onClick={onClose}>Cancel</button>
          <button
            className={styles.lockBtnPrimary}
            onClick={() => activeAction(activeArr)}
            disabled={activeArr.some((d) => !d)}
          >
            {mode === "unlock" ? "Unlock" :
             mode === "remove" ? "Remove Lock" :
             step === "confirm" ? "Set PIN" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Modal ───────────────────────────────────────────
function TemplateModal({ onSelect, onClose }) {
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.templateModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Zap size={16} /> Choose Template</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14} /></button>
        </div>
        <div className={styles.templateGrid}>
          {TEMPLATES.map((t) => (
            <button key={t.id} className={styles.templateCard} onClick={() => onSelect(t)}>
              <span className={styles.templateIcon}>{t.icon}</span>
              <span className={styles.templateLabel}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Move to Folder Modal ─────────────────────────────────────
function MoveFolderModal({ folders, currentFolderId, onMove, onClose }) {
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.moveModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><FolderInput size={16} /> Move to Folder</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14} /></button>
        </div>
        <div className={styles.moveList}>
          <button
            className={`${styles.moveItem} ${!currentFolderId ? styles.moveItemActive : ""}`}
            onClick={() => onMove(null)}
          >
            <Hash size={14} /> All Notes (No Folder)
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`${styles.moveItem} ${currentFolderId === f.id ? styles.moveItemActive : ""}`}
              onClick={() => onMove(f.id)}
            >
              <Folder size={14} /> {f.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shortcuts Modal ──────────────────────────────────────────
function ShortcutsModal({ onClose }) {
  const shortcuts = [
    ["Ctrl + S",        "Save note"],
    ["Ctrl + N",        "New note"],
    ["Ctrl + Shift+F",  "Toggle search"],
    ["Ctrl + D",        "Duplicate note"],
    ["Ctrl + P",        "Toggle pin"],
    ["Ctrl + E",        "Export PDF"],
    ["Ctrl + Shift+L",  "Toggle note lock"],
    ["Ctrl + Shift+A",  "Toggle AI assistant"],
    ["Ctrl + Shift+H",  "Toggle version history"],
    ["Escape",          "Close panels"],
  ];
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.shortcutsModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Keyboard size={16} /> Keyboard Shortcuts</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14} /></button>
        </div>
        <table className={styles.shortcutsTable}>
          <tbody>
            {shortcuts.map(([key, desc]) => (
              <tr key={key}>
                <td><kbd className={styles.kbd}>{key}</kbd></td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Word Goal Modal ──────────────────────────────────────────
function WordGoalModal({ current, onSet, onClose }) {
  const [val, setVal] = useState(current > 0 ? String(current) : "");
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.goalModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Target size={16} /> Word Goal</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14} /></button>
        </div>
        <div className={styles.goalModalBody}>
          <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>
            Set a word count goal for this writing session.
          </p>
          <input
            type="number"
            min="1"
            max="100000"
            className={styles.goalInput}
            placeholder="e.g. 500"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && val) onSet(Number(val)); }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className={styles.lockBtnSecondary} onClick={() => onSet(0)}>Clear Goal</button>
            <button
              className={styles.lockBtnPrimary}
              style={{ flex: 1 }}
              onClick={() => val && onSet(Number(val))}
              disabled={!val || Number(val) < 1}
            >
              Set Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Assistant Panel ───────────────────────────────────────
function AIPanel({ noteTitle, noteContent, onClose, onApply }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I'm your AI writing assistant. Ask me anything about this note, or use the quick actions below.",
    },
  ]);
  const [input,   setInput  ] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (promptOverride) => {
      const text = (promptOverride || input).trim();
      if (!text || loading) return;
      setInput("");
      const userMsg = { role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const systemPrompt = `You are a helpful writing assistant in a Notes app.
Note title: "${noteTitle || "Untitled"}"
Note content (plain text): ${getHtmlToText(noteContent || "").slice(0, 3000) || "(empty)"}
Be concise and practical. If asked to rewrite, just output the improved text.`;

        const apiMessages = [
          ...messages
            .slice(1) // skip initial greeting
            .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
          { role: "user", content: text },
        ];

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: systemPrompt,
            messages: apiMessages,
          }),
        });

        const data  = await res.json();
        const reply = data.content?.[0]?.text || "Sorry, I couldn't process that request.";
        setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Something went wrong. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, noteTitle, noteContent]
  );

  return (
    <div className={styles.aiPanel}>
      <div className={styles.aiPanelHeader}>
        <span className={styles.aiPanelTitle}><Bot size={15} /> AI Assistant</span>
        <button className={styles.iconBtnSmall} onClick={onClose}><X size={14} /></button>
      </div>

      <div className={styles.aiQuickBtns}>
        {AI_QUICK_PROMPTS.map((q) => (
          <button key={q.label} className={styles.aiQuickBtn} onClick={() => send(q.prompt)}>
            {q.label}
          </button>
        ))}
      </div>

      <div className={styles.aiMessages}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`${styles.aiMessage} ${
              m.role === "user" ? styles.aiMessageUser : styles.aiMessageAssistant
            }`}
          >
            <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
            {m.role === "assistant" && i > 0 && !loading && (
              <div style={{ marginTop: 6 }}>
                <button
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "DM Sans, sans-serif",
                  }}
                  onClick={() => onApply(m.text)}
                >
                  ↩ Apply to note
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className={`${styles.aiMessage} ${styles.aiMessageAssistant} ${styles.aiMessageLoading}`}>
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.aiInputRow}>
        <textarea
          className={styles.aiInput}
          placeholder="Ask AI anything… (Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
        />
        <button className={styles.aiSendBtn} onClick={() => send()} disabled={!input.trim() || loading}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Version History Panel ────────────────────────────────────
function HistoryPanel({ versions, onRestore, onClose }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className={styles.historyPanel}>
      <div className={styles.historyHeader}>
        <span className={styles.historyTitle}><History size={15} /> Version History</span>
        <button className={styles.iconBtnSmall} onClick={onClose}><X size={14} /></button>
      </div>
      <div className={styles.historyList}>
        {versions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ink3)", padding: "16px 12px", textAlign: "center", lineHeight: 1.6 }}>
            No versions yet.<br />Save the note to create a checkpoint.
          </p>
        ) : (
          versions.map((v, i) => {
            const words = getHtmlToText(v.content || "").trim().split(/\s+/).filter(Boolean).length;
            return (
              <div
                key={i}
                className={`${styles.historyItem} ${selected === i ? styles.historyItemActive : ""}`}
                onClick={() => setSelected(selected === i ? null : i)}
              >
                <div className={styles.historyItemTime}>
                  {v.savedAt
                    ? new Date(v.savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) +
                      " · " +
                      new Date(v.savedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                    : "—"}
                </div>
                <div className={styles.historyItemWords}>{words} words</div>
                {i === 0 && <span className={styles.historyItemLabel}>Latest save</span>}
                {selected === i && (
                  <button className={styles.historyRestoreBtn} onClick={() => onRestore(v)}>
                    Restore this version
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Locked Note Screen ───────────────────────────────────────
function LockedScreen({ noteTitle, onUnlock }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40 }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={32} color="var(--accent)" />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: "Lora, serif", fontSize: "1.1rem", fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
          "{noteTitle || "This note"}" is locked
        </p>
        <p style={{ fontSize: 13, color: "var(--ink3)", margin: 0 }}>
          Enter your PIN to view and edit the content.
        </p>
      </div>
      <button className={styles.newNoteBtn} onClick={onUnlock}>
        <Unlock size={14} /> Unlock Note
      </button>
    </div>
  );
}

// ─── Tags Input Component ─────────────────────────────────────
function TagsInput({ tags, onAdd, onRemove, readOnly, isDark }) {
  const [input, setInput] = useState("");

  const handleKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const tag = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (tag && !tags.includes(tag)) onAdd(tag);
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  };

  if (readOnly && !tags.length) return null;
  return (
    <div
      className={styles.tagsRow}
      style={{
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "",
        background: isDark ? "rgba(0,0,0,0.1)" : "",
      }}
    >
      {tags.map((t) => (
        <span key={t} className={styles.tagChip} style={{ color: isDark ? "#aaa" : "" }}>
          #{t}
          {!readOnly && (
            <button className={styles.tagRemove} onClick={() => onRemove(t)}>
              <X size={9} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={tags.length === 0 ? "Add tags (Enter or comma)" : ""}
          className={styles.tagInput}
          style={{ color: isDark ? "#ccc" : "", background: "transparent" }}
        />
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function NotesDashboard() {
  const router = useRouter();
  const user   = getCurrentUser();

  // ── Data state ──
  const [folders,      setFolders     ] = useState([]);
  const [notes,        setNotes       ] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeNote,   setActiveNote  ] = useState(null);
  const [loading,      setLoading     ] = useState(true);

  // ── Editor state ──
  const [title,       setTitle      ] = useState("");
  const [content,     setContent    ] = useState("");
  const [activeLabel, setActiveLabel] = useState("none");
  const [noteBg,      setNoteBg     ] = useState("default");
  const [lastSaved,   setLastSaved  ] = useState(null);
  const [isSaving,    setIsSaving   ] = useState(false);
  const [isNewNote,   setIsNewNote  ] = useState(false);
  const [isDirty,     setIsDirty    ] = useState(false);

  // ── Security lock state ──
  const [isLocked,       setIsLocked      ] = useState(false);
  const [isUnlocked,     setIsUnlocked    ] = useState(false);
  const [showLockModal,  setShowLockModal ] = useState(false);
  const [lockMode,       setLockMode      ] = useState("set");
  // Track which notes have been unlocked this session (by ID)
  const [unlockedNotes,  setUnlockedNotes ] = useState(new Set());

  // ── Version history ──
  const [versions,    setVersions   ] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── AI panel ──
  const [showAI, setShowAI] = useState(false);

  // ── Word goal ──
  const [wordGoal,      setWordGoal     ] = useState(0);
  const [showGoalModal, setShowGoalModal] = useState(false);

  // ── UI state ──
  const [search,         setSearch        ] = useState("");
  const [showSearch,     setShowSearch    ] = useState(false);
  const [viewMode,       setViewMode      ] = useState("list");
  const [sortBy,         setSortBy        ] = useState("updated_desc");
  const [showLabels,     setShowLabels    ] = useState(false);
  const [showBgPicker,   setShowBgPicker  ] = useState(false);
  const [showSortMenu,   setShowSortMenu  ] = useState(false);
  const [showExport,     setShowExport    ] = useState(false);
  const [showTemplates,  setShowTemplates ] = useState(false);
  const [showMoveFolder, setShowMoveFolder] = useState(false);
  const [showShortcuts,  setShowShortcuts ] = useState(false);
  const [focusMode,      setFocusMode     ] = useState(false);
  const [readOnly,       setReadOnly      ] = useState(false);
  const [showTrash,      setShowTrash     ] = useState(false);
  const [confirmDialog,  setConfirmDialog ] = useState(null);
  const [activeSection,  setActiveSection ] = useState("notes");

  // ── Stats ──
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const autoSaveRef = useRef(null);
  const titleRef    = useRef(null);

  // ── Auth guard ──────────────────────────────────────────
  useEffect(() => {
    if (!user) router.replace("/login");
    else logToolUsage({ userId: user.uid, tool: "Notes Dashboard - Page Visit" });
  }, [user, router]);

  // ── Load data ───────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    if (!user) return;
    const q    = query(collection(db, "folders"), where("userId", "==", user.uid), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    setFolders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, [user]);

  const loadNotes = useCallback(async (folderId = null, trashed = false) => {
    if (!user) return;
    let q = query(
      collection(db, "notes"),
      where("userId", "==", user.uid),
      where("deleted", "==", trashed)
    );
    if (folderId && !trashed) {
      q = query(
        collection(db, "notes"),
        where("userId", "==", user.uid),
        where("folderId", "==", folderId),
        where("deleted", "==", false)
      );
    }
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (trashed) setTrashedNotes(list);
    else setNotes(list);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadFolders(),
      loadNotes(null, false),
      loadNotes(null, true),
    ]).finally(() => setLoading(false));
  }, [user, loadFolders, loadNotes]);

  // ── Word / char counts ──────────────────────────────────
  useEffect(() => {
    const plain = getHtmlToText(content);
    setWordCount(plain.trim() ? plain.trim().split(/\s+/).length : 0);
    setCharCount(plain.replace(/\s/g, "").length);
  }, [content]);

  // ── Mark dirty ──────────────────────────────────────────
  // Only set dirty when something actually changes AND an editor is open
  const prevEditorValues = useRef({ title, content, activeLabel, noteBg });
  useEffect(() => {
    const prev = prevEditorValues.current;
    if (
      (activeNote || isNewNote) &&
      (title !== prev.title || content !== prev.content ||
       activeLabel !== prev.activeLabel || noteBg !== prev.noteBg)
    ) {
      setIsDirty(true);
    }
    prevEditorValues.current = { title, content, activeLabel, noteBg };
  }, [title, content, activeLabel, noteBg]); // eslint-disable-line

  // ── Auto-save (30s) ─────────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (isDirty && (title || content)) saveNote(true);
    }, 30000);
    return () => clearTimeout(autoSaveRef.current);
  }, [isDirty, title, content]); // eslint-disable-line

  // ── Sync lock state when active note changes ────────────
  useEffect(() => {
    if (!activeNote) { setIsLocked(false); setIsUnlocked(false); return; }
    const locked = !!activeNote.lockHash;
    setIsLocked(locked);
    setIsUnlocked(locked ? unlockedNotes.has(activeNote.id) : false);
  }, [activeNote, unlockedNotes]);

  // ── Keyboard shortcuts ──────────────────────────────────
  useHotkeys({
    "mod+s":       () => { if (!isSaving) saveNote(); },
    "mod+n":       () => newNote(),
    "mod+shift+f": () => setShowSearch((s) => !s),
    "mod+d":       () => duplicateNote(),
    "mod+p":       () => activeNote && togglePin(activeNote),
    "mod+e":       () => activeNote && exportPDF(),
    "mod+shift+l": () => activeNote && handleLockToggle(),
    "mod+shift+a": () => (activeNote || isNewNote) && setShowAI((s) => !s),
    "mod+shift+h": () => activeNote && setShowHistory((s) => !s),
    "escape":      () => {
      setShowSearch(false); setShowLabels(false); setShowBgPicker(false);
      setShowSortMenu(false); setShowExport(false); setFocusMode(false);
      setShowAI(false); setShowHistory(false);
    },
  });

  // ── Filtered + sorted notes ─────────────────────────────
  const displayedNotes = useMemo(() => {
    let list = showTrash ? [...trashedNotes] : [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          (!n.lockHash && getHtmlToText(n.content || "").toLowerCase().includes(q)) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      if (!showTrash) {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
      }
      switch (sortBy) {
        case "updated_asc":  return (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0);
        case "title_asc":    return (a.title || "").localeCompare(b.title || "");
        case "title_desc":   return (b.title || "").localeCompare(a.title || "");
        case "label":        return (a.label || "").localeCompare(b.label || "");
        case "words_desc":
          return (
            getHtmlToText(b.content || "").split(/\s+/).filter(Boolean).length -
            getHtmlToText(a.content || "").split(/\s+/).filter(Boolean).length
          );
        default: return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
      }
    });
    return list;
  }, [notes, trashedNotes, search, sortBy, showTrash]);

  // ── Folder counts ───────────────────────────────────────
  const folderCounts = useMemo(() => {
    const map = {};
    notes.forEach((n) => { if (n.folderId) map[n.folderId] = (map[n.folderId] || 0) + 1; });
    return map;
  }, [notes]);

  // ─── FOLDER CRUD ────────────────────────────────────────
  const createFolder = async () => {
    const name = prompt("Folder name:");
    if (!name?.trim()) return;
    await addDoc(collection(db, "folders"), { userId: user.uid, name: name.trim(), createdAt: serverTimestamp() });
    loadFolders();
  };

  const renameFolder = async (folder, e) => {
    e.stopPropagation();
    const name = prompt("New folder name:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    await updateDoc(doc(db, "folders", folder.id), { name: name.trim() });
    loadFolders();
  };

  const deleteFolder = async (folderId, e) => {
    e.stopPropagation();
    setConfirmDialog({
      message: "Delete this folder? Notes inside will move to All Notes.",
      onConfirm: async () => {
        await deleteDoc(doc(db, "folders", folderId));
        const q    = query(collection(db, "notes"), where("folderId", "==", folderId));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map((d) => updateDoc(doc(db, "notes", d.id), { folderId: null })));
        if (activeFolder === folderId) { setActiveFolder(null); loadNotes(); }
        loadFolders();
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ─── LOCK TOGGLE ────────────────────────────────────────
  const handleLockToggle = () => {
    if (!activeNote) return;
    if (!activeNote.lockHash) {
      setLockMode("set");
    } else if (!isUnlocked) {
      setLockMode("unlock");
    } else {
      // Already unlocked → let user change or remove
      setLockMode("change");
    }
    setShowLockModal(true);
  };

  const handleLockSuccess = async (result) => {
    setShowLockModal(false);
    if (!activeNote) return;

    if (result === "unlock") {
      setUnlockedNotes((prev) => new Set([...prev, activeNote.id]));
    } else if (result === "remove") {
      await updateDoc(doc(db, "notes", activeNote.id), { lockHash: null });
      setActiveNote((p) => ({ ...p, lockHash: null }));
      setUnlockedNotes((prev) => { const s = new Set(prev); s.delete(activeNote.id); return s; });
      loadNotes(activeFolder);
    } else {
      // result is a new hash string
      await updateDoc(doc(db, "notes", activeNote.id), { lockHash: result });
      setActiveNote((p) => ({ ...p, lockHash: result }));
      setUnlockedNotes((prev) => new Set([...prev, activeNote.id]));
      loadNotes(activeFolder);
    }
  };

  // ─── SAVE ───────────────────────────────────────────────
  const saveNote = useCallback(async (auto = false) => {
    if (!title && !content) return;
    if (!isDirty && !auto) return;
    setIsSaving(true);
    try {
      const payload = { title, content, label: activeLabel, noteBg, updatedAt: serverTimestamp() };
      if (activeNote) {
        await updateDoc(doc(db, "notes", activeNote.id), payload);
        setActiveNote((prev) => ({ ...prev, ...payload }));
        // Push version snapshot
        setVersions((prev) => [
          { title, content, label: activeLabel, savedAt: Date.now() },
          ...prev.slice(0, 19),
        ]);
      } else {
        const ref = await addDoc(collection(db, "notes"), {
          userId: user.uid,
          folderId: activeFolder || null,
          ...payload,
          pinned: false, deleted: false,
          tags: [], lockHash: null,
          createdAt: serverTimestamp(),
        });
        const newNote = {
          id: ref.id, ...payload, pinned: false, deleted: false,
          tags: [], folderId: activeFolder || null, lockHash: null,
        };
        setActiveNote(newNote);
        setIsNewNote(false);
        setVersions([{ title, content, label: activeLabel, savedAt: Date.now() }]);
      }
      setLastSaved(new Date());
      setIsDirty(false);
      loadNotes(activeFolder);
    } finally {
      setIsSaving(false);
    }
  }, [title, content, activeLabel, noteBg, activeNote, activeFolder, user, isDirty, loadNotes]);

  // ─── PIN ────────────────────────────────────────────────
  const togglePin = useCallback(async (note, e) => {
    e?.stopPropagation();
    const newVal = !note.pinned;
    await updateDoc(doc(db, "notes", note.id), { pinned: newVal });
    if (activeNote?.id === note.id) setActiveNote((p) => ({ ...p, pinned: newVal }));
    loadNotes(activeFolder);
  }, [activeNote, activeFolder, loadNotes]);

  // ─── SOFT DELETE / RESTORE / HARD DELETE ────────────────
  const deleteNote = useCallback(async () => {
    if (!activeNote) return;
    setConfirmDialog({
      message: "Move this note to Trash?",
      onConfirm: async () => {
        await updateDoc(doc(db, "notes", activeNote.id), { deleted: true, deletedAt: serverTimestamp() });
        resetEditor();
        loadNotes(activeFolder);
        loadNotes(null, true);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [activeNote, activeFolder, loadNotes]);

  const restoreNote = async (note) => {
    await updateDoc(doc(db, "notes", note.id), { deleted: false, deletedAt: null });
    loadNotes(activeFolder);
    loadNotes(null, true);
  };

  const hardDeleteNote = (note) => {
    setConfirmDialog({
      message: "Permanently delete this note? This cannot be undone.",
      onConfirm: async () => {
        await deleteDoc(doc(db, "notes", note.id));
        loadNotes(null, true);
        if (activeNote?.id === note.id) resetEditor();
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const emptyTrash = () => {
    setConfirmDialog({
      message: `Permanently delete all ${trashedNotes.length} trashed notes? Cannot be undone.`,
      onConfirm: async () => {
        await Promise.all(trashedNotes.map((n) => deleteDoc(doc(db, "notes", n.id))));
        loadNotes(null, true);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ─── DUPLICATE ──────────────────────────────────────────
  const duplicateNote = useCallback(async () => {
    if (!activeNote) return;
    await addDoc(collection(db, "notes"), {
      userId: user.uid,
      folderId: activeNote.folderId || activeFolder || null,
      title: `${activeNote.title || "Untitled"} (copy)`,
      content: activeNote.content || "",
      label: activeNote.label || "none",
      noteBg: activeNote.noteBg || "default",
      pinned: false, deleted: false,
      tags: activeNote.tags || [],
      lockHash: null, // copies are never locked
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    loadNotes(activeFolder);
  }, [activeNote, activeFolder, user, loadNotes]);

  // ─── MOVE TO FOLDER ─────────────────────────────────────
  const moveToFolder = async (folderId) => {
    if (!activeNote) return;
    await updateDoc(doc(db, "notes", activeNote.id), { folderId: folderId || null });
    setActiveNote((p) => ({ ...p, folderId: folderId || null }));
    loadNotes(activeFolder);
    setShowMoveFolder(false);
  };

  // ─── NEW NOTE ────────────────────────────────────────────
  const newNote = useCallback((template = null) => {
    resetEditor();
    setIsNewNote(true);
    if (template) {
      setTitle(template.title);
      setContent(template.content);
    }
    setShowTemplates(false);
    setTimeout(() => titleRef.current?.focus(), 100);
  }, []);

  const resetEditor = () => {
    setTitle(""); setContent(""); setActiveNote(null);
    setActiveLabel("none"); setNoteBg("default");
    setLastSaved(null); setIsNewNote(false); setIsDirty(false);
    setReadOnly(false); setFocusMode(false);
    setIsLocked(false); setIsUnlocked(false);
    setVersions([]);
    setShowAI(false); setShowHistory(false);
    setWordGoal(0);
    prevEditorValues.current = { title: "", content: "", activeLabel: "none", noteBg: "default" };
  };

  // ─── RESTORE VERSION ─────────────────────────────────────
  const restoreVersion = (v) => {
    setConfirmDialog({
      message: "Restore this version? Your current edits will be replaced.",
      onConfirm: () => {
        setTitle(v.title || "");
        setContent(v.content || "");
        setActiveLabel(v.label || "none");
        setIsDirty(true);
        setShowHistory(false);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ─── APPLY AI SUGGESTION ─────────────────────────────────
  const applyAISuggestion = (text) => {
    const formatted = text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
    setContent((prev) => `${prev}<p><em>— AI Suggestion —</em></p><p>${formatted}</p>`);
    setIsDirty(true);
  };

  // ─── EXPORT ──────────────────────────────────────────────
  const exportPDF = () => {
    const pdf   = new jsPDF();
    const plain = getHtmlToText(content);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(title || "Untitled Note", 14, 20);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(plain, 182);
    pdf.text(lines, 14, 32);
    pdf.save(`${title || "note"}.pdf`);
    setShowExport(false);
  };

  const exportTXT = () => {
    const blob = new Blob([`${title}\n\n${getHtmlToText(content)}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${title || "note"}.txt`; a.click();
    setShowExport(false);
  };

  const exportHTML = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.8;color:#2c2416}h1{margin-bottom:24px}</style></head><body><h1>${title || "Untitled"}</h1>${content}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${title || "note"}.html`; a.click();
    setShowExport(false);
  };

  const exportMD = () => {
    const md   = `# ${title || "Untitled"}\n\n${getHtmlToText(content)}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${title || "note"}.md`; a.click();
    setShowExport(false);
  };

  const exportFormats = [
    { label: "PDF",      icon: "📋", fn: exportPDF  },
    { label: "TXT",      icon: "📄", fn: exportTXT  },
    { label: "HTML",     icon: "🌐", fn: exportHTML },
    { label: "Markdown", icon: "#️⃣", fn: exportMD   },
  ];

  // ─── Computed ────────────────────────────────────────────
  const editorBg = getNoteBg(noteBg);
  const isDarkBg = ["dark", "charcoal"].includes(noteBg);
  const goalPct  = wordGoal > 0 ? Math.min((wordCount / wordGoal) * 100, 100) : 0;
  const goalDone = wordGoal > 0 && wordCount >= wordGoal;
  const contentVisible = !isLocked || isUnlocked;

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <span className={styles.loadingDot} /> Loading notes…
      </div>
    );
  }

  return (
    <main className={`${styles.page} ${focusMode ? styles.focusMode : ""}`}>

      {/* ── Modals ── */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
      {showTemplates  && <TemplateModal onSelect={(t) => newNote(t)} onClose={() => setShowTemplates(false)} />}
      {showMoveFolder && (
        <MoveFolderModal
          folders={folders}
          currentFolderId={activeNote?.folderId}
          onMove={moveToFolder}
          onClose={() => setShowMoveFolder(false)}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showGoalModal  && (
        <WordGoalModal
          current={wordGoal}
          onSet={(g) => { setWordGoal(g); setShowGoalModal(false); }}
          onClose={() => setShowGoalModal(false)}
        />
      )}
      {showLockModal && (
        <LockModal
          mode={lockMode}
          existingHash={activeNote?.lockHash}
          onClose={() => setShowLockModal(false)}
          onSuccess={handleLockSuccess}
        />
      )}

      {/* ── TOP BAR ── */}
      {!focusMode && (
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
          <div className={styles.appTitle}>
            <FileEdit size={18} /><span>Notes</span>
          </div>
          {isDirty && (activeNote || isNewNote) && (
            <span className={styles.unsavedDot} title="Unsaved changes">●</span>
          )}
          <div className={styles.topRight}>
            <button className={styles.iconBtn} onClick={() => setShowSearch((s) => !s)} title="Search (Ctrl+Shift+F)">
              <Search size={16} />
            </button>
            <button className={styles.iconBtn} onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts">
              <Keyboard size={16} />
            </button>
            <button
              className={`${styles.iconBtn} ${viewMode === "grid" ? styles.iconBtnActive : ""}`}
              onClick={() => setViewMode((v) => (v === "list" ? "grid" : "list"))}
              title="Toggle view"
            >
              {viewMode === "list" ? <Grid size={16} /> : <List size={16} />}
            </button>
            <div className={styles.dropWrap}>
              <button className={styles.iconBtn} onClick={() => setShowSortMenu((s) => !s)} title="Sort">
                <SortAsc size={16} />
              </button>
              {showSortMenu && (
                <div className={styles.dropMenu}>
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      className={`${styles.dropItem} ${sortBy === s.id ? styles.dropItemActive : ""}`}
                      onClick={() => { setSortBy(s.id); setShowSortMenu(false); }}
                    >
                      {sortBy === s.id && <span>✓</span>} {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SEARCH BAR ── */}
      {showSearch && !focusMode && (
        <div className={styles.globalSearch}>
          <Search size={15} className={styles.searchIcon} />
          <input
            autoFocus
            placeholder="Search title, tag… (locked note content excluded)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          {search && <button className={styles.clearSearch} onClick={() => setSearch("")}><X size={14} /></button>}
          {search && (
            <span className={styles.searchCount}>
              {displayedNotes.length} result{displayedNotes.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className={`${styles.layout} ${focusMode ? styles.layoutFocus : ""}`}>

        {/* ── SIDEBAR ── */}
        {!focusMode && (
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>Folders</span>
              <button className={styles.iconBtnSmall} onClick={createFolder} title="New folder">
                <FolderPlus size={15} />
              </button>
            </div>

            <div
              className={`${styles.folderItem} ${!activeFolder && activeSection === "notes" ? styles.folderActive : ""}`}
              onClick={() => { setActiveFolder(null); setActiveSection("notes"); setShowTrash(false); loadNotes(); }}
            >
              <Hash size={13} /><span>All Notes</span>
              <span className={styles.folderCount}>{notes.length}</span>
            </div>

            {folders.map((f) => (
              <div
                key={f.id}
                className={`${styles.folderItem} ${activeFolder === f.id && !showTrash ? styles.folderActive : ""}`}
                onClick={() => { setActiveFolder(f.id); setActiveSection("notes"); setShowTrash(false); loadNotes(f.id); }}
              >
                <Folder size={13} />
                <span className={styles.folderName}>{f.name}</span>
                <span className={styles.folderCount}>{folderCounts[f.id] || 0}</span>
                <div className={styles.folderActions}>
                  <button className={styles.folderActionBtn} onClick={(e) => renameFolder(f, e)} title="Rename">
                    <Edit2 size={10} />
                  </button>
                  <button className={styles.folderActionBtn} onClick={(e) => deleteFolder(f.id, e)} title="Delete">
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}

            <div className={styles.sidebarDivider} />

            <div
              className={`${styles.folderItem} ${showTrash ? styles.folderActive : ""}`}
              onClick={() => { setShowTrash(true); setActiveSection("trash"); setActiveFolder(null); }}
            >
              <Trash2 size={13} /><span>Trash</span>
              {trashedNotes.length > 0 && (
                <span className={styles.folderCountRed}>{trashedNotes.length}</span>
              )}
            </div>

            <div className={styles.sidebarFooter}>
              <span>{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
              <button className={styles.newNoteSmallBtn} onClick={() => setShowTemplates(true)} title="New from template">
                <Zap size={12} />
              </button>
            </div>
          </aside>
        )}

        {/* ── NOTES LIST ── */}
        {!focusMode && (
          <section className={styles.list}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>
                {showTrash
                  ? "🗑 Trash"
                  : activeFolder
                  ? folders.find((f) => f.id === activeFolder)?.name || "Folder"
                  : "All Notes"}
              </span>
              <div className={styles.listHeaderActions}>
                {showTrash && trashedNotes.length > 0 && (
                  <button className={styles.emptyTrashBtn} onClick={emptyTrash}>
                    <Trash2 size={12} />
                  </button>
                )}
                {!showTrash && (
                  <>
                    <button className={styles.newNoteBtn} onClick={() => setShowTemplates(true)} title="Template">
                      <Zap size={13} />
                    </button>
                    <button className={styles.newNoteBtn} onClick={() => newNote()}>
                      <Plus size={14} /> New
                    </button>
                  </>
                )}
              </div>
            </div>

            {displayedNotes.length === 0 && (
              <div className={styles.emptyState}>
                <FileText size={32} className={styles.emptyIcon} />
                <p>{search ? "No results found" : showTrash ? "Trash is empty" : "No notes yet"}</p>
                <span>
                  {search ? "Try different keywords" : showTrash ? "Deleted notes appear here" : "Create your first note →"}
                </span>
              </div>
            )}

            <div className={viewMode === "grid" ? styles.noteGrid : ""}>
              {displayedNotes.map((n) => {
                const lColor = getLabelColor(n.label);
                const bg     = getNoteBg(n.noteBg);
                const isDark = ["dark", "charcoal"].includes(n.noteBg);
                const locked = !!n.lockHash && !unlockedNotes.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={`${styles.noteItem} ${viewMode === "grid" ? styles.noteItemGrid : ""} ${activeNote?.id === n.id ? styles.noteActive : ""}`}
                    style={{ background: bg, color: isDark ? "#e0e0e0" : "" }}
                    onClick={() => {
                      if (showTrash) return;
                      setActiveNote(n);
                      setTitle(n.title || "");
                      setContent(n.content || "");
                      setActiveLabel(n.label || "none");
                      setNoteBg(n.noteBg || "default");
                      setIsNewNote(false);
                      setIsDirty(false);
                      setReadOnly(false);
                      setVersions([]);
                      setShowAI(false);
                      setShowHistory(false);
                      setWordGoal(0);
                      prevEditorValues.current = {
                        title: n.title || "", content: n.content || "",
                        activeLabel: n.label || "none", noteBg: n.noteBg || "default",
                      };
                    }}
                  >
                    {n.label && n.label !== "none" && (
                      <div className={styles.noteLabelStrip} style={{ background: lColor }} />
                    )}
                    <div className={styles.noteItemBody}>
                      <div className={styles.noteItemTop}>
                        <strong className={styles.noteTitle} style={{ color: isDark ? "#fff" : "" }}>
                          {n.pinned && <Pin size={10} className={styles.pinIcon} />}
                          {n.lockHash && <Lock size={10} className={styles.lockIcon} />}
                          {n.title || "Untitled"}
                        </strong>
                        {!showTrash ? (
                          <button
                            className={`${styles.pinBtn} ${n.pinned ? styles.pinned : ""}`}
                            onClick={(e) => togglePin(n, e)}
                          >
                            {n.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                          </button>
                        ) : (
                          <div className={styles.trashBtns}>
                            <button
                              className={styles.restoreBtn}
                              onClick={(e) => { e.stopPropagation(); restoreNote(n); }}
                              title="Restore"
                            >
                              <RotateCcw size={11} />
                            </button>
                            <button
                              className={styles.hardDeleteBtn}
                              onClick={(e) => { e.stopPropagation(); hardDeleteNote(n); }}
                              title="Delete forever"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className={styles.notePreview} style={{ color: isDark ? "#aaa" : "" }}>
                        {locked
                          ? "🔒 Content is locked"
                          : getHtmlToText(n.content || "").slice(0, viewMode === "grid" ? 100 : 80) || "No content…"}
                      </p>

                      {!locked && (n.tags || []).length > 0 && (
                        <div className={styles.noteTags}>
                          {(n.tags || []).slice(0, 3).map((t) => (
                            <span key={t} className={styles.noteTag}>#{t}</span>
                          ))}
                        </div>
                      )}

                      <div className={styles.noteMeta} style={{ color: isDark ? "#666" : "" }}>
                        <Clock size={10} />
                        <span>{formatTime(n.updatedAt)}</span>
                        {locked && <span className={styles.noteLockedBadge}>🔒 locked</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── EDITOR COLUMN ── */}
        <section
          className={styles.editor}
          style={{ background: editorBg, color: isDarkBg ? "#e0e0e0" : "" }}
        >
          {!activeNote && !isNewNote ? (
            <div className={styles.editorPlaceholder}>
              <FileEdit size={48} className={styles.placeholderIcon} />
              <h3 style={{ color: isDarkBg ? "#aaa" : "" }}>Select a note or create a new one</h3>
              <div className={styles.placeholderBtns}>
                <button className={styles.newNoteBtn} onClick={() => newNote()}>
                  <Plus size={14} /> New Note
                </button>
                <button className={styles.newNoteBtnOutline} onClick={() => setShowTemplates(true)}>
                  <Zap size={14} /> From Template
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.editorWithPanel}>
              {/* ── MAIN EDITOR ── */}
              <div className={styles.editorMain}>

                {/* TOOLBAR */}
                <div
                  className={styles.editorTopBar}
                  style={{
                    background: isDarkBg ? "rgba(0,0,0,0.2)" : "",
                    borderColor: isDarkBg ? "rgba(255,255,255,0.1)" : "",
                  }}
                >
                  <div className={styles.editorMeta}>
                    {activeNote?.createdAt && (
                      <span className={styles.editorDate} style={{ color: isDarkBg ? "#888" : "" }}>
                        <Clock size={11} /> {formatTime(activeNote.createdAt)}
                      </span>
                    )}
                    {lastSaved && (
                      <span className={styles.savedBadge}>
                        ✓ Saved {lastSaved.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {isSaving && <span className={styles.savingBadge}>Saving…</span>}
                  </div>

                  <div className={styles.editorToolbar}>
                    {/* Read-only */}
                    <button
                      className={`${styles.toolbarBtn} ${readOnly ? styles.toolbarBtnActive : ""}`}
                      onClick={() => setReadOnly((r) => !r)}
                      title={readOnly ? "Switch to Edit mode" : "Switch to Read-only"}
                    >
                      {readOnly ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    {/* Focus */}
                    <button
                      className={`${styles.toolbarBtn} ${focusMode ? styles.toolbarBtnActive : ""}`}
                      onClick={() => setFocusMode((f) => !f)}
                      title="Focus Mode"
                    >
                      {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>

                    {/* Duplicate */}
                    {activeNote && (
                      <button className={styles.toolbarBtn} onClick={duplicateNote} title="Duplicate (Ctrl+D)">
                        <Copy size={14} />
                      </button>
                    )}

                    {/* Move folder */}
                    {activeNote && (
                      <button className={styles.toolbarBtn} onClick={() => setShowMoveFolder(true)} title="Move to folder">
                        <FolderInput size={14} />
                      </button>
                    )}

                    {/* SECURITY LOCK */}
                    {activeNote && (
                      <button
                        className={`${styles.toolbarBtn} ${isLocked ? styles.toolbarBtnActive : ""}`}
                        onClick={handleLockToggle}
                        title={
                          !isLocked ? "Lock note (Ctrl+Shift+L)" :
                          isUnlocked ? "Change / Remove lock" :
                          "Unlock note"
                        }
                        style={isLocked && !isUnlocked ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
                      >
                        {isLocked ? <Lock size={14} /> : <Shield size={14} />}
                      </button>
                    )}

                    {/* AI Assistant */}
                    <button
                      className={`${styles.toolbarBtn} ${showAI ? styles.toolbarBtnActive : ""}`}
                      onClick={() => setShowAI((s) => !s)}
                      title="AI Writing Assistant (Ctrl+Shift+A)"
                    >
                      <Bot size={14} />
                    </button>

                    {/* Version History */}
                    {activeNote && (
                      <button
                        className={`${styles.toolbarBtn} ${showHistory ? styles.toolbarBtnActive : ""}`}
                        onClick={() => setShowHistory((s) => !s)}
                        title="Version History (Ctrl+Shift+H)"
                      >
                        <History size={14} />
                      </button>
                    )}

                    {/* Word Goal */}
                    <button
                      className={`${styles.toolbarBtn} ${wordGoal > 0 ? styles.toolbarBtnActive : ""}`}
                      onClick={() => setShowGoalModal(true)}
                      title="Set Word Goal"
                    >
                      <Target size={14} />
                    </button>

                    {/* Label */}
                    <div className={styles.dropWrap}>
                      <button
                        className={styles.toolbarBtn}
                        onClick={() => { setShowLabels((s) => !s); setShowBgPicker(false); }}
                        title="Label color"
                      >
                        <Tag size={14} />
                        {activeLabel !== "none" && (
                          <span className={styles.labelDotSmall} style={{ background: getLabelColor(activeLabel) }} />
                        )}
                      </button>
                      {showLabels && (
                        <div className={styles.dropMenu} style={{ right: 0, minWidth: 150 }}>
                          <div className={styles.dropMenuTitle}>Label Color</div>
                          {LABEL_COLORS.map((c) => (
                            <button
                              key={c.id}
                              className={`${styles.dropItem} ${activeLabel === c.id ? styles.dropItemActive : ""}`}
                              onClick={() => { setActiveLabel(c.id); setShowLabels(false); }}
                            >
                              <span
                                className={styles.labelSwatch}
                                style={{
                                  background: c.hex === "transparent" ? "#fff" : c.hex,
                                  border: c.hex === "transparent" ? "1.5px dashed #cbd5e1" : "none",
                                }}
                              />
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Background */}
                    <div className={styles.dropWrap}>
                      <button
                        className={styles.toolbarBtn}
                        onClick={() => { setShowBgPicker((s) => !s); setShowLabels(false); }}
                        title="Note background"
                      >
                        <AlignLeft size={14} />
                      </button>
                      {showBgPicker && (
                        <div className={styles.dropMenu} style={{ right: 0, minWidth: 160 }}>
                          <div className={styles.dropMenuTitle}>Background</div>
                          {NOTE_BG_COLORS.map((c) => (
                            <button
                              key={c.id}
                              className={`${styles.dropItem} ${noteBg === c.id ? styles.dropItemActive : ""}`}
                              onClick={() => { setNoteBg(c.id); setShowBgPicker(false); }}
                            >
                              <span
                                className={styles.labelSwatch}
                                style={{ background: c.hex, border: "1.5px solid rgba(0,0,0,0.08)" }}
                              />
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Export */}
                    <div className={styles.dropWrap}>
                      <button
                        className={styles.toolbarBtn}
                        onClick={() => setShowExport((s) => !s)}
                        title="Export"
                      >
                        <Download size={14} />
                      </button>
                      {showExport && (
                        <div className={styles.dropMenu} style={{ right: 0, minWidth: 150 }}>
                          <div className={styles.dropMenuTitle}>Export As</div>
                          {exportFormats.map((f) => (
                            <button key={f.label} className={styles.dropItem} onClick={f.fn}>
                              <span>{f.icon}</span> {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* LOCKED → show lock screen */}
                {isLocked && !isUnlocked ? (
                  <LockedScreen
                    noteTitle={title}
                    onUnlock={() => { setLockMode("unlock"); setShowLockModal(true); }}
                  />
                ) : (
                  <>
                    {/* TITLE */}
                    <input
                      ref={titleRef}
                      className={styles.titleInput}
                      placeholder="Note title…"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      readOnly={readOnly}
                      style={{
                        background: editorBg,
                        color: isDarkBg ? "#fff" : "",
                        borderColor: isDarkBg ? "rgba(255,255,255,0.1)" : "",
                      }}
                    />

                    {/* TAGS */}
                    <TagsInput
                      tags={activeNote?.tags || []}
                      readOnly={readOnly}
                      isDark={isDarkBg}
                      onAdd={async (tag) => {
                        if (!activeNote) return;
                        const newTags = [...new Set([...(activeNote.tags || []), tag])];
                        await updateDoc(doc(db, "notes", activeNote.id), { tags: newTags });
                        setActiveNote((p) => ({ ...p, tags: newTags }));
                        loadNotes(activeFolder);
                      }}
                      onRemove={async (tag) => {
                        if (!activeNote) return;
                        const newTags = (activeNote.tags || []).filter((t) => t !== tag);
                        await updateDoc(doc(db, "notes", activeNote.id), { tags: newTags });
                        setActiveNote((p) => ({ ...p, tags: newTags }));
                        loadNotes(activeFolder);
                      }}
                    />

                    {/* EDITOR BODY */}
                    <div className={styles.editorBody}>
                      {readOnly ? (
                        <div
                          className={styles.readOnlyContent}
                          style={{ color: isDarkBg ? "#ccc" : "" }}
                          dangerouslySetInnerHTML={{ __html: content || "<p><em>No content</em></p>" }}
                        />
                      ) : (
                        <RichEditor value={content} onChange={setContent} />
                      )}
                    </div>
                  </>
                )}

                {/* STATS BAR */}
                <div
                  className={styles.statsBar}
                  style={{
                    background: isDarkBg ? "rgba(0,0,0,0.2)" : "",
                    borderColor: isDarkBg ? "rgba(255,255,255,0.1)" : "",
                    color: isDarkBg ? "#666" : "",
                  }}
                >
                  <span><Hash size={11} /> {wordCount} words</span>
                  <span>{charCount} chars</span>
                  <span><BookOpen size={11} /> {readingTime(getHtmlToText(content))}</span>
                  {activeNote?.folderId && (
                    <span>
                      <ChevronRight size={11} />
                      {folders.find((f) => f.id === activeNote.folderId)?.name || "Folder"}
                    </span>
                  )}
                  {isLocked && (
                    <span style={{ color: "var(--accent)" }}>
                      <Lock size={11} />{isUnlocked ? " Unlocked this session" : " Locked"}
                    </span>
                  )}
                  {/* Word goal tracker */}
                  {wordGoal > 0 && (
                    <span style={{ gap: 6, flex: 1, maxWidth: 220 }}>
                      <Target size={11} />
                      {wordCount}/{wordGoal}
                      <span className={styles.wordGoalBar}>
                        <span
                          className={`${styles.wordGoalFill} ${goalDone ? styles.wordGoalDone : ""}`}
                          style={{ width: `${goalPct}%` }}
                        />
                      </span>
                      {goalDone && <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Goal!</span>}
                    </span>
                  )}
                  {focusMode && (
                    <button className={styles.exitFocusBtn} onClick={() => setFocusMode(false)}>
                      <Minimize2 size={12} /> Exit Focus
                    </button>
                  )}
                </div>

                {/* ACTIONS BAR */}
                <div
                  className={styles.actions}
                  style={{
                    background: isDarkBg ? "rgba(0,0,0,0.2)" : "",
                    borderColor: isDarkBg ? "rgba(255,255,255,0.1)" : "",
                  }}
                >
                  <button
                    className={`${styles.primary} ${isSaving ? styles.saving : ""} ${!isDirty && activeNote ? styles.primaryDisabled : ""}`}
                    onClick={() => saveNote()}
                    disabled={isSaving || (isLocked && !isUnlocked)}
                    title="Save (Ctrl+S)"
                  >
                    <Save size={15} />{isSaving ? "Saving…" : "Save"}
                  </button>

                  {activeNote && !showTrash && contentVisible && (
                    <>
                      <button className={styles.pinAction} onClick={() => togglePin(activeNote)} title="Pin (Ctrl+P)">
                        {activeNote.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                        {activeNote.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button className={styles.secondary} onClick={duplicateNote} title="Duplicate (Ctrl+D)">
                        <Copy size={15} /> Duplicate
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={handleLockToggle}
                        title="Security lock"
                        style={isLocked ? { borderColor: "rgba(124,92,191,0.3)", color: "var(--accent)" } : {}}
                      >
                        {!isLocked ? <><Shield size={15} /> Lock</> :
                         isUnlocked ? <><ShieldOff size={15} /> Locked ✓</> :
                         <><Lock size={15} /> Unlock</>}
                      </button>
                      <button className={styles.danger} onClick={deleteNote} title="Move to Trash">
                        <Trash2 size={15} /> Trash
                      </button>
                    </>
                  )}

                  {/* When locked and not yet unlocked */}
                  {activeNote && isLocked && !isUnlocked && (
                    <button
                      className={styles.secondary}
                      onClick={() => { setLockMode("unlock"); setShowLockModal(true); }}
                    >
                      <Unlock size={15} /> Unlock to Edit
                    </button>
                  )}
                </div>
              </div>

              {/* ── AI PANEL (right side) ── */}
              {showAI && contentVisible && (
                <AIPanel
                  noteTitle={title}
                  noteContent={content}
                  onClose={() => setShowAI(false)}
                  onApply={applyAISuggestion}
                />
              )}

              {/* ── VERSION HISTORY PANEL (right side) ── */}
              {showHistory && !showAI && (
                <HistoryPanel
                  versions={versions}
                  onRestore={restoreVersion}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
