import { clean, isSerialValid } from "./note-validation";
import { printerCodeFromOcr } from "./printer-code-ocr";

export type ScanTarget = "printerCode" | "serial";
export type ScanBox = { x0: number; y0: number; x1: number; y1: number };
export type ScanMatch = { value: string; boxes: ScanBox[]; confidences: number[] };
export type PaddleItem = { text: string; score: number; poly: Array<[number, number]> };
export const minimumOcrConfidence = 0.7;

function textBox({ poly }: PaddleItem): ScanBox {
  const x = poly.map(([pointX]) => pointX);
  const y = poly.map(([, pointY]) => pointY);
  return { x0: Math.min(...x), y0: Math.min(...y), x1: Math.max(...x), y1: Math.max(...y) };
}

export function findValidCode(items: PaddleItem[], target: ScanTarget): ScanMatch | null {
  const readable = items.filter((item) => item.score >= minimumOcrConfidence && item.poly.length > 0)
    .map((item) => ({ ...item, box: textBox(item) }));
  const matchFrom = (group: typeof readable): ScanMatch | null => {
    const text = group.map((item) => item.text).join("");
    const value = target === "printerCode" ? printerCodeFromOcr(text) : isSerialValid(text) ? clean(text) : undefined;
    return value ? { value, boxes: group.map((item) => item.box), confidences: group.map((item) => item.score) } : null;
  };
  for (const item of readable) {
    const match = matchFrom([item]);
    if (match) return match;
  }

  // Join nearby groups on the same baseline, retaining each original OCR box.
  const ordered = [...readable].sort((a, b) => {
    const aMidY = (a.box.y0 + a.box.y1) / 2;
    const bMidY = (b.box.y0 + b.box.y1) / 2;
    return Math.abs(aMidY - bMidY) > Math.max(a.box.y1 - a.box.y0, b.box.y1 - b.box.y0) ? aMidY - bMidY : a.box.x0 - b.box.x0;
  });
  for (let start = 0; start < ordered.length; start++) {
    const group = [ordered[start]];
    const firstBox = group[0].box;
    for (let end = start + 1; end < Math.min(start + 4, ordered.length); end++) {
      const previousBox = group[group.length - 1].box;
      const next = ordered[end];
      const nextBox = next.box;
      const sameLine = Math.abs(((previousBox.y0 + previousBox.y1) - (nextBox.y0 + nextBox.y1)) / 2) <= Math.max(previousBox.y1 - previousBox.y0, nextBox.y1 - nextBox.y0) * 1.5;
      const closeEnough = nextBox.x0 - previousBox.x1 <= Math.max(firstBox.x1 - firstBox.x0, 80) * 1.5;
      if (!sameLine || !closeEnough) break;
      group.push(next);
      const match = matchFrom(group);
      if (match) return match;
    }
  }
  return null;
}
