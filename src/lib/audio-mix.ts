/* =====================================================================
   AUDIO MIX PANJANG (client-only)
   ---------------------------------------------------------------------
   Menggabungkan beberapa klip AudioBuffer menjadi MP4 audio/AAC secara lokal.
   Tidak memanggil provider dan tidak memakai kredit tambahan.

   Catatan desain:
   - Klip AI tetap dibuat satu per satu oleh provider.
   - Mix lokal memakai crossfade equal-power sederhana.
   - Audio diproses per blok, bukan dibuat sebagai AudioBuffer 40–60 menit,
     supaya memori lebih aman di browser.
   ===================================================================== */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

export type MixAudioSource = {
  buffer: AudioBuffer;
  title?: string;
};

export type MixProgress = (progress: number, message?: string) => void;

type MixSegment = {
  source: MixAudioSource;
  start: number;
  end: number;
};

function sampleAt(buffer: AudioBuffer, channel: number, seconds: number): number {
  const data = buffer.getChannelData(Math.min(channel, Math.max(0, buffer.numberOfChannels - 1)));
  if (!data.length || !isFinite(seconds)) return 0;
  const position = Math.max(0, Math.min(buffer.duration * buffer.sampleRate - 1, seconds * buffer.sampleRate));
  const left = Math.floor(position);
  const right = Math.min(data.length - 1, left + 1);
  const fraction = position - left;
  return (data[left] || 0) * (1 - fraction) + (data[right] || 0) * fraction;
}

function pauseForBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Membuat mix audio target 40–60 menit dari klip yang sudah jadi.
 * Hanya klip yang sudah dipilih user yang dipakai; tidak ada request AI baru.
 * WebCodecs AAC + mp4-muxer dipakai agar file tetap kecil dan bisa diunduh
 * tanpa WAV raksasa.
 */
export async function mixAudioBuffersToMp4(
  sources: MixAudioSource[],
  targetSeconds: number,
  onProgress?: MixProgress,
): Promise<Blob> {
  const usable = sources.filter((source) => source?.buffer && source.buffer.duration > 0.5);
  if (!usable.length) throw new Error("Belum ada klip audio yang bisa digabung.");
  if (typeof window === "undefined" || !(window as any).AudioEncoder || !(window as any).AudioData) {
    throw new Error("Browser belum mendukung encoder audio lokal. Gunakan Chrome/Edge terbaru untuk membuat mix panjang.");
  }

  const target = Math.max(30, Math.min(60 * 60, Math.round(Number(targetSeconds) || 0)));
  // 44.1 kHz AAC didukung luas oleh browser dan platform video.
  const sampleRate = 44_100;
  const channels = 2;
  const bitrate = 128_000;
  const crossfade = Math.min(5, Math.max(1.5, ...usable.map((source) => Math.min(5, source.buffer.duration / 4))));
  const segments: MixSegment[] = [];
  let cursor = 0;
  let index = 0;

  // Buat timeline berulang dari klip yang dipilih. Durasi final tetap target;
  // bagian paling akhir otomatis dipotong.
  while (cursor < target + 0.01) {
    const source = usable[index % usable.length];
    const duration = Math.max(0.6, source.buffer.duration);
    const start = cursor;
    const end = Math.min(target + crossfade, start + duration);
    segments.push({ source, start, end });
    const advance = Math.max(0.5, duration - Math.min(crossfade, duration / 3));
    cursor += advance;
    index++;
    // Guard terhadap file metadata yang rusak.
    if (index > 10_000) break;
  }

  const targetBuffer = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: targetBuffer,
    audio: { codec: "aac", sampleRate, numberOfChannels: channels },
    fastStart: "in-memory",
  });
  const AudioEncoderCtor = (window as any).AudioEncoder as typeof AudioEncoder;
  const AudioDataCtor = (window as any).AudioData as typeof AudioData;
  const audioChunks: EncodedAudioChunk[] = [];
  let encoder: AudioEncoder | null = null;
  let encoderError: Error | null = null;

  try {
    encoder = new AudioEncoderCtor({
      output: (chunk) => audioChunks.push(chunk),
      error: (error: DOMException) => { encoderError = error instanceof Error ? error : new Error(String(error)); },
    });
    encoder.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate });
  } catch (error) {
    throw new Error(`Encoder AAC tidak tersedia: ${String((error as Error)?.message || error)}`);
  }

  const chunkFrames = 1152 * 8;
  const totalFrames = Math.ceil(target * sampleRate);
  let segmentIndex = 0;
  let processed = 0;
  let lastYield = 0;

  try {
    for (let frameStart = 0; frameStart < totalFrames; frameStart += chunkFrames) {
      const frameCount = Math.min(chunkFrames, totalFrames - frameStart);
      const interleaved = new Float32Array(frameCount * channels);

      for (let i = 0; i < frameCount; i++) {
        const frame = frameStart + i;
        const time = frame / sampleRate;
        while (segmentIndex + 1 < segments.length && time >= segments[segmentIndex + 1].start) segmentIndex++;
        const current = segments[segmentIndex] || segments[segments.length - 1];
        if (!current) continue;

        let left = sampleAt(current.source.buffer, 0, time - current.start);
        let right = sampleAt(current.source.buffer, current.source.buffer.numberOfChannels > 1 ? 1 : 0, time - current.start);

        // Saat dua klip bertumpuk, gunakan equal-power crossfade agar volume tidak
        // jatuh di tengah transisi.
        if (segmentIndex > 0) {
          const previous = segments[segmentIndex - 1];
          if (time < previous.end) {
            const overlap = Math.max(0.05, previous.end - current.start);
            const alpha = Math.max(0, Math.min(1, (time - current.start) / overlap));
            const oldGain = Math.cos(alpha * Math.PI / 2);
            const newGain = Math.sin(alpha * Math.PI / 2);
            const oldLeft = sampleAt(previous.source.buffer, 0, time - previous.start);
            const oldRight = sampleAt(previous.source.buffer, previous.source.buffer.numberOfChannels > 1 ? 1 : 0, time - previous.start);
            left = oldLeft * oldGain + left * newGain;
            right = oldRight * oldGain + right * newGain;
          }
        }

        // Fade-out sangat pendek di ujung file agar tidak terdengar klik.
        const tail = target - time;
        if (tail < 0.08) {
          const fade = Math.max(0, tail / 0.08);
          left *= fade;
          right *= fade;
        }
        interleaved[i * 2] = Math.max(-1, Math.min(1, left));
        interleaved[i * 2 + 1] = Math.max(-1, Math.min(1, right));
      }

      const audioData = new AudioDataCtor({
        format: "f32",
        sampleRate,
        numberOfFrames: frameCount,
        numberOfChannels: channels,
        timestamp: Math.round((frameStart / sampleRate) * 1e6),
        data: interleaved,
      });
      while (encoder.encodeQueueSize > 40) await new Promise((resolve) => setTimeout(resolve, 10));
      encoder.encode(audioData);
      audioData.close();
      if (encoderError) throw encoderError;

      processed += frameCount;
      const progress = Math.min(1, processed / totalFrames);
      onProgress?.(progress, `Menyusun audio lokal… ${Math.round(progress * 100)}%`);
      if (performance.now() - lastYield > 120) {
        lastYield = performance.now();
        await pauseForBrowser();
      }
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
    encoder.close();
    encoder = null;

    for (const chunk of audioChunks) muxer.addAudioChunk(chunk);
    muxer.finalize();
    onProgress?.(1, "Mix audio selesai.");
    const bytes = new Uint8Array(targetBuffer.buffer);
    return new Blob([bytes], { type: "audio/mp4" });
  } finally {
    try { encoder?.close(); } catch { /* abaikan */ }
  }
}
