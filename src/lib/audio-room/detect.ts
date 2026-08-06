/* =====================================================================
   AUDIO ROOM — deteksi otomatis bulatan (v19.37) — MURNI, bisa diuji
   Heuristik: cari area lingkaran GELAP di atas latar lebih terang
   (ciri khas cone speaker). Grid kandidat → skor cincin vs pusat →
   non-max suppression → hasil zona lingkaran.
   ===================================================================== */

export interface DeteksiHasil { x: number; y: number; rx: number; ry: number; skor: number }

function lum(r: number, g: number, b: number): number {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

/**
 * Deteksi lingkaran gelap dari ImageData (RGB). Semua koordinat keluar RELATIF (0..1).
 * opts: minR/maxR = radius min/maks (fraksi dari min(w,h)), minSkor = ambang 0..1.
 */
export function deteksiLingkaran(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  opts: { minR?: number; maxR?: number; minSkor?: number; maks?: number } = {},
): DeteksiHasil[] {
  const minR = opts.minR ?? 0.03;
  const maxR = opts.maxR ?? 0.30;
  const minSkor = opts.minSkor ?? 0.10;
  const maks = opts.maks ?? 8;
  if (w < 40 || h < 40) return [];

  const kandidat: DeteksiHasil[] = [];
  const step = Math.max(6, Math.round(Math.min(w, h) * 0.02)); // grid
  const Rmin = Math.max(8, minR * Math.min(w, h));
  const Rmax = Math.min(w, h) * maxR;

  for (let cy = step; cy < h - step; cy += step) {
    for (let cx = step; cx < w - step; cx += step) {
      // cek piksel pusat gelap dulu (cepat)
      const i0 = (cy * w + cx) * 4;
      const l0 = lum(data[i0], data[i0 + 1], data[i0 + 2]);
      if (l0 > 0.55) continue; // pusat harus gelap
      // coba beberapa radius
      for (let r = Rmin; r <= Rmax; r += Math.max(4, Math.round(r * 0.25))) {
        // skor cincin: gelapnya ring di radius r vs ring luar 1.3r (harus kontras)
        let ring = 0, luar = 0, nR = 0, nL = 0;
        const N = Math.max(12, Math.round(r));
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2;
          const xr = Math.round(cx + Math.cos(a) * r);
          const yr = Math.round(cy + Math.sin(a) * r);
          if (xr < 1 || yr < 1 || xr >= w - 1 || yr >= h - 1) continue;
          const i = (yr * w + xr) * 4;
          ring += lum(data[i], data[i + 1], data[i + 2]); nR++;
          const xo = Math.round(cx + Math.cos(a) * r * 1.35);
          const yo = Math.round(cy + Math.sin(a) * r * 1.35);
          if (xo >= 1 && yo >= 1 && xo < w - 1 && yo < h - 1) {
            const i2 = (yo * w + xo) * 4;
            luar += lum(data[i2], data[i2 + 1], data[i2 + 2]); nL++;
          }
        }
        if (nR < 8 || nL < 8) continue;
        const ringLum = ring / nR;
        const luarLum = luar / nL;
        const pusatLum = l0;
        // lingkaran gelap: ring gelap, pusat gelap, luar lebih terang
        const skor = Math.max(0, (luarLum - ringLum)) * Math.max(0, 0.5 - pusatLum);
        if (skor > minSkor) {
          kandidat.push({ x: cx / w, y: cy / h, rx: r / w, ry: r / h, skor });
        }
      }
    }
  }
  // sort skor turun, NMS (buang yang overlap)
  kandidat.sort((a, b) => b.skor - a.skor);
  const hasil: DeteksiHasil[] = [];
  for (const k of kandidat) {
    const overlap = hasil.some((h2) => {
      const dx = (k.x - h2.x) / Math.max(0.001, k.rx + h2.rx);
      const dy = (k.y - h2.y) / Math.max(0.001, k.ry + h2.ry);
      return dx * dx + dy * dy < 1.2;
    });
    if (!overlap) hasil.push(k);
    if (hasil.length >= maks) break;
  }
  return hasil;
}
