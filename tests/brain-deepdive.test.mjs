// 🔮🧪 UJI DEEP DIVE (v19.3) — velocity, jam hoki, durasi ideal, prediksi CTR, level, laporan.
// Jalankan: node tests/brain-deepdive.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const patJs = transpile("../src/lib/brain/pattern-insight.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const ddJs = transpile("../src/lib/brain/deep-dive.ts")
  .replace('from "./pattern-insight"', `from "${enc(patJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const D = await import(enc(ddJs));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔮 Menguji Deep Dive (otak berpikir lebih dalam)");

/* ---------- 1. View velocity ---------- */
{
  T("velocity 100 view / 10 hari = 10", D.videoVelocity({ time: Date.now() - 10 * 864e5, views: 100 }) === 10);
  T("velocity tanpa views = null", D.videoVelocity({ time: Date.now() }) === null);
  T("label 5000 → VIRAL", D.velocityLabel(5000) === "🚀 VIRAL");
  T("label 300 → Ngebut", D.velocityLabel(300) === "🔥 Ngebut");
  T("label 3 → Sepi", D.velocityLabel(3) === "😴 Sepi");
  T("jam upload 20.00 = 20", D.uploadHourOf(new Date(2026, 0, 5, 20, 30).getTime()) === 20);
  T("hari upload Senin = 1", D.uploadDayOf(new Date(2026, 0, 5, 20, 30).getTime()) === 1);
}

/* ---------- 2. Jam hoki ---------- */
{
  // Jam dibuat EKSPLISIT (bukan Date.now() polos) supaya test tidak bergantung jam sistem.
  const mk = (daysAgo, hour, views) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setHours(hour, 0, 0, 0);
    return { title: `V${hour}-${views}`, time: d.getTime(), views };
  };
  const brain = {
    researches: [],
    results: [
      mk(10, 20, 5000), mk(20, 21, 6000), mk(30, 19, 3000), // malam → cepat
      mk(9, 9, 100), mk(19, 8, 50), // pagi → lambat
    ],
  };
  const w = D.bestUploadWindows(brain);
  T("jam hoki = Malam", w.best && w.best.label.includes("Malam"), w.best?.label);
  T("n malam = 3", w.windows.find((x) => x.label.includes("Malam"))?.n === 3);
  const day = D.bestUploadDay(brain);
  T("hari terbaik ketemu (bukan null)", day !== null && typeof day.label === "string", day?.label);
}

/* ---------- 3. Durasi ideal ---------- */
{
  const brain = {
    researches: [],
    results: [
      { title: "Shorts A", time: Date.now() - 10 * 864e5, views: 500, durationSec: 45 },
      { title: "Shorts B", time: Date.now() - 12 * 864e5, views: 400, durationSec: 50 },
      { title: "Panjang A", time: Date.now() - 30 * 864e5, views: 300, durationSec: 500 },
      { title: "Sedang A", time: Date.now() - 20 * 864e5, views: 2000, durationSec: 240 },
      { title: "Sedang B", time: Date.now() - 15 * 864e5, views: 1500, durationSec: 300 },
    ],
  };
  const d = D.idealDuration(brain);
  T("durasi ideal = Sedang (3-6 mnt)", d.best && d.best.label.includes("Sedang"), d.best?.label);
  T("bucket Shorts & Panjang ikut terhitung", d.buckets.some((b) => b.label.includes("Shorts")) && d.buckets.some((b) => b.label.includes("Panjang")));
}

/* ---------- 4. Prediksi CTR Bayes ---------- */
{
  const brain = {
    researches: [],
    results: [
      { title: "5 Cara Bikin Ibu Menangis", ctr: 7.0, time: Date.now() - 3 * 864e5 },
      { title: "5 Cara Bikin Ayah Haru", ctr: 6.5, time: Date.now() - 5 * 864e5 },
      { title: "3 Kisah Keluarga", ctr: 5.0, time: Date.now() - 30 * 864e5 },
    ],
  };
  const p = D.predictCtrBayes("5 Cara Bikin Ibu Tersenyum", brain);
  T("prediksi keluar dengan rentang wajar", p.est >= p.low && p.high >= p.est && p.est > 0, `${p.est} (${p.low}-${p.high})`);
  T("menemukan judul mirip (n>=1)", p.n >= 1, `n=${p.n}`);
  T("prediksi di atas baseline umum (pola angka tembus)", p.est >= 4.5, `${p.est}%`);
  const kosong = D.predictCtrBayes("Judul Baru", { researches: [], results: [] });
  T("tanpa data → prior 4.5%", kosong.est === 4.5 && kosong.n === 0);
}

/* ---------- 5. Level otak ---------- */
T("0 → Bayi Otak", D.brainLevel(0).label === "Bayi Otak" && D.brainLevel(0).emoji === "🍼");
T("7 → Sekolah Dasar", D.brainLevel(7).label === "Sekolah Dasar");
T("35 → Magister Otak", D.brainLevel(35).label === "Magister Otak");
T("100 → Doktor Judul", D.brainLevel(100).label === "Doktor Judul" && D.brainLevel(100).next === "");

/* ---------- 6. Laporan otak ---------- */
{
  const brain = {
    researches: [],
    results: [
      { title: "5 Cara Bikin Ibu Menangis", ctr: 7.0, time: Date.now() - 3 * 864e5, views: 2000, durationSec: 240 },
      { title: "Rindu Ibu di Malam Hari", ctr: 6.0, time: Date.now() - 5 * 864e5, views: 1500, durationSec: 200 },
      { title: "Video Panjang Membosankan", ctr: 1.8, time: Date.now() - 9 * 864e5, views: 100, durationSec: 800 },
    ],
  };
  const rep = D.buildBrainReport(brain);
  T("laporan memuat judul & section penting", rep.includes("LAPORAN OTAK") && rep.includes("Baseline CTR") && rep.includes("Pola TEMBUS") && rep.includes("Video tercepat"), rep.split("\n").length + " baris");
}

if (gagal) { console.error(`\n💥 ${gagal} UJI DEEP DIVE GAGAL`); process.exit(1); }
