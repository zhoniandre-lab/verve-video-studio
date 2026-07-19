"use client";
import { useEffect, useRef } from "react";

type Style = "bars" | "circle" | "ncs" | "particles" | "luxury" | "trapnation" | "monstercat" | "proximity" | "retrowave" | "dubstep" | "tunnel"
  | "wave" | "radial-bars" | "bars-top" | "pulse" | "equalizer" | "minimal" | "none";

interface Props {
  audioEl?: HTMLAudioElement | null;
  audioStream?: MediaStream;
  style?: Style;
  color?: string;
  animateIdle?: boolean;
  width?: number;
  height?: number;
  /** optional logo/text di tengah */
  logo?: string;
  /** URL gambar logo untuk ditampilkan di tengah */
  logoUrl?: string;
}

/**
 * Audio spectrum visualizer dengan 4 mode mewah:
 * - bars     : Trap Nation classic bars + mirror reflection + bass pulse glow
 * - circle   : Circular radial spectrum + center glow
 * - particles: Particle dots di atas spectrum ring
 * - luxury   : PREMIUM — Trap Nation / NCS style: bars + mirror + glow + vignette +
 *             center logo pulse ikut beat + floating sparkles + moving gradient background
 */
export default function SpectrumVisualizer({
  audioEl,
  audioStream,
  style = "luxury",
  color = "#ec4899",
  animateIdle = true,
  width = 1280,
  height = 720,
  logo,
  logoUrl,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number; a: number; hue: number }[]>([]);
  const sparklesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }[]>([]);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // Load logo image
  useEffect(() => {
    if (!logoUrl) { logoImgRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { logoImgRef.current = img; };
    img.src = logoUrl;
  }, [logoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let freqArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
    let timeArray: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
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
          a.fftSize = style === "luxury" ? 512 : 256;
          a.smoothingTimeConstant = 0.82;
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
        freqArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        timeArray = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const resume = () => { if (ctxA.state === "suspended") ctxA.resume(); };
        audioEl?.addEventListener("play", resume);
        cleanupFns.push(() => audioEl?.removeEventListener("play", resume));
      } catch (e) {
        console.warn("Audio setup:", e);
      }
    };
    setupAudio();

    // init particles
    if (particlesRef.current.length === 0) {
      const n = style === "luxury" ? 120 : 90;
      for (let i = 0; i < n; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          r: Math.random() * 2 + 0.6,
          a: Math.random() * 0.5 + 0.2,
          hue: Math.random() * 360,
        });
      }
    }

    let t = 0;
    const render = () => {
      t += 0.02;
      ctx.clearRect(0, 0, width, height);

      let bass = 0, mid = 0, treb = 0, avg = 0;
      if (analyserRef.current) {
        const a = analyserRef.current;
        a.getByteFrequencyData(freqArray);
        a.getByteTimeDomainData(timeArray);
        const len = freqArray.length;
        const bassEnd = Math.floor(len * 0.08);
        const midEnd = Math.floor(len * 0.35);
        for (let i = 0; i < bassEnd; i++) bass += freqArray[i];
        for (let i = bassEnd; i < midEnd; i++) mid += freqArray[i];
        for (let i = midEnd; i < len; i++) treb += freqArray[i];
        for (let i = 0; i < len; i++) avg += freqArray[i];
        bass /= bassEnd || 1;
        mid /= (midEnd - bassEnd) || 1;
        treb /= (len - midEnd) || 1;
        avg /= len;
      } else if (animateIdle) {
        bass = 90 + Math.sin(t * 1.7) * 30 + Math.sin(t * 4.3) * 15;
        mid = 80 + Math.sin(t * 2.3 + 1) * 30 + Math.cos(t * 5.1) * 10;
        treb = 70 + Math.sin(t * 3.9 + 2) * 28;
        avg = (bass + mid + treb) / 3;
        freqArray = new Uint8Array(new ArrayBuffer(256));
        const fa = freqArray;
        for (let i = 0; i < 256; i++) {
          fa[i] = Math.max(0, Math.min(255,
            60 + Math.sin(t * 2 + i * 0.12) * 45 + Math.sin(t * 5.5 + i * 0.25) * 25 + (Math.random() - 0.5) * 15));
        }
      }

      const nBass = bass / 255;
      const nMid = mid / 255;
      const nTreb = treb / 255;
      const nAvg = avg / 255;

      if (style === "luxury") drawLuxury(ctx, freqArray, timeArray, nBass, nMid, nTreb, nAvg, t, width, height, color, logo, logoImgRef.current);
      else if (style === "bars") drawBars(ctx, freqArray, nBass, width, height, color);
      else if (style === "circle" || style === "ncs") drawCircle(ctx, freqArray, nBass, t, width, height, color);
      else if (style === "particles") drawParticlesMode(ctx, freqArray, nBass, t, width, height, color);
      else drawOtherStyles(ctx, freqArray, nBass, nMid, nAvg, t, width, height, color, style);

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupFns.forEach((f) => f());
    };
  }, [audioEl, audioStream, style, color, width, height, animateIdle, logo]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full pointer-events-none"
      style={{ position: "absolute", inset: 0 }}
    />
  );

  // =========== DRAW FUNCTIONS ===========

  function drawBars(ctx: CanvasRenderingContext2D, freq: Uint8Array<ArrayBuffer>, bass: number, W: number, H: number, c: string) {
    const bars = 64;
    const bw = (W * 0.92) / bars;
    const step = Math.max(1, Math.floor(freq.length / bars));
    const baseY = H - 20;
    const grad = barGrad(ctx, c, W, H);
    // reflection
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, baseY + 4);
    ctx.scale(1, -0.4);
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      roundRect(ctx, W * 0.04 + i * bw + 2, 0, bw - 4, 40 + v * H * 0.4, 3);
      ctx.fillStyle = grad; ctx.fill();
    }
    ctx.restore();
    ctx.shadowBlur = 18;
    ctx.shadowColor = c;
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 40 + v * H * 0.4;
      roundRect(ctx, W * 0.04 + i * bw + 2, baseY - h, bw - 4, h, 3);
      ctx.fillStyle = grad; ctx.fill();
    }
    ctx.shadowBlur = 0;
    // bass circle
    ctx.beginPath();
    ctx.arc(W/2, H - 40, 12 + bass * 28, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.globalAlpha = 0.5 + bass*0.5; ctx.fill(); ctx.globalAlpha=1;
  }

  function drawCircle(ctx: CanvasRenderingContext2D, freq: Uint8Array<ArrayBuffer>, bass: number, t: number, W: number, H: number, c: string) {
    const cx=W/2, cy=H/2, rBase=140+bass*80, bars=128;
    ctx.shadowBlur=25; ctx.shadowColor=c; ctx.lineWidth=3;
    for (let i=0;i<bars;i++){
      const v=freq[i%freq.length]/255;
      const a=(i/bars)*Math.PI*2 - Math.PI/2 + t*0.2;
      const r2=rBase+30+v*170;
      ctx.strokeStyle=c;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*rBase,cy+Math.sin(a)*rBase);
      ctx.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2);
      ctx.stroke();
    }
    const glowR=80+bass*60;
    const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,glowR);
    rg.addColorStop(0,"rgba(255,255,255,0.9)");
    rg.addColorStop(0.3,hexA(c,0.6));
    rg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(cx,cy,glowR,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
  }

  function drawParticlesMode(ctx: CanvasRenderingContext2D, freq: Uint8Array<ArrayBuffer>, bass: number, t: number, W: number, H: number, c: string) {
    const ps=particlesRef.current;
    for(const p of ps){
      const fi=Math.floor(((p.x+p.y)%W)/W*freq.length);
      const f=(freq[fi]||80)/255;
      p.vx+=(Math.random()-0.5)*(0.2+f); p.vy+=(Math.random()-0.5)*(0.2+f)-0.02;
      p.vx*=0.97; p.vy*=0.97; p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.fillStyle=hexA(c,p.a); ctx.shadowBlur=12; ctx.shadowColor=c;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r+f*2,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;
    const cx=W/2, cy=H/2, rBase=200+bass*100;
    for(let i=0;i<180;i++){
      const v=freq[i%freq.length]/255;
      const a=(i/180)*Math.PI*2+t*0.3;
      ctx.fillStyle=hexA(c,0.6);
      ctx.beginPath(); ctx.arc(cx+Math.cos(a)*(rBase+v*80),cy+Math.sin(a)*(rBase+v*80),1+v*2,0,Math.PI*2); ctx.fill();
    }
  }

  // ===== LUXURY (Trap Nation / NCS style) =====
  function drawLuxury(
    ctx: CanvasRenderingContext2D,
    freq: Uint8Array<ArrayBuffer>,
    timeArr: Uint8Array<ArrayBuffer>,
    bass: number, mid: number, treb: number, avg: number,
    t: number, W: number, H: number, c: string, textLogo?: string, logoImg?: HTMLImageElement|null,
  ) {
    // 1. Animated moving gradient background (subtle)
    const bg = ctx.createRadialGradient(W/2 + Math.sin(t*0.3)*200, H*0.3 + Math.cos(t*0.4)*100, 50, W/2, H/2, Math.max(W,H));
    bg.addColorStop(0, hexA(c, 0.08 + bass*0.12));
    bg.addColorStop(0.5, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    // 2. Bars (bottom) with gradient + glow
    const bars = 72;
    const bw = (W * 0.92) / bars;
    const step = Math.max(1, Math.floor(freq.length / bars));
    const baseY = H - 10;
    const grad = ctx.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, c);
    grad.addColorStop(0.5, "#a855f7");
    grad.addColorStop(1, "#22d3ee");

    // Reflection (mirror bawah — flipped transparan)
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.translate(0, baseY);
    ctx.scale(1, -0.5);
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 30 + v * H * 0.35;
      const x = W * 0.04 + i * bw;
      ctx.fillStyle = grad;
      roundRect(ctx, x + 1.5, 0, bw - 3, h, 3);
      ctx.fill();
    }
    ctx.restore();

    // Bars utama (naik ke atas)
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = c;
    for (let i = 0; i < bars; i++) {
      const v = freq[i * step] / 255;
      const h = 30 + v * H * 0.42;
      const x = W * 0.04 + i * bw;
      ctx.fillStyle = grad;
      roundRect(ctx, x + 1.5, baseY - h, bw - 3, h, 3);
      ctx.fill();
    }
    ctx.restore();

    // 3. Vignette (gelap di pinggir)
    const vig = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.35, W/2, H/2, Math.max(W,H)*0.75);
    vig.addColorStop(0,"rgba(0,0,0,0)");
    vig.addColorStop(1,"rgba(0,0,0,0.75)");
    ctx.fillStyle = vig;
    ctx.fillRect(0,0,W,H);

    // 4. Center pulsing logo (lingkaran glow ikut bass) + di dalamnya opsional text
    const cx = W/2;
    const cy = H*0.42;
    const logoR = Math.min(W,H) * (0.13 + bass*0.05);
    const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, logoR*2.4);
    lg.addColorStop(0, hexA("#ffffff", 0.95));
    lg.addColorStop(0.15, hexA(c, 0.85));
    lg.addColorStop(0.4, hexA(c, 0.3));
    lg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(cx, cy, logoR*2.4, 0, Math.PI*2);
    ctx.fill();

    // Inner ring ikut beat
    ctx.strokeStyle = hexA("#ffffff", 0.9);
    ctx.lineWidth = 3 + bass*3;
    ctx.shadowBlur = 30;
    ctx.shadowColor = c;
    ctx.beginPath();
    ctx.arc(cx, cy, logoR*(0.9 + bass*0.15), 0, Math.PI*2);
    ctx.stroke();

    // Outer rotating ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t*0.4);
    ctx.strokeStyle = hexA(c, 0.4);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, logoR*1.6, 0, Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.shadowBlur = 0;

    // Logo gambar atau text
    if (logoImg) {
      const size = logoR*1.6;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy,size/2,0,Math.PI*2); ctx.clip();
      ctx.drawImage(logoImg, cx-size/2, cy-size/2, size, size);
      ctx.restore();
    } else if (textLogo) {
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fs = Math.min(logoR*0.35, 56);
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 10;
      const words = textLogo.split(" ");
      const line1 = words.slice(0, Math.ceil(words.length/2)).join(" ");
      const line2 = words.slice(Math.ceil(words.length/2)).join(" ");
      if (line2) {
        ctx.fillText(line1, cx, cy - fs*0.55);
        ctx.fillText(line2, cx, cy + fs*0.55);
      } else {
        ctx.fillText(line1, cx, cy);
      }
      ctx.shadowBlur = 0;
    } else {
      // default logo icon
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${logoR*0.7}px system-ui, sans-serif`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("♪", cx, cy);
    }

    // 5. Sparkles (muncul saat bass tinggi)
    if (sparklesRef.current.length < 80 && bass > 0.5) {
      for (let i=0;i<3;i++){
        const ang = Math.random()*Math.PI*2;
        const speed = 1 + Math.random()*3;
        sparklesRef.current.push({
          x: cx + Math.cos(ang)*logoR*1.3,
          y: cy + Math.sin(ang)*logoR*1.3,
          vx: Math.cos(ang)*speed,
          vy: Math.sin(ang)*speed,
          life: 0,
          maxLife: 40 + Math.random()*30,
          color: Math.random()<0.5?c:"#ffffff",
        });
      }
    }
    for (let i=sparklesRef.current.length-1;i>=0;i--){
      const s = sparklesRef.current[i];
      s.x += s.vx; s.y += s.vy;
      s.vx *= 0.98; s.vy *= 0.98;
      s.life++;
      const alpha = 1 - s.life/s.maxLife;
      ctx.fillStyle = hexA(s.color, alpha);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.5 + alpha*2, 0, Math.PI*2);
      ctx.fill();
      if (s.life >= s.maxLife) sparklesRef.current.splice(i,1);
    }

    // 6. Subtle floating particles background (mengambang ikut musik)
    for(const p of particlesRef.current){
      const fi = Math.floor(((p.x+p.y)%W)/W*freq.length);
      const f = (freq[fi]||80)/255;
      p.vx += (Math.random()-0.5)*(0.1+f*0.4);
      p.vy += (Math.random()-0.5)*(0.1+f*0.4)-0.01;
      p.vx*=0.98; p.vy*=0.98;
      p.x += p.vx; p.y += p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.fillStyle = hexA(c, p.a * (0.4 + avg*0.6));
      ctx.shadowBlur = 8;
      ctx.shadowColor = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + f*1.5, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 7. Waveform di sekeliling logo
    ctx.strokeStyle = hexA("#ffffff", 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const wr = logoR*2;
    if (timeArr.length) {
      for (let i = 0; i < timeArr.length; i++) {
        const v = (timeArr[i] - 128)/128;
        const a = (i/timeArr.length)*Math.PI*2 - Math.PI/2 + t*0.1;
        const r = wr + v*12;
        const x = cx + Math.cos(a)*r;
        const y = cy + Math.sin(a)*r;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
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
function barGrad(ctx: CanvasRenderingContext2D, c: string, _W: number, H: number) {
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, c);
  g.addColorStop(0.5, "#a855f7");
  g.addColorStop(1, "#22d3ee");
  return g;
}

// Draw styles lain untuk preview (mirip logic di recorder)
function drawOtherStyles(
  ctx: CanvasRenderingContext2D,
  freq: Uint8Array<ArrayBuffer>,
  bass: number, mid: number, avg: number,
  t: number, W: number, H: number, c: string,
  style: string,
) {
  const bars = 64;
  const step = Math.max(1, Math.floor(freq.length / bars));
  const vals: number[] = [];
  for (let i=0;i<bars;i++) vals.push((freq[i*step]||0)/255);

  if (style === "trapnation") {
    ctx.save();
    ctx.translate(W/2, H*0.4);
    const R = Math.min(W,H)*0.1*(1+bass*0.4);
    ctx.rotate(-t*0.8);
    for (let ring=0; ring<2; ring++) {
      ctx.strokeStyle = hexA(c, 0.6-ring*0.2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i=0;i<bars;i++){
        const a = (i/bars)*Math.PI*2;
        const rr = R + ring*20 + vals[i]*Math.min(W,H)*0.3;
        const x=Math.cos(a)*rr, y=Math.sin(a)*rr;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.rotate(t*0.8);
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 25; ctx.shadowColor = c;
    ctx.beginPath(); ctx.arc(0,0,R*0.6,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  else if (style === "monstercat") {
    ctx.save(); ctx.translate(W/2,H*0.4);
    for (let i=0;i<bars;i++){
      const a=(i/bars)*Math.PI*2-Math.PI/2;
      const rr = Math.min(W,H)*0.15 + vals[i]*Math.min(W,H)*0.28;
      ctx.fillStyle = hexA(c,0.9);
      ctx.beginPath(); ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr,2+vals[i]*8,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  else if (style === "proximity") {
    const nb = bars; const bw = (W*0.8)/nb*0.8;
    for (let i=0;i<nb;i++){
      const v = vals[i]; const h = v*H*0.3;
      const x = W/2+(i-nb/2)*(bw+3);
      ctx.fillStyle = hexA(c,0.85);
      roundRect(ctx, x-bw/2, H-h-8, bw, h, bw/2); ctx.fill();
      roundRect(ctx, x-bw/2, 8, bw, h*0.5, bw/2); ctx.fill();
    }
  }
  else if (style === "dubstep") {
    const cy = H*0.5; const bw=W/bars*0.6, gap=W/bars*0.4;
    for (let i=0;i<bars;i++){
      const h = vals[i]*H*0.45; const x=i*(bw+gap)+gap/2;
      const g = ctx.createLinearGradient(0,cy-h/2,0,cy+h/2);
      g.addColorStop(0,"rgba(255,255,255,0.9)"); g.addColorStop(0.5,c); g.addColorStop(1,"rgba(255,255,255,0.2)");
      ctx.fillStyle = g;
      roundRect(ctx, x, cy-h/2, bw, h, bw*0.3); ctx.fill();
    }
  }
  else if (style === "retrowave") {
    const sunY = H*0.5; const sunR = Math.min(W,H)*0.18;
    const sg = ctx.createLinearGradient(0,sunY-sunR,0,sunY+sunR);
    sg.addColorStop(0,c); sg.addColorStop(1,"rgba(255,120,60,0.6)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W/2,sunY,sunR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = hexA(c,0.4+bass*0.4); ctx.lineWidth=1;
    for (let i=0;i<10;i++){
      const yy = H*0.6 + (i/10)*H*0.35;
      ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(W,yy); ctx.stroke();
    }
    const bw=W/bars*0.75;
    for (let i=0;i<bars;i++){
      const h = vals[i]*H*0.2;
      ctx.fillStyle = hexA(c,0.9);
      roundRect(ctx, i*(bw+W/bars*0.25)+W/bars*0.12, H-h-4, bw, h, 2); ctx.fill();
    }
  }
  else if (style === "tunnel") {
    ctx.save(); ctx.translate(W/2,H*0.4);
    const rings = 10;
    for (let i=rings-1;i>=0;i--){
      const k = (i+((t*2)%1))/rings;
      const sz = k*Math.min(W,H)*0.8;
      ctx.strokeStyle = hexA(c, 0.2+(1-k)*0.5);
      ctx.lineWidth=2;
      ctx.strokeRect(-sz/2,-sz*9/16/2,sz,sz*9/16);
    }
    ctx.restore();
  }
}
function hexA(hex: string, a: number) {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x+x).join("") : c;
  const r = parseInt(f.slice(0,2),16);
  const g = parseInt(f.slice(2,4),16);
  const b = parseInt(f.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
