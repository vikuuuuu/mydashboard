"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── PRESETS ──────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Govt Form 480×672", w: 480, h: 672, minKB: 50, maxKB: 300, dpi: 96, fmts: ["jpg", "jpeg"] },
  { label: "SSC/UPSC Photo", w: 200, h: 230, minKB: 10, maxKB: 50, dpi: 96, fmts: ["jpg", "jpeg"] },
  { label: "Passport Size", w: 413, h: 531, minKB: 20, maxKB: 100, dpi: 96, fmts: ["jpg", "jpeg"] },
  { label: "Visa Photo", w: 35, h: 45, minKB: 5, maxKB: 50, dpi: 300, fmts: ["jpg", "jpeg"] },
  { label: "Document Scan", w: 1200, h: 1600, minKB: 100, maxKB: 1000, dpi: 200, fmts: ["jpg", "jpeg", "png"] },
  { label: "Profile Photo", w: 400, h: 400, minKB: 20, maxKB: 200, dpi: 96, fmts: ["jpg", "jpeg", "png", "webp"] },
];

const ALL_FMTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "avif"];

const BG_SWATCHES = [
  { hex: "#ffffff", label: "White" },
  { hex: "#000000", label: "Black" },
  { hex: "#f0ece8", label: "Cream" },
  { hex: "#dce8f5", label: "Light Blue" },
  { hex: "#e8f5e9", label: "Light Green" },
];

const FILTERS = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invert" },
  { id: "brightness", label: "Bright" },
  { id: "contrast", label: "Contrast" },
  { id: "saturate", label: "Vivid" },
  { id: "vintage", label: "Vintage" },
  { id: "cool", label: "Cool" },
  { id: "warm", label: "Warm" },
];

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: "linear-gradient(160deg,#f8fbff 0%,#eef2ff 100%)", fontFamily: "'DM Sans',sans-serif", color: "#1a2147", display: "flex", flexDirection: "column" },
  topBar: { display: "flex", alignItems: "center", gap: 14, padding: "14px 32px", background: "#ffffff", borderBottom: "1px solid rgba(99,120,200,0.13)", boxShadow: "0 1px 4px rgba(67,97,238,0.07)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap" },
  brandIcon: { width: 34, height: 34, background: "#4361ee", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, flexShrink: 0, boxShadow: "0 4px 12px rgba(67,97,238,0.28)" },
  brand: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Syne',sans-serif", fontSize: "1.05rem", fontWeight: 800, color: "#1a2147", letterSpacing: "-0.02em" },
  backBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid rgba(99,120,200,0.22)", color: "#6b7ab5", fontSize: 13, fontWeight: 500, padding: "7px 16px", borderRadius: 999, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" },
  container: { maxWidth: 860, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  card: { background: "#fff", border: "1px solid rgba(99,120,200,0.13)", borderRadius: 14, overflow: "hidden" },
  cardHdr: { padding: "10px 16px", borderBottom: "1px solid rgba(99,120,200,0.10)", background: "#f4f7fe", display: "flex", alignItems: "center", gap: 8 },
  cardHdrTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7ab5" },
  cardBody: { padding: "16px" },
  label: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7ab5", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 },
  req: { color: "#e63946", fontSize: 11 },
  opt: { fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca8d0" },
  input: { width: "100%", padding: "8px 10px", border: "1.5px solid rgba(99,120,200,0.18)", borderRadius: 10, background: "#f4f7fe", color: "#1a2147", fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", boxSizing: "border-box" },
  select: { width: "100%", padding: "8px 10px", border: "1.5px solid rgba(99,120,200,0.18)", borderRadius: 10, background: "#f4f7fe", color: "#1a2147", fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", cursor: "pointer" },
  g2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  g3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  field: { display: "flex", flexDirection: "column" },
  chip: (on) => ({ padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.18)"}`, background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif" }),
  presetBtn: (on) => ({ padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.15)"}`, background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif" }),
  modeBtn: (on) => ({ padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.15)"}`, background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", flex: 1, textAlign: "center", fontFamily: "'DM Sans',sans-serif" }),
  swatch: (on, hex) => ({ width: 26, height: 26, borderRadius: "50%", background: hex, flexShrink: 0, border: on ? "2.5px solid #4361ee" : "1.5px solid rgba(99,120,200,0.22)", cursor: "pointer", transition: "all 0.15s", boxShadow: on ? "0 0 0 2px rgba(67,97,238,0.2)" : "none" }),
  colorPick: { width: 26, height: 26, borderRadius: "50%", border: "1.5px solid rgba(99,120,200,0.22)", padding: 0, cursor: "pointer", background: "none" },
  dropZone: (drag) => ({ border: `1.5px dashed ${drag ? "#4361ee" : "rgba(99,120,200,0.22)"}`, borderRadius: 12, minHeight: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", transition: "all 0.2s", padding: 16, textAlign: "center", background: drag ? "rgba(67,97,238,0.06)" : "#f4f7fe" }),
  previewBox: { background: "#f4f7fe", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 10, position: "relative" },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 },
  stat: { background: "#f4f7fe", borderRadius: 8, padding: "6px 8px", textAlign: "center" },
  statV: { fontSize: 13, fontWeight: 600, color: "#1a2147" },
  statL: { fontSize: 10, color: "#9ca8d0", marginTop: 1 },
  chkItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(99,120,200,0.08)" },
  chkLbl: { fontSize: 12, color: "#6b7ab5" },
  tag: (ok, na) => ({ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: na ? "#f4f7fe" : ok ? "rgba(15,157,110,0.10)" : "rgba(230,57,70,0.09)", color: na ? "#9ca8d0" : ok ? "#0f9d6e" : "#e63946" }),
  reqSummary: { background: "rgba(67,97,238,0.05)", border: "1px solid rgba(67,97,238,0.15)", borderRadius: 10, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "5px 14px", fontSize: 12, color: "#6b7ab5", marginTop: 12 },
  sumItem: { display: "flex", alignItems: "center", gap: 5 },
  sumVal: { fontWeight: 600, color: "#1a2147", fontFamily: "monospace", fontSize: 12 },
  progressWrap: { marginTop: 10 },
  progressTrack: { height: 4, background: "rgba(99,120,200,0.13)", borderRadius: 999, overflow: "hidden" },
  progressFill: (pct) => ({ height: "100%", background: "#4361ee", width: pct + "%", borderRadius: 999, transition: "width 0.3s" }),
  progLbl: { fontSize: 11, color: "#6b7ab5", marginTop: 4, textAlign: "center" },
  applyBtn: (dis) => ({ width: "100%", padding: 12, border: "none", borderRadius: 10, background: dis ? "#a8b4e8" : "#4361ee", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, cursor: dis ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s", marginTop: 12, boxShadow: dis ? "none" : "0 4px 14px rgba(67,97,238,0.28)" }),
  resultCard: { background: "rgba(15,157,110,0.06)", border: "1px solid rgba(15,157,110,0.22)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  resultImgBg: { background: "#f4f7fe", borderRadius: 10, display: "flex", justifyContent: "center", padding: 10 },
  resultMeta: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 },
  rMeta: { background: "#fff", border: "1px solid rgba(99,120,200,0.10)", borderRadius: 8, padding: "6px 8px", textAlign: "center" },
  rMetaV: { fontSize: 13, fontWeight: 600, color: "#0f9d6e" },
  rMetaL: { fontSize: 10, color: "#9ca8d0", marginTop: 1 },
  dlBtn: { padding: 10, border: "none", borderRadius: 10, background: "#0f9d6e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", fontFamily: "'Syne',sans-serif", transition: "opacity 0.15s" },
  alertWarn: { background: "rgba(247,127,0,0.08)", border: "1px solid rgba(247,127,0,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#c46200", display: "flex", alignItems: "flex-start", gap: 6 },
  alertInfo: { background: "rgba(67,97,238,0.07)", border: "1px solid rgba(67,97,238,0.18)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#4361ee", display: "flex", alignItems: "flex-start", gap: 6 },
  alertErr: { background: "rgba(230,57,70,0.07)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#e63946", display: "flex", alignItems: "flex-start", gap: 6 },
  divider: { height: 1, background: "rgba(99,120,200,0.10)", margin: "12px 0" },
  sectionMini: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca8d0", marginBottom: 8 },
  presetScroll: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 },
  fmtWrap: { display: "flex", flexWrap: "wrap", gap: 5 },
  spinner: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  changeLink: { background: "none", border: "none", color: "#4361ee", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  // Image Studio styles
  tabBar: { display: "flex", borderBottom: "1px solid rgba(99,120,200,0.13)", background: "#f4f7fe", overflowX: "auto", flexShrink: 0, scrollbarWidth: "thin" },
  tabBtn: (active) => ({ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px", border: "none", borderBottom: `2.5px solid ${active ? "#4361ee" : "transparent"}`, background: active ? "#ffffff" : "none", color: active ? "#4361ee" : "#6b7ab5", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }),
  sliderWrap: { display: "flex", flexDirection: "column", gap: 5 },
  slider: { WebkitAppearance: "none", appearance: "none", width: "100%", height: 5, borderRadius: 999, background: "rgba(99,120,200,0.18)", outline: "none", cursor: "pointer" },
  sliderLabels: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca8d0" },
  valLabel: { color: "#4361ee", fontFamily: "monospace", fontSize: 12 },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 },
  filterChip: (active) => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 4px", borderRadius: 8, border: `1.5px solid ${active ? "#4361ee" : "rgba(99,120,200,0.15)"}`, background: active ? "rgba(67,97,238,0.06)" : "#f4f7fe", color: active ? "#4361ee" : "#6b7ab5", fontSize: 10, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }),
  filterThumb: { width: "100%", height: 36, objectFit: "cover", borderRadius: 4 },
  historyBox: { background: "rgba(67,97,238,0.04)", border: "1px solid rgba(67,97,238,0.12)", borderRadius: 10, padding: "10px 12px", marginTop: 8 },
  histItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px", borderRadius: 6, marginBottom: 3, background: "#ffffff", border: "1px solid rgba(99,120,200,0.10)", fontSize: 11, color: "#6b7ab5", cursor: "pointer" },
  pipelineBox: { background: "rgba(67,97,238,0.04)", border: "1px solid rgba(67,97,238,0.15)", borderRadius: 10, padding: "10px 12px", marginTop: 8 },
  pipelineItem: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", border: "1px solid rgba(99,120,200,0.12)", borderRadius: 6, padding: "5px 8px", marginBottom: 4, fontSize: 12 },
  addPipelineBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "8px 10px", border: "1.5px dashed rgba(67,97,238,0.3)", borderRadius: 8, background: "rgba(67,97,238,0.03)", color: "#4361ee", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", marginTop: 6 },
  gradGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 },
  gradChip: (active) => ({ height: 44, borderRadius: 8, border: `2px solid ${active ? "#4361ee" : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4, fontSize: 10, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)", transition: "all 0.15s", boxShadow: active ? "0 0 0 3px rgba(67,97,238,0.2)" : "none" }),
  posGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 },
  posChip: (active) => ({ padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${active ? "#4361ee" : "rgba(99,120,200,0.15)"}`, background: active ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: active ? "#4361ee" : "#6b7ab5", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center", textTransform: "capitalize", transition: "all 0.15s" }),
};

const GRADIENTS = [
  { label: "Sunset", style: "linear-gradient(135deg,rgba(255,94,98,0.9),rgba(255,195,113,0.9))" },
  { label: "Ocean", style: "linear-gradient(135deg,rgba(0,180,219,0.9),rgba(0,131,176,0.9))" },
  { label: "Forest", style: "linear-gradient(135deg,rgba(34,193,195,0.9),rgba(45,149,48,0.9))" },
  { label: "Purple", style: "linear-gradient(135deg,rgba(155,93,229,0.9),rgba(67,97,238,0.9))" },
  { label: "Rose", style: "linear-gradient(135deg,rgba(241,91,181,0.9),rgba(230,57,70,0.9))" },
  { label: "Gold", style: "linear-gradient(135deg,rgba(247,127,0,0.9),rgba(254,212,0,0.9))" },
  { label: "Night", style: "linear-gradient(135deg,rgba(15,12,41,0.95),rgba(48,43,99,0.95))" },
  { label: "Mist", style: "linear-gradient(135deg,rgba(245,245,245,0.9),rgba(200,210,220,0.9))" },
];

const STUDIO_TABS = [
  { id: "adjust", icon: "◐", label: "Adjust" },
  { id: "filter", icon: "✦", label: "Filter" },
  { id: "crop", icon: "✂", label: "Crop" },
  { id: "rotate", icon: "↻", label: "Rotate" },
  { id: "watermark", icon: "◈", label: "Watermark" },
  { id: "text", icon: "T", label: "Text" },
  { id: "vignette", icon: "◉", label: "Vignette" },
  { id: "border", icon: "▢", label: "Border" },
  { id: "overlay", icon: "▤", label: "Overlay" },
  { id: "sharpen", icon: "🔬", label: "Sharpen" },
  { id: "denoise", icon: "✨", label: "Denoise" },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function GovtFormPhotoTool() {
  const router = useRouter();

  // ── Mode: "convert" or "studio" ──
  const [mode, setMode] = useState("convert");

  // Requirements
  const [reqW, setReqW] = useState("480");
  const [reqH, setReqH] = useState("672");
  const [reqMin, setReqMin] = useState("50");
  const [reqMax, setReqMax] = useState("300");
  const [reqUnit, setReqUnit] = useState("KB");
  const [reqDPI, setReqDPI] = useState("96");
  const [reqColor, setReqColor] = useState("rgb");
  const [reqFmts, setReqFmts] = useState(["jpg", "jpeg"]);
  const [formName, setFormName] = useState("");
  const [activePreset, setActivePreset] = useState(0);

  // Upload
  const [imgData, setImgData] = useState(null);
  const [isDrag, setIsDrag] = useState(false);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);

  // Convert options
  const [resizeMode, setResizeMode] = useState("contain");
  const [outFmt, setOutFmt] = useState("image/jpeg");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [compPct, setCompPct] = useState(0.5);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progLbl, setProgLbl] = useState("Processing…");
  const [result, setResult] = useState(null);
  const [formErr, setFormErr] = useState("");
  const [procErr, setProcErr] = useState("");

  // Studio tab + pipeline
  const [studioTab, setStudioTab] = useState("adjust");
  const [pipeline, setPipeline] = useState([]);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [studioResult, setStudioResult] = useState(null);

  // Studio controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [exposure, setExposure] = useState(0);
  const [activeFilter, setActiveFilter] = useState("none");
  const [filterVal, setFilterVal] = useState(80);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState("");
  const [cropH, setCropH] = useState("");
  const [angle, setAngle] = useState(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [wmText, setWmText] = useState("© My Photo");
  const [wmPos, setWmPos] = useState("bottom-right");
  const [wmSize, setWmSize] = useState(28);
  const [wmOpacity, setWmOpacity] = useState(70);
  const [wmColor, setWmColor] = useState("#ffffff");
  const [textContent, setTextContent] = useState("Hello");
  const [textPos, setTextPos] = useState("center");
  const [textSize, setTextSize] = useState(40);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textFont, setTextFont] = useState("sans-serif");
  const [textBg, setTextBg] = useState(false);
  const [vignetteStr, setVignetteStr] = useState(50);
  const [vignetteColor, setVignetteColor] = useState("#000000");
  const [borderSize, setBorderSize] = useState(16);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [borderStyle, setBorderStyle] = useState("solid");
  const [overlayGrad, setOverlayGrad] = useState(GRADIENTS[0].style);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [sharpenAmt, setSharpenAmt] = useState(50);
  const [denoiseLevel, setDenoiseLevel] = useState(3);

  const fileInputRef = useRef();

  // ── Helpers ──
  const getMinMaxKB = useCallback(() => {
    const min = parseFloat(reqMin) || 0, max = parseFloat(reqMax) || 0;
    if (reqUnit === "MB") return [min * 1024, max * 1024];
    if (reqUnit === "bytes") return [min / 1024, max / 1024];
    return [min, max];
  }, [reqMin, reqMax, reqUnit]);

  const validateReqs = () => {
    const w = parseInt(reqW), h = parseInt(reqH);
    if (!w || !h || w < 10 || h < 10) return "Width and height are required (min 10px).";
    const [mn, mx] = getMinMaxKB();
    if (!mn || !mx) return "Min and Max file size are required.";
    if (mn >= mx) return "Min size must be less than Max size.";
    if (reqFmts.length === 0) return "Select at least one allowed format.";
    return null;
  };

  const getChecks = () => {
    if (!imgData) return null;
    const [minKB, maxKB] = getMinMaxKB();
    const w = parseInt(reqW), h = parseInt(reqH);
    const ext = imgData.type.split("/")[1];
    return {
      resOk: imgData.w === w && imgData.h === h,
      szOk: imgData.kb >= minKB && imgData.kb <= maxKB,
      fmtOk: reqFmts.some(f => f === ext || (f === "jpg" && ext === "jpeg") || (f === "jpeg" && ext === "jpeg")),
    };
  };

  const checks = getChecks();

  const getImg = (url) => new Promise((res) => {
    const img = new window.Image(); img.crossOrigin = "anonymous";
    img.onload = () => res(img); img.src = url;
  });

  const pushHistory = (dataUrl, label) => {
    setHistory(h => [{ dataUrl, label, time: new Date().toLocaleTimeString() }, ...h.slice(0, 7)]);
  };

  // ── Load file ──
  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const err = mode === "convert" ? validateReqs() : null;
    if (err) { setFormErr("Fill in requirements first: " + err); return; }
    setFormErr("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        setImgData({ src: e.target.result, w: img.width, h: img.height, kb: file.size / 1024, type: file.type, name: file.name });
        setPreview(e.target.result);
        setCropW(String(img.width)); setCropH(String(img.height));
        setResult(null); setStudioResult(null); setHistory([]); setPipeline([]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadFile(e.dataTransfer.files?.[0]); };

  const applyPreset = (i) => {
    const p = PRESETS[i];
    setReqW(String(p.w)); setReqH(String(p.h));
    setReqMin(String(p.minKB)); setReqMax(String(p.maxKB));
    setReqUnit("KB"); setReqDPI(String(p.dpi));
    setReqFmts([...p.fmts]); setFormName(p.label); setActivePreset(i);
  };

  const toggleFmt = (f) => {
    setReqFmts(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    setActivePreset(null);
  };

  // ── Convert: build canvas ──
  const buildCanvas = (img) => {
    const w = parseInt(reqW), h = parseInt(reqH);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);
    if (resizeMode === "contain") {
      const sc = Math.min(w / img.width, h / img.height);
      const nw = img.width * sc, nh = img.height * sc;
      ctx.drawImage(img, (w - nw) / 2, (h - nh) / 2, nw, nh);
    } else {
      const sc = Math.max(w / img.width, h / img.height);
      const nw = img.width * sc, nh = img.height * sc;
      ctx.drawImage(img, (w - nw) / 2, (h - nh) / 2, nw, nh);
    }
    if (reqColor === "gray") {
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) {
        const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        d.data[i] = d.data[i + 1] = d.data[i + 2] = lum;
      }
      ctx.putImageData(d, 0, 0);
    }
    return c;
  };

  const smartCompress = (canvas) => {
    const [minKB, maxKB] = getMinMaxKB();
    const minB = minKB * 1024, maxB = maxKB * 1024;
    const midB = minB + (maxB - minB) * compPct;
    let lo = 0.05, hi = 0.99, best = null, iters = 0;
    while (iters < 16) {
      const q = (lo + hi) / 2;
      const data = canvas.toDataURL(outFmt, q);
      const bytes = Math.round((data.length - 22) / 4 * 3);
      if (bytes >= minB && bytes <= maxB) {
        if (!best || Math.abs(bytes - midB) < Math.abs(Math.round((best.length - 22) / 4 * 3) - midB)) best = data;
        if (bytes > midB) hi = q; else lo = q;
      } else if (bytes > maxB) { hi = q; } else { lo = q; }
      iters++;
    }
    if (!best) best = canvas.toDataURL(outFmt, (lo + hi) / 2);
    return { data: best, bytes: Math.round((best.length - 22) / 4 * 3) };
  };

  const handleProcess = async () => {
    const err = validateReqs();
    if (err) { setProcErr(err); return; }
    setProcErr(""); setProcessing(true); setProgress(0);
    await new Promise(r => setTimeout(r, 20));
    setProgress(15); setProgLbl("Loading image…");
    await new Promise(r => setTimeout(r, 40));
    const img = new window.Image();
    img.onload = async () => {
      setProgress(35); setProgLbl(`Resizing to ${reqW}×${reqH}…`);
      await new Promise(r => setTimeout(r, 40));
      const canvas = buildCanvas(img);
      setProgress(60); setProgLbl("Compressing…");
      await new Promise(r => setTimeout(r, 40));
      const { data, bytes } = smartCompress(canvas);
      const kb = bytes / 1024;
      setProgress(90); setProgLbl("Verifying…");
      await new Promise(r => setTimeout(r, 30));
      const ext = outFmt === "image/jpeg" ? "jpg" : outFmt === "image/png" ? "png" : "webp";
      const [minKB, maxKB] = getMinMaxKB();
      setResult({ data, kb, ext, w: parseInt(reqW), h: parseInt(reqH), inRange: kb >= minKB && kb <= maxKB, minKB, maxKB });
      setProgress(100); setProgLbl("Done!");
      setTimeout(() => { setProcessing(false); setProgress(0); }, 700);
    };
    img.src = preview || imgData.src;
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.data;
    a.download = `form-photo-${result.w}x${result.h}-${Date.now()}.${result.ext}`;
    a.click();
  };

  // ── Studio processors ──
  const studioProcessors = {
    async adjust(src) {
      const img = await getImg(src);
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img, 0, 0);
      if (exposure !== 0) {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const factor = exposure > 0 ? 1 + exposure / 100 : 1 / (1 - exposure / 100);
        for (let i = 0; i < d.data.length; i += 4)
          for (let ch = 0; ch < 3; ch++) d.data[i + ch] = Math.min(255, Math.max(0, d.data[i + ch] * factor));
        ctx.putImageData(d, 0, 0);
      }
      return c.toDataURL("image/png");
    },
    async filter(src) {
      const img = await getImg(src);
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      const v = filterVal;
      if (activeFilter === "vintage") {
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
          d.data[i] = Math.min(255, r * 0.9 + g * 0.3 + b * 0.1);
          d.data[i + 1] = Math.min(255, r * 0.3 + g * 0.7 + b * 0.1);
          d.data[i + 2] = Math.min(255, r * 0.1 + g * 0.1 + b * 0.6);
        }
        ctx.putImageData(d, 0, 0);
      } else if (activeFilter === "cool") {
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.max(0, d.data[i] - 20); d.data[i + 2] = Math.min(255, d.data[i + 2] + 30); }
        ctx.putImageData(d, 0, 0);
      } else if (activeFilter === "warm") {
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.min(255, d.data[i] + 30); d.data[i + 2] = Math.max(0, d.data[i + 2] - 20); }
        ctx.putImageData(d, 0, 0);
      } else {
        const map = { grayscale: `grayscale(${v}%)`, sepia: `sepia(${v}%)`, invert: `invert(${v}%)`, brightness: `brightness(${v + 50}%)`, contrast: `contrast(${v + 50}%)`, saturate: `saturate(${v * 3}%)`, none: "none" };
        ctx.filter = map[activeFilter] || "none"; ctx.drawImage(img, 0, 0);
      }
      return c.toDataURL("image/png");
    },
    async crop(src) {
      const img = await getImg(src);
      const c = document.createElement("canvas");
      c.width = Number(cropW); c.height = Number(cropH);
      c.getContext("2d").drawImage(img, Number(cropX), Number(cropY), Number(cropW), Number(cropH), 0, 0, Number(cropW), Number(cropH));
      return c.toDataURL("image/png");
    },
    async rotate(src) {
      const img = await getImg(src);
      const rad = (angle * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
      const c = document.createElement("canvas");
      c.width = img.width * cos + img.height * sin;
      c.height = img.width * sin + img.height * cos;
      const ctx = c.getContext("2d");
      ctx.translate(c.width / 2, c.height / 2); ctx.rotate(rad);
      if (flipH) ctx.scale(-1, 1); if (flipV) ctx.scale(1, -1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      return c.toDataURL("image/png");
    },
    async watermark(src) {
      if (!wmText) return src;
      const img = await getImg(src);
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      ctx.font = `bold ${wmSize}px sans-serif`;
      ctx.fillStyle = wmColor + Math.round((wmOpacity / 100) * 255).toString(16).padStart(2, "0");
      const tw = ctx.measureText(wmText).width, pad = 20;
      const pos = { "top-left": [pad, wmSize + pad], "top-right": [c.width - tw - pad, wmSize + pad], "center": [(c.width - tw) / 2, (c.height + wmSize) / 2], "bottom-left": [pad, c.height - pad], "bottom-right": [c.width - tw - pad, c.height - pad] };
      const [x, y] = pos[wmPos] || pos["bottom-right"];
      ctx.strokeStyle = `rgba(0,0,0,${(wmOpacity / 100) * 0.4})`; ctx.lineWidth = 2;
      ctx.strokeText(wmText, x, y); ctx.fillText(wmText, x, y);
      return c.toDataURL("image/png");
    },
    async text(src) {
      if (!textContent) return src;
      const img = await getImg(src);
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      ctx.font = `bold ${textSize}px ${textFont}`;
      const tw = ctx.measureText(textContent).width, pad = 16;
      const pos = { "top-left": [pad, textSize + pad], "top-right": [c.width - tw - pad, textSize + pad], "center": [(c.width - tw) / 2, (c.height + textSize) / 2], "bottom-left": [pad, c.height - pad], "bottom-right": [c.width - tw - pad, c.height - pad] };
      const [x, y] = pos[textPos] || pos["center"];
      if (textBg) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 6, y - textSize - 2, tw + 12, textSize + 10); }
      ctx.fillStyle = textColor; ctx.fillText(textContent, x, y);
      return c.toDataURL("image/png");
    },
    async vignette(src) {
      const img = await getImg(src);
      const W = img.width, H = img.height;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
      const alpha = vignetteStr / 100;
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, vignetteColor === "#000000" ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      return c.toDataURL("image/png");
    },
    async border(src) {
      const img = await getImg(src);
      const pad = borderSize, W = img.width + pad * 2, H = img.height + pad * 2;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      if (borderStyle === "polaroid") {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, pad, pad);
      } else if (borderStyle === "shadow") {
        ctx.fillStyle = "#f0f0f0"; ctx.fillRect(0, 0, W, H);
        ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = pad; ctx.shadowOffsetX = pad * 0.3; ctx.shadowOffsetY = pad * 0.3;
        ctx.drawImage(img, pad, pad);
      } else if (borderStyle === "glow") {
        ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
        ctx.shadowColor = borderColor; ctx.shadowBlur = pad * 1.5;
        ctx.drawImage(img, pad, pad);
      } else {
        ctx.fillStyle = borderColor; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, pad, pad);
      }
      return c.toDataURL("image/png");
    },
    async overlay(src) {
      const img = await getImg(src);
      const W = img.width, H = img.height;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = overlayOpacity / 100;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      const cm = overlayGrad.match(/rgba?\([^)]+\)/g) || [];
      if (cm.length >= 2) { grad.addColorStop(0, cm[0].replace(/[\d.]+\)$/, "1)")); grad.addColorStop(1, cm[1].replace(/[\d.]+\)$/, "1)")); }
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      return c.toDataURL("image/png");
    },
    async sharpen(src) {
      const img = await getImg(src);
      const W = img.width, H = img.height;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const orig = ctx.getImageData(0, 0, W, H);
      const blurC = document.createElement("canvas"); blurC.width = W; blurC.height = H;
      const bCtx = blurC.getContext("2d"); bCtx.filter = "blur(1px)"; bCtx.drawImage(img, 0, 0);
      const blurred = bCtx.getImageData(0, 0, W, H);
      const amt = sharpenAmt / 100;
      const res = ctx.createImageData(W, H);
      for (let i = 0; i < orig.data.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) res.data[i + ch] = Math.min(255, Math.max(0, orig.data[i + ch] + amt * (orig.data[i + ch] - blurred.data[i + ch])));
        res.data[i + 3] = 255;
      }
      ctx.putImageData(res, 0, 0);
      return c.toDataURL("image/png");
    },
    async denoise(src) {
      const img = await getImg(src);
      const W = img.width, H = img.height;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.filter = `blur(${denoiseLevel * 0.4}px)`; ctx.drawImage(img, 0, 0);
      return c.toDataURL("image/png");
    },
  };

  const applyStudioTab = async () => {
    if (!preview) return;
    setProcessing(true);
    try {
      const fn = studioProcessors[studioTab];
      if (!fn) return;
      const out = await fn(preview);
      pushHistory(preview, studioTab);
      setPreview(out); setStudioResult(out);
    } finally { setProcessing(false); }
  };

  const addToPipeline = () => setPipeline(p => [...p, { id: Date.now(), tab: studioTab, label: STUDIO_TABS.find(t => t.id === studioTab)?.label || studioTab }]);

  const runPipeline = async () => {
    if (!imgData || pipeline.length === 0) return;
    setPipelineRunning(true);
    let src = preview;
    try {
      for (const step of pipeline) {
        const fn = studioProcessors[step.tab];
        if (fn) src = await fn(src);
      }
      pushHistory(preview, "pipeline");
      setPreview(src); setStudioResult(src);
    } finally { setPipelineRunning(false); }
  };

  const undo = () => {
    if (!history.length) return;
    const [last, ...rest] = history;
    setPreview(last.dataUrl); setStudioResult(null); setHistory(rest);
  };

  const downloadStudio = () => {
    if (!studioResult) return;
    const a = document.createElement("a"); a.href = studioResult; a.download = `edited-photo-${Date.now()}.png`; a.click();
  };

  // ── SliderField helper ──
  const SliderField = ({ label, val, min, max, step = 1, onChange, left, right, unit = "" }) => (
    <div style={S.sliderWrap}>
      <span style={S.label}>{label} — <span style={S.valLabel}>{val}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(Number(e.target.value))} style={S.slider} />
      {(left || right) && <div style={S.sliderLabels}><span>{left}</span><span>{right}</span></div>}
    </div>
  );

  const [minKB, maxKB] = getMinMaxKB();

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]:focus, input[type=text]:focus, select:focus { border-color: #4361ee !important; box-shadow: 0 0 0 3px rgba(67,97,238,0.10) !important; background: #fff !important; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #4361ee; box-shadow: 0 2px 6px rgba(67,97,238,0.3); cursor: pointer; }
        .back-btn:hover { border-color: #4361ee !important; color: #4361ee !important; background: rgba(67,97,238,0.06) !important; }
        .preset-btn:hover { border-color: #4361ee !important; color: #4361ee !important; background: rgba(67,97,238,0.06) !important; }
        .dl-btn:hover { opacity: 0.88; }
        .apply-btn:not([disabled]):hover { opacity: 0.9; transform: translateY(-1px); }
        .add-pipeline-btn:hover { background: rgba(67,97,238,0.08) !important; }
        @media (max-width: 560px) {
          .g2 { grid-template-columns: 1fr !important; }
          .g3 { grid-template-columns: 1fr 1fr !important; }
          .rmeta-grid { grid-template-columns: 1fr 1fr !important; }
          .filter-grid { grid-template-columns: repeat(4,1fr) !important; }
        }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={S.topBar}>
        <button className="back-btn" style={S.backBtn} onClick={() => router.push("/dashboard")}>
          ← Back to Dashboard
        </button>
        <div style={S.brand}>
          <div style={S.brandIcon}>🖼</div>
          <span>Form Photo Converter</span>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <button style={S.presetBtn(mode === "convert")} onClick={() => setMode("convert")}>📋 Convert</button>
          <button style={S.presetBtn(mode === "studio")} onClick={() => setMode("studio")}>🎨 Studio</button>
        </div>

        {imgData && mode === "studio" && (
          <>
            <button style={{ ...S.chip(pipelineMode), fontSize: 11, padding: "4px 12px" }} onClick={() => setPipelineMode(m => !m)}>
              ⛓ Pipeline {pipelineMode ? "ON" : "OFF"}
            </button>
            {history.length > 0 && (
              <button style={{ ...S.alertErr, cursor: "pointer", padding: "4px 10px", borderRadius: 999, fontSize: 11 }} onClick={undo}>
                ↩ Undo ({history.length})
              </button>
            )}
          </>
        )}

        {imgData && (
          <button style={{ marginLeft: "auto", ...S.alertErr, cursor: "pointer", padding: "4px 10px", borderRadius: 999, fontSize: 11, border: "1px solid rgba(230,57,70,0.2)" }}
            onClick={() => { setImgData(null); setPreview(null); setResult(null); setStudioResult(null); setHistory([]); setPipeline([]); fileInputRef.current.value = ""; }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div style={S.container}>

        {/* ══════════════ CONVERT MODE ══════════════ */}
        {mode === "convert" && <>

          {/* STEP 1 */}
          <div style={S.card}>
            <div style={S.cardHdr}><span>📋</span><span style={S.cardHdrTitle}>Step 1 — Set Photo Requirements</span></div>
            <div style={S.cardBody}>

              <div style={S.sectionMini}>Quick presets</div>
              <div style={S.presetScroll}>
                {PRESETS.map((p, i) => (
                  <button key={i} className="preset-btn" style={S.presetBtn(activePreset === i)} onClick={() => applyPreset(i)}>{p.label}</button>
                ))}
              </div>

              <div style={S.divider} />
              <div style={{ ...S.sectionMini, marginTop: 12 }}>Or enter custom requirements</div>

              <div className="g2" style={{ ...S.g2, marginBottom: 12 }}>
                <div style={S.field}><span style={S.label}>Width (px) <span style={S.req}>*</span></span><input style={S.input} type="number" value={reqW} min={10} max={10000} placeholder="e.g. 480" onChange={e => { setReqW(e.target.value); setActivePreset(null); }} /></div>
                <div style={S.field}><span style={S.label}>Height (px) <span style={S.req}>*</span></span><input style={S.input} type="number" value={reqH} min={10} max={10000} placeholder="e.g. 672" onChange={e => { setReqH(e.target.value); setActivePreset(null); }} /></div>
              </div>

              <div className="g3" style={{ ...S.g3, marginBottom: 12 }}>
                <div style={S.field}><span style={S.label}>Min size <span style={S.req}>*</span></span><input style={S.input} type="number" value={reqMin} min={1} placeholder="50" onChange={e => { setReqMin(e.target.value); setActivePreset(null); }} /></div>
                <div style={S.field}><span style={S.label}>Max size <span style={S.req}>*</span></span><input style={S.input} type="number" value={reqMax} min={1} placeholder="300" onChange={e => { setReqMax(e.target.value); setActivePreset(null); }} /></div>
                <div style={S.field}><span style={S.label}>Unit</span><select style={S.select} value={reqUnit} onChange={e => { setReqUnit(e.target.value); setActivePreset(null); }}><option value="KB">KB</option><option value="MB">MB</option><option value="bytes">Bytes</option></select></div>
              </div>

              <div className="g2" style={{ ...S.g2, marginBottom: 12 }}>
                <div style={S.field}><span style={S.label}>DPI <span style={S.opt}>(optional)</span></span><input style={S.input} type="number" value={reqDPI} min={72} max={600} placeholder="96" onChange={e => setReqDPI(e.target.value)} /></div>
                <div style={S.field}><span style={S.label}>Color mode</span><select style={S.select} value={reqColor} onChange={e => setReqColor(e.target.value)}><option value="rgb">RGB (Color)</option><option value="gray">Grayscale</option></select></div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={S.label}>Allowed formats <span style={S.req}>*</span></span>
                <div style={S.fmtWrap}>{ALL_FMTS.map(f => <button key={f} style={S.chip(reqFmts.includes(f))} onClick={() => toggleFmt(f)}>{f.toUpperCase()}</button>)}</div>
              </div>

              <div style={S.field}><span style={S.label}>Form / Exam name <span style={S.opt}>(optional)</span></span><input style={S.input} type="text" value={formName} placeholder="e.g. UPSC CSE 2025 Application" onChange={e => setFormName(e.target.value)} /></div>

              {formErr && <div style={{ ...S.alertErr, marginTop: 10 }}>⚠ {formErr}</div>}

              {!validateReqs() && (
                <div style={S.reqSummary}>
                  <span style={S.sumItem}>📐 <span style={S.sumVal}>{reqW} × {reqH} px</span></span>
                  <span style={S.sumItem}>💾 <span style={S.sumVal}>{reqMin}–{reqMax} {reqUnit}</span></span>
                  <span style={S.sumItem}>🖨 <span style={S.sumVal}>{reqDPI} DPI</span></span>
                  <span style={S.sumItem}>📄 <span style={S.sumVal}>{reqFmts.map(f => f.toUpperCase()).join(", ")}</span></span>
                  <span style={S.sumItem}>🎨 <span style={S.sumVal}>{reqColor === "rgb" ? "RGB" : "Grayscale"}</span></span>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2 */}
          <div style={S.card}>
            <div style={S.cardHdr}><span>📤</span><span style={S.cardHdrTitle}>Step 2 — Upload Your Photo</span></div>
            <div style={S.cardBody}>
              {!imgData ? (
                <div style={S.dropZone(isDrag)} onDragOver={e => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                  <span style={{ fontSize: 32 }}>🖼️</span>
                  <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "#1a2147", margin: 0 }}>Drop photo here or click to browse</p>
                  <small style={{ fontSize: 11, color: "#9ca8d0" }}>{reqFmts.length > 0 ? reqFmts.map(f => f.toUpperCase()).join(" · ") : "JPG · PNG · WEBP · BMP · GIF"}</small>
                </div>
              ) : (
                <>
                  <div style={S.previewBox}>
                    <img src={preview} alt="preview" style={{ maxHeight: 180, objectFit: "contain", borderRadius: 8 }} />
                    <span style={{ fontSize: 11, color: "#9ca8d0", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imgData.name}</span>
                    <button style={S.changeLink} onClick={() => { setImgData(null); setPreview(null); setResult(null); fileInputRef.current.value = ""; }}>Change photo</button>
                  </div>
                  <div style={S.statGrid}>
                    <div style={S.stat}><div style={S.statV}>{imgData.w}px</div><div style={S.statL}>Width</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.h}px</div><div style={S.statL}>Height</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.kb.toFixed(1)} KB</div><div style={S.statL}>Size</div></div>
                  </div>
                  {checks && (
                    <div style={{ marginTop: 10 }}>
                      {[{ lbl: "Resolution", ok: checks.resOk }, { lbl: "File size", ok: checks.szOk }, { lbl: "Format", ok: checks.fmtOk }].map(({ lbl, ok }) => (
                        <div key={lbl} style={S.chkItem}><span style={S.chkLbl}>{lbl}</span><span style={S.tag(ok, false)}>{ok ? "✓ Meets requirement" : "✗ Needs adjustment"}</span></div>
                      ))}
                    </div>
                  )}
                  {checks && (!checks.resOk || !checks.szOk || !checks.fmtOk) && (
                    <div style={{ ...S.alertWarn, marginTop: 10 }}>
                      ⚠ {[!checks.resOk && `Resolution (${imgData.w}×${imgData.h}) → ${reqW}×${reqH}.`, !checks.szOk && `Size (${imgData.kb.toFixed(0)} KB) → ${reqMin}–${reqMax} ${reqUnit}.`, !checks.fmtOk && `Format → selected output format.`].filter(Boolean).join(" ")}
                    </div>
                  )}
                  {checks && checks.resOk && checks.szOk && checks.fmtOk && (
                    <div style={{ ...S.alertInfo, marginTop: 10 }}>✓ Already meets all requirements! Will still re-export cleanly.</div>
                  )}
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => loadFile(e.target.files?.[0])} />
            </div>
          </div>

          {/* STEP 3 */}
          <div style={S.card}>
            <div style={S.cardHdr}><span>⚙️</span><span style={S.cardHdrTitle}>Step 3 — Processing Options</span></div>
            <div style={S.cardBody}>
              <div className="g2" style={{ ...S.g2, marginBottom: 14 }}>
                <div style={S.field}>
                  <span style={S.label}>Resize mode</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={S.modeBtn(resizeMode === "contain")} onClick={() => setResizeMode("contain")}>Contain</button>
                    <button style={S.modeBtn(resizeMode === "cover")} onClick={() => setResizeMode("cover")}>Cover</button>
                  </div>
                  <small style={{ fontSize: 10, color: "#9ca8d0", marginTop: 4 }}>Contain = fit + fill bg &nbsp;|&nbsp; Cover = crop to fill</small>
                </div>
                <div style={S.field}>
                  <span style={S.label}>Output format</span>
                  <select style={S.select} value={outFmt} onChange={e => setOutFmt(e.target.value)}>
                    <option value="image/jpeg">JPG / JPEG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WEBP</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <span style={S.label}>Background color <span style={S.opt}>(contain mode)</span></span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {BG_SWATCHES.map(sw => <button key={sw.hex} title={sw.label} style={S.swatch(bgColor === sw.hex, sw.hex)} onClick={() => setBgColor(sw.hex)} />)}
                  <input type="color" style={S.colorPick} value={bgColor} onChange={e => setBgColor(e.target.value)} title="Custom" />
                  <span style={{ fontSize: 11, color: "#9ca8d0", fontFamily: "monospace" }}>{bgColor}</span>
                </div>
              </div>

              <div style={{ marginBottom: 4 }}>
                <span style={S.label}>Compression target</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[["Lightest", 0.2], ["Balanced", 0.5], ["High quality", 0.75], ["Max quality", 0.9]].map(([lbl, pct]) => (
                    <button key={lbl} className="preset-btn" style={S.presetBtn(compPct === pct)} onClick={() => setCompPct(pct)}>{lbl}</button>
                  ))}
                </div>
                {reqMin && reqMax && <small style={{ fontSize: 10, color: "#9ca8d0", marginTop: 4, display: "block" }}>Target within {reqMin}–{reqMax} {reqUnit}</small>}
              </div>

              {processing && (
                <div style={S.progressWrap}>
                  <div style={S.progressTrack}><div style={S.progressFill(progress)} /></div>
                  <div style={S.progLbl}>{progLbl}</div>
                </div>
              )}
              {procErr && <div style={{ ...S.alertErr, marginTop: 8 }}>⚠ {procErr}</div>}

              <button style={S.applyBtn(!imgData || processing)} className="apply-btn" disabled={!imgData || processing} onClick={handleProcess}>
                {processing ? <><span style={S.spinner} /> {progLbl}</> : <>🪄 {formName ? `Convert for "${formName}"` : "Convert & Download"}</>}
              </button>
            </div>
          </div>

          {/* RESULT */}
          {result && (
            <div style={S.resultCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <span style={{ fontWeight: 700, color: "#0f9d6e", fontSize: 14, fontFamily: "'Syne',sans-serif" }}>
                  {formName ? `"${formName}" — Ready for submission!` : "Photo ready for submission!"}
                </span>
              </div>
              <div style={S.resultImgBg}><img src={result.data} alt="Processed" style={{ maxHeight: 220, objectFit: "contain", borderRadius: 8 }} /></div>
              <div className="rmeta-grid" style={S.resultMeta}>
                <div style={S.rMeta}><div style={S.rMetaV}>{result.w} × {result.h}</div><div style={S.rMetaL}>Dimensions</div></div>
                <div style={S.rMeta}><div style={S.rMetaV}>{result.kb.toFixed(1)} KB</div><div style={S.rMetaL}>File size</div></div>
                <div style={S.rMeta}><div style={S.rMetaV}>{result.ext.toUpperCase()}</div><div style={S.rMetaL}>Format</div></div>
              </div>
              {!result.inRange && <div style={S.alertWarn}>⚠ Output ({result.kb.toFixed(1)} KB) slightly outside {result.minKB}–{result.maxKB} KB. Try PNG or adjust compression.</div>}
              <button className="dl-btn" style={S.dlBtn} onClick={handleDownload}>↓ Download ({result.ext.toUpperCase()})</button>
            </div>
          )}
        </>}

        {/* ══════════════ STUDIO MODE ══════════════ */}
        {mode === "studio" && (
          <div style={S.card}>
            <div style={S.cardHdr}><span>🎨</span><span style={S.cardHdrTitle}>Image Studio — Edit & Enhance</span></div>

            {/* Upload if no image */}
            {!imgData && (
              <div style={{ padding: 16 }}>
                <div style={S.dropZone(isDrag)} onDragOver={e => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                  <span style={{ fontSize: 32 }}>🖼️</span>
                  <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "#1a2147", margin: 0 }}>Drop image to edit</p>
                  <small style={{ fontSize: 11, color: "#9ca8d0" }}>JPG · PNG · WEBP · BMP · GIF</small>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => loadFile(e.target.files?.[0])} />
              </div>
            )}

            {imgData && (
              <>
                {/* Preview */}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ ...S.previewBox, padding: 8 }}>
                    <img src={preview} alt="preview" style={{ maxHeight: 200, objectFit: "contain", borderRadius: 8, width: "100%" }} />
                  </div>
                  <div style={S.statGrid}>
                    <div style={S.stat}><div style={S.statV}>{imgData.w}px</div><div style={S.statL}>Width</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.h}px</div><div style={S.statL}>Height</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.kb.toFixed(1)} KB</div><div style={S.statL}>Original</div></div>
                  </div>
                </div>

                {/* Tab bar */}
                <div style={S.tabBar}>
                  {STUDIO_TABS.map(t => (
                    <button key={t.id} style={S.tabBtn(studioTab === t.id)} onClick={() => setStudioTab(t.id)}>
                      <span>{t.icon}</span><span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab controls */}
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                  {studioTab === "adjust" && <>
                    <SliderField label="Brightness" val={brightness} min={10} max={300} onChange={setBrightness} unit="%" left="Dark" right="Bright" />
                    <SliderField label="Contrast" val={contrast} min={10} max={300} onChange={setContrast} unit="%" left="Flat" right="Punchy" />
                    <SliderField label="Saturation" val={saturation} min={0} max={300} onChange={setSaturation} unit="%" left="B&W" right="Vivid" />
                    <SliderField label="Exposure" val={exposure} min={-80} max={80} onChange={setExposure} left="-80" right="+80" />
                    <button style={S.chip(false)} onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setExposure(0); }}>↺ Reset</button>
                  </>}

                  {studioTab === "filter" && <>
                    <div className="filter-grid" style={S.filterGrid}>
                      {FILTERS.map(f => (
                        <button key={f.id} style={S.filterChip(activeFilter === f.id)} onClick={() => setActiveFilter(f.id)}>
                          {preview && <img src={preview} style={{ ...S.filterThumb, filter: f.id === "none" ? "none" : f.id === "vintage" ? "sepia(60%) contrast(110%)" : f.id === "cool" ? "hue-rotate(200deg) saturate(120%)" : f.id === "warm" ? "sepia(30%) saturate(130%)" : `${f.id}(80%)` }} alt={f.label} />}
                          <span>{f.label}</span>
                        </button>
                      ))}
                    </div>
                    {activeFilter !== "none" && <SliderField label="Intensity" val={filterVal} min={0} max={100} onChange={setFilterVal} unit="%" />}
                  </>}

                  {studioTab === "crop" && <>
                    <div className="g2" style={S.g2}>
                      <div style={S.field}><span style={S.label}>Start X</span><input style={S.input} type="number" value={cropX} onChange={e => setCropX(e.target.value)} /></div>
                      <div style={S.field}><span style={S.label}>Start Y</span><input style={S.input} type="number" value={cropY} onChange={e => setCropY(e.target.value)} /></div>
                      <div style={S.field}><span style={S.label}>Width</span><input style={S.input} type="number" value={cropW} onChange={e => setCropW(e.target.value)} /></div>
                      <div style={S.field}><span style={S.label}>Height</span><input style={S.input} type="number" value={cropH} onChange={e => setCropH(e.target.value)} /></div>
                    </div>
                    <div style={S.alertInfo}>ℹ Image is {imgData.w}×{imgData.h}px</div>
                  </>}

                  {studioTab === "rotate" && <>
                    <div style={S.field}>
                      <span style={S.label}>Angle — <span style={S.valLabel}>{angle}°</span></span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {[90, 180, 270, 45, -90, -45].map(a => <button key={a} style={S.chip(angle === a)} onClick={() => setAngle(a)}>{a}°</button>)}
                        <input style={{ ...S.input, width: 70 }} type="number" value={angle} onChange={e => setAngle(Number(e.target.value))} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ ...S.modeBtn(flipH), flex: 1 }} onClick={() => setFlipH(v => !v)}>↔ Flip H</button>
                      <button style={{ ...S.modeBtn(flipV), flex: 1 }} onClick={() => setFlipV(v => !v)}>↕ Flip V</button>
                    </div>
                  </>}

                  {studioTab === "watermark" && <>
                    <div style={S.field}><span style={S.label}>Text</span><input style={S.input} type="text" value={wmText} onChange={e => setWmText(e.target.value)} placeholder="© Your Name" /></div>
                    <div style={S.field}>
                      <span style={S.label}>Position</span>
                      <div style={S.posGrid}>
                        {["top-left", "top-right", "center", "bottom-left", "bottom-right"].map(p => (
                          <button key={p} style={S.posChip(wmPos === p)} onClick={() => setWmPos(p)}>{p.replace("-", " ")}</button>
                        ))}
                      </div>
                    </div>
                    <div style={S.field}><span style={S.label}>Color</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {["#ffffff", "#000000", "#ff0000", "#ffff00", "#4361ee"].map(c => <button key={c} style={S.swatch(wmColor === c, c)} onClick={() => setWmColor(c)} />)}
                        <input type="color" style={S.colorPick} value={wmColor} onChange={e => setWmColor(e.target.value)} />
                      </div>
                    </div>
                    <SliderField label="Font size" val={wmSize} min={12} max={120} onChange={setWmSize} unit="px" />
                    <SliderField label="Opacity" val={wmOpacity} min={10} max={100} onChange={setWmOpacity} unit="%" />
                  </>}

                  {studioTab === "text" && <>
                    <div style={S.field}><span style={S.label}>Text</span><input style={S.input} type="text" value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Your text" /></div>
                    <div style={S.field}><span style={S.label}>Font</span>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {["sans-serif", "serif", "monospace", "cursive"].map(f => <button key={f} style={S.chip(textFont === f)} onClick={() => setTextFont(f)}>{f}</button>)}
                      </div>
                    </div>
                    <div style={S.field}><span style={S.label}>Color</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {["#ffffff", "#000000", "#ff0000", "#ffff00", "#4361ee"].map(c => <button key={c} style={S.swatch(textColor === c, c)} onClick={() => setTextColor(c)} />)}
                        <input type="color" style={S.colorPick} value={textColor} onChange={e => setTextColor(e.target.value)} />
                      </div>
                    </div>
                    <div style={S.field}>
                      <span style={S.label}>Position</span>
                      <div style={S.posGrid}>
                        {["top-left", "top-right", "center", "bottom-left", "bottom-right"].map(p => (
                          <button key={p} style={S.posChip(textPos === p)} onClick={() => setTextPos(p)}>{p.replace("-", " ")}</button>
                        ))}
                      </div>
                    </div>
                    <SliderField label="Font size" val={textSize} min={14} max={200} onChange={setTextSize} unit="px" />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#6b7ab5" }}>
                      <input type="checkbox" checked={textBg} onChange={e => setTextBg(e.target.checked)} style={{ accentColor: "#4361ee" }} />
                      Dark background behind text
                    </label>
                  </>}

                  {studioTab === "vignette" && <>
                    <SliderField label="Strength" val={vignetteStr} min={10} max={95} onChange={setVignetteStr} unit="%" />
                    <div style={S.field}><span style={S.label}>Color</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={S.modeBtn(vignetteColor === "#000000")} onClick={() => setVignetteColor("#000000")}>🌑 Dark</button>
                        <button style={S.modeBtn(vignetteColor === "#ffffff")} onClick={() => setVignetteColor("#ffffff")}>⬜ Light</button>
                      </div>
                    </div>
                  </>}

                  {studioTab === "border" && <>
                    <div style={S.field}><span style={S.label}>Style</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["solid", "shadow", "glow", "polaroid"].map(s => <button key={s} style={S.chip(borderStyle === s)} onClick={() => setBorderStyle(s)}>{s}</button>)}
                      </div>
                    </div>
                    <SliderField label="Size" val={borderSize} min={5} max={100} onChange={setBorderSize} unit="px" />
                    {(borderStyle === "solid" || borderStyle === "glow") && (
                      <div style={S.field}><span style={S.label}>Color</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {["#ffffff", "#000000", "#4361ee", "#e63946", "#f77f00"].map(c => <button key={c} style={S.swatch(borderColor === c, c)} onClick={() => setBorderColor(c)} />)}
                          <input type="color" style={S.colorPick} value={borderColor} onChange={e => setBorderColor(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </>}

                  {studioTab === "overlay" && <>
                    <div style={S.field}><span style={S.label}>Gradient</span>
                      <div style={S.gradGrid}>
                        {GRADIENTS.map(g => (
                          <button key={g.label} style={{ ...S.gradChip(overlayGrad === g.style), background: g.style.replace(/rgba?\([^)]+\)/g, m => m.replace(/[\d.]+\)$/, "1)")) }} onClick={() => setOverlayGrad(g.style)}>{g.label}</button>
                        ))}
                      </div>
                    </div>
                    <SliderField label="Opacity" val={overlayOpacity} min={5} max={90} onChange={setOverlayOpacity} unit="%" />
                  </>}

                  {studioTab === "sharpen" && <>
                    <SliderField label="Sharpness" val={sharpenAmt} min={10} max={200} onChange={setSharpenAmt} unit="%" left="Subtle" right="Intense" />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[[30, "Soft"], [70, "Normal"], [120, "Sharp"], [180, "Ultra"]].map(([v, l]) => <button key={v} style={S.chip(sharpenAmt === v)} onClick={() => setSharpenAmt(v)}>{l}</button>)}
                    </div>
                  </>}

                  {studioTab === "denoise" && <>
                    <SliderField label="Noise Reduction" val={denoiseLevel} min={1} max={10} onChange={setDenoiseLevel} left="Light" right="Heavy" />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[[2, "Light"], [4, "Medium"], [7, "Heavy"], [10, "Max"]].map(([v, l]) => <button key={v} style={S.chip(denoiseLevel === v)} onClick={() => setDenoiseLevel(v)}>{l}</button>)}
                    </div>
                  </>}

                  {/* Pipeline box */}
                  {pipelineMode && (
                    <div style={S.pipelineBox}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#4361ee", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>⛓ Pipeline ({pipeline.length} steps)</div>
                      {pipeline.length === 0 && <div style={{ fontSize: 12, color: "#9ca8d0" }}>Add steps from tabs above</div>}
                      {pipeline.map((step, i) => (
                        <div key={step.id} style={S.pipelineItem}>
                          <span style={{ color: "#9ca8d0", fontFamily: "monospace", fontSize: 10, marginRight: 6 }}>{i + 1}</span>
                          <span style={{ flex: 1 }}>{step.label}</span>
                          <button style={{ background: "none", border: "none", color: "#e63946", cursor: "pointer", fontSize: 13 }} onClick={() => setPipeline(p => p.filter(s => s.id !== step.id))}>✕</button>
                        </div>
                      ))}
                      {pipeline.length > 0 && (
                        <button style={{ ...S.applyBtn(pipelineRunning), marginTop: 6 }} disabled={pipelineRunning} onClick={runPipeline}>
                          {pipelineRunning ? <><span style={S.spinner} /> Running…</> : "▶ Run Pipeline"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pipelineMode ? (
                      <button className="add-pipeline-btn" style={S.addPipelineBtn} onClick={addToPipeline}>
                        + Add "{STUDIO_TABS.find(t => t.id === studioTab)?.label}" to Pipeline
                      </button>
                    ) : (
                      <button style={S.applyBtn(processing)} className="apply-btn" disabled={processing} onClick={applyStudioTab}>
                        {processing ? <><span style={S.spinner} /> Processing…</> : <>✦ Apply {STUDIO_TABS.find(t => t.id === studioTab)?.label}</>}
                      </button>
                    )}
                  </div>

                  {/* History */}
                  {history.length > 0 && (
                    <div style={S.historyBox}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca8d0", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>History</div>
                      {history.slice(0, 5).map((h, i) => (
                        <div key={i} style={S.histItem} onClick={() => { setPreview(h.dataUrl); setStudioResult(null); setHistory(hist => hist.slice(i + 1)); }}>
                          <span>{h.label}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#9ca8d0" }}>{h.time}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Studio result */}
                  {studioResult && (
                    <div style={S.resultCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>✅</span>
                        <span style={{ fontWeight: 700, color: "#0f9d6e", fontSize: 13, fontFamily: "'Syne',sans-serif" }}>Edit applied!</span>
                      </div>
                      <div style={S.resultImgBg}><img src={studioResult} alt="result" style={{ maxHeight: 200, objectFit: "contain", borderRadius: 8 }} /></div>
                      <button className="dl-btn" style={S.dlBtn} onClick={downloadStudio}>↓ Download Edited Photo (PNG)</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
