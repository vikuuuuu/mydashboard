"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import styles from "./myvideo.module.css";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FILTER_PRESETS = [
  {
    name: "Normal",
    brightness: 1,
    contrast: 1,
    grayscale: 0,
    sepia: 0,
    saturation: 1,
    hue: 0,
  },
  {
    name: "Vivid",
    brightness: 1.1,
    contrast: 1.3,
    grayscale: 0,
    sepia: 0,
    saturation: 1.6,
    hue: 0,
  },
  {
    name: "Noir",
    brightness: 0.9,
    contrast: 1.4,
    grayscale: 1,
    sepia: 0,
    saturation: 0,
    hue: 0,
  },
  {
    name: "Warm",
    brightness: 1.05,
    contrast: 1.1,
    grayscale: 0,
    sepia: 0.5,
    saturation: 1.2,
    hue: 15,
  },
  {
    name: "Cool",
    brightness: 1,
    contrast: 1.1,
    grayscale: 0,
    sepia: 0,
    saturation: 0.9,
    hue: 180,
  },
  {
    name: "Drama",
    brightness: 0.85,
    contrast: 1.6,
    grayscale: 0,
    sepia: 0.1,
    saturation: 1.3,
    hue: 0,
  },
  {
    name: "Sunset",
    brightness: 1.1,
    contrast: 1.2,
    grayscale: 0,
    sepia: 0.3,
    saturation: 1.4,
    hue: -10,
  },
  {
    name: "Cyber",
    brightness: 1,
    contrast: 1.5,
    grayscale: 0,
    sepia: 0,
    saturation: 2,
    hue: 120,
  },
  {
    name: "Fade",
    brightness: 1.15,
    contrast: 0.8,
    grayscale: 0,
    sepia: 0.1,
    saturation: 0.7,
    hue: 0,
  },
];
const TEXT_COLORS = [
  "#ffffff",
  "#000000",
  "#ff3b5c",
  "#7b2fff",
  "#ffba08",
  "#00e5a0",
  "#ff9500",
  "#ff2d55",
  "#00d4ff",
  "#ff6b6b",
];

function fmtTime(s) {
  if (!s && s !== 0) return "00:00";
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function MyVideoEditor() {
  // MODE
  const [mode, setMode] = useState("video"); // "video" | "audio"

  // VIDEO
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDur, setVideoDur] = useState(60);
  const [outputUrl, setOutputUrl] = useState(null);

  // AUDIO→VIDEO
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDur, setAudioDur] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [photoOutput, setPhotoOutput] = useState(null);

  // TRIM
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);

  // FILTERS
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);

  // TEXT
  const [overlayText, setOverlayText] = useState("");
  const [fontSize, setFontSize] = useState(36);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textPos, setTextPos] = useState("bottom");
  const [textBg, setTextBg] = useState(true);

  // SUBTITLES
  const [subLines, setSubLines] = useState([]);
  const [subFontSize, setSubFontSize] = useState(28);
  const [subColor, setSubColor] = useState("#ffffff");
  const [subBg, setSubBg] = useState(true);
  const [subListening, setSubListening] = useState(false);
  const [currentSub, setCurrentSub] = useState("");
  const [activeSub, setActiveSub] = useState("");

  // AUDIO
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [bgMusicFile, setBgMusicFile] = useState(null);
  const [bgMusicVol, setBgMusicVol] = useState(0.3);

  // UI
  const [activeTab, setActiveTab] = useState("trim");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [drag, setDrag] = useState(false);
  const [audioDrag, setAudioDrag] = useState(false);
  const [photoDrag, setPhotoDrag] = useState(false);
  const [playPos, setPlayPos] = useState(0);

  // REFS
  const ffmpegRef = useRef(null);
  const trackRef = useRef(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const photoRef = useRef(null);
  const bgMusicRef = useRef(null);
  const recognRef = useRef(null);

  useEffect(
    () => () => {
      if (recognRef.current) recognRef.current.stop();
    },
    [],
  );

  // subtitle sync with playback
  useEffect(() => {
    const t = playPos + startTime;
    const line = subLines.find((l) => t >= l.start && t <= l.end);
    setActiveSub(line ? line.text : "");
  }, [playPos, subLines, startTime]);

  // ── File Handlers ──────────────────────────────────────────────────────────
  const handleVideoFile = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    setVideoFile(file);
    setOutputUrl(null);
    setSubLines([]);
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
    };
  };

  const handleAudioFile = (file) => {
    if (!file || !file.type.startsWith("audio/")) return;
    setAudioFile(file);
    setPhotoOutput(null);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => setAudioDur(Math.floor(a.duration));
  };

  const handlePhotos = (files) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) =>
      [
        ...prev,
        ...arr.map((f) => ({
          file: f,
          url: URL.createObjectURL(f),
          name: f.name,
        })),
      ].slice(0, 20),
    );
  };

  // ── Auto Subtitles ─────────────────────────────────────────────────────────
  const startAutoSub = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Use Chrome for subtitle recording.");
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "hi-IN";
    const t0 = Date.now();
    r.onresult = (e) => {
      const elapsed = (Date.now() - t0) / 1000;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tx = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setSubLines((prev) => [
            ...prev,
            { start: Math.max(0, elapsed - 2), end: elapsed, text: tx.trim() },
          ]);
        } else {
          interim = tx;
        }
      }
      setCurrentSub(interim);
    };
    r.onend = () => {
      setSubListening(false);
      setCurrentSub("");
    };
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

  // ── FFmpeg Loader ──────────────────────────────────────────────────────────
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

  // ── SRT Builder ────────────────────────────────────────────────────────────
  const buildSRT = (lines) =>
    lines
      .map((l, i) => {
        const f = (s) => {
          const h = Math.floor(s / 3600)
            .toString()
            .padStart(2, "0");
          const m = Math.floor((s % 3600) / 60)
            .toString()
            .padStart(2, "0");
          const sc = Math.floor(s % 60)
            .toString()
            .padStart(2, "0");
          const ms = Math.round((s % 1) * 1000)
            .toString()
            .padStart(3, "0");
          return `${h}:${m}:${sc},${ms}`;
        };
        return `${i + 1}\n${f(l.start)} --> ${f(l.end)}\n${l.text}\n`;
      })
      .join("\n");

  // ── Process Video → Short ──────────────────────────────────────────────────
  const processVideo = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const ff = await loadFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setProgressMsg("Reading video…");
      setProgress(5);
      await ff.writeFile("input.mp4", await fetchFile(videoFile));

      let subFilter = "";
      if (subLines.length > 0) {
        await ff.writeFile(
          "subs.srt",
          new TextEncoder().encode(buildSRT(subLines)),
        );
        subFilter = `,subtitles=subs.srt:force_style='FontSize=${subFontSize},Alignment=2,MarginV=40'`;
      }

      const vfArr = [
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
        `eq=brightness=${(brightness - 1).toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`,
      ];
      if (grayscale > 0.5) vfArr.push("hue=s=0");
      if (sepia > 0.1)
        vfArr.push(
          "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
        );
      if (hue !== 0) vfArr.push(`hue=h=${hue}`);
      if (overlayText) {
        const y =
          textPos === "top"
            ? "h*0.05"
            : textPos === "center"
              ? "(h-text_h)/2"
              : "h*0.88";
        const box = textBg ? ":box=1:boxcolor=black@0.5:boxborderw=8" : "";
        const esc = overlayText.replace(/'/g, "\\'").replace(/:/g, "\\:");
        vfArr.push(
          `drawtext=text='${esc}':fontcolor=0x${textColor.slice(1)}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}${box}:shadowcolor=black:shadowx=2:shadowy=2`,
        );
      }
      const vf = vfArr.join(",") + subFilter;

      setProgressMsg("Processing video…");
      setProgress(15);
      if (bgMusicFile) {
        await ff.writeFile("bgm.mp3", await fetchFile(bgMusicFile));
        await ff.exec([
          "-i",
          "input.mp4",
          "-i",
          "bgm.mp3",
          "-ss",
          `${startTime}`,
          "-t",
          `${endTime - startTime}`,
          "-filter_complex",
          `[0:v]${vf}[v];[0:a]volume=${volume.toFixed(2)}[va];[1:a]volume=${bgMusicVol.toFixed(2)}[bga];[va][bga]amix=inputs=2:duration=first[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "22",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "-shortest",
          "output.mp4",
        ]);
      } else {
        await ff.exec([
          "-i",
          "input.mp4",
          "-ss",
          `${startTime}`,
          "-t",
          `${endTime - startTime}`,
          "-vf",
          vf,
          ...(muted ? ["-an"] : ["-af", `volume=${volume.toFixed(2)}`]),
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "22",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          "output.mp4",
        ]);
      }
      setProgressMsg("Packaging…");
      setProgress(92);
      const d = await ff.readFile("output.mp4");
      setOutputUrl(
        URL.createObjectURL(new Blob([d.buffer], { type: "video/mp4" })),
      );
      setProgress(100);
      setProgressMsg("Done! ✅");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Process Audio → Short Video ────────────────────────────────────────────
  const processAudioToVideo = async () => {
    if (!audioFile) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const ff = await loadFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setProgressMsg("Loading audio…");
      setProgress(5);
      await ff.writeFile("audio.mp3", await fetchFile(audioFile));
      const dur = audioDur || 60;

      if (photos.length === 0) {
        setProgressMsg("Creating background…");
        setProgress(15);
        await ff.exec([
          "-f",
          "lavfi",
          "-i",
          `color=black:size=1080x1920:rate=30:duration=${dur}`,
          "-i",
          "audio.mp3",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          "-movflags",
          "+faststart",
          "combined.mp4",
        ]);
      } else {
        setProgressMsg("Uploading photos…");
        setProgress(10);
        const perPhoto = Math.max(1, Math.ceil(dur / photos.length));
        for (let i = 0; i < photos.length; i++) {
          await ff.writeFile(`p${i}.jpg`, await fetchFile(photos[i].file));
        }
        let concat = "";
        photos.forEach((_, i) => {
          concat += `file 'p${i}.jpg'\nduration ${perPhoto}\n`;
        });
        concat += `file 'p${photos.length - 1}.jpg'\n`;
        await ff.writeFile("photos.txt", new TextEncoder().encode(concat));

        setProgressMsg("Building slideshow…");
        setProgress(25);
        await ff.exec([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "photos.txt",
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-r",
          "30",
          "-t",
          `${dur}`,
          "slideshow.mp4",
        ]);

        setProgressMsg("Merging audio…");
        setProgress(55);
        await ff.exec([
          "-i",
          "slideshow.mp4",
          "-i",
          "audio.mp3",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          "-movflags",
          "+faststart",
          "combined.mp4",
        ]);
      }

      let subFilter = "";
      if (subLines.length > 0) {
        await ff.writeFile(
          "subs.srt",
          new TextEncoder().encode(buildSRT(subLines)),
        );
        subFilter = `,subtitles=subs.srt:force_style='FontSize=${subFontSize},Alignment=2,MarginV=40'`;
      }
      const vfArr = [
        `eq=brightness=${(brightness - 1).toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`,
      ];
      if (overlayText) {
        const y =
          textPos === "top"
            ? "h*0.05"
            : textPos === "center"
              ? "(h-text_h)/2"
              : "h*0.88";
        const box = textBg ? ":box=1:boxcolor=black@0.5:boxborderw=8" : "";
        const esc = overlayText.replace(/'/g, "\\'").replace(/:/g, "\\:");
        vfArr.push(
          `drawtext=text='${esc}':fontcolor=0x${textColor.slice(1)}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}${box}`,
        );
      }
      const vf = vfArr.join(",") + subFilter;

      setProgressMsg("Applying effects…");
      setProgress(72);
      await ff.exec([
        "-i",
        "combined.mp4",
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "22",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "final.mp4",
      ]);

      setProgressMsg("Packaging…");
      setProgress(95);
      const d = await ff.readFile("final.mp4");
      setPhotoOutput(
        URL.createObjectURL(new Blob([d.buffer], { type: "video/mp4" })),
      );
      setProgress(100);
      setProgressMsg("Done! ✅");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Timeline Drag ──────────────────────────────────────────────────────────
  const startDrag = (which) => (e) => {
    e.preventDefault();
    const move = (ev) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const t = Math.round(
        Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * videoDur,
      );
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

  const leftPct = videoDur > 0 ? (startTime / videoDur) * 100 : 0;
  const rightPct = videoDur > 0 ? (endTime / videoDur) * 100 : 100;
  const clipDur = endTime - startTime;
  const filterStyle = {
    filter: `brightness(${brightness}) contrast(${contrast}) grayscale(${grayscale}) sepia(${sepia}) saturate(${saturation}) hue-rotate(${hue}deg)`,
  };
  const activeOutput = mode === "video" ? outputUrl : photoOutput;
  const TABS_VIDEO = ["trim", "filters", "text", "subtitles", "audio"];
  const TABS_AUDIO = ["filters", "text", "subtitles", "audio"];
  const TABS = mode === "video" ? TABS_VIDEO : TABS_AUDIO;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>⚡ ShortsAI</span>
          <span className={styles.tagline}>YouTube Shorts Creator</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.badge}>BETA</span>
          <span className={styles.onlineDot} />
          <span className={styles.headerHint}>100% Browser · No Upload</span>
        </div>
      </header>

      {/* MODE SWITCHER */}
      <div className={styles.modeSwitcher}>
        <button
          className={`${styles.modeBtn} ${mode === "video" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("video")}
        >
          <span className={styles.modeIcon}>🎬</span>
          <div>
            <div className={styles.modeBtnTitle}>Video → Short</div>
            <div className={styles.modeBtnSub}>
              Trim long video · filters · subtitles
            </div>
          </div>
        </button>
        <button
          className={`${styles.modeBtn} ${mode === "audio" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("audio")}
        >
          <span className={styles.modeIcon}>🎵</span>
          <div>
            <div className={styles.modeBtnTitle}>Audio → Short</div>
            <div className={styles.modeBtnSub}>
              Audio + photos → short video
            </div>
          </div>
        </button>
      </div>

      <div className={styles.body}>
        {/* ══════════ LEFT ══════════ */}
        <div className={styles.leftPanel}>
          {/* VIDEO UPLOAD */}
          {mode === "video" && (
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                <span className={styles.icon}>📁</span> Upload Video
              </h3>
              <div
                className={`${styles.uploadZone} ${drag ? styles.dragOver : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  handleVideoFile(e.dataTransfer.files[0]);
                }}
              >
                <span className={styles.uploadIcon}>
                  {videoFile ? "✅" : "🎬"}
                </span>
                <p className={styles.uploadTitle}>
                  {videoFile
                    ? videoFile.name.slice(0, 28)
                    : "Drop video or click to browse"}
                </p>
                <p className={styles.uploadSub}>
                  {videoFile
                    ? `${(videoFile.size / 1048576).toFixed(1)} MB · ${fmtTime(videoDur)} total`
                    : "MP4 · MOV · AVI · WebM"}
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => handleVideoFile(e.target.files[0])}
                />
              </div>
            </section>
          )}

          {/* AUDIO + PHOTOS UPLOAD */}
          {mode === "audio" && (
            <>
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <span className={styles.icon}>🎵</span> Upload Audio
                </h3>
                <div
                  className={`${styles.uploadZone} ${audioDrag ? styles.dragOver : ""}`}
                  onClick={() => audioRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setAudioDrag(true);
                  }}
                  onDragLeave={() => setAudioDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setAudioDrag(false);
                    handleAudioFile(e.dataTransfer.files[0]);
                  }}
                >
                  <span className={styles.uploadIcon}>
                    {audioFile ? "✅" : "🎵"}
                  </span>
                  <p className={styles.uploadTitle}>
                    {audioFile
                      ? audioFile.name.slice(0, 28)
                      : "Drop audio file here"}
                  </p>
                  <p className={styles.uploadSub}>
                    {audioFile
                      ? `${fmtTime(audioDur)} · ${(audioFile.size / 1048576).toFixed(1)} MB`
                      : "MP3 · WAV · AAC · M4A"}
                  </p>
                  <input
                    ref={audioRef}
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => handleAudioFile(e.target.files[0])}
                  />
                </div>
              </section>

              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <span className={styles.icon}>🖼️</span> Photos
                  <span className={styles.cardBadge}>
                    {photos.length}/20 — optional
                  </span>
                </h3>
                <div
                  className={`${styles.uploadZone} ${styles.uploadZoneSmall} ${photoDrag ? styles.dragOver : ""}`}
                  onClick={() => photoRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setPhotoDrag(true);
                  }}
                  onDragLeave={() => setPhotoDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setPhotoDrag(false);
                    handlePhotos(e.dataTransfer.files);
                  }}
                >
                  <span className={styles.uploadIcon} style={{ fontSize: 28 }}>
                    🖼️
                  </span>
                  <p className={styles.uploadTitle} style={{ fontSize: 14 }}>
                    Add photos for slideshow
                  </p>
                  <p className={styles.uploadSub}>
                    JPG · PNG · WebP · Multiple files
                  </p>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => handlePhotos(e.target.files)}
                  />
                </div>
                {photos.length > 0 && (
                  <div className={styles.photoGrid}>
                    {photos.map((p, i) => (
                      <div key={i} className={styles.photoThumb}>
                        <img src={p.url} alt="" />
                        <button
                          className={styles.photoRemove}
                          onClick={() =>
                            setPhotos((prev) => prev.filter((_, x) => x !== i))
                          }
                        >
                          ✕
                        </button>
                        <span className={styles.photoNum}>{i + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* EDITING TABS */}
          <section className={styles.card}>
            <div className={styles.tabs}>
              {TABS.map((t) => (
                <button
                  key={t}
                  className={`${styles.tabBtn} ${activeTab === t ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(t)}
                >
                  <span>
                    {t === "trim"
                      ? "✂️"
                      : t === "filters"
                        ? "🎨"
                        : t === "text"
                          ? "✍️"
                          : t === "subtitles"
                            ? "💬"
                            : "🔊"}
                  </span>
                  <span className={styles.tabLabel}>
                    {t === "trim"
                      ? "Trim"
                      : t === "filters"
                        ? "Filter"
                        : t === "text"
                          ? "Text"
                          : t === "subtitles"
                            ? "Subs"
                            : "Audio"}
                  </span>
                </button>
              ))}
            </div>

            {/* TRIM TAB */}
            {activeTab === "trim" && mode === "video" && (
              <div className={styles.tabContent}>
                <div className={styles.statsRow}>
                  {[
                    { v: fmtTime(startTime), l: "Start" },
                    { v: fmtTime(clipDur), l: "Duration", warn: clipDur > 60 },
                    { v: fmtTime(endTime), l: "End" },
                  ].map((s) => (
                    <div key={s.l} className={styles.statCard}>
                      <div
                        className={styles.statVal}
                        style={s.warn ? { color: "var(--sm-warning)" } : {}}
                      >
                        {s.v}
                      </div>
                      <div className={styles.statLbl}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {clipDur > 60 && (
                  <div className={`${styles.alert} ${styles.alertWarn}`}>
                    ⚠️ Exceeds 60s YouTube Shorts limit
                  </div>
                )}

                {/* Timeline */}
                <div ref={trackRef} className={styles.track}>
                  <div className={styles.trackWaveform}>
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div
                        key={i}
                        className={styles.waveBar}
                        style={{
                          height: `${20 + Math.abs(Math.sin(i * 0.7 + 1) * 50)}%`,
                        }}
                      />
                    ))}
                  </div>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className={styles.trackTick}
                      style={{ left: `${(i + 1) * 10}%` }}
                    />
                  ))}
                  <div
                    className={styles.trackFill}
                    style={{
                      left: `${leftPct}%`,
                      width: `${rightPct - leftPct}%`,
                    }}
                  />
                  <div
                    className={styles.trackPlayhead}
                    style={{
                      left: `${videoDur > 0 ? (playPos / videoDur) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className={styles.handle}
                    style={{ left: `${leftPct}%` }}
                    onMouseDown={startDrag("start")}
                    onTouchStart={startDrag("start")}
                  >
                    ◀
                  </div>
                  <div
                    className={`${styles.handle} ${styles.handleEnd}`}
                    style={{ left: `${rightPct}%` }}
                    onMouseDown={startDrag("end")}
                    onTouchStart={startDrag("end")}
                  >
                    ▶
                  </div>
                </div>
                <div className={styles.trackLabels}>
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <span key={f}>{fmtTime(Math.floor(videoDur * f))}</span>
                  ))}
                </div>
                <div className={styles.trimPresets}>
                  {[15, 30, 45, 60].map((s) => (
                    <button
                      key={s}
                      className={styles.trimPresetBtn}
                      onClick={() =>
                        setEndTime(Math.min(startTime + s, videoDur))
                      }
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FILTERS TAB */}
            {activeTab === "filters" && (
              <div className={styles.tabContent}>
                <div className={styles.presetGrid}>
                  {FILTER_PRESETS.map((p) => (
                    <div
                      key={p.name}
                      className={`${styles.preset} ${brightness === p.brightness && contrast === p.contrast && grayscale === p.grayscale ? styles.presetActive : ""}`}
                      onClick={() => {
                        setBrightness(p.brightness);
                        setContrast(p.contrast);
                        setGrayscale(p.grayscale);
                        setSepia(p.sepia);
                        setSaturation(p.saturation);
                        setHue(p.hue);
                      }}
                    >
                      <div
                        className={styles.presetThumb}
                        style={{
                          filter: `brightness(${p.brightness}) contrast(${p.contrast}) grayscale(${p.grayscale}) sepia(${p.sepia}) saturate(${p.saturation})`,
                        }}
                      />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.divider} />
                {[
                  {
                    label: "Brightness",
                    val: brightness,
                    set: setBrightness,
                    min: 0,
                    max: 2,
                  },
                  {
                    label: "Contrast",
                    val: contrast,
                    set: setContrast,
                    min: 0,
                    max: 3,
                  },
                  {
                    label: "Saturation",
                    val: saturation,
                    set: setSaturation,
                    min: 0,
                    max: 3,
                  },
                  {
                    label: "Grayscale",
                    val: grayscale,
                    set: setGrayscale,
                    min: 0,
                    max: 1,
                  },
                  { label: "Sepia", val: sepia, set: setSepia, min: 0, max: 1 },
                  {
                    label: "Hue Rotate",
                    val: hue,
                    set: setHue,
                    min: 0,
                    max: 360,
                    step: 1,
                  },
                ].map(({ label, val, set, min, max, step = 0.05 }) => (
                  <SliderRow
                    key={label}
                    label={label}
                    value={val}
                    min={min}
                    max={max}
                    step={step}
                    onChange={set}
                    styles={styles}
                  />
                ))}
                <button
                  className={styles.resetBtn}
                  onClick={() => {
                    setBrightness(1);
                    setContrast(1);
                    setGrayscale(0);
                    setSepia(0);
                    setSaturation(1);
                    setHue(0);
                  }}
                >
                  ↩ Reset Filters
                </button>
              </div>
            )}

            {/* TEXT TAB */}
            {activeTab === "text" && (
              <div className={styles.tabContent}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Overlay Text</label>
                  <input
                    className={styles.textInput}
                    type="text"
                    placeholder="Follow for more! 🔥"
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                  />
                </div>
                <SliderRow
                  label="Font Size"
                  value={fontSize}
                  min={16}
                  max={80}
                  step={1}
                  onChange={setFontSize}
                  styles={styles}
                />
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Color</label>
                  <div className={styles.colorRow}>
                    {TEXT_COLORS.map((c) => (
                      <div
                        key={c}
                        className={`${styles.swatch} ${textColor === c ? styles.swatchActive : ""}`}
                        style={{
                          background: c,
                          border: ["#ffffff", "#000000"].includes(c)
                            ? "1px solid #555"
                            : undefined,
                        }}
                        onClick={() => setTextColor(c)}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Position</label>
                  <div className={styles.posGrid}>
                    {[
                      ["top", "⬆ Top"],
                      ["center", "⬛ Center"],
                      ["bottom", "⬇ Bottom"],
                    ].map(([p, l]) => (
                      <button
                        key={p}
                        className={`${styles.posBtn} ${textPos === p ? styles.posBtnActive : ""}`}
                        onClick={() => setTextPos(p)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    Background & Shadow
                  </span>
                  <Toggle
                    checked={textBg}
                    onChange={setTextBg}
                    styles={styles}
                  />
                </div>
              </div>
            )}

            {/* SUBTITLES TAB */}
            {activeTab === "subtitles" && (
              <div className={styles.tabContent}>
                <div className={`${styles.alert} ${styles.alertInfo}`}>
                  🎤 Play your video, then click Record — subtitles sync
                  automatically
                </div>
                <div className={styles.subControlRow}>
                  <button
                    className={`${styles.subRecordBtn} ${subListening ? styles.subRecordBtnActive : ""}`}
                    onClick={subListening ? stopAutoSub : startAutoSub}
                  >
                    {subListening ? (
                      <>
                        <span className={styles.recDot} />
                        Stop Recording
                      </>
                    ) : (
                      "🎤 Record Subtitles"
                    )}
                  </button>
                  {subLines.length > 0 && (
                    <button
                      className={styles.clearSubBtn}
                      onClick={() => {
                        setSubLines([]);
                        setCurrentSub("");
                      }}
                    >
                      🗑 Clear
                    </button>
                  )}
                </div>

                {subListening && currentSub && (
                  <div className={styles.liveSubPreview}>
                    <span className={styles.liveDot} />
                    <em>{currentSub}</em>
                  </div>
                )}

                {subLines.length > 0 && (
                  <div className={styles.subList}>
                    <div className={styles.subListHeader}>
                      {subLines.length} subtitle lines recorded
                    </div>
                    {subLines.slice(-5).map((l, i) => (
                      <div key={i} className={styles.subLine}>
                        <span className={styles.subTime}>
                          {fmtTime(l.start)} → {fmtTime(l.end)}
                        </span>
                        <span className={styles.subText}>{l.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.divider} />
                <SliderRow
                  label="Subtitle Size"
                  value={subFontSize}
                  min={14}
                  max={60}
                  step={1}
                  onChange={setSubFontSize}
                  styles={styles}
                />
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Subtitle Color</label>
                  <div className={styles.colorRow}>
                    {TEXT_COLORS.slice(0, 6).map((c) => (
                      <div
                        key={c}
                        className={`${styles.swatch} ${subColor === c ? styles.swatchActive : ""}`}
                        style={{
                          background: c,
                          border:
                            c === "#ffffff" ? "1px solid #444" : undefined,
                        }}
                        onClick={() => setSubColor(c)}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    Subtitle Background Box
                  </span>
                  <Toggle checked={subBg} onChange={setSubBg} styles={styles} />
                </div>
              </div>
            )}

            {/* AUDIO TAB */}
            {activeTab === "audio" && (
              <div className={styles.tabContent}>
                <div className={styles.audioRow}>
                  <button
                    className={styles.muteBtn}
                    onClick={() => setMuted(!muted)}
                  >
                    {muted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
                  </button>
                  <div style={{ flex: 1 }}>
                    <SliderRow
                      label="Original Volume"
                      value={muted ? 0 : volume}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => {
                        setVolume(v);
                        if (v > 0) setMuted(false);
                      }}
                      styles={styles}
                    />
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    Mute Original Audio
                  </span>
                  <Toggle checked={muted} onChange={setMuted} styles={styles} />
                </div>
                <div className={styles.divider} />
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    🎵 Background Music (optional)
                  </label>
                  <div
                    className={`${styles.uploadZone} ${styles.uploadZoneSmall}`}
                    onClick={() => bgMusicRef.current?.click()}
                  >
                    <p className={styles.uploadTitle} style={{ fontSize: 13 }}>
                      {bgMusicFile
                        ? `✅ ${bgMusicFile.name.slice(0, 24)}`
                        : "Add background music"}
                    </p>
                    <p className={styles.uploadSub}>MP3 · WAV · AAC</p>
                    <input
                      ref={bgMusicRef}
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => setBgMusicFile(e.target.files[0])}
                    />
                  </div>
                  {bgMusicFile && (
                    <SliderRow
                      label="BG Music Volume"
                      value={bgMusicVol}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={setBgMusicVol}
                      styles={styles}
                    />
                  )}
                </div>
                <div className={`${styles.alert} ${styles.alertInfo}`}>
                  💡 Final video: 1080×1920px · 9:16
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ══════════ RIGHT ══════════ */}
        <div className={styles.rightPanel}>
          {/* PREVIEW */}
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <span className={styles.icon}>👁️</span> Live Preview
            </h3>
            {activeOutput && (
              <div className={`${styles.alert} ${styles.alertSuccess}`}>
                ✅ Export ready — click download!
              </div>
            )}

            {videoUrl || audioUrl || activeOutput ? (
              <div
                className={styles.previewWrap}
                style={mode === "video" ? filterStyle : {}}
              >
                {mode === "audio" && !activeOutput && photos.length > 0 ? (
                  <div className={styles.audioPhotoPreview}>
                    <img
                      src={photos[0].url}
                      alt=""
                      className={styles.audioPhotoBg}
                    />
                    {audioUrl && (
                      <audio
                        controls
                        src={audioUrl}
                        className={styles.audioPlayerInline}
                      />
                    )}
                  </div>
                ) : (
                  <ReactPlayer
                    url={activeOutput || videoUrl}
                    controls
                    volume={volume}
                    muted={muted}
                    width="100%"
                    height="100%"
                    onProgress={({ playedSeconds }) =>
                      setPlayPos(playedSeconds)
                    }
                    config={{
                      file: {
                        attributes: {
                          style: {
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          },
                        },
                      },
                    }}
                  />
                )}
                {overlayText && (
                  <div
                    className={`${styles.overlayText} ${styles["pos_" + textPos]} ${textBg ? styles.overlayBg : ""}`}
                    style={{ fontSize, color: textColor }}
                  >
                    {overlayText}
                  </div>
                )}
                {(activeSub || (subListening && currentSub)) && (
                  <div
                    className={`${styles.overlayText} ${styles.pos_bottom} ${subBg ? styles.overlayBg : ""}`}
                    style={{
                      fontSize: subFontSize,
                      color: subColor,
                      bottom: 40,
                    }}
                  >
                    {activeSub || currentSub}
                  </div>
                )}
                <div className={styles.formatBadge}>9:16 · Shorts</div>
              </div>
            ) : (
              <div className={styles.emptyPreview}>
                <span>{mode === "video" ? "🎬" : "🎵"}</span>
                <p>
                  {mode === "video"
                    ? "Upload a video to preview"
                    : "Upload audio to get started"}
                </p>
              </div>
            )}
          </section>

          {/* EXPORT */}
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <span className={styles.icon}>🚀</span> Export Short
            </h3>
            <div className={styles.pills} style={{ marginBottom: 14 }}>
              <span className={styles.pill}>1080×1920</span>
              <span className={styles.pill}>9:16</span>
              {mode === "video" && (
                <span className={`${styles.pill} ${styles.pillAccent}`}>
                  {clipDur}s
                </span>
              )}
              {mode === "audio" && audioFile && (
                <span className={`${styles.pill} ${styles.pillAccent}`}>
                  {fmtTime(audioDur)}
                </span>
              )}
              {mode === "audio" && photos.length > 0 && (
                <span className={styles.pill}>{photos.length} photos</span>
              )}
              {subLines.length > 0 && (
                <span className={`${styles.pill} ${styles.pillSub}`}>
                  💬 {subLines.length} subs
                </span>
              )}
              {bgMusicFile && <span className={styles.pill}>🎵 BGM</span>}
            </div>

            <div className={styles.checklist}>
              <CheckItem
                ok={mode === "video" ? !!videoFile : !!audioFile}
                label={mode === "video" ? "Video uploaded" : "Audio uploaded"}
              />
              {mode === "video" && (
                <CheckItem
                  ok={clipDur <= 60}
                  label="Duration ≤ 60s"
                  warn={clipDur > 60}
                />
              )}
              {mode === "audio" && (
                <CheckItem
                  ok={photos.length > 0}
                  label="Photos added"
                  optional
                />
              )}
              <CheckItem
                ok={subLines.length > 0}
                label="Subtitles recorded"
                optional
              />
            </div>

            <button
              className={styles.exportBtn}
              onClick={mode === "video" ? processVideo : processAudioToVideo}
              disabled={
                isProcessing || (mode === "video" ? !videoFile : !audioFile)
              }
            >
              {isProcessing ? (
                <>
                  <span className={styles.spin}>⚙️</span>{" "}
                  {progressMsg || "Processing…"}
                </>
              ) : (
                `⚡ Export ${mode === "video" ? "Short" : "Audio Short"}`
              )}
            </button>

            {isProcessing && (
              <div className={styles.progressWrap}>
                <div className={styles.progressLabels}>
                  <span>{progressMsg}</span>
                  <span className={styles.progressPct}>{progress}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className={styles.progressSteps}>
                  {["Load", "Write", "Process", "Export"].map((s, i) => (
                    <div
                      key={s}
                      className={`${styles.pStep} ${progress >= i * 25 ? styles.pStepDone : ""}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeOutput && !isProcessing && (
              <a
                href={activeOutput}
                download={mode === "video" ? "short.mp4" : "audio_short.mp4"}
                className={styles.downloadBtn}
              >
                ⬇ Download Short
              </a>
            )}
          </section>

          {/* YOUTUBE TIPS */}
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>
              <span className={styles.icon}>📺</span> YouTube Tips
            </h3>
            <div className={styles.tipsList}>
              {[
                ["🎯", "Keep it under 60 seconds for Shorts"],
                ["📝", "Bold subtitles — 85% watch on mute"],
                ["🎵", "Use trending audio for more reach"],
                ["🖼️", "First 3 seconds must grab attention"],
                ["#️⃣", "Add #Shorts in title & description"],
              ].map(([icon, tip]) => (
                <div key={tip} className={styles.tipItem}>
                  <span>{icon}</span>
                  <p>{tip}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step = 0.05, onChange, styles }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderHeader}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={styles.sliderValue}>
          {step >= 1 ? Math.round(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--pct": `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
function Toggle({ checked, onChange, styles }) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.toggleSlider} />
    </label>
  );
}
function CheckItem({ ok, label, warn, optional }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0",
        fontSize: 12,
        color: ok
          ? "var(--sm-success)"
          : warn
            ? "var(--sm-warning)"
            : "var(--sm-muted)",
      }}
    >
      <span>{ok ? "✅" : warn ? "⚠️" : "⬜"}</span>
      <span>
        {label}
        {optional && !ok ? " (optional)" : ""}
      </span>
    </div>
  );
}
