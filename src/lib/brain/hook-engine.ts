/**
 * 🪝 VERVE HOOK ENGINE v19.10 — "3 detik pertama penentu" (ilmu dari Short-Video
 * Coach & TikTok Strategist — agency-agents): visual hook wajib muncul dalam
 * 3 detik pertama, biasanya close-up / extreme close-up + emosi.
 *
 * Modul ini menganalisis ADEGAN pertama (dan semua adegan) di storyboard:
 *   - apakah prompt visualnya close-up? ada wajah? ada emosi (air mata)?
 *   - kalau wide shot / landscape → ⚠️ peringatan: hook lemah
 *   - kasih saran perbaikan + tombol "upgrade adegan 1"
 * Murni klien & offline — baca visual_prompt yang sudah dibuat AI.
 */

export type HookVerdict = "kuat" | "sedang" | "lemah";

export type HookAdegan = {
  scene: number;
  verdict: HookVerdict;
  skor: number; // 0..100
  alasan: string[];
};

export type HookAnalysis = {
  adegan1: HookAdegan | null;
  semua: HookAdegan[];
  ringkasan: string;
  saran: string[];
};

type SceneLike = { scene: number; visual_prompt?: string; scene_desc?: string; mood?: string };

/* Kamus kata kunci — dari bahasa prompt visual AI (umumnya Inggris) + Indonesia */
const KATA_CLOSEUP = ["close-up", "close up", "extreme close", "macro", "headshot", "wajah", "muka", "closeup", "tight shot", "portrait"];
const KATA_WIDE = ["wide shot", "wide angle", "establishing", "landscape", "long shot", "far away", "from afar", "drone", "aerial", "cityscape", "panorama"];
const KATA_EMOSI = ["tears", "crying", "menangis", "nangis", "air mata", "emotional", "rindu", "sedih", "touching", "berlinang", "haru", "mata", "eyes", "expression", "bergetar", "terharu", "sad", "melancholy"];
const KATA_WAJAH = ["face", "wajah", "muka", "eyes", "mata", "expression", "portrait", "headshot", "close-up", "close up", "smile", "senyum"];

function adaKata(teks: string, kamus: string[]): boolean {
  const t = String(teks || "").toLowerCase();
  return kamus.some((k) => t.includes(k));
}

/** Analisis satu adegan: apakah prompt visualnya punya hook kuat (close-up + emosi). */
export function analisaAdegan(sc: SceneLike): HookAdegan {
  const p = String(sc.visual_prompt || "");
  const d = String(sc.scene_desc || "");
  const teks = `${p} ${d}`;
  let skor = 30;
  const alasan: string[] = [];

  if (adaKata(teks, KATA_CLOSEUP)) { skor += 30; alasan.push("Close-up (fokus ke detail — bagus buat hook)"); }
  if (adaKata(teks, KATA_WAJAH)) { skor += 15; alasan.push("Ada wajah/ekspresi"); }
  if (adaKata(teks, KATA_EMOSI)) { skor += 20; alasan.push("Nuansa emosi (air mata/rindu/haru)"); }
  if (adaKata(teks, KATA_WIDE)) { skor -= 25; alasan.push("⚠️ Wide/landscape — hook lemah buat 3 detik pertama"); }

  // Adegan pembuka: wajah emosi close-up hampir wajib di niche cerita jadi lagu
  if (sc.scene === 1 && !adaKata(teks, KATA_CLOSEUP)) alasan.push("Adegan 1 belum close-up — penonton butuh wajah emosi dalam 3 detik");

  skor = Math.max(0, Math.min(100, skor));
  const verdict: HookVerdict = skor >= 75 ? "kuat" : skor >= 50 ? "sedang" : "lemah";
  return { scene: sc.scene, verdict, skor, alasan };
}

/** Analisis seluruh storyboard — fokus utama adegan 1. */
export function analisaHook(board: { scenes?: SceneLike[] } | null): HookAnalysis {
  const scenes = (board?.scenes || []) as SceneLike[];
  if (!scenes.length) return { adegan1: null, semua: [], ringkasan: "Belum ada storyboard — susun dulu.", saran: [] };
  const semua = scenes.map(analisaAdegan);
  const a1 = semua[0];
  const kuat = semua.filter((a) => a.verdict === "kuat").length;

  const saran: string[] = [];
  if (a1?.verdict !== "kuat") {
    saran.push("Adegan 1: ganti ke CLOSE-UP wajah dengan emosi (air mata / rindu / haru) — hook 3 detik pertama.");
    saran.push("Tambah cahaya hangat & ruang teks besar di kanan (pola thumbnail emosional VERVE).");
  }
  if (a1?.verdict === "lemah") saran.push("Kalau adegan 1 tetap wide shot, penonton kemungkinan besar skip — tekan 'upgrade adegan 1' di bawah.");

  let ringkasan: string;
  if (!a1) ringkasan = "Belum ada storyboard.";
  else if (a1.verdict === "kuat") ringkasan = `🪝 Adegan 1 KUAT (${a1.skor}/100) — close-up emosi, siap nangkep scroll.`;
  else if (a1.verdict === "sedang") ringkasan = `🪝 Adegan 1 SEDANG (${a1.skor}/100) — ada potensi, tapi bisa lebih nancap.`;
  else ringkasan = `🪝 Adegan 1 LEMAH (${a1.skor}/100) — hook 3 detik pertama belum aman!`;

  return { adegan1: a1, semua, ringkasan, saran };
}

/** Teks upgrade yang disuntik ke prompt visual adegan 1 (sesuai niche emosional). */
export function upgradeAdegan1(sc: SceneLike): string {
  const lama = String(sc.visual_prompt || "").trim();
  const tambah = "extreme close-up of emotional face, tears welling in eyes, warm golden light, soft bokeh, heartfelt, space for large text on right side";
  return lama ? `${lama}, ${tambah}` : tambah;
}
