import { readFileSync } from "node:fs";

const recorder = readFileSync(new URL("../src/lib/recorder.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
let failed = 0;
function T(name, ok, info = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) failed++;
}

T("logo promise tidak tertukar dengan preload sticker video", /const \[imgs, audio, _stickerImgs, _stickerVids, logoImg\]/.test(recorder));
T("audio WebCodecs punya backpressure", /while \(\(audioEncoder as any\)\.encodeQueueSize > 40\)/.test(recorder));
T("recorder memiliki target OPFS", /FileSystemWritableFileStreamTarget/.test(recorder) && /fileSink \?/.test(recorder));
T("render panjang Editor membuka OPFS", /diskRender = await bukaEditorRenderDisk/.test(page));
T("render panjang menolak fallback RAM bila storage tidak ada", /Render panjang membutuhkan storage browser\/OPFS/.test(page));
T("Editor meneruskan fileSink ke recorder", /fileSink: diskRender \|\| undefined/.test(page));
T("OPFS sementara dibersihkan setelah Blob dibaca", /finishedDisk\.remove\(\)/.test(page));
T("OPFS dibatalkan dan dibersihkan saat gagal", /await failedDisk\.abort\(\);[\s\S]*await failedDisk\.remove\(\);/.test(page));

if (failed) process.exit(1);
console.log("\n🛡️ Semua kontrak stabilitas render hijau.");
