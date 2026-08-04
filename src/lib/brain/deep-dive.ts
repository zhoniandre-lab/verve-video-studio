/**
 * 🔮 VERVE DEEP DIVE v19.3 — "otak yang berpikir lebih dalam".
 * Ide yang belum digali tool lain: SEMUA belajar dari CHANNEL SENDIRI, bukan saran generik.
 *   - Kecepatan tayang (view velocity): berapa view/hari tiap video + label 🚀/🔥/🐢
 *   - Jam hoki: kapan upload paling cepat tembus (belajar dari jam upload sendiri)
 *   - Durasi ideal: rentang durasi mana yang paling nempel di channelmu
 *   - Prediksi CTR judul (Bayes + kemiripan riwayat) — SEBELUM tayang
 *   - Level otak (gamifikasi) + Laporan Otak (ringkasan siap salin)
 * Murni klien & offline. Tidak mengarang: tiap angka punya bukti di brain.
 */

import { analyzeBrainPatterns } from "./pattern-insight";
import { avg, clamp, jaccardSim, learningBoostV2, norm } from "./yie-score";
import type { BrainMemory, BrainResult } from "./yie-score";

/* ================= KECEPATAN TAYANG (VIEW VELOCITY) ================= */

export function daysSince(t?: number | string): number | null {
  const ts = typeof t === "string" ? +new Date(t) : t;
  if (!ts || !Number.isFinite(ts)) return null;
  return Math.max(0.5, (Date.now() - ts) / 864e5);
}

export function videoVelocity(v: { time?: number | string; views?: number | null }): number | null {
  if (v.views == null || v.views <= 0) return null;
  const d = daysSince(v.time);
  if (d == null) return null;
  return Math.round((v.views / d) * 10) / 10;
}

export function velocityLabel(v: number): string {
  if (v >= 1000) return "🚀 VIRAL";
  if (v >= 200) return "🔥 Ngebut";
  if (v >= 50) return "👍 Padat";
  if (v >= 10) return "🐢 Merangkak";
  return "😴 Sepi";
}

export function uploadHourOf(t?: number | string): number | null {
  const ts = typeof t === "string" ? +new Date(t) : t;
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts).getHours();
}

export function uploadDayOf(t?: number | string): number | null {
  const ts = typeof t === "string" ? +new Date(t) : t;
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts).getDay();
}

/* ================= JAM HOKI (kapan upload paling tembus) ================= */

const HOUR_BUCKETS: [number, number, string][] = [
  [0, 6, "Dini hari (00-05)"],
  [6, 12, "Pagi (06-11)"],
  [12, 18, "Siang (12-17)"],
  [18, 24, "Malam (18-23)"],
];

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export type WindowStat = {
  label: string;
  n: number;
  avgVelocity: number | null;
  verdict: "hoki" | "jelek" | "netral" | "kurang-data";
};

export function bestUploadWindows(brain: BrainMemory): { windows: WindowStat[]; best: WindowStat | null } {
  const acc: Record<string, { sum: number; n: number }> = {};
  (brain.results || []).forEach((r) => {
    const h = uploadHourOf(r.time);
    const vel = videoVelocity(r);
    if (h == null || vel == null) return;
    const b = HOUR_BUCKETS.find(([a, b2]) => h >= a && h < b2);
    if (!b) return;
    const a = acc[b[2]] || (acc[b[2]] = { sum: 0, n: 0 });
    a.sum += vel; a.n++;
  });
  const windows: WindowStat[] = HOUR_BUCKETS
    .map(([, , label]) => {
      const a = acc[label];
      if (!a) return { label, n: 0, avgVelocity: null, verdict: "kurang-data" as const };
      const avgVel = a.sum / a.n;
      const verdict: WindowStat["verdict"] = a.n < 2 ? "kurang-data" : avgVel >= 50 ? "hoki" : avgVel >= 10 ? "netral" : "jelek";
      return { label, n: a.n, avgVelocity: Math.round(avgVel * 10) / 10, verdict };
    })
    .filter((w) => w.n > 0);
  const best = windows
    .filter((w) => w.verdict === "hoki" && w.n >= 2)
    .sort((a, b) => (b.avgVelocity || 0) - (a.avgVelocity || 0))[0] || null;
  return { windows, best };
}

export function bestUploadDay(brain: BrainMemory): { label: string; n: number; avgVelocity: number | null } | null {
  const acc: Record<number, { sum: number; n: number }> = {};
  (brain.results || []).forEach((r) => {
    const d = uploadDayOf(r.time);
    const vel = videoVelocity(r);
    if (d == null || vel == null) return;
    const a = acc[d] || (acc[d] = { sum: 0, n: 0 });
    a.sum += vel; a.n++;
  });
  const entries = Object.entries(acc)
    .filter(([, a]) => a.n >= 2)
    .map(([d, a]) => ({ label: DAY_NAMES[Number(d)], n: a.n, avgVelocity: Math.round((a.sum / a.n) * 10) / 10 }))
    .sort((a, b) => (b.avgVelocity || 0) - (a.avgVelocity || 0));
  return entries[0] || null;
}

/* ================= DURASI IDEAL (durasi mana yang paling nempel) ================= */

const DUR_BUCKETS: [number, number, string][] = [
  [0, 60, "Shorts (≤1 mnt)"],
  [60, 180, "Pendek (1-3 mnt)"],
  [180, 360, "Sedang (3-6 mnt)"],
  [360, 600, "Panjang (6-10 mnt)"],
  [600, Infinity, "Sangat panjang (10+ mnt)"],
];

export type DurStat = { label: string; n: number; avgVelocity: number | null; avgAvd: number | null };

/** Baris brain hasil sync bisa membawa field ekstra (views, durationSec, velocity…). */
type DeepRow = BrainResult & { durationSec?: number; views?: number };

export function idealDuration(brain: BrainMemory): { buckets: DurStat[]; best: DurStat | null } {
  const acc: Record<string, { velSum: number; avdSum: number; n: number }> = {};
  const rows = (brain.results || []) as unknown as DeepRow[];
  rows.forEach((r) => {
    const d = r.durationSec;
    if (!d || d <= 0) return;
    const b = DUR_BUCKETS.find(([a, b2]) => d >= a && d < b2);
    if (!b) return;
    const a = acc[b[2]] || (acc[b[2]] = { velSum: 0, avdSum: 0, n: 0 });
    const vel = videoVelocity(r);
    if (vel != null) a.velSum += vel;
    if (r.avdSec != null && r.avdSec !== "") a.avdSum += Number(r.avdSec);
    a.n++;
  });
  const buckets: DurStat[] = DUR_BUCKETS
    .map(([, , label]) => {
      const a = acc[label];
      if (!a) return { label, n: 0, avgVelocity: null, avgAvd: null };
      return {
        label,
        n: a.n,
        avgVelocity: Math.round((a.velSum / a.n) * 10) / 10,
        avgAvd: a.avdSum > 0 ? Math.round((a.avdSum / a.n) * 10) / 10 : null,
      };
    })
    .filter((b) => b.n > 0);
  const best = buckets.filter((b) => b.n >= 2 && b.avgVelocity != null)
    .sort((a, b) => (b.avgVelocity || 0) - (a.avgVelocity || 0))[0] || null;
  return { buckets, best };
}

/* ================= PREDIKSI CTR SEBELUM TAYANG (🔮) ================= */

export function predictCtrBayes(title: string, brain: BrainMemory): { est: number; low: number; high: number; n: number; why: string } {
  const t = String(title || "").trim();
  if (!t) return { est: 0, low: 0, high: 0, n: 0, why: "" };
  const ins = analyzeBrainPatterns(brain);
  const prior = ins.baselineCtr ?? 4.5;
  const lb = learningBoostV2(t, brain);
  // jangan pakai clamp() dari yie-score (membulatkan ke integer) — bulatkan 1 desimal manual
  const est = Math.max(0, Math.min(100, Math.round((lb.bayesCtr ?? prior) * 10) / 10));
  const nt = norm(t);
  let n = 0;
  (brain.results || []).forEach((r) => { if (jaccardSim(nt, r.title || "") >= 0.55) n++; });
  const sd = Math.max(1.0, Math.round((1.5 + 5 / Math.max(2, n)) * 10) / 10);
  const low = Math.max(0, Math.round((est - sd) * 10) / 10);
  const high = Math.round((est + sd) * 10) / 10;
  const why = n
    ? `Berdasarkan ${n} judul mirip di otakmu (prior channel ${prior}%).`
    : `Belum ada judul mirip — pakai baseline channelmu ${prior}%.`;
  return { est, low, high, n, why };
}

/* ================= LEVEL OTAK (gamifikasi) ================= */

export function brainLevel(withCtr: number): { label: string; emoji: string; next: string } {
  if (withCtr >= 60) return { label: "Doktor Judul", emoji: "🎓", next: "" };
  if (withCtr >= 30) return { label: "Magister Otak", emoji: "🧠", next: "60" };
  if (withCtr >= 15) return { label: "Sarjana Pola", emoji: "🎓", next: "30" };
  if (withCtr >= 5) return { label: "Sekolah Dasar", emoji: "📚", next: "15" };
  return { label: "Bayi Otak", emoji: "🍼", next: "5" };
}

/* ================= LAPORAN OTAK (ringkasan siap salin) ================= */

export function buildBrainReport(brain: BrainMemory): string {
  const ins = analyzeBrainPatterns(brain);
  const { best: win, windows } = bestUploadWindows(brain);
  const day = bestUploadDay(brain);
  const dur = idealDuration(brain);
  const lvl = brainLevel(ins.withCtr);
  let fastest: BrainResult | null = null;
  let fastestVel: number | null = null;
  for (const r of brain.results || []) {
    const vel = videoVelocity(r);
    if (vel != null && (fastestVel == null || vel > fastestVel)) { fastest = r; fastestVel = vel; }
  }

  const L: string[] = [];
  L.push("🧠 LAPORAN OTAK VERVE — " + new Date().toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric" }));
  L.push(`• Level: ${lvl.emoji} ${lvl.label} (${ins.withCtr} judul berangka dari ${ins.n} judul)`);
  L.push(`• Baseline CTR channel: ${ins.baselineCtr != null ? ins.baselineCtr + "%" : "belum ada data"}`);
  if (ins.top.length) L.push(`• Pola TEMBUS: ${ins.top.map((p) => `${p.label} (+${p.delta}%)`).join(", ")}`);
  if (ins.worst.length) L.push(`• Pola GAGAL: ${ins.worst.map((p) => `${p.label} (${p.delta}%)`).join(", ")}`);
  if (ins.best && ins.bestCtr != null) L.push(`• Judul terbaik: "${ins.best.title}" (CTR ${ins.bestCtr}%)`);
  if (win) L.push(`• Jam hoki: ${win.label} (rata-rata ${win.avgVelocity} view/hari, ${win.n} video)`);
  if (day) L.push(`• Hari terbaik: ${day.label} (${day.avgVelocity} view/hari)`);
  if (dur.best) L.push(`• Durasi ideal: ${dur.best.label} (${dur.best.avgVelocity} view/hari)`);
  if (fastest && fastestVel != null) L.push(`• Video tercepat: "${fastest.title}" (${fastestVel} view/hari, ${velocityLabel(fastestVel)})`);
  L.push("🔮 Otak belajar dari datamu sendiri — makin sering sync, makin tajam.");
  return L.join("\n");
}
