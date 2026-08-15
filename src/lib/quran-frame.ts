/* =====================================================================
   🕌 BINGKAI FRAME ISLAMI (v20.1) — ornamen digambar langsung di canvas
   (tanpa file gambar → ringan, mulus di render). 8 GAYA dengan ornamen
   kaya: sudut berhias, pola, bintang 8, bulan sabit, dll — bukan cuma
   garis berwarna.
   ===================================================================== */

export type GayaFrame = "emas" | "hijau" | "tipis" | "mewah" | "ornamen" | "bintang" | "bulan" | "klasik";

export const FRAME_ISLAMI: { id: GayaFrame; label: string; emoji: string }[] = [
  { id: "emas", label: "Emas Mewah", emoji: "🕌" },
  { id: "ornamen", label: "Emas Ornamen", emoji: "✨" },
  { id: "mewah", label: "Ganda Mewah", emoji: "👑" },
  { id: "hijau", label: "Hijau Zamrud", emoji: "💚" },
  { id: "bintang", label: "Bintang 8", emoji: "⭐" },
  { id: "bulan", label: "Bulan Sabit", emoji: "🌙" },
  { id: "klasik", label: "Klasik Polos", emoji: "📜" },
  { id: "tipis", label: "Tipis Elegan", emoji: "🤍" },
];

const PALET: Record<GayaFrame, { utama: string; sekunder: string }> = {
  emas: { utama: "#d4af37", sekunder: "#8a6d1f" },
  ornamen: { utama: "#e8c96a", sekunder: "#9a7b2d" },
  mewah: { utama: "#d4af37", sekunder: "#b8860b" },
  hijau: { utama: "#2e8b57", sekunder: "#14532d" },
  bintang: { utama: "#d4af37", sekunder: "#7a5c10" },
  bulan: { utama: "#c9b458", sekunder: "#8a7a2a" },
  klasik: { utama: "rgba(255,255,255,0.6)", sekunder: "rgba(255,255,255,0.25)" },
  tipis: { utama: "rgba(255,255,255,0.75)", sekunder: "rgba(255,255,255,0.3)" },
};

/** Ornamen sudut: garis diagonal + busur + spiral kecil + titik (khas islami). */
function ornamenSudut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flipX: boolean, flipY: boolean, warna: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.lineCap = "round";
  // garis diagonal utama
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.25, s * 0.25, s, s * 0.12);
  ctx.stroke();
  // busur ganda
  ctx.beginPath(); ctx.arc(s * 0.52, s * 0.52, s * 0.46, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(s * 0.52, s * 0.52, s * 0.3, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
  // titik hias
  ctx.beginPath(); ctx.arc(s * 0.3, s * 0.18, Math.max(1.2, s * 0.022), 0, Math.PI * 2); ctx.fillStyle = warna; ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.16, s * 0.34, Math.max(1, s * 0.016), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Bintang 8 sudut (dipakai gaya bintang). */
function bintang8(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, warna: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.2, r * 0.1);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

/** Bulan sabit. */
function bulanSabit(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, warna: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = warna;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(-r * 0.45, -r * 0.25, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.12, -2.2, 0.9); ctx.stroke();
  ctx.restore();
}

/** Diamond tengah sisi. */
function diamondTengah(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, warna: string, rotasi = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotasi);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.2, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s / 2, 0); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2); ctx.fillStyle = warna; ctx.fill();
  ctx.restore();
}

/** Deretan diamond kecil di sepanjang sisi (pola islami). */
function deretDiamond(ctx: CanvasRenderingContext2D, W: number, H: number, m: number, warna: string) {
  const ds = m * 0.5, nX = Math.floor((W - m * 2) / (ds * 2.6)), nY = Math.floor((H - m * 2) / (ds * 2.6));
  ctx.save();
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(0.8, m * 0.03);
  for (let i = 1; i < nX; i++) {
    const x = m + i * ds * 2.6;
    const y1 = m * 0.9, y2 = H - m * 0.9;
    for (const y of [y1, y2]) {
      ctx.beginPath();
      ctx.moveTo(x, y - ds / 2); ctx.lineTo(x + ds / 2, y); ctx.lineTo(x, y + ds / 2); ctx.lineTo(x - ds / 2, y); ctx.closePath();
      ctx.stroke();
    }
  }
  for (let i = 1; i < nY; i++) {
    const y = m + i * ds * 2.6;
    const x1 = m * 0.9, x2 = W - m * 0.9;
    for (const x of [x1, x2]) {
      ctx.beginPath();
      ctx.moveTo(x, y - ds / 2); ctx.lineTo(x + ds / 2, y); ctx.lineTo(x, y + ds / 2); ctx.lineTo(x - ds / 2, y); ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Gambar bingkai penuh — panggil SETELAH latar digambar, SEBELUM konten ayat. */
export function gambarFrameIslami(ctx: CanvasRenderingContext2D, W: number, H: number, gaya: GayaFrame) {
  const p = PALET[gaya] || PALET.emas;
  const m = Math.min(W, H) * 0.028; // margin frame
  ctx.save();
  ctx.lineJoin = "round";

  if (gaya === "tipis" || gaya === "klasik") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = gaya === "klasik" ? Math.max(1.6, m * 0.2) : Math.max(1, m * 0.14);
    ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
    if (gaya === "klasik") {
      ctx.strokeStyle = p.sekunder;
      ctx.lineWidth = Math.max(1, m * 0.08);
      ctx.strokeRect(m * 0.9, m * 0.9, W - m * 1.8, H - m * 1.8);
    }
  } else if (gaya === "emas" || gaya === "hijau" || gaya === "mewah") {
    // bingkai luar + garis dalam + ornamen sudut + diamond tengah
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.5, m * 0.22);
    ctx.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1, m * 0.1);
    ctx.strokeRect(m * 0.75, m * 0.75, W - m * 1.5, H - m * 1.5);
    const s = m * 2.6;
    ornamenSudut(ctx, m * 0.35, m * 0.35, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.35, m * 0.35, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.35, H - m * 0.35, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.35, H - m * 0.35, s, true, true, p.utama);
    diamondTengah(ctx, W / 2, m * 0.55, m * 0.8, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.55, m * 0.8, p.utama);
    diamondTengah(ctx, m * 0.55, H / 2, m * 0.8, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.55, H / 2, m * 0.8, p.utama, Math.PI / 2);
    if (gaya === "mewah") {
      deretDiamond(ctx, W, H, m, p.sekunder);
      ctx.strokeStyle = p.utama;
      ctx.lineWidth = Math.max(1, m * 0.05);
      ctx.strokeRect(m * 1.05, m * 1.05, W - m * 2.1, H - m * 2.1);
    }
  } else if (gaya === "ornamen") {
    // ornamen PADAT: bingkai ganda + deret diamond + ornamen sudut besar
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.5, m * 0.2);
    ctx.strokeRect(m * 0.3, m * 0.3, W - m * 0.6, H - m * 0.6);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1, m * 0.09);
    ctx.strokeRect(m * 0.62, m * 0.62, W - m * 1.24, H - m * 1.24);
    const s = m * 3.0;
    ornamenSudut(ctx, m * 0.3, m * 0.3, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.3, m * 0.3, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.3, H - m * 0.3, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.3, H - m * 0.3, s, true, true, p.utama);
    deretDiamond(ctx, W, H, m, p.utama);
    diamondTengah(ctx, W / 2, m * 0.5, m * 0.9, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.5, m * 0.9, p.utama);
    diamondTengah(ctx, m * 0.5, H / 2, m * 0.9, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.5, H / 2, m * 0.9, p.utama, Math.PI / 2);
  } else if (gaya === "bintang") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.5, m * 0.2);
    ctx.strokeRect(m * 0.4, m * 0.4, W - m * 0.8, H - m * 0.8);
    const r = m * 1.1;
    bintang8(ctx, m * 0.4, m * 0.4, r, p.utama);
    bintang8(ctx, W - m * 0.4, m * 0.4, r, p.utama);
    bintang8(ctx, m * 0.4, H - m * 0.4, r, p.utama);
    bintang8(ctx, W - m * 0.4, H - m * 0.4, r, p.utama);
    bintang8(ctx, W / 2, m * 0.4, r * 0.6, p.sekunder);
    bintang8(ctx, W / 2, H - m * 0.4, r * 0.6, p.sekunder);
    diamondTengah(ctx, m * 0.4, H / 2, m * 0.7, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.4, H / 2, m * 0.7, p.utama, Math.PI / 2);
  } else {
    // bulan: bingkai + bulan sabit di sudut & tengah atas
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.5, m * 0.2);
    ctx.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1, m * 0.09);
    ctx.strokeRect(m * 0.7, m * 0.7, W - m * 1.4, H - m * 1.4);
    const r = m * 0.8;
    bulanSabit(ctx, m * 0.6, m * 0.6, r, p.utama);
    bulanSabit(ctx, W - m * 0.6, m * 0.6, r, p.utama);
    bulanSabit(ctx, m * 0.6, H - m * 0.6, r, p.utama);
    bulanSabit(ctx, W - m * 0.6, H - m * 0.6, r, p.utama);
    bulanSabit(ctx, W / 2, m * 0.6, r * 1.2, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.6, m * 0.8, p.utama);
  }
  ctx.restore();
}
