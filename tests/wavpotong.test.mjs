// 🧪 UJI POTONG LAGU BESAR (v13.22) — wajib lulus SEBELUM release (perintah bro: "jangan asal buat tanpa dites").
// Jalankan: node tests/wavpotong.test.mjs
// Ekstrak fungsi MURNI ASLI dari src/lib/audiocc.ts (bukan replika) → uji rencana potong, ukuran WAV, PCM16, tajuk RIFF.
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/audiocc.ts", import.meta.url), "utf8");
const i0 = src.indexOf("export const WHISPER_RATE");
const i1 = src.indexOf("// ✂️[[BATAS_UJI_MURNI]]");
if (i0 < 0 || i1 < 0 || i1 < i0) { console.error("💥 wilayah uji murni tak ketemu di audiocc.ts"); process.exit(1); }
let js = src.slice(i0, i1)
  .replace(/export /g, "")
  .replace(/: \{ idx: number; start: number; dur: number \}\[\]/g, "")
  .replace(/: number = WHISPER_CHUNK_SEC/g, " = WHISPER_CHUNK_SEC")
  .replace(/: number = WHISPER_RATE/g, " = WHISPER_RATE")
  .replace(/: void/g, "")
  .replace(/: DataView/g, "")
  .replace(/: string/g, "")
  .replace(/: number/g, "");
const P = new Function(`${js}; return { WHISPER_RATE, WHISPER_CHUNK_SEC, WHISPER_MAX_UNGGAH, byteWav, rencanaChunk, floatKePcm16, isiHeaderWav };`)();
console.log("✂️📦 Menguji fungsi ASLI dari src/lib/audiocc.ts (ekstrak+eval, tipe TS dilucuti)");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1) Konfigurasi inti
T("WHISPER_RATE 16kHz (telinga asli Whisper)", P.WHISPER_RATE === 16000, `${P.WHISPER_RATE} Hz`);
T("pagar kita di bawah pagar Vercel", P.WHISPER_MAX_UNGGAH < 4_500_000, `${P.WHISPER_MAX_UNGGAH} byte`);

// 2) SATU potong 100 detik dijamin muat pagar
{
  const b = P.byteWav(P.WHISPER_RATE * P.WHISPER_CHUNK_SEC);
  T("potong 100 detik WAV ≤ pagar aman", b <= P.WHISPER_MAX_UNGGAH && b < 4_500_000, `${b.toLocaleString("id-ID")} byte`);
}
T("byteWav(0) = 44 byte tajuk saja", P.byteWav(0) === 44);
T("byteWav negatif dijepit 44", P.byteWav(-5) === 44);

// 3) Rencana potong menutup durasi lagu bro (±277 detik) TANPA celah/tumpang
{
  const r = P.rencanaChunk(277.5);
  T("lagu 277,5s → 3 potong", r.length === 3, r.map(c => `[${c.start}s+${c.dur}s]`).join(" "));
  T("mulai berurutan 0/100/200", r.length === 3 && r[0].start === 0 && r[1].start === 100 && r[2].start === 200);
  const menutup = r.reduce((a, c) => a + c.dur, 0);
  T("jumlah durasi = durasi lagu (tak ada celah)", Math.abs(menutup - 277.5) < 1e-9, `Σ=${menutup}`);
  const nyambung = r.every((c, i) => i === 0 || Math.abs(r[i - 1].start + r[i - 1].dur - c.start) < 1e-9);
  T("sambungan presisi (tak tumpang)", nyambung);
  T("ujung akhir = durasi lagu", Math.abs(r[r.length - 1].start + r[r.length - 1].dur - 277.5) < 1e-9);
}
{
  const r1 = P.rencanaChunk(100);
  T("pas 100s → TEPAT 1 potong", r1.length === 1 && r1[0].dur === 100);
  const r2 = P.rencanaChunk(100.01);
  T("100,01s → 2 potong (sisa 0,01s ikut)", r2.length === 2 && Math.abs(r2[1].dur - 0.01) < 1e-9, `sisa=${r2[1]?.dur}`);
  const r4 = P.rencanaChunk(365);
  T("lagu panjang 365s → 4 potong", r4.length === 4 && r4[3].dur === 65);
  T("durasi 0/negatif/NaN → kosong", P.rencanaChunk(0).length === 0 && P.rencanaChunk(-3).length === 0 && P.rencanaChunk(NaN).length === 0);
}

// 4) PCM16 jepit keras & konversi benar
{
  T("float 1.0 → 32767", P.floatKePcm16(1) === 32767);
  T("float -1.0 → -32768", P.floatKePcm16(-1) === -32768);
  T("jepit atas (2.0 → 32767)", P.floatKePcm16(2) === 32767);
  T("jepit bawah (-2.0 → -32768)", P.floatKePcm16(-2) === -32768);
  T("nol → 0", P.floatKePcm16(0) === 0);
  T("0.5 → 16384", P.floatKePcm16(0.5) === 16384, `${P.floatKePcm16(0.5)}`);
  T("-0.5 → -16384", P.floatKePcm16(-0.5) === -16384, `${P.floatKePcm16(-0.5)}`);
}

// 5) Tajuk WAV 44 byte sah (RIFF/WAVE/fmt /data, PCM16 mono 16kHz)
{
  const n = 16000; // 1 detik
  const dv = new DataView(new ArrayBuffer(P.byteWav(n)));
  P.isiHeaderWav(dv, n, 16000);
  const ascii = (pos, len) => Array.from({ length: len }, (_, i) => String.fromCharCode(dv.getUint8(pos + i))).join("");
  T('sihir "RIFF"', ascii(0, 4) === "RIFF");
  T("ukuran RIFF = 36+data", dv.getUint32(4, true) === 36 + n * 2, `${dv.getUint32(4, true)}`);
  T('sihir "WAVE" & "fmt "', ascii(8, 4) === "WAVE" && ascii(12, 4) === "fmt ");
  T("blok fmt 16 & PCM", dv.getUint32(16, true) === 16 && dv.getUint16(20, true) === 1);
  T("mono", dv.getUint16(22, true) === 1);
  T("rate 16000 & byteRate 32000", dv.getUint32(24, true) === 16000 && dv.getUint32(28, true) === 32000);
  T("blockAlign 2 & 16-bit", dv.getUint16(32, true) === 2 && dv.getUint16(34, true) === 16);
  T('sihir "data" & ukurannya', ascii(36, 4) === "data" && dv.getUint32(40, true) === n * 2);
}

console.log(gagal ? `\n💥 ${gagal} uji GAGAL` : "\n🏁 SEMUA UJI LULUS — lagu besar siap dipotong & dibaca AI");
process.exit(gagal ? 1 : 0);
