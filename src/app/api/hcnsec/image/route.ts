"use server";
import { NextResponse } from "next/server";
import { generateImage, IMAGE_STYLES } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, style } = await req.json();
    const styleObj = IMAGE_STYLES.find(s => s.id === style) || IMAGE_STYLES[0];
    const base = `${title || ""} ${keyword || ""} ${niche || ""}`.trim();
    try {
      const { url, model, size: usedSize, prompt } = await generateImage(base, styleObj.suffix);
      return NextResponse.json({ url, model, size: usedSize, prompt, styleLabel: styleObj.label });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
