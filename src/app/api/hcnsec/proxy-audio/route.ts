import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxy audio biar lolos CORS (khususnya Kie.ai / apiframe / Sunor yang CDN-nya
 * kadang gak set Access-Control-Allow-Origin). Client fetch URL ini, server fetch
 * audio asli lalu stream balik ke client.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get("url");
    if (!u) return NextResponse.json({ error: "url param required" }, { status: 400 });

    // Whitelist domain audio Suno-ish — biar gak dipakai buat open proxy sembarangan
    let allowed = false;
    try {
      const host = new URL(u).hostname.toLowerCase();
      allowed =
        // 🎬 v11.7: CDN video AI (kling & kawan-kawan) + gateway sendiri — klip Adegan Hidup butuh jalur CORS ini
        host.includes("hcnsec") ||
        host.includes("kling") ||
        host.includes("kwai") ||
        host.includes("kuaishou") ||
        host.includes("video") ||
        host.includes("kie.ai") ||
        host.includes("apiframe") ||
        host.includes("suno") ||
        host.includes("sunor") ||
        host.includes("cdn") ||
        host.includes("aimusic") ||
        host.includes("cdn") ||
        host.includes("r2") ||
        host.includes("s3") ||
        host.includes("blob") ||
        host.endsWith("cdn2.suno.ai") ||
        host.includes("cdn.kie.ai");
    } catch { allowed = false; }
    if (!allowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 120_000);
    const r = await fetch(u, {
      headers: {
        // Mirip browser biasa
        "User-Agent": "Mozilla/5.0",
        "Accept": "audio/*,*/*",
      },
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (!r.ok || !r.body) {
      return new NextResponse(`Upstream ${r.status}`, { status: 502 });
    }

    const ct = r.headers.get("content-type") || "audio/mpeg";
    const cl = r.headers.get("content-length");
    const headers = new Headers();
    headers.set("Content-Type", ct);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400");
    if (cl) headers.set("Content-Length", cl);

    return new NextResponse(r.body as any, {
      status: 200,
      headers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy error" }, { status: 500 });
  }
}
