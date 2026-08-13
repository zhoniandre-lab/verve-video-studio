// 🌈🧪 v19.75 — menu Spektrum buka panel pilih gaya; preview hidup utk semua tipe
// Jalankan: node tests/spektrum-menu.test.mjs
import { readFileSync } from "fs";

const src = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

T("onMainTool spektrum buka setTool (bukan addSticker diam-diam)", /if \(t === "spektrum"\)/.test(src) && /setTool\(cur => cur === "spektrum" \? null : "spektrum"\)/.test(src));
T("onMainTool spektrum TIDAK lagi addSticker(\"@bars\") langsung", !/if \(t === "spektrum"\)[\s\S]{0,280}addSticker\("@bars"\)/.test(src));
T("EditorSheets punya panel tool === \"spektrum\"", /if \(tool === "spektrum"\)/.test(src));
T("panel Spektrum nawarin 3 gaya", /"@bars"/.test(src) && /"@wavepro"/.test(src) && /"@ring"/.test(src) && /Bars klasik/.test(src));
T("ANIM_STICKER_PREVIEW punya @bars @wavepro @ring", /"@bars": "📊"/.test(src) && /"@wavepro": "🌊"/.test(src) && /"@ring": "💍"/.test(src));
T("wantBars hidupkan wavepro/ring/wave/eq", /"@wavepro": 1/.test(src) && /"@ring": 1/.test(src) && /"@wave": 1/.test(src) && /"@eq": 1/.test(src));
T("wantBars clip-attached (start==null) juga hidup", /sl\[L\.idx\]\?\.id === x\.id/.test(src));
T("wantBars dur pakai z.dur > 0 ? z.dur : 3", /z\.dur && z\.dur > 0 \? z\.dur : 3/.test(src));

if (gagal) { console.error(`\n💥 ${gagal} UJI MENU SPEKTRUM GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI MENU SPEKTRUM HIJAU");
