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

const FORMATS = ["png","jpeg","jpg","webp","bmp","gif","tiff","ico"];

const FILTERS = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invert" },
  { id: "blur", label: "Blur" },
  { id: "brightness", label: "Bright" },
  { id: "contrast", label: "Contrast" },
  { id: "saturate", label: "Vivid" },
];

export default function ImageStudio() {
  const router = useRouter();
  const user = getCurrentUser();

  const [tab, setTab] = useState("resize");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [origSize, setOrigSize] = useState(null);
  const [result, setResult] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);
  const [processing, setProcessing] = useState(false);

  const fileInputRef = useRef();

  // ✅ Fix: memory cleanup
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
    setResultInfo(null);

    const img = new Image();
    img.onload = () => {
      setOrigSize({
        w: img.width,
        h: img.height,
        kb: (file.size / 1024).toFixed(1),
      });
    };
    img.src = url;

    if (user) await logToolUsage({ userId: user.uid, tool: "upload" });
  }, [user]);

  const handleFileInput = (e) => loadImage(e.target.files?.[0]);

  const getCanvasImage = () =>
    new Promise((res) => {
      const img = new Image();
      img.src = preview;
      img.onload = () => res(img);
    });

  /* RESIZE */
  const doResize = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getCanvasImage();
    const canvas = document.createElement("canvas");

    canvas.width = img.width / 2;
    canvas.height = img.height / 2;

    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    setResult(canvas.toDataURL());
    setResultInfo({ label: "Resized", value: `${canvas.width}x${canvas.height}` });

    if (user) logToolUsage({ userId: user.uid, tool: "resize" });

    setProcessing(false);
  };

  /* COMPRESS */
  const doCompress = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getCanvasImage();
    const canvas = document.createElement("canvas");

    canvas.width = img.width;
    canvas.height = img.height;

    canvas.getContext("2d").drawImage(img, 0, 0);

    const output = canvas.toDataURL("image/jpeg", 0.7);

    setResult(output);
    setResultInfo({ label: "Compressed", value: "JPEG 70%" });

    if (user) logToolUsage({ userId: user.uid, tool: "compress" });

    setProcessing(false);
  };

  /* CONVERT */
  const doConvert = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getCanvasImage();
    const canvas = document.createElement("canvas");

    canvas.width = img.width;
    canvas.height = img.height;

    canvas.getContext("2d").drawImage(img, 0, 0);

    const output = canvas.toDataURL("image/png");

    setResult(output);
    setResultInfo({ label: "Converted", value: "PNG" });

    if (user) logToolUsage({ userId: user.uid, tool: "convert" });

    setProcessing(false);
  };

  /* ACTION MAPPER */
  const ACTION = {
    resize: doResize,
    compress: doCompress,
    convert: doConvert,
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button onClick={() => router.back()}>← Back</button>
        <h2>Image Studio</h2>
      </div>

      <input ref={fileInputRef} type="file" onChange={handleFileInput} hidden />

      {!imageFile && (
        <button onClick={() => fileInputRef.current.click()}>
          Upload Image
        </button>
      )}

      {preview && <img src={preview} width={200} />}

      {result && (
        <>
          <img src={result} width={200} />
          <p>{resultInfo?.label}: {resultInfo?.value}</p>
        </>
      )}

      {/* Tabs */}
      <div>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* History */}
      {tab === "history" && <UsageHistory userId={user?.uid} />}

      {/* ✅ FIX: no crash */}
      {imageFile && tab !== "history" && ACTION[tab] && (
        <button onClick={ACTION[tab]}>
          {processing ? "Processing..." : "Run Tool"}
        </button>
      )}
    </div>
  );
}
