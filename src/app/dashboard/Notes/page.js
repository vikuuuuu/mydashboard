"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/activityLogger";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import jsPDF from "jspdf";
import { htmlToText } from "html-to-text";
import {
  Save,
  Trash2,
  FileText,
  FileDown,
  FolderPlus,
  Search,
  Pin,
  PinOff,
  Plus,
  X,
  Tag,
  Clock,
  FileEdit,
  ChevronRight,
  Hash,
} from "lucide-react";

import { app } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import RichEditor from "@/components/RichEditor";
import styles from "./notes.module.css";

const db = getFirestore(app);

// Note label colors
const LABEL_COLORS = [
  { id: "none",   hex: "transparent", label: "None"   },
  { id: "rose",   hex: "#fda4af",     label: "Rose"   },
  { id: "amber",  hex: "#fcd34d",     label: "Amber"  },
  { id: "emerald",hex: "#6ee7b7",     label: "Emerald"},
  { id: "sky",    hex: "#7dd3fc",     label: "Sky"    },
  { id: "violet", hex: "#c4b5fd",     label: "Violet" },
];

export default function NotesDashboard() {
  const router = useRouter();
  const user = getCurrentUser();

  const [folders,      setFolders     ] = useState([]);
  const [notes,        setNotes       ] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeNote,   setActiveNote  ] = useState(null);

  const [title,   setTitle  ] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  // New feature states
  const [search,       setSearch      ] = useState("");
  const [showSearch,   setShowSearch  ] = useState(false);
  const [wordCount,    setWordCount   ] = useState(0);
  const [charCount,    setCharCount   ] = useState(0);
  const [activeLabel,  setActiveLabel ] = useState("none");
  const [showLabels,   setShowLabels  ] = useState(false);
  const [lastSaved,    setLastSaved   ] = useState(null);
  const [isSaving,     setIsSaving    ] = useState(false);
  const [isNewNote,    setIsNewNote   ] = useState(false); // tracks explicit new note mode

  /* ================= AUTH GUARD ================= */
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  /* ================= LOAD DATA ================= */
  const loadFolders = async () => {
    const q = query(collection(db, "folders"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    setFolders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const loadNotes = async (folderId = null) => {
    let q = query(collection(db, "notes"), where("userId", "==", user.uid));
    if (folderId) {
      q = query(
        collection(db, "notes"),
        where("userId", "==", user.uid),
        where("folderId", "==", folderId)
      );
    }
    const snap = await getDocs(q);
    setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (!user) return;
    loadFolders();
    loadNotes();
    setLoading(false);
  }, [user]);

  /* ================= WORD / CHAR COUNT ================= */
  useEffect(() => {
    const plain = htmlToText(content || "");
    const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(plain.replace(/\s/g, "").length);
  }, [content]);

  /* ================= FILTERED + SORTED NOTES ================= */
  const displayedNotes = useMemo(() => {
    let list = [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          htmlToText(n.content || "").toLowerCase().includes(q)
      );
    }
    // Pinned notes first
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const ta = a.updatedAt?.seconds || 0;
      const tb = b.updatedAt?.seconds || 0;
      return tb - ta;
    });
    return list;
  }, [notes, search]);

  /* ================= FOLDER ================= */
  const createFolder = async () => {
    const name = prompt("Folder name");
    if (!name) return;
    await addDoc(collection(db, "folders"), {
      userId: user.uid,
      name,
      createdAt: serverTimestamp(),
    });
    loadFolders();
  };

  const deleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!confirm("Delete this folder? Notes inside will remain.")) return;
    await deleteDoc(doc(db, "folders", folderId));
    if (activeFolder === folderId) {
      setActiveFolder(null);
      loadNotes();
    }
    loadFolders();
  };

  /* ================= SAVE NOTE ================= */
  const saveNote = async () => {
    if (!title && !content) return;
    setIsSaving(true);
    try {
      if (activeNote) {
        await updateDoc(doc(db, "notes", activeNote.id), {
          title,
          content,
          label: activeLabel,
          updatedAt: serverTimestamp(),
        });
        setActiveNote((prev) => ({ ...prev, title, content, label: activeLabel }));
      } else {
        const ref = await addDoc(collection(db, "notes"), {
          userId: user.uid,
          title,
          content,
          folderId: activeFolder,
          label: activeLabel,
          pinned: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveNote({ id: ref.id, title, content, label: activeLabel, pinned: false });
        setIsNewNote(false);

        await logActivity({
          userId: user.uid,
          type: "note_create",
          page: "/dashboard/Notes",
          meta: {
            noteId: ref.id,
            title: title || "Untitled Note",
          },
        });
      }
      setLastSaved(new Date());
      loadNotes(activeFolder);
    } finally {
      setIsSaving(false);
    }
  };

  /* ================= PIN NOTE ================= */
  const togglePin = async (note, e) => {
    e?.stopPropagation();
    await updateDoc(doc(db, "notes", note.id), { pinned: !note.pinned });
    if (activeNote?.id === note.id) setActiveNote((p) => ({ ...p, pinned: !p.pinned }));
    loadNotes(activeFolder);
  };

  /* ================= DELETE NOTE ================= */
  const deleteNote = async () => {
    if (!activeNote) return;
    if (!confirm("Delete this note?")) return;
    await deleteDoc(doc(db, "notes", activeNote.id));
    resetEditor();
    loadNotes(activeFolder);
  };

  const resetEditor = () => {
    setTitle(""); setContent("");
    setActiveNote(null); setActiveLabel("none");
    setLastSaved(null); setIsNewNote(false);
  };

  /* ================= NEW NOTE ================= */
  const newNote = () => {
    setTitle(""); setContent("");
    setActiveNote(null); setActiveLabel("none");
    setLastSaved(null);
    setIsNewNote(true); // explicitly open the editor
  };

  /* ================= EXPORT ================= */
  const exportPDF = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(title || "Untitled Note", 14, 20);
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(htmlToText(content), 180);
    pdf.text(lines, 14, 32);
    pdf.save(`${title || "note"}.pdf`);
  };

  const exportTXT = () => {
    const blob = new Blob([`${title}\n\n${htmlToText(content)}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${title || "note"}.txt`; a.click();
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      + " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const getLabelColor = (id) => LABEL_COLORS.find((c) => c.id === id)?.hex || "transparent";

  const openNote = async (note) => {
    setActiveNote(note);
    setTitle(note.title || "");
    setContent(note.content || "");
    setActiveLabel(note.label || "none");
    setIsNewNote(false);

    await logActivity({
      userId: user.uid,
      type: "note_detail",
      page: "/dashboard/Notes",
      meta: {
        noteId: note.id,
        title: note.title || "Untitled Note",
      },
    });
  };

  if (loading) return <div className={styles.loadingScreen}>Loading notes…</div>;

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.appTitle}>
          <FileEdit size={18} />
          <span>Notes</span>
        </div>
        <div className={styles.topRight}>
          <button className={styles.iconBtn} onClick={() => setShowSearch((s) => !s)} title="Search">
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* Global search bar */}
      {showSearch && (
        <div className={styles.globalSearch}>
          <Search size={15} className={styles.searchIcon} />
          <input
            autoFocus
            placeholder="Search notes by title or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          {search && <button className={styles.clearSearch} onClick={() => setSearch("")}><X size={14} /></button>}
        </div>
      )}

      <div className={styles.layout}>

        {/* ── LEFT: FOLDERS ── */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Folders</span>
            <button className={styles.iconBtnSmall} onClick={createFolder} title="New folder">
              <FolderPlus size={15} />
            </button>
          </div>

          <div
            className={`${styles.folderItem} ${!activeFolder ? styles.folderActive : ""}`}
            onClick={() => { setActiveFolder(null); loadNotes(); }}
          >
            <Hash size={13} />
            <span>All Notes</span>
            <span className={styles.folderCount}>{notes.length}</span>
          </div>

          {folders.map((f) => (
            <div
              key={f.id}
              className={`${styles.folderItem} ${activeFolder === f.id ? styles.folderActive : ""}`}
              onClick={() => { setActiveFolder(f.id); loadNotes(f.id); }}
            >
              <Hash size={13} />
              <span>{f.name}</span>
              <button
                className={styles.folderDeleteBtn}
                onClick={(e) => deleteFolder(f.id, e)}
                title="Delete folder"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          <div className={styles.sidebarFooter}>
            <span>{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
          </div>
        </aside>

        {/* ── MIDDLE: NOTES LIST ── */}
        <section className={styles.list}>
          <div className={styles.listHeader}>
            <span className={styles.listTitle}>
              {activeFolder
                ? folders.find((f) => f.id === activeFolder)?.name || "Folder"
                : "All Notes"}
            </span>
            <button className={styles.newNoteBtn} onClick={newNote}>
              <Plus size={14} /> New
            </button>
          </div>

          {displayedNotes.length === 0 && (
            <div className={styles.emptyState}>
              <FileText size={32} className={styles.emptyIcon} />
              <p>{search ? "No results found" : "No notes yet"}</p>
              <span>{search ? "Try different keywords" : "Create your first note →"}</span>
            </div>
          )}

          {displayedNotes.map((n) => (
            <div
              key={n.id}
              className={`${styles.noteItem} ${activeNote?.id === n.id ? styles.noteActive : ""}`}
              onClick={() => openNote(n)}
            >
              {/* Label strip */}
              {n.label && n.label !== "none" && (
                <div
                  className={styles.noteLabelStrip}
                  style={{ background: getLabelColor(n.label) }}
                />
              )}

              <div className={styles.noteItemBody}>
                <div className={styles.noteItemTop}>
                  <strong className={styles.noteTitle}>
                    {n.pinned && <Pin size={11} className={styles.pinIcon} />}
                    {n.title || "Untitled"}
                  </strong>
                  <button
                    className={`${styles.pinBtn} ${n.pinned ? styles.pinned : ""}`}
                    onClick={(e) => togglePin(n, e)}
                    title={n.pinned ? "Unpin" : "Pin"}
                  >
                    {n.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                </div>
                <p className={styles.notePreview}>
                  {htmlToText(n.content || "").slice(0, 80) || "No content…"}
                </p>
                <div className={styles.noteMeta}>
                  <Clock size={10} />
                  <span>{formatTime(n.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* ── RIGHT: EDITOR ── */}
        <section className={styles.editor}>
          {!activeNote && !isNewNote ? (
            <div className={styles.editorPlaceholder}>
              <FileEdit size={48} className={styles.placeholderIcon} />
              <h3>Select a note or create a new one</h3>
              <button className={styles.newNoteBtn} onClick={newNote}>
                <Plus size={14} /> New Note
              </button>
            </div>
          ) : (
            <>
              {/* Editor top bar */}
              <div className={styles.editorTopBar}>
                <div className={styles.editorMeta}>
                  {activeNote?.createdAt && (
                    <span className={styles.editorDate}>
                      <Clock size={11} /> Created {formatTime(activeNote.createdAt)}
                    </span>
                  )}
                  {lastSaved && (
                    <span className={styles.savedBadge}>
                      ✓ Saved {lastSaved.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>

                {/* Label picker */}
                <div className={styles.labelPickerWrap}>
                  <button
                    className={styles.labelPickerBtn}
                    onClick={() => setShowLabels((s) => !s)}
                    title="Set label color"
                  >
                    <Tag size={13} />
                    <span
                      className={styles.labelDot}
                      style={{ background: getLabelColor(activeLabel) !== "transparent" ? getLabelColor(activeLabel) : "#cbd5e1" }}
                    />
                  </button>
                  {showLabels && (
                    <div className={styles.labelDropdown}>
                      {LABEL_COLORS.map((c) => (
                        <button
                          key={c.id}
                          className={`${styles.labelOption} ${activeLabel === c.id ? styles.labelSelected : ""}`}
                          onClick={() => { setActiveLabel(c.id); setShowLabels(false); }}
                          title={c.label}
                        >
                          <span
                            className={styles.labelSwatch}
                            style={{
                              background: c.hex === "transparent" ? "white" : c.hex,
                              border: c.hex === "transparent" ? "1.5px dashed #cbd5e1" : "none",
                            }}
                          />
                          <span>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <input
                className={styles.titleInput}
                placeholder="Note title…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              {/* Rich editor */}
              <div className={styles.editorBody}>
                <RichEditor value={content} onChange={setContent} />
              </div>

              {/* Stats bar */}
              <div className={styles.statsBar}>
                <span><Hash size={11} /> {wordCount} words</span>
                <span>{charCount} characters</span>
                {activeNote?.folderId && (
                  <span>
                    <ChevronRight size={11} />
                    {folders.find((f) => f.id === activeNote.folderId)?.name || "Folder"}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className={styles.actions}>
                <button
                  className={`${styles.primary} ${isSaving ? styles.saving : ""}`}
                  onClick={saveNote}
                  disabled={isSaving}
                >
                  <Save size={15} />
                  {isSaving ? "Saving…" : "Save"}
                </button>

                {activeNote && (
                  <>
                    <button className={styles.pinAction} onClick={() => togglePin(activeNote)}>
                      {activeNote.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                      {activeNote.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button className={styles.secondary} onClick={exportPDF}>
                      <FileDown size={15} /> PDF
                    </button>
                    <button className={styles.secondary} onClick={exportTXT}>
                      <FileText size={15} /> TXT
                    </button>
                    <button className={styles.danger} onClick={deleteNote}>
                      <Trash2 size={15} /> Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
