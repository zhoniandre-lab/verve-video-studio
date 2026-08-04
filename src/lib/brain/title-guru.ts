/**
 * 🎯 VERVE TITLE GURU v19.1 — otak MENULIS judul baru dari pola yang TERBUKTI
 * tembus di channel sendiri (hasil analisis brain), bukan template asal.
 * Lalu menyaringnya dengan aturan yang sama dengan mesin skor:
 *   - jangan mirip judul yang pernah GAGAL (CTR <3% dalam 14 hari)
 *   - jangan kembar dengan judul yang sudah dipakai
 * Murni klien & offline — tanpa API, tanpa biaya, selalu ada.
 */

import { analyzeBrainPatterns, wordCount } from "./pattern-insight";
import { cap, clamp, jaccardSim, norm } from "./yie-score";
import type { BrainMemory } from "./yie-score";

export type GuruSuggestion = { title: string; score: number; alasan: string };

type Template = { label: string; needs: string[]; make: (kw: string, seed: number) => string };

const ANGKA = ["3", "5", "7"];

const TEMPLATES: Template[] = [
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

function simTo(title: string, rows: { title?: string }[]): number {
  let max = 0;
  (rows || []).forEach((r) => {
    max = Math.max(max, jaccardSim(title, r.title || ""));
  });
  return max;
}

export function suggestTitlesFromBrain(keyword: string, brain: BrainMemory, n = 4): GuruSuggestion[] {
  const kwRaw = String(keyword || "").trim();
  if (!kwRaw) return [];
  const kw = cap(kwRaw); // rapikan kapital: "ibu" → "Ibu", "cerita jadi lagu" → "Cerita Jadi Lagu"
  const insight = analyzeBrainPatterns(brain);
  const winners = new Set(insight.top.map((p) => p.key));
  const hasData = insight.withCtr > 0;
  const failed = (brain.results || []).filter(
    (r) => r.ctr != null && r.ctr !== "" && Number(r.ctr) < 3 && Date.now() - (+r.time! || 0) < 14 * 864e5
  );
  const existing = brain.results || [];

  const seen = new Set<string>();
  const out: GuruSuggestion[] = [];
  let seed = 0;
  for (const tpl of TEMPLATES) {
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
      ? "Data channel masih sedikit — ini pola umum yang biasanya tembus."
      : winLabel
        ? `Pola “${winLabel}” terbukti tembus di channelmu (CTR ${insight.top.find((p) => p.key === tpl.label)!.avgCtr}%).`
        : "Dari pola yang belum terbukti gagal di channelmu.";

    out.push({ title, score: clamp(score), alasan });
    if (out.length >= n * 2) break;
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
