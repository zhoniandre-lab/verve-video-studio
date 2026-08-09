/* =====================================================================
   MESIN RENDER KUAT / OFFLINE (v19.33) — 100% orisinal
   =====================================================================
   Kenapa ada mesin ini?
   Render lama (MediaRecorder + captureStream) berjalan REALTIME dan
   bergantung pada audio yang benar-benar berbunyi. Kalau browser
   menghentikan audio/rAF (layar mati, tab pindah, battery saver),
   hasilnya terpotong diam-diam — persis yang kamu alami (lagu 48 menit
   jadi 54 detik).

   Mesin ini beda total:
   - AUDIO: OfflineAudioContext render per segmen (murni komputasi,
     tidak perlu speaker/bunyi) → dikodekan H.264? tidak — AAC via AudioEncoder.
   - VIDEO: frame digambar secepat CPU mampu (tidak perlu realtime),
     dikodekan H.264 via VideoEncoder (WebCodecs).
   - Digabung jadi MP4 asli pakai mp4-muxer (tanpa MediaRecorder).
   Hasilnya: render TAHAN terhadap layar mati/HP terkunci, dan durasi
   video = durasi yang diminta, persis.
   ===================================================================== */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { buildAudioChain } from "./audio-chain";
import { freqAt } from "./fft";
import type { FreqFrames } from "./fft";

export interface OptsRenderOffline {
  buf: AudioBuffer;
  w: number;
  h: number;
  offset: number;
  dur: number;
  eq: string;
  comp: number;
  gain: number;
  fades: boolean;
  /** puncak energi 0..1 per 0.25 dtk — untuk bar sintetis (dari audio asli) */
  peaks?: number[];
  /** 🎛 v19.39: frame FREKUENSI ASLI (FFT) — kalau ada, dipakai buat bars
   *  (bukan synthBars sintetis) → spektrum AKURAT mengikuti musik. */
  freqFrames?: FreqFrames;
  /** AAC (default) atau Opus — dipilih otomatis dari cekRenderOfflineMampu */
  audioCodec?: "aac" | "opus";
  /** bitrate video (default 6 Mbps) */
  videoBitrate?: number;
  /** fps video (default 30; 24 = 20% lebih cepat, tetap mulus) */
  fps?: number;
  /** ⚡ v19.46.1 TURBO: render pada resolusi LEBIH RENDAH lalu di-upscale ke ukuran
   *  final sebelum encode. Jauh lebih cepat (2-4×) karena piksel yang digambar
   *  lebih sedikit; kualitas tetap oke untuk YouTube (yang re-encode sendiri).
   *  resScale = 0.75 → render 75% lebar/tinggi lalu upscale. */
  resScale?: number;
  /** 🚀 v19.34: render BERLAPIS — "bg" (latar statis) di-cache, digambar ulang tiap
   *  BG_EVERY frame; "dinamis" (bar/lirik/logo) tiap frame. Jauh lebih cepat
   *  karena full-canvas gradient/fill (bagian paling mahal) tidak diulang tiap frame. */
  drawBg?: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq: Uint8Array | null) => void;
  drawDin?: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq: Uint8Array | null) => void;
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq: Uint8Array | null) => void;
  onProg?: (p: number) => void;
  onFase?: (fase: "audio" | "video" | "mux") => void;
  /** info teknis (mode yang dipilih, dll) — buat laporan di layar */
  onInfo?: (s: string) => void;
}

export async function cekRenderOfflineMampu(): Promise<{ ok: boolean; alasan?: string; audioCodec?: "aac" | "opus" }> {
  try {
    const W = window as any;
    if (!W.VideoEncoder || !W.AudioEncoder || !W.VideoFrame || !W.AudioData) {
      return { ok: false, alasan: "WebCodecs tidak didukung browser ini (pakai Chrome/Edge terbaru)" };
    }
    const vc = await W.VideoEncoder.isConfigSupported({
      codec: "avc1.42001f", width: 640, height: 360, bitrate: 1_000_000, framerate: 30,
      avc: { format: "avc" },
    }).catch(() => null);
    if (!vc?.supported) return { ok: false, alasan: "Encoder H.264 tidak didukung browser ini" };
    const acAac = await W.AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000,
    }).catch(() => null);
    if (acAac?.supported) return { ok: true, audioCodec: "aac" };
    const acOpus = await W.AudioEncoder.isConfigSupported({
      codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000,
    }).catch(() => null);
    if (acOpus?.supported) return { ok: true, audioCodec: "opus" };
    return { ok: false, alasan: "Encoder audio (AAC/Opus) tidak didukung browser ini" };
  } catch {
    return { ok: false, alasan: "WebCodecs bermasalah di browser ini" };
  }
}

const FPS_DEF = 30;
const SEG_AUDIO = 60; // detik per segmen offline (batasi memori HP)
/** 🚀 v19.34: background di-cache — digambar ulang tiap 4 frame (~7.5×/dtk).
 *  Mata nggak bisa bedain latar yang bergerak pelan, tapi biaya render turun drastis. */
const BG_EVERY = 4;

/** Bar sintetis dari puncak audio asli — pengganti AnalyserNode saat render offline.
 *  🐛 FIX v19.34: GANTI Math.random (noise per frame → bar kelihatan patah/getar)
 *  dengan goyangan sinus deterministik → halus & konsisten antar frame. */
export function synthBars(t: number, peaks: number[]): Uint8Array {
  const out = new Uint8Array(128);
  const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor(t / 0.25)));
  const base = peaks[idx] ?? 0.2;
  for (let i = 0; i < 128; i++) {
    let v = base * (0.55 + 0.45 * Math.sin(t * 6 + i * 0.25));
    v += Math.sin(t * 37 + i * 1.7) * 0.025 + Math.sin(t * 23 + i * 3.1) * 0.015;
    out[i] = Math.max(6, Math.min(255, Math.round(v * 255)));
  }
  return out;
}

export async function renderOfflineVideo(o: OptsRenderOffline): Promise<Blob> {
  const buf = o.buf;
  const dur = Math.max(0.5, Math.min(o.dur, buf.duration - o.offset));
  const off0 = Math.max(0, o.offset);
  const audioCodec = o.audioCodec || "aac";
  // Opus wajib 48kHz; AAC pakai 44.1kHz (OfflineAudioContext otomatis resample sumber)
  const SR = audioCodec === "opus" ? 48000 : 44100;

  o.onFase?.("audio");
  // ---------- 1) AUDIO: OfflineAudioContext per segmen → AAC/Opus ----------
  const audioChunks: EncodedAudioChunk[] = [];
  let encA: AudioEncoder | null = null;
  await new Promise<void>((res, rej) => {
    try {
      encA = new AudioEncoder({
        output: (c) => audioChunks.push(c),
        error: (e) => rej(e instanceof Error ? e : new Error(String(e))),
      });
      encA.configure({
        codec: audioCodec === "opus" ? "opus" : "mp4a.40.2",
        sampleRate: SR, numberOfChannels: 2, bitrate: 192_000,
      });
      res();
    } catch (e) { rej(e instanceof Error ? e : new Error(String(e))); }
  });
  const nSeg = Math.max(1, Math.ceil(dur / SEG_AUDIO));
  for (let s = 0; s < nSeg; s++) {
    const segStart = s * SEG_AUDIO;
    const segDur = Math.min(SEG_AUDIO, dur - segStart);
    const len = Math.max(1, Math.ceil(segDur * SR));
    const off = new OfflineAudioContext(2, len, SR);
    const src = off.createBufferSource();
    src.buffer = buf;
    const { input, analyser } = buildAudioChain(off, o.eq, o.comp, o.gain, true);
    analyser.connect(off.destination);
    src.connect(input);
    src.start(0, off0 + segStart, segDur);
    const rendered = await off.startRendering();
    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.getChannelData(1);
    // envelope fade global (diterapkan di PCM supaya konsisten antar segmen)
    const BLK = 8192;
    for (let i = 0; i < len; i += BLK) {
      const n = Math.min(BLK, len - i);
      const data = new Float32Array(n * 2);
      for (let j = 0; j < n; j++) {
        const t = segStart + (i + j) / SR;
        let env = 1;
        if (o.fades) {
          if (t < 1.2) env = t / 1.2;
          const tail = dur - t;
          if (tail < 1.8) env = Math.min(env, Math.max(0, tail) / 1.8);
        }
        data[j * 2] = ch0[i + j] * env;
        data[j * 2 + 1] = ch1[i + j] * env;
      }
      // 🐛 FIX v19.33.1: timestamp audio WAJIB mulai 0 — mp4-muxer menolak
      // track yang chunk pertamanya DTS != 0 (dulu pakai off0 → short selalu gagal).
      const sampleIdx = segStart * SR + i;
      const ad = new AudioData({
        format: "f32",
        sampleRate: SR,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((sampleIdx / SR) * 1e6),
        data,
      });
      // 🐛 FIX v19.33.2: backpressure audio juga (aman untuk encoder lambat)
      while (encA!.encodeQueueSize > 40) {
        await new Promise((r) => setTimeout(r, 10));
      }
      encA!.encode(ad);
      ad.close();
    }
    o.onProg?.(0.15 * ((s + 1) / nSeg));
  }
  await encA!.flush();
  encA!.close();
  encA = null;

  // ---------- 2) VIDEO: frame → H.264 (WebCodecs) ----------
  o.onFase?.("video");
  const W = o.w, H = o.h;
  const fps = o.fps && (o.fps === 24 || o.fps === 30 || o.fps === 25) ? o.fps : FPS_DEF;
  // ⚡ v19.46.1 TURBO: render & ENCODE pada resolusi lebih rendah LANGSUNG (bukan upscale).
  // 🐛 FIX (dari benchmark): upscale TIDAK ngefek karena encoder tetap memproses 1080×608 penuh.
  // Yang bener: output video = resolusi kecil → encoder kerja lebih sedikit → 2× lebih cepat.
  const turbo = o.resScale && o.resScale > 0.3 && o.resScale < 1 ? o.resScale : 1;
  const cw = Math.max(160, Math.round(W * turbo));
  const ch = Math.max(90, Math.round(H * turbo));
  const cv = document.createElement("canvas");
  cv.width = turbo < 1 ? cw : W;
  cv.height = turbo < 1 ? ch : H;
  const ctx = cv.getContext("2d", { alpha: false })!;
  const cvW = cv; // canvas kerja = canvas encode (satu canvas)
  const ctxW = ctx;
  // 🚀 v19.34: canvas latar ter-cache (hanya kalau drawBg/drawDin disediakan)
  const bgCv = !!o.drawBg && !!o.drawDin ? document.createElement("canvas") : null;
  const bgCtx = bgCv ? bgCv.getContext("2d", { alpha: false })! : null;
  if (bgCv) { bgCv.width = cw; bgCv.height = ch; }
  // 🚀 v19.34: ADAPTIF — ukur dulu mana yang lebih cepat DI PERANGKAT INI (HP GPU beda
  // dengan CPU). Jalur GPU: berlapis menang telak (latar di-cache). Jalur CPU murni:
  // mode lama kadang lebih cepat. Jadi kita ukur 30 frame tiap mode, pilih tercepat.
  let pakaiLapis = !!o.drawBg && !!o.drawDin;
  if (pakaiLapis) {
    try {
      const BENCH = 30;
      const t0 = performance.now();
      for (let f = 0; f < BENCH; f++) {
        const tt = f / 30;
        if (f % BG_EVERY === 0) o.drawBg!(bgCtx!, cw, ch, tt, null);
        ctxW.drawImage(bgCv!, 0, 0);
        o.drawDin!(ctxW, cw, ch, tt, null);
      }
      const msLapis = performance.now() - t0;
      const t1 = performance.now();
      for (let f = 0; f < BENCH; f++) o.draw(ctxW, cw, ch, f / 30, null);
      const msFull = performance.now() - t1;
      if (msFull < msLapis) pakaiLapis = false; // CPU murni → mode lama lebih cepat
      o.onInfo?.(`Benchmark: berlapis ${msLapis.toFixed(0)}ms vs lama ${msFull.toFixed(0)}ms (30 frame) → pakai ${pakaiLapis ? "berlapis 🚀" : "lama"}`);
    } catch { pakaiLapis = false; }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: cw, height: ch, frameRate: fps },
    audio: { codec: audioCodec === "opus" ? "opus" : "aac", sampleRate: SR, numberOfChannels: 2 },
    fastStart: "in-memory",
  });
  for (const c of audioChunks) muxer.addAudioChunk(c);
  audioChunks.length = 0;

  const totalFrames = Math.round(dur * fps);
  const usPer = 1e6 / fps;
  let vCfg: EncodedVideoChunkMetadata["decoderConfig"] | undefined;
  let encV: VideoEncoder | null = null;
  await new Promise<void>((res, rej) => {
    try {
      encV = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig) vCfg = meta.decoderConfig;
          muxer.addVideoChunk(chunk, { decoderConfig: vCfg });
        },
        error: (e) => rej(e instanceof Error ? e : new Error(String(e))),
      });
      encV.configure({
        codec: "avc1.42001f",
        width: cw, height: ch,
        bitrate: o.videoBitrate || 6_000_000,
        framerate: fps,
        avc: { format: "avc" },
      });
      res();
    } catch (e) { rej(e instanceof Error ? e : new Error(String(e))); }
  });

  const peaks = o.peaks || [];
  const visibel = () => (typeof document !== "undefined" ? document.visibilityState !== "hidden" : true);
  for (let f = 0; f < totalFrames; f++) {
    const t = off0 + f / fps;
    // 🎛 v19.39: pakai FFT ASLI kalau ada — kalau tidak, fallback synthBars
    const freq = o.freqFrames ? freqAt(o.freqFrames, t) : (peaks.length ? synthBars(t, peaks) : null);
    if (pakaiLapis) {
      // 🚀 v19.34: latar digambar ulang tiap BG_EVERY frame → 3-4× lebih cepat
      if (f % BG_EVERY === 0) o.drawBg!(bgCtx!, cw, ch, t, freq);
      ctxW.drawImage(bgCv!, 0, 0);
      o.drawDin!(ctxW, cw, ch, t, freq);
    } else {
      o.draw(ctxW, cw, ch, t, freq);
    }
    const frame = new VideoFrame(cv, { timestamp: f * usPer, duration: usPer });
    encV!.encode(frame, { keyFrame: f % 60 === 0 });
    frame.close();
    // 🐛 FIX v19.33.2: HORMATI BACKPRESSURE encoder! Kalau kita lempar frame lebih cepat
    // dari kemampuan encoder (HP lama/encoder software), antrian encoder membengkak →
    // memory meledak → renderer crash. Tunggu sampai antrian < 30 sebelum lanjut.
    while (encV!.encodeQueueSize > 30) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if ((f & 31) === 0) {
      o.onProg?.(0.15 + 0.83 * ((f + 1) / totalFrames));
      // 🚀 v19.34: yield hanya saat tab terlihat — di background tab (layar mati)
      // timer di-throttle browser → tanpa yield render malah makin cepat.
      if (visibel()) await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encV!.flush();
  encV!.close();
  encV = null;

  // ---------- 3) GABUNG jadi MP4 ----------
  o.onFase?.("mux");
  muxer.finalize();
  const bytes = new Uint8Array((muxer.target as ArrayBufferTarget).buffer);
  o.onProg?.(1);
  return new Blob([bytes], { type: "video/mp4" });
}
