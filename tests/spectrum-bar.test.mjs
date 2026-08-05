// 🐛🧪 UJI BUG JUMLAH BAR (v19.17.1) — barsRef harus ≥ barCount maks & step ≥ 1
// Jalankan: node tests/spectrum-bar.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

T("barsRef ukuran ≥ 128 (bukan 64) — anti NaN saat bar=128", /new Float32Array\(128\)/.test(src), "cek ukuran");
T("step minimal 1 di perhitungan bars (anti bagi 0)", /Math\.max\(1, Math\.floor\(freq\.length \* 0\.72 \/ N\)\)/.test(src));
T("barCount slider maks 128", /max=\{128\}/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI SPECTRUM BAR GAGAL`); process.exit(1); }
