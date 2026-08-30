"use client";
/**
 * ✂️ Potong long menjadi Shorts secara terpisah.
 * Long tidak disentuh/dihapus; setiap item dirender sendiri dari timeline yang
 * sama sehingga user bisa memilih menit berbeda dan membuat beberapa short.
 */
import { useEffect, useRef, useState } from "react";

export type ShortRenderProgress = (progress: number, message?: string) => void;

export type LongShortCutterProps = {
  maxDuration: number;
  title?: string;
  onRenderShort: (start: number, duration: number, onProgress: ShortRenderProgress) => Promise<Blob>;
};

type CutStatus = "idle" | "rendering" | "done" | "error";
type Cut = {
  id: string;
  start: number;
  duration: number;
  status: CutStatus;
  progress: number;
  message: string;
  blob: Blob | null;
  url: string;
};

const MAX_CUTS = 8;
const DURATION_PRESETS = [15, 30, 60];

function makeCut(index: number, start = 0): Cut {
  return { id: `short_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`, start, duration: 30, status: "idle", progress: 0, message: "Belum dirender", blob: null, url: "" };
}

function fmt(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function LongShortCutter({ maxDuration, title = "Spectrum", onRenderShort }: LongShortCutterProps) {
  const [cuts, setCuts] = useState<Cut[]>(() => [makeCut(0)]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const urlsRef = useRef<string[]>([]);

  const safeMax = Math.max(0, Number(maxDuration) || 0);
  const ready = cuts.filter((cut) => cut.status === "done" && cut.blob && cut.url);

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
  }, []);

  function updateCut(index: number, patch: Partial<Cut>) {
    setCuts((current) => current.map((cut, i) => i === index ? { ...cut, ...patch } : cut));
  }

  function clearCutResult(cut: Cut) {
    if (cut.url) {
      URL.revokeObjectURL(cut.url);
      urlsRef.current = urlsRef.current.filter((url) => url !== cut.url);
    }
  }

  function setStart(index: number, value: number) {
    const cut = cuts[index];
    if (!cut || running) return;
    const start = Math.max(0, Math.min(Math.max(0, safeMax - 1), Number(value) || 0));
    clearCutResult(cut);
    updateCut(index, { start, status: "idle", progress: 0, message: `Bagian ${fmt(start)}–${fmt(Math.min(safeMax, start + cut.duration))}`, blob: null, url: "" });
  }

  function setDuration(index: number, value: number) {
    const cut = cuts[index];
    if (!cut || running) return;
    const duration = Math.max(5, Math.min(60, Math.round(Number(value) || 30), Math.max(5, safeMax)));
    const start = Math.min(cut.start, Math.max(0, safeMax - duration));
    clearCutResult(cut);
    updateCut(index, { start, duration, status: "idle", progress: 0, message: `Bagian ${fmt(start)}–${fmt(Math.min(safeMax, start + duration))}`, blob: null, url: "" });
  }

  function addCut() {
    if (running || cuts.length >= MAX_CUTS || safeMax < 5) return;
    const last = cuts[cuts.length - 1];
    const nextStart = Math.min(Math.max(0, safeMax - 30), (last?.start || 0) + (last?.duration || 30));
    setCuts((current) => [...current, makeCut(current.length, nextStart)]);
    setError("");
  }

  function removeCut(index: number) {
    if (running || cuts.length <= 1) return;
    const cut = cuts[index];
    if (cut) clearCutResult(cut);
    setCuts((current) => current.filter((_, i) => i !== index));
  }

  async function renderOne(index: number, snapshot?: Cut, signal?: { cancelled: boolean }): Promise<boolean> {
    const cut = snapshot || cuts[index];
    if (!cut || safeMax < 5) return false;
    const start = Math.max(0, Math.min(cut.start, Math.max(0, safeMax - 1)));
    const duration = Math.max(5, Math.min(60, cut.duration, safeMax - start));
    if (duration < 5) {
      updateCut(index, { status: "error", message: "Durasi short terlalu pendek." });
      return false;
    }
    clearCutResult(cut);
    updateCut(index, { status: "rendering", progress: 0, message: "Menyiapkan render short…", blob: null, url: "" });
    try {
      const blob = await onRenderShort(start, duration, (progress, status) => {
        if (!signal?.cancelled) updateCut(index, { status: "rendering", progress: Math.max(0, Math.min(1, progress)), message: status || `Render ${Math.round(progress * 100)}%` });
      });
      if (signal?.cancelled) return false;
      const url = URL.createObjectURL(blob);
      urlsRef.current.push(url);
      updateCut(index, { status: "done", progress: 1, message: `✅ Selesai · ${fmt(start)}–${fmt(start + duration)}`, blob, url });
      return true;
    } catch (e: any) {
      if (signal?.cancelled) return false;
      updateCut(index, { status: "error", progress: 0, message: String(e?.message || "Render short gagal").slice(0, 220) });
      setError(`Short ${index + 1} gagal: ${String(e?.message || "Render short gagal").slice(0, 220)}`);
      return false;
    }
  }

  async function renderSingle(index: number) {
    if (running) return;
    setRunning(true); setError(""); setMessage(`Merender short ${index + 1}…`);
    try { await renderOne(index); } finally { setRunning(false); }
  }

  async function renderAll() {
    if (running) return;
    setRunning(true); setError("");
    const controller = { cancelled: false };
    try {
      const snapshot = cuts.map((cut) => ({ ...cut }));
      for (let index = 0; index < snapshot.length; index++) {
        // Hanya render item yang belum selesai; ubah menit/durasi untuk memaksa
        // item tertentu dibuat ulang tanpa membakar waktu untuk item lain.
        if (snapshot[index].status === "done" && snapshot[index].blob) continue;
        setMessage(`Merender short ${index + 1} dari ${snapshot.length}…`);
        const ok = await renderOne(index, snapshot[index], controller);
        if (!ok) break;
      }
      if (!error) setMessage("✅ Semua short yang dipilih sudah diproses.");
    } finally {
      setRunning(false);
    }
  }

  function download(index: number) {
    const cut = cuts[index];
    if (!cut?.blob || !cut.url) return;
    const ext = cut.blob.type.includes("mp4") ? "mp4" : "webm";
    const safe = title.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 45) || "spectrum";
    const link = document.createElement("a");
    link.href = cut.url;
    link.download = `${safe}_short_${fmt(cut.start).replace(":", "m")}s.${ext}`;
    document.body.appendChild(link); link.click(); link.remove();
  }

  return (
    <section className="v6-short-cutter" aria-label="Potong video long menjadi short">
      <div className="v6-short-head"><div><b>✂️ Potong Long menjadi Shorts</b><small>Long tetap aman. Pilih menit berbeda lalu render short satu per satu.</small></div><span>{ready.length}/{cuts.length} siap</span></div>
      <p className="v6-note">Short diambil langsung dari file Long dalam format 9:16 dengan mode <b>Fit Utuh — tanpa crop</b>. Jika Long berukuran 16:9, area kosong diisi blur dari frame yang sama. Tidak memakai kredit AI dan tidak menghapus video Long.</p>
      {safeMax < 5 ? <p className="v6-risk">Musik/video Long belum cukup panjang untuk dibuat short.</p> : <>
        {cuts.map((cut, index) => {
          const maxStart = Math.max(0, safeMax - cut.duration);
          return <div className={`v6-short-cut ${cut.status === "done" ? "ok" : cut.status === "error" ? "bad" : ""}`} key={cut.id}>
            <div className="v6-short-cut-title"><b>Short {index + 1}</b><span>{cut.status === "rendering" ? `⏳ ${Math.round(cut.progress * 100)}%` : cut.status === "done" ? "✅ siap" : cut.status === "error" ? "⚠️ gagal" : "siap"}</span></div>
            <div className="v6-short-fields">
              <label><span>Mulai (detik)</span><input type="number" min={0} max={Math.floor(maxStart)} step={1} value={Math.min(cut.start, maxStart)} onChange={(e) => setStart(index, Number(e.target.value))} disabled={running} /></label>
              <label><span>Durasi</span><select value={cut.duration} onChange={(e) => setDuration(index, Number(e.target.value))} disabled={running}>{DURATION_PRESETS.map((value) => <option key={value} value={value}>{value} detik</option>)}</select></label>
            </div>
            <div className="v6-short-range"><input type="range" min={0} max={Math.floor(maxStart)} step={1} value={Math.min(cut.start, maxStart)} onChange={(e) => setStart(index, Number(e.target.value))} disabled={running} /><span>{fmt(Math.min(cut.start, maxStart))} → {fmt(Math.min(safeMax, Math.min(cut.start, maxStart) + cut.duration))} · Long {fmt(safeMax)}</span></div>
            <div className="v6-short-actions"><button className="v6-chip" onClick={() => void renderSingle(index)} disabled={running}>{cut.status === "done" ? "🔁 Render ulang" : "🚀 Render Short"}</button>{cuts.length > 1 && <button className="v6-chip" onClick={() => removeCut(index)} disabled={running}>🗑 Hapus</button>}{cut.status === "done" && <button className="v6-chip" onClick={() => download(index)} disabled={running}>⬇ Download</button>}</div>
            <small className="v6-short-msg">{cut.message}</small>
            {cut.url && <video className="v6-short-preview" src={cut.url} controls playsInline preload="metadata" />}
          </div>;
        })}
        <div className="v6-short-bottom"><button className="v6-chip" onClick={addCut} disabled={running || cuts.length >= MAX_CUTS}>＋ Tambah potongan ({cuts.length}/{MAX_CUTS})</button><button className="v6-chip" onClick={() => void renderAll()} disabled={running}>{running ? "⏳ Memproses…" : "🚀 Render semua yang belum jadi"}</button></div>
      </>}
      {!!message && <p className="v6-note" style={{ color: "#a7f3d0", margin: "7px 0 0" }}>{message}</p>}
      {!!error && <p className="v6-note" style={{ color: "#fca5a5", margin: "7px 0 0" }}>⚠️ {error}</p>}
    </section>
  );
}
