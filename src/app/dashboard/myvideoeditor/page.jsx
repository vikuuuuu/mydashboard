"use client";

import { useState, useRef } from "react";
import ReactPlayer from "react-player";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import "./dashboard.css";

const ffmpeg = createFFmpeg({ log: true });

export default function Dashboard() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [text, setText] = useState("");
  const [volume, setVolume] = useState(1);
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  };

  const processVideo = async () => {
    if (!videoFile) return;

    setLoading(true);

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(videoFile));

    await ffmpeg.run(
      "-i",
      "input.mp4",
      "-ss",
      `${startTime}`,
      "-t",
      `${endTime - startTime}`,
      "-vf",
      `scale=1080:1920`,
      "output.mp4"
    );

    const data = ffmpeg.FS("readFile", "output.mp4");

    const url = URL.createObjectURL(
      new Blob([data.buffer], { type: "video/mp4" })
    );

    setOutput(url);
    setLoading(false);
  };

  const filterStyle = {
    filter: `
      brightness(${brightness})
      contrast(${contrast})
      grayscale(${grayscale})
      sepia(${sepia})
    `,
  };

  return (
    <div className="dashboard">
      <h1>🎬 ShortsMaker AI</h1>

      {/* Upload */}
      <div className="card">
        <h3>Upload Video</h3>
        <input type="file" accept="video/*" onChange={handleUpload} />
      </div>

      {/* Video Preview */}
      {videoUrl && (
        <div className="card preview" style={filterStyle}>
          <ReactPlayer url={videoUrl} controls volume={volume} />
          {text && <div className="overlay-text">{text}</div>}
        </div>
      )}

      {/* Trim */}
      <div className="card">
        <h3>Trim Video</h3>
        <label>Start: {startTime}s</label>
        <input
          type="range"
          min="0"
          max="60"
          value={startTime}
          onChange={(e) => setStartTime(Number(e.target.value))}
        />

        <label>End: {endTime}s</label>
        <input
          type="range"
          min="0"
          max="60"
          value={endTime}
          onChange={(e) => setEndTime(Number(e.target.value))}
        />
      </div>

      {/* Editor */}
      <div className="card">
        <h3>Editing Panel</h3>

        <label>Brightness</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          onChange={(e) => setBrightness(e.target.value)}
        />

        <label>Contrast</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          onChange={(e) => setContrast(e.target.value)}
        />

        <label>Text Overlay</label>
        <input
          type="text"
          placeholder="Enter text"
          onChange={(e) => setText(e.target.value)}
        />

        <label>Volume</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          onChange={(e) => setVolume(e.target.value)}
        />
      </div>

      {/* Export */}
      <div className="card">
        <button onClick={processVideo}>
          {loading ? "Processing..." : "Export Video"}
        </button>

        {output && (
          <a href={output} download="short.mp4" className="download">
            ⬇ Download
          </a>
        )}
      </div>
    </div>
  );
}
