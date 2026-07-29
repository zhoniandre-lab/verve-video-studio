// 🛡️ UJI GUARD STABIL — net retry/timeout, batch limiter, timeline health, scene planner.
// Wajib lulus sebelum fitur guard dipakai luas.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  return import(url);
}

const net = await loadTs("../src/lib/guard/net.ts");
const tl = await loadTs("../src/lib/guard/timeline.ts");
const sc = await loadTs("../src/lib/guard/scene.ts");
const job = await loadTs("../src/lib/guard/job.ts");
const prod = await loadTs("../src/lib/guard/production.ts");
const mc = await loadTs("../src/lib/guard/material-cache.ts");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🛡️ Menguji guard folder src/lib/guard");

// 1) status retryable
T("429 retryable", net.isRetryableStatus(429) === true);
T("500 retryable", net.isRetryableStatus(500) === true);
T("400 tidak retry", net.isRetryableStatus(400) === false);

// 2) batchLimit: order balik sesuai input, concurrency tidak bocor
{
  let active = 0, maxActive = 0;
  const out = await net.batchLimit([1, 2, 3, 4, 5], 2, async (x) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5 * (6 - x)));
    active--;
    return x * 10;
  });
  T("batchLimit menjaga urutan hasil", JSON.stringify(out) === JSON.stringify([10, 20, 30, 40, 50]), out.join(","));
  T("batchLimit membatasi paralel ≤2", maxActive <= 2, `max=${maxActive}`);
}

// 3) fetchJsonResult retry: 500 lalu sukses
{
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ error: "goyang" }), { status: 500, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, value: 7 }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const r = await net.fetchJsonResult("/uji", { retries: 1, retryDelayMs: 1, timeoutMs: 100, label: "Uji" });
  globalThis.fetch = oldFetch;
  T("fetchJsonResult retry lalu sukses", r.ok && r.data?.value === 7 && calls === 2, `calls=${calls}`);
}

// 4) non-retryable 400 berhenti di percobaan pertama
{
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: "bad" }), { status: 400, headers: { "Content-Type": "application/json" } }); };
  const r = await net.fetchJsonResult("/bad", { retries: 3, retryDelayMs: 1, timeoutMs: 100, label: "Bad" });
  globalThis.fetch = oldFetch;
  T("HTTP 400 tidak diulang", !r.ok && calls === 1 && r.attempts === 1, `calls=${calls}, attempts=${r.attempts}`);
}

// 5) timeout jujur
{
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (_url, init = {}) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); }, { once: true });
  });
  const r = await net.fetchJsonResult("/lambat", { retries: 0, timeoutMs: 5, label: "Lambat" });
  globalThis.fetch = oldFetch;
  T("timeout menghasilkan ok:false + aborted", !r.ok && r.aborted === true && /timeout/i.test(r.error), r.error);
}

// 5) timeline health
{
  const ok = tl.ringkasTimelineHealth({ slides: [{ id: "s1", imageUrl: "x", dur: 3 }], total: 3, slideDuration: 3 });
  T("timeline sehat = ok", ok.level === "ok", ok.short);
  const warn = tl.ringkasTimelineHealth({
    slides: [{ id: "s1", imageUrl: "x", dur: 3 }], total: 3, slideDuration: 3,
    slideOptsById: { s1: { texts: [{ id: "t1", txt: "halo", start: 2.8, dur: 2 }] } },
  });
  T("teks lewat ujung = warn", warn.level === "warn" && warn.issues.some(i => i.code === "TEXT_OUTSIDE"), warn.short);
  const err = tl.ringkasTimelineHealth({ slides: [{ id: "s1", dur: 3 }], total: 3, slideDuration: 3 });
  T("klip tanpa media = error", err.level === "error" && err.issues.some(i => i.code === "SLIDE_NO_MEDIA"), err.short);
}

// 6) scene planner
{
  T("scene action dikenali", sc.classifySceneKind("anak berlari panik dikejar hujan") === "action");
  T("scene emosi dikenali", sc.scenePlan("ibu menangis rindu anak").kind === "emotion");
  T("plan punya durasi waras", sc.scenePlan("wide shot desa saat senja").duration > 3);
}

// 7) job guard ala MoneyPrinter: tahap/progress/recovery log
{
  let j = job.createJob("video", "Rakit video");
  j = job.setJobStage(j, "script", "running");
  j = job.setJobStage(j, "script", "done", "script siap");
  T("job progress naik saat stage done", j.progress >= 10 && j.logs.length >= 3, job.summarizeJob(j));
  j = job.failJob(j, "materials", "gudang sibuk");
  T("job gagal punya state error", j.state === "error" && j.stages.some(s => s.id === "materials" && s.state === "error"));
}

// 8) material cache: query sama tidak perlu bakar request ulang
{
  const mem = new Map();
  const oldLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => mem.has(k) ? mem.get(k) : null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const key = mc.materialCacheKey(" Mother   Crying ", 2, 8);
  T("materialCacheKey normalisasi query", key === "mother crying|p=2|n=8", key);
  mc.writeMaterialCache("mother crying", 2, 8, { ok: true, hasil: [1] }, 1000, 5000);
  T("material cache hit segar", mc.readMaterialCache("mother crying", 2, 8, 3000)?.hasil?.[0] === 1);
  T("material cache expired hilang", mc.readMaterialCache("mother crying", 2, 8, 7001) === null);
  if (oldLS) globalThis.localStorage = oldLS; else delete globalThis.localStorage;
}

// 9) production helpers: 3 varian + upload kit
{
  const vs = prod.moneyPrinterVariants();
  T("3 varian produksi tersedia", vs.length === 3 && vs.some(v => v.id === "shorts"));
  const checklist = prod.productionChecklist({ hasScript: true, hasRender: false });
  T("checklist produksi membedakan done/belum", checklist.some(c => c.done) && checklist.some(c => !c.done));
  const kit = prod.makeUploadKitText({ title: "Doa Ibu", description: "desc", tags: ["ibu", "lagu"], hashtags: "#doaibu", hasVideo: true, checklist });
  T("upload kit memuat judul/tags/checklist", /Doa Ibu/.test(kit) && /ibu, lagu/.test(kit) && /CHECKLIST/.test(kit));
  const snap = { id: "d0", title: "Dasar", ratio: "16:9", transition: "dissolve", transitionDur: 0.6, capStyle: "capcut", slideOptsById: { s1: { dur: 3 } } };
  const vv = prod.applyMoneyPrinterVariant(snap, vs[2], (p) => `${p}_baru`);
  T("apply varian bikin draft baru + speed global", vv.id === "d_baru" && vv.ratio === "9:16" && vv.slideOptsById.s1.speed === vs[2].globalSpeed);
}

if (gagal) { console.error(`\n💥 ${gagal} UJI GUARD GAGAL — JANGAN RILIS`); process.exit(1); }
console.log("\n🏁 GUARD STABIL — fondasi net/timeline/scene aman dipakai bertahap");
