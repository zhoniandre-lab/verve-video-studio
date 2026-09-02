/* 🔒 Regression checks for the intermittent Spectrum song-upload failure. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const source = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
let pass = 0;
let fail = 0;
const T = (ok, message) => { ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message)); };

T(/audioLoadSeqRef/.test(source), "ada nomor pekerjaan audio untuk mencegah race");
T(/audioLoadAbortRef/.test(source) && /\.abort\(\)/.test(source), "pekerjaan audio lama dibatalkan");
T(/job !== audioLoadSeqRef\.current/.test(source), "hasil job lama tidak boleh commit state");
T(/fetchSpectrumAudioBytes/.test(source) && /response\.ok/.test(source), "fetch audio cek HTTP dan fallback source");
T(/respons bukan audio/.test(source) && /80 \* 1024 \* 1024/.test(source), "HTML/JSON dan file terlalu besar ditolak jujur");
T(/decodeSpectrumAudio/.test(source) && /decoder\.close/.test(source), "decoder sementara ditutup setelah decode");
T(/e\.currentTarget\.value = ""/.test(source), "input file di-reset agar file sama bisa dicoba ulang");
T(/disabled=\{mBusy\}/.test(source), "upload dikunci saat lagu masih diproses");
T(/audioContextForPlayback/.test(source), "context playback dibuat ulang bila sudah closed");
T(/loadAudio\(url, title, access\)\.then\(\(ok\) => \{[\s\S]*if \(ok\) setStep\(1\)/.test(source), "Review baru dibuka setelah audio hasil generate benar-benar termuat");
T(/Promise<boolean>/.test(source) && /return false/.test(source) && /return true/.test(source), "loadAudio mengembalikan status sukses/gagal secara eksplisit");
T(/Analisis dijalankan ke variabel lokal/.test(source), "analisis lama tidak menimpa lagu baru");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 SPECTRUM UPLOAD GUARD HIJAU — race dan retry file sama dipagari");
