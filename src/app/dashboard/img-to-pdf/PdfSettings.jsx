import styles from "./imgToPdf.module.css";

export default function PdfSettings({ pageMode, setPageMode, quality, setQuality }) {
  return (
    <div className={styles.settings}>
      <label>Page Size</label>
      <select value={pageMode} onChange={(e) => setPageMode(e.target.value)}>
        <option value="fit">Fit</option>
        <option value="a4">A4</option>
        <option value="letter">Letter</option>
      </select>

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
