// 🔥🧪 UJI TREND RADAR + JADWAL UPLOAD (v19.4) — parser RSS Google Trends, skor relevansi niche, golden-hour.
// Jalankan: node tests/trend-radar.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const audJs = transpile("../src/lib/brain/audience.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const trJs = transpile("../src/lib/brain/trend-radar.ts").replace('from "./audience"', `from "${enc(audJs)}"`);
const T = await import(enc(trJs));

const patJs = transpile("../src/lib/brain/pattern-insight.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const ddJs = transpile("../src/lib/brain/deep-dive.ts")
  .replace('from "./pattern-insight"', `from "${enc(patJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const D = await import(enc(ddJs));

let gagal = 0;
const T2 = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔥 Menguji Trend Radar + Jadwal Upload");

/* ---------- 1. Parser RSS Google Trends ---------- */
const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0" xmlns:ht="https://trends.google.com/trends/trendingsearches/daily/rss">
<channel><title>Daily Search Trends</title>
<item>
<title>ibu rindu anak</title>
<ht:approx_traffic>200K+</ht:approx_traffic>
<link>https://trends.google.com</link>
<pubDate>Tue, 4 Aug 2026 09:50:00 -0700</pubDate>
<ht:news_item><ht:news_item_title>Berita tentang ibu &amp; anak</ht:news_item_title></ht:news_item>
</item>
<item>
<title>game mobile legend</title>
<ht:approx_traffic>100K+</ht:approx_traffic>
<pubDate>Tue, 4 Aug 2026 09:45:00 -0700</pubDate>
</item>
</channel></rss>`;
{
  const items = T.parseTrendsRss(SAMPLE);
  T2("parse 2 item", items.length === 2, `dapat ${items.length}`);
  T2("title & traffic terbaca", items[0].title === "ibu rindu anak" && items[0].traffic === "200K+");
  T2("entitas XML di-decode (&amp; → &)", items[0].news?.[0] === "Berita tentang ibu & anak");
  T2("pubDate terbaca", items[0].pubDate.includes("Aug 2026"));
  T2("RSS kosong → array kosong", T.parseTrendsRss("").length === 0);
}

/* ---------- 2. Skor relevansi niche ---------- */
{
  const a = T.skorTrend("ibu rindu anak");
  T2("trend keluarga → cocok lagu (👨‍👩‍👧/💔)", ["👨‍👩‍👧", "💔"].includes(a.emoji) && a.cocokLagu === true && a.skor >= 1, `${a.emoji} skor=${a.skor}`);
  const b = T.skorTrend("hantu di rumah kosong");
  T2("trend horor → 👻", b.emoji === "👻" && b.label === "Horor", `${b.emoji} ${b.label}`);
  const c = T.skorTrend("dj remix terbaru");
  T2("trend dj → 🎧", c.emoji === "🎧" && c.label === "DJ / Musik");
  const d = T.skorTrend("hasil pertandingan bola");
  T2("trend umum → ⚡ bukan lagu", d.emoji === "⚡" && d.cocokLagu === false);
}

/* ---------- 3. Jadwal upload golden hour ---------- */
{
  const mk = (daysAgo, hour, views) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setHours(hour, 0, 0, 0);
    return { title: `V${hour}-${views}`, time: d.getTime(), views };
  };
  const brain = {
    researches: [],
    results: [
      mk(10, 20, 5000), mk(20, 21, 6000), mk(30, 19, 3000), // malam
      mk(9, 9, 100), mk(19, 8, 50), // pagi lambat
    ],
  };
  const j = D.jadwalUpload(brain, 7);
  T2("jadwal 7 hari keluar", j.slots.length === 7);
  T2("semua slot ada jendela & alasan", j.slots.every((s) => s.jendela.length > 0 && s.alasan.length > 0));
  T2("hari terbaik ditandai ⭐ (hoki)", j.slots.some((s) => s.hoki) && j.slots.find((s) => s.hoki)?.alasan.includes("⭐"), j.slots.find((s) => s.hoki)?.hari);
  T2("sumber menyebut data channel", j.sumber.includes("video channelmu"));
  const kosong = D.jadwalUpload({ researches: [], results: [] }, 3);
  T2("tanpa data tetap keluar 3 slot (fallback jujur)", kosong.slots.length === 3 && kosong.slots[0].alasan.includes("sync"));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI TREND RADAR GAGAL`); process.exit(1); }
