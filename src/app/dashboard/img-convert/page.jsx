"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./tool.module.css";
import UsageHistory from "../common/UsageHistory";
import layout from "../common/toolLayout.module.css";

import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";

export default function ImageConvertPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [format, setFormat] = useState("png");
  const [result, setResult] = useState(null);

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
        tool: "image-type-convert",
        imageCount: 1,
        totalSizeKB: Math.round(image.size / 1024),
        imageType: image.type.split("/")[1], // input
        convertType: format, // output
      });
    }
  };

  /* ================= CONVERT ================= */

  const convertImage = () => {
    if (!image) return;

    const img = new Image();
    img.src = preview;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const converted = canvas.toDataURL(`image/${format}`);
      setResult(converted);
    };
  };

  /* ================= DOWNLOAD ================= */

  const downloadImage = () => {
    const a = document.createElement("a");
    a.href = result;
    a.download = `converted-image.${format}`;
    a.click();
  };

  return (
    <main className={styles.page}>
      <button className={layout.backBtn} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={layout.layout}>
        {/* PREVIEW */}
        <aside className={layout.sidePanel}>
          <h3>Preview</h3>

          {!preview && (
            <p className={styles.emptyText}>Upload image to preview</p>
          )}

          {preview && <img src={preview} className={styles.previewImg} />}
        </aside>

        {/* MAIN */}
        <section className={layout.mainPanel}>
          <h1 className={layout.title}>Image Type Converter</h1>

          <label className={styles.uploadBox}>
            Upload Image
            <input type="file" accept="image/*" onChange={handleImage} />
          </label>

          <div className={styles.settings}>
            <label>Convert To</label>

            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
              <option value="webp">WEBP</option>
              <option value="bmp">BMP</option>
              <option value="gif">GIF</option>
              <option value="tiff">TIFF</option>
              <option value="ico">ICO</option>
            </select>
          </div>

          {preview && !result && (
            <button className={styles.primaryBtn} onClick={convertImage}>
              Convert Image
            </button>
          )}

          {result && (
            <>
              <img src={result} className={styles.resultImg} />

              <button className={styles.successBtn} onClick={downloadImage}>
                Download Image
              </button>
            </>
          )}
        </section>

        {/* HISTORY */}
        <UsageHistory userId={user?.uid} tool="image-type-convert" />
      </div>
    </main>
  );
}
