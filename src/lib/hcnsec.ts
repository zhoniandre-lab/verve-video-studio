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

if (!API_KEY) console.warn("[hcnsec] HCNSEC_API_KEY belum di-set");

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
      const msg = payload?.error?.message || payload?.message || payload?.msg || payload?.error ||
        (typeof payload === "string" ? payload : txt.slice(0, 400)) || `HTTP ${r.status}`;
      throw new ApiError(String(msg), r.status, path);
    }
    return payload;
  } catch (e: any) {
    if (e.name === "AbortError") throw new ApiError(`Timeout ${timeoutSec}s`, 504, path);
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || "Unknown error", 500, path);
  } finally { clearTimeout(to); }
}

async function retry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 800): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1))); }
  }
  throw lastErr;
}

// ===== CHAT (auto-fallback model cepat) =====
export async function chat(messages: { role: string; content: string }[], model?: string) {
  const errors: string[] = [];
  const models = model ? [model, ...FAST_CHAT_MODELS.filter(m => m !== model)] : FAST_CHAT_MODELS;
  const timeouts = [20, 25, 30, 40, 60];
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const to = timeouts[Math.min(i, timeouts.length - 1)];
    try {
      const data: any = await postJson("/chat/completions", {
        model: m, messages, temperature: 0.9, max_tokens: 500, stream: false,
      }, to);
      const out = (data.choices?.[0]?.message?.content || "").trim();
      if (out && out.length > 2) return out;
    } catch (e: any) {
      errors.push(`${m}: ${e.message?.slice(0, 50)}`);
      if (e.status === 401) throw new ApiError("API Key salah.", 401);
      if (e.status === 402) throw new ApiError("Saldo API habis.", 402);
      continue;
    }
  }
  throw new ApiError(`Semua model chat gagal:\n${errors.slice(0, 3).join("\n")}`, 504);
}

export async function generateKeywords(niche: string, n = 5, model?: string) {
  const sys = `List ${n} YouTube/TikTok SEO keywords (Bahasa Indonesia) untuk: ${niche}. 1 per baris, pendek, tanpa nomor.`;
  return (await chat([{ role: "user", content: sys }], model))
    .split("\n").map((l: string) => l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g, "").trim()).filter(Boolean).slice(0, n);
}

export async function generateTitles(keyword: string, niche: string, n = 3, model?: string) {
  // Prompt HIGH-CTR: gunakan angka, emosi, urgency, penasaran
  const sys =
    `Buat ${n} judul video YouTube Shorts/TikTok HIGH CTR untuk keyword "${keyword}" (niche: ${niche}). ` +
    `Judul: maks 8 kata, Bahasa Indonesia, clickbait tapi TIDAK bohong, ` +
    `pakai SALAH SATU pola: (1) Angka (mis: "5 Cara...", "3 Hal..."), ` +
    `(2) Penasaran (mis: "Ternyata...", "Jangan..."), ` +
    `(3) Emosi (mis: "Sedih Banget...", "Bikin Merinding..."), ` +
    `(4) Manfaat jelas (mis: "Bisa Bikin..."). 1 judul per baris, tanpa nomor.`;
  return (await chat([{ role: "user", content: sys }], model))
    .split("\n").map((l: string) => l.replace(/^[-•*0-9.)\s"]+|["\s]+$/g, "").trim()).filter(Boolean).slice(0, n);
}

export async function generateScript(title: string, keyword: string, slides: number, model?: string) {
  const sys = `Narasi singkat Bahasa Indonesia untuk video "${title}" (keyword: ${keyword}), ${slides} baris (1 baris=1 slide). Tiap baris 1 kalimat PENDEK, santai kayak ngobrol.`;
  return (await chat([{ role: "user", content: sys }], model))
    .split("\n").map((l: string) => l.replace(/^[-•*0-9.)\s"]+/, "").trim()).filter(Boolean).slice(0, slides);
}

// ===== Metadata untuk YouTube (siap copy) =====
export interface VideoMeta {
  titleHighCTR: string;
  titleAlternatives: string[];
  description: string;
  tags: string[];
  hashtags: string;
}

export async function generateMetadata(title: string, keyword: string, niche: string, model?: string): Promise<VideoMeta> {
  const sys =
    `Kamu YouTube SEO expert. Buat metadata untuk video Shorts dengan judul "${title}" (keyword utama: "${keyword}", niche: "${niche}").\n\n` +
    `Output dalam FORMAT TEPAT berikut (JANGAN tambah apapun sebelum/sesudah):\n\n` +
    `===TITLE===\n<1 judul utama HIGH CTR, maks 60 karakter>\n\n` +
    `===ALT_TITLES===\n<3 judul alternatif, 1 per baris>\n\n` +
    `===DESCRIPTION===\n<deskripsi 200-300 karakter Bahasa Indonesia, natural, ajak like-subscribe-komentar, sebut keyword 2x>\n\n` +
    `===TAGS===\n<10 tag keyword/kata kunci relevan, dipisah koma, tanpa #>\n\n` +
    `===HASHTAGS===\n<5 hashtag relevan mulai dengan #, dipisah spasi>`;
  const raw = await chat([{ role: "user", content: sys }], model);
  const get = (k: string) => {
    const re = new RegExp(`===${k}===\\n([\\s\\S]*?)(?=\\n===|$)`);
    const m = raw.match(re);
    return m ? m[1].trim() : "";
  };
  const titleHighCTR = get("TITLE").split("\n")[0]?.trim() || title;
  const titleAlternatives = get("ALT_TITLES")
    .split("\n")
    .map((s: string) => s.replace(/^[-•*0-9.)\s"]+|["\s]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const description = get("DESCRIPTION");
  const tags = get("TAGS")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
  const hashtags = get("HASHTAGS");
  return { titleHighCTR, titleAlternatives, description, tags, hashtags };
}

// ===== IMAGE =====
export const IMAGE_STYLES = [
  { id: "cinematic", label: "🎬 Cinematic 8K", suffix: "cinematic shot, 8k UHD, shot on ARRI Alexa, anamorphic lens, shallow depth of field, volumetric lighting, film grain, color graded, hyper detailed, photorealistic" },
  { id: "studio", label: "📸 Studio Photo", suffix: "professional studio photograph, 85mm f/1.4, crisp focus, studio lighting, softbox, high end retouching, 8k, hyperrealistic" },
  { id: "epic", label: "⚔️ Epic Fantasy", suffix: "epic fantasy concept art, octane render, unreal engine 5, dramatic god rays, cinematic lighting, hyper detailed, 8k, artstation trending" },
  { id: "anime", label: "🌸 Anime Premium", suffix: "anime key visual, makoto shinkai style, ultra detailed, vibrant colors, beautiful lighting, 4k illustration, cinematic anime" },
  { id: "cyberpunk", label: "🌃 Cyberpunk Neon", suffix: "cyberpunk aesthetic, neon lights, rain reflections, blade runner style, volumetric fog, ultra detailed 8k, ray tracing" },
  { id: "3d", label: "🧊 3D Pixar", suffix: "3D pixar style render, disney animation, octane render, soft lighting, adorable design, ultra detailed, cinema 4d, vibrant" },
  { id: "oil", label: "🎨 Oil Painting", suffix: "oil painting, rembrandt lighting, thick brush strokes, museum quality, chiaroscuro, master painter, 4k" },
  { id: "minimalist", label: "◻️ Minimalist", suffix: "minimalist aesthetic photography, clean composition, pastel colors, soft natural light, editorial, muted tones, 4k" },
];

const NATIVE_IMAGE_SIZE = "1024x1024";
const IMAGE_MODELS = [DEFAULT_IMAGE_MODEL, "step-1.5v-image", "dall-e-3", "flux-schnell", "flux", "sdxl"];

function extractUrl(item: any): string | null {
  if (!item) return null;
  if (typeof item === "string" && (item.startsWith("http") || item.startsWith("data:"))) return item;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  if (item.image_url) return typeof item.image_url === "string" ? item.image_url : item.image_url.url;
  if (item.image) return typeof item.image === "string"
    ? (item.image.startsWith("http") || item.image.startsWith("data:") ? item.image : `data:image/png;base64,${item.image}`) : null;
  return null;
}

interface GenImageResult { url: string; model: string; size: string; prompt: string; }

export async function generateImage(prompt: string, styleSuffix?: string, opts?: { modelFirst?: string }): Promise<GenImageResult> { // v10.1: seed/referensi DICABUT — bikin gateway nggantung → "Failed to fetch"
  // Generate selalu 1024x1024 (native), resize/crop di client
  const fullPrompt = styleSuffix
    ? `${prompt}, ${styleSuffix}, no text, no watermark, no logo, sharp focus, centered composition`
    : `${prompt}, no text, no watermark, sharp focus, centered composition`;
  const errors: string[] = [];
  // 🔒 v10.0 SATU WAJAH: model yang BERHASIL di-pin paling depan → semua adegan semodel, wajah sedarah
  const order = opts?.modelFirst && IMAGE_MODELS.includes(opts.modelFirst)
    ? [opts.modelFirst, ...IMAGE_MODELS.filter((m) => m !== opts.modelFirst)]
    : IMAGE_MODELS;
  for (const model of order) {
    for (const fmt of ["url", "b64_json"] as const) {
      try {
        const data = await postJson("/images/generations", { model, prompt: fullPrompt, size: NATIVE_IMAGE_SIZE, n: 1, response_format: fmt }, 45); // v10.1: 45d/attempt — tak boleh lewat anggaran serverless
        const item = data.data?.[0] ?? data;
        const url = extractUrl(item);
        if (url && url.length > 100) return { url, model, size: NATIVE_IMAGE_SIZE, prompt: fullPrompt };
      } catch (e: any) {
        if (e.status === 401) throw new ApiError("API Key salah.", 401);
        if (e.status === 402) throw new ApiError("Saldo API habis.", 402);
        if (/content.?policy|safety|inappropriate|blocked/i.test(e.message)) throw new ApiError("Prompt ditolak filter. Ganti kata-kata.", 400);
        errors.push(`${model}: ${e.message?.slice(0, 60)}`);
        if (/model.*not.*found|unknown.*model|invalid.*model/i.test(e.message)) break;
        if (/response_format|b64/i.test(e.message)) continue;
      }
    }
  }
  throw new ApiError(`Gagal generate gambar.\n${errors.slice(0,3).join("\n")}\n\n💡 Coba style lain atau upload gambar sendiri.`, 500);
}

// ===== TTS =====
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const b64: string = await retry(() => postJson("/audio/speech",
    { model: model || DEFAULT_TTS_MODEL, input: text.slice(0, 3500), voice, response_format: "mp3" }, 120));
  return `data:audio/mp3;base64,${b64}`;
}

// ===== VIDEO =====
const VIDEO_ENDPOINTS = ["/videos/generations", "/video/generations"];

export async function generateVideo(prompt: string, opts?: {
  imageUrl?: string; duration?: number; model?: string; aspectRatio?: string; negativePrompt?: string;
}): Promise<{ video_url: string; status: string; id?: string; endpoint?: string; model: string }> {
  const model = opts?.model || DEFAULT_VIDEO_MODEL;
  const duration = Math.min(Math.max(opts?.duration || 5, 2), 8);
  const body: any = { model, prompt, duration, aspect_ratio: opts?.aspectRatio || "16:9",
    negative_prompt: opts?.negativePrompt || "blurry, low quality, distorted, deformed, watermark, text, ugly" };
  if (opts?.imageUrl && !opts.imageUrl.startsWith("data:")) body.image_url = opts.imageUrl;
  for (const ep of VIDEO_ENDPOINTS) {
    try {
      const data = await postJson(ep, body, 60);
      const item = data.data?.[0] ?? data;
      return {
        video_url: item.url || item.video_url || item.output?.url || "",
        status: item.status || data.status || "pending",
        id: item.id || data.id || data.task_id, endpoint: ep, model,
      };
    } catch (e: any) { if (e.status === 404) continue; throw e; }
  }
  throw new ApiError(`Text-to-Video belum tersedia (model "${model}" 404). Pakai Slideshow dulu ya.`, 404, "video");
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
