// 🎬✏️🧪 v19.92 — LOOP MULUS (seamless) + KENDALI JUDUL (ukuran/wrap/ikut bass)
// Jalankan: node tests/seamless-judul.test.mjs
import { readFileSync } from "fs";
const spec = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎬 Menguji loop mulus & judul (v19.92)");

/* ---- LOOP MULUS (seamless) ---- */
T("state videoSeamless ada (default ON)", /const \[videoSeamless, setVideoSeamless\] = useState\(true\)/.test(spec));
T("elemen video KEDUA disiapkan (crossfade)", /videoBg2Ref\.current = a; videoBg2Ref\.current = b;/.test(spec) || /const b = mk\(\); \/\/ siap dipakai saat crossfade/.test(spec));
T("videoCurRef & videoSwapRef ada", /videoCurRef/.test(spec) && /videoSwapRef/.test(spec));
T("pemicu crossfade: video hampir habis → mulai 0,3 dtk", /currentTime >= vd - 0\.5/.test(spec) && /videoSwapRef\.current = \{ t0: performance\.now\(\) \}/.test(spec));
T("crossfade 2 video (alpha lama turun, baru naik)", /drawVid\(vCur, 1 - k\)/.test(spec) && /drawVid\(other, k\)/.test(spec));
T("setelah selesai: ganti video aktif & pause yang lama", /videoCurRef\.current = videoCurRef\.current === 0 \? 1 : 0/.test(spec) && /old\.pause\(\); old\.currentTime = 0/.test(spec));
T("freeze di frame terakhir kalau jatah habis (bukan hitam)", /jatah loop habis → freeze di frame terakhir/.test(spec) && /vA\?\.pause\(\); vB\?\.pause\(\)/.test(spec));
T("video di lapis DINAMIS (!bgOnly)", /if \(!bgOnly\) \{[\s\S]*?const vA = videoBgRef\.current/.test(spec));
T("toggle Loop Mulus di UI", /Loop mulus/.test(spec) && /setVideoSeamless\(!videoSeamless\)/.test(spec));
T("videoSeamless tersimpan di preset", /videoSeamless, \/\/ 🔁 v19\.92/.test(spec) && /setVideoSeamless\(!!p\.videoSeamless\)/.test(spec));

/* ---- KENDALI JUDUL ---- */
T("state titleSize & titleBeat ada", /const \[titleSize, setTitleSize\]/.test(spec) && /const \[titleBeat, setTitleBeat\]/.test(spec));
T("judul bisa di-resize (override ukuran)", /H \* 0\.055 \* L\.titleScale \* \(titleSize \?\? 1\)/.test(spec));
T("judul IKUT BASS (denyut halus)", /titleBeat \? 1 \+ bass \* 0\.05/.test(spec));
T("WRAP otomatis: pecah kata per baris (cache)", /wrapCache/.test(spec) && /baris\[bi\]/.test(spec) && /ctx\.measureText\(coba\)\.width <= maxW/.test(spec));
T("judul panjang TIDAK keluar layar (maks 88% lebar)", /maxW = W \* 0\.88/.test(spec));
T("drag judul pakai KOTAK LEBAR (mudah kena)", /Math\.abs\(x - titlePos\.x\) <= 0\.34/.test(spec));
T("pinch 2 jari dekat judul → ubah ukuran", /pinchTitle/.test(spec) && /setTitleSize\(s\)/.test(spec));
T("slider ukuran judul di UI", /Ukuran judul/.test(spec));
T("toggle judul ikut bass di UI", /Judul ikut bass/.test(spec));
T("tombol reset judul", /Reset judul/.test(spec));
T("titleSize/titleBeat tersimpan di preset", /titleSize, titleBeat, \/\/ ✏️ v19\.92/.test(spec));

if (gagal) { console.error(`\n💥 ${gagal} UJI SEAMLESS-JUDUL GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI SEAMLESS & JUDUL HIJAU");
