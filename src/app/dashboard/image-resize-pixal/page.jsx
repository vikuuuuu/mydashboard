"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./tool.module.css";
import UsageHistory from "../common/UsageHistory";
import layout from "../common/toolLayout.module.css";

import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";

export default function ImageResizePage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [resized, setResized] = useState(null);

  /* ================= IMAGE SELECT ================= */
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setResized(null);

    // Log usage
    if (user) {
      await logToolUsage({
        userId: user.uid,
        tool: "image-resize-pixels",
        imageCount: 1,
        totalSizeKB: Math.round(file.size / 1024),
        width: Number(width),
        height: Number(height),
        imageType: file.type.split("/")[1],
      });
    }
  };

  /* ================= RESIZE ================= */
  const resizeImage = () => {
    if (!imageFile || !width || !height) return;

    const img = new Image();
    img.src = preview;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Number(width);
      canvas.height = Number(height);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const resizedURL = canvas.toDataURL("image/png");
      setResized(resizedURL);
    };
  };

  /* ================= DOWNLOAD ================= */
  const downloadImage = () => {
    if (!resized) return;

    const a = document.createElement("a");
    a.href = resized;
    a.download = "resized-image.png";
    a.click();
  };

  return (
    <main className={styles.page}>
      <button className={layout.backBtn} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={layout.layout}>
        {/* LEFT PREVIEW */}
        <aside className={layout.sidePanel}>
          <h3>Preview</h3>

          {!preview && (
            <p className={styles.emptyText}>Upload image to preview</p>
          )}

          {preview && <img src={preview} className={styles.previewImg} />}
        </aside>

        {/* MAIN */}
        <section className={layout.mainPanel}>
          <h1 className={layout.title}>Image Resize (Pixels)</h1>

          <label className={styles.uploadBox}>
            Upload Image
            <input type="file" accept="image/*" onChange={handleImage} />
          </label>

          <div className={styles.settings}>
            <label>Width (px)</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />

            <label>Height (px)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>

          {preview && !resized && (
            <button className={styles.primaryBtn} onClick={resizeImage}>
              Resize Image
            </button>
          )}

          {resized && (
            <>
              <img src={resized} className={styles.resultImg} />

              <button className={styles.successBtn} onClick={downloadImage}>
                Download Image
              </button>
            </>
          )}
        </section>

        {/* HISTORY */}

        <UsageHistory userId={user?.uid} tool="image-resize-pixels" />
      </div>
    </main>
  );
}
