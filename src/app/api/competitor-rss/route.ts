import { NextResponse } from "next/server";
import { channelNameFromPage, extractChannelId, parseYtRss, parseYtVideosPage, type KompFeed } from "@/lib/brain/competitor-rss";

/**
 * 🛰️ VERVE KOMPETITOR RSS v19.6 — proxy RSS publik YouTube (gratis, tanpa API key).
 * GET  /api/competitor-rss?ids=UC1|UC2  → scan upload terbaru tiap channel (cache 10 mnt)
 * POST /api/competitor-rss              → resolve URL channel (@handle /c/ /channel/) → ID
 *
 * 🛟 v19.8.2: RSS YouTube kadang 404 untuk sebagian channel (quirk YouTube).
 * Kalau RSS gagal → FALLBACK: scrap halaman /videos channel (ytInitialData,
 * compactVideoRenderer) — tetap tanpa API key.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 10 * 60 * 1000;
const MAX_CHANNELS = 6;
const UA = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120 Mobile";
let cache: { at: number; key: string; body: unknown } | null = null;

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Ambil upload terbaru: RSS dulu, kalau gagal → scrap halaman /videos. */
async function ambilUploadChannel(id: string): Promise<KompFeed> {
  // 1) RSS — cepat & ringan
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    const name = (xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || "";
    return { channelId: id, channelName: name || undefined, items: parseYtRss(xml, 8), source: "rss" };
  } catch (e) {
    const rssErr = e instanceof Error ? e.message : "RSS gagal";
    // 2) Fallback: halaman /videos (RSS 404 untuk sebagian channel)
    try {
      const html = await fetchText(`https://www.youtube.com/channel/${id}/videos`, 18_000);
      const items = parseYtVideosPage(html, 8);
      const name = channelNameFromPage(html) || undefined;
      if (items.length) {
        return { channelId: id, channelName: name, items, source: "scrape", note: "RSS tidak tersedia untuk channel ini — pakai fallback halaman." };
      }
      return { channelId: id, channelName: name, items: [], source: "scrape", error: `Belum ada video terbaca (RSS: ${rssErr})` };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : "Fallback gagal";
      const friendly = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|429/i.test(`${rssErr} ${msg2}`)
        ? "Koneksi ke YouTube gagal/diblokir — coba lagi nanti."
        : `${rssErr}`;
      return { channelId: id, items: [], source: "rss", error: friendly };
    }
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const raw = String(u.searchParams.get("ids") || "");
  const ids = raw.split("|").map((s) => s.trim()).filter((s) => /^UC[\w-]{22}$/.test(s)).slice(0, MAX_CHANNELS);
  if (!ids.length) return NextResponse.json({ ok: false, error: "ids tidak valid (butuh UC... channel ID)." }, { status: 400 });

  const key = ids.join("|");
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < TTL) {
    return NextResponse.json(cache.body, { headers: { "Cache-Control": "no-store" } });
  }

  const feeds: KompFeed[] = await Promise.all(ids.map((id) => ambilUploadChannel(id)));

  const body = {
    ok: true,
    count: feeds.filter((f) => f.items.length).length,
    feeds,
    note: "Data dari RSS publik YouTube + fallback halaman (read-only, tanpa kuota API). Cache 10 menit.",
  };
  cache = { at: now, key, body };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let url = "";
  try {
    const j = await req.json();
    url = String(j?.url || "").trim();
  } catch { /* body rusak */ }
  if (!url) return NextResponse.json({ ok: false, error: "Kasih URL channel YouTube-nya." }, { status: 400 });

  const direct = extractChannelId(url);
  if (direct) {
    return NextResponse.json({ ok: true, channelId: direct, name: "", resolved: true });
  }
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    return NextResponse.json({ ok: false, error: "Bukan URL YouTube — tempel link channel (contoh: youtube.com/@nama)." }, { status: 400 });
  }
  const isVideo = /(watch\?v=|youtu\.be\/|shorts\/)/i.test(url);
  // 🐛 FIX: jangan concat URL — youtu.be bukan youtube.com, dulu jadi URL rusak
  const fullUrl = /youtube\.com|youtu\.be/i.test(url) ? url : `https://www.youtube.com${url}`;

  // 🧭 v19.8: link video → coba oEmbed RESMI dulu (ringan, jarang diblokir, langsung
  // kasih nama channel + URL channel). Jauh lebih andal daripada scrap halaman video.
  if (isVideo) {
    try {
      const oe = new URL("https://www.youtube.com/oembed");
      oe.searchParams.set("url", url);
      oe.searchParams.set("format", "json");
      const r = await fetch(oe.toString(), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const data = await r.json();
        const authorUrl = String(data?.author_url || "");
        const name = String(data?.author_name || "").trim();
        const idM = authorUrl.match(/\/channel\/(UC[\w-]{22})/);
        if (idM) return NextResponse.json({ ok: true, channelId: idM[1], name, resolved: true });
        if (/youtube\.com\/@/.test(authorUrl)) {
          // author_url berupa @handle → resolve lewat halaman handle (ringan)
          try {
            const html = await fetchText(authorUrl, 15_000);
            const m = html.match(/"externalId":"(UC[\w-]{22})"/);
            if (m) return NextResponse.json({ ok: true, channelId: m[1], name, resolved: true });
          } catch {
            return NextResponse.json(
              { ok: false, error: "Channel pemilik video ketemu tapi gagal di-resolve — coba tempel link youtube.com/channel/UC... langsung." },
              { status: 502 }
            );
          }
        }
      } else {
        return NextResponse.json(
          { ok: false, error: "Video tidak ditemukan (private/dihapus?). Tempel link channel langsung: youtube.com/@nama atau /channel/UC..." },
          { status: 404 }
        );
      }
    } catch { /* oEmbed gagal → lanjut scrap halaman */ }
  }

  try {
    // Resolve @handle /c/ /user/ ATAU halaman video → channel ID dari HTML (tanpa API key).
    // Halaman video juga memuat "channelId":"UC..." milik pemilik video.
    const html = await fetchText(fullUrl, 15_000);
    const m = html.match(/"externalId":"(UC[\w-]{22})"/)
      || html.match(/"channelId":"(UC[\w-]{22})"/)
      || html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)
      || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/);
    // Nama channel: di halaman video ada "ownerChannelName"; @handle pakai og:title.
    const nameM = html.match(/"ownerChannelName":"([^"]+)"/)
      || html.match(/"author":"([^"]+)"/)
      || html.match(/<meta property="og:title" content="([^"]+)"/);
    if (!m) {
      return NextResponse.json(
        {
          ok: false,
          error: isVideo
            ? "Link video ketemu, tapi channel pemiliknya tidak terbaca — coba tempel link youtube.com/channel/UC... atau youtube.com/@nama langsung."
            : "Gagal resolve channel ID — coba pakai link youtube.com/channel/UC... langsung.",
        },
        { status: 422 }
      );
    }
    const name = (nameM?.[1] || "").replace(/\s*-\s*YouTube$/, "").trim();
    return NextResponse.json({ ok: true, channelId: m[1], name, resolved: true });
  } catch (e) {
    // Jujur & ramah: "fetch failed" bawaan Node dibungkus pesan yang bisa dipahami.
    const msg = e instanceof Error ? e.message : "";
    const friendly = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|429/i.test(msg)
      ? "Koneksi ke YouTube gagal/diblokir dari server — coba lagi nanti, atau pakai link youtube.com/channel/UC... langsung."
      : msg || "Gagal resolve";
    return NextResponse.json({ ok: false, error: friendly }, { status: 502 });
  }
}
