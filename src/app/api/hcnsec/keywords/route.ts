"use server";
import { NextResponse } from "next/server";
import { generateKeywords } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { niche, n } = await req.json();
    const kws = await generateKeywords(niche, Number(n) || 5);
    return NextResponse.json({ keywords: kws });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
