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
import { transcribeBlobBesar } from "@/lib/audiocc"; // 🎤 v19.17: auto-pas lirik dari audio (Whisper)

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
  { id: "tunnel", label: "🎢 3D Tunnel", desc: "Terowongan perspektif (v19.15)" },
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
  // 👑 v19.13 PRO PACK: logo channel di tengah + sinar + shockwave + bintang + ember + overlay pro
  const [logoImg, setLogoImg] = useState("");
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const starsRef = useRef<{ x: number; y: number; r: number; ph: number }[]>([]);
  const embersRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number; ph: number }[]>([]);
  const shockRef = useRef<{ x: number; y: number; r: number; a: number }[]>([]);
  const lastBassRef = useRef(0);
  // 🎛️ v19.14 KUSTOMISASI PRO: layout, posisi logo (drag), bar count, skala, rotasi, glow, ikut beat
  const [layoutId, setLayoutId] = useState("logo-tengah");
  const [logoPos, setLogoPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.42 });
  const [titlePos, setTitlePos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.05 });
  const [barCount, setBarCount] = useState(64);
  const [logoScale, setLogoScale] = useState(1);
  const [rotSpeed, setRotSpeed] = useState(0.5);
  const [glowInt, setGlowInt] = useState(1);
  const [beatMode, setBeatMode] = useState<"denyut" | "membesar" | "statis">("denyut");
  // 🎨 v19.15 TEMA WARNA SIAP-PAKAI
  const [themeId, setThemeId] = useState("");
  // 🖼️ v19.15 MODE MULTI-GAMBAR — array gambar bergantian per bar/beat
  const [multiImgs, setMultiImgs] = useState<string[]>([]);
  const [multiBeat, setMultiBeat] = useState(4); // 🐛 v19.16.1: ganti tiap 4 ketukan (~2.5 dtk) — nggak pusing
  const [danceMode, setDanceMode] = useState("irama"); // 🩰 v19.16: "irama" (ikut musik) | "statis"
  const [danceZoom, setDanceZoom] = useState(0.03); // 🐛 v19.16.1: amplitudo zoom lebih lembut (0 = mati)
  const multiImgsRef = useRef<HTMLImageElement[]>([]);
  const tempoRef = useRef(0.5); // 🩰 estimasi energi musik 0..1 (untuk gambar "menari")
  // 🎢 v19.15 EFEK 3D TUNNEL
  const [tunnelSpeed, setTunnelSpeed] = useState(1);
  const [tunnelDepth, setTunnelDepth] = useState(40); // jumlah lapisan
  // 💾 v19.15 SIMPAN PRESET KUSTOM
  const [presetName, setPresetName] = useState("");
  const [presetMsg, setPresetMsg] = useState("");
  const [dragMode, setDragMode] = useState<"logo" | "judul" | null>(null);
  const dragRef = useRef<{ x: number; y: number; target: "logo" | "judul" } | null>(null);
  // Layout preset — posisi logo & judul (fraksi)
  const LAYOUTS: Record<string, { logo: { x: number; y: number }; titleY: number; titleScale: number }> = {
    "logo-tengah": { logo: { x: 0.5, y: 0.42 }, titleY: 0.035, titleScale: 1 },
    "logo-kiri": { logo: { x: 0.22, y: 0.45 }, titleY: 0.035, titleScale: 0.9 },
    "logo-kanan": { logo: { x: 0.78, y: 0.45 }, titleY: 0.035, titleScale: 0.9 },
    "logo-atas": { logo: { x: 0.5, y: 0.14 }, titleY: 0.30, titleScale: 0.75 },
    "logo-bawah": { logo: { x: 0.5, y: 0.68 }, titleY: 0.035, titleScale: 0.85 },
    "judul-besar": { logo: { x: 0.5, y: 0.55 }, titleY: 0.03, titleScale: 1.5 },
  };
  function setLayout(id: string) {
    setLayoutId(id);
    // 🐛 FIX v19.16: layout TIDAK memaksa posisi kalau user sudah geser manual.
    // Kalau belum pernah geser (masih di preset), baru ikuti posisi preset.
    try {
      const pernahGeser = localStorage.getItem("verve_spektrum_drag") === "1";
      if (!pernahGeser) {
        const L = LAYOUTS[id];
        if (L) { setLogoPos(L.logo); setTitlePos({ x: 0.5, y: L.titleY }); }
      }
      localStorage.setItem("verve_spektrum_layout", id);
    } catch { /* abaikan */ }
  }
  const [specStyle, setSpecStyle] = useState("bars");
  const [specColor, setSpecColor] = useState("#22d3ee");
  // 🎨 v19.15 TEMA WARNA SIAP-PAKAI (seperti channel visualizer terkenal)
  const COLOR_THEMES: { id: string; label: string; emoji: string; color: string; grad: string }[] = [
    { id: "trapnation", label: "Trap Nation Emas", emoji: "🔥", color: "#f59e0b", grad: "g1" },
    { id: "ncs", label: "NCS Biru", emoji: "💫", color: "#22d3ee", grad: "g0" },
    { id: "synthwave", label: "Synthwave Pink-Cyan", emoji: "🌆", color: "#ec4899", grad: "g1" },
    { id: "monstercat", label: "Monstercat Ungu", emoji: "🎧", color: "#8b5cf6", grad: "g1" },
    { id: "neon", label: "Neon Hijau", emoji: "⚡", color: "#22c55e", grad: "g3" },
    { id: "blood", label: "Bara Merah", emoji: "❤️‍🔥", color: "#ef4444", grad: "g2" },
  ];
  function pilihTema(id: string) {
    const t = COLOR_THEMES.find((x) => x.id === id);
    if (!t) return;
    setThemeId(id);
    setSpecColor(t.color);
    if (t.grad) setBgGrad(t.grad);
    try { localStorage.setItem("verve_spektrum_tema", id); } catch {}
  }
  const [overlay, setOverlay] = useState("none");
  const [title, setTitle] = useState("");
  /* lirik */
  const [lirikOn, setLirikOn] = useState(true);
  const [lyricsText, setLyricsText] = useState("");
  const [ccTpl, setCcTpl] = useState("karaoke");
  // 🎤 v19.17 AUTO-PAS LIRIK (Whisper) — timing persis audio
  const [lyrAuto, setLyrAuto] = useState(false);
  const autoWordsRef = useRef<{ w: string; start: number; end: number; line: number }[]>([]);
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
  useEffect(() => {
    if (!logoImg) { logoImgRef.current = null; return; }
    const im = new Image(); im.onload = () => { logoImgRef.current = im; }; im.src = logoImg;
  }, [logoImg]);

  // 🖼️ v19.15 MULTI-GAMBAR: muat semua ke ref, dipakai bergantian per beat
  useEffect(() => {
    const imgs = multiImgs.filter(Boolean);
    multiImgsRef.current = imgs.map((u) => {
      const im = new Image();
      if (/^data:|^blob:/.test(u) || u.startsWith("/")) im.src = u;
      else im.crossOrigin = "anonymous";
      im.src = u;
      return im;
    });
  }, [multiImgs]);

  // 💾 v19.15 SIMPAN & MUAT PRESET KUSTOM (semua pengaturan visual)
  function simpanPreset() {
    const nama = presetName.trim();
    if (!nama) { setPresetMsg("⚠️ Kasih nama preset dulu"); return; }
    try {
      const list = JSON.parse(localStorage.getItem("verve_spektrum_presets_v1") || "[]");
      const preset = {
        nama, at: Date.now(),
        specStyle, specColor, themeId, bgType, bgGrad, bgColor, bgImg: bgImg.slice(0, 20000),
        overlay, layoutId, logoPos, titlePos, barCount, logoScale, rotSpeed, glowInt, beatMode,
        multiImgs: multiImgs.slice(0, 6), tunnelSpeed, tunnelDepth,
      };
      const idx = list.findIndex((p: any) => p.nama === nama);
      if (idx >= 0) list[idx] = preset; else list.unshift(preset);
      localStorage.setItem("verve_spektrum_presets_v1", JSON.stringify(list.slice(0, 12)));
      setPresetMsg(`✅ Preset "${nama}" tersimpan (${list.length} total)`);
    } catch { setPresetMsg("⚠️ Gagal simpan (storage penuh?)"); }
  }
  function muatPreset(nama: string) {
    try {
      const list = JSON.parse(localStorage.getItem("verve_spektrum_presets_v1") || "[]");
      const p = list.find((x: any) => x.nama === nama);
      if (!p) return;
      setSpecStyle(p.specStyle || "bars"); setSpecColor(p.specColor || "#22d3ee"); setThemeId(p.themeId || "");
      setBgType(p.bgType || "grad"); setBgGrad(p.bgGrad || "g0"); setBgColor(p.bgColor || "#06060c");
      if (p.bgImg) setBgImg(p.bgImg);
      setOverlay(p.overlay || "none");
      setLayoutId(p.layoutId || "logo-tengah"); setLogoPos(p.logoPos || { x: 0.5, y: 0.42 }); setTitlePos(p.titlePos || { x: 0.5, y: 0.05 });
      setBarCount(p.barCount || 64); setLogoScale(p.logoScale || 1); setRotSpeed(p.rotSpeed ?? 0.5); setGlowInt(p.glowInt ?? 1);
      setBeatMode(p.beatMode || "denyut"); if (Array.isArray(p.multiImgs)) setMultiImgs(p.multiImgs);
      setTunnelSpeed(p.tunnelSpeed ?? 1); setTunnelDepth(p.tunnelDepth ?? 40);
      setPresetMsg(`✅ Preset "${nama}" dimuat`);
    } catch { setPresetMsg("⚠️ Gagal muat preset"); }
  }
  function daftarPreset(): string[] {
    try { return JSON.parse(localStorage.getItem("verve_spektrum_presets_v1") || "[]").map((p: any) => p.nama); } catch { return []; }
  }
  function hapusPreset(nama: string) {
    try {
      const list = JSON.parse(localStorage.getItem("verve_spektrum_presets_v1") || "[]").filter((x: any) => x.nama !== nama);
      localStorage.setItem("verve_spektrum_presets_v1", JSON.stringify(list));
      setPresetMsg(`🗑 Preset "${nama}" dihapus`);
    } catch { /* abaikan */ }
  }
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
    // 🎤 v19.17: kalau ada hasil AUTO-PAS (Whisper) → pakai timing PERSIS audio
    if (lyrAuto && autoWordsRef.current.length) {
      return autoWordsRef.current.map((aw) => ({ text: aw.w, start: Math.max(0, aw.start), end: Math.min(duration, aw.end), line: aw.line }));
    }
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
  }, [lirikOn, lyricsText, duration, lyrAuto]);

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

  /* 🎤 v19.17 AUTO-PAS LIRIK — transkripsi Whisper → lirik + timing PERSIS audio (bukan dibagi rata) */
  const [lyrBusy, setLyrBusy] = useState(false);
  const [lyrMsg, setLyrMsg] = useState("");
  const [autoLines, setAutoLines] = useState<string[]>([]);

  async function autoPasLirik() {
    if (!audioUrl && !bufRef.current) { setLyrMsg("⚠️ Isi musik dulu di langkah 1."); return; }
    setLyrBusy(true); setLyrMsg("🎤 Mendengarkan audio & deteksi kata… (bisa 30-60 detik)");
    try {
      // 1) Ambil blob audio (dari URL atau buffer)
      let blob: Blob;
      if (audioUrl && !audioUrl.startsWith("blob:")) {
        const r = await fetch(proxify(audioUrl));
        blob = await r.blob();
      } else {
        // konversi AudioBuffer → WAV
        const b = bufRef.current!;
        const ch = b.numberOfChannels, sr = b.sampleRate;
        const n = Math.floor(b.duration * sr);
        const pcm = new Float32Array(n * ch);
        for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) pcm[i * ch + c] = d[i]; }
        const wavBuf = new ArrayBuffer(44 + n * ch * 2);
        const dv = new DataView(wavBuf);
        const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        ws(0, "RIFF"); dv.setUint32(4, 36 + n * ch * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
        dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
        ws(36, "data"); dv.setUint32(40, n * ch * 2, true);
        for (let i = 0; i < n * ch; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
        blob = new Blob([wavBuf], { type: "audio/wav" });
      }
      // 2) Transkripsi (Whisper) → kata + timestamp
      const res = await transcribeBlobBesar(blob, "id");
      if (!res?.ok || !Array.isArray(res.words) || !res.words.length) {
        setLyrMsg("⚠️ Tidak ada kata terdeteksi (lagu instrumental? coba yang ada vokalnya).");
        return;
      }
      // 3) Kelompokkan kata jadi BARIS (baris baru tiap jeda >0.8s atau panjang)
      const words = res.words as { w: string; start: number; end: number }[];
      const lines: string[] = [];
      const grouped: { w: string; start: number; end: number; line: number }[] = [];
      let cur = "", curStart = words[0].start, curEnd = words[0].end, li = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const gap = i > 0 ? w.start - words[i - 1].end : 0;
        if (gap > 0.8 || cur.length > 60) {
          lines.push(cur.trim()); grouped.push({ w: cur.trim(), start: curStart, end: curEnd, line: li }); li++;
          cur = w.w; curStart = w.start; curEnd = w.end;
        } else {
          cur = cur ? cur + " " + w.w : w.w; curEnd = w.end;
        }
      }
      if (cur.trim()) { lines.push(cur.trim()); grouped.push({ w: cur.trim(), start: curStart, end: curEnd, line: li }); }
      // 4) Simpan → lyricsText (baris) & autoWords (timing presisi)
      setAutoLines(lines);
      autoWordsRef.current = grouped;
      setLyrAuto(true);
      setLyricsText(lines.join("\n"));
      setLyrMsg(`✅ ${words.length} kata terdeteksi → ${lines.length} baris. Timing PAS audio, cek preview!`);
    } catch (e) {
      setLyrMsg(`⚠️ Gagal: ${e instanceof Error ? e.message : "coba lagi"}`);
    } finally {
      setLyrBusy(false);
    }
  }
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
    const N = barCount; // 🎛️ v19.14: jumlah bar bisa diatur
    let bass = 0;
    if (freq) {
      const step = Math.floor(freq.length * 0.72 / N);
      for (let i = 0; i < N; i++) {
        let s = 0; for (let k = 0; k < step; k++) s += freq[Math.min(freq.length - 1, i * step + k)];
        const v = (s / step) / 255;
        barsRef.current[i] = barsRef.current[i] * 0.35 + v * 0.65;
      }
      for (let i = 0; i < 8; i++) bass += barsRef.current[i]; bass /= 8;
      // 🩰 v19.16: estimasi "tempo/energi" dari distribusi frekuensi —
      // bass kuat + treble = cepat; rata & pelan = lambat/syahdu
      let treble = 0, nT = 0;
      for (let i = Math.floor(N * 0.5); i < N; i++) { treble += barsRef.current[i]; nT++; }
      treble /= Math.max(1, nT);
      const target = Math.min(1, Math.max(0, bass * 0.55 + treble * 0.65));
      tempoRef.current = tempoRef.current * 0.85 + target * 0.15; // smoothing
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
    // 🎬 v19.12: GLOW BERGERAK di background (ala Trap Nation) — bikin nggak polos
    const gb2 = ctx.createRadialGradient(W / 2 + Math.sin(t * 0.3) * W * 0.15, H * 0.32 + Math.cos(t * 0.4) * H * 0.12, 40, W / 2, H / 2, Math.max(W, H));
    gb2.addColorStop(0, `rgba(${r},${g2},${b},${((0.10 + bass * 0.16) * glowInt).toFixed(3)})`);
    gb2.addColorStop(0.5, "rgba(0,0,0,0)"); gb2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gb2; ctx.fillRect(0, 0, W, H);

    // 👑 v19.13 AURORA — 3 gumpalan cahaya bergerak pelan + bintang berkelip (murah, tanpa shadowBlur)
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const aur = [
      { x: W * 0.2, y: H * 0.25, r: W * 0.5, sp: 0.3, a: (0.10 + bass * 0.05) * glowInt },
      { x: W * 0.8, y: H * 0.7, r: W * 0.55, sp: 0.22, a: (0.08 + bass * 0.04) * glowInt },
      { x: W * 0.5, y: H * 0.5, r: W * 0.6, sp: 0.16, a: 0.07 * glowInt },
    ];
    for (let i = 0; i < aur.length; i++) {
      const A = aur[i];
      const ax = A.x + Math.sin(t * A.sp + i * 2.1) * W * 0.08;
      const ay = A.y + Math.cos(t * A.sp * 0.8 + i * 1.7) * H * 0.06;
      const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, A.r);
      ag.addColorStop(0, `rgba(${r},${g2},${b},${A.a.toFixed(3)})`);
      ag.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
    }
    if (!starsRef.current.length) {
      for (let i = 0; i < 70; i++) starsRef.current.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.6 + 0.4, ph: Math.random() * 6.28 });
    }
    for (const s of starsRef.current) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + s.ph));
      ctx.fillStyle = `rgba(255,255,255,${(tw * 0.6).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 🩰 v19.16 MULTI-GAMBAR "MENARI IKUT IRAMA" — zoom & geser halus mengikuti energi musik
    // (cepat saat drum/bass cepat, syahdu saat lambat). Tetap background, spectrum keliatan.
    if (multiImgsRef.current.length >= 1) {
      const tempo = tempoRef.current; // 0..1 (energi musik sekarang) — dipakai buat timing pergantian (bukan goyang)
      const imgs = multiImgsRef.current;
      const beatLen = 60 / 96;
      const period = beatLen * Math.max(1, multiBeat);
      const idx = Math.floor(t / period) % Math.max(1, imgs.length);
      const prevIdx = (idx - 1 + imgs.length) % imgs.length;
      const within = (t % period) / period;
      const fade = within < 0.25 ? within / 0.25 : 1;
      const im = imgs[idx];
      const imPrev = imgs[prevIdx];
      // 🐛 v19.17: HAPUS goyang ikut lagu (feedback user: "nggak suka goyang-goyang").
      // Sekarang pergantian gambar KALEM: zoom super halus (tarikan napas) + fade,
      // kayak slideshow sinematik — bukan denyut/getak.
      const zoom = 1 + (danceZoom || 0) * 0.5 * Math.abs(Math.sin(t * 0.7));
      const swayX = 0; // tanpa goyang kiri-kanan
      const drawBg = (im2: HTMLImageElement, alpha: number, z: number, swx: number) => {
        if (!im2 || !(im2 as any).complete || !(im2 as any).naturalWidth) return;
        const iw = (im2 as any).naturalWidth, ih = (im2 as any).naturalHeight;
        const ir = iw / ih, cr = W / H;
        let sw = iw, sh = ih, sx = 0, sy = 0;
        if (ir > cr) { sw = ih * cr; sx = (iw - sw) / 2; }
        else { sh = iw / cr; sy = (ih - sh) / 2; }
        const dw = W * z, dh = H * z;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.drawImage(im2, sx, sy, sw, sh, (W - dw) / 2 + swx, (H - dh) / 2, dw, dh);
        ctx.restore();
      };
      drawBg(imPrev, (1 - fade) * 0.5, zoom * 0.98, swayX * 0.5);
      drawBg(im, 0.5 * fade + 0.5, zoom, swayX);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H); // scrim tipis
    }

    // ---- spectrum styles (🎬 v19.12: upgrade WAH — glow, reflection, gradien 3 warna, center glow) ----
    if (specStyle === "bars") {
      const bw = W / N;
      const baseY = H - 8;
      const grad3 = ctx.createLinearGradient(0, H, 0, 0);
      grad3.addColorStop(0, acc);
      grad3.addColorStop(0.5, `rgb(${Math.min(255, Math.round(r * 0.55 + 139))},${Math.min(255, Math.round(g2 * 0.45 + 85))},255)`);
      grad3.addColorStop(1, "#22d3ee");
      // reflection bawah (flip) + glow
      ctx.save(); ctx.globalAlpha = 0.26; ctx.translate(0, baseY + 4); ctx.scale(1, -0.45);
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const h = Math.max(3, v * H * 0.4);
        ctx.fillStyle = grad3;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(i * bw + bw * 0.16, 0, bw * 0.68, h, bw * 0.3);
        else ctx.rect(i * bw + bw * 0.16, 0, bw * 0.68, h);
        ctx.fill();
      }
      ctx.restore();
      // bars utama + glow MURAH (lighter — tanpa shadowBlur yang bikin HP berat)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const glowBg = ctx.createRadialGradient(W / 2, baseY, 0, W / 2, baseY, H * 0.5);
      glowBg.addColorStop(0, `rgba(${r},${g2},${b},${((0.16 + bass * 0.18) * glowInt).toFixed(3)})`);
      glowBg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowBg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const h = Math.max(3, v * H * 0.62);
        ctx.fillStyle = grad3;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(i * bw + bw * 0.16, baseY - h, bw * 0.68, h, bw * 0.3);
        else ctx.rect(i * bw + bw * 0.16, baseY - h, bw * 0.68, h);
        ctx.fill();
      }
      // lingkar bass di bawah tengah
      ctx.beginPath(); ctx.arc(W / 2, H - 46, 10 + bass * 26, 0, Math.PI * 2);
      ctx.fillStyle = acc; ctx.globalAlpha = 0.45 + bass * 0.5; ctx.fill(); ctx.globalAlpha = 1;
    } else if (specStyle === "mirror") {
      const bw = W / N; const cy = H * 0.56;
      ctx.save();
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const h = Math.max(2, v * H * 0.28);
        const grd = ctx.createLinearGradient(0, cy - h, 0, cy + h);
        grd.addColorStop(0, `rgb(${Math.min(255, r + 60)},${Math.min(255, g2 + 40)},255)`);
        grd.addColorStop(1, acc);
        ctx.fillStyle = grd; ctx.globalAlpha = 0.95;
        ctx.fillRect(i * bw + bw * 0.18, cy - h, bw * 0.64, h);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(i * bw + bw * 0.18, cy + 3, bw * 0.64, h * 0.85);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (specStyle === "circle") {
      const cx = W / 2, cy = H / 2; const R = Math.min(W, H) * 0.22;
      ctx.save(); ctx.translate(cx, cy);
      ctx.lineWidth = 3;
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const len = Math.max(2, v * R * 1.2);
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2 + t * 0.15;
        ctx.save(); ctx.rotate(ang);
        const grd = ctx.createLinearGradient(R, 0, R + len, 0);
        grd.addColorStop(0, acc); grd.addColorStop(1, `rgba(${r},${g2},${b},0.05)`);
        ctx.fillStyle = grd;
        ctx.fillRect(R, -Math.max(1, Math.min(W, H) * 0.007), len, Math.max(2, Math.min(W, H) * 0.014));
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g2},${b},0.5)`; ctx.lineWidth = 2; ctx.stroke();
      // center glow ikut bass (ala NCS)
      const gr = R * (0.55 + bass * 0.4);
      const rgc = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
      rgc.addColorStop(0, "rgba(255,255,255,0.85)");
      rgc.addColorStop(0.4, `rgba(${r},${g2},${b},0.55)`);
      rgc.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rgc; ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (specStyle === "wave") {
      const cy = H * 0.55;
      ctx.save();
      for (const [alpha, amp] of [[0.95, 1], [0.4, 1.6], [0.2, 2.3]] as any[]) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const i = Math.floor((x / W) * (N - 1));
          const y = cy + Math.sin(x * 0.012 * amp + t * 3) * (10 + bars[i] * H * 0.2) - bars[i] * H * 0.06;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = acc; ctx.globalAlpha = alpha; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else { // dots/partikel
      ctx.save();
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const ang = (i / N) * Math.PI * 2 + t * 0.25;
        const rr = Math.min(W, H) * (0.12 + v * 0.3);
        const x = W / 2 + Math.cos(ang) * rr;
        const y = H / 2 + Math.sin(ang) * rr;
        ctx.globalAlpha = 0.25 + v * 0.75;
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, Math.min(W, H) * (0.004 + v * 0.012)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // 🎢 v19.15 EFEK 3D TUNNEL — perspektif kedalaman: bar melesat menjauh dari pusat (ala tunnel-3d.jpg)
    if (specStyle === "tunnel") {
      const cx = W / 2, cy = H / 2;
      const layers = Math.max(12, Math.min(80, tunnelDepth));
      const off = t * (0.4 + tunnelSpeed * 1.1);
      ctx.save();
      // glow pusat tunnel
      const tg0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.5);
      tg0.addColorStop(0, `rgba(${r},${g2},${b},${(0.10 + bass * 0.14) * glowInt})`);
      tg0.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg0; ctx.fillRect(0, 0, W, H);
      // lapisan persegi perspektif (semakin jauh semakin kecil & redup)
      for (let i = 0; i < layers; i++) {
        const z = (i / layers) * 1.6;
        const zz = (i + off) % layers / layers;
        const s = Math.max(0.04, 1 - zz); // ukuran relatif
        const size = Math.min(W, H) * s;
        const v = bars[Math.floor(i % N)]; // energi per lapisan
        const alpha = 0.04 + v * 0.16 * (1 - zz * 0.7);
        ctx.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g2 + 40)},255,${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, s * 10 + bass * 6);
        // rotasi pelan per lapisan (efek spiral)
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(z * 0.6 + t * 0.05 * tunnelSpeed);
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      // garis-garis radial (dinding tunnel) — menciptakan kedalaman
      ctx.strokeStyle = `rgba(${r},${g2},${b},0.25)`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.08 * tunnelSpeed;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * Math.max(W, H), cy + Math.sin(a) * Math.max(W, H));
        ctx.stroke();
      }
      // bar radial melesat (seperti spectrum di dalam tunnel)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < N; i++) {
        const v = bars[i];
        const a = (i / N) * Math.PI * 2 + t * 0.2 * tunnelSpeed;
        const len = 20 + v * Math.min(W, H) * 0.45;
        const grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        grd.addColorStop(0, `rgba(${r},${g2},${b},0.7)`); grd.addColorStop(1, `rgba(${r},${g2},${b},0)`);
        ctx.strokeStyle = grd; ctx.lineWidth = 3 + v * 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
        ctx.lineTo(cx + Math.cos(a) * (40 + len), cy + Math.sin(a) * (40 + len));
        ctx.stroke();
      }
      ctx.restore();
    }
    // 👑 v19.13 PRO PACK: SHOCKWAVE — cincin membesar saat bass naik
    // 🐛 FIX v19.16.1: shockwave/logo/ember DIPINDAHKAN keluar if/else —
    // dulu terjebak di else → saat tunnel dipilih logo tidak muncul.
    if (bass > 0.52 && bass > lastBassRef.current * 1.18) {
      shockRef.current.push({ x: W / 2, y: H * 0.55, r: 50, a: 0.85 });
      if (shockRef.current.length > 6) shockRef.current.shift();
    }
    lastBassRef.current = bass;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = shockRef.current.length - 1; i >= 0; i--) {
      const s = shockRef.current[i];
      s.r += H * 0.045; s.a *= 0.9;
      if (s.a < 0.03) { shockRef.current.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${r},${g2},${b},${s.a.toFixed(3)})`;
      ctx.lineWidth = Math.max(2, H * 0.02 * s.a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // 👑 v19.13/v19.14 PRO PACK: LOGO PUSAT — denyut ikut bass + sinar berputar + ring
    // 🎛️ v19.14: posisi bebas (drag), skala, kecepatan rotasi, mode ikut-beat
    const punyaLogo = logoImgRef.current || title.trim() || mTitle.trim();
    if (punyaLogo) {
      const cx = logoPos.x * W, cy = logoPos.y * H;
      const beatK = beatMode === "statis" ? 0 : 1; // denyut/membesar pakai bass
      const beatBoost = beatMode === "membesar" ? 0.10 : 0.05;
      const logoR = Math.min(W, H) * (0.11 * logoScale + bass * beatBoost * beatK);
      ctx.save();
      // sinar (god rays) berputar
      ctx.translate(cx, cy); ctx.rotate(t * rotSpeed);
      ctx.globalCompositeOperation = "lighter";
      const RAYS = 12;
      for (let i = 0; i < RAYS; i++) {
        const ang0 = (i / RAYS) * Math.PI * 2;
        ctx.save(); ctx.rotate(ang0);
        const rg = ctx.createLinearGradient(0, 0, logoR * 3.4, 0);
        rg.addColorStop(0, `rgba(${r},${g2},${b},${(0.30 + bass * 0.25).toFixed(3)})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(logoR * 3.4, -logoR * 0.16);
        ctx.lineTo(logoR * 3.4, logoR * 0.16);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      // glow pusat
      const lg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, logoR * 2.2);
      lg2.addColorStop(0, "rgba(255,255,255,0.9)");
      lg2.addColorStop(0.18, `rgba(${r},${g2},${b},0.8)`);
      lg2.addColorStop(0.45, `rgba(${r},${g2},${b},0.28)`);
      lg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg2;
      ctx.beginPath(); ctx.arc(cx, cy, logoR * 2.2, 0, Math.PI * 2); ctx.fill();
      // ring dalam ikut beat
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2 + bass * 3;
      ctx.beginPath(); ctx.arc(cx, cy, logoR * (0.9 + bass * 0.18), 0, Math.PI * 2); ctx.stroke();
      // ring luar putus-putus berputar
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * rotSpeed * 1.4);
      ctx.strokeStyle = `rgba(${r},${g2},${b},0.55)`;
      ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, logoR * 1.55, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // logo gambar / teks
      if (logoImgRef.current) {
        const size = logoR * 1.5;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logoImgRef.current, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const fs = Math.min(logoR * 0.34, 54);
        ctx.font = `900 ${fs}px 'Poppins',system-ui,sans-serif`;
        const words = (title || mTitle).split(" ");
        const l1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
        const l2 = words.slice(Math.ceil(words.length / 2)).join(" ");
        if (l2) { ctx.fillText(l1, cx, cy - fs * 0.55); ctx.fillText(l2, cx, cy + fs * 0.55); }
        else ctx.fillText(l1, cx, cy);
      }
    }

    // 👑 v19.13 PRO PACK: EMBER NAIK — partikel ringan (murah, tanpa shadowBlur)
    if (!embersRef.current.length) {
      for (let i = 0; i < 30; i++) embersRef.current.push({
        x: Math.random() * W, y: H + Math.random() * H * 0.4,
        vx: (Math.random() - 0.5) * 0.4, vy: -(0.25 + Math.random() * 0.5),
        r: Math.random() * 2 + 1, ph: Math.random() * 6.28,
      });
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const e of embersRef.current) {
      e.y += e.vy; e.x += e.vx + Math.sin(t * 1.2 + e.ph) * 0.3;
      if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + e.ph));
      ctx.fillStyle = `rgba(${r},${g2},${b},${(tw * 0.5).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + bass * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // overlay suasana
    if (overlay !== "none") paintEffect(ctx, W, H, overlay, t, true);

    // 👑 v19.13/v19.14 judul pro + info bar ala video visualizer (TRACK / EFFECT)
    // 🎛️ v19.14: posisi judul bisa di-drag bebas
    if (title.trim()) {
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const L = LAYOUTS[layoutId] || LAYOUTS["logo-tengah"];
      const tfs = Math.round(H * 0.055 * L.titleScale);
      const tx = titlePos.x * W, ty = titlePos.y * H;
      ctx.font = `900 ${tfs}px 'Poppins',system-ui,sans-serif`;
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = Math.round(tfs * 0.16); ctx.lineJoin = "round";
      ctx.strokeText(title, tx, ty);
      const tg = ctx.createLinearGradient(0, ty, 0, ty + tfs);
      tg.addColorStop(0, "#ffffff"); tg.addColorStop(1, `rgb(${Math.min(255, r + 60)},${Math.min(255, g2 + 40)},255)`);
      ctx.fillStyle = tg; ctx.fillText(title, tx, ty);
      // info bar kecil (ala video pro: TRACK • EFFECT)
      ctx.font = `700 ${Math.round(H * 0.02)}px 'Poppins',sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const info = `TRACK: ${(mTitle || audioName || "VERVE SPECTRUM").toUpperCase()}  ·  EFFECT: ${specStyle.toUpperCase()}`;
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.strokeText(info, W / 2, H - H * 0.03);
      ctx.fillStyle = `rgba(${r},${g2},${b},1)`;
      ctx.fillText(info, W / 2, H - H * 0.03);
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
  }, [bgType, bgColor, bgGrad, specStyle, overlay, title, mTitle, audioName, lirikOn, capWords, tpl, rgb, seamless,
    barCount, logoPos, titlePos, logoScale, rotSpeed, glowInt, beatMode, layoutId, tunnelSpeed, tunnelDepth, multiImgs, multiBeat, danceMode, danceZoom]); // 🐛 FIX v19.15.1: semua param kustomisasi wajib jadi dep — tanpa ini slider/drag nggak ngefek di preview

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
              style={{ width: "100%", borderRadius: 14, border: dragMode ? "2px solid rgba(139,92,246,.7)" : "1px solid rgba(255,255,255,.14)", background: "#000", aspectRatio: `${dim.w}/${dim.h}`, touchAction: "none", cursor: dragMode ? "crosshair" : "default" }}
              onPointerDown={(e) => {
                // 🐛 FIX v19.15.1: drag LANGSUNG tanpa toggle — hit-test posisi logo & judul
                const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;
                const tol = 0.12; // jarak sentuh yang dianggap "kena"
                const dLogo = Math.hypot(x - logoPos.x, y - logoPos.y);
                const dTitle = Math.hypot(x - titlePos.x, y - titlePos.y);
                if (dLogo <= tol && (dLogo <= dTitle || !title.trim())) {
                  dragRef.current = { x, y, target: "logo" as const };
                } else if (dTitle <= tol && title.trim()) {
                  dragRef.current = { x, y, target: "judul" as const };
                } else {
                  dragRef.current = null;
                }
                try { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch { /* aman */ }
              }}
              onPointerMove={(e) => {
                if (!dragRef.current) return;
                const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
                const x = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width));
                const y = Math.min(0.9, Math.max(0.04, (e.clientY - r.top) / r.height));
                if (dragRef.current.target === "logo") setLogoPos({ x, y });
                else setTitlePos({ x, y });
                try { localStorage.setItem("verve_spektrum_drag", "1"); } catch { /* abaikan */ } // 🐛 FIX: tanda user pernah geser manual
              }}
              onPointerUp={() => { dragRef.current = null; }}
            />
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
            {/* 🎛️ v19.14 KUSTOMISASI PRO — layout, geser, slider, ikut-beat */}
            <div className="v6-lbl">🎛️ ATURAN / LAYOUT</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {Object.entries(LAYOUTS).map(([id, L]) => (
                <button key={id} className={`v6-chip ${layoutId === id ? "on" : ""}`} onClick={() => setLayout(id)}>
                  {id === "logo-tengah" ? "🎯 Logo Tengah" : id === "logo-kiri" ? "⬅ Logo Kiri" : id === "logo-kanan" ? "Logo Kanan ➡" : id === "logo-atas" ? "⬆ Logo Atas" : id === "logo-bawah" ? "⬇ Logo Bawah" : "🅰 Judul Besar"}
                </button>
              ))}
            </div>
            <div className="v6-lbl">✋ GESER POSISI (🐛 FIX: langsung seret di preview — sentuh logo/judul, geser)</div>
            <p style={{ fontSize: 10, opacity: .6, margin: "0 0 4px" }}>Nggak perlu mode lagi — sentuh & seret logo/judul langsung di preview. Logo & judul bisa dipindah bebas kiri/kanan/atas/bawah.</p>
            <div className="v6-lbl">🖼 GAMBAR IKUT BEAT</div>
            <div className="v6-chips" style={{ padding: 0 }}>
              {[["denyut", "💓 Denyut"], ["membesar", "📈 Membesar"], ["statis", "🚫 Statis"]].map(([id, lb]) => (
                <button key={id} className={`v6-chip ${beatMode === id ? "on" : ""}`} onClick={() => setBeatMode(id as any)}>{lb}</button>
              ))}
            </div>
            {/* 🎨 v19.15 TEMA WARNA SIAP-PAKAI */}
            <div className="v6-lbl">🎨 TEMA WARNA SIAP-PAKAI</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {COLOR_THEMES.map((t) => (
                <button key={t.id} className={`v6-chip ${themeId === t.id ? "on" : ""}`} style={{ borderColor: themeId === t.id ? t.color : undefined, color: themeId === t.id ? t.color : undefined }} onClick={() => pilihTema(t.id)}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            {/* 🖼️ v19.15 MODE MULTI-GAMBAR — perjelas apa maksudnya */}
            <div className="v6-lbl">🖼️ MULTI-GAMBAR (background bergantian — 2+ gambar)</div>
            <label className="v6-cardrow">
              <span style={{ fontSize: 20 }}>🖼️</span><div className="tt">{multiImgs.length ? `✅ ${multiImgs.length} gambar — ganti bergantian (ikut lagu)` : "Pilih 2-6 gambar → ganti-ganti otomatis tiap beberapa ketukan"}</div><span className="arr">›</span>
              <input type="file" accept="image/*" multiple hidden onChange={e => {
                const fs2 = Array.from(e.target.files || []).slice(0, 6);
                const readers = fs2.map(f => new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.readAsDataURL(f); }));
                Promise.all(readers).then(imgs => setMultiImgs(imgs));
              }} />
            </label>
            <p style={{ fontSize: 10, opacity: .6, margin: "4px 0 0" }}>Gunanya: video nggak gitu-gitu aja — latar berganti-ganti + sedikit zoom mengikuti lagu. Spectrum tetap tampil di atasnya. Kalau nggak butuh, biarkan kosong.</p>
            {multiImgs.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, opacity: .6, flex: 1 }}>Ganti tiap:</span>
                  <select value={multiBeat} onChange={(e) => setMultiBeat(Number(e.target.value))} style={{ background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "4px 8px", fontSize: 11 }}>
                    {[1, 2, 4, 8].map((n) => <option key={n} value={n}>⏱ {n} ketukan (≈{((60 / 96) * n).toFixed(1)} dtk)</option>)}
                  </select>
                  <button className="v6-chip" onClick={() => setMultiImgs([])}>🗑 Bersihkan</button>
                </div>
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 96 }}>Zoom halus</span>
                  <input type="range" min={0} max={0.1} step={0.005} value={danceZoom} onChange={(e) => setDanceZoom(Number(e.target.value))} style={{ flex: 1 }} />
                  <b style={{ minWidth: 28 }}>{(danceZoom * 100).toFixed(0)}%</b>
                </label>
                <p style={{ fontSize: 10, opacity: .6, margin: 0 }}>🐛 FIX: goyang-goyang dihapus — sekarang pergantian gambar kalem (fade + zoom napas halus), kayak slideshow sinematik. Spectrum tetap tampil.</p>
              </div>
            )}

            {/* 🎢 v19.15 Slider khusus TUNNEL */}
            {specStyle === "tunnel" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0" }}>
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 96 }}>Kecepatan tunnel</span>
                  <input type="range" min={0.2} max={2.5} step={0.1} value={tunnelSpeed} onChange={(e) => setTunnelSpeed(Number(e.target.value))} style={{ flex: 1 }} />
                  <b style={{ minWidth: 28 }}>{tunnelSpeed.toFixed(1)}</b>
                </label>
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 96 }}>Kedalaman</span>
                  <input type="range" min={12} max={80} step={4} value={tunnelDepth} onChange={(e) => setTunnelDepth(Number(e.target.value))} style={{ flex: 1 }} />
                  <b style={{ minWidth: 28 }}>{tunnelDepth}</b>
                </label>
              </div>
            )}

            {/* 💾 v19.15 SIMPAN PRESET KUSTOM */}
            <div className="v6-lbl">💾 SIMPAN / MUAT PRESET KUSTOM</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="v6-inp" style={{ flex: 1 }} placeholder="Nama preset (mis. 'Trap Gold + Tunnel')" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <button className="v6-chip" onClick={simpanPreset}>💾 Simpan</button>
            </div>
            {!!daftarPreset().length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {daftarPreset().map((n) => (
                  <div key={n} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button className="v6-chip" style={{ flex: 1 }} onClick={() => muatPreset(n)}>▶ Muat "{n}"</button>
                    <button className="v6-chip" style={{ color: "#f87171" }} onClick={() => hapusPreset(n)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
            {!!presetMsg && <p style={{ fontSize: 11, color: presetMsg.startsWith("✅") ? "#6ee7b7" : "#fbbf24", margin: "6px 0 0" }}>{presetMsg}</p>}

            <div className="v6-lbl">⚙️ PENGATURAN</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0" }}>
              <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 96 }}>Jumlah bar</span>
                <input type="range" min={24} max={128} step={8} value={barCount} onChange={(e) => setBarCount(Number(e.target.value))} style={{ flex: 1 }} />
                <b style={{ minWidth: 28 }}>{barCount}</b>
              </label>
              <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 96 }}>Ukuran logo</span>
                <input type="range" min={0.5} max={2} step={0.1} value={logoScale} onChange={(e) => setLogoScale(Number(e.target.value))} style={{ flex: 1 }} />
                <b style={{ minWidth: 28 }}>{logoScale.toFixed(1)}×</b>
              </label>
              <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 96 }}>Putar sinar</span>
                <input type="range" min={0} max={1.5} step={0.1} value={rotSpeed} onChange={(e) => setRotSpeed(Number(e.target.value))} style={{ flex: 1 }} />
                <b style={{ minWidth: 28 }}>{rotSpeed.toFixed(1)}</b>
              </label>
              <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 96 }}>Intensitas glow</span>
                <input type="range" min={0.3} max={2} step={0.1} value={glowInt} onChange={(e) => setGlowInt(Number(e.target.value))} style={{ flex: 1 }} />
                <b style={{ minWidth: 28 }}>{glowInt.toFixed(1)}×</b>
              </label>
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
            <div className="v6-lbl">👑 LOGO CHANNEL DI TENGAH (opsional — ala Trap Nation)</div>
            <label className="v6-cardrow">
              <span style={{ fontSize: 20 }}>📛</span><div className="tt">{logoImg ? "✅ Logo dipilih — ganti?" : "Upload logo (bulat) — denyut ikut bass"}</div><span className="arr">›</span>
              <input type="file" accept="image/*" hidden onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                const rd = new FileReader(); rd.onload = () => setLogoImg(rd.result as string); rd.readAsDataURL(f);
              }} />
            </label>
            {!logoImg && <p style={{ fontSize: 10, opacity: .55, margin: "2px 0 0" }}>Tanpa logo → judul/teks jadi pusat berdenyut. Plus otomatis: sinar cahaya berputar, shockwave saat bass, bintang & ember.</p>}
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
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <button className="v6-chip" style={{ flex: 1, borderColor: "rgba(34,197,94,.5)", color: "#86efac", background: "rgba(34,197,94,.1)" }} disabled={lyrBusy} onClick={autoPasLirik}>
                    {lyrBusy ? "⏳ Mendengar audio…" : "🎤 Auto-pas Lirik ke Audio (pas banget)"}
                  </button>
                  {lyrAuto && <button className="v6-chip" style={{ color: "#fbbf24" }} onClick={() => { setLyrAuto(false); autoWordsRef.current = []; }}>↺ Manual</button>}
                </div>
                {!!lyrMsg && <p style={{ fontSize: 11, color: lyrMsg.startsWith("✅") ? "#86efac" : "#fbbf24", margin: "0 0 6px" }}>{lyrMsg}</p>}
                {lyrAuto && <p style={{ fontSize: 10, opacity: .7, margin: "0 0 6px" }}>✨ Timing dari deteksi suara asli (Whisper) — setiap kata menyala PERSIS saat dinyanyikan, bukan dibagi rata.</p>}
                <textarea className="v6-inp v6-ta" style={{ minHeight: 130 }} placeholder={"Tempel lirik di sini — satu baris = satu keterangan.\nKata akan menyala satu per satu pas dinyanyikan ✨"} value={lyricsText} onChange={e => { setLyricsText(e.target.value); setLyrAuto(false); }} />
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
