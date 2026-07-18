"use server";
import { NextResponse } from "next/server";
import { generateMetadata } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { title, keyword, niche } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul wajib" }, { status: 400 });
    const meta = await generateMetadata(title, keyword || "", niche || "");
    return NextResponse.json(meta);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate metadata" }, { status: e.status || 500 });
  }
}
