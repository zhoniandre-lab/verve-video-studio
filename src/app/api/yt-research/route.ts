import { NextResponse } from "next/server";

/**
 * GET /api/yt-research?q=cerita%20jadi%20lagu&region=ID&lang=id&max=25&order=relevance
 * Riset kompetitor — YouTube Data API v3 (search → videos → channels).
 * Butuh env server: YOUTUBE_API_KEY (JANGAN pernah diekspos ke client).
 *
 * Kuota: search.list ~100 unit + videos.list ~1 + channels.list ~1.
 * Kuota gratis ~10.000 unit/hari → ±90 riset/hari.
 * Diport dari YIE youtube.js — otak TETAP di client (yie-score.ts),
 * route ini cuma kurir data mentah yang jujur.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_ORDER = new Set(["relevance", "viewCount", "rating", "date", "videoCount", "title"]);

function clampInt(n: string | null, min: number, max: number, fallback: number): number {
  const x = parseInt(n || "", 10);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

/** ISO8601 duration (PT1H2M10S) → detik */
function isoDurToSec(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + +(m[3] || 0);
}

class YtError extends Error {
  status: number;
  data?: unknown;
  constructor(msg: string, status: number, data?: unknown) {
    super(msg);
    this.status = status;
    this.data = data;
  }
}

async function ytGet(path: string, params: Record<string, string | number>, key: string) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  u.searchParams.set("key", key);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(u.toString(), { signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `YouTube API HTTP ${r.status}`;
      throw new YtError(msg, r.status, data);
    }
    return data;
  } finally {
    clearTimeout(to);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(req: Request) {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return NextResponse.json(
        {
          error: "missing_api_key",
          message:
            "YOUTUBE_API_KEY belum diset di server (Vercel → Settings → Environment Variables). Set lalu Redeploy.",
        },
        { status: 500, headers: CORS }
      );
    }

    const { searchParams: sp } = new URL(req.url);
    const keyword = String(sp.get("q") || sp.get("keyword") || "").trim();
    if (!keyword) {
      return NextResponse.json({ error: "Parameter q wajib diisi." }, { status: 400, headers: CORS });
    }

    const region = String(sp.get("region") || "ID").toUpperCase();
    const language = String(sp.get("lang") || sp.get("hl") || "id");
    const maxResults = clampInt(sp.get("max") || sp.get("maxResults"), 1, 50, 25);
    const orderRaw = String(sp.get("order") || "relevance");
    const order = VALID_ORDER.has(orderRaw) ? orderRaw : "relevance";
    const publishedAfter = String(sp.get("publishedAfter") || "").trim(); // ISO date opsional

    const searchParams: Record<string, string | number> = {
      part: "snippet",
      type: "video",
      q: keyword,
      maxResults,
      order,
      relevanceLanguage: language,
    };
    if (region && region !== "GLOBAL") searchParams.regionCode = region;
    if (publishedAfter) searchParams.publishedAfter = publishedAfter;

    const search = await ytGet("search", searchParams, key);
    const ids: string[] = (search.items || [])
      .map((it: { id?: { videoId?: string } }) => it?.id?.videoId)
      .filter(Boolean);

    if (!ids.length) {
      return NextResponse.json(
        {
          query: { keyword, region, language, order, maxResults },
          fetchedAt: new Date().toISOString(),
          pageInfo: search.pageInfo || { totalResults: 0, resultsPerPage: 0 },
          quotaCostEstimate: "search.list ~100 unit",
          videos: [],
        },
        { status: 200, headers: { ...CORS, "Cache-Control": "no-store" } }
      );
    }

    const videosData = await ytGet(
      "videos",
      { part: "snippet,statistics,contentDetails", id: ids.join(",") },
      key
    );

    const channelIds: string[] = [
      ...new Set(
        (videosData.items || [])
          .map((v: { snippet?: { channelId?: string } }) => v?.snippet?.channelId)
          .filter(Boolean) as string[]
      ),
    ];

    const channelMap: Record<
      string,
      { id: string; title: string; publishedAt: string; subscriberCount: number; hiddenSubscriberCount: boolean; videoCount: number; viewCount: number }
    > = {};
    if (channelIds.length) {
      const channels = await ytGet(
        "channels",
        { part: "snippet,statistics", id: channelIds.join(",") },
        key
      );
      (channels.items || []).forEach((c: {
        id: string;
        snippet?: { title?: string; publishedAt?: string };
        statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string; viewCount?: string };
      }) => {
        channelMap[c.id] = {
          id: c.id,
          title: c.snippet?.title || "",
          publishedAt: c.snippet?.publishedAt || "",
          subscriberCount: Number(c.statistics?.subscriberCount || 0),
          hiddenSubscriberCount: !!c.statistics?.hiddenSubscriberCount,
          videoCount: Number(c.statistics?.videoCount || 0),
          viewCount: Number(c.statistics?.viewCount || 0),
        };
      });
    }

    type RawV = {
      id: string;
      snippet?: {
        title?: string; description?: string; publishedAt?: string;
        channelId?: string; channelTitle?: string; thumbnails?: unknown;
      };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    };

    const videos = (videosData.items || []).map((v: RawV) => {
      const sn = v.snippet || {};
      const st = v.statistics || {};
      const ch = channelMap[sn.channelId || ""] || {
        id: sn.channelId || "",
        title: sn.channelTitle || "",
        subscriberCount: 0,
        hiddenSubscriberCount: false,
        videoCount: 0,
        viewCount: 0,
      };
      const durationSec = isoDurToSec(v.contentDetails?.duration);
      const ageDays = Math.max(1, Math.round((Date.now() - +new Date(sn.publishedAt || "")) / 864e5) || 365);
      return {
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: sn.title || "",
        publishedAt: sn.publishedAt || "",
        channelId: sn.channelId || "",
        channelTitle: sn.channelTitle || ch.title || "",
        channel: ch,
        viewCount: Number(st.viewCount || 0),
        likeCount: Number(st.likeCount || 0),
        commentCount: Number(st.commentCount || 0),
        duration: v.contentDetails?.duration || "",
        durationSec,
        ageDays,
        viewsPerDay: Math.round((Number(st.viewCount || 0) / ageDays) * 100) / 100,
      };
    });

    return NextResponse.json(
      {
        query: { keyword, region, language, order, maxResults },
        fetchedAt: new Date().toISOString(),
        pageInfo: search.pageInfo || { totalResults: videos.length, resultsPerPage: videos.length },
        quotaCostEstimate: "search.list ~100 unit + videos.list 1 unit + channels.list 1 unit",
        honesty: "AVD/CTR/thumbnail-demografi kompetitor TIDAK tersedia di API publik — otak hanya menghitung dari angka yang nyata.",
        videos,
      },
      { status: 200, headers: { ...CORS, "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const err = e as YtError;
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const quota = status === 403;
    return NextResponse.json(
      {
        error: quota ? "quota_exceeded" : "upstream_error",
        message: err.message || String(e),
        hint: quota ? "Kuota harian YouTube API habis. Reset tiap ~15:00 WIB (midnight Pacific). Coba lagi nanti." : undefined,
        details: (err.data as { error?: unknown } | undefined)?.error || undefined,
      },
      { status, headers: CORS }
    );
  }
}
