"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SpectrumVisualizer from "@/components/SpectrumVisualizer";
import { renderSlideshow, downloadBlob } from "@/lib/recorder";
import type { VizStyle as VizStyleType, AudioMode, ImageSource } from "@/lib/types";

type Mode = "slideshow" | "t2v";
type Quality = "fast" | "balanced" | "high";

interface KeywordItem { id: string; text: string; }
interface TitleItem { id: string; keyword: string; text: string; }
interface Slide { id: string; imageUrl: string; }

const COLOR_PRESETS = ["#ec4899", "#8b5cf6", "#22d3ee", "#f59e0b", "#22c55e", "#ef4444", "#ffffff"];
// Style presets (sesuai server)
const IMAGE_STYLE_PRESETS = [
  { id: "cinematic", label: "🎬 Cinematic 8K", desc: "Film look, ARRI Alexa" },
  { id: "epic", label: "⚔️ Epic Fantasy", desc: "Concept art, UE5" },
  { id: "studio", label: "📸 Studio Photo", desc: "Foto profesional HD" },
  { id: "anime", label: "🌸 Anime Premium", desc: "Makoto Shinkai style" },
  { id: "cyberpunk", label: "🌃 Cyberpunk Neon", desc: "Blade Runner" },
  { id: "3d", label: "🧊 3D Pixar", desc: "Cartoon 3D lucu" },
  { id: "oil", label: "🎨 Oil Painting", desc: "Lukisan klasik" },
  { id: "minimalist", label: "◻️ Minimalist", desc: "Aesthetic pastel" },
];
const IMAGE_SIZES = [
  { label: "📱 9:16 Shorts/TikTok", val: "1024x1792" },
  { label: "🖥️ 16:9 YouTube", val: "1792x1024" },
  { label: "⬛ 1:1 Instagram", val: "1024x1024" },
];
const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

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
  const [quality, setQuality] = useState<Quality>(isMobile ? "fast" : "balanced");

  // Step 1
  const [niche, setNiche] = useState("");
  const [nKeywords, setNKeywords] = useState(isMobile ? 3 : 5);
  const [keywordMode, setKeywordMode] = useState<"ai" | "manual">("ai");
  const [manualKeywords, setManualKeywords] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);

  // Step 2
  const [titlesPerKw, setTitlesPerKw] = useState(1);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");

  // Step 3
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [imageStyle, setImageStyle] = useState("cinematic");
  const [imageSize, setImageSize] = useState("1792x1024");
  const [nSlides, setNSlides] = useState(isMobile ? 3 : 4);
  const [slides, setSlides] = useState<Slide[]>([]);

  // Step 4
  const [audioMode, setAudioMode] = useState<AudioMode>("tts");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsText, setTtsText] = useState("");
  const [ttsUrl, setTtsUrl] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");

  // Step 5
  const [vizStyle, setVizStyle] = useState<VizStyleType>("luxury");
  const [vizColor, setVizColor] = useState("#ec4899");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transition, setTransition] = useState<"fade" | "zoom" | "none">("zoom");

  // Render
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [progress, setProgress] = useState(0);

  // T2V
  const [t2vPrompt, setT2vPrompt] = useState("");
  const [t2vImageUrl, setT2vImageUrl] = useState("");
  const [t2vDuration, setT2vDuration] = useState(5);
  const [t2vResult, setT2vResult] = useState<{ video_url: string; status: string; error?: string } | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const selectedTitle = useMemo(() => titles.find((t) => t.id === selectedTitleId), [titles, selectedTitleId]);

  // Auto-set quality saat mobile
  useEffect(() => {
    setQuality(isMobile ? "fast" : "balanced");
  }, [isMobile]);

  function setErr(e: any) {
    const msg = e?.message || e?.error || String(e || "Terjadi kesalahan");
    setError(msg);
  }

  async function callApi(path: string, body: any) {
    setLoading(path);
    setError("");
    try {
      const r = await fetch(`/api/hcnsec${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        const msg = data.error || data.message || `Error ${r.status}`;
        throw new Error(msg);
      }
      return data;
    } finally {
      setLoading(null);
    }
  }

  // ===== Step 1 =====
  async function doGenerateKeywords() {
    if (keywordMode === "manual") {
      const kws = manualKeywords.split(",").map((s) => s.trim()).filter(Boolean);
      if (!kws.length) return setErr("Keyword manual kosong");
      setKeywords(kws.map((t, i) => ({ id: `k${i}`, text: t })));
    } else {
      if (!niche.trim()) return setErr("Niche tidak boleh kosong");
      const { keywords: kws } = await callApi("/keywords", { niche, n: nKeywords });
      setKeywords(kws.map((t: string, i: number) => ({ id: `k${i}_${Date.now()}`, text: t })));
    }
  }

  // ===== Step 2 =====
  async function doGenerateTitles() {
    if (!keywords.length) return setErr("Belum ada keyword");
    setStageText("Menghasilkan judul...");
    const out: TitleItem[] = [];
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      setStageText(`Judul ${i + 1}/${keywords.length} untuk "${kw.text}"`);
      const { titles: ts } = await callApi("/titles", { keyword: kw.text, niche, n: titlesPerKw });
      ts.forEach((t: string, j: number) => out.push({ id: `${kw.id}_t${j}_${Date.now()}`, keyword: kw.text, text: t }));
    }
    setTitles(out);
    if (out.length) setSelectedTitleId(out[0].id);
    setStageText("");
  }

  // ===== Step 3 =====
  async function doGenerateImages() {
    if (!selectedTitle) return setErr("Pilih judul dulu");
    setStageText(`Generate ${nSlides} gambar AI...`);
    const newSlides: Slide[] = [];
    const errs: string[] = [];
    for (let i = 0; i < nSlides; i++) {
      setStageText(`Gambar ${i + 1}/${nSlides}...`);
      try {
        const res = await fetch("/api/hcnsec/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: selectedTitle.text,
            keyword: selectedTitle.keyword,
            niche,
            style: imageStyle,
            size: imageSize,
            enhance: true,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `Error ${res.status}`);
        }
        newSlides.push({ id: `s${i}_${Date.now()}_${i}`, imageUrl: data.url });
      } catch (e: any) {
        console.error(e);
        errs.push(`#${i+1}: ${e.message?.slice(0,120) || "gagal"}`);
      }
    }
    if (!newSlides.length) {
      setErr(`Semua ${nSlides} gambar gagal di-generate.\n\nPenyebab kemungkinan:\n• Saldo di api.hcnsec.cn habis\n• Model "${"step-image-edit-2"}" tidak support text-to-image (mungkin model edit, butuh gambar awal)\n• Koneksi HP tidak stabil\n\nDetail error:\n${errs.slice(0,3).join("\n")}\n\n💡 Solusi: coba upload gambar sendiri dulu, atau hubungi saya untuk ganti model gambar.`);
    } else {
      if (errs.length) setStageText(`Berhasil ${newSlides.length}/${nSlides} gambar (${errs.length} gagal). Lanjut...`);
      setSlides(newSlides);
      setError("");
    }
    setStageText("");
    setLoading(null);
  }

  function handleUploadImages(files: FileList | null) {
    if (!files) return;
    setStageText("Memproses gambar upload...");
    Promise.all(
      Array.from(files).slice(0, 12).map(
        (f) =>
          new Promise<Slide>((res) => {
            const r = new FileReader();
            r.onload = () => res({ id: `up_${f.name}_${Date.now()}`, imageUrl: r.result as string });
            r.readAsDataURL(f);
          })
      )
    ).then((s) => {
      setSlides((cur) => [...cur, ...s]);
      setStageText("");
    });
  }

  // ===== Step 4 =====
  async function doGenerateTTS() {
    if (!ttsText.trim()) return setErr("Teks TTS kosong");
    setStageText("Generate narasi suara...");
    const { url } = await callApi("/tts", { text: ttsText.slice(0, 3500), voice: ttsVoice });
    setTtsUrl(url);
    setStageText("");
  }
  function handleUploadMusic(f: File | undefined) {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return setErr("File musik terlalu besar (maks 15MB)");
    const r = new FileReader();
    r.onload = () => setMusicUrl(r.result as string);
    r.readAsDataURL(f);
  }
  async function doAutoScript() {
    if (!selectedTitle) return;
    setStageText("Buat script narasi otomatis...");
    const { lines } = await callApi("/script", {
      title: selectedTitle.text,
      keyword: selectedTitle.keyword,
      slides: slides.length || nSlides,
    });
    setTtsText(lines.join(" "));
    setStageText("");
  }

  // ===== Step 5: Render =====
  async function doRender() {
    if (!slides.length) return setErr("Belum ada gambar");
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(""); setVideoBlob(null); }
    setError("");
    setLoading("render");
    setProgress(0);
    setStageText("Menyiapkan render...");
    try {
      const audioUrl = await mixAudio();
      const blob = await renderSlideshow({
        images: slides.map((s) => s.imageUrl),
        audioUrl: audioUrl || undefined,
        slideDuration,
        vizStyle,
        vizColor,
        title: selectedTitle?.text,
        quality,
        mobileOptimized: isMobile,
        onProgress: (p) => setProgress(p),
        onStage: (s) => setStageText(s),
        transition,
      });
      setVideoBlob(blob);
      const u = URL.createObjectURL(blob);
      setVideoUrl(u);
      setStageText("✅ Video siap di-download!");
    } catch (e: any) {
      setErr(e.message || "Render gagal");
    } finally {
      setLoading(null);
    }
  }

  async function mixAudio(): Promise<string | null> {
    if (audioMode === "none") return null;
    const parts: string[] = [];
    if ((audioMode === "tts" || audioMode === "both") && ttsUrl) parts.push(ttsUrl);
    if ((audioMode === "music" || audioMode === "both") && musicUrl) parts.push(musicUrl);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    // Mix sederhana di browser
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const bufs = await Promise.all(parts.map((u) => fetch(u).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b))));
      const maxLen = Math.max(...bufs.map((b) => b.length));
      const sr = bufs[0].sampleRate;
      const ch = bufs[0].numberOfChannels;
      const out = actx.createBuffer(ch, maxLen, sr);
      for (let c = 0; c < ch; c++) {
        const od = out.getChannelData(c);
        for (let bi = 0; bi < bufs.length; bi++) {
          const b = bufs[bi];
          const d = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
          const vol = bi === 1 ? 0.25 : 1;
          for (let i = 0; i < d.length; i++) od[i] = Math.max(-1, Math.min(1, od[i] + d[i] * vol));
        }
      }
      const wav = bufferToWav(out);
      actx.close();
      return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    } catch (e) {
      console.warn("Mix audio gagal, pakai audio pertama:", e);
      return parts[0];
    }
  }

  function downloadVideo() {
    if (!videoBlob) return;
    const safeTitle = (selectedTitle?.text || "video").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 50) || "video";
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${safeTitle}_${Date.now()}.${ext}`);
  }

  // ===== T2V =====
  async function doT2V() {
    if (!t2vPrompt.trim()) return setErr("Prompt video kosong");
    setLoading("t2v");
    setError("");
    setT2vResult(null);
    setStageText("Meminta video ke AI (bisa sampai 1 menit)...");
    try {
      const r = await callApi("/video", {
        prompt: t2vPrompt,
        imageUrl: t2vImageUrl || undefined,
        duration: isMobile ? Math.min(t2vDuration, 5) : t2vDuration,
        aspectRatio: imageSize.startsWith("1024x1792") ? "9:16" : "16:9",
      });
      setT2vResult(r);
      if (!r.video_url) setErr(r.error || "Model video tidak tersedia di akun ini. Coba gunakan mode Slideshow ya bro.");
      setStageText("");
    } catch (e: any) {
      setErr(e.message);
      setStageText("");
    } finally {
      setLoading(null);
    }
  }

  async function doEnhancePrompt() {
    try {
      setStageText("Memperbaiki prompt dengan AI...");
      const r = await callApi("/image", { prompt: t2vPrompt, size: imageSize });
      // fallback: tidak ada endpoint khusus enhance, pakai chat? skip untuk sekarang.
      setStageText("");
    } catch (e: any) {
      // fitur enhance opsional
      setStageText("");
    }
  }

  return (
    <main className="min-h-screen px-3 sm:px-4 py-4 sm:py-6 max-w-6xl mx-auto">
      <Header />
      <ModeTabs mode={mode} setMode={(m) => { setMode(m); setStep(1); setError(""); setStageText(""); }} />

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm break-words">
          ⚠️ {error}
        </div>
      )}
      {stageText && loading && (
        <div className="mt-3 p-2 px-3 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-100 text-sm flex items-center gap-2">
          <Spinner /> {stageText}
        </div>
      )}

      {mode === "slideshow" ? (
        <div className="mt-4 lg:mt-6 grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 card">
            <StepBar step={step} />

            {step === 1 && (
              <section className="mt-4 space-y-3">
                <h2 className="text-lg sm:text-xl font-bold">🎯 Step 1: Ide & Keyword</h2>
                <label className="block">
                  <div className="text-xs sm:text-sm text-white/70 mb-1">Niche / topik</div>
                  <input className="input" value={niche} onChange={(e) => setNiche(e.target.value)}
                         placeholder="Contoh: tips motivasi mahasiswa" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Sumber keyword</div>
                    <select className="select" value={keywordMode} onChange={(e)=>setKeywordMode(e.target.value as any)}>
                      <option value="ai">🤖 AI</option>
                      <option value="manual">✍️ Manual</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Jumlah</div>
                    <input type="number" className="input" value={nKeywords} min={1} max={isMobile ? 5 : 10}
                           onChange={(e) => setNKeywords(Number(e.target.value))} />
                  </label>
                </div>
                {keywordMode === "manual" && (
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Keyword (pisah koma)</div>
                    <input className="input" value={manualKeywords} onChange={(e)=>setManualKeywords(e.target.value)}
                           placeholder="tidur nyenyak, belajar cepat" />
                  </label>
                )}
                <button className="btn btn-primary" onClick={doGenerateKeywords} disabled={!!loading}>
                  {loading === "/keywords" ? <Spinner /> : "🔑"} Generate Keyword
                </button>
                {keywords.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs sm:text-sm text-white/70 mb-2">Keyword ({keywords.length}):</div>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((k) => (
                        <span key={k.id} className="chip">
                          {k.text}
                          <button className="ml-1 text-red-300 hover:text-red-500"
                            onClick={()=>setKeywords(keywords.filter(x=>x.id!==k.id))}>×</button>
                        </span>
                      ))}
                      <button className="chip hover:bg-white/20"
                        onClick={()=>setKeywords([...keywords, {id:`k${Date.now()}`,text:""}])}>+ tambah</button>
                    </div>
                  </div>
                )}
                {keywords.length > 0 && (
                  <button className="btn btn-primary mt-2" onClick={() => setStep(2)}>Lanjut →</button>
                )}
              </section>
            )}

            {step === 2 && (
              <section className="mt-4 space-y-3">
                <h2 className="text-lg sm:text-xl font-bold">📝 Step 2: Judul Video</h2>
                <label className="block">
                  <div className="text-xs sm:text-sm text-white/70 mb-1">Judul per keyword</div>
                  <input type="number" className="input" value={titlesPerKw} min={1} max={3}
                         onChange={(e) => setTitlesPerKw(Number(e.target.value))} />
                </label>
                <button className="btn btn-primary" onClick={doGenerateTitles} disabled={!!loading}>
                  {loading === "/titles" ? <Spinner /> : "📝"} Generate Judul
                </button>
                {titles.length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-auto">
                    {titles.map((t) => (
                      <label key={t.id}
                        className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${
                          selectedTitleId === t.id ? "bg-purple-500/20 border-purple-400" : "bg-white/5 border-white/10"
                        }`}>
                        <input type="radio" name="title" checked={selectedTitleId === t.id}
                               onChange={()=>setSelectedTitleId(t.id)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm sm:text-base">{t.text}</div>
                          <div className="text-xs text-white/60">#{t.keyword}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(1)}>←</button>
                  {selectedTitleId && <button className="btn btn-primary" onClick={()=>setStep(3)}>Lanjut →</button>}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="mt-4 space-y-3">
                <h2 className="text-lg sm:text-xl font-bold">🖼️ Step 3: Gambar</h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Sumber</div>
                    <select className="select" value={imageSource} onChange={(e)=>setImageSource(e.target.value as any)}>
                      <option value="ai">🤖 AI</option>
                      <option value="upload">📁 Upload</option>
                      <option value="both">🔄 Campur</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Jumlah slide</div>
                    <input type="number" className="input" value={nSlides} min={1} max={isMobile?6:10}
                           onChange={(e) => setNSlides(Number(e.target.value))} />
                  </label>
                  <label className="block sm:col-span-2">
                    <div className="text-xs sm:text-sm text-white/70 mb-2">🎨 Style Gambar (pilih 1)</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {IMAGE_STYLE_PRESETS.map((s) => (
                        <button key={s.id} type="button"
                          onClick={()=>setImageStyle(s.id)}
                          className={`p-2 rounded-xl border text-left transition ${
                            imageStyle===s.id
                              ? "bg-gradient-to-br from-purple-600/40 to-pink-600/40 border-pink-400 shadow-lg"
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}>
                          <div className="text-sm font-bold">{s.label}</div>
                          <div className="text-[10px] text-white/60">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Rasio</div>
                    <select className="select" value={imageSize} onChange={(e)=>setImageSize(e.target.value)}>
                      {IMAGE_SIZES.map((s)=><option key={s.val} value={s.val}>{s.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {imageSource !== "upload" && (
                    <button className="btn btn-primary" onClick={doGenerateImages} disabled={!!loading}>
                      {loading === "/image" ? <Spinner /> : "🎨"} Generate Gambar
                    </button>
                  )}
                  {(imageSource === "upload" || imageSource === "both") && (
                    <label className="btn btn-ghost cursor-pointer">
                      📁 Upload
                      <input type="file" accept="image/*" multiple hidden
                             onChange={(e)=>handleUploadImages(e.target.files)} />
                    </label>
                  )}
                  {slides.length > 0 && (
                    <button className="btn btn-danger text-xs" onClick={()=>setSlides([])}>🗑️ Reset</button>
                  )}
                </div>
                {slides.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slides.map((s, i) => (
                      <div key={s.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                        <img src={s.imageUrl} className="w-full h-20 sm:h-24 object-cover" alt={`slide ${i+1}`} />
                        <button onClick={()=>setSlides(slides.filter(x=>x.id!==s.id))}
                                className="absolute top-1 right-1 bg-black/70 rounded-full w-5 h-5 text-red-300 text-xs leading-none">×</button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-center text-white">{i+1}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(2)}>←</button>
                  {slides.length > 0 && <button className="btn btn-primary" onClick={()=>setStep(4)}>Lanjut →</button>}
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="mt-4 space-y-3">
                <h2 className="text-lg sm:text-xl font-bold">🎵 Step 4: Audio</h2>
                <label className="block">
                  <div className="text-xs sm:text-sm text-white/70 mb-1">Mode</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {([["tts","🔊 TTS"],["music","🎵 Musik"],["both","🎶 Keduanya"],["none","🔇 Mute"]] as const).map(([v,l])=>(
                      <button key={v}
                        className={`btn text-xs sm:text-sm ${audioMode===v?"btn-primary":"btn-ghost"}`}
                        onClick={()=>setAudioMode(v as AudioMode)}>{l}</button>
                    ))}
                  </div>
                </label>
                {(audioMode==="tts" || audioMode==="both") && (
                  <div className="space-y-2 p-3 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs sm:text-sm text-white/70">Voice:</label>
                      <select className="select w-32 text-sm" value={ttsVoice} onChange={(e)=>setTtsVoice(e.target.value)}>
                        {VOICES.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                      <button className="btn btn-ghost text-xs" onClick={doAutoScript} disabled={!!loading}>✍️ Auto Script</button>
                    </div>
                    <textarea className="textarea text-sm" rows={isMobile?4:5} value={ttsText}
                      onChange={(e)=>setTtsText(e.target.value)}
                      placeholder="Teks narasi (klik Auto Script untuk digenerate)" />
                    <button className="btn btn-primary" onClick={doGenerateTTS} disabled={!!loading}>
                      {loading==="/tts"?<Spinner/>:"🔊"} Buat Narasi
                    </button>
                    {ttsUrl && <audio controls src={ttsUrl} className="w-full" />}
                  </div>
                )}
                {(audioMode==="music" || audioMode==="both") && (
                  <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                    <label className="block text-xs sm:text-sm text-white/70">Background music (mp3/wav, maks 15MB)</label>
                    <input type="file" accept="audio/*" className="text-sm"
                           onChange={(e)=>handleUploadMusic(e.target.files?.[0])} />
                    {musicUrl && <audio controls src={musicUrl} className="w-full" />}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(3)}>←</button>
                  <button className="btn btn-primary" onClick={()=>setStep(5)}>Lanjut →</button>
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="mt-4 space-y-3">
                <h2 className="text-lg sm:text-xl font-bold">🌈 Step 5: Visualizer & Render</h2>

                {/* Quality picker */}
                <label className="block">
                  <div className="text-xs sm:text-sm text-white/70 mb-1">Kualitas render {isMobile ? "(HP)" : ""}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([["fast","⚡ Cepat (HP)"],["balanced","⚖️ Seimbang"],["high","💎 Tinggi (PC)"]] as const).map(([v,l])=>(
                      <button key={v}
                        className={`btn text-xs sm:text-sm ${quality===v?"btn-primary":"btn-ghost"}`}
                        onClick={()=>setQuality(v as Quality)}>{l}</button>
                    ))}
                  </div>
                </label>

                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Style spectrum</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([["luxury","🔥 LUXURY (Trap Nation)"],["bars","📊 Classic Bars"],["circle","💫 Circle Wave"],["particles","✨ Particles"]] as const).map(([v,l])=>(
                        <button key={v}
                          className={`btn text-xs sm:text-sm ${vizStyle===v?"btn-primary":"btn-ghost"} ${v==="luxury"?"glow":""}`}
                          onClick={()=>setVizStyle(v as VizStyleType)}>{l}</button>
                      ))}
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Warna</div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {COLOR_PRESETS.map(c=>(
                        <button key={c} onClick={()=>setVizColor(c)}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 ${vizColor===c?"border-white scale-110":"border-white/20"}`}
                          style={{background:c}} />
                      ))}
                      <input type="color" value={vizColor} onChange={(e)=>setVizColor(e.target.value)}
                             className="w-8 h-8 rounded-full bg-transparent" />
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Durasi/slide (detik)</div>
                    <input type="number" className="input" min={1.5} max={10} step={0.5} value={slideDuration}
                           onChange={(e)=>setSlideDuration(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Transisi</div>
                    <select className="select" value={transition} onChange={(e)=>setTransition(e.target.value as any)}>
                      <option value="zoom">Slow Zoom</option>
                      <option value="fade">Fade</option>
                      <option value="none">Cut</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(4)}>←</button>
                  <button className="btn btn-primary glow" onClick={doRender} disabled={loading==="render"}>
                    {loading==="render"?<Spinner/>:"🎬"} Render Video
                  </button>
                  {videoUrl && <button className="btn btn-primary" onClick={downloadVideo}>💾 Download</button>}
                </div>
                {loading==="render" && (
                  <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                         style={{width:`${Math.round(progress*100)}%`}} />
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="card lg:sticky lg:top-4 self-start">
            <h3 className="font-bold text-base sm:text-lg mb-2">👁️ Preview</h3>
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
              {slides[0] ? (
                <img src={slides[0].imageUrl} className="w-full h-full object-cover" alt="preview" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-xs sm:text-sm text-center px-3">Belum ada gambar</div>
              )}
              <SpectrumVisualizer
                audioEl={previewAudioRef.current || undefined}
                style={vizStyle}
                color={vizColor}
                width={1280}
                height={720}
              />
              <div className="absolute bottom-1 left-2 right-2 text-white text-center text-xs sm:text-sm font-bold drop-shadow-[0_2px_6px_rgba(0,0,0,1)] truncate">
                {selectedTitle?.text || "Judul video di sini"}
              </div>
            </div>
            <audio ref={previewAudioRef} controls className="w-full mt-2"
                   src={ttsUrl || musicUrl || undefined} />
            <p className="text-[10px] sm:text-xs text-white/50 mt-2">Spectrum live preview. Style & warna sama dengan hasil final.</p>
            {videoUrl && (
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-semibold mb-1">✅ Hasil:</div>
                <video controls src={videoUrl} className="w-full rounded-xl border border-white/10" />
                <div className="text-[10px] text-white/50 mt-1">
                  {videoBlob && `${(videoBlob.size/1024/1024).toFixed(1)} MB · ${videoBlob.type}`}
                </div>
              </div>
            )}
            <ProjectMeta title={selectedTitle?.text} niche={niche} slides={slides.length} quality={quality} />
          </aside>
        </div>
      ) : (
        // ========= T2V =========
        <div className="mt-4 lg:mt-6 grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 card space-y-3">
            <h2 className="text-lg sm:text-xl font-bold">🎬 Text-to-Video AI</h2>
            <div className="text-xs sm:text-sm text-white/60 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-200">
              💡 Fitur ini bergantung pada model video yang tersedia di akun hcnsec kamu. Jika error "Invalid URL" / 404, itu artinya model video belum aktif di akun — gunakan mode <b>Slideshow + Spectrum</b> yang 100% berjalan.
            </div>
            <label className="block">
              <div className="text-xs sm:text-sm text-white/70 mb-1">Prompt (detailkan!)</div>
              <textarea className="textarea" rows={isMobile?4:5} value={t2vPrompt}
                onChange={(e)=>setT2vPrompt(e.target.value)}
                placeholder="Cth: A mother waits for her child to return home, dinner on the table, warm evening light, cinematic, slow motion, emotional" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs sm:text-sm text-white/70 mb-1">Durasi (detik) {isMobile ? "(max 5 di HP)" : ""}</div>
                <input type="number" className="input" min={2} max={isMobile?5:10} value={t2vDuration}
                       onChange={(e)=>setT2vDuration(Number(e.target.value))} />
              </label>
              <label className="block">
                <div className="text-xs sm:text-sm text-white/70 mb-1">Rasio</div>
                <select className="select" value={imageSize} onChange={(e)=>setImageSize(e.target.value)}>
                  <option value="1792x1024">16:9</option>
                  <option value="1024x1792">9:16 Shorts</option>
                </select>
              </label>
            </div>
            <label className="block">
              <div className="text-xs sm:text-sm text-white/70 mb-1">Image awal (opsional, untuk image-to-video)</div>
              <input type="url" className="input" value={t2vImageUrl} onChange={(e)=>setT2vImageUrl(e.target.value)}
                     placeholder="https://..." />
            </label>
            <button className="btn btn-primary glow" onClick={doT2V} disabled={!!loading}>
              {loading==="t2v"?<Spinner/>:"🎬"} Generate Video
            </button>
            {t2vResult && (
              <div className="mt-2 space-y-2">
                <div className="text-xs sm:text-sm">Status: <b>{t2vResult.status}</b></div>
                {t2vResult.video_url ? (
                  <>
                    <video controls src={t2vResult.video_url} className="w-full rounded-xl" />
                    <a className="btn btn-primary" href={t2vResult.video_url} target="_blank" rel="noreferrer" download>💾 Download</a>
                  </>
                ) : (
                  <div className="text-yellow-300 text-xs sm:text-sm">
                    {t2vResult.error || "Video masih diproses / model video tidak tersedia. Coba lagi 30 detik atau gunakan mode Slideshow."}
                  </div>
                )}
              </div>
            )}
          </div>
          <aside className="card self-start">
            <h3 className="font-bold mb-2 text-sm sm:text-base">💡 Tips prompt</h3>
            <ul className="text-xs sm:text-sm space-y-1 text-white/70 list-disc pl-4">
              <li>Pakai <b>Bahasa Inggris</b> hasilnya lebih bagus</li>
              <li>Sebutkan <b>shot type</b> (close-up, wide, drone)</li>
              <li>Sebutkan <b>motion</b> (slow pan, waves crashing, zoom in)</li>
              <li>Sebutkan <b>lighting</b> (golden hour, neon, cinematic)</li>
              <li>Tambah "4k, smooth motion, cinematic" di akhir</li>
            </ul>
          </aside>
        </div>
      )}

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg sm:text-xl glow flex-shrink-0">🎞️</div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">
            Verve <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">AI Video Studio</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-white/60 truncate">Keyword → Judul → Gambar → Spectrum → Video</p>
        </div>
      </div>
    </header>
  );
}

function ModeTabs({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <button onClick={()=>setMode("slideshow")} className={`btn text-xs sm:text-sm ${mode==="slideshow"?"btn-primary":"btn-ghost"}`}>🎞️ Slideshow</button>
      <button onClick={()=>setMode("t2v")} className={`btn text-xs sm:text-sm ${mode==="t2v"?"btn-primary":"btn-ghost"}`}>🎬 Text→Video</button>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  const labels = ["Keyword", "Judul", "Gambar", "Audio", "Render"];
  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step, done = n < step;
        return (
          <div key={n} className="flex items-center gap-1 sm:gap-2 min-w-max">
            <div className={`step-dot text-xs sm:text-sm ${active?"active":""} ${done?"done":""}`}>{done?"✓":n}</div>
            <div className={`text-[11px] sm:text-sm ${active?"text-white font-semibold":"text-white/60"}`}>{l}</div>
            {n < labels.length && <div className="w-4 sm:w-6 h-px bg-white/20" />}
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow" />;
}

function ProjectMeta({ title, niche, slides, quality }: { title?: string; niche: string; slides: number; quality: Quality }) {
  return (
    <div className="mt-3 p-2 rounded-xl bg-black/30 border border-white/10 text-[10px] sm:text-xs text-white/60 space-y-0.5">
      <div><b className="text-white/80">Niche:</b> {niche || "—"}</div>
      <div><b className="text-white/80">Judul:</b> <span className="truncate block">{title || "—"}</span></div>
      <div><b className="text-white/80">Slide:</b> {slides}</div>
      <div><b className="text-white/80">Kualitas:</b> {quality}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 text-center text-[10px] sm:text-xs text-white/40 pb-4">
      Verve AI Video Studio • Vercel + Supabase • api.hcnsec.cn
    </footer>
  );
}

function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate;
  const samples = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sr * blockAlign;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const ws = (o: number, s: string) => { for (let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,"RIFF"); v.setUint32(4,36+dataSize,true); ws(8,"WAVE"); ws(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true); v.setUint32(28,byteRate,true); v.setUint16(32,blockAlign,true); v.setUint16(34,16,true);
  ws(36,"data"); v.setUint32(40,dataSize,true);
  let off = 44;
  const ch: Float32Array[] = [];
  for (let c=0;c<numCh;c++) ch.push(buf.getChannelData(c));
  for (let i=0;i<samples;i++) {
    for (let c=0;c<numCh;c++) {
      let s = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return buffer;
}
