/**
 * ⚡ VERVE KOMPETITOR RADAR v19.5 — tunjuk 3 kompetitor TERCEPAT di ladangmu
 * + pola judul mereka, biar kamu bisa belajar dari yang paling laku
 * (bukan dari yang kebetulan muncul pertama di pencarian).
 * Murni klien & offline — pakai data riset yang sudah ada (AnalyzedVideo.vpd).
 */

import { cap, ent, type AnalyzedVideo } from "./yie-score";

export type RadarItem = {
  video: AnalyzedVideo;
  tokens: string[]; // kata khas paling sering di judulnya (top 4)
  phrases: string[]; // frasa 2-3 kata paling sering (top 4)
  insight: string; // kalimat ringkas "kenapa dia kencang"
};

export type KompetitorRadar = {
  top: RadarItem[];
  polaBersama: { token: string; count: number }[]; // kata yang dipakai banyak kompetitor cepat
  ringkasan: string;
};

export function radarKompetitor(videos: AnalyzedVideo[], n = 3): KompetitorRadar {
  const sorted = (videos || [])
    .filter((v) => v.vpd > 0)
    .sort((a, b) => b.vpd - a.vpd)
    .slice(0, n);

  const top: RadarItem[] = sorted.map((v) => {
    const tokCnt = ent(cntOf(v.tokens || []));
    const phrCnt = ent(cntOf(v.phr || []));
    const insight =
      v.views > v.subs * 3
        ? `${fmt(v.vpd)} view/hari — bukti channel kecil bisa tembus (views ${Math.round((v.views / Math.max(1, v.subs)))}× subs).`
        : `${fmt(v.vpd)} view/hari, subs ${fmt(v.subs)} — pemain besar, pola judulnya patut dicontoh.`;
    return {
      video: v,
      tokens: tokCnt.slice(0, 4).map(([w]) => cap(w)),
      phrases: phrCnt.slice(0, 4).map(([p]) => cap(p)),
      insight,
    };
  });

  // Kata yang dipakai 2+ dari 3 kompetitor tercepat → sinyal pola bersama.
  const bersama = new Map<string, number>();
  top.forEach((t) => {
    new Set((t.video.tokens || []).map((w) => w.toLowerCase())).forEach((w) => {
      bersama.set(w, (bersama.get(w) || 0) + 1);
    });
  });
  const polaBersama = [...bersama.entries()]
    .filter(([, c]) => c >= 2 && c < top.length + 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token, count]) => ({ token: cap(token), count }));

  const ringkasan = top.length
    ? `3 kompetitor tercepat di ladang ini: ${top.map((t) => `"${truncate(String(t.video.title || "video tanpa judul"), 42)}"`).join(" · ")}.`
    : "Belum ada data kecepatan — jalankan riset dulu.";

  return { top, polaBersama, ringkasan };
}

function cntOf(arr: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  (arr || []).forEach((x) => { if (x && x.length > 1) m[x] = (m[x] || 0) + 1; });
  return m;
}
function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "jt";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "rb";
  return String(Math.round(n));
}
function truncate(s: string, n: number): string {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
