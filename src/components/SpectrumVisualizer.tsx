"use client";
import { useEffect, useRef } from "react";

type Style = "bars" | "circle" | "particles";

interface Props {
  audioEl?: HTMLAudioElement | null;
  audioStream?: MediaStream; // untuk render live
  style?: Style;
  color?: string;
  /** dipakai kalau audioEl null (idle animasi) */
  animateIdle?: boolean;
  width?: number;
  height?: number;
}

/**
 * Audio spectrum visualizer keren dengan 3 mode, memakai Web Audio API + Canvas.
 * - Bars     : bar vertikal naik/turun ikut beat (mirip YouTube music channels)
 * - Circle   : waveform radial berdenyut (ala trap/nation)
 * - Particles: partikel menari ikut frekuensi + lingkaran spectrum
 */
export default function SpectrumVisualizer({
  audioEl,
  audioStream,
  style = "bars",
  color = "#ec4899",
  animateIdle = true,
  width = 1280,
  height = 720,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number; a: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Setup audio if present
    let dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
    let freqArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
    const cleanupFns: (() => void)[] = [];

    const setupAudio = () => {
      if (!audioEl && !audioStream) return;
      try {
        if (!audioCtxRef.current) {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AC();
        }
        const ctxA = audioCtxRef.current!;
        if (!analyserRef.current) {
          const a = ctxA.createAnalyser();
          a.fftSize = 512;
          a.smoothingTimeConstant = 0.8;
          analyserRef.current = a;
        }
        const analyser = analyserRef.current;

        if (audioEl && !sourceRef.current) {
          const src = ctxA.createMediaElementSource(audioEl);
          src.connect(analyser);
          analyser.connect(ctxA.destination);
          sourceRef.current = src;
        } else if (audioStream && !sourceRef.current) {
          const src = ctxA.createMediaStreamSource(audioStream);
          src.connect(analyser);
          sourceRef.current = src;
        }

        dataArray = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
        freqArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

        const resume = () => {
          if (ctxA.state === "suspended") ctxA.resume();
        };
        audioEl?.addEventListener("play", resume);
        cleanupFns.push(() => audioEl?.removeEventListener("play", resume));
      } catch (e) {
        console.warn("Audio setup error:", e);
      }
    };
    setupAudio();

    // init particles
    if (style === "particles" && particlesRef.current.length === 0) {
      for (let i = 0; i < 120; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          r: Math.random() * 2 + 0.6,
          a: Math.random() * 0.5 + 0.2,
        });
      }
    }

    let t = 0;
    const render = () => {
      t += 0.02;
      ctx.clearRect(0, 0, width, height);
      // transparent bg (supaya bisa di-composite di atas video)
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, width, height);

      let bass = 0, mid = 0, treb = 0;
      if (analyserRef.current) {
        const a = analyserRef.current;
        a.getByteTimeDomainData(dataArray);
        a.getByteFrequencyData(freqArray);
        // bands
        const len = freqArray.length;
        const bassEnd = Math.floor(len * 0.08);
        const midEnd = Math.floor(len * 0.35);
        for (let i = 0; i < bassEnd; i++) bass += freqArray[i];
        for (let i = bassEnd; i < midEnd; i++) mid += freqArray[i];
        for (let i = midEnd; i < len; i++) treb += freqArray[i];
        bass /= bassEnd || 1;
        mid /= (midEnd - bassEnd) || 1;
        treb /= (len - midEnd) || 1;
      } else if (animateIdle) {
        // fake spectrum dari noise halus
        bass = 90 + Math.sin(t * 1.7) * 30 + Math.sin(t * 4.3) * 15;
        mid = 80 + Math.sin(t * 2.3 + 1) * 30 + Math.cos(t * 5.1) * 10;
        treb = 70 + Math.sin(t * 3.9 + 2) * 28;
        freqArray = new Uint8Array(256) as Uint8Array<ArrayBuffer>;
        const fa = freqArray;
        for (let i = 0; i < 256; i++) {
          fa[i] = Math.max(0, Math.min(255,
            60 + Math.sin(t * 2 + i * 0.1) * 40 + Math.sin(t * 6 + i * 0.25) * 25 + (Math.random() - 0.5) * 20));
        }
      }

      const normBass = bass / 255;
      const normMid = mid / 255;
      const normTreb = treb / 255;

      // gradient helper
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, "#a855f7");
      grad.addColorStop(1, "#22d3ee");

      if (style === "bars") {
        const bars = 64;
        const bw = (width * 0.9) / bars;
        const step = Math.floor(freqArray.length / bars);
        const baseY = height - 20;
        // mirror reflect
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.translate(0, baseY + 10);
        ctx.scale(1, -0.4);
        for (let i = 0; i < bars; i++) {
          const v = freqArray[i * step] / 255;
          const h = 40 + v * (height * 0.45);
          const x = width * 0.05 + i * bw;
          ctx.fillStyle = grad;
          roundRect(ctx, x + 2, 0, bw - 4, h, 4);
          ctx.fill();
        }
        ctx.restore();

        // bars atas
        ctx.shadowBlur = 18;
        ctx.shadowColor = color;
        for (let i = 0; i < bars; i++) {
          const v = freqArray[i * step] / 255;
          const h = 40 + v * (height * 0.45);
          const x = width * 0.05 + i * bw;
          ctx.fillStyle = grad;
          roundRect(ctx, x + 2, baseY - h, bw - 4, h, 4);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // bass pulse at center
        ctx.beginPath();
        ctx.arc(width / 2, height - 40, 12 + normBass * 28, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5 + normBass * 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (style === "circle") {
        const cx = width / 2, cy = height / 2;
        const rBase = 140 + normBass * 80;
        const bars = 128;
        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        ctx.lineWidth = 3;
        for (let i = 0; i < bars; i++) {
          const v = freqArray[i % freqArray.length] / 255;
          const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const r1 = rBase;
          const r2 = rBase + 30 + v * 180;
          const x1 = cx + Math.cos(a) * r1;
          const y1 = cy + Math.sin(a) * r1;
          const x2 = cx + Math.cos(a) * r2;
          const y2 = cy + Math.sin(a) * r2;
          const gr = ctx.createLinearGradient(x1, y1, x2, y2);
          gr.addColorStop(0, "#22d3ee");
          gr.addColorStop(0.5, color);
          gr.addColorStop(1, "#f59e0b");
          ctx.strokeStyle = gr;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // center glow
        const glowR = 80 + normBass * 60;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        rg.addColorStop(0, "rgba(255,255,255,0.9)");
        rg.addColorStop(0.3, hexA(color, 0.6));
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (style === "particles") {
        // particles
        const ps = particlesRef.current;
        for (const p of ps) {
          // influence dari freq
          const freqI = Math.floor(((p.x + p.y) % width) / width * freqArray.length);
          const f = (freqArray[freqI] || 80) / 255;
          p.vx += (Math.random() - 0.5) * (0.2 + f);
          p.vy += (Math.random() - 0.5) * (0.2 + f) - 0.02;
          p.vx *= 0.97;
          p.vy *= 0.97;
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;
          ctx.fillStyle = hexA(color, p.a);
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + f * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        // lingkaran spectrum
        const cx = width / 2, cy = height / 2;
        const rBase = 200 + normBass * 100;
        ctx.lineWidth = 2;
        for (let i = 0; i < 180; i++) {
          const v = freqArray[i % freqArray.length] / 255;
          const a = (i / 180) * Math.PI * 2;
          const r = rBase + v * 80;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          ctx.fillStyle = hexA(color, 0.6);
          ctx.beginPath();
          ctx.arc(x, y, 1 + v * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // waveform ring
        ctx.strokeStyle = hexA(color, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const wr = 120;
        if (dataArray.length) {
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            const a = (i / dataArray.length) * Math.PI * 2;
            const r = wr + v * 30;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }
        // flash jika bass tinggi
        if (normBass > 0.6) {
          ctx.fillStyle = hexA("#ffffff", (normBass - 0.6) * 0.15);
          ctx.fillRect(0, 0, width, height);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupFns.forEach((f) => f());
    };
  }, [audioEl, audioStream, style, color, width, height, animateIdle]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full pointer-events-none"
      style={{ position: "absolute", inset: 0 }}
    />
  );
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
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
