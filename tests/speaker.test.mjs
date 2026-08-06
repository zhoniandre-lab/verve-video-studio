// 📣🧪 UJI SPEAKER REAKTIF (v19.36) — jalankan: node tests/speaker.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/speaker.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { hitungFeatSpeaker, bpmDariBeatList } = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📣 Menguji fitur speaker reaktif");

// Envelope: 30 dtk hop 0.25 — keras di 5-15 dtk, pelan di luar, beat tiap 0.5 dtk di 5-10
const n = Math.round(30 / 0.25);
const peaks = new Array(n).fill(0.08);
for (let i = 0; i < n; i++) {
  const t = i * 0.25;
  if (t >= 5 && t < 10) peaks[i] = 0.7 * ((i % 2 === 0) ? 1 : 0.15);
  else if (t >= 10 && t < 15) peaks[i] = 0.5;
}
const beats = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5];

// 1. di puncak (t=6) → bass tinggi
const f1 = hitungFeatSpeaker(peaks, beats, 6);
T("bass tinggi di puncak", f1.bass > 0.6, `bass=${f1.bass.toFixed(2)}`);
// 2. di bagian pelan (t=2) → bass rendah
const f2 = hitungFeatSpeaker(peaks, beats, 2);
T("bass rendah di bagian pelan", f2.bass < 0.3, `bass=${f2.bass.toFixed(2)}`);
// 3. transisi (t≈5) → flux tinggi
const f3 = hitungFeatSpeaker(peaks, beats, 5.05);
T("flux tinggi di transisi keras", f3.flux > 0.5, `flux=${f3.flux.toFixed(2)}`);
// 4. beat tepat di t=6 → beat=1
const f4 = hitungFeatSpeaker(peaks, beats, 6);
T("beat tepat = 1", f4.beat === 1, `beat=${f4.beat}`);
// 5. di luar beat → beat=0
const f5 = hitungFeatSpeaker(peaks, beats, 12.3);
T("di luar beat = 0", f5.beat === 0, `beat=${f5.beat}`);
// 6. bpm dari daftar beat (0.5 dtk) = 120
T("bpmDariBeatList = 120", bpmDariBeatList(beats) === 120, `${bpmDariBeatList(beats)}`);
// 7. deterministik: panggil 2x hasil sama
const g1 = hitungFeatSpeaker(peaks, beats, 7.25);
const g2 = hitungFeatSpeaker(peaks, beats, 7.25);
T("deterministik (2x panggil sama)", JSON.stringify(g1) === JSON.stringify(g2));
// 8. nilai semua 0..1 (beat & bpm terpisah)
for (const [k, v] of Object.entries({ bass: f1.bass, rms: f1.rms, flux: f1.flux })) {
  if (typeof v === "number" && (v < 0 || v > 1)) { T(`${k} dalam 0..1`, false, String(v)); }
}
T("bass/rms/flux selalu 0..1", true);
// 9. kosong aman
const f6 = hitungFeatSpeaker([], [], 3);
T("peaks kosong → 0 tanpa error", f6.bass === 0 && f6.bpm === 0);
// 10. beat terakhir terdeteksi (t=9.5)
const f7 = hitungFeatSpeaker(peaks, beats, 9.5);
T("beat di akhir daftar terdeteksi", f7.beat === 1, `beat=${f7.beat}`);

if (gagal) { console.error(`\n💥 ${gagal} UJI SPEAKER GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI SPEAKER HIJAU — speaker reaktif siap!");
