"use client";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { renderSlideshow, downloadBlob, drawLiveSpectrum } from "@/lib/recorder";
import type { Quality as RenderQuality } from "@/lib/recorder";
import { cropImageToRatio, copyToClipboard } from "@/lib/imgutils";
import { VIZ_STYLES, QUALITY_OPTIONS, ASPECT_RATIOS } from "@/lib/types";
import type { VizStyle, AudioMode, ImageSource } from "@/lib/types";
import type { VideoMeta } from "@/lib/hcnsec";
import { ExportPanel } from "./studio-editor";
import {
  TRANSITIONS, ANIM_IN, ANIM_OUT, EFFECTS, FILTERS, TEXT_FONTS, TEXT_ANIMS,
  TEXT_TEMPLATES, TEXT_COLORS, STICKER_CATS, ADJUST_DEFS,
  DEFAULT_ADJUST, DEFAULT_TEXT, buildClipFilter, canonicalTrans, effDur,
  buildTimeline, locate, paintClips, hexToRgbE,
} from "@/lib/editing";
import type { SlideOpt, ClipText, AdjustState, Timeline } from "@/lib/editing";

/* =====================================================================
   VERVE-CUT v5 — editor ala CapCut (mobile-first, anti-kepotong)
   - Timeline pro: tarik ujung klip (durasi), chip transisi antar-klip,
     drag susun ulang, toolbar kontekstual
   - Fitur: 20+ transisi · animasi masuk/keluar · efek overlay · filter
     · adjust · teks kaya (font/warna/stroke/bg/animasi/template) · stiker
     emoji drag-on-canvas · speed per-klip · undo/redo
   - Semua fitur lama utuh: wizard ✨AI → Judul → Media → Audio/Suno →
     Ekspor + metadata + draft. 100% implementasi orisinal.
   ===================================================================== */

type ToolId = "ai"|"media"|"audio"|"lirik"|"teks"|"stiker"|"efek"|"filter"|"adjust"|"animasi"|"speed"|"transisi"|"format"|"ekspor";
const GLOBAL_TOOLS: { id: ToolId; icon: string; label: string }[] = [
  { id:"ai",      icon:"✨", label:"AI" },
  { id:"media",   icon:"🖼️", label:"Media" },
  { id:"audio",   icon:"🎧", label:"Audio" },
  { id:"lirik",   icon:"🎤", label:"Lirik" },
  { id:"teks",    icon:"🔤", label:"Teks" },
  { id:"stiker",  icon:"😀", label:"Stiker" },
  { id:"efek",    icon:"🎭", label:"Efek" },
  { id:"filter",  icon:"🎨", label:"Filter" },
  { id:"adjust",  icon:"🎛️", label:"Adjust" },
  { id:"format",  icon:"🖼️", label:"Format" },
  { id:"ekspor",  icon:"🚀", label:"Ekspor" },
];
const CLIP_TOOLS = [
  { id:"back",    icon:"⬅️", label:"Tutup" },
  { id:"split",   icon:"✂️", label:"Potong" },
  { id:"teks",    icon:"🔤", label:"Teks" },
  { id:"stiker",  icon:"😀", label:"Stiker" },
  { id:"animasi", icon:"🎬", label:"Animasi" },
  { id:"efek",    icon:"🎭", label:"Efek" },
  { id:"speed",   icon:"⚡", label:"Speed" },
  { id:"transisi",icon:"🔀", label:"Transisi" },
  { id:"dup",     icon:"📑", label:"Duplikat" },
  { id:"del",     icon:"🗑️", label:"Hapus" },
] as const;

interface KeywordItem { id: string; text: string; }
interface TitleItem { id: string; keyword: string; text: string; }
interface Slide { id: string; imageUrl: string; lyric?: string; }

const IMAGE_STYLE_PRESETS = [
  { id: "cinematic",  label: "🎬 Cinematic",  desc: "ARRI film" },
  { id: "studio",     label: "📸 Studio",     desc: "Paling stabil" },
  { id: "epic",       label: "⚔️ Fantasy",    desc: "UE5 art" },
  { id: "anime",      label: "🌸 Anime",      desc: "Shinkai" },
  { id: "cyberpunk",  label: "🌃 Cyber",      desc: "Neon" },
  { id: "3d",         label: "🧊 3D Pixar",   desc: "Cartoon" },
  { id: "oil",        label: "🎨 Oil",        desc: "Lukisan" },
  { id: "minimalist", label: "◻️ Minimal",    desc: "Pastel" },
];
const VOICES = ["alloy","echo","fable","onyx","nova","shimmer"];
const MUSIC_MODELS = [
  { id: "suno-v5.5", label: "Suno V5.5",  credit: "12 kredit", badge:"💎 Terbaik" },
  { id: "suno-v5",   label: "Suno V5",    credit: "12 kredit" },
  { id: "suno-v4.5", label: "Suno V4.5",  credit: "12 kredit" },
  { id: "suno-v4",   label: "Suno V4",    credit: "12 kredit", badge:"⚖️ Seimbang" },
  { id: "suno-v3.5", label: "Suno V3.5",  credit: "12 kredit", badge:"⚡ Tercepat" },
];
const MUSIC_PRESET_CHIPS = [
  { g:"slow rock", t:"slow", e:"90s", i:"gitar listrik melow", m:"melancholic, menyentuh" },
  { g:"pop ballad", t:"slow", e:"", i:"piano akustik", m:"emotional, sad" },
  { g:"dangdut koplo", t:"mid", e:"2000s", i:"gendang, keyboard", m:"sendu" },
  { g:"akustik", t:"slow", e:"", i:"gitar akustik petikan", m:"warm, intimate" },
  { g:"religi", t:"slow", e:"modern", i:"seruling, piano", m:"khusyuk, tenang" },
];
const NICHE_PRESETS = [
  {id:"sedih",niche:"cerita menyentuh ibu & keluarga",kw:"ibu maafkan aku, penyesalan anak, rindu ibu, maafkan aku ibu, kasih ibu",ti:"Sedih Ibu",genre:"pop ballad",mood:"menyentuh, sedih, haru"},
  {id:"motivasi",niche:"motivasi & semangat hidup",kw:"bangkit dari gagal, jangan menyerah, motivasi kerja, semangat pagi, mulai lagi",ti:"Motivasi",genre:"cinematic epic",mood:"epic, membara, semangat"},
  {id:"cinta",niche:"cerita cinta & romantis",kw:"rindu dia, cinta pertama, kenangan pacar, setia menunggu, ldr",ti:"Romantis",genre:"pop akustik",mood:"romantis, lembut, manis"},
  {id:"islamic",niche:"konten islami & dakwah",kw:"ustadz ceramah, hijrah, doa ibu, surga di telapak kaki ibu, jodoh",ti:"Islami",genre:"religi akustik",mood:"tenang, khusyuk, syahdu"},
  {id:"horror",niche:"cerita horor & misteri",kw:"hantu kampung, kisah seram malam jumat, penampakan nyata, cerita mistis",ti:"Horor",genre:"dark ambient",mood:"mencekam, tegang"},
  {id:"fyp",niche:"fyp Shorts/TikTok viral",kw:"fakta unik, wow fakta, kamu tidak tahu, trik rahasia, life hack",ti:"FYP Viral",genre:"trap edm",mood:"energetic, asik"},
];
const STICKER_CHIPS = [
  ["bars-bottom","📊","Bars Bawah"],["none","🚫","Polos"],["subscribe","🔴","Subscribe"],
  ["like","👍","Like"],["bell","🔔","Lonceng"],["fire","🔥","Fire"],["disc","💿","Disc"],
  ["wave-center","〰️","Wave Tengah"],["wave-bottom","🌊","Wave Bawah"],["circle","⭕","Circle"],
  ["bars-top","📈","Bars Atas"],["glow-ring","💫","Glow Ring"],["nowplaying","🎧","Now Playing"],
] as const;

const STORAGE_KEY = "verve_project_v1";
const SUNO_TASK_KEY = "verve_suno_task_v1";
const DRAFTS_KEY = "verve_drafts_v1";
const MAX_DRAFTS = 12;

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const chk = () => setM(window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    chk();
    window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);
  return m;
}

// ===== API Key Modal (multi-provider Suno) =====
type Provider = "kie" | "apiframe" | "sunor";
const PROVIDERS: { id:Provider; name:string; url:string; note:string; free:string; prefix?:string }[] = [
  { id:"kie",      name:"🥇 Kie.ai",       url:"https://kie.ai?ref=verve",
    note:"Bisa diakses dari Indonesia (Cloudflare longgar), 5.000 kredit GRATIS daftar, support Suno V3.5–V5.5 🔥 (DIREKOMENDASIKAN)",
    free:"5.000 kredit (~±40 lagu) tanpa kartu", prefix:"kie- / hex murni" },
  { id:"apiframe", name:"apiframe.ai",     url:"https://apiframe.ai/?ref=verve",
    note:"300 kredit/bulan GRATIS — tapi sering diblok Cloudflare dari IP Indo. Kalau diblok pindah ke Kie.ai.",
    free:"300 kredit/bulan (~27 lagu)", prefix:"afk_" },
  { id:"sunor",    name:"Sunor.cc",        url:"https://sunor.cc/?ref=verve",
    note:"Alternatif cadangan, 25 kredit satu kali saat daftar.",
    free:"25 kredit (~2 lagu) saat daftar", prefix:"snr_" },
];
function detectProvider(key: string): Provider {
  const k = key.trim().toLowerCase();
  if (!k) return "kie";
  if (k.startsWith("kie") || k.startsWith("sk-kie")) return "kie";
  if (k.startsWith("snr") || k.startsWith("sunor")) return "sunor";
  if (k.startsWith("afk") || k.startsWith("af_")) return "apiframe";
  if (/^[a-f0-9]{24,}$/i.test(k)) return "kie";
  return "apiframe";
}
function creditUrl(p: Provider) {
  if (p === "kie") return "https://api.kie.ai/api/v1/credits";
  if (p === "sunor") return "https://api.sunor.cc/v1/credits";
  return "https://apiframe.ai/api/credit";
}

const ApiKeyModal = memo(function ApiKeyModal({ open, onClose, onSave, currentKey, currentProvider }:{
  open: boolean; onClose: ()=>void; onSave: (k:string, p:Provider)=>void;
  currentKey: string; currentProvider: Provider;
}) {
  const [text, setText] = useState(currentKey);
  const [provider, setProvider] = useState<Provider>(currentProvider || detectProvider(currentKey));
  const [checking, setChecking] = useState(false);
  const [credits, setCredits] = useState<string>("");
  useEffect(()=>{
    if (open) { setText(currentKey); setProvider(currentProvider || detectProvider(currentKey)); setCredits(""); }
  }, [open, currentKey, currentProvider]);
  async function cekKredit() {
    if (!text.trim()) return;
    setChecking(true); setCredits("");
    const key = text.trim(); const prov = detectProvider(key);
    try {
      const r = await fetch(creditUrl(prov), {
        headers: { "Authorization": `Bearer ${key}`, "apikey": key, "x-api-key": key },
      }).catch(()=>null);
      if (r && r.ok) {
        const d = await r.json().catch(()=>({}));
        setCredits(`✅ Kredit tersedia: ${d.credit ?? d.credits ?? d.balance ?? d.points ?? d.remaining ?? JSON.stringify(d).slice(0,80)}`);
      } else {
        setCredits(`ℹ️ Cek kredit otomatis gak tersedia untuk provider ${prov} — langsung klik CREATE aja, kalau berhasil berarti key valid.`);
      }
    } catch(e:any){ setCredits(`Error: ${e.message}`); }
    setChecking(false);
  }
  if (!open) return null;
  const curProv = PROVIDERS.find(p=>p.id===provider) || PROVIDERS[0];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box modal-enter" onClick={e=>e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔑</span>
            <div>
              <h3 className="text-lg font-black">Setelan API Key Music</h3>
              <p className="text-[11px] text-white/60">Untuk AI Music (Suno-style) — key cuma tersimpan di HP kamu</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg flex-shrink-0">×</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PROVIDERS.map(p=>(
            <button key={p.id} type="button" onClick={()=>setProvider(p.id)}
              className={`p-2 rounded-lg text-[11px] font-bold text-center border transition ${
                provider===p.id ? "bg-gradient-to-br from-purple-600/40 to-pink-600/40 border-pink-400/60 text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="p-2.5 rounded-lg bg-black/30 border border-white/10 text-[11px] text-white/80 mb-3 space-y-1.5">
          <div>👉 <a href={curProv.url} target="_blank" rel="noreferrer" className="text-cyan-300 underline font-bold break-all">{curProv.url.replace("https://","")}</a></div>
          <div className="text-white/70">{curProv.note}</div>
          <div className="text-green-300">🎁 {curProv.free}</div>
          {curProv.prefix && <div className="text-yellow-300">🔑 Awalan key: <code className="bg-black/40 px-1 rounded">{curProv.prefix}</code></div>}
        </div>
        <label className="block mb-2">
          <span className="lbl">API Key ({curProv.name})</span>
          <input className="input" value={text} onChange={e=>{ setText(e.target.value); setProvider(detectProvider(e.target.value)); }}
                 placeholder="tempel key di sini..." autoFocus />
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          <button className="btn btn-primary flex-1 sm:flex-none" onClick={()=>{ onSave(text.trim(), detectProvider(text.trim())); onClose(); }} disabled={!text.trim()}>✚ Tambah / Simpan</button>
          <button className="btn btn-ghost" onClick={cekKredit} disabled={checking || !text.trim()}>{checking?<Spinner/>:"🔄"} Cek Kredit</button>
          {currentKey && (<button className="btn btn-danger" onClick={()=>{ onSave("", "kie"); setText(""); setCredits(""); }}>🗑️ Hapus</button>)}
        </div>
        {credits && <div className="text-[11px] text-cyan-200 bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-2 break-word">{credits}</div>}
        <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/40">
          💡 Key disimpan di localStorage browser kamu saja.
        </div>
      </div>
    </div>
  );
});

// =========================================================================
//                                HOME
// =========================================================================
export default function Home() {
  const isMobile = useIsMobile();
  const [tool, setTool] = useState<ToolId|null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [stageText, setStageText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [quality, setQuality] = useState<RenderQuality>("balanced");

  // Ide & Keyword
  const [niche, setNiche] = useState("");
  const [nKeywords, setNKeywords] = useState(5);
  const [keywordMode, setKeywordMode] = useState<"ai"|"manual">("ai");
  const [manualKeywords, setManualKeywords] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [titlesPerKw, setTitlesPerKw] = useState(1);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");

  // Media
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [imageStyle, setImageStyle] = useState("studio");
  const [aspectRatio, setAspectRatio] = useState<"16:9"|"9:16"|"1:1">("16:9");
  const [nSlides, setNSlides] = useState(4);
  const [slides, setSlides] = useState<Slide[]>([]);

  // Per-klip editing (v5)
  const [slideOptsById, setSlideOptsById] = useState<Record<string, SlideOpt>>({});
  const [selId, setSelId] = useState<string>("");

  // Audio
  const [audioMode, setAudioMode] = useState<AudioMode>("tts");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsText, setTtsText] = useState("");
  const [ttsUrl, setTtsUrl] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");
  const [lyricLines, setLyricLines] = useState<string[]>([]);

  // Gaya
  const [vizStyle, setVizStyle] = useState<VizStyle>("luxury");
  const [vizColor, setVizColor] = useState("#ec4899");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transitionDur, setTransitionDur] = useState(0.8);
  const [transition, setTransition] = useState<string>("dissolve");
  const [showTitle, setShowTitle] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<string>("capcut");
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [logoPosition, setLogoPosition] = useState<"center"|"corner"|"none">("center");
  const [storyboard, setStoryboard] = useState<any|null>(null);
  const [lyrics, setLyrics] = useState<any|null>(null);
  const [aiMusicUrl, setAiMusicUrl] = useState<string>("");
  const [aiMusicStatus, setAiMusicStatus] = useState<string>("");
  const [aiMusicTaskId, setAiMusicTaskId] = useState<string>("");
  const [aiMusicPolling, setAiMusicPolling] = useState<boolean>(false);
  const [aiMusicStart, setAiMusicStart] = useState<number>(0);

  // Suno panel
  const [musicTitle, setMusicTitle] = useState<string>("");
  const [musicLyrics, setMusicLyrics] = useState<string>("");
  const [musicStylePrompt, setMusicStylePrompt] = useState<string>("");
  const [musicModel, setMusicModel] = useState<string>("suno-v5.5");
  const [musicVocalType, setMusicVocalType] = useState<"vocal"|"instrumental">("vocal");
  const [musicVocalGender, setMusicVocalGender] = useState<"auto"|"male"|"female">("auto");
  const [musicGenre, setMusicGenre] = useState<string>("pop ballad");
  const [musicMood, setMusicMood] = useState<string>("melancholic, emotional");
  const [musicEra, setMusicEra] = useState<string>("");
  const [musicInstruments, setMusicInstruments] = useState<string>("");
  const [musicTempo, setMusicTempo] = useState<string>("slow");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [sunoApiKey, setSunoApiKey] = useState<string>("");
  const [sunoProvider, setSunoProvider] = useState<Provider>("kie");
  const [sunoCredits, setSunoCredits] = useState<string>("");
  const [musicGeneratedFrom, setMusicGeneratedFrom] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  // Render
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [renderETA, setRenderETA] = useState<string>("");

  // T2V
  const [t2vPrompt, setT2vPrompt] = useState("");
  const [t2vImageUrl, setT2vImageUrl] = useState("");
  const [t2vDuration, setT2vDuration] = useState(5);
  const [t2vResult, setT2vResult] = useState<{video_url:string; status:string; error?:string}|null>(null);

  // Metadata
  const [meta, setMeta] = useState<VideoMeta|null>(null);
  const [copiedField, setCopiedField] = useState<string>("");

  // Filter & Adjust (v5 konsolidasi)
  const [filterPreset, setFilterPreset] = useState<string>("none");
  const [adj, setAdj] = useState<AdjustState>({...DEFAULT_ADJUST});
  const [spectrumSticker, setSpectrumSticker] = useState<string>("bars-bottom");

  // Preview
  const previewAudioRef = useRef<HTMLAudioElement|null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const previewRafRef = useRef<number|null>(null);
  const previewActxRef = useRef<AudioContext|null>(null);
  const previewAnalyserRef = useRef<AnalyserNode|null>(null);
  const previewAnalyserConnected = useRef<boolean>(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(false);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const renderStartRef = useRef<number>(0);
  const [draftList, setDraftList] = useState<Array<{id:string;title:string;slides:number;updatedAt:number;thumb?:string;step?:number}>>([]);
  const [showDraftPicker, setShowDraftPicker] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>("");
  const selectedTitle = useMemo(() => titles.find(t=>t.id===selectedTitleId), [titles, selectedTitleId]);

  // ===== UNDO / REDO =====
  const histRef = useRef<{stk:string[]; i:number}>({stk:[], i:-1});
  const [histVer, setHistVer] = useState(0);
  const histLastRef = useRef<{t:number; key:string}>({t:0, key:""});
  const pushHistory = useCallback((key = "") => {
    const now = Date.now();
    if (key && histLastRef.current.key === key && now - histLastRef.current.t < 700) return;
    histLastRef.current = {t: now, key};
    try {
      const snap = JSON.stringify({s: slides.map(x=>({id:x.id, imageUrl:x.imageUrl, lyric:x.lyric})), o: slideOptsById, ll: lyricLines});
      if (histRef.current.stk[histRef.current.i] === snap) return;
      histRef.current.stk = histRef.current.stk.slice(0, histRef.current.i + 1);
      histRef.current.stk.push(snap);
      if (histRef.current.stk.length > 40) histRef.current.stk.shift();
      histRef.current.i = histRef.current.stk.length - 1;
      setHistVer(v=>v+1);
    } catch {}
  }, [slides, slideOptsById, lyricLines]);
  const applyHistSnap = useCallback((snap: string) => {
    try {
      const d = JSON.parse(snap);
      if (Array.isArray(d.s)) setSlides(d.s);
      if (d.o && typeof d.o === "object") setSlideOptsById(d.o);
      if (Array.isArray(d.ll)) setLyricLines(d.ll);
      setSelId("");
    } catch {}
  }, []);
  const undo = useCallback(() => {
    const h = histRef.current;
    if (h.i > 0) { h.i--; applyHistSnap(h.stk[h.i]); setHistVer(v=>v+1); }
  }, [applyHistSnap]);
  const redo = useCallback(() => {
    const h = histRef.current;
    if (h.i < h.stk.length - 1) { h.i++; applyHistSnap(h.stk[h.i]); setHistVer(v=>v+1); }
  }, [applyHistSnap]);
  const canUndo = histVer >= 0 && histRef.current.i > 0;
  const canRedo = histRef.current.i >= 0 && histRef.current.i < histRef.current.stk.length - 1;

  // ===== refs mirror (buat rAF loop & handler tanpa re-render) =====
  const slidesRef = useRef(slides);             useEffect(()=>{ slidesRef.current = slides; }, [slides]);
  const slideOptsRef = useRef(slideOptsById);   useEffect(()=>{ slideOptsRef.current = slideOptsById; }, [slideOptsById]);
  const selIdRef = useRef(selId);               useEffect(()=>{ selIdRef.current = selId; }, [selId]);
  const adjRef = useRef(adj);                   useEffect(()=>{ adjRef.current = adj; }, [adj]);
  const transitionRef = useRef(transition);     useEffect(()=>{ transitionRef.current = transition; }, [transition]);
  const isMobileRef = useRef(isMobile);         useEffect(()=>{ isMobileRef.current = isMobile; }, [isMobile]);
  const vizStyleRef = useRef(vizStyle);         useEffect(()=>{ vizStyleRef.current = vizStyle; }, [vizStyle]);
  const vizColorRef = useRef(vizColor);         useEffect(()=>{ vizColorRef.current = vizColor; }, [vizColor]);
  const showTitleRef = useRef(showTitle);       useEffect(()=>{ showTitleRef.current = showTitle; }, [showTitle]);
  const showLyricsRef = useRef(showLyrics);     useEffect(()=>{ showLyricsRef.current = showLyrics; }, [showLyrics]);
  const lyricLinesRef = useRef(lyricLines);     useEffect(()=>{ lyricLinesRef.current = lyricLines; }, [lyricLines]);
  const titleTextRef = useRef("");              useEffect(()=>{ titleTextRef.current = selectedTitle?.text || niche || ""; }, [selectedTitle, niche]);

  const globalFilter = useMemo(()=> buildClipFilter(filterPreset, adj), [filterPreset, adj]);
  const globalFilterRef = useRef("none");       useEffect(()=>{ globalFilterRef.current = globalFilter; }, [globalFilter]);

  // ===== helper opt klip =====
  const setOpt = useCallback((id: string, patch: Partial<SlideOpt>, histKey = "") => {
    if (histKey) pushHistory(histKey); else pushHistory(`${id}:${Object.keys(patch).join(",")}`);
    setSlideOptsById(cur => ({ ...cur, [id]: { ...(cur[id]||{}), ...patch } }));
  }, [pushHistory]);
  const setClipText = useCallback((id: string, text: ClipText|null) => setOpt(id, { text: text ?? undefined }, `${id}:text-set`), [setOpt]);
  useEffect(() => { if (selId && !slides.some(s=>s.id===selId)) setSelId(""); }, [slides, selId]);
  const selIndex = useMemo(()=> slides.findIndex(s=>s.id===selId), [slides, selId]);
  const selOpt = selId ? slideOptsById[selId] : undefined;

  // ===== TIMELINE per-klip =====
  const timeline = useMemo<Timeline|null>(() => {
    if (!slides.length) return null;
    const durs = slides.map(s => effDur(slideOptsById[s.id], slideDuration));
    const tdurs = slides.map((s, i) => {
      if (i >= slides.length - 1) return 0;
      const tid = canonicalTrans(slideOptsById[s.id]?.trans ?? transition);
      if (tid === "none") return 0;
      const td = slideOptsById[s.id]?.transDur ?? transitionDur;
      return Math.min(Math.max(0.15, td), durs[i] * 0.9);
    });
    const tids = slides.map(s => canonicalTrans(slideOptsById[s.id]?.trans ?? transition));
    return buildTimeline(durs, tdurs, tids);
  }, [slides, slideOptsById, slideDuration, transitionDur, transition]);
  const timelineRef = useRef<Timeline|null>(null);
  useEffect(()=>{ timelineRef.current = timeline; }, [timeline]);
  const clipsTotal = timeline?.total || 0;

  function openTool(t: ToolId) { setTool(cur => cur===t ? null : t); }
  function openToolWithSel(t: ToolId) {
    if (!selIdRef.current && slidesRef.current.length) {
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(previewCurrent, Math.max(0, tl.total - 0.01))) : null;
      const idx = L ? L.idx : 0;
      const s = slidesRef.current[idx] || slidesRef.current[0];
      if (s) setSelId(s.id);
    }
    setTool(t);
  }

  // ===== DRAFTS =====
  const loadDraftsList = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (!raw) { setDraftList([]); return; }
      const arr = JSON.parse(raw);
      const meta = (Array.isArray(arr)?arr:[]).map((d:any)=>({
        id:d.id, title:d.title||"Draft", slides:Array.isArray(d.slides)?d.slides.length:0,
        updatedAt:d.updatedAt||0, thumb:d.thumb||"", step:d.step||1
      }));
      setDraftList(meta);
    } catch { setDraftList([]); }
  }, []);

  // ===== INIT =====
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadDraftsList();
    try {
      const k = localStorage.getItem("verve_suno_key") || "";
      const p = (localStorage.getItem("verve_suno_provider") as Provider) || detectProvider(k);
      if (k) { setSunoApiKey(k); setSunoProvider(p); }
    } catch {}
    const mobileNow = isMobile;
    setQuality(mobileNow ? "fast" : "balanced");
    setAspectRatio(mobileNow ? "9:16" : "16:9");
    setNSlides(mobileNow ? 3 : 4);
    setNKeywords(mobileNow ? 3 : 5);
    setTransitionDur(mobileNow ? 0.5 : 0.8);

    try {
      const tk = JSON.parse(localStorage.getItem(SUNO_TASK_KEY) || "null");
      if (tk?.id && Date.now()-tk.ts < 30*60*1000) {
        setAiMusicTaskId(tk.id);
        setMusicGeneratedFrom(tk.title||"");
        setAiMusicStatus("task tersimpan — tap 🔄 Cek Status");
      } else if (tk) localStorage.removeItem(SUNO_TASK_KEY);
    } catch {}

    const LS_KEY = "verve_draft_v1";
    let restoredSlides: Slide[] = [];
    let restoredLyrics: string[] = [];
    let restoredLogo = "";
    const applyDraft = (d:any, src:"session"|"local") => {
      try {
        if (typeof d.step === "number") setStep(d.step);
        if (d.niche) setNiche(d.niche);
        if (d.keywordMode) setKeywordMode(d.keywordMode);
        if (typeof d.manualKeywords==="string") setManualKeywords(d.manualKeywords);
        if (d.nKeywords) setNKeywords(d.nKeywords);
        if (Array.isArray(d.keywords)) setKeywords(d.keywords);
        if (Array.isArray(d.titles)) setTitles(d.titles);
        if (d.selectedTitleId) setSelectedTitleId(d.selectedTitleId);
        if (d.imageSource) setImageSource(d.imageSource);
        if (d.imageStyle) setImageStyle(d.imageStyle);
        if (d.aspectRatio) setAspectRatio(d.aspectRatio);
        if (d.nSlides) setNSlides(d.nSlides);
        if (d.audioMode) setAudioMode(d.audioMode);
        if (d.ttsVoice) setTtsVoice(d.ttsVoice);
        if (typeof d.ttsText==="string") setTtsText(d.ttsText);
        if (d.vizStyle) setVizStyle(d.vizStyle);
        if (d.vizColor) setVizColor(d.vizColor);
        if (typeof d.slideDuration === "number") setSlideDuration(d.slideDuration);
        if (typeof d.transitionDur === "number") setTransitionDur(d.transitionDur);
        if (d.transition) setTransition(d.transition);
        if (typeof d.showTitle === "boolean") setShowTitle(d.showTitle);
        if (typeof d.showLyrics === "boolean") setShowLyrics(d.showLyrics);
        if (d.captionStyle) setCaptionStyle(d.captionStyle);
        if (d.spectrumSticker) setSpectrumSticker(d.spectrumSticker);
        if (d.filterPreset) setFilterPreset(d.filterPreset);
        if (d.adj && typeof d.adj === "object") setAdj({...DEFAULT_ADJUST, ...d.adj});
        if (d.slideOptsById && typeof d.slideOptsById === "object") setSlideOptsById(d.slideOptsById);
        if (d.musicGenre) setMusicGenre(d.musicGenre);
        if (d.musicMood) setMusicMood(d.musicMood);
        if (d.musicModel) setMusicModel(d.musicModel);
        if (d.musicVocalType) setMusicVocalType(d.musicVocalType);
        if (d.musicVocalGender) setMusicVocalGender(d.musicVocalGender);
        if (typeof d.musicEra==="string") setMusicEra(d.musicEra);
        if (typeof d.musicTempo==="string") setMusicTempo(d.musicTempo);
        if (typeof d.musicInstruments==="string") setMusicInstruments(d.musicInstruments);
        if (typeof d.musicTitle==="string") setMusicTitle(d.musicTitle);
        if (typeof d.musicLyrics==="string") setMusicLyrics(d.musicLyrics);
        if (typeof d.musicStylePrompt==="string") setMusicStylePrompt(d.musicStylePrompt);
        if (d.aiMusicUrl) { setAiMusicUrl(d.aiMusicUrl); setSunoCredits(d.sunoCredits||"✅ Lagu AI tersimpan"); setMusicGeneratedFrom(d.musicGeneratedFrom||""); }
        if (d.logoPosition) setLogoPosition(d.logoPosition);
        if (d.storyboard) setStoryboard(d.storyboard);
        if (Array.isArray(d.slides) && d.slides.length && d.slides[0]?.imageUrl) {
          restoredSlides = d.slides.slice(0,12);
          restoredLyrics = Array.isArray(d.lyricLines) && d.lyricLines.length === restoredSlides.length
            ? d.lyricLines : restoredSlides.map((s:any)=>s.lyric||"");
        }
        if (d.logoDataUrl) restoredLogo = d.logoDataUrl;
      } catch(e) { console.warn("restore draft gagal:",e); }
    };
    try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) applyDraft(JSON.parse(raw), "session"); } catch {}
    try { const rawL = localStorage.getItem(LS_KEY); if (!restoredSlides.length && rawL) applyDraft(JSON.parse(rawL), "local"); } catch {}

    if (restoredSlides.length) {
      setTimeout(()=>{
        setSlides(restoredSlides);
        setLyricLines(restoredLyrics);
        if (restoredLogo) setLogoDataUrl(restoredLogo);
        setStageText("💾 Session dipulihkan — "+restoredSlides.length+" slide");
        setTimeout(()=>setStageText(""), 4000);
      }, 30);
    }
    setTimeout(()=>{
      try {
        const raw = localStorage.getItem(DRAFTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const hasDrafts = Array.isArray(arr) && arr.length>0;
        const alreadySeen = localStorage.getItem("verve_seen_welcome")==="1";
        if (hasDrafts && !alreadySeen && !restoredSlides.length) {
          loadDraftsList(); setShowDraftPicker(true);
          localStorage.setItem("verve_seen_welcome","1");
        }
      } catch {}
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save sessionStorage (700ms debounce)
  useEffect(() => {
    if (!didInit.current) return;
    const buildSnap = () => {
      const compactSlides = slides.map(s=>{
        if (!s.imageUrl || !s.imageUrl.startsWith("data:")) return s;
        if (s.imageUrl.length > 600_000) return { ...s, _tooBig: true, imageUrl:"" };
        return s;
      });
      const anyTooBig = compactSlides.some((s:any)=>s._tooBig);
      return {
        v: 4, savedAt: Date.now(), step, niche, keywordMode, manualKeywords, nKeywords,
        keywords: keywords.slice(0,30),
        titles: titles.slice(0,50).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
        selectedTitleId, imageSource, imageStyle, aspectRatio, nSlides,
        audioMode, ttsVoice, ttsText, vizStyle, vizColor, slideDuration, transitionDur, transition,
        showTitle, showLyrics, captionStyle, spectrumSticker, filterPreset, adj,
        slideOptsById: anyTooBig ? {} : slideOptsById,
        logoPosition, logoDataUrl: logoDataUrl.slice(0,150_000),
        musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
        musicEra, musicTempo, musicInstruments, musicTitle: musicTitle.slice(0,80),
        musicStylePrompt: musicStylePrompt.slice(0,1000),
        aiMusicUrl, musicGeneratedFrom, sunoCredits, storyboard,
        slides: anyTooBig ? [] : compactSlides,
        lyricLines: anyTooBig ? [] : lyricLines.slice(0,12),
      };
    };
    const saveSession = () => {
      try {
        const fullSnap = buildSnap();
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fullSnap));
      } catch { try { const b = buildSnap(); sessionStorage.setItem(STORAGE_KEY, JSON.stringify({...b,slides:[],lyricLines:[],slideOptsById:{},logoDataUrl:""})); } catch {} }
    };
    const t1 = setTimeout(saveSession, 700);
    return () => clearTimeout(t1);
  }, [step, niche,keywordMode,manualKeywords,nKeywords,keywords,titles,selectedTitleId,
      imageSource,imageStyle,aspectRatio,nSlides,slides,audioMode,ttsVoice,ttsText,
      vizStyle,vizColor,slideDuration,transitionDur,transition,captionStyle,spectrumSticker,
      filterPreset,adj,slideOptsById,
      showTitle,showLyrics,logoDataUrl,logoPosition,musicGenre,musicMood,musicModel,
      musicVocalType,musicVocalGender,musicEra,musicTempo,musicInstruments,
      musicTitle,musicStylePrompt,aiMusicUrl,musicGeneratedFrom,sunoCredits,
      storyboard,lyricLines]);

  // Backup permanen localStorage (5s)
  useEffect(() => {
    if (!didInit.current) return;
    const t = setTimeout(() => {
      try {
        const compactSlides = slides.map(s=>{
          if (!s.imageUrl || !s.imageUrl.startsWith("data:")) return s;
          if (s.imageUrl.length > 600_000) return { ...s, _tooBig:true, imageUrl:"" };
          return s;
        });
        const big = compactSlides.some((s:any)=>s._tooBig);
        const snap = { v:4, savedAt:Date.now(), step, niche, keywordMode, manualKeywords, nKeywords,
          keywords: keywords.slice(0,20), titles: titles.slice(0,20).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
          selectedTitleId, aspectRatio, nSlides, audioMode, vizStyle, vizColor, slideDuration, transitionDur, transition,
          showTitle, showLyrics, captionStyle, spectrumSticker, filterPreset, adj,
          slideOptsById: big?{}:slideOptsById, logoPosition, musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
          musicTitle: musicTitle.slice(0,80), musicStylePrompt: musicStylePrompt.slice(0,500),
          aiMusicUrl, musicGeneratedFrom, slides: big?[]:compactSlides, lyricLines: big?[]:lyricLines.slice(0,12) };
        localStorage.setItem("verve_draft_v1", JSON.stringify(snap));
      } catch {}
    }, 5000);
    return ()=>clearTimeout(t);
  }, [step,niche,selectedTitleId,aspectRatio,slides,audioMode,vizStyle,vizColor,
      slideDuration,transitionDur,showTitle,showLyrics,musicGenre,musicModel,
      musicTitle,musicStylePrompt,aiMusicUrl,lyricLines,slideOptsById,adj,filterPreset]);

  // Auto-save DRAFTS HISTORY tiap 30 detik
  useEffect(()=>{
    if (!didInit.current) return;
    if (!slides.length) return;
    const doAuto = () => {
      try {
        const snap = buildDraftSnapshot();
        if (!currentDraftId) setCurrentDraftId(snap.id);
        const list = [snap, ...draftList.filter(x=>x.id!==snap.id)].slice(0,MAX_DRAFTS);
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
        setDraftList(list);
      } catch {}
    };
    const t = setTimeout(doAuto, 2000);
    const itv = setInterval(doAuto, 30000);
    return ()=>{clearTimeout(t);clearInterval(itv);};
  // eslint-disable-next-line
  }, [step, slides.length, aiMusicUrl]);

  function setErr(e: any) { setError(e?.message || e?.error || String(e || "Terjadi kesalahan")); }

  async function callApi(path: string, body: any, timeoutMs = 90000) {
    setLoading(path); setError("");
    try {
      const headers: Record<string,string> = { "Content-Type":"application/json" };
      if (sunoApiKey) { headers["X-Suno-Key"] = sunoApiKey; headers["X-Suno-Provider"] = sunoProvider; }
      const ac = new AbortController();
      const to = setTimeout(()=>ac.abort(), timeoutMs);
      const r = await fetch(`/api/hcnsec${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal, cache: "no-store" });
      clearTimeout(to);
      let data: any = {};
      const txt = await r.text();
      try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: `Server error ${r.status}: ${txt.slice(0,200)}` }; }
      if (!r.ok || data.error) {
        if (data.status === "need_key" || r.status === 401) setShowApiKeyModal(true);
        throw new Error(data.error || data.message || `Error ${r.status}`);
      }
      return data;
    } finally { setLoading(null); }
  }

  function saveSunoKey(k: string, p: Provider) {
    setSunoApiKey(k); setSunoProvider(p);
    try {
      if (k) { localStorage.setItem("verve_suno_key", k); localStorage.setItem("verve_suno_provider", p); }
      else { localStorage.removeItem("verve_suno_key"); localStorage.removeItem("verve_suno_provider"); }
    } catch {}
  }

  // ===== AI: keywords / titles =====
  async function doGenerateKeywords() {
    if (keywordMode === "manual") {
      const kws = manualKeywords.split(",").map(s=>s.trim()).filter(Boolean);
      if (!kws.length) return setErr("Keyword manual kosong");
      setKeywords(kws.map((t,i)=>({id:`k${i}_${Date.now()}`,text:t})));
    } else {
      if (!niche.trim()) return setErr("Niche tidak boleh kosong");
      const { keywords: kws } = await callApi("/keywords", { niche, n: nKeywords });
      setKeywords(kws.map((t:string,i:number)=>({id:`k${i}_${Date.now()}`,text:t})));
    }
  }
  async function doGenerateTitles() {
    if (!keywords.length) return setErr("Belum ada keyword");
    setStageText("Menghasilkan judul high-CTR...");
    const out: TitleItem[] = [];
    for (let i=0;i<keywords.length;i++){
      const kw = keywords[i];
      setStageText(`Judul ${i+1}/${keywords.length} — "${kw.text}"`);
      const { titles: ts } = await callApi("/titles", { keyword: kw.text, niche, n: titlesPerKw });
      ts.forEach((t:string,j:number)=>out.push({id:`${kw.id}_t${j}_${Date.now()}`, keyword: kw.text, text: t}));
    }
    setTitles(out);
    if (out.length) setSelectedTitleId(out[0].id);
    setStageText("");
  }

  // ===== Media =====
  async function doGenerateImages() {
    if (!selectedTitle) return setErr("Pilih judul dulu (tab ✨AI)");
    pushHistory("genimg");
    setStageText(`Generate ${nSlides} gambar AI...`);
    setLoading("/image");
    const raw: Slide[] = []; const errs: string[] = [];
    for (let i=0;i<nSlides;i++){
      setStageText(`Gambar ${i+1}/${nSlides} (AI generate)...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{ "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}) },
          body: JSON.stringify({ title: selectedTitle.text, keyword: selectedTitle.keyword, niche, style: imageStyle }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
        setStageText(`Gambar ${i+1}/${nSlides} — memproses...`);
        const cropped = await cropImageToRatio(data.url, aspectRatio);
        raw.push({ id:`s${i}_${Date.now()}_${i}`, imageUrl: cropped });
      } catch(e:any){ errs.push(`#${i+1}: ${(e.message||"gagal").slice(0,120)}`); }
    }
    if (!raw.length) setErr(`Semua ${nSlides} gambar gagal.\n${errs.slice(0,4).join("\n")}\n💡 Coba style "Studio", atau upload gambar sendiri.`);
    else { setSlides(raw); setLyricLines(raw.map(()=>"")); setSlideOptsById({}); setSelId(""); setError(""); setStageText(`✅ ${raw.length}/${nSlides} gambar siap`); }
    setTimeout(()=>setStageText(""), 2500); setLoading(null);
  }
  function handleUploadImages(files: FileList|null) {
    if (!files) return;
    pushHistory("upload");
    setStageText("Memproses upload...");
    Promise.all(
      Array.from(files).slice(0,12).map(f => new Promise<Slide>((res)=>{
        const r = new FileReader();
        r.onload = () => {
          const img = new Image();
          img.onload = () => {
            const targetRatio = aspectRatio === "9:16" ? 9/16 : aspectRatio === "1:1" ? 1 : 16/9;
            const maxSide = 1280;
            const c = document.createElement("canvas");
            const w = img.naturalWidth, h = img.naturalHeight; const ir = w/h;
            let cw=w, ch=h;
            if (ir > targetRatio) cw = h*targetRatio; else ch = w/targetRatio;
            const outW = targetRatio>=1 ? maxSide : Math.round(maxSide*targetRatio);
            const outH = targetRatio>=1 ? Math.round(maxSide/targetRatio) : maxSide;
            c.width=outW; c.height=outH;
            const cx = c.getContext("2d")!;
            cx.fillStyle="#000"; cx.fillRect(0,0,outW,outH);
            cx.drawImage(img,(w-cw)/2,(h-ch)/2,cw,ch,0,0,outW,outH);
            res({ id:`up_${f.name}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, imageUrl: c.toDataURL("image/jpeg", 0.88) });
          };
          img.src = r.result as string;
        };
        r.readAsDataURL(f);
      }))
    ).then(s=>{
      setSlides(cur=>[...cur,...s]); setLyricLines(cur=>[...cur, ...s.map(()=>"")]);
      setStageText(`✅ ${s.length} gambar ditambahkan`); setTimeout(()=>setStageText(""),1500);
    });
  }
  function moveSlide(from:number, to:number){
    if (from===to) return;
    pushHistory(`move:${from}`);
    setSlides(cur=>{
      if (from<0 || to<0 || from>=cur.length || to>=cur.length) return cur;
      const arr=[...cur]; const [it]=arr.splice(from,1); arr.splice(to,0,it); return arr;
    });
    setLyricLines(cur=>{
      if (from<0 || to>=cur.length || from>=cur.length || to<0) return cur;
      const arr=[...cur]; const [it]=arr.splice(from,1); arr.splice(to,0,it); return arr;
    });
  }
  function duplicateSlide(id:string){
    pushHistory(`dup:${id}`);
    const i = slides.findIndex(s=>s.id===id); if (i<0) return;
    const nid = `dup_${Date.now()}_${i}`;
    setSlides(cur=>{
      const j = cur.findIndex(s=>s.id===id); if(j<0) return cur;
      const cp:Slide = {...cur[j], id:nid};
      const arr=[...cur]; arr.splice(j+1,0,cp); return arr;
    });
    setSlideOptsById(cur=>{ const o = cur[id] ? {...cur[id]} : {}; const c2={...cur}; c2[nid]=o; return c2; });
    setLyricLines(cur=>{ const arr=[...cur]; arr.splice(i+1,0,arr[i]||""); return arr; });
  }
  function removeSlide(id:string){
    pushHistory(`del:${id}`);
    setSlides(cur=>{
      const i = cur.findIndex(s=>s.id===id);
      setLyricLines(ll=>ll.filter((_,idx)=>idx!==i));
      return cur.filter(s=>s.id!==id);
    });
    setSlideOptsById(cur=>{ const c2={...cur}; delete c2[id]; return c2; });
  }
  function splitSlide(id:string){
    const i = slides.findIndex(s=>s.id===id); if (i<0) return;
    pushHistory(`split:${id}`);
    const base = slideOptsById[id] || {};
    const d0 = base.dur ?? slideDuration;
    const half1 = Math.max(0.4, d0/2), half2 = Math.max(0.4, d0-half1);
    const nid = `sp_${Date.now()}_${i}`;
    setSlides(cur=>{
      const j = cur.findIndex(s=>s.id===id); if (j<0) return cur;
      const arr=[...cur]; arr.splice(j+1,0,{...cur[j], id:nid}); return arr;
    });
    setLyricLines(cur=>{ const arr=[...cur]; arr.splice(i+1,0,""); return arr; });
    setSlideOptsById(cur=>{
      const c2 = {...cur};
      c2[id] = {...(c2[id]||{}), dur:half1};
      const out = {...(c2[id]||{})}; delete out.trans; delete out.transDur;
      c2[nid] = {...out, dur:half2};
      return c2;
    });
  }

  // ===== Audio =====
  async function doGenerateTTS() {
    if (!ttsText.trim()) return setErr("Teks TTS kosong");
    setStageText("Generate narasi suara AI...");
    const { url } = await callApi("/tts", { text: ttsText.slice(0,3500), voice: ttsVoice });
    setTtsUrl(url); setStageText("✅ Narasi siap"); setTimeout(()=>setStageText(""),1500);
  }
  function handleUploadMusic(f: File|undefined) {
    if (!f) return;
    if (f.size > 15*1024*1024) return setErr("File musik terlalu besar (maks 15MB)");
    const r = new FileReader();
    r.onload = () => { setMusicUrl(r.result as string); };
    r.readAsDataURL(f);
  }
  async function doAutoScript() {
    if (!selectedTitle) return;
    setStageText("Buat script narasi otomatis...");
    const { lines } = await callApi("/script", { title: selectedTitle.text, keyword: selectedTitle.keyword, slides: slides.length || nSlides });
    setTtsText(lines.join(" ")); setStageText("✅ Script dibuat"); setTimeout(()=>setStageText(""),1200);
  }

  // ===== Render =====
  async function doRender() {
    if (!slides.length) return setErr("Belum ada gambar — buka tab 🖼️ Media dulu bro");
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(""); setVideoBlob(null); }
    setError(""); setLoading("render"); setProgress(0); renderStartRef.current = Date.now();
    setStageText("Menyiapkan render engine..."); setMeta(null);
    try {
      let chosenMusic = musicUrl; if (aiMusicUrl) chosenMusic = aiMusicUrl;
      const parts: string[] = [];
      if ((audioMode==="tts"||audioMode==="both") && ttsUrl) parts.push(proxifyAudioUrl(ttsUrl));
      if ((audioMode==="music"||audioMode==="both") && chosenMusic) parts.push(proxifyAudioUrl(chosenMusic));
      if (audioMode==="aimusic" && aiMusicUrl) parts.push(proxifyAudioUrl(aiMusicUrl));
      let audioUrl: string|null = null;
      if (parts.length === 1) audioUrl = parts[0];
      else if (parts.length > 1) audioUrl = await mixAudioUrls(parts);

      const finalLyrics: string[] = [];
      if (showLyrics) {
        for (let i=0;i<slides.length;i++){
          const s = slides[i] as any; let line = "";
          if (s.lyric) line = s.lyric;
          else if (lyricLines[i]) line = lyricLines[i];
          else if (storyboard?.scenes?.[i]?.lyric_line) line = storyboard.scenes[i].lyric_line;
          finalLyrics.push(line);
        }
      }
      const hasLyrics = finalLyrics.some(x=>!!x);
      const orderedOpts: SlideOpt[] = slides.map(s=>{
        const o = slideOptsById[s.id] || {};
        const clean: SlideOpt = { ...o };
        if (clean.text && !clean.text.txt?.trim()) delete clean.text;
        return clean;
      });
      const gf = buildClipFilter(filterPreset, adj);
      const blob = await renderSlideshow({
        images: slides.map(s=>s.imageUrl),
        audioUrl: audioUrl || undefined,
        slideDuration,
        transitionDuration: transitionDur,
        slideOpts: orderedOpts,
        videoFilter: gf==="none" ? undefined : gf,
        vignetteStrength: Math.max(0, Math.min(1, (adj.vig/100)*0.8)),
        grainAmt: adj.grain,
        spectrumSticker: spectrumSticker || "bars-bottom",
        vizStyle, vizColor, title: showTitle ? (selectedTitle?.text || niche) : undefined,
        lyrics: showLyrics && hasLyrics ? finalLyrics : undefined,
        logoUrl: logoDataUrl || undefined, logoPosition,
        quality, mobileOptimized: isMobile, ratio: aspectRatio, aspectRatio,
        transition: transition as any, showTitle, showLyrics: showLyrics && hasLyrics,
        captionStyle: (showLyrics ? captionStyle : "none") as any,
        onProgress: (p) => {
          setProgress(p);
          const elapsed = (Date.now()-renderStartRef.current)/1000;
          if (p > 0.02) setRenderETA(formatTime(Math.max(0, elapsed/p - elapsed)));
          if (p>0.05 && p<0.98) setStageText(`Rendering ${Math.round(p*100)}% • sisa ~${formatTime(Math.max(0,(elapsed/p*(1-p))))}`);
        },
        onStage: (s)=>setStageText(s),
      });
      setVideoBlob(blob);
      const u = URL.createObjectURL(blob); setVideoUrl(u);
      setStageText("✅ Video siap! Membuat metadata YouTube...");
      setProgress(1); setRenderETA("");
      try { setMeta(await callApi("/metadata", { title: selectedTitle?.text, keyword: selectedTitle?.keyword, niche })); }
      catch(e:any){ console.warn("Meta gagal:", e); }
      setStageText("✅ Selesai! Video + metadata siap di-download.");
      setTimeout(()=>setStageText(""),4000);
    } catch(e:any){ setErr(e.message || "Render gagal"); }
    finally { setLoading(null); }
  }
  async function mixAudioUrls(parts: string[]): Promise<string|null> {
    try {
      setStageText("Menggabungkan audio...");
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const bufs = await Promise.all(parts.map(u => fetch(u).then(r=>r.arrayBuffer()).then(b=>actx.decodeAudioData(b.slice(0)))));
      const maxLen = Math.max(...bufs.map(b=>b.length));
      const sr = bufs[0].sampleRate; const ch = bufs[0].numberOfChannels;
      const out = actx.createBuffer(ch, maxLen, sr);
      for (let c=0;c<ch;c++){
        const od = out.getChannelData(c);
        for (let bi=0;bi<bufs.length;bi++){
          const b = bufs[bi]; const d = b.getChannelData(Math.min(c, b.numberOfChannels-1));
          const vol = bi>=1 ? 0.25 : 1;
          for (let i=0;i<d.length;i++) od[i] = Math.max(-1,Math.min(1,od[i]+d[i]*vol));
        }
      }
      const wav = bufferToWav(out); actx.close();
      return URL.createObjectURL(new Blob([wav],{type:"audio/wav"}));
    } catch(e){ return parts[0]; }
  }
  function downloadVideo() {
    if (!videoBlob) return;
    const safe = (meta?.titleHighCTR || selectedTitle?.text || "video").replace(/[^\w\- ]+/g,"").replace(/\s+/g,"_").slice(0,50) || "video";
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${safe}_${Date.now()}.${ext}`);
  }
  async function copyField(key:string, text:string) {
    const ok = await copyToClipboard(text);
    if (ok) { setCopiedField(key); setTimeout(()=>setCopiedField(""),1500); }
  }
  function downloadMetaText() {
    if (!meta || !selectedTitle) return;
    const txt = `=== JUDUL YOUTUBE (high CTR) ===\n${meta.titleHighCTR}\n\n=== JUDUL ALTERNATIF ===\n${meta.titleAlternatives.map((t,i)=>`${i+1}. ${t}`).join("\n")}\n\n=== DESKRIPSI ===\n${meta.description}\n\n=== TAGS ===\n${meta.tags.join(", ")}\n\n=== HASHTAGS ===\n${meta.hashtags}\n\nDibuat dengan Verve AI Video Studio`;
    const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url;
    a.download = `meta_${(meta.titleHighCTR||"video").replace(/[^\w\- ]+/g,"").slice(0,30)}.txt`;
    a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  // ===== Storyboard =====
  async function doGenerateStoryboard() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Membuat storyboard emosional..."); setLoading("storyboard");
    try {
      const sb = await callApi("/storyboard", { title: selectedTitle.text, keyword: selectedTitle.keyword, niche, slides: nSlides });
      setStoryboard(sb);
      if (sb.color_grade) setVizColor(sb.color_grade);
      const styleMap: Record<string,string> = { cinematic:"cinematic", anime:"anime", studio:"studio", fantasy:"epic", cyberpunk:"cyberpunk", pixar:"3d", "3d":"3d", oil:"oil", minimalist:"minimalist", retro:"cinematic" };
      const vsl = String(sb.style_visual||"").toLowerCase();
      for (const k of Object.keys(styleMap)) if (vsl.includes(k)) { setImageStyle(styleMap[k]); break; }
      if (sb.scenes && Array.isArray(sb.scenes)) {
        const lirikFull = sb.scenes.map((s:any)=>s.lyric_line).filter(Boolean).join(". ");
        if (lirikFull) setTtsText(lirikFull);
        setLyricLines(sb.scenes.map((s:any)=>s.lyric_line||""));
        setNSlides(sb.scenes.length); setShowLyrics(true);
      }
      setStageText("✅ Storyboard + lirik siap!");
      setTimeout(()=>setStageText(""), 3500);
    } catch(e:any){ setErr(e.message); setTimeout(()=>setStageText(""),2000); }
    setLoading(null);
  }
  async function doGenerateImagesFromStory() {
    if (!storyboard?.scenes?.length) return setErr("Buat storyboard dulu");
    pushHistory("storyimg");
    setStageText(`Generate ${storyboard.scenes.length} gambar sesuai cerita...`); setLoading("img-story");
    const newSlides: Slide[] = []; const errs: string[] = []; const ll: string[] = [];
    for (let i=0;i<storyboard.scenes.length;i++){
      const sc = storyboard.scenes[i];
      setStageText(`Adegan ${i+1}/${storyboard.scenes.length}: ${sc.scene_desc?.slice(0,35)}...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{ "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}) },
          body: JSON.stringify({ style: imageStyle, _storyScene: { visual_prompt: sc.visual_prompt, scene_desc: sc.scene_desc }, _mood: sc.mood, _rawPrompt: true, prompt: sc.visual_prompt }),
        });
        let data; try { data = await res.json(); } catch { data={error:"bad json"}; }
        if (!res.ok || data.error) throw new Error(data.error||`HTTP ${res.status}`);
        setStageText(`Adegan ${i+1} — crop ${aspectRatio}...`);
        const cropped = await cropImageToRatio(data.url, aspectRatio);
        newSlides.push({ id:`sb${i}_${Date.now()}`, imageUrl: cropped, lyric: sc.lyric_line });
        ll.push(sc.lyric_line||"");
        await new Promise(r=>setTimeout(r,50));
      } catch(e:any){ errs.push(`#${i+1}: ${(e.message||"gagal").slice(0,70)}`); }
    }
    if (newSlides.length) { setSlides(newSlides); setSlideOptsById({}); setSelId(""); setLyricLines(ll); setShowLyrics(true); setError(""); setStageText(`✅ ${newSlides.length}/${storyboard.scenes.length} adegan siap!`); }
    else setErr(`Gagal generate gambar cerita:\n${errs.join("\n")}`);
    setTimeout(()=>setStageText(""),3000); setLoading(null);
  }

  // ===== Suno AI Music =====
  async function doGenerateLyrics() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Menulis lirik lagu lengkap + style prompt..."); setLoading("lyrics");
    try {
      const extraStyle = [musicTempo!=="slow"?musicTempo:"", musicEra, musicInstruments].filter(Boolean).join(", ");
      const l = await callApi("/lyrics", {
        title: selectedTitle.text, keyword: selectedTitle.keyword, niche,
        genre: [musicGenre, extraStyle].filter(Boolean).join(", "), mood: musicMood,
      });
      setLyrics(l);
      setMusicTitle((l.title || selectedTitle.text).slice(0,80));
      setMusicLyrics(l.lyrics || "");
      const tempoEn = musicTempo==="fast"?"uptempo":musicTempo==="mid"?"mid-tempo":"slow tempo";
      const eraEn = musicEra ? `${musicEra} era, ` : "";
      const vocalEn = musicVocalGender==="female"?"female vocal":musicVocalGender==="male"?"male vocal":"male vocal";
      const baseStyle = [musicGenre, eraEn+tempoEn, vocalEn, musicMood, musicInstruments, "high quality studio recording, emotional, indonesian"].map(s=>(s||"").trim()).filter(Boolean).join(", ");
      setMusicStylePrompt(l.style_prompt_suno || baseStyle);
      setStageText("✅ Judul + Lirik + Style prompt siap!");
    } catch(e:any){ setErr(e.message); }
    setTimeout(()=>setStageText(""),2500); setLoading(null);
  }
  function rebuildStylePrompt() {
    if (musicStylePrompt && !/^\s*$/.test(musicStylePrompt)) return;
    const tempoEn = musicTempo==="fast"?"uptempo":musicTempo==="mid"?"mid-tempo":"slow tempo";
    const eraEn = musicEra ? `${musicEra} era, ` : "";
    const vocalEn = musicVocalGender==="female"?"female vocal":musicVocalGender==="male"?"male vocal":"male vocal";
    const s = [musicGenre, eraEn+tempoEn, vocalEn, musicMood, musicInstruments, "high quality studio recording"].map(x=>(x||"").trim()).filter(Boolean).join(", ");
    setMusicStylePrompt(s);
  }
  useEffect(()=>{ rebuildStylePrompt(); /* eslint-disable-next-line */ },[musicGenre,musicTempo,musicEra,musicInstruments,musicVocalGender]);

  function saveSunoTask(id:string, title:string){
    try { localStorage.setItem(SUNO_TASK_KEY, JSON.stringify({id,title,ts:Date.now()})); } catch {}
  }
  function clearSunoTask(){ try { localStorage.removeItem(SUNO_TASK_KEY); } catch {} }

  async function doGenerateAIMusic() {
    const title = (musicTitle || selectedTitle?.text || "").trim();
    const lyr = (musicLyrics || "").trim();
    const style = (musicStylePrompt || "").trim();
    if (!title) return setErr("Judul lagu kosong, isi kolom TITLE dulu ya.");
    if (musicVocalType !== "instrumental" && lyr.length < 20)
      return setErr("Lirik terlalu pendek. Klik '✍️ Buat Lirik Dulu' atau isi minimal ~20 karakter.");
    if (style.length < 10)
      return setErr("Deskripsi Utama (style) wajib diisi — contoh: pop, acoustic, male vocal, melancholic, slow tempo, guitar, piano.");

    setStageText(`Meminta AI membuat lagu "${title.slice(0,40)}"... (12 kredit ${sunoProvider})`);
    setLoading("aimusic"); setAiMusicStatus("memulai..."); setAiMusicUrl("");
    setAiMusicTaskId(""); setAiMusicPolling(true); setAiMusicStart(Date.now());
    setError(""); setMusicGeneratedFrom(title);
    const t0 = Date.now();
    const elapsed = ()=>{ const s=Math.round((Date.now()-t0)/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; };
    try {
      const useCustom = lyr.length > 30 && musicVocalType !== "instrumental";
      const payload = {
        title: title.slice(0,80), prompt: style, lyrics: useCustom ? lyr : undefined,
        genre: musicGenre, tags: style, custom: useCustom, model: musicModel,
        instrumental: musicVocalType === "instrumental", vocalGender: musicVocalGender,
        style_bits: { era: musicEra, instruments: musicInstruments, tempo: musicTempo },
        _raw_title: title, _raw_lyrics: lyr, _raw_style: style,
      };
      let r: Response;
      try {
        const ac = new AbortController();
        const to = setTimeout(()=>ac.abort(), 60000);
        r = await fetch("/api/hcnsec/music", {
          method:"POST", headers:{ "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}) },
          body: JSON.stringify(payload), signal: ac.signal, cache: "no-store",
        });
        clearTimeout(to);
      } catch(netErr:any) {
        throw new Error(`⚠️ Gagal nyambung ke server (${netErr?.name==="AbortError"?"timeout 60s":"jaringan"}).\nKlik CREATE lagi (kredit TIDAK kepotong kalau belum dapat id).`);
      }
      let txt = ""; try { txt = await r.text(); } catch { txt = ""; }
      let data: any;
      try { data = txt ? JSON.parse(txt) : {}; }
      catch { data = { error: `Server balas format aneh (${r.status}). Coba lagi.` }; }
      if (!r.ok || data.error) {
        if (data.status === "need_key" || r.status === 401) setShowApiKeyModal(true);
        if (r.status === 504) throw new Error("Server lagi cold-start 😅 Tunggu 30 detik lalu CREATE lagi — kredit gak kepotong.");
        throw new Error(data.error || `Error ${r.status}`);
      }
      if (data.audio_url) {
        setAiMusicUrl(data.audio_url); setAiMusicStatus("selesai"); setAiMusicPolling(false); clearSunoTask();
        setSunoCredits(`✅ ${musicModel} · 12 kredit (${data.provider||sunoProvider})`);
        if (audioMode !== "aimusic") setAudioMode("aimusic");
        setStageText(`✅ Lagu "${title.slice(0,30)}" siap & otomatis dipakai untuk render!`);
      } else if (data.id) {
        setAiMusicTaskId(data.id); saveSunoTask(data.id, title);
        setAiMusicStatus(`antri di server Suno… ⏱ ${elapsed()}`);
        const pollStart = Date.now();
        const MAX_POLL_MS = 8 * 60 * 1000;
        let done = false;
        while (Date.now() - pollStart < MAX_POLL_MS) {
          await new Promise(res=>setTimeout(res,4000));
          try {
            const ac = new AbortController();
            const t2 = setTimeout(()=>ac.abort(), 25000);
            const pr = await fetch(`/api/hcnsec/music?id=${data.id}`, {
              headers: sunoApiKey ? {"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider} : {},
              signal: ac.signal, cache:"no-store",
            });
            clearTimeout(t2);
            if (pr.ok) {
              const pd = await pr.json().catch(()=>({}));
              const st = pd.status || "";
              if (st === "TEXT_SUCCESS") setAiMusicStatus(`lirik ready, racik audio… ⏱ ${elapsed()}`);
              else setAiMusicStatus(`memproses… ⏱ ${elapsed()} (umumnya 1–4 menit)`);
              const audioUrl = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
              if (audioUrl) {
                setAiMusicUrl(audioUrl); setAiMusicStatus("selesai"); setAiMusicPolling(false); clearSunoTask();
                setSunoCredits(`✅ ${musicModel} · 12 kredit (${pd.provider||sunoProvider})`);
                if (audioMode !== "aimusic") setAudioMode("aimusic");
                setStageText(`✅ Lagu "${title.slice(0,30)}" siap & otomatis dipakai untuk render!`);
                done = true; break;
              }
              if (pd.status === "error" || pd.error) {
                if (Date.now() - pollStart < 60000) continue;
                throw new Error(pd.error||"Gagal generate musik");
              }
            } else setAiMusicStatus(`wait server… ⏱ ${elapsed()}`);
          } catch {
            setAiMusicStatus(`jaringan retry… ⏱ ${elapsed()}`);
          }
        }
        if (!done) {
          setAiMusicStatus("masih diproses server — tap 🔄 Cek Status (gratis, tanpa kredit)");
          setAiMusicPolling(false);
          setStageText("⏳ Lagu masih diolah. Task tersimpan — aman walau refresh.");
        }
      } else {
        setAiMusicPolling(false);
        setStageText("⚠️ AI music belum merespon. Coba lagi ya bro.");
      }
    } catch(e:any){
      setErr(e.message || "AI music gagal."); setAiMusicStatus("gagal"); setAiMusicPolling(false);
    }
    setTimeout(()=>setStageText(""),6000); setLoading(null);
  }
  async function doCheckAiMusicStatus() {
    const id = aiMusicTaskId;
    if (!id) return setErr("Belum ada taskId buat dicek.");
    setError(""); setAiMusicPolling(true); setAiMusicStatus("mengecek...");
    try {
      const ac = new AbortController();
      const t = setTimeout(()=>ac.abort(), 25000);
      const pr = await fetch(`/api/hcnsec/music?id=${id}`, {
        headers: sunoApiKey ? {"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider} : {},
        signal: ac.signal, cache:"no-store",
      });
      clearTimeout(t);
      if (!pr.ok) throw new Error(`Server error ${pr.status}. Coba sebentar lagi.`);
      const pd = await pr.json().catch(()=>({}));
      const audioUrl = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
      if (audioUrl) {
        setAiMusicUrl(audioUrl); setAiMusicStatus("selesai"); setAiMusicPolling(false); clearSunoTask();
        const title = musicGeneratedFrom || musicTitle;
        setSunoCredits(`✅ ${musicModel} · 12 kredit (${pd.provider||sunoProvider})`);
        if (audioMode !== "aimusic") setAudioMode("aimusic");
        setStageText(`✅ Lagu "${title.slice(0,30)}" siap!`);
        setTimeout(()=>setStageText(""),4000);
        return;
      }
      if (pd.status === "error" || pd.error) {
        setAiMusicStatus("gagal"); setAiMusicPolling(false);
        setErr(pd.error || "Gagal generate musik.");
        return;
      }
      setAiMusicStatus(`masih diproses (${pd.status||"pending"}) — cek lagi 30–60 dtk`);
    } catch(e:any){ setErr(e.message || "Gagal cek status."); setAiMusicStatus("cek status gagal"); }
    setAiMusicPolling(false);
  }

  // ===== Draft history =====
  function buildDraftSnapshot(title?:string): any {
    const compactSlides = slides.slice(0,12).map(s=>{
      if (!s.imageUrl || !s.imageUrl.startsWith("data:")) return s;
      if (s.imageUrl.length > 400_000) return { ...s, imageUrl:"", _big:true };
      return s;
    });
    return {
      v:2, id: currentDraftId || `d${Date.now()}`,
      title: (title||selectedTitle?.text||niche||"Draft tanpa judul").slice(0,80),
      updatedAt: Date.now(), step, niche, keywordMode, manualKeywords,
      keywords: keywords.slice(0,20), titles: titles.slice(0,20).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
      selectedTitleId, imageSource, imageStyle, aspectRatio, nSlides,
      audioMode, ttsVoice, ttsText, vizStyle, vizColor, slideDuration, transitionDur, transition,
      showTitle, showLyrics, captionStyle, spectrumSticker, filterPreset, adj, slideOptsById,
      logoPosition, musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
      musicTitle: musicTitle.slice(0,80), musicStylePrompt: musicStylePrompt.slice(0,500),
      aiMusicUrl, musicGeneratedFrom, storyboard, slides: compactSlides, lyricLines: lyricLines.slice(0,12),
      thumb: slides[0]?.imageUrl?.startsWith("data:")?slides[0].imageUrl.slice(0,10000):"",
    };
  }
  function applyDraft(d:any) {
    if (!d) return;
    stopPreview();
    if (typeof d.step === "number") setStep(d.step);
    if (d.niche) setNiche(d.niche);
    if (d.keywordMode) setKeywordMode(d.keywordMode);
    if (typeof d.manualKeywords==="string") setManualKeywords(d.manualKeywords);
    if (d.nKeywords) setNKeywords(d.nKeywords);
    if (Array.isArray(d.keywords)) setKeywords(d.keywords);
    if (Array.isArray(d.titles)) setTitles(d.titles);
    if (d.selectedTitleId) setSelectedTitleId(d.selectedTitleId);
    if (d.imageSource) setImageSource(d.imageSource);
    if (d.imageStyle) setImageStyle(d.imageStyle);
    if (d.aspectRatio) setAspectRatio(d.aspectRatio);
    if (d.nSlides) setNSlides(d.nSlides);
    if (d.audioMode) setAudioMode(d.audioMode);
    if (d.ttsVoice) setTtsVoice(d.ttsVoice);
    if (typeof d.ttsText==="string") setTtsText(d.ttsText);
    if (d.vizStyle) setVizStyle(d.vizStyle);
    if (d.vizColor) setVizColor(d.vizColor);
    if (typeof d.slideDuration==="number") setSlideDuration(d.slideDuration);
    if (typeof d.transitionDur==="number") setTransitionDur(d.transitionDur);
    if (d.transition) setTransition(d.transition);
    if (typeof d.showTitle==="boolean") setShowTitle(d.showTitle);
    if (typeof d.showLyrics==="boolean") setShowLyrics(d.showLyrics);
    if (d.captionStyle) setCaptionStyle(d.captionStyle);
    if (d.spectrumSticker) setSpectrumSticker(d.spectrumSticker);
    if (d.filterPreset) setFilterPreset(d.filterPreset);
    if (d.adj && typeof d.adj==="object") setAdj({...DEFAULT_ADJUST, ...d.adj});
    if (d.slideOptsById && typeof d.slideOptsById==="object") setSlideOptsById(d.slideOptsById);
    if (d.logoPosition) setLogoPosition(d.logoPosition);
    if (d.musicGenre) setMusicGenre(d.musicGenre);
    if (d.musicMood) setMusicMood(d.musicMood);
    if (d.musicModel) setMusicModel(d.musicModel);
    if (d.musicVocalType) setMusicVocalType(d.musicVocalType);
    if (d.musicVocalGender) setMusicVocalGender(d.musicVocalGender);
    if (typeof d.musicTitle==="string") setMusicTitle(d.musicTitle);
    if (typeof d.musicStylePrompt==="string") setMusicStylePrompt(d.musicStylePrompt);
    if (d.aiMusicUrl) { setAiMusicUrl(d.aiMusicUrl); setSunoCredits("✅ Lagu AI tersimpan"); setMusicGeneratedFrom(d.musicGeneratedFrom||""); }
    if (d.storyboard) setStoryboard(d.storyboard);
    if (Array.isArray(d.slides) && d.slides.length) setSlides(d.slides);
    if (Array.isArray(d.lyricLines)) setLyricLines(d.lyricLines);
    setSelId("");
    setCurrentDraftId(d.id);
  }
  function saveDraftManually(title?:string) {
    try {
      const snap = buildDraftSnapshot(title);
      if (!currentDraftId) setCurrentDraftId(snap.id);
      const list = [snap, ...draftList.filter(x=>x.id!==snap.id)].slice(0,MAX_DRAFTS);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
      setDraftList(list.map((d:any)=>({id:d.id,title:d.title,slides:Array.isArray(d.slides)?d.slides.length:0,updatedAt:d.updatedAt,thumb:d.thumb||"",step:d.step||1})));
      setStageText(`💾 Draft tersimpan: "${snap.title}"`);
      setTimeout(()=>setStageText(""),2500);
    } catch(e:any) { setErr("Draft gagal disimpan: "+(e?.message||"quota penuh")); }
  }
  function deleteDraft(id:string) {
    const list = draftList.filter(x=>x.id!==id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
    setDraftList(list);
  }
  function startNewDraft() {
    stopPreview();
    setStep(1); setTool(null);
    setNiche(""); setKeywords([]); setTitles([]); setSelectedTitleId("");
    setSlides([]); setSlideOptsById({}); setSelId(""); setLyricLines([]); setStoryboard(null); setTtsText(""); setTtsUrl("");
    setAiMusicUrl(""); setAiMusicStatus(""); setAiMusicTaskId(""); setMusicTitle("");
    setMusicLyrics(""); setMusicStylePrompt(""); setMusicGeneratedFrom(""); setSunoCredits("");
    setVideoUrl(""); setVideoBlob(null); setMeta(null);
    setCurrentDraftId(""); setShowDraftPicker(false); clearSunoTask();
    histRef.current = {stk:[], i:-1}; setHistVer(v=>v+1);
    setStageText("✨ Project baru dimulai"); setTimeout(()=>setStageText(""),2000);
  }
  function loadDraft(id:string) {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const full = (Array.isArray(arr)?arr:[]).find((x:any)=>x.id===id);
      if (!full) { setErr("Draft tidak ditemukan"); return; }
      applyDraft(full); setShowDraftPicker(false);
      setStageText(`📂 Draft dibuka: "${full.title}"`);
      setTimeout(()=>setStageText(""),2500);
    } catch(e:any){ setErr("Gagal buka draft: "+e.message); }
  }

  function handleLogoUpload(f: File|undefined) {
    if (!f) return;
    if (f.size>3*1024*1024) return setErr("Logo maks 3MB");
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); const size=256;
        c.width=size; c.height=size;
        const cx=c.getContext("2d")!;
        cx.beginPath(); cx.arc(size/2,size/2,size/2,0,Math.PI*2); cx.closePath(); cx.clip();
        const ir = img.naturalWidth/img.naturalHeight;
        let dw=size,dh=size,dx=0,dy=0;
        if (ir>1) { dw=size*ir; dx=(size-dw)/2; } else { dh=size/ir; dy=(size-dh)/2; }
        cx.fillStyle="#000"; cx.fillRect(0,0,size,size);
        cx.drawImage(img,dx,dy,dw,dh);
        setLogoDataUrl(c.toDataURL("image/png"));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  }

  // ===== T2V =====
  async function doT2V() {
    if (!t2vPrompt.trim()) return setErr("Prompt kosong");
    setLoading("t2v"); setError(""); setT2vResult(null); setStageText("Meminta video ke AI...");
    try {
      const r = await callApi("/video", { prompt: t2vPrompt, imageUrl: t2vImageUrl || undefined, duration: isMobile ? Math.min(t2vDuration,5) : t2vDuration, aspectRatio });
      setT2vResult(r);
      if (!r.video_url) setErr(r.error || "Model video belum tersedia.");
      setStageText("");
    } catch(e:any){ setErr(e.message); setStageText(""); }
    finally { setLoading(null); }
  }

  // =====================================================================
  //                        PREVIEW ENGINE v5
  // =====================================================================
  function stopPreview() {
    if (previewRafRef.current) { cancelAnimationFrame(previewRafRef.current); previewRafRef.current = null; }
    const audEl = previewAudioRef.current;
    if (audEl) {
      try { if (!audEl.paused) audEl.pause(); } catch {}
      if ((audEl as any)._cleanup) { try { (audEl as any)._cleanup(); } catch {} (audEl as any)._cleanup = null; }
    }
    setPreviewPlaying(false);
  }

  async function ensureImages(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const s of slidesRef.current) {
      if (imgCacheRef.current.has(s.id)) continue;
      const im = new Image(); im.crossOrigin = "anonymous";
      imgCacheRef.current.set(s.id, im);
      jobs.push(new Promise<void>((res)=>{
        im.onload = ()=>res(); im.onerror = ()=>res();
        setTimeout(()=>res(), 4000);
      }));
      im.src = s.imageUrl;
    }
    // bersihkan cache yg sudah tidak dipakai
    const ids = new Set(slidesRef.current.map(s=>s.id));
    for (const k of [...imgCacheRef.current.keys()]) if (!ids.has(k)) imgCacheRef.current.delete(k);
    await Promise.all(jobs);
  }

  // Gambar satu frame scene pada waktu video tV (detik). spectrumData opsional.
  function drawScene(tV: number, spec?: {bars:Float32Array|Uint8Array; bass:number; beat:boolean}) {
    const canvas = previewCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d", {alpha:false, desynchronized:true} as any) as CanvasRenderingContext2D | null;
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0,0,W,H);
    const tl = timelineRef.current;
    const slidesArr = slidesRef.current;
    if (!tl || !slidesArr.length) return;
    const t = Math.max(0, Math.min(tV, Math.max(0, tl.total - 0.001)));
    const L = locate(tl, t);
    const curSlide = slidesArr[L.idx];
    const nxtSlide = slidesArr[L.nextIdx];
    const curImg = curSlide ? imgCacheRef.current.get(curSlide.id) : undefined;
    const nxtImg = nxtSlide ? imgCacheRef.current.get(nxtSlide.id) : undefined;
    const optCur = curSlide ? (slideOptsRef.current[curSlide.id] || null) : null;
    const optNxt = nxtSlide ? (slideOptsRef.current[nxtSlide.id] || null) : null;
    const transId = canonicalTrans(optCur?.trans ?? transitionRef.current);
    const clipDur = L.clipDur;
    const clipT = Math.min(L.clipT, clipDur);
    const slideT = clipDur > 0 ? clipT / clipDur : 0;
    const beat = spec?.beat || false;
    paintClips(ctx, W, H, curImg || null, nxtImg || null, {
      clipT, clipDur, inTrans: L.inTrans, transT: L.transT, transId,
      optCur, optNxt,
      globalFilter: globalFilterRef.current,
      absT: t, isMobile: isMobileRef.current, beat,
      grain: adjRef.current.grain,
      kbZoom: 1 + slideT * 0.035 + (beat ? 0.006 : 0),
    });
    // vignette global
    const vStr = (adjRef.current.vig / 100) * 0.8;
    if (vStr > 0.01) {
      const vg = ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.75);
      vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,`rgba(0,0,0,${vStr.toFixed(3)})`);
      ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
    }
    // spectrum
    if (spec && vizStyleRef.current !== "none") {
      const rgbV = hexToRgbE(vizColorRef.current);
      ctx.save();
      try { drawLiveSpectrum(ctx,{ W,H,bars:spec.bars,bass:spec.bass,beat,style:vizStyleRef.current,rgb:rgbV,isMobile:isMobileRef.current,phase:t*0.5, barFill:`rgba(${rgbV[0]},${rgbV[1]},${rgbV[2]},0.95)` }); } catch(e){}
      ctx.restore();
    }
    // judul
    if (showTitleRef.current) {
      const titleText = titleTextRef.current;
      if (titleText) {
        ctx.save();
        ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="bottom";
        ctx.font=`900 ${Math.floor(H*0.045)}px system-ui,-apple-system,sans-serif`;
        ctx.shadowColor="rgba(0,0,0,0.9)"; ctx.shadowBlur=10;
        ctx.lineWidth=4; ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.lineJoin="round";
        ctx.strokeText(titleText, W/2, H-50, W*0.9);
        ctx.fillText(titleText, W/2, H-50, W*0.9);
        ctx.restore();
      }
    }
    // karaoke lirik (mengikuti klip aktif)
    if (showLyricsRef.current) {
      const line: string = (lyricLinesRef.current[L.idx] || (curSlide as any)?.lyric || "").trim();
      if (line) {
        const lt = Math.max(0, Math.min(1, slideT));
        ctx.save();
        const fs = Math.floor(H*0.055);
        ctx.font=`900 ${fs}px system-ui,-apple-system,sans-serif`;
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
        const words = line.split(/\s+/);
        const maxW = W*0.88;
        let curL="";
        const rows:string[]=[];
        words.forEach(w=>{
          const t2 = curL ? curL+" "+w : w;
          if (ctx.measureText(t2).width > maxW && curL) { rows.push(curL); curL=w; } else curL=t2;
        });
        if (curL) rows.push(curL);
        const lh = fs*1.25;
        const baseY = H*0.7;
        const fadeMul = L.inTrans ? 1 - L.transT : 1;
        ctx.globalAlpha = Math.max(0, fadeMul);
        rows.forEach((row,ri)=>{
          const y = baseY - (rows.length-1)*lh/2 + ri*lh;
          const wds = row.split(/\s+/);
          let totalW=0;
          const widths=wds.map(w=>{const m=ctx.measureText(w).width; totalW+=m; return m;});
          const sw=ctx.measureText(" ").width; totalW+=sw*(wds.length-1);
          let x=W/2-totalW/2;
          wds.forEach((w,wi)=>{
            const isActive = (wi/Math.max(1,wds.length)) <= lt;
            ctx.lineWidth=Math.max(5,fs/7); ctx.strokeStyle="rgba(0,0,0,0.9)";
            ctx.strokeText(w, x+widths[wi]/2, y);
            ctx.fillStyle = isActive ? "#fde047" : "#ffffff";
            ctx.fillText(w, x+widths[wi]/2, y);
            x+=widths[wi]+sw;
          });
        });
        ctx.restore();
      }
    }
  }

  function idleSpectrum(t: number) {
    const bars = new Float32Array(64);
    for (let i=0;i<64;i++) bars[i] = Math.max(0.06, Math.min(1, 0.28 + Math.sin(t*2+i*0.2)*0.18 + Math.sin(t*5+i*0.3)*0.13));
    return { bars, bass: 0.3 + Math.sin(t*2)*0.18, beat: Math.sin(t*2.5)>0.9 };
  }

  function seekPreview(t: number) {
    const audEl = previewAudioRef.current;
    if (audEl && isFinite(audEl.duration)) audEl.currentTime = Math.max(0, Math.min(audEl.duration, t));
    setPreviewCurrent(t);
  }

  async function togglePreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas || !slidesRef.current.length) return;
    if (previewPlaying) { stopPreview(); return; }
    const previewSrc = proxifyAudioUrl(
      (audioMode==="aimusic" && aiMusicUrl) ? aiMusicUrl :
      (audioMode==="tts" && ttsUrl) ? ttsUrl :
      (audioMode==="music" && musicUrl) ? musicUrl :
      (audioMode==="both" && (musicUrl||aiMusicUrl)) ? (aiMusicUrl||musicUrl) : ""
    );
    const audEl = previewAudioRef.current;
    if (audEl) {
      if ((audEl as any)._cleanup) { try { (audEl as any)._cleanup(); } catch {} (audEl as any)._cleanup = null; }
      audEl.muted = previewMuted; audEl.crossOrigin = "anonymous";
      const wantSrc = previewSrc || "";
      if (!wantSrc) { try { audEl.removeAttribute("src"); audEl.load(); } catch {} }
      else if (audEl.src !== wantSrc) audEl.src = wantSrc;
      try { audEl.currentTime = 0; } catch {}
      const onLoaded = () => { setPreviewDuration(isFinite(audEl.duration)?audEl.duration:0); };
      const onTime = () => { setPreviewCurrent(audEl.currentTime||0); };
      const onEnded = () => { stopPreview(); };
      const onCanPlay = () => { audEl.play().catch(()=>{}); };
      audEl.addEventListener("loadedmetadata", onLoaded);
      audEl.addEventListener("timeupdate", onTime);
      audEl.addEventListener("ended", onEnded);
      audEl.addEventListener("canplay", onCanPlay);
      (audEl as any)._cleanup = () => {
        try { audEl.removeEventListener("loadedmetadata", onLoaded); } catch {}
        try { audEl.removeEventListener("timeupdate", onTime); } catch {}
        try { audEl.removeEventListener("ended", onEnded); } catch {}
        try { audEl.removeEventListener("canplay", onCanPlay); } catch {}
      };
    }
    setStageText("Menyiapkan preview...");
    await ensureImages();
    setStageText("");
    let analyserConnected = false;
    try {
      if (!previewActxRef.current) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        previewActxRef.current = new AC();
      }
      const actx = previewActxRef.current!;
      if (actx.state === "suspended") { try { await actx.resume(); } catch {} }
      if (audEl && previewSrc && !previewAnalyserConnected.current) {
        const an = actx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.75;
        const src = actx.createMediaElementSource(audEl);
        src.connect(an); an.connect(actx.destination);
        previewAnalyserRef.current = an; previewAnalyserConnected.current = true;
      }
      if (previewAnalyserRef.current) analyserConnected = true;
    } catch (e: any) { analyserConnected = false; }
    const startT = performance.now();
    const tStart = previewCurrent < (timelineRef.current?.total||1) ? previewCurrent : 0;
    setPreviewPlaying(true);
    const total = () => Math.max(timelineRef.current?.total || 0, audEl?.duration && isFinite(audEl.duration) ? audEl.duration : 0, 1);
    const draw = () => {
      previewRafRef.current = requestAnimationFrame(draw);
      const now = performance.now();
      let t = 0;
      if (audEl && !audEl.paused && audEl.duration && isFinite(audEl.duration)) {
        t = audEl.currentTime || 0;
        if ((now - (draw as any)._lastUi || 0) > 150) { (draw as any)._lastUi = now; setPreviewCurrent(t); }
      } else {
        t = tStart + (now - startT)/1000;
        if ((now - (draw as any)._lastUi || 0) > 150) { (draw as any)._lastUi = now; setPreviewCurrent(t); }
        if (t >= (timelineRef.current?.total || 9999)) { stopPreview(); setPreviewCurrent(0); return; }
      }
      let spec: {bars:Float32Array|Uint8Array; bass:number; beat:boolean};
      const an = previewAnalyserRef.current;
      if (analyserConnected && an) {
        const SPEC_BARS = 64;
        const f8 = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(f8);
        const out = new Float32Array(SPEC_BARS);
        const stp = Math.max(1, Math.floor(f8.length/SPEC_BARS));
        let bassSum=0, bassCnt=0, maxV=0;
        for (let i=0;i<SPEC_BARS;i++){
          let s=0; for (let j=0;j<stp;j++){ const v=(f8[i*stp+j]||0)/255; s+=v; if (v>maxV) maxV=v; }
          out[i]=s/stp; if (i<8){bassSum+=out[i];bassCnt++;}
        }
        let bass = bassCnt?bassSum/bassCnt:0;
        bass = ((draw as any)._bass||0)*0.85 + bass*0.15;
        (draw as any)._bass = bass;
        spec = { bars: out, bass, beat: maxV > bass*1.4 && maxV > 0.35 };
      } else {
        spec = idleSpectrum(t);
      }
      drawScene(t, spec);
      void total;
    };
    draw();
    if (audEl && previewSrc) {
      try { const p = audEl.play(); if (p && typeof p.catch === "function") p.catch(()=>{}); } catch {}
    }
  }

  // ===== Static preview (paused) =====
  const pendingStaticFrameRef = useRef<number>(0);
  const scheduleStatic = useCallback(()=>{
    if (pendingStaticFrameRef.current) return;
    pendingStaticFrameRef.current = requestAnimationFrame(()=>{
      pendingStaticFrameRef.current = 0;
      ensureImages().then(()=>{ if (!previewPlaying) drawScene(previewCurrent, idleSpectrum(previewCurrent)); });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPlaying, previewCurrent]);
  useEffect(()=>()=>{ stopPreview(); if(pendingStaticFrameRef.current) cancelAnimationFrame(pendingStaticFrameRef.current); }, []);
  useEffect(()=>{
    if (!didInit.current) return;
    if (!previewPlaying && slides.length>0) scheduleStatic();
  });
  useEffect(()=>{ if (selectedTitle && !musicTitle) setMusicTitle(selectedTitle.text.slice(0,80));
    // eslint-disable-next-line
  }, [selectedTitleId]);

  function applyPreset(p:any) {
    setNiche(p.niche); setManualKeywords(p.kw); setKeywordMode("manual");
    setMusicGenre(p.genre); setMusicMood(p.mood); setSelectedPreset(p.id);
  }

  // ===== Stiker drag on stage =====
  const activeStkRef = useRef<{slideId:string; stkId:string}|null>(null);
  function stickerDown(x:number, y:number, aspect: number): boolean {
    const sel = selIdRef.current; if (!sel) return false;
    const stk = slideOptsRef.current[sel]?.stickers;
    if (!stk || !stk.length) return false;
    let best = -1, bd = 0.1;
    stk.forEach((s, i) => {
      const d = Math.hypot((s.x - x), (s.y - y) * aspect);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return false;
    activeStkRef.current = { slideId: sel, stkId: stk[best].id };
    pushHistory(`stk:${sel}`);
    return true;
  }
  function stickerMove(x:number, y:number) {
    const a = activeStkRef.current; if (!a) return;
    const nx = Math.max(0.02, Math.min(0.98, x));
    const ny = Math.max(0.04, Math.min(0.96, y));
    setSlideOptsById(cur => {
      const o = cur[a.slideId]; if (!o?.stickers) return cur;
      return { ...cur, [a.slideId]: { ...o, stickers: o.stickers.map(s => s.id===a.stkId ? {...s, x:nx, y:ny} : s) } };
    });
  }
  function stickerUp() { activeStkRef.current = null; }

  // ===== Stiker add/update =====
  function addSticker(id: string, emoji: string) {
    pushHistory(`addstk:${id}`);
    setSlideOptsById(cur => {
      const o = cur[id] || {};
      const list = [...(o.stickers||[])];
      list.push({ id: `stk_${Date.now()}_${list.length}`, emoji, x:0.5, y:0.35, size:0.11, rot:0 });
      return { ...cur, [id]: { ...o, stickers: list } };
    });
  }
  function updSticker(slideId:string, stkId:string, patch: Partial<{x:number;y:number;size:number;rot:number}>) {
    setSlideOptsById(cur => {
      const o = cur[slideId]; if (!o?.stickers) return cur;
      return { ...cur, [slideId]: { ...o, stickers: o.stickers.map(s=>s.id===stkId?{...s,...patch}:s) } };
    });
  }
  function delSticker(slideId:string, stkId:string) {
    pushHistory(`delstk:${slideId}`);
    setSlideOptsById(cur => {
      const o = cur[slideId]; if (!o?.stickers) return cur;
      return { ...cur, [slideId]: { ...o, stickers: o.stickers.filter(s=>s.id!==stkId) } };
    });
  }
  function applyTransAll(tid: string) {
    pushHistory("transall");
    setTransition(tid);
    setSlideOptsById(cur => {
      const c2: Record<string, SlideOpt> = {};
      for (const k of Object.keys(cur)) c2[k] = { ...cur[k], trans: tid };
      return c2;
    });
    setSlides(cur => {
      const c2: Record<string, SlideOpt> = {};
      setSlideOptsById(prev => {
        const nx = {...prev};
        cur.forEach(s=>{ nx[s.id] = {...(nx[s.id]||{}), trans: tid}; });
        return nx;
      });
      return cur;
    });
  }

  // ===== Derived (labels) =====
  const totalShown = Math.max(clipsTotal, previewDuration || 0, 1);
  const audioLabel =
    audioMode==="tts" ? (ttsUrl?"🔊 Narasi TTS siap":"🔊 TTS (belum dibuat)") :
    audioMode==="music" ? (musicUrl?"🎵 Musik upload":"🎵 Musik (belum diupload)") :
    audioMode==="both" ? "🎶 TTS + Musik" :
    audioMode==="aimusic" ? (aiMusicUrl?`🎼 ${musicGeneratedFrom||"Lagu AI"}`:"🎼 AI Music (belum digenerate)") :
    "🔇 Tanpa audio";

  // =========================================================================
  //  API-ref stabil untuk komponen memo (anti re-render berlebih)
  // =========================================================================
  const apiRef = useRef<any>({});
  Object.assign(apiRef.current, {
    openTool, openToolWithSel, setTool, setShowApiKeyModal, loadDraftsList, setShowDraftPicker, saveDraftManually,
    doGenerateKeywords, doGenerateTitles, doGenerateImages, handleUploadImages,
    doGenerateStoryboard, doGenerateImagesFromStory, doGenerateTTS, doAutoScript,
    doGenerateLyrics, doGenerateAIMusic, doCheckAiMusicStatus,
    handleUploadMusic, applyPreset, doT2V, doRender, downloadVideo, copyField, downloadMetaText,
    togglePreview, stopPreview, seekPreview, moveSlide, duplicateSlide, removeSlide, splitSlide,
    setPreviewMuted, handleLogoUpload, setNiche, setNKeywords, setKeywordMode, setManualKeywords,
    setKeywords, setTitlesPerKw, setSelectedTitleId, setTitles, setImageSource, setImageStyle,
    setAspectRatio, setNSlides, setSlides, setLyricLines, setAudioMode, setTtsVoice, setTtsText,
    setVizStyle, setVizColor, setSlideDuration, setTransitionDur, setTransition, setShowTitle,
    setShowLyrics, setCaptionStyle, setLogoPosition, setLogoDataUrl, setMusicTitle, setMusicLyrics,
    setMusicStylePrompt, setMusicModel, setMusicVocalType, setMusicVocalGender, setMusicGenre,
    setMusicMood, setMusicEra, setMusicInstruments, setMusicTempo, setFilterPreset, setAdj,
    setSpectrumSticker, setQuality, setT2vPrompt, setT2vImageUrl, setT2vDuration, setError,
    startNewDraft, loadDraft, deleteDraft, undo, redo, setSelId, setOpt, setClipText,
    addSticker, updSticker, delSticker, applyTransAll, pushHistory,
    stickerDown, stickerMove, stickerUp,
  });
  const api = apiRef.current;

  // =========================================================================
  //                                  JSX
  // =========================================================================
  return (
    <main className="cc3-root">
      {/* ========== TOPBAR ========== */}
      <header className="cc3-topbar">
        <div className="cc3-logo"><span className="cc3-logo-mark">▶</span><span className="cc3-logo-tx">VERVE</span></div>
        <div className="cc3-projname" title={selectedTitle?.text || niche || "Proyek Tanpa Judul"}>
          {selectedTitle?.text || niche || "Proyek Tanpa Judul"}
        </div>
        <div className="cc3-topact">
          <button className="cc3-tic" onClick={undo} disabled={!canUndo} title="Undo">↶</button>
          <button className="cc3-tic" onClick={redo} disabled={!canRedo} title="Redo">↷</button>
          <button className="cc3-tic" onClick={()=>setShowApiKeyModal(true)} title="API Key">🔑</button>
          <button className="cc3-tic" onClick={()=>{loadDraftsList();setShowDraftPicker(true);}} title="Draft">
            📂{draftList.length>0 && <i className="cc3-dot">{draftList.length}</i>}
          </button>
          <button className="cc3-tic" onClick={()=>saveDraftManually()} title="Simpan">💾</button>
          <button className="cc3-export" onClick={()=>openTool("ekspor")}>Export</button>
        </div>
      </header>

      {/* ========== STAGE ========== */}
      <StageStage
        aspectRatio={aspectRatio}
        hasSlides={slides.length>0}
        slideCount={slides.length}
        playing={previewPlaying}
        rendering={loading==="render"}
        progress={progress}
        error={error}
        stageText={stageText}
        canvasRef={previewCanvasRef}
        api={api}
      />

      {/* ========== TRANSPORT ========== */}
      <Transport
        playing={previewPlaying}
        current={previewCurrent}
        max={totalShown}
        muted={previewMuted}
        showTitle={showTitle}
        showLyrics={showLyrics}
        api={api}
      />

      {/* ========== TIMELINE ========== */}
      <TimelinePro
        slides={slides}
        slideOptsById={slideOptsById}
        timeline={timeline}
        current={previewCurrent}
        total={totalShown}
        selId={selId}
        transition={transition}
        transitionDur={transitionDur}
        audioLabel={audioLabel}
        audioOn={audioMode!=="none"}
        api={api}
        isMobile={isMobile}
      />

      {/* ========== SHEET + TOOLBAR ========== */}
      <div className="cc3-bottom">
        <ToolSheet
          tool={tool} api={api} isMobile={isMobile}
          niche={niche} keywords={keywords} titles={titles} selectedTitle={selectedTitle} selectedTitleId={selectedTitleId}
          titlesPerKw={titlesPerKw} nKeywords={nKeywords} keywordMode={keywordMode} manualKeywords={manualKeywords}
          selectedPreset={selectedPreset} loading={loading} stageText={stageText} error={error}
          imageSource={imageSource} imageStyle={imageStyle} aspectRatio={aspectRatio} nSlides={nSlides}
          slides={slides} lyricLines={lyricLines} storyboard={storyboard}
          audioMode={audioMode} ttsVoice={ttsVoice} ttsText={ttsText} ttsUrl={ttsUrl} musicUrl={musicUrl}
          musicTitle={musicTitle} musicLyrics={musicLyrics} musicStylePrompt={musicStylePrompt}
          musicModel={musicModel} musicVocalType={musicVocalType} musicVocalGender={musicVocalGender}
          aiMusicUrl={aiMusicUrl} aiMusicStatus={aiMusicStatus} aiMusicTaskId={aiMusicTaskId}
          aiMusicPolling={aiMusicPolling} musicGeneratedFrom={musicGeneratedFrom}
          sunoApiKey={sunoApiKey} sunoProvider={sunoProvider} sunoCredits={sunoCredits}
          vizStyle={vizStyle} vizColor={vizColor} spectrumSticker={spectrumSticker}
          showTitle={showTitle} showLyrics={showLyrics} captionStyle={captionStyle}
          filterPreset={filterPreset} adj={adj}
          slideDuration={slideDuration} transitionDur={transitionDur} transition={transition}
          quality={quality} logoDataUrl={logoDataUrl} logoPosition={logoPosition}
          t2vPrompt={t2vPrompt} t2vImageUrl={t2vImageUrl} t2vDuration={t2vDuration} t2vResult={t2vResult}
          videoUrl={videoUrl} videoBlob={videoBlob} progress={progress} renderETA={renderETA}
          meta={meta} copiedField={copiedField}
          selId={selId} selIndex={selIndex} selOpt={selOpt}
          aiMusicStart={aiMusicStart}
        />
        <nav className="cc3-bar">
          {selId ? (
            <>
              {CLIP_TOOLS.map(t=>(
                <button key={t.id} className={`cc3-tool ${tool===t.id?"active":""}`}
                  onClick={()=>{
                    if (t.id==="back") { setSelId(""); return; }
                    if (t.id==="split") { splitSlide(selId); return; }
                    if (t.id==="dup") { duplicateSlide(selId); return; }
                    if (t.id==="del") { removeSlide(selId); return; }
                    openToolWithSel(t.id as ToolId);
                  }}>
                  <span className="cc3-tool-ic">{t.icon}</span><span className="cc3-tool-lb">{t.label}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              {GLOBAL_TOOLS.map(t=>(
                <button key={t.id} className={`cc3-tool ${tool===t.id?"active":""}`}
                  onClick={()=> (t.id==="teks"||t.id==="stiker"||t.id==="efek") ? openToolWithSel(t.id) : openTool(t.id)}>
                  <span className="cc3-tool-ic">{t.icon}</span><span className="cc3-tool-lb">{t.label}</span>
                </button>
              ))}
            </>
          )}
        </nav>
      </div>

      {/* Audio global */}
      <audio ref={previewAudioRef} preload="metadata" playsInline crossOrigin="anonymous" className="hidden" />

      <ApiKeyModal open={showApiKeyModal} onClose={()=>setShowApiKeyModal(false)} onSave={saveSunoKey} currentKey={sunoApiKey} currentProvider={sunoProvider} />

      {/* DRAFT PICKER */}
      {showDraftPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={()=>setShowDraftPicker(false)}>
          <div className="w-full max-w-md bg-gradient-to-b from-[#17181d] to-[#101014] rounded-2xl border border-white/15 shadow-2xl max-h-[85vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-black">📂 Draft Tersimpan</h3>
              <button onClick={()=>setShowDraftPicker(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-lg">×</button>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto">
              <button onClick={startNewDraft} className="w-full p-3 rounded-xl border-2 border-dashed border-teal-400/40 hover:border-teal-300 hover:bg-teal-400/10 text-teal-200 text-sm font-bold">➕ Mulai Project Baru</button>
              <button onClick={()=>saveDraftManually()} className="w-full p-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold">💾 Simpan Project Sekarang</button>
              <div className="text-[10px] text-white/50 pt-2">💡 Auto-save 30 detik. Max {MAX_DRAFTS} draft.</div>
              <div className="pt-2 border-t border-white/10 space-y-2">
                {draftList.length===0 ? (
                  <div className="text-center text-white/40 text-xs py-8">Belum ada draft.</div>
                ) : draftList.map(d=>(
                  <div key={d.id} className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {d.thumb && d.thumb.length>100 ? <img src={d.thumb} className="w-full h-full object-cover" alt=""/> : <span className="text-lg">🎞️</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{d.title}</div>
                      <div className="text-[10px] text-white/50 flex gap-2 flex-wrap">
                        <span>🖼️ {d.slides||0} slide</span>
                        <span>🕒 {d.updatedAt?new Date(d.updatedAt).toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={()=>loadDraft(d.id)} className="px-3 py-1.5 rounded-lg bg-teal-500/25 hover:bg-teal-500/40 text-teal-200 text-xs font-bold">Buka</button>
                      <button onClick={()=>deleteDraft(d.id)} className="px-3 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[10px]">Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ============================== STAGE ============================== */
const StageStage = memo(function StageStage(p:any) {
  const { aspectRatio, hasSlides, playing, rendering, progress, error, stageText, canvasRef, api } = p;
  const hostRef = useRef<HTMLDivElement|null>(null);
  const [box, setBox] = useState<{w:number;h:number}>({w:0,h:0});
  const dragRef = useRef<{grabbed:boolean; moved:boolean; x0:number; y0:number}|null>(null);
  const ar = aspectRatio==="9:16" ? 9/16 : aspectRatio==="1:1" ? 1 : 16/9;

  useEffect(()=>{
    const host = hostRef.current; if (!host) return;
    const fit = ()=>{
      const r = host.getBoundingClientRect();
      const pad = 0;
      let w = r.width - pad, h = r.height - pad;
      if (w/h > ar) w = h*ar; else h = w/ar;
      setBox({w: Math.max(10, Math.floor(w)), h: Math.max(10, Math.floor(h))});
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return ()=>ro.disconnect();
  }, [ar]);

  function relPos(e: {clientX:number; clientY:number}): {x:number;y:number}|null {
    const cv = hostRef.current?.querySelector("canvas");
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left)/r.width, y: (e.clientY - r.top)/r.height };
  }
  function onDown(e: React.PointerEvent) {
    const pos = relPos(e);
    dragRef.current = { grabbed:false, moved:false, x0:e.clientX, y0:e.clientY };
    if (pos) dragRef.current.grabbed = api.stickerDown(pos.x, pos.y, ar);
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (Math.hypot(e.clientX-d.x0, e.clientY-d.y0) > 6) d.moved = true;
    if (d.grabbed) {
      const pos = relPos(e);
      if (pos) api.stickerMove(pos.x, pos.y);
    }
  }
  function onUp() {
    const d = dragRef.current;
    if (d?.grabbed) api.stickerUp();
    if (d && !d.moved && !d.grabbed) api.togglePreview();
    dragRef.current = null;
  }

  return (
    <section className="cc3-stage">
      <div ref={hostRef} className="cc3-stage-host">
        <div className="cc3-frame" style={{ width: box.w||undefined, height: box.h||undefined }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <canvas ref={canvasRef}
            width={aspectRatio==="9:16"?480:aspectRatio==="1:1"?480:854}
            height={aspectRatio==="9:16"?854:aspectRatio==="1:1"?480:480}
            className="w-full h-full block" style={{background:"#000"}}/>
          {!hasSlides && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40 text-xs text-center px-4 pointer-events-none">
              <span className="text-4xl opacity-50">🎬</span>
              <span>Preview muncul di sini.<br/>Buka <b>🖼️ Media</b> di toolbar bawah buat isi gambar.</span>
            </div>
          )}
          {hasSlides && !playing && !rendering && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/55 border border-white/25 backdrop-blur flex items-center justify-center text-white text-xl">▶</div>
            </div>
          )}
          {rendering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
              <Spinner/>
              <div className="text-xs mt-2 text-white/85">{Math.round(progress*100)}% — sedang render…</div>
            </div>
          )}
        </div>
      </div>
      {(error || stageText) && (
        <div className="cc3-floatmsg">
          {error && <div className="cc2-banner cc2-banner-err"><span className="flex-1">⚠️ {error}</span><button onClick={()=>api.setError("")} className="cc2-banner-x">×</button></div>}
          {stageText && <div className="cc2-banner cc2-banner-info"><Spinner/><span>{stageText}</span></div>}
        </div>
      )}
    </section>
  );
});

/* ============================== TRANSPORT ============================== */
const Transport = memo(function Transport(p:any) {
  const { playing, current, max, muted, showTitle, showLyrics, api } = p;
  return (
    <div className="cc3-transport">
      <button className="cc3-tp" onClick={()=>api.seekPreview(Math.max(0,current-1))}>⏮</button>
      <button className="cc3-tp cc3-tp-play" onClick={()=>api.togglePreview()}>{playing?"⏸":"▶"}</button>
      <button className="cc3-tp" onClick={()=>api.seekPreview(Math.min(max,current+1))}>⏭</button>
      <span className="cc3-tp-time"><b>{formatDur(current)}</b> / {formatDur(max)}</span>
      <input type="range" min={0} max={Math.max(0.1,max)} step={0.05} value={Math.min(current,max)}
             onChange={e=>api.seekPreview(Number(e.target.value))} className="cc3-tp-seek"/>
      <button className="cc3-tp" onClick={()=>{
        api.setPreviewMuted((m:boolean)=>{const nm=!m; const a=document.querySelector("audio"); if(a)a.muted=nm; return nm;});
      }}>{muted?"🔇":"🔊"}</button>
      <button className={`cc3-tp-mini ${showTitle?"on":""}`} onClick={()=>api.setShowTitle((v:boolean)=>!v)} title="Judul">🏷️</button>
      <button className={`cc3-tp-mini ${showLyrics?"on":""}`} onClick={()=>api.setShowLyrics((v:boolean)=>!v)} title="Lirik">🎤</button>
    </div>
  );
});

/* ============================== TIMELINE PRO ============================== */
const TimelinePro = memo(function TimelinePro(p:any) {
  const { slides, slideOptsById, timeline, current, total, selId, transition, transitionDur, audioLabel, audioOn, api, isMobile } = p;
  const px = isMobile ? 20 : 26; // px per detik
  const rowRef = useRef<HTMLDivElement|null>(null);
  const [dragI, setDragI] = useState(-1);
  const [resizing, setResizing] = useState<{i:number; dur:number}|null>(null);
  const dragRef = useRef<{from:number; startX:number; to:number; moved:boolean}|null>(null);
  const durationOf = (i:number) => timeline?.durs?.[i] ?? 0;

  const totalPx = Math.max(1, (timeline?.total || 1) * px) + 44;
  const playX = Math.min(totalPx - 20, Math.max(0, current * px));

  function onResizeDown(e:React.PointerEvent, i:number) {
    e.stopPropagation();
    const id = slides[i]?.id; if (!id) return;
    const origDur = slideOptsById[id]?.dur ?? (timeline?.durs?.[i] || 3);
    const x0 = e.clientX;
    api.pushHistory(`resize:${id}`);
    let last = origDur;
    const move = (ev:PointerEvent)=>{
      const nd = Math.max(0.5, Math.min(30, origDur + (ev.clientX - x0)/px));
      last = nd;
      setResizing({i, dur: nd});
      api.setOpt(id, { dur: Math.round(nd*20)/20 }, "");
    };
    const up = ()=>{
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      api.setOpt(id, { dur: Math.round(last*20)/20 }, "");
      setResizing(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function onClipDown(e:React.PointerEvent, i:number) {
    const id = slides[i]?.id; if (!id) return;
    const x0 = e.clientX;
    dragRef.current = { from:i, startX:x0, to:i, moved:false };
    const move = (ev:PointerEvent)=>{
      const d = dragRef.current; if (!d) return;
      if (!d.moved && Math.abs(ev.clientX - x0) > 7) { d.moved = true; setDragI(i); }
      if (d.moved) {
        const row = rowRef.current; if (!row) return;
        const kids = [...row.querySelectorAll<HTMLElement>(".cc3-clip")];
        for (let k=0;k<kids.length;k++){
          const r = kids[k].getBoundingClientRect();
          if (ev.clientX < r.left + r.width/2) { d.to = k; break; }
          d.to = k;
        }
        setDragI(d.from);
      }
    };
    const up = ()=>{
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = dragRef.current;
      if (d && d.moved) api.moveSlide(d.from, d.to);
      else { api.setSelId(id); api.seekPreview((timeline?.starts?.[i] ?? 0) + 0.01); }
      dragRef.current = null; setDragI(-1);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="cc3-tl">
      {selId && slides.some((s:Slide)=>s.id===selId) ? (
        <div className="cc3-tl-ctx">
          <span className="cc3-tl-badge">🎞️ Klip {slides.findIndex((s:Slide)=>s.id===selId)+1}</span>
          {resizing ? <span className="cc3-tl-badge teal">⏱ {resizing.dur.toFixed(1)}d</span> : null}
          <span className="flex-1"/>
          <button className="cc3-tl-tool" onClick={()=>api.setSelId("")}>✕ Tutup seleksi</button>
        </div>
      ) : (
        <div className="cc3-tl-ctx dim">
          <span className="cc3-tl-hint">👆 Tap klip untuk pilih · seret untuk susun · tarik ▮ ujung klip untuk ubah durasi · tap 🔀 untuk transisi</span>
        </div>
      )}
      <div className="cc3-tl-scroll" onClick={(e)=>{
        if ((e.target as HTMLElement).closest(".cc3-clip,.cc3-tchip")) return;
        const el = e.currentTarget.querySelector(".cc3-tl-canvas") as HTMLElement; if (!el) return;
        const r = el.getBoundingClientRect();
        api.seekPreview(Math.max(0, Math.min(total, (e.clientX - r.left)/px)));
      }}>
        <div className="cc3-tl-canvas" style={{ width: totalPx }}>
          <div className="cc3-tl-playhead" style={{ left: playX }}/>
          <div className="cc3-tl-row" ref={rowRef}>
            {slides.map((s:Slide, i:number)=>{
              const st = timeline?.starts?.[i] ?? 0;
              const d = durationOf(i);
              const tdur = timeline?.tdurs?.[i] ?? 0;
              const tid = canonicalTrans(slideOptsById[s.id]?.trans ?? transition);
              const tdef = TRANSITIONS.find(x=>x.id===tid);
              const opt = slideOptsById[s.id] || {};
              const isSel = selId === s.id;
              return (
                <div key={s.id}>
                  <div className={`cc3-clip ${isSel?"sel":""} ${dragI===i?"drag":""}`}
                       style={{ left: st*px, width: Math.max(18, d*px - 2) }}
                       onPointerDown={(e)=>onClipDown(e,i)}>
                    <img src={s.imageUrl} alt="" draggable={false}/>
                    <span className="cc3-clip-n">{i+1}</span>
                    <span className="cc3-clip-d">{(resizing && resizing.i===i ? resizing.dur : d).toFixed(1)}d</span>
                    {(opt.text?.txt || opt.stickers?.length || opt.effect || opt.animIn || opt.animOut) ? (
                      <span className="cc3-clip-tags">
                        {opt.animIn||opt.animOut ? "🎬" : ""}{opt.effect ? "🎭" : ""}{opt.text?.txt ? "🔤" : ""}{opt.stickers?.length ? "😀" : ""}
                      </span>
                    ) : null}
                    {isSel && <div className="cc3-h" onPointerDown={(e)=>onResizeDown(e,i)}><i/></div>}
                  </div>
                  {i < slides.length-1 && (
                    <button className="cc3-tchip" style={{ left: (st + d + tdur/2)*px }}
                      title={`Transisi: ${tdef?.label||tid}`}
                      onPointerDown={e=>e.stopPropagation()}
                      onClick={(e)=>{ e.stopPropagation(); api.setSelId(s.id); api.openTool("transisi"); }}>
                      {tdef && tid!=="dissolve" ? tdef.emoji : "🔀"}
                    </button>
                  )}
                </div>
              );
            })}
            <label className="cc3-clip cc3-clip-add" style={{ left: ((timeline?.total||0)*px) + 4 }}>
              ＋<input type="file" accept="image/*" multiple hidden onChange={e=>api.handleUploadImages(e.target.files)}/>
            </label>
          </div>
          <div className="cc3-tl-row audio">
            <div className={`cc3-clip cc3-clip-a ${audioOn?"":"dim"}`}
                 style={{ left:0, width: Math.max(60, (total*px) - 4) }}
                 onPointerDown={(e)=>{e.stopPropagation(); api.openTool("audio");}}>
              <span className="cc3-clip-tx">{audioLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* ============================== TOOL SHEET ============================== */
const SHEET_TITLES: Record<string, [string,string]> = {
  ai:["✨","AI — Ide, Judul, Storyboard"], media:["🖼️","Media — Gambar"], audio:["🎧","Audio — Musik & Narasi"],
  lirik:["🎤","Lirik & Caption"], teks:["🔤","Teks Klip"], stiker:["😀","Stiker"], efek:["🎭","Efek & Visualizer"],
  filter:["🎨","Filter"], adjust:["🎛️","Adjust"], animasi:["🎬","Animasi Klip"], speed:["⚡","Speed & Durasi"],
  transisi:["🔀","Transisi"], format:["🖼️","Format & Kualitas"], ekspor:["🚀","Ekspor"],
};
const ToolSheet = memo(function ToolSheet(p:any) {
  const { tool, api } = p;
  if (!tool) return null;
  const tt = SHEET_TITLES[tool] || ["🛠️", tool];
  return (
    <div className="cc3-sheet">
      <div className="cc3-sheet-head">
        <span className="cc3-sheet-title">{tt[0]} {tt[1]}</span>
        <button className="cc3-sheet-x" onClick={()=>api.setTool(null)}>✕</button>
      </div>
      <div className="cc3-sheet-body">
        {tool==="ai"       && <SheetAI p={p}/>}
        {tool==="media"    && <SheetMedia p={p}/>}
        {tool==="audio"    && <SheetAudio p={p}/>}
        {tool==="lirik"    && <SheetLirik p={p}/>}
        {tool==="teks"     && <SheetTeks p={p}/>}
        {tool==="stiker"   && <SheetStiker p={p}/>}
        {tool==="efek"     && <SheetEfek p={p}/>}
        {tool==="filter"   && <SheetFilter p={p}/>}
        {tool==="adjust"   && <SheetAdjust p={p}/>}
        {tool==="animasi"  && <SheetAnimasi p={p}/>}
        {tool==="speed"    && <SheetSpeed p={p}/>}
        {tool==="transisi" && <SheetTransisi p={p}/>}
        {tool==="format"   && <SheetFormat p={p}/>}
        {tool==="ekspor"   && <SheetEkspor p={p}/>}
      </div>
    </div>
  );
});

function Sec({title,children}:{title:string;children:React.ReactNode}) {
  return <div className="cc2-sec"><div className="cc2-sec-t">{title}</div><div className="cc2-sec-b">{children}</div></div>;
}
function Row({children}:{children:React.ReactNode}) { return <div className="cc2-row">{children}</div>; }
function ClipHint({p}:{p:any}) {
  if (p.selId) return null;
  return (
    <div className="cc3-hint">
      Pilih klip dulu di timeline (tap thumbnail-nya).<br/>
      {p.slides.length>0 ? (
        <div className="cc3-hint-row">
          {p.slides.map((s:Slide,i:number)=>(
            <button key={s.id} className="cc3-hint-clip" onClick={()=>p.api.setSelId(s.id)}>
              <img src={s.imageUrl} alt=""/><span>{i+1}</span>
            </button>
          ))}
        </div>
      ) : <span className="text-white/50">Belum ada klip — isi gambar dulu di 🖼️ Media.</span>}
    </div>
  );
}

function SheetAI({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🎯 1 · Ide &amp; Keyword">
      <div className="cc2-chips">
        {NICHE_PRESETS.map(x=>(
          <button key={x.id} onClick={()=>api.applyPreset(x)} className={`chip ${p.selectedPreset===x.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}>{x.ti}</button>
        ))}
      </div>
      <input className="input" value={p.niche} onChange={e=>api.setNiche(e.target.value)} placeholder="Niche / topik channel (cth: cerita menyentuh ibu)"/>
      <Row>
        <select className="select" value={p.keywordMode} onChange={e=>api.setKeywordMode(e.target.value)}>
          <option value="ai">🤖 Keyword AI</option><option value="manual">✍️ Manual</option>
        </select>
        <input type="number" className="input" value={p.nKeywords} min={1} max={10} onChange={e=>api.setNKeywords(Number(e.target.value))}/>
      </Row>
      {p.keywordMode==="manual" && (
        <input className="input" value={p.manualKeywords} onChange={e=>api.setManualKeywords(e.target.value)} placeholder="keyword1, keyword2, ..."/>
      )}
      <button className="btn btn-primary w-full" onClick={api.doGenerateKeywords} disabled={!!p.loading}>
        {p.loading==="/keywords"?<Spinner/>:"🔑"} Generate Keyword
      </button>
      {p.keywords.length>0 && (
        <div className="cc2-chips">
          {p.keywords.map((k:KeywordItem)=>(
            <span key={k.id} className="chip"><span className="truncate max-w-[40vw]">{k.text}</span>
              <button className="ml-1 text-red-300" onClick={()=>api.setKeywords(p.keywords.filter((x:KeywordItem)=>x.id!==k.id))}>×</button></span>
          ))}
        </div>
      )}
    </Sec>
    <Sec title="📝 2 · Judul High-CTR">
      <Row>
        <span className="cc2-mini-lbl">Judul/keyword</span>
        <input type="number" className="input" value={p.titlesPerKw} min={1} max={3} onChange={e=>api.setTitlesPerKw(Number(e.target.value))}/>
        <button className="btn btn-primary flex-1" onClick={api.doGenerateTitles} disabled={!!p.loading}>
          {p.loading==="/titles"?<Spinner/>:"📝"} Generate
        </button>
      </Row>
      {p.titles.length>0 && (
        <div className="cc2-tlist">
          {p.titles.map((t:TitleItem)=>(
            <label key={t.id} className={`cc2-titem ${p.selectedTitleId===t.id?"on":""}`}>
              <input type="radio" name="title" checked={p.selectedTitleId===t.id} onChange={()=>api.setSelectedTitleId(t.id)} className="accent-teal-400"/>
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold leading-snug break-word">{t.text}</span>
              <span className="block text-[10px] text-white/45 truncate">#{t.keyword}</span></span>
            </label>
          ))}
        </div>
      )}
    </Sec>
    <Sec title="🎬 Storyboard AI (auto cerita + lirik per slide)">
      <Row>
        <button className="btn btn-primary flex-1 text-xs" onClick={api.doGenerateStoryboard} disabled={!!p.loading || !p.selectedTitle}>
          {p.loading==="storyboard"?<Spinner/>:"✨"} Buat Storyboard
        </button>
        {p.storyboard && (
          <button className="btn btn-ok flex-1 text-xs" onClick={api.doGenerateImagesFromStory} disabled={!!p.loading}>
            {p.loading==="img-story"?<Spinner/>:"🎨"} Gambar per Adegan
          </button>
        )}
      </Row>
    </Sec>
    <Sec title="🎥 Text→Video AI (beta)">
      <textarea className="textarea" rows={3} value={p.t2vPrompt} onChange={e=>api.setT2vPrompt(e.target.value)}
        placeholder="Cinematic slow motion of a lonely wolf in a snowy forest, golden hour, 4k"/>
      <Row>
        <input type="number" className="input" min={2} max={p.isMobile?5:10} value={p.t2vDuration} onChange={e=>api.setT2vDuration(Number(e.target.value))}/>
        <input type="url" className="input flex-1" value={p.t2vImageUrl} onChange={e=>api.setT2vImageUrl(e.target.value)} placeholder="image url (opsional)"/>
      </Row>
      <button className="btn btn-primary w-full" onClick={api.doT2V} disabled={!!p.loading}>
        {p.loading==="t2v"?<Spinner/>:"🎬"} Generate Video
      </button>
      {p.t2vResult && (
        <div className="text-xs mt-1">
          Status: <b>{p.t2vResult.status}</b>
          {p.t2vResult.video_url && (<>
            <video controls src={p.t2vResult.video_url} className="w-full rounded-xl mt-2"/>
            <a className="btn btn-primary w-full mt-2 text-center block" href={p.t2vResult.video_url} target="_blank" rel="noreferrer" download>💾 Download</a>
          </>)}
        </div>
      )}
    </Sec>
  </>);
}

function SheetMedia({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🖼️ Sumber gambar">
      <Row>
        <select className="select" value={p.imageSource} onChange={e=>api.setImageSource(e.target.value)}>
          <option value="ai">🤖 AI Generate</option><option value="upload">📁 Upload</option><option value="both">🔄 Campur</option>
        </select>
        <select className="select" value={p.aspectRatio} onChange={e=>api.setAspectRatio(e.target.value)}>
          {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Row>
      <Row>
        <span className="cc2-mini-lbl">Jumlah slide</span>
        <input type="number" className="input" value={p.nSlides} min={1} max={12} onChange={e=>api.setNSlides(Number(e.target.value))}/>
      </Row>
      <div className="cc2-stylegrid">
        {IMAGE_STYLE_PRESETS.map(s=>(
          <button key={s.id} onClick={()=>api.setImageStyle(s.id)} className={`cc2-scard ${p.imageStyle===s.id?"on":""}`}>
            <b>{s.label}</b><span>{s.desc}</span>
          </button>
        ))}
      </div>
      <Row>
        {p.imageSource!=="upload" && (
          <button className="btn btn-primary flex-1" onClick={api.doGenerateImages} disabled={!!p.loading || !p.selectedTitle}>
            {p.loading==="/image"?<Spinner/>:"🎨"} Generate
          </button>
        )}
        {(p.imageSource==="upload"||p.imageSource==="both") && (
          <label className="btn btn-ghost flex-1 text-center cursor-pointer">📁 Upload
            <input type="file" accept="image/*" multiple hidden onChange={e=>api.handleUploadImages(e.target.files)}/>
          </label>
        )}
        {p.slides.length>0 && <button className="btn btn-danger" onClick={()=>{api.pushHistory("clear");api.setSlides([]);api.setLyricLines([]);}}>🗑️</button>}
      </Row>
      {!p.selectedTitle && <div className="cc2-note">💡 Pilih judul dulu di sheet ✨AI.</div>}
    </Sec>
    {p.slides.length>0 && (
      <Sec title={`Slide aktif (${p.slides.length}) — kelola di timeline`}>
        <div className="cc2-mediastrip">
          {p.slides.map((s:Slide,i:number)=>(
            <div key={s.id} className="cc2-mthumb">
              <img src={s.imageUrl} alt=""/>
              <span>{i+1}</span>
              <button onClick={()=>api.removeSlide(s.id)}>×</button>
            </div>
          ))}
        </div>
      </Sec>
    )}
  </>);
}

function SheetAudio({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="Mode audio">
      <div className="cc2-chips">
        {([["tts","🔊 TTS"],["music","🎵 Musik"],["both","🎶 TTS+Musik"],["aimusic","🎼 AI Music"],["none","🔇 Mute"]] as const).map(([v,l])=>(
          <button key={v} onClick={()=>api.setAudioMode(v)} className={`chip ${p.audioMode===v?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}>{l}</button>
        ))}
      </div>
    </Sec>
    {(p.audioMode==="aimusic"||p.audioMode==="both") && (
      <Sec title="🎼 AI Music · CREATE (Suno)">
        <Row>
          <select className="select flex-1" value={p.musicModel} onChange={e=>api.setMusicModel(e.target.value)}>
            {MUSIC_MODELS.map(m=><option key={m.id} value={m.id}>{m.label} · {m.credit}{m.badge?` · ${m.badge}`:""}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={()=>api.setShowApiKeyModal(true)}>🔑 {p.sunoApiKey?"✓":"Set Key"}</button>
        </Row>
        <div className="cc2-note">⚡ V3.5 paling cepat · 💎 V5.5 kualitas terbaik tapi paling lama (bisa 3–6 mnt)</div>
        <Row>
          <button onClick={()=>api.setMusicVocalType("vocal")} className={`btn btn-sm flex-1 ${p.musicVocalType==="vocal"?"btn-primary":"btn-ghost"}`}>🎤 Vokal</button>
          <button onClick={()=>api.setMusicVocalType("instrumental")} className={`btn btn-sm flex-1 ${p.musicVocalType==="instrumental"?"btn-primary":"btn-ghost"}`}>🎹 Instr</button>
          <select className="select" value={p.musicVocalGender} onChange={e=>api.setMusicVocalGender(e.target.value)} disabled={p.musicVocalType==="instrumental"}>
            <option value="auto">🔀 Auto</option><option value="male">♂ Pria</option><option value="female">♀ Wanita</option>
          </select>
        </Row>
        <div className="cc2-chips">
          {MUSIC_PRESET_CHIPS.map((x,i)=>(
            <button key={i} onClick={()=>{api.setMusicGenre(x.g);api.setMusicTempo(x.t);api.setMusicEra(x.e);api.setMusicInstruments(x.i);api.setMusicMood(x.m);}}
              className="chip">{x.g}</button>
          ))}
        </div>
        <label className="block">
          <span className="lbl">Title <span className="float-right text-white/40">{p.musicTitle.length}/80</span></span>
          <input className="input" value={p.musicTitle} onChange={e=>api.setMusicTitle(e.target.value.slice(0,80))} placeholder="Judul lagu"/>
        </label>
        <label className="block">
          <span className="lbl">Lyrics <span className="float-right text-white/40">{p.musicLyrics.length}/5000</span></span>
          <textarea className="textarea" rows={4} value={p.musicLyrics} onChange={e=>api.setMusicLyrics(e.target.value.slice(0,5000))}
            placeholder={"[Verse 1]\n...\n\n[Chorus]\n..."}/>
        </label>
        <label className="block">
          <span className="lbl">Deskripsi Utama (style, wajib) <span className="float-right text-white/40">{p.musicStylePrompt.length}/1000</span></span>
          <textarea className="textarea" rows={2} value={p.musicStylePrompt} onChange={e=>api.setMusicStylePrompt(e.target.value.slice(0,1000))}
            placeholder="pop, acoustic, male vocal, melancholic, slow tempo, guitar, piano"/>
        </label>
        <Row>
          <button className="btn btn-ghost text-xs" onClick={api.doGenerateLyrics} disabled={!!p.loading}>
            {p.loading==="lyrics"?<Spinner/>:"✍️"} Buat Lirik
          </button>
          <button className="btn btn-primary flex-1 glow" onClick={api.doGenerateAIMusic} disabled={!!p.loading}>
            {p.loading==="aimusic"?<Spinner/>:"✨"} CREATE · 12 kredit
          </button>
          {(p.musicTitle||p.musicLyrics||p.musicStylePrompt||p.aiMusicUrl) && (
            <button className="btn btn-ghost text-xs" onClick={()=>{api.setMusicTitle(p.selectedTitle?.text||"");api.setMusicLyrics("");api.setMusicStylePrompt("");}}>Clear</button>
          )}
        </Row>
        {p.aiMusicStatus && (
          <div className="flex items-start gap-2 justify-between mt-1">
            <div className="text-[11px] text-white/70 break-word flex-1">Status: {p.aiMusicStatus}</div>
            {p.aiMusicTaskId && !p.aiMusicUrl && !p.aiMusicPolling && (
              <button onClick={api.doCheckAiMusicStatus} className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-teal-500/25 hover:bg-teal-500/40 text-teal-100 border border-teal-400/30">🔄 Cek Status</button>
            )}
          </div>
        )}
        {p.aiMusicUrl && (
          <div className="bg-black/30 rounded-lg p-2 border border-white/10">
            <div className="text-[11px] text-green-300 mb-1 font-bold">✅ Lagu siap — {p.musicGeneratedFrom||p.musicTitle}</div>
            <audio controls src={p.aiMusicUrl} className="w-full"/>
            <a href={p.aiMusicUrl} download={`${p.musicGeneratedFrom||"verve-song"}.mp3`} className="block text-center mt-2 text-[11px] text-teal-300 underline">⬇️ Download MP3</a>
          </div>
        )}
      </Sec>
    )}
    {(p.audioMode==="tts"||p.audioMode==="both") && (
      <Sec title="🔊 Narasi TTS">
        <Row>
          <select className="select" value={p.ttsVoice} onChange={e=>api.setTtsVoice(e.target.value)}>
            {VOICES.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={api.doAutoScript} disabled={!!p.loading}>✍️ Auto Script</button>
        </Row>
        <textarea className="textarea" rows={3} value={p.ttsText} onChange={e=>api.setTtsText(e.target.value)} placeholder="Tulis narasi, atau klik Auto Script"/>
        <button className="btn btn-primary w-full" onClick={api.doGenerateTTS} disabled={!!p.loading}>
          {p.loading==="/tts"?<Spinner/>:"🔊"} Buat Narasi
        </button>
        {p.ttsUrl && <audio controls src={p.ttsUrl} className="w-full mt-2"/>}
      </Sec>
    )}
    {(p.audioMode==="music"||p.audioMode==="both") && (
      <Sec title="🎵 Upload musik (maks 15MB)">
        <label className="btn btn-ghost w-full text-center cursor-pointer">📁 Pilih file
          <input type="file" accept="audio/*" hidden onChange={e=>api.handleUploadMusic(e.target.files?.[0])}/>
        </label>
        {p.musicUrl && <audio controls src={p.musicUrl} className="w-full mt-2"/>}
      </Sec>
    )}
  </>);
}

function SheetLirik({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🏷️ Judul video">
      <Row>
        <button onClick={()=>api.setShowTitle((v:boolean)=>!v)} className={`cc2-tgl ${p.showTitle?"on":""}`}>{p.showTitle?"ON":"OFF"}</button>
        <input className="input flex-1" value={p.selectedTitle?.text||""} placeholder="(pilih judul di ✨AI)"
          onChange={e=>{ if(p.selectedTitleId) api.setTitles(p.titles.map((t:TitleItem)=>t.id===p.selectedTitleId?{...t,text:e.target.value}:t)); }}/>
      </Row>
    </Sec>
    <Sec title="🎤 Lirik / caption per slide (karaoke)">
      <Row>
        <button onClick={()=>api.setShowLyrics((v:boolean)=>!v)} className={`cc2-tgl ${p.showLyrics?"on":""}`}>{p.showLyrics?"ON":"OFF"}</button>
        <select className="select flex-1" value={p.captionStyle} onChange={e=>api.setCaptionStyle(e.target.value)}>
          <option value="capcut">Gaya Kuning-pop</option><option value="karaoke">Karaoke</option>
          <option value="pop">Pop</option><option value="boldwhite">Bold Putih</option>
          <option value="neon">Neon</option><option value="gradient">Gradient</option>
        </select>
      </Row>
      {p.slides.length===0 && <div className="cc2-note">Belum ada slide — isi di 🖼️ Media dulu.</div>}
      <div className="cc2-lyedit">
        {p.slides.map((s:Slide,i:number)=>(
          <div key={s.id} className="cc2-lyrow">
            <img src={s.imageUrl} alt=""/>
            <textarea rows={2} value={p.lyricLines[i]||""} placeholder={`Caption slide ${i+1}…`}
              onChange={e=>{ const arr=[...p.lyricLines]; arr[i]=e.target.value; api.setLyricLines(arr); }}/>
          </div>
        ))}
      </div>
      <div className="cc2-note">💡 Ini caption karaoke (highlight per kata). Untuk teks bebas ala CapCut (font/warna/animasi), pakai tombol 🔤 Teks di toolbar klip.</div>
    </Sec>
  </>);
}

/* -------------------------- TEKS KLIP (CapCut-style) -------------------------- */
function SheetTeks({p}:{p:any}) {
  const {api} = p;
  if (!p.selId) return <ClipHint p={p}/>;
  const id = p.selId as string;
  const opt = p.selOpt as SlideOpt|undefined;
  const ct = opt?.text || null;
  if (!ct) {
    return (
      <div className="cc3-hint">
        Klip {(p.selIndex||0)+1} belum punya teks bebas.
        <button className="btn btn-primary w-full mt-2" onClick={()=>api.setClipText(id, {...DEFAULT_TEXT, txt:"Teks baru"})}>＋ Tambah Teks</button>
        <div className="cc2-note mt-2">Teks bebas ala CapCut: font, warna, outline, background, posisi & animasi — nempel di hasil export juga.</div>
      </div>
    );
  }
  const upd = (patch:Partial<ClipText>) => api.setClipText(id, {...ct, ...patch});
  return (<>
    <Sec title={`✏️ Isi teks (Klip ${(p.selIndex||0)+1})`}>
      <textarea className="textarea" rows={2} value={ct.txt} onChange={e=>upd({txt:e.target.value})} placeholder="Ketik teks..."/>
      <div className="cc2-chips">
        {TEXT_TEMPLATES.map(t=>(
          <button key={t.id} className="chip" onClick={()=>upd({...t.st})}>{t.emoji} {t.label}</button>
        ))}
      </div>
    </Sec>
    <Sec title="🔤 Font & ukuran">
      <div className="cc2-chips">
        {TEXT_FONTS.map(f=>(
          <button key={f.id} className={`chip ${ct.font===f.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`} onClick={()=>upd({font:f.id})}>{f.label}</button>
        ))}
      </div>
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Ukuran</span><b className="text-teal-300">{Math.round(ct.size*100)}%</b></div>
        <input type="range" min={0.03} max={0.1} step={0.002} value={ct.size} onChange={e=>upd({size:Number(e.target.value)})} className="w-full accent-teal-400"/>
      </label>
      <Row>
        <button className={`cc2-tgl ${ct.bold?"on":""}`} onClick={()=>upd({bold:!ct.bold})}><b>B</b></button>
        <button className={`cc2-tgl ${ct.italic?"on":""}`} onClick={()=>upd({italic:!ct.italic})}><i>I</i></button>
        <button className={`cc2-tgl ${ct.shadow?"on":""}`} onClick={()=>upd({shadow:!ct.shadow})}>🌑 Bayangan</button>
        <span className="flex-1"/>
        {(["left","center","right"] as const).map(a=>(
          <button key={a} className={`cc2-tgl ${ct.align===a?"on":""}`} onClick={()=>upd({align:a})}>{a==="left"?"⯇":a==="center"?"☰":"⯈"}</button>
        ))}
      </Row>
    </Sec>
    <Sec title="🎨 Warna, outline & background">
      <div className="cc3-crow">
        {TEXT_COLORS.map(c=>(
          <button key={c} className={`cc3-swatch ${ct.color===c?"on":""}`} style={{background:c}} onClick={()=>upd({color:c})}/>
        ))}
      </div>
      <Row>
        <button className={`cc2-tgl ${ct.stroke?"on":""}`} onClick={()=>upd({stroke:!ct.stroke})}>🖍️ Outline</button>
        {ct.stroke && <input type="color" value={ct.strokeColor} onChange={e=>upd({strokeColor:e.target.value})} className="cc2-colorwell"/>}
        <button className={`cc2-tgl ${ct.bg?"on":""}`} onClick={()=>upd({bg:!ct.bg})}>🏷️ BG</button>
        {ct.bg && <input type="color" value={ct.bgColor} onChange={e=>upd({bgColor:e.target.value})} className="cc2-colorwell"/>}
      </Row>
      {ct.stroke && (
        <label className="block">
          <div className="flex justify-between text-[11px] mb-0.5"><span>Tebal outline</span><b className="text-teal-300">{ct.strokeW}px</b></div>
          <input type="range" min={0} max={10} step={0.5} value={ct.strokeW} onChange={e=>upd({strokeW:Number(e.target.value)})} className="w-full accent-teal-400"/>
        </label>
      )}
    </Sec>
    <Sec title="📍 Posisi & animasi">
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Posisi vertikal</span><b className="text-teal-300">{Math.round(ct.y*100)}%</b></div>
        <input type="range" min={0.06} max={0.94} step={0.01} value={ct.y} onChange={e=>upd({y:Number(e.target.value)})} className="w-full accent-teal-400"/>
      </label>
      <div className="cc2-chips">
        {TEXT_ANIMS.map(a=>(
          <button key={a.id} className={`chip ${ct.anim===a.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`} onClick={()=>upd({anim:a.id})}>{a.emoji} {a.label}</button>
        ))}
      </div>
    </Sec>
    <button className="btn btn-danger w-full" onClick={()=>api.setClipText(id, null)}>🗑️ Hapus teks klip ini</button>
  </>);
}

/* -------------------------- STIKER -------------------------- */
function SheetStiker({p}:{p:any}) {
  const {api} = p;
  const [cat, setCat] = useState(STICKER_CATS[0].id);
  if (!p.selId) return <ClipHint p={p}/>;
  const id = p.selId as string;
  const opt = p.selOpt as SlideOpt|undefined;
  const list = opt?.stickers || [];
  const curCat = STICKER_CATS.find(c=>c.id===cat) || STICKER_CATS[0];
  return (<>
    <Sec title={`😀 Tambah stiker (Klip ${(p.selIndex||0)+1})`}>
      <div className="cc2-chips">
        {STICKER_CATS.map(c=>(
          <button key={c.id} className={`chip ${cat===c.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`} onClick={()=>setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="cc3-emoji-grid">
        {curCat.items.map(e=>(
          <button key={e} className="cc3-emoji" onClick={()=>api.addSticker(id, e)}>{e}</button>
        ))}
      </div>
      <div className="cc2-note">👆 Setelah nambah, seret langsung stikernya di layar preview buat atur posisi.</div>
    </Sec>
    {list.length>0 && (
      <Sec title={`Stiker di klip ini (${list.length})`}>
        <div className="cc2-chips">
          {list.map(st=>(
            <span key={st.id} className="chip">
              <span className="text-base">{st.emoji}</span>
              <button className="text-white/70" onClick={()=>api.updSticker(id, st.id, {size: Math.max(0.05, (st.size||0.11)-0.02)})}>➖</button>
              <button className="text-white/70" onClick={()=>api.updSticker(id, st.id, {size: Math.min(0.3, (st.size||0.11)+0.02)})}>➕</button>
              <button className="text-white/70" onClick={()=>api.updSticker(id, st.id, {rot: ((st.rot||0)+45)%360})}>🔄</button>
              <button className="text-red-300" onClick={()=>api.delSticker(id, st.id)}>×</button>
            </span>
          ))}
        </div>
      </Sec>
    )}
  </>);
}

/* -------------------------- EFEK -------------------------- */
function SheetEfek({p}:{p:any}) {
  const {api} = p;
  const opt = p.selOpt as SlideOpt|undefined;
  const cats = [...new Set(EFFECTS.map(e=>e.cat||""))];
  return (<>
    <Sec title={`🎭 Efek video — Klip ${p.selId?(p.selIndex||0)+1:"?"}`}>
      {!p.selId && <ClipHint p={p}/>}
      {p.selId && cats.map(cat=>(
        <div key={cat} className="mb-1.5">
          <div className="cc2-mini-lbl mb-1">{cat}</div>
          <div className="cc2-chips">
            {EFFECTS.filter(e=>(e.cat||"")===cat).map(e=>(
              <button key={e.id||"none"} className={`chip ${(opt?.effect||"")===e.id?"!bg-pink-500/40 !border-pink-400 !text-white":""}`}
                onClick={()=>api.setOpt(p.selId, { effect: e.id }, `${p.selId}:effect`)}>{e.emoji} {e.label}</button>
            ))}
          </div>
        </div>
      ))}
    </Sec>
    <Sec title="🎚️ Gaya Spektrum (visualizer audio)">
      <Row>
        <span className="cc2-mini-lbl">Warna</span>
        <input type="color" value={p.vizColor} onChange={e=>api.setVizColor(e.target.value)} className="cc2-colorwell"/>
      </Row>
      <div className="cc2-stylegrid">
        {VIZ_STYLES.map(s=>(
          <button key={s.id} onClick={()=>api.setVizStyle(s.id)} className={`cc2-scard ${p.vizStyle===s.id?"on":""}`}>
            <b>{s.emoji} {s.label}</b><span>{s.desc}</span>
          </button>
        ))}
      </div>
    </Sec>
    <Sec title="📊 Stiker overlay spectrum (di hasil render)">
      <div className="cc2-chips">
        {STICKER_CHIPS.map(([v,e,l])=>(
          <button key={v} onClick={()=>api.setSpectrumSticker(v)}
            className={`chip ${p.spectrumSticker===v?"!bg-pink-500/40 !border-pink-400 !text-white":""}`}>{e} {l}</button>
        ))}
      </div>
    </Sec>
  </>);
}

/* -------------------------- FILTER -------------------------- */
function SheetFilter({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🎨 Filter video (berlaku ke semua klip)">
      <div className="cc3-fgrid">
        {FILTERS.map(f=>(
          <button key={f.id} onClick={()=>api.setFilterPreset(f.id)}
            className={`cc3-fcard ${p.filterPreset===f.id?"on":""}`}>
            <span className="cc3-fcard-e">{f.emoji}</span><span>{f.label}</span>
          </button>
        ))}
      </div>
      <div className="cc2-note">Filter hanya kena ke gambar — teks & stiker tetap tajam. Buat sentuhan akhir warna coba tab 🎛️ Adjust.</div>
    </Sec>
  </>);
}

/* -------------------------- ADJUST -------------------------- */
function SheetAdjust({p}:{p:any}) {
  const {api} = p;
  const adj = p.adj as AdjustState;
  return (
    <Sec title="🎛️ Adjust (live, ke semua klip)">
      {ADJUST_DEFS.map(d=>(
        <label key={d.key} className="block">
          <div className="flex justify-between text-[11px] mb-0.5">
            <span>{d.emoji} {d.label}</span>
            <b className="text-teal-300">{adj[d.key]}</b>
          </div>
          <input type="range" min={d.min} max={d.max} value={adj[d.key]}
            onChange={e=>api.setAdj((cur:AdjustState)=>({...cur, [d.key]: Number(e.target.value)}))}
            className="w-full accent-teal-400"/>
        </label>
      ))}
      <button className="btn btn-ghost btn-sm w-full" onClick={()=>api.setAdj({...DEFAULT_ADJUST})}>♻️ Reset semua</button>
    </Sec>
  );
}

/* -------------------------- ANIMASI -------------------------- */
function SheetAnimasi({p}:{p:any}) {
  const {api} = p;
  if (!p.selId) return <ClipHint p={p}/>;
  const opt = p.selOpt as SlideOpt|undefined;
  return (<>
    <Sec title={`🎬 Animasi Masuk — Klip ${(p.selIndex||0)+1}`}>
      <div className="cc2-chips">
        {ANIM_IN.map(a=>(
          <button key={a.id} className={`chip ${(opt?.animIn||"none")===a.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}
            onClick={()=>api.setOpt(p.selId, { animIn: a.id==="none"?undefined:a.id }, `${p.selId}:animIn`)}>{a.emoji} {a.label}</button>
        ))}
      </div>
    </Sec>
    <Sec title="🎬 Animasi Keluar">
      <div className="cc2-chips">
        {ANIM_OUT.map(a=>(
          <button key={a.id} className={`chip ${(opt?.animOut||"none")===a.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}
            onClick={()=>api.setOpt(p.selId, { animOut: a.id==="none"?undefined:a.id }, `${p.selId}:animOut`)}>{a.emoji} {a.label}</button>
        ))}
      </div>
      <label className="block mt-1">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Durasi animasi</span><b className="text-teal-300">{(opt?.animDur ?? 0.6).toFixed(2)}d</b></div>
        <input type="range" min={0.2} max={2} step={0.05} value={opt?.animDur ?? 0.6}
          onChange={e=>api.setOpt(p.selId, { animDur: Number(e.target.value) }, "")} className="w-full accent-teal-400"/>
      </label>
    </Sec>
  </>);
}

/* -------------------------- SPEED & DURASI -------------------------- */
function SheetSpeed({p}:{p:any}) {
  const {api} = p;
  if (!p.selId) return <ClipHint p={p}/>;
  const opt = p.selOpt as SlideOpt|undefined;
  const speed = opt?.speed ?? 1;
  const holdDur = opt?.dur ?? p.slideDuration;
  return (<>
    <Sec title={`⚡ Speed — Klip ${(p.selIndex||0)+1}`}>
      <div className="cc2-chips">
        {[0.3,0.5,0.75,1,1.5,2,3].map(v=>(
          <button key={v} className={`chip ${Math.abs(speed-v)<0.01?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}
            onClick={()=>api.setOpt(p.selId, { speed: v===1?undefined:v }, `${p.selId}:speed`)}>{v}x</button>
        ))}
      </div>
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Speed</span><b className="text-teal-300">{speed.toFixed(2)}x</b></div>
        <input type="range" min={0.3} max={3} step={0.05} value={speed}
          onChange={e=>api.setOpt(p.selId, { speed: Number(e.target.value) }, "")} className="w-full accent-teal-400"/>
      </label>
      <div className="cc2-note">⏱ Durasi efektif: <b>{(holdDur/speed).toFixed(1)} detik</b> (dari {holdDur.toFixed(1)}d ÷ {speed}x)</div>
    </Sec>
    <Sec title="⏱ Durasi hold klip">
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Durasi dasar</span><b className="text-teal-300">{holdDur.toFixed(1)} detik</b></div>
        <input type="range" min={0.5} max={15} step={0.1} value={holdDur}
          onChange={e=>api.setOpt(p.selId, { dur: Number(e.target.value) }, "")} className="w-full accent-teal-400"/>
      </label>
      <div className="cc2-note">💡 Bisa juga ditarik langsung dari pegangan ▮ di ujung kanan klip di timeline.</div>
    </Sec>
  </>);
}

/* -------------------------- TRANSISI -------------------------- */
function SheetTransisi({p}:{p:any}) {
  const {api} = p;
  if (!p.selId) return <ClipHint p={p}/>;
  const opt = p.selOpt as SlideOpt|undefined;
  const cur = canonicalTrans(opt?.trans ?? p.transition);
  const curDur = opt?.transDur ?? p.transitionDur;
  const cats = [...new Set(TRANSITIONS.map(t=>t.cat||""))];
  const isLast = (p.selIndex||0) >= p.slides.length-1;
  return (<>
    <Sec title={`🔀 Transisi dari Klip ${(p.selIndex||0)+1} → ${(p.selIndex||0)+2}`}>
      {isLast && <div className="cc2-note">⚠️ Ini klip terakhir — transisinya berlaku kalau ada klip setelahnya.</div>}
      {cats.map(cat=>(
        <div key={cat} className="mb-1.5">
          <div className="cc2-mini-lbl mb-1">{cat}</div>
          <div className="cc2-chips">
            {TRANSITIONS.filter(t=>(t.cat||"")===cat).map(t=>(
              <button key={t.id} className={`chip ${cur===t.id?"!bg-teal-400/30 !border-teal-300 !text-white":""}`}
                onClick={()=>api.setOpt(p.selId, { trans: t.id }, `${p.selId}:trans`)}>{t.emoji} {t.label}</button>
            ))}
          </div>
        </div>
      ))}
    </Sec>
    <Sec title="⏱ Durasi transisi">
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Durasi</span><b className="text-teal-300">{curDur.toFixed(2)} detik</b></div>
        <input type="range" min={0.2} max={1.5} step={0.05} value={curDur}
          onChange={e=>api.setOpt(p.selId, { transDur: Number(e.target.value) }, "")} className="w-full accent-teal-400"/>
      </label>
      <button className="btn btn-ghost btn-sm w-full" onClick={()=>api.applyTransAll(cur)}>📌 Terapkan "{TRANSITIONS.find(t=>t.id===cur)?.label}" ke SEMUA sambungan</button>
    </Sec>
  </>);
}

/* -------------------------- FORMAT -------------------------- */
function SheetFormat({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🖼️ Proporsi / platform">
      <div className="cc2-stylegrid">
        {ASPECT_RATIOS.map(r=>(
          <button key={r.id} onClick={()=>api.setAspectRatio(r.id)} className={`cc2-scard ${p.aspectRatio===r.id?"on":""}`}><b>{r.label}</b></button>
        ))}
      </div>
    </Sec>
    <Sec title="⏱ Durasi dasar (klip tanpa override)">
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Durasi slide default</span><b className="text-teal-300">{p.slideDuration.toFixed(1)} detik</b></div>
        <input type="range" min={0.5} max={15} step={0.5} value={p.slideDuration}
          onChange={e=>api.setSlideDuration(Number(e.target.value))} className="w-full accent-teal-400"/>
      </label>
      <label className="block">
        <div className="flex justify-between text-[11px] mb-0.5"><span>Transisi default</span><b className="text-teal-300">{p.transitionDur.toFixed(2)} detik</b></div>
        <input type="range" min={0.2} max={1.5} step={0.05} value={p.transitionDur}
          onChange={e=>api.setTransitionDur(Number(e.target.value))} className="w-full accent-teal-400"/>
      </label>
    </Sec>
    <Sec title="💎 Kualitas render">
      <div className="cc2-stylegrid">
        {QUALITY_OPTIONS.map(q=>(
          <button key={q.id} onClick={()=>api.setQuality(q.id)} className={`cc2-scard ${p.quality===q.id?"on":""}`}>
            <b>{q.label}</b><span>{q.res} · {q.fps}fps</span>
          </button>
        ))}
      </div>
    </Sec>
    <Sec title="🖋 Logo channel">
      <Row>
        <label className="btn btn-ghost btn-sm cursor-pointer flex-1 text-center">⬆️ Upload
          <input type="file" accept="image/*" hidden onChange={e=>api.handleLogoUpload(e.target.files?.[0])}/></label>
        <select className="select" value={p.logoPosition} onChange={e=>api.setLogoPosition(e.target.value)}>
          <option value="center">Tengah (pulsa)</option><option value="corner">Pojok</option><option value="none">Tanpa</option>
        </select>
      </Row>
      {p.logoDataUrl && (
        <Row>
          <img src={p.logoDataUrl} className="w-10 h-10 rounded-full border border-white/20" alt="logo"/>
          <button className="btn btn-danger btn-sm" onClick={()=>api.setLogoDataUrl("")}>🗑️ Hapus</button>
        </Row>
      )}
    </Sec>
  </>);
}

/* -------------------------- EKSPOR -------------------------- */
function SheetEkspor({p}:{p:any}) {
  const {api} = p;
  return (<>
    <Sec title="🚀 Render & Ekspor">
      <ExportPanel
        slides={p.slides} isMobile={p.isMobile} selectedTitle={p.selectedTitle} niche={p.niche}
        quality={p.quality} setQuality={api.setQuality}
        loading={p.loading} progress={p.progress} renderETA={p.renderETA} stageText={p.stageText}
        videoUrl={p.videoUrl} videoBlob={p.videoBlob} meta={p.meta}
        onBack={()=>api.setTool("audio")} onRender={api.doRender} onDownload={api.downloadVideo}
        onCopy={api.copyField} copiedField={p.copiedField} onDownloadMeta={api.downloadMetaText}
      />
    </Sec>
    {p.videoUrl && (
      <Sec title="✅ Hasil">
        <video controls src={p.videoUrl} className="w-full rounded-xl border border-white/10"/>
        <div className="text-[10px] text-white/50 mt-1 flex justify-between">
          <span>{p.videoBlob && `${(p.videoBlob.size/1024/1024).toFixed(1)} MB`}</span>
          <span>{p.videoBlob?.type.includes("mp4")?"MP4 H.264":"WebM"}</span>
        </div>
        <button className="btn btn-primary w-full mt-2" onClick={api.downloadVideo}>⬇️ Download</button>
      </Sec>
    )}
    {p.meta && (
      <Sec title="📋 Metadata YouTube">
        <MetaRow label="🏷️ Judul High-CTR" value={p.meta.titleHighCTR} onCopy={()=>api.copyField("title",p.meta.titleHighCTR)} copied={p.copiedField==="title"}/>
        <MetaRow label="📝 Deskripsi" value={p.meta.description} onCopy={()=>api.copyField("desc",p.meta.description)} copied={p.copiedField==="desc"} multiline/>
        <MetaRow label="#️⃣ Tags" value={p.meta.tags.join(", ")} onCopy={()=>api.copyField("tags",p.meta.tags.join(", "))} copied={p.copiedField==="tags"}/>
        <MetaRow label="🔖 Hashtags" value={p.meta.hashtags} onCopy={()=>api.copyField("hash",p.meta.hashtags)} copied={p.copiedField==="hash"}/>
        <button onClick={api.downloadMetaText} className="btn btn-primary w-full">📥 Download metadata (.txt)</button>
      </Sec>
    )}
  </>);
}

/* ============================== helpers ============================== */
function MetaRow({label,value,onCopy,copied,multiline}:{label:string;value:string;onCopy:()=>void;copied:boolean;multiline?:boolean;}) {
  return (
    <div className="mb-2 min-w-0">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-xs text-white/70 font-semibold truncate">{label}</div>
        <button onClick={onCopy} className={`btn btn-sm ${copied?"bg-green-600 text-white":"btn-ghost"}`}>{copied?"✓":"SALIN"}</button>
      </div>
      <div className="text-xs bg-black/40 rounded-lg p-3 border border-white/10 break-word" style={multiline?{whiteSpace:"pre-wrap",lineHeight:1.6}:{}}>{value}</div>
    </div>
  );
}
function Spinner() { return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow"/>; }
function formatTime(s:number): string { s=Math.round(s); if(s<60) return `${s}d`; const m=Math.floor(s/60),sec=s%60; return `${m}m${sec>0?` ${sec}d`:""}`; }
function formatDur(s:number): string { if(!isFinite(s)||s<0)s=0; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,"0")}`; }
function proxifyAudioUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const h = new URL(url).hostname.toLowerCase();
    const butuhProxy = h.includes("kie.ai")||h.includes("suno")||h.includes("apiframe")||h.includes("sunor")||h.includes("aimusic")||h.includes("r2.dev")||h.includes("cdn2")||h.includes("cdn.");
    if (!butuhProxy) return url;
    return `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}
function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, samples = buf.length;
  const blockAlign = numCh*2, byteRate = sr*blockAlign, dataSize = samples*blockAlign;
  const out = new ArrayBuffer(44+dataSize); const v = new DataView(out);
  const ws=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF");v.setUint32(4,36+dataSize,true);ws(8,"WAVE");ws(12,"fmt ");
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true);v.setUint32(28,byteRate,true);v.setUint16(32,blockAlign,true);v.setUint16(34,16,true);
  ws(36,"data");v.setUint32(40,dataSize,true);
  let off=44; const ch:Float32Array[]=[];
  for(let c=0;c<numCh;c++)ch.push(buf.getChannelData(c));
  for(let i=0;i<samples;i++)for(let c=0;c<numCh;c++){const s=Math.max(-1,Math.min(1,ch[c][i]));v.setInt16(off,s<0?s*0x8000:s*0x7fff,true);off+=2;}
  return out;
}
