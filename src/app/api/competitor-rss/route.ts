import { NextResponse } from "next/server";
import { extractChannelId, parseYtRss, type KompFeed } from "@/lib/brain/competitor-rss";

/**
 * 🛰️ VERVE KOMPETITOR RSS v19.6 — proxy RSS publik YouTube (gratis, tanpa API key).
 * GET  /api/competitor-rss?ids=UC1|UC2  → scan upload terbaru tiap channel (cache 10 mnt)
 * POST /api/competitor-rss              → resolve URL channel (@handle /c/ /channel/) → ID
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

  const feeds: KompFeed[] = await Promise.all(
    ids.map(async (id) => {
      try {
        const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
        const name = (xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || "";
        return { channelId: id, channelName: name || undefined, items: parseYtRss(xml, 8) };
      } catch (e) {
        return { channelId: id, items: [], error: e instanceof Error ? e.message : "Gagal ambil RSS" };
      }
    })
  );

  const body = {
    ok: true,
    count: feeds.filter((f) => f.items.length).length,
    feeds,
    note: "Data dari RSS publik YouTube (read-only, tanpa kuota API). Cache 10 menit.",
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
  try {
    // Resolve @handle /c/ /user/ → channel ID dari meta halaman (tanpa API key).
    const html = await fetchText(url.includes("youtube.com") ? url : `https://www.youtube.com${url}`, 15_000);
    const m = html.match(/"externalId":"(UC[\w-]+)"/)
      || html.match(/<meta itemprop="identifier" content="(UC[\w-]+)"/)
      || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/);
    const nameM = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (!m) return NextResponse.json({ ok: false, error: "Gagal resolve channel ID — coba pakai link youtube.com/channel/UC... langsung." }, { status: 422 });
    const name = (nameM?.[1] || "").replace(/\s*-\s*YouTube$/, "").trim();
    return NextResponse.json({ ok: true, channelId: m[1], name, resolved: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Gagal resolve" }, { status: 502 });
  }
}
