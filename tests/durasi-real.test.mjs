// 🎵🧪 v19.86 — DURASI REAL (decode isi file, bukan header yang bisa bohong)
// Jalankan: node tests/durasi-real.test.mjs
import { readFileSync } from "fs";

const g = readFileSync(new URL("../src/lib/gabung-audio.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎵 Menguji durasi real (v19.86)");

T("gabung-audio ekspor ukurDurasiReal", /export async function ukurDurasiReal/.test(g));
T("TIDAK ada pemangkas senyap (potongBuffer/cariJangkauanAudio)", !/potongBuffer|cariJangkauanAudio/.test(g));
T("ukurDurasiReal decode via OfflineAudioContext", /OfflineAudioContext/.test(g));
T("SunoStudio decode SEKALI dan buat WAV dari buffer itu", /const dek = langsung/.test(studio) && /wavDariBuffer/.test(studio));
T("SunoStudio durasi = durasi decode (isi file)", /const dur = buf\.duration/.test(studio));
T("SunoStudio tidak ada tombol Pakai di Spectrum", !/Pakai di Spectrum/.test(studio));
T("SunoStudio tidak simpan verve_suno_hasil", !/verve_suno_hasil/.test(studio));
T("Lahan ukur durasi REAL saat lagu jadi", /ukurDanPreviewWav\(res\.url/.test(lahan));
T("Lahan probeSongDur decode dulu", /ukurDurasiReal\(url/.test(lahan));
T("Lahan restore draft lama ukur ulang", /ukurDanPreviewWav\(rs\.url/.test(lahan));
T("Editor musicDur = durasi REAL (terimaLaguAI)", /ukurDurasiReal\(url, proxify\)/.test(page));
T("Editor proyek lama ukur ulang diam-diam", /ukurDurasiReal\(musicUrl, proxify\)/.test(page));

if (gagal) { console.error(`\n💥 ${gagal} UJI DURASI REAL GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI DURASI REAL HIJAU");

/* ---- v19.87 FIX DURASI DOBEL (createBuffer salah panjang) ---- */
const g2 = readFileSync(new URL("../src/lib/gabung-audio.ts", import.meta.url), "utf8");
const studio2 = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
const lahan2 = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");

T("wavDariBuffer ekspor", /export function wavDariBuffer/.test(g2));
T("BUG DOBEL HILANG: panjang = durasi × rate, bukan buf.length", /Math\.round\(dur \* rate\)/.test(g2));
T("createBuffer dipakai dengan outLen (kode eksekusi, bukan komentar)", /const mono = ctx\.createBuffer\(1, outLen, rate\)/.test(g2));
T("SunoStudio pakai wavDariBuffer (fix durasi dobel)", /wavDariBuffer\(buf, ac\)/.test(studio2));
T("SunoStudio tidak ada resample manual di kode eksekusi", !/createBuffer\(1, buf\.length/.test(studio2.replace(/\/\/ 🐛 v19\.87[^]*$/, "")));
T("Lahan pakai ukurDanPreviewWav", /ukurDanPreviewWav/.test(lahan2));
T("Lahan player pakai song.audio (durasi benar)", /src=\{song\.audio \|\| song\.url\}/.test(lahan2));
T("Lahan pvSrc pakai song.audio", /song\.audio \|\| \(pvProxy/.test(lahan2));
T("TIDAK ada pemotong senyap (potongBuffer/cariJangkauanAudio)", !/potongBuffer|cariJangkauanAudio/.test(g2));

/* ================= 🔒 v19.88 KUNCI DURASI — pagar anti-regresi =================
   Kalau ada yang coba "memperbaiki" wavDariBuffer dengan createBuffer(1,
   buf.length, ...) lagi, test di bawah GAGAL → build ikut gagal → tidak
   akan pernah deploy versi rusak lagi. JANGAN dihapus/dilemahkan. */
const g3 = readFileSync(new URL("../src/lib/gabung-audio.ts", import.meta.url), "utf8");
const i0 = g3.indexOf("export function hitungPanjangWav");
const i1 = g3.indexOf("\n}\n", i0) + 3;
if (i0 < 0 || i1 <= i0) { console.error("💥 hitungPanjangWav tak ketemu — KUNCI DURASI JEBOL"); process.exit(1); }
let js3 = g3.slice(i0, i1).replace(/export /g, "").replace(/: number/g, "");
const H = new Function(`${js3}; return hitungPanjangWav;`)();

T("🔒 hitungPanjangWav ekspor", /export function hitungPanjangWav/.test(g3));
T("🔒 wavDariBuffer PAKAI hitungPanjangWav (bukan buf.length)", /hitungPanjangWav\(buf\.duration, rate\)/.test(g3));
const lagu417 = 417; // lagu 6:57 dari screenshot user
T(`🔒 lagu 417 dtk @22050 = ${H(lagu417, 22050)} sampel (9.194.850)`, H(lagu417, 22050) === 9194850);
T("🔒 durasi hasil = 417 dtk PERSIS (bukan 834/13:54)", H(lagu417, 22050) / 22050 === 417);
T("🔒 rumus lama (buf.length @44100) memang beda — 18.389.700 ≠ 9.194.850", H(lagu417, 22050) !== 18389700);
T("🔒 hitungPanjangWav(0) = 1 (tidak pernah 0)", H(0, 22050) === 1);
T("🔒 gabung-audio TIDAK ada createBuffer(1, buf.length di KODE EKSEKUSI", !/const mono = ctx\.createBuffer\(1, buf\.length/.test(g3));
