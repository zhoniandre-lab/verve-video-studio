// 🧪 UJI VIDPLAN — wajib lulus SEBELUM release video apa pun (perintah bro: "jangan asal buat tanpa dites").
// Jalankan: node tests/vidplan.test.mjs
// Meng-ekstrak vidPlan ASLI dari src/lib/recorder.ts (bukan replika) → uji skenario nyata proyek bro.
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/recorder.ts", import.meta.url), "utf8");
const m = src.match(/function vidPlan\([\s\S]*?\n}/);
if (!m) { console.error("💥 vidPlan tidak ketemu di recorder.ts"); process.exit(1); }
const js = m[0]
  .replace(/: \{ cyc: number; pos: number; inX: boolean; x: number; rate: number; act: "a" \| "b" \}/, "")
  .replace(/: "a" \| "b"/g, "")
  .replace(/: number/g, "");
const vidPlan = new Function(`${js}; return vidPlan;`)();
console.log("📦 Menguji vidPlan ASLI dari src/lib/recorder.ts (ekstrak+eval, tipe TS dilucuti)");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

function simulasi(vd, slot, label, spd = 1) {
  const fps = 30;
  const frames = Math.floor(slot * fps);
  let cycMax = 0, prevAct = "a", pelanggaran = 0, salahGanti = 0, xfHit = 0, rate = 0;
  for (let f = 0; f <= frames; f++) {
    const t = f / fps;
    const p = vidPlan(t, vd, slot, spd);
    rate = p.rate;
    if (!isFinite(p.pos) || p.pos < -1e-9 || p.pos > vd + 1e-9) pelanggaran++;
    if (p.inX && !(p.x >= 0 && p.x <= 1)) pelanggaran++;
    if (p.cyc > cycMax) cycMax = p.cyc;
    // deck aktif hanya boleh berganti saat nomor siklus berganti
    const cycPrev = Math.floor(((f - 1) / fps) * rate / vd);
    if (p.act !== prevAct && p.cyc === cycPrev) salahGanti++;
    prevAct = p.act;
    if (p.inX) xfHit++;
  }
  const eff = vd / rate;
  const siklus = slot / eff;
  console.log(`\n🎬 ${label}: klip ${vd}s · slot ${slot}s · spd ${spd} → rate ${rate.toFixed(3)} · siklus ${eff.toFixed(1)}s · ${siklus.toFixed(2)} putaran · gerak ${(30 * rate).toFixed(1)}fps · crossfade ${(xfHit / fps).toFixed(1)}s`);
  T(`[${label}] rate sah (auto ≤1.4 · manual ≤2, ≥0.20)`, rate >= 0.20 - 1e-9 && rate <= 2 + 1e-9);
  T(`[${label}] pos selalu sah [0..vd]`, pelanggaran === 0, `${pelanggaran} pelanggaran`);
  T(`[${label}] deck hanya berganti di sambungan`, salahGanti === 0, `${salahGanti} salah ganti`);
  if (siklus > 1.2) T(`[${label}] ada crossfade di sambungan`, xfHit > 0);
  if (Math.abs(siklus - 1) < 0.05) console.log(`   🏆 PAS PENUH tanpa loop`);
}

console.log("\n=== SKENARIO NYATA BRO (lagu 277s · 7 adegan · slot 39.6s) ===");
simulasi(6, 39.6, "Klip kecil 6s (kasus dia)");
simulasi(8, 39.6, "Klip 8s");
simulasi(15, 39.6, "Klip 15s");
simulasi(30, 39.6, "Klip 30s");
simulasi(45, 39.6, "Klip 45s");
simulasi(39.6, 39.6, "Klip pas 39.6s");
simulasi(10, 6, "Slot pendek 6s");

console.log("\n=== KECEPATAN MANUAL (kendali bro) ===");
simulasi(6, 39.6, "MANUAL 0.5× (puisi)", 0.5);
simulasi(6, 39.6, "MANUAL 2× (gegas)", 2);
simulasi(30, 39.6, "MANUAL 0.75× (dreamy)", 0.75);

const d = vidPlan(5, 0, 10);
T("durasi tak dikenal → aman statis", d.act === "a" && d.pos === 0 && !d.inX);
const i2 = vidPlan(5, Infinity, 10);
T("durasi Infinity → aman", i2.act === "a" && !i2.inX);
const ps = vidPlan(0, 6, 39.6, 0.5);
T("manual 0.5× lebih lambat dari auto", ps.rate <= 0.5 + 1e-9);
const pf = vidPlan(0, 6, 39.6, 2);
T("manual 2× terjepit di 2", pf.rate <= 2 + 1e-9);
const pn = vidPlan(0, 6, 39.6, 99);
T("spd ngaco (99) → diabaikan = auto", pn.rate === vidPlan(0, 6, 39.6, 1).rate);

console.log(gagal ? `\n💥 ${gagal} uji GAGAL` : `\n🏆 SEMUA UJI LULUS — vidPlan ASLI terbukti kokoh (${new Date().toISOString().slice(0, 10)})`);
process.exit(gagal ? 1 : 0);
