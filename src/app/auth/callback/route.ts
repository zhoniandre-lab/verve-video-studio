import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

/** 🔑 /auth/callback — penukar kode login (Google OAuth / link ajaib email) jadi sesi, lalu kembali ke tujuan. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const lanjutMentah = url.searchParams.get("lanjut") || "/bos";
  // anti open-redirect: hanya path internal yang boleh
  const lanjut = lanjutMentah.startsWith("/") && !lanjutMentah.startsWith("//") ? lanjutMentah : "/bos";
  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch (e: any) {
      console.warn("[auth] tukar kode gagal:", e?.message || e);
    }
  }
  return NextResponse.redirect(new URL(lanjut, url.origin));
}
