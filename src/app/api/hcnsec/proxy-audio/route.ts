import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function stripBearer(value: string): string {
  return String(value || "").replace(/^Authorization\s*:\s*/i, "").replace(/^Bearer\s+/i, "").trim();
}

function mayForwardProviderAuth(host: string): boolean {
  const known = ["musicapi.ai", "aimusicapi.ai", "kie.ai", "sunoapi.org", "sunor.cc", "ttapi.io", "cometapi.com", "evolink.ai", "suno.ai"];
  return known.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

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

    // 🩹 v13.0 GERBANG AMAN — SEMUA host publik boleh LEWAT. Lagu user bisa datang dari provider/CDN
    // mana pun (era lotre whitelist tamat: link FRESH pun dulu keblok CORS mentah). Yang DILARANG:
    // (a) non-http(s) (b) host privat/loopback/metadata — penjaga SSRF (c) muatan non-media.
    let host = "";
    try {
      const pu = new URL(u);
      if (!/^https?:$/.test(pu.protocol)) throw new Error("bad protocol");
      host = pu.hostname.toLowerCase();
    } catch { return NextResponse.json({ error: "URL tidak valid" }, { status: 400 }); }
    const privat = host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || host === "[::1]" || host.includes(".internal") || host.includes("metadata");
    if (privat) return NextResponse.json({ error: "Host privat dilarang" }, { status: 403 });

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 120_000);
    const upstreamHeaders: Record<string, string> = {
      // Mirip browser biasa
      "User-Agent": "Mozilla/5.0",
      "Accept": "audio/*,video/*,*/*",
    };
    const providerKey = stripBearer(req.headers.get("x-suno-key") || "");
    const provider = (req.headers.get("x-suno-provider") || "").toLowerCase();
    const forwardedAuth = !!providerKey && mayForwardProviderAuth(host);
    if (forwardedAuth) {
      if (provider === "suno-resmi") upstreamHeaders.Cookie = providerKey;
      else {
        upstreamHeaders.Authorization = `Bearer ${providerKey}`;
        if (provider === "sunor") upstreamHeaders["x-api-key"] = providerKey;
        if (provider === "ttapi") upstreamHeaders["TT-API-KEY"] = providerKey;
      }
    }
    const r = await fetch(u, {
      headers: upstreamHeaders,
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (!r.ok || !r.body) {
      return NextResponse.json({ error: `Upstream ${r.status} — link kemungkinan kedaluwarsa/diblock sumber` }, { status: 502 });
    }

    const ctRaw = r.headers.get("content-type") || "";
    if (ctRaw && !/(audio|video|image|jpe?g|png|webp|mpeg|mp4|aac|wav|ogg|webm|m4a|flac|opus|octet-stream|binary|force-download)/i.test(ctRaw)) { // 🩹 v13.17.1: image/* untuk thumbnail Pixabay
      return NextResponse.json({ error: `Bukan media (content-type: ${ctRaw.slice(0, 60)})` }, { status: 415 });
    }
    const ct = ctRaw || "audio/mpeg";
    const cl = r.headers.get("content-length");
    const headers = new Headers();
    headers.set("Content-Type", ct);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", forwardedAuth ? "private, max-age=3600" : "public, max-age=86400");
    if (cl) headers.set("Content-Length", cl);

    return new NextResponse(r.body as any, {
      status: 200,
      headers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy error" }, { status: 500 });
  }
}
