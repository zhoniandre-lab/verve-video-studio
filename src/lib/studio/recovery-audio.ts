/* 🛡️ Local recovery store for the active Spectrum audio.
 * IndexedDB is used instead of localStorage because a generated/mixed audio
 * file can be tens of megabytes. Failure to open IDB is intentionally silent:
 * the editor must never crash just because backup storage is unavailable. */

const DB_NAME = "verve-spectrum-recovery-v1";
const STORE = "audio";
const AUDIO_ID = "current";
const MAX_RECOVERY_BYTES = 90 * 1024 * 1024;

type StoredAudio = { id: string; blob: Blob; name: string; savedAt: number };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        try { request.result.createObjectStore(STORE, { keyPath: "id" }); } catch { /* store sudah ada */ }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function saveRecoveryAudio(raw: ArrayBuffer, contentType: string, name: string): Promise<boolean> {
  if (!raw?.byteLength || raw.byteLength > MAX_RECOVERY_BYTES) return false;
  // Buat Blob sebelum menunggu IndexedDB supaya decodeAudioData tidak dapat
  // membuat ArrayBuffer yang sedang disimpan menjadi detached.
  const blob = new Blob([raw], { type: contentType || "audio/mpeg" });
  const db = await openDb();
  if (!db) return false;
  return await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: AUDIO_ID, blob, name: name || "Audio Spectrum", savedAt: Date.now() } satisfies StoredAudio);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    } catch { db.close(); resolve(false); }
  });
}

export async function loadRecoveryAudio(): Promise<{ blob: Blob; name: string; savedAt: number } | null> {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(AUDIO_ID);
      request.onsuccess = () => {
        db.close();
        const value = request.result as StoredAudio | undefined;
        resolve(value?.blob ? { blob: value.blob, name: value.name || "Audio Spectrum", savedAt: value.savedAt || 0 } : null);
      };
      request.onerror = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
}

export async function clearRecoveryAudio(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(AUDIO_ID);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
    } catch { db.close(); resolve(); }
  });
}
