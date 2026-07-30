import { NextResponse } from "next/server";
import { ensureYoutubeAccess, isoDurToSec, setEncryptedTokenCookie, ytAuthedGet, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChannelsRes = { items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } }; statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
type PlaylistItemsRes = { items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string }; snippet?: { title?: string; publishedAt?: string; thumbnails?: unknown } }[] };
type VideosRes = { items?: { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: unknown }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string } }[] };

function asNum(v: unknown): number { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const auth = await ensureYoutubeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, missing: auth.missing }, { status: auth.status });
  try {
    const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    chUrl.searchParams.set("part", "snippet,statistics,contentDetails");
    chUrl.searchParams.set("mine", "true");
    const ch = await ytAuthedGet<ChannelsRes>(chUrl.toString(), auth.accessToken);
    const channel = ch.items?.[0];
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads || "";
    let videos: unknown[] = [];
    if (uploads) {
      const plUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      plUrl.searchParams.set("part", "snippet,contentDetails");
      plUrl.searchParams.set("playlistId", uploads);
      plUrl.searchParams.set("maxResults", "10");
      const pl = await ytAuthedGet<PlaylistItemsRes>(plUrl.toString(), auth.accessToken);
      const ids = (pl.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean).join(",");
      if (ids) {
        const vUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        vUrl.searchParams.set("part", "snippet,statistics,contentDetails");
        vUrl.searchParams.set("id", ids);
        const vd = await ytAuthedGet<VideosRes>(vUrl.toString(), auth.accessToken);
        videos = (vd.items || []).map((v) => ({
          id: v.id,
          title: v.snippet?.title || "Video tanpa judul",
          publishedAt: v.snippet?.publishedAt || "",
          durationSec: isoDurToSec(v.contentDetails?.duration),
          viewCount: asNum(v.statistics?.viewCount),
          likeCount: asNum(v.statistics?.likeCount),
          commentCount: asNum(v.statistics?.commentCount),
          thumbnails: v.snippet?.thumbnails || null,
          url: `https://www.youtube.com/watch?v=${v.id}`,
        }));
      }
    }
    const body = {
      ok: true,
      channel: channel ? {
        id: channel.id,
        title: channel.snippet?.title || "Channel YouTube",
        thumbnail: channel.snippet?.thumbnails?.default?.url || "",
        subscriberCount: asNum(channel.statistics?.subscriberCount),
        videoCount: asNum(channel.statistics?.videoCount),
        viewCount: asNum(channel.statistics?.viewCount),
      } : auth.token.channel || null,
      videos,
      honesty: "Route ini hanya memakai scope read-only. Tidak bisa mengubah/menghapus channel.",
    };
    const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    if (auth.refreshed) setEncryptedTokenCookie(res, auth.refreshed, cfg.cookieSecret);
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Gagal membaca channel YouTube." }, { status: 500 });
  }
}
