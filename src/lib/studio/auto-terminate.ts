/* =====================================================================
   VERVE Studio — Auto-Terminate
   - Kalau audio masuk di titik T, potong klip video overlap jadi berakhir di T
   - Idempotent: kalau dipanggil 2x, hasil sama
   - Pure function, no side effects
   ===================================================================== */

import type { Track, ClipBlock } from "./types";

export function applyAutoTerminate(
  tracks: Track[],
  clips: ClipBlock[]
): ClipBlock[] {
  const audioTrack = tracks.find((t) => t.kind === "audio");
  if (!audioTrack) return clips;

  const audioClips = clips.filter((c) => c.trackId === audioTrack.id);
  if (!audioClips.length) return clips;

  return clips.map((c) => {
    // audio clip dilewati
    if (c.trackId === audioTrack.id) return c;
    // text/sticker track tidak dipotong
    const track = tracks.find((t) => t.id === c.trackId);
    if (!track || track.kind === "text" || track.kind === "sticker") return c;

    const cEnd = c.start + c.dur;
    // Cari audio yang overlap dengan klip video ini
    const overlapping = audioClips.find(
      (a) => a.start < cEnd && a.start + a.dur > c.start
    );
    if (!overlapping) return c;
    // Titik potong = awal audio
    const cutPoint = overlapping.start;
    if (cutPoint <= c.start) return c;
    if (cutPoint >= cEnd) return c;
    return {
      ...c,
      dur: cutPoint - c.start,
      autoTerminated: true,
    };
  });
}
