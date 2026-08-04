// ⚡🎨🔔🧪 UJI RADAR KOMPETITOR + THUMB TREND + DAILY NOTIFY (v19.5).
// Jalankan: node tests/radar-v19.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const krJs = transpile("../src/lib/brain/kompetitor-radar.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const K = await import(enc(krJs));

const audJs = transpile("../src/lib/brain/audience.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const trJs = transpile("../src/lib/brain/trend-radar.ts").replace('from "./audience"', `from "${enc(audJs)}"`);
const ttJs = transpile("../src/lib/brain/thumb-trend.ts")
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`)
  .replace('from "./trend-radar"', `from "${enc(trJs)}"`);
const TT = await import(enc(ttJs));

const patJs = transpile("../src/lib/brain/pattern-insight.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const ddJs = transpile("../src/lib/brain/deep-dive.ts")
  .replace('from "./pattern-insight"', `from "${enc(patJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const D = await import(enc(ddJs));

const asJs = transpile("../src/lib/brain/auto-sync.ts");
const dnJs = transpile("../src/lib/brain/daily-notify.ts")
  .replace('from "./deep-dive"', `from "${enc(ddJs)}"`)
  .replace('from "./auto-sync"', `from "${enc(asJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const DN = await import(enc(dnJs));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("⚡ Menguji Radar Kompetitor + Thumb Trend + Daily Notify");

/* ---------- 1. Radar Kompetitor ---------- */
{
  const mk = (title, vpd, views, subs) => ({ id: title, title, url: "#", vpd, views, subs, age: 30, tokens: [], phr: [], normTitle: title, vpm: 0 });
  const videos = [
    mk("5 Kisah Ibu yang Mengharukan", 500, 15000, 100),
    mk("Rindu Ibu di Malam Hari — Cerita", 400, 12000, 80),
    mk("3 Doa untuk Ayah Tersayang", 300, 9000, 60),
    mk("Update Vlog Biasa", 2, 100, 5000),
  ];
  const r = K.radarKompetitor(videos, 3);
  T("3 kompetitor tercepat terpilih", r.top.length === 3, `dapat ${r.top.length}`);
  T("urutan by vpd (tercepat dulu)", r.top[0].video.vpd === 500 && r.top[1].video.vpd === 400);
  T("video lambat tidak masuk", r.top.every((t) => t.video.vpd > 100));
  T("tiap item punya insight", r.top.every((t) => t.insight.length > 10));
  T("ringkasan menyebut kompetitor", r.ringkasan.includes("kompetitor tercepat"));
  const kosong = K.radarKompetitor([], 3);
  T("tanpa data → aman & jujur", kosong.top.length === 0 && kosong.ringkasan.includes("riset"));
}

/* ---------- 2. Radar: token & frasa dari judul ---------- */
{
  const mk = (title, vpd) => ({ id: title, title, url: "#", vpd, views: vpd * 10, subs: 100, age: 30, tokens: ["ibu", "rindu", "ibu", "cerita"], phr: ["rindu ibu", "ibu cerita"], normTitle: title, vpm: 0 });
  const r = K.radarKompetitor([mk("Judul A", 100)], 1);
  T("kata khas & frasa diambil", r.top[0].tokens.length > 0 && r.top[0].phrases.includes("Rindu Ibu"), r.top[0].phrases.join(","));
}

/* ---------- 3. Thumb Trend ---------- */
{
  const a = TT.saranThumbnail("ibu rindu anak", { emoji: "👨‍👩‍👧", label: "Keluarga", skor: 3, cocokLagu: true });
  T("thumb emosional: overlay & warna hangat", a.overlay.length > 0 && a.warna === "#f59e0b" && a.prompt.includes("emotional"));
  const b = TT.saranThumbnail("hantu di rumah kosong", { emoji: "👻", label: "Horor", skor: 2, cocokLagu: false });
  T("thumb horor: gelap + larangan", b.warna === "#0b0b12" && b.overlay.startsWith("JANGAN") && b.prompt.includes("horror"));
  const c = TT.saranThumbnail("dj remix", { emoji: "🎧", label: "DJ / Musik", skor: 1, cocokLagu: false });
  T("thumb dj: neon + full bass", c.warna === "#8b5cf6" && c.overlay.includes("FULL BASS"));
  const d = TT.saranThumbnail("hasil pertandingan bola", { emoji: "⚡", label: "Umum", skor: 0, cocokLagu: false });
  T("thumb umum: warna berani", d.warna === "#19c2b8" && d.prompt.length > 10);
}

/* ---------- 4. Daily Notify ---------- */
{
  const msg = DN.buatPesanHarian({ researches: [], results: [{ title: "A", time: Date.now() }] }, true);
  T("pesan harian memuat info otak", msg.includes("Otak") && msg.includes("judul") && msg.includes("Slot terbaik"), msg.slice(0, 80));
  const msg2 = DN.buatPesanHarian({ researches: [], results: [] }, false);
  T("pesan tanpa sync tetap jujur", msg2.includes("siap") && msg2.includes("Slot terbaik"));
  T("flag notif default off", DN.notifEnabled() === false);
  T("notif belum terkirim hari ini", DN.notifSentToday() === false);
}

if (gagal) { console.error(`\n💥 ${gagal} UJI RADAR V19 GAGAL`); process.exit(1); }
