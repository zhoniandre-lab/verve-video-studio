export type VizStyle = "bars" | "circle" | "particles" | "luxury";

export type AudioMode = "tts" | "music" | "both" | "none";

export type ImageSource = "ai" | "upload" | "both";

export interface Slide {
  id: string;
  imageUrl: string; // data URL atau object URL
  caption?: string;
}

export interface VideoProject {
  id?: string;
  title: string;
  niche: string;
  keywords: string[];
  titles: string[]; // judul video
  script?: string;
  slides: Slide[];
  vizStyle: VizStyle;
  vizColor: string; // hex
  audioMode: AudioMode;
  slideDuration: number;
  audioUrl?: string; // data URL music
  ttsText?: string;
  videoUrl?: string; // hasil final
  status?: "draft" | "generating" | "ready" | "error";
  created_at?: string;
}

// ===== Config model =====
export const CHAT_MODELS = [
  "step-3.7-flash",
  "MiniMax-M3",
  "MiniMax-M2.7",
  "Qwen3.5-397B-A17B",
  "Qwen3.6-35B-A3B",
  "Qwen3-Coder-Next-FP8",
  "glm-5.1",
  "glm-5.2",
  "kimi-k2.6",
  "Kimi-K2.6",
  "sensenova-6.7-flash-lite",
  "sensenova-u1-fast",
  "Spark-X2-Flash",
  "step-router-v1",
  "stepaudio-2.5-chat",
];
export const DEFAULT_IMAGE_MODEL = "step-image-edit-2";
export const DEFAULT_TTS_MODEL = "stepaudio-2.5-tts";
// Candidate text-to-video model (common names, bisa diganti di settings)
export const DEFAULT_VIDEO_MODEL = "kling-v1";
export const DEFAULT_CHAT_MODEL = "step-3.7-flash";
