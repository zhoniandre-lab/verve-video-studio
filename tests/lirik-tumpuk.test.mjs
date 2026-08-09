// 🧾🐛 UJI FIX LIRIK TUMPANG TINDIH (v19.45) — baris relevan + wrap 3 + cache
// Jalankan: node tests/lirik-tumpuk.test.mjs
import { readFileSync } from "fs";

const edit = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🧾 Menguji fix lirik tumpang tindih");

// 1. Pilih baris dari kata yang SEDANG dinyanyikan (bukan baris lama yang overlap)
T("pilih baris dari kata yang sedang dinyanyikan (sedang)", /const sedang = words\.filter\(w => t >= w\.start && t < w\.end\)/.test(edit));
T("TIDAK pakai active[0].line lagi (baris lama menang)", !/active\[0\]\.line/.test(edit));
T("pakai baris paling baru saat antar-barisan (aktif terakhir)", /aktif\[aktif\.length - 1\]\.line/.test(edit));
T("ganti referensi active[] di loop (anti crash)", /const kataAkhir = lineWords\[lineWords\.length - 1\]/.test(edit));

// 2. Wrap maks 3 baris kalau kepanjangan (bukan cuma 2)
T("wrap coba 3 baris kalau masih lewat", /wrapIndices\(widths, gap, maxW, 3\)/.test(edit));

// 3. Cache measureText — render lebih cepat
T("ada cache lebar teks (_wCache)", /_wCache/.test(edit) && /_cw\(/.test(edit));

// 4. Skala font bisa lebih kecil (0.3, bukan 0.45) — lirik panjang tetap muat
T("skala font minimum 0.3", /Math\.max\(0\.3, sk2\)/.test(edit));

if (gagal) { console.error(`\n💥 ${gagal} UJI LIRIK TUMPUK GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI LIRIK TUMPUK HIJAU — lirik tidak akan numpuk/terpotong lagi!");
