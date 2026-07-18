"use client";
import type { VizStyle } from "./types";

interface RenderOptions {
  images: string[];
  audioUrl?: string;
  slideDuration: number;
  vizStyle: VizStyle;
  vizColor: string;
  title?: string;
  quality?: "fast" | "balanced" | "high";
  onProgress?: (p: number) => void;
  onStage?: (s: string) => void;
  transition?: "fade" | "zoom" | "none";
  mobileOptimized?: boolean;
  width?: number;
  height?: number;
  fps?: number;
}

const PROFILES = {
  fast:     { scale: 0.45, fps: 20, bitrate: 1_500_000, fft: 128, bars: 40, particles: 60 },
  balanced: { scale: 0.7,  fps: 24, bitrate: 3_000_000, fft: 256, bars: 60, particles: 90 },
  high:     { scale: 1,    fps: 30, bitrate: 5_500_000, fft: 512, bars: 80, particles: 120 },
};

function detectMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
function isLowEnd() {
  if (typeof navigator === "undefined") return true;
  const hc = (navigator as any).hardwareConcurrency || 4;
  return hc <= 4 || detectMobile();
}
function pickMime() {
  for (const c of [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  return "";
}
async function downscaleImage(src: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      let w = im.naturalWidth, h = im.naturalHeight;
      const r = Math.min(maxW/w, maxH/h, 1);
      w = Math.round(w*r); h = Math.round(h*r);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(im, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", 0.85));
    };
    im.onerror = () => reject(new Error("Gagal load gambar"));
    im.src = src;
  });
}

export async function renderSlideshow(opts: RenderOptions): Promise<Blob> {
  const { images, audioUrl, slideDuration = 3, vizStyle = "luxury", vizColor = "#ec4899",
    title, transition = "zoom", onProgress, onStage, mobileOptimized } = opts;

  const isM = mobileOptimized ?? detectMobile();
  const q = opts.quality ?? (isLowEnd() ? "fast" : "balanced");
  const p = PROFILES[q];
  const W = Math.round((opts.width || 1280) * p.scale);
  const H = Math.round((opts.height || 720) * p.scale);
  const fps = opts.fps || p.fps;

  onStage?.(isM ? `📱 HP ${q}` : `💻 ${q}`);
  onStage?.("Memproses gambar...");

  // Downscale images
  const srcs: string[] = [];
  for (let i = 0; i < images.length; i++) {
    try { srcs.push(await downscaleImage(images[i], W*1.1, H*1.1)); }
    catch { srcs.push(images[i]); }
    onProgress?.(0.02 + (i/images.length)*0.08);
  }
  const imgs: HTMLImageElement[] = await Promise.all(srcs.map(s => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error("Image load fail")); i.src = s;
  })));

  onStage?.("Menyiapkan audio...");
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const actx: AudioContext = new AC();
  let audioBuf: AudioBuffer | null = null;
  let totalDur = imgs.length * slideDuration;
  if (audioUrl) {
    try {
      const r = await fetch(audioUrl);
      audioBuf = await actx.decodeAudioData(await r.arrayBuffer());
      totalDur = Math.max(totalDur, audioBuf.duration);
    } catch(e){ console.warn("Audio fail", e); }
  }

  onStage?.("Merekam frame...");
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { alpha: false })!;

  const dest = actx.createMediaStreamDestination();
  const an = actx.createAnalyser();
  an.fftSize = p.fft; an.smoothingTimeConstant = 0.8;
  an.connect(dest);
  let srcNode: AudioBufferSourceNode | null = null;
  if (audioBuf) {
    srcNode = actx.createBufferSource();
    srcNode.buffer = audioBuf;
    const g = actx.createGain(); g.gain.value = 0.9;
    srcNode.connect(g); g.connect(an);
  }
  const stream = cv.captureStream(fps);
  const at = dest.stream.getAudioTracks()[0];
  if (at) stream.addTrack(at);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime||undefined, videoBitsPerSecond:p.bitrate, audioBitsPerSecond:128000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>(res => { rec.onstop = () => res(new Blob(chunks, {type: mime||"video/webm"})); });

  const freq = new Uint8Array(an.frequencyBinCount);
  const tarr = new Uint8Array(an.fftSize);

  // Pre-compute gradients
  function barGrad() {
    const g = ctx.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, vizColor);
    g.addColorStop(0.5, "#a855f7");
    g.addColorStop(1, "#22d3ee");
    return g;
  }

  if (actx.state === "suspended") await actx.resume();
  rec.start(250);
  if (srcNode) srcNode.start(0);

  const t0 = performance.now();
  const totalMs = totalDur*1000;
  let raf = 0;
  let particles: {x:number;y:number;vx:number;vy:number;r:number;a:number}[] = [];
  if (vizStyle === "particles" || vizStyle === "luxury") {
    for (let i=0;i<p.particles;i++) particles.push({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-0.5)*0.6, vy:(Math.random()-0.5)*0.6,
      r: Math.random()*1.6+0.5, a: Math.random()*0.4+0.2,
    });
  }
  let sparkles: {x:number;y:number;vx:number;vy:number;life:number;max:number;color:string}[] = [];

  function hexA(c: string, a: number) {
    const cc = c.replace("#","");
    const f = cc.length===3 ? cc.split("").map(x=>x+x).join("") : cc;
    const r = parseInt(f.slice(0,2),16), g = parseInt(f.slice(2,4),16), b = parseInt(f.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function rr(x:number,y:number,w:number,h:number,r:number){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function drawSpectrum(bass:number, mid:number, tre:number, avg:number, t:number, logotext?:string) {
    if (vizStyle === "bars" || vizStyle === "luxury") {
      const bars = p.bars;
      const bw = (W*0.92)/bars;
      const step = Math.max(1, Math.floor(freq.length/bars));
      const baseY = H - 6;
      const grad = barGrad();
      // Reflection
      ctx.save(); ctx.globalAlpha = 0.25; ctx.translate(0, baseY); ctx.scale(1, -0.45);
      for (let i=0;i<bars;i++){
        const v = freq[i*step]/255;
        const h = 20 + v*H*0.35;
        ctx.fillStyle = grad;
        rr(W*0.04 + i*bw + 1, 0, bw-2, h, 2); ctx.fill();
      }
      ctx.restore();
      // Main bars
      ctx.save();
      ctx.shadowBlur = vizStyle==="luxury" ? 22 : 14;
      ctx.shadowColor = vizColor;
      for (let i=0;i<bars;i++){
        const v = freq[i*step]/255;
        const h = 20 + v*H*0.4;
        ctx.fillStyle = grad;
        rr(W*0.04 + i*bw + 1, baseY-h, bw-2, h, 2); ctx.fill();
      }
      ctx.restore();
    }
    if (vizStyle === "circle") {
      const cx=W/2, cy=H*0.45, rb = Math.min(W,H)*0.12 + bass*50, bars=80;
      ctx.save(); ctx.shadowBlur=20; ctx.shadowColor=vizColor; ctx.lineWidth=2;
      for (let i=0;i<bars;i++){
        const v=freq[i%freq.length]/255;
        const a=(i/bars)*Math.PI*2-Math.PI/2 + t*0.2;
        ctx.strokeStyle = vizColor;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*rb, cy+Math.sin(a)*rb);
        ctx.lineTo(cx+Math.cos(a)*(rb+15+v*100), cy+Math.sin(a)*(rb+15+v*100));
        ctx.stroke();
      }
      const glow=25+bass*40;
      const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,glow);
      rg.addColorStop(0,"rgba(255,255,255,0.85)");
      rg.addColorStop(0.4,hexA(vizColor,0.5));
      rg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(cx,cy,glow,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    if (vizStyle === "particles") {
      for (const pa of particles){
        const fi=Math.floor(((pa.x+pa.y)%W)/W*freq.length);
        const f=(freq[fi]||80)/255;
        pa.vx+=(Math.random()-0.5)*(0.15+f*0.5); pa.vy+=(Math.random()-0.5)*(0.15+f*0.5);
        pa.vx*=0.97; pa.vy*=0.97; pa.x+=pa.vx; pa.y+=pa.vy;
        if(pa.x<0)pa.x=W; if(pa.x>W)pa.x=0; if(pa.y<0)pa.y=H; if(pa.y>H)pa.y=0;
        ctx.fillStyle=hexA(vizColor,pa.a*(0.5+avg));
        ctx.shadowBlur=8; ctx.shadowColor=vizColor;
        ctx.beginPath(); ctx.arc(pa.x,pa.y,pa.r+f*2,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0;
    }
    if (vizStyle === "luxury") {
      // Vignette
      const vg = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.35, W/2,H/2,Math.max(W,H)*0.75);
      vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.7)");
      ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
      // Logo pulse
      const cx=W/2, cy=H*0.4;
      const lr = Math.min(W,H)*(0.1 + bass*0.05);
      const lg = ctx.createRadialGradient(cx,cy,0,cx,cy,lr*2.2);
      lg.addColorStop(0,"rgba(255,255,255,0.95)");
      lg.addColorStop(0.18, hexA(vizColor,0.85));
      lg.addColorStop(0.4, hexA(vizColor,0.3));
      lg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(cx,cy,lr*2.2,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=2+bass*2;
      ctx.shadowBlur=25; ctx.shadowColor=vizColor;
      ctx.beginPath(); ctx.arc(cx,cy,lr*(0.9+bass*0.15),0,Math.PI*2); ctx.stroke();
      // rotating dashed ring
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.4);
      ctx.strokeStyle=hexA(vizColor,0.4); ctx.lineWidth=1.5; ctx.setLineDash([6,6]);
      ctx.beginPath(); ctx.arc(0,0,lr*1.6,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
      ctx.shadowBlur=0;
      // Text / note logo
      ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
      const fs = Math.min(lr*0.35, W*0.05);
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.shadowColor="#000"; ctx.shadowBlur=8;
      const txt = logotext || "♪";
      const words = txt.split(" ");
      if (words.length > 2) {
        const mid = Math.ceil(words.length/2);
        ctx.fillText(words.slice(0,mid).join(" "), cx, cy-fs*0.55);
        ctx.fillText(words.slice(mid).join(" "), cx, cy+fs*0.55);
      } else if (words.length === 2) {
        ctx.fillText(words[0], cx, cy-fs*0.55);
        ctx.fillText(words[1], cx, cy+fs*0.55);
      } else {
        ctx.fillText(txt, cx, cy);
      }
      ctx.shadowBlur=0;
      // Sparkles
      if (sparkles.length<80 && bass>0.55) for(let k=0;k<3;k++){
        const a=Math.random()*Math.PI*2, s=1+Math.random()*3;
        sparkles.push({x:cx+Math.cos(a)*lr*1.3,y:cy+Math.sin(a)*lr*1.3,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0,max:35+Math.random()*25,color:Math.random()<0.5?vizColor:"#fff"});
      }
      for (let i=sparkles.length-1;i>=0;i--){
        const sp=sparkles[i];
        sp.x+=sp.vx; sp.y+=sp.vy; sp.vx*=0.98; sp.vy*=0.98; sp.life++;
        const a2=1-sp.life/sp.max;
        ctx.fillStyle=hexA(sp.color,a2);
        ctx.beginPath(); ctx.arc(sp.x,sp.y,1+a2*2,0,Math.PI*2); ctx.fill();
        if(sp.life>=sp.max) sparkles.splice(i,1);
      }
      // ambient particles
      for (const pa of particles){
        const fi=Math.floor(((pa.x+pa.y)%W)/W*freq.length);
        const f=(freq[fi]||80)/255;
        pa.vx+=(Math.random()-0.5)*(0.1+f*0.3); pa.vy+=(Math.random()-0.5)*(0.1+f*0.3);
        pa.vx*=0.98; pa.vy*=0.98; pa.x+=pa.vx; pa.y+=pa.vy;
        if(pa.x<0)pa.x=W; if(pa.x>W)pa.x=0; if(pa.y<0)pa.y=H; if(pa.y>H)pa.y=0;
        ctx.fillStyle=hexA(vizColor, pa.a*(0.3+avg*0.5));
        ctx.shadowBlur=6; ctx.shadowColor=vizColor;
        ctx.beginPath(); ctx.arc(pa.x,pa.y,pa.r+f*1.2,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0;
      // waveform ring
      ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=1; ctx.beginPath();
      if (tarr.length) {
        const wr=lr*2;
        for (let i=0;i<tarr.length;i++){
          const v=(tarr[i]-128)/128;
          const a=(i/tarr.length)*Math.PI*2-Math.PI/2+t*0.1;
          const x=cx+Math.cos(a)*(wr+v*8), y=cy+Math.sin(a)*(wr+v*8);
          if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }

  const draw = () => {
    const ems = performance.now() - t0;
    const prog = Math.min(1, ems/totalMs);
    onProgress?.(0.1 + prog*0.85);

    const sF = ems/(slideDuration*1000);
    const i0 = Math.min(imgs.length-1, Math.floor(sF));
    const local = sF - i0;
    const i1 = Math.min(imgs.length-1, i0+1);

    ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);

    const drawCover = (img:HTMLImageElement, a:number, zoom:number) => {
      const s = Math.max(W/img.naturalWidth, H/img.naturalHeight)*zoom;
      const w=img.naturalWidth*s, h=img.naturalHeight*s;
      ctx.globalAlpha=a;
      ctx.drawImage(img,(W-w)/2,(H-h)/2,w,h);
      ctx.globalAlpha=1;
    };
    if (transition==="zoom") {
      drawCover(imgs[i0], 1, 1+local*0.06);
      if (local>0.8 && i1!==i0) drawCover(imgs[i1], (local-0.8)*5, 1);
    } else if (transition==="fade") {
      drawCover(imgs[i0], 1, 1);
      if (local>0.75 && i1!==i0) drawCover(imgs[i1], (local-0.75)*4, 1);
    } else drawCover(imgs[i0],1,1);

    // Spectrum
    an.getByteFrequencyData(freq);
    an.getByteTimeDomainData(tarr);
    let b=0,m=0,tr=0,av=0;
    const L=freq.length, bE=Math.floor(L*0.08), mE=Math.floor(L*0.35);
    for(let i=0;i<bE;i++)b+=freq[i];
    for(let i=bE;i<mE;i++)m+=freq[i];
    for(let i=mE;i<L;i++)tr+=freq[i];
    for(let i=0;i<L;i++)av+=freq[i];
    b/=bE||1; m/=(mE-bE)||1; tr/=(L-mE)||1; av/=L;

    drawSpectrum(b/255, m/255, tr/255, av/255, ems/1000, title);

    // Title overlay
    if (title) {
      ctx.fillStyle="rgba(0,0,0,0.45)";
      const th=Math.round(H*0.08);
      ctx.fillRect(0,8,W,th);
      ctx.fillStyle="#fff";
      const fs=Math.round(W*0.035);
      ctx.font=`bold ${fs}px system-ui, sans-serif`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.shadowColor="#000"; ctx.shadowBlur=8;
      const words=title.split(" ");
      const maxW=W*0.9;
      const lines:string[]=[];
      let line="";
      for (const w of words){
        const test=line?line+" "+w:w;
        if (ctx.measureText(test).width>maxW && line){ lines.push(line); line=w; }
        else line=test;
      }
      if(line)lines.push(line);
      const sy=8+th/2 - ((lines.length-1)*fs*1.1)/2;
      lines.forEach((ll,i)=>ctx.fillText(ll,W/2,sy+i*fs*1.1));
      ctx.shadowBlur=0;
    }

    if (ems < totalMs - 300) raf = requestAnimationFrame(draw);
    else {
      setTimeout(()=>{ try{rec.stop();}catch{} try{srcNode?.stop();}catch{} }, 400);
    }
  };
  raf = requestAnimationFrame(draw);
  const blob = await done;
  cancelAnimationFrame(raf);
  try{actx.close();}catch{}
  onProgress?.(1); onStage?.("Selesai!");
  return blob;
}

export function downloadBlob(blob:Blob, filename:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),8000);
}
