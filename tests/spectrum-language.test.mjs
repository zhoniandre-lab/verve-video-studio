/* 🌍 Test bahasa Auto Lirik Spectrum — source language dropdown global. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const studio = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
const langsPath = join(ROOT, "src/lib/whisper-languages.ts");
const langs = readFileSync(langsPath, "utf8");
let pass = 0;
let fail = 0;
const T = (ok, msg) => { ok ? (pass++, console.log("✅", msg)) : (fail++, console.log("❌", msg)); };

T(existsSync(langsPath), "katalog bahasa Whisper ada");
T(/WHISPER_LANGUAGES/.test(studio), "Spectrum memakai katalog bahasa global");
T(/<select/.test(studio) && /value=\{transLang\}/.test(studio), "pilihan bahasa memakai dropdown");
T(/code: "hi"/.test(langs) && /Hindi \(India\)/.test(langs), "Hindi India tersedia");
T(/code: "tr"/.test(langs) && /Turkish/.test(langs), "Turki tersedia");
T(/code: "ar"/.test(langs) && /Arab/.test(langs), "Arab tersedia");
T(/code: "id"/.test(langs) && /Bahasa Indonesia/.test(langs), "Indonesia tersedia");
T(/code: "en"/.test(langs) && /code: "zh"/.test(langs) && /code: "sw"/.test(langs), "bahasa global utama tersedia");
T(/transcribeBlobBesar\(blob, "", bahasaLagu\)/.test(studio), "bahasa dropdown diteruskan ke Whisper");
T(!/const aksaraAneh/.test(studio), "lirik Arab/Hindi/Kiril tidak lagi dibuang oleh filter script lama");
T(/disabled=\{lyrBusy\}/.test(studio), "dropdown dikunci saat proses agar tidak race");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 SPECTRUM LANGUAGE HIJAU — Auto Lirik punya dropdown bahasa dunia");
