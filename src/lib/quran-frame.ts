/* =====================================================================
   🕌 BINGKAI FRAME ISLAMI (v20.0) — ornamen digambar langsung di canvas
   (tanpa file gambar → ringan, mulus di render). 4 gaya:
   emas, hijau, tipis, mewah.
   ===================================================================== */

export type GayaFrame = "emas" | "hijau" | "tipis" | "mewah";

export const FRAME_ISLAMI: { id: GayaFrame; label: string; emoji: string }[] = [
  { id: "emas", label: "Emas Mewah", emoji: "🕌" },
  { id: "hijau", label: "Hijau Zamrud", emoji: "💚" },
  { id: "tipis", label: "Tipis Elegan", emoji: "🤍" },
  { id: "mewah", label: "Mewah Ganda", emoji: "✨" },
];

const PALET: Record<GayaFrame, { utama: string; sekunder: string }> = {
  emas: { utama: "#d4af37", sekunder: "#8a6d1f" },
  hijau: { utama: "#2e8b57", sekunder: "#14532d" },
  tipis: { utama: "rgba(255,255,255,0.75)", sekunder: "rgba(255,255,255,0.3)" },
  mewah: { utama: "#d4af37", sekunder: "#b8860b" },
};

/** Gambar ornamen sudut (busur + pola) di satu sudut. */
function ornamenSudut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flipX: boolean, flipY: boolean, warna: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.lineCap = "round";
  // garis diagonal utama
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.25, s * 0.25, s, s * 0.15);
  ctx.stroke();
  // busur dalam
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.5, s * 0.42, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  // titik hias
  ctx.beginPath(); ctx.arc(s * 0.28, s * 0.22, Math.max(1.2, s * 0.02), 0, Math.PI * 2); ctx.fillStyle = warna; ctx.fill();
  ctx.restore();
}

/** Pola diamond di tengah sisi (hiasan khas). */
function diamondTengah(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, warna: string, rotasi = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotasi);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.2, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s / 2, 0); ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Gambar bingkai penuh — panggil SETELAH latar digambar, SEBELUM konten ayat. */
export function gambarFrameIslami(ctx: CanvasRenderingContext2D, W: number, H: number, gaya: GayaFrame) {
  const p = PALET[gaya] || PALET.emas;
  const m = Math.min(W, H) * 0.028; // margin frame
  ctx.save();
  ctx.lineJoin = "round";

  if (gaya === "tipis") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1, m * 0.16);
    ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
  } else if (gaya === "emas" || gaya === "hijau") {
    // bingkai luar + garis dalam
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.5, m * 0.22);
    ctx.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1, m * 0.1);
    ctx.strokeRect(m * 0.75, m * 0.75, W - m * 1.5, H - m * 1.5);
    // ornamen sudut
    const s = m * 2.6;
    ornamenSudut(ctx, m * 0.35, m * 0.35, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.35, m * 0.35, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.35, H - m * 0.35, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.35, H - m * 0.35, s, true, true, p.utama);
    // diamond tengah sisi
    diamondTengah(ctx, W / 2, m * 0.55, m * 0.8, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.55, m * 0.8, p.utama);
    diamondTengah(ctx, m * 0.55, H / 2, m * 0.8, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.55, H / 2, m * 0.8, p.utama, Math.PI / 2);
  } else {
    // mewah: tiga lapis + sudut besar
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(2, m * 0.28);
    ctx.strokeRect(m * 0.3, m * 0.3, W - m * 0.6, H - m * 0.6);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1, m * 0.1);
    ctx.strokeRect(m * 0.62, m * 0.62, W - m * 1.24, H - m * 1.24);
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.2, m * 0.06);
    ctx.strokeRect(m * 0.95, m * 0.95, W - m * 1.9, H - m * 1.9);
    const s = m * 3.2;
    ornamenSudut(ctx, m * 0.3, m * 0.3, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.3, m * 0.3, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.3, H - m * 0.3, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.3, H - m * 0.3, s, true, true, p.utama);
    diamondTengah(ctx, W / 2, m * 0.5, m * 0.9, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.5, m * 0.9, p.utama);
    diamondTengah(ctx, m * 0.5, H / 2, m * 0.9, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.5, H / 2, m * 0.9, p.utama, Math.PI / 2);
  }
  ctx.restore();
}
