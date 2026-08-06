// 🏹🧪 UJI BOT BURUAN AI (v19.35) — parser sumber eksternal, tebak kategori/jenis/skor, gabung item
// Jalankan: node tests/buruan.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const { parseAwesomeFreeLlmApis, parseFreeForDev, parseFreeAiTools, parseI2vTable, parseAwesomeAiTools, tebakKategori, tebakJenis, skorMudah, dedupeMentah, gabungItems, pisahLink } =
  await import(enc(transpile("../src/lib/buruan/parse.ts")));
const { katalogKurasi } = await import(enc(transpile("../src/lib/buruan/katalog.ts")));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🏹 Menguji Bot Buruan AI");

/* 1. Katalog kurasi: minimal 30 item (v19.35.1 diperdalam video AI), semua wajib punya tutorial & skor 1-5 */
const kurasi = katalogKurasi();
T("katalog kurasi ≥ 30 item (diperdalam)", kurasi.length >= 30, `${kurasi.length} item`);
T("item gambar-video ≥ 15 (video AI dalam)", kurasi.filter((i) => i.kategori === "gambar-video").length >= 15, `${kurasi.filter((i) => i.kategori === "gambar-video").length} item`);
T("semua item kurasi punya tutorial ≥ 2 langkah", kurasi.every((i) => i.tutorial.length >= 2));
T("skor mudah semua 1..5", kurasi.every((i) => i.mudah >= 1 && i.mudah <= 5));
T("item chat OpenAI-compatible punya baseUrl", kurasi.filter((i) => i.kategori === "chat").every((i) => !!i.baseUrl), `${kurasi.filter((i) => i.kategori === "chat").length} item chat`);
T("item gambar-video punya tags 'gambar bergerak'", kurasi.filter((i) => i.kategori === "gambar-video").every((i) => (i.tags || []).includes("gambar bergerak")));
/* v19.35.2: integrasi & keyUrl */
T("semua item kurasi punya integrasi valid", kurasi.every((i) => ["api-key", "api", "ui"].includes(i.integrasi)));
T("item chat (api-key) punya keyUrl https — tombol langsung ke halaman API key", kurasi.filter((i) => i.integrasi === "api-key").every((i) => /^https:\/\//.test(i.keyUrl || "")), `${kurasi.filter((i) => i.integrasi === "api-key").length} item api-key`);
T("provider video UI punya integrasi ui", kurasi.filter((i) => i.id === "hailuo" || i.id === "kling" || i.id === "viggle").every((i) => i.integrasi === "ui"));
T("ElevenLabs & NVIDIA video = api", kurasi.filter((i) => i.id === "elevenlabs" || i.id === "nvidia-video").every((i) => i.integrasi === "api"));

/* 2. pisahLink */
const pl = pisahLink("- [Groq](https://groq.com) - inferensi ngebut");
T("pisahLink ambil nama/url/desc", pl.nama === "Groq" && pl.url === "https://groq.com" && pl.desc.includes("inferensi"), pl.nama);

/* 3. tebakKategori */
T("kategori video", tebakKategori("runway image to video free") === "gambar-video");
T("kategori musik", tebakKategori("free music generation suno") === "musik");
T("kategori chat", tebakKategori("llm api free token") === "chat");
T("kategori gambar", tebakKategori("generate image art") === "gambar");

/* 4. tebakJenis */
T("jenis harian", tebakJenis("free daily credits") === "harian");
T("jenis bulanan", tebakJenis("100k credits per month") === "bulanan");
T("jenis sekali", tebakJenis("one-time trial credits") === "sekali");
T("jenis permanen", tebakJenis("free forever") === "permanen");

/* 5. skorMudah */
T("skor tinggi tanpa kartu", skorMudah("no credit card required, free signup") === 5);
T("skor rendah butuh kartu", skorMudah("credit card required for trial") === 1);
T("skor netral", skorMudah("limited free tier") === 2);

/* 6. parse awesome-free-llm-apis (sampel realistis) */
const sampleLlm = `# Awesome Free LLM APIs
## Provider APIs
### Cohere 🇨🇦
Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.
Base URL: https://api.cohere.com/v2
### Cerebras 🇺🇸
| Model | Rate Limit |
| gpt-oss-120b | 5 RPM, 30K TPM |
Free tier: 5 RPM, no credit card
Base URL: https://api.cerebras.ai/v1
## Inference providers
### Hugging Face 🇺🇸
Free credits: 100K credits/month free
Base URL: https://api-inference.huggingface.co/v1`;
const llm = parseAwesomeFreeLlmApis(sampleLlm);
T("parse awesome-free-llm-apis ambil ≥ 3 provider", llm.length >= 3, `${llm.length} item`);
const cohere = llm.find((x) => x.nama.toLowerCase().includes("cohere"));
T("Cohere: base URL & no kartu", cohere?.baseUrl === "https://api.cohere.com/v2" && cohere?.syarat === "Tanpa kartu", JSON.stringify(cohere));

/* 7. parse free-for-dev (sampel realistis) */
const sampleFfd = `## AI
- [Groq](https://groq.com) - Fast AI inference with free tier, no credit card required
- [Hugging Face](https://huggingface.co) - Free credits monthly for models
- [ElevenLabs](https://elevenlabs.io) - Text to speech, 10k characters free per month
## Other section
- [Not AI](https://example.com) - not relevant`;
const ffd = parseFreeForDev(sampleFfd);
T("parse free-for-dev cuma ambil bagian AI", ffd.length === 3, `${ffd.length} item`);
T("free-for-dev: kategori suara buat elevenlabs", ffd.find((x) => x.nama === "ElevenLabs")?.kategori === "suara");

/* 8. parse free-ai-tools (tabel) */
const sampleTools = `## AI Browser Automation
| Tool | Free Tier | Credit Card |
| --- | --- | --- |
| Gemini CLI | 1,500 req/day | No |
| Warp | 150 credits/mo | No |
## Other
- [NotFree](https://x.com) - paid only`;
const tools = parseFreeAiTools(sampleTools);
T("parse free-ai-tools ambil baris tabel gratis", tools.length >= 2, `${tools.length} item`);
T("free-ai-tools: Gemini tanpa kartu", tools.some((x) => x.nama.includes("Gemini") && x.syarat === "Tanpa kartu"));

/* 9. dedupe */
const dd = dedupeMentah([...llm, ...ffd, ...tools, ...tools]);
T("dedupeMentah buang duplikat", dd.length <= llm.length + ffd.length + tools.length, `${dd.length} item`);

/* 10. parseI2vTable (awesome-image-to-video) */
const sampleI2v = `| #  | Name | URL | Description | Free tier summary |
|----|------|-----|-------------|-------------------|
| 1  | Runway | https://runwayml.com | Animate still images | Free credits for new users |
| 2  | Hailuo AI | https://hailuoai.com | Image to video | Generous free quota on sign-up |
| 3  | PixVerse | https://pixverse.ai | Image and text to video | Free tier with limited daily jobs |`;
const i2v = parseI2vTable(sampleI2v);
T("parseI2vTable ambil 3 baris", i2v.length === 3, `${i2v.length} item`);
T("parseI2vTable: semua kategori gambar-video & punya URL", i2v.every((x) => x.kategori === "gambar-video" && /^https?:/.test(x.url)));
T("parseI2vTable: PixVerse terdeteksi harian", i2v.find((x) => x.nama === "PixVerse")?.jenis === "harian");

/* 11. parseAwesomeAiTools (tankvn) — cuma tag Free/Freemium/Free Trial */
const sampleTank = `### Video Generators
- [Runway](https://runwayml.com) - AI video creation.. [Freemium]
- [Viggle AI](https://viggle.ai) - Animate images.. [Free]
- [Synthesys](https://synthesys.io) - text-to-voiceover.. [Paid]
- [Gen-2](https://runwayml.com/gen-2) - create videos.. [Free Trial]`;
const tank = parseAwesomeAiTools(sampleTank);
T("parseAwesomeAiTools: Paid TIDAK masuk", tank.length === 3 && !tank.some((x) => x.nama.includes("Synthesys")), `${tank.length} item`);
T("parseAwesomeAiTools: kategori video", tank.every((x) => x.kategori === "gambar-video" || x.kategori === "musik" || x.kategori === "suara"));

/* 12. gabungItems: kurasi + sumber, id stabil, tanpa duplikat nama */
const gabung = gabungItems(kurasi, [...llm, ...ffd], Date.now());
T("gabung ≥ kurasi (sumber nambah)", gabung.length >= kurasi.length, `${gabung.length} item`);
T("tidak ada nama duplikat", new Set(gabung.map((x) => x.nama.toLowerCase())).size === gabung.length);
T("item hasil gabung punya tutorial", gabung.every((x) => x.tutorial.length >= 1));
T("item hasil gabung punya integrasi", gabung.every((x) => ["api-key", "api", "ui"].includes(x.integrasi)));

if (gagal) { console.error(`\n💥 ${gagal} UJI BOT BURUAN GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI BOT BURUAN HIJAU — siap dipakai di dashboard!");
