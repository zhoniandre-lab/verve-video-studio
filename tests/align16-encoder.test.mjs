// ⚡🧪 v19.75 — canvas harus kelipatan 16 + mesin offline pakai probe HW
// Jalankan: node tests/align16-encoder.test.mjs
import { readFileSync } from "fs";

const srcTs = readFileSync(new URL("../src/lib/render-offline.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
/** salinan murni dari src/lib/render-offline.ts — diuji tanpa transpile */
function align16(n) { return Math.max(16, Math.round(n / 16) * 16); }

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

T("align16(1080) = 1088 (bukan 1080 — macroblock H.264)", align16(1080) === 1088, String(align16(1080)));
T("align16(720) = 720", align16(720) === 720);
T("align16(1280) = 1280", align16(1280) === 1280);
T("align16(608) = 608", align16(608) === 608);
T("align16(1) = 16 (lantai)", align16(1) === 16);
T("align16(24) = 16 atau 32 (round)", align16(24) === 16 || align16(24) === 32, String(align16(24)));

T("render-offline: encode pakai pilihConfigVideo", /pilihConfigVideo\(cw, ch, fps, bitrate\)/.test(srcTs));
T("render-offline: canvas align16 setelah turbo", /align16\(Math\.max\(160, Math\.round\(W \* turbo\)\)\)/.test(srcTs));
T("render-offline: prefer-hardware dulu", /prefer-hardware/.test(srcTs));
T("render-offline: freqAt reuse buffer", /freqAt\(o\.freqFrames, t, freqBuf/.test(srcTs));
T("render-offline: skip benchmark 30 frame", !/const BENCH = 30/.test(srcTs));
T("render-offline: yield tiap 64 frame", /\(f & 63\) === 0/.test(srcTs));

T("studio: 16:9 = 1280×720", /ratio === "9:16" \? \{ w: 720, h: 1280 \} : \{ w: 1280, h: 720 \}/.test(studio));
T("studio: short dual 720×1280 (bukan 608×1080)", /w: 720, h: 1280/.test(studio) && !/w: 608, h: 1080/.test(studio));
T("studio: turbo default true", /const \[turbo, setTurbo\] = useState\(true\)/.test(studio));
T("studio: fps default 24", /useState<24 \| 25 \| 30>\(24\)/.test(studio));
T("studio: drawScene punya mode cepat", /cepat\?: boolean/.test(studio));
T("studio: preview rAF berhenti saat render", /renderingRef\.current/.test(studio));

if (gagal) { console.error(`\n💥 ${gagal} UJI ALIGN16/ENCODER GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI ALIGN16 + ENCODER HIJAU");
