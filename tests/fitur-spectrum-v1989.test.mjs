// 🛠🧪 v19.89 — SPECTRUM: bansos gambar, kendali lirik (ukuran/posisi), posisi subscribe
// Jalankan: node tests/fitur-spectrum-v1989.test.mjs
import { readFileSync } from "fs";

const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/hcnsec/image/route.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🛠 Menguji fitur Spectrum v19.89");

/* ---- 1. Generate Gambar AI via Bansos ---- */
T("route image baca x-bansos-img-key", /x-bansos-img-key/.test(route));
T("route image baca x-bansos-img-base", /x-bansos-img-base/.test(route));
T("route image coba bansos DULU sebelum hcnsec", /if \(bKey && bBase\)/.test(route));
T("route image fallback hcnsec kalau bansos gagal", /fallback hcnsec/.test(route));
T("generateImageBansos pakai /images/generations", /\/images\/generations/.test(route));
T("generateImageBansos support b64_json", /b64_json/.test(route));
T("Spectrum buatBgAI kirim header bansos", /x-bansos-img-key/.test(spec) && /verve_bansos_chat_v1/.test(spec));

/* ---- 2. Kendali Lirik (ukuran & posisi) ---- */
T("Spectrum punya state capSize", /const \[capSize, setCapSize\]/.test(spec));
T("Spectrum punya state capY", /const \[capY, setCapY\]/.test(spec));
T("drawScene pakai override capSize/capY", /capY \?\? tpl\.yRatio/.test(spec) && /capSize \?\? tpl\.sizeRatio/.test(spec));
T("drag lirik (target capt) ada", /target: "capt"/.test(spec));
T("geser lirik set capY", /setCapY\(clampN\(y, 0\.08, 0\.92\)\)/.test(spec));
T("cubit 2 jari ubah ukuran lirik (pinchCap)", /pinchCap/.test(spec));
T("slider ukuran lirik di panel", /Ukuran lirik/.test(spec));
T("slider posisi lirik di panel", /Posisi vertikal/.test(spec));
T("tombol kembali ke template", /Kembali ke template/.test(spec));

/* ---- 3. Posisi Tombol Subscribe ---- */
T("drag subscribe disimpan ke localStorage", /verve_spektrum_subpos_v1/.test(spec));
T("posisi subscribe dipulihkan saat buka", /getItem\("verve_spektrum_subpos_v1"\)/.test(spec));
T("tombol Tengah untuk subscribe", /🎯 Tengah/.test(spec));
T("preview mini pakai posisi asli subPos (bukan selalu tengah)", /mx \* cv\.width/.test(spec) && /my \* cv\.height/.test(spec));

if (gagal) { console.error(`\n💥 ${gagal} UJI FITUR SPECTRUM GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI FITUR SPECTRUM HIJAU");
