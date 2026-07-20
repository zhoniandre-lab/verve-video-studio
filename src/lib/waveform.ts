/* =====================================================================
   GELOMBANG SUARA ASLI (100% orisinal) — analisis puncak amplitudo audio
   Hasilnya dipakai balok audio di track (menggantikan batang hiasan).
   Decode pakai OfflineAudioContext → aman tanpa gesture, jalan di HP.
   ===================================================================== */

const cache = new Map<string, Promise<number[] | null>>();

/** Ambil daftar puncak (0..1) per ember untuk sebuah URL audio. Null kalau gagal. */
export function getAudioPeaks(url: string, buckets = 160): Promise<number[] | null> {
  if (!url) return Promise.resolve(null);
  const key = `${url.length}:${url.slice(0, 48)}:${buckets}`;
  let pr = cache.get(key);
  if (!pr) {
    pr = computePeaks(url, buckets).catch(() => null);
    cache.set(key, pr);
    // batasi cache maks 6 sumber (hemat memori HP)
    if (cache.size > 6) {
      const firstKey = cache.keys().next().value;
      if (firstKey && firstKey !== key) cache.delete(firstKey);
    }
  }
  return pr;
}

async function computePeaks(url: string, buckets: number): Promise<number[] | null> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  if (!ab.byteLength) return null;
  const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!AC) return null;
  const ctx: AudioContext = new AC(1, 1, 44100);
  const buf: AudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
    try {
      const p = (ctx as any).decodeAudioData(ab.slice(0), resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (e) { reject(e); }
  });
  if (!buf || !buf.length) return null;
  const n = buf.length;
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const per = Math.max(1, Math.floor(n / buckets));
  const step = Math.max(1, Math.floor(per / 220)); // sampling supaya cepat
  const peaks = new Array<number>(buckets).fill(0);
  for (let b = 0; b < buckets; b++) {
    const s0 = b * per, s1 = Math.min(n, s0 + per);
    let m = 0;
    for (let i = s0; i < s1; i += step) {
      const a = Math.abs(d0[i]); if (a > m) m = a;
      if (d1) { const a2 = Math.abs(d1[i]); if (a2 > m) m = a2; }
    }
    peaks[b] = m;
  }
  let mx = 0; for (const v of peaks) if (v > mx) mx = v;
  if (mx <= 0.001) return null;
  // normalisasi + kompresi ringan (pangkat 0.7) biar bagian pelan tetap kelihatan
  return peaks.map(v => Math.pow(v / mx, 0.7));
}

/** Estimasi BPM kasar dari energi onset (heuristik orisinal — penanda ketukan musik).
 *  Mengembalikan { bpm, beats: detik[] } atau null kalau tak bisa dihitung. */
export async function estimateBeats(url: string): Promise<{ bpm: number; beats: number[] } | null> {
  try {
    if (typeof window === "undefined") return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AC) return null;
    const ctx: AudioContext = new AC(1, 1, 44100);
    const buf: AudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        const p = (ctx as any).decodeAudioData(ab.slice(0), resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      } catch (e) { reject(e); }
    });
    if (!buf || !buf.length) return null;
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const win = Math.floor(sr * 0.02); // 20ms frames
    const nF = Math.floor(d.length / win);
    if (nF < 40) return null;
    const e = new Float32Array(nF);
    for (let f = 0; f < nF; f++) {
      let s = 0; const o = f * win;
      for (let i = 0; i < win; i += 4) { const a = d[o + i]; s += a * a; }
      e[f] = s / (win / 4);
    }
    // onset = lonjakan energi dibanding rata-rata lokal
    const onsets: number[] = [];
    for (let f = 6; f < nF; f++) {
      let loc = 0; for (let k = f - 6; k < f; k++) loc += e[k];
      loc /= 6;
      if (e[f] > loc * 1.6 && e[f] > e[f - 1] && e[f] >= e[Math.min(nF - 1, f + 1)]) {
        const t = (f * win) / sr;
        if (!onsets.length || t - onsets[onsets.length - 1] > 0.18) onsets.push(t);
      }
    }
    if (onsets.length < 8) return null;
    // BPM dari interval antar onset (histogram 60..200)
    const hist: Record<number, number> = {};
    for (let i = 1; i < onsets.length; i++) {
      const dt = onsets[i] - onsets[i - 1];
      for (const mul of [1, 2, 0.5]) {
        const bpm = Math.round(60 / (dt * mul));
        if (bpm >= 60 && bpm <= 200) hist[bpm] = (hist[bpm] || 0) + 1;
      }
    }
    let best = 0, bestN = 0;
    for (const k of Object.keys(hist)) { const v = hist[+k]; if (v > bestN) { bestN = v; best = +k; } }
    const dur = d.length / sr;
    const beats: number[] = [];
    if (best >= 60) { const stepB = 60 / best; for (let t = 0; t < dur; t += stepB) beats.push(Math.round(t * 100) / 100); }
    return { bpm: best, beats };
  } catch { return null; }
}
