

import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "./types";

const API_KEY = process.env.HCNSEC_API_KEY;
const BASE_URL = (process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1").replace(/\/$/, "");

function h() {
  if (!API_KEY) throw new Error("HCNSEC_API_KEY belum di-set di .env");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function post(path: string, body: any, timeout = 120) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout * 1000);
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify(body),
      signal: c.signal,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`API ${path} error ${r.status}: ${txt.slice(0, 400)}`);
    }
    if (path.endsWith("/speech")) {
      const buf = await r.arrayBuffer();
      return Buffer.from(buf).toString("base64");
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ================ CHAT ================
export async function chat(messages: { role: string; content: string }[], model?: string) {
  const data: any = await post("/chat/completions", {
    model: model || DEFAULT_CHAT_MODEL,
    messages,
    temperature: 0.8,
  });
  return (data.choices?.[0]?.message?.content || "").trim();
}

export async function generateKeywords(niche: string, n = 5, model?: string) {
  const sys =
    "Kamu adalah ahli SEO & content creator YouTube Shorts/TikTok. " +
    `Buat ${n} keyword/topik video yang menarik & banyak dicari untuk niche user. ` +
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
    .slice(0, n);
}

export async function generateTitles(keyword: string, niche: string, n = 3, model?: string) {
  const sys =
    "Kamu copywriter YouTube Shorts/TikTok profesional. " +
    `Buat ${n} judul video pendek (max 10 kata) untuk keyword: "${keyword}", niche "${niche}". ` +
    "Judul clickbait tapi jujur, boleh pakai angka/emo, menarik. " +
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
    .slice(0, n);
}

export async function generateScript(title: string, keyword: string, slides: number, model?: string) {
  const sys =
    `Buat narasi video singkat Bahasa Indonesia untuk video "${title}" (keyword: ${keyword}), ` +
    `bagi menjadi ${slides} baris, SATU BARIS PER SLIDE. Narasi santai, natural, gaya YouTube Shorts. ` +
    "Jangan pakai label apapun, cuma teks narasi.";
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
    .slice(0, slides);
}

export async function generateImagePrompt(title: string, keyword: string, niche: string, style: string) {
  const sys =
    "Buat 1 prompt text-to-image English yang detail untuk Stable Diffusion/DALL-E style, " +
    `bertema "${title}" keyword "${keyword}" niche "${niche}", style "${style}". ` +
    "Prompt harus deskriptif, ada lighting, composition, mood, color palette. " +
    "Output HANYA prompt saja, tanpa penjelasan.";
  return (
    await chat([
      { role: "system", content: sys },
      { role: "user", content: title },
    ])
  ).replace(/^["']|["']$/g, "");
}

// ================ IMAGE ================
export async function generateImage(prompt: string, size = "1024x1024", model?: string): Promise<string> {
  // returns base64 data url
  const body = { model: model || DEFAULT_IMAGE_MODEL, prompt, size, response_format: "b64_json", n: 1 };
  let data: any;
  try {
    data = await post("/images/generations", body, 180);
  } catch (e: any) {
    // fallback url
    data = await post("/images/generations", { ...body, response_format: "url" }, 180);
  }
  const item = data.data?.[0];
  if (!item) throw new Error("No image returned");
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return item.url;
  throw new Error("Unknown image response");
}

// ================ TTS ================
export async function generateSpeech(text: string, voice = "alloy", model?: string): Promise<string> {
  const b64: string = await post(
    "/audio/speech",
    { model: model || DEFAULT_TTS_MODEL, input: text, voice, response_format: "mp3" },
    180
  );
  return `data:audio/mp3;base64,${b64}`;
}

// ================ TEXT-TO-VIDEO ================
export async function generateVideo(
  prompt: string,
  opts?: { imageUrl?: string; duration?: number; model?: string; aspectRatio?: string }
): Promise<{ video_url: string; status: string; id?: string }> {
  // Coba endpoint standard OpenAI-compatible /videos/generations; jika tidak ada,
  // fallback ke /generations dengan modality=video.
  const model = opts?.model || DEFAULT_VIDEO_MODEL;
  const body: any = {
    model,
    prompt,
    duration: opts?.duration || 5,
    aspect_ratio: opts?.aspectRatio || "16:9",
  };
  if (opts?.imageUrl && !opts.imageUrl.startsWith("data:")) body.image_url = opts.imageUrl;

  let data: any;
  try {
    data = await post("/videos/generations", body, 300);
  } catch (e: any) {
    // coba path lain generik
    data = await post("/generations", { ...body, modality: "video" }, 300);
  }
  // bentuk response bisa {data:[{url:...}]} atau {task_id:...} (async)
  const item = data.data?.[0] ?? data;
  return {
    video_url: item.url || item.video_url || item.output?.url || "",
    status: item.status || data.status || "ready",
    id: item.id || data.id || data.task_id,
  };
}

export async function pollVideo(taskId: string, model?: string): Promise<{ video_url: string; status: string }> {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), 60 * 1000);
  try {
    const r = await fetch(`${BASE_URL}/videos/generations/${taskId}`, {
      headers: h(),
      signal: c.signal,
    });
    if (!r.ok) return { video_url: "", status: "error" };
    const data = await r.json();
    const item = data.data?.[0] ?? data;
    return {
      video_url: item.url || item.video_url || "",
      status: item.status || data.status || "unknown",
    };
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
