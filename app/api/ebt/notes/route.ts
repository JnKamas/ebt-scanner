import { NextRequest } from "next/server";
import { SESSION_COOKIE, clearSession, ebtRequest, noStoreJson } from "../shared";
import { mutationError, readJsonObject } from "../request-security";
import { Draft, isDraft, isSerialFormatValid, noteErrors, printerCodePattern } from "../../../lib/note-validation";
import { maxSubmissionBatch, sameLocation } from "../../../lib/note-queue";

export const runtime = "nodejs";

type SubmittedNote = Draft & { id: string };

function isNote(value: unknown): value is SubmittedNote {
  if (!isDraft(value)) return false;
  const note = value as SubmittedNote;
  return typeof note.id === "string" && note.id.length > 0 && note.id.length <= 100 && noteErrors(note).length === 0
    && isSerialFormatValid(note.serial) && printerCodePattern.test(note.printerCode);
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
  if (!Array.isArray(payload.notes) || payload.notes.length === 0 || payload.notes.length > maxSubmissionBatch || !payload.notes.every(isNote)) {
    return noStoreJson({ error: `Each submitted note needs valid EBT fields. Submit no more than ${maxSubmissionBatch} at once.` }, { status: 400 });
  }

  const notes = payload.notes;
  if (new Set(notes.map((note) => note.id)).size !== notes.length) return noStoreJson({ error: "Each queued note needs a unique ID." }, { status: 400 });
  const location = notes[0];
  if (!notes.every((note) => sameLocation(note, location))) {
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
