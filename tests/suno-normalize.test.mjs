// 🎵🧪 UJI NORMALISASI RESPONS LAGU (v19.35.6) — polling harus bisa mengekstrak hasil dari berbagai format
// Jalankan: node tests/suno-normalize.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/suno-normalize.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const {
  normalizeLagu,
  cariAudioRekursif,
  kumpulAudioRekursif,
  mapModelKie,
  mapModelMusicApi,
  mapModelAimusicApi,
  mapModelEvolink,
  mapModelComet,
  mapModelTtapi,
} = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎵 Menguji normalisasi respons provider lagu");

/* 1. Kie: generate → taskId pending */
const k1 = normalizeLagu({ code: 200, data: { taskId: "task-abc-1" } }, "kie");
T("Kie generate → pending + id", k1.status === "pending" && k1.id === "task-abc-1", JSON.stringify(k1));

/* 2. Kie: poll SUCCESS → sunoData[0].audioUrl (format resmi) */
const k2 = normalizeLagu({ code: 200, data: { taskId: "task-abc-1", status: "SUCCESS", response: { sunoData: [{ id: "s1", audioUrl: "https://cdn.kie.ai/a1.mp3", title: "Lagu Ibu" }] } } }, "kie");
T("Kie poll SUCCESS → audio_url ketemu", k2.status === "completed" && k2.audio_url === "https://cdn.kie.ai/a1.mp3", k2.audio_url);

/* 3. Kie: poll status COMPLETED + data.response.data (format alternatif) */
const k3 = normalizeLagu({ code: 200, data: { id: "task-9", status: "COMPLETED", response: { data: [{ audioUrl: "https://x.kie.ai/9.mp3" }] } } }, "kie");
T("Kie status COMPLETED + response.data → audio ketemu", k3.status === "completed" && k3.audio_url === "https://x.kie.ai/9.mp3");

/* 4. Kie: error */
const k4 = normalizeLagu({ code: 200, data: { status: "FAIL", errorMessage: "out of credit" } }, "kie");
T("Kie FAIL → error", k4.status === "error" && /credit/i.test(k4.error || ""));

/* 5. Sunor: generate → data.task_id pending */
const s1 = normalizeLagu({ data: { task_id: "tsk-77" } }, "sunor");
T("Sunor generate → pending + task_id", s1.status === "pending" && s1.id === "tsk-77", JSON.stringify(s1));

/* 6. Sunor: poll success → output.sunoData[0].audio_url (format wrapper standar) */
const s2 = normalizeLagu({ data: { task_id: "tsk-77", status: "success", output: { sunoData: [{ audio_url: "https://cdn.sunor.cc/m1.mp3", title: "Melodi" }] } } }, "sunor");
T("Sunor success + output.sunoData → audio ketemu", s2.status === "completed" && s2.audio_url === "https://cdn.sunor.cc/m1.mp3", s2.audio_url);

/* 7. Sunor: success + output array [{audio_url}] */
const s3 = normalizeLagu({ data: { task_id: "tsk-78", status: "success", output: [{ audio_url: "https://cdn.sunor.cc/m2.mp3" }] } }, "sunor");
T("Sunor success + output array → audio ketemu", s3.status === "completed" && s3.audio_url === "https://cdn.sunor.cc/m2.mp3");

/* 8. Sunor: success + output.data array (format lain) */
const s4 = normalizeLagu({ data: { task_id: "tsk-79", status: "success", output: { data: [{ audio_url: "https://cdn.sunor.cc/m3.mp3" }] } } }, "sunor");
T("Sunor success + output.data → audio ketemu", s4.status === "completed" && s4.audio_url === "https://cdn.sunor.cc/m3.mp3");

/* 9. Sunor: running → pending */
const s5 = normalizeLagu({ data: { task_id: "tsk-80", status: "running" } }, "sunor");
T("Sunor running → pending", s5.status === "pending" && s5.id === "tsk-80");

/* 10. Sunor: failure → error */
const s6 = normalizeLagu({ data: { task_id: "tsk-81", status: "failure", error: "quota exceeded" } }, "sunor");
T("Sunor failure → error", s6.status === "error");

/* 11. cariAudioRekursif: URL di kedalaman mana pun */
const deep = { a: { b: { c: [{ d: { streamUrl: "https://deep/audio.wav" } }] } } };
T("cariAudioRekursif tembus kedalaman", cariAudioRekursif(deep) === "https://deep/audio.wav");


/* 12. v19.61: KUMPULKAN SEMUA segmen audio (lagu panjang) — bukan cuma pertama */
const multi = {
  data: {
    task_id: "tsk-90", status: "success",
    output: { sunoData: [
      { audio_url: "https://cdn/seg1.mp3", duration: 240 },
      { audio_url: "https://cdn/seg2.mp3", duration: 240 },
      { audio_url: "https://cdn/seg3.mp3", duration: 240 },
    ] },
  },
};
const m = normalizeLagu(multi, "sunor");
T("Sunor multi-segmen: audio_urls = 3", Array.isArray(m.audio_urls) && m.audio_urls.length === 3, String(m.audio_urls?.length));
T("Sunor multi-segmen: audio_url = segmen pertama", m.audio_url === "https://cdn/seg1.mp3");
T("kumpulAudioRekursif kumpulkan semua URL", kumpulAudioRekursif(multi).filter(u => u.startsWith("https://cdn/")).length === 3);
T("kumpulAudioRekursif tembus nested (2 kemunculan, dedupe di normalize)", kumpulAudioRekursif({ url: "https://a/1.mp3", nested: { url: "https://a/1.mp3" } }).filter(u => u === "https://a/1.mp3").length === 2);

/* 13. Kie multi-segmen juga */
const mk = normalizeLagu({ code: 200, data: { status: "SUCCESS", response: { sunoData: [ { audioUrl: "https://k/1.mp3" }, { audioUrl: "https://k/2.mp3" } ] } } }, "kie");
T("Kie multi-segmen: audio_urls = 2", Array.isArray(mk.audio_urls) && mk.audio_urls.length === 2, String(mk.audio_urls?.length));

/* 14. Model UI underscore harus dipetakan ke nama model provider yang valid. */
T("model V4_5PLUS → Kie V4_5PLUS", mapModelKie("V4_5PLUS") === "V4_5PLUS");
T("model V4_5PLUS → MusicAPI sonic-v4-5-plus", mapModelMusicApi("V4_5PLUS") === "sonic-v4-5-plus");
T("model V4_5PLUS → AIMusicAPI sonic-v4-5-plus", mapModelAimusicApi("V4_5PLUS") === "sonic-v4-5-plus");
T("model V5_5 → MusicAPI sonic-v5-5", mapModelMusicApi("V5_5") === "sonic-v5-5");
T("model V4_5PLUS → EvoLink beta", mapModelEvolink("V4_5PLUS") === "suno-v4.5plus-beta");
T("model V4_5PLUS → Comet bluejay", mapModelComet("V4_5PLUS") === "chirp-bluejay");
T("model V4_5PLUS → TTAPI v4-5+", mapModelTtapi("V4_5PLUS") === "chirp-v4-5+");

const sonicPoll = normalizeLagu({ code: 200, data: [{ clip_id: "m1", state: "succeeded", audio_url: "https://cdn/music.mp3", duration: 180 }] }, "musicapi");
T("MusicAPI state=succeeded → completed", sonicPoll.status === "completed" && sonicPoll.audio_url === "https://cdn/music.mp3");
const sonicFail = normalizeLagu({ code: 200, data: [{ clip_id: "m1", state: "failed", message: "quota" }] }, "musicapi");
T("MusicAPI state=failed → error", sonicFail.status === "error");

/* 15. EvoLink: respons terbaru dapat mengembalikan results sebagai array URL. */
const evoResults = normalizeLagu({
  id: "evo-task-1", status: "completed", progress: 100,
  results: ["https://media.evolink.ai/a.mp3", "https://media.evolink.ai/b.mp3"],
}, "evolink");
T("EvoLink results URL array → completed", evoResults.status === "completed" && evoResults.audio_urls?.length === 2);

if (gagal) { console.error(`\n💥 ${gagal} UJI NORMALISASI GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI NORMALISASI HIJAU — polling bisa mengekstrak hasil dari semua format!");
