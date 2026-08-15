import {
  FAST_CHAT_MODELS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "./types";
import { catatKredit, fiturDariPath, potongErr } from "./ledger";
import { gerbangFitur } from "./setelan";

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
  const t0 = Date.now(); // 🧾 L3: timer pencatat kredit (fire-and-forget, tak mengganggu alur)
  // 🎛 BOS (L3.5): kill switch + batas harian — dicek SEBELUM keluar duit AI.
  // Panggilan yang diblokir TIDAK dicatat ledger (blokir bukan kegagalan gateway).
  {
    const g = await gerbangFitur(fiturDariPath(path));
    if (g.blokir) { clearTimeout(to); throw new ApiError(g.alasan || "Fitur dimatikan sementara", 503, path); }
  }
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: "POST", headers: h(), body: JSON.stringify(body), signal: c.signal,
    });
    const isBinary = path.endsWith("/speech");
    if (isBinary) {
      if (!r.ok) throw new ApiError(`Audio ${r.status}`, r.status, path);
      const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
      catatKredit({ fitur: fiturDariPath(path), model: body?.model || null, endpoint: path, penyedia: "hcnsec", ok: true, ms: Date.now() - t0 });
      return b64;
    }
    const txt = await r.text();
    let payload: any;
    try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    if (!r.ok) {
      const msg = payload?.error?.message || payload?.message || payload?.msg || payload?.error ||
        (typeof payload === "string" ? payload : txt.slice(0, 400)) || `HTTP ${r.status}`;
      throw new ApiError(String(msg), r.status, path);
    }
    catatKredit({ fitur: fiturDariPath(path), model: body?.model || null, endpoint: path, penyedia: "hcnsec", ok: true, ms: Date.now() - t0 });
    return payload;
  } catch (e: any) {
    catatKredit({ fitur: fiturDariPath(path), model: body?.model || null, endpoint: path, penyedia: "hcnsec", ok: false, ms: Date.now() - t0, err: potongErr(e) });
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

// 🖼️🩹 v13.19 SADAR KATALOG — tanya gateway model gambar apa yang BENAR-BENAR dibuka akun (cache 10 mnt).
// Biang "No available channel": kita menawar model yang gateway tak jual. Kini yang dijual didahulukan.
let katalogCache: { t: number; ids: string[] } | null = null;
async function katalogGambar(): Promise<string[] | null> {
  if (katalogCache && Date.now() - katalogCache.t < 10 * 60 * 1000) return katalogCache.ids;
  try { const ids = await listGatewayModels(); katalogCache = { t: Date.now(), ids }; return ids; }
  catch { return null; }
}
const RE_MODEL_GAMBAR = /image|flux|seedream|doubao|dall|sdxl|sd3|imagen|kolors|hunyuan|ideogram|recraft|playground|dreamina/i;

export async function generateImage(prompt: string, styleSuffix?: string, opts?: { modelFirst?: string }): Promise<GenImageResult> { // v10.1: seed/referensi DICABUT — bikin gateway nggantung → "Failed to fetch"
  // Generate selalu 1024x1024 (native), resize/crop di client
  const t0gambar = Date.now(); // 🐛 v19.94: pagar total waktu (lihat loop model)
  const fullPrompt = styleSuffix
    ? `${prompt}, ${styleSuffix}, no text, no watermark, no logo, sharp focus, centered composition`
    : `${prompt}, no text, no watermark, sharp focus, centered composition`;
  const errors: string[] = [];
  // 🔒 v10.0 SATU WAJAH: model yang BERHASIL di-pin paling depan → semua adegan semodel, wajah sedarah
  let order = opts?.modelFirst && IMAGE_MODELS.includes(opts.modelFirst)
    ? [opts.modelFirst, ...IMAGE_MODELS.filter((m) => m !== opts.modelFirst)]
    : IMAGE_MODELS;
  const kat = await katalogGambar().catch(() => null);
  let katInfo = "";
  if (kat && kat.length) {
    const tersedia = order.filter((m) => kat.includes(m));
    const ekstra = kat.filter((id) => RE_MODEL_GAMBAR.test(id) && !order.includes(id)).slice(0, 4); // model gambar lain dagangan gateway
    const sisa = order.filter((m) => !kat.includes(m));
    order = [...new Set([...tersedia, ...ekstra, ...sisa])]; // dagangan nyata didahulukan; daftar lama jadi cadangan ekor
    katInfo = kat.slice(0, 5).join(", ");
  }
  for (const model of order) {
    for (const fmt of ["url", "b64_json"] as const) {
      // 🐛 v19.94 PAGAR WAKTU TOTAL: 6 model × 2 format × 45 dtk bisa > 60 dtk
      // (batas Vercel) → route timeout → "gagal generate" padahal server sehat.
      // Begitu total sudah 40 dtk, berhenti & balas error dengan sisa waktu utk pesan.
      if (Date.now() - t0gambar > 40000) {
        throw new ApiError(`Server gambar sibuk (coba > 40 dtk) — coba lagi sebentar, atau pakai upload foto.`, 504);
      }
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
  throw new ApiError(`Gagal generate gambar.\n${errors.slice(0,3).join("\n")}\n\n💡 Coba style lain atau upload gambar sendiri.${katInfo ? `\n\n📒 Katalog gateway-mu (kirim daftar ini ke admin kalau masih gagal): ${katInfo}` : ""}`, 500);
}

// ===== TTS =====
// 🐛 FIX v19.48: TTS tahan banting — "Audio 400" terjadi kalau model yang dipakai
// ditolak provider (model deprecated / tidak dikenali). Sekarang coba BEBERAPA
// model otomatis (stepaudio → tts-1 → gpt-4o-mini-tts) + beberapa format.
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const teks = text.slice(0, 3500);
  const models = model ? [model] : [DEFAULT_TTS_MODEL, "tts-1", "gpt-4o-mini-tts"];
  const formats = ["mp3", "wav", "aac"];
  let lastErr: any = null;
  for (const m of models) {
    for (const fmt of formats) {
      try {
        const b64: string = await retry(() => postJson("/audio/speech",
          { model: m, input: teks, voice, response_format: fmt }, 120));
        return `data:audio/${fmt === "mp3" ? "mpeg" : fmt};base64,${b64}`;
      } catch (e: any) {
        lastErr = e;
        // kalau 401/403 (key salah) jangan buang waktu coba model lain
        if (e?.status === 401 || e?.status === 403) throw e;
        // 400 = model/format ditolak → coba berikutnya
      }
    }
  }
  throw lastErr || new ApiError("TTS gagal di semua model", 500, "/audio/speech");
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

// 🔍 v12.0 BERBURU MODEL: tanya katalog gateway — model apa saja yang BENAR-BENAR dibuka
// grup akun kita (gateway model one-api umumnya membuka GET /models).
export async function listGatewayModels(): Promise<string[]> {
  const r = await fetch(`${BASE_URL}/models`, { headers: h(), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new ApiError(`Gagal membaca katalog model gateway (${r.status})`, r.status);
  const d = await r.json().catch(() => ({}));
  const arr = (d && (d.data || d.models)) || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((m: any) => String(m?.id || m?.name || m || "")).filter(Boolean);
}

export function listModels() {
  return { chat: CHAT_MODELS, imageStyles: IMAGE_STYLES, imageModels: IMAGE_MODELS,
    defaultChat: DEFAULT_CHAT_MODEL, defaultImage: DEFAULT_IMAGE_MODEL, defaultTts: DEFAULT_TTS_MODEL, defaultVideo: DEFAULT_VIDEO_MODEL };
}

export { ApiError };
