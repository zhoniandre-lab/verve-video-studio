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
// ✒️ v20.14: font Islami (Google Fonts) — dimuat sekali di head
function useFontsIslami() {
  useEffect(() => {
    const id = "quran-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&family=Reem+Kufi:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Poppins:wght@400;700&display=swap";
    document.head.appendChild(l);
  }, []);
}
import {
  DAFTAR_SURAT, ITEM_AYAT_KURSI, BAHASA, ambilAyatBanyak, gabungAyat, type AyatGabung, type ItemBacaan,
} from "@/lib/quran-data";
import { sambungAmbience, buatReverbIR, AMBIENCE_LABEL, type JenisAmbience } from "@/lib/ambience";
import { hitungKaliLoop, durasiLoopTotal, type ModeLoopVideo } from "@/lib/videoloop"; // 🔁 v20.7: loop video
import { gambarFrameIslami, gambarDesainIslami, gambarFramePng, FRAME_ISLAMI, framePngBawaan, type GayaFrame } from "@/lib/quran-frame";
import { SUB_STYLES, SUB_ANIMS, hitungSubState, gambarSubscribe, type SubStyle, type SubAnim } from "@/lib/subscribe";
import { FONT_ISLAMI, EFEK_TEKS, gambarTeksIslami, gambarOverlayAllah, type TeksItem, type GayaOverlay, OVERLAY_LABEL } from "@/lib/quran-teks"; // ✒️ v20.14
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
  useFontsIslami(); // ✒️ v20.14: muat font Islami sekali
  const [step, setStep] = useState(0);
  /* 1️⃣ surat — daftar bacaan berURUTAN (atas = dibaca duluan) */
  const [daftarBacaan, setDaftarBacaan] = useState<ItemBacaan[]>(() => [
    ITEM_AYAT_KURSI,
    { id: "s114", suratId: 114, nama: DAFTAR_SURAT.find((x) => x.id === 114)?.nama || "An-Nas", arab: DAFTAR_SURAT.find((x) => x.id === 114)?.arab },
    { id: "s113", suratId: 113, nama: DAFTAR_SURAT.find((x) => x.id === 113)?.nama || "Al-Falaq", arab: DAFTAR_SURAT.find((x) => x.id === 113)?.arab },
    { id: "s112", suratId: 112, nama: DAFTAR_SURAT.find((x) => x.id === 112)?.nama || "Al-Ikhlas", arab: DAFTAR_SURAT.find((x) => x.id === 112)?.arab },
  ]);
  const [bahasa, setBahasa] = useState("id");
  const [ayatList, setAyatList] = useState<AyatGabung[]>([]);
  const [ayatInfo, setAyatInfo] = useState(""); // nama surat terpilih
  const [loadAyat, setLoadAyat] = useState(false);
  const [ayatErr, setAyatErr] = useState("");
  /* atur urutan: pindah item */
  function pindahItem(i: number, arah: -1 | 1) {
    setDaftarBacaan((arr) => {
      const j = i + arah;
      if (j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function hapusItem(i: number) {
    setDaftarBacaan((arr) => arr.filter((_, k) => k !== i));
  }
  function tambahItem(it: ItemBacaan) {
    setDaftarBacaan((arr) => (arr.some((x) => x.id === it.id) ? arr : [...arr, it]));
  }
  /* ⏳ v20.15: PILIH AYAT SPESIFIK — mis. Al-Baqarah 255 lalu Al-Baqarah 40.
     Surat yang sedang dikonfigurasi + rentang ayatnya. */
  const [konfigSurat, setKonfigSurat] = useState<number | null>(null);
  const [dariAyat, setDariAyat] = useState(1);
  const [sampaiAyat, setSampaiAyat] = useState(1);
  function bukaKonfig(s: { id: number; nama: string; arab: string; ayat: number }) {
    setKonfigSurat(s.id);
    setDariAyat(1);
    setSampaiAyat(s.ayat);
  }
  function tambahRentang() {
    if (konfigSurat == null) return;
    const s = DAFTAR_SURAT.find((x) => x.id === konfigSurat);
    if (!s) return;
    let dari = Math.max(1, Math.min(s.ayat, Math.round(dariAyat) || 1));
    let sampai = Math.max(dari, Math.min(s.ayat, Math.round(sampaiAyat) || dari));
    const nama = dari === sampai ? `${s.nama} ayat ${dari}` : `${s.nama} ayat ${dari}–${sampai}`;
    tambahItem({ id: `s${s.id}-${dari}-${sampai}`, suratId: s.id, nama, arab: s.arab, dari, sampai });
    setKonfigSurat(null);
  }
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
  const [reverb, setReverb] = useState(0.25);
  const [fokusVokal, setFokusVokal] = useState(true);
  // 🎙️ v20.6 MODE STUDIO — rekaman HP jadi seperti studio (EQ studio + noise gate + reverb)
  const [studioOn, setStudioOn] = useState(true);
  /* 3️⃣ tampilan */
  const [frame, setFrame] = useState<GayaFrame>("emas");
  // 🖼️ v20.11: FRAME PNG CUSTOM — upload bingkai sendiri, langsung dipakai
  // (di-convert jadi data URL; menimpa gaya frame saat dipasang)
  const [framePng, setFramePng] = useState("");
  // 🖼️ v20.12/20.13: FRAME PNG (bawaan/custom) — preload + UKURAN BISA DIATUR
  const pngFrameRef = useRef<HTMLImageElement | null>(null);
  const pngFrameSrcRef = useRef("");
  // 🔍 v20.13: skala frame PNG — >1 = bingkai lebih tipis & ruang ayat lebih
  // lega (tepi terpotong), <1 = bingkai lebih tebal/terapung
  const [pngScale, setPngScale] = useState(1);
  useEffect(() => {
    const src = framePng || framePngBawaan(frame) || "";
    if (!src) { pngFrameRef.current = null; pngFrameSrcRef.current = ""; return; }
    if (src === pngFrameSrcRef.current && pngFrameRef.current) return; // sudah dimuat
    const im = new Image();
    im.onload = () => { pngFrameRef.current = im; pngFrameSrcRef.current = src; };
    im.src = src;
  }, [frame, framePng]);
  /** 🔍 v20.13: gambar frame PNG dengan skala (bawaan & custom pakai ref yang sudah dimuat). */
  function gambarPngFrame(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const im = pngFrameRef.current;
    if (!im || !im.complete || !im.naturalWidth) return;
    const s = pngScale;
    const dw = W * s, dh = H * s;
    ctx.save();
    ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
    // scrim tipis di tengah biar teks terbaca (frame biasanya tebal di tepi)
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  const [latar, setLatar] = useState("navy");
  const [rasio, setRasio] = useState<"16:9" | "9:16">("16:9");
  const [arabSize, setArabSize] = useState(0.075);
  const [artiSize, setArtiSize] = useState(0.028);
  const [ayatY, setAyatY] = useState(0.42);
  /* 4️⃣ elemen */
  const [teksOn, setTeksOn] = useState(false);
  // ✒️ v20.14: BANYAK TEKS — array item (masing-masing punya font/efek/posisi/animasi)
  const [teksList, setTeksList] = useState<TeksItem[]>([]);
  const [teksAktif, setTeksAktif] = useState(0); // indeks yang sedang diedit
  const [overlayGaya, setOverlayGaya] = useState<GayaOverlay>("kiri_kanan");
  function teksBaru(): TeksItem {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    return { id, txt: "Teks baru", font: "arab", efek: "cahaya", x: 0.5, y: 0.1, size: 0.045, anim: "diam" };
  }
  function ubahTeks(i: number, patch: Partial<TeksItem>) {
    setTeksList((arr) => arr.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  }
  function hapusTeks(i: number) {
    setTeksList((arr) => arr.filter((_, k) => k !== i));
    setTeksAktif((a) => (i < a ? a - 1 : Math.max(0, a - 1)));
  }
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
  // 🔁 v20.7 LOOP VIDEO — auto (pas durasi audio) / 1× / 2× / 3× (sama seperti Spectrum)
  const [videoLoopMode, setVideoLoopMode] = useState<ModeLoopVideo>("auto");
  const [videoDurQ, setVideoDurQ] = useState(0);
  /* render */
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState(0);
  const [hasil, setHasil] = useState<Blob | null>(null);
  const [hasilUrl, setHasilUrl] = useState("");
  const [renderFase, setRenderFase] = useState("");
  // ⚡ v20.9 TURBO RENDER: "normal" = 78% (seimbang) / "ekstra" = 60% (paling cepat)
  const [turboMode, setTurboMode] = useState<"normal" | "ekstra">("normal");

  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const ambStopRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ t: "teks" | "sub" | "logo"; dx: number; dy: number } | null>(null);
  const pinchRef = useRef<{ d0: number; s0: number; t: "teks" | "sub" | "logo" } | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  // 🐛 v20.10: logo dimuat SEKALI ke ref (dulu new Image() tiap frame → tidak pernah muncul)
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!logoImg) { logoImgRef.current = null; return; }
    const im = new Image();
    im.onload = () => { logoImgRef.current = im; };
    im.src = logoImg;
    return () => { logoImgRef.current = null; };
  }, [logoImg]);
  // ⚡ v20.5 OPTIMASI: latar + bingkai islami di-CACHE ke canvas offscreen
  // (digambar SEKALI saat frame/latar/ukuran berubah, lalu drawImage tiap frame
  // — jauh lebih ringan di HP daripada menggambar gradien + ornamen tiap frame).
  const frameCacheRef = useRef<HTMLCanvasElement | null>(null);
  const frameCacheKeyRef = useRef("");
  function dapatCacheFrame(W: number, H: number): HTMLCanvasElement | null {
    try {
      // 🐛 v20.6: cache HARUS ikut gaya frame & latar — dulu cuma cek ukuran,
      // jadi ganti frame/latar TIDAK pernah muncul (stale cache) = fitur "mati".
      const k = `${frame}|${latar}|${framePng ? "png" : (framePngBawaan(frame) ? "png" : "no")}|${pngScale}|${W}x${H}`;
      const c = frameCacheRef.current;
      if (c && c.width === W && c.height === H && frameCacheKeyRef.current === k) return c;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      const lg = LATAR_Q.find((x) => x.id === latar) || LATAR_Q[0];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, lg.css[0]); g.addColorStop(1, lg.css[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 🖼️ v20.11-20.13: frame PNG (custom/bawaan) dengan skala → dipakai; kalau tidak → gaya bawaan
      if (pngFrameRef.current && pngFrameSrcRef.current) gambarPngFrame(ctx, W, H);
      else { gambarFrameIslami(ctx, W, H, frame); gambarDesainIslami(ctx, W, H, frame); }
      frameCacheRef.current = cv;
      frameCacheKeyRef.current = k;
      return cv;
    } catch { return null; }
  }

  const dim = useMemo(() => (rasio === "9:16" ? { w: 720, h: 1280 } : { w: 1280, h: 720 }), [rasio]);
  const totalAyat = ayatList.length;

  /* ---- preview: play/pause audio sinkron teks ---- */
  const [playPrev, setPlayPrev] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const pvTRef = useRef(0); // waktu preview (detik) — sinkron dengan audio saat diputar

  /* ---- timing: AUTO proporsional (panjang arab → durasi) + BISA DIEDIT ---- */
  const autoBatas = useMemo(() => {
    // batas waktu tiap ayat: [0, t1, t2, ..., durasi]
    if (!totalAyat || !(audioDur > 0.5)) return [] as number[];
    const bobot = ayatList.map((a) => Math.max(4, a.teks.length));
    const sum = bobot.reduce((x, y) => x + y, 0);
    const out: number[] = [0];
    let t = 0;
    bobot.forEach((b) => { t += (audioDur * b) / sum; out.push(t); });
    out[out.length - 1] = audioDur;
    return out;
  }, [ayatList, audioDur, totalAyat]);
  // ⏱ v20.7 EDIT TIMING: override manual (null = ikut auto) + geser global
  const [manualBatas, setManualBatas] = useState<number[] | null>(null);
  const [offsetG, setOffsetG] = useState(0); // detik, geser semua (mis. basmalah di awal)
  const seg = useMemo(() => {
    if (!autoBatas.length) return [] as { start: number; end: number }[];
    let b = manualBatas && manualBatas.length === autoBatas.length ? [...manualBatas] : [...autoBatas];
    if (offsetG) b = b.map((x) => clampN(x + offsetG, 0, audioDur));
    b = b.map((x, i) => clampN(x, 0, audioDur));
    b.sort((x, y) => x - y);
    b[0] = 0; b[b.length - 1] = audioDur;
    const out: { start: number; end: number }[] = [];
    for (let i = 0; i < b.length - 1; i++) out.push({ start: b[i], end: b[i + 1] });
    return out;
  }, [autoBatas, manualBatas, offsetG, audioDur]);

  function ayatAktif(t: number): number {
    if (!seg.length) return -1;
    for (let i = 0; i < seg.length; i++) if (t >= seg[i].start && t < seg[i].end) return i;
    return seg.length - 1;
  }
  /* ⏱ v20.7: geser batas antar ayat (nudge ±0,5 dtk) */
  function aturBatas(i: number, delta: number) {
    setManualBatas((prev) => {
      const base = prev && prev.length === autoBatas.length ? [...prev] : [...autoBatas];
      const bawah = i > 0 ? base[i - 1] + 0.2 : 0;
      const atas = i < base.length - 2 ? base[i + 2] - 0.2 : audioDur;
      base[i + 1] = clampN((base[i + 1] || 0) + delta, bawah, atas);
      return base;
    });
  }
  /* ⏱ v20.7: TANDAI posisi sekarang (saat ▶ jalan) sebagai awal ayat berikutnya */
  function tandaiBatas() {
    const t = tPreview();
    const idx = ayatAktif(t);
    if (idx < 0 || idx >= seg.length - 1) { setMsg("⚠️ Mainkan audio ▶ dulu, lalu tandai di tengah-tengah bacaan."); return; }
    setManualBatas((prev) => {
      const base = prev && prev.length === autoBatas.length ? [...prev] : [...autoBatas];
      base[idx + 1] = clampN(t, (base[idx] || 0) + 0.2, idx + 1 < base.length - 1 ? (base[idx + 2] ?? audioDur) - 0.2 : audioDur);
      return base;
    });
    setMsg(`✅ Batas ayat ${idx + 1} → ${idx + 2} ditandai di ${fmtD(t)}`);
  }
  function resetTiming() { setManualBatas(null); setOffsetG(0); setMsg("↺ Timing kembali otomatis (proporsional panjang ayat)."); }
  /* 🐛 v20.2: tanpa audio → teks DIAM di ayat pertama (tidak gonta-ganti) */
  function tPreview(): number {
    if (playPrev && audioElRef.current) return audioElRef.current.currentTime;
    return pvTRef.current;
  }

  /* ---- 1️⃣ ambil ayat (mengikuti URUTAN daftar bacaan) ---- */
  async function ambilAyat() {
    if (!daftarBacaan.length) { setAyatErr("Tambah minimal satu surat/ayat."); return; }
    setLoadAyat(true); setAyatErr(""); setMsg("");
    try {
      const edisi = BAHASA.find((b) => b.kode === bahasa)?.edisi || "quran.id.indonesian";
      const daftar = await ambilAyatBanyak(daftarBacaan, edisi);
      const g = gabungAyat(daftar);
      setAyatList(g);
      setAyatInfo(`${g.length} ayat · urutan: ${daftar.map((d) => d.nama).join(" → ")}`);
      setMsg(`✅ ${g.length} ayat dimuat sesuai urutan (Arab + ${BAHASA.find((b) => b.kode === bahasa)?.label})`);
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

  /* ---- video latar (v20.7: durasi terbaca + loop auto/1x/2x/3x) ---- */
  useEffect(() => {
    if (!videoBg) { videoRef.current = null; setVideoDurQ(0); return; }
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = "anonymous"; v.src = videoBg;
    v.onloadedmetadata = () => { if (v.duration > 0 && isFinite(v.duration)) setVideoDurQ(v.duration); };
    v.play().catch(() => {});
    videoRef.current = v;
    return () => { try { v.pause(); } catch {} videoRef.current = null; };
  }, [videoBg]);

  /* ---- draw preview ---- */
  function gambarScene(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
    // 🐛 v20.11 URUTAN GAMBAR DIPERBAIKI: VIDEO dulu (paling bawah), lalu
    // bingkai/desain DI ATASNYA — dulu video digambar SETELAH cache frame
    // → video menutup bingkai (frame tidak kelihatan saat pakai video latar).
    // 1) video latar
    const vv = videoRef.current;
    if (vv && vv.readyState >= 2 && vv.videoWidth) {
      const vd = vv.duration > 0 ? vv.duration : 4;
      const totalPlay = durasiLoopTotal(vd, audioDur || vd, videoLoopMode);
      const masihJalan = t < totalPlay - 0.35;
      if (masihJalan && vv.paused) vv.play().catch(() => {});
      if (!masihJalan && !vv.paused) vv.pause();
      const ir = vv.videoWidth / vv.videoHeight, cr = W / H;
      let sw = vv.videoWidth, sh = vv.videoHeight, sx = 0, sy = 0;
      if (ir > cr) { sw = vv.videoHeight * cr; sx = (vv.videoWidth - sw) / 2; } else { sh = vv.videoWidth / cr; sy = (vv.videoHeight - sh) / 2; }
      ctx.drawImage(vv, sx, sy, sw, sh, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    } else {
      // tanpa video → latar gradien + bingkai (cache)
      const fc = dapatCacheFrame(W, H);
      if (fc) ctx.drawImage(fc, 0, 0, W, H);
      else { ctx.fillStyle = "#070b14"; ctx.fillRect(0, 0, W, H); }
    }
    // 2) bingkai + desain Islami SELALU DI ATAS (tidak peduli ada video atau tidak)
    //    — untuk kasus video: gambar ulang bingkai+desain di atas video.
    if (vv && vv.readyState >= 2 && vv.videoWidth) {
      if (pngFrameRef.current && pngFrameSrcRef.current) gambarPngFrame(ctx, W, H);
      else { gambarFrameIslami(ctx, W, H, frame); gambarDesainIslami(ctx, W, H, frame); }
    }
    // ayat aktif
    const idx = ayatAktif(t);
    if (idx >= 0 && ayatList[idx]) {
      const a = ayatList[idx];
      const cy = ayatY * H;
      ctx.textAlign = "center";
      // arab besar — outline (strokeText) + fill; TANPA shadowBlur (mahal di HP)
      const fs = Math.round(Math.min(W, H) * arabSize);
      ctx.font = `700 ${fs}px 'Scheherazade New','Amiri','Traditional Arabic',serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = Math.max(3, fs * 0.14);
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
        ctx.strokeText(b, W / 2, y0 + i * lh);
        ctx.fillStyle = "#d4af37";
        ctx.fillText(b, W / 2, y0 + i * lh);
        // tanda ayat kecil
        if (i === baris.length - 1) {
          ctx.font = `600 ${Math.round(fs * 0.22)}px system-ui`;
          ctx.fillStyle = "#e8d9a0";
          ctx.strokeText(`﴾${a.nomor}﴿`, W / 2, y0 + i * lh + fs * 0.9);
          ctx.fillText(`﴾${a.nomor}﴿`, W / 2, y0 + i * lh + fs * 0.9);
        }
      });
      // arti di bawah — outline + fill (tanpa shadowBlur)
      if (a.arti) {
        const fs2 = Math.round(Math.min(W, H) * artiSize);
        ctx.font = `500 ${fs2}px system-ui`;
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
        ctx.lineWidth = Math.max(2, fs2 * 0.16);
        baris2.slice(0, 3).forEach((b, i) => {
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.strokeText(b, W / 2, y0 + baris.length * lh + 8 + i * lh2);
          ctx.fillStyle = "rgba(255,255,255,0.94)";
          ctx.fillText(b, W / 2, y0 + baris.length * lh + 8 + i * lh2);
        });
      }
    }
    // ✒️ v20.14: BANYAK TEKS (masing-masing font/efek/animasi)
    if (teksOn) {
      for (const ti of teksList) {
        if (!ti.txt.trim()) continue;
        gambarTeksIslami(ctx, ti, W, H, t, 0);
      }
    }
    // ☪️ v20.14: OVERLAY ALLAH & MUHAMMAD (dengan animasi cahaya)
    gambarOverlayAllah(ctx, W, H, overlayGaya, t, 0);
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
      const im = logoImgRef.current;
      if (im && im.complete && im.naturalWidth) ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2);
    }
  }

  /* ---- preview loop (v20.2: sinkron dengan audio; v20.5: ~30fps + cache) ---- */
  useEffect(() => {
    if (busy === "render") return; // ⚡ v20.5: preview dimatikan saat render — hemat CPU
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    let last = 0;
    const loop = (now: number) => {
      // ⚡ v20.5: throttle ~30fps — mata tidak bisa bedain, HP jauh lebih ringan
      if (now - last >= 33) {
        last = now;
        try {
          const t = tPreview();
          gambarScene(ctx, cv.width, cv.height, t);
        } catch (e) {
          // 🐛 v20.10 ANTI-BEKU: error apa pun TIDAK boleh mematikan preview —
          // dulu sekali error → requestAnimationFrame berhenti → semua fitur
          // Tampilan kelihatan "mati". Sekarang error dilewati, preview tetap jalan.
          console.warn("[quran-preview]", e);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, audioDur, ayatList, frame, latar, rasio, dim.w, dim.h, arabSize, artiSize, ayatY, teksOn, teksList, teksAktif, overlayGaya, subOn, subGaya, subAnim, subPos, subSize, logoOn, logoImg, logoPos, logoScale, videoBg, seg, playPrev, offsetG, manualBatas, pngScale, framePng]);

  /* 🎙️ v20.6: preview via rantai STUDIO (MediaElementSource → EQ studio → kompresor) —
     suara yang didengar pas ▶ = mendekati hasil render (tidak mentahan) */
  const previewSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewNodesRef = useRef<AudioNode[]>([]);
  async function sambungPreviewStudio(el: HTMLAudioElement) {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!actxRef.current) actxRef.current = new AC();
      const ctx = actxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      if (!previewSrcRef.current) previewSrcRef.current = ctx.createMediaElementSource(el);
      previewNodesRef.current.forEach((n) => { try { n.disconnect(); } catch {} });
      previewNodesRef.current = [];
      const src = previewSrcRef.current;
      src.disconnect();
      if (studioOn) {
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85;
        const dip = ctx.createBiquadFilter(); dip.type = "peaking"; dip.frequency.value = 350; dip.Q.value = 1; dip.gain.value = -2.5;
        const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 3000; pk.Q.value = 1.2; pk.gain.value = 3.5;
        const air = ctx.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 9000; air.gain.value = 1.5;
        const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -20; cp.ratio.value = 4; cp.attack.value = 0.004; cp.release.value = 0.18;
        const g = ctx.createGain(); g.gain.value = 0.95;
        src.connect(hp); hp.connect(dip); dip.connect(pk); pk.connect(air); air.connect(cp); cp.connect(g); g.connect(ctx.destination);
        previewNodesRef.current = [hp, dip, pk, air, cp, g];
      } else {
        src.connect(ctx.destination);
      }
    } catch { /* preview tanpa rantai — tetap jalan */ }
  }
  /* tombol ▶/⏸ preview — putar audio & teks ikut sinkron */
  function togglePlay() {
    if (!audioUrl || !bufRef.current) { setMsg("⚠️ Pasang suara dulu di langkah 2 (upload/rekam) — teks akan mengikuti suara otomatis."); setStep(1); return; }
    const el = audioElRef.current;
    if (!el) return;
    if (playPrev) {
      el.pause(); setPlayPrev(false);
    } else {
      el.currentTime = pvTRef.current >= audioDur - 0.5 ? 0 : pvTRef.current;
      void sambungPreviewStudio(el);
      el.play().then(() => setPlayPrev(true)).catch(() => setMsg("⚠️ Audio tidak bisa diputar — cek file."));
    }
  }

  /* ---- drag & pinch di preview ---- */
  function hitTest(x: number, y: number): "teks" | "sub" | "logo" | null {
    // ✒️ v20.14: hit-test teks AKTIF (dari daftar) — bukan satu teks global
    if (teksOn && teksList[teksAktif]?.txt.trim() && Math.hypot(x - teksList[teksAktif].x, y - teksList[teksAktif].y) < 0.2) return "teks";
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
        const s0 = t === "teks" ? (teksList[teksAktif]?.size ?? 0.045) : t === "sub" ? subSize : logoScale;
        pinchRef.current = { d0, s0, t };
      }
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const t = hitTest(x, y);
    if (t) {
      const pos = t === "teks" ? (teksList[teksAktif] ? { x: teksList[teksAktif].x, y: teksList[teksAktif].y } : { x: 0.5, y: 0.1 }) : t === "sub" ? subPos : logoPos;
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
      if (pinchRef.current.t === "teks") ubahTeks(teksAktif, { size: clampN(pinchRef.current.s0 * k, 0.02, 0.12) });
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
    if (dragRef.current.t === "teks") ubahTeks(teksAktif, { x: nx, y: ny });
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
        eq: studioOn ? "studio" : (fokusVokal ? "vokal" : "flat"), comp: 45, gain: 95, fades: false,
        audioCodec: mampu.audioCodec, fps: 24, videoBitrate: dim.w <= 720 ? 2_600_000 : 3_600_000,
        // ⚡ v20.8/20.9 TURBO CEPAT: render di resolusi lebih kecil lalu upscale —
        // 1 menit render jauh lebih cepat (HP); kualitas tetap bagus untuk
        // YouTube (yang re-encode sendiri). normal=0.78 (~40% cepat),
        // ekstra=0.60 (~2.7× lebih cepat dari full, kualitas tetap oke).
        resScale: turboMode === "ekstra" ? 0.6 : 0.78,
        ambience: ambience !== "off" ? { jenis: ambience, gain: ambVol / 100, buf: ambBuf } : null,
        vocalReverb: studioOn ? Math.max(reverb, 0.15) : reverb,
        noiseGate: studioOn ? 0.003 : 0,
        drawBg: (ctx, W, H) => {
          // ⚡ v20.5: pakai cache (latar+frame digambar sekali per ukuran render)
          const fc = dapatCacheFrame(W, H);
          if (fc) ctx.drawImage(fc, 0, 0, W, H);
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
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, flexDirection: "column", alignItems: "center" }}>
        <canvas ref={cvRef} width={dim.w} height={dim.h}
          style={{ width: "100%", maxWidth: rasio === "9:16" ? 230 : 460, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", aspectRatio: `${dim.w}/${dim.h}`, touchAction: "none", background: "#000" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {/* 🐛 v20.2: tombol putar + indikator ayat — teks mengikuti suara */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button onClick={togglePlay} style={{ padding: "8px 16px", borderRadius: 999, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
            {playPrev ? "⏸ Jeda" : "▶ Putar & tonton"}
          </button>
          {!!ayatList.length && (
            <span style={{ fontSize: 11, color: "#8b8b98" }}>
              {playPrev || pvTRef.current > 0
                ? `Ayat ${Math.min(totalAyat, Math.max(1, ayatAktif(tPreview()) + 1))}/${totalAyat}`
                : `Belum diputar — teks diam di ayat 1 (pasang suara lalu ▶)`}
            </span>
          )}
        </div>
        {!audioUrl && <p style={{ fontSize: 10, color: "#fbbf24", margin: "4px 0 0" }}>⚠️ Belum ada suara — di langkah 2 upload/rekam dulu, lalu ▶ untuk melihat teks mengikuti suara.</p>}
        <audio ref={audioElRef} src={audioUrl} onTimeUpdate={() => { if (audioElRef.current) pvTRef.current = audioElRef.current.currentTime; }}
          onEnded={() => { setPlayPrev(false); if (audioElRef.current) pvTRef.current = 0; }} style={{ display: "none" }} />
      </div>

      {!!msg && <p style={{ fontSize: 11.5, color: msg.startsWith("✅") ? "#6ee7b7" : msg.startsWith("❌") ? "#fca5a5" : msg.startsWith("⚠️") ? "#fbbf24" : "#8b8b98", margin: "0 0 8px", lineHeight: 1.4 }}>{msg}</p>}

      {/* ===== 1️⃣ SURAT ===== */}
      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>📋 URUTAN BACAAN <span style={{ color: "#8b8b98", fontWeight: 500 }}>(atas = dibaca duluan)</span></div>
          {!daftarBacaan.length && <p style={{ fontSize: 11.5, color: "#fbbf24" }}>Belum ada bacaan — tambah dari daftar di bawah.</p>}
          {daftarBacaan.map((it, i) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(139,92,246,.4)", borderRadius: 10, padding: "7px 8px", background: "rgba(139,92,246,.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#c4b5fd", minWidth: 22 }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: 12.5 }}>{it.nama}</span>
              {it.dari && <span style={{ fontSize: 10, color: "#8b8b98" }}>ayat {it.dari}{it.sampai && it.sampai !== it.dari ? `–${it.sampai}` : ""}</span>}
              <button onClick={() => pindahItem(i, -1)} disabled={i === 0} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, color: "#fff", width: 30, height: 30, cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.35 : 1 }}>⬆</button>
              <button onClick={() => pindahItem(i, 1)} disabled={i === daftarBacaan.length - 1} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, color: "#fff", width: 30, height: 30, cursor: i === daftarBacaan.length - 1 ? "default" : "pointer", opacity: i === daftarBacaan.length - 1 ? 0.35 : 1 }}>⬇</button>
              <button onClick={() => hapusItem(i)} style={{ background: "rgba(239,68,68,.2)", border: "none", borderRadius: 8, color: "#fca5a5", width: 30, height: 30, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>➕ TAMBAH BACAAN</div>
          <button onClick={() => tambahItem(ITEM_AYAT_KURSI)} disabled={daftarBacaan.some((x) => x.id === "kursi")}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(212,175,55,.4)", background: "rgba(212,175,55,.08)", color: "#e8d9a0", fontSize: 12, fontWeight: 700, cursor: daftarBacaan.some((x) => x.id === "kursi") ? "default" : "pointer", opacity: daftarBacaan.some((x) => x.id === "kursi") ? 0.45 : 1, textAlign: "left" }}>
            📌 {ITEM_AYAT_KURSI.nama} {daftarBacaan.some((x) => x.id === "kursi") ? "— sudah ada" : ""}
          </button>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 6 }}>
            {DAFTAR_SURAT.filter((s) => s.id !== 2).map((s) => (
              <div key={s.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 8px", borderRadius: 8, background: daftarBacaan.some((x) => x.suratId === s.id) ? "rgba(139,92,246,.18)" : "transparent" }}>
                  <button onClick={() => tambahItem({ id: `s${s.id}`, suratId: s.id, nama: s.nama, arab: s.arab })}
                    style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, background: "none", border: "none", color: "#fff", fontSize: 12.5, cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <span style={{ fontSize: 13 }}>{daftarBacaan.some((x) => x.suratId === s.id) ? "✅" : "➕"}</span>
                    <span style={{ flex: 1 }}>{s.nama} <span style={{ color: "#8b8b98", fontSize: 11 }}>· {s.ayat} ayat</span></span>
                    <span style={{ fontFamily: "'Scheherazade New',serif", color: "#d4af37", fontSize: 15 }}>{s.arab}</span>
                  </button>
                  <button onClick={() => bukaKonfig(s)} title="Pilih ayat spesifik"
                    style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(139,92,246,.5)", background: "rgba(139,92,246,.12)", color: "#c4b5fd", fontSize: 11, cursor: "pointer" }}>✏️ ayat</button>
                </div>
                {/* ⏳ v20.15: panel pilih rentang ayat untuk surat ini */}
                {konfigSurat === s.id && (
                  <div style={{ margin: "2px 8px 8px", border: "1px solid rgba(139,92,246,.4)", borderRadius: 10, padding: 8, background: "rgba(139,92,246,.08)" }}>
                    <div style={{ fontSize: 11.5, color: "#cbd5e1", marginBottom: 6 }}>🔢 Pilih ayat <b style={{ color: "#e8d9a0" }}>{s.nama}</b> (1–{s.ayat})</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>dari
                        <input type="number" min={1} max={s.ayat} value={dariAyat} onChange={(e) => setDariAyat(Number(e.target.value))}
                          style={{ width: 56, background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 6px", fontSize: 12 }} />
                      </label>
                      <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>sampai
                        <input type="number" min={1} max={s.ayat} value={sampaiAyat} onChange={(e) => setSampaiAyat(Number(e.target.value))}
                          style={{ width: 56, background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "5px 6px", fontSize: 12 }} />
                      </label>
                      <button onClick={tambahRentang} style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>➕ Tambah</button>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      <button onClick={() => { setKonfigSurat(null); }} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)", color: "#cbd5e1", fontSize: 10.5, cursor: "pointer" }}>✕ Batal</button>
                      <span style={{ fontSize: 9.5, color: "#8b8b98", alignSelf: "center" }}>Contoh: 255–255 = Ayat Kursi, 40–40 = satu ayat saja. Bisa tambah beberapa rentang berbeda.</span>
                    </div>
                  </div>
                )}
              </div>
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

          {/* ⏱ v20.7: SINKRON AYAT & SUARA — edit timing biar pas */}
          <div style={{ border: "1px solid rgba(139,92,246,.35)", borderRadius: 12, padding: 10, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>⏱ SINKRON AYAT & SUARA</div>
            {!audioUrl ? (
              <p style={{ fontSize: 10.5, color: "#8b8b98", margin: 0 }}>Pasang suara dulu (rekam/upload) — nanti ayat otomatis dibagi rata sesuai panjang teks, dan bisa kamu geser di sini biar pas.</p>
            ) : (
              <>
                <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 86 }}>Geser semua</span>
                  <input type="range" min={-15} max={15} step={0.5} value={offsetG} onChange={(e) => setOffsetG(Number(e.target.value))} style={{ flex: 1 }} />
                  <b style={{ minWidth: 44 }}>{offsetG > 0 ? `+${offsetG}` : offsetG} dtk</b>
                </label>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "2px 0 6px" }}>Kalau audio mulai dengan basmalah dulu sebelum ayat 1 → geser + supaya ayat 1 muncul setelah basmalah.</p>
                <button onClick={tandaiBatas} style={{ width: "100%", padding: "9px", borderRadius: 10, border: "1px solid rgba(34,197,94,.5)", background: "rgba(34,197,94,.1)", color: "#86efac", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  🎯 Tandai posisi ▶ sekarang = awal ayat berikutnya
                </button>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "4px 0 6px" }}>Cara: putar ▶, saat qari mulai ayat berikutnya → tap tombol ini. Ulangi untuk tiap perpindahan.</p>
                <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: 4 }}>
                  {seg.slice(0, 20).map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 2px", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 11 }}>
                      <span style={{ color: "#d4af37", minWidth: 18 }}>{i + 1}.</span>
                      <span style={{ flex: 1, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ayatList[i]?.teks.slice(0, 30) || ""}…</span>
                      <span style={{ color: "#8b8b98", fontSize: 10 }}>{fmtD(s.start)}</span>
                      <button onClick={() => aturBatas(i, -0.5)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6, color: "#fff", width: 26, height: 24, cursor: "pointer", fontSize: 11 }}>−</button>
                      <button onClick={() => aturBatas(i, 0.5)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6, color: "#fff", width: 26, height: 24, cursor: "pointer", fontSize: 11 }}>+</button>
                    </div>
                  ))}
                  {seg.length > 20 && <p style={{ fontSize: 9, color: "#8b8b98", textAlign: "center" }}>…{seg.length - 20} ayat lagi (semua tetap ikut proporsi)</p>}
                </div>
                <button onClick={resetTiming} style={{ marginTop: 6, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.05)", color: "#cbd5e1", fontSize: 11, cursor: "pointer" }}>↺ Kembali otomatis</button>
                <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "4px 0 0" }}>Geser global & tanda manual ikut dipakai saat render (teks tampil pas dengan suara).</p>
              </>
            )}
          </div>

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
          {/* 🎙️ v20.6 MODE STUDIO — satu tombol: EQ studio + noise gate + reverb */}
          <button onClick={() => setStudioOn(!studioOn)} style={{ padding: "10px", borderRadius: 10, border: "1px solid rgba(139,92,246,.5)", background: studioOn ? "rgba(139,92,246,.2)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
            {studioOn ? "🎙️ MODE STUDIO AKTIF — bersih & hangat (buang desis/keresek, suara seperti studio)" : "🔘 Mode Studio mati (suara mentahan)"}
          </button>
          {studioOn && <p style={{ fontSize: 10, color: "#8b8b98", margin: 0 }}>Otomatis: buang dengung rendah, tegas di 3kHz, padamkan desis saat sunyi, + ruang halus.</p>}
          <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 70 }}>Ruang (reverb)</span>
            <input type="range" min={0} max={0.5} step={0.02} value={reverb} onChange={(e) => setReverb(Number(e.target.value))} style={{ flex: 1 }} />
            <b style={{ minWidth: 30 }}>{Math.round(reverb * 100)}%</b>
          </label>
          <button onClick={() => setFokusVokal(!fokusVokal)} style={{ padding: "8px", borderRadius: 10, border: "1px solid rgba(139,92,246,.4)", background: fokusVokal ? "rgba(139,92,246,.2)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
            {fokusVokal ? "✅ Fokus vokal AKTIF — buang dengung rendah, suara bacaan jernih" : "🔘 Fokus vokal mati (suara mentahan)"}
          </button>
          <p style={{ fontSize: 10, color: "#8b8b98" }}>Rekomendasi: Mode Studio ON + Reverb 20-40% → hasil rekaman HP kedengaran jernih & hangat. Tips rekam: di tempat sepi, HP ±20cm dari mulut.</p>
          <button onClick={() => setStep(2)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#d946ef)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginTop: 2 }}>
            Lanjut: Tampilan ›
          </button>
        </div>
      )}

      {/* ===== 3️⃣ TAMPILAN ===== */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="v6-lbl" style={{ fontSize: 12, fontWeight: 800 }}>🕌 BINGKAI FRAME ISLAMI</div>
          {/* 🔍 v20.13: UKURAN FRAME PNG — perbesar biar tipis & ayat lega; perkecil biar tebal */}
          {(!!framePng || !!framePngBawaan(frame)) && (
            <div style={{ border: "1px solid rgba(139,92,246,.35)", borderRadius: 10, padding: 8 }}>
              <label style={{ fontSize: 11.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 78 }}>🔍 Ukuran frame</span>
                <input type="range" min={0.7} max={1.35} step={0.01} value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))} style={{ flex: 1 }} />
                <b style={{ minWidth: 42 }}>{Math.round(pngScale * 100)}%</b>
              </label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button onClick={() => setPngScale(0.85)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>Tebal</button>
                <button onClick={() => setPngScale(1)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>Normal</button>
                <button onClick={() => setPngScale(1.2)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>Tipis</button>
              </div>
              <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "4px 0 0" }}>Perbesar (mis. 120%) → bingkai lebih tipis & ruang ayat lebih lega; perkecil → bingkai lebih tebal.</p>
            </div>
          )}
          {/* 🖼️ v20.11: UPLOAD FRAME PNG SENDIRI — langsung dipakai sebagai bingkai */}
          <label style={{ padding: "9px", borderRadius: 10, border: "1px dashed rgba(212,175,55,.5)", background: framePng ? "rgba(212,175,55,.12)" : "rgba(255,255,255,.04)", textAlign: "center", fontSize: 12, color: framePng ? "#e8d9a0" : "#cbd5e1", cursor: "pointer", fontWeight: 700 }}>
            {framePng ? "🖼️ Frame PNG terpasang (tap untuk ganti)" : "🖼️ Upload frame PNG sendiri (bingkai custom)"}
            <input type="file" accept="image/png,image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader();
              r.onload = () => { setFramePng(r.result as string); setMsg("✅ Frame PNG terpasang — dipakai sebagai bingkai (menggantikan gaya bawaan)."); };
              r.readAsDataURL(f);
              e.currentTarget.value = "";
            }} />
          </label>
          {framePng && <button onClick={() => { setFramePng(""); setMsg("Frame PNG dihapus — kembali ke gaya bawaan."); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)", color: "#fca5a5", fontSize: 11, cursor: "pointer" }}>✕ Hapus frame PNG</button>}
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
          {/* 🔁 v20.7: LOOP VIDEO — auto (pas durasi audio) / 1× / 2× / 3× */}
          {videoBg && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", marginBottom: 4 }}>🔁 LOOP VIDEO</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {([["auto", "🔄 Auto (pas audio)"], ["1", "1×"], ["2", "2×"], ["3", "3×"]] as const).map(([v, lb]) => (
                  <button key={v} onClick={() => setVideoLoopMode(v)} style={{ padding: "6px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: videoLoopMode === v ? "rgba(139,92,246,.4)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11, cursor: "pointer" }}>{lb}</button>
                ))}
              </div>
              <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "4px 0 0" }}>
                {videoDurQ > 0 && audioDur > 0
                  ? `📐 Video ${videoDurQ.toFixed(1)} dtk × ${hitungKaliLoop(videoDurQ, audioDur, videoLoopMode)}× = ${durasiLoopTotal(videoDurQ, audioDur, videoLoopMode).toFixed(0)} dtk total — tanpa potong kualitas, mulus`
                  : "Auto = hitung otomatis berapa kali diulang sampai pas durasi audio. Tanpa potong kualitas."}
              </p>
            </div>
          )}
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
                {/* ✒️ v20.14: daftar teks (bisa BANYAK) */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {teksList.map((t, i) => (
                    <button key={t.id} onClick={() => setTeksAktif(i)}
                      style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(139,92,246,.5)", background: teksAktif === i ? "rgba(139,92,246,.35)" : "rgba(255,255,255,.06)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>
                      {t.txt.slice(0, 12) || "kosong"}
                    </button>
                  ))}
                  <button onClick={() => { setTeksList((a) => [...a, teksBaru()]); setTeksAktif(teksList.length); }}
                    style={{ padding: "5px 8px", borderRadius: 8, border: "1px dashed rgba(34,197,94,.5)", background: "rgba(34,197,94,.08)", color: "#86efac", fontSize: 10.5, cursor: "pointer", fontWeight: 700 }}>＋ Tambah teks</button>
                </div>
                {teksList[teksAktif] && (
                  <>
                    <input className="v6-inp" style={{ background: "#12121e", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}
                      placeholder="Tulis teks (mis. QS. Al-Fatihah / بِسْمِ اللَّهِ)" value={teksList[teksAktif].txt} onChange={(e) => ubahTeks(teksAktif, { txt: e.target.value })} />
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {FONT_ISLAMI.map((f) => (
                        <button key={f.id} onClick={() => ubahTeks(teksAktif, { font: f.id })}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: teksList[teksAktif].font === f.id ? "rgba(139,92,246,.4)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{f.label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {EFEK_TEKS.map((e) => (
                        <button key={e.id} onClick={() => ubahTeks(teksAktif, { efek: e.id })}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: teksList[teksAktif].efek === e.id ? "rgba(212,175,55,.3)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{e.label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {([["diam", "🚫 Diam"], ["naik", "↕️ Naik-turun"], ["berdenyut", "💓 Berdenyut"], ["fade", "🌫️ Fade"]] as const).map(([v, lb]) => (
                        <button key={v} onClick={() => ubahTeks(teksAktif, { anim: v })}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: teksList[teksAktif].anim === v ? "rgba(139,92,246,.4)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{lb}</button>
                      ))}
                    </div>
                    <label style={{ fontSize: 11, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ minWidth: 60 }}>Ukuran</span>
                      <input type="range" min={0.02} max={0.12} step={0.005} value={teksList[teksAktif].size} onChange={(e) => ubahTeks(teksAktif, { size: Number(e.target.value) })} style={{ flex: 1 }} />
                    </label>
                    <button onClick={() => hapusTeks(teksAktif)} style={{ padding: "6px", borderRadius: 8, border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)", color: "#fca5a5", fontSize: 11, cursor: "pointer" }}>🗑 Hapus teks ini</button>
                    <p style={{ fontSize: 9.5, color: "#8b8b98", margin: 0 }}>Geser/cubit langsung di pratinjau untuk posisi & ukuran (teks yang sedang aktif = yang digeser).</p>
                  </>
                )}
              </div>
            )}
          </div>
          {/* ☪️ v20.14: OVERLAY ALLAH & MUHAMMAD */}
          <div style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 6 }}>☪️ Overlay Allah & Muhammad</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(Object.keys(OVERLAY_LABEL) as GayaOverlay[]).map((g) => (
                <button key={g} onClick={() => setOverlayGaya(g)}
                  style={{ padding: "6px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: overlayGaya === g ? "rgba(212,175,55,.3)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 10.5, cursor: "pointer" }}>{OVERLAY_LABEL[g]}</button>
              ))}
            </div>
            <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "4px 0 0" }}>Tulisan Arab الله & محمد dengan cahaya emas berdenyut halus mengikuti waktu — di sisi kiri/kanan (atau atas/bawah) video.</p>
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
            {/* ⚡ v20.9: PILIHAN TURBO — normal (seimbang) / ekstra 60% (paling cepat) */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", marginBottom: 4 }}>⚡ KECEPATAN RENDER</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setTurboMode("normal")} style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: turboMode === "normal" ? "rgba(139,92,246,.35)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>🔄 Normal<br /><span style={{ fontSize: 9.5, fontWeight: 400, color: "#8b8b98" }}>seimbang · ~40% lebih cepat</span></button>
                <button onClick={() => setTurboMode("ekstra")} style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: "1px solid rgba(212,175,55,.4)", background: turboMode === "ekstra" ? "rgba(212,175,55,.2)" : "rgba(255,255,255,.05)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>⚡ Ekstra 60%<br /><span style={{ fontSize: 9.5, fontWeight: 400, color: "#8b8b98" }}>paling cepat · ±2.7× lipat</span></button>
              </div>
            </div>
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
