import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

async function tryGenerate(title: string, keyword: string, niche: string, genre: string, mood: string): Promise<any> {
  const sys =
`Kamu penulis lirik Indonesia yang viral. Buat lirik untuk lagu:
Judul: "${title}"
Keyword: ${keyword||"-"}
Niche: ${niche||"-"}
Genre: ${genre||"pop ballad"}
Mood: ${mood||"menyentuh"}

Struktur WAJIB: [Intro] 2 baris / [Verse 1] 4 / [Pre-Chorus] 2 / [Chorus] 4 / [Verse 2] 4 / [Chorus] 4 / [Bridge] 3 / [Chorus] 4 / [Outro] 2. Total 25-30 baris.

ATURAN:
- Teks dalam bahasa sehari-hari, menyentuh, relatable
- JANGAN gunakan tanda kutip ganda (") di lirik; pakai kutip satu jika perlu
- Pemisah tiap baris: \n
- JANGAN tambahkan penjelasan lain

Output HARUS dalam FORMAT INI (teks polos, tanpa code block, tanpa JSON):
===TITLE===
(judul singkat)
===GENRE===
${genre||"pop ballad"}
===MOOD===
${mood||"menyentuh"}
===TAGS===
tag1, tag2, tag3, tag4, tag5
===STYLE_PROMPT_SUNO===
(1 kalimat BAHASA INGGRIS untuk AI music: genre, instruments, vocal, mood)
===LYRICS===
[Intro]
baris 1
baris 2
[Verse 1]
baris 1
...dst`;

  const raw = await chat([{ role: "user", content: sys }]);
  return parseLyrics(raw);
}

function parseLyrics(raw: string): any {
  const s = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
  const get = (key: string) => {
    const re = new RegExp(`===${key}===\\s*\\n([\\s\\S]*?)(?=\\n===|$)`);
    const m = s.match(re);
    return m ? m[1].trim() : "";
  };
  const title = get("TITLE").split("\n")[0].trim().slice(0,100);
  const genre = get("GENRE").split("\n")[0].trim().slice(0,50);
  const mood = get("MOOD").split("\n")[0].trim().slice(0,50);
  const tagsRaw = get("TAGS").split("\n")[0];
  const tags = tagsRaw.split(",").map((t:string)=>t.replace(/^#/,"").trim()).filter(Boolean).slice(0,8);
  const style_suno = get("STYLE_PROMPT_SUNO").split("\n")[0].trim().slice(0,200);
  const lyrics = get("LYRICS").trim();

  if (!lyrics || lyrics.length < 50) throw new Error("Lirik terlalu pendek / gagal diparse");
  return { title, genre, mood, tags, style_prompt_suno: style_suno, lyrics };
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, genre, mood } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });

    let lastErr: any = null;
    for (let i=1;i<=3;i++){
      try {
        const parsed = await tryGenerate(title, keyword||"", niche||"", genre||"", mood||"");
        return NextResponse.json(parsed);
      } catch(e){ lastErr = e; }
    }
    return NextResponse.json(
      { error: `Lirik gagal: ${lastErr?.message||"coba lagi"}` },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat lirik" }, { status: 500 });
  }
}
