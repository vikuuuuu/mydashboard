"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";

import layout from "../common/toolLayout.module.css";
import tool from "./tool.module.css";
import UsageHistory from "../common/UsageHistory";

import { getCurrentUser } from "@/lib/firebaseAuth";
import { logToolUsage } from "@/lib/firestore";

export default function VideoToImagePage() {
  const router = useRouter();
  const user = getCurrentUser();

  const videoRef = useRef(null);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState([]);
  const [intervalSec, setIntervalSec] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  /* ================= VIDEO SELECT ================= */
  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setFrames([]);
    setError("");
  };

  /* ================= EXTRACT FRAMES ================= */
  const extractFrames = async () => {
    if (!videoRef.current || !videoFile) return;

    setProcessing(true);
    setFrames([]);
    setError("");

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const captured = [];
      let time = 0;

      while (time < video.duration) {
        await seek(video, time);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        captured.push(canvas.toDataURL("image/png"));
        time += intervalSec;
      }

      setFrames(captured);

      // 🔐 Save usage metadata only
      if (user) {
        await logToolUsage({
          userId: user.uid,
          tool: "video-to-image",
          imageCount: captured.length,
          totalSizeKB: Math.round(videoFile.size / 1024),
        });
      }
    } catch (err) {
      console.error(err);
      setError("Frame extraction failed. Try a different video.");
    } finally {
      setProcessing(false);
    }
  };

  /* ================= ZIP DOWNLOAD ================= */
  const downloadZip = async () => {
    const zip = new JSZip();

    frames.forEach((img, i) => {
      zip.file(`frame_${i + 1}.png`, img.split(",")[1], {
        base64: true,
      });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "video-frames.zip";
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <main className={layout.page}>
      {/* BACK */}
      <button className={layout.backBtn} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={layout.layout}>
        {/* LEFT – PREVIEW */}
        <aside className={layout.sidePanel}>
          <h3>Preview</h3>

          {frames.length === 0 && (
            <p className={tool.emptyText}>Frames will appear here</p>
          )}

          <div className={tool.frameGrid}>
            {frames.map((img, i) => (
              <div key={i} className={tool.frameCard}>
                <img src={img} alt={`frame-${i}`} />
                <small>Frame {i + 1}</small>
              </div>
            ))}
          </div>
        </aside>

        {/* MIDDLE – MAIN */}
        <section className={layout.mainPanel}>
          <h1 className={layout.title}>Video to Image</h1>
          <p className={layout.subText}>
            Extract frames every few seconds. Files never leave your device.
          </p>

          {/* UPLOAD */}
          <label className={tool.uploadBox}>
            Click to upload video
            <input type="file" accept="video/*" onChange={handleVideoSelect} />
          </label>

          {/* VIDEO PREVIEW */}
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className={tool.videoPreview}
            />
          )}

          {/* SETTINGS */}
          <div className={tool.settings}>
            <label>Capture interval (seconds)</label>
            <input
              type="number"
              min={1}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              className={tool.intervalInput}
            />
          </div>

          {error && <p className={tool.errorText}>{error}</p>}

          {/* ACTION */}
          {videoUrl && frames.length === 0 && (
            <button
              className={tool.primaryBtn}
              onClick={extractFrames}
              disabled={processing}
            >
              {processing ? "Extracting..." : "Extract Frames"}
            </button>
          )}

          {/* DOWNLOAD */}
          {frames.length > 0 && (
            <button className={tool.successBtn} onClick={downloadZip}>
              Download ZIP ({frames.length} images)
            </button>
          )}
        </section>

        {/* RIGHT – HISTORY */}

        <UsageHistory userId={user?.uid} tool="video-to-image" />

      </div>
    </main>
  );
}

/* ================= HELPER ================= */
function seek(video, time) {
  return new Promise((resolve) => {
    video.currentTime = time;
    video.onseeked = resolve;
  });
}
