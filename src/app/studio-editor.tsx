"use client";
import { useEffect, useRef, useState } from "react";
import {
  VIZ_STYLES, TRANSITION_STYLES, QUALITY_OPTIONS,
} from "@/lib/types";
import type { TextLayer } from "@/lib/recorder";

const COLOR_PRESETS = [
  { hex:"#ec4899" },{ hex:"#a855f7" },{ hex:"#22d3ee" },{ hex:"#f59e0b" },
  { hex:"#22c55e" },{ hex:"#ef4444" },{ hex:"#ffffff" },
];

function formatDur(s:number): string {
  if (!isFinite(s)||s<0) s=0;
  const m=Math.floor(s/60), sec=Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,"0")}`;
}
function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block animate-spin"/>;
}
function MetaRow({label,value,onCopy,copied,multiline}:{label:string;value:string;onCopy:()=>void;copied:boolean;multiline?:boolean;}) {
  return (
    <div className="mb-2 min-w-0">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-xs text-white/70 font-semibold truncate">{label}</div>
        <button onClick={onCopy} className={`btn btn-sm ${copied?"bg-green-600 text-white":"btn-ghost"}`}>{copied?"✓":"SALIN"}</button>
      </div>
      {multiline ? (
        <div className="text-xs bg-black/40 rounded-lg p-2.5 border border-white/10 whitespace-pre-wrap leading-relaxed break-word">{value}</div>
      ) : (
        <div className="text-xs bg-black/40 rounded-lg p-2.5 border border-white/10 break-all">{value}</div>
      )}
    </div>
  );
}

// ============ STICKER PRESETS (CapCut-style grid, dikelompokkan) ============
const STICKER_CATS = [
  {id:"audio",label:"🎵 Audio"},
  {id:"yt",label:"📺 YouTube"},
  {id:"viral",label:"🔥 Viral"},
  {id:"deco",label:"✨ Deco"},
];
const STICKER_PRESETS = [
  // Audio spectrum
  {id:"bars-bottom", cat:"audio", icon:"📊", label:"Bars",   bg:"linear-gradient(135deg,#ec4899,#8b5cf6)"},
  {id:"wave-bottom", cat:"audio", icon:"〰️", label:"Wave",   bg:"linear-gradient(135deg,#06b6d4,#3b82f6)"},
  {id:"wave-center", cat:"audio", icon:"🌊", label:"Wave Mid",bg:"linear-gradient(135deg,#10b981,#06b6d4)"},
  {id:"bars-top",    cat:"audio", icon:"📈", label:"Bars Atas",bg:"linear-gradient(135deg,#f59e0b,#ef4444)"},
  {id:"circle",      cat:"audio", icon:"⭕", label:"Circle",  bg:"linear-gradient(135deg,#a855f7,#ec4899)"},
  {id:"disc",        cat:"audio", icon:"💿", label:"Vinyl",   bg:"linear-gradient(135deg,#1f2937,#111)"},
  {id:"wave",        cat:"audio", icon:"📉", label:"Smooth",  bg:"linear-gradient(135deg,#22d3ee,#a855f7)"},
  {id:"diamond",     cat:"audio", icon:"💎", label:"Diamond", bg:"linear-gradient(135deg,#06b6d4,#8b5cf6)"},
  // YouTube
  {id:"subscribe",   cat:"yt",    icon:"🔴", label:"SUBSCRIBE",bg:"#cc0000"},
  {id:"subscribed",  cat:"yt",    icon:"✅", label:"SUBSCRIBED",bg:"#888"},
  {id:"like",        cat:"yt",    icon:"👍", label:"Like",     bg:"#2563eb"},
  {id:"bell",        cat:"yt",    icon:"🔔", label:"Lonceng",  bg:"#f59e0b"},
  {id:"headphones",  cat:"yt",    icon:"🎧", label:"Headphone",bg:"linear-gradient(135deg,#ec4899,#f97316)"},
  {id:"play",        cat:"yt",    icon:"▶️", label:"Play",     bg:"#fff",color:"#000"},
  // Viral
  {id:"fire",        cat:"viral", icon:"🔥", label:"FYP",      bg:"linear-gradient(135deg,#f97316,#ef4444)"},
  {id:"fyp-text",    cat:"viral", icon:"💯", label:"FYP Text", bg:"linear-gradient(135deg,#8b5cf6,#ec4899)"},
  {id:"nowplaying",  cat:"viral", icon:"🎶", label:"NOW PLAY", bg:"#000",color:"#22d3ee"},
  {id:"mymusic",     cat:"viral", icon:"♪",  label:"MY MUSIC", bg:"linear-gradient(135deg,#ec4899,#a855f7)"},
  // Deco
  {id:"glow-ring",   cat:"deco",  icon:"✨", label:"Glow Ring",bg:"linear-gradient(135deg,#fbbf24,#ef4444)"},
  {id:"none",        cat:"deco",  icon:"❌", label:"Off",      bg:"#222"},
];

// ============ CAPCUT FULLSCREEN STUDIO (Step 5) ============
type StudioEditorProps = {
  slides: any[]; aspectRatio: "16:9"|"9:16"|"1:1"; isMobile: boolean;
  selectedTitle?: {text:string; keyword:string}; niche: string;
  slideDuration: number; setSlideDuration:(v:number)=>void;
  transitionDur: number; setTransitionDur:(v:number)=>void;
  transition: string; setTransition:(v:any)=>void;
  showTitle: boolean; setShowTitle:(v:boolean)=>void;
  showLyrics: boolean; setShowLyrics:(v:boolean)=>void;
  captionStyle: any; setCaptionStyle:(v:any)=>void;
  vizStyle: any; setVizStyle:(v:any)=>void;
  vizColor: string; setVizColor:(v:string)=>void;
  logoDataUrl: string; logoPosition: any; setLogoPosition:(v:any)=>void;
  onLogoUpload:(f:File|undefined)=>void;
  activeFilter: string; setActiveFilter:(v:string)=>void;
  brightness: number; setBrightness:(v:number)=>void;
  contrast: number; setContrast:(v:number)=>void;
  saturation: number; setSaturation:(v:number)=>void;
  sharpen: number; setSharpen:(v:number)=>void;
  vignetteAmt: number; setVignetteAmt:(v:number)=>void;
  spectrumSticker: string; setSpectrumSticker:(v:string)=>void;
  videoSpeed: number; setVideoSpeed:(v:number)=>void;
  textLayers: TextLayer[]; setTextLayers:(v:TextLayer[]|((p:TextLayer[])=>TextLayer[]))=>void;
  getFilterString: (f?:string)=>string;
  resetAdjust: ()=>void;
  audioMode: any; setAudioMode:(v:any)=>void;
  aiMusicUrl: string; ttsUrl: string; musicUrl: string;
  proxifyAudioUrl:(u:string)=>string;
  previewAudioRef: any; previewCanvasRef: any;
  previewPlaying: boolean;
  previewCurrent: number; setPreviewCurrent:(v:number)=>void;
  previewMuted: boolean; setPreviewMuted:(v:boolean|((p:boolean)=>boolean))=>void;
  togglePreview: ()=>void;
  stopPreview: ()=>void;
  seekPreview: (t:number)=>void;
  onBack: ()=>void;
  onExport: ()=>void;
  onSaveDraft: ()=>void;
};
export function StudioEditor(p: StudioEditorProps) {
  const {
    slides, aspectRatio, isMobile, selectedTitle, niche,
    slideDuration, setSlideDuration, transitionDur, setTransitionDur,
    transition, setTransition, showTitle, setShowTitle, showLyrics, setShowLyrics,
    captionStyle, setCaptionStyle, vizStyle, setVizStyle, vizColor, setVizColor,
    logoDataUrl, logoPosition, setLogoPosition, onLogoUpload,
    activeFilter, setActiveFilter, brightness, setBrightness, contrast, setContrast,
    saturation, setSaturation, sharpen, setSharpen, vignetteAmt, setVignetteAmt,
    spectrumSticker, setSpectrumSticker, videoSpeed, setVideoSpeed,
    textLayers, setTextLayers,
    getFilterString, resetAdjust, audioMode, setAudioMode,
    aiMusicUrl, ttsUrl, musicUrl, proxifyAudioUrl,
    previewAudioRef, previewCanvasRef, previewPlaying, previewCurrent,
    previewMuted, setPreviewMuted, togglePreview, seekPreview,
    onBack, onExport, onSaveDraft,
  } = p;

  const [tab, setTab] = useState<"edit"|"audio"|"text"|"sticker"|"overlay"|"filter"|"adjust"|"effect"|"speed">("edit");
  const [activeSlide, setActiveSlide] = useState(0);
  const timelineStripRef = useRef<HTMLDivElement|null>(null);

  const TABS = [
    {id:"edit",    icon:"✂️", label:"Edit"},
    {id:"audio",   icon:"🎵", label:"Audio"},
    {id:"text",    icon:"💬", label:"Teks"},
    {id:"sticker", icon:"🎧", label:"Stiker"},
    {id:"overlay", icon:"🖼️", label:"Overlay"},
    {id:"filter",  icon:"🎨", label:"Filter"},
    {id:"adjust",  icon:"☀️", label:"Adjust"},
    {id:"effect",  icon:"✨", label:"Efek"},
    {id:"speed",   icon:"⚡", label:"Speed"},
  ] as const;

  const FILTERS = [
    {id:"none", label:"Original", css:"none"},
    {id:"cinematic", label:"🎬 Cinematic", css:"contrast(1.18) saturate(0.85) brightness(0.95)"},
    {id:"vivid", label:"🌈 Vivid", css:"saturate(1.4) contrast(1.12) brightness(1.05)"},
    {id:"warm", label:"🔥 Warm", css:"sepia(0.18) saturate(1.15) brightness(1.02)"},
    {id:"cool", label:"❄️ Cool", css:"hue-rotate(-10deg) saturate(1.1) brightness(1.02)"},
    {id:"bw", label:"⚫ B/W", css:"grayscale(1) contrast(1.1)"},
    {id:"vintage", label:"📼 Vintage", css:"sepia(0.35) contrast(0.95) brightness(0.95) saturate(0.85)"},
    {id:"dreamy", label:"💫 Dreamy", css:"brightness(1.1) contrast(0.92) saturate(1.15) blur(0.3px)"},
    {id:"cinema4k", label:"💎 4K", css:"contrast(1.22) saturate(0.95) brightness(0.92)"},
    {id:"8k", label:"🌟 8K", css:"contrast(1.25) saturate(1.08) brightness(0.98)"},
    {id:"clearll", label:"🔍 Jelas", css:"contrast(1.08) saturate(1.12) brightness(1.02)"},
    {id:"senja", label:"🌅 Senja", css:"sepia(0.25) saturate(1.2) brightness(1.0) hue-rotate(-10deg)"},
  ];

  const ratioStyle: React.CSSProperties = aspectRatio==="9:16" ? {aspectRatio:"9/16"}
    : aspectRatio==="1:1" ? {aspectRatio:"1/1"} : {aspectRatio:"16/9"};

  const transDur = Math.min(slideDuration*0.6, isMobile?0.5:0.8);
  const curSlideDur = slideDuration/videoSpeed;
  const totalDur = Math.max(slides.length*curSlideDur + transitionDur/videoSpeed, 1);

  // Auto-scroll playhead into view
  useEffect(()=>{
    const el = timelineStripRef.current;
    if (!el) return;
    const pct = previewCurrent/totalDur;
    const scrollTarget = pct * el.scrollWidth - el.clientWidth/2;
    el.scrollTo({left:scrollTarget, behavior:"auto"});
  }, [previewCurrent, totalDur]);

  // Thumb size per ratio
  const thumbW = aspectRatio==="9:16"?42:aspectRatio==="1:1"?54:72;
  const thumbH = aspectRatio==="9:16"?72:aspectRatio==="1:1"?54:42;
  const playheadPct = Math.min(100, Math.max(0,(previewCurrent/totalDur)*100));

  const audioSrc = (audioMode==="aimusic"&&aiMusicUrl)?aiMusicUrl:
                  (audioMode==="tts"&&ttsUrl)?ttsUrl:
                  (audioMode==="music"&&musicUrl)?musicUrl:
                  (aiMusicUrl||musicUrl||ttsUrl);

  // Auto-set audio src ke elemen preview
  useEffect(()=>{
    const el = previewAudioRef.current;
    if (!el) return;
    const src = audioSrc ? proxifyAudioUrl(audioSrc) : "";
    if (el.src !== src && (src || el.src)) {
      try { el.src = src; } catch(e){}
    }
    el.muted = previewMuted;
  }, [audioSrc, previewMuted, previewAudioRef, proxifyAudioUrl]);

  return (
    <section className="mt-0">
      {/* FULLSCREEN STUDIO: di HP pakai fixed inset-0; di desktop tampil dalam card */}
      <div className={"studio-shell " + (isMobile ? "studio-mobile fixed inset-0 z-40" : "relative rounded-2xl")}
           style={isMobile?{background:"#000"}:{}}>
        {isMobile && <div className="h-[env(safe-area-inset-top)] bg-black"/>}

        {/* TOP BAR */}
        <div className="flex items-center gap-2 p-2 bg-black/95 border-b border-white/10 relative z-10">
          <button onClick={onBack} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/10 text-lg active:scale-95">←</button>
          <div className="flex-1 min-w-0 text-center px-1">
            <div className="text-sm font-black truncate text-white">🎬 Studio Edit</div>
            <div className="text-[10px] text-white/50 truncate">{selectedTitle?.text || niche || "Video"} · {slides.length} slide</div>
          </div>
          <button onClick={onSaveDraft} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/10 text-sm active:scale-95">💾</button>
          <button onClick={onExport} className="px-4 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-bold shadow-lg shadow-pink-500/30 active:scale-95">
            Ekspor →
          </button>
        </div>

        {/* PREVIEW AREA (flex-1) */}
        <div className="studio-preview-area relative flex-1 flex items-center justify-center bg-gradient-to-b from-black to-[#0a0418] overflow-hidden p-2">
          <div className="relative rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl mx-auto"
               style={{...ratioStyle, maxHeight:"100%", maxWidth:"100%"}}>
            {previewPlaying ? (
              <canvas ref={previewCanvasRef}
                width={isMobile?(aspectRatio==="9:16"?360:aspectRatio==="1:1"?480:640):(aspectRatio==="9:16"?480:aspectRatio==="1:1"?480:854)}
                height={isMobile?(aspectRatio==="9:16"?640:aspectRatio==="1:1"?480:360):(aspectRatio==="9:16"?854:aspectRatio==="1:1"?480:480)}
                className="w-full h-full block" />
            ) : slides[activeSlide] ? (
              <img src={slides[activeSlide].imageUrl}
                   style={{filter: getFilterString()}}
                   className="w-full h-full object-cover block" alt="preview"/>
            ) : <div className="w-full h-full bg-neutral-900"/>}

            {/* Vignette overlay live */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background:`radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${(vignetteAmt/100)*0.8}) 100%)`
            }}/>

            {/* Center Play */}
            {!previewPlaying && slides.length>0 && (
              <button onClick={()=>togglePreview()}
                className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/50 backdrop-blur-md border-2 border-white/40 flex items-center justify-center text-3xl text-white shadow-2xl active:scale-95">
                  ▶️
                </div>
              </button>
            )}

            {/* Overlay badges */}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[10px] font-mono border border-white/10">
              {formatDur(previewCurrent)} / {formatDur(totalDur)}
            </div>
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[10px] font-bold border border-white/10">
              🖼️ {activeSlide+1}/{slides.length}
            </div>
            {activeFilter!=="none" && (
              <div className="absolute bottom-14 left-2 bg-pink-500/80 backdrop-blur px-2 py-0.5 rounded-full text-white text-[9px] font-bold">
                🎨 {FILTERS.find(f=>f.id===activeFilter)?.label}
              </div>
            )}
            {videoSpeed!==1 && (
              <div className="absolute bottom-14 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[9px] font-bold border border-white/10">
                ⚡ {videoSpeed}x
              </div>
            )}
            {/* ===== STICKERS ===== */}
            {spectrumSticker==="subscribe" && (
              <div className="absolute top-3 left-3 flex items-center gap-1 rounded-md overflow-hidden shadow-lg">
                <div className="bg-black/70 w-8 h-8 flex items-center justify-center text-lg">👍</div>
                <div className="bg-red-600 px-3 py-1.5 text-white text-[11px] font-black">SUBSCRIBE</div>
                <div className="bg-black/70 w-8 h-8 flex items-center justify-center text-lg">🔔</div>
              </div>
            )}
            {spectrumSticker==="subscribed" && (
              <div className="absolute top-3 left-3 bg-white/80 px-3 py-1.5 rounded-md text-[11px] font-black text-gray-800 shadow-lg">
                ✓ SUBSCRIBED
              </div>
            )}
            {spectrumSticker==="like" && (
              <div className="absolute top-14 right-3 flex flex-col items-center gap-0.5">
                <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl active:scale-95">👍</div>
                <div className="text-white text-[10px] font-bold drop-shadow-lg">1.2M</div>
              </div>
            )}
            {spectrumSticker==="bell" && (
              <div className="absolute top-14 right-4 w-11 h-11 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl">🔔</div>
            )}
            {spectrumSticker==="headphones" && (
              <div className="absolute top-14 right-3 w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/50">🎧</div>
            )}
            {spectrumSticker==="play" && (
              <div className="absolute top-14 right-3 w-11 h-11 rounded-full bg-white flex items-center justify-center text-xl text-black shadow-lg">▶</div>
            )}
            {spectrumSticker==="fire" && (
              <div className="absolute top-14 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-full text-[10px] font-black shadow-lg flex items-center gap-1">
                🔥 FYP
              </div>
            )}
            {spectrumSticker==="fyp-text" && (
              <div className="absolute top-20 left-3 bg-gradient-to-br from-purple-600 to-pink-500 text-white px-3 py-1.5 rounded-lg text-[12px] font-black shadow-lg shadow-purple-500/50">
                #FYP
              </div>
            )}
            {spectrumSticker==="nowplaying" && (
              <div className="absolute bottom-16 left-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-black text-cyan-300 flex items-center gap-1 shadow-lg border border-cyan-400/30">
                ▶ NOW PLAYING
              </div>
            )}
            {spectrumSticker==="mymusic" && (
              <div className="absolute top-20 left-3 bg-gradient-to-br from-pink-500 to-purple-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-black shadow-lg flex items-center gap-1">
                ♪ MY MUSIC
              </div>
            )}
            {spectrumSticker==="disc" && (
              <div className="absolute top-14 right-3 w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 via-black to-gray-800 flex items-center justify-center shadow-xl animate-spin" style={{animationDuration:"3s"}}>
                <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center text-[8px] text-white font-black">♪</div>
              </div>
            )}
            {spectrumSticker==="diamond" && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 w-10 h-10 rotate-45 bg-pink-500 shadow-lg shadow-pink-500/60"/>
            )}
            {spectrumSticker==="circle" && (
              <div className="absolute top-16 left-6 w-12 h-12 rounded-full border-[3px] border-pink-400 shadow-[0_0_14px_rgba(236,72,153,0.8)]"/>
            )}
            {spectrumSticker==="glow-ring" && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full border-[3px] border-pink-400 absolute animate-ping opacity-60"/>
                <div className="w-10 h-10 rounded-full border-[3px] border-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.9)]"/>
              </div>
            )}
            {spectrumSticker==="bars-top" && (
              <div className="absolute top-3 left-0 right-0 flex items-end justify-center gap-[2px] h-6 px-3">
                {Array.from({length:24}).map((_,i)=>{
                  const h = 20+Math.sin(i*0.7+Date.now()/200)*10+Math.random()*8;
                  return <div key={i} className="w-1 bg-gradient-to-t from-pink-500 to-cyan-400 rounded-sm" style={{height:`${Math.max(4,h)}px`}}/>;
                })}
              </div>
            )}

            {/* ===== CUSTOM TEXT LAYERS (CapCut-style editable) ===== */}
            {textLayers.map((l:TextLayer)=>{
              if (!l.text) return null;
              const fontSize = `calc(${Math.round((l.sizePct||0.07)*100)}% * 0.18)`;
              const eff = (l as any).effect || "none";
              let outerStyle: React.CSSProperties = {
                position:"absolute",
                left:`${(l.x)*100}%`, top:`${(l.y)*100}%`,
                transform:`translate(-50%,-50%) rotate(${l.rotation||0}deg)`,
                opacity: l.opacity??1,
                textAlign:(l.align as any)||"center",
                pointerEvents:"none",
                whiteSpace:"pre-wrap",
                maxWidth:"92%",
                fontWeight: l.bold!==false?900:400,
                fontStyle: l.italic?"italic":"normal",
                fontFamily: (l.font && FONT_CSS[l.font]) ? FONT_CSS[l.font] : (l.font || "system-ui,-apple-system,sans-serif"),
              };
              let innerStyle: React.CSSProperties = {
                fontSize: fontSize,
                lineHeight:1.15,
                color: l.color||"#fff",
                display:"inline-block",
                padding:"0.05em 0.1em",
              };
              const tpl = l.template||"default";
              // Efek khusus DOM preview
              if (eff==="art-paper") innerStyle={...innerStyle,color:"#f5f0e6",WebkitTextStroke:"1px rgba(120,80,40,0.7)",textShadow:"0 2px 4px rgba(80,40,10,0.4)"};
              else if (eff==="art-stroke-white") innerStyle={...innerStyle,color:"transparent",WebkitTextStroke:"3px #fff",textShadow:"0 2px 6px rgba(0,0,0,0.6)"};
              else if (eff==="art-stroke-black") innerStyle={...innerStyle,color:"transparent",WebkitTextStroke:"3px #000",textShadow:"0 2px 6px rgba(0,0,0,0.4)"};
              else if (eff==="art-blood") innerStyle={...innerStyle,color:"#8b0000",WebkitTextStroke:"1.5px #2a0000",textShadow:"0 0 14px #ff0000,0 2px 0 #000"};
              else if (eff==="art-yellow-black") innerStyle={...innerStyle,color:"#fde047",WebkitTextStroke:"3px #000",textShadow:"0 3px 6px rgba(0,0,0,0.5)"};
              else if (eff==="art-white-red") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"2.5px #dc2626",textShadow:"0 0 10px rgba(220,38,38,0.5)"};
              else if (eff==="art-gold-black") innerStyle={...innerStyle,color:"#fcd34d",WebkitTextStroke:"2px #000",background:"linear-gradient(180deg,#fff3b0,#fcd34d 30%,#b45309 55%,#fde68a 75%,#92400e)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",textShadow:"0 0 10px rgba(255,200,50,0.5)",fontWeight:900};
              else if (eff==="art-neon-pink") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 8px #ff2d95,0 0 18px #ff2d95,0 0 32px #ff2d95"};
              else if (eff==="art-neon-red") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 8px #ff0033,0 0 18px #ff0033,0 0 30px #ff0033"};
              else if (eff==="art-neon-blue") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 8px #00e5ff,0 0 18px #00e5ff,0 0 30px #00e5ff"};
              else if (eff==="art-scratch-red") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"2px #ff0033",textShadow:"0 0 12px rgba(255,0,50,0.7)"};
              else if (eff==="art-gradient-ko") innerStyle={...innerStyle,color:"#f97316",WebkitTextStroke:"1.5px #000",background:"linear-gradient(180deg,#fde047,#f97316,#2563eb)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:900};
              else if (eff==="art-3d") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"1.5px #000",textShadow:"3px 3px 0 #374151,6px 6px 0 rgba(0,0,0,0.3)",fontWeight:900};
              else if (eff==="art-chrome") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"1px #1f2937",background:"linear-gradient(180deg,#e5e7eb 0%,#fff 30%,#9ca3af 45%,#fff 60%,#6b7280 75%,#d1d5db)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",textShadow:"0 2px 4px rgba(0,0,0,0.5)",fontWeight:900};
              else if (eff==="art-glitter") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 10px #ec4899,0 0 22px #ec4899,0 0 36px #ec4899"};
              else if (eff==="art-sparkle") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 10px #22d3ee,0 0 22px #22d3ee,0 0 36px #22d3ee"};
              else if (eff==="art-glitch") innerStyle={...innerStyle,color:"#fff",textShadow:"-2px 0 #ff0050,2px 0 #00e5ff",fontWeight:900};
              // Warna/template (hanya kalau effect = none)
              else if (tpl==="neon") innerStyle={...innerStyle,color:"#fff",textShadow:`0 0 12px #ec4899,0 0 22px #a855f7`};
              else if (tpl==="boldwhite") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"2px #000",textShadow:"0 2px 6px rgba(0,0,0,0.6)"};
              else if (tpl==="thanks") innerStyle={...innerStyle,background:"linear-gradient(180deg,#ef4444 0%,#fff 50%,#3b82f6 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",WebkitTextStroke:"1.5px #000",fontWeight:900};
              else if (tpl==="trendy") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:`3px #ef4444`};
              else if (tpl==="fire") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 16px #ff6b00,0 2px 0 #7c2d12"};
              else if (tpl==="aura") innerStyle={...innerStyle,color:"#fef08a",textShadow:"0 0 22px #fb923c,0 2px 0 #7c2d12"};
              else if (tpl==="horror") innerStyle={...innerStyle,color:"#dc2626",textShadow:"0 0 10px #000,0 2px 0 #000"};
              else if (tpl==="titlehere") innerStyle={...innerStyle,color:"#fff",textShadow:"0 2px 0 #000,0 4px 8px rgba(0,0,0,0.6)"};
              else if (tpl==="mymusic") innerStyle={...innerStyle,color:"#fff",textShadow:"0 0 14px #fff,0 2px 0 #000"};
              else if (tpl==="nowplaying") innerStyle={...innerStyle,color:"#fff",textShadow:"0 2px 0 #000",letterSpacing:"0.05em"};
              else if (tpl==="please") innerStyle={...innerStyle,color:"#fff",WebkitTextStroke:"2px #ec4899"};
              else if (tpl==="myvlog") innerStyle={...innerStyle,background:"linear-gradient(180deg,#fbbf24,#f97316,#dc2626)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",WebkitTextStroke:"1px #78350f",fontWeight:900};
              else innerStyle={...innerStyle,textShadow:"0 2px 4px rgba(0,0,0,0.9),0 0 2px rgba(0,0,0,0.9)"};
              if (l.strokeColor && tpl==="default" && eff==="none") innerStyle.WebkitTextStroke = `${Math.max(1,(l.strokeWidth||0.15)*20)}px ${l.strokeColor}`;
              if (l.shadowColor && eff==="none") innerStyle.textShadow = `0 0 ${l.shadowBlur||8}px ${l.shadowColor}`;

              // Animasi sederhana via CSS class
              let animClass = "";
              if (previewPlaying && l.animIn && l.animIn!=="none") animClass = "tt-fadein";
              if (previewPlaying && l.animLoop==="pulse") animClass += " tt-pulse";
              if (previewPlaying && l.animLoop==="bounce") animClass += " tt-bounce";

              return (
                <div key={l.id} style={outerStyle} className={animClass}>
                  <span style={innerStyle}>{l.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TIMELINE (thumbnail strip + playhead + waveform) */}
        <div className="bg-[#0a0418] border-y border-white/10 px-1 py-1.5">
          {/* Waveform bar audio (fake bars) */}
          <div className="flex items-end gap-[2px] h-6 px-1 mb-1">
            {Array.from({length:60}).map((_,i)=>{
              const base = 0.2 + Math.sin(i*0.4)*0.15 + Math.sin(i*1.3)*0.1 + Math.random()*0.3;
              return <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-pink-500/40 to-cyan-400/40"
                style={{height:`${Math.min(1,base)*100}%`}}/>;
            })}
          </div>
          <div className="relative">
            {/* Playhead PUTIH garis vertikal */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                 style={{left:`calc(${playheadPct}% - 1px)`}}>
              <div className="absolute -top-0.5 -left-1.5 w-3.5 h-3.5 bg-white rotate-45"/>
            </div>
            <div ref={timelineStripRef}
                 className="flex items-center gap-1 overflow-x-auto py-1 px-1 snap-x timeline-strip no-scrollbar"
                 style={{scrollBehavior:"auto"}}>
              {slides.map((s:any, i:number)=>{
                const isActive = i===activeSlide;
                return (
                  <button key={s.id}
                    onClick={()=>{
                      setActiveSlide(i);
                      seekPreview(i*(curSlideDur+transitionDur/videoSpeed));
                    }}
                    className={`relative shrink-0 snap-start rounded-md overflow-hidden border-2 transition ${isActive?"border-pink-400 scale-[1.05] shadow-lg shadow-pink-500/40":"border-white/10 opacity-60"}`}
                    style={{width:thumbW,height:thumbH}}>
                    <img src={s.imageUrl} className="w-full h-full object-cover"
                         style={{filter: isActive?getFilterString():"none"}} alt=""/>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] text-center py-0.5 font-bold">{i+1}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-1 px-1">
            <input type="range" min={0} max={totalDur} step={0.05}
                   value={previewCurrent}
                   onChange={e=>{
                     const t = Number(e.target.value);
                     setActiveSlide(Math.min(slides.length-1, Math.floor(t/(curSlideDur+transitionDur/videoSpeed))));
                     seekPreview(t);
                   }}
                   className="w-full accent-pink-500 h-1"/>
          </div>
        </div>

        {/* PLAYBACK CONTROLS */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-black">
          <button onClick={()=>seekPreview(Math.max(0,previewCurrent-5))} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg active:scale-95">⏮</button>
          <button onClick={togglePreview}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-pink-500/40 active:scale-95">
            {previewPlaying?"⏸":"▶️"}
          </button>
          <button onClick={()=>seekPreview(Math.min(totalDur, previewCurrent+5))} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg active:scale-95">⏭</button>
          <button onClick={()=>setPreviewMuted(!previewMuted)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg active:scale-95">
            {previewMuted?"🔇":"🔊"}
          </button>
          <div className="text-[11px] text-white/70 font-mono ml-auto tabular-nums">{formatDur(previewCurrent)} / {formatDur(totalDur)}</div>
        </div>

        {/* TOOLBAR 9 TABS (sticky) */}
        <div className="flex items-stretch gap-0.5 p-1.5 bg-black border-t border-white/10 overflow-x-auto no-scrollbar">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg shrink-0 min-w-[58px] text-[10px] font-semibold transition active:scale-95 ${
                tab===t.id?"bg-gradient-to-b from-pink-500/40 to-pink-500/20 border border-pink-400/50 text-white":"text-white/60 hover:bg-white/5 border border-transparent"
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </div>

        {/* PANEL KONTEN */}
        <div className="bg-gradient-to-b from-[#15091f] to-black border-t border-white/5 p-3 overflow-y-auto studio-panel"
             style={{maxHeight:"42vh"}}>
          {tab==="edit" && <EditTab {...{slideDuration,setSlideDuration,transitionDur,setTransitionDur,transition,setTransition,onBack,onExport}}/>}
          {tab==="audio" && <AudioTab {...{audioMode,setAudioMode,aiMusicUrl,ttsUrl,musicUrl,proxifyAudioUrl,audioSrc}}/>}
          {tab==="text" && <TextTab {...{showTitle,setShowTitle,showLyrics,setShowLyrics,captionStyle,setCaptionStyle,textLayers,setTextLayers,totalDur}}/>}
          {tab==="sticker" && <StickerTab {...{spectrumSticker,setSpectrumSticker}}/>}
          {tab==="overlay" && <OverlayTab {...{logoDataUrl,logoPosition,setLogoPosition,onLogoUpload,vizColor,setVizColor,vizStyle,setVizStyle}}/>}
          {tab==="filter" && <FilterTab {...{slides,activeSlide,activeFilter,setActiveFilter,FILTERS}}/>}
          {tab==="adjust" && <AdjustTab {...{brightness,setBrightness,contrast,setContrast,saturation,setSaturation,sharpen,setSharpen,vignetteAmt,setVignetteAmt,resetAdjust}}/>}
          {tab==="effect" && <EffectTab {...{transition,setTransition,showTitle,setShowTitle,showLyrics,setShowLyrics}}/>}
          {tab==="speed" && <SpeedTab {...{videoSpeed,setVideoSpeed,curSlideDur}}/>}
        </div>

        {isMobile && <div className="h-[env(safe-area-inset-bottom)] bg-black"/>}

        {/* Hidden audio */}
        <audio ref={previewAudioRef} preload="metadata" className="hidden"/>
      </div>

      {/* Global styles utk fullscreen editor di HP */}
      <style jsx global>{`
        .studio-mobile { padding-bottom: 0; display:flex; flex-direction:column; }
        .studio-preview-area { min-height: 0; }
        .studio-panel::-webkit-scrollbar { width: 4px; }
        .studio-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .timeline-strip { scrollbar-width: none; }
        @keyframes tt-fadein { from{opacity:0;transform:translate(-50%,-40%) scale(0.9);} to{opacity:1;transform:translate(-50%,-50%) scale(1);} }
        @keyframes tt-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1);} 50%{transform:translate(-50%,-50%) scale(1.08);} }
        @keyframes tt-bounce { 0%,100%{transform:translate(-50%,-50%) translateY(0);} 50%{transform:translate(-50%,-50%) translateY(-6px);} }
        .tt-fadein { animation: tt-fadein 0.4s ease-out both; }
        .tt-pulse { animation: tt-pulse 0.8s ease-in-out infinite; }
        .tt-bounce { animation: tt-bounce 0.6s ease-in-out infinite; }
        @media (min-width: 768px) {
          .studio-shell { background:#000; border:1px solid rgba(255,255,255,0.1); }
        }
      `}</style>
    </section>
  );
}

// ====== TAB PANELS ======
function EditTab({slideDuration,setSlideDuration,transitionDur,setTransitionDur,transition,setTransition,onBack,onExport}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">✂️ Edit Klip</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="flex justify-between text-[11px] mb-1"><span>⏱ Durasi klip</span><b className="text-pink-300">{slideDuration.toFixed(1)}s</b></div>
          <input type="range" min={1.5} max={8} step={0.5} value={slideDuration}
                 onChange={e=>setSlideDuration(Number(e.target.value))} className="w-full accent-pink-500"/>
        </label>
        <label className="block">
          <div className="flex justify-between text-[11px] mb-1"><span>🔀 Transisi</span><b className="text-pink-300">{transitionDur.toFixed(2)}s</b></div>
          <input type="range" min={0} max={2} step={0.1} value={transitionDur}
                 onChange={e=>setTransitionDur(Number(e.target.value))} className="w-full accent-pink-500"/>
        </label>
      </div>
      <div>
        <div className="text-[11px] mb-1.5 text-white/70">🔀 Jenis transisi</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {TRANSITION_STYLES.map((t:any)=>(
            <button key={t.id} onClick={()=>setTransition(t.id)}
                    className={`q-tile !text-[10px] !py-2 ${transition===t.id?"active":""}`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button onClick={onBack} className="btn btn-ghost text-xs col-span-1">← Audio</button>
        <button onClick={onExport} className="btn btn-primary text-xs col-span-2 glow">Ekspor →</button>
      </div>
    </div>
  );
}

function AudioTab({audioMode,setAudioMode,audioSrc,proxifyAudioUrl}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">🎵 Audio</div>
      <div className="grid grid-cols-5 gap-1.5">
        {[{id:"tts",l:"🗣️ TTS"},{id:"music",l:"🎵 Musik"},{id:"aimusic",l:"🤖 AI"},{id:"both",l:"🔀 Campur"},{id:"none",l:"🔇 Mute"}].map((m:any)=>(
          <button key={m.id} onClick={()=>setAudioMode(m.id)}
            className={`py-2.5 rounded-lg text-[10px] font-bold border active:scale-95 ${audioMode===m.id?"bg-pink-500/30 border-pink-400 text-white":"bg-white/5 border-white/10 text-white/70"}`}>{m.l}</button>
        ))}
      </div>
      <div className="text-[11px] text-white/60 p-2 rounded-lg bg-white/5">
        💡 Tap <b>← Kembali</b> di top bar buat ganti sumber audio / generate ulang lagu AI.
      </div>
      {audioSrc && (
        <audio controls src={proxifyAudioUrl(audioSrc)} className="w-full"/>
      )}
      <div className="text-[10px] text-white/50">Volume audio diatur oleh tombol 🔊 di kontrol playback.</div>
    </div>
  );
}

const TEXT_TEMPLATES = [
  {id:"default",  label:"Default",      preview:"Teks"},
  {id:"neon",     label:"💫 Neon",      preview:"Neon"},
  {id:"boldwhite",label:"⚪ Bold Putih",preview:"BOLD"},
  {id:"thanks",   label:"🙏 Thanks",    preview:"THANKS"},
  {id:"titlehere",label:"🎬 Title Here",preview:"TITLE"},
  {id:"mymusic",  label:"🎵 My Music",  preview:"My Music"},
  {id:"nowplaying",label:"▶️ Now Playing",preview:"NOW PLAYING"},
  {id:"trendy",   label:"🔴 Trendy",    preview:"TRENDY"},
  {id:"fire",     label:"🔥 Api",       preview:"FIRE"},
  {id:"horror",   label:"👻 Horror",    preview:"HORROR"},
  {id:"aura",     label:"✨ Aura",      preview:"AURA"},
  {id:"please",   label:"💕 Please Like",preview:"LIKE"},
];

const FONTS = [
  {id:"SYSTEM",    label:"SYSTEM",      fb:"system-ui,-apple-system,sans-serif"},
  {id:"WASHED",    label:"Washed ↓",    fb:"'Impact','Arial Black',sans-serif"},
  {id:"VISION",    label:"Vision 💎",   fb:"'Georgia','Times New Roman',serif"},
  {id:"MODERN",    label:"MODERN 💎",   fb:"'Courier New',monospace"},
  {id:"TOOTH",     label:"Tooth Nail 💎",fb:"'Brush Script MT','Segoe Script',cursive"},
  {id:"CELAND",    label:"Celandine 💎",fb:"'Comic Sans MS',cursive"},
  {id:"STARRY",    label:"Starry 💎",   fb:"'Trebuchet MS',sans-serif"},
  {id:"KLOP",      label:"KLOP 💎",     fb:"Tahoma,sans-serif"},
  {id:"ANTIK",     label:"Antik 💎",    fb:"'Times New Roman',serif"},
  {id:"FEISTY",    label:"Feisty 💎",   fb:"'Palatino Linotype','Book Antiqua',serif"},
  {id:"MONT",      label:"Montra 💎",   fb:"'Montserrat','Arial Black',sans-serif"},
  {id:"ROFUEGO",   label:"ROFUEGO 💎",  fb:"'Impact','Oswald',sans-serif"},
  {id:"MERIENDA",  label:"Merienda 💎", fb:"cursive"},
  {id:"RUST",      label:"RUSTPRINT 💎",fb:"'Courier New',monospace"},
  {id:"RUBIK",     label:"Rubik 💎",    fb:"'Rubik','Arial Rounded MT Bold',sans-serif"},
  {id:"ITALIC",    label:"Italic 💎",   fb:"Georgia,serif"},
  {id:"ATOMIC",    label:"ATOMIC 💎",   fb:"'Impact',sans-serif"},
  {id:"CCMOD",     label:"CC-MODERNO 💎",fb:"'Arial Black',sans-serif"},
  {id:"CHUNK",     label:"ChunkFive 💎",fb:"'Rockwell Extra Bold','Arial Black',serif"},
  {id:"BOLD",      label:"Bebas 💎",    fb:"'Impact','Bebas Neue',sans-serif"},
];
// Font CSS untuk web preview (pakai web-safe stacks; effect keliatan kok tanpa Google Fonts CDN)
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

const ANIM_IN = [
  {id:"none",    label:"❌ Tidak Ada"},
  {id:"fadein",  label:"🌟 Fade In"},
  {id:"pop",     label:"💥 Pop"},
  {id:"slideup", label:"⬆️ Geser Atas"},
  {id:"slideleft",label:"⬅️ Geser Kiri"},
  {id:"typewriter",label:"⌨️ Ketik"},
];
const ANIM_LOOP = [
  {id:"none",   label:"❌ Tidak Ada"},
  {id:"pulse",  label:"💓 Denyut"},
  {id:"bounce", label:"🏀 Mantul"},
  {id:"glow",   label:"✨ Bersinar"},
];
const ANIM_OUT = [
  {id:"fade",     label:"🌫️ Fade Out"},
  {id:"pop",      label:"💨 Pop Out"},
  {id:"slideup",  label:"⬆️ Slide Atas"},
  {id:"slideleft",label:"⬅️ Slide Kiri"},
];

// ===== CAPCUT TEXT EFFECTS (16 presets) =====
const TEXT_EFFECTS = [
  {id:"none",              label:"❌ Basic",       color:"#aaa"},
  {id:"art-paper",         label:"📄 Kertas",     color:"#f5f0e6"},
  {id:"art-stroke-white",  label:"⬜ Outline Pth",color:"#fff"},
  {id:"art-stroke-black",  label:"⬛ Outline Htm",color:"#000"},
  {id:"art-blood",         label:"🩸 Darah",      color:"#8b0000"},
  {id:"art-yellow-black",  label:"⚠️ Kuning Htm", color:"#fde047"},
  {id:"art-white-red",     label:"🔴 Putih Merah",color:"#fff"},
  {id:"art-gold-black",    label:"🏆 Emas",       color:"#fcd34d"},
  {id:"art-neon-pink",     label:"💗 Neon Pink",  color:"#ff2d95"},
  {id:"art-neon-red",      label:"❤️ Neon Merah", color:"#ff0033"},
  {id:"art-neon-blue",     label:"💙 Neon Biru",  color:"#00e5ff"},
  {id:"art-scratch-red",   label:"✏️ Goresan Merah",color:"#fff"},
  {id:"art-gradient-ko",   label:"🌈 Kuning-Orange-Biru",color:"#f97316"},
  {id:"art-3d",            label:"🧊 3D",         color:"#e5e7eb"},
  {id:"art-chrome",        label:"⚪ Chrome",     color:"#d1d5db"},
  {id:"art-glitter",       label:"✨ Glitter Pink",color:"#ec4899"},
  {id:"art-sparkle",       label:"💫 Sparkle Cyan",color:"#22d3ee"},
  {id:"art-glitch",        label:"📺 Glitch RGB", color:"#fff"},
];

function TextTab({showTitle,setShowTitle,showLyrics,setShowLyrics,captionStyle,setCaptionStyle,textLayers,setTextLayers,totalDur}:any){
  const [tab, setTab] = useState<"main"|"template"|"font"|"style"|"effect"|"animation"|"bubble">("main");
  const selId = textLayers.find((l:TextLayer)=>l.id.startsWith("sel_"))?.id;
  const sel:TextLayer = textLayers.find((l:TextLayer)=>l.id===selId) || textLayers[0];
  const upd = (patch:Partial<TextLayer>) => {
    setTextLayers((ls:TextLayer[])=>ls.map((l:TextLayer)=>l.id===(sel?.id)?{...l,...patch}:l));
  };
  const addText = () => {
    const n: TextLayer = {
      id:"t"+Date.now(), text:"Masukkan teks",
      x:0.5, y:0.5, sizePct:0.08, opacity:1,
      color:"#ffffff", bold:true, template:"default",
      effect:"none",
      animIn:"fadein", animOut:"fade", animLoop:"none",
      start:0, end: totalDur||10,
    };
    // Hapus selection flag lama
    const cleaned = textLayers.map((l:TextLayer)=>({...l, id:l.id.startsWith("sel_")?l.id.replace("sel_",""):l.id}));
    setTextLayers([...cleaned, {...n, id:"sel_"+n.id}] as any);
  };
  const delSel = () => {
    if (!sel) return;
    setTextLayers((ls:TextLayer[])=>ls.filter((l:TextLayer)=>l.id!==sel.id));
  };
  if (tab==="main") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white/80">💬 Teks</div>
          <button onClick={addText} className="btn btn-primary btn-sm">+ Tambahkan teks</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>setShowTitle(!showTitle)} className={`q-tile !text-[10px] ${showTitle?"active":""}`}>
            🏷️ Judul · {showTitle?"ON":"OFF"}
          </button>
          <button onClick={()=>setShowLyrics(!showLyrics)} className={`q-tile !text-[10px] ${showLyrics?"active":""}`}>
            🎤 Karaoke · {showLyrics?"ON":"OFF"}
          </button>
        </div>
        <div className="text-[11px] text-white/60">Gaya caption karaoke:</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            {id:"capcut",label:"🟡 CapCut"},{id:"neon",label:"💫 Neon"},
            {id:"boldwhite",label:"⚪ Bold"},{id:"gradient",label:"🌈 Gradient"},
          ].map((s:any)=>(
            <button key={s.id} onClick={()=>setCaptionStyle(s.id)}
                    className={`q-tile !text-[10px] ${captionStyle===s.id?"active":""}`}>{s.label}</button>
          ))}
        </div>
        <div className="h-px bg-white/10 my-1"/>
        <div className="text-[11px] text-white/60">📑 Layer teks kamu:</div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {textLayers.length===0 && (
            <div className="text-[11px] text-white/40 text-center py-4 border border-dashed border-white/10 rounded-lg">
              Belum ada layer teks. Tap <b>+ Tambahkan teks</b> di atas buat nambah.
            </div>
          )}
          {textLayers.map((l:TextLayer)=>(
            <div key={l.id} className={`flex items-center gap-2 p-2 rounded-lg border ${sel?.id===l.id?"border-pink-400 bg-pink-500/10":"border-white/10 bg-white/5"}`}>
              <button onClick={()=>setTextLayers((ls:TextLayer[])=>ls.map(x=>({...x,id:x.id===l.id?"sel_"+x.id.replace("sel_",""):x.id.replace("sel_","")})))}
                className="flex-1 min-w-0 text-left">
                <div className="text-xs font-bold truncate">{l.text}</div>
                <div className="text-[9px] text-white/50">{l.template} · {(l.sizePct!*100).toFixed(0)}% · {l.start.toFixed(1)}s→{l.end.toFixed(1)}s</div>
              </button>
              <button onClick={()=>upd({opacity: l.opacity===0?1:0})} className="w-8 h-8 rounded-lg bg-white/5 text-sm">{l.opacity===0?"👁️‍🗨️":"👁"}</button>
              <button onClick={()=>{setTextLayers((ls:TextLayer[])=>ls.filter(x=>x.id!==l.id));}} className="w-8 h-8 rounded-lg bg-red-500/20 text-red-200 text-sm">🗑</button>
            </div>
          ))}
        </div>
        {sel && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              {id:"template",l:"📋 Template"},{id:"font",l:"🔤 Font"},{id:"style",l:"🎨 Gaya"},
              {id:"effect",l:"✨ Efek"},{id:"animation",l:"🎬 Animasi"},{id:"bubble",l:"💬 Gelembung"},
            ].map((t:any)=>(
              <button key={t.id} onClick={()=>setTab(t.id as any)}
                className="q-tile !text-[10px] !py-2">{t.l}</button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (!sel) return <div className="text-xs text-white/50 text-center py-6">Pilih/buat layer teks dulu ya bro.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={()=>setTab("main")} className="w-9 h-9 rounded-lg bg-white/10 text-sm">←</button>
        <input className="input flex-1 !py-2 text-sm" value={sel.text}
               onChange={e=>upd({text:e.target.value})} placeholder="Masukkan teks..."/>
        <button onClick={delSel} className="w-9 h-9 rounded-lg bg-red-500/20 text-red-200 text-sm">🗑</button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          {id:"template",l:"📋 Template"},{id:"font",l:"🔤 Font"},{id:"style",l:"🎨 Gaya"},
          {id:"effect",l:"✨ Efek"},{id:"animation",l:"🎬 Animasi"},{id:"bubble",l:"💬 Gelembung"},
        ].map((t:any)=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 border ${tab===t.id?"bg-pink-500/30 border-pink-400 text-white":"bg-white/5 border-white/10 text-white/60"}`}>{t.l}</button>
        ))}
      </div>

      {tab==="template" && (
        <div>
          <div className="grid grid-cols-4 gap-2">
            {TEXT_TEMPLATES.map(t=>(
              <button key={t.id} onClick={()=>upd({template:t.id})}
                className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center p-1 text-center ${sel.template===t.id?"border-pink-400 bg-pink-500/10":"border-white/10 bg-white/5"}`}>
                <div className="text-sm font-black truncate w-full" style={{
                  color:t.id==="horror"?"#dc2626":t.id==="trendy"?"#ef4444":t.id==="aura"?"#fef08a":t.id==="fire"?"#f97316":"#fff",
                  textShadow:t.id==="neon"?"0 0 12px #ec4899":t.id==="fire"?"0 0 14px #ff6b00":t.id==="aura"?"0 0 18px #fb923c":(t.id!=="default"?"0 1px 3px rgba(0,0,0,0.8)":"0 2px 4px rgba(0,0,0,0.9)"),
                  WebkitTextStroke:t.id==="boldwhite"||t.id==="thanks"||t.id==="trendy"?"1.5px #000":"0",
                }}>{t.preview}</div>
                <div className="text-[8px] text-white/60 truncate w-full">{t.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab==="font" && (
        <div className="space-y-2">
          <div className="flex gap-1.5 text-[10px] font-bold overflow-x-auto no-scrollbar pb-0.5">
            {["🔍 Cari","Font merek","Sedang tren","Sepak bola","Minions"].map((c,i)=>(
              <button key={i} className={`px-2.5 py-1 rounded-md shrink-0 border ${i===0?"bg-pink-500/30 border-pink-400 text-white":"bg-white/5 border-white/10 text-white/60"}`}>{c}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
            {FONTS.map(f=>(
              <button key={f.id} onClick={()=>upd({font:f.id})}
                className={`p-2 rounded-lg border text-xs overflow-hidden ${(sel.font||"SYSTEM")===f.id?"border-pink-400 bg-pink-500/10 text-white":"border-white/10 bg-white/5 text-white/80"}`}
                style={{fontFamily:f.fb, fontWeight:900, fontSize:"11px"}}>{f.label}</button>
            ))}
          </div>
          <label className="block pt-1">
            <div className="flex justify-between text-[11px] mb-1">
              <span>Ukuran</span><b className="text-pink-300">{Math.round((sel.sizePct||0.07)*100)}%</b>
            </div>
            <input type="range" min={3} max={15} step={0.5}
                   value={Math.round((sel.sizePct||0.07)*100)}
                   onChange={e=>upd({sizePct:Number(e.target.value)/100})}
                   className="w-full accent-pink-500"/>
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={()=>upd({bold:!sel.bold})}
              className={`q-tile !text-xs ${sel.bold?"active":""}`}><b>B</b> Tebal</button>
            <button onClick={()=>upd({italic:!sel.italic})}
              className={`q-tile !text-xs ${sel.italic?"active":""}`}><i>I</i> Miring</button>
          </div>
        </div>
      )}

      {tab==="style" && (
        <div className="space-y-2">
          <div>
            <div className="text-[11px] mb-1">🎨 Warna teks</div>
            <div className="flex gap-2 flex-wrap items-center">
              {["#ffffff","#fde047","#ef4444","#22c55e","#3b82f6","#a855f7","#ec4899","#f97316","#000000"].map(c=>(
                <button key={c} onClick={()=>upd({color:c})}
                  className={`w-8 h-8 rounded-full border-2 ${sel.color===c?"border-pink-400 scale-110":"border-white/20"}`}
                  style={{background:c,boxShadow:`0 0 10px ${c}40`}}/>
              ))}
              <input type="color" value={sel.color||"#fff"} onChange={e=>upd({color:e.target.value})}
                className="w-9 h-9 rounded-full bg-transparent border-0 p-0 cursor-pointer"/>
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1">🖌️ Gaya (stroke/shadow)</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                {id:"none",l:"❌ Polos"},{id:"stroke",l:"⬛ Outline"},{id:"shadow",l:"🌑 Shadow"},{id:"glow",l:"✨ Glow"},
              ].map((s:any)=>{
                const isStroke = sel.strokeColor && !sel.shadowColor;
                const isShadow = sel.shadowColor && !s.id.includes("glow");
                const isGlow = sel.shadowBlur && sel.shadowBlur>15;
                const active = (s.id==="none"&&!isStroke&&!isShadow&&!isGlow)
                  || (s.id==="stroke"&&isStroke)
                  || (s.id==="shadow"&&isShadow&&!isGlow)
                  || (s.id==="glow"&&isGlow);
                return <button key={s.id} onClick={()=>{
                  if (s.id==="none") upd({strokeColor:undefined,strokeWidth:undefined,shadowColor:undefined,shadowBlur:undefined});
                  else if (s.id==="stroke") upd({strokeColor:"#000000",strokeWidth:0.15,shadowColor:undefined,shadowBlur:undefined});
                  else if (s.id==="shadow") upd({strokeColor:undefined,shadowColor:"rgba(0,0,0,0.8)",shadowBlur:6});
                  else if (s.id==="glow") upd({strokeColor:undefined,shadowColor:sel.color||"#fff",shadowBlur:22});
                }} className={`q-tile !text-[10px] ${active?"active":""}`}>{s.l}</button>;
              })}
            </div>
          </div>
          <label className="block">
            <div className="flex justify-between text-[11px] mb-1"><span>Opacity</span><b className="text-pink-300">{Math.round((sel.opacity||1)*100)}%</b></div>
            <input type="range" min={0} max={100} step={5} value={Math.round((sel.opacity||1)*100)}
                   onChange={e=>upd({opacity:Number(e.target.value)/100})} className="w-full accent-pink-500"/>
          </label>
        </div>
      )}

      {tab==="effect" && (
        <div className="space-y-2.5">
          <div className="flex gap-1.5 text-[10px] font-bold">
            <button className="px-2.5 py-1 rounded-md bg-pink-500/30 border border-pink-400 text-white">🔥 Sedang tren</button>
            <button className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/60">Klasik</button>
            <button className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/60">BAF</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TEXT_EFFECTS.map(e=>{
              const isActive = ((sel as any).effect||"none")===e.id;
              let previewStyle: React.CSSProperties = {
                fontWeight:900, fontSize:15,
                color:"#fff",
                lineHeight:1.1,
              };
              if (e.id==="art-paper") previewStyle={...previewStyle,color:"#f5f0e6",WebkitTextStroke:"0.5px rgba(120,80,40,0.8)",textShadow:"0 1px 2px rgba(80,40,10,0.5)"};
              else if (e.id==="art-stroke-white") previewStyle={...previewStyle,color:"transparent",WebkitTextStroke:"1.5px #fff",textShadow:"0 1px 3px rgba(0,0,0,0.6)"};
              else if (e.id==="art-stroke-black") previewStyle={...previewStyle,color:"transparent",WebkitTextStroke:"1.5px #000",textShadow:"0 1px 3px rgba(0,0,0,0.4)",background:"#444",padding:"4px 6px",borderRadius:4};
              else if (e.id==="art-blood") previewStyle={...previewStyle,color:"#8b0000",WebkitTextStroke:"0.5px #2a0000",textShadow:"0 0 6px #ff0000"};
              else if (e.id==="art-yellow-black") previewStyle={...previewStyle,color:"#fde047",WebkitTextStroke:"1.5px #000"};
              else if (e.id==="art-white-red") previewStyle={...previewStyle,color:"#fff",WebkitTextStroke:"1.2px #dc2626",textShadow:"0 0 5px rgba(220,38,38,0.6)"};
              else if (e.id==="art-gold-black") previewStyle={...previewStyle,background:"linear-gradient(180deg,#fff3b0,#fcd34d 30%,#b45309 55%,#fde68a 75%,#92400e)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",WebkitTextStroke:"1px #000"};
              else if (e.id==="art-neon-pink") previewStyle={...previewStyle,color:"#fff",textShadow:"0 0 5px #ff2d95,0 0 12px #ff2d95,0 0 22px #ff2d95"};
              else if (e.id==="art-neon-red") previewStyle={...previewStyle,color:"#fff",textShadow:"0 0 5px #ff0033,0 0 12px #ff0033,0 0 22px #ff0033"};
              else if (e.id==="art-neon-blue") previewStyle={...previewStyle,color:"#fff",textShadow:"0 0 5px #00e5ff,0 0 12px #00e5ff,0 0 22px #00e5ff"};
              else if (e.id==="art-scratch-red") previewStyle={...previewStyle,color:"#fff",WebkitTextStroke:"1px #ff0033",textShadow:"0 0 6px rgba(255,0,50,0.7)"};
              else if (e.id==="art-gradient-ko") previewStyle={...previewStyle,background:"linear-gradient(180deg,#fde047,#f97316,#2563eb)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",WebkitTextStroke:"0.7px #000"};
              else if (e.id==="art-3d") previewStyle={...previewStyle,color:"#fff",WebkitTextStroke:"0.7px #000",textShadow:"2px 2px 0 #374151,4px 4px 0 rgba(0,0,0,0.3)"};
              else if (e.id==="art-chrome") previewStyle={...previewStyle,background:"linear-gradient(180deg,#e5e7eb 0%,#fff 30%,#9ca3af 45%,#fff 60%,#6b7280 75%,#d1d5db)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",WebkitTextStroke:"0.5px #1f2937"};
              else if (e.id==="art-glitter") previewStyle={...previewStyle,color:"#fff",textShadow:"0 0 6px #ec4899,0 0 14px #ec4899,0 0 24px #ec4899"};
              else if (e.id==="art-sparkle") previewStyle={...previewStyle,color:"#fff",textShadow:"0 0 6px #22d3ee,0 0 14px #22d3ee,0 0 24px #22d3ee"};
              else if (e.id==="art-glitch") previewStyle={...previewStyle,color:"#fff",textShadow:"-1.5px 0 #ff0050,1.5px 0 #00e5ff"};
              else previewStyle={...previewStyle,color:e.color,textShadow:"0 1px 2px rgba(0,0,0,0.9)"};
              return (
                <button key={e.id} onClick={()=>upd({effect:e.id})}
                  className={`aspect-[4/3] rounded-xl border-2 flex flex-col items-center justify-center p-1 ${isActive?"border-pink-400 bg-pink-500/10":"border-white/10 bg-gradient-to-br from-white/8 to-white/3"}`}
                  style={e.id==="art-stroke-black"?{background:"linear-gradient(135deg,#222,#444)"}:undefined}>
                  <div style={previewStyle} className="truncate max-w-full text-center">Aa</div>
                  <div className="text-[8px] text-white/60 mt-1 truncate w-full text-center leading-tight">{e.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab==="animation" && (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] mb-1.5 text-white/70">🎬 Animasi Masuk</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ANIM_IN.map(a=>(
                <button key={a.id} onClick={()=>upd({animIn:a.id})}
                  className={`q-tile !text-[10px] ${sel.animIn===a.id?"active":""}`}>{a.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1.5 text-white/70">🚪 Animasi Keluar</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ANIM_OUT.map(a=>(
                <button key={a.id} onClick={()=>upd({animOut:a.id})}
                  className={`q-tile !text-[10px] ${(sel.animOut||"fade")===a.id?"active":""}`}>{a.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1.5 text-white/70">🔁 Animasi Loop</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ANIM_LOOP.map(a=>(
                <button key={a.id} onClick={()=>upd({animLoop:a.id})}
                  className={`q-tile !text-[10px] ${sel.animLoop===a.id?"active":""}`}>{a.label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="flex justify-between text-[11px] mb-1"><span>Mulai</span><b className="text-pink-300">{sel.start.toFixed(1)}s</b></div>
              <input type="range" min={0} max={totalDur||10} step={0.1} value={sel.start}
                     onChange={e=>upd({start:Math.min(Number(e.target.value),sel.end-0.2)})} className="w-full accent-pink-500"/>
            </label>
            <label className="block">
              <div className="flex justify-between text-[11px] mb-1"><span>Selesai</span><b className="text-pink-300">{sel.end.toFixed(1)}s</b></div>
              <input type="range" min={0} max={totalDur||10} step={0.1} value={sel.end}
                     onChange={e=>upd({end:Math.max(Number(e.target.value),sel.start+0.2)})} className="w-full accent-pink-500"/>
            </label>
          </div>
        </div>
      )}

      {tab==="bubble" && (
        <div className="space-y-2">
          <div className="text-[11px] text-white/60">💬 Gelembung chat (coming soon)</div>
          <div className="grid grid-cols-4 gap-2">
            {["💬","💭","🔵","🟢","🟡","🗨️","📢","💡"].map((e,i)=>(
              <button key={i} className="aspect-square rounded-xl border border-white/10 bg-white/5 text-2xl opacity-60">{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StickerTab({spectrumSticker,setSpectrumSticker}:any){
  const [cat, setCat] = useState<string>("audio");
  const list = STICKER_PRESETS.filter((s:any)=>s.cat===cat);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <span className="text-sm">🔍</span>
          <input placeholder="Cari stiker..." className="bg-transparent outline-none text-xs text-white placeholder:text-white/40 w-full"/>
        </div>
      </div>
      {/* Kategori icon bar (mirip CapCut) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {[
          {id:"image+",ico:"🖼️"},{id:"sparkle+",ico:"✨"},{id:"bookmark",ico:"🔖"},{id:"paperclip",ico:"📎"},
          {id:"emoji",ico:"😀"},{id:"hot",ico:"🔥"},{id:"ball",ico:"⚽"},{id:"minion",ico:"👀"},
        ].map((c,i)=>(
          <button key={i} className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center text-lg ${i===0?"bg-pink-500/30 border-pink-400":"bg-white/5 border-white/10"}`}>{c.ico}</button>
        ))}
      </div>
      {/* Sub-kategori */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {STICKER_CATS.map((c:any)=>(
          <button key={c.id} onClick={()=>setCat(c.id)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 border ${cat===c.id?"bg-pink-500/30 border-pink-400 text-white":"bg-white/5 border-white/10 text-white/60"}`}>{c.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {list.map((s:any)=>(
          <button key={s.id} onClick={()=>setSpectrumSticker(s.id)}
            className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center active:scale-95 ${spectrumSticker===s.id?"border-pink-400 bg-pink-500/10":"border-white/10"}`}
            style={{background: s.bg, color: s.color||"#fff"}}>
            <div className="text-2xl drop-shadow-lg">{s.icon}</div>
            <div className="text-[8px] mt-1 font-bold drop-shadow" style={{color:s.color||"#fff"}}>{s.label}</div>
          </button>
        ))}
      </div>
      <div className="text-[10px] text-white/50 p-2 rounded-lg bg-white/5">
        💡 Stiker audio bergerak ikut beat musik. Tap ▶️ di preview buat lihat animasinya.
      </div>
    </div>
  );
}

function OverlayTab({logoDataUrl,logoPosition,setLogoPosition,onLogoUpload,vizColor,setVizColor,vizStyle,setVizStyle}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">🖼️ Overlay / Logo</div>
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2">
        {logoDataUrl ? (
          <img src={logoDataUrl} className="w-12 h-12 rounded-full border-2 border-white/30" alt="logo"/>
        ) : (
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl">🖼️</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-white/80">Logo channel/watermark</div>
          <div className="text-[10px] text-white/50">Maks 3MB, bulat otomatis</div>
        </div>
        <label className="btn btn-ghost btn-sm cursor-pointer">
          Upload<input type="file" accept="image/*" hidden onChange={(e:any)=>onLogoUpload(e.target.files?.[0])}/>
        </label>
      </div>
      {logoDataUrl && (
        <div className="grid grid-cols-3 gap-1.5">
          {[{id:"center",l:"🎯 Tengah"},{id:"corner",l:"📍 Pojok"},{id:"none",l:"❌ Hidden"}].map((p:any)=>(
            <button key={p.id} onClick={()=>setLogoPosition(p.id)}
              className={`q-tile !text-[10px] ${logoPosition===p.id?"active":""}`}>{p.l}</button>
          ))}
        </div>
      )}
      <div>
        <div className="text-[11px] mb-1 text-white/70">🎨 Warna tema spectrum</div>
        <div className="flex gap-2 flex-wrap items-center">
          {COLOR_PRESETS.map(c=>(
            <button key={c.hex} onClick={()=>setVizColor(c.hex)}
              className={`color-swatch ${vizColor===c.hex?"active":""}`}
              style={{width:30,height:30,background:`radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), ${c.hex} 60%)`}}/>
          ))}
          <input type="color" value={vizColor} onChange={e=>setVizColor(e.target.value)}
            className="w-10 h-10 rounded-full bg-transparent border-0 p-0 cursor-pointer"/>
        </div>
      </div>
      <div>
        <div className="text-[11px] mb-1 text-white/70">📊 Style spectrum utama</div>
        <div className="grid grid-cols-3 gap-1.5">
          {VIZ_STYLES.filter((v:any,i:number,a:any)=>a.findIndex((x:any)=>x.id===v.id)===i).map((s:any)=>(
            <button key={s.id} onClick={()=>setVizStyle(s.id)}
              className={`q-tile !text-[10px] ${vizStyle===s.id?"active":""}`}>{s.emoji} {s.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterTab({slides,activeSlide,activeFilter,setActiveFilter,FILTERS}:any){
  const previewSrc = slides[Math.min(activeSlide,slides.length-1)]?.imageUrl;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-white/80">🎨 Filter Video</div>
        <button onClick={()=>setActiveFilter("none")} className="text-[10px] px-2 py-1 rounded bg-white/10 active:scale-95">↻ Reset</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
        {FILTERS.map((f:any)=>(
          <button key={f.id} onClick={()=>setActiveFilter(f.id)}
            className={`shrink-0 flex flex-col items-center gap-1 active:scale-95 ${activeFilter===f.id?"opacity-100":"opacity-70"}`}>
            <div className="w-16 h-16 rounded-lg overflow-hidden border-2"
                 style={{borderColor:activeFilter===f.id?"#ec4899":"rgba(255,255,255,0.15)"}}>
              {previewSrc && (
                <img src={previewSrc} className="w-full h-full object-cover" style={{filter:f.css}} alt=""/>
              )}
            </div>
            <span className="text-[9px] text-white/80 whitespace-nowrap font-semibold">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AdjustTab({brightness,setBrightness,contrast,setContrast,saturation,setSaturation,sharpen,setSharpen,vignetteAmt,setVignetteAmt,resetAdjust}:any){
  const rows = [
    {label:"☀️ Kecerahan",v:brightness,set:setBrightness,min:-50,max:50},
    {label:"◐ Kontras",v:contrast,set:setContrast,min:-50,max:50},
    {label:"🎨 Saturasi",v:saturation,set:setSaturation,min:-50,max:80},
    {label:"✨ Pertajam",v:sharpen,set:setSharpen,min:0,max:50},
    {label:"🌑 Vignette",v:vignetteAmt,set:setVignetteAmt,min:0,max:100},
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-white/80">☀️ Sesuaikan</div>
        <button onClick={resetAdjust} className="text-[10px] px-2 py-1 rounded bg-white/10 active:scale-95">↻ Reset</button>
      </div>
      {rows.map((s:any,i)=>(
        <label key={i} className="block">
          <div className="flex justify-between text-[11px] mb-1">
            <span>{s.label}</span><span className="text-white/50 font-mono tabular-nums">{s.v>0?"+":""}{s.v}</span>
          </div>
          <input type="range" min={s.min} max={s.max} step={1} value={s.v}
                 onChange={e=>s.set(Number(e.target.value))} className="w-full accent-pink-500"/>
        </label>
      ))}
    </div>
  );
}

function EffectTab({transition,setTransition,showTitle,setShowTitle,showLyrics,setShowLyrics}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">✨ Efek</div>
      <div>
        <div className="text-[11px] mb-1 text-white/70">Transisi antar slide</div>
        <div className="grid grid-cols-3 gap-1.5">
          {TRANSITION_STYLES.map((t:any)=>(
            <button key={t.id} onClick={()=>setTransition(t.id)}
              className={`q-tile !text-[10px] ${transition===t.id?"active":""}`}>{t.emoji} {t.label}</button>
          ))}
        </div>
      </div>
      <Toggle label="🏷️ Judul di video" desc="Overlay judul dengan glow" val={showTitle} set={setShowTitle}/>
      <Toggle label="🎤 Karaoke lirik" desc="Highlight kata per kata" val={showLyrics} set={setShowLyrics}/>
    </div>
  );
}

function SpeedTab({videoSpeed,setVideoSpeed,curSlideDur}:any){
  const speeds=[0.5,0.75,1,1.25,1.5,1.75,2];
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">⚡ Kecepatan Video</div>
      <label className="block">
        <div className="flex justify-between text-[11px] mb-1"><span>Speed</span><b className="text-pink-300">{videoSpeed.toFixed(2)}x</b></div>
        <input type="range" min={0.5} max={2} step={0.25} value={videoSpeed}
               onChange={e=>setVideoSpeed(Number(e.target.value))} className="w-full accent-pink-500"/>
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {speeds.map((s:number)=>(
          <button key={s} onClick={()=>setVideoSpeed(s)}
            className={`q-tile !text-[10px] ${Math.abs(videoSpeed-s)<0.01?"active":""}`}>{s}x</button>
        ))}
      </div>
      <div className="text-[10px] text-white/50 p-2 rounded-lg bg-white/5">Durasi per slide: <b className="text-white/80">{curSlideDur.toFixed(2)}s</b></div>
    </div>
  );
}

function Toggle({label,desc,val,set}:{label:string;desc:string;val:boolean;set:(v:boolean)=>void}){
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10 gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[10px] text-white/50">{desc}</div>
      </div>
      <div className={`toggle ${val?"on":""}`} onClick={()=>set(!val)}/>
    </div>
  );
}

// ============ EXPORT PANEL (Step 6) ============
type ExportPanelProps = {
  slides: any[]; isMobile: boolean;
  selectedTitle?: {text:string; keyword:string}; niche: string;
  quality: any; setQuality:(v:any)=>void;
  loading: string|null; progress: number; renderETA: string; stageText: string;
  videoUrl: string; videoBlob: Blob|null;
  meta: any;
  onBack: ()=>void;
  onRender: ()=>void;
  onDownload: ()=>void;
  onCopy:(k:string,t:string)=>void;
  copiedField: string;
  onDownloadMeta: ()=>void;
};
export function ExportPanel(p: ExportPanelProps) {
  const {slides, selectedTitle, niche, quality, setQuality,
         loading, progress, renderETA, stageText, videoUrl, videoBlob, meta,
         onBack, onRender, onDownload, onCopy, copiedField, onDownloadMeta} = p;
  const rendering = loading==="render";
  return (
    <section className="mt-0">
      <div className={"relative bg-black rounded-2xl overflow-hidden border border-white/10 -mx-1 sm:mx-0"}>
        <div className="flex items-center gap-2 p-2 bg-gradient-to-b from-white/5 to-transparent border-b border-white/10">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg">←</button>
          <div className="flex-1 text-center">
            <div className="text-sm font-black text-white">📤 Ekspor Video</div>
            <div className="text-[10px] text-white/50 truncate">{selectedTitle?.text || niche}</div>
          </div>
          <div className="w-10"/>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex justify-center">
            <div className="relative w-full max-w-[360px] rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl"
                 style={{aspectRatio:"16/9"}}>
              {videoUrl ? (
                <video controls src={videoUrl} className="w-full h-full bg-black" autoPlay loop playsInline/>
              ) : slides[0] ? (
                <img src={slides[0].imageUrl} className="w-full h-full object-cover" alt=""/>
              ) : <div className="w-full h-full bg-neutral-900"/>}
              {rendering && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-3">
                  <Spinner/>
                  <div className="text-white text-xs font-bold text-center">{stageText || "Rendering..."}</div>
                  <div className="w-full max-w-[220px] progress-track">
                    <div className="progress-fill" style={{width:`${Math.round(progress*100)}%`}}/>
                  </div>
                  <div className="text-white/70 text-[11px] font-mono">{Math.round(progress*100)}% {renderETA && `· ETA ${renderETA}`}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold mb-2 text-white/80">⚡ Pilih Kualitas</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUALITY_OPTIONS.map(q=>(
                <button key={q.id} onClick={()=>setQuality(q.id as any)}
                        className={`q-tile ${quality===q.id?"active":""}`}>
                  <div className="text-xs font-bold">{q.label}</div>
                  <div className="text-[10px] text-white/60 mt-0.5">{q.res} · {q.fps}fps</div>
                  {q.tag && <div className="text-[9px] text-pink-300 mt-0.5">{q.tag}</div>}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-white/50 mt-1.5">
              💡 HP: <b>Cepat (480p)</b> — render 3-5× realtime. YouTube: <b>Seimbang (720p)</b> / <b>Tinggi (1080p)</b>.
            </div>
          </div>

          {!videoUrl ? (
            <button onClick={onRender} disabled={rendering}
                    className="btn btn-primary w-full py-4 text-base glow">
              {rendering ? (<><Spinner/> Rendering...</>) : "🎬 Render Video Sekarang"}
            </button>
          ) : (
            <div className="space-y-2">
              <button onClick={onDownload} className="btn btn-ok w-full py-4 text-base">
                💾 Download MP4 {videoBlob && `(${(videoBlob.size/1024/1024).toFixed(1)} MB)`}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onRender} className="btn btn-ghost text-xs">🔄 Render Ulang</button>
                <button onClick={onBack} className="btn btn-ghost text-xs">✂️ Edit Lagi</button>
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white/60 space-y-1">
            <div className="flex justify-between"><span>Slide</span><b className="text-white/80">{slides.length}</b></div>
            <div className="flex justify-between"><span>Format</span><b className="text-white/80">MP4 H.264 + AAC stereo</b></div>
            <div className="flex justify-between"><span>Engine</span><b className="text-white/80">WebCodecs ⚡</b></div>
          </div>

          {meta && videoUrl && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-sm font-black flex items-center gap-2 text-white">📋 Metadata YouTube</div>
              <MetaRow label="🏷️ Judul High-CTR" value={meta.titleHighCTR} onCopy={()=>onCopy("t",meta.titleHighCTR)} copied={copiedField==="t"}/>
              <MetaRow label="📝 Deskripsi" value={meta.description} onCopy={()=>onCopy("d",meta.description)} copied={copiedField==="d"} multiline/>
              <MetaRow label="#️⃣ Tags" value={meta.tags.join(", ")} onCopy={()=>onCopy("tag",meta.tags.join(", "))} copied={copiedField==="tag"}/>
              <button onClick={onDownloadMeta} className="btn btn-primary w-full text-xs">📥 Download metadata (.txt)</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
