/* =====================================================================
   ✒️ TEKS ISLAMI (v20.14) — banyak teks, font Islami, efek cahaya,
   overlay Allah & Muhammad dengan animasi.
   ===================================================================== */

/** Font Islami yang cocok (sistem + Google Fonts via <link> di halaman). */
export const FONT_ISLAMI = [
  { id: "arab", label: "Arab Klasik", stack: "'Scheherazade New','Amiri','Traditional Arabic',serif" },
  { id: "naskh", label: "Naskh Halus", stack: "'Amiri','Scheherazade New','Traditional Arabic',serif" },
  { id: "kufi", label: "Kufi Tegas", stack: "'Reem Kufi','Amiri','Traditional Arabic',sans-serif" },
  { id: "dekoratif", label: "Dekoratif", stack: "'Aref Ruqaa','Amiri',serif" },
  { id: "serif", label: "Serif Elegan", stack: "Georgia,'Times New Roman',serif" },
  { id: "modern", label: "Modern Bersih", stack: "'Poppins',system-ui,sans-serif" },
];

/** Efek tampilan teks. */
export type EfekTeks = "normal" | "cahaya" | "menyala" | "emas" | "neon";

export const EFEK_TEKS: { id: EfekTeks; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "cahaya", label: "✨ Cahaya" },
  { id: "menyala", label: "🔥 Menyala" },
  { id: "emas", label: "🟡 Emas" },
  { id: "neon", label: "💡 Neon" },
];

export type TeksItem = {
  id: string;
  txt: string;
  font: string;        // id FONT_ISLAMI
  efek: EfekTeks;
  x: number; y: number; // fraksi posisi
  size: number;        // fraksi min(W,H)
  anim: "diam" | "naik" | "berdenyut" | "fade";
};

/** Gambar satu teks Islami dengan efek. */
export function gambarTeksIslami(
  ctx: CanvasRenderingContext2D,
  t: TeksItem,
  W: number,
  H: number,
  waktu: number,
  bass = 0,
) {
  if (!t.txt.trim()) return;
  const f = FONT_ISLAMI.find((x) => x.id === t.font) || FONT_ISLAMI[0];
  const fs = Math.round(Math.min(W, H) * t.size);
  const cx = t.x * W, cy = t.y * H;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // animasi
  let dy = 0, scale = 1, alpha = 1;
  if (t.anim === "naik") dy = -Math.sin(waktu * 0.8) * fs * 0.06;
  else if (t.anim === "berdenyut") scale = 1 + 0.04 * Math.sin(waktu * 2.4) + bass * 0.03;
  else if (t.anim === "fade") alpha = 0.7 + 0.3 * Math.sin(waktu * 1.4);
  ctx.globalAlpha = alpha;

  ctx.font = `700 ${Math.round(fs * scale)}px ${f.stack}`;

  if (t.efek === "normal") {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = Math.max(2, fs * 0.12);
    ctx.strokeText(t.txt, cx, cy + dy);
    ctx.fillText(t.txt, cx, cy + dy);
  } else if (t.efek === "cahaya") {
    // glow emas lembut (shadowBlur sedang — teks, bukan ornamen, jadi murah)
    ctx.shadowColor = "rgba(255,215,0,0.8)"; ctx.shadowBlur = fs * 0.25;
    ctx.fillStyle = "#fff7e0";
    ctx.strokeStyle = "rgba(120,90,0,0.6)"; ctx.lineWidth = Math.max(1.5, fs * 0.08);
    ctx.strokeText(t.txt, cx, cy + dy);
    ctx.fillText(t.txt, cx, cy + dy);
    ctx.shadowBlur = 0;
  } else if (t.efek === "menyala") {
    // gradien emas + glow kuat
    ctx.shadowColor = "rgba(255,190,60,0.95)"; ctx.shadowBlur = fs * 0.45;
    const g = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
    g.addColorStop(0, "#fff3c4"); g.addColorStop(0.5, "#ffd75e"); g.addColorStop(1, "#d4a017");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(90,60,0,0.7)"; ctx.lineWidth = Math.max(1.5, fs * 0.07);
    ctx.strokeText(t.txt, cx, cy + dy);
    ctx.fillText(t.txt, cx, cy + dy);
    ctx.shadowBlur = 0;
  } else if (t.efek === "emas") {
    const g = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
    g.addColorStop(0, "#ffe9a8"); g.addColorStop(0.5, "#d4af37"); g.addColorStop(1, "#8a6d1f");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = Math.max(2, fs * 0.1);
    ctx.strokeText(t.txt, cx, cy + dy);
    ctx.fillText(t.txt, cx, cy + dy);
  } else if (t.efek === "neon") {
    ctx.shadowColor = "rgba(56,189,248,0.9)"; ctx.shadowBlur = fs * 0.35;
    ctx.fillStyle = "#e0f2fe";
    ctx.strokeStyle = "rgba(2,132,199,0.8)"; ctx.lineWidth = Math.max(1.5, fs * 0.07);
    ctx.strokeText(t.txt, cx, cy + dy);
    ctx.fillText(t.txt, cx, cy + dy);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** Gaya overlay Allah & Muhammad. */
export type GayaOverlay = "kiri_kanan" | "atas_bawah" | "kanan_saja" | "kiri_saja" | "mati";

export const OVERLAY_LABEL: Record<GayaOverlay, string> = {
  kiri_kanan: "☪️ Allah kiri · Muhammad kanan",
  atas_bawah: "☪️ Allah atas · Muhammad bawah",
  kanan_saja: "☪️ Muhammad kanan saja",
  kiri_saja: "☪️ Allah kiri saja",
  mati: "🚫 Mati",
};

/** Gambar overlay Allah/Muhammad (Arab) dengan animasi denyut + cahaya. */
export function gambarOverlayAllah(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gaya: GayaOverlay,
  waktu: number,
  bass = 0,
) {
  if (gaya === "mati") return;
  const fs = Math.round(Math.min(W, H) * 0.055);
  const font = "'Scheherazade New','Amiri','Traditional Arabic',serif";
  const glow = 0.6 + 0.4 * Math.sin(waktu * 1.6) + bass * 0.2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = `rgba(212,175,55,${Math.min(1, glow)})`;
  ctx.shadowBlur = fs * (0.3 + glow * 0.2);
  ctx.font = `700 ${fs}px ${font}`;
  const grad = ctx.createLinearGradient(0, H / 2 - fs, 0, H / 2 + fs);
  grad.addColorStop(0, "#fff3c4"); grad.addColorStop(1, "#d4af37");
  ctx.fillStyle = grad;
  const tulis = (txt: string, x: number, y: number) => {
    ctx.fillText(txt, x, y);
  };
  const A = "الله", M = "محمد";
  const m = Math.min(W, H) * 0.07;
  if (gaya === "kiri_kanan") {
    tulis(A, m * 2.2, H * 0.5);
    tulis(M, W - m * 2.2, H * 0.5);
  } else if (gaya === "atas_bawah") {
    tulis(A, W / 2, m * 2.4);
    tulis(M, W / 2, H - m * 2.4);
  } else if (gaya === "kanan_saja") {
    tulis(M, W - m * 2.2, H * 0.5);
  } else if (gaya === "kiri_saja") {
    tulis(A, m * 2.2, H * 0.5);
  }
  ctx.restore();
}
