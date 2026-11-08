import { blankDraft, Draft, draftFields, isDraft, Note } from "./note-validation";

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const keys = { queue: "ebt-web-queue", draft: "ebt-web-draft", pending: "ebt-web-pending-submission" } as const;
const draftOnly = (draft: Draft): Draft => Object.fromEntries(draftFields.map((key) => [key, draft[key]])) as Draft;

export function readLocalState(storage: StorageAccess): { notes: Note[]; draft: Draft; pendingIds: string[]; error: string } {
  const result = { notes: [] as Note[], draft: blankDraft(), pendingIds: [] as string[], error: "" };
  try {
    const queue = storage.getItem(keys.queue);
    if (queue) {
      const parsed: unknown = JSON.parse(queue);
      if (!Array.isArray(parsed) || !parsed.every((note) => isDraft(note) && typeof (note as Note).id === "string" && typeof (note as Note).createdAt === "string")) throw new Error("Invalid queue");
      result.notes = parsed.map((note) => ({ ...draftOnly(note), id: note.id, createdAt: note.createdAt }));
    }
    const pending: unknown = JSON.parse(storage.getItem(keys.pending) || "[]");
    if (!Array.isArray(pending) || !pending.every((id) => typeof id === "string")) throw new Error("Invalid pending submission");
    result.pendingIds = pending;
    const draft = storage.getItem(keys.draft);
    if (draft) {
      const parsed: unknown = JSON.parse(draft);
      if (!isDraft(parsed)) throw new Error("Invalid draft");
      result.draft = draftOnly(parsed);
    } else {
      const legacy = storage.getItem("ebt-web-location");
      if (legacy) {
        const parsed = JSON.parse(legacy);
        for (const key of ["country", "city", "postalCode", "comment"] as const) if (typeof parsed?.[key] === "string") result.draft[key] = parsed[key];
      }
    }
  } catch {
    result.error = "Saved data could not be restored. Your existing browser data has been kept; saving is paused to avoid overwriting it. Export or recover it before clearing this site's data.";
  }
  return result;
}

export type LocalSnapshot = { notes: Note[]; draft: Draft };

export function writeLocalState(storage: StorageAccess, notes: Note[], draft: Draft, previous?: LocalSnapshot): string {
  try {
    if (previous) {
      const latest = readLocalState(storage);
      if (latest.error) return latest.error;
      const queueChanged = JSON.stringify(notes) !== JSON.stringify(previous.notes);
      if (queueChanged && JSON.stringify(latest.notes) !== JSON.stringify(previous.notes)) {
        return "The queue changed in another tab. Your saved notes have been kept. Reload before editing or submitting the queue again.";
      }
      if (queueChanged) storage.setItem(keys.queue, JSON.stringify(notes.map((note) => ({ ...draftOnly(note), id: note.id, createdAt: note.createdAt }))));
      const changes = draftFields.filter((key) => draft[key] !== previous.draft[key]);
      if (changes.length) {
        const merged = draftOnly(latest.draft);
        for (const key of changes) merged[key] = draft[key];
        storage.setItem(keys.draft, JSON.stringify(merged));
      }
      return "";
    }
    storage.setItem(keys.queue, JSON.stringify(notes.map((note) => ({ ...draftOnly(note), id: note.id, createdAt: note.createdAt }))));
    storage.setItem(keys.draft, JSON.stringify(draftOnly(draft)));
    return "";
  } catch {
    return "Your notes could not be saved in this browser. Keep this page open and free browser storage before continuing.";
  }
}

export function writePendingSubmission(storage: StorageAccess, ids: string[]): string {
  try { storage.setItem(keys.pending, JSON.stringify(ids)); return ""; }
  catch { return "Cannot save submission status in this browser. Keep this page open and free browser storage before retrying."; }
}
