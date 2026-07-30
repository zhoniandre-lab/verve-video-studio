// 🔗 UJI PARSER URL YOUTUBE — ambil videoId dari watch/shorts/live/embed/youtu.be.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const P = await loadTs("../src/lib/brain/youtube-url.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔗 Menguji parser URL YouTube");

const id = "dQw4w9WgXcQ";
T("raw id", P.extractYoutubeVideoId(id) === id);
T("watch url", P.extractYoutubeVideoId(`https://www.youtube.com/watch?v=${id}&t=3s`) === id);
T("short url", P.extractYoutubeVideoId(`https://youtu.be/${id}`) === id);
T("shorts url", P.extractYoutubeVideoId(`https://youtube.com/shorts/${id}?si=abc`) === id);
T("live url", P.extractYoutubeVideoId(`https://www.youtube.com/live/${id}`) === id);
T("embed url", P.extractYoutubeVideoId(`https://www.youtube.com/embed/${id}`) === id);
T("invalid kosong", P.extractYoutubeVideoId("https://example.com/watch?v=abc") === "");

if (gagal) { console.error(`\n💥 ${gagal} UJI YOUTUBE URL GAGAL`); process.exit(1); }
console.log("\n🏁 YOUTUBE URL PARSER SEHAT");
