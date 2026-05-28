```jsx
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

    if (
      lowerUrl.includes("youtube.com") ||
      lowerUrl.includes("youtu.be")
    ) {
      setPlatform("youtube");
    } else if (lowerUrl.includes("instagram.com")) {
      setPlatform("instagram");
    } else if (
      lowerUrl.includes("x.com") ||
      lowerUrl.includes("twitter.com")
    ) {
      setPlatform("twitter");
    } else if (lowerUrl.includes("linkedin.com")) {
      setPlatform("linkedin");
    } else {
      setPlatform("unknown");
    }
  }, [url]);

  // Extract YouTube Video ID
  const extractYoutubeId = (url) => {
    const regExp =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&?/]+)/;

    const match = url.match(regExp);

    return match ? match[1] : null;
  };

  const handleFetchPreview = async (e) => {
    e.preventDefault();

    if (!url) return;

    setLoading(true);
    setMediaData(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

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
          thumbnail: "https://img.youtube.com/vi/" + videoId + "/maxresdefault.jpg",
          quality: "1080p Full HD",
          size: "Streaming Source",
        };
      }

      // =========================
      // INSTAGRAM
      // =========================
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

      // =========================
      // TWITTER / X
      // =========================
      else if (platform === "twitter") {
        data = {
          title: "Twitter / X Video",
          type: "twitter",
          preview:
            "https://images.unsplash.com/photo-1611605698335-8b1569810432?q=80&w=1200",
          quality: "720p Stream",
          size: "Protected Stream",
        };
      }

      // =========================
      // LINKEDIN
      // =========================
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

      // =========================
      // UNKNOWN
      // =========================
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

      setMediaData({
        ...data,
        originalUrl: url,
      });
    } catch (error) {
      console.error(error);
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
            style={{
              borderColor: "var(--buy)",
              color: "var(--buy)",
            }}
          >
            ● Smart Preview Engine
          </span>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className={styles.layout}>
        {/* LEFT PANEL */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Paste Link</span>
          </div>

          <div className={styles.controls}>
            <form
              onSubmit={handleFetchPreview}
              className={styles.section}
            >
              {/* PLATFORM CHIPS */}
              <div className={styles.field}>
                <label>Supported Platforms</label>

                <div className={styles.presets}>
                  <span
                    className={`${styles.presetChip} ${
                      platform === "youtube"
                        ? styles.presetActive
                        : ""
                    }`}
                  >
                    YouTube
                  </span>

                  <span
                    className={`${styles.presetChip} ${
                      platform === "instagram"
                        ? styles.presetActive
                        : ""
                    }`}
                  >
                    Instagram
                  </span>

                  <span
                    className={`${styles.presetChip} ${
                      platform === "twitter"
                        ? styles.presetActive
                        : ""
                    }`}
                  >
                    X (Twitter)
                  </span>

                  <span
                    className={`${styles.presetChip} ${
                      platform === "linkedin"
                        ? styles.presetActive
                        : ""
                    }`}
                  >
                    LinkedIn
                  </span>
                </div>
              </div>

              {/* URL INPUT */}
              <div className={styles.field}>
                <label htmlFor="media-url">Media URL</label>

                <input
                  id="media-url"
                  type="url"
                  placeholder="Paste YouTube / Instagram / Twitter URL..."
                  className={styles.textInput}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              {/* BUTTON */}
              <button
                type="submit"
                className={styles.actionBtn}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Analyzing URL...
                  </>
                ) : (
                  "Fetch Preview"
                )}
              </button>
            </form>

            {/* LOADING BAR */}
            {loading && (
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: "85%",
                    transition: "width 2s ease",
                  }}
                ></div>
              </div>
            )}
          </div>
        </aside>

        {/* MIDDLE PANEL */}
        <main className={styles.middlePanel}>
          <h2
            className={styles.sectionTitle}
            style={{ marginBottom: "20px" }}
          >
            Live Media Preview
          </h2>

          {!mediaData && !loading && (
            <div className={styles.dropZone}>
              <div className={styles.dropContent}>
                <div className={styles.dropEmoji}>📥</div>

                <p className={styles.dropText}>
                  No Active Stream Detected
                </p>

                <span className={styles.dropSub}>
                  Paste a valid media link to generate preview.
                </span>
              </div>
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div
              className={styles.loadingNote}
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              ⏳ Extracting media metadata...
            </div>
          )}

          {/* MEDIA PREVIEW */}
          {mediaData && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                alignItems: "center",
              }}
            >
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
                {/* YOUTUBE */}
                {mediaData.type === "youtube" ? (
                  <iframe
                    width="100%"
                    height="420"
                    src={mediaData.preview}
                    title="YouTube Preview"
                    frameBorder="0"
                    allowFullScreen
                    style={{
                      borderRadius: "10px",
                    }}
                  ></iframe>
                ) : (
                  <img
                    src={mediaData.preview}
                    alt="Preview"
                    className={styles.previewImg}
                    style={{
                      maxHeight: "420px",
                      width: "100%",
                      objectFit: "cover",
                      borderRadius: "10px",
                    }}
                  />
                )}

                {/* TITLE */}
                <h3
                  className={styles.dropText}
                  style={{
                    marginTop: "16px",
                    textAlign: "left",
                    fontSize: "1.1rem",
                  }}
                >
                  {mediaData.title}
                </h3>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              Download Engine
            </span>
          </div>

          {mediaData ? (
            <div
              className={styles.settingsPanel}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {/* ANALYTICS */}
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  File Analytics
                </h4>

                <div className={styles.infoBox}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div>
                      <strong>Platform:</strong>{" "}
                      <span
                        className={styles.valLabel}
                        style={{
                          textTransform: "uppercase",
                        }}
                      >
                        {platform}
                      </span>
                    </div>

                    <div>
                      <strong>Quality:</strong>{" "}
                      <span className={styles.valLabel}>
                        {mediaData.quality}
                      </span>
                    </div>

                    <div>
                      <strong>Size:</strong>{" "}
                      <span className={styles.valLabel}>
                        {mediaData.size}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* QUALITY OPTIONS */}
              <div className={styles.field}>
                <label>Target Resolution</label>

                <div className={styles.formatGrid}>
                  <div
                    className={`${styles.formatChip} ${styles.formatActive}`}
                  >
                    MAX
                  </div>

                  <div className={styles.formatChip}>
                    1080p
                  </div>

                  <div className={styles.formatChip}>
                    720p
                  </div>

                  <div className={styles.formatChip}>
                    MP3
                  </div>
                </div>
              </div>

              {/* STATUS */}
              <div
                className={styles.resultBox}
                style={{ margin: "0" }}
              >
                <div className={styles.resultLeft}>
                  <div className={styles.resultIcon}>✨</div>

                  <div>
                    <div className={styles.resultName}>
                      Stream Ready
                    </div>

                    <div className={styles.resultMeta}>
                      Preview Successfully Generated
                    </div>
                  </div>
                </div>
              </div>

              {/* DOWNLOAD */}
              <a
                href={mediaData.originalUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: "none",
                }}
              >
                <button className={styles.convertBtn}>
                  ⚡ Open Original Media
                </button>
              </a>
            </div>
          ) : (
            <div className={styles.histEmpty}>
              Ready for extraction.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
```
