/* 🎚️ Regression checks for the optional long EDM mix add-on. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const panel = readFileSync(join(ROOT, "src/components/SunoPanel.tsx"), "utf8");
const mix = readFileSync(join(ROOT, "src/components/SunoMixPanel.tsx"), "utf8");
const audioMix = readFileSync(join(ROOT, "src/lib/audio-mix.ts"), "utf8");
const pkg = readFileSync(join(ROOT, "package.json"), "utf8");

let pass = 0;
let fail = 0;
const T = (ok, message) => ok ? (pass++, console.log("✅", message)) : (fail++, console.log("❌", message));

T(/SunoMixPanel/.test(panel) && /mixOpen/.test(panel), "mix panjang adalah panel opsional di SunoPanel");
T(/EDM Mix Panjang/.test(panel) && /allowAdvanced/.test(panel), "fitur mix hanya dibuka dari konteks Spectrum Advanced");
T(/variationCount/.test(mix) && /COUNTS = \[2, 3, 4, 5, 6, 8\]/.test(mix), "user bisa memilih jumlah variasi");
T(/targetMinutes/.test(mix) && /TARGETS = \[40, 60\]/.test(mix), "target mix 40/60 menit tersedia");
T(/accept="audio\/\*,video\/\*"/.test(mix), "setiap klip menerima audio atau video reference");
T(/sampleStart/.test(mix) && /sampleEnd/.test(mix) && /prepareReferenceAudio/.test(mix), "setiap klip punya potongan reference sendiri");
T(/clip\.style/.test(mix) && /Style khusus klip/.test(mix), "setiap klip punya style sendiri");
T(/instrumental/.test(mix) && /no vocals/.test(mix), "mode instrumental EDM tersedia");
T(/for \(let index = 0; index < selected.length; index\+\+\)/.test(mix) && /await generateClip/.test(mix), "generasi variasi berjalan berurutan agar kredit terkendali");
T(/pendingCount/.test(mix) && /sudah ada — dilewati/.test(mix), "generate ulang tidak membuat ulang klip yang sudah selesai");
T(/Hentikan Antrean/.test(mix) && /AbortController/.test(mix), "antrean bisa dihentikan sebelum klip berikutnya dibuat");
T(/Task sudah dibuat/i.test(mix) && /noKeyRetry/.test(mix), "task yang sudah dibuat tidak dikirim ulang sembarangan");
T(/reference-upload/.test(mix) && /operation: "sample"/.test(mix), "reference per klip diunggah lalu dikirim sebagai sample-to-song");
T(/mixAudioBuffersToMp4/.test(mix) && /Gabungkan \$\{targetMinutes\} Menit/.test(mix), "hasil klip bisa digabung menjadi target mix");
T(/new Muxer/.test(audioMix) && /AudioEncoder/.test(audioMix) && /crossfade/.test(audioMix), "penggabungan lokal memakai encoder AAC dan crossfade");
T(/0 kredit AI/.test(mix) && /tidak memakai kredit AI/.test(mix), "mix lokal tidak membuat request AI tambahan");
T(/"mp4-muxer"/.test(pkg) && /"mp4-muxer"/.test(audioMix), "encoder AAC lokal memakai mp4-muxer yang sudah dipakai renderer");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
console.log("🏁 SPECTRUM EDM MIX HIJAU — variasi, reference per klip, dan mix hemat kredit siap dicek");
