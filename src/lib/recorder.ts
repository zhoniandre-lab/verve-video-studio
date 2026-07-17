"use client";
import type { VizStyle } from "./types";

interface RenderOptions {
  images: string[]; // data URL / object URL
  audio?: HTMLAudioElement | null;
  audioUrl?: string;
  slideDuration: number;
  vizStyle: VizStyle;
  vizColor: string;
  title?: string;
  width?: number;
  height?: number;
  onProgress?: (p: number) => void;
  transition?: "fade" | "zoom" | "none";
}

/**
 * Render video slideshow + spectrum visualizer secara client-side memakai
 * Canvas captureStream + MediaRecorder + Web Audio Analyser.
 * Hasil: Blob MP4/WebM yang bisa di-download atau di-upload ke Supabase.
 */
export async function renderSlideshow(opts: RenderOptions): Promise<Blob> {
  const {
    images,
    audioUrl,
    slideDuration = 3,
    vizStyle = "bars",
    vizColor = "#ec4899",
    title,
    width = 1280,
    height = 720,
    onProgress,
    transition = "zoom",
  } = opts;

  // Buat canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Setup audio
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const actx = new AC();
  const dest = actx.createMediaStreamDestination();
  const analyser = actx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;
  analyser.connect(dest);

  let audioEl: HTMLAudioElement | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let totalDuration = images.length * slideDuration;

  if (audioUrl) {
    const r = await fetch(audioUrl);
    const arr = await r.arrayBuffer();
    audioBuffer = await actx.decodeAudioData(arr);
    totalDuration = Math.max(totalDuration, audioBuffer.duration);
  }

  // Load images
  const loadedImgs: HTMLImageElement[] = await Promise.all(
    images.map(
      (src) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => res(im);
          im.onerror = () => rej(new Error("Image load failed: " + src.slice(0, 50)));
          im.src = src;
        })
    )
  );

  // Media recorder
  const canvasStream = canvas.captureStream(30);
  // mix canvas + audio
  const audioStream = dest.stream;
  const audioTrack = audioStream.getAudioTracks()[0];
  if (audioTrack) canvasStream.addTrack(audioTrack);

  // Pilih codec terbaik yang didukung
  const mimeCandidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  let mimeType = "";
  for (const m of mimeCandidates) {
    if (MediaRecorder.isTypeSupported(m)) {
      mimeType = m;
      break;
    }
  }
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: mimeType || "video/webm",
    videoBitsPerSecond: 5_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
    recorder.onerror = (ev) => reject(ev);
  });

  // Play audio (buffer source)
  let srcNode: AudioBufferSourceNode | null = null;
  if (audioBuffer) {
    srcNode = actx.createBufferSource();
    srcNode.buffer = audioBuffer;
    srcNode.connect(analyser);
  }

  // Animasi loop
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const td = new Uint8Array(analyser.fftSize);
  const startT = actx.currentTime;
  let raf = 0;

  recorder.start(100);
  if (srcNode) {
    if (actx.state === "suspended") await actx.resume();
    srcNode.start(0);
  }

  const draw = () => {
    const elapsed = actx.currentTime - startT;
    const prog = Math.min(1, elapsed / totalDuration);
    onProgress?.(prog);

    // slide index
    const slideF = elapsed / slideDuration;
    const slideIdx = Math.min(loadedImgs.length - 1, Math.floor(slideF));
    const slideLocal = slideF - slideIdx; // 0..1
    const nextIdx = Math.min(loadedImgs.length - 1, slideIdx + 1);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const drawImg = (img: HTMLImageElement, alpha: number, zoom: number) => {
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    };

    if (transition === "zoom") {
      drawImg(loadedImgs[slideIdx], 1, 1 + slideLocal * 0.08);
      if (slideLocal > 0.75 && nextIdx !== slideIdx) {
        drawImg(loadedImgs[nextIdx], (slideLocal - 0.75) * 4, 1);
      }
    } else if (transition === "fade") {
      drawImg(loadedImgs[slideIdx], 1, 1);
      if (slideLocal > 0.7 && nextIdx !== slideIdx) {
        drawImg(loadedImgs[nextIdx], (slideLocal - 0.7) / 0.3, 1);
      }
    } else {
      drawImg(loadedImgs[slideIdx], 1, 1);
    }

    // dark gradient bawah buat text & spectrum
    const grd = ctx.createLinearGradient(0, height * 0.55, 0, height);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    // Title overlay
    if (title) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 30, width, 90);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 48px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 12;
      ctx.fillText(title, width / 2, 90);
      ctx.shadowBlur = 0;
    }

    // Spectrum di atas canvas (overlay)
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(td);
    drawSpectrum(ctx, freq, td, vizStyle, vizColor, width, height, elapsed);

    if (elapsed < totalDuration) {
      raf = requestAnimationFrame(draw);
    } else {
      // berhenti
      setTimeout(() => {
        try { recorder.stop(); } catch {}
        try { srcNode?.stop(); } catch {}
      }, 300);
      return;
    }
  };
  raf = requestAnimationFrame(draw);

  const blob = await done;
  cancelAnimationFrame(raf);
  try { actx.close(); } catch {}
  return blob;
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array,
  td: Uint8Array,
  style: VizStyle,
  color: string,
  W: number,
  H: number,
  t: number
) {
  const bass = avgBand(freq, 0, 0.08);
  // bars (bottom)
  if (style === "bars") {
    const bars = 64;
    const bw = (W * 0.9) / bars;
    const step = Math.floor(freq.length / bars);
    const baseY = H - 20;
    // reflect
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.translate(0, baseY + 4);
    ctx.scale(1, -0.35);
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 30 + v * H * 0.35;
      ctx.fillStyle = color;
      roundRect(ctx, W * 0.05 + i * bw + 2, 0, bw - 4, h, 3);
      ctx.fill();
    }
    ctx.restore();

    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    const grd = ctx.createLinearGradient(0, baseY, 0, 0);
    grd.addColorStop(0, color);
    grd.addColorStop(0.5, "#a855f7");
    grd.addColorStop(1, "#22d3ee");
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 30 + v * H * 0.35;
      ctx.fillStyle = grd;
      roundRect(ctx, W * 0.05 + i * bw + 2, baseY - h, bw - 4, h, 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else if (style === "circle") {
    const cx = W / 2, cy = H * 0.45;
    const rBase = 120 + bass * 70;
    const barsN = 128;
    ctx.shadowBlur = 22;
    ctx.shadowColor = color;
    for (let i = 0; i < barsN; i++) {
      const v = freq[i % freq.length] / 255;
      const a = (i / barsN) * Math.PI * 2 - Math.PI / 2 + t * 0.2;
      const r1 = rBase;
      const r2 = rBase + 25 + v * 160;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
    // glow center
    const glowR = 60 + bass * 60;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    rg.addColorStop(0, "rgba(255,255,255,0.9)");
    rg.addColorStop(0.4, hexA(color, 0.5));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (style === "particles") {
    // pakai pseudo-random partikel berbasis time
    const N = 180;
    for (let i = 0; i < N; i++) {
      const seed = i * 0.37;
      const x = ((Math.sin(seed * 3.1 + t * 0.3) * 0.5 + 0.5) * W + t * 40 * ((i % 5) * 0.02 + 0.9)) % W;
      const y = (Math.cos(seed * 1.7 + t * 0.4) * 0.5 + 0.5) * H;
      const f = freq[i % freq.length] / 255;
      ctx.fillStyle = hexA(color, 0.4 + f * 0.6);
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(x, y, 1 + f * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // outer ring dots
    const cx = W / 2, cy = H * 0.5;
    const rBase = 200 + bass * 90;
    for (let i = 0; i < 180; i++) {
      const v = freq[i % freq.length] / 255;
      const a = (i / 180) * Math.PI * 2 + t * 0.3;
      const r = rBase + v * 70;
      ctx.fillStyle = hexA(color, 0.6);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + v * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function avgBand(freq: Uint8Array, a: number, b: number) {
  const start = Math.floor(freq.length * a);
  const end = Math.floor(freq.length * b);
  let s = 0;
  for (let i = start; i < end; i++) s += freq[i];
  return (s / Math.max(1, end - start)) / 255;
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
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
