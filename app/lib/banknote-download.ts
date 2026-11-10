import type { Note } from "./note-validation";
import type { ScanPhoto } from "./scan-photos";
import type { ScanTarget } from "./banknote-scan";

// One download per banknote, containing both code crops and their reviewed values.
export async function downloadBanknote(note: Note, photos: Partial<Record<ScanTarget, ScanPhoto>>) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Banknote download could not be prepared.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 800, 220);
  context.fillStyle = "#102331";
  context.font = "bold 22px sans-serif";
  context.fillText(`€${note.denomination}`, 20, 30);
  for (const [index, target] of (["printerCode", "serial"] as const).entries()) {
    const x = 20 + index * 400;
    context.font = "14px sans-serif";
    context.fillText(target === "printerCode" ? "Printer code" : "Serial number", x, 60);
    context.font = "bold 22px monospace";
    context.fillText(note[target], x, 90);
    const photo = photos[target];
    if (!photo) { context.font = "14px sans-serif"; context.fillText("No captured crop", x, 140); continue; }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Banknote crop could not be read."));
      img.src = photo.image;
    });
    const scale = Math.min(360 / image.naturalWidth, 80 / image.naturalHeight);
    context.drawImage(image, x, 105, image.naturalWidth * scale, image.naturalHeight * scale);
    if (photo.value !== note[target]) { context.font = "12px sans-serif"; context.fillText(`Captured: ${photo.value}`, x, 210); }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Banknote download could not be prepared.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ebt-banknote-${note.serial || "draft"}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
