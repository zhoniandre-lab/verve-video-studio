import { NextResponse } from "next/server";
import { parseTrendsRss, skorTrend } from "@/lib/brain/trend-radar";

/**
 * 🔥 VERVE TREND RADAR v19.4 — proxy RSS Google Trends (gratis, tanpa API key).
 * Ambil topik hangat Indonesia (geo=ID default) → tag relevansi niche VERVE.
 * Cache 15 menit di memori server (hemat panggilan ke Google).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 15 * 60 * 1000;
let cache: { at: number; geo: string; body: unknown } | null = null;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const geo = String(u.searchParams.get("geo") || "ID").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "ID";
  const now = Date.now();
  if (cache && cache.geo === geo && now - cache.at < TTL) {
    return NextResponse.json(cache.body, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const r = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120 Mobile" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) throw new Error(`Google Trends HTTP ${r.status}`);
    const xml = await r.text();
    const items = parseTrendsRss(xml)
      .slice(0, 20)
      .map((it) => ({ ...it, tags: skorTrend(it.title) }));
    const body = {
      ok: true,
      geo,
      count: items.length,
      fetchedAt: new Date().toISOString(),
      items,
      note: "Data dari RSS publik Google Trends (read-only, tanpa API key). Perkiraan volume & urutan bisa berubah.",
    };
    cache = { at: now, geo, body };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Gagal ambil trend",
        note: "Coba lagi nanti — RSS Google Trends kadang lambat. Ini fitur bonus; app tetap jalan penuh tanpa ini.",
      },
      { status: 502 }
    );
  }
}
