// 🧪 UJI BERHENTI DI UJUNG + ANTI FRAME BASI (FASE-A.2)
// Jalankan: node tests/berhentiujung.test.mjs
// Latar: rekam layar user 2026-08-04 membuktikan — film habis → garis melejit ke 00:00
// & panggung melompat ke frame TENGAH klip-1 (basi). Keputusan user: ala CapCut —
// habis = tetap di frame terakhir; play lagi = mulai dari 0 (resolveSeekTarget FASE-A).
import { readFileSync } from "fs";

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const clock = readFileSync(new URL("../src/lib/studio/clock.ts", import.meta.url), "utf8");

/* ---------- 1. Cabang akhir-film: TETAP DI UJUNG (bukan balik 0) ---------- */
T("end: stopPreview(true) + setCurT(totalAll) + drawFrame(totalAll)",
  /if \(keputusan === "end"\) \{ stopPreview\(true\); setCurT\(totalAll\); drawFrame\(totalAll\); return; \}/.test(page));
T("end: perilaku lama (melejit ke 0) SUDAH DIMUSNAHKAN dari cabang end",
  !/keputusan === "end"\) \{ stopPreview\(true\); setCurT\(0\)/.test(page));
T("reset (proyek kosong) tetap kembali ke 0 — tidak ikut berubah",
  /stopPreview\(true\); setCurT\(0\); drawFrame\(0\); return;/.test(page));

/* ---------- 2. Repaint terjadwal anti frame basi ---------- */
const jumlahRepaint = (page.match(/setTimeout\(\(\) => \{ try \{ drawFrameRefCb\.current\(curTRef\.current\); \} catch \{\} \}, 150\);/g) || []).length;
T("repaint terjadwal 150ms ada di stopPreview DAN seekPreview", jumlahRepaint >= 2, `ditemukan ${jumlahRepaint} titik`);

/* ---------- 3. Bukti lingkar penuh: end-di-ujung + play-lagi = mulai dari 0 ---------- */
const m = clock.match(/export function resolveSeekTarget\([\s\S]*?\n}/);
if (!m) { console.error("💥 resolveSeekTarget tidak ketemu di clock.ts"); process.exit(1); }
const resolveSeekTarget = new Function(`${m[0].replace(/export function /, "function ").replace(/: number/g, "")}; return resolveSeekTarget;`)();
{
  // Simulasi "berhenti di ujung" ala CapCut: film 20d habis → curT = 20 (bukan 0)
  const curTSetelahHabis = 20; const durT = 20;
  const seekTo = resolveSeekTarget(curTSetelahHabis, durT);
  T("habis di ujung (20/20) → tekan play → mulai dari 0", seekTo === 0, `seekTo=${seekTo}`);
  // Pause di tengah (v15.3 tap panggung di 9,3d) → play lagi HARUS lanjut dari 9,3 — bukan reset
  const seekTengah = resolveSeekTarget(9.3, 20);
  T("pause di tengah (9,3/20) → tekan play → LANJUT dari 9,3 (bukan ke 0)", seekTengah === 9.3, `seekTo=${seekTengah}`);
  // Dekat ujung banget (19,96) → juga dianggap di ujung → 0
  T("di ujung banget (19,96/20) → play → 0", resolveSeekTarget(19.96, 20) === 0);
}

/* ---------- 4. Kontrak jam tunggal tetap utuh (regresi FASE-A) ---------- */
T("tick masih memutuskan via decideTick (1 pintu keputusan)", /const keputusan = decideTick\(t, totalAll\)/.test(page));
T("totalAll masih dari totalAllOf (klip+audio+offset)", /totalAllOf\(total, audioDur, offsetEnd\)/.test(page));
T("v15.3 tap panggung = stop masih terpasang", /if \(playingRef\.current\) \{\s*stopPreview\(\);?\s*\}/.test(page));

console.log(gagal === 0 ? "\n🏁 BERHENTI DI UJUNG SEHAT — ala CapCut terkunci & frame basi dimusnahkan" : `\n💥 ${gagal} uji gagal`);
process.exit(gagal === 0 ? 0 : 1);
