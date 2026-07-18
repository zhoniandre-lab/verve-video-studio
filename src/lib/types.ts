export type VizStyle =
  | "luxury"        // Trap Nation premium (default)
  | "bars"          // Classic neon bottom bars
  | "circle"        // NCS radial wave
  | "ncs"           // alias for circle
  | "particles"     // Dot particles + ring
  | "trapnation"    // Classic Trap Nation circular waves
  | "monstercat"    // Monstercat dots radial
  | "proximity"     // Proximity mirror bars
  | "retrowave"     // Synthwave sun + grid
  | "dubstep"       // Middle gravity bars
  | "tunnel";       // 3D tunnel

export type AudioMode = "tts" | "music" | "both" | "none" | "aimusic";
export type ImageSource = "ai" | "upload" | "both" | "storyboard";

export interface Slide { id: string; imageUrl: string; caption?: string; lyric?: string; }

export interface StoryScene {
  scene: number;
  scene_desc: string;
  lyric_line: string;
  visual_prompt: string;
  mood: string;
  imageUrl?: string;
}
export interface Storyboard {
  title?: string;
  style_visual?: string;
  color_grade?: string;
  scenes: StoryScene[];
}

export interface Lyrics {
  title?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  style_prompt_suno?: string;
  lyrics?: string;
}

export interface VideoProject {
  id?: string;
  title: string; niche: string; keywords: string[]; titles: string[];
  slides: Slide[]; vizStyle: VizStyle; vizColor: string; audioMode: AudioMode;
  slideDuration: number; transitionDuration?: number;
  slideshowTransition?: string;
  audioUrl?: string; ttsText?: string; videoUrl?: string;
  status?: "draft" | "generating" | "ready" | "error";
  quality?: string;
  aspectRatio?: string;
  showTitle?: boolean;
  metadata?: any;
  created_at?: string;
}

// Model diurutkan dari PALING CEPAT & MURAH ke yang berat
export const FAST_CHAT_MODELS = [
  "Qwen3.6-35B-A3B",
  "glm-4.7",
  "MiniMax-M2.7",
  "kimi-k2.6",
  "Qwen3.5-397B-A17B",
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

export const VIZ_STYLES: {id:VizStyle; label:string; emoji:string; desc:string}[] = [
  { id:"luxury",     label:"Trap Nation Premium", emoji:"🔥", desc:"Logo berdenyut + bars + partikel" },
  { id:"trapnation", label:"Trap Nation Classic", emoji:"🎧", desc:"Lingkaran gelombang klasik" },
  { id:"circle",     label:"NCS Circle Wave",    emoji:"💫", desc:"Gelombang radial biru" },
  { id:"monstercat", label:"Monstercat Dots",    emoji:"🔴", desc:"Titik-titik radial" },
  { id:"proximity",  label:"Proximity Mirror",   emoji:"🪞", desc:"Bars mirror atas-bawah" },
  { id:"bars",       label:"Classic Bars",       emoji:"📊", desc:"Bars neon bawah" },
  { id:"dubstep",    label:"Dubstep Gravity",    emoji:"🌀", desc:"Bars dari tengah" },
  { id:"particles",  label:"Particles",          emoji:"✨", desc:"Titik-titik beat" },
  { id:"retrowave",  label:"Retro/Synthwave",    emoji:"🌆", desc:"Matahari + grid 80an" },
  { id:"tunnel",     label:"3D Tunnel",          emoji:"🚇", desc:"Terowongan 3D" },
];

export const TRANSITION_STYLES: {id: string; label:string; emoji:string}[] = [
  { id:"zoom",   label:"Slow Zoom",  emoji:"🔍" },
  { id:"fade",   label:"Fade",       emoji:"🌫️" },
  { id:"slide",  label:"Slide",      emoji:"➡️" },
  { id:"blur",   label:"Blur",       emoji:"💨" },
  { id:"glitch", label:"Glitch/RGB", emoji:"⚡" },
  { id:"none",   label:"Cut",        emoji:"✂️" },
];

export const QUALITY_OPTIONS = [
  { id:"fast",     label:"⚡ Cepat (HP)",   bitrate:"1.5 Mbps", res:"480p",  fps:24, tag:"Rekomendasi HP" },
  { id:"balanced", label:"⚖️ Seimbang",     bitrate:"3.5 Mbps", res:"720p",  fps:30, tag:"Default" },
  { id:"high",     label:"💎 Tinggi",       bitrate:"6 Mbps",   res:"1080p", fps:30, tag:"Laptop" },
  { id:"max",      label:"🚀 MAX (60fps)",  bitrate:"9 Mbps",   res:"1080p", fps:60, tag:"PC Gaming" },
];

export const ASPECT_RATIOS = [
  { id:"16:9", label:"🖥️ 16:9 YouTube",     w:1920, h:1080 },
  { id:"9:16", label:"📱 9:16 Shorts/TikTok", w:1080, h:1920 },
  { id:"1:1",  label:"⬛ 1:1 Instagram",    w:1080, h:1080 },
];

export const DEFAULT_CHAT_MODEL = FAST_CHAT_MODELS[0];
export const DEFAULT_IMAGE_MODEL = "step-image-edit-2";
export const DEFAULT_TTS_MODEL = "stepaudio-2.5-tts";
export const DEFAULT_VIDEO_MODEL = "kling-v1";
export const CHAT_MODELS = FAST_CHAT_MODELS;
