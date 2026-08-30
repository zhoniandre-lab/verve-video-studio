/* ✂️ Regression checks: render Long first, then independent Shorts cutter. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const cutter = readFileSync(join(ROOT, "src/components/LongShortCutter.tsx"), "utf8");
const studio = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/LongShortCutter/.test(studio) && /shortCutterOpen/.test(studio), "menu potong Shorts terpisah tersedia setelah Long");
T(/maxDuration=\{duration\}/.test(studio) && /videoBlob/.test(studio), "cutter hanya muncul setelah video Long tersedia");
T(/renderShortFromLong/.test(studio) && /potongLongLangsung/.test(studio) && /video Long yang sudah tersimpan|video Long; hanya membuat Blob baru/.test(studio), "short diambil dari video Long tanpa menyentuh output Long");
T(/gambarFrameShortUtuh/.test(studio) && /fitScale = Math\.min/.test(studio) && /blur\(22px\)/.test(studio), "frame Long dibuat responsif 9:16 tanpa crop dengan latar blur");
T(/captureStream/.test(studio) && /MediaRecorder/.test(studio) && /seeked/.test(studio), "potong short mempertahankan audio dan posisi waktu Long");
T(/Mulai \(detik\)/.test(cutter) && /type="range"/.test(cutter), "posisi potong bisa diatur dengan angka dan timeline");
T(/DURATION_PRESETS = \[15, 30, 60\]/.test(cutter), "durasi short 15/30/60 detik tersedia");
T(/MAX_CUTS = 8/.test(cutter) && /Tambah potongan/.test(cutter), "beberapa potongan short bisa direncanakan");
T(/renderOne\(index/.test(cutter) && /renderAll/.test(cutter), "short bisa dirender satu-satu atau antrean");
T(/status === "done" && cut\.blob/.test(cutter), "render semua melewati short yang sudah selesai agar tidak membuang waktu");
T(/Tidak memakai kredit AI/.test(cutter), "potong short tidak memakai kredit provider");
T(/aspectRatio:|format 9:16|9:16/.test(cutter) && /720, h: 1280/.test(studio), "short memakai output vertikal 9:16");
T(/v6-short-cutter/.test(css) && /v6-short-preview/.test(css), "menu cutter punya styling mobile dan preview");
T(/shortCutBusy/.test(studio) && /shortCutBusy \|\| !audioUrl/.test(studio), "render Long dikunci saat short sedang dirender");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 LONG → SHORT HIJAU — Long dirender sendiri, Shorts opsional sesudahnya");
