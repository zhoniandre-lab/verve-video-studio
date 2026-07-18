import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

const PROLOGUE = `Kamu penulis skenario video musik. Tugasmu buat storyboard untuk video musik.

JUDUL CERITA: {{TITLE}}
KATA KUNCI: {{KW}}
NICHE: {{NICHE}}
JUMLAH ADEGAN: {{N}}

TULIS OUTPUT SESUAI FORMAT DI BAWAH INI, TEPAT, TANPA CATATAN TAMBAHAN, TANPA BACKTICKS, TANPA KODE, TANPA TANDA KURUNG KURAWAL:

MULAI-FORMAT
STYLE_VISUAL: cinematic
COLOR: #c98872
TITLE: {{TITLE}}
SCENE_START
SCENE_NUMBER: 1
DESKRIPSI: deskripsi detail adegan
LIRIK: satu baris lirik
MOOD: sad
VISUAL_EN: visual prompt english
SCENE_END
AKHIR-FORMAT

Aturan:
- JANGAN gunakan tanda kutip ganda " di dalam teks
- Setiap scene BERBEDA (beda komposisi, setting, pencahayaan)
- Visual harus spesifik (close-up tangan keriput ibu memegang foto)
- Jumlah scene TEPAT {{N}}
- Mulai output tepat setelah MULAI-FORMAT, akhiri sebelum AKHIR-FORMAT`;

async function tryGenerate(title: string, keyword: string, niche: string, n: number, attempt: number): Promise<any> {
  let sys = PROLOGUE
    .replace(/\{\{TITLE\}\}/g, String(title||"").slice(0,80))
    .replace(/\{\{KW\}\}/g, String(keyword||"-").slice(0,80))
    .replace(/\{\{NICHE\}\}/g, String(niche||"-").slice(0,80))
    .replace(/\{\{N\}\}/g, String(n));
  if (attempt > 1) sys += "\n\nPERINGATAN: JANGAN PERNAH mengembalikan JSON, array, atau object. Gunakan FORMAT DI ATAS SAJA dengan SCENE_START/SCENE_END. TANDA { } [ ] DILARANG.";
  const raw = await chat([{ role: "user", content: sys }]);
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
      visual = `Cinematic shot, ${desc.slice(0,200)}, cinematic lighting, 8k, photorealistic`;
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
    const { title, keyword, niche, slides } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
    const n = Math.max(2, Math.min(12, Number(slides)||4));
    let lastErr: any = null;
    for (let attempt=1; attempt<=3; attempt++){
      try {
        const parsed = await tryGenerate(title, keyword||"", niche||"", n, attempt);
        if (!parsed.scenes || parsed.scenes.length < Math.max(1, n-1)) throw new Error("scene kurang");
        return NextResponse.json(parsed);
      } catch(e:any){ lastErr = e; }
    }
    return NextResponse.json({ error:`Storyboard gagal: ${lastErr?.message||"coba lagi"}` },{status:500});
  } catch(e:any){
    return NextResponse.json({ error:e.message||"Gagal buat storyboard" },{status:500});
  }
}
