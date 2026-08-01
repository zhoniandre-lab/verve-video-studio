/* =====================================================================
   VERVE Studio — Project Store
   - Save/load project ke localStorage (nggak hilang pas refresh)
   - Struktur: tracks, clips, media refs
   - Version: v1 (simple JSON)
   ===================================================================== */

import type { Track, ClipBlock, MediaItem } from "./types";

const STORAGE_KEY = "verve-studio-project-v1";

export interface ProjectState {
  version: 1;
  tracks: Track[];
  clips: ClipBlock[];
  media: MediaItem[];
  savedAt: number;
}

export function saveProject(state: ProjectState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // quota exceeded or storage disabled — silent fail
    console.warn("[verve-studio] saveProject failed:", e);
  }
}

export function loadProject(): ProjectState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return null;
    return parsed as ProjectState;
  } catch {
    return null;
  }
}

export function clearProject(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function newProject(): ProjectState {
  return {
    version: 1,
    tracks: [],
    clips: [],
    media: [],
    savedAt: Date.now(),
  };
}
