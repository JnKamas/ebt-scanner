"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { isSerialValid, noteErrors, type Note } from "../lib/note-validation";
import type { EbtJourney, Receipt } from "../lib/ebt";
import type { ScanNoteCard, ScanPhoto } from "../lib/scan-photos";
import type { ScanTarget } from "../lib/banknote-scan";
import BanknoteQueueList from "./banknote-queue-list";
import { SubmissionReceipts } from "./ebt-account-tools";

type DemoRecord = { card: ScanNoteCard; photos: Partial<Record<ScanTarget, ScanPhoto>> };
const journey: EbtJourney = {
  total_km: 55, total_days: 183, img_url_europe: null, img_url_world: null,
  steps: [
    { step_id: 0, timestamp: "2026-05-11", user_name: "Demo collector", location_name: "Vienna", country_name: "Austria", comment: "Example café", hit_km: 0, hit_days: 0 },
    { step_id: 1, timestamp: "2026-11-10", user_name: "Demo scanner", location_name: "Bratislava", country_name: "Slovakia", comment: "Example shop", hit_km: 55, hit_days: 183 },
  ],
};

function examplePhoto(note: Note, target: ScanTarget): ScanPhoto {
  const value = note[target];
  const canvas = document.createElement("canvas");
  canvas.width = value.length * 23 + 12; canvas.height = 42;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not draw the example crop.");
  context.fillStyle = "#e1dfcb"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#323a35"; context.font = "bold 32px monospace"; context.fillText(value, 6, 32);
  const metrics = context.measureText(value);
  return { id: crypto.randomUUID(), target, value, image: canvas.toDataURL("image/jpeg"), width: canvas.width, height: canvas.height,
    boxes: [{ x0: 6 - metrics.actualBoundingBoxLeft, y0: 32 - metrics.actualBoundingBoxAscent, x1: 6 + metrics.actualBoundingBoxRight, y1: 32 + metrics.actualBoundingBoxDescent }],
    confidences: [0.96], capturedAt: note.createdAt, denomination: note.denomination, printerCode: note.printerCode, cropVersion: 1 };
}

export default function DevelopDemo() {
  const [records, setRecords] = useState<DemoRecord[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(0);
  const serialCounter = useRef(0);
  const queued = records.filter(({ card }) => !card.submittedAt).map(({ card }) => card);

  function add(count: number) {
    const additions: DemoRecord[] = [];
    for (let index = 0; index < count; index++) {
      let serial: string;
      do { serial = `X${String(++serialCounter.current).padStart(11, "0")}`; } while (!isSerialValid(serial));
      const note: Note = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), serial, printerCode: "R001A1", denomination: ["5", "10", "20", "50"][index % 4], country: "Slovakia", city: "Bratislava", postalCode: "811 01", comment: index % 2 ? "" : "Demo shop" };
      additions.push({ card: note, photos: { printerCode: examplePhoto(note, "printerCode"), serial: examplePhoto(note, "serial") } });
    }
    setRecords((current) => [...additions, ...current]);
    setMessage(`Added ${count} fake banknote${count === 1 ? "" : "s"}.`);
  }

  function submit(hit = false, reject = false) {
    const batch = queued.slice(0, 25);
    const submittedIds = new Set(batch.map((note) => note.id));
    setReceipts(batch.map((note, index) => ({ id: note.id, serial: note.serial, denomination: note.denomination, result: { status: reject ? 8 : hit && index === 0 ? 1 : 0, ...(hit && index === 0 ? { billId: "1" } : {}) } })));
    if (!reject) {
      setRecords((current) => current.filter((record) => !submittedIds.has(record.card.id)));
      setSubmitted((current) => current + batch.length);
    }
    setMessage(reject ? "Demo rejection: notes remain queued." : `Simulated ${batch.length} submitted notes${hit ? ", including one hit" : ""}.`);
  }

  return <main className="shell">
    <header className="topbar"><div className="brand">EBT Scanner · Visual demo</div><Link href="/">Back to scanner</Link></header>
    <section className="demo-controls" aria-label="Visual demo controls">
      <h1>Try the banknote list</h1><p>Made-up notes and hits. Nothing is sent to EBT or stored in your banknote history. Reload or Reset to clear the demo.</p>
      <div><button onClick={() => add(1)}>Add fake banknote</button><button onClick={() => add(5)}>Add 5 fake banknotes</button><button onClick={() => submit(true)} disabled={!queued.length || Boolean(editing)}>Simulate hit</button><button onClick={() => submit(false, true)} disabled={!queued.length || Boolean(editing)}>Simulate rejection</button><button onClick={() => { setRecords([]); setReceipts([]); setSubmitted(0); setEditing(null); setMessage(""); }}>Reset demo</button></div>
    </section>
    <section className="queue-panel">
      <div className="queue-total"><div><span>{queued.length}</span><small>notes queued</small></div><div><span>{submitted}</span><small>notes submitted</small></div></div>
      <div className="queue-submit"><button className="submit" disabled={!queued.length || Boolean(editing)} onClick={() => submit()}>Submit queue ({Math.min(queued.length, 25)})</button></div>
      {message && <p className="notice" role="status">{message}</p>}
      <SubmissionReceipts receipts={receipts} exampleJourneys={{ "1": journey }} />
      <BanknoteQueueList notes={queued} uncertainIds={[]} isSubmitting={false} editingNote={editing} onEdit={(note) => setEditing({ ...note })} onEditingChange={setEditing} onCancelEdit={() => setEditing(null)}
        onSaveEdit={(note) => { const errors = noteErrors(note); if (errors.length) return errors.join(" "); setRecords((current) => current.map((record) => record.card.id === note.id ? { ...record, card: { ...record.card, ...note } } : record)); setEditing(null); return ""; }}
        onRemove={(id) => { setRecords((current) => current.filter((record) => record.card.id !== id)); if (editing?.id === id) setEditing(null); }}
        demo={{ cards: records.map(({ card }) => card), photos: Object.fromEntries(records.map(({ card, photos }) => [card.id, photos])) }} />
    </section>
  </main>;
}
