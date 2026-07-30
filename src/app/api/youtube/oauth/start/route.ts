import { NextResponse } from "next/server";
import crypto from "crypto";
import { signState, YT_SCOPES, YT_STATE_COOKIE, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  if (!cfg.configured) {
    return NextResponse.json({ ok: false, error: "YouTube OAuth belum dikonfigurasi.", missing: cfg.missing }, { status: 500 });
  }
  const state = crypto.randomBytes(24).toString("hex");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YT_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "false");
  u.searchParams.set("state", state);

  const res = NextResponse.redirect(u.toString());
  res.cookies.set(YT_STATE_COOKIE, `${state}.${signState(state, cfg.cookieSecret)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
