"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";

import common from "../pages.module.css";
import styles from "./imgToPdf.module.css";

import ImagePreview from "./ImagePreview";
import PdfSettings from "./PdfSettings";
import UsageHistory from "./UsageHistory";

import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";

export default function ImgToPdfPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [images, setImages] = useState([]);
  const [pageMode, setPageMode] = useState("fit");
  const [quality, setQuality] = useState(0.9);

  const [pdfInfo, setPdfInfo] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSelect = (files) => {
    const imgs = files.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setImages(imgs);
    setPdfInfo(null);
  };

  const convertToPdf = async () => {
    setLoading(true);
    const pdf = new jsPDF();

    for (let i = 0; i < images.length; i++) {
      const img = await toJpeg(images[i].file, quality);
      const w = pdf.internal.pageSize.getWidth();
      let h = pdf.internal.pageSize.getHeight();

      if (pageMode === "fit") {
        const props = pdf.getImageProperties(img);
        h = (props.height * w) / props.width;
      }

      if (i !== 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, w, h);
    }

    const blob = pdf.output("blob");
    setPdfBlob(blob);
    setImages([]); // 🔥 hide preview after convert

    setPdfInfo({
      name: "images-to-pdf.pdf",
      size: (blob.size / (1024 * 1024)).toFixed(2),
      pages: pdf.getNumberOfPages(),
    });

    if (user) {
      await logToolUsage({
        userId: user.uid,
        tool: "image-to-pdf",
        imageCount: pdf.getNumberOfPages(),
        totalSizeKB: Math.round(blob.size / 1024),
      });
    }

    setLoading(false);
  };

 
  const download = () => {
  if (!pdfBlob || !pdfInfo) return;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(pdfBlob);
  a.download = pdfInfo.name || "images-to-pdf.pdf";
  a.click();
};


  return (
    <main className={common.page}>
      <button className={common.backBtn} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={common.layout}>
        {/* LEFT */}
        <ImagePreview
          images={images}
          setImages={setImages}
          pdfInfo={pdfInfo}
          onDownload={download}
        />

        {/* MIDDLE */}
        <section className={common.mainPanel}>
          <h1 className={common.title}>Image to PDF</h1>
          <p className={common.subText}>Upload → Settings → Convert</p>

          <label className={styles.uploadBox}>
            Click to upload images
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleSelect(Array.from(e.target.files))}
            />
          </label>

          <PdfSettings
            pageMode={pageMode}
            setPageMode={setPageMode}
            quality={quality}
            setQuality={setQuality}
          />

          {images.length > 0 && (
            <button
              className={styles.primaryBtn}
              onClick={convertToPdf}
              disabled={loading}
            >
              {loading ? "Converting..." : "Convert to PDF"}
            </button>
          )}
        </section>

        {/* RIGHT */}
        <UsageHistory userId={user?.uid} />
      </div>
    </main>
  );
}

function toJpeg(file, quality) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src = URL.createObjectURL(file);
  });
}
