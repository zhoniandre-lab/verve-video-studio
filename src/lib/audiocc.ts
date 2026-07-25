// ✂️📦 AUDIOPOTONG WHISPER (v13.22) — pintu lagu BESAR (di atas pagar unggah server ±4,5MB).
// Cerita: lagu 4–5 menit dari HP (Suno dll) = 5–8MB → kena pagar unggah server → klien lama
// terpaksa MENDENGARKAN lagu realtime (1× durasi lagu, lama!). Solusi: decode SEKALI di HP →
// suarakan ulang mono 16kHz (telinga asli Whisper) → potong per ±100 detik → tiap potong jadi
// WAV PCM16 ±3,2MB (aman di bawah pagar) → unggah berurutan → satukan kata & segmen dengan
// tambahan waktu mulai potongnya. Lagu 4:31 jadi ±3 potong — tetap hitungan DETIK, bukan 4:31.
// 100% kode asli VERVE. Uji murni: tests/wavpotong.test.mjs (wajib lulus sebelum release).

export const WHISPER_RATE = 16000;            // Hz — frekuensi telinga asli Whisper
export const WHISPER_CHUNK_SEC = 100;         // detik per potongan unggahan
export const WHISPER_MAX_UNGGAH = 4_200_000;  // byte — pagar aman kita (di bawah batas Vercel ±4,5MB)

/** Berapa byte file WAV PCM16 mono untuk n sampel (44 byte tajuk + 2 byte per sampel). */
export function byteWav(nSampel: number): number { return 44 + Math.max(0, nSampel) * 2; }

/** Rencana potongan menutup SELURUH durasi tanpa tumpang-tindih: [{idx,start,dur}]. */
export function rencanaChunk(durTotal: number, chunkSec: number = WHISPER_CHUNK_SEC): { idx: number; start: number; dur: number }[] {
  if (!(durTotal > 0) || !(chunkSec > 0)) return [];
  const n = Math.ceil(durTotal / chunkSec);
  const out: { idx: number; start: number; dur: number }[] = [];
  for (let i = 0; i < n; i++) {
    const start = i * chunkSec;
    out.push({ idx: i, start, dur: Math.min(chunkSec, durTotal - start) });
  }
  return out;
}

/** Float32 [-1,1] → PCM16 dengan jepit keras (tak pernah melimpah). */
export function floatKePcm16(x: number): number {
  const s = x < -1 ? -1 : x > 1 ? 1 : x;
  return Math.round(s < 0 ? s * 32768 : s * 32767);
}

/** Tulis tajuk WAV 44 byte ke DataView (RIFF/WAVE fmt PCM16 mono). */
export function isiHeaderWav(dv: DataView, nSampel: number, rate: number = WHISPER_RATE): void {
  const tulisAscii = (pos: number, teks: string) => { for (let i = 0; i < teks.length; i++) dv.setUint8(pos + i, teks.charCodeAt(i)); };
  const ukuranData = nSampel * 2;
  tulisAscii(0, "RIFF"); dv.setUint32(4, 36 + ukuranData, true);
  tulisAscii(8, "WAVE"); tulisAscii(12, "fmt ");
  dv.setUint32(16, 16, true);       // ukuran blok fmt
  dv.setUint16(20, 1, true);        // format PCM
  dv.setUint16(22, 1, true);        // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); // byte per detik (PCM16 mono)
  dv.setUint16(32, 2, true);        // byte per frame
  dv.setUint16(34, 16, true);       // bit per sampel
  tulisAscii(36, "data"); dv.setUint32(40, ukuranData, true);
}
// ===== LOG KLINIS (v13.25) — bukti langkah demi langkah DI HP PENGGUNA, bukan nebak dari jauh. =====
export const CC_DIAG_KUNCI = "verve_cc_diag_v1";
export const CC_DIAG_MAKS = 90;

/** Satu baris log rapi: "+12.3s ✅ teks" (waktu dijepit ≥0, teks maks 140 huruf). */
export function diagGaris(dtMs: number, ikon: string, teks: string): string {
  const dtk = (Math.max(0, dtMs) / 1000).toFixed(1);
  const isi = String(teks || "").slice(0, 140);
  return `+${dtk}s ${ikon} ${isi}`;
}

// ✂️[[BATAS_UJI_MURNI]] — fungsi di atas MURNI (diuji Node); di bawah butuh browser (Blob/WebAudio/fetch).

/** 🔬 Sesi log baru (dipanggil tiap klik "Buat keterangan"). */
export function ccDiagMulai(jalur: string, info: string): void {
  try { localStorage.setItem(CC_DIAG_KUNCI, JSON.stringify({ t0: Date.now(), jalur, lines: [diagGaris(0, "🎬", info)] })); } catch { /* diam */ }
}

/** 🔬 Tambah satu baris ke log (ring maks CC_DIAG_MAKS — yang terlama dibuang). */
export function ccDiag(ikon: string, teks: string): void {
  try {
    const mentah = localStorage.getItem(CC_DIAG_KUNCI); if (!mentah) return;
    const s = JSON.parse(mentah); const lines: string[] = Array.isArray(s.lines) ? s.lines : [];
    lines.push(diagGaris(Date.now() - (Number(s.t0) || Date.now()), ikon, teks));
    while (lines.length > CC_DIAG_MAKS) lines.shift();
    s.lines = lines; localStorage.setItem(CC_DIAG_KUNCI, JSON.stringify(s));
  } catch { /* diam */ }
}

/** 🔬 Baca log untuk panel: [judul, ...baris] (kosong bila belum ada). */
export function ccDiagBaca(): string[] {
  try {
    const mentah = localStorage.getItem(CC_DIAG_KUNCI); if (!mentah) return [];
    const s = JSON.parse(mentah);
    const lines: string[] = Array.isArray(s.lines) ? s.lines : [];
    return [`🔬 LOG KLINIS · jalur "${s.jalur || "?"}" · ${lines.length} langkah · FOTO/salin ini kirim ke bro`, ...lines];
  } catch { return []; }
}

/** Rangkai blob WAV PCM16 mono dari irisan Float32Array [mulai, mulai+jumlah). */
export function wavDariPcm16(pcm: Float32Array, mulai: number, jumlah: number, rate: number = WHISPER_RATE): Blob {
  const n = Math.max(0, Math.min(jumlah, pcm.length - mulai));
  const ab = new ArrayBuffer(byteWav(n));
  const dv = new DataView(ab);
  isiHeaderWav(dv, n, rate);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, floatKePcm16(pcm[mulai + i] || 0), true);
  return new Blob([ab], { type: "audio/wav" });
}

/** Decode lagu SEKALI (dibuka, BUKAN didengarkan!) → sampel mono 16kHz siap potong. */
export async function decodeMono16k(b: Blob): Promise<Float32Array> {
  const ab = await b.arrayBuffer();
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error("WebAudio tak ada di peramban ini");
  const actx: AudioContext = new AC();
  try {
    const asli = await actx.decodeAudioData(ab);
    const frames = Math.max(1, Math.ceil(asli.duration * WHISPER_RATE));
    const off = new OfflineAudioContext(1, frames, WHISPER_RATE);
    const src = off.createBufferSource(); src.buffer = asli; src.connect(off.destination); src.start(0);
    const hasil = await off.startRendering();
    return hasil.getChannelData(0).slice();
  } finally { try { await actx.close(); } catch { /* diam */ } }
}

/** Lagu besar → potong WAV 16kHz → unggah BERURUTAN ke /api/hcnsec/transcribe →
 *  kata & segmen disatukan dengan tambahan waktu mulai potongnya. Tetap detik, bukan realtime. */
export async function transcribeBlobBesar(
  b: Blob, hint = "", lang = "", onTahap?: (msg: string) => void,
): Promise<any | null> {
  const tD0 = Date.now();
  let pcm: Float32Array;
  try {
    onTahap?.("🎼 Lagu dibaca di HP (dibuka, BUKAN didengarkan)...");
    pcm = await decodeMono16k(b);
    ccDiag("🎼", `lagu terbuka ${(pcm.length / WHISPER_RATE).toFixed(1)} detik → mono 16kHz · ${Date.now() - tD0}ms`);
  } catch {
    ccDiag("💥", `decode GAGAL · ${Date.now() - tD0}ms (format tak dikenal / memori HP habis)`);
    return { ok: false, error: "lagu tak bisa dibuka di HP ini (format tak dikenal / memori HP habis)" };
  }
  const potong = rencanaChunk(pcm.length / WHISPER_RATE);
  if (!potong.length) return { ok: false, error: "lagu kosong setelah dibaca" };
  ccDiag("✂️", `rencana ${potong.length} potong, maks ${WHISPER_CHUNK_SEC} detik/potong (±${(byteWav(WHISPER_CHUNK_SEC * WHISPER_RATE) / 1e6).toFixed(1)}MB)`);
  const words: any[] = []; const segments: any[] = []; const texts: string[] = [];
  let engine = "";
  for (const c of potong) {
    onTahap?.(`📦 Lagu besar — AI membaca bagian ${c.idx + 1}/${potong.length} (tetap hitungan detik)...`);
    const wav = wavDariPcm16(pcm, Math.round(c.start * WHISPER_RATE), Math.round(c.dur * WHISPER_RATE));
    const fd = new FormData();
    fd.append("file", wav, `bagian-${c.idx + 1}.wav`);
    if (hint) fd.append("hint", hint);
    if (lang) fd.append("lang", lang);
    ccDiag("📦", `unggah bagian ${c.idx + 1}/${potong.length} (${(wav.size / 1e6).toFixed(2)}MB)...`);
    const tC0 = Date.now();
    let j: any = null; let salahTerakhir = ""; let kaliCoba = 1;
    for (let coba = 0; coba < 2 && !j?.ok; coba++) { // 🔁 v13.23: sekali coba-ulang otomatis — jaringan HP goyang ≠ gagal total
      kaliCoba = coba + 1;
      if (coba) { onTahap?.(`🔁 Bagian ${c.idx + 1}/${potong.length} mencoba ulang sekali lagi...`); await new Promise((r) => setTimeout(r, 2000)); }
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 150_000); // 🕰️ v13.25: upload 4G lambat butuh napas
      try {
        const r = await fetch("/api/hcnsec/transcribe", { method: "POST", body: fd, signal: ctl.signal });
        j = await r.json().catch(() => null);
      } catch { j = null; }
      finally { clearTimeout(to); }
      if (!j?.ok) salahTerakhir = String(j?.error || "AI tak terjangkau (jaringan)");
    }
    if (j?.ok) ccDiag("✅", `bagian ${c.idx + 1}/${potong.length} BERES · ${Array.isArray(j.words) ? j.words.length : 0} kata · ${Date.now() - tC0}ms · ${j.engine || "?"}`);
    else ccDiag("❌", `bagian ${c.idx + 1}/${potong.length} GAGAL ${kaliCoba}× · ${Date.now() - tC0}ms`);
    // 🛑 v13.23: unggahan potongan gagal == gangguan sesaat → janganDengar (klien JANGAN lempar ke pendengar realtime)
    if (!j?.ok) return { ok: false, janganDengar: true, error: `bagian ${c.idx + 1}/${potong.length} gagal ${kaliCoba}× (${salahTerakhir.slice(0, 70)})` };
    for (const w of Array.isArray(j.words) ? j.words : []) words.push({ w: String(w?.w || ""), start: (Number(w?.start) || 0) + c.start, end: (Number(w?.end) || 0) + c.start });
    for (const s of Array.isArray(j.segments) ? j.segments : []) segments.push({ text: String(s?.text || ""), start: (Number(s?.start) || 0) + c.start, end: (Number(s?.end) || 0) + c.start });
    if (j.text) texts.push(String(j.text).trim());
    if (!engine && j.engine) engine = String(j.engine);
  }
  ccDiag("🧷", `gabungan ${potong.length} potong → ${words.length} kata, ${segments.length} segmen`);
  return { ok: true, words, segments, text: texts.filter(Boolean).join(" ").trim(), engine: engine ? `${engine} · ${potong.length} potong` : `${potong.length} potong` };
}
