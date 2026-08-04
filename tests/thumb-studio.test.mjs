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

let gagal = 0, n = 0;
const T = (nama, ok, info = "") => { n++; console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };

console.log("📦 A. gayaNiche ASLI — niche dikenali & diarahkan");
T("horor → suasana horor", gayaNiche("Horor Rumah Tua").includes("lilin"));
T("uang → grafik koin", gayaNiche("cara cari UANG").includes("koin"));
T("niche asing → umum", gayaNiche("xyzqwe") === "subjek utama menonjol tajam, latar blur sinematik, kontras tinggi");
T("kosong → umum, tak meledak", gayaNiche("").includes("kontras"));

console.log("📦 B. promptLatarThumb ASLI — otak CTR");
const p1 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 1);
const p2 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 2);
const p3 = promptLatarThumb("JANGAN PANIK! Rahasia Kakek", "horor", 3);
T("3 varian BEDA arah komposisi", p1 !== p2 && p2 !== p3 && p1 !== p3);
T("selalu 16:9 widescreen", p1.includes("16:9"));
T("selalu minta ruang kosong KIRI buat teks", p1.includes("KOSONGKAN 40% area KIRI"));
T("AI DILARANG menggambar teks (teks dari kanvas)", p1.includes("DILARANG") && p1.includes("teks"));
T("judul menyusup ke prompt", p1.includes("Rahasia Kakek"));
T("judul raksasa dipotong aman", promptLatarThumb("x".repeat(500), "umum", 1).length < 700);
T("varian ngaco (9) diputar ke varian 1", promptLatarThumb("a", "b", 9) === promptLatarThumb("a", "b", 1));
T("kutip & newline di judul dibersihkan", !promptLatarThumb('A "B"\nC', "umum", 1).includes("\n"));

console.log("📦 C. badgeCtr ASLI — badge kecil per niche");
T("horor → peringatan", badgeCtr("horor").includes("JANGAN"));
T("umum → default viral", badgeCtr("apa aja").includes("VIRAL"));

console.log("📦 D. Rumah lama DIAMPUTASI persis pesanan bos ('hapus aja')");
T("tak ada lagi setModal(\"sampul\")", !pg.includes('setModal("sampul")'));
T("tak ada lagi render <SampulModal", !pg.includes("<SampulModal"));
T("tak ada lagi tombol rel p.onCover (tile Sampul)", !pg.includes("p.onCover"));
T("mesin kanvas thumb.ts TETAP UTUH (dipakai studio baru)", th.includes("export function drawAutoThumb") && th.includes("export function pickPowerWords"));

console.log("📦 E. Rumah baru NANCAP di mesin asli");
T("page: import ThumbStudio", pg.includes('import ThumbStudio from "./thumb-studio"'));
T("page: ScreenId punya 'thumbnail'", pg.includes('| "thumbnail"'));
T("page: cabang render thumbnail", pg.includes('screen === "thumbnail" && <ThumbStudio'));
T("page: tombol hub di HomeDash menuju thumbnail", /go\("thumbnail"\)/.test(pg));
T("studio: panggil rute image AI dengan prompt mentah", ts.includes('"/api/hcnsec/image"') && ts.includes("_rawPrompt: true") && ts.includes("promptLatarThumb(judul, niche"));
T("studio: komposisi kanvas drawAutoThumb 1280×720", ts.includes("drawAutoThumb(ctx, 1280, 720") && ts.includes('toDataURL("image/png")'));
T("studio: paket teks via titles + metadata (mesin lama)", ts.includes('"/api/hcnsec/titles"') && ts.includes('"/api/hcnsec/metadata"'));
T("studio: jembatan Lahan (verve_brain_v1)", ts.includes('verve_brain_v1') && ts.includes("ambilDariLahan"));
T("studio: tanpa await berlebih — varian berurutan ada progres", ts.includes("setProgres(") && ts.includes("for (let i = 0; i < 3; i++)"));

console.log(`\n${gagal === 0 ? "🏁 SEMUA HIJAU" : "💥 ADA YANG GAGAL"} — ${n - gagal}/${n} cek lulus`);
process.exit(gagal === 0 ? 0 : 1);
