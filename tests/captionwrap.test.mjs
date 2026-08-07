// 🧾🧪 UJI PEMBUNGKUS LIRIK (v19.41) — lirik kepanjangan jadi 2 baris, tidak keluar video
// Jalankan: node tests/captionwrap.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const srcTs = readFileSync(new URL("../src/lib/captionwrap.ts", import.meta.url), "utf8");
const js = ts.transpileModule(srcTs, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { wrapIndices, lebarGroup, skalaAgarMuat } = await import(enc(js));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧾 Menguji pembungkus baris lirik");

// 1. Baris pendek → 1 baris
const pendek = wrapIndices([50, 60, 40], 10, 400, 2);
T("baris pendek → 1 baris", pendek.length === 1 && pendek[0].length === 3, JSON.stringify(pendek));

// 2. Baris panjang → 2 baris, baris PERTAMA muat ≤ maxW
const panjang = wrapIndices([120, 130, 110, 140, 125, 115], 8, 300, 2);
T("baris panjang → 2 baris", panjang.length === 2, `${panjang.length} baris`);
T("baris 1 muat ≤ maxW", lebarGroup([120, 130, 110, 140, 125, 115], panjang[0], 8) <= 300, `lebar=${lebarGroup([120, 130, 110, 140, 125, 115], panjang[0], 8).toFixed(0)}`);

// 3. Semua kata tetap ada (tidak ada yang hilang)
const semua = panjang.flat();
T("semua kata tetap ada", semua.length === 6 && new Set(semua).size === 6, JSON.stringify(semua));

// 4. 3 baris → tetap maks 2 baris (sisa di baris ke-2)
const tigabar = wrapIndices([200, 200, 200, 200, 200, 200], 5, 250, 2);
T("maks 2 baris walau panjang sekali", tigabar.length === 2, `${tigabar.length} baris`);

// 5. skalaAgarMuat: kalau masih lewat → perkecil font; setelah diskalakan semua muat
const g2 = wrapIndices([200, 200, 200, 200, 200, 200], 5, 250, 2);
const sk = skalaAgarMuat([200, 200, 200, 200, 200, 200], g2, 5, 250);
T("skala font mengecil kalau masih lewat", sk < 1, `skala=${sk.toFixed(3)}`);
T("setelah skala: SEMUA baris muat ≤ maxW", g2.every((g) => lebarGroup([200, 200, 200, 200, 200, 200], g, 5) * sk <= 250 + 1));
const skOk = skalaAgarMuat([50, 60], [[0, 1]], 10, 400);
T("skala = 1 kalau muat", skOk === 1);

// 6. Integrasi di editing.ts (paintPreviewCaptions pakai wrapIndices)
const edit = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");
T("editing.ts import wrapIndices", /wrapIndices/.test(edit));
T("editing.ts ada pembagian 2 baris + skala font", /maksBaris/.test(edit) || /skalaAgarMuat/.test(edit));

if (gagal) { console.error(`\n💥 ${gagal} UJI PEMBUNGKUS GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI PEMBUNGKUS HIJAU — lirik panjang aman, 2 baris, tidak keluar video!");
