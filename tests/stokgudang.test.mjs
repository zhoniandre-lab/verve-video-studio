// 🧪 UJI GUDANG & VARIASI — wajib lulus SEBELUM release (perintah bro: "jangan asal buat tanpa dites").
// Jalankan: node tests/stokgudang.test.mjs
// Ekstrak fungsi ASLI dari src/lib/stockvid.ts (bukan replika) → uji kueri bergaya & pilih bervariasi.
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/stockvid.ts", import.meta.url), "utf8");
const i0 = src.indexOf("const KATA_BUANG");
if (i0 < 0) { console.error("💥 KATA_BUANG tak ketemu"); process.exit(1); }
let js = src.slice(i0);
// lucuti TS seperlunya (fungsi murni — tanpa fetch/UI)
js = js
  .replace(/export /g, "")
  .replace(/new Set<string>\(/g, "new Set(")
  .replace(/: Record<string, string>/g, "")
  .replace(/: \{ nama\?: string; peran\?: string \}\[\]/g, "")
  .replace(/hindariId\?: Set<number>/g, "hindariId")
  .replace(/\?: Set<number>/g, "")
  .replace(/: VidPick\[\]/g, "")
  .replace(/: VidPick \| null/g, "")
  .replace(/: VidPick/g, "")
  .replace(/: number/g, "")
  .replace(/: string\[\]/g, "")
  .replace(/: string/g, "");
const P = new Function(`${js}; return { kueriDariScene, pilihKlipTerbaik, pilihKlipBervariasi, temaDariKarakter, GAYA_EN };`)();
console.log("📦 Menguji fungsi ASLI dari src/lib/stockvid.ts (ekstrak+eval, tipe TS dilucuti)");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1) GAYA cukup banyak buat diputar antar-adegan
T("GAYA_EN ≥ 6 gaya", Array.isArray(P.GAYA_EN) && P.GAYA_EN.length >= 6, P.GAYA_EN.join(", "));

// 2) kueri bergaya: mengandung jangkar tema + kata gaya; tetap hemat kata
{
  const tema = P.temaDariKarakter([{ nama: "Ibu", peran: "ibu" }, { nama: "Rian", peran: "anak" }]);
  const q = P.kueriDariScene(
    "an elderly mother holding an old shirt in a dim bedroom, tears on her cheek",
    "Ibu memeluk baju lama sambil menangis", tema, "sedih", "close up");
  const kata = q.split(/\s+/);
  console.log(`   🔍 kueri jadi: "${q}" (tema "${tema}")`);
  T("jangkar tema (mother) masuk kueri", /mother/.test(q));
  T("kata gaya sinematik masuk kueri", /(close|up)/.test(q));
  T("kueri hemat (2–6 kata)", kata.length >= 2 && kata.length <= 6, `${kata.length} kata`);
  const q2 = P.kueriDariScene("", "", tema, "sedih", "aerial view");
  T("fallback tetap rapi saat visual kosong", typeof q2 === "string" && q2.length > 3 && !/undefined|NaN/.test(q2), `"${q2}"`);
  const q3 = P.kueriDariScene("a mother and child at the kitchen table", "sarapan bersama", tema, "haru", "");
  T("tanpa gaya → perilaku lama utuh (≤5 kata)", q3.split(/\s+/).length <= 5, `"${q3}"`);
}

// 3) pilihKlipBervariasi: variasi NYATA + anti-kembar dihormati + fallback aman
{
  const mk = (id, dur, w = 1280) => ({ id, src: `u${id}`, sd: `s${id}`, thumb: `t${id}`, dur, by: "x", link: "", w, h: 720 });
  const pool = Array.from({ length: 10 }, (_, i) => mk(100 + i, 20 + i)); // durasi 20..29 → skor berlapis
  // variasi: 300 kali pilih harus menghasilkan >1 klip berbeda
  const beda = new Set();
  for (let k = 0; k < 300; k++) beda.add(P.pilihKlipBervariasi(pool, 24).id);
  T("variasi nyata (>1 klip berbeda dari 300 undian)", beda.size > 1, `${beda.size} klip berbeda`);
  T("variasi tak liar (≤5 kandidat terbaik)", beda.size <= 5);
  // anti-kembar: kandidat terbaik (dur 29) dihindari → tak pernah terpilih
  const top = mk(199, 24);
  const pool2 = [...pool, top];
  let bocor = 0;
  for (let k = 0; k < 200; k++) if (P.pilihKlipBervariasi(pool2, 100, new Set([199])).id === 199) bocor++;
  T("anti-kembar: klip terpakai 0 kali terpilih", bocor === 0, `${bocor} kebocoran`);
  // semua dihindari → tetap kembali sesuatu (daripada adegan kosong)
  const sem = P.pilihKlipBervariasi(pool, 24, new Set(pool.map(v => v.id)));
  T("semua terpakai → fallback tetap mengembalikan klip", !!sem);
  // kosong → null
  T("pool kosong → null (jujur)", P.pilihKlipBervariasi([], 24) === null);
  // deterministik lama tak rusak
  const b1 = P.pilihKlipTerbaik(pool, 24), b2 = P.pilihKlipTerbaik(pool, 24);
  T("pilihKlipTerbaik tetap deterministik", b1 && b2 && b1.id === b2.id, `#${b1?.id}`);
}

if (gagal) { console.error(`\n💥 ${gagal} UJI GAGAL — JANGAN RILIS`); process.exit(1); }
console.log("\n🏆 SEMUA UJI LULUS — kueri bergaya + pilih bervariasi ASLI terbukti (2026-07-24)");
