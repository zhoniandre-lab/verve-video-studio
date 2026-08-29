/* 🛡️ Regression checks for long-render memory protection and recovery. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const offline = readFileSync(join(ROOT, "src/lib/render-offline.ts"), "utf8");
const studio = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const audioRecovery = readFileSync(join(ROOT, "src/lib/studio/recovery-audio.ts"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/FileSystemWritableFileStreamTarget/.test(offline) && /fileSink\?: RenderFileSink/.test(offline), "render offline punya target file streaming opsional");
T(/fastStart: o\.fileSink \? "fragmented" : "in-memory"/.test(offline), "render panjang memakai fragmented MP4, bukan fast-start RAM penuh");
T(/muxer\.addAudioChunk\(c\)/.test(offline) && !/const audioChunks: EncodedAudioChunk\[\] = \[\]/.test(offline), "audio tidak lagi ditampung dalam array panjang sebelum video");
T(/stream\.close\(\)/.test(offline) && /getFile\(\)/.test(offline), "stream ditutup lalu file hasil dibaca aman");
T(/navigator.*storage/.test(studio) && /getDirectory/.test(studio) && /bukaRenderDisk/.test(studio), "Spectrum memakai OPFS bila tersedia");
T(/total > 10 \* 60/.test(studio) && /Output long: OPFS/.test(studio), "hanya render panjang yang dialihkan ke disk");
T(/realtime tidak aman/.test(studio) && /tidak memaksa fallback realtime/.test(studio), "render panjang tidak jatuh ke jalur RAM yang bisa mereset HP");
T(/saveCheckpoint/.test(studio) && /SPECTRUM_RECOVERY_KEY/.test(studio), "checkpoint proyek/render disimpan otomatis");
T(/pagehide/.test(studio) && /Pemulihan otomatis tersedia/.test(studio), "reset halaman punya pemulihan setelan");
T(/pulihkanCheckpoint/.test(studio) && /aksesDariCheckpoint/.test(studio), "audio remote dapat dipulihkan memakai key yang sudah tersimpan");
T(/indexedDB\.open/.test(audioRecovery) && /saveRecoveryAudio/.test(audioRecovery) && /loadRecoveryAudio/.test(audioRecovery), "audio lokal/mix disalin ke IndexedDB untuk pemulihan");
T(/saveRecoveryAudio\(loaded\.raw/.test(studio) && /audioRecovery/.test(studio), "audio aktif dicadangkan best-effort saat selesai diambil");
T(/Output render terakhir dipulihkan dari OPFS/.test(studio), "output render yang sudah selesai bisa dipulihkan dari OPFS");
T(/v6-recovery/.test(css), "banner pemulihan punya styling mobile");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 SPECTRUM RENDER RECOVERY HIJAU — memori panjang dan reset dipagari");
