"use client";
/* =====================================================================
   🎛️ AUDIO ROOM (v19.37) — Zona Reaksi Audio LOKAL di HP
   Upload foto ruangan → tandai bulatan speaker (lingkaran/oval/polygon,
   atau auto-detect) → tempel efek reaksi → cuma zona itu yang hidup.
   Preview == render (satu fungsi gambar). Mobile-first: tap, drag, pinch.
   ===================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioZone, EfekZona, ResponZona } from "@/lib/audio-room/types";
import { newZone, simpanProyek, muatProyek } from "@/lib/audio-room/types";
import { hitungDriver, titikDalamZona, jarakKePusat } from "@/lib/audio-room/zonedriver";
import { deteksiLingkaran } from "@/lib/audio-room/detect";
import { gambarZonaReaktif, buatPath } from "@/lib/audio-room/render-zone";
import { hitungPuncak, cariKlimaksBuffer } from "@/lib/climax";
import { deteksiBeats, bpmDariBeats } from "@/lib/beats";
import { renderOfflineVideo } from "@/lib/render-offline";

const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmtD = (s: number) => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, "0")}`; };
const EFK: { id: EfekZona; emoji: string; lb: string }[] = [
  { id: "pulse", emoji: "💥", lb: "Pulse" }, { id: "deform", emoji: "🌀", lb: "Deform" },
  { id: "getar", emoji: "📳", lb: "Getar" }, { id: "basspush", emoji: "📉", lb: "Bass Push" },
  { id: "glow", emoji: "✨", lb: "Glow" }, { id: "shadow", emoji: "🌗", lb: "Shadow" },
];
const RESPON: { id: ResponZona; lb: string }[] = [
  { id: "bass", lb: "🎸 Bass" }, { id: "beat", lb: "🥁 Beat" }, { id: "treble", lb: "🎻 Treble" }, { id: "rms", lb: "🌊 RMS" },
];

export default function AudioRoomPanel({ onExit }: { onExit: () => void }) {
  const [bgImg, setBgImg] = useState("");
  const [imgNat, setImgNat] = useState({ w: 1920, h: 1080 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [zones, setZones] = useState<AudioZone[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<"pilih" | "zona">("pilih");
  const [shapeNext, setShapeNext] = useState<"circle" | "oval" | "polygon">("circle");
  const [polyPts, setPolyPts] = useState<{ x: number; y: number }[]>([]);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  // audio
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [peaks, setPeaks] = useState<number[]>([]);
  const [beats, setBeats] = useState<number[]>([]);
  const [bpm, setBpm] = useState(0);
  const peaksRef = useRef<number[]>([]);
  const beatsRef = useRef<number[]>([]);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const playheadRef = useRef(0); playheadRef.current = playhead;
  const actxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startAtRef = useRef(0);
  const bufRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dur, setDur] = useState(0);
  // render
  const [shortStart, setShortStart] = useState(0);
  const [shortDur, setShortDur] = useState(30);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [err, setErr] = useState("");
  // pointer
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ d0: number; s0: number; cx: number; cy: number } | null>(null);
  const dragZoneRef = useRef<{ id: string; dx: number; dy: number; mode: "move" | "resize" } | null>(null);
  const [efekArmed, setEfekArmed] = useState<EfekZona | null>(null);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const proj = useMemo(() => {
    const maxW = 1080;
    const w = maxW;
    const h = Math.max(360, Math.round((maxW * imgNat.h) / imgNat.w));
    return { w, h };
  }, [imgNat]);

  /* ---------- muat proyek tersimpan ---------- */
  useEffect(() => {
    const p = muatProyek();
    if (p?.bgImage) { setBgImg(p.bgImage); setZones(p.zones || []); }
  }, []);

  /* ---------- gambar ke canvas (preview) ---------- */
  const drawScene = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const W = proj.w, H = proj.h;
    ctx.fillStyle = "#0b0b12"; ctx.fillRect(0, 0, W, H);
    if (!imgRef.current) return; // 🐛 FIX: jangan render kalau gambar belum dimuat
    // gambar cover (aspect sama → full)
    ctx.drawImage(imgRef.current, 0, 0, W, H);
    // zona reaktif — guard array kosong
    const pk = peaksRef.current;
    if (pk.length && zones.length) {
      const list = zones.map((z) => {
        const i = Math.min(pk.length - 1, Math.max(0, Math.floor(t / 0.25)));
        let beat = 0;
        for (const b of beatsRef.current) { const d = Math.abs(b - t); if (d < 0.06) { beat = 1; break; } if (d < 0.13) { beat = 0.5; break; } if (b > t + 0.13) break; }
        const f = {
          bass: pk[i] ?? 0, beat, treble: 0.4, rms: 0.5,
          flux: Math.min(1, Math.abs((pk[i] ?? 0) - (pk[Math.max(0, i - 1)] ?? 0)) * 2),
        };
        const d = hitungDriver(z, f, t, stRef.current[z.id] || (stRef.current[z.id] = { prev: {} }), 1 / 60);
        return { z, d };
      });
      gambarZonaReaktif(ctx, imgRef.current, imgNat.w, imgNat.h, W, H, list, { glowWarna: "#22d3ee" });
    }
    // outline zona (mode edit — sembunyikan saat preview biar bersih)
    const showOutline = !playing;
    for (const z of zones) {
      const aktif = z.id === selId;
      if (showOutline) {
        ctx.save();
        buatPath(ctx, z, W, H);
        ctx.strokeStyle = aktif ? "rgba(34,211,238,0.95)" : "rgba(255,255,255,0.45)";
        ctx.lineWidth = aktif ? 3 : 1.5;
        ctx.setLineDash(aktif ? [] : [6, 5]);
        ctx.stroke();
        ctx.restore();
      }
      if (aktif && showOutline) {
        // handle resize
        for (const [hx, hy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath();
          ctx.arc(z.x * W + hx * z.rx * W, z.y * H + hy * z.ry * H, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff"; ctx.font = "700 13px Poppins,sans-serif"; ctx.textAlign = "center";
        ctx.fillText(z.name || "Zona", z.x * W, Math.max(18, z.y * H - z.ry * H - 8));
      }
    }
    // polygon pending
    if (polyPts.length) {
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(polyPts[0].x * W, polyPts[0].y * H);
      for (let i = 1; i < polyPts.length; i++) ctx.lineTo(polyPts[i].x * W, polyPts[i].y * H);
      ctx.stroke();
      for (const p of polyPts) { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 6, 0, Math.PI * 2); ctx.fill(); }
    }
  }, [zones, selId, polyPts, proj, imgNat]);

  const stRef = useRef<Record<string, { prev: Record<string, number> }>>({});

  /* ---------- loop preview ---------- */
  useEffect(() => {
    let stop = false;
    const loop = () => {
      if (stop) return;
      const cv = cvRef.current; if (cv) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cv.width, cv.height);
          const v = viewRef.current;
          ctx.save();
          ctx.translate(v.tx, v.ty);
          ctx.scale(v.scale, v.scale);
          ctx.beginPath(); ctx.rect(0, 0, proj.w, proj.h); ctx.clip();
          drawScene(ctx, playing ? playheadRef.current : playheadRef.current);
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { stop = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [drawScene, proj, playing]);

  /* ---------- audio ---------- */
  function muatAudio(url: string, nama: string) {
    setErr("");
    fetch(url).then((r) => r.arrayBuffer()).then(async (ab) => {
      if (!actxRef.current) actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await actxRef.current.decodeAudioData(ab.slice(0));
      bufRef.current = buf;
      setDur(buf.duration);
      const pk = hitungPuncak(buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, buf.sampleRate, 0.25);
      peaksRef.current = pk; setPeaks(pk);
      const bt = deteksiBeats(pk, 0.25);
      beatsRef.current = bt; setBeats(bt);
      setBpm(bpmDariBeats(bt));
      const k = cariKlimaksBuffer(buf, 30);
      setShortStart(Math.round(k.start * 10) / 10);
      setAudioUrl(url); setAudioName(nama);
    }).catch((e) => setErr("Audio tidak bisa dibaca: " + (e?.message || "")));
  }
  function play() {
    if (!bufRef.current) return;
    if (playing) { stopPlay(); return; }
    const actx = actxRef.current!;
    actx.resume().catch(() => {});
    const s = actx.createBufferSource();
    s.buffer = bufRef.current;
    s.connect(actx.destination);
    s.onended = () => setPlaying(false);
    s.start(0, playheadRef.current);
    srcRef.current = s;
    startAtRef.current = actx.currentTime - playheadRef.current;
    setPlaying(true);
  }
  function stopPlay() {
    try { srcRef.current?.stop(); } catch {}
    srcRef.current = null;
    setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const t = actxRef.current!.currentTime - startAtRef.current;
      playheadRef.current = t;
      setPlayhead(t);
      if (t >= dur) { playheadRef.current = 0; setPlayhead(0); stopPlay(); }
    }, 100);
    return () => clearInterval(iv);
  }, [playing, dur]);

  /* ---------- pointer: pilih/geser/zoom/pinch ---------- */
  function toCanvas(e: React.PointerEvent): { x: number; y: number } {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.tx) / v.scale / proj.w, y: (e.clientY - r.top - v.ty) / v.scale / proj.h };
  }
  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinchRef.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: viewRef.current.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const p = toCanvas(e);
    // efek drag/arm → tap zona = tempel efek
    if (efekArmed) {
      const z = [...zones].reverse().find((zz) => titikDalamZona(zz, p.x, p.y));
      if (z) { toggleEfek(z.id, efekArmed); setEfekArmed(null); }
      else setEfekArmed(null);
      return;
    }
    if (mode === "zona") {
      if (shapeNext === "polygon") {
        const nx = clampN(p.x, 0.02, 0.98), ny = clampN(p.y, 0.02, 0.98);
        setPolyPts((q) => [...q, { x: nx, y: ny }]);
      } else {
        const z = newZone(shapeNext, clampN(p.x, 0.02, 0.98), clampN(p.y, 0.02, 0.98));
        if (shapeNext === "oval") { z.rx = 0.12; z.ry = 0.07; }
        setZones((zs) => [...zs, z]);
        setSelId(z.id);
        setMode("pilih");
      }
      return;
    }
    // pilih & drag zona
    const z = [...zones].reverse().find((zz) => titikDalamZona(zz, p.x, p.y));
    if (z) {
      setSelId(z.id);
      // handle resize?
      const hz = Math.max(z.rx, z.ry) * 0.28;
      const j = jarakKePusat(z, p.x, p.y);
      if (j > 0.75 && j < 1.25) { dragZoneRef.current = { id: z.id, dx: 0, dy: 0, mode: "resize" }; return; }
      dragZoneRef.current = { id: z.id, dx: z.x - p.x, dy: z.y - p.y, mode: "move" };
    } else {
      setSelId(null);
      dragZoneRef.current = null;
    }
  }
  function onMove(e: React.PointerEvent) {
    const prev = ptrs.current.get(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && pinchRef.current) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = (e.target as HTMLElement).getBoundingClientRect();
      const s = clampN(pinchRef.current.s0 * (d / pinchRef.current.d0), 0.6, 6);
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      // zoom ke titik tengah jari
      const ns = s / viewRef.current.scale;
      setView((v) => ({ scale: s, tx: cx - (cx - v.tx) * ns, ty: cy - (cy - v.ty) * ns }));
      return;
    }
    if (ptrs.current.size === 1 && prev) {
      const p = toCanvas(e);
      if (dragZoneRef.current) {
        const z = zones.find((zz) => zz.id === dragZoneRef.current!.id);
        if (!z) return;
        if (dragZoneRef.current.mode === "move") {
          setZones((zs) => zs.map((zz) => zz.id === z.id ? { ...zz, x: clampN(p.x + dragZoneRef.current!.dx, 0.01, 0.99), y: clampN(p.y + dragZoneRef.current!.dy, 0.01, 0.99) } : zz));
        } else {
          const sc = Math.max(0.02, Math.hypot(p.x - z.x, (p.y - z.y) * (proj.w / proj.h)));
          setZones((zs) => zs.map((zz) => zz.id === z.id ? { ...zz, rx: clampN(sc, 0.015, 0.5), ry: clampN(sc * (proj.w / proj.h), 0.015, 0.5) } : zz));
        }
      } else if (viewRef.current.scale > 1.01) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      }
    }
  }
  function onUp(e: React.PointerEvent) {
    ptrs.current.delete(e.pointerId);
    pinchRef.current = null;
    dragZoneRef.current = null;
  }

  /* ---------- aksi zona ---------- */
  function updateZona(id: string, patch: Partial<AudioZone>) { setZones((zs) => zs.map((z) => z.id === id ? { ...z, ...patch } : z)); }
  function toggleEfek(id: string, ef: EfekZona) {
    setZones((zs) => zs.map((z) => z.id === id ? { ...z, efek: z.efek.includes(ef) ? z.efek.filter((x) => x !== ef) : [...z.efek, ef] } : z));
  }
  function hapusZona(id: string) { setZones((zs) => zs.filter((z) => z.id !== id)); if (selId === id) setSelId(null); }
  function duplikatZona(id: string) {
    setZones((zs) => {
      const z = zs.find((zz) => zz.id === id); if (!z) return zs;
      const n = { ...z, id: "z" + Date.now().toString(36), name: z.name + " (duplikat)", x: clampN(z.x + 0.12, 0.02, 0.98) };
      return [...zs, n];
    });
  }
  async function autoDetect() {
    if (!imgRef.current) return;
    const c = document.createElement("canvas");
    const mx = 240, sc = Math.min(1, mx / Math.max(imgNat.w, imgNat.h));
    c.width = Math.round(imgNat.w * sc); c.height = Math.round(imgNat.h * sc);
    const x = c.getContext("2d")!;
    x.drawImage(imgRef.current, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height);
    const res = deteksiLingkaran(d.data, c.width, c.height, { minR: 0.03, maxR: 0.25, minSkor: 0.05, maks: 6 });
    if (!res.length) { setErr("Tidak ada bulatan gelap terdeteksi — tandai manual aja (tombol ➕ Zona)."); return; }
    const zs = res.map((r) => {
      const z = newZone("circle", r.x, r.y);
      z.rx = r.rx; z.ry = r.ry;
      return z;
    });
    setZones((prev) => [...prev, ...zs]);
    setSelId(zs[0].id);
    setErr(`✅ ${zs.length} bulatan terdeteksi — bisa diatur & dihapus.`);
  }
  function simpan() {
    if (!bgImg) return;
    simpanProyek({ bgImage: bgImg, bgDim: 0, zones, audioUrl, audioName, shortStart, shortDur, createdAt: Date.now() });
    setErr("💾 Proyek tersimpan di HP ini.");
  }

  /* ---------- render ---------- */
  async function render() {
    if (!bufRef.current || !imgRef.current) { setErr("Upload gambar & audio dulu."); return; }
    stopPlay();
    setRendering(true); setProgress(0); setErr(""); setVideoUrl("");
    try {
      const total = Math.min(dur, shortDur);
      const o = clampN(shortStart, 0, Math.max(0, dur - 1));
      const buf = bufRef.current;
      const pk = peaksRef.current, bt = beatsRef.current;
      const W = proj.w, H = proj.h;
      const blob = await renderOfflineVideo({
        buf, w: W, h: H, offset: o, dur: total, eq: "flat", comp: 50, gain: 100, fades: true,
        peaks: pk, audioCodec: undefined, fps: 30, videoBitrate: 6_000_000,
        draw: (ctx, w2, h2, t, freq) => {
          ctx.fillStyle = "#0b0b12"; ctx.fillRect(0, 0, w2, h2);
          if (!imgRef.current) return; // 🐛 FIX: aman kalau gambar hilang
          ctx.drawImage(imgRef.current, 0, 0, w2, h2);
          if (pk.length) {
            const sts: Record<string, { prev: Record<string, number> }> = {};
            const list = zones.map((z) => {
              const i = Math.min(pk.length - 1, Math.max(0, Math.floor(t / 0.25)));
              let beat = 0;
              for (const b of bt) { const dd = Math.abs(b - t); if (dd < 0.06) { beat = 1; break; } if (dd < 0.13) { beat = 0.5; break; } if (b > t + 0.13) break; }
              const f = { bass: pk[i] ?? 0, beat, treble: 0.4, rms: 0.5, flux: Math.min(1, Math.abs((pk[i] ?? 0) - (pk[Math.max(0, i - 1)] ?? 0)) * 2) };
              const d = hitungDriver(z, f, t, sts[z.id] || (sts[z.id] = { prev: {} }), 1 / 30);
              return { z, d };
            });
            gambarZonaReaktif(ctx, imgRef.current, imgNat.w, imgNat.h, w2, h2, list, { glowWarna: "#22d3ee" });
          }
        },
        onProg: (p) => setProgress(p),
      });
      setVideoUrl(URL.createObjectURL(blob));
    } catch (e: any) { setErr(e?.message || "Render gagal"); }
    setRendering(false);
  }

  const sel = zones.find((z) => z.id === selId) || null;

  /* 🔍 v19.37.1: kontrol navigasi — zoom cepat & geser zona halus (buat HP enak) */
  function zoomBy(f: number) {
    const r = cvRef.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 : 0, cy = r ? r.height / 2 : 0;
    setView((v) => {
      const s = clampN(v.scale * f, 0.6, 8);
      const ns = s / v.scale;
      return { scale: s, tx: cx - (cx - v.tx) * ns, ty: cy - (cy - v.ty) * ns };
    });
  }
  function fitView() { setView({ scale: 1, tx: 0, ty: 0 }); }
  function geserZonaHalus(dx: number, dy: number) {
    if (!sel) return;
    const step = 0.01;
    updateZona(sel.id, { x: clampN(sel.x + dx * step, 0.01, 0.99), y: clampN(sel.y + dy * step, 0.01, 0.99) });
  }

  /* ---------- UI ---------- */
  return (
    <div className="v6e-root" style={{ background: "#07070c" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={() => { stopPlay(); onExit(); }}>✕</button>
        <b style={{ fontSize: 13, flex: 1 }}>🎛️ Audio Room — ruangan berdenyut</b>
        <button className="v6e-export" onClick={simpan}>💾</button>
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* gambar + canvas */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, position: "relative" }}>
          {!bgImg ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 44 }}>🛋️</div>
              <p style={{ fontSize: 13, color: "#cbd5e1", margin: "8px 0 12px" }}>Upload foto <b>ruangan</b> (kamar/studio) — nanti tandai bulatan speaker-nya</p>
              <label className="v6-bigcta" style={{ display: "inline-block" }}>📥 Upload Gambar Ruangan
                <input type="file" accept="image/*" hidden onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const rd = new FileReader();
                  rd.onload = () => {
                    const im = new Image();
                    im.onload = () => { imgRef.current = im; setImgNat({ w: im.naturalWidth, h: im.naturalHeight }); setBgImg(rd.result as string); };
                    im.src = rd.result as string;
                  };
                  rd.readAsDataURL(f);
                }} />
              </label>
            </div>
          ) : (
            <>
              <canvas ref={cvRef} width={proj.w} height={proj.h}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#0b0b12", touchAction: "none", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)" }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              />
              {/* 🧭 v19.37.1: kontrol navigasi — zoom & fit (enak dipakai di HP) */}
              <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <button className="v6-chip" style={{ background: "rgba(0,0,0,.7)", fontSize: 15, width: 36, height: 36, padding: 0, borderRadius: 10 }} onClick={() => zoomBy(1.4)}>＋</button>
                <button className="v6-chip" style={{ background: "rgba(0,0,0,.7)", fontSize: 15, width: 36, height: 36, padding: 0, borderRadius: 10 }} onClick={() => zoomBy(1 / 1.4)}>－</button>
                <button className="v6-chip" style={{ background: "rgba(0,0,0,.7)", fontSize: 12, width: 36, height: 36, padding: 0, borderRadius: 10 }} onClick={fitView}>⛶</button>
                <button className="v6-chip" style={{ background: "rgba(0,0,0,.7)", fontSize: 12, width: 36, padding: "8px 0", borderRadius: 10 }} onClick={autoDetect}>🔍</button>
              </div>
            </>
          )}
        </div>

        {/* toolbar mode + efek */}
        {!!bgImg && (
          <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="v6-chips" style={{ padding: 0 }}>
              <button className={`v6-chip ${mode === "pilih" ? "on" : ""}`} onClick={() => { setMode("pilih"); }}>✋ Pilih/Geser</button>
              <button className={`v6-chip ${mode === "zona" && shapeNext !== "polygon" ? "on" : ""}`} onClick={() => { setMode("zona"); setShapeNext(shapeNext === "circle" ? "oval" : "circle"); setPolyPts([]); }}>
                {mode === "zona" && shapeNext !== "polygon" ? `➕ ${shapeNext === "circle" ? "⭕ Lingkaran" : "⬭ Oval"} (ketuk canvas)` : "➕ Zona"}
              </button>
              <button className={`v6-chip ${mode === "zona" && shapeNext === "polygon" ? "on" : ""}`} onClick={() => { setMode("zona"); setShapeNext("polygon"); setPolyPts([]); }}>
                {mode === "zona" && shapeNext === "polygon" ? `⬠ Polygon (${polyPts.length})` : "⬠ Polygon"}
              </button>
              {mode === "zona" && shapeNext === "polygon" && polyPts.length >= 3 && (
                <button className="v6-chip" style={{ borderColor: "#22c55e", color: "#86efac" }} onClick={() => {
                  if (polyPts.length < 3) return;
                  const z = newZone("polygon", polyPts.reduce((a, p) => a + p.x, 0) / polyPts.length, polyPts.reduce((a, p) => a + p.y, 0) / polyPts.length);
                  z.points = polyPts.map((p) => ({ ...p }));
                  const xs = polyPts.map((p) => p.x), ys = polyPts.map((p) => p.y);
                  z.rx = Math.max(...xs) - Math.min(...xs); z.ry = Math.max(...ys) - Math.min(...ys);
                  setZones((zs) => [...zs, z]); setSelId(z.id); setPolyPts([]); setMode("pilih");
                }}>✓ Selesai polygon</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#8b8b98", flex: "1 1 100%" }}>🎨 Tempel efek: <b>ketuk efek → ketuk zona</b> (atau seret efek ke zona)</span>
              {EFK.map((ef) => (
                <button key={ef.id} className={`v6-chip ${efekArmed === ef.id ? "on" : ""}`}
                  style={{ fontSize: 11, borderColor: efekArmed === ef.id ? "#22d3ee" : undefined }}
                  onClick={() => { setEfekArmed(efekArmed === ef.id ? null : ef.id); }}
                  onPointerDown={(e) => { e.preventDefault(); setEfekArmed(ef.id); }}>
                  {ef.emoji} {ef.lb}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* bottom sheet — setting zona terpilih */}
        {!!sel && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", background: "#0d0d16", padding: "8px 12px", maxHeight: "38vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 12.5, flex: 1 }}>🎯 {sel.name}</b>
              {/* 🧭 v19.37.1: geser halus pakai tombol arah — presisi di HP */}
              <div style={{ display: "flex", gap: 2 }}>
                <button className="v6-chip" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => geserZonaHalus(-1, 0)}>◀</button>
                <button className="v6-chip" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => geserZonaHalus(0, -1)}>▲</button>
                <button className="v6-chip" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => geserZonaHalus(0, 1)}>▼</button>
                <button className="v6-chip" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => geserZonaHalus(1, 0)}>▶</button>
              </div>
              <button className="v6-chip" style={{ fontSize: 10 }} onClick={() => duplikatZona(sel.id)}>⧉</button>
              <button className="v6-chip" style={{ fontSize: 10, color: "#fca5a5" }} onClick={() => hapusZona(sel.id)}>🗑</button>
              <button className="v6-chip" style={{ fontSize: 10 }} onClick={() => setSelId(null)}>✓</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#8b8b98" }}>Respon</span>
              {RESPON.map((r) => (
                <button key={r.id} className={`v6-chip ${sel.respon === r.id ? "on" : ""}`} style={{ fontSize: 10 }} onClick={() => updateZona(sel.id, { respon: r.id })}>{r.lb}</button>
              ))}
            </div>
            {[["kekuatan", "💪 Kekuatan", 0, 2, 0.05], ["kecepatan", "⚡ Kecepatan", 0.5, 2, 0.05], ["smooth", "🪶 Smooth", 0, 1, 0.05], ["deform", "🌀 Deform", 0, 1, 0.05], ["glow", "✨ Glow", 0, 2, 0.05], ["blurEdge", "🌫 Blur tepi", 0, 1, 0.05]].map(([key, lb, mn, mx, st]) => (
              <label key={key as string} style={{ fontSize: 10.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ minWidth: 86 }}>{lb}</span>
                <input type="range" min={mn as number} max={mx as number} step={st as number} value={(sel as any)[key as string] ?? 0}
                  onChange={(e) => updateZona(sel.id, { [key as string]: Number(e.target.value) } as any)} style={{ flex: 1 }} />
                <b style={{ minWidth: 30, fontSize: 10 }}>{((sel as any)[key as string] ?? 0).toFixed(2)}</b>
              </label>
            ))}
            <label style={{ fontSize: 10.5, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={!!sel.snapBeat} onChange={(e) => updateZona(sel.id, { snapBeat: e.target.checked })} />
              🥁 Sinkron ke beat lagu
            </label>
          </div>
        )}

        {/* audio + transport + render */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", padding: "8px 12px calc(8px + env(safe-area-inset-bottom))", background: "rgba(10,10,15,.96)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <label className="v6-cardrow" style={{ flex: 1, minWidth: 160, margin: 0, padding: "6px 8px" }}>
              <span style={{ fontSize: 16 }}>🎵</span>
              <div className="tt" style={{ fontSize: 10.5 }}>{audioName ? `✅ ${audioName} · ${fmtD(dur)}` : "Upload musik (mp3/wav)"}</div>
              <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) muatAudio(URL.createObjectURL(f), f.name.slice(0, 40)); }} />
            </label>
            <button className="v6-chip" style={{ fontSize: 14 }} onClick={play} disabled={!audioUrl}>{playing ? "⏸" : "▶"}</button>
            <span style={{ fontSize: 10, color: "#8b8b98", minWidth: 52 }}>{fmtD(playhead)}{beats.length ? ` · 🥁${bpm || "?"}` : ""}</span>
          </div>
          {!!err && <div className="v6-risk" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setErr("")}>{err} ✕</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button className="v6-bigcta" style={{ flex: 1, fontSize: 12.5 }} disabled={rendering || !audioUrl || !bgImg} onClick={render}>
              {rendering ? `⏳ Render ${Math.round(progress * 100)}%…` : videoUrl ? "🔄 Render ulang" : "🚀 Render video (zona hidup)"}
            </button>
            {!!videoUrl && <button className="v6-chip" style={{ color: "#86efac" }} onClick={() => { const a = document.createElement("a"); a.href = videoUrl; a.download = "audio_room.mp4"; a.click(); }}>⬇️</button>}
          </div>
          {!!videoUrl && <video src={videoUrl} controls style={{ width: "100%", borderRadius: 10, marginTop: 8, maxHeight: 220 }} />}
        </div>
      </div>
    </div>
  );
}
