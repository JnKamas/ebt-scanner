"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Note = {
  id: string;
  serial: string;
  printerCode: string;
  denomination: string;
  country: string;
  city: string;
  postalCode: string;
  comment: string;
  createdAt: string;
};

type Tab = "entry" | "queue" | "settings";

const denominations = ["5", "10", "20", "50", "100", "200", "500"];
const blankDraft = () => ({ serial: "", printerCode: "", denomination: "20", country: "", city: "", postalCode: "", comment: "" });

function clean(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isSerialValid(serial: string) {
  return /^[A-Z][A-Z0-9]{10,11}$/.test(serial);
}

function isCodeValid(code: string) {
  return /^[A-Z]\d{3}[A-Z0-9]{1,2}$/.test(code);
}

export default function EbtWeb() {
  const [tab, setTab] = useState<Tab>("entry");
  const [draft, setDraft] = useState(blankDraft);
  const [notes, setNotes] = useState<Note[]>([]);
  const [mode, setMode] = useState<"used" | "consecutive">("used");
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ebt-web-queue");
    if (saved) setNotes(JSON.parse(saved));
    const savedLocation = window.localStorage.getItem("ebt-web-location");
    if (savedLocation) setDraft((current) => ({ ...current, ...JSON.parse(savedLocation) }));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ebt-web-queue", JSON.stringify(notes));
  }, [notes]);

  const serialOk = isSerialValid(clean(draft.serial));
  const codeOk = isCodeValid(clean(draft.printerCode));
  const ready = serialOk && codeOk && Boolean(draft.city.trim()) && Boolean(draft.country.trim());
  const total = useMemo(() => notes.reduce((sum, note) => sum + Number(note.denomination), 0), [notes]);

  function update(field: keyof ReturnType<typeof blankDraft>, value: string) {
    setDraft((current) => ({ ...current, [field]: field === "serial" || field === "printerCode" ? clean(value) : value }));
  }

  async function scanPhoto(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    if (!image) return;
    setIsScanning(true);
    setMessage("Reading note…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1);
      const result = await worker.recognize(image);
      await worker.terminate();
      const text = clean(result.data.text);
      const serial = text.match(/[A-Z][A-Z0-9]{10,11}/)?.[0] ?? "";
      const printerCode = text.match(/[A-Z]\d{3}[A-Z0-9]{1,2}/)?.[0] ?? "";
      setDraft((current) => ({ ...current, serial: serial || current.serial, printerCode: printerCode || current.printerCode }));
      setMessage(serial || printerCode ? "Check the highlighted values, then save." : "Nothing clear found. Try a closer, brighter photo.");
    } catch {
      setMessage("The scan could not run. You can still enter the values manually.");
    } finally {
      setIsScanning(false);
      event.target.value = "";
    }
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setMessage("Location is not available in this browser.");
      return;
    }
    setMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setMessage(`Location found (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}). Add city and postal code to save it.`);
      },
      () => setMessage("Location permission was not granted. You can enter it manually."),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function saveLocation() {
    const location = { country: draft.country, city: draft.city, postalCode: draft.postalCode };
    window.localStorage.setItem("ebt-web-location", JSON.stringify(location));
    setMessage("Location saved for your next note.");
  }

  function addNote() {
    if (!ready) {
      setMessage("Complete a valid-looking serial, printer code, country, and city first.");
      return;
    }
    const newNote: Note = { ...draft, serial: clean(draft.serial), printerCode: clean(draft.printerCode), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setNotes((current) => [newNote, ...current]);
    setDraft((current) => ({ ...blankDraft(), denomination: current.denomination, country: current.country, city: current.city, postalCode: current.postalCode, comment: mode === "consecutive" ? current.comment : "", printerCode: mode === "consecutive" ? current.printerCode : "" }));
    setMessage("Added to your local submission queue.");
  }

  function removeNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
  }

  function copyQueue() {
    const header = "serial,printer_code,denomination,country,city,postal_code,comment";
    const rows = notes.map((note) => [note.serial, note.printerCode, note.denomination, note.country, note.city, note.postalCode, note.comment].map((value) => `\"${value.replaceAll('\"', '\"\"')}\"`).join(","));
    navigator.clipboard.writeText([header, ...rows].join("\n"));
    setMessage("Queue copied as CSV.");
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">€</span><span>EBT <b>Web</b></span></div>
      <span className="status"><i /> Private on this device</span>
    </header>

    <section className="hero">
      <p className="eyebrow">EUROBILLTRACKER ENTRY</p>
      <h1>Make every note count.</h1>
      <p>Fast camera-assisted entry, built for your iPhone.</p>
    </section>

    {tab === "entry" && <section className="entry-panel">
      <div className="mode-switch" aria-label="Entry mode">
        <button className={mode === "used" ? "selected" : ""} onClick={() => setMode("used")}>Used notes</button>
        <button className={mode === "consecutive" ? "selected" : ""} onClick={() => setMode("consecutive")}>Consecutive</button>
      </div>
      <p className="mode-help">{mode === "used" ? "Enter a serial and printer code for each note." : "Keep the printer code and location while you enter a sequence."}</p>

      <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={scanPhoto} hidden />
      <button className="scan" onClick={() => fileInput.current?.click()} disabled={isScanning}>
        <span className="scan-icon">⌁</span><span>{isScanning ? "Reading image…" : "Scan with camera"}</span><small>OCR</small>
      </button>

      <div className="note-card">
        <div className="field-row"><label>Serial number <em>{draft.serial ? (serialOk ? "looks right" : "check format") : "required"}</em><input value={draft.serial} onChange={(e) => update("serial", e.target.value)} placeholder="X12345678901" autoCapitalize="characters" /></label></div>
        <div className="field-row"><label>Printer code <em>{draft.printerCode ? (codeOk ? "looks right" : "check format") : "required"}</em><input value={draft.printerCode} onChange={(e) => update("printerCode", e.target.value)} placeholder="M001A1" autoCapitalize="characters" /></label></div>
        <div className="denominations" aria-label="Denomination">{denominations.map((value) => <button key={value} className={draft.denomination === value ? "chosen" : ""} onClick={() => update("denomination", value)}>€{value}</button>)}</div>
      </div>

      <div className="section-heading"><span>Where did you get it?</span><button onClick={useLocation}>Use my location</button></div>
      <div className="location-card">
        <label>Country<input value={draft.country} onChange={(e) => update("country", e.target.value)} placeholder="Slovakia" autoComplete="country-name" /></label>
        <div className="two-fields"><label>City<input value={draft.city} onChange={(e) => update("city", e.target.value)} placeholder="Bratislava" autoComplete="address-level2" /></label><label>Postal code<input value={draft.postalCode} onChange={(e) => update("postalCode", e.target.value)} placeholder="811 01" autoComplete="postal-code" /></label></div>
        <button className="text-button" onClick={saveLocation}>Remember this location</button>
      </div>
      <label className="comment">Comment <span>optional</span><textarea value={draft.comment} onChange={(e) => update("comment", e.target.value)} placeholder="e.g. supermarket, change" rows={2} /></label>
      <button className="save" onClick={addNote}>Add note to queue <span>→</span></button>
      {message && <p className="notice" role="status">{message}</p>}
    </section>}

    {tab === "queue" && <section className="queue-panel">
      <div className="queue-total"><div><span>{notes.length}</span><small>notes queued</small></div><div><span>€{total}</span><small>total value</small></div></div>
      {notes.length === 0 ? <div className="empty"><span>◌</span><h2>Your queue is clear</h2><p>Add a note and it will stay here, even if you close the app.</p></div> : <><button className="export" onClick={copyQueue}>Copy queue as CSV</button><div className="note-list">{notes.map((note) => <article key={note.id}><div><strong>€{note.denomination}</strong><span>{note.serial}</span><small>{note.city}, {note.country}</small></div><button aria-label={`Remove ${note.serial}`} onClick={() => removeNote(note.id)}>×</button></article>)}</div><p className="queue-footnote">Submission will be enabled after the official EuroBillTracker API connection is verified.</p></>}
      {message && <p className="notice" role="status">{message}</p>}
    </section>}

    {tab === "settings" && <section className="settings-panel"><p className="eyebrow">SETTINGS</p><h2>Your notes stay yours.</h2><p>Drafts and the queue are stored only in this browser. No EuroBillTracker password is collected or stored by EBT Web.</p><div className="setting"><span>Install on iPhone</span><small>In Safari: Share → Add to Home Screen</small></div><div className="setting"><span>Clear local queue</span><button onClick={() => { setNotes([]); setMessage("Local queue cleared."); }}>Clear</button></div>{message && <p className="notice" role="status">{message}</p>}</section>}

    <nav className="bottom-nav" aria-label="Main navigation"><button className={tab === "entry" ? "active" : ""} onClick={() => setTab("entry")}><span>＋</span>Entry</button><button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}><span>≡</span>Queue{notes.length > 0 && <b>{notes.length}</b>}</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span>Settings</button></nav>
  </main>;
}
