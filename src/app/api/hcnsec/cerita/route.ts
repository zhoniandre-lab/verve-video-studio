import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/hcnsec/cerita
 * Naskah narasi "Cerita Jadi Lagu" — perintah khusus (script di dalam script):
 * hook 3 detik, alur emosi, karakter konsisten, CTA dari kartu audiens.
 * Body: { title, keyword, niche, chars[], audience{emotion,fears,desires,cta}, lines }
 */

type CharIn = { nama?: string; peran?: string; usia?: string; ciri?: string };
type AudienceIn = { emotion?: string; fears?: string[]; desires?: string[]; cta?: string };

function buildPrologue(title: string, keyword: string, niche: string, chars: CharIn[], aud: AudienceIn, n: number): string {
  const charLine = chars.length
    ? chars.map((c) => `${c.nama || "tokoh"} (${c.peran || "utama"}): ${c.usia || ""} ${c.ciri || ""}`.trim()).join(" | ")
    : "tokoh sesuai judul";
  const fearLine = (aud.fears || []).join(", ") || "kehilangan, penyesalan";
  const desireLine = (aud.desires || []).join(", ") || "tersentuh, merasa dipahami";
  const cta = aud.cta || "tulis doamu di komentar";
  return `Kamu penulis naskah video Cerita Jadi Lagu yang naskahnya bikin penonton berhenti scroll lalu menangis.

JUDUL: ${title.slice(0, 100)}
KATA KUNCI: ${keyword.slice(0, 80)}
NICHE: ${niche || "Cerita jadi lagu / lagu emosional"}
KARAKTER (konsisten, jangan diganti): ${charLine.slice(0, 300)}
PENONTON: emosional ${aud.emotion || "haru, rindu, penyesalan"}, HP, nonton malam hari.
KETAKUTAN PENONTON: ${fearLine.slice(0, 200)}
KEINGINAN PENONTON: ${desireLine.slice(0, 200)}

Tulis NASKAH NARASI Bahasa Indonesia TEPAT ${n} baris. Satu baris = satu adegan = SATU kalimat.

ATURAN KERAS:
1. Baris pertama = HOOK: langsung tembak emosi dalam 3 detik. DILARANG basa-basi seperti "halo", "selamat datang", "di video kali ini".
2. Alur emosi: pembuka yang memikat, konflik yang relate, klimaks paling haru di 60-80% naskah, lalu pesan penutup.
3. Kalimat pendek dan lisan, hangat, seolah diceritakan ke satu orang di malam hari.
4. Sebut nama karakter secara konsisten. Jangan menambah karakter baru.
5. Kalimat harus bisa dinyanyikan nantinya: berirama, tidak kaku, mengalir seperti lirik.
6. Baris terakhir mengandung ajakan halus: ${cta.slice(0, 120)}.
7. Output HANYA baris naskah. Tanpa nomor, tanpa bullet, tanpa tanda kutip, tanpa judul, tanpa penjelasan apapun.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
    const keyword = String(body.keyword || "").trim();
    const niche = String(body.niche || "Cerita jadi lagu").trim();
    const chars: CharIn[] = Array.isArray(body.chars) ? body.chars : [];
    const aud: AudienceIn = body.audience || {};
    const n = Math.max(4, Math.min(12, Number(body.lines) || 10));

    const sys = buildPrologue(title, keyword, niche, chars, aud, n);
    const raw: string = await chat([{ role: "user", content: sys }], undefined);
    const lines = String(raw || "")
      .replace(/```[a-z]*/gi, "")
      .split("\n")
      .map((l: string) => l.replace(/^[-•*0-9.)\s"'“”]+/, "").replace(/["'“”]+$/, "").trim())
      .filter(Boolean)
      .slice(0, n);

    if (lines.length < Math.max(3, n - 3)) {
      return NextResponse.json({ error: "Naskah terlalu pendek dari AI, coba lagi." }, { status: 500 });
    }
    return NextResponse.json({ lines, naskah: lines.join("\n"), count: lines.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
