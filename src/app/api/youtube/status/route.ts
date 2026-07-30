import { NextResponse } from "next/server";
import { ensureYoutubeAccess, setEncryptedTokenCookie, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const auth = await ensureYoutubeAccess(req);
  const body = {
    configured: cfg.configured,
    missing: cfg.missing,
    connected: auth.ok,
    readonly: true,
    scopes: ["youtube.readonly", "yt-analytics.readonly"],
    channel: auth.ok ? auth.token.channel || null : null,
    expiresAt: auth.ok ? auth.token.expires_at : null,
    error: auth.ok ? "" : auth.error,
  };
  const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  if (auth.ok && auth.refreshed) setEncryptedTokenCookie(res, auth.refreshed, cfg.cookieSecret);
  return res;
}
