// 🎵🧪 v19.77 — dua variasi Suno JANGAN digabung jadi 1 file dua nada
// Jalankan: node tests/suno-klip.test.mjs
import { readFileSync } from "fs";

const norm = readFileSync(new URL("../src/lib/suno-normalize.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎵 Menguji pemisah klip lagu (anti-gabung dua nada)");

/* ---- salinan murni dari suno-normalize (tanpa transpile) ---- */
const KEY_AUDIO_UTAMA = ["audio_url", "audioUrl"];
const KEY_AUDIO_STREAM = ["stream_url", "streamUrl", "streamAudioUrl"];
function urlAudioDariObj(o) {
  if (!o || typeof o !== "object") return "";
  const bagus = (v) => typeof v === "string" && /^https?:\/\//.test(v) && !/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(v);
  for (const k of KEY_AUDIO_UTAMA) { if (bagus(o[k])) return o[k]; }
  for (const k of KEY_AUDIO_STREAM) { if (bagus(o[k])) return o[k]; }
  return "";
}
function objekLagu(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  return KEY_AUDIO_UTAMA.some((k) => typeof o[k] === "string") || KEY_AUDIO_STREAM.some((k) => typeof o[k] === "string");
}
function ambilKlipLagu(root) {
  const clips = [];
  const seenUrl = new Set();
  const seenId = new Set();
  const push = (o) => {
    const url = urlAudioDariObj(o);
    if (!url) return;
    const id = String(o.id || o.clip_id || o.clipId || o.song_id || o.songId || "");
    if (id && seenId.has(id)) return;
    if (seenUrl.has(url)) return;
    if (id) seenId.add(id);
    seenUrl.add(url);
    clips.push({ url, title: o.title, duration: Number(o.duration) > 0 ? Number(o.duration) : undefined, id: id || undefined });
  };
  const walk = (o, dalem = 0, seen) => {
    if (!o || typeof o !== "object" || dalem > 8) return;
    const cakup = seen || new Set();
    if (cakup.has(o)) return;
    cakup.add(o);
    if (Array.isArray(o)) {
      const lagu = o.filter(objekLagu);
      if (lagu.length) { for (const it of lagu) push(it); return; }
      for (const it of o) walk(it, dalem + 1, cakup);
      return;
    }
    for (const k of ["sunoData", "songs", "clips", "tracks"]) {
      if (Array.isArray(o[k])) walk(o[k], dalem + 1, cakup);
    }
    if (objekLagu(o)) push(o);
    for (const k of Object.keys(o)) {
      if (k === "sunoData" || k === "songs" || k === "clips" || k === "tracks") continue;
      walk(o[k], dalem + 1, cakup);
    }
  };
  walk(root);
  return clips;
}

const kie2 = {
  response: {
    sunoData: [
      { id: "a", audioUrl: "https://cdn/a.mp3", title: "Lagu A", duration: 240, streamUrl: "https://cdn/a-stream.mp3" },
      { id: "b", audioUrl: "https://cdn/b.mp3", title: "Lagu B", duration: 238, streamUrl: "https://cdn/b-stream.mp3" },
    ],
  },
};
const clips = ambilKlipLagu(kie2);
T("2 item sunoData = 2 klip (bukan 4 URL stream+audio)", clips.length === 2, String(clips.length));
T("utamakan audioUrl, bukan stream", clips[0].url === "https://cdn/a.mp3" && clips[1].url === "https://cdn/b.mp3");
T("tiap klip punya id sendiri", clips[0].id === "a" && clips[1].id === "b");
T("durasi = lagu pertama, bukan jumlah 240+238", clips[0].duration === 240);

const satu = ambilKlipLagu({ data: [{ audio_url: "https://x/1.mp3", duration: 360 }] });
T("1 klip tetap 1", satu.length === 1 && satu[0].url === "https://x/1.mp3");

const dupe = ambilKlipLagu({
  sunoData: [
    { id: "z", audio_url: "https://z/1.mp3" },
    { id: "z", audio_url: "https://z/1.mp3" },
  ],
});
T("duplikat id/url tidak jadi 2 lagu", dupe.length === 1);

const imgBukan = ambilKlipLagu({ image_url: "https://cdn/cover.jpg", title: "x" });
T("gambar cover bukan klip lagu", imgBukan.length === 0);

/* ---- sumber produksi: fungsi & larangan gabung ---- */
T("normalize ekspor ambilKlipLagu", /export function ambilKlipLagu/.test(norm));
T("normalize ekspor pilihKlipDariHasil", /export function pilihKlipDariHasil/.test(norm));
T("normalize isi field clips", /clips,/.test(norm) && /clips\?: KlipLagu/.test(norm));
T("normalizeGeneric pakai clipsDariRespons (MusicAPI)", /function normalizeGeneric[\s\S]*clipsDariRespons/.test(norm));
T("SunoStudio UI versi A/B", /Versi A/.test(studio) && /Versi B/.test(studio));
T("SunoStudio pakai pilihKlipDariHasil", /pilihKlipDariHasil/.test(studio));
T("SunoStudio TIDAK gabungUrlAudio variasi", !/gabungUrlAudio/.test(studio));
T("SunoStudio ada mode 1 lagu / 2 pilihan", /modeHasil/.test(studio) && /2 pilihan terpisah/.test(studio));
T("SunoStudio simpan urls: [url] terpilih", /urls: \[url\]/.test(studio));
T("Spectrum TIDAK gabung hasil Suno", !/gabungUrlAudio/.test(spec));
T("Spectrum pakai url terpilih saja", /JANGAN gabung/.test(spec));
T("Lahan laguUtuh pakai pilihKlipDariHasil", /pilihKlipDariHasil/.test(lahan));
T("Lahan TIDAK gabungUrlAudio lagu", !/gabungUrlAudio/.test(lahan));
T("Editor terimaLaguAI pakai pilihKlipDariHasil", /pilihKlipDariHasil/.test(page));
T("Editor TIDAK import gabungUrlAudio", !/gabungUrlAudio/.test(page));
T("SunoPanel pakai pilihKlipDariHasil", /pilihKlipDariHasil/.test(panel));

if (gagal) { console.error(`\n💥 ${gagal} UJI KLIP LAGU GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI KLIP LAGU HIJAU — 2 variasi tetap terpisah");
