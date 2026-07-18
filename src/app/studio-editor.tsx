"use client";
import { useEffect, useRef, useState } from "react";
import {
  VIZ_STYLES, TRANSITION_STYLES, QUALITY_OPTIONS,
} from "@/lib/types";

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

// ============ STICKER PRESETS ============
const STICKER_PRESETS = [
  {id:"none",        icon:"❌", label:"None"},
  {id:"bars-bottom", icon:"📊", label:"Bars Bwh"},
  {id:"wave-bottom", icon:"📶", label:"Wave"},
  {id:"wave-center", icon:"〰️", label:"Wave Mid"},
  {id:"bars-top",    icon:"📈", label:"Bars Atas"},
  {id:"circle",      icon:"⭕", label:"Circle"},
  {id:"disc",        icon:"💿", label:"Disc"},
  {id:"diamond",     icon:"💎", label:"Diamond"},
  {id:"subscribe",   icon:"🔴", label:"SUBSCRIBE"},
  {id:"like",        icon:"👍", label:"Like"},
  {id:"bell",        icon:"🔔", label:"Lonceng"},
  {id:"fire",        icon:"🔥", label:"Fire"},
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
            {/* Subscribe sticker */}
            {spectrumSticker==="subscribe" && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-full text-[11px] font-black shadow-lg border-2 border-white">
                🔴 SUBSCRIBE
              </div>
            )}
            {spectrumSticker==="like" && (
              <div className="absolute bottom-20 right-4 flex flex-col items-center gap-0.5">
                <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl active:scale-95">👍</div>
                <div className="text-white text-[10px] font-bold drop-shadow-lg">1.2M</div>
              </div>
            )}
            {spectrumSticker==="bell" && (
              <div className="absolute top-14 right-4 w-11 h-11 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl">🔔</div>
            )}
            {spectrumSticker==="fire" && (
              <div className="absolute top-14 left-4 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-full text-[10px] font-black shadow-lg flex items-center gap-1">
                🔥 FYP
              </div>
            )}
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
          {tab==="text" && <TextTab {...{showTitle,setShowTitle,showLyrics,setShowLyrics,captionStyle,setCaptionStyle}}/>}
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

function TextTab({showTitle,setShowTitle,showLyrics,setShowLyrics,captionStyle,setCaptionStyle}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">💬 Teks</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>setShowTitle(!showTitle)} className={`q-tile ${showTitle?"active":""}`}>
          <div className="text-xs font-bold">🏷️ Judul</div>
          <div className="text-[10px] text-white/60">{showTitle?"ON":"OFF"}</div>
        </button>
        <button onClick={()=>setShowLyrics(!showLyrics)} className={`q-tile ${showLyrics?"active":""}`}>
          <div className="text-xs font-bold">🎤 Karaoke</div>
          <div className="text-[10px] text-white/60">{showLyrics?"ON":"OFF"}</div>
        </button>
      </div>
      <div className="text-[11px] text-white/60">Gaya caption:</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {[
          {id:"capcut",label:"🟡 CapCut"},{id:"neon",label:"💫 Neon"},
          {id:"boldwhite",label:"⚪ Bold Putih"},{id:"gradient",label:"🌈 Gradient"},
        ].map((s:any)=>(
          <button key={s.id} onClick={()=>setCaptionStyle(s.id)}
                  className={`q-tile !text-[10px] ${captionStyle===s.id?"active":""}`}>{s.label}</button>
        ))}
      </div>
    </div>
  );
}

function StickerTab({spectrumSticker,setSpectrumSticker}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">🎧 Stiker & Spectrum</div>
      <div className="grid grid-cols-4 gap-1.5">
        {STICKER_PRESETS.map((s:any)=>(
          <button key={s.id} onClick={()=>setSpectrumSticker(s.id)}
            className={`p-2 rounded-lg border text-center active:scale-95 ${spectrumSticker===s.id?"bg-pink-500/30 border-pink-400":"bg-white/5 border-white/10"}`}>
            <div className="text-xl">{s.icon}</div>
            <div className="text-[9px] text-white/70 mt-0.5 leading-tight">{s.label}</div>
          </button>
        ))}
      </div>
      <div className="text-[10px] text-white/50 p-2 rounded-lg bg-white/5">
        💡 Stiker muncul di preview saat kamu tap play. Spectrum bars pakai audio aktif.
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
