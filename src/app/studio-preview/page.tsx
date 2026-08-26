/* =====================================================================
   VERVE Studio — Full Functional v3
   - Route: /studio-preview
   - Upload file beneran (video/audio/image)
   - Drop ke timeline beneran
   - Edit trim/durasi
   - 🎵 Auto-Terminate audio
   - 🎬 Render beneran pakai MediaRecorder → download WebM
   - 💾 Save/load project ke localStorage
   - 📝 Subtitle AI: audio/video Arab → bahasa pilihan + SRT
   - Auto-save on change
   ===================================================================== */

"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  applyAutoTerminate,
  saveProject,
  loadProject,
  extractMediaDuration,
  detectMediaKind,
  renderTimeline,
  downloadBlob,
  type Track,
  type ClipBlock,
  type MediaItem,
  type SubtitleCue,
  type SubtitleMode,
  type SubtitleRenderStyle,
  SUBTITLE_LANGUAGES,
  SOURCE_LANGUAGES,
  cuesToSrt,
  transcriptionToCues,
  fmtTime,
} from "../../lib/studio";

// =====================================================================
// DEFAULT STATE
// =====================================================================

const defaultTracks: Track[] = [
  { id: "v1", kind: "video", name: "Video 1", muted: false, locked: false, height: 56, color: "#6366f1" },
  { id: "a1", kind: "audio", name: "Audio 1", muted: false, locked: false, height: 48, color: "#10b981" },
  { id: "t1", kind: "text", name: "Teks", muted: false, locked: false, height: 40, color: "#f59e0b" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

function chooseAudioMime(): string {
  const MediaRecorderCtor = (window as any).MediaRecorder;
  if (!MediaRecorderCtor?.isTypeSupported) return "";
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorderCtor.isTypeSupported(mime)) return mime;
  }
  return "";
}

async function mediaItemToFile(item: MediaItem): Promise<File> {
  if (!item.url) throw new Error("Media ini belum punya file asli. Upload video/audio dari HP dulu.");
  const response = await fetch(item.url);
  if (!response.ok) throw new Error(`File media tidak bisa dibaca (HTTP ${response.status})`);
  const blob = await response.blob();
  if (!blob.size) throw new Error("File media kosong.");
  return new File([blob], item.name || "media", { type: item.type || blob.type || "application/octet-stream" });
}

function readBansosChatHeaders(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem("verve_bansos_chat_v1") || "null");
    if (!saved?.base || !saved?.key) return {};
    return {
      "x-bansos-chat-base": String(saved.base),
      "x-bansos-chat-key": String(saved.key),
      ...(saved.model ? { "x-bansos-chat-model": String(saved.model) } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Whisper menerima audio, bukan video. Untuk video lokal, ambil track audionya
 * lewat captureStream di browser lalu kirim hasil audio ke endpoint transkripsi.
 * Ini berjalan mengikuti durasi video, sehingga status proses harus jujur.
 */
async function extractAudioFromVideo(file: File, onProgress?: (progress: number) => void): Promise<File> {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder === "undefined") {
    throw new Error("Browser ini belum mendukung ekstraksi audio dari video. Upload audio MP3/WAV sebagai gantinya.");
  }
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;
  video.volume = 1;
  video.src = objectUrl;
  let audioContext: AudioContext | null = null;
  let captured: MediaStream | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca browser."));
    });

    // Jalur utama memakai Web Audio: audio direkam ke destination virtual,
    // bukan ke speaker HP. captureStream menjadi fallback browser lama.
    let audioStream: MediaStream | null = null;
    const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (AudioContextCtor) {
      try {
        audioContext = new AudioContextCtor();
        await audioContext.resume().catch(() => {});
        const sourceNode = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        audioStream = destination.stream;
      } catch {
        try { await audioContext?.close(); } catch { /* abaikan */ }
        audioContext = null;
      }
    }
    if (!audioStream) {
      const capture = (video as any).captureStream || (video as any).mozCaptureStream;
      if (typeof capture !== "function") {
        throw new Error("Browser ini belum mendukung ekstraksi audio dari video. Upload audio MP3/WAV sebagai gantinya.");
      }
      captured = capture.call(video) as MediaStream;
      audioStream = new MediaStream(captured.getAudioTracks());
    }
    if (!audioStream.getAudioTracks().length) throw new Error("Video ini tidak memiliki track audio.");
    const mime = chooseAudioMime();
    const recorder = mime
      ? new MediaRecorder(audioStream, { mimeType: mime })
      : new MediaRecorder(audioStream);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const baseName = (file.name || "ceramah").replace(/\.[^.]+$/, "") || "ceramah";

    return await new Promise<File>((resolve, reject) => {
      const chunks: Blob[] = [];
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try { recorder.stop(); } catch { /* sudah berhenti */ }
        audioStream.getTracks().forEach((track) => track.stop());
        reject(new Error("Ekstraksi audio terlalu lama. Coba potong video atau upload audio terpisah."));
      }, Math.max(30_000, (duration || 600) * 1000 + 30_000));
      const clean = () => {
        window.clearTimeout(timeout);
        audioStream.getTracks().forEach((track) => track.stop());
      };
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (settled) return;
        settled = true;
        clean();
        reject(new Error("Browser gagal mengambil audio dari video."));
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        clean();
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
        if (!blob.size) {
          reject(new Error("Audio hasil ekstraksi kosong."));
          return;
        }
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        resolve(new File([blob], `${baseName}.${extension}`, { type: blob.type || "audio/webm" }));
      };
      video.ontimeupdate = () => {
        if (duration > 0) onProgress?.(Math.min(1, video.currentTime / duration));
      };
      video.onended = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.start(250);
      void video.play().catch(() => {
        if (settled) return;
        settled = true;
        clean();
        try { recorder.stop(); } catch { /* abaikan */ }
        reject(new Error("Video tidak dapat diputar untuk mengambil audionya."));
      });
    });
  } finally {
    video.pause();
    captured?.getTracks().forEach((track) => track.stop());
    try { await audioContext?.close(); } catch { /* abaikan */ }
    video.removeAttribute("src");
    try { video.load(); } catch { /* abaikan */ }
    URL.revokeObjectURL(objectUrl);
  }
}

// =====================================================================
// KOMPONEN UTAMA
// =====================================================================

export default function StudioPreview() {
  // Load from storage on mount
  const [tracks, setTracks] = useState<Track[]>(defaultTracks);
  const [clips, setClips] = useState<ClipBlock[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(40);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoTerminateOn, setAutoTerminateOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleMediaId, setSubtitleMediaId] = useState("");
  const [subtitleSource, setSubtitleSource] = useState("ar");
  const [subtitleTarget, setSubtitleTarget] = useState("id");
  const [subtitleCustomTarget, setSubtitleCustomTarget] = useState("");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("translate");
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleRenderStyle>("box");
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [subtitleStatus, setSubtitleStatus] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [subtitleEngine, setSubtitleEngine] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    const saved = loadProject();
    if (saved) {
      setTracks(saved.tracks.length ? saved.tracks : defaultTracks);
      setClips(saved.clips);
      setMedia(saved.media);
      setSubtitleCues(Array.isArray(saved.subtitles) ? saved.subtitles : []);
      showToast("💾 Project dimuat dari local");
    } else {
      // Set sample untuk first run
      const sampleMedia: MediaItem[] = [
        { id: uid(), kind: "video", name: "Sample-A.mp4", url: "", dur: 6 },
        { id: uid(), kind: "audio", name: "Sample-BGM.mp3", url: "", dur: 8 },
      ];
      const sampleClips: ClipBlock[] = [
        { id: uid(), trackId: "v1", mediaId: sampleMedia[0].id, start: 0, dur: 6, trimStart: 0, trimEnd: 0 },
        { id: uid(), trackId: "a1", mediaId: sampleMedia[1].id, start: 2, dur: 6, trimStart: 0, trimEnd: 0 },
      ];
      setMedia(sampleMedia);
      setClips(sampleClips);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on change
  useEffect(() => {
    if (tracks.length === 0 && clips.length === 0 && media.length === 0) return;
    saveProject({
      version: 1,
      tracks,
      clips,
      media,
      subtitles: subtitleCues,
      savedAt: Date.now(),
    });
  }, [tracks, clips, media, subtitleCues]);

  const totalDur = useMemo(() => {
    let max = 0;
    clips.forEach((c) => {
      const end = c.start + c.dur;
      if (end > max) max = end;
    });
    subtitleCues.forEach((cue) => {
      if (cue.end > max) max = cue.end;
    });
    return Math.max(max, 20);
  }, [clips, subtitleCues]);

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;
  const subtitleMedia = media.find((item) => item.id === subtitleMediaId && item.url)
    || media.find((item) => (item.kind === "video" || item.kind === "audio") && item.url)
    || null;
  const activeSubtitle = subtitleCues.find((cue) => playhead >= cue.start && playhead < cue.end) || null;

  useEffect(() => {
    if (!subtitleMediaId || !media.some((item) => item.id === subtitleMediaId && item.url)) {
      setSubtitleMediaId(media.find((item) => (item.kind === "video" || item.kind === "audio") && item.url)?.id || "");
    }
  }, [media, subtitleMediaId]);

  // Playhead animasi
  useEffect(() => {
    if (!isPlaying) return;
    const start = performance.now();
    const startPH = playhead;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const next = startPH + elapsed;
      if (next >= totalDur) {
        setPlayhead(totalDur);
        setIsPlaying(false);
        return;
      }
      setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // ============ UPLOAD FILE ============
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    showToast(`📂 Upload ${files.length} file...`);

    for (const file of files) {
      const kind = detectMediaKind(file.type);
      const itemId = uid();
      if (kind === "image") {
        // Image: langsung, no duration
        const url = URL.createObjectURL(file);
        setMedia((prev) => [
          ...prev,
          {
            id: itemId,
            kind,
            name: file.name,
            url,
            dur: 5, // default image durasi 5s
            size: file.size,
            type: file.type,
          },
        ]);
      } else {
        // Video/Audio: extract durasi
        const dur = await extractMediaDuration(file);
        const url = URL.createObjectURL(file);
        setMedia((prev) => [
          ...prev,
          {
            id: itemId,
            kind,
            name: file.name,
            url,
            dur: dur || 5,
            size: file.size,
            type: file.type,
          },
        ]);
        if (kind === "video" || kind === "audio") setSubtitleMediaId(itemId);
      }
    }
    showToast(`✅ ${files.length} file ditambahkan ke Media`);
    e.target.value = ""; // reset
  };

  // ============ TAMBAH CLIP DARI MEDIA ============
  const addClip = (mediaId: string) => {
    const m = media.find((x) => x.id === mediaId);
    if (!m) return;
    const track = tracks.find((t) => t.kind === m.kind);
    if (!track) {
      showToast(`❌ Tidak ada track ${m.kind}`);
      return;
    }
    const lastEnd = clips
      .filter((c) => c.trackId === track.id)
      .reduce((max, c) => Math.max(max, c.start + c.dur), 0);
    const newClip: ClipBlock = {
      id: uid(),
      trackId: track.id,
      mediaId,
      start: lastEnd,
      dur: m.dur,
      trimStart: 0,
      trimEnd: 0,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    if (autoTerminateOn && m.kind === "audio") {
      setTimeout(() => {
        setClips((prev) => applyAutoTerminate(tracks, prev));
        showToast("✂️ Auto-Cut diterapkan");
      }, 50);
    }
    showToast(`➕ ${m.name} → ${track.name}`);
  };

  // ============ AUTO-TERMINATE ============
  const runAutoTerminate = useCallback(() => {
    setClips((prev) => applyAutoTerminate(tracks, prev));
    showToast("✂️ Auto-Terminate diterapkan");
  }, [tracks, showToast]);

  // ============ UPDATE CLIP ============
  const updateClip = (clipId: string, patch: Partial<ClipBlock>) => {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, ...patch } : c)));
  };

  const updateSubtitleCue = (cueId: string, patch: Partial<SubtitleCue>) => {
    setSubtitleCues((prev) => prev.map((cue) => (cue.id === cueId ? { ...cue, ...patch } : cue)));
  };

  const subtitleTargetName = subtitleTarget === "custom"
    ? subtitleCustomTarget.trim()
    : (SUBTITLE_LANGUAGES.find((item) => item.code === subtitleTarget)?.label || subtitleTarget);

  const downloadSubtitles = (field: "text" | "original" = "text") => {
    if (!subtitleCues.length) {
      showToast("⚠️ Buat subtitle dulu sebelum download");
      return;
    }
    const suffix = field === "original" ? "arab-asli" : (subtitleTarget === "custom" ? "terjemahan" : subtitleTarget);
    const blob = new Blob([cuesToSrt(subtitleCues, field)], { type: "application/x-subrip;charset=utf-8" });
    downloadBlob(blob, `verve-subtitle-${suffix}.srt`);
    showToast(`⬇️ File SRT ${field === "original" ? "asli" : "terjemahan"} siap`);
  };

  const clearSubtitles = () => {
    setSubtitleCues([]);
    setSubtitleEngine("");
    setSubtitleStatus("");
    setSubtitleError("");
    showToast("🗑 Subtitle dihapus");
  };

  const generateSubtitles = async () => {
    if (subtitleBusy) return;
    if (!subtitleMedia) {
      setSubtitleError("Upload video atau audio ceramah dulu, lalu pilih medianya.");
      return;
    }
    const target = subtitleTarget === "custom" ? subtitleCustomTarget.trim() : subtitleTarget;
    if (!target) {
      setSubtitleError("Isi bahasa tujuan terlebih dahulu.");
      return;
    }
    setSubtitleBusy(true);
    setSubtitleError("");
    setSubtitleEngine("");
    setSubtitleStatus("Menyiapkan file…");
    try {
      const sourceFile = await mediaItemToFile(subtitleMedia);
      let audioFile = sourceFile;
      if (subtitleMedia.kind === "video" || sourceFile.type.startsWith("video/")) {
        setSubtitleStatus("Mengambil audio dari video… 0% (berjalan mengikuti durasi video)");
        audioFile = await extractAudioFromVideo(sourceFile, (progress) => {
          setSubtitleStatus(`Mengambil audio dari video… ${Math.round(progress * 100)}%`);
        });
      }

      setSubtitleStatus("Mendengar ceramah dengan Whisper…");
      const form = new FormData();
      form.append("file", audioFile, audioFile.name);
      form.append("lang", subtitleSource);
      const transcriptResponse = await fetch("/api/hcnsec/transcribe", { method: "POST", body: form });
      const transcriptBody = await transcriptResponse.json().catch(() => ({}));
      if (!transcriptResponse.ok || transcriptBody?.ok === false) {
        throw new Error(String(transcriptBody?.error || `Transkripsi gagal (HTTP ${transcriptResponse.status})`));
      }
      const originalCues = transcriptionToCues(transcriptBody?.segments || [], transcriptBody?.words || []);
      if (!originalCues.length) throw new Error("Suara belum terbaca. Coba video/audio yang lebih jelas.");
      setSubtitleCues(originalCues);
      setSubtitleStatus(`${originalCues.length} baris ditemukan. Menerjemahkan ke ${subtitleTargetName}…`);

      const translationResponse = await fetch("/api/hcnsec/subtitle-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...readBansosChatHeaders() },
        body: JSON.stringify({
          sourceLanguage: subtitleSource,
          targetLanguage: target,
          mode: subtitleMode,
          cues: originalCues.map(({ id, start, end, original }) => ({ id, start, end, original })),
        }),
      });
      const translationBody = await translationResponse.json().catch(() => ({}));
      if (!translationResponse.ok || translationBody?.ok === false) {
        throw new Error(String(translationBody?.error || `Terjemahan gagal (HTTP ${translationResponse.status})`));
      }
      const translatedById = new Map<string, string>(
        (Array.isArray(translationBody?.cues) ? translationBody.cues : []).map((cue: any) => [String(cue.id), String(cue.text || "").trim()]),
      );
      const completed = originalCues.map((cue) => ({
        ...cue,
        text: translatedById.get(cue.id) || cue.original,
      }));
      setSubtitleCues(completed);
      setSubtitleEngine(`${transcriptBody?.engine || "Whisper"} → ${translationBody?.engine || "penerjemah"}`);
      setSubtitleStatus(`✅ ${completed.length} subtitle siap · ${subtitleTargetName}`);
      showToast(`✅ Subtitle ${subtitleTargetName} selesai dibuat`);
    } catch (error: any) {
      const message = String(error?.message || "Subtitle otomatis gagal").slice(0, 240);
      setSubtitleError(message);
      setSubtitleStatus("");
      showToast(`❌ ${message}`);
    } finally {
      setSubtitleBusy(false);
    }
  };

  // ============ RENDER BENERAN ============
  const handleRender = async () => {
    if (rendering) return;
    if (!clips.length) {
      showToast("❌ Tidak ada klip untuk di-render");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      showToast("❌ Browser tidak support MediaRecorder");
      return;
    }
    setRendering(true);
    setRenderProgress(0);
    showToast("🎬 Render dimulai...");
    try {
      const result = await renderTimeline(tracks, clips, media, {
        width: 720,
        height: 1280,
        fps: 30,
        subtitles: subtitleCues,
        subtitleStyle,
        onProgress: (p) => setRenderProgress(p),
      });
      if (result) {
        downloadBlob(result.blob, `verve-${Date.now()}.webm`);
        showToast(`✅ Render selesai (${fmtTime(result.duration)})`);
      } else {
        showToast("❌ Render gagal");
      }
    } catch (e) {
      showToast(`❌ Error: ${(e as Error).message}`);
    } finally {
      setRendering(false);
      setRenderProgress(0);
    }
  };

  // ============ CLEAR PROJECT ============
  const handleClear = () => {
    if (!confirm("Hapus semua project? Tidak bisa di-undo.")) return;
    setClips([]);
    setMedia([]);
    setSubtitleCues([]);
    setSubtitleMediaId("");
    setSelectedClipId(null);
    setSubtitleError("");
    setSubtitleStatus("");
    showToast("🗑 Project dikosongkan");
  };

  return (
    <div className="vp-shell">
      {/* TOP BAR */}
      <header className="vp-topbar">
        <div className="vp-topbar-left">
          <div className="vp-logo">V</div>
          <div className="vp-title-stack">
            <div className="vp-title">VERVE Studio</div>
            <div className="vp-subtitle">Functional v3 · {clips.length} klip · {media.length} media</div>
          </div>
        </div>
        <div className="vp-topbar-right">
          <button className="vp-pill ghost" onClick={() => { location.href = "/"; }}>
            ← Dashboard
          </button>
          <button
            className={`vp-pill ${autoTerminateOn ? "on" : ""}`}
            onClick={() => {
              setAutoTerminateOn((v) => {
                const nv = !v;
                if (nv) {
                  setTimeout(() => {
                    setClips((prev) => applyAutoTerminate(tracks, prev));
                    showToast("✂️ Auto-Cut ON");
                  }, 50);
                } else {
                  showToast("⏸ Auto-Cut OFF");
                }
                return nv;
              });
            }}
            title="Auto-terminate klip video saat audio masuk"
          >
            <span>🎵</span>Auto-Cut
          </button>
          <button className="vp-pill ghost" onClick={runAutoTerminate} disabled={!autoTerminateOn}>
            Jalankan
          </button>
          <button
            className="vp-pill ghost"
            onClick={() => document.querySelector(".vp-subtitle-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            📝 Subtitle AI
          </button>
          <button
            className="vp-pill ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            📂 Upload
          </button>
          <button
            className="vp-cta"
            onClick={handleRender}
            disabled={rendering || !clips.length}
          >
            {rendering ? `⏳ ${Math.round(renderProgress * 100)}%` : "🎬 Render"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,image/*"
            multiple
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </div>
      </header>

      {/* MAIN GRID: PREVIEW + TOOLS */}
      <main className="vp-main">
        {/* PREVIEW AREA */}
        <section className="vp-preview">
          <div className="vp-preview-frame">
            {selectedClip ? (() => {
              const m = media.find((x) => x.id === selectedClip.mediaId);
              if (m && m.url && m.kind === "image") {
                return <img src={m.url} alt={m.name} style={{ maxWidth: "100%", maxHeight: "100%" }} />;
              }
              if (m && m.url && m.kind === "video") {
                return <video src={m.url} controls onTimeUpdate={(event) => setPlayhead(Math.min(totalDur, selectedClip.start + event.currentTarget.currentTime))} style={{ maxWidth: "100%", maxHeight: "100%" }} />;
              }
              return (
                <div className="vp-preview-placeholder">
                  <div className="vp-preview-label">Preview</div>
                  <div className="vp-preview-time">{fmtTime(playhead)} / {fmtTime(totalDur)}</div>
                  <div className="vp-preview-clipname">{selectedClip.id} — {m?.name || "—"}</div>
                  {!m?.url && <div className="vp-preview-hint">(sample data — upload file untuk lihat)</div>}
                </div>
              );
            })() : (
              <div className="vp-preview-placeholder">
                <div className="vp-preview-label">Preview</div>
                <div className="vp-preview-time">{fmtTime(playhead)} / {fmtTime(totalDur)}</div>
                <div className="vp-preview-hint">Pilih klip di timeline</div>
              </div>
            )}
            {activeSubtitle && (
              <div className={`vp-subtitle-preview ${subtitleStyle}`}>
                {activeSubtitle.text}
              </div>
            )}
          </div>
          <div className="vp-preview-controls">
            <button className="vp-iconbtn" onClick={() => setPlayhead(0)}>⏮</button>
            <button className="vp-iconbtn primary" onClick={() => setIsPlaying((v) => !v)}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button className="vp-iconbtn" onClick={() => setPlayhead(totalDur)}>⏭</button>
            <div className="vp-time-readout">{fmtTime(playhead)}</div>
          </div>
        </section>

        {/* INSPECTOR */}
        <aside className="vp-inspector">
          <div className="vp-section-title">Properti Klip</div>
          {selectedClip ? (
            <div className="vp-prop-grid">
              <PropRow label="ID" value={selectedClip.id} />
              <PropRow label="Mulai" value={fmtTime(selectedClip.start)} />
              <PropRow
                label="Durasi"
                value={fmtTime(selectedClip.dur)}
                editable
                onChange={(v) => updateClip(selectedClip.id, { dur: Math.max(0.1, parseFloat(v) || 0) })}
              />
              <PropRow
                label="Trim Awal"
                value={fmtTime(selectedClip.trimStart)}
                editable
                onChange={(v) => updateClip(selectedClip.id, { trimStart: Math.max(0, parseFloat(v) || 0) })}
              />
              <PropRow
                label="Auto-Cut"
                value={selectedClip.autoTerminated ? "✅ Aktif" : "—"}
              />
              <div className="vp-prop-actions">
                <button
                  className="vp-mini danger"
                  onClick={() => {
                    setClips((prev) => prev.filter((c) => c.id !== selectedClip.id));
                    setSelectedClipId(null);
                    showToast("🗑 Klip dihapus");
                  }}
                >
                  Hapus Klip
                </button>
              </div>
            </div>
          ) : (
            <div className="vp-empty">Pilih klip di timeline</div>
          )}

          <div className="vp-section-title">Media ({media.length})</div>
          <div className="vp-media-list">
            {media.length === 0 && (
              <div className="vp-empty">Belum ada media. Klik 📂 Upload.</div>
            )}
            {media.map((m) => (
              <div key={m.id} className="vp-media-row">
                <div className="vp-media-icon">
                  {m.kind === "video" ? "🎬" : m.kind === "audio" ? "🎵" : "🖼"}
                </div>
                <div className="vp-media-info">
                  <div className="vp-media-name">{m.name}</div>
                  <div className="vp-media-dur">{fmtTime(m.dur)}{m.size ? ` · ${(m.size / 1024 / 1024).toFixed(1)}MB` : ""}</div>
                </div>
                <div className="vp-media-add">
                  <button className="vp-mini" onClick={() => addClip(m.id)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="vp-section-title">📝 Subtitle & Terjemahan</div>
          <div className="vp-subtitle-panel">
            <div className="vp-subtitle-note">Video Arab tetap bersuara Arab. Sistem membuat teks, lalu menerjemahkannya ke bahasa pilihan bro.</div>
            <label className="vp-field">
              <span>Media ceramah</span>
              <select
                value={subtitleMedia?.id || ""}
                onChange={(event) => setSubtitleMediaId(event.target.value)}
                disabled={subtitleBusy}
              >
                <option value="">Pilih video/audio…</option>
                {media.filter((item) => (item.kind === "video" || item.kind === "audio") && item.url).map((item) => (
                  <option key={item.id} value={item.id}>{item.kind === "video" ? "🎬" : "🎵"} {item.name}</option>
                ))}
              </select>
            </label>
            <div className="vp-field-row">
              <label className="vp-field">
                <span>Bahasa suara</span>
                <select value={subtitleSource} onChange={(event) => setSubtitleSource(event.target.value)} disabled={subtitleBusy}>
                  {SOURCE_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
              <label className="vp-field">
                <span>Bahasa hasil</span>
                <select value={subtitleTarget} onChange={(event) => setSubtitleTarget(event.target.value)} disabled={subtitleBusy}>
                  {SUBTITLE_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  <option value="custom">Bahasa lain…</option>
                </select>
              </label>
            </div>
            {subtitleTarget === "custom" && (
              <input
                className="vp-subtitle-custom"
                value={subtitleCustomTarget}
                onChange={(event) => setSubtitleCustomTarget(event.target.value)}
                placeholder="Contoh: Swahili, Bengali, atau bahasa yang bro mau"
                disabled={subtitleBusy}
              />
            )}
            <div className="vp-field-row">
              <div className="vp-field">
                <span>Mode teks</span>
                <div className="vp-subtitle-switch">
                  <button type="button" className={subtitleMode === "translate" ? "active" : ""} onClick={() => setSubtitleMode("translate")} disabled={subtitleBusy}>Terjemahan</button>
                  <button type="button" className={subtitleMode === "transliterate" ? "active" : ""} onClick={() => setSubtitleMode("transliterate")} disabled={subtitleBusy}>Latin Arab</button>
                </div>
              </div>
              <label className="vp-field">
                <span>Gaya subtitle</span>
                <select value={subtitleStyle} onChange={(event) => setSubtitleStyle(event.target.value as SubtitleRenderStyle)} disabled={subtitleBusy}>
                  <option value="box">Kotak gelap</option>
                  <option value="clean">Putih bersih</option>
                  <option value="yellow">Kuning tegas</option>
                </select>
              </label>
            </div>
            <button className="vp-subtitle-cta" onClick={generateSubtitles} disabled={subtitleBusy || !subtitleMedia}>
              {subtitleBusy ? "⏳ Memproses…" : "✨ Buat Subtitle Otomatis"}
            </button>
            {subtitleStatus && <div className="vp-subtitle-status">{subtitleStatus}</div>}
            {subtitleError && <div className="vp-subtitle-error">⚠️ {subtitleError}</div>}
            {subtitleEngine && <div className="vp-subtitle-engine">Mesin: {subtitleEngine}</div>}
            {subtitleCues.length > 0 && (
              <>
                <div className="vp-subtitle-summary">{subtitleCues.length} baris · edit teks di bawah lalu render ulang</div>
                <div className="vp-subtitle-actions">
                  <button className="vp-mini" onClick={() => downloadSubtitles("text")}>⬇️ SRT hasil</button>
                  <button className="vp-mini" onClick={() => downloadSubtitles("original")}>⬇️ SRT Arab</button>
                  <button className="vp-mini danger" onClick={clearSubtitles}>Hapus</button>
                </div>
                <div className="vp-subtitle-list">
                  {subtitleCues.slice(0, 80).map((cue) => (
                    <div className="vp-subtitle-cue" key={cue.id}>
                      <div className="vp-subtitle-time">{fmtTime(cue.start)} – {fmtTime(cue.end)}</div>
                      <div className="vp-subtitle-original">{cue.original}</div>
                      <textarea value={cue.text} onChange={(event) => updateSubtitleCue(cue.id, { text: event.target.value })} aria-label={`Edit subtitle ${cue.id}`} />
                    </div>
                  ))}
                </div>
                {subtitleCues.length > 80 && <div className="vp-subtitle-summary">Menampilkan 80 baris pertama. Semua baris tetap ikut export.</div>}
              </>
            )}
          </div>

          <div className="vp-section-title">Aksi</div>
          <div className="vp-prop-actions" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="vp-mini" onClick={runAutoTerminate} disabled={!autoTerminateOn}>
              ✂️ Jalankan Auto-Cut
            </button>
            <button className="vp-mini" onClick={handleRender} disabled={rendering || !clips.length}>
              🎬 Render WebM
            </button>
            <button className="vp-mini danger" onClick={handleClear}>
              🗑 Hapus Project
            </button>
          </div>
        </aside>
      </main>

      {/* TIMELINE */}
      <section className="vp-timeline">
        <div className="vp-tl-head">
          <div className="vp-tl-title">Timeline</div>
          <div className="vp-tl-tools">
            <button className="vp-mini" onClick={() => setZoom((z) => Math.max(10, z - 10))}>−</button>
            <span className="vp-tl-zoom">{zoom}px/s</span>
            <button className="vp-mini" onClick={() => setZoom((z) => Math.min(200, z + 10))}>+</button>
          </div>
        </div>

        <div className="vp-tl-body">
          <div className="vp-tl-ruler">
            {Array.from({ length: Math.ceil(totalDur) + 1 }).map((_, i) => (
              <div key={i} className="vp-tl-tick" style={{ left: i * zoom }}>
                <span>{i}s</span>
              </div>
            ))}
          </div>

          <div className="vp-tl-tracks">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="vp-tl-track"
                style={{ height: track.height }}
              >
                <div
                  className="vp-tl-tracklabel"
                  style={{ background: track.color + "22", borderColor: track.color }}
                >
                  <div className="vp-tl-trackname">{track.name}</div>
                  <div className="vp-tl-trackkind">{track.kind}</div>
                </div>
                <div className="vp-tl-trackarea">
                  {track.kind === "text" && subtitleCues.length > 0 ? subtitleCues.map((cue) => (
                    <div
                      key={cue.id}
                      className="vp-subtitle-timeline-clip"
                      style={{ left: cue.start * zoom, width: Math.max(18, (cue.end - cue.start) * zoom) }}
                      onClick={() => setPlayhead(cue.start)}
                      title={cue.text}
                    >
                      {cue.text}
                    </div>
                  )) : clips
                    .filter((c) => c.trackId === track.id)
                    .map((c) => {
                      const m = media.find((x) => x.id === c.mediaId);
                      return (
                        <div
                          key={c.id}
                          className={`vp-clip ${selectedClipId === c.id ? "selected" : ""} ${c.autoTerminated ? "auto" : ""}`}
                          style={{
                            left: c.start * zoom,
                            width: c.dur * zoom,
                            background: track.color,
                          }}
                          onClick={() => setSelectedClipId(c.id)}
                        >
                          <div className="vp-clip-name">{m?.name || c.id}</div>
                          {c.autoTerminated && <div className="vp-clip-badge">✂️</div>}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            <div className="vp-playhead" style={{ left: playhead * zoom }} />
          </div>
        </div>
      </section>

      {toast && <div className="vp-toast">{toast}</div>}
      {rendering && (
        <div className="vp-render-overlay">
          <div className="vp-render-card">
            <div className="vp-render-title">🎬 Rendering...</div>
            <div className="vp-render-bar">
              <div className="vp-render-fill" style={{ width: `${renderProgress * 100}%` }} />
            </div>
            <div className="vp-render-pct">{Math.round(renderProgress * 100)}%</div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .vp-shell {
          min-height: 100vh;
          background: #0a0a0f;
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          padding-bottom: env(safe-area-inset-bottom);
        }
        .vp-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px;
          background: linear-gradient(180deg, #111118, #0a0a0f);
          border-bottom: 1px solid #1f1f2a;
          position: sticky; top: 0; z-index: 10;
          gap: 8px; flex-wrap: wrap;
        }
        .vp-topbar-left { display: flex; align-items: center; gap: 10px; }
        .vp-logo {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; color: #fff; font-size: 18px;
        }
        .vp-title { font-weight: 700; font-size: 15px; }
        .vp-subtitle { font-size: 11px; color: #9ca3af; }
        .vp-topbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .vp-pill {
          padding: 7px 12px; border-radius: 999px;
          border: 1px solid #2a2a3a; background: #15151f;
          color: #e5e7eb; font-size: 12px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .vp-pill:disabled { opacity: 0.5; cursor: not-allowed; }
        .vp-pill.on { background: #1d4ed8; border-color: #3b82f6; }
        .vp-pill.ghost { background: transparent; }
        .vp-cta {
          padding: 7px 14px; border-radius: 999px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff; border: none; font-weight: 700; font-size: 12px; cursor: pointer;
        }
        .vp-cta:disabled { opacity: 0.5; cursor: not-allowed; }
        .vp-main {
          display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px;
        }
        @media (min-width: 768px) { .vp-main { grid-template-columns: 1.4fr 1fr; } }
        .vp-preview {
          background: #0f0f17; border: 1px solid #1f1f2a;
          border-radius: 14px; padding: 12px;
        }
        .vp-preview-frame {
          aspect-ratio: 16/9; background: #000;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          position: relative; overflow: hidden;
        }
        .vp-preview-placeholder { text-align: center; color: #6b7280; }
        .vp-preview-label { font-size: 24px; font-weight: 800; color: #9ca3af; }
        .vp-preview-time { font-size: 13px; margin-top: 4px; font-family: monospace; }
        .vp-preview-clipname { font-size: 11px; margin-top: 4px; color: #6366f1; }
        .vp-preview-hint { font-size: 10px; margin-top: 4px; color: #4b5563; }
        .vp-subtitle-preview {
          position: absolute; left: 7%; right: 7%; bottom: 7%;
          text-align: center; color: #fff; font-size: clamp(12px, 2vw, 22px);
          line-height: 1.25; font-weight: 800; padding: 7px 12px;
          pointer-events: none; white-space: pre-wrap; overflow-wrap: anywhere;
          text-shadow: 0 2px 5px rgba(0,0,0,.9); z-index: 2;
        }
        .vp-subtitle-preview.box { background: rgba(0,0,0,.68); border-radius: 7px; }
        .vp-subtitle-preview.clean { background: transparent; }
        .vp-subtitle-preview.yellow { color: #fde047; }
        .vp-preview-controls {
          display: flex; align-items: center; gap: 8px; margin-top: 10px; justify-content: center;
        }
        .vp-iconbtn {
          width: 40px; height: 40px; border-radius: 10px;
          border: 1px solid #2a2a3a; background: #15151f;
          color: #e5e7eb; font-size: 14px; cursor: pointer;
        }
        .vp-iconbtn.primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6); border-color: #6366f1;
        }
        .vp-time-readout { font-family: monospace; font-size: 14px; margin-left: 8px; color: #10b981; }
        .vp-inspector {
          background: #0f0f17; border: 1px solid #1f1f2a;
          border-radius: 14px; padding: 12px;
          max-height: 60vh; overflow-y: auto;
        }
        .vp-section-title {
          font-size: 11px; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: 0.05em; margin: 8px 0;
        }
        .vp-prop-grid { display: flex; flex-direction: column; gap: 6px; }
        .vp-prop-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 7px 10px; background: #15151f; border-radius: 8px; font-size: 12px;
        }
        .vp-prop-row input {
          background: #0a0a0f; border: 1px solid #2a2a3a; color: #e5e7eb;
          padding: 4px 6px; border-radius: 6px; width: 80px; font-size: 12px; text-align: right;
        }
        .vp-prop-actions { margin-top: 6px; }
        .vp-mini {
          padding: 6px 10px; border-radius: 8px;
          border: 1px solid #2a2a3a; background: #15151f;
          color: #e5e7eb; font-size: 11px; cursor: pointer; font-weight: 600;
        }
        .vp-mini:disabled { opacity: 0.5; cursor: not-allowed; }
        .vp-mini.danger { background: #7f1d1d; border-color: #ef4444; }
        .vp-empty { color: #6b7280; font-size: 12px; padding: 20px; text-align: center; }
        .vp-media-list { display: flex; flex-direction: column; gap: 6px; }
        .vp-media-row {
          display: flex; align-items: center; gap: 8px;
          padding: 8px; background: #15151f; border-radius: 8px;
        }
        .vp-media-icon { font-size: 20px; }
        .vp-media-info { flex: 1; min-width: 0; }
        .vp-media-name {
          font-size: 12px; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .vp-media-dur { font-size: 10px; color: #9ca3af; }
        .vp-subtitle-panel {
          padding: 10px; background: #12121d; border: 1px solid #2d2d40;
          border-radius: 10px; display: flex; flex-direction: column; gap: 8px;
        }
        .vp-subtitle-note { color: #a5b4fc; font-size: 10px; line-height: 1.45; }
        .vp-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .vp-field > span { color: #9ca3af; font-size: 10px; font-weight: 700; }
        .vp-field select, .vp-subtitle-custom {
          width: 100%; box-sizing: border-box; padding: 7px 8px;
          border: 1px solid #2a2a3a; border-radius: 7px;
          background: #0a0a0f; color: #e5e7eb; font: inherit; font-size: 11px;
        }
        .vp-field-row { display: flex; gap: 7px; align-items: flex-start; }
        .vp-subtitle-switch { display: flex; gap: 4px; }
        .vp-subtitle-switch button {
          flex: 1; min-height: 30px; padding: 4px 5px; border-radius: 7px;
          border: 1px solid #2a2a3a; background: #0a0a0f; color: #9ca3af;
          font-size: 10px; cursor: pointer;
        }
        .vp-subtitle-switch button.active { border-color: #6366f1; background: #242047; color: #c7d2fe; }
        .vp-subtitle-switch button:disabled, .vp-field select:disabled, .vp-subtitle-custom:disabled { opacity: .55; cursor: not-allowed; }
        .vp-subtitle-cta {
          min-height: 36px; border: 0; border-radius: 8px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
          font-size: 11px; font-weight: 800; cursor: pointer;
        }
        .vp-subtitle-cta:disabled { opacity: .5; cursor: not-allowed; }
        .vp-subtitle-status, .vp-subtitle-error, .vp-subtitle-engine, .vp-subtitle-summary {
          font-size: 10px; line-height: 1.4; color: #a5b4fc;
        }
        .vp-subtitle-error { color: #fca5a5; }
        .vp-subtitle-engine { color: #6ee7b7; }
        .vp-subtitle-summary { color: #9ca3af; }
        .vp-subtitle-actions { display: flex; flex-wrap: wrap; gap: 5px; }
        .vp-subtitle-actions .vp-mini { flex: 1; min-width: 80px; font-size: 10px; }
        .vp-subtitle-list {
          max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
          padding-right: 2px;
        }
        .vp-subtitle-cue { padding: 7px; background: #0a0a0f; border: 1px solid #242436; border-radius: 7px; }
        .vp-subtitle-time { color: #a5b4fc; font: 10px monospace; }
        .vp-subtitle-original { margin-top: 3px; color: #6b7280; font-size: 10px; line-height: 1.35; }
        .vp-subtitle-cue textarea {
          width: 100%; min-height: 42px; box-sizing: border-box; margin-top: 5px; resize: vertical;
          padding: 6px; border: 1px solid #2a2a3a; border-radius: 6px;
          background: #15151f; color: #f3f4f6; font: inherit; font-size: 11px; line-height: 1.35;
        }
        .vp-timeline {
          background: #0f0f17; border: 1px solid #1f1f2a;
          border-radius: 14px; margin: 0 12px 12px; overflow: hidden;
        }
        .vp-tl-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 12px; border-bottom: 1px solid #1f1f2a;
        }
        .vp-tl-title { font-size: 13px; font-weight: 700; }
        .vp-tl-tools { display: flex; gap: 6px; align-items: center; }
        .vp-tl-zoom { font-size: 11px; color: #9ca3af; min-width: 50px; text-align: center; }
        .vp-tl-body { overflow-x: auto; }
        .vp-tl-ruler {
          position: relative; height: 24px;
          background: #0a0a0f; border-bottom: 1px solid #1f1f2a;
        }
        .vp-tl-tick {
          position: absolute; top: 0; height: 100%;
          border-left: 1px solid #1f1f2a;
          padding-left: 4px; font-size: 10px; color: #6b7280;
        }
        .vp-tl-tracks { position: relative; }
        .vp-tl-track { display: flex; border-bottom: 1px solid #1a1a25; }
        .vp-tl-tracklabel {
          width: 80px; flex-shrink: 0;
          border-right: 1px solid #1f1f2a;
          padding: 4px 8px;
          display: flex; flex-direction: column; justify-content: center;
          border-left: 3px solid;
        }
        .vp-tl-trackname { font-size: 11px; font-weight: 700; }
        .vp-tl-trackkind { font-size: 9px; color: #6b7280; text-transform: uppercase; }
        .vp-tl-trackarea { position: relative; flex: 1; min-width: 600px; }
        .vp-clip {
          position: absolute; top: 4px; bottom: 4px;
          border-radius: 6px; padding: 4px 6px;
          color: #fff; font-size: 10px; font-weight: 600;
          cursor: pointer; overflow: hidden;
          white-space: nowrap; text-overflow: ellipsis;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .vp-clip.selected { box-shadow: 0 0 0 2px #fbbf24; z-index: 2; }
        .vp-subtitle-timeline-clip {
          position: absolute; top: 5px; bottom: 5px; padding: 5px 7px;
          border-radius: 6px; background: #7c3aed; color: #f5f3ff;
          border: 1px solid #a78bfa; font-size: 9px; line-height: 1.25;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;
        }
        .vp-subtitle-timeline-clip:hover { background: #8b5cf6; }
        .vp-clip.auto {
          background-image: linear-gradient(45deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%, transparent);
          background-size: 8px 8px;
        }
        .vp-clip-badge { position: absolute; top: 2px; right: 4px; font-size: 10px; }
        .vp-playhead {
          position: absolute; top: 0; bottom: 0;
          width: 2px; background: #ef4444;
          pointer-events: none; z-index: 3;
        }
        .vp-toast {
          position: fixed; bottom: 24px; left: 50%;
          transform: translateX(-50%);
          background: #15151f; border: 1px solid #2a2a3a;
          padding: 10px 16px; border-radius: 999px;
          font-size: 12px; color: #e5e7eb;
          z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .vp-render-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          z-index: 200;
        }
        .vp-render-card {
          background: #15151f; border: 1px solid #2a2a3a;
          padding: 20px 24px; border-radius: 14px;
          min-width: 280px; text-align: center;
        }
        .vp-render-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; }
        .vp-render-bar {
          height: 8px; background: #0a0a0f;
          border-radius: 4px; overflow: hidden; margin-bottom: 8px;
        }
        .vp-render-fill {
          height: 100%; background: linear-gradient(90deg, #6366f1, #10b981);
          transition: width 0.2s;
        }
        .vp-render-pct { font-family: monospace; font-size: 13px; color: #10b981; }
        @media (max-width: 520px) {
          .vp-topbar { align-items: flex-start; }
          .vp-topbar-right { width: 100%; }
          .vp-topbar-right .vp-pill, .vp-topbar-right .vp-cta { flex: 1; justify-content: center; }
          .vp-field-row { flex-direction: column; }
          .vp-subtitle-actions .vp-mini { min-width: 0; }
        }
      `}</style>
    </div>
  );
}

function PropRow({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="vp-prop-row">
      <span style={{ color: "#9ca3af" }}>{label}</span>
      {editable && onChange ? (
        <input
          type="text"
          defaultValue={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{value}</span>
      )}
    </div>
  );
}
