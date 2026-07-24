// 🧪 UJI VIDLOOPPREV — wajib lulus SEBELUM release (perintah bro: "jangan asal buat tanpa dites").
// Jalankan: node tests/vidloop.test.mjs
// Meng-ekstrak vidLoopPrev ASLI dari src/lib/recorder.ts → uji kontinuitas & ketiadaan rewind terlihat.
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/lib/recorder.ts", import.meta.url), "utf8");
const m = src.match(/function vidLoopPrev\([\s\S]*?\n}/);
if (!m) { console.error("💥 vidLoopPrev tidak ketemu di recorder.ts"); process.exit(1); }
const js = m[0]
  .replace(": { outD: \"a\" | \"b\"; outPos: number; inD: \"a\" | \"b\" | null; inPos: number; x: number }", "")
  .replace(/: number/g, "");
const vidLoopPrev = new Function(`${js}; return vidLoopPrev;`)();
console.log("📦 Menguji vidLoopPrev ASLI dari src/lib/recorder.ts (ekstrak+eval, tipe TS dilucuti)");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

function simulasi(vd, label) {
  const XF = Math.min(0.5, vd * 0.15), P = vd - XF;
  const dt = 0.008; // 125fps — lebih rapat dari rAF HP
  const total = vd * 3.5 + 2; // lewati ≥3 siklus penuh
  let salahPos = 0, salahX = 0, rewindTerlihat = 0, lompatBesar = 0, adaFade = 0, fadeSalahArah = 0;
  const lastPos = { a: null, b: null }; // posisi terakhir tiap deck SAAT TAMPIL
  let prevX = null;
  for (let s = 0; s <= total; s += dt) {
    const r = vidLoopPrev(s, vd);
    if (!isFinite(r.outPos) || r.outPos < -1e-9 || r.outPos > vd + 1e-9) salahPos++;
    if (r.inD) { if (!isFinite(r.inPos) || r.inPos < -1e-9 || r.inPos > XF + 1e-6) salahPos++; adaFade++; }
    if (r.x < -1e-9 || r.x > 1 + 1e-9) salahX++;
    if (prevX != null && r.inD && Math.abs(r.x - prevX) > dt / XF + 1e-6) fadeSalahArah++; // alpha tak boleh melompat
    prevX = r.inD ? r.x : null;
    // properti INTI: deck yang SEDANG TAMPIL tak pernah mundur (kecuali masuk fade dari ~0)
    for (const d of ["a", "b"]) {
      const tampil = (r.outD === d) ? r.outPos : (r.inD === d ? r.inPos : null);
      if (tampil == null) { lastPos[d] = null; continue; }
      if (lastPos[d] != null) {
        if (tampil < lastPos[d] - 1e-9) rewindTerlihat++;
        else if (tampil - lastPos[d] > dt * 1.5 + 1e-6) lompatBesar++; // halus = gerak ≤ laju normal
      } else if (tampil > XF + dt + 1e-6) rewindTerlihat++; // muncul kembali harus dari awal (fade-in di ~0)
      lastPos[d] = tampil;
    }
  }
  console.log(`\n🌀 ${label}: klip ${vd}s → XF ${XF.toFixed(2)}s · periode ${P.toFixed(2)}s · fade terdeteksi ${adaFade} sampel`);
  T(`[${label}] posisi selalu sah`, salahPos === 0, `${salahPos} pelanggaran`);
  T(`[${label}] alpha x selalu [0..1]`, salahX === 0, `${salahX} pelanggaran`);
  T(`[${label}] NOL rewind terlihat saat loop`, rewindTerlihat === 0, `${rewindTerlihat} rewind`);
  T(`[${label}] NOL lompatan besar (gerak ≤ laju normal)`, lompatBesar === 0, `${lompatBesar} lompatan`);
  T(`[${label}] alpha fade tak melompat`, fadeSalahArah === 0, `${fadeSalahArah} lompatan alpha`);
  T(`[${label}] ada crossfade di sambungan`, adaFade > 0);
}

// titik kritis: s = P (awal fade pertama) harus mulai dari x=0, deck b di ~0
{
  const vd = 6, XF = Math.min(0.5, vd * 0.15), P = vd - XF;
  const r0 = vidLoopPrev(P + 1e-4, vd);
  T("awal fade pertama: keluar=A di ~P", r0.outD === "a" && Math.abs(r0.outPos - P) < 0.01, JSON.stringify(r0));
  T("awal fade pertama: masuk=B di ~0, x~0", r0.inD === "b" && r0.inPos < 0.01 && r0.x < 0.01);
  const r1 = vidLoopPrev(P + XF + 1e-4, vd);
  T("seusai fade pertama: B LANJUT dari ~XF (tanpa mundur)", r1.outD === "b" && r1.inD === null && Math.abs(r1.outPos - XF) < 0.05, JSON.stringify(r1));
  const r2 = vidLoopPrev(2 * P + XF * 0.5, vd);
  T("fade kedua: keluar=B masuk=A", r2.outD === "b" && r2.inD === "a" && r2.x > 0 && r2.x < 1, JSON.stringify(r2));
}

simulasi(6, "kasus bro (klip 6s)");
simulasi(30, "klip 30s");
simulasi(45, "klip 45s");
simulasi(1, "klip 1s (XF mungil)");

// degenerate: durasi aneh → passthrough aman, tak pernah NaN
{
  const a = vidLoopPrev(5, 0.1), b = vidLoopPrev(-3, NaN), c = vidLoopPrev(1e9, 6);
  T("durasi degenerate tak NaN", isFinite(a.outPos) && isFinite(b.outPos) && isFinite(c.outPos));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI GAGAL — JANGAN RILIS`); process.exit(1); }
console.log("\n🏆 SEMUA UJI LULUS — vidLoopPrev ASLI: sambungan loop terbukti lumat, nol rewind (2026-07-24)");
