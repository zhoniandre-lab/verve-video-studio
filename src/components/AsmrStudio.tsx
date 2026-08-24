"use client";
/* =====================================================================
   🎧 VERVE ASMR STUDIO — editor khusus ASMR.
   Foto → video hidup dengan gerak kamera lembut, atmosfer hujan/kabut/bara,
   loop suara alam, preview/review video, dan ekspor mandiri.

   Modul ini sengaja tidak memakai state proyek/editor lain. Storage yang dipakai
   hanya verve_asmr_studio_v1 dan semua kontrol berada di dalam halaman ASMR.
   ===================================================================== */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  start: number;
  duration: number;
  visible: boolean;
  width: number;
  height: number;
  lockRatio: boolean;
  posX: number;
  posY: number;
  rotate: number;
  anchorX: number;
  anchorY: number;
  flipH: boolean;
  flipV: boolean;
  speed: number;
  trimIn: number;
  trimOut: number;
  animation: "none" | "float" | "pulse" | "sway";
  animationAmount: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  keyMode: "none" | "black" | "green";
  keyThreshold: number;
  keySoftness: number;
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
type StockClip = { id: number; src: string; sd?: string; thumb?: string; dur?: number; by?: string; link?: string; w?: number; h?: number; provider?: string };

type ProjectSnapshot = {
  bgType: "preset" | "upload" | "ai";
  bgPresetId: string;
  bgSrc: string;
  bgName: string;
  bgBrightness: number;
  bgContrast: number;
  bgSaturation: number;
  bgBlur: number;
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

const QUICK_ASMR_RECIPES: { id: string; label: string; desc: string; query: string; sound: string; role: "rain" | "fire"; icon: string }[] = [
  { id: "rain-window", label: "Hujan di jendela", desc: "Ruangan hangat + tetes hujan realistis", query: "rain window", sound: "rain", role: "rain", icon: "🌧️" },
  { id: "fireplace", label: "Perapian hangat", desc: "Api kecil hidup di sudut perapian", query: "fireplace flame", sound: "campfire", role: "fire", icon: "🔥" },
  { id: "forest-rain", label: "Hutan setelah hujan", desc: "Kabut tipis + ambience hutan", query: "forest rain fog", sound: "forest", role: "rain", icon: "🌲" },
  { id: "cafe-rain", label: "Kafe saat hujan", desc: "Bokeh kota + suara kafe lembut", query: "rain cafe window", sound: "cafe", role: "rain", icon: "☕" },
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
  if (/^https?:\/\//.test(src)) el.crossOrigin = "anonymous";
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
  // Satu path untuk semua garis jauh lebih ringan di HP daripada begin/stroke
  // per tetes. Overlay stok realistis tetap tersedia di panel koleksi.
  const density = Math.max(24, Math.round(width / 34));
  ctx.beginPath();
  for (let i = 0; i < density; i++) {
    const x = positiveMod(i * 97 + time * width * 0.16, width + 30) - 15;
    const y = positiveMod(i * 137 + time * height * 0.62, height + 50) - 25;
    const len = Math.max(8, height * (0.012 + (i % 4) * 0.003));
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.16, y + len);
  }
  ctx.stroke();
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
    start: Number.isFinite(Number(raw.start)) ? Math.max(0, Number(raw.start)) : 0,
    duration: Number.isFinite(Number(raw.duration)) ? Math.max(.1, Number(raw.duration)) : 60,
    visible: raw.visible !== false,
    width: Math.max(20, Math.min(180, Number(raw.width) || 100)),
    height: Math.max(20, Math.min(180, Number(raw.height) || 100)),
    lockRatio: raw.lockRatio !== false,
    posX: Math.max(-500, Math.min(500, Number(raw.posX) || 0)),
    posY: Math.max(-400, Math.min(400, Number(raw.posY) || 0)),
    rotate: Number(raw.rotate) || 0,
    anchorX: Number.isFinite(Number(raw.anchorX)) ? Math.max(0, Math.min(1, Number(raw.anchorX))) : .5,
    anchorY: Number.isFinite(Number(raw.anchorY)) ? Math.max(0, Math.min(1, Number(raw.anchorY))) : .5,
    flipH: !!raw.flipH,
    flipV: !!raw.flipV,
    speed: Number.isFinite(Number(raw.speed)) ? Math.max(.25, Math.min(3, Number(raw.speed))) : 1,
    trimIn: Number.isFinite(Number(raw.trimIn)) ? Math.max(0, Number(raw.trimIn)) : 0,
    trimOut: Number.isFinite(Number(raw.trimOut)) ? Math.max(0, Number(raw.trimOut)) : 0,
    animation: raw.animation === "float" || raw.animation === "pulse" || raw.animation === "sway" ? raw.animation : "none",
    animationAmount: Number.isFinite(Number(raw.animationAmount)) ? Math.max(0, Math.min(100, Number(raw.animationAmount))) : 30,
    brightness: Number.isFinite(Number(raw.brightness)) ? Math.max(50, Math.min(150, Number(raw.brightness))) : 100,
    contrast: Number.isFinite(Number(raw.contrast)) ? Math.max(50, Math.min(150, Number(raw.contrast))) : 100,
    saturation: Number.isFinite(Number(raw.saturation)) ? Math.max(0, Math.min(200, Number(raw.saturation))) : 100,
    blur: Number.isFinite(Number(raw.blur)) ? Math.max(0, Math.min(20, Number(raw.blur))) : 0,
    keyMode: raw.keyMode === "black" || raw.keyMode === "green" ? raw.keyMode : "none",
    keyThreshold: Number.isFinite(Number(raw.keyThreshold)) ? Math.max(0, Math.min(160, Number(raw.keyThreshold))) : 28,
    keySoftness: Number.isFinite(Number(raw.keySoftness)) ? Math.max(1, Math.min(100, Number(raw.keySoftness))) : 24,
    blendMode: raw.blendMode === "multiply" || raw.blendMode === "normal" || raw.blendMode === "lighter" ? raw.blendMode : "screen",
    opacity: Number.isFinite(Number(raw.opacity)) ? Math.max(0, Math.min(100, Number(raw.opacity))) : 80,
    maskOn: !!raw.maskOn,
    maskX: Number.isFinite(Number(raw.maskX)) ? Number(raw.maskX) : .25,
    maskY: Number.isFinite(Number(raw.maskY)) ? Number(raw.maskY) : .25,
    maskW: Number.isFinite(Number(raw.maskW)) ? Number(raw.maskW) : 360,
    maskH: Number.isFinite(Number(raw.maskH)) ? Number(raw.maskH) : 260,
    el,
  };
}

type CanvasDrag = {
  mode: "layer" | "mask" | "mask-resize";
  layerId: string;
  startX: number;
  startY: number;
  startPosX?: number;
  startPosY?: number;
  startMaskX?: number;
  startMaskY?: number;
  startMaskW?: number;
  startMaskH?: number;
};

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
  const [bgBrightness, setBgBrightness] = useState(100);
  const [bgContrast, setBgContrast] = useState(100);
  const [bgSaturation, setBgSaturation] = useState(100);
  const [bgBlur, setBgBlur] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");

  const [motionMode, setMotionMode] = useState<AsmrMotionMode>("kenburns");
  const [motionStrength, setMotionStrength] = useState(35);
  const [motionSpeed, setMotionSpeed] = useState(1);
  const [asmrMode, setAsmrMode] = useState<"easy" | "pro">("pro");
  const [quickBusy, setQuickBusy] = useState("");
  const [toolTab, setToolTab] = useState<"video" | "audio" | "speed" | "animation" | "color">("video");
  const [inspectorTab, setInspectorTab] = useState<"basic" | "mask" | "matting">("basic");

  const [layers, setLayers] = useState<LayerAsmr[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [layerDurations, setLayerDurations] = useState<Record<string, number>>({});
  const [stockQuery, setStockQuery] = useState("rain window");
  const [stockResults, setStockResults] = useState<StockClip[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockError, setStockError] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockRole, setStockRole] = useState<"rain" | "fire" | "general">("rain");

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
  const [timelineZoom, setTimelineZoom] = useState(55);
  const [timelineDrag, setTimelineDrag] = useState<{ layerId: string; mode: "move" | "left" | "right"; startClientX: number; startStart: number; startDuration: number } | null>(null);
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
  const keyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewEpochRef = useRef(0);
  const startAtRef = useRef(0);
  const lastPreviewUiRef = useRef(0);
  const lastPreviewFrameRef = useRef(0);
  const loadSoundSeqRef = useRef(0);
  const bgLoadSeqRef = useRef(0);
  const renderCancelledRef = useRef(false);
  const outputUrlRef = useRef("");
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const canvasDragRef = useRef<CanvasDrag | null>(null);
  const stockInitialRef = useRef(false);

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

  function bindVideoMetadata(layerId: string, element?: HTMLVideoElement) {
    if (!element) return;
    const mark = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        setLayerDurations((old) => ({ ...old, [layerId]: element.duration }));
      }
    };
    element.addEventListener("loadedmetadata", mark);
    if (element.readyState >= 1) mark();
  }

  function trimEndFor(layer: LayerAsmr): number {
    const full = layerDurations[layer.id] || layer.el?.duration || 0;
    return full > 0 ? Math.min(full, layer.trimOut > 0 ? layer.trimOut : full) : Math.max(.1, layer.trimOut || 1);
  }

  function trimRangeStyle(layer: LayerAsmr): { left: string; right: string } {
    const full = layerDurations[layer.id] || layer.el?.duration || 0;
    if (full <= 0) return { left: "0%", right: "0%" };
    const start = Math.max(0, Math.min(100, (layer.trimIn / full) * 100));
    const end = Math.max(start, Math.min(100, (trimEndFor(layer) / full) * 100));
    return { left: `${start}%`, right: `${100 - end}%` };
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
        if (Number.isFinite(saved.bgBrightness)) setBgBrightness(Math.max(50, Math.min(150, Number(saved.bgBrightness))));
        if (Number.isFinite(saved.bgContrast)) setBgContrast(Math.max(50, Math.min(150, Number(saved.bgContrast))));
        if (Number.isFinite(saved.bgSaturation)) setBgSaturation(Math.max(0, Math.min(200, Number(saved.bgSaturation))));
        if (Number.isFinite(saved.bgBlur)) setBgBlur(Math.max(0, Math.min(20, Number(saved.bgBlur))));
        if (saved.motionMode === "kenburns" || saved.motionMode === "drift" || saved.motionMode === "breathe" || saved.motionMode === "still") setMotionMode(saved.motionMode);
        if (Number.isFinite(saved.motionStrength)) setMotionStrength(Math.max(0, Math.min(100, Number(saved.motionStrength))));
        if (Number.isFinite(saved.motionSpeed)) setMotionSpeed(Math.max(.2, Math.min(2, Number(saved.motionSpeed))));
        if (Array.isArray(saved.layers)) {
          const restored = saved.layers.filter((layer) => layer && !(layer.type === "video" && String(layer.src || "").startsWith("blob:"))).map(inflateLayer);
          restored.forEach((layer) => bindVideoMetadata(layer.id, layer.el));
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

  // Begitu masuk, siapkan koleksi overlay hujan. Jika kunci stok belum ada,
  // panel tetap bisa dipakai dengan preset canvas dan tombol cari akan memberi
  // pesan yang jelas — tidak mengganggu fitur ASMR lainnya.
  useEffect(() => {
    if (stockInitialRef.current) return;
    stockInitialRef.current = true;
    void searchStock("rain window");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * Hapus background gelap/green screen dari video overlay. Untuk rain/fire,
   * luma key hitam bekerja seperti Screen tetapi tetap memberi alpha nyata;
   * pemrosesan dibatasi 640px agar tidak membuat preview HP tersendat.
   */
  function drawVideoWithMatting(ctx: CanvasRenderingContext2D, layer: LayerAsmr, x: number, y: number, width: number, height: number) {
    if (!layer.el || layer.el.readyState < 2) return false;
    if (layer.keyMode === "none") {
      ctx.drawImage(layer.el, x, y, width, height);
      return true;
    }
    try {
      const keyCanvas = keyCanvasRef.current || document.createElement("canvas");
      keyCanvasRef.current = keyCanvas;
      const sampleWidth = Math.max(1, Math.min(640, Math.round(Math.abs(width))));
      const sampleHeight = Math.max(1, Math.round(sampleWidth * Math.abs(height) / Math.max(1, Math.abs(width))));
      if (keyCanvas.width !== sampleWidth || keyCanvas.height !== sampleHeight) {
        keyCanvas.width = sampleWidth;
        keyCanvas.height = sampleHeight;
      }
      const keyCtx = keyCanvas.getContext("2d", { willReadFrequently: true });
      if (!keyCtx) return false;
      keyCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      keyCtx.drawImage(layer.el, 0, 0, sampleWidth, sampleHeight);
      const pixels = keyCtx.getImageData(0, 0, sampleWidth, sampleHeight);
      const threshold = Math.max(0, Math.min(160, layer.keyThreshold || 28));
      const softness = Math.max(1, Math.min(100, layer.keySoftness || 24));
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];
        let alpha = 255;
        if (layer.keyMode === "black") {
          const luma = .2126 * r + .7152 * g + .0722 * b;
          alpha = luma <= threshold ? 0 : luma >= threshold + softness ? 255 : Math.round(((luma - threshold) / softness) * 255);
        } else {
          const greenExcess = g - Math.max(r, b);
          alpha = greenExcess >= threshold + softness ? 0 : greenExcess <= threshold ? 255 : Math.round((1 - (greenExcess - threshold) / softness) * 255);
        }
        pixels.data[i + 3] = Math.round((pixels.data[i + 3] * alpha) / 255);
      }
      keyCtx.putImageData(pixels, 0, 0);
      ctx.drawImage(keyCanvas, x, y, width, height);
      return true;
    } catch {
      // Jika browser menolak pixel read, tetap tampilkan overlay normal.
      ctx.drawImage(layer.el, x, y, width, height);
      return true;
    }
  }

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number, guides = true) => {
    ctx.clearRect(0, 0, width, height);
    const image = bgImageRef.current;
    if (image && image.complete && image.naturalWidth > 0) {
      const motion = asmrMotionAt(time, motionMode, motionStrength, motionSpeed);
      const rect = asmrCoverRect(image.naturalWidth, image.naturalHeight, width, height, motion.scale, motion.panX, motion.panY);
      ctx.save();
      ctx.filter = `brightness(${bgBrightness}%) contrast(${bgContrast}%) saturate(${bgSaturation}%) blur(${bgBlur}px)`;
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
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
      if (time < layer.start || time >= layer.start + layer.duration) continue;
      const layerTime = Math.max(0, time - layer.start);
      const animAmount = Math.max(0, Math.min(100, layer.animationAmount || 0)) / 100;
      const animPhase = layerTime * Math.max(.25, layer.speed || 1);
      let animatedX = layer.posX;
      let animatedY = layer.posY;
      let animatedScale = 1;
      let animatedRotate = layer.rotate;
      if (layer.animation === "float") animatedY += Math.sin(animPhase * 1.4) * animAmount * 28;
      if (layer.animation === "pulse") animatedScale += Math.sin(animPhase * 1.2) * animAmount * .035;
      if (layer.animation === "sway") animatedRotate += Math.sin(animPhase * 1.1) * animAmount * 3;

      ctx.save();
      if (layer.maskOn) {
        const mask = asmrMaskRect(layer.maskX, layer.maskY, layer.maskW, layer.maskH, width, height);
        ctx.beginPath();
        ctx.rect(mask.x, mask.y, mask.width, mask.height);
        ctx.clip();
      }
      ctx.translate(width / 2 + animatedX * sx, height / 2 + animatedY * sy);
      ctx.rotate((animatedRotate * Math.PI) / 180);
      ctx.scale((layer.flipH ? -1 : 1) * animatedScale, (layer.flipV ? -1 : 1) * animatedScale);
      ctx.globalAlpha = Math.max(0, Math.min(100, layer.opacity)) / 100;
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%) blur(${layer.blur}px)`;
      const layerWidth = width * (layer.width / 100);
      const layerHeight = height * (layer.height / 100);
      const anchorX = Math.max(0, Math.min(1, layer.anchorX ?? .5));
      const anchorY = Math.max(0, Math.min(1, layer.anchorY ?? .5));
      if (layer.type === "video" && layer.el && layer.el.readyState >= 2) {
        layer.el.playbackRate = Math.max(.25, Math.min(3, layer.speed || 1));
        const fullDuration = layerDurations[layer.id] || layer.el.duration || 0;
        if (fullDuration > 0) {
          const trimIn = Math.max(0, Math.min(fullDuration - .05, layer.trimIn || 0));
          const trimOut = Math.max(trimIn + .05, Math.min(fullDuration, layer.trimOut > 0 ? layer.trimOut : fullDuration));
          const span = Math.max(.05, trimOut - trimIn);
          const elapsed = layerTime * Math.max(.25, layer.speed || 1);
          const targetTime = layer.el.loop !== false ? trimIn + (elapsed % span) : Math.min(trimOut - .05, trimIn + elapsed);
          if (Math.abs(layer.el.currentTime - targetTime) > .12) {
            try { layer.el.currentTime = targetTime; } catch {}
          }
          if (playing && layer.el.loop !== false && layer.el.paused) void layer.el.play().catch(() => {});
        }
        drawVideoWithMatting(ctx, layer, -layerWidth * anchorX, -layerHeight * anchorY, layerWidth, layerHeight);
      } else if (layer.type === "effect") {
        ctx.translate(-layerWidth * anchorX, -layerHeight * anchorY);
        drawEffect(ctx, layer.effect || "rain", layerWidth, layerHeight, layerTime * Math.max(.25, layer.speed || 1));
      } else {
        ctx.fillStyle = "rgba(148,163,184,.25)";
        ctx.fillRect(-layerWidth * anchorX, -layerHeight * anchorY, layerWidth, layerHeight);
      }
      ctx.restore();

      if (guides && selectedLayerId === layer.id) {
        ctx.save();
        ctx.strokeStyle = "rgba(167,139,250,.85)";
        ctx.lineWidth = Math.max(1, width / 700);
        const layerWidth = width * (layer.width / 100);
        const layerHeight = height * (layer.height / 100);
        const anchorX = Math.max(0, Math.min(1, layer.anchorX ?? .5));
        const anchorY = Math.max(0, Math.min(1, layer.anchorY ?? .5));
        ctx.strokeRect(width / 2 + layer.posX * sx - layerWidth * anchorX, height / 2 + layer.posY * sy - layerHeight * anchorY, layerWidth, layerHeight);
        if (layer.maskOn) {
          const mask = asmrMaskRect(layer.maskX, layer.maskY, layer.maskW, layer.maskH, width, height);
          ctx.setLineDash([8, 5]);
          ctx.strokeStyle = "#22d3ee";
          ctx.strokeRect(mask.x, mask.y, mask.width, mask.height);
          ctx.setLineDash([]);
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath();
          ctx.arc(mask.x + mask.width, mask.y + mask.height, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }, [layers, selectedLayerId, motionMode, motionStrength, motionSpeed, bgBrightness, bgContrast, bgSaturation, bgBlur, layerDurations, playing]);

  const drawPreviewFrame = useCallback(() => {
    const canvas = cvRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = performance.now();
    // Preview cukup 30fps; 60fps di HP membuat efek canvas terasa berat tanpa
    // memberi manfaat visual untuk ambience ASMR yang geraknya pelan.
    if (now - lastPreviewFrameRef.current < 1000 / 30) {
      rafRef.current = requestAnimationFrame(drawPreviewFrame);
      return;
    }
    lastPreviewFrameRef.current = now;
    const time = playing && audioContextRef.current && audioSourceRef.current
      ? Math.max(0, audioContextRef.current.currentTime - startAtRef.current)
      : Math.max(0, previewTime);
    const displayTime = duration > 0 ? time % duration : time;
    if (playing && now - lastPreviewUiRef.current > 250) {
      lastPreviewUiRef.current = now;
      setPreviewTime(displayTime);
    }
    drawScene(ctx, canvas.width, canvas.height, displayTime, true);
    rafRef.current = requestAnimationFrame(drawPreviewFrame);
  }, [drawScene, playing, duration, previewTime]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawPreviewFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [drawPreviewFrame]);

  function updateLayer(id: string, patch: Partial<LayerAsmr>) {
    setLayers((old) => old.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  }

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (event.currentTarget.height / Math.max(1, rect.height)),
    };
  }

  function beginCanvasDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (rendering) return;
    const point = canvasPoint(event);
    const width = event.currentTarget.width;
    const height = event.currentTarget.height;
    const sx = width / PREVIEW_W;
    const sy = height / PREVIEW_H;
    const selected = layers.find((layer) => layer.id === selectedLayerId);

    if (selected && inspectorTab === "mask" && selected.maskOn) {
      const mask = asmrMaskRect(selected.maskX, selected.maskY, selected.maskW, selected.maskH, width, height);
      const handleDistance = Math.hypot(point.x - (mask.x + mask.width), point.y - (mask.y + mask.height));
      if (handleDistance <= 24) {
        canvasDragRef.current = { mode: "mask-resize", layerId: selected.id, startX: point.x, startY: point.y, startMaskW: selected.maskW, startMaskH: selected.maskH };
      } else if (point.x >= mask.x && point.x <= mask.x + mask.width && point.y >= mask.y && point.y <= mask.y + mask.height) {
        canvasDragRef.current = { mode: "mask", layerId: selected.id, startX: point.x, startY: point.y, startMaskX: selected.maskX, startMaskY: selected.maskY };
      }
    }

    if (!canvasDragRef.current) {
      const hit = [...layers].reverse().find((layer) => {
        if (!layer.visible) return false;
        const w = width * (layer.width / 100);
        const h = height * (layer.height / 100);
        const ax = Math.max(0, Math.min(1, layer.anchorX ?? .5));
        const ay = Math.max(0, Math.min(1, layer.anchorY ?? .5));
        const cx = width / 2 + layer.posX * sx;
        const cy = height / 2 + layer.posY * sy;
        return point.x >= cx - w * ax && point.x <= cx + w * (1 - ax) && point.y >= cy - h * ay && point.y <= cy + h * (1 - ay);
      });
      if (hit) {
        setSelectedLayerId(hit.id);
        canvasDragRef.current = { mode: "layer", layerId: hit.id, startX: point.x, startY: point.y, startPosX: hit.posX, startPosY: hit.posY };
      }
    }

    if (canvasDragRef.current) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    }
  }

  function moveCanvasDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = canvasDragRef.current;
    if (!drag) return;
    const point = canvasPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const canvas = event.currentTarget;
    const pxScale = PREVIEW_W / Math.max(1, canvas.width);
    const pyScale = PREVIEW_H / Math.max(1, canvas.height);
    if (drag.mode === "layer") {
      updateLayer(drag.layerId, {
        posX: Math.max(-500, Math.min(500, (drag.startPosX || 0) + dx * pxScale)),
        posY: Math.max(-400, Math.min(400, (drag.startPosY || 0) + dy * pyScale)),
      });
    } else if (drag.mode === "mask") {
      const layer = layers.find((item) => item.id === drag.layerId);
      if (!layer) return;
      const maxX = Math.max(0, 1 - layer.maskW / PREVIEW_W);
      const maxY = Math.max(0, 1 - layer.maskH / PREVIEW_H);
      updateLayer(drag.layerId, {
        maskX: Math.max(0, Math.min(maxX, (drag.startMaskX || 0) + dx / Math.max(1, canvas.width))),
        maskY: Math.max(0, Math.min(maxY, (drag.startMaskY || 0) + dy / Math.max(1, canvas.height))),
      });
    } else {
      updateLayer(drag.layerId, {
        maskW: Math.max(20, Math.min(PREVIEW_W, (drag.startMaskW || 360) + dx * pxScale)),
        maskH: Math.max(20, Math.min(PREVIEW_H, (drag.startMaskH || 260) + dy * pyScale)),
      });
    }
    event.preventDefault();
  }

  function endCanvasDrag(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event) { try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} }
    canvasDragRef.current = null;
  }

  function timelineTime(event: ReactPointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
    return Math.max(0, Math.min(duration, x / timelineZoom));
  }

  function seekTimeline(event: ReactPointerEvent<HTMLDivElement>) {
    if (timelineDrag) return;
    setPreviewTime(timelineTime(event));
    if (playing) stopPlayback();
  }

  function beginTimelineDrag(event: ReactPointerEvent<HTMLElement>, layer: LayerAsmr, mode: "move" | "left" | "right") {
    event.stopPropagation();
    const box = event.currentTarget.parentElement?.parentElement;
    if (box && "setPointerCapture" in box) {
      try { (box as HTMLElement).setPointerCapture(event.pointerId); } catch {}
    }
    setSelectedLayerId(layer.id);
    setTimelineDrag({ layerId: layer.id, mode, startClientX: event.clientX, startStart: layer.start, startDuration: layer.duration });
  }

  function moveTimelineDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!timelineDrag) return;
    const delta = (event.clientX - timelineDrag.startClientX) / timelineZoom;
    const layer = layers.find((item) => item.id === timelineDrag.layerId);
    if (!layer) return;
    if (timelineDrag.mode === "move") {
      updateLayer(layer.id, { start: Math.max(0, Math.min(Math.max(0, duration - .1), timelineDrag.startStart + delta)) });
    } else if (timelineDrag.mode === "left") {
      const end = timelineDrag.startStart + timelineDrag.startDuration;
      const nextStart = Math.max(0, Math.min(end - .1, timelineDrag.startStart + delta));
      updateLayer(layer.id, { start: nextStart, duration: end - nextStart });
    } else {
      updateLayer(layer.id, { duration: Math.max(.1, Math.min(duration - timelineDrag.startStart, timelineDrag.startDuration + delta)) });
    }
    event.preventDefault();
  }

  function endTimelineDrag() {
    setTimelineDrag(null);
  }

  function splitSelectedAtPlayhead() {
    const layer = layers.find((item) => item.id === selectedLayerId);
    if (!layer || previewTime <= layer.start || previewTime >= layer.start + layer.duration) {
      setNotice("Geser playhead ke dalam klip layer dulu, lalu tekan Bagi.");
      return;
    }
    const leftDuration = previewTime - layer.start;
    const rightDuration = layer.duration - leftDuration;
    const rightTrimShift = leftDuration * Math.max(.25, layer.speed || 1);
    const right: LayerAsmr = {
      ...layer,
      id: uid("split"),
      name: `${layer.name} · bagian 2`,
      start: previewTime,
      duration: rightDuration,
      trimIn: layer.trimIn + rightTrimShift,
      trimOut: layer.trimOut,
      el: layer.type === "video" && layer.src ? makeVideoElement(layer.src) : undefined,
    };
    updateLayer(layer.id, { duration: leftDuration, trimOut: layer.type === "video" ? layer.trimIn + rightTrimShift : layer.trimOut });
    if (right.el) bindVideoMetadata(right.id, right.el);
    setLayers((old) => [...old, right]);
    setSelectedLayerId(right.id);
    setNotice("✂️ Klip dibagi menjadi dua bagian di posisi playhead.");
  }

  function addEffectLayer(effect: EffectType, placement: "full" | "window" = "full") {
    const meta = PRESET_OVERLAYS.find((item) => item.id === effect) || PRESET_OVERLAYS[0];
    const windowMask = placement === "window";
    const layer: LayerAsmr = {
      id: uid("layer"), name: windowMask ? "🌧️ Hujan di Kaca Jendela" : meta.label, type: "effect", effect, src: "", start: 0, duration,
      visible: true,
      width: 100, height: 100, lockRatio: true, posX: 0, posY: 0, rotate: 0, anchorX: .5, anchorY: .5, flipH: false, flipV: false,
      speed: 1, trimIn: 0, trimOut: 0, animation: "none", animationAmount: 30, brightness: 100, contrast: 100, saturation: 100, blur: 0,
      keyMode: "none", keyThreshold: 28, keySoftness: 24,
      blendMode: effect === "fire" ? "lighter" : "screen", opacity: effect === "fog" ? 42 : 72,
      maskOn: windowMask, maskX: .27, maskY: .12, maskW: 620, maskH: 350,
    };
    setLayers((old) => [...old, layer]);
    setSelectedLayerId(layer.id);
    setInspectorTab(windowMask ? "mask" : "basic");
    setNotice(`${layer.name} ditambahkan. Drag di preview untuk menyesuaikan posisi.`);
  }

  function addVideoLayer(file: File) {
    const src = rememberObjectUrl(URL.createObjectURL(file));
    const layer: LayerAsmr = {
      id: uid("layer"), name: file.name, type: "video", src, start: 0, duration,
      visible: true,
      width: 100, height: 100, lockRatio: true, posX: 0, posY: 0, rotate: 0, anchorX: .5, anchorY: .5, flipH: false, flipV: false,
      speed: 1, trimIn: 0, trimOut: 0, animation: "none", animationAmount: 30, brightness: 100, contrast: 100, saturation: 100, blur: 0,
      keyMode: "none", keyThreshold: 28, keySoftness: 24,
      blendMode: "screen", opacity: 78, maskOn: false, maskX: .25, maskY: .25, maskW: 360, maskH: 260,
      el: makeVideoElement(src),
    };
    bindVideoMetadata(layer.id, layer.el);
    setLayers((old) => [...old, layer]);
    setSelectedLayerId(layer.id);
    setNotice("Video overlay ditambahkan. Atur potongan, opacity, masker, dan posisi di panel kanan.");
  }

  function stockMediaSrc(url: string): string {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    // Pexels menyediakan CORS dan bisa diputar/seek langsung. Pixabay/Coverr
    // sudah direwrite route menjadi /api/hcnsec/proxy-audio.
    if (/videos\.pexels\.com/i.test(url)) return url;
    return `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`;
  }

  async function searchStock(query = stockQuery, append = false): Promise<StockClip[]> {
    const q = query.trim();
    if (q.length < 2) { setStockError("Tulis minimal 2 huruf, misalnya rain window atau fireplace."); return []; }
    const requestedPage = append && q === stockQuery ? stockPage + 1 : 1;
    setStockQuery(q);
    setStockRole(/fire|flame|fireplace|api|bara/i.test(q) ? "fire" : /rain|hujan|water|drizzle/i.test(q) ? "rain" : "general");
    setStockBusy(true);
    setStockError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/hcnsec/stock-video?q=${encodeURIComponent(q)}&page=${requestedPage}&per=12`, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        if (data?.code === "TANPA_KUNCI") throw new Error("Koleksi Pexels/Pixabay/Coverr belum aktif di server. Preset dan upload video HP tetap bisa dipakai.");
        throw new Error(data?.error || `Gudang video HTTP ${response.status}`);
      }
      const result = Array.isArray(data.hasil) ? data.hasil as StockClip[] : [];
      setStockTotal(Number(data.total) || result.length);
      setStockPage(requestedPage);
      if (append) {
        setStockResults((old) => {
          const seen = new Set(old.map((item) => `${item.provider || "stock"}-${item.id}`));
          return [...old, ...result.filter((item) => !seen.has(`${item.provider || "stock"}-${item.id}`))];
        });
        if (!result.length) setStockError("Sudah sampai hasil terakhir untuk kata ini.");
      } else {
        setStockResults(result);
        if (!result.length) setStockError("Koleksi kosong. Coba kata rain, fireplace, fire, fog, smoke, atau water.");
      }
      return result;
    } catch (error: any) {
      if (!append) setStockResults([]);
      setStockError(error?.message || "Koleksi video belum bisa dihubungi. Coba lagi.");
      return [];
    } finally {
      clearTimeout(timeout);
      setStockBusy(false);
    }
  }

  function addStockLayer(clip: StockClip, roleOverride?: "rain" | "fire" | "general") {
    const role = roleOverride || stockRole;
    const rainRole = role === "rain" || (role === "general" && /rain|hujan|water|drizzle/i.test(`${stockQuery} ${clip.by || ""}`));
    const fireRole = role === "fire" || (role === "general" && /fire|flame|fireplace|api|bara/i.test(`${stockQuery} ${clip.by || ""}`));
    // Pakai file sd untuk preview/overlay agar HP tidak decode video 1080p
    // setiap frame. Background/output tetap mengikuti resolusi ekspor.
    const src = stockMediaSrc(clip.sd || clip.src || "");
    if (!src) { setStockError("Video ini tidak punya file yang bisa dipakai."); return; }
    const layer: LayerAsmr = {
      id: uid("stock"), name: `${rainRole ? "🌧️" : fireRole ? "🔥" : "🎞️"} ${String(clip.by || clip.provider || "Stock video").slice(0, 28)}`,
      type: "video", src, start: 0, duration,
      visible: true,
      width: fireRole ? 42 : 100, height: fireRole ? 42 : 100, lockRatio: true,
      posX: 0, posY: fireRole ? 170 : 0, rotate: 0, anchorX: .5, anchorY: .5, flipH: false, flipV: false,
      speed: 1, trimIn: 0, trimOut: 0, animation: "none", animationAmount: 20, brightness: 100, contrast: 100, saturation: 100, blur: 0,
      // Screen adalah mode ringan untuk hitam; pixel key bisa diaktifkan manual
      // dari tab AI Matting bila file punya background yang lebih kompleks.
      keyMode: "none", keyThreshold: 28, keySoftness: 24,
      blendMode: "screen", opacity: rainRole ? 86 : 95,
      maskOn: rainRole, maskX: .27, maskY: .12, maskW: 620, maskH: 350,
      el: makeVideoElement(src),
    };
    bindVideoMetadata(layer.id, layer.el);
    setLayers((old) => [...old, layer]);
    setSelectedLayerId(layer.id);
    setToolTab("video");
    setInspectorTab(rainRole ? "mask" : "basic");
    setNotice(`${layer.name} ditambahkan. ${rainRole ? "Masker jendela otomatis aktif." : fireRole ? "Geser langsung ke area perapian." : "Atur posisinya di preview."}`);
  }

  function clearLayersForQuick() {
    const urls = new Set<string>();
    for (const layer of layers) {
      try { layer.el?.pause(); layer.el?.remove(); } catch {}
      if (layer.src.startsWith("blob:")) urls.add(layer.src);
    }
    urls.forEach((url) => { URL.revokeObjectURL(url); objectUrlsRef.current.delete(url); });
    setLayers([]);
    setSelectedLayerId("");
  }

  async function prepareQuickAsmr(recipe: typeof QUICK_ASMR_RECIPES[number]) {
    if (quickBusy) return;
    setQuickBusy(recipe.id);
    setNotice(`⚡ Menyiapkan ${recipe.label}…`);
    clearLayersForQuick();
    setMotionMode(recipe.role === "fire" ? "breathe" : "kenburns");
    setMotionStrength(recipe.role === "fire" ? 18 : 28);
    setMotionSpeed(.8);
    setDuration(60);
    setResolution("720p");
    setFps(30);
    setSoundId(recipe.sound);
    setStockRole(recipe.role);
    const clips = await searchStock(recipe.query);
    const first = clips[0];
    if (first) {
      addStockLayer(first, recipe.role);
      setNotice(`✅ ${recipe.label} siap. Tekan Preview atau Render Video ASMR.`);
    } else {
      setNotice(`⚠️ Koleksi ${recipe.label} belum tersedia. Upload overlay sendiri atau coba Cari lagi.`);
    }
    setQuickBusy("");
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
    bindVideoMetadata(copy.id, copy.el);
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
      const offset = Math.max(0, Math.min(duration, previewTime));
      setPreviewTime(offset);
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
        const audioOffset = audioBufferRef.current.duration > 0 ? offset % audioBufferRef.current.duration : 0;
        source.start(0, audioOffset);
        audioSourceRef.current = source;
        audioGainRef.current = gain;
        startAtRef.current = ctx.currentTime - offset;
        setPreviewTime(offset);
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
        bgBrightness, bgContrast, bgSaturation, bgBlur,
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
  const timelineWidth = Math.max(760, duration * timelineZoom);
  const rulerStep = duration >= 600 ? 60 : duration >= 120 ? 10 : 5;
  const rulerTicks = Array.from({ length: Math.floor(duration / rulerStep) + 1 }, (_, index) => index * rulerStep);

  return (
    <main className="asmr-pro-shell">
      <header className="asmr-pro-topbar">
        <div className="asmr-pro-top-left">
          <button className="asmr-back" type="button" onClick={() => { stopPlayback(); onExit(); }} aria-label="Kembali ke dashboard">×</button>
          <div className="asmr-brand"><div className="asmr-brand-icon">🎧</div><div><b>ASMR Studio</b><span>Professional ambience editor · private project</span></div></div>
        </div>
        <div className="asmr-pro-project"><b>{bgName || "Untitled ASMR"}</b><span>{resolution} · {fmtTime(duration)} · {layerCount} layer</span></div>
        <div className="asmr-header-actions"><button className="asmr-save" type="button" onClick={saveProject}>💾 Simpan</button><button className="asmr-export" type="button" onClick={() => void renderAsmrVideo()} disabled={rendering || (!bgReady && !bgError)}>{rendering ? `⏳ ${Math.round(progress * 100)}%` : "Export"}</button></div>
      </header>

      <div className="asmr-pro-workspace">
        <aside className="asmr-media-bin" aria-label="Media ASMR">
          <div className="asmr-pane-head"><div><span className="asmr-kicker">MEDIA BIN</span><b>Bahan ASMR</b></div><button type="button" className={`asmr-mini-mode ${asmrMode === "easy" ? "active" : ""}`} onClick={() => setAsmrMode(asmrMode === "easy" ? "pro" : "easy")}>{asmrMode === "easy" ? "⚡ Quick" : "🛠 Pro"}</button></div>
          {asmrMode === "easy" && <section className="asmr-quick-strip"><b>⚡ Quick Setup</b><span>Pilih resep, sistem menyiapkan ambience dan layer awal.</span><div>{QUICK_ASMR_RECIPES.slice(0, 2).map((recipe) => <button type="button" key={recipe.id} onClick={() => void prepareQuickAsmr(recipe)} disabled={!!quickBusy}>{recipe.icon} {quickBusy === recipe.id ? "…" : recipe.label}</button>)}</div></section>}

          <section className="asmr-media-section"><div className="asmr-section-label">BACKGROUND / SCENE</div><select className="asmr-select" value={bgPresetId} onChange={(e) => { setBgType("preset"); setBgPresetId(e.target.value); }}>{PRESET_BG.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><label className="asmr-upload compact"><strong>＋ Upload foto / gambar</strong><span>{bgName || "JPG/PNG"}</span><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleBackgroundFile(file); e.currentTarget.value = ""; }} /></label><div className={`asmr-asset-state ${bgReady ? "ready" : ""}`}>{bgReady ? "● Background siap" : bgError ? "● Background fallback" : "● Loading background…"}</div></section>

          <section className="asmr-media-section"><div className="asmr-section-label">OVERLAY COLLECTION <span>Koleksi overlay realistis</span></div><div className="asmr-collection-search"><input value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void searchStock(); }} placeholder="rain window / fireplace" /><button type="button" onClick={() => void searchStock()} disabled={stockBusy}>{stockBusy ? "…" : "Cari"}</button></div><div className="asmr-collection-shortcuts"><button type="button" onClick={() => void searchStock("rain window")}>🌧️ Hujan</button><button type="button" onClick={() => void searchStock("fireplace flame")}>🔥 Api</button><button type="button" onClick={() => void searchStock("fog smoke")}>🌫️ Kabut</button></div>{stockError && <p className="asmr-help error">{stockError}</p>}{stockBusy && <p className="asmr-help">⏳ Memuat koleksi…</p>}{!stockBusy && <div className="asmr-stock-grid">{stockResults.map((clip) => <button type="button" key={`${clip.provider}-${clip.id}`} className="asmr-stock-card" onClick={() => addStockLayer(clip)} title="Tambah sebagai layer"><span className="asmr-stock-thumb">{clip.thumb ? <img src={clip.thumb} alt="" loading="lazy" /> : <i>🎞️</i>}</span><span><b>{clip.provider || "stock"}</b><small>{clip.dur ? `${Math.round(clip.dur)} dtk` : "video"} · ＋</small></span></button>)}</div>}{!stockBusy && stockResults.length > 0 && stockResults.length < stockTotal && <button type="button" className="asmr-stock-more" onClick={() => void searchStock(stockQuery, true)}>＋ Muat pilihan berikutnya</button>}</section>

          <section className="asmr-media-section"><div className="asmr-section-label">IMPORT LOCAL OVERLAY</div><label className="asmr-upload compact"><strong>🎞️ Upload video overlay</strong><span>MP4/WebM · hujan, api, asap, bokeh</span><input type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) addVideoLayer(file); e.currentTarget.value = ""; }} /></label><label className="asmr-upload compact"><strong>🔊 Upload audio ambience</strong><span>MP3/WAV/OGG/M4A</span><input type="file" accept="audio/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleSoundFile(file); e.currentTarget.value = ""; }} /></label></section>

          <section className="asmr-media-section asmr-layer-bin"><div className="asmr-section-label">LAYERS <span>{layers.length}</span></div>{!layers.length && <p className="asmr-empty">Belum ada layer. Tambah dari koleksi di atas.</p>}{layers.map((layer) => <div key={layer.id} className={`asmr-layer-row ${selectedLayerId === layer.id ? "selected" : ""}`} onClick={() => { setSelectedLayerId(layer.id); setToolTab("video"); }}><span>{layer.type === "video" ? "🎞️" : layer.effect === "rain" ? "🌧️" : layer.effect === "fire" ? "🔥" : layer.effect === "fog" ? "🌫️" : "❄️"}</span><b>{layer.name}</b><em>{layer.maskOn ? "MASK" : "FULL"}</em><button type="button" onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}>{layer.visible ? "◉" : "○"}</button><button type="button" onClick={(e) => { e.stopPropagation(); duplicateLayer(layer); }}>＋</button><button type="button" className="delete" onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}>×</button></div>)}</section>
        </aside>

        <section className="asmr-pro-stage" aria-label="Preview ASMR">
          <div className="asmr-pro-stage-head"><div><span className="asmr-kicker">CANVAS PREVIEW</span><b>Review sebelum export</b></div><div className="asmr-stage-badges"><span>16:9</span><span>{resolution}</span><span>{fps} FPS</span></div></div>
          <div className="asmr-pro-canvas-wrap"><canvas ref={cvRef} width={PREVIEW_W} height={PREVIEW_H} aria-label="Preview ASMR — drag layer" onPointerDown={beginCanvasDrag} onPointerMove={moveCanvasDrag} onPointerUp={endCanvasDrag} onPointerCancel={endCanvasDrag} style={{ touchAction: "none", cursor: "grab" }} /><div className="asmr-live-pill"><i /> PREVIEW</div><button className="asmr-play" type="button" onClick={startPlayback}>{playing ? "⏸ Jeda" : "▶ Putar"}</button>{!bgReady && <div className="asmr-canvas-loading">{bgError ? "⚠️ Background fallback" : "⏳ Menyiapkan canvas…"}</div>}</div>
          <div className="asmr-pro-canvas-actions"><button type="button" className={playing ? "active" : ""} onClick={startPlayback}>{playing ? "⏸ Jeda preview" : "▶ Putar preview"}</button><button type="button" onClick={splitSelectedAtPlayhead}>✂️ Bagi di playhead</button><button type="button" onClick={() => setToolTab("animation")}>✨ Hidupkan foto</button><span>{fmtTime(previewTime)} / {fmtTime(duration)}</span></div>
          {!!notice && <div className={`asmr-notice ${notice.startsWith("❌") ? "danger" : notice.startsWith("✅") ? "success" : ""}`}>{notice}</div>}
          {!!projectStatus && <div className="asmr-save-status">{projectStatus}</div>}
          {renderedUrl && <section className="asmr-review-card"><div className="asmr-review-head"><div><span className="asmr-kicker">REVIEW OUTPUT</span><b>Review Video ASMR</b><small>{renderMode} · {ext} · cek dulu sebelum download</small></div><button type="button" className="asmr-text-btn" onClick={clearRenderedOutput}>Hapus</button></div><video src={renderedUrl} controls playsInline loop preload="metadata" className="asmr-review-video" /><div className="asmr-review-actions"><span>✅ Gerak foto, layer, masker, dan audio sudah dirender.</span><button type="button" className="asmr-download" onClick={downloadRendered}>📥 Download {ext}</button></div></section>}
        </section>

        <aside className="asmr-pro-inspector" aria-label="Inspector ASMR">
          <div className="asmr-pane-head"><div><span className="asmr-kicker">INSPECTOR</span><b>{activeLayer?.name || "Pilih layer"}</b></div><button type="button" className="asmr-text-btn" onClick={() => setToolTab("video")}>Reset view</button></div>
          <nav className="asmr-tool-tabs" aria-label="Alat inspector">{([["video", "🎞️ Video"], ["audio", "🔊 Audio"], ["speed", "⏱ Speed"], ["animation", "✨ Animation"], ["color", "🎨 Color"]] as const).map(([id, label]) => <button key={id} type="button" className={toolTab === id ? "active" : ""} onClick={() => setToolTab(id)}>{label}</button>)}</nav>

          {toolTab === "video" && <>
            {!activeLayer && <div className="asmr-inspector-empty">Pilih layer di Media Bin, timeline, atau ketuk langsung pada canvas.</div>}
            {activeLayer && <>
              <div className="asmr-inspector-tabs">{(["basic", "mask", "matting"] as const).map((id) => <button key={id} type="button" className={inspectorTab === id ? "active" : ""} onClick={() => setInspectorTab(id)}>{id === "basic" ? "Basic" : id === "mask" ? "Mask" : "Matting"}</button>)}</div>
              {inspectorTab === "basic" && <div className="asmr-inspector-body"><div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Transform</b><button type="button" onClick={() => updateLayer(activeLayer.id, { width: 100, height: 100, posX: 0, posY: 0, rotate: 0, anchorX: .5, anchorY: .5, flipH: false, flipV: false })}>↺ Reset</button></div><label className="asmr-range"><span><b>Width</b><strong>{activeLayer.width.toFixed(0)}%</strong></span><input type="range" min={20} max={180} value={activeLayer.width} onChange={(e) => { const value = Number(e.target.value); updateLayer(activeLayer.id, { width: value, height: activeLayer.lockRatio ? value : activeLayer.height }); }} /></label>{!activeLayer.lockRatio && <label className="asmr-range"><span><b>Height</b><strong>{activeLayer.height.toFixed(0)}%</strong></span><input type="range" min={20} max={180} value={activeLayer.height} onChange={(e) => updateLayer(activeLayer.id, { height: Number(e.target.value) })} /></label>}<div className="asmr-two-range"><label className="asmr-range"><span><b>Position X</b><strong>{activeLayer.posX.toFixed(0)}</strong></span><input type="range" min={-500} max={500} value={activeLayer.posX} onChange={(e) => updateLayer(activeLayer.id, { posX: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Position Y</b><strong>{activeLayer.posY.toFixed(0)}</strong></span><input type="range" min={-400} max={400} value={activeLayer.posY} onChange={(e) => updateLayer(activeLayer.id, { posY: Number(e.target.value) })} /></label></div><label className="asmr-range"><span><b>Rotate</b><strong>{activeLayer.rotate.toFixed(0)}°</strong></span><input type="range" min={-180} max={180} value={activeLayer.rotate} onChange={(e) => updateLayer(activeLayer.id, { rotate: Number(e.target.value) })} /></label><div className="asmr-flip-row"><span>Flip</span><button type="button" className={activeLayer.flipH ? "active" : ""} onClick={() => updateLayer(activeLayer.id, { flipH: !activeLayer.flipH })}>↔ H</button><button type="button" className={activeLayer.flipV ? "active" : ""} onClick={() => updateLayer(activeLayer.id, { flipV: !activeLayer.flipV })}>↕ V</button><label><input type="checkbox" checked={activeLayer.lockRatio} onChange={(e) => updateLayer(activeLayer.id, { lockRatio: e.target.checked })} /> Lock</label></div></div><div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Compositing</b><button type="button" onClick={() => updateLayer(activeLayer.id, { opacity: 80, blendMode: "screen" })}>↺ Reset</button></div><div className="asmr-inline-options"><span>Blend</span><select className="asmr-select" value={activeLayer.blendMode} onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as BlendMode })}><option value="screen">Screen</option><option value="lighter">Lighter</option><option value="normal">Normal</option><option value="multiply">Multiply</option></select></div><label className="asmr-range"><span><b>Opacity</b><strong>{activeLayer.opacity}%</strong></span><input type="range" min={0} max={100} value={activeLayer.opacity} onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} /></label></div></div>}
              {inspectorTab === "mask" && <div className="asmr-inspector-body"><div className="asmr-mask-hero"><b>🔳 Mask kaca / area overlay</b><span>Aktifkan lalu drag kotak cyan di canvas. Drag titik cyan untuk resize.</span><label><input type="checkbox" checked={activeLayer.maskOn} onChange={(e) => updateLayer(activeLayer.id, { maskOn: e.target.checked })} /> Gunakan masker</label></div>{activeLayer.maskOn && <div className="asmr-mask-controls"><button type="button" className="asmr-quick-button" onClick={() => updateLayer(activeLayer.id, { maskOn: true, maskX: .27, maskY: .12, maskW: 620, maskH: 350 })}>🪟 Pasang preset jendela</button><label className="asmr-range"><span><b>Mask X</b><strong>{Math.round(activeLayer.maskX * 100)}%</strong></span><input type="range" min={0} max={1} step={.01} value={activeLayer.maskX} onChange={(e) => updateLayer(activeLayer.id, { maskX: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Mask Y</b><strong>{Math.round(activeLayer.maskY * 100)}%</strong></span><input type="range" min={0} max={1} step={.01} value={activeLayer.maskY} onChange={(e) => updateLayer(activeLayer.id, { maskY: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Lebar</b><strong>{Math.round(activeLayer.maskW)}px</strong></span><input type="range" min={20} max={1280} value={activeLayer.maskW} onChange={(e) => updateLayer(activeLayer.id, { maskW: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Tinggi</b><strong>{Math.round(activeLayer.maskH)}px</strong></span><input type="range" min={20} max={720} value={activeLayer.maskH} onChange={(e) => updateLayer(activeLayer.id, { maskH: Number(e.target.value) })} /></label></div>}</div>}
              {inspectorTab === "matting" && <div className="asmr-matting-info"><b>✂️ Background removal</b><p>Gunakan untuk video hujan/api berlatar hitam atau green screen. Mode ini hanya memproses layer terpilih.</p><select className="asmr-select" value={activeLayer.keyMode} onChange={(e) => updateLayer(activeLayer.id, { keyMode: e.target.value as LayerAsmr["keyMode"] })}><option value="none">Tidak ada</option><option value="black">Hapus background hitam — hujan/api</option><option value="green">Hapus green screen</option></select>{activeLayer.keyMode !== "none" && <><label className="asmr-range"><span><b>Threshold</b><strong>{activeLayer.keyThreshold}</strong></span><input type="range" min={0} max={160} value={activeLayer.keyThreshold} onChange={(e) => updateLayer(activeLayer.id, { keyThreshold: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Softness</b><strong>{activeLayer.keySoftness}</strong></span><input type="range" min={1} max={100} value={activeLayer.keySoftness} onChange={(e) => updateLayer(activeLayer.id, { keySoftness: Number(e.target.value) })} /></label></>}</div>}
            </>}
          </>}

          {toolTab === "audio" && <div className="asmr-inspector-body"><div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Ambience</b></div><select className="asmr-select" value={soundId} onChange={(e) => setSoundId(e.target.value)}><option value="custom">📁 {soundName || "Audio HP"}</option>{PRESET_SOUNDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p className="asmr-help">{soundId === "custom" ? "Audio milikmu sendiri." : PRESET_SOUNDS.find((item) => item.id === soundId)?.desc}</p><label className="asmr-upload compact"><strong>＋ Ganti audio</strong><span>Loop sepanjang durasi</span><input type="file" accept="audio/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleSoundFile(file); e.currentTarget.value = ""; }} /></label><label className="asmr-range"><span><b>Volume</b><strong>{soundVolume}%</strong></span><input type="range" min={0} max={100} value={soundVolume} onChange={(e) => setSoundVolume(Number(e.target.value))} /></label><div className={`asmr-audio-status ${soundReady ? "ready" : ""}`}>{soundLoading ? "⏳ Memuat…" : soundReady ? `✅ ${soundName} siap` : soundError || "🔇 Audio belum siap"}</div></div></div>}

          {toolTab === "speed" && <div className="asmr-inspector-body">{activeLayer && activeLayer.type === "video" ? <div className="asmr-trim-card"><div className="asmr-trim-head"><b>✂️ Trim video overlay</b><span>{layerDurations[activeLayer.id] ? `${layerDurations[activeLayer.id].toFixed(1)} dtk asli` : "Membaca…"}</span></div><div className="asmr-trim-track"><i style={trimRangeStyle(activeLayer)} /></div><label className="asmr-range"><span><b>Trim masuk</b><strong>{activeLayer.trimIn.toFixed(1)} dtk</strong></span><input type="range" min={0} max={Math.max(.1, (layerDurations[activeLayer.id] || 1) - .1)} step={.1} value={Math.min(activeLayer.trimIn, Math.max(0, (layerDurations[activeLayer.id] || 1) - .1))} onChange={(e) => { const value = Number(e.target.value); updateLayer(activeLayer.id, { trimIn: Math.min(value, trimEndFor(activeLayer) - .1) }); }} /></label><label className="asmr-range"><span><b>Trim keluar</b><strong>{trimEndFor(activeLayer).toFixed(1)} dtk</strong></span><input type="range" min={Math.min((layerDurations[activeLayer.id] || 1), activeLayer.trimIn + .1)} max={Math.max(.1, layerDurations[activeLayer.id] || 1)} step={.1} value={trimEndFor(activeLayer)} onChange={(e) => updateLayer(activeLayer.id, { trimOut: Math.max(activeLayer.trimIn + .1, Number(e.target.value)) })} /></label><div className="asmr-trim-actions"><button type="button" onClick={() => updateLayer(activeLayer.id, { trimIn: 0, trimOut: 0 })}>↺ Full video</button><span>Bagian di luar rentang tidak diputar.</span></div><label className="asmr-range"><span><b>Speed</b><strong>{(activeLayer.speed || 1).toFixed(2)}×</strong></span><input type="range" min={.25} max={3} step={.05} value={activeLayer.speed || 1} onChange={(e) => updateLayer(activeLayer.id, { speed: Number(e.target.value) })} /></label><label className="asmr-check-row"><input type="checkbox" checked={activeLayer.el?.loop !== false} onChange={(e) => { if (activeLayer.el) activeLayer.el.loop = e.target.checked; }} /><span><b>Loop rentang trim</b><small>Ulangi hujan/api agar memenuhi durasi.</small></span></label></div> : <div className="asmr-inspector-empty">Pilih video overlay untuk memotong bagian masuk/keluar.</div>}<div className="asmr-inspector-group"><div className="asmr-group-head"><b>Timeline output</b></div><div className="asmr-output-grid"><label><span>Durasi</span><select className="asmr-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 dtk</option><option value={60}>1 menit</option><option value={300}>5 menit</option><option value={600}>10 menit</option><option value={1800}>30 menit</option><option value={3600}>1 jam</option><option value={7200}>2 jam</option></select></label><label><span>FPS</span><select className="asmr-select" value={fps} onChange={(e) => setFps(Number(e.target.value))}><option value={30}>30</option><option value={24}>24</option><option value={15}>15</option></select></label></div></div></div>}

          {toolTab === "animation" && <div className="asmr-inspector-body"><div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Background motion</b></div><div className="asmr-motion-grid">{MOTION_OPTIONS.map((option) => <button key={option.id} type="button" className={motionMode === option.id ? "active" : ""} onClick={() => setMotionMode(option.id)}><strong>{option.label}</strong><small>{option.desc}</small></button>)}</div><label className="asmr-range"><span><b>Intensity</b><strong>{motionStrength}%</strong></span><input type="range" min={0} max={100} value={motionStrength} onChange={(e) => setMotionStrength(Number(e.target.value))} /></label><label className="asmr-range"><span><b>Speed</b><strong>{motionSpeed.toFixed(1)}×</strong></span><input type="range" min={.2} max={2} step={.1} value={motionSpeed} onChange={(e) => setMotionSpeed(Number(e.target.value))} /></label></div>{activeLayer && <div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Layer animation</b></div><select className="asmr-select" value={activeLayer.animation} onChange={(e) => updateLayer(activeLayer.id, { animation: e.target.value as LayerAsmr["animation"] })}><option value="none">Tidak ada</option><option value="float">Float</option><option value="pulse">Pulse</option><option value="sway">Sway</option></select><label className="asmr-range"><span><b>Intensity</b><strong>{activeLayer.animationAmount}%</strong></span><input type="range" min={0} max={100} value={activeLayer.animationAmount} onChange={(e) => updateLayer(activeLayer.id, { animationAmount: Number(e.target.value) })} /></label></div>}</div>}

          {toolTab === "color" && <div className="asmr-inspector-body"><div className="asmr-inspector-group"><div className="asmr-group-head"><b>● Background color</b><button type="button" onClick={() => { setBgBrightness(100); setBgContrast(100); setBgSaturation(100); setBgBlur(0); }}>↺ Reset</button></div><label className="asmr-range"><span><b>Brightness</b><strong>{bgBrightness}%</strong></span><input type="range" min={50} max={150} value={bgBrightness} onChange={(e) => setBgBrightness(Number(e.target.value))} /></label><label className="asmr-range"><span><b>Contrast</b><strong>{bgContrast}%</strong></span><input type="range" min={50} max={150} value={bgContrast} onChange={(e) => setBgContrast(Number(e.target.value))} /></label><label className="asmr-range"><span><b>Saturation</b><strong>{bgSaturation}%</strong></span><input type="range" min={0} max={200} value={bgSaturation} onChange={(e) => setBgSaturation(Number(e.target.value))} /></label><label className="asmr-range"><span><b>Blur</b><strong>{bgBlur}px</strong></span><input type="range" min={0} max={20} value={bgBlur} onChange={(e) => setBgBlur(Number(e.target.value))} /></label></div>{activeLayer && <div className="asmr-inspector-group"><div className="asmr-group-head"><b>Layer color</b><button type="button" onClick={() => updateLayer(activeLayer.id, { brightness: 100, contrast: 100, saturation: 100, blur: 0 })}>↺ Reset</button></div><label className="asmr-range"><span><b>Brightness</b><strong>{activeLayer.brightness}%</strong></span><input type="range" min={50} max={150} value={activeLayer.brightness} onChange={(e) => updateLayer(activeLayer.id, { brightness: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Contrast</b><strong>{activeLayer.contrast}%</strong></span><input type="range" min={50} max={150} value={activeLayer.contrast} onChange={(e) => updateLayer(activeLayer.id, { contrast: Number(e.target.value) })} /></label><label className="asmr-range"><span><b>Saturation</b><strong>{activeLayer.saturation}%</strong></span><input type="range" min={0} max={200} value={activeLayer.saturation} onChange={(e) => updateLayer(activeLayer.id, { saturation: Number(e.target.value) })} /></label></div>}</div>}

          <section className="asmr-inspector-export"><div><b>Export ASMR</b><span>Review hasil akan muncul di canvas kiri.</span></div><button type="button" onClick={() => void renderAsmrVideo()} disabled={rendering || (!bgReady && !bgError)}>{rendering ? `${Math.round(progress * 100)}%` : "🎬 Render"}</button></section>
        </aside>
      </div>

      <section className="asmr-timeline" aria-label="Timeline ASMR">
        <div className="asmr-timeline-head"><div><span className="asmr-kicker">TIMELINE</span><b>Timeline ASMR</b><small>Drag klip untuk memindahkan · handle kiri/kanan untuk trim · playhead untuk membagi</small></div><div className="asmr-timeline-tools"><button type="button" onClick={splitSelectedAtPlayhead}>✂️ Bagi</button><button type="button" onClick={() => setTimelineZoom((value) => Math.max(25, value - 10))}>−</button><span>{timelineZoom}px/s</span><button type="button" onClick={() => setTimelineZoom((value) => Math.min(160, value + 10))}>＋</button></div></div>
        <div className="asmr-timeline-scroll" onPointerDown={seekTimeline} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag}>
          <div className="asmr-timeline-canvas" style={{ width: timelineWidth }}>
            <div className="asmr-ruler">{rulerTicks.map((value) => <span key={value} style={{ left: value * timelineZoom }}>{fmtTime(value)}</span>)}</div>
            <div className="asmr-track-row"><div className="asmr-track-label"><b>SCENE</b><small>{bgName || "Background"}</small></div><div className="asmr-track-body"><div className="asmr-timeline-clip scene" style={{ left: 0, width: duration * timelineZoom }}><b>🖼 Background + camera motion</b></div></div></div>
            <div className="asmr-track-row"><div className="asmr-track-label"><b>AUDIO</b><small>{soundName || "Ambience"}</small></div><div className="asmr-track-body"><div className="asmr-timeline-clip audio" style={{ left: 0, width: duration * timelineZoom }}><b>🔊 {soundReady ? soundName : "Ambience belum siap"}</b><small>LOOP · {soundVolume}%</small></div></div></div>
            {layers.map((layer) => <div className="asmr-track-row" key={layer.id}><div className="asmr-track-label"><b>{layer.type === "video" ? "OVERLAY" : "EFFECT"}</b><small>{layer.name}</small></div><div className="asmr-track-body"><div className={`asmr-timeline-clip ${selectedLayerId === layer.id ? "selected" : ""}`} style={{ left: layer.start * timelineZoom, width: Math.max(12, layer.duration * timelineZoom), background: layer.type === "video" ? "linear-gradient(135deg,#2563eb,#4f46e5)" : layer.effect === "fire" ? "linear-gradient(135deg,#b45309,#ea580c)" : "linear-gradient(135deg,#0f766e,#0f766e)" }} onPointerDown={(e) => beginTimelineDrag(e, layer, "move")} onClick={(e) => { e.stopPropagation(); setSelectedLayerId(layer.id); }}><button type="button" className="asmr-timeline-handle left" onPointerDown={(e) => beginTimelineDrag(e, layer, "left")} aria-label="Trim awal" /><b>{layer.name}</b><small>{layer.maskOn ? "MASK" : "FULL"} · {fmtTime(layer.duration)}</small><button type="button" className="asmr-timeline-handle right" onPointerDown={(e) => beginTimelineDrag(e, layer, "right")} aria-label="Trim akhir" /></div></div></div>)}
            <div className="asmr-playhead" style={{ left: previewTime * timelineZoom }}><i /></div>
          </div>
        </div>
      </section>
    </main>
  );
}
