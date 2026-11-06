import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { mutationError, readJsonObject } from "../request-security";
import { isDraft, noteErrors } from "../../../lib/note-validation";

export const runtime = "nodejs";

type SubmittedNote = { id: string; serial: string; printerCode: string; denomination: string; country: string; city: string; postalCode: string; comment: string };

function isNote(value: unknown): value is SubmittedNote {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!["id", "serial", "printerCode", "denomination", "country", "city", "postalCode", "comment"].every((key) => typeof candidate[key] === "string")) return false;
  const note = candidate as SubmittedNote;
  return isDraft(note) && noteErrors(note).length === 0 && note.id.length > 0 && note.id.length <= 100
    && /^[A-Z]\d{11}$|^[A-Z]{2}\d{10}$/.test(note.serial)
    && /^[A-Z]\d{3}[A-Z][1-9]$/.test(note.printerCode);
}

export async function POST(request: NextRequest) {
  const blocked = mutationError(request);
  if (blocked) return blocked;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return noStoreJson({ error: "Sign in to EBT before submitting notes." }, { status: 401 });

  let payload: { notes?: unknown };
  try {
    payload = await readJsonObject(request);
  } catch {
    return noStoreJson({ error: "The note queue could not be read." }, { status: 400 });
  }
  if (!Array.isArray(payload.notes) || payload.notes.length === 0 || payload.notes.length > 25 || !payload.notes.every(isNote)) {
    return noStoreJson({ error: "Each submitted note needs valid EBT fields. Submit no more than 25 at once." }, { status: 400 });
  }

  const notes = payload.notes;
  if (new Set(notes.map((note) => note.id)).size !== notes.length) return noStoreJson({ error: "Each queued note needs a unique ID." }, { status: 400 });
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
    if (result === false) return clearSession(noStoreJson({ error: "Your EBT session has expired. Sign in again." }, { status: 401 }));
    if (!result || typeof result !== "object") throw new Error("Unconfirmed insertion");
    return noStoreJson({ results: notes.map((note, index) => ({ id: note.id, result: (result as Record<string, unknown>)[`note${index}`] ?? null })) });
  } catch {
    return noStoreJson({ error: "Submission outcome unknown. EBT may have received the notes. Check your EBT entries before retrying to avoid duplicates. The notes remain in your browser queue.", outcome: "unknown" }, { status: 502 });
  }
}
