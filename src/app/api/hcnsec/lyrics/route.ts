
import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

/**
 * Generate full lyrics (lirik lengkap) dengan struktur:
 * Intro → Verse 1 → Pre-Chorus → Chorus → Verse 2 → Chorus → Bridge → Outro
 * Output JSON. Untuk hook ke Suno/AI music & karaoke.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, genre, mood } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });

    const sys =
`Kamu adalah penulis lirik lagu Indonesia yang emosional & viral (kualitas Tulus, Glenn Fredly, Denny Caknan, Tiara Andini).
Tema lagu: "${title}"
Keyword: ${keyword||"-"}
Niche/topik: ${niche||"-"}
Genre: ${genre||"pop ballad"}
Mood: ${mood||"menyentuh"}

Buat lirik LENGKAP dengan struktur Baku:
- [Intro] 2 baris (opsional, bisa berupa vokal pendek / adegan)
- [Verse 1] 4 baris — buka cerita, setting suasana
- [Pre-Chorus] 2 baris — membangun emosi
- [Chorus] 4 baris — inti pesan, paling emosional & catchiness (hook yang viral)
- [Verse 2] 4 baris — lanjutan cerita / detail kenangan
- [Chorus] 4 baris
- [Bridge] 3 baris — puncak emosi (pengakuan, klimaks)
- [Chorus] 4 baris (bisa sedikit variasi)
- [Outro] 2 baris — penutup, menyentuh, tersisa/menghilang

ATURAN:
1. Gaya bahasa SEHARI-HARI (bukan terlalu sastra), tapi puitis dan relatable
2. Bisa menyentuh hati anak muda & orang tua
3. PEMISAH: akhiri setiap baris dengan newline
4. TIDAK pakai tag [Intro] dll di output, cukup keluarin array.
5. Panjang total 25-30 baris.

Output HANYA JSON tanpa penjelasan:
{
  "title": "...",
  "genre": "...",
  "mood": "...",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "style_prompt_suno": "string 1 kalimat untuk suno/udio, BAHASA INGGRIS, misal: 'emotional indonesian pop ballad, piano and strings, male vocals, heartfelt, cinematic'",
  "lyrics": "seluruh lirik dengan [Verse 1] dll sebagai penanda section"
}`;

    const raw = await chat([{ role: "user", content: sys }]);
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let jsonText = fence ? fence[1] : raw;
    const i1 = jsonText.indexOf("{"), i2 = jsonText.lastIndexOf("}");
    if (i1 < 0 || i2 < 0) throw new Error("AI balas tidak dalam JSON");
    jsonText = jsonText.slice(i1, i2+1);
    return NextResponse.json(JSON.parse(jsonText));
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat lirik" }, { status: 500 });
  }
}
