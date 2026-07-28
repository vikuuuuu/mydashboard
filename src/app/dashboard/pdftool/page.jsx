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
  { id: "resize",     icon: "⤢", label: "PDF Resize"    },
  { id: "toimg",      icon: "🖼", label: "Export"         },
  { id: "editpages",  icon: "🗂", label: "Edit Pages"     },
  { id: "imgresize",  icon: "🖌", label: "Image Resize"   },
  { id: "wordtopdf",  icon: "📝", label: "Word → PDF"     },
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
  const mergeFileRef = useRef();
  const imgFileRef   = useRef();
  const dragIdx  = useRef(null);

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

  // export: to image / to text
  const [resultPages, setResultPages] = useState([]);
  const [resultText,  setResultText ] = useState(null); // { fullText, pages:[{pageNum,text}] }
  const [imgFormat,   setImgFormat  ] = useState("png"); // png | jpg | webp | txt
  const [imgScale,    setImgScale   ] = useState(2);
  const [pageRange,   setPageRange  ] = useState("all");
  const [customPages, setCustomPages] = useState("");

  // word to pdf
  const [wordFile,    setWordFile   ] = useState(null);
  const [wordName,    setWordName   ] = useState("");
  const [wordResult,  setWordResult ] = useState(null);
  const [wordDrag,    setWordDrag   ] = useState(false);

  // edit pages
  const [pageItems,   setPageItems  ] = useState([]); // {uid, kind:'page'|'blank', srcKey, srcPageIndex, thumb, w, h}
  const [editBusy,    setEditBusy   ] = useState(false);
  const [editOutName, setEditOutName] = useState("edited");
  const [editResult,  setEditResult ] = useState(null);
  const [mergeFile,   setMergeFile  ] = useState(null);
  const [mergeName,   setMergeName  ] = useState("");
  const [mergeBusy,   setMergeBusy  ] = useState(false);

  // image resize
  const [imgItems,      setImgItems     ] = useState([]); // {uid,name,srcUrl,origW,origH}
  const [imgDrag2,      setImgDrag2     ] = useState(false);
  const [imgResizeMode, setImgResizeMode] = useState("percent"); // percent | exact | maxdim
  const [imgPercent,    setImgPercent   ] = useState(50);
  const [imgWidth,      setImgWidth     ] = useState(800);
  const [imgHeight,     setImgHeight    ] = useState(600);
  const [imgLockAspect, setImgLockAspect] = useState(true);
  const [imgMaxDim,     setImgMaxDim    ] = useState(1024);
  const [imgOutFormat,  setImgOutFormat ] = useState("jpg");
  const [imgQuality,    setImgQuality   ] = useState(0.85);
  const [imgNoUpscale,  setImgNoUpscale ] = useState(true);
  const [imgBusy,       setImgBusy      ] = useState(false);
  const [imgResults,    setImgResults   ] = useState([]);

  const loadPdf = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfName(file.name.replace(".pdf", ""));
    setOutName(file.name.replace(".pdf", "") + "-resized");
    setEditOutName(file.name.replace(".pdf", "") + "-edited");
    setPdfSizeKB(Math.round(file.size / 1024));
    setResultUrl(null); setResultPages([]); setResultInfo(null); setResultText(null);
    setPageItems([]); setEditResult(null); setMergeFile(null); setMergeName("");
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

  /* ── EXPORT: PDF → IMAGE / TEXT ── */
  const doExport = async () => {
    if (!pdfFile || !pdfReady) return;
    setProcessing(true); setProgress(0); setResultPages([]); setResultText(null);
    try {
      const buf  = await pdfFile.arrayBuffer();
      const src  = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const pages = pageRange === "all"
        ? Array.from({ length: src.numPages }, (_, i) => i + 1)
        : parsePages(customPages, src.numPages);

      if (!pages.length) { alert("No valid pages."); setProcessing(false); return; }

      if (imgFormat === "txt") {
        const textPages = [];
        for (let idx = 0; idx < pages.length; idx++) {
          setProgress(Math.round((idx / pages.length) * 95));
          const page    = await src.getPage(pages[idx]);
          const content = await page.getTextContent();
          const text    = content.items.map((it) => it.str).join(" ");
          textPages.push({ pageNum: pages[idx], text });
        }
        const fullText = textPages.map((p) => `--- Page ${p.pageNum} ---\n${p.text}`).join("\n\n");
        setResultText({ fullText, pages: textPages });
        setResultInfo({ pages: textPages.length, format: "TXT" });
        setProgress(100);
        if (user) logToolUsage({ userId: user.uid, tool: "pdf-to-text", pageCount: textPages.length, totalSizeKB: pdfSizeKB });
        return;
      }

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
    } catch (err) { console.error(err); alert("Export failed: " + err.message); }
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

  const downloadText = () => {
    if (!resultText) return;
    const blob = new Blob([resultText.fullText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${pdfName}-extracted.txt`; a.click();
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

  /* ── EDIT PAGES: reorder / delete / insert blank / merge ── */
  const genPageThumbs = async (file, srcKey) => {
    const buf = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const items = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp   = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      items.push({
        uid: `${srcKey}-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "page",
        srcKey,
        srcPageIndex: i - 1,
        thumb: canvas.toDataURL("image/jpeg", 0.7),
        w: vp.width / 0.35,
        h: vp.height / 0.35,
      });
    }
    return items;
  };

  useEffect(() => {
    if (tab === "editpages" && pdfFile && pdfReady && pageItems.length === 0 && !editBusy) {
      (async () => {
        setEditBusy(true);
        try {
          const items = await genPageThumbs(pdfFile, "main");
          setPageItems(items);
        } catch (err) { console.error(err); }
        finally { setEditBusy(false); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pdfFile, pdfReady]);

  const handleDragStart = (idx) => { dragIdx.current = idx; };
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop = (idx) => {
    const from = dragIdx.current;
    if (from === null || from === undefined || from === idx) return;
    setPageItems((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    dragIdx.current = null;
  };

  const removePageItem = (uid) => setPageItems((prev) => prev.filter((p) => p.uid !== uid));

  const insertBlankPage = () => {
    const ref = pageItems.find((p) => p.kind === "page");
    const w = ref?.w || 595.28;
    const h = ref?.h || 841.89;
    const blank = { uid: `blank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: "blank", width: w, height: h };
    setPageItems((prev) => [...prev, blank]);
  };

  const loadMergeFile = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setMergeBusy(true);
    try {
      setMergeFile(file);
      setMergeName(file.name.replace(".pdf", ""));
      const items = await genPageThumbs(file, "merge");
      setPageItems((prev) => [...prev, ...items]);
    } catch (err) { console.error(err); alert("Couldn't read that PDF: " + err.message); }
    finally { setMergeBusy(false); }
  };

  const doEditApply = async () => {
    if (!pdfFile || pageItems.length === 0) return;
    setEditBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const outDoc  = await PDFDocument.create();
      const mainSrc = await PDFDocument.load(await pdfFile.arrayBuffer());
      const mergeSrc = mergeFile ? await PDFDocument.load(await mergeFile.arrayBuffer()) : null;

      for (const item of pageItems) {
        if (item.kind === "blank") {
          outDoc.addPage([item.width, item.height]);
        } else {
          const srcDoc = item.srcKey === "main" ? mainSrc : mergeSrc;
          if (!srcDoc) continue;
          const [copied] = await outDoc.copyPages(srcDoc, [item.srcPageIndex]);
          outDoc.addPage(copied);
        }
      }

      const bytes = await outDoc.save();
      const blob  = new Blob([bytes], { type: "application/pdf" });
      setEditResult({ url: URL.createObjectURL(blob), name: `${editOutName || "edited"}.pdf`, pages: pageItems.length, size: (blob.size/1024/1024).toFixed(2) });
      if (user) logToolUsage({ userId: user.uid, tool: "pdf-edit-pages", pageCount: pageItems.length, totalSizeKB: Math.round(blob.size/1024) });
    } catch (err) {
      console.error(err);
      alert("Edit failed: " + err.message + "\n\nMake sure the 'pdf-lib' package is installed (npm i pdf-lib).");
    } finally { setEditBusy(false); }
  };

  /* ── IMAGE RESIZE ── */
  const loadImages = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    files.forEach((file) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImgItems((prev) => [...prev, { uid, name: file.name.replace(/\.[^.]+$/, ""), srcUrl: url, origW: img.width, origH: img.height }]);
      };
      img.src = url;
    });
  };

  const removeImgItem = (uid) => setImgItems((prev) => prev.filter((i) => i.uid !== uid));

  const computeDims = (origW, origH) => {
    if (imgResizeMode === "percent") {
      const f = imgPercent / 100;
      return { w: Math.max(1, Math.round(origW * f)), h: Math.max(1, Math.round(origH * f)) };
    }
    if (imgResizeMode === "maxdim") {
      const max = Math.max(origW, origH);
      if (imgNoUpscale && max <= imgMaxDim) return { w: origW, h: origH };
      const scale = imgMaxDim / max;
      return { w: Math.max(1, Math.round(origW * scale)), h: Math.max(1, Math.round(origH * scale)) };
    }
    // exact
    if (imgLockAspect) {
      const scale = imgWidth / origW;
      return { w: Math.round(imgWidth), h: Math.max(1, Math.round(origH * scale)) };
    }
    return { w: Math.round(imgWidth), h: Math.round(imgHeight) };
  };

  const doResizeImages = async () => {
    if (!imgItems.length) return;
    setImgBusy(true);
    try {
      const results = [];
      for (const item of imgItems) {
        const { w, h } = computeDims(item.origW, item.origH);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = item.srcUrl; });
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (imgOutFormat === "jpg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        const mime = imgOutFormat === "jpg" ? "image/jpeg" : `image/${imgOutFormat}`;
        const dataUrl = canvas.toDataURL(mime, imgOutFormat === "png" ? undefined : imgQuality);
        results.push({ uid: item.uid, name: `${item.name}-resized.${imgOutFormat}`, dataUrl, w, h, sizeKB: Math.round((dataUrl.length * 0.75) / 1024) });
      }
      setImgResults(results);
      if (user) logToolUsage({ userId: user.uid, tool: "image-resize", pageCount: results.length, totalSizeKB: results.reduce((a, r) => a + r.sizeKB, 0) });
    } catch (err) { console.error(err); alert("Resize failed: " + err.message); }
    finally { setImgBusy(false); }
  };

  const downloadImgResult = (r) => {
    const a = document.createElement("a");
    a.href = r.dataUrl; a.download = r.name; a.click();
  };

  const downloadAllImgZip = async () => {
    if (!imgResults.length) return;
    try {
      const JSZip = (await import("jszip")).default;
      const zip   = new JSZip();
      imgResults.forEach((r) => zip.file(r.name, r.dataUrl.split(",")[1], { base64: true }));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "resized-images.zip"; a.click();
    } catch { imgResults.forEach(downloadImgResult); }
  };

  const resetImages = () => { setImgItems([]); setImgResults([]); };

  const resetAll = () => {
    setPdfFile(null); setPdfName(""); setPageCount(0); setPdfSizeKB(0);
    setResultUrl(null); setResultPages([]); setResultInfo(null); setResultText(null); setProgress(0);
    setPageItems([]); setEditResult(null); setMergeFile(null); setMergeName("");
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>📋</div>
          <span>PDF Tools</span>
        </div>

        {pdfFile && (tab === "resize" || tab === "toimg" || tab === "editpages") && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>📄 {pdfName}.pdf</span>
            {pageCount > 0 && <span className={styles.statChip}>{pageCount} pages</span>}
            <span className={styles.statChip}>{pdfSizeKB} KB</span>
            <button className={styles.clearBtn} onClick={resetAll}>✕ Clear</button>
          </div>
        )}

        {tab === "imgresize" && imgItems.length > 0 && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>🖌 {imgItems.length} image(s)</span>
            <button className={styles.clearBtn} onClick={resetImages}>✕ Clear</button>
          </div>
        )}
      </div>

      <div className={styles.layoutTwo}>
        {/* LEFT */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              {tab === "wordtopdf" ? "Word File" : tab === "imgresize" ? "Images" : "PDF File"}
            </span>
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
          ) : tab === "imgresize" ? (
            <>
              <div
                className={`${styles.dropZone} ${imgDrag2 ? styles.dropActive : ""} ${imgItems.length ? styles.dropHasFiles : ""}`}
                onDragOver={(e) => { e.preventDefault(); setImgDrag2(true); }}
                onDragLeave={() => setImgDrag2(false)}
                onDrop={(e) => { e.preventDefault(); setImgDrag2(false); loadImages(e.dataTransfer.files); }}
                onClick={() => imgFileRef.current?.click()}
              >
                <input ref={imgFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => loadImages(e.target.files)} />
                <div className={styles.dropContent}>
                  <div className={styles.dropEmoji}>🖌</div>
                  <p className={styles.dropText}>Drop images here</p>
                  <span className={styles.dropSub}>or click to browse — multiple allowed</span>
                  <span className={styles.dropFormats}>JPG · PNG · WEBP · GIF</span>
                </div>
              </div>

              {imgItems.length > 0 && (
                <div className={styles.imageGrid}>
                  {imgItems.map((it) => (
                    <div key={it.uid} className={styles.imgCard}>
                      <img src={it.srcUrl} alt={it.name} className={styles.imgThumb} />
                      <div className={styles.imgOverlay}>
                        <span className={styles.imgNum}>{it.origW}×{it.origH}</span>
                        <button className={styles.imgRemove} onClick={() => removeImgItem(it.uid)}>✕</button>
                      </div>
                      <div className={styles.imgLabel}>{it.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {imgResults.length > 0 && (
                <>
                  <div className={styles.resultBox}>
                    <div className={styles.resultLeft}>
                      <span className={styles.resultIcon}>✅</span>
                      <div>
                        <div className={styles.resultName}>{imgResults.length} image(s) resized</div>
                        <div className={styles.resultMeta}>{imgOutFormat.toUpperCase()}</div>
                      </div>
                    </div>
                    <button className={styles.downloadBtn} onClick={downloadAllImgZip}>↓ ZIP All</button>
                  </div>
                  <div className={styles.imgPreviewGrid}>
                    {imgResults.map((r) => (
                      <div key={r.uid} className={styles.imgPreviewCard}>
                        <img src={r.dataUrl} alt={r.name} className={styles.imgPreviewThumb} />
                        <div className={styles.imgPreviewInfo}>
                          <span>{r.w}×{r.h}</span>
                          <span>{r.sizeKB} KB</span>
                          <button className={styles.imgDlBtn} onClick={() => downloadImgResult(r)}>↓</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
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

              {/* Export result — image */}
              {tab === "toimg" && resultInfo && (
                <div className={styles.resultBox}>
                  <div className={styles.resultLeft}>
                    <span className={styles.resultIcon}>{resultText ? "📄" : "🖼"}</span>
                    <div>
                      <div className={styles.resultName}>
                        {resultText ? `${resultInfo.pages} page(s) extracted` : `${resultInfo.pages} image(s) exported`}
                      </div>
                      <div className={styles.resultMeta}>
                        {resultText ? "Plain text (.txt)" : `${resultInfo.format} · ${resultInfo.scale}`}
                      </div>
                    </div>
                  </div>
                  {resultText
                    ? <button className={styles.downloadBtn} onClick={downloadText}>↓ Download .txt</button>
                    : <button className={styles.downloadBtn} onClick={downloadAllZip}>↓ ZIP All</button>}
                </div>
              )}

              {tab === "toimg" && resultText && (
                <div className={styles.textPreview}>
                  {resultText.fullText.slice(0, 4000)}
                  {resultText.fullText.length > 4000 ? "\n\n… (preview truncated — full text is in the downloaded file)" : ""}
                </div>
              )}

              {tab === "toimg" && !resultText && resultPages.length > 0 && (
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
                onClick={() => { setTab(t.id); setResultUrl(null); setResultPages([]); setResultInfo(null); setResultText(null); }}>
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

              {/* EXPORT: PDF → IMAGE / TEXT */}
              {tab === "toimg" && <>
                <h2 className={styles.sectionTitle}>🖼 Export PDF</h2>
                <p className={styles.sectionDesc}>Convert each page to an image, or pull out the raw text.</p>

                <div className={styles.field}>
                  <label>Format</label>
                  <div className={styles.chipGroup}>
                    {["png","jpg","webp","txt"].map((f) => (
                      <button key={f} className={`${styles.chip} ${imgFormat===f?styles.chipActive:""}`} onClick={() => setImgFormat(f)}>{f.toUpperCase()}</button>
                    ))}
                  </div>
                </div>

                {imgFormat !== "txt" && (
                  <div className={styles.field}>
                    <label>Resolution — <strong className={styles.valLabel}>{imgScale}× ({Math.round(72*imgScale)} DPI)</strong></label>
                    <input type="range" min="1" max="4" step="0.5" value={imgScale} onChange={(e) => setImgScale(+e.target.value)} className={styles.slider} />
                    <div className={styles.sliderLabels}><span>72 DPI (screen)</span><span>288 DPI (print)</span></div>
                  </div>
                )}

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
                  <span>{imgFormat === "txt" ? "📄" : "📦"}</span>
                  <span>
                    {imgFormat === "txt"
                      ? "Text is pulled straight from the PDF's embedded content — scanned/image-only pages won't extract anything."
                      : <>All images bundled as <strong>.zip</strong>. Individual download also available.</>}
                  </span>
                </div>

                <button className={`${styles.actionBtn} ${processing?styles.actionBusy:""}`} onClick={doExport} disabled={processing||!pdfFile||!pdfReady}>
                  {processing
                    ? <><span className={styles.spinner} /> {imgFormat === "txt" ? "Extracting" : "Converting"}… {progress}%</>
                    : imgFormat === "txt"
                      ? <>📄 Extract Text {pageCount>0?`(${pageRange==="all"?pageCount:"custom"} pages)`:""}</>
                      : <>🖼 Convert to Images {pageCount>0?`(${pageRange==="all"?pageCount:"custom"} pages)`:""}</>}
                </button>
                {processing && <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width:`${progress}%` }} /></div>}
              </>}

              {/* EDIT PAGES */}
              {tab === "editpages" && <>
                <h2 className={styles.sectionTitle}>🗂 Edit Pages</h2>
                <p className={styles.sectionDesc}>Drag to reorder, delete pages, insert blanks, or merge another PDF in.</p>

                {!pdfFile && <p className={styles.noImageHint}>Upload a PDF on the left to start editing.</p>}

                {pdfFile && (
                  <>
                    <div className={styles.field}>
                      <label>Output File Name</label>
                      <div className={styles.nameRow}>
                        <input className={styles.textInput} type="text" value={editOutName} onChange={(e) => setEditOutName(e.target.value)} placeholder="edited" />
                        <span className={styles.nameSuffix}>.pdf</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label>Merge Another PDF <span className={styles.optional}>(optional)</span></label>
                      <div className={styles.chipGroup}>
                        <button className={styles.chip} onClick={() => mergeFileRef.current?.click()} disabled={mergeBusy}>
                          {mergeBusy ? "Loading…" : "+ Add PDF to merge"}
                        </button>
                        {mergeName && <span className={styles.presetChip}>{mergeName}.pdf</span>}
                      </div>
                      <input ref={mergeFileRef} type="file" accept="application/pdf" hidden onChange={(e) => loadMergeFile(e.target.files?.[0])} />
                    </div>

                    <div className={styles.chipGroup}>
                      <button className={styles.chip} onClick={insertBlankPage} disabled={editBusy}>+ Insert Blank Page (at end)</button>
                    </div>

                    {editBusy && pageItems.length === 0 && <p className={styles.loadingNote}>⏳ Loading pages…</p>}

                    {pageItems.length > 0 && (
                      <div className={styles.field}>
                        <label>Pages — {pageItems.length} total <span className={styles.optional}>drag cards to reorder</span></label>
                        <div className={styles.imageGrid}>
                          {pageItems.map((item, idx) => (
                            <div
                              key={item.uid}
                              className={styles.imgCard}
                              draggable
                              onDragStart={() => handleDragStart(idx)}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDrop(idx)}
                              title="Drag to reorder"
                            >
                              {item.kind === "blank" ? (
                                <div className={styles.blankPageCard}>+ Blank<br/>Page</div>
                              ) : (
                                <img src={item.thumb} alt={`Page ${idx+1}`} className={styles.imgThumb} />
                              )}
                              <div className={styles.imgOverlay}>
                                <span className={styles.imgNum}>{idx + 1}</span>
                                <button className={styles.imgRemove} onClick={() => removePageItem(item.uid)}>✕</button>
                              </div>
                              <div className={styles.imgLabel}>
                                {item.kind === "blank" ? "Blank" : item.srcKey === "main" ? "Original" : "Merged"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className={`${styles.actionBtn} ${editBusy?styles.actionBusy:""}`} onClick={doEditApply} disabled={editBusy||!pageItems.length}>
                      {editBusy ? <><span className={styles.spinner} /> Building…</> : <>🗂 Apply & Build PDF ({pageItems.length} pages)</>}
                    </button>

                    {editResult && (
                      <div className={styles.resultBox}>
                        <div className={styles.resultLeft}>
                          <span className={styles.resultIcon}>✅</span>
                          <div>
                            <div className={styles.resultName}>{editResult.name}</div>
                            <div className={styles.resultMeta}>{editResult.pages} pages · {editResult.size} MB</div>
                          </div>
                        </div>
                        <a href={editResult.url} download={editResult.name} className={styles.downloadBtn}>↓ Download</a>
                      </div>
                    )}
                  </>
                )}
              </>}

              {/* IMAGE RESIZE */}
              {tab === "imgresize" && <>
                <h2 className={styles.sectionTitle}>🖌 Image Resize &amp; Convert</h2>
                <p className={styles.sectionDesc}>Batch resize images and export as PNG, JPG, or WEBP.</p>

                <div className={styles.field}>
                  <label>Resize Mode</label>
                  <div className={styles.chipGroup}>
                    {[["percent","Percentage"],["exact","Exact Size"],["maxdim","Max Dimension"]].map(([v,l]) => (
                      <button key={v} className={`${styles.chip} ${imgResizeMode===v?styles.chipActive:""}`} onClick={() => setImgResizeMode(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {imgResizeMode === "percent" && (
                  <div className={styles.field}>
                    <label>Scale — <strong className={styles.valLabel}>{imgPercent}%</strong></label>
                    <input type="range" min="5" max="200" value={imgPercent} onChange={(e) => setImgPercent(+e.target.value)} className={styles.slider} />
                    <div className={styles.sliderLabels}><span>5%</span><span>200%</span></div>
                  </div>
                )}

                {imgResizeMode === "exact" && (
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label>Width (px)</label>
                      <input className={styles.textInput} type="number" value={imgWidth} onChange={(e) => setImgWidth(+e.target.value)} />
                    </div>
                    <div className={styles.fieldCenter}>
                      <button className={`${styles.ratioBtn} ${imgLockAspect?styles.ratioBtnOn:""}`} onClick={() => setImgLockAspect(!imgLockAspect)} title="Lock aspect ratio">🔗</button>
                    </div>
                    <div className={styles.field}>
                      <label>Height (px) {imgLockAspect && <span className={styles.optional}>(auto)</span>}</label>
                      <input className={styles.textInput} type="number" value={imgHeight} onChange={(e) => setImgHeight(+e.target.value)} disabled={imgLockAspect} />
                    </div>
                  </div>
                )}

                {imgResizeMode === "maxdim" && (
                  <>
                    <div className={styles.field}>
                      <label>Max Dimension (px)</label>
                      <input className={styles.textInput} type="number" value={imgMaxDim} onChange={(e) => setImgMaxDim(+e.target.value)} />
                    </div>
                    <label className={styles.checkRow}>
                      <input type="checkbox" checked={imgNoUpscale} onChange={(e) => setImgNoUpscale(e.target.checked)} />
                      Don't upscale images already smaller than this
                    </label>
                  </>
                )}

                <div className={styles.field}>
                  <label>Output Format</label>
                  <div className={styles.formatGrid}>
                    {["png","jpg","webp"].map((f) => (
                      <button key={f} className={`${styles.formatChip} ${imgOutFormat===f?styles.formatActive:""}`} onClick={() => setImgOutFormat(f)}>{f.toUpperCase()}</button>
                    ))}
                  </div>
                </div>

                {imgOutFormat !== "png" && (
                  <div className={styles.field}>
                    <label>Quality — <strong className={styles.valLabel}>{Math.round(imgQuality*100)}%</strong></label>
                    <input type="range" min="0.3" max="1" step="0.05" value={imgQuality} onChange={(e) => setImgQuality(+e.target.value)} className={styles.slider} />
                  </div>
                )}

                <button className={`${styles.actionBtn} ${imgBusy?styles.actionBusy:""}`} onClick={doResizeImages} disabled={imgBusy||!imgItems.length}>
                  {imgBusy ? <><span className={styles.spinner} /> Resizing…</> : <>🖌 Resize {imgItems.length||""} Image{imgItems.length===1?"":"s"}</>}
                </button>
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
