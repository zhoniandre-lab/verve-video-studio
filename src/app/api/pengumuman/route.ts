import { NextResponse } from "next/server";
import { getSetelan } from "../../../lib/setelan";

/** 📢 /api/pengumuman — publik: teks banner dari bos ("" = tak ada). Dibaca banner di layout. */
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSetelan();
  return NextResponse.json({ teks: s.pengumuman || "" }, { headers: { "Cache-Control": "no-store" } });
}
