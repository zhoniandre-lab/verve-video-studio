"use server";
import { NextResponse } from "next/server";
import { generateImage, generateImagePrompt } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, style, size, prompt: directPrompt } = await req.json();
    const prompt = directPrompt || (await generateImagePrompt(title, keyword, niche, style || "cinematic photo"));
    const targetSize = size || "1024x1024";
    try {
      const { url, model: usedModel, size: usedSize } = await generateImage(prompt, targetSize);
      return NextResponse.json({ url, prompt, model: usedModel, size: usedSize });
    } catch (e: any) {
      return NextResponse.json({ error: e.message, prompt }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
