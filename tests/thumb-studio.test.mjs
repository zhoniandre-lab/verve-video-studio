// 🧪 UJI STUDIO THUMBNAIL (L5) — wajib lulus SEBELUM release.
// Jalankan: node tests/thumb-studio.test.mjs
// Fungsi MURNI ASLI dari thumbstudio.ts diekstrak (tipe dilucuti) + cek bedah page.tsx persis pesanan bos.
import { readFileSync } from "fs";

const lib = readFileSync(new URL("../src/lib/thumbstudio.ts", import.meta.url), "utf8");
const pg  = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const ts  = readFileSync(new URL("../src/app/thumb-studio.tsx", import.meta.url), "utf8");
const th  = readFileSync(new URL("../src/lib/thumb.ts", import.meta.url), "utf8");

function ekstrak(src, nama, ganti) {
  const m = src.match(new RegExp(`function ${nama}\\([\\s\\S]*?\\n}\\n`));
  if (!m) { console.error(`💥 ${nama} tidak ketemu`); process.exit(1); }
  let js = m[0];
  for (const [dari, ke] of ganti) js = js.replace(dari, ke);
  return js;
}
// gayaNiche bergantung NICHE_GAYA → sertakan kamusnya (ambil objeknya langsung)
const kamus = lib.match(/export const NICHE_GAYA: Record<string, string> = \{[\s\S]*?\n\};/)[0]
  .replace("export const NICHE_GAYA: Record<string, string> =", "const NICHE_GAYA =");
const gayaNiche = new Function(kamus + "\n" + ekstrak(lib, "gayaNiche", [
  ["function gayaNiche(niche: string): string", "function gayaNiche(niche)"],
]) + "; return gayaNiche;")();

const varianArr = lib.match(/export const VARIAN_THUMB: VarianThumb\[\] = \[[\s\S]*?\n\];/)[0]
  .replace("export const VARIAN_THUMB: VarianThumb[] =", "const VARIAN_THUMB =");
const promptLatarThumb = new Function(varianArr + "\n" + kamus + "\n" + ekstrak(lib, "gayaNiche", [
  ["function gayaNiche(niche: string): string", "function gayaNiche(niche)"],
]) + "\n" + ekstrak(lib, "promptLatarThumb", [
  ["function promptLatarThumb(judul: string, niche: string, varian: number): string", "function promptLatarThumb(judul, niche, varian)"],
]) + "; return promptLatarThumb;")();

const badgeCtr = new Function(ekstrak(lib, "badgeCtr", [
  ["function badgeCtr(niche: string): string", "function badgeCtr(niche)"],
]) + "; return badgeCtr;")();

const bagiBarisTeks = new Function(ekstrak(lib, "bagiBarisTeks", [
  ["function bagiBarisTeks(t: string): string[]", "function bagiBarisTeks(t)"],
]) + "; return bagiBarisTeks;")();

const bangunPromptDariLahan = new Function(ekstrak(lib, "bangunPromptDariLahan", [
  ["function bangunPromptDariLahan(l: any): string", "function bangunPromptDariLahan(l)"],
  ["const bag: string[] = []", "const bag = []"],
]) + "; return bangunPromptDariLahan;")();

const FONT_THUMB = new Function(lib.match(/export const FONT_THUMB: FontThumb\[\] = \[[\s\S]*?\n\];/)[0]
  .replace("export const FONT_THUMB: FontThumb[] =", "const FONT_THUMB =") + "; return FONT_THUMB;")();

let gagal = 0, n = 0;
const T = (nama, ok, info = "") => { n++; console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

console.log("📦 A. gayaNiche ASLI — niche dikenali & diarahkan (kamus diperluas bukti lapangan)");
T("horor → suasana horor", gayaNiche("Horor Rumah Tua").includes("lilin"));
T("uang → grafik koin", gayaNiche("cara cari UANG").includes("koin"));
T("IBU → gaya emosional syahdu (BUKAN umum — bug lapangan terkunci)", gayaNiche("ibu aku rindu").includes("golden hour"));
T("rindu → kursi kosong & hujan", gayaNiche("rindu kampung").includes("kursi kosong"));
T("sedih → melodrama jendela hujan", gayaNiche("kisah sedih").includes("air mata"));
T("keluarga → kehangatan rumah", gayaNiche("keluarga kecilku").includes("keluarga"));
T("niche asing → umum", gayaNiche("xyzqwe") === "subjek utama menonjol tajam, latar blur sinematik, kontras tinggi");
T("kosong → umum, tak meledak", gayaNiche("").includes("kontras"));

console.log("📦 B. promptLatarThumb ASLI — otak CTR (3 konsep mikir, bukan cetakan)");
const p1 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 1);
const p2 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 2);
const p3 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 3);
T("3 varian BEDA konsep beneran: 85mm close-up vs 24mm wide vs still life", p1.includes("85mm") && p2.includes("24mm") && p3.includes("STILL LIFE"));
T("selalu 16:9 widescreen", p1.includes("16:9"));
T("selalu minta ruang kosong KIRI buat teks", p1.includes("KOSONGKAN 40% area KIRI"));
T("AI DILARANG menggambar teks (teks dari kanvas)", p1.includes("DILARANG") && p1.includes("teks"));
T("anti-huruf-palsu DIPERKERAS (bug 'Itur:lu'): PURE photographic only", p1.includes("ABSOLUTELY NO alphabet characters") && p1.includes("PURE photographic scene only"));
T("judul menyusup ke prompt", p1.includes("Rahasia Kakek"));
T("judul raksasa dipotong aman (≤90 karakter masuk prompt)", !promptLatarThumb("x".repeat(500), "umum", 1).includes("x".repeat(200)));
T("varian ngaco (9) diputar ke varian 1", promptLatarThumb("a", "b", 9) === promptLatarThumb("a", "b", 1));
T("kutip & newline di judul dibersihkan", !promptLatarThumb('A "B"\nC', "umum", 1).includes("\n"));

console.log("📦 C. badgeCtr ASLI — hook CTR per niche (tanpa emoji — anti jegeg)");
T("ibu/rindu → SIAPKAN TISU", badgeCtr("ibu aku rindu") === "SIAPKAN TISU");
T("horor → peringatan", badgeCtr("horor").includes("JANGAN"));
T("umum → default viral", badgeCtr("apa aja") === "VIRAL HARI INI");
T("TANPA emoji di semua badge (font pill anti jegeg)", !/[^\x00-\x7F]/.test([badgeCtr("ibu"), badgeCtr("horor"), badgeCtr("uang"), badgeCtr("")].join("")));

console.log("📦 D. Rumah lama DIAMPUTASI persis pesanan bos ('hapus aja')");
T("tak ada lagi setModal(\"sampul\")", !pg.includes('setModal("sampul")'));
T("tak ada lagi render <SampulModal", !pg.includes("<SampulModal"));
T("tak ada lagi tombol rel p.onCover (tile Sampul)", !pg.includes("p.onCover"));
T("mesin kanvas thumb.ts TETAP UTUH (dipakai studio baru)", th.includes("export function drawAutoThumb") && th.includes("export function pickPowerWords"));

console.log("📦 D2. Studio teks (permintaan bos: tulisan sendiri + font + posisi + besar)");
T("bagiBarisTeks: pecah per baris, buang kosong, MAKS 3", (() => { const b = bagiBarisTeks("IBU\n\n AKU RINDU \nSELAMANYA\nKEEMPAT"); return b.length === 3 && b[1] === "AKU RINDU" && !b.includes("KEEMPAT"); })());
T("bagiBarisTeks: kosong total → []", bagiBarisTeks(" \n\n").length === 0);
T("FONT_THUMB: ≥8 font tampilan siap pilih", FONT_THUMB.length >= 8, FONT_THUMB.length + " font");
T("FONT_THUMB: Anton (legenda CTR) ada", FONT_THUMB.some((f) => f.fam.includes("'Anton'")));
T("thumb.ts: opsi teksKustom/fontFam/skala menancap", th.includes("opsi?.teksKustom") && th.includes("opsi?.fontFam") && th.includes("opsi?.skala"));
T("thumb.ts: emoji 😭 hanya mode otomatis", th.includes("if (!kustom && emoHit"));
T("studio: 8 chip font dirender dari FONT_THUMB", ts.includes("FONT_THUMB.map") && ts.includes("tub-fonts"));
T("studio: segmented oto/manual + textarea tulis sendiri", ts.includes("Tulis sendiri") && ts.includes("teksManual") && ts.includes("bagiBarisTeks"));
T("studio: posisi kiri/kanan + slider 70-140%", ts.includes('type="range"') && ts.includes("min={70}") && ts.includes("max={140}"));
T("studio: RE-KOMPOSISI instan tanpa AI saat kontrol berubah", ts.includes("[teksMode, teksManual, fontId, pos.x, pos.y, skala, judul]") && ts.includes("window.setTimeout"));

console.log("📦 D3. Geser bebas pakai jari + prompt dari Lahan + coba-ulang (kritik bos #3)");
T("bangunPromptDariLahan: judul terpilih + gaya visual + karakter tersusun", (() => { const p = bangunPromptDariLahan({ topic: "ibu", selTitle: "Ibu Aku Rindu", board: { style_visual: "sinematik hangat", color_grade: "emas lembut" }, charLock: "nenek 70 tahun kerudung coklat" }); return p.includes('"Ibu Aku Rindu"') && p.includes("sinematik hangat") && p.includes("emas lembut") && p.includes("nenek 70 tahun"); })());
T("bangunPromptDariLahan: data kosong → \"\"", bangunPromptDariLahan(null) === "" && bangunPromptDariLahan({}) === "");
T("bangunPromptDariLahan: raksasa → dibatasi ≤340", bangunPromptDariLahan({ topic: "x".repeat(500), selTitle: "y".repeat(500) }).length <= 340);
T("thumb.ts: jangkar bebas anchorX/anchorY menimpa sisi & posisi", th.includes("anchorX?: number; anchorY?: number") && th.includes("anchor ? anchor.x * W") && th.includes("anchor ? anchor.y * H") && th.includes("if (anchor) leftDark = anchor.x < 0.5"));
T("studio: slot bisa digeser (pointer capture + rect → fraksi)", ts.includes("onPointerDown") && ts.includes("setPointerCapture") && ts.includes("getBoundingClientRect") && ts.includes("tub-slot-geser"));
T("studio: geser dibatasi area aman 10-90% / 14-92%", ts.includes("Math.max(0.1") && ts.includes("Math.max(0.14"));
T("studio: jangkar diteruskan ke mesin gambar", ts.includes("anchorX: p.x, anchorY: p.y"));
T("studio: tombol Susun dari Lahan + kotak-centang pakai prompt", ts.includes("susunPromptLahan") && ts.includes("pakaiPrompt") && ts.includes("tub-prompt-lahan"));
T("studio: generate pakai prompt khusus bila dicentang", ts.includes("pakaiPrompt && t ? t : judul"));
T("studio: coba-ulang otomatis 2× varian gagal", ts.includes("coba <= 2") && ts.includes("mencoba ulang"));
T("studio: font badge dimuat paksa sebelum diukur (anti pill jegeg)", ts.includes("fonts?.load"));

console.log("📦 E. Rumah baru NANCAP di mesin asli");
T("page: import ThumbStudio", pg.includes('import ThumbStudio from "./thumb-studio"'));
T("page: ScreenId punya 'thumbnail'", pg.includes('| "thumbnail"'));
T("page: cabang render thumbnail", pg.includes('screen === "thumbnail" && <ThumbStudio'));
T("page: tombol hub di HomeDash menuju thumbnail", /go\("thumbnail"\)/.test(pg));
T("studio: panggil rute image AI dengan prompt mentah", ts.includes('"/api/hcnsec/image"') && ts.includes("_rawPrompt: true") && ts.includes("promptLatarThumb(tema, niche, v.id)"));
T("studio: komposisi kanvas drawAutoThumb 1280×720", ts.includes("drawAutoThumb(ctx, 1280, 720") && ts.includes('toDataURL("image/png")'));
T("studio: teks DIPAKSA kiri sesuai janji prompt (preferSide) + font siap dulu", ts.includes('"left"') && ts.includes("fonts?.ready"));
T("thumb.ts: preferSide opsional, bawaan lama utuh (luminansi tetap memutuskan)", th.includes('preferSide?: "left" | "right"') && th.includes('preferSide === "left" ? true : preferSide === "right" ? false : L <= R'));
T("studio: paket teks via titles + metadata (mesin lama)", ts.includes('"/api/hcnsec/titles"') && ts.includes('"/api/hcnsec/metadata"'));
T("studio: jembatan Lahan (verve_brain_v1)", ts.includes('verve_brain_v1') && ts.includes("ambilDariLahan"));
T("studio: tanpa await berlebih — varian berurutan ada progres", ts.includes("setProgres(") && ts.includes("for (let i = 0; i < 3; i++)"));

console.log(`\n${gagal === 0 ? "🏁 SEMUA HIJAU" : "💥 ADA YANG GAGAL"} — ${n - gagal}/${n} cek lulus`);
process.exit(gagal === 0 ? 0 : 1);
