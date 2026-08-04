import { NextResponse } from "next/server";
import {
  dateDaysAgo,
  ensureYoutubeAccess,
  isoDurToSec,
  setEncryptedTokenCookie,
  todayDate,
  ytAuthedGet,
  youtubeOAuthConfig,
} from "@/lib/server/youtube-oauth";

/**
 * 🔄 VERVE FEEDBACK LOOP v19.0 — OTAK BELAJAR SENDIRI DARI YOUTUBE (read-only).
 *
 * Kenapa ada: learningBoostV2 cuma pintar kalau brain.results diisi angka asli.
 * Dulu harus input CTR manual / export CSV — repot, jadi jarang diisi, otak lapar.
 * Sekarang: app tinggal panggil route ini, otak langsung "makan" data performa
 * video channel (views, AVD, likes, comments + impressions/CTR yang tersedia),
 * lalu klien menggabungkannya ke BrainMemory. Tanpa sentuh YouTube Studio.
 *
 * Alur: token → playlist uploads → detail video → 1 laporan analytics grup
 * (semua video, rentang hari) → impressions/CTR per video HANYA untuk video
 * terbaru (best-effort, concurrency dibatasi) → baris BrainResult[].
 *
 * Prinsip: tidak pernah menulis/mengubah apa pun ke channel. Read-only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_VIDEOS = 50; // video terbaru yang diambil
const MAX_IMPRESSION_CALLS = 8; // impressions/CTR mahal (1 panggilan/video) — batasi
const CONCURRENCY = 3;

type AnalyticsRes = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
type ChannelsRes = { items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
type PlaylistItemsRes = { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string };
type VideosRes = {
  items?: {
    id?: string;
    snippet?: { title?: string; publishedAt?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }[];
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * YouTube Analytics API mengembalikan impressionClickThroughRate sebagai RASIO 0-1
 * (0.045 = 4.5%). Simpan sebagai PERSEN untuk learningBoostV2 (yang mengharapkan
 * CTR dalam %). Heuristik aman: kalau nilainya <= 1, anggap rasio lalu ×100.
 */
function ctrToPct(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  let p = n <= 1 ? n * 100 : n;
  p = Math.max(0, Math.min(100, p));
  return Math.round(p * 100) / 100;
}

async function report(accessToken: string, params: Record<string, string>): Promise<AnalyticsRes> {
  const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return ytAuthedGet<AnalyticsRes>(u.toString(), accessToken);
}

export async function GET(req: Request) {
  const cfg = youtubeOAuthConfig(req);
  const auth = await ensureYoutubeAccess(req);
  if (!auth.ok)
    return NextResponse.json({ ok: false, error: auth.error, missing: auth.missing }, { status: auth.status });

  const u = new URL(req.url);
  const days = Math.max(14, Math.min(365, Number(u.searchParams.get("days") || 90) || 90));
  const limit = Math.max(5, Math.min(MAX_VIDEOS, Number(u.searchParams.get("limit") || MAX_VIDEOS)));
  const withImpressions = u.searchParams.get("impressions") !== "0";
  const accessToken = auth.accessToken; // sudah dipastikan ada (auth.ok)

  try {
    /* 1) Playlist uploads channel */
    const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    chUrl.searchParams.set("part", "contentDetails");
    chUrl.searchParams.set("mine", "true");
    const ch = await ytAuthedGet<ChannelsRes>(chUrl.toString(), accessToken);
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads)
      return NextResponse.json({ ok: false, error: "Playlist uploads channel tidak ditemukan." }, { status: 500 });

    /* 2) Kumpulkan id video terbaru (maks 50) */
    const ids: string[] = [];
    let pageToken = "";
    do {
      const plUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      plUrl.searchParams.set("part", "contentDetails");
      plUrl.searchParams.set("playlistId", uploads);
      plUrl.searchParams.set("maxResults", "50");
      if (pageToken) plUrl.searchParams.set("pageToken", pageToken);
      const pl = await ytAuthedGet<PlaylistItemsRes>(plUrl.toString(), accessToken);
      (pl.items || []).forEach((x) => {
        const id = x.contentDetails?.videoId;
        if (id && !ids.includes(id)) ids.push(id);
      });
      pageToken = pl.nextPageToken || "";
    } while (pageToken && ids.length < limit);
    const recent = ids.slice(0, limit);

    /* 3) Detail video: judul, waktu publish, durasi, statistik publik */
    const videos: Record<string, { title: string; publishedAt: string; durationSec: number; views: number; likes: number; comments: number }> = {};
    for (let i = 0; i < recent.length; i += 50) {
      const chunk = recent.slice(i, i + 50);
      const vUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      vUrl.searchParams.set("part", "snippet,statistics,contentDetails");
      vUrl.searchParams.set("id", chunk.join(","));
      const vd = await ytAuthedGet<VideosRes>(vUrl.toString(), accessToken);
      (vd.items || []).forEach((v) => {
        if (!v.id) return;
        videos[v.id] = {
          title: v.snippet?.title || "Video tanpa judul",
          publishedAt: v.snippet?.publishedAt || "",
          durationSec: isoDurToSec(v.contentDetails?.duration),
          views: Number(v.statistics?.viewCount || 0),
          likes: Number(v.statistics?.likeCount || 0),
          comments: Number(v.statistics?.commentCount || 0),
        };
      });
    }

    /* 4) Satu laporan analytics GRUP: semua video dalam rentang (cepat, 1 panggilan) */
    const startDate = dateDaysAgo(days);
    const endDate = todayDate();
    const perVideo: Record<string, { views?: number | null; avd?: number | null; likes?: number | null; comments?: number | null }> = {};
    try {
      const g = await report(accessToken, {
        ids: "channel==MINE",
        startDate,
        endDate,
        dimensions: "video",
        metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments",
        sort: "-views",
        maxResults: String(Math.min(200, recent.length + 10)),
      });
      const idx: Record<string, number> = {};
      (g.columnHeaders || []).forEach((h, i) => (idx[h.name] = i));
      (g.rows || []).forEach((r) => {
        const id = String(r[idx.video] || "");
        if (!id || !videos[id]) return;
        perVideo[id] = {
          views: num(r[idx.views]),
          avd: num(r[idx.averageViewDuration]),
          likes: num(r[idx.likes]),
          comments: num(r[idx.comments]),
        };
      });
    } catch {
      /* laporan grup gagal (channel baru/0 data) → tetap lanjut pakai statistik publik */
    }

    /* 5) Impressions + CTR per video — HANYA video terbaru, concurrency 3, best-effort */
    const impressionsMap: Record<string, { impressions?: number | null; ctrPct?: number | null }> = {};
    const targets = withImpressions ? recent.slice(0, MAX_IMPRESSION_CALLS) : [];
    let qi = 0;
    async function worker() {
      while (qi < targets.length) {
        const id = targets[qi++];
        try {
          const imp = await report(accessToken, {
            ids: "channel==MINE",
            startDate,
            endDate,
            filters: `video==${id}`,
            metrics: "impressions,impressionClickThroughRate",
          });
          const row = imp.rows?.[0] || [];
          const cols: Record<string, number | null> = {};
          (imp.columnHeaders || []).forEach((h, i) => (cols[h.name] = num(row[i])));
          impressionsMap[id] = { impressions: cols.impressions ?? null, ctrPct: ctrToPct(cols.impressionClickThroughRate) };
        } catch {
          /* impressions tidak tersedia untuk video ini (normal: video baru / belum dapat traffic rekomendasi) */
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    /* 6) Susun baris BrainResult — format sama dengan lapor performa manual:
          { title, ctr, impressions, avdSec, time } + info ekstra untuk UI
          (v19.3: velocity & proyeksi linear — bahan Deep Dive) */
    const rows = recent
      .map((id) => {
        const v = videos[id];
        if (!v) return null;
        const a = perVideo[id] || {};
        const im = impressionsMap[id] || {};
        const views = a.views ?? v.views ?? 0;
        const ts = v.publishedAt ? +new Date(v.publishedAt) : Date.now();
        const ageDays = Math.max(0.5, (Date.now() - ts) / 864e5);
        const velocity = views > 0 ? Math.round((views / ageDays) * 10) / 10 : null;
        return {
          title: v.title,
          ctr: im.ctrPct ?? "",
          impressions: im.impressions ?? "",
          avdSec: a.avd != null ? Math.round(a.avd * 10) / 10 : "",
          time: ts, // anchor umur video utk time-decay otak
          videoId: id,
          url: `https://www.youtube.com/watch?v=${id}`,
          views,
          likes: a.likes ?? v.likes ?? 0,
          comments: a.comments ?? v.comments ?? 0,
          durationSec: v.durationSec,
          publishedAt: v.publishedAt,
          uploadHour: v.publishedAt ? new Date(v.publishedAt).getHours() : null,
          uploadDay: v.publishedAt ? new Date(v.publishedAt).getDay() : null,
          velocity, // 🔮 view/hari — bahan analisis Deep Dive
          proyeksi30: velocity != null ? Math.round(velocity * 30) : null, // estimasi linear kasar
          proyeksi90: velocity != null ? Math.round(velocity * 90) : null,
          source: "youtube-auto",
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const res = NextResponse.json(
      {
        ok: true,
        days,
        count: rows.length,
        withCtr: rows.filter((r) => r.ctr !== "" && r.ctr != null).length,
        rows,
        warnings: [
          "Impressions/CTR hanya tersedia YouTube untuk video yang sudah mendapat traffic rekomendasi — lewat API pun tidak selalu keluar. Bagian itu best-effort; views/AVD/likes selalu lebih pasti.",
        ],
        honesty: "Data dibaca read-only via YouTube Analytics API resmi. Tidak ada aksi apa pun ke channel.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    if (auth.refreshed) setEncryptedTokenCookie(res, auth.refreshed, cfg.cookieSecret);
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Gagal sync otak dari YouTube." },
      { status: 500 }
    );
  }
}
