/* =====================================================================
   VERVE MEDIA VAULT — original local media without putting large bytes in
   localStorage. Previews stay in the project JSON; export/preview can use
   the original Blob from IndexedDB. This is deliberately browser-local:
   no upload and no API key are involved.
   ===================================================================== */

const DB_NAME = "verve_media_vault_v1";
const STORE_NAME = "assets";
const DB_VERSION = 1;

// A browser may have less quota than this. The guard prevents an accidental
// multi-gigabyte write; quota failures still fall back to the session preview.
export const MAX_MEDIA_ASSET_BYTES = 512 * 1024 * 1024;

export interface MediaVaultAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: number;
  touchedAt: number;
}

function browserReady(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function makeId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!browserReady()) return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putMediaAsset(file: Blob, name = "media", id = makeId()): Promise<string | null> {
  try {
    if (!file || !file.size || file.size > MAX_MEDIA_ASSET_BYTES) return null;
    const db = await openDb();
    if (!db) return null;
    const now = Date.now();
    const item: MediaVaultAsset = {
      id,
      name: String(name || "media").slice(0, 180),
      mime: String(file.type || "application/octet-stream"),
      size: file.size,
      blob: file,
      createdAt: now,
      touchedAt: now,
    };
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    try { db.close(); } catch {}
    // A failed transaction cannot be distinguished reliably from quota errors
    // on every browser, so verify the record before returning its id.
    const check = await getMediaAsset(id);
    return check ? id : null;
  } catch {
    return null;
  }
}

export async function getMediaAsset(id: string): Promise<Blob | null> {
  try {
    if (!id) return null;
    const db = await openDb();
    if (!db) return null;
    const item = await new Promise<MediaVaultAsset | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve((request.result as MediaVaultAsset | undefined) || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    try { db.close(); } catch {}
    return item?.blob && item.blob.size > 0 ? item.blob : null;
  } catch {
    return null;
  }
}

export async function deleteMediaAsset(id: string): Promise<void> {
  try {
    if (!id) return;
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    try { db.close(); } catch {}
  } catch {}
}
