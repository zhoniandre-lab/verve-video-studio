"use client";
/**
 * 🎚️ EDM MIX PANJANG — add-on opsional untuk SunoPanel.
 *
 * Setiap klip punya style dan audio/video reference sendiri. Klip AI dibuat
 * satu per satu (bukan fire-and-forget) supaya user dapat menghentikan proses
 * dan tidak membakar kredit untuk semua variasi yang belum tentu bagus.
 * Setelah klip dipilih, penggabungan 40–60 menit dilakukan lokal dan tidak
 * memanggil provider lagi.
 */
import { useEffect, useRef, useState } from "react";
import { mediaDuration, prepareReferenceAudio } from "@/lib/studio/reference-audio";
import { pilihKlipDariHasil } from "@/lib/suno-normalize";
import { type SunoKey } from "@/lib/suno-keys";

const REFERENCE_PROVIDERS = new Set(["musicapi", "aimusicapi", "kie", "sunoapi", "cometapi", "ttapi"]);
const MIX_HINTS = [
  "atmospheric intro, gradual build-up",
  "euphoric melodic drop, bright supersaw",
  "deep bass groove, energetic festival drop",
  "dark progressive section, rolling bass",
  "wide synth finale, clean outro",
  "uplifting trance-inspired breakdown",
  "tech house rhythm, punchy drums",
  "cinematic EDM transition, controlled energy",
];
const COUNTS = [2, 3, 4, 5, 6, 8];
const TARGETS = [40, 60];

type VocalMode = "auto" | "male" | "female" | "instrumental";

type MixResult = {
  url: string;
  title: string;
  duration?: number;
  key: string;
  previewUrl?: string;
};

type MixClip = {
  id: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  referenceFile: File | null;
  referenceDuration: number;
  sampleStart: number;
  sampleEnd: number;
  status: "idle" | "reading" | "generating" | "done" | "error" | "cancelled";
  message: string;
  result: MixResult | null;
};

type Props = {
  defaultTitle: string;
  defaultLyrics: string;
  defaultStyle: string;
  genre: string;
  mood: string;
  era: string;
  tempo: string;
  instruments: string[];
  vocal: VocalMode;
  provider: string;
  model: string;
  keys: SunoKey[];
  onSong: (url: string, title: string, duration?: number) => void;
};

type GeneratedResult = MixResult;

type SubmitResult = { result?: GeneratedResult; taskId?: string };

function newClip(index: number, defaults?: Partial<MixClip>): MixClip {
  return {
    id: `mix_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    style: "",
    lyrics: "",
    instrumental: true,
    referenceFile: null,
    referenceDuration: 0,
    sampleStart: 0,
    sampleEnd: 30,
    status: "idle",
    message: "Belum dibuat",
    result: null,
    ...defaults,
  };
}

function errorText(error: unknown): string {
  return String((error as { message?: string })?.message || error || "Generate gagal").slice(0, 260);
}

function isKeyProblem(error: unknown): boolean {
  const text = errorText(error);
  return /401|402|403|api.?key|unauthori[sz]|kredit|quota|balance|insufficient|invalid.*(?:key|token)/i.test(text);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Dibatalkan", "AbortError")); return; }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Dibatalkan", "AbortError"));
    }, { once: true });
  });
}

function timedSignal(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      window.clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
}

function providerHeaders(provider: string, key: string): Record<string, string> {
  return { "Content-Type": "application/json", "X-Suno-Key": key, "X-Suno-Provider": provider };
}

function clipDuration(body: any, clips: any[]): number | undefined {
  const value = Number(clips[0]?.duration ?? (body?.duration && clips.length ? Number(body.duration) / clips.length : body?.duration));
  return isFinite(value) && value > 0 ? value : undefined;
}

function resultFromBody(body: any, key: string, fallbackTitle: string): GeneratedResult | null {
  const clips = pilihKlipDariHasil(body);
  const first = clips[0];
  const url = first?.url || body?.audio_url || body?.audioUrl || body?.url || body?.stream_url;
  if (!url || typeof url !== "string") return null;
  return {
    url,
    title: first?.title || body?.title || fallbackTitle,
    duration: clipDuration(body, clips),
    key,
  };
}

export default function SunoMixPanel({
  defaultTitle,
  defaultLyrics,
  defaultStyle,
  genre,
  mood,
  era,
  tempo,
  instruments,
  vocal,
  provider,
  model,
  keys,
  onSong,
}: Props) {
  const [variationCount, setVariationCount] = useState(3);
  const [targetMinutes, setTargetMinutes] = useState(40);
  const [clips, setClips] = useState<MixClip[]>(() => Array.from({ length: 3 }, (_, i) => newClip(i, {
    lyrics: defaultLyrics,
    instrumental: vocal === "instrumental" || !defaultLyrics.trim(),
  })));
  const [mixRunning, setMixRunning] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [mixMessage, setMixMessage] = useState("");
  const [mixError, setMixError] = useState("");
  const [mixUrl, setMixUrl] = useState("");
  const [mixBytes, setMixBytes] = useState(0);
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const [singleBusyIndex, setSingleBusyIndex] = useState<number | null>(null);
  const mixAbortRef = useRef<AbortController | null>(null);
  const mixUrlRef = useRef("");
  const previewUrlsRef = useRef<string[]>([]);

  const supportsReference = REFERENCE_PROVIDERS.has(provider);
  const completed = clips.slice(0, variationCount).filter((clip) => clip.result);
  const usableKeys = keys.filter((item) => item?.key?.trim());

  function clearMixUrl() {
    if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
    mixUrlRef.current = "";
    setMixUrl("");
    setMixBytes(0);
  }

  useEffect(() => () => {
    mixAbortRef.current?.abort();
    if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  function updateClip(index: number, patch: Partial<MixClip>) {
    setClips((current) => current.map((clip, i) => i === index ? { ...clip, ...patch } : clip));
  }

  function changeCount(value: number) {
    if (mixRunning || mixing) return;
    setVariationCount(value);
    setClips((current) => Array.from({ length: value }, (_, index) => current[index] || newClip(index)));
    setMixError("");
  }

  async function chooseReference(index: number, file: File | null) {
    if (!file || mixRunning || mixing) return;
    setReadingIndex(index);
    updateClip(index, { status: "reading", message: "Membaca durasi referensi…", referenceFile: file, result: null });
    try {
      const duration = await mediaDuration(file);
      const end = Math.min(60, Math.max(0.5, duration || 30));
      updateClip(index, {
        status: "idle",
        message: duration > 0 ? `Referensi siap · ${duration.toFixed(1)} detik` : "Referensi dipilih · durasi akan dicek saat generate",
        referenceDuration: duration,
        sampleStart: 0,
        sampleEnd: Math.min(30, end),
      });
    } catch (error) {
      updateClip(index, { status: "error", message: errorText(error), referenceFile: null, referenceDuration: 0 });
    } finally {
      setReadingIndex(null);
    }
  }

  function removeReference(index: number) {
    if (mixRunning || mixing) return;
    updateClip(index, { referenceFile: null, referenceDuration: 0, sampleStart: 0, sampleEnd: 30, status: "idle", message: "Mode Simple · tanpa audio reference", result: null });
  }

  function buildStyle(clip: MixClip, index: number): string {
    const fallback = ["instrumental EDM", "progressive house", tempo, era, instruments.join(", ")].filter(Boolean).join(", ");
    const base = clip.style.trim() || defaultStyle.trim() || fallback;
    const hint = MIX_HINTS[index % MIX_HINTS.length];
    const vocalHint = clip.instrumental ? "instrumental, no vocals, no spoken words" : "clear vocal performance, no spoken intro";
    return `${base}, ${hint}, consistent tempo, polished studio production, ${vocalHint}`.slice(0, 1000);
  }

  function buildSimplePayload(clip: MixClip, index: number): Record<string, unknown> {
    const title = `${(defaultTitle.trim() || "EDM Mix").slice(0, 64)} · Variasi ${index + 1}`;
    const lyrics = clip.lyrics.trim();
    const style = buildStyle(clip, index);
    const instrumental = clip.instrumental;
    return {
      title,
      prompt: style,
      lyrics: instrumental ? undefined : lyrics,
      genre,
      tags: style,
      custom: !instrumental && lyrics.length > 30,
      instrumental,
      vocalGender: instrumental || vocal === "auto" ? undefined : vocal,
      model,
      style_bits: { era: era || undefined, tempo, instruments: instruments.length ? instruments.join(", ") : undefined },
      _raw_title: title,
      _raw_lyrics: lyrics,
      _raw_style: style,
    };
  }

  async function uploadClipReference(clip: MixClip, index: number, signal: AbortSignal): Promise<{ url: string; duration: number }> {
    if (!clip.referenceFile) throw new Error("Referensi klip belum dipilih.");
    if (!supportsReference) throw new Error("Provider ini belum mendukung Audio Reference. Ganti ke MusicAPI, AIMusicAPI, Kie.ai, SunoAPI, CometAPI, atau TTAPI.");
    const end = Math.min(60, Math.max(0.5, clip.sampleEnd || clip.referenceDuration || 30));
    const start = Math.max(0, Math.min(clip.sampleStart || 0, Math.max(0, end - 0.5)));
    updateClip(index, { status: "generating", message: "Menyiapkan potongan audio/video…" });
    const prepared = await prepareReferenceAudio(clip.referenceFile, start, end, (progress) => {
      if (!mixAbortRef.current?.signal.aborted) updateClip(index, { message: `Menyiapkan referensi… ${Math.round(progress * 100)}%` });
    });
    if (signal.aborted) throw new DOMException("Dibatalkan", "AbortError");
    const form = new FormData();
    form.append("file", prepared, prepared.name);
    updateClip(index, { message: "Mengunggah referensi klip…" });
    const timed = timedSignal(signal, 65_000);
    try {
      const response = await fetch("/api/hcnsec/music/reference-upload", { method: "POST", body: form, signal: timed.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false || !body?.url) throw new Error(String(body?.error || `Upload referensi gagal (HTTP ${response.status})`));
      const duration = Number(body.duration) > 0 ? Number(body.duration) : Math.max(0.5, end - start);
      return { url: String(body.url), duration };
    } finally {
      timed.dispose();
    }
  }

  async function makePayload(clip: MixClip, index: number, signal: AbortSignal): Promise<Record<string, unknown>> {
    const payload = buildSimplePayload(clip, index);
    const lyrics = clip.lyrics.trim();
    if (!clip.instrumental && lyrics.length < 30) throw new Error(`Klip ${index + 1}: isi lirik minimal 30 karakter atau aktifkan Instrumental.`);
    if (!clip.referenceFile) return payload;
    const uploaded = await uploadClipReference(clip, index, signal);
    return {
      ...payload,
      operation: "sample",
      audio_url: uploaded.url,
      sample_start: 0,
      sample_end: uploaded.duration,
      audio_weight: 0.78,
      style_weight: 0.68,
      weirdness_constraint: 0.28,
      lyrics: clip.instrumental ? "" : lyrics,
      instrumental: clip.instrumental,
    };
  }

  async function submitClip(payload: Record<string, unknown>, key: string, signal: AbortSignal, fallbackTitle: string): Promise<SubmitResult> {
    const timed = timedSignal(signal, 65_000);
    try {
      const response = await fetch("/api/hcnsec/music", {
        method: "POST",
        headers: providerHeaders(provider, key),
        body: JSON.stringify(payload),
        signal: timed.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) {
        const error = new Error(String(body?.error || `HTTP ${response.status}`)) as Error & { code?: string };
        error.code = String(body?.status || response.status);
        throw error;
      }
      const immediate = resultFromBody(body, key, fallbackTitle);
      if (immediate) return { result: immediate };
      const taskId = body?.id || body?.taskId || body?.task_id;
      if (!taskId) throw new Error("Provider tidak memberi hasil atau taskId.");
      return { taskId: String(taskId) };
    } finally {
      timed.dispose();
    }
  }

  async function pollClip(taskId: string, key: string, signal: AbortSignal, fallbackTitle: string, index: number): Promise<GeneratedResult> {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (signal.aborted) throw new DOMException("Dibatalkan", "AbortError");
      updateClip(index, { status: "generating", message: `Menunggu hasil provider… cek ${attempt + 1}/40` });
      const timed = timedSignal(signal, 15_000);
      try {
        const response = await fetch(`/api/hcnsec/music?id=${encodeURIComponent(taskId)}`, {
          headers: providerHeaders(provider, key),
          cache: "no-store",
          signal: timed.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(body?.error || `HTTP ${response.status}`));
        const result = resultFromBody(body, key, fallbackTitle);
        if (result) return result;
        if (body?.status === "error" || body?.error) throw new Error(String(body.error || "Provider gagal membuat klip."));
      } finally {
        timed.dispose();
      }
      await sleep(Math.min(5_000 + attempt * 700, 12_000), signal);
    }
    throw new Error("Provider belum selesai setelah batas polling. Klip tidak dianggap selesai.");
  }

  async function generateClip(index: number, snapshot?: MixClip, parentSignal?: AbortSignal): Promise<GeneratedResult | null> {
    if (mixRunning && !parentSignal) return null;
    const clip = snapshot || clips[index];
    if (!clip) return null;
    if (!defaultTitle.trim()) { setMixError("Isi judul lagu dulu bro."); return null; }
    if (!usableKeys.length) { setMixError("Tambahkan API key provider terlebih dahulu."); return null; }
    const signal = parentSignal || (mixAbortRef.current?.signal || new AbortController().signal);
    setMixError("");
    updateClip(index, { status: "generating", message: "Menyiapkan klip…", result: null });
    try {
      const payload = await makePayload(clip, index, signal);
      const fallbackTitle = String(payload.title || `${defaultTitle} · Variasi ${index + 1}`);
      let lastError: unknown = null;
      for (let keyIndex = 0; keyIndex < usableKeys.length; keyIndex++) {
        const key = usableKeys[keyIndex].key;
        try {
          updateClip(index, { message: `Mengirim klip ${index + 1} ke provider… (${keyIndex + 1}/${usableKeys.length})` });
          const submitted = await submitClip(payload, key, signal, fallbackTitle);
          let result = submitted.result || null;
          if (submitted.taskId) {
            try {
              result = await pollClip(submitted.taskId, key, signal, fallbackTitle, index);
            } catch (error) {
              // Task sudah dibuat: jangan kirim ulang dengan kunci lain karena
              // itu berisiko menggandakan pekerjaan/kredit provider.
              const marked = error instanceof Error ? error : new Error(errorText(error));
              (marked as Error & { noKeyRetry?: boolean }).noKeyRetry = true;
              throw marked;
            }
          }
          if (!result) throw new Error("Hasil klip kosong.");
          updateClip(index, { status: "done", message: `Selesai · ${result.duration ? `${Math.round(result.duration)} detik` : "audio siap"}`, result });
          return result;
        } catch (error) {
          lastError = error;
          // Retry hanya aman sebelum taskId dibuat. Setelah task dibuat, retry
          // dapat menggandakan pekerjaan/kredit dan karena itu selalu berhenti.
          const noKeyRetry = Boolean((error as { noKeyRetry?: boolean })?.noKeyRetry);
          if (noKeyRetry || !isKeyProblem(error) || keyIndex >= usableKeys.length - 1) throw error;
          setMixMessage(`Kunci ${keyIndex + 1} ditolak, mencoba kunci berikutnya…`);
        }
      }
      throw lastError || new Error("Generate klip gagal.");
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        updateClip(index, { status: "cancelled", message: "Dibatalkan" });
        return null;
      }
      updateClip(index, { status: "error", message: errorText(error) });
      throw error;
    }
  }

  async function generateSingle(index: number) {
    if (mixRunning || mixing || singleBusyIndex !== null) return;
    clearMixUrl();
    setSingleBusyIndex(index);
    try {
      await generateClip(index);
    } catch {
      // Pesan rinci sudah ditampilkan pada kartu klip dan panel error.
    } finally {
      setSingleBusyIndex(null);
    }
  }

  async function generateAll() {
    if (mixRunning || mixing) return;
    if (!defaultTitle.trim()) { setMixError("Isi judul lagu dulu bro."); return; }
    if (!usableKeys.length) { setMixError("Tambahkan API key provider terlebih dahulu."); return; }
    const selected = clips.slice(0, variationCount);
    if (selected.some((clip) => clip.referenceFile && !supportsReference)) {
      setMixError("Provider ini tidak mendukung Audio Reference. Ganti provider atau hapus reference pada klip tersebut.");
      return;
    }
    const pendingCount = selected.filter((clip) => !clip.result).length;
    if (!pendingCount) {
      setMixMessage("✅ Semua klip pilihan sudah selesai. Langsung buat mix lokal tanpa kredit AI tambahan.");
      return;
    }
    const controller = new AbortController();
    mixAbortRef.current = controller;
    setMixRunning(true);
    setMixError("");
    clearMixUrl();
    setMixMessage(`Mulai ${pendingCount} klip yang belum selesai. Klip yang sudah jadi dilewati agar kredit tidak terbuang.`);
    try {
      for (let index = 0; index < selected.length; index++) {
        if (controller.signal.aborted) break;
        if (selected[index].result) {
          setMixMessage(`Klip ${index + 1} sudah ada — dilewati. Menyiapkan klip berikutnya…`);
          continue;
        }
        setMixMessage(`Membuat klip ${index + 1} dari ${selected.length}…`);
        try {
          await generateClip(index, selected[index], controller.signal);
        } catch (error) {
          if (controller.signal.aborted) break;
          // Berhenti di klip yang gagal. User bisa memperbaiki reference/style
          // lalu menekan tombol ulang untuk menghindari kredit terpakai tanpa kontrol.
          setMixError(`Klip ${index + 1} berhenti: ${errorText(error)}`);
          break;
        }
      }
      if (!controller.signal.aborted) setMixMessage("✅ Antrean selesai. Pilih klip yang bagus lalu buat mix lokal.");
    } finally {
      setMixRunning(false);
      mixAbortRef.current = null;
    }
  }

  function cancelGenerate() {
    mixAbortRef.current?.abort();
    setMixRunning(false);
    setMixMessage("⏹ Antrean dibatalkan. Klip yang sudah selesai tetap tersimpan; tidak ada generate berikutnya.");
  }

  async function loadPreview(index: number) {
    const result = clips[index]?.result;
    if (!result || mixing) return;
    setMixMessage(`Memuat preview klip ${index + 1}…`);
    try {
      const response = await fetch(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(result.url)}`, {
        headers: { "x-suno-key": result.key, "x-suno-provider": provider },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Audio preview HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("File preview kosong.");
      const url = URL.createObjectURL(blob);
      previewUrlsRef.current.push(url);
      updateClip(index, { result: { ...result, previewUrl: url } });
      setMixMessage("Preview siap.");
    } catch (error) {
      setMixError(`Preview klip ${index + 1} gagal: ${errorText(error)}`);
    }
  }

  async function makeLongMix() {
    if (mixing || mixRunning) return;
    const selected = clips.slice(0, variationCount).filter((clip) => clip.result?.url);
    if (!selected.length) { setMixError("Generate minimal satu klip dulu."); return; }
    setMixError("");
    setMixing(true);
    clearMixUrl();
    try {
      const buffers: { buffer: AudioBuffer; title?: string }[] = [];
      const contextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!contextCtor) throw new Error("Browser ini belum mendukung Web Audio untuk membuat mix.");
      const context = new contextCtor();
      try {
        for (let index = 0; index < selected.length; index++) {
          const result = selected[index].result!;
          setMixMessage(`Mengunduh & membaca klip ${index + 1} dari ${selected.length}…`);
          const response = await fetch(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(result.url)}`, {
            headers: { "x-suno-key": result.key, "x-suno-provider": provider },
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`Klip ${index + 1} tidak bisa diambil (HTTP ${response.status}).`);
          const raw = await response.arrayBuffer();
          if (raw.byteLength < 2048) throw new Error(`Klip ${index + 1} terlalu kecil atau bukan audio.`);
          const buffer = await context.decodeAudioData(raw.slice(0));
          buffers.push({ buffer, title: result.title });
        }
      } finally {
        await context.close().catch(() => {});
      }
      const { mixAudioBuffersToMp4 } = await import("@/lib/audio-mix");
      const blob = await mixAudioBuffersToMp4(buffers, targetMinutes * 60, (progress, message) => {
        setMixMessage(message || `Menyusun audio lokal… ${Math.round(progress * 100)}%`);
      });
      const url = URL.createObjectURL(blob);
      if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
      mixUrlRef.current = url;
      setMixUrl(url);
      setMixBytes(blob.size);
      setMixMessage(`✅ Mix ${targetMinutes} menit selesai. Penggabungan lokal tidak memakai kredit AI.`);
    } catch (error) {
      setMixError(`Pembuatan mix gagal: ${errorText(error)}`);
      setMixMessage("");
    } finally {
      setMixing(false);
    }
  }

  function downloadMix() {
    if (!mixUrl) return;
    const link = document.createElement("a");
    link.href = mixUrl;
    link.download = `${(defaultTitle.trim() || "edm-mix").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60)}_${targetMinutes}menit.m4a`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function useMix() {
    if (!mixUrl) return;
    onSong(mixUrl, `${defaultTitle.trim() || "EDM Mix"} · ${targetMinutes} menit`, targetMinutes * 60);
    setMixMessage("✅ Mix dipasang ke Spectrum. Kalau HP terlalu berat membaca file panjang, gunakan tombol Download Mix.");
  }

  return (
    <div className="lh-mix-panel">
      <div className="lh-h2" style={{ marginTop: 0 }}>🎚️ EDM Mix Panjang · Hemat Kredit</div>
      <p className="lh-note">
        Buat beberapa klip sesuai pilihan bro, lalu gabungkan lokal menjadi {targetMinutes} menit. Tidak ada upload reference atau generate otomatis sebelum tombol dijalankan.
      </p>

      <div className="lh-mix-settings">
        <label><span>Jumlah variasi klip</span><select value={variationCount} onChange={(e) => changeCount(Number(e.target.value))} disabled={mixRunning || mixing}>{COUNTS.map((value) => <option key={value} value={value}>{value} klip</option>)}</select></label>
        <label><span>Target mix</span><select value={targetMinutes} onChange={(e) => setTargetMinutes(Number(e.target.value))} disabled={mixRunning || mixing}>{TARGETS.map((value) => <option key={value} value={value}>{value} menit</option>)}</select></label>
      </div>
      <div className="lh-mix-cost">💳 Perkiraan: maksimal {variationCount} generate provider · penggabungan akhir = <b>0 kredit AI</b>. Antrean berjalan satu per satu dan berhenti kalau ada klip gagal.</div>

      <div className="lh-mix-list">
        {clips.slice(0, variationCount).map((clip, index) => (
          <div className={`lh-mix-clip ${clip.status === "done" ? "ok" : clip.status === "error" ? "bad" : ""}`} key={clip.id}>
            <div className="lh-mix-clip-head"><b>🎵 Klip {index + 1}</b><span>{clip.status === "done" ? "✅ selesai" : clip.status === "generating" || clip.status === "reading" ? "⏳ proses" : clip.status === "error" ? "⚠️ perlu dicek" : "siap"}</span></div>
            <textarea className="lh-ta" rows={2} placeholder={`Style khusus klip ${index + 1}, contoh: melodic progressive EDM, 128 BPM, ${MIX_HINTS[index % MIX_HINTS.length]}`} value={clip.style} onChange={(e) => updateClip(index, { style: e.target.value, result: null, status: "idle", message: "Style diubah · siap dibuat ulang" })} disabled={mixRunning || mixing} />
            <div className="lh-mix-row">
              <label className="lh-mix-file"><span>＋ Audio / Video Reference</span><small>{clip.referenceFile ? `${clip.referenceFile.name} · ${clip.referenceDuration > 0 ? `${clip.referenceDuration.toFixed(1)}d` : "durasi dicek nanti"}` : "opsional · MP3/WAV/MP4/WebM"}</small><input type="file" accept="audio/*,video/*" hidden disabled={mixRunning || mixing || readingIndex === index} onChange={(e) => { void chooseReference(index, e.target.files?.[0] || null); e.currentTarget.value = ""; }} /></label>
              {clip.referenceFile && <button type="button" className="lh-mini" onClick={() => removeReference(index)} disabled={mixRunning || mixing}>✕ Hapus</button>}
            </div>
            {clip.referenceFile && (
              <div className="lh-mix-range">
                <label><span>Mulai {clip.sampleStart.toFixed(1)}d</span><input type="range" min={0} max={Math.max(0, Math.floor(Math.max(0, clip.referenceDuration - 0.5)))} step={0.5} value={Math.min(clip.sampleStart, Math.max(0, clip.referenceDuration - 0.5))} onChange={(e) => updateClip(index, { sampleStart: Math.min(Number(e.target.value), Math.max(0, clip.sampleEnd - 0.5)), result: null })} disabled={mixRunning || mixing || !clip.referenceDuration} /></label>
                <label><span>Akhir {clip.sampleEnd.toFixed(1)}d</span><input type="range" min={0.5} max={Math.max(0.5, Math.min(60, Math.floor(clip.referenceDuration || 60)))} step={0.5} value={Math.min(clip.sampleEnd, Math.max(0.5, Math.min(60, clip.referenceDuration || 60)))} onChange={(e) => updateClip(index, { sampleEnd: Math.max(clip.sampleStart + 0.5, Number(e.target.value)), result: null })} disabled={mixRunning || mixing} /></label>
              </div>
            )}
            <label className="lh-mix-check"><input type="checkbox" checked={clip.instrumental} onChange={(e) => updateClip(index, { instrumental: e.target.checked, result: null })} disabled={mixRunning || mixing} /> 🎼 Instrumental tanpa vokal</label>
            {!clip.instrumental && <textarea className="lh-ta" rows={2} placeholder="Lirik klip ini (minimal 30 karakter)" value={clip.lyrics} onChange={(e) => updateClip(index, { lyrics: e.target.value, result: null })} disabled={mixRunning || mixing} />}
            <div className="lh-mix-clip-foot"><small>{clip.message}</small>{clip.result && !mixRunning && <><button type="button" className="lh-mini" onClick={() => void loadPreview(index)} disabled={!!clip.result.previewUrl || mixing || singleBusyIndex !== null}>▶ Preview</button><button type="button" className="lh-mini" onClick={() => void generateSingle(index)} disabled={mixRunning || mixing || singleBusyIndex !== null}>{singleBusyIndex === index ? "⏳…" : "🔁 Ulangi"}</button></>}{!clip.result && (clip.status === "error" || clip.status === "cancelled") && !mixRunning && <button type="button" className="lh-mini" onClick={() => void generateSingle(index)} disabled={mixing || singleBusyIndex !== null}>{singleBusyIndex === index ? "⏳…" : "🔁 Coba klip ini"}</button>}</div>
            {clip.result?.previewUrl && <audio className="lh-mix-audio" controls preload="none" src={clip.result.previewUrl} />}
          </div>
        ))}
      </div>

      {!supportsReference && <p className="lh-note" style={{ color: "#fbbf24" }}>⚠️ {provider} bisa dipakai untuk klip Simple, tetapi Audio/Video Reference per klip belum didukung provider ini.</p>}
      {!!mixError && <p className="lh-note" style={{ color: "#fca5a5" }}>⚠️ {mixError}</p>}
      {!!mixMessage && <p className="lh-note" style={{ color: "#6ee7b7" }}>{mixMessage}</p>}

      <div className="lh-mix-actions">
        {!mixRunning ? <button type="button" className="lh-btn" onClick={() => void generateAll()} disabled={mixing || !usableKeys.length}>🚀 Generate {variationCount} Variasi</button> : <button type="button" className="lh-btn sec" onClick={cancelGenerate}>⏹ Hentikan Antrean</button>}
        <button type="button" className="lh-btn" onClick={() => void makeLongMix()} disabled={mixing || mixRunning || !completed.length}>{mixing ? "⏳ Menyusun Mix…" : `🎛 Gabungkan ${targetMinutes} Menit`}</button>
      </div>

      {!!completed.length && <p className="lh-note">✅ {completed.length} klip siap dipakai · sistem akan mengulang urutan klip yang dipilih sampai target {targetMinutes} menit dengan crossfade lokal.</p>}
      {!!mixUrl && <div className="lh-mix-ready"><b>🎉 Mix {targetMinutes} menit siap</b><small>{mixBytes > 0 ? `${(mixBytes / 1048576).toFixed(1)} MB M4A/AAC · tidak memakai kredit tambahan` : "M4A lokal"}</small><div><button type="button" className="lh-btn sec" onClick={downloadMix}>⬇ Download Mix</button><button type="button" className="lh-btn" onClick={useMix}>🎬 Pakai di Spectrum</button></div></div>}
    </div>
  );
}
