import { NextResponse } from "next/server";
import { exchangeCodeForToken, parseCookieHeader, setEncryptedTokenCookie, signState, ytAuthedGet, YT_STATE_COOKIE, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChannelResponse = { items?: { id?: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[] };

function finishRedirect(req: Request, msg: string) {
  const u = new URL(req.url);
  return `${u.origin}/?yt=${encodeURIComponent(msg)}`;
}

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const u = new URL(req.url);
  const err = u.searchParams.get("error");
  if (err) return NextResponse.redirect(finishRedirect(req, `oauth_error_${err}`));
  if (!cfg.configured) return NextResponse.json({ ok: false, error: "YouTube OAuth belum dikonfigurasi.", missing: cfg.missing }, { status: 500 });

  const code = String(u.searchParams.get("code") || "");
  const state = String(u.searchParams.get("state") || "");
  const stateCookie = parseCookieHeader(req)[YT_STATE_COOKIE] || "";
  const [savedState, savedSig] = stateCookie.split(".");
  if (!code || !state || !savedState || state !== savedState || savedSig !== signState(savedState, cfg.cookieSecret)) {
    return NextResponse.json({ ok: false, error: "State OAuth tidak valid. Coba hubungkan ulang." }, { status: 400 });
  }

  try {
    const token = await exchangeCodeForToken(code, cfg);
    const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    chUrl.searchParams.set("part", "snippet");
    chUrl.searchParams.set("mine", "true");
    const ch = await ytAuthedGet<ChannelResponse>(chUrl.toString(), token.access_token);
    const item = ch.items?.[0];
    if (item?.id) token.channel = { id: item.id, title: item.snippet?.title || "Channel YouTube", thumbnail: item.snippet?.thumbnails?.default?.url || "" };

    const res = NextResponse.redirect(finishRedirect(req, "connected"));
    setEncryptedTokenCookie(res, token, cfg.cookieSecret);
    res.cookies.set(YT_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Gagal menghubungkan YouTube." }, { status: 500 });
  }
}
