"use client";
/* 📖 v20.0 NICHE QUR'AN — menu khusus bacaan Qur'an (terpisah dari Spectrum).
   - Pilih surat & ayat (otomatis dari API) + terjemahan banyak bahasa
   - Suara: rekam / upload MP3 (TTS AI menyusul)
   - Suara alam latar (hujan/air/petir sintetis / file sendiri) + volume
   - FX vokal: reverb halus + fokus vokal (buang dengung) → tidak mentahan
   - Bingkai frame Islami, teks, tombol subscribe, logo glow, video latar
   - Render mulus pakai mesin offline (durasi sesuai audio, aman di HP 1-15 mnt)
   Spectrum TIDAK disentuh. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAFTAR_SURAT, SURAT_DEFAULT, BAHASA, ambilAyatBanyak, gabungAyat, type AyatGabung,
} from "@/lib/quran-data";
import { sambungAmbience, buatReverbIR, AMBIENCE_LABEL, type JenisAmbience } from "@/lib/ambience";
import { gambarFrameIslami, FRAME_ISLAMI, type GayaFrame } from "@/lib/quran-frame";
import { SUB_STYLES, SUB_ANIMS, hitungSubState, gambarSubscribe, type SubStyle, type SubAnim } from "@/lib/subscribe";
import { renderOfflineVideo, cekRenderOfflineMampu } from "@/lib/render-offline";

const LANGKAH = ["1️⃣ Surat", "2️⃣ Suara", "3️⃣ Tampilan", "4️⃣ Elemen", "5️⃣ Render"];
const LATAR_Q = [
  { id: "navy", css: ["#0a1628", "#0f1f3a"], label: "🌌 Navy" },
  { id: "hijau", css: ["#07231a", "#0c3b2a"], label: "💚 Hijau Tua" },
  { id: "emas", css: ["#1a1305", "#3a2a0c"], label: "✨ Emas Gelap" },
  { id: "hitam", css: ["#000000", "#101014"], label: "🖤 Hitam" },
];
function fmtD(s: number): string { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), d = Math.floor(s % 60); return `${m}:${String(d).padStart(2, "0")}`; }
function clampN(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

type ElemenPos = { x: number; y: number };

export default function NicheQuran() {
  const [step, setStep] = useState(0);
  /* 1️⃣ surat */
  const [pilihSurat, setPilihSurat] = useState<number[]>(SURAT_DEFAULT);
  const [bahasa, setBahasa] = useState("id");
  const [ayatList, setAyatList] = useState<AyatGabung[]>([]);
  const [ayatInfo, setAyatInfo] = useState(""); // nama surat terpilih
  const [loadAyat, setLoadAyat] = useState(false);
  const [ayatErr, setAyatErr] = useState("");
  /* 2️⃣ suara */
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDur, setAudioDur] = useState(0);
  const [audioNama, setAudioNama] = useState("");
  const [recm, setRecm] = useState<MediaRecorder | null>(null);
  const [recmBusy, setRecmBusy] = useState(false);
  const [ambience, setAmbience] = useState<JenisAmbience>("off");
  const [ambVol, setAmbVol] = useState(25);
  const [ambUrl, setAmbUrl] = useState("");
  const [ambBuf, setAmbBuf] = useState<AudioBuffer | null>(null);
  const [reverb, setReverb] = useState(0.18);
  const [fokusVokal, setFokusVokal] = useState(true);
  /* 3️⃣ tampilan */
  const [frame, setFrame] = useState<GayaFrame>("emas");
  const [latar, setLatar] = useState("navy");
  const [rasio, setRasio] = useState<"16:9" | "9:16">("16:9");
  const [arabSize, setArabSize] = useState(0.075);
  const [artiSize, setArtiSize] = useState(0.028);
  const [ayatY, setAyatY] = useState(0.42);
  /* 4️⃣ elemen */
  const [teksOn, setTeksOn] = useState(false);
  const [teksTxt, setTeksTxt] = useState("");
  const [teksPos, setTeksPos] = useState<ElemenPos>({ x: 0.5, y: 0.06 });
  const [teksSize, setTeksSize] = useState(0.045);
  const [subOn, setSubOn] = useState(false);
  const [subGaya, setSubGaya] = useState("yt");
  const [subAnim, setSubAnim] = useState<SubAnim>("denyut");
  const [subPos, setSubPos] = useState<ElemenPos>({ x: 0.5, y: 0.92 });
  const [subSize, setSubSize] = useState(0.085);
  const [logoOn, setLogoOn] = useState(false);
  const [logoImg, setLogoImg] = useState("");
  const [logoPos, setLogoPos] = useState<ElemenPos>({ x: 0.5, y: 0.15 });
  const [logoScale, setLogoScale] = useState(1);
  const [videoBg, setVideoBg] = useState("");
  /* render */
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState(0);
  const [hasil, setHasil] = useState<Blob | null>(null);
  const [hasilUrl, setHasilUrl] = useState("");
  const [renderFase, setRenderFase] = useState("");

  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const ambStopRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ t: "teks" | "sub" | "logo"; dx: number; dy: number } | null>(null);
  const pinchRef = useRef<{ d0: number; s0: number; t: "teks" | "sub" | "logo" } | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());

  const dim = useMemo(() => (rasio === "9:16" ? { w: 720, h: 1280 } : { w: 1280, h: 720 }), [rasio]);
  const totalAyat = ayatList.length;

  /* ---- timing proporsional per ayat (panjang arab → durasi) ---- */
  const timing = useMemo(() => {
    if (!totalAyat || !(audioDur > 0.5)) return [] as { start: number; end: number }[];
    const bobot = ayatList.map((a) => Math.max(4, a.teks.length));
    const sum = bobot.reduce((x, y) => x + y, 0);
    const out: { start: number; end: number }[] = [];
    let t = 0;
    bobot.forEach((b, i) => {
      const d = (audioDur * b) / sum;
      out.push({ start: t, end: t + d });
      t += d;
    });
    return out;
  }, [ayatList, audioDur, totalAyat]);

  function ayatAktif(t: number): number {
    if (!timing.length) return -1;
    for (let i = 0; i < timing.length; i++) if (t >= timing[i].start && t < timing[i].end) return i;
    return timing.length - 1;
  }

  /* ---- 1️⃣ ambil ayat ---- */
  async function ambilAyat() {
    if (!pilihSurat.length) { setAyatErr("Pilih minimal satu surat."); return; }
    setLoadAyat(true); setAyatErr(""); setMsg("");
    try {
      const edisi = BAHASA.find((b) => b.kode === bahasa)?.edisi || "quran.id.indonesian";
      const daftar = await ambilAyatBanyak(pilihSurat, edisi);
      const g = gabungAyat(daftar);
      setAyatList(g);
      setAyatInfo(`${g.length} ayat · ${daftar.map((d) => d.nama).join(", ")}`);
      setMsg(`✅ ${g.length} ayat dimuat (Arab + ${BAHASA.find((b) => b.kode === bahasa)?.label})`);
    } catch (e: any) {
      setAyatErr(e?.message || "Gagal ambil ayat — cek koneksi internet.");
    } finally { setLoadAyat(false); }
  }

  /* ---- 2️⃣ suara: decode audio ---- */
  async function pasangAudio(url: string, nama: string) {
    setAudioUrl(url); setAudioNama(nama);
    try {
      const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const ctx: AudioContext = new AC(1, 1, 44100);
      const ab = await (await fetch(url)).arrayBuffer();
      const buf = await ctx.decodeAudioData(ab.slice(0));
      try { ctx.close(); } catch {}
      bufRef.current = buf;
      setAudioDur(buf.duration);
      setMsg(`✅ Audio ${nama} — ${fmtD(buf.duration)}`);
    } catch { setMsg("⚠️ Audio tidak bisa dibaca — coba file lain (mp3/wav)."); }
  }
  function uploadAudio(f?: File | null) {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setMsg("⚠️ Audio maks ±20MB"); return; }
    const r = new FileReader();
    r.onload = () => pasangAudio(r.result as string, f.name.replace(/\.[^.]+$/, "").slice(0, 40));
    r.readAsDataURL(f);
  }
  /* rekam */
  async function mulaiRekam() {
    try {
      // 🐛 v20.1: MATIKAN dulu suara alam latar — kalau tidak, ikut kerekam jadi keresek/bising
      ambStopRef.current?.stop();
      // kualitas rekaman lebih baik: autoGainControl ON (volume stabil), echo & noise reduction
      const st = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
      const mr = new MediaRecorder(st, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunks, { type: mime || "audio/webm" });
        const url = URL.createObjectURL(b);
        pasangAudio(url, "Rekaman saya");
        st.getTracks().forEach((t) => t.stop());
        setMsg(`✅ Rekaman selesai (${chunks.length} bagian). Dengarkan dulu di pemutar di atas — kalau masih keresek, coba tempat lebih tenang.`);
      };
      mr.start();
      setRecm(mr); setRecmBusy(true);
      setMsg("🔴 Merekam… tap Selesai kalau sudah selesai baca.");
    } catch { setMsg("⚠️ Mikrofon tidak bisa dipakai — izinkan akses mikrofon, atau pakai Upload MP3."); }
  }
  function stopRekam() {
    if (recm && recm.state !== "inactive") recm.stop();
    setRecm(null); setRecmBusy(false);
    // nyalakan lagi suara alam kalau pengguna memakainya (preview)
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!actxRef.current) actxRef.current = new AC();
      const ctx = actxRef.current;
      if (ctx && ambience !== "off" && audioDur > 0) {
        const dest = ctx.createGain(); dest.gain.value = 0.9; dest.connect(ctx.destination);
        ambStopRef.current = sambungAmbience(ctx, dest, ambience, ambVol / 100, 0, audioDur + 5, ambBuf);
      }
    } catch { /* abaikan */ }
  }
  /* ambience upload */
  function uploadAmbience(f?: File | null) {
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      setAmbUrl(r.result as string); setAmbience("upload");
      try {
        const AC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
        const ctx: AudioContext = new AC(1, 1, 44100);
        const ab = await (await fetch(r.result as string)).arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        try { ctx.close(); } catch {}
        setAmbBuf(buf);
        setMsg("✅ Suara alam dari file siap.");
      } catch { setMsg("⚠️ File ambience tidak bisa dibaca — pakai preset Hujan/Air."); }
    };
    r.readAsDataURL(f);
  }
  /* preview ambience live */
  useEffect(() => {
    ambStopRef.current?.stop();
    if (ambience === "off" || !audioDur) return;
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!actxRef.current) actxRef.current = new AC();
      const ctx = actxRef.current;
      if (!ctx) return;
      const dest = ctx.createGain(); dest.gain.value = 0.9; dest.connect(ctx.destination);
      ambStopRef.current = sambungAmbience(ctx, dest, ambience, ambVol / 100, 0, audioDur + 5, ambBuf);
    } catch { /* abaikan */ }
    return () => ambStopRef.current?.stop();
  }, [ambience, ambVol, ambUrl, audioDur, ambBuf]); // eslint-disable-line

  /* ---- video latar (sederhana: loop natural) ---- */
  useEffect(() => {
    if (!videoBg) { videoRef.current = null; return; }
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = "anonymous"; v.src = videoBg;
    v.play().catch(() => {});
    videoRef.current = v;
    return () => { try { v.pause(); } catch {} videoRef.current = null; };
  }, [videoBg]);

  /* ---- draw preview ---- */
  function gambarScene(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
    // latar
    const lg = LATAR_Q.find((x) => x.id === latar) || LATAR_Q[0];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lg.css[0]); g.addColorStop(1, lg.css[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // video latar
    const vv = videoRef.current;
    if (vv && vv.readyState >= 2 && vv.videoWidth) {
      const ir = vv.videoWidth / vv.videoHeight, cr = W / H;
      let sw = vv.videoWidth, sh = vv.videoHeight, sx = 0, sy = 0;
      if (ir > cr) { sw = vv.videoHeight * cr; sx = (vv.videoWidth - sw) / 2; } else { sh = vv.videoWidth / cr; sy = (vv.videoHeight - sh) / 2; }
      ctx.drawImage(vv, sx, sy, sw, sh, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    }
    // bingkai islami
    gambarFrameIslami(ctx, W, H, frame);
    // ayat aktif
    const idx = ayatAktif(t);
    if (idx >= 0 && ayatList[idx]) {
      const a = ayatList[idx];
      const cy = ayatY * H;
      ctx.textAlign = "center";
      // arab besar
      const fs = Math.round(Math.min(W, H) * arabSize);
      ctx.font = `700 ${fs}px 'Scheherazade New','Amiri','Traditional Arabic',serif`;
      ctx.fillStyle = "#d4af37";
      ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 12;
      // wrap arab (maks 88%)
      const maxW = W * 0.82;
      let baris = [a.teks];
      if (ctx.measureText(a.teks).width > maxW) {
        const kata = a.teks.split(/\s+/);
        const out: string[] = []; let cur = "";
        for (const k of kata) {
          const coba = cur ? cur + " " + k : k;
          if (!cur || ctx.measureText(coba).width <= maxW) cur = coba;
          else { out.push(cur); cur = k; }
        }
        if (cur) out.push(cur);
        baris = out;
      }
      const lh = fs * 1.35;
      const y0 = cy - ((baris.length - 1) * lh) / 2 - lh * 0.4;
      baris.forEach((b, i) => {
        ctx.fillText(b, W / 2, y0 + i * lh);
        // tanda ayat kecil
        if (i === baris.length - 1) {
          ctx.font = `600 ${Math.round(fs * 0.22)}px system-ui`;
          ctx.fillStyle = "#e8d9a0";
          ctx.shadowBlur = 4;
          ctx.fillText(`﴾${a.nomor}﴿`, W / 2, y0 + i * lh + fs * 0.9);
        }
      });
      ctx.shadowBlur = 0;
      // arti di bawah
      if (a.arti) {
        const fs2 = Math.round(Math.min(W, H) * artiSize);
        ctx.font = `500 ${fs2}px system-ui`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
        const maxW2 = W * 0.8;
        const kata = a.arti.split(/\s+/);
        const baris2: string[] = []; let cur = "";
        for (const k of kata) {
          const coba = cur ? cur + " " + k : k;
          if (!cur || ctx.measureText(coba).width <= maxW2) cur = coba;
          else { baris2.push(cur); cur = k; }
        }
        if (cur) baris2.push(cur);
        const lh2 = fs2 * 1.3;
        baris2.slice(0, 3).forEach((b, i) => {
          ctx.fillText(b, W / 2, y0 + baris.length * lh + 8 + i * lh2);
        });
      }
    }
    // teks custom
    if (teksOn && teksTxt.trim()) {
      ctx.textAlign = "center";
      const fs = Math.round(Math.min(W, H) * teksSize);
      ctx.font = `800 ${fs}px system-ui`;
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = Math.max(2, fs * 0.14); ctx.lineJoin = "round";
      ctx.strokeText(teksTxt, teksPos.x * W, teksPos.y * H);
      ctx.fillText(teksTxt, teksPos.x * W, teksPos.y * H);
    }
    // subscribe
    if (subOn) {
      const stl = SUB_STYLES.find((s) => s.id === subGaya) || SUB_STYLES[0];
      const st = hitungSubState(0.4, 0, 0.3, subAnim, t);
      gambarSubscribe(ctx, subPos.x * W, subPos.y * H, Math.min(W, H) * subSize, stl, st, t, "SUBSCRIBE");
    }
    // logo glow
    if (logoOn && logoImg) {
      const r = Math.min(W, H) * 0.09 * logoScale;
      const cx = logoPos.x * W, cy = logoPos.y * H;
      const rg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
      rg.addColorStop(0, "rgba(255,215,0,0.45)"); rg.addColorStop(1, "rgba(255,215,0,0)");
      ctx.fillStyle = rg; ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
      const im = new Image(); im.src = logoImg;
      if (im.complete && im.naturalWidth) ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2);
    }
  }

  /* ---- preview loop ---- */
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    let t0 = performance.now() / 1000;
    const loop = () => {
      const t = (performance.now() / 1000 - t0) % Math.max(1, audioDur);
      gambarScene(ctx, cv.width, cv.height, t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioDur, ayatList, frame, latar, arabSize, artiSize, ayatY, teksOn, teksTxt, teksPos, teksSize, subOn, subGaya, subAnim, subPos, subSize, logoOn, logoImg, logoPos, logoScale, videoBg, timing]); // eslint-disable-line

  /* ---- drag & pinch di preview ---- */
  function hitTest(x: number, y: number): "teks" | "sub" | "logo" | null {
    if (teksOn && teksTxt.trim() && Math.hypot(x - teksPos.x, y - teksPos.y) < 0.2) return "teks";
    if (subOn && Math.hypot(x - subPos.x, y - subPos.y) < 0.2) return "sub";
    if (logoOn && logoImg && Math.hypot(x - logoPos.x, y - logoPos.y) < 0.18) return "logo";
    return null;
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const r = e.currentTarget.getBoundingClientRect();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const t = hitTest((mx - r.left) / r.width, (my - r.top) / r.height);
      if (t) {
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        const s0 = t === "teks" ? teksSize : t === "sub" ? subSize : logoScale;
        pinchRef.current = { d0, s0, t };
      }
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const t = hitTest(x, y);
    if (t) {
      const pos = t === "teks" ? teksPos : t === "sub" ? subPos : logoPos;
      dragRef.current = { t, dx: pos.x - x, dy: pos.y - y };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && pinchRef.current) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = d / Math.max(1, pinchRef.current.d0);
      if (pinchRef.current.t === "teks") setTeksSize(clampN(pinchRef.current.s0 * k, 0.02, 0.12));
      else if (pinchRef.current.t === "sub") setSubSize(clampN(pinchRef.current.s0 * k, 0.04, 0.2));
      else setLogoScale(clampN(pinchRef.current.s0 * k, 0.4, 2.5));
      return;
    }
    if (!dragRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clampN((e.clientX - r.left) / r.width, 0.04, 0.96);
    const y = clampN((e.clientY - r.top) / r.height, 0.04, 0.95);
    const nx = clampN(x + dragRef.current.dx, 0.04, 0.96);
    const ny = clampN(y + dragRef.current.dy, 0.04, 0.95);
    if (dragRef.current.t === "teks") setTeksPos({ x: nx, y: ny });
    else if (dragRef.current.t === "sub") setSubPos({ x: nx, y: ny });
    else setLogoPos({ x: nx, y: ny });
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  };

  /* ---- 5️⃣ render ---- */
  async function renderQuran() {
    if (!bufRef.current) { setMsg("⚠️ Pasang suara dulu di langkah 2 (upload/rekam)."); setStep(1); return; }
    if (!ayatList.length) { setMsg("⚠️ Ambil ayat dulu di langkah 1."); setStep(0); return; }
    if (audioDur > 15 * 60) { setMsg("⚠️ Audio lebih dari 15 menit — di HP bisa lama/berat. Disarankan potong ≤15 menit, atau garap di laptop."); return; }
    setBusy("render"); setMsg(""); setProg(0); setHasil(null);
    try {
      const mampu = await cekRenderOfflineMampu().catch(() => null);
      if (!mampu || !mampu.ok) { setMsg("⚠️ Browser ini tidak mendukung render offline — coba Chrome terbaru."); setBusy(""); return; }
      const buf = bufRef.current;
      const bl = await renderOfflineVideo({
        buf, w: dim.w, h: dim.h, offset: 0, dur: audioDur,
        eq: fokusVokal ? "vokal" : "flat", comp: 45, gain: 95, fades: false,
        audioCodec: mampu.audioCodec, fps: 24, videoBitrate: dim.w <= 720 ? 2_600_000 : 3_600_000,
        ambience: ambience !== "off" ? { jenis: ambience, gain: ambVol / 100, buf: ambBuf } : null,
        vocalReverb: reverb,
        drawBg: (ctx, W, H) => {
          const lg = LATAR_Q.find((x) => x.id === latar) || LATAR_Q[0];
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, lg.css[0]); g.addColorStop(1, lg.css[1]);
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          gambarFrameIslami(ctx, W, H, frame);
        },
        drawDin: (ctx, W, H, t) => gambarScene(ctx, W, H, t),
        draw: (ctx, W, H, t) => gambarScene(ctx, W, H, t),
        onProg: (p) => setProg(p),
        onFase: (f) => setRenderFase(f),
        onInfo: (s) => console.log("[quran-render]", s),
      });
      setHasil(bl);
      setHasilUrl(URL.createObjectURL(bl));
      setMsg(`✅ Video jadi — ${fmtD(audioDur)} · ${dim.w}×${dim.h}`);
    } catch (e: any) {
      setMsg(`❌ Render gagal: ${e?.message || "error"} — coba perpendek audio atau kecilkan resolusi.`);
    } finally { setBusy(""); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#070b14", color: "#e5e7eb", fontFamily: "system-ui", padding: "10px 12px 40px", maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button onClick={() => (location.href = "/")} style={{ background: "none", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: 10, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>← Menu</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>📖 Niche Qur'an</div>
          <div style={{ fontSize: 10.5, color: "#8b8b98" }}>Bacaan Qur'an jadi video — tenang, rapi, & banyak bahasa</div>
        </div>
      </div>

      {/* langkah */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
        {LANGKAH.map((l, i) => (
          <button key={l} onClick={() => setStep(i)} style={{ flex: "0 0 auto", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", background: step === i ? "linear-gradient(135deg,#8b5cf6,#d946ef)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {/* pratinjau selalu tampil */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <canvas ref={cvRef} width={dim.w} height={dim.h}
          style={{ width: "100%", maxWidth: rasio === "9:16" ? 230 : 460, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", aspectRatio: `${dim.w}/${dim.h}`, touchAction: "none", background: "#000" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>

      {!!msg && <p style={{ fontSize: 11.5, color: msg.startsWith("✅") ? "#6ee7b7" : msg.startsWith("❌") ? "#fca5a5" : msg.startsWith("⚠️") ? "#fbbf24" : "#8b8b98", margin: "0 0 8px", lineHeight: 1.4 }}>{msg}</p>}

      {/* ===== 1️⃣ SURAT ===== */}
      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>PILIH SURAT (bisa banyak) — otomatis dari Al-Qur'an</div>
          <div style={{ maxHeight: 250, overflowY: "auto", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 6 }}>
            {DAFTAR_SURAT.map((s) => (
              <button key={s.id} onClick={() => setPilihSurat((arr) => arr.includes(s.id) ? arr.filter((x) => x !== s.id) : [...arr, s.id])}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 8, border: "none", background: pilihSurat.includes(s.id) ? "rgba(139,92,246,.25)" : "transparent", color: "#fff", fontSize: 12.5, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 14 }}>{pilihSurat.includes(s.id) ? "✅" : "⬜"}</span>
                <span style={{ flex: 1 }}>{s.nama} <span style={{ color: "#8b8b98", fontSize: 11 }}>· {s.ayat} ayat</span></span>
                <span style={{ fontFamily: "'Scheherazade New',serif", color: "#d4af37", fontSize: 15 }}>{s.arab}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#8b8b98" }}>🌍 Terjemahan:</span>
            <select value={bahasa} onChange={(e) => setBahasa(e.target.value)} style={{ background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 8px", fontSize: 12 }}>
              {BAHASA.map((b) => <option key={b.kode} value={b.kode}>{b.bendera} {b.label}</option>)}
            </select>
            <button onClick={ambilAyat} disabled={loadAyat} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
              {loadAyat ? "⏳ Ambil…" : "📖 Ambil Ayat"}
            </button>
          </div>
          {!!ayatErr && <p style={{ fontSize: 11.5, color: "#fca5a5" }}>{ayatErr}</p>}
          {!!ayatInfo && <p style={{ fontSize: 11, color: "#6ee7b7" }}>✅ {ayatInfo}</p>}
          {!!ayatList.length && <p style={{ fontSize: 10.5, color: "#8b8b98" }}>🌍 Terjemahan saat ini: <b style={{ color: "#cbd5e1" }}>{BAHASA.find((b) => b.kode === bahasa)?.bendera} {BAHASA.find((b) => b.kode === bahasa)?.label}</b> — ganti bahasa lalu tekan 📖 Ambil Ayat lagi untuk memperbarui.</p>}
          {ayatList.length > 0 && (
            <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 6 }}>
              {ayatList.slice(0, 40).map((a, i) => (
                <div key={i} style={{ fontSize: 11, padding: "3px 4px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  <span style={{ color: "#d4af37" }}>{a.surat} : {a.nomor}</span> <span style={{ color: "#cbd5e1" }}>{a.teks.slice(0, 50)}…</span>
                  {a.arti && <div style={{ color: "#8b8b98", fontSize: 10 }}>{a.arti.slice(0, 70)}…</div>}
                </div>
              ))}
              {ayatList.length > 40 && <p style={{ fontSize: 10, color: "#8b8b98", textAlign: "center" }}>…{ayatList.length - 40} ayat lagi</p>}
            </div>
          )}
          {/* 🐛 v20.1: ganti bahasa → auto-refetch ayat */}
          {!!ayatList.length && (
            <button onClick={ambilAyat} disabled={loadAyat} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(139,92,246,.5)", background: "rgba(139,92,246,.12)", color: "#c4b5fd", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {loadAyat ? "⏳ Memperbarui…" : "🔄 Muat ulang dengan bahasa baru"}
            </button>
          )}
          <button onClick={() => setStep(1)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginTop: 2 }}>
            Lanjut: Suara ›
          </button>
        </div>
      )}

      {/* ===== 2️⃣ SUARA ===== */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>SUARA BACAAN</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={recmBusy ? stopRekam : mulaiRekam} style={{ flex: 1, minWidth: 120, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(239,68,68,.4)", background: recmBusy ? "rgba(239,68,68,.2)" : "rgba(239,68,68,.08)", color: "#fca5a5", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
              {recmBusy ? "⏹ Selesai Rekam" : "🎙️ Rekam Sendiri"}
            </button>
            <label style={{ flex: 1, minWidth: 120, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(34,197,94,.4)", background: "rgba(34,197,94,.08)", color: "#86efac", fontWeight: 800, fontSize: 12, textAlign: "center", cursor: "pointer" }}>
              📥 Upload MP3
              <input type="file" accept="audio/*" hidden onChange={(e) => { uploadAudio(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            </label>
          </div>
          {!!audioNama && <p style={{ fontSize: 11.5, color: "#6ee7b7" }}>🎵 {audioNama} — {fmtD(audioDur)}</p>}
          {/* 🐛 v20.1: pemutar audio — dengarkan dulu sebelum render (rekaman mentah bersih/tidak) */}
          {!!audioUrl && (
            <audio controls src={audioUrl} style={{ width: "100%", marginTop: 2 }} />
          )}
          <p style={{ fontSize: 9.5, color: "#8b8b98", margin: 0 }}>Dengarkan dulu: kalau rekaman masih ada <b>keresek/bising</b>, nyalakan 🌧️ suara alam di bawah lalu reverb & fokus vokal — atau rekam ulang di tempat tenang.</p>

          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>🌧️ SUARA ALAM LATAR (tidak ganggu bacaan — volumenya terpisah)</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(Object.keys(AMBIENCE_LABEL) as JenisAmbience[]).map((j) => (
              <button key={j} onClick={() => setAmbience(j)} style={{ padding: "6px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: ambience === j ? "rgba(139,92,246,.4)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11, cursor: "pointer" }}>{AMBIENCE_LABEL[j]}</button>
            ))}
          </div>
          {ambience === "upload" && (
            <label style={{ padding: "8px", borderRadius: 10, border: "1px dashed rgba(255,255,255,.3)", textAlign: "center", fontSize: 12, color: "#cbd5e1", cursor: "pointer" }}>
              📂 Pilih file suara alam (hujan/air/petir mp3)
              <input type="file" accept="audio/*" hidden onChange={(e) => { uploadAmbience(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            </label>
          )}
          {ambience !== "off" && (
            <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ minWidth: 70 }}>Volume alam</span>
              <input type="range" min={0} max={100} value={ambVol} onChange={(e) => setAmbVol(Number(e.target.value))} style={{ flex: 1 }} />
              <b style={{ minWidth: 30 }}>{ambVol}%</b>
            </label>
          )}

          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>🎙️ EFEK SUARA BACAAN (biar tidak mentahan)</div>
          <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 70 }}>Ruang (reverb)</span>
            <input type="range" min={0} max={0.5} step={0.02} value={reverb} onChange={(e) => setReverb(Number(e.target.value))} style={{ flex: 1 }} />
            <b style={{ minWidth: 30 }}>{Math.round(reverb * 100)}%</b>
          </label>
          <button onClick={() => setFokusVokal(!fokusVokal)} style={{ padding: "8px", borderRadius: 10, border: "1px solid rgba(139,92,246,.4)", background: fokusVokal ? "rgba(139,92,246,.2)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
            {fokusVokal ? "✅ Fokus vokal AKTIF — buang dengung rendah, suara bacaan jernih" : "🔘 Fokus vokal mati (suara mentahan)"}
          </button>
          <p style={{ fontSize: 10, color: "#8b8b98" }}>Rekomendasi: Reverb 20-40% + Fokus vokal ON → hasil rekaman HP kedengaran jernih & hangat.</p>
          <button onClick={() => setStep(2)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginTop: 2 }}>
            Lanjut: Tampilan ›
          </button>
        </div>
      )}

      {/* ===== 3️⃣ TAMPILAN ===== */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>🕌 BINGKAI FRAME ISLAMI</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FRAME_ISLAMI.map((f) => (
              <button key={f.id} onClick={() => setFrame(f.id)} style={{ padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: frame === f.id ? "rgba(212,175,55,.25)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>{f.emoji} {f.label}</button>
            ))}
          </div>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>🎨 LATAR</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {LATAR_Q.map((l) => (
              <button key={l.id} onClick={() => setLatar(l.id)} style={{ padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: latar === l.id ? "rgba(139,92,246,.35)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11.5, cursor: "pointer" }}>{l.label}</button>
            ))}
            <label style={{ padding: "7px 10px", borderRadius: 999, border: "1px dashed rgba(255,255,255,.3)", color: "#cbd5e1", fontSize: 11.5, cursor: "pointer" }}>
              🎬 Video latar
              <input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setVideoBg(r.result as string); r.readAsDataURL(f); e.currentTarget.value = ""; }} />
            </label>
            {videoBg && <button onClick={() => setVideoBg("")} style={{ padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(239,68,68,.4)", color: "#fca5a5", fontSize: 11.5, cursor: "pointer" }}>✕ Hapus video</button>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setRasio("16:9")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: rasio === "16:9" ? "rgba(139,92,246,.3)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 12, cursor: "pointer" }}>🖥️ 16:9</button>
            <button onClick={() => setRasio("9:16")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: rasio === "9:16" ? "rgba(139,92,246,.3)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 12, cursor: "pointer" }}>📱 9:16 Shorts</button>
          </div>
          <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 70 }}>Ukuran ayat</span>
            <input type="range" min={0.04} max={0.13} step={0.005} value={arabSize} onChange={(e) => setArabSize(Number(e.target.value))} style={{ flex: 1 }} />
          </label>
          <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 70 }}>Ukuran arti</span>
            <input type="range" min={0.014} max={0.05} step={0.002} value={artiSize} onChange={(e) => setArtiSize(Number(e.target.value))} style={{ flex: 1 }} />
          </label>
          <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 70 }}>Posisi ayat</span>
            <input type="range" min={0.12} max={0.75} step={0.01} value={ayatY} onChange={(e) => setAyatY(Number(e.target.value))} style={{ flex: 1 }} />
          </label>
        </div>
      )}

      {/* ===== 4️⃣ ELEMEN ===== */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 10 }}>
            <button onClick={() => setTeksOn(!teksOn)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              ✏️ Teks tambahan <span>{teksOn ? "✅ ON" : "OFF"}</span>
            </button>
            {teksOn && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <input className="v6-inp" style={{ background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "6px 8px", fontSize: 12 }} placeholder="Tulis teks (mis. QS. Al-Fatihah)" value={teksTxt} onChange={(e) => setTeksTxt(e.target.value)} />
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 60 }}>Ukuran</span>
                  <input type="range" min={0.02} max={0.12} step={0.005} value={teksSize} onChange={(e) => setTeksSize(Number(e.target.value))} style={{ flex: 1 }} />
                </label>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: 0 }}>Geser/cubit langsung di pratinjau untuk posisi & ukuran.</p>
              </div>
            )}
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 10 }}>
            <button onClick={() => setSubOn(!subOn)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              🔔 Tombol Subscribe <span>{subOn ? "✅ ON" : "OFF"}</span>
            </button>
            {subOn && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {SUB_STYLES.map((s) => (
                    <button key={s.id} onClick={() => setSubGaya(s.id)} style={{ padding: "5px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: subGaya === s.id ? "rgba(139,92,246,.35)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{s.emoji} {s.label}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {SUB_ANIMS.map((a) => (
                    <button key={a.id} onClick={() => setSubAnim(a.id)} style={{ padding: "5px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: subAnim === a.id ? "rgba(139,92,246,.35)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{a.label}</button>
                  ))}
                </div>
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 60 }}>Ukuran</span>
                  <input type="range" min={0.04} max={0.18} step={0.005} value={subSize} onChange={(e) => setSubSize(Number(e.target.value))} style={{ flex: 1 }} />
                </label>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: 0 }}>Geser/cubit langsung di pratinjau.</p>
              </div>
            )}
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 10 }}>
            <button onClick={() => setLogoOn(!logoOn)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              ✨ Logo bercahaya <span>{logoOn ? "✅ ON" : "OFF"}</span>
            </button>
            {logoOn && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <label style={{ padding: "7px", borderRadius: 8, border: "1px dashed rgba(255,255,255,.3)", textAlign: "center", fontSize: 11.5, color: "#cbd5e1", cursor: "pointer" }}>
                  🖼️ Upload logo (png)
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setLogoImg(r.result as string); r.readAsDataURL(f); e.currentTarget.value = ""; }} />
                </label>
                <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 60 }}>Besar</span>
                  <input type="range" min={0.4} max={2.2} step={0.1} value={logoScale} onChange={(e) => setLogoScale(Number(e.target.value))} style={{ flex: 1 }} />
                </label>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: 0 }}>Geser/cubit di pratinjau. Sinar emas otomatis mengelilingi logo.</p>
              </div>
            )}
          </div>
          <button onClick={() => setStep(4)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginTop: 2 }}>
            Lanjut: Render ›
          </button>
        </div>
      )}

      {/* ===== 5️⃣ RENDER ===== */}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>🎬 SIAP RENDER</div>
            <p style={{ fontSize: 11.5, color: "#cbd5e1", margin: "0 0 4px", lineHeight: 1.5 }}>
              📖 {ayatInfo || "Belum ambil ayat"} · 🌍 {BAHASA.find((b) => b.kode === bahasa)?.label}<br />
              🎵 {audioNama || "Belum ada suara"} ({audioDur ? fmtD(audioDur) : "—"}) · 🖼️ {rasio}<br />
              🌧️ {AMBIENCE_LABEL[ambience]} {ambience !== "off" ? `· ${ambVol}%` : ""} · 🎙️ Reverb {Math.round(reverb * 100)}%
            </p>
            {audioDur > 15 * 60 && <p style={{ fontSize: 11, color: "#fbbf24", margin: "4px 0 0" }}>⚠️ Lebih dari 15 menit — di HP bisa lama/berat. Disarankan ≤15 menit atau garap di laptop.</p>}
            <button onClick={renderQuran} disabled={busy === "render"}
              style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: busy ? "wait" : "pointer", marginTop: 8 }}>
              {busy === "render" ? `⏳ Render… ${renderFase} ${Math.round(prog * 100)}%` : "🎬 Render Video"}
            </button>
            {busy === "render" && (
              <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden", marginTop: 6 }}>
                <div style={{ height: "100%", width: `${prog * 100}%`, background: "linear-gradient(90deg,#8b5cf6,#d946ef)", transition: "width .3s" }} />
              </div>
            )}
          </div>
          {hasil && (
            <div style={{ border: "1px solid rgba(34,197,94,.4)", borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>✅ VIDEO JADI</div>
              <video controls src={hasilUrl} style={{ width: "100%", borderRadius: 10, maxHeight: 340 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => { const a = document.createElement("a"); a.href = hasilUrl; a.download = `quran-${Date.now()}.mp4`; a.click(); }}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#22c55e", color: "#052e16", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>📥 Download MP4</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
