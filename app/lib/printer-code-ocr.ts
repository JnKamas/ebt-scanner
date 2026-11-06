// Correct I/1/l confusion only where the printer-code structure fixes the type.
// This is for OCR output; manual entry must retain the ordinary format checks.
export function printerCodeFromOcr(text: string): string | undefined {
  const value = text.toUpperCase().replace(/\s/g, "");
  const exact = value.match(/^[A-Z]\d{3}[A-Z][1-9]$/);
  if (exact) return exact[0];

  if (!/[A-Z]/.test(value)) return undefined;
  for (const match of value.matchAll(/^[A-Z1][0-9IL]{3}[A-Z1][1-9IL]$/g)) {
    const corrected = [...match[0]].map((character, index) => {
      if (index === 0 || index === 4) return character === "1" ? "I" : character;
      return character === "I" || character === "L" ? "1" : character;
    }).join("");
    if (/^[A-Z]\d{3}[A-Z][1-9]$/.test(corrected)) return corrected;
  }
  return undefined;
}
