/**
 * 🎯 VERVE TITLE GURU v19.20 — otak MENULIS judul baru dari pola yang TERBUKTI
 * tembus di channel sendiri + sesuai NICHE pilihan (Kisah & Lagu, Horor, DJ,
 * Tutorial, Keluarga, Religi, Kustom). Lalu menyaringnya:
 *   - jangan mirip judul yang pernah GAGAL (CTR <3% dalam 14 hari)
 *   - jangan kembar dengan judul yang sudah dipakai
 * Murni klien & offline — tanpa API, tanpa biaya, selalu ada.
 */

import { analyzeBrainPatterns, wordCount } from "./pattern-insight";
import { cap, clamp, jaccardSim, norm } from "./yie-score";
import { nicheById } from "./niche";
import type { BrainMemory } from "./yie-score";

export type GuruSuggestion = { title: string; score: number; alasan: string };

type Template = { label: string; needs: string[]; make: (kw: string, seed: number) => string };

const ANGKA = ["3", "5", "7"];

/* ===== Template default / Kisah & Lagu ===== */
const TEMPLATES_KISAH: Template[] = [
  { label: "angka", needs: ["angka"], make: (kw) => `${ANGKA[0]} ${kw} yang Bikin Nangis` },
  { label: "angka", needs: ["angka"], make: (kw) => `${ANGKA[1]} ${kw} Paling Menyentuh` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Kisah ${_kw} yang Tak Terlupakan` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Ternyata ${kw} Bisa Bikin Haru` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Jangan Nonton ${kw} Kalau Nggak Siap Nangis` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Ini Dia ${kw} yang Sering Dicari` },
  { label: "emosi", needs: ["emosi"], make: (kw) => `Rindu ${kw} Sampai Menangis` },
  { label: "emosi", needs: ["emosi"], make: (kw) => `Air Mata ${kw} di Malam Hari` },
  { label: "emosi", needs: ["emosi"], make: (kw) => `Maaf, ${kw} — Aku Baru Sadar` },
  { label: "emosi", needs: ["emosi"], make: (kw) => `Doa Terakhir untuk ${kw}` },
  { label: "ceritaLagu", needs: ["ceritaLagu"], make: (kw) => `${kw} | Cerita Jadi Lagu` },
  { label: "ceritaLagu", needs: ["ceritaLagu"], make: (kw) => `Lagu Sedih tentang ${kw}` },
  { label: "tanya", needs: ["tanya"], make: (kw) => `Kenapa ${kw} Selalu Bikin Haru?` },
  { label: "tanya", needs: ["tanya"], make: (kw) => `Apa yang Terjadi pada ${kw}?` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} yang Tak Terlupakan` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `Rindu ${kw}` },
  { label: "umum", needs: [], make: (_kw, seed) => `${ANGKA[seed % 3]} Hal tentang ${_kw} yang Jarang Disadari` },
  { label: "umum", needs: [], make: (kw) => `Kisah Nyata ${kw} dari Awal sampai Akhir` },
  { label: "umum", needs: [], make: (kw) => `${kw} — Dengarkan Sampai Habis` },
];

/* ===== Template per niche (v19.20) ===== */
const TEMPLATES_FAMILY: Template[] = [
  { label: "emosi", needs: ["emosi"], make: (kw) => `Kisah ${kw} yang Mengharukan` },
  { label: "emosi", needs: ["emosi"], make: (kw) => `Air Mata ${kw} di Malam Hari` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Kisah ${_kw} yang Menyentuh Hati` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Ternyata ${kw} Punya Kisah Ini` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} yang Tak Terlupakan` },
  { label: "umum", needs: [], make: (kw) => `${kw} — Kisah Keluarga Sejati` },
];

const TEMPLATES_HORROR: Template[] = [
  { label: "emosi", needs: ["emosi"], make: (kw) => `${kw} yang Bikin Merinding` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `JANGAN Nonton ${kw} Sendirian` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Kisah ${_kw} Paling Seram` },
  { label: "tanya", needs: ["tanya"], make: (kw) => `Apa yang Terjadi di ${kw}?` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} di Malam Hari` },
  { label: "umum", needs: [], make: (kw) => `${kw} — Kisah Nyata yang Bikin Bulu Kuduk` },
];

const TEMPLATES_DJ: Template[] = [
  { label: "umum", needs: [], make: (kw) => `${kw} FULL BASS Nonstop` },
  { label: "umum", needs: [], make: (kw) => `${kw} — DJ Viral Terbaru` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Jam ${_kw} Nonstop` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `${kw} yang Lagi Hits` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} Remix` },
  { label: "umum", needs: [], make: (kw) => `${kw} — Playlist Wajib` },
];

const TEMPLATES_TUTORIAL: Template[] = [
  { label: "umum", needs: [], make: (_kw, seed) => `Cara ${_kw} dalam ${ANGKA[seed % 3]} Menit` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Tips ${_kw} yang Jarang Diketahui` },
  { label: "tanya", needs: ["tanya"], make: (kw) => `Bagaimana Cara ${kw}?` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Rahasia ${kw} yang Belum Banyak Tahu` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} Mudah` },
  { label: "umum", needs: [], make: (kw) => `Tutorial ${kw} untuk Pemula` },
];

const TEMPLATES_MUSLIM: Template[] = [
  { label: "emosi", needs: ["emosi"], make: (kw) => `Kisah ${kw} yang Menyentuh Hati` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Ternyata ${kw} Seperti Ini dalam Islam` },
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Pelajaran dari ${_kw}` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} — Penyejuk Hati` },
  { label: "umum", needs: [], make: (kw) => `Nasihat tentang ${kw}` },
];

const TEMPLATES_CUSTOM: Template[] = [
  { label: "angka", needs: ["angka"], make: (_kw, seed) => `${ANGKA[seed % 3]} Hal tentang ${_kw} yang Jarang Disadari` },
  { label: "umum", needs: [], make: (kw) => `Kisah Nyata ${kw} dari Awal sampai Akhir` },
  { label: "penasaran", needs: ["penasaran"], make: (kw) => `Ternyata ${kw} Seperti Ini` },
  { label: "tanya", needs: ["tanya"], make: (kw) => `Kenapa ${kw} Begitu Penting?` },
  { label: "pendek", needs: ["pendek"], make: (kw) => `${kw} yang Tak Terlupakan` },
  { label: "umum", needs: [], make: (kw) => `${kw} — Wajib Tonton Sampai Habis` },
];

const NICHE_TEMPLATES: Record<string, Template[]> = {
  story_song: TEMPLATES_KISAH,
  family: TEMPLATES_FAMILY,
  horror: TEMPLATES_HORROR,
  dj: TEMPLATES_DJ,
  tutorial: TEMPLATES_TUTORIAL,
  muslim: TEMPLATES_MUSLIM,
  custom: TEMPLATES_CUSTOM,
};

function simTo(title: string, rows: { title?: string }[]): number {
  let max = 0;
  (rows || []).forEach((r) => {
    max = Math.max(max, jaccardSim(title, r.title || ""));
  });
  return max;
}

/** 🎯 v19.20: tambah parameter nicheId — template judul mengikuti niche pilihan. */
export function suggestTitlesFromBrain(keyword: string, brain: BrainMemory, n = 4, nicheId = "story_song"): GuruSuggestion[] {
  const kwRaw = String(keyword || "").trim();
  if (!kwRaw) return [];
  const kw = cap(kwRaw);
  const insight = analyzeBrainPatterns(brain);
  const winners = new Set(insight.top.map((p) => p.key));
  const hasData = insight.withCtr > 0;
  const failed = (brain.results || []).filter(
    (r) => r.ctr != null && r.ctr !== "" && Number(r.ctr) < 3 && Date.now() - (+r.time! || 0) < 14 * 864e5
  );
  const existing = brain.results || [];
  const templates = NICHE_TEMPLATES[nicheId] || TEMPLATES_KISAH;
  const niche = nicheById(nicheId);

  const seen = new Set<string>();
  const out: GuruSuggestion[] = [];
  let seed = 0;
  for (const tpl of templates) {
    if (tpl.needs.length && !tpl.needs.some((k) => winners.has(k))) continue;
    seed++;
    const title = tpl.make(kw, seed);
    const key = norm(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Saringan otak: jangan mirip judul yang pernah gagal / sudah dipakai.
    if (failed.length && simTo(title, failed) >= 0.5) continue;
    if (simTo(title, existing) >= 0.55) continue;

    let score = 50;
    if (winners.has(tpl.label)) score += 14;
    else if (!hasData) score += 5;
    const wc = wordCount(title);
    if (wc >= 4 && wc <= 8) score += 6;
    score += Math.max(0, Math.min(10, 10 - simTo(title, existing) * 12));

    const winLabel = insight.top.find((p) => p.key === tpl.label)?.label;
    const alasan = !hasData
      ? `Data channel masih sedikit — ini pola umum yang biasanya tembus (niche ${niche.label}).`
      : winLabel
        ? `Pola “${winLabel}” terbukti tembus di channelmu (CTR ${insight.top.find((p) => p.key === tpl.label)!.avgCtr}%).`
        : "Dari pola yang belum terbukti gagal di channelmu.";

    out.push({ title, score: clamp(score), alasan });
    if (out.length >= n * 2) break;
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
