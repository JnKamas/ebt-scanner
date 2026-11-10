"use client";

import { useEffect, useState } from "react";
import type { Note } from "../lib/note-validation";
import { readScanNoteCard, ScanNoteCard, ScanPhoto } from "../lib/scan-photos";
import type { ScanTarget } from "../lib/banknote-scan";
import { ScanPhotoCard } from "./scan-photo-card";
import BanknoteFlag from "./banknote-flag";

function CodePhoto({ photo }: { photo: ScanPhoto }) {
  const boxes = photo.boxes;
  const x = boxes.length ? Math.max(0, Math.min(...boxes.map((box) => box.x0)) - 10) : 0;
  const y = boxes.length ? Math.max(0, Math.min(...boxes.map((box) => box.y0)) - 8) : 0;
  const right = boxes.length ? Math.min(photo.width, Math.max(...boxes.map((box) => box.x1)) + 10) : photo.width;
  const bottom = boxes.length ? Math.min(photo.height, Math.max(...boxes.map((box) => box.y1)) + 8) : photo.height;
  return <svg className="code-photo" role="img" aria-label={`${photo.target === "printerCode" ? "Printer code" : "Serial number"} photo: ${photo.value}`} viewBox={`${x} ${y} ${Math.max(1, right - x)} ${Math.max(1, bottom - y)}`}>
    <image href={photo.image} width={photo.width} height={photo.height} />
  </svg>;
}

export default function BanknotePhotoCard({ note, status, saved }: { note: Note; status?: string; saved?: ScanNoteCard }) {
  const [photos, setPhotos] = useState<Partial<Record<ScanTarget, ScanPhoto>>>({});
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("ebt-scan-photos-changed", refresh);
    return () => window.removeEventListener("ebt-scan-photos-changed", refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void readScanNoteCard(note.id).then((record) => {
      if (!cancelled) { setPhotos(record.photos); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [note.id, revision]);

  return <div className="banknote-photo-card">
    <div className="banknote-card-heading"><strong>€{note.denomination}</strong><span>{new Date(note.createdAt).toLocaleString()}</span></div>
    <div className="banknote-code-pair">{(["printerCode", "serial"] as const).map((target) => <div key={target}>
      <span>{target === "printerCode" ? "Printer code" : "Serial number"} <BanknoteFlag serial={note.serial} printerCode={target === "printerCode" ? note.printerCode : undefined} /></span><strong>{note[target]}</strong>
      {photos[target] ? <><CodePhoto photo={photos[target]} />{photos[target].value !== note[target] && <small>Photo shows {photos[target].value}; value was edited.</small>}</> : <div className="missing-scan-photo">{error ? "Photo unavailable. Refresh to retry." : "No saved photo"}</div>}
    </div>)}</div>
    <p className="banknote-card-status">{status ?? (saved?.submittedAt ? `Submitted ${new Date(saved.submittedAt).toLocaleString()}` : "Saved locally; check EBT for submission status")}</p>
    <dl><div><dt>Location</dt><dd>{[note.country, note.city, note.postalCode].filter(Boolean).join(" · ")}</dd></div><div><dt>Comment</dt><dd>{note.comment || "No comment"}</dd></div></dl>
    {Object.keys(photos).length > 0 && <details className="banknote-photo-review"><summary>Review captured photos</summary>{(["printerCode", "serial"] as const).map((target) => photos[target] && <ScanPhotoCard key={photos[target].id} photo={photos[target]} />)}</details>}
  </div>;
}
