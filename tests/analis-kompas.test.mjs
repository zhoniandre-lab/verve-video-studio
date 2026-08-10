// 👨‍🏫🧪 UJI KOMPAS CHANNEL (v19.55) — mesin aturan Analis Channel
// Jalankan: node tests/analis-kompas.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const { kompasChannel } = await loadTs("../src/lib/brain/growth-doctor.ts");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("👨‍🏫 Menguji Kompas Channel (v19.55)");

// 1. Data channel user (IBU Aku Kangen): sehat di CTR & retensi, merah di penonton kembali
const k1 = kompasChannel({ views: 169000, subs: 668, ctrPct: 4.8, retention30Pct: 61, returningPct: 3.8, watchTimeHours: 10000 });
const byId = (id) => k1.items.find((x) => x.id === id);
T("CTR 4,8% → warn", byId("ctr")?.level === "warn", byId("ctr")?.level);
T("Retensi 61% → ok (top 10%)", byId("ret")?.level === "ok", byId("ret")?.level);
T("Penonton kembali 3,8% → danger", byId("retv")?.level === "danger", byId("retv")?.level);
T("Konversi 0,4% → danger (CTA lemah)", byId("conv")?.level === "danger", byId("conv")?.level);
T("Waktu 10000 jam/28hr → ok (monetisasi)", byId("wt")?.level === "ok", byId("wt")?.level);
T("ringkasan ada merah → warn/danger", ["warn", "danger"].includes(k1.ringkasan.level), k1.ringkasan.level + " " + k1.ringkasan.title);

// 2. Channel jelek: semua merah
const k2 = kompasChannel({ views: 300, subs: 0, ctrPct: 1.2, retention30Pct: 18, returningPct: 2, watchTimeHours: 20 });
T("CTR 1,2% → danger", k2.items.find((x) => x.id === "ctr")?.level === "danger");
T("Retensi 18% → danger", k2.items.find((x) => x.id === "ret")?.level === "danger");
T("≥2 merah → CHANNEL PERLU DIBENAHI", k2.ringkasan.level === "danger", k2.ringkasan.level);

// 3. Channel sehat penuh
const k3 = kompasChannel({ views: 500000, subs: 12000, ctrPct: 6.2, retention30Pct: 65, returningPct: 22, watchTimeHours: 30000 });
T("semua hijau → CHANNEL SEHAT", k3.items.every((x) => x.level === "ok") && k3.ringkasan.level === "ok", k3.ringkasan.level);
T("konversi 2,4% → ok", k3.items.find((x) => x.id === "conv")?.level === "ok");

// 4. Tanpa data → info
const k4 = kompasChannel({});
T("tanpa data → 'Belum ada data'", k4.ringkasan.level === "info" && !k4.items.length);

// 5. CTR dihitung otomatis dari views/impressions
const k5 = kompasChannel({ views: 50000, impressions: 1000000 });
T("CTR otomatis 5% → ok", k5.items.find((x) => x.id === "ctr")?.level === "ok", k5.items.find((x) => x.id === "ctr")?.value);

// 6. Ambang batas persis
const k6 = kompasChannel({ views: 1000, subs: 20, ctrPct: 5, retention30Pct: 60, returningPct: 15, watchTimeHours: 308 }); // 11 jam/hari × 28
T("tepat di ambang (5/60/15/11) → semua ok", k6.items.every((x) => x.level === "ok"), JSON.stringify(k6.items.map((x) => x.level)));

console.log(gagal ? `\n💥 ${gagal} GAGAL` : "\n🏁 KOMPAS CHANNEL SEHAT");
process.exit(gagal ? 1 : 0);
