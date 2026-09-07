/* 🎤 Regression: Auto Lirik uses active buffer and keeps word-level timing. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const studio = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
const editing = readFileSync(join(ROOT, "src/lib/editing.ts"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/audioBufferToWavFile/.test(studio) && /if \(bufRef\.current\)/.test(studio), "Auto Lirik memprioritaskan audio buffer aktif, bukan URL CDN");
T(/const timedWords/.test(studio) && /autoWordsRef\.current = timedWords/.test(studio), "karaoke memakai timing per kata, bukan satu timing per baris");
T(/cinemagold/.test(editing) && /Cinema Gold/.test(editing), "template Cinema Gold tersedia");
T(/luxurymv/.test(editing) && /Luxury MV/.test(editing), "template Luxury MV tersedia");
T(/docuclean/.test(editing) && /Documentary/.test(editing), "template Documentary tersedia");
T(/cinemabox/.test(editing) && /Cinema Box/.test(editing), "template Cinema Box tersedia");
T(/neonlux/.test(editing) && /Neon Luxury/.test(editing), "template Neon Luxury tersedia");
T(/CC_TEMPLATES\.length/.test(studio), "katalog template baru otomatis masuk ke UI Spectrum");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 AUTO LIRIK + TEMPLATE PREMIUM HIJAU — buffer aktif, timing kata, dan gaya sinematik siap");
