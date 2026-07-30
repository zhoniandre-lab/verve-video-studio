// 📋 UJI PASTE TEKS SCREENSHOT — parser Google Lens/OCR YouTube Studio.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const P = await loadTs("../src/lib/brain/yt-studio-text.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📋 Menguji parser paste teks YouTube Studio");

{
  const text = `Penayangan 673
573 lebih banyak dari biasanya
Tayangan 10,6 rb
Rasio klik-tayang dari tayangan 5,0%
Waktu tonton 25,7 jam
Rata-rata durasi tonton 2:18
Retensi Penonton 2.20 (39,4%)
Penonton unik 503
Rekomendasi video 72,7%
Fitur jelajah 16,5%
Langsung atau tidak diketahui 4,2%
Fitur YouTube lainnya 2,5%
Lainnya 4,2%
Indonesia 14,1%
Tanpa subtitle/CC 96,2%
Indonesia subtitle/CC 3,8%
Tidak subscribe 96,7%
Disubscribe 3,3%`;
  const r = P.extractStudioText(text, "long");
  T("fixture bro views/impressions/ctr", r.views === 673 && r.impressions === 10600 && r.ctrPct === 5, JSON.stringify(r));
  T("fixture bro avd/retention", r.avgViewSec === 138 && r.retention30Pct === 39.4, JSON.stringify(r));
  T("traffic source kebaca", r.traffic.length >= 4 && r.traffic.some(x => x.key === "suggested" && x.pct === 72.7) && r.traffic.some(x => x.key === "browse" && x.pct === 16.5), JSON.stringify(r.traffic));
  T("audience split kebaca tanpa mengisi subs palsu", r.subs == null && r.audience.some(x => x.key === "notSubscribed" && x.pct === 96.7) && r.audience.some(x => x.key === "subscribed" && x.pct === 3.3), JSON.stringify(r.audience));
}

{
  const text = `Penayangan
49
Tayangan
1.408
Rasio klik-tayang dari tayangan
3,2%`;
  const r = P.extractStudioText(text, "long");
  T("label dan value beda baris", r.views === 49 && r.impressions === 1408 && r.ctrPct === 3.2, JSON.stringify(r));
  T("3 metrik saja tidak bikin retention palsu", r.retention30Pct == null && r.avgViewSec == null && r.likes == null && r.comments == null, JSON.stringify(r));
  const s = P.summarizeStudioText(r);
  T("summary found/missing jujur", s.found.includes("Views") && s.found.includes("CTR") && s.missing.includes("Retention"), JSON.stringify(s));
}

{
  const text = `Video title Doa Ibu
Views 120
Impressions 8000
Impressions click-through rate 1.2%
Video duration 04:30
Average view duration 0:27
Average percentage viewed 18%
Likes 5
Comments 1
Subscribers gained 0`;
  const r = P.extractStudioText(text, "long");
  T("english screenshot text", r.title === "Doa Ibu" && r.views === 120 && r.impressions === 8000 && r.ctrPct === 1.2 && r.durationSec === 270 && r.avgViewSec === 27 && r.retention30Pct === 18 && r.likes === 5 && r.comments === 1 && r.subs === 0, JSON.stringify(r));
}

{
  const text = `Views 120
Watch time (hours) 0.9
Impressions 8000
CTR 1.2%`;
  const r = P.extractStudioText(text, "long");
  T("watch time menghitung avg view aman", r.avgViewSec === 27 && r.notes.some(x => x.includes("dihitung")), JSON.stringify(r));
}

{
  const text = `Waktu tonton (jam)
2,5
Rata-rata durasi tonton
1.47
Retensi Penonton
Rata-rata durasi tonton · Semua
1.48 (40,1%)
Hype
0`;
  const r = P.extractStudioText(text, "long");
  T("interaksi screenshot OCR parsial", r.watchTimeHours === 2.5 && r.avgViewSec === 107 && r.retention30Pct === 40.1, JSON.stringify(r));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI TEXT PARSER GAGAL`); process.exit(1); }
console.log("\n🏁 TEXT PARSER SEHAT — paste teks screenshot siap");
