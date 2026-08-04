/**
 * 🔥 VERVE TREND RADAR v19.4 — otak "menangkap gelombang" dari Google Trends.
 * Sumber: RSS publik Google Trends (trends.google.com/trending/rss?geo=ID)
 * — GRATIS, tanpa API key, read-only, legal. Google tidak punya API resmi publik
 * untuk Trends, tapi RSS harian ini stabil & resmi.
 *
 * Fungsi di sini PURE & offline (parser + skor) — route /api/trends yang fetch.
 * Skor relevansi memakai kamus audiens VERVE (audience.ts): trend yang cocok
 * dengan niche "cerita jadi lagu" ditandai 💔 Emosional — bisa langsung jadi lagu.
 */

import { INTENTS } from "./audience";

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
