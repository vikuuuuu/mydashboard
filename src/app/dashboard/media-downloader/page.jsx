"use client";

import { useState, useEffect } from "react";
import styles from "../common/toolLayout.module.css";

export default function MediaDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [platform, setPlatform] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Detect Platform dynamically
  useEffect(() => {
    if (!url) {
      setPlatform("");
      return;
    }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
      setPlatform("youtube");
    } else if (lowerUrl.includes("instagram.com")) {
      setPlatform("instagram");
    } else if (lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) {
      setPlatform("twitter");
    } else if (lowerUrl.includes("linkedin.com")) {
      setPlatform("linkedin");
    } else {
      setPlatform("unknown");
    }
  }, [url]);

  // Extract YouTube Video ID for preview
  const extractYoutubeId = (url) => {
    const regExp = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?/]+)/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  };

  const getPresetClass = (name) => {
    return `${styles.presetChip} ${platform === name ? styles.presetActive : ""}`;
  };

  // ── CORE MEDIA PARSER ENGINE (CONNECTED TO BACKEND) ──
  const handleFetchPreview = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setMediaData(null);

    try {
      // 🚀 ASLI BACKEND FETCH ENGINE CALL
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url }),
      });

      if (!response.ok) {
        throw new Error("Backend server response failed");
      }

      const backendData = await response.json();

      let previewLink = url;
      if (platform === "youtube") {
        const videoId = extractYoutubeId(url);
        if (videoId) previewLink = `https://www.youtube.com/embed/${videoId}`;
      }

      setMediaData({
        title: backendData.title || "Extracted Video Stream",
        type: platform === "youtube" ? "youtube" : "video",
        preview: previewLink, // Embed Live View for User
        downloadUrl: backendData.downloadUrl, // 💥 TARGET REAL INPUT URL BASED DOWNLOAD
        quality: backendData.quality || "High Definition",
        size: backendData.size || "Dynamic Size",
        originalUrl: url
      });

    } catch (err) {
      console.error("Preview Exception:", err);
      alert("Failed to extract media asset. Make sure backend route is created.");
    } finally {
      setLoading(false);
    }
  };

  // ── ADVANCED BINARY DOWNLOAD STREAMER ──
  const triggerBinaryDownload = async () => {
    if (!mediaData || !mediaData.downloadUrl) return;

    setDownloading(true);
    try {
      // Direct high speed anchor dispatch method
      const anchor = document.createElement("a");
      anchor.href = mediaData.downloadUrl;
      anchor.target = "_blank";
      // Force download attribute rule
      anchor.download = `MediaAsset-${Date.now()}.mp4`;
      
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      console.error("Download pipeline error:", err);
      window.open(mediaData.downloadUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* TOP BAR */}
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => window.history.back()}>
          ← Back to Dashboard
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🚀</div>
          <span>Universal Media Downloader</span>
        </div>
        <div className={styles.topStats}>
          <span className={styles.statChip}>v3.0.0</span>
          <span className={styles.statChip} style={{ borderColor: "var(--buy)", color: "var(--buy)" }}>
            ● Real Live Parsing Server Connected
          </span>
        </div>
      </header>

      {/* MAIN CONTAINER LAYOUT */}
      <div className={styles.layout}>
        {/* LEFT COMPONENT PANEL */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Paste Link</span>
          </div>

          <form onSubmit={handleFetchPreview} className={styles.controls}>
            <div className={styles.section}>
              <div className={styles.field}>
                <label>Supported Platforms</label>
                <div className={styles.presets}>
                  <span className={getPresetClass("youtube")}>YouTube</span>
                  <span className={getPresetClass("instagram")}>Instagram</span>
                  <span className={getPresetClass("twitter")}>X (Twitter)</span>
                  <span className={getPresetClass("linkedin")}>LinkedIn</span>
                </div>
              </div>

              <div className={styles.field}>
                <label>Media Source Target URL</label>
                <input
                  type="url"
                  className={styles.textInput}
                  placeholder="Paste direct media link here..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className={styles.actionBtn} disabled={loading}>
                {loading ? "Analyzing Target Streams..." : "Fetch Preview Asset"}
              </button>

              {loading && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: '90%', transition: 'width 2s' }}></div>
                </div>
              )}
            </div>
          </form>
        </aside>

        {/* MIDDLE LIVE VIEW PANEL */}
        <main className={styles.middlePanel}>
          {!mediaData && !loading && (
            <div className={styles.dropZone}>
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>📥</div>
                <p className={styles.dropText}>No Active Media Target Stream</p>
                <span className={styles.dropSub}>
                  Paste an active URL link into the left panel module configuration.
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className={styles.loadingNote}>
              De-assembling data streams from backend server pipeline...
            </div>
          )}

          {mediaData && (
            <div>
              <div
                style={{
                  background: "var(--surface)",
                  padding: "16px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                {mediaData.type === "youtube" ? (
                  <iframe
                    width="100%"
                    height="400"
                    src={mediaData.preview}
                    allowFullScreen
                    style={{ borderRadius: "8px", border: "none" }}
                    title="Live Media Render Pipeline Preview"
                  />
                ) : (
                  <video
                    src={mediaData.preview}
                    controls
                    style={{ width: "100%", maxHeight: "400px", borderRadius: "8px" }}
                  />
                )}

                <h3 style={{ marginTop: "14px", fontSize: "1.1rem", fontWeight: "600" }}>
                  {mediaData.title}
                </h3>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SYSTEM CONTROL DOWNLOAD ENGINE PANEL */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Engine Core Controls</span>
          </div>

          {mediaData ? (
            <div className={styles.settingsPanel}>
              <div className={styles.infoBox} style={{ marginBottom: '20px' }}>
                <div style={{ paddingBottom: '6px' }}>
                  <strong>Platform Origin:</strong> <span style={{ textTransform: 'uppercase', color: 'var(--accent)' }}>{platform}</span>
                </div>
                <div style={{ paddingBottom: '6px' }}>
                  <strong>Resolved Quality:</strong> {mediaData.quality}
                </div>
                <div>
                  <strong>Payload Stream Size:</strong> {mediaData.size}
                </div>
              </div>

              {/* ⚡ DOWNLOADS THE ACTUAL USER TARGET URL */}
              <button 
                onClick={triggerBinaryDownload} 
                className={styles.convertBtn}
                style={{ width: '100%', fontWeight: '600' }}
                disabled={downloading}
              >
                {downloading ? "Processing Download..." : "⚡ Download File Now"}
              </button>

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Processes directly via target data stream packet proxy.
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.histEmpty}>
              Pipeline idle. Configure resource link target parameters to initiate high-speed engine downloads.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
