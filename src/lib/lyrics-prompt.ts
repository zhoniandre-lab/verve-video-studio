/* =====================================================================
   PROMPT & PARSER LIRIK (v19.38) — 100% orisinal, MURNI (bisa diuji)
   Dipakai route /api/hcnsec/lyrics — sama untuk semua sumber AI
   (bansos OpenAI-compatible ATAU hcnsec).
   ===================================================================== */

export function buildSystemPrompt(title: string, keyword: string, niche: string, genre: string, mood: string): string {
  return `Kamu penulis lirik Indonesia yang viral. Buat lirik untuk lagu:
Judul: "${title}"
Keyword: ${keyword || "-"}
Niche: ${niche || "-"}
Genre: ${genre || "pop ballad"}
Mood: ${mood || "menyentuh"}

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
${genre || "pop ballad"}
===MOOD===
${mood || "menyentuh"}
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
}

export interface LirikHasil {
  title: string;
  genre: string;
  mood: string;
  tags: string[];
  style_prompt_suno: string;
  lyrics: string;
}

export function parseLyrics(raw: string): LirikHasil {
  const s = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
  const get = (key: string) => {
    const re = new RegExp(`===${key}===\\s*\\n([\\s\\S]*?)(?=\\n===|$)`);
    const m = s.match(re);
    return m ? m[1].trim() : "";
  };
  const title = get("TITLE").split("\n")[0].trim().slice(0, 100);
  const genre = get("GENRE").split("\n")[0].trim().slice(0, 50);
  const mood = get("MOOD").split("\n")[0].trim().slice(0, 50);
  const tagsRaw = get("TAGS").split("\n")[0];
  const tags = tagsRaw.split(",").map((t: string) => t.replace(/^#/, "").trim()).filter(Boolean).slice(0, 8);
  const style_suno = get("STYLE_PROMPT_SUNO").split("\n")[0].trim().slice(0, 200);
  const lyrics = get("LYRICS").trim();
  if (!lyrics || lyrics.length < 50) throw new Error("Lirik terlalu pendek / gagal diparse");
  return { title, genre, mood, tags, style_prompt_suno: style_suno, lyrics };
}
