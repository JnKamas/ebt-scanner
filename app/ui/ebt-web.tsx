"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Worker } from "tesseract.js";

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
type ScanTarget = "printerCode" | "serial";
type ScanBox = { x0: number; y0: number; x1: number; y1: number };
type ScanMatch = { value: string; boxes: ScanBox[] };
type FrozenScan = ScanMatch & { target: ScanTarget; image: string; width: number; height: number };

const denominations = ["5", "10", "20", "50", "100", "200", "500"];
const blankDraft = () => ({ serial: "", printerCode: "", denomination: "20", country: "", city: "", postalCode: "", comment: "" });

function clean(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isSerialValid(serial: string) {
  const value = clean(serial);
  const digitSum = (digits: string) => [...digits].reduce((total, digit) => total + Number(digit), 0);
  if (/^[A-Z]\d{11}$/.test(value)) return (value.charCodeAt(0) + digitSum(value.slice(1))) % 9 === 0;
  if (/^[A-Z]{2}\d{10}$/.test(value)) {
    const letterValue = (letter: string) => letter.charCodeAt(0) - 64;
    return (letterValue(value[0]) + letterValue(value[1]) + digitSum(value.slice(2))) % 9 === 7;
  }
  return false;
}

function isCodeValid(code: string) {
  return /^[A-Z]\d{3}[A-Z][1-9]$/.test(clean(code));
}

export default function EbtWeb() {
  const [tab, setTab] = useState<Tab>("entry");
  const [draft, setDraft] = useState(blankDraft);
  const [notes, setNotes] = useState<Note[]>([]);
  const [mode, setMode] = useState<"used" | "consecutive">("used");
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<ScanTarget>("printerCode");
  const [cameraHint, setCameraHint] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [scanResult, setScanResult] = useState<FrozenScan | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const cameraActiveRef = useRef(false);
  const targetRef = useRef<ScanTarget>("printerCode");
  const readingFrameRef = useRef(false);
  const scanTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ebt-web-queue");
    if (saved) setNotes(JSON.parse(saved));
    const savedLocation = window.localStorage.getItem("ebt-web-location");
    if (savedLocation) setDraft((current) => ({ ...current, ...JSON.parse(savedLocation) }));
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      } else {
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
        window.caches?.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ebt-web-")).map((key) => window.caches.delete(key))));
      }
    }
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

  useEffect(() => () => {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    let cancelled = false;

    const startPreview = async () => {
      try {
        await video.play();
        if (!cancelled) {
          setPreviewReady(true);
          void readFrame();
        }
      } catch {
        if (!cancelled) setCameraHint("The webcam started, but its preview could not play. Try closing and scanning again.");
      }
    };

    video.srcObject = stream;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) void startPreview();
    else video.addEventListener("loadedmetadata", startPreview, { once: true });

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", startPreview);
      video.srcObject = null;
    };
  }, [cameraOpen]);

  function stopCamera() {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult(null);
  }

  function findValidCode(data: { text: string; words?: Array<{ text: string; bbox: ScanBox; confidence: number }> }, target: ScanTarget): ScanMatch | null {
    const matcher = target === "printerCode" ? /[A-Z]\d{3}[A-Z][1-9]/g : /(?:[A-Z]\d{11}|[A-Z]{2}\d{10})/g;
    const isValid = target === "printerCode" ? isCodeValid : isSerialValid;
    const words = data.words ?? [];
    for (const word of words) {
      if (word.confidence < 55) continue;
      const candidates = clean(word.text).match(matcher) ?? [];
      const valid = candidates.find(isValid);
      if (valid) return { value: valid, boxes: [word.bbox] };
    }
    const candidates = clean(data.text).match(matcher) ?? [];
    const valid = candidates.find(isValid);
    return valid ? { value: valid, boxes: words.map((word) => word.bbox) } : null;
  }

  async function getWorker() {
    if (!workerRef.current) {
      const { createWorker } = await import("tesseract.js");
      workerRef.current = await createWorker("eng", 1);
    }
    return workerRef.current;
  }

  function saveScanResult(target: ScanTarget, value: string) {
    update(target, value);
    stopCamera();
    setMessage(target === "printerCode" ? `Printer code found: ${value}. Turn the note over and scan its serial number.` : `Serial number found: ${value}. Check the values, then add the note.`);
  }

  function finishLiveScan(target: ScanTarget, match: ScanMatch, image: string, width: number, height: number) {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    update(target, match.value);
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult({ ...match, target, image, width, height });
  }

  async function readFrame() {
    if (!cameraActiveRef.current || readingFrameRef.current || !videoRef.current?.videoWidth) return;
    readingFrameRef.current = true;
    const target = targetRef.current;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
      const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!image || !cameraActiveRef.current) return;
      const worker = await getWorker();
      const result = await worker.recognize(image);
      const match = findValidCode(result.data, target);
      if (match && cameraActiveRef.current && target === targetRef.current) {
        finishLiveScan(target, match, canvas.toDataURL("image/jpeg", 0.92), canvas.width, canvas.height);
        return;
      }
      if (cameraActiveRef.current) setCameraHint(`Still looking for the ${target === "printerCode" ? "printer code" : "serial number"}…`);
    } catch {
      if (cameraActiveRef.current) setCameraHint("Could not read that view. Try more light or move closer.");
    } finally {
      readingFrameRef.current = false;
      if (cameraActiveRef.current) window.setTimeout(() => void readFrame(), 350);
    }
  }

  async function openCamera(target: ScanTarget) {
    targetRef.current = target;
    setScanTarget(target);
    setCameraHint(`Looking for the ${target === "printerCode" ? "printer code" : "serial number"}…`);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Live camera is unavailable here. Open the app at localhost and allow camera access in your browser settings, or choose a photo manually.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      cameraActiveRef.current = true;
      setPreviewReady(false);
      setScanResult(null);
      setCameraOpen(true);
      setIsScanning(true);
      setMessage("");
      scanTimeoutRef.current = window.setTimeout(() => {
        if (!cameraActiveRef.current) return;
        stopCamera();
        setMessage(`No valid Euro banknote ${target === "printerCode" ? "printer code" : "serial number"} found in 15 seconds. Centre the code inside the frame and try again.`);
      }, 15000);
    } catch {
      setMessage("Camera access was blocked. Click the camera icon in your browser address bar and allow this site to use your camera, then try again.");
    }
  }

  async function scanImage(image: File | Blob) {
    if (!image) return;
    stopCamera();
    setIsScanning(true);
    setMessage(`Reading ${scanTarget === "printerCode" ? "printer code" : "serial number"}…`);
    try {
      const worker = await getWorker();
      const result = await worker.recognize(image);
      const match = findValidCode(result.data, scanTarget);
      if (match) saveScanResult(scanTarget, match.value);
      else setMessage(`Nothing clear found. Try a closer, brighter photo of the ${scanTarget === "printerCode" ? "printer code" : "serial number"}.`);
    } catch {
      setMessage("The scan could not run. You can still enter the values manually.");
    } finally {
      setIsScanning(false);
    }
  }

  function scanPhoto(event: ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    if (image) void scanImage(image);
    event.target.value = "";
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
      <button className="scan" onClick={() => openCamera(draft.printerCode ? "serial" : "printerCode")} disabled={isScanning}>
        <span className="scan-icon">⌁</span><span>{isScanning ? "Scanning…" : draft.printerCode ? "Step 2 · Scan serial number" : "Step 1 · Scan printer code"}</span><small>LIVE OCR</small>
      </button>
      <button className="photo-fallback" onClick={() => fileInput.current?.click()}>Use an existing photo instead</button>
      {cameraOpen && <div className="camera-sheet" role="dialog" aria-label="Scan banknote with camera">
        <div className="camera-toolbar"><span>{scanResult ? `Valid ${scanResult.target === "printerCode" ? "printer code" : "serial number"} found` : `Scanning ${scanTarget === "printerCode" ? "printer code" : "serial number"}`}</span><button onClick={stopCamera} aria-label="Close camera">×</button></div>
        {scanResult ? <>
          <div className="camera-preview result-preview">
            <img src={scanResult.image} alt={`Captured ${scanResult.target}`} />
            {scanResult.boxes.map((box, index) => <i key={index} className="result-box" style={{ left: `${(box.x0 / scanResult.width) * 100}%`, top: `${(box.y0 / scanResult.height) * 100}%`, width: `${((box.x1 - box.x0) / scanResult.width) * 100}%`, height: `${((box.y1 - box.y0) / scanResult.height) * 100}%` }} />)}
          </div>
          <div className="scan-success"><span>{scanResult.target === "printerCode" ? "VALID EBT PRINTER CODE FORMAT" : "VALID EURO SERIAL CHECKSUM"}</span><strong>{scanResult.value}</strong><small>{scanResult.target === "printerCode" ? "Printer code saved. Turn the note over for the serial number." : "Serial number checksum passed and was saved."}</small></div>
          <button className="continue-scan" onClick={stopCamera}>Continue</button>
        </> : <>
          <div className="camera-preview">
            <video ref={videoRef} autoPlay playsInline muted />
            <span className="live-label"><i /> LIVE CAMERA</span>
            {!previewReady && <span className="preview-loading">Starting webcam preview…</span>}
          </div>
          <div className="camera-frame" aria-hidden="true" />
          <p className="camera-hint"><i /> {cameraHint}</p>
          <button className="choose-photo" onClick={() => { stopCamera(); fileInput.current?.click(); }}>Choose a photo instead</button>
        </>}
      </div>}

      <div className="note-card">
        <div className="field-row"><label>Printer code <em>{draft.printerCode ? (codeOk ? "valid format" : "check format") : "step 1"}</em><button className="field-scan" onClick={() => openCamera("printerCode")}>Scan</button><input value={draft.printerCode} onChange={(e) => update("printerCode", e.target.value)} placeholder="R001A1" autoCapitalize="characters" /></label></div>
        <div className="field-row"><label>Serial number <em>{draft.serial ? (serialOk ? "checksum passed" : "check checksum") : "step 2"}</em><button className="field-scan" onClick={() => openCamera("serial")}>Scan</button><input value={draft.serial} onChange={(e) => update("serial", e.target.value)} placeholder="S02896734778" autoCapitalize="characters" /></label></div>
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
