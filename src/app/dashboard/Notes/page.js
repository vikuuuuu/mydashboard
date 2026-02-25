"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

import { app } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import RichEditor from "@/components/RichEditor";
import styles from "./notes.module.css";

const db = getFirestore(app);

export default function NotesDashboard() {
  const router = useRouter();
  const user = getCurrentUser();

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeNote, setActiveNote] = useState(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

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

  /* ================= SAVE NOTE ================= */
  const saveNote = async () => {
    if (!title && !content) return;

    if (activeNote) {
      await updateDoc(doc(db, "notes", activeNote.id), {
        title,
        content,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "notes"), {
        userId: user.uid,
        title,
        content,
        folderId: activeFolder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    resetEditor();
    loadNotes(activeFolder);
  };

  const deleteNote = async () => {
    if (!activeNote) return;
    if (!confirm("Delete this note?")) return;

    await deleteDoc(doc(db, "notes", activeNote.id));
    resetEditor();
    loadNotes(activeFolder);
  };

  const resetEditor = () => {
    setTitle("");
    setContent("");
    setActiveNote(null);
  };

  /* ================= EXPORT ================= */
  const exportPDF = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(title || "Untitled Note", 10, 15);
    pdf.setFontSize(11);
    pdf.text(htmlToText(content), 10, 30);
    pdf.save(`${title || "note"}.pdf`);
  };

  const exportTXT = () => {
    const blob = new Blob([`${title}\n\n${htmlToText(content)}`], {
      type: "text/plain",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title || "note"}.txt`;
    a.click();
  };

  if (loading) return <p className={styles.loading}>Loading notes…</p>;

  return (
    <main className={styles.page}>
      <div className={styles.layout}>

        {/* LEFT – FOLDERS */}
        <aside className={styles.sidebar}>
          <h3>Folders</h3>
          <button className={styles.newBtn} onClick={createFolder}>
            <FolderPlus size={16} /> New Folder
          </button>
          <hr className={styles.hr} />

          <div
            className={!activeFolder ? styles.active : ""}
            onClick={() => {
              setActiveFolder(null);
              loadNotes();
            }}
          >
            All Notes
          </div>

          {folders.map((f) => (
            <div
              key={f.id}
              className={activeFolder === f.id ? styles.active : ""}
              onClick={() => {
                setActiveFolder(f.id);
                loadNotes(f.id);
              }}
            >
              {f.name}
            </div>
          ))}
        </aside>

        {/* MIDDLE – NOTES LIST */}
        <section className={styles.list}>
          <h3>Notes</h3>

          {notes.length === 0 && (
            <p className={styles.empty}>No notes found</p>
          )}

          {notes.map((n) => (
            <div
              key={n.id}
              className={`${styles.noteItem} ${
                activeNote?.id === n.id ? styles.noteActive : ""
              }`}
              onClick={() => {
                setActiveNote(n);
                setTitle(n.title || "");
                setContent(n.content || "");
              }}
            >
              <strong>{n.title || "Untitled"}</strong>
              <small>
                {n.updatedAt?.toDate
                  ? n.updatedAt.toDate().toLocaleString()
                  : ""}
              </small>
            </div>
          ))}
        </section>

        {/* RIGHT – EDITOR */}
        <section className={styles.editor}>
          <input
            className={styles.titleInput}
            placeholder="Note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <RichEditor value={content} onChange={setContent} />

          <div className={styles.actions}>
            <button className={styles.primary} onClick={saveNote}>
              <Save size={16} /> Save
            </button>

            {activeNote && (
              <>
                <button className={styles.danger} onClick={deleteNote}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className={styles.secondary} onClick={exportPDF}>
                  <FileDown size={16} /> PDF
                </button>
                <button className={styles.secondary} onClick={exportTXT}>
                  <FileText size={16} /> TXT
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}