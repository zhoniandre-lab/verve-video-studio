// 🛰️🧪 UJI KOMPETITOR RSS (v19.6) — parser RSS YouTube, ekstrak channel ID, deteksi judul mirip.
// Jalankan: node tests/competitor-rss.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const krJs = transpile("../src/lib/brain/competitor-rss.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const K = await import(enc(krJs));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🛰️ Menguji Kompetitor RSS");

/* ---------- 1. Parser RSS YouTube (Atom) ---------- */
const SAMPLE = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
<title>Channel Lawan</title>
<entry>
  <id>yt:video:abc123</id>
  <yt:videoId>abc123</yt:videoId>
  <title>5 Kisah Ibu &amp; Anak yang Mengharukan</title>
  <published>2026-08-04T15:00:00+00:00</published>
</entry>
<entry>
  <yt:videoId>xyz789</yt:videoId>
  <title>Rindu Ayah di Malam Hari</title>
  <published>2026-08-03T09:00:00+00:00</published>
</entry>
</feed>`;
{
  const items = K.parseYtRss(SAMPLE);
  T("parse 2 entry", items.length === 2, `dapat ${items.length}`);
  T("videoId & url terbaca", items[0].videoId === "abc123" && items[0].url.includes("abc123"));
  T("entitas XML di-decode", items[0].title === "5 Kisah Ibu & Anak yang Mengharukan");
  T("publishedAt jadi angka", Number.isFinite(items[0].publishedAt) && items[0].publishedAt > 0);
  T("RSS kosong → array kosong", K.parseYtRss("").length === 0);
}

/* ---------- 2. Ekstrak channel ID dari berbagai bentuk URL ---------- */
{
  T("ID langsung", K.extractChannelId("UCX6OQ3DkcsbYNE6H8uQQuVA") === "UCX6OQ3DkcsbYNE6H8uQQuVA");
  T("URL /channel/", K.extractChannelId("https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA") === "UCX6OQ3DkcsbYNE6H8uQQuVA");
  T("URL + query channel_id", K.extractChannelId("https://youtube.com/?channel_id=UCX6OQ3DkcsbYNE6H8uQQuVA") === "UCX6OQ3DkcsbYNE6H8uQQuVA");
  T("bukan UC → null", K.extractChannelId("UC123") === null);
  T("@handle → null tapi butuhResolve=true", K.extractChannelId("https://youtube.com/@mrbeast") === null && K.butuhResolve("https://youtube.com/@mrbeast") === true);
  T("bukan URL → butuhResolve=false", K.butuhResolve("tulisan biasa") === false);
}

/* ---------- 3. Deteksi judul mirip dengan brain ---------- */
{
  const brain = { researches: [], results: [
    { title: "5 Kisah Ibu yang Mengharukan", ctr: 7.0, time: Date.now() - 5 * 864e5 },
    { title: "Rindu Ayah di Malam Hari", ctr: 6.0, time: Date.now() - 3 * 864e5 },
  ]};
  const a = K.simJudul("5 Kisah Ibu & Anak yang Mengharukan", brain);
  T("judul mirip terdeteksi (≥60%)", a.max >= 60, `sim=${a.max}%`);
  const b = K.simJudul("Review HP Murah Terbaru 2026", brain);
  T("judul beda → rendah", b.max < 60, `sim=${b.max}%`);
  const c = K.simJudul("Video", { researches: [], results: [] });
  T("brain kosong → aman 0%", c.max === 0 && c.match === null);
}

/* ---------- 4. Ringkasan scan ---------- */
{
  const feeds = [
    { channelId: "UC1", channelName: "Lawan A", items: [{ title: "Judul Baru", videoId: "v1", url: "#", published: "", publishedAt: Date.now() - 3600e3 }] },
  ];
  const sum = K.ringkasanScan(feeds, { researches: [], results: [] });
  T("ringkasan memuat channel & waktu", sum.includes("Lawan A") && sum.includes("lalu"), sum.slice(0, 60));
  const kosong = K.ringkasanScan([], { researches: [], results: [] });
  T("tanpa data → pesan jujur", kosong.includes("Belum ada upload baru"));
}

if (gagal) { console.error(`\n💥 ${gagal} UJI KOMPETITOR RSS GAGAL`); process.exit(1); }
