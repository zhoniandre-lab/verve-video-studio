/* =====================================================================
   AUDIO ROOM — driver animasi zona (v19.37) — MURNI, bisa diuji di Node
   Semua nilai driver dihitung dari fitur audio + parameter zona,
   dengan smoothing satu-kutub (attack/release) — deterministik.
   ===================================================================== */
import type { AudioZone, EfekZona } from "./types";

export interface FeatZone {
  bass: number; beat: number; treble: number; rms: number; flux: number;
}

export interface DriverZona {
  pulse: number;    // faktor skala (1 = diam)
  push: number;     // dorongan ke dalam (0..1)
  getarX: number; getarY: number; // offset piksel relatif
  deform: number;   // 0..1 kedalaman cone
  glow: number;     // 0..2
  shadow: number;   // 0..1
  beat: number;     // 0/0.5/1
}

const TAU_DEF = 0.12;
/** Smoothing satu-kutub — nilai lama merambat ke target. dt = delta detik. */
export function smoothVal(prev: number, target: number, dt: number, k: number, kecepatan: number): number {
  const tau = TAU_DEF / Math.max(0.2, k * kecepatan);
  const a = 1 - Math.exp(-dt / Math.max(0.02, tau));
  return prev + (target - prev) * a;
}

/** Nilai fitur utama zona dari respon yang dipilih. */
export function nilaiRespon(f: FeatZone, respon: string): number {
  switch (respon) {
    case "bass": return f.bass;
    case "beat": return f.beat;
    case "treble": return f.treble;
    case "rms": return f.rms;
    default: return f.bass;
  }
}

export interface StZona { prev: Record<string, number>; }

/** Hitung driver zona pada waktu t (deterministik). `st` menyimpan state smoothing. */
export function hitungDriver(
  zone: AudioZone,
  f: FeatZone,
  t: number,
  st: StZona,
  dt = 1 / 60,
): DriverZona {
  const p = st.prev;
  const K = zone.kekuatan;
  const target = nilaiRespon(f, zone.respon) * (zone.snapBeat ? (0.6 + 0.4 * f.beat) : 1);
  const beatK = zone.snapBeat ? f.beat : 0;
  const smoothK = Math.max(0.05, zone.smooth);

  const punya = (e: EfekZona) => zone.efek.includes(e);

  // pulse: target skala = 1 + respon*kekuatan*0.35
  const tPulse = 1 + target * K * 0.35;
  const pulse = punya("pulse") ? smoothVal(p.pulse ?? 1, tPulse, dt, smoothK, zone.kecepatan) : 1;
  // push (dorongan ke dalam): 0..1
  const tPush = punya("basspush") ? target * K * 0.8 : 0;
  const push = punya("basspush") ? smoothVal(p.push ?? 0, tPush, dt, smoothK, zone.kecepatan) : 0;
  // deform cone: 0..1
  const tDeform = punya("deform") ? target * zone.deform * Math.min(1, K) : 0;
  const deform = punya("deform") ? smoothVal(p.deform ?? 0, tDeform, dt, smoothK, zone.kecepatan) : 0;
  // glow: 0..2 (ikut flux/beat)
  const tGlow = punya("glow") ? (0.12 + (f.flux * 0.6 + beatK * 0.5) * zone.glow) : 0;
  const glow = punya("glow") ? Math.min(2, smoothVal(p.glow ?? 0, tGlow, dt, 0.3, zone.kecepatan)) : 0;
  // shadow: kebalikan deform (gelap saat cekung)
  const shadow = punya("shadow") || punya("deform") ? Math.min(1, deform * 0.9 + push * 0.35) : 0;
  // getar: offset deterministik (sinus campur), amplitudo ikut rms
  const gAmp = punya("getar") ? f.rms * K * 0.012 : 0;
  const getarX = gAmp * (Math.sin(t * 71.3) * 0.7 + Math.sin(t * 43.7) * 0.3);
  const getarY = gAmp * (Math.cos(t * 57.7) * 0.7 + Math.cos(t * 89.3) * 0.3);

  p.pulse = pulse; p.push = push; p.deform = deform; p.glow = glow;

  return { pulse, push, getarX, getarY, deform, glow, shadow, beat: f.beat };
}

/** Hit-test: apakah titik (px,py) ada di dalam zona (koordinat relatif 0..1). */
export function titikDalamZona(z: AudioZone, px: number, py: number): boolean {
  if (z.shape === "polygon" && z.points && z.points.length >= 3) {
    return titikDalamPolygon(z.points, px, py);
  }
  const dx = (px - z.x) / Math.max(0.0001, z.rx);
  const dy = (py - z.y) / Math.max(0.0001, z.ry);
  return dx * dx + dy * dy <= 1;
}

/** Ray casting — titik dalam polygon. */
export function titikDalamPolygon(pts: { x: number; y: number }[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Jarak titik ke pusat zona (relatif, aspect-correct). */
export function jarakKePusat(z: AudioZone, px: number, py: number): number {
  const dx = (px - z.x) / Math.max(0.0001, z.rx);
  const dy = (py - z.y) / Math.max(0.0001, z.ry);
  return Math.sqrt(dx * dx + dy * dy);
}
