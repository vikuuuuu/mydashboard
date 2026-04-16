"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import UsageHistory from "../common/UsageHistory";
import styles from "./tool.module.css";

const TABS = [
  { id: "resize", icon: "⤢", label: "Resize" },
  { id: "compress", icon: "⚡", label: "Compress" },
  { id: "convert", icon: "↔", label: "Convert" },
  { id: "crop", icon: "✂", label: "Crop" },
  { id: "rotate", icon: "↻", label: "Rotate" },
  { id: "filter", icon: "✦", label: "Filters" },
  { id: "watermark", icon: "◈", label: "Watermark" },
  { id: "history", icon: "🕘", label: "History" },
];

export default function ImageStudio() {
  const router = useRouter();
  const user = getCurrentUser();

  const [tab, setTab] = useState("resize");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [historyStack, setHistoryStack] = useState([]);

  const fileInputRef = useRef();

  /* CLEANUP */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /* LOAD IMAGE */
  const loadImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;

    const url = URL.createObjectURL(file);
    setImageFile(file);
    setPreview(url);
    setResult(null);
    setHistoryStack([]);

    if (user) await logToolUsage({ userId: user.uid, tool: "upload" });
  }, [user]);

  const handleFileInput = (e) => loadImage(e.target.files?.[0]);

  /* CANVAS HELPER */
  const getImage = () =>
    new Promise((res) => {
      const img = new Image();
      img.src = preview;
      img.onload = () => res(img);
    });

  /* SAVE HISTORY */
  const saveHistory = (dataUrl) => {
    setHistoryStack((prev) => [...prev, dataUrl]);
  };

  /* UNDO */
  const undo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setResult(prev);
    setHistoryStack((h) => h.slice(0, -1));
  };

  /* RESET */
  const reset = () => {
    setResult(null);
    setHistoryStack([]);
  };

  /* RESIZE */
  const doResize = async () => {
    setProcessing(true);
    const img = await getImage();

    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 300;

    c.getContext("2d").drawImage(img, 0, 0, 300, 300);

    const out = c.toDataURL();
    saveHistory(result);
    setResult(out);

    setProcessing(false);
  };

  /* COMPRESS */
  const doCompress = async () => {
    setProcessing(true);
    const img = await getImage();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;

    c.getContext("2d").drawImage(img, 0, 0);

    const out = c.toDataURL("image/jpeg", 0.7);

    saveHistory(result);
    setResult(out);

    setProcessing(false);
  };

  /* CONVERT */
  const doConvert = async () => {
    setProcessing(true);
    const img = await getImage();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;

    c.getContext("2d").drawImage(img, 0, 0);

    const out = c.toDataURL("image/png");

    saveHistory(result);
    setResult(out);

    setProcessing(false);
  };

  /* DOWNLOAD */
  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "image-studio-pro.png";
    a.click();
  };

  const ACTIONS = {
    resize: doResize,
    compress: doCompress,
    convert: doConvert,
  };

  return (
    <div className={styles.page}>
      {/* TOP */}
      <div className={styles.topBar}>
        <button onClick={() => router.back()}>← Back</button>
        <h2>Image Studio PRO</h2>
      </div>

      {/* UPLOAD */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInput}
        hidden
      />

      {!imageFile && (
        <button onClick={() => fileInputRef.current.click()}>
          Upload Image
        </button>
      )}

      {/* PREVIEW */}
      {preview && <img src={preview} className={styles.preview} />}

      {/* RESULT */}
      {result && (
        <>
          <img src={result} className={styles.result} />
          <div className={styles.actionsRow}>
            <button onClick={download}>Download</button>
            <button onClick={undo}>Undo</button>
            <button onClick={reset}>Reset</button>
          </div>
        </>
      )}

      {/* TABS */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? styles.activeTab : ""}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* HISTORY TAB */}
      {tab === "history" && (
        <UsageHistory userId={user?.uid} />
      )}

      {/* ACTION BUTTON */}
      {imageFile && tab !== "history" && ACTIONS[tab] && (
        <button
          className={styles.runBtn}
          onClick={ACTIONS[tab]}
          disabled={processing}
        >
          {processing ? "Processing..." : "Run Tool"}
        </button>
      )}
    </div>
  );
}
