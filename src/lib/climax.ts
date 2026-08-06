/* =====================================================================
   DETEKSI KLIMAKS AUDIO (v19.32 — Dual Render) — 100% orisinal
   Mencari "bagian paling seru" dari sebuah lagu/audio:
   energi RMS per potongan waktu kecil (hop), lalu sliding window
   sepanjang durasi short — window dengan energi total tertinggi
   = bagian klimaksnya. Murni matematika, tanpa Web Audio, jadi
   bisa diuji di Node (tests/climax.test.mjs).
   ===================================================================== */

export interface KlimaksHasil {
  /** detik awal bagian seru */
  start: number;
  /** energi relatif 0..1 (1 = window paling seru dibanding semua window) */
  energi: number;
  /** total window yang dibandingkan */
  windowCount: number;
}

/** Hitung energi RMS per hop (mono). mono = campuran channel (Float32Array). */
export function hitungEnergiMono(mono: Float32Array, sampleRate: number, hopSec = 0.25): number[] {
  const hop = Math.max(1, Math.floor(hopSec * sampleRate));
  const out: number[] = [];
  let sum = 0, cnt = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = mono[i];
    sum += v * v; cnt++;
    if (cnt >= hop) {
      out.push(Math.sqrt(sum / cnt));
      sum = 0; cnt = 0;
    }
  }
  if (cnt > 0) out.push(Math.sqrt(sum / cnt));
  return out;
}

/** Campur semua channel audio jadi mono (rata-rata). */
export function audioBufferKeMono(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  const out = new Float32Array(n);
  const chs = Math.min(buf.numberOfChannels, 2);
  const d0 = buf.getChannelData(0);
  const d1 = chs > 1 ? buf.getChannelData(1) : null;
  for (let i = 0; i < n; i++) out[i] = d1 ? (d0[i] + d1[i]) * 0.5 : d0[i];
  return out;
}

/**
 * Sliding window di atas array energi (per hop) → cari window sepanjang
 * windowSec dengan energi rata-rata TERTINGGI = klimaks.
 * Pakai prefix sum → O(n), ngebut walau lagu 1 jam.
 */
export function cariKlimaksEnergi(energi: number[], hopSec: number, windowSec: number): KlimaksHasil {
  if (!energi.length) return { start: 0, energi: 0, windowCount: 0 };
  const winHops = Math.max(1, Math.round(windowSec / hopSec));
  const totalDur = energi.length * hopSec;
  if (totalDur <= windowSec) return { start: 0, energi: 1, windowCount: 1 };

  // prefix sum
  const pref = new Float64Array(energi.length + 1);
  for (let i = 0; i < energi.length; i++) pref[i + 1] = pref[i] + energi[i];

  let best = -1, bestStartHop = 0;
  const maxStartHop = energi.length - winHops;
  // 🧠 Sedikit bias ke bagian TENGAH kalau nilainya nyaris sama (dalam 2%)
  // → hindari selalu ambil detik-detik paling awal yang bisa terasa kurang greget.
  const serupa: { start: number; val: number }[] = [];
  for (let s = 0; s <= maxStartHop; s++) {
    const sum = pref[s + winHops] - pref[s];
    const avg = sum / winHops;
    if (serupa.length === 0 || Math.abs(avg - best) / Math.max(1e-9, best) <= 0.02) {
      serupa.push({ start: s, val: avg });
      if (avg > best) { best = avg; bestStartHop = s; }
    } else if (avg > best) {
      serupa.length = 0; serupa.push({ start: s, val: avg });
      best = avg; bestStartHop = s;
    }
  }
  // kalau banyak kandidat nyaris sama → ambil yang paling tengah (lebih aman)
  if (serupa.length > 1) {
    const mid = serupa[Math.floor(serupa.length / 2)];
    if (mid.val >= best * 0.98) bestStartHop = mid.start;
  }

  // baseline: energi rata-rata seluruh audio (untuk rasio relatif)
  const rata = pref[pref.length - 1] / energi.length;
  const rel = Math.min(1, best / Math.max(1e-9, rata) / 2.5);
  return {
    start: Math.round(bestStartHop * hopSec * 10) / 10,
    energi: Math.max(0, Math.min(1, rel)),
    windowCount: maxStartHop + 1,
  };
}

/** Wrapper praktis: langsung dari AudioBuffer (dipakai di UI Spectrum). */
export function cariKlimaksBuffer(buf: AudioBuffer, windowSec = 30, hopSec = 0.25): KlimaksHasil {
  try {
    const mono = audioBufferKeMono(buf);
    const e = hitungEnergiMono(mono, buf.sampleRate, hopSec);
    return cariKlimaksEnergi(e, hopSec, windowSec);
  } catch {
    return { start: 0, energi: 0, windowCount: 0 };
  }
}

/** Energi per detik (untuk gambar timeline mini di UI). */
export function energiPerDetik(buf: AudioBuffer, bucketSec = 0.5): number[] {
  try {
    const mono = audioBufferKeMono(buf);
    return hitungEnergiMono(mono, buf.sampleRate, bucketSec);
  } catch {
    return [];
  }
}
