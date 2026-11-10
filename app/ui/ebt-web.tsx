"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppInformation from "./app-information";
import { EntryLocationFields, PersonalProfile, SubmissionReceipts } from "./ebt-account-tools";
import { EbtAccount, Receipt, SubmissionResult, submissionStatus } from "../lib/ebt";
import BanknoteFlag from "./banknote-flag";
import BanknotePhotoCard from "./banknote-photo-card";
import SavedScanPhotos from "./scan-photo-cards";
import { saveScanNoteCard, markScanNoteSubmitted, ScanPhoto } from "../lib/scan-photos";
import { cropScanPhoto } from "../lib/scan-photo-crop";
import { locateAddress, locationPermissionMessage } from "../lib/location";
import { findValidCode, minimumOcrConfidence, PaddleItem, ScanMatch, ScanTarget } from "../lib/banknote-scan";
import { submissionBatch } from "../lib/note-queue";
import { blankDraft, clean, denominations, isCodeValid, isSerialValid, noteErrors, Note } from "../lib/note-validation";
import { LocalSnapshot, readLocalState, writeLocalState, writePendingSubmission } from "../lib/local-state";

type Tab = "entry" | "queue" | "profile" | "settings";
type CameraPreference = { deviceId: string };
const defaultCameras = (): Record<ScanTarget, CameraPreference> => ({ printerCode: { deviceId: "" }, serial: { deviceId: "" } });
type FrozenScan = ScanMatch & { target: ScanTarget; image: string; width: number; height: number };
type PaddleEngine = { predict: (input: Blob, options?: Record<string, number>) => Promise<Array<{ items: PaddleItem[] }>>; dispose: () => Promise<void> };
type OcrStatus = "loading" | "ready" | "error";

export default function EbtScanner({ version }: { version: string }) {
  const [tab, setTab] = useState<Tab>("entry");
  const [logoutNeedsConfirmation, setLogoutNeedsConfirmation] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<"ios" | "android" | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const [notes, setNotes] = useState<Note[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const storageBlockedRef = useRef(false);
  const savedRef = useRef<LocalSnapshot>({ notes: [], draft: blankDraft() });
  const [uncertainIds, setUncertainIds] = useState<string[]>([]);
  const [account, setAccount] = useState<EbtAccount | null>(null);
  const [accountSessionKey, setAccountSessionKey] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const updateTotals = useCallback((totalbills: number, totalhits: number) => {
    setAccount((current) => current ? { ...current, totalbills, totalhits } : null);
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const accountRequestRef = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<Partial<Record<Tab, string>>>({});
  const message = messages[tab] || "";
  function setMessage(value: string) {
    // Async actions retain their originating tab, so scan results stay in Entry.
    setMessages((current) => ({ ...current, [tab]: value }));
  }
  function readPreference(key: string) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function writePreference(key: string, value: string) {
    try { window.localStorage.setItem(key, value); }
    catch { setStorageError("Browser storage is unavailable or full. Your latest changes could not be saved."); }
  }
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
  const [latestPhotos, setLatestPhotos] = useState<Partial<Record<ScanTarget, ScanPhoto>>>({});
  const [unsavedCards, setUnsavedCards] = useState<Array<{ note: Note; photos: Partial<Record<ScanTarget, ScanPhoto>>; submitted: boolean }>>([]);
  const pendingCardCropsRef = useRef<Record<string, Partial<Record<ScanTarget, ScanPhoto>>>>({});
  const photoWritesRef = useRef<Promise<void>>(Promise.resolve());
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
  const notesRef = useRef(notes);
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
    try {
      const saved = readLocalState(window.localStorage);
      savedRef.current = { notes: saved.notes, draft: saved.draft };
      setNotes(saved.notes);
      setUncertainIds(saved.pendingIds);
      setDraft(saved.draft);
      storageBlockedRef.current = Boolean(saved.error);
      setStorageError(saved.error);
    } catch {
      storageBlockedRef.current = true;
      setStorageError("Browser storage is unavailable. Your notes cannot be saved; keep this page open.");
    }
    setStorageReady(true);
    if ("serviceWorker" in navigator) {
      const retiredScript = new URL("/sw.js", window.location.origin).href;
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations.filter((registration) => [registration.active, registration.waiting, registration.installing].some((worker) => worker?.scriptURL === retiredScript))
          .map((registration) => registration.unregister())
      )).catch(() => undefined);
    }
    // Remove old app-shell caches without touching drafts, notes or other apps.
    void window.caches?.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ebt-web-")).map((key) => window.caches.delete(key)))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!storageReady || storageBlockedRef.current) return;
    void navigator.locks.request("ebt-web-local-state", () => {
      if (storageBlockedRef.current) return;
      // A newer local render or storage event can supersede a waiting save.
      if (notes !== notesRef.current || draft !== draftRef.current) return;
      try {
        const error = writeLocalState(window.localStorage, notes, draft, savedRef.current);
        if (error) storageBlockedRef.current = true;
        else savedRef.current = { notes, draft };
        setStorageError(error);
      } catch { setStorageError("Browser storage is unavailable. Your notes cannot be saved; keep this page open."); }
    });
  }, [notes, draft, storageReady]);

  useEffect(() => {
    function syncQueue(event: StorageEvent) {
      if (event.key === "ebt-web-sign-in-change") {
        accountRequestRef.current += 1;
        setAccount(null);
        setAccountSessionKey("");
        setReceipts([]);
        setMessages((current) => ({ ...current, queue: "Sign-in changed in another tab. Reload to review the current account before submitting.", profile: "Sign-in changed in another tab. Reload to see the current account." }));
        return;
      }
      if (event.key !== "ebt-web-queue" && event.key !== "ebt-web-pending-submission" && event.key !== null) return;
      const saved = readLocalState(window.localStorage);
      if (saved.error) { storageBlockedRef.current = true; setStorageError(saved.error); return; }
      setUncertainIds(saved.pendingIds);
      if (JSON.stringify(notesRef.current) === JSON.stringify(savedRef.current.notes)) {
        savedRef.current = { ...savedRef.current, notes: saved.notes };
        notesRef.current = saved.notes;
        setNotes(saved.notes);
        setEditingNote(null);
      }
    }
    window.addEventListener("storage", syncQueue);
    return () => window.removeEventListener("storage", syncQueue);
  }, []);

  useEffect(() => {
    draftRef.current = draft;
    notesRef.current = notes;
  }, [draft, notes]);

  useEffect(() => {
    const savedSeconds = Number(readPreference("ebt-web-result-display-seconds"));
    if (Number.isFinite(savedSeconds) && savedSeconds >= 1 && savedSeconds <= 15) setResultDisplaySeconds(savedSeconds);
    setAutoQueueNext(readPreference("ebt-web-auto-queue-next") === "true");
    setReusePrinterCode(readPreference("ebt-web-reuse-printer-code") === "true");
    try {
      const saved = JSON.parse(readPreference("ebt-web-cameras") || "null");
      if (saved) setCameraPreferences(Object.fromEntries((["printerCode", "serial"] as const).map((target) => [target, {
        deviceId: typeof saved[target]?.deviceId === "string" ? saved[target].deviceId : "",
      }])) as Record<ScanTarget, CameraPreference>);
    } catch { /* Ignore an invalid saved camera preference. */ }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    writePreference("ebt-web-cameras", JSON.stringify(cameraPreferences));
    writePreference("ebt-web-reuse-printer-code", String(reusePrinterCode));
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
    if (!preferencesReady) return;
    writePreference("ebt-web-result-display-seconds", String(resultDisplaySeconds));
  }, [resultDisplaySeconds, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    writePreference("ebt-web-auto-queue-next", String(autoQueueNext));
  }, [autoQueueNext, preferencesReady]);

  useEffect(() => {
    const request = accountRequestRef.current;
    void fetch("/api/ebt/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: { account?: EbtAccount | null; sessionKey?: string } | null) => {
        if (request === accountRequestRef.current) { setAccount(data?.account ?? null); setAccountSessionKey(data?.sessionKey ?? ""); }
      })
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
  const batch = useMemo(() => submissionBatch(notes), [notes]);
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
    let frameCallback: number | null = null;
    let framePoll: number | null = null;
    const deadline = (message: string) => {
      if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = window.setTimeout(() => {
        stopCamera();
        setMessage(message);
      }, 15000);
    };
    // Bound startup failures separately so loading never consumes live scan time.
    deadline("The camera preview could not start. Close other camera apps, check permissions, and retry or enter the code manually.");

    const revealPreview = () => {
      if (cancelled || !cameraActiveRef.current || video.srcObject !== stream) return;
      if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        waitForFrame();
        return;
      }
      setPreviewReady(true);
      deadline(previewOnlyRef.current
        ? "Camera preview finished. Your camera choice is saved; no note values were changed."
        : `No valid banknote ${labelFor(targetRef.current)} found in 15 seconds. Check camera permission, lighting and focus, then retry or enter the code manually.`);
      if (!previewOnlyRef.current) void readFrame();
    };
    const waitForFrame = () => {
      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === "function") frameCallback = video.requestVideoFrameCallback(revealPreview);
      else framePoll = window.setTimeout(revealPreview, 50);
    };
    const startPreview = async () => {
      try {
        await video.play();
        waitForFrame();
      } catch {
        if (!cancelled) setCameraHint("The webcam started, but its preview could not play. Try closing and scanning again.");
      }
    };

    video.srcObject = stream;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) void startPreview();
    else video.addEventListener("loadedmetadata", startPreview, { once: true });

    return () => {
      cancelled = true;
      if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback);
      if (framePoll !== null) window.clearTimeout(framePoll);
      video.removeEventListener("loadedmetadata", startPreview);
      video.srcObject = null;
    };
  }, [cameraOpen, cameraSession]);

  function releaseCamera() {
    cameraRequestRef.current += 1;
    setCameraPending(false);
    cameraActiveRef.current = false;
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    clearResultCountdown();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
    setPreviewReady(false);
    setScanResult(null);
  }

  function stopCamera() {
    releaseCamera();
    setCameraOpen(false);
  }

  function clearResultCountdown() {
    if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = null;
    if (resultCountdownRef.current) window.clearInterval(resultCountdownRef.current);
    resultCountdownRef.current = null;
    setResultSecondsRemaining(0);
  }

  async function getOcr() {
    if (!ocrRef.current) {
      setOcrStatus("loading");
      setOcrError("");
      if (!ocrLoadingRef.current) {
        ocrLoadingRef.current = import("../lib/ocr-client").then(({ createOcrWorker }) => createOcrWorker());
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

  function queuePhotoWrite(action: () => Promise<void>) {
    photoWritesRef.current = photoWritesRef.current.then(action);
  }

  async function storePhotoCard(note: Note, photos: Partial<Record<ScanTarget, ScanPhoto>>, submitted = false) {
    const pairedPhotos = { ...pendingCardCropsRef.current[note.id], ...photos };
    pendingCardCropsRef.current[note.id] = pairedPhotos;
    try {
      await saveScanNoteCard(note, pairedPhotos);
      if (submitted) await markScanNoteSubmitted(note.id);
      delete pendingCardCropsRef.current[note.id];
      setUnsavedCards((current) => current.filter((item) => item.note.id !== note.id));
    } catch {
      setUnsavedCards((current) => [...current.filter((item) => item.note.id !== note.id), { note, photos: pairedPhotos, submitted }]);
    }
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
    const photo: ScanPhoto = { ...match, target, image, width, height, cropVersion: 1, id: crypto.randomUUID(), capturedAt: new Date().toISOString(), denomination: draftRef.current.denomination, printerCode: draftRef.current.printerCode };
    setLatestPhotos((current) => ({ ...current, [target]: photo }));
    const finishAt = Date.now() + resultDisplaySeconds * 1000;
    setResultSecondsRemaining(resultDisplaySeconds);
    resultCountdownRef.current = window.setInterval(() => {
      setResultSecondsRemaining(Math.max(0, Math.ceil((finishAt - Date.now()) / 1000)));
    }, 200);
    resultTimeoutRef.current = window.setTimeout(() => advanceFromLiveResult(target), resultDisplaySeconds * 1000);
  }

  async function readFrame() {
    if (!cameraActiveRef.current || readingFrameRef.current) return;
    if (!videoRef.current?.videoWidth) {
      window.setTimeout(() => { if (cameraActiveRef.current) void readFrame(); }, 100);
      return;
    }
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
      const [result] = await ocr.predict(image, { textDetLimitSideLen: 1280, textRecScoreThresh: 0 });
      const match = findValidCode(result?.items ?? [], target);
      if (match && cameraActiveRef.current && request === cameraRequestRef.current && target === targetRef.current) {
        const crop = cropScanPhoto(canvas, canvas.width, canvas.height, match);
        finishLiveScan(target, crop, crop.image, crop.width, crop.height);
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
    releaseCamera();
    setCameraOpen(true);
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
      setCameraHint(`${activeLabel}. ${fallback ? "Saved camera unavailable; using the default. " : ""}${previewOnly ? "Check close-up focus. Recognition is off. Camera test closes after 15 seconds; no codes or photos are saved." : `Centre the ${labelFor(target)} inside the guide.`}`);
      cameraActiveRef.current = true;
      setPreviewReady(false);
      setScanResult(null);
      setCameraSession((current) => current + 1);
      setIsScanning(true);
      setMessage("");
    } catch (error) {
      if (request !== cameraRequestRef.current) return;
      stopCamera();
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
    const errors = noteErrors(currentDraft);
    if (errors.length) {
      setMessage(errors.join(" "));
      return false;
    }
    const newNote: Note = { ...currentDraft, serial: clean(currentDraft.serial), printerCode: clean(currentDraft.printerCode), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setNotes((current) => [newNote, ...current]);
    queuePhotoWrite(() => storePhotoCard(newNote, latestPhotos));
    setLatestPhotos((current) => reusePrinterCode && current.printerCode?.value === clean(currentDraft.printerCode) ? { printerCode: current.printerCode } : {});
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
    accountRequestRef.current += 1;
    setIsLoggingIn(true);
    setMessage("");
    try {
      const response = await fetch("/api/ebt/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, rememberMe }) });
      if (response.status === 429) throw new Error("Too many sign-in attempts from this connection. Wait up to 10 minutes, then try again.");
      const data = await response.json() as { account?: EbtAccount; sessionKey?: string; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error || "Could not sign in to EBT.");
      setAccount(data.account);
      setAccountSessionKey(data.sessionKey ?? "");
      writePreference("ebt-web-sign-in-change", crypto.randomUUID());
      setLogoutNeedsConfirmation(false);
      applyEbtDefaults(data.account);
      setEmail("");
      setPassword("");
      setRememberMe(false);
      setMessage(`Signed in to EuroBillTracker as ${data.account.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in to EBT.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout(localOnly = false) {
    if (isLoggingOut) return;
    accountRequestRef.current += 1;
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/ebt/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localOnly }) });
      if (!response.ok) throw new Error("Sign-out failed");
      const result = await response.json() as { upstreamInvalidated?: boolean; noSession?: boolean };
      setAccount(null);
      setAccountSessionKey("");
      writePreference("ebt-web-sign-in-change", crypto.randomUUID());
      setReceipts([]);
      setPassword("");
      setLogoutNeedsConfirmation(false);
      setMessage(result.noSession ? "No sign-in session remains on this device." : result.upstreamInvalidated === true
        ? "Signed out. EBT confirmed that this session is no longer valid."
        : "Signed out on this device only. EBT session invalidation was not confirmed. If you suspect account access, change your password through EBT and contact EBT about revoking sessions.");
    } catch {
      setLogoutNeedsConfirmation(true);
      setMessage("Could not sign out with confirmation from EBT. Your session may still be active. Retry Sign out, or choose Sign out on this device only; that removes the local cookie without confirming EBT invalidation.");
    } finally { setIsLoggingOut(false); }
  }

  function savePendingSubmission(ids: string[]) {
    let error: string;
    try { error = writePendingSubmission(window.localStorage, ids); }
    catch { error = "Browser storage is unavailable. Keep this page open and retry after freeing storage."; }
    if (error) { setStorageError(error); return false; }
    setUncertainIds(ids);
    return true;
  }

  async function submitQueue() {
    await navigator.locks.request("ebt-web-submission", { ifAvailable: true }, async (lock) => {
      if (lock) await submitLockedQueue();
      else setMessage("Another tab is submitting notes. Wait for it to finish before retrying.");
    });
  }

  async function submitLockedQueue() {
    if (!account || isSubmitting || editingNote || notes.length === 0 || uncertainIds.length > 0 || storageBlockedRef.current) return;
    const latest = readLocalState(window.localStorage);
    if (latest.error || latest.pendingIds.length || JSON.stringify(latest.notes) !== JSON.stringify(notes)) {
      setMessage("The saved queue or submission status changed in another tab. Reload and review it before submitting.");
      return;
    }
    if (!savePendingSubmission(batch.map((note) => note.id))) return;
    let outcomeUnknown = true;
    setIsSubmitting(true);
    setMessage(`Sending ${batch.length} note${batch.length === 1 ? "" : "s"} to EuroBillTracker…`);
    try {
      const response = await fetch("/api/ebt/notes", { method: "POST", headers: { "Content-Type": "application/json", "X-EBT-Session": accountSessionKey }, body: JSON.stringify({ notes: batch }) });
      const data = await response.json() as { results?: Array<{ id: string; result: SubmissionResult | null }>; error?: string; outcome?: string; code?: string };
      if (data.code === "session_changed" || response.status === 401) {
        accountRequestRef.current += 1;
        setAccount(null);
        setAccountSessionKey("");
        setReceipts([]);
      }
      if (!response.ok || !data.results) {
        outcomeUnknown = data.outcome === "unknown";
        throw new Error(data.error || "EBT did not confirm the submission. Check EBT before retrying.");
      }
      outcomeUnknown = data.results.length !== batch.length || data.results.some((item) => !item.result || submissionStatus(item.result.status) === null);
      setReceipts(batch.map((note) => ({ id: note.id, serial: note.serial, denomination: note.denomination, result: data.results!.find((item) => item.id === note.id)?.result ?? null })));
      const successful = data.results.filter(({ result }) => result && (submissionStatus(result.status) === 0 || submissionStatus(result.status) === 1));
      const hits = successful.filter(({ result }) => submissionStatus(result?.status) === 1).length;
      if (successful.length) {
        for (const result of successful) {
          const submittedNote = batch.find((note) => note.id === result.id);
          if (submittedNote) queuePhotoWrite(() => storePhotoCard(submittedNote, {}, true));
        }
        const remaining = notesRef.current.filter((note) => !successful.some(({ id }) => id === note.id));
        setNotes(remaining);
        // Save confirmed removals before clearing the pending marker. A reload
        // must never restore accepted notes as safe to send again.
        const saveError = await navigator.locks.request("ebt-web-local-state", () => {
          const error = writeLocalState(window.localStorage, remaining, draftRef.current, savedRef.current);
          if (!error) savedRef.current = { notes: remaining, draft: draftRef.current };
          return error;
        });
        if (saveError) { outcomeUnknown = true; setStorageError(saveError); }
      }
      const failed = batch.length - successful.length;
      setMessage(`${successful.length} note${successful.length === 1 ? "" : "s"} submitted${hits ? `, including ${hits} hit${hits === 1 ? "" : "s"}` : ""}.${failed ? ` ${failed} stayed in the queue. ${outcomeUnknown ? "EBT did not confirm every result; check EBT before retrying." : "EBT rejected it."}` : ""}`);
      // Refresh totals independently; a failed refresh must never undo a submission.
      const accountRequest = accountRequestRef.current;
      void fetch("/api/ebt/session", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null)
        .then((session) => {
          if (session?.account && accountRequest === accountRequestRef.current && (session.sessionKey ?? "") === accountSessionKey) setAccount(session.account);
        }).catch(() => undefined);
    } catch (error) {
      // A dropped browser response can follow a successful upstream insertion.
      setMessage(outcomeUnknown ? "Submission outcome unknown. EBT may have received the notes. Check EBT before retrying; notes remain queued." : error instanceof Error ? error.message : "Could not submit the notes.");
    } finally {
      if (!outcomeUnknown) savePendingSubmission([]);
      setIsSubmitting(false);
    }
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">€</span><span>EBT <b>Scanner</b></span></div>
      <AppInformation version={version} />
    </header>

    {storageError && <p className="notice" role="alert">{storageError}</p>}
    {ocrStatus !== "ready" && <section className={`ocr-progress ${ocrStatus === "error" ? "ocr-progress-error" : ""}`} role="status" aria-live="polite">
      <div><strong>{ocrStatus === "error" ? "Scanner could not prepare" : "Preparing scanner"}</strong><span>{ocrStatus === "error" ? ocrError || "Check your connection, then try again." : "Loading on-device text recognition. Scanning will unlock when it is ready."}</span></div>
      {ocrStatus === "error" ? <button type="button" onClick={() => void getOcr().catch(() => undefined)}>Try again</button> : <i aria-hidden="true"><b /></i>}
    </section>}

      {cameraOpen && <div className="camera-sheet" role="dialog" aria-label="Scan banknote with camera">
        <div className="camera-toolbar">
          <div className="camera-context">
            <small>€{draft.denomination || "—"}{(scanResult?.target ?? scanTarget) === "serial" && draft.printerCode ? ` · ${draft.printerCode}` : ""}</small>
            <span>{scanResult ? `Valid ${labelFor(scanResult.target)} found` : `${!previewReady ? "Preparing" : cameraPreviewOnly ? "Camera preview for" : "Scanning"} ${labelFor(scanTarget)}`}</span>
          </div>
          <button onClick={stopCamera} aria-label="Close camera">×</button>
        </div>
        {scanResult ? <>
          <div className="camera-preview result-preview" style={{ aspectRatio: `${scanResult.width} / ${scanResult.height}` }}>
            <img src={scanResult.image} alt={`Captured ${scanResult.target}`} />
            {scanResult.boxes.map((box, index) => <i key={index} className="result-box" style={{ left: `${(box.x0 / scanResult.width) * 100}%`, top: `${(box.y0 / scanResult.height) * 100}%`, width: `${((box.x1 - box.x0) / scanResult.width) * 100}%`, height: `${((box.y1 - box.y0) / scanResult.height) * 100}%` }} />)}
          </div>
          <div className="scan-success"><span>{scanResult.target === "printerCode" ? "VALID EBT PRINTER CODE FORMAT" : "VALID EURO SERIAL CHECKSUM"}</span><strong>{scanResult.value}</strong><small className="ocr-confidence">OCR confidence: {scanResult.confidences.map((confidence) => `${Math.round(confidence * 100)}%`).join(" · ")}</small><small>{scanResult.target === "printerCode" ? "Printer code saved. Turn the note over for the serial number." : autoQueueNext ? "Serial checksum passed. This note will be queued and the next note will start." : "Serial checksum passed. Review the note before adding it to the queue."} {resultSecondsRemaining > 0 ? `Continuing in ${resultSecondsRemaining}s.` : "Review at your pace, then continue."}</small></div>
          <div className="result-actions">{resultSecondsRemaining > 0 && <button className="redo-scan" onClick={clearResultCountdown}>Keep reviewing</button>}<button className="redo-scan" onClick={() => redoLiveScan(scanResult.target)}>Redo scan</button><button className="continue-scan" onClick={() => advanceFromLiveResult(scanResult.target)}>Continue now</button></div>
        </> : <>
          <div className="camera-preview" aria-busy={!previewReady}>
            <video ref={videoRef} autoPlay playsInline muted />
            <span className="live-label"><i /> LIVE CAMERA</span>
            {!previewReady && <div className="preview-loading" role="status"><span className="camera-spinner" aria-hidden="true" /><strong>Preparing camera...</strong><small>Your selected camera will appear when ready.</small></div>}
            <div ref={cameraFrameRef} className="camera-frame" aria-hidden="true" />
          </div>
          <p className="camera-hint">{previewReady && <i />} {previewReady ? cameraHint : cameraPending ? "Allow camera access if your browser asks." : "Getting the preview ready..."}</p>
        </>}
        {!cameraPreviewOnly && !scanResult && scanTarget === "serial" && latestPhotos.printerCode && <details className="previous-scan-photo" open><summary>Printer code photo: {latestPhotos.printerCode.value}</summary><img src={latestPhotos.printerCode.image} alt={`Printer code crop: ${latestPhotos.printerCode.value}`} /></details>}
      </div>}

    {unsavedCards.length > 0 && <p className="notice" role="alert">Banknote records could not be saved. Keep this page open and free browser storage. Your queue is separate. <button type="button" onClick={() => {
      unsavedCards.forEach(({ note, photos, submitted }) => queuePhotoWrite(() => storePhotoCard(note, photos, submitted)));
    }}>Retry saving banknotes</button></p>}
    {tab === "entry" && <section className="entry-panel">
      <div className="section-heading"><span>Where did you get it?</span><button onClick={useLocation} disabled={isLocating}>{isLocating ? "Finding location…" : "Use my location"}</button></div>
      {locationMessage && <p className="notice location-notice" role="status">{locationMessage}</p>}
      <EntryLocationFields key={account?.username || "signed-out"} signedIn={Boolean(account)} location={draft} comment={draft.comment} onChange={update} onChoose={(location) => setDraft((current) => ({ ...current, ...location }))} />

      <div className="note-card">
        <div className="denominations" aria-label="Choose a denomination">{denominations.map((value) => <button type="button" key={value} className={draft.denomination === value ? "chosen" : ""} onClick={() => chooseDenomination(value)} disabled={isScanning} aria-label={`Choose €${value}`}>€{value}</button>)}</div>
        {!denominationOk && <p className="denomination-hint">Choose a denomination to enable scanning.</p>}
        <div className={`field-row${draft.printerCode && !codeOk ? " field-invalid" : ""}`}>
          <div className="field-heading"><label htmlFor="printer-code">Printer code <BanknoteFlag serial={draft.serial} printerCode={draft.printerCode} /> <em>{draft.printerCode ? (codeOk ? "valid format" : "check format") : "step 1"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("printerCode")} disabled={!denominationOk || ocrStatus !== "ready" || isScanning || cameraPending}>Scan</button></div>
          <div className="printer-entry">
            <input id="printer-code" value={draft.printerCode} onChange={(e) => update("printerCode", e.target.value)} placeholder="R001A1" autoCapitalize="characters" aria-invalid={Boolean(draft.printerCode) && !codeOk} />
            <label className="batch-toggle"><input type="checkbox" checked={reusePrinterCode} onChange={(event) => setReusePrinterCode(event.target.checked)} /><span>Use this printer code for multiple notes</span></label>
          </div>
        </div>
        <div className={`field-row${draft.serial && !serialOk ? " field-invalid" : ""}`}>
          <div className="field-heading"><label htmlFor="serial-number">Serial number <BanknoteFlag serial={draft.serial} /> <em>{draft.serial ? (serialOk ? "checksum passed" : "check checksum") : "step 2"}</em></label><button type="button" className="field-scan" onClick={() => openCamera("serial")} disabled={!denominationOk || ocrStatus !== "ready" || isScanning || cameraPending}>Scan</button></div>
          <input id="serial-number" value={draft.serial} onChange={(e) => update("serial", e.target.value)} placeholder="S02896734778" autoCapitalize="characters" aria-invalid={Boolean(draft.serial) && !serialOk} />
        </div>
      </div>
      {Object.keys(latestPhotos).length > 0 && <section className="latest-scan-photos" aria-label="Current banknote"><h3>Current banknote</h3><p>Both code crops stay together. Add the banknote to the queue to save this record.</p><BanknotePhotoCard note={{ ...draft, id: "current-banknote", createdAt: (latestPhotos.serial ?? latestPhotos.printerCode)!.capturedAt }} photos={latestPhotos} status="Review before adding to queue" /></section>}
      <button className="save" onClick={() => addNote()} disabled={!storageReady}>Add note to queue <span>→</span></button>
      {message && <p className="notice" role="status">{message}</p>}
      <a className="location-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
    </section>}

    {tab === "queue" && <section className="queue-panel">
      {editingNote && <form className="queue-editor" onSubmit={(event) => {
        event.preventDefault();
        const errors = noteErrors(editingNote);
        if (errors.length) {
          setMessage(errors.join(" "));
          return;
        }
        setNotes((current) => current.map((note) => note.id === editingNote.id ? { ...editingNote, serial: clean(editingNote.serial), printerCode: clean(editingNote.printerCode) } : note));
        queuePhotoWrite(() => storePhotoCard({ ...editingNote, serial: clean(editingNote.serial), printerCode: clean(editingNote.printerCode) }, {}));
        setEditingNote(null);
        setMessage("Queued note updated. Submit again when ready.");
      }}><h2>Edit queued note</h2>{(["serial", "printerCode", "denomination", "country", "city", "postalCode", "comment"] as const).map((field) => <label key={field}>{({ serial: "Serial number", printerCode: "Printer code", denomination: "Denomination", country: "Country (English name)", city: "City", postalCode: "Postal code", comment: "Comment" })[field]}<input value={editingNote[field]} onChange={(event) => setEditingNote({ ...editingNote, [field]: event.target.value })} /></label>)}<div><button type="submit">Save changes</button><button type="button" onClick={() => setEditingNote(null)}>Cancel</button></div></form>}
      <SubmissionReceipts key={account?.username || "signed-out"} receipts={receipts} />
      <div className="queue-total"><div><span>{notes.length}</span><small>notes queued</small></div><div><span>€{total}</span><small>total value</small></div></div>
      {notes.length === 0 ? <div className="empty"><span>◌</span><h2>Your queue is clear</h2><p>Add a note and it will stay here, even if you close the app.</p></div> : <><div className="note-list">{notes.map((note, index) => <article key={note.id} className="banknote-queue-card"><p className="banknote-card-number">Banknote {index + 1}/{notes.length}</p><BanknotePhotoCard note={note} status={uncertainIds.includes(note.id) ? "Check EBT before retrying" : "Queued: not submitted"} /><div className="queue-actions"><button className="edit-note" disabled={isSubmitting} onClick={() => { setEditingNote({ ...note }); setMessage(""); }} aria-label={`Edit ${note.serial}`}>Edit</button><button disabled={isSubmitting} aria-label={`Remove ${note.serial}`} onClick={() => { removeNote(note.id); if (editingNote?.id === note.id) setEditingNote(null); }}>×</button></div></article>)}</div><p className="queue-footnote">EBT accepts up to 25 notes with the same location per submission. Notes from other locations remain queued.</p></>}
      {message && <p className="notice" role="status">{message}</p>}
      {uncertainIds.length > 0 && !isSubmitting && <p className="notice" role="alert">Submission outcome unknown. Check your EBT entries before retrying to avoid duplicates. <button type="button" onClick={() => savePendingSubmission([])}>I checked EBT; allow retry</button></p>}
      <SavedScanPhotos />
      <div className="queue-submit">
      {notes.length > 0 && (account ? <button className="submit" onClick={submitQueue} disabled={isSubmitting || Boolean(editingNote) || uncertainIds.length > 0}>{isSubmitting ? "Submitting to EBT…" : `Submit queue (${batch.length})`}</button> : <p className="notice">Sign in from Profile to submit this queue to EuroBillTracker.</p>)}
      </div>
    </section>}

    {tab === "profile" && <section className="profile-panel"><p className="eyebrow">PROFILE</p><h2>Your EuroBillTracker profile.</h2><p>Your account, tracking statistics, and maps.</p>{account && <section className="stats-card" aria-label="My EuroBillTracker statistics"><span>MY EBT STATS</span><strong>{account.username}</strong><div><p><b>{account.totalbills}</b><small>notes</small></p><p><b>{account.totalhits}</b><small>hits</small></p><p><b>{notesPerHit}</b><small>notes / hit</small></p></div><PersonalProfile key={account.username} onTotals={updateTotals} /></section>}{account ? <div className="account-card"><span>Signed in to EuroBillTracker</span><strong>{account.username}</strong><small>{account.totalbills} notes · {account.totalhits} hits</small><button onClick={() => void logout()} disabled={isLoggingOut}>{isLoggingOut ? "Signing out..." : "Sign out"}</button>{logoutNeedsConfirmation && <button type="button" onClick={() => void logout(true)} disabled={isLoggingOut}>Sign out on this device only</button>}</div> : <form className="login-form" onSubmit={login}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><label className="remember-me"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} aria-describedby="remember-me-help" /><span>Remember me for up to 30 days</span></label><small id="remember-me-help">Checking this stores a sign-in cookie on this device for up to 30 days. EBT may ask you to sign in sooner.</small><button type="submit" disabled={isLoggingIn}>{isLoggingIn ? "Signing in…" : "Sign in to EuroBillTracker"}</button><aside className="privacy-summary" aria-label="Sign-in privacy"><p>Sign-in sends your EBT email and password through the app server on Vercel to EBT over HTTPS. The app does not save your password. An EBT session cookie keeps you signed in.</p><Link href="/about" target="_blank" rel="noopener noreferrer">Who maintains this app, password handling &amp; source status</Link></aside></form>}{message && <p className="notice" role="status">{message}</p>}</section>}

    {tab === "settings" && <section className="settings-panel"><p className="eyebrow">SETTINGS</p><h2>Settings</h2><p>Settings are saved in this browser on this device and are not tied to your EuroBillTracker profile.</p><div className="scan-settings">
        <h3>Scanning cameras</h3><small>Camera tests check the view and focus only. For text recognition, use the Scan controls in Entry.</small>
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
          <button type="button" className="camera-test" onClick={() => void openCamera(target, true)} disabled={cameraPending || cameraOpen}>Test camera: {labelFor(target)} (no recognition)</button>
        </fieldset>)}
        <label>Show each scan result for <select value={resultDisplaySeconds} onChange={(event) => setResultDisplaySeconds(Number(event.target.value))}>{Array.from({ length: 15 }, (_, index) => index + 1).map((seconds) => <option key={seconds} value={seconds}>{seconds}</option>)}</select> seconds</label><small>After a printer-code scan, the serial scan begins automatically.</small><small>Both scans require at least {Math.round(minimumOcrConfidence * 100)}% OCR confidence. Format and serial checksum checks still apply.</small><label className="toggle-setting"><input type="checkbox" checked={autoQueueNext} onChange={(event) => setAutoQueueNext(event.target.checked)} /><span>Automatically add complete notes and scan the next one</span></label></div>{installPlatform && <div className="setting"><span>{installPlatform === "ios" ? "Install on iPhone or iPad" : "Install on Android"}</span><small>{installPlatform === "ios" ? "In Safari: Share → Add to Home Screen" : "In Chrome: menu (⋮) → Add to Home screen → Install"}</small></div>}<div className="setting"><span>Clear local queue</span><button disabled={notes.length === 0 || isSubmitting} onClick={() => { if (!window.confirm(`Clear all ${notes.length} queued note${notes.length === 1 ? "" : "s"} from this browser? This cannot be undone.`)) return; setNotes([]); setEditingNote(null); setMessage("Local queue cleared."); }}>Clear</button></div>{message && <p className="notice" role="status">{message}</p>}</section>}

    <nav className="bottom-nav" aria-label="Main navigation">
      {(["entry", "queue", "profile", "settings"] as const).map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>
        <span aria-hidden="true">{item === "profile" ? <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg> : { entry: "+", queue: "\u2261", settings: "\u2699" }[item]}</span>
        {{ entry: "Entry", queue: "Queue", profile: "Profile", settings: "Settings" }[item]}{item === "queue" && notes.length > 0 && <b>{notes.length}</b>}
      </button>)}
    </nav>
  </main>;
}
