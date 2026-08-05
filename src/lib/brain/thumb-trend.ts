/**
 * 🎨 VERVE THUMB TREND v19.5 — saran thumbnail dari topik yang lagi HANGAT.
 * Bukan template asal: pakai tag audiens (emoji/label dari Trend Radar)
 * + kata kunci trend → teks overlay pendek, palet warna, dan prompt gambar
 * Inggris siap tempel ke Thumb Studio / API gambar.
 * Murni klien & offline.
 */

import { tok } from "./yie-score";
import type { TrendTags } from "./trend-radar";

export type SaranThumbnail = {
  overlay: string; // teks pendek di thumbnail (2-4 kata, UPPERCASE)
  warna: string; // palet dominan (hex)
  prompt: string; // prompt Inggris siap pakai untuk generate gambar
  alasan: string;
};

const STOP_EXTRA = new Set(["dan", "yang", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "pada", "the", "of", "in", "live"]);

function kataKunci(trend: string): string {
  const words = tok(trend).filter((w) => !STOP_EXTRA.has(w));
  const pick = words.slice(0, 3).join(" ");
  return pick || String(trend || "").trim().split(/\s+/)[0] || "Topik";
}

export function saranThumbnail(trend: string, tags: TrendTags): SaranThumbnail {
  const kw = kataKunci(trend);
  const upper = kw.toUpperCase().slice(0, 28);

  if (tags.emoji === "👻") {
    return {
      overlay: `JANGAN ${upper.slice(0, 20)}`,
      warna: "#0b0b12",
      prompt: `dark horror thumbnail, ${kw}, creepy silhouette, dim moonlight, fog, high contrast, dramatic, cinematic, text space on right side, horror vibe`,
      alasan: "Trend horor → gelap + teks larangan (pola CTR tinggi di niche horor).",
    };
  }
  if (tags.emoji === "🎧") {
    return {
      overlay: `${upper} FULL BASS`,
      warna: "#8b5cf6",
      prompt: `neon DJ thumbnail, ${kw}, glowing purple and cyan lights, speaker bass, party energy, vibrant, text space, YouTube thumbnail style`,
      alasan: "Trend DJ → neon + energi (penonton musik remix).",
    };
  }
  if (tags.emoji === "💔" || tags.emoji === "👨‍👩‍👧") {
    return {
      overlay: upper || "RINDU",
      warna: "#f59e0b",
      prompt: `emotional close-up portrait, ${kw}, warm golden light, tears in eyes, soft cinematic bokeh, heartfelt, text space on right, YouTube thumbnail`,
      alasan: "Trend emosional → wajah emosi besar + cahaya hangat (kartu audiens VERVE).",
    };
  }
  return {
    overlay: upper || "WAJIB TONTON",
    warna: "#19c2b8",
    prompt: `vibrant curiosity thumbnail, ${kw}, bold colors, clear subject, high contrast, space for big text, YouTube thumbnail style`,
    alasan: "Trend umum → warna berani + subjek jelas biar beda dari ramai.",
  };
}
