// 🖼️🧪 UJI FRAME & TEKS (v19.44) — frame layouts + font + teks custom
// Jalankan: node tests/frame-text.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function tr(rel) {
  return ts.transpileModule(readFileSync(new URL(rel, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const { FRAME_STYLES, gambarFrame } = await import(enc(tr("../src/lib/frames.ts")));
const { FONT_OPTS, TEXT_DEFAULT, TEKS_WARNA, gambarTeksCustom } = await import(enc(tr("../src/lib/textstyles.ts")));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🖼️ Menguji frame & teks");

T("FRAME_STYLES ≥ 8 pilihan", FRAME_STYLES.length >= 8, `${FRAME_STYLES.length} gaya`);
T("semua frame punya warna & tebal", FRAME_STYLES.every((f) => f.warna && f.tebal > 0));
T("FONT_OPTS ≥ 8 pilihan font", FONT_OPTS.length >= 8, `${FONT_OPTS.length} font`);
T("semua font punya css & weight", FONT_OPTS.every((f) => f.css && f.weight > 0));
T("TEKS_WARNA ≥ 8", TEKS_WARNA.length >= 8);
T("TEXT_DEFAULT lengkap", TEXT_DEFAULT.fontId && TEXT_DEFAULT.color && TEXT_DEFAULT.stroke !== undefined);

// gambar frame di node-canvas — tidak crash & ada piksel
const { createCanvas } = await import("canvas");
const cv = createCanvas(300, 200); const ctx = cv.getContext("2d");
ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 300, 200);
for (const f of FRAME_STYLES) {
  gambarFrame(ctx, 300, 200, f, 1, 0.5);
}
const d = ctx.getImageData(0, 0, 300, 200).data;
let nonBlack = 0, n = 0;
for (let i = 0; i < d.length; i += 8) { if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 15) nonBlack++; n++; }
T("gambarFrame semua gaya jalan & ada piksel", (nonBlack / n) > 0.05, `${((nonBlack / n) * 100).toFixed(1)}% terisi`);

// gambar teks custom — tidak crash
gambarTeksCustom(ctx, "TEST TEKS", 150, 100, 40, TEXT_DEFAULT);
const st3d = { ...TEXT_DEFAULT, tigaD: true, grad: true, stroke: "#fff" };
gambarTeksCustom(ctx, "3D GRAD", 150, 50, 30, st3d);
T("gambarTeksCustom jalan (default + 3d+grad)", true);

// integrasi spectrum
const src = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");
T("spectrum: import gambarFrame/FRAME_STYLES", /gambarFrame/.test(src) && /FRAME_STYLES/.test(src));
T("spectrum: import gambarTeksCustom/FONT_OPTS", /gambarTeksCustom/.test(src) && /FONT_OPTS/.test(src));
T("spectrum: state floatSpec (spektrum mini drag/cubit)", /floatSpec/.test(src) && /floatPos/.test(src));
T("spectrum: state frameOn/frameStyle", /frameOn/.test(src) && /frameStyle/.test(src));
T("spectrum: state textCustom/textStyle", /textCustom/.test(src) && /textStyle/.test(src));
T("spectrum: UI section 'Spektrum Mini' / 'Frame' / 'Teks'", /Spektrum Mini/.test(src) && /Frame Layout/.test(src) && /Teks \(tulis, font, warna, 3D\)/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI FRAME-TEKS GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI FRAME & TEKS HIJAU!");
