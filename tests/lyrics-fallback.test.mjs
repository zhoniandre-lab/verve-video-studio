// 🧠🧪 UJI GENERATE LIRIK (v19.38) — parser + fallback OpenAI-compatible (bansos)
// Jalankan: node tests/lyrics-fallback.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function tr(rel) {
  return ts.transpileModule(readFileSync(new URL(rel, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const { buildSystemPrompt, parseLyrics } = await import(enc(tr("../src/lib/lyrics-prompt.ts")));
const { chatOpenAiCompatible } = await import(enc(tr("../src/lib/openai-compat.ts")));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧠 Menguji generate lirik (parser + fallback bansos)");

/* 1. buildSystemPrompt: mengandung judul */
const sys = buildSystemPrompt("Rindu Ibu", "rindu ibu", "cerita jadi lagu", "pop ballad", "haru");
T("prompt mengandung judul", sys.includes("Rindu Ibu"));
T("prompt mengandung struktur WAJIB", sys.includes("[Chorus] 4"));
T("prompt mengandung format ===LYRICS===", sys.includes("===LYRICS==="));

/* 2. parseLyrics: sample output asli */
const sample = `===TITLE===
Rindu Ibu
===GENRE===
pop ballad
===MOOD===
haru
===TAGS===
rindu, ibu, keluarga, sedih, menyentuh
===STYLE_PROMPT_SUNO===
Emotional indonesian pop ballad, soft piano, female vocal, nostalgic
===LYRICS===
[Intro]
Malam ini ku kembali
Mengenang masa kecilku
[Verse 1]
Di pelukan hangatmu dulu
Ku merasa aman selalu
Senyummu adalah cahaya
Yang menerangi jalanku
Ibu...
[Chorus]
Rindu ibu, oh ibu
Kuingin pulang padamu
Peluk erat jiwaku
Yang jauh dari rumahmu`;
const parsed = parseLyrics(sample);
T("parse: title benar", parsed.title === "Rindu Ibu", parsed.title);
T("parse: lyrics ≥ 50 char", parsed.lyrics.length >= 50, `${parsed.lyrics.length} char`);
T("parse: ada [Chorus]", parsed.lyrics.includes("[Chorus]"));
T("parse: tags array", Array.isArray(parsed.tags) && parsed.tags.length >= 4, `${parsed.tags.length} tags`);
T("parse: style suno ada", parsed.style_prompt_suno.length > 10);

/* 3. parseLyrics: lirik pendek → error */
try { parseLyrics("===TITLE===\nX\n===LYRICS===\npendek"); T("lirik pendek ditolak", false); } catch { T("lirik pendek ditolak", true); }

/* 4. chatOpenAiCompatible: stub fetch OpenAI-compatible → dapat teks */
const asliFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/chat/completions")) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Halo dari stub" } }] }) };
  }
  return { ok: false, json: async () => ({}) };
};
const teks = await chatOpenAiCompatible("https://api.groq.com/openai/v1", "key-abc", "llama-3.3-70b-versatile", [{ role: "user", content: "hai" }]);
T("chatOpenAiCompatible: balasan didapat", teks === "Halo dari stub", teks);
globalThis.fetch = asliFetch;

/* 5. base URL aneh → error cepat */
try { await chatOpenAiCompatible("notaurl", "k", "m", []); T("base aneh ditolak", false); } catch { T("base aneh ditolak", true); }

/* 6. route lyrics: harus baca header bansos dulu (cek kode) */
const route = readFileSync(new URL("../src/app/api/hcnsec/lyrics/route.ts", import.meta.url), "utf8");
T("route: baca header x-bansos-chat-base", /x-bansos-chat-base/.test(route));
T("route: bansos dicoba DULU sebelum hcnsec", route.indexOf("cobaBansos") < route.indexOf("cobaHcnsec") && /viaBansos/.test(route));
T("route: pesan error kasih solusi Dompet Bansos", /Dompet Bansos/.test(route));
/* SunoPanel & Lahan kirim header bansos */
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");
T("SunoPanel: genLyrics kirim bansosHeaders", /bansosHeaders/.test(panel) && /hcnsec\/lyrics/.test(panel));
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
T("Lahan: genLyrics kirim header bansos", /x-bansos-chat-base/.test(lahan));

if (gagal) { console.error(`\n💥 ${gagal} UJI LIRIK GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LIRIK HIJAU — generate lirik jalan dengan atau tanpa key server!");
