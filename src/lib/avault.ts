/* ============================================================
   🛟 v13.7.1 BRANKAS LAGU (100% kode orisinal VERVE)
   Link lagu AI (Suno/kie/aimusic) umurnya Cuma hitungan JAM —
   habis itu sumbernya balikin 403/HTML → render gagal "corrupt/CORS".
   Brankas ini menyimpan SALINAN byte audio (MP3/WAV, kecil) ke
   IndexedDB saat link masih segar, jadi render berikutnya kebal
   walau link asalnya sudah mati. Pola sama seperti 📼 Brankas Render.
   ============================================================ */

const DB = "verve_audio_vault";
const STORE = "audio";
const MAX_ITEMS = 6; // lagu ~3–6 MB per item → total tetap ramah HP

export interface AvItem { id: string; at: number; size: number; mime: string; buf: ArrayBuffer; }

/** Kunci kanonik: URL proxy GERBANG dinormalkan balik ke URL asalnya (hindari entri kembar). */
export function avKey(url: string): string {
  try {
    const m = url.match(/^\/?api\/hcnsec\/proxy-audio\?url=(.+)$/);
    if (m) { const inner = decodeURIComponent(m[1]); if (/^https?:/i.test(inner)) return inner; }
  } catch {}
  return url;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: "id" }); } catch {} };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
}

export async function avGet(url: string): Promise<ArrayBuffer | null> {
  try {
    if (!/^https?:/i.test(url)) return null;
    const id = avKey(url);
    const db = await openDb(); if (!db) return null;
    return await new Promise((res) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const rq = tx.objectStore(STORE).get(id);
        rq.onsuccess = () => { const it = rq.result as AvItem | undefined; res(it?.buf && it.buf.byteLength > 1000 ? it.buf : null); };
        rq.onerror = () => res(null);
      } catch { res(null); }
    });
  } catch { return null; }
}

export async function avDel(url: string): Promise<void> {
  try {
    const db = await openDb(); if (!db) return;
    await new Promise<void>((res) => {
      try { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(avKey(url)); tx.oncomplete = () => res(); tx.onerror = () => res(); }
      catch { res(); }
    });
  } catch {}
}

/** Simpan byte audio (guard: 50KB–300MB, jaga maks MAX_ITEMS entri terbaru, kuota penuh → diam). */
export async function avPut(url: string, buf: ArrayBuffer, mime = ""): Promise<void> {
  try {
    if (!/^https?:/i.test(url)) return; // data:/blob: sudah lokal dari sananya, tak perlu diamankan
    if (!buf || buf.byteLength < 50_000 || buf.byteLength > 300_000_000) return;
    const db = await openDb(); if (!db) return;
    const item: AvItem = { id: avKey(url), at: Date.now(), size: buf.byteLength, mime, buf };
    await new Promise<void>((res) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(item);
        tx.oncomplete = () => res();
        tx.onerror = () => res(); // kuota penuh → biarkan, render tetap jalan
      } catch { res(); }
    });
    // pangkas entri lama
    try {
      await new Promise<void>((res) => {
        try {
          const tx = db.transaction(STORE, "readwrite");
          const all = tx.objectStore(STORE).getAll();
          all.onsuccess = () => {
            try {
              const items = (all.result as AvItem[]).sort((a, b) => b.at - a.at);
              items.slice(MAX_ITEMS).forEach((it) => { try { tx.objectStore(STORE).delete(it.id); } catch {} });
            } catch {}
            res();
          };
          all.onerror = () => res();
        } catch { res(); }
      });
    } catch {}
  } catch {}
}

/**
 * Hangatkan brankas SEKARANG selagi link masih segar: fetch (disk-cache dulu,
 * proxy GERBANG → langsung) lalu simpan. Fire-and-forget; gagal pun diam.
 */
export async function avWarm(url: string): Promise<void> {
  try {
    if (!/^https?:/i.test(url)) return;
    if (await avGet(url)) return; // sudah aman
    const cands = [`/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`, url];
    for (const u of cands) {
      try {
        const r = await fetch(u, { cache: "force-cache" });
        if (!r.ok) continue;
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 50_000) { await avPut(url, buf, r.headers.get("content-type") || ""); return; }
      } catch {}
    }
  } catch {}
}
