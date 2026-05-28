"use client";

import { useState } from "react";
import styles from "../common/toolLayout.module.css";

export default function MediaDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null); // Preview data store karne ke liye

  // Yeh function aapke backend API routes ya Kisi third-party scraper se connect hoga
  const handleFetchPreview = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setMediaData(null);

    try {
      // 📝 Note: Real production me aap yahan fetch('/api/download', { method: 'POST', body: ... }) karenge.
      // Abhi preview dikhane ke liye hum ek mock delay aur dummy data use kar rahe hain.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Dummy state check karne ke liye ki link kis platform ka hai
      let detectedType = "image";
      let title = "Fetched Media Content";
      let previewUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800"; // Sample high-quality art

      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        detectedType = "video";
        title = "YouTube Video Title Preview";
        previewUrl = "https://www.w3schools.com/html/mov_bbb.mp4"; // Sample open video
      } else if (url.includes("instagram.com") || url.includes("fb.com") || url.includes("facebook.com")) {
        detectedType = "video";
        title = "Social Media Reel / Video";
        previewUrl = "https://www.w3schools.com/html/movie.mp4";
      }

      setMediaData({
        title: title,
        type: detectedType,
        preview: previewUrl,
        quality: "4K / Ultra HD (1080p Source)",
        size: detectedType === "video" ? "24.5 MB" : "4.2 MB",
      });
    } catch (error) {
      console.error("Error fetching media:", error);
      alert("Failed to fetch media. Please check the URL.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* ── TOP BAR ── */}
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => window.history.back()}>
          ← Back to Dashboard
        </button>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>🚀</div>
          <span>Universal Media Downloader</span>
        </div>
        <div className={styles.topStats}>
          <span className={styles.statChip}>v1.0.0</span>
          <span className={styles.statChip} style={{ borderColor: "var(--buy)", color: "var(--buy)" }}>
            ● Active Engine
          </span>
        </div>
      </header>

      {/* ── LAYOUT (3-Panel Grid matching your CSS) ── */}
      <div className={styles.layout}>
        
        {/* 1. LEFT PANEL: URL Inputs & Source Selection */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Paste Link</span>
          </div>

          <div className={styles.controls}>
            <form onSubmit={handleFetchPreview} className={styles.section}>
              <div className={styles.field}>
                <label>Supported Platforms</label>
                <div className={styles.presets}>
                  <span className={`${styles.presetChip} ${styles.presetActive}`}>YouTube</span>
                  <span className={`${styles.presetChip} ${styles.presetActive}`}>Instagram</span>
                  <span className={`${styles.presetChip} ${styles.presetActive}`}>X (Twitter)</span>
                  <span className={`${styles.presetChip} ${styles.presetActive}`}>LinkedIn</span>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="media-url">Media URL</label>
                <input
                  id="media-url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=... or Insta link"
                  className={styles.textInput}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className={styles.actionBtn} disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.spinner}></span> Fetching Media...
                  </>
                ) : (
                  "Fetch Preview"
                )}
              </button>
            </form>

            {loading && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: "70%" }}></div>
              </div>
            )}
          </div>
        </aside>

        {/* 2. MIDDLE PANEL: Live Interactive Preview */}
        <main className={styles.middlePanel}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: "20px" }}>
            Live Media Preview
          </h2>

          {!mediaData && !loading && (
            <div className={styles.dropZone}>
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>📥</div>
                <p className={styles.dropText}>No Active Stream Detected</p>
                <span className={styles.dropSub}>
                  Paste a valid link from social media on the left panel to generate preview.
                </span>
              </div>
            </div>
          )}

          {loading && <div className={styles.loadingNote}>Parsing media headers, checking for maximum resolutions...</div>}

          {mediaData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "16px",
                  width: "100%",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {mediaData.type === "video" ? (
                  <video src={mediaData.preview} controls className={styles.previewImg} style={{ maxHeight: "400px" }} />
                ) : (
                  <img src={mediaData.preview} alt="Preview" className={styles.previewImg} style={{ maxHeight: "400px" }} />
                )}
                <h3 className={styles.dropText} style={{ marginTop: "14px", textAlign: "left" }}>
                  {mediaData.title}
                </h3>
              </div>
            </div>
          )}
        </main>

        {/* 3. RIGHT PANEL: Quality Config & Download Actions */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Download Engine</span>
          </div>

          {mediaData ? (
            <div className={styles.settingsPanel} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>File Analytics</h4>
                <div className={styles.infoBox}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div><strong>Detected Quality:</strong> <span className={styles.valLabel}>{mediaData.quality}</span></div>
                    <div><strong>Estimated Size:</strong> <span className={styles.valLabel}>{mediaData.size}</span></div>
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <label>Target Resolution</label>
                <div className={styles.formatGrid}>
                  <div className={`${styles.formatChip} ${styles.formatActive}`}>Max</div>
                  <div className={styles.formatChip}>1080p</div>
                  <div className={styles.formatChip}>720p</div>
                  <div className={styles.formatChip}>MP3 Audio</div>
                </div>
              </div>

              <div className={styles.resultBox} style={{ margin: "0" }}>
                <div className={styles.resultLeft}>
                  <div className={styles.resultIcon}>✨</div>
                  <div>
                    <div className={styles.resultName}>Ready to Pack</div>
                    <div className={styles.resultMeta}>High-Bitrate Container</div>
                  </div>
                </div>
              </div>

              <a href={mediaData.preview} download target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button className={styles.convertBtn}>⚡ Download High Quality</button>
              </a>
            </div>
          ) : (
            <div className={styles.histEmpty}>
              Ready for extraction. Enter a link to configure downloading protocols.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
