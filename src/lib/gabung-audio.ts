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

/* =====================================================================
   ✂️ v19.82 PEMANGKAS SENYAP — lagu provider jadi panjang 11-12 menit
   padahal isinya cuma ±5 menit (ekor senyap / gabungan segmen kosong).
   Cari jangkauan yang BENAR-BENAR bersuara → sisanya dibuang.
   ===================================================================== */

/** Deteksi jangkauan audio yang bersuara (MURNI, bisa dites di Node).
 *  channels = kumpulan kanal PCM (Float32), sr = sample rate.
 *  Scanning pakai jendela 50 ms, ambang = |sampel| ≥ ambang (default 0.004 ≈ -48 dB).
 *  → { mulai, akhir } = indeks sampel pertama & terakhir yang bersuara. */
export function cariJangkauanAudio(channels: Float32Array[], sr: number, ambang = 0.004): { mulai: number; akhir: number } {
  const n = channels.length && channels[0] ? channels[0].length : 0;
  if (!n || !sr || !Number.isFinite(sr)) return { mulai: 0, akhir: n };
  const win = Math.max(1, Math.round(sr * 0.05));
  const puncak = (i: number): number => {
    let p = 0;
    for (let j = 0; j < win; j++) {
      const s = i + j;
      if (s >= n) break;
      for (let c = 0; c < channels.length; c++) {
        const v = Math.abs(channels[c][s]);
        if (v > p) p = v;
      }
    }
    return p;
  };
  let mulai = 0;
  for (let i = 0; i + win <= n; i += win) { if (puncak(i) >= ambang) { mulai = i; break; } }
  let akhir = n;
  for (let i = n - win; i >= 0; i -= win) { if (puncak(i) >= ambang) { akhir = i + win; break; } }
  return { mulai, akhir };
}

/** Potong AudioBuffer ke jangkauan bersuara (kanal & sample rate TETAP).
 *  Ekor senyap > ekorMin (default 8 dtk) / depan senyap > depanMin (default 3 dtk)
 *  baru dipangkas — kalau tidak, buffer asli dikembalikan apa adanya.
 *  → { bufBaru, mulai, akhir, dipangkas, alasan } */
export function potongBuffer(
  buf: AudioBuffer,
  ctx: AudioContext,
  opts?: { ambang?: number; ekorMin?: number; depanMin?: number }
): { bufBaru: AudioBuffer; mulai: number; akhir: number; dipangkas: boolean; alasan?: string } {
  const ambang = opts?.ambang ?? 0.004;
  const ekorMin = opts?.ekorMin ?? 8;
  const depanMin = opts?.depanMin ?? 3;
  const chs: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c));
  const { mulai, akhir } = cariJangkauanAudio(chs, buf.sampleRate, ambang);
  const ekor = (buf.length - akhir) / buf.sampleRate;
  const depan = mulai / buf.sampleRate;
  if (ekor <= ekorMin && depan <= depanMin) return { bufBaru: buf, mulai, akhir, dipangkas: false };
  const from = Math.max(0, mulai - (depan > depanMin ? Math.round(0.4 * buf.sampleRate) : 0));
  const to = Math.min(buf.length, akhir + (ekor > ekorMin ? Math.round(0.6 * buf.sampleRate) : 0));
  const len = Math.max(1024, to - from);
  const baru = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    baru.getChannelData(c).set(buf.getChannelData(c).subarray(from, from + len));
  }
  return {
    bufBaru: baru, mulai: from, akhir: from + len, dipangkas: true,
    alasan: ekor > ekorMin ? `ekor senyap ${ekor.toFixed(0)} dtk` : `depan senyap ${depan.toFixed(0)} dtk`,
  };
}

/** 🎵 v19.83 UKUR DURASI ISI (bukan durasi file).
 *  File provider sering panjang 11-12 menit padahal lagunya cuma ±5 menit
 *  (ekor senyap). Angka yang dipakai timeline/render HARUS durasi isi,
 *  biar "kalau lagu 5 menit ya 5 menit". File TIDAK diubah — cuma diukur.
 *  Proxify: fungsi pembungkus URL (mis. /api/hcnsec/proxy-audio?url=) —
 *  blob:/data: dipakai langsung. */
export async function ukurDurasiIsi(url: string, proxify?: (u: string) => string): Promise<{ dur: number; asliDur: number; dipangkas: boolean }> {
  try {
    const fetchSrc = (u: string) => fetch(u);
    const coba = async (u: string): Promise<ArrayBuffer | null> => {
      try {
        const r = await fetchSrc(u);
        if (!r.ok) return null;
        const ab = await r.arrayBuffer();
        return ab && ab.byteLength ? ab : null;
      } catch { return null; }
    };
    let ab = url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")
      ? await coba(url)
      : (await coba(url)) || (proxify ? await coba(proxify(url)) : null);
    if (!ab) return { dur: 0, asliDur: 0, dipangkas: false };
    const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AC) return { dur: 0, asliDur: 0, dipangkas: false };
    const ctx: AudioContext = new AC(1, 1, 44100);
    const buf: AudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        const p = (ctx as any).decodeAudioData(ab!.slice(0), resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      } catch (e) { reject(e); }
    }).catch(() => null as any);
    try { ctx.close(); } catch {}
    if (!buf || !buf.length) return { dur: 0, asliDur: 0, dipangkas: false };
    const asliDur = buf.duration;
    const chs: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c));
    const { mulai, akhir } = cariJangkauanAudio(chs, buf.sampleRate, 0.004);
    const dur = (akhir - mulai) / buf.sampleRate;
    const ekor = (buf.length - akhir) / buf.sampleRate;
    const depan = mulai / buf.sampleRate;
    if (!(dur > 0.5)) return { dur: asliDur, asliDur, dipangkas: false };
    if (ekor > 8 || depan > 3) return { dur, asliDur, dipangkas: true };
    return { dur: asliDur, asliDur, dipangkas: false };
  } catch { return { dur: 0, asliDur: 0, dipangkas: false }; }
}
