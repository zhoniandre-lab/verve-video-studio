/* 🎬 Cinematic Prompt Kit — template aman untuk bikin klip terasa seperti film.
   Prinsip: jangan ubah subjek utama; perubahan lokal VERVE hanya filter/grade/gerak/letterbox. */

import type { AdjustState } from "@/lib/editing";

export type CinematicPromptInput = {
  mainSubject?: string;
  lightingStyle?: string;
  cameraMovement?: string;
  colourStyle?: string;
  visualMood?: string;
  keepDetails?: string;
};

export const CINEMATIC_DEFAULTS: Required<CinematicPromptInput> = {
  mainSubject: "main subject",
  lightingStyle: "warm sunset light",
  cameraMovement: "slow cinematic camera movement",
  colourStyle: "soft contrast and subtle film color grading",
  visualMood: "premium cinematic visual mood",
  keepDetails: "identity, outfit, background, and original body movement",
};

export const VERVE_CINEMATIC_ADJUST: AdjustState = {
  b: -2,
  e: 0,
  c: 12,
  s: -8,
  tem: 12,
  hue: -3,
  fade: 9,
  vig: 82,
  grain: 7,
};

export function cleanPromptPart(v: string | undefined, fallback: string): string {
  return String(v || fallback).replace(/\s+/g, " ").trim().slice(0, 160);
}

export function buildCinematicEditPrompt(input: CinematicPromptInput = {}): string {
  const d = { ...CINEMATIC_DEFAULTS, ...input };
  return [
    `Edit this video into a cinematic clip.`,
    `Keep ${cleanPromptPart(d.mainSubject, CINEMATIC_DEFAULTS.mainSubject)} unchanged.`,
    `Improve the lighting to look like ${cleanPromptPart(d.lightingStyle, CINEMATIC_DEFAULTS.lightingStyle)}.`,
    `Add ${cleanPromptPart(d.cameraMovement, CINEMATIC_DEFAULTS.cameraMovement)}, ${cleanPromptPart(d.colourStyle, CINEMATIC_DEFAULTS.colourStyle)}, and ${cleanPromptPart(d.visualMood, CINEMATIC_DEFAULTS.visualMood)}.`,
    `Do not change ${cleanPromptPart(d.keepDetails, CINEMATIC_DEFAULTS.keepDetails)}.`,
  ].join(" ");
}

export function buildVerveCinematicStudioSummary(): string {
  return [
    "🎬 Cinematic Kit aktif:",
    "- subjek utama tidak diubah",
    "- filter sinematik + grade hangat lembut",
    "- gerak kamera pelan tiap adegan",
    "- letterbox bioskop",
    "- grain/vignette halus",
  ].join("\n");
}
