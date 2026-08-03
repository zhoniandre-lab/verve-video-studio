/* =====================================================================
   ⏱ VERVE Studio — JAM TUNGGAL (keputusan clock preview, murni & testable)
   FASE-A Stabilisasi Editor:
   Keputusan jam yang sebelumnya tersebar di closure raksasa `tick()`/
   `togglePreview()` (page.tsx) diekstrak jadi fungsi MURNI di sini —
   TANPA mengubah perilaku sedetik pun (patch bedah, bukan rombak).
   Manfaat: 1 pintu keputusan → keluarga bug sync dapat diuji & dikunci.
   Diuji: tests/jamtunggal.test.mjs
   ===================================================================== */

/** Gabungkan semua sumber durasi akhir preview: total klip, durasi master audio, dan ujung audio offset. */
export function totalAllOf(total: number, audioDur: number, offsetEnd: number): number {
  return Math.max(total, audioDur, offsetEnd);
}

/**
 * Keputusan langkah tick pada detik t terhadap totalAll:
 *  - "idle"  : durasi total ~0 & jam belum lewat 0.5d → tetap gambar frame 0 (JANGAN reset)
 *  - "reset" : durasi total ~0 tapi jam sudah lari > 0.5d → reset paksa ke 0
 *  - "end"   : jam mencapai totalAll + 0.08 (toleransi 80ms — tepat di batas, tidak lebih awal)
 *  - "run"   : lanjut normal
 */
export function decideTick(t: number, totalAll: number): "idle" | "reset" | "end" | "run" {
  if (totalAll <= 0.01) return t > 0.5 ? "reset" : "idle";
  return t >= totalAll + 0.08 ? "end" : "run";
}

/** Target seek saat tombol play ditekan: jarum sudah di ujung (60ms jelang akhir) → mulai lagi dari 0. */
export function resolveSeekTarget(curT: number, durT: number): number {
  return durT > 0.3 && curT >= durT - 0.06 ? 0 : curT;
}

/**
 * Keadaan jam MANUAL tepat setelah master audio berakhir (aud.ended):
 * lanjut dari durasi master — waktu MONOTON naik, tidak pernah melompat mundur.
 */
export function manualAfterMasterEnd(audioDur: number, now: number): { audio: null; t0: number; base: number; running: boolean } {
  return { audio: null, t0: now, base: audioDur > 0 && isFinite(audioDur) ? audioDur : 0, running: true };
}
