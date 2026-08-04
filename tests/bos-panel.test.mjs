// 🧪 UJI PANEL BOS (L3.5) — wajib lulus SEBELUM release.
// Jalankan: node tests/bos-panel.test.mjs
// Meng-ekstrak fungsi MURNI ASLI dari setelan.ts & bos.ts (tipe TS dilucuti) + cek gerbang nancap di mesin asli.
import { readFileSync } from "fs";

const st  = readFileSync(new URL("../src/lib/setelan.ts", import.meta.url), "utf8");
const bs  = readFileSync(new URL("../src/lib/bos.ts", import.meta.url), "utf8");
const hc  = readFileSync(new URL("../src/lib/hcnsec.ts", import.meta.url), "utf8");
const mus = readFileSync(new URL("../src/app/api/hcnsec/music/route.ts", import.meta.url), "utf8");
const lay = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const ban = readFileSync(new URL("../src/app/pengumuman-banner.tsx", import.meta.url), "utf8");
const hlm = readFileSync(new URL("../src/app/bos/page.tsx", import.meta.url), "utf8");
const rk  = readFileSync(new URL("../src/app/api/bos/ringkas/route.ts", import.meta.url), "utf8");
const rs  = readFileSync(new URL("../src/app/api/bos/setelan/route.ts", import.meta.url), "utf8");
const rp  = readFileSync(new URL("../src/app/api/pengumuman/route.ts", import.meta.url), "utf8");
const cb  = readFileSync(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase-bos-jalankan-sekali.sql", import.meta.url), "utf8");

function ekstrak(src, nama, ganti) {
  const m = src.match(new RegExp(`function ${nama}\\([\\s\\S]*?\\n}\\n`));
  if (!m) { console.error(`💥 ${nama} tidak ketemu`); process.exit(1); }
  let js = m[0];
  for (const [dari, ke] of ganti) js = js.replace(dari, ke);
  return js;
}
const normalisasi = new Function(ekstrak(st, "normalisasiSetelan", [
  ["function normalisasiSetelan(x: any): SetelanPanel", "function normalisasiSetelan(x)"],
  [": Record<string, number>", ""], [/const mati: string\[\]/, "const mati"],
  [/\((f: any|f: string)\)/g, "(f)"],
]) + "; return normalisasiSetelan;")();

const batasi = new Function(ekstrak(st, "batasiFitur", [
  ["function batasiFitur(fitur: string, s: SetelanPanel, terpakai: number | null): { blokir: boolean; alasan?: string }", "function batasiFitur(fitur, s, terpakai)"],
]) + "; return batasiFitur;")();

const mulaiWIB = new Function(ekstrak(st, "mulaiHariIniWIB", [
  ["function mulaiHariIniWIB(ms?: number): string", "function mulaiHariIniWIB(ms)"],
]) + "; return mulaiHariIniWIB;")();

const bosFns = ekstrak(bs, "emailBos", [["function emailBos(envVal?: string): string[]", "function emailBos(envVal)"]])
  + "\n" + ekstrak(bs, "apakahBos", [["function apakahBos(email: string | null | undefined, envVal?: string): boolean", "function apakahBos(email, envVal)"]]);
const { emailBos, apakahBos } = new Function(bosFns + "; return { emailBos, apakahBos };")();

let gagal = 0, n = 0;
const T = (nama, ok, info = "") => { n++; console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

console.log("📦 A. normalisasiSetelan ASLI — input sampah jadi setelan aman");
T("input sampah → default", JSON.stringify(normalisasi("kacau")) === JSON.stringify({ mati: [], batas: {}, pengumuman: "" }));
T("mati: non-string dibuang", JSON.stringify(normalisasi({ mati: ["gambar", 7, null, ""] }).mati) === '["gambar"]');
T("batas: nol/minus/NaN dibuang, desimal dibulatkan ke bawah", (() => { const b = normalisasi({ batas: { gambar: 5.9, musik: 0, teks: "abc" } }).batas; return b.gambar === 5 && b.musik === undefined && b.teks === undefined; })());
T("pengumuman dipotong 300", normalisasi({ pengumuman: "x".repeat(500) }).pengumuman.length === 300);

console.log("📦 B. batasiFitur ASLI — keputusan gerbang");
T("fitur mati → blokir dengan pesan sopan", batasi("gambar", { mati: ["gambar"], batas: {}, pengumuman: "" }, 0).blokir === true && batasi("gambar", { mati: ["gambar"], batas: {}, pengumuman: "" }, 0).alasan.includes("dimatikan"));
T("fitur lain tetap bebas", batasi("teks", { mati: ["gambar"], batas: {}, pengumuman: "" }, 0).blokir === false);
T("terpakai >= batas → blokir kuota", batasi("gambar", { mati: [], batas: { gambar: 5 }, pengumuman: "" }, 5).alasan.includes("Kuota harian"));
T("terpakai < batas → bebas", batasi("gambar", { mati: [], batas: { gambar: 5 }, pengumuman: "" }, 3).blokir === false);
T("terpakai null (tabel error) → LOLLOS (jangan hukum pengguna)", batasi("gambar", { mati: [], batas: { gambar: 5 }, pengumuman: "" }, null).blokir === false);
T("setelan null → bebas", batasi("gambar", null, 99).blokir === false);

console.log("📦 C. mulaiHariIniWIB ASLI — hari dihitung versi WIB, bukan UTC");
const ms = Date.parse("2026-08-04T20:00:00Z"); // = 05 Agustus jam 03:00 WIB
T("jam 03:00 WIB 5 Agu → 'hari ini' mulai 4 Agu 17:00Z", mulaiWIB(ms) === "2026-08-04T17:00:00.000Z", mulaiWIB(ms));
T("jam 16:00 WIB 4 Agu → mulai 3 Agu 17:00Z", mulaiWIB(Date.parse("2026-08-04T09:00:00Z")) === "2026-08-03T17:00:00.000Z");

console.log("📦 D. penjaga pintu ASLI — email bos");
T("parse env koma + spasi + kapital", JSON.stringify(emailBos(" A@x.com ,B@y.COM ")) === '["a@x.com","b@y.com"]');
T("email cocok walau beda kapital", apakahBos("A@x.COM", "a@x.com") === true);
T("email tak terdaftar → false", apakahBos("maling@x.com", "bos@x.com") === false);
T("belum login (null) → false", apakahBos(null, "bos@x.com") === false);
T("env kosong → false (tak ada yang boleh masuk)", apakahBos("bos@x.com", "") === false);

console.log("📦 E. gerbang NANCAP di mesin asli SEBELUM keluar duit");
T("postJson: gerbang dipanggil SEBELUM blok try (sebelum fetch)", hc.includes("gerbangFitur(fiturDariPath(path))") && hc.indexOf("gerbangFitur(fiturDariPath(path))") < hc.indexOf("try {"));
T("postJson: saat blokir → timeout dibersihkan + lempar 503", hc.includes("clearTimeout(to); throw new ApiError(g.alasan") && hc.includes("503, path)"));
T("rute musik: gerbang musik sebelum loop endpoint", mus.includes('gerbangFitur("musik")') && mus.indexOf('gerbangFitur("musik")') < mus.indexOf("for (const url of endpoints)"));
T("rute musik: blokir → 503 + status fitur_dimatikan", mus.includes('"fitur_dimatikan"'));
T("kaidah tetap: TIDAK ADA await catatKredit", !/await\s+catatKredit/.test(hc) && !/await\s+catatKredit/.test(mus));

console.log("📦 F. rute & wajah");
T("ringkas: pintu mintaBos + agregat + setelan + WIB", rk.includes("mintaBos") && rk.includes("agregatRingkas") && rk.includes("mulaiHariIniWIB"));
T("setelan: GET+POST pakai mintaBos + setSetelan", rs.includes("export async function GET") && rs.includes("export async function POST") && rs.includes("setSetelan"));
T("pengumuman publik: getSetelan + no-store", rp.includes("getSetelan") && rp.includes("no-store"));
T("callback: tukar kode + anti open-redirect", cb.includes("exchangeCodeForSession") && cb.includes('startsWith("/")'));
T("halaman bos: login Google + link ajaib + saklar + simpan", hlm.includes('"google"') && hlm.includes("signInWithOtp") && hlm.includes('role="switch"') && hlm.includes("/api/bos/setelan"));
T("banner terpasang di layout & ambil /api/pengumuman", lay.includes("<PengumumanBanner />") && ban.includes("/api/pengumuman"));
T("SQL: tabel app_settings + baris panel_bos + RLS", sql.includes("create table if not exists public.app_settings") && sql.includes("panel_bos") && sql.includes("enable row level security"));

console.log(`\n${gagal === 0 ? "🏁 SEMUA HIJAU" : "💥 ADA YANG GAGAL"} — ${n - gagal}/${n} cek lulus`);
process.exit(gagal === 0 ? 0 : 1);
