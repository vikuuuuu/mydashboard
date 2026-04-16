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

const FORMATS = ["png","jpeg","jpg","webp"];

const FILTERS = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invert" },
  { id: "blur", label: "Blur" },
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

  // ✅ FIX: memory leak
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

  const getImage = () =>
    new Promise((res) => {
      const img = new Image();
      img.src = preview;
      img.onload = () => res(img);
    });

  /* RESIZE */
  const doResize = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");

    c.width = img.width / 2;
    c.height = img.height / 2;

    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

    setResult(c.toDataURL());
    setResultInfo({ label: "Resized", value: `${c.width}x${c.height}` });

    if (user) logToolUsage({ userId: user.uid, tool: "resize" });
    setProcessing(false);
  };

  /* COMPRESS */
  const doCompress = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");

    c.width = img.width;
    c.height = img.height;

    c.getContext("2d").drawImage(img, 0, 0);

    const out = c.toDataURL("image/jpeg", 0.7);

    setResult(out);
    setResultInfo({ label: "Compressed", value: "70%" });

    if (user) logToolUsage({ userId: user.uid, tool: "compress" });
    setProcessing(false);
  };

  /* CONVERT */
  const doConvert = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");

    c.width = img.width;
    c.height = img.height;

    c.getContext("2d").drawImage(img, 0, 0);

    const out = c.toDataURL("image/png");

    setResult(out);
    setResultInfo({ label: "Converted", value: "PNG" });

    if (user) logToolUsage({ userId: user.uid, tool: "convert" });
    setProcessing(false);
  };

  /* CROP */
  const doCrop = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");

    const w = img.width / 2;
    const h = img.height / 2;

    c.width = w;
    c.height = h;

    c.getContext("2d").drawImage(img, 0, 0, w, h, 0, 0, w, h);

    setResult(c.toDataURL());
    setResultInfo({ label: "Cropped", value: `${w}x${h}` });

    if (user) logToolUsage({ userId: user.uid, tool: "crop" });
    setProcessing(false);
  };

  /* ROTATE */
  const doRotate = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");

    c.width = img.height;
    c.height = img.width;

    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    setResult(c.toDataURL());
    setResultInfo({ label: "Rotated", value: "90°" });

    if (user) logToolUsage({ userId: user.uid, tool: "rotate" });
    setProcessing(false);
  };

  /* FILTER */
  const doFilter = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;

    const ctx = c.getContext("2d");
    ctx.filter = "grayscale(100%)";
    ctx.drawImage(img, 0, 0);

    setResult(c.toDataURL());
    setResultInfo({ label: "Filter", value: "Grayscale" });

    if (user) logToolUsage({ userId: user.uid, tool: "filter" });
    setProcessing(false);
  };

  /* WATERMARK */
  const doWatermark = async () => {
    if (!preview) return;
    setProcessing(true);

    const img = await getImage();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;

    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "30px sans-serif";
    ctx.fillText("© My Image", 20, c.height - 20);

    setResult(c.toDataURL());
    setResultInfo({ label: "Watermark", value: "Added" });

    if (user) logToolUsage({ userId: user.uid, tool: "watermark" });
    setProcessing(false);
  };

  const ACTION = {
    resize: doResize,
    compress: doCompress,
    convert: doConvert,
    crop: doCrop,
    rotate: doRotate,
    filter: doFilter,
    watermark: doWatermark,
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
          {processing ? "Processing..." : TABS.find(t=>t.id===tab)?.label}
        </button>
      )}
    </div>
  );
}
