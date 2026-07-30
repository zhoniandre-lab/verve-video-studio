// 📒 UJI GROWTH LEDGER — baseline channel, index, eksperimen before/after.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const G = await loadTs("../src/lib/brain/growth-doctor.ts");
const L = await loadTs("../src/lib/brain/growth-ledger.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📒 Menguji Growth Ledger");

const mk = (title, ctr, ret, views = 1000, imps = 20000, at = Date.now()) => L.createGrowthSnapshot({ title, mode: "long", views, impressions: imps, ctrPct: ctr, durationSec: 240, avgViewSec: 80, retention30Pct: ret, likes: 30, comments: 5, uploadAgeHours: 24 }, undefined, at);
const s1 = mk("A", 4, 40, 1000, 25000, 1000);
const s2 = mk("B", 6, 50, 2000, 33000, 2000);
const s3 = mk("C", 8, 60, 3000, 37500, 3000);

const b = L.computeGrowthBaseline([s1, s2, s3], { mode: "long" });
T("baseline sample 3", b.sample === 3);
T("median CTR = 6", b.ctrMedian === 6, String(b.ctrMedian));
T("median retention = 50", b.retention30Median === 50, String(b.retention30Median));

const cur = mk("D", 3, 25, 500, 16666, 4000);
const cmp = L.compareSnapshotToBaseline(cur, b);
T("CTR index 0.5", cmp.ctrIndex === 0.5, String(cmp.ctrIndex));
T("Retention index 0.5", cmp.retentionIndex === 0.5, String(cmp.retentionIndex));

const dx = G.diagnoseGrowth({ title: "D", mode: "long", views: 120, impressions: 8000, ctrPct: 1.2, durationSec: 270, avgViewSec: 27, retention30Pct: 18 });
const exp = L.createExperimentFromDiagnosis({ title: "D", mode: "long", views: 120, impressions: 8000, ctrPct: 1.2, durationSec: 270, avgViewSec: 27, retention30Pct: 18 }, dx, b, 5000);
T("experiment pending", exp.status === "pending" && exp.issueCode === "LOW_CTR_WITH_IMPRESSIONS", exp.issueCode);
T("experiment target metric ctr", exp.targetMetric === "ctrPct" && exp.targetValue >= 3, `${exp.targetMetric}:${exp.targetValue}`);

const after = L.createGrowthSnapshot({ title: "D after", mode: "long", views: 700, impressions: 12000, ctrPct: 5.0, durationSec: 270, avgViewSec: 60, retention30Pct: 32 }, undefined, 9000);
const graded = L.gradeExperiment(exp, after);
T("experiment success jika after capai target", graded.status === "success", graded.resultNote);

let ledger = L.emptyGrowthLedger();
ledger = L.addSnapshotToLedger(ledger, s1);
ledger = L.addExperimentToLedger(ledger, exp);
T("ledger simpan snapshot+experiment", ledger.snapshots.length === 1 && ledger.experiments.length === 1);

if (gagal) { console.error(`\n💥 ${gagal} UJI GROWTH LEDGER GAGAL`); process.exit(1); }
console.log("\n🏁 GROWTH LEDGER SEHAT — baseline dan eksperimen siap");
