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
import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from "mp4-muxer";
import { buildAudioChain } from "./audio-chain";
import { freqAt } from "./fft";
import type { FreqFrames } from "./fft";
import { sambungAmbience, buatReverbIR, type JenisAmbience } from "./ambience"; // 🌧️🎙️ v20.0

export interface RenderFileSink {
  stream: FileSystemWritableFileStream;
  getFile: () => Promise<Blob>;
}

export interface OptsRenderOffline {
  buf: AudioBuffer;
  /** Opsional: tulis langsung ke OPFS/disk, bukan menampung MP4 40–60 menit di RAM. */
  fileSink?: RenderFileSink;
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
  /** 🌧️ v20.0 SUARA ALAM LATAR (ambience) — hujan/air/petir/upload, volume terpisah
   *  dari vokal → tidak mengganggu bacaan. */
  ambience?: { jenis: JenisAmbience; gain: number; buf?: AudioBuffer | null } | null;
  /** 🎙️ v20.0 REVERB VOKAL — 0..0.6, biar rekaman tidak mentahan (ruang halus). */
  vocalReverb?: number;
  /** 🎙️ v20.6 NOISE GATE — ambang RMS (mis. 0.003). Bagian yang sunyi (desis/keresek
   *  mikrofon) dipadamkan halus; suara asli tetap utuh. 0 = mati. */
  noiseGate?: number;
}

/** Macroblock H.264 = 16px. Ukuran bukan kelipatan 16 → banyak HP jatuh ke encoder SOFTWARE (3–10× lebih lambat). */
export function align16(n: number): number {
  return Math.max(16, Math.round(n / 16) * 16);
}

export type CfgVideoEnc = {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  hardwareAcceleration?: "prefer-hardware" | "no-preference";
  latencyMode?: "quality" | "realtime";
  avc?: { format: "avc" };
};

/** Pilih config encoder yang DIDUKUNG perangkat — hardware dulu, lalu software. */
export async function pilihConfigVideo(w: number, h: number, fps: number, bitrate: number): Promise<CfgVideoEnc | null> {
  const W = typeof window !== "undefined" ? (window as any) : null;
  if (!W?.VideoEncoder?.isConfigSupported) return null;
  const cw = align16(w), ch = align16(h);
  const px = cw * ch;
  const lvl = px <= 1280 * 720 ? "1f" : px <= 1920 * 1080 ? "28" : "32";
  const codecs = [`avc1.4d00${lvl}`, `avc1.6400${lvl}`, `avc1.4200${lvl}`];
  const hws: Array<"prefer-hardware" | "no-preference"> = ["prefer-hardware", "no-preference"];
  const lats: Array<"quality" | "realtime"> = ["quality", "realtime"];
  for (const hw of hws) {
    for (const codec of codecs) {
      for (const latencyMode of lats) {
        const cfg: CfgVideoEnc = {
          codec, width: cw, height: ch, bitrate, framerate: fps,
          hardwareAcceleration: hw, latencyMode, avc: { format: "avc" },
        };
        try {
          const s = await W.VideoEncoder.isConfigSupported(cfg);
          if (s?.supported) return cfg;
        } catch { /* browser menolak field tertentu — coba kombinasi lain */ }
      }
    }
  }
  return null;
}

export async function cekRenderOfflineMampu(): Promise<{ ok: boolean; alasan?: string; audioCodec?: "aac" | "opus" }> {
  try {
    const W = window as any;
    if (!W.VideoEncoder || !W.AudioEncoder || !W.VideoFrame || !W.AudioData) {
      return { ok: false, alasan: "WebCodecs tidak didukung browser ini (pakai Chrome/Edge terbaru)" };
    }
    const probed = await pilihConfigVideo(640, 360, 30, 1_000_000);
    if (!probed) return { ok: false, alasan: "Encoder H.264 tidak didukung browser ini" };
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
  const W = o.w, H = o.h;
  const fps = o.fps && (o.fps === 24 || o.fps === 30 || o.fps === 25) ? o.fps : FPS_DEF;
  // ⚡ v19.46.1 TURBO: encode LANGSUNG di resolusi kecil (bukan upscale ke 1080).
  // 🐛 v19.75: SELALU align16 — 1080 % 16 = 8 → banyak HP Chrome jatuh ke encoder SOFTWARE.
  const turbo = o.resScale && o.resScale > 0.3 && o.resScale < 1 ? o.resScale : 1;
  const cw = align16(Math.max(160, Math.round(W * turbo)));
  const ch = align16(Math.max(90, Math.round(H * turbo)));
  const px = cw * ch;
  let bitrate = o.videoBitrate;
  if (!bitrate) {
    const base = px <= 640 * 360 ? 1_800_000 : px <= 848 * 480 ? 2_400_000 : px <= 1280 * 720 ? 3_200_000 : 4_500_000;
    bitrate = dur > 40 * 60 ? Math.min(base, 2_400_000) : dur > 10 * 60 ? Math.min(base, 3_000_000) : base;
  }
  // Render panjang diarahkan ke OPFS melalui target streaming. Fallback pendek
  // tetap memakai ArrayBufferTarget agar perilaku lama tidak berubah.
  const muxTarget = o.fileSink
    ? new FileSystemWritableFileStreamTarget(o.fileSink.stream, { chunkSize: 16 * 1024 * 1024 })
    : new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxTarget,
    video: { codec: "avc", width: cw, height: ch, frameRate: fps },
    audio: { codec: audioCodec === "opus" ? "opus" : "aac", sampleRate: SR, numberOfChannels: 2 },
    fastStart: o.fileSink ? "fragmented" : "in-memory",
  });

  o.onFase?.("audio");
  // ---------- 1) AUDIO: OfflineAudioContext per segmen → AAC/Opus ----------
  let encA: AudioEncoder | null = null;
  await new Promise<void>((res, rej) => {
    try {
      encA = new AudioEncoder({
        // Mux audio saat keluar; jangan menampung semua chunk 40–60 menit di RAM.
        output: (c) => muxer.addAudioChunk(c),
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
    // 🌧️ v20.0 SUARA ALAM LATAR — volume sendiri, tidak ikut kompresi vokal
    if (o.ambience && o.ambience.jenis !== "off") {
      sambungAmbience(off, off.destination, o.ambience.jenis, o.ambience.gain, off0 + segStart, segDur, o.ambience.buf ?? null);
    }
    // 🎙️ v20.0 REVERB VOKAL — dry + wet paralel (ruang halus, bukan gema)
    if (o.vocalReverb && o.vocalReverb > 0.001) {
      const conv = off.createConvolver();
      conv.buffer = buatReverbIR(off, 1.1, 2.4);
      const wet = off.createGain(); wet.gain.value = Math.min(0.6, o.vocalReverb);
      input.connect(conv); conv.connect(wet); wet.connect(off.destination);
    }
    const rendered = await off.startRendering();
    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.getChannelData(1);
    // envelope fade global (diterapkan di PCM supaya konsisten antar segmen)
    const BLK = 8192;
    // 🎙️ v20.6 NOISE GATE — smoothing antar blok (naik/turun halus, tidak "klik")
    let gate = 1;
    const gateThr = o.noiseGate && o.noiseGate > 0 ? o.noiseGate : 0;
    for (let i = 0; i < len; i += BLK) {
      const n = Math.min(BLK, len - i);
      const data = new Float32Array(n * 2);
      if (gateThr > 0) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += ch0[i + j] * ch0[i + j] + ch1[i + j] * ch1[i + j];
        const rms = Math.sqrt(sum / (n * 2));
        const target = rms < gateThr ? 0 : 1;
        gate = gate * 0.8 + target * 0.2; // attack/release halus
      }
      for (let j = 0; j < n; j++) {
        const t = segStart + (i + j) / SR;
        let env = 1;
        if (o.fades) {
          if (t < 1.2) env = t / 1.2;
          const tail = dur - t;
          if (tail < 1.8) env = Math.min(env, Math.max(0, tail) / 1.8);
        }
        const g = gateThr > 0 ? gate : 1;
        data[j * 2] = ch0[i + j] * env * g;
        data[j * 2 + 1] = ch1[i + j] * env * g;
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
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d", { alpha: false })!;
  const bgCv = !!o.drawBg && !!o.drawDin ? document.createElement("canvas") : null;
  const bgCtx = bgCv ? bgCv.getContext("2d", { alpha: false })! : null;
  if (bgCv) { bgCv.width = cw; bgCv.height = ch; }
  // 🐛 v19.75: SKIP benchmark 60× drawScene (buang 1–3 dtk di HP). Pakai berlapis kalau tersedia.
  const pakaiLapis = !!o.drawBg && !!o.drawDin;


  const totalFrames = Math.round(dur * fps);
  const usPer = 1e6 / fps;
  let vCfg: EncodedVideoChunkMetadata["decoderConfig"] | undefined;
  const probed = await pilihConfigVideo(cw, ch, fps, bitrate);
  const encCfg: CfgVideoEnc = probed || {
    codec: "avc1.42001f", width: cw, height: ch, bitrate, framerate: fps, avc: { format: "avc" },
  };
  o.onInfo?.(`Encoder: ${encCfg.codec} ${cw}×${ch} @${fps}fps ${(bitrate / 1e6).toFixed(1)}Mbps hw=${encCfg.hardwareAcceleration || "?"} lat=${encCfg.latencyMode || "?"} lapis=${pakaiLapis}`);
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
      try {
        encV.configure(encCfg);
      } catch {
        // field hw/latency ditolak di beberapa Chrome Android — fallback Baseline polos
        encV.configure({
          codec: "avc1.42001f", width: cw, height: ch, bitrate, framerate: fps, avc: { format: "avc" },
        });
        o.onInfo?.("Encoder: fallback avc1.42001f (configure HW ditolak)");
      }
      res();
    } catch (e) { rej(e instanceof Error ? e : new Error(String(e))); }
  });

  const peaks = o.peaks || [];
  const freqBuf = o.freqFrames ? new Uint8Array(o.freqFrames.bins) : null;
  const visibel = () => (typeof document !== "undefined" ? document.visibilityState !== "hidden" : true);
  const kfSetiap = Math.max(24, fps * 2);
  for (let f = 0; f < totalFrames; f++) {
    const t = off0 + f / fps;
    // 🎛 v19.39 / v19.75: FFT asli + reuse buffer (jangan new Uint8Array tiap frame)
    const freq = o.freqFrames ? freqAt(o.freqFrames, t, freqBuf!) : (peaks.length ? synthBars(t, peaks) : null);
    if (pakaiLapis) {
      if (f % BG_EVERY === 0) o.drawBg!(bgCtx!, cw, ch, t, freq);
      ctx.drawImage(bgCv!, 0, 0);
      o.drawDin!(ctx, cw, ch, t, freq);
    } else {
      o.draw(ctx, cw, ch, t, freq);
    }
    const frame = new VideoFrame(cv, { timestamp: f * usPer, duration: usPer });
    encV!.encode(frame, { keyFrame: f % kfSetiap === 0 });
    frame.close();
    while (encV!.encodeQueueSize > 24) {
      await new Promise((r) => setTimeout(r, 8));
    }
    // 🐛 v19.75: yield lebih jarang (64 frame) — setTimeout(0) tiap 32 frame nahan encoder HW
    if ((f & 63) === 0) {
      o.onProg?.(0.15 + 0.83 * ((f + 1) / totalFrames));
      if (visibel()) await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encV!.flush();
  encV!.close();
  encV = null;

  // ---------- 3) GABUNG jadi MP4 ----------
  o.onFase?.("mux");
  muxer.finalize();
  if (o.fileSink) {
    // close() menunggu write() OPFS yang masih antre sebelum file dibaca kembali.
    await o.fileSink.stream.close();
    const file = await o.fileSink.getFile();
    o.onProg?.(1);
    return file;
  }
  const bytes = new Uint8Array((muxer.target as ArrayBufferTarget).buffer);
  o.onProg?.(1);
  return new Blob([bytes], { type: "video/mp4" });
}
