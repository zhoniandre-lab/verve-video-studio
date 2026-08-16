// 🎞️🧪 v19.95 — LEMARI VIDEO STOK di Spectrum (Pexels/Pixabay/Coverr → latar video)
// Jalankan: node tests/lemari-video.test.mjs
import { readFileSync } from "fs";
const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
const stokroute = readFileSync(new URL("../src/app/api/hcnsec/stock-video/route.ts", import.meta.url), "utf8");
const sv = readFileSync(new URL("../src/lib/stockvid.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎞️ Menguji lemari video stok (v19.95)");

/* ---- fungsi & state ---- */
T("import cariStokVideoSmart dari stockvid", /from "@\/lib\/stockvid"/.test(spec));
T("state lemari video ada (vidSheetOpen/vidQ/vidRes/vidBusy/vidErr/vidNote)", /vidSheetOpen/.test(spec) && /vidQ/.test(spec) && /vidRes/.test(spec) && /vidBusy/.test(spec) && /vidErr/.test(spec) && /vidNote/.test(spec));
T("fungsi cariVidStok ada & pakai cariStokVideo global+tipe", /async function cariVidStok/.test(spec) && /cariStokVideo\(k, 1, 15, vidTipe\)/.test(spec));
T("fungsi pilihVidStok set videoBg dari hasil stok", /function pilihVidStok/.test(spec) && /setVideoBg\(v\.sd \|\| v\.src\)/.test(spec));
T("pilih stok set videoDur (untuk info loop)", /setVideoDur\(v\.dur\)/.test(spec));
T("pilih stok: kalau belum ada lagu → audio video jadi musik", /if \(!bufRef\.current && !audioUrl\) void loadAudio/.test(spec));

/* ---- UI ---- */
T("tombol Cari video stok ada", /Cari video stok/.test(spec));
T("panel lemari punya input + tombol cari + filter tipe", /vidBusy \? "⏳" : "🔍"/.test(spec) && /vidTipe/.test(spec));
T("enter di kolom cari memicu pencarian", /if \(e\.key === "Enter"\) void cariVidStok\(\)/.test(spec));
T("grid hasil pakai thumbnail & durasi", /v\.thumb/.test(spec) && /Math\.round\(v\.dur\)/.test(spec));
T("pesan gudang kosong tetap ada", /Gudang kosong buat kata itu/.test(spec));

/* ---- v20.25: FILTER ANIME (video animasi) ---- */
T("ANIME: route baca param tipe", /get\("tipe"\)/.test(stokroute));
T("ANIME: mode anime tambah kata anime animation", /anime animation/.test(stokroute));
T("ANIME: Pixabay video_type=all saat anime", /vtype = tipe === "anime"/.test(stokroute));
T("ANIME: cariStokVideo dukung param tipe", /tipe: "film" \| "anime"/.test(sv));
T("ANIME: Spectrum state vidTipe + tombol filter", /vidTipe/.test(spec) && /Anime \/ Animasi/.test(spec));
T("ANIME: Spectrum kirim tipe saat cari & muat lagi", /cariStokVideo\(k, 1, 15, vidTipe\)/.test(spec));
T("ANIME: cache key ikut tipe", /tipe/.test(sv));


if (gagal) { console.error(`\n💥 ${gagal} UJI LEMARI VIDEO GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LEMARI VIDEO HIJAU");

/* ---- v20.23: hasil stok LEBIH BANYAK (per=15, global, muat lebih) ---- */
T("v20.23: cari pakai cariStokVideo global (bukan Smart rasaIndo)", /cariStokVideo\(k, 1, 15, vidTipe\)/.test(spec));
T("v20.23: state vidPage & vidLastQ & vidTotal ada", /vidPage/.test(spec) && /vidLastQ/.test(spec) && /vidTotal/.test(spec));
T("v20.23: muatLagiVid (halaman berikutnya, anti duplikat)", /async function muatLagiVid/.test(spec) && /ada.has\(v\.id\)/.test(spec));
T("v20.23: tampilkan SEMUA hasil (bukan slice 8)", /vidRes\.map\(\(v\) =>/.test(spec) && !/vidRes\.slice\(0, 8\)/.test(spec));
T("v20.23: tampilkan sumber provider (Pexels/Pixabay)", /v\.provider/.test(spec) && /Pixabay · Coverr/.test(spec));
T("v20.23: tombol Muat lebih banyak", /Muat lebih banyak/.test(spec) && /vidRes\.length < vidTotal/.test(spec));

/* ---- v20.24: keyword SESUAI (query presisi, tanpa terjemahan AI dobel) ---- */
T("v20.24: route TIDAK terjemahkan ulang dgn AI", /let q = rawQ/.test(stokroute) && !/const q = await translateQueryWithAI/.test(stokroute));
T("v20.24: frasa majemuk didahulukan (malam hari→night)", /malam hari/.test(sv) && /"hujan malam": "night rain"/.test(sv));
T("v20.24: kata isian dibuang (hari/yang/dan)", /buang = new Set/.test(sv) && /"hari"/.test(sv));
T("v20.24: terjemahan kata per kata tetap ada", /ID_EN\[w\] \|\| w/.test(sv));

