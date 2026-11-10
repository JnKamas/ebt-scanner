import type { ScanMatch, ScanTarget } from "./banknote-scan";
import type { Note } from "./note-validation";
import { cropScanPhoto } from "./scan-photo-crop";

export type ScanPhoto = ScanMatch & {
  id: string;
  target: ScanTarget;
  image: string;
  width: number;
  height: number;
  capturedAt: string;
  denomination: string;
  printerCode: string;
  cropVersion?: 1;
};

export type ScanNoteCard = Note & { printerPhotoId?: string; serialPhotoId?: string; submittedAt?: string };

// Keep images out of localStorage and the submission queue/API payload.
// Each capture has its own key, so simultaneous tabs cannot overwrite history.
async function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("ebt-scan-photos", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("photos")) {
        const store = request.result.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("captured", ["capturedAt", "id"]);
      }
      if (!request.result.objectStoreNames.contains("cards")) {
        const store = request.result.createObjectStore("cards", { keyPath: "id" });
        store.createIndex("created", ["createdAt", "id"]);
      }
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("Close other scanner tabs and retry.")); };
  });
}

async function changePhotos(change: (store: IDBObjectStore) => void, notify = true): Promise<void> {
  const db = await openPhotos();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("photos", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      change(transaction.objectStore("photos"));
    });
  } finally { db.close(); }
  if (notify) window.dispatchEvent(new Event("ebt-scan-photos-changed"));
}

async function codeCropOnly(photo: ScanPhoto): Promise<ScanPhoto> {
  if (photo.cropVersion === 1) return photo;
  if (!photo.image.startsWith("data:image/jpeg;base64,")) throw new Error("Invalid saved code image.");
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Saved code image could not be read."));
    img.src = photo.image;
  });
  return { ...photo, ...cropScanPhoto(image, photo.width, photo.height, photo) };
}

// Replace older preview captures when opened, preserving IDs used by banknote cards.
async function upgradePhoto(photo: ScanPhoto): Promise<ScanPhoto> {
  const cropped = await codeCropOnly(photo);
  if (cropped !== photo) await changePhotos((store) => {
    const request = store.get(photo.id);
    request.onsuccess = () => {
      // Do not recreate a photo deleted in another tab while decoding its image.
      if (request.result?.image === photo.image) store.put(cropped);
    };
  }, false);
  return cropped;
}

export function clearScanPhotos() {
  return changePhotoCards((transaction) => {
    transaction.objectStore("photos").clear();
    transaction.objectStore("cards").clear();
  });
}

async function changePhotoCards(change: (transaction: IDBTransaction) => void): Promise<void> {
  const db = await openPhotos();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["photos", "cards"], "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      change(transaction);
    });
  } finally { db.close(); }
  window.dispatchEvent(new Event("ebt-scan-photos-changed"));
}

export async function saveScanNoteCard(note: Note, photos: Partial<Record<ScanTarget, ScanPhoto>>) {
  const crops: Partial<Record<ScanTarget, ScanPhoto>> = {};
  for (const target of ["printerCode", "serial"] as const) if (photos[target]) crops[target] = await codeCropOnly(photos[target]);
  return changePhotoCards((transaction) => {
    for (const crop of Object.values(crops)) transaction.objectStore("photos").put(crop);
    const store = transaction.objectStore("cards");
    const request = store.get(note.id);
    request.onsuccess = () => {
      const previous = request.result as ScanNoteCard | undefined;
      store.put({ ...previous, ...note,
        printerPhotoId: crops.printerCode?.id ?? previous?.printerPhotoId,
        serialPhotoId: crops.serial?.id ?? previous?.serialPhotoId });
    };
  });
}

export function markScanNoteSubmitted(id: string) {
  return changePhotoCards((transaction) => {
    const store = transaction.objectStore("cards");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, submittedAt: new Date().toISOString() });
    };
  });
}

export async function readScanNoteCard(id: string): Promise<{ card?: ScanNoteCard; photos: Partial<Record<ScanTarget, ScanPhoto>> }> {
  const db = await openPhotos();
  try {
    const result = await new Promise<{ card?: ScanNoteCard; photos: Partial<Record<ScanTarget, ScanPhoto>> }>((resolve, reject) => {
      const transaction = db.transaction(["photos", "cards"], "readonly");
      let card: ScanNoteCard | undefined;
      const photos: Partial<Record<ScanTarget, ScanPhoto>> = {};
      const request = transaction.objectStore("cards").get(id);
      request.onsuccess = () => {
        card = request.result;
        for (const [target, photoId] of [["printerCode", card?.printerPhotoId], ["serial", card?.serialPhotoId]] as const) {
          if (!photoId) continue;
          const photo = transaction.objectStore("photos").get(photoId);
          photo.onsuccess = () => { if (photo.result?.image?.startsWith("data:image/jpeg;base64,")) photos[target] = photo.result; };
        }
      };
      transaction.oncomplete = () => resolve({ card, photos });
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    for (const target of ["printerCode", "serial"] as const) {
      if (result.photos[target]) result.photos[target] = await upgradePhoto(result.photos[target]);
    }
    return result;
  } finally { db.close(); }
}

export async function listScanNoteCards(search = "", before?: Pick<ScanNoteCard, "createdAt" | "id">): Promise<{ cards: ScanNoteCard[]; more: boolean }> {
  const db = await openPhotos();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("cards", "readonly");
      const range = before ? IDBKeyRange.upperBound([before.createdAt, before.id], true) : undefined;
      const request = transaction.objectStore("cards").index("created").openCursor(range, "prev");
      const cards: ScanNoteCard[] = [];
      const query = search.trim().toUpperCase();
      let more = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const card = cursor.value as ScanNoteCard;
        if (!query || card.serial.includes(query) || card.printerCode.includes(query)) {
          if (cards.length === 20) { more = true; return; }
          cards.push(card);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve({ cards, more });
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}


// Remove one banknote and its crops atomically, preserving crops reused by other notes.
export function deleteScanNoteCard(id: string) {
  return changePhotoCards((transaction) => {
    const cards = transaction.objectStore("cards");
    cards.delete(id);
    const used = new Set<string>();
    const request = cards.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (cursor.value.printerPhotoId) used.add(cursor.value.printerPhotoId);
        if (cursor.value.serialPhotoId) used.add(cursor.value.serialPhotoId);
        cursor.continue();
        return;
      }
      const photos = transaction.objectStore("photos").openCursor();
      photos.onsuccess = () => {
        const photo = photos.result;
        if (!photo) return;
        if (!used.has(String(photo.key))) photo.delete();
        photo.continue();
      };
    };
  });
}
