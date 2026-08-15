// 🎞️🧪 v19.95 — LEMARI VIDEO STOK di Spectrum (Pexels/Pixabay/Coverr → latar video)
// Jalankan: node tests/lemari-video.test.mjs
import { readFileSync } from "fs";
const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎞️ Menguji lemari video stok (v19.95)");

/* ---- fungsi & state ---- */
T("import cariStokVideoSmart dari stockvid", /from "@\/lib\/stockvid"/.test(spec));
T("state lemari video ada (vidSheetOpen/vidQ/vidRes/vidBusy/vidErr/vidNote)", /vidSheetOpen/.test(spec) && /vidQ/.test(spec) && /vidRes/.test(spec) && /vidBusy/.test(spec) && /vidErr/.test(spec) && /vidNote/.test(spec));
T("fungsi cariVidStok ada & pakai cariStokVideoSmart", /async function cariVidStok/.test(spec) && /cariStokVideoSmart\(k, true\)/.test(spec));
T("fungsi pilihVidStok set videoBg dari hasil stok", /function pilihVidStok/.test(spec) && /setVideoBg\(v\.sd \|\| v\.src\)/.test(spec));
T("pilih stok set videoDur (untuk info loop)", /setVideoDur\(v\.dur\)/.test(spec));
T("pilih stok: kalau belum ada lagu → audio video jadi musik", /if \(!bufRef\.current && !audioUrl\) void loadAudio/.test(spec));

/* ---- UI ---- */
T("tombol Cari video stok ada", /Cari video stok/.test(spec));
T("panel lemari punya input + tombol cari", /placeholder='Cari: "ibu menangis"/.test(spec) && /vidBusy \? "⏳" : "🔍"/.test(spec));
T("enter di kolom cari memicu pencarian", /if \(e\.key === "Enter"\) void cariVidStok\(\)/.test(spec));
T("grid hasil pakai thumbnail & durasi", /v\.thumb/.test(spec) && /Math\.round\(v\.dur\)/.test(spec));
T("pesan gudang kosong / lebar (rasa Indonesia)", /Stok rasa Indonesia habis/.test(spec) && /Gudang kosong buat kata itu/.test(spec));

if (gagal) { console.error(`\n💥 ${gagal} UJI LEMARI VIDEO GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LEMARI VIDEO HIJAU");
