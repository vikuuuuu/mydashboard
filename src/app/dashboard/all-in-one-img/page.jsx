"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logToolUsage } from "@/lib/firestore";
import { getCurrentUser } from "@/lib/firebaseAuth";


// ─── PRESETS ──────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Govt Form 480×672", w: 480, h: 672, minKB: 50, maxKB: 300, dpi: 96, fmts: ["jpg", "jpeg"] },
  { label: "SSC/UPSC Photo", w: 200, h: 230, minKB: 10, maxKB: 50, dpi: 96, fmts: ["jpg", "jpeg"] },
  { label: "SSC Signature", w: 260, h: 75, minKB: 10, maxKB: 20, dpi: 300, fmts: ["jpg", "jpeg"] },
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

const MAX_UPLOAD_MB = 30;

// ─── DPI / SIZE HELPERS (real metadata handling — this is the core bugfix) ───

function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const base64 = dataUrl.slice(comma + 1);
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToDataUrl(bytes, mime) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

function setJpegDPI(dataUrl, dpi) {
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = base64ToBytes(base64);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return dataUrl;
    if (bytes[2] !== 0xff || bytes[3] !== 0xe0) return dataUrl;
    const unitsOffset = 2 + 4 + 5 + 2; // = 13
    bytes[unitsOffset] = 1;
    bytes[unitsOffset + 1] = (dpi >> 8) & 0xff;
    bytes[unitsOffset + 2] = dpi & 0xff;
    bytes[unitsOffset + 3] = (dpi >> 8) & 0xff;
    bytes[unitsOffset + 4] = dpi & 0xff;
    return bytesToDataUrl(bytes, "image/jpeg");
  } catch {
    return dataUrl;
  }
}

let _crcTable = null;
function crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = _crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function setPngDPI(dataUrl, dpi) {
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = base64ToBytes(base64);
    const ihdrEnd = 8 + 4 + 4 + 13 + 4; // 33
    const pxPerMeter = Math.round(dpi / 0.0254);

    const chunkData = new Uint8Array(9);
    const dv = new DataView(chunkData.buffer);
    dv.setUint32(0, pxPerMeter);
    dv.setUint32(4, pxPerMeter);
    chunkData[8] = 1;

    const typeAndData = new Uint8Array(4 + 9);
    typeAndData.set([0x70, 0x48, 0x59, 0x73], 0);
    typeAndData.set(chunkData, 4);
    const crc = crc32(typeAndData);

    const chunk = new Uint8Array(4 + typeAndData.length + 4);
    const cv = new DataView(chunk.buffer);
    cv.setUint32(0, 9);
    chunk.set(typeAndData, 4);
    cv.setUint32(4 + typeAndData.length, crc);

    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return bytesToDataUrl(out, "image/png");
  } catch {
    return dataUrl;
  }
}

function stampDPI(dataUrl, mime, dpi) {
  if (mime === "image/jpeg") return setJpegDPI(dataUrl, dpi);
  if (mime === "image/png") return setPngDPI(dataUrl, dpi);
  return dataUrl;
}

// ─── SIZE PADDING (the actual fix for tiny images like a 260×75 signature) ───
// A 260×75px signature (~19,500px) is mostly blank background + a few thin
// strokes. That's so little entropy that even JPEG quality 99 often can't
// physically reach 10-20KB — there's nothing left to encode. Trying to
// "force" it bigger by resampling, adding noise, or reducing compression
// further just distorts or blurs the actual signature.
// The correct fix (what real SSC/UPSC photo tools do): pad the *file bytes*,
// not the *pixels*. JPEG's COM marker and PNG's tEXt chunk are segments that
// every decoder skips over when rendering — so we can inflate the file to
// any target size by stuffing inert bytes into one of these, and the image
// itself is 100% untouched (same pixels, same dimensions, same quality).

function padJpegToSize(dataUrl, targetBytes) {
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = base64ToBytes(base64);
    if (bytes.length >= targetBytes) return dataUrl;
    let deficit = targetBytes - bytes.length;

    // Insert after the APP0/JFIF segment (not before it) so the file stays
    // strictly JFIF-compliant for picky government portal validators.
    let insertAt = 2;
    if (bytes[2] === 0xff && bytes[3] === 0xe0) {
      const segLen = (bytes[4] << 8) | bytes[5];
      insertAt = 4 + segLen;
    }

    const segments = [];
    while (deficit > 0) {
      // A single COM segment can hold at most 65533 bytes of payload
      // (65535 max segment length - 2 bytes for the length field itself).
      const payloadLen = Math.min(deficit, 65533);
      const seg = new Uint8Array(4 + payloadLen); // FF FE + len(2) + payload
      seg[0] = 0xff; seg[1] = 0xfe;
      const lenField = payloadLen + 2;
      seg[2] = (lenField >> 8) & 0xff; seg[3] = lenField & 0xff;
      segments.push(seg);
      deficit -= payloadLen;
    }
    const addBytes = segments.reduce((s, x) => s + x.length, 0);
    const out = new Uint8Array(bytes.length + addBytes);
    out.set(bytes.subarray(0, insertAt), 0);
    let off = insertAt;
    for (const seg of segments) { out.set(seg, off); off += seg.length; }
    out.set(bytes.subarray(insertAt), off);
    return bytesToDataUrl(out, "image/jpeg");
  } catch {
    return dataUrl;
  }
}

function padPngToSize(dataUrl, targetBytes) {
  try {
    const base64 = dataUrl.split(",")[1];
    const bytes = base64ToBytes(base64);
    if (bytes.length >= targetBytes) return dataUrl;
    const deficit = targetBytes - bytes.length;

    const keyword = new TextEncoder().encode("Comment\0");
    const padLen = Math.max(0, deficit - keyword.length - 12); // 12 = chunk overhead
    const text = new Uint8Array(padLen).fill(0x20); // spaces — inert, never rendered
    const chunkData = new Uint8Array(keyword.length + text.length);
    chunkData.set(keyword, 0);
    chunkData.set(text, keyword.length);

    const typeAndData = new Uint8Array(4 + chunkData.length);
    typeAndData.set([0x74, 0x45, 0x58, 0x74], 0); // "tEXt"
    typeAndData.set(chunkData, 4);
    const crc = crc32(typeAndData);

    const chunk = new Uint8Array(4 + typeAndData.length + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, chunkData.length);
    chunk.set(typeAndData, 4);
    dv.setUint32(4 + typeAndData.length, crc);

    // Insert right before the IEND chunk (always the final 12 bytes of a PNG).
    const insertAt = bytes.length - 12;
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(bytes.subarray(insertAt), insertAt + chunk.length);
    return bytesToDataUrl(out, "image/png");
  } catch {
    return dataUrl;
  }
}

function padToSize(dataUrl, mime, targetBytes) {
  if (mime === "image/jpeg") return padJpegToSize(dataUrl, targetBytes);
  if (mime === "image/png") return padPngToSize(dataUrl, targetBytes);
  return dataUrl; // webp padding isn't safe without a full RIFF rebuild
}

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
  resultMeta: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 },
  rMeta: { background: "#fff", border: "1px solid rgba(99,120,200,0.10)", borderRadius: 8, padding: "6px 8px", textAlign: "center" },
  rMetaV: { fontSize: 13, fontWeight: 600, color: "#0f9d6e" },
  rMetaL: { fontSize: 10, color: "#9ca8d0", marginTop: 1 },
  dlBtn: { padding: 10, border: "none", borderRadius: 10, background: "#0f9d6e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", fontFamily: "'Syne',sans-serif", transition: "opacity 0.15s" },
  alertWarn: { background: "rgba(247,127,0,0.08)", border: "1px solid rgba(247,127,0,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#c46200", display: "flex", alignItems: "flex-start", gap: 6 },
  alertInfo: { background: "rgba(67,97,238,0.07)", border: "1px solid rgba(67,97,238,0.18)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#4361ee", display: "flex", alignItems: "flex-start", gap: 6 },
  alertOk: { background: "rgba(15,157,110,0.07)", border: "1px solid rgba(15,157,110,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#0f9d6e", display: "flex", alignItems: "flex-start", gap: 6 },
  alertErr: { background: "rgba(230,57,70,0.07)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#e63946", display: "flex", alignItems: "flex-start", gap: 6 },
  divider: { height: 1, background: "rgba(99,120,200,0.10)", margin: "12px 0" },
  sectionMini: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca8d0", marginBottom: 8 },
  presetScroll: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 },
  fmtWrap: { display: "flex", flexWrap: "wrap", gap: 5 },
  spinner: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  changeLink: { background: "none", border: "none", color: "#4361ee", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  resetLink: { background: "none", border: "none", color: "#9ca8d0", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textDecoration: "underline" },
  liveBar: { display: "flex", flexWrap: "wrap", gap: "6px 14px", background: "#f4f7fe", border: "1px solid rgba(99,120,200,0.13)", borderRadius: 10, padding: "10px 14px", fontSize: 12 },
  liveItem: { display: "flex", alignItems: "center", gap: 5, color: "#6b7ab5" },
  liveVal: { fontWeight: 700, fontFamily: "monospace" },
  cropWrap: { position: "relative", display: "inline-block", maxWidth: "100%", touchAction: "none", cursor: "crosshair", userSelect: "none" },
  cropImg: { display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 8 },
  cropBox: { position: "absolute", border: "2px solid #4361ee", background: "rgba(67,97,238,0.12)", boxShadow: "0 0 0 2000px rgba(10,15,40,0.35)", cursor: "move" },
  cropHandle: { position: "absolute", width: 12, height: 12, background: "#4361ee", border: "2px solid #fff", borderRadius: "50%", right: -6, bottom: -6, cursor: "nwse-resize" },
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

const FILTER_CSS = {
  none: "none",
  grayscale: (v) => `grayscale(${v}%)`,
  sepia: (v) => `sepia(${v}%)`,
  invert: (v) => `invert(${v}%)`,
  brightness: (v) => `brightness(${v + 50}%)`,
  contrast: (v) => `contrast(${v + 50}%)`,
  saturate: (v) => `saturate(${v * 3}%)`,
  vintage: () => "sepia(60%) contrast(110%)",
  cool: () => "hue-rotate(200deg) saturate(120%)",
  warm: () => "sepia(30%) saturate(130%)",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function GovtFormPhotoTool() {
  const router = useRouter();
  const user   = getCurrentUser();


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
  const [uploadErr, setUploadErr] = useState("");

  // Crop (applied before resize, in Convert mode)
  const [cropRect, setCropRect] = useState(null); // {x,y,w,h} in natural px, or null = full image
  const [cropDisplayW, setCropDisplayW] = useState(0);
  const [cropDrag, setCropDrag] = useState(null); // {mode:'move'|'resize', startX, startY, orig}
  const cropImgRef = useRef();
  const cropWrapRef = useRef();

  // Convert options
  const [resizeMode, setResizeMode] = useState("contain");
  const [outFmt, setOutFmt] = useState("image/jpeg");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [compPct, setCompPct] = useState(0.5);

  // Live preview estimate
  const [liveEstimate, setLiveEstimate] = useState(null); // {kb, w, h}
  const [liveComputing, setLiveComputing] = useState(false);

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
  const [studioErr, setStudioErr] = useState("");

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

  const resetRequirements = () => {
    setReqW("480"); setReqH("672"); setReqMin("50"); setReqMax("300");
    setReqUnit("KB"); setReqDPI("96"); setReqColor("rgb");
    setReqFmts(["jpg", "jpeg"]); setFormName(""); setActivePreset(0);
    setFormErr("");
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

  const getImg = (url) => new Promise((res, rej) => {
    const img = new window.Image(); img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not load image data — it may be corrupted."));
    img.src = url;
  });

  const pushHistory = (dataUrl, label) => {
    setHistory(h => [{ dataUrl, label, time: new Date().toLocaleTimeString() }, ...h.slice(0, 7)]);
  };

  // ── Load file ──
  const loadFile = (file) => {
    if (!file) return;
    setUploadErr("");
    if (!file.type.startsWith("image/")) { setUploadErr("Please choose an image file (JPG, PNG, WEBP, etc.)."); return; }
    if (file.size / (1024 * 1024) > MAX_UPLOAD_MB) { setUploadErr(`File is too large — please keep uploads under ${MAX_UPLOAD_MB}MB.`); return; }
    const err = mode === "convert" ? validateReqs() : null;
    if (err) { setFormErr("Fill in requirements first: " + err); return; }
    setFormErr("");
    const reader = new FileReader();
    reader.onerror = () => setUploadErr("Couldn't read that file — please try again.");
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => setUploadErr("That file doesn't look like a valid image.");
      img.onload = () => {
        setImgData({ src: e.target.result, w: img.width, h: img.height, kb: file.size / 1024, type: file.type, name: file.name });
        setPreview(e.target.result);
        setCropW(String(img.width)); setCropH(String(img.height));
        setCropRect(null);
        setResult(null); setStudioResult(null); setHistory([]); setPipeline([]); setStudioErr("");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadFile(e.dataTransfer.files?.[0]); };

  const openFilePicker = () => fileInputRef.current?.click();
  const dropZoneKeyHandler = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFilePicker(); } };

  const applyPreset = (i) => {
    const p = PRESETS[i];
    setReqW(String(p.w)); setReqH(String(p.h));
    setReqMin(String(p.minKB)); setReqMax(String(p.maxKB));
    setReqUnit("KB"); setReqDPI(String(p.dpi));
    setReqFmts([...p.fmts]); setFormName(p.label); setActivePreset(i);
    setCropRect(null);
  };

  const toggleFmt = (f) => {
    setReqFmts(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    setActivePreset(null);
  };

  // ── Crop tool (Step 2) ──────────────────────────────────────────────────
  // Initializes a crop box matching the target aspect ratio (reqW:reqH) so
  // users can't accidentally pick a region that will get squashed/stretched
  // later — what they see selected is what they get, undistorted.
  const initCropBox = useCallback((natW, natH) => {
    const targetW = parseInt(reqW) || natW, targetH = parseInt(reqH) || natH;
    const targetRatio = targetW / targetH;
    let w, h;
    if (natW / natH > targetRatio) { h = natH; w = h * targetRatio; }
    else { w = natW; h = w / targetRatio; }
    const x = (natW - w) / 2, y = (natH - h) / 2;
    setCropRect({ x, y, w, h });
  }, [reqW, reqH]);

  const onCropImgLoad = (e) => {
    setCropDisplayW(e.target.clientWidth);
    if (!cropRect) initCropBox(imgData.w, imgData.h);
  };

  const cropScale = cropDisplayW && imgData ? cropDisplayW / imgData.w : 1;

  const startCropDrag = (mode) => (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    setCropDrag({ mode, startX: point.clientX, startY: point.clientY, orig: { ...cropRect } });
  };

  useEffect(() => {
    if (!cropDrag) return;
    const targetRatio = (parseInt(reqW) || 1) / (parseInt(reqH) || 1);
    const onMove = (e) => {
      const point = e.touches ? e.touches[0] : e;
      const dx = (point.clientX - cropDrag.startX) / cropScale;
      const dy = (point.clientY - cropDrag.startY) / cropScale;
      setCropRect(() => {
        const o = cropDrag.orig;
        if (cropDrag.mode === "move") {
          const x = Math.min(Math.max(0, o.x + dx), imgData.w - o.w);
          const y = Math.min(Math.max(0, o.y + dy), imgData.h - o.h);
          return { ...o, x, y };
        }
        // resize: keep aspect ratio locked to reqW:reqH
        let w = Math.max(20, o.w + dx);
        w = Math.min(w, imgData.w - o.x);
        let h = w / targetRatio;
        if (o.y + h > imgData.h) { h = imgData.h - o.y; w = h * targetRatio; }
        return { ...o, w, h };
      });
    };
    const onUp = () => setCropDrag(null);
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove); window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
    };
  }, [cropDrag, cropScale, imgData, reqW, reqH]);

  // Re-fit crop box whenever the target ratio changes so it never drifts
  // out of sync with the requirement dimensions.
  useEffect(() => {
    if (imgData && cropRect) initCropBox(imgData.w, imgData.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqW, reqH]);

  // ── Convert: build canvas ──
  const buildCanvas = (img) => {
    const w = parseInt(reqW), h = parseInt(reqH);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);

    // If a crop selection exists, draw only that region as the source.
    const sx = cropRect ? cropRect.x : 0;
    const sy = cropRect ? cropRect.y : 0;
    const sw = cropRect ? cropRect.w : img.width;
    const sh = cropRect ? cropRect.h : img.height;

    if (resizeMode === "contain") {
      const sc = Math.min(w / sw, h / sh);
      const nw = sw * sc, nh = sh * sc;
      ctx.drawImage(img, sx, sy, sw, sh, (w - nw) / 2, (h - nh) / 2, nw, nh);
    } else {
      const sc = Math.max(w / sw, h / sh);
      const nw = sw * sc, nh = sh * sc;
      ctx.drawImage(img, sx, sy, sw, sh, (w - nw) / 2, (h - nh) / 2, nw, nh);
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

  // Returns the best achievable encode plus whether it undershoots minKB
  // (which, for tiny target sizes like a 260×75 signature, is expected and
  // handled by padding afterwards — not by further compression tricks).
  const smartCompress = (canvas) => {
    const [minKB, maxKB] = getMinMaxKB();
    const minB = minKB * 1024, maxB = maxKB * 1024;
    const midB = minB + (maxB - minB) * compPct;

    if (outFmt === "image/png") {
      const data = canvas.toDataURL(outFmt);
      const bytes = dataUrlBytes(data);
      return { data, bytes, qualityAdjustable: false, needsPadding: bytes < minB };
    }

    let lo = 0.02, hi = 0.99, best = null, bestDiff = Infinity;
    for (let i = 0; i < 18; i++) {
      const q = (lo + hi) / 2;
      const data = canvas.toDataURL(outFmt, q);
      const bytes = dataUrlBytes(data);
      if (bytes >= minB && bytes <= maxB) {
        const diff = Math.abs(bytes - midB);
        if (diff < bestDiff) { best = data; bestDiff = diff; }
      }
      if (bytes > midB) hi = q; else lo = q;
    }
    if (best) return { data: best, bytes: dataUrlBytes(best), qualityAdjustable: true, needsPadding: false };

    // Nothing in the quality sweep landed inside [minB, maxB]. For very
    // small target dimensions this almost always means max quality still
    // undershoots minB — there isn't enough pixel detail to encode more
    // bytes. Use the highest-quality encode as the real image (best
    // fidelity) and flag it for padding rather than chasing an
    // unreachable quality target.
    const maxQData = canvas.toDataURL(outFmt, 0.99);
    const maxQBytes = dataUrlBytes(maxQData);
    return { data: maxQData, bytes: maxQBytes, qualityAdjustable: true, needsPadding: maxQBytes < minB };
  };

  const handleProcess = async () => {
    const err = validateReqs();
    if (err) { setProcErr(err); return; }
    setProcErr(""); setProcessing(true); setProgress(0);
    try {
      await new Promise(r => setTimeout(r, 20));
      setProgress(15); setProgLbl("Loading image…");
      await new Promise(r => setTimeout(r, 40));
      const img = await getImg(preview || imgData.src);
      setProgress(35); setProgLbl(`Resizing to ${reqW}×${reqH}…`);
      await new Promise(r => setTimeout(r, 40));
      const canvas = buildCanvas(img);
      setProgress(60); setProgLbl("Compressing…");
      await new Promise(r => setTimeout(r, 40));
      const { data: rawData, qualityAdjustable, needsPadding } = smartCompress(canvas);

      const dpiVal = Math.max(1, parseInt(reqDPI) || 96);
      const dpiSupported = outFmt === "image/jpeg" || outFmt === "image/png";
      let finalData = dpiSupported ? stampDPI(rawData, outFmt, dpiVal) : rawData;

      const [minKB, maxKB] = getMinMaxKB();
      const minB = minKB * 1024, maxB = maxKB * 1024;
      let padded = false;
      if (needsPadding || dataUrlBytes(finalData) < minB) {
        // Pad slightly above the raw minimum (not right at the edge) so
        // rounding during upload/storage doesn't drop it back under the
        // requirement. Content and dimensions are 100% unaffected.
        const targetBytes = Math.ceil(minB + Math.min(maxB - minB, minB * 0.1));
        const paddedData = padToSize(finalData, outFmt, targetBytes);
        if (paddedData !== finalData) { finalData = paddedData; padded = true; }
      }

      setProgress(90); setProgLbl("Verifying…");
      await new Promise(r => setTimeout(r, 30));
      const bytes = dataUrlBytes(finalData);
      const kb = bytes / 1024;
      const ext = outFmt === "image/jpeg" ? "jpg" : outFmt === "image/png" ? "png" : "webp";
      setResult({
        data: finalData, kb, ext, w: parseInt(reqW), h: parseInt(reqH),
        inRange: kb >= minKB && kb <= maxKB, minKB, maxKB,
        dpi: dpiVal, dpiEmbedded: dpiSupported, qualityAdjustable, padded,
      });
      setProgress(100); setProgLbl("Done!");
      setTimeout(() => { setProcessing(false); setProgress(0); }, 700);

      if (user?.uid) {
        await logToolUsage({
          userId: user.uid,
          tool: "all-in-one-img",
          inputSizeKB: Math.round(imgData.kb),
          outputSizeKB: Math.round(kb),
          format: outFmt,
          dimensions: `${reqW}x${reqH}`,
        });
      }
    } catch (e) {
      setProcErr(e?.message || "Something went wrong while processing that image. Please try a different file.");
      setProcessing(false); setProgress(0);
    }
  };

  // ── Live preview: recompute an approximate output size whenever the
  // target dimensions / DPI / format / crop change, debounced so typing
  // doesn't trigger a canvas encode on every keystroke. This is a single
  // fast encode (not the full binary search) purely for the on-screen
  // estimate — the real export still runs smartCompress + padding.
  useEffect(() => {
    if (!imgData || mode !== "convert") return;
    const w = parseInt(reqW), h = parseInt(reqH);
    if (!w || !h || w < 10 || h < 10) { setLiveEstimate(null); return; }
    setLiveComputing(true);
    const t = setTimeout(async () => {
      try {
        const img = await getImg(preview || imgData.src);
        const canvas = buildCanvas(img);
        const [minKB, maxKB] = getMinMaxKB();
        let data, bytes;
        if (outFmt === "image/png") {
          data = canvas.toDataURL(outFmt);
        } else {
          data = canvas.toDataURL(outFmt, Math.max(0.02, Math.min(0.99, compPct)));
        }
        bytes = dataUrlBytes(data);
        const willPad = minKB > 0 && bytes < minKB * 1024;
        setLiveEstimate({ kb: bytes / 1024, w, h, willPad, underMin: willPad });
      } catch {
        setLiveEstimate(null);
      } finally {
        setLiveComputing(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqW, reqH, reqDPI, outFmt, bgColor, resizeMode, compPct, cropRect, imgData, mode]);

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
        const fn = FILTER_CSS[activeFilter];
        ctx.filter = activeFilter === "none" ? "none" : (fn ? fn(v) : "none");
        ctx.drawImage(img, 0, 0);
      }
      return c.toDataURL("image/png");
    },
    async crop(src) {
      const img = await getImg(src);
      const cw = Number(cropW) || img.width, ch = Number(cropH) || img.height;
      const cx = Math.min(Number(cropX) || 0, Math.max(0, img.width - 1));
      const cy = Math.min(Number(cropY) || 0, Math.max(0, img.height - 1));
      const c = document.createElement("canvas");
      c.width = Math.min(cw, img.width - cx); c.height = Math.min(ch, img.height - cy);
      c.getContext("2d").drawImage(img, cx, cy, c.width, c.height, 0, 0, c.width, c.height);
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
    setProcessing(true); setStudioErr("");
    try {
      const fn = studioProcessors[studioTab];
      if (!fn) return;
      const out = await fn(preview);
      pushHistory(preview, studioTab);
      setPreview(out); setStudioResult(out);
    } catch (e) {
      setStudioErr(e?.message || "Couldn't apply that edit — please try again.");
    } finally { setProcessing(false); }
  };

  const addToPipeline = () => setPipeline(p => [...p, { id: Date.now(), tab: studioTab, label: STUDIO_TABS.find(t => t.id === studioTab)?.label || studioTab }]);

  const runPipeline = async () => {
    if (!imgData || pipeline.length === 0) return;
    setPipelineRunning(true); setStudioErr("");
    let src = preview;
    try {
      for (const step of pipeline) {
        const fn = studioProcessors[step.tab];
        if (fn) src = await fn(src);
      }
      pushHistory(preview, "pipeline");
      setPreview(src); setStudioResult(src);
    } catch (e) {
      setStudioErr(e?.message || "Pipeline failed partway through — try removing the last step.");
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

  const getLivePreviewCSS = () => {
    if (studioTab === "adjust") {
      return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    }
    if (studioTab === "filter" && activeFilter !== "none") {
      const fn = FILTER_CSS[activeFilter];
      return fn ? fn(filterVal) : "none";
    }
    return "none";
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
        .drop-zone:focus-visible { outline: 2px solid #4361ee; outline-offset: 2px; }
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
          ← Back
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
            onClick={() => { setImgData(null); setPreview(null); setResult(null); setStudioResult(null); setHistory([]); setPipeline([]); setUploadErr(""); setStudioErr(""); setCropRect(null); fileInputRef.current.value = ""; }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div style={S.container}>

        {/* ══════════════ CONVERT MODE ══════════════ */}
        {mode === "convert" && <>

          {/* STEP 1 */}
          <div style={S.card}>
            <div style={S.cardHdr}>
              <span>📋</span><span style={S.cardHdrTitle}>Step 1 — Set Photo Requirements</span>
              <button style={{ ...S.resetLink, marginLeft: "auto" }} onClick={resetRequirements}>Reset to default</button>
            </div>
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
                <div style={S.field}>
                  <span style={S.label}>DPI <span style={S.opt}>(embedded in file metadata — doesn't touch pixel size)</span></span>
                  <input style={S.input} type="number" value={reqDPI} min={72} max={1200} placeholder="96" onChange={e => setReqDPI(e.target.value)} />
                </div>
                <div style={S.field}><span style={S.label}>Color mode</span><select style={S.select} value={reqColor} onChange={e => setReqColor(e.target.value)}><option value="rgb">RGB (Color)</option><option value="gray">Grayscale</option></select></div>
              </div>

              {(outFmt === "image/webp") && (
                <div style={{ ...S.alertWarn, marginBottom: 12 }}>⚠ WEBP output can't carry DPI metadata, and can't be padded to a minimum size, in the browser — switch to JPG or PNG if the form checks either.</div>
              )}

              <div style={{ marginBottom: 12 }}>
                <span style={S.label}>Allowed formats <span style={S.req}>*</span></span>
                <div style={S.fmtWrap}>{ALL_FMTS.map(f => <button key={f} style={S.chip(reqFmts.includes(f))} onClick={() => toggleFmt(f)}>{f.toUpperCase()}</button>)}</div>
              </div>

              <div style={S.field}><span style={S.label}>Form / Exam name <span style={S.opt}>(optional)</span></span><input style={S.input} type="text" value={formName} placeholder="e.g. SSC CGL 2026 Application" onChange={e => setFormName(e.target.value)} /></div>

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

              {/* Tiny-target warning — this is exactly the SSC signature case */}
              {(() => {
                const w = parseInt(reqW), h = parseInt(reqH), [mn] = getMinMaxKB();
                if (w && h && w * h < 40000 && mn > 8) {
                  return (
                    <div style={{ ...S.alertInfo, marginTop: 10 }}>
                      ℹ {w}×{h}px is a small canvas ({(w * h).toLocaleString()} px total) for a {mn}KB+ minimum — compression alone usually can't reach that. The converter will automatically pad the file to size without touching the image, so don't worry if the live estimate below shows a smaller number.
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* STEP 2 */}
          <div style={S.card}>
            <div style={S.cardHdr}><span>📤</span><span style={S.cardHdrTitle}>Step 2 — Upload & Crop Your Photo</span></div>
            <div style={S.cardBody}>
              {!imgData ? (
                <div className="drop-zone" role="button" tabIndex={0} aria-label="Upload photo" style={S.dropZone(isDrag)}
                  onDragOver={e => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop}
                  onClick={openFilePicker} onKeyDown={dropZoneKeyHandler}>
                  <span style={{ fontSize: 32 }}>🖼️</span>
                  <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "#1a2147", margin: 0 }}>Drop photo here or click to browse</p>
                  <small style={{ fontSize: 11, color: "#9ca8d0" }}>{reqFmts.length > 0 ? reqFmts.map(f => f.toUpperCase()).join(" · ") : "JPG · PNG · WEBP · BMP · GIF"} · up to {MAX_UPLOAD_MB}MB</small>
                </div>
              ) : (
                <>
                  <div style={S.sectionMini}>Drag to reposition · drag the corner handle to resize (aspect ratio locked to {reqW}:{reqH})</div>
                  <div style={{ display: "flex", justifyContent: "center", background: "#f4f7fe", borderRadius: 10, padding: 10 }}>
                    <div ref={cropWrapRef} style={S.cropWrap}>
                      <img ref={cropImgRef} src={imgData.src} alt="crop source" style={S.cropImg} onLoad={onCropImgLoad} draggable={false} />
                      {cropRect && cropDisplayW > 0 && (
                        <div
                          style={{
                            ...S.cropBox,
                            left: cropRect.x * cropScale,
                            top: cropRect.y * cropScale,
                            width: cropRect.w * cropScale,
                            height: cropRect.h * cropScale,
                          }}
                          onMouseDown={startCropDrag("move")}
                          onTouchStart={startCropDrag("move")}
                        >
                          <div style={S.cropHandle} onMouseDown={(e) => { e.stopPropagation(); startCropDrag("resize")(e); }} onTouchStart={(e) => { e.stopPropagation(); startCropDrag("resize")(e); }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={S.chip(false)} onClick={() => initCropBox(imgData.w, imgData.h)}>↺ Reset crop</button>
                    <span style={{ fontSize: 11, color: "#9ca8d0", alignSelf: "center" }}>
                      {cropRect ? `Selecting ${Math.round(cropRect.w)}×${Math.round(cropRect.h)}px of ${imgData.w}×${imgData.h}px` : ""}
                    </span>
                  </div>

                  <div style={{ ...S.previewBox, marginTop: 12 }}>
                    <span style={{ fontSize: 11, color: "#9ca8d0", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imgData.name}</span>
                    <button style={S.changeLink} onClick={() => { setImgData(null); setPreview(null); setResult(null); setUploadErr(""); setCropRect(null); fileInputRef.current.value = ""; }}>Change photo</button>
                  </div>
                  <div style={S.statGrid}>
                    <div style={S.stat}><div style={S.statV}>{imgData.w}px</div><div style={S.statL}>Original W</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.h}px</div><div style={S.statL}>Original H</div></div>
                    <div style={S.stat}><div style={S.statV}>{imgData.kb.toFixed(1)} KB</div><div style={S.statL}>Original size</div></div>
                  </div>
                </>
              )}
              {uploadErr && <div style={{ ...S.alertErr, marginTop: 10 }}>⚠ {uploadErr}</div>}
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

              <div style={{ marginBottom: 14 }}>
                <span style={S.label}>Compression target {outFmt === "image/png" && <span style={S.opt}>(PNG size isn't adjustable — see note below)</span>}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[["Lightest", 0.2], ["Balanced", 0.5], ["High quality", 0.75], ["Max quality", 0.9]].map(([lbl, pct]) => (
                    <button key={lbl} className="preset-btn" style={S.presetBtn(compPct === pct)} disabled={outFmt === "image/png"} onClick={() => setCompPct(pct)}>{lbl}</button>
                  ))}
                </div>
                {reqMin && reqMax && <small style={{ fontSize: 10, color: "#9ca8d0", marginTop: 4, display: "block" }}>Target within {reqMin}–{reqMax} {reqUnit}</small>}
                {outFmt === "image/png" && <div style={{ ...S.alertInfo, marginTop: 8 }}>ℹ PNG is lossless — browsers ignore a "quality" setting for it, so file size can't be tuned this way. Switch to JPG if you need a tight size window.</div>}
              </div>

              {/* Live preview bar */}
              {imgData && (
                <div style={{ ...S.liveBar, marginBottom: 14 }}>
                  <span style={S.liveItem}>📐 <span style={S.liveVal}>{reqW}×{reqH}px</span></span>
                  <span style={S.liveItem}>🖨 <span style={S.liveVal}>{reqDPI} DPI</span></span>
                  <span style={S.liveItem}>
                    💾 {liveComputing ? "estimating…" : liveEstimate ? (
                      <span style={S.liveVal}>≈ {liveEstimate.kb.toFixed(1)} KB{liveEstimate.willPad ? " (before auto-pad)" : ""}</span>
                    ) : "—"}
                  </span>
                  {liveEstimate?.willPad && (
                    <span style={{ ...S.liveItem, color: "#4361ee" }}>→ will be padded to ≥ {reqMin}{reqUnit} on export</span>
                  )}
                </div>
              )}

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
                <div style={S.rMeta}><div style={S.rMetaV}>{result.dpi} DPI</div><div style={S.rMetaL}>{result.dpiEmbedded ? "Embedded ✓" : "Not embeddable"}</div></div>
              </div>
              {result.padded && <div style={S.alertOk}>✓ File was padded with inert metadata bytes to meet the {result.minKB}KB minimum — pixels and quality are untouched.</div>}
              {!result.qualityAdjustable && outFmt !== "image/png" && <div style={S.alertInfo}>ℹ Exported at maximum quality — size wasn't tunable via compression alone at this resolution.</div>}
              {!result.dpiEmbedded && <div style={S.alertWarn}>⚠ {result.ext.toUpperCase()} can't store DPI metadata in-browser — the pixel dimensions are still exact, but DPI wasn't written to the file.</div>}
              {!result.inRange && <div style={S.alertWarn}>⚠ Output ({result.kb.toFixed(1)} KB) slightly outside {result.minKB}–{result.maxKB} KB. Try re-running — padding targets just above the minimum.</div>}
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
                <div className="drop-zone" role="button" tabIndex={0} aria-label="Upload image to edit" style={S.dropZone(isDrag)}
                  onDragOver={e => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop}
                  onClick={openFilePicker} onKeyDown={dropZoneKeyHandler}>
                  <span style={{ fontSize: 32 }}>🖼️</span>
                  <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "#1a2147", margin: 0 }}>Drop image to edit</p>
                  <small style={{ fontSize: 11, color: "#9ca8d0" }}>JPG · PNG · WEBP · BMP · GIF · up to {MAX_UPLOAD_MB}MB</small>
                </div>
                {uploadErr && <div style={{ ...S.alertErr, marginTop: 10 }}>⚠ {uploadErr}</div>}
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => loadFile(e.target.files?.[0])} />
              </div>
            )}

            {imgData && (
              <>
                {/* Preview */}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ ...S.previewBox, padding: 8 }}>
                    <img src={preview} alt="preview" style={{ maxHeight: 200, objectFit: "contain", borderRadius: 8, width: "100%", filter: getLivePreviewCSS(), transition: "filter 0.15s" }} />
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
                    <div style={S.alertInfo}>ℹ Preview updates live — click Apply to bake it into the image.</div>
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
                          {preview && <img src={preview} style={{ ...S.filterThumb, filter: f.id === "none" ? "none" : (FILTER_CSS[f.id] ? FILTER_CSS[f.id](80) : "none") }} alt={f.label} />}
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
                    <div style={S.alertInfo}>ℹ Image is {imgData.w}×{imgData.h}px — out-of-bounds crops are automatically clamped. For a visual drag-to-crop, use Convert mode's Step 2.</div>
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

                  {studioErr && <div style={S.alertErr}>⚠ {studioErr}</div>}

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
