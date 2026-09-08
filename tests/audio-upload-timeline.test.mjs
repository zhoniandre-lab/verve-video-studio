import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
let failed = 0;
function T(name, ok) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (!ok) failed++; }

T("batas lama 18MB tidak lagi menolak upload musik", !/if \(f\.size > 18 \* 1024 \* 1024\)/.test(page));
T("musik lokal masuk ke media vault", /const assetId = await putMediaAsset\(f, f\.name\)/.test(page));
const uploadBlock = page.match(/async function uploadMusic[\s\S]*?async function mixAudioUrls/)?.[0] || "";
T("musik lokal memakai Blob URL, bukan data URL besar", /const u = URL\.createObjectURL\(f\)/.test(uploadBlock) && !/readAsDataURL/.test(uploadBlock));
T("asset musik disimpan di snapshot", /musicUrl, musicAssetId, musicName/.test(page));
T("toolbar klip utama diringkas", /\["split", "pangkas", "hapus", "ganti", "teks", "stiker", "speed", "transisi"\]/.test(page));
T("fitur tambahan tetap tersedia lewat Lainnya", /clipMoreOpen[\s\S]*\["animasi", "efek", "gambarai", "audio", "dup", "geserkir", "geserkan"\]/.test(page));
T("preview memakai field speed yang sama dengan panel Speed", /const spdC = \(optCur as any\)\?\.speed/.test(page) && !/const spdC = \(optCur as any\)\?\.spd/.test(page));
T("render video memakai field speed yang sama", /\?\.\[slideIdx\]\?\.speed/.test(readFileSync(new URL("../src/lib/recorder.ts", import.meta.url), "utf8")));
T("klip video punya aksi pisahkan audio", /async function extractSelectedAudio/.test(page) && /case "audio": void extractSelectedAudio\(\)/.test(page));
T("satu video lokal mencoba mempertahankan audio otomatis", /ss\.length === 1 && !!ss\[0\]\.videoUrl && !musicUrl && !voiceUrl/.test(page));

if (failed) process.exit(1);
console.log("\n🎵🧼 Kontrak upload audio dan toolbar bersih hijau.");
