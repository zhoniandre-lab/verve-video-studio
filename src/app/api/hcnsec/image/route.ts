"use server";
import { NextResponse } from "next/server";
import { generateImage, enhancePrompt, IMAGE_STYLES } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, style, size, prompt: directPrompt, enhance } = await req.json();
    let finalPrompt: string;
    if (directPrompt) {
      finalPrompt = directPrompt;
    } else {
      // auto-enhance prompt via AI untuk hasil "wah"
      const base = `${title || ""} — ${keyword || ""} — ${niche || ""}`.trim();
      finalPrompt = enhance ? await enhancePrompt(base, style) : base;
    }
    // Ambil suffix style
    const styleObj = IMAGE_STYLES.find(s => s.id === style) || IMAGE_STYLES[0];
    const targetSize = size || "1024x1024";
    try {
      const { url, model, size: usedSize, prompt } = await generateImage(finalPrompt, styleObj.suffix, targetSize);
      return NextResponse.json({ url, model, size: usedSize, prompt, styleLabel: styleObj.label });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
