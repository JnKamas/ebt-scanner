"use client";

import { useEffect, useRef, useState } from "react";
import { clearScanPhotos, deleteScanNoteCard, listScanNoteCards, ScanNoteCard } from "../lib/scan-photos";

import BanknotePhotoCard from "./banknote-photo-card";

export default function SavedScanPhotos() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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
    void listScanNoteCards(search).then((cardPage) => {
      if (request !== requestRef.current) return;
      setCards(cardPage.cards);
      setMoreCards(cardPage.more);
    }).catch(() => {
      if (request === requestRef.current) setError("Saved banknotes could not be opened. Close other scanner tabs or free browser storage, then refresh.");
    }).finally(() => { if (request === requestRef.current) setBusy(false); });
    return () => { requestRef.current++; };
  }, [open, search, revision]);

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
    if (!window.confirm(id ? "Delete this saved banknote and its code crops? Your queue is unchanged. This cannot be undone." : "Delete all saved banknotes and their code crops from this browser? Your queue is unchanged. This cannot be undone.")) return;
    setBusy(true);
    try { if (id) await deleteScanNoteCard(id); else await clearScanPhotos(); }
    catch { setError("Banknotes could not be deleted. Refresh and try again."); }
    finally { setBusy(false); }
  }

  return <details className="saved-scan-photos" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Saved banknotes</summary>
    {open && <>
      <p>Each saved banknote keeps both code crops, location, comment and submission status together in this browser. Submitting or clearing the queue keeps these records for later checking. Deleting a saved banknote removes its record and crops without changing the queue.</p>
      <label>Find a serial or printer code<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="photo-history-actions"><button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh banknotes</button><button type="button" disabled={busy} onClick={() => void remove()}>Delete all banknotes</button></div>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Loading banknotes…</p>}
      {!busy && !error && cards.length === 0 && <p>{search ? "No matching banknotes." : "No saved banknotes yet."}</p>}
      {cards.map((card) => <div key={card.id} className="saved-banknote-card"><BanknotePhotoCard note={card} saved={card} /><button type="button" disabled={busy} onClick={() => void remove(card.id)} aria-label={`Delete saved banknote ${card.serial}`}>Delete banknote</button></div>)}
      {moreCards && <button type="button" disabled={busy} onClick={() => void loadMoreCards()}>Load more banknote cards</button>}
    </>}
  </details>;
}
