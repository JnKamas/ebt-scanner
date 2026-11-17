// Correct OCR lookalikes only where the printer-code structure fixes the type.
// This is for OCR output; manual entry must retain the ordinary format checks.
import { printerCodePattern } from "./note-validation";

export function printerCodeFromOcr(text: string): string | undefined {
  const value = text.toUpperCase().replace(/\s/g, "");
  if (printerCodePattern.test(value)) return value;

  if (!/[A-Z]/.test(value)) return undefined;
  for (const match of value.matchAll(/^[A-Z1][0-9ILOS]{3}[A-Z1][1-9ILS]$/g)) {
    const corrected = [...match[0]].map((character, index) => {
      if (index === 0 || index === 4) return character === "1" ? "I" : character;
      if (character === "O") return "0";
      if (character === "S") return "5";
      return character === "I" || character === "L" ? "1" : character;
    }).join("");
    if (printerCodePattern.test(corrected)) return corrected;
  }
  return undefined;
}
