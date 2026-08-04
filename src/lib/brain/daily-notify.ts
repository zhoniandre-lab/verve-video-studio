/**
 * 🔔 VERVE DAILY NOTIFY v19.5 — notifikasi harian otak (PWA, foreground).
 * Tiap kali app dibuka di hari yang baru & izin notifikasi aktif:
 *   - jalankan sync otak (kalau YouTube terhubung)
 *   - kirim notifikasi ringkasan: berapa video dipelajari + jam hoki hari ini.
 * Jujur: notifikasi muncul saat app dibuka (foreground). Notifikasi penuh
 * di background butuh server push (di luar scope versi ini) — tercatat di catatan.
 * Murni klien, tanpa dependency.
 */

import { bestUploadWindows, jadwalUpload } from "./deep-dive";
import { mergeSyncResults, persistBrain, syncYtBrain } from "./auto-sync";
import type { BrainMemory } from "./yie-score";

export const NOTIF_KEY = "verve_notif_harian_v1";
export const NOTIF_LAST_KEY = "verve_notif_last_v1";

export function notifEnabled(): boolean {
  try { return localStorage.getItem(NOTIF_KEY) === "1"; } catch { return false; }
}
export function setNotifEnabled(on: boolean): void {
  try { localStorage.setItem(NOTIF_KEY, on ? "1" : "0"); } catch { /* abaikan */ }
}
export function notifSentToday(): boolean {
  try { return localStorage.getItem(NOTIF_LAST_KEY) === new Date().toISOString().slice(0, 10); } catch { return false; }
}
export function markNotifSent(): void {
  try { localStorage.setItem(NOTIF_LAST_KEY, new Date().toISOString().slice(0, 10)); } catch { /* abaikan */ }
}

export function notifSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!notifSupported()) return false;
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return Notification.permission === "granted";
  }
}

/** Bangun pesan harian dari otak (setelah sync). Tidak pernah melempar. */
export function buatPesanHarian(brain: BrainMemory, syncOk: boolean): string {
  const n = (brain.results || []).length;
  const { best } = bestUploadWindows(brain);
  const jadwal = jadwalUpload(brain, 1);
  const slot = jadwal.slots[0];
  const jamHoki = best ? `Jam hokimu ${best.label} (${best.avgVelocity} view/hari)` : "Sync dari YouTube biar otak tahu jam hokimu";
  const line = syncOk ? `🧠 Otak belajar: ${n} judul dipelajari. ${jamHoki}.` : `🧠 Otak siap: ${n} judul dipelajari. ${jamHoki}.`;
  return `${line} Slot terbaik besok: ${slot.hari}, ${slot.jendela}.`;
}

export type NotifResult =
  | { ok: true; title: string; body: string }
  | { ok: false; reason: "unsupported" | "denied" | "disabled" | "sent" | "error"; msg: string };

/** Cek & kirim notifikasi harian (dipanggil saat app dibuka). Tidak melempar. */
export async function cekNotifikasiHarian(brain: BrainMemory): Promise<NotifResult> {
  if (!notifSupported()) return { ok: false, reason: "unsupported", msg: "Browser ini tidak mendukung notifikasi." };
  if (Notification.permission !== "granted") return { ok: false, reason: "denied", msg: "Izin notifikasi belum diberikan." };
  if (!notifEnabled()) return { ok: false, reason: "disabled", msg: "Notifikasi harian dimatikan." };
  if (notifSentToday()) return { ok: false, reason: "sent", msg: "Notifikasi hari ini sudah terkirim." };
  try {
    const r = await syncYtBrain(brain);
    let merged = brain;
    if (r.ok) {
      merged = { ...brain, results: mergeSyncResults(brain.results || [], r.merged) };
      persistBrain(merged);
    }
    const body = buatPesanHarian(merged, r.ok);
    new Notification("🔔 VERVE — Laporan Otak Harian", { body, tag: "verve-daily" });
    markNotifSent();
    return { ok: true, title: "VERVE", body };
  } catch (e) {
    return { ok: false, reason: "error", msg: e instanceof Error ? e.message : "Gagal kirim notifikasi" };
  }
}
