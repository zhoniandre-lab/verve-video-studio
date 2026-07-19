"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { renderSlideshow, downloadBlob, drawLiveSpectrum } from "@/lib/recorder";
import type { Quality as RenderQuality, Transition, CaptionStyle } from "@/lib/recorder";
import { cropImageToRatio, copyToClipboard } from "@/lib/imgutils";
import {
  VIZ_STYLES, TRANSITION_STYLES, QUALITY_OPTIONS, ASPECT_RATIOS,
} from "@/lib/types";
import type { VizStyle, AudioMode, ImageSource } from "@/lib/types";
import type { VideoMeta } from "@/lib/hcnsec";
import { ExportPanel } from "./studio-editor";

/* =====================================================================
   VERVE AI VIDEO STUDIO — tampilan baru ala CapCut
   Semua fitur lama (Keyword → Judul → Gambar → Audio/Suno → Ekspor →
   Metadata) di-migrasi ke layout studio: topbar, activity rail, panel,
   preview tengah, inspector kanan, timeline bawah.
   ===================================================================== */

type TabId = "ide" | "judul" | "media" | "audio" | "gaya" | "t2v" | "ekspor";
const TABS: { id: TabId; icon: string; label: string; step: number }[] = [
  { id: "ide",    icon: "🎯", label: "Ide",    step: 1 },
  { id: "judul",  icon: "📝", label: "Judul",  step: 2 },
  { id: "media",  icon: "🖼️", label: "Media",  step: 3 },
  { id: "audio",  icon: "🎵", label: "Audio",  step: 4 },
  { id: "gaya",   icon: "✨", label: "Gaya",   step: 4 },
  { id: "t2v",    icon: "🎬", label: "T2V",    step: 0 },
  { id: "ekspor", icon: "🚀", label: "Ekspor", step: 5 },
];
const tabToStep = (t: TabId) => TABS.find(x => x.id === t)?.step ?? 1;

interface KeywordItem { id: string; text: string; }
interface TitleItem { id: string; keyword: string; text: string; }
interface Slide { id: string; imageUrl: string; lyric?: string; }

const IMAGE_STYLE_PRESETS = [
  { id: "cinematic",  label: "🎬 Cinematic 8K",  desc: "ARRI Alexa film" },
  { id: "studio",     label: "📸 Studio Photo",  desc: "Paling stabil" },
  { id: "epic",       label: "⚔️ Epic Fantasy",  desc: "UE5 concept art" },
  { id: "anime",      label: "🌸 Anime Premium", desc: "Makoto Shinkai" },
  { id: "cyberpunk",  label: "🌃 Cyberpunk",     desc: "Neon Blade Runner" },
  { id: "3d",         label: "🧊 3D Pixar",      desc: "Cartoon 3D lucu" },
  { id: "oil",        label: "🎨 Oil Painting",  desc: "Lukisan klasik" },
  { id: "minimalist", label: "◻️ Minimalist",    desc: "Pastel aesthetic" },
];
const VOICES = ["alloy","echo","fable","onyx","nova","shimmer"];

const MUSIC_MODELS = [
  { id: "suno-v5.5",   label: "Suno V5.5",  credit: "12 kredit", badge:"🔥 Terbaru" },
  { id: "suno-v5",     label: "Suno V5",    credit: "12 kredit" },
  { id: "suno-v4.5",   label: "Suno V4.5",  credit: "12 kredit" },
  { id: "suno-v4",     label: "Suno V4",    credit: "12 kredit" },
  { id: "suno-v3.5",   label: "Suno V3.5",  credit: "12 kredit" },
];

const STORAGE_KEY = "verve_project_v1";

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

function ApiKeyModal({ open, onClose, onSave, currentKey, currentProvider }:{
  open: boolean;
  onClose: ()=>void;
  onSave: (k:string, p:Provider)=>void;
  currentKey: string;
  currentProvider: Provider;
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
    const key = text.trim();
    const prov = detectProvider(key);
    try {
      const r = await fetch(creditUrl(prov), {
        headers: { "Authorization": `Bearer ${key}`, "apikey": key, "x-api-key": key },
      }).catch(()=>null);
      if (r && r.ok) {
        const d = await r.json().catch(()=>({}));
        setCredits(`✅ Kredit tersedia: ${d.credit ?? d.credits ?? d.balance ?? d.points ?? d.remaining ?? JSON.stringify(d).slice(0,80)}`);
      } else {
        setCredits(`ℹ️ Cek kredit otomatis gak tersedia untuk provider ${prov}, tapi bukan berarti key salah bro — langsung klik Generate Lagu aja, kalo berhasil berarti key valid.`);
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
              <p className="text-[11px] text-white/60">Untuk AI Music (Suno-style) unlimited — pilih provider yang bisa dibuka di HP kamu</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg flex-shrink-0">×</button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {PROVIDERS.map(p=>(
            <button key={p.id} type="button" onClick={()=>setProvider(p.id)}
              className={`p-2 rounded-lg text-[11px] font-bold text-center border transition ${
                provider===p.id
                  ? "bg-gradient-to-br from-purple-600/40 to-pink-600/40 border-pink-400/60 text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
              }`}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="p-2.5 rounded-lg bg-black/30 border border-white/10 text-[11px] text-white/80 mb-3 space-y-1.5">
          <div>
            👉 <a href={curProv.url} target="_blank" rel="noreferrer"
                 className="text-cyan-300 underline font-bold break-all">{curProv.url.replace("https://","")}</a>
          </div>
          <div className="text-white/70">{curProv.note}</div>
          <div className="text-green-300">🎁 {curProv.free}</div>
          {curProv.prefix && <div className="text-yellow-300">🔑 Awalan key: <code className="bg-black/40 px-1 rounded">{curProv.prefix}</code></div>}
        </div>

        <ol className="text-xs sm:text-sm text-white/80 space-y-1.5 mb-3 list-decimal pl-5">
          <li>Klik link <b>{curProv.name}</b> di atas, daftar/login (email/Google).</li>
          <li>Buka menu <b>API Key / API Keys</b> di dashboard, lalu <b>Create key</b> → copy.</li>
          <li>Tempel di kolom bawah, klik <b>Tambah</b>. Key cuma tersimpan di HP kamu 🤙</li>
        </ol>

        <label className="block mb-2">
          <span className="lbl">API Key ({curProv.name})</span>
          <input className="input" value={text} onChange={e=>{ setText(e.target.value); setProvider(detectProvider(e.target.value)); }}
                 placeholder="tempel key di sini..." autoFocus />
        </label>

        <div className="flex flex-wrap gap-2 mb-2">
          <button className="btn btn-primary flex-1 sm:flex-none" onClick={()=>{ onSave(text.trim(), detectProvider(text.trim())); onClose(); }} disabled={!text.trim()}>
            ✚ Tambah / Simpan
          </button>
          <button className="btn btn-ghost" onClick={cekKredit} disabled={checking || !text.trim()}>
            {checking?<Spinner/>:"🔄"} Cek Kredit
          </button>
          {currentKey && (
            <button className="btn btn-danger" onClick={()=>{ onSave("", "kie"); setText(""); setCredits(""); }}>🗑️ Hapus</button>
          )}
        </div>
        {credits && <div className="text-[11px] text-cyan-200 bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-2 break-word">{credits}</div>}

        <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-white/40">
          💡 Key disimpan di localStorage browser kamu saja (tidak dikirim ke server Verve). Tanpa key kamu masih bisa coba free trial (kadang penuh).
        </div>
      </div>
    </div>
  );
}

// ===== Komponen halaman utama =====
export default function Home() {
  const isMobile = useIsMobile();
  const [mode] = useState<"slideshow">("slideshow");
  const [tab, setTab] = useState<TabId>("ide");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [stageText, setStageText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [quality, setQuality] = useState<RenderQuality>("balanced");

  // Step 1 — Ide & Keyword
  const [niche, setNiche] = useState("");
  const [nKeywords, setNKeywords] = useState(5);
  const [keywordMode, setKeywordMode] = useState<"ai"|"manual">("ai");
  const [manualKeywords, setManualKeywords] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);

  // Step 2 — Judul
  const [titlesPerKw, setTitlesPerKw] = useState(1);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");

  // Step 3 — Gambar/Media
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [imageStyle, setImageStyle] = useState("studio");
  const [aspectRatio, setAspectRatio] = useState<"16:9"|"9:16"|"1:1">("16:9");
  const [nSlides, setNSlides] = useState(4);
  const [slides, setSlides] = useState<Slide[]>([]);

  // Step 4 — Audio
  const [audioMode, setAudioMode] = useState<AudioMode>("tts");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsText, setTtsText] = useState("");
  const [ttsUrl, setTtsUrl] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");
  const [lyricLines, setLyricLines] = useState<string[]>([]);

  // Step 5 — Gaya/Render
  const [vizStyle, setVizStyle] = useState<VizStyle>("luxury");
  const [vizColor, setVizColor] = useState("#ec4899");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transitionDur, setTransitionDur] = useState(0.8);
  const [transition, setTransition] = useState<Transition>("zoom");
  const [showTitle, setShowTitle] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("capcut");
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [logoPosition, setLogoPosition] = useState<"center"|"corner"|"none">("center");
  const [storyboard, setStoryboard] = useState<any|null>(null);
  const [lyrics, setLyrics] = useState<any|null>(null);
  const [aiMusicUrl, setAiMusicUrl] = useState<string>("");
  const [aiMusicStatus, setAiMusicStatus] = useState<string>("");
  const [aiMusicTaskId, setAiMusicTaskId] = useState<string>("");
  const [aiMusicPolling, setAiMusicPolling] = useState<boolean>(false);

  // Suno style panel
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
  // Editor cepat (filter/adjust/dkk)
  const [activeFilter, setActiveFilter] = useState<string>("none");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [sharpen, setSharpen] = useState(0);
  const [vignetteAmt, setVignetteAmt] = useState(75);
  const [videoSpeed, setVideoSpeed] = useState(1);
  const [spectrumSticker, setSpectrumSticker] = useState<string>("bars-bottom");
  const [textLayers, setTextLayers] = useState<any[]>([]);
  const renderStartRef = useRef<number>(0);
  const [draftList, setDraftList] = useState<Array<{id:string;title:string;slides:number;updatedAt:number;thumb?:string;step?:number}>>([]);
  const [showDraftPicker, setShowDraftPicker] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>("");
  const selectedTitle = useMemo(() => titles.find(t=>t.id===selectedTitleId), [titles, selectedTitleId]);

  function goTab(t: TabId) {
    if (t === "ekspor") stopPreview();
    setTab(t);
    const s = tabToStep(t);
    if (s > 0) setStep(s);
  }

  // ===== DRAFT HISTORY helpers =====
  const DRAFTS_KEY = "verve_drafts_v1";
  const MAX_DRAFTS = 12;
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

    const LS_KEY = "verve_draft_v1";
    let restoredSlides: Slide[] = [];
    let restoredLyrics: string[] = [];
    let restoredLogo = "";
    let restoredStep = 1;
    const applyDraft = (d:any, src:"session"|"local") => {
      try {
        if (typeof d.step === "number") { setStep(d.step); restoredStep = d.step;
          const tb = TABS.find(t=>t.step===d.step); if (tb) setTab(tb.id);
        }
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

    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) applyDraft(JSON.parse(raw), "session");
    } catch {}
    try {
      const rawL = localStorage.getItem(LS_KEY);
      if (!restoredSlides.length && rawL) applyDraft(JSON.parse(rawL), "local");
    } catch {}

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
          loadDraftsList();
          setShowDraftPicker(true);
          localStorage.setItem("verve_seen_welcome","1");
        }
      } catch {}
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft sessionStorage (700ms)
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
        v: 3, savedAt: Date.now(),
        step, niche, keywordMode, manualKeywords, nKeywords,
        keywords: keywords.slice(0,30),
        titles: titles.slice(0,50).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
        selectedTitleId, imageSource, imageStyle, aspectRatio, nSlides,
        audioMode, ttsVoice, ttsText,
        vizStyle, vizColor, slideDuration, transitionDur, transition,
        showTitle, showLyrics, logoPosition, logoDataUrl: logoDataUrl.slice(0,150_000),
        musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
        musicEra, musicTempo, musicInstruments,
        musicTitle: musicTitle.slice(0,80),
        musicStylePrompt: musicStylePrompt.slice(0,1000),
        aiMusicUrl, musicGeneratedFrom, sunoCredits,
        storyboard,
        slides: anyTooBig ? [] : compactSlides,
        lyricLines: anyTooBig ? [] : lyricLines.slice(0,12),
      };
    };
    const saveSession = () => {
      try {
        const full = slides.map(s=>{
          if (!s.imageUrl || !s.imageUrl.startsWith("data:")) return s;
          if (s.imageUrl.length > 800_000) return { ...s, _tooBig: true, imageUrl:"" };
          return s;
        });
        const big = full.some((s:any)=>s._tooBig);
        const fullSnap = { ...buildSnap(), slides: big?[]:full, lyricLines: big?[]:lyricLines.slice(0,12) };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fullSnap));
      } catch { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({...buildSnap(),slides:[],lyricLines:[],logoDataUrl:""})); } catch {} }
    };
    const t1 = setTimeout(saveSession, 700);
    return () => clearTimeout(t1);
  }, [step, niche,keywordMode,manualKeywords,nKeywords,keywords,titles,selectedTitleId,
      imageSource,imageStyle,aspectRatio,nSlides,slides,audioMode,ttsVoice,ttsText,
      vizStyle,vizColor,slideDuration,transitionDur,transition,
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
        const snap = {
          v:3, savedAt:Date.now(),
          step, niche, keywordMode, manualKeywords, nKeywords,
          keywords: keywords.slice(0,20),
          titles: titles.slice(0,20).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
          selectedTitleId, aspectRatio, nSlides,
          audioMode, vizStyle, vizColor, slideDuration, transitionDur, transition,
          showTitle, showLyrics, logoPosition,
          musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
          musicTitle: musicTitle.slice(0,80), musicStylePrompt: musicStylePrompt.slice(0,500),
          aiMusicUrl, musicGeneratedFrom,
          slides: big?[]:compactSlides,
          lyricLines: big?[]:lyricLines.slice(0,12),
        };
        localStorage.setItem("verve_draft_v1", JSON.stringify(snap));
      } catch {}
    }, 5000);
    return ()=>clearTimeout(t);
  }, [step,niche,selectedTitleId,aspectRatio,slides,audioMode,vizStyle,vizColor,
      slideDuration,transitionDur,showTitle,showLyrics,musicGenre,musicModel,
      musicTitle,musicStylePrompt,aiMusicUrl,lyricLines]);

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

  function setErr(e: any) {
    const msg = e?.message || e?.error || String(e || "Terjadi kesalahan");
    setError(msg);
  }

  async function callApi(path: string, body: any, timeoutMs = 90000) {
    setLoading(path); setError("");
    try {
      const headers: Record<string,string> = { "Content-Type":"application/json" };
      if (sunoApiKey) {
        headers["X-Suno-Key"] = sunoApiKey;
        headers["X-Suno-Provider"] = sunoProvider;
      }
      const ac = new AbortController();
      const to = setTimeout(()=>ac.abort(), timeoutMs);
      const r = await fetch(`/api/hcnsec${path}`, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: ac.signal, cache: "no-store",
      });
      clearTimeout(to);
      let data: any = {};
      const txt = await r.text();
      try { data = txt ? JSON.parse(txt) : {}; }
      catch { data = { error: `Server error ${r.status}: ${txt.slice(0,200)}` }; }
      if (!r.ok || data.error) {
        const msg = data.error || data.message || `Error ${r.status}`;
        if (data.status === "need_key" || r.status === 401) setShowApiKeyModal(true);
        throw new Error(msg);
      }
      return data;
    } finally { setLoading(null); }
  }

  function saveSunoKey(k: string, p: Provider) {
    setSunoApiKey(k);
    setSunoProvider(p);
    try {
      if (k) {
        localStorage.setItem("verve_suno_key", k);
        localStorage.setItem("verve_suno_provider", p);
      } else {
        localStorage.removeItem("verve_suno_key");
        localStorage.removeItem("verve_suno_provider");
      }
    } catch {}
  }

  // ===== Step 1 =====
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

  // ===== Step 2 =====
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

  // ===== Step 3 =====
  async function doGenerateImages() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText(`Generate ${nSlides} gambar AI...`);
    setLoading("/image");
    const raw: Slide[] = [];
    const errs: string[] = [];
    for (let i=0;i<nSlides;i++){
      setStageText(`Gambar ${i+1}/${nSlides} (AI generate)...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{
            "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}),
          },
          body: JSON.stringify({
            title: selectedTitle.text, keyword: selectedTitle.keyword, niche, style: imageStyle,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
        setStageText(`Gambar ${i+1}/${nSlides} — memproses...`);
        const cropped = await cropImageToRatio(data.url, aspectRatio);
        raw.push({ id:`s${i}_${Date.now()}_${i}`, imageUrl: cropped });
      } catch(e:any){
        console.error(e);
        errs.push(`#${i+1}: ${(e.message||"gagal").slice(0,120)}`);
      }
    }
    if (!raw.length) {
      setErr(`Semua ${nSlides} gambar gagal.\n\nDetail:\n${errs.slice(0,4).join("\n")}\n\n💡 Coba: ganti style ke "Studio Photo", atau upload gambar sendiri.`);
    } else {
      setSlides(raw);
      setLyricLines(raw.map(()=>""));
      setError("");
      setStageText(`✅ ${raw.length}/${nSlides} gambar siap`);
    }
    setTimeout(()=>setStageText(""), 2500);
    setLoading(null);
  }

  function handleUploadImages(files: FileList|null) {
    if (!files) return;
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
            let w = img.naturalWidth, h = img.naturalHeight;
            const ir = w/h;
            let cw=w, ch=h;
            if (ir > targetRatio) cw = h*targetRatio; else ch = w/targetRatio;
            const outW = targetRatio>=1 ? maxSide : Math.round(maxSide*targetRatio);
            const outH = targetRatio>=1 ? Math.round(maxSide/targetRatio) : maxSide;
            c.width=outW; c.height=outH;
            const cx = c.getContext("2d")!;
            cx.fillStyle="#000"; cx.fillRect(0,0,outW,outH);
            cx.drawImage(img,(w-cw)/2,(h-ch)/2,cw,ch,0,0,outW,outH);
            res({ id:`up_${f.name}_${Date.now()}`, imageUrl: c.toDataURL("image/jpeg", 0.88) });
          };
          img.src = r.result as string;
        };
        r.readAsDataURL(f);
      }))
    ).then(s=>{
      setSlides(cur=>[...cur,...s]);
      setLyricLines(cur=>[...cur, ...s.map(()=>"")]);
      setStageText(`✅ ${s.length} gambar ditambahkan`);
      setTimeout(()=>setStageText(""),1500);
    });
  }

  // ===== Step 4 =====
  async function doGenerateTTS() {
    if (!ttsText.trim()) return setErr("Teks TTS kosong");
    setStageText("Generate narasi suara AI...");
    const { url } = await callApi("/tts", { text: ttsText.slice(0,3500), voice: ttsVoice });
    setTtsUrl(url);
    setStageText("✅ Narasi siap");
    setTimeout(()=>setStageText(""),1500);
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
    const { lines } = await callApi("/script", {
      title: selectedTitle.text, keyword: selectedTitle.keyword,
      slides: slides.length || nSlides,
    });
    setTtsText(lines.join(" "));
    setStageText("✅ Script dibuat");
    setTimeout(()=>setStageText(""),1200);
  }

  // ===== Step 5: Render =====
  async function doRender() {
    if (!slides.length) return setErr("Belum ada gambar");
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(""); setVideoBlob(null); }
    setError(""); setLoading("render"); setProgress(0); renderStartRef.current = Date.now();
    setStageText("Menyiapkan render engine...");
    setMeta(null);
    try {
      let chosenMusic = musicUrl;
      if (aiMusicUrl) chosenMusic = aiMusicUrl;
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
          const s = slides[i] as any;
          let line = "";
          if (s.lyric) line = s.lyric;
          else if (lyricLines[i]) line = lyricLines[i];
          else if (storyboard?.scenes?.[i]?.lyric_line) line = storyboard.scenes[i].lyric_line;
          finalLyrics.push(line);
        }
      }
      const hasLyrics = finalLyrics.some(x=>!!x);

      const effSpeed = Math.max(0.25, Number(videoSpeed)||1);
      const filterStr = getFilterString();
      const vignetteStrength = Math.max(0, Math.min(1, (vignetteAmt/100)*0.8));
      const finalTextLayers = (textLayers||[]).map((l:any)=>({
        ...l, id: l.id?.replace(/^sel_/,""),
      })).filter((l:any)=>l.text && l.text.trim());
      const blob = await renderSlideshow({
        images: slides.map(s=>s.imageUrl),
        audioUrl: audioUrl || undefined,
        slideDuration: slideDuration/effSpeed,
        transitionDuration: transitionDur/effSpeed,
        videoSpeed: effSpeed,
        videoFilter: activeFilter==="none" && brightness===0 && contrast===0 && saturation===0 && sharpen===0
          ? undefined
          : filterStr,
        vignetteStrength,
        spectrumSticker: spectrumSticker || "bars-bottom",
        textLayers: finalTextLayers.length ? finalTextLayers : undefined,
        vizStyle, vizColor, title: showTitle ? (selectedTitle?.text || niche) : undefined,
        lyrics: showLyrics && hasLyrics ? finalLyrics : undefined,
        logoUrl: logoDataUrl || undefined,
        logoPosition,
        quality, mobileOptimized: isMobile, ratio: aspectRatio, aspectRatio,
        transition, showTitle, showLyrics: showLyrics && hasLyrics,
        captionStyle: showLyrics ? captionStyle : "none",
        onProgress: (p) => {
          setProgress(p);
          const elapsed = (Date.now()-renderStartRef.current)/1000;
          if (p > 0.02) {
            const eta = Math.max(0, elapsed/p - elapsed);
            setRenderETA(formatTime(eta));
          }
          if (p>0.05 && p<0.98) setStageText(`Rendering ${Math.round(p*100)}% • sisa ~${formatTime(Math.max(0,(elapsed/p*(1-p))))}`);
        },
        onStage: (s)=>setStageText(s),
      });
      setVideoBlob(blob);
      const u = URL.createObjectURL(blob);
      setVideoUrl(u);
      setStageText("✅ Video siap! Membuat metadata YouTube...");
      setProgress(1); setRenderETA("");
      try {
        const m = await callApi("/metadata", {
          title: selectedTitle?.text, keyword: selectedTitle?.keyword, niche,
        });
        setMeta(m);
      } catch(e:any){ console.warn("Meta gagal:", e); }
      setStageText("✅ Selesai! Video + metadata siap di-download.");
      setTimeout(()=>setStageText(""),4000);
    } catch(e:any){
      setErr(e.message || "Render gagal");
    } finally { setLoading(null); }
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
          const b = bufs[bi];
          const d = b.getChannelData(Math.min(c, b.numberOfChannels-1));
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
    const safe = (meta?.titleHighCTR || selectedTitle?.text || "video")
      .replace(/[^\w\- ]+/g,"").replace(/\s+/g,"_").slice(0,50) || "video";
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${safe}_${Date.now()}.${ext}`);
  }

  async function copyField(key:string, text:string) {
    const ok = await copyToClipboard(text);
    if (ok) { setCopiedField(key); setTimeout(()=>setCopiedField(""),1500); }
  }

  function downloadMetaText() {
    if (!meta || !selectedTitle) return;
    const txt =
`=== JUDUL YOUTUBE (high CTR) ===
${meta.titleHighCTR}

=== JUDUL ALTERNATIF ===
${meta.titleAlternatives.map((t,i)=>`${i+1}. ${t}`).join("\n")}

=== DESKRIPSI ===
${meta.description}

=== TAGS ===
${meta.tags.join(", ")}

=== HASHTAGS ===
${meta.hashtags}

Dibuat dengan Verve AI Video Studio`;
    const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url;
    a.download = `meta_${(meta.titleHighCTR||"video").replace(/[^\w\- ]+/g,"").slice(0,30)}.txt`;
    a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  // ===== STORY MODE =====
  async function doGenerateStoryboard() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Membuat storyboard emosional...");
    setLoading("storyboard");
    try {
      const sb = await callApi("/storyboard", {
        title: selectedTitle.text, keyword: selectedTitle.keyword, niche, slides: nSlides,
      });
      setStoryboard(sb);
      if (sb.color_grade) setVizColor(sb.color_grade);
      const styleMap: Record<string,string> = {
        cinematic:"cinematic", anime:"anime", studio:"studio", fantasy:"epic",
        cyberpunk:"cyberpunk", pixar:"3d", "3d":"3d", oil:"oil", minimalist:"minimalist", retro:"cinematic",
      };
      const vsl = String(sb.style_visual||"").toLowerCase();
      for (const k of Object.keys(styleMap)) if (vsl.includes(k)) { setImageStyle(styleMap[k]); break; }
      if (sb.scenes && Array.isArray(sb.scenes)) {
        const lirikFull = sb.scenes.map((s:any)=>s.lyric_line).filter(Boolean).join(". ");
        if (lirikFull) setTtsText(lirikFull);
        const ll = sb.scenes.map((s:any)=>s.lyric_line||"");
        setLyricLines(ll);
        setNSlides(sb.scenes.length);
        setShowLyrics(true);
      }
      setStageText("✅ Storyboard + lirik siap! Lirik terisi otomatis di Audio.");
      setTimeout(()=>setStageText(""), 3500);
    } catch(e:any){ setErr(e.message); setTimeout(()=>setStageText(""),2000); }
    setLoading(null);
  }

  async function doGenerateImagesFromStory() {
    if (!storyboard?.scenes?.length) return setErr("Buat storyboard dulu");
    setStageText(`Generate ${storyboard.scenes.length} gambar sesuai cerita...`);
    setLoading("img-story");
    const newSlides: Slide[] = [];
    const errs: string[] = [];
    const ll: string[] = [];
    for (let i=0;i<storyboard.scenes.length;i++){
      const sc = storyboard.scenes[i];
      setStageText(`Adegan ${i+1}/${storyboard.scenes.length}: ${sc.scene_desc?.slice(0,35)}...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{
            "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}),
          },
          body: JSON.stringify({
            style: imageStyle,
            _storyScene: { visual_prompt: sc.visual_prompt, scene_desc: sc.scene_desc },
            _mood: sc.mood,
            _rawPrompt: true,
            prompt: sc.visual_prompt,
          }),
        });
        let data;
        try { data = await res.json(); } catch { data={error:"bad json"}; }
        if (!res.ok || data.error) throw new Error(data.error||`HTTP ${res.status}`);
        setStageText(`Adegan ${i+1} — crop ${aspectRatio}...`);
        const cropped = await cropImageToRatio(data.url, aspectRatio);
        newSlides.push({ id:`sb${i}_${Date.now()}`, imageUrl: cropped, lyric: sc.lyric_line });
        ll.push(sc.lyric_line||"");
        await new Promise(r=>setTimeout(r,50));
      } catch(e:any){
        errs.push(`#${i+1} ${sc.scene_desc?.slice(0,25)||""}: ${(e.message||"gagal").slice(0,70)}`);
      }
    }
    if (newSlides.length) {
      setSlides(newSlides);
      setLyricLines(ll);
      setShowLyrics(true);
      setError("");
      setStageText(`✅ ${newSlides.length}/${storyboard.scenes.length} adegan siap dengan lirik!`);
    } else {
      setErr(`Gagal generate gambar cerita:\n${errs.join("\n")}`);
    }
    setTimeout(()=>setStageText(""),3000); setLoading(null);
  }

  async function doGenerateLyrics() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Menulis lirik lagu lengkap + style prompt...");
    setLoading("lyrics");
    try {
      const extraStyle = [musicTempo!=="slow"?musicTempo:"", musicEra, musicInstruments].filter(Boolean).join(", ");
      const l = await callApi("/lyrics", {
        title: selectedTitle.text, keyword: selectedTitle.keyword, niche,
        genre: [musicGenre, extraStyle].filter(Boolean).join(", "),
        mood: musicMood,
      });
      setLyrics(l);
      setMusicTitle((l.title || selectedTitle.text).slice(0,80));
      setMusicLyrics(l.lyrics || "");
      const tempoEn = musicTempo==="fast"?"uptempo":musicTempo==="mid"?"mid-tempo":"slow tempo";
      const eraEn = musicEra ? `${musicEra} era, ` : "";
      const vocalEn = musicVocalGender==="female"?"female vocal":musicVocalGender==="male"?"male vocal":"male vocal";
      const baseStyle = [musicGenre, eraEn+tempoEn, vocalEn, musicMood, musicInstruments, "high quality studio recording, emotional, indonesian"]
        .map(s=>(s||"").trim()).filter(Boolean).join(", ");
      setMusicStylePrompt(l.style_prompt_suno || baseStyle);
      setStageText("✅ Judul + Lirik + Style prompt siap diisi otomatis! Silakan edit sebelum CREATE.");
    } catch(e:any){ setErr(e.message); }
    setTimeout(()=>setStageText(""),2500); setLoading(null);
  }

  function rebuildStylePrompt() {
    if (musicStylePrompt && !/^\s*$/.test(musicStylePrompt)) return;
    const tempoEn = musicTempo==="fast"?"uptempo":musicTempo==="mid"?"mid-tempo":"slow tempo";
    const eraEn = musicEra ? `${musicEra} era, ` : "";
    const vocalEn = musicVocalGender==="female"?"female vocal":musicVocalGender==="male"?"male vocal":"male vocal";
    const s = [musicGenre, eraEn+tempoEn, vocalEn, musicMood, musicInstruments, "high quality studio recording"]
      .map(x=>(x||"").trim()).filter(Boolean).join(", ");
    setMusicStylePrompt(s);
  }
  useEffect(()=>{ rebuildStylePrompt(); /* eslint-disable-next-line */ },[musicGenre,musicTempo,musicEra,musicInstruments,musicVocalGender]);

  async function doGenerateAIMusic() {
    const title = (musicTitle || selectedTitle?.text || "").trim();
    const lyr = (musicLyrics || "").trim();
    const style = (musicStylePrompt || "").trim();
    if (!title) return setErr("Judul lagu kosong bro, isi kolom TITLE dulu ya.");
    if (musicVocalType !== "instrumental" && lyr.length < 20)
      return setErr("Lirik terlalu pendek. Klik '✍️ Buat Lirik Dulu' atau isi kolom LYRICS minimal ~20 karakter (pakai [Verse], [Chorus] lebih bagus).");
    if (style.length < 10)
      return setErr("Deskripsi Utama (style) wajib diisi. Klik '✍️ Buat Lirik Dulu' atau isi manual (contoh: pop, acoustic, male vocal, melancholic, slow tempo, guitar, piano).");

    setStageText(`Meminta AI membuat lagu "${title.slice(0,40)}"... (12 kredit ${sunoProvider})`);
    setLoading("aimusic"); setAiMusicStatus("memulai..."); setAiMusicUrl("");
    setAiMusicTaskId(""); setAiMusicPolling(true);
    setError("");
    setMusicGeneratedFrom(title);
    try {
      const useCustom = lyr.length > 30 && musicVocalType !== "instrumental";
      const payload = {
        title: title.slice(0,80),
        prompt: style,
        lyrics: useCustom ? lyr : undefined,
        genre: musicGenre,
        tags: style,
        custom: useCustom,
        model: musicModel,
        instrumental: musicVocalType === "instrumental",
        vocalGender: musicVocalGender,
        style_bits: { era: musicEra, instruments: musicInstruments, tempo: musicTempo },
        _raw_title: title, _raw_lyrics: lyr, _raw_style: style,
      };
      let r: Response;
      try {
        const ac = new AbortController();
        const to = setTimeout(()=>ac.abort(), 120000);
        r = await fetch("/api/hcnsec/music", {
          method:"POST", headers:{
            "Content-Type":"application/json",
            ...(sunoApiKey?{"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider}:{}),
          },
          body: JSON.stringify(payload),
          signal: ac.signal,
          cache: "no-store",
        });
        clearTimeout(to);
      } catch(netErr:any) {
        throw new Error(
          `⚠️ Gagal nyambung ke server (${netErr?.name==="AbortError"?"timeout":"jaringan"}).\n\n`+
          `Solusi:\n`+
          `• Klik CREATE lagi (kredit TIDAK kepotong kalau belum dapat id)\n`+
          `• Kalo masih gagal 3x, refresh halaman lalu coba lagi\n`+
          `• Pastikan koneksi stabil`
        );
      }
      let txt = "";
      try { txt = await r.text(); } catch { txt = ""; }
      let data: any;
      try { data = txt ? JSON.parse(txt) : {}; }
      catch { data = { error: `Server balas format aneh (${r.status}). Coba CREATE lagi ya bro.` }; }

      if (!r.ok || data.error) {
        if (data.status === "need_key" || r.status === 401) setShowApiKeyModal(true);
        if (r.status === 504) throw new Error("Server Vercel lagi cold-start bro 😅 Tunggu 30 detik lalu klik CREATE lagi — kredit gak kepotong.");
        throw new Error(data.error || `Error ${r.status}`);
      }
      if (data.audio_url) {
        setAiMusicUrl(data.audio_url);
        setAiMusicStatus("selesai");
        setAiMusicPolling(false);
        setSunoCredits(`✅ ${musicModel} · 12 kredit terpakai (${data.provider||sunoProvider})`);
        if (audioMode !== "aimusic") setAudioMode("aimusic");
        setStageText(`✅ Lagu "${title.slice(0,30)}" siap & otomatis dipakai untuk render!`);
      } else if (data.id) {
        setAiMusicTaskId(data.id);
        setAiMusicStatus("antri...");
        const pollStart = Date.now();
        const MAX_POLL_MS = 8 * 60 * 1000;
        const pollInterval = 4000;
        let done = false;
        while (Date.now() - pollStart < MAX_POLL_MS) {
          await new Promise(res=>setTimeout(res,pollInterval));
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
              const elapsed = Math.round((Date.now()-pollStart)/1000);
              const pct = Math.min(99, Math.round(elapsed/(MAX_POLL_MS/1000)*100));
              let st = pd.status || "";
              if (st === "pending") setAiMusicStatus(`antri... ${pct}% (${elapsed}s)`);
              else if (st === "TEXT_SUCCESS") setAiMusicStatus(`lirik ready, generate audio... ${pct}%`);
              else setAiMusicStatus(`memproses... ${pct}% (${elapsed}s)`);
              const audioUrl = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
              if (audioUrl) {
                setAiMusicUrl(audioUrl); setAiMusicStatus("selesai");
                setAiMusicPolling(false);
                setSunoCredits(`✅ ${musicModel} · 12 kredit terpakai (${pd.provider||sunoProvider})`);
                if (audioMode !== "aimusic") setAudioMode("aimusic");
                setStageText(`✅ Lagu "${title.slice(0,30)}" siap & otomatis dipakai untuk render!`);
                done = true;
                break;
              }
              if (pd.status === "error" || pd.error) {
                if (Date.now() - pollStart < 60000) continue;
                throw new Error(pd.error||"Gagal generate musik");
              }
            } else {
              const elapsed = Math.round((Date.now()-pollStart)/1000);
              setAiMusicStatus(`wait server... (${elapsed}s)`);
            }
          } catch(pollErr:any) {
            setAiMusicStatus(`jaringan retry...`);
          }
        }
        if (!done) {
          setAiMusicStatus("masih diproses server — tap 🔄 Cek Status di bawah (gratis, tanpa kredit)");
          setAiMusicPolling(false);
          setStageText("⏳ Lagu masih diolah Kie.ai. Klik tombol 🔄 Cek Status sebentar lagi ya bro (TIDAK pakai kredit).");
        }
      } else {
        setAiMusicPolling(false);
        setStageText("⚠️ AI music belum merespon. Coba lagi ya bro.");
      }
    } catch(e:any){
      setErr(e.message || "AI music gagal.");
      setAiMusicStatus("gagal");
      setAiMusicPolling(false);
    }
    setTimeout(()=>setStageText(""),6000); setLoading(null);
  }

  async function doCheckAiMusicStatus() {
    const id = aiMusicTaskId;
    if (!id) return setErr("Belum ada taskId buat dicek. Coba CREATE dulu ya bro.");
    setError("");
    setAiMusicPolling(true);
    setAiMusicStatus("mengecek...");
    try {
      const ac = new AbortController();
      const t = setTimeout(()=>ac.abort(), 25000);
      const pr = await fetch(`/api/hcnsec/music?id=${id}`, {
        headers: sunoApiKey ? {"X-Suno-Key":sunoApiKey,"X-Suno-Provider":sunoProvider} : {},
        signal: ac.signal, cache:"no-store",
      });
      clearTimeout(t);
      if (!pr.ok) throw new Error(`Server error ${pr.status}. Coba sebentar lagi ya.`);
      const pd = await pr.json().catch(()=>({}));
      const audioUrl = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
      if (audioUrl) {
        setAiMusicUrl(audioUrl);
        setAiMusicStatus("selesai");
        setAiMusicPolling(false);
        const title = musicGeneratedFrom || musicTitle;
        setSunoCredits(`✅ ${musicModel} · 12 kredit terpakai (${pd.provider||sunoProvider})`);
        if (audioMode !== "aimusic") setAudioMode("aimusic");
        setStageText(`✅ Lagu "${title.slice(0,30)}" siap & otomatis dipakai untuk render!`);
        setTimeout(()=>setStageText(""),4000);
        return;
      }
      if (pd.status === "error" || pd.error) {
        setAiMusicStatus("gagal");
        setAiMusicPolling(false);
        setErr(pd.error || "Gagal generate musik. Coba CREATE ulang ya bro.");
        return;
      }
      setAiMusicStatus(`masih diproses (${pd.status||"pending"}) — cek lagi 30-60 detik ya bro`);
    } catch(e:any){
      setErr(e.message || "Gagal cek status. Coba lagi.");
      setAiMusicStatus("cek status gagal");
    }
    setAiMusicPolling(false);
  }

  // ===== DRAFT HISTORY =====
  function buildDraftSnapshot(title?:string): any {
    const compactSlides = slides.slice(0,12).map(s=>{
      if (!s.imageUrl || !s.imageUrl.startsWith("data:")) return s;
      if (s.imageUrl.length > 400_000) return { ...s, imageUrl:"", _big:true };
      return s;
    });
    return {
      v:1,
      id: currentDraftId || `d${Date.now()}`,
      title: (title||selectedTitle?.text||niche||"Draft tanpa judul").slice(0,80),
      updatedAt: Date.now(),
      step, niche, keywordMode, manualKeywords,
      keywords: keywords.slice(0,20),
      titles: titles.slice(0,20).map(t=>({id:t.id,keyword:t.keyword,text:t.text})),
      selectedTitleId, imageSource, imageStyle, aspectRatio, nSlides,
      audioMode, ttsVoice, ttsText,
      vizStyle, vizColor, slideDuration, transitionDur, transition,
      showTitle, showLyrics, logoPosition,
      musicGenre, musicMood, musicModel, musicVocalType, musicVocalGender,
      musicTitle: musicTitle.slice(0,80), musicStylePrompt: musicStylePrompt.slice(0,500),
      aiMusicUrl, musicGeneratedFrom,
      storyboard,
      slides: compactSlides,
      lyricLines: lyricLines.slice(0,12),
      thumb: slides[0]?.imageUrl?.startsWith("data:")?slides[0].imageUrl.slice(0,10000):"",
    };
  }
  function applyDraft(d:any) {
    if (!d) return;
    stopPreview();
    if (typeof d.step === "number") { setStep(d.step);
      const tb = TABS.find(t=>t.step===d.step); if (tb) setTab(tb.id);
    }
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
    if (d.transition) setTransition(d.transition as Transition);
    if (typeof d.showTitle==="boolean") setShowTitle(d.showTitle);
    if (typeof d.showLyrics==="boolean") setShowLyrics(d.showLyrics);
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
    } catch(e:any) {
      setErr("Draft gagal disimpan: "+(e?.message||"quota penuh"));
    }
  }
  function deleteDraft(id:string) {
    const list = draftList.filter(x=>x.id!==id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
    setDraftList(list);
  }
  function startNewDraft() {
    stopPreview();
    setStep(1); setTab("ide");
    setNiche(""); setKeywords([]); setTitles([]); setSelectedTitleId("");
    setSlides([]); setLyricLines([]); setStoryboard(null); setTtsText(""); setTtsUrl("");
    setAiMusicUrl(""); setAiMusicStatus(""); setAiMusicTaskId(""); setMusicTitle("");
    setMusicLyrics(""); setMusicStylePrompt(""); setMusicGeneratedFrom(""); setSunoCredits("");
    setVideoUrl(""); setVideoBlob(null); setMeta(null);
    setCurrentDraftId("");
    setShowDraftPicker(false);
    setStageText("✨ Project baru dimulai");
    setTimeout(()=>setStageText(""),2000);
  }
  function loadDraft(id:string) {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const full = (Array.isArray(arr)?arr:[]).find((x:any)=>x.id===id);
      if (!full) { setErr("Draft tidak ditemukan (mungkin terhapus)"); return; }
      applyDraft(full);
      setShowDraftPicker(false);
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
        const c = document.createElement("canvas");
        const size=256;
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
    setLoading("t2v"); setError(""); setT2vResult(null);
    setStageText("Meminta video ke AI...");
    try {
      const r = await callApi("/video", {
        prompt: t2vPrompt, imageUrl: t2vImageUrl || undefined,
        duration: isMobile ? Math.min(t2vDuration,5) : t2vDuration,
        aspectRatio,
      });
      setT2vResult(r);
      if (!r.video_url) setErr(r.error || "Model video belum tersedia. Coba Slideshow dulu ya bro.");
      setStageText("");
    } catch(e:any){ setErr(e.message); setStageText(""); }
    finally { setLoading(null); }
  }

  // ===== PREVIEW ENGINE =====
  function stopPreview() {
    if (previewRafRef.current) { cancelAnimationFrame(previewRafRef.current); previewRafRef.current = null; }
    const audEl = previewAudioRef.current;
    if (audEl) {
      try { if (!audEl.paused) audEl.pause(); } catch {}
      try { audEl.currentTime = 0; } catch {}
      if ((audEl as any)._cleanup) { try { (audEl as any)._cleanup(); } catch {} (audEl as any)._cleanup = null; }
    }
    setPreviewPlaying(false);
    setPreviewCurrent(0);
  }
  function getFilterString(f?:string): string {
    const bright = 1 + brightness/100;
    const contr = 1 + contrast/100;
    const sat = 1 + saturation/100;
    const sharp = sharpen>0 ? `blur(${0}px) contrast(${1+sharpen/300})` : "";
    let preset = "";
    const fp = f || activeFilter;
    if (fp === "cinematic") preset = "contrast(1.18) saturate(0.85) brightness(0.95)";
    else if (fp === "vivid") preset = "saturate(1.4) contrast(1.12) brightness(1.05)";
    else if (fp === "warm") preset = "sepia(0.18) saturate(1.15) brightness(1.02)";
    else if (fp === "cool") preset = "hue-rotate(-10deg) saturate(1.1) brightness(1.02)";
    else if (fp === "bw") preset = "grayscale(1) contrast(1.1)";
    else if (fp === "vintage") preset = "sepia(0.35) contrast(0.95) brightness(0.95) saturate(0.85)";
    else if (fp === "dreamy") preset = "brightness(1.1) contrast(0.92) saturate(1.15) blur(0.3px)";
    else if (fp === "cinema4k") preset = "contrast(1.22) saturate(0.95) brightness(0.92)";
    else if (fp === "8k") preset = "contrast(1.25) saturate(1.08) brightness(0.98)";
    else if (fp === "clearll") preset = "contrast(1.08) saturate(1.12) brightness(1.02)";
    else if (fp === "senja") preset = "sepia(0.25) saturate(1.2) brightness(1.0) hue-rotate(-10deg)";
    return [preset, `brightness(${bright}) contrast(${contr}) saturate(${sat})`, sharp].filter(Boolean).join(" ");
  }
  function resetAdjust() {
    setBrightness(0); setContrast(0); setSaturation(0); setSharpen(0); setVignetteAmt(75); setActiveFilter("none");
  }
  function seekPreview(t: number) {
    const audEl = previewAudioRef.current;
    if (audEl && isFinite(audEl.duration)) {
      audEl.currentTime = Math.max(0, Math.min(audEl.duration, t));
    }
    setPreviewCurrent(t);
  }
  async function togglePreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
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
      audEl.muted = previewMuted;
      audEl.crossOrigin = "anonymous";
      const wantSrc = previewSrc || "";
      if (!wantSrc) {
        try { audEl.removeAttribute("src"); audEl.load(); } catch {}
      } else if (audEl.src !== wantSrc) {
        audEl.src = wantSrc;
      }
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

    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const imgs: HTMLImageElement[] = [];
    for (const s of slides) {
      const im = new Image(); im.crossOrigin = "anonymous";
      im.src = s.imageUrl;
      try { await new Promise<void>((res)=>{ im.onload=()=>res(); im.onerror=()=>res(); setTimeout(()=>res(),4000); }); } catch {}
      imgs.push(im);
    }

    let analyserConnected = false;
    try {
      if (!previewActxRef.current) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        previewActxRef.current = new AC();
      }
      const actx = previewActxRef.current!;
      if (actx.state === "suspended") { try { await actx.resume(); } catch {} }
      if (audEl && previewSrc && !previewAnalyserConnected.current) {
        const an = actx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.75;
        const src = actx.createMediaElementSource(audEl);
        src.connect(an);
        an.connect(actx.destination);
        previewAnalyserRef.current = an;
        previewAnalyserConnected.current = true;
      }
      if (previewAnalyserRef.current) analyserConnected = true;
    } catch (e: any) {
      console.warn("Audio analyser setup gagal (lanjut tanpa spectrum live):", e?.message || e);
      analyserConnected = false;
    }

    const startT = performance.now();
    setPreviewPlaying(true);

    const effSpeed = Math.max(0.25, Number(videoSpeed)||1);
    const cFilter = getFilterString();
    const vStrength = (vignetteAmt/100)*0.8;

    const lyricLinesValid = lyricLines.filter(x=>!!x && x.trim());
    const showLyricsNow = showLyrics && lyricLinesValid.length>0;

    const draw = () => {
      previewRafRef.current = requestAnimationFrame(draw);
      const now = performance.now();
      let t = 0;
      if (audEl && !audEl.paused && audEl.duration && isFinite(audEl.duration)) {
        t = (audEl.currentTime||0)*effSpeed;
        if ((now - (draw as any)._lastUi || 0) > 100) {
          (draw as any)._lastUi = now;
          setPreviewCurrent(audEl.currentTime||0);
        }
      } else {
        t = ((now - startT)/1000)*effSpeed;
        if ((now - (draw as any)._lastUi || 0) > 100) {
          (draw as any)._lastUi = now;
          setPreviewCurrent(t/effSpeed);
        }
      }

      const sd = Math.max(0.3, slideDuration/effSpeed);
      const td = Math.min(sd*0.6, (isMobile?0.5:0.8)/effSpeed);
      const perS = sd + td;
      let slideIdx = Math.floor(t/perS);
      let localT = t - slideIdx*perS;
      let inTrans = localT >= sd && td>0;
      let transT = inTrans ? Math.min(1,(localT-sd)/td) : 0;
      let nextIdx = Math.min(slideIdx+1, imgs.length-1);
      slideIdx = Math.min(slideIdx, imgs.length-1);
      const slideT = Math.min(1, sd>0?localT/sd:0);

      ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);
      const drawImg = (img:HTMLImageElement, alpha=1, zoom=1)=>{
        if (!img.naturalWidth) { ctx.fillStyle="#222"; ctx.fillRect(0,0,W,H); return; }
        const ir = img.naturalWidth/img.naturalHeight, cr = W/H;
        let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;
        if (ir>cr) { sh=img.naturalHeight; sw=sh*cr; sx=(img.naturalWidth-sw)/2; }
        else { sw=img.naturalWidth; sh=sw/cr; sy=(img.naturalHeight-sh)/2; }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = cFilter;
        const z = zoom;
        ctx.translate(W/2,H/2); ctx.scale(z,z); ctx.translate(-W/2,-H/2);
        ctx.drawImage(img,sx,sy,sw,sh,0,0,W,H);
        ctx.restore();
      };
      const zb = 1 + slideT*0.04;
      drawImg(imgs[slideIdx], 1, zb);
      if (inTrans && imgs[nextIdx]) {
        drawImg(imgs[nextIdx], transT, 1 + (1-transT)*0.04);
      }
      const vg = ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.75);
      vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,`rgba(0,0,0,${vStrength})`);
      ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

      // Spectrum live
      const an = previewAnalyserRef.current;
      const SPEC_BARS = 64;
      let barData: Float32Array|Uint8Array = new Float32Array(SPEC_BARS);
      let bass = 0, beat=false;
      if (analyserConnected && an) {
        const f8 = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(f8);
        const out = new Float32Array(SPEC_BARS);
        const stp = Math.max(1, Math.floor(f8.length/SPEC_BARS));
        let bassSum=0, bassCnt=0, maxV=0;
        for (let i=0;i<SPEC_BARS;i++){
          let s=0; for (let j=0;j<stp;j++){ const v=(f8[i*stp+j]||0)/255; s+=v; if (v>maxV) maxV=v; }
          out[i]=s/stp;
          if (i<8){bassSum+=out[i];bassCnt++;}
        }
        bass = bassCnt?bassSum/bassCnt:0;
        bass = ((draw as any)._bass||0)*0.85 + bass*0.15;
        (draw as any)._bass = bass;
        beat = maxV > bass*1.4 && maxV > 0.35;
        barData = out;
      } else {
        for (let i=0;i<SPEC_BARS;i++){
          barData[i] = Math.max(0.05, Math.min(1, 0.3 + Math.sin(t*2+i*0.2)*0.2 + Math.sin(t*5+i*0.3)*0.15));
        }
        bass = 0.3 + Math.sin(t*2)*0.2;
        beat = (Math.sin(t*2.5)>0.9);
      }
      if (vizStyle !== "none") {
        const rgbV: [number,number,number] = (() => {
          const hex = vizColor.replace("#","");
          const v = hex.length===3?hex.split("").map(c=>c+c).join(""):hex;
          return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
        })();
        ctx.save();
        try{
          drawLiveSpectrum(ctx,{
            W,H,bars:barData,bass,beat,style:vizStyle,rgb:rgbV,isMobile:isMobile,phase:t*0.5,
            barFill:`rgba(${rgbV[0]},${rgbV[1]},${rgbV[2]},0.95)`,
          });
        }catch(e:any){ console.warn("spectrum err",e?.message); }
        ctx.restore();
        ctx.filter = cFilter;
      }

      if (showTitle) {
        const titleText = selectedTitle?.text || niche || "";
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

      if (showLyricsNow) {
        const lines = lyricLinesValid;
        const leadIn = 1.0;
        const adur = (audEl?.duration && isFinite(audEl.duration)) ? audEl.duration : Math.max(lines.length*sd + 2, 30);
        const perL = Math.max(1.2, (adur-leadIn-1)/lines.length);
        const activeLine = Math.max(0, Math.min(lines.length-1, Math.floor((t-leadIn)/perL)));
        const lt = perL>0 ? Math.max(0,Math.min(1, ((t-leadIn) - activeLine*perL)/perL)) : 0;
        const line = lines[activeLine] || "";
        ctx.save();
        const fs = Math.floor(H*0.055);
        ctx.font=`900 ${fs}px system-ui,-apple-system,sans-serif`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.lineJoin="round";
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
    };

    draw();

    if (audEl && previewSrc) {
      try {
        const playPromise = audEl.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err:any)=>{ console.warn("audio.play() gagal:", err?.name, err?.message); });
        }
      } catch(e:any){ console.warn("play() throw:", e?.message); }
    }
  }

  // ===== STATIC PREVIEW FRAME =====
  const pendingStaticFrameRef = useRef<number>(0);
  function drawStaticPreview() {
    if (previewPlaying) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) { pendingStaticFrameRef.current = requestAnimationFrame(drawStaticPreview); return; }
    pendingStaticFrameRef.current = 0;
    const ctx = canvas.getContext("2d", {alpha:false,desynchronized:true});
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const sIdx = 0;
    const img:HTMLImageElement|undefined = (drawStaticPreview as any)._imgs?.[sIdx];
    ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);
    const cFilter = getFilterString();
    const drawOne = (im:HTMLImageElement, alpha=1)=>{
      if (!im || !im.naturalWidth) { ctx.fillStyle="#222"; ctx.fillRect(0,0,W,H); return; }
      const ir = im.naturalWidth/im.naturalHeight, cr = W/H;
      let sx=0,sy=0,sw=im.naturalWidth,sh=im.naturalHeight;
      if (ir>cr){sh=im.naturalHeight;sw=sh*cr;sx=(im.naturalWidth-sw)/2;}
      else{sw=im.naturalWidth;sh=sw/cr;sy=(im.naturalHeight-sh)/2;}
      ctx.save(); ctx.globalAlpha=alpha; ctx.filter=cFilter;
      ctx.drawImage(im,sx,sy,sw,sh,0,0,W,H); ctx.restore();
    };
    if (img && img.complete) drawOne(img,1);
    else {
      const im = new Image(); im.crossOrigin="anonymous";
      im.onload = ()=>{
        (drawStaticPreview as any)._imgs = (drawStaticPreview as any)._imgs || [];
        (drawStaticPreview as any)._imgs[sIdx] = im;
        drawStaticPreview();
      };
      im.src = slides[sIdx]?.imageUrl || "";
      ctx.fillStyle="#222"; ctx.fillRect(0,0,W,H);
    }
    const vStrength = (vignetteAmt/100)*0.8;
    const vg = ctx.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.75);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,`rgba(0,0,0,${vStrength})`);
    ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

    if (vizStyle !== "none" && img && img.complete) {
      const rgbv: [number,number,number] = (() => {
        const hex = vizColor.replace("#","");
        const v = hex.length===3?hex.split("").map(c=>c+c).join(""):hex;
        return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)];
      })();
      const idleBars = new Float32Array(64);
      for (let i=0;i<64;i++){
        idleBars[i] = Math.max(0.08, 0.2 + Math.sin(i*0.4)*0.1 + Math.sin(i*0.9)*0.08 + (i%8===0?0.15:0));
      }
      try{
        drawLiveSpectrum(ctx,{W,H,bars:idleBars,bass:0.3,beat:false,style:vizStyle,rgb:rgbv,isMobile:isMobile,phase:0,
          barFill:`rgba(${rgbv[0]},${rgbv[1]},${rgbv[2]},0.9)`});
      }catch(e){}
      ctx.filter = cFilter;
    }

    if (showTitle) {
      const tt = selectedTitle?.text || niche || "";
      if (tt) {
        ctx.save();
        ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="bottom";
        ctx.font=`900 ${Math.floor(H*0.045)}px system-ui,-apple-system,sans-serif`;
        ctx.shadowColor="rgba(0,0,0,0.9)"; ctx.shadowBlur=10;
        ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.lineWidth=4; ctx.lineJoin="round";
        ctx.strokeText(tt,W/2,H-50,W*0.9); ctx.fillText(tt,W/2,H-50,W*0.9);
        ctx.restore();
      }
    }
  }
  const scheduleStatic = useCallback(()=>{
    if (pendingStaticFrameRef.current) return;
    pendingStaticFrameRef.current = requestAnimationFrame(drawStaticPreview);
  }, []);

  useEffect(()=>()=>{ stopPreview(); if(pendingStaticFrameRef.current) cancelAnimationFrame(pendingStaticFrameRef.current); }, []);

  useEffect(()=>{
    if (!previewPlaying && slides.length>0) scheduleStatic();
    // eslint-disable-next-line
  },[previewPlaying,vizStyle,vizColor,activeFilter,brightness,contrast,saturation,sharpen,vignetteAmt,
     showTitle,selectedTitle?.id,niche,slides.length,step,aspectRatio]);

  useEffect(()=>{
    if (slides.length && !previewPlaying) scheduleStatic();
    // eslint-disable-next-line
  },[previewPlaying,slides]);

  useEffect(()=>{
    const handler = (e:Event)=>{
      const d = (e as CustomEvent).detail as any;
      if (!d?.imageUrl) return;
      const newSlide: Slide = {
        id: "slide-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
        imageUrl: d.imageUrl,
      };
      setSlides(cur=>{
        const out = [...cur];
        const at = Math.max(0, Math.min(cur.length, d.insertAt ?? cur.length));
        out.splice(at,0,newSlide);
        return out;
      });
    };
    window.addEventListener("studio-add-image", handler as EventListener);
    return ()=>window.removeEventListener("studio-add-image", handler as EventListener);
  }, []);

  useEffect(()=>{
    if (selectedTitle && !musicTitle) {
      setMusicTitle(selectedTitle.text.slice(0,80));
    }
    // eslint-disable-next-line
  }, [selectedTitleId]);

  function applyPreset(p:any) {
    setNiche(p.niche); setManualKeywords(p.kw); setKeywordMode("manual");
    setMusicGenre(p.genre); setMusicMood(p.mood); setSelectedPreset(p.id);
  }

  // ===== Timeline helpers (strip bawah ala CapCut) =====
  const effSpeedTL = Math.max(0.25, Number(videoSpeed)||1);
  const tdTL = Math.min(slideDuration*0.6, (isMobile?0.5:0.8))/effSpeedTL;
  const perSlideTL = slideDuration/effSpeedTL + tdTL;
  const slidesTotal = slides.length ? slides.length*perSlideTL : 0;
  const audioTotal = previewDuration || 0;
  const totalTimeline = Math.max(slidesTotal, audioTotal, 1);
  const playheadPct = totalTimeline>0 ? Math.min(100, (previewCurrent/totalTimeline)*100) : 0;
  const audioLabel =
    audioMode==="tts" ? (ttsUrl?"🔊 Narasi TTS":"🔊 TTS (belum dibuat)") :
    audioMode==="music" ? (musicUrl?"🎵 Musik upload":"🎵 Musik (belum diupload)") :
    audioMode==="both" ? "🎶 TTS + Musik" :
    audioMode==="aimusic" ? (aiMusicUrl?`🎼 ${musicGeneratedFrom||"Lagu AI"}`:"🎼 AI Music (belum digenerate)") :
    "🔇 Tanpa audio";

  /* ================= JSX ================= */
  return (
    <main className="cc-shell">
      {/* ========== TOPBAR ========== */}
      <header className="cc-topbar">
        <div className="cc-logo">
          <span className="cc-logo-mark">▶</span>
          <span className="cc-logo-text">VERVE<em>AI Video Studio</em></span>
        </div>
        <input
          className="cc-projname"
          value={selectedTitle?.text || niche}
          onChange={()=>{}}
          readOnly
          spellCheck={false}
          title={selectedTitle?.text || niche || "Proyek Tanpa Judul"}
          placeholder="Proyek Tanpa Judul"/>
        <div className="cc-top-actions">
          <button className="cc-tbtn" onClick={()=>setShowApiKeyModal(true)} title="API Key Music">
            🔑 <span className="cc-tbtn-lbl">{sunoApiKey ? (sunoProvider==="kie"?"Kie.ai ✓":sunoProvider==="apiframe"?"apiframe ✓":"Sunor ✓") : "Set Key"}</span>
          </button>
          <button className="cc-tbtn" onClick={()=>{loadDraftsList();setShowDraftPicker(true);}}>
            📂 <span className="cc-tbtn-lbl">Draft</span>
            {draftList.length>0 && <span className="cc-badge">{draftList.length}</span>}
          </button>
          <button className="cc-savebtn" onClick={()=>saveDraftManually()} title="Simpan draft">
            💾 <span className="cc-tbtn-lbl">Simpan</span>
          </button>
          <button className="cc-exportbtn" onClick={()=>goTab("ekspor")}>Export</button>
        </div>
      </header>

      <div className="cc-work">
        {/* ========== ACTIVITY BAR ========== */}
        <nav className="cc-rail">
          {TABS.map(t=>(
            <button key={t.id}
              className={`cc-railbtn ${tab===t.id?"active":""}`}
              onClick={()=>goTab(t.id)}>
              <span className="cc-rail-ic">{t.icon}</span>
              <span className="cc-rail-lb">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* ========== PANEL KIRI ========== */}
        <section className="cc-panel">
          {error && (
            <div className="cc-banner cc-banner-err">
              <span className="flex-1">⚠️ {error}</span>
              <button onClick={()=>setError("")} className="cc-banner-x">×</button>
            </div>
          )}
          {stageText && (
            <div className="cc-banner cc-banner-info"><Spinner/> <span>{stageText}</span></div>
          )}

          {/* ======= TAB: IDE ======= */}
          {tab==="ide" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">🎯 Ide &amp; Keyword</h3>
              <p className="cc-pane-hint">Langkah 1 dari 5 — tentukan topik, AI carikan keyword SEO-nya.</p>
              <div>
                <span className="lbl">⚡ Template Cepat (klik untuk auto-fill)</span>
                <div className="cc-grid2">
                  {[
                    {id:"sedih",niche:"cerita menyentuh ibu & keluarga",kw:"ibu maafkan aku, penyesalan anak, rindu ibu, maafkan aku ibu, kasih ibu",ti:"Sedih Ibu",genre:"pop ballad",mood:"menyentuh, sedih, haru"},
                    {id:"motivasi",niche:"motivasi & semangat hidup",kw:"bangkit dari gagal, jangan menyerah, motivasi kerja, semangat pagi, mulai lagi",ti:"Motivasi",genre:"cinematic epic",mood:"epic, membara, semangat"},
                    {id:"cinta",niche:"cerita cinta & romantis",kw:"rindu dia, cinta pertama, kenangan pacar, setia menunggu, ldr",ti:"Romantis",genre:"pop akustik",mood:"romantis, lembut, manis"},
                    {id:"islamic",niche:"konten islami & dakwah",kw:"ustadz ceramah, hijrah, doa ibu, surga di telapak kaki ibu, jodoh",ti:"Islami",genre:"religi akustik",mood:"tenang, khusyuk, syahdu"},
                    {id:"horror",niche:"cerita horor & misteri",kw:"hantu kampung, kisah seram malam jumat, penampakan nyata, cerita mistis",ti:"Horor",genre:"dark ambient",mood:"mencekam, tegang"},
                    {id:"fyp",niche:"fyp Shorts/TikTok viral",kw:"fakta unik, wow fakta, kamu tidak tahu, trik rahasia, life hack",ti:"FYP Viral",genre:"trap edm",mood:"energetic, asik"},
                  ].map(p=>(
                    <button key={p.id} onClick={()=>applyPreset(p)} className={`style-card text-center ${selectedPreset===p.id?"active":""}`}>
                      <div className="text-sm font-bold">{p.ti}</div>
                      <div className="text-[10px] text-white/50 truncate">{p.genre}</div>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="lbl">Niche / topik channel</span>
                <input className="input" value={niche} onChange={e=>setNiche(e.target.value)}
                       placeholder="Contoh: cerita menyentuh ibu, tips keuangan" />
              </label>
              <div className="cc-grid2">
                <label className="block min-w-0">
                  <span className="lbl">Sumber keyword</span>
                  <select className="select" value={keywordMode} onChange={e=>setKeywordMode(e.target.value as any)}>
                    <option value="ai">🤖 AI (otomatis)</option>
                    <option value="manual">✍️ Manual</option>
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="lbl">Jumlah keyword</span>
                  <input type="number" className="input" value={nKeywords} min={1} max={isMobile?5:10}
                         onChange={e=>setNKeywords(Number(e.target.value))} />
                </label>
              </div>
              {keywordMode === "manual" && (
                <label className="block">
                  <span className="lbl">Keyword (pisah koma)</span>
                  <input className="input" value={manualKeywords} onChange={e=>setManualKeywords(e.target.value)}
                         placeholder="rindu ibu, maafkan ibu, kasih ibu" />
                </label>
              )}
              <button className="btn btn-primary w-full" onClick={doGenerateKeywords} disabled={!!loading}>
                {loading==="/keywords" ? <Spinner/> : "🔑"} Generate Keyword
              </button>
              {keywords.length > 0 && (
                <div>
                  <div className="cc-pane-hint !mb-1">Keyword ({keywords.length}) — tap × untuk hapus:</div>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map(k => (
                      <span key={k.id} className="chip">
                        <span className="truncate max-w-[40vw]">{k.text}</span>
                        <button className="ml-1 text-red-300/80 hover:text-red-400 text-base leading-none"
                          onClick={()=>setKeywords(keywords.filter(x=>x.id!==k.id))}>×</button>
                      </span>
                    ))}
                    <button className="chip hover:bg-white/20"
                      onClick={()=>setKeywords([...keywords,{id:`k${Date.now()}`,text:""}])}>+ tambah</button>
                  </div>
                </div>
              )}
              {keywords.length>0 && <button className="btn btn-primary w-full" onClick={()=>goTab("judul")}>Lanjut ke Judul →</button>}
            </section>
          )}

          {/* ======= TAB: JUDUL ======= */}
          {tab==="judul" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">📝 Judul High-CTR</h3>
              <p className="cc-pane-hint">Langkah 2 dari 5 — pilih satu judul paling menarik.</p>
              <div className="cc-grid2">
                <label className="block">
                  <span className="lbl">Judul per keyword</span>
                  <input type="number" className="input" value={titlesPerKw} min={1} max={3}
                         onChange={e=>setTitlesPerKw(Number(e.target.value))} />
                </label>
              </div>
              <button className="btn btn-primary w-full" onClick={doGenerateTitles} disabled={!!loading}>
                {loading==="/titles" ? <Spinner/> : "📝"} Generate Judul
              </button>
              {titles.length>0 && (
                <div className="space-y-2 max-h-[42vh] overflow-auto pr-1">
                  {titles.map(t=>(
                    <label key={t.id}
                      className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${
                        selectedTitleId===t.id
                          ? "bg-gradient-to-r from-purple-600/25 to-pink-600/25 border-pink-400/60 shadow-lg"
                          : "bg-white/5 border-white/10 hover:bg-white/8"
                      }`}>
                      <input type="radio" name="title" checked={selectedTitleId===t.id}
                             onChange={()=>setSelectedTitleId(t.id)} className="mt-1.5 accent-pink-500 flex-shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm leading-snug break-word">{t.text}</div>
                        <div className="text-xs text-white/50 mt-0.5 truncate">#{t.keyword}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={()=>goTab("ide")}>← Kembali</button>
                {selectedTitleId && <button className="btn btn-primary flex-1" onClick={()=>goTab("media")}>Lanjut ke Media →</button>}
              </div>
            </section>
          )}

          {/* ======= TAB: MEDIA ======= */}
          {tab==="media" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">🖼️ Media &amp; Slide</h3>
              <p className="cc-pane-hint">Langkah 3 dari 5 — gambar untuk tiap slide video.</p>

              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/15 to-pink-600/15 border border-purple-400/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🎬</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">Mode Cerita (Storyboard AI) 🔥</div>
                    <div className="text-[11px] text-white/60">Buat alur cerita, adegan sinematik, dan lirik PER SLIDE otomatis.</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary text-xs py-2" onClick={doGenerateStoryboard} disabled={!!loading || !selectedTitle}>
                    {loading==="storyboard"?<Spinner/>:"✨"} Buat Storyboard + Lirik
                  </button>
                  {storyboard && (
                    <button className="btn btn-ok text-xs py-2" onClick={doGenerateImagesFromStory} disabled={!!loading}>
                      {loading==="img-story"?<Spinner/>:"🎨"} Generate Gambar per Adegan
                    </button>
                  )}
                </div>
                {storyboard && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-white/70 py-1">
                      👁 Lihat {storyboard.scenes?.length||0} adegan + lirik
                    </summary>
                    <div className="mt-2 space-y-1.5 max-h-60 overflow-auto pr-1">
                      {storyboard.scenes?.map((s:any,i:number)=>(
                        <div key={i} className="p-2 rounded-lg bg-black/30 border border-white/5">
                          <div className="font-bold text-[11px] text-pink-300">Adegan {s.scene} · {s.mood}</div>
                          <div className="text-[11px] text-white/80 break-word">{s.scene_desc}</div>
                          <div className="text-[11px] italic text-cyan-200 mt-0.5 break-word">♪ {s.lyric_line}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div className="cc-grid2">
                <label className="block min-w-0">
                  <span className="lbl">Sumber</span>
                  <select className="select" value={imageSource} onChange={e=>setImageSource(e.target.value as any)}>
                    <option value="ai">🤖 AI</option>
                    <option value="upload">📁 Upload</option>
                    <option value="both">🔄 Campur</option>
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="lbl">Jumlah slide</span>
                  <input type="number" className="input" value={nSlides} min={1} max={isMobile?6:12}
                         onChange={e=>setNSlides(Number(e.target.value))} />
                </label>
              </div>
              <label className="block min-w-0">
                <span className="lbl">Rasio / Platform</span>
                <select className="select" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value as any)}>
                  {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>

              <div>
                <span className="lbl">🎨 Style gambar</span>
                <div className="cc-grid2">
                  {IMAGE_STYLE_PRESETS.map(s=>(
                    <button key={s.id} type="button" onClick={()=>setImageStyle(s.id)}
                      className={`style-card ${imageStyle===s.id?"active":""}`}>
                      <div className="text-xs font-bold">{s.label}</div>
                      <div className="text-[10px] text-white/60 mt-0.5 truncate">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {imageSource!=="upload" && (
                  <button className="btn btn-primary flex-1" onClick={doGenerateImages} disabled={!!loading}>
                    {loading==="/image" ? <Spinner/> : "🎨"} Generate Gambar AI
                  </button>
                )}
                {(imageSource==="upload"||imageSource==="both") && (
                  <label className="btn btn-ghost cursor-pointer flex-1 text-center">
                    📁 Upload Gambar
                    <input type="file" accept="image/*" multiple hidden
                           onChange={e=>handleUploadImages(e.target.files)} />
                  </label>
                )}
                {slides.length>0 && (
                  <button className="btn btn-danger text-xs" onClick={()=>{setSlides([]); setLyricLines([]);}}>🗑️</button>
                )}
              </div>

              {slides.length>0 && (
                <div className={`img-grid grid gap-2 ${aspectRatio==="9:16"?"grid-cols-3":aspectRatio==="1:1"?"grid-cols-3":"grid-cols-2"}`}>
                  {slides.map((s,i)=>(
                    <div key={s.id} className="relative rounded-lg overflow-hidden border border-white/10 group">
                      <img src={s.imageUrl} className="w-full h-full object-cover block"
                           alt={`slide ${i+1}`} loading="lazy"
                           style={aspectRatio==="9:16"?{aspectRatio:"9/16"}:aspectRatio==="1:1"?{aspectRatio:"1/1"}:{aspectRatio:"16/9"}}/>
                      <button onClick={()=>{
                        setSlides(slides.filter(x=>x.id!==s.id));
                        setLyricLines(prev => prev.filter((_,idx)=>idx!==i));
                      }}
                        className="absolute top-1 right-1 bg-black/70 rounded-full w-7 h-7 text-red-300 text-base leading-none flex items-center justify-center">×</button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-center text-white py-0.5">{i+1}</div>
                      {(s.lyric || lyricLines[i]) && (
                        <div className="absolute top-1 left-1 bg-pink-500/80 text-[9px] px-1.5 py-0.5 rounded text-white font-bold">♪</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={()=>goTab("judul")}>← Kembali</button>
                {slides.length>0 && <button className="btn btn-primary flex-1" onClick={()=>goTab("audio")}>Lanjut ke Audio →</button>}
              </div>
            </section>
          )}

          {/* ======= TAB: AUDIO ======= */}
          {tab==="audio" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">🎵 Audio &amp; Suno AI</h3>
              <p className="cc-pane-hint">Langkah 4 dari 5 — narasi TTS, musik upload, atau lagu AI.</p>
              <div>
                <span className="lbl">Mode audio</span>
                <div className="grid grid-cols-3 gap-2">
                  {([["tts","🔊 TTS"],["music","🎵 Musik"],["both","🎶 TTS+Musik"],["aimusic","🎼 AI Music"],["none","🔇 Mute"]] as const).map(([v,l])=>(
                    <button key={v} onClick={()=>setAudioMode(v as AudioMode)}
                      className={`btn ${audioMode===v?"btn-primary":"btn-ghost"} text-xs px-2 min-h-[42px]`}>{l}</button>
                  ))}
                </div>
              </div>

              {/* AI MUSIC PANEL */}
              {(audioMode==="aimusic"||audioMode==="both") && (
                <div className="space-y-3 p-3 rounded-xl bg-gradient-to-br from-purple-600/15 to-pink-600/15 border border-purple-400/30">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎼</span>
                      <span className="text-sm font-bold">AI Music · CREATE</span>
                      <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full font-bold">{musicModel.replace("suno-","Suno ").toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {sunoApiKey && sunoCredits && (
                        <span className="text-[10px] text-green-300 bg-green-500/10 px-2 py-0.5 rounded-full">{sunoCredits}</span>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={()=>setShowApiKeyModal(true)}>
                        🔑 {sunoApiKey ? (sunoProvider==="kie"?"Kie.ai":sunoProvider==="apiframe"?"apiframe.ai":"Sunor.cc")+" ✓" : "Set Key"}
                      </button>
                    </div>
                  </div>

                  {!sunoApiKey && (
                    <div className="text-[11px] p-2 rounded-lg bg-yellow-500/10 border border-yellow-400/30 text-yellow-100">
                      💡 Klik <b>🔑 Set Key</b> lalu pilih <b>🥇 Kie.ai</b> (5.000 kredit GRATIS, lancar di Indo) untuk mulai bikin lagu 🔥
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block col-span-2">
                      <span className="lbl">Model</span>
                      <select className="select text-sm py-2" value={musicModel} onChange={e=>setMusicModel(e.target.value)}>
                        {MUSIC_MODELS.map(m=>(
                          <option key={m.id} value={m.id}>{m.label} · {m.credit}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="lbl">Tipe</span>
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" onClick={()=>setMusicVocalType("vocal")}
                          className={`btn btn-sm ${musicVocalType==="vocal"?"btn-primary":"btn-ghost"}`}>🎤 Vokal</button>
                        <button type="button" onClick={()=>setMusicVocalType("instrumental")}
                          className={`btn btn-sm ${musicVocalType==="instrumental"?"btn-primary":"btn-ghost"}`}>🎹 Instr</button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="lbl">Vokal</span>
                      <select className="select text-sm py-2" value={musicVocalGender} onChange={e=>setMusicVocalGender(e.target.value as any)} disabled={musicVocalType==="instrumental"}>
                        <option value="auto">🔀 Auto</option>
                        <option value="male">♂ Pria</option>
                        <option value="female">♀ Wanita</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-white/50 self-center mr-1">Style cepat:</span>
                    {[
                      { g:"slow rock", t:"slow", e:"90s", i:"gitar listrik melow", m:"melancholic, menyentuh" },
                      { g:"pop ballad", t:"slow", e:"", i:"piano akustik", m:"emotional, sad" },
                      { g:"dangdut koplo", t:"mid", e:"2000s", i:"gendang, keyboard", m:"sendu" },
                      { g:"akustik", t:"slow", e:"", i:"gitar akustik petikan", m:"warm, intimate" },
                      { g:"religi", t:"slow", e:"modern", i:"seruling, piano", m:"khusyuk, tenang" },
                    ].map((p,i)=>(
                      <button key={i} type="button"
                        onClick={()=>{
                          setMusicGenre(p.g); setMusicTempo(p.t); setMusicEra(p.e);
                          setMusicInstruments(p.i); setMusicMood(p.m);
                        }}
                        className="chip text-[10px] cursor-pointer hover:bg-white/20">{p.g}</button>
                    ))}
                  </div>

                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="lbl !mb-0 uppercase tracking-wider text-[11px] font-bold text-white/60">Title</span>
                      <span className="text-[10px] text-white/40">{musicTitle.length} / 80</span>
                    </div>
                    <input className="input py-2.5 text-sm" value={musicTitle}
                      onChange={e=>setMusicTitle(e.target.value.slice(0,80))}
                      placeholder="Judul lagu... (otomatis dari judul video)"/>
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="lbl !mb-0 uppercase tracking-wider text-[11px] font-bold text-white/60">Lyrics</span>
                      <div className="flex gap-1">
                        <button type="button" className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-purple-200"
                                onClick={()=>copyToClipboard(musicLyrics)}>Copy</button>
                        <button type="button" className="text-[10px] px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300"
                                onClick={()=>setMusicLyrics("")}>Delete</button>
                        <span className="text-[10px] text-white/40 ml-1 self-center">{musicLyrics.length} / 5000</span>
                      </div>
                    </div>
                    <textarea className="textarea text-sm" rows={5}
                      value={musicLyrics}
                      onChange={e=>setMusicLyrics(e.target.value.slice(0,5000))}
                      placeholder={"[Verse 1]\nTulis lirikmu di sini...\n\n[Chorus]\n...\n\nKlik '✍️ Buat Lirik Dulu' untuk dibuatkan otomatis."}/>
                    <div className="text-[10px] text-white/50 mt-1">💡 Pakai format <code className="bg-black/40 px-1 rounded">[Verse 1]</code>, <code className="bg-black/40 px-1 rounded">[Chorus]</code> agar hasilnya akurat.</div>
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="lbl !mb-0 uppercase tracking-wider text-[11px] font-bold text-white/60">Deskripsi Utama <span className="text-pink-300 normal-case tracking-normal">(wajib)</span></span>
                      <span className="text-[10px] text-white/40">{musicStylePrompt.length} / 1000</span>
                    </div>
                    <textarea className="textarea text-sm" rows={3}
                      value={musicStylePrompt}
                      onChange={e=>setMusicStylePrompt(e.target.value.slice(0,1000))}
                      placeholder={"pop, acoustic, male vocal, melancholic, slow tempo, guitar, piano, 90s, indonesian, studio quality..."}/>
                    <div className="text-[10px] text-white/50 mt-1">💡 Isi dengan keyword gaya musik dalam <b>bahasa Inggris</b> — ini paling menentukan hasil lagu.</div>
                  </label>

                  <div className="text-[11px] p-2 rounded-lg bg-orange-500/10 border border-orange-400/30 text-orange-100 flex gap-2 items-start">
                    <span>⚠️</span>
                    <span className="flex-1">
                      Pastikan <b>Title + Lyrics + Deskripsi</b> sudah sesuai SEBELUM klik CREATE.
                      <b> 1x CREATE = 12 kredit</b>.
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost text-xs py-2.5" onClick={doGenerateLyrics} disabled={!!loading}>
                      {loading==="lyrics"?<Spinner/>:"✍️"} Buat Lirik Dulu
                    </button>
                    <button className="btn btn-ghost text-xs py-2.5" onClick={()=>{
                      const tempoEn = musicTempo==="fast"?"uptempo":musicTempo==="mid"?"mid-tempo":"slow tempo";
                      const eraEn = musicEra ? `${musicEra} era, ` : "";
                      const vocalEn = musicVocalGender==="female"?"female vocal":musicVocalGender==="male"?"male vocal":"male vocal";
                      setMusicStylePrompt([musicGenre, eraEn+tempoEn, vocalEn, musicMood, musicInstruments, "high quality, studio recording"].filter(Boolean).join(", "));
                    }}>🎛️ Isi Style
                    </button>
                    <button className="btn btn-primary text-xs py-2.5 flex-1 glow" onClick={doGenerateAIMusic} disabled={!!loading}>
                      {loading==="aimusic"?<Spinner/>:"✨"} CREATE
                    </button>
                    <button className="btn btn-ghost text-xs py-2.5" onClick={()=>{
                      setMusicTitle(selectedTitle?.text||""); setMusicLyrics(""); setMusicStylePrompt("");
                      setAiMusicUrl(""); setAiMusicStatus(""); setSunoCredits("");
                      setAiMusicTaskId(""); setAiMusicPolling(false);
                    }}>Clear</button>
                  </div>

                  {aiMusicStatus && (
                    <div className="flex items-start gap-2 justify-between">
                      <div className="text-[11px] text-white/70 break-word flex-1">Status: {aiMusicStatus}</div>
                      {aiMusicTaskId && !aiMusicUrl && !aiMusicPolling && (
                        <button onClick={doCheckAiMusicStatus}
                          className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-purple-500/30 hover:bg-purple-500/50 text-purple-100 border border-purple-400/30 whitespace-nowrap">
                          🔄 Cek Status
                        </button>
                      )}
                    </div>
                  )}
                  {aiMusicUrl && (
                    <div className="bg-black/30 rounded-lg p-2 border border-white/10">
                      <div className="text-[11px] text-green-300 mb-1 font-bold">✅ Lagu siap — {musicGeneratedFrom || musicTitle}</div>
                      <audio controls src={proxifyAudioUrl(aiMusicUrl)} className="w-full"/>
                      <a href={proxifyAudioUrl(aiMusicUrl)} download={`${musicGeneratedFrom||"verve-song"}.mp3`}
                        className="block text-center mt-2 text-[11px] text-purple-200 underline">⬇️ Download MP3</a>
                    </div>
                  )}
                </div>
              )}

              {(audioMode==="tts"||audioMode==="both") && (
                <div className="space-y-3 p-3 rounded-xl bg-black/30 border border-white/10">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-white/70 font-semibold">Voice:</label>
                    <select className="select w-auto text-sm py-1.5" value={ttsVoice} onChange={e=>setTtsVoice(e.target.value)}>
                      {VOICES.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={doAutoScript} disabled={!!loading}>✍️ Auto Script AI</button>
                  </div>
                  <textarea className="textarea text-sm" rows={4} value={ttsText}
                    onChange={e=>setTtsText(e.target.value)}
                    placeholder="Tulis narasi di sini, atau klik Auto Script untuk dibuatkan AI."/>
                  <button className="btn btn-primary w-full" onClick={doGenerateTTS} disabled={!!loading}>
                    {loading==="/tts"?<Spinner/>:"🔊"} Buat Narasi Suara
                  </button>
                  {ttsUrl && <audio controls src={ttsUrl} className="w-full" />}
                </div>
              )}
              {(audioMode==="music"||audioMode==="both") && (
                <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                  <label className="block text-xs text-white/70 font-semibold">Background music (mp3/wav, maks 15MB)</label>
                  <input type="file" accept="audio/*" className="text-sm text-white/80"
                         onChange={e=>handleUploadMusic(e.target.files?.[0])}/>
                  {musicUrl && <audio controls src={musicUrl} className="w-full" />}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={()=>goTab("media")}>← Kembali</button>
                <button className="btn btn-primary flex-1" onClick={()=>goTab("ekspor")}>Lanjut ke Ekspor →</button>
              </div>
            </section>
          )}

          {/* ======= TAB: GAYA ======= */}
          {tab==="gaya" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">✨ Gaya Visual</h3>
              <p className="cc-pane-hint">Spectrum picker, stiker overlay, transisi, filter &amp; adjust — semua berlaku live ke preview &amp; render.</p>

              <div className="p-3 rounded-xl bg-gradient-to-br from-pink-600/10 to-purple-600/10 border border-pink-400/20">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="lbl !mb-0 flex items-center gap-1.5">🎚️ Gaya Spektrum</span>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <span>Warna</span>
                    <input type="color" value={vizColor} onChange={e=>setVizColor(e.target.value)}
                           className="w-8 h-8 rounded-lg bg-transparent border border-white/20 cursor-pointer p-0.5"/>
                  </label>
                </div>
                <div className="cc-grid2">
                  {VIZ_STYLES.map(s=>(
                    <button key={s.id} type="button" onClick={()=>setVizStyle(s.id)}
                      className={`style-card !p-2 !min-h-[52px] ${vizStyle===s.id?"active":""}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{s.emoji}</span>
                        <span className="text-[11px] font-bold leading-tight">{s.label}</span>
                      </div>
                      <div className="text-[9px] text-white/50 mt-0.5 truncate">{s.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Stiker Overlay</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {([
                      ["bars-bottom","📊","Bars Bawah"],
                      ["none","🚫","Polos"],
                      ["subscribe","🔴","Subscribe"],
                      ["like","👍","Like"],
                      ["bell","🔔","Lonceng"],
                      ["fire","🔥","Fire"],
                      ["disc","💿","Disc"],
                      ["wave-center","〰️","Wave Tengah"],
                      ["wave-bottom","🌊","Wave Bawah"],
                      ["circle","⭕","Circle"],
                      ["bars-top","📈","Bars Atas"],
                      ["glow-ring","💫","Glow Ring"],
                      ["nowplaying","🎧","Now Playing"],
                    ] as const).map(([v,e,l])=>(
                      <button key={v} type="button" onClick={()=>setSpectrumSticker(v)}
                        className={`chip text-[10px] px-2 py-1.5 min-h-[32px] ${spectrumSticker===v?"!bg-pink-500/40 !border-pink-400 !text-white":""}`}>
                        <span className="mr-0.5">{e}</span>{l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="lbl">➡️ Transisi antar slide</span>
                <div className="grid grid-cols-3 gap-2">
                  {TRANSITION_STYLES.map(t=>(
                    <button key={t.id} onClick={()=>setTransition(t.id as Transition)}
                      className={`style-card !p-2 !min-h-[44px] text-center ${transition===t.id?"active":""}`}>
                      <div className="text-xs">{t.emoji} {t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-grid2">
                <label className="block">
                  <span className="lbl">Durasi slide (dtk)</span>
                  <input type="number" className="input" min={1} max={15} step={0.5} value={slideDuration}
                         onChange={e=>setSlideDuration(Number(e.target.value))}/>
                </label>
                <label className="block">
                  <span className="lbl">Durasi transisi (dtk)</span>
                  <input type="number" className="input" min={0} max={3} step={0.1} value={transitionDur}
                         onChange={e=>setTransitionDur(Number(e.target.value))}/>
                </label>
              </div>

              <div>
                <span className="lbl">🎛 Filter video</span>
                <div className="flex flex-wrap gap-1.5">
                  {(["none","cinematic","vivid","warm","cool","bw","vintage","dreamy","senja"] as const).map(f=>(
                    <button key={f} onClick={()=>setActiveFilter(f)}
                      className={`chip text-[10px] ${activeFilter===f?"!bg-pink-500/40 !border-pink-400 !text-white":""}`}>
                      {f==="none"?"🚫 Normal":f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {([
                  ["☀️ Brightness",brightness,setBrightness],
                  ["◐ Kontras",contrast,setContrast],
                  ["🎨 Saturasi",saturation,setSaturation],
                  ["🔩 Sharpen",sharpen,setSharpen],
                  ["🌑 Vignette",vignetteAmt-75,(v:number)=>setVignetteAmt(v+75)],
                ] as [string,number,(v:number)=>void][]).map(([lb,v,set],i)=>(
                  <label key={i} className="block">
                    <div className="flex justify-between text-[11px] mb-0.5"><span>{lb}</span><b className="text-pink-300">{v>0?`+${v}`:v}</b></div>
                    <input type="range" min={-100} max={100} value={v} onChange={e=>set(Number(e.target.value))} className="w-full accent-pink-500"/>
                  </label>
                ))}
                <button className="btn btn-ghost btn-sm w-full" onClick={resetAdjust}>♻️ Reset Filter &amp; Adjust</button>
              </div>

              <label className="block">
                <div className="flex justify-between text-[11px] mb-1"><span>⚡ Kecepatan video</span><b className="text-pink-300">{videoSpeed.toFixed(2)}x</b></div>
                <input type="range" min={0.5} max={2} step={0.25} value={videoSpeed}
                       onChange={e=>setVideoSpeed(Number(e.target.value))} className="w-full accent-pink-500"/>
              </label>

              <label className="block">
                <span className="lbl">🖋 Gaya caption lirik</span>
                <select className="select" value={captionStyle} onChange={e=>setCaptionStyle(e.target.value as CaptionStyle)}>
                  <option value="capcut">CapCut (putih tebal outline)</option>
                  <option value="karaoke">Karaoke (kuning aktif)</option>
                  <option value="minimal">Minimal</option>
                  <option value="bold">Bold besar</option>
                </select>
              </label>

              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={()=>goTab("audio")}>← Audio</button>
                <button className="btn btn-primary flex-1" onClick={()=>goTab("ekspor")}>Lanjut ke Ekspor →</button>
              </div>
            </section>
          )}

          {/* ======= TAB: T2V ======= */}
          {tab==="t2v" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">🎬 Text-to-Video AI</h3>
              <div className="text-xs p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 break-word">
                💡 Fitur ini tergantung model video. Kalau 404 — pakai <b>Slideshow + Spectrum</b> yang 100% jalan & jauh lebih cepat.
              </div>
              <label className="block">
                <span className="lbl">Prompt (Bahasa Inggris lebih bagus)</span>
                <textarea className="textarea" rows={5} value={t2vPrompt}
                  onChange={e=>setT2vPrompt(e.target.value)}
                  placeholder="Cth: Cinematic slow motion of a lonely wolf walking in a snowy forest at golden hour, 4k, moody"/>
              </label>
              <div className="cc-grid2">
                <label className="block min-w-0">
                  <span className="lbl">Durasi {isMobile?"(max 5s di HP)":""}</span>
                  <input type="number" className="input" min={2} max={isMobile?5:10} value={t2vDuration}
                         onChange={e=>setT2vDuration(Number(e.target.value))}/>
                </label>
                <label className="block min-w-0">
                  <span className="lbl">Rasio</span>
                  <select className="select" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value as any)}>
                    {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="lbl">Gambar awal (opsional)</span>
                <input type="url" className="input" value={t2vImageUrl} onChange={e=>setT2vImageUrl(e.target.value)}
                       placeholder="https://..."/>
              </label>
              <button className="btn btn-primary glow w-full" onClick={doT2V} disabled={!!loading}>
                {loading==="t2v"?<Spinner/>:"🎬"} Generate Video
              </button>
              {t2vResult && (
                <div className="space-y-2">
                  <div className="text-xs">Status: <b>{t2vResult.status}</b></div>
                  {t2vResult.video_url ? (
                    <>
                      <video controls src={t2vResult.video_url} className="w-full rounded-xl"/>
                      <a className="btn btn-primary w-full text-center" href={t2vResult.video_url} target="_blank" rel="noreferrer" download>💾 Download</a>
                    </>
                  ) : (
                    <div className="text-yellow-300 text-xs break-word">
                      {t2vResult.error || "Video masih diproses / model tidak tersedia."}
                    </div>
                  )}
                </div>
              )}
              <div className="text-[11px] text-white/50 space-y-1 p-2 rounded-lg bg-white/5">
                <b className="text-white/70">Tips prompt pro:</b>
                <div>• Pakai Bahasa Inggris • shot type (close-up/aerial) • motion (slow pan) • lighting (golden hour) • tutup dengan &quot;4k, cinematic&quot;</div>
              </div>
            </section>
          )}

          {/* ======= TAB: EKSPOR ======= */}
          {tab==="ekspor" && (
            <section className="cc-pane">
              <h3 className="cc-pane-title">🚀 Ekspor</h3>
              <ExportPanel
                slides={slides}
                isMobile={isMobile}
                selectedTitle={selectedTitle}
                niche={niche}
                quality={quality} setQuality={setQuality}
                loading={loading} progress={progress} renderETA={renderETA} stageText={stageText}
                videoUrl={videoUrl} videoBlob={videoBlob}
                meta={meta}
                onBack={()=>goTab("audio")}
                onRender={doRender}
                onDownload={downloadVideo}
                onCopy={copyField}
                copiedField={copiedField}
                onDownloadMeta={downloadMetaText}
              />
              {videoUrl && meta && (
                <div className="mt-3 space-y-2">
                  <h4 className="text-sm font-black">📋 YouTube Metadata (siap copy)</h4>
                  <MetaRow label="🏷️ Judul High-CTR" value={meta.titleHighCTR} onCopy={()=>copyField("title",meta.titleHighCTR)} copied={copiedField==="title"}/>
                  <MetaRow label="📝 Deskripsi" value={meta.description} onCopy={()=>copyField("desc",meta.description)} copied={copiedField==="desc"} multiline/>
                  <MetaRow label="#️⃣ Tags" value={meta.tags.join(", ")} onCopy={()=>copyField("tags",meta.tags.join(", "))} copied={copiedField==="tags"}/>
                  <MetaRow label="🔖 Hashtags" value={meta.hashtags} onCopy={()=>copyField("hash",meta.hashtags)} copied={copiedField==="hash"}/>
                  <button onClick={downloadMetaText} className="btn btn-primary w-full">📥 Download semua metadata (.txt)</button>
                </div>
              )}
            </section>
          )}
        </section>

        {/* ========== STAGE (Preview) ========== */}
        <section className="cc-stage">
          <div className="cc-stage-canvas">
            <div id="preview-canvas-host"
                 className="cc-canvas-host"
                 style={aspectRatio==="9:16"?{aspectRatio:"9/16"}:aspectRatio==="1:1"?{aspectRatio:"1/1"}:{aspectRatio:"16/9"}}>
              <canvas ref={previewCanvasRef}
                width={aspectRatio==="9:16"?480:aspectRatio==="1:1"?480:854}
                height={aspectRatio==="9:16"?854:aspectRatio==="1:1"?480:480}
                className="w-full h-full block"
                style={{background:"#000"}}/>
              {slides.length===0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40 text-xs text-center px-3">
                  <span className="text-3xl opacity-60">🎬</span>
                  <span>Preview video muncul di sini<br/>Ikuti langkah di panel kiri 👈</span>
                </div>
              )}
              {slides.length>0 && !previewPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-white/90 text-[10px] border border-white/10">
                    ▶️ Tap Play buat preview bergerak
                  </div>
                </div>
              )}
              {slides.length>1 && previewPlaying && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-white text-[10px] border border-white/10">
                  🖼️ {Math.min(slides.length, Math.floor(previewCurrent/(Math.max(1,slideDuration)+Math.min(slideDuration*0.6,isMobile?0.5:0.8)))+1)}/{slides.length}
                </div>
              )}
              {error==="" && stageText==="" && loading==="render" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center">
                    <Spinner/>
                    <div className="text-xs mt-2 text-white/80">Rendering… {Math.round(progress*100)}%</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Transport ala CapCut */}
          <div className="cc-transport">
            <button className="cc-tp" onClick={()=>seekPreview(0)} title="Ke awal">⏮</button>
            <button className="cc-tp cc-tp-play" onClick={togglePreview} title="Play/Pause">
              {previewPlaying ? "⏸" : "▶"}
            </button>
            <button onClick={()=>setPreviewMuted(m=>{
              const nm = !m;
              if (previewAudioRef.current) previewAudioRef.current.muted = nm;
              return nm;
            })} className="cc-tp" title="Mute">{previewMuted ? "🔇" : "🔊"}</button>
            <div className="cc-tp-time">
              <b>{formatDur(previewCurrent)}</b> / {formatDur(Math.max(previewDuration, slidesTotal))}
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(previewDuration, slidesTotal, 1)}
              step={0.1}
              value={Math.min(previewCurrent, Math.max(previewDuration, slidesTotal, 1))}
              onChange={e=>seekPreview(Number(e.target.value))}
              className="cc-tp-seek accent-teal-400"
            />
            <div className="cc-tp-quick">
              <button onClick={()=>setShowLyrics(v=>!v)} className={`cc-tp-mini ${showLyrics?"on":""}`} title="Lirik">🎤</button>
              <button onClick={()=>setShowTitle(v=>!v)} className={`cc-tp-mini ${showTitle?"on":""}`} title="Judul">🏷️</button>
            </div>
          </div>
          {videoUrl && (
            <div className="cc-result">
              <div className="cc-result-head">
                <span>✅ Hasil Video</span>
                <span className="text-white/50 text-[10px]">{videoBlob && `${(videoBlob.size/1024/1024).toFixed(1)} MB · ${videoBlob?.type.includes("mp4")?"MP4":"WebM"}`}</span>
              </div>
              <video controls src={videoUrl} className="cc-result-video"/>
              <button className="btn btn-primary w-full !mt-2" onClick={downloadVideo}>⬇️ Download Video</button>
            </div>
          )}
        </section>

        {/* ========== INSPECTOR ========== */}
        <aside className="cc-inspector">
          <h3 className="cc-pane-title">⚙️ Pengaturan</h3>
          <div className="cc-pane">
            <label className="block">
              <span className="lbl">Kualitas render</span>
              <select className="select" value={quality} onChange={e=>setQuality(e.target.value as RenderQuality)}>
                {QUALITY_OPTIONS.map(q=><option key={q.id} value={q.id}>{q.label} — {q.res} {q.fps}fps</option>)}
              </select>
            </label>
            <label className="block">
              <span className="lbl">Rasio / Platform</span>
              <select className="select" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value as any)}>
                {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <div className="cc-grid2">
              <label className="block">
                <span className="lbl">Durasi slide</span>
                <input type="number" className="input" min={1} max={15} step={0.5} value={slideDuration}
                       onChange={e=>setSlideDuration(Number(e.target.value))}/>
              </label>
              <label className="block">
                <span className="lbl">Transisi (dtk)</span>
                <input type="number" className="input" min={0} max={3} step={0.1} value={transitionDur}
                       onChange={e=>setTransitionDur(Number(e.target.value))}/>
              </label>
            </div>
            <label className="block">
              <span className="lbl">Transisi</span>
              <select className="select" value={transition} onChange={e=>setTransition(e.target.value as Transition)}>
                {TRANSITION_STYLES.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
              </select>
            </label>
            <div className="cc-tgl-row">
              <button onClick={()=>setShowTitle(v=>!v)} className={`cc-tgl ${showTitle?"on":""}`}>🏷️ Judul</button>
              <button onClick={()=>setShowLyrics(v=>!v)} className={`cc-tgl ${showLyrics?"on":""}`}>🎤 Lirik</button>
            </div>
            <div>
              <span className="lbl">Logo channel (opsional)</span>
              <div className="cc-grid2">
                <label className="btn btn-ghost btn-sm cursor-pointer text-center">
                  ⬆️ Upload
                  <input type="file" accept="image/*" hidden onChange={e=>handleLogoUpload(e.target.files?.[0])}/>
                </label>
                <select className="select" value={logoPosition} onChange={e=>setLogoPosition(e.target.value as any)}>
                  <option value="center">Tengah (pulsa)</option>
                  <option value="corner">Pojok</option>
                  <option value="none">Tanpa</option>
                </select>
              </div>
              {logoDataUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <img src={logoDataUrl} className="w-10 h-10 rounded-full border border-white/20" alt="logo"/>
                  <button className="btn btn-danger btn-sm" onClick={()=>setLogoDataUrl("")}>🗑️ Hapus</button>
                </div>
              )}
            </div>
            <div className="cc-mini-meta">
              <div><span>Niche</span><b className="truncate">{niche||"—"}</b></div>
              <div><span>Judul</span><b className="truncate">{selectedTitle?.text||"—"}</b></div>
              <div><span>Slide</span><b>{slides.length}</b></div>
              <div><span>Rasio</span><b>{aspectRatio}</b></div>
              <div><span>Durasi ±</span><b>{formatDur(slidesTotal)}</b></div>
              <div><span>Spektrum</span><b className="capitalize">{vizStyle}</b></div>
              <div><span>Audio</span><b className="capitalize">{audioMode}</b></div>
            </div>
            <a className="btn btn-ghost btn-sm w-full" onClick={()=>goTab("gaya")}>✨ Atur Gaya &amp; Spektrum →</a>
          </div>
        </aside>
      </div>

      {/* ========== TIMELINE ========== */}
      <footer className="cc-timeline">
        <div className="cc-tl-toolbar">
          <span className="cc-tl-title">TIMELINE</span>
          <span className="cc-tl-info">{slides.length} slide · ±{formatDur(slidesTotal)} · {audioLabel}</span>
          <span className="flex-1"/>
          <button className="cc-tl-tool" onClick={()=>setSlideDuration(sd=>Math.max(1.5, sd-0.5))} title="Kurangi durasi slide">⏩ -0.5s</button>
          <button className="cc-tl-tool" onClick={()=>setSlideDuration(sd=>Math.min(15, sd+0.5))} title="Tambah durasi slide">⏪ +0.5s</button>
          <button className="cc-tl-tool warn" onClick={()=>{setSlides([]);setLyricLines([]);}} title="Hapus semua slide">🗑 Clear</button>
        </div>
        <div className="cc-tl-body">
          <div className="cc-tl-labelcol">
            <div className="cc-tl-lblrow">🖼️ Slides</div>
            <div className="cc-tl-lblrow">🎧 Audio</div>
          </div>
          <div className="cc-tl-scroll" onClick={(e)=>{
            const el = (e.currentTarget.querySelector(".cc-tl-tracks") as HTMLElement);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width));
            seekPreview(pct*totalTimeline);
          }}>
            <div className="cc-tl-tracks" style={{minWidth: Math.max(100, slides.length*64)+120}}>
              <div className="cc-tl-playhead" style={{left:`calc(${playheadPct}% - 1px)`}}/>
              <div className="cc-tl-trackrow">
                {slides.map((s,i)=>{
                  const leftPct = (i*perSlideTL/totalTimeline)*100;
                  const widthPct = Math.max(2,(perSlideTL/totalTimeline)*100);
                  return (
                    <div key={s.id} className="cc-tl-clip cc-tl-clip-video"
                         style={{left:`${leftPct}%`,width:`calc(${widthPct}% - 3px)`}}
                         title={`Slide ${i+1}`}
                         onClick={(e)=>{e.stopPropagation();seekPreview(i*perSlideTL);}}>
                      <img src={s.imageUrl} alt="" draggable={false}/>
                      <span className="cc-tl-clip-n">{i+1}</span>
                      {(s.lyric||lyricLines[i]) && <span className="cc-tl-clip-l">♪</span>}
                      <button className="cc-tl-clip-x" onClick={(e)=>{
                        e.stopPropagation();
                        setSlides(sl=>sl.filter(x=>x.id!==s.id));
                        setLyricLines(prev=>prev.filter((_,idx)=>idx!==i));
                      }}>×</button>
                    </div>
                  );
                })}
                <label className="cc-tl-clip cc-tl-clip-add" style={{left:`${Math.min(97,(slides.length*perSlideTL/totalTimeline)*100)}%`}} title="Tambah gambar">
                  ＋
                  <input type="file" accept="image/*" multiple hidden onChange={e=>handleUploadImages(e.target.files)}/>
                </label>
              </div>
              <div className="cc-tl-trackrow audio">
                <div className={`cc-tl-clip cc-tl-clip-audio ${(audioMode!=="none")?"":"dim"}`}
                     style={{left:0,width:`calc(${audioTotal>0?Math.min(100,(audioTotal/totalTimeline)*100):100}% - 3px)`}}>
                  <span className="cc-tl-clip-t">{audioLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Audio global (selalu mounted) */}
      <audio ref={previewAudioRef} preload="metadata" playsInline crossOrigin="anonymous" className="hidden" />

      <ApiKeyModal
        open={showApiKeyModal}
        onClose={()=>setShowApiKeyModal(false)}
        onSave={saveSunoKey}
        currentKey={sunoApiKey}
        currentProvider={sunoProvider}
      />

      {/* DRAFT PICKER MODAL */}
      {showDraftPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={()=>setShowDraftPicker(false)}>
          <div className="w-full max-w-md bg-gradient-to-b from-[#1a0b2e] to-[#0a0418] rounded-2xl border border-purple-500/30 shadow-2xl max-h-[85vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-black flex items-center gap-2">📂 Draft Tersimpan</h3>
              <button onClick={()=>setShowDraftPicker(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-lg">×</button>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto">
              <button onClick={startNewDraft} className="w-full p-3 rounded-xl border-2 border-dashed border-pink-400/40 hover:border-pink-400 hover:bg-pink-500/10 text-pink-200 text-sm font-bold flex items-center justify-center gap-2">
                ➕ Mulai Project Baru
              </button>
              <button onClick={()=>saveDraftManually()} className="w-full p-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/40 border border-purple-400/30 text-purple-100 text-sm font-bold flex items-center justify-center gap-2">
                💾 Simpan Project Sekarang
              </button>
              <div className="text-[10px] text-white/50 pt-2">
                💡 Auto-save 30 detik. Max {MAX_DRAFTS} draft.
              </div>
              <div className="pt-2 border-t border-white/10 space-y-2">
                {draftList.length===0 ? (
                  <div className="text-center text-white/40 text-xs py-8">Belum ada draft tersimpan.</div>
                ) : draftList.map(d=>(
                  <div key={d.id} className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-purple-900/50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {d.thumb && d.thumb.length>100 ? (
                        <img src={d.thumb} className="w-full h-full object-cover" alt=""/>
                      ) : (
                        <span className="text-lg">🎞️</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{d.title}</div>
                      <div className="text-[10px] text-white/50 flex gap-2 flex-wrap">
                        <span>🖼️ {d.slides||0} slide</span>
                        <span>• {new Date(d.updatedAt).toLocaleDateString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                      </div>
                    </div>
                    <button onClick={()=>loadDraft(d.id)} className="shrink-0 px-3 py-1.5 rounded-lg bg-pink-500/80 hover:bg-pink-500 text-white text-[11px] font-bold">Buka</button>
                    <button onClick={()=>{if(confirm("Hapus draft ini?"))deleteDraft(d.id);}} className="shrink-0 w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-200 text-sm">🗑️</button>
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

function MetaRow({label,value,onCopy,copied,multiline}:{label:string;value:string;onCopy:()=>void;copied:boolean;multiline?:boolean;}) {
  return (
    <div className="mb-2 min-w-0">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-xs text-white/70 font-semibold truncate">{label}</div>
        <button onClick={onCopy}
          className={`btn btn-sm ${copied?"bg-green-600 text-white":"btn-ghost"}`}>
          {copied?"✓":"SALIN"}
        </button>
      </div>
      <div className="text-xs bg-black/40 rounded-lg p-3 border border-white/10 break-word" style={multiline?{whiteSpace:"pre-wrap",lineHeight:1.6}:{}}>{value}</div>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow"/>;
}

function formatTime(s:number): string {
  s = Math.round(s);
  if (s<60) return `${s}d`;
  const m = Math.floor(s/60), sec = s%60;
  return `${m}m${sec>0?` ${sec}d`:""}`;
}
function formatDur(s:number): string {
  if (!isFinite(s)||s<0) s=0;
  const m=Math.floor(s/60), sec=Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

function proxifyAudioUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const h = new URL(url).hostname.toLowerCase();
    const butuhProxy =
      h.includes("kie.ai") || h.includes("suno") || h.includes("apiframe") ||
      h.includes("sunor") || h.includes("aimusic") || h.includes("r2.dev") ||
      h.includes("cdn2") || h.includes("cdn.");
    if (!butuhProxy) return url;
    return `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}

function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate;
  const samples = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh*bytesPerSample;
  const byteRate = sr*blockAlign;
  const dataSize = samples*blockAlign;
  const out = new ArrayBuffer(44+dataSize);
  const v = new DataView(out);
  const ws=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF"); v.setUint32(4,36+dataSize,true); ws(8,"WAVE"); ws(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true); v.setUint32(28,byteRate,true); v.setUint16(32,blockAlign,true); v.setUint16(34,16,true);
  ws(36,"data"); v.setUint32(40,dataSize,true);
  let off=44;
  const ch:Float32Array[] = [];
  for (let c=0;c<numCh;c++) ch.push(buf.getChannelData(c));
  for (let i=0;i<samples;i++){
    for (let c=0;c<numCh;c++){
      const s = Math.max(-1,Math.min(1,ch[c][i]));
      v.setInt16(off, s<0?s*0x8000:s*0x7fff, true); off+=2;
    }
  }
  return out;
}
