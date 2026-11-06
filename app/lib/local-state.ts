import { blankDraft, Draft, isDraft, Note } from "./note-validation";

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const draftOnly = (draft: Draft): Draft => Object.fromEntries(Object.keys(blankDraft()).map((key) => [key, draft[key as keyof Draft]])) as Draft;

export function readLocalState(storage: StorageAccess): { notes: Note[]; draft: Draft; pendingIds: string[]; error: string } {
  const result = { notes: [] as Note[], draft: blankDraft(), pendingIds: [] as string[], error: "" };
  try {
    const queue = storage.getItem("ebt-web-queue");
    if (queue) {
      const parsed: unknown = JSON.parse(queue);
      if (!Array.isArray(parsed) || !parsed.every((note) => isDraft(note) && typeof (note as Note).id === "string" && typeof (note as Note).createdAt === "string")) throw new Error("Invalid queue");
      result.notes = parsed.map((note) => ({ ...draftOnly(note), id: note.id, createdAt: note.createdAt }));
    }
    const pending: unknown = JSON.parse(storage.getItem("ebt-web-pending-submission") || "[]");
    if (!Array.isArray(pending) || !pending.every((id) => typeof id === "string")) throw new Error("Invalid pending submission");
    result.pendingIds = pending;
    const draft = storage.getItem("ebt-web-draft");
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

export function writeLocalState(storage: StorageAccess, notes: Note[], draft: Draft): string {
  try {
    storage.setItem("ebt-web-queue", JSON.stringify(notes.map((note) => ({ ...draftOnly(note), id: note.id, createdAt: note.createdAt }))));
    storage.setItem("ebt-web-draft", JSON.stringify(draftOnly(draft)));
    return "";
  } catch {
    return "Your notes could not be saved in this browser. Keep this page open and free browser storage before continuing.";
  }
}
