"use client";
/**
 * Fast offline renderer — WebCodecs + mp4-muxer.
 * Target: 10x realtime (video 10 menit selesai ~1 menit).
 *
 * Optimasi v3:
 *  - Pre-compute spectrum SEMUA frame di awal (lookup table), bukan hitung per-frame
 *  - Pre-compute beat positions
 *  - Reuse object, typed arrays, kurangi alokasi GC
 *  - Batch encode frames (lebih sedikit yield ke UI)
 *  - OffscreenCanvas untuk persiapan gambar (kalau support)
 *  - Desync 2d context untuk throughput lebih tinggi
 *  - Caption CapCut-style: kata demi kata highlight sesuai posisi audio
 */
import type { VizStyle } from "./types";
import { avGet, avPut, avDel } from "./avault";
import {
  buildTimeline, locate, paintClips, captionsFromClips, canonicalTrans,
  setDrawBg, getDrawBg, preloadStickerImages, paintFloatingTexts, paintFloatingStickers,
} from "./editing";
import type { SlideOpt, Timeline } from "./editing";

export type Quality = "fast" | "balanced" | "high" | "max";
export type Transition = "zoom" | "fade" | "slide" | "blur" | "glitch" | "none";
export type CaptionStyle = "capcut" | "pop" | "neon" | "karaoke" | "boldwhite" | "gradient" | "none";

export interface RenderOptions {
  images: string[];
  audioUrl?: string;
  slideDuration: number;
  transitionDuration?: number;
  vizStyle: VizStyle;
  vizColor: string;
  title?: string;
  lyrics?: string[];          // array baris lirik per slide (legacy)
  captions?: CaptionWord[];   // word-by-word captions (CapCut style)
  captionStyle?: CaptionStyle;
  logoUrl?: string;
  logoPosition?: "center" | "corner" | "none";
  quality: Quality;
  mobileOptimized?: boolean;
  ratio?: "16:9" | "9:16" | "1:1";
  aspectRatio?: "16:9" | "9:16" | "1:1";
  transition?: Transition;
  showTitle?: boolean;
  showLyrics?: boolean;
  beatSync?: boolean;
  // ===== CAPCUT-STYLE COLOR / FILTER / ADJUST =====
  videoFilter?: string;       // CSS canvas filter string (dari preset + brightness/contrast/saturation/sharpen)
  vignetteStrength?: number;  // 0..1 (default 0.75)
  videoSpeed?: number;        // 0.5..2 (default 1) - affects visuals only
  spectrumSticker?: string;   // "bars-bottom"|"wave-center"|"disc"|"none" — small overlay visualizer
  cinebars?: boolean;          // 🎬 v13.5 LETTERBOX BIOSKOP — garis hitam 2.39:1
  // ===== CAPCUT TEXT LAYERS =====
  textLayers?: TextLayer[];   // array custom text layers (multi-teks)
  // ===== v5: PER-KLIP EDITING (transisi/durasi/animasi/efek/stiker/teks per slide) =====
  slideOpts?: SlideOpt[];     // sejajar dgn images[]; bila ada → timeline per-klip
  grainAmt?: number;          // 0..100 overlay grain film
  videos?: (string | null)[]; // 🎬 v11.8: klip video AI per-slide (sejajar images[]; null/kosong = gambar biasa persis seperti dulu)
  // ===== v6: pengaturan ekspor kustom + latar + peningkat ketajaman =====
  custom?: { w: number; h: number; fps: number; videoBitrate: number };
  bgMode?: "cover" | "blur" | "color";
  bgColor?: string;
  sharpen?: boolean;          // "Peningkat Ketajaman" (SVG convolve filter)
  onProgress?: (p: number) => void;
  onStage?: (s: string) => void;
}

// ===== CapCut-style Text Layer =====
export interface TextLayer {
  id: string;
  text: string;
  // Position 0..1 (relatif ke canvas)
  x: number; // 0=kiri, 0.5=tengah, 1=kanan
  y: number; // 0=atas, 1=bawah
  // Anchor (0.5,0.5)=center
  anchorX?: number;
  anchorY?: number;
  rotation?: number; // derajat
  sizePct?: number;  // 0.02..0.2 (ukuran font relatif thd W)
  opacity?: number;  // 0..1
  color?: string;            // "#ffffff"
  strokeColor?: string;      // outline
  strokeWidth?: number;      // relatif ke font size (0..0.3)
  shadowColor?: string;
  shadowBlur?: number;
  bold?: boolean;
  italic?: boolean;
  font?: string;             // nama font family
  align?: "left"|"center"|"right";
  // Style preset: "default" | "neon" | "boldwhite" | "fire" | "thanks" | "titlehere" | "mymusic" | "nowplaying" | "trendy" | "horror" | "aura" | "like" | ...
  template?: string;
  // Text effect preset (CapCut-style: art-paper, art-stroke-white, art-stroke-black, art-blood, art-yellow-black, art-white-red, art-gold-black, art-neon-pink, art-neon-red, art-scratch-red, art-gradient-kuning-orange-biru, art-3d, art-chrome, art-glitter, art-sparkle)
  effect?: string;
  // Animation: "none" | "fadein" | "pop" | "typewriter" | "slideup" | "slideleft" | "glowpulse"
  animIn?: string;
  animOut?: string;
  animLoop?: string;
  // Timing (detik relatif ke video total)
  start: number;
  end: number;
}

export interface CaptionWord {
  text: string;
  start: number; // detik
  end: number;   // detik
  line?: number;
}

const QUALITY_PROFILES: Record<Quality, {
  w: number; h: number; fps: number; videoBitrate: number;
  bars: number; particles: number; reflections: boolean; glow: number;
  batchSize: number;
}> = {
  fast:     { w: 854,  h: 480,  fps: 24, videoBitrate: 1_500_000, bars: 48, particles: 20, reflections: true,  glow: 12, batchSize: 8 },
  balanced: { w: 1280, h: 720,  fps: 30, videoBitrate: 3_500_000, bars: 64, particles: 35, reflections: true,  glow: 18, batchSize: 6 },
  high:     { w: 1920, h: 1080, fps: 30, videoBitrate: 6_000_000, bars: 80, particles: 50, reflections: true,  glow: 25, batchSize: 4 },
  max:      { w: 1920, h: 1080, fps: 60, videoBitrate: 9_000_000, bars: 96, particles: 70, reflections: true,  glow: 30, batchSize: 3 },
};

function applyRatio(profile: {w:number;h:number}, ratio?: string) {
  let { w, h } = profile;
  if (ratio === "9:16" || ratio === "1024x1792") return { w: h, h: w };
  if (ratio === "1:1") { const s = Math.min(w,h); return { w: s, h: s }; }
  return { w, h };
}

function hexToRgb(hex: string): [number,number,number] {
  const m = hex.replace("#","");
  const v = m.length===3 ? m.split("").map(c=>c+c).join("") : m;
  return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
}
function rgba([r,g,b]:[number,number,number], a=1){ return `rgba(${r|0},${g|0},${b|0},${a})`; }
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v));}
function easeInOut(t:number){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}

// 🩹 v12.9 SELAMATKAN AUDIO — kaskade jalur: proxy→langsung / langsung→proxy + pesan jujur.
async function decodeAudio(url: string, onStage?:(s:string)=>void) {
  const cands: string[] = [url];
  const m = url.match(/^\/?api\/hcnsec\/proxy-audio\?url=(.+)$/);
  if (m) { try { cands.push(decodeURIComponent(m[1])); } catch {} } // cadangan: langsung ke sumber
  if (/^https?:/.test(url) && !/proxy-audio/.test(url)) cands.push(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`); // cadangan: lewat proxy
  // 🛟 v13.7.1: kumpulkan penyebab TIAP jalur (bukan cuma yang terakhir) → pesan akhir jujur & bisa ditindak
  const why: string[] = [];
  for (const u of cands) {
    try { return await decodeAudioOnce(u, onStage); }
    catch (e: any) { why.push(`${/proxy-audio/.test(u) ? "gerbang" : "langsung"}: ${String(e?.message || e).replace(/\s+/g, " ").slice(0, 70)}`); }
  }
  // 🛟 BRANKAS LAGU — jaringan menyerah total? minum dari salinan lokal (link AI umurnya hitungan jam!)
  try {
    for (const u of cands) {
      const hit = await avGet(u);
      if (hit && hit.byteLength > 50_000) {
        try {
          onStage?.("🛟 Menyelamatkan audio dari BRANKAS LAGU…");
          return await decodeBuf(hit.slice(0));
        } catch { await avDel(u); why.push("brankas: salinan korup, dibuang"); }
      }
    }
  } catch {}
  const joined = why.join(" · ").slice(0, 240);
  if (/Failed to fetch|NetworkError|502|503|404|403|415|timeout|kedaluwarsa|Bukan media|tak kedecode/i.test(joined)) {
    throw new Error(`🎵 LINK LAGU SUDAH MATI di sumbernya & brankas belum sempat menyalinnya. Jalan selamat: upload MP3/WAV lagu ini dari HP-mu (bar Audio → Upload lagu) lalu render lagi — upload kebal selamanya. Atau generate ulang lagu. Detail: ${joined}`);
  }
  throw new Error(`Audio gagal dimuat. Detail: ${joined || "tak diketahui"}`);
}
async function decodeAudioOnce(url: string, onStage?:(s:string)=>void) {
  onStage?.("Decoding audio...");
  try {
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort(), 120_000);
    const r = await fetch(url, { signal: ac.signal, cache: "force-cache" });
    clearTimeout(t);
    if (!r.ok) { let hint = ""; try { hint = (await r.text()).replace(/\s+/g, " ").slice(0, 120); } catch {} throw new Error(`Gagal ambil audio (HTTP ${r.status})${hint ? " — " + hint : ""}`); }
    const buf = await r.arrayBuffer();
    const dec = await decodeBuf(buf);
    void avPut(url, buf, r.headers.get("content-type") || ""); // 🛟 v13.7.1: salin byte MENTAH yang terbukti sehat ke BRANKAS LAGU
    return dec;
  } catch(e:any) {
    if (e?.name === "AbortError") throw new Error("Ambil audio timeout. Cek koneksi lalu render ulang.");
    throw e;
  }
}
// 🛟 v13.7.1: decode+konversi dipisah — dipakai jalur jaringan MAUPUN jalur BRANKAS (rumus identik, tak diubah)
async function decodeBuf(buf: ArrayBuffer) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    const actx = new AC();
    let audioBuf: AudioBuffer;
    try {
      audioBuf = await actx.decodeAudioData(buf.slice(0));
    } catch(de:any) {
      actx.close();
      throw new Error("byte audio tak kedecode (bukan lagu — sumber balikin HTML/halaman error)");
    }
    // KONVERSI ke STEREO 44100Hz — format paling kompatibel untuk Android/iOS/YouTube.
    // v8.1: kalau sumber SUDAH 44.1k (umumnya lagu), ambil saluran langsung TANPA
    // resample+tanpa salinan mono — hemat ~180MB RAM & detik CPU di HP.
    const targetSR = 44100;
    const nCh = 2;
    const srcCh = audioBuf.numberOfChannels;
    let outL: Float32Array, outR: Float32Array, nFrames: number;
    if (Math.round(audioBuf.sampleRate) === targetSR) {
      // getChannelData mengembalikan salinan — aman dipakai setelah actx.close()
      outL = audioBuf.getChannelData(0);
      outR = srcCh > 1 ? audioBuf.getChannelData(1) : outL;
      nFrames = outL.length;
    } else {
      nFrames = Math.round(audioBuf.duration * targetSR);
      const resampleRatio = targetSR / audioBuf.sampleRate;
      outL = new Float32Array(nFrames);
      outR = new Float32Array(nFrames);
      const sL = audioBuf.getChannelData(0);
      const sR = srcCh > 1 ? audioBuf.getChannelData(1) : sL;
      for (let i=0;i<nFrames;i++){
        const srcIdx = i / resampleRatio;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(i0+1, sL.length-1);
        const f = srcIdx - i0;
        const l0 = sL[i0]||0, l1 = sL[i1]||0;
        const r0 = sR[i0]||0, r1 = sR[i1]||0;
        outL[i] = l0*(1-f) + l1*f;
        outR[i] = r0*(1-f) + r1*f;
      }
    }
    // data = kanal kiri — CUKUP untuk analisis spektrum/beat (tanpa salinan mono tambahan)
    actx.close();
    return { data: outL, sampleRate: targetSR, channels: nCh, duration: nFrames/targetSR,
      stereoL: outL, stereoR: outR };
}

function loadImage(src: string, useCors = true): Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    const img = new Image();
    if (useCors && /^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = ()=>resolve(img);
    img.onerror = ()=>reject(new Error("Gagal load gambar"));
    img.decoding = "async";
    img.src = src;
  });
}

/** Uji canvas bisa dibaca (TIDAK tainted) — canvas tainted = HASIL RENDER HITAM total. */
function canvasReadable(c: HTMLCanvasElement): boolean {
  try { c.getContext("2d")!.getImageData(0, 0, 1, 1); return true; } catch { return false; }
}

function drawCoverToCanvas(img: HTMLImageElement, W: number, H: number): HTMLCanvasElement {
  const ir = img.naturalWidth/img.naturalHeight;
  const cr = W/H;
  let sx=0, sy=0, sw=img.naturalWidth, sh=img.naturalHeight;
  if (ir > cr) { sw = img.naturalHeight*cr; sx = (img.naturalWidth-sw)/2; }
  else { sh = img.naturalWidth/cr; sy = (img.naturalHeight-sh)/2; }
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const cx = c.getContext("2d", { alpha:false, desynchronized:true })!;
  cx.fillStyle="#000"; cx.fillRect(0,0,W,H);
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "low"; // bilinear cukup — sumber AI umumnya 1024px
  cx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  return c;
}

/** Unsharp mask 3×3 — DI-BAKE SEKALI per gambar (v8.1). Menggantikan filter SVG url(#vsharp)
 *  per-frame yang BERAT dan RAPUH: di sebagian browser HP filter url() membuat gambar
 *  tidak tergambar sama sekali → VIDEO HITAM. */
function sharpenCanvas(c: HTMLCanvasElement) {
  const W = c.width, H = c.height;
  if (W * H > 2600 * 1500) return; // di atas ~3.9MP konvolusi JS terlalu berat di HP — lewati aman
  const ctx = c.getContext("2d")!;
  const src = ctx.getImageData(0, 0, W, H);
  const d = src.data;
  const dst = new Uint8ClampedArray(d.length);
  const w4 = W * 4;
  for (let y = 0; y < H; y++) {
    const yo = y * w4;
    const up = y > 0 ? -w4 : 0, dn = y < H - 1 ? w4 : 0;
    for (let x = 0; x < W; x++) {
      const i = yo + x * 4;
      const lf = x > 0 ? -4 : 0, rt = x < W - 1 ? 4 : 0;
      for (let k = 0; k < 3; k++) {
        const v = 3 * (d[i + k] || 0) - 0.5 * ((d[i + up + k] || 0) + (d[i + dn + k] || 0) + (d[i + lf + k] || 0) + (d[i + rt + k] || 0));
        dst[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      dst[i + 3] = d[i + 3] ?? 255;
    }
  }
  src.data.set(dst);
  ctx.putImageData(src, 0, 0);
}

async function prepareImages(sources: string[], W:number, H:number, onStage?:(s:string)=>void, sharpen=false): Promise<HTMLCanvasElement[]> {
  onStage?.("Memproses gambar...");
  const out: HTMLCanvasElement[] = [];
  // PARALLEL load (max 4 sekaligus) — boost besar di HP
  const loadOne = async (src:string, idx:number):Promise<HTMLCanvasElement> => {
    onStage?.(`Memproses gambar ${idx+1}/${sources.length}...`);
    let canvas: HTMLCanvasElement | null = null;
    // 1) jalur utama: muat dengan CORS langsung
    try {
      const img = await loadImage(src);
      const c = drawCoverToCanvas(img, W, H);
      if (canvasReadable(c)) canvas = c;
    } catch {}
    // 2) jalur cadangan: lewat PROXY GAMBAR same-origin (CDN AI tanpa header CORS)
    if (!canvas && /^https?:/.test(src)) {
      try {
        const img = await loadImage(`/api/proxy-img?url=${encodeURIComponent(src)}`);
        const c = drawCoverToCanvas(img, W, H);
        if (canvasReadable(c)) canvas = c;
      } catch {}
    }
    if (!canvas) {
      throw new Error(`Gambar klip ${idx + 1} gagal dimuat (URL kedaluwarsa / diblokir CORS). Coba Render Ulang — atau rakit ulang draf dari Lahan biar gambar disegarkan ya bro.`);
    }
    if (sharpen) {
      onStage?.(`Menajamkan gambar ${idx+1}/${sources.length}...`);
      sharpenCanvas(canvas);
    }
    return canvas;
  };
  // Chunk parallel 4 + yield ke UI biar ga block
  for (let i=0;i<sources.length;i+=4) {
    const chunk = sources.slice(i,i+4).map((s,j)=>loadOne(s,i+j));
    const res = await Promise.all(chunk);
    out.push(...res);
    await new Promise(r=>setTimeout(r,0));
  }
  return out;
}

// ===== 🎬 v11.8 ANIMASI STUDIO: klip video AI (gambar→video) per-slide =====
// Tiap klip dapat PROXY CANVAS sendiri (salinan still + vinyet) yang DITUKAR ke imgs[i].
// Painter tidak perlu tahu soal video: frame <video> disalin ke kanvas itu tiap tick.
// Gagal muat / kena blokir CORS → slide otomatis tetap gambar still (aman, tidak ada layar hitam).
/** 🌀 v13.12: deck ganda per slide (muatan byte sama, dekode terpisah) + 1 kanvas komposit. */
type VidDeck = { a: HTMLVideoElement; b: HTMLVideoElement; c: HTMLCanvasElement; objUrl?: string }; // 📦 v13.13: objUrl = blob lokal unduhan utuh (direvoke seusai render)

async function prepareVideos(
  videos: (string | null | undefined)[], W: number, H: number,
  imgs: HTMLCanvasElement[], onStage?: (s: string) => void
): Promise<Map<number, VidDeck>> {
  const out = new Map<number, VidDeck>();
  if (!videos || !videos.length) return out;
  const idxs = videos.map((u, i) => ({ u, i })).filter((x): x is { u: string; i: number } => !!x.u && x.i < imgs.length);
  if (!idxs.length) return out;
  const loadVid = (v: HTMLVideoElement, src: string) => new Promise<boolean>((res) => {
    let done = false;
    const fin = (ok: boolean) => { done || (done = true, res(ok)); };
    v.addEventListener("loadeddata", () => fin(true), { once: true });
    v.addEventListener("error", () => fin(false), { once: true });
    setTimeout(() => fin(false), 25_000);
    v.src = src;
  });
  // 📦 v13.13 UNDUH UTUH DULU (biang "awal lancar belakangan PATAH" = Android memangkas buffer media pas render
  // jalan: seek awal mulus, seek ujung nunggu jaringan → frame basi diulang). Jadi blob-URL LOKAL → seek 100%
  // offline, trimming Android tak berkutik. Gagal unduh → jatuh hormat ke jalur streaming lama (klip AI data:/blob: tetap jalan).
  const unduhKlip = async (src: string): Promise<Blob | null> => {
    const coba = async (u2: string) => { const r = await fetch(u2); if (!r.ok) throw new Error("HTTP " + r.status); const bb = await r.blob(); if (bb.size < 80_000) throw new Error("kecil/busuk"); return bb; };
    try { return await coba(src); } catch { /* lanjut GERBANG */ }
    if (/^https?:/.test(src)) { try { return await coba(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(src)}`); } catch { return null; } }
    return null;
  };
  for (const { u, i } of idxs) {
    const mkVid = () => { const vv = document.createElement("video"); vv.muted = true; vv.playsInline = true; vv.preload = "auto"; vv.crossOrigin = "anonymous"; return vv; };
    const v = mkVid();
    let ok = false;
    let objUrl = "";
    let srcStream = u;
    onStage?.(`📦 Mengunduh klip video ${i + 1} utuh (anti-jaringan)...`);
    const blob = await unduhKlip(u);
    if (blob) {
      objUrl = URL.createObjectURL(blob);
      ok = await loadVid(v, objUrl);
      if (!ok || !v.videoWidth) {
        try { URL.revokeObjectURL(objUrl); } catch { /* abaikan */ }
        objUrl = ""; ok = false; // blob busuk → hormat balik ke streaming
      }
    }
    if (!ok) {
      // jalur streaming klasik (tetap dijaga gerbang buffer — untuk blob:/data: atau unduhan gagal total)
      ok = await loadVid(v, u);
      if (!ok && /^https?:/.test(u)) { srcStream = `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`; ok = await loadVid(v, srcStream); }
      if (!ok || !v.videoWidth) { onStage?.(`⚠️ Klip video ${i + 1} gagal dimuat — slide tetap gambar still.`); continue; }
      onStage?.(`🧱 Menyangga klip video ${i + 1} (streaming)...`);
      await new Promise<void>((res) => {
        const cukup = () => { try { const d = v.duration || 0; const bb = v.buffered; return d > 0 && bb.length > 0 && bb.end(bb.length - 1) >= d * 0.9; } catch { return false; } };
        if (cukup()) return res();
        const poll = setInterval(() => { if (cukup()) { clearInterval(poll); res(); } }, 350);
        v.addEventListener("canplaythrough", () => { clearInterval(poll); res(); }, { once: true });
        setTimeout(() => { clearInterval(poll); res(); }, 45_000);
      });
    }
    const v2 = mkVid(); // 🌀 deck B pasangan crossfade — sumber yang SUDAH TERBUKTI (blob lokal: gratis)
    await loadVid(v2, objUrl || srcStream);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const cx = c.getContext("2d")!;
    cx.drawImage(imgs[i], 0, 0);
    cx.drawImage(v, 0, 0, W, H);
    if (!canvasReadable(c)) { onStage?.(`⚠️ Klip video ${i + 1} diblokir CORS — slide tetap gambar still.`); if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch { /* abaikan */ } } continue; }
    cx.drawImage(imgs[i], 0, 0); // kembalikan poster still (frame video dilukis saat render)
    imgs[i] = c;
    out.set(i, { a: v, b: v2, c, objUrl });
  }
  return out;
}

function blitVid(v: HTMLVideoElement, c: HTMLCanvasElement, vig?: HTMLCanvasElement | null, vigStr?: number, alpha = 1) {
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  if (alpha <= 0.01) return; // 🌀 v13.12: alpha dipakai crossfade deck pasangan
  const W = c.width, H = c.height;
  const ir = v.videoWidth / v.videoHeight, cr = W / H;
  const cx = c.getContext("2d")!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "low";
  cx.globalAlpha = Math.max(0, Math.min(1, alpha)); // 🌀 v13.12

  const dbg = getDrawBg();
  if (dbg.mode !== "cover") {
    // ⚡ OPTIMIZE: Render video in contain mode! (No cropping, fits completely with black padding)
    cx.fillStyle = dbg.mode === "color" ? dbg.color : "#000000";
    cx.fillRect(0, 0, W, H);

    const sc = Math.min(W / v.videoWidth, H / v.videoHeight);
    const dw = v.videoWidth * sc, dh = v.videoHeight * sc;
    cx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    // Crop to fill (cover mode)
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (ir > cr) { sw = v.videoHeight * cr; sx = (v.videoWidth - sw) / 2; }
    else { sh = v.videoWidth / cr; sy = (v.videoHeight - sh) / 2; }
    cx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
  }

  cx.globalAlpha = 1;
  if (vig && (vigStr || 0) > 0.01) { cx.globalAlpha = vigStr!; cx.drawImage(vig, 0, 0, W, H); cx.globalAlpha = 1; }
}

/** 🌀 v13.12 LOOP LUMAT A/B + CROSSFADE — matematika DITES di sandbox sebelum rilis (perintah bro!).
    rate = durasiKlip/durasiSlot dijepit [0.5, 1.4] → gerak minimal 15fps (film-ish, bukan patah).
    Sambungan siklus disembunyikan CROSSFADE: deck aktif memudar, deck pasangan muncul dari awal —
    gerak TIDAK PERNAH berhenti & TIDAK ADA lompatan kasar. */
export function vidPlan(raw: number, vd: number, slot: number, spd = 1): { cyc: number; pos: number; inX: boolean; x: number; rate: number; act: "a" | "b" } {
  if (!(vd > 0.2) || !isFinite(vd)) return { cyc: 0, pos: 0, inX: false, x: 0, rate: 1, act: "a" };
  
  // 🩹 v16.0 SMOOTH CINEMATIC FLUIDITY:
  // Kita hilangkan pemaksaan slow-mo ekstrim (RMIN=0.20) yang membuat fps video anjlok menjadi patah-patah (6fps).
  // Kecepatan otomatis dijepit secara ketat di [0.85, 1.2], sehingga video selalu berputar pada kecepatan aslinya yang super mulus (30fps/60fps murni)!
  const RMIN = 0.85, RMAX = 1.2;
  let rate = vd / (slot > 0.2 ? slot : vd);
  if (rate < RMIN) rate = RMIN; else if (rate > RMAX) rate = RMAX;
  
  const sMul = spd >= 0.25 && spd <= 2 ? spd : 1;
  rate *= sMul;
  if (rate < 0.25) rate = 0.25; else if (rate > 2) rate = 2;
  
  const st = Math.max(0, raw) * rate;
  
  // 🩹 v16.0 FREEZE-ON-END (Anti-Looping):
  // Jika video sudah habis (st >= vd), alih-alih mengulang-ulang secara tidak estetik ("bolak-balik"),
  // video akan diam mematung (freeze-frame) di frame terakhirnya yang tajam & indah, layaknya still photo premium!
  let cyc = 0;
  let pos = st;
  if (st >= vd) {
    pos = vd - 0.05; // Diam di frame terakhir
    cyc = 0;
  }
  
  const XF = Math.min(0.5, vd * 0.15);
  const inX = vd > XF * 2 && pos >= vd - XF;
  const x = inX ? Math.min(1, (pos - (vd - XF)) / XF) : 0;
  return { cyc, pos, inX, x, rate, act: "a" };
}

/** 🌀 v13.15 LOOP LUMAT KONTINU (khusus PREVIEW Studio) — beda dari vidPlan (render): setelah crossfade
    selesai, deck yang menang TIDAK mundur ke 0 — dia LANJUT main (overlap memakan durasi; periode = vd−XF).
    Target posisi tiap deck MONOTON naik → realtime mulus tanpa seek yang terlihat. Diuji di tests/vidloop.test.mjs.
    st = detik konten (clipT × rate). Keluaran: deck luar (lapis bawah, penuh) & deck masuk (fade-in, alpha x). */
export function vidLoopPrev(st: number, vd: number): { outD: "a" | "b"; outPos: number; inD: "a" | "b" | null; inPos: number; x: number } {
  const s = Math.max(0, st);
  if (!(vd > 0.4) || !isFinite(vd)) return { outD: "a", outPos: s, inD: null, inPos: 0, x: 0 };
  const XF = Math.min(0.5, vd * 0.15);
  const P = vd - XF;
  if (!(P > 0) || s < P) return { outD: "a", outPos: Math.min(s, vd), inD: null, inPos: 0, x: 0 };
  const k = Math.floor(s / P);          // fade ke-k (1,2,3…): deck (k−1) keluar, deck k masuk
  const q = s - k * P;                   // posisi dalam jendela [0..P)
  if (q > XF) {                          // di antara dua fade: deck k lanjut sendirian
    return { outD: k % 2 ? "b" : "a", outPos: q, inD: null, inPos: 0, x: 0 };
  }
  const x = XF > 0 ? Math.min(1, q / XF) : 1;
  const outA = (k - 1) % 2 === 0;        // fade ganjil: A→B · genap: B→A
  return { outD: outA ? "a" : "b", outPos: Math.min(q + P, vd), inD: outA ? "b" : "a", inPos: q, x };
}

function seekVid(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    if (!v || v.readyState < 2) return res();
    
    // 🩹 v15.6 CONGESTION PREVENTION & SEEK-SKIP OPTIMIZATION:
    // 1. Ambil riwayat seek yang terakhir diminta. currentTime di HTML5 diupdate secara async,
    //    sehingga loop cepat JS bisa membanjiri (flood) video element dengan ratusan seek request per detik,
    //    yang membekukan decoder GPU di HP kentang! Kita pantau _lastSeekT untuk mencegah seek berulang.
    const last = (v as any)._lastSeekT ?? -999;
    
    // 2. Pada ekspor 30fps/24fps, interval antar frame adalah 33ms/41ms.
    //    Jika video diperlambat (slow-mo), posisi detiknya bergerak sangat lambat (misal hanya bertambah 6ms per frame).
    //    Kita lewatkan (skip) seek jika perbedaan waktu dari seek terakhir < 0.032 detik (setara interval frame 30fps).
    //    Ini menghemat hingga 80% operasi seek GPU di HP kentang pada klip slow-mo dengan hasil visual yang tetap 100% sempurna!
    if (Math.abs(last - t) < 0.032) return res();
    
    (v as any)._lastSeekT = t;
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener("seeked", fin); res(); };
    v.addEventListener("seeked", fin);
    setTimeout(fin, 300); // 📦 v13.13: batas tunggu 300ms cukup aman untuk lari cepat
    try { v.currentTime = t; } catch { fin(); }
  });
}

// 🆙 v13.8: FFT radix-2 (512 titik) in-place — tabel bit-reversal & twiddle dihitung SEKALI.
// 100% orisinal; dipakai precomputeSpectrum untuk analisis musik nyata (bukan RMS sampel mentah).
const FFT_N = 512;
const _fftRev = new Uint16Array(FFT_N);
const _fftCos = new Float32Array(FFT_N / 2), _fftSin = new Float32Array(FFT_N / 2);
(function initFft512() {
  for (let i = 0; i < FFT_N; i++) { let r = 0, x = i; for (let b = 0; b < 9; b++) { r = (r << 1) | (x & 1); x >>= 1; } _fftRev[i] = r; }
  for (let k = 0; k < FFT_N / 2; k++) { const a = -2 * Math.PI * k / FFT_N; _fftCos[k] = Math.cos(a); _fftSin[k] = Math.sin(a); }
})();
function fft512(re: Float32Array, im: Float32Array) {
  const N = FFT_N;
  for (let i = 0; i < N; i++) { const j = _fftRev[i]; if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = i, k = 0; j < i + half; j++, k += step) {
        const c = _fftCos[k], s = _fftSin[k];
        const l = j + half;
        const xr = re[l] * c - im[l] * s, xi = re[l] * s + im[l] * c;
        re[l] = re[j] - xr; im[l] = im[j] - xi;
        re[j] += xr; im[j] += xi;
      }
    }
  }
}

// ===== Pre-compute spectrum table (LUT) — inilah boost speed utama =====
function precomputeSpectrum(
  audioData: Float32Array|null, sampleRate:number,
  totalFrames:number, fps:number, barCount:number
): { bars: Float32Array[]; beats: Uint8Array; bassLevels: Float32Array } {
  onStage2?.("Menganalisis audio (pre-compute spectrum)...");
  // Mobile optimization: downsample audio dulu ke ~11kHz mono — analisis spectrum gak butuh frekuensi tinggi
  // Ini boost 3-4× di precompute karena 4× lebih sedikit sampel
  const targetSR = 11025;
  const ds = Math.max(1, Math.floor(sampleRate/targetSR));
  let dsa: Float32Array;
  let dssr = sampleRate/ds;
  if (audioData) {
    const n = Math.ceil(audioData.length/ds);
    dsa = new Float32Array(n);
    for (let i=0;i<n;i++){
      let s=0;
      for (let j=0;j<ds;j++) s += audioData[i*ds+j]||0;
      dsa[i] = s/ds;
    }
  } else {
    dsa = new Float32Array(0);
  }

  const barsArr: Float32Array[] = new Array(totalFrames);
  const beats = new Uint8Array(totalFrames);
  const bassLevels = new Float32Array(totalFrames);
  const smooth = new Float32Array(barCount);
  const bassRef = { level: 0, beat: false };
  // 🆙 v13.8: ANALISIS FFT SUNGGUHAN (512 titik @~11kHz → jendela 46ms, bin ≈ 21,5Hz).
  // Mesin lama membaca "RMS 2–3 sampel × tepi jendela Hann" → bin bass terbaca ≈ NOL →
  // batang spektrum menciut jadi titik (laporan bro: "bar spektrumnya dikit & ngk jelas").
  // KONTRAK TIDAK BERUBAH: bars Float32Array 0..1 per-frame · beats · bassLevels —
  // semua konsumen lama (visualizer bawaan, beat flash, stiker @bars) otomatis ikut pintar.
  const NFFT = 512;
  const bassEnd = Math.floor(barCount*0.12) || 1;
  const hann = new Float32Array(NFFT);
  for (let i=0;i<NFFT;i++) hann[i] = 0.5*(1-Math.cos(2*Math.PI*i/(NFFT-1)));
  const binHz = dssr / NFFT;
  const bLo = new Int32Array(barCount), bHi = new Int32Array(barCount);
  for (let b=0;b<barCount;b++) {
    const f0 = 60 * Math.pow(5000/60, b/barCount);
    const f1 = 60 * Math.pow(5000/60, (b+1)/barCount);
    bLo[b] = Math.max(1, Math.floor(f0 / binHz));
    bHi[b] = Math.min(NFFT/2 - 1, Math.max(bLo[b] + 1, Math.ceil(f1 / binHz)));
  }
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT);

  for (let f=0; f<totalFrames; f++) {
    const t = f/fps;
    const out = new Float32Array(barCount);
    if (audioData && dsa.length >= NFFT) {
      const center = Math.floor(t*dssr);
      const start = Math.max(0, Math.min(center - (NFFT>>1), dsa.length - NFFT));
      for (let i=0;i<NFFT;i++){ re[i] = dsa[start+i]*hann[i]; im[i]=0; }
      fft512(re, im);
      for (let b=0; b<barCount; b++) {
        let sum = 0;
        for (let k=bLo[b]; k<bHi[b]; k++) sum += re[k]*re[k] + im[k]*im[k];
        const mag = Math.sqrt(sum / Math.max(1, bHi[b]-bLo[b])) / (NFFT/4);
        const db = 20 * Math.log10(mag + 1e-7);
        let v = clamp((db + 46) / 34, 0, 1); // rentang dB musik nyata (−48…−10) → 0..1
        if (v < 0.035) v = 0; // gerbang desis — bagian hening tetap bersih
        const target = Math.min(1, v * (1 + b * 0.02));
        const a = target > smooth[b] ? 0.75 : 0.18; // sergap naik · jatuh lembut (sensitif, tak kedip)
        smooth[b] = smooth[b]*(1-a) + target*a;
        out[b] = smooth[b];
      }
    } else if (audioData) {
      for (let b=0;b<barCount;b++) out[b] = 0.12 + Math.abs(Math.sin(t*2+b*0.3))*0.1; // klip teramat pendek
    } else {
      for (let b=0;b<barCount;b++) out[b] = 0.05 + Math.sin(t*2+b*0.2)*0.05;
    }
    barsArr[f] = out;
    let bsum = 0;
    for (let i=0;i<bassEnd;i++) bsum += out[i];
    const bass = bsum / bassEnd;
    bassRef.level = bassRef.level*0.85 + bass*0.15;
    const isBeat = bass > bassRef.level*1.35 && bass > 0.15;
    bassLevels[f] = bassRef.level;
    if (isBeat) { beats[f] = 1; bassRef.beat = true; } else bassRef.beat = false;
  }
  return { bars: barsArr, beats, bassLevels };
}
// onStage2 shim (set saat render berjalan)
let onStage2: ((s:string)=>void) | null = null;

// ===== Audio mix helpers =====
function audioBufferToWav(samples: Float32Array, sampleRate:number, sampleStart:number, sampleEnd:number) {
  const length = Math.max(0, Math.min(sampleEnd, samples.length) - sampleStart);
  const buf = new ArrayBuffer(44+length*2);
  const v = new DataView(buf);
  const ws=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF"); v.setUint32(4,36+length*2,true); ws(8,"WAVE"); ws(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true); v.setUint32(28,sampleRate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  ws(36,"data"); v.setUint32(40,length*2,true);
  let off=44;
  for (let i=0;i<length;i++){
    const s = Math.max(-1,Math.min(1,samples[sampleStart+i]));
    v.setInt16(off, s<0?s*0x8000:s*0x7fff, true); off+=2;
  }
  return buf;
}

// ===== Draw state & frame =====
interface DrawState {
  time:number; fps:number; totalDur:number;
  slideIdx:number; slideT:number; transT:number;
  isTransition:boolean; nextIdx:number;
  W:number; H:number;
  bars:Float32Array|number[]; bass:number; beat:boolean;
  rgb:[number,number,number];
  style:VizStyle; imgs:HTMLCanvasElement[];
  profile:typeof QUALITY_PROFILES[Quality];
  title?:string;
  particles:{x:number,y:number,vx:number,vy:number,life:number,size:number}[];
  phase:number;
  _canvas:HTMLCanvasElement; _transition:Transition;
  _kb?: { dir?: "in" | "out"; s?: number } | null; // 🎬 v11.4: Ken Burns kustom per-klip
  showTitle?:boolean; showCaption?:boolean;
  logoImg?:HTMLImageElement|HTMLCanvasElement|null; logoPos?:"center"|"corner"|"none";
  captions?:CaptionWord[]; captionStyle?:CaptionStyle;
  videoFilter?: string;
  vignetteStrength?: number;
  spectrumSticker?: string;
  _cinebars?: boolean; // 🎬 v13.5 LETTERBOX
  textLayers?: TextLayer[];
  // v5 per-klip
  clipT?: number; clipDur?: number; transId?: string;
  timeline?: Timeline | null; slideOpts?: SlideOpt[] | null; grainAmt?: number;
  vidMap?: Map<number, any>;
  // v8.7 cache bingkai: gambar hanya lapisan tertentu (A=dunia klip · OV1=glow+spektrum · B=judul/logo/caption · OV2=stiker-spektrum+progress)
  only?: "all"|"A"|"OV1"|"B"|"OV2";
}

function paintKineticGapFiller(ctx: CanvasRenderingContext2D, W: number, H: number, s: any) {
  const vidMap = s.vidMap as Map<number, any> | undefined;
  if (!vidMap || !vidMap.size) return;
  
  const slideIdx = s.slideIdx;
  const vC = vidMap.get(slideIdx);
  if (!vC) return;
  
  const vd = vC.a.duration || vC.b.duration || 0;
  if (!(vd > 0)) return;
  
  const timeline = s.timeline;
  const perSlide = s.clipDur || 5;
  const s0 = timeline ? (timeline.starts[slideIdx] ?? 0) : slideIdx * perSlide;
  const slot0 = timeline ? (((timeline as any).durs?.[slideIdx]) ?? perSlide) : perSlide;
  const rawTime = s.time - s0;
  
  // Kita aktif HANYA bila video sudah berakhir (rawTime >= vd) dan slot slide masih tersisa kekosongan
  if (rawTime < vd || rawTime >= slot0) return;
  
  const gapT = rawTime - vd; // Berapa detik kita berada dalam celah kekosongan
  
  // 🩹 v16.1 CINEMATIC DREAM-BLUR:
  // Kita beri efek blur lembut pada background video yang sedang beku agar bertransisi secara halus & indah
  const blurAmount = Math.min(6, gapT * 2.5);
  if (blurAmount > 0.1) {
    ctx.save();
    ctx.filter = `blur(${Math.round(blurAmount)}px)`;
    ctx.drawImage(s._canvas, 0, 0, W, H);
    ctx.restore();
  }

  // 🩹 v16.1 WARM GOLDEN LIGHT LEAK FLASH:
  // Tambahkan efek cahaya bocor (light leak) hangat yang perlahan memudar masuk di ujung video untuk mengeliminasi kebosanan visual
  const lightAlpha = Math.min(0.35, gapT * 0.15) + 0.04 * Math.sin(gapT * 3);
  if (lightAlpha > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const lg = ctx.createRadialGradient(W * 0.1, H * 0.1, 0, W * 0.1, H * 0.1, W * 0.6);
    lg.addColorStop(0, `rgba(255, 175, 75, ${lightAlpha})`);
    lg.addColorStop(0.6, `rgba(255, 120, 50, ${lightAlpha * 0.4})`);
    lg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  
  // Ambil lirik aktif untuk slide ini
  let text = "";
  if (s.captions && Array.isArray(s.captions)) {
    const slideStart = s0;
    const slideEnd = s0 + slot0;
    const words = s.captions.filter((w: any) => w.start >= slideStart && w.start <= slideEnd);
    if (words.length) {
      text = words.map((w: any) => w.text).join(" ");
    }
  }
  
  // Fallback ke judul proyek / niche jika lirik kosong
  if (!text.trim()) {
    text = s.title || "";
  }
  if (!text.trim()) return;
  
  ctx.save();
  ctx.filter = "none"; // Matikan filter gambar agar teks lirik super tajam
  
  // Efek zoom kinetik sinematik yang sangat halus (slowly expanding)
  const scale = 1.0 + Math.min(0.08, gapT * 0.025);
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  
  // Gambar bayangan gelap lembut di belakang teks agar mudah dibaca di background apapun (cinematic backdrop)
  const boxW = W * 0.72;
  const boxH = H * 0.16;
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  
  // Bulatkan rect dengan aman
  if (typeof (ctx as any).roundRect === "function") {
    (ctx as any).roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 12);
  } else {
    ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
  }
  ctx.fill();
  
  // Menggambar teks lirik sinematik di dead-center
  // Gunakan font Serif premium (Georgia / Times New Roman) untuk estetika film tinggi
  ctx.font = `italic 700 ${Math.max(14, Math.round(W * 0.038))}px Georgia, serif`;
  ctx.fillStyle = "#ffd93d"; // Warna kuning emas premium khas CapCut Pro
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 10;
  
  // Bungkus teks ke 2 baris jika terlalu panjang
  const maxW = boxW - 40;
  const wordsList = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (let n = 0; n < wordsList.length; n++) {
    const testLine = line + wordsList[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxW && n > 0) {
      lines.push(line.trim());
      line = wordsList[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  
  // Efek memudar lembut (fade-in) di awal kekosongan
  const fadeAlpha = Math.min(1, gapT * 2);
  ctx.globalAlpha = fadeAlpha;
  
  if (lines.length === 1) {
    ctx.fillText(lines[0], 0, 0);
  } else {
    const spacing = W * 0.045;
    ctx.fillText(lines[0], 0, -spacing / 2);
    ctx.fillText(lines[1], 0, spacing / 2);
  }
  
  ctx.restore();
}

function drawFrame(s: DrawState) {
  const { W,H,bars,rgb,style,imgs,slideIdx,isTransition,nextIdx,transT,slideT,bass,beat } = s;
  const ctx = s._canvas.getContext("2d", { alpha: false, desynchronized: true })!;
  const useV5 = !!(s.slideOpts && s.timeline);
  const __G = s.only || "all";
  const gA = __G === "all" || __G === "A", gO1 = __G === "all" || __G === "OV1";
  const gB = __G === "all" || __G === "B", gO2 = __G === "all" || __G === "OV2";

  if (gA) {
  // Reset filter di awal frame (v5: filter dikelola per-klip di paintClips)
  ctx.filter = useV5 ? "none" : (s.videoFilter || "none");

  // ===== MOBILE SPEED: kurangi gradient & efek berat =====
  // Flat dark bg (gak bikin radial gradient tiap frame — 2-3× lebih cepat di mobile GPU)
  ctx.fillStyle = "#08050f";
  ctx.fillRect(0,0,W,H);

  const cur = imgs[slideIdx % imgs.length];
  const nxt = imgs[nextIdx % imgs.length];
  // Ken Burns dikurangi dari 8%→3% di mobile — drawImage zoom mahal
  const kb = (W <= 720) ? 0.03 : 0.08;
  // 🎬 v11.4: Ken Burns KERAS dari Sutradara menang atas ramp bawaan (yang cuma 3–8%, tak terasa di HP)
  const kbC = (s as any)._kb as { dir?: string; s?: number } | undefined;
  let zoomBase = 1.0 + slideT*kb + (beat?0.008:0);
  let kbdx = 0, kbdy = 0; // 🎬 v13.3
  if (kbC) {
    const Sk = Math.min(0.5, Math.max(0.05, kbC.s || 0.3));
    const dir = kbC.dir || "in";
    if (dir === "l" || dir === "r" || dir === "u" || dir === "d") { // 🎬 v13.3 GESER WAH: zoom konstan (tepi aman), isi mengalir
      zoomBase = 1 + Sk;
      const se = slideT * slideT * (3 - 2 * slideT); // 🎬 v13.5 FILM EASE — cermin preview
      const ax = dir === "l" ? 1 : dir === "r" ? -1 : 0;
      const ay = dir === "u" ? 1 : dir === "d" ? -1 : 0;
      kbdx = ax * Sk * (0.5 - se);
      kbdy = ay * Sk * (0.5 - se);
    } else {
      const se = slideT * slideT * (3 - 2 * slideT); // 🎬 v13.5
      zoomBase = dir === "out" ? (1 + Sk) - se * Sk : 1 + se * Sk;
    }
  }
  const drawImg = (img:HTMLCanvasElement,alpha:number,zoom:number)=>{
    if (alpha<=0) return;
    ctx.globalAlpha = alpha;
    const dw=W*zoom, dh=H*zoom;
    ctx.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
  };
  if (!useV5) drawImg(cur,1,zoomBase);

  // ===== v5: painter per-klip (animasi, transisi katalog, efek, stiker, teks, grain) =====
  if (useV5) {
    const optsArr = (s.slideOpts || []) as SlideOpt[];
    paintClips(ctx, W, H, cur, nxt, {
      clipT: typeof s.clipT === "number" ? s.clipT : slideT,
      clipDur: s.clipDur || 1,
      inTrans: isTransition, transT,
      transId: s.transId || s._transition,
      optCur: optsArr[slideIdx] || null,
      optNxt: optsArr[nextIdx] || null,
      globalFilter: s.videoFilter || "none",
      absT: s.time, isMobile: W <= 720, beat,
      grain: s.grainAmt || 0,
      kbZoom: zoomBase, kbDx: kbdx, kbDy: kbdy,
    });
    // teks lepas waktu (start/dur sendiri — digeser di track)
    // 💎 v13.9: paintFloatingStickers PINDAH ke lapisan hidup OV2 (digambar tiap frame) — lihat di bawah
    paintFloatingTexts(ctx, W, H, optsArr, s.time);
    
    // 🩹 v16.0 KINETIC LYRIC GAP-FILLER:
    // Jika video klip sudah berakhir tapi durasi slide masih tersisa (kekosongan),
    // sistem otomatis menampilkan kalimat lirik aktif dengan animasi zoom & pudar kinetik yang sangat estetik di tengah layar!
    paintKineticGapFiller(ctx, W, H, s);
  }

  // Vignette PRA-RENDERED (dibuat sekali di setup) — tidak buat radial gradient tiap frame
  if ((s as any)._vignette) {
    ctx.filter = "none";
    ctx.globalAlpha = (typeof s.vignetteStrength==="number" ? s.vignetteStrength : 0.75);
    ctx.drawImage((s as any)._vignette, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.filter = useV5 ? "none" : (s.videoFilter || "none");
  }
  if ((s as any)._cinebars) { // 🎬 v13.5 LETTERBOX BIOSKOP — identik dengan preview
    const bh = H * (W >= H ? 0.125 : 0.07);
    ctx.save(); ctx.filter = "none"; ctx.globalAlpha = 1; ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); ctx.restore();
  }

  if (!useV5 && isTransition && nxt) {
    const t = easeInOut(transT);
    if (s._transition==="fade") drawImg(nxt,t,1);
    else if (s._transition==="zoom") { drawImg(cur,1-t,zoomBase*(1-t*0.1)); drawImg(nxt,t,0.97+t*0.03); }
    else if (s._transition==="slide") {
      ctx.globalAlpha=1-t; ctx.drawImage(cur,-W*t*0.2,0,W,H);
      ctx.globalAlpha=t;  ctx.drawImage(nxt,W*(1-t),0,W,H);
    }
    else if (s._transition==="blur") { drawImg(nxt,t,1); ctx.fillStyle=`rgba(0,0,0,${0.4*(1-t)})`; ctx.fillRect(0,0,W,H); }
    else if (s._transition==="glitch") {
      if (t<0.5) drawImg(cur,1,zoomBase); else drawImg(nxt,1,1);
      if (beat||t>0.3){
        ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.4;
        ctx.drawImage(cur||nxt,(Math.random()-0.5)*10*t*10,(Math.random()-0.5)*4,W,H);
        ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
      }
    } else drawImg(nxt,t,1);
  }

  } // gA — lapisan dunia klip

  if (gO1) {
  // Glow wash tipis (solid color dengan alpha variasi bass — jauhi gradient)
  ctx.fillStyle = `rgba(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0},${(0.05+bass*0.10).toFixed(3)})`;
  ctx.fillRect(0,0,W,H);

  drawSpectrum(ctx, s);
  } // gO1 — lapisan hidup (tiap frame)

  if (gB) {
  drawCaptions(ctx, s);

  if (s.title && s.showTitle) {
    const titleT = Math.min(1,slideT*2);
    ctx.save(); ctx.globalAlpha = titleT;
    ctx.font = `900 ${Math.floor(H*0.05)}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    const ty = H*0.88;
    ctx.shadowColor = rgba(rgb,0.9); ctx.shadowBlur = 12+bass*14;
    ctx.fillStyle="#fff";
    ctx.fillText(s.title, W/2, ty, W*0.92);
    ctx.restore();
  }

  if (s.logoImg && s.logoPos==="corner") {
    ctx.save();
    const size = Math.min(W,H)*0.08, pad=size*0.4, lx=pad, ly=pad;
    ctx.fillStyle="rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.arc(lx+size/2,ly+size/2,size/2+pad*0.3,0,Math.PI*2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(lx+size/2,ly+size/2,size/2,0,Math.PI*2); ctx.clip();
    ctx.drawImage(s.logoImg,lx,ly,size,size);
    ctx.restore(); ctx.restore();
  }

  // ===== TEXT LAYERS (multi-teks CapCut-style) =====
  drawTextLayers(ctx, s);
  } // gB — lapisan teks/judul/logo

  if (gO2) {
  // ===== SPECTRUM STICKER (di atas text — subscribe/like/bell/disc/wave) =====
  drawSpectrumSticker(ctx, s);

  // 💎 v13.9 PANGGUNG HIDUP — stiker lepas-waktu (@bars/@wavepro/@ring spektrum musik) digambar
  // TIAP FRAME di lapisan hidup ini. Dulu nempel di lapisan A yang ke-cache (≈96 ember per klip
  // ≈ 2,4fps cap) → spektrum kaku/"belum wah" meski data FFT-nya benar. Bonus: kini di ATAS
  // glow-wash → batang lebih terang. Di jalur lukis-penuh (only:"all") hasilnya tetap sama.
  if (useV5) paintFloatingStickers(ctx, W, H, (s.slideOpts || []) as SlideOpt[], s.time, (s as any).bars);

  // Progress bar
  ctx.fillStyle="rgba(255,255,255,0.12)"; ctx.fillRect(0,H-3,W,3);
  ctx.fillStyle=rgba(rgb,0.9); ctx.fillRect(0,H-3,W*(s.time/s.totalDur),3);
  } // gO2
}

// ===== Caption CapCut-style =====
function drawCaptions(ctx: CanvasRenderingContext2D, s: DrawState) {
  if (!s.captions?.length || s.captionStyle==="none") return;
  const t = s.time;
  // Cari kata aktif
  let activeIdx = -1;
  for (let i=0;i<s.captions.length;i++){
    const w = s.captions[i];
    if (t>=w.start && t<=w.end) { activeIdx = i; break; }
  }
  if (activeIdx < 0) return;
  // Ambil window 5 kata di sekitar aktif (2 sebelum, 2 sesudah)
  const start = Math.max(0, activeIdx-2);
  const end = Math.min(s.captions.length, activeIdx+3);
  const words = s.captions.slice(start, end);
  const { W, H, rgb } = s;
  const style = s.captionStyle || "capcut";
  const baseY = H*0.72;

  ctx.save();
  ctx.textAlign="center"; ctx.textBaseline="middle";

  // CapCut "Rubah" yellow-pop style
  if (style==="capcut") {
    const fontSize = Math.max(28, Math.floor(H*0.055));
    ctx.font = `900 ${fontSize}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
    const lineH = fontSize*1.25;
    // Layout kata ke 1-2 baris
    const maxW = W*0.9;
    const lines: CaptionWord[][] = [[]];
    let curLine = "";
    for (const w of words) {
      const test = curLine ? curLine+" "+w.text : w.text;
      if (ctx.measureText(test).width > maxW && curLine) { lines.push([w]); curLine = w.text; }
      else { lines[lines.length-1].push(w); curLine = test; }
    }
    const totalH = lines.length*lineH;
    const startY = baseY - totalH/2;
    lines.forEach((ln, li)=>{
      const y = startY + li*lineH + lineH/2;
      // Ukur total lebar baris
      let totalTextW = 0;
      const ww = ln.map(w=>{
        const m = ctx.measureText(w.text);
        totalTextW += m.width;
        return { ...w, w: m.width };
      });
      const spaceW = ctx.measureText(" ").width;
      totalTextW += spaceW*(ln.length-1);
      let x = W/2 - totalTextW/2;
      ww.forEach((w)=>{
        const isActive = w.start <= t && t <= w.end;
        const scale = isActive ? 1.1 : 1.0;
        const color = isActive ? "#fde047" : "#fff";
        // Outline hitam tebal (CapCut khas)
        ctx.save();
        ctx.translate(x + w.w/2, y);
        ctx.scale(scale, scale);
        ctx.lineWidth = Math.max(5, fontSize/7);
        ctx.strokeStyle = "rgba(0,0,0,0.95)";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(w.text, 0, 0);
        ctx.fillStyle = color;
        ctx.shadowColor = isActive ? rgba(rgb,0.8) : "transparent";
        ctx.shadowBlur = isActive ? 18 : 0;
        ctx.fillText(w.text, 0, 0);
        ctx.restore();
        x += w.w + spaceW;
      });
    });
  }
  // Neon style
  else if (style==="neon") {
    const fontSize = Math.max(26, Math.floor(H*0.05));
    ctx.font = `900 ${fontSize}px system-ui,sans-serif`;
    const cur = s.captions[activeIdx];
    const prev = s.captions[activeIdx-1]?.text||"";
    const line2 = cur.text;
    // garis progres dalam kata aktif
    const localT = (t-cur.start)/(cur.end-cur.start);
    ctx.lineWidth = Math.max(5,fontSize/8); ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.9)";
    ctx.strokeText(line2, W/2, baseY, W*0.9);
    // Clip untuk highlight
    ctx.save();
    ctx.beginPath();
    const w = ctx.measureText(line2).width;
    ctx.rect(W/2-w/2, baseY-fontSize, w*localT, fontSize*2);
    ctx.clip();
    ctx.fillStyle = rgba(rgb,1);
    ctx.shadowColor = rgba(rgb,1); ctx.shadowBlur=25;
    ctx.fillText(line2, W/2, baseY, W*0.9);
    ctx.restore();
    ctx.fillStyle="#fff";
    ctx.shadowBlur=0;
    ctx.font = `700 ${Math.floor(fontSize*0.7)}px system-ui,sans-serif`;
    ctx.fillText(prev, W/2, baseY-fontSize*1.4, W*0.9);
  }
  // Bold White style (CapCut klasik: putih + outline hitam tebal, aktif sedikit lebih besar)
  else if (style==="boldwhite" || style==="pop" || style==="karaoke") {
    const fontSize = Math.max(28, Math.floor(H*0.055));
    ctx.font = `900 ${fontSize}px system-ui,sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    // Tampilkan 2 baris (sebelum+aktif+sesudah)
    const around = s.captions.slice(Math.max(0,activeIdx-1), Math.min(s.captions.length, activeIdx+2));
    around.forEach((w,wi)=>{
      const isActive = Math.max(0,activeIdx-1)+wi === activeIdx;
      ctx.save();
      ctx.lineWidth = Math.max(5, fontSize/7);
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.lineJoin = "round";
      ctx.globalAlpha = isActive?1:0.6;
      const y = baseY - (activeIdx - (Math.max(0,activeIdx-1)+wi))*fontSize*1.15;
      if (isActive) {
        ctx.fillStyle="#fff"; ctx.shadowColor="rgba(0,0,0,0.6)"; ctx.shadowBlur=6;
      } else { ctx.fillStyle="rgba(255,255,255,0.9)"; ctx.shadowBlur=0; }
      // Tampilkan per-kata dalam baris aktif
      const cap = s.captions||[];
      const lineWords = cap.filter(x=>x.line===w.line);
      const text = lineWords.length ? lineWords.map(x=>x.text).join(" ") : w.text;
      ctx.strokeText(text, W/2, y, W*0.9);
      ctx.fillText(text, W/2, y, W*0.9);
      ctx.restore();
    });
  }
  // Gradient (CapCut gradient pink-cyan)
  else if (style==="gradient") {
    const fontSize = Math.max(28, Math.floor(H*0.055));
    ctx.font = `900 ${fontSize}px system-ui,sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.lineWidth=Math.max(5,fontSize/7); ctx.strokeStyle="rgba(0,0,0,0.9)"; ctx.lineJoin="round";
    const cur = s.captions[activeIdx];
    const grad = ctx.createLinearGradient(W/2-200,baseY,W/2+200,baseY);
    grad.addColorStop(0,"#ec4899"); grad.addColorStop(0.5,"#a855f7"); grad.addColorStop(1,"#22d3ee");
    ctx.strokeText(cur.text, W/2, baseY, W*0.9);
    ctx.fillStyle=grad; ctx.shadowBlur=18; ctx.shadowColor="rgba(168,85,247,0.7)";
    ctx.fillText(cur.text, W/2, baseY, W*0.9);
  }
  // Film Indie (Serif documentation subtitles)
  else if (style==="indie") {
    const fontSize = Math.max(18, Math.floor(H*0.04));
    ctx.font = `600 ${fontSize}px Georgia, 'Times New Roman', serif`;
    const cur = s.captions[activeIdx];
    // Placed slightly lower (closer to letterbox)
    const y = baseY + H * 0.05;
    ctx.lineWidth = Math.max(3, fontSize/12);
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    ctx.lineJoin = "round";
    ctx.strokeText(cur.text, W/2, y, W*0.9);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cur.text, W/2, y, W*0.9);
  }
  ctx.restore();
}

// ===== Draw Text Layers (multi-teks CapCut-style) =====
function drawTextLayers(ctx: CanvasRenderingContext2D, s: DrawState) {
  const layers = s.textLayers;
  if (!layers?.length) return;
  const { W, H, time, rgb, bass } = s;
  ctx.save();
  ctx.filter = "none"; // text gak kena video filter (di CapCut text selalu tajam)
  layers.forEach(layer => {
    if (!layer.text) return;
    // Cek timing
    if (time < layer.start - 0.05 || time > layer.end + 0.05) return;
    const localT = time - layer.start;
    const dur = layer.end - layer.start;
    if (dur <= 0) return;

    // Hitung opacity dari anim in/out
    let opacity = typeof layer.opacity === "number" ? layer.opacity : 1;
    let scale = 1;
    let offsetY = 0;
    let offsetX = 0;
    let letterClip = 1;

    const inDur = 0.4;
    const outDur = 0.4;
    const inEase = Math.min(1, Math.max(0, localT/inDur));
    const outEase = Math.min(1, Math.max(0, (dur-localT)/outDur));
    if (layer.animIn === "fadein" || layer.animIn === "fade") opacity *= inEase;
    if (layer.animOut === "fade" || layer.animOut === "fadeout") opacity *= outEase;
    if (layer.animIn === "pop") scale *= 0.6 + inEase*0.4;
    if (layer.animIn === "slideup") { offsetY = H*0.08*(1-inEase); opacity *= inEase; }
    if (layer.animIn === "slideleft") { offsetX = -W*0.1*(1-inEase); opacity *= inEase; }
    if (layer.animIn === "typewriter") letterClip = inEase;
    // Out animations
    if (layer.animOut === "pop") { scale *= 0.6 + 0.4*outEase; opacity *= outEase; } // mengecil ke 0.6
    if (layer.animOut === "slideup") { offsetY -= H*0.08*(1-outEase); opacity *= outEase; }
    if (layer.animOut === "slideleft") { offsetX -= W*0.1*(1-outEase); opacity *= outEase; }
    if (layer.animLoop === "pulse") { scale *= 1 + Math.sin(time*4)*0.05 + bass*0.1; }
    if (layer.animLoop === "glow") { /* glow lewat shadow */ }
    if (layer.animLoop === "bounce") offsetY -= Math.abs(Math.sin(time*3))*H*0.01;

    if (opacity <= 0.01) return;

    const sizePct = layer.sizePct ?? 0.07;
    const fontSize = Math.max(16, Math.floor(Math.min(W,H) * sizePct));
    const bold = layer.bold !== false ? "900" : "400";
    const italic = layer.italic ? "italic " : "";
    const FONT_CSS: Record<string,string> = {
      SYSTEM: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      WASHED: "'Impact','Arial Black','Helvetica Neue',sans-serif",
      VISION: "Georgia,'Times New Roman',serif",
      MODERN: "'Courier New','Courier',monospace",
      TOOTH:  "'Brush Script MT','Segoe Script',cursive",
      CELAND: "'Comic Sans MS',cursive",
      STARRY: "'Trebuchet MS',sans-serif",
      KLOP:   "Tahoma,Verdana,sans-serif",
      ANTIK:  "'Times New Roman',Times,serif",
      FEISTY: "'Palatino Linotype','Book Antiqua',Palatino,serif",
      MONT:   "'Montserrat','Arial Black','Helvetica',sans-serif",
      ROFUEGO:"'Impact','Oswald','Arial Narrow',sans-serif",
      MERIENDA:"cursive",
      RUST:   "'Courier New','Courier',monospace",
      RUBIK:  "'Rubik','Arial Rounded MT Bold',sans-serif",
      ITALIC: "Georgia,'Times New Roman',serif",
      ATOMIC: "'Impact','Arial Black',sans-serif",
      CCMOD:  "'Arial Black','Helvetica Neue',sans-serif",
      CHUNK:  "'Rockwell Extra Bold','Arial Black',serif",
      BOLD:   "'Impact','Bebas Neue','Arial Black',sans-serif",
    };
    let fontStack = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    if (layer.font) {
      if (layer.font==="SYSTEM") fontStack = FONT_CSS.SYSTEM;
      else if (FONT_CSS[layer.font]) fontStack = FONT_CSS[layer.font];
      else fontStack = layer.font;
    }
    ctx.font = `${italic}${bold} ${fontSize}px ${fontStack}`;
    ctx.textAlign = (layer.align || "center") as CanvasTextAlign;
    ctx.textBaseline = "middle";
    ctx.globalAlpha = clamp(opacity,0,1);

    const px = layer.x * W + offsetX;
    const py = layer.y * H + offsetY;
    ctx.save();
    ctx.translate(px, py);
    if (layer.rotation) ctx.rotate((layer.rotation||0)*Math.PI/180);
    ctx.scale(scale,scale);
    const anchorX = (layer.anchorX ?? 0.5);
    const anchorY = (layer.anchorY ?? 0.5);

    // Template-based styling
    const tpl = layer.template || "default";
    const eff = layer.effect || "none";
    let fill: string|CanvasGradient = layer.color || "#ffffff";
    let stroke: string|null = "rgba(0,0,0,0.95)";
    let sw = Math.max(4, fontSize/7);
    let shadow = "transparent", shadowB = 0;

    if (tpl === "default") {
      stroke = "rgba(0,0,0,0.95)"; sw = Math.max(4,fontSize/7);
    } else if (tpl === "neon") {
      fill = rgba(rgb,1); stroke = null; shadow = rgba(rgb,1); shadowB = 25+bass*18;
    } else if (tpl === "boldwhite") {
      fill="#fff"; stroke="rgba(0,0,0,0.95)"; sw=Math.max(5,fontSize/6);
    } else if (tpl === "thanks") {
      fill="#fff"; stroke="#000"; sw=Math.max(4,fontSize/9);
      const g=ctx.createLinearGradient(0,-fontSize,0,fontSize);
      g.addColorStop(0,"#ef4444");g.addColorStop(0.5,"#fff");g.addColorStop(1,"#3b82f6");
      fill = g;
    } else if (tpl === "fire") {
      fill="#fff"; stroke="#000"; sw=Math.max(4,fontSize/8);
      shadow="#ff6b00"; shadowB=20+bass*12;
    } else if (tpl === "aura") {
      fill="#fef08a"; stroke="#7c2d12"; sw=Math.max(4,fontSize/8);
      shadow="#fb923c"; shadowB=28+bass*18;
    } else if (tpl === "horror") {
      fill="#dc2626"; stroke="#000"; sw=Math.max(5,fontSize/8);
    } else if (tpl === "trendy") {
      fill="#fff"; stroke="#ef4444"; sw=Math.max(6,fontSize/7);
    } else if (tpl === "myvlog") {
      fill="#fff"; stroke="#78350f"; sw=Math.max(4,fontSize/9);
      const g=ctx.createLinearGradient(0,-fontSize,0,fontSize);
      g.addColorStop(0,"#fbbf24");g.addColorStop(0.5,"#f97316");g.addColorStop(1,"#dc2626");
      fill = g;
    } else if (tpl === "please") {
      fill="#fff"; stroke="#ec4899"; sw=Math.max(4,fontSize/9);
    }

    // ===== CAPCUT TEXT EFFECT PRESETS =====
    // Effect ini override/menambah di atas template — jadi pakai effect langsung.
    if (eff === "art-paper") {
      // Teks kertas: putih kasar dengan noise look — putih solid, outline tipis, shadow bawah lembut
      fill = "#f5f0e6"; stroke = "rgba(120,80,40,0.7)"; sw = Math.max(3,fontSize/12);
      shadow = "rgba(80,40,10,0.4)"; shadowB = 6;
    } else if (eff === "art-stroke-white") {
      // Goresan putih: tebal outline putih di atas fill transparan
      fill = "rgba(0,0,0,0)"; stroke = "#ffffff"; sw = Math.max(8,fontSize/5);
      shadow = "rgba(0,0,0,0.6)"; shadowB = 10;
    } else if (eff === "art-stroke-black") {
      fill = "rgba(255,255,255,0)"; stroke = "#000000"; sw = Math.max(8,fontSize/5);
      shadow = "rgba(0,0,0,0.4)"; shadowB = 6;
    } else if (eff === "art-blood") {
      // Merah darah: merah tua dengan shadow merah
      fill = "#8b0000"; stroke = "#2a0000"; sw = Math.max(5,fontSize/8);
      shadow = "#ff0000"; shadowB = 14+bass*8;
    } else if (eff === "art-yellow-black") {
      // Kuning outline hitam tebal (style peringatan/Thrasher)
      fill = "#fde047"; stroke = "#000000"; sw = Math.max(8,fontSize/5);
      shadow = "rgba(0,0,0,0.5)"; shadowB = 8;
    } else if (eff === "art-white-red") {
      // Putih outline merah
      fill = "#ffffff"; stroke = "#dc2626"; sw = Math.max(6,fontSize/6);
      shadow = "rgba(220,38,38,0.5)"; shadowB = 10;
    } else if (eff === "art-gold-black") {
      // Emas outline hitam dengan gradient metalik
      const g = ctx.createLinearGradient(0,-fontSize*0.6,0,fontSize*0.6);
      g.addColorStop(0,"#fff3b0"); g.addColorStop(0.3,"#fcd34d"); g.addColorStop(0.55,"#b45309");
      g.addColorStop(0.75,"#fde68a"); g.addColorStop(1,"#92400e");
      fill = g; stroke = "#000"; sw = Math.max(6,fontSize/7);
      shadow = "rgba(255,200,50,0.5)"; shadowB = 10;
    } else if (eff === "art-neon-pink") {
      fill = "#ffffff"; stroke = null;
      shadow = "#ff2d95"; shadowB = 28+bass*16;
    } else if (eff === "art-neon-red") {
      fill = "#ffffff"; stroke = null;
      shadow = "#ff0033"; shadowB = 26+bass*16;
    } else if (eff === "art-neon-blue") {
      fill = "#ffffff"; stroke = null;
      shadow = "#00e5ff"; shadowB = 26+bass*16;
    } else if (eff === "art-scratch-red") {
      // Putih goresan merah (outline merah + bayangan merah)
      fill = "#ffffff"; stroke = "#ff0033"; sw = Math.max(5,fontSize/8);
      shadow = "rgba(255,0,50,0.7)"; shadowB = 12;
    } else if (eff === "art-gradient-ko") {
      // Gradient kuning-orange-biru (Kuning→Orange→Biru)
      const g = ctx.createLinearGradient(0,-fontSize*0.6,0,fontSize*0.6);
      g.addColorStop(0,"#fde047"); g.addColorStop(0.5,"#f97316"); g.addColorStop(1,"#2563eb");
      fill = g; stroke = "rgba(0,0,0,0.9)"; sw = Math.max(5,fontSize/8);
      shadow = "rgba(0,0,0,0.5)"; shadowB = 8;
    } else if (eff === "art-3d") {
      // Teks 3D dengan extrude ke kiri-bawah
      fill = "#ffffff"; stroke = "#000000"; sw = Math.max(4,fontSize/10);
      shadow = "rgba(0,0,0,0.7)"; shadowB = 0; // shadow mati, kita pakai manual extrude
    } else if (eff === "art-chrome") {
      // Chrome metal: gradient perak
      const g = ctx.createLinearGradient(0,-fontSize*0.6,0,fontSize*0.6);
      g.addColorStop(0,"#e5e7eb"); g.addColorStop(0.3,"#ffffff"); g.addColorStop(0.45,"#9ca3af");
      g.addColorStop(0.6,"#ffffff"); g.addColorStop(0.75,"#6b7280"); g.addColorStop(1,"#d1d5db");
      fill = g; stroke = "#1f2937"; sw = Math.max(3,fontSize/12);
      shadow = "rgba(0,0,0,0.5)"; shadowB = 6;
    } else if (eff === "art-glitter") {
      // Glitter pink: putih dengan glow pink tebal
      fill = "#ffffff"; stroke = null;
      shadow = "#ec4899"; shadowB = 30+bass*20;
    } else if (eff === "art-sparkle") {
      // Sparkle cyan: putih glow cyan
      fill = "#ffffff"; stroke = null;
      shadow = "#22d3ee"; shadowB = 30+bass*18;
    } else if (eff === "art-glitch") {
      // Glitch RGB split effect
      fill = "#ffffff"; stroke = null;
      shadow = "rgba(0,0,0,0.7)"; shadowB = 0;
    }

    // Override dengan color custom (hanya kalau user belum pilih effect dan pakai default template)
    if (layer.color && tpl==="default" && eff==="none") fill = layer.color;
    if (layer.strokeColor && eff==="none") { stroke = layer.strokeColor; sw = layer.strokeWidth ? Math.max(1,layer.strokeWidth*fontSize) : Math.max(4,fontSize/7); }
    if (layer.shadowColor && eff==="none") { shadow = layer.shadowColor; shadowB = layer.shadowBlur || 15; }

    // Multi-line wrap
    const text = layer.text;
    const maxW = W*0.92;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    words.forEach(w=>{
      const t2 = cur?cur+" "+w:w;
      if (ctx.measureText(t2).width > maxW && cur) { lines.push(cur); cur=w; } else cur=t2;
    });
    if (cur) lines.push(cur);
    const lh = fontSize*1.2;
    const totalH = lines.length*lh;
    const startY = -totalH*anchorY;

    ctx.shadowColor = shadow;
    ctx.shadowBlur = shadowB;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    // Render per-line
    lines.forEach((line, li)=>{
      let renderText = line;
      if (tpl === "typewriter" || layer.animIn === "typewriter") {
        const chars = Math.max(0, Math.floor(line.length * letterClip));
        renderText = line.slice(0, chars);
      }
      const y = startY + li*lh + lh/2;

      // ===== SPECIAL EFFECTS: 3D extrude =====
      if (eff === "art-3d") {
        const depth = Math.max(4, fontSize/12);
        ctx.save();
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        for (let d=depth; d>=2; d-=2) {
          ctx.fillStyle = "#374151";
          ctx.fillText(renderText, d, y+d);
        }
        for (let d=depth; d>=2; d-=2) {
          ctx.fillStyle = "#6b7280";
          ctx.fillText(renderText, d*0.5, y+d*0.5);
        }
        ctx.restore();
      }

      // ===== SPECIAL EFFECTS: Glitch RGB split =====
      if (eff === "art-glitch") {
        const off = Math.sin(time*20)*3 + 2;
        ctx.save();
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = "rgba(255,0,80,0.9)";
        ctx.fillText(renderText, -off, y);
        ctx.fillStyle = "rgba(0,229,255,0.9)";
        ctx.fillText(renderText, off, y);
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }

      // Neon multi-layer glow untuk art-neon-* dan art-glitter/sparkle
      if (eff === "art-neon-pink" || eff === "art-neon-red" || eff === "art-neon-blue" || eff === "art-glitter" || eff === "art-sparkle") {
        ctx.save();
        ctx.shadowColor = shadow; ctx.shadowBlur = shadowB;
        ctx.fillStyle = fill as any;
        ctx.fillText(renderText, 0, y);
        // double-stroke glow
        ctx.shadowBlur = shadowB*1.8;
        ctx.fillText(renderText, 0, y);
        ctx.shadowBlur = shadowB*2.5;
        ctx.globalAlpha = 0.7;
        ctx.fillText(renderText, 0, y);
        ctx.restore();
        ctx.shadowColor = shadow; ctx.shadowBlur = shadowB;
        // skip stroke
      } else {
        if (stroke && sw>0) {
          ctx.strokeStyle = stroke; ctx.lineWidth = sw;
          ctx.strokeText(renderText, 0, y);
        }
        ctx.fillStyle = fill as any;
        ctx.fillText(renderText, 0, y);
      }
    });
    ctx.restore();
  });
  ctx.restore();
}

// ===== Spectrum Sticker (subscribe/like/bell/fire/disc/wave/circle) =====
function drawSpectrumSticker(ctx: CanvasRenderingContext2D, s: DrawState) {
  if (!s.spectrumSticker || s.spectrumSticker==="none" || s.spectrumSticker==="bars-bottom") {
    // bars-bottom sudah di-handle di drawSpectrum()
    return;
  }
  const { W, H, time, rgb, bass, beat } = s;
  ctx.save();
  ctx.filter = "none";
  const sticker = s.spectrumSticker;
  if (sticker==="subscribe") {
    // 👍 SUBSCRIBE 🔴 lonceng di pojok kiri atas (mirip YouTube)
    const boxW = Math.floor(W*0.28);
    const boxH = Math.floor(boxW*0.28);
    const pad = W*0.03;
    const x=pad, y=pad;
    ctx.save();
    // bg thumb
    ctx.fillStyle="rgba(0,0,0,0.5)";
    roundRect(ctx,x,y+boxH*0.1,boxH*0.9,boxH*0.9,boxH*0.2); ctx.fill();
    ctx.fillStyle="#fff";
    ctx.font=`900 ${Math.floor(boxH*0.65)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("👍", x+boxH*0.45, y+boxH*0.6);
    // bg subscribe
    roundRect(ctx,x+boxH+pad*0.3,y,boxW-boxH-pad*0.3,boxH,boxH*0.15);
    ctx.fillStyle="#cc0000"; ctx.fill();
    ctx.fillStyle="#fff";
    ctx.font=`900 ${Math.floor(boxH*0.45)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("SUBSCRIBE",x+boxH+(boxW-boxH-pad*0.3)/2,y+boxH*0.5);
    // bell
    ctx.fillStyle="rgba(0,0,0,0.5)";
    roundRect(ctx,x+boxW+pad*0.2,y+boxH*0.1,boxH*0.8,boxH*0.8,boxH*0.15); ctx.fill();
    ctx.font=`900 ${Math.floor(boxH*0.55)}px sans-serif`;
    ctx.fillText("🔔",x+boxW+pad*0.2+boxH*0.4,y+boxH*0.55);
    ctx.restore();
  } else if (sticker==="like") {
    const size = Math.floor(Math.min(W,H)*0.12);
    const x=W-size-20, y=20+size*0.2;
    ctx.fillStyle="rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2); ctx.fill();
    ctx.font=`900 ${Math.floor(size*0.6)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("👍", x+size/2, y+size/2);
    // count
    ctx.fillStyle="rgba(0,0,0,0.5)";
    roundRect(ctx,x-size*0.3,y+size+size*0.15,size*1.6,size*0.35,size*0.1); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`700 ${Math.floor(size*0.22)}px sans-serif`;
    ctx.fillText("1.2M",x+size/2,y+size+size*0.32);
  } else if (sticker==="bell") {
    const size = Math.floor(Math.min(W,H)*0.1);
    ctx.fillStyle="rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.arc(W-size-20,size+10,size/2,0,Math.PI*2); ctx.fill();
    ctx.font=`900 ${Math.floor(size*0.6)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("🔔", W-size-20, size+10);
  } else if (sticker==="fire") {
    const pad=20, bw=Math.floor(W*0.2), bh=Math.floor(bw*0.32);
    ctx.save();
    const g=ctx.createLinearGradient(pad,pad,pad+bw,pad+bh);
    g.addColorStop(0,"#f97316");g.addColorStop(1,"#ef4444");
    ctx.fillStyle=g;
    roundRect(ctx,pad,pad,bw,bh,bh*0.3); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`900 ${Math.floor(bh*0.5)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("🔥 FYP", pad+bw/2, pad+bh*0.55);
    ctx.restore();
  } else if (sticker==="disc") {
    // Vinyl disc berputar di pojok
    const size = Math.floor(Math.min(W,H)*0.16);
    const cx = W-size-30, cy = H*0.2;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(time*1.5);
    const rg=ctx.createRadialGradient(0,0,size*0.1,0,0,size*0.5);
    rg.addColorStop(0,"#1f2937"); rg.addColorStop(0.4,"#000"); rg.addColorStop(0.5,"#374151"); rg.addColorStop(1,"#000");
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(0,0,size*0.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=rgba(s.rgb,1); ctx.beginPath(); ctx.arc(0,0,size*0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(0,0,size*0.03,0,Math.PI*2); ctx.fill();
    ctx.restore();
  } else if (sticker==="wave-center" || sticker==="wave-bottom") {
    // Wave line di tengah/bawah
    const n=80;
    const baseY = sticker==="wave-center" ? H*0.55 : H*0.9;
    const maxA = H*0.05*(0.3+bass*2);
    ctx.save();
    ctx.strokeStyle=rgba(s.rgb,1); ctx.lineWidth=3; ctx.shadowColor=rgba(s.rgb,0.8); ctx.shadowBlur=12;
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const x = (i/n)*W;
      const v = Math.sin(i*0.3 + time*6)*maxA + Math.sin(i*0.7+time*2)*maxA*0.4;
      if(i===0)ctx.moveTo(x,baseY+v); else ctx.lineTo(x,baseY+v);
    }
    ctx.stroke();
    ctx.restore();
  } else if (sticker==="circle") {
    // Ring circle kecil di kiri atas
    const cx = W*0.12, cy = H*0.18;
    ctx.save();
    ctx.strokeStyle=rgba(s.rgb,1); ctx.lineWidth=3; ctx.shadowColor=rgba(s.rgb,0.9); ctx.shadowBlur=18;
    for(let r=0;r<3;r++){
      ctx.globalAlpha=0.4+r*0.2;
      ctx.beginPath(); ctx.arc(cx,cy,20+r*8+bass*15,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  } else if (sticker==="wave") {
    ctx.save();
    ctx.strokeStyle=rgba(s.rgb,1); ctx.lineWidth=3; ctx.shadowColor=rgba(s.rgb,0.8); ctx.shadowBlur=15;
    const n=60, cy=H*0.78;
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const x = W*0.05 + (i/n)*W*0.9;
      const v = Math.sin(i*0.5+time*8)*H*0.03*(0.5+bass);
      if(i===0)ctx.moveTo(x,cy+v); else ctx.lineTo(x,cy+v);
    }
    ctx.stroke();
    ctx.restore();
  } else if (sticker==="bars-top") {
    const nb=36, bw=W*0.9/nb*0.7, by=H*0.06, maxH=H*0.06;
    ctx.fillStyle=rgba(s.rgb,0.9); ctx.shadowColor=rgba(s.rgb,0.8); ctx.shadowBlur=10;
    for(let i=0;i<nb;i++){
      const v=0.2+Math.sin(i*0.3+time*4)*0.3+bass*0.8;
      const h=v*maxH;
      ctx.fillRect(W*0.05+i*(bw+W*0.9/nb*0.3),by+maxH-h,bw,h);
    }
  } else if (sticker==="diamond") {
    const cx=W*0.5, cy=H*0.15;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/4 + time*0.5);
    const sz=14+bass*12;
    ctx.fillStyle=rgba(s.rgb,1); ctx.shadowColor=rgba(s.rgb,0.9); ctx.shadowBlur=20;
    ctx.fillRect(-sz,-sz,sz*2,sz*2);
    ctx.restore();
  } else if (sticker==="subscribed") {
    const pad=W*0.03, bw=Math.floor(W*0.26), bh=Math.floor(bw*0.28);
    ctx.save();
    ctx.fillStyle="rgba(120,120,120,0.95)";
    roundRect(ctx,pad,pad,bw,bh,bh*0.2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`900 ${Math.floor(bh*0.48)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("✓ SUBSCRIBED",pad+bw/2,pad+bh*0.52);
    ctx.restore();
  } else if (sticker==="headphones") {
    const size=Math.floor(Math.min(W,H)*0.14);
    const cx=W-size-20, cy=20+size*0.3;
    ctx.save();
    const rg=ctx.createLinearGradient(cx-size/2,cy-size/2,cx+size/2,cy+size/2);
    rg.addColorStop(0,"#ec4899"); rg.addColorStop(1,"#f97316");
    ctx.fillStyle=rg; ctx.shadowColor="rgba(236,72,153,0.7)"; ctx.shadowBlur=14+bass*10;
    ctx.beginPath(); ctx.arc(cx,cy,size/2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`900 ${Math.floor(size*0.6)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.shadowBlur=0;
    ctx.fillText("🎧",cx,cy+2);
    ctx.restore();
  } else if (sticker==="play") {
    const size=Math.floor(Math.min(W,H)*0.1);
    const cx=W*0.85, cy=H*0.18;
    ctx.save();
    ctx.fillStyle="#fff"; ctx.shadowColor="rgba(0,0,0,0.5)"; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(cx,cy,size/2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#000"; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(cx-size*0.15,cy-size*0.2); ctx.lineTo(cx+size*0.22,cy); ctx.lineTo(cx-size*0.15,cy+size*0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (sticker==="fyp-text") {
    const pad=W*0.04, bw=Math.floor(W*0.24), bh=Math.floor(bw*0.38);
    ctx.save();
    const rg=ctx.createLinearGradient(pad,pad,pad+bw,pad+bh);
    rg.addColorStop(0,"#8b5cf6"); rg.addColorStop(1,"#ec4899");
    ctx.fillStyle=rg; ctx.shadowColor="rgba(139,92,246,0.7)"; ctx.shadowBlur=12+bass*8;
    roundRect(ctx,pad,pad+bh+10,bw,bh,bh*0.2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`900 ${Math.floor(bh*0.55)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.shadowBlur=0;
    ctx.fillText("#FYP",pad+bw/2,pad+bh*0.5+bh+10);
    ctx.restore();
  } else if (sticker==="nowplaying") {
    const pad=W*0.04, bw=Math.floor(W*0.4), bh=Math.floor(W*0.08);
    const y=H-bh-W*0.04;
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,0.7)";
    roundRect(ctx,pad,y,bw,bh,bh*0.3); ctx.fill();
    ctx.fillStyle="#22d3ee"; ctx.font=`900 ${Math.floor(bh*0.5)}px sans-serif`;
    ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.shadowColor="rgba(34,211,238,0.8)"; ctx.shadowBlur=10;
    ctx.fillText("▶ NOW PLAYING",pad+bh*0.4,y+bh*0.5);
    ctx.restore();
  } else if (sticker==="mymusic") {
    const pad=W*0.04, bw=Math.floor(W*0.32), bh=Math.floor(W*0.11);
    const y=H*0.12;
    ctx.save();
    const rg=ctx.createLinearGradient(pad,y,pad+bw,y+bh);
    rg.addColorStop(0,"#ec4899"); rg.addColorStop(1,"#a855f7");
    ctx.fillStyle=rg; ctx.shadowColor="rgba(236,72,153,0.7)"; ctx.shadowBlur=14;
    roundRect(ctx,pad,y,bw,bh,bh*0.25); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font=`900 ${Math.floor(bh*0.5)}px sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.shadowBlur=0;
    ctx.fillText("♪ MY MUSIC",pad+bw/2,y+bh*0.52);
    ctx.restore();
  } else if (sticker==="glow-ring") {
    const cx=W/2, cy=H*0.12;
    ctx.save();
    ctx.strokeStyle=rgba(s.rgb,1); ctx.lineWidth=4; ctx.shadowColor=rgba(s.rgb,0.9); ctx.shadowBlur=24+bass*16;
    for (let k=0;k<2;k++){
      ctx.globalAlpha=0.7-k*0.3;
      ctx.beginPath(); ctx.arc(cx,cy,18+k*10+bass*18,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ====== SPECTRUM PREVIEW HELPERS (digunakan juga oleh live preview di page/studio) ======
function hexToRgbFromHex(hex:string):[number,number,number]{ const [r,g,b]=hexToRgb(hex); return [r,g,b]; }
function drawSpectrum(ctx:CanvasRenderingContext2D, s:DrawState){
  drawLiveSpectrum(ctx,{W:s.W,H:s.H,bars:s.bars as any,bass:s.bass,beat:s.beat,style:s.style,rgb:s.rgb,isMobile:s.W<=900,phase:s.phase,barFill:rgba(s.rgb,0.95)});
}

// Legacy alias
export function drawPreviewSpectrum(ctx:CanvasRenderingContext2D, opts:any){ drawLiveSpectrum(ctx,opts); }

export function drawLiveSpectrum(ctx: CanvasRenderingContext2D, opts: {W:number;H:number;bars:Float32Array|Uint8Array|number[];bass:number;beat:boolean;style:string;rgb:[number,number,number];isMobile?:boolean;phase?:number;barFill?:string}) {
  const {W,H,bars,bass,beat,style,rgb} = opts;
  const isMobile = opts.isMobile ?? (W<=900);
  const phase = opts.phase ?? 0;
  const glow = isMobile ? 12 : 24;
  ctx.save();
  ctx.shadowBlur = glow;
  ctx.shadowColor = rgba(rgb,1);
  const barFill = opts.barFill || rgba(rgb,0.95);

  if (style==="luxury"||style==="bars") {
    const nBars = isMobile ? Math.min(bars.length, 40) : bars.length;
    const step = bars.length / nBars;
    const barW = W/nBars*0.75, gap=W/nBars*0.25, maxH=H*0.32;
    ctx.fillStyle = barFill;
    ctx.beginPath(); // Start a single path to combine all rectangles
    for (let i=0;i<nBars;i++){
      // Ambil nilai max dari sekelompok bar (downsample untuk mobile)
      const bi = Math.floor(i*step);
      let v = (bars as any)[bi]||0;
      if (isMobile) {
        const end = Math.min(bars.length, bi+Math.ceil(step));
        for (let j=bi;j<end;j++) if (bars[j]>v) v=bars[j];
      }
      const h = v*maxH, x=i*(barW+gap)+gap/2, y=H-h-4;
      ctx.rect(x,y,barW,h); // Add rectangle to combined path
    }
    ctx.fill(); // Fill all rectangles in a single call (massive performance boost!)
    // Reflection di bawah (satu rect solid alpha rendah — bukan mirror per-bar)
    if (false && !isMobile) {
      ctx.save(); ctx.globalAlpha=0.18; ctx.scale(1,-0.3);
      ctx.fillStyle = barFill;
      for (let i=0;i<bars.length;i++){
        const v=(bars as any)[i]; if(!v) continue;
        const h=v*maxH, x=i*(barW+gap)+gap/2;
        ctx.fillRect(x,-H+4,barW,h*0.4);
      }
      ctx.restore();
    }
    if (style==="luxury"){
      const pulse = 1+bass*0.3;
      const r = Math.min(W,H)*(isMobile?0.055:0.07)*pulse;
      ctx.save(); ctx.translate(W/2,H*0.28);
      // Kurangi ring dari 3→1 di mobile, hilangkan setLineDash (mahal)
      ctx.shadowBlur=isMobile?20:40; ctx.shadowColor=rgba(rgb,1);
      const ringCount = isMobile?1:3;
      for (let k=0;k<ringCount;k++){
        ctx.strokeStyle=rgba(rgb,0.35); ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,r+k*(isMobile?14:18)+(beat?4:0),0,Math.PI*2); ctx.stroke();
      }
      const cg=ctx.createRadialGradient(0,0,0,0,0,r);
      cg.addColorStop(0,"rgba(255,255,255,0.9)"); cg.addColorStop(0.6,rgba(rgb,0.7)); cg.addColorStop(1,rgba(rgb,0.1));
      ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#fff";
      ctx.font=`${r}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("♪",0,2);
      ctx.restore();
      // Particles: kurangi 6→3 di mobile 
    }
  }
  else if (style==="circle"){
    ctx.save(); ctx.translate(W/2,H*0.35); ctx.rotate(phase*0.2);
    const r0=Math.min(W,H)*0.09;
    ctx.strokeStyle=rgba(rgb,0.8); ctx.lineWidth=3; ctx.beginPath();
    for (let i=0;i<bars.length*2;i++){
      const a=(i/(bars.length*2))*Math.PI*2;
      const bi=i%bars.length;
      const rr=r0+(bars as any)[bi]*(Math.min(W,H)*0.35);
      const x=Math.cos(a)*rr, y=Math.sin(a)*rr;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.stroke();
    const cg=ctx.createRadialGradient(0,0,r0*0.5,0,0,r0);
    cg.addColorStop(0,rgba(rgb,0.8)); cg.addColorStop(1,rgba(rgb,0));
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(0,0,r0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  else if (style==="trapnation"){
    ctx.save(); ctx.translate(W/2,H*0.32);
    const R=Math.min(W,H)*0.1*(1+bass*0.3);
    ctx.rotate(-phase*0.8);
    for (let ring=0;ring<2;ring++){
      ctx.strokeStyle=rgba(rgb,0.6-ring*0.2); ctx.lineWidth=2; ctx.beginPath();
      for (let i=0;i<bars.length;i++){
        const a=(i/bars.length)*Math.PI*2;
        const rr=R+ring*20+(bars as any)[i]*Math.min(W,H)*0.3;
        const x=Math.cos(a)*rr,y=Math.sin(a)*rr;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.rotate(phase*0.8);
    ctx.fillStyle="#fff"; ctx.shadowBlur=30;
    ctx.beginPath(); ctx.arc(0,0,R*0.6,0,Math.PI*2); ctx.fill();
    ctx.restore();
    const barW=W/bars.length*0.6,gap=W/bars.length*0.4;
    for(let i=0;i<bars.length;i++){
      const h=(bars as any)[i]*H*0.2;
      ctx.fillStyle=rgba(rgb,0.9);
      roundRect(ctx,i*(barW+gap)+gap/2,H-h-4,barW,h,2); ctx.fill();
    }
  }
  else if (style==="monstercat"){
    ctx.save(); ctx.translate(W/2,H*0.35);
    for(let i=0;i<bars.length;i++){
      const a=(i/bars.length)*Math.PI*2-Math.PI/2;
      const rr=Math.min(W,H)*0.15+(bars as any)[i]*Math.min(W,H)*0.3;
      ctx.fillStyle=rgba(rgb,0.9);
      ctx.beginPath(); ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr,2+(bars as any)[i]*8,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  else if (style==="proximity"){
    const nb=bars.length, barW=(W*0.8)/nb*0.8;
    for(let i=0;i<nb;i++){
      const v=(bars as any)[i], h=v*H*0.3, x=W/2+(i-nb/2)*(barW+3);
      ctx.fillStyle=rgba(rgb,0.85);
      roundRect(ctx,x-barW/2,H-h-8,barW,h,barW/2); ctx.fill();
      roundRect(ctx,x-barW/2,8,barW,h*0.5,barW/2); ctx.fill();
    }
  }
  else if (style==="retrowave"){
    ctx.save();
    const sunY=H*0.5, sunR=Math.min(W,H)*0.18;
    const sg=ctx.createLinearGradient(0,sunY-sunR,0,sunY+sunR);
    sg.addColorStop(0,rgba(rgb,1)); sg.addColorStop(1,"rgba(255,120,60,0.6)");
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(W/2,sunY,sunR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=rgba(rgb,0.4+bass*0.4); ctx.lineWidth=1;
    for(let i=0;i<12;i++){const yy=H*0.6+(i/12)*H*0.35; ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke();}
    for(let i=-10;i<=10;i++){const x=W/2+i*W*0.08; ctx.beginPath();ctx.moveTo(W/2,H*0.6);ctx.lineTo(x,H);ctx.stroke();}
    ctx.restore();
    const barW=W/bars.length*0.75;
    for(let i=0;i<bars.length;i++){const h=(bars as any)[i]*H*0.2; ctx.fillStyle=rgba(rgb,0.9); roundRect(ctx,i*(barW+W/bars.length*0.25)+W/bars.length*0.12,H-h-4,barW,h,2);ctx.fill();}
  }
  else if (style==="dubstep"){
    const barW=W/bars.length*0.6,gap=W/bars.length*0.4,cy=H/2;
    for(let i=0;i<bars.length;i++){
      const h=(bars as any)[i]*H*0.5, x=i*(barW+gap)+gap/2;
      const g=ctx.createLinearGradient(0,cy-h/2,0,cy+h/2);
      g.addColorStop(0,"rgba(255,255,255,0.9)");g.addColorStop(0.5,rgba(rgb,1));g.addColorStop(1,"rgba(255,255,255,0.2)");
      ctx.fillStyle=g; roundRect(ctx,x,cy-h/2,barW,h,barW*0.3);ctx.fill();
    }
  }
  else if (style==="tunnel"){
    ctx.save(); ctx.translate(W/2,H*0.4);
    const rings=12;
    for(let i=rings-1;i>=0;i--){
      const k=(i+(phase*2)%1)/rings, sz=k*Math.min(W,H)*0.8;
      ctx.strokeStyle=rgba(rgb,0.2+(1-k)*0.5); ctx.lineWidth=2;
      ctx.strokeRect(-sz/2,-sz*9/16/2,sz,sz*9/16);
    }
    ctx.restore();
  }
  else if (style==="particles"){
     
  }
  // ===== SPECTRUM BARU (CapCut-style) =====
  else if (style==="wave"){
    const n=80, cy=H*0.82;
    ctx.save();
    ctx.strokeStyle=rgba(rgb,0.95); ctx.lineWidth=3; ctx.shadowBlur=14; ctx.shadowColor=rgba(rgb,0.8);
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const x=(i/n)*W;
      const bi=Math.floor((i/n)*bars.length);
      const v=(bars as any)[bi]||0;
      const maxA=Math.max(4, v*H*0.12*(0.5+bass*1.2)) + Math.sin(phase*2+i*0.25)*H*0.005;
      if(i===0) ctx.moveTo(x,cy-maxA); else ctx.lineTo(x,cy-maxA);
    }
    ctx.stroke();
    ctx.globalAlpha=0.25; ctx.lineTo(W,cy); ctx.lineTo(0,cy); ctx.closePath();
    ctx.fillStyle=rgba(rgb,0.5); ctx.fill();
    ctx.restore();
  }
  else if (style==="radial-bars"){
    const cx=W/2, cy=H*0.35, n=Math.min(bars.length, isMobile?36:60), r0=Math.min(W,H)*0.08;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(phase*0.4);
    ctx.fillStyle=rgba(rgb,0.9); ctx.shadowBlur=12; ctx.shadowColor=rgba(rgb,0.8);
    for(let i=0;i<n;i++){
      const a=(i/n)*Math.PI*2;
      const bi=Math.floor((i/n)*bars.length);
      const v=(bars as any)[bi]||0;
      const len=r0 + v*Math.min(W,H)*0.3;
      const lw=Math.max(2, Math.min(W,H)*0.008);
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(-lw/2,-len,lw,len-r0);
      ctx.restore();
    }
    ctx.shadowBlur=20+bass*14;
    ctx.beginPath(); ctx.arc(0,0,r0*0.6+bass*6,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  else if (style==="equalizer"){
    const nb=isMobile?24:40, bw=W*0.85/nb*0.85, by=H-10, maxH=H*0.28;
    ctx.save();
    for(let i=0;i<nb;i++){
      const bi=Math.floor((i/nb)*bars.length);
      const v=(bars as any)[bi]||0;
      const h=Math.max(3,v*maxH);
      const p=v;
      const r=Math.floor(p>0.6?255:(p>0.3?255:60+195*p*1.6));
      const g=Math.floor(p<0.3?220:(p<0.7?220-(p-0.3)*550:Math.max(0,220-(p-0.3)*550)));
      ctx.fillStyle=`rgba(${r|0},${g|0},40,0.95)`;
      ctx.fillRect(W*0.075+i*(bw+W*0.85/nb*0.15),by-h,bw,h);
    }
    ctx.restore();
  }
  else if (style==="pulse"){
    const cx=W/2, cy=H*0.3;
    ctx.save();
    for(let k=0;k<3;k++){
      const rr=Math.min(W,H)*0.08 + k*18 + bass*50;
      ctx.strokeStyle=rgba(rgb,0.5-k*0.15); ctx.lineWidth=3-k*0.5;
      ctx.shadowBlur=18+bass*18; ctx.shadowColor=rgba(rgb,0.9);
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle=rgba(rgb,0.95);
    ctx.beginPath(); ctx.arc(cx,cy,Math.min(W,H)*0.05+bass*14,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  else if (style==="minimal"){
    const nd=isMobile?20:40, by=H-20;
    ctx.save(); ctx.fillStyle=rgba(rgb,0.85);
    for(let i=0;i<nd;i++){
      const bi=Math.floor((i/nd)*bars.length);
      const v=(bars as any)[bi]||0;
      const rr=1.5+v*7;
      ctx.beginPath();
      ctx.arc(W*0.1+i*(W*0.8/(nd-1)),by-2-v*H*0.05,rr,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
  else if (style==="bars-top"){
    const nBars=isMobile?Math.min(bars.length,30):bars.length;
    const step=bars.length/nBars;
    const barW=W/nBars*0.6,gap=W/nBars*0.4,maxH=H*0.12;
    ctx.save(); ctx.fillStyle=rgba(rgb,0.9); ctx.shadowBlur=10; ctx.shadowColor=rgba(rgb,0.8);
    for(let i=0;i<nBars;i++){
      const bi=Math.floor(i*step);
      let v=(bars as any)[bi]||0;
      if(isMobile){const end=Math.min(bars.length,bi+Math.ceil(step));for(let j=bi;j<end;j++)if(bars[j]>v)v=bars[j];}
      const h=v*maxH, x=i*(barW+gap)+gap/2, y=4;
      ctx.fillRect(x,y,barW,h);
    }
    ctx.restore();
  }
  else if (style==="none"){
    // tanpa spectrum
  }
  // NOTE: particles stateful diurus di drawFrame utama (bukan di drawLiveSpectrum)
  ctx.restore();
}

function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function supportsWebCodecs(){
  // v8.1.1: JANGAN cek window.Mp4Muxer — modul diimpor via import() dan TIDAK pernah
  // menempel di window. Cek itu dulu biang "mesin cadangan terus": selalu false!
  return typeof(window as any).VideoEncoder!=="undefined"
    && typeof(window as any).VideoFrame!=="undefined"
    && typeof(window as any).AudioData!=="undefined";
}

// ===== Build captions dari array baris lirik (distribusi MERATA ke SELURUH durasi audio/slides)
// Ini penting biar karaoke selesai PAS di akhir lagu, bukan tiap slide kecepatan sendiri.
function buildCaptionsFromLyrics(lyrics: string[], totalDur:number, leadIn:number=1.2): CaptionWord[] {
  const out: CaptionWord[] = [];
  // Bersihkan & gabung semua baris jadi satu list kata, + tandai baris
  interface Tok { text:string; baris:number; }
  const tokens: Tok[] = [];
  let curLine = 0;
  for (let i=0;i<lyrics.length;i++){
    const line = (lyrics[i]||"").trim();
    if (!line) continue;
    // Bersihkan marker [Verse], [Chorus] dll — jangan dinyanyikan
    let cleaned = line.replace(/^\[(Intro|Verse|Chorus|Bridge|Outro|Pre-Chorus|Refrain|Hook|Interlude)[^\]]*\]\s*/i,"");
    if (!cleaned.trim()) continue;
    const words = cleaned.split(/\s+/).filter(Boolean);
    words.forEach(w => tokens.push({text:w, baris:curLine}));
    curLine++;
  }
  if (!tokens.length) return out;
  const lyricStart = leadIn;
  const lyricEnd = Math.max(lyricStart+1, totalDur - 0.8);
  const avail = lyricEnd - lyricStart;
  // Beri bobot per kata: panjang char
  const totalWeight = tokens.reduce((s,t)=>s + Math.max(1, t.text.replace(/[.,!?;:'"\-]/g,"").length*0.7 + 1), 0);
  let cursor = lyricStart;
  tokens.forEach((t)=>{
    const w = Math.max(0.22, (Math.max(1,t.text.replace(/[.,!?;:'"\-]/g,"").length*0.7+1)/totalWeight)*avail);
    out.push({ text:t.text, start:cursor, end:cursor+w*0.9, line:t.baris });
    cursor += w;
  });
  // Pastikan kata terakhir end-nya pas di akhir
  if (out.length) out[out.length-1].end = lyricEnd;
  return out;
}

// ===== MAIN EXPORT =====
export async function renderSlideshow(opts: RenderOptions): Promise<Blob> {
  const { images, audioUrl, slideDuration, vizStyle, vizColor, title, quality, mobileOptimized,
    transition, onProgress, onStage, ratio, aspectRatio, captions, captionStyle } = opts;
  if (!images.length) throw new Error("Tidak ada gambar");
  const baseProf = QUALITY_PROFILES[quality]||QUALITY_PROFILES.fast;
  const prof: typeof baseProf = opts.custom
    ? { ...baseProf, w: opts.custom.w, h: opts.custom.h, fps: opts.custom.fps, videoBitrate: opts.custom.videoBitrate }
    : baseProf;
  const { w:rW, h:rH } = applyRatio(prof, ratio||aspectRatio||"16:9");
  // v6: mode latar belakang (cover/blur/warna) dipakai drawBase di semua painter
  setDrawBg(opts.bgMode || "color", opts.bgColor || "#000000");
  // v8.1: ketajaman sekarang DI-BAKE ke tiap gambar SEKALI di prepareImages (sharpenCanvas).
  // Filter SVG url(#vsharp) lama DIHAPUS — per-frame convolve itu SANGAT BERAT (ramea mengeluh
  // render siput) dan di beberapa browser HP filter url() menggagalkan drawImage → VIDEO HITAM.
  // v8.8: STOPWATCH tiap fase — biar ketahuan di mana detik terbuang (tampil di layar ekspor)
  const __tp = () => performance.now();
  const prepT: Record<string, number> = { gambar: 0, audio: 0, spektrum: 0 };
  const canvas = document.createElement("canvas");
  canvas.width = rW; canvas.height = rH;
  const ctx = canvas.getContext("2d",{alpha:false,desynchronized:true})!;
  onStage?.("Menyiapkan aset...");
  let __m = __tp();
  const imgs = await prepareImages(images, rW, rH, onStage, !!opts.sharpen);
  prepT.gambar = __tp() - __m;
  // 🎬 v11.8: siapkan klip video AI (opsional — tanpa field videos = slideshow murni seperti biasa)
  const vidMap = await prepareVideos(opts.videos || [], rW, rH, imgs, onStage);
  // v6: preload gambar stiker (overlay foto) supaya tergambar di export
  try {
    const stickerUrls: string[] = [];
    (opts.slideOpts || []).forEach(o => (o?.stickers || []).forEach(st => { if ((st as any).img) stickerUrls.push((st as any).img); }));
    if (stickerUrls.length) { onStage?.("Memuat stiker overlay..."); await preloadStickerImages([...new Set(stickerUrls)]); }
  } catch {}

  let logoImg: HTMLImageElement|null = null;
  if (opts.logoUrl && opts.logoPosition!=="none"){
    try{ logoImg = await loadImage(opts.logoUrl); }catch{logoImg=null;}
  }

  let audio: {data:Float32Array;sampleRate:number;duration:number}|null = null;
  __m = __tp();
  if (audioUrl) audio = await decodeAudio(audioUrl, onStage);
  prepT.audio = __tp() - __m;

  const slideDur = Math.max(1, slideDuration);
  // 🩹 v15.6 TRANSISI LEBIH HALUS: Tingkatkan durasi transisi bawaan di HP dari 0.5s menjadi 0.7s agar efek larut (dissolve/fade) terasa jauh lebih anggun dan sinematik.
  const transDur = clamp(opts.transitionDuration??(mobileOptimized?0.7:0.8),0,slideDur*0.6);
  const perSlide = slideDur+transDur;

  // ===== v5: timeline per-klip (durasi & transisi beda tiap slide) =====
  let timeline: Timeline | null = null;
  const slideOpts = (opts.slideOpts && opts.slideOpts.length === imgs.length) ? opts.slideOpts : null;
  if (slideOpts) {
    const durs = slideOpts.map(o => Math.max(0.4, (o?.dur ?? slideDur) / Math.max(0.25, o?.speed || 1)));
    const tdurs = slideOpts.map((o, i) => {
      if (i >= slideOpts.length - 1) return 0;
      if (canonicalTrans(o?.trans ?? (transition || "dissolve")) === "none") return 0;
      return clamp(o?.transDur ?? transDur, 0.15, durs[i] * 0.9);
    });
    const tids = slideOpts.map(o => canonicalTrans(o?.trans ?? (transition || "dissolve")));
    timeline = buildTimeline(durs, tdurs, tids);
    // isi transId canonical balik supaya painter konsisten
    slideOpts.forEach((o, i) => { if (o) o.trans = tids[i]; });
  }
  const clipsTotal = timeline ? timeline.total : imgs.length*slideDur+transDur;
  // 🩹 v16.1 OPTIMASI DURASI SUTRADARA: Kita kembalikan totalDur mengikuti panjang musik penuh
  // agar seluruh lirik & alur lagu ter-sync secara presisi 100% tanpa terpotong di tengah jalan.
  // Berkat optimasi Seek-Skip & Freeze-on-End baru kita, frame beku di penghujung tidak lagi memakan waktu render,
  // sehingga video 6 menit penuh kini bisa di-render secepat kilat (wus-wus) tanpa risiko OOM / crash!
  const totalDur = Math.max(audio?.duration||0, clipsTotal);

  // Warning: jika musik lebih pendek dari total slide (tanpa TTS)
  if (audio && audio.duration < totalDur - 0.5) {
    onStage?.(`⚠️ Musik (${audio.duration.toFixed(0)}d) lebih pendek dari durasi video (${totalDur.toFixed(0)}d). Akhir video akan hening.`);
    await new Promise(r=>setTimeout(r,800));
  }

  const fps = prof.fps;
  const totalFrames = Math.floor(totalDur*fps);
  const rgb = hexToRgb(vizColor);

  // ===== PRE-COMPUTE SPECTRUM TABLE (boost besar) =====
  onStage2 = onStage || null;
  __m = __tp();
  const spec = precomputeSpectrum(audio?.data||null, audio?.sampleRate||44100, totalFrames, fps, prof.bars);
  prepT.spektrum = __tp() - __m;
  onStage2 = null;
  onStage?.(`⏱ Siap: gambar ${(prepT.gambar/1000).toFixed(1)}d · audio ${(prepT.audio/1000).toFixed(1)}d · spektrum ${(prepT.spektrum/1000).toFixed(1)}d`);

  // Build captions (distribusi sepanjang durasi audio total — LEBIH AKURAT)
  let finalCaptions: CaptionWord[] = [];
  let capStyle: CaptionStyle = captionStyle || "capcut";
  if (captions && captions.length) finalCaptions = captions;
  else if (opts.lyrics?.length && opts.showLyrics) {
    finalCaptions = timeline
      ? captionsFromClips(opts.lyrics, timeline) as CaptionWord[]
      : buildCaptionsFromLyrics(opts.lyrics, totalDur, 1.2);
  }

  const particles: DrawState["particles"] = [];

  // v8.1.2: VINYET DI-BAKE SEKALI ke tiap gambar (mode cover) — sebelumnya digambar ulang
  // FULLSCREEN tiap frame (10.000+ drawImage per render!). Mode blur/color tetap overlay per-frame.
  const vigStr = typeof opts.vignetteStrength === "number" ? opts.vignetteStrength : 0.75;
  let vigOverlay: HTMLCanvasElement | null = null;
  let vigForVideo: HTMLCanvasElement | null = null; // 🎬 v11.8: klip video butuh vinyet per-frame (slide still sudah ke-bake)
  if (vigStr > 0.01) {
    vigOverlay = document.createElement("canvas");
    vigOverlay.width = rW; vigOverlay.height = rH;
    const vg = vigOverlay.getContext("2d", { alpha: true })!;
    const vgr = vg.createRadialGradient(rW/2, rH/2, Math.min(rW,rH)*0.3, rW/2, rH/2, Math.max(rW,rH)*0.8);
    vgr.addColorStop(0, "rgba(0,0,0,0)"); vgr.addColorStop(1, "rgba(0,0,0,0.7)");
    vg.fillStyle = vgr; vg.fillRect(0, 0, rW, rH);
    if ((opts.bgMode || "cover") === "cover") {
      for (const c of imgs) {
        const ix = c.getContext("2d")!;
        ix.globalAlpha = vigStr;
        ix.drawImage(vigOverlay, 0, 0);
        ix.globalAlpha = 1;
      }
      vigForVideo = vigOverlay; // 🎬 v11.8: simpan utk klip video sebelum di-null
      vigOverlay = null; // sudah ke-bake — tak perlu overlay per-frame lagi
    }
  }

  let Mp4Muxer: any = null, MuxTarget: any = null;
  try{
    const mod = await import("mp4-muxer").catch(()=>null);
    Mp4Muxer = mod?.Muxer || (window as any).Mp4Muxer || (window as any).MP4Muxer;
    // ArrayBufferTarget adalah EKSPOR TERPISAH dari Muxer (bukan properti!) — wajib ditangkap sendiri
    MuxTarget = mod?.ArrayBufferTarget || null;
  }catch{}

  const sharedV5 = {
    timeline, slideOpts,
    cinebars: opts.cinebars, // 🎬 v13.5
    grainAmt: opts.grainAmt || 0,
    clipImgs: null as any, // diisi nanti bila perlu
    vidMap, vigVideo: vigForVideo, vigStrV: vigStr, // 🎬 v11.8 ANIMASI STUDIO
  };
  if (Mp4Muxer && MuxTarget && supportsWebCodecs()){
    return renderWebCodecs({canvas,ctx,imgs,audio,fps,totalFrames,totalDur,slideDur,transDur,
      prof,rgb,vizStyle,vizColor,title,transition:transition||"zoom",
      spec, particles, onProgress, onStage, Mp4Muxer, MuxTarget, vigOverlay,
      logoImg, logoPos: opts.logoPosition||"center",
      captions: finalCaptions, captionStyle: capStyle,
      showTitle: opts.showTitle,
      videoFilter: opts.videoFilter,
      vignetteStrength: typeof opts.vignetteStrength==="number"?opts.vignetteStrength:0.75,
      spectrumSticker: opts.spectrumSticker,
      textLayers: opts.textLayers,
      mobileOptimized, // 🩹 Pass mobileOptimized to WebCodecs renderer
      ...sharedV5,
    } as any);
  }
  // Diagnostik JUJUR kenapa mesin cepat tidak aktif — biar gampang dilaporkan
  const why = !Mp4Muxer || !MuxTarget ? "modul MP4 gagal dimuat (coba refresh)"
    : typeof(window as any).VideoEncoder==="undefined" ? "browser belum dukung VideoEncoder"
    : typeof(window as any).VideoFrame==="undefined" ? "browser belum dukung VideoFrame"
    : "browser belum dukung AudioData";
  onStage?.(`Mesin cadangan — ${why}.`);
  return renderMediaRecorder({canvas,imgs,audio,fps,totalDur,slideDur,transDur,
    prof,rgb,vizStyle,vizColor,title,transition:transition||"zoom",spec,particles,onProgress,onStage,vigOverlay,
    logoImg,logoPos:opts.logoPosition||"center",
    captions:finalCaptions,captionStyle:capStyle,showTitle:opts.showTitle,
    videoFilter: opts.videoFilter,
    vignetteStrength: typeof opts.vignetteStrength==="number"?opts.vignetteStrength:0.75,
    spectrumSticker: opts.spectrumSticker,
    textLayers: opts.textLayers,
    ...sharedV5} as any);
}

interface RenderBase {
  canvas:HTMLCanvasElement; ctx:CanvasRenderingContext2D;
  imgs:HTMLCanvasElement[];
  audio:{data:Float32Array;sampleRate:number;duration:number;channels?:number;stereoL?:Float32Array;stereoR?:Float32Array}|null;
  fps:number; totalFrames:number; totalDur:number;
  slideDur:number; transDur:number;
  prof:typeof QUALITY_PROFILES.fast;
  rgb:[number,number,number];
  vizStyle:VizStyle; vizColor:string; title?:string;
  transition:Transition;
  spec:{bars:Float32Array[];beats:Uint8Array;bassLevels:Float32Array};
  particles: {x:number,y:number,vx:number,vy:number,life:number,size:number}[];
  onProgress?:(p:number)=>void; onStage?:(s:string)=>void;
  captions?:CaptionWord[]; captionStyle?:CaptionStyle;
}

async function renderWebCodecs(b:any){
  const {canvas,imgs,audio,fps,totalFrames,totalDur,slideDur,transDur,prof,rgb,vizStyle,vizColor,title,transition,spec,particles,onProgress,onStage,Mp4Muxer,MuxTarget,logoImg,logoPos,captions,captionStyle,showTitle,timeline,slideOpts,grainAmt,mobileOptimized} = b;

  // v8.1: PROBE dukungan encoder HP dulu (isConfigSupported) — sebelumnya codec dipatok
  // avc1.42001f (level 3.1) yang secara spesifikasi tidak sah untuk 1080p+, sehingga sebagian
  // HP menolak diam-diam → file "jadi" tapi video kosong/hitam/aneh di Gallery.
  const px = canvas.width * canvas.height;
  const lvl = px <= 1280 * 720 ? "1f" : px <= 1920 * 1080 ? "28" : px <= 2560 * 1440 ? "32" : "34";
  const candCodecs = [`avc1.4200${lvl}`, `avc1.6400${lvl}`, `avc1.4d00${lvl}`];
  let vCfg: any = null;
  for (const codec of candCodecs) {
    try {
      const cfg = { codec, width: canvas.width, height: canvas.height, bitrate: prof.videoBitrate, framerate: fps };
      const s = await (window as any).VideoEncoder.isConfigSupported(cfg);
      if (s?.supported) { vCfg = cfg; break; }
    } catch {}
  }
  if (!vCfg) {
    throw new Error(`Encoder HP tidak sanggup ${canvas.width}x${canvas.height}@${fps} — turunkan resolusi ke 1080p/720p ya bro.`);
  }
  // Probe encoder audio juga — kalau HP menolak AAC, mux TANPA audio (jangan hasilkan file rusak)
  let aCfg: any = null;
  if (audio) {
    const c = { codec: "mp4a.40.2", sampleRate: audio.sampleRate, numberOfChannels: audio.channels || 2, bitrate: 192_000 };
    try { const s = await (window as any).AudioEncoder.isConfigSupported(c); if (s?.supported) aCfg = c; } catch {}
  }
  onStage?.(`⚡ Mesin MP4 NGEBUT v8.7 (${canvas.width}x${canvas.height} @${fps}fps${aCfg ? " + audio" : ""}) — cache bingkai aktif`);
  if (audio && !aCfg) onStage?.("⚠️ Encoder audio HP menolak — video tanpa suara. Coba render ulang.");

  const muxer = new Mp4Muxer({
    target: new MuxTarget(),
    fastStart:"in-memory",
    video:{codec:"avc",width:canvas.width,height:canvas.height},
    // STEREO 44100Hz — kompatibel dengan SEMUA HP Android/iOS/WhatsApp/YouTube
    audio: aCfg?{codec:"aac",sampleRate:audio.sampleRate,numberOfChannels:audio.channels||2}:undefined,
    firstTimestampBehavior:"offset",
  });

  let vidChunks = 0;
  const videoEncoder = new (window as any).VideoEncoder({
    output:(chunk:any,meta:any)=>{ muxer.addVideoChunk(chunk,meta); vidChunks++; },
    error:(e:any)=>console.error("[VideoEncoder]",e),
  });
  videoEncoder.configure({
    ...vCfg,
    bitrateMode:"variable",
    latencyMode:"quality", // ⚡ OPTIMIZE: Ganti dari "realtime" ke "quality" untuk mengaktifkan akselerasi hardware paralel & efisiensi maksimal pada encoder (jauh lebih cepat & kualitas tinggi!)
    hardwareAcceleration:"prefer-hardware",
    avc:{format:"avc"},
  });

  let audioEncoder:any=null,audioEncDone:Promise<void>|null=null;
  if (audio && aCfg){
    let audioResolve!:()=>void;
    audioEncDone = new Promise<void>(res=>{audioResolve=res;});
    audioEncoder = new (window as any).AudioEncoder({
      output:(chunk:any,meta:any)=>muxer.addAudioChunk(chunk,meta),
      error:(e:any)=>console.error("[AudioEncoder]",e),
    });
    const nCh = audio.channels || 2;
    // AAC-LC stereo 192kbps — kompatibel dengan semua HP, WhatsApp, Reels, YouTube
    audioEncoder.configure(aCfg);
    const frameSize=1024;
    let offset=0;
    const sL = audio.stereoL || audio.data;
    const sR = audio.stereoR || audio.data;
    // 🩹 v15.6 AUDIO FADE OUT: Potong audio di batas totalDur dan aplikasikan fade-out halus 1.5 detik
    const maxAudioOffset = Math.floor(totalDur * audio.sampleRate);
    const fadeDur = 1.5;
    const fadeStart = Math.max(0, totalDur - fadeDur);
    while(offset < Math.min(audio.data.length, maxAudioOffset)){
      const len=Math.min(frameSize,audio.data.length-offset);
      // f32-planar: [L0,L1,..Ln-1,R0,R1,..Rn-1]
      const buf=new Float32Array(frameSize*nCh);
      for (let i=0;i<len;i++){
        const sampleIdx = offset + i;
        const tSec = sampleIdx / audio.sampleRate;
        let fadeFactor = 1.0;
        if (tSec > fadeStart) {
          fadeFactor = Math.max(0, 1 - (tSec - fadeStart) / fadeDur);
        }
        buf[i] = (sL[sampleIdx]||0) * fadeFactor;
        if (nCh>1) buf[frameSize+i] = (sR[sampleIdx]||0) * fadeFactor;
      }
      const ad=new (window as any).AudioData({format:"f32-planar",sampleRate:audio.sampleRate,numberOfFrames:frameSize,numberOfChannels:nCh,timestamp:(offset/audio.sampleRate)*1e6,data:buf});
      audioEncoder.encode(ad); ad.close(); offset+=frameSize;
    }
    audioEncoder.flush().then(audioResolve);
  }

  // v8.1.2: vinyet DATANG dari renderSlideshow (sudah di-bake ke gambar mode cover,
  // atau overlay siap pakai untuk mode blur/color) — tak ada lagi pre-render duplikat di sini.

  const perSlide = slideDur+transDur;
  // 🎬 v11.8: peta klip video (idx → elemen video + kanvas proxy)
  const vidMap = (b as any).vidMap as Map<number, VidDeck> | undefined; // 🌀 v13.12
  const keyframeEvery = fps*2;
  const bassRef = {level:0, beat:false};
  const tStart = performance.now();
  // v8.8: stopwatch fase (lukis / capture / antre-encoder) + state dup-skip VFR
  let msPaint = 0, msWait = 0, msCap = 0, skippedDup = 0, encFrames = 0;
  let pendingVf: { vf: any; kf: boolean; idx: number } | null = null;
  let lastFrameKey = "";

  /* ===== v8.7 CACHE BINGKAI: 90–99% frame slideshow IDENTIK.
     Lapisan A (dunia klip: gambar+kenburns+teks karaoke) dicache di canvas sendiri —
     dilukis ulang HANYA saat kuncinya berubah (slide baru / bucket zoom 1/96 slide
     (≈0,03% — tak kasat mata) / pulsa beat / status teks-karaoke). Lapisan hidup
     (glow bass + spektrum + stiker-spektrum + progress) tetap digambar TIAP frame
     → gerakan hasil IDENTIK, tanpa kompromi kualitas. Transisi/efek/animasi/grain/
     caption lama otomatis jatuh ke jalur lukis-penuh (perilaku persis seperti dulu). ===== */
  const useV5fast = !!(timeline && slideOpts) && !(grainAmt > 0);
  const dynSlides = new Set<number>();
  const tdesc: any[] = [];
  if (slideOpts) (slideOpts as any[]).forEach((o, si) => {
    if (!o) return;
    if (o.loop && o.loop !== "none") dynSlides.add(si);
    if (o.effect && o.effect !== "none") dynSlides.add(si);
    const grab = (ct: any) => {
      if (!ct || !String(ct.txt || "").trim()) return;
      if (ct.anim && ct.anim !== "none") dynSlides.add(si);
      tdesc.push({ si, id: ct.id || "", abs0: (ct.start != null ? ct.start : null), dur: (ct.dur && ct.dur > 0 ? ct.dur : null), words: ct.karaokeWords || null });
    };
    if (o.text) grab(o.text);
    (o.texts || []).forEach(grab);
    // 💎 v13.9: hanya stiker "@" TERPAKU (tanpa start sendiri) yang butuh lukis-penuh per-frame;
    // yang lepas-waktu (punya start — @bars/@wavepro/@ring/@cta) sudah dilayani lapisan hidup OV2
    (o.stickers || []).forEach((st2: any) => { if (typeof st2.emoji === "string" && st2.emoji[0] === "@" && st2.start == null) dynSlides.add(si); });
  });
  if (vidMap && vidMap.size) { for (const si of vidMap.keys()) dynSlides.add(si); } // 🎬 v11.8: slide ber-video = lukis penuh tiap frame
  const hasBComplex = !!(captions && captions.length) || !!((b as any).textLayers && (b as any).textLayers.length);
  const animDurOf = (o: any) => (o && typeof o.animDur === "number" && o.animDur > 0 ? o.animDur : 0.6);
  const mctx: CanvasRenderingContext2D = canvas.getContext("2d", { alpha: false })!;
  const cvA = document.createElement("canvas"); cvA.width = canvas.width; cvA.height = canvas.height;
  const cvB = document.createElement("canvas"); cvB.width = canvas.width; cvB.height = canvas.height;
  const bctx = cvB.getContext("2d")!;
  const cvMotionBlur = document.createElement("canvas"); cvMotionBlur.width = canvas.width; cvMotionBlur.height = canvas.height;
  let keyA = "", keyB = "";
  let fastFrames = 0, paintFrames = 0;
  let lastYield = performance.now();

  try {
    for (let f=0; f<totalFrames; f++){
    const t = f/fps;
    let slideIdx:number,localT:number,inTrans:boolean,transT:number,nextIdx:number,frameDur:number,transId:string,clipT:number;
    if (timeline) {
      const L = locate(timeline, t);
      slideIdx = L.idx; clipT = t - timeline.starts[L.idx]; frameDur = L.clipDur;
      inTrans = L.inTrans; transT = L.transT; nextIdx = L.nextIdx;
      localT = clipT;
      transId = (slideOpts && slideOpts[slideIdx]?.trans) || transition || "dissolve";
    } else {
      const slideFP = t/perSlide;
      slideIdx = Math.floor(slideFP);
      localT = t - slideIdx*perSlide;
      inTrans = localT >= slideDur;
      transT = inTrans ? (localT-slideDur)/transDur : 0;
      nextIdx = Math.min(slideIdx+1, imgs.length-1);
      slideIdx = Math.min(slideIdx, imgs.length-1);
      frameDur = slideDur; clipT = localT; transId = transition || "zoom";
    }
    const slideT = Math.min(1, localT/frameDur);
    // 🎬 v11.8: sinkronkan klip video (seek deterministik + salin frame). Beku di frame terakhir kalau slot lebih panjang.
    if (vidMap && vidMap.size) {
      const vC = vidMap.get(slideIdx);
      const vN = inTrans ? vidMap.get(nextIdx) : undefined;
      // 🌀 v13.12 LOOP LUMAT A/B: deck aktif dilukis penuh; di jendela crossfade deck pasangan muncul alpha 0→1 (sambungan KASAT MATA hilang)
      if (vC) { const s0 = timeline ? (timeline.starts[slideIdx] ?? 0) : slideIdx * perSlide; const slot0 = timeline ? (((timeline as any).durs?.[slideIdx]) ?? slideDur) : slideDur;
        // 🩹 v15.8 ENDING REPEAT FIX: Jika ini adalah slide terakhir, jepit waktu agar tidak melewati slot0, mencegah repetisi di penghujung!
        const rawTime = t - s0;
        const isLastSlide = slideIdx === (timeline ? timeline.durs.length - 1 : imgs.length - 1);
        const adjustedRaw = isLastSlide ? Math.min(rawTime, slot0 - 0.05) : rawTime;

        const pl = vidPlan(adjustedRaw, vC.a.duration || vC.b.duration || 1, slot0, ((slideOpts as any)?.[slideIdx]?.spd) || 1); // ⏱ v13.13
        const act = pl.act === "a" ? vC.a : vC.b; const nxt = pl.act === "a" ? vC.b : vC.a;
        await seekVid(act, Math.min(pl.pos, (act.duration || 1) - 0.06));
        blitVid(act, vC.c, (b as any).vigVideo, (b as any).vigStrV);
        if (pl.inX) { await seekVid(nxt, pl.x * Math.min(0.5, (nxt.duration || 1) * 0.15)); blitVid(nxt, vC.c, null, 0, pl.x); }
      }
      if (vN) { const s1 = timeline ? (timeline.starts[nextIdx] ?? 0) : nextIdx * perSlide; const slot1 = timeline ? (((timeline as any).durs?.[nextIdx]) ?? slideDur) : slideDur;
        const pl2 = vidPlan(t - s1, vN.a.duration || vN.b.duration || 1, slot1, ((slideOpts as any)?.[nextIdx]?.spd) || 1); // ⏱ v13.13
        const act2 = pl2.act === "a" ? vN.a : vN.b; const nxt2 = pl2.act === "a" ? vN.b : vN.a;
        await seekVid(act2, Math.min(pl2.pos, (act2.duration || 1) - 0.06));
        blitVid(act2, vN.c, (b as any).vigVideo, (b as any).vigStrV);
        if (pl2.inX) { await seekVid(nxt2, pl2.x * Math.min(0.5, (nxt2.duration || 1) * 0.15)); blitVid(nxt2, vN.c, null, 0, pl2.x); }
      }
    }
    const optCur = slideOpts ? (slideOpts as any)[slideIdx] : null;
    const aDur = animDurOf(optCur);
    const fastOk = useV5fast && !inTrans && !hasBComplex && !dynSlides.has(slideIdx)
      && !(optCur?.animIn && clipT < aDur)
      && !(optCur?.animOut && (frameDur - clipT) < aDur);

    const bars = spec.bars[f];
    const bass = spec.bassLevels[f];
    const beat = !!spec.beats[f];
    bassRef.level = bass; bassRef.beat = beat;

    const st:any = {
      time:t,fps,totalDur,slideIdx,slideT,transT,isTransition:inTrans,nextIdx,
      W:canvas.width,H:canvas.height,bars,bass,beat,
      rgb,color:vizColor,style:vizStyle,imgs,profile:prof,title,particles,
      phase:t*0.5,_canvas:canvas,_transition:transition,_vignette:(b as any).vigOverlay,
      _kb:(typeof slideOpts !== "undefined" ? (slideOpts as any)?.[slideIdx]?.kb : null),
      showTitle:showTitle!==false, showCaption: !!captions?.length,
      logoImg,logoPos,captions,captionStyle,
      videoFilter: b.videoFilter,
      vignetteStrength: typeof b.vignetteStrength==="number"?b.vignetteStrength:0.75,
      spectrumSticker: b.spectrumSticker,
      _cinebars: !!(b as any).cinebars, // 🎬 v13.5
      textLayers: b.textLayers,
      clipT, clipDur: frameDur, transId, timeline, slideOpts, grainAmt,
      vidMap, // 🩹 Pass vidMap so drawFrame can access video durations
    };

    let frameIdKey = "";
    if (fastOk) {
      const __p0 = performance.now();
      let kA = slideIdx + "." + Math.round(Math.min(1, Math.max(0, slideT)) * 96) + "." + (beat ? 1 : 0);
      for (let di = 0; di < tdesc.length; di++) {
        const d = tdesc[di];
        const st0 = d.abs0 != null ? d.abs0 : (timeline?.starts?.[d.si] ?? 0);
        const dd = d.dur ?? (timeline?.durs?.[d.si] ?? frameDur);
        if (t < st0 || t >= st0 + dd) continue;
        kA += "|t" + d.si + "." + (d.id || di);
        if (d.words) { const rel = t - st0; let wi = -1; for (let w = 0; w < d.words.length; w++) { if (d.words[w].start <= rel) wi = w; else break; } kA += ":" + wi; }
      }
      if (kA !== keyA) { keyA = kA; paintFrames++; drawFrame({ ...st, _canvas: cvA, only: "A" }); }
      mctx.drawImage(cvA, 0, 0);
      drawFrame({ ...st, _canvas: canvas, only: "OV1" });
      const kB = Math.round(Math.min(1, slideT * 2) * 24) + "";
      if (kB !== keyB) { keyB = kB; bctx.clearRect(0, 0, canvas.width, canvas.height); drawFrame({ ...st, _canvas: cvB, only: "B" }); }
      mctx.drawImage(cvB, 0, 0);
      drawFrame({ ...st, _canvas: canvas, only: "OV2" });
      msPaint += performance.now() - __p0;
      fastFrames++;
      // identitas piksel frame ini — kunci dup-skip
      let ok2 = Math.round(bass * 40) + "";
      for (let bi = 0; bi < 10 && bars.length > 0; bi++) ok2 += "." + Math.round((bars[Math.floor(bi * bars.length / 10)] || 0) * 20);
      frameIdKey = kA + "#" + kB + "#" + ok2 + "#" + Math.round(canvas.width * (t / totalDur));
    } else {
      const __p0 = performance.now();
      paintFrames++;
      drawFrame({ ...st, _canvas: canvas, only: "all" });
      msPaint += performance.now() - __p0;
    }

    /* v8.8 DUP-SKIP (VFR jujur): kalau piksel frame ini IDENTIK dengan frame sebelumnya,
       JANGAN kirim ke encoder — muxer otomatis memperpanjang durasi frame sebelumnya.
       Gerakan di layar hasil tetap IDENTIK; kerja encoder di bagian statis ≈ NOL. */
    const skippable = fastOk && !b.spectrumSticker && pendingVf && frameIdKey === lastFrameKey;
    if (skippable) { skippedDup++; }
    else {
      const __c0 = performance.now();
      if (pendingVf) { videoEncoder.encode(pendingVf.vf, { keyFrame: pendingVf.kf }); pendingVf.vf.close(); encFrames++; }
      const nvf = new (window as any).VideoFrame(canvas, { timestamp: Math.floor(t * 1e6), duration: Math.floor(1e6 / fps) });
      msCap += performance.now() - __c0;
      pendingVf = { vf: nvf, kf: f % keyframeEvery === 0, idx: f };
      lastFrameKey = frameIdKey;
    }

    // backpressure (diukur): antrean dilonggarkan 8→24 agar encoder sibuk terus selagi kita melukis
    const __w0 = performance.now();
    while ((videoEncoder as any).encodeQueueSize > 24) {
      const waitDelay = mobileOptimized ? 10 : 1;
      await new Promise(r=>setTimeout(r, waitDelay));
    }
    msWait += performance.now() - __w0;

    // Time-sliced yielding: yield only if we have spent > 50ms on CPU (30ms on mobile).
    // This avoids the 4ms throttling penalty of setTimeout(r,0) on fast frames,
    // dramatically increasing rendering speeds (up to 3-5x faster on fast devices)
    // while keeping the main UI thread completely responsive.
    const nowYield = performance.now();
    const yieldInterval = mobileOptimized ? 30 : 50;
    if (nowYield - lastYield > yieldInterval || f === totalFrames - 1) {
      onProgress?.(f/totalFrames);
      const delay = mobileOptimized ? 10 : 0;
      await new Promise(r=>setTimeout(r, delay));
      lastYield = performance.now();
    }
  }
    if (pendingVf) { videoEncoder.encode(pendingVf.vf, { keyFrame: pendingVf.kf }); pendingVf.vf.close(); encFrames++; }
    try { console.log(`[v8.8 telemetri] lukis ${(msPaint/1000).toFixed(1)}d · capture ${(msCap/1000).toFixed(1)}d · antre-encoder ${(msWait/1000).toFixed(1)}d · unik ${encFrames}/${totalFrames} · dup-skip ${skippedDup}`); } catch {}
    await videoEncoder.flush(); videoEncoder.close();
    // v8.1 WATCHDOG: kalau encoder menolak SEMUA frame, JANGAN kirim file busuk ke user
    if (!vidChunks) {
      throw new Error("Encoder HP tidak menghasilkan frame video — coba turunkan resolusi/fps (mis. 1080p30) lalu render ulang ya bro.");
    }
    if (audioEncoder && audioEncDone){ await audioEncDone; audioEncoder.close(); }
    muxer.finalize();

    onProgress?.(1); onStage?.("✅ Selesai!");
    const __fd = (ms:number)=> (ms/1000).toFixed(1)+"d";
    onStage?.(`⏱ Telemetri: total ${__fd(performance.now()-tStart)} · lukis ${__fd(msPaint)} · capture ${__fd(msCap)} · antre-encoder ${__fd(msWait)} · unik ${encFrames}/${totalFrames} · skip ${skippedDup} · mesin WEBCODECS(prefer-hw)`); // ⚡ v13.10: label mesin permanen utk diagnosa
    return new Blob([muxer.target.buffer],{type:"video/mp4"});
  } finally {
    // 📦 v15.4B MEMORY CLEANUP: Pause video decks and revoke Blob URLs immediately to prevent OOM crash in Chrome on mobile
    try {
      vidMap?.forEach((o) => {
        o.a.pause();
        o.b.pause();
        if (o.objUrl) {
          try { URL.revokeObjectURL(o.objUrl); } catch { /* abaikan */ }
        }
      });
    } catch { /* abaikan */ }

    // 🧹 INTENSIVE CANVAS & VIDEO MEMORY PURGE: Release large canvas backing stores and video decoders to avoid OOM
    try {
      if (imgs && Array.isArray(imgs)) {
        imgs.forEach((img: any) => {
          if (img) { img.width = 0; img.height = 0; }
        });
      }
    } catch {}
    try {
      vidMap?.forEach((o) => {
        if (o.c) { o.c.width = 0; o.c.height = 0; }
        o.a.src = "";
        o.b.src = "";
        o.a.load();
        o.b.load();
      });
    } catch {}
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {}
    try {
      cvA.width = 0; cvA.height = 0;
      cvB.width = 0; cvB.height = 0;
      cvMotionBlur.width = 0; cvMotionBlur.height = 0;
    } catch {}
  }
}

async function renderMediaRecorder(b:any){
  const {canvas,imgs,audio,fps,totalDur,slideDur,transDur,prof,rgb,vizStyle,vizColor,title,transition,spec,particles,onProgress,onStage,logoImg,logoPos,captions,captionStyle,showTitle,timeline,slideOpts,grainAmt} = b;
  onStage?.("⚠️ Mesin cadangan (realtime) — render berjalan sepanjang durasi video; biarkan layar menyala sampai selesai ya bro.");
  const __t0 = performance.now(); // ⚡ v13.10: stopwatch telemetri mesin cadangan
  const stream:MediaStream = (canvas as any).captureStream(fps);
  let audioDest:MediaStreamAudioDestinationNode|null=null, actx:AudioContext|null=null;
  if (audio){
    actx=new (window.AudioContext||(window as any).webkitAudioContext)();
    audioDest=actx.createMediaStreamDestination();
    // STEREO 2-channel (bukan mono) — kalau mono beberapa HP Android (khususnya Samsung)
    // tidak memutar track audio di hasil export (mono AAC di MP4 sering gagal diputar).
    // Kita pakai stereoL/R yang sudah di-resample ke 44100Hz dari decodeAudio().
    const nCh = audio.channels || 2;
    const ab=actx.createBuffer(nCh,audio.data.length,audio.sampleRate);
    ab.copyToChannel(audio.stereoL||audio.data,0);
    ab.copyToChannel(audio.stereoR||audio.data,1);
    const src=actx.createBufferSource(); src.buffer=ab; src.connect(audioDest); src.start();
    audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  }
  const mime = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")?"video/mp4;codecs=avc1"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm";
  const chunks:Blob[]=[];
  const mr = new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:prof.videoBitrate});
  mr.ondataavailable = e=>{if(e.data.size)chunks.push(e.data);};
  const done = new Promise<Blob>(res=>{mr.onstop=()=>res(new Blob(chunks,{type:mime}));});
  mr.start(100);
  const perSlide=slideDur+transDur, bassRef={level:0,beat:false};
  const vidMap = (b as any).vidMap as Map<number, VidDeck> | undefined; // 🌀 v13.12 (dulu v11.8)
  const startT=performance.now();
  const tick=()=>{
    const elapsed=(performance.now()-startT)/1000;
    const t=Math.min(elapsed,totalDur);
    const f=Math.floor(t*fps);
    let slideIdx:number,localT:number,inTrans:boolean,transT:number,nextIdx:number,frameDur:number,transId:string,clipT:number;
    if (timeline) {
      const L = locate(timeline, t);
      slideIdx = L.idx; clipT = t - timeline.starts[L.idx]; frameDur = L.clipDur;
      inTrans = L.inTrans; transT = L.transT; nextIdx = L.nextIdx; localT = clipT;
      transId = (slideOpts && slideOpts[slideIdx]?.trans) || transition || "dissolve";
    } else {
      const slideFP=t/perSlide;
      slideIdx=Math.floor(slideFP); localT=t-slideIdx*perSlide;
      inTrans=localT>=slideDur; transT=inTrans?(localT-slideDur)/transDur:0;
      nextIdx=Math.min(slideIdx+1,imgs.length-1);
      slideIdx=Math.min(slideIdx,imgs.length-1);
      frameDur=slideDur; clipT=localT; transId=transition||"zoom";
    }
    const slideT=Math.min(1,localT/frameDur);
    const bars = spec.bars[Math.min(f,spec.bars.length-1)] || new Float32Array(prof.bars);
    const bass = spec.bassLevels[Math.min(f,spec.bassLevels.length-1)]||0;
    const beat = !!spec.beats[Math.min(f,spec.beats.length-1)];
    bassRef.level=bass; bassRef.beat=beat;
    // 🎬 v11.8: klip video diputar natural (mesin realtime) lalu disalin tiap tick; slide lain ditidurkan
    if (vidMap && vidMap.size) {
      for (const [si, o] of vidMap) {
        const active = si === slideIdx || (inTrans && si === nextIdx);
        if (active) {
          // 🌀 v13.12 LOOP LUMAT A/B (realtime): deck aktif main natural dg playbackRate dari vidPlan (sama dg mesin satunya);
          // di jendela crossfade deck pasangan ikut main dari awal → sambungan tersamar silang, GERAK TAK PERNAH BERHENTI.
          const vdm = o.a.duration || o.b.duration || 1; const slotm = timeline ? (((timeline as any).durs?.[si]) ?? perSlide) : perSlide;
          const raw = Math.max(0, t - (timeline ? (timeline.starts[si] ?? 0) : si * perSlide));
          // 🩹 v15.8 ENDING REPEAT FIX: Jika ini adalah slide terakhir, jepit waktu agar tidak melewati slotm, mencegah repetisi di penghujung!
          const isLastSlide = si === (timeline ? timeline.durs.length - 1 : imgs.length - 1);
          const adjustedRaw = isLastSlide ? Math.min(raw, slotm - 0.05) : raw;

          const pl = vidPlan(adjustedRaw, vdm, slotm, ((slideOpts as any)?.[si]?.spd) || 1); // ⏱ v13.13
          const act = pl.act === "a" ? o.a : o.b; const nxt = pl.act === "a" ? o.b : o.a;
          try { if (Math.abs(act.playbackRate - pl.rate) > 0.001) act.playbackRate = pl.rate; } catch {}
          const want = Math.min(pl.pos, vdm - 0.06);
          if (act.paused || act.ended || Math.abs(act.currentTime - want) > 0.6) { try { act.currentTime = want; } catch {} void act.play().catch(() => {}); }
          blitVid(act, o.c, (b as any).vigVideo, (b as any).vigStrV);
          if (pl.inX) {
            const wn = pl.x * Math.min(0.5, vdm * 0.15);
            try { if (Math.abs(nxt.playbackRate - pl.rate) > 0.001) nxt.playbackRate = pl.rate; } catch {}
            if (nxt.paused || nxt.ended || Math.abs(nxt.currentTime - wn) > 0.3) { try { nxt.currentTime = wn; } catch {} void nxt.play().catch(() => {}); }
            blitVid(nxt, o.c, null, 0, pl.x); // muncul perlahan di atas deck aktif (vignetta sekali saja)
          } else if (!nxt.paused) nxt.pause(); // pasangan tidur di luar jendela — hemat mesin HP
        } else { if (!o.a.paused) o.a.pause(); if (!o.b.paused) o.b.pause(); }
      }
    }
    drawFrame({time:t,fps,totalDur,slideIdx,slideT,transT,isTransition:inTrans,nextIdx,
      W:canvas.width,H:canvas.height,bars,bass,beat,rgb,color:vizColor,style:vizStyle,imgs,profile:prof,title,particles,
      phase:t*0.5,_canvas:canvas,_transition:transition,showTitle:showTitle!==false,
      _kb:(typeof slideOpts !== "undefined" ? (slideOpts as any)?.[slideIdx]?.kb : null),
      _vignette:(b as any).vigOverlay,
      logoImg,logoPos,captions,captionStyle,showCaption:!!captions?.length,
      videoFilter: b.videoFilter,
      vignetteStrength: typeof b.vignetteStrength==="number"?b.vignetteStrength:0.75,
      spectrumSticker: b.spectrumSticker,
      _cinebars: !!(b as any).cinebars, // 🎬 v13.5
      textLayers: b.textLayers,
      clipT, clipDur: frameDur, transId, timeline, slideOpts, grainAmt,
      vidMap, // 🩹 Pass vidMap so drawFrame can access video durations
    } as any);
    onProgress?.(t/totalDur);
    if(elapsed<totalDur+0.2) requestAnimationFrame(tick);
    else{mr.stop();actx?.close();}
  };
  requestAnimationFrame(tick);
  const blob=await done;
  try { vidMap?.forEach((o) => { o.a.pause(); o.b.pause(); if (o.objUrl) { try { URL.revokeObjectURL(o.objUrl); } catch { /* abaikan */ } } }); } catch {} // 📦 v13.13: tidurkan deck + bebaskan blob

  // 🧹 INTENSIVE CANVAS & VIDEO MEMORY PURGE: Release large canvas backing stores and video decoders to avoid OOM
  try {
    if (imgs && Array.isArray(imgs)) {
      imgs.forEach((img: any) => {
        if (img) { img.width = 0; img.height = 0; }
      });
    }
  } catch {}
  try {
    vidMap?.forEach((o) => {
      if (o.c) { o.c.width = 0; o.c.height = 0; }
      o.a.src = "";
      o.b.src = "";
      o.a.load();
      o.b.load();
    });
  } catch {}
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {}

  onStage?.("✅ Selesai!"); onProgress?.(1);
  onStage?.(`⏱ Telemetri: total ${((performance.now()-__t0)/1000).toFixed(1)}d · mesin MEDIARECORDER(realtime)`); // ⚡ v13.10
  return blob;
}

export function downloadBlob(blob:Blob, filename:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
