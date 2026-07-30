/* 🗄️ VERVE GUARD · DRAFT INDEXEDDB MIRROR
   Mirror draft ke IndexedDB sebagai cadangan lokal kuat. localStorage tetap jalur utama dulu.
   Tujuan fase ini: anti-hilang/anti-localStorage penuh, tanpa migrasi total yang berisiko. */

export const DRAFT_IDB_NAME = "verve_draft_mirror_v1";
export const DRAFT_IDB_STORE = "drafts";
export const DRAFT_IDB_MAX = 40;

export type DraftMirrorMeta = { id: string; title: string; slides: number; updatedAt: number; thumb?: string; mirror?: true };

type DraftDB = IDBDatabase;

function isBrowserIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

export function draftMeta(d: any): DraftMirrorMeta | null {
  if (!d || typeof d !== "object" || !d.id) return null;
  return {
    id: String(d.id),
    title: String(d.title || "Draft"),
    slides: Array.isArray(d.slides) ? d.slides.length : 0,
    updatedAt: Number(d.updatedAt || 0),
    thumb: d.thumb || d.coverThumb || "",
    mirror: true,
  };
}

export function mergeDraftMetas(local: DraftMirrorMeta[], mirror: DraftMirrorMeta[]): DraftMirrorMeta[] {
  const map = new Map<string, DraftMirrorMeta>();
  for (const d of [...mirror, ...local]) {
    if (!d?.id) continue;
    const old = map.get(d.id);
    if (!old || (Number(d.updatedAt) || 0) >= (Number(old.updatedAt) || 0)) map.set(d.id, d);
  }
  return [...map.values()].sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

export function openDraftMirrorDB(): Promise<DraftDB> {
  return new Promise((resolve, reject) => {
    if (!isBrowserIDB()) return reject(new Error("IndexedDB tidak tersedia"));
    const req = indexedDB.open(DRAFT_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_IDB_STORE)) {
        const st = db.createObjectStore(DRAFT_IDB_STORE, { keyPath: "id" });
        st.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onerror = () => reject(req.error || new Error("gagal buka draft mirror"));
    req.onsuccess = () => resolve(req.result);
  });
}

async function txDone(tx: IDBTransaction): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction error"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction abort"));
  });
}

export async function mirrorDraft(draft: any): Promise<void> {
  const meta = draftMeta(draft);
  if (!meta) return;
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    tx.objectStore(DRAFT_IDB_STORE).put({ ...draft, _mirrorMeta: meta, _mirroredAt: Date.now() });
    await txDone(tx);
    await trimDraftMirror(DRAFT_IDB_MAX);
  } finally { try { db.close(); } catch {} }
}

export async function mirrorDrafts(drafts: any[]): Promise<void> {
  if (!Array.isArray(drafts) || !drafts.length) return;
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    const st = tx.objectStore(DRAFT_IDB_STORE);
    for (const d of drafts) {
      const meta = draftMeta(d);
      if (meta) st.put({ ...d, _mirrorMeta: meta, _mirroredAt: Date.now() });
    }
    await txDone(tx);
    await trimDraftMirror(DRAFT_IDB_MAX);
  } finally { try { db.close(); } catch {} }
}

export async function readDraftMirror(id: string): Promise<any | null> {
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readonly");
    const req = tx.objectStore(DRAFT_IDB_STORE).get(id);
    const val = await new Promise<any>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("gagal baca draft mirror"));
    });
    return val;
  } finally { try { db.close(); } catch {} }
}

export async function listDraftMirrorMetas(limit = DRAFT_IDB_MAX): Promise<DraftMirrorMeta[]> {
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readonly");
    const st = tx.objectStore(DRAFT_IDB_STORE);
    const req = st.getAll();
    const arr = await new Promise<any[]>((resolve, reject) => {
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("gagal list draft mirror"));
    });
    return arr.map(draftMeta).filter(Boolean).sort((a, b) => b!.updatedAt - a!.updatedAt).slice(0, limit) as DraftMirrorMeta[];
  } finally { try { db.close(); } catch {} }
}

export async function deleteDraftMirror(id: string): Promise<void> {
  if (!id) return;
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    tx.objectStore(DRAFT_IDB_STORE).delete(id);
    await txDone(tx);
  } finally { try { db.close(); } catch {} }
}

export async function clearDraftMirror(): Promise<void> {
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    tx.objectStore(DRAFT_IDB_STORE).clear();
    await txDone(tx);
  } finally { try { db.close(); } catch {} }
}

export async function trimDraftMirror(max = DRAFT_IDB_MAX): Promise<void> {
  const metas = await listDraftMirrorMetas(Math.max(max + 20, max));
  const extra = metas.slice(max);
  if (!extra.length) return;
  const db = await openDraftMirrorDB();
  try {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    const st = tx.objectStore(DRAFT_IDB_STORE);
    for (const m of extra) st.delete(m.id);
    await txDone(tx);
  } finally { try { db.close(); } catch {} }
}
