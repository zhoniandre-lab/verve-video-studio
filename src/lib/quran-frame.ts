/* =====================================================================
   🕌 BINGKAI FRAME ISLAMI (v20.4) — ornamen digambar langsung di canvas
   (tanpa file gambar → ringan, mulus di render). 8 GAYA.
   🐛 v20.4: ukuran ornamen DIPERBESAR ±1.8× & lineWidth ditebalkan —
   dulu terlalu kecil (di layar HP terlihat cuma garis pinggiran).
   ===================================================================== */

export type GayaFrame = "emas" | "hijau" | "tipis" | "mewah" | "ornamen" | "bintang" | "bulan" | "klasik" | "png-emas" | "png-ornamen" | "png-hijau" | "png-bintang" | "png-bulan" | "png-mewah";

export const FRAME_ISLAMI: { id: GayaFrame; label: string; emoji: string }[] = [
  { id: "emas", label: "Emas Mewah", emoji: "🕌" },
  { id: "ornamen", label: "Emas Ornamen", emoji: "✨" },
  { id: "mewah", label: "Ganda Mewah", emoji: "👑" },
  { id: "hijau", label: "Hijau Zamrud", emoji: "💚" },
  { id: "bintang", label: "Bintang 8", emoji: "⭐" },
  { id: "bulan", label: "Bulan Sabit", emoji: "🌙" },
  { id: "klasik", label: "Klasik Polos", emoji: "📜" },
  { id: "tipis", label: "Tipis Elegan", emoji: "🤍" },
  // 🖼️ v20.12: FRAME PNG BAWAAN (desain khusus, tanpa upload) — dari /frames/
  { id: "png-emas", label: "PNG Emas", emoji: "🖼️" },
  { id: "png-ornamen", label: "PNG Ornamen", emoji: "🖼️" },
  { id: "png-hijau", label: "PNG Hijau", emoji: "🖼️" },
  { id: "png-bintang", label: "PNG Bintang", emoji: "🖼️" },
  { id: "png-bulan", label: "PNG Bulan", emoji: "🖼️" },
  { id: "png-mewah", label: "PNG Mewah", emoji: "🖼️" },
];

/** Path frame PNG bawaan (public/frames/). */
export const FRAME_PNG_BAWAAN: Record<string, string> = {
  "png-emas": "/frames/frame-emas-mewah.png",
  "png-ornamen": "/frames/frame-ornamen-padat.png",
  "png-hijau": "/frames/frame-hijau-zamrud.png",
  "png-bintang": "/frames/frame-bintang8.png",
  "png-bulan": "/frames/frame-bulan-sabit.png",
  "png-mewah": "/frames/frame-mewah-ganda.png",
};

/** Apakah gaya frame = PNG bawaan? */
export function framePngBawaan(id: GayaFrame): string | null {
  return FRAME_PNG_BAWAAN[id] || null;
}

const PALET: Record<GayaFrame, { utama: string; sekunder: string }> = {
  emas: { utama: "#d4af37", sekunder: "#8a6d1f" },
  ornamen: { utama: "#e8c96a", sekunder: "#9a7b2d" },
  mewah: { utama: "#d4af37", sekunder: "#b8860b" },
  hijau: { utama: "#2e8b57", sekunder: "#14532d" },
  bintang: { utama: "#d4af37", sekunder: "#7a5c10" },
  bulan: { utama: "#c9b458", sekunder: "#8a7a2a" },
  klasik: { utama: "rgba(255,255,255,0.7)", sekunder: "rgba(255,255,255,0.3)" },
  tipis: { utama: "rgba(255,255,255,0.8)", sekunder: "rgba(255,255,255,0.35)" },
  // gaya PNG bawaan — palet tidak dipakai (frame digambar dari file), cukup pengisi tipe
  "png-emas": { utama: "#d4af37", sekunder: "#8a6d1f" },
  "png-ornamen": { utama: "#e8c96a", sekunder: "#9a7b2d" },
  "png-hijau": { utama: "#2e8b57", sekunder: "#14532d" },
  "png-bintang": { utama: "#d4af37", sekunder: "#7a5c10" },
  "png-bulan": { utama: "#c9b458", sekunder: "#8a7a2a" },
  "png-mewah": { utama: "#d4af37", sekunder: "#b8860b" },
};

/** Ornamen sudut BESAR: garis diagonal + busur ganda + spiral + titik. */
function ornamenSudut(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flipX: boolean, flipY: boolean, warna: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(2.5, s * 0.055);
  ctx.lineCap = "round";
  // garis diagonal utama (tebal)
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.28, s * 0.28, s, s * 0.16);
  ctx.stroke();
  // busur ganda (besar)
  ctx.beginPath(); ctx.arc(s * 0.55, s * 0.55, s * 0.48, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(s * 0.55, s * 0.55, s * 0.32, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
  // titik hias (besar)
  ctx.beginPath(); ctx.arc(s * 0.3, s * 0.2, Math.max(2, s * 0.03), 0, Math.PI * 2); ctx.fillStyle = warna; ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.17, s * 0.36, Math.max(1.6, s * 0.022), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Kubah kecil (ciri khas masjid) — dipakai tengah atas/bawah. */
function kubah(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, warna: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath();
  ctx.arc(0, r * 0.1, r, Math.PI, 0);
  ctx.lineTo(0, r * 0.75);
  ctx.stroke();
  // puncak
  ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.95); ctx.lineTo(0, -r * 1.25); ctx.lineTo(r * 0.1, -r * 0.95); ctx.stroke();
  ctx.restore();
}

/** Bintang 8 sudut. */
function bintang8(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, warna: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(2, r * 0.12);
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
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.12, -2.2, 0.9); ctx.stroke();
  ctx.restore();
}

/** Diamond tengah sisi (besar). */
function diamondTengah(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, warna: string, rotasi = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotasi);
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s / 2, 0); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fillStyle = warna; ctx.fill();
  ctx.restore();
}

/** Deretan diamond kecil di sepanjang sisi (pola islami). */
function deretDiamond(ctx: CanvasRenderingContext2D, W: number, H: number, m: number, warna: string) {
  const ds = m * 0.55, nX = Math.floor((W - m * 2) / (ds * 2.4)), nY = Math.floor((H - m * 2) / (ds * 2.4));
  ctx.save();
  ctx.strokeStyle = warna;
  ctx.lineWidth = Math.max(1.2, m * 0.05);
  for (let i = 1; i < nX; i++) {
    const x = m + i * ds * 2.4;
    const y1 = m * 0.95, y2 = H - m * 0.95;
    for (const y of [y1, y2]) {
      ctx.beginPath();
      ctx.moveTo(x, y - ds / 2); ctx.lineTo(x + ds / 2, y); ctx.lineTo(x, y + ds / 2); ctx.lineTo(x - ds / 2, y); ctx.closePath();
      ctx.stroke();
    }
  }
  for (let i = 1; i < nY; i++) {
    const y = m + i * ds * 2.4;
    const x1 = m * 0.95, x2 = W - m * 0.95;
    for (const x of [x1, x2]) {
      ctx.beginPath();
      ctx.moveTo(x, y - ds / 2); ctx.lineTo(x + ds / 2, y); ctx.lineTo(x, y + ds / 2); ctx.lineTo(x - ds / 2, y); ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 🕌 v20.8: DESAIN ISLAMI DI DALAM VIDEO — selain bingkai tepi, isi area dengan
 *  ornamen Islami halus: bintang 8 besar di tengah (di belakang ayat), pola
 *  arabesque di kanan-kiri, garis pemisah atas-bawah dengan diamond. */
export function gambarDesainIslami(ctx: CanvasRenderingContext2D, W: number, H: number, gaya: GayaFrame) {
  const p = PALET[gaya] || PALET.emas;
  const m = Math.min(W, H) * 0.05;
  ctx.save();
  ctx.lineJoin = "round";

  // 1) bintang 8 BESAR di tengah (di belakang ayat — halus, tidak mengganggu teks)
  const r8 = Math.min(W, H) * 0.16;
  ctx.globalAlpha = 0.14;
  bintang8(ctx, W / 2, H * 0.42, r8, p.utama);
  bintang8(ctx, W / 2, H * 0.42, r8 * 0.55, p.sekunder);
  ctx.globalAlpha = 1;

  // 2) pola arabesque kecil di kanan & kiri (garis lengkung berulang)
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = p.utama;
  ctx.lineWidth = Math.max(1, m * 0.05);
  const nx = 5, ny = 7;
  const xs = W / (nx + 1), ys = H / (ny + 1);
  for (let i = 1; i <= nx; i++) {
    for (let j = 1; j <= ny; j++) {
      const x = i * xs, y = j * ys;
      // jangan timpa area ayat (tengah)
      if (Math.abs(x - W / 2) < W * 0.12 && y > H * 0.18 && y < H * 0.7) continue;
      ctx.beginPath();
      ctx.arc(x, y, m * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, m * 0.05, 0, Math.PI * 2); ctx.fillStyle = p.utama; ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // 3) garis pemisah atas & bawah dengan diamond (di area video, bukan tepi)
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = p.utama;
  ctx.lineWidth = Math.max(1, m * 0.04);
  const yA = m * 2.6, yB = H - m * 2.6;
  ctx.beginPath(); ctx.moveTo(m * 2, yA); ctx.lineTo(W - m * 2, yA); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(m * 2, yB); ctx.lineTo(W - m * 2, yB); ctx.stroke();
  diamondTengah(ctx, W / 2, yA, m * 0.7, p.utama);
  diamondTengah(ctx, W / 2, yB, m * 0.7, p.utama);
  ctx.globalAlpha = 1;

  ctx.restore();
}
export function gambarFrameIslami(ctx: CanvasRenderingContext2D, W: number, H: number, gaya: GayaFrame) {
  const p = PALET[gaya] || PALET.emas;
  const m = Math.min(W, H) * 0.05; // margin frame (v20.4: diperbesar dari 0.028)
  ctx.save();
  ctx.lineJoin = "round";

  if (gaya === "tipis" || gaya === "klasik") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = gaya === "klasik" ? Math.max(2.5, m * 0.22) : Math.max(1.8, m * 0.16);
    ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
    if (gaya === "klasik") {
      ctx.strokeStyle = p.sekunder;
      ctx.lineWidth = Math.max(1.4, m * 0.09);
      ctx.strokeRect(m * 0.95, m * 0.95, W - m * 1.9, H - m * 1.9);
      diamondTengah(ctx, W / 2, m * 0.75, m * 0.8, p.utama);
      diamondTengah(ctx, W / 2, H - m * 0.75, m * 0.8, p.utama);
    }
  } else if (gaya === "emas" || gaya === "hijau") {
    // bingkai luar + dalam + ornamen sudut BESAR + kubah atas/bawah + diamond sisi
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(2.5, m * 0.24);
    ctx.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1.6, m * 0.1);
    ctx.strokeRect(m * 0.8, m * 0.8, W - m * 1.6, H - m * 1.6);
    const s = m * 3.0;
    ornamenSudut(ctx, m * 0.35, m * 0.35, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.35, m * 0.35, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.35, H - m * 0.35, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.35, H - m * 0.35, s, true, true, p.utama);
    kubah(ctx, W / 2, m * 0.6, m * 1.1, p.utama);
    kubah(ctx, W / 2, H - m * 0.6, m * 1.1, p.utama);
    diamondTengah(ctx, m * 0.7, H / 2, m * 1.1, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.7, H / 2, m * 1.1, p.utama, Math.PI / 2);
    deretDiamond(ctx, W, H, m, p.sekunder);
  } else if (gaya === "mewah") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(3, m * 0.28);
    ctx.strokeRect(m * 0.3, m * 0.3, W - m * 0.6, H - m * 0.6);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1.6, m * 0.1);
    ctx.strokeRect(m * 0.65, m * 0.65, W - m * 1.3, H - m * 1.3);
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(1.4, m * 0.06);
    ctx.strokeRect(m * 1.0, m * 1.0, W - m * 2.0, H - m * 2.0);
    const s = m * 3.4;
    ornamenSudut(ctx, m * 0.3, m * 0.3, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.3, m * 0.3, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.3, H - m * 0.3, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.3, H - m * 0.3, s, true, true, p.utama);
    kubah(ctx, W / 2, m * 0.55, m * 1.3, p.utama);
    kubah(ctx, W / 2, H - m * 0.55, m * 1.3, p.utama);
    deretDiamond(ctx, W, H, m, p.utama);
    diamondTengah(ctx, m * 0.6, H / 2, m * 1.2, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.6, H / 2, m * 1.2, p.utama, Math.PI / 2);
  } else if (gaya === "ornamen") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(2.5, m * 0.22);
    ctx.strokeRect(m * 0.3, m * 0.3, W - m * 0.6, H - m * 0.6);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1.6, m * 0.09);
    ctx.strokeRect(m * 0.65, m * 0.65, W - m * 1.3, H - m * 1.3);
    const s = m * 3.4;
    ornamenSudut(ctx, m * 0.3, m * 0.3, s, false, false, p.utama);
    ornamenSudut(ctx, W - m * 0.3, m * 0.3, s, true, false, p.utama);
    ornamenSudut(ctx, m * 0.3, H - m * 0.3, s, false, true, p.utama);
    ornamenSudut(ctx, W - m * 0.3, H - m * 0.3, s, true, true, p.utama);
    deretDiamond(ctx, W, H, m, p.utama);
    kubah(ctx, W / 2, m * 0.55, m * 1.2, p.utama);
    kubah(ctx, W / 2, H - m * 0.55, m * 1.2, p.utama);
    diamondTengah(ctx, m * 0.6, H / 2, m * 1.1, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.6, H / 2, m * 1.1, p.utama, Math.PI / 2);
  } else if (gaya === "bintang") {
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(2.5, m * 0.22);
    ctx.strokeRect(m * 0.4, m * 0.4, W - m * 0.8, H - m * 0.8);
    const r = m * 1.4;
    bintang8(ctx, m * 0.45, m * 0.45, r, p.utama);
    bintang8(ctx, W - m * 0.45, m * 0.45, r, p.utama);
    bintang8(ctx, m * 0.45, H - m * 0.45, r, p.utama);
    bintang8(ctx, W - m * 0.45, H - m * 0.45, r, p.utama);
    bintang8(ctx, W / 2, m * 0.45, r * 0.7, p.sekunder);
    bintang8(ctx, W / 2, H - m * 0.45, r * 0.7, p.sekunder);
    diamondTengah(ctx, m * 0.45, H / 2, m * 1.0, p.utama, Math.PI / 2);
    diamondTengah(ctx, W - m * 0.45, H / 2, m * 1.0, p.utama, Math.PI / 2);
  } else {
    // bulan
    ctx.strokeStyle = p.utama;
    ctx.lineWidth = Math.max(2.5, m * 0.22);
    ctx.strokeRect(m * 0.35, m * 0.35, W - m * 0.7, H - m * 0.7);
    ctx.strokeStyle = p.sekunder;
    ctx.lineWidth = Math.max(1.6, m * 0.09);
    ctx.strokeRect(m * 0.75, m * 0.75, W - m * 1.5, H - m * 1.5);
    const r = m * 1.1;
    bulanSabit(ctx, m * 0.65, m * 0.65, r, p.utama);
    bulanSabit(ctx, W - m * 0.65, m * 0.65, r, p.utama);
    bulanSabit(ctx, m * 0.65, H - m * 0.65, r, p.utama);
    bulanSabit(ctx, W - m * 0.65, H - m * 0.65, r, p.utama);
    bulanSabit(ctx, W / 2, m * 0.65, r * 1.4, p.utama);
    diamondTengah(ctx, W / 2, H - m * 0.65, m * 1.1, p.utama);
  }
  ctx.restore();
}

/** 🖼️ v20.11: gambar frame PNG custom (upload user) — stretch penuh ke canvas,
 *  dengan overlay gelap halus biar ayat tetap terbaca. */
export function gambarFramePng(ctx: CanvasRenderingContext2D, W: number, H: number, dataUrl: string) {
  const im = new Image();
  im.src = dataUrl;
  if (!im.complete || !im.naturalWidth) return;
  ctx.save();
  ctx.drawImage(im, 0, 0, W, H);
  // scrim tipis di tengah biar teks terbaca (frame biasanya tebal di tepi)
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
