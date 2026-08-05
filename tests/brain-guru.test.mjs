// 🧠🧪 UJI PATTERN INSIGHT + TITLE GURU (v19.1) — otak baca catatan & menulis judul dari pola terbukti.
// Jalankan: node tests/brain-guru.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const nicJs = transpile("../src/lib/brain/niche.ts");
const patJs = transpile("../src/lib/brain/pattern-insight.ts");
const P = await import(enc(patJs));
// title-guru butuh dependensi — suntik sebagai data URL (impor relatif tidak jalan di data URL)
const tgJs = transpile("../src/lib/brain/title-guru.ts")
  .replace('from "./pattern-insight"', `from "${enc(patJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`)
  .replace('from "./niche"', `from "${enc(nicJs)}"`);
const G = await import(enc(tgJs));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧠 Menguji Pattern Insight + Title Guru");

/* ---------- 1. Analisis pola dari brain.results ---------- */
{
  const brain = {
    researches: [],
    results: [
      { title: "5 Cara Bikin Ibu Menangis Bahagia", ctr: 7.2, time: Date.now() - 3 * 864e5 },
      { title: "3 Kisah Ayah yang Tak Terlupakan", ctr: 6.8, time: Date.now() - 5 * 864e5 },
      { title: "Rindu Ibu di Malam Hari", ctr: 6.0, time: Date.now() - 7 * 864e5 },
      { title: "Update Harian Vlog Kehidupan Saya yang Sangat Panjang Sekali", ctr: 2.0, time: Date.now() - 9 * 864e5 },
      { title: "Cerita Biasa Tentang Hal yang Sudah Sering Dilihat Semua Orang", ctr: 1.5, time: Date.now() - 11 * 864e5 },
      { title: "Judul Tanpa Angka Apa Pun", ctr: 4.0, time: Date.now() - 13 * 864e5 },
    ],
  };
  const ins = P.analyzeBrainPatterns(brain);
  T("baseline CTR dihitung (≈4.58)", Math.abs(ins.baselineCtr - 4.58) < 0.1, `baseline=${ins.baselineCtr}`);
  T("pola ANGKA terbukti bagus", ins.top.some((p) => p.key === "angka" && p.verdict === "bagus" && p.delta > 0), JSON.stringify(ins.top.map((p) => [p.key, p.delta])));
  T("pola PANJANG terbukti jelek", ins.worst.some((p) => p.key === "panjang" && p.verdict === "jelek" && p.delta < 0));
  T("judul terbaik ketemu", ins.best && ins.best.title === "5 Cara Bikin Ibu Menangis Bahagia" && ins.bestCtr === 7.2);
  T("summary menyebut pola paling tembus", ins.summary.includes("ANGKA"));
  T("contoh judul disertakan", ins.top[0] && ins.top[0].examples.length >= 1);
}

/* ---------- 2. Judul tanpa data CTR = tidak divonis ---------- */
{
  const ins = P.analyzeBrainPatterns({ researches: [], results: [{ title: "Judul Saja", time: Date.now() }] });
  T("tanpa CTR: baseline null & summary minta data", ins.baselineCtr === null && ins.summary.includes("Belum ada angka"));
  T("tanpa CTR: tidak ada pola bagus/jelek", ins.top.length === 0 && ins.worst.length === 0);
}

/* ---------- 3. Title Guru: menulis dari pola tembus ---------- */
{
  const brain = {
    researches: [],
    results: [
      { title: "5 Cara Bikin Ibu Menangis Bahagia", ctr: 7.2, time: Date.now() - 3 * 864e5 },
      { title: "3 Kisah Ayah yang Tak Terlupakan", ctr: 6.8, time: Date.now() - 5 * 864e5 },
      { title: "Rindu Ibu di Malam Hari", ctr: 6.0, time: Date.now() - 7 * 864e5 },
      { title: "Video Panjang yang Sangat Membosankan Sekali", ctr: 1.8, time: Date.now() - 1 * 864e5 },
    ],
  };
  const s = G.suggestTitlesFromBrain("ibu", brain, 4);
  T("saran keluar 4 judul", s.length === 4, `dapat ${s.length}`);
  T("semua saran ada skor & alasan", s.every((x) => x.score > 0 && x.alasan.length > 0));
  T("saran memakai pola angka (yang tembus)", s.some((x) => /\d/.test(x.title)), s.map((x) => x.title).join(" | "));
  T("saran TIDAK mirip judul gagal (video panjang)", s.every((x) => !/video panjang|membosankan/i.test(x.title)));
  T("tidak ada saran kembar", new Set(s.map((x) => x.title.toLowerCase())).size === s.length);
}

/* ---------- 4. Title Guru: keyword kosong / tanpa data tetap aman ---------- */
{
  const s1 = G.suggestTitlesFromBrain("", { researches: [], results: [] }, 3);
  T("keyword kosong → kosong, tidak crash", s1.length === 0);
  const s2 = G.suggestTitlesFromBrain("ayah", { researches: [], results: [] }, 3);
  T("tanpa data tetap kasih saran umum (tidak crash)", s2.length > 0 && s2.every((x) => x.alasan.includes("umum")));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI BRAIN GURU GAGAL`); process.exit(1); }
