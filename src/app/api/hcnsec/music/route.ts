
import { NextResponse } from "next/server";

/**
 * Generate AI music via Suno-compatible API.
 * Multi-provider: kie.ai, apiframe.ai, sunor.cc, aimusic.so (free).
 *
 * Credentials priority:
 *   1. Header X-Suno-Key
 *   2. Header X-Suno-Provider ("kie" | "apiframe" | "sunor") — opsional, kalau dikirim
 *      client akan dipakai; kalau tidak, dideteksi dari prefix key.
 *   3. Env: SUNO_API_KEY / MUSIC_API_KEY
 *   4. Default free aimusic.so (kadang penuh)
 */
export const dynamic = "force-dynamic";

type Provider = "kie" | "apiframe" | "sunor" | "aimusic";

const PROVIDERS: Record<Provider, { base: string; label: string }> = {
  kie:      { base: "https://api.kie.ai/api/v1", label: "Kie.ai" },
  apiframe: { base: "https://apiframe.ai/api",   label: "apiframe.ai" },
  sunor:    { base: "https://api.sunor.cc/v1",   label: "Sunor.cc" },
  aimusic:  { base: "https://api.aimusic.so",    label: "aimusic.so (free)" },
};

function detectProvider(rawKey: string, hdrProvider?: string): Provider {
  if (hdrProvider && PROVIDERS[hdrProvider as Provider]) return hdrProvider as Provider;
  const k = rawKey.toLowerCase().trim();
  if (!k) return "aimusic";
  if (k.startsWith("kie") || k.startsWith("sk-kie")) return "kie";
  if (k.startsWith("snr_") || k.startsWith("sunor_")) return "sunor";
  if (k.startsWith("afk_") || k.startsWith("af_")) return "apiframe";
  // Hex 32+ tanpa prefix — asumsikan Kie.ai (Kie ngasih key hex murni).
  if (/^[a-f0-9]{24,}$/i.test(k)) return "kie";
  return "apiframe";
}

function getCreds(req: Request) {
  const hdrKey = req.headers.get("x-suno-key") || "";
  const hdrProvider = (req.headers.get("x-suno-provider") || "").toLowerCase();
  const hdrBase = req.headers.get("x-suno-base") || "";
  const envKey = process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "";
  const envBase = process.env.SUNO_BASE_URL || "";
  const key = (hdrKey || envKey || "").trim();
  const provider = detectProvider(key, hdrProvider);
  let base = hdrBase || envBase;
  if (!base) base = PROVIDERS[provider].base;
  base = base.replace(/\/$/, "");
  return { key, base, provider };
}

async function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}

function buildBody(payload: any, provider: Provider): any {
  const {
    prompt, lyrics, title, genre, tags, custom,
    model, instrumental, vocalGender,
  } = payload;

  // Map model label ke id yang dipakai provider
  const modelId = String(model || "v5.5").toLowerCase();
  let kieModel = "V5_5";
  if (modelId.includes("v5.5") || modelId.includes("v5_5")) kieModel = "V5_5";
  else if (modelId.includes("v5")) kieModel = "V5";
  else if (modelId.includes("v4.5") && modelId.includes("plus")) kieModel = "V4_5PLUS";
  else if (modelId.includes("v4.5") && modelId.includes("all")) kieModel = "V4_5ALL";
  else if (modelId.includes("v4.5")) kieModel = "V4_5";
  else if (modelId.includes("v4")) kieModel = "V4";
  else if (modelId.includes("v3.5") || modelId.includes("v3_5")) kieModel = "V3_5";
  else if (modelId.includes("udio")) kieModel = "V5_5";

  if (provider === "kie") {
    const isCustom = !!(custom && lyrics);
    const body: any = {
      model: kieModel,
      customMode: isCustom,
      instrumental: !!instrumental,
      title: title || "Verve AI Song",
      callBackUrl: "playground",
    };
    if (isCustom) {
      body.lyrics = lyrics;
      body.style = tags || genre || "pop, emotional";
      body.prompt = prompt || lyrics.slice(0,400);
    } else {
      body.prompt = prompt || `${title || ""} ${genre || ""} ${tags || ""}`.trim() || "pop ballad, emotional";
    }
    if (!instrumental) {
      if (vocalGender === "male") body.vocalGender = "m";
      else if (vocalGender === "female") body.vocalGender = "f";
      else body.vocalGender = "mf";
    }
    return body;
  }

  // apiframe / sunor / aimusic — suno-compatible
  const body: any = {
    prompt: prompt || `${title || ""} ${genre || ""} ${tags || ""}`.trim(),
    title: title || "Verve AI Song",
    tags: tags || genre || "pop, emotional",
    make_instrumental: !!instrumental,
    wait_audio: false,
    mv: "chirp-v3-5",
  };
  if (modelId.includes("v5.5")) body.model = "suno-v5.5";
  else if (modelId.includes("v5")) body.model = "suno-v5";
  else if (modelId.includes("v4.5")) body.model = "suno-v4.5";
  else if (modelId.includes("v4")) body.model = "suno-v4";
  else if (modelId.includes("v3.5")) body.model = "chirp-v3.5", body.mv = "chirp-v3-5";
  else if (modelId) body.model = modelId;

  if (vocalGender === "male") body.gender = "male";
  else if (vocalGender === "female") body.gender = "female";

  if (custom && lyrics) {
    body.prompt = lyrics;
    body.lyrics = lyrics;
    body.custom_mode = true;
    body.tags = tags || genre || body.tags;
  }
  return body;
}

function buildHeaders(key: string): Record<string,string> {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  if (key) {
    const rawKey = key.replace(/^Bearer\s+/i, "");
    h["Authorization"] = key.startsWith("Bearer ") ? key : `Bearer ${rawKey}`;
    h["apikey"] = rawKey;
    h["x-api-key"] = rawKey;
  }
  return h;
}

function getEndpoints(provider: Provider, base: string, forStatus?: string): string[] {
  if (forStatus) {
    if (provider === "kie") {
      return [
        `${base}/generate/record-info?taskId=${forStatus}`,
      ];
    }
    return [
      `${base}/v1/status/${forStatus}`,
      `${base}/v1/music/status/${forStatus}`,
      `${base}/api/v1/status/${forStatus}`,
      `${base}/status/${forStatus}`,
      `${base}/api/status/${forStatus}`,
      `${base}/feed/${forStatus}`,
      `${base}/v1/feed/${forStatus}`,
    ];
  }
  if (provider === "kie") {
    return [`${base}/generate`];
  }
  return [
    `${base}/v1/generate`,
    `${base}/v1/music/generate`,
    `${base}/api/generate`,
    `${base}/generate`,
    `${base}/suno/generate`,
    `${base}/v1/suno/generate`,
  ];
}

function normalize(d: any, provider: Provider): any {
  // Kie.ai format: { code:200, data:{ taskId } } saat generate,
  // dan { code:200, data:{ status:"SUCCESS", response:{ sunoData:[{audioUrl,...}]} } } saat poll
  if (provider === "kie") {
    if (d?.code !== 200 && d?.code !== 0) {
      return { status: "error", error: d?.msg || "Kie error" };
    }
    const data = d.data || {};
    if (data.taskId && !data.response) {
      return { id: data.taskId, status: "pending" };
    }
    const st = String(data.status || "pending").toUpperCase();
    if (st === "SUCCESS" || st === "FIRST_SUCCESS") {
      const items = data.response?.sunoData || data.response?.data || data.sunoData || [];
      const first = items[0] || {};
      return {
        id: data.taskId || first.id || "",
        status: "completed",
        audio_url: first.audioUrl || first.streamAudioUrl || first.url || "",
        title: first.title || "",
        image_url: first.imageUrl || "",
        duration: first.duration,
      };
    }
    if (st.includes("FAIL") || st.includes("ERROR")) {
      return { status: "error", error: data.errorMessage || st };
    }
    return { id: data.taskId, status: "pending" };
  }

  // Generic suno-compatible
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
  };
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { key, base, provider } = getCreds(req);
    const body = buildBody(payload, provider);
    const headers = buildHeaders(key);
    const endpoints = getEndpoints(provider, base);

    let lastErr: any = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
          signal: AbortSignal.timeout(45000),
        });
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: `Non-JSON: ${txt.slice(0,200)}` }; }

        if (!r.ok) {
          // auth error?
          if (r.status === 401 || r.status === 403) {
            const msg = provider === "kie"
              ? `API Key Kie.ai invalid/expired. Cek key di dashboard kie.ai ya bro.`
              : provider === "apiframe"
                ? `API Key apiframe.ai invalid atau IP diblok Cloudflare. Coba pindah ke Kie.ai (lebih lancar).`
                : `API Key invalid. Cek di dashboard ${PROVIDERS[provider].label}.`;
            return NextResponse.json({ error: msg, status: "auth_error", provider }, { status: 401 });
          }
          if (r.status === 402) {
            return NextResponse.json({
              error: `Kredit ${PROVIDERS[provider].label} habis bro. Top up dulu di dashboard.`,
              status: "quota_error", provider,
            }, { status: 402 });
          }
          lastErr = `${url} → ${r.status}: ${txt.slice(0,200)}`;
          continue;
        }

        const n = normalize(data, provider);
        if (n.status === "error") { lastErr = `${url}: ${n.error}`; continue; }
        if (n.id || n.audio_url) {
          n.provider = provider;
          return NextResponse.json(n);
        }
        lastErr = `Empty response from ${url}: ${txt.slice(0,200)}`;
      } catch(e:any){ lastErr = `${e.message}`; }
    }

    if (!key) {
      return NextResponse.json({
        error: "AI music free trial lagi tidak tersedia. Tap 🔑 Set API Key lalu pilih 🥇 Kie.ai (5.000 kredit GRATIS, bisa akses dari Indo) atau apiframe.ai ya bro!",
        status: "need_key",
      }, { status: 401 });
    }
    return NextResponse.json({ error: `AI music error (${PROVIDERS[provider].label}): ${lastErr}`, provider }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: `AI music gagal: ${e.message}` }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id diperlukan" }, { status: 400 });
    const { key, base, provider } = getCreds(req);
    const headers = buildHeaders(key);
    const endpoints = getEndpoints(provider, base, id);

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { continue; }
        const n = normalize(data, provider);
        n.provider = provider;
        if (n.audio_url || n.status === "error" || n.status === "completed") return NextResponse.json(n);
        // kalau pending, return pending
        if (n.id) return NextResponse.json({ status: "pending", id: n.id, provider });
      } catch {}
    }
    return NextResponse.json({ status: "pending", provider });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}
