// File: app/dashboard/video-to-img/page.js
"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";
import styles from "../common/toolLayout.module.css";
import vstyles from "./tool.module.css";

const FORMATS  = ["png", "jpg", "webp"];
const QUALITIES = [
  { id: "low",    label: "Low",    value: 0.5  },
  { id: "medium", label: "Medium", value: 0.8  },
  { id: "high",   label: "High",   value: 0.95 },
  { id: "max",    label: "Max",    value: 1.0  },
];
const CAPTURE_MODES = [
  { id: "interval", label: "⏱ Every N Seconds" },
  { id: "count",    label: "🔢 Fixed Frame Count" },
  { id: "manual",   label: "✋ Manual Seek" },
];

export default function VideoToImagePage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const videoRef    = useRef(null);
  const fileRef     = useRef(null);
  const canvasRef   = useRef(null);

  // file
  const [videoFile,  setVideoFile ] = useState(null);
  const [videoUrl,   setVideoUrl  ] = useState(null);
  const [duration,   setDuration  ] = useState(0);
  const [videoSize,  setVideoSize ] = useState({ w: 0, h: 0 });
  const [isDrag,     setIsDrag    ] = useState(false);

  // settings
  const [captureMode,  setCaptureMode ] = useState("interval");
  const [intervalSec,  setIntervalSec ] = useState(2);
  const [frameCount,   setFrameCount  ] = useState(10);
  const [format,       setFormat      ] = useState("png");
  const [quality,      setQuality     ] = useState("high");
  const [scalePercent, setScalePercent] = useState(100);
  const [startSec,     setStartSec    ] = useState(0);
  const [endSec,       setEndSec      ] = useState(0);
  const [useRange,     setUseRange    ] = useState(false);
  const [maxFrames,    setMaxFrames   ] = useState(200);

  // output
  const [frames,     setFrames    ] = useState([]); // [{dataUrl, time, w, h}]
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress  ] = useState(0);
  const [error,      setError     ] = useState("");
  const [manualTime, setManualTime] = useState(0);

  /* ── Load Video ── */
  const loadVideo = useCallback((file) => {
    if (!file || !file.type.startsWith("video/")) {
      setError("Please upload a valid video file."); return;
    }
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setFrames([]); setError(""); setProgress(0);
  }, []);

  const handleFileInput = (e) => loadVideo(e.target.files?.[0]);
  const handleDrop = (e) => { e.preventDefault(); setIsDrag(false); loadVideo(e.dataTransfer.files?.[0]); };

  const onVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    setEndSec(Math.floor(v.duration));
    setManualTime(0);
  };

  /* ── Seek helper ── */
  const seekTo = (video, time) => new Promise((resolve) => {
    video.currentTime = time;
    video.onseeked = resolve;
  });

  /* ── Capture single frame at current time (manual mode) ── */
  const captureManualFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const q    = QUALITIES.find(q => q.id === quality)?.value || 0.9;
    const scale = scalePercent / 100;
    const c    = document.createElement("canvas");
    c.width    = Math.round(video.videoWidth  * scale);
    c.height   = Math.round(video.videoHeight * scale);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    const mime   = format === "jpg" ? "image/jpeg" : `image/${format}`;
    const dataUrl = c.toDataURL(mime, q);
    const time    = video.currentTime;
    setFrames(prev => [...prev, { dataUrl, time: time.toFixed(2), w: c.width, h: c.height }]);
  };

  /* ── Main Extract ── */
  const extractFrames = async () => {
    if (!videoRef.current || !videoFile) return;
    setProcessing(true); setFrames([]); setError(""); setProgress(0);

    try {
      const video  = videoRef.current;
      const q      = QUALITIES.find(x => x.id === quality)?.value || 0.9;
      const scale  = scalePercent / 100;
      const mime   = format === "jpg" ? "image/jpeg" : `image/${format}`;
      const from   = useRange ? Math.max(0, startSec) : 0;
      const to     = useRange ? Math.min(endSec, video.duration) : video.duration;

      let times = [];

      if (captureMode === "interval") {
        for (let t = from; t <= to; t += intervalSec) times.push(t);
      } else if (captureMode === "count") {
        const step = (to - from) / Math.max(frameCount - 1, 1);
        for (let i = 0; i < frameCount; i++) times.push(from + i * step);
      }

      // limit frames
      if (times.length > maxFrames) {
        times = times.slice(0, maxFrames);
      }

      const captured = [];
      for (let i = 0; i < times.length; i++) {
        setProgress(Math.round((i / times.length) * 100));
        await seekTo(video, times[i]);
        const c = document.createElement("canvas");
        c.width  = Math.round(video.videoWidth  * scale);
        c.height = Math.round(video.videoHeight * scale);
        c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
        captured.push({ dataUrl: c.toDataURL(mime, q), time: times[i].toFixed(2), w: c.width, h: c.height });
      }

      setFrames(captured);
      setProgress(100);

      if (user) {
        await logToolUsage({
          userId:     user.uid,
          tool:       "video-to-image",
          imageCount: captured.length,
          totalSizeKB: Math.round(videoFile.size / 1024),
          videoType:  videoFile.type.split("/")[1],
        });
      }
    } catch (err) {
      console.error(err);
      setError("Frame extraction failed. Try a different video.");
    } finally {
      setProcessing(false);
    }
  };

  /* ── Download single frame ── */
  const downloadSingle = (dataUrl, idx) => {
    const ext = format === "jpg" ? "jpg" : format;
    const a   = document.createElement("a");
    a.href    = dataUrl;
    a.download = `frame_${idx + 1}_${frames[idx].time}s.${ext}`;
    a.click();
  };

  /* ── Download ZIP ── */
  const downloadZip = async () => {
    if (!frames.length) return;
    const zip = new JSZip();
    const ext = format === "jpg" ? "jpg" : format;
    frames.forEach((f, i) => {
      zip.file(`frame_${String(i+1).padStart(4,"0")}_${f.time}s.${ext}`, f.dataUrl.split(",")[1], { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `${videoFile?.name?.replace(/\.[^.]+$/, "") || "video"}-frames.zip`;
    a.click();
  };

  /* ── Delete frame ── */
  const deleteFrame = (i) => setFrames(prev => prev.filter((_, idx) => idx !== i));

  /* ── Reset ── */
  const reset = () => {
    setVideoFile(null); setVideoUrl(null); setFrames([]);
    setDuration(0); setError(""); setProgress(0);
  };

  const estimatedFrames = () => {
    if (!duration) return 0;
    const from = useRange ? startSec : 0;
    const to   = useRange ? endSec   : duration;
    if (captureMode === "interval") return Math.min(Math.floor((to - from) / intervalSec) + 1, maxFrames);
    if (captureMode === "count")    return Math.min(frameCount, maxFrames);
    return frames.length;
  };

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>← Back</button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🎬</div>
          <span>Video → Image</span>
        </div>
        {videoFile && (
          <div className={styles.topStats}>
            <span className={styles.statChip}>🎞 {videoFile.name.length > 20 ? videoFile.name.slice(0,20)+"…" : videoFile.name}</span>
            {duration > 0 && <span className={styles.statChip}>⏱ {fmtTime(duration)}</span>}
            {videoSize.w > 0 && <span className={styles.statChip}>{videoSize.w}×{videoSize.h}</span>}
            <span className={styles.statChip}>{(videoFile.size/1024/1024).toFixed(1)} MB</span>
            <button className={styles.clearBtn} onClick={reset}>✕ Clear</button>
          </div>
        )}
        {frames.length > 0 && (
          <div style={{ marginLeft: "auto" }}>
            <button className={vstyles.zipBtn} onClick={downloadZip}>
              ↓ ZIP All ({frames.length} frames)
            </button>
          </div>
        )}
      </div>

      <div className={vstyles.root}>

        {/* ── LEFT: Settings ── */}
        <aside className={vstyles.leftPanel}>

          {/* Upload */}
          {!videoFile ? (
            <div
              className={`${vstyles.dropZone} ${isDrag ? vstyles.dropActive : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
              onDragLeave={() => setIsDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept="video/*" hidden onChange={handleFileInput} />
              <div className={vstyles.dropContent}>
                <div className={vstyles.dropIcon}>🎬</div>
                <p className={vstyles.dropText}>Drop video here</p>
                <span className={vstyles.dropSub}>or click to browse</span>
                <span className={vstyles.dropFormats}>MP4 · MOV · AVI · WEBM · MKV</span>
              </div>
            </div>
          ) : (
            <div className={vstyles.videoWrap}>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className={vstyles.videoPlayer}
                onLoadedMetadata={onVideoLoaded}
              />
            </div>
          )}

          {/* Settings */}
          {videoFile && (
            <div className={vstyles.settingsBox}>

              {/* Capture Mode */}
              <div className={styles.field}>
                <label>Capture Mode</label>
                <div className={vstyles.modeGroup}>
                  {CAPTURE_MODES.map((m) => (
                    <button
                      key={m.id}
                      className={`${vstyles.modeBtn} ${captureMode === m.id ? vstyles.modeBtnActive : ""}`}
                      onClick={() => setCaptureMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interval setting */}
              {captureMode === "interval" && (
                <div className={styles.field}>
                  <label>Interval — <strong className={styles.valLabel}>{intervalSec}s</strong></label>
                  <input type="range" min="0.5" max="30" step="0.5" value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>0.5s</span><span>30s</span></div>
                </div>
              )}

              {/* Frame count setting */}
              {captureMode === "count" && (
                <div className={styles.field}>
                  <label>Total Frames — <strong className={styles.valLabel}>{frameCount}</strong></label>
                  <input type="range" min="2" max="200" step="1" value={frameCount}
                    onChange={(e) => setFrameCount(Number(e.target.value))} className={styles.slider} />
                  <div className={styles.sliderLabels}><span>2</span><span>200</span></div>
                </div>
              )}

              {/* Time range */}
              <div className={styles.field}>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
                  <span>Custom time range</span>
                </label>
                {useRange && (
                  <div className={vstyles.rangeRow}>
                    <div className={styles.field}>
                      <label>Start (sec)</label>
                      <input className={styles.textInput} type="number" min="0" max={duration} step="0.5"
                        value={startSec} onChange={(e) => setStartSec(Number(e.target.value))} />
                    </div>
                    <div className={vstyles.rangeDash}>→</div>
                    <div className={styles.field}>
                      <label>End (sec)</label>
                      <input className={styles.textInput} type="number" min="0" max={duration} step="0.5"
                        value={endSec} onChange={(e) => setEndSec(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>

              {/* Format */}
              <div className={styles.field}>
                <label>Output Format</label>
                <div className={styles.chipGroup}>
                  {FORMATS.map((f) => (
                    <button key={f} className={`${styles.chip} ${format===f?styles.chipActive:""}`} onClick={() => setFormat(f)}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div className={styles.field}>
                <label>Quality</label>
                <div className={styles.chipGroup}>
                  {QUALITIES.map((q) => (
                    <button key={q.id} className={`${styles.chip} ${quality===q.id?styles.chipActive:""}`} onClick={() => setQuality(q.id)}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale */}
              <div className={styles.field}>
                <label>Scale — <strong className={styles.valLabel}>{scalePercent}%</strong>
                  {videoSize.w > 0 && <span className={vstyles.scaleDim}> ({Math.round(videoSize.w * scalePercent/100)}×{Math.round(videoSize.h * scalePercent/100)})</span>}
                </label>
                <input type="range" min="25" max="100" step="5" value={scalePercent}
                  onChange={(e) => setScalePercent(Number(e.target.value))} className={styles.slider} />
                <div className={styles.sliderLabels}><span>25%</span><span>100% (Original)</span></div>
              </div>

              {/* Max frames safety */}
              <div className={styles.field}>
                <label>Max Frames Cap — <strong className={styles.valLabel}>{maxFrames}</strong></label>
                <input type="range" min="10" max="500" step="10" value={maxFrames}
                  onChange={(e) => setMaxFrames(Number(e.target.value))} className={styles.slider} />
              </div>

              {/* Estimate */}
              {captureMode !== "manual" && (
                <div className={vstyles.estimateBox}>
                  <span className={vstyles.estimateIcon}>📊</span>
                  <span>~<strong>{estimatedFrames()}</strong> frames will be extracted</span>
                </div>
              )}

              {error && <div className={vstyles.errorBox}>{error}</div>}

              {/* Action buttons */}
              {captureMode === "manual" ? (
                <div className={vstyles.manualBtns}>
                  <button className={vstyles.captureBtn} onClick={captureManualFrame}>
                    📸 Capture Current Frame
                  </button>
                  <div className={vstyles.manualHint}>Seek the video to desired position, then click capture</div>
                </div>
              ) : (
                <button
                  className={`${vstyles.extractBtn} ${processing ? vstyles.extractBusy : ""}`}
                  onClick={extractFrames}
                  disabled={processing}
                >
                  {processing
                    ? <><span className={styles.spinner} /> Extracting… {progress}%</>
                    : <>🎬 Extract Frames</>}
                </button>
              )}

              {processing && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── RIGHT: Frame Grid ── */}
        <div className={vstyles.rightPanel}>
          <div className={vstyles.frameHeader}>
            <span className={vstyles.frameTitle}>
              {frames.length > 0 ? `${frames.length} Frames Extracted` : "Extracted Frames"}
            </span>
            {frames.length > 0 && (
              <div className={vstyles.frameActions}>
                <button className={vstyles.clearFramesBtn} onClick={() => setFrames([])}>Clear All</button>
                <button className={vstyles.zipBtn} onClick={downloadZip}>↓ ZIP All</button>
              </div>
            )}
          </div>

          {frames.length === 0 && !processing && (
            <div className={vstyles.emptyFrames}>
              <span className={vstyles.emptyIcon}>🎞️</span>
              <p>Upload a video and extract frames</p>
              <span className={vstyles.emptyHint}>Frames will appear here as a grid</span>
            </div>
          )}

          {processing && frames.length === 0 && (
            <div className={vstyles.emptyFrames}>
              <span className={vstyles.emptyIcon}>⚙️</span>
              <p>Extracting frames… {progress}%</p>
            </div>
          )}

          <div className={vstyles.frameGrid}>
            {frames.map((frame, i) => (
              <div key={i} className={vstyles.frameCard}>
                <img src={frame.dataUrl} alt={`frame-${i+1}`} className={vstyles.frameImg} />
                <div className={vstyles.frameOverlay}>
                  <span className={vstyles.frameNum}>#{i+1}</span>
                  <span className={vstyles.frameTime}>{frame.time}s</span>
                </div>
                <div className={vstyles.frameBottom}>
                  <span className={vstyles.frameDim}>{frame.w}×{frame.h}</span>
                  <div className={vstyles.frameBtns}>
                    <button className={vstyles.frameDownloadBtn} onClick={() => downloadSingle(frame.dataUrl, i)} title="Download">↓</button>
                    <button className={vstyles.frameDeleteBtn} onClick={() => deleteFrame(i)} title="Delete">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}