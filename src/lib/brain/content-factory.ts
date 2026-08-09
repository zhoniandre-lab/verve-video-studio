/**
 * 📅 VERVE CONTENT FACTORY v19.9 — "pabrik konten 7 hari" (ilmu automation ala OSINT).
 * Otak menyusun rencana 7 slot konten sekaligus:
 *   - topik dari trend yang 🆕/🌊 naik & cocok niche (atau pola tembus channelmu)
 *   - judul saran dari Title Guru (pola terbukti) + prediksi CTR
 *   - jam upload dari jadwal golden-hour channelmu
 * Murni klien & offline. Setiap slot bisa "Isi ke Lahan" (satu klik mulai produksi).
 */

import { jadwalUpload } from "./deep-dive";
import { analyzeBrainPatterns } from "./pattern-insight";
import { suggestTitlesFromBrain } from "./title-guru";
import { cocokNiche, type TrendGelombang, type TrendItem } from "./trend-radar";
import type { BrainMemory } from "./yie-score";

export type SlotKonten = {
  index: number;
  tanggal: string;
  hari: string;
  jendela: string;
  hoki: boolean;
  topik: string;
  sumberTopik: "trend-naik" | "trend-cocok" | "pola-tembus" | "umum";
  judul: string;
  predCtr: number;
  alasan: string;
};

export function rencanaKonten(brain: BrainMemory, trends: TrendItem[], gelombang: TrendGelombang[] | null, n = 7, nicheId = "story_song"): SlotKonten[] {
  const jadwal = jadwalUpload(brain, n);
  const ins = analyzeBrainPatterns(brain);

  // 1) Sumber topik: prioritaskan trend yang NAIK/BARU & cocok niche, lalu trend cocok, lalu pola tembus.
  const trendNaikCocok = (gelombang || [])
    .filter((g) => (g.status === "naik" || g.status === "baru") && cocokNiche(g.title, nicheId))
    .map((g) => ({ topik: g.title, src: "trend-naik" as const, alasan: `${g.status === "naik" ? "🌊 naik" : "🆕 baru"} & cocok niche` }));
  const trendCocok = (trends || [])
    .filter((t) => cocokNiche(t.title, nicheId))
    .map((t) => ({ topik: t.title, src: "trend-cocok" as const, alasan: `cocok niche terpilih` }));
  const polaTembus = ins.top[0]
    ? [{ topik: `${ins.top[0].label.replace("pakai ", "").replace("kata ", "")} — pola tembus channelmu`, src: "pola-tembus" as const, alasan: `CTR ${ins.top[0].avgCtr}% (${ins.top[0].n} judul)` }]
    : [];
  const umum = [{ topik: brain.results?.[0]?.title || "Topik terbaik dari otakmu", src: "umum" as const, alasan: "lanjutan topik yang sudah dipelajari" }];
  const pool = [...trendNaikCocok, ...trendCocok, ...polaTembus, ...umum];

  const slots: SlotKonten[] = [];
  for (let i = 0; i < n; i++) {
    const s = jadwal.slots[i];
    const src = pool[i % pool.length] || { topik: `Ide konten #${i + 1}`, src: "umum" as const, alasan: "isi topik sendiri" };
    // Judul saran dari Title Guru pakai topik ini (pola tembus channel)
    const saran = suggestTitlesFromBrain(src.topik, brain, 1)[0];
    slots.push({
      index: i + 1,
      tanggal: s.tanggal,
      hari: s.hari,
      jendela: s.jendela,
      hoki: s.hoki,
      topik: src.topik,
      sumberTopik: src.src,
      judul: saran?.title || src.topik,
      predCtr: saran ? saran.score : 50,
      alasan: `Topik: ${src.alasan}. Judul: ${saran?.alasan || "pola umum"}.`,
    });
  }
  return slots;
}
