"use server";
import { NextResponse } from "next/server";
import { generateImage, generateImagePrompt } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, style, size, prompt: directPrompt } = await req.json();
    const prompt = directPrompt || (await generateImagePrompt(title, keyword, niche, style || "cinematic photo"));
    const url = await generateImage(prompt, size || "1024x1024");
    return NextResponse.json({ url, prompt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
