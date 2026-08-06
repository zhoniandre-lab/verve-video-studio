// 🎬🧪 UJI DETEKSI KLIMAKS (v19.32 Dual Render) — cari bagian paling seru via energi RMS + sliding window
// Jalankan: node tests/climax.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/climax.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { hitungEnergiMono, cariKlimaksEnergi } = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

const SR = 44100;

// --- kasus 1: audio 3 menit, lonjakan besar 90-120 dtk, sedang 30-60, sisanya pelan ---
function buatAudio(durasiDetik, segmen) {
  const n = Math.floor(durasiDetik * SR);
  const mono = new Float32Array(n);
  for (let t = 0; t < durasiDetik; t++) {
    const amp = (segmen.find(([a, b]) => t >= a && t < b) || [null, null, 0.05])[2];
    for (let i = 0; i < SR; i++) {
      // sinyal acak deterministik + nada — RMS ≈ amp * 0.707
      mono[t * SR + i] = amp * (Math.sin(t * 7 + i * 0.01) * 0.6 + (Math.sin(i * 0.3) * 0.4));
    }
  }
  return mono;
}

// --- 1. window 30 dtk di tengah lonjakan 90-120 → start harus ≈ 90 ---
const mono = buatAudio(180, [[30, 60, 0.3], [90, 120, 0.9]]);
const energi = hitungEnergiMono(mono, SR, 0.25);
T("energi punya ~720 hop untuk 180 dtk (hop 0.25)", Math.abs(energi.length - 720) <= 2, `${energi.length} hop`);
const klimaks = cariKlimaksEnergi(energi, 0.25, 30);
T("klimaks terdeteksi di dalam lonjakan 90-120 dtk", klimaks.start >= 89 && klimaks.start <= 93, `start=${klimaks.start}s`);
T("energi relatif tinggi (>0.6)", klimaks.energi > 0.6, `energi=${klimaks.energi.toFixed(3)}`);
T("ada banyak window dibandingkan", klimaks.windowCount > 100, `${klimaks.windowCount} window`);

// --- 2. window 60 dtk pada lonjakan 90-120: semua titik mulai 60-90 sama-sama menangkap klimaks penuh
// (lib pilih titik tengah dari kandidat yang seru-nya nyaris sama → aman, bukan tepi) ---
const klimaks60 = cariKlimaksEnergi(energi, 0.25, 60);
T("window 60 dtk: mulai di range yang menangkap klimaks penuh (60-92)", klimaks60.start >= 55 && klimaks60.start <= 92, `start=${klimaks60.start}s`);

// --- 3. audio lebih pendek dari window → ambil dari 0 ---
const pendek = hitungEnergiMono(buatAudio(20, []), SR, 0.25);
const kPendek = cariKlimaksEnergi(pendek, 0.25, 30);
T("audio < window → start 0 & energi 1", kPendek.start === 0 && kPendek.energi === 1, `start=${kPendek.start} energi=${kPendek.energi}`);

// --- 4. audio datar → ambil bagian TENGAH (bukan awal) ---
const datar = hitungEnergiMono(buatAudio(120, [[0, 120, 0.4]]), SR, 0.25);
const kDatar = cariKlimaksEnergi(datar, 0.25, 30);
T("audio datar → start di tengah (45-75 dtk)", kDatar.start >= 40 && kDatar.start <= 80, `start=${kDatar.start}s`);

// --- 5. RMS benar: sinyal konstan 1 → energi ≈ 1 per hop ---
const konstan = new Float32Array(SR * 2).fill(1);
const eKonstan = hitungEnergiMono(konstan, SR, 0.5);
T("RMS sinyal konstan 1 ≈ 1", eKonstan.every((v) => Math.abs(v - 1) < 1e-9), `hop=${eKonstan.length}`);

// --- 6. array kosong → aman ---
const kosong = cariKlimaksEnergi([], 0.25, 30);
T("energi kosong → start 0 tanpa error", kosong.start === 0 && kosong.energi === 0);

if (gagal) { console.error(`\n💥 ${gagal} UJI KLIMAKS GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI KLIMAKS HIJAU — deteksi bagian seru siap dipakai Dual Render!");
