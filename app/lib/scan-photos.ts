import type { ScanMatch, ScanTarget } from "./banknote-scan";
import type { Note } from "./note-validation";

export type ScanPhoto = ScanMatch & {
  id: string;
  target: ScanTarget;
  image: string;
  width: number;
  height: number;
  capturedAt: string;
  denomination: string;
  printerCode: string;
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

async function changePhotos(change: (store: IDBObjectStore) => void): Promise<void> {
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
  window.dispatchEvent(new Event("ebt-scan-photos-changed"));
}

export function saveScanPhoto(photo: ScanPhoto) {
  return changePhotos((store) => { store.put(photo); });
}

export function deleteScanPhoto(id: string) {
  return changePhotos((store) => { store.delete(id); });
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

export function saveScanNoteCard(note: Note, photos: Partial<Record<ScanTarget, ScanPhoto>>) {
  return changePhotoCards((transaction) => {
    const store = transaction.objectStore("cards");
    const request = store.get(note.id);
    request.onsuccess = () => {
      const previous = request.result as ScanNoteCard | undefined;
      store.put({ ...previous, ...note,
        printerPhotoId: photos.printerCode?.id ?? previous?.printerPhotoId,
        serialPhotoId: photos.serial?.id ?? previous?.serialPhotoId });
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
    return await new Promise((resolve, reject) => {
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

export async function listScanPhotos(search = "", before?: Pick<ScanPhoto, "capturedAt" | "id">): Promise<{ photos: ScanPhoto[]; more: boolean }> {
  const db = await openPhotos();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("photos", "readonly");
      const range = before ? IDBKeyRange.upperBound([before.capturedAt, before.id], true) : undefined;
      const request = transaction.objectStore("photos").index("captured").openCursor(range, "prev");
      const photos: ScanPhoto[] = [];
      const query = search.trim().toUpperCase();
      let more = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const photo = cursor.value as ScanPhoto;
        if (photo.image.startsWith("data:image/jpeg;base64,") && (!query || photo.value.includes(query) || photo.printerCode.includes(query))) {
          if (photos.length === 20) { more = true; return; }
          photos.push(photo);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve({ photos, more });
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
