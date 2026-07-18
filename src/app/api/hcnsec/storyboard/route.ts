import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";
import { safeParseJSON } from "@/lib/json-util";

/**
 * Buat storyboard/adegan PER SLIDE.
 * Mengembalikan JSON dengan scenes array.
 * Ada retry jika parse gagal.
 */
export const dynamic = "force-dynamic";

async function tryGenerate(title: string, keyword: string, niche: string, n: number, attempt: number): Promise<any> {
  const hint = attempt > 1
    ? "\n\nPERINGATAN: Output kamu HARUS JSON murni tanpa teks apapun. JANGAN tambah koma di akhir array. JANGAN gunakan tanda kutip di dalam string kecuali dengan escape (\\')."
    : "";
  const sys =
`Kamu adalah sutradara video klip musik & AI prompt engineer handal.
Tugas: buat storyboard untuk video musik bertema "${title}" (keyword: ${keyword||"-"}, niche: ${niche||"-"}) dengan ${n} adegan slide.

IKUTI ATURAN INI KETAT:
1. Tiap adegan adalah KELANJUTAN CERITA yang emosional & mengalir (pembukaan → konflik → puncak → penutup).
2. Adegan harus SPESIFIK, tidak generik. Contoh tema "Ibu maafkan aku": bukan hanya "wanita sedih" tapi "close-up tangan keriput ibu mengusap foto tua anaknya di atas meja makan, lampu gantung kuning temaram".
3. visual_prompt WAJIB:
   - BAHASA INGGRIS, 25-45 kata
   - Sebut shot type (close-up / medium shot / wide shot / aerial), subjek, ekspresi, setting, pencahayaan (warm golden hour, moody blue, dll), warna dominan, lensa/camera (35mm film, shallow depth of field, cinematic lighting, 8k, photorealistic)
   - JANGAN ada "no text", "no watermark" dll.
   - SETIAP adegan VISUAL BERBEDA (komposisi/setting/pencahayaan berbeda)
4. lyric_line: 1 baris lirik BAHASA INDONESIA, 5-10 kata, menyentuh, sesuai emosi adegan. TIDAK BOLEH SAMA dengan slide lain.
5. mood: 1 kata emosi (sad, warm, hopeful, epic, calm, tense, dramatic, peaceful, melancholic, joyful).
6. color_grade: HEX warna yang cocok dengan mood keseluruhan (e.g. #c98872 untuk sepia/sedih, #5b8fd1 untuk biru dingin, #f4c77a untuk hangat senja).
7. style_visual: SATU kata yang PALING cocok: cinematic | anime | studio | fantasy | cyberpunk | pixar | oil | minimalist

Output HANYA JSON VALID (bukan fenced code block, bukan teks lain):
{"title":"...","style_visual":"...","color_grade":"#...","scenes":[{"scene":1,"scene_desc":"...","lyric_line":"...","visual_prompt":"...","mood":"..."}]}
${hint}`;
  const raw = await chat([{ role: "user", content: sys }]);
  const parsed = safeParseJSON(raw);
  if (!parsed || !parsed.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error("JSON tidak valid: " + raw.slice(-200));
  }
  return parsed;
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
        // Normalisasi scene count
        if (parsed.scenes.length > n) parsed.scenes = parsed.scenes.slice(0, n);
        while (parsed.scenes.length < n) {
          const last = parsed.scenes[parsed.scenes.length - 1];
          parsed.scenes.push({
            scene: parsed.scenes.length + 1,
            scene_desc: last.scene_desc,
            lyric_line: last.lyric_line,
            visual_prompt: last.visual_prompt,
            mood: last.mood,
          });
        }
        parsed.scenes = parsed.scenes.map((s: any, i: number) => ({
          scene: i + 1,
          scene_desc: String(s.scene_desc || "").slice(0, 200),
          lyric_line: String(s.lyric_line || "").slice(0, 100),
          visual_prompt: String(s.visual_prompt || "").slice(0, 400),
          mood: String(s.mood || "calm").slice(0, 30),
        }));
        parsed.title = String(parsed.title || title);
        parsed.style_visual = String(parsed.style_visual || "cinematic").toLowerCase().replace(/[^a-z]/g, "");
        if (!/^#[0-9a-f]{6}$/i.test(parsed.color_grade || "")) parsed.color_grade = "#a855f7";
        return NextResponse.json(parsed);
      } catch (e: any) {
        lastErr = e;
      }
    }
    return NextResponse.json({ error: `Storyboard gagal: ${lastErr?.message || "coba lagi"}` }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat storyboard" }, { status: 500 });
  }
}
