import { NextResponse } from "next/server";
import { dateDaysAgo, ensureYoutubeAccess, isoDurToSec, setEncryptedTokenCookie, todayDate, ytAuthedGet, youtubeOAuthConfig } from "@/lib/server/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnalyticsRes = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
type VideosRes = { items?: { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: unknown }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string } }[] };

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; }
/**
 * 🐛 FIX v19.0: YouTube Analytics API mengembalikan impressionClickThroughRate
 * sebagai RASIO 0-1 (0.045 = 4.5%), bukan persen. Sebelumnya dipakai mentah →
 * Growth Doctor & otak melihat "CTR 0.045%" padahal aslinya 4.5%.
 * Konversi aman: nilai <= 1 dianggap rasio → ×100. (max 100, min 0)
 */
function ctrToPct(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  let p = n <= 1 ? n * 100 : n;
  p = Math.max(0, Math.min(100, p));
  return Math.round(p * 100) / 100;
}
function trafficLabel(k: string): string {
  const m: Record<string, string> = {
    ADVERTISING: "Iklan",
    ANNOTATION: "Anotasi",
    CAMPAIGN_CARD: "Kartu kampanye",
    END_SCREEN: "End screen",
    EXT_URL: "Eksternal",
    HASHTAGS: "Hashtag",
    NO_LINK_OTHER: "Langsung/tidak diketahui",
    NOTIFICATION: "Notifikasi",
    PLAYLIST: "Playlist",
    PROMOTED: "Promosi",
    RELATED_VIDEO: "Rekomendasi video",
    SHORTS: "Feed Shorts",
    SUBSCRIBER: "Subscription feed",
    YT_CHANNEL: "Halaman channel",
    YT_OTHER_PAGE: "Fitur YouTube lainnya",
    YT_SEARCH: "Penelusuran YouTube",
  };
  return m[k] || k.replace(/_/g, " ").toLowerCase();
}
function trafficKey(k: string): string {
  if (k === "RELATED_VIDEO") return "suggested";
  if (k === "YT_SEARCH") return "search";
  if (k === "NO_LINK_OTHER") return "direct";
  if (k === "YT_OTHER_PAGE" || k === "YT_CHANNEL" || k === "SUBSCRIBER") return "youtubeOther";
  if (k === "EXT_URL") return "external";
  if (k === "SHORTS") return "shorts";
  return "other";
}

async function report(accessToken: string, params: Record<string, string>): Promise<AnalyticsRes> {
  const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return ytAuthedGet<AnalyticsRes>(u.toString(), accessToken);
}

function rowObj(data: AnalyticsRes): Record<string, number | null> {
  const row = data.rows?.[0] || [];
  const out: Record<string, number | null> = {};
  (data.columnHeaders || []).forEach((h, i) => { out[h.name] = num(row[i]); });
  return out;
}

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const auth = await ensureYoutubeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, missing: auth.missing }, { status: auth.status });

  const u = new URL(req.url);
  const videoId = String(u.searchParams.get("videoId") || "").trim();
  if (!/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return NextResponse.json({ ok: false, error: "videoId tidak valid." }, { status: 400 });
  const range = String(u.searchParams.get("range") || "lifetime").toLowerCase();
  const days = Math.max(2, Math.min(90, Number(u.searchParams.get("days") || 28) || 28));
  const explicitStartDate = String(u.searchParams.get("startDate") || "").trim();
  let startDate = explicitStartDate || (range === "lifetime" || range === "since_published" || range === "published" ? "" : dateDaysAgo(days));
  const endDate = String(u.searchParams.get("endDate") || todayDate());

  try {
    let video: Record<string, unknown> | null = null;
    try {
      const vUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      vUrl.searchParams.set("part", "snippet,statistics,contentDetails");
      vUrl.searchParams.set("id", videoId);
      const vd = await ytAuthedGet<VideosRes>(vUrl.toString(), auth.accessToken);
      const v = vd.items?.[0];
      if (v) video = {
        id: v.id,
        title: v.snippet?.title || "Video YouTube",
        publishedAt: v.snippet?.publishedAt || "",
        durationSec: isoDurToSec(v.contentDetails?.duration),
        viewCount: Number(v.statistics?.viewCount || 0),
        likeCount: Number(v.statistics?.likeCount || 0),
        commentCount: Number(v.statistics?.commentCount || 0),
        thumbnails: v.snippet?.thumbnails || null,
        url: `https://www.youtube.com/watch?v=${v.id}`,
      };
    } catch { /* metadata publik opsional */ }

    if (!startDate) {
      const pub = typeof video?.publishedAt === "string" ? video.publishedAt.slice(0, 10) : "";
      startDate = pub || dateDaysAgo(3650);
    }
    const effectiveDays = Math.max(1, Math.round((+new Date(endDate) - +new Date(startDate)) / 864e5) + 1 || days);
    const base = { ids: "channel==MINE", startDate, endDate, filters: `video==${videoId}` };
    const main = rowObj(await report(auth.accessToken, {
      ...base,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained",
    }));

    let impressionWarn = "Impressions/CTR Studio belum tersedia dari report ini.";
    try {
      const imp = rowObj(await report(auth.accessToken, { ...base, metrics: "impressions,impressionClickThroughRate" }));
      if (imp.impressions != null) main.impressions = imp.impressions;
      if (imp.impressionClickThroughRate != null) main.impressionClickThroughRate = imp.impressionClickThroughRate;
      impressionWarn = "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      impressionWarn = /unknown identifier|impressions/i.test(msg)
        ? "Impressions/CTR belum disediakan YouTube Analytics API untuk report ini. Pakai screenshot Studio/CSV untuk angka Impressions dan CTR."
        : `Impressions/CTR tidak tersedia: ${msg || "report ditolak"}`;
    }

    let traffic: { key: string; rawKey: string; label: string; views: number; pct: number }[] = [];
    try {
      const tr = await report(auth.accessToken, {
        ...base,
        dimensions: "insightTrafficSourceType",
        metrics: "views",
        sort: "-views",
        maxResults: "8",
      });
      const total = (tr.rows || []).reduce((a, r) => a + (Number(r[1]) || 0), 0) || 0;
      traffic = (tr.rows || []).map((r) => {
        const raw = String(r[0] || "");
        const views = Number(r[1] || 0);
        return { key: trafficKey(raw), rawKey: raw, label: trafficLabel(raw), views, pct: total ? Math.round((views / total) * 1000) / 10 : 0 };
      }).filter((x) => x.views > 0);
    } catch { /* traffic opsional */ }

    const publicViews = typeof video?.viewCount === "number" ? Number(video.viewCount) : null;
    const analyticsViews = main.views ?? null;
    const chosenViews = publicViews != null && analyticsViews != null && publicViews > analyticsViews ? publicViews : (analyticsViews ?? publicViews);
    const metrics = {
      views: chosenViews ?? null,
      analyticsViews,
      publicViews,
      estimatedMinutesWatched: main.estimatedMinutesWatched ?? null,
      avgViewSec: main.averageViewDuration ?? null,
      averageViewPercentage: main.averageViewPercentage ?? null,
      likes: main.likes ?? null,
      comments: main.comments ?? null,
      subscribersGained: main.subscribersGained ?? null,
      impressions: main.impressions ?? null,
      ctrPct: ctrToPct(main.impressionClickThroughRate),
    };
    const body = {
      ok: true,
      videoId,
      video,
      dateRange: { startDate, endDate, days: effectiveDays, range: startDate === explicitStartDate ? "custom" : range },
      metrics,
      traffic,
      warnings: [impressionWarn].filter(Boolean),
      metricMeanings: { averageViewPercentage: "Rata-rata persentase ditonton / average viewed, bukan retention 30 detik spesifik.", views: "Jika public view YouTube lebih baru daripada Analytics finalized, VERVE memakai public view agar lebih dekat ke Studio/realtime." },
      honesty: "Data ini dibaca via YouTube Analytics API read-only. Tidak melakukan aksi apa pun ke channel.",
    };
    const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    if (auth.refreshed) setEncryptedTokenCookie(res, auth.refreshed, cfg.cookieSecret);
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Gagal membaca YouTube Analytics." }, { status: 500 });
  }
}
