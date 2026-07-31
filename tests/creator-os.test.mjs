// 🧠 UJI CREATOR OS — 7 sistem YouTube strategis deterministic.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const C = await loadTs("../src/lib/brain/creator-os.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧠 Menguji Creator OS");

const plan = C.buildCreatorOS({ niche: "cerita jadi lagu", audience: "orang Indonesia yang suka kisah ibu", views: 144, ctrPct: 3.6, retention30Pct: 38.2, uploadsPerWeek: 3 });
T("punya 7 section", plan.sections.length === 7, String(plan.sections.length));
T("section viral ada", plan.sections.some(s => s.id === "viral" && s.system.join(" ").toLowerCase().includes("thumbnail")));
T("algorithm baca sinyal CTR", plan.fullText.includes("CTR") && plan.fullText.includes("Retention/avg"), plan.fullText.slice(0, 200));
T("next 7 days lengkap", plan.next7Days.length === 7);
T("weekly template ada", /WEEKLY CREATOR OS REVIEW/.test(plan.weeklyReviewTemplate));

if (gagal) { console.error(`\n💥 ${gagal} UJI CREATOR OS GAGAL`); process.exit(1); }
console.log("\n🏁 CREATOR OS SEHAT");
