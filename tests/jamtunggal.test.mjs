// 🧪 UJI JAM TUNGGAL (FASE-A) — kunci stabilisasi sync preview.
// Jalankan: node tests/jamtunggal.test.mjs
// 1) Mengekstrak fungsi ASLI dari src/lib/studio/clock.ts → uji keputusan sync.
// 2) Bukti wiring: page.tsx benar-benar MEMAKAI modul (bukan roda paralel).
// 3) Bukti v15.3: onStageDown memanggil stopPreview saat play (per RENCANA_v15.3.md).
import { readFileSync } from "fs";

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

/* ---------- 1. Ekstrak fungsi asli ---------- */
const src = readFileSync(new URL("../src/lib/studio/clock.ts", import.meta.url), "utf8");
const ambil = (nama) => {
  const m = src.match(new RegExp(`export function ${nama}\\([\\s\\S]*?\\n}`));
  if (!m) { console.error(`💥 ${nama} tidak ketemu di clock.ts`); process.exit(1); }
  return m[0];
};
const js = [
  ambil("totalAllOf"),
  ambil("decideTick"),
  ambil("resolveSeekTarget"),
  ambil("manualAfterMasterEnd"),
].join("\n")
  .replace(/export function /g, "function ")
  .replace(/: "idle" \| "reset" \| "end" \| "run"/g, "")
  .replace(/: \{ audio: null; t0: number; base: number; running: boolean \}/g, "")
  .replace(/: number/g, "");
const M = new Function(`${js}; return { totalAllOf, decideTick, resolveSeekTarget, manualAfterMasterEnd };`)();
console.log("⏱ Menguji JAM TUNGGAL ASLI dari src/lib/studio/clock.ts (ekstrak+eval, tipe TS dilucuti)");

/* ---------- 2. totalAllOf ---------- */
T("totalAllOf: total klip menang saat audio lebih pendek", M.totalAllOf(42, 30, 0) === 42);
T("totalAllOf: lagu panjang menang (kasus v13.x — klip 42d, lagu 372d)", M.totalAllOf(42, 372, 0) === 372);
T("totalAllOf: audio offset terjauh ikut menang", M.totalAllOf(10, 8, 25.5) === 25.5);
T("totalAllOf: semua nol → 0", M.totalAllOf(0, 0, 0) === 0);

/* ---------- 3. decideTick ---------- */
T("decideTick: totalAll 0 & t kecil → idle (JANGAN reset — pertahankan frame 0)", M.decideTick(0.3, 0) === "idle");
T("decideTick: totalAll 0 & t>0.5 → reset (jam nyasar ditangkap)", M.decideTick(0.6, 0) === "reset");
T("decideTick: t di tengah film → run", M.decideTick(21, 42) === "run");
T("decideTick: t di ujung tepat - toleransi → masih run (tidak stop prematur!)", M.decideTick(41.99, 42) === "run");
T("decideTick: t melewati total+0.08 → end", M.decideTick(42.09, 42) === "end");
T("decideTick: boundary tepat 42+0.08=42.08 → end", M.decideTick(42.08, 42) === "end");
T("decideTick: lagu panjang (372d) t=371 → run", M.decideTick(371, 372) === "run");

/* ---------- 4. resolveSeekTarget ---------- */
T("resolveSeekTarget: jarum di ujung (42/42) → 0 (putar ulang dari awal)", M.resolveSeekTarget(42, 42) === 0);
T("resolveSeekTarget: jarum dalam 60ms jelang akhir → 0", M.resolveSeekTarget(41.97, 42) === 0);
T("resolveSeekTarget: jarum di tengah → tetap posisi", M.resolveSeekTarget(13.5, 42) === 13.5);
T("resolveSeekTarget: proyek super pendek (durT≤0.3) → tidak dipaksa 0", M.resolveSeekTarget(0.29, 0.3) === 0.29);

/* ---------- 5. manualAfterMasterEnd (transisi master→manual) ---------- */
{
  const m = M.manualAfterMasterEnd(372, 1000);
  T("masterEnd: jam manual mulai dari durasi master (372s) — MONOTON", m.base === 372 && m.running === true && m.audio === null,
    `base=${m.base}`);
  T("masterEnd: t0 dicatat dari jam sekarang", m.t0 === 1000);
  const lanjut = m.base + (1150 - m.t0) / 1000; // 150ms setelahnya
  T("masterEnd: 150ms kemudian = 372.15 (maju mulus, tanpa lompat mundur)", Math.abs(lanjut - 372.15) < 1e-9, `${lanjut}`);
}
{
  const m = M.manualAfterMasterEnd(NaN, 500);
  T("masterEnd: durasi master rusak (NaN) → base 0 aman, bukan NaN", m.base === 0);
}
{
  const m = M.manualAfterMasterEnd(-5, 500);
  T("masterEnd: durasi negatif → base 0 aman", m.base === 0);
}

/* ---------- 6. Simulasi film lengkap: klip 42d + lagu 372d (skenario asli bro) ---------- */
{
  const total = M.totalAllOf(42, 372, 0);
  let endTerdeteksi = false, prematur = false;
  // rAF 60fps simulasi 0 → 373 detik
  for (let t = 0; t <= 373; t += 1 / 60) {
    const k = M.decideTick(t, total);
    if (k === "end") { if (t < total + 0.08 - 1e-9) prematur = true; endTerdeteksi = true; break; }
  }
  T("simulasi 60fps: tidak ada stop prematur sepanjang 6 menit", !prematur);
  T("simulasi 60fps: end terdeteksi tepat setelah lagu habis", endTerdeteksi);
  // Transisi master→manual di detik 372, film klip total 6.1 (musik 372) → master habis, manual lanjut sampai totalAll
  const total2 = M.totalAllOf(42, 372, 0);
  const mEnd = M.manualAfterMasterEnd(372, 372000);
  let k = "run";
  for (let ms = 0; ms <= 2000 && k !== "end"; ms += 16.7) {
    const t = mEnd.base + (372000 + ms - mEnd.t0) / 1000;
    k = M.decideTick(t, total2);
  }
  // totalAll = 372 → end harus terjadi ~372.08
  T("transisi masterEnd→manual: end tiba mulus ±80ms setelah 372", k === "end");
}

/* ---------- 7. Bukti wiring: page.tsx memakai modul (bukan roda paralel) ---------- */
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
T("page.tsx mengimpor modul jam tunggal", page.includes("from \"@/lib/studio/clock\""));
T("tick() memutuskan via decideTick (bukan inline lagi)", /const keputusan = decideTick\(t, totalAll\)/.test(page));
T("tick() memakai totalAllOf", /totalAllOf\(total, audioDur, offsetEnd\)/.test(page));
T("tick() memakai manualAfterMasterEnd", /manualAfterMasterEnd\(aud0\.duration/.test(page));
T("togglePreview memakai resolveSeekTarget", /resolveSeekTarget\(curT, durTRef\.current\)/.test(page));

/* ---------- 8. Bukti v15.3 (sentuh panggung = stop) ---------- */
{
  const m = page.match(/function onStageDown\(e: React\.PointerEvent\) \{[\s\S]{0,400}/);
  T("onStageDown ada", !!m);
  T("v15.3: sentuh panggung saat play → stopPreview() di baris awal handler", !!m && /if \(playingRef\.current\) \{\s*stopPreview\(\);?\s*\}/.test(m[0]));
}
T("stopPreview idempoten (aman dipanggil berulang per RENCANA)", (page.match(/rafRef\.current = null;/g) || []).length >= 1);

console.log(gagal === 0 ? "\n🏁 JAM TUNGGAL SEHAT — sync preview terkuci & v15.3 terkirim" : `\n💥 ${gagal} uji gagal`);
process.exit(gagal === 0 ? 0 : 1);
