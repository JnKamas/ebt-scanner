import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";

export const runtime = "nodejs";

type SubmittedNote = { id: string; serial: string; printerCode: string; denomination: string; country: string; city: string; postalCode: string; comment: string };

function isNote(value: unknown): value is SubmittedNote {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!["id", "serial", "printerCode", "denomination", "country", "city", "postalCode", "comment"].every((key) => typeof candidate[key] === "string")) return false;
  const note = candidate as SubmittedNote;
  return /^[A-Z]\d{11}$|^[A-Z]{2}\d{10}$/.test(note.serial)
    && /^[A-Z]\d{3}[A-Z][1-9]$/.test(note.printerCode)
    && /^(5|10|20|50|100|200|500)$/.test(note.denomination)
    && note.country.length > 0 && note.country.length <= 100
    && note.city.length > 0 && note.city.length <= 100
    && note.postalCode.length <= 50 && note.comment.length <= 500 && !/[\r\n\x00-\x1F]/.test(note.comment);
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ error: "Sign in to EBT before submitting notes." }, { status: 401 });

  let payload: { notes?: unknown };
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ error: "The note queue could not be read." }, { status: 400 });
  }
  if (!Array.isArray(payload.notes) || payload.notes.length === 0 || payload.notes.length > 25 || !payload.notes.every(isNote)) {
    return noStoreJson({ error: "Each submitted note needs valid EBT fields. Submit no more than 25 at once." }, { status: 400 });
  }

  const notes = payload.notes;
  const location = notes[0];
  if (!notes.every((note) => note.city === location.city && note.country === location.country && note.postalCode === location.postalCode)) {
    return noStoreJson({ error: "EBT accepts one location per batch. Submit notes from each location separately." }, { status: 400 });
  }

  const parameters: Record<string, string> = { m: "insertbills", v: "1", PHPSESSID: session, city: location.city, zip: location.postalCode, country: location.country };
  notes.forEach((note, index) => {
    parameters[`denomination${index}`] = note.denomination;
    parameters[`serial${index}`] = note.serial;
    parameters[`shortcode${index}`] = note.printerCode;
    if (note.comment) parameters[`comment${index}`] = note.comment;
  });

  try {
    const result = await ebtRequest(parameters);
    if (!result || typeof result !== "object") return clearSession(noStoreJson({ error: "Your EBT session has expired. Sign in again." }, { status: 401 }));
    return noStoreJson({ results: notes.map((note, index) => ({ id: note.id, result: (result as Record<string, unknown>)[`note${index}`] ?? null })) });
  } catch {
    return noStoreJson({ error: "EBT could not receive the notes. They are still safely in this browser queue." }, { status: 502 });
  }
}
