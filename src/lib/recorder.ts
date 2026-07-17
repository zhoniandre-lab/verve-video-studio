"use client";
import type { VizStyle } from "./types";

interface RenderOptions {
  images: string[];
  audioUrl?: string;
  slideDuration: number;
  vizStyle: VizStyle;
  vizColor: string;
  title?: string;
  /** "fast" = lower res, "balanced", "high" = best quality */
  quality?: "fast" | "balanced" | "high";
  onProgress?: (p: number) => void;
  onStage?: (stage: string) => void;
  transition?: "fade" | "zoom" | "none";
  /** kalau true, resolusi diturunkan di mobile biar cepat */
  mobileOptimized?: boolean;
  width?: number;
  height?: number;
  fps?: number;
}

const QUALITY_PROFILES = {
  fast: { scale: 0.5, fps: 24, bitrate: 2_000_000 },
  balanced: { scale: 0.75, fps: 24, bitrate: 3_500_000 },
  high: { scale: 1, fps: 30, bitrate: 5_500_000 },
};

function detectMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isLowEnd() {
  if (typeof navigator === "undefined") return false;
  const hc = (navigator as any).hardwareConcurrency || 4;
  return hc <= 4 || detectMobile();
}

function pickMime(): string {
  const cand = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of cand) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

async function downscaleImage(src: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // resize untuk hemat memory
      let w = img.naturalWidth, h = img.naturalHeight;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => reject(new Error("Gagal memuat gambar saat downscale"));
    img.src = src;
  });
}

export async function renderSlideshow(opts: RenderOptions): Promise<Blob> {
  const {
    images,
    audioUrl,
    slideDuration = 3,
    vizStyle = "bars",
    vizColor = "#ec4899",
    title,
    transition = "zoom",
    onProgress,
    onStage,
  } = opts;

  const isMobile = opts.mobileOptimized ?? detectMobile();
  const quality = opts.quality ?? (isLowEnd() ? "fast" : "balanced");
  const profile = QUALITY_PROFILES[quality];

  const targetW = (opts.width || 1280) * profile.scale;
  const targetH = (opts.height || 720) * profile.scale;
  const fps = opts.fps || profile.fps;

  onStage?.(isMobile ? "📱 Mode HP (cepat)" : "💻 Mode Desktop");
  onStage?.("Memproses gambar...");

  // ====== Pre-process: downscale semua gambar ke target untuk hemat RAM/CPU ======
  const processedSrcs: string[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      processedSrcs.push(await downscaleImage(images[i], targetW * 1.2, targetH * 1.2));
    } catch (e) {
      processedSrcs.push(images[i]);
    }
    onProgress?.(0.05 + (i / images.length) * 0.1);
  }

  const loadedImgs: HTMLImageElement[] = await Promise.all(
    processedSrcs.map(
      (src) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error("Gagal memuat gambar untuk render"));
          im.src = src;
        })
    )
  );

  onStage?.("Menyiapkan audio...");
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const actx = new AC();

  let audioBuffer: AudioBuffer | null = null;
  let totalDuration = loadedImgs.length * slideDuration;

  if (audioUrl) {
    try {
      const r = await fetch(audioUrl);
      const arr = await r.arrayBuffer();
      audioBuffer = await actx.decodeAudioData(arr);
      totalDuration = Math.max(totalDuration, audioBuffer.duration);
    } catch (e) {
      console.warn("Audio decode gagal, lanjut tanpa audio:", e);
    }
  }

  // ====== Canvas setup ======
  onStage?.("Mulai merekam frame...");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(targetW);
  canvas.height = Math.round(targetH);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  // Audio graph
  const dest = actx.createMediaStreamDestination();
  const analyser = actx.createAnalyser();
  analyser.fftSize = 256; // lebih kecil = lebih cepat
  analyser.smoothingTimeConstant = 0.78;
  analyser.connect(dest);

  // Source audio
  let srcNode: AudioBufferSourceNode | null = null;
  if (audioBuffer) {
    srcNode = actx.createBufferSource();
    srcNode.buffer = audioBuffer;
    // Gain kecil untuk voice clarity
    const gain = actx.createGain();
    gain.gain.value = 0.9;
    srcNode.connect(gain);
    gain.connect(analyser);
  }

  // MediaStream
  const canvasStream = canvas.captureStream(fps);
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) canvasStream.addTrack(audioTrack);

  const mimeType = pickMime();
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: profile.bitrate,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
    recorder.onerror = (ev) => reject(ev);
  });

  // ====== Freq arrays ======
  const freq = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const startT = performance.now();
  const totalMs = totalDuration * 1000;

  // Pre-render gradients
  const makeBarGrad = () => {
    const g = ctx.createLinearGradient(0, canvas.height, 0, 0);
    g.addColorStop(0, vizColor);
    g.addColorStop(0.5, "#a855f7");
    g.addColorStop(1, "#22d3ee");
    return g;
  };

  if (actx.state === "suspended") await actx.resume();
  recorder.start(250);
  if (srcNode) srcNode.start(0);

  const draw = () => {
    const elapsedMs = performance.now() - startT;
    const prog = Math.min(1, elapsedMs / totalMs);
    onProgress?.(0.15 + prog * 0.8);

    const slideF = elapsedMs / (slideDuration * 1000);
    const slideIdx = Math.min(loadedImgs.length - 1, Math.floor(slideF));
    const slideLocal = slideF - slideIdx;
    const nextIdx = Math.min(loadedImgs.length - 1, slideIdx + 1);

    // background hitam
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawCover = (img: HTMLImageElement, alpha: number, zoom: number) => {
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * zoom;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    };

    // Transisi (zoom ringan untuk hemat CPU)
    if (transition === "zoom") {
      drawCover(loadedImgs[slideIdx], 1, 1 + slideLocal * 0.06);
      if (slideLocal > 0.8 && nextIdx !== slideIdx) drawCover(loadedImgs[nextIdx], (slideLocal - 0.8) * 5, 1);
    } else if (transition === "fade") {
      drawCover(loadedImgs[slideIdx], 1, 1);
      if (slideLocal > 0.75 && nextIdx !== slideIdx) drawCover(loadedImgs[nextIdx], (slideLocal - 0.75) * 4, 1);
    } else {
      drawCover(loadedImgs[slideIdx], 1, 1);
    }

    // Dark overlay bawah untuk keterbacaan
    const grd = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);

    // Title overlay di atas
    if (title) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 20, canvas.width, Math.round(canvas.height * 0.09));
      ctx.fillStyle = "#fff";
      const fs = Math.round(canvas.width * 0.04);
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 12;
      // wrap text
      const maxW = canvas.width * 0.9;
      const words = title.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      const startY = 20 + Math.round(canvas.height * 0.045) - ((lines.length - 1) * fs) / 2;
      lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, startY + i * fs * 1.15));
      ctx.shadowBlur = 0;
    }

    // Spectrum
    analyser.getByteFrequencyData(freq);
    const bass = avgBand(freq, 0, 0.1);
    drawSpectrumFast(ctx, freq, bass, vizStyle, vizColor, canvas.width, canvas.height);

    if (elapsedMs < totalMs - 300) {
      raf = requestAnimationFrame(draw);
    } else {
      // pastikan frame terakhir tergambar
      setTimeout(() => {
        try { recorder.stop(); } catch {}
        try { srcNode?.stop(); } catch {}
      }, 400);
    }
  };
  raf = requestAnimationFrame(draw);

  const blob = await done;
  cancelAnimationFrame(raf);
  try { actx.close(); } catch {}
  onProgress?.(1);
  onStage?.("Selesai!");
  return blob;
}

// ==== Spectrum fast (lebih ringkas untuk HP) ====
function drawSpectrumFast(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  bass: number,
  style: VizStyle,
  color: string,
  W: number,
  H: number
) {
  const t = performance.now() / 1000;
  if (style === "bars") {
    const bars = 48;
    const bw = (W * 0.9) / bars;
    const step = Math.max(1, Math.floor(freq.length / bars));
    const baseY = H - 8;
    // bars
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 10 + v * H * 0.35;
      const x = W * 0.05 + i * bw;
      ctx.fillStyle = color;
      roundRect(ctx, x + 1.5, baseY - h, bw - 3, h, 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else if (style === "circle") {
    const cx = W / 2;
    const cy = H * 0.4;
    const rBase = Math.min(W, H) * 0.14 + bass * 50;
    const bars = 80;
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < bars; i++) {
      const v = freq[i % freq.length] / 255;
      const a = (i / bars) * Math.PI * 2 - Math.PI / 2 + t * 0.15;
      const r1 = rBase;
      const r2 = rBase + 12 + v * 100;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
    // center glow
    const glowR = 25 + bass * 45;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    rg.addColorStop(0, "rgba(255,255,255,0.85)");
    rg.addColorStop(0.4, hexA(color, 0.5));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (style === "particles") {
    // versi ringkas: dot grid ikut beat (gak pakai 180 particles yg mahal)
    const N = 90;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    for (let i = 0; i < N; i++) {
      const seed = i * 0.37;
      const x = ((Math.sin(seed * 3.1 + t * 0.25) * 0.5 + 0.5) * W + t * 20 * ((i % 5) * 0.02 + 0.9)) % W;
      const y = (Math.cos(seed * 1.7 + t * 0.35) * 0.5 + 0.5) * H;
      const f = freq[i % freq.length] / 255;
      ctx.fillStyle = hexA(color, 0.35 + f * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, 1 + f * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // ring dots
    const cx = W / 2;
    const cy = H * 0.5;
    const rBase = Math.min(W, H) * 0.25 + bass * 60;
    for (let i = 0; i < 100; i++) {
      const v = freq[i % freq.length] / 255;
      const a = (i / 100) * Math.PI * 2 + t * 0.25;
      const r = rBase + v * 45;
      ctx.fillStyle = hexA(color, 0.6);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + v * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // bass flash
    if (bass > 0.65) {
      ctx.fillStyle = hexA("#ffffff", (bass - 0.65) * 0.12);
      ctx.fillRect(0, 0, W, H);
    }
    ctx.shadowBlur = 0;
  }
}

function avgBand(freq: Uint8Array, a: number, b: number) {
  const s = Math.floor(freq.length * a);
  const e = Math.floor(freq.length * b);
  let sum = 0;
  for (let i = s; i < e; i++) sum += freq[i];
  return (sum / Math.max(1, e - s)) / 255;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number) {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(f.slice(0, 2), 16);
  const g = parseInt(f.slice(2, 4), 16);
  const b = parseInt(f.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
