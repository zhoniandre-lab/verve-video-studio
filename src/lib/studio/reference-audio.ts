/* =====================================================================
   VERVE Studio — audio reference helpers
   - Video/audio/voice memo -> WAV reference suitable for music APIs
   - Record voice/melody from the microphone
   - Browser-only; no server secret is handled here
   ===================================================================== */

export type ReferenceProgress = (progress: number) => void;

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(file.name || "");
}

function chooseAudioMime(): string {
  const MediaRecorderCtor = (window as any).MediaRecorder;
  if (!MediaRecorderCtor?.isTypeSupported) return "";
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorderCtor.isTypeSupported(mime)) return mime;
  }
  return "";
}

function wavHeader(view: DataView, frames: number, channels: number, sampleRate: number): void {
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  const bytes = frames * channels * 2;
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data");
  view.setUint32(40, bytes, true);
}

function pcm16(value: number): number {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  return v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
}

export function audioBufferToWavFile(buffer: AudioBuffer, start = 0, end = buffer.duration, name = "reference"): File {
  // Mono 16 kHz cukup untuk membaca melodi/voice, sekaligus menjaga file
  // referensi tetap kecil agar aman melewati batas upload serverless HP.
  const targetRate = 16_000;
  const safeStart = Math.max(0, Math.min(Number(start) || 0, buffer.duration));
  const safeEnd = Math.max(safeStart + 0.05, Math.min(Number(end) || buffer.duration, buffer.duration));
  const frames = Math.max(1, Math.ceil((safeEnd - safeStart) * targetRate));
  const raw = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(raw);
  wavHeader(view, frames, 1, targetRate);
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let frame = 0; frame < frames; frame++) {
    const sourcePosition = (safeStart + frame / targetRate) * buffer.sampleRate;
    const left = Math.floor(sourcePosition);
    const right = Math.min(buffer.length - 1, left + 1);
    const fraction = sourcePosition - left;
    let mixed = 0;
    for (let channel = 0; channel < channels; channel++) {
      const samples = data[channel];
      mixed += ((samples[left] || 0) * (1 - fraction)) + ((samples[right] || 0) * fraction);
    }
    view.setInt16(44 + frame * 2, pcm16(mixed / channels), true);
  }
  const safeName = name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "reference";
  return new File([raw], `${safeName}.wav`, { type: "audio/wav" });
}

async function decodeBlobToWav(blob: Blob, name: string, start = 0, end?: number): Promise<File> {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error("Browser ini belum mendukung Web Audio untuk membaca referensi.");
  const context = new Ctor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    return audioBufferToWavFile(decoded, start, end ?? decoded.duration, name);
  } catch {
    throw new Error("Audio referensi tidak bisa dibaca. Gunakan MP3/WAV atau rekam ulang dengan suara yang jelas.");
  } finally {
    try { await context.close(); } catch { /* abaikan */ }
  }
}

export async function mediaDuration(file: File): Promise<number> {
  if (typeof window === "undefined") return 0;
  const url = URL.createObjectURL(file);
  const media = document.createElement(isVideoFile(file) ? "video" : "audio");
  media.preload = "metadata";
  media.src = url;
  try {
    return await new Promise<number>((resolve) => {
      const timer = window.setTimeout(() => resolve(0), 8000);
      media.onloadedmetadata = () => { window.clearTimeout(timer); resolve(Number.isFinite(media.duration) ? media.duration : 0); };
      media.onerror = () => { window.clearTimeout(timer); resolve(0); };
    });
  } finally {
    media.removeAttribute("src");
    try { media.load(); } catch { /* abaikan */ }
    URL.revokeObjectURL(url);
  }
}

/** Extract the first maxSeconds of a local video's audio without sending video bytes to a provider. */
export async function extractVideoAudio(file: File, maxSeconds = 60, onProgress?: ReferenceProgress): Promise<File> {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder === "undefined") {
    throw new Error("Browser ini belum mendukung rekam audio dari video.");
  }
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;
  video.volume = 1;
  video.src = objectUrl;
  let context: AudioContext | null = null;
  let captured: MediaStream | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca browser."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : maxSeconds;
    const limit = Math.max(0.5, Math.min(maxSeconds, duration));
    let stream: MediaStream | null = null;
    const Ctor = audioContextCtor();
    if (Ctor) {
      try {
        context = new Ctor();
        await context.resume().catch(() => {});
        const source = context.createMediaElementSource(video);
        const destination = context.createMediaStreamDestination();
        source.connect(destination);
        stream = destination.stream;
      } catch {
        try { await context?.close(); } catch { /* abaikan */ }
        context = null;
      }
    }
    if (!stream) {
      const capture = (video as any).captureStream || (video as any).mozCaptureStream;
      if (typeof capture !== "function") throw new Error("Browser ini belum mendukung ekstraksi video. Upload audio MP3/WAV sebagai gantinya.");
      captured = capture.call(video) as MediaStream;
      stream = new MediaStream(captured.getAudioTracks());
    }
    if (!stream.getAudioTracks().length) throw new Error("Video ini tidak memiliki audio.");
    const mime = chooseAudioMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    return await new Promise<File>((resolve, reject) => {
      const chunks: Blob[] = [];
      let done = false;
      let stopping = false;
      let timer: number | null = null;
      const clean = () => {
        if (timer !== null) window.clearTimeout(timer);
        stream?.getTracks().forEach((track) => track.stop());
      };
      const stopRecording = () => {
        if (done || stopping) return;
        stopping = true;
        try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* abaikan */ }
      };
      timer = window.setTimeout(() => {
        if (done) return;
        stopRecording();
        done = true;
        clean();
        reject(new Error("Mengambil audio dari video terlalu lama."));
      }, Math.max(30_000, limit * 1000 + 20_000));
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (done) return;
        done = true; clean(); reject(new Error("Gagal mengambil audio dari video."));
      };
      recorder.onstop = async () => {
        if (done) return;
        done = true;
        clean();
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
          if (!blob.size) throw new Error("Audio video kosong.");
          resolve(await decodeBlobToWav(blob, file.name, 0, limit));
        } catch (error) { reject(error); }
      };
      video.ontimeupdate = () => {
        onProgress?.(Math.min(1, video.currentTime / limit));
        if (video.currentTime >= limit - 0.08) stopRecording();
      };
      video.onended = stopRecording;
      recorder.start(250);
      void video.play().catch(() => {
        if (done) return;
        done = true; clean();
        try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* abaikan */ }
        reject(new Error("Video tidak dapat diputar untuk mengambil audionya."));
      });
    });
  } finally {
    video.pause();
    captured?.getTracks().forEach((track) => track.stop());
    try { await context?.close(); } catch { /* abaikan */ }
    video.removeAttribute("src");
    try { video.load(); } catch { /* abaikan */ }
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareReferenceAudio(file: File, start = 0, end = 30, onProgress?: ReferenceProgress): Promise<File> {
  const source = isVideoFile(file) ? await extractVideoAudio(file, Math.min(60, Math.max(0.5, end)), onProgress) : file;
  const duration = await mediaDuration(source);
  const clippedEnd = Math.min(Math.max(start + 0.5, end), duration || end);
  return decodeBlobToWav(source, file.name, start, clippedEnd);
}

export async function recordReferenceAudio(maxSeconds = 30, onProgress?: ReferenceProgress): Promise<File> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof (window as any).MediaRecorder === "undefined") {
    throw new Error("Browser ini belum bisa merekam mikrofon. Gunakan upload audio/video.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const mime = chooseAudioMime();
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  return await new Promise<File>((resolve, reject) => {
    const chunks: Blob[] = [];
    let elapsed = 0;
    let timer: number | null = null;
    let settled = false;
    const clean = () => {
      if (timer !== null) window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
    };
    const stop = () => { try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* abaikan */ } };
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => { if (!settled) { settled = true; clean(); reject(new Error("Gagal merekam suara.")); } };
    recorder.onstop = async () => {
      if (settled) return;
      settled = true; clean();
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
        if (!blob.size) throw new Error("Rekaman kosong.");
        resolve(await decodeBlobToWav(blob, "voice-reference", 0, maxSeconds));
      } catch (error) { reject(error); }
    };
    recorder.start(250);
    timer = window.setInterval(() => {
      elapsed += 0.25;
      onProgress?.(Math.min(1, elapsed / maxSeconds));
      if (elapsed >= maxSeconds) stop();
    }, 250);
  });
}
