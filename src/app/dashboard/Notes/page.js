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
  Smile, Bell, BellOff, BarChart2, Moon, Sun,
  AlertTriangle, Shield, ShieldOff, Calendar
} from "lucide-react";

const db = getFirestore(app);

// ─── Constants ───────────────────────────────────────────────
const LABEL_COLORS = [
  { id:"none",    hex:"transparent", label:"None"    },
  { id:"rose",    hex:"#fda4af",     label:"Rose"    },
  { id:"amber",   hex:"#fcd34d",     label:"Amber"   },
  { id:"emerald", hex:"#6ee7b7",     label:"Emerald" },
  { id:"sky",     hex:"#7dd3fc",     label:"Sky"     },
  { id:"violet",  hex:"#c4b5fd",     label:"Violet"  },
  { id:"orange",  hex:"#fdba74",     label:"Orange"  },
  { id:"pink",    hex:"#f9a8d4",     label:"Pink"    },
];

const NOTE_BG_COLORS = [
  { id:"default",  hex:"#fdfaf5", label:"Default"  },
  { id:"cream",    hex:"#fffbeb", label:"Cream"    },
  { id:"mint",     hex:"#f0fdf4", label:"Mint"     },
  { id:"lavender", hex:"#f5f3ff", label:"Lavender" },
  { id:"rose",     hex:"#fff1f2", label:"Rose"     },
  { id:"sky",      hex:"#f0f9ff", label:"Sky"      },
  { id:"dark",     hex:"#1e1e2e", label:"Dark"     },
  { id:"charcoal", hex:"#2d2d2d", label:"Charcoal" },
];

const MOOD_OPTIONS = [
  { id:"none",      emoji:"",    label:"No mood"    },
  { id:"happy",     emoji:"😊", label:"Happy"      },
  { id:"focused",   emoji:"🎯", label:"Focused"    },
  { id:"creative",  emoji:"🎨", label:"Creative"   },
  { id:"energetic", emoji:"⚡", label:"Energetic"  },
  { id:"calm",      emoji:"🌿", label:"Calm"       },
  { id:"sad",       emoji:"😔", label:"Sad"        },
  { id:"stressed",  emoji:"😤", label:"Stressed"   },
  { id:"inspired",  emoji:"💡", label:"Inspired"   },
];

const TEMPLATES = [
  { id:"blank",   label:"Blank Note",      icon:"📄", title:"", content:"" },
  { id:"meeting", label:"Meeting Notes",   icon:"📋", title:"Meeting Notes", content:"<h2>Attendees</h2><p></p><h2>Agenda</h2><ul><li></li></ul><h2>Action Items</h2><ul><li></li></ul><h2>Next Steps</h2><p></p>" },
  { id:"todo",    label:"To-Do List",      icon:"✅", title:"To-Do List", content:"<h2>Tasks</h2><ul><li>[ ] </li><li>[ ] </li><li>[ ] </li></ul>" },
  { id:"journal", label:"Daily Journal",   icon:"📖", title:`Journal - ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})}`, content:"<h2>Today's Highlights</h2><p></p><h2>What I Learned</h2><p></p><h2>Gratitude</h2><p></p>" },
  { id:"idea",    label:"Idea Brainstorm", icon:"💡", title:"Idea: ", content:"<h2>The Idea</h2><p></p><h2>Why It Matters</h2><p></p><h2>Next Steps</h2><ul><li></li></ul>" },
  { id:"research",label:"Research Note",   icon:"🔬", title:"Research: ", content:"<h2>Overview</h2><p></p><h2>Key Points</h2><ul><li></li></ul><h2>Sources</h2><ul><li></li></ul><h2>Conclusions</h2><p></p>" },
];

const SORT_OPTIONS = [
  { id:"updated_desc", label:"Last Modified" },
  { id:"updated_asc",  label:"Oldest First"  },
  { id:"title_asc",    label:"Title A→Z"     },
  { id:"title_desc",   label:"Title Z→A"     },
  { id:"label",        label:"By Label"      },
  { id:"words_desc",   label:"Most Words"    },
  { id:"due_asc",      label:"Due Date"      },
];

// ─── Utilities ────────────────────────────────────────────────
const getHtmlToText = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
};

const readingTime = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const mins  = Math.ceil(words / 200);
  return mins < 1 ? "< 1 min read" : `${mins} min read`;
};

const formatTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
       + " · " + d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
};

const getLabelColor = (id) => LABEL_COLORS.find(c => c.id === id)?.hex || "transparent";
const getNoteBg     = (id) => NOTE_BG_COLORS.find(c => c.id === id)?.hex || "#fdfaf5";

const hashPin = async (pin) => {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(pin + "notes_salt_mydashboard"));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
};

// ─── Keyboard shortcut hook ───────────────────────────────────
function useHotkeys(handlers) {
  useEffect(() => {
    const fn = (e) => {
      const key = (e.ctrlKey||e.metaKey ? "mod+" : "") + (e.shiftKey ? "shift+" : "") + e.key.toLowerCase();
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

// ─── Security Lock Dialog ─────────────────────────────────────
function SecurityLockDialog({ mode, onConfirm, onCancel, error }) {
  const [pin, setPin]       = useState("");
  const [confirm, setConfirm] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === "set" && pin !== confirm) return;
    onConfirm(pin, confirm);
  };

  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.securityDialog}>
        <div className={styles.securityHeader}>
          <div className={styles.securityIcon}><Shield size={24}/></div>
          <h3>{mode === "set" ? "🔒 Set Security Lock" : mode === "unlock" ? "🔓 Unlock Note" : "🗝 Change PIN"}</h3>
          <p>{mode === "set" ? "Set a PIN to protect this note's content" : mode === "unlock" ? "Enter PIN to view note content" : "Enter new PIN to update security"}</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.securityForm}>
          <div className={styles.pinInputWrap}>
            <input
              ref={inputRef}
              type="password"
              placeholder={mode === "unlock" ? "Enter PIN" : "Enter new PIN"}
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 20))}
              className={styles.pinInput}
              maxLength={20}
            />
          </div>
          {mode !== "unlock" && (
            <div className={styles.pinInputWrap}>
              <input
                type="password"
                placeholder="Confirm PIN"
                value={confirm}
                onChange={e => setConfirm(e.target.value.slice(0, 20))}
                className={styles.pinInput}
                maxLength={20}
              />
            </div>
          )}
          {error && <p className={styles.pinError}><AlertTriangle size={13}/> {error}</p>}
          {mode !== "unlock" && pin && confirm && pin !== confirm && (
            <p className={styles.pinError}><AlertTriangle size={13}/> PINs do not match</p>
          )}
          <div className={styles.dialogBtns} style={{ marginTop: 16 }}>
            <button type="button" className={styles.dialogCancel} onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className={styles.dialogConfirm}
              disabled={!pin || (mode !== "unlock" && pin !== confirm)}
            >
              {mode === "set" ? "Lock Note" : mode === "unlock" ? "Unlock" : "Update PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reminder Dialog ──────────────────────────────────────────
function ReminderDialog({ current, onSave, onCancel }) {
  const [date, setDate] = useState(current || "");
  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.dialog}>
        <p className={styles.dialogMsg}>📅 Set Due Date / Reminder</p>
        <input
          type="datetime-local"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={styles.dateInput}
        />
        <div className={styles.dialogBtns} style={{ marginTop: 14 }}>
          {current && <button className={styles.dialogCancel} style={{ color:"var(--danger)" }} onClick={() => onSave("")}>Remove</button>}
          <button className={styles.dialogCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.dialogConfirm} onClick={() => onSave(date)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Summary Modal ─────────────────────────────────────────
function AISummaryModal({ summary, loading, onClose }) {
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.aiModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Zap size={16}/> AI Summary</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
        </div>
        <div className={styles.aiSummaryBody}>
          {loading ? (
            <div className={styles.aiLoading}>
              <div className={styles.aiSpinner}/>
              <span>Generating summary…</span>
            </div>
          ) : (
            <p className={styles.aiSummaryText}>{summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Capture Modal ──────────────────────────────────────
function QuickCaptureModal({ onSave, onClose }) {
  const [text, setText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.quickModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Zap size={16}/> Quick Capture</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
        </div>
        <div className={styles.quickBody}>
          <input
            className={styles.quickTitleInput}
            placeholder="Title (optional)…"
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className={styles.quickTextarea}
            placeholder="Capture your thought…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
          />
          <button
            className={`${styles.newNoteBtn} ${styles.fullWidthBtn}`}
            onClick={() => { if (text.trim() || noteTitle.trim()) onSave(noteTitle, text); }}
            disabled={!text.trim() && !noteTitle.trim()}
          >
            <Save size={14}/> Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Modal ─────────────────────────────────────────
function AnalyticsModal({ notes, onClose }) {
  const totalWords   = notes.reduce((acc, n) => acc + (getHtmlToText(n.content||"").trim().split(/\s+/).filter(Boolean).length), 0);
  const avgWords     = notes.length ? Math.round(totalWords / notes.length) : 0;
  const mostWords    = notes.length ? Math.max(...notes.map(n => getHtmlToText(n.content||"").trim().split(/\s+/).filter(Boolean).length)) : 0;
  const pinned       = notes.filter(n => n.pinned).length;
  const locked       = notes.filter(n => n.isLocked).length;
  const withDue      = notes.filter(n => n.dueDate).length;
  const overdue      = notes.filter(n => n.dueDate && new Date(n.dueDate) < new Date()).length;
  const moodMap      = {};
  notes.forEach(n => { if (n.mood && n.mood !== "none") moodMap[n.mood] = (moodMap[n.mood]||0)+1; });
  const topMood      = Object.entries(moodMap).sort((a,b)=>b[1]-a[1])[0];

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.analyticsModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><BarChart2 size={16}/> Notes Analytics</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
        </div>
        <div className={styles.analyticsGrid}>
          <div className={styles.statCard}><div className={styles.statNum}>{notes.length}</div><div className={styles.statLabel}>Total Notes</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{totalWords.toLocaleString()}</div><div className={styles.statLabel}>Total Words</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{avgWords}</div><div className={styles.statLabel}>Avg Words/Note</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{mostWords}</div><div className={styles.statLabel}>Longest Note</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{pinned}</div><div className={styles.statLabel}>Pinned</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{locked}</div><div className={styles.statLabel}>Locked 🔒</div></div>
          <div className={styles.statCard}><div className={styles.statNum}>{withDue}</div><div className={styles.statLabel}>With Due Date</div></div>
          <div className={styles.statCard} style={{ borderColor:"var(--danger)", background:"var(--danger-soft)" }}>
            <div className={styles.statNum} style={{ color:"var(--danger)" }}>{overdue}</div>
            <div className={styles.statLabel}>Overdue ⚠️</div>
          </div>
          {topMood && (
            <div className={styles.statCard} style={{ gridColumn:"span 2" }}>
              <div className={styles.statNum}>{MOOD_OPTIONS.find(m=>m.id===topMood[0])?.emoji}</div>
              <div className={styles.statLabel}>Most Used Mood: {topMood[0]} ({topMood[1]}x)</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Template Modal ───────────────────────────────────────────
function TemplateModal({ onSelect, onClose }) {
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.templateModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Zap size={16}/> Choose Template</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
        </div>
        <div className={styles.templateGrid}>
          {TEMPLATES.map(t => (
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
      <div className={styles.moveModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><FolderInput size={16}/> Move to Folder</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
        </div>
        <div className={styles.moveList}>
          <button className={`${styles.moveItem} ${!currentFolderId ? styles.moveItemActive : ""}`} onClick={() => onMove(null)}>
            <Hash size={14}/> All Notes (No Folder)
          </button>
          {folders.map(f => (
            <button key={f.id} className={`${styles.moveItem} ${currentFolderId===f.id ? styles.moveItemActive : ""}`} onClick={() => onMove(f.id)}>
              <Folder size={14}/> {f.name}
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
    ["Ctrl + S",       "Save note"],
    ["Ctrl + N",       "New note"],
    ["Ctrl + Shift+F", "Toggle search"],
    ["Ctrl + D",       "Duplicate note"],
    ["Ctrl + P",       "Toggle pin"],
    ["Ctrl + E",       "Export PDF"],
    ["Ctrl + L",       "Toggle note lock"],
    ["Ctrl + Q",       "Quick capture"],
    ["Escape",         "Close panels"],
  ];
  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.shortcutsModal} onClick={e => e.stopPropagation()}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}><Keyboard size={16}/> Keyboard Shortcuts</span>
          <button onClick={onClose} className={styles.iconBtnSmall}><X size={14}/></button>
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

// ─── Locked Note Overlay ──────────────────────────────────────
function LockedNoteOverlay({ onUnlock }) {
  return (
    <div className={styles.lockedOverlay}>
      <div className={styles.lockedContent}>
        <div className={styles.lockIconBig}><Lock size={36}/></div>
        <h3>This note is locked</h3>
        <p>Enter your PIN to view the content</p>
        <button className={styles.unlockBtn} onClick={onUnlock}>
          <Unlock size={16}/> Unlock Note
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function NotesDashboard() {
  const router = useRouter();
  const user   = getCurrentUser();

  // Data
  const [folders,      setFolders     ] = useState([]);
  const [notes,        setNotes       ] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeNote,   setActiveNote  ] = useState(null);
  const [loading,      setLoading     ] = useState(true);

  // Editor
  const [title,        setTitle      ] = useState("");
  const [content,      setContent    ] = useState("");
  const [activeLabel, setActiveLabel] = useState("none");
  const [noteBg,       setNoteBg      ] = useState("default");
  const [mood,         setMood        ] = useState("none");
  const [dueDate,      setDueDate    ] = useState("");
  const [lastSaved,    setLastSaved  ] = useState(null);
  const [isSaving,     setIsSaving    ] = useState(false);
  const [isNewNote,     setIsNewNote   ] = useState(false);
  const [isDirty,      setIsDirty     ] = useState(false);

  // Security
  const [isNoteUnlocked,     setIsNoteUnlocked     ] = useState(false);
  const [showSecurityDialog, setShowSecurityDialog ] = useState(false);
  const [securityMode,       setSecurityMode       ] = useState("set"); 
  const [securityError,      setSecurityError      ] = useState("");

  // UI
  const [search,           setSearch        ] = useState("");
  const [showSearch,       setShowSearch    ] = useState(false);
  const [viewMode,         setViewMode      ] = useState("list");
  const [sortBy,           setSortBy        ] = useState("updated_desc");
  const [showLabels,       setShowLabels    ] = useState(false);
  const [showBgPicker,     setShowBgPicker  ] = useState(false);
  const [showSortMenu,     setShowSortMenu  ] = useState(false);
  const [showExport,       setShowExport    ] = useState(false);
  const [showTemplates,     setShowTemplates ] = useState(false);
  const [showMoveFolder,   setShowMoveFolder] = useState(false);
  const [showShortcuts,    setShowShortcuts ] = useState(false);
  const [showMoodPicker,   setShowMoodPicker] = useState(false);
  const [showReminder,     setShowReminder  ] = useState(false);
  const [showAISummary,    setShowAISummary ] = useState(false);
  const [showAnalytics,    setShowAnalytics ] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [aiSummary,        setAiSummary     ] = useState("");
  const [aiLoading,        setAiLoading     ] = useState(false);
  const [focusMode,        setFocusMode     ] = useState(false);
  const [readOnly,         setReadOnly      ] = useState(false);
  const [showTrash,        setShowTrash     ] = useState(false);
  const [confirmDialog,    setConfirmDialog ] = useState(null);
  const [darkMode,         setDarkMode      ] = useState(false);

  // Stats
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const autoSaveRef = useRef(null);
  const titleRef    = useRef(null);

  // Dark mode persistence
  useEffect(() => {
    const saved = localStorage.getItem("notes_dark_mode");
    if (saved === "true") setDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("notes_dark_mode", darkMode);
    document.documentElement.setAttribute("data-notes-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      router.replace("/login");
    } else {
      logToolUsage({
        userId: user.uid,
        tool: "Notes",
        action: "PAGE_VISIT"
      });
    }
  }, [user, router]);

  // ── Load data ─────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    if (!user) return;
    const q    = query(collection(db, "folders"), where("userId","==",user.uid), orderBy("createdAt","asc"));
    const snap = await getDocs(q);
    setFolders(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  }, [user]);

  const loadNotes = useCallback(async (folderId = null, trashed = false) => {
    if (!user) return;
    let q = query(collection(db, "notes"), where("userId","==",user.uid), where("deleted","==",trashed));
    if (folderId && !trashed) {
      q = query(collection(db,"notes"), where("userId","==",user.uid), where("folderId","==",folderId), where("deleted","==",false));
    }
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (trashed) setTrashedNotes(list);
    else setNotes(list);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await Promise.all([loadFolders(), loadNotes(null, false), loadNotes(null, true)]);
      setLoading(false);
    })();
  }, [user, loadFolders, loadNotes]);

  // ── Word/char count ───────────────────────────────────────
  useEffect(() => {
    const plain = getHtmlToText(content);
    const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(plain.replace(/\s/g,"").length);
  }, [content]);

  // ── Mark dirty on change ──────────────────────────────────
  const prevNoteId = useRef(null);
  useEffect(() => {
    if (activeNote?.id !== prevNoteId.current) {
      prevNoteId.current = activeNote?.id || null;
      return; 
    }
    setIsDirty(true);
  }, [title, content, activeLabel, noteBg, mood, dueDate, activeNote]);

  // ── Auto-save every 30s ───────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (isDirty && (title || content)) saveNote(true);
    }, 30000);
    return () => clearTimeout(autoSaveRef.current);
  }, [isDirty, title, content, saveNote]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useHotkeys({
    "mod+s":       () => saveNote(),
    "mod+n":       () => newNote(),
    "mod+shift+f": () => setShowSearch(s => !s),
    "mod+d":       () => duplicateNote(),
    "mod+p":       () => activeNote && togglePin(activeNote),
    "mod+e":       () => activeNote && exportPDF(),
    "mod+l":       () => activeNote && handleLockToggle(),
    "mod+q":       () => setShowQuickCapture(true),
    "escape":      () => {
      setShowSearch(false); setShowLabels(false); setShowBgPicker(false);
      setShowSortMenu(false); setShowExport(false); setFocusMode(false);
      setShowMoodPicker(false);
    },
  });

  // ── Sorted + filtered notes ───────────────────────────────
  const displayedNotes = useMemo(() => {
    let list = showTrash ? [...trashedNotes] : [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        n.title?.toLowerCase().includes(q) ||
        getHtmlToText(n.content||"").toLowerCase().includes(q) ||
        (n.tags||[]).some(t => t.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      if (!showTrash) {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
      }
      switch(sortBy) {
        case "updated_asc":  return (a.updatedAt?.seconds||0) - (b.updatedAt?.seconds||0);
        case "title_asc":    return (a.title||"").localeCompare(b.title||"");
        case "title_desc":   return (b.title||"").localeCompare(a.title||"");
        case "label":        return (a.label||"").localeCompare(b.label||"");
        case "words_desc":   return (getHtmlToText(b.content||"").split(/\s+/).length) - (getHtmlToText(a.content||"").split(/\s+/).length);
        case "due_asc":      return (a.dueDate||"9999") < (b.dueDate||"9999") ? -1 : 1;
        default:             return (b.updatedAt?.seconds||0) - (a.updatedAt?.seconds||0);
      }
    });
    return list;
  }, [notes, trashedNotes, search, sortBy, showTrash]);

  // ── Folder counts ─────────────────────────────────────────
  const folderCounts = useMemo(() => {
    const map = {};
    notes.forEach(n => { if(n.folderId) map[n.folderId] = (map[n.folderId]||0)+1; });
    return map;
  }, [notes]);

  // ── FOLDER CRUD ───────────────────────────────────────────
  const createFolder = async () => {
    const name = prompt("Folder name:");
    if (!name?.trim()) return;
    const ref = await addDoc(collection(db, "folders"), { userId:user.uid, name:name.trim(), createdAt:serverTimestamp() });
    
    await logToolUsage({
       userId: user.uid,
       tool: "Notes",
       action: "Created_Folder",
       resourceId: ref.id,
       resourceName: name.trim(),
    });
    loadFolders();
  };

  const renameFolder = async (folder, e) => {
    e.stopPropagation();
    const name = prompt("New folder name:", folder.name);
    if (!name?.trim() || name === folder.name) return;
    await updateDoc(doc(db, "folders", folder.id), { name:name.trim() });
    
    await logToolUsage({
       userId: user.uid,
       tool: "Notes",
       action: "Edited_Folder",
       resourceId: folder.id,
       resourceName: name.trim(),
    });
    loadFolders();
  };

  const deleteFolder = async (folderId, e) => {
    e.stopPropagation();
    const targetFolder = folders.find(f => f.id === folderId);
    setConfirmDialog({
      message:"Delete this folder? Notes inside will be moved to All Notes.",
      onConfirm: async () => {
        await deleteDoc(doc(db,"folders",folderId));
        const q    = query(collection(db,"notes"), where("folderId","==",folderId));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => updateDoc(doc(db,"notes",d.id), { folderId:null })));
        
        await logToolUsage({
           userId: user.uid,
           tool: "Notes",
           action: "Deleted_Folder",
           resourceId: folderId,
           resourceName: targetFolder ? targetFolder.name : "Unknown",
        });

        if (activeFolder===folderId) { setActiveFolder(null); loadNotes(); }
        loadFolders(); setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ── SECURITY LOCK ─────────────────────────────────────────
  const handleLockToggle = () => {
    if (!activeNote) return;
    if (activeNote.isLocked) {
      setSecurityMode("change");
    } else {
      setSecurityMode("set");
    }
    setSecurityError("");
    setShowSecurityDialog(true);
  };

  const handleRemoveLock = () => {
    setConfirmDialog({
      message: "Remove security lock from this note?",
      onConfirm: async () => {
        await updateDoc(doc(db,"notes",activeNote.id), { isLocked:false, pinHash:null });
        
        await logToolUsage({
          userId: user.uid,
          tool: "Notes",
          action: "Edited",
          resourceId: activeNote.id,
          resourceName: activeNote.title || "Untitled",
        });

        setActiveNote(p => ({ ...p, isLocked:false, pinHash:null }));
        setIsNoteUnlocked(false);
        loadNotes(activeFolder);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const handleSecurityConfirm = async (pin, confirmPin) => {
    if (securityMode === "set" || securityMode === "change") {
      if (pin !== confirmPin) { setSecurityError("PINs don't match"); return; }
      if (pin.length < 4) { setSecurityError("PIN must be at least 4 characters"); return; }
      const hash = await hashPin(pin);
      await updateDoc(doc(db,"notes",activeNote.id), { isLocked:true, pinHash:hash });
      
      await logToolUsage({
        userId: user.uid,
        tool: "Notes",
        action: "Edited",
        resourceId: activeNote.id,
        resourceName: activeNote.title || "Untitled",
      });

      setActiveNote(p => ({ ...p, isLocked:true, pinHash:hash }));
      setIsNoteUnlocked(true);
      loadNotes(activeFolder);
      setShowSecurityDialog(false);
      setSecurityError("");
    } else if (securityMode === "unlock") {
      const hash = await hashPin(pin);
      if (hash === activeNote.pinHash) {
        setIsNoteUnlocked(true);
        setShowSecurityDialog(false);
        setSecurityError("");
      } else {
        setSecurityError("Incorrect PIN. Please try again.");
      }
    }
  };

  const handleNoteSelect = (n) => {
    if (showTrash) return;
    setActiveNote(n);
    setTitle(n.title||"");
    setContent(n.content||"");
    setActiveLabel(n.label||"none");
    setNoteBg(n.noteBg||"default");
    setMood(n.mood||"none");
    setDueDate(n.dueDate||"");
    setIsNewNote(false);
    setIsDirty(false);
    setReadOnly(false);
    if (n.isLocked) {
      setIsNoteUnlocked(false);
      setSecurityMode("unlock");
      setSecurityError("");
      setShowSecurityDialog(true);
    } else {
      setIsNoteUnlocked(true);
    }
  };

  // ── SAVE NOTE ─────────────────────────────────────────────
  const saveNote = useCallback(async (auto = false) => {
    if (!title && !content) return;
    if (!isDirty && !auto && activeNote) return;
    setIsSaving(true);
    try {
      const payload = {
        title, content, label:activeLabel, noteBg,
        mood, dueDate: dueDate || null,
        updatedAt:serverTimestamp(),
      };
      if (activeNote) {
        await updateDoc(doc(db,"notes",activeNote.id), payload);
        
        await logToolUsage({
          userId: user.uid,
          tool: "Notes",
          action: "Edited",
          resourceId: activeNote.id,
          resourceName: title || "Untitled",
        });

        setActiveNote(prev => ({ ...prev, ...payload }));
      } else {
        const ref = await addDoc(collection(db,"notes"), {
          userId:user.uid, folderId:activeFolder||null,
          ...payload, pinned:false, deleted:false,
          isLocked:false, pinHash:null,
          tags:[], createdAt:serverTimestamp(),
        });

        await logToolUsage({
          userId: user.uid,
          tool: "Notes",
          action: "Created",
          resourceId: ref.id,
          resourceName: title || "Untitled",
        });

        const nNote = { id:ref.id, ...payload, pinned:false, deleted:false, isLocked:false, pinHash:null, tags:[], folderId:activeFolder||null };
        setActiveNote(nNote);
        setIsNoteUnlocked(true);
        setIsNewNote(false);
      }
      setLastSaved(new Date());
      setIsDirty(false);
      loadNotes(activeFolder);
    } finally {
      setIsSaving(false);
    }
  }, [title, content, activeLabel, noteBg, mood, dueDate, activeNote, activeFolder, user, isDirty, loadNotes]);

  // ── PIN ───────────────────────────────────────────────────
  const togglePin = useCallback(async (note, e) => {
    e?.stopPropagation();
    const newVal = !note.pinned;
    await updateDoc(doc(db,"notes",note.id), { pinned:newVal });
    
    await logToolUsage({
      userId: user.uid,
      tool: "Notes",
      action: "Pinned",
      resourceId: note.id,
      resourceName: note.title || "Untitled",
    });

    if (activeNote?.id===note.id) setActiveNote(p => ({ ...p, pinned:newVal }));
    loadNotes(activeFolder);
  }, [activeNote, activeFolder, loadNotes]);

  // ── MOOD ──────────────────────────────────────────────────
  const saveMood = async (moodId) => {
    setMood(moodId);
    setShowMoodPicker(false);
    if (activeNote) {
      await updateDoc(doc(db,"notes",activeNote.id), { mood:moodId });
      setActiveNote(p => ({ ...p, mood:moodId }));
      loadNotes(activeFolder);
    }
  };

  // ── REMINDER ─────────────────────────────────────────────
  const saveReminder = async (dateStr) => {
    setDueDate(dateStr);
    setShowReminder(false);
    if (activeNote) {
      await updateDoc(doc(db,"notes",activeNote.id), { dueDate:dateStr||null });
      setActiveNote(p => ({ ...p, dueDate:dateStr||null }));
      loadNotes(activeFolder);
    }
  };

  // ── AI SUMMARY ENGINE ─────────────────────────────────────
  const generateAISummary = async () => {
    if (!content || !isNoteUnlocked) return;
    setShowAISummary(true);
    setAiLoading(true);
    setAiSummary("");
    try {
      const plain = getHtmlToText(content);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Please provide a concise summary of this note in 3-5 bullet points. Note title: "${title}"\n\nContent:\n${plain}\n\nReturn only the summary bullets, no preamble.`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text||"").join("") || "Unable to generate summary.";
      setAiSummary(text);
    } catch {
      setAiSummary("Error generating summary. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  // ── QUICK CAPTURE ─────────────────────────────────────────
  const saveQuickCapture = async (qTitle, qText) => {
    const finalTitle = qTitle || "Quick Note";
    const ref = await addDoc(collection(db,"notes"), {
      userId:user.uid, folderId:activeFolder||null,
      title:finalTitle,
      content:`<p>${qText.replace(/\n/g,"</p><p>")}</p>`,
      label:"none", noteBg:"default",
      mood:"none", dueDate:null,
      pinned:false, deleted:false,
      isLocked:false, pinHash:null,
      tags:[], createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
    });

    await logToolUsage({
      userId: user.uid,
      tool: "Notes",
      action: "Created",
      resourceId: ref.id,
      resourceName: finalTitle,
    });

    loadNotes(activeFolder);
    setShowQuickCapture(false);
  };

  // ── DELETE / RESTORE / DESTROY HANDLERS ───────────────────
  const deleteNote = useCallback(async () => {
    if (!activeNote) return;
    setConfirmDialog({
      message:"Move this note to Trash?",
      onConfirm: async () => {
        await updateDoc(doc(db,"notes",activeNote.id), { deleted:true, deletedAt:serverTimestamp() });
        
        await logToolUsage({
          userId: user.uid,
          tool: "Notes",
          action: "Deleted",
          resourceId: activeNote.id,
          resourceName: activeNote.title || "Untitled",
        });

        resetEditor();
        loadNotes(activeFolder);
        loadNotes(null, true);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  }, [activeNote, activeFolder, loadNotes]);

  const restoreNote = async (note) => {
    await updateDoc(doc(db,"notes",note.id), { deleted:false, deletedAt:null });
    
    await logToolUsage({
      userId: user.uid,
      tool: "Notes",
      action: "Restored",
      resourceId: note.id,
      resourceName: note.title || "Untitled",
    });

    loadNotes(activeFolder);
    loadNotes(null, true);
  };

  const hardDeleteNote = (note) => {
    setConfirmDialog({
      message:"Permanently delete this note? This cannot be undone.",
      onConfirm: async () => {
        await deleteDoc(doc(db,"notes",note.id));
        loadNotes(null, true);
        if (activeNote?.id===note.id) resetEditor();
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const emptyTrash = () => {
    setConfirmDialog({
      message:`Permanently delete all ${trashedNotes.length} trashed notes?`,
      onConfirm: async () => {
        await Promise.all(trashedNotes.map(n => deleteDoc(doc(db,"notes",n.id))));
        loadNotes(null, true);
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ── DUPLICATE ─────────────────────────────────────────────
  const duplicateNote = useCallback(async () => {
    if (!activeNote) return;
    const finalTitle = `${activeNote.title||"Untitled"} (copy)`;
    const ref = await addDoc(collection(db,"notes"), {
      userId:user.uid, folderId:activeNote.folderId||activeFolder||null,
      title:finalTitle,
      content:activeNote.content||"",
      label:activeNote.label||"none",
      noteBg:activeNote.noteBg||"default",
      mood:activeNote.mood||"none",
      dueDate:null,
      pinned:false, deleted:false,
      isLocked:false, pinHash:null,
      tags:activeNote.tags||[],
      createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
    });

    await logToolUsage({
      userId: user.uid,
      tool: "Notes",
      action: "Created",
      resourceId: ref.id,
      resourceName: finalTitle,
    });

    loadNotes(activeFolder);
  }, [activeNote, activeFolder, user, loadNotes]);

  // ── MOVE TO FOLDER ────────────────────────────────────────
  const moveToFolder = async (folderId) => {
    if (!activeNote) return;
    await updateDoc(doc(db,"notes",activeNote.id), { folderId:folderId||null });
    setActiveNote(p => ({ ...p, folderId:folderId||null }));
    loadNotes(activeFolder);
    setShowMoveFolder(false);
  };

  // ── NEW NOTE ──────────────────────────────────────────────
  const newNote = useCallback((template = null) => {
    resetEditor();
    setIsNewNote(true);
    setIsNoteUnlocked(true);
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
    setMood("none"); setDueDate("");
    setLastSaved(null); setIsNewNote(false); setIsDirty(false);
    setReadOnly(false); setFocusMode(false);
    setIsNoteUnlocked(false);
  };

  // ── EXPORT ENGINE FORMATS ─────────────────────────────────
  const triggerExportLog = (formatType) => {
    if (!activeNote) return;
    logToolUsage({
      userId: user.uid,
      tool: "Notes",
      action: "Exported",
      resourceId: activeNote.id,
      resourceName: `${activeNote.title || "Untitled"}.${formatType.toLowerCase()}`
    });
  };

  const exportPDF = () => {
    const pdf   = new jsPDF();
    const plain = getHtmlToText(content);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(18);
    pdf.text(title||"Untitled Note", 14, 20);
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(plain, 182);
    pdf.text(lines, 14, 32);
    pdf.save(`${title||"note"}.pdf`);
    triggerExportLog("PDF");
    setShowExport(false);
  };

  const exportTXT = () => {
    const blob = new Blob([`${title}\n\n${getHtmlToText(content)}`], { type:"text/plain" });
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${title||"note"}.txt`; a.click();
    triggerExportLog("TXT");
    setShowExport(false);
  };

  const exportHTML = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.8;color:#2c2416}h1{margin-bottom:24px}</style></head><body><h1>${title||"Untitled"}</h1>${content}</body></html>`;
    const blob = new Blob([html], { type:"text/html" });
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${title||"note"}.html`; a.click();
    triggerExportLog("HTML");
    setShowExport(false);
  };

  const exportMD = () => {
    const md   = `# ${title||"Untitled"}\n\n${getHtmlToText(content)}`;
    const blob = new Blob([md], { type:"text/markdown" });
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${title||"note"}.md`; a.click();
    triggerExportLog("MD");
    setShowExport(false);
  };

  const exportFormats = [
    { label:"PDF",      icon:"📋", fn:exportPDF  },
    { label:"TXT",      icon:"📄", fn:exportTXT  },
    { label:"HTML",     icon:"🌐", fn:exportHTML },
    { label:"Markdown", icon:"#️⃣", fn:exportMD   },
  ];

  const isOverdue = (note) => note.dueDate && new Date(note.dueDate) < new Date();
  const isDueSoon = (note) => {
    if (!note.dueDate) return false;
    const diff = new Date(note.dueDate) - new Date();
    return diff > 0 && diff < 24*60*60*1000;
  };

  if (loading) return (
    <div className={styles.loadingScreen} data-theme={darkMode ? "dark" : "light"}>
      <span className={styles.loadingDot}/>
      Loading notes…
    </div>
  );

  const editorBg = getNoteBg(noteBg);
  const isDarkBg = ["dark","charcoal"].includes(noteBg);
  const currentMoodEmoji = MOOD_OPTIONS.find(m => m.id === mood)?.emoji || "";

  return (
    <main
      className={`${styles.page} ${focusMode ? styles.focusMode : ""} ${darkMode ? styles.darkPage : ""}`}
      data-theme={darkMode ? "dark" : "light"}
    >
      {/* ── MODALS ── */}
      {confirmDialog && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={confirmDialog.onCancel} />}
      {showTemplates   && <TemplateModal onSelect={t => newNote(t)} onClose={() => setShowTemplates(false)} />}
      {showMoveFolder  && <MoveFolderModal folders={folders} currentFolderId={activeNote?.folderId} onMove={moveToFolder} onClose={() => setShowMoveFolder(false)} />}
      {showShortcuts   && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showSecurityDialog && (
        <SecurityLockDialog
          mode={securityMode}
          error={securityError}
          onConfirm={handleSecurityConfirm}
          onCancel={() => { setShowSecurityDialog(false); setSecurityError(""); }}
        />
      )}
      {showReminder  && <ReminderDialog current={dueDate} onSave={saveReminder} onCancel={() => setShowReminder(false)} />}
      {showAISummary && <AISummaryModal summary={aiSummary} loading={aiLoading} onClose={() => setShowAISummary(false)} />}
      {showAnalytics && <AnalyticsModal notes={notes} onClose={() => setShowAnalytics(false)} />}
      {showQuickCapture && <QuickCaptureModal onSave={saveQuickCapture} onClose={() => setShowQuickCapture(false)} />}

      {/* ── TOP BAR ── */}
      {!focusMode && (
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
          <div className={styles.appTitle}>
            <FileEdit size={18}/><span>Notes</span>
          </div>
          {isDirty && (activeNote || isNewNote) && (
            <span className={styles.unsavedDot} title="Unsaved changes">●</span>
          )}
          <div className={styles.topRight}>
            <button className={styles.iconBtn} onClick={() => setShowQuickCapture(true)} title="Quick Capture (Ctrl+Q)"><Zap size={16}/></button>
            <button className={styles.iconBtn} onClick={() => setShowSearch(s=>!s)} title="Search (Ctrl+Shift+F)"><Search size={16}/></button>
            <button className={styles.iconBtn} onClick={() => setShowAnalytics(true)} title="Analytics"><BarChart2 size={16}/></button>
            <button className={styles.iconBtn} onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts"><Keyboard size={16}/></button>
            <button className={`${styles.iconBtn} ${viewMode==="grid"?styles.iconBtnActive:""}`} onClick={() => setViewMode(v => v==="list"?"grid":"list")} title="Toggle view">
              {viewMode==="list" ? <Grid size={16}/> : <List size={16}/>}
            </button>
            <button className={`${styles.iconBtn} ${darkMode?styles.iconBtnActive:""}`} onClick={() => setDarkMode(d=>!d)} title="Toggle dark mode">
              {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
            </button>
            <div className={styles.dropWrap}>
              <button className={styles.iconBtn} onClick={() => setShowSortMenu(s=>!s)} title="Sort"><SortAsc size={16}/></button>
              {showSortMenu && (
                <div className={styles.dropMenu}>
                  {SORT_OPTIONS.map(s => (
                    <button key={s.id} className={`${styles.dropItem} ${sortBy===s.id?styles.dropItemActive:""}`} onClick={() => { setSortBy(s.id); setShowSortMenu(false); }}>
                      {sortBy===s.id && <span>✓</span>} {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      {showSearch && !focusMode && (
        <div className={styles.globalSearch}>
          <Search size={15} className={styles.searchIcon}/>
          <input
            autoFocus
            placeholder="Search by title, content or tag…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            className={styles.searchInput}
          />
          {search && <button className={styles.clearSearch} onClick={()=>setSearch("")}><X size={14}/></button>}
          {search && <span className={styles.searchCount}>{displayedNotes.length} result{displayedNotes.length!==1?"s":""}</span>}
        </div>
      )}

      <div className={`${styles.layout} ${focusMode ? styles.layoutFocus : ""}`}>
        {/* ── SIDEBAR ── */}
        {!focusMode && (
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>Folders</span>
              <button className={styles.iconBtnSmall} onClick={createFolder} title="New folder"><FolderPlus size={15}/></button>
            </div>

            <div
              className={`${styles.folderItem} ${!activeFolder && !showTrash ? styles.folderActive : ""}`}
              onClick={() => { setActiveFolder(null); setShowTrash(false); loadNotes(); }}
            >
              <Hash size={13}/><span>All Notes</span>
              <span className={styles.folderCount}>{notes.length}</span>
            </div>

            {folders.map(f => (
              <div
                key={f.id}
                className={`${styles.folderItem} ${activeFolder===f.id && !showTrash ? styles.folderActive : ""}`}
                onClick={() => { setActiveFolder(f.id); setShowTrash(false); loadNotes(f.id); }}
              >
                <Folder size={13}/><span className={styles.folderName}>{f.name}</span>
                <span className={styles.folderCount}>{folderCounts[f.id]||0}</span>
                <div className={styles.folderActions}>
                  <button className={styles.folderActionBtn} onClick={e=>renameFolder(f,e)} title="Rename"><Edit2 size={10}/></button>
                  <button className={styles.folderActionBtn} onClick={e=>deleteFolder(f.id,e)} title="Delete"><X size={10}/></button>
                </div>
              </div>
            ))}

            <div className={styles.sidebarDivider}/>

            <div
              className={`${styles.folderItem} ${showTrash ? styles.folderActive : ""}`}
              onClick={() => { setShowTrash(true); setActiveFolder(null); }}
            >
              <Trash2 size={13}/><span>Trash</span>
              {trashedNotes.length > 0 && <span className={styles.folderCountRed}>{trashedNotes.length}</span>}
            </div>

            <div className={styles.sidebarFooter}>
              <span>{notes.length} note{notes.length!==1?"s":""}</span>
              <button className={styles.newNoteSmallBtn} onClick={() => setShowTemplates(true)} title="New from template"><Zap size={12}/></button>
            </div>
          </aside>
        )}

        {/* ── NOTES LIST ── */}
        {!focusMode && (
          <section className={styles.list}>
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>
                {showTrash ? "🗑 Trash" : activeFolder ? (folders.find(f=>f.id===activeFolder)?.name||"Folder") : "All Notes"}
              </span>
              <div className={styles.listHeaderActions}>
                {showTrash && trashedNotes.length > 0 && (
                  <button className={styles.emptyTrashBtn} onClick={emptyTrash}><Trash2 size={12}/></button>
                )}
                {!showTrash && (
                  <>
                    <button className={styles.newNoteBtn} onClick={() => setShowTemplates(true)} title="Template"><Zap size={13}/></button>
                    <button className={styles.newNoteBtn} onClick={() => newNote()}><Plus size={14}/> New</button>
                  </>
                )}
              </div>
            </div>

            {displayedNotes.length === 0 && (
              <div className={styles.emptyState}>
                <FileText size={32} className={styles.emptyIcon}/>
                <p>{search?"No results found":showTrash?"Trash is empty":"No notes yet"}</p>
                <span>{search?"Try different keywords":showTrash?"Deleted notes appear here":"Create your first note →"}</span>
              </div>
            )}

            <div className={viewMode==="grid" ? styles.noteGrid : ""}>
              {displayedNotes.map(n => {
                const lColor = getLabelColor(n.label);
                const bg     = getNoteBg(n.noteBg);
                const isDark = ["dark","charcoal"].includes(n.noteBg);
                const overdue = isOverdue(n);
                const dueSoon = isDueSoon(n);
                const noteMood = MOOD_OPTIONS.find(m=>m.id===n.mood);
                return (
                  <div
                    key={n.id}
                    className={`${styles.noteItem} ${viewMode==="grid"?styles.noteItemGrid:""} ${activeNote?.id===n.id?styles.noteActive:""} ${overdue?styles.noteOverdue:""}`}
                    style={{ background:bg, color:isDark?"#e0e0e0":"" }}
                    onClick={() => handleNoteSelect(n)}
                  >
                    {n.label && n.label!=="none" && <div className={styles.noteLabelStrip} style={{ background:lColor }}/>}
                    <div className={styles.noteItemBody}>
                      <div className={styles.noteItemTop}>
                        <strong className={styles.noteTitle} style={{ color:isDark?"#fff":"" }}>
                          {n.pinned && <Pin size={10} className={styles.pinIcon}/>}
                          {n.isLocked && <Lock size={10} className={styles.lockIconSmall}/>}
                          {noteMood?.emoji && <span className={styles.noteMoodEmoji}>{noteMood.emoji}</span>}
                          {n.title||"Untitled"}
                        </strong>
                        {!showTrash ? (
                          <button className={`${styles.pinBtn} ${n.pinned?styles.pinned:""}`} onClick={e=>togglePin(n,e)}>
                            {n.pinned?<PinOff size={11}/>:<Pin size={11}/>}
                          </button>
                        ) : (
                          <div className={styles.trashBtns}>
                            <button className={styles.restoreBtn} onClick={e=>{e.stopPropagation();restoreNote(n)}}><RotateCcw size={11}/></button>
                            <button className={styles.hardDeleteBtn} onClick={e=>{e.stopPropagation();hardDeleteNote(n)}}><X size={11}/></button>
                          </div>
                        )}
                      </div>

                      {n.isLocked ? (
                        <p className={styles.notePreview} style={{ color:isDark?"#aaa":"", fontStyle:"italic", opacity:0.6 }}>
                          🔒 Content locked — click to unlock
                        </p>
                      ) : (
                        <p className={styles.notePreview} style={{ color:isDark?"#aaa":"" }}>
                          {getHtmlToText(n.content||"").slice(0,viewMode==="grid"?100:80)||"No content…"}
                        </p>
                      )}

                      {(n.tags||[]).length>0 && (
                        <div className={styles.noteTags}>
                          {(n.tags||[]).slice(0,3).map(t=><span key={t} className={styles.noteTag}>#{t}</span>)}
                        </div>
                      )}

                      {n.dueDate && (
                        <div className={`${styles.dueBadge} ${overdue?styles.dueBadgeOverdue:dueSoon?styles.dueBadgeSoon:""}`}>
                          <Bell size={9}/>
                          {overdue ? "Overdue!" : dueSoon ? "Due soon" : new Date(n.dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}
                        </div>
                      )}

                      <div className={styles.noteMeta} style={{ color:isDark?"#666":"" }}>
                        <Clock size={10}/>
                        <span>{formatTime(n.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── EDITOR ── */}
        <section className={styles.editor} style={{ background:editorBg, color:isDarkBg?"#e0e0e0":"" }}>
          {!activeNote && !isNewNote ? (
            <div className={styles.editorPlaceholder}>
              <FileEdit size={48} className={styles.placeholderIcon}/>
              <h3 style={{ color:isDarkBg?"#aaa":"" }}>Select a note or create a new one</h3>
              <div className={styles.placeholderBtns}>
                <button className={styles.newNoteBtn} onClick={()=>newNote()}><Plus size={14}/> New Note</button>
                <button className={styles.newNoteBtnOutline} onClick={()=>setShowTemplates(true)}><Zap size={14}/> From Template</button>
                <button className={styles.newNoteBtnOutline} onClick={()=>setShowQuickCapture(true)}><Zap size={14}/> Quick Capture</button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.editorTopBar} style={{ background:isDarkBg?"rgba(0,0,0,0.2)":"", borderColor:isDarkBg?"rgba(255,255,255,0.1)":"" }}>
                <div className={styles.editorMeta}>
                  {activeNote?.createdAt && (
                    <span className={styles.editorDate} style={{ color:isDarkBg?"#888":"" }}>
                      <Clock size={11}/> {formatTime(activeNote.createdAt)}
                    </span>
                  )}
                  {lastSaved && (
                    <span className={styles.savedBadge}>✓ Saved {lastSaved.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>
                  )}
                  {isSaving && <span className={styles.savingBadge}>Saving…</span>}
                  {dueDate && (
                    <span className={`${styles.dueDateBadge} ${isOverdue(activeNote)?styles.dueDateBadgeOverdue:""}`}>
                      <Calendar size={10}/> {new Date(dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                    </span>
                  )}
                </div>

                <div className={styles.editorToolbar}>
                  <button
                    className={styles.toolbarBtn}
                    onClick={generateAISummary}
                    title="AI Summary"
                    disabled={!content || !isNoteUnlocked}
                    style={{ opacity: (!content||!isNoteUnlocked) ? 0.4 : 1 }}
                  >
                    <Sparkles size={14}/>
                  </button>

                  <div className={styles.dropWrap}>
                    <button className={`${styles.toolbarBtn} ${mood!=="none"?styles.toolbarBtnActive:""}`} onClick={()=>{setShowMoodPicker(s=>!s);}} title="Set mood">
                      {currentMoodEmoji ? <span style={{ fontSize:14 }}>{currentMoodEmoji}</span> : <Smile size={14}/>}
                    </button>
                    {showMoodPicker && (
                      <div className={styles.dropMenu} style={{ right:0, minWidth:160 }}>
                        <div className={styles.dropMenuTitle}>Mood</div>
                        {MOOD_OPTIONS.map(m=>(
                          <button key={m.id} className={`${styles.dropItem} ${mood===m.id?styles.dropItemActive:""}`} onClick={()=>saveMood(m.id)}>
                            {m.emoji||"○"} {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    className={`${styles.toolbarBtn} ${dueDate?styles.toolbarBtnActive:""}`}
                    onClick={()=>setShowReminder(true)}
                    title="Set reminder / due date"
                  >
                    {dueDate ? <BellOff size={14}/> : <Bell size={14}/>}
                  </button>

                  {activeNote && (
                    <button
                      className={`${styles.toolbarBtn} ${activeNote.isLocked?styles.toolbarBtnLocked:""}`}
                      onClick={activeNote.isLocked ? handleRemoveLock : handleLockToggle}
                      title={activeNote.isLocked ? "Note is locked — click to remove lock" : "Lock this note (Ctrl+L)"}
                    >
                      {activeNote.isLocked ? <Lock size={14}/> : <ShieldOff size={14}/>}
                    </button>
                  )}

                  <button className={`${styles.toolbarBtn} ${readOnly?styles.toolbarBtnActive:""}`} onClick={()=>setReadOnly(r=>!r)} title={readOnly?"Edit":"Read Only"}>
                    {readOnly?<EyeOff size={14}/>:<Eye size={14}/>}
                  </button>

                  <button className={`${styles.toolbarBtn} ${focusMode?styles.toolbarBtnActive:""}`} onClick={()=>setFocusMode(f=>!f)} title="Focus Mode">
                    {focusMode?<Minimize2 size={14}/>:<Maximize2 size={14}/>}
                  </button>

                  {activeNote && <button className={styles.toolbarBtn} onClick={duplicateNote} title="Duplicate (Ctrl+D)"><Copy size={14}/></button>}

                  {activeNote && <button className={styles.toolbarBtn} onClick={()=>setShowMoveFolder(true)} title="Move to folder"><FolderInput size={14}/></button>}

                  <div className={styles.dropWrap}>
                    <button className={styles.toolbarBtn} onClick={()=>{setShowLabels(s=>!s);setShowBgPicker(false);}} title="Label color">
                      <Tag size={14}/>
                      {activeLabel!=="none" && <span className={styles.labelDotSmall} style={{ background:getLabelColor(activeLabel)}}/>}
                    </button>
                    {showLabels && (
                      <div className={styles.dropMenu} style={{ right:0, minWidth:150 }}>
                        <div className={styles.dropMenuTitle}>Label Color</div>
                        {LABEL_COLORS.map(c=>(
                          <button key={c.id} className={`${styles.dropItem} ${activeLabel===c.id?styles.dropItemActive:""}`} onClick={()=>{setActiveLabel(c.id);setShowLabels(false);}}>
                            <span className={styles.labelSwatch} style={{ background:c.hex==="transparent"?"#fff":c.hex, border:c.hex==="transparent"?"1.5px dashed #cbd5e1":"none" }}/>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.dropWrap}>
                    <button className={styles.toolbarBtn} onClick={()=>{setShowBgPicker(s=>!s);setShowLabels(false);}} title="Note background">
                      <AlignLeft size={14}/>
                    </button>
                    {showBgPicker && (
                      <div className={styles.dropMenu} style={{ right:0, minWidth:160 }}>
                        <div className={styles.dropMenuTitle}>Background</div>
                        {NOTE_BG_COLORS.map(c=>(
                          <button key={c.id} className={`${styles.dropItem} ${noteBg===c.id?styles.dropItemActive:""}`} onClick={()=>{setNoteBg(c.id);setShowBgPicker(false);}}>
                            <span className={styles.labelSwatch} style={{ background:c.hex, border:"1.5px solid rgba(0,0,0,0.08)" }}/>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.dropWrap}>
                    <button className={styles.toolbarBtn} onClick={()=>setShowExport(s=>!s)} title="Export">
                      <Download size={14}/>
                    </button>
                    {showExport && (
                      <div className={styles.dropMenu} style={{ right:0, minWidth:150 }}>
                        <div className={styles.dropMenuTitle}>Export As</div>
                        {exportFormats.map(f=>(
                          <button key={f.label} className={styles.dropItem} onClick={f.fn}>
                            <span>{f.icon}</span> {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <input
                ref={titleRef}
                className={styles.titleInput}
                placeholder="Note title…"
                value={title}
                onChange={e=>setTitle(e.target.value)}
                readOnly={readOnly || (activeNote?.isLocked && !isNoteUnlocked)}
                style={{ background:editorBg, color:isDarkBg?"#fff":"", borderColor:isDarkBg?"rgba(255,255,255,0.1)":"" }}
              />

              <TagsInput
                tags={activeNote?.tags||[]}
                readOnly={readOnly || (activeNote?.isLocked && !isNoteUnlocked)}
                isDark={isDarkBg}
                onAdd={async (tag) => {
                  if (!activeNote) return;
                  const newTags = [...new Set([...(activeNote.tags||[]), tag])];
                  await updateDoc(doc(db,"notes",activeNote.id), { tags:newTags });
                  setActiveNote(p=>({...p,tags:newTags}));
                  loadNotes(activeFolder);
                }}
                onRemove={async (tag) => {
                  if (!activeNote) return;
                  const newTags = (activeNote.tags||[]).filter(t=>t!==tag);
                  await updateDoc(doc(db,"notes",activeNote.id), { tags:newTags });
                  setActiveNote(p=>({...p,tags:newTags}));
                  loadNotes(activeFolder);
                }}
              />

              <div className={styles.editorBody} style={{ position:"relative" }}>
                {activeNote?.isLocked && !isNoteUnlocked ? (
                  <LockedNoteOverlay onUnlock={() => { setSecurityMode("unlock"); setSecurityError(""); setShowSecurityDialog(true); }}/>
                ) : readOnly ? (
                  <div className={styles.readOnlyContent} style={{ color:isDarkBg?"#ccc":"" }} dangerouslySetInnerHTML={{ __html:content||"<p><em>No content</em></p>" }}/>
                ) : (
                  <RichEditor value={content} onChange={setContent}/>
                )}
              </div>

              <div className={styles.statsBar} style={{ background:isDarkBg?"rgba(0,0,0,0.2)":"", borderColor:isDarkBg?"rgba(255,255,255,0.1)":"", color:isDarkBg?"#666":"" }}>
                <span><Hash size={11}/> {wordCount} words</span>
                <span>{charCount} chars</span>
                <span><BookOpen size={11}/> {readingTime(getHtmlToText(content))}</span>
                {activeNote?.folderId && <span><ChevronRight size={11}/>{folders.find(f=>f.id===activeNote.folderId)?.name||"Folder"}</span>}
                {activeNote?.isLocked && <span style={{ color:"var(--accent)" }}><Lock size={11}/> Locked</span>}
                {currentMoodEmoji && <span>{currentMoodEmoji} {MOOD_OPTIONS.find(m=>m.id===mood)?.label}</span>}
                {focusMode && <button className={styles.exitFocusBtn} onClick={()=>setFocusMode(false)}><Minimize2 size={12}/> Exit Focus</button>}
              </div>

              <div className={styles.actions} style={{ background:isDarkBg?"rgba(0,0,0,0.2)":"", borderColor:isDarkBg?"rgba(255,255,255,0.1)":"" }}>
                <button
                  className={`${styles.primary} ${isSaving?styles.saving:""} ${(!isDirty&&activeNote)?styles.primaryDisabled:""}`}
                  onClick={()=>saveNote()}
                  disabled={isSaving}
                  title="Save (Ctrl+S)"
                >
                  <Save size={15}/>{isSaving?"Saving…":"Save"}
                </button>

                {activeNote && !showTrash && (
                  <>
                    <button className={styles.pinAction} onClick={()=>togglePin(activeNote)} title="Pin (Ctrl+P)">
                      {activeNote.pinned?<PinOff size={15}/>:<Pin size={15}/>}
                      {activeNote.pinned?"Unpin":"Pin"}
                    </button>
                    <button className={styles.secondary} onClick={duplicateNote} title="Duplicate (Ctrl+D)"><Copy size={15}/> Dup</button>
                    {activeNote.isLocked && isNoteUnlocked && (
                      <button className={styles.lockAction} onClick={handleRemoveLock} title="Remove lock">
                        <Unlock size={15}/> Unlock
                      </button>
                    )}
                    {!activeNote.isLocked && (
                      <button className={styles.lockAction} onClick={handleLockToggle} title="Lock note (Ctrl+L)">
                        <Lock size={15}/> Lock
                      </button>
                    )}
                    <button className={styles.danger} onClick={deleteNote} title="Move to Trash"><Trash2 size={15}/> Trash</button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {!focusMode && (
        <button
          className={styles.floatingQuickBtn}
          onClick={() => setShowQuickCapture(true)}
          title="Quick Capture (Ctrl+Q)"
        >
          <Zap size={20}/>
        </button>
      )}
    </main>
  );
}

// ─── Tags Input Component ─────────────────────────────────────
function TagsInput({ tags, onAdd, onRemove, readOnly, isDark }) {
  const [input, setInput] = useState("");
  const handleKey = (e) => {
    if ((e.key==="Enter"||e.key===",") && input.trim()) {
      e.preventDefault();
      const tag = input.trim().toLowerCase().replace(/\s+/g,"-");
      if (!tags.includes(tag)) onAdd(tag);
      setInput("");
    } else if (e.key==="Backspace" && !input && tags.length) {
      onRemove(tags[tags.length-1]);
    }
  };
  if (readOnly && !tags.length) return null;
  return (
    <div className={styles.tagsRow} style={{ borderColor:isDark?"rgba(255,255,255,0.08)":"", background:isDark?"rgba(0,0,0,0.1)":"" }}>
      {tags.map(t=>(
        <span key={t} className={styles.tagChip} style={{ color:isDark?"#aaa":"" }}>
          #{t}
          {!readOnly && <button onClick={()=>onRemove(t)} className={styles.tagRemove}><X size={9}/></button>}
        </span>
      ))}
      {!readOnly && (
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={tags.length===0?"Add tags (Enter)":""}
          className={styles.tagInput}
          style={{ color:isDark?"#ccc":"", background:"transparent" }}
        />
      )}
    </div>
  );
}
