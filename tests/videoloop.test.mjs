// 🔁🧪 v19.91 — LOOP VIDEO (auto/1×/2×/3×) + fix video latar tidak tampil
// Jalankan: node tests/videoloop.test.mjs
import { readFileSync } from "fs";

// 1) Fungsi murni dari src/lib/videoloop.ts
const src = readFileSync(new URL("../src/lib/videoloop.ts", import.meta.url), "utf8");
const i0 = src.indexOf("export function hitungKaliLoop");
const i1 = src.indexOf("export function durasiLoopTotal");
const i2 = src.indexOf("\n}\n", src.indexOf("durasiLoopTotal")) + 3;
if (i0 < 0 || i2 <= i0) { console.error("💥 videoloop.ts tak terbaca"); process.exit(1); }
let js = src.replace(/export type ModeLoopVideo[^;]*;/, "").slice(0, i2).replace(/export /g, "").replace(/: number/g, "").replace(/: ModeLoopVideo/g, "");
const F = new Function(`${js}; return { hitungKaliLoop, durasiLoopTotal };`)();

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔁 Menguji loop video (v19.91)");

/* ---- logika loop ---- */
T("video 10 dtk, lagu 100 dtk, auto → 10×", F.hitungKaliLoop(10, 100, "auto") === 10, `${F.hitungKaliLoop(10, 100, "auto")}×`);
T("video 10 dtk, lagu 25 dtk, auto → 3× (dibulatkan ke atas)", F.hitungKaliLoop(10, 25, "auto") === 3, `${F.hitungKaliLoop(10, 25, "auto")}×`);
T("video 10 dtk, 3× → 3", F.hitungKaliLoop(10, 100, "3") === 3);
T("video 10 dtk, 2× → 2", F.hitungKaliLoop(10, 100, "2") === 2);
T("video 10 dtk, 1× → 1", F.hitungKaliLoop(10, 100, "1") === 1);
T("total 3× video 10 dtk = 30 dtk", F.durasiLoopTotal(10, 100, "3") === 30);
T("total auto video 10 dtk lagu 100 dtk = 100 dtk", F.durasiLoopTotal(10, 100, "auto") === 100);
T("total auto video 10 dtk lagu 25 dtk = 30 dtk (cukup menutup)", F.durasiLoopTotal(10, 25, "auto") === 30);
T("video durasi 0 → aman (1×)", F.hitungKaliLoop(0, 100, "auto") === 1);
T("lagu 0 → auto = 1×", F.hitungKaliLoop(10, 0, "auto") === 1);

/* ---- pemasangan di Spectrum ---- */
const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
T("Spectrum import videoloop", /from "@\/lib\/videoloop"/.test(spec));
T("Spectrum pakai durasiLoopTotal di drawScene", /durasiLoopTotal\(vd, duration \|\| 0, videoLoop\)/.test(spec));
T("BUG LAMA HAPUS: tidak ada seek currentTime tiap frame", !/currentTime = vt/.test(spec));
T("video dipindah ke lapis DINAMIS (bukan bg cache)", /const vA = videoBgRef\.current, vB = videoBg2Ref\.current/.test(spec) && !/f % BG_EVERY/.test(spec));
T("freeze di frame terakhir kalau jatah habis", /jatah loop habis → freeze di frame terakhir/.test(spec));
T("video tetap jalan kalau masih dalam jatah", /if \(vCur\.paused\) vCur\.play\(\)\.catch/.test(spec));
T("video play kalau paused (anti-hilang)", /if \(vCur\.paused\) vCur\.play\(\)\.catch/.test(spec));
T("upload video TIDAK menimpa lagu yang sudah ada", /sudahAdaLagu/.test(spec) && /if \(sudahAdaLagu\)/.test(spec) && !/void loadAudio\(url, nama\); \/\/ spektrum & lirik ikut audio video/.test(spec));
T("UI pilihan loop ada (auto/1x/2x/3x)", /LOOP VIDEO/.test(spec) && /\[\["auto"/.test(spec));
T("UI tampilkan hitungan durasi loop", /hitungKaliLoop\(videoDur, duration, videoLoop\)/.test(spec));
T("videoLoop tersimpan di preset", /videoLoop, \/\/ 🔁 v19.91/.test(spec) && /setVideoLoop\(p\.videoLoop\)/.test(spec));

if (gagal) { console.error(`\n💥 ${gagal} UJI LOOP VIDEO GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LOOP VIDEO HIJAU");
