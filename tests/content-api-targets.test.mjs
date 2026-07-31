// 📡 UJI CONTENT API TARGETS — 6 kebutuhan API VERVE sudah dikunci aman.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const A = await loadTs("../src/lib/brain/content-api-targets.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📡 Menguji registry Content API Targets");

const targets = A.listContentApiTargets();
const keys = targets.map((t) => t.key);
const wajib = [
  "youtube_video_research",
  "youtube_transcript",
  "comment_analysis",
  "content_ideas_tiktok_youtube",
  "keyword_title_recommendation",
  "video_audio_asset_search",
];

T("tepat 6 target utama", targets.length === 6, keys.join(", "));
for (const key of wajib) T(`target ada: ${key}`, keys.includes(key));

T("riset YouTube punya YouTube MCP", A.getContentApiTarget("youtube_video_research")?.primary.actorId === "nexgendata/youtube-media-mcp-server");
T("transcript punya scraper utama", A.getContentApiTarget("youtube_transcript")?.primary.actorId === "nexgendata/youtube-transcript-scraper");
T("komentar punya YouTube comments", A.getContentApiTarget("comment_analysis")?.primary.actorId === "dz_omar/youtube-comments-scraper");
T("ide konten punya TikTok scraper", A.getContentApiTarget("content_ideas_tiktok_youtube")?.primary.actorId === "apidojo/tiktok-scraper");
T("keyword punya autocomplete YouTube", A.getContentApiTarget("keyword_title_recommendation")?.primary.actorId === "sian.agency/youtube-auto-complete-and-query-suggestion");
T("asset tetap pakai jalur built-in dulu", A.getContentApiTarget("video_audio_asset_search")?.primary.kind === "built_in");

const actors = A.listApifyActors();
T("aktor Apify terkumpul", actors.length >= 15, `${actors.length} actors`);
T("aktor unik semua", new Set(actors).size === actors.length);
T("normalisasi path Apify benar", A.toApifyActorPath("nexgendata/youtube-media-mcp-server") === "nexgendata~youtube-media-mcp-server");
T("allowlist menerima slash", A.isAllowedApifyActor("nexgendata/youtube-media-mcp-server"));
T("allowlist menerima URL", A.isAllowedApifyActor("https://apify.com/nexgendata/youtube-media-mcp-server"));
T("allowlist tolak aktor liar", !A.isAllowedApifyActor("unknown/expensive-runner"));

const env = targets.flatMap((t) => t.env || []);
T("APIFY_TOKEN tercatat opsional", env.some((x) => String(x).includes("APIFY_TOKEN")));
T("jalur resmi lama tetap disebut", env.some((x) => String(x).includes("YOUTUBE_API_KEY")));

if (gagal) { console.error(`\n💥 ${gagal} UJI CONTENT API TARGETS GAGAL`); process.exit(1); }
console.log("\n🏁 CONTENT API TARGETS AMAN — 6 kebutuhan API sudah dikunci tanpa menjalankan API berbayar");
