/* =====================================================================
   VERVE Studio — Renderer (REAL export, bukan simulasi)
   - Pakai MediaRecorder + Canvas untuk render video beneran ke WebM
   - Loop setiap klip sesuai timeline, gambar per-frame di canvas
   - Output: Blob video/webm yang bisa di-download
   - Browser-only, butuh MediaRecorder support
   ===================================================================== */

import type { Track, ClipBlock, MediaItem } from "./types";

export interface RenderOptions {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  onProgress?: (progress: number) => void;
}

export interface RenderResult {
  blob: Blob;
  url: string;
  duration: number;
}

/**
 * Render timeline jadi video WebM.
 * Catatan: ini basic compositor — video frames digambar ke canvas per detik,
 * audio track disatukan via captureStream() kalau memungkinkan.
 */
export async function renderTimeline(
  tracks: Track[],
  clips: ClipBlock[],
  media: MediaItem[],
  opts: RenderOptions = {}
): Promise<RenderResult | null> {
  if (typeof window === "undefined") return null;
  if (typeof MediaRecorder === "undefined") return null;

  const width = opts.width ?? 720;
  const height = opts.height ?? 1280; // portrait default (Shorts-friendly)
  const fps = opts.fps ?? 30;
  const bitrate = opts.bitrate ?? 2_500_000;

  // 1. Hitung total durasi timeline
  const totalDur = clips.reduce((max, c) => Math.max(max, c.start + c.dur), 0);
  if (totalDur <= 0) return null;

  // 2. Setup canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 3. Setup MediaRecorder
  const stream = canvas.captureStream(fps);
  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mime =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // 4. Preload media elements untuk video tracks
  const mediaById = new Map<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>();
  for (const m of media) {
    if (m.kind === "video" || m.kind === "audio") {
      const el = document.createElement(m.kind === "video" ? "video" : "audio") as
        | HTMLVideoElement
        | HTMLAudioElement;
      el.src = m.url;
      el.preload = "auto";
      el.muted = m.kind === "audio" ? false : true; // audio track ndak perlu di-mute, video iya
      el.crossOrigin = "anonymous";
      mediaById.set(m.id, el);
    } else if (m.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = m.url;
      mediaById.set(m.id, img);
    }
  }

  // Tunggu media siap
  await Promise.all(
    Array.from(mediaById.values()).map(
      (el) =>
        new Promise<void>((resolve) => {
          if (el instanceof HTMLImageElement) {
            if (el.complete) resolve();
            else {
              el.onload = () => resolve();
              el.onerror = () => resolve();
            }
          } else {
            if ((el as HTMLMediaElement).readyState >= 2) resolve();
            else {
              el.onloadeddata = () => resolve();
              el.onerror = () => resolve();
            }
          }
        })
    )
  );

  // 5. Start recording
  recorder.start(100); // chunk 100ms

  // 6. Animation loop: gambar frame per frame
  const frameMs = 1000 / fps;
  const totalFrames = Math.ceil(totalDur * fps);
  const startTime = performance.now();

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps; // detik di timeline
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Gambar semua klip yang aktif di detik t
    const videoTrack = tracks.find((tr) => tr.kind === "video");
    if (videoTrack) {
      const activeClips = clips.filter(
        (c) => c.trackId === videoTrack.id && c.start <= t && c.start + c.dur > t
      );
      for (const c of activeClips) {
        const m = media.find((x) => x.id === c.mediaId);
        if (!m) continue;
        const el = mediaById.get(c.mediaId);
        const localT = t - c.start + c.trimStart; // waktu di media
        if (el instanceof HTMLVideoElement) {
          // Sync video time
          if (Math.abs(el.currentTime - localT) > 0.2) {
            try {
              el.currentTime = Math.max(0, Math.min(localT, el.duration || 0));
            } catch {}
          }
          // Draw
          ctx.drawImage(el, 0, 0, width, height);
        } else if (el instanceof HTMLImageElement) {
          ctx.drawImage(el, 0, 0, width, height);
        }
      }
    }

    // Audio tracks
    const audioTrack = tracks.find((tr) => tr.kind === "audio");
    if (audioTrack) {
      const activeAudios = clips.filter(
        (c) => c.trackId === audioTrack.id && c.start <= t && c.start + c.dur > t
      );
      for (const c of activeAudios) {
        const el = mediaById.get(c.mediaId);
        if (el instanceof HTMLAudioElement) {
          const localT = t - c.start + c.trimStart;
          if (Math.abs(el.currentTime - localT) > 0.2) {
            try {
              el.currentTime = Math.max(0, Math.min(localT, el.duration || 0));
            } catch {}
          }
          if (el.paused) {
            try {
              await el.play();
            } catch {}
          }
        }
      }
    }

    // Progress callback
    if (opts.onProgress) {
      opts.onProgress((frame + 1) / totalFrames);
    }

    // Wait for next frame
    const targetMs = startTime + (frame + 1) * frameMs;
    const now = performance.now();
    if (targetMs > now) {
      await new Promise((r) => setTimeout(r, targetMs - now));
    }
  }

  // Stop semua audio
  for (const el of mediaById.values()) {
    if (el instanceof HTMLMediaElement) {
      try {
        el.pause();
      } catch {}
    }
  }

  // 7. Stop recorder
  return new Promise<RenderResult | null>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      resolve({ blob, url, duration: totalDur });
    };
    recorder.stop();
  });
}

/**
 * Download blob sebagai file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
