/* =====================================================================
   🔁 v19.91 LOOP VIDEO — hitung berapa kali video pendek harus diulang
   supaya mengisi durasi lagu, TANPA motong/ubah kualitas video.
   - auto: otomatis hitung (10 dtk video, lagu 100 dtk → 10×)
   - "1" | "2" | "3": paksa N kali (10 dtk × 3 = 30 dtk total)
   Murni & bisa diuji di Node.
   ===================================================================== */

export type ModeLoopVideo = "auto" | "1" | "2" | "3";

export function hitungKaliLoop(videoDur: number, audioDur: number, mode: ModeLoopVideo): number {
  if (!(videoDur > 0)) return 1;
  if (mode === "auto") {
    if (audioDur > 0) return Math.max(1, Math.ceil(audioDur / videoDur));
    return 1;
  }
  return Math.max(1, parseInt(mode, 10) || 1);
}

/** Durasi total video setelah di-loop (detik). */
export function durasiLoopTotal(videoDur: number, audioDur: number, mode: ModeLoopVideo): number {
  return videoDur * hitungKaliLoop(videoDur, audioDur, mode);
}
