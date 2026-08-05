/**
 * 📱 VERVE DEVICE SCOPE v19.23 — "setiap HP = default sendiri" (anti diintip).
 * Data pribadi (niche, preset, posisi, tema) di-scope ke PERANGKAT:
 *   - simpan sidik perangkat (fingerprint) dari localStorage + waktu
 *   - kalau buka di HP/browser BERBEDA → semua data pribadi DI-RESET ke default
 *   - pengguna lain yang pakai HP itu nggak bisa lihat niche/preset kamu
 * Murni klien. Aman & sederhana — tanpa backend.
 */

const DEVICE_KEY = "verve_device_scope_v1";

/** Sidik ringan perangkat: UA + bahasa + platform + zona waktu. */
function fingerprint(): string {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : ({} as any);
    return [
      String(nav.userAgent || "").slice(0, 120),
      String(nav.language || ""),
      String(nav.platform || ""),
      String(new Date().getTimezoneOffset()),
    ].join("|");
  } catch { return "unknown"; }
}

/** Apakah ini perangkat yang SAMA dengan terakhir kali buka? */
export function deviceSama(): boolean {
  try {
    const j = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
    if (!j || !j.fp) return false;
    return j.fp === fingerprint();
  } catch { return false; }
}

/** Tandai perangkat ini sebagai "pemilik" data pribadi. */
export function tandaiPerangkat(): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ fp: fingerprint(), at: Date.now() }));
  } catch { /* abaikan */ }
}

/** Kalau perangkat beda → reset semua data pribadi (niche, preset, posisi, tema). */
export function resetJikaPerangkatBeda(): void {
  try {
    if (deviceSama()) return; // perangkat sama → biarkan data
    // Perangkat beda → bersihkan data pribadi (default)
    const kunci = [
      "verve_lahan_niche_v1",
      "verve_lahan_niche_custom_v1",
      "verve_spektrum_tema",
      "verve_spektrum_layout",
      "verve_spektrum_drag",
      "verve_spektrum_presets_v1",
      "verve_brain_yt_sync_v1",
    ];
    kunci.forEach((k) => { try { localStorage.removeItem(k); } catch { /* abaikan */ } });
    tandaiPerangkat(); // perangkat ini sekarang pemilik
  } catch { /* abaikan */ }
}
