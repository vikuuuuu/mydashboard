"use client";
import { useState, useRef, useEffect, useCallback } from "react";

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

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#f8fbff 0%,#eef2ff 100%)",
    fontFamily: "'DM Sans',sans-serif",
    color: "#1a2147",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    display: "flex", alignItems: "center", gap: 14, padding: "14px 32px",
    background: "#ffffff", borderBottom: "1px solid rgba(99,120,200,0.13)",
    boxShadow: "0 1px 4px rgba(67,97,238,0.07)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap",
  },
  brandIcon: {
    width: 34, height: 34, background: "#4361ee", borderRadius: 9,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 16, flexShrink: 0, boxShadow: "0 4px 12px rgba(67,97,238,0.28)",
  },
  brand: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Syne',sans-serif", fontSize: "1.05rem", fontWeight: 800, color: "#1a2147", letterSpacing: "-0.02em" },
  backBtn: {
    display: "inline-flex", alignItems: "center", gap: 6, background: "#fff",
    border: "1px solid rgba(99,120,200,0.22)", color: "#6b7ab5", fontSize: 13, fontWeight: 500,
    padding: "7px 16px", borderRadius: 999, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
  },
  container: { maxWidth: 780, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  card: { background: "#fff", border: "1px solid rgba(99,120,200,0.13)", borderRadius: 14, overflow: "hidden" },
  cardHdr: {
    padding: "10px 16px", borderBottom: "1px solid rgba(99,120,200,0.10)",
    background: "#f4f7fe", display: "flex", alignItems: "center", gap: 8,
  },
  cardHdrTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7ab5" },
  cardBody: { padding: "16px" },
  label: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7ab5", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 },
  req: { color: "#e63946", fontSize: 11 },
  opt: { fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca8d0" },
  input: {
    width: "100%", padding: "8px 10px", border: "1.5px solid rgba(99,120,200,0.18)",
    borderRadius: 10, background: "#f4f7fe", color: "#1a2147",
    fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s", boxSizing: "border-box",
  },
  select: {
    width: "100%", padding: "8px 10px", border: "1.5px solid rgba(99,120,200,0.18)",
    borderRadius: 10, background: "#f4f7fe", color: "#1a2147",
    fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", cursor: "pointer",
  },
  g2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  g3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  field: { display: "flex", flexDirection: "column" },
  chip: (on) => ({
    padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.18)"}`,
    background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5",
    fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif",
  }),
  presetBtn: (on) => ({
    padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.15)"}`,
    background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5",
    fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
    fontFamily: "'DM Sans',sans-serif",
  }),
  modeBtn: (on) => ({
    padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${on ? "#4361ee" : "rgba(99,120,200,0.15)"}`,
    background: on ? "rgba(67,97,238,0.08)" : "#f4f7fe", color: on ? "#4361ee" : "#6b7ab5",
    fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", flex: 1, textAlign: "center",
    fontFamily: "'DM Sans',sans-serif",
  }),
  swatch: (on, hex) => ({
    width: 26, height: 26, borderRadius: "50%", background: hex, flexShrink: 0,
    border: on ? "2.5px solid #4361ee" : "1.5px solid rgba(99,120,200,0.22)",
    cursor: "pointer", transition: "all 0.15s", boxShadow: on ? "0 0 0 2px rgba(67,97,238,0.2)" : "none",
  }),
  colorPick: { width: 26, height: 26, borderRadius: "50%", border: "1.5px solid rgba(99,120,200,0.22)", padding: 0, cursor: "pointer", background: "none" },
  dropZone: (drag) => ({
    border: `1.5px dashed ${drag ? "#4361ee" : "rgba(99,120,200,0.22)"}`,
    borderRadius: 12, minHeight: 140, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer",
    transition: "all 0.2s", padding: 16, textAlign: "center",
    background: drag ? "rgba(67,97,238,0.06)" : "#f4f7fe",
  }),
  previewBox: {
    background: "#f4f7fe", borderRadius: 10, display: "flex",
    flexDirection: "column", alignItems: "center", gap: 8, padding: 10, position: "relative",
  },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 },
  stat: { background: "#f4f7fe", borderRadius: 8, padding: "6px 8px", textAlign: "center" },
  statV: { fontSize: 13, fontWeight: 600, color: "#1a2147" },
  statL: { fontSize: 10, color: "#9ca8d0", marginTop: 1 },
  chkItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(99,120,200,0.08)" },
  chkLbl: { fontSize: 12, color: "#6b7ab5" },
  tag: (ok, na) => ({
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
    background: na ? "#f4f7fe" : ok ? "rgba(15,157,110,0.10)" : "rgba(230,57,70,0.09)",
    color: na ? "#9ca8d0" : ok ? "#0f9d6e" : "#e63946",
  }),
  reqSummary: {
    background: "rgba(67,97,238,0.05)", border: "1px solid rgba(67,97,238,0.15)",
    borderRadius: 10, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "5px 14px",
    fontSize: 12, color: "#6b7ab5", marginTop: 12,
  },
  sumItem: { display: "flex", alignItems: "center", gap: 5 },
  sumVal: { fontWeight: 600, color: "#1a2147", fontFamily: "monospace", fontSize: 12 },
  progressWrap: { marginTop: 10 },
  progressTrack: { height: 4, background: "rgba(99,120,200,0.13)", borderRadius: 999, overflow: "hidden" },
  progressFill: (pct) => ({ height: "100%", background: "#4361ee", width: pct + "%", borderRadius: 999, transition: "width 0.3s" }),
  progLbl: { fontSize: 11, color: "#6b7ab5", marginTop: 4, textAlign: "center" },
  applyBtn: (dis) => ({
    width: "100%", padding: 12, border: "none", borderRadius: 10,
    background: dis ? "#a8b4e8" : "#4361ee", color: "#fff",
    fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700,
    cursor: dis ? "not-allowed" : "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, transition: "all 0.15s", marginTop: 12,
    boxShadow: dis ? "none" : "0 4px 14px rgba(67,97,238,0.28)",
  }),
  resultCard: {
    background: "rgba(15,157,110,0.06)", border: "1px solid rgba(15,157,110,0.22)",
    borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12,
  },
  resultImgBg: { background: "#f4f7fe", borderRadius: 10, display: "flex", justifyContent: "center", padding: 10 },
  resultMeta: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 },
  rMeta: { background: "#fff", border: "1px solid rgba(99,120,200,0.10)", borderRadius: 8, padding: "6px 8px", textAlign: "center" },
  rMetaV: { fontSize: 13, fontWeight: 600, color: "#0f9d6e" },
  rMetaL: { fontSize: 10, color: "#9ca8d0", marginTop: 1 },
  dlBtn: {
    padding: 10, border: "none", borderRadius: 10, background: "#0f9d6e",
    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
    fontFamily: "'Syne',sans-serif", transition: "opacity 0.15s",
  },
  alertWarn: {
    background: "rgba(247,127,0,0.08)", border: "1px solid rgba(247,127,0,0.2)",
    borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#c46200",
    display: "flex", alignItems: "flex-start", gap: 6,
  },
  alertInfo: {
    background: "rgba(67,97,238,0.07)", border: "1px solid rgba(67,97,238,0.18)",
    borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#4361ee",
    display: "flex", alignItems: "flex-start", gap: 6,
  },
  alertErr: {
    background: "rgba(230,57,70,0.07)", border: "1px solid rgba(230,57,70,0.2)",
    borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#e63946",
    display: "flex", alignItems: "flex-start", gap: 6,
  },
  divider: { height: 1, background: "rgba(99,120,200,0.10)", margin: "12px 0" },
  sectionMini: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca8d0", marginBottom: 8 },
  presetScroll: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 },
  fmtWrap: { display: "flex", flexWrap: "wrap", gap: 5 },
  spinner: {
    display: "inline-block", width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
    borderRadius: "50%", animation: "spin 0.7s linear infinite",
  },
  changeLink: { background: "none", border: "none", color: "#4361ee", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function GovtFormPhotoTool() {
  // Requirements state
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

  // Upload state
  const [imgData, setImgData] = useState(null);
  const [isDrag, setIsDrag] = useState(false);

  // Process options
  const [resizeMode, setResizeMode] = useState("contain");
  const [outFmt, setOutFmt] = useState("image/jpeg");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [compPct, setCompPct] = useState(0.5);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progLbl, setProgLbl] = useState("Processing…");
  const [result, setResult] = useState(null);
  const [formErr, setFormErr] = useState("");
  const [procErr, setProcErr] = useState("");

  const fileInputRef = useRef();
  const dropRef = useRef();

  // ── Derived config ──
  const getMinMaxKB = useCallback(() => {
    const min = parseFloat(reqMin) || 0;
    const max = parseFloat(reqMax) || 0;
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

  // ── Checks ──
  const getChecks = () => {
    if (!imgData) return null;
    const [minKB, maxKB] = getMinMaxKB();
    const w = parseInt(reqW), h = parseInt(reqH);
    const resOk = imgData.w === w && imgData.h === h;
    const szOk = imgData.kb >= minKB && imgData.kb <= maxKB;
    const ext = imgData.type.split("/")[1];
    const fmtOk = reqFmts.some(f => f === ext || (f === "jpg" && ext === "jpeg") || (f === "jpeg" && ext === "jpeg"));
    return { resOk, szOk, fmtOk };
  };

  const checks = getChecks();

  // ── Load image ──
  const loadFile = (file) => {
    const err = validateReqs();
    if (err) { setFormErr("Fill in requirements first: " + err); return; }
    setFormErr("");
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        setImgData({ src: e.target.result, w: img.width, h: img.height, kb: file.size / 1024, type: file.type, name: file.name });
        setResult(null); setProcErr("");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ── Drop handlers ──
  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadFile(e.dataTransfer.files?.[0]); };

  // ── Preset apply ──
  const applyPreset = (i) => {
    const p = PRESETS[i];
    setReqW(String(p.w)); setReqH(String(p.h));
    setReqMin(String(p.minKB)); setReqMax(String(p.maxKB));
    setReqUnit("KB"); setReqDPI(String(p.dpi));
    setReqFmts([...p.fmts]);
    setFormName(p.label);
    setActivePreset(i);
  };

  // ── Toggle format chip ──
  const toggleFmt = (f) => {
    setReqFmts(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    setActivePreset(null);
  };

  // ── Build canvas ──
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

  // ── Smart compress ──
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

  // ── Process ──
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
    img.src = imgData.src;
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.data;
    a.download = `form-photo-${result.w}x${result.h}-${Date.now()}.${result.ext}`;
    a.click();
  };

  const [minKB, maxKB] = getMinMaxKB();

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]:focus, input[type=text]:focus, select:focus {
          border-color: #4361ee !important; box-shadow: 0 0 0 3px rgba(67,97,238,0.10) !important; background: #fff !important;
        }
        .preset-btn:hover { border-color: #4361ee !important; color: #4361ee !important; background: rgba(67,97,238,0.06) !important; }
        .dl-btn:hover { opacity: 0.88; }
        .apply-btn:not([disabled]):hover { opacity: 0.9; transform: translateY(-1px); }
        @media (max-width: 560px) {
          .g2 { grid-template-columns: 1fr !important; }
          .g3 { grid-template-columns: 1fr 1fr !important; }
          .rmeta-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* TOP BAR */}
      <div style={S.topBar}>
        <button style={S.backBtn}>← Back</button>
        <div style={S.brand}>
          <div style={S.brandIcon}>🖼</div>
          <span>Form Photo Converter</span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca8d0", fontFamily: "monospace" }}>
          Auto-resize · Compress · Convert
        </span>
      </div>

      <div style={S.container}>

        {/* ── STEP 1: REQUIREMENTS ── */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span style={S.cardHdrTitle}>Step 1 — Set Photo Requirements</span>
          </div>
          <div style={S.cardBody}>

            {/* Presets */}
            <div style={{ marginBottom: 14 }}>
              <div style={S.sectionMini}>Quick presets</div>
              <div style={S.presetScroll}>
                {PRESETS.map((p, i) => (
                  <button key={i} className="preset-btn" style={S.presetBtn(activePreset === i)} onClick={() => applyPreset(i)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={S.divider} />
            <div style={{ ...S.sectionMini, marginTop: 12 }}>Or enter custom requirements</div>

            {/* Resolution */}
            <div className="g2" style={{ ...S.g2, marginBottom: 12 }}>
              <div style={S.field}>
                <span style={S.label}>Width (px) <span style={S.req}>*</span></span>
                <input style={S.input} type="number" value={reqW} min={10} max={10000} placeholder="e.g. 480"
                  onChange={e => { setReqW(e.target.value); setActivePreset(null); }} />
              </div>
              <div style={S.field}>
                <span style={S.label}>Height (px) <span style={S.req}>*</span></span>
                <input style={S.input} type="number" value={reqH} min={10} max={10000} placeholder="e.g. 672"
                  onChange={e => { setReqH(e.target.value); setActivePreset(null); }} />
              </div>
            </div>

            {/* Size range */}
            <div className="g3" style={{ ...S.g3, marginBottom: 12 }}>
              <div style={S.field}>
                <span style={S.label}>Min size <span style={S.req}>*</span></span>
                <input style={S.input} type="number" value={reqMin} min={1} placeholder="50"
                  onChange={e => { setReqMin(e.target.value); setActivePreset(null); }} />
              </div>
              <div style={S.field}>
                <span style={S.label}>Max size <span style={S.req}>*</span></span>
                <input style={S.input} type="number" value={reqMax} min={1} placeholder="300"
                  onChange={e => { setReqMax(e.target.value); setActivePreset(null); }} />
              </div>
              <div style={S.field}>
                <span style={S.label}>Unit</span>
                <select style={S.select} value={reqUnit} onChange={e => { setReqUnit(e.target.value); setActivePreset(null); }}>
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                  <option value="bytes">Bytes</option>
                </select>
              </div>
            </div>

            {/* DPI + Color */}
            <div className="g2" style={{ ...S.g2, marginBottom: 12 }}>
              <div style={S.field}>
                <span style={S.label}>DPI <span style={S.opt}>(optional)</span></span>
                <input style={S.input} type="number" value={reqDPI} min={72} max={600} placeholder="96"
                  onChange={e => setReqDPI(e.target.value)} />
              </div>
              <div style={S.field}>
                <span style={S.label}>Color mode</span>
                <select style={S.select} value={reqColor} onChange={e => setReqColor(e.target.value)}>
                  <option value="rgb">RGB (Color)</option>
                  <option value="gray">Grayscale</option>
                </select>
              </div>
            </div>

            {/* Formats */}
            <div style={{ marginBottom: 12 }}>
              <span style={S.label}>Allowed formats <span style={S.req}>*</span></span>
              <div style={S.fmtWrap}>
                {ALL_FMTS.map(f => (
                  <button key={f} style={S.chip(reqFmts.includes(f))} onClick={() => toggleFmt(f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Form name */}
            <div style={S.field}>
              <span style={S.label}>Form / Exam name <span style={S.opt}>(optional)</span></span>
              <input style={S.input} type="text" value={formName} placeholder="e.g. UPSC CSE 2025 Application"
                onChange={e => setFormName(e.target.value)} />
            </div>

            {/* Form error */}
            {formErr && <div style={{ ...S.alertErr, marginTop: 10 }}>⚠ {formErr}</div>}

            {/* Requirement summary */}
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

        {/* ── STEP 2: UPLOAD ── */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={{ fontSize: 14 }}>📤</span>
            <span style={S.cardHdrTitle}>Step 2 — Upload Your Photo</span>
          </div>
          <div style={S.cardBody}>
            {!imgData ? (
              <div
                style={S.dropZone(isDrag)}
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span style={{ fontSize: 32 }}>🖼️</span>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "#1a2147", margin: 0 }}>
                  Drop photo here or click to browse
                </p>
                <small style={{ fontSize: 11, color: "#9ca8d0" }}>
                  {reqFmts.length > 0 ? reqFmts.map(f => f.toUpperCase()).join(" · ") : "JPG · PNG · WEBP · BMP · GIF"}
                </small>
              </div>
            ) : (
              <>
                <div style={S.previewBox}>
                  <img src={imgData.src} alt="preview" style={{ maxHeight: 180, objectFit: "contain", borderRadius: 8 }} />
                  <span style={{ fontSize: 11, color: "#9ca8d0", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {imgData.name}
                  </span>
                  <button style={S.changeLink} onClick={() => { setImgData(null); setResult(null); fileInputRef.current.value = ""; }}>
                    Change photo
                  </button>
                </div>

                <div style={S.statGrid}>
                  <div style={S.stat}><div style={S.statV}>{imgData.w}px</div><div style={S.statL}>Width</div></div>
                  <div style={S.stat}><div style={S.statV}>{imgData.h}px</div><div style={S.statL}>Height</div></div>
                  <div style={S.stat}><div style={S.statV}>{imgData.kb.toFixed(1)} KB</div><div style={S.statL}>Size</div></div>
                </div>

                {checks && (
                  <div style={{ marginTop: 10 }}>
                    {[
                      { lbl: "Resolution", ok: checks.resOk },
                      { lbl: "File size", ok: checks.szOk },
                      { lbl: "Format", ok: checks.fmtOk },
                    ].map(({ lbl, ok }) => (
                      <div key={lbl} style={S.chkItem}>
                        <span style={S.chkLbl}>{lbl}</span>
                        <span style={S.tag(ok, false)}>{ok ? "✓ Meets requirement" : "✗ Needs adjustment"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {checks && (!checks.resOk || !checks.szOk || !checks.fmtOk) && (
                  <div style={{ ...S.alertWarn, marginTop: 10 }}>
                    ⚠ {[
                      !checks.resOk && `Resolution (${imgData.w}×${imgData.h}) will be resized to ${reqW}×${reqH}.`,
                      !checks.szOk && `Size (${imgData.kb.toFixed(0)} KB) will be compressed to ${reqMin}–${reqMax} ${reqUnit}.`,
                      !checks.fmtOk && `Format will be converted to selected output format.`,
                    ].filter(Boolean).join(" ")}
                  </div>
                )}

                {checks && checks.resOk && checks.szOk && checks.fmtOk && (
                  <div style={{ ...S.alertInfo, marginTop: 10 }}>
                    ✓ This photo already meets all requirements! Processing will still re-export it cleanly.
                  </div>
                )}
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => loadFile(e.target.files?.[0])} />
          </div>
        </div>

        {/* ── STEP 3: PROCESS OPTIONS ── */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={{ fontSize: 14 }}>⚙️</span>
            <span style={S.cardHdrTitle}>Step 3 — Processing Options</span>
          </div>
          <div style={S.cardBody}>

            <div className="g2" style={{ ...S.g2, marginBottom: 14 }}>
              {/* Resize mode */}
              <div style={S.field}>
                <span style={S.label}>Resize mode</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={S.modeBtn(resizeMode === "contain")} onClick={() => setResizeMode("contain")}>Contain</button>
                  <button style={S.modeBtn(resizeMode === "cover")} onClick={() => setResizeMode("cover")}>Cover</button>
                </div>
                <small style={{ fontSize: 10, color: "#9ca8d0", marginTop: 4 }}>
                  Contain = fit inside + fill bg &nbsp;|&nbsp; Cover = crop to fill
                </small>
              </div>

              {/* Output format */}
              <div style={S.field}>
                <span style={S.label}>Output format</span>
                <select style={S.select} value={outFmt} onChange={e => setOutFmt(e.target.value)}>
                  <option value="image/jpeg">JPG / JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/webp">WEBP</option>
                </select>
              </div>
            </div>

            {/* Background */}
            <div style={{ marginBottom: 14 }}>
              <span style={S.label}>Background color <span style={S.opt}>(for contain mode)</span></span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {BG_SWATCHES.map(sw => (
                  <button key={sw.hex} title={sw.label} style={S.swatch(bgColor === sw.hex, sw.hex)}
                    onClick={() => setBgColor(sw.hex)} />
                ))}
                <input type="color" style={S.colorPick} value={bgColor} onChange={e => setBgColor(e.target.value)} title="Custom" />
                <span style={{ fontSize: 11, color: "#9ca8d0", fontFamily: "monospace" }}>{bgColor}</span>
              </div>
            </div>

            {/* Compression target */}
            <div style={{ marginBottom: 4 }}>
              <span style={S.label}>Compression target</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["Lightest", 0.2], ["Balanced", 0.5], ["High quality", 0.75], ["Max quality", 0.9]].map(([lbl, pct]) => (
                  <button key={lbl} className="preset-btn" style={S.presetBtn(compPct === pct)} onClick={() => setCompPct(pct)}>
                    {lbl}
                  </button>
                ))}
              </div>
              {reqMin && reqMax && (
                <small style={{ fontSize: 10, color: "#9ca8d0", marginTop: 4, display: "block" }}>
                  Target: ~{((parseFloat(reqMin) + parseFloat(reqMax)) / 2 * compPct * 2 / (0.5 + compPct)).toFixed(0)} {reqUnit} (within {reqMin}–{reqMax} {reqUnit})
                </small>
              )}
            </div>

            {/* Progress */}
            {processing && (
              <div style={S.progressWrap}>
                <div style={S.progressTrack}><div style={S.progressFill(progress)} /></div>
                <div style={S.progLbl}>{progLbl}</div>
              </div>
            )}

            {procErr && <div style={{ ...S.alertErr, marginTop: 8 }}>⚠ {procErr}</div>}

            <button
              style={S.applyBtn(!imgData || processing)}
              className="apply-btn"
              disabled={!imgData || processing}
              onClick={handleProcess}
            >
              {processing
                ? <><span style={S.spinner} /> {progLbl}</>
                : <>🪄 {formName ? `Convert for "${formName}"` : "Convert & Download"}</>
              }
            </button>
          </div>
        </div>

        {/* ── RESULT ── */}
        {result && (
          <div style={S.resultCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontWeight: 700, color: "#0f9d6e", fontSize: 14, fontFamily: "'Syne',sans-serif" }}>
                {formName ? `"${formName}" — Ready for submission!` : "Photo ready for submission!"}
              </span>
            </div>

            <div style={S.resultImgBg}>
              <img src={result.data} alt="Processed" style={{ maxHeight: 220, objectFit: "contain", borderRadius: 8 }} />
            </div>

            <div className="rmeta-grid" style={S.resultMeta}>
              <div style={S.rMeta}><div style={S.rMetaV}>{result.w} × {result.h}</div><div style={S.rMetaL}>Dimensions</div></div>
              <div style={S.rMeta}><div style={S.rMetaV}>{result.kb.toFixed(1)} KB</div><div style={S.rMetaL}>File size</div></div>
              <div style={S.rMeta}><div style={S.rMetaV}>{result.ext.toUpperCase()}</div><div style={S.rMetaL}>Format</div></div>
            </div>

            {!result.inRange && (
              <div style={S.alertWarn}>
                ⚠ Output ({result.kb.toFixed(1)} KB) is slightly outside {result.minKB}–{result.maxKB} KB range.
                Try PNG format or adjust compression target.
              </div>
            )}

            <button className="dl-btn" style={S.dlBtn} onClick={handleDownload}>
              ↓ Download Processed Photo ({result.ext.toUpperCase()})
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
