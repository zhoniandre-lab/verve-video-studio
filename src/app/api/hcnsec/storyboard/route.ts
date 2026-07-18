
import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

/**
 * Buat storyboard/adegan PER SLIDE dari judul+keyword+niche.
 * Output: array of { idx, scene_desc, lyric_line, visual_prompt, mood }
 * - scene_desc: deskripsi singkat apa yang terjadi di adegan
 * - lyric_line: 1 baris lirik/narasi untuk adegan (cocok panjangnya jadi 3-5 detik)
 * - visual_prompt: prompt visual detail untuk gambar AI (BAHASA INGGRIS, 30-50 kata)
 * - mood: warna/mood emosi (sad, happy, epic, calm, dll)
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, slides } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
    const n = Math.max(2, Math.min(12, Number(slides) || 4));

    const sys =
`Kamu adalah sutradara video klip musik dan AI image prompt engineer handal.
Buat storyboard untuk video musik/lirik bertema "${title}" (keyword: ${keyword||"-"}, niche: ${niche||"-"}) dengan ${n} adegan (slide).

ATURAN WAJIB:
1. Tiap adegan menceritakan KELANJUTAN CERITA yang EMOSIONAL dan mengalir (pembukaan → konflik → puncak → resolusi/penutup).
2. Untuk tema sedih/penyesalan (misal "Ibu maafkan aku"), tunjukkan adegan yang menyentuh: air mata, pelukan, kenangan, momen kecil yang haru. JANGAN generik.
3. visual_prompt WAJIB:
   - BAHASA INGGRIS, 30-50 kata, detail sinematik
   - Sebutkan: komposisi (close-up / medium shot / wide), subjek, pose/ekspresi, setting, lighting (warm golden hour, moody blue, dll), warna dominan, style referensi (cinematic, shallow depth of field, 35mm film)
   - Akhiri dengan konsistensi: "cinematic, 8k, photorealistic, no text, no watermark, no watermark"
   - SETIAP ADEGAN HARUS VISUALLY BERBEDA (bedakan komposisi/setting/pencahayaan) tapi konsisten tone ceritanya.
4. lyric_line: 1 baris lirik BAHASA INDONESIA, 6-12 kata, menyentuh, sesuai emosi adegan, TIDAK repeat baris lain. Kalau di awal adalah bait pembuka, di tengah reff, dst.
5. mood: 1 kata emosi (sad, warm, hopeful, epic, calm, tense, dramatic, peaceful, melancholic, joyful)

Output HANYA dalam format JSON TANPA penjelasan lain, format:
{
  "title": "judul lagu (indonesia)",
  "style_visual": "satu kata gaya visual (cinematic / anime / studio / fantasy / cyberpunk / minimalist / oil / retro)",
  "color_grade": "hex warna tema yang cocok dengan mood (cth: #c98872 untuk sepia sedih, #5b8fd1 untuk biru dingin, dll)",
  "scenes": [
    {"scene": 1, "scene_desc": "...", "lyric_line": "...", "visual_prompt": "...", "mood": "..."}
  ]
}`;

    const raw = await chat([{ role: "user", content: sys }]);
    // Extract JSON
    let jsonText = raw.trim();
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) jsonText = fence[1];
    // Find first { and last }
    const i1 = jsonText.indexOf("{"), i2 = jsonText.lastIndexOf("}");
    if (i1 < 0 || i2 < 0) throw new Error("Gagal parsing response AI");
    jsonText = jsonText.slice(i1, i2+1);
    const parsed = JSON.parse(jsonText);
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat storyboard" }, { status: 500 });
  }
}
