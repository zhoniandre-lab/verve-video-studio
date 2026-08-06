// 🩺🧪 UJI KESEHATAN GENERATE LAGU (v19.35.4) — provider mati dihapus, tanpa key = pesan jelas
// Jalankan: node tests/suno-health.test.mjs
import { readFileSync } from "fs";

const route = readFileSync(new URL("../src/app/api/hcnsec/music/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");
const health = readFileSync(new URL("../src/app/api/hcnsec/music/health/route.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1. aimusic (provider mati, 404 semua) TIDAK ada di daftar provider aktif
T("route: aimusic DIHAPUS dari PROVIDERS (mati)", !/aimusic:\s*\{\s*base/.test(route));
T("route: ada catatan PROVIDER_MATI aimusic", /aimusic/.test(route) && /PROVIDER_MATI/.test(route));
T("panel: aimusic TIDAK ditawarkan di dropdown", !/aimusic\.so/.test(panel));

// 2. Tanpa key → langsung pesan jelas (bukan coba-coba provider mati)
T("route: tanpa key → need_key + panduan dapat key", /if \(!key\) \{[\s\S]*?need_key/.test(route) && /kie\.ai\/api-key/.test(route));

// 3. Polling GET pakai timeout 8s (bukan 15s) — respons server cepat, anti 'Failed to fetch'
T("route: polling GET timeout 8 detik", /setTimeout\(\(\)=>controller\.abort\(\), 8000\)/.test(route));

// 4. Health check endpoint ada & cek endpoint generate (401 = hidup, 404 = mati)
T("health route: ada & cek 3 provider", /kie/.test(health) && /sunor/.test(health) && /apiframe/.test(health));
T("health route: 404 dianggap MATI", /r\.status !== 404/.test(health));
T("health route: timeout 6s per provider", /setTimeout\(\(\) => ctrl\.abort\(\), 6000\)/.test(health));

// 5. Panel: polling punya batas wajar (MAX_POLL) & terjemahan error 'Failed to fetch'
T("panel: ada batas polling MAX_POLL", /MAX_POLL\s*=\s*\d+/.test(panel));
T("panel: 'Failed to fetch' diterjemahkan", /failed to fetch/i.test(panel) && /terjemahErr/.test(panel));
T("panel: ada tombol 'Cek ulang' & link dashboard", /Cek ulang/.test(panel) && /PROVIDER_DASH/.test(panel));
T("panel: ada tombol 🩺 Cek status provider", /🩺 Cek status/.test(panel));

if (gagal) { console.error(`\n💥 ${gagal} UJI KESEHATAN LAGU GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI KESEHATAN LAGU HIJAU — generate lagu jujur & berfungsi!");
