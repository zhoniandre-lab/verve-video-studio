// 🧪 UJI FONDASI KREDIT (L3) — wajib lulus SEBELUM release.
// Jalankan: node tests/kredit-ledger.test.mjs
// Meng-ekstrak fungsi ASLI dari src/lib/ledger.ts (tipe TS dilucuti) + cek stub nancap di mesin asli.
import { readFileSync } from "fs";

const led = readFileSync(new URL("../src/lib/ledger.ts", import.meta.url), "utf8");
const hc  = readFileSync(new URL("../src/lib/hcnsec.ts", import.meta.url), "utf8");
const mus = readFileSync(new URL("../src/app/api/hcnsec/music/route.ts", import.meta.url), "utf8");
const kr  = readFileSync(new URL("../src/app/api/kredit-ringkas/route.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase-jalankan-sekali.sql", import.meta.url), "utf8");

function ekstrak(src, nama, gantiTtd) {
  const m = src.match(new RegExp(`function ${nama}\\([\\s\\S]*?\\n}\\n`));
  if (!m) { console.error(`💥 ${nama} tidak ketemu`); process.exit(1); }
  let js = m[0];
  for (const [dari, ke] of gantiTtd) js = js.replace(dari, ke);
  return js;
}
// (regex ekstrak membuang prefiks "export ", jadi pengganti tanda tangan tanpa "export")
const fiturDariPath = new Function(ekstrak(led, "fiturDariPath", [
  ["function fiturDariPath(path: string): FiturKredit", "function fiturDariPath(path)"],
]) + "; return fiturDariPath;")();

const potongErr = new Function(ekstrak(led, "potongErr", [
  ["function potongErr(e: any): string", "function potongErr(e)"],
]) + "; return potongErr;")();

const agregatRingkas = new Function(ekstrak(led, "agregatRingkas", [
  [/function agregatRingkas\([\s\S]*?\} \{/, "function agregatRingkas(baris) {"],
  [/: Record<[\s\S]*?> = \{/g, " = {"],
]) + "; return agregatRingkas;")();

let gagal = 0, n = 0;
const T = (nama, ok, info = "") => { n++; console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

console.log("📦 A. fiturDariPath ASLI — endpoint → fitur manusiawi");
T("chat/completions → teks", fiturDariPath("/chat/completions") === "teks");
T("images/generations → gambar", fiturDariPath("/images/generations") === "gambar");
T("audio/speech → suara-tts", fiturDariPath("/audio/speech") === "suara-tts");
T("videos/generations → video", fiturDariPath("/videos/generations") === "video");
T("url suno → musik", fiturDariPath("https://api.kie.ai/api/v1/suno/generate") === "musik");
T("endpoint asing → lainnya", fiturDariPath("/entah/apa") === "lainnya");
T("path kosong tak meledak", fiturDariPath("") === "lainnya");

console.log("📦 B. potongErr ASLI — kunci rahasia tersensor, panjang dibatasi");
T("Bearer tersensor", !potongErr({ message: "gagal Bearer abcDEF123" }).includes("abcDEF123"));
T("sk- tersensor", !potongErr(new Error("kunci sk-AbcDef999xxx bocor")).includes("AbcDef999xxx"));
T("maksimal 200 karakter", potongErr("x".repeat(1000)).length === 200);
T("string polos lolos apa adanya", potongErr("timeout bro") === "timeout bro");
T("null/undefined tak meledak", typeof potongErr(null) === "string");

console.log("📦 C. agregatRingkas ASLI — hitung pemakaian & kegagalan");
const baris = [
  { fitur: "gambar", ok: true,  ms: 2000, created_at: "2026-08-03T10:00:00Z" },
  { fitur: "gambar", ok: false, ms: 500,  created_at: "2026-08-03T11:00:00Z", err: "402" },
  { fitur: "musik",  ok: true,  ms: 9000, created_at: "2026-08-04T02:00:00Z" },
  { fitur: "musik",  ok: true,  ms: null, created_at: "2026-08-04T03:00:00Z" },
  { ok: true, created_at: "2026-08-04T04:00:00Z" }, // fitur hilang → lainnya
];
const r = agregatRingkas(baris);
T("total semua = 5", r.totalSemua === 5, `dapat ${r.totalSemua}`);
T("gagal semua = 1", r.gagalSemua === 1);
T("gambar: 2 pakai / 1 ok / 1 gagal", r.perFitur.gambar?.total === 2 && r.perFitur.gambar.ok === 1 && r.perFitur.gambar.gagal === 1);
T("gambar msTotal = 2500", r.perFitur.gambar?.msTotal === 2500, `dapat ${r.perFitur.gambar?.msTotal}`);
T("musik: 2 ok, msTotal 9000 (null diabaikan)", r.perFitur.musik?.ok === 2 && r.perFitur.musik.msTotal === 9000);
T("fitur hilang → 'lainnya'", r.perFitur.lainnya?.total === 1);
T("per hari: 2026-08-03 = 2 (1 gagal)", r.perHari["2026-08-03"]?.total === 2 && r.perHari["2026-08-03"].gagal === 1);
T("per hari: 2026-08-04 = 3 (0 gagal)", r.perHari["2026-08-04"]?.total === 3 && r.perHari["2026-08-04"].gagal === 0);
T("array kosong → nol semua, tak meledak", (() => { const z = agregatRingkas([]); return z.totalSemua === 0 && Object.keys(z.perFitur).length === 0; })());

console.log("📦 D. stub NANCAP di mesin asli (bukan roda paralel)");
T("hcnsec impor ledger", hc.includes('from "./ledger"'));
T("postJson mencatat 3 titik (sukses teks, sukses biner, gagal)", (hc.match(/catatKredit\(\{/g) || []).length === 3, (hc.match(/catatKredit\(\{/g) || []).length + " titik");
T("postJson mencatat kegagalan dengan err tersensor", hc.includes("ok: false") && hc.includes("err: potongErr(e)"));
T("rute musik impor ledger", mus.includes('import { catatKredit } from "../../../../lib/ledger"'));
T("rute musik mencatat fitur 'musik' + penyedia", mus.includes('catatKredit({ fitur: "musik"') && mus.includes("penyedia: provider"));

console.log("📦 E. Anti-ganggu total — kaidah L3 tak dilanggar");
T("TIDAK ADA 'await catatKredit' di mana pun", !/await\s+catatKredit/.test(hc) && !/await\s+catatKredit/.test(mus));
T("catatKredit dibungkus try/catch (tak pernah throw)", /export function catatKredit[\s\S]*?try \{[\s\S]*?\} catch/.test(led));
T("rute dasbor pakai kunci rahasia lingkungan", kr.includes("KREDIT_ADMIN_KEY") && kr.includes("kunci !== kunciBenar"));
T("rute dasbor no-store (data selalu segar)", kr.includes('"no-store"'));
T("SQL bikin tabel + indeks + RLS", sql.includes("create table if not exists public.credit_ledger") && sql.includes("enable row level security"));

console.log(`\n${gagal === 0 ? "🏁 SEMUA HIJAU" : "💥 ADA YANG GAGAL"} — ${n - gagal}/${n} cek lulus`);
process.exit(gagal === 0 ? 0 : 1);
