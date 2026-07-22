import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

const PROLOGUE = `Kamu adalah sutradara video musik sinematik. Buat storyboard untuk video musik:

JUDUL: {{TITLE}}
KATA KUNCI: {{KW}}
NICHE: {{NICHE}}
JUMLAH ADEGAN: {{N}}

NASKAH CERITA (SUMBER ALUR — wajib diikuti baris demi baris):
{{NASKAH}}

TULIS OUTPUT TEPAT SESUAI FORMAT DI BAWAH INI. JANGAN tambahkan apapun sebelum/sesudah.
JANGAN PERNAH gunakan tanda kurung kurawal { } atau kurung siku [ ].
JANGAN gunakan JSON.
JANGAN gunakan tanda kutip ganda " di dalam teks (pakai tanda kutip tunggal ' saja).

MULAI-FORMAT
STYLE_VISUAL: cinematic
COLOR: #hexwarna
TITLE: {{TITLE}}
SCENE_START
SCENE_NUMBER: 1
DESKRIPSI: deskripsi detail adegan dalam Bahasa Indonesia (aksi tokoh, setting, emosi wajah, prop)
LIRIK: SATU baris lirik pendek (5-10 kata) sesuai emosi adegan, natural, Bahasa Indonesia, tanpa tanda kutip
MOOD: satu kata emosi (misal: sedih, haru, marah, rindu, bahagia, tenang)
VISUAL_EN: detailed English visual prompt: [shot type] [subject+action] [environment] [lighting] [color tone] — contoh: extreme close-up of a wrinkled elderly mother's hand holding an old photo, tears visible, warm sunset light through window, dust particles in air, shallow depth of field, warm sepia tones, cinematic
SCENE_END
AKHIR-FORMAT

Aturan penting:
1. Jumlah scene TEPAT {{N}}.
2. Setiap adegan BERBEDA: beda shot type (close-up, medium, wide, over-shoulder, dll), beda setting, beda momen emosi.
3. DESKRIPSI: detail aksi dan emosi (misal: ibu memegang foto anaknya, air mata menetes di atas meja kayu tua).
4. LIRIK: satu baris per adegan, mengalir seperti lagu, nyambung antar adegan.
5. VISUAL_EN: WAJIB dalam Bahasa Inggris, 20-40 kata, sebutkan: shot type + subjek + aksi + lighting + lens/gear feel.
6. COLOR: pilih warna hex yang cocok mood (ungu/pink untuk romantis, biru dingin untuk sedih, emas untuk harapan, merah untuk marah, hijau untuk islami).
7. STYLE_VISUAL: satu kata: cinematic, anime, studio, fantasy, cyberpunk, pixar, oil, minimalist.
8. LARANGAN KERAS: VISUAL_EN DILARANG menyebut etnis, warna kulit, detail wajah, model rambut, atau pakaian spesifik karakter — identitas disuntik SISTEM terpisah agar wajah 100% konsisten antar adegan. Cukup: shot, aksi, gesture, lingkungan, cahaya, lensa.
9. ALUR BERANTAI (PALING PENTING): semua adegan adalah SATU FILM PENDEK utuh. Setiap adegan MELANJUTKAN kejadian adegan sebelumnya (sebab → akibat), mengikuti urutan naskah. DILARANG kumpulan suasana yang berdiri sendiri-sendiri tanpa hubungan.
10. BENANG MERAH: pilih SATU benda cerita NYATA dari naskah (mis: baju ibu yang tersimpan di lemari) — wajib muncul di minimal 3 adegan dan disebut jelas di VISUAL_EN adegan-adegan itu. Benda cerita BUKAN pakaian yang sedang dipakai tokoh (itu wilayah kunci identitas).
11. DESKRIPSI = AKSI KONKRET tokoh + benda nyata (mis: anak membuka pintu lemari tua yang berdecit, tangan gemetar mengusap baju batik ibu) — BUKAN untaian kata sifat. DILARANG adegan metafora abstrak tanpa aksi nyata.
12. VISUAL_EN bergaya realisme dokumenter sinematik: aksi nyata + benda kunci + ruang nyata yang masuk akal (lemari kayu tua, kamar sempit berdebu, halaman rumah sore hari). Foto beneran yang bisa disyut kamera, bukan ilustrasi mimpi.

Mulai output tepat di bawah MULAI-FORMAT dan akhiri sebelum AKHIR-FORMAT.`;

async function tryGenerate(title: string, keyword: string, niche: string, n: number, attempt: number, naskah: string): Promise<any> {
  let sys = PROLOGUE
    .replace(/\{\{TITLE\}\}/g, String(title||"").slice(0,80).replace(/"/g,"'"))
    .replace(/\{\{KW\}\}/g, String(keyword||"-").slice(0,80).replace(/"/g,"'"))
    .replace(/\{\{NICHE\}\}/g, String(niche||"-").slice(0,80).replace(/"/g,"'"))
    .replace(/\{\{NASKAH\}\}/g, String(naskah||"").slice(0,1500).replace(/"/g,"'") || "(naskah belum ada — bangun alur sebab-akibat murni dari judul & kata kunci)")
    .replace(/\{\{N\}\}/g, String(n));
  if (attempt > 1) {
    sys += "\n\nPERINGATAN KHUSUS: JANGAN PERNAH mengembalikan JSON, array, object, atau kode apapun. Gunakan FORMAT DI ATAS SAJA. Tanda { } [ ] DILARANG sama sekali. Gunakan SCENE_START/SCENE_END marker.";
  }
  const raw = await chat([{ role: "user", content: sys }], undefined);
  return parseStoryboardText(raw, n);
}

function extract(raw: string): string {
  let s = String(raw||"").replace(/```[a-z]*/gi,"").replace(/```/g,"");
  const i1 = s.indexOf("MULAI-FORMAT");
  const i2 = s.lastIndexOf("AKHIR-FORMAT");
  if (i1>=0 && i2>i1) s = s.slice(i1+12, i2);
  else if (i1>=0) s = s.slice(i1+12);
  return s;
}

function getField(block: string, key: string): string {
  const re = new RegExp(`${key}\\s*:\\s*([^\\n]*(?:\\n(?![A-Z_]+(?:_START|:))[^\\n]*)*)`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[1].replace(/"/g, "'").replace(/\s+/g," ").trim();
}

function parseStoryboardText(raw: string, expectedN: number): any {
  const body = extract(raw);
  const out: any = { title:"", style_visual:"cinematic", color_grade:"#a855f7", scenes:[] as any[] };
  const styleMatch = body.match(/STYLE_VISUAL\s*:\s*([^\n]+)/i);
  if (styleMatch) {
    const v = styleMatch[1].trim().toLowerCase().replace(/[^a-z]/g,"");
    if (v) out.style_visual = v;
  }
  const colMatch = body.match(/COLOR\s*:\s*(#[0-9a-fA-F]{6})/);
  if (colMatch) out.color_grade = colMatch[1];
  const titleMatch = body.match(/TITLE\s*:\s*([^\n]+)/i);
  if (titleMatch) out.title = titleMatch[1].trim().slice(0,100);
  const blocks = body.split(/SCENE_START/i).slice(1);
  for (const blk of blocks) {
    const block = blk.split(/SCENE_END/i)[0];
    const no = parseInt(getField(block,"SCENE_NUMBER")) || out.scenes.length+1;
    const desc = getField(block,"DESKRIPPSI").slice(0,300);
    const lyric = getField(block,"LIRIK").slice(0,120);
    const mood = (getField(block,"MOOD").split(/[,\s.]+/)[0]||"calm").toLowerCase().slice(0,20);
    let visual = getField(block,"VISUAL_EN").slice(0,500);
    if (visual.length<10 && desc)
      visual = `Cinematic shot, ${desc.slice(0,200)}, cinematic lighting, 8k, photorealistic, shallow depth of field`;
    if (!desc && !visual) continue;
    out.scenes.push({ scene:no, scene_desc:desc, lyric_line:lyric, visual_prompt:visual, mood });
  }
  if (out.scenes.length===0) throw new Error("Tidak bisa parse adegan, coba lagi.");
  while (out.scenes.length < expectedN) {
    out.scenes.push({...out.scenes[out.scenes.length-1], scene: out.scenes.length+1});
  }
  if (out.scenes.length > expectedN) out.scenes = out.scenes.slice(0,expectedN);
  out.scenes.forEach((s:any,i:number)=>{s.scene=i+1;});
  return out;
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, slides, naskah } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
    const n = Math.max(2, Math.min(12, Number(slides)||4));
    let lastErr: any = null;
    for (let attempt=1; attempt<=3; attempt++){
      try {
        const parsed = await tryGenerate(title, keyword||"", niche||"", n, attempt, naskah||"");
        if (!parsed.scenes || parsed.scenes.length < Math.max(1, n-1)) throw new Error("scene kurang");
        return NextResponse.json(parsed);
      } catch(e:any){ lastErr = e; }
    }
    return NextResponse.json({ error:`Storyboard gagal: ${lastErr?.message||"coba lagi"}` },{status:500});
  } catch(e:any){
    return NextResponse.json({ error:e.message||"Gagal buat storyboard" },{status:500});
  }
}
