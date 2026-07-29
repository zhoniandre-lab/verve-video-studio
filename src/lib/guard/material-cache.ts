/* 🧺 VERVE GUARD · MATERIAL CACHE
   Cache ringan hasil pencarian gudang video di HP, ala MoneyPrinter material cache.
   Tujuan: query yang sama tidak membakar request/koneksi lagi saat user bolak-balik ganti adegan. */

export type MaterialCacheEntry<T> = {
  key: string;
  at: number;
  ttlMs: number;
  value: T;
};

export const MATERIAL_CACHE_KEY = "verve_material_cache_v1";
export const MATERIAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam — cukup untuk sesi edit, tidak basi terlalu lama
export const MATERIAL_CACHE_MAX = 36;

export function materialCacheKey(query: string, page = 1, per = 8): string {
  const q = String(query || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  return `${q}|p=${Math.max(1, Math.round(Number(page) || 1))}|n=${Math.max(1, Math.round(Number(per) || 8))}`;
}

export function isMaterialCacheFresh<T>(entry: MaterialCacheEntry<T> | null, nowMs = Date.now()): boolean {
  if (!entry || !entry.key || !(entry.ttlMs > 0) || !(entry.at > 0)) return false;
  return nowMs - entry.at >= 0 && nowMs - entry.at <= entry.ttlMs;
}

function safeReadAll(): MaterialCacheEntry<unknown>[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(MATERIAL_CACHE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.key === "string") : [];
  } catch { return []; }
}

function safeWriteAll(arr: MaterialCacheEntry<unknown>[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MATERIAL_CACHE_KEY, JSON.stringify(arr.slice(0, MATERIAL_CACHE_MAX)));
  } catch { /* penuh? abaikan — app tetap jalan */ }
}

export function readMaterialCache<T>(query: string, page = 1, per = 8, nowMs = Date.now()): T | null {
  const key = materialCacheKey(query, page, per);
  const arr = safeReadAll();
  const hit = arr.find((x) => x.key === key) as MaterialCacheEntry<T> | undefined;
  if (!isMaterialCacheFresh(hit || null, nowMs)) return null;
  return hit!.value;
}

export function writeMaterialCache<T>(query: string, page: number, per: number, value: T, nowMs = Date.now(), ttlMs = MATERIAL_CACHE_TTL_MS): void {
  const key = materialCacheKey(query, page, per);
  const arr = safeReadAll().filter((x) => x.key !== key && isMaterialCacheFresh(x, nowMs));
  arr.unshift({ key, at: nowMs, ttlMs, value });
  safeWriteAll(arr.slice(0, MATERIAL_CACHE_MAX));
}

export function clearMaterialCache(): void {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(MATERIAL_CACHE_KEY); } catch { /* no-op */ }
}
