// 🧪 UJI SUTRADARA PAHAM LOKAL (v13.28) — niat "keterangan otomatis" TOLERAN TYPO, tanpa jaringan.
// Jalankan: node tests/sutradara_paham.test.mjs — ekstrak+eval KODE ASLI page.tsx (bukan replika).
import { readFileSync } from "fs";

const pg = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
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
  .replace(/new Set<string>\(/g, "new Set(")
  .replace(/: Set<string>/g, "")
  .replace(/: string\[\]/g, "")
  .replace(/: boolean/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "");

const src = ["gram2", "miripKata", "adaKataMirip", "mintaKeteranganOtomatis"].map(n => lucut(potongFungsi(pg, n))).join("\n");
const P = new Function(`${src}; return { miripKata, mintaKeteranganOtomatis };`)();
console.log("🎧 Menguji detektor ASLI mintaKeteranganOtomatis dari page.tsx");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1) niat BUAT/pasang keterangan otomatis (termasuk typo khas bro) → HARUS paham
const POSITIF = [
  "buatkan keterangan otomatis",
  "keterangan otomatisnya jalanin dong",
  "ketermgan otimatis",              // typo tebal ala HP
  "buatkan lirik otomatis",
  "sinkronkan lirik laguku",
  "selarasin lirik lagu",
  "pasang caption dong",
  "caption otomatis plis",
  "bikinkan subtitle",
  "subtitle otomatis",
  "nyalakan karaoke",
  "buatin keterangan",
  "buat lirik menyala ngikut lagu",
];
for (const m of POSITIF) T(`paham: "${m}"`, P.mintaKeteranganOtomatis(m) === true);

// 2) niat LAIN / niat HAPUS → HARUS ditolak (jangan asal jalan)
const NEGATIF = [
  "hapus keterangan",
  "hapus caption otomatis tadi",
  "hapus semua liriknya",
  "bersihkan lirik lama dong",
  "geser keterangan +0.5",
  "keterangan kok lambat ya",
  "keterangannya kenapa tidak muncul",
  "transisi semua dissolve",
  "pasang filter hangat di semua adegan",
  "halo sutradara, bisa bantu?",
  "lirik?",
  "render sekarang",
];
for (const m of NEGATIF) T(`tolak: "${m}"`, P.mintaKeteranganOtomatis(m) === false);

// 3) miripKata satuan
T("identik = 1", Math.abs(P.miripKata("keterangan", "keterangan") - 1) < 1e-9);
T("asing total = 0", Math.abs(P.miripKata("abcde", "vwxyz")) < 1e-9);
T('typo "ketermgan"≈"keterangan"', P.miripKata("ketermgan", "keterangan") >= 0.55, P.miripKata("ketermgan", "keterangan").toFixed(2));
T('typo "otimatis"≈"otomatis"', P.miripKata("otimatis", "otomatis") >= 0.6, P.miripKata("otimatis", "otomatis").toFixed(2));

console.log(gagal ? `\n💥 ${gagal} uji GAGAL` : "\n🏁 SUTRADARA PAHAM LOKAL — niat keterangan otomatis dikenali, niat lain ditolak sopan");
process.exit(gagal ? 1 : 0);
