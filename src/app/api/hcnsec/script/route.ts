"use server";
import { NextResponse } from "next/server";
import { generateScript } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, slides } = await req.json();
    const lines = await generateScript(title, keyword, Number(slides) || 4);
    return NextResponse.json({ lines });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
