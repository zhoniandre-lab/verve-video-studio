// 📥 UJI CSV YOUTUBE STUDIO — parser header Indonesia/English dan angka rb/%/durasi.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const P = await loadTs("../src/lib/brain/yt-studio-csv.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📥 Menguji YouTube Studio CSV Parser");

{
  const rows = P.parseCsv('Judul video,Penayangan,Tayangan,Rasio klik-tayang dari tayangan (%),Rata-rata durasi tonton,Retensi,Suka,Komentar\n"Doa, Ibu",673,"10,6 rb","5,0%",2:18,"39,4%",30,5');
  T("parse quoted comma", rows[1][0] === "Doa, Ibu", rows[1][0]);
}

T("parse rb", P.parseStudioNumber("10,6 rb") === 10600, String(P.parseStudioNumber("10,6 rb")));
T("parse persen id", P.parseStudioNumber("5,0%") === 5, String(P.parseStudioNumber("5,0%")));
T("parse duration colon", P.parseStudioDuration("2:18") === 138, String(P.parseStudioDuration("2:18")));
T("parse duration dot mobile", P.parseStudioDuration("2.18") === 138, String(P.parseStudioDuration("2.18")));

{
  const csv = 'Judul video,Penayangan,Tayangan,Rasio klik-tayang dari tayangan (%),Durasi,Rata-rata durasi tonton,Retensi,Suka,Komentar,Subscriber\nPelukan Terakhir,673,"10,6 rb","5,0%",5:50,2:18,"39,4%",50,8,3';
  const out = P.extractStudioRows(csv, "long");
  const r = out[0];
  T("extract row id", out.length === 1 && r.title === "Pelukan Terakhir");
  T("extract views/impressions/ctr", r.views === 673 && r.impressions === 10600 && r.ctrPct === 5, JSON.stringify(r));
  T("extract durations/retention", r.durationSec === 350 && r.avgViewSec === 138 && r.retention30Pct === 39.4, JSON.stringify(r));
}

{
  const csv = 'Video title,Views,Impressions,Impressions click-through rate (%),Average view duration,Average percentage viewed (%),Likes,Comments,Subscribers\nI miss mother,120,8000,1.2%,0:27,18%,5,1,0';
  const r = P.extractStudioRows(csv, "long")[0];
  T("english headers", r.title === "I miss mother" && r.views === 120 && r.impressions === 8000 && r.ctrPct === 1.2 && r.avgViewSec === 27 && r.retention30Pct === 18);
}

{
  const csv = 'Judul video;Penayangan;Tayangan;Rasio klik-tayang dari tayangan (%);Durasi tonton rata-rata;Persentase ditonton rata-rata (%);Suka;Komentar ditambahkan\nTotal;49;1408;3,2%;00:27;18%;20;3';
  const r = P.extractStudioRows(csv, "long")[0];
  T("semicolon csv tidak pecah angka koma", r.title === "Total" && r.views === 49 && r.impressions === 1408 && r.ctrPct === 3.2, JSON.stringify(r));
  T("header studio id variasi interaksi", r.avgViewSec === 27 && r.retention30Pct === 18 && r.likes === 20 && r.comments === 3, JSON.stringify(r));
  T("coverage csv jujur", r.parsedFields.includes("avd") && r.missingFields.includes("subs"), JSON.stringify(P.summarizeStudioRow(r)));
}

{
  const csv = 'Video title,Views,Watch time (hours),Impressions,Impressions click-through rate (%)\nWatchtime compute,120,0.9,8000,1.2%';
  const r = P.extractStudioRows(csv, "long")[0];
  T("watch time hours bisa hitung avg view aman", r.avgViewSec === 27, JSON.stringify(r));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI CSV GAGAL`); process.exit(1); }
console.log("\n🏁 CSV PARSER SEHAT — import YouTube Studio siap");
