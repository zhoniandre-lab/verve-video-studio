import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

type Char = { nama: string; peran: string; usia: string; ciri: string; pakaian: string; suasana: string };

// 🔒 v10.0 SATU WAJAH — "satpam identitas": kartu karakter Indonesia → SATU kalimat identitas
// Inggris yang BEKU. Kalimat inilah yang disuntik KATA-PER-KATA SAMA di urutan PERTAMA tiap prompt
// gambar → wajah, rambut, pakaian konsisten DAN orangnya beneran orang Indonesia.
const SYS = `Kamu penerjemah "kartu karakter" Bahasa Indonesia menjadi SATU kalimat identitas Bahasa Inggris yang BEKU untuk AI pembuat gambar.

KELUARKAN TEPAT 2 BARIS. TANPA JSON. TANPA tanda kurung kurawal { } atau siku [ ]. TANPA kutip ganda.

IDENTITY_EN: satu baris padat — selalu diawali 'the exact same main character in every image, Indonesian <woman/man/girl/boy> <umur> years old, Southeast Asian facial features, warm tan skin (sawo matang), dark brown eyes' lalu rambut, ciri wajah khas, pakaian (always wearing ...), dan suasana latar khas.
NEGATIVE_EN: satu baris larangan konsistensi — no face swap, no different person, no inconsistent face, no changing hairstyle, no changing hair color, no changing outfit, no aging change, no caucasian features, no western facial features, no extra person.

Aturan keras:
1. WAJIB memuat kata: Indonesian, Southeast Asian facial features, warm tan skin (sawo matang).
2. Terjemahkan SEMUA ciri ke Bahasa Inggris literal yang padat (rambut beruban diikat rapi = neat tied-back gray hair; daster batik cokelat = simple brown batik daster dress).
3. Usia = satu angka realistis dari rentang teks.
4. Ciri wajah harus SPESIFIK (bentuk wajah, rambut, mata, senyum) — BUKAN kata umum seperti cantik/tampan.
5. Kalau ada lebih dari satu karakter: karakter pertama = main character lengkap, sisanya ringkas di akhir kalimat yang sama.

KARTU KARAKTER:
{{CARDS}}`;

function guessGender(c: Char): string {
  const s = `${c.nama} ${c.usia} ${c.peran}`.toLowerCase();
  if (/nenek|nini/.test(s)) return "elderly woman";
  if (/kakek|aki/.test(s)) return "elderly man";
  if (/ibu|bunda|mama|wanita|perempuan|gadis|istri|mbak|kakak perempuan|adik perempuan|tante/.test(s)) return "woman";
  if (/anak|bocah|remaja putri/.test(s)) return /putri|perempuan|gadis/.test(s) ? "girl" : "boy";
  if (/adik|kakak/.test(s)) return /perempuan|putri/.test(s) ? "girl" : "boy";
  return "man";
}

function fallbackIdentity(cards: Char[]): string {
  const c = cards[0];
  const age = c.usia.match(/\d{1,3}/)?.[1] || "30";
  const main = `the exact same main character in every image, Indonesian ${guessGender(c)} around ${age} years old, Southeast Asian facial features, warm tan skin (sawo matang), dark brown eyes, consistent face and hairstyle (${c.ciri}), always wearing ${c.pakaian}, recurring setting: ${c.suasana}`;
  const rest = cards.slice(1).map((x) => `${x.nama} (${x.usia}, ${x.ciri}, wearing ${x.pakaian})`).join(" | ");
  return rest ? `${main} | supporting characters: ${rest}` : main;
}

export async function POST(req: Request) {
  try {
    const { chars, gaya } = await req.json();
    const cards = (Array.isArray(chars) ? chars : []).filter((c: Char) => c && String(c.nama || "").trim());
    if (!cards.length) return NextResponse.json({ error: "Kartu karakter kosong" }, { status: 400 });
    const cardsTxt = cards
      .map((c: Char, i: number) => `Karakter ${i + 1}: nama ${c.nama}; peran ${c.peran}; usia ${c.usia}; ciri ${c.ciri}; pakaian ${c.pakaian}; suasana ${c.suasana}`)
      .join("\n");
    let identity = "", negative = "";
    try {
      const raw = await chat(
        [{ role: "user", content: SYS.replace("{{CARDS}}", cardsTxt) + (gaya ? `\nGAYA VISUAL ACUAN: ${gaya}` : "") }],
        undefined
      );
      const mi = String(raw || "").match(/IDENTITY_EN\s*:\s*([^\n]+)/i);
      const mn = String(raw || "").match(/NEGATIVE_EN\s*:\s*([^\n]+)/i);
      if (mi && mi[1].trim().length > 40) identity = mi[1].trim().replace(/[{}\[\]"]/g, "");
      if (mn && mn[1].trim().length > 10) negative = mn[1].trim().replace(/[{}\[\]"]/g, "");
    } catch { /* AI mogok → template deterministik di bawah menyelamatkan */ }
    if (!identity) identity = fallbackIdentity(cards);
    if (!/indonesian/i.test(identity))
      identity = `Indonesian, Southeast Asian facial features, warm tan skin (sawo matang), ${identity}`;
    return NextResponse.json({ identity, negative, source: identity ? "ai+lock" : "template" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal bekukan karakter" }, { status: 500 });
  }
}
