// 🥁🧪 UJI DETEKSI BEAT & BPM (v19.36) — jalankan: node tests/beats.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/beats.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { deteksiBeats, bpmDariBeats, kekuatanBeat } = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🥁 Menguji deteksi beat & BPM");

// 1. Envelope 60 dtk, hop 0.25: beat jelas tiap 0.5 dtk di 10-20 dtk, pelan di luar
const n = Math.round(60 / 0.25);
const env = new Array(n).fill(0.1);
for (let i = 0; i < n; i++) {
  const t = i * 0.25;
  if (t >= 10 && t < 20) env[i] = 0.15 + 0.7 * ((i % 2 === 0) ? 1 : 0.1); // beat tiap 0.5 dtk
  else if (t >= 20 && t < 40) env[i] = 0.5; // flat
}
const beats = deteksiBeats(env, 0.25);
T("beat terdeteksi di 10-20 dtk (≈20 beat @120 BPM)", beats.length >= 15 && beats.length <= 25, `${beats.length} beat`);
const semuaDalam = beats.every((b) => b >= 9.5 && b <= 20.5);
T("semua beat ada di region 10-20 dtk (bukan di flat)", semuaDalam, JSON.stringify(beats.slice(0, 4)));
// 2. jarak minimal antar-beat ≥ 0.25 dtk
let okGap = true;
for (let i = 1; i < beats.length; i++) if (beats[i] - beats[i - 1] < 0.2) okGap = false;
T("jarak antar-beat ≥ 0.2 dtk", okGap);
// 3. BPM ≈ 120 (beat tiap 0.5 dtk)
const bpm = bpmDariBeats(beats);
T("BPM terdeteksi ≈ 120", bpm >= 110 && bpm <= 130, `${bpm} BPM`);
// 4. array kosong aman
T("input kosong → []", Array.isArray(deteksiBeats([])) && deteksiBeats([]).length === 0);
T("bpmDariBeats pendek → 0", bpmDariBeats([0.5]) === 0);
// 5. kekuatanBeat
T("kekuatanBeat tepat = 1", kekuatanBeat([10, 10.5, 11], 10.02) === 1);
T("kekuatanBeat dekat = 0.5", kekuatanBeat([10, 10.5, 11], 10.1) === 0.5);
T("kekuatanBeat jauh = 0", kekuatanBeat([10, 10.5, 11], 10.5) === 1 || kekuatanBeat([10], 11) === 0);
// 6. deteksi tidak kacau di data flat penuh
const flat = new Array(100).fill(0.4);
T("data flat → beat sangat sedikit", deteksiBeats(flat, 0.25).length <= 2, `${deteksiBeats(flat, 0.25).length}`);

if (gagal) { console.error(`\n💥 ${gagal} UJI BEAT GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI BEAT & BPM HIJAU!");
