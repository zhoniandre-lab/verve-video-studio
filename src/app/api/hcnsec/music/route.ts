
import { NextResponse } from "next/server";

/**
 * Generate AI music via Suno-compatible API.
 * Credentials priority:
 *   1. Header X-Suno-Key (dari popup localStorage user)
 *   2. Header X-Suno-Base (opsional override base URL)
 *   3. Env: SUNO_API_KEY / MUSIC_API_KEY
 *   4. Default free/trial aimusic.so (bisa gagal tanpa key)
 *
 * Models yang dikenal (apiframe.ai / kampunglagu style):
 *   - chirp-v3.5 / suno-v3.5  (Suno V3.5)
 *   - chirp-v4   / suno-v4    (Suno V4)
 *   - chirp-v4.5 / suno-v4.5  (Suno V4.5)
 *   - chirp-v5   / suno-v5    (Suno V5)
 *   - udio                   (Udio)
 */
export const dynamic = "force-dynamic";
const DEFAULT_SUNO_BASE = "https://api.aimusic.so"; // free-tier compatible (suno-compatible)
const APIFRAME_BASE = "https://apiframe.ai/api";      // apiframe.ai
const KIE_BASE = "https://api.kie.ai";                // kie.ai (prefix: "kie-"/"sk-kie"/"kie_")
const SUNOR_BASE = "https://api.sunor.cc";            // sunor.cc

function detectBase(key: string): string {
  const k = key.toLowerCase().trim();
  if (!k) return DEFAULT_SUNO_BASE;
  // kie.ai: "kie-" / "sk-kie-" / "kie_" / panjang hex 32+
  if (k.startsWith("kie") || k.startsWith("sk-kie")) return KIE_BASE;
  // apiframe: "afk_" / "af_"
  if (k.startsWith("afk_") || k.startsWith("af_")) return APIFRAME_BASE;
  // sunor: "snr_" / "sunor_"
  if (k.startsWith("snr_") || k.startsWith("sunor_")) return SUNOR_BASE;
  // default fallback: coba apiframe dulu (paling banyak user)
  return APIFRAME_BASE;
}

function getCreds(req: Request) {
  const hdrKey = req.headers.get("x-suno-key") || "";
  const hdrBase = req.headers.get("x-suno-base") || "";
  const envKey = process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "";
  const envBase = process.env.SUNO_BASE_URL || "";
  const key = (hdrKey || envKey || "").trim();
  let base = (hdrBase || envBase || "").replace(/\/$/, "");
  if (!base) base = detectBase(key);
  return { key, base };
}

async function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}

export async function POST(req: Request) {
  try {
    const {
      prompt, lyrics, title, genre, tags, custom,
      model, instrumental, vocalGender, make_instrumental,
    } = await req.json();
    const { key, base } = getCreds(req);

    const isInstrumental = !!(instrumental || make_instrumental);
    const gender = vocalGender === "male" ? "male" : vocalGender === "female" ? "female" : "auto";

    // Base body (suno-compatible)
    const body: any = {
      prompt: prompt || `${title || ""} ${genre || ""} ${tags || ""}`.trim(),
      title: title || "Verve AI Song",
      tags: tags || genre || "pop, emotional",
      make_instrumental: isInstrumental,
      wait_audio: false,
      mv: "chirp-v3-5", // default suno model
    };

    // Model selection (apiframe style)
    const modelId = String(model || "").toLowerCase();
    if (modelId) {
      // Map model labels ke id yang umum
      if (modelId.includes("v5.5") || modelId.includes("v5_5")) body.model = "suno-v5.5";
      else if (modelId.includes("v5")) body.model = "suno-v5";
      else if (modelId.includes("v4.5")) body.model = "suno-v4.5";
      else if (modelId.includes("v4")) body.model = "suno-v4";
      else if (modelId.includes("v3.5")) body.model = "chirp-v3.5", body.mv = "chirp-v3-5";
      else if (modelId.includes("udio")) body.model = "udio";
      else if (modelId.includes("mureka") || modelId.includes("lyria")) body.model = modelId;
      else body.model = modelId;
    }

    if (gender === "male") body.gender = "male";
    else if (gender === "female") body.gender = "female";

    if (custom && lyrics) {
      body.prompt = lyrics;
      body.lyrics = lyrics;
      body.custom_mode = true;
      body.tags = tags || genre || body.tags;
    }

    const headers: Record<string,string> = { "Content-Type": "application/json" };
    if (key) {
      const rawKey = key.replace(/^Bearer\s+/i, "");
      headers["Authorization"] = key.startsWith("Bearer ") ? key : `Bearer ${rawKey}`;
      headers["apikey"] = rawKey;                 // apiframe / openai-compat
      headers["x-api-key"] = rawKey;              // kie.ai / generic
      headers["X-API-Key"] = rawKey;
    }

    // Try several endpoints (berurutan; yang pertama success dipakai)
    const endpoints = [
      `${base}/v1/generate`,
      `${base}/v1/music/generate`,
      `${base}/v1/suno/generate`,       // kie.ai style
      `${base}/api/v1/generate`,
      `${base}/generate`,
      `${base}/api/generate`,
      `${base}/suno/generate`,
    ];

    let lastErr: any = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
        if (r.ok) {
          const data = await r.json().catch(()=>({}));
          // If apiframe returns {success:true, data:{id,...}}
          const d = data.data || data;
          if (d && (d.id || d.audio_url || d.url || d.task_id)) {
            return NextResponse.json(normalize(data, url));
          }
          lastErr = `Empty response from ${url}`;
          continue;
        }
        if (r.status === 401 || r.status === 403) {
          return NextResponse.json({
            error: `API Key invalid/expired. Pastikan key dari ${key ? base : "apiframe.ai"} benar.`,
            status: "auth_error",
          }, { status: 401 });
        }
        if (r.status === 402) {
          return NextResponse.json({
            error: "Kredit API key kamu habis. Top up dulu di dashboard ya bro.",
            status: "quota_error",
          }, { status: 402 });
        }
        lastErr = `${url} → ${r.status}: ${(await r.text().catch(()=>"")).slice(0,160)}`;
      } catch(e:any){ lastErr = e.message; }
    }

    if (!key) {
      return NextResponse.json({
        error: "AI music free trial lagi tidak tersedia. Masukkan API Key (gratis di apiframe.ai) lewat tombol 🔑 Setelan untuk mulai ya bro!",
        status: "need_key",
      }, { status: 401 });
    }
    return NextResponse.json({ error: `AI music error: ${lastErr}` }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: `AI music gagal: ${e.message}` }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id diperlukan" }, { status: 400 });
    const { key, base } = getCreds(req);
    const headers: Record<string,string> = {};
    if (key) {
      headers["Authorization"] = key.startsWith("Bearer ") ? key : `Bearer ${key}`;
      headers["apikey"] = key.replace(/^Bearer\s+/i, "");
    }

    const endpoints = [
      `${base}/v1/status/${id}`,
      `${base}/v1/music/status/${id}`,
      `${base}/v1/suno/status/${id}`,
      `${base}/api/v1/status/${id}`,
      `${base}/status/${id}`,
      `${base}/api/status/${id}`,
      `${base}/feed/${id}`,
      `${base}/v1/feed/${id}`,
    ];
    for (const url of endpoints) {
      try {
        const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (r.ok) {
          const data = await r.json().catch(()=>({}));
          const n = normalize(data, url);
          if (n.audio_url || n.status === "error" || n.status === "completed") return NextResponse.json(n);
        }
      } catch {}
    }
    return NextResponse.json({ status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}

function normalize(d: any, endpoint?: string) {
  const items = d.data || (Array.isArray(d) ? d : [d]);
  const first = items[0] || d || {};
  const audioUrl = first.audio_url || first.url || first.stream_url || first.audioUrl || d.audio_url || d.url || "";
  let status = (first.status || d.status || "pending").toString().toLowerCase();
  if (audioUrl && (status === "pending" || status === "processing" || status === "submitted" || status === "queued")) {
    status = "completed";
  }
  if (/complete|success|done/i.test(status)) status = "completed";
  if (/error|fail/i.test(status)) status = "error";
  return {
    id: first.id || d.id || d.task_id || "",
    status,
    audio_url: audioUrl,
    title: first.title || d.title || "",
    image_url: first.image_url || first.cover || first.image || d.image_url || "",
    model: first.model || d.model || "",
    endpoint,
  };
}
