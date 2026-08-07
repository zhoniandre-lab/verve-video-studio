// 🎛️🧪 UJI FFT FREKUENSI (v19.39) — spektrum render harus ikut frekuensi asli lagu
// Jalankan: node tests/fft.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/fft.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { hitungFreqFrames, freqAt, fftRadix2 } = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎛️ Menguji FFT frekuensi asli");

const SR = 44100, SEC = 6;
const ch0 = new Float32Array(SR * SEC);
// 0-2s: bass 90Hz · 2-4s: mid 440Hz · 4-6s: treble 3000Hz (amplitudo sama 0.6)
for (let i = 0; i < ch0.length; i++) {
  const t = i / SR;
  const f = t < 2 ? 90 : t < 4 ? 440 : 3000;
  ch0[i] = 0.6 * Math.sin(2 * Math.PI * f * t);
}
const fr = hitungFreqFrames(ch0, null, SR, 10, 128, 2048);
T("jumlah frame = durasi × fps", fr.frames.length === Math.ceil(6 * 10), `${fr.frames.length} frame`);
T("tiap frame 128 bins", fr.frames.every((f) => f.length === 128));

// bin ke frekuensi: binWidth = (SR/2)/128 ≈ 172 Hz (setara AnalyserNode 128 bin @44100)
const binHz = SR / 2 / 128; // ≈ 172
function energiRendah(fr2, t) { const a = freqAt(fr2, t); let s = 0; for (let i = 0; i < 8; i++) s += a[i]; return s; }
function energiAtas(fr2, t) { const a = freqAt(fr2, t); let s = 0; for (let i = 60; i < 100; i++) s += a[i]; return s; }

// t=1 (bass 90Hz → bin ≈0) → energi rendah TINGGI, atas RENDAH
const eLowBass = energiRendah(fr, 1);
const eHighBass = energiAtas(fr, 1);
T("bass: energi bin rendah tinggi", eLowBass > 300, `low=${eLowBass.toFixed(0)}`);
T("bass: energi bin atas rendah", eHighBass < 100, `high=${eHighBass.toFixed(0)}`);
// t=5 (treble 3000Hz → bin ≈17) → atas (60+) tetap rendah, tapi bin 15-20 tinggi
const aTreble = freqAt(fr, 5);
let eTreble = 0;
for (let i = 14; i < 22; i++) eTreble += aTreble[i];
T("treble: energi di bin ~17 tinggi", eTreble > 300, `bin17=${eTreble.toFixed(0)}`);
T("treble: energi bin rendah rendah", energiRendah(fr, 5) < 200, `low=${energiRendah(fr, 5).toFixed(0)}`);
// lerp: freqAt di tengah antara frame → nilai antara
const fA = freqAt(fr, 1.0), fB = freqAt(fr, 1.1);
const fMid = freqAt(fr, 1.05);
let sumA = 0, sumB = 0, sumM = 0;
for (let i = 0; i < 128; i++) { sumA += fA[i]; sumB += fB[i]; sumM += fMid[i]; }
T("lerp: nilai tengah antara dua frame", sumM >= Math.min(sumA, sumB) - 1 && sumM <= Math.max(sumA, sumB) + 1, `${sumA},${sumM},${sumB}`);
// deterministik
const fr2 = hitungFreqFrames(ch0, null, SR, 10, 128, 2048);
T("deterministik (2x hitung sama)", fr2.frames[3].every((v, i) => v === fr.frames[3][i]));
// fftRadix2: impuls → flat spectrum (uji fungsi dasar)
const re = new Float32Array(8); const im2 = new Float32Array(8);
re[0] = 1;
fftRadix2(re, im2);
let magSum = 0;
for (let i = 0; i < 8; i++) magSum += Math.sqrt(re[i] * re[i] + im2[i] * im2[i]);
T("fftRadix2: impuls → semua bin magnitude 1 (total 8)", Math.abs(magSum - 8) < 1e-6, magSum.toFixed(4));

if (gagal) { console.error(`\n💥 ${gagal} UJI FFT GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI FFT HIJAU — spektrum render sekarang ikut frekuensi asli lagu!");
