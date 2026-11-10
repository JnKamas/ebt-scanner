"use client";

import { useEffect, useState } from "react";
import { denominations, type Note } from "../lib/note-validation";
import { readScanNoteCard, ScanNoteCard, ScanPhoto } from "../lib/scan-photos";
import type { ScanTarget } from "../lib/banknote-scan";
import BanknoteFlag from "./banknote-flag";
import LocationFlag from "./location-flag";
import CaptureCodeValue from "./capture-code-value";

function CodePhoto({ photo }: { photo: ScanPhoto }) {
  return <svg className="code-photo" role="img" aria-label={`${photo.target === "printerCode" ? "Printer code" : "Serial number"} photo: ${photo.value}`} viewBox={`0 0 ${photo.width} ${photo.height}`}>
    <image href={photo.image} width={photo.width} height={photo.height} />
  </svg>;
}

export default function BanknotePhotoCard({ note, status, saved, photos: providedPhotos, onChange }: { note: Note; status?: string; saved?: ScanNoteCard; photos?: Partial<Record<ScanTarget, ScanPhoto>>; onChange?: (note: Note) => void }) {
  const [loadedPhotos, setPhotos] = useState<Partial<Record<ScanTarget, ScanPhoto>>>({});
  const photos = providedPhotos ?? loadedPhotos;
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
    <div className="banknote-card-heading">{onChange ? <select className="banknote-denomination" aria-label="Denomination" value={note.denomination} onChange={(event) => onChange({ ...note, denomination: event.target.value })}>{denominations.map((value) => <option key={value} value={value}>€{value}</option>)}</select> : <strong>€{note.denomination}</strong>}<time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</time></div>
    <div className="banknote-code-pair">{(["printerCode", "serial"] as const).map((target) => <div key={target}>
      <span>{target === "printerCode" ? "Printer code" : "Serial number"} <BanknoteFlag serial={note.serial} printerCode={target === "printerCode" ? note.printerCode : undefined} /></span>{onChange ? <input className="banknote-code-input" aria-label={target === "printerCode" ? "Printer code" : "Serial number"} value={note[target]} autoCapitalize="characters" spellCheck={false} onChange={(event) => onChange({ ...note, [target]: event.target.value })} /> : <strong className={photos[target] ? "has-capture-code" : undefined}>{photos[target] ? <CaptureCodeValue value={note[target]} width={photos[target].width} height={photos[target].height} boxes={photos[target].boxes} /> : note[target]}</strong>}
      {photos[target] ? <><CodePhoto photo={photos[target]} />{photos[target].value !== note[target] && <small>Photo shows {photos[target].value}; value was edited.</small>}</> : <div className="missing-scan-photo">{error ? "Photo unavailable. Refresh to retry." : "No saved photo"}</div>}
    </div>)}</div>
    <p className="banknote-card-status">{status ?? "Saved locally; check EBT for submission status"}</p>
    <dl className="banknote-details"><div><dt>Location {onChange && <LocationFlag country={note.country} />}</dt><dd>{onChange ? <div className="banknote-location-fields">{(["country", "city", "postalCode"] as const).map((field) => <label key={field}>{({ country: "Country (English name)", city: "City", postalCode: "Postal code" })[field]}<input value={note[field]} onChange={(event) => onChange({ ...note, [field]: event.target.value })} /></label>)}</div> : <span className="banknote-location-line"><LocationFlag country={note.country} /><span>{[note.country, note.city, note.postalCode].filter(Boolean).join(" · ")}</span></span>}</dd></div><div><dt>Comment</dt><dd>{onChange ? <input className="banknote-comment-input" aria-label="Comment" value={note.comment} onChange={(event) => onChange({ ...note, comment: event.target.value })} /> : note.comment || "No comment"}</dd></div></dl>
  </div>;
}
