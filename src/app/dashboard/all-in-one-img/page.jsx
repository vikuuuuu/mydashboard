// File: app/dashboard/all-in-one-img/page.js
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "../common/toolLayout.module.css";

const TABS = [
  { id: "resize", icon: "⤢", label: "Resize" },
  { id: "compress", icon: "⚡", label: "Compress" },
  { id: "convert", icon: "↔", label: "Convert" },
  { id: "crop", icon: "✂", label: "Crop" },
  { id: "rotate", icon: "↻", label: "Rotate" },
  { id: "filter", icon: "✦", label: "Filters" },
  { id: "watermark", icon: "◈", label: "Watermark" },
];

const FORMATS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tiff",
  "ico",
  "avif",
];
const FILTERS = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invert" },
  { id: "blur", label: "Blur" },
  { id: "brightness", label: "Bright" },
  { id: "contrast", label: "Contrast" },
  { id: "saturate", label: "Vivid" },
  { id: "hue-rotate", label: "Hue" },
];

export default function ImageStudio() {
  const router = useRouter();
  const user = getCurrentUser();

  // shared
  const [tab, setTab] = useState("resize");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [origSize, setOrigSize] = useState(null);
  const [result, setResult] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);
  const [isDrag, setIsDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef();

  // resize
  const [rWidth, setRWidth] = useState("");
  const [rHeight, setRHeight] = useState("");
  const [keepRatio, setKeepRatio] = useState(true);

  // compress
  const [targetKB, setTargetKB] = useState(200);

  // convert
  const [format, setFormat] = useState("png");

  // crop
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState("");
  const [cropH, setCropH] = useState("");

  // rotate
  const [angle, setAngle] = useState(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // filter
  const [activeFilter, setActiveFilter] = useState("none");
  const [filterVal, setFilterVal] = useState(80);

  // watermark
  const [wmText, setWmText] = useState("© My Image");
  const [wmPos, setWmPos] = useState("bottom-right");
  const [wmSize, setWmSize] = useState(32);
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmColor, setWmColor] = useState("#ffffff");

  /* ── Load Image ── */
  const loadImage = useCallback(
    async (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      setImageFile(file);
      setResult(null);
      setResultInfo(null);
      const url = URL.createObjectURL(file);
      setPreview(url);
      const img = new Image();
      img.onload = () => {
        setOrigSize({
          w: img.width,
          h: img.height,
          kb: (file.size / 1024).toFixed(1),
        });
        setRWidth(String(img.width));
        setRHeight(String(img.height));
        setCropW(String(img.width));
        setCropH(String(img.height));
      };
      img.src = url;
      if (user)
        logToolUsage({ userId: user.uid, tool: "all-in-one-img-upload" });
    },
    [user],
  );

  const handleFileInput = (e) => loadImage(e.target.files?.[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDrag(false);
    loadImage(e.dataTransfer.files?.[0]);
  };

  /* ── Canvas Helper ── */
  const getImg = () =>
    new Promise((res) => {
      const img = new Image();
      img.src = preview;
      img.onload = () => res(img);
    });

  /* ── RESIZE ── */
  const doResize = async () => {
    if (!imageFile || !rWidth || !rHeight) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = Number(rWidth);
    c.height = Number(rHeight);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    setResult(c.toDataURL("image/png"));
    setResultInfo({ label: "Size", value: `${rWidth} × ${rHeight} px` });
    setProcessing(false);
    if (user) logToolUsage({ userId: user.uid, tool: "all-in-one-img-resize" });
  };

  /* ── COMPRESS ── */
  const doCompress = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    let quality = 0.92,
      output,
      kb;
    do {
      output = c.toDataURL("image/jpeg", quality);
      kb = atob(output.split(",")[1]).length / 1024;
      quality -= 0.05;
    } while (kb > targetKB && quality > 0.05);
    setResult(output);
    setResultInfo({
      label: "Compressed",
      value: `${kb.toFixed(1)} KB (was ${origSize?.kb} KB)`,
    });
    setProcessing(false);
    if (user)
      logToolUsage({ userId: user.uid, tool: "all-in-one-img-compress" });
  };

  /* ── CONVERT ── */
  const doConvert = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const mime = format === "jpg" ? "image/jpeg" : `image/${format}`;
    setResult(c.toDataURL(mime));
    setResultInfo({ label: "Format", value: format.toUpperCase() });
    setProcessing(false);
    if (user)
      logToolUsage({ userId: user.uid, tool: "all-in-one-img-convert" });
  };

  /* ── CROP ── */
  const doCrop = async () => {
    if (!imageFile || !cropW || !cropH) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = Number(cropW);
    c.height = Number(cropH);
    c.getContext("2d").drawImage(
      img,
      Number(cropX),
      Number(cropY),
      Number(cropW),
      Number(cropH),
      0,
      0,
      Number(cropW),
      Number(cropH),
    );
    setResult(c.toDataURL("image/png"));
    setResultInfo({
      label: "Cropped",
      value: `${cropW} × ${cropH} from (${cropX}, ${cropY})`,
    });
    setProcessing(false);
  };

  /* ── ROTATE ── */
  const doRotate = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const rad = (angle * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad)),
      cos = Math.abs(Math.cos(rad));
    const c = document.createElement("canvas");
    c.width = img.width * cos + img.height * sin;
    c.height = img.width * sin + img.height * cos;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    setResult(c.toDataURL("image/png"));
    setResultInfo({
      label: "Rotated",
      value: `${angle}°${flipH ? " + Flip H" : ""}${flipV ? " + Flip V" : ""}`,
    });
    setProcessing(false);
  };

  /* ── FILTER ── */
  const doFilter = async () => {
    if (!imageFile) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    const v = filterVal;
    const filterMap = {
      grayscale: `grayscale(${v}%)`,
      sepia: `sepia(${v}%)`,
      invert: `invert(${v}%)`,
      blur: `blur(${(v / 100) * 10}px)`,
      brightness: `brightness(${v + 50}%)`,
      contrast: `contrast(${v + 50}%)`,
      saturate: `saturate(${v * 3}%)`,
      "hue-rotate": `hue-rotate(${v * 3.6}deg)`,
      none: "none",
    };
    ctx.filter = filterMap[activeFilter] || "none";
    ctx.drawImage(img, 0, 0);
    setResult(c.toDataURL("image/png"));
    setResultInfo({
      label: "Filter",
      value: `${FILTERS.find((f) => f.id === activeFilter)?.label} (${v}%)`,
    });
    setProcessing(false);
  };

  /* ── WATERMARK ── */
  const doWatermark = async () => {
    if (!imageFile || !wmText) return;
    setProcessing(true);
    const img = await getImg();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.font = `bold ${wmSize}px sans-serif`;
    ctx.fillStyle =
      wmColor +
      Math.round((wmOpacity / 100) * 255)
        .toString(16)
        .padStart(2, "0");
    ctx.strokeStyle = "rgba(0,0,0," + (wmOpacity / 100) * 0.5 + ")";
    ctx.lineWidth = 2;
    const tw = ctx.measureText(wmText).width;
    const pad = 24;
    const positions = {
      "top-left": [pad, wmSize + pad],
      "top-right": [c.width - tw - pad, wmSize + pad],
      center: [(c.width - tw) / 2, (c.height + wmSize) / 2],
      "bottom-left": [pad, c.height - pad],
      "bottom-right": [c.width - tw - pad, c.height - pad],
    };
    const [x, y] = positions[wmPos] || positions["bottom-right"];
    ctx.strokeText(wmText, x, y);
    ctx.fillText(wmText, x, y);
    setResult(c.toDataURL("image/png"));
    setResultInfo({ label: "Watermark", value: wmText });
    setProcessing(false);
  };

  /* ── Download ── */
  const download = () => {
    if (!result) return;
    const ext = tab === "compress" ? "jpg" : tab === "convert" ? format : "png";
    const a = document.createElement("a");
    a.href = result;
    a.download = `studio-${tab}.${ext}`;
    a.click();
  };

  /* ── Ratio Lock ── */
  const handleWidthChange = (v) => {
    setRWidth(v);
    if (keepRatio && origSize)
      setRHeight(String(Math.round((Number(v) / origSize.w) * origSize.h)));
  };
  const handleHeightChange = (v) => {
    setRHeight(v);
    if (keepRatio && origSize)
      setRWidth(String(Math.round((Number(v) / origSize.h) * origSize.w)));
  };

  const ACTIONS = {
    resize: doResize,
    compress: doCompress,
    convert: doConvert,
    crop: doCrop,
    rotate: doRotate,
    filter: doFilter,
    watermark: doWatermark,
  };

  return (
    <div className={styles.page}>
      {/* TOP BAR */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ← Back
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>✦</div>
          <span>Image Studio</span>
        </div>
        {origSize && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>
              {origSize.w} × {origSize.h} px
            </span>
            <span className={styles.statChip}>{origSize.kb} KB</span>
            <button
              className={styles.clearBtn}
              onClick={() => {
                setImageFile(null);
                setPreview(null);
                setResult(null);
                setOrigSize(null);
              }}
            >
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      <div className={styles.layoutTwo}>
        {/* LEFT: Upload + Preview */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Source Image</span>
          </div>

          <div
            className={`${styles.dropZone} ${isDrag ? styles.dropActive : ""} ${imageFile ? styles.dropHasFile : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDrag(true);
            }}
            onDragLeave={() => setIsDrag(false)}
            onDrop={handleDrop}
            onClick={() => !imageFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              hidden
            />
            {!imageFile ? (
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>🖼️</div>
                <p className={styles.dropText}>Drop image here</p>
                <span className={styles.dropSub}>or click to browse</span>
                <span className={styles.dropFormats}>
                  PNG · JPG · WEBP · BMP · GIF
                </span>
              </div>
            ) : (
              <img src={preview} className={styles.previewImg} alt="preview" />
            )}
          </div>

          {origSize && (
            <div className={styles.origInfo}>
              <div className={styles.infoChip}>
                <span>W</span>
                {origSize.w}px
              </div>
              <div className={styles.infoChip}>
                <span>H</span>
                {origSize.h}px
              </div>
              <div className={styles.infoChip}>
                <span>KB</span>
                {origSize.kb}
              </div>
            </div>
          )}

          {result && (
            <div className={styles.resultBox}>
              <div>
                <div className={styles.resultBadge}>
                  ✓ {resultInfo?.label}: {resultInfo?.value}
                </div>
                <img src={result} className={styles.resultImg} alt="result" />
              </div>
              <button className={styles.downloadBtn} onClick={download}>
                ↓ Download
              </button>
            </div>
          )}
        </aside>

        {/* RIGHT: Tabs + Controls */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div className={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ""}`}
                onClick={() => {
                  setTab(t.id);
                  setResult(null);
                }}
              >
                <span className={styles.tabIcon}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            <div className={styles.section}>
              {/* RESIZE */}
              {tab === "resize" && (
                <>
                  <h2 className={styles.sectionTitle}>⤢ Resize Image</h2>
                  <p className={styles.sectionDesc}>
                    Set exact pixel dimensions.
                  </p>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label>Width (px)</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={rWidth}
                        onChange={(e) => handleWidthChange(e.target.value)}
                      />
                    </div>
                    <div className={styles.fieldCenter}>
                      <button
                        className={`${styles.ratioBtn} ${keepRatio ? styles.ratioBtnOn : ""}`}
                        onClick={() => setKeepRatio((v) => !v)}
                        title="Lock aspect ratio"
                      >
                        {keepRatio ? "🔒" : "🔓"}
                      </button>
                    </div>
                    <div className={styles.field}>
                      <label>Height (px)</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={rHeight}
                        onChange={(e) => handleHeightChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles.presets}>
                    <span className={styles.presetsLabel}>Presets</span>
                    {[
                      ["HD", 1280, 720],
                      ["FHD", 1920, 1080],
                      ["4K", 3840, 2160],
                      ["Square", 800, 800],
                      ["Instagram", 1080, 1080],
                      ["Twitter", 1200, 675],
                      ["Thumb", 150, 150],
                    ].map(([l, w, h]) => (
                      <button
                        key={l}
                        className={styles.presetChip}
                        onClick={() => {
                          setRWidth(String(w));
                          setRHeight(String(h));
                          setKeepRatio(false);
                        }}
                      >
                        {l}{" "}
                        <span>
                          {w}×{h}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* COMPRESS */}
              {tab === "compress" && (
                <>
                  <h2 className={styles.sectionTitle}>⚡ Compress Image</h2>
                  <p className={styles.sectionDesc}>
                    Reduce file size while preserving quality.
                  </p>
                  <div className={styles.field}>
                    <label>
                      Target Size —{" "}
                      <strong className={styles.valLabel}>{targetKB} KB</strong>
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="2000"
                      step="10"
                      value={targetKB}
                      onChange={(e) => setTargetKB(Number(e.target.value))}
                      className={styles.slider}
                    />
                    <div className={styles.sliderLabels}>
                      <span>20 KB</span>
                      <span>2000 KB</span>
                    </div>
                  </div>
                  <div className={styles.presets}>
                    <span className={styles.presetsLabel}>Quick</span>
                    {[
                      [50, "50 KB"],
                      [100, "100 KB"],
                      [200, "200 KB"],
                      [500, "500 KB"],
                      [1000, "1 MB"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        className={`${styles.presetChip} ${targetKB === v ? styles.presetActive : ""}`}
                        onClick={() => setTargetKB(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* CONVERT */}
              {tab === "convert" && (
                <>
                  <h2 className={styles.sectionTitle}>↔ Convert Format</h2>
                  <p className={styles.sectionDesc}>
                    Convert to any popular image format.
                  </p>
                  <div className={styles.formatGrid}>
                    {FORMATS.map((f) => (
                      <button
                        key={f}
                        className={`${styles.formatChip} ${format === f ? styles.formatActive : ""}`}
                        onClick={() => setFormat(f)}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* CROP */}
              {tab === "crop" && (
                <>
                  <h2 className={styles.sectionTitle}>✂ Crop Image</h2>
                  <p className={styles.sectionDesc}>
                    Define region to crop from the source.
                  </p>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                      <label>Start X</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={cropX}
                        onChange={(e) => setCropX(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Start Y</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={cropY}
                        onChange={(e) => setCropY(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Width (px)</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={cropW}
                        onChange={(e) => setCropW(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Height (px)</label>
                      <input
                        className={styles.textInput}
                        type="number"
                        value={cropH}
                        onChange={(e) => setCropH(e.target.value)}
                      />
                    </div>
                  </div>
                  {origSize && (
                    <div className={styles.infoBox}>
                      <span>ℹ️</span>
                      <span>
                        Original size: {origSize.w} × {origSize.h} px. Start X+W
                        ≤ {origSize.w}, Start Y+H ≤ {origSize.h}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ROTATE */}
              {tab === "rotate" && (
                <>
                  <h2 className={styles.sectionTitle}>↻ Rotate & Flip</h2>
                  <p className={styles.sectionDesc}>
                    Rotate by any angle or mirror the image.
                  </p>
                  <div className={styles.field}>
                    <label>
                      Angle —{" "}
                      <strong className={styles.valLabel}>{angle}°</strong>
                    </label>
                    <div className={styles.angleRow}>
                      {[90, 180, 270, 45, -90, -45].map((a) => (
                        <button
                          key={a}
                          className={`${styles.angleChip} ${angle === a ? styles.angleActive : ""}`}
                          onClick={() => setAngle(a)}
                        >
                          {a}°
                        </button>
                      ))}
                      <input
                        className={styles.textInput}
                        type="number"
                        value={angle}
                        onChange={(e) => setAngle(Number(e.target.value))}
                        style={{ width: 70 }}
                      />
                    </div>
                  </div>
                  <div className={styles.flipRow}>
                    <button
                      className={`${styles.flipBtn} ${flipH ? styles.flipActive : ""}`}
                      onClick={() => setFlipH((v) => !v)}
                    >
                      ↔ Flip Horizontal
                    </button>
                    <button
                      className={`${styles.flipBtn} ${flipV ? styles.flipActive : ""}`}
                      onClick={() => setFlipV((v) => !v)}
                    >
                      ↕ Flip Vertical
                    </button>
                  </div>
                </>
              )}

              {/* FILTER */}
              {tab === "filter" && (
                <>
                  <h2 className={styles.sectionTitle}>✦ Image Filters</h2>
                  <p className={styles.sectionDesc}>
                    Apply artistic effects to your image.
                  </p>
                  <div className={styles.filterGrid}>
                    {FILTERS.map((f) => (
                      <button
                        key={f.id}
                        className={`${styles.filterChip} ${activeFilter === f.id ? styles.filterActive : ""}`}
                        onClick={() => setActiveFilter(f.id)}
                      >
                        {preview && (
                          <img
                            src={preview}
                            className={styles.filterThumb}
                            alt={f.label}
                            style={{
                              filter:
                                f.id !== "none"
                                  ? `${f.id}(${f.id === "blur" ? "4px" : "80%"})`
                                  : "none",
                            }}
                          />
                        )}
                        <span>{f.label}</span>
                      </button>
                    ))}
                  </div>
                  {activeFilter !== "none" && (
                    <div className={styles.sliderRow}>
                      <label>
                        Intensity:{" "}
                        <strong className={styles.valLabel}>
                          {filterVal}%
                        </strong>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={filterVal}
                        onChange={(e) => setFilterVal(Number(e.target.value))}
                        className={styles.slider}
                      />
                    </div>
                  )}
                </>
              )}

              {/* WATERMARK */}
              {tab === "watermark" && (
                <>
                  <h2 className={styles.sectionTitle}>◈ Add Watermark</h2>
                  <p className={styles.sectionDesc}>
                    Protect your image with a text watermark.
                  </p>
                  <div className={styles.field}>
                    <label>Text</label>
                    <input
                      className={styles.textInput}
                      type="text"
                      value={wmText}
                      onChange={(e) => setWmText(e.target.value)}
                      placeholder="© Your Name"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Color</label>
                    <div className={styles.colorRow}>
                      {[
                        "#ffffff",
                        "#000000",
                        "#ff0000",
                        "#ffff00",
                        "#00ff00",
                        "#0000ff",
                      ].map((c) => (
                        <button
                          key={c}
                          className={`${styles.colorSwatch} ${wmColor === c ? styles.colorActive : ""}`}
                          style={{ background: c }}
                          onClick={() => setWmColor(c)}
                        />
                      ))}
                      <input
                        type="color"
                        value={wmColor}
                        onChange={(e) => setWmColor(e.target.value)}
                        className={styles.colorPicker}
                      />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Position</label>
                    <div className={styles.posGrid}>
                      {[
                        "top-left",
                        "top-right",
                        "center",
                        "bottom-left",
                        "bottom-right",
                      ].map((p) => (
                        <button
                          key={p}
                          className={`${styles.posChip} ${wmPos === p ? styles.posActive : ""}`}
                          onClick={() => setWmPos(p)}
                        >
                          {p.replace("-", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                      <label>
                        Font Size:{" "}
                        <strong className={styles.valLabel}>{wmSize}px</strong>
                      </label>
                      <input
                        type="range"
                        min="12"
                        max="120"
                        value={wmSize}
                        onChange={(e) => setWmSize(Number(e.target.value))}
                        className={styles.slider}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>
                        Opacity:{" "}
                        <strong className={styles.valLabel}>
                          {wmOpacity}%
                        </strong>
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={wmOpacity}
                        onChange={(e) => setWmOpacity(Number(e.target.value))}
                        className={styles.slider}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ACTION */}
              {imageFile && (
                <button
                  className={`${styles.actionBtn} ${processing ? styles.actionBusy : ""}`}
                  onClick={ACTIONS[tab]}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <span className={styles.spinner} /> Processing…
                    </>
                  ) : (
                    <>
                      {TABS.find((t) => t.id === tab)?.icon} Apply{" "}
                      {TABS.find((t) => t.id === tab)?.label}
                    </>
                  )}
                </button>
              )}
              {!imageFile && (
                <div className={styles.noImageHint}>
                  ← Upload an image to get started
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
