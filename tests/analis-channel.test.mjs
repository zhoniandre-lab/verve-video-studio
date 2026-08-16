// 📊🧪 v20.26 — ANALIS CHANNEL: bug angka Indonesia + 3 Aksi Terpenting
// Jalankan: node tests/analis-channel.test.mjs
import { readFileSync } from "fs";
const gd = readFileSync(new URL("../src/app/growth-doctor.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📊 Menguji Analis Channel (v20.26)");

/* ---- BUG ANGKA INDONESIA ---- */
// ekstrak fungsi num() dari source
const i0 = gd.indexOf("function num(v: string)");
const i1 = gd.indexOf("\n}", i0) + 2;
let js = gd.slice(i0, i1).replace(/export /g, "").replace(/: string/g, "").replace(/: number \| undefined/g, "").replace(/: number/g, "");
const F = new Function(`${js}; return num;`)();
T("FIX: '1.600' (Indonesia) = 1600, bukan 1.6", F("1.600") === 1600, `got ${F("1.600")}`);
T("FIX: '169.000' = 169000", F("169.000") === 169000, `got ${F("169.000")}`);
T("FIX: '1.600.000' = 1.600.000", F("1.600.000") === 1600000, `got ${F("1.600.000")}`);
T("FIX: '4,8' (koma desimal) = 4.8", F("4,8") === 4.8, `got ${F("4,8")}`);
T("FIX: '1.6' (titik desimal intl) = 1.6", F("1.6") === 1.6, `got ${F("1.6")}`);
T("FIX: '1.600,5' = 1600.5", F("1.600,5") === 1600.5, `got ${F("1.600,5")}`);
T("FIX: kosong = undefined", F("") === undefined);
T("FIX: bukan angka = undefined", F("abc") === undefined);

/* ---- 3 AKSI TERPENTING ---- */
T("3 AKSI: blok '3 AKSI TERPENTING' ada", /3 AKSI TERPENTING/.test(gd));
T("3 AKSI: tampil LANGSUNG (di luar details)", /dx\.actions\.slice\(0, 3\)/.test(gd));
T("3 AKSI: nomor urut 1-2-3 (lingkaran)", /fontWeight: 900, fontSize: 13/.test(gd));
T("3 AKSI: tombol salin rencana lengkap", /Salin Rencana Aksi Lengkap/.test(gd));
T("KONFIRMASI: pakai num() biar tampil benar", /\(num\(views\) \?\? 0\)\.toLocaleString/.test(gd) && /\(num\(watchH\) \?\? 0\)\.toLocaleString/.test(gd) && /\(num\(subs\) \?\? 0\)\.toLocaleString/.test(gd));



/* ---- v20.27: VIDEO BAGUS vs PERLU DIPERBAIKI (SIMPLE) ---- */
T("SIMPLE: judul VIDEO KAMU MANA YANG BAGUS", /VIDEO KAMU: MANA YANG BAGUS/.test(gd));
T("SIMPLE: kelompok BAGUS & PERLU DIPERBAIKI", /BAGUS/.test(gd) && /PERLU DIPERBAIKI/.test(gd));
T("SIMPLE: solusi part 2 & ganti thumbnail/hook", /part 2/.test(gd) && /ganti thumbnail/.test(gd) && /hook 3 detik/.test(gd));
T("SIMPLE: batas bagus 30% max views", /maxViews \* 0\.3/.test(gd));
T("SIMPLE: tombol Ide part 2", /Ide part 2/.test(gd));



/* ---- v20.28: KEJAR VIRAL (judul terbaik dari pola yang berkembang) ---- */
T("VIRAL: import suggestTitlesFromBrain", /suggestTitlesFromBrain/.test(gd));
T("VIRAL: fungsi kejarViral ada", /function kejarViral/.test(gd));
T("VIRAL: ambil video TERBAIK sorted[0]", /terbaik = sorted/.test(gd));
T("VIRAL: buang kata umum utk keyword", /stop = new Set/.test(gd) && /part/.test(gd));
T("VIRAL: pakai suggestTitlesFromBrain + fallback Part 2", /suggestTitlesFromBrain/.test(gd) && /Part 2/.test(gd));
T("VIRAL: UI tombol Buat Judul Kejar Viral", /Buat Judul Kejar Viral/.test(gd));
T("VIRAL: UI daftar judul + alasan + salin", /j.alasan/.test(gd) && /copy\(j\.title\)/.test(gd));
T("VIRAL: pesan dari video terbaik", /Dari pola video/.test(gd));

if (gagal) { console.error(`\n💥 ${gagal} UJI ANALIS CHANNEL GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI ANALIS CHANNEL HIJAU");
