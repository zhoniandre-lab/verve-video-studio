"use client";
/* =====================================================================
   VERVE SPECTRUM STUDIO — modul terpisah (klik dari dashboard)
   Musik → video SPECTRUM keren: auto lirik karaoke, overlay suasana,
   mastering ringan (EQ + kompresor + fade), loop mulus, jalan di HP.
   100% kode & aset orisinal.
   ===================================================================== */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { paintEffect, paintPreviewCaptions, CC_TEMPLATES, ensureFontsLoaded } from "@/lib/editing";
import type { CapWord } from "@/lib/editing";

/* ---- helper lokal ---- */
function uid(): string { return `sp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }
function fmtD(s: number): string { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${String(sec).padStart(2, "0")}`; }
function clampN(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }
function proxify(url: string): string {
  if (!url || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const h = new URL(url).hostname.toLowerCase();
    const need = h.includes("kie.ai") || h.includes("suno") || h.includes("apiframe") || h.includes("sunor") || h.includes("r2.dev") || h.includes("cdn");
    return need ? `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
}
function downloadBlobX(b: Blob, name: string) {
  const u = URL.createObjectURL(b); const a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

const SPEC_STYLES = [
  { id: "bars", label: "📊 Bars", desc: "Bar warna klasik" },
  { id: "mirror", label: "⬍ Mirror", desc: "Cermin atas-bawah" },
  { id: "circle", label: "⭕ Lingkaran", desc: "Radial futuristik" },
  { id: "wave", label: "🌊 Gelombang", desc: "Garis ombak lembut" },
  { id: "dots", label: "✨ Partikel", desc: "Bintik mengambang" },
];
const BG_GRADS = [
  { id: "g0", css: ["#05070f", "#0e7490"], label: "Samudra Malam" },
  { id: "g1", css: ["#12061f", "#7c3aed"], label: "Ungu Nebula" },
  { id: "g2", css: ["#0f0c0c", "#b91c1c"], label: "Bara Merah" },
  { id: "g3", css: ["#04120a", "#065f46"], label: "Hutan Tenang" },
  { id: "g4", css: ["#0a0a12", "#1f2937"], label: "Abu Film" },
];
const OVERLAYS = [
  { id: "none", label: "🚫 Polos" }, { id: "hujan", label: "🌧️ Hujan" }, { id: "salju", label: "❄️ Salju" },
  { id: "kabut", label: "🌫️ Kabut" }, { id: "bintang", label: "🌟 Bintang" }, { id: "gelembung", label: "🫧 Gelembung" },
  { id: "kilau", label: "✨ Kilau" },
];
const EQ_PRESETS = [
  { id: "flat", label: "🎚 Flat" }, { id: "bass", label: "🔊 Bass Boost" }, { id: "vokal", label: "🎤 Vokal Jernih" },
  { id: "hangat", label: "🔥 Hangat" }, { id: "cerah", label: "✨ Cerah" },
];
const STEPS = ["Musik", "Visual", "Lirik", "Master", "Ekspor"];

export default function SpectrumStudio({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(0);
  /* musik */
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [duration, setDuration] = useState(0);
  const [mTitle, setMTitle] = useState("");
  const [mLyrics, setMLyrics] = useState("");
  const [mGenre, setMGenre] = useState("pop ballad");
  const [mMood, setMMood] = useState("emotional, dreamy");
  const [mBusy, setMBusy] = useState(false);
  const [mTask, setMTask] = useState("");
  const [mStatus, setMStatus] = useState("");
  /* visual */
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  const [bgType, setBgType] = useState<"grad" | "color" | "img">("grad");
  const [bgGrad, setBgGrad] = useState("g0");
  const [bgColor, setBgColor] = useState("#0a0a12");
  const [bgImg, setBgImg] = useState("");
  // 🎨 v19.11: BACKGROUND AI OTOMATIS — ketik suasana → generate background sinematik
  const [bgPrompt, setBgPrompt] = useState("");
  const [bgAiBusy, setBgAiBusy] = useState(false);
  const [bgAiMsg, setBgAiMsg] = useState("");
  const [specStyle, setSpecStyle] = useState("bars");
  const [specColor, setSpecColor] = useState("#22d3ee");
  const [overlay, setOverlay] = useState("none");
  const [title, setTitle] = useState("");
  /* lirik */
  const [lirikOn, setLirikOn] = useState(true);
  const [lyricsText, setLyricsText] = useState("");
  const [ccTpl, setCcTpl] = useState("karaoke");
  /* master */
  const [eq, setEq] = useState("flat");
  const [comp, setComp] = useState(55);
  const [gain, setGain] = useState(100);
  const [fades, setFades] = useState(true);
  const [shorts, setShorts] = useState(false);
  const [seamless, setSeamless] = useState(true);
  /* render */
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");

  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const startAtRef = useRef(0);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const barsRef = useRef<Float32Array>(new Float32Array(64));
  const renderRecRef = useRef<MediaRecorder | null>(null);

  const dim = useMemo(() => ratio === "9:16" ? { w: 608, h: 1080 } : { w: 1080, h: 608 }, [ratio]);
  const tpl = useMemo(() => CC_TEMPLATES.find(t => t.id === ccTpl) || CC_TEMPLATES[1], [ccTpl]);
  const rgb = useMemo(() => {
    const m = specColor.replace("#", ""); const v = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
    return [parseInt(v.slice(0, 2), 16) || 34, parseInt(v.slice(2, 4), 16) || 211, parseInt(v.slice(4, 6), 16) || 238] as [number, number, number];
  }, [specColor]);

  /* ---------- build CapWords dari lirik + durasi ---------- */
  const capWords = useMemo<CapWord[]>(() => {
    if (!lirikOn || !duration) return [];
    const lines = lyricsText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];
    const totalChars = lines.reduce((a, s) => a + s.length, 0) || 1;
    let acc = 0.15;
    const usable = Math.max(1, duration - 0.4);
    const words: CapWord[] = [];
    lines.forEach((s, li) => {
      const seg = Math.max(0.8, (s.length / totalChars) * usable);
      const ws = s.split(/\s+/).filter(Boolean);
      const wchars = ws.reduce((a, w) => a + w.length, 0) || 1;
      let wacc = acc;
      ws.forEach(w => {
        const wd = (w.length / wchars) * seg;
        words.push({ text: w, start: wacc, end: wacc + wd, line: li });
        wacc += wd;
      });
      acc += seg;
    });
    return words;
  }, [lirikOn, lyricsText, duration]);

  /* ---------- decode audio sekali ---------- */
  async function loadAudio(url: string, name: string) {
    setErr(""); setMBusy(true);
    try {
      const r = await fetch(proxify(url));
      const raw = await r.arrayBuffer();
      if (!actxRef.current) actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await actxRef.current.decodeAudioData(raw.slice(0));
      bufRef.current = buf;
      setAudioUrl(url); setAudioName(name);
      setDuration(buf.duration);
      if (!title) setTitle(name);
    } catch (e: any) { setErr("Audio tidak bisa dibaca: " + (e?.message || "")); }
    setMBusy(false);
  }

  /* ---------- audio chain (EQ + kompresor + gain) ---------- */
  function buildChain(actx: AudioContext, destAnalyserToo = true): { input: AudioNode; analyser: AnalyserNode } {
    const nodes: AudioNode[] = [];
    const input = actx.createGain();
    let head: AudioNode = input;
    const mk = (n: AudioNode) => { head.connect(n); head = n; nodes.push(n); };
    if (eq === "bass") {
      const lo = actx.createBiquadFilter(); lo.type = "lowshelf"; lo.frequency.value = 130; lo.gain.value = 6;
      const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 8000; hi.gain.value = -2;
      mk(lo); mk(hi);
    } else if (eq === "vokal") {
      const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85;
      const pk = actx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 2300; pk.Q.value = 1; pk.gain.value = 3.5;
      mk(hp); mk(pk);
    } else if (eq === "hangat") {
      const lo = actx.createBiquadFilter(); lo.type = "lowshelf"; lo.frequency.value = 160; lo.gain.value = 3;
      const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 6000; hi.gain.value = -3;
      mk(lo); mk(hi);
    } else if (eq === "cerah") {
      const hi = actx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 7500; hi.gain.value = 4;
      mk(hi);
    }
    const cp = actx.createDynamicsCompressor();
    const c = clampN(comp / 100, 0, 1);
    cp.threshold.value = -18 - c * 22;
    cp.knee.value = 18;
    cp.ratio.value = 1.5 + c * 8;
    cp.attack.value = 0.006; cp.release.value = 0.18;
    mk(cp);
    const g = actx.createGain(); g.gain.value = clampN(gain / 100, 0, 1.2); mk(g);
    const an = actx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.82;
    head.connect(an);
    return { input, analyser: an };
  }

  function stopPlayback() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
    try { srcRef.current?.stop(); } catch {}
    srcRef.current = null;
    setPlaying(false);
  }
  useEffect(() => () => stopPlayback(), []); // eslint-disable-line

  /* ---------- painter ---------- */
  // 🎨 v19.11: GENERATE BACKGROUND AI dari suasana/lirik (16:9 & 9:16) — otak gambar, bar jalan di atas
  async function buatBgAI() {
    const mood = bgPrompt.trim() || (mLyrics ? mLyrics.split("\n")[0] : "");
    if (!mood) { setBgAiMsg("⚠️ Ketik suasana dulu (misal: 'hujan di jendela, rindu ibu, malam sepi')"); return; }
    setBgAiBusy(true); setBgAiMsg("🎨 Otak lagi menggambar suasana…");
    try {
      const rasio = ratio === "9:16" ? "vertical 9:16" : "widescreen 16:9";
      const prompt = `Cinematic music video background, ${rasio}, no text no letters no watermark. Mood: "${mood}". Dark atmospheric scene with empty space in the middle for a visualizer, deep rich colors, dramatic lighting, film grain, 8K quality, PURE photographic scene only.`;
      const r = await fetch("/api/hcnsec/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "spektrum-bg", keyword: "musik", niche: "visualizer", _rawPrompt: true, prompt }),
      });
      const j = await r.json();
      if (!r.ok || !j?.url) throw new Error(j?.error || `HTTP ${r.status}`);
      setBgImg(j.url); setBgType("img");
      setBgAiMsg("✅ Background AI jadi — bar visualizer jalan di atasnya!");
    } catch (e) {
      setBgAiMsg(`⚠️ ${e instanceof Error ? e.message : "Gagal generate"} — pakai Gradasi/Foto dulu, coba lagi nanti.`);
    } finally {
      setBgAiBusy(false);
    }
  }

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq?: Uint8Array | null) => {
    // background
    if (bgType === "img" && bgImgRef.current) {
      const im = bgImgRef.current, ir = im.naturalWidth / im.naturalHeight, cr = W / H;
      let sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
      if (ir > cr) { sw = im.naturalHeight * cr; sx = (im.naturalWidth - sw) / 2; } else { sh = im.naturalWidth / cr; sy = (im.naturalHeight - sh) / 2; }
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(0, 0, W, H);
    } else if (bgType === "color") {
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
    } else {
      const gdef = BG_GRADS.find(g => g.id === bgGrad) || BG_GRADS[0];
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, gdef.css[0]); g.addColorStop(1, gdef.css[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // vinyet lembut
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // bars dari analyser atau dummy berdenyut
    const N = 64;
    let bass = 0;
    if (freq) {
      const step = Math.floor(freq.length * 0.72 / N);
      for (let i = 0; i < N; i++) {
        let s = 0; for (let k = 0; k < step; k++) s += freq[Math.min(freq.length - 1, i * step + k)];
        const v = (s / step) / 255;
        barsRef.current[i] = barsRef.current[i] * 0.35 + v * 0.65;
      }
      for (let i = 0; i < 8; i++) bass += barsRef.current[i]; bass /= 8;
    } else {
      for (let i = 0; i < N; i++) {
        const target = 0.25 + 0.55 * Math.abs(Math.sin(t * 2.2 + i * 0.7)) * (0.5 + Math.abs(Math.sin(t * 0.9 + i)));
        barsRef.current[i] = barsRef.current[i] * 0.6 + target * 0.4;
      }
      bass = 0.3 + 0.2 * Math.abs(Math.sin(t * 3));
    }
    const bars = barsRef.current;
    const [r, g2, b] = rgb;
    const acc = `rgb(${r},${g2},${b})`;

    // ---- spectrum styles ----
    if (specStyle === "bars") {
      const bw = W / N;
      for (let i = 0; i < N; i++) {
        const v = bars[i];
        const h = Math.max(3, v * H * 0.62);
        const x = i * bw + bw * 0.18;
        const grd = ctx.createLinearGradient(0, H - h, 0, H);
        grd.addColorStop(0, `rgb(${Math.min(255, r + 80)},${Math.min(255, g2 + 60)},255)`);
        grd.addColorStop(1, acc);
        ctx.fillStyle = grd;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, H - h, bw * 0.64, h, bw * 0.3);
        else ctx.rect(x, H - h, bw * 0.64, h);
        ctx.fill();
      }
    } else if (specStyle === "mirror") {
      const bw = W / N; const cy = H * 0.56;
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const h = Math.max(2, v * H * 0.26);
        ctx.fillStyle = acc; ctx.globalAlpha = 0.95;
        ctx.fillRect(i * bw + bw * 0.2, cy - h, bw * 0.6, h);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(i * bw + bw * 0.2, cy + 2, bw * 0.6, h);
        ctx.globalAlpha = 1;
      }
    } else if (specStyle === "circle") {
      const cx = W / 2, cy = H / 2; const R = Math.min(W, H) * 0.22;
      ctx.save(); ctx.translate(cx, cy);
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const len = Math.max(2, v * R * 1.1);
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
        ctx.save(); ctx.rotate(ang);
        const grd = ctx.createLinearGradient(R, 0, R + len, 0);
        grd.addColorStop(0, acc); grd.addColorStop(1, `rgba(${r},${g2},${b},0.05)`);
        ctx.fillStyle = grd;
        ctx.fillRect(R, -Math.max(1, Math.min(W, H) * 0.006), len, Math.max(2, Math.min(W, H) * 0.012));
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g2},${b},0.4)`; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else if (specStyle === "wave") {
      const cy = H * 0.55;
      for (const [alpha, amp] of [[0.95, 1], [0.4, 1.6], [0.2, 2.3]] as any[]) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const i = Math.floor((x / W) * (N - 1));
          const y = cy + Math.sin(x * 0.012 * amp + t * 3) * (10 + bars[i] * H * 0.2) - bars[i] * H * 0.06;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = acc; ctx.globalAlpha = alpha; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
      }
    } else { // dots/partikel
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const ang = (i / N) * Math.PI * 2;
        const rr = Math.min(W, H) * (0.12 + v * 0.3);
        const x = W / 2 + Math.cos(ang + t * 0.25) * rr;
        const y = H / 2 + Math.sin(ang + t * 0.25) * rr;
        ctx.globalAlpha = 0.25 + v * 0.75;
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, Math.min(W, H) * (0.004 + v * 0.012)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // overlay suasana
    if (overlay !== "none") paintEffect(ctx, W, H, overlay, t, true);

    // judul
    if (title.trim()) {
      ctx.font = `900 ${Math.round(H * 0.05)}px 'Poppins',system-ui,sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = Math.round(H * 0.05 * 0.14); ctx.lineJoin = "round";
      ctx.strokeText(title, W * 0.05, H * 0.05);
      ctx.fillStyle = "#fff"; ctx.fillText(title, W * 0.05, H * 0.05);
      ctx.font = `700 ${Math.round(H * 0.022)}px 'Poppins',sans-serif`;
      ctx.fillStyle = `rgba(${r},${g2},${b},0.95)`;
      ctx.fillText(`♪ ${audioName || "Music"} • VERVE Spectrum`, W * 0.05, H * 0.05 + H * 0.062);
    }

    // lirik karaoke
    if (lirikOn && capWords.length) {
      paintPreviewCaptions(ctx, W, H, capWords, t, tpl.capStyle, { yRatio: 0.8, sizeRatio: 0.05 });
    }

    // badge loop mulus
    if (seamless) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(W - H * 0.2 - 8, 8, H * 0.2, H * 0.045);
      ctx.fillStyle = "#9ff5ef"; ctx.font = `700 ${Math.round(H * 0.022)}px 'Poppins',sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("∞ loop mulus", W - H * 0.1 - 8, 8 + H * 0.023);
    }
  }, [bgType, bgColor, bgGrad, specStyle, overlay, title, audioName, lirikOn, capWords, tpl, rgb, seamless]);

  const tick = useCallback(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d") as CanvasRenderingContext2D | null; if (!ctx) return;
    const t = srcRef.current ? actxRef.current!.currentTime - startAtRef.current : performance.now() / 1000;
    let freq: Uint8Array | null = null;
    if (analyserRef.current && srcRef.current) {
      freq = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(freq as any);
    }
    drawScene(ctx, cv.width, cv.height, Math.max(0, t), freq);
    rafRef.current = requestAnimationFrame(tick);
  }, [drawScene]);

  /* mulai loop pratinjau (tanpa audio → t pakai jam biasa) */
  function startPreviewLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }
  useEffect(() => { startPreviewLoop(); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }; }, [tick]); // eslint-disable-line

  useEffect(() => {
    if (!bgImg) { bgImgRef.current = null; return; }
    const im = new Image(); im.onload = () => { bgImgRef.current = im; }; im.src = bgImg;
  }, [bgImg]);
  useEffect(() => { ensureFontsLoaded().catch(() => {}); }, []);

  /* pratinjau audio */
  function audition() {
    if (!bufRef.current || rendering) return;
    if (playing) { stopPlayback(); return; }
    const actx = actxRef.current!;
    actx.resume().catch(() => {});
    const src = actx.createBufferSource();
    src.buffer = bufRef.current;
    const { input, analyser } = buildChain(actx);
    input.connect(actx.destination);
    src.connect(input);
    src.onended = () => { setPlaying(false); srcRef.current = null; };
    src.start();
    srcRef.current = src; analyserRef.current = analyser;
    startAtRef.current = actx.currentTime;
    setPlaying(true);
    setTimeout(() => { if (shorts) { stopPlayback(); } }, Math.min(bufRef.current.duration, shorts ? 60 : bufRef.current.duration) * 1000 + 200);
  }

  /* ---------- SUNO mini ---------- */
  async function genSuno() {
    const titleS = mTitle.trim() || "Spectrum Beat";
    const lyr = mLyrics.trim();
    setMBusy(true); setMStatus("memulai..."); setErr("");
    try {
      const key = localStorage.getItem("verve_suno_key") || "";
      const prov = localStorage.getItem("verve_suno_provider") || "kie";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) { headers["X-Suno-Key"] = key; headers["X-Suno-Provider"] = prov; }
      const r = await fetch("/api/hcnsec/music", {
        method: "POST", headers,
        body: JSON.stringify({
          title: titleS.slice(0, 80), prompt: [mGenre, mMood, "instrumental focus"].join(", "),
          lyrics: lyr.length > 20 ? lyr : undefined, custom: lyr.length > 30,
          genre: mGenre, tags: [mGenre, mMood].join(", "), model: "suno-v4",
          instrumental: lyr.length <= 20, _raw_title: titleS,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || d.message || `Error ${r.status}`);
      const id = d.taskId || d.task_id || d.id;
      if (!id) throw new Error("Server tidak memberi taskId");
      setMTask(id); setMStatus("pending");
      poll(id, headers);
    } catch (e: any) { setErr(e.message); setMStatus("gagal"); }
    setMBusy(false);
  }
  async function poll(id: string, headers: Record<string, string>) {
    let tries = 0;
    const itv = setInterval(async () => {
      tries++;
      try {
        const pr = await fetch(`/api/hcnsec/music?id=${id}`, { headers, cache: "no-store" });
        const pd = await pr.json().catch(() => ({}));
        const url = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
        if (url) {
          clearInterval(itv); setMStatus("selesai"); setMTask("");
          loadAudio(url, mTitle || "Lagu AI");
        } else if (pd.status === "error" || pd.error) {
          clearInterval(itv); setMStatus("gagal"); setErr(pd.error || "Gagal");
        } else if (tries > 45) { clearInterval(itv); setMStatus("pending"); }
      } catch { if (tries > 45) clearInterval(itv); }
    }, 8000);
  }

  /* ---------- RENDER ---------- */
  async function render() {
    if (!bufRef.current) { setErr("Pilih musik dulu bro"); return; }
    stopPlayback();
    setRendering(true); setProgress(0); setErr("");
    setVideoUrl(u => { if (u) URL.revokeObjectURL(u); return ""; }); setVideoBlob(null);
    try {
      await ensureFontsLoaded().catch(() => {});
      const W = dim.w, H = dim.h;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d", { alpha: false })!;

      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = actx.createBufferSource();
      src.buffer = bufRef.current;
      const { input, analyser } = buildChain(actx);
      const dest = actx.createMediaStreamDestination();
      input.connect(dest);

      // fades
      const total = Math.min(bufRef.current.duration, shorts ? 59.5 : bufRef.current.duration);
      if (fades) {
        const gnode = actx.createGain();
        // sisipkan gain fade antara src dan input
      }
      src.connect(fades ? fadeGain(actx, input, total) : input);

      const vstream = (cv as any).captureStream(30);
      const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>(res => {
        mr.onstop = () => res(new Blob(chunks, { type: (chunks[0]?.type || mime || "video/webm").split(";")[0] }));
      });

      // frame sinkron dgn audio clock
      startAtRef.current = actx.currentTime;
      src.onended = () => setTimeout(() => { try { mr.stop(); } catch {} }, 180);
      mr.start(350);
      src.start();
      await actx.resume().catch(() => {});

      // gambar frame via rAF selama audio jalan
      const barsLocal = new Uint8Array(analyser.frequencyBinCount);
      await new Promise<void>(res2 => {
        const loop = () => {
          const t = actx.currentTime - startAtRef.current;
          analyser.getByteFrequencyData(barsLocal as any);
          drawScene(ctx, W, H, Math.max(0, t), barsLocal);
          setProgress(clampN(t / total, 0, 1));
          if (t >= total + 0.15) { res2(); return; }
          requestAnimationFrame(loop);
        };
        loop();
      });
      try { src.stop(); } catch {}
      const blob = await done;
      actx.close().catch(() => {});
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setProgress(1);
    } catch (e: any) { setErr(e?.message || "Render gagal"); }
    setRendering(false);
  }
  function fadeGain(actx: AudioContext, next: AudioNode, total: number): AudioNode {
    const g = actx.createGain();
    const t0 = actx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + 1.2);
    g.gain.setValueAtTime(1, t0 + Math.max(1.2, total - 1.8));
    g.gain.linearRampToValueAtTime(0, t0 + total + 0.05);
    g.connect(next);
    return g;
  }

  function download() {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlobX(videoBlob, `spectrum_${(title || audioName || "verve").replace(/[^\w\- ]+/g, "").slice(0, 30)}_${Date.now()}.${ext}`);
  }

  /* ================= UI ================= */
  return (
    <div className="v6e-root" style={{ background: "#07070c" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={() => { stopPlayback(); onExit(); }}>✕</button>
        <b style={{ fontSize: 13, flex: 1 }}>🎧 Spectrum Studio</b>
        <button className="v6e-export" onClick={() => setStep(4)} disabled={!audioUrl}>Ekspor ›</button>
      </header>

      {/* stepper */}
      <div className="v6-chips" style={{ paddingTop: 4 }}>
        {STEPS.map((s, i) => (
          <button key={s} className={`v6-chip ${step === i ? "on" : ""}`} style={{ opacity: i > 0 && !audioUrl ? 0.4 : 1 }}
            onClick={() => (i === 0 || audioUrl) && setStep(i)}>{i + 1}. {s}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 90px" }}>
        {/* pratinjau selalu terlihat */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: ratio === "9:16" ? 250 : 480 }}>
            <canvas ref={cvRef} width={dim.w} height={dim.h}
              style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", background: "#000", aspectRatio: `${dim.w}/${dim.h}` }} />
            {!!audioUrl && (
              <button onClick={audition} disabled={rendering}
                style={{ position: "absolute", right: 10, bottom: 10, background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                {playing ? "⏸ Stop" : "▶ Dengarkan"}
              </button>
            )}
          </div>
        </div>

        {!!err && <div className="v6-risk" onClick={() => setErr("")}>{err} ✕</div>}

        {/* ---------- STEP 0: MUSIK ---------- */}
        {step === 0 && (
          <>
            <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>1️⃣ Pilih musik</h3>
            <label className="v6-cardrow">
              <span style={{ fontSize: 20 }}>📥</span>
              <div className="tt">Upload musik / lagu dari HP<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>{mBusy ? "Memproses…" : audioName ? `✅ ${audioName} (${fmtD(duration)})` : "mp3/wav/m4a"}</div></div>
              <span className="arr">›</span>
              <input type="file" accept="audio/*" hidden onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                loadAudio(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, "").slice(0, 40));
              }} />
            </label>
            <div className="v6-lbl" style={{ marginTop: 16 }}>ATAU BUAT DENGAN AI 🎵</div>
            <input className="v6-inp" placeholder="Judul lagu (cth: Hujan di Jendela)" value={mTitle} onChange={e => setMTitle(e.target.value)} />
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {["lofi", "akustik", "piano", "cinematic", "edm", "pop ballad", "ambient"].map(g => (
                <button key={g} className={`v6-chip ${mGenre === g ? "on" : ""}`} onClick={() => setMGenre(g)}>{g}</button>
              ))}
            </div>
            <input className="v6-inp" style={{ marginTop: 6 }} placeholder="Suasana (cth: santai, hujan, fokus)" value={mMood} onChange={e => setMMood(e.target.value)} />
            <textarea className="v6-inp v6-ta" style={{ minHeight: 70, marginTop: 6 }} placeholder="Lirik (opsional — kosongkan untuk instrumen). Kalau diisi, auto lirik karaoke nanti mengambil dari sini juga ✨"
              value={mLyrics} onChange={e => { setMLyrics(e.target.value); if (!lyricsText) setLyricsText(e.target.value); }} />
            <button className="v6-bigcta" onClick={genSuno} disabled={mBusy}>{mBusy ? "⏳…" : "✨ Buat lagu AI"}</button>
            {mStatus && <div className={mStatus === "selesai" ? "v6-okbox" : "v6-risk"}>{mStatus === "selesai" ? "✅ Lagu siap & langsung terpasang!" : mStatus === "gagal" ? "❌ Gagal, coba lagi." : "⏳ Sedang diolah server (1–6 menit), polling jalan otomatis."}</div>}
            {audioUrl && <button className="v6-bigcta" style={{ background: "#22c55e" }} onClick={() => setStep(1)}>Lanjut: Visual ›</button>}
          </>
        )}

        {/* ---------- STEP 1: VISUAL ---------- */}
        {step === 1 && (
          <>
            <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>2️⃣ Visual & spectrum</h3>
            <div className="v6-lbl">RASIO</div>
            <div className="v6-chips" style={{ padding: 0 }}>
              <button className={`v6-chip ${ratio === "16:9" ? "on" : ""}`} onClick={() => setRatio("16:9")}>▭ 16:9 YouTube</button>
              <button className={`v6-chip ${ratio === "9:16" ? "on" : ""}`} onClick={() => setRatio("9:16")}>▯ 9:16 Shorts</button>
            </div>
            <div className="v6-lbl">GAYA SPECTRUM</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {SPEC_STYLES.map(s => <button key={s.id} className={`v6-chip ${specStyle === s.id ? "on" : ""}`} onClick={() => setSpecStyle(s.id)}>{s.label}</button>)}
            </div>
            <div className="v6-lbl">WARNA SPECTRUM</div>
            <div className="v6-rows">
              {["#22d3ee", "#a855f7", "#fde047", "#ef4444", "#22c55e", "#ec4899", "#ffffff", "#f97316"].map(c => (
                <button key={c} className={`v6-swatch ${specColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => setSpecColor(c)} />
              ))}
              <span className="v6-swatch" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                <input type="color" value={specColor} onChange={e => setSpecColor(e.target.value)} />
              </span>
            </div>
            <div className="v6-lbl">LATAR</div>
            <div className="v6-chips" style={{ padding: 0 }}>
              <button className={`v6-chip ${bgType === "grad" ? "on" : ""}`} onClick={() => setBgType("grad")}>🌈 Gradasi</button>
              <button className={`v6-chip ${bgType === "color" ? "on" : ""}`} onClick={() => setBgType("color")}>🎨 Warna</button>
              <button className={`v6-chip ${bgType === "img" ? "on" : ""}`} onClick={() => setBgType("img")}>🖼 Foto</button>
              <button className={`v6-chip ${bgType === "img" && bgImg ? "on" : ""}`} style={{ borderColor: "rgba(139,92,246,.5)", color: "#c4b5fd" }} onClick={() => { setBgType("img"); }}>✨ AI</button>
            </div>
            {bgType === "img" && (
              <div className="v6-rows" style={{ marginTop: 8 }}>
                <input className="v6-inp" placeholder='Ketik suasana: "hujan di jendela, rindu ibu, malam sepi"' value={bgPrompt} onChange={(e) => setBgPrompt(e.target.value)} />
                <button className="v6-bigcta" style={{ background: "linear-gradient(135deg,#8b5cf6,#d946ef)" }} disabled={bgAiBusy} onClick={buatBgAI}>
                  {bgAiBusy ? "⏳ Otak menggambar suasana…" : "🎨 Generate Background AI"}
                </button>
                {!!bgAiMsg && <p style={{ fontSize: 11, color: bgAiMsg.startsWith("⚠️") ? "#fbbf24" : "#6ee7b7", margin: "6px 0 0" }}>{bgAiMsg}</p>}
                <p style={{ fontSize: 10, opacity: .6, margin: "4px 0 0" }}>Kosongkan input → otak pakai baris pertama lirik sebagai suasana. Gambar dipakai otomatis; kalau kurang pas, tekan upload 📥 di bawah.</p>
              </div>
            )}
            {bgType === "grad" && (
              <div className="v6-rows">
                {BG_GRADS.map(g => (
                  <button key={g.id} className={`v6-gcell ${bgGrad === g.id ? "on" : ""}`}
                    style={{ width: 92, height: 60, flex: "0 0 auto", aspectRatio: "auto", background: `linear-gradient(135deg,${g.css[0]},${g.css[1]})` }}
                    onClick={() => setBgGrad(g.id)}><span className="l" style={{ textShadow: "0 1px 3px #000" }}>{g.label}</span></button>
                ))}
              </div>
            )}
            {bgType === "color" && (
              <div className="v6-rows">
                {["#06060c", "#101018", "#000000", "#0e7490", "#312e81", "#7f1d1d", "#065f46"].map(c => (
                  <button key={c} className={`v6-swatch ${bgColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => setBgColor(c)} />
                ))}
                <span className="v6-swatch" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                </span>
              </div>
            )}
            {bgType === "img" && (
              <label className="v6-cardrow">
                <span style={{ fontSize: 20 }}>📥</span><div className="tt">{bgImg ? "✅ Foto dipilih — ganti?" : "Pilih foto latar"}</div><span className="arr">›</span>
                <input type="file" accept="image/*" hidden onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader(); r.onload = () => setBgImg(r.result as string); r.readAsDataURL(f);
                }} />
              </label>
            )}
            <div className="v6-lbl">OVERLAY SUASANA</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {OVERLAYS.map(o => <button key={o.id} className={`v6-chip ${overlay === o.id ? "on" : ""}`} onClick={() => setOverlay(o.id)}>{o.label}</button>)}
            </div>
            <div className="v6-lbl">JUDUL DI VIDEO (opsional)</div>
            <input className="v6-inp" placeholder="cth: Hujan di Jendela — 1 Hour Loop" value={title} onChange={e => setTitle(e.target.value)} />
            <button className="v6-bigcta" onClick={() => setStep(2)}>Lanjut: Lirik ›</button>
          </>
        )}

        {/* ---------- STEP 2: LIRIK ---------- */}
        {step === 2 && (
          <>
            <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>3️⃣ Auto lirik karaoke</h3>
            <div className="v6-cardrow" onClick={() => setLirikOn(!lirikOn)}>
              <span style={{ fontSize: 18 }}>💬</span>
              <div className="tt">Tampilkan lirik karaoke</div>
              <button className={`v6-toggle ${lirikOn ? "on" : ""}`} />
            </div>
            {lirikOn && (
              <>
                <textarea className="v6-inp v6-ta" style={{ minHeight: 130 }} placeholder={"Tempel lirik di sini — satu baris = satu keterangan.\nKata akan menyala satu per satu pas dinyanyikan ✨"} value={lyricsText} onChange={e => setLyricsText(e.target.value)} />
                <div className="v6-lbl">TEMPLATE</div>
                <div className="v6-rows">
                  {CC_TEMPLATES.map(t => (
                    <button key={t.id} className={`v6-gcell ${ccTpl === t.id ? "on" : ""}`} style={{ width: 96, height: 68, flex: "0 0 auto", aspectRatio: "auto" }} onClick={() => setCcTpl(t.id)}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: t.color, textShadow: "0 1px 3px #000" }}>{t.sample}</span>
                      <span className="l">{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="v6-note">⏱ Timing otomatis dibagi rata mengikuti panjang kalimat & durasi lagu — sinkron rapi untuk karaoke (cocok untuk lagu yang liriknya kamu tulis sendiri, mis. dari Musik AI).</div>
              </>
            )}
            <button className="v6-bigcta" onClick={() => setStep(3)}>Lanjut: Master ›</button>
          </>
        )}

        {/* ---------- STEP 3: MASTER ---------- */}
        {step === 3 && (
          <>
            <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>4️⃣ Mastering audio ringan</h3>
            <div className="v6-lbl">EQ PRESET</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {EQ_PRESETS.map(e => <button key={e.id} className={`v6-chip ${eq === e.id ? "on" : ""}`} onClick={() => setEq(e.id)}>{e.label}</button>)}
            </div>
            <div className="v6-slider-row">
              <div className="lr"><span>🗜 Kompresi (vokal lebih rapat & stabil)</span><b>{comp}%</b></div>
              <input type="range" min={0} max={100} value={comp} onChange={e => setComp(Number(e.target.value))} />
            </div>
            <div className="v6-slider-row">
              <div className="lr"><span>🔊 Volume master</span><b>{gain}%</b></div>
              <input type="range" min={20} max={110} value={gain} onChange={e => setGain(Number(e.target.value))} />
            </div>
            <div className="v6-cardrow" onClick={() => setFades(!fades)}>
              <span style={{ fontSize: 18 }}>📈</span>
              <div className="tt">Fade in & fade out halus</div>
              <button className={`v6-toggle ${fades ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" onClick={() => setShorts(!shorts)}>
              <span style={{ fontSize: 18 }}>▯</span>
              <div className="tt">Potong maks 59 dtk (Shorts/Reels)</div>
              <button className={`v6-toggle ${shorts ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" onClick={() => setSeamless(!seamless)}>
              <span style={{ fontSize: 18 }}>∞</span>
              <div className="tt">Loop mulus (video nyambung saat diulang)</div>
              <button className={`v6-toggle ${seamless ? "on" : ""}`} />
            </div>
            <div className="v6-note">💡 Dengarkan hasilnya dulu di pratinjau (▶ Dengarkan) — EQ/kompresi langsung terasa. Mastering diterapkan saat ekspor.</div>
            <button className="v6-bigcta" onClick={() => setStep(4)}>Lanjut: Ekspor ›</button>
          </>
        )}

        {/* ---------- STEP 4: EKSPOR ---------- */}
        {step === 4 && (
          <>
            <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>5️⃣ Ekspor video spectrum</h3>
            <div className="v6-cardrow" style={{ cursor: "default" }}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <div className="tt" style={{ fontSize: 11.5 }}>
                {dim.w}×{dim.h}px · 30fps · {fmtD(Math.min(duration, shorts ? 59.5 : duration))} · EQ {eq} · kompresi {comp}% {fades ? "· fade" : ""}
              </div>
            </div>
            <button className="v6-bigcta" onClick={render} disabled={rendering || !audioUrl}>
              {rendering ? `⏳ Merender… ${Math.round(progress * 100)}%` : videoUrl ? "🔄 Render ulang" : "🚀 Render video spectrum"}</button>
            {rendering && <div className="v6-note" style={{ textAlign: "center" }}>Biarkan layar menyala — render berjalan realtime (audio ikut diproses).</div>}
            {!!videoUrl && (
              <>
                <video src={videoUrl} controls style={{ width: "100%", borderRadius: 12, marginTop: 10, border: "1px solid rgba(255,255,255,.14)" }} />
                <button className="v6-bigcta" style={{ background: "#22c55e", color: "#052e16" }} onClick={download}>⬇️ Download {videoBlob ? `(${(videoBlob.size / 1048576).toFixed(1)} MB)` : ""}</button>
                <div className="v6-okbox">✅ Siap diunggah ke YouTube/TikTok. Musik dari AI = orisinal, aman hak cipta 🛡️</div>
              </>
            )}
            <div className="v6-note">🔄 <b>Loop mulus</b>: di YouTube aktifkan "Ulangi" — visual spectrum nyambung tanpa jedanya (bg statis + spectrum kontinyu).</div>
          </>
        )}
      </div>

      {/* bottom mini player bar */}
      {step > 0 && (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(10,10,15,.95)", borderTop: "1px solid rgba(255,255,255,.1)", padding: "8px 14px calc(8px + env(safe-area-inset-bottom))", display: "flex", gap: 8 }}>
          <button className="v6-btn ghost" style={{ flex: 1 }} onClick={() => setStep(s => Math.max(0, s - 1))}>‹ Kembali</button>
          <button className="v6-btn" style={{ flex: 2 }} onClick={() => setStep(s => Math.min(4, s + 1))} disabled={!audioUrl}>
            {step < 4 ? `${STEPS[Math.min(4, step + 1)]} ›` : "Ekspor"}
          </button>
        </div>
      )}
    </div>
  );
}
