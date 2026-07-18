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
  try {
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort(), 120_000);
    const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error(`Gagal ambil audio (HTTP ${r.status}). Coba render ulang ya bro.`);
    const buf = await r.arrayBuffer();
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    const actx = new AC();
    let audioBuf: AudioBuffer;
    try {
      audioBuf = await actx.decodeAudioData(buf.slice(0));
    } catch(de:any) {
      actx.close();
      throw new Error("Audio tidak bisa diputar (format corrupt/CORS). Coba generate ulang lagu atau pakai file upload ya bro.");
    }
    // KONVERSI ke STEREO 44100Hz — ini format PALING kompatibel untuk Android/iOS/YouTube.
    // Sebelumnya mono + sampleRate mentah (bisa 24k/32k/48k) bikin beberapa HP Android
    // memutar video tanpa suara (padahal YouTube bisa karena YouTube re-encode otomatis).
    const targetSR = 44100;
    const nCh = 2;
    const nFrames = Math.round(audioBuf.duration * targetSR);
    const resampleRatio = targetSR / audioBuf.sampleRate;
    const outL = new Float32Array(nFrames);
    const outR = new Float32Array(nFrames);
    const srcCh = audioBuf.numberOfChannels;
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
    // Mix down untuk spectrum/analysis (mono untuk internal)
    const mono = new Float32Array(nFrames);
    for (let i=0;i<nFrames;i++) mono[i] = (outL[i]+outR[i])*0.5;
    // Interleaved stereo untuk encoder (f32-planar butuh channel terpisah nanti)
    actx.close();
    return { data: mono, sampleRate: targetSR, channels: nCh, duration: nFrames/targetSR,
      stereoL: outL, stereoR: outR };
  } catch(e:any) {
    if (e?.name === "AbortError") throw new Error("Ambil audio timeout. Cek koneksi lalu render ulang.");
    throw e;
  }
}

async function prepareImages(sources: string[], W:number, H:number, onStage?:(s:string)=>void): Promise<HTMLCanvasElement[]> {
  onStage?.("Memproses gambar...");
  const out: HTMLCanvasElement[] = [];
  // PARALLEL load (max 4 sekaligus) — boost besar di HP
  const loadOne = async (src:string, idx:number):Promise<HTMLCanvasElement> => {
    onStage?.(`Memproses gambar ${idx+1}/${sources.length}...`);
    const img = await loadImage(src);
    // createImageBitmap jauh lebih cepat + mematikan smoothing untuk source crop (saves work)
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
    cx.imageSmoothingQuality = "low"; // "high" di mobile SANGAT lambat — bilinear cukup bagus karena kita resize dari gambar AI 1024→480/720p
    cx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return c;
  };
  // Chunk parallel 4
  for (let i=0;i<sources.length;i+=4) {
    const chunk = sources.slice(i,i+4).map((s,j)=>loadOne(s,i+j));
    const res = await Promise.all(chunk);
    out.push(...res);
    // yield ke UI thread biar ga block
    await new Promise(r=>setTimeout(r,0));
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
  // Pakai ENERGY BAND (octave bands) — tidak pakai sin/cos per sample, CEPAT
  // Band log dari ~60Hz ke ~5kHz dengan cara membagi window ke band-band frekuensi memakai filter bank sederhana
  const N = Math.min(1024, Math.floor(0.05*dssr)); // ~50ms window
  const bassEnd = Math.floor(barCount*0.12) || 1;

  // Band edge (sample offset) — simple bandpass via RMS dari range window
  const bandEdges: number[] = [];
  for (let b=0; b<=barCount; b++) {
    // frek dari 60Hz ke 5kHz log
    const f = 60 * Math.pow(5000/60, b/barCount);
    const idx = Math.floor((f/dssr) * N);
    bandEdges.push(clamp(idx, 1, N/2));
  }

  // Hann window
  const hann = new Float32Array(N);
  for (let i=0;i<N;i++) hann[i] = 0.5*(1-Math.cos(2*Math.PI*i/(N-1)));

  for (let f=0; f<totalFrames; f++) {
    const t = f/fps;
    const posSample = audioData ? Math.floor(t*dssr) : 0;
    const out = new Float32Array(barCount);
    if (audioData) {
      const start = Math.max(0, Math.min(posSample - (N>>1), dsa.length - N));
      const winLen = Math.min(N, dsa.length - start);
      // Hitung RMS per band
      for (let b=0; b<barCount; b++) {
        const lo = bandEdges[b], hi = Math.min(winLen, bandEdges[b+1]);
        if (hi<=lo) { out[b] = smooth[b] * 0.9; continue; }
        let sum=0, cnt=0;
        for (let s=lo; s<hi; s++) {
          const idx = start + s;
          if (idx<0||idx>=dsa.length) continue;
          const v = dsa[idx] * hann[s];
          sum += v*v;
          cnt++;
        }
        const rms = cnt ? Math.sqrt(sum/cnt) : 0;
        const target = clamp(rms * 6.5 * (1 + b*0.015), 0, 1);
        const a = target > smooth[b] ? 0.7 : 0.2;
        smooth[b] = smooth[b]*(1-a) + target*a;
        out[b] = smooth[b];
      }
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
  showTitle?:boolean; showCaption?:boolean;
  logoImg?:HTMLImageElement|HTMLCanvasElement|null; logoPos?:"center"|"corner"|"none";
  captions?:CaptionWord[]; captionStyle?:CaptionStyle;
}

function drawFrame(s: DrawState) {
  const { W,H,bars,rgb,style,imgs,slideIdx,isTransition,nextIdx,transT,slideT,bass,beat } = s;
  const ctx = s._canvas.getContext("2d", { alpha: false, desynchronized: true })!;

  // ===== MOBILE SPEED: kurangi gradient & efek berat =====
  // Flat dark bg (gak bikin radial gradient tiap frame — 2-3× lebih cepat di mobile GPU)
  ctx.fillStyle = "#08050f";
  ctx.fillRect(0,0,W,H);

  const cur = imgs[slideIdx % imgs.length];
  const nxt = imgs[nextIdx % imgs.length];
  // Ken Burns dikurangi dari 8%→3% di mobile — drawImage zoom mahal
  const kb = (W <= 720) ? 0.03 : 0.08;
  const zoomBase = 1.0 + slideT*kb + (beat?0.008:0);
  const drawImg = (img:HTMLCanvasElement,alpha:number,zoom:number)=>{
    if (alpha<=0) return;
    ctx.globalAlpha = alpha;
    const dw=W*zoom, dh=H*zoom;
    ctx.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
  };
  drawImg(cur,1,zoomBase);

  // Vignette PRA-RENDERED (dibuat sekali di setup) — tidak buat radial gradient tiap frame
  if ((s as any)._vignette) {
    ctx.globalAlpha = 0.75;
    ctx.drawImage((s as any)._vignette, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (isTransition && nxt) {
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

  // Glow wash tipis (solid color dengan alpha variasi bass — jauhi gradient)
  ctx.fillStyle = `rgba(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0},${(0.05+bass*0.10).toFixed(3)})`;
  ctx.fillRect(0,0,W,H);

  drawSpectrum(ctx, s);
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
  const isMobile = W <= 900;
  ctx.save();
  ctx.shadowBlur = isMobile ? Math.min(glow, 12) : glow;
  ctx.shadowColor = rgba(rgb,1);

  // Pre-compute warna bar SOLID (pakai warna utama langsung tanpa gradient per-bar)
  // Ini boost besar di mobile — createLinearGradient tiap bar itu SANGAT mahal
  const barFill = rgba(rgb, 0.95);

  if (style==="luxury"||style==="bars") {
    const nBars = isMobile ? Math.min(bars.length, 40) : bars.length;
    const step = bars.length / nBars;
    const barW = W/nBars*0.75, gap=W/nBars*0.25, maxH=H*0.32;
    ctx.fillStyle = barFill;
    for (let i=0;i<nBars;i++){
      // Ambil nilai max dari sekelompok bar (downsample untuk mobile)
      const bi = Math.floor(i*step);
      let v = (bars as any)[bi]||0;
      if (isMobile) {
        const end = Math.min(bars.length, bi+Math.ceil(step));
        for (let j=bi;j<end;j++) if (bars[j]>v) v=bars[j];
      }
      const h = v*maxH, x=i*(barW+gap)+gap/2, y=H-h-4;
      ctx.fillRect(x,y,barW,h); // fillRect lebih cepat 2-3× dari roundRect
    }
    // Reflection di bawah (satu rect solid alpha rendah — bukan mirror per-bar)
    if (s.profile.reflections && !isMobile) {
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
      if (s.logoImg && (s.logoPos==="center"||!s.logoPos)){
        const ls=r*1.5; ctx.save();
        ctx.beginPath(); ctx.arc(0,0,ls/2,0,Math.PI*2); ctx.clip();
        ctx.drawImage(s.logoImg,-ls/2,-ls/2,ls,ls); ctx.restore();
      } else {
        ctx.font=`${r}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("♪",0,2);
      }
      ctx.restore();
      // Particles: kurangi 6→3 di mobile
      if (beat) {
        const nSpark = isMobile ? 2 : 6;
        for (let k=0;k<nSpark;k++) s.particles.push({x:W/2+(Math.random()-0.5)*60,y:H*0.28+(Math.random()-0.5)*40,vx:(Math.random()-0.5)*5,vy:-Math.random()*3-1.5,life:1,size:Math.random()*2+1});
      }
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

  // Build captions (distribusi sepanjang durasi audio total — LEBIH AKURAT)
  let finalCaptions: CaptionWord[] = [];
  let capStyle: CaptionStyle = captionStyle || "capcut";
  if (captions && captions.length) finalCaptions = captions;
  else if (opts.lyrics?.length && opts.showLyrics) {
    finalCaptions = buildCaptionsFromLyrics(opts.lyrics, totalDur, 1.2);
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
  const {canvas,imgs,audio,fps,totalFrames,totalDur,slideDur,transDur,prof,rgb,vizStyle,vizColor,title,transition,spec,particles,onProgress,onStage,Mp4Muxer,logoImg,logoPos,captions,captionStyle,showTitle} = b;
  onStage?.(`Encoding video (${prof.w}x${prof.h} @ ${fps}fps)...`);

  const muxer = new Mp4Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    fastStart:"in-memory",
    video:{codec:"avc",width:canvas.width,height:canvas.height},
    // STEREO 44100Hz — kompatibel dengan SEMUA HP Android/iOS/WhatsApp/YouTube
    audio: audio?{codec:"aac",sampleRate:audio.sampleRate,numberOfChannels:audio.channels||2}:undefined,
    firstTimestampBehavior:"offset",
  });

  let videoResolve!:()=>void;
  const videoEncDone = new Promise<void>(res=>{videoResolve=res;});
  const videoEncoder = new (window as any).VideoEncoder({
    output:(chunk:any,meta:any)=>muxer.addVideoChunk(chunk,meta),
    error:(e:any)=>console.error("[VideoEncoder]",e),
  });
  videoEncoder.configure({
    codec:"avc1.42001f", // Baseline profile — hardware encoder support paling luas di mobile
    width:canvas.width, height:canvas.height,
    bitrate:prof.videoBitrate, bitrateMode:"variable", framerate:fps,
    latencyMode:"realtime",
    hardwareAcceleration:"prefer-hardware",
    // Keyframe tiap 2 detik — cukup untuk seek
    avc:{format:"avc"},
  });

  let audioEncoder:any=null,audioEncDone:Promise<void>|null=null;
  if (audio){
    let audioResolve!:()=>void;
    audioEncDone = new Promise<void>(res=>{audioResolve=res;});
    audioEncoder = new (window as any).AudioEncoder({
      output:(chunk:any,meta:any)=>muxer.addAudioChunk(chunk,meta),
      error:(e:any)=>console.error("[AudioEncoder]",e),
    });
    const nCh = audio.channels || 2;
    // AAC-LC stereo 192kbps — kompatibel dengan semua HP, WhatsApp, Reels, YouTube
    audioEncoder.configure({codec:"mp4a.40.2",sampleRate:audio.sampleRate,numberOfChannels:nCh,bitrate:192_000});
    const frameSize=1024;
    let offset=0;
    const sL = audio.stereoL || audio.data;
    const sR = audio.stereoR || audio.data;
    while(offset<audio.data.length){
      const len=Math.min(frameSize,audio.data.length-offset);
      // f32-planar: [L0,L1,..Ln-1,R0,R1,..Rn-1]
      const buf=new Float32Array(frameSize*nCh);
      for (let i=0;i<len;i++){
        buf[i] = sL[offset+i]||0;
        if (nCh>1) buf[frameSize+i] = sR[offset+i]||0;
      }
      const ad=new (window as any).AudioData({format:"f32-planar",sampleRate:audio.sampleRate,numberOfFrames:frameSize,numberOfChannels:nCh,timestamp:(offset/audio.sampleRate)*1e6,data:buf});
      audioEncoder.encode(ad); ad.close(); offset+=frameSize;
    }
    audioEncoder.flush().then(audioResolve);
  }

  // Pre-render vignette sekali awal (bukan tiap frame)
  const vigC = document.createElement("canvas");
  vigC.width = canvas.width; vigC.height = canvas.height;
  const vg = vigC.getContext("2d",{alpha:true})!;
  const vgr = vg.createRadialGradient(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)*0.3,canvas.width/2,canvas.height/2,Math.max(canvas.width,canvas.height)*0.8);
  vgr.addColorStop(0,"rgba(0,0,0,0)"); vgr.addColorStop(1,"rgba(0,0,0,0.7)");
  vg.fillStyle=vgr; vg.fillRect(0,0,canvas.width,canvas.height);

  const perSlide = slideDur+transDur;
  const keyframeEvery = fps*2;
  const bassRef = {level:0, beat:false};
  const tStart = performance.now();
  let encodeQueue = 0;

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
      phase:t*0.5,_canvas:canvas,_transition:transition,_vignette:vigC,
      showTitle:showTitle!==false, showCaption: !!captions?.length,
      logoImg,logoPos,captions,captionStyle,
    } as any);

    const vf = new (window as any).VideoFrame(canvas,{timestamp:Math.floor(t*1e6),duration:Math.floor(1e6/fps)});
    videoEncoder.encode(vf,{keyFrame:f%keyframeEvery===0});
    vf.close();
    encodeQueue++;

    // Adaptive yield: jangan biarkan encoder queue numpuk > 10 frame (backpressure mencegah OOM & jank)
    // Yield tiap batchSize frame untuk progress + UI tidak mati total
    const yieldEvery = Math.max(1, prof.batchSize*2);
    if (f%yieldEvery===0){
      onProgress?.(f/totalFrames);
      // Jika encoder masih nge-blok, tunggu sebentar (microtask)
      if (encodeQueue >= 8) {
        await new Promise(r=>setTimeout(r,0));
        encodeQueue = 0;
      } else {
        await Promise.resolve();
      }
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
