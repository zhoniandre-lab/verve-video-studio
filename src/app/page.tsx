"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SpectrumVisualizer from "@/components/SpectrumVisualizer";
import { renderSlideshow, downloadBlob } from "@/lib/recorder";
import type { VizStyle, AudioMode, ImageSource } from "@/lib/types";

type Mode = "slideshow" | "t2v";

interface KeywordItem { id: string; text: string; }
interface TitleItem { id: string; keyword: string; text: string; }
interface Slide { id: string; imageUrl: string; caption?: string; }

const COLOR_PRESETS = ["#ec4899", "#8b5cf6", "#22d3ee", "#f59e0b", "#22c55e", "#ef4444", "#ffffff"];
const IMAGE_STYLES = ["cinematic photo", "3D illustration", "anime style", "watercolor painting",
                      "cyberpunk art", "realistic photo", "minimalist flat design"];
const IMAGE_SIZES = [
  { label: "16:9 Landscape", val: "1792x1024" },
  { label: "9:16 Portrait (Shorts/TikTok)", val: "1024x1792" },
  { label: "1:1 Square", val: "1024x1024" },
];
const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default function Home() {
  const [mode, setMode] = useState<Mode>("slideshow");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // Step 1
  const [niche, setNiche] = useState("");
  const [nKeywords, setNKeywords] = useState(5);
  const [keywordMode, setKeywordMode] = useState<"ai" | "manual">("ai");
  const [manualKeywords, setManualKeywords] = useState("");
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);

  // Step 2
  const [titlesPerKw, setTitlesPerKw] = useState(1);
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<string>("");

  // Step 3 images
  const [imageSource, setImageSource] = useState<ImageSource>("ai");
  const [imageStyle, setImageStyle] = useState("cinematic photo");
  const [imageSize, setImageSize] = useState("1792x1024");
  const [nSlides, setNSlides] = useState(4);
  const [slides, setSlides] = useState<Slide[]>([]);

  // Step 4 audio
  const [audioMode, setAudioMode] = useState<AudioMode>("tts");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [ttsText, setTtsText] = useState("");
  const [ttsUrl, setTtsUrl] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");

  // Step 5 visualizer
  const [vizStyle, setVizStyle] = useState<VizStyle>("bars");
  const [vizColor, setVizColor] = useState("#ec4899");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transition, setTransition] = useState<"fade" | "zoom" | "none">("zoom");

  // Render preview
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [progress, setProgress] = useState(0);

  // Text to video
  const [t2vPrompt, setT2vPrompt] = useState("");
  const [t2vImageUrl, setT2vImageUrl] = useState("");
  const [t2vDuration, setT2vDuration] = useState(5);
  const [t2vResult, setT2vResult] = useState<{ video_url: string; status: string } | null>(null);

  // Preview audio element
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const selectedTitle = useMemo(() => titles.find((t) => t.id === selectedTitleId), [titles, selectedTitleId]);

  // ===== API helpers =====
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
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(null);
    }
  }

  // ===== STEP 1: Keyword =====
  async function doGenerateKeywords() {
    if (keywordMode === "manual") {
      const kws = manualKeywords.split(",").map((s) => s.trim()).filter(Boolean);
      if (!kws.length) { setError("Keyword manual kosong"); return; }
      setKeywords(kws.map((t, i) => ({ id: `k${i}`, text: t })));
    } else {
      if (!niche) { setError("Niche tidak boleh kosong"); return; }
      const { keywords: kws } = await callApi("/keywords", { niche, n: nKeywords });
      setKeywords(kws.map((t: string, i: number) => ({ id: `k${i}`, text: t })));
    }
  }

  // ===== STEP 2: Judul =====
  async function doGenerateTitles() {
    if (!keywords.length) { setError("Belum ada keyword"); return; }
    const out: TitleItem[] = [];
    for (const kw of keywords) {
      const { titles: ts } = await callApi("/titles", { keyword: kw.text, niche, n: titlesPerKw });
      ts.forEach((t: string, i: number) => out.push({ id: `${kw.id}_t${i}`, keyword: kw.text, text: t }));
    }
    setTitles(out);
    if (out.length) setSelectedTitleId(out[0].id);
  }

  // ===== STEP 3: Images =====
  async function doGenerateImages() {
    if (!selectedTitle) return;
    const newSlides: Slide[] = [];
    for (let i = 0; i < nSlides; i++) {
      try {
        const { url } = await callApi("/image", {
          title: selectedTitle.text,
          keyword: selectedTitle.keyword,
          niche,
          style: imageStyle,
          size: imageSize,
        });
        newSlides.push({ id: `s${i}_${Date.now()}`, imageUrl: url });
      } catch (e) {
        console.error(e);
      }
    }
    setSlides(newSlides);
  }

  function handleUploadImages(files: FileList | null) {
    if (!files) return;
    Promise.all(
      Array.from(files).map(
        (f) =>
          new Promise<Slide>((res) => {
            const r = new FileReader();
            r.onload = () => res({ id: `up_${f.name}_${Date.now()}`, imageUrl: r.result as string });
            r.readAsDataURL(f);
          })
      )
    ).then((s) => setSlides((cur) => [...cur, ...s]));
  }

  // ===== STEP 4: Audio =====
  async function doGenerateTTS() {
    if (!ttsText) { setError("Teks TTS kosong"); return; }
    const { url } = await callApi("/tts", { text: ttsText, voice: ttsVoice });
    setTtsUrl(url);
  }
  function handleUploadMusic(f: File | undefined) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setMusicUrl(r.result as string);
    r.readAsDataURL(f);
  }
  async function doAutoScript() {
    if (!selectedTitle) return;
    const { lines } = await callApi("/script", {
      title: selectedTitle.text,
      keyword: selectedTitle.keyword,
      slides: slides.length || nSlides,
    });
    setTtsText(lines.join(" "));
  }

  // ===== STEP 5: Render =====
  async function doRender() {
    if (!slides.length) { setError("Belum ada gambar"); return; }
    if (videoUrl) { URL.revokeObjectURL(videoUrl); }
    setVideoBlob(null);
    setVideoUrl("");
    setProgress(0);
    setLoading("render");
    setError("");
    try {
      // pakai TTS jika mode tts/both, music jika musik/both
      const combinedAudio = await mixAudio();
      const blob = await renderSlideshow({
        images: slides.map((s) => s.imageUrl),
        audioUrl: combinedAudio || undefined,
        slideDuration,
        vizStyle,
        vizColor,
        title: selectedTitle?.text,
        width: 1280,
        height: 720,
        onProgress: setProgress,
        transition,
      });
      setVideoBlob(blob);
      const u = URL.createObjectURL(blob);
      setVideoUrl(u);
    } catch (e: any) {
      setError(e.message || "Render gagal");
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
    // Mixing sederhana via Web Audio: decode keduanya, jumlahkan sample per channel, render ke WAV blob.
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new AC();
    const bufs = await Promise.all(parts.map((u) => fetch(u).then(r=>r.arrayBuffer()).then(b=>actx.decodeAudioData(b))));
    const maxLen = Math.max(...bufs.map(b=>b.length));
    const sr = bufs[0].sampleRate;
    const ch = bufs[0].numberOfChannels;
    const out = actx.createBuffer(ch, maxLen, sr);
    for (let c=0;c<ch;c++){
      const od = out.getChannelData(c);
      for (const b of bufs) {
        const d = b.getChannelData(Math.min(c, b.numberOfChannels-1));
        const vol = b === bufs[1] && parts.length === 2 ? 0.3 : 1; // music lebih kecil
        for (let i=0;i<d.length;i++) od[i] = Math.max(-1, Math.min(1, od[i] + d[i]*vol));
      }
    }
    const wav = bufferToWav(out);
    actx.close();
    return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  }

  function downloadVideo() {
    if (!videoBlob) return;
    const safeTitle = (selectedTitle?.text || "video").replace(/[^\w\- ]+/g, "").replace(/\s+/g,"_").slice(0,50);
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${safeTitle}_${Date.now()}.${ext}`);
  }

  // ===== T2V =====
  async function doT2V() {
    if (!t2vPrompt) { setError("Prompt video kosong"); return; }
    setLoading("t2v");
    setError("");
    try {
      const r = await callApi("/video", {
        prompt: t2vPrompt,
        imageUrl: t2vImageUrl || undefined,
        duration: t2vDuration,
        aspectRatio: imageSize.startsWith("1024x1792") ? "9:16" : "16:9",
      });
      setT2vResult(r);
    } finally { setLoading(null); }
  }

  // ===== UI =====
  return (
    <main className="min-h-screen px-4 py-6 max-w-6xl mx-auto">
      <Header />
      <ModeTabs mode={mode} setMode={(m) => { setMode(m); setStep(1); setError(""); }} />

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      {mode === "slideshow" ? (
        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <StepBar step={step} />

            {/* STEP 1 */}
            {step === 1 && (
              <section className="mt-5 space-y-4">
                <h2 className="text-xl font-bold">🎯 Step 1: Ide & Keyword</h2>
                <label className="block">
                  <div className="text-sm text-white/70 mb-1">Niche / topik utama</div>
                  <input className="input" value={niche} onChange={(e) => setNiche(e.target.value)}
                         placeholder="Contoh: tips produktivitas mahasiswa" />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Keyword dari mana</div>
                    <select className="select" value={keywordMode} onChange={(e)=>setKeywordMode(e.target.value as any)}>
                      <option value="ai">🤖 Generate AI</option>
                      <option value="manual">✍️ Manual</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Jumlah keyword</div>
                    <input type="number" className="input" value={nKeywords} min={1} max={15}
                           onChange={(e) => setNKeywords(Number(e.target.value))} />
                  </label>
                </div>
                {keywordMode === "manual" && (
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Keyword (pisah dengan koma)</div>
                    <input className="input" value={manualKeywords} onChange={(e)=>setManualKeywords(e.target.value)}
                           placeholder="tidur nyenyak, belajar cepat, ..." />
                  </label>
                )}
                <button className="btn btn-primary" onClick={doGenerateKeywords} disabled={!!loading}>
                  {loading === "/keywords" ? <Spinner /> : "🔑"} Generate Keyword
                </button>
                {keywords.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm text-white/70 mb-2">Keyword ({keywords.length}):</div>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((k) => (
                        <span key={k.id} className="chip">
                          {k.text}
                          <button className="ml-1 text-red-300 hover:text-red-500"
                            onClick={()=>setKeywords(keywords.filter(x=>x.id!==k.id))}>×</button>
                        </span>
                      ))}
                      <button className="chip hover:bg-white/20" onClick={()=>setKeywords([...keywords, {id:`k${Date.now()}`,text:""}])}>+ tambah</button>
                    </div>
                  </div>
                )}
                {keywords.length > 0 && (
                  <button className="btn btn-primary mt-3" onClick={() => setStep(2)}>Lanjut ke Judul →</button>
                )}
              </section>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <section className="mt-5 space-y-4">
                <h2 className="text-xl font-bold">📝 Step 2: Generate Judul Video</h2>
                <label className="block">
                  <div className="text-sm text-white/70 mb-1">Judul per keyword</div>
                  <input type="number" className="input" value={titlesPerKw} min={1} max={5}
                         onChange={(e) => setTitlesPerKw(Number(e.target.value))} />
                </label>
                <button className="btn btn-primary" onClick={doGenerateTitles} disabled={!!loading}>
                  {loading === "/titles" ? <Spinner /> : "📝"} Generate Judul
                </button>
                {titles.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-80 overflow-auto">
                    {titles.map((t) => (
                      <label key={t.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          selectedTitleId === t.id ? "bg-purple-500/20 border-purple-400" : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}>
                        <input type="radio" name="title" checked={selectedTitleId === t.id}
                               onChange={()=>setSelectedTitleId(t.id)} className="mt-1" />
                        <div>
                          <div className="font-semibold">{t.text}</div>
                          <div className="text-xs text-white/60">keyword: {t.keyword}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(1)}>← Kembali</button>
                  {selectedTitleId && (
                    <button className="btn btn-primary" onClick={()=>setStep(3)}>Lanjut ke Gambar →</button>
                  )}
                </div>
              </section>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <section className="mt-5 space-y-4">
                <h2 className="text-xl font-bold">🖼️ Step 3: Gambar Slideshow</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Sumber gambar</div>
                    <select className="select" value={imageSource} onChange={(e)=>setImageSource(e.target.value as any)}>
                      <option value="ai">🤖 AI generate saja</option>
                      <option value="upload">📁 Upload sendiri saja</option>
                      <option value="both">🔄 AI + Upload</option>
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Jumlah slide</div>
                    <input type="number" className="input" value={nSlides} min={1} max={12}
                           onChange={(e) => setNSlides(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Style gambar</div>
                    <select className="select" value={imageStyle} onChange={(e)=>setImageStyle(e.target.value)}>
                      {IMAGE_STYLES.map((s)=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Ukuran / rasio</div>
                    <select className="select" value={imageSize} onChange={(e)=>setImageSize(e.target.value)}>
                      {IMAGE_SIZES.map((s)=><option key={s.val} value={s.val}>{s.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {imageSource !== "upload" && (
                    <button className="btn btn-primary" onClick={doGenerateImages} disabled={!!loading}>
                      {loading === "/image" ? <Spinner /> : "🎨"} Generate Gambar AI
                    </button>
                  )}
                  {(imageSource === "upload" || imageSource === "both") && (
                    <label className="btn btn-ghost cursor-pointer">
                      📁 Upload Gambar
                      <input type="file" accept="image/*" multiple hidden
                             onChange={(e)=>handleUploadImages(e.target.files)} />
                    </label>
                  )}
                  <button className="btn btn-ghost" onClick={()=>setSlides([])}>🗑️ Reset</button>
                </div>
                {slides.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
                    {slides.map((s, i) => (
                      <div key={s.id} className="relative group rounded-xl overflow-hidden border border-white/10">
                        <img src={s.imageUrl} className="w-full h-28 object-cover" alt={`slide ${i+1}`} />
                        <button onClick={()=>setSlides(slides.filter(x=>x.id!==s.id))}
                                className="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 text-red-300 text-xs">×</button>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-xs px-1 rounded">{i+1}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(2)}>← Kembali</button>
                  {slides.length > 0 && (
                    <button className="btn btn-primary" onClick={()=>setStep(4)}>Lanjut ke Audio →</button>
                  )}
                </div>
              </section>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <section className="mt-5 space-y-4">
                <h2 className="text-xl font-bold">🎵 Step 4: Audio</h2>
                <label className="block">
                  <div className="text-sm text-white/70 mb-1">Mode audio</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {([
                      ["tts","🔊 TTS Narasi"],
                      ["music","🎵 Musik saja"],
                      ["both","🎶 Keduanya"],
                      ["none","🔇 Tanpa audio"],
                    ] as const).map(([v,l])=>(
                      <button key={v}
                        className={`btn ${audioMode===v?"btn-primary":"btn-ghost"}`}
                        onClick={()=>setAudioMode(v as AudioMode)}>{l}</button>
                    ))}
                  </div>
                </label>
                {(audioMode==="tts" || audioMode==="both") && (
                  <div className="space-y-3 p-4 rounded-xl bg-black/30 border border-white/10">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-white/70">Voice TTS:</label>
                      <select className="select w-40" value={ttsVoice} onChange={(e)=>setTtsVoice(e.target.value)}>
                        {VOICES.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                      <button className="btn btn-ghost text-sm" onClick={doAutoScript}>✍️ Auto Script</button>
                    </div>
                    <textarea className="textarea" rows={5} value={ttsText}
                      onChange={(e)=>setTtsText(e.target.value)}
                      placeholder="Teks narasi (bisa klik Auto Script untuk digenerate otomatis)" />
                    <button className="btn btn-primary" onClick={doGenerateTTS} disabled={!!loading}>
                      {loading==="/tts"?<Spinner/>:"🔊"} Generate Narasi
                    </button>
                    {ttsUrl && (
                      <audio controls src={ttsUrl} className="w-full" />
                    )}
                  </div>
                )}
                {(audioMode==="music" || audioMode==="both") && (
                  <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2">
                    <label className="block">
                      <div className="text-sm text-white/70 mb-1">Background music (mp3/wav)</div>
                      <input type="file" accept="audio/*" className="text-sm"
                             onChange={(e)=>handleUploadMusic(e.target.files?.[0])} />
                    </label>
                    {musicUrl && <audio controls src={musicUrl} className="w-full" />}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={()=>setStep(3)}>← Kembali</button>
                  <button className="btn btn-primary" onClick={()=>setStep(5)}>Lanjut ke Visualizer & Render →</button>
                </div>
              </section>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <section className="mt-5 space-y-4">
                <h2 className="text-xl font-bold">🌈 Step 5: Spectrum Visualizer & Render</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Style visualizer</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["bars","📊 Classic Bars"],
                        ["circle","💫 Circular Wave"],
                        ["particles","✨ Particles"],
                      ] as const).map(([v,l])=>(
                        <button key={v}
                          className={`btn text-sm ${vizStyle===v?"btn-primary":"btn-ghost"}`}
                          onClick={()=>setVizStyle(v as VizStyle)}>{l}</button>
                      ))}
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Warna spectrum</div>
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_PRESETS.map(c=>(
                        <button key={c} onClick={()=>setVizColor(c)}
                          className={`w-9 h-9 rounded-full border-2 ${vizColor===c?"border-white scale-110":"border-white/20"}`}
                          style={{background:c}} />
                      ))}
                      <input type="color" value={vizColor} onChange={(e)=>setVizColor(e.target.value)}
                             className="w-9 h-9 rounded-full bg-transparent" />
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Durasi per slide (detik)</div>
                    <input type="number" className="input" min={1} max={15} step={0.5} value={slideDuration}
                           onChange={(e)=>setSlideDuration(Number(e.target.value))} />
                  </label>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-1">Transisi slide</div>
                    <select className="select" value={transition} onChange={(e)=>setTransition(e.target.value as any)}>
                      <option value="zoom">Slow Zoom (Ken Burns)</option>
                      <option value="fade">Fade</option>
                      <option value="none">None (cut)</option>
                    </select>
                  </label>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-ghost" onClick={()=>setStep(4)}>← Kembali</button>
                  <button className="btn btn-primary glow" onClick={doRender} disabled={loading==="render"}>
                    {loading==="render"?<Spinner/>:"🎬"} Render Video Sekarang
                  </button>
                  {videoUrl && (
                    <button className="btn btn-primary" onClick={downloadVideo}>💾 Download MP4/WebM</button>
                  )}
                </div>
                {loading==="render" && (
                  <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                         style={{width:`${(progress*100).toFixed(0)}%`}} />
                  </div>
                )}
              </section>
            )}
          </div>

          {/* PREVIEW PANEL */}
          <aside className="card sticky top-4 self-start">
            <h3 className="font-bold text-lg mb-3">👁️ Preview</h3>
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
              {slides[0] ? (
                <img src={slides[0].imageUrl} className="w-full h-full object-cover" alt="preview" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
                  Belum ada gambar
                </div>
              )}
              {(audioMode !== "none") && (ttsUrl || musicUrl) && (
                <SpectrumVisualizer
                  audioEl={previewAudioRef.current || undefined}
                  style={vizStyle}
                  color={vizColor}
                />
              )}
              {(slides.length || audioMode === "none") && (ttsUrl || musicUrl) ? null :
                <SpectrumVisualizer style={vizStyle} color={vizColor} animateIdle />}
              <div className="absolute bottom-2 left-2 right-2 text-white text-center text-sm font-bold drop-shadow-[0_2px_6px_rgba(0,0,0,1)]">
                {selectedTitle?.text || "Judul video akan muncul di sini"}
              </div>
            </div>
            <audio ref={previewAudioRef} controls className="w-full mt-3"
                   src={ttsUrl || musicUrl || undefined} />
            <p className="text-xs text-white/50 mt-2">
              Preview spectrum live (idle animation jika belum ada audio).
              Style & warna sama persis dengan hasil render final.
            </p>

            {videoUrl && (
              <div className="mt-4">
                <div className="text-sm font-semibold mb-2">✅ Hasil video:</div>
                <video controls src={videoUrl} className="w-full rounded-xl border border-white/10" />
              </div>
            )}

            <ProjectMeta title={selectedTitle?.text} niche={niche} slides={slides.length} />
          </aside>
        </div>
      ) : (
        // ========== T2V MODE ==========
        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card space-y-4">
            <h2 className="text-xl font-bold">🎬 Text-to-Video AI</h2>
            <p className="text-sm text-white/60">
              Tulis prompt, langsung jadi video! (memakai model video AI dari api.hcnsec.cn)
            </p>
            <label className="block">
              <div className="text-sm text-white/70 mb-1">Prompt video</div>
              <textarea className="textarea" rows={5} value={t2vPrompt}
                onChange={(e)=>setT2vPrompt(e.target.value)}
                placeholder="Contoh: A cinematic drone shot of a tropical beach at sunset, waves crashing slowly, 4k, cinematic colors" />
            </label>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="block">
                <div className="text-sm text-white/70 mb-1">Durasi (detik)</div>
                <input type="number" className="input" min={2} max={10} value={t2vDuration}
                       onChange={(e)=>setT2vDuration(Number(e.target.value))} />
              </label>
              <label className="block">
                <div className="text-sm text-white/70 mb-1">Rasio</div>
                <select className="select" value={imageSize} onChange={(e)=>setImageSize(e.target.value)}>
                  <option value="1792x1024">16:9 Landscape</option>
                  <option value="1024x1792">9:16 Shorts</option>
                </select>
              </label>
            </div>
            <label className="block">
              <div className="text-sm text-white/70 mb-1">Image awal (opsional, untuk image-to-video)</div>
              <input type="url" className="input" value={t2vImageUrl} onChange={(e)=>setT2vImageUrl(e.target.value)}
                     placeholder="https://..." />
            </label>
            <button className="btn btn-primary glow" onClick={doT2V} disabled={!!loading}>
              {loading==="t2v"?<Spinner/>:"🎬"} Generate Video dari Prompt
            </button>
            {t2vResult && (
              <div className="mt-4 space-y-2">
                <div className="text-sm">Status: <b>{t2vResult.status}</b></div>
                {t2vResult.video_url ? (
                  <video controls src={t2vResult.video_url} className="w-full rounded-xl" />
                ) : (
                  <div className="text-yellow-300 text-sm">
                    Video masih diproses (async). Coba klik Generate lagi beberapa saat.
                    Pastikan model video di hcnsec tersedia (default: kling-v1).
                  </div>
                )}
                {t2vResult.video_url && (
                  <a className="btn btn-primary" href={t2vResult.video_url} target="_blank" download>💾 Download</a>
                )}
              </div>
            )}
          </div>
          <aside className="card self-start">
            <h3 className="font-bold mb-2">💡 Tips prompt</h3>
            <ul className="text-sm space-y-2 text-white/70 list-disc pl-5">
              <li>Sebutkan <b>shot type</b> (close-up, wide, drone, etc.)</li>
              <li>Sebutkan <b>lighting</b> (golden hour, neon, cinematic)</li>
              <li>Sebutkan <b>motion</b> (slow pan, zoom in, waves crashing)</li>
              <li>Detailkan <b>subjek + setting</b></li>
              <li>Tambahkan "4k, high detail, smooth motion" untuk kualitas lebih baik</li>
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
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl glow">🎞️</div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Verve <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">AI Video Studio</span></h1>
          <p className="text-xs text-white/60">Keyword → Judul → Gambar → Spectrum → Video. Sekali klik.</p>
        </div>
      </div>
      <a href="https://github.com" target="_blank" className="hidden sm:inline-flex btn btn-ghost text-sm">⭐ Star di GitHub</a>
    </header>
  );
}

function ModeTabs({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="mt-5 flex gap-2">
      <button onClick={()=>setMode("slideshow")} className={`btn ${mode==="slideshow"?"btn-primary":"btn-ghost"}`}>🎞️ Slideshow + Spectrum</button>
      <button onClick={()=>setMode("t2v")} className={`btn ${mode==="t2v"?"btn-primary":"btn-ghost"}`}>🎬 Text-to-Video AI</button>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  const labels = ["Ide/Keyword", "Judul", "Gambar", "Audio", "Visualizer"];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center gap-2 min-w-max">
            <div className={`step-dot ${active?"active":""} ${done?"done":""}`}>{done?"✓":n}</div>
            <div className={`text-sm ${active?"text-white font-semibold":"text-white/60"}`}>{l}</div>
            {n < labels.length && <div className="w-6 h-px bg-white/20 mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block spin-slow" />;
}

function ProjectMeta({ title, niche, slides }: { title?: string; niche: string; slides: number }) {
  return (
    <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/10 text-xs text-white/60 space-y-1">
      <div><b className="text-white/80">Niche:</b> {niche || "—"}</div>
      <div><b className="text-white/80">Judul:</b> {title || "—"}</div>
      <div><b className="text-white/80">Slide:</b> {slides}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 text-center text-xs text-white/40 pb-6">
      Verve AI Video Studio • Deploy ke Vercel • Database by Supabase • Powered by api.hcnsec.cn
    </footer>
  );
}

// ========== WAV helper (tidak dipakai di luar mixAudio) ==========
function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate;
  const samples = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sr * blockAlign;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  writeStr(0,"RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8,"WAVE"); writeStr(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true); v.setUint32(28,byteRate,true); v.setUint16(32,blockAlign,true);
  v.setUint16(34,16,true);
  writeStr(36,"data"); v.setUint32(40,dataSize,true);
  let off = 44;
  const channels: Float32Array[] = [];
  for (let c=0;c<numCh;c++) channels.push(buf.getChannelData(c));
  for (let i=0;i<samples;i++) {
    for (let c=0;c<numCh;c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return buffer;
}
