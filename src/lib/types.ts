export type VizStyle = "bars" | "circle" | "particles" | "luxury";

export type AudioMode = "tts" | "music" | "both" | "none";
export type ImageSource = "ai" | "upload" | "both";

export interface Slide { id: string; imageUrl: string; caption?: string; }

export interface VideoProject {
  id?: string;
  title: string; niche: string; keywords: string[]; titles: string[];
  slides: Slide[]; vizStyle: VizStyle; vizColor: string; audioMode: AudioMode;
  slideDuration: number; audioUrl?: string; ttsText?: string; videoUrl?: string;
  status?: "draft" | "generating" | "ready" | "error";
  created_at?: string;
}

// Model diurutkan dari PALING CEPAT & MURAH ke yang berat
// Berdasarkan harga di screenshot:
//  - MiniMax-M2.7: $0.3/$1.2 per 1M (paling murah, ringan)
//  - glm-4.7: $0.25/$1.1 (cepat, model bagus)
//  - Qwen3.6-35B-A3B: $0.15/$1 (paling kecil, MoE 3B aktif, SUPER cepat)
//  - Qwen3.5-397B-A17B: $0.48/$2.88 (besar tapi andal)
//  - kimi-k2.6: $0.5/$1.99
//  - glm-5.1: $0.45/$2.1
//  - MiniMax-M3: $5/$5 (mahal)
//  - step-3.7-flash: $2/request (pay-per-request, lambat) — jangan dipakai default!
export const FAST_CHAT_MODELS = [
  "Qwen3.6-35B-A3B",     // paling kecil & cepat
  "glm-4.7",             // cepat, bagus
  "MiniMax-M2.7",        // murah
  "kimi-k2.6",           // cepat
  "Qwen3.5-397B-A17B",   // andal besar
  "Qwen3-Coder-Next-FP8",
  "glm-5.1",
  "sensenova-6.7-flash-lite",
  "sensenova-u1-fast",
  "Spark-X2-Flash",
  "stepaudio-2.5-chat",
  "MiniMax-M3",
  "step-3.7-flash",
  "Kimi-K2.6",
  "step-router-v1",
  "glm-5.2",
  "kat-coder-pro-v2",
  "kat-coder-pro-v2.5",
];

export const DEFAULT_CHAT_MODEL = FAST_CHAT_MODELS[0]; // Qwen3.6-35B-A3B — TERCEPAT
export const DEFAULT_IMAGE_MODEL = "step-image-edit-2";
export const DEFAULT_TTS_MODEL = "stepaudio-2.5-tts";
export const DEFAULT_VIDEO_MODEL = "kling-v1";
export const CHAT_MODELS = FAST_CHAT_MODELS; // backward compat
