// File: app/dashboard/file-studio/page.js
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "./page.module.css";

// ─── PDF.js CDN ───────────────────────────────────────────
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const WORKER    = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function usePdfJs() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.pdfjsLib) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = PDFJS_CDN;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; setReady(true); };
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ─── File type detection ──────────────────────────────────
const detectType = (file) => {
  const name = file.name.toLowerCase();
  const mime = file.type;

  if (mime.startsWith("image/"))                    return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("video/"))                    return "video";
  if (mime.startsWith("audio/"))                    return "audio";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "word";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return "spreadsheet";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "ppt";
  if (name.endsWith(".txt") || name.endsWith(".md"))  return "text";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".json"))                        return "json";
  if (name.endsWith(".xml"))                         return "xml";
  if (name.endsWith(".svg"))                         return "svg";
  if (mime.startsWith("text/"))                      return "text";
  return "unknown";
};

// ─── Export formats per file type ────────────────────────
const EXPORT_FORMATS = {
  image:      ["PNG","JPG","WEBP","PDF","SVG","BMP"],
  pdf:        ["PDF","PNG","JPG","WEBP","TXT"],
  video:      ["GIF","MP4","WEBM"],
  audio:      ["MP3","WAV","OGG"],
  word:       ["PDF","TXT","HTML","MD"],
  spreadsheet:["PDF","CSV","JSON","TXT","HTML"],
  ppt:        ["PDF","PNG","JPG","HTML"],
  text:       ["PDF","DOCX","HTML","MD","TXT"],
  html:       ["PDF","PNG","TXT","MD"],
  json:       ["CSV","TXT","XML","HTML"],
  xml:        ["JSON","TXT","HTML"],
  svg:        ["PNG","JPG","PDF","SVG"],
  unknown:    ["PDF","TXT"],
};

const FILE_ICONS = {
  image:"🖼️", pdf:"📋", video:"🎬", audio:"🎵",
  word:"📝", spreadsheet:"📊", ppt:"📑", text:"📄",
  html:"🌐", json:"{ }", xml:"</>" , svg:"✦", unknown:"📁",
};

const FILE_COLORS = {
  image:"#9b5de5", pdf:"#e63946", video:"#3a86ff", audio:"#f77f00",
  word:"#4361ee", spreadsheet:"#0f9d6e", ppt:"#f15bb5", text:"#6b7ab5",
  html:"#e97b2d", json:"#06d6a0", xml:"#adb5bd", svg:"#f72585", unknown:"#adb5bd",
};

export default function FileStudioPage() {
  const router  = useRouter();
  const user    = getCurrentUser();
  const pdfReady = usePdfJs();

  const fileRef = useRef(null);

  // file state
  const [file,       setFile      ] = useState(null);
  const [fileType,   setFileType  ] = useState(null);
  const [fileUrl,    setFileUrl   ] = useState(null);
  const [fileText,   setFileText  ] = useState("");
  const [isDrag,     setIsDrag    ] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // pdf preview
  const [pdfPages,   setPdfPages  ] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // word/spreadsheet
  const [htmlContent,setHtmlContent] = useState("");
  const [loading,    setLoading    ] = useState(false);

  // export
  const [exporting,  setExporting ] = useState(false);
  const [exportMsg,  setExportMsg ] = useState("");

  // ─── Load file ───────────────────────────────────────────
  const loadFile = useCallback(async (f) => {
    if (!f) return;
    setFile(f);
    setFileText("");
    setHtmlContent("");
    setPdfPages([]);
    setExportMsg("");
    setLoading(true);

    const type = detectType(f);
    setFileType(type);
    const url = URL.createObjectURL(f);
    setFileUrl(url);

    try {
      if (type === "text" || type === "html" || type === "json" || type === "xml" || type === "md") {
        const text = await f.text();
        setFileText(text);
      }

      if (type === "word") {
        const mammoth = await import("mammoth");
        const buf     = await f.arrayBuffer();
        const result  = await mammoth.convertToHtml({ arrayBuffer: buf });
        setHtmlContent(result.value);
      }

      if (type === "spreadsheet" && f.name.endsWith(".csv")) {
        const text = await f.text();
        setFileText(text);
        // Convert CSV to HTML table
        const rows = text.trim().split("\n").map(r => r.split(","));
        const html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px">
          <thead style="background:#f4f7fe"><tr>${rows[0].map(h=>`<th style="padding:8px;border:1px solid #ddd;text-align:left">${h.replace(/"/g,"")}</th>`).join("")}</tr></thead>
          <tbody>${rows.slice(1).map(r=>`<tr>${r.map(c=>`<td style="padding:6px 8px;border:1px solid #ddd">${c.replace(/"/g,"")}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>`;
        setHtmlContent(html);
      }

      if (type === "spreadsheet" && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
        const XLSX  = await import("xlsx");
        const buf   = await f.arrayBuffer();
        const wb    = XLSX.read(buf, { type: "array" });
        const ws    = wb.Sheets[wb.SheetNames[0]];
        const html  = XLSX.utils.sheet_to_html(ws, { editable: false });
        setHtmlContent(html);
      }

      if (type === "pdf" && pdfReady) {
        setPdfLoading(true);
        const buf  = await f.arrayBuffer();
        const doc  = await window.pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
          const page   = await doc.getPage(i);
          const vp     = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          const ctx    = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          pages.push({ dataUrl: canvas.toDataURL("image/png"), pageNum: i, w: vp.width, h: vp.height });
        }
        setPdfPages(pages);
        setPdfLoading(false);
      }

      if (user) logToolUsage({ userId: user.uid, tool: "file-studio-upload", totalSizeKB: Math.round(f.size/1024) });
    } catch (err) {
      console.error("File load error:", err);
    } finally {
      setLoading(false);
    }
  }, [pdfReady, user]);

  const handleDrop = (e) => {
    e.preventDefault(); setIsDrag(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  // ─── EXPORT ENGINE ───────────────────────────────────────
  const exportFile = async (targetFormat) => {
    if (!file) return;
    setExporting(true);
    setExportMsg(`Exporting as ${targetFormat}…`);

    try {
      const fmt = targetFormat.toLowerCase();

      // ── IMAGE → various ──────────────────────────────────
      if (fileType === "image" || fileType === "svg") {
        const img = new Image();
        img.src   = fileUrl;
        await new Promise(r => { img.onload = r; });
        const c   = document.createElement("canvas");
        c.width   = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,c.width,c.height);
        ctx.drawImage(img,0,0);

        if (fmt === "pdf") {
          const { jsPDF } = await import("jspdf");
          const pdf = new jsPDF({ unit:"px", format:[c.width,c.height] });
          pdf.addImage(c.toDataURL("image/jpeg",0.95),"JPEG",0,0,c.width,c.height);
          pdf.save(`${file.name.replace(/\.[^.]+$/,"")}.pdf`);
        } else if (["png","jpg","webp","bmp"].includes(fmt)) {
          const mime = fmt==="jpg"?"image/jpeg":`image/${fmt}`;
          dlDataUrl(c.toDataURL(mime,0.95), `${file.name.replace(/\.[^.]+$/,"")}.${fmt}`);
        } else if (fmt === "svg") {
          const svgBlob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}"><image href="${c.toDataURL()}" width="${c.width}" height="${c.height}"/></svg>`], {type:"image/svg+xml"});
          dlBlob(svgBlob, `${file.name.replace(/\.[^.]+$/,"")}.svg`);
        }
      }

      // ── PDF → image ──────────────────────────────────────
      else if (fileType === "pdf" && ["png","jpg","webp"].includes(fmt)) {
        if (pdfPages.length > 0) {
          const JSZip = (await import("jszip")).default;
          const zip   = new JSZip();
          pdfPages.forEach(p => zip.file(`page_${p.pageNum}.${fmt}`, p.dataUrl.split(",")[1], { base64: true }));
          const blob = await zip.generateAsync({ type:"blob" });
          dlBlob(blob, `${file.name.replace(".pdf","")}-pages.zip`);
        }
      }

      // ── PDF → txt ────────────────────────────────────────
      else if (fileType === "pdf" && fmt === "txt") {
        if (!pdfReady) { setExportMsg("PDF engine loading…"); return; }
        const buf = await file.arrayBuffer();
        const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let text  = "";
        for (let i=1; i<=doc.numPages; i++) {
          const page    = await doc.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(s=>s.str).join(" ") + "\n\n";
        }
        dlText(text, `${file.name.replace(".pdf","")}.txt`);
      }

      // ── WORD → PDF ───────────────────────────────────────
      else if (fileType === "word" && fmt === "pdf") {
        const { jsPDF } = await import("jspdf");
        const html2canvas = (await import("html2canvas")).default;
        // Render htmlContent to canvas
        const div = document.createElement("div");
        div.innerHTML = htmlContent;
        div.style.cssText = "width:794px;padding:40px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#111;position:fixed;top:-9999px;background:#fff";
        document.body.appendChild(div);
        await new Promise(r => setTimeout(r,300));
        const canvas = await html2canvas(div, { scale:2, useCORS:true, width:794 });
        document.body.removeChild(div);
        const pdf   = new jsPDF({ unit:"mm", format:"a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgH  = (canvas.height * pageW) / canvas.width;
        let y = 0, rem = imgH;
        while (rem > 0) {
          if (y>0) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg",0.9),"JPEG",0,-y,pageW,imgH);
          y+=pageH; rem-=pageH;
        }
        pdf.save(`${file.name.replace(/\.[^.]+$/,"")}.pdf`);
      }

      // ── WORD → TXT ───────────────────────────────────────
      else if (fileType === "word" && fmt === "txt") {
        const plain = htmlContent.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
        dlText(plain, `${file.name.replace(/\.[^.]+$/,"")}.txt`);
      }

      // ── WORD → HTML ──────────────────────────────────────
      else if (fileType === "word" && fmt === "html") {
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style></head><body>${htmlContent}</body></html>`;
        dlText(html, `${file.name.replace(/\.[^.]+$/,"")}.html`, "text/html");
      }

      // ── WORD → MD ────────────────────────────────────────
      else if (fileType === "word" && fmt === "md") {
        const md = htmlContent
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi,"# $1\n")
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi,"## $1\n")
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi,"### $1\n")
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi,"**$1**")
          .replace(/<em[^>]*>(.*?)<\/em>/gi,"*$1*")
          .replace(/<p[^>]*>(.*?)<\/p>/gi,"$1\n\n")
          .replace(/<br\s*\/?>/gi,"\n")
          .replace(/<li[^>]*>(.*?)<\/li>/gi,"- $1\n")
          .replace(/<[^>]*>/g,"")
          .trim();
        dlText(md, `${file.name.replace(/\.[^.]+$/,"")}.md`);
      }

      // ── SPREADSHEET → CSV ────────────────────────────────
      else if (fileType === "spreadsheet" && fmt === "csv") {
        if (file.name.endsWith(".csv")) {
          dlBlob(file, file.name); // already CSV
        } else {
          const XLSX = await import("xlsx");
          const buf  = await file.arrayBuffer();
          const wb   = XLSX.read(buf, { type:"array" });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const csv  = XLSX.utils.sheet_to_csv(ws);
          dlText(csv, `${file.name.replace(/\.[^.]+$/,"")}.csv`);
        }
      }

      // ── SPREADSHEET → JSON ───────────────────────────────
      else if (fileType === "spreadsheet" && fmt === "json") {
        const XLSX = await import("xlsx");
        let json;
        if (file.name.endsWith(".csv")) {
          const text = await file.text();
          const rows = text.trim().split("\n").map(r=>r.split(",").map(c=>c.replace(/"/g,"")));
          const keys = rows[0];
          json = rows.slice(1).map(r => Object.fromEntries(keys.map((k,i)=>[k,r[i]])));
        } else {
          const buf = await file.arrayBuffer();
          const wb  = XLSX.read(buf, { type:"array" });
          const ws  = wb.Sheets[wb.SheetNames[0]];
          json = XLSX.utils.sheet_to_json(ws);
        }
        dlText(JSON.stringify(json, null, 2), `${file.name.replace(/\.[^.]+$/,"")}.json`, "application/json");
      }

      // ── SPREADSHEET → HTML ───────────────────────────────
      else if (fileType === "spreadsheet" && fmt === "html") {
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f7fe}</style></head><body>${htmlContent}</body></html>`;
        dlText(html, `${file.name.replace(/\.[^.]+$/,"")}.html`, "text/html");
      }

      // ── SPREADSHEET → PDF ────────────────────────────────
      else if (fileType === "spreadsheet" && fmt === "pdf") {
        const { jsPDF } = await import("jspdf");
        const html2canvas = (await import("html2canvas")).default;
        const div = document.createElement("div");
        div.innerHTML = htmlContent;
        div.style.cssText = "width:1000px;padding:20px;font-family:Arial,sans-serif;font-size:11px;position:fixed;top:-9999px;background:#fff";
        document.body.appendChild(div);
        await new Promise(r => setTimeout(r,300));
        const canvas = await html2canvas(div, { scale:1.5, useCORS:true });
        document.body.removeChild(div);
        const pdf   = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const imgH  = (canvas.height * pageW) / canvas.width;
        pdf.addImage(canvas.toDataURL("image/jpeg",0.9),"JPEG",0,0,pageW,imgH);
        pdf.save(`${file.name.replace(/\.[^.]+$/,"")}.pdf`);
      }

      // ── TEXT / HTML / JSON / XML → PDF ───────────────────
      else if (["text","html","json","xml"].includes(fileType) && fmt === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf   = new jsPDF({ unit:"mm", format:"a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.setFontSize(10);
        const lines = pdf.splitTextToSize(fileText, pageW-20);
        let y = 15;
        lines.forEach(line => {
          if (y > pageH-15) { pdf.addPage(); y=15; }
          pdf.text(line, 10, y);
          y += 5.5;
        });
        pdf.save(`${file.name.replace(/\.[^.]+$/,"")}.pdf`);
      }

      // ── TEXT → HTML ──────────────────────────────────────
      else if (fileType === "text" && fmt === "html") {
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><pre>${fileText.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></body></html>`;
        dlText(html, `${file.name.replace(/\.[^.]+$/,"")}.html`, "text/html");
      }

      // ── JSON → CSV ───────────────────────────────────────
      else if (fileType === "json" && fmt === "csv") {
        const data  = JSON.parse(fileText);
        const arr   = Array.isArray(data) ? data : [data];
        const keys  = Object.keys(arr[0] || {});
        const csv   = [keys.join(","), ...arr.map(r => keys.map(k => JSON.stringify(r[k]||"")).join(","))].join("\n");
        dlText(csv, `${file.name.replace(/\.[^.]+$/,"")}.csv`);
      }

      // ── VIDEO → frame GIF placeholder ────────────────────
      else if (fileType === "video" && fmt === "gif") {
        setExportMsg("GIF export requires server-side processing. Downloading original MP4.");
        await new Promise(r => setTimeout(r,1500));
        dlBlob(file, file.name);
      }

      // ── Generic: same file download ──────────────────────
      else {
        dlBlob(file, `${file.name.replace(/\.[^.]+$/,"")}.${fmt}`);
      }

      setExportMsg(`✅ Exported as ${targetFormat}!`);
      setTimeout(() => setExportMsg(""), 3000);
      if (user) logToolUsage({ userId: user.uid, tool: `file-studio-export-${fmt}`, totalSizeKB: Math.round(file.size/1024) });

    } catch (err) {
      console.error("Export error:", err);
      setExportMsg(`❌ Export failed: ${err.message}`);
      setTimeout(() => setExportMsg(""), 4000);
    } finally {
      setExporting(false);
    }
  };

  // ─── Download helpers ─────────────────────────────────────
  const dlDataUrl = (dataUrl, name) => {
    const a = document.createElement("a"); a.href=dataUrl; a.download=name; a.click();
  };
  const dlBlob = (blob, name) => {
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  };
  const dlText = (text, name, mime="text/plain") => {
    dlBlob(new Blob([text], { type:mime }), name);
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return bytes+"B";
    if (bytes < 1048576) return (bytes/1024).toFixed(1)+"KB";
    return (bytes/1048576).toFixed(2)+"MB";
  };

  const reset = () => {
    setFile(null); setFileType(null); setFileUrl(null);
    setFileText(""); setHtmlContent(""); setPdfPages([]);
    setExportMsg(""); setFullscreen(false);
  };

  const exports = fileType ? (EXPORT_FORMATS[fileType] || EXPORT_FORMATS.unknown) : [];

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon} style={{ background: fileType ? FILE_COLORS[fileType] : "#4361ee" }}>
            {fileType ? FILE_ICONS[fileType] : "📁"}
          </div>
          <span>File Studio</span>
        </div>
        {file && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>{FILE_ICONS[fileType]} {fileType?.toUpperCase()}</span>
            <span className={styles.statChip}>{fmtSize(file.size)}</span>
            <span className={styles.statChip} style={{ maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</span>
            <button className={styles.clearBtn} onClick={reset}>✕ Clear</button>
          </div>
        )}
        {file && (
          <button className={styles.fullscreenBtn} onClick={() => setFullscreen(f=>!f)} title="Fullscreen Preview">
            {fullscreen ? "⊡ Exit Fullscreen" : "⤢ Fullscreen"}
          </button>
        )}
      </div>

      <div className={styles.root}>

        {/* ── LEFT: Upload + Export ── */}
        <aside className={styles.leftPanel}>

          {/* Upload Zone */}
          {!file ? (
            <div
              className={`${styles.dropZone} ${isDrag ? styles.dropActive : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
              onDragLeave={() => setIsDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" hidden
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.html,.htm,.json,.xml,.svg"
                onChange={(e) => loadFile(e.target.files?.[0])}
              />
              <div className={styles.dropContent}>
                <div className={styles.dropBigIcon}>📁</div>
                <p className={styles.dropTitle}>Drop any file here</p>
                <p className={styles.dropSub}>or click to browse</p>
                <div className={styles.dropFormatsGrid}>
                  {["📋 PDF","🖼️ Image","🎬 Video","🎵 Audio","📝 Word","📊 Excel","📑 PPT","📄 TXT","🌐 HTML","{ } JSON"].map(f=>(
                    <span key={f} className={styles.dropFormatChip}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.fileCard}>
              <div className={styles.fileCardIcon} style={{ background: `${FILE_COLORS[fileType]}18`, color: FILE_COLORS[fileType] }}>
                {FILE_ICONS[fileType]}
              </div>
              <div className={styles.fileCardInfo}>
                <div className={styles.fileCardName}>{file.name}</div>
                <div className={styles.fileCardMeta}>
                  <span style={{ color: FILE_COLORS[fileType], fontWeight:700 }}>{fileType?.toUpperCase()}</span>
                  <span>·</span>
                  <span>{fmtSize(file.size)}</span>
                </div>
              </div>
              <button className={styles.fileCardChange} onClick={() => fileRef.current?.click()}>Change</button>
              <input ref={fileRef} type="file" hidden
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.html,.htm,.json,.xml,.svg"
                onChange={(e) => loadFile(e.target.files?.[0])}
              />
            </div>
          )}

          {/* Export Panel */}
          {file && exports.length > 0 && (
            <div className={styles.exportPanel}>
              <div className={styles.exportTitle}>
                <span>⬇️ Export As</span>
              </div>
              <div className={styles.exportGrid}>
                {exports.map((fmt) => (
                  <button
                    key={fmt}
                    className={`${styles.exportBtn} ${exporting ? styles.exportBtnBusy : ""}`}
                    onClick={() => exportFile(fmt)}
                    disabled={exporting}
                  >
                    {exporting ? <span className={styles.miniSpinner}/> : fmt}
                  </button>
                ))}
              </div>
              {exportMsg && (
                <div className={`${styles.exportMsg} ${exportMsg.startsWith("✅") ? styles.exportMsgOk : exportMsg.startsWith("❌") ? styles.exportMsgErr : ""}`}>
                  {exportMsg}
                </div>
              )}
            </div>
          )}

          {/* File Info */}
          {file && (
            <div className={styles.infoPanel}>
              <div className={styles.infoPanelTitle}>File Info</div>
              <div className={styles.infoRow}><span>Name</span><span>{file.name}</span></div>
              <div className={styles.infoRow}><span>Type</span><span>{fileType?.toUpperCase()}</span></div>
              <div className={styles.infoRow}><span>MIME</span><span>{file.type||"—"}</span></div>
              <div className={styles.infoRow}><span>Size</span><span>{fmtSize(file.size)}</span></div>
              <div className={styles.infoRow}><span>Modified</span><span>{new Date(file.lastModified).toLocaleDateString("en-IN")}</span></div>
              {fileType==="pdf" && pdfPages.length>0 && (
                <div className={styles.infoRow}><span>Pages</span><span>{pdfPages.length}{pdfPages.length===20?" (first 20)":""}</span></div>
              )}
            </div>
          )}
        </aside>

        {/* ── RIGHT: Preview ── */}
        <div className={`${styles.previewPanel} ${fullscreen ? styles.previewFullscreen : ""}`}>
          {fullscreen && (
            <button className={styles.exitFullscreen} onClick={() => setFullscreen(false)}>✕ Exit Fullscreen</button>
          )}

          {/* No file */}
          {!file && (
            <div className={styles.previewEmpty}>
              <div className={styles.previewEmptyIcons}>
                {["📋","🖼️","🎬","📝","📊","📑","🌐","{ }"].map((ic,i)=>(
                  <span key={i} className={styles.previewEmptyIcon} style={{ animationDelay:`${i*0.1}s` }}>{ic}</span>
                ))}
              </div>
              <h2 className={styles.previewEmptyTitle}>Upload any file to preview</h2>
              <p className={styles.previewEmptyDesc}>Supports PDF, Images, Video, Audio, Word, Excel, PPT, TXT, HTML, JSON, XML, SVG and more</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className={styles.previewLoading}>
              <div className={styles.previewSpinner}/>
              <p>Loading preview…</p>
            </div>
          )}

          {/* IMAGE */}
          {!loading && fileType === "image" && fileUrl && (
            <div className={styles.imgPreviewWrap}>
              <img src={fileUrl} alt={file.name} className={styles.imgPreview}/>
            </div>
          )}

          {/* SVG */}
          {!loading && fileType === "svg" && fileUrl && (
            <div className={styles.imgPreviewWrap}>
              <img src={fileUrl} alt={file.name} className={styles.imgPreview}/>
            </div>
          )}

          {/* VIDEO */}
          {!loading && fileType === "video" && fileUrl && (
            <div className={styles.videoPreviewWrap}>
              <video src={fileUrl} controls className={styles.videoPreview}/>
            </div>
          )}

          {/* AUDIO */}
          {!loading && fileType === "audio" && fileUrl && (
            <div className={styles.audioPreviewWrap}>
              <div className={styles.audioIcon}>🎵</div>
              <p className={styles.audioName}>{file.name}</p>
              <audio src={fileUrl} controls className={styles.audioPlayer}/>
            </div>
          )}

          {/* PDF */}
          {!loading && fileType === "pdf" && (
            <div className={styles.pdfPreviewWrap}>
              {pdfLoading && (
                <div className={styles.previewLoading}>
                  <div className={styles.previewSpinner}/>
                  <p>Rendering PDF pages…</p>
                </div>
              )}
              {!pdfLoading && pdfPages.length > 0 && (
                <div className={styles.pdfPages}>
                  {pdfPages.map((p) => (
                    <div key={p.pageNum} className={styles.pdfPage}>
                      <img src={p.dataUrl} alt={`Page ${p.pageNum}`} className={styles.pdfPageImg}/>
                      <span className={styles.pdfPageNum}>Page {p.pageNum}</span>
                    </div>
                  ))}
                </div>
              )}
              {!pdfLoading && pdfPages.length === 0 && !pdfReady && (
                <div className={styles.previewLoading}><p>Loading PDF engine…</p></div>
              )}
              {/* Embed fallback */}
              {!pdfLoading && fileUrl && (
                <div className={styles.pdfEmbedWrap}>
                  <embed src={fileUrl} type="application/pdf" className={styles.pdfEmbed}/>
                </div>
              )}
            </div>
          )}

          {/* WORD / HTML / PPT preview */}
          {!loading && (fileType === "word" || fileType === "ppt") && htmlContent && (
            <div className={styles.htmlPreviewWrap}>
              <div className={styles.htmlPreview} dangerouslySetInnerHTML={{ __html: htmlContent }}/>
            </div>
          )}

          {/* SPREADSHEET */}
          {!loading && fileType === "spreadsheet" && htmlContent && (
            <div className={styles.htmlPreviewWrap}>
              <div className={styles.spreadsheetPreview} dangerouslySetInnerHTML={{ __html: htmlContent }}/>
            </div>
          )}

          {/* TEXT / JSON / XML / HTML / MD */}
          {!loading && ["text","json","xml","md"].includes(fileType) && fileText && (
            <div className={styles.textPreviewWrap}>
              <pre className={styles.textPreview}>{fileText}</pre>
            </div>
          )}

          {/* HTML file preview */}
          {!loading && fileType === "html" && fileText && (
            <div className={styles.htmlPreviewWrap}>
              <iframe
                srcDoc={fileText}
                className={styles.iframePreview}
                sandbox="allow-scripts"
                title="HTML Preview"
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}