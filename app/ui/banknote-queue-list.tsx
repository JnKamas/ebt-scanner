"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "../lib/note-validation";
import { deleteScanNoteCard, listScanNoteCards, ScanNoteCard, type ScanPhoto } from "../lib/scan-photos";
import type { ScanTarget } from "../lib/banknote-scan";
import BanknotePhotoCard from "./banknote-photo-card";

export default function BanknoteQueueList({ notes, uncertainIds, isSubmitting, editingNote, onEdit, onEditingChange, onSaveEdit, onCancelEdit, onRemove, demo }: {
  notes: Note[]; uncertainIds: string[]; isSubmitting: boolean;
  editingNote: Note | null; onEditingChange: (note: Note) => void;
  onSaveEdit: (note: Note) => string; onCancelEdit: () => void;
  onEdit: (note: Note) => void; onRemove: (id: string) => void;
  demo?: { cards: ScanNoteCard[]; photos: Record<string, Partial<Record<ScanTarget, ScanPhoto>>> };
}) {
  const [savedRecords, setSaved] = useState<ScanNoteCard[]>([]);
  const saved = demo?.cards ?? savedRecords;
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (editingNote && !notes.some((note) => note.id === editingNote.id)) {
      setEditError("");
      onCancelEdit();
    }
  }, [editingNote, notes, onCancelEdit]);

  useEffect(() => {
    if (demo) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("ebt-scan-photos-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("ebt-scan-photos-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [Boolean(demo)]);
  useEffect(() => {
    if (demo) return;
    const request = ++requestRef.current;
    setBusy(true);
    void listScanNoteCards().then((page) => {
      if (request !== requestRef.current) return;
      setSaved(page.cards); setMore(page.more); setError("");
    }).catch(() => {
      if (request === requestRef.current) setError("Some banknotes could not be loaded. Your queued notes are still shown.");
    }).finally(() => { if (request === requestRef.current) setBusy(false); });
    return () => { requestRef.current++; };
  }, [revision, Boolean(demo)]);

  async function loadMore() {
    const request = ++requestRef.current;
    setBusy(true);
    try {
      const page = await listScanNoteCards("", saved.at(-1));
      if (request === requestRef.current) { setSaved((current) => [...current, ...page.cards]); setMore(page.more); }
    } catch { if (request === requestRef.current) setError("More banknotes could not be loaded. Try again."); }
    finally { if (request === requestRef.current) setBusy(false); }
  }

  async function remove(note: Note) {
    if (!window.confirm(`Delete banknote ${note.serial} and its code crops from this browser? This cannot be undone.`)) return;
    if (demo) { onRemove(note.id); return; }
    setBusy(true);
    try {
      await deleteScanNoteCard(note.id);
      onRemove(note.id);
      setSaved((current) => current.filter((item) => item.id !== note.id));
    } catch { setError("This banknote could not be deleted. Try again."); }
    finally { setBusy(false); }
  }

  const queuedIds = new Set(notes.map((note) => note.id));
  const savedById = new Map(saved.map((note) => [note.id, note]));
  const banknotes = [...notes, ...saved.filter((note) => !queuedIds.has(note.id))]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <>
    {error && <p className="notice" role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    {!busy && !error && banknotes.length === 0 && <div className="empty"><span>◌</span><h2>No banknotes yet</h2><p>Scanned and manually added banknotes will appear here.</p></div>}
    <div className="note-list">{banknotes.map((note, index) => {
      const queued = queuedIds.has(note.id);
      const record = savedById.get(note.id);
      const editing = editingNote?.id === note.id ? editingNote : null;
      const status = queued ? uncertainIds.includes(note.id) ? "Check EBT before retrying" : "Queued: not submitted" : record?.submittedAt ? undefined : "Not queued";
      return <article key={note.id} className="banknote-queue-card"><p className="banknote-card-number">Banknote {index + 1}/{banknotes.length}</p>
        <form className={editing ? "banknote-inline-edit" : "banknote-card-view"} onSubmit={(event) => {
          event.preventDefault();
          if (editing) setEditError(onSaveEdit(editing));
        }}>
          <BanknotePhotoCard note={editing ?? note} saved={record} status={status} photos={demo ? demo.photos[note.id] ?? {} : undefined} onChange={editing ? onEditingChange : undefined} />
          {editing && editError && <p className="notice" role="alert">{editError}</p>}
          <div className="queue-actions">{editing ? <><button key="save" className="edit-note save-inline-note" type="submit" disabled={isSubmitting}>Save changes</button><button key="cancel" className="edit-note" type="button" onClick={() => { setEditError(""); onCancelEdit(); }}>Cancel</button></> : <>{queued && <button key="edit" className="edit-note" type="button" disabled={isSubmitting || Boolean(editingNote)} onClick={(event) => { event.preventDefault(); setEditError(""); onEdit(note); }} aria-label={`Edit ${note.serial}`}>Edit</button>}<button key="remove" type="button" disabled={isSubmitting || busy} aria-label={`Remove ${note.serial}`} onClick={() => void remove(note)}>×</button></>}</div>
        </form>
      </article>;
    })}</div>
    {more && <button className="load-banknotes" type="button" disabled={busy} onClick={() => void loadMore()}>Load more banknotes</button>}
  </>;
}
