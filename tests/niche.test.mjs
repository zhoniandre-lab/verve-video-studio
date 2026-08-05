// 🎯🧪 UJI DUKUNGAN SEMUA NICHE (v19.20) — title guru & trend cocok per niche.
// Jalankan: node tests/niche.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const patJs = transpile("../src/lib/brain/pattern-insight.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const nicJs = transpile("../src/lib/brain/niche.ts");
const tgJs = transpile("../src/lib/brain/title-guru.ts")
  .replace('from "./pattern-insight"', `from "${enc(patJs)}"`)
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`)
  .replace('from "./niche"', `from "${enc(nicJs)}"`);
const G = await import(enc(tgJs));

const audJs = transpile("../src/lib/brain/audience.ts").replace('from "./yie-score"', `from "${enc(yieJs)}"`);
const trJs = transpile("../src/lib/brain/trend-radar.ts").replace('from "./audience"', `from "${enc(audJs)}"`);
const T = await import(enc(trJs));

let gagal = 0;
const T2 = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎯 Menguji dukungan semua niche");

/* 1. Title Guru: tiap niche punya gaya judul sendiri */
{
  const brain = { researches: [], results: [] };
  const story = G.suggestTitlesFromBrain("ibu", brain, 3, "story_song");
  T2("story_song: ada gaya emosi (Ibu/Rindu)", story.some((x) => /ibu|rindu|nangis/i.test(x.title)), story.map((x) => x.title).join(" | "));
  const horror = G.suggestTitlesFromBrain("hantu", brain, 3, "horror");
  T2("horror: ada JANGAN/seram", horror.some((x) => /jangan|seram|merinding|bulu kuduk/i.test(x.title)), horror.map((x) => x.title).join(" | "));
  const dj = G.suggestTitlesFromBrain("remix", brain, 3, "dj");
  T2("dj: ada FULL BASS/nonstop", dj.some((x) => /full bass|nonstop|remix/i.test(x.title)), dj.map((x) => x.title).join(" | "));
  const tut = G.suggestTitlesFromBrain("edit video", brain, 3, "tutorial");
  T2("tutorial: ada Cara/Tips", tut.some((x) => /cara|tips|tutorial/i.test(x.title)), tut.map((x) => x.title).join(" | "));
  const mus = G.suggestTitlesFromBrain("doa", brain, 3, "muslim");
  T2("muslim: ada islami/hati", mus.some((x) => /hati|islam|nasihat/i.test(x.title)), mus.map((x) => x.title).join(" | "));
  const cust = G.suggestTitlesFromBrain("gaming", brain, 3, "custom");
  T2("custom: tetap keluar saran generik", cust.length > 0);
}

/* 2. Trend cocokNiche per niche */
{
  T2("cocokNiche horor untuk 'hantu di rumah'", T.cocokNiche("hantu di rumah kosong", "horror") === true);
  T2("cocokNiche story_song untuk 'lagu ibu'", T.cocokNiche("lagu sedih ibu", "story_song") === true);
  T2("cocokNiche dj untuk 'dj remix'", T.cocokNiche("dj remix terbaru", "dj") === true);
  T2("cocokNiche tutorial untuk 'cara memasak'", T.cocokNiche("cara memasak nasi goreng", "tutorial") === true);
  T2("cocokNiche horor TIDAK untuk 'bola'", T.cocokNiche("hasil pertandingan bola", "horror") === false);
}

/* 3. Niche default = story_song (perilaku lama aman) */
{
  const N = await import(enc(nicJs));
  T2("NICHES berisi 7 pilihan termasuk custom", N.NICHES.length === 7 && N.NICHES[6].id === "custom");
  T2("nicheById default ke story_song", N.nicheById("ngaco").id === "story_song");
  T2("nicheAiLabel custom pakai label user", N.nicheAiLabel("custom", "Otomotif") === "otomotif");
}

if (gagal) { console.error(`\n💥 ${gagal} UJI NICHE GAGAL`); process.exit(1); }
