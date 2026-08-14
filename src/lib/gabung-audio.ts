// 🧩 v19.49 GABUNG AUDIO CHUNKS (client-side) — TTS panjang dipecah server jadi beberapa MP3,
// digabung di browser jadi 1 WAV biar jadi 1 track narasi utuh. Tanpa ffmpeg, murni Web Audio.
export async function gabungChunksDataUrl(chunks: string[]): Promise<string> {
  if (!chunks || !chunks.length) throw new Error("Tidak ada potongan audio.");
  if (chunks.length === 1) return chunks[0];
  const AC: any = typeof window !== "undefined" && (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return chunks[0]; // fallback: pakai potongan pertama
  const actx: AudioContext = new AC();
  try {
    const bufs: AudioBuffer[] = [];
    for (const c of chunks) {
      const b64 = c.includes(",") ? c.split(",")[1] : c;
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const ab = arr.buffer;
      // coba decode; kalau gagal, skip potongan itu
      try {
        const buf = await actx.decodeAudioData(ab as ArrayBuffer);
        if (buf && buf.length > 0) bufs.push(buf);
      } catch { /* potongan rusak — lewati */ }
    }
    if (!bufs.length) return chunks[0];
    const sampleRate = bufs[0].sampleRate;
    const total = bufs.reduce((n, b) => n + b.length, 0);
    const ch = Math.max(1, Math.min(2, bufs[0].numberOfChannels));
    const out = actx.createBuffer(ch, total, sampleRate);
    let off = 0;
    for (const b of bufs) {
      for (let c = 0; c < ch; c++) {
        const src = b.numberOfChannels > c ? b.getChannelData(c) : b.getChannelData(0);
        out.getChannelData(c).set(src, off);
      }
      off += b.length;
    }
    const wav = bufferToWav(out);
    return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  } finally {
    try { actx.close(); } catch {}
  }
}

// WAV 16-bit PCM dari AudioBuffer (standar, diputar semua browser & bisa dirender offline)
export function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = Math.max(1, Math.min(2, buf.numberOfChannels));
  const sr = buf.sampleRate;
  const len = buf.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, len - 8, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true); v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, len - 44, true);
  let o = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return ab;
}

// 🧩 Gabung BEBERAPA URL audio berurutan (TTS potongan / rantai narasi).
// 🎵 v19.77: JANGAN pakai ini untuk hasil Suno — 2 URL = 2 VARIASI lagu utuh,
// bukan segmen. Menggabung = 1 file dua nada beda (±13 menit).
export async function gabungUrlAudio(urls: string[], proxify?: (u: string) => string): Promise<string> {
  if (!urls || !urls.length) throw new Error("Tidak ada segmen audio.");
  if (urls.length === 1) return urls[0];
  const AC: any = typeof window !== "undefined" && (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return urls[0];
  const actx: AudioContext = new AC();
  try {
    const bufs: AudioBuffer[] = [];
    for (const u of urls) {
      // 🐛 v19.63: coba LANGSUNG url asli dulu (banyak CDN kasih CORS *) — baru proxy
      const ambil = async (src: string): Promise<AudioBuffer | null> => {
        try {
          const r = await fetch(src);
          const ab = await r.arrayBuffer();
          if (!ab.byteLength) return null;
          const buf = await actx.decodeAudioData(ab);
          return buf && buf.length > 0 ? buf : null;
        } catch { return null; }
      };
      let buf = await ambil(u);
      if (!buf && proxify) buf = await ambil(proxify(u));
      if (buf) bufs.push(buf);
    }
    if (!bufs.length) return urls[0];
    const sampleRate = bufs[0].sampleRate;
    const total = bufs.reduce((n, b) => n + b.length, 0);
    const ch = Math.max(1, Math.min(2, bufs[0].numberOfChannels));
    const out = actx.createBuffer(ch, total, sampleRate);
    let off = 0;
    for (const b of bufs) {
      for (let c = 0; c < ch; c++) {
        const src = b.numberOfChannels > c ? b.getChannelData(c) : b.getChannelData(0);
        out.getChannelData(c).set(src, off);
      }
      off += b.length;
    }
    return URL.createObjectURL(new Blob([bufferToWav(out)], { type: "audio/wav" }));
  } finally {
    try { actx.close(); } catch {}
  }
}

/** 🎵 v19.86 UKUR DURASI REAL dari ISI file (decode seluruh frame), bukan dari
 *  header/metadata — header file provider sering BOHONG (mis. klaim 17:23
 *  padahal isi audio cuma 8:03). Dipakai supaya timeline/video durasinya
 *  sesuai lagu asli. TIDAK memotong/mengubah apa pun — cuma mengukur. */
export async function ukurDurasiReal(url: string, proxify?: (u: string) => string): Promise<number> {
  try {
    const cands = url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")
      ? [url]
      : [proxify ? proxify(url) : url, url];
    for (const c of cands) {
      try {
        const r = await fetch(c);
        if (!r.ok) continue;
        const ab = await r.arrayBuffer();
        if (!ab.byteLength) continue;
        const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        if (!AC) return 0;
        const ctx: AudioContext = new AC(1, 1, 44100);
        const buf = await ctx.decodeAudioData(ab.slice(0)).catch(() => null);
        try { ctx.close(); } catch {}
        if (buf && buf.length) return buf.duration;
      } catch { continue; }
    }
    return 0;
  } catch { return 0; }
}

/** 🎵 v19.87 BUAT WAV PREVIEW dari AudioBuffer hasil decode — DURASI PAS ISI.
 *  ⚠️ BUG LAMA (v19.81-86): createBuffer(1, buf.length, 22050) — buf.length
 *  dalam sample rate ASLI (44100) → durasi jadi DOBEL (18,4 jt sampel @22050
 *  = 13:54 padahal isi 6:57) + ekor senyap dari sampel terakhir. Sekarang
 *  panjang dihitung dari DURASI × rate tujuan: round(dur × rate). Tidak ada
 *  pemotongan — isi utuh, cuma durasi yang benar. Fallback rate lebih rendah
 *  kalau memori HP sempit. Mengembalikan null kalau semua gagal. */
export function wavDariBuffer(buf: AudioBuffer, ctx: AudioContext, preferRate = 22050): { url: string; dur: number } | null {
  if (!buf || !buf.length) return null;
  const rates = [preferRate, 16000, 12000].filter((r) => r <= buf.sampleRate);
  for (const rate of rates) {
    try {
      const outLen = Math.max(1, Math.round(buf.duration * rate));
      const mono = ctx.createBuffer(1, outLen, rate);
      const src = buf.getChannelData(0), dst = mono.getChannelData(0);
      const step = buf.sampleRate / rate;
      for (let i = 0; i < outLen; i++) dst[i] = src[Math.min(src.length - 1, Math.floor(i * step))];
      return { url: URL.createObjectURL(new Blob([bufferToWav(mono)], { type: "audio/wav" })), dur: buf.duration };
    } catch { /* coba rate lebih rendah */ }
  }
  return null;
}

/** 🎵 v19.87 UKUR DURASI REAL + BUAT WAV PREVIEW SEKALIGUS (satu fetch, satu decode).
 *  Dipakai Lahan biar player & angka durasi konsisten (isi file, bukan header
 *  yang bisa bohong 15:06 padahal isi 6:57). TIDAK memotong apa pun. */
export async function ukurDanPreviewWav(url: string, proxify?: (u: string) => string): Promise<{ dur: number; previewUrl: string } | null> {
  try {
    const cands = url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")
      ? [url]
      : [proxify ? proxify(url) : url, url];
    let ab: ArrayBuffer | null = null;
    for (const c of cands) {
      try {
        const r = await fetch(c);
        if (!r.ok) continue;
        ab = await r.arrayBuffer();
        if (ab && ab.byteLength) break;
      } catch { continue; }
    }
    if (!ab) return null;
    const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AC) return null;
    const ctx: AudioContext = new AC(1, 1, 44100);
    const buf = await ctx.decodeAudioData(ab.slice(0)).catch(() => null);
    if (!buf || !buf.length) { try { ctx.close(); } catch {} return null; }
    const w = wavDariBuffer(buf, ctx);
    try { ctx.close(); } catch {}
    if (!w) return null;
    return { dur: buf.duration, previewUrl: w.url };
  } catch { return null; }
}
