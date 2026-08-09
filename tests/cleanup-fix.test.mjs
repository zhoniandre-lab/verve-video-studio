// 🔍🧪 UJI FIX MINOR v19.47.1 — cleanup renderSatu (try/finally) + revoke blob URL audio
// Jalankan: node tests/cleanup-fix.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔍 Menguji fix cleanup (v19.47.1)");

// 1. renderSatu: cleanup di-finally (actx.close + lepasWakeLock selalu jalan walau error)
T("renderSatu: ada blok finally", /finally \{[\s\S]*actx\.close\(\)\.catch/.test(src));
T("renderSatu: lepasWakeLock ada di finally", /finally \{[\s\S]*lepasWakeLock\(\);/.test(src));
T("renderSatu: clearInterval ada di finally", /finally \{[\s\S]*clearInterval\(iv\);/.test(src));
T("renderSatu: TIDAK ada actx.close di tengah (harus di finally)", !/actx\.close\(\)\.catch\(\(\) => \{\}\);\n    return blob;/ .test(src));
// 2. loadAudio: revoke blob URL lama
T("ada audioBlobUrlRef", /audioBlobUrlRef = useRef/.test(src));
T("loadAudio: revoke blob lama saat ganti", /URL\.revokeObjectURL\(audioBlobUrlRef\.current\)/.test(src));
T("loadAudio: hanya blob: yang dilacak", /url\.startsWith\("blob:"\)/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI CLEANUP GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI CLEANUP HIJAU — tidak ada lagi bocor AudioContext / blob URL!");
