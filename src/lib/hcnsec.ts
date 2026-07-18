import {
  FAST_CHAT_MODELS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "./types";

const API_KEY = process.env.HCNSEC_API_KEY;
const BASE_URL = (process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1").replace(/\/$/, "");

if (!API_KEY) {
  console.warn("[hcnsec] HCNSEC_API_KEY belum di-set");
}

function h() {
  if (!API_KEY) throw new Error("HCNSEC_API_KEY belum di-set di Vercel → Settings → Environment Variables.");
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

class ApiError extends Error {
  status: number;
  endpoint?: string;
  constructor(msg: string, status = 500, endpoint?: string) { super(msg); this.status = status; this.endpoint = endpoint; }
}

async function postJson(path: string, body: any, timeoutSec = 120): Promise<any> {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutSec * 1000);
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: "POST", headers: h(), body: JSON.stringify(body), signal: c.signal,
    });
    const isBinary = path.endsWith("/speech");
    if (isBinary) {
      if (!r.ok) throw new ApiError(`Audio ${r.status}`, r.status, path);
      return Buffer.from(await r.arrayBuffer()).toString("base64");
    }
    const txt = await r.text();
    let payload: any;
    try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    if (!r.ok) {
      const msg =
        payload?.error?.message || payload?.message || payload?.msg || payload?.error ||
        (typeof payload === "string" ? payload : txt.slice(0, 400)) || `HTTP ${r.status}`;
      throw new ApiError(String(msg), r.status, path);
    }
    return payload;
  } catch (e: any) {
    if (e.name === "AbortError") throw new ApiError(`Timeout ${timeoutSec}s di ${path}`, 504, path);
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || "Unknown error", 500, path);
  } finally {
    clearTimeout(to);
  }
}
async function retry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 800): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs*(i+1))); }
  }
  throw lastErr;
}

// ============== CHAT ==============
// Coba model cepat satu-persatu dengan timeout pendek, auto-fallback jika lambat/error
export async function chat(messages: { role: string; content: string }[], model?: string) {
  const errors: string[] = [];
  const models = model ? [model, ...FAST_CHAT_MODELS.filter(m => m !== model)] : FAST_CHAT_MODELS;
  const timeouts = [20, 25, 30, 40]; // timeout per model, makin lama untuk model cadangan
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const to = timeouts[Math.min(i, timeouts.length - 1)];
    try {
      const data: any = await postJson("/chat/completions", {
        model: m,
        messages,
        temperature: 0.9,
        max_tokens: 400,   // batasi output agar jawaban pendek & cepat
        stream: false,
      }, to);
      const out = (data.choices?.[0]?.message?.content || "").trim();
      if (out && out.length > 2) return out;
    } catch (e: any) {
      errors.push(`${m}: ${e.message?.slice(0,60)}`);
      // Auth/Quota error jangan coba model lain
      if (e.status === 401) throw new ApiError("API Key salah / invalid.", 401);
      if (e.status === 402) throw new ApiError("Saldo API habis, top up di api.hcnsec.cn.", 402);
      continue; // coba model berikutnya
    }
  }
  throw new ApiError(`Semua model chat gagal/timeout:\n${errors.slice(0,4).join("\n")}`, 504);
}

export async function generateKeywords(niche: string, n = 5, model?: string) {
  const sys = `List ${n} YouTube/TikTok SEO keywords (Bahasa Indonesia) untuk: ${niche}. Hanya 1 per baris, tanpa nomor, pendek.`;
  return (await chat([{role:"user",content:sys}], model))
    .split("\n").map((l:string)=>l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g,"").trim()).filter(Boolean).slice(0,n);
}

export async function generateTitles(keyword: string, niche: string, n = 3, model?: string) {
  const sys = `Buat ${n} judul YouTube Shorts (maks 8 kata, Bahasa Indonesia) untuk keyword "${keyword}" (niche: ${niche}). 1 per baris, tanpa nomor. Judul clickbait-pendek.`;
  return (await chat([{role:"user",content:sys}], model))
    .split("\n").map((l:string)=>l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g,"").trim()).filter(Boolean).slice(0,n);
}

export async function generateScript(title: string, keyword: string, slides: number, model?: string) {
  const sys = `Narasi video singkat "${title}" (keyword: ${keyword}), ${slides} baris (1 baris=1 slide). Bahasa Indonesia santai, tiap baris 1 kalimat pendek.`;
  return (await chat([{role:"user",content:sys}], model))
    .split("\n").map((l:string)=>l.replace(/^[-•*0-9.)\s"]+/,"").trim()).filter(Boolean).slice(0,slides);
}

// ============== IMAGE PROMPT ==============
// Art style presets buat hasil "WAH"
export const IMAGE_STYLES = [
  { id: "cinematic", label: "🎬 Cinematic 8K",
    suffix: "cinematic shot, 8k UHD, shot on ARRI Alexa, anamorphic lens, shallow depth of field, volumetric lighting, film grain, color graded, hyper detailed, photorealistic, epic composition" },
  { id: "studio", label: "📸 Studio Photo",
    suffix: "professional studio photograph, 85mm f/1.4 lens, crisp focus, studio lighting, softbox, high end retouching, 8k, hyperrealistic, award winning photography" },
  { id: "epic", label: "⚔️ Epic Fantasy",
    suffix: "epic fantasy concept art, octane render, unreal engine 5, dramatic god rays, cinematic lighting, hyper detailed, 8k, matte painting, artstation trending, greg rutkowski style" },
  { id: "anime", label: "🌸 Anime Premium",
    suffix: "anime key visual, makoto shinkai style, ultra detailed, vibrant colors, beautiful lighting, studio ghibli inspired, 4k, illustration, intricate details, cinematic anime scene" },
  { id: "cyberpunk", label: "🌃 Cyberpunk Neon",
    suffix: "cyberpunk 2077 aesthetic, neon lights, rain reflections, blade runner style, cinematic, volumetric fog, ultra detailed, 8k, ray tracing, vibrant neon colors, night city" },
  { id: "3d", label: "🧊 3D Render Pixar",
    suffix: "3D pixar style render, disney animation, octane render, soft lighting, adorable character design, ultra detailed, cinema 4d, vibrant colors, subsurface scattering, 8k" },
  { id: "oil", label: "🎨 Oil Painting",
    suffix: "oil painting, classical art, rembrandt lighting, thick brush strokes, museum quality, dramatic chiaroscuro, highly detailed, romanticism, master painter, 4k" },
  { id: "minimalist", label: "◻️ Minimalist Aesthetic",
    suffix: "minimalist aesthetic photography, clean composition, pastel colors, soft natural light, negative space, editorial, muted tones, instagram aesthetic, 4k" },
];

// ============== IMAGE GENERATION ==============
// Ukuran yang umumnya didukung OpenAI-compatible APIs
const SAFE_SIZES = ["1024x1024", "1024x1792", "1792x1024", "512x512", "768x768"];
const IMAGE_MODELS = [
  DEFAULT_IMAGE_MODEL,
  "step-image-edit-2",
  "step-1.5v-image",
  "dall-e-3",
  "dall-e-2",
  "stable-diffusion-xl",
  "sdxl",
  "flux",
  "flux-schnell",
  "flux-pro",
  "midjourney",
  "imagen-3",
];

function extractUrl(item: any): string | null {
  if (!item) return null;
  if (typeof item === "string" && (item.startsWith("http") || item.startsWith("data:"))) return item;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  if (item.image_url) return typeof item.image_url === "string" ? item.image_url : item.image_url.url;
  if (item.image) return typeof item.image === "string"
    ? (item.image.startsWith("http") || item.image.startsWith("data:") ? item.image : `data:image/png;base64,${item.image}`)
    : null;
  return null;
}

interface GenImageResult { url: string; model: string; size: string; prompt: string; }

export async function generateImage(prompt: string, styleSuffix?: string, size = "1024x1024"): Promise<GenImageResult> {
  const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}, no text, no watermark, no logo, sharp focus` : `${prompt}, no text, no watermark, sharp focus`;
  const errors: string[] = [];
  // urutkan size: yang diminta dulu, lalu yang lain
  const sizes = [size, ...SAFE_SIZES.filter(s => s !== size)];

  for (const model of IMAGE_MODELS) {
    for (const sz of sizes) {
      for (const fmt of ["url", "b64_json"] as const) {
        try {
          // body minimal — hanya field yang umum
          const body: any = { model, prompt: fullPrompt, size, n: 1, response_format: fmt };
          const data = await postJson("/images/generations", body, 90);
          const item = data.data?.[0] ?? data;
          const url = extractUrl(item);
          if (url && url.length > 100) return { url, model, size: sz, prompt: fullPrompt };
        } catch (e: any) {
          // Auth / quota / content-policy: jangan coba model lain
          if (e.status === 401) throw new ApiError("API Key salah / tidak valid. Cek HCNSEC_API_KEY.", 401);
          if (e.status === 402) throw new ApiError("Saldo API habis. Top up di api.hcnsec.cn.", 402);
          if (/content.?policy|safety|inappropriate|blocked|nsfw/i.test(e.message)) {
            throw new ApiError("Prompt ditolak safety filter. Coba ubah kata-kata dalam prompt.", 400);
          }
          errors.push(`${model}/${sz}/${fmt}: ${e.message.slice(0,80)}`);
          // kalau model not found, break size loop untuk model ini
          if (/model.*not.*found|unknown.*model|invalid.*model|does not exist/i.test(e.message)) break;
          // size tidak didukung, coba size berikut
          if (/size|resolution|dimension/i.test(e.message)) continue;
          // format tidak didukung, coba format lain
          if (/response_format|b64/i.test(e.message)) continue;
        }
      }
    }
  }
  throw new ApiError(
    `Gagal generate gambar dengan semua kombinasi.\n\n${errors.slice(0,6).join("\n")}\n\n💡 Coba style lain atau upload gambar sendiri.`,
    500, "/images/generations"
  );
}

export async function enhancePrompt(basePrompt: string, style = "cinematic"): Promise<string> {
  // Prompt pendek agar cepat
  const user = `Buat prompt gambar English detail untuk tema "${basePrompt}" style ${style}. Tambah lighting & composition. Hanya 1 kalimat pendek.`;
  return (await chat([{ role: "user", content: user }]));
}

// ============== TTS ==============
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const b64: string = await retry(() => postJson("/audio/speech",
    { model: model || DEFAULT_TTS_MODEL, input: text.slice(0, 3500), voice, response_format: "mp3" }, 120));
  return `data:audio/mp3;base64,${b64}`;
}

// ============== TEXT-TO-VIDEO ==============
const VIDEO_ENDPOINTS = ["/videos/generations", "/video/generations"];

export async function generateVideo(prompt: string, opts?: {
  imageUrl?: string; duration?: number; model?: string; aspectRatio?: string; negativePrompt?: string;
}): Promise<{ video_url: string; status: string; id?: string; endpoint?: string; model: string }> {
  const model = opts?.model || DEFAULT_VIDEO_MODEL;
  const duration = Math.min(Math.max(opts?.duration || 5, 2), 8);
  const body: any = { model, prompt, duration,
    aspect_ratio: opts?.aspectRatio || "16:9",
    negative_prompt: opts?.negativePrompt || "blurry, low quality, distorted, deformed, watermark, text, ugly",
  };
  if (opts?.imageUrl && !opts.imageUrl.startsWith("data:")) body.image_url = opts.imageUrl;
  let lastErr: any = null;
  for (const ep of VIDEO_ENDPOINTS) {
    try {
      const data = await postJson(ep, body, 60);
      const item = data.data?.[0] ?? data;
      return {
        video_url: item.url || item.video_url || item.output?.url || "",
        status: item.status || data.status || "pending",
        id: item.id || data.id || data.task_id, endpoint: ep, model,
      };
    } catch (e: any) { lastErr = e; if (e.status === 404) continue; throw e; }
  }
  throw new ApiError(
    `Text-to-Video belum tersedia di akun (model "${model}" tidak ditemukan/404). ` +
    `Cek dashboard api.hcnsec.cn untuk model video yang tersedia. ` +
    `Sementara pakai mode Slideshow + Spectrum yang keren.`, 404, "video"
  );
}

export async function pollVideo(taskId: string, endpoint = "/videos/generations"): Promise<{ video_url: string; status: string }> {
  try {
    const r = await fetch(`${BASE_URL}${endpoint}/${taskId}`, { headers: h(), signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { video_url: "", status: "error" };
    const data = await r.json().catch(() => ({}));
    const item = data.data?.[0] ?? data;
    return { video_url: item.url || item.video_url || "", status: item.status || data.status || "unknown" };
  } catch { return { video_url: "", status: "error" }; }
}

export function listModels() {
  return { chat: CHAT_MODELS, imageStyles: IMAGE_STYLES, imageModels: IMAGE_MODELS,
    defaultChat: DEFAULT_CHAT_MODEL, defaultImage: DEFAULT_IMAGE_MODEL, defaultTts: DEFAULT_TTS_MODEL, defaultVideo: DEFAULT_VIDEO_MODEL };
}

export { ApiError };
