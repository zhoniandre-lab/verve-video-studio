import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxy gambar biar lolos CORS — CDN AI (HCNSEC, Kie, dsb.) kadang tidak mengirim
 * header Access-Control-Allow-Origin. Kalau gambar cross-origin dimuat tanpa CORS,
 * canvas jadi "tainted" dan HASIL RENDER VIDEO JADI HITAM total. Client fetch URL
 * ini (same-origin), server ambil gambar asli lalu kirim balik dengan ACAO:*.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const u = searchParams.get("url");
    if (!u || !/^https?:\/\//.test(u)) {
      return NextResponse.json({ error: "url param required" }, { status: 400 });
    }

    // Whitelist longgar: domain AI/CDN umum — biar gak dipakai buat open proxy sembarangan
    let allowed = false;
    try {
      const host = new URL(u).hostname.toLowerCase();
      allowed =
        host.includes("hcnsec") ||
        host.includes("kie.ai") ||
        host.includes("apiframe") ||
        host.includes("sunor") ||
        host.includes("suno") ||
        host.includes("aimusic") ||
        host.includes("cdn") ||
        host.includes("r2") ||
        host.includes("s3") ||
        host.includes("oss") ||
        host.includes("aliyuncs") ||
        host.includes("blob") ||
        host.includes("storage") ||
        host.includes("qpic") ||
        host.includes("googleapis") ||
        host.includes("googleusercontent");
    } catch { allowed = false; }
    if (!allowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 60_000);
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/*,*/*" },
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (!r.ok || !r.body) {
      return new NextResponse(`Upstream ${r.status}`, { status: 502 });
    }
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) {
      return new NextResponse("Bukan gambar", { status: 502 });
    }
    const cl = r.headers.get("content-length");
    const headers = new Headers();
    headers.set("Content-Type", ct);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400");
    if (cl) headers.set("Content-Length", cl);
    return new NextResponse(r.body as any, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy error" }, { status: 500 });
  }
}
