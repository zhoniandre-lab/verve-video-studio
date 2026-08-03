// 🧪 UJI SATU PENGGARIS (FASE-A.3) — strip & mesin wajib sepenggaris.
// Jalankan: node tests/satupenggaris.test.mjs
// Bukti rekam layar 2026-08-04: panggung menghabiskan ≈3,6d/objek (durasi 3,0 + transisi 0,6),
// sedangkan strip menghitung 3,0d/objek → garis rol "telat/duluan", film terpotong di tengah rasa.
// Bedah: clipW() kini menghitung span mesin (durs+tdurs). Tes ini memastikan:
//  1) rumus clipW ASLI di page.tsx memuat tdurs (bukan roda paralel — diekstrak dari sumber);
//  2) Σ lebar strip == timeline.total mesin (garis PAS di tiap pembatas objek & di ujung film);
//  3) aritmetika plus-model buildTimeline ASLI dari editing.ts tak bergeser.
import { readFileSync } from "fs";

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const editing = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");

/* ---------- 1. Ekstrak rumus clipW ASLI dari page.tsx ---------- */
const mw = page.match(/function clipW\(i: number\): number \{ return ([^;]+); \}/);
if (!mw) { console.error("💥 clipW tidak ketemu di page.tsx"); process.exit(1); }
const clipW = new Function("timeline", "PXS0", `return (i) => ${mw[1]};`);
const PXS0 = 72;
// proyek persis pola user: klip 3,0d dengan transisi 0,6d + outro 2d (tanpa transisi buntut)
const tlUser = { durs: [3, 3, 3, 3, 3, 3, 2], tdurs: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0], total: 23.6, starts: [0, 3.6, 7.2, 10.8, 14.4, 18, 21.6] };
const w = tlUser.durs.map((_, i) => clipW(tlUser, PXS0)(i));

T("clipW memuat span mesin: klip 3,0+0,6 = 259,2px (bukan 216px)", Math.abs(w[0] - 259.2) < 1e-9, `w0=${w[0]}`);
T("clipW klip terakhir (outro, tanpa transisi buntut) tetap 2,0d", Math.abs(w[6] - 144) < 1e-9, `w6=${w[6]}`);
const lebarStrip = w.reduce((a, x) => a + x, 0);
T("Σ lebar strip == timeline.total × PXS0 (SATU PENGGARIS)", Math.abs(lebarStrip - tlUser.total * PXS0) < 1e-9, `${lebarStrip}px vs ${tlUser.total * PXS0}px`);
T("tepi kanan klip-1 strip == starts[1] mesin (garis PAS di pembatas objek 2)", Math.abs(w[0] / PXS0 - tlUser.starts[1]) < 1e-9, `${w[0] / PXS0}d vs ${tlUser.starts[1]}d`);
// setiap pembatas: tepi kanan klip-i == starts[i+1]
{
  let acc = 0, semuaPas = true;
  for (let i = 0; i < tlUser.durs.length - 1; i++) { acc += w[i] / PXS0; if (Math.abs(acc - tlUser.starts[i + 1]) > 1e-9) semuaPas = false; }
  T("SEMUA pembatas objek: lebar kumulatif strip == starts mesin", semuaPas);
}
T("rumus lama (durasi murni tanpa tdurs) sudah dimusnahkan dari clipW", !/function clipW\(i: number\): number \{ return Math\.max\(80, \(timeline\?\.durs\?\.\[i\] \|\| 0\) \* PXS0\)/.test(page));

/* ---------- 2. Aritmetika plus-model buildTimeline ASLI (editing.ts) ---------- */
const mb = editing.match(/export function buildTimeline\([\s\S]*?\n}/);
if (!mb) { console.error("💥 buildTimeline tidak ketemu di editing.ts"); process.exit(1); }
const js = mb[0].replace(/export function /, "function ").replace(/: number\[\]/g, "").replace(/: string\[\]/g, "").replace(/: Timeline/g, "").replace(/: number/g, "");
const factory = new Function("canonicalTrans", `${js}; return buildTimeline;`);
{
  const TL = factory(() => "dissolve")([3, 3, 2], [0.6, 0.5, 0], ["x", "x", "x"]);
  T("buildTimeline plus-model: starts = [0, 3.6, 7.1] (3+0.6, lalu 3+0.5)", TL.starts.length === 3 && Math.abs(TL.starts[0] - 0) < 1e-9 && Math.abs(TL.starts[1] - 3.6) < 1e-9 && Math.abs(TL.starts[2] - 7.1) < 1e-9, `starts=${JSON.stringify(TL.starts)}`);
  T("buildTimeline plus-model: total = 3+0.6 + 3+0.5 + 2 = 9.1", Math.abs(TL.total - 9.1) < 1e-9, `total=${TL.total}`);
  const TN = factory(() => "none")([3, 3, 2], [0.6, 0.5, 0], ["x", "x", "x"]);
  T("transisi none: total = Σ durasi murni = 8", Math.abs(TN.total - 8) < 1e-9, `total=${TN.total}`);
}

/* ---------- 3. Wiring tetap (regresi) ---------- */
T("label durasi klip tetap jujur menampilkan durasi dasar (3,0d)", /\{\(timeline\?\.durs\?\.\[i\] \|\| 0\)\.toFixed\(1\)\}d/.test(page));
T("dispTotal tetap lahir dari timeline.total mesin", /const total = timeline\?\.total \|\| 0;/.test(page) && /const dispTotal = Math\.max\(total/.test(page));
T("garis penanda tetap tetap di tengah (konten bergerak di bawahnya, ala CapCut)", /v6e-playhead-fixed/.test(page));
T("strip tetap seek via skala PXS0 yang sama", /p\.onSeek\(clampN\(sl \/ PXS0/.test(page));

console.log(gagal === 0 ? "\n🏁 SATU PENGGARIS SEHAT — strip ≡ mesin ≡ ekspor. Garis rol PAS di setiap pembatas." : `\n💥 ${gagal} uji gagal`);
process.exit(gagal === 0 ? 0 : 1);
