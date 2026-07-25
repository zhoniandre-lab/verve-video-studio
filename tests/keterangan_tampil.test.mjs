// 🧪 UJI KETERANGAN TAMPIL HULU→HILIR (v13.26) — jawaban atas keluhan bro: "lirik ADA tapi TIDAK TAMPIL di videonya".
// Jalankan: node tests/keterangan_tampil.test.mjs
// Mensimulasikan RANTAI LENGKAP pakai KODE ASLI (ekstrak+eval, bukan replika):
//   kata Whisper → capWordsToClips (page.tsx) → insertFloatingTexts (page.tsx) → allClipTexts+paintFloatingTexts (editing.ts)
// Jika tiap baris terbukti terlukis pada detiknya → mesin umpan→tampil sehat; kegagalan di HP = hulu (log klinis).
import { readFileSync } from "fs";

const pg = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const ed = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");

// potong SATU fungsi utuh (hitung kurung kurawal — sumber bersih dari regex-literal berc kurawal)
function potongFungsi(src, nama) {
  const i0 = src.indexOf(`function ${nama}`);
  if (i0 < 0) { console.error(`💥 ${nama} tak ketemu`); process.exit(1); }
  const b0 = src.indexOf("{", i0);
  let d = 0;
  for (let i = b0; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(i0, i + 1); }
  }
  console.error(`💥 kurung ${nama} tak seimbang`); process.exit(1);
}
const lucut = (js) => js
  .replace(/: Record<string, (SlideOpt|string)>/g, "")
  .replace(/: \(SlideOpt \| null \| undefined\)\[\]/g, "")
  .replace(/: SlideOpt \| null \| undefined/g, "")
  .replace(/: CanvasRenderingContext2D/g, "")
  .replace(/: ClipText\[\]/g, "")
  .replace(/: CapWord\[\]/g, "")
  .replace(/: number\[\]/g, "")
  .replace(/ as ClipText/g, "")
  .replace(/ as SlideOpt/g, "")
  .replace(/ as number/g, "")
  .replace(/ as any/g, "")
  .replace(/: SlideOpt/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "");

console.log("📝👁️ Menguji RANTAI ASLI: capWordsToClips → insertFloatingTexts → paintFloatingTexts");
const jsLirik = lucut(potongFungsi(pg, "lyricTextStyle"));
const jsCWC = lucut(potongFungsi(pg, "capWordsToClips"));
const jsINS = lucut(potongFungsi(pg, "insertFloatingTexts"));
const jsACT = lucut(potongFungsi(ed, "allClipTexts"));
const jsPFT = lucut(potongFungsi(ed, "paintFloatingTexts"));

const common = `const uid=(p="s")=>p+"_t"+(Math.random().toString(36).slice(2,7)); const _r2=(v)=>Math.round(v*100)/100;`;
const capWordsToClips = new Function(`${common}${jsLirik}\n${jsCWC}; return capWordsToClips;`)();
const insertWith = (slides, sOpts, slideDuration, setOpts) =>
  new Function("slides", "slideOptsById", "slideDuration", "setSlideOptsById", `${jsINS}; return insertFloatingTexts;`)(slides, sOpts, slideDuration, setOpts);
const paintFloatingTexts = new Function("paintClipText", `${jsACT}\n${jsPFT}; return paintFloatingTexts;`);

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// SKENARIO BRO: 7 adegan × 39,64s (total 277,48s) + 148 kata hasil Whisper (20 segmen, garis waktu nyata)
const slides = Array.from({ length: 7 }, (_, i) => ({ id: "s" + i }));
const SLOT = 277.5 / 20;
const words = [];
for (let li = 0; li < 20; li++) {
  const nK = 6 + (li % 3); let t = 2.0 + li * SLOT + 0.4;
  for (let k = 0; k < nK; k++) { words.push({ text: `k${li}_${k}`, start: Math.round(t * 100) / 100, end: Math.round((t + 0.42) * 100) / 100, line: li }); t += 0.54; }
}
console.log(`   🎵 skenario: ${slides.length} slide, ${words.length} kata, ${new Set(words.map(w => w.line)).size} baris`);

// 1) capWordsToClips ASLI → ClipText karaoke sah
const textsCap = capWordsToClips(words, "standar", 0.055, 0.78);
T("20 baris ClipText jadi", textsCap.length === 20, `${textsCap.length}`);
T("semua id lyr_ (alat ⚓ nudge berlaku)", textsCap.every(t => /^lyr_/.test(t.id)));
T("semua dur waras (≥0,8s)", textsCap.every(t => t.dur >= 0.8));
T("karaokeWords ikut utuh per baris", textsCap.every(t => Array.isArray(t.karaokeWords) && t.karaokeWords.length >= 6));
T("karaoke relatif pas (mulai ≥0, ujung ≤dur)", textsCap.every(t => t.karaokeWords[0].start >= 0 && t.karaokeWords[t.karaokeWords.length - 1].end <= t.dur + 1e-6));
T("gaya standar asli (kuning #ffd93d, y 0,78)", textsCap.every(t => t.karaokeColor === "#ffd93d" && t.y === 0.78 && t.size === 0.055));
T("urutan start menaik", textsCap.every((t, i) => i === 0 || t.start >= textsCap[i - 1].start));

// 2) insertFloatingTexts ASLI → tiap baris masuk slide yang menaungi waktunya (TAK ADA yang dibuang diam-diam)
{
  let upIns = null;
  const insFn = insertWith(slides, {}, 39.64, (fn) => { upIns = fn; });
  insFn(textsCap); // ← panggil fungsi ASLI dengan teks hasil capWordsToClips ASLI
  const hasil = upIns({});
  let total = 0;
  const dursAsli = slides.map(() => 39.64); const startsAsli = []; let acc = 0;
  dursAsli.forEach(d => { startsAsli.push(acc); acc += d; });
  let mappingSalah = 0;
  for (const s of slides) {
    const txt = (hasil[s.id]?.texts) || [];
    total += txt.length;
    for (const t of txt) {
      const idx = slides.indexOf(s);
      if (!(startsAsli[idx] <= t.start + 1e-6 && t.start < startsAsli[idx] + dursAsli[idx] + 1e-6)) mappingSalah++;
    }
  }
  T("SEMUA 20 baris masuk (nol dibuang diam-diam)", total === 20, `${total}/20`);
  T("tiap baris di slide jendela waktunya", mappingSalah === 0, `${mappingSalah} salah`);

  // 3) paintFloatingTexts ASLI → tiap baris TERLUKIS pada detiknya (dengan stub lukis perekam)
  const optsHasil = slides.map(s => hasil[s.id]);
  const calls = [];
  const lukisRekam = (ctx, W, H, ct, clipT, dur, absT) => calls.push({ txt: ct.txt, clipT, dur, absT });
  const PFTsiap = paintFloatingTexts(lukisRekam);
  let takTerlukis = 0;
  for (const t of textsCap) {
    calls.length = 0;
    PFTsiap(null, 720, 1280, optsHasil, t.start + 0.05);
    const cocok = calls.find(c => c.txt === t.txt && Math.abs(c.clipT - 0.05) < 1e-6 && c.dur === t.dur);
    if (!cocok) takTerlukis++;
  }
  T("SEMUA 20 baris TERLUKIS pada waktunya di preview/ekspor", takTerlukis === 0, takTerlukis ? `${takTerlukis} GAGAL tampil!` : "tidak ada yang zonk");

  // tidak bocor waktu: sebelum mulai & sesudah habis TIDAK dilukis
  const t0 = textsCap[0];
  calls.length = 0; PFTsiap(null, 720, 1280, optsHasil, t0.start - 0.01);
  const bocorAwal = calls.some(c => c.txt === t0.txt);
  calls.length = 0; PFTsiap(null, 720, 1280, optsHasil, t0.start + t0.dur + 0.01);
  const bocorAkhir = calls.some(c => c.txt === t0.txt);
  T("tak bocor waktu (sebelum/sesudah jendela = tidak dilukis)", !bocorAwal && !bocorAkhir);
}

// 4) Proyek dipangkas pengguna (slide cuma 3, lirik sampai 236s) → teks tetap masuk & tetap terlukis
{
  const slides3 = slides.slice(0, 3);
  let up2 = null;
  const ins2 = insertWith(slides3, {}, 39.64, (fn) => { up2 = fn; });
  ins2(textsCap);
  const hasil2 = up2({});
  let total2 = 0; for (const s of slides3) total2 += ((hasil2[s.id]?.texts) || []).length;
  T("slide dipangkas: semua baris TETAP masuk (tak hilang)", total2 === 20, `${total2}/20`);
  const calls2 = [];
  const PFT2 = paintFloatingTexts((ctx, W, H, ct, clipT, dur) => calls2.push({ txt: ct.txt, clipT }));
  const terakhir = textsCap[textsCap.length - 1];
  PFT2(null, 720, 1280, slides3.map(s => hasil2[s.id]), terakhir.start + 0.05);
  T("baris terakhir tetap terlukis walau jauh melampaui slide", calls2.some(c => c.txt === terakhir.txt));
}

console.log(gagal ? `\n💥 ${gagal} uji GAGAL` : "\n🏁 RANTAI HULU→HILIR SEHAT: kalau baris ADA di track, dia PASTI dilukis pada detiknya — baik di preview maupun ekspor");
process.exit(gagal ? 1 : 0);
