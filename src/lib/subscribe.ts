/* =====================================================================
   TOMBOL SUBSCRIBE ANIMASI (v19.40) — 100% orisinal, deterministik
   Banyak pilihan gaya + animasi (denyut ikut bass, glow ikut pukulan,
   lonceng goyang saat beat) — dipakai di Spectrum Studio (preview &
   render SAMA, WYSIWYG) dan bisa diuji/di-demo di node-canvas.
   ===================================================================== */

export interface SubStyle {
  id: string;
  label: string;
  emoji: string;
  /** warna latar: solid "#rrggbb" atau gradient 2 stop */
  bg: string | [string, string];
  text: string;
  bell: string;
  border?: string;
  glow: string;
}

export const SUB_STYLES: SubStyle[] = [
  { id: "yt", label: "YouTube Klasik", emoji: "▶️", bg: ["#ff0000", "#cc0000"], text: "#ffffff", bell: "#ffffff", glow: "#ff0000" },
  { id: "neon", label: "Neon Pink", emoji: "💗", bg: ["#ff2d95", "#c026d3"], text: "#ffffff", bell: "#ffffff", glow: "#ff2d95" },
  { id: "gold", label: "Emas Mewah", emoji: "👑", bg: ["#ffd700", "#b8860b"], text: "#3b2f00", bell: "#3b2f00", glow: "#ffd700" },
  { id: "grad", label: "Biru Ungu", emoji: "💠", bg: ["#3b82f6", "#8b5cf6"], text: "#ffffff", bell: "#ffffff", glow: "#8b5cf6" },
  { id: "glass", label: "Kaca Gelap", emoji: "🖤", bg: "rgba(15,23,42,0.82)", text: "#ffffff", bell: "#ffffff", border: "rgba(255,255,255,0.35)", glow: "#38bdf8" },
  { id: "white", label: "Putih Minimal", emoji: "🤍", bg: "#ffffff", text: "#111111", bell: "#111111", glow: "#ffffff" },
  { id: "black", label: "Hitam Emas", emoji: "🖤", bg: ["#1a1a1a", "#000000"], text: "#ffd700", bell: "#ffd700", border: "rgba(255,215,0,0.35)", glow: "#ffd700" },
  { id: "tiktok", label: "TikTok", emoji: "🎵", bg: ["#25f4ee", "#fe2c55"], text: "#ffffff", bell: "#ffffff", glow: "#fe2c55" },
];

export type SubAnim = "denyut" | "glow" | "goncang" | "statis";

export const SUB_ANIMS: { id: SubAnim; label: string; desc: string }[] = [
  { id: "denyut", label: "💓 Denyut", desc: "membesar ikut bass/beat" },
  { id: "glow", label: "✨ Glow", desc: "cahaya nyala ikut pukulan" },
  { id: "goncang", label: "🔔 Goyang", desc: "lonceng goyang saat beat" },
  { id: "statis", label: "🚫 Statis", desc: "diam, tanpa animasi" },
];

export interface SubState {
  scale: number;   // 1 = normal, >1 membesar
  glow: number;    // 0..1 intensitas glow
  shake: number;   // 0..1 amplitudo goyang lonceng
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Hitung state animasi tombol subscribe (deterministik — bisa diuji). */
export function hitungSubState(
  bass: number,
  beat: number,
  flux: number,
  anim: SubAnim,
  t: number,
): SubState {
  const s: SubState = { scale: 1, glow: 0, shake: 0 };
  if (anim === "denyut") {
    s.scale = 1 + clamp01(bass) * 0.09 + beat * 0.05;
  } else if (anim === "glow") {
    s.glow = clamp01(0.15 + flux * 0.7 + beat * 0.5);
  } else if (anim === "goncang") {
    s.shake = clamp01(beat * 0.85 + Math.max(0, bass - 0.6) * 1.2);
  }
  return s;
}

/** Gambar lonceng vektor (dome + clapper + bibir bawah). */
export function gambarBell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, warna: string, shake: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  // goyang: rotasi kecil cepat saat shake
  if (shake > 0.02) ctx.rotate(Math.sin(t * 42) * 0.22 * shake);
  ctx.fillStyle = warna;
  // dome (setengah lingkaran atas)
  ctx.beginPath();
  ctx.arc(0, -size * 0.05, size * 0.40, Math.PI, 0);
  // sisi kiri & kanan turun
  ctx.lineTo(size * 0.42, size * 0.26);
  ctx.quadraticCurveTo(0, size * 0.40, -size * 0.42, size * 0.26);
  ctx.closePath();
  ctx.fill();
  // bibir bawah (persegi kecil)
  ctx.fillRect(-size * 0.34, size * 0.26, size * 0.68, size * 0.07);
  // clapper (bola kecil)
  ctx.beginPath();
  ctx.arc(0, size * 0.38, size * 0.10, 0, Math.PI * 2);
  ctx.fill();
  // tombol kecil di atas (kuningan)
  ctx.fillStyle = "#ffd700";
  ctx.beginPath();
  ctx.arc(0, -size * 0.32, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Gambar tombol subscribe (pill) — deterministik. `w` = lebar tombol. */
export function gambarSubscribe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  st: SubStyle,
  state: SubState,
  t: number,
  teks = "SUBSCRIBE",
): void {
  if (w <= 4) return;
  const h = w * 0.30;
  const scale = state.scale || 1;
  const dw = w * scale, dh = h * scale;
  const x = cx - dw / 2, y = cy - dh / 2;
  const r = dh / 2;

  // glow belakang (lighter — murah, tanpa shadowBlur)
  if ((state.glow || 0) > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, dw * 0.95);
    g.addColorStop(0, hexA(st.glow, Math.min(0.8, 0.25 + (state.glow || 0) * 0.6)));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, dw * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // body pill
  ctx.save();
  if (Array.isArray(st.bg)) {
    const g = ctx.createLinearGradient(x, y, x, y + dh);
    g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = st.bg;
  }
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, y, dw, dh, r);
  else { ctx.rect(x, y, dw, dh); }
  ctx.fill();
  // border (untuk gaya kaca/hitam-emas)
  if (st.border) {
    ctx.strokeStyle = st.border;
    ctx.lineWidth = Math.max(1, dh * 0.03);
    ctx.stroke();
  }
  // highlight tipis atas (glossy)
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x + dw * 0.04, y + dh * 0.06, dw * 0.92, dh * 0.34, r * 0.6);
  else ctx.rect(x + dw * 0.04, y + dh * 0.06, dw * 0.92, dh * 0.34);
  ctx.fill();
  ctx.restore();

  // lonceng (kiri)
  gambarBell(ctx, x + dh * 0.62, cy, dh * 0.62, st.bell, state.shake || 0, t);

  // teks
  ctx.save();
  ctx.fillStyle = st.text;
  ctx.font = `900 ${Math.round(dh * 0.52)}px 'Poppins',system-ui,sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(teks, x + dh * 1.15, cy + dh * 0.02);
  ctx.restore();
}

function hexA(h: string, a: number): string {
  if (h.startsWith("rgba") || h.startsWith("rgb(")) {
    // gradient stop warna css — biarkan
    return h;
  }
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  if (isNaN(n)) return `rgba(255,0,0,${clamp01(a).toFixed(3)})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(a).toFixed(3)})`;
}
