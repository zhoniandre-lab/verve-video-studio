/* 🎵 Regression: AIMusicAPI rejects vocal_gender with the sonic-* model names. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "src/app/api/hcnsec/music/route.ts"), "utf8");
const reference = route.slice(route.indexOf("function buildReferenceBody"), route.indexOf("function findStringByKeys"));
const create = route.slice(route.indexOf("// 🎵 v19.69 MUSICAPI"), route.indexOf("// 🎵 v19.64 MUREKA"));
const evolink = route.slice(route.indexOf("// 🎵 v19.78 EVOLINK"), route.indexOf("// 🎵 v19.78 COMETAPI"));
let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/provider === "musicapi" && SAMPLE_VOCAL_MODELS\.has\(sampleModel\)/.test(reference), "MusicAPI hanya mendapat vocal_gender pada model sample yang didukung");
T(/mapModelSonicSample/.test(reference), "sample MusicAPI/AIMusicAPI memakai nomenklatur chirp yang terdokumentasi");
T(!/provider === "aimusicapi"[^\n]*vocal_gender/.test(reference), "AIMusicAPI reference tidak mengirim vocal_gender yang menyebabkan 400");
T(/provider === "musicapi" && vocalGender/.test(create), "MusicAPI Simple tetap memakai kontrol vocal_gender");
T(/AIMusicAPI menolak vocal_gender/.test(create) && /styleStr sudah memuat/.test(create), "AIMusicAPI memakai style gender sebagai fallback aman");
T(!/if \(vocalGender === "male"\) body\.vocal_gender/.test(create), "tidak ada lagi vocal_gender unconditional pada blok AIMusicAPI");
T(/Kontrak publik EvoLink tidak mendokumentasikan vocal_gender/.test(evolink) && !/body\.vocal_gender/.test(evolink), "EvoLink tidak dikirimi field vocal_gender yang belum didukung");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 MUSIC PROVIDER VALIDATION HIJAU — field per-provider dipagari agar Simple/Advanced tidak 400");
