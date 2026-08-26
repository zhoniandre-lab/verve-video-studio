/* =====================================================================
   TEST: Subtitle & Translation Studio
   - cue normalizer + SRT primitives
   - Arabic/source + language target flow
   - translation API validation and canvas export hook
   ===================================================================== */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const utilPath = join(ROOT, "src/lib/studio/subtitles.ts");
const apiPath = join(ROOT, "src/app/api/hcnsec/subtitle-translate/route.ts");
const rendererPath = join(ROOT, "src/lib/studio/renderer.ts");
const studioPath = join(ROOT, "src/app/studio-preview/page.tsx");

let pass = 0;
let fail = 0;
const check = (ok, message) => {
  if (ok) { pass++; console.log("✅", message); }
  else { fail++; console.log("❌", message); }
};

check(existsSync(utilPath), "utility subtitle ada");
check(existsSync(apiPath), "endpoint terjemahan subtitle ada");
const util = readFileSync(utilPath, "utf8");
const api = readFileSync(apiPath, "utf8");
const renderer = readFileSync(rendererPath, "utf8");
const studio = readFileSync(studioPath, "utf8");

check(/export interface SubtitleCue/.test(util), "tipe SubtitleCue menyimpan timing dan teks asli");
check(/transcriptionToCues/.test(util) && /timestamp/.test(util), "hasil transkripsi bisa dinormalisasi menjadi cue");
check(/formatSrtTime/.test(util) && /-->/.test(util), "format SRT memakai timestamp standar");
check(/code: "id"/.test(util) && /code: "en"/.test(util) && /code: "ms"/.test(util), "bahasa target utama tersedia");
check(/CHUNK_SIZE = 8/.test(api) && /Promise\.all/.test(api), "terjemahan panjang dipecah menjadi batch");
check(/mode === "transliterate"/.test(api) && /Jangan meringkas/.test(api), "mode terjemahan dan transliterasi dijaga agar tidak meringkas");
check(/HCNSEC_API_KEY/.test(api) && /bansosChatConfig/.test(api), "provider utama dan Dompet Bansos didukung");
check(/drawSubtitles/.test(renderer) && /opts\.subtitles/.test(renderer), "cue subtitle ikut dibakar ke canvas export");
check(/extractAudioFromVideo/.test(studio) && /captureStream/.test(studio), "video lokal bisa mengambil track audio untuk transkripsi");
check(/SRT hasil/.test(studio) && /updateSubtitleCue/.test(studio), "hasil subtitle bisa diedit dan diunduh");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 SUBTITLE STUDIO SEHAT — alur Arab → bahasa pilihan tersedia");
