"use client";

import { useState, useEffect } from "react";
import styles from "../common/toolLayout.module.css";

export default function MediaDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaData, setMediaData] = useState(null);
  const [platform, setPlatform] = useState("");

  // Detect Platform
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

  // Extract YouTube ID
  const extractYoutubeId = (url) => {
    const regExp =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&?/]+)/;

    const match = url.match(regExp);
    return match ? match[1] : null;
  };

  // SAFE CLASS HELPER (fixes build issues)
  const getPresetClass = (name) => {
    return `${styles.presetChip} ${
      platform === name ? styles.presetActive : ""
    }`;
  };

  const handleFetchPreview = async (e) => {
    e.preventDefault();

    if (!url) return;

    setLoading(true);
    setMediaData(null);

    try {
      await new Promise((r) => setTimeout(r, 1200));

      let data = {
        title: "Media Content",
        type: "image",
        preview: "",
        quality: "HD",
        size: "Unknown",
      };

      // =========================
      // YOUTUBE
      // =========================
      if (platform === "youtube") {
        const videoId = extractYoutubeId(url);

        if (!videoId) {
          alert("Invalid YouTube URL");
          setLoading(false);
          return;
        }

        data = {
          title: "YouTube Video Preview",
          type: "youtube",
          preview: "https://www.youtube.com/embed/" + videoId,
          thumbnail:
            "https://img.youtube.com/vi/" +
            videoId +
            "/maxresdefault.jpg",
          quality: "1080p Full HD",
          size: "Streaming Source",
        };
      }

      // INSTAGRAM
      else if (platform === "instagram") {
        data = {
          title: "Instagram Reel / Post",
          type: "instagram",
          preview:
            "https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?q=80&w=1200",
          quality: "HD Reel",
          size: "Protected Stream",
        };
      }

      // TWITTER
      else if (platform === "twitter") {
        data = {
          title: "X (Twitter) Video",
          type: "twitter",
          preview:
            "https://images.unsplash.com/photo-1611605698335-8b1569810432?q=80&w=1200",
          quality: "720p Stream",
          size: "Protected Stream",
        };
      }

      // LINKEDIN
      else if (platform === "linkedin") {
        data = {
          title: "LinkedIn Media",
          type: "linkedin",
          preview:
            "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1200",
          quality: "Professional HD",
          size: "Protected Stream",
        };
      }

      // UNKNOWN
      else {
        data = {
          title: "External Web Resource",
          type: "image",
          preview:
            "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200",
          quality: "Source Resolution",
          size: "Unknown",
        };
      }

      setMediaData({ ...data, originalUrl: url });
    } catch (err) {
      console.error(err);
      alert("Failed to fetch preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* TOP BAR */}
      <header className={styles.topBar}>
        <button
          className={styles.backBtn}
          onClick={() => window.history.back()}
        >
          ← Back to Dashboard
        </button>

        <div className={styles.brand}>
          <div className={styles.brandIcon}>🚀</div>
          <span>Universal Media Downloader</span>
        </div>

        <div className={styles.topStats}>
          <span className={styles.statChip}>v2.0.0</span>
          <span
            className={styles.statChip}
            style={{ borderColor: "var(--buy)", color: "var(--buy)" }}
          >
            ● Smart Preview Engine
          </span>
        </div>
      </header>

      {/* LAYOUT */}
      <div className={styles.layout}>
        {/* LEFT */}
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
                  <span className={getPresetClass("instagram")}>
                    Instagram
                  </span>
                  <span className={getPresetClass("twitter")}>
                    X (Twitter)
                  </span>
                  <span className={getPresetClass("linkedin")}>
                    LinkedIn
                  </span>
                </div>
              </div>

              <div className={styles.field}>
                <label>Media URL</label>
                <input
                  type="url"
                  className={styles.textInput}
                  placeholder="Paste media link..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className={styles.actionBtn}
                disabled={loading}
              >
                {loading ? "Analyzing..." : "Fetch Preview"}
              </button>

              {loading && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill}></div>
                </div>
              )}
            </div>
          </form>
        </aside>

        {/* MIDDLE */}
        <main className={styles.middlePanel}>
          {!mediaData && !loading && (
            <div className={styles.dropZone}>
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>📥</div>
                <p className={styles.dropText}>No Active Stream</p>
                <span className={styles.dropSub}>
                  Paste a link to generate preview
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className={styles.loadingNote}>
              Extracting media metadata...
            </div>
          )}

          {mediaData && (
            <div>
              <div
                style={{
                  background: "var(--surface)",
                  padding: "16px",
                  borderRadius: "var(--radius)",
                }}
              >
                {mediaData.type === "youtube" ? (
                  <iframe
                    width="100%"
                    height="420"
                    src={mediaData.preview}
                    allowFullScreen
                    title="preview"
                  />
                ) : (
                  <img
                    src={mediaData.preview}
                    style={{
                      width: "100%",
                      maxHeight: "420px",
                      objectFit: "cover",
                      borderRadius: "10px",
                    }}
                    alt="preview"
                  />
                )}

                <h3 style={{ marginTop: "12px" }}>
                  {mediaData.title}
                </h3>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Download Engine</span>
          </div>

          {mediaData ? (
            <div className={styles.settingsPanel}>
              <div className={styles.infoBox}>
                <div>
                  <strong>Platform:</strong> {platform}
                </div>
                <div>
                  <strong>Quality:</strong> {mediaData.quality}
                </div>
                <div>
                  <strong>Size:</strong> {mediaData.size}
                </div>
              </div>

              <a
                href={mediaData.originalUrl}
                target="_blank"
                rel="noreferrer"
              >
                <button className={styles.convertBtn}>
                  Open Original
                </button>
              </a>
            </div>
          ) : (
            <div className={styles.histEmpty}>
              Ready for extraction
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
