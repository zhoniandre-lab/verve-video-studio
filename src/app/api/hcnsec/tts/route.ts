"use server";
import { NextResponse } from "next/server";
import { generateSpeech } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { text, voice } = await req.json();
    const dataUrl = await generateSpeech(text, voice || "alloy");
    return NextResponse.json({ url: dataUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
