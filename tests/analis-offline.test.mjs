// 👨‍🏫🧪 UJI ANALIS OFFLINE (v19.60) — jawaban mesin aturan pakai data, jujur
// Jalankan: node tests/analis-offline.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const { jawabOffline } = await loadTs("../src/lib/brain/analis-offline.ts");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// data khas user (IBU Aku Kangen)
const d = { title: "IBU Aku Kangen", views: 169000, watchTimeHours: 10000, ctrPct: 4.8, retention30Pct: 61, subs: 668, returningPct: 3.8 };

console.log("👨‍🏫 Menguji Analis Offline (v19.60)");

const r1 = jawabOffline(d, "Kenapa penonton aku nggak balik-balik?");
T("penonton kembali: sebut 3,8%", r1.includes("3,8%"), r1.slice(0, 60));
T("penonton kembali: sebut target 15%", r1.includes("15%"));
T("penonton kembali: kasih step", r1.includes("1)") || r1.includes("1."));

const r2 = jawabOffline(d, "CTR aku gimana?");
T("CTR: sebut 4,8%", r2.includes("4,8%"));
T("CTR kuning: target 5%+", r2.includes("5%"));

const r3 = jawabOffline(d, "Biar subscriber naik gimana?");
T("subscriber: konversi dihitung (0,4%)", r3.includes("0,4%"), r3.slice(0, 60));
T("subscriber: sebut detik 10–20", r3.includes("10–20"));

const r4 = jawabOffline(d, "Waktu tonton aku gimana?");
T("watch time: 10 rb jam/28hr & 357/hari", r4.includes("10 rb") && r4.includes("357"), r4.slice(0, 80));

const r5 = jawabOffline(d, "Kasih ide konten part 2");
T("ide: sebut Part 2 & ibu", r5.includes("Part 2") && r5.includes("Ibu"));

const r6 = jawabOffline(d, "Channel aku sehat nggak?");
T("generik: sebut 3 pintu", r6.includes("3 pintu") || r6.includes("Packaging"));

// data kosong → jujur minta data
const r7 = jawabOffline({}, "CTR aku gimana?");
T("tanpa data → minta CTR", r7.includes("CTR") && /[Ii]si/.test(r7), r7.slice(0, 60));
const r8 = jawabOffline({}, "penonton kembali?");
T("tanpa data → minta penonton kembali", r8.includes("Penonton kembali"));

// hijau: retensi ≥60 → puji
const r9 = jawabOffline({ ...d, retention30Pct: 61 }, "Retensi aku gimana?");
T("retensi 61% → TOP 10%", r9.includes("TOP 10%"));

// merah: ctr <3
const r10 = jawabOffline({ ...d, ctrPct: 1.2 }, "CTR?");
T("CTR 1,2% → MERAH", r10.includes("MERAH") || r10.includes("merah"));

console.log(gagal ? `\n💥 ${gagal} GAGAL` : "\n🏁 ANALIS OFFLINE SEHAT");
process.exit(gagal ? 1 : 0);
