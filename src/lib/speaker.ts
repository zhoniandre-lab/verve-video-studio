/* =====================================================================
   SPEAKER REAKTIF (v19.36) — 100% orisinal
   Speaker vektor realistis yang "benar-benar bersuara":
   - cone (kerucut) berdenyut ikut BASS (displacement diafragma, attack
     cepat release pelan → simulasi inersia fisik woofer)
   - getaran fisik halus ikut RMS (deterministik — bukan Math.random)
   - glow di belakang ikut FLUX (onset/pukulan)
   - ring denyut saat BEAT + rotasi lambat ikut BPM
   Murni canvas 2D → jalan di browser (preview & render) DAN di
   node-canvas (demo/uji visual). Tidak ada satu pun Math.random.
   ===================================================================== */

export interface FeatSpeaker {
  t: number;
  bass: number;  // 0..1
  rms: number;   // 0..1
  flux: number;  // 0..1
  beat: number;  // 0 / 0.5 / 1
  bpm: number;   // 0..300
}

export interface SpeakerCfg {
  tipe: "woofer" | "fullrange" | "subwoofer" | "custom";
  colorCone: string;
  colorSurround: string;
  colorFrame: string;
  colorCap: string;
  /** 🐛 FIX v19.36.1: warna GLOW harus TERANG (bukan warna cone yang gelap!) —
   *  di aplikasi diisi warna tema spectrum biar serasi. */
  colorGlow: string;
  glow: number;      // 0..2 (intensitas glow belakang)
  vibration: number; // 0..1 (amplitudo getar fisik)
  rotate: number;    // 0..1 (kecepatan rotasi ikut bpm)
  /** gambar kustom (untuk tipe custom) — opsional */
  img?: CanvasImageSource | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fitur speaker dari envelope puncak + daftar beat (murni, diuji). */
export function hitungFeatSpeaker(peaks: number[], beats: number[], t: number, hopSec = 0.25): FeatSpeaker {
  const i = Math.max(0, Math.min(peaks.length - 1, Math.floor(t / hopSec)));
  const v = peaks[i] ?? 0;
  const prev = peaks[Math.max(0, i - 1)] ?? v;
  const next = peaks[Math.min(peaks.length - 1, i + 1)] ?? v;
  let beat = 0;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d < 0.06) { beat = 1; break; }
    if (d < 0.13) { beat = 0.5; break; }
    if (b > t + 0.13) break;
  }
  const bpm = bpmDariBeatList(beats);
  // flux = perubahan energi di TITIK INI (onset strength) — puncak lonjakan harus kena
  const flux = clamp01(Math.max(Math.abs(v - prev), Math.abs(next - v)) * 2.2);
  return {
    t,
    bass: clamp01(v),
    rms: clamp01(v * 0.5 + next * 0.3 + prev * 0.2),
    flux,
    beat,
    bpm,
  };
}

export function bpmDariBeatList(beats: number[]): number {
  if (!beats || beats.length < 3) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const g = beats[i] - beats[i - 1];
    if (g > 0.2 && g < 3) gaps.push(g);
  }
  if (gaps.length < 2) return 0;
  gaps.sort((a, b) => a - b);
  return Math.round(60 / gaps[Math.floor(gaps.length / 2)]);
}

/* ---------- helper warna ---------- */
function hexToRgb(h: string): [number, number, number] {
  let s = h.replace("#", "").trim();
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  if (isNaN(n)) return [120, 120, 130];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h: string, a: number): string {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${clamp01(a).toFixed(3)})`;
}
function terang(h: string, k: number): string {
  const [r, g, b] = hexToRgb(h);
  const t = (v: number) => Math.round(Math.min(255, v + (255 - v) * Math.max(0, k)));
  return `rgb(${t(r)},${t(g)},${t(b)})`;
}
function gelap(h: string, k: number): string {
  const [r, g, b] = hexToRgb(h);
  const t = (v: number) => Math.round(v * Math.max(0, 1 - k));
  return `rgb(${t(r)},${t(g)},${t(b)})`;
}

/**
 * Gambar speaker reaktif di posisi (cx,cy) ukuran `size` (diameter px).
 * Semua gerakan deterministik & disinkronkan ke `f` (fitur audio).
 */
export function gambarSpeaker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  f: FeatSpeaker,
  cfg: SpeakerCfg,
): void {
  if (size <= 0) return;
  const R = size / 2;
  const bass = clamp01(f.bass);
  const rms = clamp01(f.rms);

  // --- getar fisik (deterministik): 2 sinus campur, amplitudo ikut rms ---
  const vib = cfg.vibration * Math.max(0, rms - 0.05);
  const vx = Math.sin(f.t * 71.3) * R * 0.018 * vib;
  const vy = Math.cos(f.t * 57.7) * R * 0.018 * vib;
  const x = cx + vx, y = cy + vy;

  // --- rotasi lambat ikut bpm ---
  const rot = f.t * 0.35 * (f.bpm / 120) * cfg.rotate;

  // --- glow belakang (flux = pukulan) — warna TERANG + inti putih saat pukulan ---
  const glowA = Math.min(1, 0.16 + f.flux * 0.75 * cfg.glow);
  if (glowA > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, R * 0.15, x, y, R * 2.0);
    g.addColorStop(0, rgba(cfg.colorGlow, Math.min(0.95, glowA * 1.1)));
    g.addColorStop(0.35, rgba(cfg.colorGlow, glowA * 0.45));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 2.0, 0, Math.PI * 2); ctx.fill();
    // inti putih singkat saat pukulan keras (flash)
    if (f.flux > 0.6) {
      const wg = ctx.createRadialGradient(x, y, 0, x, y, R * 0.5);
      wg.addColorStop(0, `rgba(255,255,255,${(0.28 * f.flux * cfg.glow).toFixed(3)})`);
      wg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(x, y, R * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // --- frame (ring luar) ---
  ctx.fillStyle = cfg.colorFrame;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  // bayangan bawah ring (kesan 3D)
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.arc(0, R * 0.05, R * 0.94, 0, Math.PI * 2); ctx.fill();
  // --- surround (karet) ---
  ctx.fillStyle = cfg.colorSurround;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.fill();

  // --- CONE dengan displacement ikut bass (skala-Y menyusut = cone maju) ---
  const coneK = 1 - 0.24 * Math.min(1, bass * 1.5);
  ctx.save();
  ctx.scale(1, coneK);
  const cg = ctx.createRadialGradient(0, 0, R * 0.04, 0, 0, R * 0.8);
  cg.addColorStop(0, terang(cfg.colorCone, 0.38));
  cg.addColorStop(0.65, cfg.colorCone);
  cg.addColorStop(1, gelap(cfg.colorCone, 0.55));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.fill();

  // cincin kerucut (ripple) — radius sedikit membesar saat bass
  for (let i = 0; i < 4; i++) {
    const rr = R * 0.8 * (0.22 + 0.2 * i) + bass * R * 0.06;
    ctx.strokeStyle = `rgba(0,0,0,${(0.10 + 0.05 * i).toFixed(2)})`;
    ctx.lineWidth = 1 + i * 0.6;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
  }
  // dust cap tengah — membesar sedikit saat bass (pusat cone)
  const capR = R * (0.17 + bass * 0.035);
  ctx.fillStyle = cfg.colorCap;
  ctx.beginPath(); ctx.arc(0, 0, capR, 0, Math.PI * 2); ctx.fill();
  // highlight cap
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.arc(-capR * 0.3, -capR * 0.35, capR * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.restore(); // cone scale

  // highlight cekung atas (kesan kerucut masuk)
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.ellipse(0, -R * 0.3, R * 0.5, R * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  // baut sekeliling (deterministik)
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, Math.max(1, R * 0.028), 0, Math.PI * 2);
    ctx.fill();
  }
  // ring denyut saat beat
  if (f.beat > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${(0.45 * f.beat).toFixed(3)})`;
    ctx.lineWidth = 2 + f.beat * 3;
    ctx.beginPath(); ctx.arc(0, 0, R * (1.04 + (1 - f.beat) * 0.1), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore(); // translate+rotate

  // --- gambar kustom (tipe custom): foto speaker user + sim cone ---
  if (cfg.tipe === "custom" && cfg.img) {
    const d = R * 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(cfg.img, cx - d / 2, cy - d / 2, d, d);
    // sim cone: elips gelap berdenyut di tengah
    ctx.fillStyle = `rgba(0,0,0,${(0.22 + bass * 0.4).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.52, R * (0.52 - 0.22 * bass), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
