"use client";
/* =====================================================================
   🎧 VERVE ASMR STUDIO — editor khusus ASMR.
   Foto → video hidup dengan gerak kamera lembut, atmosfer hujan/kabut/bara,
   loop suara alam, preview/review video, dan ekspor mandiri.

   Modul ini sengaja tidak memakai state proyek/editor lain. Storage yang dipakai
   hanya verve_asmr_studio_v1 dan semua kontrol berada di dalam halaman ASMR.
   ===================================================================== */
import { useCallback, useEffect, useRef, useState } from "react";
import { asmrCoverRect, asmrMaskRect, asmrMotionAt, type AsmrMotionMode } from "@/lib/asmr-motion";

const ASMR_PROJECT_KEY = "verve_asmr_studio_v1";
const PREVIEW_W = 1280;
const PREVIEW_H = 720;

type LayerType = "effect" | "video";
type EffectType = "rain" | "snow" | "fog" | "fire";
type BlendMode = "screen" | "normal" | "lighter" | "multiply";

type LayerAsmr = {
  id: string;
  name: string;
  type: LayerType;
  effect?: EffectType;
  src: string;
  visible: boolean;
  width: number;
  height: number;
  lockRatio: boolean;
  posX: number;
  posY: number;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  blendMode: BlendMode;
  opacity: number;
  maskOn: boolean;
  maskX: number;
  maskY: number;
  maskW: number;
  maskH: number;
  el?: HTMLVideoElement;
};

type PresetBackground = { id: string; label: string; desc: string; prompt: string; src: string };
type PresetSound = { id: string; label: string; desc: string; src: string };
type PresetOverlay = { id: EffectType; label: string; desc: string };

type ProjectSnapshot = {
  bgType: "preset" | "upload" | "ai";
  bgPresetId: string;
  bgSrc: string;
  bgName: string;
  motionMode: AsmrMotionMode;
  motionStrength: number;
  motionSpeed: number;
  layers: Omit<LayerAsmr, "el">[];
  selectedLayerId: string;
  soundId: string;
  customSoundSrc: string;
  soundName: string;
  soundVolume: number;
  duration: number;
  fps: number;
  resolution: "1080p" | "720p" | "480p";
};

const PRESET_BG: PresetBackground[] = [
  {
    id: "cozy-window",
    label: "🏡 Jendela Loteng Hujan",
    desc: "Kamar loteng hangat dengan jendela besar dan suasana hujan.",
    prompt: "cozy attic bedroom with a large wooden window, heavy rain outside the glass, warm dramatic lighting",
    src: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&q=85",
  },
  {
    id: "cozy-cafe",
    label: "☕ Kafe Sore Hari",
    desc: "Meja kayu dekat kaca, lampu kota bokeh, nyaman untuk ambience.",
    prompt: "cozy warm coffee shop table next to a rainy glass window, city lights blurred in background",
    src: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=85",
  },
  {
    id: "forest-cabin",
    label: "🌲 Kabin Tengah Hutan",
    desc: "Kabin kayu dan hutan pinus berkabut dengan cahaya api.",
    prompt: "inside a rustic log cabin in a foggy pine forest, large glass window, cozy fireplace glowing",
    src: "https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=1600&q=85",
  },
  {
    id: "cozy-bedroom",
    label: "🛌 Kamar Tidur Senja",
    desc: "Kamar tenang dengan cahaya senja yang lembut.",
    prompt: "cozy modern bedroom next to a huge glass window at sunset, soft warm lighting, realistic interior",
    src: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600&q=85",
  },
];

const PRESET_SOUNDS: PresetSound[] = [
  { id: "rain", label: "🌧️ Hujan Deras", desc: "Rintik hujan yang lebar dan menenangkan.", src: "https://assets.mixkit.co/active_storage/sfx/2458/2458-84.wav" },
  { id: "thunder", label: "⚡ Guntur Lembut", desc: "Guruh jauh untuk suasana malam.", src: "https://assets.mixkit.co/active_storage/sfx/1657/1657-84.wav" },
  { id: "campfire", label: "🔥 Bara Api Unggun", desc: "Letupan kayu dan bara yang hangat.", src: "https://assets.mixkit.co/active_storage/sfx/2432/2432-84.wav" },
  { id: "forest", label: "🍃 Angin Hutan", desc: "Hembusan angin di antara pepohonan.", src: "https://assets.mixkit.co/active_storage/sfx/1188/1188-84.wav" },
  { id: "cafe", label: "☕ Cafe Ambient", desc: "Keramaian kafe yang dibuat samar.", src: "https://assets.mixkit.co/active_storage/sfx/2650/2650-84.wav" },
];

const PRESET_OVERLAYS: PresetOverlay[] = [
  { id: "rain", label: "🌧️ Hujan", desc: "Garis air lembut di kaca." },
  { id: "snow", label: "❄️ Salju", desc: "Butiran turun perlahan." },
  { id: "fog", label: "🌫️ Kabut", desc: "Kabut tipis yang bergerak." },
  { id: "fire", label: "🔥 Bara", desc: "Cahaya bara berkedip hangat." },
];

const MOTION_OPTIONS: { id: AsmrMotionMode; label: string; desc: string }[] = [
  { id: "kenburns", label: "🎥 Ken Burns", desc: "Zoom pelan + geser diagonal" },
  { id: "drift", label: "🌊 Drift", desc: "Gerak kiri-kanan sangat lembut" },
  { id: "breathe", label: "🫧 Bernapas", desc: "Zoom masuk-keluar halus" },
  { id: "still", label: "⏸ Tetap", desc: "Tanpa gerak kamera" },
];

function uid(prefix = "asmr") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function fmtTime(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function makeVideoElement(src: string): HTMLVideoElement {
  const el = document.createElement("video");
  el.muted = true;
  el.loop = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = src;
  void el.play().catch(() => {});
  return el;
}

function positiveMod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function drawRain(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(190,220,245,.52)";
  ctx.lineWidth = Math.max(1, width / 900);
  ctx.lineCap = "round";
  const density = Math.max(32, Math.round(width / 18));
  for (let i = 0; i < density; i++) {
    const x = positiveMod(i * 97 + time * width * 0.16, width + 30) - 15;
    const y = positiveMod(i * 137 + time * height * 0.62, height + 50) - 25;
    const len = Math.max(8, height * (0.012 + (i % 4) * 0.003));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.16, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.78)";
  const density = Math.max(22, Math.round(width / 35));
  for (let i = 0; i < density; i++) {
    const x = positiveMod(i * 143 + Math.sin(time * 0.5 + i) * width * 0.04, width);
    const y = positiveMod(i * 111 + time * height * 0.12, height);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, width / 700 + (i % 3)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFog(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 4; i++) {
    const x = width * (0.15 + i * 0.25) + Math.sin(time * 0.08 + i) * width * 0.12;
    const y = height * (0.25 + (i % 2) * 0.4);
    const radius = width * (0.22 + (i % 3) * 0.03);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, "rgba(210,225,235,.14)");
    g.addColorStop(1, "rgba(210,225,235,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFire(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const baseX = width * 0.5;
  const baseY = height * 0.72;
  for (let i = 0; i < 24; i++) {
    const x = baseX + Math.sin(time * 2 + i * 1.7) * width * 0.08 + (i % 5 - 2) * width * 0.018;
    const y = baseY - positiveMod(time * height * (0.035 + (i % 5) * 0.006) + i * height * 0.025, height * 0.28);
    const size = Math.max(3, width * (0.006 + (i % 4) * 0.002));
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
    g.addColorStop(0, "rgba(255,245,170,.9)");
    g.addColorStop(.38, "rgba(249,115,22,.6)");
    g.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: EffectType, width: number, height: number, time: number) {
  if (effect === "snow") drawSnow(ctx, width, height, time);
  else if (effect === "fog") drawFog(ctx, width, height, time);
  else if (effect === "fire") drawFire(ctx, width, height, time);
  else drawRain(ctx, width, height, time);
}

function toSerializableLayer(layer: LayerAsmr): Omit<LayerAsmr, "el"> {
  const { el: _el, ...rest } = layer;
  return rest;
}

function inflateLayer(raw: Partial<LayerAsmr>): LayerAsmr {
  const type: LayerType = raw.type === "video" ? "video" : "effect";
  const src = typeof raw.src === "string" ? raw.src : "";
  const el = type === "video" && src && !src.startsWith("blob:") ? makeVideoElement(src) : undefined;
  return {
    id: typeof raw.id === "string" ? raw.id : uid("layer"),
    name: typeof raw.name === "string" ? raw.name : "Lapisan ASMR",
    type,
    effect: raw.effect || "rain",
    src,
    visible: raw.visible !== false,
    width: Number(raw.width) || 100,
    height: Number(raw.height) || 100,
    lockRatio: raw.lockRatio !== false,
    posX: Number(raw.posX) || 0,
    posY: Number(raw.posY) || 0,
    rotate: Number(raw.rotate) || 0,
    flipH: !!raw.flipH,
    flipV: !!raw.flipV,
    blendMode: raw.blendMode === "multiply" || raw.blendMode === "normal" || raw.blendMode === "lighter" ? raw.blendMode : "screen",
    opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 80,
    maskOn: !!raw.maskOn,
    maskX: Number.isFinite(Number(raw.maskX)) ? Number(raw.maskX) : .25,
    maskY: Number.isFinite(Number(raw.maskY)) ? Number(raw.maskY) : .25,
    maskW: Number.isFinite(Number(raw.maskW)) ? Number(raw.maskW) : 360,
    maskH: Number.isFinite(Number(raw.maskH)) ? Number(raw.maskH) : 260,
    el,
  };
}

type RenderOptions = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  duration: number;
  fps: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void;
  audio: AudioBuffer | null;
  cancelled: () => boolean;
  onProgress: (value: number) => void;
};

async function resampleForOpus(input: AudioBuffer, targetRate = 48000): Promise<AudioBuffer> {
  if (input.sampleRate === targetRate) return input;
  const Offline = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!Offline) return input;
  const ctx = new Offline(Math.min(2, input.numberOfChannels), Math.ceil(input.duration * targetRate), targetRate);
  const source = ctx.createBufferSource();
  source.buffer = input;
  source.connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}

/**
 * Render accelerated bila WebCodecs tersedia. Berbeda dari canvas.captureStream
 * biasa: timestamp frame ditulis ke muxer, jadi video benar-benar punya durasi
 * sesuai pilihan user walau proses encoding selesai lebih cepat dari real-time.
 */
async function renderWebCodecs(options: RenderOptions): Promise<Blob> {
  const AnyWindow = window as any;
  const VideoEncoderCtor = AnyWindow.VideoEncoder;
  const VideoFrameCtor = AnyWindow.VideoFrame;
  if (!VideoEncoderCtor || !VideoFrameCtor) throw new Error("WebCodecs tidak tersedia di browser ini");
  const { Muxer, ArrayBufferTarget } = await import("webm-muxer");
  const audio = options.audio ? await resampleForOpus(options.audio, 48000) : null;
  const hasAudio = !!audio && !!AnyWindow.AudioEncoder && !!AnyWindow.AudioData;
  if (options.audio && !hasAudio) throw new Error("AudioEncoder tidak tersedia");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "V_VP9", width: options.width, height: options.height, frameRate: options.fps },
    ...(hasAudio && audio ? {
      audio: { codec: "A_OPUS", numberOfChannels: Math.min(2, audio.numberOfChannels), sampleRate: 48000 },
    } : {}),
    firstTimestampBehavior: "offset",
  } as any);

  let encoderError: Error | null = null;
  const videoConfig = {
    codec: "vp09.00.10.08",
    width: options.width,
    height: options.height,
    bitrate: options.width >= 1920 ? 6_000_000 : options.width >= 1280 ? 3_800_000 : 2_000_000,
    framerate: options.fps,
  };
  if (VideoEncoderCtor.isConfigSupported) {
    const supported = await VideoEncoderCtor.isConfigSupported(videoConfig);
    if (!supported?.supported) throw new Error("Codec VP9 tidak didukung");
  }
  const videoEncoder = new VideoEncoderCtor({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (error: Error) => { encoderError = error; },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: any = null;
  if (hasAudio && audio) {
    audioEncoder = new AnyWindow.AudioEncoder({
      output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
      error: (error: Error) => { encoderError = error; },
    });
    audioEncoder.configure({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: Math.min(2, audio.numberOfChannels),
      bitrate: 128000,
    });

    const channels = Math.min(2, audio.numberOfChannels);
    const sourceFrames = Math.max(1, audio.length);
    const totalAudioFrames = Math.ceil(options.duration * 48000);
    const audioChunkFrames = 960;
    for (let start = 0; start < totalAudioFrames; start += audioChunkFrames) {
      if (options.cancelled()) throw new Error("Render dibatalkan");
      const frames = Math.min(audioChunkFrames, totalAudioFrames - start);
      const data = new Float32Array(frames * channels);
      for (let channel = 0; channel < channels; channel++) {
        const sourceData = audio.getChannelData(channel);
        for (let i = 0; i < frames; i++) data[channel * frames + i] = sourceData[(start + i) % sourceFrames] || 0;
      }
      const audioData = new AnyWindow.AudioData({
        format: "f32-planar",
        sampleRate: 48000,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round((start / 48000) * 1_000_000),
        data,
      });
      audioEncoder.encode(audioData);
      audioData.close();
      if (start % (audioChunkFrames * 50) === 0) await sleep(0);
    }
  }

  const totalFrames = Math.max(1, Math.ceil(options.duration * options.fps));
  const frameDuration = Math.round(1_000_000 / options.fps);
  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (options.cancelled()) throw new Error("Render dibatalkan");
      const time = frameIndex / options.fps;
      options.draw(options.ctx, options.width, options.height, time);
      const frame = new VideoFrameCtor(options.canvas, {
        timestamp: frameIndex * frameDuration,
        duration: frameDuration,
      });
      videoEncoder.encode(frame, { keyFrame: frameIndex === 0 || frameIndex % Math.max(1, options.fps * 2) === 0 });
      frame.close();
      if (frameIndex % Math.max(1, options.fps) === 0) options.onProgress(frameIndex / totalFrames);
      if (frameIndex % 8 === 0) await sleep(0);
    }
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/webm" });
  } finally {
    try { videoEncoder.close(); } catch {}
    try { audioEncoder?.close(); } catch {}
  }
}

/** Fallback yang benar-benar real-time untuk browser tanpa WebCodecs. */
async function renderMediaRecorder(options: RenderOptions): Promise<Blob> {
  if (!options.canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("Browser tidak mendukung perekaman video");
  const videoStream = options.canvas.captureStream(options.fps);
  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (options.audio) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      await audioCtx.resume().catch(() => {});
      audioDest = audioCtx.createMediaStreamDestination();
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = options.audio;
      audioSource.loop = true;
      audioSource.connect(audioDest);
      audioSource.start(0);
    }
  }
  const tracks = [...videoStream.getVideoTracks(), ...(audioDest ? audioDest.stream.getAudioTracks() : [])];
  const combined = new MediaStream(tracks);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4;codecs=avc1"].find((candidate) => {
    try { return MediaRecorder.isTypeSupported(candidate); } catch { return false; }
  }) || "";
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
  let rejectDone: (error: Error) => void = () => {};
  const done = new Promise<Blob>((resolve, reject) => {
    rejectDone = reject;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("MediaRecorder gagal merekam"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: chunks[0]?.type || mime || "video/webm" }));
  });
  try {
    recorder.start(1000);
    const totalFrames = Math.max(1, Math.ceil(options.duration * options.fps));
    const frameDelay = 1000 / options.fps;
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (options.cancelled()) {
        try { recorder.stop(); } catch {}
        throw new Error("Render dibatalkan");
      }
      options.draw(options.ctx, options.width, options.height, frameIndex / options.fps);
      if (frameIndex % Math.max(1, options.fps) === 0) options.onProgress(frameIndex / totalFrames);
      await sleep(frameDelay);
    }
    recorder.stop();
    const result = await done;
    return result;
  } catch (error) {
    rejectDone(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    tracks.forEach((track) => track.stop());
    try { audioSource?.stop(); } catch {}
    try { await audioCtx?.close(); } catch {}
  }
}

export default function AsmrStudio({ onExit }: { onExit: () => void }) {
  const [bgType, setBgType] = useState<"preset" | "upload" | "ai">("preset");
  const [bgPresetId, setBgPresetId] = useState("cozy-window");
  const [bgSrc, setBgSrc] = useState("");
  const [bgName, setBgName] = useState("Jendela Loteng Hujan");
  const [bgReady, setBgReady] = useState(false);
  const [bgError, setBgError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");

  const [motionMode, setMotionMode] = useState<AsmrMotionMode>("kenburns");
  const [motionStrength, setMotionStrength] = useState(35);
  const [motionSpeed, setMotionSpeed] = useState(1);

  const [layers, setLayers] = useState<LayerAsmr[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");

  const [soundId, setSoundId] = useState("rain");
  const [customSoundSrc, setCustomSoundSrc] = useState("");
  const [soundName, setSoundName] = useState("Hujan Deras");
  const [soundVolume, setSoundVolume] = useState(70);
  const [soundReady, setSoundReady] = useState(false);
  const [soundLoading, setSoundLoading] = useState(false);
  const [soundError, setSoundError] = useState("");

  const [duration, setDuration] = useState(30);
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState<"1080p" | "720p" | "480p">("720p");

  const [playing, setPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState("");
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedMime, setRenderedMime] = useState("");
  const [renderMode, setRenderMode] = useState("");
  const [notice, setNotice] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [diagList, setDiagList] = useState<string[]>([]);

  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewEpochRef = useRef(0);
  const startAtRef = useRef(0);
  const lastPreviewUiRef = useRef(0);
  const loadSoundSeqRef = useRef(0);
  const bgLoadSeqRef = useRef(0);
  const renderCancelledRef = useRef(false);
  const outputUrlRef = useRef("");
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const activeLayer = layers.find((layer) => layer.id === selectedLayerId);

  function logDiag(message: string) {
    setDiagList((old) => [...old.slice(-19), `${new Date().toLocaleTimeString()} — ${message}`]);
  }

  function rememberObjectUrl(url: string) {
    if (url.startsWith("blob:")) objectUrlsRef.current.add(url);
    return url;
  }

  function clearRenderedOutput() {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = "";
    }
    setRenderedUrl("");
    setRenderedBlob(null);
    setRenderedMime("");
  }

  // Load saved ASMR-only project. Uploaded blob URLs are intentionally not
  // restored because their underlying file disappears after a page reload.
  useEffect(() => {
    previewEpochRef.current = performance.now();
    try {
      const raw = localStorage.getItem(ASMR_PROJECT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<ProjectSnapshot>;
        const savedBgSrc = typeof saved.bgSrc === "string" && !saved.bgSrc.startsWith("blob:") ? saved.bgSrc : "";
        if (saved.bgType === "preset" || saved.bgType === "ai") setBgType(saved.bgType);
        else if (saved.bgType === "upload") setBgType(savedBgSrc ? "upload" : "preset");
        if (typeof saved.bgPresetId === "string") setBgPresetId(saved.bgPresetId);
        if (savedBgSrc) setBgSrc(savedBgSrc);
        if (typeof saved.bgName === "string") setBgName(saved.bgName);
        if (saved.motionMode === "kenburns" || saved.motionMode === "drift" || saved.motionMode === "breathe" || saved.motionMode === "still") setMotionMode(saved.motionMode);
        if (Number.isFinite(saved.motionStrength)) setMotionStrength(Math.max(0, Math.min(100, Number(saved.motionStrength))));
        if (Number.isFinite(saved.motionSpeed)) setMotionSpeed(Math.max(.2, Math.min(2, Number(saved.motionSpeed))));
        if (Array.isArray(saved.layers)) {
          const restored = saved.layers.filter((layer) => layer && !(layer.type === "video" && String(layer.src || "").startsWith("blob:"))).map(inflateLayer);
          setLayers(restored);
          if (typeof saved.selectedLayerId === "string") setSelectedLayerId(restored.some((layer) => layer.id === saved.selectedLayerId) ? saved.selectedLayerId : restored[0]?.id || "");
        }
        const savedCustomSound = typeof saved.customSoundSrc === "string" && !saved.customSoundSrc.startsWith("blob:") ? saved.customSoundSrc : "";
        if (saved.soundId === "custom" && !savedCustomSound) setSoundId("rain");
        else if (typeof saved.soundId === "string") setSoundId(saved.soundId);
        if (savedCustomSound) setCustomSoundSrc(savedCustomSound);
        if (typeof saved.soundName === "string") setSoundName(saved.soundName);
        if (Number.isFinite(saved.soundVolume)) setSoundVolume(Math.max(0, Math.min(100, Number(saved.soundVolume))));
        if ([30, 60, 300, 600, 1800, 3600, 7200].includes(Number(saved.duration))) setDuration(Number(saved.duration));
        if ([15, 24, 30].includes(Number(saved.fps))) setFps(Number(saved.fps));
        if (saved.resolution === "1080p" || saved.resolution === "720p" || saved.resolution === "480p") setResolution(saved.resolution);
        setProjectStatus("✅ Proyek ASMR terakhir dimuat");
      }
    } catch {
      setProjectStatus("⚠️ Draf ASMR lama tidak terbaca — mulai dari setelan baru");
    }
  }, []);

  // Background loader uses the same-origin image proxy for remote sources so
  // canvas export never becomes black because of a missing CORS header.
  useEffect(() => {
    const seq = ++bgLoadSeqRef.current;
    const preset = PRESET_BG.find((item) => item.id === bgPresetId) || PRESET_BG[0];
    const source = bgType === "preset" ? preset.src : bgSrc;
    setBgReady(false);
    setBgError("");
    bgImageRef.current = null;
    if (!source) return;
    const image = new Image();
    if (/^https?:\/\//.test(source)) image.crossOrigin = "anonymous";
    image.onload = () => {
      if (seq !== bgLoadSeqRef.current) return;
      bgImageRef.current = image;
      setBgReady(true);
      setBgError("");
    };
    image.onerror = () => {
      if (seq !== bgLoadSeqRef.current) return;
      setBgReady(false);
      setBgError("Gambar belum bisa dimuat — cek koneksi atau pilih Foto HP lain.");
    };
    image.src = /^https?:\/\//.test(source) ? `/api/proxy-img?url=${encodeURIComponent(source)}` : source;
    if (bgType === "preset") setBgName(preset.label.replace(/^\S+\s/, ""));
  }, [bgType, bgPresetId, bgSrc]);

  async function decodeSoundBytes(bytes: ArrayBuffer, label: string, seq: number) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) throw new Error("Browser tidak mendukung AudioContext");
    if (!audioContextRef.current) audioContextRef.current = new AC();
    const decoded = await audioContextRef.current.decodeAudioData(bytes.slice(0));
    if (seq !== loadSoundSeqRef.current) return;
    audioBufferRef.current = decoded;
    setSoundName(label);
    setSoundReady(true);
    setSoundError("");
  }

  async function loadSoundUrl(url: string, label: string) {
    const seq = ++loadSoundSeqRef.current;
    setSoundLoading(true);
    setSoundReady(false);
    setSoundError("");
    try {
      const fetchUrl = /^https?:\/\//.test(url) ? `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}` : url;
      const response = await fetch(fetchUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await decodeSoundBytes(await response.arrayBuffer(), label, seq);
    } catch (error: any) {
      if (seq === loadSoundSeqRef.current) {
        audioBufferRef.current = null;
        setSoundError(`Suara belum siap (${error?.message || "koneksi gagal"}). Video tetap bisa dibuat tanpa audio.`);
      }
    } finally {
      if (seq === loadSoundSeqRef.current) setSoundLoading(false);
    }
  }

  useEffect(() => {
    if (playing) stopPlayback();
    if (soundId === "custom") {
      if (customSoundSrc) void loadSoundUrl(customSoundSrc, soundName || "Audio HP");
      return;
    }
    const preset = PRESET_SOUNDS.find((item) => item.id === soundId) || PRESET_SOUNDS[0];
    void loadSoundUrl(preset.src, preset.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundId, customSoundSrc]);

  useEffect(() => {
    if (audioGainRef.current) audioGainRef.current.gain.value = soundVolume / 100;
  }, [soundVolume]);

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number, guides = true) => {
    ctx.clearRect(0, 0, width, height);
    const image = bgImageRef.current;
    if (image && image.complete && image.naturalWidth > 0) {
      const motion = asmrMotionAt(time, motionMode, motionStrength, motionSpeed);
      const rect = asmrCoverRect(image.naturalWidth, image.naturalHeight, width, height, motion.scale, motion.panX, motion.panY);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      const shade = ctx.createLinearGradient(0, 0, 0, height);
      shade.addColorStop(0, "rgba(5,8,15,.04)");
      shade.addColorStop(1, "rgba(5,8,15,.22)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
    } else {
      const fallback = ctx.createLinearGradient(0, 0, width, height);
      fallback.addColorStop(0, "#1a2230");
      fallback.addColorStop(.55, "#0c1720");
      fallback.addColorStop(1, "#05070c");
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.font = `${Math.max(14, width / 55)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("Pilih preset atau upload foto untuk mulai", width / 2, height / 2);
    }

    const sx = width / PREVIEW_W;
    const sy = height / PREVIEW_H;
    for (const layer of layers) {
      if (!layer.visible) continue;
      ctx.save();
      if (layer.maskOn) {
        const mask = asmrMaskRect(layer.maskX, layer.maskY, layer.maskW, layer.maskH, width, height);
        ctx.beginPath();
        ctx.rect(mask.x, mask.y, mask.width, mask.height);
        ctx.clip();
      }
      ctx.translate(width / 2 + layer.posX * sx, height / 2 + layer.posY * sy);
      ctx.rotate((layer.rotate * Math.PI) / 180);
      ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
      ctx.globalAlpha = Math.max(0, Math.min(100, layer.opacity)) / 100;
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      const layerWidth = width * (layer.width / 100);
      const layerHeight = height * (layer.height / 100);
      if (layer.type === "video" && layer.el && layer.el.readyState >= 2) {
        ctx.drawImage(layer.el, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      } else if (layer.type === "effect") {
        ctx.translate(-layerWidth / 2, -layerHeight / 2);
        drawEffect(ctx, layer.effect || "rain", layerWidth, layerHeight, time);
      } else {
        ctx.fillStyle = "rgba(148,163,184,.25)";
        ctx.fillRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      }
      ctx.restore();

      if (guides && selectedLayerId === layer.id) {
        ctx.save();
        ctx.strokeStyle = "rgba(167,139,250,.85)";
        ctx.lineWidth = Math.max(1, width / 700);
        const layerWidth = width * (layer.width / 100);
        const layerHeight = height * (layer.height / 100);
        ctx.strokeRect(width / 2 + layer.posX * sx - layerWidth / 2, height / 2 + layer.posY * sy - layerHeight / 2, layerWidth, layerHeight);
        if (layer.maskOn) {
          const mask = asmrMaskRect(layer.maskX, layer.maskY, layer.maskW, layer.maskH, width, height);
          ctx.setLineDash([8, 5]);
          ctx.strokeStyle = "#22d3ee";
          ctx.strokeRect(mask.x, mask.y, mask.width, mask.height);
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
  }, [layers, selectedLayerId, motionMode, motionStrength, motionSpeed]);

  const drawPreviewFrame = useCallback(() => {
    const canvas = cvRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = performance.now();
    const time = playing && audioContextRef.current
      ? Math.max(0, audioContextRef.current.currentTime - startAtRef.current)
      : Math.max(0, (now - (previewEpochRef.current || now)) / 1000);
    const displayTime = duration > 0 ? time % duration : time;
    if (playing && now - lastPreviewUiRef.current > 250) {
      lastPreviewUiRef.current = now;
      setPreviewTime(displayTime);
    }
    drawScene(ctx, canvas.width, canvas.height, displayTime, true);
    rafRef.current = requestAnimationFrame(drawPreviewFrame);
  }, [drawScene, playing, duration]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawPreviewFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [drawPreviewFrame]);

  function updateLayer(id: string, patch: Partial<LayerAsmr>) {
    setLayers((old) => old.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  }

  function addEffectLayer(effect: EffectType) {
    const meta = PRESET_OVERLAYS.find((item) => item.id === effect) || PRESET_OVERLAYS[0];
    const layer: LayerAsmr = {
      id: uid("layer"), name: meta.label, type: "effect", effect, src: "", visible: true,
      width: 100, height: 100, lockRatio: true, posX: 0, posY: 0, rotate: 0, flipH: false, flipV: false,
      blendMode: effect === "fire" ? "lighter" : "screen", opacity: effect === "fog" ? 42 : 72,
      maskOn: false, maskX: .25, maskY: .25, maskW: 360, maskH: 260,
    };
    setLayers((old) => [...old, layer]);
    setSelectedLayerId(layer.id);
    setNotice(`${meta.label} ditambahkan ke lapisan.`);
  }

  function addVideoLayer(file: File) {
    const src = rememberObjectUrl(URL.createObjectURL(file));
    const layer: LayerAsmr = {
      id: uid("layer"), name: file.name, type: "video", src, visible: true,
      width: 100, height: 100, lockRatio: true, posX: 0, posY: 0, rotate: 0, flipH: false, flipV: false,
      blendMode: "screen", opacity: 78, maskOn: false, maskX: .25, maskY: .25, maskW: 360, maskH: 260,
      el: makeVideoElement(src),
    };
    setLayers((old) => [...old, layer]);
    setSelectedLayerId(layer.id);
    setNotice("Video overlay ditambahkan. Atur opacity/masker di panel kanan.");
  }

  function duplicateLayer(layer: LayerAsmr) {
    const copy: LayerAsmr = {
      ...layer,
      id: uid("layer"),
      name: `${layer.name} · salinan`,
      posX: layer.posX + 24,
      posY: layer.posY + 18,
      el: layer.type === "video" && layer.src ? makeVideoElement(layer.src) : undefined,
    };
    setLayers((old) => [...old, copy]);
    setSelectedLayerId(copy.id);
  }

  function deleteLayer(id: string) {
    const layer = layers.find((item) => item.id === id);
    if (layer?.el) { try { layer.el.pause(); layer.el.remove(); } catch {} }
    if (layer?.src.startsWith("blob:") && !layers.some((item) => item.id !== id && item.src === layer.src)) {
      URL.revokeObjectURL(layer.src);
      objectUrlsRef.current.delete(layer.src);
    }
    setLayers((old) => old.filter((item) => item.id !== id));
    if (selectedLayerId === id) setSelectedLayerId("");
  }

  function handleBackgroundFile(file: File) {
    if (bgSrc.startsWith("blob:")) {
      URL.revokeObjectURL(bgSrc);
      objectUrlsRef.current.delete(bgSrc);
    }
    const src = rememberObjectUrl(URL.createObjectURL(file));
    setBgType("upload");
    setBgSrc(src);
    setBgName(file.name);
    setNotice("Foto HP terpasang. Pilih gerak kamera agar foto terasa hidup.");
  }

  async function generateAiBackground() {
    const preset = PRESET_BG.find((item) => item.id === bgPresetId) || PRESET_BG[0];
    const prompt = aiPrompt.trim() || preset.prompt;
    setAiBusy(true);
    setAiStatus("🎨 Membuat latar ASMR realistis…");
    try {
      const response = await fetch("/api/hcnsec/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "asmr_background",
          keyword: "asmr ambient",
          niche: "ASMR ambient video",
          _rawPrompt: true,
          prompt: `A realistic cinematic ASMR ambience background, ${prompt}, natural texture, no text, no logo, no watermark, photorealistic, 16:9 composition`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || `HTTP ${response.status}`);
      setBgSrc(String(data.url));
      setBgType("ai");
      setBgName("Latar AI ASMR");
      setAiStatus("✅ Latar AI terpasang — pilih gerak kamera di bawah.");
    } catch (error: any) {
      setAiStatus(`❌ Gagal membuat latar: ${error?.message || "coba lagi"}`);
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSoundFile(file: File) {
    if (customSoundSrc.startsWith("blob:")) {
      URL.revokeObjectURL(customSoundSrc);
      objectUrlsRef.current.delete(customSoundSrc);
    }
    const src = rememberObjectUrl(URL.createObjectURL(file));
    setSoundId("custom");
    setCustomSoundSrc(src);
    setSoundName(file.name);
    const seq = ++loadSoundSeqRef.current;
    setSoundLoading(true);
    setSoundError("");
    try {
      await decodeSoundBytes(await file.arrayBuffer(), file.name, seq);
    } catch (error: any) {
      setSoundReady(false);
      setSoundError(`Audio tidak bisa dibaca: ${error?.message || "format tidak didukung"}`);
    } finally {
      if (seq === loadSoundSeqRef.current) setSoundLoading(false);
    }
  }

  function startPlayback() {
    if (playing) {
      stopPlayback();
      return;
    }
    try {
      setPreviewTime(0);
      previewEpochRef.current = performance.now();
      if (audioBufferRef.current) {
        const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        void ctx.resume().catch(() => {});
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = soundVolume / 100;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
        audioSourceRef.current = source;
        audioGainRef.current = gain;
        startAtRef.current = ctx.currentTime;
      } else {
        previewEpochRef.current = performance.now();
        setNotice("Preview visual berjalan tanpa suara — tunggu audio selesai dimuat atau upload audio HP.");
      }
      layers.forEach((layer) => { if (layer.el) void layer.el.play().catch(() => {}); });
      setPlaying(true);
    } catch (error: any) {
      setNotice(`Preview belum bisa diputar: ${error?.message || "browser menolak audio"}`);
    }
  }

  function stopPlayback() {
    try { audioSourceRef.current?.stop(); } catch {}
    audioSourceRef.current = null;
    audioGainRef.current = null;
    layers.forEach((layer) => { try { layer.el?.pause(); } catch {} });
    setPlaying(false);
  }

  function saveProject() {
    try {
      const snapshot: ProjectSnapshot = {
        bgType, bgPresetId, bgSrc: bgSrc.startsWith("blob:") ? "" : bgSrc, bgName,
        motionMode, motionStrength, motionSpeed,
        layers: layers.map(toSerializableLayer).map((layer) => ({ ...layer, src: layer.src.startsWith("blob:") ? "" : layer.src })),
        selectedLayerId, soundId, customSoundSrc: customSoundSrc.startsWith("blob:") ? "" : customSoundSrc,
        soundName, soundVolume, duration, fps, resolution,
      };
      localStorage.setItem(ASMR_PROJECT_KEY, JSON.stringify(snapshot));
      setProjectStatus("✅ Setelan ASMR tersimpan di perangkat ini");
    } catch {
      setProjectStatus("⚠️ Gagal menyimpan — file upload tetap harus dipilih lagi setelah reload");
    }
  }

  async function renderAsmrVideo() {
    if (rendering) return;
    if (!bgReady && !bgError) {
      setNotice("Tunggu latar selesai dimuat sebelum ekspor.");
      return;
    }
    if (bgError) setNotice("⚠️ Latar gagal dimuat — ekspor memakai fallback gelap sampai kamu memilih foto lain.");
    stopPlayback();
    clearRenderedOutput();
    renderCancelledRef.current = false;
    setRendering(true);
    setProgress(0);
    setNotice("");
    const width = resolution === "1080p" ? 1920 : resolution === "720p" ? 1280 : 854;
    const height = resolution === "1080p" ? 1080 : resolution === "720p" ? 720 : 480;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { setRendering(false); setNotice("Canvas tidak tersedia di browser ini."); return; }
    const draw = (renderCtx: CanvasRenderingContext2D, w: number, h: number, time: number) => drawScene(renderCtx, w, h, time, false);
    const options: RenderOptions = {
      canvas, ctx, width, height, duration, fps, draw, audio: audioBufferRef.current,
      cancelled: () => renderCancelledRef.current,
      onProgress: (value) => setProgress(Math.max(0, Math.min(1, value))),
    };
    logDiag(`Mulai render ${resolution} · ${fps}fps · ${fmtTime(duration)}`);
    try {
      let blob: Blob;
      let mode = "WebCodecs turbo";
      try {
        // Video overlay dari file HP harus dirender real-time agar frame-nya
        // benar-benar bergerak; WebCodecs turbo cocok untuk foto + efek canvas.
        if (layers.some((layer) => layer.visible && layer.type === "video")) throw new Error("video overlay perlu render real-time");
        blob = await renderWebCodecs(options);
      } catch (fastError: any) {
        mode = "MediaRecorder real-time";
        logDiag(`WebCodecs fallback: ${fastError?.message || "tidak tersedia"}`);
        blob = await renderMediaRecorder(options);
      }
      if (renderCancelledRef.current) throw new Error("Render dibatalkan");
      const url = URL.createObjectURL(blob);
      outputUrlRef.current = url;
      setRenderedBlob(blob);
      setRenderedUrl(url);
      setRenderedMime(blob.type || "video/webm");
      setRenderMode(mode);
      setProgress(1);
      setNotice(`✅ Review video siap · ${mode}${mode.includes("real-time") ? ` · kira-kira ${fmtTime(duration)}` : ""}`);
      logDiag(`Selesai ${(blob.size / 1048576).toFixed(1)} MB · ${blob.type || "video/webm"}`);
    } catch (error: any) {
      if (String(error?.message || error).includes("dibatalkan")) setNotice("⏹ Render dibatalkan.");
      else setNotice(`❌ Render gagal: ${error?.message || "browser kehabisan memori"}`);
      logDiag(`Render gagal: ${error?.message || error}`);
    } finally {
      setRendering(false);
    }
  }

  function downloadRendered() {
    if (!renderedBlob || !renderedUrl) return;
    const ext = renderedMime.includes("mp4") ? "mp4" : "webm";
    const anchor = document.createElement("a");
    anchor.href = renderedUrl;
    anchor.download = `asmr_${Date.now()}.${ext}`;
    anchor.click();
    setNotice(`📥 Download ${ext.toUpperCase()} dimulai.`);
  }

  useEffect(() => () => {
    renderCancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { audioSourceRef.current?.stop(); } catch {}
    try { audioContextRef.current?.close(); } catch {}
    for (const layer of layers) { try { layer.el?.pause(); layer.el?.remove(); } catch {} }
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
  // Intentionally run only on unmount; current layer elements are cleaned up here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layerCount = layers.filter((layer) => layer.visible).length;
  const ext = renderedMime.includes("mp4") ? "MP4" : "WebM";

  return (
    <main className="asmr-shell">
      <header className="asmr-header">
        <button className="asmr-back" type="button" onClick={() => { stopPlayback(); onExit(); }} aria-label="Kembali ke dashboard">←</button>
        <div className="asmr-brand">
          <div className="asmr-brand-icon">🎧</div>
          <div><b>ASMR Studio</b><span>Foto → video hidup · ambience · review · ekspor</span></div>
        </div>
        <div className="asmr-header-actions">
          <button className="asmr-save" type="button" onClick={saveProject}>💾 Simpan</button>
          <button className="asmr-export" type="button" onClick={() => void renderAsmrVideo()} disabled={rendering || (!bgReady && !bgError)}>
            {rendering ? `⏳ ${Math.round(progress * 100)}%` : "Ekspor Video"}
          </button>
        </div>
      </header>

      <div className="asmr-workspace">
        <section className="asmr-stage" aria-label="Review dan preview ASMR">
          <div className="asmr-stage-head">
            <div><span className="asmr-kicker">LIVE CANVAS</span><b>Preview Video ASMR</b></div>
            <div className="asmr-stage-badges"><span>16:9</span><span>{resolution}</span><span>{fmtTime(duration)}</span></div>
          </div>
          <div className="asmr-canvas-wrap">
            <canvas ref={cvRef} width={PREVIEW_W} height={PREVIEW_H} aria-label="Preview video ASMR" />
            <div className="asmr-live-pill"><i /> LIVE PREVIEW</div>
            <button className="asmr-play" type="button" onClick={startPlayback}>{playing ? "⏸ Jeda" : "▶ Putar"}</button>
            {!bgReady && <div className="asmr-canvas-loading">{bgError ? "⚠️ Latar gagal dimuat" : "⏳ Memuat latar…"}</div>}
          </div>
          <div className="asmr-stage-footer">
            <div><b>{bgName || "Latar ASMR"}</b><span>{layerCount} lapisan aktif · {soundReady ? `🔊 ${soundName}` : "🔇 audio belum siap"}</span></div>
            <div className="asmr-timecode"><span>{fmtTime(previewTime)}</span><div className="asmr-progress"><i style={{ width: `${duration > 0 ? Math.min(100, (previewTime / duration) * 100) : 0}%` }} /></div><span>{fmtTime(duration)}</span></div>
          </div>
          {!!notice && <div className={`asmr-notice ${notice.startsWith("❌") ? "danger" : notice.startsWith("✅") ? "success" : ""}`}>{notice}</div>}
          {!!projectStatus && <div className="asmr-save-status">{projectStatus}</div>}

          {renderedUrl && (
            <section className="asmr-review-card" aria-label="Review video hasil render">
              <div className="asmr-review-head"><div><span className="asmr-kicker">HASIL RENDER</span><b>Review Video ASMR</b><small>{renderMode} · {ext} · bisa diputar sebelum download</small></div><button type="button" className="asmr-text-btn" onClick={clearRenderedOutput}>Hapus review</button></div>
              <video src={renderedUrl} controls playsInline loop preload="metadata" className="asmr-review-video" />
              <div className="asmr-review-actions"><span>✅ Video sudah dirender dengan gerak kamera dan ambience pilihan.</span><button type="button" className="asmr-download" onClick={downloadRendered}>📥 Download {ext}</button></div>
            </section>
          )}
        </section>

        <aside className="asmr-controls" aria-label="Kontrol khusus ASMR">
          <div className="asmr-controls-title"><div><span className="asmr-kicker">ASMR CONTROL ROOM</span><b>Rakit suasana</b></div><span className="asmr-private">PRIVATE · ASMR ONLY</span></div>

          <section className="asmr-panel">
            <div className="asmr-panel-title"><span className="asmr-step">01</span><div><b>Foto & latar</b><small>Mulai dari preset, foto HP, atau gambar AI</small></div></div>
            <div className="asmr-tabs">
              {(["preset", "upload", "ai"] as const).map((kind) => <button key={kind} type="button" className={bgType === kind ? "active" : ""} onClick={() => setBgType(kind)}>{kind === "preset" ? "🏡 Preset" : kind === "upload" ? "📷 Foto HP" : "✨ Gambar AI"}</button>)}
            </div>
            {bgType === "preset" && <><select className="asmr-select" value={bgPresetId} onChange={(e) => setBgPresetId(e.target.value)}>{PRESET_BG.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p className="asmr-help">{PRESET_BG.find((item) => item.id === bgPresetId)?.desc}</p></>}
            {bgType === "upload" && <label className="asmr-upload"><strong>📷 Pilih foto dari HP</strong><span>JPG/PNG · foto kamar, alam, jendela, meja</span><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleBackgroundFile(file); e.currentTarget.value = ""; }} /></label>}
            {bgType === "ai" && <div className="asmr-stack"><textarea className="asmr-textarea" rows={3} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Contoh: kamar kayu dekat jendela, hujan malam, lampu hangat, sangat realistis…" /><button type="button" className="asmr-primary" onClick={() => void generateAiBackground()} disabled={aiBusy}>{aiBusy ? "⏳ Sedang membuat…" : "✨ Buat Latar Realistis"}</button>{!!aiStatus && <span className={`asmr-help ${aiStatus.startsWith("❌") ? "error" : "success"}`}>{aiStatus}</span>}</div>}
          </section>

          <section className="asmr-panel asmr-motion-panel">
            <div className="asmr-panel-title"><span className="asmr-step">02</span><div><b>Hidupkan foto</b><small>Gerak kamera halus agar gambar terasa seperti video nyata</small></div></div>
            <div className="asmr-motion-grid">{MOTION_OPTIONS.map((option) => <button key={option.id} type="button" className={motionMode === option.id ? "active" : ""} onClick={() => setMotionMode(option.id)}><strong>{option.label}</strong><small>{option.desc}</small></button>)}</div>
            <label className="asmr-range"><span><b>Intensitas gerak</b><strong>{motionStrength}%</strong></span><input type="range" min={0} max={100} value={motionStrength} onChange={(e) => setMotionStrength(Number(e.target.value))} /></label>
            <label className="asmr-range"><span><b>Kecepatan gerak</b><strong>{motionSpeed.toFixed(1)}×</strong></span><input type="range" min={0.2} max={2} step={0.1} value={motionSpeed} onChange={(e) => setMotionSpeed(Number(e.target.value))} /></label>
            <p className="asmr-tip">💡 Rekomendasi ambience: <b>Ken Burns · 25–40% · 0.8–1.0×</b>. Geraknya sengaja pelan agar nyaman ditonton lama.</p>
          </section>

          <section className="asmr-panel">
            <div className="asmr-panel-title"><span className="asmr-step">03</span><div><b>Atmosfer visual</b><small>Hujan, salju, kabut, atau bara sebagai lapisan mandiri</small></div></div>
            <div className="asmr-overlay-grid">{PRESET_OVERLAYS.map((item) => <button type="button" key={item.id} onClick={() => addEffectLayer(item.id)}><strong>{item.label}</strong><small>{item.desc}</small></button>)}</div>
            <label className="asmr-upload compact"><strong>🎞️ Upload video overlay</strong><span>MP4/WebM · efek hujan, asap, bokeh, daun</span><input type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) addVideoLayer(file); e.currentTarget.value = ""; }} /></label>
            <div className="asmr-layers-head"><span>{layers.length ? `${layers.length} LAPISAN` : "LAPISAN KOSONG"}</span><small>tap untuk edit</small></div>
            {!layers.length && <p className="asmr-empty">Belum ada overlay. Foto sudah tetap bergerak lewat kontrol di atas.</p>}
            <div className="asmr-layers">{layers.map((layer) => <div key={layer.id} className={`asmr-layer-row ${selectedLayerId === layer.id ? "selected" : ""}`} onClick={() => setSelectedLayerId(layer.id)}><span>{layer.type === "video" ? "🎞️" : layer.effect === "rain" ? "🌧️" : layer.effect === "fog" ? "🌫️" : layer.effect === "fire" ? "🔥" : "❄️"}</span><b>{layer.name}</b><button type="button" onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} aria-label="Tampilkan atau sembunyikan layer">{layer.visible ? "◉" : "○"}</button><button type="button" onClick={(e) => { e.stopPropagation(); duplicateLayer(layer); }} aria-label="Duplikasi layer">＋</button><button type="button" className="delete" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} aria-label="Hapus layer">×</button></div>)}</div>
          </section>

          {activeLayer && <section className="asmr-panel asmr-edit-panel">
            <div className="asmr-panel-title"><span className="asmr-step">EDIT</span><div><b>{activeLayer.name}</b><small>Kontrol lapisan yang sedang dipilih</small></div></div>
            <label className="asmr-range"><span><b>Opacity</b><strong>{activeLayer.opacity}%</strong></span><input type="range" min={0} max={100} value={activeLayer.opacity} onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} /></label>
            <label className="asmr-range"><span><b>Ukuran</b><strong>{activeLayer.width}%</strong></span><input type="range" min={20} max={180} value={activeLayer.width} onChange={(e) => { const value = Number(e.target.value); updateLayer(activeLayer.id, { width: value, height: activeLayer.lockRatio ? value : activeLayer.height }); }} /></label>
            <div className="asmr-two-range"><label className="asmr-range"><span><b>X</b><strong>{activeLayer.posX}</strong></span><input type="range" min={-500} max={500} value={activeLayer.posX} onChange={(e) => updateLayer(activeLayer.id, { posX: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Y</b><strong>{activeLayer.posY}</strong></span><input type="range" min={-400} max={400} value={activeLayer.posY} onChange={(e) => updateLayer(activeLayer.id, { posY: Number(e.target.value) })} /></label></div>
            <div className="asmr-inline-options"><label><input type="checkbox" checked={activeLayer.lockRatio} onChange={(e) => updateLayer(activeLayer.id, { lockRatio: e.target.checked })} /> Kunci rasio</label><select className="asmr-select" value={activeLayer.blendMode} onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as BlendMode })}><option value="screen">Screen</option><option value="lighter">Lighter</option><option value="normal">Normal</option><option value="multiply">Multiply</option></select></div>
            <label className="asmr-mask-toggle"><input type="checkbox" checked={activeLayer.maskOn} onChange={(e) => updateLayer(activeLayer.id, { maskOn: e.target.checked })} /><span><b>🔳 Masker kaca jendela</b><small>Efek hanya muncul di area kaca</small></span></label>
            {activeLayer.maskOn && <div className="asmr-mask-controls"><label className="asmr-range"><span><b>Mask X</b><strong>{Math.round(activeLayer.maskX * 100)}%</strong></span><input type="range" min={0} max={1} step={.01} value={activeLayer.maskX} onChange={(e) => updateLayer(activeLayer.id, { maskX: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Mask Y</b><strong>{Math.round(activeLayer.maskY * 100)}%</strong></span><input type="range" min={0} max={1} step={.01} value={activeLayer.maskY} onChange={(e) => updateLayer(activeLayer.id, { maskY: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Lebar kaca</b><strong>{activeLayer.maskW}px</strong></span><input type="range" min={20} max={1280} value={activeLayer.maskW} onChange={(e) => updateLayer(activeLayer.id, { maskW: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Tinggi kaca</b><strong>{activeLayer.maskH}px</strong></span><input type="range" min={20} max={720} value={activeLayer.maskH} onChange={(e) => updateLayer(activeLayer.id, { maskH: Number(e.target.value) })} /></label></div>}
            <button type="button" className="asmr-ghost" onClick={() => updateLayer(activeLayer.id, { width: 100, height: 100, posX: 0, posY: 0, opacity: 80, rotate: 0, maskOn: false, maskX: .25, maskY: .25, maskW: 360, maskH: 260, blendMode: "screen" })}>↺ Reset lapisan</button>
          </section>}

          <section className="asmr-panel">
            <div className="asmr-panel-title"><span className="asmr-step">04</span><div><b>Suara ambience</b><small>Loop otomatis sepanjang durasi video</small></div></div>
            <select className="asmr-select" value={soundId} onChange={(e) => setSoundId(e.target.value)}><option value="custom">📁 {soundName || "Audio HP"}</option>{PRESET_SOUNDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <p className="asmr-help">{soundId === "custom" ? "Audio milikmu sendiri." : PRESET_SOUNDS.find((item) => item.id === soundId)?.desc}</p>
            <label className="asmr-upload compact"><strong>🎙️ Upload audio dari HP</strong><span>WAV/MP3/OGG/M4A · loop otomatis</span><input type="file" accept="audio/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleSoundFile(file); e.currentTarget.value = ""; }} /></label>
            <label className="asmr-range"><span><b>Volume ambience</b><strong>{soundVolume}%</strong></span><input type="range" min={0} max={100} value={soundVolume} onChange={(e) => setSoundVolume(Number(e.target.value))} /></label>
            <div className={`asmr-audio-status ${soundReady ? "ready" : ""}`}>{soundLoading ? "⏳ Memuat audio…" : soundReady ? `✅ ${soundName} siap diputar & diloop` : soundError || "🔇 Belum ada audio — ekspor tetap bisa tanpa suara"}</div>
          </section>

          <section className="asmr-panel">
            <div className="asmr-panel-title"><span className="asmr-step">05</span><div><b>Ekspor & review</b><small>Setelan ini hanya milik ASMR Studio</small></div></div>
            <div className="asmr-output-grid"><label><span>Durasi</span><select className="asmr-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 detik</option><option value={60}>1 menit</option><option value={300}>5 menit</option><option value={600}>10 menit</option><option value={1800}>30 menit</option><option value={3600}>1 jam</option><option value={7200}>2 jam</option></select></label><label><span>Resolusi</span><select className="asmr-select" value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}><option value="1080p">1080p</option><option value="720p">720p HD</option><option value="480p">480p hemat HP</option></select></label><label><span>Frame rate</span><select className="asmr-select" value={fps} onChange={(e) => setFps(Number(e.target.value))}><option value={30}>30 FPS halus</option><option value={24}>24 FPS cinematic</option><option value={15}>15 FPS long-form</option></select></label></div>
            <div className="asmr-render-note">{duration >= 1800 ? "⏱️ Video panjang perlu ruang penyimpanan dan waktu render besar. Untuk HP, pakai 480p + 15 FPS." : "⚡ WebCodecs akan dipakai bila browser mendukung; jika tidak, aplikasi memakai render real-time yang durasinya sesuai video."}</div>
            <button type="button" className="asmr-primary big" onClick={() => void renderAsmrVideo()} disabled={rendering || (!bgReady && !bgError)}>{rendering ? `⏳ Merender ${Math.round(progress * 100)}%` : renderedUrl ? "🔁 Render ulang & review" : "🎬 Render Video ASMR"}</button>
            {rendering && <button type="button" className="asmr-ghost danger" onClick={() => { renderCancelledRef.current = true; }}>⏹ Batalkan render</button>}
          </section>

          <details className="asmr-diagnostics"><summary>🧪 Diagnostics ({diagList.length})</summary>{diagList.length ? diagList.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <p>Belum ada log render.</p>}</details>
        </aside>
      </div>
    </main>
  );
}
