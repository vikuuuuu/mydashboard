"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "./pdftool.module.css";

/* ─── pdf.js loaded from CDN via script tag ─── */
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const WORKER    = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function usePdfJs() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.pdfjsLib) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = PDFJS_CDN;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
      setReady(true);
    };
    document.head.appendChild(s);
  }, []);
  return ready;
}

const TABS = [
  { id: "resize",   icon: "⤢", label: "PDF Resize"    },
  { id: "toimg",    icon: "🖼", label: "PDF to Image"  },
];

const PAGE_SIZES_MM = {
  a4:     [595.28, 841.89],   // pt
  a3:     [841.89, 1190.55],
  letter: [612, 792],
  legal:  [612, 1008],
  custom: null,
};

export default function PdfToolsPage() {
  const router = useRouter();
  const user   = getCurrentUser();
  const pdfReady = usePdfJs();

  const fileRef = useRef();
  const [tab,        setTab       ] = useState("resize");
  const [pdfFile,    setPdfFile   ] = useState(null);
  const [pdfName,    setPdfName   ] = useState("");
  const [pageCount,  setPageCount ] = useState(0);
  const [pdfSizeKB,  setPdfSizeKB ] = useState(0);
  const [isDrag,     setIsDrag    ] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress  ] = useState(0);
  const [resultUrl,  setResultUrl ] = useState(null);   // blob URL for download (resize)
  const [resultPages,setResultPages]=useState([]);      // array of {dataUrl,pageNum} (toimg)
  const [resultInfo, setResultInfo ] = useState(null);

  /* ── Resize settings ── */
  const [targetSize,    setTargetSize   ] = useState("a4");
  const [orientation,   setOrientation  ] = useState("portrait");
  const [customW,       setCustomW      ] = useState("595");
  const [customH,       setCustomH      ] = useState("842");
  const [fitMode,       setFitMode      ] = useState("fit");   // fit | stretch | crop
  const [outName,       setOutName      ] = useState("resized");

  /* ── To-Image settings ── */
  const [imgFormat,  setImgFormat ] = useState("png");
  const [imgScale,   setImgScale  ] = useState(2);      // DPI multiplier
  const [pageRange,  setPageRange ] = useState("all");  // all | custom
  const [customPages,setCustomPages]= useState("");     // e.g. "1,3,5-8"
  const [zipAll,     setZipAll    ] = useState(true);

  /* ── load PDF info ── */
  const loadPdf = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfName(file.name.replace(".pdf",""));
    setOutName(file.name.replace(".pdf","") + "-resized");
    setPdfSizeKB(Math.round(file.size / 1024));
    setResultUrl(null); setResultPages([]); setResultInfo(null);

    if (pdfReady) {
      const buf  = await file.arrayBuffer();
      const doc  = await window.pdfjsLib.getDocument({ data: buf }).promise;
      setPageCount(doc.numPages);
    }
  };

  /* ── parse page range string ── */
  const parsePages = (str, total) => {
    const pages = new Set();
    str.split(",").forEach((part) => {
      part = part.trim();
      if (part.includes("-")) {
        const [a, b] = part.split("-").map(Number);
        for (let i = a; i <= Math.min(b, total); i++) pages.add(i);
      } else {
        const n = Number(part);
        if (n >= 1 && n <= total) pages.add(n);
      }
    });
    return [...pages].sort((a, b) => a - b);
  };

  /* ════════════════════════════════════
     PDF RESIZE — canvas re-render approach
     Each page rendered to canvas at target size → new PDF blob
  ════════════════════════════════════ */
  const doResize = async () => {
    if (!pdfFile || !pdfReady) return;
    setProcessing(true); setProgress(0);

    try {
      const { jsPDF } = await import("jspdf");

      const buf = await pdfFile.arrayBuffer();
      const src = await window.pdfjsLib.getDocument({ data: buf }).promise;

      // target dimensions in pt
      let [tw, th] = PAGE_SIZES_MM[targetSize] || [Number(customW), Number(customH)];
      if (targetSize !== "custom" && orientation === "landscape") [tw, th] = [th, tw];

      const pdf = new jsPDF({
        orientation: orientation,
        unit: "pt",
        format: [tw, th],
      });

      for (let i = 1; i <= src.numPages; i++) {
        setProgress(Math.round(((i - 1) / src.numPages) * 90));
        const page    = await src.getPage(i);
        const vp      = page.getViewport({ scale: 1 });

        // scale so the page fits inside tw × th
        let scale;
        if (fitMode === "fit") {
          scale = Math.min(tw / vp.width, th / vp.height);
        } else if (fitMode === "stretch") {
          scale = Math.max(tw / vp.width, th / vp.height);
        } else {
          scale = Math.max(tw / vp.width, th / vp.height); // crop uses same scale
        }

        const vp2   = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp2.width);
        canvas.height= Math.round(vp2.height);
        const ctx   = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp2 }).promise;

        const jpeg = canvas.toDataURL("image/jpeg", 0.92);

        let x = 0, y = 0, iw = tw, ih = th;
        if (fitMode === "fit") {
          iw = vp2.width; ih = vp2.height;
          x = (tw - iw) / 2; y = (th - ih) / 2;
        }

        if (i > 1) pdf.addPage([tw, th], orientation);
        pdf.addImage(jpeg, "JPEG", x, y, iw, ih);
      }

      setProgress(96);
      const blob = pdf.output("blob");
      const url  = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultInfo({
        name:  `${outName || "resized"}.pdf`,
        pages: src.numPages,
        size:  (blob.size / 1024 / 1024).toFixed(2),
        dims:  `${Math.round(tw)} × ${Math.round(th)} pt`,
      });
      setProgress(100);

      if (user) logToolUsage({ userId: user.uid, tool: "pdf-resize", pageCount: src.numPages, totalSizeKB: Math.round(blob.size/1024) });
    } catch (err) {
      console.error(err);
      alert("Resize failed: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResized = () => {
    if (!resultUrl || !resultInfo) return;
    const a = document.createElement("a");
    a.href = resultUrl; a.download = resultInfo.name; a.click();
  };

  /* ════════════════════════════════════
     PDF TO IMAGE — each page → canvas → dataURL
  ════════════════════════════════════ */
  const doToImage = async () => {
    if (!pdfFile || !pdfReady) return;
    setProcessing(true); setProgress(0); setResultPages([]);

    try {
      const buf  = await pdfFile.arrayBuffer();
      const src  = await window.pdfjsLib.getDocument({ data: buf }).promise;

      const pages = pageRange === "all"
        ? Array.from({ length: src.numPages }, (_, i) => i + 1)
        : parsePages(customPages, src.numPages);

      if (!pages.length) { alert("No valid pages in range."); setProcessing(false); return; }

      const results = [];
      for (let idx = 0; idx < pages.length; idx++) {
        setProgress(Math.round((idx / pages.length) * 90));
        const pageNum = pages[idx];
        const page    = await src.getPage(pageNum);
        const vp      = page.getViewport({ scale: imgScale });
        const canvas  = document.createElement("canvas");
        canvas.width  = vp.width; canvas.height = vp.height;
        const ctx     = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const mime    = imgFormat === "jpg" ? "image/jpeg" : `image/${imgFormat}`;
        const dataUrl = canvas.toDataURL(mime, 0.92);
        results.push({ dataUrl, pageNum, w: vp.width, h: vp.height });
      }

      setProgress(96);
      setResultPages(results);
      setResultInfo({ pages: results.length, format: imgFormat.toUpperCase(), scale: `${imgScale}x` });
      setProgress(100);

      if (user) logToolUsage({ userId: user.uid, tool: "pdf-to-image", pageCount: results.length, totalSizeKB: pdfSizeKB });
    } catch (err) {
      console.error(err);
      alert("Conversion failed: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  /* ── download single image ── */
  const downloadImg = (dataUrl, pageNum) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${pdfName}-page-${pageNum}.${imgFormat === "jpg" ? "jpg" : imgFormat}`;
    a.click();
  };

  /* ── download all as ZIP (JSZip) ── */
  const downloadAllZip = async () => {
    if (!resultPages.length) return;
    try {
      const JSZip = (await import("jszip")).default;
      const zip   = new JSZip();
      resultPages.forEach(({ dataUrl, pageNum }) => {
        const base64 = dataUrl.split(",")[1];
        zip.file(`${pdfName}-page-${pageNum}.${imgFormat === "jpg" ? "jpg" : imgFormat}`, base64, { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${pdfName}-images.zip`;
      a.click();
    } catch (e) {
      // fallback: download one by one
      resultPages.forEach(({ dataUrl, pageNum }) => downloadImg(dataUrl, pageNum));
    }
  };

  const resetAll = () => {
    setPdfFile(null); setPdfName(""); setPageCount(0); setPdfSizeKB(0);
    setResultUrl(null); setResultPages([]); setResultInfo(null); setProgress(0);
  };

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <span>📋</span>
          <span>PDF Tools</span>
        </div>
        {pdfFile && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>📄 {pdfName}.pdf</span>
            {pageCount > 0 && <span className={styles.statChip}>{pageCount} pages</span>}
            <span className={styles.statChip}>{pdfSizeKB} KB</span>
            <button className={styles.clearBtn} onClick={resetAll}>✕ Clear</button>
          </div>
        )}
      </div>

      <div className={styles.layout}>

        {/* ── LEFT: UPLOAD + PREVIEW ── */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>PDF File</span>
          </div>

          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${isDrag ? styles.dropActive : ""} ${pdfFile ? styles.dropHasFile : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
            onDragLeave={() => setIsDrag(false)}
            onDrop={(e) => { e.preventDefault(); setIsDrag(false); loadPdf(e.dataTransfer.files?.[0]); }}
            onClick={() => !pdfFile && fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="application/pdf" hidden
              onChange={(e) => loadPdf(e.target.files?.[0])} />

            {!pdfFile ? (
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>📋</div>
                <p className={styles.dropText}>Drop PDF here</p>
                <span className={styles.dropSub}>or click to browse</span>
                <span className={styles.dropFormats}>PDF files only</span>
              </div>
            ) : (
              <div className={styles.pdfCard}>
                <div className={styles.pdfCardIcon}>📄</div>
                <div className={styles.pdfCardInfo}>
                  <div className={styles.pdfCardName}>{pdfName}.pdf</div>
                  <div className={styles.pdfCardMeta}>
                    {pageCount > 0 && <span>{pageCount} pages</span>}
                    <span>{pdfSizeKB} KB</span>
                  </div>
                </div>
                <button className={styles.changePdfBtn} onClick={(e) => { e.stopPropagation(); resetAll(); }}
                  title="Remove">✕</button>
              </div>
            )}
          </div>

          {/* PDF not loaded note */}
          {!pdfReady && (
            <p className={styles.loadingNote}>⏳ Loading PDF engine…</p>
          )}

          {/* Result for RESIZE */}
          {tab === "resize" && resultInfo && (
            <div className={styles.resultBox}>
              <div className={styles.resultLeft}>
                <span className={styles.resultIcon}>✅</span>
                <div>
                  <div className={styles.resultName}>{resultInfo.name}</div>
                  <div className={styles.resultMeta}>
                    {resultInfo.pages} pages · {resultInfo.size} MB · {resultInfo.dims}
                  </div>
                </div>
              </div>
              <button className={styles.downloadBtn} onClick={downloadResized}>↓ Download</button>
            </div>
          )}

          {/* Result for TO-IMAGE */}
          {tab === "toimg" && resultInfo && (
            <div className={styles.resultBox}>
              <div className={styles.resultLeft}>
                <span className={styles.resultIcon}>🖼</span>
                <div>
                  <div className={styles.resultName}>{resultInfo.pages} images exported</div>
                  <div className={styles.resultMeta}>{resultInfo.format} · {resultInfo.scale} scale</div>
                </div>
              </div>
              <button className={styles.downloadBtn} onClick={downloadAllZip}>↓ ZIP All</button>
            </div>
          )}

          {/* Image preview grid */}
          {tab === "toimg" && resultPages.length > 0 && (
            <div className={styles.imgPreviewGrid}>
              {resultPages.map(({ dataUrl, pageNum, w, h }) => (
                <div key={pageNum} className={styles.imgPreviewCard}>
                  <img src={dataUrl} alt={`Page ${pageNum}`} className={styles.imgPreviewThumb} />
                  <div className={styles.imgPreviewInfo}>
                    <span>Pg {pageNum}</span>
                    <span>{w}×{h}</span>
                    <button className={styles.imgDlBtn} onClick={() => downloadImg(dataUrl, pageNum)}>↓</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── RIGHT: TABS + SETTINGS ── */}
        <div className={styles.rightPanel}>

          {/* Tab bar */}
          <div className={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ""}`}
                onClick={() => { setTab(t.id); setResultUrl(null); setResultPages([]); setResultInfo(null); }}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* ── RESIZE SETTINGS ── */}
          {tab === "resize" && (
            <div className={styles.settingsPanel}>
              <h2 className={styles.sectionTitle}>⤢ Resize PDF Pages</h2>
              <p className={styles.sectionDesc}>Re-render every page at a new paper size.</p>

              {/* Output name */}
              <div className={styles.field}>
                <label>Output File Name</label>
                <div className={styles.nameRow}>
                  <input className={styles.textInput} type="text" value={outName}
                    onChange={(e) => setOutName(e.target.value)} placeholder="resized" />
                  <span className={styles.nameSuffix}>.pdf</span>
                </div>
              </div>

              {/* Target size */}
              <div className={styles.field}>
                <label>Target Page Size</label>
                <div className={styles.chipGroup}>
                  {Object.keys(PAGE_SIZES_MM).map((s) => (
                    <button key={s}
                      className={`${styles.chip} ${targetSize === s ? styles.chipActive : ""}`}
                      onClick={() => setTargetSize(s)}>
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom dims */}
              {targetSize === "custom" && (
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>Width (pt)</label>
                    <input className={styles.textInput} type="number" value={customW}
                      onChange={(e) => setCustomW(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>Height (pt)</label>
                    <input className={styles.textInput} type="number" value={customH}
                      onChange={(e) => setCustomH(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Orientation */}
              {targetSize !== "custom" && (
                <div className={styles.field}>
                  <label>Orientation</label>
                  <div className={styles.chipGroup}>
                    {[["portrait","↕ Portrait"],["landscape","↔ Landscape"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${orientation === v ? styles.chipActive : ""}`}
                        onClick={() => setOrientation(v)}>{l}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Fit mode */}
              <div className={styles.field}>
                <label>Content Fit</label>
                <div className={styles.chipGroup}>
                  {[["fit","Fit (letterbox)"],["stretch","Stretch to fill"],["crop","Crop to fill"]].map(([v,l]) => (
                    <button key={v} className={`${styles.chip} ${fitMode === v ? styles.chipActive : ""}`}
                      onClick={() => setFitMode(v)}>{l}</button>
                  ))}
                </div>
                <p className={styles.hint}>
                  {fitMode === "fit"     && "Page content scaled down to fit, white margins added."}
                  {fitMode === "stretch" && "Content stretched to fill entire page (may distort)."}
                  {fitMode === "crop"    && "Content scaled up to fill, edges may be clipped."}
                </p>
              </div>

              {/* Action */}
              <button
                className={`${styles.actionBtn} ${processing ? styles.busy : ""}`}
                onClick={doResize}
                disabled={processing || !pdfFile || !pdfReady}
              >
                {processing ? <><span className={styles.spinner} /> Resizing… {progress}%</> : <>⤢ Resize PDF</>}
              </button>

              {processing && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* ── TO-IMAGE SETTINGS ── */}
          {tab === "toimg" && (
            <div className={styles.settingsPanel}>
              <h2 className={styles.sectionTitle}>🖼 PDF to Image</h2>
              <p className={styles.sectionDesc}>Convert each PDF page to a high-quality image.</p>

              {/* Format */}
              <div className={styles.field}>
                <label>Output Format</label>
                <div className={styles.chipGroup}>
                  {["png","jpg","webp"].map((f) => (
                    <button key={f} className={`${styles.chip} ${imgFormat === f ? styles.chipActive : ""}`}
                      onClick={() => setImgFormat(f)}>{f.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {/* Resolution / scale */}
              <div className={styles.field}>
                <label>Resolution — <strong className={styles.valLabel}>{imgScale}× ({Math.round(72 * imgScale)} DPI)</strong></label>
                <input type="range" min="1" max="4" step="0.5" value={imgScale}
                  onChange={(e) => setImgScale(+e.target.value)} className={styles.slider} />
                <div className={styles.sliderLabels}>
                  <span>72 DPI (screen)</span>
                  <span>288 DPI (print)</span>
                </div>
              </div>

              {/* Page range */}
              <div className={styles.field}>
                <label>Pages to Export</label>
                <div className={styles.chipGroup}>
                  {[["all","All Pages"],["custom","Custom Range"]].map(([v,l]) => (
                    <button key={v} className={`${styles.chip} ${pageRange === v ? styles.chipActive : ""}`}
                      onClick={() => setPageRange(v)}>{l}</button>
                  ))}
                </div>
                {pageRange === "custom" && (
                  <input className={styles.textInput} type="text" value={customPages}
                    onChange={(e) => setCustomPages(e.target.value)}
                    placeholder={`e.g. 1,3,5-8  (max ${pageCount || "?"} pages)`} />
                )}
              </div>

              {/* Info about ZIP */}
              <div className={styles.infoBox}>
                <span>📦</span>
                <span>All images will be bundled as a <strong>.zip</strong> file. Individual download also available per page.</span>
              </div>

              {/* Action */}
              <button
                className={`${styles.actionBtn} ${processing ? styles.busy : ""}`}
                onClick={doToImage}
                disabled={processing || !pdfFile || !pdfReady}
              >
                {processing
                  ? <><span className={styles.spinner} /> Converting… {progress}%</>
                  : <>🖼 Convert to Images {pageCount > 0 ? `(${pageRange === "all" ? pageCount : "custom"} pages)` : ""}</>}
              </button>

              {processing && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}