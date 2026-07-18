"use client";
import { useRef, useState } from "react";
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
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow"/>;
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

// ===== CapCut-style FULLSCREEN Studio Editor (Step 5) =====
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
  logoDataUrl: string; setLogoDataUrl:(v:string)=>void;
  logoPosition: any; setLogoPosition:(v:any)=>void;
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
  previewCurrent: number; setPreviewCurrent?:(v:number)=>void;
  previewDuration?: number; setPreviewDuration?:(v:number)=>void;
  previewMuted: boolean; setPreviewMuted:(v:boolean|((p:boolean)=>boolean))=>void;
  togglePreview: ()=>void;
  stopPreview?: ()=>void;
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

  const TABS = [
    {id:"edit",    icon:"✂️", label:"Edit"},
    {id:"audio",   icon:"🎵", label:"Audio"},
    {id:"text",    icon:"💬", label:"Teks"},
    {id:"sticker", icon:"🎧", label:"Stiker"},
    {id:"overlay", icon:"🖼️", label:"Overlay"},
    {id:"filter",  icon:"🎨", label:"Filter"},
    {id:"adjust",  icon:"☀️", label:"Sesuaikan"},
    {id:"effect",  icon:"✨", label:"Efek"},
    {id:"speed",   icon:"⚡", label:"Speed"},
  ] as const;

  const FILTERS = [
    {id:"none", label:"Original"},
    {id:"cinematic", label:"🎬 Cinematic"},
    {id:"vivid", label:"🌈 Vivid"},
    {id:"warm", label:"🔥 Warm"},
    {id:"cool", label:"❄️ Cool"},
    {id:"bw", label:"⚫ B/W"},
    {id:"vintage", label:"📼 Vintage"},
    {id:"dreamy", label:"💫 Dreamy"},
    {id:"cinema4k", label:"💎 4K"},
    {id:"8k", label:"🌟 8K"},
    {id:"clearll", label:"🔍 Jelas"},
    {id:"senja", label:"🌅 Senja"},
  ];

  const filterCssFor = (id:string) => {
    if (id==="none") return "none";
    if (id==="cinematic") return "contrast(1.18) saturate(0.85) brightness(0.95)";
    if (id==="vivid") return "saturate(1.4) contrast(1.12) brightness(1.05)";
    if (id==="warm") return "sepia(0.18) saturate(1.15) brightness(1.02)";
    if (id==="cool") return "hue-rotate(-10deg) saturate(1.1) brightness(1.02)";
    if (id==="bw") return "grayscale(1) contrast(1.1)";
    if (id==="vintage") return "sepia(0.35) contrast(0.95) brightness(0.95) saturate(0.85)";
    if (id==="dreamy") return "brightness(1.1) contrast(0.92) saturate(1.15) blur(0.3px)";
    if (id==="cinema4k") return "contrast(1.22) saturate(0.95) brightness(0.92)";
    if (id==="8k") return "contrast(1.25) saturate(1.08) brightness(0.98)";
    if (id==="clearll") return "contrast(1.08) saturate(1.12) brightness(1.02)";
    if (id==="senja") return "sepia(0.25) saturate(1.2) brightness(1.0) hue-rotate(-10deg)";
    return "none";
  };

  const ratioStyle: React.CSSProperties = aspectRatio==="9:16" ? {aspectRatio:"9/16"}
    : aspectRatio==="1:1" ? {aspectRatio:"1/1"} : {aspectRatio:"16/9"};

  const transDur = Math.min(slideDuration*0.6, isMobile?0.5:0.8);
  const totalDur = slides.length*(slideDuration/videoSpeed) + (transitionDur/videoSpeed);
  const curSlideDur = slideDuration/videoSpeed;

  return (
    <section className="mt-0">
      <div className="flex flex-col bg-black rounded-2xl overflow-hidden border border-white/10 -mx-1 sm:mx-0">
        {/* TOP BAR */}
        <div className="flex items-center gap-2 p-2 bg-gradient-to-b from-white/5 to-transparent border-b border-white/10">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg">←</button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-sm font-black truncate">🎬 Studio Edit</div>
            <div className="text-[10px] text-white/50 truncate">{selectedTitle?.text || niche || "Video"} · {slides.length} slide</div>
          </div>
          <button onClick={onSaveDraft} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-sm">💾</button>
          <button onClick={onExport} className="px-4 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-bold shadow-lg shadow-pink-500/30 active:scale-95">
            Ekspor →
          </button>
        </div>

        {/* PREVIEW AREA */}
        <div className="relative flex items-center justify-center bg-black/80 p-3 sm:p-4 min-h-[38vh]">
          <div className="relative w-full max-w-[88vw] sm:max-w-[420px] mx-auto rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl"
               style={ratioStyle}>
            {previewPlaying ? (
              <canvas ref={previewCanvasRef}
                width={aspectRatio==="9:16"?480:aspectRatio==="1:1"?480:854}
                height={aspectRatio==="9:16"?854:aspectRatio==="1:1"?480:480}
                className="w-full h-full block" />
            ) : slides[activeSlide] ? (
              <img src={slides[activeSlide].imageUrl}
                   style={{filter: getFilterString()}}
                   className="w-full h-full object-cover block" alt="preview"/>
            ) : <div className="w-full h-full bg-neutral-900"/>}

            {/* Vignette overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background:`radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${(vignetteAmt/100)*0.8}) 100%)`
            }}/>

            {!previewPlaying && slides.length>0 && (
              <button onClick={()=>togglePreview && (togglePreview as any)()}
                className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/50 backdrop-blur-md border-2 border-white/40 flex items-center justify-center text-3xl text-white shadow-2xl active:scale-95">
                  ▶️
                </div>
              </button>
            )}

            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[10px] font-mono border border-white/10">
              {formatDur(previewCurrent)} / {formatDur(totalDur)}
            </div>
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[10px] font-bold border border-white/10">
              🖼️ {activeSlide+1}/{slides.length}
            </div>
            {activeFilter!=="none" && (
              <div className="absolute bottom-12 left-2 bg-pink-500/80 backdrop-blur px-2 py-0.5 rounded-full text-white text-[9px] font-bold">
                🎨 {FILTERS.find(f=>f.id===activeFilter)?.label}
              </div>
            )}
          </div>
        </div>

        {/* TIMELINE THUMBNAIL STRIP */}
        <div className="px-2 py-2 bg-gradient-to-b from-black/40 to-black/60 border-y border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {slides.map((s:any, i:number)=>(
              <button key={s.id} onClick={()=>setActiveSlide(i)}
                className={`relative shrink-0 snap-start rounded-md overflow-hidden border-2 transition ${activeSlide===i?"border-pink-400 scale-105 shadow-lg shadow-pink-500/30":"border-white/10 opacity-70"}`}
                style={aspectRatio==="9:16"?{width:42,height:72}:aspectRatio==="1:1"?{width:54,height:54}:{width:68,height:40}}>
                <img src={s.imageUrl} className="w-full h-full object-cover"
                     style={{filter: filterCssFor(activeFilter)}} alt=""/>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] text-center py-0.5 font-bold">{i+1}</div>
              </button>
            ))}
          </div>
          <div className="mt-1 px-1">
            <input type="range" min={0} max={totalDur} step={0.05}
                   value={previewCurrent}
                   onChange={e=>{
                     const t = Number(e.target.value);
                     setActiveSlide(Math.min(slides.length-1, Math.floor(t/(curSlideDur+transitionDur))));
                     seekPreview(t);
                   }}
                   className="w-full accent-pink-500 h-1"/>
          </div>
        </div>

        {/* PLAYBACK CONTROLS */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-black/40">
          <button onClick={()=>seekPreview(Math.max(0,previewCurrent-5))} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg">⏮</button>
          <button onClick={togglePreview}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-pink-500/40 active:scale-95">
            {previewPlaying?"⏸":"▶️"}
          </button>
          <button onClick={()=>seekPreview(Math.min(totalDur, previewCurrent+5))} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg">⏭</button>
          <button onClick={()=>setPreviewMuted(!previewMuted)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-lg">
            {previewMuted?"🔇":"🔊"}
          </button>
          <div className="text-[11px] text-white/70 font-mono ml-auto">{formatDur(previewCurrent)} / {formatDur(totalDur)}</div>
        </div>

        {/* TOOLBAR 9 TABS */}
        <div className="flex items-stretch gap-0.5 p-1.5 bg-black/60 border-t border-white/10 overflow-x-auto">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg shrink-0 min-w-[58px] text-[10px] font-semibold transition ${
                tab===t.id?"bg-gradient-to-b from-pink-500/40 to-pink-500/20 border border-pink-400/50 text-white":"text-white/70 hover:bg-white/5 border border-transparent"
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </div>

        {/* PANEL */}
        <div className="bg-gradient-to-b from-[#15091f] to-black border-t border-white/10 p-3 max-h-[38vh] overflow-y-auto">
          {tab==="edit" && <EditTab {...{slideDuration,setSlideDuration,transitionDur,setTransitionDur,transition,setTransition,onBack,onExport}}/>}
          {tab==="audio" && <AudioTab {...{audioMode,setAudioMode,aiMusicUrl,ttsUrl,musicUrl,proxifyAudioUrl,previewAudioRef}}/>}
          {tab==="text" && <TextTab {...{showTitle,setShowTitle,showLyrics,setShowLyrics,captionStyle,setCaptionStyle}}/>}
          {tab==="sticker" && <StickerTab {...{spectrumSticker,setSpectrumSticker}}/>}
          {tab==="overlay" && <OverlayTab {...{logoDataUrl,logoPosition,setLogoPosition,onLogoUpload,vizColor,setVizColor,vizStyle,setVizStyle}}/>}
          {tab==="filter" && <FilterTab {...{slides,activeSlide,activeFilter,setActiveFilter,FILTERS,filterCssFor}}/>}
          {tab==="adjust" && <AdjustTab {...{brightness,setBrightness,contrast,setContrast,saturation,setSaturation,sharpen,setSharpen,vignetteAmt,setVignetteAmt,resetAdjust}}/>}
          {tab==="effect" && <EffectTab {...{transition,setTransition,showTitle,setShowTitle,showLyrics,setShowLyrics}}/>}
          {tab==="speed" && <SpeedTab {...{videoSpeed,setVideoSpeed,curSlideDur}}/>}
        </div>

        <audio ref={previewAudioRef} preload="metadata" className="hidden"/>
      </div>
    </section>
  );
}

function EditTab({slideDuration,setSlideDuration,transitionDur,setTransitionDur,transition,setTransition,onBack,onExport}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">✂️ Edit Klip</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="flex justify-between text-[11px] mb-1"><span>⏱ Durasi klip</span><b>{slideDuration.toFixed(1)}s</b></div>
          <input type="range" min={1.5} max={8} step={0.5} value={slideDuration}
                 onChange={e=>setSlideDuration(Number(e.target.value))} className="w-full accent-pink-500"/>
        </label>
        <label className="block">
          <div className="flex justify-between text-[11px] mb-1"><span>🔀 Transisi</span><b>{transitionDur.toFixed(2)}s</b></div>
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

function AudioTab({audioMode,setAudioMode,aiMusicUrl,ttsUrl,musicUrl,proxifyAudioUrl,previewAudioRef}:any){
  const src = (audioMode==="aimusic"&&aiMusicUrl)?aiMusicUrl:
              (audioMode==="tts"&&ttsUrl)?ttsUrl:
              (audioMode==="music"&&musicUrl)?musicUrl:
              (aiMusicUrl||musicUrl||ttsUrl);
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">🎵 Audio</div>
      <div className="grid grid-cols-5 gap-1.5">
        {[{id:"tts",l:"🗣️ TTS"},{id:"music",l:"🎵 Musik"},{id:"aimusic",l:"🤖 AI"},{id:"both",l:"🔀 Campur"},{id:"none",l:"🔇 Mute"}].map((m:any)=>(
          <button key={m.id} onClick={()=>setAudioMode(m.id)}
            className={`py-2 rounded-lg text-[10px] font-bold border ${audioMode===m.id?"bg-pink-500/30 border-pink-400":"bg-white/5 border-white/10"}`}>{m.l}</button>
        ))}
      </div>
      <div className="text-[11px] text-white/60">
        💡 Tap <b>← Kembali</b> di top bar buat ganti sumber audio / generate ulang lagu AI.
      </div>
      {src && (
        <audio controls src={proxifyAudioUrl(src)} className="w-full"/>
      )}
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
      <div className="text-xs font-bold text-white/80">🎧 Stiker Spectrum</div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          {id:"none",icon:"❌",label:"None"},
          {id:"bars-bottom",icon:"📊",label:"Bars Bawah"},
          {id:"wave-bottom",icon:"📶",label:"Wave"},
          {id:"wave-center",icon:"〰️",label:"Wave Mid"},
          {id:"bars-top",icon:"📈",label:"Bars Atas"},
          {id:"circle",icon:"⭕",label:"Circle"},
          {id:"disc",icon:"💿",label:"Disc"},
          {id:"diamond",icon:"💎",label:"Diamond"},
        ].map((s:any)=>(
          <button key={s.id} onClick={()=>setSpectrumSticker(s.id)}
            className={`p-2 rounded-lg border text-center ${spectrumSticker===s.id?"bg-pink-500/30 border-pink-400":"bg-white/5 border-white/10"}`}>
            <div className="text-xl">{s.icon}</div>
            <div className="text-[9px] text-white/70 mt-0.5">{s.label}</div>
          </button>
        ))}
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
              style={{width:28,height:28,background:`radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), ${c.hex} 60%)`}}/>
          ))}
          <input type="color" value={vizColor} onChange={e=>setVizColor(e.target.value)}
            className="w-9 h-9 rounded-full bg-transparent border-0 p-0 cursor-pointer"/>
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

function FilterTab({slides,activeSlide,activeFilter,setActiveFilter,FILTERS,filterCssFor}:any){
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-white/80">🎨 Filter Video</div>
        <button onClick={()=>setActiveFilter("none")} className="text-[10px] px-2 py-1 rounded bg-white/10">↻ Reset</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {FILTERS.map((f:any)=>(
          <button key={f.id} onClick={()=>setActiveFilter(f.id)}
            className={`shrink-0 flex flex-col items-center gap-1 ${activeFilter===f.id?"opacity-100":"opacity-75"}`}>
            <div className="w-16 h-16 rounded-lg overflow-hidden border-2"
                 style={{borderColor:activeFilter===f.id?"#ec4899":"rgba(255,255,255,0.15)"}}>
              {slides[0] && (
                <img src={slides[Math.min(activeSlide,slides.length-1)].imageUrl} className="w-full h-full object-cover"
                     style={{filter:filterCssFor(f.id)}} alt=""/>
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
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-white/80">☀️ Sesuaikan</div>
        <button onClick={resetAdjust} className="text-[10px] px-2 py-1 rounded bg-white/10">↻ Reset</button>
      </div>
      {[
        {label:"☀️ Kecerahan",v:brightness,set:setBrightness,min:-50,max:50},
        {label:"◐ Kontras",v:contrast,set:setContrast,min:-50,max:50},
        {label:"🎨 Saturasi",v:saturation,set:setSaturation,min:-50,max:80},
        {label:"✨ Pertajam",v:sharpen,set:setSharpen,min:0,max:50},
        {label:"🌑 Vignette",v:vignetteAmt,set:setVignetteAmt,min:0,max:100},
      ].map((s:any,i)=>(
        <label key={i} className="block">
          <div className="flex justify-between text-[11px] mb-1">
            <span>{s.label}</span><span className="text-white/50 font-mono">{s.v>0?"+":""}{s.v}</span>
          </div>
          <input type="range" min={s.min} max={s.max} step={1} value={s.v}
                 onChange={(e:any)=>s.set(Number(e.target.value))} className="w-full accent-pink-500"/>
        </label>
      ))}
    </div>
  );
}

function EffectTab({transition,setTransition,showTitle,setShowTitle,showLyrics,setShowLyrics}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">✨ Efek / Transisi</div>
      <div>
        <div className="text-[11px] mb-1 text-white/70">Transisi antar slide</div>
        <div className="grid grid-cols-3 gap-1.5">
          {TRANSITION_STYLES.map((t:any)=>(
            <button key={t.id} onClick={()=>setTransition(t.id)}
              className={`q-tile !text-[10px] ${transition===t.id?"active":""}`}>{t.emoji} {t.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10">
        <div>
          <div className="text-xs font-semibold">🏷️ Judul di video</div>
          <div className="text-[10px] text-white/50">Overlay judul dengan glow</div>
        </div>
        <div className={`toggle ${showTitle?"on":""}`} onClick={()=>setShowTitle(!showTitle)}/>
      </div>
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10">
        <div>
          <div className="text-xs font-semibold">🎤 Karaoke lirik</div>
          <div className="text-[10px] text-white/50">Highlight kata per kata</div>
        </div>
        <div className={`toggle ${showLyrics?"on":""}`} onClick={()=>setShowLyrics(!showLyrics)}/>
      </div>
    </div>
  );
}

function SpeedTab({videoSpeed,setVideoSpeed,curSlideDur}:any){
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-white/80">⚡ Kecepatan Video</div>
      <label className="block">
        <div className="flex justify-between text-[11px] mb-1"><span>Speed</span><b>{videoSpeed.toFixed(2)}x</b></div>
        <input type="range" min={0.5} max={2} step={0.25} value={videoSpeed}
               onChange={(e:any)=>setVideoSpeed(Number(e.target.value))} className="w-full accent-pink-500"/>
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {[0.5,0.75,1,1.25,1.5,1.75,2].map((s:number)=>(
          <button key={s} onClick={()=>setVideoSpeed(s)}
            className={`q-tile !text-[10px] ${Math.abs(videoSpeed-s)<0.01?"active":""}`}>{s}x</button>
        ))}
      </div>
      <div className="text-[10px] text-white/50">Durasi efektif per slide: <b>{curSlideDur.toFixed(2)}s</b></div>
    </div>
  );
}

// ===== Export / Render Panel (Step 6) =====
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
      <div className="bg-black rounded-2xl overflow-hidden border border-white/10 -mx-1 sm:mx-0">
        <div className="flex items-center gap-2 p-2 bg-gradient-to-b from-white/5 to-transparent border-b border-white/10">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg">←</button>
          <div className="flex-1 text-center">
            <div className="text-sm font-black">📤 Ekspor Video</div>
            <div className="text-[10px] text-white/50 truncate">{selectedTitle?.text || niche}</div>
          </div>
          <div className="w-10"/>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex justify-center">
            <div className="relative w-full max-w-[320px] rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl"
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
                  <div className="w-full max-w-[200px] progress-track">
                    <div className="progress-fill" style={{width:`${Math.round(progress*100)}%`}}/>
                  </div>
                  <div className="text-white/70 text-[11px] font-mono">{Math.round(progress*100)}% {renderETA && `· ETA ${renderETA}`}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold mb-2">⚡ Pilih Kualitas</div>
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
            <div className="text-[10px] text-white/50 mt-1">
              💡 HP: <b>Cepat (480p)</b> — render 3-5× realtime. YouTube: <b>Seimbang (720p)</b> atau <b>Tinggi (1080p)</b>.
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
              <div className="text-sm font-black flex items-center gap-2">📋 Metadata YouTube</div>
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
