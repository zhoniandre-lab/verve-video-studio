/* =====================================================================
   FFT FREKUENSI ASLI (v19.39) — 100% orisinal, MURNI (bisa diuji di Node)
   Masalah lama: render offline pakai "synthBars" (envelope volume + sinus
   sintetis) → spektrum tidak akurat mengikuti musik.
   Sekarang: hitung FFT asli dari PCM audio sekali saat upload → simpan
   frame frekuensi per waktu → render & preview idle pakai data ASLI ini.
   Hasil: bar menampilkan bass/treble yang beneran dari lagu.
   ===================================================================== */

/** FFT radix-2 Cooley-Tukey (in-place). re/im panjang harus power of 2. */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ux = re[i + k], uy = im[i + k];
        const vx = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vy = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ux + vx; im[i + k] = uy + vy;
        re[i + k + len / 2] = ux - vx; im[i + k + len / 2] = uy - vy;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface FreqFrames {
  frames: Uint8Array[];   // tiap frame = Uint8Array(bins) 0..255 (mirip getByteFrequencyData)
  fps: number;
  bins: number;
  durationSec: number;
}

/** Hitung frame frekuensi (FFT asli) dari audio. Murni, bisa diuji di Node. */
export function hitungFreqFrames(
  ch0: Float32Array,
  ch1: Float32Array | null,
  sampleRate: number,
  fps = 10,
  bins = 128,
  fftSize = 2048,
): FreqFrames {
  const n = ch0.length;
  const total = n / sampleRate;
  const nFrames = Math.max(1, Math.ceil(total * fps));
  const hop = Math.max(fftSize / 2, Math.floor(sampleRate / fps));
  // window hamming
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
  // skala referensi: puncak FFT sinus full-scale dengan hamming ≈ (N/2)*0.54
  const refMag = (fftSize / 2) * 0.54;
  const half = fftSize / 2;
  const frames: Uint8Array[] = [];
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const mags = new Float32Array(half);

  for (let f = 0; f < nFrames; f++) {
    const i0 = Math.min(Math.max(0, Math.floor((f / fps) * sampleRate)), Math.max(0, n - fftSize));
    re.fill(0); im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const s = i0 + i;
      if (s >= n) break;
      const v = ch0[s] * win[i];
      re[i] = v;
      if (ch1 && s < ch1.length) re[i] = (v + ch1[s] * win[i]) * 0.5;
    }
    fftRadix2(re, im);
    for (let k = 0; k < half; k++) mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    // map half bins → output bins (rata-rata max per kelompok)
    const per = Math.floor(half / bins);
    const out = new Uint8Array(bins);
    for (let b = 0; b < bins; b++) {
      let m = 0;
      const s0 = b * per, s1 = Math.min(half, s0 + per);
      for (let k = s0; k < s1; k++) if (mags[k] > m) m = mags[k];
      const db = 20 * Math.log10(m / Math.max(1e-9, refMag));
      const v = Math.max(0, Math.min(1, (db + 70) / 52)); // -70..-18 dB → 0..255
      out[b] = Math.round(v * 255);
    }
    frames.push(out);
  }
  return { frames, fps, bins, durationSec: total };
}

/** Versi ASYNC chunked (untuk HP — tidak nge-freeze UI):
 *  menghitung frame FFT sedikit demi sedikit, yield ke event loop tiap 30 frame. */
export async function hitungFreqFramesChunked(
  buf: AudioBuffer,
  fps = 10,
  bins = 128,
  fftSize = 2048,
  onProg?: (p: number) => void,
): Promise<FreqFrames> {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const sr = buf.sampleRate;
  const total = ch0.length / sr;
  const nFrames = Math.max(1, Math.ceil(total * fps));
  const hop = Math.max(fftSize / 2, Math.floor(sr / fps));
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
  const refMag = (fftSize / 2) * 0.54;
  const half = fftSize / 2;
  const frames: Uint8Array[] = [];
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const mags = new Float32Array(half);
  const per = Math.floor(half / bins);

  for (let f = 0; f < nFrames; f++) {
    const i0 = Math.min(Math.max(0, Math.floor((f / fps) * sr)), Math.max(0, ch0.length - fftSize));
    re.fill(0); im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const s = i0 + i;
      if (s >= ch0.length) break;
      const v = ch0[s] * win[i];
      re[i] = v;
      if (ch1 && s < ch1.length) re[i] = (v + ch1[s] * win[i]) * 0.5;
    }
    fftRadix2(re, im);
    for (let k = 0; k < half; k++) mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    const out = new Uint8Array(bins);
    for (let b = 0; b < bins; b++) {
      let m = 0;
      const s0 = b * per, s1 = Math.min(half, s0 + per);
      for (let k = s0; k < s1; k++) if (mags[k] > m) m = mags[k];
      const db = 20 * Math.log10(m / Math.max(1e-9, refMag));
      const v = Math.max(0, Math.min(1, (db + 70) / 52));
      out[b] = Math.round(v * 255);
    }
    frames.push(out);
    if ((f & 31) === 0) {
      onProg?.((f + 1) / nFrames);
      await new Promise((r) => setTimeout(r, 0)); // yield — HP tetap responsif
    }
  }
  return { frames, fps, bins, durationSec: total };
}

/** Ambil frame frekuensi pada detik t dengan LERP antar frame (halus).
 *  `buf` opsional — reuse array biar render tidak alokasi tiap frame. */
export function freqAt(fr: FreqFrames, t: number, buf?: Uint8Array): Uint8Array {
  const { frames, fps, bins } = fr;
  if (!frames.length) return buf && buf.length === bins ? (buf.fill(0), buf) : new Uint8Array(bins);
  if (frames.length === 1) return frames[0];
  const x = Math.max(0, Math.min(frames.length - 1, t * fps));
  const i0 = Math.floor(x);
  const i1 = Math.min(frames.length - 1, i0 + 1);
  const fr2 = x - i0;
  if (fr2 < 0.001 || i0 === i1) return frames[i0];
  const a = frames[i0], b = frames[i1];
  const out = buf && buf.length === bins ? buf : new Uint8Array(bins);
  for (let i = 0; i < bins; i++) out[i] = Math.round(a[i] + (b[i] - a[i]) * fr2);
  return out;
}
