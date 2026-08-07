// 🎬🧪 UJI DURASI LONG SAAT DUAL RENDER (v19.39.1) — toggle 59 dtk tidak boleh motong Long
// Jalankan: node tests/dual-render-durasi.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1. Toggle "Potong maks 59 dtk" tidak memotong saat dualRender aktif
T("render: total Long pakai (shorts && !dualRender) — dual render = FULL", /\(shorts && !dualRender\) \? 59\.5/.test(src));
// 2. Info durasi di Ekspor juga konsisten
T("info Ekspor: durasi tampil juga pakai (shorts && !dualRender)", /fmtD\(Math\.min\(duration, \(shorts && !dualRender\) \? 59\.5 : duration\)\)/.test(src));
// 3. UI: ada catatan 'Nonaktif otomatis saat Dual Render'
T("UI: catatan 'Nonaktif otomatis saat Dual Render'", /Nonaktif otomatis saat Dual Render/.test(src));
// 4. Toggle masih ada (fitur single render tetap ada)
T("toggle Potong maks 59 dtk masih ada", /Potong maks 59 dtk/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI DURASI DUAL RENDER GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI DURASI DUAL RENDER HIJAU — Long FULL saat dual render!");
