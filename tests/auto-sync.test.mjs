// 🔄🧪 UJI AUTO-SYNC (v19.2) — logika gabung hasil sync YouTube ke otak (dipakai Lahan + Dokter).
// Jalankan: node tests/auto-sync.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const A = await loadTs("../src/lib/brain/auto-sync.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔄 Menguji Auto-Sync (merge hasil YouTube ke otak)");

/* ---------- 1. Skor kekayaan data ---------- */
T("kosong = 0", A.hasilKeSkor({}) === 0);
T("CTR saja = 2", A.hasilKeSkor({ ctr: 6.5 }) === 2);
T("CTR+imp+avd = 4", A.hasilKeSkor({ ctr: 6.5, impressions: 1000, avdSec: 45 }) === 4);

/* ---------- 2. Merge: data terlengkap menang, max 200, terbaru di depan ---------- */
{
  const now = [
    { title: "Judul Lama", ctr: 3.1, time: 1000 },
    { title: "Judul Lengkap Manual", ctr: 5.2, impressions: 900, avdSec: 30, time: 2000 },
  ];
  const rows = [
    { title: "Judul Baru Dari Sync", ctr: 6.0, impressions: 1200, avdSec: 40, time: 3000 },
    { title: "Judul Lengkap Manual", ctr: 4.8, impressions: 800, time: 4000 }, // kurang lengkap (tanpa AVD) & lebih baru
    { title: "Judul Lama", ctr: 3.5, time: 5000 }, // update CTR, tetap dipertahankan
  ];
  const m = A.mergeSyncResults(now, rows);
  T("hasil gabung 3 judul unik", m.length === 3, `dapat ${m.length}`);
  const man = m.find((r) => r.title === "Judul Lengkap Manual");
  T("laporan manual TERLENGKAP tidak tertimpa sync", man && man.impressions === 900 && man.avdSec === 30 && man.ctr === 5.2);
  const lama = m.find((r) => r.title === "Judul Lama");
  T("judul lama tetap ter-update CTR-nya", lama && lama.ctr === 3.5);
  T("terbaru di depan", m[0].title === "Judul Lama" || m[0].time === 5000);
}

/* ---------- 3. Merge: dedupe via judul ternormalisasi, batas 200 ---------- */
{
  const banyak = Array.from({ length: 210 }, (_, i) => ({ title: `Video ${i}`, time: i }));
  const m = A.mergeSyncResults([], banyak);
  T("dipotong ke 200 slot", m.length === 200, `dapat ${m.length}`);
  const dupe = A.mergeSyncResults([{ title: "Dup", time: 1 }], [{ title: "  dup ", time: 2 }]);
  T("duplikat judul (spasi beda) digabung jadi 1", dupe.length === 1);
}

/* ---------- 4. syncYtBrain tanpa koneksi = pesan jujur, tidak crash ---------- */
{
  const st = await A.syncYtBrain({ researches: [], results: [] }).catch(() => null);
  // Di lingkungan test tidak ada fetch → harusnya gagal lembut dengan pesan, bukan throw
  T("syncYtBrain selalu membalas (ok:false) tanpa koneksi", st && st.ok === false && typeof st.msg === "string" && st.msg.length > 0, st?.msg?.slice(0, 60));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI AUTO-SYNC GAGAL`); process.exit(1); }
