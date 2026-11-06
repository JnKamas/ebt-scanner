"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryLocationFields, PersonalProfile, SubmissionReceipts } from "./ebt-account-tools";
import { Receipt, SubmissionResult } from "../lib/ebt";
import BanknoteFlag from "./banknote-flag";
import { locateAddress, locationPermissionMessage } from "../lib/location";

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

type Tab = "entry" | "queue" | "profile" | "settings";
type ScanTarget = "printerCode" | "serial";
type CameraPreference = { deviceId: string };
const defaultCameras = (): Record<ScanTarget, CameraPreference> => ({ printerCode: { deviceId: "" }, serial: { deviceId: "" } });
type ScanBox = { x0: number; y0: number; x1: number; y1: number };
type ScanMatch = { value: string; boxes: ScanBox[]; confidences: number[] };
type FrozenScan = ScanMatch & { target: ScanTarget; image: string; width: number; height: number };
type PaddleItem = { text: string; score: number; poly: Array<[number, number]> };
type PaddleEngine = { predict: (input: Blob, options?: Record<string, number>) => Promise<Array<{ items: PaddleItem[] }>>; dispose: () => Promise<void> };
type OcrStatus = "loading" | "ready" | "error";

const minimumOcrConfidence = 0.7;
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
  const [installPlatform, setInstallPlatform] = useState<"ios" | "android" | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const [notes, setNotes] = useState<Note[]>([]);
  const [account, setAccount] = useState<EbtAccount | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const updateTotals = useCallback((totalbills: number, totalhits: number) => {
    setAccount((current) => current ? { ...current, totalbills, totalhits } : null);
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("loading");
  const [ocrError, setOcrError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [scanTarget, setScanTarget] = useState<ScanTarget>("printerCode");
  const [cameraHint, setCameraHint] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [scanResult, setScanResult] = useState<FrozenScan | null>(null);
  const [resultDisplaySeconds, setResultDisplaySeconds] = useState(5);
  const [resultSecondsRemaining, setResultSecondsRemaining] = useState(0);
  const [autoQueueNext, setAutoQueueNext] = useState(false);
  const [reusePrinterCode, setReusePrinterCode] = useState(false);
  const [cameraPreferences, setCameraPreferences] = useState(defaultCameras);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraListMessage, setCameraListMessage] = useState("");
  const [cameraPending, setCameraPending] = useState(false);
  const [cameraPreviewOnly, setCameraPreviewOnly] = useState(false);
  const previewOnlyRef = useRef(false);
  const cameraRequestRef = useRef(0);
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
  const resultCountdownRef = useRef<number | null>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    if (/Windows/i.test(userAgent)) return;
    if (/Android/i.test(userAgent)) setInstallPlatform("android");
    else if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)) {
      // iPadOS can identify itself as a Mac when requesting desktop websites.
      setInstallPlatform("ios");
    }
  }, []);

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
    setReusePrinterCode(window.localStorage.getItem("ebt-web-reuse-printer-code") === "true");
    try {
      const saved = JSON.parse(window.localStorage.getItem("ebt-web-cameras") || "null");
      if (saved) setCameraPreferences(Object.fromEntries((["printerCode", "serial"] as const).map((target) => [target, {
        deviceId: typeof saved[target]?.deviceId === "string" ? saved[target].deviceId : "",
      }])) as Record<ScanTarget, CameraPreference>);
    } catch { /* Ignore an invalid saved camera preference. */ }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("ebt-web-cameras", JSON.stringify(cameraPreferences));
    window.localStorage.setItem("ebt-web-reuse-printer-code", String(reusePrinterCode));
  }, [cameraPreferences, reusePrinterCode, preferencesReady]);

  useEffect(() => {
    // Listing devices never asks for camera permission. Labels appear after Scan.
    void refreshCameras();
    navigator.mediaDevices?.addEventListener("devicechange", refreshCameras);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refreshCameras);
  }, []);

  async function refreshCameras() {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      const available = devices?.filter((device) => device.kind === "videoinput" && device.deviceId) ?? [];
      setCameras(available);
      return available;
    } catch { return []; }
  }

  function updateCameraPreference(target: ScanTarget, change: Partial<CameraPreference>) {
    setCameraPreferences((current) => ({ ...current, [target]: { ...current[target], ...change } }));
  }

  async function discoverCameras() {
    if (cameraPending || cameraOpen) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraListMessage("Camera access is unavailable. Open this page over HTTPS or localhost.");
      return;
    }
    setCameraPending(true);
    setCameraListMessage("Allow camera access to list your cameras…");
    let stream: MediaStream | undefined;
    try {
      // Permission must be granted before browsers expose the full device list.
      // Keep the stream alive while enumerating, then release it without OCR.
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const available = await refreshCameras();
      setCameraListMessage(available.length
        ? `${available.length} camera${available.length === 1 ? "" : "s"} available. Choose a camera below for each code.${available.length === 1 ? " This browser exposes only one camera; additional phone lenses may not be available to websites." : ""}`
        : "No cameras were listed. Check camera permissions and click Scan for cameras again.");
    } catch (error) {
      setCameraListMessage(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Camera access was blocked. Allow camera access in browser settings, then click Scan for cameras again."
        : "Could not list cameras. Close other camera apps and click Scan for cameras again.");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setCameraPending(false);
    }
  }

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
    // Create the OCR worker on every app opening. Model files may come from the
    // browser cache after the first visit, but this page still needs a ready engine.
    void getOcr().catch(() => undefined);
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
    // A printer code belongs to one denomination; start a new batch when it changes.
    setDraft((current) => ({ ...current, denomination: value, printerCode: reusePrinterCode && current.denomination !== value ? "" : current.printerCode }));
  }

  function labelFor(target: ScanTarget) {
    return target === "printerCode" ? "printer code" : "serial number";
  }

  useEffect(() => () => {
    cameraRequestRef.current += 1;
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    if (resultCountdownRef.current) window.clearInterval(resultCountdownRef.current);
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
          if (previewOnlyRef.current) {
            scanTimeoutRef.current = window.setTimeout(() => {
              stopCamera();
              setMessage("Camera preview finished. Your camera choice is saved; no note values were changed.");
            }, 15000);
          } else void readFrame();
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
    cameraRequestRef.current += 1;
    setCameraPending(false);
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    clearResultCountdown();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult(null);
  }

  function clearResultCountdown() {
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    if (resultCountdownRef.current) window.clearInterval(resultCountdownRef.current);
    resultCountdownRef.current = null;
    setResultSecondsRemaining(0);
  }

  function findValidCode(items: PaddleItem[], target: ScanTarget): ScanMatch | null {
    // Apply the fixed 70% minimum to every OCR item, including joined groups.
    const readable = items.filter((item) => item.score >= minimumOcrConfidence && item.poly.length > 0);
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
      if (valid) return { value: valid, boxes: [boxFor(item)], confidences: [item.score] };
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
        if (valid) return { value: valid, boxes: group.map(boxFor), confidences: group.map((item) => item.score) };
      }
    }
    return null;
  }

  async function getOcr() {
    if (!ocrRef.current) {
      setOcrStatus("loading");
      setOcrError("");
      if (!ocrLoadingRef.current) {
        ocrLoadingRef.current = (async () => {
          const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
          const options = {
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
              wasmPaths: "/ocr/ort-1.24.3/"
            }
          };
          try {
            return await PaddleOCR.create(options) as PaddleEngine;
          } catch {
            // PaddleOCR's prebuilt worker carries the JSEP ONNX runtime. Some
            // Android and Windows browsers request that extra module even when
            // the app is configured for the ordinary WASM backend. Run the same
            // browser-side engine on the page when that worker cannot start.
            // This is also the reliable path used by iOS, and keeps OCR entirely
            // local while retaining the worker fast path where it is available.
            return PaddleOCR.create({ ...options, worker: false }) as Promise<PaddleEngine>;
          }
        })();
      }
      try {
        ocrRef.current = await ocrLoadingRef.current;
        setOcrStatus("ready");
      } catch (error) {
        ocrLoadingRef.current = null;
        setOcrStatus("error");
        setOcrError(error instanceof Error ? error.message : "Unknown OCR initialization error.");
        throw error;
      }
    }
    return ocrRef.current;
  }

  function advanceFromLiveResult(target: ScanTarget) {
    clearResultCountdown();
    setScanResult(null);
    if (target === "printerCode") {
      void openCamera("serial");
      return;
    }
    if (autoQueueNext && addNote(true)) {
      void openCamera(reusePrinterCode ? "serial" : "printerCode");
      return;
    }
    stopCamera();
    setMessage("Serial number saved. Review the note, then add it to the queue.");
  }

  function redoLiveScan(target: ScanTarget) {
    clearResultCountdown();
    setScanResult(null);
    void openCamera(target);
  }

  function finishLiveScan(target: ScanTarget, match: ScanMatch, image: string, width: number, height: number) {
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    draftRef.current = { ...draftRef.current, [target]: match.value };
    update(target, match.value);
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult({ ...match, target, image, width, height });
    const finishAt = Date.now() + resultDisplaySeconds * 1000;
    setResultSecondsRemaining(resultDisplaySeconds);
    resultCountdownRef.current = window.setInterval(() => {
      setResultSecondsRemaining(Math.max(0, Math.ceil((finishAt - Date.now()) / 1000)));
    }, 200);
    resultTimeoutRef.current = window.setTimeout(() => advanceFromLiveResult(target), resultDisplaySeconds * 1000);
  }

  async function readFrame() {
    if (!cameraActiveRef.current || readingFrameRef.current || !videoRef.current?.videoWidth) return;
    readingFrameRef.current = true;
    const request = cameraRequestRef.current;
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
      if (!image || !cameraActiveRef.current || request !== cameraRequestRef.current) return;
      setCameraHint(ocrRef.current ? "Recognizing the guide area…" : "Preparing on-device recognition…");
      const ocr = await getOcr();
      if (!cameraActiveRef.current || request !== cameraRequestRef.current) return;
      if (!scanTimeoutRef.current) {
        scanTimeoutRef.current = window.setTimeout(() => {
          if (!cameraActiveRef.current) return;
          stopCamera();
          setMessage(`No valid banknote ${labelFor(target)} found in 15 seconds. Centre it inside the frame and try again.`);
        }, 15000);
      }
      const [result] = await ocr.predict(image, { textDetLimitSideLen: 1280, textRecScoreThresh: 0 });
      const match = findValidCode(result?.items ?? [], target);
      if (match && cameraActiveRef.current && request === cameraRequestRef.current && target === targetRef.current) {
        finishLiveScan(target, match, canvas.toDataURL("image/jpeg", 0.92), canvas.width, canvas.height);
        return;
      }
      if (cameraActiveRef.current && request === cameraRequestRef.current) setCameraHint(`Still looking for the ${labelFor(target)}…`);
    } catch {
      if (cameraActiveRef.current && request === cameraRequestRef.current) setCameraHint("Could not read that view. Try more light or move closer.");
    } finally {
      readingFrameRef.current = false;
      if (cameraActiveRef.current && !previewOnlyRef.current) window.setTimeout(() => void readFrame(), 350);
    }
  }

  async function openCamera(target: ScanTarget, previewOnly = false) {
    if (cameraPending) return;
    if (!previewOnly && !denominations.includes(draftRef.current.denomination)) {
      setMessage("Choose a denomination before scanning a banknote.");
      return;
    }
    if (!previewOnly && !ocrRef.current) {
      setMessage(ocrStatus === "error" ? "Scanner preparation failed. Try preparing it again." : "Scanner is still preparing. Please wait a moment.");
      return;
    }
    targetRef.current = target;
    setScanTarget(target);
    setCameraHint(`Looking for the ${labelFor(target)}…`);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Live camera is unavailable here. Open the app at localhost and allow camera access in your browser settings, or enter the values manually.");
      return;
    }
    stopCamera();
    const request = ++cameraRequestRef.current;
    setCameraPending(true);
    previewOnlyRef.current = previewOnly;
    setCameraPreviewOnly(previewOnly);
    try {
      const preference = cameraPreferences[target];
      const deviceId = preference.deviceId;
      const constraints = (id: string): MediaStreamConstraints => ({ video: {
        ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 },
      }, audio: false });
      let stream: MediaStream;
      let fallback = false;
      try { stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId)); }
      catch (error) {
        if (!deviceId || !(error instanceof DOMException) || !["OverconstrainedError", "NotFoundError"].includes(error.name)) throw error;
        fallback = true;
        stream = await navigator.mediaDevices.getUserMedia(constraints(""));
      }
      if (request !== cameraRequestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      await refreshCameras();
      if (request !== cameraRequestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const activeLabel = stream.getVideoTracks()[0]?.label || "Camera";
      setCameraHint(`${activeLabel}. ${fallback ? "Saved camera unavailable; using the default. " : ""}${previewOnly ? "Check close-up focus. Preview closes after 15 seconds; no codes are saved." : `Centre the ${labelFor(target)} inside the guide.`}`);
      cameraActiveRef.current = true;
      setPreviewReady(false);
      setScanResult(null);
      setCameraOpen(true);
      setCameraSession((current) => current + 1);
      setIsScanning(true);
      setMessage("");
    } catch (error) {
      if (request !== cameraRequestRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMessage(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Camera access was blocked. Allow this site to use your camera in browser settings, then click Scan again."
        : "Could not start this camera. Close other camera apps or choose another camera in Settings, then click Scan again.");
    } finally {
      if (request === cameraRequestRef.current) setCameraPending(false);
    }
  }

  function useLocation() {
    if (isLocating) return;
    if (!window.isSecureContext) {
      setLocationMessage("Location needs HTTPS or localhost. Open the secure app address or enter your location manually.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser. Enter your city, country, and postcode manually.");
      return;
    }
    const original = draftRef.current;
    setIsLocating(true);
    setLocationMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setLocationMessage("Finding your city and postcode…");
        try {
          const location = await locateAddress(coords.latitude, coords.longitude);
          const current = draftRef.current;
          if (current.city !== original.city || current.country !== original.country || current.postalCode !== original.postalCode) {
            setLocationMessage("Your location fields changed during the lookup. Click Use my location again to replace them, or keep your edits.");
            return;
          }
          setDraft((draft) => ({ ...draft, ...location }));
          setLocationMessage("");
        } catch (error) {
          setLocationMessage(error instanceof Error && error.name !== "TypeError" && error.name !== "TimeoutError" ? error.message : "Could not look up your city and postcode. Check your connection and retry, or enter them manually.");
        } finally { setIsLocating(false); }
      },
      (error) => { setIsLocating(false); setLocationMessage(locationPermissionMessage(error.code)); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function addNote(keepLocationAndComment = false) {
    const currentDraft = draftRef.current;
    const errors: string[] = [];
    if (!denominations.includes(currentDraft.denomination)) errors.push("Denomination: choose a euro banknote value.");
    if (!clean(currentDraft.printerCode)) errors.push("Printer code: enter or scan the code.");
    else if (!isCodeValid(currentDraft.printerCode)) errors.push("Printer code: use 1 letter, 3 digits, 1 letter, and a final digit from 1 to 9 (for example, R001A1).");
    if (!clean(currentDraft.serial)) errors.push("Serial number: enter or scan the number.");
    else if (!/^(?:[A-Z]\d{11}|[A-Z]{2}\d{10})$/.test(clean(currentDraft.serial))) errors.push("Serial number: use 1 letter and 11 digits, or 2 letters and 10 digits.");
    else if (!isSerialValid(currentDraft.serial)) errors.push("Serial number: checksum failed. Check each letter and digit against the banknote.");
    if (!currentDraft.country.trim()) errors.push("Country: enter where you found the note.");
    if (!currentDraft.city.trim()) errors.push("City: enter where you found the note.");
    if (errors.length) {
      setMessage(errors.join(" "));
      return false;
    }
    const newNote: Note = { ...currentDraft, serial: clean(currentDraft.serial), printerCode: clean(currentDraft.printerCode), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setNotes((current) => [newNote, ...current]);
    const nextDraft = keepLocationAndComment ? { ...currentDraft, serial: "", printerCode: reusePrinterCode ? clean(currentDraft.printerCode) : "" } : { ...blankDraft(), denomination: currentDraft.denomination, country: currentDraft.country, city: currentDraft.city, postalCode: currentDraft.postalCode, printerCode: reusePrinterCode ? clean(currentDraft.printerCode) : "" };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setMessage(keepLocationAndComment ? "Added to your local queue. Scanning the next note…" : "Added to your local submission queue.");
    return true;
  }

  function removeNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
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
    setReceipts([]);
    setPassword("");
    setMessage("Signed out of EuroBillTracker on this device.");
  }

  async function submitQueue() {
    if (!account || isSubmitting || editingNote || notes.length === 0) return;
    const first = notes[0];
    const batch = notes.filter((note) => note.country === first.country && note.city === first.city && note.postalCode === first.postalCode).slice(0, 25);
    setIsSubmitting(true);
    setMessage(`Sending ${batch.length} note${batch.length === 1 ? "" : "s"} to EuroBillTracker…`);
    try {
      const response = await fetch("/api/ebt/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: batch }) });
      const data = await response.json() as { results?: Array<{ id: string; result: SubmissionResult | null }>; error?: string };
      if (!response.ok || !data.results) throw new Error(data.error || "EBT could not receive the notes.");
      setReceipts(batch.map((note) => ({ id: note.id, serial: note.serial, denomination: note.denomination, result: data.results!.find((item) => item.id === note.id)?.result ?? null })));
      const successful = data.results.filter(({ result }) => result && (Number(result.status) === 0 || Number(result.status) === 1));
      const hits = successful.filter(({ result }) => Number(result?.status) === 1).length;
      if (successful.length) setNotes((current) => current.filter((note) => !successful.some(({ id }) => id === note.id)));
      const failed = batch.length - successful.length;
      setMessage(`${successful.length} note${successful.length === 1 ? "" : "s"} submitted${hits ? `, including ${hits} hit${hits === 1 ? "" : "s"}` : ""}.${failed ? ` ${failed} stayed in the queue because EBT rejected it.` : ""}`);
      // Refresh totals independently; a failed refresh must never undo a submission.
      void fetch("/api/ebt/session", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null)
        .then((session) => { if (session?.account) setAccount(session.account); }).catch(() => undefined);
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

    {ocrStatus !== "ready" && <section className={`ocr-progress ${ocrStatus === "error" ? "ocr-progress-error" : ""}`} role="status" aria-live="polite">
      <div><strong>{ocrStatus === "error" ? "Scanner could not prepare" : "Preparing scanner"}</strong><span>{ocrStatus === "error" ? ocrError || "Check your connection, then try again." : "Loading on-device text recognition. Scanning will unlock when it is ready."}</span></div>
      {ocrStatus === "error" ? <button type="button" onClick={() => void getOcr().catch(() => undefined)}>Try again</button> : <i aria-hidden="true"><b /></i>}
    </section>}

      {cameraOpen && <div className="camera-sheet" role="dialog" aria-label="Scan banknote with camera">
        <div className="camera-toolbar">
          <div className="camera-context">
            <small>€{draft.denomination || "—"}{(scanResult?.target ?? scanTarget) === "serial" && draft.printerCode ? ` · ${draft.printerCode}` : ""}</small>
            <span>{scanResult ? `Valid ${labelFor(scanResult.target)} found` : `${cameraPreviewOnly ? "Camera preview for" : "Scanning"} ${labelFor(scanTarget)}`}</span>
          </div>
          <button onClick={stopCamera} aria-label="Close camera">×</button>
        </div>
        {scanResult ? <>
          <div className="camera-preview result-preview" style={{ aspectRatio: `${scanResult.width} / ${scanResult.height}` }}>
            <img src={scanResult.image} alt={`Captured ${scanResult.target}`} />
            {scanResult.boxes.map((box, index) => <i key={index} className="result-box" style={{ left: `${(box.x0 / scanResult.width) * 100}%`, top: `${(box.y0 / scanResult.height) * 100}%`, width: `${((box.x1 - box.x0) / scanResult.width) * 100}%`, height: `${((box.y1 - box.y0) / scanResult.height) * 100}%` }} />)}
          </div>
          <div className="scan-success"><span>{scanResult.target === "printerCode" ? "VALID EBT PRINTER CODE FORMAT" : "VALID EURO SERIAL CHECKSUM"}</span><strong>{scanResult.value}</strong><small className="ocr-confidence">OCR confidence: {scanResult.confidences.map((confidence) => `${Math.round(confidence * 100)}%`).join(" · ")}</small><small>{scanResult.target === "printerCode" ? "Printer code saved. Turn the note over for the serial number." : autoQueueNext ? "Serial checksum passed. This note will be queued and the next note will start." : "Serial checksum passed. Review the note before adding it to the queue."} Continuing in {resultSecondsRemaining}s.</small></div>
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

    {tab === "entry" && <section className="entry-panel">
      <div className="section-heading"><span>Where did you get it?</span><button onClick={useLocation} disabled={isLocating}>{isLocating ? "Finding location…" : "Use my location"}</button></div>
      {locationMessage && <p className="notice location-notice" role="status">{locationMessage}</p>}
      <EntryLocationFields key={account?.username || "signed-out"} signedIn={Boolean(account)} location={draft} comment={draft.comment} onChange={update} onChoose={(location) => setDraft((current) => ({ ...current, ...location }))} />

      <div className="note-card">
        <div className="denominations" aria-label="Choose a denomination">{denominations.map((value) => <button type="button" key={value} className={draft.denomination === value ? "chosen" : ""} onClick={() => chooseDenomination(value)} disabled={isScanning} aria-label={`Choose €${value}`}>€{value}</button>)}</div>
        {!denominationOk && <p className="denomination-hint">Choose a denomination to enable scanning.</p>}
        <div className="field-row">
          <div className="field-heading"><label htmlFor="printer-code">Printer code <BanknoteFlag serial={draft.serial} printerCode={draft.printerCode} /> <em>{draft.printerCode ? (codeOk ? "valid format" : "check format") : "step 1"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("printerCode")} disabled={!denominationOk || ocrStatus !== "ready" || isScanning || cameraPending}>Scan</button></div>
          <div className="printer-entry">
            <input id="printer-code" value={draft.printerCode} onChange={(e) => update("printerCode", e.target.value)} placeholder="R001A1" autoCapitalize="characters" />
            <label className="batch-toggle"><input type="checkbox" checked={reusePrinterCode} onChange={(event) => setReusePrinterCode(event.target.checked)} /><span>Use this printer code for multiple notes</span></label>
          </div>
        </div>
        <div className="field-row">
          <div className="field-heading"><label htmlFor="serial-number">Serial number <BanknoteFlag serial={draft.serial} /> <em>{draft.serial ? (serialOk ? "checksum passed" : "check checksum") : "step 2"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("serial")} disabled={!denominationOk || ocrStatus !== "ready" || isScanning || cameraPending}>Scan</button></div>
          <input id="serial-number" value={draft.serial} onChange={(e) => update("serial", e.target.value)} placeholder="S02896734778" autoCapitalize="characters" />
        </div>
      </div>
      <button className="save" onClick={() => addNote()}>Add note to queue <span>→</span></button>
      {message && <p className="notice" role="status">{message}</p>}
      <a className="location-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
    </section>}

    {tab === "queue" && <section className="queue-panel">
      {editingNote && <form className="queue-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!denominations.includes(editingNote.denomination) || !isSerialValid(editingNote.serial) || !isCodeValid(editingNote.printerCode) || !editingNote.city.trim() || !editingNote.country.trim() || !editingNote.postalCode.trim() || editingNote.comment.length > 500 || /[\r\n\x00-\x1F]/.test(editingNote.comment)) {
          setMessage("Check the serial checksum, printer code, denomination, city, country, postcode, and comment (up to 500 characters, one line).");
          return;
        }
        setNotes((current) => current.map((note) => note.id === editingNote.id ? { ...editingNote, serial: clean(editingNote.serial), printerCode: clean(editingNote.printerCode) } : note));
        setEditingNote(null);
        setMessage("Queued note updated. Submit again when ready.");
      }}><h2>Edit queued note</h2>{(["serial", "printerCode", "denomination", "country", "city", "postalCode", "comment"] as const).map((field) => <label key={field}>{({ serial: "Serial number", printerCode: "Printer code", denomination: "Denomination", country: "Country (English name)", city: "City", postalCode: "Postal code", comment: "Comment" })[field]}<input value={editingNote[field]} onChange={(event) => setEditingNote({ ...editingNote, [field]: event.target.value })} /></label>)}<div><button type="submit">Save changes</button><button type="button" onClick={() => setEditingNote(null)}>Cancel</button></div></form>}
      <SubmissionReceipts key={account?.username || "signed-out"} receipts={receipts} />
      <div className="queue-total"><div><span>{notes.length}</span><small>notes queued</small></div><div><span>€{total}</span><small>total value</small></div></div>
      {notes.length === 0 ? <div className="empty"><span>◌</span><h2>Your queue is clear</h2><p>Add a note and it will stay here, even if you close the app.</p></div> : <><div className="note-list">{notes.map((note) => <article key={note.id}><div className="queued-note"><strong>€{note.denomination}</strong><div className="queued-details"><span>Serial: <BanknoteFlag serial={note.serial} /> {note.serial}</span><span>Printer code: <BanknoteFlag serial={note.serial} printerCode={note.printerCode} /> {note.printerCode}</span><small>Country: {note.country} / City: {note.city}</small></div></div><div className="queue-actions"><button className="edit-note" disabled={isSubmitting} onClick={() => { setEditingNote({ ...note }); setMessage(""); }} aria-label={`Edit ${note.serial}`}>Edit</button><button disabled={isSubmitting} aria-label={`Remove ${note.serial}`} onClick={() => { removeNote(note.id); if (editingNote?.id === note.id) setEditingNote(null); }}>×</button></div></article>)}</div><p className="queue-footnote">EBT accepts up to 25 notes with the same location per submission. Notes from other locations remain queued.</p></>}
      {message && <p className="notice" role="status">{message}</p>}
      <div className="queue-submit">
      {notes.length > 0 && (account ? <button className="submit" onClick={submitQueue} disabled={isSubmitting || Boolean(editingNote)}>{isSubmitting ? "Submitting to EBT…" : `Submit queue (${Math.min(25, notes.filter((note) => note.country === notes[0].country && note.city === notes[0].city && note.postalCode === notes[0].postalCode).length)})`}</button> : <p className="notice">Sign in from Profile to submit this queue to EuroBillTracker.</p>)}
      </div>
    </section>}

    {tab === "profile" && <section className="profile-panel"><p className="eyebrow">PROFILE</p><h2>Your EuroBillTracker profile.</h2><p>Your account, tracking statistics, and maps.</p>{account && <section className="stats-card" aria-label="My EuroBillTracker statistics"><span>MY EBT STATS</span><strong>{account.username}</strong><div><p><b>{account.totalbills}</b><small>notes</small></p><p><b>{account.totalhits}</b><small>hits</small></p><p><b>{notesPerHit}</b><small>notes / hit</small></p></div><PersonalProfile key={account.username} onTotals={updateTotals} /></section>}{account ? <div className="account-card"><span>Signed in to EuroBillTracker</span><strong>{account.username}</strong><small>{account.totalbills} notes · {account.totalhits} hits</small><button onClick={logout}>Sign out</button></div> : <form className="login-form" onSubmit={login}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button type="submit" disabled={isLoggingIn}>{isLoggingIn ? "Signing in…" : "Sign in to EuroBillTracker"}</button><small>Your password is not stored in this app or browser storage.</small></form>}{message && <p className="notice" role="status">{message}</p>}</section>}

    {tab === "settings" && <section className="settings-panel"><p className="eyebrow">SETTINGS</p><h2>Your notes stay yours.</h2><p>Your queue and location stay in this browser. To submit notes, EBT Web sends your password directly to EuroBillTracker over HTTPS and never saves it.</p><p>Your settings are saved only in this browser on this device and are removed when you clear this site's data.</p><div className="scan-settings">
        <h3>Scanning cameras</h3>
        <small>First click Scan for cameras and allow camera access. Then select a camera separately for each code. Changing a selection never opens the camera.</small>
        <button type="button" className="camera-test" onClick={() => void discoverCameras()} disabled={cameraPending || cameraOpen}>{cameraPending ? "Opening camera…" : "Scan for cameras"}</button>
        {cameraListMessage && <small role="status">{cameraListMessage}</small>}
        {(["printerCode", "serial"] as const).map((target) => <fieldset className="camera-setting" key={target}>
          <legend>{target === "printerCode" ? "Printer code" : "Serial number"}</legend>
          <label className="camera-choice">Camera<select value={cameraPreferences[target].deviceId} onChange={(event) => updateCameraPreference(target, { deviceId: event.target.value })}>
            <option value="">Automatic rear camera</option>
            {cameraPreferences[target].deviceId && !cameras.some((camera) => camera.deviceId === cameraPreferences[target].deviceId) && <option value={cameraPreferences[target].deviceId}>Saved camera (scan to check availability)</option>}
            {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
          </select></label>
          <button type="button" className="camera-test" onClick={() => void openCamera(target, true)} disabled={cameraPending || cameraOpen}>Scan preview: {labelFor(target)}</button>
        </fieldset>)}
        <label>Show each scan result for <select value={resultDisplaySeconds} onChange={(event) => setResultDisplaySeconds(Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 1).map((seconds) => <option key={seconds} value={seconds}>{seconds}</option>)}</select> seconds</label><small>After a printer-code scan, the serial scan begins automatically.</small><small>Both scans require at least 70% OCR confidence. Format and serial checksum checks still apply.</small><label className="toggle-setting"><input type="checkbox" checked={autoQueueNext} onChange={(event) => setAutoQueueNext(event.target.checked)} /><span>Automatically add complete notes and scan the next one</span></label></div>{installPlatform && <div className="setting"><span>{installPlatform === "ios" ? "Install on iPhone or iPad" : "Install on Android"}</span><small>{installPlatform === "ios" ? "In Safari: Share → Add to Home Screen" : "In Chrome: menu (⋮) → Add to Home screen → Install"}</small></div>}<div className="setting"><span>Clear local queue</span><button onClick={() => { setNotes([]); setMessage("Local queue cleared."); }}>Clear</button></div>{message && <p className="notice" role="status">{message}</p>}</section>}

    <nav className="bottom-nav" aria-label="Main navigation">
      {(["entry", "queue", "profile", "settings"] as const).map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>
        <span aria-hidden="true">{item === "profile" ? <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg> : { entry: "+", queue: "\u2261", settings: "\u2699" }[item]}</span>
        {{ entry: "Entry", queue: "Queue", profile: "Profile", settings: "Settings" }[item]}{item === "queue" && notes.length > 0 && <b>{notes.length}</b>}
      </button>)}
    </nav>
  </main>;
}
