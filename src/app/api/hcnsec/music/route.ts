
import { NextResponse } from "next/server";

/**
 * Generate AI music via Suno-compatible API.
 * User bisa set env: SUNO_API_KEY + SUNO_BASE_URL (default: gratis/trial via aimusic.so).
 * Body: { prompt, lyrics?, title?, genre?, tags?, custom?: bool }
 *
 * Response: { id, status, audio_url?, stream_url?, error? }
 * Poll ke GET /api/hcnsec/music?id=xxx untuk status.
 */
export const dynamic = "force-dynamic";
const DEFAULT_SUNO_BASE = "https://api.aimusic.so"; // free-tier compatible

function getCreds() {
  const key = process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "";
  const base = (process.env.SUNO_BASE_URL || DEFAULT_SUNO_BASE).replace(/\/$/, "");
  return { key, base };
}

async function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}

export async function POST(req: Request) {
  try {
    const { prompt, lyrics, title, genre, tags, custom } = await req.json();
    const { key, base } = getCreds();
    // Coba Suno-compatible endpoint: /api/generate
    const body: any = {
      prompt: prompt || `${title || ""} ${genre || ""} ${tags || ""}`.trim(),
      title: title || "Verve AI Song",
      tags: tags || genre || "pop, emotional",
      make_instrumental: false,
      wait_audio: false,
    };
    if (custom && lyrics) {
      body.prompt = lyrics;
      body.lyrics = lyrics;
      body.custom_mode = true;
    }
    const headers: Record<string,string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;

    const r = await fetch(`${base}/v1/generate`, {
      method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
      signal: AbortSignal.timeout(30000),
    }).catch((e)=>{throw e;});

    if (r.status === 404 || r.status === 401) {
      // Coba endpoint alternatif
      const r2 = await fetch(`${base}/api/generate`, {
        method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!r2.ok) return NextResponse.json({ error: `Music API ${r2.status}. Set SUNO_API_KEY.` }, { status: 502 });
      const data = await r2.json().catch(()=>({}));
      return NextResponse.json(normalize(data));
    }
    if (!r.ok) {
      return NextResponse.json({ error: `Music API error ${r.status}: ${await r.text().catch(()=>"").then(t=>t.slice(0,200))}` }, { status: 502 });
    }
    const data = await r.json().catch(()=>({}));
    return NextResponse.json(normalize(data));
  } catch (e: any) {
    return NextResponse.json({ error: `AI music tidak tersedia gratis. Set SUNO_API_KEY. Detail: ${e.message}` }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id diperlukan" }, { status: 400 });
    const { key, base } = getCreds();
    const headers: Record<string,string> = {};
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const r = await fetch(`${base}/v1/status/${id}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(()=>null);
    if (!r || !r.ok) {
      const r2 = await fetch(`${base}/api/status/${id}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!r2.ok) return NextResponse.json({ status: "pending" });
      return NextResponse.json(normalize(await r2.json().catch(()=>({}))));
    }
    return NextResponse.json(normalize(await r.json().catch(()=>({}))));
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}

function normalize(d: any) {
  const items = d.data || (Array.isArray(d) ? d : [d]);
  const first = items[0] || d;
  return {
    id: first.id || d.id || d.task_id || "",
    status: first.status || d.status || "pending",
    audio_url: first.audio_url || first.url || first.stream_url || d.audio_url || d.url || "",
    title: first.title || d.title || "",
    image_url: first.image_url || first.cover || d.image_url || "",
    raw: d,
  };
}
