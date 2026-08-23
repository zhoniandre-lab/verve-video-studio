"use client";
/* =====================================================================
   🎧 VERVE ASMR STUDIO (v20.50) — CapCut-Style Editor
   Alat khusus memproduksi konten ASMR syahdu: menghidupkan foto diam
   dengan video overlay (hujan, salju, kabut, bara) luar kaca, menempelkan
   masking kotak kaca jendela, loop gema suara alam, dan mixing profesional.
   100% koding orisinal.
   ===================================================================== */
import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase"; // Untuk generate latar AI

interface LayerAsmr {
  id: string;
  name: string;
  type: "video" | "preset";
  src: string; // URL video/blob
  visible: boolean;
  // Transform
  width: number; // persentase (10-200)
  height: number;
  lockRatio: boolean;
  posX: number; // piksel offset dari tengah
  posY: number;
  rotate: number; // derajat (0-360)
  flipH: boolean;
  flipV: boolean;
  // Compositing
  blendMode: "screen" | "normal" | "lighten" | "multiply";
  opacity: number; // 0-100
  // Masking (Paling Penting untuk Kaca Jendela)
  maskOn: boolean;
  maskX: number; // fraksi dari W
  maskY: number; // fraksi dari H
  maskW: number;
  maskH: number;
  // Video DOM
  el?: HTMLVideoElement;
}

const PRESET_BG = [
  { id: "cozy-window", label: "🏡 Jendela Loteng Hujan", desc: "Suasana loteng kayu hangat menghadap luar", prompt: "Cozy attic bedroom with a large wooden window, heavy rain outside the glass, warm dramatic lighting, cinematic, realistic, 8K" },
  { id: "cozy-cafe", label: "☕ Kafe Sore Hari", desc: "Meja kayu dekat kaca jendela kafe kota", prompt: "Cozy warm coffee shop table next to a rainy glass window, city lights blurred in background, aesthetic, cinematic, photorealistic" },
  { id: "forest-cabin", label: "🌲 Kabin Tengah Hutan", desc: "Kabin kayu sepi di kelilingi pohon cemara", prompt: "Inside a rustic log cabin in a foggy pine forest, large glass window, cozy fireplace glowing, photorealistic, cinematic lighting" },
  { id: "cozy-bedroom", label: "🛌 Kamar Tidur Senja", desc: "Kasur empuk di samping jendela kaca besar", prompt: "Cozy modern bedroom next to a huge glass window at sunset, soft warm lighting, realistic interior design, high quality" }
];

const PRESET_SOUNDS = [
  { id: "rain", label: "🌧️ Hujan Deras", src: "https://assets.mixkit.co/active_storage/sfx/2458/2458-84.wav", desc: "Suara rintik air hujan membasahi atap" },
  { id: "thunder", label: "⚡ Guntur & Petir", src: "https://assets.mixkit.co/active_storage/sfx/1657/1657-84.wav", desc: "Suara guruh petir menggelegar halus" },
  { id: "campfire", label: "🔥 Bara Api Unggun", src: "https://assets.mixkit.co/active_storage/sfx/2432/2432-84.wav", desc: "Letupan bara kayu terbakar hangat" },
  { id: "forest", label: "🍃 Deru Angin Hutan", src: "https://assets.mixkit.co/active_storage/sfx/1188/1188-84.wav", desc: "Hembusan angin sepoi di dedaunan cemara" },
  { id: "cafe", label: "☕ Cafe Ambient", src: "https://assets.mixkit.co/active_storage/sfx/2650/2650-84.wav", desc: "Suara cangkir & obrolan sayup di kafe" }
];

// Simulasi loop animasi hujan/salju murni kanvas jika user belum upload video
function drawRainSimulation(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, density = 40) {
  ctx.strokeStyle = "rgba(174,196,220,0.45)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let i = 0; i < density; i++) {
    const x = (i * 97 + t * 150) % W;
    const y = (i * 123 + t * 450) % H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 16);
    ctx.stroke();
  }
}

function drawSnowSimulation(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, density = 25) {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < density; i++) {
    const x = (i * 143 + Math.sin(t + i) * 35) % W;
    const y = (i * 111 + t * 80) % H;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCampfireSimulation(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, density = 15) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < density; i++) {
    const x = W / 2 + Math.sin(t * 2 + i) * 30 + (i % 5 - 2) * 10;
    const y = H * 0.7 - ((t * (30 + i % 10) + i * 20) % (H * 0.3));
    const size = Math.max(2, 12 * (1 - (H * 0.7 - y) / (H * 0.3)));
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, "rgba(253,224,71,0.85)");
    g.addColorStop(0.4, "rgba(249,115,22,0.6)");
    g.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export default function AsmrStudio({ onExit }: { onExit: () => void }) {
  const [bgType, setBgType] = useState<"preset" | "upload" | "ai">("preset");
  const [bgPresetId, setBgPresetId] = useState("cozy-window");
  const [bgImg, setBgImg] = useState(""); // base64 / URL
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");

  // Layers
  const [layers, setLayers] = useState<LayerAsmr[]>([]);
  const [selLayerId, setSelLayerId] = useState<string>("");

  // Sound Ambient Loops
  const [selSoundId, setSelSoundId] = useState("rain");
  const [soundVolume, setSoundVolume] = useState(70); // 0-100

  // Playback & Canvas
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);

  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgElementRef = useRef<HTMLImageElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startAtRef = useRef(0);

  // Active Layer Ref for slider binding
  const activeLayer = layers.find((l) => l.id === selLayerId);

  // 1. Load Background Image
  useEffect(() => {
    if (bgType === "preset") {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => { bgImgElementRef.current = im; };
      im.src = `https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=1280&q=80`; // Fallback premium cozy interior
      // Khusus preset, gunakan gambar cozy room bawaan
      const urls: Record<string, string> = {
        "cozy-window": "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1280&q=80", // Window frame
        "cozy-cafe": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1280&q=80", // Cozy Cafe
        "forest-cabin": "https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=1280&q=80", // Forest cabin
        "cozy-bedroom": "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1280&q=80" // Bedroom window
      };
      im.src = urls[bgPresetId] || urls["cozy-window"];
    } else if (bgType === "upload" && bgImg) {
      const im = new Image();
      im.onload = () => { bgImgElementRef.current = im; };
      im.src = bgImg;
    } else if (bgType === "ai" && bgImg) {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => { bgImgElementRef.current = im; };
      im.src = bgImg;
    }
  }, [bgType, bgPresetId, bgImg]);

  // 2. Load Ambient Sound Buffer
  useEffect(() => {
    const s = PRESET_SOUNDS.find((x) => x.id === selSoundId) || PRESET_SOUNDS[0];
    void loadSound(s.src);
  }, [selSoundId]);

  // 3. Audio Volume Sync
  useEffect(() => {
    if (audioGainRef.current) {
      audioGainRef.current.gain.value = soundVolume / 100;
    }
  }, [soundVolume]);

  async function loadSound(url: string) {
    try {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const buf = await audioContextRef.current.decodeAudioData(ab);
      audioBufferRef.current = buf;
    } catch (e) {
      console.warn("Gagal load sound loop:", e);
    }
  }

  // 4. AI Background Generator
  async function generateAiBg() {
    const pr = aiPrompt.trim() || PRESET_BG.find((x) => x.id === bgPresetId)?.prompt || "cozy room window";
    setAiBusy(true); setAiStatus("🎨 Menggambar latar AI...");
    try {
      const supabase = createClient();
      const promptText = `Aesthetic cozy ASMR background scene, ${pr}, no text, no watermark, highly realistic, dramatic cinematic lighting, 8k quality, digital photography.`;
      
      const r = await fetch("/api/hcnsec/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "asmr_bg", keyword: "asmr", niche: "ambient", _rawPrompt: true, prompt: promptText }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "Gagal menggambar.");
      setBgImg(j.url);
      setBgType("ai");
      setAiStatus("✅ Gambar latar AI berhasil terpasang!");
    } catch (e: any) {
      setAiStatus(`❌ Gagal: ${e?.message || e}`);
    } finally {
      setAiBusy(false);
    }
  }

  // 5. Add / Duplicate / Delete Layer
  const addNewLayer = (type: "video" | "preset", name: string, src: string, file?: File) => {
    const id = `lay_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    let el: HTMLVideoElement | undefined;
    if (type === "video" && src) {
      el = document.createElement("video");
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.src = src;
      el.play().catch(() => {});
    }
    const newLay: LayerAsmr = {
      id, name, type, src, visible: true,
      width: 100, height: 100, lockRatio: true,
      posX: 0, posY: 0, rotate: 0, flipH: false, flipV: false,
      blendMode: "screen", opacity: 90,
      maskOn: false, maskX: 0.25, maskY: 0.25, maskW: 360, maskH: 260,
      el
    };
    setLayers((l) => [...l, newLay]);
    setSelLayerId(id);
  };

  const duplicateLayer = (lay: LayerAsmr) => {
    const id = `lay_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
    let el: HTMLVideoElement | undefined;
    if (lay.type === "video" && lay.src) {
      el = document.createElement("video");
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.src = lay.src;
      el.play().catch(() => {});
    }
    const dup: LayerAsmr = {
      ...lay,
      id,
      name: `${lay.name} (Copy)`,
      posX: lay.posX + 30, // Geser sedikit biar kelihatan
      posY: lay.posY + 30,
      el
    };
    setLayers((l) => [...l, dup]);
    setSelLayerId(id);
  };

  const deleteLayer = (id: string) => {
    const lay = layers.find((l) => l.id === id);
    if (lay?.el) {
      try { lay.el.pause(); lay.el.remove(); } catch {}
    }
    setLayers((l) => l.filter((x) => x.id !== id));
    if (selLayerId === id) setSelLayerId("");
  };

  const updateLayer = (id: string, props: Partial<LayerAsmr>) => {
    setLayers((arr) => arr.map((l) => (l.id === id ? { ...l, ...props } : l)));
  };

  // 6. Draw Workspace Canvas Loop
  const drawScene = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    ctx.clearRect(0, 0, W, H);
    // Draw Background
    if (bgImgElementRef.current) {
      ctx.drawImage(bgImgElementRef.current, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#0c0d14"; ctx.fillRect(0, 0, W, H);
    }

    // Draw Layers
    layers.forEach((l) => {
      if (!l.visible) return;
      ctx.save();

      // a. Setup Clipping Mask (Untuk Kaca Jendela)
      // Jika Masker Kotak aktif, batasi render HANYA di dalam area kaca
      if (l.maskOn) {
        ctx.beginPath();
        const mx = l.maskX * W, my = l.maskY * H;
        ctx.rect(mx, my, l.maskW, l.maskH);
        ctx.clip();
      }

      // b. Transform & Compositing
      const cx = W / 2 + l.posX, cy = H / 2 + l.posY;
      ctx.translate(cx, cy);
      ctx.rotate((l.rotate * Math.PI) / 180);
      ctx.scale(l.flipH ? -1 : 1, l.flipV ? -1 : 1);
      ctx.globalAlpha = l.opacity / 100;
      ctx.globalCompositeOperation = l.blendMode === "screen" ? "screen" : (l.blendMode === "lighten" ? "screen" : "source-over");

      const w = W * (l.width / 100);
      const h = H * (l.height / 100);

      // c. Draw Content
      if (l.type === "video" && l.el && l.el.readyState >= 2) {
        ctx.drawImage(l.el, -w / 2, -h / 2, w, h);
      } else {
        // Fallback: Simulasi Hujan/Salju Animasi jika video belum termuat
        ctx.translate(-w / 2, -h / 2);
        if (l.name.includes("Salju")) {
          drawSnowSimulation(ctx, w, h, t);
        } else if (l.name.includes("Bara")) {
          drawCampfireSimulation(ctx, w, h, t);
        } else {
          drawRainSimulation(ctx, w, h, t);
        }
      }

      ctx.restore();

      // d. Draw Edit Outline (Basic & Mask) hanya jika sedang diedit / tidak rendering
      if (!rendering && selLayerId === l.id) {
        // Draw Mask Outline (Cyan)
        if (l.maskOn) {
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(l.maskX * W, l.maskY * H, l.maskW, l.maskH);
          ctx.setLineDash([]);
          // Handles / Anchor
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath(); ctx.arc(l.maskX * W, l.maskY * H, 6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(l.maskX * W + l.maskW, l.maskY * H + l.maskH, 6, 0, Math.PI * 2); ctx.fill();
        }
        // Draw Boundary Layer Outline (Red/Purple)
        ctx.strokeStyle = "rgba(139,92,246,0.6)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      }
    });
  }, [layers, selLayerId, bgType, bgPresetId, bgImg, rendering]);

  const tick = useCallback(() => {
    if (rendering) return;
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const t = playing ? (audioContextRef.current ? audioContextRef.current.currentTime - startAtRef.current : performance.now() / 1000) : performance.now() / 1000;
    drawScene(ctx, cv.width, cv.height, t);
    rafRef.current = requestAnimationFrame(tick);
  }, [playing, drawScene, rendering]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [tick]);

  // 7. Sound Audition & Loop
  const togglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const startPlayback = async () => {
    if (!audioBufferRef.current) return;
    try {
      const ctx = audioContextRef.current!;
      await ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = audioBufferRef.current;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = soundVolume / 100;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
      audioSourceRef.current = src;
      audioGainRef.current = gain;
      startAtRef.current = ctx.currentTime;
      setPlaying(true);
      // Mainkan video overlay jika ada
      layers.forEach((l) => { if (l.el) l.el.play().catch(() => {}); });
    } catch (e) {
      console.warn(e);
    }
  };

  const stopPlayback = () => {
    try { audioSourceRef.current?.stop(); } catch {}
    audioSourceRef.current = null;
    audioGainRef.current = null;
    setPlaying(false);
    layers.forEach((l) => { if (l.el) l.el.pause(); });
  };

  // 8. Super Fast WebCodecs Offline Renderer
  const renderAsmrVideo = async () => {
    if (rendering) return;
    stopPlayback();
    setRendering(true); setProgress(0); setRenderedUrl(""); setRenderedBlob(null);

    const W = 1280, H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    const dur = 30; // Cukup 30 detik untuk video ASMR Reels/Shorts/TikTok
    const fps = 30;
    const totalFrames = dur * fps;

    logDiag(`Render ASMR: ${W}x${H} · ${fps}fps · durasi=${dur}s`);

    try {
      // Setup Web Audio Offline Context untuk merender mixing audio alam
      const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const actx = new OfflineAudioCtx(2, 44100 * dur, 44100);
      
      if (audioBufferRef.current) {
        const src = actx.createBufferSource();
        src.buffer = audioBufferRef.current;
        src.loop = true;
        const gain = actx.createGain();
        gain.gain.value = soundVolume / 100;
        src.connect(gain);
        gain.connect(actx.destination);
        src.start(0);
      }
      
      const audioRender = actx.startRendering();

      // Render Frame Visual & Audio menggunakan WebCodecs
      // 🚀 Gunakan Muxer super cepat & enteng
      const { WebMWriter } = await import("webm-muxer" as any).catch(() => ({ WebMWriter: null })); // Fallback ke WebM
      const chunks: Blob[] = [];
      
      // Mengingat WebCodecs butuh browser Chromium modern, kita gunakan fallback MediaRecorder berkecepatan 3x
      const stream = canvas.captureStream(fps);
      const audioDest = audioContextRef.current ? audioContextRef.current.createMediaStreamDestination() : null;
      
      const mixedAudioBuffer = await audioRender;
      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playNode = tempCtx.createBufferSource();
      playNode.buffer = mixedAudioBuffer;
      const dest = tempCtx.createMediaStreamDestination();
      playNode.connect(dest);
      playNode.start(0);

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find(m => {
        try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
      }) || "";

      const mr = new MediaRecorder(combinedStream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      
      const done = new Promise<Blob>((resolve) => {
        mr.onstop = () => resolve(new Blob(chunks, { type: chunks[0]?.type || "video/mp4" }));
      });

      mr.start();
      
      let frame = 0;
      const renderTick = () => {
        if (frame >= totalFrames) {
          mr.stop();
          playNode.stop();
          try { tempCtx.close(); } catch {}
          return;
        }
        const t = frame / fps;
        drawScene(ctx, W, H, t);
        setProgress(frame / totalFrames);
        frame++;
        setTimeout(renderTick, 1000 / fps / 3.5); // Dipercepat 3.5x kecepatan realtime!
      };

      renderTick();
      const blob = await done;
      setRenderedBlob(blob);
      setRenderedUrl(URL.createObjectURL(blob));
      setProgress(1);
    } catch (e: any) {
      alert("Render Gagal: " + (e?.message || e));
    } finally {
      setRendering(false);
    }
  };

  const [diagList, setDiagList] = useState<string[]>([]);
  function logDiag(msg: string) {
    setDiagList((d) => [...d.slice(-20), `${new Date().toLocaleTimeString()} - ${msg}`]);
  }

  return (
    <div className="v6e-root" style={{ background: "#08080d", color: "#fff", display: "flex", flexDirection: "column", height: "100vh" }}>
      <header className="v6e-top" style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0c0d14" }}>
        <button className="v6e-tbtn" style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }} onClick={() => { stopPlayback(); onExit(); }}>✕</button>
        <b style={{ fontSize: 13, flex: 1, marginLeft: 10 }}>🎧 ASMR Studio (CapCut-Style)</b>
        <button className="v6e-export" style={{ background: "#22c55e", color: "#052e16", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }} onClick={renderAsmrVideo} disabled={rendering}>
          {rendering ? `⏳ ${Math.round(progress * 100)}%` : "Ekspor Video ›"}
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* KANVAS EDIT UTAMA (Tengah) */}
        <div style={{ flex: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12, position: "relative", background: "#050508" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 640, aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.1)", background: "#000" }}>
            <canvas
              ref={cvRef}
              width={1280}
              height={720}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
            {/* Direct Canvas Interaction Info */}
            <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: 6, fontSize: 9, color: "#a5f3fc" }}>
              💡 Gunakan panel samping kanan untuk menggeser & mengatur masking kaca jendela
            </div>
            
            {/* Play/Pause overlay */}
            <button
              onClick={togglePlay}
              style={{ position: "absolute", right: 10, top: 10, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {playing ? "⏸ Jeda ASMR" : "▶ Putar ASMR"}
            </button>
          </div>

          {renderedUrl && (
            <div style={{ width: "100%", maxWidth: 640, marginTop: 12, border: "1px solid #22c55e", borderRadius: 12, padding: 10, background: "rgba(34,197,94,0.06)" }}>
              <b style={{ fontSize: 11, color: "#86efac", display: "block", marginBottom: 6 }}>🎥 VIDEO ASMR SELESAI DIRENDER:</b>
              <video src={renderedUrl} controls style={{ width: "100%", borderRadius: 8, display: "block", marginBottom: 8 }} />
              <button
                className="v6-bigcta"
                style={{ width: "100%", padding: 10, background: "#22c55e", color: "#052e16", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                onClick={() => {
                  if (!renderedBlob) return;
                  const a = document.createElement("a");
                  a.href = renderedUrl;
                  a.download = `asmr_${Date.now()}.mp4`;
                  a.click();
                }}
              >
                📥 Download Video ASMR (MP4)
              </button>
            </div>
          )}
        </div>

        {/* CONTROLS SIDEBAR PANEL (Kanan - CapCut Style) */}
        <div style={{ width: 340, background: "#0c0d14", borderLeft: "1px solid rgba(255,255,255,0.08)", overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Section: LATAR (Background) */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
            <b style={{ fontSize: 11, color: "#c4b5fd", display: "block", marginBottom: 6 }}>🌌 GAMBAR LATAR (BACKGROUND)</b>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {(["preset", "upload", "ai"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBgType(t)}
                  style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: bgType === t ? "rgba(139,92,246,0.3)" : "none", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  {t === "preset" ? "🏡 Preset" : t === "upload" ? "📤 Foto HP" : "🎨 AI"}
                </button>
              ))}
            </div>

            {bgType === "preset" && (
              <select
                className="v6-inp"
                value={bgPresetId}
                onChange={(e) => setBgPresetId(e.target.value)}
                style={{ fontSize: 11 }}
              >
                {PRESET_BG.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}

            {bgType === "upload" && (
              <label className="v6-chip" style={{ display: "block", textAlign: "center", padding: "8px", border: "1.5px dashed rgba(255,255,255,0.15)", borderRadius: 8, cursor: "pointer" }}>
                <span>📤 Upload Foto Latar</span>
                <input type="file" accept="image/*" hidden onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const r = new FileReader(); r.onload = () => setBgImg(r.result as string); r.readAsDataURL(file);
                }} />
              </label>
            )}

            {bgType === "ai" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  className="v6-inp"
                  rows={2}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="cth: cozy room window looking outside at heavy rain, dramatic warm lighting..."
                  style={{ fontSize: 10.5 }}
                />
                <button
                  onClick={generateAiBg}
                  disabled={aiBusy}
                  style={{ padding: "8px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  {aiBusy ? "⏳ Sedang Menggambar..." : "✨ Gambar Latar AI"}
                </button>
                {aiStatus && <span style={{ fontSize: 9.5, color: aiStatus.startsWith("❌") ? "#fca5a5" : "#86efac" }}>{aiStatus}</span>}
              </div>
            )}
          </div>

          {/* Section: LAPISAN (Layers & Presets) */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
            <b style={{ fontSize: 11, color: "#c4b5fd", display: "block", marginBottom: 6 }}>🎞️ BAHAN OVERLAY BAHAN (Daftar Lapisan)</b>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {/* Presets Overlay instan */}
              <button
                className="v6-chip"
                style={{ flex: 1, fontSize: 10, padding: 5 }}
                onClick={() => addNewLayer("preset", "🌧️ Hujan Saluang", "")}
              >
                ＋ 🌧️ Hujan
              </button>
              <button
                className="v6-chip"
                style={{ flex: 1, fontSize: 10, padding: 5 }}
                onClick={() => addNewLayer("preset", "❄️ Salju Syahdu", "")}
              >
                ＋ ❄️ Salju
              </button>
              <button
                className="v6-chip"
                style={{ flex: 1, fontSize: 10, padding: 5 }}
                onClick={() => addNewLayer("preset", "🔥 Bara Api", "")}
              >
                ＋ 🔥 Bara
              </button>
            </div>

            {/* Custom Video Overlay Upload */}
            <label className="v6-chip" style={{ display: "block", textAlign: "center", padding: "6px", background: "rgba(139,92,246,0.1)", border: "1px dashed rgba(139,92,246,0.4)", borderRadius: 8, cursor: "pointer", marginBottom: 10 }}>
              <span style={{ fontSize: 10.5, color: "#c4b5fd" }}>📥 Upload Video HP Bahan Sendiri (.mp4)</span>
              <input type="file" accept="video/*" hidden onChange={(e) => {
                const file = e.target.files?.[0]; if (!file) return;
                addNewLayer("video", file.name, URL.createObjectURL(file), file);
              }} />
            </label>

            {/* Layers List */}
            {layers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, background: "rgba(0,0,0,0.2)", padding: 6, borderRadius: 8 }}>
                {layers.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => setSelLayerId(l.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: selLayerId === l.id ? "rgba(139,92,246,0.25)" : "none", border: selLayerId === l.id ? "1px solid rgba(139,92,246,0.4)" : "1px solid transparent", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 12 }}>{selLayerId === l.id ? "🎯" : "📄"}</span>
                    <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                    <button
                      className="lh-mini"
                      style={{ padding: "1px 5px", fontSize: 9 }}
                      onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}
                    >
                      {l.visible ? "👁" : "🚫"}
                    </button>
                    <button
                      className="lh-mini"
                      style={{ padding: "1px 5px", fontSize: 9 }}
                      onClick={(e) => { e.stopPropagation(); duplicateLayer(l); }}
                    >
                      🆎 Copi
                    </button>
                    <button
                      className="lh-mini"
                      style={{ padding: "1px 5px", fontSize: 9, background: "#ef4444" }}
                      onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 9.5, opacity: 0.5, textAlign: "center", margin: "10px 0" }}>Belum ada bahan overlay. Upload bahan video HP di atas atau klik preset instan.</p>
            )}
          </div>

          {/* EDIT PANEL (Hanya Tampil Jika Layer Dipilih) */}
          {activeLayer && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* TABS: TRANSFORM (Basic) */}
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <b style={{ fontSize: 10, color: "#38bdf8", display: "block", marginBottom: 8 }}>📐 TRANSFORM & POSITION (Basic)</b>
                
                <div className="v6-slider-row" style={{ margin: 0, marginBottom: 8 }}>
                  <div className="lr"><span>Lebar (Width)</span><b>{activeLayer.width}%</b></div>
                  <input type="range" min={10} max={200} value={activeLayer.width} onChange={(e) => {
                    const w = Number(e.target.value);
                    updateLayer(activeLayer.id, { width: w, height: activeLayer.lockRatio ? w : activeLayer.height });
                  }} />
                </div>

                {!activeLayer.lockRatio && (
                  <div className="v6-slider-row" style={{ margin: 0, marginBottom: 8 }}>
                    <div className="lr"><span>Tinggi (Height)</span><b>{activeLayer.height}%</b></div>
                    <input type="range" min={10} max={200} value={activeLayer.height} onChange={(e) => updateLayer(activeLayer.id, { height: Number(e.target.value) })} />
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 9.5 }}>
                    <input type="checkbox" checked={activeLayer.lockRatio} onChange={(e) => updateLayer(activeLayer.id, { lockRatio: e.target.checked })} />
                    Gembok Rasio
                  </label>
                </div>

                <div className="v6-slider-row" style={{ margin: 0, marginBottom: 8 }}>
                  <div className="lr"><span>Posisi Horizontal (X)</span><b>{activeLayer.posX}px</b></div>
                  <input type="range" min={-500} max={500} value={activeLayer.posX} onChange={(e) => updateLayer(activeLayer.id, { posX: Number(e.target.value) })} />
                </div>

                <div className="v6-slider-row" style={{ margin: 0, marginBottom: 8 }}>
                  <div className="lr"><span>Posisi Vertikal (Y)</span><b>{activeLayer.posY}px</b></div>
                  <input type="range" min={-500} max={500} value={activeLayer.posY} onChange={(e) => updateLayer(activeLayer.id, { posY: Number(e.target.value) })} />
                </div>

                <div className="v6-slider-row" style={{ margin: 0, marginBottom: 8 }}>
                  <div className="lr"><span>Rotasi (Rotate)</span><b>{activeLayer.rotate}°</b></div>
                  <input type="range" min={0} max={360} value={activeLayer.rotate} onChange={(e) => updateLayer(activeLayer.id, { rotate: Number(e.target.value) })} />
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className={`v6-chip ${activeLayer.flipH ? "on" : ""}`}
                    style={{ flex: 1, fontSize: 9.5, padding: "3px 6px" }}
                    onClick={() => updateLayer(activeLayer.id, { flipH: !activeLayer.flipH })}
                  >
                    ↔️ Balik H
                  </button>
                  <button
                    className={`v6-chip ${activeLayer.flipV ? "on" : ""}`}
                    style={{ flex: 1, fontSize: 9.5, padding: "3px 6px" }}
                    onClick={() => updateLayer(activeLayer.id, { flipV: !activeLayer.flipV })}
                  >
                    ↕️ Balik V
                  </button>
                </div>
              </div>

              {/* TABS: COMPOSITING */}
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <b style={{ fontSize: 10, color: "#38bdf8", display: "block", marginBottom: 8 }}>🎨 COMPOSITING & BLENDING (Pelekat)</b>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 9.5, color: "#8b8b98" }}>Blend Mode</span>
                  <select
                    className="v6-inp"
                    style={{ fontSize: 10, padding: "4px 8px" }}
                    value={activeLayer.blendMode}
                    onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as any })}
                  >
                    <option value="screen">Screen (Hilangkan latar hitam)</option>
                    <option value="normal">Normal</option>
                    <option value="lighten">Lighten</option>
                    <option value="multiply">Multiply</option>
                  </select>
                </div>

                <div className="v6-slider-row" style={{ margin: 0 }}>
                  <div className="lr"><span>Ketebalan (Opacity)</span><b>{activeLayer.opacity}%</b></div>
                  <input type="range" min={0} max={100} value={activeLayer.opacity} onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} />
                </div>
              </div>

              {/* TABS: MASKING (Paling Penting untuk Kaca Jendela) */}
              <div style={{ background: "rgba(34,197,94,0.04)", padding: 10, borderRadius: 10, border: "1px solid rgba(34,197,94,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <b style={{ fontSize: 10, color: "#4ade80" }}>🔳 MASKER KOTAK KACA JENDELA</b>
                  <button
                    className={`v6-toggle ${activeLayer.maskOn ? "on" : ""}`}
                    onClick={() => updateLayer(activeLayer.id, { maskOn: !activeLayer.maskOn })}
                  />
                </div>

                {activeLayer.maskOn && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="v6-slider-row" style={{ margin: 0 }}>
                      <div className="lr"><span>Posisi Mask X</span><b>{Math.round(activeLayer.maskX * 100)}%</b></div>
                      <input type="range" min={0} max={1} step={0.01} value={activeLayer.maskX} onChange={(e) => updateLayer(activeLayer.id, { maskX: Number(e.target.value) })} />
                    </div>

                    <div className="v6-slider-row" style={{ margin: 0 }}>
                      <div className="lr"><span>Posisi Mask Y</span><b>{Math.round(activeLayer.maskY * 100)}%</b></div>
                      <input type="range" min={0} max={1} step={0.01} value={activeLayer.maskY} onChange={(e) => updateLayer(activeLayer.id, { maskY: Number(e.target.value) })} />
                    </div>

                    <div className="v6-slider-row" style={{ margin: 0 }}>
                      <div className="lr"><span>Lebar Kaca Kotak (W)</span><b>{activeLayer.maskW}px</b></div>
                      <input type="range" min={10} max={1280} value={activeLayer.maskW} onChange={(e) => updateLayer(activeLayer.id, { maskW: Number(e.target.value) })} />
                    </div>

                    <div className="v6-slider-row" style={{ margin: 0 }}>
                      <div className="lr"><span>Tinggi Kaca Kotak (H)</span><b>{activeLayer.maskH}px</b></div>
                      <input type="range" min={10} max={720} value={activeLayer.maskH} onChange={(e) => updateLayer(activeLayer.id, { maskH: Number(e.target.value) })} />
                    </div>

                    <p style={{ fontSize: 9, color: "#a7f3d0", lineHeight: 1.3 }}>
                      💡 <b>Cara kerja:</b> Atur X, Y, W, H di atas agar masker kotak cyan pas menutupi bingkai kaca jendela. Air hujan hanya akan terekam "di luar kaca" saja!
                    </p>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <button
                className="v6-chip"
                style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)", color: "#94a3b8", padding: "8px", fontWeight: 700 }}
                onClick={() => {
                  updateLayer(activeLayer.id, {
                    width: 100, height: 100, lockRatio: true,
                    posX: 0, posY: 0, rotate: 0, flipH: false, flipV: false,
                    blendMode: "screen", opacity: 90,
                    maskOn: false, maskX: 0.25, maskY: 0.25, maskW: 360, maskH: 260
                  });
                }}
              >
                🔄 Reset Setelan Layer
              </button>
            </div>
          )}

          {/* Section: MIXING SUARA ALAM (Audio) */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
            <b style={{ fontSize: 11, color: "#c4b5fd", display: "block", marginBottom: 6 }}>🔊 GEMA & MIXING SUARA ALAM</b>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <select
                className="v6-inp"
                value={selSoundId}
                onChange={(e) => setSelSoundId(e.target.value)}
                style={{ fontSize: 11 }}
              >
                {PRESET_SOUNDS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <div className="v6-slider-row" style={{ margin: 0, marginTop: 4 }}>
                <div className="lr"><span>🔊 Volume Suara</span><b>{soundVolume}%</b></div>
                <input type="range" min={0} max={100} value={soundVolume} onChange={(e) => setSoundVolume(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
