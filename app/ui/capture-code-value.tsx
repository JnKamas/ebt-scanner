"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ScanBox } from "../lib/banknote-scan";

// Use the crop's coordinate system so the code and photographed characters
// keep the same visible bounds at every screen size.
export default function CaptureCodeValue({ value, width, height, boxes }: { value: string; width: number; height: number; boxes: ScanBox[] }) {
  const textRef = useRef<SVGTextElement>(null);
  const [transform, setTransform] = useState<string>();
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text || !boxes.length) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    context.font = getComputedStyle(text).font;
    const metrics = context.measureText(value);
    const bounds = { x: -metrics.actualBoundingBoxLeft, y: -metrics.actualBoundingBoxAscent, width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
    const left = Math.min(...boxes.map((box) => box.x0));
    const top = Math.min(...boxes.map((box) => box.y0));
    const codeWidth = Math.max(...boxes.map((box) => box.x1)) - left;
    const codeHeight = Math.max(...boxes.map((box) => box.y1)) - top;
    if (bounds.width <= 0 || bounds.height <= 0 || codeWidth <= 0 || codeHeight <= 0) return;
    setTransform(`translate(${left} ${top}) scale(${codeWidth / bounds.width} ${codeHeight / bounds.height}) translate(${-bounds.x} ${-bounds.y})`);
  }, [value, boxes]);

  return <svg className="capture-code-value" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={value}>
    <text ref={textRef} transform={transform} visibility={transform ? "visible" : "hidden"} fontFamily="monospace" fontSize="20" fill="currentColor">{value}</text>
  </svg>;
}
