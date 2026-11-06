import type { Note } from "./note-validation";

export const maxSubmissionBatch = 25;
type NoteLocation = Pick<Note, "city" | "country" | "postalCode">;

export function sameLocation(a: NoteLocation, b: NoteLocation) {
  return a.city === b.city && a.country === b.country && a.postalCode === b.postalCode;
}

export function submissionBatch(notes: Note[]): Note[] {
  const first = notes[0];
  return first ? notes.filter((note) => sameLocation(note, first)).slice(0, maxSubmissionBatch) : [];
}
