/**
 * 🔄 VERVE AUTO-SYNC v19.2 — logika "otak belajar dari YouTube" yang DIPAKAI BERSAMA
 * oleh Lahan Awalan & Dokter Channel (satu sumber kebenaran, tidak dobel kode).
 *
 * Alur: cek status OAuth → panggil /api/youtube/sync-brain (read-only) →
 * gabung hasil ke BrainMemory (aturan "data terlengkap menang") → simpan
 * ke localStorage + brankas Supabase → tandai jam sync.
 *
 * Murni klien; semua kegagalan dikembalikan sebagai pesan jujur, tidak melempar.
 */

import type { BrainMemory, BrainResult } from "./yie-score";

export const BRAIN_KEY = "verve_brain_v1";
export const SYNC_KEY = "verve_brain_yt_sync_v1";

export function loadBrain(): BrainMemory {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return { researches: [], results: [] };
    const j = JSON.parse(raw);
    return { researches: j.researches || [], results: j.results || [] };
  } catch {
    return { researches: [], results: [] };
  }
}

export function lastSyncTime(): number | null {
  try {
    const n = Number(localStorage.getItem(SYNC_KEY) || 0);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function markSyncDone(): void {
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* penuh? abaikan */ }
}

/** Simpan memori otak: localStorage + brankas Supabase (gagal brankas = abaikan). */
export function persistBrain(next: BrainMemory): void {
  try { localStorage.setItem(BRAIN_KEY, JSON.stringify(next)); } catch { /* penuh? abaikan */ }
  try {
    fetch("/api/hcnsec/brain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => { /* offline / brankas belum siap */ });
  } catch { /* abaikan */ }
}

/** Skor kekayaan data: makin lengkap (CTR+Tayangan+AVD) makin menang saat digabung. */
export function hasilKeSkor(r: { ctr?: number | ""; impressions?: number | ""; avdSec?: number | "" }): number {
  let s = 0;
  if (r.ctr != null && r.ctr !== "") s += 2;
  if (r.impressions != null && r.impressions !== "") s += 1;
  if (r.avdSec != null && r.avdSec !== "") s += 1;
  return s;
}

/** Gabung hasil sync dengan memori yang ada — "data terlengkap menang", max 200 judul. */
export function mergeSyncResults(now: BrainResult[], rows: BrainResult[]): BrainResult[] {
  const map = new Map<string, BrainResult>();
  [...(now || []), ...(rows || [])].forEach((r) => {
    const k = String(r.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!k) return;
    const old = map.get(k);
    if (!old) { map.set(k, r); return; }
    const oldScore = hasilKeSkor(old), newScore = hasilKeSkor(r);
    if (newScore > oldScore || (newScore === oldScore && (+r.time! || 0) >= (+old.time! || 0)))
      map.set(k, { ...old, ...r });
  });
  return [...map.values()].sort((x, y) => (+y.time! || 0) - (+x.time! || 0)).slice(0, 200);
}

export type SyncResult =
  | { ok: true; msg: string; merged: BrainResult[] }
  | { ok: false; msg: string };

/** Jalankan sync otak dari YouTube (read-only). Tidak melempar — selalu balas pesan. */
export async function syncYtBrain(brain: BrainMemory): Promise<SyncResult> {
  try {
    const st = await fetch("/api/youtube/status").then((r) => r.json()).catch(() => null);
    if (!st?.configured) {
      return {
        ok: false,
        msg: `⚠️ Koneksi YouTube resmi belum aktif di server (butuh ${(st?.missing || ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_OAUTH_COOKIE_SECRET"]).join(", ")}). Set di Vercel → Settings → Environment Variables, lalu redeploy.`,
      };
    }
    if (!st?.connected) {
      return { ok: false, msg: "🔗 YouTube belum terhubung. Hubungkan SEKALI di menu 🩺 Dokter Channel (read-only, berlaku 45 hari) — setelah itu otak sync sendiri." };
    }
    const r = await fetch("/api/youtube/sync-brain?days=90&limit=50");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const rows: BrainResult[] = (j.rows || []).map((x: any) => ({
      title: x.title,
      ctr: x.ctr ?? "",
      impressions: x.impressions ?? "",
      avdSec: x.avdSec ?? "",
      time: x.time || Date.now(),
      ...x,
    }));
    if (!rows.length) return { ok: false, msg: "Sync selesai: 0 video dalam 90 hari terakhir (channel masih kosong? Atur rentang?)." };
    const merged = mergeSyncResults(brain.results || [], rows);
    const ctrN = rows.filter((x) => x.ctr !== "" && x.ctr != null).length;
    const top = [...rows].filter((x) => x.ctr !== "" && x.ctr != null).sort((a, b) => (+b.ctr! || 0) - (+a.ctr! || 0))[0];
    const msg = `🧠 Otak sync ${rows.length} video asli dari channelmu${ctrN ? ` — ${ctrN} dapat CTR` : ""}${top ? `, terbaik: "${top.title}" (CTR ${top.ctr}%)` : ""}. Pola judul yang terbukti bagus langsung diprioritaskan.`;
    return { ok: true, msg, merged };
  } catch (e) {
    return { ok: false, msg: `⚠️ Gagal sync: ${e instanceof Error ? e.message : String(e)}` };
  }
}
