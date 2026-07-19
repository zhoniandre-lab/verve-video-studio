"use client";
/* =====================================================================
   GIF exporter (v6) — ambil frame dari timeline klip via paintClips,
   encode pakai gifenc (pure JS). Singkat: maks ~8 detik • 384-480px.
   ===================================================================== */
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { buildTimeline, locate, canonicalTrans, effDur, paintClips, buildClipFilter, setDrawBg } from "./editing";
import type { SlideOpt } from "./editing";
import { preloadStickerImages } from "./editing";

export interface GifOptions {
  images: string[];
  slideOpts?: SlideOpt[] | null;
  slideDuration: number;
  transition: string;
  transitionDur: number;
  ratio: "16:9" | "9:16" | "1:1";
  videoFilter?: string;
  grainAmt?: number;
  bgMode?: "cover" | "blur" | "color";
  bgColor?: string;
  maxDur?: number;     // default 8
  outW?: number;       // default 400
  fps?: number;        // default 10
  videoSpeed?: number;
  onProgress?: (p: number) => void;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Gagal memuat gambar untuk GIF"));
    img.src = src;
  });
}

export async function renderGif(opts: GifOptions): Promise<Blob> {
  const { images, slideOpts, slideDuration, transition, transitionDur, ratio } = opts;
  if (!images.length) throw new Error("Tidak ada gambar");
  const maxDur = opts.maxDur ?? 8;
  const fps = opts.fps ?? 10;

  // dimensi output
  let W = opts.outW ?? 400;
  let H = 400;
  if (ratio === "9:16") H = Math.round(W * 16 / 9); else if (ratio === "1:1") H = W; else H = Math.round(W * 9 / 16);
  W = Math.round(W / 2) * 2; H = Math.round(H / 2) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  setDrawBg(opts.bgMode || "cover", opts.bgColor || "#000000");

  // load gambar + stiker overlay
  await preloadStickerImages([...new Set((slideOpts || []).flatMap(o => (o?.stickers || []).filter(s => (s as any).img).map(s => (s as any).img)))]);
  const imgs = await Promise.all(images.map(loadImg));

  // timeline
  const durs = images.map((_, i) => effDur(slideOpts?.[i] as any, slideDuration));
  const tdurs = images.map((_, i) => {
    if (i >= images.length - 1) return 0;
    const tid = canonicalTrans(slideOpts?.[i]?.trans ?? transition);
    return tid === "none" ? 0 : Math.min(Math.max(0.15, slideOpts?.[i]?.transDur ?? transitionDur), durs[i] * 0.9);
  });
  const tids = images.map((_, i) => canonicalTrans(slideOpts?.[i]?.trans ?? transition));
  const tl = buildTimeline(durs, tdurs, tids);
  const total = Math.min(tl.total, maxDur);
  const totalFrames = Math.max(1, Math.floor(total * fps));

  const gif = GIFEncoder();
  const globalFilter = opts.videoFilter && opts.videoFilter !== "none" ? opts.videoFilter : "none";
  const speed = opts.videoSpeed || 1;

  for (let f = 0; f < totalFrames; f++) {
    const rawT = f / fps;
    const t = rawT;
    const L = locate(tl, Math.min(t, Math.max(0, tl.total - 0.001)));
    const optCur = slideOpts?.[L.idx] || null;
    const optNxt = slideOpts?.[L.nextIdx] || null;
    const cur = imgs[L.idx];
    const nxt = imgs[L.nextIdx] !== cur ? imgs[L.nextIdx] : null;
    const clipT = L.clipT * speed;
    const kbZoom = 1 + Math.min(0.08, (t / Math.max(1, tl.total)) * 0.08);

    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    paintClips(ctx, W, H, cur, nxt, {
      clipT, clipDur: L.clipDur, inTrans: L.inTrans, transT: L.transT,
      transId: L.inTrans ? tids[L.idx] : "none",
      optCur: optCur as any, optNxt: optNxt as any,
      globalFilter, absT: t, isMobile: true, beat: false,
      grain: opts.grainAmt || 0, kbZoom,
    } as any);

    const data = ctx.getImageData(0, 0, W, H);
    const palette = quantize(data.data, 256);
    const index = applyPalette(data.data, palette);
    gif.writeFrame(index, W, H, { palette, delay: Math.round(1000 / fps) });
    opts.onProgress?.((f + 1) / totalFrames);
    if (f % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  const ab = new ArrayBuffer(bytes.length);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: "image/gif" });
}
