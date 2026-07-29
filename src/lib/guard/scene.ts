/* 🛡️ VERVE GUARD · SCENE PLANNER
   Otak kecil untuk Sutradara/Storyboard: klasifikasi adegan → saran durasi, gerak, transisi.
   Pure function, ringan, cocok HP. */

export type SceneKind = "action" | "dialogue" | "establishing" | "emotion" | "default";

export type ScenePlan = {
  kind: SceneKind;
  duration: number;
  motion: number;      // 0..1 — seberapa banyak gerak kamera/video
  transition: "cut" | "dissolve" | "zoom" | "blur";
  captionBias: "short" | "normal" | "lyric";
  reason: string;
};

const KATA: Record<SceneKind, string[]> = {
  action: ["lari", "berlari", "kejar", "mengejar", "jatuh", "bentrok", "ledakan", "cepat", "panik", "fight", "run", "chase", "explosion", "battle"],
  dialogue: ["bicara", "berkata", "ngomong", "dialog", "telepon", "menjawab", "berbisik", "speaks", "talk", "conversation", "phone"],
  establishing: ["suasana", "desa", "kota", "rumah", "jalan", "sawah", "langit", "gunung", "pantai", "wide", "establishing", "landscape", "overview"],
  emotion: ["sedih", "menangis", "rindu", "haru", "kecewa", "sendiri", "peluk", "tersenyum", "crying", "sad", "lonely", "emotional", "hug"],
  default: [],
};

function hitung(teks: string, words: string[]): number {
  let score = 0;
  for (const w of words) {
    const re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`, "i");
    if (re.test(teks)) score++;
  }
  return score;
}

export function classifySceneKind(text: string): SceneKind {
  const clean = String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const scores: [SceneKind, number][] = ["action", "dialogue", "establishing", "emotion"].map((k) => [k as SceneKind, hitung(clean, KATA[k as SceneKind])]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "default";
}

export function scenePlan(text: string): ScenePlan {
  const kind = classifySceneKind(text);
  switch (kind) {
    case "action":
      return { kind, duration: 3.8, motion: 0.9, transition: "cut", captionBias: "short", reason: "adegan aksi cocok dipotong cepat dan motion tinggi" };
    case "dialogue":
      return { kind, duration: 6.5, motion: 0.28, transition: "dissolve", captionBias: "normal", reason: "dialog perlu napas lebih panjang agar teks terbaca" };
    case "establishing":
      return { kind, duration: 7.5, motion: 0.35, transition: "blur", captionBias: "normal", reason: "suasana pembuka cocok long shot pelan" };
    case "emotion":
      return { kind, duration: 6.8, motion: 0.22, transition: "dissolve", captionBias: "lyric", reason: "adegan emosional cocok slow cinematic dan lirik terasa" };
    default:
      return { kind, duration: 5.2, motion: 0.45, transition: "dissolve", captionBias: "normal", reason: "default aman untuk cerita jadi lagu" };
  }
}

export function planScenes<T extends { scene_desc?: string; visual_prompt?: string; dur?: number }>(scenes: T[]): (T & { plan: ScenePlan })[] {
  return (scenes || []).map((s) => ({ ...s, plan: scenePlan(`${s.scene_desc || ""} ${s.visual_prompt || ""}`) }));
}
