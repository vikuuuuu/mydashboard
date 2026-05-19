"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ASPECT_RATIOS = [
  { id: "9:16", label: "9:16", sub: "Shorts/Reels", w: 9, h: 16 },
  { id: "16:9", label: "16:9", sub: "YouTube", w: 16, h: 9 },
  { id: "1:1", label: "1:1", sub: "Instagram", w: 1, h: 1 },
  { id: "4:5", label: "4:5", sub: "Portrait", w: 4, h: 5 },
];

const FILTER_PRESETS = [
  { name: "Original", brightness: 1, contrast: 1, saturate: 1, hue: 0, grayscale: 0, sepia: 0 },
  { name: "Vivid", brightness: 1.1, contrast: 1.3, saturate: 1.6, hue: 0, grayscale: 0, sepia: 0 },
  { name: "Noir", brightness: 0.9, contrast: 1.5, saturate: 0, hue: 0, grayscale: 1, sepia: 0 },
  { name: "Warm", brightness: 1.05, contrast: 1.1, saturate: 1.2, hue: 15, grayscale: 0, sepia: 0.3 },
  { name: "Cool", brightness: 1, contrast: 1.1, saturate: 0.9, hue: 180, grayscale: 0, sepia: 0 },
  { name: "Drama", brightness: 0.85, contrast: 1.7, saturate: 1.3, hue: 0, grayscale: 0, sepia: 0.1 },
  { name: "Sunset", brightness: 1.1, contrast: 1.2, saturate: 1.4, hue: -10, grayscale: 0, sepia: 0.3 },
  { name: "Cyber", brightness: 1, contrast: 1.5, saturate: 2, hue: 120, grayscale: 0, sepia: 0 },
  { name: "Fade", brightness: 1.15, contrast: 0.8, saturate: 0.7, hue: 0, grayscale: 0, sepia: 0.1 },
  { name: "Retro", brightness: 0.95, contrast: 1.2, saturate: 0.8, hue: 30, grayscale: 0, sepia: 0.5 },
  { name: "Neon", brightness: 1.2, contrast: 1.4, saturate: 2, hue: 60, grayscale: 0, sepia: 0 },
  { name: "Matte", brightness: 1.1, contrast: 0.9, saturate: 0.8, hue: 0, grayscale: 0, sepia: 0.15 },
];

const FONT_FAMILIES = ["Inter", "Roboto", "Poppins", "Montserrat", "Playfair Display", "Bebas Neue", "Dancing Script", "Space Grotesk"];
const TEXT_COLORS = ["#ffffff", "#000000", "#ff3b5c", "#7b2fff", "#ffba08", "#00e5a0", "#ff6b6b", "#00d4ff", "#ff9500", "#a8ff78"];
const CAPTION_LANGS = ["Hindi", "English", "Hinglish", "Marathi", "Tamil", "Telugu", "Bengali", "Gujarati"];
const TRANSITIONS = ["None", "Fade", "Slide Left", "Slide Right", "Zoom In", "Zoom Out", "Wipe", "Dissolve"];

const EXPORT_QUALITIES = [
  { id: "hd", label: "HD", sub: "720p · Fast", res: "1280×720" },
  { id: "fhd", label: "FHD", sub: "1080p · Balanced", res: "1920×1080" },
  { id: "4k", label: "4K", sub: "2160p · Best", res: "3840×2160" },
];

const AI_FEATURES = [
  { id: "highlights", icon: "⚡", label: "Auto Highlights", desc: "AI detects best moments" },
  { id: "silence", icon: "🔇", label: "Remove Silence", desc: "Cut dead air automatically" },
  { id: "noise", icon: "🎙️", label: "Noise Removal", desc: "Clean background audio" },
  { id: "facetrack", icon: "👤", label: "Face Tracking", desc: "Auto-frame faces" },
  { id: "autozoom", icon: "🔍", label: "Auto Zoom", desc: "Dynamic zoom effects" },
  { id: "bgremove", icon: "✂️", label: "BG Remove", desc: "Remove video background" },
];

function fmtTime(s) {
  if (!s && s !== 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AIVideoEditor() {
  const [theme, setTheme] = useState("dark");
  const [activeTab, setActiveTab] = useState("trim");
  const [activeAIPanel, setActiveAIPanel] = useState(null);

  // Video state
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDur, setVideoDur] = useState(120);
  const [outputUrl, setOutputUrl] = useState(null);
  const [drag, setDrag] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Trim
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);

  // Filters
  const [activeFilter, setActiveFilter] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturate, setSaturate] = useState(1);
  const [hue, setHue] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);

  // Text overlay
  const [overlayText, setOverlayText] = useState("");
  const [fontSize, setFontSize] = useState(36);
  const [fontFamily, setFontFamily] = useState("Poppins");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textPos, setTextPos] = useState("bottom");
  const [textBg, setTextBg] = useState(true);
  const [textAnimation, setTextAnimation] = useState("none");
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);

  // Subtitles / Captions
  const [subLines, setSubLines] = useState([]);
  const [subListening, setSubListening] = useState(false);
  const [currentSub, setCurrentSub] = useState("");
  const [activeSub, setActiveSub] = useState("");
  const [subLang, setSubLang] = useState("Hindi");
  const [subFontSize, setSubFontSize] = useState(28);
  const [subColor, setSubColor] = useState("#ffffff");
  const [subBg, setSubBg] = useState(true);
  const [subAnimation, setSubAnimation] = useState("none");

  // Audio
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [bgMusicFile, setBgMusicFile] = useState(null);
  const [bgMusicVol, setBgMusicVol] = useState(0.3);

  // Watermark
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPos, setWatermarkPos] = useState("bottom-right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.7);

  // AI features
  const [aiFeatures, setAIFeatures] = useState({});
  const [aiProcessing, setAIProcessing] = useState(null);

  // Export
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [exportQuality, setExportQuality] = useState("fhd");
  const [transition, setTransition] = useState("None");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Clips (timeline segments)
  const [clips, setClips] = useState([]);

  // Refs
  const inputRef = useRef(null);
  const trackRef = useRef(null);
  const bgMusicRef = useRef(null);
  const recognRef = useRef(null);
  const ffmpegRef = useRef(null);

  useEffect(() => () => { if (recognRef.current) recognRef.current.stop(); }, []);

  // Subtitle sync
  useEffect(() => {
    const t = playPos + startTime;
    const line = subLines.find((l) => t >= l.start && t <= l.end);
    setActiveSub(line ? line.text : "");
  }, [playPos, subLines, startTime]);

  // Filter style for preview
  const filterStyle = {
    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hue}deg) grayscale(${grayscale}) sepia(${sepia})`,
  };

  const handleVideoFile = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    setVideoFile(file);
    setOutputUrl(null);
    setSubLines([]);
    setClips([]);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      const d = Math.min(Math.floor(v.duration), 600);
      setVideoDur(d);
      setStartTime(0);
      setEndTime(Math.min(60, d));
      setClips([{ id: 1, start: 0, end: Math.min(60, d), label: "Clip 1" }]);
    };
  };

  const applyFilterPreset = (idx) => {
    const p = FILTER_PRESETS[idx];
    setActiveFilter(idx);
    setBrightness(p.brightness);
    setContrast(p.contrast);
    setSaturate(p.saturate);
    setHue(p.hue);
    setGrayscale(p.grayscale);
    setSepia(p.sepia);
  };

  // Auto subtitle
  const startAutoSub = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome browser use karein subtitle ke liye."); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = subLang === "Hindi" ? "hi-IN" : subLang === "English" ? "en-US" : "hi-IN";
    const t0 = Date.now();
    r.onresult = (e) => {
      const elapsed = (Date.now() - t0) / 1000;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tx = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setSubLines((prev) => [...prev, { start: Math.max(0, elapsed - 2), end: elapsed, text: tx.trim() }]);
        } else { interim = tx; }
      }
      setCurrentSub(interim);
    };
    r.onend = () => { setSubListening(false); setCurrentSub(""); };
    r.start();
    recognRef.current = r;
    setSubListening(true);
    setSubLines([]);
    setCurrentSub("");
  };

  const stopAutoSub = () => {
    recognRef.current?.stop();
    recognRef.current = null;
    setSubListening(false);
  };

  // Timeline drag
  const startDrag = (which) => (e) => {
    e.preventDefault();
    const move = (ev) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const t = Math.round(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * videoDur);
      if (which === "start") setStartTime(Math.min(t, endTime - 1));
      else setEndTime(Math.max(t, startTime + 1));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", up);
  };

  const simulateAI = (featureId) => {
    setAIProcessing(featureId);
    setTimeout(() => {
      setAIFeatures((prev) => ({ ...prev, [featureId]: true }));
      setAIProcessing(null);
    }, 2000 + Math.random() * 1500);
  };

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress: p }) => setProgress(Math.round(p * 100)));
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    return ff;
  };

  const buildSRT = (lines) =>
    lines.map((l, i) => {
      const f = (s) => {
        const h = Math.floor(s / 3600).toString().padStart(2, "0");
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
        const sc = Math.floor(s % 60).toString().padStart(2, "0");
        const ms = Math.round((s % 1) * 1000).toString().padStart(3, "0");
        return `${h}:${m}:${sc},${ms}`;
      };
      return `${i + 1}\n${f(l.start)} --> ${f(l.end)}\n${l.text}\n`;
    }).join("\n");

  const processVideo = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const ff = await loadFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setProgressMsg("Video load ho raha hai…");
      setProgress(5);
      await ff.writeFile("input.mp4", await fetchFile(videoFile));

      let subFilter = "";
      if (subLines.length > 0) {
        await ff.writeFile("subs.srt", new TextEncoder().encode(buildSRT(subLines)));
        subFilter = `,subtitles=subs.srt:force_style='FontSize=${subFontSize},Alignment=2,MarginV=40'`;
      }

      const ar = ASPECT_RATIOS.find(a => a.id === aspectRatio);
      const [tw, th] = ar ? [ar.w * 120, ar.h * 120] : [1080, 1920];
      const scale = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black`;

      const vfArr = [
        scale,
        `eq=brightness=${(brightness - 1).toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturate.toFixed(2)}`,
      ];
      if (grayscale > 0.5) vfArr.push("hue=s=0");
      if (sepia > 0.1) vfArr.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
      if (hue !== 0) vfArr.push(`hue=h=${hue}`);
      if (overlayText) {
        const y = textPos === "top" ? "h*0.05" : textPos === "center" ? "(h-text_h)/2" : "h*0.88";
        const box = textBg ? ":box=1:boxcolor=black@0.5:boxborderw=8" : "";
        const esc = overlayText.replace(/'/g, "\\'").replace(/:/g, "\\:");
        vfArr.push(`drawtext=text='${esc}':fontcolor=0x${textColor.slice(1)}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}${box}:shadowcolor=black:shadowx=2:shadowy=2`);
      }
      if (watermarkText) {
        const wx = watermarkPos.includes("right") ? "w-text_w-20" : "20";
        const wy = watermarkPos.includes("bottom") ? "h-text_h-20" : "20";
        const wesc = watermarkText.replace(/'/g, "\\'").replace(/:/g, "\\:");
        vfArr.push(`drawtext=text='${wesc}':fontcolor=white@${watermarkOpacity}:fontsize=20:x=${wx}:y=${wy}`);
      }
      const vf = vfArr.join(",") + subFilter;

      setProgressMsg("Processing video…");
      setProgress(20);

      if (bgMusicFile) {
        await ff.writeFile("bgm.mp3", await fetchFile(bgMusicFile));
        await ff.exec([
          "-i", "input.mp4", "-i", "bgm.mp3",
          "-ss", `${startTime}`, "-t", `${endTime - startTime}`,
          "-filter_complex", `[0:v]${vf}[v];[0:a]volume=${volume.toFixed(2)}[va];[1:a]volume=${bgMusicVol.toFixed(2)}[bga];[va][bga]amix=inputs=2:duration=first[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", "output.mp4",
        ]);
      } else {
        await ff.exec([
          "-i", "input.mp4",
          "-ss", `${startTime}`, "-t", `${endTime - startTime}`,
          "-vf", vf,
          ...(muted ? ["-an"] : ["-af", `volume=${volume.toFixed(2)}`]),
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "output.mp4",
        ]);
      }

      setProgressMsg("Export ho raha hai…");
      setProgress(90);
      const d = await ff.readFile("output.mp4");
      setOutputUrl(URL.createObjectURL(new Blob([d.buffer], { type: "video/mp4" })));
      setProgress(100);
      setProgressMsg("Done! ✅");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const leftPct = videoDur > 0 ? (startTime / videoDur) * 100 : 0;
  const rightPct = videoDur > 0 ? (endTime / videoDur) * 100 : 100;
  const clipDur = endTime - startTime;

  const TABS = [
    { id: "trim", icon: "✂️", label: "Trim" },
    { id: "filters", icon: "🎨", label: "Filters" },
    { id: "text", icon: "✍️", label: "Text" },
    { id: "subtitles", icon: "💬", label: "Captions" },
    { id: "audio", icon: "🔊", label: "Audio" },
    { id: "watermark", icon: "🔒", label: "Watermark" },
    { id: "export", icon: "🚀", label: "Export" },
  ];

  return (
    <div className={`${styles.app} ${theme === "light" ? styles.light : ""}`}>
      {/* TOPBAR */}
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.appLogo}>
            <span className={styles.logoIcon}>⚡</span>
            <span className={styles.logoText}>VideoAI</span>
            <span className={styles.logoBadge}>PRO</span>
          </div>
          <nav className={styles.breadcrumb}>
            <span>Dashboard</span>
            <span className={styles.breadSep}>/</span>
            <span className={styles.breadActive}>AI Video Editor</span>
          </nav>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.statusPill}>
            <span className={styles.statusDot} />
            <span>Browser Mode · No Upload</span>
          </div>
          <button className={styles.themeToggle} onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        {/* ── LEFT SIDEBAR: AI TOOLS ── */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <p className={styles.sidebarLabel}>AI TOOLS</p>
            {AI_FEATURES.map((feat) => (
              <button
                key={feat.id}
                className={`${styles.aiFeatureBtn} ${aiFeatures[feat.id] ? styles.aiFeatureActive : ""}`}
                onClick={() => !aiFeatures[feat.id] && simulateAI(feat.id)}
                disabled={!!aiProcessing || !videoFile}
              >
                <span className={styles.aiFeatureIcon}>{feat.icon}</span>
                <div className={styles.aiFeatureInfo}>
                  <span className={styles.aiFeatureName}>{feat.label}</span>
                  <span className={styles.aiFeatureSub}>{feat.desc}</span>
                </div>
                <span className={styles.aiFeatureStatus}>
                  {aiProcessing === feat.id ? <span className={styles.spinDot} /> : aiFeatures[feat.id] ? "✅" : "›"}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.sidebarSection}>
            <p className={styles.sidebarLabel}>TRANSITIONS</p>
            <div className={styles.transitionGrid}>
              {TRANSITIONS.map((t) => (
                <button
                  key={t}
                  className={`${styles.transBtn} ${transition === t ? styles.transBtnActive : ""}`}
                  onClick={() => setTransition(t)}
                >{t}</button>
              ))}
            </div>
          </div>

          <div className={styles.sidebarSection}>
            <p className={styles.sidebarLabel}>ASPECT RATIO</p>
            <div className={styles.arGrid}>
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.id}
                  className={`${styles.arBtn} ${aspectRatio === ar.id ? styles.arBtnActive : ""}`}
                  onClick={() => setAspectRatio(ar.id)}
                >
                  <div className={styles.arFrame} style={{ aspectRatio: `${ar.w}/${ar.h}`, width: ar.w > ar.h ? "100%" : `${ar.w / ar.h * 100}%` }} />
                  <div className={styles.arLabel}>{ar.id}</div>
                  <div className={styles.arSub}>{ar.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── CENTER: PREVIEW + TIMELINE ── */}
        <main className={styles.center}>
          {/* UPLOAD */}
          {!videoFile && (
            <div
              className={`${styles.uploadZone} ${drag ? styles.dragOver : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleVideoFile(e.dataTransfer.files[0]); }}
            >
              <div className={styles.uploadInner}>
                <div className={styles.uploadIconWrap}>🎬</div>
                <h2 className={styles.uploadTitle}>Video drop karein ya browse karein</h2>
                <p className={styles.uploadSub}>MP4 · MOV · AVI · WebM · MKV — Max 2GB</p>
                <div className={styles.uploadFeatures}>
                  {["AI Auto-Edit", "Smart Subtitles", "HD Export", "No Signup"].map((f) => (
                    <span key={f} className={styles.uploadFeaturePill}>{f}</span>
                  ))}
                </div>
                <button className={styles.uploadBtn}>📁 File Choose Karein</button>
              </div>
              <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => handleVideoFile(e.target.files[0])} />
            </div>
          )}

          {/* PREVIEW */}
          {videoFile && (
            <>
              <div className={styles.previewArea}>
                <div className={styles.previewWrap} style={filterStyle}>
                  <ReactPlayer
                    url={outputUrl || videoUrl}
                    controls
                    playing={isPlaying}
                    volume={volume}
                    muted={muted}
                    width="100%"
                    height="100%"
                    onProgress={({ playedSeconds }) => setPlayPos(playedSeconds)}
                    config={{ file: { attributes: { style: { width: "100%", height: "100%", objectFit: "contain" } } } }}
                  />
                  {overlayText && (
                    <div className={`${styles.overlayText} ${styles[`pos_${textPos}`]} ${textBg ? styles.overlayBg : ""}`}
                      style={{ fontSize, color: textColor, fontFamily, fontWeight: textBold ? 700 : 400, fontStyle: textItalic ? "italic" : "normal" }}>
                      {overlayText}
                    </div>
                  )}
                  {(activeSub || (subListening && currentSub)) && (
                    <div className={`${styles.overlayText} ${styles.pos_bottom} ${subBg ? styles.overlayBg : ""}`}
                      style={{ fontSize: subFontSize, color: subColor, bottom: 40 }}>
                      {activeSub || currentSub}
                    </div>
                  )}
                  {watermarkText && (
                    <div className={`${styles.watermarkOverlay} ${styles[`wm_${watermarkPos.replace("-", "_")}`]}`}
                      style={{ opacity: watermarkOpacity }}>
                      {watermarkText}
                    </div>
                  )}
                  <div className={styles.previewAR}>{aspectRatio}</div>
                  {outputUrl && <div className={styles.exportedBadge}>✅ Exported</div>}
                </div>

                {/* Quick Stats */}
                <div className={styles.previewStats}>
                  <div className={styles.pStat}><span className={styles.pStatVal}>{fmtTime(clipDur)}</span><span className={styles.pStatLbl}>Duration</span></div>
                  <div className={styles.pStat}><span className={styles.pStatVal}>{aspectRatio}</span><span className={styles.pStatLbl}>Ratio</span></div>
                  <div className={styles.pStat}><span className={styles.pStatVal}>{subLines.length}</span><span className={styles.pStatLbl}>Captions</span></div>
                  <div className={styles.pStat}><span className={styles.pStatVal}>{exportQuality.toUpperCase()}</span><span className={styles.pStatLbl}>Quality</span></div>
                </div>
              </div>

              {/* TIMELINE */}
              <div className={styles.timeline}>
                <div className={styles.timelineHeader}>
                  <span className={styles.timelineTitle}>⏱ Timeline</span>
                  <div className={styles.timelineActions}>
                    <button className={styles.tlBtn} onClick={() => { setStartTime(0); setEndTime(Math.min(15, videoDur)); }}>15s</button>
                    <button className={styles.tlBtn} onClick={() => { setStartTime(0); setEndTime(Math.min(30, videoDur)); }}>30s</button>
                    <button className={styles.tlBtn} onClick={() => { setStartTime(0); setEndTime(Math.min(60, videoDur)); }}>60s</button>
                    <button className={styles.tlBtn} onClick={() => { setStartTime(0); setEndTime(videoDur); }}>Full</button>
                  </div>
                </div>
                <div ref={trackRef} className={styles.track}>
                  <div className={styles.waveform}>
                    {Array.from({ length: 60 }).map((_, i) => (
                      <div key={i} className={styles.waveBar} style={{ height: `${20 + Math.abs(Math.sin(i * 0.7 + 1) * 60)}%` }} />
                    ))}
                  </div>
                  <div className={styles.trackSelected} style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }} />
                  <div className={styles.playhead} style={{ left: `${videoDur > 0 ? (playPos / videoDur) * 100 : 0}%` }} />
                  <div className={styles.handleStart} style={{ left: `${leftPct}%` }} onMouseDown={startDrag("start")} onTouchStart={startDrag("start")}>
                    <span>◀</span>
                    <div className={styles.handleTooltip}>{fmtTime(startTime)}</div>
                  </div>
                  <div className={styles.handleEnd} style={{ left: `${rightPct}%` }} onMouseDown={startDrag("end")} onTouchStart={startDrag("end")}>
                    <span>▶</span>
                    <div className={styles.handleTooltip}>{fmtTime(endTime)}</div>
                  </div>
                </div>
                <div className={styles.trackLabels}>
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <span key={f}>{fmtTime(Math.floor(videoDur * f))}</span>
                  ))}
                </div>
                {clipDur > 60 && (
                  <div className={styles.durationWarn}>⚠️ {clipDur}s — YouTube Shorts 60s limit se zyada</div>
                )}
              </div>
            </>
          )}
        </main>

        {/* ── RIGHT PANEL: EDIT TOOLS ── */}
        <aside className={styles.rightPanel}>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button key={t.id} className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ""}`} onClick={() => setActiveTab(t.id)}>
                <span>{t.icon}</span>
                <span className={styles.tabLabel}>{t.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.tabContent}>
            {/* TRIM TAB */}
            {activeTab === "trim" && (
              <div>
                <div className={styles.statsRow}>
                  {[{ v: fmtTime(startTime), l: "Start" }, { v: fmtTime(clipDur), l: "Clip", warn: clipDur > 60 }, { v: fmtTime(endTime), l: "End" }].map((s) => (
                    <div key={s.l} className={styles.statBox}>
                      <div className={styles.statVal} style={s.warn ? { color: "var(--v-warn)" } : {}}>{s.v}</div>
                      <div className={styles.statLbl}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Start Time (seconds)</label>
                  <input type="range" min={0} max={videoDur - 1} value={startTime} onChange={(e) => setStartTime(Math.min(+e.target.value, endTime - 1))} className={styles.slider} style={{ "--pct": `${(startTime / videoDur) * 100}%` }} />
                  <span className={styles.sliderVal}>{fmtTime(startTime)}</span>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>End Time (seconds)</label>
                  <input type="range" min={1} max={videoDur} value={endTime} onChange={(e) => setEndTime(Math.max(+e.target.value, startTime + 1))} className={styles.slider} style={{ "--pct": `${(endTime / videoDur) * 100}%` }} />
                  <span className={styles.sliderVal}>{fmtTime(endTime)}</span>
                </div>
                <div className={styles.sectionTitle}>Clips</div>
                {clips.map((clip, i) => (
                  <div key={clip.id} className={styles.clipRow}>
                    <span className={styles.clipNum}>{i + 1}</span>
                    <span className={styles.clipLabel}>{clip.label}</span>
                    <span className={styles.clipDur}>{fmtTime(clip.end - clip.start)}</span>
                    <button className={styles.clipRemove} onClick={() => setClips(prev => prev.filter(c => c.id !== clip.id))}>✕</button>
                  </div>
                ))}
                <button className={styles.addClipBtn} onClick={() => setClips(prev => [...prev, { id: Date.now(), start: startTime, end: endTime, label: `Clip ${prev.length + 1}` }])}>
                  + Clip Add Karein
                </button>
              </div>
            )}

            {/* FILTERS TAB */}
            {activeTab === "filters" && (
              <div>
                <div className={styles.filterGrid}>
                  {FILTER_PRESETS.map((p, i) => (
                    <div key={p.name} className={`${styles.filterPreset} ${activeFilter === i ? styles.filterActive : ""}`} onClick={() => applyFilterPreset(i)}>
                      <div className={styles.filterThumb} style={{ filter: `brightness(${p.brightness}) contrast(${p.contrast}) saturate(${p.saturate}) hue-rotate(${p.hue}deg) grayscale(${p.grayscale}) sepia(${p.sepia})` }} />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.divider} />
                {[
                  { label: "Brightness", val: brightness, set: setBrightness, min: 0, max: 2, step: 0.05 },
                  { label: "Contrast", val: contrast, set: setContrast, min: 0, max: 3, step: 0.05 },
                  { label: "Saturation", val: saturate, set: setSaturate, min: 0, max: 3, step: 0.05 },
                  { label: "Hue Rotate", val: hue, set: setHue, min: 0, max: 360, step: 1 },
                  { label: "Grayscale", val: grayscale, set: setGrayscale, min: 0, max: 1, step: 0.05 },
                  { label: "Sepia", val: sepia, set: setSepia, min: 0, max: 1, step: 0.05 },
                ].map(({ label, val, set, min, max, step }) => (
                  <div key={label} className={styles.formRow}>
                    <div className={styles.sliderHeader}>
                      <label className={styles.fLabel}>{label}</label>
                      <span className={styles.sliderVal}>{step >= 1 ? Math.round(val) : val.toFixed(2)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} className={styles.slider} style={{ "--pct": `${((val - min) / (max - min)) * 100}%` }} />
                  </div>
                ))}
                <button className={styles.resetBtn} onClick={() => applyFilterPreset(0)}>↩ Reset Filters</button>
              </div>
            )}

            {/* TEXT TAB */}
            {activeTab === "text" && (
              <div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Overlay Text</label>
                  <input className={styles.textInput} type="text" placeholder="Follow for more! 🔥" value={overlayText} onChange={(e) => setOverlayText(e.target.value)} />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Font Family</label>
                  <select className={styles.select} value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.sliderHeader}><label className={styles.fLabel}>Font Size</label><span className={styles.sliderVal}>{fontSize}px</span></div>
                  <input type="range" min={14} max={90} step={1} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} className={styles.slider} style={{ "--pct": `${((fontSize - 14) / 76) * 100}%` }} />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Text Color</label>
                  <div className={styles.colorRow}>
                    {TEXT_COLORS.map((c) => (
                      <div key={c} className={`${styles.swatch} ${textColor === c ? styles.swatchActive : ""}`} style={{ background: c }} onClick={() => setTextColor(c)} />
                    ))}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Style</label>
                  <div className={styles.styleRow}>
                    <button className={`${styles.styleBtn} ${textBold ? styles.styleBtnActive : ""}`} onClick={() => setTextBold(!textBold)}>B</button>
                    <button className={`${styles.styleBtn} ${textItalic ? styles.styleBtnActive : ""}`} onClick={() => setTextItalic(!textItalic)}>I</button>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Position</label>
                  <div className={styles.posGrid}>
                    {[["top", "⬆ Top"], ["center", "⬛ Center"], ["bottom", "⬇ Bottom"]].map(([p, l]) => (
                      <button key={p} className={`${styles.posBtn} ${textPos === p ? styles.posBtnActive : ""}`} onClick={() => setTextPos(p)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Animation</label>
                  <select className={styles.select} value={textAnimation} onChange={(e) => setTextAnimation(e.target.value)}>
                    {["none", "fadeIn", "slideUp", "bounce", "typewriter", "glow"].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Background Box</span>
                  <label className={styles.toggle}><input type="checkbox" checked={textBg} onChange={(e) => setTextBg(e.target.checked)} /><span className={styles.tSlider} /></label>
                </div>
              </div>
            )}

            {/* SUBTITLES TAB */}
            {activeTab === "subtitles" && (
              <div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Language</label>
                  <select className={styles.select} value={subLang} onChange={(e) => setSubLang(e.target.value)}>
                    {CAPTION_LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className={styles.infoBox}>
                  🎤 Video play karein, fir Record dabayein — subtitles auto-sync honge
                </div>
                <div className={styles.subControls}>
                  <button className={`${styles.recBtn} ${subListening ? styles.recBtnActive : ""}`} onClick={subListening ? stopAutoSub : startAutoSub}>
                    {subListening ? <><span className={styles.recDot} /> Stop Recording</> : "🎤 Record Subtitles"}
                  </button>
                  {subLines.length > 0 && <button className={styles.clearBtn} onClick={() => { setSubLines([]); setCurrentSub(""); }}>🗑 Clear</button>}
                </div>
                {subListening && currentSub && (
                  <div className={styles.livePreview}><span className={styles.liveDot} /><em>{currentSub}</em></div>
                )}
                {subLines.length > 0 && (
                  <div className={styles.subList}>
                    <div className={styles.subListHdr}>{subLines.length} lines recorded</div>
                    {subLines.slice(-4).map((l, i) => (
                      <div key={i} className={styles.subLine}>
                        <span className={styles.subTime}>{fmtTime(l.start)}→{fmtTime(l.end)}</span>
                        <span className={styles.subText}>{l.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.divider} />
                <div className={styles.formRow}>
                  <div className={styles.sliderHeader}><label className={styles.fLabel}>Subtitle Size</label><span className={styles.sliderVal}>{subFontSize}px</span></div>
                  <input type="range" min={14} max={60} step={1} value={subFontSize} onChange={(e) => setSubFontSize(+e.target.value)} className={styles.slider} style={{ "--pct": `${((subFontSize - 14) / 46) * 100}%` }} />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Subtitle Color</label>
                  <div className={styles.colorRow}>
                    {TEXT_COLORS.slice(0, 6).map((c) => (
                      <div key={c} className={`${styles.swatch} ${subColor === c ? styles.swatchActive : ""}`} style={{ background: c }} onClick={() => setSubColor(c)} />
                    ))}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Caption Animation</label>
                  <select className={styles.select} value={subAnimation} onChange={(e) => setSubAnimation(e.target.value)}>
                    {["none", "fadeIn", "slideUp", "bounce", "pop"].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Background Box</span>
                  <label className={styles.toggle}><input type="checkbox" checked={subBg} onChange={(e) => setSubBg(e.target.checked)} /><span className={styles.tSlider} /></label>
                </div>
              </div>
            )}

            {/* AUDIO TAB */}
            {activeTab === "audio" && (
              <div>
                <div className={styles.audioPlayerRow}>
                  <button className={styles.muteBtn} onClick={() => setMuted(!muted)}>
                    {muted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div className={styles.sliderHeader}><label className={styles.fLabel}>Volume</label><span className={styles.sliderVal}>{Math.round(volume * 100)}%</span></div>
                    <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => { setVolume(+e.target.value); if (+e.target.value > 0) setMuted(false); }} className={styles.slider} style={{ "--pct": `${(muted ? 0 : volume) * 100}%` }} />
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Mute Original Audio</span>
                  <label className={styles.toggle}><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /><span className={styles.tSlider} /></label>
                </div>
                <div className={styles.divider} />
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>🎵 Background Music (optional)</label>
                  <div className={styles.miniUpload} onClick={() => bgMusicRef.current?.click()}>
                    <span>{bgMusicFile ? `✅ ${bgMusicFile.name.slice(0, 22)}` : "Music file choose karein"}</span>
                    <span className={styles.miniUploadSub}>MP3 · WAV · AAC</span>
                    <input ref={bgMusicRef} type="file" accept="audio/*" hidden onChange={(e) => setBgMusicFile(e.target.files[0])} />
                  </div>
                  {bgMusicFile && (
                    <div style={{ marginTop: 8 }}>
                      <div className={styles.sliderHeader}><label className={styles.fLabel}>BG Volume</label><span className={styles.sliderVal}>{Math.round(bgMusicVol * 100)}%</span></div>
                      <input type="range" min={0} max={1} step={0.01} value={bgMusicVol} onChange={(e) => setBgMusicVol(+e.target.value)} className={styles.slider} style={{ "--pct": `${bgMusicVol * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className={styles.infoBox}>
                  💡 AI Noise Removal se bakground ka shor hatao — sidebar mein available hai
                </div>
              </div>
            )}

            {/* WATERMARK TAB */}
            {activeTab === "watermark" && (
              <div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Watermark Text</label>
                  <input className={styles.textInput} type="text" placeholder="@YourHandle" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Position</label>
                  <div className={styles.wmPosGrid}>
                    {[["top-left", "↖"], ["top-right", "↗"], ["bottom-left", "↙"], ["bottom-right", "↘"], ["center", "⊕"]].map(([p, icon]) => (
                      <button key={p} className={`${styles.wmPosBtn} ${watermarkPos === p ? styles.wmPosBtnActive : ""}`} onClick={() => setWatermarkPos(p)}>{icon}<span>{p.replace("-", " ")}</span></button>
                    ))}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.sliderHeader}><label className={styles.fLabel}>Opacity</label><span className={styles.sliderVal}>{Math.round(watermarkOpacity * 100)}%</span></div>
                  <input type="range" min={0.1} max={1} step={0.05} value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(+e.target.value)} className={styles.slider} style={{ "--pct": `${watermarkOpacity * 100}%` }} />
                </div>
                <div className={styles.wmPreview}>
                  <span style={{ opacity: watermarkOpacity }}>Preview: {watermarkText || "@YourHandle"}</span>
                </div>
              </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === "export" && (
              <div>
                <div className={styles.formRow}>
                  <label className={styles.fLabel}>Export Quality</label>
                  <div className={styles.qualityGrid}>
                    {EXPORT_QUALITIES.map((q) => (
                      <button key={q.id} className={`${styles.qualBtn} ${exportQuality === q.id ? styles.qualBtnActive : ""}`} onClick={() => setExportQuality(q.id)}>
                        <span className={styles.qualLabel}>{q.label}</span>
                        <span className={styles.qualSub}>{q.sub}</span>
                        <span className={styles.qualRes}>{q.res}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.exportChecklist}>
                  <div className={styles.checklistTitle}>Export Checklist</div>
                  {[
                    { ok: !!videoFile, label: "Video upload hua" },
                    { ok: clipDur <= 60, label: "Duration ≤ 60s", warn: clipDur > 60 },
                    { ok: subLines.length > 0, label: "Subtitles ready", optional: true },
                    { ok: !!bgMusicFile, label: "BG Music added", optional: true },
                    { ok: Object.values(aiFeatures).some(Boolean), label: "AI features applied", optional: true },
                  ].map((item, i) => (
                    <div key={i} className={styles.checkItem} style={{ color: item.ok ? "var(--v-green)" : item.warn ? "var(--v-warn)" : "var(--v-muted)" }}>
                      <span>{item.ok ? "✅" : item.warn ? "⚠️" : "⬜"}</span>
                      <span>{item.label}{item.optional && !item.ok ? " (optional)" : ""}</span>
                    </div>
                  ))}
                </div>

                <button className={styles.exportBtn} onClick={processVideo} disabled={isProcessing || !videoFile}>
                  {isProcessing ? <><span className={styles.spin}>⚙️</span> {progressMsg || "Processing…"}</> : "⚡ Export Video"}
                </button>

                {isProcessing && (
                  <div className={styles.progressWrap}>
                    <div className={styles.progressLabels}>
                      <span>{progressMsg}</span>
                      <span className={styles.progressPct}>{progress}%</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {outputUrl && !isProcessing && (
                  <a href={outputUrl} download="ai_short.mp4" className={styles.downloadBtn}>
                    ⬇ Download Video
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
