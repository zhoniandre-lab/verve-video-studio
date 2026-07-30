// 🩺 UJI GROWTH DOCTOR — diagnosis Kenapa/Kok Bisa/Seharusnya berbasis metrik, tanpa ngarang.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const G = await loadTs("../src/lib/brain/growth-doctor.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🩺 Menguji Growth Doctor rule engine");

T("parse 04:30 → 270", G.parseClockToSec("04:30") === 270);
T("parse 1:02:03 → 3723", G.parseClockToSec("1:02:03") === 3723);

{
  const d = G.diagnoseGrowth({ mode: "long", views: 120, impressions: 8000, ctrPct: 1.2, durationSec: 270, avgViewSec: 27, retention30Pct: 18, likes: 5, comments: 1, uploadAgeHours: 24 });
  T("low CTR + low retention = danger", d.status.level === "danger", d.status.summary);
  T("diagnosis menyebut CTR", d.kenapa.join(" ").toLowerCase().includes("ctr"));
  T("aksi thumbnail dan hook ada", d.actions.some(a => a.id === "thumbnail") && d.actions.some(a => a.id === "hook"));
  T("evidence issue CTR high confidence", d.issues.some(i => i.code === "LOW_CTR_WITH_IMPRESSIONS" && i.confidence === "high" && i.evidence.join(" ").includes("CTR")));
  T("confidence summary high/medium", ["high", "medium"].includes(d.confidence.level), `${d.confidence.level} ${d.confidence.score}`);
  T("facts dan missingData tersedia", d.facts.length >= 4 && d.missingData.includes("Traffic source split (Browse/Search/Suggested/Shorts)"));
  T("planText punya Fakta/Bukti/Kenapa/Kok Bisa/Seharusnya", /FAKTA/.test(d.planText) && /ISSUE \+ BUKTI/.test(d.planText) && /KENAPA/.test(d.planText) && /KOK BISA/.test(d.planText) && /SEHARUSNYA/.test(d.planText));
}

{
  const d = G.diagnoseGrowth({ mode: "long", views: 80, impressions: 220, ctrPct: 6.5, durationSec: 180, avgViewSec: 80, retention30Pct: 55, likes: 10, comments: 3 });
  T("impressions rendah tapi CTR bagus = distribusi warn/ok bukan CTR danger", d.actions.some(a => a.id === "seo") || d.status.level === "ok", d.status.summary);
}

{
  const d = G.diagnoseGrowth({ mode: "shorts", views: 5000, impressions: 50000, ctrPct: 8, durationSec: 35, avgViewSec: 31, retention30Pct: 82, likes: 500, comments: 50 });
  T("shorts sehat = ok", d.status.level === "ok", d.status.summary);
  T("scale action ada untuk sehat", d.actions.some(a => a.id === "scale"));
}

{
  const d = G.diagnoseGrowth({ mode: "long", views: 49, impressions: 1408, ctrPct: 3.2 });
  T("data 3 metrik saja tidak divonis hook 0", !d.issues.some(i => i.code === "LOW_RETENTION_OR_AVD") && !d.facts.join(" ").includes("Retention 30 detik: 0%"), d.planText);
  T("data 3 metrik saja engagement tetap unknown", d.derived.engagementPct === null && !d.issues.some(i => i.code === "LOW_ENGAGEMENT"), JSON.stringify(d.derived));
  T("data 3 metrik fokus ke CTR lemah", d.issues.some(i => i.code === "WEAK_CTR") && d.status.level === "warn", d.status.summary);
}

{
  const d = G.diagnoseGrowth({ mode: "long", views: 673, impressions: 10600, ctrPct: 5, avgViewSec: 138, retention30Pct: 39.4, trafficSources: [{ key: "suggested", label: "Rekomendasi video", pct: 72.7 }], audienceFacts: [{ key: "notSubscribed", label: "Tidak subscribe", pct: 96.7 }] });
  T("traffic OCR jadi fakta bukan missing", d.facts.some(f => f.includes("Traffic utama")) && !d.missingData.includes("Traffic source split (Browse/Search/Suggested/Shorts)"), JSON.stringify({ facts: d.facts, missing: d.missingData }));
}

{
  const d = G.diagnoseGrowth({});
  T("data kosong minta lengkapi", d.actions.some(a => a.id === "collect"));
  T("data kosong confidence rendah/issue insufficient", d.issues.some(i => i.code === "DATA_INSUFFICIENT") && d.confidence.level === "low");
}

if (gagal) { console.error(`\n💥 ${gagal} UJI GROWTH DOCTOR GAGAL`); process.exit(1); }
console.log("\n🏁 GROWTH DOCTOR SEHAT — diagnosis lokal siap dipakai");
