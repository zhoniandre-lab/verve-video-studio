// 🔑 Uji regresi input API key musik.
// Pastikan key disimpan pada provider yang DIPILIH, tetap terlihat, dan tidak
// rusak oleh SSR/hydration atau keyboard HP.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/suno-keys.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const keys = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => {
  console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`);
  if (!ok) gagal++;
};

const storage = {
  data: new Map(),
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
  setItem(k, v) { this.data.set(k, String(v)); },
  removeItem(k) { this.data.delete(k); },
};

/* ---- helper storage ---- */
let r = keys.addSunoKeys([], "\uFEFFsk-generic-123", "sunor");
T("key generik masuk ke provider yang sedang dipilih", r.next.length === 1 && r.next[0].provider === "sunor");
T("BOM clipboard dibersihkan", r.next[0].key === "sk-generic-123");
r = keys.addSunoKeys(r.next, "sk-generic-123", "sunor");
T("key sama di provider sama tidak diduplikasi", r.next.length === 1 && r.duplicateCount === 1);
r = keys.addSunoKeys(r.next, "sk-generic-123", "kie");
T("key yang sama boleh dipakai pada provider berbeda", r.next.length === 2 && r.next[1].provider === "kie");
T("cookie session tetap satu baris utuh", keys.addSunoKeys([], "a=1; b=dua kata", "suno-resmi").next[0].key === "a=1; b=dua kata");

storage.setItem(keys.SUNO_KEYS_KEY, JSON.stringify(r.next));
T("pool valid terbaca", keys.readSunoKeyPool(storage).length === 2);
storage.setItem(keys.SUNO_KEYS_KEY, "{rusak");
T("pool korup tidak membuat UI crash", keys.readSunoKeyPool(storage).length === 0);
storage.setItem(keys.SUNO_KEYS_KEY, JSON.stringify([
  { key: "backup", provider: "kie" },
  { key: "aktif", provider: "sunor" },
]));
T("key aktif didahulukan pada provider yang cocok", keys.keysForSunoProvider(keys.readSunoKeyPool(storage), "sunor", "aktif", "sunor")[0].key === "aktif");
T("key provider lain tidak ikut", keys.keysForSunoProvider(keys.readSunoKeyPool(storage), "kie", "aktif", "sunor").length === 1);

/* ---- sumber UI ---- */
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
T("SunoPanel memakai provider aktif, bukan tebakan prefix", /addSunoKeys\(keyPool, keyDraft, sunoProv\)/.test(panel));
T("Lahan memakai provider aktif, bukan tebakan prefix", /addSunoKeys\(keyPool, keyDraft, sunoProv\)/.test(lahan));
T("SunoPanel panel tetap terbuka setelah tambah", /setKeyPanel\(true\)/.test(panel));
T("Lahan panel tetap terbuka setelah tambah", /setKeyPanel\(true\)/.test(lahan));
T("SunoPanel mematikan koreksi keyboard", /autoCapitalize="none"/.test(panel) && /autoCorrect="off"/.test(panel) && /spellCheck=\{false\}/.test(panel));
T("Lahan mematikan koreksi keyboard", /autoCapitalize="none"/.test(lahan) && /autoCorrect="off"/.test(lahan) && /spellCheck=\{false\}/.test(lahan));
T("SunoStudio input key controlled dan anti-koreksi", /value=\{key\}/.test(studio) && /autoCapitalize="none"/.test(studio) && /autoCorrect="off"/.test(studio));
T("SunoStudio tidak baca localStorage saat SSR render", !/useState\(\(\) => \{ try \{ localStorage/.test(studio));
T("Pengaturan Saya anti-koreksi keyboard", /name="suno-api-key-settings"/.test(page) && /autoCorrect="off"/.test(page));
T("Editor memprioritaskan key terbaru dari storage", /Prioritaskan nilai storage terbaru/.test(page) && /const kk = localStorage\.getItem\("verve_suno_key"\) \|\| sunoKey/.test(page));

if (gagal) {
  console.error(`\n💥 ${gagal} uji API key gagal`);
  process.exit(1);
}
console.log("\n🎉 SEMUA UJI API KEY HIJAU — key masuk, tampil, dan provider tidak tertukar");
