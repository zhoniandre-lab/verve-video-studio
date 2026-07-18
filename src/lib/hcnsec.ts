import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "./types";

const API_KEY = process.env.HCNSEC_API_KEY;
const BASE_URL = (process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1").replace(/\/$/, "");

if (!API_KEY) {
  console.warn("[hcnsec] HCNSEC_API_KEY belum di-set di .env / Vercel env vars");
}

function h() {
  if (!API_KEY) throw new Error("HCNSEC_API_KEY belum di-set di environment variable Vercel. Masukkan di Project Settings → Environment Variables.");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

class ApiError extends Error {
  status: number;
  endpoint?: string;
  body?: any;
  constructor(msg: string, status = 500, endpoint?: string, body?: any) {
    super(msg);
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

async function postJson(path: string, body: any, timeoutSec = 120): Promise<any> {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutSec * 1000);
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify(body),
      signal: c.signal,
    });
    const isBinary = path.endsWith("/speech");
    if (isBinary) {
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new ApiError(`Audio API error ${r.status}: ${txt.slice(0, 300)}`, r.status, path);
      }
      const buf = await r.arrayBuffer();
      return Buffer.from(buf).toString("base64");
    }
    const txt = await r.text();
    let payload: any;
    try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    if (!r.ok) {
      const msg =
        payload?.error?.message ||
        payload?.message ||
        payload?.msg ||
        payload?.error ||
        (typeof payload === "string" ? payload : txt.slice(0, 500)) ||
        `HTTP ${r.status}`;
      throw new ApiError(`${msg}`, r.status, path, payload);
    }
    return payload;
  } catch (e: any) {
    if (e.name === "AbortError") throw new ApiError(`Request timeout (${timeoutSec}s). Coba lagi atau gunakan kualitas cepat.`, 504, path);
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || "Unknown error", 500, path);
  } finally {
    clearTimeout(to);
  }
}

async function retry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1000): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// ================ CHAT ================
export async function chat(messages: { role: string; content: string }[], model?: string) {
  const data: any = await retry(
    () =>
      postJson("/chat/completions", {
        model: model || DEFAULT_CHAT_MODEL,
        messages,
        temperature: 0.8,
      }),
    2
  );
  return (data.choices?.[0]?.message?.content || "").trim();
}

export async function generateKeywords(niche: string, n = 5, model?: string) {
  const sys =
    "Kamu adalah ahli SEO & content creator YouTube Shorts/TikTok profesional. " +
    `Buat ${n} keyword/topik video yang menarik, relevan, dan banyak dicari untuk niche user. ` +
    "Output HANYA list, 1 per baris, tanpa nomor, tanpa tanda petik, tanpa penjelasan.";
  const resp = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: niche },
    ],
    model
  );
  return resp
    .split("\n")
    .map((l: string) => l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, Math.max(1, n));
}

export async function generateTitles(keyword: string, niche: string, n = 3, model?: string) {
  const sys =
    "Kamu copywriter YouTube Shorts/TikTok profesional berbahasa Indonesia. " +
    `Buat ${n} judul video pendek (maks 8 kata) untuk keyword: "${keyword}", niche "${niche}". ` +
    "Judul clickbait tapi jujur. Output HANYA 1 judul per baris, tanpa nomor.";
  const resp = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: keyword },
    ],
    model
  );
  return resp
    .split("\n")
    .map((l: string) => l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, Math.max(1, n));
}

export async function generateScript(title: string, keyword: string, slides: number, model?: string) {
  const sys =
    `Buat narasi video singkat Bahasa Indonesia untuk video "${title}" (keyword: ${keyword}), ` +
    `bagi menjadi ${slides} baris (1 baris per slide). ` +
    "Narasi santai natural gaya host YouTube Shorts. Total pendek saja.";
  const resp = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: title },
    ],
    model
  );
  return resp
    .split("\n")
    .map((l: string) => l.replace(/^[-•*0-9.)\s"]+/, "").trim())
    .filter(Boolean)
    .slice(0, Math.max(1, slides));
}

export async function generateImagePrompt(title: string, keyword: string, niche: string, style: string) {
  const sys =
    "Buat 1 prompt text-to-image Bahasa Inggris, detail untuk AI gambar. " +
    `Tentang "${title}" keyword "${keyword}", niche "${niche}", gaya "${style}". ` +
    "Sebutkan: shot type, lighting, composition, mood, colors. Tambahkan 'no text, no watermark, sharp, high quality' di akhir. Output HANYA prompt.";
  return (
    await chat([
      { role: "system", content: sys },
      { role: "user", content: title },
    ])
  ).replace(/^["']|["']$/g, "");
}

// ================ IMAGE ================
// Coba beberapa kombinasi model/size/format untuk kompatibilitas maksimal
const IMAGE_SIZE_FALLBACKS = ["1024x1024", "1024x1792", "1792x1024", "512x512", "768x768"];
const IMAGE_MODEL_FALLBACKS = [
  DEFAULT_IMAGE_MODEL,
  "step-image-edit-2",
  "dall-e-3",
  "dall-e-2",
  "stable-diffusion-xl",
  "flux",
  "flux-schnell",
  "midjourney",
];

function extractUrlFromItem(item: any): string | null {
  if (!item) return null;
  // Kemungkinan field
  if (typeof item === "string" && item.startsWith("http")) return item;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  if (item.image_url) return typeof item.image_url === "string" ? item.image_url : item.image_url.url;
  if (item.image) return typeof item.image === "string" ? (item.image.startsWith("http") ? item.image : `data:image/png;base64,${item.image}`) : null;
  return null;
}

export async function generateImage(prompt: string, size = "1024x1024", model?: string): Promise<{ url: string; model: string; size: string }> {
  const errors: string[] = [];
  const modelsToTry = [model || DEFAULT_IMAGE_MODEL, ...IMAGE_MODEL_FALLBACKS.filter((m) => m !== (model || DEFAULT_IMAGE_MODEL))];
  const sizesToTry = [size, ...IMAGE_SIZE_FALLBACKS.filter((s) => s !== size)];
  const formats = ["b64_json", "url"];

  for (const m of modelsToTry) {
    for (const s of sizesToTry) {
      for (const fmt of formats) {
        try {
          const body: any = { model: m, prompt, size, n: 1 };
          body.response_format = fmt;
          // untuk model edit, beberapa provider butuh image; skip jika tidak ada
          const data = await postJson("/images/generations", body, 90);
          const item = data.data?.[0] ?? data;
          const url = extractUrlFromItem(item);
          if (url && url.length > 100) return { url, model: m, size: s };
          // url valid tapi pendek? cek jika ada data lain
          if (url && url.startsWith("http")) return { url, model: m, size: s };
        } catch (e: any) {
          // Jangan coba semua model jika errornya auth (401)
          if (e.status === 401) throw new ApiError("API Key salah / tidak valid. Periksa HCNSEC_API_KEY di Vercel.", 401);
          if (e.status === 402) throw new ApiError("Saldo API kamu habis. Top up saldo di api.hcnsec.cn", 402);
          const short = `${m}/${s}/${fmt}: ${e.message.slice(0, 100)}`;
          errors.push(short);
          // jika model not found, break size loop untuk model ini
          if (/model.*not.*found|invalid.*model|unknown.*model|does not exist/i.test(e.message)) break;
          // jika size invalid, coba size berikutnya
          if (/size|resolution|dimension/i.test(e.message)) continue;
          // jika format tidak didukung, coba format lain
          if (/response_format|b64/i.test(e.message)) continue;
        }
      }
    }
  }

  const detail = errors.slice(0, 4).join(" | ");
  throw new ApiError(
    `Gambar gagal di-generate dengan semua kombinasi. Coba: (1) upload gambar sendiri, (2) cek saldo API di api.hcnsec.cn, (3) pastikan model ${DEFAULT_IMAGE_MODEL} tersedia. Detail: ${detail}`,
    500,
    "/images/generations"
  );
}

// ================ TTS ================
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const b64: string = await retry(
    () =>
      postJson(
        "/audio/speech",
        { model: model || DEFAULT_TTS_MODEL, input: text.slice(0, 3500), voice, response_format: "mp3" },
        120
      ),
    2
  );
  return `data:audio/mp3;base64,${b64}`;
}

// ================ TEXT-TO-VIDEO ================
const VIDEO_ENDPOINTS = ["/videos/generations", "/video/generations"];

export async function generateVideo(
  prompt: string,
  opts?: { imageUrl?: string; duration?: number; model?: string; aspectRatio?: string; negativePrompt?: string }
): Promise<{ video_url: string; status: string; id?: string; endpoint?: string; model: string }> {
  const model = opts?.model || DEFAULT_VIDEO_MODEL;
  const duration = Math.min(Math.max(opts?.duration || 5, 2), 8);
  const body: any = {
    model,
    prompt,
    duration,
    aspect_ratio: opts?.aspectRatio || "16:9",
    negative_prompt: opts?.negativePrompt || "blurry, low quality, distorted, deformed, watermark, text, ugly",
  };
  if (opts?.imageUrl && !opts.imageUrl.startsWith("data:")) body.image_url = opts.imageUrl;

  let lastErr: any = null;
  for (const ep of VIDEO_ENDPOINTS) {
    try {
      const data = await postJson(ep, body, 60);
      const item = data.data?.[0] ?? data;
      const url = item.url || item.video_url || item.output?.url || "";
      return {
        video_url: url,
        status: item.status || data.status || (url ? "ready" : "pending"),
        id: item.id || data.id || data.task_id,
        endpoint: ep,
        model,
      };
    } catch (e: any) {
      lastErr = e;
      if (e.status === 404) continue;
      throw e;
    }
  }
  throw new ApiError(
    `Text-to-Video belum tersedia untuk model "${model}" di akun ini (404 di semua endpoint). ` +
    `Cek dashboard api.hcnsec.cn untuk model video yang tersedia (Kling/Wan/Sora/dll), lalu kasih tau saya nama modelnya. ` +
    `Sementara pakai mode Slideshow + Spectrum.`,
    404,
    "video"
  );
}

export async function pollVideo(taskId: string, endpoint = "/videos/generations"): Promise<{ video_url: string; status: string }> {
  try {
    const r = await fetch(`${BASE_URL}${endpoint}/${taskId}`, { headers: h(), signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { video_url: "", status: "error" };
    const data = await r.json().catch(() => ({}));
    const item = data.data?.[0] ?? data;
    return { video_url: item.url || item.video_url || "", status: item.status || data.status || "unknown" };
  } catch {
    return { video_url: "", status: "error" };
  }
}

export function listModels() {
  return {
    chat: CHAT_MODELS,
    defaultChat: DEFAULT_CHAT_MODEL,
    defaultImage: DEFAULT_IMAGE_MODEL,
    defaultTts: DEFAULT_TTS_MODEL,
    defaultVideo: DEFAULT_VIDEO_MODEL,
  };
}

export { ApiError };
