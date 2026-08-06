/* =====================================================================
   DETEKSI BEAT & BPM (v19.36) — 100% orisinal, murni (bisa diuji di Node)
   Input: array energi/puncak per hop (0..1) + hopSec.
   Algoritma: energy flux (selisih envelope) → ambang adaptif
   (rata-rata + k·std) → peak picking dengan jarak minimal antar-beat.
   ===================================================================== */

/** Deteksi waktu-waktu beat (detik) dari envelope energi per hop. */
export function deteksiBeats(energi: number[], hopSec = 0.25, minGapSec = 0.25): number[] {
  if (!energi || energi.length < 8) return [];
  const n = energi.length;
  // 1) flux = selisih positif (onset strength)
  const flux = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = energi[i] - energi[i - 1];
    flux[i] = d > 0 ? d : 0;
  }
  // 2) ambang adaptif: rata-rata + 1.2 * std (dari flux)
  let sum = 0;
  for (let i = 0; i < n; i++) sum += flux[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (flux[i] - mean) ** 2;
  const std = Math.sqrt(sq / n);
  const ambang = mean + 1.2 * std;
  // 3) peak picking + jarak minimal
  const beats: number[] = [];
  let last = -Infinity;
  const minHop = Math.max(1, Math.round(minGapSec / hopSec));
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] > ambang && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) {
      if (i - last >= minHop) {
        beats.push(i * hopSec);
        last = i;
      }
    }
  }
  return beats;
}

/** Estimasi BPM dari daftar beat (median jarak antar-beat). */
export function bpmDariBeats(beats: number[]): number {
  if (!beats || beats.length < 3) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const g = beats[i] - beats[i - 1];
    if (g > 0.2 && g < 3) gaps.push(g); // 20–300 BPM
  }
  if (gaps.length < 2) return 0;
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  return Math.round(60 / med);
}

/** Kekuatan beat di sekitar waktu t (1 = tepat, 0.5 = dekat, 0 = tidak). */
export function kekuatanBeat(beats: number[], t: number): number {
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d < 0.06) return 1;
    if (d < 0.13) return 0.5;
    if (b > t + 0.13) break;
  }
  return 0;
}
