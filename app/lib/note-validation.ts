export const denominations = ["5", "10", "20", "50", "100", "200", "500"];
export const blankDraft = () => ({ serial: "", printerCode: "", denomination: "", country: "", city: "", postalCode: "", comment: "" });
export type Draft = ReturnType<typeof blankDraft>;
export const draftFields = Object.keys(blankDraft()) as (keyof Draft)[];
export type Note = Draft & { id: string; createdAt: string };
export const firstSeriesSerialPattern = /^[A-Z]\d{11}$/;
export const europaSerialPattern = /^[A-Z]{2}\d{10}$/;
export const printerCodePattern = /^[A-Z]\d{3}[A-Z][1-9]$/;

export function isSerialFormatValid(value: string) {
  return firstSeriesSerialPattern.test(value) || europaSerialPattern.test(value);
}

export function clean(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isSerialValid(serial: string) {
  const value = clean(serial);
  const digitSum = (digits: string) => [...digits].reduce((total, digit) => total + Number(digit), 0);
  if (firstSeriesSerialPattern.test(value)) return (value.charCodeAt(0) + digitSum(value.slice(1))) % 9 === 0;
  if (europaSerialPattern.test(value)) return (value.charCodeAt(0) - 64 + value.charCodeAt(1) - 64 + digitSum(value.slice(2))) % 9 === 7;
  return false;
}

export function isCodeValid(code: string) {
  return printerCodePattern.test(clean(code));
}

export function noteErrors(note: Draft): string[] {
  const errors: string[] = [];
  if (!denominations.includes(note.denomination)) errors.push("Denomination: choose a euro banknote value.");
  if (!clean(note.printerCode)) errors.push("Printer code: enter or scan the code.");
  else if (!isCodeValid(note.printerCode)) errors.push("Printer code: use 1 letter, 3 digits, 1 letter, and a final digit from 1 to 9 (for example, R001A1).");
  if (!clean(note.serial)) errors.push("Serial number: enter or scan the number.");
  else if (!isSerialFormatValid(clean(note.serial))) errors.push("Serial number: use 1 letter and 11 digits, or 2 letters and 10 digits.");
  else if (!isSerialValid(note.serial)) errors.push("Serial number: checksum failed. Check each letter and digit against the banknote.");
  for (const [field, label, max] of [["country", "Country", 100], ["city", "City", 100], ["postalCode", "Postal code", 50]] as const) {
    if (field !== "postalCode" && !note[field].trim()) errors.push(`${label}: enter where you found the note.`);
    if (note[field].length > max || /[\x00-\x1F\x7F]/.test(note[field])) errors.push(`${label}: use at most ${max} characters on one line.`);
  }
  if (note.comment.length > 500 || /[\x00-\x1F\x7F]/.test(note.comment)) errors.push("Comment: use at most 500 characters on one line.");
  return errors;
}

export function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return draftFields.every((key) => typeof (value as Record<string, unknown>)[key] === "string");
}
