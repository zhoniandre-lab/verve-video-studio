import { NextResponse } from "next/server";
import { clearYoutubeCookies, readStoredToken, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const token = cfg.configured ? readStoredToken(req, cfg.cookieSecret) : null;
  if (token?.access_token) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.access_token)}`, { method: "POST", signal: AbortSignal.timeout(8_000) }); } catch { /* tetap hapus cookie */ }
  }
  const res = NextResponse.json({ ok: true, disconnected: true });
  clearYoutubeCookies(res);
  return res;
}
