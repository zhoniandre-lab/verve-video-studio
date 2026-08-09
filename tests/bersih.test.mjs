// 🧹🐛 UJI MODE BERSIH (v19.45.1) — aurora/shockwave/lingkar bass default MATI
// Jalankan: node tests/bersih.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧹 Menguji Mode Bersih (efek dekoratif default mati)");

// 1. State fx default SEMUA false (mode bersih)
T("state fx default semua false (bersih)", /useState<Record<string, boolean>>\(\{ aurora: false, shock: false, ring: false, stars: false \}\)/.test(src));
// 2. Blok aurora dibungkus if (fx.aurora)
T("aurora dibungkus fx.aurora", /if \(fx\.aurora\)/.test(src));
// 3. Bintang dibungkus fx.stars
T("bintang dibungkus fx.stars", /if \(fx\.stars\)/.test(src));
// 4. Lingkar bass dibungkus fx.ring
T("lingkar bass dibungkus fx.ring", /if \(fx\.ring\)/.test(src));
// 5. Shockwave dibungkus fx.shock
T("shockwave dibungkus fx.shock", /if \(fx\.shock\)/.test(src));
// 6. UI toggle efek ada
T("UI 'EFEK DEKORATIF OTOMATIS' ada", /EFEK DEKORATIF OTOMATIS/.test(src));
T("tombol 'Mode Bersih (matikan semua)' ada", /Mode Bersih \(matikan semua\)/.test(src));
T("tombol 'Nyalakan semua efek' ada", /Nyalakan semua efek/.test(src));
// 7. fx masuk dependency drawScene
T("fx masuk dependency drawScene", /textPos,\n    fx\]\);/.test(src));
// 8. preset simpan & muat fx
T("preset simpan fx", /textPos,\n        fx,\n      \};/.test(src));
T("preset muat fx", /if \(p\.fx\) setFx\(p\.fx\)/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI MODE BERSIH GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI MODE BERSIH HIJAU — hasil render BERSIH secara default!");
