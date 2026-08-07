// 🔔🧪 UJI TOMBOL SUBSCRIBE (v19.40) — gaya, animasi deterministik, integrasi
// Jalankan: node tests/subscribe.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function tr(rel) {
  return ts.transpileModule(readFileSync(new URL(rel, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const { SUB_STYLES, SUB_ANIMS, hitungSubState } = await import(enc(tr("../src/lib/subscribe.ts")));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔔 Menguji tombol subscribe animasi");

/* 1. Banyak pilihan gaya */
T("SUB_STYLES ≥ 8 pilihan", SUB_STYLES.length >= 8, `${SUB_STYLES.length} gaya`);
T("semua gaya punya id/label/glow/bg", SUB_STYLES.every((s) => s.id && s.label && s.glow && (typeof s.bg === "string" || Array.isArray(s.bg))));
T("ada gaya YouTube Klasik", SUB_STYLES.some((s) => s.id === "yt"));

/* 2. Pilihan animasi */
T("SUB_ANIMS ≥ 4", SUB_ANIMS.length >= 4, `${SUB_ANIMS.length} animasi`);
T("ada denyut/glow/goncang/statis", ["denyut", "glow", "goncang", "statis"].every((a) => SUB_ANIMS.some((x) => x.id === a)));

/* 3. Animasi deterministik & benar */
const a1 = hitungSubState(0.9, 1, 0.8, "denyut", 1.5);
const a2 = hitungSubState(0.9, 1, 0.8, "denyut", 1.5);
T("denyut: bass tinggi → scale > 1", a1.scale > 1.05, `scale=${a1.scale.toFixed(3)}`);
T("denyut: deterministik", Math.abs(a1.scale - a2.scale) < 1e-9);
T("glow: flux tinggi → glow > 0", hitungSubState(0.3, 0, 0.9, "glow", 1).glow > 0.5);
T("glow: tanpa flux → glow rendah", hitungSubState(0.1, 0, 0, "glow", 1).glow < 0.25);
T("goncang: beat → shake > 0", hitungSubState(0.3, 1, 0, "goncang", 1).shake > 0.5);
T("statis: semua netral", (() => { const s = hitungSubState(0.9, 1, 0.9, "statis", 1); return s.scale === 1 && s.glow === 0 && s.shake === 0; })());

/* 4. Integrasi di spectrum-studio */
const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
T("spectrum: import gambarSubscribe/hitungSubState", /gambarSubscribe/.test(src) && /hitungSubState/.test(src));
T("spectrum: ada state subOn/subStyle/subSize/subPos/subAnim", /subOn/.test(src) && /subStyle/.test(src) && /subSize/.test(src) && /subPos/.test(src) && /subAnim/.test(src));
T("spectrum: drag target termasuk subscribe", /"logo" \| "judul" \| "subscribe"/.test(src));
T("spectrum: ada pinch (2 jari) untuk ukuran", /pinchSub/.test(src));
T("spectrum: layerVis ada subscribe", /subscribe: true/.test(src));
T("spectrum: preset simpan subOn..subAnim", /subOn, subStyle, subSize, subPos, subAnim/.test(src));
T("spectrum: UI section TOMBOL SUBSCRIBE", /TOMBOL SUBSCRIBE/.test(src));
/* ⏱ v19.41: durasi tombol subscribe */
T("spectrum: ada state subStart & subEnd", /subStart/.test(src) && /subEnd/.test(src));
T("spectrum: render pakai jendela durasi (mulai/hilang + fade)", /mulai \+ 0\.4/.test(src) && /hilang - 0\.4/.test(src) && /dalamJendela/.test(src));
T("spectrum: UI slider 'Muncul di' & 'Hilang di'", /Muncul di/.test(src) && /Hilang di/.test(src));
T("spectrum: preset simpan subStart & subEnd", /subStart, subEnd/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI SUBSCRIBE GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI SUBSCRIBE HIJAU — tombol subscribe animasi siap!");
