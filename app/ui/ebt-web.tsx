"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

type EbtAccount = {
  username: string;
  my_city: string;
  my_country: string;
  my_zip: string;
  totalbills: number;
  totalhits: number;
};

type Tab = "entry" | "queue" | "settings";
type ScanTarget = "printerCode" | "serial";
type ScanBox = { x0: number; y0: number; x1: number; y1: number };
type ScanMatch = { value: string; boxes: ScanBox[] };
type FrozenScan = ScanMatch & { target: ScanTarget; image: string; width: number; height: number };
type PaddleItem = { text: string; score: number; poly: Array<[number, number]> };
type PaddleEngine = { predict: (input: Blob, options?: Record<string, number>) => Promise<Array<{ items: PaddleItem[] }>>; dispose: () => Promise<void> };

const denominations = ["5", "10", "20", "50", "100", "200", "500"];
const blankDraft = () => ({ serial: "", printerCode: "", denomination: "", country: "", city: "", postalCode: "", comment: "" });

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
  const [account, setAccount] = useState<EbtAccount | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [scanTarget, setScanTarget] = useState<ScanTarget>("printerCode");
  const [cameraHint, setCameraHint] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [scanResult, setScanResult] = useState<FrozenScan | null>(null);
  const [resultDisplaySeconds, setResultDisplaySeconds] = useState(5);
  const [autoQueueNext, setAutoQueueNext] = useState(false);
  const draftRef = useRef(draft);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraFrameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ocrRef = useRef<PaddleEngine | null>(null);
  const ocrLoadingRef = useRef<Promise<PaddleEngine> | null>(null);
  const cameraActiveRef = useRef(false);
  const targetRef = useRef<ScanTarget>("printerCode");
  const readingFrameRef = useRef(false);
  const scanTimeoutRef = useRef<number | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ebt-web-queue");
    if (saved) setNotes(JSON.parse(saved));
    const savedLocation = window.localStorage.getItem("ebt-web-location");
    if (savedLocation) setDraft((current) => ({ ...current, ...JSON.parse(savedLocation) }));
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").then(() => {
          navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
        }).catch(() => undefined);
      } else {
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
        window.caches?.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ebt-web-")).map((key) => window.caches.delete(key))));
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ebt-web-queue", JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const savedSeconds = Number(window.localStorage.getItem("ebt-web-result-display-seconds"));
    if (Number.isFinite(savedSeconds) && savedSeconds >= 1 && savedSeconds <= 15) setResultDisplaySeconds(savedSeconds);
    setAutoQueueNext(window.localStorage.getItem("ebt-web-auto-queue-next") === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ebt-web-result-display-seconds", String(resultDisplaySeconds));
  }, [resultDisplaySeconds]);

  useEffect(() => {
    window.localStorage.setItem("ebt-web-auto-queue-next", String(autoQueueNext));
  }, [autoQueueNext]);

  useEffect(() => {
    void fetch("/api/ebt/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: { account?: EbtAccount | null } | null) => setAccount(data?.account ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Let the entry screen paint first. OCR then prepares in its own worker while
    // the app is idle, so opening the camera normally has no model-start delay.
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => void getOcr().catch(() => undefined), { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const warmUp = window.setTimeout(() => void getOcr().catch(() => undefined), 500);
    return () => window.clearTimeout(warmUp);
  }, []);

  const serialOk = isSerialValid(clean(draft.serial));
  const codeOk = isCodeValid(clean(draft.printerCode));
  const denominationOk = denominations.includes(draft.denomination);
  const ready = denominationOk && serialOk && codeOk && Boolean(draft.city.trim()) && Boolean(draft.country.trim());
  const total = useMemo(() => notes.reduce((sum, note) => sum + Number(note.denomination), 0), [notes]);
  const notesPerHit = account && Number(account.totalhits) > 0 ? (Number(account.totalbills) / Number(account.totalhits)).toFixed(1) : "—";

  function update(field: keyof ReturnType<typeof blankDraft>, value: string) {
    setDraft((current) => ({ ...current, [field]: field === "serial" || field === "printerCode" ? clean(value) : value }));
  }

  function chooseDenomination(value: string) {
    update("denomination", value);
    // A value tap is the intentional start of a new capture flow.
    void openCamera("printerCode");
  }

  function labelFor(target: ScanTarget) {
    return target === "printerCode" ? "printer code" : "serial number";
  }

  useEffect(() => () => {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    ocrRef.current?.dispose();
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
  }, [cameraOpen, cameraSession]);

  function stopCamera() {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult(null);
  }

  function findValidCode(items: PaddleItem[], target: ScanTarget): ScanMatch | null {
    const readable = items.filter((item) => item.score >= 0.4 && item.poly.length > 0);
    const boxFor = (item: PaddleItem): ScanBox => {
      const x = item.poly.map(([pointX]) => pointX);
      const y = item.poly.map(([, pointY]) => pointY);
      return { x0: Math.min(...x), y0: Math.min(...y), x1: Math.max(...x), y1: Math.max(...y) };
    };
    const matcher = target === "printerCode" ? /[A-Z]\d{3}[A-Z][1-9]/g : /(?:[A-Z]\d{11}|[A-Z]{2}\d{10})/g;
    const isValid = target === "printerCode" ? isCodeValid : isSerialValid;
    const validFrom = (text: string) => (clean(text).match(matcher) ?? []).find(isValid);

    for (const item of readable) {
      const valid = validFrom(item.text);
      if (valid) return { value: valid, boxes: [boxFor(item)] };
    }

    // Printed codes are commonly detected as separate character groups. Join nearby
    // groups on the same baseline, but still require the complete EBT validation.
    const ordered = [...readable].sort((a, b) => {
      const aBox = boxFor(a);
      const bBox = boxFor(b);
      const aMidY = (aBox.y0 + aBox.y1) / 2;
      const bMidY = (bBox.y0 + bBox.y1) / 2;
      return Math.abs(aMidY - bMidY) > Math.max(aBox.y1 - aBox.y0, bBox.y1 - bBox.y0) ? aMidY - bMidY : aBox.x0 - bBox.x0;
    });
    for (let start = 0; start < ordered.length; start += 1) {
      const group = [ordered[start]];
      const firstBox = boxFor(ordered[start]);
      for (let end = start + 2; end <= Math.min(start + 4, ordered.length); end += 1) {
        const previous = group[group.length - 1];
        const previousBox = boxFor(previous);
        const next = ordered[end - 1];
        const nextBox = boxFor(next);
        const sameLine = Math.abs(((previousBox.y0 + previousBox.y1) - (nextBox.y0 + nextBox.y1)) / 2) <= Math.max(previousBox.y1 - previousBox.y0, nextBox.y1 - nextBox.y0) * 1.5;
        const closeEnough = nextBox.x0 - previousBox.x1 <= Math.max(firstBox.x1 - firstBox.x0, 80) * 1.5;
        if (!sameLine || !closeEnough) break;
        group.push(next);
        const valid = validFrom(group.map((item) => item.text).join(""));
        if (valid) return { value: valid, boxes: group.map(boxFor) };
      }
    }
    return null;
  }

  async function getOcr() {
    if (!ocrRef.current) {
      if (!ocrLoadingRef.current) {
        ocrLoadingRef.current = (async () => {
          const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
          return PaddleOCR.create({
            textDetectionModelName: "PP-OCRv6_tiny_det",
            textRecognitionModelName: "PP-OCRv6_tiny_rec",
            worker: true,
            textDetectionModelAsset: { url: "/ocr/PP-OCRv6_tiny_det_onnx_infer.tar" },
            textRecognitionModelAsset: { url: "/ocr/PP-OCRv6_tiny_rec_onnx_infer.tar" },
            ortOptions: {
              backend: "wasm",
              // Browsers without cross-origin isolation cannot use WASM threads.
              // One predictable SIMD runtime is quicker to start and works everywhere.
              numThreads: 1,
              simd: true,
              wasmPaths: "/ocr/ort/"
            }
          }) as Promise<PaddleEngine>;
        })();
      }
      try {
        ocrRef.current = await ocrLoadingRef.current;
      } catch (error) {
        ocrLoadingRef.current = null;
        throw error;
      }
    }
    return ocrRef.current;
  }

  function advanceFromLiveResult(target: ScanTarget) {
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    setScanResult(null);
    if (target === "printerCode") {
      void openCamera("serial");
      return;
    }
    if (autoQueueNext && addNote(true)) {
      void openCamera("printerCode");
      return;
    }
    stopCamera();
    setMessage("Serial number saved. Review the note, then add it to the queue.");
  }

  function redoLiveScan(target: ScanTarget) {
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    setScanResult(null);
    void openCamera(target);
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
    resultTimeoutRef.current = window.setTimeout(() => advanceFromLiveResult(target), resultDisplaySeconds * 1000);
  }

  async function readFrame() {
    if (!cameraActiveRef.current || readingFrameRef.current || !videoRef.current?.videoWidth) return;
    readingFrameRef.current = true;
    const target = targetRef.current;
    try {
      const canvas = document.createElement("canvas");
      const video = videoRef.current;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const videoBounds = video.getBoundingClientRect();
      const guideBounds = cameraFrameRef.current?.getBoundingClientRect();
      const scale = Math.max(videoBounds.width / sourceWidth, videoBounds.height / sourceHeight);
      const renderedLeft = videoBounds.left + (videoBounds.width - sourceWidth * scale) / 2;
      const renderedTop = videoBounds.top + (videoBounds.height - sourceHeight * scale) / 2;
      const guideX = guideBounds ? (guideBounds.left - renderedLeft) / scale : sourceWidth * 0.12;
      const guideY = guideBounds ? (guideBounds.top - renderedTop) / scale : sourceHeight * 0.28;
      const guideWidth = guideBounds ? guideBounds.width / scale : sourceWidth * 0.76;
      const guideHeight = guideBounds ? guideBounds.height / scale : sourceHeight * 0.25;
      const horizontalPadding = guideWidth * 0.04;
      const verticalPadding = guideHeight * 0.16;
      const cropX = Math.max(0, Math.floor(guideX - horizontalPadding));
      const cropY = Math.max(0, Math.floor(guideY - verticalPadding));
      const cropWidth = Math.min(sourceWidth - cropX, Math.ceil(guideWidth + horizontalPadding * 2));
      const cropHeight = Math.min(sourceHeight - cropY, Math.ceil(guideHeight + verticalPadding * 2));
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera frame could not be prepared.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!image || !cameraActiveRef.current) return;
      setCameraHint(ocrRef.current ? "Recognizing the guide area…" : "Preparing on-device recognition…");
      const ocr = await getOcr();
      if (!scanTimeoutRef.current) {
        scanTimeoutRef.current = window.setTimeout(() => {
          if (!cameraActiveRef.current) return;
          stopCamera();
          setMessage(`No valid banknote ${labelFor(target)} found in 15 seconds. Centre it inside the frame and try again.`);
        }, 15000);
      }
      const [result] = await ocr.predict(image, { textDetLimitSideLen: 1280, textRecScoreThresh: 0.4 });
      const match = findValidCode(result?.items ?? [], target);
      if (match && cameraActiveRef.current && target === targetRef.current) {
        finishLiveScan(target, match, canvas.toDataURL("image/jpeg", 0.92), canvas.width, canvas.height);
        return;
      }
      if (cameraActiveRef.current) setCameraHint(`Still looking for the ${labelFor(target)}…`);
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
    setCameraHint(`Looking for the ${labelFor(target)}…`);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Live camera is unavailable here. Open the app at localhost and allow camera access in your browser settings, or enter the values manually.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false });
      streamRef.current = stream;
      cameraActiveRef.current = true;
      setPreviewReady(false);
      setScanResult(null);
      setCameraOpen(true);
      setCameraSession((current) => current + 1);
      setIsScanning(true);
      setMessage("");
    } catch {
      setMessage("Camera access was blocked. Click the camera icon in your browser address bar and allow this site to use your camera, then try again.");
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

  function addNote(keepLocationAndComment = false) {
    const currentDraft = draftRef.current;
    const currentReady = denominations.includes(currentDraft.denomination) && isSerialValid(currentDraft.serial) && isCodeValid(currentDraft.printerCode) && Boolean(currentDraft.city.trim()) && Boolean(currentDraft.country.trim());
    if (!currentReady) {
      setMessage("Complete a valid-looking serial, printer code, country, and city first.");
      return false;
    }
    const newNote: Note = { ...currentDraft, serial: clean(currentDraft.serial), printerCode: clean(currentDraft.printerCode), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setNotes((current) => [newNote, ...current]);
    setDraft((current) => keepLocationAndComment ? { ...current, serial: "", printerCode: "" } : ({ ...blankDraft(), denomination: current.denomination, country: current.country, city: current.city, postalCode: current.postalCode }));
    setMessage(keepLocationAndComment ? "Added to your local queue. Scanning the next note…" : "Added to your local submission queue.");
    return true;
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

  function applyEbtDefaults(ebtAccount: EbtAccount) {
    setDraft((current) => ({ ...current, country: current.country || ebtAccount.my_country || "", city: current.city || ebtAccount.my_city || "", postalCode: current.postalCode || ebtAccount.my_zip || "" }));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setMessage("");
    try {
      const response = await fetch("/api/ebt/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { account?: EbtAccount; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error || "Could not sign in to EBT.");
      setAccount(data.account);
      applyEbtDefaults(data.account);
      setEmail("");
      setPassword("");
      setMessage(`Signed in to EuroBillTracker as ${data.account.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in to EBT.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    await fetch("/api/ebt/logout", { method: "POST" }).catch(() => undefined);
    setAccount(null);
    setPassword("");
    setMessage("Signed out of EuroBillTracker on this device.");
  }

  async function submitQueue() {
    if (!account || isSubmitting || notes.length === 0) return;
    const first = notes[0];
    const batch = notes.filter((note) => note.country === first.country && note.city === first.city && note.postalCode === first.postalCode).slice(0, 25);
    setIsSubmitting(true);
    setMessage(`Sending ${batch.length} note${batch.length === 1 ? "" : "s"} to EuroBillTracker…`);
    try {
      const response = await fetch("/api/ebt/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: batch }) });
      const data = await response.json() as { results?: Array<{ id: string; result: { status?: number } | null }>; error?: string };
      if (!response.ok || !data.results) throw new Error(data.error || "EBT could not receive the notes.");
      const successful = data.results.filter(({ result }) => result && (Number(result.status) === 0 || Number(result.status) === 1));
      const hits = successful.filter(({ result }) => Number(result?.status) === 1).length;
      if (successful.length) setNotes((current) => current.filter((note) => !successful.some(({ id }) => id === note.id)));
      const failed = batch.length - successful.length;
      setMessage(`${successful.length} note${successful.length === 1 ? "" : "s"} submitted${hits ? `, including ${hits} hit${hits === 1 ? "" : "s"}` : ""}.${failed ? ` ${failed} stayed in the queue because EBT rejected it.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "EBT could not receive the notes. They remain in your queue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">€</span><span>EBT <b>Web</b></span></div>
    </header>

    {tab === "entry" && <section className="entry-panel">
      <div className="section-heading"><span>Where did you get it?</span><button onClick={useLocation}>Use my location</button></div>
      <div className="location-card">
        <label>Country<input value={draft.country} onChange={(e) => update("country", e.target.value)} placeholder="Slovakia" autoComplete="country-name" /></label>
        <div className="two-fields"><label>City<input value={draft.city} onChange={(e) => update("city", e.target.value)} placeholder="Bratislava" autoComplete="address-level2" /></label><label>Postal code<input value={draft.postalCode} onChange={(e) => update("postalCode", e.target.value)} placeholder="811 01" autoComplete="postal-code" /></label></div>
        <button className="text-button" onClick={saveLocation}>Remember this location</button>
      </div>
      <label className="comment">Comment <span>optional</span><textarea value={draft.comment} onChange={(e) => update("comment", e.target.value)} placeholder="e.g. supermarket, change" rows={2} /></label>

      {cameraOpen && <div className="camera-sheet" role="dialog" aria-label="Scan banknote with camera">
        <div className="camera-toolbar">
          <div className="camera-context">
            <small>€{draft.denomination || "—"}{(scanResult?.target ?? scanTarget) === "serial" && draft.printerCode ? ` · ${draft.printerCode}` : ""}</small>
            <span>{scanResult ? `Valid ${labelFor(scanResult.target)} found` : `Scanning ${labelFor(scanTarget)}`}</span>
          </div>
          <button onClick={stopCamera} aria-label="Close camera">×</button>
        </div>
        {scanResult ? <>
          <div className="camera-preview result-preview">
            <img src={scanResult.image} alt={`Captured ${scanResult.target}`} />
            {scanResult.boxes.map((box, index) => <i key={index} className="result-box" style={{ left: `${(box.x0 / scanResult.width) * 100}%`, top: `${(box.y0 / scanResult.height) * 100}%`, width: `${((box.x1 - box.x0) / scanResult.width) * 100}%`, height: `${((box.y1 - box.y0) / scanResult.height) * 100}%` }} />)}
          </div>
          <div className="scan-success"><span>{scanResult.target === "printerCode" ? "VALID EBT PRINTER CODE FORMAT" : "VALID EURO SERIAL CHECKSUM"}</span><strong>{scanResult.value}</strong><small>{scanResult.target === "printerCode" ? "Printer code saved. Turn the note over for the serial number." : autoQueueNext ? "Serial checksum passed. This note will be queued and the next note will start." : "Serial checksum passed. Review the note before adding it to the queue."} Continuing in {resultDisplaySeconds}s.</small></div>
          <div className="result-actions"><button className="redo-scan" onClick={() => redoLiveScan(scanResult.target)}>Redo scan</button><button className="continue-scan" onClick={() => advanceFromLiveResult(scanResult.target)}>Continue now</button></div>
        </> : <>
          <div className="camera-preview">
            <video ref={videoRef} autoPlay playsInline muted />
            <span className="live-label"><i /> LIVE CAMERA</span>
            {!previewReady && <span className="preview-loading">Starting webcam preview…</span>}
            <div ref={cameraFrameRef} className="camera-frame" aria-hidden="true" />
          </div>
          <p className="camera-hint"><i /> {cameraHint}</p>
        </>}
      </div>}

      <div className="note-card">
        <div className="denominations" aria-label="Choose a denomination to scan the printer code">{denominations.map((value) => <button type="button" key={value} className={draft.denomination === value ? "chosen" : ""} onClick={() => chooseDenomination(value)} disabled={isScanning} aria-label={`Choose €${value} and scan printer code`}>€{value}</button>)}</div>
        <div className="field-row">
          <div className="field-heading"><label htmlFor="printer-code">Printer code <em>{draft.printerCode ? (codeOk ? "valid format" : "check format") : "step 1"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("printerCode")}>Scan</button></div>
          <input id="printer-code" value={draft.printerCode} onChange={(e) => update("printerCode", e.target.value)} placeholder="R001A1" autoCapitalize="characters" />
        </div>
        <div className="field-row">
          <div className="field-heading"><label htmlFor="serial-number">Serial number <em>{draft.serial ? (serialOk ? "checksum passed" : "check checksum") : "step 2"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("serial")}>Scan</button></div>
          <input id="serial-number" value={draft.serial} onChange={(e) => update("serial", e.target.value)} placeholder="S02896734778" autoCapitalize="characters" />
        </div>
      </div>
      <button className="save" onClick={() => addNote()}>Add note to queue <span>→</span></button>
      {message && <p className="notice" role="status">{message}</p>}
    </section>}

    {tab === "queue" && <section className="queue-panel">
      {notes.length > 0 && (account ? <button className="submit" onClick={submitQueue} disabled={isSubmitting}>{isSubmitting ? "Submitting to EBT…" : `Submit ${Math.min(25, notes.filter((note) => note.country === notes[0].country && note.city === notes[0].city && note.postalCode === notes[0].postalCode).length)} to EuroBillTracker`}</button> : <p className="notice">Sign in from Settings to submit this queue to EuroBillTracker.</p>)}
      <div className="queue-total"><div><span>{notes.length}</span><small>notes queued</small></div><div><span>€{total}</span><small>total value</small></div></div>
      {notes.length === 0 ? <div className="empty"><span>◌</span><h2>Your queue is clear</h2><p>Add a note and it will stay here, even if you close the app.</p></div> : <><button className="export" onClick={copyQueue}>Copy queue as CSV</button><div className="note-list">{notes.map((note) => <article key={note.id}><div><strong>€{note.denomination}</strong><span>{note.serial}</span><small>{note.city}, {note.country}</small></div><button aria-label={`Remove ${note.serial}`} onClick={() => removeNote(note.id)}>×</button></article>)}</div><p className="queue-footnote">EBT accepts up to 25 notes with the same location per submission. Notes from other locations remain queued.</p></>}
      {message && <p className="notice" role="status">{message}</p>}
    </section>}

    {tab === "settings" && <section className="settings-panel"><p className="eyebrow">SETTINGS</p><h2>Your notes stay yours.</h2><p>Your queue and location stay in this browser. To submit notes, EBT Web sends your password directly to EuroBillTracker over HTTPS and never saves it.</p>{account && <section className="stats-card" aria-label="My EuroBillTracker statistics"><span>MY EBT STATS</span><strong>{account.username}</strong><div><p><b>{account.totalbills}</b><small>notes</small></p><p><b>{account.totalhits}</b><small>hits</small></p><p><b>{notesPerHit}</b><small>notes / hit</small></p></div><small>Last hit is not supplied by EBT’s official API.</small></section>}<div className="scan-settings"><label>Show each scan result for <select value={resultDisplaySeconds} onChange={(event) => setResultDisplaySeconds(Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 1).map((seconds) => <option key={seconds} value={seconds}>{seconds}</option>)}</select> seconds</label><small>After a printer-code scan, the serial scan begins automatically.</small><label className="toggle-setting"><input type="checkbox" checked={autoQueueNext} onChange={(event) => setAutoQueueNext(event.target.checked)} /><span>Automatically add complete notes and scan the next one</span></label></div>{account ? <div className="account-card"><span>Signed in to EuroBillTracker</span><strong>{account.username}</strong><small>{account.totalbills} notes · {account.totalhits} hits</small><button onClick={logout}>Sign out</button></div> : <form className="login-form" onSubmit={login}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button type="submit" disabled={isLoggingIn}>{isLoggingIn ? "Signing in…" : "Sign in to EuroBillTracker"}</button><small>Your password is not stored in this app or browser storage.</small></form>}<div className="setting"><span>Install on iPhone</span><small>In Safari: Share → Add to Home Screen</small></div><div className="setting"><span>Clear local queue</span><button onClick={() => { setNotes([]); setMessage("Local queue cleared."); }}>Clear</button></div>{message && <p className="notice" role="status">{message}</p>}</section>}

    <nav className="bottom-nav" aria-label="Main navigation"><button className={tab === "entry" ? "active" : ""} onClick={() => setTab("entry")}><span>＋</span>Entry</button><button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}><span>≡</span>Queue{notes.length > 0 && <b>{notes.length}</b>}</button><button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span>Settings</button></nav>
  </main>;
}
