/* =====================================================================
   FRAME LAYOUT (v19.44) — 100% orisinal, deterministik
   Banyak pilihan bingkai mewah yang digambar di atas video:
   gold, neon, corner, double, minimal, glitch, film, glass.
   Dipakai preview & render SAMA (WYSIWYG). Bisa diuji/di-demo di node-canvas.
   ===================================================================== */

export interface FrameStyle {
  id: string;
  label: string;
  emoji: string;
  /** warna utama bingkai */
  warna: string;
  /** tebal bingkai (fraksi min(W,H)) */
  tebal: number;
}

export const FRAME_STYLES: FrameStyle[] = [
  { id: "gold", label: "Emas Mewah", emoji: "👑", warna: "#ffd700", tebal: 0.028 },
  { id: "neon", label: "Neon Cyan", emoji: "💠", warna: "#22d3ee", tebal: 0.016 },
  { id: "ungu", label: "Ungu Premium", emoji: "💜", warna: "#a855f7", tebal: 0.022 },
  { id: "merah", label: "Merah Berani", emoji: "❤️", warna: "#ef4444", tebal: 0.02 },
  { id: "putih", label: "Putih Tipis", emoji: "🤍", warna: "#f8fafc", tebal: 0.008 },
  { id: "double", label: "Garis Ganda", emoji: "〽️", warna: "#e2e8f0", tebal: 0.012 },
  { id: "corner", label: "Sudut Ornamen", emoji: "✥", warna: "#ffd700", tebal: 0.02 },
  { id: "film", label: "Sinema Film", emoji: "🎬", warna: "#0f172a", tebal: 0.05 },
];

/** Gambar bingkai di atas canvas (W×H). `t` = waktu (untuk glitch/neon pulse). */
export function gambarFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  st: FrameStyle,
  t: number,
  bass = 0,
): void {
  const tb = Math.max(2, st.tebal * Math.min(W, H));

  if (st.id === "gold") {
    // gold: bingkai gradasi emas + garis dalam tipis + sudut
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#fff7cc"); g.addColorStop(0.3, "#ffd700");
    g.addColorStop(0.6, "#b8860b"); g.addColorStop(1, "#ffed8a");
    ctx.strokeStyle = g;
    ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
    ctx.strokeStyle = "rgba(255,215,0,0.35)";
    ctx.lineWidth = Math.max(1, tb * 0.25);
    ctx.strokeRect(tb * 2.4, tb * 2.4, W - tb * 4.8, H - tb * 4.8);
    // ornamen sudut
    ctx.fillStyle = "#ffd700";
    const s = tb * 2.6;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      ctx.beginPath();
      ctx.moveTo(cx === 0 ? 0 : W - s, cy === 0 ? 0 : H - s);
      ctx.lineTo(cx === 0 ? s : W, cy === 0 ? 0 : H - s);
      ctx.lineTo(cx === 0 ? s : W, cy === 0 ? s : H);
      ctx.closePath();
      ctx.fill();
    }
  } else if (st.id === "neon") {
    // neon: glow cyan + denyut ikut bass
    ctx.save();
    ctx.shadowColor = st.warna;
    ctx.shadowBlur = 12 + bass * 16;
    ctx.strokeStyle = st.warna;
    ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
    ctx.restore();
  } else if (st.id === "ungu") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#a855f7"); g.addColorStop(1, "#6366f1");
    ctx.strokeStyle = g; ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tb * 2, tb * 2, W - tb * 4, H - tb * 4);
  } else if (st.id === "merah") {
    ctx.strokeStyle = st.warna; ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
  } else if (st.id === "putih") {
    ctx.strokeStyle = st.warna; ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
  } else if (st.id === "double") {
    ctx.strokeStyle = st.warna; ctx.lineWidth = tb;
    ctx.strokeRect(tb / 2, tb / 2, W - tb, H - tb);
    ctx.strokeStyle = "rgba(226,232,240,0.55)"; ctx.lineWidth = Math.max(1, tb * 0.6);
    ctx.strokeRect(tb * 2.6, tb * 2.6, W - tb * 5.2, H - tb * 5.2);
  } else if (st.id === "corner") {
    // sudut ornamen (4 sudut tebal)
    const s = Math.min(W, H) * 0.16;
    ctx.strokeStyle = st.warna; ctx.lineWidth = tb * 1.4;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      const dirX = cx === 0 ? 1 : -1, dirY = cy === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + dirX * s, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dirY * s);
      ctx.stroke();
      // ornamen kecil
      ctx.fillStyle = st.warna;
      ctx.beginPath();
      ctx.arc(cx + dirX * s * 0.5, cy + dirY * s * 0.5, tb * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (st.id === "film") {
    // letterbox sinema: bar hitam atas-bawah + garis tipis
    const bar = Math.min(W, H) * 0.05;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
}
