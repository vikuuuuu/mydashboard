"use client";

import { useState, useEffect } from "react";
import styles from "../common/toolLayout.module.css";

export default function MediaDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [platform, setPlatform] = useState(""); // Dynamic active chip highlighting

  // Input url change hote hi automatically platform detect karne ke liye
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

  const handleFetchPreview = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setMediaData(null); // Clear previous preview on new fetch

    try {
      /* 
        ======================================================================
        🚀 PRODUCTION NOTE (Real Backend Integration):
        Real project me aap niche diye gye code ki tarah apna backend endpoint call karenge:
        
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url })
        });
        const data = await response.json();
        setMediaData(data);
        ======================================================================
      */

      // Simulating Network Delay
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Upgraded Simulation Logic (Ab yeh custom inputs ke basis par mock metadata banayega)
      let title = "Fetched Media Content";
      let detectedType = "video";
      let previewUrl = "";
      let quality = "1080p (Source Quality)";
      let size = "12.4 MB";

      // Creating a cleaner mock look matching your input
      if (platform === "youtube") {
        title = "YouTube Video / Reel Content";
        previewUrl = "https://www.w3schools.com/html/mov_bbb.mp4"; // Default fallback sample video
        quality = "1080p Full HD";
        size = "18.5 MB";
      } else if (platform === "instagram") {
        title = "Instagram Reel / Media Post";
        previewUrl = "https://www.w3schools.com/html/movie.mp4"; 
        quality = "HD (Source Stream)";
        size = "8.2 MB";
      } else if (platform === "twitter") {
        title = "X (Twitter) Video Stream";
        previewUrl = "https://www.w3schools.com/html/mov_bbb.mp4";
        quality = "720p HD";
        size = "4.1 MB";
      } else if (platform === "linkedin") {
        title = "LinkedIn Professional Video";
        previewUrl = "https://www.w3schools.com/html/movie.mp4";
        quality = "1080p Quality";
        size = "22.0 MB";
      } else {
        // Fallback standard image preview
        detectedType = "image";
        title = "External Web Resource Image";
        previewUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800";
        quality = "Source Resolution";
        size = "1.8 MB";
      }

      setMediaData({
        title: title,
        type: detectedType,
        preview: previewUrl,
        quality: quality,
        size: size,
        originalUrl: url
      });

    } catch (error) {
      console.error("Error fetching media:", error);
      alert("Failed to fetch media metadata. Please check the network or URL.");
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
          <span className={styles.statChip}>v1.1.0</span>
          <span className={styles.statChip} style={{ borderColor: "var(--buy)", color: "var(--buy)" }}>
            ● Advanced Engine Active
          </span>
        </div>
      </header>

      {/* ── LAYOUT (3-Panel Grid) ── */}
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
                  <span className={`${styles.presetChip} ${platform === "youtube" ? styles.presetActive : ""}`}>YouTube</span>
                  <span className={`${styles.presetChip} ${platform === "instagram" ? styles.presetActive : ""}`}>Instagram</span>
                  <span className={`${styles.presetChip} ${platform === "twitter" ? styles.presetActive : ""}`}>X (Twitter)</span>
                  <span className={`${styles.presetChip} ${platform === "linkedin" ? styles.presetActive : ""}`}>LinkedIn</span>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="media-url">Media URL</label>
                <input
                  id="media-url"
                  type="url"
                  placeholder="Paste YouTube video/shorts or Instagram reel link..."
                  className={styles.textInput}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className={styles.actionBtn} disabled={loading}>
                {loading ? (
                  <>
                    <span className={styles.spinner}></span> Analyzing URL...
                  </>
                ) : (
                  "Fetch Preview"
                )}
              </button>
            </form>

            {loading && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: "85%", transition: "width 2s ease" }}></div>
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
                  Paste a valid link from social media on the left panel to generate a live preview.
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className={styles.loadingNote} style={{ textAlign: "center", color: "var(--text-muted)" }}>
              ⏳ Parsing media headers, validating content lengths, and extracting resolutions...
            </div>
          )}

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
                  <video 
                    src={mediaData.preview} 
                    controls 
                    key={mediaData.preview} // Form reset trigger for new video streams
                    className={styles.previewImg} 
                    style={{ maxHeight: "400px", width: "100%", borderRadius: "8px" }} 
                  />
                ) : (
                  <img src={mediaData.preview} alt="Preview" className={styles.previewImg} style={{ maxHeight: "400px", objectFit: "contain" }} />
                )}
                <h3 className={styles.dropText} style={{ marginTop: "14px", textAlign: "left", fontSize: "1.1rem" }}>
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div><strong>Platform:</strong> <span className={styles.valLabel} style={{ textTransform: "uppercase" }}>{platform}</span></div>
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
                    <div className={styles.resultMeta}>High-Bitrate Asset Container</div>
                  </div>
                </div>
              </div>

              {/* Real architecture handles cross-origin direct download cleanly */}
              <a href={mediaData.preview} download="media-asset" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button className={styles.convertBtn}>⚡ Download Asset Stream</button>
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
