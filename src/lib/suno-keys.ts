/*
 * Penyimpanan kunci provider musik di browser.
 *
 * Kunci API tidak pernah ditulis ke server atau ke repository. Modul ini hanya
 * berisi normalisasi dan helper localStorage supaya semua layar musik memakai
 * aturan yang sama: provider yang dipilih user selalu menjadi sumber kebenaran.
 */

export const SUNO_KEYS_KEY = "verve_suno_keys_v1";
export const SUNO_ACTIVE_KEY = "verve_suno_key";
export const SUNO_PROVIDER_KEY = "verve_suno_provider";

export type SunoKey = { key: string; provider: string };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Bersihkan hasil paste tanpa mengubah isi key/cookie di tengahnya.
 * BOM sering ikut terbawa saat copy-paste dari dashboard di HP.
 */
export function cleanSunoKey(value: unknown): string {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "").trim() : "";
}

/** Dipakai hanya untuk membandingkan key; prefix Bearer bukan bagian dari key. */
export function sunoKeyIdentity(value: unknown): string {
  return cleanSunoKey(value).replace(/^Bearer\s+/i, "");
}

export function readSunoKeyPool(storage?: StorageLike | null): SunoKey[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SUNO_KEYS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const out: SunoKey[] = [];
    for (const item of parsed) {
      // Toleransi format lama yang mungkin menyimpan array string.
      const key = typeof item === "string" ? cleanSunoKey(item) : cleanSunoKey((item as any)?.key);
      const provider = typeof item === "string" ? "kie" : cleanSunoKey((item as any)?.provider) || "kie";
      if (!key) continue;
      if (!out.some((x) => x.provider === provider && sunoKeyIdentity(x.key) === sunoKeyIdentity(key))) {
        out.push({ key, provider });
      }
    }
    return out;
  } catch {
    // Data lama korup tidak boleh membuat panel Generate Lagu hilang/crash.
    return [];
  }
}

export function writeSunoKeyPool(storage: StorageLike | null | undefined, pool: SunoKey[]): void {
  if (!storage) return;
  try {
    storage.setItem(SUNO_KEYS_KEY, JSON.stringify(pool));
  } catch {
    // localStorage penuh/terblokir: generate tetap boleh mencoba key yang sedang aktif.
  }
}

export function readSunoActiveKey(storage?: StorageLike | null): string {
  if (!storage) return "";
  try { return cleanSunoKey(storage.getItem(SUNO_ACTIVE_KEY)); } catch { return ""; }
}

export function readSunoActiveProvider(storage?: StorageLike | null): string {
  if (!storage) return "";
  try { return cleanSunoKey(storage.getItem(SUNO_PROVIDER_KEY)); } catch { return ""; }
}

export function readSunoProvider(
  storage: StorageLike | null | undefined,
  allowed: readonly string[],
  fallback = "kie",
): string {
  let stored = "";
  try { stored = cleanSunoKey(storage?.getItem(SUNO_PROVIDER_KEY)); } catch { /* gunakan fallback */ }
  return allowed.includes(stored) ? stored : fallback;
}

export function writeSunoActive(
  storage: StorageLike | null | undefined,
  key: string,
  provider: string,
): void {
  if (!storage) return;
  try {
    const cleanKey = cleanSunoKey(key);
    const cleanProvider = cleanSunoKey(provider);
    if (cleanKey) storage.setItem(SUNO_ACTIVE_KEY, cleanKey);
    else storage.removeItem(SUNO_ACTIVE_KEY);
    if (cleanProvider) storage.setItem(SUNO_PROVIDER_KEY, cleanProvider);
    else storage.removeItem(SUNO_PROVIDER_KEY);
  } catch {
    // Jangan gagalkan alur UI hanya karena storage tidak tersedia.
  }
}

export function addSunoKeys(
  pool: SunoKey[],
  draft: string,
  provider: string,
): { next: SunoKey[]; addedKeys: string[]; duplicateCount: number } {
  const p = cleanSunoKey(provider) || "kie";
  const next = pool
    .filter((item) => item && cleanSunoKey(item.key))
    .map((item) => ({ key: cleanSunoKey(item.key), provider: cleanSunoKey(item.provider) || "kie" }));
  const seen = new Set(next.map((item) => `${item.provider}\u0000${sunoKeyIdentity(item.key)}`));
  const addedKeys: string[] = [];
  let duplicateCount = 0;

  // Hanya newline yang menjadi pemisah; cookie session boleh mengandung spasi/semicolon.
  for (const raw of String(draft || "").split(/\r?\n+/)) {
    const key = cleanSunoKey(raw);
    if (!key) continue;
    const identity = `${p}\u0000${sunoKeyIdentity(key)}`;
    if (seen.has(identity)) {
      duplicateCount++;
      continue;
    }
    seen.add(identity);
    next.push({ key, provider: p });
    addedKeys.push(key);
  }
  return { next, addedKeys, duplicateCount };
}

export function removeSunoKey(pool: SunoKey[], key: string, provider: string): SunoKey[] {
  const identity = sunoKeyIdentity(key);
  const p = cleanSunoKey(provider);
  return pool.filter((item) => !(item.provider === p && sunoKeyIdentity(item.key) === identity));
}

/** Key aktif didahulukan, lalu cadangan provider yang sama. Key provider lain tidak ikut. */
export function keysForSunoProvider(
  pool: SunoKey[],
  provider: string,
  activeKey = "",
  activeProvider = "",
): SunoKey[] {
  const p = cleanSunoKey(provider) || "kie";
  const selected = pool.filter((item) => item.provider === p && cleanSunoKey(item.key));
  const active = cleanSunoKey(activeKey);
  if (!active || (activeProvider && activeProvider !== p)) return selected;
  return [
    { key: active, provider: p },
    ...selected.filter((item) => sunoKeyIdentity(item.key) !== sunoKeyIdentity(active)),
  ];
}
