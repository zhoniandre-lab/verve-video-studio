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
  constructor(msg: string, status = 500, endpoint?: string) {
    super(msg);
    this.status = status;
    this.endpoint = endpoint;
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
    let payload: any;
    if (isBinary) {
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new ApiError(`Audio API error ${r.status}: ${txt.slice(0, 300)}`, r.status, path);
      }
      const buf = await r.arrayBuffer();
      return Buffer.from(buf).toString("base64");
    }
    const txt = await r.text();
    try { payload = JSON.parse(txt); } catch { payload = { raw: txt }; }
    if (!r.ok) {
      const msg =
        payload?.error?.message ||
        payload?.message ||
        payload?.error ||
        txt.slice(0, 300) ||
        `HTTP ${r.status}`;
      throw new ApiError(`API ${path} error ${r.status}: ${msg}`, r.status, path);
    }
    return payload;
  } catch (e: any) {
    if (e.name === "AbortError") throw new ApiError(`Request timeout (${timeoutSec}s) di ${path}. Coba lagi atau cek koneksi.`, 504, path);
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.message || "Unknown error", 500, path);
  } finally {
    clearTimeout(to);
  }
}

// Retry helper
async function retry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1500): Promise<T> {
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
    "Keyword harus beragam sudut pandang. Output HANYA list, 1 per baris, tanpa nomor, tanpa tanda petik, tanpa penjelasan.";
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
    "Judul clickbait tapi jujur, gunakan angka atau kata emosional yang membuat penasaran. " +
    "Output HANYA 1 judul per baris, tanpa nomor.";
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
    `Buat narasi video singkat Bahasa Indonesia untuk video berjudul "${title}" (keyword: ${keyword}), ` +
    `bagi menjadi ${slides} baris. SATU BARIS = SATU SLIDE. ` +
    "Narasi santai, natural, gaya host YouTube Shorts, tidak terlalu formal. " +
    "Total narasi sekitar " + (slides * 3) + " kalimat pendek. Jangan pakai label apapun.";
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
    "Buat 1 prompt text-to-image dalam Bahasa Inggris untuk gambar AI, sangat detail. " +
    `Tentang "${title}" dengan keyword "${keyword}", niche "${niche}", gaya visual "${style}". ` +
    "Sebutkan: shot type, lighting, color palette, mood, composition, focal point, detail. " +
    "Tambahkan 'no text, no watermark, high quality, sharp focus' di akhir. Output HANYA promptnya.";
  return (
    await chat([
      { role: "system", content: sys },
      { role: "user", content: title },
    ])
  ).replace(/^["']|["']$/g, "");
}

export async function enhancePrompt(raw: string, type: "video" | "image" = "video") {
  const sys =
    type === "video"
      ? "Ubah prompt user menjadi prompt video AI profesional (Bahasa Inggris). Tambahkan shot type, lighting, camera motion, mood, quality tags (4k, cinematic, smooth motion). Output HANYA prompt."
      : "Ubah prompt user menjadi prompt gambar AI profesional (Bahasa Inggris). Tambahkan style, lighting, composition. Output HANYA prompt.";
  return (
    await chat([
      { role: "system", content: sys },
      { role: "user", content: raw },
    ])
  ).replace(/^["']|["']$/g, "");
}

// ================ IMAGE ================
export async function generateImage(prompt: string, size = "1024x1024", model?: string): Promise<string> {
  const body = { model: model || DEFAULT_IMAGE_MODEL, prompt, size, response_format: "b64_json", n: 1 };
  let data: any;
  try {
    data = await retry(() => postJson("/images/generations", body, 120), 2);
  } catch (e: any) {
    data = await retry(
      () => postJson("/images/generations", { ...body, response_format: "url" }, 120),
      2
    );
  }
  const item = data.data?.[0];
  if (!item) throw new ApiError("Tidak ada gambar yang dikembalikan AI");
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  throw new ApiError("Format response gambar tidak dikenali");
}

// ================ TTS ================
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const b64: string = await retry(
    () =>
      postJson(
        "/audio/speech",
        { model: model || DEFAULT_TTS_MODEL, input: text.slice(0, 4000), voice, response_format: "mp3" },
        120
      ),
    2
  );
  return `data:audio/mp3;base64,${b64}`;
}

// ================ TEXT-TO-VIDEO ================
// Coba beberapa endpoint umum yang dipakai OpenAI-compatible video APIs.
const VIDEO_ENDPOINTS = [
  "/videos/generations",          // OpenAI/Runway/Kling style
  "/video/generations",           // alt
];

export async function generateVideo(
  prompt: string,
  opts?: {
    imageUrl?: string;
    duration?: number;
    model?: string;
    aspectRatio?: string;
    negativePrompt?: string;
  }
): Promise<{ video_url: string; status: string; id?: string; endpoint?: string }> {
  const model = opts?.model || DEFAULT_VIDEO_MODEL;
  const duration = Math.min(Math.max(opts?.duration || 5, 2), 10); // cap 10s biar cepat & hemat
  const body: any = {
    model,
    prompt,
    duration,
    aspect_ratio: opts?.aspectRatio || "16:9",
    negative_prompt: opts?.negativePrompt || "blurry, low quality, distorted, deformed, watermark, text",
  };
  if (opts?.imageUrl && !opts.imageUrl.startsWith("data:")) body.image_url = opts.imageUrl;
  // juga coba field alternatif
  body.frames = undefined;
  body.cfg_scale = 7;

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
      };
    } catch (e: any) {
      lastErr = e;
      // kalau 404 di endpoint ini, coba yang berikutnya
      if (e.status === 404) continue;
      // error lain: tidak usah coba endpoint lain karena masalah auth/dll
      throw e;
    }
  }
  // Semua endpoint 404: berarti provider tidak support T2V lewat endpoint ini
  const msg =
    `Text-to-Video tidak tersedia di akun ini (semua endpoint video me-return 404). ` +
    `Kemungkinan: (1) model "${model}" belum ada di api.hcnsec.cn, ` +
    `(2) akun kamu belum berlangganan paket video AI, ` +
    `(3) endpoint membutuhkan nama model lain. ` +
    `Coba cek di dashboard https://api.hcnsec.cn apakah ada model video (seperti Kling, Wan, Sora, dll) lalu masukkan nama modelnya di Settings. ` +
    `Untuk saat ini gunakan mode Slideshow + Spectrum yang 100% berjalan.`;
  throw new ApiError(msg, 404, "video");
}

export async function pollVideo(taskId: string, endpoint = "/videos/generations"): Promise<{ video_url: string; status: string }> {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), 30 * 1000);
  try {
    const r = await fetch(`${BASE_URL}${endpoint}/${taskId}`, {
      headers: h(),
      signal: c.signal,
    });
    if (!r.ok) return { video_url: "", status: "error" };
    const data = await r.json().catch(() => ({}));
    const item = data.data?.[0] ?? data;
    return {
      video_url: item.url || item.video_url || "",
      status: item.status || data.status || "unknown",
    };
  } catch {
    return { video_url: "", status: "error" };
  } finally {
    clearTimeout(to);
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
