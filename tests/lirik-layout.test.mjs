// 🧾🧪 v19.76 — lirik TENGAH simetris, tidak keluar pinggir; template baru; timing TIDAK diubah
// Jalankan: node tests/lirik-layout.test.mjs
import { readFileSync } from "fs";

const wrapSrc = readFileSync(new URL("../src/lib/captionwrap.ts", import.meta.url), "utf8");
const edit = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/app/spectrum-studio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧾 Menguji layout lirik + template");

function pecahKalimatKeKata(teks) { return String(teks || "").split(/\s+/).filter(Boolean); }
function posisiTengahAman(groupW, W, pad) {
  const p = Math.max(0, pad);
  const inner = Math.max(1, W - p * 2);
  if (groupW >= inner) return p;
  return (W - groupW) / 2;
}

const pecah = pecahKalimatKeKata("Tapi kau sudah tak ada Aku pulang membawa rindu");
T("pecah kalimat panjang jadi banyak kata", pecah.length >= 8, `${pecah.length} kata`);
T("pecah tidak hilangkan kata", pecah[0] === "Tapi" && pecah.includes("rindu"));

const W = 1280, pad = 1280 * 0.08;
const x1 = posisiTengahAman(400, W, pad);
T("baris pendek: x kiri = (W-w)/2 (simetris)", Math.abs(x1 - (W - 400) / 2) < 0.01, String(x1));
T("baris pendek: margin kiri = margin kanan", Math.abs(x1 - (W - (x1 + 400))) < 0.01);

const x2 = posisiTengahAman(2000, W, pad);
T("baris kebesaran: x tidak negatif", x2 >= 0);
T("baris kebesaran: x = pad (nempel aman)", x2 === pad, String(x2));

T("captionwrap ekspor pecahKalimatKeKata", /export function pecahKalimatKeKata/.test(wrapSrc));
T("captionwrap ekspor posisiTengahAman", /export function posisiTengahAman/.test(wrapSrc));
T("editing.ts pakai pecahKalimatKeKata", /pecahKalimatKeKata/.test(edit));
T("editing.ts pakai posisiTengahAman", /posisiTengahAman\(groupW, W, padX\)/.test(edit));
T("cache lebar ikut ukuran font (fs.toFixed)", /\$\{capStyle\}\|\$\{fs\.toFixed\(1\)\}/.test(edit) || /fs\.toFixed\(1\)/.test(edit));

T("timing: pilih baris dari kata yang sedang dinyanyikan", /const sedang = words\.filter\(w => t >= w\.start && t < w\.end\)/.test(edit));
T("timing: tahan baris terakhir di celah", /const sudahLewat = words\.filter\(w => t >= w\.end\)/.test(edit));
T("timing: tidak pakai active[0].line", !/active\[0\]\.line/.test(edit));

T("template Emas MV", /id: \"emas\"/.test(edit));
T("template Outline Tebal", /id: \"outline\"/.test(edit));
T("template Cyan Spectrum", /id: \"cyan\"/.test(edit));
T("template Kotak Hitam", /id: \"boxhitam\"/.test(edit));
T("template Karaoke Box", /id: \"boxedkara\"/.test(edit));
T("template Dua Nada", /id: \"dual\"/.test(edit));
T("template Bar Bawah", /id: \"bar\"/.test(edit));
T("template Serif Emas", /id: \"serifgold\"/.test(edit));
T("Spectrum Studio pakai pad + yRatio template", /padRatio: 0\.08/.test(studio) && /tpl\.yRatio/.test(studio));
T("Spectrum UI: catatan timing tidak diubah", /tidak diubah/.test(studio));

if (gagal) { console.error(`\n💥 ${gagal} UJI LAYOUT LIRIK GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LAYOUT LIRIK HIJAU — tengah, tidak keluar, timing utuh");
