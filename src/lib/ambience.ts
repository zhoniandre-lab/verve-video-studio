/* =====================================================================
   🌧️ SUARA ALAM LATAR (v20.0) — hujan, air mengalir, hujan+petir
   Dibuat SINTETIS via Web Audio (tanpa file eksternal) → ringan,
   deterministik (cocok untuk render offline), volume bisa diatur.
   Bisa juga pakai file MP3 sendiri (upload).
   ===================================================================== */

export type JenisAmbience = "off" | "hujan" | "air" | "hujanpetir" | "upload";

export const AMBIENCE_LABEL: Record<JenisAmbience, string> = {
  off: "🚫 Tanpa suara alam",
  hujan: "🌧️ Hujan",
  air: "💧 Air mengalir",
  hujanpetir: "⛈️ Hujan & petir",
  upload: "📥 File sendiri",
};

/** Buat buffer noise (putih) panjang `detik` — dasar semua suara alam. */
export function buatNoiseBuffer(ctx: BaseAudioContext, detik: number, sr = 44100): AudioBuffer {
  const len = Math.max(1, Math.round(detik * sr));
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

/** Impulse response reverb sintetis (ruang kecil-halus) — untuk vokal biar tidak mentahan. */
export function buatReverbIR(ctx: BaseAudioContext, detik = 1.1, decay = 2.4): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * detik);
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const n = Math.random() * 2 - 1;
      // lowpass sederhana (integrasi) biar suara reverb lembut, bukan "metalik"
      last = last * 0.6 + n * 0.4;
      d[i] = last * env * (c === 0 ? 1 : 0.9);
    }
  }
  return b;
}

/**
 * Sambungkan sumber ambience ke sebuah AudioContext (live ATAU offline render).
 * `tMulai` = posisi waktu global (detik) — petir muncul di pola tetap biar
 * render deterministik. `durasi` = berapa lama ambience dimainkan.
 * Kembalian: { stop } untuk memberhentikan (dipakai live preview).
 */
export function sambungAmbience(
  ctx: BaseAudioContext,
  tujuan: AudioNode,
  jenis: JenisAmbience,
  volume: number, // 0..1
  tMulai: number,
  durasi: number,
  fileBuf?: AudioBuffer | null,
): { stop: () => void } {
  const vol = Math.max(0, Math.min(1, volume));
  const stops: (() => void)[] = [];
  const stopAll = () => { stops.forEach((f) => { try { f(); } catch {} }); };
  if (jenis === "off" || vol <= 0.001 || durasi <= 0) return { stop: stopAll };

  const mkGain = (v: number) => { const g = ctx.createGain(); g.gain.value = v; g.connect(tujuan); return g; };

  if (jenis === "upload") {
    if (!fileBuf) return { stop: stopAll };
    const src = ctx.createBufferSource();
    src.buffer = fileBuf; src.loop = true;
    const g = mkGain(vol);
    src.connect(g);
    src.start(0, 0, durasi + 1);
    stops.push(() => { try { src.stop(); } catch {} });
    return { stop: stopAll };
  }

  // ---- SINTETIS ----
  const noise = buatNoiseBuffer(ctx, 2.5); // 2,5 dtk di-loop
  const mkLoop = () => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, 0, durasi + 2);
    stops.push(() => { try { s.stop(); } catch {} });
    return s;
  };

  if (jenis === "hujan" || jenis === "hujanpetir") {
    // Hujan: noise → highpass 500 → lowpass 6500 → gain (dengan modulasi halus)
    const s = mkLoop();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6500;
    const g = mkGain(vol * 0.55);
    s.connect(hp); hp.connect(lp); lp.connect(g);
    // modulasi amplitudo lambat (angin) — LFO 0.13 Hz
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = vol * 0.08;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start(0);
    stops.push(() => { try { lfo.stop(); } catch {} });
  }
  if (jenis === "air") {
    // Air mengalir: noise → lowpass 1400 + sedikit bandpass 300 → gain
    const s = mkLoop();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.6;
    const g = mkGain(vol * 0.5);
    s.connect(lp); lp.connect(bp); bp.connect(g);
    // riak halus: LFO 0.4 Hz kecil
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.4;
    const lfoG = ctx.createGain(); lfoG.gain.value = vol * 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start(0);
    stops.push(() => { try { lfo.stop(); } catch {} });
  }
  if (jenis === "hujanpetir") {
    // Petir: ledakan noise lowpass 220 Hz dengan envelope — pola tetap di detik tertentu
    const pola = [6, 19, 34, 51, 72, 95, 121, 148, 178, 210, 245, 283, 324, 368, 415, 465];
    for (const tPetir of pola) {
      const tLokal = tPetir - tMulai;
      if (tLokal < -0.05 || tLokal > durasi) continue;
      const src = ctx.createBufferSource(); src.buffer = noise;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(tujuan);
      src.start(Math.max(0, tLokal));
      const t0 = ctx.currentTime + Math.max(0, tLokal);
      // envelope: naik cepat, turun eksponensial (~2,5 dtk)
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * 0.9, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.05), t0 + 2.2);
      stops.push(() => { try { src.stop(); } catch {} });
    }
  }
  return { stop: stopAll };
}
