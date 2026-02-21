import styles from "./tool.module.css";

export default function ImagePreview({ images, setImages, pdfInfo, onDownload }) {
  const onDragStart = (e, index) => {
    e.dataTransfer.setData("index", index);
  };

  const onDrop = (e, index) => {
    const from = Number(e.dataTransfer.getData("index"));
    if (from === index) return;

    const updated = [...images];
    const [moved] = updated.splice(from, 1);
    updated.splice(index, 0, moved);
    setImages(updated);
  };

  const remove = (index) => {
    const updated = [...images];
    updated.splice(index, 1);
    setImages(updated);
  };

  return (
    <aside className={styles.previewPanel}>
      <h3>Preview</h3>

      {/* Empty */}
      {images.length === 0 && !pdfInfo && (
        <p className={styles.empty}>No images selected</p>
      )}

      {/* Images */}
      {images.map((img, i) => (
        <div
          key={i}
          className={styles.previewCard}
          draggable
          onDragStart={(e) => onDragStart(e, i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDrop(e, i)}
        >
          {/* Drag handle */}
          <span className={styles.dragHandle} title="Reorder">☰</span>

          {/* Delete */}
          <button
            className={styles.deleteBtn}
            title="Delete"
            onClick={() => remove(i)}
          >
            🗑️
          </button>

          <img src={img.preview} alt="" />
        </div>
      ))}

      {/* PDF Result */}
      {pdfInfo && (
        <div className={styles.pdfInfo}>
          <p><b>Name:</b> {pdfInfo.name}</p>
          <p><b>Size:</b> {pdfInfo.size} MB</p>
          <p><b>Pages:</b> {pdfInfo.pages}</p>

          <button className={styles.successBtn} onClick={onDownload}>
            Download PDF
          </button>
        </div>
      )}
    </aside>
  );
}
