/**
 * #️⃣ VERVE HASHTAG PINTAR v19.10 — ilmu dari TikTok Strategist (agency-agents):
 * mix 5-8 hashtag: trending + niche + kata kunci judul + umum. Otomatis,
 * tanpa tebak-tebakan — dari judul, keyword, dan (opsional) trend yang lagi hangat.
 * Murni klien & offline.
 */

import { tok } from "./yie-score";
import { nicheById } from "./niche";

const STOP = new Set(
  "yang dan di ke dari ini itu untuk dengan pada akan ada adalah the of and in to a is or for an video lirik full official".split(" ")
);

/** Ubah teks jadi hashtag: huruf kecil, tanpa spasi/tanda baca, maks 24 karakter. */
export function jadiHashtag(s: string): string {
  const bersih = String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // buang aksen
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kata = bersih.split(" ").filter((w) => w && !STOP.has(w));
  const tag = kata.slice(0, 3).join("");
  return tag.slice(0, 24);
}

export type HashtagPaket = {
  tags: string[]; // 6-8 hashtag siap pakai (tanpa #)
  alasan: string;
};

/**
 * Susun paket hashtag: niche terpilih + kata kunci judul + trend hangat + umum.
 */
export function hashtagPintar(judul: string, keyword: string, trend?: string, nicheId = "story_song"): HashtagPaket {
  const out: string[] = [];
  const push = (t: string) => {
    const tag = jadiHashtag(t);
    if (tag && tag.length >= 3 && !out.includes(tag)) out.push(tag);
  };

  // 1) Niche tetap (v19.20: ikut niche pilihan)
  (nicheById(nicheId).tags || ["kisahnyata", "kisahmenyentuh", "laguemosional"]).forEach(push);
  // 2) Kata kunci dari judul (2-3 tag)
  tok(judul).slice(0, 3).forEach((w) => push(w));
  // 3) Keyword riset
  push(keyword);
  // 4) Trend hangat (kalau ada)
  if (trend) push(String(trend).split(" ").slice(0, 2).join(""));
  // 5) Umum
  ["shorts", "viraltiktok", "youtubeshorts"].forEach(push);

  const tags = out.slice(0, 8);
  const alasan = tags.length
    ? `6-8 tag campuran: niche terpilih + kata kunci judul + trend + umum — pola TikTok Strategist.`
    : "Belum ada bahan — isi judul dulu.";
  return { tags, alasan };
}
