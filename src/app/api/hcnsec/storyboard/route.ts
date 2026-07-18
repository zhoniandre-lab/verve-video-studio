import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

/**
 * Buat storyboard/adegan PER SLIDE.
 * Format: marker-based (TIDAK JSON), anti-parse-error.
 */
export const dynamic = "force-dynamic";

async function tryGenerate(title: string, keyword: string, niche: string, n: number, attempt: number): Promise<any> {
  const extra = attempt > 1
    ? "\n\nPERATURAN TAMBAHAN (WAJIB):\n- JANGAN gunakan tanda kutip ganda di dalam lirik atau deskripsi (cukup kutip satu atau tidak sama sekali)\n- Jumlah scene HARUS TEPAT " + n + " buah\n- Jangan tambahkan catatan apapun di luar format, ini untuk diproses program."
    : "";
  const sys =
`Kamu sutradara video klip. Buat storyboard untuk video bertema "${title}" (keyword: ${keyword||"-"}, niche: ${niche||"-"}) dengan ${n} adegan.

PENTING: Output HANYA dalam FORMAT DI BAWAH INI, teks polos tanpa penjelasan tambahan, tanpa markdown, tanpa JSON, tanpa code block:

===STYLE_VISUAL===
(satu kata: cinematic/anime/studio/fantasy/cyberpunk/pixar/oil/minimalist)
===COLOR===
(hex warna tema, cth: #c98872)
===TITLE===
(judul singkat)
===SCENE===
nomor: 1
deskripsi: (2-3 kalimat apa yang terjadi di adegan, jelas, emosional, spesifik, JANGAN pakai tanda kutip ganda di dalam teks)
lirik: (satu baris lirik bahasa indonesia 5-9 kata, menyentuh, sesuai adegan, TANPA kutip ganda)
mood: (satu kata emosi: sad/warm/hopeful/epic/calm/tense/dramatic/peaceful/melancholic/joyful)
prompt_en: (visual prompt BAHASA INGGRIS 25-40 kata: sebut shot type, subjek, ekspresi, setting, lighting, warna, cinematic 8k photorealistic — TANPA tanda kutip ganda di dalam)
===SCENE===
nomor: 2
deskripsi: ...
...dst sampai scene ${n}
${extra}`;

  const raw = await chat([{ role: "user", content: sys }]);
  return parseStoryboard(raw, n);
}

function parseStoryboard(raw: string, expectedN: number): any {
  // Bersihkan code fence jika ada
  let s = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();

  const result: any = {
    title: "",
    style_visual: "cinematic",
    color_grade: "#a855f7",
    scenes: [] as any[],
  };

  // Ambil style_visual
  const sv = s.match(/===STYLE_VISUAL===\s*\n([\s\S]*?)(?=\n===|$)/);
  if (sv) {
    const v = sv[1].trim().split("\n")[0].trim().toLowerCase().replace(/[^a-z]/g, "");
    if (v) result.style_visual = v;
  }
  const col = s.match(/===COLOR===\s*\n([\s\S]*?)(?=\n===|$)/);
  if (col) {
    const v = col[1].trim().split("\n")[0].trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) result.color_grade = v;
  }
  const tt = s.match(/===TITLE===\s*\n([\s\S]*?)(?=\n===|$)/);
  if (tt) {
    result.title = tt[1].trim().split("\n")[0].trim().slice(0, 100);
  }

  // Split per scene
  const sceneBlocks = s.split(/===SCENE===/g).slice(1);
  for (const block of sceneBlocks) {
    const get = (key: string) => {
      const re = new RegExp(`${key}\\s*:\\s*([^\\n]*(?:\\n(?![a-z_]+:)[^\\n]*)*)`, "i");
      const m = block.match(re);
      return m ? m[1].trim().replace(/\n+/g," ").replace(/\s+/g," ").replace(/"/g,"'") : "";
    };
    const no = parseInt(get("nomor")) || result.scenes.length + 1;
    const desc = get("deskripsi").slice(0, 300);
    const lyric = get("lirik").slice(0, 120);
    const mood = get("mood").split(/[,\s.]+/)[0].toLowerCase().slice(0,20);
    const visual = get("prompt_en").slice(0, 500);
    if (!desc && !visual) continue;
    result.scenes.push({
      scene: no,
      scene_desc: desc,
      lyric_line: lyric,
      visual_prompt: visual,
      mood: mood || "calm",
    });
  }
  if (result.scenes.length === 0) throw new Error("Gagal memparsing adegan. Coba lagi.");

  // Normalisasi jumlah scene
  while (result.scenes.length < expectedN) {
    const last = result.scenes[result.scenes.length-1];
    result.scenes.push({
      scene: result.scenes.length+1,
      scene_desc: last.scene_desc,
      lyric_line: last.lyric_line,
      visual_prompt: last.visual_prompt,
      mood: last.mood,
    });
  }
  if (result.scenes.length > expectedN) result.scenes = result.scenes.slice(0, expectedN);
  // Re-number
  result.scenes.forEach((sc:any,i:number)=>{sc.scene=i+1;});
  return result;
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, slides } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
    const n = Math.max(2, Math.min(12, Number(slides) || 4));

    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const parsed = await tryGenerate(title, keyword || "", niche || "", n, attempt);
        if (!parsed.scenes || parsed.scenes.length < n/2) throw new Error("Scene kurang dari separuh target");
        return NextResponse.json(parsed);
      } catch (e: any) {
        lastErr = e;
      }
    }
    return NextResponse.json(
      { error: `Storyboard gagal setelah 3x percobaan: ${lastErr?.message || ""}` },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat storyboard" }, { status: 500 });
  }
}
