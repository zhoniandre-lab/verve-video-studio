/* =====================================================================
   RANTAI AUDIO SHARED (v19.33) — dipakai AudioContext (live) DAN
   OfflineAudioContext (render kuat). Sebelumnya buildChain cuma ada
   di dalam komponen Spectrum; sekarang bisa dipakai dua-duanya
   sehingga hasil EQ/kompresi render offline SAMA dengan preview.
   ===================================================================== */

export function buildAudioChain(
  actx: BaseAudioContext,
  eq: string,
  comp: number,
  gain: number,
  denganAnalyser = true
): { input: GainNode; analyser: AnalyserNode } {
  const input = actx.createGain();
  let head: AudioNode = input;
  const mk = (n: AudioNode) => { head.connect(n); head = n; };

  if (eq === "bass") {
    const lo = actx.createBiquadFilter(); lo.type = "lowshelf"; lo.frequency.value = 130; lo.gain.value = 6;
    const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 8000; hi.gain.value = -2;
    mk(lo); mk(hi);
  } else if (eq === "vokal") {
    const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85;
    const pk = actx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 2300; pk.Q.value = 1; pk.gain.value = 3.5;
    mk(hp); mk(pk);
  } else if (eq === "studio") {
    // 🎙️ v20.6 MODE STUDIO — rekaman HP jadi seperti studio:
    // buang dengung rendah (highpass 85) + hilangkan "kotak" (dip 350Hz) +
    // tegas & hangat (presence 3kHz) + udara halus (highshelf 9kHz)
    const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85;
    const dip = actx.createBiquadFilter(); dip.type = "peaking"; dip.frequency.value = 350; dip.Q.value = 1; dip.gain.value = -2.5;
    const pk = actx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 3000; pk.Q.value = 1.2; pk.gain.value = 3.5;
    const air = actx.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 9000; air.gain.value = 1.5;
    mk(hp); mk(dip); mk(pk); mk(air);
  } else if (eq === "hangat") {
    const lo = actx.createBiquadFilter(); lo.type = "lowshelf"; lo.frequency.value = 160; lo.gain.value = 3;
    const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 6000; hi.gain.value = -3;
    mk(lo); mk(hi);
  } else if (eq === "cerah") {
    const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 7500; hi.gain.value = 4;
    mk(hi);
  }

  const cp = actx.createDynamicsCompressor();
  const c = Math.max(0, Math.min(1, comp / 100));
  cp.threshold.value = -18 - c * 22;
  cp.knee.value = 18;
  cp.ratio.value = 1.5 + c * 8;
  cp.attack.value = 0.006; cp.release.value = 0.18;
  mk(cp);

  const g = actx.createGain(); g.gain.value = Math.max(0, Math.min(1.2, gain / 100)); mk(g);

  const an = actx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.82;
  if (denganAnalyser) head.connect(an);

  return { input, analyser: an };
}
