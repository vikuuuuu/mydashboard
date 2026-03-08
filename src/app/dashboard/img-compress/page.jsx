"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./tool.module.css";
import UsageHistory from "../common/UsageHistory";
import layout from "../common/toolLayout.module.css";

import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";

export default function ImageCompressPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [targetKB, setTargetKB] = useState(200);
  const [result, setResult] = useState(null);
  const [size, setSize] = useState(null);

  /* ================= IMAGE SELECT ================= */
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);

    if (user) {
      await logToolUsage({
        userId: user.uid,
        tool: "image-compress",
        imageCount: 1,
        totalSizeKB: Math.round(file.size / 1024),
        imageType: file.type.split("/")[1],
      });
    }
  };

  /* ================= COMPRESS ================= */
  const compressImage = () => {
    if (!image) return;

    const img = new Image();
    img.src = preview;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      let quality = 0.9;
      let output;

      const tryCompress = () => {
        output = canvas.toDataURL("image/jpeg", quality);

        const byteString = atob(output.split(",")[1]);
        const kb = byteString.length / 1024;

        if (kb > targetKB && quality > 0.1) {
          quality -= 0.05;
          tryCompress();
        } else {
          setResult(output);
          setSize(kb.toFixed(1));
        }
      };

      tryCompress();
    };
  };

  /* ================= DOWNLOAD ================= */
  const download = () => {
    const a = document.createElement("a");
    a.href = result;
    a.download = "compressed-image.jpg";
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

        {/* MAIN PANEL */}
        <section className={layout.mainPanel}>
          <h1 className={layout.title}>Image Compress</h1>

          <label className={styles.uploadBox}>
            Upload Image
            <input type="file" accept="image/*" onChange={handleImage} />
          </label>

          <div className={styles.settings}>
            <label>Target Size (KB)</label>
            <input
              type="number"
              value={targetKB}
              onChange={(e) => setTargetKB(e.target.value)}
            />
          </div>

          {preview && !result && (
            <button className={styles.primaryBtn} onClick={compressImage}>
              Compress Image
            </button>
          )}

          {result && (
            <>
              <h4>Compressed Size: {size} KB</h4>

              <img src={result} className={styles.resultImg} />

              <button className={styles.successBtn} onClick={download}>
                Download Image
              </button>
            </>
          )}
        </section>

        {/* HISTORY */}
        <UsageHistory userId={user?.uid} tool="image-compress" />
      </div>
    </main>
  );
}
