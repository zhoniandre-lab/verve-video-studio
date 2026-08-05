/**
 * 🔥 VERVE TREND RADAR v19.4 + v19.9 — otak "menangkap gelombang" dari Google Trends.
 * Sumber: RSS publik Google Trends (trends.google.com/trending/rss?geo=ID)
 * — GRATIS, tanpa API key, read-only, legal. Google tidak punya API resmi publik
 * untuk Trends, tapi RSS harian ini stabil & resmi.
 *
 * Fungsi di sini PURE & offline (parser + skor) — route /api/trends yang fetch.
 * Skor relevansi memakai kamus audiens VERVE (audience.ts): trend yang cocok
 * dengan niche "cerita jadi lagu" ditandai 💔 Emosional — bisa langsung jadi lagu.
 *
 * 🧠 v19.9 ILMU BARU — "RADAR GELOMBANG" (pola OSINT monitoring):
 *   otak menyimpan snapshot trend tiap hari (localStorage), lalu membandingkan
 *   posisi hari ini vs kemarin → deteksi 🆕 BARU / 🌊 NAIK / 📉 TURUN / stabil.
 *   Ini "intelijen pasar": tahu gelombang mana yang sedang membesar sebelum ramai.
 */

import { INTENTS } from "./audience";

export const GELOMBANG_KEY = "verve_trend_gelombang_v1";

export type TrendItem = {
  title: string;
  traffic: string; // perkiraan volume dari Google ("100K+", "200K+"…)
  pubDate: string;
  news?: string[]; // judul berita terkait (maks 2)
};

export type TrendTags = {
  emoji: string;
  label: string;
  skor: number; // 0 = umum, makin tinggi makin relevan dgn niche
  cocokLagu: boolean; // kandidat langsung buat "cerita jadi lagu"
};

function decodeXml(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Parse RSS Google Trends → daftar item. Murni, deterministic, tanpa dependency. */
export function parseTrendsRss(xml: string): TrendItem[] {
  const blocks = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  const out: TrendItem[] = [];
  for (const b of blocks) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (!title) continue;
    const traffic = (b.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || "";
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    const news = [...b.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map((m) => m[1]).slice(0, 2);
    out.push({ title: decodeXml(title).trim(), traffic: decodeXml(traffic).trim(), pubDate, news: news.map(decodeXml) });
  }
  return out;
}

const KAMUS_EMOSI = [
  "rindu", "ibu", "ayah", "mama", "bunda", "sedih", "nangis", "menangis", "maaf", "doa",
  "kehilangan", "air mata", "haru", "cinta", "patah hati", "putus", "sakit", "rumah",
  "pulang", "pergi", "kangen", "sayang", "anak", "keluarga", "tanggung jawab", "perjuangan",
  "ikhlas", "tabah", "kisah", "cerita", "kenangan", "meninggal", "wafat", "selamat tinggal",
];

/* ================= v19.9: RADAR GELOMBANG (deteksi naik/turun lintas hari) ================= */

export type GelombangStatus = "baru" | "naik" | "turun" | "stabil";

export type TrendGelombang = {
  title: string;
  status: GelombangStatus;
  posKemarin: number; // -1 kalau belum ada
  posHariIni: number;
};

export type SnapshotTrend = { at: string; items: string[] };

/** Simpan snapshot daftar trend hari ini (untuk perbandingan besok). */
export function simpanSnapshotTrend(items: TrendItem[]): void {
  try {
    const snap: SnapshotTrend = { at: new Date().toISOString().slice(0, 10), items: (items || []).map((t) => t.title) };
    localStorage.setItem(GELOMBANG_KEY, JSON.stringify(snap));
  } catch { /* abaikan */ }
}

/** Ambil snapshot kemarin (atau null kalau belum ada / sudah kedaluwarsa >2 hari). */
export function ambilSnapshotTrend(): SnapshotTrend | null {
  try {
    const j = JSON.parse(localStorage.getItem(GELOMBANG_KEY) || "null");
    if (!j || !Array.isArray(j.items)) return null;
    const umur = (Date.now() - +new Date(j.at)) / 864e5;
    if (!Number.isFinite(umur) || umur > 2) return null;
    return j as SnapshotTrend;
  } catch { return null; }
}

/**
 * Bandingkan daftar trend hari ini vs kemarin → status tiap trend:
 * 🆕 BARU (tidak ada kemarin) · 🌊 NAIK (naik ≥3 posisi) · 📉 TURUN (turun ≥3) · stabil.
 */
export function bandingkanGelombang(sekarang: TrendItem[], kemarin: SnapshotTrend | null): TrendGelombang[] {
  const prev = kemarin?.items || [];
  const idxPrev = new Map(prev.map((t, i) => [t.toLowerCase().trim(), i]));
  return (sekarang || []).map((t, i) => {
    const k = t.title.toLowerCase().trim();
    const p = idxPrev.get(k);
    let status: GelombangStatus = "stabil";
    if (!kemarin) status = "stabil"; // belum ada snapshot → jujur: belum bisa dibandingkan
    else if (p === undefined) status = "baru";
    else if (p - i >= 3) status = "naik";
    else if (i - p >= 3) status = "turun";
    return { title: t.title, status, posKemarin: p === undefined ? -1 : p, posHariIni: i };
  });
}

/* ================= SKOR RELEVANSI NICHE ================= */

/**
 * Skor relevansi trend terhadap niche VERVE (cerita jadi lagu & kawan-kawan).
 * Pakai kamus INTENTS dari audience.ts + kamus emosi — tanpa ngarang.
 */
export function skorTrend(title: string): TrendTags {
  const t = String(title || "").toLowerCase();
  const checks: [string, string, string][] = [
    ["story_song", "💔", "Emosional / Cerita"],
    ["family", "👨‍👩‍👧", "Keluarga"],
    ["horror", "👻", "Horor"],
    ["dj", "🎧", "DJ / Musik"],
  ];
  for (const [intent, emoji, label] of checks) {
    const keys = ((INTENTS as Record<string, { keys?: string[] }>)[intent]?.keys) || [];
    let hit = 0;
    keys.forEach((k) => { if (t.includes(k.toLowerCase())) hit++; });
    if (hit > 0) return { emoji, label, skor: Math.min(hit + 1, 5), cocokLagu: intent === "story_song" || intent === "family" };
  }
  const hit = KAMUS_EMOSI.filter((w) => t.includes(w)).length;
  if (hit > 0) return { emoji: "💔", label: "Emosional", skor: Math.min(hit + 1, 5), cocokLagu: true };
  return { emoji: "⚡", label: "Umum", skor: 0, cocokLagu: false };
}
