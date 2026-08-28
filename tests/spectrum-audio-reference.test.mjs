/* 🎛️ Test Advanced Spectrum: sample-to-song dari audio, voice, atau video. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const panel = readFileSync(join(ROOT, "src/components/SunoPanel.tsx"), "utf8");
const studio = readFileSync(join(ROOT, "src/app/spectrum-studio.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/app/api/hcnsec/music/route.ts"), "utf8");
const audio = readFileSync(join(ROOT, "src/lib/studio/reference-audio.ts"), "utf8");
const upload = readFileSync(join(ROOT, "src/app/api/hcnsec/music/reference-upload/route.ts"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => { ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message)); };

T(/allowAdvanced\?: boolean/.test(panel) && /panelMode/.test(panel), "SunoPanel punya mode Simple/Advanced opsional");
T(/＋ Audio/.test(panel) && /＋ Voice/.test(panel), "Advanced punya tombol Audio dan Voice");
T(/accept="audio\/\*,video\/\*"/.test(panel), "Audio Reference menerima audio dan video");
T(/recordReferenceAudio/.test(panel) && /Maksimal 30 detik/.test(panel), "Advanced bisa merekam referensi langsung");
T(/prepareReferenceAudio/.test(panel) && /reference-upload/.test(panel), "referensi dipotong lalu diunggah ke storage publik");
T(/operation: "sample"/.test(panel), "Advanced mengirim operasi sample-to-song");
T(/chop_sample_start_s/.test(route) && /chop_sample_end_s/.test(route), "MusicAPI sample memakai rentang audio");
T(/reference_duration_invalid/.test(route) && /antara 6 dan 60 detik/.test(route), "rentang audio dijaga 6–60 detik");
T(/uploadUrl/.test(route) && /generate\/upload-cover/.test(route), "Kie memakai jalur upload-cover yang benar");
T(/provider === "ttapi"/.test(route) && /suno\/v1\/upload-cover/.test(route), "TTAPI memakai endpoint upload-cover yang benar");
T(/provider === "cometapi"/.test(route) && /uploads\/audio-url/.test(route) && /cover_clip_id/.test(route), "Comet upload clip lalu cover dengan clip_id");
T(/reference_unsupported/.test(route) && /REFERENCE_PROVIDERS/.test(route), "provider yang tidak mendukung tidak dipaksa");
T(/REFERENCE_PROVIDERS = new Set<Provider>\(\["musicapi", "aimusicapi", "kie", "sunoapi", "cometapi", "ttapi"\]\)/.test(route), "EvoLink tetap Simple karena belum ada kontrak audio-reference publik");
T(/createMediaStreamDestination/.test(audio) && /extractVideoAudio/.test(audio), "audio dari video diekstrak tanpa mengirim video mentah");
T(/getUserMedia/.test(audio) && /recordReferenceAudio/.test(audio), "rekam mikrofon tersedia");
T(/CLOUD_BRANKAS_BUCKET/.test(upload) && /formData\(\)/.test(upload), "endpoint upload memakai multipart dan Supabase Storage");
T(/allowAdvanced/.test(studio), "Spectrum mengaktifkan mode Advanced pada panel lagu");
T(/cometapi.*ttapi|ttapi.*cometapi/.test(panel), "Advanced membuka dukungan CometAPI dan TTAPI");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 ADVANCED AUDIO REFERENCE HIJAU — sample, voice, dan video siap diproses");
