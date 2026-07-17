"use server";
import { NextResponse } from "next/server";
import { generateTitles } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { keyword, niche, n } = await req.json();
    const titles = await generateTitles(keyword, niche, Number(n) || 3);
    return NextResponse.json({ titles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
