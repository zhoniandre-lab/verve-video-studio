/* =====================================================================
   VERVE Studio — Shared Types
   ===================================================================== */

export type TrackKind = "video" | "audio" | "text" | "sticker";

export interface MediaItem {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  url: string;
  dur: number; // detik
  size?: number; // bytes
  type?: string; // mime
}

export interface ClipBlock {
  id: string;
  trackId: string;
  mediaId: string;
  start: number; // detik di timeline
  dur: number; // detik tampil
  trimStart: number; // detik offset dalam media
  trimEnd: number;
  opt?: Record<string, unknown>;
  autoTerminated?: boolean;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  height: number;
  color: string;
}

export { fmtTime } from "./time";
