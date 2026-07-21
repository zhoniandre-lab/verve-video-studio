
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

function mapModelKie(modelId: string): string {
  const m = String(modelId || "v5.5").toLowerCase();
  if (m.includes("v5.5") || m.includes("v5_5")) return "V5_5";
  if (m.includes("v5")) return "V5";
  if (m.includes("v4.5plus") || (m.includes("v4.5") && m.includes("plus"))) return "V4_5PLUS";
  if (m.includes("v4.5all") || (m.includes("v4.5") && m.includes("all"))) return "V4_5ALL";
  if (m.includes("v4.5")) return "V4_5";
  if (m.includes("v4")) return "V4";
  if (m.includes("v3.5") || m.includes("v3_5")) return "V3_5";
  return "V5_5";
}
function mapModelGeneric(modelId: string): string {
  const m = String(modelId || "v5.5").toLowerCase();
  if (m.includes("v5.5")) return "suno-v5.5";
  if (m.includes("v5")) return "suno-v5";
  if (m.includes("v4.5")) return "suno-v4.5";
  if (m.includes("v4")) return "suno-v4";
  if (m.includes("v3.5")) return "chirp-v3.5";
  return m;
}

function buildBody(payload: any, provider: Provider): any {
  // Dukung payload "Kampung-style" yang pisah title, lyrics, deskripsi utama
  const rawTitle = (payload._raw_title || payload.title || "").toString().trim();
  const rawLyrics = (payload._raw_lyrics || payload.lyrics || "").toString().trim();
  const rawStyle = (payload._raw_style || payload.prompt || payload.tags || "").toString().trim();

  const {
    genre, tags, custom, model, instrumental, vocalGender, style_bits,
  } = payload;

  const sb = style_bits || {};
  const tempoWord = sb.tempo === "fast" ? "uptempo" : sb.tempo === "mid" ? "mid-tempo" : "slow tempo";
  const eraWord = sb.era ? `era ${sb.era}` : "";
  const instrWord = sb.instruments ? `instruments: ${sb.instruments}` : "";

  const autoStyleParts = [genre || "", eraWord, tempoWord, instrWord].map(s=>(s||"").trim()).filter(Boolean);
  // 🎤 v10.2 LAGU NURUT: kata kunci gender IKUT DITANAM di style/tags di urutan DEPAN — tuas yang dituruti
  // SEMUA provider & versi Suno. Jangan cuma andalkan param vocalGender (dok resmi: hanya 'preferred'/best-effort).
  const genderWords = instrumental ? "" :
    vocalGender === "male" ? "male vocalist, deep male voice" :
    vocalGender === "female" ? "female vocalist, soft female voice" : "";
  // Gabung: gender + style manual user (prioritas!) + auto bits + mutu
  const styleStr = [genderWords, rawStyle, autoStyleParts.join(", "), "professional studio recording, high quality audio"]
    .map(s=>(s||"").trim()).filter(Boolean).join(", ");
  // tags versi ber-gender untuk jalur suno-compatible generik
  const tagsStr = [genderWords, tags || styleStr].map(s=>(s||"").trim()).filter(Boolean).join(", ");

  // Title pakai rawTitle
  const finalTitle = (rawTitle || "Verve AI Song").slice(0, 80);
  const finalPrompt = rawStyle || [finalTitle, styleStr].filter(Boolean).join(", ");
  const finalLyrics = rawLyrics;
  // Custom mode AKTIF kalau lirik terisi (>30 char) dan bukan instrumental
  const isCustom = (custom !== false) && finalLyrics.length > 30 && !instrumental;

  if (provider === "kie") {
    const body: any = {
      model: mapModelKie(model),
      customMode: isCustom,
      instrumental: !!instrumental,
      title: finalTitle,
      callBackUrl: "playground",
      // negativeTags default: hal2 yang bikin lirik ngawur / bahasa asing
      // 🎤 v10.2: lawan gender di-NEGATIF-kan — pria pilih? wanita masuk daftar larangan. Dan sebaliknya.
      negativeTags: "korean, japanese, chinese, heavy metal, edm, autotune, robotic, off-key, distorted" +
        (!instrumental && vocalGender === "male" ? ", female vocals, female voice" : "") +
        (!instrumental && vocalGender === "female" ? ", male vocals, male voice" : ""),
    };
    if (isCustom) {
      // PENTING (docs Kie): di custom mode, `prompt` WAJIB diisi lirik yang sama dg `lyrics`
      // — "prompt will be strictly used as the lyrics". Kalau diisi style desc, AI nyanyi deskripsi & jadinya ngawur/Korea.
      body.prompt = finalLyrics.slice(0, 5000);
      body.lyrics = finalLyrics.slice(0, 5000);
      body.style = styleStr.slice(0, 480);
      // styleWeight rendah = lebih patuh ke lirik; audioWeight normal; weirdness rendah biar gak aneh
      body.styleWeight = 0.65; // v10.2: style manual user dituruti lebih keras (dulu 0.55 → gaya mengambang)
      body.audioWeight = 0.7;
      body.weirdnessConstraint = 0.3;
    } else {
      body.prompt = finalPrompt.slice(0,500);
      body.style = styleStr.slice(0,480);
    }
    if (!instrumental) {
      // v10.2: dok resmi hanya 'm'/'f' — 'mf' invalid (diabaikan/ditolak). Auto = biarkan provider memilih.
      if (vocalGender === "male") body.vocalGender = "m";
      else if (vocalGender === "female") body.vocalGender = "f";
    }
    return body;
  }

  // apiframe / sunor / aimusic — suno-compatible
  const body: any = {
    prompt: isCustom ? finalLyrics : finalPrompt,
    title: finalTitle,
    tags: tagsStr, // v10.2: gender tertanam
    make_instrumental: !!instrumental,
    wait_audio: false,
    mv: "chirp-v3-5",
    model: mapModelGeneric(model),
  };
  if (vocalGender === "male") body.gender = "male";
  else if (vocalGender === "female") body.gender = "female";

  if (isCustom) {
    body.lyrics = finalLyrics;
    body.custom_mode = true;
    body.prompt = finalLyrics;
    body.style = styleStr;
    body.tags = tagsStr; // v10.2: gender tertanam
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
        const controller = new AbortController();
        // Vercel serverless punya batas ~60s. Kasih timeout 55s biar masih sempat balas.
        const timeout = setTimeout(()=>controller.abort(), 55000);
        const r = await fetch(url, {
          method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: `Non-JSON (${r.status}): ${txt.slice(0,200)}` }; }

        if (!r.ok) {
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
          if (r.status === 504 || r.status === 503 || r.status === 408) {
            lastErr = `${PROVIDERS[provider].label} sedang sibuk (${r.status}), coba lagi...`;
            continue;
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
      } catch(e:any){
        lastErr = `${PROVIDERS[provider].label} network: ${e?.message || e}`;
        // retry endpoint berikutnya kalau abort/network
      }
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
        const controller = new AbortController();
        const t = setTimeout(()=>controller.abort(), 15000);
        const r = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { continue; }
        const n = normalize(data, provider);
        n.provider = provider;
        if (n.audio_url || n.status === "error" || n.status === "completed") return NextResponse.json(n);
        if (n.id) return NextResponse.json({ status: "pending", id: n.id, provider });
      } catch {}
    }
    return NextResponse.json({ status: "pending", provider });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}
