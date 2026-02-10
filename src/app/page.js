"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import { getCurrentUser, signOutUser } from "@/lib/firebaseAuth";

const TOOLS = [
  { id: "img-pdf", label: "Image to PDF" },
  { id: "pdf-img", label: "PDF to Image" },
  { id: "video-img", label: "Video to Image" },
  { id: "img-resize", label: "Image Size Resize" },
  { id: "pdf-resize", label: "PDF Size Resize" },
  { id: "img-format", label: "Image to JPG / JPEG / PNG" },
];

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

const fileToArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const canvasFromImage = (img, width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};


const ensurePdfJs = async () => {
  if (window.pdfjsLib) return window.pdfjsLib;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  if (!window.pdfjsLib) {
    throw new Error("Unable to load PDF library");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  return window.pdfjsLib;
};

const renderFirstPdfPageToCanvas = async (file, scale = 1.5) => {
  const pdfjs = await ensurePdfJs();
  const pdfData = await fileToArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
};

const createPdfFromJpegDataUrl = (jpegDataUrl, widthPx, heightPx) => {
  const base64Data = jpegDataUrl.split(",")[1];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const escapePdf = (str) => str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const imgStream = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");

  const width = Math.max(1, widthPx);
  const height = Math.max(1, heightPx);

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const imgObj = addObject(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n${imgStream}\nendstream`
  );

  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
  const contentObj = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const pageObj = addObject(
    `<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>`
  );

  const pagesObj = addObject(`<< /Type /Pages /Count 1 /Kids [${pageObj} 0 R] >>`);
  const catalogObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  const infoObj = addObject(`<< /Producer (${escapePdf("MyDashboard")}) >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

export default function DashboardPage() {
  const router = useRouter();
  const [user] = useState(() => (typeof window !== "undefined" ? getCurrentUser() : null));
  const [selectedTool, setSelectedTool] = useState(null);
  const [message, setMessage] = useState("");

  const [resizeWidth, setResizeWidth] = useState(1200);
  const [resizeHeight, setResizeHeight] = useState(800);
  const [imgFormat, setImgFormat] = useState("image/jpeg");

  const cardTitle = useMemo(
    () => (selectedTool ? TOOLS.find((tool) => tool.id === selectedTool)?.label : "File Management"),
    [selectedTool]
  );

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [router, user]);

  const onLogout = () => {
    signOutUser();
    router.replace("/login");
  };

  const withMessage = async (action) => {
    setMessage("");
    try {
      await action();
      setMessage("Done ✅ file downloaded");
    } catch (error) {
      setMessage(error.message || "Action failed");
    }
  };

  const imageToPdf = async (file) => {
    const img = await loadImage(file);
    const canvas = canvasFromImage(img, img.width, img.height);
    const data = canvas.toDataURL("image/jpeg", 0.95);
    const pdfBlob = createPdfFromJpegDataUrl(data, img.width, img.height);
    downloadBlob(pdfBlob, `${file.name.replace(/\.[^/.]+$/, "")}.pdf`);
  };

  const pdfToImage = async (file) => {
    const canvas = await renderFirstPdfPageToCanvas(file, 1.5);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, "")}-page-1.png`);
  };

  const videoToImage = async (file) => {
    const video = document.createElement("video");
    const src = URL.createObjectURL(file);
    video.src = src;
    await new Promise((resolve) => {
      video.onloadeddata = resolve;
    });
    video.currentTime = Math.min(1, video.duration || 0);
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    URL.revokeObjectURL(src);
    downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, "")}-frame.png`);
  };

  const resizeImage = async (file) => {
    const img = await loadImage(file);
    const canvas = canvasFromImage(img, resizeWidth, resizeHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, "")}-${resizeWidth}x${resizeHeight}.png`);
  };

  const resizePdf = async (file) => {
    const sourceCanvas = await renderFirstPdfPageToCanvas(file, 1.2);
    const targetWidth = Math.max(1, Math.round(sourceCanvas.width * 0.7));
    const targetHeight = Math.max(1, Math.round(sourceCanvas.height * 0.7));
    const resized = document.createElement("canvas");
    resized.width = targetWidth;
    resized.height = targetHeight;
    resized.getContext("2d").drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
    const jpeg = resized.toDataURL("image/jpeg", 0.75);
    const resizedPdf = createPdfFromJpegDataUrl(jpeg, targetWidth, targetHeight);
    downloadBlob(resizedPdf, `${file.name.replace(/\.[^/.]+$/, "")}-resized.pdf`);
  };

  const convertImageFormat = async (file) => {
    const img = await loadImage(file);
    const canvas = canvasFromImage(img, img.width, img.height);
    const ext = imgFormat === "image/png" ? "png" : "jpg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, imgFormat, 0.95));
    downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, "")}.${ext}`);
  };

  if (!user) {
    return <div className={styles.loader}>Checking login...</div>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Dashboard Home</h1>
          <p>Welcome {user?.email}</p>
        </div>
        <button onClick={onLogout} className={styles.logoutBtn}>Logout</button>
      </header>

      <section className={styles.card}>
        <button className={styles.cardTop} onClick={() => setSelectedTool((prev) => (prev ? null : "img-pdf"))}>
          <div>
            <h2>Hi 👋 File Management</h2>
            <p>Click to open all tools</p>
          </div>
        </button>

        <div className={styles.toolsRow}>
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={`${styles.toolBtn} ${selectedTool === tool.id ? styles.activeTool : ""}`}
              onClick={() => setSelectedTool(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>

        {selectedTool ? (
          <div className={styles.toolPanel}>
            <h3>{cardTitle}</h3>

            {(selectedTool === "img-resize") && (
              <div className={styles.inlineInputs}>
                <input type="number" value={resizeWidth} onChange={(e) => setResizeWidth(Number(e.target.value || 1))} className={styles.input} min={1} />
                <input type="number" value={resizeHeight} onChange={(e) => setResizeHeight(Number(e.target.value || 1))} className={styles.input} min={1} />
              </div>
            )}

            {(selectedTool === "img-format") && (
              <select className={styles.input} value={imgFormat} onChange={(e) => setImgFormat(e.target.value)}>
                <option value="image/jpeg">JPG / JPEG</option>
                <option value="image/png">PNG</option>
              </select>
            )}

            <input
              type="file"
              className={styles.fileInput}
              accept={
                selectedTool === "img-pdf" || selectedTool === "img-resize" || selectedTool === "img-format"
                  ? "image/*"
                  : selectedTool === "pdf-img" || selectedTool === "pdf-resize"
                  ? "application/pdf"
                  : "video/*"
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const run =
                  selectedTool === "img-pdf"
                    ? () => imageToPdf(file)
                    : selectedTool === "pdf-img"
                    ? () => pdfToImage(file)
                    : selectedTool === "video-img"
                    ? () => videoToImage(file)
                    : selectedTool === "img-resize"
                    ? () => resizeImage(file)
                    : selectedTool === "pdf-resize"
                    ? () => resizePdf(file)
                    : () => convertImageFormat(file);

                withMessage(run);
                e.target.value = "";
              }}
            />

            {message ? <p className={styles.message}>{message}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
