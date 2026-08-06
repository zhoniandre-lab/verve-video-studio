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
  /** AAC (default) atau Opus — dipilih otomatis dari cekRenderOfflineMampu */
  audioCodec?: "aac" | "opus";
  /** bitrate video (default 6 Mbps) */
  videoBitrate?: number;
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq: Uint8Array | null) => void;
  onProg?: (p: number) => void;
  onFase?: (fase: "audio" | "video" | "mux") => void;
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

const FPS = 30;
const SEG_AUDIO = 60; // detik per segmen offline (batasi memori HP)

/** Bar sintetis dari puncak audio asli — pengganti AnalyserNode saat render offline. */
export function synthBars(t: number, peaks: number[]): Uint8Array {
  const out = new Uint8Array(128);
  const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor(t / 0.25)));
  const base = peaks[idx] ?? 0.2;
  for (let i = 0; i < 128; i++) {
    let v = base * (0.55 + 0.45 * Math.sin(t * 6 + i * 0.25));
    v += (Math.random() - 0.5) * 0.06;
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
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { alpha: false })!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    audio: { codec: audioCodec === "opus" ? "opus" : "aac", sampleRate: SR, numberOfChannels: 2 },
    fastStart: "in-memory",
  });
  for (const c of audioChunks) muxer.addAudioChunk(c);
  audioChunks.length = 0;

  const totalFrames = Math.round(dur * FPS);
  const usPer = 1e6 / FPS;
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
        width: W, height: H,
        bitrate: o.videoBitrate || 6_000_000,
        framerate: FPS,
        avc: { format: "avc" },
      });
      res();
    } catch (e) { rej(e instanceof Error ? e : new Error(String(e))); }
  });

  const peaks = o.peaks || [];
  for (let f = 0; f < totalFrames; f++) {
    const t = off0 + f / FPS;
    o.draw(ctx, W, H, t, peaks.length ? synthBars(t, peaks) : null);
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
      await new Promise((r) => setTimeout(r, 0)); // napas buat UI
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
