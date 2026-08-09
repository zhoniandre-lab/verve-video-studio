// 🎙️🧪 UJI EDGE TTS CADANGAN (v19.49) — cek kode & logika daftar suara/gaya
// Jalankan: node tests/edge-tts.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/edge-tts.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/hcnsec/tts/route.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎙️ Menguji Edge TTS cadangan (v19.49)");

// 1. suara natural Indonesia & Inggris tersedia
T("ada suara Indonesia (id-ID-GadisNeural)", /id-ID-GadisNeural/.test(src));
T("ada suara laki-laki Indonesia (id-ID-ArdiNeural)", /id-ID-ArdiNeural/.test(src));
T("ada suara Inggris (en-US-AriaNeural)", /en-US-AriaNeural/.test(src));
T("ada pembaca kisah (en-US-ChristopherNeural)", /en-US-ChristopherNeural/.test(src));
T("minimal 6 suara", (src.match(/edge: "/g) || []).length >= 6);

// 2. gaya baca (berita/kisah/dll)
T("ada gaya Pembaca Berita", /Pembaca Berita/.test(src));
T("ada gaya Pembaca Kisah", /Pembaca Kisah/.test(src));
T("ada gaya cepat & tenang", /Cepat/.test(src) && /Tenang/.test(src));

// 3. pemetaan voice lama → cadangan
T("pemetaan alloy→gadis", /alloy: "gadis"/.test(src));
T("pemetaan echo→christopher", /echo: "christopher"/.test(src));

// 4. pemetaan cadangan → voice OpenAI (buat hcnsec)
T("pemetaan gadis→alloy", /gadis: "alloy"/.test(src));

// 5. chunking teks per kalimat ≤900
T("chunkTeks ada (max 900)", /max = 900/.test(src));
T("chunkTeks potong di batas kalimat", /split\(\/\(\?<=/.test(src));

// 6. protokol WebSocket Edge (speech.config + ssml)
T("kirim speech.config", /Path:speech.config/.test(src));
T("kirim SSML prosody", /Path:ssml/.test(src));
T("baca Path:turn.end", /Path:turn.end/.test(src));
T("kumpulkan Path:audio", /Path:audio/.test(src));
T("format binary: buang 2+hl (fix ff f3)", /subarray\(2 \+ hl\)/.test(src));
T("ada token anti-bot Sec-MS-GEC", /generateSecMsGec/.test(src) && /Sec-MS-GEC-Version/.test(src));

// 7. route: hcnsec dulu → fallback edge
T("route coba hcnsec dulu", /generateSpeech\(teks/.test(route));
T("route fallback edgeTTS", /edgeTTS\(teks, voice, style\)/.test(route));
T("route kirim voice gaya OpenAI ke hcnsec", /NEW_TO_LEGACY/.test(route));
T("route notice kalau pakai cadangan", /Dipakai suara cadangan/.test(route));
T("route kirim chunks untuk teks panjang", /chunks: res\.chunks/.test(route));
T("route batas waktu 60 detik", /maxDuration = 60/.test(route));

// 8. klien: gabung potongan jadi 1 audio
const gabung = readFileSync(new URL("../src/lib/gabung-audio.ts", import.meta.url), "utf8");
T("helper gabung chunks ada", /gabungChunksDataUrl/.test(gabung));
T("gabung pakai decodeAudioData", /decodeAudioData/.test(gabung));
T("export WAV dari AudioBuffer", /bufferToWav/.test(gabung));

console.log(gagal ? `\n❌ ${gagal} gagal` : "\n✅ Semua lolos");
process.exit(gagal ? 1 : 0);
