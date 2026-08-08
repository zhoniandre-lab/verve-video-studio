/* =====================================================================
   GAYA TEKS (v19.44) — font & style teks custom, 100% orisinal
   Dipakai menu Teks di Spectrum: tulis teks → pilih font → warna →
   3D/stroke → render di atas video.
   ===================================================================== */

export interface FontOpt {
  id: string;
  label: string;
  /** css font-family (dengan fallback aman) */
  css: string;
  weight: number;
}

export const FONT_OPTS: FontOpt[] = [
  { id: "poppins", label: "Poppins (tegas)", css: "'Poppins',system-ui,sans-serif", weight: 900 },
  { id: "impact", label: "Impact (berat)", css: "Impact,'Arial Black',sans-serif", weight: 900 },
  { id: "serif", label: "Playfair (elegan)", css: "'Playfair Display',Georgia,serif", weight: 700 },
  { id: "mono", label: "Mono (teknis)", css: "'Courier New',monospace", weight: 700 },
  { id: "comic", label: "Rounded (lucu)", css: "'Comic Sans MS','Segoe UI',sans-serif", weight: 700 },
  { id: "cursive", label: "Cursive (tangan)", css: "'Brush Script MT','Segoe Script',cursive", weight: 700 },
  { id: "display", label: "Display (judul)", css: "'Arial Black',sans-serif", weight: 900 },
  { id: "thin", label: "Thin (langsing)", css: "'Poppins',system-ui,sans-serif", weight: 300 },
];

export interface TextStyle {
  fontId: string;
  color: string;
  stroke: string;      // warna outline ("" = tanpa)
  strokeW: number;     // 0..0.2 (fraksi ukuran)
  tigaD: boolean;      // efek 3D (bayangan offset)
  grad: boolean;       // gradasi warna teks
  gradTo: string;      // warna kedua gradasi
  shadow: boolean;
  align: "left" | "center" | "right";
}

export const TEXT_DEFAULT: TextStyle = {
  fontId: "poppins", color: "#ffffff", stroke: "#000000", strokeW: 0.12,
  tigaD: false, grad: false, gradTo: "#22d3ee", shadow: true, align: "center",
};

export const TEKS_WARNA: string[] = [
  "#ffffff", "#fde047", "#22d3ee", "#ec4899", "#a855f7", "#ef4444",
  "#22c55e", "#f97316", "#ffd700", "#000000",
];

/** Render teks custom dengan style (deterministik). */
export function gambarTeksCustom(
  ctx: CanvasRenderingContext2D,
  teks: string,
  x: number,
  y: number,        // tengah
  fs: number,       // ukuran font px
  st: TextStyle,
): void {
  if (!teks) return;
  const f = FONT_OPTS.find((o) => o.id === st.fontId) || FONT_OPTS[0];
  ctx.save();
  ctx.font = `${f.weight} ${fs}px ${f.css}`;
  ctx.textAlign = st.align as CanvasTextAlign;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // bayangan lembut
  if (st.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = fs * 0.18;
    ctx.shadowOffsetY = fs * 0.06;
  }
  // 3D: lapis offset bawah (warna gelap) beberapa kali
  if (st.tigaD) {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    for (let i = 1; i <= 4; i++) ctx.fillText(teks, x, y + fs * 0.06 * i);
  }
  // stroke outline
  if (st.stroke) {
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = Math.max(1, fs * st.strokeW);
    ctx.strokeText(teks, x, y);
  }
  // gradasi warna
  if (st.grad) {
    const g = ctx.createLinearGradient(x - fs * (teks.length * 0.3), y - fs / 2, x + fs * (teks.length * 0.3), y + fs / 2);
    g.addColorStop(0, st.color);
    g.addColorStop(1, st.gradTo);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = st.color;
  }
  ctx.fillText(teks, x, y);
  ctx.restore();
}
