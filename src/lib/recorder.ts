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

export type Quality = "fast" | "balanced" | "high" | "max";
export type Transition = "zoom" | "fade" | "slide" | "blur" | "glitch" | "none";
export type CaptionStyle = "capcut" | "pop" | "neon" | "karaoke" | "none";

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
  onProgress?: (p: number) => void;
  onStage?: (s: string) => void;
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

async function decodeAudio(url: string, onStage?:(s:string)=>void) {
  onStage?.("Decoding audio...");
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const AC = (window.AudioContext || (window as any).webkitAudioContext);
  const actx = new AC();
  const audioBuf = await actx.decodeAudioData(buf.slice(0));
  const ch0 = audioBuf.getChannelData(0);
  let data = ch0;
  if (audioBuf.numberOfChannels > 1) {
    const ch1 = audioBuf.getChannelData(1);
    data = new Float32Array(ch0.length);
    for (let i=0;i<ch0.length;i++) data[i] = (ch0[i]+ch1[i])*0.5;
  }
  actx.close();
  return { data, sampleRate: audioBuf.sampleRate, channels: audioBuf.numberOfChannels, duration: audioBuf.duration };
}

async function prepareImages(sources: string[], W:number, H:number, onStage?:(s:string)=>void): Promise<HTMLCanvasElement[]> {
  onStage?.("Memproses gambar...");
  const out: HTMLCanvasElement[] = [];
  for (let i=0; i<sources.length; i++) {
    onStage?.(`Memproses gambar ${i+1}/${sources.length}...`);
    const img = await loadImage(sources[i]);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const cx = c.getContext("2d", { alpha: false })!;
    const ir = img.naturalWidth/img.naturalHeight;
    const cr = W/H;
    let sx=0, sy=0, sw=img.naturalWidth, sh=img.naturalHeight;
    if (ir > cr) { sw = img.naturalHeight*cr; sx = (img.naturalWidth-sw)/2; }
    else { sh = img.naturalWidth/cr; sy = (img.naturalHeight-sh)/2; }
    cx.fillStyle = "#000"; cx.fillRect(0,0,W,H);
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    out.push(c);
    if (i%2===0) await new Promise(r=>setTimeout(r,0));
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = ()=>resolve(img);
    img.onerror = ()=>reject(new Error("Gagal load gambar"));
    img.decoding = "async";
    img.src = src;
  });
}

// ===== Pre-compute spectrum table (LUT) — inilah boost speed utama =====
function precomputeSpectrum(
  audioData: Float32Array|null, sampleRate:number,
  totalFrames:number, fps:number, barCount:number
): { bars: Float32Array[]; beats: Uint8Array; bassLevels: Float32Array } {
  onStage2?.("Menganalisis audio (pre-compute spectrum)...");
  const barsArr: Float32Array[] = new Array(totalFrames);
  const beats = new Uint8Array(totalFrames);
  const bassLevels = new Float32Array(totalFrames);
  const smooth = new Float32Array(barCount);
  const bassRef = { level: 0, beat: false };
  const N = 1024;
  const bassEnd = Math.floor(barCount*0.12) || 1;
  // Frekuensi per bar (log scale: 80Hz - 16kHz)
  const freqs = new Array(barCount);
  const periods = new Array(barCount);
  const steps = new Array(barCount);
  for (let b=0; b<barCount; b++) {
    freqs[b] = 80 * Math.pow(20, b/barCount);
    periods[b] = sampleRate / freqs[b];
    steps[b] = Math.max(2, Math.floor(periods[b]/2));
  }
  // Pre-compute hann window
  const hann = new Float32Array(N);
  for (let i=0;i<N;i++) hann[i] = 0.5*(1-Math.cos(2*Math.PI*i/(N-1)));
  for (let f=0; f<totalFrames; f++) {
    const t = f/fps;
    const posSample = audioData ? Math.floor(t*sampleRate) : 0;
    const out = new Float32Array(barCount);
    if (audioData) {
      const start = Math.max(0, Math.min(posSample - N/2, audioData.length - N));
      const winLen = Math.min(N, audioData.length - start);
      for (let b=0; b<barCount; b++) {
        const step = steps[b];
        let sum=0, cnt=0;
        // Energi per frekuensi (simple Goertzel-like correlation dengan hann window)
        const freq = freqs[b];
        const twoPi_f_over_sr = 2*Math.PI*freq/sampleRate;
        for (let s=0; s<winLen; s+=step) {
          const idx = start + s;
          if (idx<0||idx>=audioData.length) continue;
          const w = hann[s < N ? s : N-1];
          const v = audioData[idx] * w;
          const ang = twoPi_f_over_sr * s;
          const sinv = Math.sin(ang);
          const cosv = Math.cos(ang);
          sum += (v*sinv)*(v*sinv) + (v*cosv)*(v*cosv);
          cnt++;
        }
        const val = cnt ? Math.sqrt(sum/cnt) : 0;
        const target = clamp(val * 3.5 * (1 + b*0.02), 0, 1);
        const a = target > smooth[b] ? 0.7 : 0.15;
        smooth[b] = smooth[b]*(1-a) + target*a;
        out[b] = smooth[b];
      }
    } else {
      for (let b=0;b<barCount;b++) out[b] = 0.05 + Math.sin(t*2+b*0.2)*0.05;
    }
    barsArr[f] = out;
    // bass & beat
    let bsum = 0;
    for (let i=0;i<bassEnd;i++) bsum += out[i];
    const bass = bsum / bassEnd;
    bassRef.level = bassRef.level*0.85 + bass*0.15;
    const isBeat = bass > bassRef.level*1.35 && bass > 0.18;
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
  showTitle?:boolean; showCaption?:boolean;
  logoImg?:HTMLImageElement|HTMLCanvasElement|null; logoPos?:"center"|"corner"|"none";
  captions?:CaptionWord[]; captionStyle?:CaptionStyle;
}

function drawFrame(s: DrawState) {
  const { W,H,bars,rgb,style,imgs,slideIdx,isTransition,nextIdx,transT,slideT,bass,beat } = s;
  const ctx = s._canvas.getContext("2d", { alpha: false, desynchronized: true })!;

  // BG
  const bg = ctx.createRadialGradient(W/2,H/2,0, W/2,H/2,Math.max(W,H)*0.8);
  bg.addColorStop(0,`rgba(${rgb[0]/3|0},${rgb[1]/3|0},${rgb[2]/3|0},0.6)`);
  bg.addColorStop(1,"rgba(5,2,15,1)");
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  // Ken Burns zoom on current
  const cur = imgs[slideIdx % imgs.length];
  const nxt = imgs[nextIdx % imgs.length];
  const zoomBase = 1.0 + slideT*0.08 + (beat?0.02:0);
  const drawImg = (img:HTMLCanvasElement,alpha:number,zoom:number)=>{
    ctx.save(); ctx.globalAlpha = alpha;
    const dw=W*zoom, dh=H*zoom;
    ctx.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
    ctx.restore();
  };
  drawImg(cur,1,zoomBase);
  // Vignette
  const vg = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3, W/2,H/2,Math.max(W,H)*0.75);
  vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.75)");
  ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);

  if (isTransition && nxt) {
    const t = easeInOut(transT);
    if (s._transition==="fade") drawImg(nxt,t,1);
    else if (s._transition==="zoom") { drawImg(cur,1-t,zoomBase*(1-t*0.15)); drawImg(nxt,t,0.95+t*0.05); }
    else if (s._transition==="slide") {
      ctx.save(); ctx.globalAlpha=1-t; ctx.drawImage(cur,-W*t*0.2,0,W,H); ctx.restore();
      ctx.save(); ctx.globalAlpha=t; ctx.drawImage(nxt,W*(1-t),0,W,H); ctx.restore();
    }
    else if (s._transition==="blur") { drawImg(nxt,t,1); ctx.fillStyle=`rgba(0,0,0,${0.5*(1-t)})`; ctx.fillRect(0,0,W,H); }
    else if (s._transition==="glitch") {
      if (t<0.5) drawImg(cur,1,zoomBase); else drawImg(nxt,1,1);
      if (beat||t>0.3){
        ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.5;
        ctx.drawImage(cur||nxt,(Math.random()-0.5)*20*t*20,(Math.random()-0.5)*8,W,H);
        ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
      }
    } else drawImg(nxt,t,1);
  }

  // Glow wash
  ctx.fillStyle = rgba(rgb,0.08+bass*0.15);
  ctx.fillRect(0,0,W,H);

  drawSpectrum(ctx, s);
  drawCaptions(ctx, s);

  if (s.title && s.showTitle) {
    const titleT = Math.min(1,slideT*2);
    ctx.save(); ctx.globalAlpha = titleT;
    ctx.font = `bold ${Math.floor(H*0.055)}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    const ty = H*0.88;
    ctx.shadowColor = rgba(rgb,1); ctx.shadowBlur = 20+bass*30;
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

  // Progress bar
  ctx.fillStyle="rgba(255,255,255,0.12)"; ctx.fillRect(0,H-3,W,3);
  ctx.fillStyle=rgba(rgb,0.9); ctx.fillRect(0,H-3,W*(s.time/s.totalDur),3);
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
  // Karaoke style (fill kiri→kanan)
  else if (style==="karaoke") {
    // (ditangani oleh legacy lyrics renderer)
  }
  ctx.restore();
}

function drawSpectrum(ctx: CanvasRenderingContext2D, s: DrawState) {
  const { W,H,bars,rgb,bass,beat,style } = s;
  const glow = s.profile.glow;
  ctx.save();
  ctx.shadowBlur = glow; ctx.shadowColor = rgba(rgb,1);

  if (style==="luxury"||style==="bars") {
    const barW = W/bars.length*0.75, gap=W/bars.length*0.25, maxH=H*0.35;
    for (let i=0;i<bars.length;i++){
      const v = (bars as any)[i];
      const h = v*maxH, x=i*(barW+gap)+gap/2, y=H-h-4;
      const g = ctx.createLinearGradient(0,y+h,0,y);
      g.addColorStop(0,rgba(rgb,0.9)); g.addColorStop(1,"rgba(255,255,255,0.95)");
      ctx.fillStyle=g; roundRect(ctx,x,y,barW,h,barW*0.4); ctx.fill();
      if (s.profile.reflections){
        ctx.save(); ctx.globalAlpha=0.25; ctx.scale(1,-1);
        roundRect(ctx,x,-H+4,barW,h*0.4,barW*0.4); ctx.fill();
        ctx.restore();
      }
    }
    if (style==="luxury"){
      const pulse = 1+bass*0.4;
      const r = Math.min(W,H)*0.07*pulse;
      ctx.save(); ctx.translate(W/2,H*0.28);
      ctx.shadowBlur=40; ctx.shadowColor=rgba(rgb,1);
      ctx.rotate(s.phase*0.5);
      for (let k=0;k<3;k++){
        ctx.strokeStyle=rgba(rgb,0.4-k*0.1); ctx.lineWidth=2; ctx.setLineDash([8,12]);
        ctx.beginPath(); ctx.arc(0,0,r+k*18+(beat?6:0),0,Math.PI*2); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.rotate(-s.phase*0.5);
      const cg=ctx.createRadialGradient(0,0,0,0,0,r);
      cg.addColorStop(0,"rgba(255,255,255,0.9)"); cg.addColorStop(0.6,rgba(rgb,0.7)); cg.addColorStop(1,rgba(rgb,0.1));
      ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#fff";
      if (s.logoImg && (s.logoPos==="center"||!s.logoPos)){
        const ls=r*1.5; ctx.save();
        ctx.beginPath(); ctx.arc(0,0,ls/2,0,Math.PI*2); ctx.clip();
        ctx.drawImage(s.logoImg,-ls/2,-ls/2,ls,ls); ctx.restore();
      } else {
        ctx.font=`${r}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("♪",0,2);
      }
      ctx.restore();
      if (beat) for (let k=0;k<6;k++) s.particles.push({x:W/2+(Math.random()-0.5)*80,y:H*0.28+(Math.random()-0.5)*60,vx:(Math.random()-0.5)*6,vy:-Math.random()*4-2,life:1,size:Math.random()*3+1});
    }
  }
  else if (style==="circle"){
    ctx.save(); ctx.translate(W/2,H*0.35); ctx.rotate(s.phase*0.2);
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
    ctx.rotate(-s.phase*0.8);
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
    ctx.rotate(s.phase*0.8);
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
      const k=(i+(s.phase*2)%1)/rings, sz=k*Math.min(W,H)*0.8;
      ctx.strokeStyle=rgba(rgb,0.2+(1-k)*0.5); ctx.lineWidth=2;
      ctx.strokeRect(-sz/2,-sz*9/16/2,sz,sz*9/16);
    }
    ctx.restore();
  }
  else if (style==="particles"){
    if(beat) for(let k=0;k<8;k++) s.particles.push({x:W/2+(Math.random()-0.5)*W*0.4,y:H*0.7+(Math.random()-0.5)*40,vx:(Math.random()-0.5)*6,vy:-Math.random()*5-1,life:1,size:Math.random()*3+2});
  }
  // particles
  for(let i=s.particles.length-1;i>=0;i--){
    const p=s.particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life-=0.02;
    if(p.life<=0){s.particles.splice(i,1);continue;}
    ctx.fillStyle=rgba(rgb,p.life);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
  }
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
  return typeof(window as any).VideoEncoder!=="undefined"
    && typeof(window as any).VideoFrame!=="undefined"
    && typeof(window as any).AudioData!=="undefined"
    && (typeof(window as any).MP4Muxer!=="undefined"||typeof(window as any).Mp4Muxer!=="undefined");
}

// ===== Build captions from lyrics per-slide (linear timing) =====
function buildCaptionsFromLyrics(lyrics: string[], slideDur:number, transDur:number, fps:number): CaptionWord[] {
  const out: CaptionWord[] = [];
  const perSlide = slideDur + transDur;
  for (let i=0;i<lyrics.length;i++){
    const line = lyrics[i]?.trim();
    if (!line) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const slideStart = i*perSlide + transDur*0.5;
    const slideActive = slideDur;
    const durPerWord = slideActive / words.length;
    words.forEach((w,j)=>{
      out.push({ text:w, start:slideStart + j*durPerWord, end:slideStart + (j+1)*durPerWord, line:0 });
    });
  }
  return out;
}

// ===== MAIN EXPORT =====
export async function renderSlideshow(opts: RenderOptions): Promise<Blob> {
  const { images, audioUrl, slideDuration, vizStyle, vizColor, title, quality, mobileOptimized,
    transition, onProgress, onStage, ratio, aspectRatio, captions, captionStyle } = opts;
  if (!images.length) throw new Error("Tidak ada gambar");
  const prof = QUALITY_PROFILES[quality]||QUALITY_PROFILES.fast;
  const { w:rW, h:rH } = applyRatio(prof, ratio||aspectRatio||"16:9");
  const canvas = document.createElement("canvas");
  canvas.width = rW; canvas.height = rH;
  const ctx = canvas.getContext("2d",{alpha:false,desynchronized:true})!;
  onStage?.("Menyiapkan aset...");
  const imgs = await prepareImages(images, rW, rH, onStage);

  let logoImg: HTMLImageElement|null = null;
  if (opts.logoUrl && opts.logoPosition!=="none"){
    try{ logoImg = await loadImage(opts.logoUrl); }catch{logoImg=null;}
  }

  let audio: {data:Float32Array;sampleRate:number;duration:number}|null = null;
  if (audioUrl) audio = await decodeAudio(audioUrl, onStage);

  const slideDur = Math.max(1, slideDuration);
  const transDur = clamp(opts.transitionDuration??(mobileOptimized?0.5:0.8),0,slideDur*0.6);
  const perSlide = slideDur+transDur;
  const totalDur = Math.max(audio?.duration||0, imgs.length*slideDur+transDur);

  // Warning: jika musik lebih pendek dari total slide (tanpa TTS)
  if (audio && audio.duration < totalDur - 0.5) {
    onStage?.(`⚠️ Musik (${audio.duration.toFixed(0)}d) lebih pendek dari durasi video (${totalDur.toFixed(0)}d). Akhir video akan hening.`);
    await new Promise(r=>setTimeout(r,1500));
  }

  const fps = prof.fps;
  const totalFrames = Math.floor(totalDur*fps);
  const rgb = hexToRgb(vizColor);

  // ===== PRE-COMPUTE SPECTRUM TABLE (boost besar) =====
  onStage2 = onStage || null;
  const spec = precomputeSpectrum(audio?.data||null, audio?.sampleRate||44100, totalFrames, fps, prof.bars);
  onStage2 = null;

  // Build captions
  let finalCaptions: CaptionWord[] = [];
  let capStyle: CaptionStyle = captionStyle || "capcut";
  if (captions && captions.length) finalCaptions = captions;
  else if (opts.lyrics?.length && opts.showLyrics) {
    finalCaptions = buildCaptionsFromLyrics(opts.lyrics, slideDur, transDur, fps);
  }

  const particles: DrawState["particles"] = [];

  let Mp4Muxer: any = null;
  try{ const mod = await import("mp4-muxer").catch(()=>null); Mp4Muxer = mod?.Muxer || (window as any).Mp4Muxer || (window as any).MP4Muxer; }catch{}

  if (Mp4Muxer && supportsWebCodecs()){
    return renderWebCodecs({canvas,ctx,imgs,audio,fps,totalFrames,totalDur,slideDur,transDur,
      prof,rgb,vizStyle,vizColor,title,transition:transition||"zoom",
      spec, particles, onProgress, onStage, Mp4Muxer,
      logoImg, logoPos: opts.logoPosition||"center",
      captions: finalCaptions, captionStyle: capStyle,
      showTitle: opts.showTitle,
    } as any);
  }
  onStage?.("WebCodecs tidak tersedia, pakai MediaRecorder...");
  return renderMediaRecorder({canvas,imgs,audio,fps,totalDur,slideDur,transDur,
    prof,rgb,vizStyle,vizColor,title,transition:transition||"zoom",spec,particles,onProgress,onStage,
    logoImg,logoPos:opts.logoPosition||"center",
    captions:finalCaptions,captionStyle:capStyle,showTitle:opts.showTitle} as any);
}

interface RenderBase {
  canvas:HTMLCanvasElement; ctx:CanvasRenderingContext2D;
  imgs:HTMLCanvasElement[];
  audio:{data:Float32Array;sampleRate:number;duration:number}|null;
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
  const {canvas,imgs,audio,fps,totalFrames,totalDur,slideDur,transDur,prof,rgb,vizStyle,vizColor,title,transition,spec,particles,onProgress,onStage,Mp4Muxer,logoImg,logoPos,captions,captionStyle,showTitle} = b;
  onStage?.(`Encoding video (${prof.w}x${prof.h} @ ${fps}fps)...`);

  const muxer = new Mp4Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    fastStart:"in-memory",
    video:{codec:"avc",width:canvas.width,height:canvas.height},
    audio: audio?{codec:"aac",sampleRate:audio.sampleRate,numberOfChannels:1}:undefined,
  });

  let videoResolve!:()=>void;
  const videoEncDone = new Promise<void>(res=>{videoResolve=res;});
  const videoEncoder = new (window as any).VideoEncoder({
    output:(chunk:any,meta:any)=>muxer.addVideoChunk(chunk,meta),
    error:(e:any)=>console.error("[VideoEncoder]",e),
  });
  videoEncoder.configure({
    codec:"avc1.42001f", width:canvas.width, height:canvas.height,
    bitrate:prof.videoBitrate, bitrateMode:"variable", framerate:fps,
    latencyMode:"realtime",
  });

  let audioEncoder:any=null,audioEncDone:Promise<void>|null=null;
  if (audio){
    let audioResolve!:()=>void;
    audioEncDone = new Promise<void>(res=>{audioResolve=res;});
    audioEncoder = new (window as any).AudioEncoder({
      output:(chunk:any,meta:any)=>muxer.addAudioChunk(chunk,meta),
      error:(e:any)=>console.error("[AudioEncoder]",e),
    });
    audioEncoder.configure({codec:"mp4a.40.2",sampleRate:audio.sampleRate,numberOfChannels:1,bitrate:128_000});
    const frameSize=1024;
    let offset=0;
    while(offset<audio.data.length){
      const len=Math.min(frameSize,audio.data.length-offset);
      const buf=new Float32Array(frameSize);
      buf.set(audio.data.subarray(offset,offset+len));
      const ad=new (window as any).AudioData({format:"f32-planar",sampleRate:audio.sampleRate,numberOfFrames:frameSize,numberOfChannels:1,timestamp:(offset/audio.sampleRate)*1e6,data:buf});
      audioEncoder.encode(ad); ad.close(); offset+=frameSize;
    }
    audioEncoder.flush().then(audioResolve);
  }

  const perSlide = slideDur+transDur;
  const keyframeEvery = fps*2;
  const bassRef = {level:0, beat:false};
  const tStart = performance.now();

  for (let f=0; f<totalFrames; f++){
    const t = f/fps;
    const slideFP = t/perSlide;
    let slideIdx = Math.floor(slideFP);
    let localT = t - slideIdx*perSlide;
    let inTrans = localT >= slideDur;
    let transT = inTrans ? (localT-slideDur)/transDur : 0;
    let nextIdx = Math.min(slideIdx+1, imgs.length-1);
    slideIdx = Math.min(slideIdx, imgs.length-1);
    const slideT = Math.min(1, localT/slideDur);

    const bars = spec.bars[f];
    const bass = spec.bassLevels[f];
    const beat = !!spec.beats[f];
    bassRef.level = bass; bassRef.beat = beat;

    drawFrame({
      time:t,fps,totalDur,slideIdx,slideT,transT,isTransition:inTrans,nextIdx,
      W:canvas.width,H:canvas.height,bars,bass,beat,
      rgb,color:vizColor,style:vizStyle,imgs,profile:prof,title,particles,
      phase:t*0.5,_canvas:canvas,_transition:transition,
      showTitle:showTitle!==false, showCaption: !!captions?.length,
      logoImg,logoPos,captions,captionStyle,
    } as any);

    const vf = new (window as any).VideoFrame(canvas,{timestamp:Math.floor(t*1e6),duration:Math.floor(1e6/fps)});
    videoEncoder.encode(vf,{keyFrame:f%keyframeEvery===0});
    vf.close();

    if (f%Math.max(1,prof.batchSize*4)===0){
      onProgress?.(f/totalFrames);
      await new Promise(r=>setTimeout(r,0));
    }
  }
  await videoEncoder.flush(); videoEncoder.close();
  if (audioEncoder && audioEncDone){ await audioEncDone; audioEncoder.close(); }
  muxer.finalize();
  onProgress?.(1); onStage?.("✅ Selesai!");
  return new Blob([muxer.target.buffer],{type:"video/mp4"});
}

async function renderMediaRecorder(b:any){
  const {canvas,imgs,audio,fps,totalDur,slideDur,transDur,prof,rgb,vizStyle,vizColor,title,transition,spec,particles,onProgress,onStage,logoImg,logoPos,captions,captionStyle,showTitle} = b;
  const stream:MediaStream = (canvas as any).captureStream(fps);
  let audioDest:MediaStreamAudioDestinationNode|null=null, actx:AudioContext|null=null;
  if (audio){
    actx=new (window.AudioContext||(window as any).webkitAudioContext)();
    audioDest=actx.createMediaStreamDestination();
    const ab=actx.createBuffer(1,audio.data.length,audio.sampleRate);
    ab.copyToChannel(audio.data,0);
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
  const startT=performance.now();
  const tick=()=>{
    const elapsed=(performance.now()-startT)/1000;
    const t=Math.min(elapsed,totalDur);
    const f=Math.floor(t*fps);
    const slideFP=t/perSlide;
    let slideIdx=Math.floor(slideFP),localT=t-slideIdx*perSlide;
    let inTrans=localT>=slideDur, transT=inTrans?(localT-slideDur)/transDur:0;
    let nextIdx=Math.min(slideIdx+1,imgs.length-1);
    slideIdx=Math.min(slideIdx,imgs.length-1);
    const slideT=Math.min(1,localT/slideDur);
    const bars = spec.bars[Math.min(f,spec.bars.length-1)] || new Float32Array(prof.bars);
    const bass = spec.bassLevels[Math.min(f,spec.bassLevels.length-1)]||0;
    const beat = !!spec.beats[Math.min(f,spec.beats.length-1)];
    bassRef.level=bass; bassRef.beat=beat;
    drawFrame({time:t,fps,totalDur,slideIdx,slideT,transT,isTransition:inTrans,nextIdx,
      W:canvas.width,H:canvas.height,bars,bass,beat,rgb,color:vizColor,style:vizStyle,imgs,profile:prof,title,particles,
      phase:t*0.5,_canvas:canvas,_transition:transition,showTitle:showTitle!==false,
      logoImg,logoPos,captions,captionStyle,showCaption:!!captions?.length} as any);
    onProgress?.(t/totalDur);
    if(elapsed<totalDur+0.2) requestAnimationFrame(tick);
    else{mr.stop();actx?.close();}
  };
  requestAnimationFrame(tick);
  const blob=await done;
  onStage?.("✅ Selesai!"); onProgress?.(1);
  return blob;
}

export function downloadBlob(blob:Blob, filename:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
