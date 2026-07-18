"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SpectrumVisualizer from "@/components/SpectrumVisualizer";
import { renderSlideshow, downloadBlob } from "@/lib/recorder";
import type { Quality as RenderQuality, Transition } from "@/lib/recorder";
import { cropImageToRatio, copyToClipboard } from "@/lib/imgutils";
import {
  VIZ_STYLES, TRANSITION_STYLES, QUALITY_OPTIONS, ASPECT_RATIOS,
} from "@/lib/types";
import type { VizStyle, AudioMode, ImageSource } from "@/lib/types";
import type { VideoMeta } from "@/lib/hcnsec";

type Mode = "slideshow" | "t2v";

interface KeywordItem { id: string; text: string; }
interface TitleItem { id: string; keyword: string; text: string; }
interface Slide { id: string; imageUrl: string; lyric?: string; }

const COLOR_PRESETS = [
  { hex:"#ec4899", name:"Pink" },
  { hex:"#a855f7", name:"Purple" },
  { hex:"#22d3ee", name:"Cyan" },
  { hex:"#f59e0b", name:"Gold" },
  { hex:"#22c55e", name:"Green" },
  { hex:"#ef4444", name:"Red" },
  { hex:"#ffffff", name:"White" },
];
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

export default function Home() {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<Mode>("slideshow");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [stageText, setStageText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [quality, setQuality] = useState<RenderQuality>(isMobile ? "fast" : "balanced");

  // Step 1
  const [niche, setNiche] = useState("");
  const [nKeywords, setNKeywords] = useState(isMobile ? 3 : 5);
  const [keywordMode, setKeywordMode] = useState<"ai"|"manual">("ai");
  const [manualKeywords, setManualKeywords] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);

  // Step 2
  const [titlesPerKw, setTitlesPerKw] = useState(1);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");

  // Step 3
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [imageStyle, setImageStyle] = useState("studio"); // default stabil
  const [aspectRatio, setAspectRatio] = useState<"16:9"|"9:16"|"1:1">(isMobile ? "9:16" : "16:9");
  const [nSlides, setNSlides] = useState(isMobile ? 3 : 4);
  const [slides, setSlides] = useState<Slide[]>([]);

  // Step 4
  const [audioMode, setAudioMode] = useState<AudioMode>("tts");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsText, setTtsText] = useState("");
  const [ttsUrl, setTtsUrl] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");

  // Step 5
  const [vizStyle, setVizStyle] = useState<VizStyle>("luxury");
  const [vizColor, setVizColor] = useState("#ec4899");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transitionDur, setTransitionDur] = useState(isMobile ? 0.5 : 0.8);
  const [transition, setTransition] = useState<Transition>("zoom");
  const [showTitle, setShowTitle] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true);
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [logoPosition, setLogoPosition] = useState<"center"|"corner"|"none">("center");
  const [storyboard, setStoryboard] = useState<any|null>(null);
  const [lyrics, setLyrics] = useState<any|null>(null);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [aiMusicUrl, setAiMusicUrl] = useState<string>("");
  const [aiMusicStatus, setAiMusicStatus] = useState<string>("");
  const [musicGenre, setMusicGenre] = useState<string>("pop ballad");
  const [musicMood, setMusicMood] = useState<string>("menyentuh, emosional");
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
  const renderStartRef = useRef<number>(0);
  const selectedTitle = useMemo(() => titles.find(t=>t.id===selectedTitleId), [titles, selectedTitleId]);

  // Set default quality/ratio HANYA saat pertama load (bukan saat resize) supaya pilihan user tidak hilang
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    setQuality(isMobile ? "fast" : "balanced");
    setAspectRatio(isMobile ? "9:16" : "16:9");
    setNSlides(isMobile ? 3 : 4);
  }, []);

  function setErr(e: any) {
    const msg = e?.message || e?.error || String(e || "Terjadi kesalahan");
    setError(msg);
  }

  async function callApi(path: string, body: any) {
    setLoading(path); setError("");
    try {
      const r = await fetch(`/api/hcnsec${path}`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      let data: any = {};
      const txt = await r.text();
      try { data = txt ? JSON.parse(txt) : {}; }
      catch { data = { error: `Server error ${r.status}: ${txt.slice(0,200)}` }; }
      if (!r.ok || data.error) {
        const msg = data.error || data.message || `Error ${r.status}`;
        throw new Error(msg);
      }
      return data;
    } finally { setLoading(null); }
  }

  // ===== Step 1 =====
  async function doGenerateKeywords() {
    if (keywordMode === "manual") {
      const kws = manualKeywords.split(",").map(s=>s.trim()).filter(Boolean);
      if (!kws.length) return setErr("Keyword manual kosong");
      setKeywords(kws.map((t,i)=>({id:`k${i}`,text:t})));
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
    const raw: Slide[] = [];
    const errs: string[] = [];
    for (let i=0;i<nSlides;i++){
      setStageText(`Gambar ${i+1}/${nSlides} (AI generate)...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{"Content-Type":"application/json"},
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
      setError("");
      setStageText(`✅ ${raw.length}/${nSlides} gambar siap — total ${raw.length} slide`);
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
            // Downscale on the fly untuk hemat
            const targetRatio = aspectRatio === "9:16" ? 9/16 : aspectRatio === "1:1" ? 1 : 16/9;
            const maxSide = 1280;
            const c = document.createElement("canvas");
            let w = img.naturalWidth, h = img.naturalHeight;
            // object-cover crop
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
      // Tentukan audio (jika aiMusicUrl ada, pakai itu sebagai "music")
      let chosenMusic = musicUrl;
      if (aiMusicUrl) chosenMusic = aiMusicUrl;
      const tmpMusic = musicUrl;
      if (aiMusicUrl) (window as any).__musicOverride = aiMusicUrl;
      const parts: string[] = [];
      if ((audioMode==="tts"||audioMode==="both") && ttsUrl) parts.push(ttsUrl);
      if ((audioMode==="music"||audioMode==="both") && chosenMusic) parts.push(chosenMusic);
      if (audioMode==="aimusic" && aiMusicUrl) parts.push(aiMusicUrl);
      let audioUrl: string|null = null;
      if (parts.length === 1) audioUrl = parts[0];
      else if (parts.length > 1) {
        audioUrl = await mixAudioUrls(parts);
      }

      // Lyrics array per-slide
      const lyricsArr = slides.map((s:any, i:number) => s.lyric || storyboard?.scenes?.[i]?.lyric_line || "").filter(Boolean);
      // Jika lyrics full tersedia, ambil bagi per-slide
      let lyricLines: string[] = [];
      if (showLyrics) {
        if (slides.some((s:any)=>s.lyric)) lyricLines = slides.map((s:any,i)=>s.lyric||"");
        else if ((window as any)._lyrics?.length === slides.length) lyricLines = (window as any)._lyrics;
      }

      const blob = await renderSlideshow({
        images: slides.map(s=>s.imageUrl),
        audioUrl: audioUrl || undefined,
        slideDuration, transitionDuration: transitionDur,
        vizStyle, vizColor, title: showTitle ? (selectedTitle?.text || niche) : undefined,
        lyrics: showLyrics && lyricLines.length===slides.length ? lyricLines : undefined,
        logoUrl: logoDataUrl || undefined,
        logoPosition,
        quality, mobileOptimized: isMobile, ratio: aspectRatio, aspectRatio,
        transition, showTitle, showLyrics: showLyrics && lyricLines.length===slides.length,
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

  async function mixAudio(): Promise<string|null> {
    if (audioMode === "none") return null;
    const parts: string[] = [];
    if ((audioMode==="tts"||audioMode==="both") && ttsUrl) parts.push(ttsUrl);
    if ((audioMode==="music"||audioMode==="both") && musicUrl) parts.push(musicUrl);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    try {
      setStageText("Menggabungkan audio...");
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const bufs = await Promise.all(parts.map(u => fetch(u).then(r=>r.arrayBuffer()).then(b=>actx.decodeAudioData(b))));
      const maxLen = Math.max(...bufs.map(b=>b.length));
      const sr = bufs[0].sampleRate; const ch = bufs[0].numberOfChannels;
      const out = actx.createBuffer(ch, maxLen, sr);
      for (let c=0;c<ch;c++){
        const od = out.getChannelData(c);
        for (let bi=0;bi<bufs.length;bi++){
          const b = bufs[bi];
          const d = b.getChannelData(Math.min(c, b.numberOfChannels-1));
          const vol = bi===1?0.22:1; // musik lebih pelan
          for (let i=0;i<d.length;i++) od[i] = Math.max(-1, Math.min(1, od[i]+d[i]*vol));
        }
      }
      const wav = bufferToWav(out);
      actx.close();
      return URL.createObjectURL(new Blob([wav], {type:"audio/wav"}));
    } catch(e){
      console.warn("Mix audio gagal:", e);
      return parts[0];
    }
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

  // ===== STORY MODE (cerita → scenes → lirik) =====
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
      // Auto-fill TTS text dari gabungan lirik per scene
      if (sb.scenes && Array.isArray(sb.scenes)) {
        const lirikFull = sb.scenes.map((s:any)=>s.lyric_line).filter(Boolean).join(". ");
        if (lirikFull) setTtsText(lirikFull);
      }
      setStageText("✅ Storyboard + lirik siap! Lirik sudah terisi otomatis di Step 4.");
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
    const lyricLines: string[] = [];
    for (let i=0;i<storyboard.scenes.length;i++){
      const sc = storyboard.scenes[i];
      setStageText(`Adegan ${i+1}/${storyboard.scenes.length}: ${sc.scene_desc?.slice(0,40)}...`);
      try {
        // Panggil image API dengan visual_prompt langsung
        const styleObj = { suffix: sc.visual_prompt };
        const res = await fetch("/api/hcnsec/image", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            title: sc.visual_prompt, keyword: "", niche: "", style: imageStyle, _rawPrompt: true,
          }),
        });
        let data;
        try { data = await res.json(); } catch { data={error:"bad json"}; }
        if (!res.ok || data.error) throw new Error(data.error||`HTTP ${res.status}`);
        const cropped = await cropImageToRatio(data.url, aspectRatio);
        newSlides.push({ id:`sb${i}_${Date.now()}`, imageUrl: cropped, lyric: sc.lyric_line });
        lyricLines.push(sc.lyric_line||"");
      } catch(e:any){
        errs.push(`#${i+1} ${sc.scene_desc?.slice(0,30)||""}: ${(e.message||"gagal").slice(0,80)}`);
      }
    }
    if (newSlides.length) {
      setSlides(newSlides);
      setSceneImages(newSlides.map(s=>s.imageUrl));
      setShowLyrics(true);
      setError("");
      setStageText(`✅ ${newSlides.length}/${storyboard.scenes.length} adegan siap dengan lirik!`);
      (window as any)._lyrics = lyricLines;
    } else {
      setErr(`Gagal generate gambar cerita:\n${errs.join("\n")}`);
    }
    setTimeout(()=>setStageText(""),3000); setLoading(null);
  }

  async function doGenerateLyrics() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Menulis lirik lagu lengkap...");
    setLoading("lyrics");
    try {
      const l = await callApi("/lyrics", {
        title: selectedTitle.text, keyword: selectedTitle.keyword, niche,
        genre: musicGenre, mood: musicMood,
      });
      setLyrics(l);
      setStageText("✅ Lirik siap! Kamu bisa kirim ke AI music.");
    } catch(e:any){ setErr(e.message); }
    setTimeout(()=>setStageText(""),2500); setLoading(null);
  }

  async function doGenerateAIMusic() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText("Meminta AI membuat lagu (bisa 30-60 detik)...");
    setLoading("aimusic"); setAiMusicStatus("memulai...");
    try {
      let prompt = lyrics?.style_prompt_suno || `${musicMood}, ${musicGenre}, indonesian`;
      const text = lyrics?.lyrics || `${selectedTitle.text} ${niche}`;
      const r = await fetch("/api/hcnsec/music", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          title: selectedTitle.text, prompt, lyrics: lyrics?.lyrics,
          genre: musicGenre, tags: `${musicGenre}, ${musicMood}`, custom: !!lyrics?.lyrics,
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `Error ${r.status}`);
      // Poll
      if (data.audio_url) {
        setAiMusicUrl(data.audio_url);
        setAiMusicStatus("selesai");
        setStageText("✅ Lagu AI siap!");
      } else if (data.id) {
        setAiMusicStatus("memproses...");
        // Poll setiap 5s, max 90s
        for (let i=0;i<18;i++){
          await new Promise(res=>setTimeout(res,5000));
          const pr = await fetch(`/api/hcnsec/music?id=${data.id}`);
          const pd = await pr.json().catch(()=>({}));
          setAiMusicStatus(`memproses... ${Math.round((i+1)/18*100)}%`);
          if (pd.audio_url) { setAiMusicUrl(pd.audio_url); setAiMusicStatus("selesai"); setStageText("✅ Lagu AI siap!"); break; }
          if (pd.status === "error" || pd.error) throw new Error(pd.error||"Gagal generate musik");
        }
        if (!aiMusicUrl) setStageText("⏳ Coba lagi 1 menit ya, lagu masih diproses server.");
      } else {
        setStageText("⚠️ AI music belum merespon audio. Coba pakai TTS narasi + upload musik saja untuk sekarang.");
      }
    } catch(e:any){
      setErr(e.message || "AI music gagal. Set SUNO_API_KEY untuk fitur penuh.");
      setAiMusicStatus("gagal");
    }
    setTimeout(()=>setStageText(""),3000); setLoading(null);
  }

  function handleLogoUpload(f: File|undefined) {
    if (!f) return;
    if (f.size>3*1024*1024) return setErr("Logo maks 3MB");
    const r = new FileReader();
    r.onload = () => {
      // Downscale logo jadi 256x256
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const size=256;
        c.width=size; c.height=size;
        const cx=c.getContext("2d")!;
        // Buat lingkaran
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

  return (
    <main className="min-h-screen px-3 sm:px-4 py-4 sm:py-6 max-w-6xl mx-auto">
      <Header />
      <ModeTabs mode={mode} setMode={(m)=>{setMode(m); setStep(1); setError(""); setStageText(""); setMeta(null); setVideoUrl(""); setVideoBlob(null);}} />

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-100 text-sm whitespace-pre-wrap break-words backdrop-blur">
          ⚠️ {error}
        </div>
      )}
      {stageText && (
        <div className="mt-3 p-2.5 px-3 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-100 text-sm flex items-center gap-2 backdrop-blur">
          <Spinner /> <span className="truncate">{stageText}</span>
        </div>
      )}

      {mode === "slideshow" ? (
        <div className="mt-4 lg:mt-6 grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 card">
            <StepBar step={step} />

            {step === 1 && (
              <section className="mt-4 space-y-4">
                <h2 className="section-title">🎯 Step 1 · Ide & Keyword</h2>

                {/* Preset templates */}
                <div>
                  <span className="lbl">⚡ Template Cepat (klik untuk auto-fill)</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      {id:"sedih",niche:"cerita menyentuh ibu & keluarga",kw:"ibu maafkan aku, penyesalan anak, rindu ibu, maafkan aku ibu, kasih ibu",ti:"cerita sedih",genre:"pop ballad",mood:"menyentuh, sedih, haru"},
                      {id:"motivasi",niche:"motivasi & semangat hidup",kw:"bangkit dari gagal, jangan menyerah, motivasi kerja, semangat pagi, mulai lagi",ti:"motivasi sukses",genre:"cinematic epic",mood:"epic, membara, semangat"},
                      {id:"cinta",niche:"cerita cinta & romantis",kw:"rindu dia, cinta pertama, kenangan pacar, setia menunggu, ldr",ti:"cerita cinta romantis",genre:"pop akustik",mood:"romantis, lembut, manis"},
                      {id:"islamic",niche:"konten islami & dakwah",kw:"ustadz ceramah, hijrah, doa ibu, surga di telapak kaki ibu, jodoh",ti:"dakwah islami menyentuh",genre:"religi akustik",mood:"tenang, khusyuk, syahdu"},
                      {id:"horror",niche:"cerita horor & misteri",kw:"hantu kampung, kisah seram malam jumat, penampakan nyata, cerita mistis",ti:"cerita horor",genre:"dark ambient",mood:"mencekam, tegang"},
                      {id:"fyp",niche:"fyp Shorts/TikTok viral",kw:"fakta unik, wow fakta, kamu tidak tahu, trik rahasia, life hack",ti:"fakta unik fyp",genre:"trap edm",mood:"energetic, asik"},
                    ].map(p=>(
                      <button key={p.id} onClick={()=>{
                        setNiche(p.niche); setManualKeywords(p.kw); setKeywordMode("manual");
                        setMusicGenre(p.genre); setMusicMood(p.mood); setSelectedPreset(p.id);
                      }} className={`style-card text-center ${selectedPreset===p.id?"active":""}`}>
                        <div className="text-sm font-bold">{p.ti}</div>
                        <div className="text-[10px] text-white/50">{p.genre}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="lbl">Niche / topik channel</span>
                  <input className="input" value={niche} onChange={e=>setNiche(e.target.value)}
                         placeholder="Contoh: tips keuangan remaja, resep masakan simpel" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="lbl">Sumber keyword</span>
                    <select className="select" value={keywordMode} onChange={e=>setKeywordMode(e.target.value as any)}>
                      <option value="ai">🤖 AI (otomatis)</option>
                      <option value="manual">✍️ Manual</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="lbl">Jumlah keyword</span>
                    <input type="number" className="input" value={nKeywords} min={1} max={isMobile?5:10}
                           onChange={e=>setNKeywords(Number(e.target.value))} />
                  </label>
                </div>
                {keywordMode === "manual" && (
                  <label className="block">
                    <span className="lbl">Keyword (pisah koma)</span>
                    <input className="input" value={manualKeywords} onChange={e=>setManualKeywords(e.target.value)}
                           placeholder="tidur nyenyak, belajar cepat, fokus kerja" />
                  </label>
                )}
                <button className="btn btn-primary w-full sm:w-auto" onClick={doGenerateKeywords} disabled={!!loading}>
                  {loading==="/keywords" ? <Spinner/> : "🔑"} Generate Keyword
                </button>
                {keywords.length > 0 && (
                  <div>
                    <div className="text-xs text-white/60 mb-2">Keyword ({keywords.length}) — tap × untuk hapus:</div>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map(k => (
                        <span key={k.id} className="chip">
                          {k.text}
                          <button className="ml-1 text-red-300/80 hover:text-red-400"
                            onClick={()=>setKeywords(keywords.filter(x=>x.id!==k.id))}>×</button>
                        </span>
                      ))}
                      <button className="chip hover:bg-white/20"
                        onClick={()=>setKeywords([...keywords,{id:`k${Date.now()}`,text:""}])}>+ tambah</button>
                    </div>
                  </div>
                )}
                {keywords.length>0 && <button className="btn btn-primary" onClick={()=>setStep(2)}>Lanjut ke Judul →</button>}
              </section>
            )}

            {step === 2 && (
              <section className="mt-4 space-y-4">
                <h2 className="section-title">📝 Step 2 · Judul High-CTR</h2>
                <label className="block max-w-xs">
                  <span className="lbl">Judul per keyword</span>
                  <input type="number" className="input" value={titlesPerKw} min={1} max={3}
                         onChange={e=>setTitlesPerKw(Number(e.target.value))} />
                </label>
                <button className="btn btn-primary" onClick={doGenerateTitles} disabled={!!loading}>
                  {loading==="/titles" ? <Spinner/> : "📝"} Generate Judul
                </button>
                {titles.length>0 && (
                  <div className="space-y-2 max-h-80 overflow-auto pr-1">
                    {titles.map(t=>(
                      <label key={t.id}
                        className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${
                          selectedTitleId===t.id
                            ? "bg-gradient-to-r from-purple-600/25 to-pink-600/25 border-pink-400/60 shadow-lg"
                            : "bg-white/5 border-white/10 hover:bg-white/8"
                        }`}>
                        <input type="radio" name="title" checked={selectedTitleId===t.id}
                               onChange={()=>setSelectedTitleId(t.id)} className="mt-1.5 accent-pink-500"/>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm sm:text-base leading-snug">{t.text}</div>
                          <div className="text-xs text-white/50 mt-0.5">#{t.keyword}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(1)}>← Kembali</button>
                  {selectedTitleId && <button className="btn btn-primary" onClick={()=>setStep(3)}>Lanjut ke Gambar →</button>}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="mt-4 space-y-4">
                <h2 className="section-title">🖼️ Step 3 · Gambar Slide</h2>

                {/* STORY / CERITA MODE */}
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/15 to-pink-600/15 border border-purple-400/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🎬</span>
                    <div className="flex-1">
                      <div className="text-sm font-bold">Mode Cerita (Storyboard AI)</div>
                      <div className="text-[11px] text-white/60">Buat alur cerita, adegan, dan lirik PER SLIDE otomatis dari judul. Hasil gambar akan sesuai emosi cerita!</div>
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
                      <summary className="cursor-pointer text-white/70">Lihat {storyboard.scenes?.length||0} adegan + lirik ↓</summary>
                      <div className="mt-2 space-y-1.5 max-h-60 overflow-auto pr-1">
                        {storyboard.scenes?.map((s:any,i:number)=>(
                          <div key={i} className="p-2 rounded-lg bg-black/30 border border-white/5">
                            <div className="font-bold text-[11px] text-pink-300">Adegan {s.scene} · {s.mood}</div>
                            <div className="text-[11px] text-white/80">{s.scene_desc}</div>
                            <div className="text-[11px] italic text-cyan-200 mt-0.5">♪ {s.lyric_line}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="lbl">Sumber</span>
                    <select className="select" value={imageSource} onChange={e=>setImageSource(e.target.value as any)}>
                      <option value="ai">🤖 AI</option>
                      <option value="upload">📁 Upload</option>
                      <option value="both">🔄 Campur</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="lbl">Jumlah slide</span>
                    <input type="number" className="input" value={nSlides} min={1} max={isMobile?6:12}
                           onChange={e=>setNSlides(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <span className="lbl">Rasio / Platform</span>
                    <select className="select" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value as any)}>
                      {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </label>
                </div>

                <div>
                  <span className="lbl">🎨 Style gambar</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {IMAGE_STYLE_PRESETS.map(s=>(
                      <button key={s.id} type="button" onClick={()=>setImageStyle(s.id)}
                        className={`style-card ${imageStyle===s.id?"active":""}`}>
                        <div className="text-sm font-bold">{s.label}</div>
                        <div className="text-[10px] text-white/60 mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {imageSource!=="upload" && (
                    <button className="btn btn-primary" onClick={doGenerateImages} disabled={!!loading}>
                      {loading==="/image" ? <Spinner/> : "🎨"} Generate Gambar AI
                    </button>
                  )}
                  {(imageSource==="upload"||imageSource==="both") && (
                    <label className="btn btn-ghost cursor-pointer">
                      📁 Upload Gambar
                      <input type="file" accept="image/*" multiple hidden
                             onChange={e=>handleUploadImages(e.target.files)} />
                    </label>
                  )}
                  {slides.length>0 && (
                    <button className="btn btn-danger text-xs" onClick={()=>setSlides([])}>🗑️ Reset</button>
                  )}
                </div>

                {slides.length>0 && (
                  <div className={`grid gap-2 ${aspectRatio==="9:16"?"grid-cols-4 sm:grid-cols-6":aspectRatio==="1:1"?"grid-cols-3 sm:grid-cols-5":"grid-cols-3 sm:grid-cols-4"}`}>
                    {slides.map((s,i)=>(
                      <div key={s.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                        <img src={s.imageUrl} className="w-full h-full object-cover aspect-video" alt={`slide ${i+1}`}
                             style={aspectRatio==="9:16"?{aspectRatio:"9/16"}:aspectRatio==="1:1"?{aspectRatio:"1/1"}:{aspectRatio:"16/9"}}/>
                        <button onClick={()=>setSlides(slides.filter(x=>x.id!==s.id))}
                                className="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 text-red-300 text-sm leading-none flex items-center justify-center">×</button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-center text-white py-0.5">{i+1}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(2)}>← Kembali</button>
                  {slides.length>0 && <button className="btn btn-primary" onClick={()=>setStep(4)}>Lanjut ke Audio →</button>}
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="mt-4 space-y-4">
                <h2 className="section-title">🎵 Step 4 · Audio</h2>
                <div>
                  <span className="lbl">Mode audio</span>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {([["tts","🔊 TTS AI"],["music","🎵 Musik File"],["both","🎶 TTS+Musik"],["aimusic","🎼 AI Music (NEW)"],["none","🔇 Mute"]] as const).map(([v,l])=>(
                      <button key={v} onClick={()=>setAudioMode(v as AudioMode)}
                        className={`btn ${audioMode===v?"btn-primary":"btn-ghost"}`}>{l}</button>
                    ))}
                  </div>
                </div>
                {/* AI MUSIC PANEL */}
                {(audioMode==="aimusic"||audioMode==="both") && (
                  <div className="space-y-3 p-3 rounded-xl bg-gradient-to-br from-purple-600/15 to-pink-600/15 border border-purple-400/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">🎼</span>
                      <span className="text-sm font-bold">AI Music Generator</span>
                      <span className="text-[10px] text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded-full">Beta</span>
                    </div>
                    <p className="text-[11px] text-white/60">Buat lagu lengkap dengan vokal otomatis dari judul/lirik. Gratis terbatas; set env <code className="text-cyan-300">SUNO_API_KEY</code> di Vercel untuk kuota penuh.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="lbl">Genre</span>
                        <input className="input py-1.5 text-sm" value={musicGenre} onChange={e=>setMusicGenre(e.target.value)} placeholder="pop ballad"/>
                      </label>
                      <label className="block">
                        <span className="lbl">Mood</span>
                        <input className="input py-1.5 text-sm" value={musicMood} onChange={e=>setMusicMood(e.target.value)} placeholder="menyentuh"/>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-ghost text-xs py-2" onClick={doGenerateLyrics} disabled={!!loading}>
                        {loading==="lyrics"?<Spinner/>:"✍️"} Buat Lirik Dulu
                      </button>
                      <button className="btn btn-primary text-xs py-2" onClick={doGenerateAIMusic} disabled={!!loading}>
                        {loading==="aimusic"?<Spinner/>:"🎼"} Generate Lagu
                      </button>
                    </div>
                    {aiMusicStatus && <div className="text-[11px] text-white/60">Status: {aiMusicStatus}</div>}
                    {aiMusicUrl && <audio controls src={aiMusicUrl} className="w-full"/>}
                    {lyrics && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-white/70">Lihat lirik yang digenerate ↓</summary>
                        <pre className="mt-2 p-2 rounded-lg bg-black/40 text-[10px] whitespace-pre-wrap text-white/80 max-h-40 overflow-auto">{lyrics.lyrics}</pre>
                      </details>
                    )}
                    <div className="text-[10px] text-white/40">
                      💡 Tips: Kalau gratis habis / gagal, kamu tetap bisa upload musik file mp3 sendiri seperti biasa.
                    </div>
                  </div>
                )}

                {(audioMode==="tts"||audioMode==="both") && (
                  <div className="space-y-3 p-3 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-white/70 font-semibold">Voice:</label>
                      <select className="select w-32 text-sm py-1.5" value={ttsVoice} onChange={e=>setTtsVoice(e.target.value)}>
                        {VOICES.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                      <button className="btn btn-ghost text-xs py-1.5" onClick={doAutoScript} disabled={!!loading}>✍️ Auto Script AI</button>
                    </div>
                    <textarea className="textarea text-sm" rows={isMobile?4:5} value={ttsText}
                      onChange={e=>setTtsText(e.target.value)}
                      placeholder="Tulis narasi di sini, atau klik Auto Script untuk dibuatkan AI."/>
                    <button className="btn btn-primary" onClick={doGenerateTTS} disabled={!!loading}>
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
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(3)}>← Kembali</button>
                  <button className="btn btn-primary" onClick={()=>setStep(5)}>Lanjut ke Render →</button>
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="mt-4 space-y-4">
                <h2 className="section-title">🌈 Step 5 · Visualizer & Render</h2>

                {/* LOGO CUSTOM */}
                <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold flex items-center gap-2">🖼️ Logo/Channel Brand</div>
                      <div className="text-[11px] text-white/50">Upload logo channel-mu; akan muncul di tengah spectrum atau pojok video</div>
                    </div>
                    {logoDataUrl && (
                      <img src={logoDataUrl} className="w-10 h-10 rounded-full border-2 border-white/30" alt="logo"/>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <label className="btn btn-ghost text-xs py-1.5 cursor-pointer">
                      📁 Upload Logo
                      <input type="file" accept="image/*" hidden onChange={e=>handleLogoUpload(e.target.files?.[0])}/>
                    </label>
                    {logoDataUrl && (
                      <>
                        <div className="flex gap-1">
                          {([["center","🎯 Tengah"],["corner","📍 Pojok"],["none","❌ Sembunyi"]] as const).map(([v,l])=>(
                            <button key={v} onClick={()=>setLogoPosition(v)}
                              className={`btn text-xs py-1.5 px-2 ${logoPosition===v?"btn-primary":"btn-ghost"}`}>{l}</button>
                          ))}
                        </div>
                        <button className="btn btn-danger text-xs py-1.5" onClick={()=>setLogoDataUrl("")}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>

                {/* KARAOKE LYRICS */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/10">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">🎤 Karaoke Lirik</div>
                    <div className="text-[11px] text-white/50">Tampilkan baris lirik per-slide dengan gaya karaoke (outline text, glow)</div>
                  </div>
                  <div className={`toggle ${showLyrics?"on":""}`} onClick={()=>setShowLyrics(v=>!v)}/>
                </div>

                {/* Quality */}
                <div>
                  <span className="lbl">⚡ Kualitas render {isMobile ? "· HP default: Cepat" : ""}</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QUALITY_OPTIONS.map(q=>(
                      <button key={q.id} onClick={()=>setQuality(q.id as RenderQuality)}
                        className={`q-tile ${quality===q.id?"active":""}`}>
                        <div className="text-sm font-bold">{q.label}</div>
                        <div className="text-[10px] text-white/60 mt-0.5">{q.res} · {q.fps}fps · {q.bitrate}</div>
                        {q.tag && <div className="text-[9px] text-pink-300 mt-0.5">{q.tag}</div>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spectrum style */}
                <div>
                  <span className="lbl">🎨 Style spectrum visualizer</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VIZ_STYLES.filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).map(s=>(
                      <button key={s.id} onClick={()=>setVizStyle(s.id)}
                        className={`style-card ${vizStyle===s.id?"active":""}`}>
                        <div className="text-sm font-bold">{s.emoji} {s.label}</div>
                        <div className="text-[10px] text-white/60 mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Warna */}
                <div>
                  <span className="lbl">🎨 Warna tema</span>
                  <div className="flex gap-2 flex-wrap items-center">
                    {COLOR_PRESETS.map(c=>(
                      <button key={c.hex} onClick={()=>setVizColor(c.hex)} title={c.name}
                        className={`w-9 h-9 rounded-full border-2 transition ${vizColor===c.hex?"border-white scale-110":"border-white/20"}`}
                        style={{background:`radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), ${c.hex} 60%)`}}/>
                    ))}
                    <input type="color" value={vizColor} onChange={e=>setVizColor(e.target.value)}
                           className="w-9 h-9 rounded-full bg-transparent border-0 p-0 cursor-pointer"/>
                  </div>
                </div>

                {/* Timing */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="lbl">Durasi per slide: <b>{slideDuration.toFixed(1)}s</b></span>
                    <input type="range" min={1.5} max={8} step={0.5} value={slideDuration}
                           onChange={e=>setSlideDuration(Number(e.target.value))}/>
                  </label>
                  <label className="block">
                    <span className="lbl">Durasi transisi: <b>{transitionDur.toFixed(2)}s</b></span>
                    <input type="range" min={0} max={2} step={0.1} value={transitionDur}
                           onChange={e=>setTransitionDur(Number(e.target.value))}/>
                  </label>
                </div>

                {/* Transition style */}
                <div>
                  <span className="lbl">✨ Efek transisi antar slide</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {TRANSITION_STYLES.map(t=>(
                      <button key={t.id} onClick={()=>setTransition(t.id as Transition)}
                        className={`q-tile ${transition===t.id?"active":""}`}>
                        <div className="text-xs font-bold">{t.emoji} {t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle show title */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/10">
                  <div>
                    <div className="text-sm font-semibold">📝 Tampilkan judul di video</div>
                    <div className="text-xs text-white/50">Judul akan muncul overlay dengan animasi glow</div>
                  </div>
                  <div className={`toggle ${showTitle?"on":""}`} onClick={()=>setShowTitle(v=>!v)}/>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(4)}>← Kembali</button>
                  <button className="btn btn-primary glow" onClick={doRender} disabled={loading==="render"}>
                    {loading==="render"?<Spinner/>:"🎬"} Render Video Sekarang
                  </button>
                  {videoUrl && <button className="btn btn-ok" onClick={downloadVideo}>💾 Download MP4</button>}
                </div>

                {loading==="render" && (
                  <div>
                    <div className="progress-track"><div className="progress-fill" style={{width:`${Math.round(progress*100)}%`}}/></div>
                    <div className="flex justify-between text-[11px] text-white/60 mt-1">
                      <span>{Math.round(progress*100)}%</span>
                      {renderETA && <span>ETA ~{renderETA}</span>}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="card lg:sticky lg:top-4 self-start">
            <h3 className="font-bold text-base sm:text-lg mb-2 flex items-center gap-2">👁️ Preview Live</h3>
            <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black"
                 style={aspectRatio==="9:16"?{aspectRatio:"9/16", maxWidth: isMobile?"100%":"280px", margin:"0 auto"}:aspectRatio==="1:1"?{aspectRatio:"1/1"}:{aspectRatio:"16/9"}}>
              {slides[0] ? (
                <img src={slides[0].imageUrl} className="w-full h-full object-cover" alt="preview"/>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-xs text-center px-3" style={{aspectRatio:aspectRatio==="9:16"?"9/16":aspectRatio==="1:1"?"1/1":"16/9"}}>
                  Belum ada gambar
                </div>
              )}
              <SpectrumVisualizer
                audioEl={previewAudioRef.current || undefined}
                style={vizStyle}
                color={vizColor}
                logoUrl={logoDataUrl || undefined}
                width={aspectRatio==="9:16"?720:aspectRatio==="1:1"?720:1280}
                height={aspectRatio==="9:16"?1280:aspectRatio==="1:1"?720:720}
              />
              <div className="absolute bottom-2 left-2 right-2 text-white text-center text-xs sm:text-sm font-bold drop-shadow-[0_2px_6px_rgba(0,0,0,1)] truncate px-2"
                   style={{textShadow:`0 0 12px ${vizColor}`}}>
                {showTitle ? (selectedTitle?.text || niche || "Judul video di sini") : ""}
              </div>
            </div>
            <audio ref={previewAudioRef} controls className="w-full mt-2"
                   src={ttsUrl || musicUrl || undefined}/>
            <p className="text-[10px] sm:text-xs text-white/50 mt-2">
              🔥 Spectrum live bergerak mengikuti suara kamu. Render pakai engine WebCodecs super-cepat (5–10× realtime).
            </p>
            {videoUrl && (
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1">✅ Hasil Video:</div>
                <video controls src={videoUrl} className="w-full rounded-xl border border-white/10"/>
                <div className="text-[10px] text-white/50 mt-1 flex justify-between">
                  <span>{videoBlob && `${(videoBlob.size/1024/1024).toFixed(1)} MB`}</span>
                  <span>{videoBlob?.type.includes("mp4")?"MP4 H.264":"WebM"}</span>
                </div>
              </div>
            )}
            <ProjectMeta title={selectedTitle?.text} niche={niche} slides={slides.length} quality={quality} ratio={aspectRatio} viz={vizStyle}/>
          </aside>

          {videoUrl && meta && (
            <div className="lg:col-span-3 card mt-2">
              <h2 className="text-lg sm:text-xl font-black mb-1 flex items-center gap-2">
                📋 YouTube Metadata (siap copy-paste)
              </h2>
              <p className="text-xs text-white/60 mb-4">
                Tinggal SALIN & tempel ke YouTube. Semua sudah dioptimasi AI untuk CTR tinggi 🔥
              </p>
              <MetaRow label="🏷️ Judul High-CTR" value={meta.titleHighCTR} onCopy={()=>copyField("title",meta.titleHighCTR)} copied={copiedField==="title"}/>
              {meta.titleAlternatives.length>0 && (
                <div className="mb-3">
                  <div className="text-xs text-white/70 mb-1">🔄 Judul alternatif:</div>
                  {meta.titleAlternatives.map((t,i)=>(
                    <div key={i} className="flex items-center gap-2 mb-1">
                      <div className="flex-1 text-sm bg-black/30 rounded-lg p-2 truncate">{t}</div>
                      <button onClick={()=>copyField(`alt${i}`,t)}
                        className={`btn text-xs py-1.5 ${copiedField===`alt${i}`?"bg-green-600":"btn-ghost"}`}>
                        {copiedField===`alt${i}`?"✓":"SALIN"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <MetaRow label="📝 Deskripsi" value={meta.description} onCopy={()=>copyField("desc",meta.description)} copied={copiedField==="desc"} multiline/>
              <MetaRow label="#️⃣ Tags" value={meta.tags.join(", ")} onCopy={()=>copyField("tags",meta.tags.join(", "))} copied={copiedField==="tags"}/>
              <MetaRow label="🔖 Hashtags" value={meta.hashtags} onCopy={()=>copyField("hash",meta.hashtags)} copied={copiedField==="hash"}/>
              <button onClick={downloadMetaText} className="btn btn-primary mt-2">📥 Download semua metadata (.txt)</button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 lg:mt-6 grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 card space-y-3">
            <h2 className="section-title">🎬 Text-to-Video AI</h2>
            <div className="text-xs sm:text-sm p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200">
              💡 Fitur ini tergantung model video di akun hcnsec kamu. Kalau 404, artinya model video belum aktif — pakai <b>Slideshow + Spectrum</b> yang 100% jalan & jauh lebih cepat.
            </div>
            <label className="block">
              <span className="lbl">Prompt (detailkan, Bahasa Inggris lebih bagus)</span>
              <textarea className="textarea" rows={isMobile?4:5} value={t2vPrompt}
                onChange={e=>setT2vPrompt(e.target.value)}
                placeholder="Cth: Cinematic slow motion of a lonely wolf walking in a snowy forest at golden hour, 4k, moody, epic orchestral feel"/>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="lbl">Durasi {isMobile?"(max 5s di HP)":""}</span>
                <input type="number" className="input" min={2} max={isMobile?5:10} value={t2vDuration}
                       onChange={e=>setT2vDuration(Number(e.target.value))}/>
              </label>
              <label className="block">
                <span className="lbl">Rasio</span>
                <select className="select" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value as any)}>
                  {ASPECT_RATIOS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="lbl">Gambar awal (opsional, image-to-video)</span>
              <input type="url" className="input" value={t2vImageUrl} onChange={e=>setT2vImageUrl(e.target.value)}
                     placeholder="https://..."/>
            </label>
            <button className="btn btn-primary glow" onClick={doT2V} disabled={!!loading}>
              {loading==="t2v"?<Spinner/>:"🎬"} Generate Video
            </button>
            {t2vResult && (
              <div className="mt-2 space-y-2">
                <div className="text-xs sm:text-sm">Status: <b>{t2vResult.status}</b></div>
                {t2vResult.video_url ? (
                  <>
                    <video controls src={t2vResult.video_url} className="w-full rounded-xl"/>
                    <a className="btn btn-primary" href={t2vResult.video_url} target="_blank" rel="noreferrer" download>💾 Download</a>
                  </>
                ) : (
                  <div className="text-yellow-300 text-xs sm:text-sm">
                    {t2vResult.error || "Video masih diproses / model tidak tersedia."}
                  </div>
                )}
              </div>
            )}
          </div>
          <aside className="card self-start">
            <h3 className="font-bold mb-2 text-sm sm:text-base">💡 Tips prompt profesional</h3>
            <ul className="text-xs sm:text-sm space-y-1.5 text-white/70 list-disc pl-4">
              <li>Pakai <b>Bahasa Inggris</b> hasilnya lebih bagus</li>
              <li>Sebut <b>shot type</b>: close-up, wide, aerial drone</li>
              <li>Sebut <b>motion</b>: slow pan, zoom in, waves crashing</li>
              <li>Sebut <b>lighting</b>: golden hour, neon, volumetric fog</li>
              <li>Akhiri dengan <b>"4k, cinematic, smooth motion"</b></li>
            </ul>
          </aside>
        </div>
      )}

      <Footer />
    </main>
  );
}

function MetaRow({label,value,onCopy,copied,multiline}:{label:string;value:string;onCopy:()=>void;copied:boolean;multiline?:boolean;}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-xs sm:text-sm text-white/70 font-semibold">{label}</div>
        <button onClick={onCopy}
          className={`btn text-xs py-1.5 px-3 ${copied?"bg-green-600 text-white":"btn-ghost"}`}>
          {copied?"✓ Tersalin":"SALIN"}
        </button>
      </div>
      {multiline ? (
        <div className="text-xs sm:text-sm bg-black/40 rounded-lg p-3 border border-white/10 whitespace-pre-wrap leading-relaxed">{value}</div>
      ) : (
        <div className="text-xs sm:text-sm bg-black/40 rounded-lg p-3 border border-white/10 truncate">{value}</div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl hero-icon flex items-center justify-center text-xl sm:text-2xl flex-shrink-0">
          🎞️
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black tracking-tight truncate leading-none">
            Verve <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">AI Video Studio</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-white/50 mt-1 truncate">
            Keyword → Judul → Gambar → Spectrum → Video · Super Cepat ⚡
          </p>
        </div>
      </div>
    </header>
  );
}

function ModeTabs({mode,setMode}:{mode:Mode;setMode:(m:Mode)=>void}) {
  return (
    <div className="mt-4 tabs w-fit">
      <button onClick={()=>setMode("slideshow")} className={`tab ${mode==="slideshow"?"active":""}`}>🎞️ Slideshow</button>
      <button onClick={()=>setMode("t2v")} className={`tab ${mode==="t2v"?"active":""}`}>🎬 Text→Video</button>
    </div>
  );
}

function StepBar({step}:{step:number}) {
  const labels = ["Keyword","Judul","Gambar","Audio","Render"];
  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {labels.map((l,i)=>{
        const n = i+1;
        const active = n===step, done = n<step;
        return (
          <div key={n} className="flex items-center gap-1.5 sm:gap-2 min-w-max flex-shrink-0">
            <div className={`step-dot ${active?"active":""} ${done?"done":""}`}>{done?"✓":n}</div>
            <div className={`text-[11px] sm:text-sm whitespace-nowrap ${active?"text-white font-bold":"text-white/60"}`}>{l}</div>
            {n<labels.length && <div className={`w-4 sm:w-8 h-0.5 ${done?"bg-green-500":"bg-white/15"}`}/>}
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow"/>;
}

function ProjectMeta({title,niche,slides,quality,ratio,viz}:{title?:string;niche:string;slides:number;quality:RenderQuality;ratio:string;viz:string}) {
  const qLabel = QUALITY_OPTIONS.find(q=>q.id===quality);
  return (
    <div className="mt-3 p-3 rounded-xl bg-black/30 border border-white/10 text-[10px] sm:text-xs text-white/60 space-y-1">
      <div className="flex justify-between"><span className="text-white/70">Niche</span><span className="truncate ml-2 text-right">{niche||"—"}</span></div>
      <div className="flex justify-between"><span className="text-white/70">Judul</span><span className="truncate ml-2 text-right max-w-[60%]">{title||"—"}</span></div>
      <div className="flex justify-between"><span className="text-white/70">Slide</span><span>{slides}</span></div>
      <div className="flex justify-between"><span className="text-white/70">Rasio</span><span>{ratio}</span></div>
      <div className="flex justify-between"><span className="text-white/70">Kualitas</span><span>{qLabel?.res} {qLabel?.fps}fps</span></div>
      <div className="flex justify-between"><span className="text-white/70">Style</span><span className="capitalize">{viz}</span></div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 text-center text-[10px] sm:text-xs text-white/30 pb-4">
      Verve AI Video Studio · Dibuat untuk kreator Indonesia 🇮🇩 · WebCodecs ⚡
    </footer>
  );
}

function formatTime(s:number): string {
  s = Math.round(s);
  if (s<60) return `${s}d`;
  const m = Math.floor(s/60), sec = s%60;
  return `${m}m${sec>0?` ${sec}d`:""}`;
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
