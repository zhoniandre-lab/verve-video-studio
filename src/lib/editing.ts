/* =====================================================================
   VERVE-CUT editing engine v5 — mesin editing ala CapCut (100% orisinal)
   - Katalog: transisi, animasi, efek, filter, font, template teks, stiker
   - Timeline math per-klip (durasi beda-beda + transisi per-sambungan)
   - Painter bersama untuk PREVIEW (page.tsx) & EXPORT (recorder.ts)
   ===================================================================== */

export interface ClipText {
  txt: string;
  font: string;        // id dari TEXT_FONTS
  size: number;        // 0.025..0.09 (relatif H)
  color: string;
  bold: boolean; italic: boolean; shadow: boolean;
  stroke: boolean; strokeColor: string; strokeW: number; // strokeW px
  bg: boolean; bgColor: string;
  y: number;           // 0.06..0.94 (posisi vertikal blok)
  align: "left" | "center" | "right";
  anim: string;        // id TEXT_ANIMS
  karaokeWords?: { w: string; start: number; end: number }[]; // timing kata (keterangan otomatis)
  karaokeColor?: string;
  x?: number;          // 0.05..0.95 (posisi horizontal bebas — default: ikut align)
  start?: number | null; // detik ABSOLUT di timeline (undefined/null = ikut klip)
  dur?: number;        // detik tampil saat mode lepas (default: durasi klip)
}
export interface StickerItem { id: string; emoji: string; x: number; y: number; size: number; rot: number; img?: string; opacity?: number; }
export interface SlideOpt {
  dur?: number;              // detik (hold time, tanpa transisi)
  trans?: string;            // id TRANSITIONS (ke klip berikutnya)
  transDur?: number;         // detik
  animIn?: string;           // id ANIM_IN
  animOut?: string;          // id ANIM_OUT
  animDur?: number;          // detik
  speed?: number;            // 0.3..3 (dur efektif = dur/speed)
  effect?: string;           // id EFFECTS | ""
  filter?: string;           // id FILTERS | ""
  loop?: string;             // id ANIM_LOOP (animasi berulang "Kombinasi")
  tx?: number;               // geser gambar X (fraksi lebar bingkai) — kunci per-klip
  ty?: number;               // geser gambar Y (fraksi tinggi bingkai)
  tz?: number;               // zoom gambar (1 = normal, 0.5..6)
  text?: ClipText | null;
  stickers?: StickerItem[];
}
export interface AdjustState {
  b: number; c: number; s: number; e: number;      // brightness/contrast/saturation/exposure (-50..50)
  tem: number; hue: number;                        // suhu & rona (-50..50)
  fade: number; vig: number; grain: number;        // 0..100
}
export const DEFAULT_ADJUST: AdjustState = { b:0, c:0, s:0, e:0, tem:0, hue:0, fade:0, vig:75, grain:0 };

export const DEFAULT_TEXT: ClipText = {
  txt: "", font: "sistem", size: 0.055, color: "#ffffff", bold: true, italic: false, shadow: true,
  stroke: true, strokeColor: "#000000", strokeW: 4, bg: false, bgColor: "#000000",
  y: 0.82, align: "center", anim: "none",
};

/* ============================ KATALOG ============================ */
export interface CatItem { id: string; label: string; emoji: string; cat?: string; }

export const TRANSITIONS: CatItem[] = [
  { id: "none",       label: "Cut",          emoji: "✂️", cat: "Dasar" },
  { id: "dissolve",   label: "Mix",          emoji: "🌗", cat: "Dasar" },
  { id: "fadeblack",  label: "Fade Hitam",   emoji: "⚫", cat: "Dasar" },
  { id: "fadewhite",  label: "Fade Putih",   emoji: "⚪", cat: "Dasar" },
  { id: "wipe-l",     label: "Wipe Kiri",    emoji: "⬅️", cat: "Geser" },
  { id: "wipe-r",     label: "Wipe Kanan",   emoji: "➡️", cat: "Geser" },
  { id: "wipe-u",     label: "Wipe Atas",    emoji: "⬆️", cat: "Geser" },
  { id: "wipe-d",     label: "Wipe Bawah",   emoji: "⬇️", cat: "Geser" },
  { id: "push-l",     label: "Dorong Kiri",  emoji: "👈", cat: "Geser" },
  { id: "push-r",     label: "Dorong Kanan", emoji: "👉", cat: "Geser" },
  { id: "push-u",     label: "Dorong Atas",  emoji: "🤏", cat: "Geser" },
  { id: "zoomin",     label: "Zoom Masuk",   emoji: "🔍", cat: "Zoom" },
  { id: "zoomout",    label: "Zoom Keluar",  emoji: "🔭", cat: "Zoom" },
  { id: "spin",       label: "Putar",        emoji: "🌀", cat: "Zoom" },
  { id: "flare",      label: "Silau",        emoji: "✨", cat: "Cahaya" },
  { id: "blur",       label: "Blur",         emoji: "💨", cat: "Cahaya" },
  { id: "lightleak",  label: "Cahaya Bocor", emoji: "🔆", cat: "Cahaya" },
  { id: "glitch",     label: "Glitch",       emoji: "⚡", cat: "Efek" },
  { id: "pixel",      label: "Pixelasi",     emoji: "🧩", cat: "Efek" },
  { id: "ripple",     label: "Ripple",       emoji: "🌊", cat: "Efek" },
  { id: "circle",     label: "Iris Bulat",   emoji: "⭕", cat: "Efek" },
  { id: "blinds",     label: "Tirai",        emoji: "🪟", cat: "Efek" },
  { id: "shake",      label: "Guncang",      emoji: "📳", cat: "Efek" },
  { id: "aimorph",    label: "Morph Cair",   emoji: "🧬", cat: "AI ✨" },
  { id: "airadial",   label: "Radial Zoom",  emoji: "🎯", cat: "AI ✨" },
  { id: "aipartikel", label: "Partikel",     emoji: "✨", cat: "AI ✨" },
  { id: "aiholo",     label: "Hologram",     emoji: "📡", cat: "AI ✨" },
  { id: "aiink",      label: "Tinta Menyebar", emoji: "🖋️", cat: "AI ✨" },
  { id: "aichroma",   label: "Kroma Zoom",   emoji: "🌈", cat: "AI ✨" },
];
// Alias id lama → id baru (kompatibilitas draft lama)
export const TRANS_ALIAS: Record<string, string> = {
  fade: "dissolve", zoom: "zoomin", slide: "push-l",
};

export const ANIM_IN: CatItem[] = [
  { id: "none",    label: "Tanpa",     emoji: "🚫" },
  { id: "fade",    label: "Muncul",    emoji: "🌫️" },
  { id: "zoomin",  label: "Perbesar",  emoji: "🔍" },
  { id: "zoomout", label: "Perkecil",  emoji: "🔭" },
  { id: "slide-l", label: "Geser Kiri",emoji: "⬅️" },
  { id: "slide-r", label: "Geser Kanan",emoji:"➡️" },
  { id: "slide-u", label: "Geser Atas",emoji: "⬆️" },
  { id: "slide-d", label: "Geser Bawah",emoji:"⬇️" },
  { id: "spin",    label: "Putar",     emoji: "🌀" },
  { id: "bounce",  label: "Pantul",    emoji: "🏀" },
  { id: "blur",    label: "Blur",      emoji: "💨" },
];
export const ANIM_OUT: CatItem[] = [
  { id: "none",    label: "Tanpa",     emoji: "🚫" },
  { id: "fade",    label: "Hilang",    emoji: "🌫️" },
  { id: "zoomin",  label: "Tembus",    emoji: "🚀" },
  { id: "zoomout", label: "Menjauh",   emoji: "🔭" },
  { id: "slide-l", label: "Geser Kiri",emoji: "⬅️" },
  { id: "slide-r", label: "Geser Kanan",emoji:"➡️" },
  { id: "spin",    label: "Putar",     emoji: "🌀" },
  { id: "blur",    label: "Blur",      emoji: "💨" },
];

export const EFFECTS: CatItem[] = [
  { id: "",            label: "Tanpa",        emoji: "🚫", cat: "Populer" },
  { id: "kilau",       label: "Kilau",        emoji: "✨", cat: "Populer" },
  { id: "pulse",       label: "Denyut",       emoji: "💓", cat: "Populer" },
  { id: "shake",       label: "Goyang",       emoji: "📳", cat: "Populer" },
  { id: "leak",        label: "Cahaya Bocor", emoji: "🔆", cat: "Tren" },
  { id: "rgb",         label: "RGB Glitch",   emoji: "🌈", cat: "Tren" },
  { id: "cermin",      label: "Cermin",       emoji: "🪞", cat: "Tren" },
  { id: "vigplus",     label: "Vignette+",    emoji: "🌑", cat: "Retro" },
  { id: "scanline",    label: "Scanline TV",  emoji: "📺", cat: "Retro" },
  { id: "hujan",       label: "Hujan",        emoji: "🌧️", cat: "Suasana" },
  { id: "salju",       label: "Salju",        emoji: "❄️", cat: "Suasana" },
  { id: "kabut",       label: "Kabut",        emoji: "🌫️", cat: "Suasana" },
  { id: "bintang",     label: "Bintang",      emoji: "🌟", cat: "Suasana" },
  { id: "gelembung",   label: "Gelembung",    emoji: "🫧", cat: "Suasana" },
];

export const FILTERS: { id: string; label: string; emoji: string; css: string }[] = [
  { id: "none",      label: "Asli",       emoji: "🚫", css: "" },
  { id: "vivid",     label: "Vivid",      emoji: "🎨", css: "saturate(1.4) contrast(1.12) brightness(1.05)" },
  { id: "cerah",     label: "Cerah",      emoji: "☀️", css: "brightness(1.12) contrast(1.05) saturate(1.1)" },
  { id: "sinematik", label: "Sinematik",  emoji: "🎬", css: "contrast(1.18) saturate(0.85) brightness(0.95)" },
  { id: "hangat",    label: "Hangat",     emoji: "🔥", css: "sepia(0.18) saturate(1.15) brightness(1.02)" },
  { id: "dingin",    label: "Dingin",     emoji: "🧊", css: "hue-rotate(-10deg) saturate(1.1) brightness(1.02)" },
  { id: "senja",     label: "Senja",      emoji: "🌇", css: "sepia(0.25) saturate(1.2) hue-rotate(-10deg)" },
  { id: "bw",        label: "Hitam Putih",emoji: "⬛", css: "grayscale(1) contrast(1.1)" },
  { id: "vintage",   label: "Vintage",    emoji: "📼", css: "sepia(0.35) contrast(0.95) brightness(0.95) saturate(0.85)" },
  { id: "dreamy",    label: "Dreamy",     emoji: "💭", css: "brightness(1.1) contrast(0.92) saturate(1.15)" },
  { id: "film",      label: "Film Pudar", emoji: "🎞️", css: "contrast(0.9) brightness(1.08) saturate(0.8)" },
  { id: "cyber",     label: "Cyber",      emoji: "🌃", css: "hue-rotate(15deg) saturate(1.45) contrast(1.15)" },
  { id: "forest",    label: "Forest",     emoji: "🌲", css: "hue-rotate(45deg) saturate(0.9) contrast(1.08)" },
];

export const TEXT_FONTS: { id: string; label: string; stack: string }[] = [
  { id: "sistem",  label: "Sistem",  stack: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" },
  { id: "serif",   label: "Serif",   stack: "Georgia,'Times New Roman',serif" },
  { id: "mono",    label: "Mono",    stack: "'Courier New',Courier,monospace" },
  { id: "rounded", label: "Bulat",   stack: "ui-rounded,system-ui,'Segoe UI',sans-serif" },
  { id: "kursif",  label: "Kursif",  stack: "'Segoe Script','Brush Script MT',cursive" },
  { id: "tebal",   label: "Tebal",   stack: "'Arial Black',Impact,system-ui,sans-serif" },
  { id: "elegan",  label: "Elegan",  stack: "'Palatino Linotype','Book Antiqua',serif" },
];

export const TEXT_ANIMS: CatItem[] = [
  { id: "none",       label: "Tanpa",     emoji: "🚫" },
  { id: "fade",       label: "Fade",      emoji: "🌫️" },
  { id: "pop",        label: "Pop",       emoji: "🎈" },
  { id: "slideup",    label: "Naik",      emoji: "⬆️" },
  { id: "slidedown",  label: "Turun",     emoji: "⬇️" },
  { id: "typewriter", label: "Ketik",     emoji: "⌨️" },
  { id: "glow",       label: "Glow Pulse",emoji: "💡" },
];

const TCOLORS = ["#ffffff","#000000","#fde047","#f97316","#ef4444","#ec4899","#a855f7","#3b82f6","#22d3ee","#22c55e"];
export const TEXT_COLORS = TCOLORS;

export const TEXT_TEMPLATES: { id: string; label: string; emoji: string; st: Partial<ClipText> }[] = [
  { id: "klasik",  label: "Klasik",   emoji: "🔤", st: { color:"#ffffff", bold:true,  stroke:true,  strokeColor:"#000000", bg:false } },
  { id: "neon",    label: "Neon",     emoji: "💗", st: { color:"#ec4899", bold:true,  stroke:true,  strokeColor:"#ffffff", shadow:true, bg:false } },
  { id: "emas",    label: "Emas",     emoji: "👑", st: { color:"#fde047", bold:true,  stroke:true,  strokeColor:"#7c2d12", bg:false } },
  { id: "horor",   label: "Horor",    emoji: "🩸", st: { color:"#ef4444", bold:true,  stroke:false, font:"tebal", shadow:true, bg:false } },
  { id: "kuning",  label: "Kuning",   emoji: "🟡", st: { color:"#fde047", bold:true,  stroke:false, bg:true, bgColor:"#000000" } },
  { id: "putihbg", label: "Label",    emoji: "🏷️", st: { color:"#000000", bold:true,  stroke:false, bg:true, bgColor:"#ffffff" } },
  { id: "kursifa", label: "Elegan",   emoji: "✒️", st: { color:"#ffffff", bold:false, italic:true, font:"kursif", stroke:false, shadow:true, bg:false } },
  { id: "mono",    label: "Hacker",   emoji: "💻", st: { color:"#22c55e", bold:false, font:"mono", stroke:false, bg:true, bgColor:"#000000" } },
];

export const STICKER_CATS: { id: string; label: string; items: string[] }[] = [
  { id: "wajah",  label: "😀 Wajah",   items: ["😀","😂","😍","🥰","😭","😱","🤯","😎","🥳","😴","🤔","😡","👻","🤡","😇","🥺"] },
  { id: "cinta",  label: "❤️ Cinta",   items: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💖","💘","💝","💯","✨","💫"] },
  { id: "reaksi", label: "👍 Reaksi",  items: ["👍","👎","👏","🙌","🙏","💪","🔥","⚡","🎉","🎊","🏆","🥇","💥","❗","❓","💢"] },
  { id: "panah",  label: "➡️ Panah",   items: ["➡️","⬅️","⬆️","⬇️","↗️","↘️","🔃","🔄","➕","✅","❌","🚫","🔔","📌","📍","🎯"] },
  { id: "alam",   label: "🌸 Alam",    items: ["🌸","🌺","🌻","🌹","🍀","🌈","☀️","🌙","⭐","☁️","❄️","🌊","🍂","🌴","🦋","🐝"] },
  { id: "musik",  label: "🎵 Musik",   items: ["🎵","🎶","🎤","🎧","🎸","🎹","🥁","🎺","🎷","💿","📻","🔊","🎼","🎙️","🪩","🎚️"] },
  { id: "makan",  label: "🍔 Makanan", items: ["🍔","🍕","🍜","🍣","🍦","🍰","☕","🧋","🍉","🍩","🍿","🥤","🍺","🍇","🥑","🌶️"] },
  { id: "teks",   label: "🔤 Teks",    items: ["🆕","🆒","🆓","🔝","🆙","ℹ️","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","🔟","🎦","▶️","⏸️"] },
];

export const ADJUST_DEFS: { key: keyof AdjustState; label: string; emoji: string; min: number; max: number }[] = [
  { key: "b",     label: "Kecerahan", emoji: "☀️", min: -50, max: 50 },
  { key: "e",     label: "Exposure",  emoji: "📸", min: -50, max: 50 },
  { key: "c",     label: "Kontras",   emoji: "🌗", min: -50, max: 50 },
  { key: "s",     label: "Saturasi",  emoji: "🎨", min: -50, max: 50 },
  { key: "tem",   label: "Suhu",      emoji: "🌡️", min: -50, max: 50 },
  { key: "hue",   label: "Rona",      emoji: "🌈", min: -50, max: 50 },
  { key: "fade",  label: "Pudar",     emoji: "🌫️", min: 0,   max: 100 },
  { key: "vig",   label: "Vignette",  emoji: "🌑", min: 0,   max: 100 },
  { key: "grain", label: "Grain",     emoji: "📟", min: 0,   max: 100 },
];

/* ========================= FILTER BUILDER ========================= */
export function filterCssById(id: string): string {
  return (FILTERS.find(f => f.id === id)?.css) || "";
}
export function buildClipFilter(filterId: string | undefined, adj: AdjustState | null): string {
  const parts: string[] = [];
  const preset = filterCssById(filterId || "");
  if (preset) parts.push(preset);
  if (adj) {
    const br = 1 + adj.b / 100 + adj.e / 150;
    if (Math.abs(br - 1) > 0.001) parts.push(`brightness(${br.toFixed(3)})`);
    if (adj.c) parts.push(`contrast(${(1 + adj.c / 100).toFixed(3)})`);
    if (adj.s) parts.push(`saturate(${(1 + adj.s / 100).toFixed(3)})`);
    if (adj.tem > 0) parts.push(`sepia(${(adj.tem / 300).toFixed(3)})`);
    else if (adj.tem < 0) parts.push(`hue-rotate(${(adj.tem / 5).toFixed(1)}deg)`);
    if (adj.hue) parts.push(`hue-rotate(${(adj.hue * 1.8).toFixed(1)}deg)`);
    if (adj.fade) { parts.push(`contrast(${(1 - adj.fade / 250).toFixed(3)})`); parts.push(`brightness(${(1 + adj.fade / 350).toFixed(3)})`); }
  }
  return parts.length ? parts.join(" ") : "none";
}
export function joinFilters(a: string, b: string): string {
  const x = [a, b].filter(s => s && s !== "none").join(" ");
  return x || "none";
}

/* ========================= TIMELINE MATH ========================= */
export interface Timeline { starts: number[]; durs: number[]; tdurs: number[]; total: number; }
export interface LocateResult { idx: number; clipT: number; clipDur: number; inTrans: boolean; transT: number; nextIdx: number; transDur: number; transId: string; }

export function effDur(o: SlideOpt | undefined, defDur: number): number {
  const d = o?.dur ?? defDur;
  return Math.max(0.4, d / Math.max(0.25, o?.speed || 1));
}
export function buildTimeline(durs: number[], tdurs: number[], transIds: string[]): Timeline {
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < durs.length; i++) {
    starts.push(acc);
    const td = (i < durs.length - 1) ? tdurs[i] : 0;
    const id = canonicalTrans(transIds[i]);
    acc += durs[i] + ((id === "none") ? 0 : td);
  }
  return { starts, durs, tdurs: tdurs.map((t, i) => (i < durs.length - 1 && canonicalTrans(transIds[i]) !== "none") ? t : 0), total: acc };
}
export function canonicalTrans(id: string | undefined): string {
  if (!id) return "dissolve";
  if (TRANS_ALIAS[id]) id = TRANS_ALIAS[id];
  return TRANSITIONS.some(t => t.id === id) ? id : "dissolve";
}
export function locate(tl: Timeline, t: number): LocateResult {
  const n = tl.durs.length;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const end = tl.starts[i] + tl.durs[i] + tl.tdurs[i];
    if (t < end || i === n - 1) { idx = i; break; }
  }
  const clipDur = tl.durs[idx];
  const clipT = Math.max(0, t - tl.starts[idx]);
  const transDur = tl.tdurs[idx];
  const inTrans = transDur > 0 && clipT >= clipDur && idx < n - 1;
  const transT = inTrans ? Math.min(1, (clipT - clipDur) / transDur) : 0;
  return { idx, clipT: Math.min(clipT, clipDur), clipDur, inTrans, transT, nextIdx: Math.min(idx + 1, n - 1), transDur, transId: "" };
}

/* Captions: distribusi baris per klip mengikuti timeline (bukan merata) */
export function captionsFromClips(lines: string[], tl: Timeline): { text: string; start: number; end: number; line: number }[] {
  const out: { text: string; start: number; end: number; line: number }[] = [];
  for (let i = 0; i < Math.min(lines.length, tl.durs.length); i++) {
    const line = (lines[i] || "").trim();
    if (!line) continue;
    const words = line.split(/\s+/).filter(Boolean);
    const hold = Math.max(0.8, tl.durs[i] - 0.15);
    const per = hold / Math.max(1, words.length);
    words.forEach((w, wi) => {
      out.push({ text: w, start: tl.starts[i] + 0.1 + wi * per, end: tl.starts[i] + 0.1 + (wi + 1) * per, line: i });
    });
  }
  return out;
}

/* ========================= DRAW HELPERS ========================= */
const TAU = Math.PI * 2;
function rnd(i: number, salt: number): number { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
function easeIO(t: number): number { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t: number): number { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
export function hexToRgbE(hex: string): [number, number, number] {
  let v = (hex || "#ec4899").replace("#", "");
  if (v.length === 3) v = v.split("").map(c => c + c).join("");
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}

interface DrawParams { zoom: number; alpha: number; dx: number; dy: number; rot: number; filter: string; blur: number; }
const baseP = (filter: string): DrawParams => ({ zoom: 1, alpha: 1, dx: 0, dy: 0, rot: 0, filter, blur: 0 });

/* Mode latar belakang global (fitur "Latar belakang": cover = isi penuh,
   blur = letterbox dengan latar blur dari gambar itu sendiri,
   color = letterbox dengan warna solid). */
const DRAW_BG: { mode: "cover" | "blur" | "color"; color: string } = { mode: "cover", color: "#000000" };
export function setDrawBg(mode: "cover" | "blur" | "color", color = "#000000") { DRAW_BG.mode = mode; DRAW_BG.color = color; }

export function drawBase(ctx: CanvasRenderingContext2D, img: CanvasImageSource | null, W: number, H: number, p: DrawParams) {
  if (!img) { ctx.fillStyle = "#141419"; ctx.fillRect(0, 0, W, H); return; }
  const iw = (img as any).naturalWidth || (img as any).width || 0;
  const ih = (img as any).naturalHeight || (img as any).height || 0;
  if (!iw || !ih) { ctx.fillStyle = "#141419"; ctx.fillRect(0, 0, W, H); return; }
  const ir = iw / ih, cr = W / H;
  let sw = iw, sh = ih, sx = 0, sy = 0;
  if (ir > cr) { sh = ih; sw = sh * cr; sx = (iw - sw) / 2; } else { sw = iw; sh = sw / cr; sy = (ih - sh) / 2; }
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
  let f = p.filter && p.filter !== "none" ? p.filter : "";
  if (p.blur > 0.2) f = (f ? f + " " : "") + `blur(${p.blur.toFixed(1)}px)`;
  if (f) ctx.filter = f;
  ctx.translate(W / 2 + p.dx * W, H / 2 + p.dy * H);
  if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
  if (p.zoom !== 1) ctx.scale(p.zoom, p.zoom);
  ctx.translate(-W / 2, -H / 2);
  if (DRAW_BG.mode !== "cover") {
    // latar belakang (blur dari gambar / warna solid) untuk area letterbox
    ctx.save();
    if (DRAW_BG.mode === "blur") {
      ctx.filter = "blur(18px) brightness(0.65)";
      ctx.drawImage(img, sx, sy, sw, sh, -W * 0.06, -H * 0.06, W * 1.12, H * 1.12);
      ctx.filter = "none";
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = DRAW_BG.color; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    // gambar utama mode "contain"
    const sc = Math.min(W / iw, H / ih);
    const dw = iw * sc, dh = ih * sc;
    ctx.drawImage(img, 0, 0, iw, ih, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }
  ctx.restore();
}

/* ---------------------- ANIMASI KLIP ---------------------- */
function applyAnim(p: DrawParams, animId: string, prog: number, isIn: boolean) {
  if (!animId || animId === "none") return;
  const t = Math.max(0, Math.min(1, prog));
  const e = isIn ? easeIO(t) : t;
  if (isIn) {
    switch (animId) {
      case "fade": p.alpha *= e; break;
      case "zoomin": p.zoom *= 0.6 + 0.4 * e; break;
      case "zoomout": p.zoom *= 1.6 - 0.6 * e; break;
      case "slide-l": p.dx -= (1 - e); break;
      case "slide-r": p.dx += (1 - e); break;
      case "slide-u": p.dy -= (1 - e); break;
      case "slide-d": p.dy += (1 - e); break;
      case "spin": p.rot += (1 - e) * 180; p.zoom *= 0.3 + 0.7 * e; p.alpha *= e; break;
      case "bounce": p.zoom *= 0.35 + 0.65 * easeOutBack(t); break;
      case "blur": p.blur = Math.max(p.blur, (1 - t) * 6); break;
    }
  } else {
    switch (animId) {
      case "fade": p.alpha *= e; break;
      case "zoomin": p.zoom *= 1 + (1 - e) * 0.6; p.alpha *= e; break;
      case "zoomout": p.zoom *= 0.6 + 0.4 * e; p.alpha *= e; break;
      case "slide-l": p.dx -= (1 - e); break;
      case "slide-r": p.dx += (1 - e); break;
      case "spin": p.rot += (1 - e) * 120; p.alpha *= e; break;
      case "blur": p.blur = Math.max(p.blur, (1 - t) * 6); break;
    }
  }
}

/* ---------------------- TRANSISI ---------------------- */
export function paintTransition(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  cur: CanvasImageSource | null, nxt: CanvasImageSource | null,
  type: string, tRaw: number, curP: DrawParams, nxtP: DrawParams,
  isMobile: boolean, absT: number,
) {
  type = canonicalTrans(type);
  const t = easeIO(Math.max(0, Math.min(1, tRaw)));
  if (type === "none") { drawBase(ctx, nxt, W, H, { ...nxtP, alpha: 1 }); return; }
  switch (type) {
    case "dissolve":
      drawBase(ctx, cur, W, H, curP);
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * t });
      break;
    case "fadeblack": case "fadewhite": {
      const col = type === "fadeblack" ? "0,0,0" : "255,255,255";
      if (t < 0.5) { drawBase(ctx, cur, W, H, curP); ctx.fillStyle = `rgba(${col},${(t * 2).toFixed(3)})`; }
      else { drawBase(ctx, nxt, W, H, nxtP); ctx.fillStyle = `rgba(${col},${((1 - t) * 2).toFixed(3)})`; }
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "wipe-l": case "wipe-r": case "wipe-u": case "wipe-d": {
      drawBase(ctx, cur, W, H, curP);
      ctx.save(); ctx.beginPath();
      if (type === "wipe-l") ctx.rect(0, 0, W * t, H);
      else if (type === "wipe-r") ctx.rect(W * (1 - t), 0, W * t, H);
      else if (type === "wipe-u") ctx.rect(0, 0, W, H * t);
      else ctx.rect(0, H * (1 - t), W, H * t);
      ctx.clip();
      drawBase(ctx, nxt, W, H, nxtP);
      ctx.restore();
      break;
    }
    case "push-l": case "push-r": case "push-u": {
      const dir = type === "push-r" ? 1 : -1;
      drawBase(ctx, cur, W, H, { ...curP, dx: curP.dx + dir * -t });
      if (type === "push-u") drawBase(ctx, nxt, W, H, { ...nxtP, dy: nxtP.dy + (1 - t) });
      else drawBase(ctx, nxt, W, H, { ...nxtP, dx: nxtP.dx + -dir * (1 - t) });
      break;
    }
    case "zoomin":
      drawBase(ctx, cur, W, H, { ...curP, zoom: curP.zoom * (1 + t * 0.1), alpha: curP.alpha * (1 - t * 0.6) });
      drawBase(ctx, nxt, W, H, { ...nxtP, zoom: nxtP.zoom * (1.25 - 0.25 * t), alpha: nxtP.alpha * t });
      break;
    case "zoomout":
      drawBase(ctx, cur, W, H, { ...curP, zoom: curP.zoom * (1 - t * 0.1), alpha: curP.alpha * (1 - t * 0.6) });
      drawBase(ctx, nxt, W, H, { ...nxtP, zoom: nxtP.zoom * (0.72 + 0.28 * t), alpha: nxtP.alpha * t });
      break;
    case "spin":
      drawBase(ctx, cur, W, H, { ...curP, rot: curP.rot - t * 35, zoom: curP.zoom * (1 + t * 0.4), alpha: curP.alpha * (1 - t) });
      drawBase(ctx, nxt, W, H, { ...nxtP, rot: nxtP.rot + (1 - t) * 70, zoom: nxtP.zoom * (0.35 + 0.65 * t), alpha: nxtP.alpha * t });
      break;
    case "flare":
      drawBase(ctx, cur, W, H, curP);
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * t });
      ctx.fillStyle = `rgba(255,252,240,${(Math.sin(t * Math.PI) * 0.8).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      break;
    case "blur":
      drawBase(ctx, cur, W, H, { ...curP, blur: t * (isMobile ? 4 : 7), alpha: curP.alpha * (1 - t * 0.5) });
      drawBase(ctx, nxt, W, H, { ...nxtP, blur: (1 - t) * (isMobile ? 4 : 7), alpha: nxtP.alpha * (0.3 + 0.7 * t) });
      break;
    case "lightleak": {
      drawBase(ctx, cur, W, H, curP);
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * t });
      const a = Math.sin(t * Math.PI) * 0.6;
      const x = W * (t * 1.4 - 0.2);
      const g = ctx.createLinearGradient(x - W * 0.3, 0, x + W * 0.3, H);
      g.addColorStop(0, "rgba(255,140,40,0)");
      g.addColorStop(0.5, `rgba(255,170,80,${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case "glitch": {
      const showNxt = t > 0.5;
      drawBase(ctx, showNxt ? nxt : cur, W, H, showNxt ? nxtP : curP);
      const src = showNxt ? nxt : cur;
      const p = showNxt ? nxtP : curP;
      const amp = (1 - Math.abs(t - 0.5) * 2);
      ctx.save(); ctx.globalAlpha = 0.55 * amp;
      const bands = 4;
      for (let i = 0; i < bands; i++) {
        const yy = rnd(i, Math.floor(absT * 24)) * H;
        const hh = H * (0.04 + rnd(i + 9, 3) * 0.06);
        const off = (rnd(i + 5, Math.floor(absT * 30)) - 0.5) * W * 0.14 * amp;
        const iw = (src as any)?.width || (src as any)?.naturalWidth || 0;
        const ih = (src as any)?.height || (src as any)?.naturalHeight || 0;
        if (iw && ih) {
          ctx.save(); ctx.beginPath(); ctx.rect(0, yy, W, hh); ctx.clip();
          drawBase(ctx, src, W, H, { ...p, dx: p.dx + off / W });
          ctx.restore();
        }
      }
      ctx.restore();
      break;
    }
    case "pixel": {
      drawBase(ctx, cur, W, H, { ...curP, alpha: curP.alpha * (1 - t) });
      const key = "_pix";
      let pc: HTMLCanvasElement = (ctx as any)[key];
      const factor = Math.max(2, Math.round((1 - t) * 18)) + 2;
      const pw = Math.max(8, Math.floor(W / factor)), ph = Math.max(8, Math.floor(H / factor));
      if (!pc || pc.width !== pw || pc.height !== ph) {
        pc = document.createElement("canvas"); pc.width = pw; pc.height = ph; (ctx as any)[key] = pc;
      }
      const pctx = pc.getContext("2d")!;
      drawBase(pctx, nxt, pw, ph, { ...nxtP, filter: nxtP.filter, blur: 0 });
      ctx.save();
      ctx.globalAlpha = t;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pc, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
      break;
    }
    case "ripple": {
      drawBase(ctx, cur, W, H, { ...curP, alpha: curP.alpha * (1 - t) });
      const rows = isMobile ? 10 : 16;
      const amp = (1 - t) * W * 0.02;
      ctx.save(); ctx.globalAlpha = t;
      for (let r2 = 0; r2 < rows; r2++) {
        const y0 = (H / rows) * r2, hh = H / rows + 1;
        const off = Math.sin(t * Math.PI * 3 + r2 * 1.1) * amp;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, hh); ctx.clip();
        drawBase(ctx, nxt, W, H, { ...nxtP, dx: nxtP.dx + off / W });
        ctx.restore();
      }
      ctx.restore();
      break;
    }
    case "circle": {
      drawBase(ctx, cur, W, H, curP);
      const maxR = Math.sqrt(W * W + H * H) / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(1, maxR * t), 0, TAU); ctx.clip();
      drawBase(ctx, nxt, W, H, nxtP);
      ctx.restore();
      break;
    }
    case "blinds": {
      drawBase(ctx, cur, W, H, curP);
      const n = 6;
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect((W / n) * i, 0, (W / n) * t, H);
      ctx.clip();
      drawBase(ctx, nxt, W, H, nxtP);
      ctx.restore();
      break;
    }
    case "shake": {
      const amp = (1 - t) * 0.02;
      const jx = (rnd(Math.floor(absT * 60), 1) - 0.5) * 2 * amp;
      const jy = (rnd(Math.floor(absT * 60), 7) - 0.5) * 2 * amp;
      if (t < 0.5) drawBase(ctx, cur, W, H, { ...curP, dx: curP.dx + jx, dy: curP.dy + jy });
      else drawBase(ctx, nxt, W, H, { ...nxtP, dx: nxtP.dx + jx, dy: nxtP.dy + jy });
      break;
    }
    /* -------- TRANSISI AI ✨ (orisinal VERVE) -------- */
    case "aimorph": { // morph cair: irisan bergelombang saling silang
      const rows = isMobile ? 14 : 22;
      const amp = Math.sin(t * Math.PI) * W * 0.07;
      for (let r2 = 0; r2 < rows; r2++) {
        const y0 = (H / rows) * r2, hh = H / rows + 1;
        const ph = r2 * 0.9;
        const offC = Math.sin(ph + t * 5) * amp;
        const offN = Math.cos(ph - t * 5) * amp;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, hh); ctx.clip();
        drawBase(ctx, cur, W, H, { ...curP, alpha: curP.alpha * (1 - t), dx: curP.dx + offC / W });
        drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * t, dx: nxtP.dx + offN / W });
        ctx.restore();
      }
      break;
    }
    case "airadial": { // zoom radial dengan ghost bertingkat (fake radial blur)
      const passes = 5;
      ctx.save();
      for (let k = passes; k >= 0; k--) {
        const f = k / passes;
        drawBase(ctx, cur, W, H, { ...curP, zoom: curP.zoom * (1 + t * 0.5 * f), alpha: curP.alpha * (1 - t) * (0.55 / (passes + 1) + (k === 0 ? 0.45 * (1 - t) : 0)) });
      }
      for (let k = passes; k >= 0; k--) {
        const f = k / passes;
        drawBase(ctx, nxt, W, H, { ...nxtP, zoom: nxtP.zoom * (1 + (1 - t) * 0.5 * f), alpha: nxtP.alpha * t * (0.55 / (passes + 1) + (k === 0 ? 0.45 * t : 0)) });
      }
      ctx.restore();
      break;
    }
    case "aipartikel": { // gambar lama pecah jadi partikel kotak melayang
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * Math.min(1, t * 1.5) });
      if (t < 0.98 && cur) {
        const iw = (cur as any).naturalWidth || (cur as any).width || 0;
        const ih = (cur as any).naturalHeight || (cur as any).height || 0;
        if (iw && ih) {
          const cols = isMobile ? 8 : 12, rowsP = isMobile ? 10 : 14;
          const cw = W / cols, chh = H / rowsP;
          ctx.save();
          for (let i = 0; i < cols * rowsP; i++) {
            const cx = i % cols, cy = Math.floor(i / cols);
            const rr = rnd(i, 3);
            const a = Math.max(0, 1 - t * (0.85 + rr * 0.9));
            if (a <= 0.02) continue;
            ctx.globalAlpha = a * curP.alpha;
            const dx2 = (rnd(i, 11) - 0.5) * W * 0.3 * t * t;
            const dy2 = t * t * (0.25 + rr * 1.1) * H * 0.38;
            ctx.drawImage(cur, (iw / cols) * cx, (ih / rowsP) * cy, iw / cols, ih / rowsP, cw * cx + dx2, chh * cy + dy2, cw + 0.5, chh + 0.5);
          }
          ctx.restore();
        }
      }
      break;
    }
    case "aiholo": { // hologram: gambar baru muncul per garis pindai + kedip
      drawBase(ctx, cur, W, H, { ...curP, alpha: curP.alpha * (1 - t) });
      const lines = isMobile ? 26 : 42;
      const flick = 0.72 + 0.28 * rnd(Math.floor(absT * 40), 5);
      ctx.save();
      ctx.beginPath();
      for (let r2 = 0; r2 < lines; r2++) {
        if ((r2 / lines) < t) ctx.rect(0, (H / lines) * r2, W, Math.max(1, H / lines - 1.5));
      }
      ctx.clip();
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * flick * (0.4 + 0.6 * t) });
      ctx.restore();
      ctx.fillStyle = `rgba(25,194,184,${(Math.sin(t * Math.PI) * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      const sy = H * t;
      ctx.fillStyle = `rgba(180,255,248,${(Math.sin(t * Math.PI) * 0.5).toFixed(3)})`;
      ctx.fillRect(0, Math.max(0, sy - 2), W, Math.min(3, H));
      break;
    }
    case "aiink": { // tinta menyebar: blot membesar membuka gambar baru
      drawBase(ctx, cur, W, H, curP);
      const blobs = isMobile ? 8 : 12;
      const maxR = Math.sqrt(W * W + H * H) * 0.55;
      ctx.save(); ctx.beginPath();
      for (let b = 0; b < blobs; b++) {
        const bx = rnd(b, 1) * W, by = rnd(b, 2) * H;
        const delay = 0.1 + rnd(b, 3) * 0.4;
        const tt2 = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
        if (tt2 <= 0) continue;
        const br = Math.max(0.1, maxR * easeIO(tt2));
        ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, TAU);
      }
      ctx.clip();
      drawBase(ctx, nxt, W, H, nxtP);
      ctx.restore();
      break;
    }
    case "aichroma": { // kroma zoom: zoom + split warna RGB halus
      const amp = Math.sin(t * Math.PI);
      drawBase(ctx, cur, W, H, { ...curP, zoom: curP.zoom * (1 + t * 0.12), alpha: curP.alpha * (1 - t) });
      drawBase(ctx, nxt, W, H, { ...nxtP, zoom: nxtP.zoom * (1.08 - 0.08 * t), alpha: nxtP.alpha * t });
      ctx.save();
      drawBase(ctx, nxt, W, H, { ...nxtP, dx: nxtP.dx + amp * 0.022, alpha: amp * 0.32, filter: "saturate(2.2) hue-rotate(-50deg)" });
      drawBase(ctx, nxt, W, H, { ...nxtP, dx: nxtP.dx - amp * 0.022, alpha: amp * 0.32, filter: "saturate(2.2) hue-rotate(50deg)" });
      ctx.restore();
      break;
    }
    default:
      drawBase(ctx, cur, W, H, curP);
      drawBase(ctx, nxt, W, H, { ...nxtP, alpha: nxtP.alpha * t });
  }
}

/* ---------------------- EFEK OVERLAY ---------------------- */
function paintEffectOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, id: string, absT: number, isMobile: boolean) {
  if (!id) return;
  ctx.save();
  const N = isMobile ? 0.6 : 1;
  switch (id) {
    case "kilau": {
      const n = Math.round(16 * N) || 1;
      ctx.strokeStyle = "rgba(255,240,180,1)"; ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const tw = Math.sin(absT * 2.6 + i * 2.3);
        if (tw <= 0.1) continue;
        const x = rnd(i, 1) * W, y = rnd(i, 2) * H, r = (3 + rnd(i, 3) * 8) * tw;
        ctx.globalAlpha = 0.85 * tw; ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r * 1.6); ctx.stroke();
      }
      break;
    }
    case "leak": {
      const x = W * (0.5 + 0.3 * Math.sin(absT * 0.4));
      const g = ctx.createLinearGradient(x - W * 0.35, 0, x + W * 0.35, H);
      g.addColorStop(0, "rgba(255,120,30,0)");
      g.addColorStop(0.5, "rgba(255,160,70,0.32)");
      g.addColorStop(1, "rgba(255,210,150,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case "vigplus": {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case "scanline": {
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      const step = Math.max(3, Math.round(H / 160));
      for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
      break;
    }
    case "hujan": {
      const n = Math.round(55 * N) || 1;
      ctx.strokeStyle = "rgba(180,200,235,0.4)"; ctx.lineWidth = Math.max(1, W / 500);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = rnd(i, 5) * W;
        const y = (((absT * (0.55 + rnd(i, 4) * 0.3)) + rnd(i, 6)) % 1.15 - 0.075) * H;
        ctx.moveTo(x, y); ctx.lineTo(x - W * 0.008, y + H * 0.045);
      }
      ctx.stroke();
      break;
    }
    case "salju": {
      const n = Math.round(40 * N) || 1;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < n; i++) {
        const x = (rnd(i, 7) + Math.sin(absT * 0.7 + i) * 0.015) * W;
        const y = (((absT * (0.08 + rnd(i, 8) * 0.07)) + rnd(i, 9)) % 1.05) * H;
        ctx.globalAlpha = 0.4 + rnd(i, 10) * 0.5;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, W / 400 * (0.5 + rnd(i, 11))), 0, TAU); ctx.fill();
      }
      break;
    }
    case "kabut": {
      for (let i = 0; i < 2; i++) {
        const t = (absT * 0.03 + i * 0.5) % 1;
        const x = W * t, y = H * (0.3 + i * 0.35);
        const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.4);
        g.addColorStop(0, `rgba(210,215,225,${i ? 0.10 : 0.14})`); g.addColorStop(1, "rgba(210,215,225,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case "bintang": {
      const n = Math.round(45 * N) || 1;
      for (let i = 0; i < n; i++) {
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(absT * (1 + rnd(i, 12) * 2) + i));
        ctx.globalAlpha = tw * 0.8;
        ctx.fillStyle = "#fff";
        ctx.fillRect(rnd(i, 13) * W, rnd(i, 14) * H * 0.75, Math.max(1, W / 500), Math.max(1, W / 500));
      }
      break;
    }
    case "gelembung": {
      const n = Math.round(12 * N) || 1;
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1, W / 600);
      for (let i = 0; i < n; i++) {
        const x = (rnd(i, 15) + Math.sin(absT + i) * 0.01) * W;
        const y = (1 - ((absT * (0.06 + rnd(i, 16) * 0.06) + rnd(i, 17)) % 1.05)) * H;
        const r = W * (0.008 + rnd(i, 18) * 0.02);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

/* ---------------------- STIKER ---------------------- */
export function paintStickers(ctx: CanvasRenderingContext2D, W: number, H: number, stickers: StickerItem[] | undefined, alpha: number) {
  if (!stickers || !stickers.length) return;
  ctx.save();
  for (const st of stickers) {
    const px = Math.max(10, st.size * H);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(st.x * W, st.y * H);
    if (st.rot) ctx.rotate(st.rot * Math.PI / 180);
    ctx.font = `${px}px 'Segoe UI Emoji','Noto Color Emoji',system-ui,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = px * 0.08;
    ctx.fillText(st.emoji, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------------- TEKS KLIP ---------------------- */
export function paintClipText(ctx: CanvasRenderingContext2D, W: number, H: number, ct: ClipText, clipT: number, clipDur: number, absT: number, fadeMul: number) {
  if (!ct || !ct.txt || !ct.txt.trim()) return;
  const stack = TEXT_FONTS.find(f => f.id === ct.font)?.stack || TEXT_FONTS[0].stack;
  let fs = Math.max(10, ct.size * H);
  let alpha = 1, scale = 1, dy = 0, shadowPulse = 0;
  let txt = ct.txt;
  const ain = Math.min(1, clipT / 0.45);
  switch (ct.anim) {
    case "fade": alpha *= ain; break;
    case "pop": scale = easeOutBack(ain); if (ain < 0.12) alpha *= ain / 0.12; break;
    case "slideup": dy = (1 - easeIO(ain)) * H * 0.12; alpha *= Math.min(1, ain * 2); break;
    case "slidedown": dy = -(1 - easeIO(ain)) * H * 0.12; alpha *= Math.min(1, ain * 2); break;
    case "typewriter": {
      const total = ct.txt.length;
      const dur = Math.min(2.2, total * 0.055);
      const n = Math.max(1, Math.floor(total * Math.min(1, clipT / Math.max(0.1, dur))));
      txt = ct.txt.slice(0, n) + (clipT < dur && (Math.floor(absT * 3) % 2 === 0) ? "|" : "");
      break;
    }
    case "glow": shadowPulse = 0.5 + 0.5 * Math.sin(absT * 3); break;
  }
  const tail = clipDur - clipT;
  if (tail < 0.35) alpha *= Math.max(0, tail / 0.35);
  alpha *= fadeMul;
  if (alpha <= 0.01) return;

  ctx.save();
  fs = fs * scale;
  ctx.font = `${ct.italic ? "italic " : ""}${ct.bold ? "900" : "500"} ${fs.toFixed(1)}px ${stack}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const maxW = W * 0.88;
  const words = txt.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    const t2 = cur ? cur + " " + w : w;
    if (ctx.measureText(t2).width > maxW && cur) { rows.push(cur); cur = w; } else cur = t2;
  }
  if (cur || !rows.length) rows.push(cur);
  const lh = fs * 1.28;
  const cy = ct.y * H + dy;
  const blockH = rows.length * lh;
  let xAnchor = W / 2;
  if (ct.align === "left") xAnchor = W * 0.07;
  else if (ct.align === "right") xAnchor = W * 0.93;
  if (typeof ct.x === "number" && isFinite(ct.x)) xAnchor = ct.x * W; // posisi bebas hasil drag
  ctx.textAlign = ct.align;

  if (ct.bg) {
    let bw = 0;
    for (const r of rows) bw = Math.max(bw, ctx.measureText(r).width);
    bw = Math.min(bw, maxW);
    const padX = fs * 0.45, padY = fs * 0.28;
    let bxp = xAnchor - bw / 2 - padX;
    if (ct.align === "left") bxp = xAnchor - padX;
    else if (ct.align === "right") bxp = xAnchor - bw - padX;
    ctx.save();
    ctx.globalAlpha = 0.55 * alpha;
    ctx.fillStyle = ct.bgColor || "#000";
    const rr = fs * 0.35;
    const rx = bxp, ry = cy - blockH / 2 - padY, rw = bw + padX * 2, rh = blockH + padY * 2;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(rx, ry, rw, rh, rr);
    else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    ctx.restore();
  }
  if (ct.shadow) { ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = fs * (0.18 + shadowPulse * 0.35); }
  if (ct.anim === "glow") { ctx.shadowColor = ct.color; ctx.shadowBlur = fs * (0.3 + shadowPulse * 0.6); }
  ctx.globalAlpha = alpha;
  if (ct.karaokeWords && ct.karaokeWords.length) {
    // mode KARAOKE: tiap kata menyala saat timing-nya (keterangan otomatis)
    const kws = ct.karaokeWords;
    const widths = kws.map(k => ctx.measureText(k.w).width);
    const gap = fs * 0.28;
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (kws.length - 1);
    let kx = ct.align === "left" ? xAnchor : ct.align === "right" ? xAnchor - totalW : xAnchor - totalW / 2;
    ctx.textAlign = "left";
    const ky = cy;
    kws.forEach((k, i) => {
      const isAct = clipT >= k.start - 0.05 && clipT < k.end + 0.12;
      if (ct.stroke && ct.strokeW > 0) {
        ctx.lineWidth = ct.strokeW; ctx.strokeStyle = ct.strokeColor;
        ctx.strokeText(k.w, kx, ky);
      }
      if (ct.shadow || isAct) { ctx.shadowColor = isAct ? (ct.karaokeColor || "#ffd93d") : "rgba(0,0,0,0.85)"; ctx.shadowBlur = isAct ? fs * 0.45 : fs * 0.15; }
      ctx.fillStyle = isAct ? (ct.karaokeColor || "#ffd93d") : ct.color;
      ctx.fillText(k.w, kx, ky);
      ctx.shadowBlur = 0;
      kx += widths[i] + gap;
    });
    ctx.restore();
    return;
  }
  rows.forEach((row, ri) => {
    const y = cy - blockH / 2 + lh / 2 + ri * lh;
    if (ct.stroke && ct.strokeW > 0) {
      ctx.lineWidth = ct.strokeW;
      ctx.strokeStyle = ct.strokeColor;
      ctx.strokeText(row, xAnchor, y);
    }
    ctx.fillStyle = ct.color;
    ctx.fillText(row, xAnchor, y);
  });
  ctx.restore();
}

/* Efek overlay dipakai juga oleh Spectrum Studio */
export const paintEffect = paintEffectOverlay;

/* ---------------------- GRAIN (global) ---------------------- */
export function paintGrain(ctx: CanvasRenderingContext2D, W: number, H: number, amt: number, absT: number, isMobile: boolean) {
  if (amt <= 0) return;
  const n = Math.round((isMobile ? 220 : 480) * (amt / 100));
  ctx.save();
  const seed = Math.floor(absT * 18);
  for (let i = 0; i < n; i++) {
    const v = rnd(i, seed);
    ctx.globalAlpha = 0.05 + rnd(i, seed + 1) * 0.1;
    ctx.fillStyle = v > 0.5 ? "#fff" : "#000";
    ctx.fillRect(rnd(i, seed + 2) * W, rnd(i, seed + 3) * H, Math.max(1, W / 400), Math.max(1, W / 400));
  }
  ctx.restore();
}

/* ========================= PAINT UTAMA ========================= */
export interface PaintInput {
  clipT: number; clipDur: number;
  inTrans: boolean; transT: number; transId: string;
  optCur: SlideOpt | null; optNxt?: SlideOpt | null;
  globalFilter: string;      // "none" bila kosong
  absT: number; isMobile: boolean; beat: boolean;
  grain: number;             // 0..100
  kbZoom?: number;           // ken burns zoom dasar (mis. 1+slideT*0.04)
}
export function paintClips(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  cur: CanvasImageSource | null, nxt: CanvasImageSource | null,
  p: PaintInput,
) {
  const opt = p.optCur || {};
  const clipFilter = buildClipFilter(opt.filter || "", null);
  const filter = joinFilters(clipFilter, p.globalFilter);
  const animDur = Math.max(0.15, opt.animDur ?? 0.6);

  // params klip aktif
  const curP = baseP(filter);
  // transform manual per-klip (cubit/geser gambar di preview ala CapCut — dikunci ke klip)
  curP.dx += opt.tx ?? 0;
  curP.dy += opt.ty ?? 0;
  curP.zoom = (p.kbZoom ?? 1) * Math.max(0.1, opt.tz && opt.tz > 0 ? opt.tz : 1);
  if (opt.effect === "pulse") curP.zoom *= 1 + 0.028 * Math.sin(p.absT * 6.2) + (p.beat ? 0.02 : 0);
  if (opt.effect === "shake") {
    const seed = Math.floor(p.absT * 24);
    curP.dx += (rnd(seed, 21) - 0.5) * 0.014;
    curP.dy += (rnd(seed, 22) - 0.5) * 0.014;
  }
  // animasi masuk
  if (opt.animIn && p.clipT < animDur) applyAnim(curP, opt.animIn, p.clipT / animDur, true);
  // animasi keluar (hanya bila tidak ada transisi)
  if (opt.animOut && !p.inTrans && p.clipDur - p.clipT < animDur) applyAnim(curP, opt.animOut, (p.clipDur - p.clipT) / animDur, false);
  // animasi LOOP ("Kombinasi efek")
  if (opt.loop && opt.loop !== "none") {
    const lt = p.absT;
    switch (opt.loop) {
      case "denyut":   curP.zoom *= 1 + 0.02 * Math.sin(lt * 5.4); break;
      case "goyang":   curP.rot += Math.sin(lt * 2.1) * 0.9; break;
      case "zoompelan":curP.zoom *= 1.02 + 0.05 * (0.5 + 0.5 * Math.sin(lt * 0.5)); break;
      case "melayang": curP.dy += Math.sin(lt * 1.6) * 0.012; break;
      case "berkedip": curP.alpha *= 0.82 + 0.18 * Math.sin(lt * 7); break;
      case "ayun":     curP.rot += Math.sin(lt * 1.3) * 1.6; curP.dx += Math.sin(lt * 2.6) * 0.006; break;
    }
  }

  const nxtP = baseP(joinFilters(buildClipFilter(p.optNxt?.filter || "", null), p.globalFilter));
  // klip berikutnya juga bawa transform manualnya sendiri
  nxtP.dx += (p.optNxt?.tx ?? 0);
  nxtP.dy += (p.optNxt?.ty ?? 0);
  nxtP.zoom = Math.max(0.1, (p.optNxt?.tz && p.optNxt.tz > 0) ? p.optNxt.tz : 1);

  // gambar klip (+transisi)
  if (p.inTrans && nxt && p.transId !== "none") {
    paintTransition(ctx, W, H, cur, nxt, p.transId, p.transT, curP, nxtP, p.isMobile, p.absT);
  } else if (p.inTrans && nxt && p.transId === "none") {
    drawBase(ctx, nxt, W, H, nxtP);
  } else if (opt.effect === "cermin" && cur) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W / 2, H); ctx.clip();
    ctx.translate(W, 0); ctx.scale(-1, 1);
    drawBase(ctx, cur, W, H, curP);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(W / 2, 0, W / 2, H); ctx.clip();
    drawBase(ctx, cur, W, H, curP);
    ctx.restore();
  } else {
    drawBase(ctx, cur, W, H, curP);
  }

  // overlay efek (klip aktif)
  const eff = opt.effect || "";
  if (eff && eff !== "pulse" && eff !== "shake" && eff !== "cermin") {
    if (eff === "rgb" && cur) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const off = (p.isMobile ? 2 : 4) * (0.6 + 0.4 * Math.sin(p.absT * 9));
      drawBase(ctx, cur, W, H, { ...curP, dx: curP.dx + off / W, alpha: 0.3 });
      drawBase(ctx, cur, W, H, { ...curP, dx: curP.dx - off / W, alpha: 0.3 });
      ctx.restore();
    } else paintEffectOverlay(ctx, W, H, eff, p.absT, p.isMobile);
  }

  // stiker + teks (memudar saat transisi keluar) — v6: stiker animasi/gambar
  const fadeMul = p.inTrans ? 1 - p.transT : 1;
  paintStickersV6(ctx, W, H, opt.stickers, fadeMul, p.absT);
  // teks ber-start/dur sendiri (lepas) digambar di pass paintFloatingTexts
  if (opt.text && opt.text.start == null) paintClipText(ctx, W, H, opt.text, p.clipT, p.clipDur, p.absT, fadeMul);

  // grain global
  paintGrain(ctx, W, H, p.grain, p.absT, p.isMobile);
}

/* -------- TEKS LEPAS WAKTU (bisa digeser ke detik mana pun di track) --------
   Dipanggil sekali per frame SETELAH paintClips, dengan daftar opts semua klip. */
export function paintFloatingTexts(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  optsList: (SlideOpt | null | undefined)[], t: number,
) {
  for (const o of optsList) {
    const ct = o?.text;
    if (!ct || !ct.txt || !ct.txt.trim() || ct.start == null) continue;
    const dur = ct.dur && ct.dur > 0 ? ct.dur : 3;
    if (t < ct.start || t >= ct.start + dur) continue;
    paintClipText(ctx, W, H, ct, t - ct.start, dur, t, 1);
  }
}

/* =====================================================================
   v6 EXTENSIONS — layout & fitur baru (100% orisinal)
   - Font Google (gratis, lisensi OFL) untuk teks
   - Animasi LOOP (tab "Kombinasi efek")
   - Stiker ANIMASI (digambar per-frame) + stiker GAMBAR (overlay foto)
   - Painter caption karaoke/bersih untuk preview & Spectrum Studio
   - Mode latar belakang (cover / blur / warna) untuk drawBase
   ===================================================================== */

/* ---------- GOOGLE FONTS (OFL, bebas dipakai) ---------- */
export const GOOGLE_FONT_LINK = "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Lobster&family=Lora:ital,wght@0,700;1,600&family=Merriweather:wght@900&family=Montserrat:ital,wght@0,800;0,900;1,700&family=Oswald:wght@600;700&family=Pacifico&family=Playfair+Display:ital,wght@0,800;1,700&family=Poppins:ital,wght@0,700;0,900;1,700&family=Quicksand:wght@700&family=Righteous&family=Rubik:ital,wght@0,800;1,700&display=swap";

TEXT_FONTS.push(
  { id: "poppins",   label: "Poppins",   stack: "'Poppins',system-ui,sans-serif" },
  { id: "montserrat",label: "Montserrat",stack: "'Montserrat',system-ui,sans-serif" },
  { id: "bebas",     label: "Bebas",     stack: "'Bebas Neue',Impact,sans-serif" },
  { id: "anton",     label: "Anton",     stack: "'Anton',Impact,sans-serif" },
  { id: "oswald",    label: "Oswald",    stack: "'Oswald',system-ui,sans-serif" },
  { id: "playfair",  label: "Playfair",  stack: "'Playfair Display',Georgia,serif" },
  { id: "lora",      label: "Lora",      stack: "'Lora',Georgia,serif" },
  { id: "dancing",   label: "Dancing",   stack: "'Dancing Script',cursive" },
  { id: "pacifico",  label: "Pacifico",  stack: "'Pacifico',cursive" },
  { id: "caveat",    label: "Caveat",    stack: "'Caveat',cursive" },
  { id: "lobster",   label: "Lobster",   stack: "'Lobster',cursive" },
  { id: "righteous", label: "Righteous", stack: "'Righteous',system-ui,sans-serif" },
  { id: "bangers",   label: "Bangers",   stack: "'Bangers',Impact,sans-serif" },
  { id: "archivo",   label: "Archivo",   stack: "'Archivo Black',Impact,sans-serif" },
  { id: "rubik",     label: "Rubik",     stack: "'Rubik',system-ui,sans-serif" },
  { id: "quicksand", label: "Quicksand", stack: "'Quicksand',system-ui,sans-serif" },
  { id: "merri",     label: "Merri",     stack: "'Merriweather',Georgia,serif" },
);

const _fontLoadOnce = new Set<string>();
export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !(document as any).fonts) return;
  const fams = ["Poppins","Montserrat","Bebas Neue","Anton","Oswald","Playfair Display","Lora","Dancing Script","Pacifico","Caveat","Lobster","Righteous","Bangers","Archivo Black","Rubik","Quicksand","Merriweather"];
  await Promise.all(fams.map(async f => {
    if (_fontLoadOnce.has(f)) return;
    try { await (document as any).fonts.load(`900 40px "${f}"`); await (document as any).fonts.load(`italic 700 40px "${f}"`); _fontLoadOnce.add(f); } catch {}
  }));
}
export function fontStackById(id: string | undefined): string {
  return TEXT_FONTS.find(f => f.id === id)?.stack || TEXT_FONTS[0].stack;
}

/* ---------- ANIMASI LOOP (tab "Kombinasi") ---------- */
export const ANIM_LOOP: CatItem[] = [
  { id: "none",    label: "Tanpa",      emoji: "🚫" },
  { id: "denyut",  label: "Denyut",     emoji: "💓" },
  { id: "goyang",  label: "Goyang",     emoji: "🍃" },
  { id: "zoompelan",label:"Zoom Pelan", emoji: "🔍" },
  { id: "melayang",label: "Melayang",   emoji: "🎈" },
  { id: "berkedip",label: "Berkedip",   emoji: "⚡" },
  { id: "ayun",    label: "Ayun Miring",emoji: "🕺" },
];

/* ---------- TEMPLATE KETERANGAN OTOMATIS (CC) ---------- */
export interface CCTemplate { id: string; label: string; desc: string; capStyle: string; sample: string; color: string; }
export const CC_TEMPLATES: CCTemplate[] = [
  { id: "standar",  label: "Default",        desc: "Putih tebal, highlight kuning", capStyle: "capcut",    sample: "Rubah coklat yang cepat", color: "#ffffff" },
  { id: "karaoke",  label: "Karaoke Glow",   desc: "Kata aktif menyala kuning",     capStyle: "karaoke",   sample: "Ikut kata demi kata",     color: "#fde047" },
  { id: "tebal",    label: "Tebal Bersih",   desc: "Putih tebal tanpa warna",       capStyle: "boldwhite", sample: "The quick brown fox",   color: "#ffffff" },
  { id: "neon",     label: "Neon",           desc: "Glow pink lembut",              capStyle: "neon",      sample: "Cahaya malam",          color: "#ec4899" },
  { id: "pop",      label: "Pop",            desc: "Kuning ceria kotak",            capStyle: "pop",       sample: "Asik & ramai",           color: "#fde047" },
  { id: "gradien",  label: "Gradien",        desc: "Warna gradasi halus",           capStyle: "gradient",  sample: "Warna-warni",            color: "#22d3ee" },
];

/* ---------- STIKER GAMBAR (overlay foto) ---------- */
const STICKER_IMG_CACHE = new Map<string, HTMLImageElement | "loading" | "err">();
export function ensureStickerImage(url: string): HTMLImageElement | null {
  if (!url) return null;
  const cur = STICKER_IMG_CACHE.get(url);
  if (cur && cur !== "loading" && cur !== "err") return cur as HTMLImageElement;
  if (cur === "loading" || cur === "err") return null;
  STICKER_IMG_CACHE.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => STICKER_IMG_CACHE.set(url, img);
  img.onerror = () => STICKER_IMG_CACHE.set(url, "err");
  img.src = url;
  return null;
}
export async function preloadStickerImages(urls: string[]): Promise<void> {
  await Promise.all(urls.map(u => new Promise<void>(res => {
    const cur = STICKER_IMG_CACHE.get(u);
    if (cur === "err" || (cur && cur !== "loading")) return res();
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { STICKER_IMG_CACHE.set(u, img); res(); };
    img.onerror = () => { STICKER_IMG_CACHE.set(u, "err"); res(); };
    img.src = u;
  })));
}

/* ---------- STIKER ANIMASI (orisinal, digambar kode) ---------- */
export interface AnimStickerDef { id: string; label: string; cat: string; draw: (ctx: CanvasRenderingContext2D, s: number, t: number) => void; }
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
export const ANIM_STICKERS: AnimStickerDef[] = [
  { id:"@ikuti", label:"IKUTI + Klik", cat:"sosmed", draw(ctx, s, t) {
      const tap = (t % 1.6) < 0.25 ? 0.93 : 1;
      ctx.save(); ctx.scale(tap, tap);
      const w = s * 2.1, h = s * 0.86, x = -w / 2, y = -h / 2;
      ctx.fillStyle = "#e8290b"; roundRectPath(ctx, x, y, w, h, h * 0.24); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `900 ${h * 0.5}px system-ui,sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("IKUTI", s * 0.06, 0);
      ctx.fillRect(x + w * 0.12, -h * 0.3, h * 0.12, h * 0.6); // ikon garis
      ctx.restore();
      // kursor panah
      const cy = Math.sin(t * 9) * s * 0.03;
      ctx.save(); ctx.translate(s * 0.85 + cy, s * 0.55 + cy); ctx.rotate(-0.5);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = s * 0.045;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.16, s * 0.55); ctx.lineTo(s * 0.26, s * 0.36); ctx.lineTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.22, s * 0.02); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    } },
  { id:"@like", label:"Jempol Pop", cat:"sosmed", draw(ctx, s, t) {
      const ph = t % 1.8; const sc = ph < 0.3 ? 0.6 + 0.4 * (ph / 0.3) + Math.sin(ph / 0.3 * Math.PI) * 0.18 : 1;
      ctx.save(); ctx.scale(sc, sc); ctx.rotate(Math.sin(t * 2.2) * 0.06);
      ctx.font = `${s * 2}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("👍", 0, 0); ctx.restore();
    } },
  { id:"@lonceng", label:"Lonceng Goyang", cat:"sosmed", draw(ctx, s, t) {
      ctx.save(); ctx.rotate(Math.sin(t * 7) * 0.22);
      ctx.font = `${s * 2}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🔔", 0, 0); ctx.restore();
    } },
  { id:"@rec", label:"REC Kedip", cat:"sosmed", draw(ctx, s, t) {
      const on = (t % 1.2) < 0.75;
      const w = s * 1.9, h = s * 0.8;
      ctx.fillStyle = "rgba(20,20,22,0.82)"; roundRectPath(ctx, -w / 2, -h / 2, w, h, h * 0.22); ctx.fill();
      ctx.globalAlpha = on ? 1 : 0.15;
      ctx.fillStyle = "#ff2d2d"; ctx.beginPath(); ctx.arc(-w * 0.3, 0, h * 0.26, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff"; ctx.font = `900 ${h * 0.5}px system-ui,sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("REC", w * 0.12, 0);
    } },
  { id:"@wave", label:"Gelombang Audio", cat:"musik", draw(ctx, s, t) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const h = s * (0.35 + Math.abs(Math.sin(t * 5 + i * 1.1)) * 1.15);
        const x = (i - (n - 1) / 2) * s * 0.42;
        const g = ctx.createLinearGradient(x, -h / 2, x, h / 2);
        g.addColorStop(0, "#22d3ee"); g.addColorStop(1, "#a855f7");
        ctx.fillStyle = g; roundRectPath(ctx, x - s * 0.13, -h / 2, s * 0.26, h, s * 0.13); ctx.fill();
      }
    } },
  { id:"@eq", label:"Equalizer", cat:"musik", draw(ctx, s, t) {
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        for (let r = 0; r < 6; r++) {
          const lit = r / 6 < Math.abs(Math.sin(t * 4.4 + i * 1.3)) ? 1 : 0.18;
          ctx.globalAlpha = lit;
          ctx.fillStyle = r > 3 ? "#fde047" : "#22d3ee";
          const sz = s * 0.26;
          roundRectPath(ctx, (i - (cols - 1) / 2) * s * 0.42 - sz / 2, (2 - r) * s * 0.3 - sz / 2, sz, sz * 0.72, sz * 0.2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } },
  { id:"@butterfly", label:"Kupu Terbang", cat:"suasana", draw(ctx, s, t) {
      ctx.save();
      ctx.translate(Math.sin(t * 1.7) * s * 0.35, Math.cos(t * 2.3) * s * 0.22);
      ctx.rotate(Math.sin(t * 1.7) * 0.2);
      ctx.scale(0.75 + Math.abs(Math.sin(t * 9)) * 0.3, 1);
      ctx.font = `${s * 1.9}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🦋", 0, 0); ctx.restore();
      // kilau kecil
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.fillStyle = "#fff";
      ctx.fillRect(s * 0.6, -s * 0.5, s * 0.06, s * 0.06);
      ctx.globalAlpha = 1;
    } },
  { id:"@confetti", label:"Confetti", cat:"suasana", draw(ctx, s, t) {
      const colors = ["#f43f5e","#fde047","#22d3ee","#a855f7","#22c55e"];
      for (let i = 0; i < 14; i++) {
        const ph = (t * (0.5 + rnd(i, 3) * 0.7) + rnd(i, 1)) % 1;
        const x = (rnd(i, 2) - 0.5) * s * 2.2;
        const y = -s + ph * s * 2.2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (2 + rnd(i, 4) * 4) + i);
        ctx.fillStyle = colors[i % colors.length]; ctx.globalAlpha = 1 - ph * 0.4;
        ctx.fillRect(-s * 0.07, -s * 0.045, s * 0.14, s * 0.09); ctx.restore();
      }
      ctx.globalAlpha = 1;
    } },
  { id:"@kaset", label:"Kaset Muter", cat:"musik", draw(ctx, s, t) {
      const w = s * 2.2, h = s * 1.4;
      ctx.fillStyle = "#d8c39a"; roundRectPath(ctx, -w / 2, -h / 2, w, h, s * 0.12); ctx.fill();
      ctx.fillStyle = "#8a6f3f"; roundRectPath(ctx, -w * 0.38, -h * 0.36, w * 0.76, h * 0.5, s * 0.08); ctx.fill();
      for (const cx of [-w * 0.2, w * 0.2]) {
        ctx.save(); ctx.translate(cx, -h * 0.11); ctx.rotate(t * 3);
        ctx.fillStyle = "#f5ead0"; ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, TAU); ctx.fill();
        ctx.fillStyle = "#4a3a1e";
        for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.fillRect(-s * 0.03, -s * 0.24, s * 0.06, s * 0.14); }
        ctx.beginPath(); ctx.arc(0, 0, s * 0.06, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#4a3a1e"; ctx.font = `900 ${s * 0.22}px system-ui,sans-serif`; ctx.textAlign = "center";
      ctx.fillText("♪ MIXTAPE", 0, h * 0.33);
    } },
  { id:"@panah", label:"Panah Mantul", cat:"sosmed", draw(ctx, s, t) {
      ctx.save(); ctx.translate(0, Math.abs(Math.sin(t * 4)) * -s * 0.3);
      ctx.font = `${s * 2}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("⬇️", 0, 0); ctx.restore();
    } },
  { id:"@love", label:"Love Berdebar", cat:"suasana", draw(ctx, s, t) {
      const beat = 1 + Math.max(0, Math.sin(t * 6)) * 0.18 + (Math.sin(t * 6) > 0.85 ? 0.12 : 0);
      ctx.save(); ctx.scale(beat, beat);
      ctx.font = `${s * 1.9}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("❤️", 0, 0); ctx.restore();
    } },
  { id:"@kilau", label:"Kilau Kedip", cat:"suasana", draw(ctx, s, t) {
      const n = 4;
      ctx.strokeStyle = "#fff7c9"; ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const tw = Math.sin(t * 3.2 + i * 1.9); if (tw <= 0.05) continue;
        const x = Math.cos(i * 1.9) * s * 0.5, y = Math.sin(i * 2.4) * s * 0.5;
        const r = s * (0.25 + 0.35 * tw);
        ctx.globalAlpha = 0.9 * tw; ctx.lineWidth = s * 0.05;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r * 1.5); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } },
  { id:"@nada", label:"Nada Melayang", cat:"musik", draw(ctx, s, t) {
      const notes = ["🎵","🎶","🎼"];
      notes.forEach((n, i) => {
        const ph = (t * (0.4 + i * 0.15) + i * 0.33) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI);
        ctx.font = `${s * (1 + i * 0.3)}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(n, (i - 1) * s * 0.7 + Math.sin(ph * 6) * s * 0.2, s * 0.6 - ph * s * 1.6);
      });
      ctx.globalAlpha = 1;
    } },
  { id:"@api", label:"Api Berkobar", cat:"suasana", draw(ctx, s, t) {
      ctx.save(); ctx.scale(1 + Math.sin(t * 11) * 0.06, 1 + Math.sin(t * 13) * 0.1);
      ctx.font = `${s * 2}px 'Segoe UI Emoji','Noto Color Emoji',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🔥", 0, 0); ctx.restore();
    } },
  { id:"@subs", label:"LANGGANAN", cat:"sosmed", draw(ctx, s, t) {
      const w = s * 2.3, h = s * 0.62;
      ctx.fillStyle = "rgba(10,10,12,0.75)"; roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = s * 0.03; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `800 ${h * 0.5}px system-ui,sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const sc = 1 + Math.sin(t * 3) * 0.03;
      ctx.save(); ctx.scale(sc, sc); ctx.fillText("👍 LANGGANAN 🔔", 0, -h * 0.02); ctx.restore();
    } },
];
export const ANIM_STICKER_MAP: Record<string, AnimStickerDef> = Object.fromEntries(ANIM_STICKERS.map(a => [a.id, a]));
export const STICKER_ANIM_CATS: { id: string; label: string }[] = [
  { id: "sosmed", label: "🔥 Sosmed" }, { id: "musik", label: "🎵 Musik" }, { id: "suasana", label: "✨ Suasana" },
];

/* ---------- PAINTER STIKER v6 (anim + gambar + emoji) ---------- */
export function paintStickersV6(ctx: CanvasRenderingContext2D, W: number, H: number, stickers: StickerItem[] | undefined, alpha: number, absT: number) {
  if (!stickers || !stickers.length) return;
  ctx.save();
  for (const st of stickers as any[]) {
    const px = Math.max(10, st.size * H);
    ctx.save();
    ctx.globalAlpha = alpha * (st.opacity ?? 1);
    ctx.translate(st.x * W, st.y * H);
    if (st.rot) ctx.rotate(st.rot * Math.PI / 180);
    if (st.img) {
      const img = ensureStickerImage(st.img);
      if (img) {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const w = px * 2, h = px * 2 * (ih / iw);
        ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = px * 0.12;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    } else if (typeof st.emoji === "string" && st.emoji.startsWith("@")) {
      const def = ANIM_STICKER_MAP[st.emoji];
      if (def) def.draw(ctx, Math.max(8, px * 0.8), absT);
    } else {
      ctx.font = `${px}px 'Segoe UI Emoji','Noto Color Emoji',system-ui,sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = px * 0.08;
      ctx.fillText(st.emoji, 0, 0);
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- CAPTION PAINTER (preview & Spectrum Studio) ---------- */
export interface CapWord { text: string; start: number; end: number; line: number; }
export function paintPreviewCaptions(ctx: CanvasRenderingContext2D, W: number, H: number, words: CapWord[], t: number, capStyle: string, opts?: { yRatio?: number; sizeRatio?: number }) {
  if (!words || !words.length) return;
  const active = words.filter(w => t >= w.start - 0.05 && t <= w.end + 0.25);
  if (!active.length) return;
  const lineNo = active[0].line;
  const lineWords = words.filter(w => w.line === lineNo);
  const exact = words.find(w => t >= w.start && t < w.end && w.line === lineNo);
  const y = (opts?.yRatio ?? 0.78) * H;
  const fs = Math.max(12, (opts?.sizeRatio ?? 0.055) * H);
  const gap = fs * 0.25;
  ctx.save();
  ctx.font = `900 ${fs}px 'Poppins',system-ui,sans-serif`;
  ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const widths = lineWords.map(w => ctx.measureText(w.text).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (lineWords.length - 1);
  let x = (W - totalW) / 2; ctx.textAlign = "left";
  lineWords.forEach((w, i) => {
    const isActive = exact === w || (!exact && w === active[active.length - 1]);
    let fill = "#ffffff", strokeC = "rgba(0,0,0,0.85)", glow = "";
    if (capStyle === "karaoke" || capStyle === "capcut") fill = isActive ? "#ffd93d" : "#ffffff";
    else if (capStyle === "neon") { fill = isActive ? "#ffffff" : "#f9a8d4"; glow = "#ec4899"; }
    else if (capStyle === "pop") { fill = isActive ? "#000000" : "#ffffff"; }
    else if (capStyle === "gradient") fill = isActive ? "#22d3ee" : "#e2e8f0";
    else if (capStyle === "boldwhite") fill = "#ffffff";
    if (capStyle === "pop" && isActive) {
      ctx.fillStyle = "#fde047";
      roundRectPath(ctx, x - fs * 0.12, y - fs * 0.75, widths[i] + fs * 0.24, fs * 1.3, fs * 0.18); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = fs * 0.06;
      ctx.strokeText(w.text, x, y);
    } else {
      ctx.strokeStyle = strokeC; ctx.lineWidth = fs * 0.14; ctx.strokeText(w.text, x, y);
    }
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = fs * (isActive ? 0.6 : 0.3); }
    ctx.fillStyle = fill; ctx.fillText(w.text, x, y);
    ctx.shadowBlur = 0;
    x += widths[i] + gap;
  });
  ctx.restore();
}
