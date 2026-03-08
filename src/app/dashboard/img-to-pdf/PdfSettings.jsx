import styles from "./tool.module.css";

export default function PdfSettings({
  pageSize,
  setPageSize,
  orientation,
  setOrientation,
  margin,
  setMargin,
  quality,
  setQuality
}) {
  return (
    <div className={styles.settings}>

      {/* Page Size */}
      <label>Page Size</label>
      <select value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
        <option value="fit">Fit to Image</option>
        <option value="a4">A4</option>
        <option value="letter">Letter</option>
      </select>

      {/* Orientation */}
      <label>Orientation</label>
      <select
        value={orientation}
        onChange={(e) => setOrientation(e.target.value)}
      >
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
      </select>

      {/* Margin */}
      <label>Page Margin</label>
      <select value={margin} onChange={(e) => setMargin(e.target.value)}>
        <option value="0">No Margin</option>
        <option value="10">Small</option>
        <option value="20">Medium</option>
        <option value="30">Large</option>
      </select>

      {/* Compression */}
      <label>Compression</label>
      <input
        type="range"
        min="0.4"
        max="1"
        step="0.05"
        value={quality}
        onChange={(e) => setQuality(+e.target.value)}
      />
      <span>{Math.round(quality * 100)}%</span>

    </div>
  );
}