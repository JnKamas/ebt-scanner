import type { ScanPhoto } from "../lib/scan-photos";

export function ScanPhotoCard({ photo }: { photo: ScanPhoto }) {
  const label = photo.target === "printerCode" ? "Printer code" : "Serial number";
  return <figure className="scan-photo-card">
    <figcaption><span>{label}</span><strong>{photo.value}</strong><small>€{photo.denomination} · {new Date(photo.capturedAt).toLocaleString()}</small>{photo.target === "serial" && photo.printerCode && <small>Printer code at capture: {photo.printerCode}</small>}</figcaption>
    <div className="scan-photo-image" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      <img src={photo.image} alt={`${label} capture: ${photo.value}`} loading="lazy" />
      {photo.boxes.map((box, index) => <i key={index} className="photo-ocr-box" style={{ left: `${box.x0 / photo.width * 100}%`, top: `${box.y0 / photo.height * 100}%`, width: `${(box.x1 - box.x0) / photo.width * 100}%`, height: `${(box.y1 - box.y0) / photo.height * 100}%` }} />)}
    </div>
    <small>OCR confidence: {photo.confidences.map((confidence) => `${Math.round(confidence * 100)}%`).join(" · ")}</small>
    <details className="photo-enlarge"><summary>Enlarge photo</summary><div><img src={photo.image} alt={`Full-size ${label.toLowerCase()} capture: ${photo.value}`} width={photo.width} height={photo.height} loading="lazy" /></div></details>
    <a href={photo.image} download={`ebt-${photo.target}-${photo.value}.jpg`}>Download photo</a>
  </figure>;
}

