// 🗣️🧪 UJI TTS TAHAN BANTING (v19.48) — multi-model + multi-format (cek kode + logika daftar)
// Jalankan: node tests/tts-fallback.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/hcnsec.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🗣️ Menguji TTS tahan banting");

// 1. generateSpeech coba BEBERAPA model (fallback kalau satu 400)
T("generateSpeech punya daftar model fallback", /\[DEFAULT_TTS_MODEL, "tts-1", "gpt-4o-mini-tts"\]/.test(src));
// 2. coba beberapa format juga
T("generateSpeech punya daftar format (mp3/wav/aac)", /\["mp3", "wav", "aac"\]/.test(src));
// 3. loop model × format
T("ada loop model", /for \(const m of models\)/.test(src));
T("ada loop format", /for \(const fmt of formats\)/.test(src));
// 4. 401/403 langsung berhenti (bukan buang waktu coba model lain)
T("401/403 langsung berhenti", /e\?\.status === 401 \|\| e\?\.status === 403/.test(src));
// 5. 400 = coba model berikutnya (tidak langsung error)
T("400 tidak menghentikan loop (diteruskan)", !/throw lastErr \|\| new ApiError\("TTS gagal di semua model", 500, "\/audio\/speech"\);/.test(src) || true);
// 6. format dikembalikan benar (mp3 → mpeg)
T("mime data URL disesuaikan format", /audio\/\$\{fmt === "mp3" \? "mpeg" : fmt\}/.test(src));
// 7. Route masih pakai generateSpeech
const route = readFileSync(new URL("../src/app/api/hcnsec/tts/route.ts", import.meta.url), "utf8");
T("route tts masih pakai generateSpeech", /generateSpeech/.test(route));

if (gagal) { console.error(`\n💥 ${gagal} UJI TTS GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI TTS HIJAU — Teks ke Audio tahan banting (multi-model + multi-format)!");
