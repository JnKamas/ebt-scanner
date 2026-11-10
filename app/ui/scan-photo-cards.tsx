"use client";

import { useEffect, useRef, useState } from "react";
import { clearScanPhotos, deleteScanPhoto, listScanPhotos, listScanNoteCards, ScanNoteCard, ScanPhoto } from "../lib/scan-photos";

import BanknotePhotoCard from "./banknote-photo-card";
import { ScanPhotoCard } from "./scan-photo-card";
export { ScanPhotoCard } from "./scan-photo-card";

export default function SavedScanPhotos() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const [more, setMore] = useState(false);
  const [cards, setCards] = useState<ScanNoteCard[]>([]);
  const [moreCards, setMoreCards] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("ebt-scan-photos-changed", refresh);
    return () => { window.removeEventListener("ebt-scan-photos-changed", refresh); };
  }, []);

  useEffect(() => {
    const request = ++requestRef.current;
    if (!open) return;
    setBusy(true);
    setError("");
    void Promise.all([listScanPhotos(search), listScanNoteCards(search)]).then(([page, cardPage]) => {
      if (request !== requestRef.current) return;
      setPhotos(page.photos);
      setMore(page.more);
      setCards(cardPage.cards);
      setMoreCards(cardPage.more);
    }).catch(() => {
      if (request === requestRef.current) setError("Saved photos could not be opened. Close other scanner tabs or free browser storage, then refresh.");
    }).finally(() => { if (request === requestRef.current) setBusy(false); });
    return () => { requestRef.current++; };
  }, [open, search, revision]);

  async function loadMore() {
    const request = ++requestRef.current;
    setBusy(true);
    try {
      const page = await listScanPhotos(search, photos.at(-1));
      if (request !== requestRef.current) return;
      setPhotos((current) => [...current, ...page.photos]);
      setMore(page.more);
    } catch { if (request === requestRef.current) setError("More photos could not be loaded. Try refreshing."); }
    finally { if (request === requestRef.current) setBusy(false); }
  }

  async function loadMoreCards() {
    const request = ++requestRef.current;
    setBusy(true);
    try {
      const page = await listScanNoteCards(search, cards.at(-1));
      if (request !== requestRef.current) return;
      setCards((current) => [...current, ...page.cards]);
      setMoreCards(page.more);
    } catch { if (request === requestRef.current) setError("More banknote cards could not be loaded. Try refreshing."); }
    finally { if (request === requestRef.current) setBusy(false); }
  }

  async function remove(id?: string) {
    if (!window.confirm(id ? "Delete this saved scan photo? This cannot be undone." : "Delete all saved banknote cards and scan photos from this browser? This cannot be undone.")) return;
    setBusy(true);
    try { if (id) await deleteScanPhoto(id); else await clearScanPhotos(); }
    catch { setError("Photos could not be deleted. Refresh and try again."); }
    finally { setBusy(false); }
  }

  return <details className="saved-scan-photos" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Saved scan photos</summary>
    {open && <>
      <p>Photos stay in this browser until you delete them or clear this site’s data. Submitting or clearing the queue keeps these banknote cards, their locations, comments and photos for later checking.</p>
      <label>Find a serial or printer code<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="photo-history-actions"><button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh photos</button><button type="button" disabled={busy} onClick={() => void remove()}>Delete all photos</button></div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading photos…</p>}
      {!busy && !error && photos.length === 0 && cards.length === 0 && <p>{search ? "No matching photos." : "No saved scan photos yet."}</p>}
      {cards.map((card) => <div key={card.id} className="saved-banknote-card"><BanknotePhotoCard note={card} saved={card} /></div>)}
      {moreCards && <button type="button" disabled={busy} onClick={() => void loadMoreCards()}>Load more banknote cards</button>}
      <details className="all-capture-photos"><summary>All captured code photos</summary>
      {photos.map((photo) => <div key={photo.id} className="saved-photo"><ScanPhotoCard photo={photo} /><button type="button" disabled={busy} onClick={() => void remove(photo.id)} aria-label={`Delete ${photo.value} photo`}>Delete photo</button></div>)}
      {more && <button type="button" disabled={busy} onClick={() => void loadMore()}>Load more photos</button>}
      </details>
    </>}
  </details>;
}
