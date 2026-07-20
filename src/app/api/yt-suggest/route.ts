import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/yt-suggest?q=cerita jadi lagu&hl=id&gl=ID&limit=30
 * YouTube autocomplete (suggestqueries.google.com) — TANPA API key, TANPA kuota.
 * Diport dari YIE suggest.js: multi-seed + fallback lokal per niche.
 */

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function uniqArr(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = String(x || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(x).trim());
  }
  return out;
}

function localFallback(seed: string): string[] {
  const s = String(seed || "").trim();
  if (!s) return [];
  const year = new Date().getFullYear();
  const base = [
    s,
    `${s} terbaru`,
    `${s} ${year}`,
    `${s} viral`,
    `${s} kisah nyata`,
    `${s} full`,
    `${s} tutorial`,
  ];
  // Niche Cerita Jadi Lagu
  if (/cerita|lagu|lirik|sedih|ibu|ayah|rindu/i.test(s)) {
    base.push(
      `${s} cerita jadi lagu`,
      `${s} lagu sedih`,
      `cerita jadi lagu ${s}`,
      `${s} bikin nangis`,
      `${s} lagu untuk ibu`
    );
  }
  if (/dj|remix|bass/i.test(s)) {
    base.push(`${s} full bass`, `${s} viral tiktok`, `${s} nonstop`, `${s} jedag jedug`);
  }
  if (/hantu|horor|horror|ghost|haunted/i.test(s)) {
    base.push(`${s} rumah kosong`, `${s} rumah angker`, `${s} tengah malam`, `${s} suara misterius`);
  }
  return uniqArr(base);
}

async function fetchYoutubeSuggest(seed: string, language: string, region: string): Promise<string[]> {
  const u = new URL("https://suggestqueries.google.com/complete/search");
  u.searchParams.set("client", "youtube");
  u.searchParams.set("ds", "yt");
  u.searchParams.set("q", seed);
  u.searchParams.set("hl", language || "id");
  if (region && region !== "GLOBAL") u.searchParams.set("gl", region.toLowerCase());

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VerveBrain/1.0; +https://vercel.app)",
        Accept: "application/json,text/javascript,*/*",
      },
    });
    if (!r.ok) throw new Error(`Suggest HTTP ${r.status}`);
    const text = await r.text();
    // Response bisa JSON murni atau JSONP-like: ["query", [["s1",0],...], ...]
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      const m = text.match(/\(([\s\S]*)\)\s*$/);
      if (m) data = JSON.parse(m[1]);
      else throw new Error("Suggest parse gagal");
    }
    const items = Array.isArray((data as unknown[])?.[1]) ? ((data as unknown[])[1] as unknown[]) : [];
    return items
      .map((row) => (Array.isArray(row) ? String(row[0]) : String(row)))
      .filter((x) => typeof x === "string" && x.trim().length > 0);
  } finally {
    clearTimeout(to);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const keyword = String(sp.get("q") || sp.get("keyword") || "").trim();
    if (!keyword) {
      return NextResponse.json({ error: "Parameter q wajib diisi." }, { status: 400, headers: CORS });
    }
    const language = String(sp.get("hl") || sp.get("lang") || "id");
    const region = String(sp.get("gl") || sp.get("region") || "ID").toUpperCase();
    const limit = Math.max(1, Math.min(50, parseInt(sp.get("limit") || "30", 10) || 30));

    const year = new Date().getFullYear();
    const seeds = uniqArr([
      keyword,
      `${keyword} terbaru`,
      `${keyword} ${year}`,
      `${keyword} viral`,
      `${keyword} lagu`,
      `${keyword} sedih`,
      `${keyword} full`,
      `lagu ${keyword}`,
    ]).slice(0, 8);

    const sourceNotes: { seed: string; count: number; source: string; error?: string }[] = [];
    let all: string[] = [];

    // Paralel dengan batas wajar — 8 seed cukup cepat
    const results = await Promise.allSettled(seeds.map((seed) => fetchYoutubeSuggest(seed, language, region)));
    results.forEach((res, i) => {
      if (res.status === "fulfilled") {
        sourceNotes.push({ seed: seeds[i], count: res.value.length, source: res.value.length ? "youtube_suggest" : "empty" });
        all.push(...res.value);
      } else {
        sourceNotes.push({ seed: seeds[i], count: 0, source: "error", error: String(res.reason?.message || res.reason) });
      }
    });

    let suggestions = uniqArr(all).filter((s) => s.toLowerCase() !== keyword.toLowerCase());

    if (suggestions.length < 5) {
      const fb = localFallback(keyword);
      sourceNotes.push({ seed: keyword, count: fb.length, source: "local_fallback" });
      suggestions = uniqArr([...suggestions, ...fb]).filter((s) => s.toLowerCase() !== keyword.toLowerCase());
    }

    suggestions = suggestions.slice(0, limit);

    return NextResponse.json(
      {
        query: { keyword, language, region, limit },
        fetchedAt: new Date().toISOString(),
        note: "Suggestions dari YouTube autocomplete publik, dengan fallback lokal jika kosong.",
        sourceNotes,
        suggestions,
      },
      { status: 200, headers: { ...CORS, "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: CORS });
  }
}
