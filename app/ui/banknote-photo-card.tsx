"use client";

import { useEffect, useState } from "react";
import type { Note } from "../lib/note-validation";
import { readScanNoteCard, ScanNoteCard, ScanPhoto } from "../lib/scan-photos";
import type { ScanTarget } from "../lib/banknote-scan";
import { downloadBanknote } from "../lib/banknote-download";
import BanknoteFlag from "./banknote-flag";

function CodePhoto({ photo }: { photo: ScanPhoto }) {
  return <svg className="code-photo" role="img" aria-label={`${photo.target === "printerCode" ? "Printer code" : "Serial number"} photo: ${photo.value}`} viewBox={`0 0 ${photo.width} ${photo.height}`}>
    <image href={photo.image} width={photo.width} height={photo.height} />
  </svg>;
}

export default function BanknotePhotoCard({ note, status, saved, photos: providedPhotos }: { note: Note; status?: string; saved?: ScanNoteCard; photos?: Partial<Record<ScanTarget, ScanPhoto>> }) {
  const [loadedPhotos, setPhotos] = useState<Partial<Record<ScanTarget, ScanPhoto>>>({});
  const photos = providedPhotos ?? loadedPhotos;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (providedPhotos) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("ebt-scan-photos-changed", refresh);
    return () => window.removeEventListener("ebt-scan-photos-changed", refresh);
  }, []);
  useEffect(() => {
    if (providedPhotos) return;
    let cancelled = false;
    void readScanNoteCard(note.id).then((record) => {
      if (!cancelled) { setPhotos(record.photos); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [note.id, revision, providedPhotos]);

  return <div className="banknote-photo-card">
    <div className="banknote-card-heading"><strong>€{note.denomination}</strong><span>{new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span></div>
    <div className="banknote-code-pair">{(["printerCode", "serial"] as const).map((target) => <div key={target}>
      <span>{target === "printerCode" ? "Printer code" : "Serial number"} <BanknoteFlag serial={note.serial} printerCode={target === "printerCode" ? note.printerCode : undefined} /></span><strong>{note[target]}</strong>
      {photos[target] ? <><CodePhoto photo={photos[target]} />{photos[target].value !== note[target] && <small>Photo shows {photos[target].value}; value was edited.</small>}</> : <div className="missing-scan-photo">{error ? "Photo unavailable. Refresh to retry." : "No saved photo"}</div>}
    </div>)}</div>
    <p className="banknote-card-status">{status ?? (saved?.submittedAt ? `Submitted ${new Date(saved.submittedAt).toLocaleString()}` : "Saved locally; check EBT for submission status")}</p>
    <dl><div><dt>Location</dt><dd>{[note.country, note.city, note.postalCode].filter(Boolean).join(" · ")}</dd></div><div><dt>Comment</dt><dd>{note.comment || "No comment"}</dd></div></dl>
    {Object.keys(photos).length > 0 && <>
      <button type="button" disabled={downloading} onClick={async () => {
        setDownloading(true); setDownloadError("");
        try { await downloadBanknote(note, photos); }
        catch { setDownloadError("Banknote download failed. Try again."); }
        finally { setDownloading(false); }
      }}>{downloading ? "Preparing banknote…" : "Download banknote"}</button>
      {downloadError && <p role="alert">{downloadError}</p>}
    </>}
  </div>;
}
