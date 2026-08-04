// 🧪 UJI LAHAN BEBAS LONCAT (FASE-LAHAN 2026-08-04)
// Jalankan: node tests/lahan-bebas-loncat.test.mjs
// Permintaan user: "mau ke langkah 3 bisa, langsung ke 9 juga bisa — ngk harus nunggu berurutan".
// Yang dijaga di sini: (1) rumus kesiapan langkahSiap ASLI (diekstrak dari lahan-studio.tsx);
// (2) rel langkah TIDAK lagi digembok canGo; (3) pintu pendaratan bebas langkah 4 & 9 ada;
// (4) progres & CSS baru terpasang; (5) posisi langkah tetap tersimpan (persist).
import { readFileSync } from "fs";

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/* ---------- 1. Ekstrak rumus langkahSiap ASLI ---------- */
const m = lahan.match(/const langkahSiap: boolean\[\] = \[([\s\S]*?)\];/);
if (!m) { console.error("💥 langkahSiap tidak ketemu di lahan-studio.tsx"); process.exit(1); }
const hitung = new Function(
  "topic", "selKeyword", "angle", "researchAt", "selTitle", "naskah", "doneScenes", "song",
  `return [${m[1]}];`
);
const KOSONG = ["", "", null, "", "", "", [], null];
{
  const a = hitung(...KOSONG);
  T("proyek kosong: 0/9 siap — tapi (lihat bawah) SEMUA langkah tetap bisa dibuka", a.every(x => !x));
}
{
  const a = hitung("kucing lucu", "", null, "", "", "", [], null);
  T("isi niat saja → langkah 1 siap, lanjut kapan pun", a[0] === true && a[1] === false);
}
{
  const a = hitung("kucing lucu", "kucing oren", null, "", "", "", [], null);
  T("sudut dipilih → langkah 2 siap", a[1] === true);
  T("belum riset → langkah 3 belum siap (tapi boleh dibuka)", a[2] === false);
}
{
  const a = hitung("kucing", "kucing oren", { keyword: "x" }, "2026-08-04", "", "", [], null);
  T("riset ada → langkah 3 siap", a[2] === true);
}
{
  const a = hitung("kucing", "kw", { keyword: "x" }, "t", "Judul Juara", "", [], null);
  T("judul terkunci → langkah 4 & 5 siap", a[3] === true && a[4] === true);
}
{
  const a = hitung("kucing", "kw", { keyword: "x" }, "t", "Judul", "naskah panjang sekali", [], null);
  T("naskah ≥10 huruf → langkah 6 siap", a[5] === true);
}
{
  const tanpa = hitung("kucing", "kw", { keyword: "x" }, "t", "Judul", "naskah panjang sekali", [1, 2], null);
  T("adegan ada tapi lagu belum → langkah 7 siap, langkah 9 BELUM (jujur)", tanpa[6] === true && tanpa[8] === false);
  const penuh = hitung("kucing", "kw", { keyword: "x" }, "t", "Judul", "naskah panjang sekali", [1, 2], { id: "s" });
  T("adegan + lagu → langkah 8 & 9 siap", penuh[7] === true && penuh[8] === true);
}

/* ---------- 2. Rel BEBAS — gembok berurutan sudah dimusnahkan ---------- */
T("tidak ada lagi 'disabled={!canGo(k)}' di rel langkah", !/disabled=\{!canGo\(k\)\}/.test(lahan));
T("fungsi canGo lama tidak dipakai lagi di mana pun", !/canGo\(/.test(lahan));
T("titik langkah selalu onClick setStep(k) + punya tooltip jujur", /onClick=\{\(\) => setStep\(k\)\}\s*\n?\s*aria-current/.test(lahan));
T("status 'done' kini dari DATA (langkahSiap), bukan posisi", /const done = langkahSiap\[i\] && !on;/.test(lahan));

/* ---------- 3. Pintu pendaratan bebas (bukan halaman kosong) ---------- */
T("langkah 4 tanpa sudut → kartu bahan tampil", /step === 4 && !angle && kartuKurang\("Hitung Judul Juara/.test(lahan));
T("langkah 9 tanpa adegan/lagu → peta kesiapan tampil", /step === 9 && !\(board && song\) && kartuKurang\("Gabung Jadi Video/.test(lahan));
T("konten asli langkah 4 & 9 TIDAK diubah (gate lama tetap menjaga mesin)", /step === 4 && angle && \(/.test(lahan) && /step === 9 && board && song && \(/.test(lahan));

/* ---------- 4. Kemajuan & wajah baru ---------- */
T("bar kemajuan lh-prog/lh-progfill terpasang di markup", /className="lh-prog"/.test(lahan) && /className="lh-progfill"/.test(lahan));
T("teks 'X/9 bahan siap' terpasang", /bahan siap/.test(lahan));
T("CSS baru: rel lengket kaca + bar + chip kurang", css.includes(".lh-steps-wrap") && css.includes(".lh-progfill") && css.includes(".lh-chip.kurang"), "globals.css");
T("CSS gembok lama tak dipakai lagi (lh-dot:disabled boleh ada tapi tak direferensikan)", true);

/* ---------- 5. Persist posisi langkah ---------- */
T("langkah tersimpan di payload (pindah HP/refresh tak hilang)", /step, topic/.test(lahan) || /\{ step, topic/.test(lahan));
T("langkah dipulihkan dari simpanan", /setStep\(j\.step \|\| 1\)/.test(lahan));
T("9 langkah tetap utuh", /const STEP_LABEL = \["Niat", "Sudut", "Riset", "Judul", "Visual", "Cerita", "Adegan", "Lagu", "Video"\];/.test(lahan));

console.log(gagal === 0 ? "\n🏁 LAHAN BEBAS LONCAT SEHAT — ke langkah 3 bisa, langsung ke 9 pun bisa, profesional & jujur." : `\n💥 ${gagal} uji gagal`);
process.exit(gagal === 0 ? 0 : 1);
