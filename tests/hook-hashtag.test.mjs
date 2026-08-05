// 🪝#️⃣🧪 UJI HOOK ENGINE + HASHTAG PINTAR (v19.10) — ilmu dari Short-Video Coach & TikTok Strategist.
// Jalankan: node tests/hook-hashtag.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function transpile(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}

const yieJs = transpile("../src/lib/brain/yie-score.ts");
const nicJs = transpile("../src/lib/brain/niche.ts");
const hkJs = transpile("../src/lib/brain/hook-engine.ts");
const H = await import(enc(hkJs));
const htJs = transpile("../src/lib/brain/hashtag-pintar.ts")
  .replace('from "./yie-score"', `from "${enc(yieJs)}"`)
  .replace('from "./niche"', `from "${enc(nicJs)}"`);
const HP = await import(enc(htJs));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🪝 Menguji Hook Engine + Hashtag Pintar");

/* ---------- 1. Hook Engine: analisa adegan ---------- */
{
  const a1 = H.analisaAdegan({ scene: 1, visual_prompt: "extreme close-up of mother's face, tears in eyes, warm light, emotional" });
  T("adegan close-up + emosi = KUAT", a1.verdict === "kuat" && a1.skor >= 75, `${a1.verdict} ${a1.skor}`);
  const a2 = H.analisaAdegan({ scene: 1, visual_prompt: "wide shot of village landscape at sunset" });
  T("adegan wide shot = LEMAH", a2.verdict === "lemah" && a2.alasan.some((x) => x.includes("Wide")), `${a2.verdict} ${a2.skor}`);
  const a3 = H.analisaAdegan({ scene: 2, visual_prompt: "medium shot of man walking" });
  T("adegan medium tanpa emosi = lemah (skor dasar 30)", a3.verdict === "lemah" && a3.skor === 30, `${a3.verdict} ${a3.skor}`);
}

/* ---------- 2. Hook Engine: analisa board + saran ---------- */
{
  const board = {
    scenes: [
      { scene: 1, visual_prompt: "wide shot of empty house", scene_desc: "rumah kosong", mood: "sedih" },
      { scene: 2, visual_prompt: "close-up of mother crying", scene_desc: "ibu menangis", mood: "haru" },
    ],
  };
  const h = H.analisaHook(board);
  T("adegan1 lemah terdeteksi", h.adegan1?.verdict === "lemah", h.ringkasan);
  T("saran berisi close-up", h.saran.some((x) => x.toLowerCase().includes("close-up")));
  T("ringkasan jelas", h.ringkasan.length > 10);
  const kosong = H.analisaHook(null);
  T("board kosong → aman", kosong.adegan1 === null && kosong.semua.length === 0);
}

/* ---------- 3. Upgrade adegan 1 ---------- */
{
  const baru = H.upgradeAdegan1({ scene: 1, visual_prompt: "old house" });
  T("upgrade menambah close-up emosi", baru.includes("close-up") && baru.includes("tears") && baru.includes("old house"), baru.slice(0, 60));
  const baru2 = H.upgradeAdegan1({ scene: 1, visual_prompt: "" });
  T("upgrade prompt kosong tetap aman", baru2.includes("close-up"));
}

/* ---------- 4. Hashtag Pintar ---------- */
{
  const p = HP.hashtagPintar("Ibu Engkau Yang Terbaik Cerita Jadi Lagu", "rindu ibu", "trend viral");
  T("6-8 hashtag keluar", p.tags.length >= 6 && p.tags.length <= 8, `${p.tags.length} tag`);
  T("ada tag niche (kisahnyata)", p.tags.includes("kisahnyata") || p.tags.includes("kisahmenyentuh") || p.tags.includes("laguemosional"));
  T("ada tag dari judul (ibu/engkau)", p.tags.some((t) => t.includes("ibu") || t.includes("engkau")), p.tags.join(" "));
  T("semua tag valid (huruf kecil, tanpa #)", p.tags.every((t) => /^[a-z0-9]{3,24}$/.test(t)), p.tags.join(" "));
  T("tidak ada duplikat", new Set(p.tags).size === p.tags.length);
  const kosong = HP.hashtagPintar("", "");
  T("tanpa judul → pesan jujur", kosong.tags.length === 0 || kosong.alasan.includes("judul"), kosong.alasan);
}

/* ---------- 5. jadiHashtag membersihkan ---------- */
{
  T("hapus aksen & tanda baca", HP.jadiHashtag("Cerita Jadi Lagu! 🎵") === "ceritajadilagu");
  T("potong max 24", HP.jadiHashtag("abcdefghijklmnopqrstuvwxyz1234567890").length <= 24);
}

if (gagal) { console.error(`\n💥 ${gagal} UJI HOOK HASHTAG GAGAL`); process.exit(1); }
