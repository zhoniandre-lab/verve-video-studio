// 📱🧪 UJI DEVICE SCOPE (v19.23) — reset per perangkat (anti diintip).
// Jalankan: node tests/device-scope.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const src = readFileSync(new URL("../src/lib/device-scope.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const D = await import(enc(js));

// mock localStorage + navigator
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let fp = "UA-1|id|Linux|420";
globalThis.navigator = { userAgent: fp.split("|")[0], language: "id", platform: "Linux" };
globalThis.navigator.userAgent = fp.split("|")[0];

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

// 1) perangkat baru → reset & tandai
store.set("verve_lahan_niche_v1", "horror");
D.resetJikaPerangkatBeda();
T("perangkat pertama: reset data pribadi", !store.has("verve_lahan_niche_v1"), "niche dihapus");
T("perangkat pertama: ditandai", D.deviceSama() === true);

// 2) perangkat sama → data dipertahankan
store.set("verve_lahan_niche_v1", "dj");
D.resetJikaPerangkatBeda();
T("perangkat sama: data dipertahankan", store.get("verve_lahan_niche_v1") === "dj");

// 3) perangkat BEDA → reset lagi
globalThis.navigator.userAgent = "UA-999|en|Win32|300";
D.resetJikaPerangkatBeda();
T("perangkat beda: niche direset ke default", !store.has("verve_lahan_niche_v1"));
T("perangkat beda: ditandai baru", D.deviceSama() === true);

if (gagal) { console.error(`\n💥 ${gagal} UJI DEVICE SCOPE GAGAL`); process.exit(1); }
