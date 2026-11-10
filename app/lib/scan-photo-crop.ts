import type { ScanBox, ScanMatch } from "./banknote-scan";

export function photoCropBounds(width: number, height: number, boxes: ScanBox[]) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !boxes.length
    || boxes.some((box) => ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0)) {
    throw new Error("No readable code box to save.");
  }
  const x = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x0))) - 2);
  const y = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y0))) - 2);
  const right = Math.min(width, Math.ceil(Math.max(...boxes.map((box) => box.x1))) + 2);
  const bottom = Math.min(height, Math.ceil(Math.max(...boxes.map((box) => box.y1))) + 2);
  if (right <= x || bottom <= y) throw new Error("Code box is outside the captured image.");
  return { x, y, width: right - x, height: bottom - y };
}

export function cropScanPhoto(source: CanvasImageSource, width: number, height: number, match: ScanMatch) {
  const crop = photoCropBounds(width, height, match.boxes);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Code crop could not be prepared.");
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return {
    ...match, width: crop.width, height: crop.height, image: canvas.toDataURL("image/jpeg", 0.9), cropVersion: 1 as const,
    boxes: match.boxes.map((box) => ({ x0: Math.max(0, box.x0 - crop.x), y0: Math.max(0, box.y0 - crop.y), x1: Math.min(crop.width, box.x1 - crop.x), y1: Math.min(crop.height, box.y1 - crop.y) })),
  };
}
