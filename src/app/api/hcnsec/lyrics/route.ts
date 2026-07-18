import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";
import { safeParseJSON } from "@/lib/json-util";

/**
 * Generate lirik lengkap + style prompt untuk AI music.
 */
export const dynamic = "force-dynamic";

async function tryGenerate(title: string, keyword: string, niche: string, genre: string, mood: string, attempt: number): Promise<any> {
  const hint = attempt > 1
    ? "\n\nPENTING: Output HANYA JSON valid. JANGAN tambah penjelasan. JANGAN koma di akhir array."
    : "";
  const sys =
`Kamu penulis lirik Indonesia emosional & viral. Buat lirik untuk lagu:
Judul: "${title}"
Keyword: ${keyword||"-"}
Niche: ${niche||"-"}
Genre: ${genre||"pop ballad"}
Mood: ${mood||"menyentuh"}

Struktur (WAJIB):
[Intro] 2 baris vokal pendek
[Verse 1] 4 baris
[Pre-Chorus] 2 baris
[Chorus] 4 baris (hook paling catchi)
[Verse 2] 4 baris
[Chorus] 4 baris
[Bridge] 3 baris klimaks
[Chorus] 4 baris
[Outro] 2 baris penutup

Aturan:
- Bahasa SEHARI-HARI, relatable, puitis tapi tidak lebay
- 25-30 baris total
- "lyrics" berisi SELURUH lirik dengan section tags [Verse 1] dll
- "tags" array 5 kata keyword untuk pencarian
- "style_prompt_suno" BAHASA INGGRIS untuk AI music: genre, instruments, vocal type, mood (1 kalimat pendek)

Output HANYA JSON VALID:
{"title":"...","genre":"...","mood":"...","tags":["...","...","...","...","..."],"style_prompt_suno":"...","lyrics":"[Verse 1]\\nbaris 1\\nbaris 2..."}
${hint}`;

  const raw = await chat([{ role: "user", content: sys }]);
  const parsed = safeParseJSON(raw);
  if (!parsed || !parsed.lyrics) throw new Error("Lyrics JSON invalid");
  return parsed;
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, genre, mood } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });

    let lastErr: any = null;
    for (let i=1;i<=3;i++){
      try {
        const parsed = await tryGenerate(title, keyword||"", niche||"", genre||"", mood||"", i);
        parsed.lyrics = String(parsed.lyrics).replace(/\r/g,"");
        if (!Array.isArray(parsed.tags)) parsed.tags = [genre||"pop", niche||"viral"];
        parsed.tags = parsed.tags.slice(0,8).map((t:any)=>String(t).replace(/^#/,"").trim()).filter(Boolean);
        parsed.style_prompt_suno = String(parsed.style_prompt_suno||"indonesian pop ballad, piano and strings, male vocal, emotional").slice(0,200);
        return NextResponse.json(parsed);
      } catch(e){ lastErr = e; }
    }
    return NextResponse.json({ error: `Lirik gagal: ${lastErr?.message||"coba lagi"}` }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat lirik" }, { status: 500 });
  }
}
