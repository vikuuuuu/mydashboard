// File: app/dashboard/pdftool/page.js
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "../common/toolLayout.module.css";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const WORKER    = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function usePdfJs() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.pdfjsLib) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = PDFJS_CDN;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; setReady(true); };
    document.head.appendChild(s);
  }, []);
  return ready;
}

const TABS = [
  { id: "resize",   icon: "⤢", label: "PDF Resize"   },
  { id: "toimg",    icon: "🖼", label: "PDF → Image"  },
  { id: "wordtopdf",icon: "📝", label: "Word → PDF"   },
];

const PAGE_SIZES_PT = {
  a4:     [595.28, 841.89],
  a3:     [841.89, 1190.55],
  letter: [612, 792],
  legal:  [612, 1008],
  custom: null,
};

export default function PdfToolsPage() {
  const router   = useRouter();
  const user     = getCurrentUser();
  const pdfReady = usePdfJs();
  const fileRef  = useRef();
  const wordRef  = useRef();

  const [tab,         setTab        ] = useState("resize");
  const [pdfFile,     setPdfFile    ] = useState(null);
  const [pdfName,     setPdfName    ] = useState("");
  const [pageCount,   setPageCount  ] = useState(0);
  const [pdfSizeKB,   setPdfSizeKB  ] = useState(0);
  const [isDrag,      setIsDrag     ] = useState(false);
  const [processing,  setProcessing ] = useState(false);
  const [progress,    setProgress   ] = useState(0);

  // resize
  const [resultUrl,   setResultUrl  ] = useState(null);
  const [resultInfo,  setResultInfo ] = useState(null);
  const [targetSize,  setTargetSize ] = useState("a4");
  const [orientation, setOrientation] = useState("portrait");
  const [customW,     setCustomW    ] = useState("595");
  const [customH,     setCustomH    ] = useState("842");
  const [fitMode,     setFitMode    ] = useState("fit");
  const [outName,     setOutName    ] = useState("resized");

  // to image
  const [resultPages, setResultPages] = useState([]);
  const [imgFormat,   setImgFormat  ] = useState("png");
  const [imgScale,    setImgScale   ] = useState(2);
  const [pageRange,   setPageRange  ] = useState("all");
  const [customPages, setCustomPages] = useState("");

  // word to pdf
  const [wordFile,    setWordFile   ] = useState(null);
  const [wordName,    setWordName   ] = useState("");
  const [wordResult,  setWordResult ] = useState(null);
  const [wordDrag,    setWordDrag   ] = useState(false);

  const loadPdf = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfName(file.name.replace(".pdf", ""));
    setOutName(file.name.replace(".pdf", "") + "-resized");
    setPdfSizeKB(Math.round(file.size / 1024));
    setResultUrl(null); setResultPages([]); setResultInfo(null);
    if (pdfReady) {
      const buf = await file.arrayBuffer();
      const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
      setPageCount(doc.numPages);
    }
  };

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

  /* ── PDF RESIZE ── */
  const doResize = async () => {
    if (!pdfFile || !pdfReady) return;
    setProcessing(true); setProgress(0);
    try {
      const { jsPDF } = await import("jspdf");
      const buf = await pdfFile.arrayBuffer();
      const src = await window.pdfjsLib.getDocument({ data: buf }).promise;

      let [tw, th] = PAGE_SIZES_PT[targetSize] || [Number(customW), Number(customH)];
      if (targetSize !== "custom" && orientation === "landscape") [tw, th] = [th, tw];

      const pdf = new jsPDF({ orientation, unit: "pt", format: [tw, th] });

      for (let i = 1; i <= src.numPages; i++) {
        setProgress(Math.round(((i - 1) / src.numPages) * 90));
        const page = await src.getPage(i);
        const vp   = page.getViewport({ scale: 1 });
        let scale;
        if (fitMode === "fit") scale = Math.min(tw / vp.width, th / vp.height);
        else scale = Math.max(tw / vp.width, th / vp.height);

        const vp2    = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp2.width); canvas.height = Math.round(vp2.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      setResultUrl(URL.createObjectURL(blob));
      setResultInfo({ name: `${outName || "resized"}.pdf`, pages: src.numPages, size: (blob.size/1024/1024).toFixed(2), dims: `${Math.round(tw)} × ${Math.round(th)} pt` });
      setProgress(100);
      if (user) logToolUsage({ userId: user.uid, tool: "pdf-resize", pageCount: src.numPages, totalSizeKB: Math.round(blob.size/1024) });
    } catch (err) { console.error(err); alert("Resize failed: " + err.message); }
    finally { setProcessing(false); }
  };

  /* ── PDF TO IMAGE ── */
  const doToImage = async () => {
    if (!pdfFile || !pdfReady) return;
    setProcessing(true); setProgress(0); setResultPages([]);
    try {
      const buf  = await pdfFile.arrayBuffer();
      const src  = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const pages = pageRange === "all"
        ? Array.from({ length: src.numPages }, (_, i) => i + 1)
        : parsePages(customPages, src.numPages);

      if (!pages.length) { alert("No valid pages."); setProcessing(false); return; }

      const results = [];
      for (let idx = 0; idx < pages.length; idx++) {
        setProgress(Math.round((idx / pages.length) * 90));
        const page   = await src.getPage(pages[idx]);
        const vp     = page.getViewport({ scale: imgScale });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx    = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const mime   = imgFormat === "jpg" ? "image/jpeg" : `image/${imgFormat}`;
        results.push({ dataUrl: canvas.toDataURL(mime, 0.92), pageNum: pages[idx], w: vp.width, h: vp.height });
      }

      setResultPages(results);
      setResultInfo({ pages: results.length, format: imgFormat.toUpperCase(), scale: `${imgScale}x` });
      setProgress(100);
      if (user) logToolUsage({ userId: user.uid, tool: "pdf-to-image", pageCount: results.length, totalSizeKB: pdfSizeKB });
    } catch (err) { console.error(err); alert("Conversion failed: " + err.message); }
    finally { setProcessing(false); }
  };

  const downloadImg = (dataUrl, pageNum) => {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${pdfName}-page-${pageNum}.${imgFormat === "jpg" ? "jpg" : imgFormat}`; a.click();
  };

  const downloadAllZip = async () => {
    if (!resultPages.length) return;
    try {
      const JSZip = (await import("jszip")).default;
      const zip   = new JSZip();
      resultPages.forEach(({ dataUrl, pageNum }) => {
        zip.file(`${pdfName}-page-${pageNum}.${imgFormat === "jpg" ? "jpg" : imgFormat}`, dataUrl.split(",")[1], { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${pdfName}-images.zip`; a.click();
    } catch { resultPages.forEach(({ dataUrl, pageNum }) => downloadImg(dataUrl, pageNum)); }
  };

  /* ── WORD TO PDF ── */
  const loadWord = async (file) => {
    if (!file) return;
    const isDoc  = file.name.endsWith(".doc") || file.name.endsWith(".docx");
    const isTxt  = file.name.endsWith(".txt");
    const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
    if (!isDoc && !isTxt && !isHtml) { alert("Please upload a .docx, .doc, .txt or .html file"); return; }
    setWordFile(file);
    setWordName(file.name.replace(/\.[^.]+$/, ""));
    setWordResult(null);
  };

  const doWordToPdf = async () => {
    if (!wordFile) return;
    setProcessing(true);
    try {
      const { jsPDF } = await import("jspdf");
      let htmlContent = "";

      if (wordFile.name.endsWith(".txt")) {
        const text = await wordFile.text();
        htmlContent = `<pre style="font-family:sans-serif;white-space:pre-wrap;font-size:12px">${text}</pre>`;
      } else if (wordFile.name.endsWith(".html") || wordFile.name.endsWith(".htm")) {
        htmlContent = await wordFile.text();
      } else {
        // .doc / .docx — use mammoth
        const mammoth = await import("mammoth");
        const buf     = await wordFile.arrayBuffer();
        const result  = await mammoth.convertToHtml({ arrayBuffer: buf });
        htmlContent   = result.value;
      }

      // Render HTML to canvas via iframe trick
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;";
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(`
        <!DOCTYPE html><html><head>
        <style>body{margin:30px;font-family:Arial,sans-serif;font-size:12px;color:#111;line-height:1.6}
        h1,h2,h3{color:#1a2147}table{border-collapse:collapse;width:100%}
        td,th{border:1px solid #ccc;padding:4px 8px}pre{white-space:pre-wrap}</style>
        </head><body>${htmlContent}</body></html>`);
      iframe.contentDocument.close();

      await new Promise(r => setTimeout(r, 600));

      // Use html2canvas if available, else simple jsPDF text render
      const pdf   = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(iframe.contentDocument.body, {
          scale: 2, useCORS: true, width: 794,
        });
        document.body.removeChild(iframe);

        const imgData  = canvas.toDataURL("image/jpeg", 0.9);
        const imgH     = (canvas.height * pageW) / canvas.width;
        let yOffset    = 0;
        let remaining  = imgH;

        while (remaining > 0) {
          if (yOffset > 0) pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, -yOffset, pageW, imgH);
          yOffset   += pageH;
          remaining -= pageH;
        }
      } catch {
        // html2canvas not available — plain text fallback
        document.body.removeChild(iframe);
        const text = wordFile.name.endsWith(".txt") ? await wordFile.text() : htmlContent.replace(/<[^>]*>/g, " ");
        pdf.setFontSize(11);
        const lines = pdf.splitTextToSize(text, pageW - 20);
        let y = 15;
        lines.forEach(line => {
          if (y > pageH - 15) { pdf.addPage(); y = 15; }
          pdf.text(line, 10, y);
          y += 6;
        });
      }

      const blob = pdf.output("blob");
      setWordResult({ url: URL.createObjectURL(blob), name: `${wordName || "document"}.pdf`, size: (blob.size/1024/1024).toFixed(2) });
      if (user) logToolUsage({ userId: user.uid, tool: "word-to-pdf", totalSizeKB: Math.round(blob.size/1024) });
    } catch (err) { console.error(err); alert("Conversion failed: " + err.message); }
    finally { setProcessing(false); }
  };

  const resetAll = () => {
    setPdfFile(null); setPdfName(""); setPageCount(0); setPdfSizeKB(0);
    setResultUrl(null); setResultPages([]); setResultInfo(null); setProgress(0);
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>📋</div>
          <span>PDF Tools</span>
        </div>
        {pdfFile && tab !== "wordtopdf" && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>📄 {pdfName}.pdf</span>
            {pageCount > 0 && <span className={styles.statChip}>{pageCount} pages</span>}
            <span className={styles.statChip}>{pdfSizeKB} KB</span>
            <button className={styles.clearBtn} onClick={resetAll}>✕ Clear</button>
          </div>
        )}
      </div>

      <div className={styles.layoutTwo}>
        {/* LEFT */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>{tab === "wordtopdf" ? "Word File" : "PDF File"}</span>
          </div>

          {/* Word to PDF upload */}
          {tab === "wordtopdf" ? (
            <>
              <div
                className={`${styles.dropZone} ${wordDrag ? styles.dropActive : ""} ${wordFile ? styles.dropHasFile : ""}`}
                onDragOver={(e) => { e.preventDefault(); setWordDrag(true); }}
                onDragLeave={() => setWordDrag(false)}
                onDrop={(e) => { e.preventDefault(); setWordDrag(false); loadWord(e.dataTransfer.files?.[0]); }}
                onClick={() => !wordFile && wordRef.current?.click()}
              >
                <input ref={wordRef} type="file" accept=".doc,.docx,.txt,.html,.htm" hidden onChange={(e) => loadWord(e.target.files?.[0])} />
                {!wordFile ? (
                  <div className={styles.dropContent}>
                    <div className={styles.dropEmoji}>📝</div>
                    <p className={styles.dropText}>Drop Word file here</p>
                    <span className={styles.dropSub}>or click to browse</span>
                    <span className={styles.dropFormats}>DOCX · DOC · TXT · HTML</span>
                  </div>
                ) : (
                  <div className={styles.pdfCard}>
                    <div className={styles.pdfCardIcon}>📝</div>
                    <div className={styles.pdfCardInfo}>
                      <div className={styles.pdfCardName}>{wordFile.name}</div>
                      <div className={styles.pdfCardMeta}><span>{(wordFile.size/1024).toFixed(1)} KB</span></div>
                    </div>
                    <button className={styles.changePdfBtn} onClick={() => { setWordFile(null); setWordName(""); setWordResult(null); }}>✕</button>
                  </div>
                )}
              </div>

              {wordResult && (
                <div className={styles.resultBox}>
                  <div className={styles.resultLeft}>
                    <div className={styles.resultIcon}>✅</div>
                    <div>
                      <div className={styles.resultName}>{wordResult.name}</div>
                      <div className={styles.resultMeta}>{wordResult.size} MB</div>
                    </div>
                  </div>
                  <a href={wordResult.url} download={wordResult.name} className={styles.downloadBtn}>↓ Download</a>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className={`${styles.dropZone} ${isDrag ? styles.dropActive : ""} ${pdfFile ? styles.dropHasFile : ""}`}
                onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={(e) => { e.preventDefault(); setIsDrag(false); loadPdf(e.dataTransfer.files?.[0]); }}
                onClick={() => !pdfFile && fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => loadPdf(e.target.files?.[0])} />
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
                    <button className={styles.changePdfBtn} onClick={resetAll}>✕</button>
                  </div>
                )}
              </div>

              {!pdfReady && <p className={styles.loadingNote}>⏳ Loading PDF engine…</p>}

              {/* Resize result */}
              {tab === "resize" && resultInfo && (
                <div className={styles.resultBox}>
                  <div className={styles.resultLeft}>
                    <span className={styles.resultIcon}>✅</span>
                    <div>
                      <div className={styles.resultName}>{resultInfo.name}</div>
                      <div className={styles.resultMeta}>{resultInfo.pages} pages · {resultInfo.size} MB · {resultInfo.dims}</div>
                    </div>
                  </div>
                  <a href={resultUrl} download={resultInfo.name} className={styles.downloadBtn}>↓ Download</a>
                </div>
              )}

              {/* To-image result */}
              {tab === "toimg" && resultInfo && (
                <div className={styles.resultBox}>
                  <div className={styles.resultLeft}>
                    <span className={styles.resultIcon}>🖼</span>
                    <div>
                      <div className={styles.resultName}>{resultInfo.pages} images exported</div>
                      <div className={styles.resultMeta}>{resultInfo.format} · {resultInfo.scale}</div>
                    </div>
                  </div>
                  <button className={styles.downloadBtn} onClick={downloadAllZip}>↓ ZIP All</button>
                </div>
              )}

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
            </>
          )}
        </aside>

        {/* RIGHT: Tabs + Settings */}
        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div className={styles.tabBar}>
            {TABS.map((t) => (
              <button key={t.id} className={`${styles.tabBtn} ${tab===t.id?styles.tabActive:""}`}
                onClick={() => { setTab(t.id); setResultUrl(null); setResultPages([]); setResultInfo(null); }}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          <div className={styles.settingsPanel}>
            <div className={styles.section}>

              {/* PDF RESIZE */}
              {tab === "resize" && <>
                <h2 className={styles.sectionTitle}>⤢ Resize PDF Pages</h2>
                <p className={styles.sectionDesc}>Re-render every page at a new paper size.</p>

                <div className={styles.field}>
                  <label>Output File Name</label>
                  <div className={styles.nameRow}>
                    <input className={styles.textInput} type="text" value={outName} onChange={(e) => setOutName(e.target.value)} placeholder="resized" />
                    <span className={styles.nameSuffix}>.pdf</span>
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Target Page Size</label>
                  <div className={styles.chipGroup}>
                    {Object.keys(PAGE_SIZES_PT).map((s) => (
                      <button key={s} className={`${styles.chip} ${targetSize===s?styles.chipActive:""}`} onClick={() => setTargetSize(s)}>{s.toUpperCase()}</button>
                    ))}
                  </div>
                </div>

                {targetSize === "custom" && (
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}><label>Width (pt)</label><input className={styles.textInput} type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} /></div>
                    <div className={styles.field}><label>Height (pt)</label><input className={styles.textInput} type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} /></div>
                  </div>
                )}

                {targetSize !== "custom" && (
                  <div className={styles.field}>
                    <label>Orientation</label>
                    <div className={styles.chipGroup}>
                      {[["portrait","↕ Portrait"],["landscape","↔ Landscape"]].map(([v,l]) => (
                        <button key={v} className={`${styles.chip} ${orientation===v?styles.chipActive:""}`} onClick={() => setOrientation(v)}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.field}>
                  <label>Content Fit</label>
                  <div className={styles.chipGroup}>
                    {[["fit","Fit (letterbox)"],["stretch","Stretch"],["crop","Crop to fill"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${fitMode===v?styles.chipActive:""}`} onClick={() => setFitMode(v)}>{l}</button>
                    ))}
                  </div>
                  <p className={styles.hint}>
                    {fitMode==="fit"&&"Scaled to fit inside page, white margins added."}
                    {fitMode==="stretch"&&"Stretched to fill entire page (may distort)."}
                    {fitMode==="crop"&&"Scaled up to fill, edges may be clipped."}
                  </p>
                </div>

                <button className={`${styles.actionBtn} ${processing?styles.actionBusy:""}`} onClick={doResize} disabled={processing||!pdfFile||!pdfReady}>
                  {processing ? <><span className={styles.spinner} /> Resizing… {progress}%</> : <>⤢ Resize PDF</>}
                </button>
                {processing && <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width:`${progress}%` }} /></div>}
              </>}

              {/* PDF TO IMAGE */}
              {tab === "toimg" && <>
                <h2 className={styles.sectionTitle}>🖼 PDF → Image</h2>
                <p className={styles.sectionDesc}>Convert each page to a high-quality image file.</p>

                <div className={styles.field}>
                  <label>Format</label>
                  <div className={styles.chipGroup}>
                    {["png","jpg","webp"].map((f) => (
                      <button key={f} className={`${styles.chip} ${imgFormat===f?styles.chipActive:""}`} onClick={() => setImgFormat(f)}>{f.toUpperCase()}</button>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Resolution — <strong className={styles.valLabel}>{imgScale}× ({Math.round(72*imgScale)} DPI)</strong></label>
                  <input type="range" min="1" max="4" step="0.5" value={imgScale} onChange={(e) => setImgScale(+e.target.value)} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>72 DPI (screen)</span><span>288 DPI (print)</span></div>
                </div>

                <div className={styles.field}>
                  <label>Pages</label>
                  <div className={styles.chipGroup}>
                    {[["all","All Pages"],["custom","Custom Range"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${pageRange===v?styles.chipActive:""}`} onClick={() => setPageRange(v)}>{l}</button>
                    ))}
                  </div>
                  {pageRange === "custom" && (
                    <input className={styles.textInput} type="text" value={customPages} onChange={(e) => setCustomPages(e.target.value)}
                      placeholder={`e.g. 1,3,5-8  (max ${pageCount||"?"} pages)`} />
                  )}
                </div>

                <div className={styles.infoBox}>
                  <span>📦</span>
                  <span>All images bundled as <strong>.zip</strong>. Individual download also available.</span>
                </div>

                <button className={`${styles.actionBtn} ${processing?styles.actionBusy:""}`} onClick={doToImage} disabled={processing||!pdfFile||!pdfReady}>
                  {processing ? <><span className={styles.spinner} /> Converting… {progress}%</> : <>🖼 Convert to Images {pageCount>0?`(${pageRange==="all"?pageCount:"custom"} pages)`:""}</>}
                </button>
                {processing && <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width:`${progress}%` }} /></div>}
              </>}

              {/* WORD TO PDF */}
              {tab === "wordtopdf" && <>
                <h2 className={styles.sectionTitle}>📝 Word → PDF</h2>
                <p className={styles.sectionDesc}>Convert DOCX, DOC, TXT, or HTML to PDF.</p>

                <div className={styles.infoBox}>
                  <span>ℹ️</span>
                  <div>
                    <strong>Supported:</strong> .docx, .doc (via Mammoth.js) · .txt · .html
                    <br /><span style={{fontSize:"11px",color:"var(--text3)"}}>Note: Complex formatting may vary. Install <code>mammoth</code> for best DOCX support.</span>
                  </div>
                </div>

                <button className={`${styles.actionBtn} ${processing?styles.actionBusy:""}`} onClick={doWordToPdf} disabled={processing||!wordFile}>
                  {processing ? <><span className={styles.spinner} /> Converting…</> : <>📄 Convert to PDF</>}
                </button>
              </>}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}