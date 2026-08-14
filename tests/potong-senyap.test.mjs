// ✂️🧪 v19.82 — UJI PEMANGKAS SENYAP (lagu 12 menit → isi ±5 menit)
// Jalankan: node tests/potong-senyap.test.mjs
// Ekstrak fungsi MURNI ASLI dari src/lib/gabung-audio.ts (bukan replika).
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/gabung-audio.ts", import.meta.url), "utf8");
const i0 = src.indexOf("export function cariJangkauanAudio");
const i1 = src.indexOf("export function potongBuffer");
if (i0 < 0 || i1 < 0 || i1 <= i0) { console.error("💥 cariJangkauanAudio tak ketemu di gabung-audio.ts"); process.exit(1); }
let js = src.slice(i0, i1)
  .replace(/export /g, "")
  .replace(/\): \{ mulai: number; akhir: number \}/, ")")
  .replace(/: Float32Array\[\]/g, "")
  .replace(/: number/g, "");
const F = new Function(`${js}; return cariJangkauanAudio;`)();

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("✂️ Menguji pemangkas senyap (cariJangkauanAudio)");

// 1) senyap 0,5s → suara 1,5s → senyap 4s (mirip lagu 12 menit: isi 5, ekor 7)
{
  const sr = 1000, n = 6000;
  const d = new Float32Array(n);
  for (let i = 500; i < 2000; i++) d[i] = 0.5 * Math.sin(i * 0.1);
  const { mulai, akhir } = F([d], sr);
  T("jangkauan mulai ≈ 0,5 dtk", Math.abs(mulai - 500) <= 50, `mulai=${mulai}`);
  T("jangkauan akhir ≈ 2,0 dtk (bukan 6 dtk)", Math.abs(akhir - 2000) <= 50, `akhir=${akhir}`);
}

// 2) full signal → jangkauan = seluruh file
{
  const sr = 1000, n = 4000;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.3;
  const { mulai, akhir } = F([d], sr);
  T("full suara → mulai 0 & akhir n", mulai === 0 && akhir === n, `${mulai}/${akhir}`);
}

// 3) stereo: kanal kiri senyap, kanan bersuara → tetap terdeteksi
{
  const sr = 1000, n = 3000;
  const kiri = new Float32Array(n);
  const kanan = new Float32Array(n);
  for (let i = 1000; i < 1500; i++) kanan[i] = 0.4;
  const { mulai, akhir } = F([kiri, kanan], sr);
  T("stereo kanan bersuara → terdeteksi", Math.abs(mulai - 1000) <= 50 && Math.abs(akhir - 1500) <= 50, `${mulai}-${akhir}`);
}

// 4) semua senyap di bawah ambang → tidak ada yang "bersuara"
{
  const sr = 1000, n = 2000;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.002; // di bawah ambang 0.004
  const { mulai, akhir } = F([d], sr);
  T("bisik di bawah ambang → dianggap tanpa isi", mulai === 0 && akhir === n);
}

// 5) text checks — fungsi dipasang di UI
{
  const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
  const spectrum = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
  const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  T("SunoStudio pakai potongBuffer", /potongBuffer\(buf, ac\)/.test(studio));
  T("SunoStudio simpan durasi hasil pangkasan", /dur: durFinal/.test(studio));
  T("SunoStudio download WAV saat dipangkas", /hasil\.trimmed \? "wav" : "mp3"/.test(studio));
  T("SunoStudio kasih tahu ekor senyap dipangkas", /ekor senyap \$\{ekor\.toFixed\(0\)\} dtk/.test(src));
  T("SunoStudio label jujur asli vs isi", /file asli \$\{Math\.round\(asliDur\)\} dtk/.test(studio));
  T("Spectrum TIDAK pangkas audio upload global (v19.83)", !/potongBuffer\(buf, actxRef\.current\)/.test(spectrum));
  T("Spectrum prefer previewUrl hasil trim", /h\.previewUrl \|\| h\.url/.test(spectrum));
  T("Lahan ukur durasi ISI setelah lagu jadi", /ukurDanTrimLagu/.test(lahan) && /ukurDurasiIsi\(res\.url, prox\)/.test(lahan));
  T("Lahan preview pakai audio hasil trim", /song\.audio \|\|/.test(lahan));
  T("Lahan bersihkan blob mati saat restore", /j\.song\?\.audio && j\.song\.audio\.startsWith\("blob:"\)/.test(lahan));
  T("page.tsx ukur durasi ISI di terimaLaguAI", /ukurDurasiIsi\(url, proxify\)/.test(page));
  T("gabung-audio ekspor cariJangkauanAudio + potongBuffer + ukurDurasiIsi", /export function cariJangkauanAudio/.test(src) && /export function potongBuffer/.test(src) && /export async function ukurDurasiIsi/.test(src));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI PEMANGKAS SENYAP GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI PEMANGKAS SENYAP HIJAU");
