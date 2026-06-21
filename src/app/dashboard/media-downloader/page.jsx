"use client";

import { useState, useEffect } from "react";
import styles from "../common/toolLayout.module.css";

export default function MediaDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [platform, setPlatform] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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

  // Extract YouTube Video ID for preview iframe
  const extractYoutubeId = (url) => {
    const regExp = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?/]+)/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  };

  const getPresetClass = (name) => {
    return `${styles.presetChip} ${platform === name ? styles.presetActive : ""}`;
  };

  // ── CORE MEDIA PARSER ENGINE ──
  const handleFetchPreview = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setMediaData(null);
    setDownloadProgress(0);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url, action: "parse" }),
      });

      if (!response.ok) {
        throw new Error("Backend server response failed");
      }

      const backendData = await response.json();

      let previewLink = backendData.downloadUrl;
      
      // YouTube ke liye direct embed layout use karenge
      if (platform === "youtube") {
        const videoId = extractYoutubeId(url);
        if (videoId) previewLink = `https://www.youtube.com/embed/${videoId}`;
      } else {
        // Instagram/Twitter ke CORS block se bachne ke liye proxy stream URL banayenge
        previewLink = `/api/download?proxyUrl=${encodeURIComponent(backendData.downloadUrl)}`;
      }

      setMediaData({
        title: backendData.title || "Social Media Video Content",
        type: platform === "youtube" ? "youtube" : "video",
        preview: previewLink, 
        downloadUrl: backendData.downloadUrl, 
        quality: backendData.quality || "Auto-Detected (Best Quality)",
        size: backendData.size || "Calculated dynamically",
        originalUrl: url
      });

    } catch (err) {
      console.error("Preview Exception:", err);
      alert("Failed to extract media asset. Make sure backend route is working properly.");
    } finally {
      setLoading(false);
    }
  };

  // ── ADVANCED BINARY DOWNLOAD & LOCAL CACHE STORAGE ──
  const triggerBinaryDownload = async () => {
    if (!mediaData || !mediaData.downloadUrl) return;

    setDownloading(true);
    setDownloadProgress(10);

    try {
      const cacheName = "media-downloader-cache";
      const cache = await caches.open(cacheName);
      
      // Proxy URL ke jariye fetch request bhejna taaki CORS browser error na aaye
      const targetFetchUrl = `/api/download?proxyUrl=${encodeURIComponent(mediaData.downloadUrl)}`;
      
      // 1. Check if video already exists in Local Browser Cache Storage
      const cachedResponse = await cache.match(targetFetchUrl);
      let blob;

      if (cachedResponse) {
        console.log("Serving from Local Browser Storage...");
        setDownloadProgress(70);
        blob = await cachedResponse.blob();
      } else {
        console.log("Downloading fresh from Proxy Server...");
        setDownloadProgress(30);
        
        const response = await fetch(targetFetchUrl);
        if (!response.ok) throw new Error("Network stream fetch failed");

        // Response ka clone banakar storage mein save karenge
        const responseClone = response.clone();
        blob = await response.blob();

        await cache.put(targetFetchUrl, responseClone);
      }

      setDownloadProgress(90);

      // 2. Local BloB URL dispatch rules (forces direct local storage save)
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      
      // Clean safe file name create karna
      const cleanTitle = mediaData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      anchor.download = `${cleanTitle}-${Date.now()}.mp4`;
      
      document.body.appendChild(anchor);
      anchor.click();
      
      // Memory cleanup
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);
      
      setDownloadProgress(100);
    } catch (err) {
      console.error("Download pipeline error:", err);
      // Fallback: Agar secure blob block ho toh proxy open direct window rule
      window.open(`/api/download?proxyUrl=${encodeURIComponent(mediaData.downloadUrl)}`, "_blank");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress(0);
      }, 1200);
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
          <span className={styles.statChip}>v3.1.0</span>
          <span className={styles.statChip} style={{ borderColor: "var(--buy)", color: "var(--buy)" }}>
            ● Local Storage Engine Active
          </span>
        </div>
      </header>

      {/* MAIN CONTAINER LAYOUT */}
      <div className={styles.layout}>
        {/* LEFT PANEL */}
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

        {/* MIDDLE PANEL (PREVIEW WINDOW) */}
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
                    crossOrigin="anonymous" /* 👈 Sabse important CORS bypass ke liye */
                    playsInline
                    style={{ width: "100%", maxHeight: "400px", borderRadius: "8px", backgroundColor: "#000" }}
                  />
                )}

                <h3 style={{ marginTop: "14px", fontSize: "1.1rem", fontWeight: "600" }}>
                  {mediaData.title}
                </h3>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
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

              <button 
                onClick={triggerBinaryDownload} 
                className={styles.convertBtn}
                style={{ width: '100%', fontWeight: '600' }}
                disabled={downloading}
              >
                {downloading ? `Processing Asset (${downloadProgress}%)` : "⚡ Download File Now"}
              </button>

              {downloading && (
                <div className={styles.progressTrack} style={{ marginTop: '10px' }}>
                  <div className={styles.progressFill} style={{ width: `${downloadProgress}%`, background: 'var(--accent)' }}></div>
                </div>
              )}

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Saves directly into local storage browser memory for lightning fast re-downloads.
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
