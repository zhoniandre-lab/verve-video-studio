/**
 * 🧠 VERVE PATTERN INSIGHT v19.1 — otak "buka buku catatannya".
 * Dari brain.results (judul + CTR asli dari sync YouTube / lapor manual),
 * otak menemukan pola mana yang TEMBUS & mana yang GAGAL di channel sendiri:
 *   - judul pakai angka? kata tanya? kata emosi? pendek/panjang?
 * Semua dari hitungan nyata (rata-rata CTR per pola vs baseline), bukan ngarang.
 * Murni klien & offline — tidak ada API, tidak ada biaya.
 */

import type { BrainMemory, BrainResult } from "./yie-score";

export type PatternVerdict = "bagus" | "jelek" | "netral" | "kurang-data";

export type PatternStat = {
  key: string;
  label: string;
  n: number;
  avgCtr: number | null; // rata-rata CTR judul dengan pola ini (%)
  delta: number | null; // selisih vs baseline CTR channel (poin %)
  verdict: PatternVerdict;
  examples: string[];
};

export type BrainInsight = {
  n: number; // judul yang tercatat di otak
  withCtr: number; // yang punya angka performa
  baselineCtr: number | null; // rata-rata CTR semua judul berangka
  patterns: PatternStat[];
  top: PatternStat[]; // pola terbukti tembus (n>=2, delta>=+1.5)
  worst: PatternStat[]; // pola terbukti gagal (n>=2, delta<=-1.5)
  best: BrainResult | null;
  bestCtr: number | null;
  summary: string;
};

type Rule = { key: string; label: string; re?: RegExp; w?: (words: number) => boolean };

const RULES: Rule[] = [
  { key: "angka", label: "pakai ANGKA", re: /\d/ },
  { key: "angkaDepan", label: "angka di awal judul", re: /^\s*\d/ },
  { key: "tanya", label: "kata TANYA (apa/kenapa/cara)", re: /\b(apa|kenapa|mengapa|bagaimana|cara|berapa|kapan|di mana|siapa|kok)\b/i },
  { key: "emosi", label: "kata EMOSI (rindu/maaf/sedih)", re: /\b(rindu|ibu|ayah|mama|bunda|maaf|sedih|nangis|menangis|takut|hantu|doa|kehilangan|air mata|terlambat|haru|menyentuh|jangan pergi)\b/i },
  { key: "penasaran", label: "pola PENASARAN (ternyata/jangan)", re: /\b(ternyata|jangan|rahasia|ini dia|wajib|tanpa|akhirnya|baru tahu|stop)\b/i },
  { key: "pendek", label: "judul PENDEK (≤5 kata)", w: (w) => w <= 5 },
  { key: "sedang", label: "judul SEDANG (6–8 kata)", w: (w) => w >= 6 && w <= 8 },
  { key: "panjang", label: "judul PANJANG (9+ kata)", w: (w) => w >= 9 },
  { key: "ceritaLagu", label: "frasa “cerita jadi lagu”", re: /cerita jadi lagu/i },
];

export function wordCount(t: string): number {
  return String(t || "").trim().split(/\s+/).filter(Boolean).length;
}

export function analyzeBrainPatterns(brain: BrainMemory): BrainInsight {
  const rows = (brain.results || []).filter(
    (r) => r.ctr != null && r.ctr !== "" && Number.isFinite(Number(r.ctr))
  );
  const withCtr = rows.length;
  const baselineCtr = withCtr ? rows.reduce((a, r) => a + Number(r.ctr), 0) / withCtr : null;

  const acc: Record<string, { sum: number; n: number; examples: string[] }> = {};
  rows.forEach((r) => {
    const ctr = Number(r.ctr);
    const wc = wordCount(r.title || "");
    RULES.forEach((rule) => {
      const hit = rule.re ? rule.re.test(String(r.title || "")) : rule.w!(wc);
      if (!hit) return;
      const a = acc[rule.key] || (acc[rule.key] = { sum: 0, n: 0, examples: [] });
      a.sum += ctr;
      a.n++;
      if (a.examples.length < 2) a.examples.push(String(r.title || ""));
    });
  });

  const patterns: PatternStat[] = RULES.filter((rule) => acc[rule.key])
    .map((rule) => {
      const a = acc[rule.key];
      const avgCtr = a.sum / a.n;
      const delta = baselineCtr != null ? avgCtr - baselineCtr : null;
      const verdict: PatternVerdict =
        a.n < 2
          ? "kurang-data"
          : delta == null
            ? "netral"
            : delta >= 1.5
              ? "bagus"
              : delta <= -1.5
                ? "jelek"
                : "netral";
      return {
        key: rule.key,
        label: rule.label,
        n: a.n,
        avgCtr: Math.round(avgCtr * 10) / 10,
        delta: delta == null ? null : Math.round(delta * 10) / 10,
        verdict,
        examples: a.examples,
      };
    })
    .sort((x, y) => (y.delta ?? -999) - (x.delta ?? -999));

  const top = patterns.filter((p) => p.verdict === "bagus").slice(0, 3);
  const worst = patterns
    .filter((p) => p.verdict === "jelek")
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 3);

  const best = withCtr ? rows.reduce((a, b) => (Number(b.ctr) > Number(a.ctr) ? b : a)) : null;
  const bestCtr = best ? Number(best.ctr) : null;

  let summary = "";
  if (!withCtr) summary = "Belum ada angka performa di otak. Sync dari YouTube atau lapor performa dulu — setelah itu pola muncul sendiri.";
  else if (top.length) summary = `Paling tembus: ${top[0].label} — CTR ${top[0].avgCtr}% vs baseline ${Math.round(baselineCtr! * 10) / 10}%.`;
  else if (worst.length) summary = `Belum ada pola yang menonjol bagus. Yang jelas ${worst[0].label} cenderung gagal — coba pola lain.`;
  else summary = `Belum ada pola kuat (${withCtr} judul berangka). Makin sering sync, makin tajam polanya.`;

  return {
    n: (brain.results || []).length,
    withCtr,
    baselineCtr: baselineCtr != null ? Math.round(baselineCtr * 10) / 10 : null,
    patterns,
    top,
    worst,
    best,
    bestCtr: bestCtr != null ? Math.round(bestCtr * 10) / 10 : null,
    summary,
  };
}
