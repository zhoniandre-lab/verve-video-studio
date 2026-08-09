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
import SunoPanel from "@/components/SunoPanel"; // 🎵 v19.29: generate lagu (sama seperti di Lahan)
import { cariKlimaksBuffer, energiPerDetik, hitungPuncak } from "@/lib/climax"; // 🎬 v19.32: deteksi bagian paling seru (Dual Render)
import { buildAudioChain } from "@/lib/audio-chain"; // 🎚 v19.33: rantai EQ/kompresor shared (live + offline)
import { renderOfflineVideo, cekRenderOfflineMampu } from "@/lib/render-offline"; // ⚡ v19.33: mesin render KUAT (WebCodecs, anti-kepotong)
import { deteksiBeats, bpmDariBeats } from "@/lib/beats"; // 🥁 v19.36: deteksi beat & BPM (timeline beat)
import { hitungFreqFramesChunked } from "@/lib/fft"; // 🎛 v19.39: FFT frekuensi ASLI → spektrum render akurat
import type { FreqFrames } from "@/lib/fft";
import { SUB_STYLES, SUB_ANIMS, hitungSubState, gambarSubscribe } from "@/lib/subscribe"; // 🔔 v19.40: tombol subscribe animasi
import type { SubStyle, SubAnim } from "@/lib/subscribe";
import { FRAME_STYLES, gambarFrame } from "@/lib/frames"; // 🖼️ v19.44: frame layout mewah
import { FONT_OPTS, TEXT_DEFAULT, TEKS_WARNA, gambarTeksCustom } from "@/lib/textstyles"; // ✏️ v19.44: teks custom
import type { TextStyle } from "@/lib/textstyles";

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
  { id: "bars-h", label: "↔ Horizontal", desc: "Bar dari kiri (v19.36)" },
  { id: "line", label: "➖ Line", desc: "Garis mulus + glow (v19.36)" },
  { id: "waveform", label: "〰️ Waveform", desc: "Simetris tengah (v19.36)" },
  // 💎 v19.43: SPEKTRUM MEWAH baru
  { id: "ring", label: "💍 Ring", desc: "Cincin ganda berdenyut (v19.43)" },
  { id: "dual", label: "🪞 Dual", desc: "Kiri-kanan simetris dari tengah (v19.43)" },
  { id: "flame", label: "🔥 Bara", desc: "Gradien api + glow (v19.43)" },
];
/** 🧩 v19.36: definisi lapisan (order gambar: bawah → atas) */
const LAYER_DEFS = [
  { id: "spektrum", label: "📊 Spectrum" },
  { id: "spektrumMini", label: "🎯 Spektrum Mini" },
  { id: "gambar", label: "🖼️ Multi-gambar" },
  { id: "teks", label: "✏️ Teks" },
  { id: "logo", label: "📛 Logo & Judul" },
  { id: "overlay", label: "🌧️ Overlay suasana" },
  { id: "partikel", label: "✨ Partikel (ember)" },
  { id: "subscribe", label: "🔔 Tombol Subscribe" },
];
/** 💎 v19.46: UI KONSEP A — grid kartu 2 kolom untuk navigasi setting Visual */
const UI_CARDS = [
  { id: "gaya", ic: "📊", label: "Gaya Spectrum", sub: "12 tipe" },
  { id: "subscribe", ic: "📣", label: "Subscribe", sub: "gaya · teks · durasi" },
  { id: "frame", ic: "🖼️", label: "Frame", sub: "8 bingkai mewah" },
  { id: "teks", ic: "✏️", label: "Teks", sub: "font · warna · 3D" },
  { id: "spektrumMini", ic: "🎯", label: "Spektrum Mini", sub: "drag & cubit" },
  { id: "spektrum", ic: "🎛️", label: "Setting Bars", sub: "jumlah · glow · warna" },
  { id: "latar", ic: "🌌", label: "Latar", sub: "gradasi · foto · AI" },
  { id: "lapisan", ic: "🧩", label: "Lapisan", sub: "tampil / sembunyi" },
  { id: "gambar", ic: "🖼️", label: "Gambar", sub: "multi-gambar" },
  { id: "preset", ic: "💾", label: "Preset", sub: "simpan / muat" },
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
  // 🎵 v19.29: panel generate lagu (Suno) — sama persis dengan di Lahan
  const [showSuno, setShowSuno] = useState(false);
  const [sunoTitle, setSunoTitle] = useState("");
  const [audioName, setAudioName] = useState("");
  const [duration, setDuration] = useState(0);
  const [mTitle, setMTitle] = useState("");
  const [mLyrics, setMLyrics] = useState("");
  const [mGenre, setMGenre] = useState("pop ballad");
  const [mMood, setMMood] = useState("emotional, dreamy");
  const [mBusy, setMBusy] = useState(false);
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
  // 🧩 v19.36 LAPISAN — visibilitas & transparansi tiap elemen
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>({ spektrum: true, spektrumMini: true, gambar: true, teks: true, logo: true, overlay: true, partikel: true, subscribe: true });
  const [layerOp, setLayerOp] = useState<Record<string, number>>({});
  // 🥁 v19.36 BEAT & BPM — dari analisis audio (timeline beat)
  const [beatsArr, setBeatsArr] = useState<number[]>([]);
  const [bpmN, setBpmN] = useState(0);
  const beatsRef = useRef<number[]>([]);
  // 🎛 v19.39: FFT frekuensi asli — dipakai render (bukan synthBars) biar spektrum akurat
  const freqFramesRef = useRef<FreqFrames | null>(null);
  // 🎛 peaks asli (per 0.25 dtk) — dipakai animasi subscribe saat render offline
  const peaksRef = useRef<number[]>([]);
  const multiImgsRef = useRef<HTMLImageElement[]>([]);
  const tempoRef = useRef(0.5); // 🩰 estimasi energi musik 0..1 (untuk gambar "menari")
  // 🎢 v19.15 EFEK 3D TUNNEL
  const [tunnelSpeed, setTunnelSpeed] = useState(1);
  const [tunnelDepth, setTunnelDepth] = useState(40); // jumlah lapisan
  // 💾 v19.15 SIMPAN PRESET KUSTOM
  const [presetName, setPresetName] = useState("");
  const [presetMsg, setPresetMsg] = useState("");
  const [dragMode, setDragMode] = useState<"logo" | "judul" | null>(null);
  const dragRef = useRef<{ x: number; y: number; target: "logo" | "judul" | "subscribe" | "float" | "teks" } | null>(null);
  // 🤏 v19.40: pinch 2 jari buat ukuran tombol subscribe
  const ptrsCanvas = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchSub = useRef<{ d0: number; s0: number } | null>(null);
  // 🔔 v19.40 TOMBOL SUBSCRIBE ANIMASI — banyak gaya, geser jari, cubit buat ukuran
  const [subOn, setSubOn] = useState(false);
  const [subStyle, setSubStyle] = useState("yt");
  const [subSize, setSubSize] = useState(0.10); // tinggi tombol (fraksi min(W,H))
  const [subPos, setSubPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.9 });
  const [subAnim, setSubAnim] = useState<SubAnim>("denyut");
  // ⏱ v19.41: DURASI tombol subscribe — muncul mulai detik & hilang detik (0 = sampai akhir)
  const [subStart, setSubStart] = useState(0);
  const [subEnd, setSubEnd] = useState(0);
  // 💎 v19.43: TEKS custom tombol subscribe (bisa ganti "SUBSCRIBE")
  const [subTeks, setSubTeks] = useState("SUBSCRIBE");
  // 🐛 v19.42.2: preview mini DI PANEL — selalu hidup (interval rAF ringan) biar
  // tombol kelihatan & animasinya jalan (dulu useEffect sekali → bisa kosong)
  useEffect(() => {
    let raf = 0;
    const gambar = () => {
      const cv = subPrevRef.current;
      if (cv) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.fillStyle = "#0b0b14"; ctx.fillRect(0, 0, cv.width, cv.height);
          const stl = SUB_STYLES.find((x) => x.id === subStyle) || SUB_STYLES[0];
          const t = performance.now() / 1000;
          const st = hitungSubState(0.7, 1, 0.6, subAnim, t);
          gambarSubscribe(ctx, cv.width / 2, cv.height / 2, cv.height * 0.55, stl, st, t, subTeks);
        }
      }
      raf = requestAnimationFrame(gambar);
    };
    raf = requestAnimationFrame(gambar);
    return () => cancelAnimationFrame(raf);
  }, [subStyle, subAnim, subTeks]);

  const subStyleRef = useRef<SubStyle>(SUB_STYLES[0]);
  const subPrevRef = useRef<HTMLCanvasElement | null>(null);
  // 🎯 v19.44 SPEKTRUM MINI — gaya pendek, bisa di-drag & di-cubit ke mana aja
  const [floatSpec, setFloatSpec] = useState(false);
  const [floatStyle, setFloatStyle] = useState("bars");
  const [floatSize, setFloatSize] = useState(0.26);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.22 });
  const pinchFloat = useRef<{ d0: number; s0: number } | null>(null);
  // 🖼️ v19.44 FRAME LAYOUT — bingkai mewah di atas video
  const [frameOn, setFrameOn] = useState(false);
  const [frameStyle, setFrameStyle] = useState("gold");
  // ✏️ v19.44 TEKS CUSTOM — isi teks + font + warna + 3D + stroke
  const [textOn, setTextOn] = useState(false);
  const [textCustom, setTextCustom] = useState("");
  const [textStyle, setTextStyle] = useState<TextStyle>({ ...TEXT_DEFAULT });
  const [textSize, setTextSize] = useState(0.09);
  const [textPos, setTextPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.15 });
  const dragRefText = useRef<{ dx: number; dy: number } | null>(null);
  // 🗂 v19.43: UI RAPI — section collapsible di langkah Visual (tiap fitur punya tombol sendiri)
  // 🧹 v19.45.1: EFEK DEKORATIF OTOMATIS — default MATI (hasil bersih).
  // User komplain: aurora/shockwave/lingkar bass muncul tanpa diminta & nutup visual.
  const [fx, setFx] = useState<Record<string, boolean>>({ aurora: false, shock: false, ring: false, stars: false });
  const setFxK = (k: string, v: boolean) => setFx((f) => ({ ...f, [k]: v }));
  const modeBersih = !fx.aurora && !fx.shock && !fx.ring && !fx.stars;
  const [secOpen, setSecOpen] = useState<Record<string, boolean>>({
    gaya: true, spektrum: false, latar: false, gambar: false, subscribe: false, lapisan: false, preset: false,
  });
  const toggleSec = (k: string) => setSecOpen((s) => ({ ...s, [k]: !s[k] }));
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
  // 🌏 v19.19: bahasa lagu untuk transkripsi (auto = deteksi otomatis, atau paksa bahasa)
  const [transLang, setTransLang] = useState("auto");
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
  /* 🎬 v19.32 DUAL RENDER — sekali render → 2 video:
     1) Long (rasio dipilih) 2) Short 9:16 NATIVE 30 dtk dari bagian paling seru.
     Short di-render ulang layout 9:16 asli (608×1080) → TIDAK ADA yang kepotong. */
  const [dualRender, setDualRender] = useState(false);
  const [shortDur, setShortDur] = useState(30); // ⏱ default 30 detik (permintaan user)
  const [shortStart, setShortStart] = useState(0); // detik awal short (deteksi otomatis / geser manual)
  const [shortAuto, setShortAuto] = useState(true); // 🎯 otomatis vs ✋ manual
  const [energiArr, setEnergiArr] = useState<number[]>([]); // energi per 0.5 dtk → gambar timeline
  const [shortUrl, setShortUrl] = useState("");
  const [shortBlob, setShortBlob] = useState<Blob | null>(null);
  const [phase, setPhase] = useState<"idle" | "long" | "short">("idle"); // fase render (biar tombol jujur)
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  /* 🛡 v19.32.1: Wake Lock — jaga layar tetap nyala selama render panjang.
     Akar masalah "video cuma 54 dtk": layar mati/kunci HP/tab pindah → browser
     menghentikan audio & rAF → MediaRecorder berhenti → hasil terpotong. */
  const [renderNote, setRenderNote] = useState(""); // pesan panduan sebelum/saat render
  /* 🔬 v19.33: DIAGNOSTIK — data nyata, bukan nebak. Menampilkan durasi yang
     TERBACA browser vs file, dan laporan render detail kalau ada yang aneh. */
  const [durWarn, setDurWarn] = useState("");
  const [diag, setDiag] = useState<{ t: string; s: string }[]>([]);
  const diagRef = useRef<{ t: string; s: string }[]>([]);
  const [renderFase, setRenderFase] = useState<"audio" | "video" | "mux" | "">("");
  const [pakaiMode, setPakaiMode] = useState<"" | "offline" | "realtime">("");
  /* 🚀 v19.34: kecepatan render — fps bisa 24 (20% lebih cepat) & estimasi waktu diukur asli */
  const [fpsOpt, setFpsOpt] = useState<24 | 25 | 30>(30);
  // ⚡ v19.46.1 TURBO: render resolusi rendah + upscale — 2-4× lebih cepat
  const [turbo, setTurbo] = useState(false);
  const [estSisa, setEstSisa] = useState("");
  function logDiag(s: string) {
    const row = { t: new Date().toISOString().slice(11, 19), s };
    diagRef.current = [...diagRef.current.slice(-60), row];
    setDiag(diagRef.current);
    try { console.log("[VERVE-DIAG]", row.t, row.s); } catch { /* abaikan */ }
  }
  useEffect(() => {
    const fn = () => {
      if (rendering) logDiag(document.hidden ? "⚠️ layar/tab tersembunyi (bisa melambat)" : "👁 tab terlihat lagi");
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [rendering]); // eslint-disable-line react-hooks/exhaustive-deps

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
        layerVis, layerOp,
        // 🔔 v19.40: tombol subscribe ikut tersimpan
        subOn, subStyle, subSize, subPos, subAnim, subStart, subEnd, subTeks,
        floatSpec, floatStyle, floatSize, floatPos, frameOn, frameStyle,
        textOn, textCustom, textStyle, textSize, textPos,
        fx,
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
      if (p.layerVis) setLayerVis(p.layerVis);
      if (p.layerOp) setLayerOp(p.layerOp);
      // 🔔 v19.40: muat subscribe dari preset
      if (p.subOn !== undefined) setSubOn(!!p.subOn);
      if (p.subStyle) setSubStyle(p.subStyle);
      if (p.subSize) setSubSize(p.subSize);
      if (p.subPos) setSubPos(p.subPos);
      if (p.subAnim) setSubAnim(p.subAnim);
      // ⏱ v19.41: durasi subscribe
      if (p.subStart !== undefined) setSubStart(p.subStart);
      if (p.subEnd !== undefined) setSubEnd(p.subEnd);
      if (p.subTeks) setSubTeks(p.subTeks);
      if (p.floatSpec !== undefined) setFloatSpec(!!p.floatSpec);
      if (p.floatStyle) setFloatStyle(p.floatStyle);
      if (p.floatSize) setFloatSize(p.floatSize);
      if (p.floatPos) setFloatPos(p.floatPos);
      if (p.frameOn !== undefined) setFrameOn(!!p.frameOn);
      if (p.frameStyle) setFrameStyle(p.frameStyle);
      if (p.textOn !== undefined) setTextOn(!!p.textOn);
      if (p.textCustom !== undefined) setTextCustom(p.textCustom);
      if (p.textStyle) setTextStyle({ ...TEXT_DEFAULT, ...p.textStyle });
      if (p.textSize) setTextSize(p.textSize);
      if (p.textPos) setTextPos(p.textPos);
      if (p.fx) setFx(p.fx);
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
  const barsRef = useRef<Float32Array>(new Float32Array(128)); // 🐛 FIX v19.17.1: harus ≥ barCount maks (128) — dulu 64 → naikkan bar >64 bikin NaN
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
  /* 🎵 v19.29: hasil generate lagu → langsung jadi audio visualizer */
  function onSunoSong(url: string, title: string, duration?: number) {
    setSunoTitle(title);
    void loadAudio(url, title);
    if (duration) setDuration(duration);
  }

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
      // 🎬 v19.32 DUAL RENDER: hitung energi & deteksi klimaks OTOMATIS
      setEnergiArr(energiPerDetik(buf, 0.5));
      const k = cariKlimaksBuffer(buf, 30);
      setShortStart(Math.round(k.start * 10) / 10);
      setShortAuto(true);
      // 🥁 v19.36: analisis BEAT & BPM (timeline beat)
      const pk = hitungPuncak(buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, buf.sampleRate, 0.25);
      peaksRef.current = pk;
      const bt = deteksiBeats(pk, 0.25);
      beatsRef.current = bt;
      setBeatsArr(bt);
      setBpmN(bpmDariBeats(bt));
      // 🎛 v19.39: hitung FFT frekuensi asli (chunked biar HP nggak nge-freeze)
      logDiag("Analisis frekuensi (FFT) untuk spektrum akurat…");
      try {
        const fr = await hitungFreqFramesChunked(buf, 10, 128);
        freqFramesRef.current = fr;
        logDiag(`FFT siap: ${fr.frames.length} frame × ${fr.bins} bin @${fr.fps}fps`);
      } catch { freqFramesRef.current = null; }
      // 🔬 v19.33: DIAGNOSTIK — berapa detik yang BENAR-BENAR terbaca browser?
      // File besar tapi durasi pendek = header durasi file rusak → render pasti pendek.
      logDiag(`Audio dimuat: terbaca=${fmtD(buf.duration)} bytes=${raw.byteLength} (${(raw.byteLength / 1048576).toFixed(1)} MB)`);
      const mb = raw.byteLength / 1048576;
      if (buf.duration < 150 && mb > 4) {
        setDurWarn(`⚠️ Browser cuma membaca ${fmtD(buf.duration)} dari file ${mb.toFixed(0)} MB. Kalau lagu aslinya lebih panjang dari itu, header durasi file-nya rusak — hasil render pasti ikut pendek. Solusi: convert ulang file (aplikasi konverter MP3/WAV) lalu upload lagi.`);
      } else {
        setDurWarn("");
      }
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
      // 🌏 v19.19: bahasa TIDAK dipaksa "id" — ikut bahasa lagu (default: auto-detect),
      // biar bisa dipakai untuk lagu luar negeri juga. Bisa diatur via toggle.
      const bahasaLagu = transLang === "auto" ? "" : transLang;
      const res = await transcribeBlobBesar(blob, "", bahasaLagu);
      if (!res?.ok || !Array.isArray(res.words) || !res.words.length) {
        setLyrMsg("⚠️ Tidak ada kata terdeteksi (lagu instrumental? coba yang ada vokalnya).");
        return;
      }
      // 3) Filter kata aneh — buang aksara tak dikenal & simbol doang (bukan bahasa spesifik,
      // supaya lirik Inggris/Jepang/Korea tetap bisa kalau memang lagunya begitu)
      const aksaraAneh = /[\u0600-\u06FF\u0400-\u04FF\u0590-\u05FF\u0900-\u097F]/; // Arab/Kiril/Ibrani/Devanagari (jarang buat lagu pop)
      const kataAsli = (res.words as { w: string; start: number; end: number }[])
        .map((w) => ({ ...w, w: String(w.w || "").trim() }))
        .filter((w) => w.w && !aksaraAneh.test(w.w) && /[\p{L}\p{N}]/u.test(w.w));
      const dibuang = (res.words as { w: string }[]).length - kataAsli.length;
      // 4) Kelompokkan kata jadi BARIS (baris baru tiap jeda >0.8s atau panjang)
      const words = kataAsli;
      if (!words.length) { setLyrMsg("⚠️ Tidak ada kata terdeteksi (lagu instrumental? coba yang ada vokalnya)."); return; }
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
      // 5) Simpan → lyricsText (baris) & autoWords (timing presisi)
      setAutoLines(lines);
      autoWordsRef.current = grouped;
      setLyrAuto(true);
      setLyricsText(lines.join("\n"));
      setLyrMsg(`✅ ${words.length} kata terdeteksi (${dibuang} kata asing dibuang) → ${lines.length} baris. Timing PAS audio!`);
    } catch (e) {
      setLyrMsg(`⚠️ Gagal: ${e instanceof Error ? e.message : "coba lagi"}`);
    } finally {
      setLyrBusy(false);
    }
  }
  function buildChain(actx: AudioContext): { input: AudioNode; analyser: AnalyserNode } {
    return buildAudioChain(actx, eq, comp, gain, true);
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

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, t: number, freq?: Uint8Array | null, lapis?: "semua" | "bg" | "dinamis") => {
    // 🚀 v19.34: render BERLAPIS — "bg" (latar: gradient/glow/bintang — di-cache, murah)
    // vs "dinamis" (bar/lirik/logo — tiap frame). Preview tetap "semua" = identik seperti dulu.
    const bgOnly = lapis === "bg";
    const dinOnly = lapis === "dinamis";
    if (!dinOnly) {
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
    }

    // bars dari analyser atau dummy berdenyut
    const N = barCount; // 🎛️ v19.14: jumlah bar bisa diatur
    let bass = 0;
    if (freq) {
      const step = Math.max(1, Math.floor(freq.length * 0.72 / N)); // 🐛 FIX v19.17.1: step minimal 1 — dulu bisa 0 → NaN
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
    if (!dinOnly) {
    // 🎬 v19.12: GLOW BERGERAK di background (ala Trap Nation) — bikin nggak polos
    const gb2 = ctx.createRadialGradient(W / 2 + Math.sin(t * 0.3) * W * 0.15, H * 0.32 + Math.cos(t * 0.4) * H * 0.12, 40, W / 2, H / 2, Math.max(W, H));
    gb2.addColorStop(0, `rgba(${r},${g2},${b},${((0.10 + bass * 0.16) * glowInt).toFixed(3)})`);
    gb2.addColorStop(0.5, "rgba(0,0,0,0)"); gb2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gb2; ctx.fillRect(0, 0, W, H);

    // 👑 v19.13 AURORA — 3 gumpalan cahaya bergerak pelan + bintang berkelip
    // 🧹 v19.45.1: hanya kalau fx.aurora & fx.stars ON (default MATI = hasil bersih)
    if (fx.aurora || fx.stars) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (fx.aurora) {
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
    }
    if (fx.stars) {
      if (!starsRef.current.length) {
        for (let i = 0; i < 70; i++) starsRef.current.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.6 + 0.4, ph: Math.random() * 6.28 });
      }
      for (const s of starsRef.current) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + s.ph));
        ctx.fillStyle = `rgba(255,255,255,${(tw * 0.6).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    }
    }

    if (!bgOnly) {
    // 🩰 v19.16 MULTI-GAMBAR "MENARI IKUT IRAMA" — zoom & geser halus mengikuti energi musik
    // (cepat saat drum/bass cepat, syahdu saat lambat). Tetap background, spectrum keliatan.
    // 🧩 v19.36: lapisan — bisa disembunyikan & diatur transparansinya
    if (layerVis.gambar !== false) {
    ctx.save(); ctx.globalAlpha = layerOp.gambar ?? 1;
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
    ctx.restore();
    } // tutup lapisan gambar

    // ---- spectrum styles (🎬 v19.12: upgrade WAH — glow, reflection, gradien 3 warna, center glow) ----
    if (layerVis.spektrum === false) {
      /* spectrum disembunyikan (lapisan) */
    } else {
    ctx.save(); ctx.globalAlpha = layerOp.spektrum ?? 1;
    if (specStyle === "bars") {
      const bw = W / N;
      const baseY = H - 8;
      // 🎨 v19.36.2: gradient VIVID (tetap berwarna di puncak — bukan putih pucat)
      const grad3 = ctx.createLinearGradient(0, H, 0, 0);
      grad3.addColorStop(0, acc);
      grad3.addColorStop(0.5, `rgb(${Math.min(255, Math.round(r * 0.65 + 130))},${Math.min(255, Math.round(g2 * 0.55 + 110))},255)`);
      grad3.addColorStop(0.82, `rgb(${Math.min(255, Math.round(r * 0.4 + 205))},${Math.min(255, Math.round(g2 * 0.35 + 190))},255)`);
      grad3.addColorStop(1, `rgb(${Math.min(255, Math.round(r * 0.3 + 225))},${Math.min(255, Math.round(g2 * 0.25 + 220))},255)`);
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
      glowBg.addColorStop(0, `rgba(${r},${g2},${b},${((0.18 + bass * 0.22) * glowInt).toFixed(3)})`);
      glowBg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowBg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // ✨ v19.36.2: PEAK CAP — titik terang di ujung tiap bar (tanda visualizer pro)
      const peakH = new Array<number>(N).fill(0);
      for (let i = 0; i < N; i++) {
        const v = bars[i]; const h = Math.max(3, v * H * 0.62);
        const x = i * bw + bw * 0.16, w = bw * 0.68, r2 = bw * 0.3;
        // shadow lembut (premium)
        ctx.fillStyle = `rgba(0,0,0,0.25)`;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x + 1.5, baseY - h + 1.5, w, h, r2);
        else ctx.rect(x + 1.5, baseY - h + 1.5, w, h);
        ctx.fill();
        // bar utama
        ctx.fillStyle = grad3;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, baseY - h, w, h, r2);
        else ctx.rect(x, baseY - h, w, h);
        ctx.fill();
        // highlight kiri atas (glossy)
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x + w * 0.12, baseY - h, w * 0.16, h);
        // peak cap
        const targetCap = h;
        peakH[i] = Math.max(peakH[i] * 0.82, targetCap);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x + w * 0.18, baseY - peakH[i] - 4, w * 0.64, 5, 2.5);
        else ctx.fillRect(x + w * 0.18, baseY - peakH[i] - 4, w * 0.64, 5);
      }
      // lingkar bass di bawah tengah — 🧹 v19.45.1: hanya kalau fx.ring ON
      if (fx.ring) {
        ctx.beginPath(); ctx.arc(W / 2, H - 46, 10 + bass * 26, 0, Math.PI * 2);
        ctx.fillStyle = acc; ctx.globalAlpha = 0.45 + bass * 0.5; ctx.fill(); ctx.globalAlpha = 1;
      }
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
    } else if (specStyle === "bars-h") { // ↔ v19.36: BAR HORIZONTAL dari kiri
      const bh = H / N;
      const gh = ctx.createLinearGradient(0, 0, W, 0);
      gh.addColorStop(0, acc); gh.addColorStop(1, "#22d3ee");
      ctx.save();
      for (let i = 0; i < N; i++) {
        const v = bars[i];
        const w = Math.max(4, v * W * 0.55);
        const y = i * bh + bh * 0.18, hgt = bh * 0.64;
        ctx.fillStyle = gh;
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(6, y, w, hgt, hgt * 0.4);
        else ctx.rect(6, y, w, hgt);
        ctx.fill();
        // refleksi tipis
        ctx.globalAlpha = 0.18; ctx.fillStyle = "#fff";
        ctx.fillRect(6 + w + 3, y + hgt * 0.25, Math.max(2, w * 0.12), hgt * 0.5);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (specStyle === "line") { // ➖ v19.36: LINE SPECTRUM mulus + glow
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const baseY = H - 8;
      for (const [lw, col, al] of [[10, acc, 0.22], [4, "#ffffff", 0.9], [2, acc, 1]] as any[]) {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * W;
          const y = baseY - bars[i] * H * 0.42;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = lw;
        ctx.lineJoin = "round"; ctx.stroke(); ctx.globalAlpha = 1;
      }
      // refleksi bawah
      ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W;
        const y = baseY + bars[i] * H * 0.18;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else if (specStyle === "waveform") { // 〰️ v19.36: WAVEFORM simetris tengah (isi gradien)
      const cy = H * 0.52;
      ctx.save();
      const wf = ctx.createLinearGradient(0, cy - H * 0.3, 0, cy + H * 0.3);
      wf.addColorStop(0, "rgba(0,0,0,0)");
      wf.addColorStop(0.5, acc);
      wf.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = wf;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x <= W; x += 3) {
        const i = Math.floor((x / W) * (N - 1));
        const v = bars[i];
        const amp = v * H * 0.30;
        const y = cy + Math.sin(x * 0.011 + t * 2.4) * amp * 0.55 + Math.sin(x * 0.027 - t * 3.2) * amp * 0.45;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, cy);
      for (let x = W; x >= 0; x -= 3) {
        const i = Math.floor((x / W) * (N - 1));
        const v = bars[i];
        const amp = v * H * 0.30;
        const y = cy + Math.sin(x * 0.011 + t * 2.4) * amp * 0.55 + Math.sin(x * 0.027 - t * 3.2) * amp * 0.45;
        ctx.lineTo(x, cy - (y - cy) * 0.9);
      }
      ctx.closePath(); ctx.fill();
      // garis tengah
      ctx.strokeStyle = `rgba(${r},${g2},${b},0.5)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
      ctx.restore();
    } else if (specStyle === "ring") { // 💍 v19.43: RING GANDA — cincin konsentris berdenyut (mewah)
      const cx = W / 2, cy = H * 0.48;
      const R0 = Math.min(W, H) * 0.24;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [lapis, Rk, al] of [[0, 1.0, 0.85], [1, 1.22, 0.5], [2, 1.45, 0.28]] as any[]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R0 * Rk, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g2},${b},${al * (0.5 + bass * 0.5)})`;
        ctx.lineWidth = 2 + bass * 6 - lapis * 1.5;
        ctx.stroke();
        // bar keluar dari ring
        for (let i = 0; i < N; i++) {
          const v = bars[i];
          const ang = (i / N) * Math.PI * 2 - Math.PI / 2 + t * 0.12;
          const len = Math.max(2, v * R0 * (0.5 + lapis * 0.18));
          const x0 = cx + Math.cos(ang) * R0 * Rk;
          const y0 = cy + Math.sin(ang) * R0 * Rk;
          ctx.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g2 + 30)},255,${al * (0.4 + v * 0.6)})`;
          ctx.lineWidth = Math.max(1.5, (Math.min(W, H) * 0.006) * (1 - lapis * 0.25));
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
          ctx.stroke();
        }
      }
      // pusat glow ikut bass
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R0 * (0.7 + bass * 0.3));
      cg.addColorStop(0, `rgba(${r},${g2},${b},${(0.25 + bass * 0.45).toFixed(3)})`);
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (specStyle === "dual") { // 🪞 v19.43: DUAL — spektrum kiri & kanan dari tengah (simetris, mewah)
      const cx = W * 0.5, baseY = H - 8;
      const bw = W / 2 / N;
      const gradD = ctx.createLinearGradient(0, H, 0, 0);
      gradD.addColorStop(0, acc);
      gradD.addColorStop(0.6, `rgb(${Math.min(255, Math.round(r * 0.6 + 140))},${Math.min(255, Math.round(g2 * 0.5 + 120))},255)`);
      gradD.addColorStop(1, "#ffffff");
      ctx.save();
      for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? -1 : 1;
        for (let i = 0; i < N; i++) {
          const v = bars[side === 0 ? N - 1 - i : i];
          const h = Math.max(3, v * H * 0.66);
          const x = cx + dir * (i * bw + bw * 0.1);
          ctx.fillStyle = gradD;
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(side === 0 ? x - bw * 0.8 : x, baseY - h, bw * 0.8, h, bw * 0.35);
          else ctx.rect(side === 0 ? x - bw * 0.8 : x, baseY - h, bw * 0.8, h);
          ctx.fill();
        }
      }
      // garis tengah menyala saat bass
      ctx.fillStyle = `rgba(255,255,255,${(0.35 + bass * 0.6).toFixed(3)})`;
      ctx.fillRect(cx - 1.5, baseY - H * 0.5, 3, H * 0.5);
      // glow tengah bawah
      const gd = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, W * 0.3);
      gd.addColorStop(0, `rgba(${r},${g2},${b},${(0.15 + bass * 0.2).toFixed(3)})`);
      gd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gd; ctx.fillRect(cx - W * 0.3, baseY - W * 0.3, W * 0.6, W * 0.3);
      ctx.restore();
    } else if (specStyle === "flame") { // 🔥 v19.43: BARA — bars gradien api (merah→kuning) + glow
      const bw = W / N;
      const baseY = H - 8;
      const gradF = ctx.createLinearGradient(0, H, 0, 0);
      gradF.addColorStop(0, "#7f1d1d");
      gradF.addColorStop(0.4, "#ef4444");
      gradF.addColorStop(0.75, "#f97316");
      gradF.addColorStop(1, "#fde047");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(W / 2, baseY, 0, W / 2, baseY, H * 0.55);
      fg.addColorStop(0, `rgba(239,68,68,${(0.14 + bass * 0.2).toFixed(3)})`);
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const peakF = new Array<number>(N).fill(0);
      for (let i = 0; i < N; i++) {
        const v = bars[i];
        const h = Math.max(3, v * H * 0.68);
        ctx.fillStyle = gradF;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(i * bw + bw * 0.16, baseY - h, bw * 0.68, h, bw * 0.3);
        else ctx.rect(i * bw + bw * 0.16, baseY - h, bw * 0.68, h);
        ctx.fill();
        // highlight atas (lidah api)
        ctx.fillStyle = "rgba(253,224,71,0.85)";
        ctx.fillRect(i * bw + bw * 0.28, baseY - h, bw * 0.44, Math.max(2, h * 0.12));
        peakF[i] = Math.max(peakF[i] * 0.8, h);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(i * bw + bw * 0.22, baseY - peakF[i] - 4, bw * 0.56, 4, 2);
        else ctx.fillRect(i * bw + bw * 0.22, baseY - peakF[i] - 4, bw * 0.56, 4);
      }
      // ember api di dasar
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 24; i++) {
        const ex = ((i * 83 + Math.floor(t * 26) * 17) % W);
        const ey = baseY - ((t * (14 + (i % 4) * 5) + i * 61) % (H * 0.3)) - 4;
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 2.1));
        ctx.fillStyle = `rgba(251,146,60,${(tw * 0.5).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(ex, ey, 1 + (i % 3) + bass, 0, Math.PI * 2); ctx.fill();
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
    ctx.restore();
    } // tutup lapisan spectrum
    // 🎯 v19.44: SPEKTRUM MINI — gaya pendek, bisa di-drag & di-cubit (pakai bars asli)
    if (floatSpec && layerVis.spektrumMini !== false) {
      const fw = Math.min(W, H) * floatSize;
      const fh = fw * 0.5;
      const fx0 = floatPos.x * W - fw / 2, fy0 = floatPos.y * H - fh / 2;
      ctx.save();
      ctx.globalAlpha = layerOp.spektrumMini ?? 1;
      ctx.fillStyle = "rgba(5,7,15,0.55)";
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(fx0, fy0, fw, fh, 10);
      else ctx.rect(fx0, fy0, fw, fh);
      ctx.fill();
      // bars mini
      const NB = 24, bw2 = fw / NB;
      const gradM = ctx.createLinearGradient(0, fy0 + fh, 0, fy0);
      gradM.addColorStop(0, acc); gradM.addColorStop(1, "#ffffff");
      for (let i = 0; i < NB; i++) {
        const v = bars[Math.floor((i / NB) * N)];
        const h2 = Math.max(2, v * fh * 0.85);
        ctx.fillStyle = gradM;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(fx0 + i * bw2 + bw2 * 0.14, fy0 + fh - h2, bw2 * 0.72, h2, 3);
        else ctx.rect(fx0 + i * bw2 + bw2 * 0.14, fy0 + fh - h2, bw2 * 0.72, h2);
        ctx.fill();
      }
      // handle edit (garis putus)
      if (step === 1 && !playing) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(fx0, fy0, fw, fh);
        ctx.setLineDash([]);
        ctx.fillStyle = "#22d3ee";
        for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          ctx.beginPath();
          ctx.arc(floatPos.x * W + hx * fw / 2, floatPos.y * H + hy * fh / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // 👑 v19.13 PRO PACK: SHOCKWAVE — cincin membesar saat bass naik
    // 🐛 FIX v19.16.1: shockwave/logo/ember DIPINDAHKAN keluar if/else —
    // dulu terjebak di else → saat tunnel dipilih logo tidak muncul.
    lastBassRef.current = bass;
    if (fx.shock) {
    if (bass > 0.52 && bass > lastBassRef.current * 1.18) {
      shockRef.current.push({ x: W / 2, y: H * 0.55, r: 50, a: 0.85 });
      if (shockRef.current.length > 6) shockRef.current.shift();
    }
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
    }

    // 👑 v19.13/v19.14 PRO PACK: LOGO PUSAT — denyut ikut bass + sinar berputar + ring
    // 🎛️ v19.14: posisi bebas (drag), skala, kecepatan rotasi, mode ikut-beat
    if (layerVis.logo !== false) {
    ctx.save(); ctx.globalAlpha = layerOp.logo ?? 1;
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
    ctx.restore();
    } // tutup lapisan logo

    // 👑 v19.13 PRO PACK: EMBER NAIK — partikel ringan (murah, tanpa shadowBlur)
    // 🧩 v19.36: lapisan partikel — bisa disembunyikan
    if (layerVis.partikel !== false) {
    ctx.save(); ctx.globalAlpha = layerOp.partikel ?? 1;
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
    ctx.restore();
    }

    // overlay suasana
    if (layerVis.overlay !== false && overlay !== "none") {
      ctx.save(); ctx.globalAlpha = layerOp.overlay ?? 1;
      paintEffect(ctx, W, H, overlay, t, true);
      ctx.restore();
    }

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
    }

    // lirik karaoke
    if (lirikOn && capWords.length) {
      paintPreviewCaptions(ctx, W, H, capWords, t, tpl.capStyle, { yRatio: 0.8, sizeRatio: 0.05 });
    }
    }

    // ✏️ v19.44: TEKS CUSTOM (di atas semua, sebelum frame)
    if (textOn && textCustom.trim() && layerVis.teks !== false) {
      ctx.save();
      ctx.globalAlpha = layerOp.teks ?? 1;
      gambarTeksCustom(ctx, textCustom, textPos.x * W, textPos.y * H, Math.min(W, H) * textSize, textStyle);
      ctx.restore();
    }
    // 🖼️ v19.44: FRAME LAYOUT (paling atas)
    if (frameOn) {
      const fs2 = FRAME_STYLES.find((x) => x.id === frameStyle) || FRAME_STYLES[0];
      gambarFrame(ctx, W, H, fs2, t, bass);
    }
    // 🔔 v19.40: TOMBOL SUBSCRIBE ANIMASI — paling atas (di atas semua elemen)
    // ⏱ v19.41: diatur DURASINYA — muncul mulai subStart, hilang setelah subEnd (fade 0.4 dtk)
    // 🐛 FIX: pakai kondisi (BUKAN return) — biar elemen setelahnya tetap digambar
    if (subOn && layerVis.subscribe !== false) {
      const durS = duration || 0;
      const mulai = subStart || 0;
      const hilang = subEnd > 0 ? subEnd : Infinity;
      const dalamJendela = t >= mulai && t <= hilang;
      let subAlpha = dalamJendela ? 1 : 0;
      if (dalamJendela) {
        if (t < mulai + 0.4) subAlpha = Math.max(0, (t - mulai) / 0.4);
        if (hilang < Infinity && t > hilang - 0.4) subAlpha = Math.min(subAlpha, Math.max(0, (hilang - t) / 0.4));
      }
      const stl = SUB_STYLES.find((s) => s.id === subStyle) || SUB_STYLES[0];
      subStyleRef.current = stl;
      // fitur audio utk animasi: bass + beat + flux (dari bars saat ini)
      let subBass = bass, subBeat = 0, subFlux = 0;
      if (freq) {
        subBass = bass;
        subBeat = bass > 0.52 && bass > lastBassRef.current * 1.18 ? 1 : 0;
        subFlux = Math.min(1, Math.abs(bass - lastBassRef.current) * 2);
      } else if (peaksRef.current.length) {
        const pkS = peaksRef.current;
        const iSub = Math.min(pkS.length - 1, Math.max(0, Math.floor(t / 0.25)));
        subBass = pkS[iSub] ?? 0;
        subBeat = 0; for (const b of beatsRef.current) { const dd = Math.abs(b - t); if (dd < 0.06) { subBeat = 1; break; } if (dd < 0.13) { subBeat = 0.5; break; } if (b > t + 0.13) break; }
        subFlux = Math.min(1, Math.abs((pkS[iSub] ?? 0) - (pkS[Math.max(0, iSub - 1)] ?? 0)) * 2);
      }
      if (subAlpha > 0.01) {
        const subSt = hitungSubState(subBass, subBeat, subFlux, subAnim, t);
        ctx.save();
        ctx.globalAlpha = (layerOp.subscribe ?? 1) * subAlpha; // ⏱ fade durasi
        const hSub = Math.min(W, H) * subSize; // tinggi tombol — lebar otomatis dari teks
        gambarSubscribe(ctx, subPos.x * W, subPos.y * H, hSub, stl, subSt, t, subTeks);
        // 🐛 v19.42.1: HANDLE EDIT — border putus-putus + 4 titik → jelas bisa digeser
        if (step === 1 && !playing) {
          const hh = hSub * subSt.scale;
          const ww = hh * 3.4;
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(subPos.x * W - ww / 2, subPos.y * H - hh / 2, ww, hh);
          ctx.setLineDash([]);
          ctx.fillStyle = "#22d3ee";
          for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            ctx.beginPath();
            ctx.arc(subPos.x * W + hx * ww / 2, subPos.y * H + hy * hh / 2, 6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // badge loop mulus — 🐛 v19.42: DIHAPUS (user minta buang — ganggu tampilan)
    if (!dinOnly) {
    if (false) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(W - H * 0.2 - 8, 8, H * 0.2, H * 0.045);
      ctx.fillStyle = "#9ff5ef"; ctx.font = `700 ${Math.round(H * 0.022)}px 'Poppins',sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("∞ loop mulus", W - H * 0.1 - 8, 8 + H * 0.023);
    }
    }
  }, [bgType, bgColor, bgGrad, specStyle, overlay, title, mTitle, audioName, lirikOn, capWords, tpl, rgb, seamless,
    barCount, logoPos, titlePos, logoScale, rotSpeed, glowInt, beatMode, layoutId, tunnelSpeed, tunnelDepth, multiImgs, multiBeat, danceMode, danceZoom,
    // 🐛 FIX v19.42.2: SEMUA state yang dipakai drawScene WAJIB di dep — kalau tidak,
    // preview pakai closure LAMA → tombol subscribe/lapisan/posisi tidak pernah muncul.
    layerVis, layerOp, step, playing,
    subOn, subStyle, subSize, subPos, subAnim, subStart, subEnd,
    // 🐛 FIX v19.44: state baru (spektrum mini, frame, teks) WAJIB di dep — tanpa ini
    // drawScene pakai closure LAMA → frame/teks/mini tidak pernah muncul.
    floatSpec, floatStyle, floatSize, floatPos,
    frameOn, frameStyle,
    textOn, textCustom, textStyle, textSize, textPos,
    fx]); // 🐛 FIX v19.15.1: semua param kustomisasi wajib jadi dep — tanpa ini slider/drag nggak ngefek di preview

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

  /* 🎬 v19.32: pratinjau bagian tertentu (dipakai tombol "Pratinjau bagian ini" di Dual Render) */
  function auditionAt(offset: number, dur: number) {
    if (!bufRef.current || rendering) return;
    stopPlayback();
    const actx = actxRef.current!;
    actx.resume().catch(() => {});
    const o = Math.max(0, Math.min(offset, bufRef.current.duration - 0.1));
    const d = Math.max(0.5, Math.min(dur, bufRef.current.duration - o));
    const src = actx.createBufferSource();
    src.buffer = bufRef.current;
    const { input, analyser } = buildChain(actx);
    input.connect(actx.destination);
    src.connect(input);
    src.onended = () => { setPlaying(false); srcRef.current = null; };
    src.start(0, o, d);
    srcRef.current = src; analyserRef.current = analyser;
    startAtRef.current = actx.currentTime;
    setPlaying(true);
    setTimeout(() => { stopPlayback(); }, d * 1000 + 250);
  }

  /* 🛡 v19.32.1: Wake Lock — minta layar tetap nyala selama render (dilepas otomatis di akhir) */
  const wakeLockRef = useRef<any>(null);
  async function mintaWakeLock() {
    try {
      const nav = navigator as any;
      if (!nav.wakeLock?.request) return false;
      wakeLockRef.current = await nav.wakeLock.request("screen");
      return true;
    } catch { return false; }
  }
  function lepasWakeLock() {
    try { wakeLockRef.current?.release?.(); } catch {}
    wakeLockRef.current = null;
  }

  /* 🛡 v19.32.1: ukur durasi asli hasil render — deteksi video kepotong */
  function ukurDurasiBlob(blob: Blob): Promise<number> {
    return new Promise((res) => {
      let done = false;
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { if (!done) { done = true; res(v.duration); } };
      v.onerror = () => { if (!done) { done = true; res(-1); } };
      v.src = URL.createObjectURL(blob);
      setTimeout(() => { if (!done) { done = true; res(-1); } }, 8000);
    });
  }

  /* 🎬 v19.32: satu sesi render (dipakai untuk Long ATAU Short).
     offset = detik mulai audio; dur = durasi video.
     Untuk SHORT: layout canvas 9:16 native (608×1080) → tampilan UTUH, nggak ada kepotong,
     dan waktu visual = offset + waktu lokal → lirik & denyut sinkron dengan audio. */
  async function renderSatu(opts: { w: number; h: number; offset: number; dur: number; onProg: (p: number) => void; fps?: number }): Promise<Blob> {
    await ensureFontsLoaded().catch(() => {});
    await mintaWakeLock(); // 🛡 layar dijaga nyala — wajib untuk render panjang di HP
    const W = opts.w, H = opts.h;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { alpha: false })!;

    const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = actx.createBufferSource();
    src.buffer = bufRef.current;
    const { input, analyser } = buildChain(actx);
    const dest = actx.createMediaStreamDestination();
    input.connect(dest);

    const o = Math.max(0, opts.offset);
    const d = Math.max(0.5, Math.min(opts.dur, bufRef.current!.duration - o));
    src.connect(fades ? fadeGain(actx, input, d) : input);

    const vstream = (cv as any).captureStream(opts.fps || 30);
    const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>(res => {
      mr.onstop = () => res(new Blob(chunks, { type: (chunks[0]?.type || mime || "video/webm").split(";")[0] }));
    });

    // frame sinkron dgn audio clock
    const startAt = actx.currentTime;
    src.onended = () => setTimeout(() => { try { mr.stop(); } catch {} }, 180);
    mr.start(350);
    src.start(0, o, d);
    await actx.resume().catch(() => {});
    // 🛡 v19.32.1: untuk SHORT (render ke-2 tanpa sentuhan user) browser strict bisa menolak
    // audio (autoplay policy) → deteksi & kasih error jelas, bukan hang/terpotong.
    await new Promise(r => setTimeout(r, 700));
    if (actx.state !== "running") {
      await actx.resume().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    }
    if (actx.state !== "running") {
      try { mr.stop(); } catch {}
      lepasWakeLock();
      throw new Error("Browser menolak audio otomatis. Sentuh layar dulu, lalu render lagi.");
    }

    // gambar frame: rAF normal + interval CADANGAN (🛡 rAF bisa berhenti saat layar mati/tab pindah —
    // interval tetap jalan → canvas terus update → hasil nggak kepotong)
    const barsLocal = new Uint8Array(analyser.frequencyBinCount);
    let iv: any = null;
    let selesai = false;
    let lastProg = -1;
    const gambar = (): boolean => {
      const lt = actx.currentTime - startAt;
      analyser.getByteFrequencyData(barsLocal as any);
      drawScene(ctx, W, H, Math.max(0, o + lt), barsLocal);
      // 🐛 FIX v19.26: throttle progress — setState tiap frame bikin HP berat/stutter
      // 🛡 v19.32.1: progress naik walau rAF mati (interval yang gambar), update hemat (≥0.4%)
      const p = clampN(lt / d, 0, 1);
      if (p >= 1 || Math.abs(p - lastProg) > 0.004) { lastProg = p; opts.onProg(p); }
      if (lt >= d + 0.15 && !selesai) { selesai = true; opts.onProg(1); return true; }
      return false;
    };
    await new Promise<void>(res2 => {
      const loop = () => { if (!gambar()) requestAnimationFrame(loop); };
      loop();
      iv = setInterval(() => { gambar(); }, 150); // cadangan ~7×/dtk
      const cek = setInterval(() => { if (selesai) { clearInterval(cek); res2(); } }, 200);
    });
    clearInterval(iv);
    try { src.stop(); } catch {}
    const blob = await done;
    actx.close().catch(() => {});
    return blob;
  }

  /* ⚡ v19.33: render KUAT (offline WebCodecs) — anti-kepotong.
     Bar sintetis dari puncak audio ASLI (bukan AnalyserNode) — visual tetap
     ikut energi musik, tapi prosesnya murni komputasi (tahan layar mati).
     🚀 v19.34: BERLAPIS — latar di-cache (drawBg tiap 4 frame), bar/lirik tiap frame (drawDin). */
  async function renderOffline(opts: { w: number; h: number; offset: number; dur: number; onProg: (p: number) => void; audioCodec?: "aac" | "opus" }): Promise<Blob> {
    await ensureFontsLoaded().catch(() => {});
    const buf = bufRef.current!;
    const peaks = hitungPuncak(buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, buf.sampleRate, 0.25);
    // 🚀 v19.34: bitrate otomatis — video panjang pakai bitrate sedikit lebih rendah
    // (tetap tajam di HP/YouTube, tapi file & memori jauh lebih ringan)
    const vbr = opts.dur > 40 * 60 ? 3_500_000 : opts.dur > 10 * 60 ? 4_500_000 : 6_000_000;
    logDiag(`Render offline ${opts.w}×${opts.h} · ${fpsOpt}fps · ${(vbr / 1e6).toFixed(1)} Mbps · lapis=${true}`);
    return renderOfflineVideo({
      buf, w: opts.w, h: opts.h, offset: opts.offset, dur: opts.dur,
      eq, comp, gain, fades, peaks, audioCodec: opts.audioCodec, fps: fpsOpt, videoBitrate: vbr,
      resScale: turbo ? 0.72 : undefined, // ⚡ Turbo: render 72% lalu upscale
      // 🎛 v19.39: pakai FFT asli → spektrum render AKURAT ikut musik (bukan sintetis)
      freqFrames: freqFramesRef.current || undefined,
      drawBg: (ctx, W, H, t, freq) => drawScene(ctx, W, H, t, freq, "bg"),
      drawDin: (ctx, W, H, t, freq) => drawScene(ctx, W, H, t, freq, "dinamis"),
      draw: (ctx, W, H, t, freq) => drawScene(ctx, W, H, t, freq),
      onProg: opts.onProg,
      onFase: (f) => setRenderFase(f),
      onInfo: (s) => logDiag(s),
    });
  }

  async function render() {
    if (!bufRef.current) { setErr("Pilih musik dulu bro"); return; }
    stopPlayback();
    // 🐛 FIX v19.39.1: toggle "Potong maks 59 dtk" TIDAK boleh motong LONG saat
    // Dual Render aktif (short 9:16 sudah punya durasi sendiri 30 dtk) —
    // dulu long ikut kepotong 59.5 dtk walau lagunya 6 menit.
    const total = Math.min(bufRef.current.duration, (shorts && !dualRender) ? 59.5 : bufRef.current.duration);
    // ⚡ v19.33: pilih mesin render — KUAT (offline) kalau browser mendukung, else realtime
    const mampu: { ok: boolean; alasan?: string; audioCodec?: "aac" | "opus" } = await cekRenderOfflineMampu().catch(() => ({ ok: false, alasan: "cek gagal" }));
    const pakai = mampu.ok ? "offline" : "realtime";
    setPakaiMode(pakai);
    logDiag(`Mode render: ${pakai} (${mampu.alasan || `WebCodecs H.264 + ${mampu.audioCodec}`}) | buffer=${fmtD(bufRef.current.duration)} target=${fmtD(total)} dual=${dualRender}`);
    // 🛡 v19.32.1: peringatan sebelum render panjang — biar user tahu & jaga layar
    // 🚀 v19.34: mode KUAT jauh lebih cepat dari realtime — estimasi diukur otomatis
    if (total > 600) {
      setRenderNote(`🎬 Musik ${fmtD(total)} (~${Math.round(total / 60)} menit). Mode KUAT: render jauh lebih cepat dari realtime — estimasi muncul di layar. Untuk lebih cepat lagi bisa pilih 24 fps di atas. Boleh tinggalin HP (layar mati render tetap lanjut), tapi biarkan tab terbuka.`);
    } else if (total > 120) {
      setRenderNote("⏳ Mode KUAT: render lebih cepat dari realtime — estimasi muncul di layar. Boleh tinggalin HP, biarkan tab terbuka.");
    } else {
      setRenderNote("");
    }
    setRendering(true); setProgress(0); setErr("");
    setVideoUrl(u => { if (u) URL.revokeObjectURL(u); return ""; }); setVideoBlob(null);
    setShortUrl(u => { if (u) URL.revokeObjectURL(u); return ""; }); setShortBlob(null);
    // 🚀 v19.34: estimasi waktu & kecepatan DIUKUR dari render yang sedang berjalan (bukan tebakan)
    const tMulai = Date.now();
    const buatEst = (p: number, target: number) => {
      const el = (Date.now() - tMulai) / 1000;
      if (p > 0.03 && el > 3) {
        const sisa = (el / p) * (1 - p);
        const kecepatan = el / Math.max(0.001, p * target);
        setEstSisa(`⏱ Estimasi selesai ±${fmtD(Math.round(sisa))} · ${kecepatan.toFixed(1)}× lebih cepat dari realtime`);
      }
    };
    try {
      // 🎬 v19.32 DUAL RENDER: video 1 = LONG (rasio dipilih), video 2 = SHORT 9:16 native dari bagian paling seru
      setPhase("long");
      let longBlob: Blob;
      try {
        longBlob = pakai === "offline"
          ? await renderOffline({ w: dim.w, h: dim.h, offset: 0, dur: total, audioCodec: mampu.audioCodec, onProg: p => { setProgress(dualRender ? p * 0.62 : p); buatEst(p, total); } })
          : await renderSatu({ w: dim.w, h: dim.h, offset: 0, dur: total, fps: fpsOpt, onProg: p => { setProgress(dualRender ? p * 0.62 : p); buatEst(p, total); } });
      } catch (e: any) {
        if (pakai === "offline") {
          logDiag(`Mode offline gagal (${e?.message || e}) → fallback realtime`);
          longBlob = await renderSatu({ w: dim.w, h: dim.h, offset: 0, dur: total, fps: fpsOpt, onProg: p => { setProgress(dualRender ? p * 0.62 : p); buatEst(p, total); } });
        } else throw e;
      }
      setVideoBlob(longBlob);
      setVideoUrl(URL.createObjectURL(longBlob));
      // 🛡 v19.32.1: verifikasi hasil — kalau kepotong (layar mati/suspend), lapor JELAS
      const durLong = await ukurDurasiBlob(longBlob);
      logDiag(`Long selesai: hasil=${durLong > 0 ? fmtD(durLong) : "gagal diukur"} target=${fmtD(total)} ukuran=${(longBlob.size / 1048576).toFixed(1)} MB`);
      if (durLong > 0 && durLong < total - 3) {
        setErr(`⚠️ HASIL KEPOTONG: video cuma ${fmtD(durLong)} dari ${fmtD(total)}. ${pakai === "offline" ? "Padahal pakai mode kuat — cek laporan di bawah & kirim ke developer." : "Layar/tab sempat berhenti (battery saver/kunci HP?). Coba render ulang & biarkan layar menyala."}`);
      }
      if (dualRender) {
        const durAudio = bufRef.current.duration;
        const o = clampN(shortStart, 0, Math.max(0, durAudio - 1));
        const d = Math.min(shortDur, Math.max(1, durAudio - o));
        setPhase("short");
        setRenderFase("");
        let shortBlob: Blob;
        try {
          shortBlob = pakai === "offline"
            ? await renderOffline({ w: 608, h: 1080, offset: o, dur: d, audioCodec: mampu.audioCodec, onProg: p => { setProgress(0.62 + p * 0.38); buatEst(p, d); } })
            : await renderSatu({ w: 608, h: 1080, offset: o, dur: d, fps: fpsOpt, onProg: p => { setProgress(0.62 + p * 0.38); buatEst(p, d); } });
        } catch (e: any) {
          if (pakai === "offline") {
            logDiag(`Mode offline short gagal (${e?.message || e}) → fallback realtime`);
            shortBlob = await renderSatu({ w: 608, h: 1080, offset: o, dur: d, fps: fpsOpt, onProg: p => { setProgress(0.62 + p * 0.38); buatEst(p, d); } });
          } else throw e;
        }
        setShortBlob(shortBlob);
        setShortUrl(URL.createObjectURL(shortBlob));
        const durShort = await ukurDurasiBlob(shortBlob);
        logDiag(`Short selesai: hasil=${durShort > 0 ? fmtD(durShort) : "gagal diukur"} target=${fmtD(d)} ukuran=${(shortBlob.size / 1048576).toFixed(1)} MB`);
        if (durShort > 0 && durShort < d - 2) {
          setErr(`⚠️ SHORT KEPOTONG: cuma ${fmtD(durShort)} dari ${fmtD(d)} dtk. Coba render ulang.`);
        }
      }
      setPhase("idle");
      setRenderFase("");
      setProgress(1);
      setEstSisa("");
    } catch (e: any) { setErr(e?.message || "Render gagal"); setEstSisa(""); }
    lepasWakeLock(); // 🛡 layar boleh mati lagi setelah selesai
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

  /* 🎬 v19.32: download video SHORT hasil Dual Render */
  function downloadShort() {
    if (!shortBlob) return;
    const ext = shortBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlobX(shortBlob, `spectrum_short_${(title || audioName || "verve").replace(/[^\w\- ]+/g, "").slice(0, 30)}_${Date.now()}.${ext}`);
  }

  /* 🎬 v19.32: gambar TIMELINE ENERGI mini — bar energi audio + highlight window short (hijau) */
  useEffect(() => {
    const cv = miniRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const arr = energiArr;
    if (!arr.length) {
      ctx.fillStyle = "rgba(148,163,184,.45)";
      ctx.font = "600 11px 'Poppins',sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Timeline energi muncul setelah musik dimuat 🎵", W / 2, H / 2);
      return;
    }
    const mx = Math.max(...arr, 1e-9);
    const n = arr.length;
    const bw = W / n;
    const dur = bufRef.current?.duration || duration;
    // bar energi (timeline)
    for (let i = 0; i < n; i++) {
      const h = Math.max(1.5, (arr[i] / mx) * (H - 16));
      ctx.fillStyle = i % 8 < 4 ? "rgba(148,163,184,.6)" : "rgba(148,163,184,.38)";
      ctx.fillRect(i * bw, H - 4 - h, Math.max(1, bw - 0.5), h);
    }
    if (dur > 0) {
      const x0 = clampN(shortStart / dur, 0, 1) * W;
      const x1 = clampN(Math.min(shortStart + shortDur, dur) / dur, 0, 1) * W;
      ctx.fillStyle = "rgba(34,197,94,.25)";
      ctx.fillRect(x0, 3, Math.max(2, x1 - x0), H - 10);
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.75, 3, Math.max(2, x1 - x0), H - 10);
      // garis mulai
      ctx.fillStyle = "#fff";
      ctx.fillRect(x0 - 0.75, 0, 1.5, H);
      // 🥁 v19.36: MARKER BEAT di sepanjang timeline (garis kecil kuning)
      ctx.fillStyle = "rgba(250,204,21,.55)";
      for (const b of beatsArr) {
        const bx = clampN(b / dur, 0, 1) * W;
        ctx.fillRect(bx - 0.5, H - 14, 1, 10);
      }
      // label status
      ctx.font = "800 9px 'Poppins',sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = shortAuto ? "#4ade80" : "#fbbf24";
      ctx.fillText(shortAuto ? "🎯 KLIMAKS OTOMATIS" : "✋ GESER MANUAL", 6, 6);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.textAlign = "right";
      ctx.fillText(`SHORT ${shortDur} dtk`, W - 6, 6);
      // 🥁 v19.36: info beat & BPM
      ctx.fillStyle = "rgba(250,204,21,.9)";
      ctx.textAlign = "left";
      ctx.fillText(`🥁 ${beatsArr.length} beat · ${bpmN || "?"} BPM`, 6, H - 13);
    }
  }, [energiArr, shortStart, shortDur, shortAuto, duration, beatsArr, bpmN]);

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
                // 🤏 v19.40: lacak semua jari (buat pinch 2 jari)
                ptrsCanvas.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (ptrsCanvas.current.size === 2) {
                  const [a, b] = [...ptrsCanvas.current.values()];
                  // 🎯 v19.44: pinch → ukur mana yang dekat: subscribe / spektrum mini
                  const dSub = Math.hypot((a.x + b.x) / 2 - subPos.x * 0 + 0, 0); // dummy
                  const dFloat = Math.hypot(((a.x + b.x) / 2 - (e.target as HTMLElement).getBoundingClientRect().left) / (e.target as HTMLElement).getBoundingClientRect().width - floatPos.x,
                    ((a.y + b.y) / 2 - (e.target as HTMLElement).getBoundingClientRect().top) / (e.target as HTMLElement).getBoundingClientRect().height - floatPos.y);
                  if (floatSpec && dFloat <= 0.3) {
                    pinchFloat.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: floatSize };
                    pinchSub.current = null;
                  } else {
                    pinchSub.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: subSize };
                    pinchFloat.current = null;
                  }
                  return;
                }
                // 🐛 FIX v19.15.1: drag LANGSUNG tanpa toggle — hit-test posisi logo & judul
                const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;
                const tol = 0.12; // jarak sentuh yang dianggap "kena"
                const dLogo = Math.hypot(x - logoPos.x, y - logoPos.y);
                const dTitle = Math.hypot(x - titlePos.x, y - titlePos.y);
                // 🔔 subscribe dicek duluan kalau aktif (dekat posisinya — area besar biar gampang kena)
                const dSub = subOn ? Math.hypot(x - subPos.x, y - subPos.y) : 9;
                // 🎯 v19.44: hit-test spektrum mini & teks custom dulu (lebih prioritas)
                const dFloat = floatSpec ? Math.hypot(x - floatPos.x, y - floatPos.y) : 9;
                const dTeks = textOn && textCustom.trim() ? Math.hypot(x - textPos.x, y - textPos.y) : 9;
                if (floatSpec && dFloat <= 0.22) {
                  dragRef.current = { x, y, target: "float" as const };
                } else if (textOn && dTeks <= 0.16) {
                  dragRefText.current = { dx: textPos.x - x, dy: textPos.y - y };
                  dragRef.current = { x, y, target: "teks" as const };
                } else if (subOn && dSub <= 0.32) {
                  dragRef.current = { x, y, target: "subscribe" as const };
                } else if (dLogo <= tol && (dLogo <= dTitle || !title.trim())) {
                  dragRef.current = { x, y, target: "logo" as const };
                } else if (dTitle <= tol && title.trim()) {
                  dragRef.current = { x, y, target: "judul" as const };
                } else {
                  dragRef.current = null;
                }
                try { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch { /* aman */ }
              }}
              onPointerMove={(e) => {
                // 🤏 v19.40: PINCH 2 JARI → ubah ukuran tombol subscribe
                if (ptrsCanvas.current.size === 2 && (pinchSub.current || pinchFloat.current)) {
                  const [a, b] = [...ptrsCanvas.current.values()];
                  const d = Math.hypot(a.x - b.x, a.y - b.y);
                  if (pinchFloat.current && floatSpec) {
                    const s = clampN(pinchFloat.current.s0 * (d / Math.max(1, pinchFloat.current.d0)), 0.08, 0.6);
                    setFloatSize(s);
                    return;
                  }
                  if (pinchSub.current && subOn) {
                    const s = clampN(pinchSub.current.s0 * (d / Math.max(1, pinchSub.current.d0)), 0.08, 0.55);
                    setSubSize(s);
                    return;
                  }
                }
                if (!dragRef.current) return;
                const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
                const x = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width));
                const y = Math.min(0.9, Math.max(0.04, (e.clientY - r.top) / r.height));
                if (dragRef.current.target === "float") setFloatPos({ x, y });
                else if (dragRef.current.target === "teks") setTextPos({ x: clampN(x + (dragRefText.current?.dx ?? 0), 0.05, 0.95), y: clampN(y + (dragRefText.current?.dy ?? 0), 0.05, 0.9) });
                else if (dragRef.current.target === "logo") setLogoPos({ x, y });
                else if (dragRef.current.target === "subscribe") setSubPos({ x, y });
                else setTitlePos({ x, y });
                try { localStorage.setItem("verve_spektrum_drag", "1"); } catch { /* abaikan */ } // 🐛 FIX: tanda user pernah geser manual
              }}
              onPointerUp={(e) => {
                ptrsCanvas.current.delete(e.pointerId);
                if (ptrsCanvas.current.size < 2) { pinchSub.current = null; pinchFloat.current = null; }
                dragRef.current = null;
                dragRefText.current = null;
              }}
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
              <div className="tt">Upload musik / lagu dari HP<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>{mBusy ? "Memproses…" : audioName ? `✅ ${audioName} — terbaca ${fmtD(duration)}` : "mp3/wav/m4a"}</div></div>
              <span className="arr">›</span>
              <input type="file" accept="audio/*" hidden onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                loadAudio(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, "").slice(0, 40));
              }} />
            </label>
            {!!durWarn && <div className="v6-risk" style={{ fontSize: 11, lineHeight: 1.45 }}>{durWarn}</div>}
            <p style={{ fontSize: 10, opacity: .6, margin: "4px 0 0" }}>🔬 Angka "terbaca" = durasi yang benar-benar dibaca browser. Kalau beda jauh dari durasi asli lagu, hasil render pasti ikut pendek — convert ulang file dulu.</p>
            {audioUrl && <button className="v6-bigcta" style={{ background: "#22c55e" }} onClick={() => setStep(1)}>Lanjut: Visual ›</button>}

            {/* 🎵 v19.29: GENERATE LAGU — panel sama persis dengan di Lahan */}
            <div className="v6-lbl" style={{ marginTop: 14 }}>🎵 ATAU GENERATE LAGU (Suno) — SAMA SEPERTI DI LAHAN</div>
            <input className="v6-inp" placeholder="Judul lagu untuk generate (cth: Rindu Ibu)" value={sunoTitle} onChange={(e) => setSunoTitle(e.target.value)} />
            <button className="v6-bigcta" style={{ background: "linear-gradient(135deg,#8b5cf6,#d946ef)", marginTop: 6 }} onClick={() => setShowSuno(!showSuno)}>
              {showSuno ? "Tutup Panel Lagu ▴" : "🎵 Buka Generate Lagu (Suno)"}
            </button>
            {showSuno && (
              <SunoPanel
                defaultTitle={sunoTitle || mTitle || audioName || ""}
                defaultLyrics={mLyrics}
                onSong={onSunoSong}
                onClose={() => setShowSuno(false)}
              />
            )}
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
            {/* 💎 v19.46: GRID KARTU — Konsep A. Ketuk kartu → panel isinya muncul di bawah */}
            <div className="v6-lbl">🎛️ ATURAN CEPAT</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 14px 2px" }}>
              {UI_CARDS.map(c => {
                const buka = !!secOpen[c.id];
                return (
                  <button key={c.id} onClick={() => toggleSec(c.id)}
                    style={{ background: buka ? "linear-gradient(160deg,#16102a,#0e0e18)" : "#0e0e18",
                      border: buka ? "1.5px solid rgba(139,92,246,.6)" : "1px solid #1e1e2c",
                      borderRadius: 14, padding: "12px 10px", textAlign: "center", cursor: "pointer", position: "relative" }}>
                    <span style={{ fontSize: 22, display: "block" }}>{c.ic}</span>
                    <b style={{ fontSize: 10.5, display: "block", marginTop: 4, color: "#e6e8f0" }}>{c.label}</b>
                    <small style={{ fontSize: 8.5, color: "#7c8698", display: "block", marginTop: 1 }}>{c.sub}</small>
                    <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: buka ? "#22c55e" : "#2a2a3a" }} />
                  </button>
                );
              })}
            </div>
            {secOpen.gaya && (
              <>
            <div className="v6-lbl">GAYA SPECTRUM</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              {SPEC_STYLES.map(s => <button key={s.id} className={`v6-chip ${specStyle === s.id ? "on" : ""}`} onClick={() => setSpecStyle(s.id)}>{s.label}</button>)}
            </div>
            {/* 🧬 v19.36: TEMPLATE CEPAT — satu ketukan langsung pasang kombo */}
            <div className="v6-lbl">🧬 TEMPLATE CEPAT</div>
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
              <button className="v6-chip" onClick={() => { setSpecStyle("waveform"); }}>〰️ Waveform</button>
              <button className="v6-chip" onClick={() => { setSpecStyle("line"); }}>➖ Line</button>
              <button className="v6-chip" onClick={() => { setSpecStyle("bars-h"); }}>↔ Horizontal</button>
              <button className="v6-chip" onClick={() => { setSpecStyle("tunnel"); }}>🎢 Tunnel</button>
            </div>
              </>
            )}
            {/* 🎯 v19.44: SPEKTRUM MINI — drag & cubit */}
            
            {secOpen.spektrumMini && (
              <>
                <div className="v6-cardrow" style={{ marginTop: 6 }} onClick={() => setFloatSpec(!floatSpec)}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <div className="tt"><b>Spektrum mini (pendek) di atas video</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Geser jari pindah posisi · cubit 2 jari besar/kecil</div></div>
                  <button className={`v6-toggle ${floatSpec ? "on" : ""}`} />
                </div>
                {floatSpec && (
                  <>
                    <div className="v6-slider-row" style={{ marginTop: 6 }}>
                      <div className="lr"><span>Ukuran</span><b>{Math.round(floatSize * 100)}%</b></div>
                      <input type="range" min={0.08} max={0.6} step={0.01} value={floatSize} onChange={e => setFloatSize(Number(e.target.value))} />
                    </div>
                    <p style={{ fontSize: 10, opacity: .6, margin: "2px 0 0" }}>👆 <b>Seret</b> di preview · 🤏 <b>Cubit</b> buat ukuran · posisi default atas-tengah.</p>
                  </>
                )}
              </>
            )}
            {/* 🖼️ v19.44: FRAME LAYOUT */}
            
            {secOpen.frame && (
              <>
                <div className="v6-cardrow" style={{ marginTop: 6 }} onClick={() => setFrameOn(!frameOn)}>
                  <span style={{ fontSize: 16 }}>🖼️</span>
                  <div className="tt"><b>Tampilkan bingkai</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Emas · Neon · Ungu · Merah · Ganda · Sudut · Sinema</div></div>
                  <button className={`v6-toggle ${frameOn ? "on" : ""}`} />
                </div>
                {frameOn && (
                  <>
                    <div className="v6-lbl">PILIH FRAME ({FRAME_STYLES.length})</div>
                    <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                      {FRAME_STYLES.map(f => (
                        <button key={f.id} className={`v6-chip ${frameStyle === f.id ? "on" : ""}`} onClick={() => setFrameStyle(f.id)}>{f.emoji} {f.label}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {/* ✏️ v19.44: TEKS */}
            
            {secOpen.teks && (
              <>
                <div className="v6-cardrow" style={{ marginTop: 6 }} onClick={() => setTextOn(!textOn)}>
                  <span style={{ fontSize: 16 }}>✏️</span>
                  <div className="tt"><b>Tampilkan teks</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Geser jari pindah posisi</div></div>
                  <button className={`v6-toggle ${textOn ? "on" : ""}`} />
                </div>
                {textOn && (
                  <>
                    <div className="v6-lbl">KOLOM TEKS</div>
                    <input className="v6-inp" placeholder="Tulis teks di sini… (mis. judul lagu / nama channel)" value={textCustom} onChange={e => setTextCustom(e.target.value)} />
                    <div className="v6-lbl">FONT ({FONT_OPTS.length})</div>
                    <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                      {FONT_OPTS.map(f => (
                        <button key={f.id} className={`v6-chip ${textStyle.fontId === f.id ? "on" : ""}`} style={{ fontFamily: f.css }} onClick={() => setTextStyle(s => ({ ...s, fontId: f.id }))}>{f.label}</button>
                      ))}
                    </div>
                    <div className="v6-lbl">WARNA FONT</div>
                    <div className="v6-rows">
                      {TEKS_WARNA.map(c => (
                        <button key={c} className={`v6-swatch ${textStyle.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setTextStyle(s => ({ ...s, color: c }))} />
                      ))}
                      <span className="v6-swatch" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                        <input type="color" value={textStyle.color} onChange={e => setTextStyle(s => ({ ...s, color: e.target.value }))} />
                      </span>
                    </div>
                    <div className="v6-lbl">EFEK</div>
                    <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                      <button className={`v6-chip ${textStyle.tigaD ? "on" : ""}`} onClick={() => setTextStyle(s => ({ ...s, tigaD: !s.tigaD }))}>🧊 3D</button>
                      <button className={`v6-chip ${textStyle.grad ? "on" : ""}`} onClick={() => setTextStyle(s => ({ ...s, grad: !s.grad }))}>🌈 Gradasi</button>
                      <button className={`v6-chip ${textStyle.stroke ? "on" : ""}`} onClick={() => setTextStyle(s => ({ ...s, stroke: s.stroke ? "" : "#000000" }))}>✒️ Outline</button>
                      <button className={`v6-chip ${textStyle.shadow ? "on" : ""}`} onClick={() => setTextStyle(s => ({ ...s, shadow: !s.shadow }))}>🌫 Bayangan</button>
                    </div>
                    {textStyle.grad && (
                      <>
                        <div className="v6-lbl">WARNA GRADASI KE</div>
                        <div className="v6-rows">
                          {["#22d3ee", "#ec4899", "#fde047", "#a855f7", "#f97316", "#22c55e"].map(c => (
                            <button key={c} className={`v6-swatch ${textStyle.gradTo === c ? "on" : ""}`} style={{ background: c }} onClick={() => setTextStyle(s => ({ ...s, gradTo: c }))} />
                          ))}
                        </div>
                      </>
                    )}
                    <div className="v6-slider-row" style={{ marginTop: 6 }}>
                      <div className="lr"><span>Ukuran teks</span><b>{Math.round(textSize * 100)}%</b></div>
                      <input type="range" min={0.03} max={0.2} step={0.005} value={textSize} onChange={e => setTextSize(Number(e.target.value))} />
                    </div>
                    <p style={{ fontSize: 10, opacity: .6, margin: "2px 0 0" }}>👆 <b>Seret teks</b> di preview buat pindah posisi.</p>
                  </>
                )}
              </>
            )}
            
            {secOpen.subscribe && (
              <>
            {/* 🔔 v19.40: TOMBOL SUBSCRIBE ANIMASI */}
            <div className="v6-cardrow" style={{ marginTop: 8, borderColor: subOn ? "rgba(34,197,94,.6)" : undefined, background: subOn ? "rgba(34,197,94,.07)" : undefined }} onClick={() => setSubOn(!subOn)}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <div className="tt">
                <b>Tombol Subscribe animasi {subOn ? "✅ AKTIF" : "(mati — ketuk untuk aktifkan)"}</b>
                <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Banyak gaya · denyut ikut bass · lonceng goyang saat beat — geser jari buat pindah, cubit 2 jari buat ukuran</div>
              </div>
              <button className={`v6-toggle ${subOn ? "on" : ""}`} />
            </div>
            {subOn && (
              <>
                {/* 💎 v19.43: TEKS custom tombol subscribe */}
                <div className="v6-lbl">✏️ TULISAN TOMBOL</div>
                <input className="v6-inp" value={subTeks} maxLength={18} onChange={(e) => setSubTeks(e.target.value.toUpperCase() || "SUBSCRIBE")} />
                <p style={{ fontSize: 10, opacity: .6, margin: "2px 0 6px" }}>Ganti tulisan bebas (maks 18 huruf) — mis. "SUBSCRIBE YA" atau nama channel kamu.</p>
                {/* 🐛 v19.42.1: PREVIEW MINI di panel — pilihan langsung kelihatan */}
                <div className="v6-lbl">👁 PREVIEW TOMBOL (sesuai pilihanmu)</div>
                <canvas ref={subPrevRef} width={260} height={70}
                  style={{ width: "100%", maxWidth: 260, height: 70, borderRadius: 10, background: "#0b0b14", border: "1px solid rgba(255,255,255,.12)" }} />
                <div className="v6-lbl">🎨 PILIH GAYA ({SUB_STYLES.length})</div>
                <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                  {SUB_STYLES.map(s => (
                    <button key={s.id} className={`v6-chip ${subStyle === s.id ? "on" : ""}`} onClick={() => setSubStyle(s.id)}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
                <div className="v6-lbl">✨ ANIMASI</div>
                <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                  {SUB_ANIMS.map(a => (
                    <button key={a.id} className={`v6-chip ${subAnim === a.id ? "on" : ""}`} onClick={() => setSubAnim(a.id)}>
                      {a.label} <small style={{ opacity: .6 }}>{a.desc}</small>
                    </button>
                  ))}
                </div>
                {/* 🐛 v19.42: kontrol POSISI & UKURAN dari panel (bukan cuma drag) */}
                <div className="v6-lbl" style={{ marginTop: 6 }}>📍 POSISI (atau seret tombol di preview)</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="v6-chip" onClick={() => setSubPos(p => ({ ...p, x: Math.max(0.05, p.x - 0.03) }))}>⬅</button>
                  <button className="v6-chip" onClick={() => setSubPos(p => ({ ...p, x: Math.min(0.95, p.x + 0.03) }))}>➡</button>
                  <button className="v6-chip" onClick={() => setSubPos(p => ({ ...p, y: Math.max(0.05, p.y - 0.03) }))}>⬆</button>
                  <button className="v6-chip" onClick={() => setSubPos(p => ({ ...p, y: Math.min(0.95, p.y + 0.03) }))}>⬇</button>
                  <span style={{ fontSize: 10, color: "#8b8b98", marginLeft: 4 }}>geser halus</span>
                </div>
                <div className="v6-slider-row" style={{ marginTop: 6 }}>
                  <div className="lr"><span>Ukuran</span><b>{Math.round(subSize * 100)}%</b></div>
                  <input type="range" min={0.04} max={0.20} step={0.005} value={subSize} onChange={e => setSubSize(Number(e.target.value))} />
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button className="v6-chip" onClick={() => setSubSize(s => Math.max(0.04, s - 0.01))}>🔽 Kecil</button>
                  <button className="v6-chip" onClick={() => setSubSize(s => Math.min(0.20, s + 0.01))}>🔼 Besar</button>
                  <span style={{ fontSize: 10, color: "#8b8b98", marginLeft: 4 }}>atau cubit 2 jari di preview</span>
                </div>
                {/* ⏱ v19.41: DURASI tombol subscribe */}
                <div className="v6-lbl" style={{ marginTop: 6 }}>⏱ DURASI MUNCUL</div>
                <div className="v6-slider-row">
                  <div className="lr"><span>Muncul di</span><b>{fmtD(subStart)}</b></div>
                  <input type="range" min={0} max={Math.max(1, Math.floor(duration || 60))} step={0.5} value={subStart} onChange={e => setSubStart(Math.min(Number(e.target.value), subEnd > 0 ? subEnd : Number(e.target.value)))} />
                </div>
                <div className="v6-slider-row">
                  <div className="lr"><span>Hilang di</span><b>{subEnd > 0 ? fmtD(subEnd) : "Sampai akhir"}</b></div>
                  <input type="range" min={0} max={Math.max(1, Math.floor(duration || 60))} step={0.5} value={subEnd} onChange={e => setSubEnd(Number(e.target.value))} />
                </div>
                {subEnd > 0 && subEnd < (duration || 0) && <button className="v6-chip" onClick={() => setSubEnd(0)}>↺ Sampai akhir</button>}
                <p style={{ fontSize: 10, opacity: .6, margin: "2px 0 0" }}>👆 <b>Seret tombol</b> di preview buat pindah posisi · 🤏 <b>Cubit 2 jari</b> buat ukuran · ⏱ <b>Muncul/Hilang</b> buat atur kapan tombol tampil di video (fade halus 0.4 dtk).</p>
              </>
            )}
              </>
            )}
            
            {secOpen.lapisan && (
              <>
            {/* 🧩 v19.36: LAPISAN */}
            <div className="v6-lbl">🧩 LAPISAN (mata = tampil/sembunyi · slider = transparansi)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {LAYER_DEFS.map(l => (
                <div key={l.id} className="v6-cardrow" style={{ padding: "6px 10px", marginTop: 0, cursor: "default" }}>
                  <button className="v6-chip" style={{ fontSize: 12 }} onClick={() => setLayerVis(v => ({ ...v, [l.id]: !(v[l.id] ?? true) }))}>
                    {layerVis[l.id] ?? true ? "👁" : "🚫"}
                  </button>
                  <div className="tt" style={{ fontSize: 11 }}>{l.label}</div>
                  <input type="range" min={0} max={1} step={0.05} value={layerOp[l.id] ?? 1}
                    onChange={e => setLayerOp(o => ({ ...o, [l.id]: Number(e.target.value) }))}
                    style={{ width: 90 }} />
                  <b style={{ fontSize: 10, minWidth: 26, color: "#8b8b98" }}>{Math.round((layerOp[l.id] ?? 1) * 100)}%</b>
                </div>
              ))}
            </div>
              </>
            )}
            
            {secOpen.spektrum && (
              <>
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
              </>
            )}
            
            {secOpen.latar && (
              <>
            <div className="v6-lbl">🧹 EFEK DEKORATIF OTOMATIS (default BERSIH — nyalakan kalau mau)</div>
            <div className="v6-cardrow" style={{ marginTop: 0 }} onClick={() => setFxK("aurora", !fx.aurora)}>
              <span style={{ fontSize: 15 }}>🌌</span>
              <div className="tt"><b>Aurora (lingkaran cahaya bergerak)</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>gumpalan glow besar — bisa nutup visual</div></div>
              <button className={`v6-toggle ${fx.aurora ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" style={{ marginTop: 0 }} onClick={() => setFxK("shock", !fx.shock)}>
              <span style={{ fontSize: 15 }}>💥</span>
              <div className="tt"><b>Shockwave (cincin saat bass)</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>cincin membesar tiap bass naik</div></div>
              <button className={`v6-toggle ${fx.shock ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" style={{ marginTop: 0 }} onClick={() => setFxK("ring", !fx.ring)}>
              <span style={{ fontSize: 15 }}>⭕</span>
              <div className="tt"><b>Lingkar bass bawah</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>lingkaran di bawah tengah ikut musik</div></div>
              <button className={`v6-toggle ${fx.ring ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" style={{ marginTop: 0 }} onClick={() => setFxK("stars", !fx.stars)}>
              <span style={{ fontSize: 15 }}>🌟</span>
              <div className="tt"><b>Bintang berkelip</b><div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>70 bintang kecil di latar</div></div>
              <button className={`v6-toggle ${fx.stars ? "on" : ""}`} />
            </div>
            {modeBersih
              ? <button className="v6-chip" style={{ marginTop: 4 }} onClick={() => setFx({ aurora: true, shock: true, ring: true, stars: true })}>✨ Nyalakan semua efek</button>
              : <button className="v6-chip" style={{ marginTop: 4, color: "#fca5a5" }} onClick={() => setFx({ aurora: false, shock: false, ring: false, stars: false })}>🧹 Mode Bersih (matikan semua)</button>}
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
              </>
            )}
            
            {secOpen.gambar && (
              <>
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
              </>
            )}
            
            {secOpen.preset && (
              <>
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


              </>
            )}
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
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <button className="v6-chip" style={{ flex: 1, borderColor: "rgba(34,197,94,.5)", color: "#86efac", background: "rgba(34,197,94,.1)" }} disabled={lyrBusy} onClick={autoPasLirik}>
                    {lyrBusy ? "⏳ Mendengar audio…" : "🎤 Auto-pas Lirik ke Audio (pas banget)"}
                  </button>
                  {lyrAuto && <button className="v6-chip" style={{ color: "#fbbf24" }} onClick={() => { setLyrAuto(false); autoWordsRef.current = []; }}>↺ Manual</button>}
                </div>
                {/* 🌏 v19.19: pilih bahasa lagu (auto = deteksi; bisa Inggris/Jepang/dll) */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, opacity: .7 }}>🌏 Bahasa lagu:</span>
                  {[["auto", "🌐 Auto"], ["id", "🇮🇩 Indonesia"], ["en", "🇬🇧 Inggris"], ["ja", "🇯🇵 Jepang"], ["ko", "🇰🇷 Korea"], ["ms", "🇲🇾 Melayu"]].map(([v, lb]) => (
                    <button key={v} className={`v6-chip ${transLang === v ? "on" : ""}`} style={{ fontSize: 10 }} onClick={() => setTransLang(v)}>{lb}</button>
                  ))}
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
            <div className="v6-cardrow" onClick={() => setShorts(!shorts)} style={{ opacity: dualRender ? 0.5 : 1 }}>
              <span style={{ fontSize: 18 }}>▯</span>
              <div className="tt">Potong maks 59 dtk (Shorts/Reels){dualRender ? <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 500 }}>Nonaktif otomatis saat Dual Render — Long tetap FULL, Short pakai durasinya sendiri</div> : ""}</div>
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
            {/* 🐛 v19.42: pintas ke pengaturan elemen (subscribe, dll) biar gampang ketemu */}
            <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap", marginBottom: 6 }}>
              <button className="v6-chip" onClick={() => setStep(1)}>🔔 Atur Subscribe ›</button>
              <button className="v6-chip" onClick={() => setStep(2)}>💬 Atur Lirik ›</button>
              <button className="v6-chip" onClick={() => setStep(1)}>🎨 Atur Visual ›</button>
            </div>
            <div className="v6-cardrow" style={{ cursor: "default" }}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <div className="tt" style={{ fontSize: 11.5 }}>
                {dim.w}×{dim.h}px · 30fps · {fmtD(Math.min(duration, (shorts && !dualRender) ? 59.5 : duration))} · EQ {eq} · kompresi {comp}% {fades ? "· fade" : ""}
              </div>
            </div>

            {/* 🎬 v19.32 DUAL RENDER — sekali render, dapat 2 video */}
            <div className="v6-cardrow" onClick={() => setDualRender(!dualRender)} style={{ borderColor: dualRender ? "rgba(34,197,94,.55)" : undefined }}>
              <span style={{ fontSize: 18 }}>🎬</span>
              <div className="tt">
                <b>Dual Render: Long + Short otomatis</b>
                <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>1× render → 2 video: video utama + Short 9:16 ({shortDur} dtk) dari bagian PALING SERU — tanpa kepotong (layout 9:16 asli)</div>
              </div>
              <button className={`v6-toggle ${dualRender ? "on" : ""}`} />
            </div>
            {dualRender && (
              <>
                <div className="v6-lbl">⏱ DURASI SHORT</div>
                <div className="v6-chips" style={{ padding: 0 }}>
                  {[15, 30, 60].map(d => (
                    <button key={d} className={`v6-chip ${shortDur === d ? "on" : ""}`} onClick={() => setShortDur(d)}>{d} detik</button>
                  ))}
                </div>
                <div className="v6-lbl">🧠 TIMELINE ENERGI — hijau = bagian short yang diambil</div>
                <canvas ref={miniRef} width={360} height={60}
                  style={{ width: "100%", height: 60, borderRadius: 10, background: "#0b0b14", border: "1px solid rgba(255,255,255,.12)" }} />
                {duration > shortDur ? (
                  <>
                    <div className="v6-slider-row">
                      <div className="lr"><span>✋ Mulai short di:</span><b>{fmtD(shortStart)} {shortAuto ? "· 🎯 otomatis" : "· ✋ manual"}</b></div>
                      <input type="range" min={0} max={Math.max(1, Math.floor(duration - shortDur))} step={0.5}
                        value={clampN(shortStart, 0, Math.max(0, duration - shortDur))}
                        onChange={e => { setShortStart(Number(e.target.value)); setShortAuto(false); }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      <button className="v6-chip" style={{ borderColor: "rgba(34,197,94,.5)", color: "#86efac", background: "rgba(34,197,94,.08)" }}
                        onClick={() => {
                          if (!bufRef.current) return;
                          const k = cariKlimaksBuffer(bufRef.current, shortDur);
                          setShortStart(Math.round(k.start * 10) / 10);
                          setShortAuto(true);
                        }}>
                        🎯 Deteksi otomatis lagi
                      </button>
                      <button className="v6-chip" disabled={rendering || playing}
                        onClick={() => auditionAt(shortStart, Math.min(shortDur, duration - shortStart))}>
                        ▶ Pratinjau bagian ini
                      </button>
                    </div>
                    <p className="v6-note">💡 Short di-render ulang dengan layout 9:16 asli (608×1080) — bukan hasil potong dari 16:9, jadi tampilan selalu utuh. Lirik & denyut ikut pas di bagian yang dipilih.</p>
                  </>
                ) : (
                  <div className="v6-note">ℹ️ Musik cuma {fmtD(duration)} — short akan memakai seluruh musik dari awal.</div>
                )}
              </>
            )}

            {!!durWarn && <div className="v6-risk" style={{ fontSize: 11, lineHeight: 1.45 }}>{durWarn}</div>}
            {!!renderNote && <div className="v6-note" style={{ borderColor: "rgba(251,191,36,.4)", color: "#fde68a" }}>{renderNote}</div>}
            {/* ⚡ v19.46.1: TURBO — render super cepat (resolusi rendah + upscale) */}
            <div className="v6-cardrow" style={{ marginTop: 8 }} onClick={() => setTurbo(!turbo)}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <div className="tt">
                <b>Turbo Cepat (2-4× lebih cepat)</b>
                <div style={{ fontSize: 10, color: turbo ? "#fbbf24" : "#8b8b98", fontWeight: 500 }}>{turbo ? "ON — output 720p-class (lebih kecil & 2× lebih cepat, tetap bagus di YouTube)" : "OFF — kualitas penuh 1080p. Nyalakan kalau mau render ngebut"}</div>
              </div>
              <button className={`v6-toggle ${turbo ? "on" : ""}`} />
            </div>
            <div className="v6-lbl">⚡ KECEPATAN RENDER</div>
            <div className="v6-chips" style={{ padding: 0 }}>
              {[[30, "30 fps · paling halus"], [24, "24 fps · 20% lebih cepat"]].map(([f, lb]) => (
                <button key={f} className={`v6-chip ${fpsOpt === f ? "on" : ""}`} onClick={() => setFpsOpt(f as any)}>{lb}</button>
              ))}
            </div>
            <p style={{ fontSize: 10, opacity: .6, margin: "2px 0 0" }}>24 fps tetap mulus untuk visualizer & dipakai banyak channel besar — video panjang jadi jauh lebih cepat.</p>
            <div className="v6-note" style={{ borderColor: "rgba(34,197,94,.35)", color: "#a7f3d0", fontSize: 11 }}>
              ⚡ Mode render: {pakaiMode === "offline" ? "KUAT (offline WebCodecs) — tahan layar mati, durasi presisi, render jauh lebih cepat dari realtime" : pakaiMode === "realtime" ? "real-time (MediaRecorder) — layar wajib menyala" : "otomatis dipilih saat render"}
            </div>
            {!!estSisa && <div className="v6-okbox" style={{ fontSize: 12 }}>{estSisa}</div>}
            <button className="v6-bigcta" onClick={render} disabled={rendering || !audioUrl}>
              {rendering
                ? `⏳ Merender ${phase === "short" ? "SHORT (bagian seru)…" : phase === "long" ? "LONG…" : "…"} ${renderFase ? `(${renderFase === "audio" ? "audio" : renderFase === "video" ? "gambar" : "gabung"}) ` : ""}${Math.round(progress * 100)}%`
                : videoUrl ? "🔄 Render ulang" : dualRender ? "🚀 Render 2 video (Long + Short)" : "🚀 Render video spectrum"}</button>
            {rendering && <div className="v6-note" style={{ textAlign: "center" }}>{pakaiMode === "offline" ? "Mode KUAT: proses jalan sendiri tanpa bunyi — layar boleh mati, render tetap lanjut. " : "Biarkan layar menyala — render berjalan realtime (audio ikut diproses). "}{dualRender && "Setelah Long selesai, otomatis lanjut render Short."}</div>}
            {!!diag.length && !rendering && (
              <details style={{ marginTop: 8, fontSize: 10.5, opacity: .85 }}>
                <summary style={{ cursor: "pointer", padding: "6px 8px", background: "rgba(255,255,255,.05)", borderRadius: 8 }}>🔍 Laporan teknis render (untuk cek kalau ada masalah)</summary>
                <div style={{ padding: "6px 8px", lineHeight: 1.6, color: "#94a3b8", fontFamily: "monospace" }}>
                  {diag.map((d, i) => <div key={i}><span style={{ color: "#64748b" }}>{d.t}</span> {d.s}</div>)}
                </div>
              </details>
            )}
            {!!videoUrl && (
              <>
                <div className="v6-lbl">▭ LONG {dim.w}×{dim.h} {dualRender ? "— full video" : ""}</div>
                <video src={videoUrl} controls style={{ width: "100%", borderRadius: 12, marginTop: 10, border: "1px solid rgba(255,255,255,.14)" }} />
                <button className="v6-bigcta" style={{ background: "#22c55e", color: "#052e16" }} onClick={download}>⬇️ Download Long {videoBlob ? `(${(videoBlob.size / 1048576).toFixed(1)} MB)` : ""}</button>
              </>
            )}
            {!!shortUrl && (
              <>
                <div className="v6-lbl">▯ SHORT 9:16 — mulai {fmtD(shortStart)}, {fmtD(Math.min(shortDur, duration - shortStart))} dtk</div>
                <video src={shortUrl} controls style={{ width: "45%", borderRadius: 12, marginTop: 10, border: "1px solid rgba(255,255,255,.14)", aspectRatio: "9/16", background: "#000" }} />
                <button className="v6-bigcta" style={{ background: "linear-gradient(135deg,#ec4899,#f97316)", color: "#fff" }} onClick={downloadShort}>⬇️ Download Short {shortBlob ? `(${(shortBlob.size / 1048576).toFixed(1)} MB)` : ""}</button>
              </>
            )}
            {!!videoUrl && !shortUrl && (
              <div className="v6-okbox">✅ Siap diunggah ke YouTube/TikTok. Musik dari AI = orisinal, aman hak cipta 🛡️</div>
            )}
            {!!shortUrl && (
              <div className="v6-okbox">✅ Dua-duanya jadi! Long buat YouTube, Short buat Reels/TikTok/Shorts — bagian serunya otomatis terpilih 🎯</div>
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
