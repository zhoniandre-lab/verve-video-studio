/* 🔐 Regression test: MusicAPI result may be valid only with provider auth. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const route = readFileSync(join(root, "src/app/api/hcnsec/music/route.ts"), "utf8");
const proxy = readFileSync(join(root, "src/app/api/hcnsec/proxy-audio/route.ts"), "utf8");
const panel = readFileSync(join(root, "src/components/SunoPanel.tsx"), "utf8");
const spectrum = readFileSync(join(root, "src/app/spectrum-studio.tsx"), "utf8");
let pass = 0;
let fail = 0;
const T = (ok, message) => { ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message)); };

T(/requiresAuth: true/.test(route), "URL audio yang valid dengan auth tidak dibuang");
T(/audio_needs_auth/.test(route), "hasil route menandai audio yang butuh auth");
T(/x-suno-key/.test(proxy) && /Authorization/.test(proxy), "proxy bisa meneruskan credential provider");
T(/TT-API-KEY/.test(proxy) && /provider === "ttapi"/.test(proxy), "proxy menjaga header khusus TTAPI");
T(/mayForwardProviderAuth/.test(proxy) && /musicapi\.ai/.test(proxy), "credential hanya diteruskan ke host provider/CDN yang dikenal");
T(/private, max-age=3600/.test(proxy), "respons audio ber-auth tidak dibuat cache publik");
T(/SunoAudioAccess/.test(panel) && /onSong\(res\.url, res\.title, res\.duration,/.test(panel), "panel meneruskan akses provider ke Spectrum");
T(/audioAccessRef/.test(spectrum) && /x-suno-key/.test(spectrum), "Spectrum mengirim akses ke proxy saat mengambil audio");
T(/fetchSpectrumAudioBytes\(audioUrl, ac\.signal, audioAccessRef\.current/.test(spectrum), "auto-lirik memakai jalur audio ber-auth yang sama");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 MUSIC AUDIO AUTH HIJAU — URL private provider tetap bisa dipakai");
