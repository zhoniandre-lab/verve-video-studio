/* =====================================================================
   VERVE Studio — UI/UX Redesign Preview
   - Route: /studio-preview (terpisah, nggak ganggu production)
   - Visual baru: clean, mobile-first, profesional
   - Engine editing tetap pakai src/lib/editing.ts (stabil)
   - Fitur tambahan: 🎵 Auto-Terminate Audio (potong klip pas audio masuk)
   ===================================================================== */

"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  type SlideOpt,
  type StickerItem,
} from "../../lib/editing";

// =====================================================================
// TIPE LOKAL — struktur data timeline (mirror dari editing engine)
// =====================================================================

type TrackKind = "video" | "audio" | "text" | "sticker";

interface MediaItem {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  url: string;
  dur: number; // detik
}

interface ClipBlock {
  id: string;
  trackId: string;
  mediaId: string;
  start: number; // detik di timeline
  dur: number; // detik tampil
  trimStart: number; // detik offset dalam media
  trimEnd: number; // detik offset akhir
  opt?: SlideOpt;
  autoTerminated?: boolean; // 🎵 fitur baru
}

interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  height: number;
  color: string;
}

// =====================================================================
// UTILITAS TIMELINE
// =====================================================================

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${cs}`;
};

const uid = () => Math.random().toString(36).slice(2, 9);

// 🎵 Auto-Terminate: kalau audio masuk di titik T, potong klip video
// di track yang overlap jadi berakhir di T
const applyAutoTerminate = (tracks: Track[], clips: ClipBlock[]): ClipBlock[] => {
  const audioTrack = tracks.find((t) => t.kind === "audio");
  if (!audioTrack) return clips;

  const audioClips = clips.filter((c) => c.trackId === audioTrack.id);
  if (!audioClips.length) return clips;

  return clips.map((c) => {
    if (c.trackId === audioTrack.id) return c;
    const track = tracks.find((t) => t.id === c.trackId);
    if (!track || track.kind === "text" || track.kind === "sticker") return c;

    const cEnd = c.start + c.dur;
    // Cari audio clip yang overlap dengan klip ini
    const overlapping = audioClips.find(
      (a) => a.start < cEnd && a.start + a.dur > c.start
    );
    if (!overlapping) return c;
    // Titik potong: awal audio
    const cutPoint = overlapping.start;
    if (cutPoint <= c.start) return c;
    if (cutPoint >= cEnd) return c;
    return {
      ...c,
      dur: cutPoint - c.start,
      autoTerminated: true,
    };
  });
};

// =====================================================================
// STATE DEFAULT (project kosong)
// =====================================================================

const defaultTracks: Track[] = [
  { id: "v1", kind: "video", name: "Video 1", muted: false, locked: false, height: 56, color: "#6366f1" },
  { id: "v2", kind: "video", name: "Video 2", muted: false, locked: false, height: 56, color: "#8b5cf6" },
  { id: "a1", kind: "audio", name: "Audio 1", muted: false, locked: false, height: 48, color: "#10b981" },
  { id: "t1", kind: "text", name: "Teks", muted: false, locked: false, height: 40, color: "#f59e0b" },
];

const sampleMedia: MediaItem[] = [
  { id: "m1", kind: "video", name: "Scene-A.mp4", url: "#", dur: 8.4 },
  { id: "m2", kind: "video", name: "Scene-B.mp4", url: "#", dur: 5.2 },
  { id: "m3", kind: "audio", name: "BGM-LirikTakdir.mp3", url: "#", dur: 14.0 },
  { id: "m4", kind: "image", name: "Cover.jpg", url: "#", dur: 3.0 },
];

const sampleClips: ClipBlock[] = [
  { id: "c1", trackId: "v1", mediaId: "m1", start: 0, dur: 8.4, trimStart: 0, trimEnd: 0 },
  { id: "c2", trackId: "v2", mediaId: "m2", start: 0, dur: 5.2, trimStart: 0, trimEnd: 0 },
  { id: "c3", trackId: "a1", mediaId: "m3", start: 2, dur: 12, trimStart: 0, trimEnd: 0 },
  { id: "c4", trackId: "t1", mediaId: "m4", start: 0.5, dur: 3, trimStart: 0, trimEnd: 0 },
];

// =====================================================================
// KOMPONEN UTAMA
// =====================================================================

export default function StudioPreview() {
  const [tracks, setTracks] = useState<Track[]>(defaultTracks);
  const [clips, setClips] = useState<ClipBlock[]>(sampleClips);
  const [media] = useState<MediaItem[]>(sampleMedia);
  const [selectedClipId, setSelectedClipId] = useState<string | null>("c1");
  const [playhead, setPlayhead] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(40); // pixel per detik
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoTerminateOn, setAutoTerminateOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const totalDur = useMemo(() => {
    let max = 0;
    clips.forEach((c) => {
      const end = c.start + c.dur;
      if (end > max) max = end;
    });
    return Math.max(max, 20);
  }, [clips]);

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;

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

  // 🎵 Auto-terminate trigger
  const runAutoTerminate = useCallback(() => {
    setClips((prev) => applyAutoTerminate(tracks, prev));
    showToast("✂️ Auto-Terminate diterapkan — klip dipotong di awal audio");
  }, [tracks]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // Drag clip di timeline
  const onClipMouseDown = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClipId(clipId);
  };

  // Tambah clip baru ke track
  const addClip = (mediaId: string, trackKind: TrackKind) => {
    const m = media.find((x) => x.id === mediaId);
    const track = tracks.find((t) => t.kind === trackKind);
    if (!m || !track) return;
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
    if (autoTerminateOn && trackKind === "audio") {
      setTimeout(runAutoTerminate, 50);
    }
    showToast(`➕ ${m.name} ditambahkan ke ${track.name}`);
  };

  return (
    <div className="vp-shell">
      {/* TOP BAR */}
      <header className="vp-topbar">
        <div className="vp-topbar-left">
          <div className="vp-logo">V</div>
          <div className="vp-title-stack">
            <div className="vp-title">VERVE Studio</div>
            <div className="vp-subtitle">UI/UX Preview · New Skin</div>
          </div>
        </div>
        <div className="vp-topbar-right">
          <button
            className={`vp-pill ${autoTerminateOn ? "on" : ""}`}
            onClick={() => setAutoTerminateOn((v) => !v)}
            title="Auto-terminate klip video saat audio masuk"
          >
            🎵 Auto-Cut
          </button>
          <button
            className="vp-pill ghost"
            onClick={runAutoTerminate}
            disabled={!autoTerminateOn}
          >
            Jalankan
          </button>
          <button
            className="vp-cta"
            onClick={() => {
              setIsPlaying((v) => !v);
              showToast(isPlaying ? "⏸ Pause" : "▶ Play");
            }}
          >
            {isPlaying ? "⏸" : "▶"} Render
          </button>
        </div>
      </header>

      {/* MAIN GRID: PREVIEW + TOOLS */}
      <main className="vp-main">
        {/* PREVIEW AREA */}
        <section className="vp-preview">
          <div className="vp-preview-frame">
            <div className="vp-preview-placeholder">
              <div className="vp-preview-label">Preview</div>
              <div className="vp-preview-time">{fmtTime(playhead)} / {fmtTime(totalDur)}</div>
              {selectedClip && (
                <div className="vp-preview-clipname">{selectedClip.id}</div>
              )}
            </div>
          </div>
          <div className="vp-preview-controls">
            <button
              className="vp-iconbtn"
              onClick={() => setPlayhead(0)}
              title="Reset"
            >
              ⏮
            </button>
            <button
              className="vp-iconbtn primary"
              onClick={() => setIsPlaying((v) => !v)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              className="vp-iconbtn"
              onClick={() => setPlayhead(totalDur)}
              title="End"
            >
              ⏭
            </button>
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
                onChange={(v) =>
                  setClips((prev) =>
                    prev.map((c) =>
                      c.id === selectedClip.id
                        ? { ...c, dur: Math.max(0.1, parseFloat(v) || 0) }
                        : c
                    )
                  )
                }
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

          <div className="vp-section-title">Media</div>
          <div className="vp-media-list">
            {media.map((m) => (
              <div key={m.id} className="vp-media-row">
                <div className="vp-media-icon">
                  {m.kind === "video" ? "🎬" : m.kind === "audio" ? "🎵" : "🖼"}
                </div>
                <div className="vp-media-info">
                  <div className="vp-media-name">{m.name}</div>
                  <div className="vp-media-dur">{fmtTime(m.dur)}</div>
                </div>
                <div className="vp-media-add">
                  <button
                    className="vp-mini"
                    onClick={() =>
                      addClip(
                        m.id,
                        m.kind === "audio" ? "audio" : m.kind === "image" ? "video" : "video"
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {/* TIMELINE */}
      <section className="vp-timeline">
        <div className="vp-tl-head">
          <div className="vp-tl-title">Timeline</div>
          <div className="vp-tl-tools">
            <button
              className="vp-mini"
              onClick={() => setZoom((z) => Math.max(10, z - 10))}
            >
              −
            </button>
            <span className="vp-tl-zoom">{zoom}px/s</span>
            <button
              className="vp-mini"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
            >
              +
            </button>
          </div>
        </div>

        <div className="vp-tl-body">
          {/* RULER */}
          <div className="vp-tl-ruler">
            {Array.from({ length: Math.ceil(totalDur) + 1 }).map((_, i) => (
              <div
                key={i}
                className="vp-tl-tick"
                style={{ left: i * zoom }}
              >
                <span>{i}s</span>
              </div>
            ))}
          </div>

          {/* TRACKS */}
          <div className="vp-tl-tracks">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="vp-tl-track"
                style={{ height: track.height }}
                onClick={() => {
                  /* click track background */
                }}
              >
                <div className="vp-tl-tracklabel" style={{ background: track.color + "22", borderColor: track.color }}>
                  <div className="vp-tl-trackname">{track.name}</div>
                  <div className="vp-tl-trackkind">{track.kind}</div>
                </div>
                <div className="vp-tl-trackarea">
                  {clips
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
                          onMouseDown={(e) => onClipMouseDown(c.id, e)}
                        >
                          <div className="vp-clip-name">{m?.name || c.id}</div>
                          {c.autoTerminated && (
                            <div className="vp-clip-badge">✂️</div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* PLAYHEAD */}
            <div
              className="vp-playhead"
              style={{ left: playhead * zoom }}
            />
          </div>
        </div>
      </section>

      {/* TOAST */}
      {toast && <div className="vp-toast">{toast}</div>}

      {/* STYLE */}
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
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: linear-gradient(180deg, #111118, #0a0a0f);
          border-bottom: 1px solid #1f1f2a;
          position: sticky;
          top: 0;
          z-index: 10;
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
        .vp-topbar-right { display: flex; gap: 8px; align-items: center; }
        .vp-pill {
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid #2a2a3a;
          background: #15151f;
          color: #e5e7eb;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .vp-pill.on { background: #1d4ed8; border-color: #3b82f6; }
        .vp-pill.ghost { background: transparent; }
        .vp-cta {
          padding: 7px 14px;
          border-radius: 999px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          border: none;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }
        .vp-main {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          padding: 12px;
        }
        @media (min-width: 768px) {
          .vp-main { grid-template-columns: 1.4fr 1fr; }
        }
        .vp-preview {
          background: #0f0f17;
          border: 1px solid #1f1f2a;
          border-radius: 14px;
          padding: 12px;
        }
        .vp-preview-frame {
          aspect-ratio: 16/9;
          background: #000;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .vp-preview-placeholder {
          text-align: center;
          color: #6b7280;
        }
        .vp-preview-label { font-size: 24px; font-weight: 800; color: #9ca3af; }
        .vp-preview-time { font-size: 13px; margin-top: 4px; font-family: monospace; }
        .vp-preview-clipname { font-size: 11px; margin-top: 4px; color: #6366f1; }
        .vp-preview-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          justify-content: center;
        }
        .vp-iconbtn {
          width: 40px; height: 40px;
          border-radius: 10px;
          border: 1px solid #2a2a3a;
          background: #15151f;
          color: #e5e7eb;
          font-size: 14px;
          cursor: pointer;
        }
        .vp-iconbtn.primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: #6366f1;
        }
        .vp-time-readout {
          font-family: monospace;
          font-size: 14px;
          margin-left: 8px;
          color: #10b981;
        }
        .vp-inspector {
          background: #0f0f17;
          border: 1px solid #1f1f2a;
          border-radius: 14px;
          padding: 12px;
        }
        .vp-section-title {
          font-size: 11px;
          font-weight: 700;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 8px 0;
        }
        .vp-prop-grid { display: flex; flex-direction: column; gap: 6px; }
        .vp-prop-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 10px;
          background: #15151f;
          border-radius: 8px;
          font-size: 12px;
        }
        .vp-prop-row input {
          background: #0a0a0f;
          border: 1px solid #2a2a3a;
          color: #e5e7eb;
          padding: 4px 6px;
          border-radius: 6px;
          width: 80px;
          font-size: 12px;
          text-align: right;
        }
        .vp-prop-actions { margin-top: 6px; }
        .vp-mini {
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #2a2a3a;
          background: #15151f;
          color: #e5e7eb;
          font-size: 11px;
          cursor: pointer;
          font-weight: 600;
        }
        .vp-mini.danger { background: #7f1d1d; border-color: #ef4444; }
        .vp-empty { color: #6b7280; font-size: 12px; padding: 20px; text-align: center; }
        .vp-media-list { display: flex; flex-direction: column; gap: 6px; }
        .vp-media-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: #15151f;
          border-radius: 8px;
        }
        .vp-media-icon { font-size: 20px; }
        .vp-media-info { flex: 1; }
        .vp-media-name { font-size: 12px; font-weight: 600; }
        .vp-media-dur { font-size: 10px; color: #9ca3af; }
        .vp-timeline {
          background: #0f0f17;
          border: 1px solid #1f1f2a;
          border-radius: 14px;
          margin: 0 12px 12px;
          overflow: hidden;
        }
        .vp-tl-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid #1f1f2a;
        }
        .vp-tl-title { font-size: 13px; font-weight: 700; }
        .vp-tl-tools { display: flex; gap: 6px; align-items: center; }
        .vp-tl-zoom { font-size: 11px; color: #9ca3af; min-width: 50px; text-align: center; }
        .vp-tl-body { overflow-x: auto; }
        .vp-tl-ruler {
          position: relative;
          height: 24px;
          background: #0a0a0f;
          border-bottom: 1px solid #1f1f2a;
        }
        .vp-tl-tick {
          position: absolute;
          top: 0;
          height: 100%;
          border-left: 1px solid #1f1f2a;
          padding-left: 4px;
          font-size: 10px;
          color: #6b7280;
        }
        .vp-tl-tracks { position: relative; }
        .vp-tl-track {
          display: flex;
          border-bottom: 1px solid #1a1a25;
        }
        .vp-tl-tracklabel {
          width: 80px;
          flex-shrink: 0;
          border-right: 1px solid #1f1f2a;
          padding: 4px 8px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-left: 3px solid;
        }
        .vp-tl-trackname { font-size: 11px; font-weight: 700; }
        .vp-tl-trackkind { font-size: 9px; color: #6b7280; text-transform: uppercase; }
        .vp-tl-trackarea {
          position: relative;
          flex: 1;
          min-width: 600px;
        }
        .vp-clip {
          position: absolute;
          top: 4px;
          bottom: 4px;
          border-radius: 6px;
          padding: 4px 6px;
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .vp-clip.selected {
          box-shadow: 0 0 0 2px #fbbf24;
          z-index: 2;
        }
        .vp-clip.auto {
          background-image: linear-gradient(45deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%, transparent);
          background-size: 8px 8px;
        }
        .vp-clip-badge {
          position: absolute;
          top: 2px;
          right: 4px;
          font-size: 10px;
        }
        .vp-playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ef4444;
          pointer-events: none;
          z-index: 3;
        }
        .vp-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #15151f;
          border: 1px solid #2a2a3a;
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 12px;
          color: #e5e7eb;
          z-index: 100;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// KOMPONEN KECIL: Property Row
// =====================================================================

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
