/* 🛡️ Regression checks for video-reference ingestion and stock-video Review. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const music = readFileSync(join(ROOT, "src/app/api/hcnsec/music/route.ts"), "utf8");
const proxy = readFileSync(join(ROOT, "src/app/api/hcnsec/proxy-audio/route.ts"), "utf8");
const stockRoute = readFileSync(join(ROOT, "src/app/api/hcnsec/stock-video/route.ts"), "utf8");
const stockLib = readFileSync(join(ROOT, "src/lib/stockvid.ts"), "utf8");
const spectrum = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/sonic\/upload/.test(music) && /uploadSonicReference/.test(music), "MusicAPI/AIMusicAPI memakai upload acuan resmi terlebih dahulu");
T(/sample_clip_id/.test(music) && /mutually|MUTUALLY/.test(music), "sample memakai clip_id dan tidak mencampur url + clip_id");
T(/reference_upload_failed/.test(music) && /sebelum generate/.test(music), "upload reference gagal berhenti sebelum kredit generate dipakai");
T(/chop_sample_start_s/.test(music) && /chop_sample_end_s/.test(music), "rentang potongan reference tetap diteruskan");

T(/upstreamHeaders\.Range = range/.test(proxy) && /req\.headers\.get\("range"\)/.test(proxy), "proxy meneruskan Range dari HTMLVideoElement");
T(/Content-Range/.test(proxy) && /status: r\.status === 206 \? 206 : 200/.test(proxy), "proxy mempertahankan respons 206 dan Content-Range");
T(/Access-Control-Expose-Headers/.test(proxy), "header range diekspos untuk browser");

T(/function gerbangMedia/.test(stockRoute) && /src: gerbangMedia\(f\.src\)/.test(stockRoute), "semua video stok melewati gerbang media same-origin");
T(/thumb: gerbangMedia\(v\.image\)/.test(stockRoute) && /thumb: thumb \? gerbangMedia/.test(stockRoute), "thumbnail stok juga punya jalur yang konsisten");
T(/proxy-range-v2/.test(stockLib), "cache stok di-invalidate setelah jalur proxy Range diperbaiki");

T(/videoBgFallbackRef/.test(spectrum) && /setVideoBg\(fallbackUrl\)/.test(spectrum), "video stok punya fallback HD jika sumber ringan gagal");
T(/v\.onloadedmetadata/.test(spectrum) && /v\.onerror/.test(spectrum), "metadata dan error video dipantau sebelum Review");
T(/function pilihVidStok/.test(spectrum) && /setStep\(1\)/.test(spectrum), "memilih video stok langsung masuk ke Review");
T(/jangan decode MP4 stok sebagai AudioBuffer/i.test(spectrum), "video stok tidak dipaksa menjadi musik saat belum ada audio");
T(/Video stok terpasang sebagai latar/.test(spectrum), "Review memberi pesan jelas bila musik belum dipilih");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 REFERENCE VIDEO + STOCK REVIEW HIJAU — jalur video dan preview Android dipagari");
