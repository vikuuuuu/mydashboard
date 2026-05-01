// File: app/dashboard/img-to-pdf/page.js
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import {
  getFirestore, collection, query, where,
  orderBy, limit, getDocs,
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "../common/toolLayout.module.css";

const db = getFirestore(app);

const PAGE_SIZES = {
  fit:    null,
  a4:     [210, 297],
  a3:     [297, 420],
  letter: [215.9, 279.4],
  legal:  [215.9, 355.6],
};

function toJpeg(file, quality) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      res(c.toDataURL("image/jpeg", quality));
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function ImgToPdfPage() {
  const router = useRouter();
  const user   = getCurrentUser();
  const fileRef = useRef();

  const [images,      setImages     ] = useState([]);
  const [dragOver,    setDragOver   ] = useState(false);
  const dragIdx = useRef(null);

  // settings
  const [pageSize,    setPageSize   ] = useState("fit");
  const [orientation, setOrientation] = useState("portrait");
  const [margin,      setMargin     ] = useState(0);
  const [quality,     setQuality    ] = useState(0.9);
  const [pdfName,     setPdfName    ] = useState("my-document");
  const [bgColor,     setBgColor    ] = useState("#ffffff");
  const [addPageNums, setAddPageNums] = useState(false);
  const [watermark,   setWatermark  ] = useState("");

  // output
  const [pdfBlob,  setPdfBlob ] = useState(null);
  const [pdfInfo,  setPdfInfo ] = useState(null);
  const [loading,  setLoading ] = useState(false);
  const [progress, setProgress] = useState(0);

  // history
  const [history,     setHistory    ] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const q = query(
          collection(db, "tool_usage"),
          where("userId", "==", user.uid),
          where("tool", "==", "image-to-pdf"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setHistLoading(false); }
    })();
  }, [user?.uid]);

  const addFiles = (files) => {
    const newImgs = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f), name: f.name, size: f.size }));
    setImages((prev) => [...prev, ...newImgs]);
    setPdfBlob(null); setPdfInfo(null);
  };

  const onDragStart   = (i) => { dragIdx.current = i; };
  const onDropReorder = (i) => {
    if (dragIdx.current === null || dragIdx.current === i) return;
    const arr = [...images];
    const [moved] = arr.splice(dragIdx.current, 1);
    arr.splice(i, 0, moved);
    setImages(arr);
    dragIdx.current = null;
  };
  const removeImg = (i) => {
    const arr = [...images]; arr.splice(i, 1); setImages(arr);
  };

  const convertToPdf = async () => {
    if (!images.length) return;
    setLoading(true); setProgress(0);

    const isLand = orientation === "landscape";
    const sizeMM = PAGE_SIZES[pageSize];
    const pdfW   = sizeMM ? (isLand ? sizeMM[1] : sizeMM[0]) : undefined;
    const pdfH   = sizeMM ? (isLand ? sizeMM[0] : sizeMM[1]) : undefined;

    const pdf = new jsPDF({
      orientation: sizeMM ? orientation : "portrait",
      unit: "mm",
      format: sizeMM ? [pdfW, pdfH] : "a4",
    });

    for (let i = 0; i < images.length; i++) {
      setProgress(Math.round((i / images.length) * 88));
      const jpeg  = await toJpeg(images[i].file, quality);
      const props = pdf.getImageProperties(jpeg);
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const m     = Number(margin);

      let imgW, imgH, x, y;
      if (pageSize === "fit") {
        imgW = pageW; imgH = (props.height * pageW) / props.width;
        x = 0; y = 0;
      } else {
        const maxW = pageW - m * 2, maxH = pageH - m * 2;
        const ratio = Math.min(maxW / props.width, maxH / props.height);
        imgW = props.width * ratio; imgH = props.height * ratio;
        x = m + (maxW - imgW) / 2; y = m + (maxH - imgH) / 2;
      }

      if (i !== 0) pdf.addPage();

      if (bgColor !== "#ffffff") {
        const hex = bgColor.replace("#", "");
        pdf.setFillColor(parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16));
        pdf.rect(0, 0, pageW, pageH, "F");
      }

      pdf.addImage(jpeg, "JPEG", x, y, imgW, imgH);

      if (watermark.trim()) {
        pdf.setFontSize(26); pdf.setTextColor(160, 160, 160);
        const tw = pdf.getTextWidth(watermark);
        pdf.text(watermark, (pageW - tw) / 2, pageH / 2 + 6, { angle: 45 });
      }

      if (addPageNums) {
        pdf.setFontSize(9); pdf.setTextColor(130);
        pdf.text(`${i + 1} / ${images.length}`, pageW - m - 12, pageH - m - 4);
      }
    }

    setProgress(96);
    const blob = pdf.output("blob");
    setPdfBlob(blob);
    setPdfInfo({ name: `${pdfName || "document"}.pdf`, size: (blob.size / (1024*1024)).toFixed(2), pages: images.length });
    setProgress(100);
    setLoading(false);

    if (user) {
      await logToolUsage({ userId: user.uid, tool: "image-to-pdf", imageCount: images.length, totalSizeKB: Math.round(blob.size / 1024) });
    }
  };

  const download = () => {
    if (!pdfBlob || !pdfInfo) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdfBlob);
    a.download = pdfInfo.name; a.click();
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  };

  const totalSizeMB = (images.reduce((s, i) => s + i.size, 0) / 1024 / 1024).toFixed(2);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>📄</div>
          <span>Image → PDF</span>
        </div>
        {images.length > 0 && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>{images.length} image{images.length !== 1 ? "s" : ""}</span>
            <span className={styles.statChip}>{totalSizeMB} MB</span>
            <button className={styles.clearBtn} onClick={() => { setImages([]); setPdfBlob(null); setPdfInfo(null); }}>✕ Clear</button>
          </div>
        )}
      </div>

      <div className={styles.layout}>
        {/* LEFT: Images */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Images ({images.length})</span>
            <div className={styles.panelActions}>
              <button className={styles.addBtn} onClick={() => fileRef.current?.click()}>+ Add</button>
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />

          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropActive : ""} ${images.length > 0 ? styles.dropHasFiles : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => !images.length && fileRef.current?.click()}
          >
            {images.length === 0 ? (
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>🖼️</div>
                <p className={styles.dropText}>Drop images here</p>
                <span className={styles.dropSub}>or click to browse</span>
                <span className={styles.dropFormats}>PNG · JPG · WEBP · BMP · GIF</span>
              </div>
            ) : (
              <div className={styles.imageGrid}>
                {images.map((img, i) => (
                  <div key={i} className={styles.imgCard} draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropReorder(i)}
                  >
                    <img src={img.preview} alt={img.name} className={styles.imgThumb} />
                    <div className={styles.imgOverlay}>
                      <span className={styles.imgNum}>{i + 1}</span>
                      <button className={styles.imgRemove} onClick={(e) => { e.stopPropagation(); removeImg(i); }}>✕</button>
                    </div>
                    <div className={styles.imgLabel}>{img.name.length > 14 ? img.name.slice(0,14)+"…" : img.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pdfInfo && (
            <div className={styles.resultBox}>
              <div className={styles.resultLeft}>
                <div className={styles.resultIcon}>✅</div>
                <div>
                  <div className={styles.resultName}>{pdfInfo.name}</div>
                  <div className={styles.resultMeta}>{pdfInfo.pages} pages · {pdfInfo.size} MB</div>
                </div>
              </div>
              <button className={styles.downloadBtn} onClick={download}>↓ Download</button>
            </div>
          )}
        </aside>

        {/* MIDDLE: Settings */}
        <section className={styles.middlePanel}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>⚙️ PDF Settings</h2>

            <div className={styles.field}>
              <label>Output File Name</label>
              <div className={styles.nameRow}>
                <input className={styles.textInput} type="text" value={pdfName} onChange={(e) => setPdfName(e.target.value)} placeholder="my-document" />
                <span className={styles.nameSuffix}>.pdf</span>
              </div>
            </div>

            <div className={styles.field}>
              <label>Page Size</label>
              <div className={styles.chipGroup}>
                {Object.keys(PAGE_SIZES).map((s) => (
                  <button key={s} className={`${styles.chip} ${pageSize===s?styles.chipActive:""}`} onClick={() => setPageSize(s)}>
                    {s === "fit" ? "Fit to Image" : s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {pageSize !== "fit" && (
              <div className={styles.field}>
                <label>Orientation</label>
                <div className={styles.chipGroup}>
                  {[["portrait","↕ Portrait"],["landscape","↔ Landscape"]].map(([v,l]) => (
                    <button key={v} className={`${styles.chip} ${orientation===v?styles.chipActive:""}`} onClick={() => setOrientation(v)}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            {pageSize !== "fit" && (
              <div className={styles.field}>
                <label>Margin</label>
                <div className={styles.chipGroup}>
                  {[["0","None"],["5","Small"],["10","Medium"],["20","Large"]].map(([v,l]) => (
                    <button key={v} className={`${styles.chip} ${margin===Number(v)?styles.chipActive:""}`} onClick={() => setMargin(Number(v))}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label>Image Quality — <strong className={styles.valLabel}>{Math.round(quality * 100)}%</strong></label>
              <input type="range" min="0.3" max="1" step="0.05" value={quality} onChange={(e) => setQuality(+e.target.value)} className={styles.slider} />
              <div className={styles.sliderLabels}><span>Smaller file</span><span>Best quality</span></div>
            </div>

            <div className={styles.field}>
              <label>Background</label>
              <div className={styles.colorRow}>
                {["#ffffff","#f8f8f8","#fffef0","#f0f4ff","#1a1a2e"].map((c) => (
                  <button key={c} className={`${styles.colorSwatch} ${bgColor===c?styles.colorActive:""}`} style={{ background: c }} onClick={() => setBgColor(c)} />
                ))}
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className={styles.colorPicker} />
              </div>
            </div>

            <div className={styles.field}>
              <label>Watermark <span className={styles.optional}>optional</span></label>
              <input className={styles.textInput} type="text" value={watermark} onChange={(e) => setWatermark(e.target.value)} placeholder="e.g. CONFIDENTIAL" />
            </div>

            <div className={styles.field}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={addPageNums} onChange={(e) => setAddPageNums(e.target.checked)} />
                <span>Add page numbers</span>
              </label>
            </div>

            <button
              className={`${styles.convertBtn} ${loading ? styles.converting : ""}`}
              onClick={convertToPdf}
              disabled={loading || !images.length}
            >
              {loading ? <><span className={styles.spinner} /> Converting… {progress}%</> : <>📄 Convert {images.length > 0 ? `${images.length} Image${images.length>1?"s":""}` : ""} to PDF</>}
            </button>

            {loading && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: History */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>History</span>
          </div>
          {histLoading && <p className={styles.histEmpty}>Loading…</p>}
          {!histLoading && history.length === 0 && <p className={styles.histEmpty}>No conversions yet</p>}
          {history.map((h) => (
            <div key={h.id} className={styles.histItem}>
              <div className={styles.histIconWrap}>📄</div>
              <div className={styles.histBody}>
                <div className={styles.histTool}>Image → PDF</div>
                <div className={styles.histMeta}>{h.imageCount} images · {h.totalSizeKB} KB</div>
                <div className={styles.histDate}>{formatDate(h.createdAt)}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}