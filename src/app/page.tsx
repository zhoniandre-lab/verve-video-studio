"use client";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { renderSlideshow, downloadBlob, vidPlan, vidLoopPrev } from "@/lib/recorder";
import { transcribeBlobBesar, ccDiagMulai, ccDiag, ccDiagBaca } from "@/lib/audiocc";
import { renderGif } from "@/lib/gif";
import { makeAutoThumbBlob } from "@/lib/thumb";
import { avWarm, avPut } from "@/lib/avault";
import { getAudioPeaks, estimateBeats } from "@/lib/waveform";
import SpectrumStudio from "./spectrum-studio";
import LahanStudio from "./lahan-studio";
import Ngomong from "@/lib/ngomong"; // 🎤🧠 v14.5 SUARA PAHAM
import {
  TRANSITIONS, ANIM_IN, ANIM_OUT, ANIM_LOOP, EFFECTS, FILTERS, TEXT_FONTS, TEXT_ANIMS,
  TEXT_TEMPLATES, TEXT_COLORS, STICKER_CATS, ANIM_STICKERS, STICKER_ANIM_CATS,
  ADJUST_DEFS, DEFAULT_ADJUST, DEFAULT_TEXT, buildClipFilter, canonicalTrans, effDur,
  buildTimeline, locate, paintClips, paintClipText, CC_TEMPLATES, paintPreviewCaptions,
  ensureFontsLoaded, setDrawBg, paintFloatingTexts, paintTextSelectBox, paintFloatingStickers, paintStickerSelectBox, allClipTexts,
} from "@/lib/editing";
import type { SlideOpt, ClipText, AdjustState, Timeline, CapWord, StickerItem } from "@/lib/editing";

/* =====================================================================
   VERVE v6 — Studio Video & Musik AI (100% kode & aset orisinal)
   Layar: Dashboard (Edit/Template/Lab AI/Proyek/Saya) → Editor studio
   lengkap (timeline, per-klip edit, auto caption, stiker animasi, ekspor
   resolusi kustom) + Spectrum Studio (modul terpisah).
   ===================================================================== */

interface Slide { id: string; imageUrl: string; videoUrl?: string; } // 🎬 v11.8: klip video AI opsional (Animasi Studio lewat chat Sutradara)
interface Draft0 { id: string; title: string; slides: number; updatedAt: number; thumb?: string; }
type ScreenId = "home" | "template" | "lab" | "proyek" | "saya" | "editor" | "spectrum" | "editfoto" | "transkrip" | "lahan";

const DRAFTS_KEY = "verve_drafts_v1";
const SESSION_KEY = "verve_session_v6";
const SUNO_TASK_KEY = "verve_suno_task_v1";
const MAX_DRAFTS = 12;

/* ---------------- helpers ---------------- */
function uid(p = "s"): string { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function formatDur(s: number): string { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; }

/* ================= KETERANGAN DARI LIRIK LAGU (v8.2) ================= */
const CC_SOURCES = [
  { id: "musik", lb: "Audio musik" },
  { id: "suara", lb: "Pengisi suara (narasi/rekaman)" },
  { id: "lirik", lb: "🎵 Lirik lagu (dari Lahan/Suno)" },
];
const _r2 = (v: number) => Math.round(v * 100) / 100;

// ===== 🎧 v13.28 SUTRADARA PAHAM LOKAL — deteksi niat "keterangan otomatis" TOLERAN TYPO =====
// Dice bigram antar kata: "ketermgan"~".keterangan"≈0,75 — typo tebal pun tetap paham. Tanpa jaringan/AI.
function gram2(w: string): Set<string> { const g = new Set<string>(); for (let i = 0; i < w.length - 1; i++) g.add(w.slice(i, i + 2)); return g; }
function miripKata(a: string, b: string): number {
  const A = gram2(a); const B = gram2(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((g) => { if (B.has(g)) hit++; });
  return (2 * hit) / (A.size + B.size);
}
function adaKataMirip(kata: string[], target: string[], ambang: number): boolean {
  return kata.some((k) => target.some((t) => miripKata(k, t) >= ambang));
}
/** Niat "buat/pasang keterangan otomatis"? (niat HAPUS sengaja ditolak — beda perkara) */
function mintaKeteranganOtomatis(teks: string): boolean {
  const kata = teks.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!kata.length) return false;
  if (adaKataMirip(kata, ["hapus", "buang", "hilangkan", "bersihkan", "delete", "reset"], 0.62)) return false;
  const objek = adaKataMirip(kata, ["keterangan", "caption", "subtitle", "lirik", "karaoke"], 0.55);
  const aksi = adaKataMirip(kata, ["otomatis", "sinkron", "selaras", "pasang", "buat", "buatkan", "bikinkan", "nyalakan", "jadi", "gas"], 0.58);
  return objek && aksi;
}
const normTok = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
interface LyricLine { text: string; words: string[]; pause: number }
interface LineSpan { start: number; end: number; kws: { w: string; start: number; end: number }[] }

/** Pecah lirik jadi baris nyanyian; baris [Verse]/[Chorus]/kosong dicatat sebagai JEDA (bukan dinyanyikan). */
function parseLyricLines(src: string): LyricLine[] {
  const out: LyricLine[] = [];
  let pause = 0;
  for (const raw of src.split(/\r?\n/)) {
    let r = raw.trim();
    if (!r) { pause += 0.25; continue; }
    if (/^\[[^\]]+\]$/.test(r)) { pause += 0.35; continue; }
    r = r.replace(/\[[^\]]*\]/g, "").trim();
    if (!r) continue;
    const words = r.split(/\s+/).filter(Boolean);
    out.push({ text: r, words, pause });
    pause = 0;
  }
  return out;
}

/** Selaraskan baris lirik ke kata-kata hasil Whisper (jalan pintas monoton + isi celah proporsional). */
function alignWordsToLines(lines: LyricLine[], aiWords: { w: string; start: number; end: number }[], dur: number): LineSpan[] | null {
  const AW = aiWords.filter(w => w.w && isFinite(w.start) && isFinite(w.end) && w.end >= w.start);
  if (AW.length < 3) return null;
  const nw = AW.map(w => normTok(w.w));
  const ln = lines.map(L => L.words.map(normTok));
  const N = lines.length;
  const spans: (LineSpan | null)[] = new Array(N).fill(null);
  let wi = 0;
  for (let i = 0; i < N; i++) {
    const n = lines[i].words.length || 1;
    let best = -1, bestScore = 0;
    const maxShift = Math.min(wi + 10, Math.max(wi, nw.length - n));
    for (let s = wi; s <= maxShift; s++) {
      let m = 0;
      for (let k = 0; k < n; k++) if (nw[s + k] === ln[i][k]) m++;
      const sc = m / n;
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (best >= 0 && bestScore >= 0.34 && best + n <= AW.length) {
      const span = AW.slice(best, best + n);
      const st = span[0].start;
      const en = Math.max(...span.map(w => w.end));
      if (en - st > 25) continue; // span ngaco, biarkan null lalu diisi interpolasi
      spans[i] = { start: st, end: Math.max(en, st + 0.4), kws: span.map(w => ({ w: w.w, start: w.start, end: w.end })) };
      wi = best + n;
    }
  }
  const good = spans.filter(Boolean).length;
  if (good < Math.max(2, Math.floor(N * 0.5))) return null; // AI melantur — mending perkiraan penuh
  // Isi baris kosong (tak ketemu) proporsional di antara anchor
  let i = 0;
  while (i < N) {
    if (spans[i]) { i++; continue; }
    let j = i; while (j < N && !spans[j]) j++;
    const t0 = i > 0 ? (spans[i - 1] as LineSpan).end : Math.min(1.0, dur * 0.02);
    const t1 = j < N ? (spans[j] as LineSpan).start : Math.max(t0 + 1, dur - 0.6);
    const gs = lines.slice(i, j);
    const tot = gs.reduce((a, L) => a + L.text.length, 0) || 1;
    let cur = t0;
    gs.forEach((L, k) => {
      const span = Math.max(0.6, (L.text.length / tot) * (t1 - t0));
      const en = Math.min(t1, cur + span);
      const wchars = L.words.reduce((a, w) => a + w.length, 0) || 1;
      let wc = cur;
      const kws = L.words.map(w => { const wd = (w.length / wchars) * (en - cur); const o = { w, start: wc, end: wc + wd }; wc += wd; return o; });
      spans[i + k] = { start: cur, end: en, kws };
      cur = en;
    });
    i = j;
  }
  // Rapikan: monoton, dalam durasi, kata di dalam baris
  let prev = 0;
  for (const s of spans as LineSpan[]) {
    s.start = Math.max(prev - 0.2, Math.min(s.start, dur - 0.4));
    s.end = Math.max(s.start + 0.5, Math.min(s.end, dur));
    prev = s.end;
    s.kws.forEach(k => {
      k.start = Math.max(s.start, Math.min(k.start, s.end));
      k.end = Math.max(k.start + 0.06, Math.min(k.end, s.end));
    });
  }
  return spans as LineSpan[];
}

/** Perkiraan cerdas tanpa AI: bobot huruf + jeda antar bait. */
function estimateLyricLines(lines: LyricLine[], dur: number): LineSpan[] {
  const lead = Math.min(1.2, dur * 0.03), tail = 0.8;
  const avail = Math.max(3, dur - lead - tail);
  const totW = lines.reduce((a, L) => a + L.text.length + L.pause * 30, 0) || 1;
  let cur = lead;
  return lines.map(L => {
    const span = Math.max(0.8, ((L.text.length + L.pause * 30) / totW) * avail);
    const en = Math.min(dur - 0.3, cur + span);
    const wchars = L.words.reduce((a, w) => a + w.length, 0) || 1;
    let wc = cur;
    const kws = L.words.map(w => { const wd = (w.length / wchars) * (en - cur); const o = { w, start: wc, end: wc + wd }; wc += wd; return o; });
    const o = { start: cur, end: en, kws };
    cur = en;
    return o;
  });
}

/** Gaya dasar teks karaoke lirik sesuai template keterangan. */
function lyricTextStyle(ccTpl: string, ccSize: number, ccY: number) {
  const kara: Record<string, string> = { standar: "#ffd93d", karaoke: "#fde047", tebal: "#ffd93d", neon: "#ec4899", pop: "#fde047", gradien: "#22d3ee" };
  return {
    font: "sistem", size: ccSize, color: "#ffffff", bold: true, italic: false,
    shadow: true, stroke: true, strokeColor: "#000000", strokeW: 5,
    bg: true, bgColor: "rgba(0,0,0,0.45)", y: ccY, align: "center", anim: "none",
    karaokeColor: kara[ccTpl] || "#ffd93d",
  };
}
function clampN(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }
function proxifyAudioUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    // 🩹 v13.0 GERBANG AMAN: SEMUA host http(s) lewat proxy same-origin — lotre whitelist tamat,
    // link lagu FRESH dari provider mana pun tak pernah lagi keblok CORS di preview & render.
    return `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}
function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, samples = buf.length;
  const blockAlign = numCh * 2, dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize); const v = new DataView(out);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44; const ch: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) ch.push(buf.getChannelData(c));
  for (let i = 0; i < samples; i++) for (let c = 0; c < numCh; c++) {
    const s = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return out;
}
function useIsMobile(): boolean {
  const [m, setM] = useState(true);
  useEffect(() => {
    const chk = () => setM(window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    chk(); window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);
  return m;
}
function dateLabel(ts: number): string {
  const d = new Date(ts); const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}
async function copyTxt(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

/* ==================================================================
   SHELL APLIKASI
   ================================================================== */
export default function Page() {
  const [screen, setScreen] = useState<ScreenId>("home");
  const [drafts, setDrafts] = useState<Draft0[]>([]);
  const [openDraft, setOpenDraft] = useState<string>("");
  const [editorCmd, setEditorCmd] = useState<{ tool?: string; newProject?: number; applyAdjust?: number }>({});

  const refreshDrafts = useCallback(() => {
    try {
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
      setDrafts((Array.isArray(arr) ? arr : []).map((d: any) => ({ id: d.id, title: d.title || "Draft", slides: Array.isArray(d.slides) ? d.slides.length : 0, updatedAt: d.updatedAt || 0, thumb: d.thumb || "" })).sort((a: Draft0, b: Draft0) => b.updatedAt - a.updatedAt));
    } catch { setDrafts([]); }
  }, []);
  useEffect(() => { refreshDrafts(); }, [refreshDrafts, screen]);

  function gotoEditor(draftId?: string, cmd?: { tool?: string; newProject?: number; applyAdjust?: number }) {
    setOpenDraft(draftId || "");
    setEditorCmd(cmd || (draftId ? {} : { newProject: Date.now() }));
    setScreen("editor");
  }

  const inSub = screen === "editor" || screen === "spectrum" || screen === "editfoto" || screen === "transkrip" || screen === "lahan";
  return (
    <div className="v6-root">
      <div className="v6-app">
        {screen === "home" && <HomeDash drafts={drafts} go={setScreen} gotoEditor={gotoEditor} />}
        {screen === "template" && <TemplatePage gotoEditor={gotoEditor} />}
        {screen === "lab" && <LabPage gotoEditor={gotoEditor} go={setScreen} />}
        {screen === "proyek" && <ProyekPage drafts={drafts} gotoEditor={gotoEditor} refresh={refreshDrafts} go={setScreen} />}
        {screen === "saya" && <SayaPage refresh={refreshDrafts} />}
        {screen === "editor" && <EditorScreen onExit={() => { setScreen("home"); }} openDraftId={openDraft} cmd={editorCmd} onSaved={refreshDrafts} />}
        {screen === "spectrum" && <SpectrumStudio onExit={() => setScreen("home")} />}
        {screen === "lahan" && <LahanStudio onExit={() => setScreen("home")} gotoEditor={gotoEditor} />}
        {screen === "editfoto" && <EditFotoPage onExit={() => setScreen("home")} />}
        {screen === "transkrip" && <TranskripPage onExit={() => setScreen("home")} />}
        {!inSub && (
          <nav className="v6-nav">
            {([
              ["home", "✂️", "Edit"],
              ["template", "▦", "Template"],
              ["lab", "🧬", "Lab AI"],
              ["proyek", "📁", "Proyek"],
              ["saya", "👤", "Saya"],
            ] as [ScreenId, string, string][]).map(([id, ic, lb]) => (
              <button key={id} className={screen === id ? "on" : ""} onClick={() => setScreen(id)}>{ic}<span>{lb}</span></button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   DASHBOARD / HOME
   ================================================================== */
function HomeDash({ drafts, go, gotoEditor }: { drafts: Draft0[]; go: (s: ScreenId) => void; gotoEditor: (id?: string, cmd?: any) => void }) {
  const tools: { ic: string; lb: string; bb?: string; act: () => void }[] = [
    { ic: "⚡", lb: "AutoCut", act: () => gotoEditor(undefined, { tool: "media", newProject: Date.now() }) },
    { ic: "🪄", lb: "Retouch", act: () => gotoEditor(undefined, { tool: "filter", applyAdjust: Date.now() }) },
    { ic: "🧠", lb: "Pembuat AI", bb: "AI", act: () => gotoEditor(undefined, { tool: "wizard", newProject: Date.now() }) },
    { ic: "🖼️", lb: "Alat foto", act: () => go("editfoto") },
    { ic: "📷", lb: "Ambil gambar & rekam", act: () => gotoEditor(undefined, { tool: "kamera", newProject: Date.now() }) },
    { ic: "✨", lb: "Sempurnakan otomatis", act: () => gotoEditor(undefined, { applyAdjust: Date.now() }) },
    { ic: "💬", lb: "Keterangan", act: () => gotoEditor(undefined, { tool: "keterangan" }) },
    { ic: "🫥", lb: "Hapus latar", act: () => alert("🫥 Hapus latar otomatis butuh layanan khusus — untuk sekarang gunakan stiker/overlay kustom ya bro. Versi ini akan hadir berikutnya!") },
    { ic: "📝", lb: "Transkripsikan", act: () => go("transkrip") },
  ];
  return (
    <div className="v6-body">
      <div className="v6-promo">
        <button className="v6-search-fab" onClick={() => go("lab")}>🔍</button>
        <span className="v6-promo-badge">💎 BARU · Spectrum Studio</span>
        <div className="v6-promo-title">Bikin Video Musik<br />Spectrum + Auto Lirik</div>
        <div className="v6-promo-sub">Ala tools PC, tapi cukup dari HP. Overlay hujan, salju, karaoke lirik, mastering ringan.</div>
        <button className="v6-promo-go" onClick={() => go("spectrum")}>Coba sekarang ›</button>
      </div>

      <div className="v6-promo lh-banner" style={{ marginTop: 10 }}>
        <span className="v6-promo-badge">🌱 BARU · Lahan Awalan</span>
        <div className="v6-promo-title">Cerita Jadi Lagu<br />Niat → Riset → Judul Juara → Visual WAW</div>
        <div className="v6-promo-sub">Otak riset YouTube nyata (bukan ngarang): sudut dari autocomplete, kompetitor dihitung, judul diskor & bisa diaudit. Prompt karakter khusus bikin visual konsisten & cerdas.</div>
        <button className="v6-promo-go" onClick={() => go("lahan")}>Tanam ide sekarang ›</button>
      </div>

      <div className="v6-cards2">
        <button className="v6-bigcard" onClick={() => gotoEditor(undefined, { newProject: Date.now() })}>
          <span className="ic" style={{ background: "var(--v6-teal)", color: "#04211f" }}>＋</span>
          <span className="lb">Video baru</span>
        </button>
        <button className="v6-bigcard" onClick={() => go("editfoto")}>
          <span className="tag">BARU</span>
          <span className="ic">🖼️</span>
          <span className="lb">Edit foto</span>
        </button>
      </div>

      <div className="v6-sec-title">
        <h3>Proyek terakhir</h3>
        {!!drafts.length && <button className="v6-sec-more" onClick={() => go("proyek")}>Semua ›</button>}
      </div>
      <div className="v6-recents">
        {drafts.slice(0, 8).map(d => (
          <div className="v6-recent" key={d.id} onClick={() => gotoEditor(d.id)}>
            <div className="th">
              {d.thumb ? <img src={d.thumb} alt="" /> : <span className="ph">🎬</span>}
              <span className="go">▶</span>
            </div>
            <div className="nm">{d.title}</div>
            <div className="dt">🗂 {dateLabel(d.updatedAt)}</div>
          </div>
        ))}
        {!drafts.length && (
          <div className="v6-recent" onClick={() => gotoEditor(undefined, { newProject: Date.now() })}>
            <div className="th"><span className="ph">＋</span></div>
            <div className="nm">Buat proyek pertamamu</div>
          </div>
        )}
        {!!drafts.length && <button className="chev" onClick={() => go("proyek")}>›</button>}
      </div>

      <div className="v6-sec-title"><h3>Semua alat</h3></div>
      <div className="v6-tools">
        {tools.map(t => (
          <button className="v6-tool" key={t.lb} onClick={t.act}>
            <span className="ic">{t.ic}</span>
            <span className="lb">{t.lb}</span>
            {t.bb && <span className="bb">{t.bb}</span>}
          </button>
        ))}
      </div>

      <button className="v6-banner-spec" onClick={() => go("spectrum")}>
        <div className="ttl">SPECTRUM STUDIO</div>
        <div className="sub">Musik → video spectrum keren: auto lirik karaoke, overlay suasana, mastering ringan, loop mulus.</div>
        <div className="cta">🎧 Buka Studio ›</div>
        <div className="bars">{[0,1,2,3,4,5,6].map(i => <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />)}</div>
      </button>
    </div>
  );
}

/* ==================================================================
   TEMPLATE (kerangka siap pakai — orisinal)
   ================================================================== */
const TEMPLATE_PRESETS = [
  { id: "sedih", icon: "🥀", name: "Klip Sedih Sinematik", desc: "9:16 · transisi lembut · vignette · cap karaoke kuning", cfg: { ratio: "9:16", transition: "fadeblack", transitionDur: 0.7, adj: { ...DEFAULT_ADJUST, vig: 90, fade: 18 }, caption: "karaoke" } },
  { id: "energi", icon: "⚡", name: "Shorts Energi", desc: "9:16 · denyut · denyar beat · teks pop", cfg: { ratio: "9:16", transition: "glitch", transitionDur: 0.35, adj: { ...DEFAULT_ADJUST, vig: 40 }, effect: "pulse", caption: "pop" } },
  { id: "asmr", icon: "🌧️", name: "Suasana Hujan Santai", desc: "16:9 · hujan + kabut · fade lambat", cfg: { ratio: "16:9", transition: "dissolve", transitionDur: 1.2, adj: { ...DEFAULT_ADJUST, b: -8 }, effect: "hujan", caption: "boldwhite" } },
  { id: "cerita", icon: "📖", name: "Storytelling Narasi", desc: "16:9 · zoom pelan · caption standar", cfg: { ratio: "16:9", transition: "zoomin", transitionDur: 0.8, adj: { ...DEFAULT_ADJUST }, loop: "zoompelan", caption: "capcut" } },
  { id: "motivasi", icon: "💬", name: "Quotes Motivasi", desc: "9:16 · dissolve lembut · caption neon", cfg: { ratio: "9:16", transition: "dissolve", transitionDur: 0.5, adj: { ...DEFAULT_ADJUST, c: 18, vig: 55 }, caption: "neon" } },
  { id: "produk", icon: "🛍️", name: "Jualan Produk", desc: "1:1 · wipe kiri · warna pop · caption gradasi", cfg: { ratio: "1:1", transition: "wipe-l", transitionDur: 0.45, adj: { ...DEFAULT_ADJUST, s: 15, c: 10 }, caption: "gradient" } },
  { id: "vlog", icon: "🚶", name: "Vlog Harian", desc: "16:9 · mix halus · caption putih tebal", cfg: { ratio: "16:9", transition: "dissolve", transitionDur: 0.5, adj: { ...DEFAULT_ADJUST, b: 4 }, loop: "zoompelan", caption: "boldwhite" } },
  { id: "game", icon: "🎮", name: "Gaming Hype", desc: "9:16 · glitch cepat · caption pop", cfg: { ratio: "9:16", transition: "glitch", transitionDur: 0.3, adj: { ...DEFAULT_ADJUST, c: 12, s: 8 }, caption: "pop" } },
];
function TemplatePage({ gotoEditor }: { gotoEditor: (id?: string, cmd?: any) => void }) {
  const [cat, setCat] = useState("semua");
  const CHIPS = [
    { id: "semua", label: "Untuk kamu" }, { id: "9:16", label: "Reel/Shorts" },
    { id: "16:9", label: "Cerita/Vlog" }, { id: "1:1", label: "Feed" },
  ];
  const list = TEMPLATE_PRESETS.filter(t => cat === "semua" || t.cfg.ratio === cat);
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Template</h2><span style={{ fontSize: 11, opacity: .5 }}>resep siap pakai</span></div>
      <div className="v6-chips">{CHIPS.map(c => <button key={c.id} className={`v6-chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
      <div className="v6-proj-grid">
        {list.map(t => (
          <div className="v6-proj" key={t.id} onClick={() => gotoEditor(undefined, { newProject: Date.now(), preset: { ...t.cfg, name: t.name } } as any)}>
            <div className="th" style={{ background: "linear-gradient(145deg,#1c1c26,#101016)", fontSize: 42 }}>{t.icon}</div>
            <div className="inf">
              <div className="nm">{t.name}</div>
              <div className="st"><span>{t.desc}</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="v6-empty">
        <div className="big">🚧</div>
        Galeri template komunitas <b>segera hadir</b> — kerangkanya sudah disiapkan.<br />Delapan resep di atas langsung bisa dipakai: tap → proyek baru auto-terkonfigurasi.
      </div>
    </div>
  );
}

/* ==================================================================
   LAB AI
   ================================================================== */
function LabPage({ gotoEditor, go }: { gotoEditor: (id?: string, cmd?: any) => void; go: (s: ScreenId) => void }) {
  const cards = [
    { ic: "🧠", t: "Pembuat AI", d: "Ide → judul → visual → musik otomatis jadi proyek", act: () => gotoEditor(undefined, { tool: "wizard", newProject: Date.now() }) },
    { ic: "🎵", t: "Musik AI (Suno)", d: "Buat lagu/instrumen orisinal bebas royalti", act: () => gotoEditor(undefined, { tool: "musik" }) },
    { ic: "🗣️", t: "Teks ke Audio", d: "Narasi suara AI dari teks (id-ID)", act: () => gotoEditor(undefined, { tool: "tts" }) },
    { ic: "🎨", t: "Gambar AI", d: "Generate visual sinematik utk klip", act: () => gotoEditor(undefined, { tool: "media" }) },
    { ic: "🎬", t: "Video AI", d: "Teks/gambar → video pendek (beta)", act: () => gotoEditor(undefined, { tool: "videoai" }) },
    { ic: "🎧", t: "Spectrum Studio", d: "Video spectrum musik + auto lirik", act: () => go("spectrum") },
    { ic: "💬", t: "Keterangan Otomatis", d: "Caption nyala mengikuti suara", act: () => gotoEditor(undefined, { tool: "keterangan" }) },
    { ic: "📝", t: "Transkripsikan", d: "Audio/video → teks (eksperimen)", act: () => go("transkrip") },
  ];
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Lab AI</h2></div>
      <div className="v6-proj-grid">
        {cards.map(c => (
          <div className="v6-proj" key={c.t} onClick={c.act}>
            <div className="th" style={{ background: "linear-gradient(145deg,#1c1c26,#101016)", fontSize: 40 }}>{c.ic}</div>
            <div className="inf"><div className="nm">{c.t}</div><div className="st"><span>{c.d}</span></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================
   PROYEK
   ================================================================== */
/* 📼🔒 v13.6 BRANKAS RENDER — hasil render otomatis DISALIN ke IndexedDB di HP (bertahan Chrome ditutup).
   Sebelumnya hasil render hidup di RAM tab: pembuat keluar sebentar sebelum download → hilang selamanya. */
const VAULT_DB = "verve_render_vault", VAULT_STORE = "renders", VAULT_MAX = 2;
type VaultItem = { id: string; at: number; name: string; size: number; blob: Blob };
function vaultOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(VAULT_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(VAULT_STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function vaultList(): Promise<VaultItem[]> {
  try {
    const db = await vaultOpen();
    return await new Promise<VaultItem[]>((res) => {
      const out: VaultItem[] = [];
      const c = db.transaction(VAULT_STORE).objectStore(VAULT_STORE).openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value as VaultItem); cur.continue(); } else res(out.sort((a, b) => b.at - a.at)); };
      c.onerror = () => res([]);
    });
  } catch { return []; }
}
async function vaultSave(blob: Blob, name: string): Promise<void> {
  if (!blob || blob.size < 100_000 || blob.size > 900 * 1048576) return; // batas jujur: di luar ini jangan disimpan
  try {
    const db = await vaultOpen();
    const item: VaultItem = { id: "r" + Date.now(), at: Date.now(), name, size: blob.size, blob };
    await new Promise<void>((res, rej) => { const tx = db.transaction(VAULT_STORE, "readwrite"); tx.objectStore(VAULT_STORE).put(item); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const all = await vaultList();
    for (const old of all.slice(VAULT_MAX)) await new Promise<void>((res) => { const tx = db.transaction(VAULT_STORE, "readwrite"); tx.objectStore(VAULT_STORE).delete(old.id); tx.oncomplete = () => res(); });
  } catch { /* kuota penuh / IDB tak tersedia → render & download manual tetap jalan normal */ }
}
async function vaultDelete(id: string): Promise<void> {
  try { const db = await vaultOpen(); await new Promise<void>((res) => { const tx = db.transaction(VAULT_STORE, "readwrite"); tx.objectStore(VAULT_STORE).delete(id); tx.oncomplete = () => res(); }); } catch {}
}

function ProyekPage({ drafts, gotoEditor, refresh, go }: { drafts: Draft0[]; gotoEditor: (id?: string) => void; refresh: () => void; go: (s: ScreenId) => void }) {
  const [vault, setVault] = useState<VaultItem[]>([]);
  useEffect(() => { let on = true; vaultList().then((v) => { if (on) setVault(v); }); return () => { on = false; }; }, []);
  function delDraft(id: string) {
    if (!confirm("Hapus proyek ini?")) return;
    try {
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]").filter((d: any) => d.id !== id);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(arr));
      refresh();
    } catch {}
  }
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Proyek</h2>
        <button className="v6-btn" onClick={() => gotoEditor()}>＋ Baru</button>
      </div>
      {!!vault.length && (
        <div style={{ margin: "0 14px 12px", padding: 12, borderRadius: 14, background: "rgba(20,184,166,.08)", border: "1px solid rgba(20,184,166,.35)" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>📼 Hasil render tersimpan di HP</div>
          {vault.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <span style={{ fontSize: 18 }}>🎬</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{it.name}</span>
              <span style={{ fontSize: 11, opacity: .7, whiteSpace: "nowrap" }}>{(it.size / 1048576).toFixed(0)}MB</span>
              <button className="v6-btn" style={{ padding: "6px 10px", fontSize: 12 }} title="Unduh ke HP" onClick={() => downloadBlob(it.blob, it.name)}>⬇️</button>
              <button className="v6-btn" style={{ padding: "6px 10px", fontSize: 12 }} title="Hapus dari brankas" onClick={async () => { await vaultDelete(it.id); setVault(await vaultList()); }}>🗑</button>
            </div>
          ))}
          <div style={{ fontSize: 11, opacity: .65, marginTop: 4 }}>Disalin otomatis begitu render selesai (maks {VAULT_MAX} terbaru) — unduh ke Galeri biar abadi selamanya.</div>
        </div>
      )}
      {!drafts.length && <div className="v6-empty"><div className="big">🎬</div>Belum ada proyek. Buat yang pertama bro!</div>}
      <div className="v6-proj-grid">
        {drafts.map(d => (
          <div className="v6-proj" key={d.id} onClick={() => gotoEditor(d.id)}>
            <div className="th">{d.thumb ? <img src={d.thumb} alt="" /> : <span style={{ fontSize: 34, opacity: .35 }}>🎬</span>}</div>
            <div className="inf">
              <div className="nm">{d.title}</div>
              <div className="st"><span>🎞 {d.slides} · {dateLabel(d.updatedAt)}</span>
                <button onClick={(e) => { e.stopPropagation(); delDraft(d.id); }} style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="v6-banner-spec" onClick={() => go("spectrum")} style={{ width: "calc(100% - 28px)" }}>
        <div className="ttl">SPECTRUM STUDIO</div><div className="sub">Proyek musik spectrum — studio terpisah, khusus konten musik.</div>
        <div className="bars">{[0,1,2,3,4].map(i => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      </button>
    </div>
  );
}

/* ---------- 🏹 PROVIDER VIDEO (BANSOS) ---------- */
type VidProv = { id: string; label: string; base: string; key: string; model: string; aktif: boolean };
const VIDPROV_KEY = "verve_video_providers_v1";
function readVidProvs(): VidProv[] { try { const j = JSON.parse(localStorage.getItem(VIDPROV_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
const vpBtn: any = { fontSize: 11, padding: "4px 8px", background: "none", border: "1px solid #ffffff2a", borderRadius: 6, color: "#cbd5e1", cursor: "pointer", whiteSpace: "nowrap" };

function BansosChatCard() {
  const LS = "verve_bansos_chat_v1";
  const [base, setBase] = useState(""); const [keyC, setKeyC] = useState(""); const [model, setModel] = useState("");
  const [aktif, setAktif] = useState(false);
  useEffect(() => { try { const j = JSON.parse(localStorage.getItem(LS) || "null"); if (j) { setBase(j.base || ""); setKeyC(j.key || ""); setModel(j.model || ""); setAktif(!!(j.base && j.key)); } } catch {} }, []);
  function save() {
    const b = base.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+\..+/.test(b)) { alert("Base URL aneh — contoh benar: https://xxx.com/v1"); return; }
    if (!keyC.trim()) { alert("API key belum diisi bro"); return; }
    try { localStorage.setItem(LS, JSON.stringify({ base: b, key: keyC.trim(), model: model.trim() })); } catch {}
    setAktif(true);
    alert("✅ Bansos chat tersimpan — Sutradara (Studio & wizard) sekarang mencobanya duluan.");
  }
  function clear() {
    try { localStorage.removeItem(LS); } catch {}
    setBase(""); setKeyC(""); setModel(""); setAktif(false);
  }
  return (
    <div style={{ padding: "0 2px", marginTop: 10 }}>
      <div className="v6-lbl">💬 BANSOS CHAT/TEKS {aktif ? "🟢 aktif" : ""} (buat otak Sutradara)</div>
      <div className="v6-note">Punya gateway gaya OpenAI-compatible gratis (base URL + key)? Dipakai <b>duluan</b> buat chat Sutradara di Studio & wizard — yang di menu ini cuma pengaturan, eksekusinya tetap di fitur masing-masing. Model kosong = <b>auto</b>. {aktif ? "" : "Belum diisi = pakai mesin bawaan."}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        <input className="v6-inp" placeholder="Base URL (mis. https://xxx.com/v1)" value={base} onChange={e => setBase(e.target.value)} />
        <input className="v6-inp" placeholder="API key bansos chat" value={keyC} onChange={e => setKeyC(e.target.value)} />
        <input className="v6-inp" placeholder="Model (opsional — mis. gpt-4o-mini; kosong = auto)" value={model} onChange={e => setModel(e.target.value)} />
        <div style={{ display: "flex", gap: 6 }}>
          <button className="v6-btn" style={{ flex: 1 }} onClick={save}>💾 Simpan bansos chat</button>
          {aktif && <button className="v6-btn" style={{ background: "none", border: "1px solid #ffffff2a" }} onClick={clear}>🗑</button>}
        </div>
      </div>
    </div>
  );
}

function VideoProvidersCard() {
  const [list, setList] = useState<VidProv[]>([]);
  const [label, setLabel] = useState(""); const [base, setBase] = useState("");
  const [key2, setKey2] = useState(""); const [model, setModel] = useState("");
  const [info, setInfo] = useState("");
  useEffect(() => { setList(readVidProvs()); }, []);
  const persist = (next: VidProv[]) => { setList(next); try { localStorage.setItem(VIDPROV_KEY, JSON.stringify(next)); } catch {} };
  function add() {
    const b = base.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+\..+/.test(b)) { alert("Base URL aneh — contoh benar: https://api.kie.ai/api/v1 atau https://xxx.com/v1"); return; }
    if (!key2.trim()) { alert("API key belum diisi bro"); return; }
    let host = "provider"; try { host = new URL(b).hostname; } catch {}
    const p: VidProv = { id: "vp" + Date.now().toString(36), label: label.trim() || host, base: b, key: key2.trim(), model: model.trim(), aktif: true };
    persist([...list, p]);
    setLabel(""); setBase(""); setKey2(""); setModel("");
    setInfo(`✅ ${p.label} masuk pasukan! Dicoba PALING AWAL saat kamu minta animasi di Sutradara Studio.`);
  }
  async function cekGratis(p: VidProv) {
    setInfo(`🔍 Nanya katalog ${p.label}… (gratis — tanpa bakar kredit video)`);
    try {
      const r = await fetch("/api/hcnsec/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ probeModels: true, cp: { base: p.base, key: p.key } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
      const vids: string[] = d.video_candidates || [];
      setInfo(vids.length
        ? `✅ ${p.label} nyambung! Kandidat video: ${vids.slice(0, 6).join(" · ")} — total ${d.total ?? "?"} model. Salin salah satu ke kolom Model kalau perlu.`
        : `⚠️ ${p.label} nyambung tapi tak ada nama berbau video. Isi katalog (10 awal): ${(d.models || []).slice(0, 10).join(", ").slice(0, 280) || "kosong"}`);
    } catch (e: any) { setInfo(`❌ ${p.label}: ${e?.message || e}`); }
  }
  return (
    <div style={{ padding: "0 2px", marginTop: 14 }}>
      <div className="v6-lbl">🏹 PROVIDER VIDEO (buruan bansos — bawa key + base URL sendiri)</div>
      <div className="v6-note">Dapat kredit video gratis dari penyedia mana pun (referral/share orang)? Tempel di sini — pasukanmu dicoba <b>paling awal</b> sebelum cadangan lain. Tersimpan <b>hanya di HP kamu</b>.</div>
      {list.map((p) => (
        <div key={p.id} className="v6-cardrow" style={{ cursor: "default", marginTop: 6, padding: "8px 10px" }}>
          <span style={{ fontSize: 16 }}>{p.aktif ? "🟢" : "⚪"}</span>
          <div className="tt" style={{ fontSize: 12, minWidth: 0, flex: 1 }}>
            {p.label}
            <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.base}{p.model ? ` · model: ${p.model}` : ""}</div>
          </div>
          <button style={vpBtn} onClick={() => persist(list.map(x => x.id === p.id ? { ...x, aktif: !x.aktif } : x))}>{p.aktif ? "Matikan" : "Aktifkan"}</button>
          <button style={vpBtn} title="Cek katalog GRATIS (tanpa bakar kredit)" onClick={() => void cekGratis(p)}>🔍</button>
          <button style={vpBtn} onClick={() => { if (confirm(`Hapus ${p.label} dari pasukan?`)) persist(list.filter(x => x.id !== p.id)); }}>🗑</button>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        <input className="v6-inp" placeholder="Nama bebas (mis. BansosBudi)" value={label} onChange={e => setLabel(e.target.value)} />
        <input className="v6-inp" placeholder="Base URL (mis. https://api.kie.ai/api/v1 atau https://xxx.com/v1)" value={base} onChange={e => setBase(e.target.value)} />
        <input className="v6-inp" placeholder="API key dari penyedia" value={key2} onChange={e => setKey2(e.target.value)} />
        <input className="v6-inp" placeholder="Model (opsional — mis. kling/v2-1-standard; kosong = bawaan)" value={model} onChange={e => setModel(e.target.value)} />
        <button className="v6-btn" onClick={add}>➕ Tambah ke pasukan</button>
      </div>
      {!!info && <div className="v6-note" style={{ marginTop: 8 }}>{info}</div>}
      <div className="v6-note" style={{ marginTop: 6 }}>💡 Tombol 🔍 = <b>cek katalog GRATIS</b> (nanya daftar model, tanpa bakar kredit video) — buat mastiin bansos-mu hidup. Kami paham 2 dialek penyedia: gaya <b>openai (/v1)</b> & gaya <b>kie (/api/v1/jobs)</b> — dideteksi otomatis.</div>
    </div>
  );
}

/* ==================================================================
   SAYA
   ================================================================== */
function SayaPage({ refresh }: { refresh: () => void }) {
  const [key, setKey] = useState("");
  const [prov, setProv] = useState("kie");
  useEffect(() => {
    try { setKey(localStorage.getItem("verve_suno_key") || ""); setProv(localStorage.getItem("verve_suno_provider") || "kie"); } catch {}
  }, []);
  function save() {
    try {
      if (key.trim()) { localStorage.setItem("verve_suno_key", key.trim()); localStorage.setItem("verve_suno_provider", prov); alert("✅ API key Suno tersimpan."); }
      else { localStorage.removeItem("verve_suno_key"); localStorage.removeItem("verve_suno_provider"); alert("API key dihapus — mode gratis aktif."); }
    } catch {}
  }
  function wipe() {
    if (!confirm("Hapus SEMUA proyek & data lokal?")) return;
    try { [DRAFTS_KEY, SESSION_KEY, SUNO_TASK_KEY].forEach(k => localStorage.removeItem(k)); refresh(); alert("Bersih! ✨"); } catch {}
  }
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Saya</h2></div>
      <div className="v6-cardrow" style={{ cursor: "default" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,var(--v6-teal),#0e7490)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#04211f" }}>V</div>
        <div className="tt">Kreator VERVE<div style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: 500 }}>Studio video & musik di HP kamu 🚀</div></div>
      </div>
      <div className="v6-cardrow" style={{ cursor: "default", marginTop: 14 }}>
        <span style={{ fontSize: 20 }}>🏦</span>
        <div className="tt" style={{ fontSize: 13 }}>Dompet Bansos AI<div style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: 500 }}>Kredit gratis hasil buruanmu (referral/share orang) ditempel di kartu-kartu bawah ini: 💬 Chat/teks · 🔑 Musik (suno) · 🏹 Video. Semuanya tersimpan HANYA di HP ini, dan sekali masuk langsung jalan di fitur yang cocok. 🖼️ Gambar & 🎙️ Suara: fase berikut ya bro.</div></div>
      </div>
      <BansosChatCard />
      <div style={{ padding: "0 2px", marginTop: 10 }}>
        <div className="v6-lbl">🔑 API KEY SUNO (buat musik AI)</div>
        <input className="v6-inp" placeholder="Tempel API key di sini (kosongkan = mode gratis)" value={key} onChange={e => setKey(e.target.value)} />
        <div className="v6-lbl">PROVIDER</div>
        <select className="v6-inp" value={prov} onChange={e => setProv(e.target.value)}>
          <option value="kie">🥇 Kie.ai (direkomendasikan, gratis 5.000 kredit)</option>
          <option value="apiframe">Apiframe.ai</option>
          <option value="sunor">Sunor.cc</option>
        </select>
        <div className="v6-note">💡 Tanpa key, VERVE pakai generator musik gratis (lebih lambat). Key disimpan <b>hanya di HP kamu</b> (localStorage), tidak dikirim ke mana pun kecuali ke provider musik saat generate.</div>
        <button className="v6-btn" style={{ marginTop: 10, width: "100%" }} onClick={save}>💾 Simpan</button>
      </div>
      <VideoProvidersCard />
      <div className="v6-cardrow" style={{ cursor: "default", marginTop: 14 }}>
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div className="tt" style={{ fontSize: 12 }}>Hak cipta<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Musik dari generator AI (Suno) = orisinal milikmu. Hati-hati saat upload lagu orang lain — risiko klaim hak cipta tetap tanggung jawab pengguna.</div></div>
      </div>
      <div className="v6-cardrow" onClick={wipe}>
        <span style={{ fontSize: 20 }}>🗑</span><div className="tt">Bersihkan semua data lokal</div><span className="arr">›</span>
      </div>
      <div className="v6-cardrow" style={{ cursor: "default" }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div className="tt" style={{ fontSize: 12 }}>VERVE v6 <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>100% kode, desain, & aset orisinal. Dibuat dengan ♥ untuk kreator Indonesia. 🇮🇩</div></div>
      </div>
    </div>
  );
}

/* ==================================================================
   EDITOR SCREEN v6
   ================================================================== */
const MAIN_TOOLS: { id: string; icon: string; label: string; bdg?: string; bdgCls?: string; disabled?: boolean }[] = [
  { id: "edit",    icon: "✂️",  label: "Edit" },
  { id: "audio",   icon: "🎵",  label: "Audio" },
  { id: "teks",    icon: "🔤",  label: "Teks" },
  { id: "efek",    icon: "☆",   label: "Efek" },
  { id: "overlay", icon: "🖼️", label: "Overlay" },
  { id: "keterangan", icon: "💬", label: "Keterangan" },
  { id: "filter",  icon: "🎨",  label: "Filter" },
  { id: "sesuaikan", icon: "🎚️", label: "Sesuaikan" },
  { id: "stiker",  icon: "😀",  label: "Stiker" },
  { id: "media",   icon: "✨",  label: "Hasilkan media", bdg: "AI", bdgCls: "ai" },
  { id: "avatar",  icon: "👤",  label: "Avatar AI", bdg: "PRO", bdgCls: "pro", disabled: true },
  { id: "rasio",   icon: "⬜",  label: "Rasio aspek" },
  { id: "latar",   icon: "▱",   label: "Latar belakang" },
];
const CLIP_TOOLS: { id: string; icon: string; label: string; bdg?: string; bdgCls?: string }[] = [
  { id: "split",   icon: "╫",   label: "Bagi" },
  { id: "animasi", icon: "▷",   label: "Animasi" },
  { id: "efek",    icon: "☆",   label: "Efek" },
  { id: "gambarai", icon: "🖼️", label: "Gambar AI", bdg: "✦", bdgCls: "ai" },
  { id: "hapus",   icon: "▢",   label: "Hapus" },
  { id: "pangkas", icon: "▭",   label: "Pangkas" },
  { id: "dup",     icon: "⧉",   label: "Duplikat" },
  { id: "ganti",   icon: "⇄",   label: "Ganti" },
  { id: "teks",    icon: "🔤",  label: "Teks" },
  { id: "stiker",  icon: "😀",  label: "Stiker" },
  { id: "speed",   icon: "⚡",  label: "Speed" },
  { id: "transisi", icon: "🔀", label: "Transisi" },
  { id: "geserkir", icon: "◀", label: "Kiri" },
  { id: "geserkan", icon: "▶", label: "Kanan" },
];
const AUDIO_MENU: { id: string; icon: string; label: string; bdg?: string }[] = [
  { id: "upload",  icon: "🎵", label: "Suara (upload dari HP)" },
  { id: "rekam",   icon: "🎙️", label: "Rekam" },
  { id: "tts",     icon: "🗣️", label: "Teks ke audio" },
  { id: "ekstrak", icon: "🎬", label: "Ekstrak", bdg: "MP3" },
  { id: "musik",   icon: "✨", label: "Musik AI (Suno)", bdg: "AI" },
  { id: "hakcipta", icon: "🛡", label: "Cek Hak Cipta" },
  { id: "hapusAudio", icon: "🗑", label: "Hapus semua audio" },
];
const RES_STOPS = [480, 720, 1080, 1440, 2160];
const FPS_STOPS = [24, 25, 30, 50, 60];
const MBPS_STOPS = [5, 8, 12, 20, 50];
const IMG_STYLE_PRESETS = [
  { id: "cinematic", label: "🎬 Cinematic" }, { id: "studio", label: "📸 Studio" },
  { id: "epic",      label: "⚔️ Fantasy" },  { id: "anime", label: "🌸 Anime" },
  { id: "cyberpunk", label: "🌃 Cyber" },    { id: "oil",   label: "🎨 Oil" },
  { id: "minimalist",label: "◻️ Minimal" },  { id: "3d",    label: "🧊 3D" },
];
const VOICES: { id: string; name: string; av: string; bg: string }[] = [
  { id: "alloy", name: "Nadia", av: "👩", bg: "#0e7490" },
  { id: "nova", name: "Laras", av: "👩‍🦰", bg: "#7c3aed" },
  { id: "shimmer", name: "Sinta", av: "👱‍♀️", bg: "#be185d" },
  { id: "echo", name: "Dimas", av: "🧑", bg: "#1d4ed8" },
  { id: "onyx", name: "Bara", av: "👨", bg: "#111827" },
  { id: "fable", name: "Pandu", av: "🧔", bg: "#065f46" },
];
const MUSIC_GENRES = ["pop ballad", "slow rock", "dangdut koplo", "akustik", "religi", "trap edm", "lofi", "cinematic epic"];

function EditorScreen({ onExit, openDraftId, cmd, onSaved }: { onExit: () => void; openDraftId: string; cmd: any; onSaved: () => void }) {
  const isMobile = useIsMobile();
  /* ---------- state proyek ---------- */
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideOptsById, setSlideOptsById] = useState<Record<string, SlideOpt>>({});
  const [selId, setSelId] = useState<string>("");
  // 🎬 v11.1 SUTRADARA STUDIO — chat perintah → eksekusi langsung (pushHist = undo resmi)
  const [dirOpen, setDirOpen] = useState(false);
  const [dirLog, setDirLog] = useState<{ me: "me" | "ai" | "sys"; text: string }[]>([]);
  const [dirInp, setDirInp] = useState("");
  const [micLang, setMicLang] = useState(() => { try { return localStorage.getItem("verve_miclang_v1") || "id"; } catch { return "id"; } }); // 🌍 v14.6 INTERNASIONAL
  const [dirBusy, setDirBusy] = useState(false);
  const [dirPending, setDirPending] = useState<{ op: string; slide?: any; instruction?: string }[]>([]);
  const [animBusy, setAnimBusy] = useState(false); // 🎬 v11.8: batch animasi AI sedang jalan
  const animAbortRef = useRef<AbortController | null>(null);
  const animLastRef = useRef<string>(""); // 🎬 v11.9: hasil batch nyata — dibaca Sutradara saat ditanya status
  const dirEndRef = useRef<HTMLDivElement | null>(null);
  // teks yang sedang TERPILIH di layar (muncul bingkai) — digeser 1 jari & di-cubit 2 jari
  // format: "sid" = lapisan utama · "sid::tid" = lapisan tambahan (teks multi-lapis)
  const [selTextSid, setSelTextSidState] = useState<string>("");
  const selTextSidRef = useRef<string>("");
  const setSelTextSid = useCallback((v: string) => { selTextSidRef.current = v; setSelTextSidState(v); }, []);
  // stiker yang sedang TERPILIH di layar (bingkai) — geser 1 jari, cubit = ukuran, putar 2 jari = rotasi
  const [selStik, setSelStikState] = useState<{ sid: string; stid: string } | null>(null);
  const selStikRef = useRef<{ sid: string; stid: string } | null>(null);
  const setSelStik = useCallback((v: { sid: string; stid: string } | null) => { selStikRef.current = v; setSelStikState(v); }, []);
  const [ratio, setRatio] = useState<"16:9" | "9:16" | "1:1">("9:16");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transition, setTransition] = useState("dissolve");
  const [transitionDur, setTransitionDur] = useState(0.6);
  const [bgMode, setBgMode] = useState<"cover" | "blur" | "color">("cover");
  const [bgColor, setBgColor] = useState("#000000");
  /* ---------- audio ---------- */
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [ttsUrl, setTtsUrl] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [voiceUrl, setVoiceUrl] = useState(""); // rekaman
  const [musicDur, setMusicDur] = useState(0); // detik — panel track audio sepanjang durasi asli
  const [ttsDur, setTtsDur] = useState(0);
  const [voiceDur, setVoiceDur] = useState(0);
  const [musicOff, setMusicOff] = useState(0); // detik — posisi mulai audio di timeline (tekan-tahan & geser di track)
  const [ttsOff, setTtsOff] = useState(0);
  const [voiceOff, setVoiceOff] = useState(0);
  const [audMuted, setAudMuted] = useState(false);
  const [musicVol, setMusicVol] = useState(1);        // 0..1.5
  const [voiceVol, setVoiceVol] = useState(1);        // 0..1.5 (tts+rekaman)
  const [musicFadeIn, setMusicFadeIn] = useState(0);  // detik
  const [musicFadeOut, setMusicFadeOut] = useState(0); // detik
  /* ---------- gelombang suara asli (analisis file → bentuk batang di track) ---------- */
  const [musicPeaks, setMusicPeaks] = useState<number[] | null>(null);
  const [ttsPeaks, setTtsPeaks] = useState<number[] | null>(null);
  const [voicePeaks, setVoicePeaks] = useState<number[] | null>(null);
  const [musicBeats, setMusicBeats] = useState<{ bpm: number; beats: number[] } | null>(null);
  /* ---------- gaya global ---------- */
  const [filterPreset, setFilterPreset] = useState("none");
  const [adj, setAdj] = useState<AdjustState>({ ...DEFAULT_ADJUST });
  const [qualitySharp, setQualitySharp] = useState(() => { try { return !!JSON.parse(localStorage.getItem("verve_export_v1") || "{}").s; } catch { return false; } });
  const [presets, setPresets] = useState<{ id: string; name: string; filter: string; adj: AdjustState }[]>([]);
  /* ---------- caption ---------- */
  const [capWords, setCapWords] = useState<CapWord[]>([]);
  const [capStyle, setCapStyle] = useState("capcut");
  const [ccFrom, setCcFrom] = useState("suara"); // suara | musik
  const [ccLang, setCcLang] = useState("id-ID");
  const [ccTpl, setCcTpl] = useState("standar");
  const [ccSize, setCcSize] = useState(0.055);
  const [ccY, setCcY] = useState(0.78);
  /* ---------- judul/proyek ---------- */
  const [projTitle, setProjTitle] = useState("Proyek Tanpa Judul");
  const [niche, setNiche] = useState("");
  const [coverThumb, setCoverThumb] = useState("");
  /* ---------- preview ---------- */
  const [playing, setPlaying] = useState(false);
  const [curT, setCurT] = useState(0);
  const [durT, setDurT] = useState(0);
  const [pipOn, setPipOn] = useState(true);
  const [fullStage, setFullStage] = useState(false);
  /* ---------- UI panels ---------- */
  const [tool, setTool] = useState<string | null>(null);
  const [clipBar, setClipBar] = useState(false);
  // v8.4: susunan jalur track BEBAS & tersimpan permanen (aturan #6 — track bukan denah mati)
  const [laneOrder, setLaneOrder] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem("verve_laneorder_v1") || "[]"); return Array.isArray(v) ? v.filter((x: any) => typeof x === "string") : []; } catch { return []; } });
  const saveLaneOrder = useCallback((o: string[]) => { setLaneOrder(o); try { localStorage.setItem("verve_laneorder_v1", JSON.stringify(o)); } catch {} }, []);
  // v8.6: balok audio pun bebas pindah jalur — pilihannya disimpan permanen juga
  const [audRow, setAudRow] = useState<Record<string, number>>(() => { try { const v = JSON.parse(localStorage.getItem("verve_audrow_v1") || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } });
  const moveAudRow = useCallback((k: string, r: number) => {
    const rr = Math.max(0, Math.round(r));
    setAudRow(prev => { const nx = { ...prev, [k]: rr }; try { localStorage.setItem("verve_audrow_v1", JSON.stringify(nx)); } catch {} return nx; });
    flash("🎵 Audio pindah ke jalur " + (rr + 1));
  }, []);
  const [sheetTab, setSheetTab] = useState("");
  const [modal, setModal] = useState<string | null>(null); // rekam|tts|musik|kamera|wizard|sampul|videoai|ganti|gambarai
  const [loading, setLoading] = useState<string | null>(null);
  const [stageText, setStageText] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  /* ---------- ekspor v6 ---------- */
  const [tlPxs, setTlPxs] = useState(() => { try { return Number(localStorage.getItem("verve_tl_scale")) || 72; } catch { return 72; } }); // v15.2B CapCut-style
  useEffect(() => { try { localStorage.setItem("verve_tl_scale", String(tlPxs)); } catch {} }, [tlPxs]);
  const [exTab, setExTab] = useState<"video" | "gif">("video");
  const [exRes, setExRes] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").r || 1080; } catch { return 1080; } });
  const [exFps, setExFps] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").f || 30; } catch { return 30; } });
  const [exMbps, setExMbps] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").m || 10; } catch { return 10; } });
  const offRef = useRef({ music: 0, tts: 0, voice: 0 });
  useEffect(() => { offRef.current = { music: musicOff, tts: ttsOff, voice: voiceOff }; }, [musicOff, ttsOff, voiceOff]);
  const durAudRef = useRef({ music: 0, tts: 0, voice: 0 });
  useEffect(() => { durAudRef.current = { music: musicDur, tts: ttsDur, voice: voiceDur }; }, [musicDur, ttsDur, voiceDur]);
  // 📏 v13.3 TREK PANJANG MENYEMBUH SENDIRI: durasi audio belum terukur (lagu dari wizard/draft lama) → ukur diam-diam lewat GERBANG AMAN
  useEffect(() => { if (musicUrl && !musicDur) getAudioDuration(musicUrl).then((d) => { if (d > 0.5) setMusicDur(d); }); }, [musicUrl, musicDur]);
  useEffect(() => { if (ttsUrl && !ttsDur) getAudioDuration(ttsUrl).then((d) => { if (d > 0.5) setTtsDur(d); }); }, [ttsUrl, ttsDur]);
  useEffect(() => { if (voiceUrl && !voiceDur) getAudioDuration(voiceUrl).then((d) => { if (d > 0.5) setVoiceDur(d); }); }, [voiceUrl, voiceDur]);
  // 🛟 v13.7.1 BRANKAS LAGU — begitu proyek kebuka, salin byte audio ke brankas SEKARANG selagi link masih segar.
  // (Link AI mati dalam hitungan jam; brankas ini yang menyelamatkan render-render berikutnya.)
  useEffect(() => { if (musicUrl) void avWarm(musicUrl); }, [musicUrl]);
  useEffect(() => { if (ttsUrl) void avWarm(ttsUrl); }, [ttsUrl]);
  useEffect(() => { if (voiceUrl) void avWarm(voiceUrl); }, [voiceUrl]);

  const audioSyncedRef = useRef(0); // ⏱ v13.7 SELARAS — flag penyembuhan sekali jalan (efeknya di bawah deklarasi mTitle)
  // elemen audio yang dikelola jam manual (mode offset) saat preview
  const tlAudRef = useRef<{ a: HTMLAudioElement; off: number; dur: number }[]>([]);
  // ingat pengaturan ekspor terakhir
  useEffect(() => { try { localStorage.setItem("verve_export_v1", JSON.stringify({ r: exRes, f: exFps, m: exMbps, s: qualitySharp ? 1 : 0 })); } catch {} }, [exRes, exFps, exMbps, qualitySharp]);
  /* ---------- suno ---------- */
  const [sunoKey, setSunoKey] = useState("");
  const [sunoProv, setSunoProv] = useState("kie");
  const [mTitle, setMTitle] = useState("");

  /* ⏱ v13.7 SELARAS LAGU — draf kelahiran Lahan yang klipnya kependekan (lagu 4 menit, isi cuma 42 detik)
     disetarakan OTOMATIS tepat SEKALI per proyek. Setelah itu durasi klip = milikmu, diundo pun tidak diusik lagi. */
  useEffect(() => {
    if (audioSyncedRef.current) return;
    if (!musicUrl || !musicDur || musicDur < 8 || slides.length < 2) return;
    if (!(mTitle || niche)) return; // hanya draf dari Lahan — proyek rakitan manual jangan diutak-atik
    const tot = slides.reduce((a, s) => { const o: any = slideOptsById[s.id] || {}; return a + Math.max(0.4, (o.dur ?? slideDuration) / Math.max(0.25, o.speed || 1)); }, 0);
    if (tot <= 0 || tot >= musicDur * 0.8) return;
    const f = Math.min(10, musicDur / tot);
    if (f < 1.05) return;
    audioSyncedRef.current = 1;
    pushHist(); // biar bisa di-Undo kalau kau tak suka
    slides.forEach((s) => { const o: any = slideOptsById[s.id] || {}; const base = Math.max(0.4, o.dur ?? slideDuration); setOpt(s.id, { dur: Math.round(base * f * 100) / 100 } as any); });
    flash(`⏱ ${slides.length} adegan otomatis diselaraskan penuh ke lagu ${formatDur(Math.round(musicDur))} — tinggal poles per klip sesukamu bro`);
    setTimeout(() => { try { persistSnapshot(); } catch {} }, 700);
  }, [musicDur, musicUrl, slides, slideOptsById, slideDuration, mTitle, niche]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mLyrics, setMLyrics] = useState("");
  const [mStyle, setMStyle] = useState("");
  const [mGenre, setMGenre] = useState("pop ballad");
  const [mMood, setMMood] = useState("emotional, menyentuh");
  const [mModel, setMModel] = useState("suno-v5");
  const [mVocal, setMVocal] = useState<"vocal" | "instrumental">("vocal");
  const [mTask, setMTask] = useState("");
  const [mStatus, setMStatus] = useState("");
  /* ---------- tts modal ---------- */
  const [ttsVoice, setTtsVoice] = useState("alloy");
  /* ---------- draft ---------- */
  const [draftId, setDraftId] = useState("");
  /* ---------- refs ---------- */
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const imgsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const vidsRef = useRef<Map<string, HTMLVideoElement>>(new Map()); // 🎬 v11.8
  const vidBufRef = useRef<(HTMLCanvasElement | null)[]>([null, null]); // 🎬 v11.8: 2 buffer (cur + nxt saat transisi)
  const musicEl = useRef<HTMLAudioElement | null>(null);
  const voiceEls = useRef<HTMLAudioElement[]>([]);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const specU8Ref = useRef<Uint8Array<ArrayBuffer> | null>(null); // 🌈 v13.4: buffer frekuensi utk stiker @bars
  const [cineBars, setCineBars] = useState(false); // 🎬 v13.5 LETTERBOX BIOSKOP 2.39:1 — garis hitam atas-bawah, ikut preview & render
  const cineBarsRef = useRef(false);
  const barsRef = useRef<Float32Array>(new Float32Array(48));
  const clockRef = useRef<{ audio: HTMLAudioElement | null; t0: number; base: number; running: boolean }>({ audio: null, t0: 0, base: 0, running: false });
  const slidesRef = useRef(slides); useEffect(() => { slidesRef.current = slides; }, [slides]);
  const curTRef = useRef(0); useEffect(() => { curTRef.current = curT; }, [curT]);
  const durTRef = useRef(0); useEffect(() => { durTRef.current = durT; }, [durT]);
  const optsRef = useRef(slideOptsById); useEffect(() => { optsRef.current = slideOptsById; }, [slideOptsById]);
  const adjRef = useRef(adj); useEffect(() => { adjRef.current = adj; }, [adj]);
  const filterRef = useRef(filterPreset); useEffect(() => { filterRef.current = filterPreset; }, [filterPreset]);
  const ratioRef = useRef(ratio); useEffect(() => { ratioRef.current = ratio; }, [ratio]);
  const bgRef = useRef({ bgMode, bgColor }); useEffect(() => { bgRef.current = { bgMode, bgColor }; }, [bgMode, bgColor]);
  const capRef = useRef(capWords); useEffect(() => { capRef.current = capWords; }, [capWords]);
  const capStyleRef = useRef(capStyle); useEffect(() => { capStyleRef.current = capStyle; }, [capStyle]);
  const ccRef = useRef({ ccSize, ccY }); useEffect(() => { ccRef.current = { ccSize, ccY }; }, [ccSize, ccY]);
  const pipRef = useRef(pipOn); useEffect(() => { pipRef.current = pipOn; }, [pipOn]);
  const musicVolRef = useRef(musicVol); const voiceVolRef = useRef(voiceVol);
  useEffect(() => { musicVolRef.current = musicVol; if (musicEl.current) musicEl.current.volume = Math.min(1, musicVol); }, [musicVol]);
  useEffect(() => { cineBarsRef.current = cineBars; }, [cineBars]); // 🎬 v13.5
  useEffect(() => { voiceVolRef.current = voiceVol; voiceEls.current.forEach(a => { a.volume = Math.min(1, voiceVol); }); }, [voiceVol]);
  const audMutedRef = useRef(audMuted); useEffect(() => {
    audMutedRef.current = audMuted;
    if (musicEl.current) musicEl.current.muted = audMuted;
    voiceEls.current.forEach(a => { a.muted = audMuted; });
  }, [audMuted]);

  /* ---------- HISTORY (undo/redo) ---------- */
  const histRef = useRef<{ stk: string[]; i: number }>({ stk: [], i: -1 });
  const [histTick, setHistTick] = useState(0);
  const snapNow = useCallback(() => JSON.stringify({ s: slides, o: slideOptsById, c: capWords, cs: capStyle }), [slides, slideOptsById, capWords, capStyle]);
  const pushHist = useCallback(() => {
    try {
      const snap = snapNow();
      if (histRef.current.stk[histRef.current.i] === snap) return;
      histRef.current.stk = histRef.current.stk.slice(0, histRef.current.i + 1);
      histRef.current.stk.push(snap);
      if (histRef.current.stk.length > 42) histRef.current.stk.shift();
      histRef.current.i = histRef.current.stk.length - 1;
      setHistTick(v => v + 1);
    } catch {}
  }, [snapNow]);
  const applySnap = useCallback((snap: string) => {
    try {
      const d = JSON.parse(snap);
      setSlides(d.s || []); setSlideOptsById(d.o || {}); setCapWords(d.c || []); setCapStyle(d.cs || "capcut");
      setSelId("");
    } catch {}
  }, []);
  const undo = useCallback(() => { const h = histRef.current; if (h.i > 0) { h.i--; applySnap(h.stk[h.i]); setHistTick(v => v + 1); } }, [applySnap]);
  const redo = useCallback(() => { const h = histRef.current; if (h.i < h.stk.length - 1) { h.i++; applySnap(h.stk[h.i]); setHistTick(v => v + 1); } }, [applySnap]);
  const canUndo = histTick >= 0 && histRef.current.i > 0;
  const canRedo = histRef.current.i >= 0 && histRef.current.i < histRef.current.stk.length - 1;

  /* ---------- TIMELINE ---------- */
  const timeline: Timeline | null = useMemo(() => {
    if (!slides.length) return null;
    const durs = slides.map(s => effDur(slideOptsById[s.id], slideDuration));
    const tdurs = slides.map((s, i) => {
      if (i >= slides.length - 1) return 0;
      const tid = canonicalTrans(slideOptsById[s.id]?.trans ?? transition);
      if (tid === "none") return 0;
      return clampN(slideOptsById[s.id]?.transDur ?? transitionDur, 0.15, durs[i] * 0.9);
    });
    const tids = slides.map(s => canonicalTrans(slideOptsById[s.id]?.trans ?? transition));
    return buildTimeline(durs, tdurs, tids);
  }, [slides, slideOptsById, slideDuration, transitionDur, transition]);
  const timelineRef = useRef<Timeline | null>(null); useEffect(() => { timelineRef.current = timeline; }, [timeline]);
  const clipsTotal = timeline?.total || 0;

  // v8.2.1: pindai teks lirik karaoke (id prefix lyr_) + caption bawaan adegan (MENEMPEL di klip — biang rasa "teks gabung sama lagu")
  const lyrScan = useMemo(() => {
    const list: any[] = [];
    let legacy = 0;
    Object.values(slideOptsById || {}).forEach((o: any) => (o?.texts || []).forEach((t: any) => {
      if (/^lyr_/.test(t?.id || "")) list.push(t);
      else if (t && t.start == null && !(t.karaokeWords?.length) && t.bg === true && typeof t.y === "number" && Math.abs(t.y - 0.84) < 0.02) legacy++;
    }));
    list.sort((a, b) => (a.start || 0) - (b.start || 0));
    return { list, legacy };
  }, [slideOptsById]);
  const [lyrOff, setLyrOff] = useState(0);
  const selIndex = useMemo(() => slides.findIndex(s => s.id === selId), [slides, selId]);
  const selOpt = selId ? slideOptsById[selId] : undefined;

  const lastOptKey = useRef<{ k: string; t: number }>({ k: "", t: 0 });
  const setOpt = useCallback((id: string, patch: Partial<SlideOpt>) => {
    const k = `${id}:${Object.keys(patch).join(",")}`;
    const now = Date.now();
    if (lastOptKey.current.k !== k || now - lastOptKey.current.t > 650) {
      pushHist();
      lastOptKey.current = { k, t: now };
    }
    setSlideOptsById(cur => ({ ...cur, [id]: { ...(cur[id] || {}), ...patch } }));
  }, [pushHist]);
  useEffect(() => { if (selId && !slides.some(s => s.id === selId)) { setSelId(""); setClipBar(false); } }, [slides, selId]);
  // bersihkan seleksi teks kalau klipnya hilang / teksnya dihapus / pindah pilih klip lain (multi-lapis aware)
  useEffect(() => {
    if (!selTextSid) return;
    const ci = selTextSid.indexOf("::");
    const ssid = ci < 0 ? selTextSid : selTextSid.slice(0, ci);
    const stid = ci < 0 ? "" : selTextSid.slice(ci + 2);
    const so = slideOptsById[ssid];
    const alive = slides.some(s => s.id === ssid) && (stid ? (so?.texts || []).some(x => x.id === stid && x.txt?.trim()) : !!so?.text?.txt?.trim());
    if (!alive) setSelTextSid("");
    else if (selId && selId !== ssid) setSelTextSid("");
  }, [slides, slideOptsById, selTextSid, selId, setSelTextSid]);
  // bersihkan seleksi stiker kalau klip/stikernya hilang atau pindah klip — saling eksklusif dgn teks
  useEffect(() => {
    if (!selStik) return;
    const alive = slides.some(s => s.id === selStik.sid) && (slideOptsById[selStik.sid]?.stickers || []).some(x => x.id === selStik.stid);
    if (!alive) setSelStik(null);
    else if (selId && selId !== selStik.sid) setSelStik(null);
  }, [slides, slideOptsById, selStik, selId, setSelStik]);
  useEffect(() => { if (selStik && selTextSid) setSelTextSid(""); }, [selStik]); // eslint-disable-line
  useEffect(() => { if (selTextSid && selStik) setSelStik(null); }, [selTextSid]); // eslint-disable-line
  // 🎬 v12.6 SELEKSI SATU PINTU — ketuk objek lain = objek lama lepas OTOMATIS (rasa CapCut; dulu macet:
  // teks/stiker terpilih lalu ketuk KLIP → bar bawah tetap milik teks/stiker, harus ‹Lepas manual)
  function pilihObjek(kind: "clip" | "teks" | "stiker") {
    if (kind !== "clip") setClipBar(false);
    if (kind !== "teks") setSelTextSid("");
    if (kind !== "stiker") setSelStik(null);
  }
  /* ---------- analisis gelombang suara asli (async — hasil digambar di balok track audio) ---------- */
  const proxify = proxifyAudioUrl;
  useEffect(() => {
    if (!musicUrl) { setMusicPeaks(null); setMusicBeats(null); return; }
    let alive = true;
    getAudioPeaks(proxify(musicUrl), 180).then(pk => { if (alive) setMusicPeaks(pk); });
    estimateBeats(proxify(musicUrl)).then(r => { if (alive) setMusicBeats(r); });
    return () => { alive = false; };
  }, [musicUrl, proxify]);
  useEffect(() => {
    if (!ttsUrl) { setTtsPeaks(null); return; }
    let alive = true;
    getAudioPeaks(proxify(ttsUrl), 180).then(pk => { if (alive) setTtsPeaks(pk); });
    return () => { alive = false; };
  }, [ttsUrl, proxify]);
  useEffect(() => {
    if (!voiceUrl) { setVoicePeaks(null); return; }
    let alive = true;
    getAudioPeaks(proxify(voiceUrl), 180).then(pk => { if (alive) setVoicePeaks(pk); });
    return () => { alive = false; };
  }, [voiceUrl, proxify]);

  /* ---------- PREVIEW (canvas + rAF + audio clock) ---------- */
  const drawFrameRefCb = useRef<(t: number) => void>(() => {});
  function getImage(url: string): HTMLImageElement | null {
    if (!url) return null;
    const c = imgsRef.current.get(url);
    if (c) return c.complete && c.naturalWidth ? c : null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { drawFrameRefCb.current(curTRef.current); } catch {} };
    img.src = url;
    imgsRef.current.set(url, img);
    return img.complete && img.naturalWidth ? img : null;
  }
  // 🎬 v11.8: muat klip video (CORS bersih; sekali gagal → coba proxy same-origin; gagal lagi → mati = gambar still)
  // 📦 v13.15 UNDUH-UTUH PREVIEW dibagi: SATU unduhan per URL dipakai 2 deck sekaligus (irit data & RAM HP);
  // begitu jadi blob lokal, scrub/seek di Studio bebas patah (Android gemar memangkas buffer streaming).
  const vidBlobPRef = useRef<Map<string, Promise<string | null>>>(new Map());
  function vidBlobP(url: string): Promise<string | null> {
    let p = vidBlobPRef.current.get(url);
    if (!p) {
      p = (async () => {
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
          const r = await fetch(url, { signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) return null;
          const b = await r.blob();
          return b.size ? URL.createObjectURL(b) : null;
        } catch { return null; }
      })();
      vidBlobPRef.current.set(url, p);
    }
    return p;
  }
  function queueVidBlob(v: HTMLVideoElement, url: string) {
    const el = v as any;
    if (el.__blobQ || el.__blobOk || el.__dead) return;
    if (!/^https?:/i.test(url)) return;
    el.__blobQ = 1;
    vidBlobP(url).then(ou => {
      if (!ou || el.__dead || el.__blobOk) return;
      try {
        const resume = !v.paused && !v.ended; const pos = v.currentTime; const pb = v.playbackRate || 1;
        v.src = ou; el.__blobOk = 1; // ganti ke blob lokal — posisi & main/tidur dipertahankan
        const back = () => { try { v.currentTime = pos; } catch {} try { v.playbackRate = pb; } catch {} if (resume) v.play().catch(() => {}); };
        if (v.readyState >= 1) back(); else v.addEventListener("loadedmetadata", back, { once: true });
      } catch { /* gagal → streaming asli tetap jalan */ }
    }).catch(() => {});
  }
  // 🎞️ v13.15 DECK KEMBAR per slide (A/B) untuk crossfade loop — kunci: slide.id (2 slide boleh pakai klip sama)
  const decksRef = useRef<Map<string, { url: string; a: HTMLVideoElement; b: HTMLVideoElement }>>(new Map());
  function getDeckPair(id: string, url: string): { a: HTMLVideoElement; b: HTMLVideoElement } {
    let d = decksRef.current.get(id);
    if (d && d.url === url) return d;
    if (d) { try { d.a.pause(); d.b.pause(); } catch {} decksRef.current.delete(id); }
    const mk = () => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
      v.addEventListener("error", () => {
        const el = v as any;
        if (!el.__retried) { el.__retried = 1; v.src = `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`; }
        else el.__dead = true;
      });
      v.src = url; queueVidBlob(v, url);
      return v;
    };
    d = { url, a: mk(), b: mk() };
    decksRef.current.set(id, d);
    return d;
  }
  function getVideo(url: string): HTMLVideoElement | null {
    let v = vidsRef.current.get(url);
    if (v) { if (!(v as any).__dead) queueVidBlob(v, url); return (v as any).__dead ? null : v; }
    v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    v.addEventListener("error", () => {
      const el = v as any;
      if (!el.__retried) { el.__retried = 1; v!.src = `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`; }
      else el.__dead = true;
    });
    v.src = url;
    vidsRef.current.set(url, v);
    queueVidBlob(v, url);
    return v;
  }
  function blitPrevVid(v: HTMLVideoElement, W: number, H: number, slot: number): HTMLCanvasElement | null {
    if (!v.videoWidth) return null;
    const bufs = vidBufRef.current;
    if (!bufs[slot]) bufs[slot] = document.createElement("canvas");
    const c = bufs[slot]!;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ir = v.videoWidth / v.videoHeight, cr = W / H;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (ir > cr) { sw = v.videoHeight * cr; sx = (v.videoWidth - sw) / 2; }
    else { sh = v.videoWidth / cr; sy = (v.videoHeight - sh) / 2; }
    const cx = c.getContext("2d")!;
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; // 🎞️ v13.14: dulu "low" → preview buram
    cx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
    return c;
  }
  type PrevRole = { outD: "a" | "b"; outPos: number; inD: "a" | "b" | null; inPos: number; x: number };
  // 🌀🌉 v13.15/16 LOOP LUMAT + SERAH-TERIMA ANTAR-VIDEO: slide AKTIF & BERIKUTNYA sama-sama deck kembar
  // dengan RATE & POSISI VISUALNYA sendiri (bukan dari 0 @ 1×) → dissolve tak membeku, nol rewind, nol pop.
  function syncPrevDecks(
    prC: { a: HTMLVideoElement; b: HTMLVideoElement } | null, roleC: PrevRole | null, rateC: number,
    prN: { a: HTMLVideoElement; b: HTMLVideoElement } | null, roleN: PrevRole | null, rateN: number,
  ) {
    const running = playingRef.current;
    const setD = (v: HTMLVideoElement | null, td: number, play: boolean, rate: number) => {
      if (!v || (v as any).__dead) return;
      const vd = v.duration || 0;
      const want = td <= 0 ? 0 : (vd > 0.2 && isFinite(vd) ? Math.min(td, Math.max(0, vd - 0.04)) : td);
      try { if (v.loop) v.loop = false; } catch {}
      if (running && play) {
        try { if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate; } catch {}
        if (v.paused || v.ended) { try { v.currentTime = want; } catch {} void v.play().catch(() => {}); }
        else if (Math.abs(v.currentTime - want) > 0.3) { try { v.currentTime = want; } catch {} } // resync terseret buffer
      } else {
        if (!v.paused) v.pause();
        try { if (Math.abs(v.currentTime - want) > 0.08) v.currentTime = want; } catch {}
      }
    };
    const managePair = (pr: { a: HTMLVideoElement; b: HTMLVideoElement }, role: PrevRole, rate: number) => {
      const out = role.outD === "a" ? pr.a : pr.b;
      const par = out === pr.a ? pr.b : pr.a;
      const inn = role.inD ? (role.inD === "a" ? pr.a : pr.b) : null;
      setD(out, role.outPos, true, rate);
      setD(inn || par, inn ? role.inPos : 0, !!inn, rate); // pasangan diparkir di 0, main hanya saat fade
    };
    if (prC && roleC) managePair(prC, roleC, rateC);
    if (prN && roleN) managePair(prN, roleN, rateN);
    const live = new Set<HTMLVideoElement>();
    if (prC) { live.add(prC.a); live.add(prC.b); }
    if (prN) { live.add(prN.a); live.add(prN.b); }
    vidsRef.current.forEach(ov => { if (!live.has(ov) && !ov.paused) ov.pause(); });
    decksRef.current.forEach(dd => { if (!live.has(dd.a) && !dd.a.paused) dd.a.pause(); if (!live.has(dd.b) && !dd.b.paused) dd.b.pause(); });
  }
  const playingRef = useRef(false);
  // getClockT dibuat stabil (ref-based) — jangan tangkap state `playing`/`curT`
  // supaya loop rAF tidak membawa closure basi (bug: proyek tanpa audio macet di 00:00)
  const getClockT = useCallback((): number => {
    const c = clockRef.current;
    if (c.audio) return c.audio.currentTime;
    if (c.running) return c.base + (performance.now() - c.t0) / 1000;
    return curTRef.current;
  }, []);

  const drawFrame = useCallback((t: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext("2d") as CanvasRenderingContext2D | null; if (!ctx) return;
    const sl = slidesRef.current, tl = timelineRef.current;
    const bg = bgRef.current;
    setDrawBg(bg.bgMode, bg.bgColor);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (!sl.length || !tl) {
      // layar kosong
      ctx.fillStyle = "#0a0a0e"; ctx.fillRect(0, 0, W, H);
      return;
    }
    const tt = Math.min(t, Math.max(0, tl.total - 0.001));
    const L = locate(tl, tt);
    const optCur = optsRef.current[sl[L.idx].id] || null;
    const optNxt = sl[L.nextIdx] ? optsRef.current[sl[L.nextIdx].id] : null;
    const cur = getImage(sl[L.idx].imageUrl);
    const nxt = (L.nextIdx !== L.idx && sl[L.nextIdx]) ? getImage(sl[L.nextIdx].imageUrl) : null;
    // 🎬 v11.8 + 🌀🌉 v13.15/16: DECK KEMBAR untuk slide AKTIF & BERIKUTNYA. Isi dihitung dari WAKTU
    // MUNCUL VISUAL (tt − start + transDur sebelum), BUKAN clipT yang dijepit → video lama tak membeku
    // saat dissolve, video baru masuk nyambung (rate & posisi menerus), nol rewind di serah-terima.
    const slNow = sl[L.idx];
    const spdC = (optCur as any)?.spd || 1;
    const pr = slNow.videoUrl ? getDeckPair(slNow.id, slNow.videoUrl!) : null;
    const slNxt = (L.nextIdx !== L.idx && sl[L.nextIdx]) ? sl[L.nextIdx] : null;
    const prN = slNxt?.videoUrl ? getDeckPair(slNxt.id, slNxt.videoUrl!) : null;
    let curDraw: any = cur; let nxtDraw: any = nxt;
    if (pr || prN) {
      const roleOf = (pair: { a: HTMLVideoElement; b: HTMLVideoElement } | null, stVisual: number, slot: number, spd: number): { role: PrevRole; rate: number } => {
        const vd = pair?.a?.duration || 0;
        const ok = !!(pair && vd > 0.2 && isFinite(vd));
        const rate = ok ? vidPlan(0, vd, Math.max(0.5, slot || vd), spd).rate : 1;
        const st = Math.max(0, stVisual) * rate;
        const role: PrevRole = ok
          ? vidLoopPrev(st, vd)
          : { outD: "a", outPos: Math.max(0, Math.min(st, (vd || 1) - 0.06)), inD: null, inPos: 0, x: 0 };
        return { role, rate };
      };
      const RC = pr ? roleOf(pr, tt - (tl.starts[L.idx] || 0) + (L.idx > 0 ? (tl.tdurs[L.idx - 1] || 0) : 0), L.clipDur, spdC) : null;
      const RN = prN ? roleOf(prN, tt - (tl.starts[L.nextIdx] || 0) + (tl.tdurs[L.idx] || 0), tl.durs[L.nextIdx] || 1, (optNxt as any)?.spd || 1) : null;
      syncPrevDecks(pr, RC?.role || null, RC?.rate || 1, prN, RN?.role || null, RN?.rate || 1);
      const liveV = (v: HTMLVideoElement | null) => (v && !(v as any).__dead && v.readyState >= 2 && v.videoWidth) ? v : null;
      if (pr && RC) {
        const out = liveV(RC.role.outD === "a" ? pr.a : pr.b);
        const inn = liveV(RC.role.inD ? (RC.role.inD === "a" ? pr.a : pr.b) : null);
        if (out && blitPrevVid(out, W, H, 0)) {
          const xe = RC.role.x * RC.role.x * (3 - 2 * RC.role.x); // smoothstep — fade makin lembut
          if (inn && xe > 0.004) {
            const bx = blitPrevVid(inn, W, H, 2);
            if (bx) { const c0 = vidBufRef.current[0]!; const cx0 = c0.getContext("2d")!; cx0.save(); cx0.globalAlpha = Math.min(1, xe); cx0.drawImage(bx, 0, 0); cx0.restore(); }
          }
          curDraw = vidBufRef.current[0];
        } else if (inn && blitPrevVid(inn, W, H, 2)) {
          curDraw = vidBufRef.current[2];
        }
      }
      if (prN && RN) { const outN = liveV(RN.role.outD === "a" ? prN.a : prN.b); if (outN) { const b1 = blitPrevVid(outN, W, H, 1); if (b1) nxtDraw = b1; } }
    }
    const gf = buildClipFilter(filterRef.current, adjRef.current);
    // 🎬 v11.4: Ken Burns KERAS per-klip (medan kb) — tanpa itu, perilaku lama (6% halus) utuh
    const kbC = (optCur as any)?.kb as { dir?: string; s?: number } | undefined;
    const progC = L.clipDur > 0 ? Math.min(1, Math.max(0, L.clipT / L.clipDur)) : 0;
    const SkC = Math.min(0.5, Math.max(0.05, kbC?.s || 0.3));
    const panC = kbC?.dir === "l" || kbC?.dir === "r" || kbC?.dir === "u" || kbC?.dir === "d"; // 🎬 v13.3 GESER WAH
    const pe = progC * progC * (3 - 2 * progC); // 🎬 v13.5 FILM EASE — kamera mengerem lembut di akhir, bukan robot linear
    const kbDxC = panC ? (kbC!.dir === "l" ? 1 : kbC!.dir === "r" ? -1 : 0) * SkC * (0.5 - pe) : 0;
    const kbDyC = panC ? (kbC!.dir === "u" ? 1 : kbC!.dir === "d" ? -1 : 0) * SkC * (0.5 - pe) : 0;
    const kb = kbC
      ? (panC ? 1 + SkC : (kbC.dir === "out" ? (1 + SkC) - pe * SkC : 1 + pe * SkC))
      : ((optCur?.loop === "zoompelan" || !optCur?.loop) ? 1 + Math.min(0.06, (tt / Math.max(1, tl.total)) * 0.06) : 1);
    paintClips(ctx, W, H, curDraw, nxtDraw, {
      clipT: L.clipT, clipDur: L.clipDur, inTrans: L.inTrans, transT: L.transT,
      transId: L.inTrans ? canonicalTrans(optCur?.trans ?? "dissolve") : "none",
      optCur: optCur as any, optNxt: optNxt as any,
      globalFilter: gf, absT: tt, isMobile: true, beat: false,
      grain: adjRef.current.grain, kbZoom: kb, kbDx: kbDxC, kbDy: kbDyC,
    } as any);
    // captions
    if (capRef.current.length) paintPreviewCaptions(ctx, W, H, capRef.current, tt, capStyleRef.current, { sizeRatio: ccRef.current.ccSize, yRatio: ccRef.current.ccY });
    // stiker & teks lepas waktu (punya start/dur sendiri — digeser di track)
    let specArr: Uint8Array | undefined; // 🌈 v13.4: stiker @bars minum frekuensi dari analyser yang SUDAH terpasang utk beat
    const wantBars = sl.some((x) => (optsRef.current[x.id]?.stickers || []).some((z: StickerItem) => z.emoji === "@bars" && z.start != null && tt >= z.start && tt < z.start + (z.dur || 3)));
    if (wantBars && analyserRef.current) {
      const an = analyserRef.current;
      if (!specU8Ref.current || specU8Ref.current.length !== an.frequencyBinCount) specU8Ref.current = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(specU8Ref.current);
      specArr = specU8Ref.current;
    }
    paintFloatingStickers(ctx, W, H, sl.map(x => optsRef.current[x.id]), tt, specArr);
    if (cineBarsRef.current) { // 🎬 v13.5 LETTERBOX BIOSKOP — layar lebar instan
      const bh = H * (W >= H ? 0.125 : 0.07);
      ctx.save(); ctx.filter = "none"; ctx.globalAlpha = 1; ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); ctx.restore();
    }
    paintFloatingTexts(ctx, W, H, sl.map(x => optsRef.current[x.id]), tt);
    // bingkai seleksi stiker (preview saja — tidak ikut diekspor)
    const sst = selStikRef.current;
    const sstk = sst ? (optsRef.current[sst.sid]?.stickers || []).find(x => x.id === sst.stid) : null;
    if (sst && sstk) {
      let vis = false;
      if (sstk.start != null) { const dd = sstk.dur && sstk.dur > 0 ? sstk.dur : 3; vis = tt >= sstk.start && tt < sstk.start + dd; }
      else vis = sl[L.idx]?.id === sst.sid;
      if (vis) paintStickerSelectBox(ctx, W, H, sstk);
    }
    // bingkai seleksi teks (preview saja — tidak ikut diekspor) — dukung multi-lapis ("sid::tid")
    const sts = selTextSidRef.current;
    let sct: any = null;
    if (sts) {
      const ci = sts.indexOf("::");
      const ssid = ci < 0 ? sts : sts.slice(0, ci);
      const stid = ci < 0 ? "" : sts.slice(ci + 2);
      const so = optsRef.current[ssid];
      sct = stid ? (so?.texts || []).find((x: any) => x.id === stid) : so?.text;
      if (sct?.txt?.trim() && !(sct.start != null)) { if (sl[L.idx]?.id !== ssid) sct = null; }
    }
    if (sct?.txt?.trim()) {
      let vis = true;
      if (sct.start != null) { const dd = sct.dur && sct.dur > 0 ? sct.dur : 3; vis = tt >= sct.start && tt < sct.start + dd; }
      if (vis) paintTextSelectBox(ctx, W, H, sct);
    }
    // indikator PiP mini style (jam kecil kiri atas — elemen gaya hidup)
    if (pipRef.current && playingRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(8, 8, 54, 18);
      ctx.fillStyle = "#fff"; ctx.font = "700 10px ui-monospace,monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("● REC", 13, 17);
    }
  }, []);

  useEffect(() => { drawFrameRefCb.current = drawFrame; }, [drawFrame]);

  // REPAINT LANGSUNG saat ada edit visual & preview sedang berhenti
  // (tanpa ini, geser gambar/zoom/stiker/filter baru muncul setelah play/seek → terasa "telat & bocor")
  useEffect(() => {
    if (playing) return;
    const id = requestAnimationFrame(() => { try { drawFrameRefCb.current(curTRef.current); } catch {} });
    return () => cancelAnimationFrame(id);
  }, [slideOptsById, slides, filterPreset, adj, qualitySharp, ratio, bgMode, bgColor, capWords, capStyle, ccSize, ccY, playing, selTextSid, selStik]); // eslint-disable-line

  const tick = useCallback(() => {
    // jika master audio selesai tapi klip masih panjang → lanjut jam manual
    const aud0 = clockRef.current.audio;
    if (aud0 && aud0.ended) {
      clockRef.current = { audio: null, t0: performance.now(), base: aud0.duration || 0, running: true };
    }
    const t = getClockT();
    const tl = timelineRef.current;
    const total = tl?.total || 0;
    const aud = clockRef.current.audio;
    const audioDur = aud && isFinite(aud.duration) ? aud.duration : 0;
    // kelola elemen audio ber-offset: hidup saat masuk jendelanya, diam di luar
    let offsetEnd = 0;
    for (const e of tlAudRef.current) {
      const ed = isFinite(e.a.duration) ? e.a.duration : e.dur;
      offsetEnd = Math.max(offsetEnd, isFinite(ed) && ed < 1e8 ? e.off + ed : 0);
      const local = t - e.off;
      const inWin = local >= 0 && (ed >= 1e8 || local < ed);
      try {
        if (inWin && e.a.paused) { e.a.currentTime = local; e.a.play().catch(() => {}); }
        else if (!inWin && !e.a.paused) { e.a.pause(); }
      } catch {}
    }
    const totalAll = Math.max(total, audioDur, offsetEnd);
    setDurT(totalAll);
    if (totalAll > 0 && t >= totalAll - 0.02) { stopPreview(true); setCurT(0); drawFrame(0); return; }
    setCurT(t);
    drawFrame(t);
    rafRef.current = requestAnimationFrame(tick);
  }, [getClockT, drawFrame]); // eslint-disable-line — stopPreview stabil ([]), dipanggil saat runtime

  const stopPreview = useCallback((ended = false) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
    if (clockRef.current.audio) { try { clockRef.current.audio.pause(); } catch {} }
    voiceEls.current.forEach(a => { try { a.pause(); } catch {} });
    voiceEls.current = [];
    clockRef.current.audio = null;
    clockRef.current.running = false;
    tlAudRef.current.forEach(e => { try { e.a.pause(); } catch {} });
    tlAudRef.current = [];
    playingRef.current = false;
    setPlaying(false);
    if (!ended) {/* tetap di posisi */}
  }, []);

  const seekPreview = useCallback((t: number) => {
    const tl = timelineRef.current;
    const total = Math.max(tl?.total || 0, clockRef.current.audio && isFinite(clockRef.current.audio.duration) ? clockRef.current.audio.duration : 0);
    const tt = clampN(t, 0, Math.max(0, total - 0.001));
    if (clockRef.current.audio) try { clockRef.current.audio.currentTime = tt; } catch {}
    voiceEls.current.forEach(a => { try { a.currentTime = tt; } catch {} });
    tlAudRef.current.forEach(e => {
      const local = tt - e.off;
      try {
        e.a.currentTime = Math.max(0, local);
        if (local >= 0 && playingRef.current) e.a.play().catch(() => {});
        else if (local < 0) e.a.pause();
      } catch {}
    });
    clockRef.current.base = tt; clockRef.current.t0 = performance.now();
    setCurT(tt); drawFrame(tt);
  }, [drawFrame]);

  const togglePreview = useCallback(() => {
    if (!slidesRef.current.length) return;
    if (playing) { stopPreview(); return; }
    // buat/reset sumber audio
    let seekTo = curT;
    if (durTRef.current > 0.3 && curT >= durTRef.current - 0.06) { seekTo = 0; setCurT(0); }
    let master: HTMLAudioElement | null = null;
    voiceEls.current = [];
    try {
      if (!actxRef.current) actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      actxRef.current.resume().catch(() => {});
      if (musicUrl) {
        if (!musicEl.current || musicEl.current.src !== proxifyAudioUrl(musicUrl)) {
          musicEl.current = new Audio(proxifyAudioUrl(musicUrl));
          musicEl.current.crossOrigin = "anonymous";
          musicEl.current.onerror = () => { // 🩹 v12.9: link lagu mati di preview → lapor jujur, bukan diem
            if ((window as any).__verveMusiErr === musicUrl) return; (window as any).__verveMusiErr = musicUrl;
            flash("🔗 Lagu tak bisa diputar — LINK lagu kemungkinan KADALUWARSA (hidupnya hitungan jam). Upload ulang MP3 dari HP (Audio → Upload lagu) atau generate ulang lagu, ya bro.");
          };
          // analyser utk beat (dipakai some effects later)
          try {
            const src = actxRef.current.createMediaElementSource(musicEl.current);
            analyserRef.current = actxRef.current.createAnalyser();
            src.connect(analyserRef.current); analyserRef.current.connect(actxRef.current.destination);
          } catch {}
        }
        musicEl.current.muted = audMutedRef.current;
        musicEl.current.volume = Math.min(1, musicVolRef.current);
        master = musicEl.current;
      }
      [ttsUrl, voiceUrl].forEach(u => {
        if (!u) return;
        const a = new Audio(proxifyAudioUrl(u)); a.crossOrigin = "anonymous"; a.muted = audMutedRef.current;
        a.volume = Math.min(1, voiceVolRef.current);
        voiceEls.current.push(a);
        if (!master) master = a;
      });
    } catch {}
    // mode OFFSET: tiap audio punya posisi mulai sendiri → pakai jam manual yang mengelola semua elemen
    const offs = offRef.current;
    const useOffsets = offs.music > 0.01 || offs.tts > 0.01 || offs.voice > 0.01;
    tlAudRef.current = [];
    if (useOffsets || !master) {
      if (musicUrl && musicEl.current) tlAudRef.current.push({ a: musicEl.current, off: offs.music, dur: durAudRef.current.music || 1e9 });
      const offs2 = [offs.tts, offs.voice]; const durs2 = [durAudRef.current.tts, durAudRef.current.voice]; let vi = 0;
      [ttsUrl, voiceUrl].forEach(u => {
        if (!u) return;
        const a = voiceEls.current[vi];
        if (a) tlAudRef.current.push({ a, off: offs2[vi] ?? 0, dur: durs2[vi] || 1e9 });
        vi++;
      });
      master = null; // jam manual yang jaga (lihat tick)
    }
    clockRef.current.audio = master;
    clockRef.current.base = seekTo; clockRef.current.t0 = performance.now();
    clockRef.current.running = true;   // <-- kunci: jam manual mulai berjalan (proyek tanpa audio pun bisa play)
    playingRef.current = true;
    if (master) {
      try { master.currentTime = seekTo; master.play().catch(() => {}); } catch {}
      voiceEls.current.forEach(a => { try { a.currentTime = seekTo; a.play().catch(() => {}); } catch {} });
    } else {
      // mulai elemen sesuai offsetnya masing-masing
      tlAudRef.current.forEach(e => {
        const local = seekTo - e.off;
        try {
          if (local >= 0 && local < e.dur) { e.a.currentTime = local; e.a.play().catch(() => {}); }
          else e.a.pause();
        } catch {}
      });
    }
    setPlaying(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [playing, curT, musicUrl, ttsUrl, voiceUrl, stopPreview, tick]);

  // ukuran canvas mengikuti rasio
  useEffect(() => {
    const cv = canvasRef.current; const wrap = stageWrapRef.current;
    if (!cv || !wrap) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const ar = ratio === "9:16" ? 9 / 16 : ratio === "1:1" ? 1 : 16 / 9;
      let w = r.width, h = w / ar;
      if (h > r.height) { h = r.height; w = h * ar; }
      const sc = Math.min(1, 640 / w);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
      drawFrame(curT);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(wrap);
    return () => ro.disconnect();
  }, [ratio]); // eslint-disable-line

  useEffect(() => () => { stopPreview(); }, []); // eslint-disable-line

  /* ---------- DRAFT persist ---------- */
  const didInit = useRef(false);
  const saveTimer = useRef<any>(null);
  const buildSnapshot = useCallback((thumbOverride?: string) => {
    const compactSlides = slides.slice(0, 16).map(s => (s.imageUrl.startsWith("data:") && s.imageUrl.length > 500_000) ? { ...s, imageUrl: "" } : s);
    const first = slides[0]?.imageUrl || "";
    const thumb = thumbOverride ?? (coverThumb || (first.startsWith("data:") ? first.slice(0, 40000) : first));
    return { v: 6, id: draftId || uid("d"), title: projTitle.slice(0, 80), updatedAt: Date.now(),
      slides: compactSlides, slideOptsById, ratio, slideDuration, transition, transitionDur, bgMode, bgColor,
      musicUrl, musicName, ttsUrl, ttsText, voiceUrl: "", musicDur, ttsDur, voiceDur, musicOff, ttsOff, voiceOff, filterPreset, adj, qualitySharp,
      musicVol, voiceVol, musicFadeIn, musicFadeOut,
      capWords, capStyle, ccTpl, ccSize, ccY, niche, coverThumb: thumb, audMuted,
      audioSynced: audioSyncedRef.current ? 1 : 0, // ⏱ v13.7
      mTitle, mLyrics, mStyle, mGenre, mMood, mModel, mVocal };
  }, [slides, slideOptsById, ratio, slideDuration, transition, transitionDur, bgMode, bgColor, musicUrl, musicName, ttsUrl, ttsText, filterPreset, adj, qualitySharp, capWords, capStyle, ccTpl, ccSize, ccY, niche, coverThumb, draftId, projTitle, mTitle, mLyrics, mStyle, mGenre, mMood, mModel, mVocal, audMuted]);
  function applySnapshot(d: any) {
    if (!d) return;
    stopPreview();
    setSlides(d.slides || []); setSlideOptsById(d.slideOptsById || {});
    setRatio(d.ratio || "9:16"); setSlideDuration(d.slideDuration || 3);
    setTransition(d.transition || "dissolve"); setTransitionDur(d.transitionDur ?? 0.6);
    setBgMode(d.bgMode || "cover"); setBgColor(d.bgColor || "#000000");
    setMusicUrl(d.musicUrl || ""); setMusicName(d.musicName || "");
    setMusicDur(d.musicDur || 0); setTtsDur(d.ttsDur || 0); setVoiceDur(d.voiceDur || 0);
    setMusicOff(d.musicOff || 0); setTtsOff(d.ttsOff || 0); setVoiceOff(d.voiceOff || 0);
    setTtsUrl(d.ttsUrl || ""); setTtsText(d.ttsText || ""); setVoiceUrl(d.voiceUrl || "");
    setFilterPreset(d.filterPreset || "none"); setAdj({ ...DEFAULT_ADJUST, ...(d.adj || {}) });
    setQualitySharp(!!d.qualitySharp);
    setMusicVol(d.musicVol ?? 1); setVoiceVol(d.voiceVol ?? 1);
    setMusicFadeIn(d.musicFadeIn ?? 0); setMusicFadeOut(d.musicFadeOut ?? 0);
    setCapWords(d.capWords || []); setCapStyle(d.capStyle || "capcut");
    setCcTpl(d.ccTpl || "standar"); setCcSize(d.ccSize || 0.055); setCcY(d.ccY || 0.78);
    setNiche(d.niche || ""); setCoverThumb(d.coverThumb || "");
    setProjTitle(d.title || "Proyek Tanpa Judul"); setDraftId(d.id || "");
    setMTitle(d.mTitle || ""); setMLyrics(d.mLyrics || ""); setMStyle(d.mStyle || "");
    setMGenre(d.mGenre || "pop ballad"); setMMood(d.mMood || "emotional, menyentuh");
    setMModel(d.mModel || "suno-v5"); setMVocal(d.mVocal || "vocal");
    audioSyncedRef.current = d.audioSynced ? 1 : 0; // ⏱ v13.7: draf yang sudah disetarakan tidak diusik lagi
    setSelId(""); setClipBar(false); setCurT(0);
    (window as any).__v6prevlen = fromArrayLen((d.slides || []));
    histRef.current = { stk: [], i: -1 }; setHistTick(v => v + 1);
  }
  function fromArrayLen(a: any[]): number { return Array.isArray(a) ? a.length : 0; }
  function persistSnapshot(manual = false) {
    try {
      const snap = buildSnapshot();
      if (!snap.slides.length && !manual) return;
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
      const idx = arr.findIndex((d: any) => d.id === snap.id);
      const prevThumb = idx >= 0 ? arr[idx].coverThumb : "";
      if (!snap.coverThumb && prevThumb) snap.coverThumb = prevThumb;
      if (idx >= 0) arr[idx] = snap; else arr.unshift(snap);
      while (arr.length > MAX_DRAFTS) arr.pop();
      const teksSimpan = JSON.stringify(arr);
      try { localStorage.setItem(DRAFTS_KEY, teksSimpan); } catch { flash("⚠️ GAGAL SIMPAN — memori HP penuh. Hapus draf lama di tab Proyek, lalu 💾 ulangi."); return; } // v14.5 SIMPAN-JUJUR #1 (biang 'setting balik ke versi lama')
      try { const bacaBalik = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]"); if (!bacaBalik.some((x: any) => x?.id === snap.id)) throw new Error("readback"); } catch { flash("⚠️ SIMPANAN RAGU — HP tak memastikan tulisan nempel. Coba 💾 sekali lagi."); return; } // v14.5 SIMPAN-JUJUR #2 bukti-tulis
      if (!draftId) setDraftId(snap.id);
      onSaved();
      if (manual) flash("✅ Proyek tersimpan");
    } catch {}
  }
  const flash = (t: string) => { setStageText(t); setTimeout(() => setStageText(""), 1800); };
  const setErr = (e: any) => setError(e?.message || e?.error || String(e || "Terjadi kesalahan"));

  /* ---------- INIT ---------- */
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    ensureFontsLoaded().then(() => drawFrame(0)).catch(() => {});
    try {
      setSunoKey(localStorage.getItem("verve_suno_key") || "");
      setSunoProv(localStorage.getItem("verve_suno_provider") || "kie");
      setPresets(JSON.parse(localStorage.getItem("verve_filter_presets") || "[]"));
      const tk = JSON.parse(localStorage.getItem(SUNO_TASK_KEY) || "null");
      if (tk?.id && Date.now() - tk.ts < 30 * 60 * 1000) { setMTask(tk.id); setMStatus("pending"); }
    } catch {}
    // buka draft / sesi / proyek baru
    if (openDraftId) {
      try {
        const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
        const d = arr.find((x: any) => x.id === openDraftId);
        if (d) applySnapshot(d);
        else flash("⚠️ Proyek titipan tak ketemu di memori HP — lembar baru terbuka; 💾 manual ya"); // v14.5 JUJUR #3: tidak senyap lagi
      } catch {}
    }
    if (cmd?.preset) {
      const c = cmd.preset;
      if (c.ratio) setRatio(c.ratio);
      if (c.transition) setTransition(c.transition);
      if (c.transitionDur) setTransitionDur(c.transitionDur);
      if (c.adj) setAdj({ ...DEFAULT_ADJUST, ...c.adj });
      if (c.caption) setCapStyle(c.caption);
      flash(`✨ Template "${c.name || c.caption || ""}" diterapkan — tambahkan media!`);
    }
    if (cmd?.applyAdjust) {
      setAdj({ b: 6, c: 14, s: 10, e: 4, tem: 2, hue: 0, fade: 0, vig: 30, grain: 0 });
      setQualitySharp(true);
      flash("✨ Otomatis disempurnakan: warna + ketajaman");
    }
    if (cmd?.tool) setTimeout(() => openToolCmd(cmd.tool), 450);
    pushHist();
  }, []); // eslint-disable-line

  // auto-AKHIRAN: saat media pertama ditambahkan pada proyek kosong (ala CapCut)
  const prevLenRef = useRef<number | null>(null);
  useEffect(() => {
    const w = window as any;
    if (typeof w.__v6prevlen === "number") { prevLenRef.current = w.__v6prevlen; w.__v6prevlen = undefined; }
    const n = slides.length;
    if (prevLenRef.current === 0 && n > 0 && !slides.some(x => x.id.startsWith("outro"))) {
      const o = { id: uid("outro"), imageUrl: makeOutroImage("Terima kasih sudah menonton 🙏") };
      setSlides(c => c.some(x => x.id.startsWith("outro")) ? c : [...c, o]);
      setSlideOptsById(c => ({ ...c, [o.id]: { dur: 2.2, trans: "fadeblack" } }));
      flash("🏁 Akhiran otomatis ditambahkan (tap untuk ganti/hapus)");
    }
    prevLenRef.current = n;
  }, [slides]); // eslint-disable-line

  // autosave (debounce) setiap perubahan struktural
  useEffect(() => {
    if (!didInit.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSnapshot(), 1200);
    return () => clearTimeout(saveTimer.current);
  }, [slides, slideOptsById, capWords, capStyle, adj, filterPreset, bgMode, bgColor, ratio, musicUrl, ttsUrl]); // eslint-disable-line

  /* ---------- TOOL ROUTER ---------- */
  function openToolCmd(t: string) {
    switch (t) {
      case "media": setTool("media"); break;
      case "kamera": setModal("kamera"); break;
      case "wizard": setModal("wizard"); break;
      case "musik": setModal("musik"); break;
      case "tts": setModal("tts"); break;
      case "rekam": setModal("rekam"); break;
      case "keterangan": setTool("keterangan"); break;
      case "filter": setTool("filter"); setSheetTab("filter"); break;
      case "videoai": setModal("videoai"); break;
      default: setTool(t);
    }
  }
  function onMainTool(t: string) {
    if (t === "edit") {
      if (!slides.length) { setTool("media"); return; }
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      const sid = selId || (L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id) || "";
      if (sid) { setSelId(sid); setClipBar(true); }
      return;
    }
    if (t === "avatar") return;
    if (t === "sesuaikan") { setTool("filter"); setSheetTab("sesuaikan"); return; }
    if (t === "overlay") { setTool("stiker"); setSheetTab("overlayimg"); return; }
    setTool(cur => cur === t ? null : t); setSheetTab("");
    if (t === "teks" && !slides.length) setTool("media");
  }
  function onClipTool(t: string) {
    const id = selId; if (!id) return;
    switch (t) {
      case "split": doSplitAtPlayhead(); break;
      case "animasi": setTool("animasi"); setSheetTab("masuk"); break;
      case "efek": setTool("efek"); break;
      case "gambarai": setModal("gambarai"); break;
      case "hapus": pushHist(); setSlides(c => c.filter(s => s.id !== id)); flash("🗑 Klip dihapus"); break;
      case "pangkas": setTool("pangkas"); break;
      case "dup": pushHist(); {
        const i = selIndex; const src = slides[i];
        if (i < 0) break;
        const ns = { id: uid("c"), imageUrl: src.imageUrl };
        setSlides(c => { const a = [...c]; a.splice(i + 1, 0, ns); return a; });
        setSlideOptsById(c => ({ ...c, [ns.id]: { ...(c[id] || {}) } }));
        setSelId(ns.id); flash("⧉ Diduplikat");
        break;
      }
      case "ganti": setModal("ganti"); break;
      case "teks": startTextEdit(id); break;
      case "stiker": setTool("stiker"); break;
      case "speed": setTool("speed"); break;
      case "transisi": setTool("transisi"); break;
      case "geserkir": // 🗺️ v13.18: pindah urutan TANPA harus tahu tekan-tahan-seret
        if (selIndex > 0) { pushHist(); moveSlide(selIndex, selIndex - 1); flash("◀ Adegan digeser ke kiri"); }
        else flash("Sudah paling kiri bro");
        break;
      case "geserkan":
        if (selIndex >= 0 && selIndex < slides.length - 1) { pushHist(); moveSlide(selIndex, selIndex + 1); flash("▶ Adegan digeser ke kanan"); }
        else flash("Sudah paling kanan bro");
        break;
    }
  }

  /* ---------- AKSI KLIP ---------- */
  function doSplitAtPlayhead() {
    const tl = timelineRef.current; if (!tl || !slidesRef.current.length) return;
    const t = Math.min(curT, tl.total - 0.001);
    const L = locate(tl, t);
    const i = L.idx; const sid = slidesRef.current[i].id;
    const d = tl.durs[i];
    const local = t - tl.starts[i];
    if (local < 0.15 || d - local < 0.15) { flash("⚠️ Geser playhead ke tengah klip dulu (min 0,15d dari ujung)"); return; }
    pushHist();
    const speed = slideOptsById[sid]?.speed || 1;
    const src = slidesRef.current[i];
    const left: Slide = { id: uid("c"), imageUrl: src.imageUrl };
    const right: Slide = { id: uid("c"), imageUrl: src.imageUrl };
    const oldOpts = { ...(slideOptsById[sid] || {}) };
    const leftOpts: SlideOpt = { ...oldOpts, dur: local * speed, trans: "none", animOut: "none" };
    const rightOpts: SlideOpt = { ...oldOpts, dur: (d - local) * speed, animIn: "none" };
    setSlides(c => { const a = [...c]; a.splice(i, 1, left, right); return a; });
    setSlideOptsById(c => {
      const n = { ...c };
      delete n[sid];
      n[left.id] = leftOpts;
      n[right.id] = rightOpts;
      return n;
    });
    setSelId(left.id);
    flash("╫ Klip dibagi di posisi playhead");
  }
  function removeSlideAt(i: number) {
    pushHist();
    setSlides(c => c.filter((_, k) => k !== i));
  }
  function moveSlide(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    pushHist();
    setSlides(c => { const a = [...c]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  }
  // =============== 🎬 v11.1 SUTRADARA STUDIO ===============
  type StudioOp = { op: string } & Record<string, any>;
  const dirPush = (me: "me" | "ai" | "sys", text: string) => setDirLog((l) => [...l.slice(-40), { me, text }]);
  useEffect(() => {
    dirEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dirLog, dirBusy, dirOpen]);

  function applyStudioOps(ops: StudioOp[]) {
    const heavyNames = ["render_now", "auto_caption", "selaraskan_ulang", "animasikan_adegan"]; // 🎬 v11.8
    const heavy = ops.filter((o) => heavyNames.includes(o.op));
    const free = ops.filter((o) => !heavyNames.includes(o.op));
    if (heavy.length) {
      setDirPending(heavy.map((o) => ({ op: o.op, slide: o.slide, instruction: o.instruction })));
      const parts = heavy.map((o) => {
        if (o.op === "render_now") return "Render (CPU HP — gratis)";
        if (o.op === "auto_caption" || o.op === "selaraskan_ulang") return "Keterangan otomatis (AI transkripsi — gratis, ±1–2 mnt)";
        const semua = o.slide === undefined || o.slide === null || String(o.slide) === "semua" || Number(o.slide) === 0;
        const n = semua ? slides.filter((s) => !s.videoUrl).length : 1;
        return `Animasi AI ${semua ? `SEMUA (${n} adegan)` : `adegan ${o.slide}`} — ⚠️ BAKAR KREDIT video AI`;
      });
      dirPush("sys", "🔥 Kerja berat menunggu izinmu: " + parts.join(" · ") + ". Ketuk Gas/Batal di bawah — keputusan (dan kredit) di tanganmu.");
    }
    if (!free.length) return;
    pushHist(); // ↩ menumpang undo RESMI Studio — bukan sistem paralel
    const done: string[] = [];
    const clamp = (v: any, a: number, b: number, d: number) => { const n = Number(v); return isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
    for (const o of free) {
      const i1 = Math.round(Number(o.slide)) - 1;
      const hasSlide = i1 >= 0 && i1 < slides.length;
      const sid = hasSlide ? slides[i1].id : "";
      switch (o.op) {
        case "set_ratio": if (["16:9", "9:16", "1:1"].includes(String(o.ratio))) { setRatio(o.ratio); done.push(`rasio → ${o.ratio}`); } break;
        case "set_transition": setTransition(String(o.transition)); if (o.dur !== undefined) setTransitionDur(clamp(o.dur, 0.2, 3, 0.6)); done.push(`transisi → ${o.transition}`); break;
        case "set_slide_dur": setSlideDuration(clamp(o.detik, 0.5, 30, slideDuration)); done.push(`durasi tiap adegan → ${clamp(o.detik, 0.5, 30, slideDuration)} dtk`); break;
        case "set_slide_time": if (hasSlide) { setOpt(sid, { dur: clamp(o.detik, 0.5, 30, slideDuration) } as any); done.push(`adegan ${o.slide} → ${clamp(o.detik, 0.5, 30, slideDuration)} dtk`); } break;
        case "set_music_vol": { const v = clamp(o.vol, 0, 1.5, musicVol); setMusicVol(v); done.push(`volume musik → ${Math.round(v * 100)}%`); break; }
        case "set_voice_vol": { const v = clamp(o.vol, 0, 1.5, voiceVol); setVoiceVol(v); done.push(`volume suara → ${Math.round(v * 100)}%`); break; }
        case "set_music_fade": if (o.fade_in !== undefined) setMusicFadeIn(clamp(o.fade_in, 0, 15, musicFadeIn)); if (o.fade_out !== undefined) setMusicFadeOut(clamp(o.fade_out, 0, 15, musicFadeOut)); done.push("fade musik disetel"); break;
        case "set_music_off": setMusicOff(clamp(o.detik, 0, 300, musicOff)); done.push(`musik mulai di detik ${clamp(o.detik, 0, 300, musicOff)}`); break;
        case "set_muted": setAudMuted(!!o.on); done.push(o.on ? "audio asli dimute" : "audio asli dibunyikan"); break;
        case "edit_caption": if (hasSlide && typeof o.text === "string") {
          const cur = (slideOptsById[sid]?.texts || []) as any[];
          const nt = cur.length
            ? cur.map((t, k) => (k === 0 ? { ...t, txt: String(o.text).slice(0, 120) } : t))
            : [{ id: "t" + Math.random().toString(36).slice(2, 9), txt: String(o.text).slice(0, 120), font: "sistem", size: 0.062, color: "#ffffff", bold: true, italic: false, shadow: true, stroke: true, strokeColor: "#000000", strokeW: 5, bg: true, bgColor: "rgba(0,0,0,0.45)", y: 0.84, align: "center", anim: "none" } as any];
          setOpt(sid, { texts: nt } as any);
          done.push(`teks adegan ${o.slide} diubah`);
        } break;
        case "move_slide": {
          const f = Math.round(Number(o.from)) - 1, t = Math.round(Number(o.to)) - 1;
          if (f >= 0 && f < slides.length && t >= 0 && t < slides.length && f !== t) { moveSlide(f, t); done.push(`adegan ${f + 1} → posisi ${t + 1}`); }
          break;
        }
        case "delete_slide": if (hasSlide && slides.length > 1) { removeSlideAt(i1); done.push(`adegan ${o.slide} dihapus`); } break;
        case "set_bg": if (["cover", "blur", "color"].includes(String(o.mode))) { setBgMode(o.mode); if (o.color) setBgColor(String(o.color).slice(0, 20)); done.push(`latar → ${o.mode}`); } break;
        case "set_filter": { const f = String(o.preset || ""); if ((FILTERS as any[]).some((x) => x.id === f)) { setFilterPreset(f); done.push(`filter → ${f}`); } break; }
        case "set_quality": setQualitySharp(!!o.sharp); done.push(o.sharp ? "kualitas render: tajam" : "kualitas render: standar"); break;
        case "set_motion": {
          // 🎬 v11.4: Ken Burns KERAS (zoom_in/zoom_out/selangseling) lewat medan kb kustom;
          // mode lain (denyut dkk) tetap pakai daftar resmi ANIM_LOOP
          const m = String(o.mode || "");
          const targets = hasSlide ? [i1] : slides.map((_, k) => k);
          if (m === "zoom_in" || m === "zoom_out") {
            const dir = m === "zoom_in" ? "in" : "out";
            targets.forEach((k) => setOpt(slides[k].id, { kb: { dir, s: 0.3 }, loop: "none" } as any));
            done.push(hasSlide ? `zoom ${dir === "in" ? "MASUK" : "KELUAR"} keras adegan ${o.slide}` : `zoom ${dir === "in" ? "MASUK" : "KELUAR"} keras SEMUA adegan`);
          } else if (m === "selangseling") {
            slides.forEach((_, k) => setOpt(slides[k].id, { kb: { dir: k % 2 === 0 ? "in" : "out", s: 0.3 }, loop: "none" } as any));
            done.push("zoom masuk & keluar SELANG-SELING di semua adegan");
          } else if (m === "geser_kiri" || m === "geser_kanan" || m === "naik" || m === "turun") { // 🎬 v13.3: kamera mengalir satu arah
            const dir = (m === "geser_kiri" ? "l" : m === "geser_kanan" ? "r" : m === "naik" ? "u" : "d") as "l" | "r" | "u" | "d";
            targets.forEach((k) => setOpt(slides[k].id, { kb: { dir, s: 0.24 }, loop: "none" } as any));
            done.push(hasSlide ? `kamera ${m.replace("_", " ")} adegan ${o.slide}` : `kamera ${m.replace("_", " ")} SEMUA adegan`);
          } else if (m === "sinematik") { // 🎬 v13.3 GERAK WAH: tiap adegan BEDA gerakan — anti bolak-balik monoton
            const dirs = ["in", "l", "out", "r", "u", "d"] as const;
            slides.forEach((_, k) => setOpt(slides[k].id, { kb: { dir: dirs[k % dirs.length], s: k % 2 ? 0.14 : 0.21 }, loop: "none" } as any)); // 🎬 v13.5: kalem ala film
            done.push(`gerak SINEMATIK di ${slides.length} adegan — tiap adegan beda kamera (zoom masuk → geser kiri → zoom keluar → geser kanan → naik → turun)`);
          } else if ((ANIM_LOOP as any[]).some((x) => x.id === m)) {
            targets.forEach((k) => setOpt(slides[k].id, { loop: m, kb: undefined } as any));
            done.push(hasSlide ? `gerak adegan ${o.slide} → ${m}` : `gerak SEMUA adegan → ${m}`);
          }
          break;
        }
        case "set_letterbox": { const onL = (o as any).on !== false; setCineBars(onL); done.push(onL ? "letterbox BIOSKOP aktif 🎬 — garis hitam atas-bawah, ikut preview & render" : "letterbox dimatikan"); break; } // 🎬 v13.5
        case "add_spectrum": addSticker("@bars"); done.push("🌈 spektrum musik ikut irama lagu — geser & atur waktunya di track sesukamu"); break; // 🌈 v13.4
        case "add_cta": addSticker("@cta"); done.push("▶️ tombol CTA: 👍 suka → SUBSCRIBE → 🔔 lonceng + tangan yang mengklik berurutan"); break; // ▶️ v13.4
        case "clear_caption": clearCaptions(); done.push("keterangan otomatis dihapus"); break;
        case "matikan_animasi": { // 🎬 v11.8: cabut klip AI (slide kosong = semua) — gratis, ikut Undo resmi
          const targets = hasSlide ? [i1] : slides.map((_, k) => k);
          const n0 = targets.filter((k) => !!slides[k].videoUrl).length;
          if (n0) setSlides((c) => c.map((s, k) => (targets.includes(k) ? { ...s, videoUrl: undefined } : s)));
          done.push(n0 ? (hasSlide ? `animasi AI adegan ${o.slide} dimatikan` : `animasi AI dimatikan di ${n0} adegan`) : "belum ada animasi AI yang aktif");
          break;
        }
        case "geser_keterangan": {
          // 🎬 v11.6: geser timing karaoke (perkakas resmi nudgeLyrics + undo bawaan)
          const d = clamp(o.detik, -10, 10, 0);
          if (d !== 0) { nudgeLyrics(d); done.push(`keterangan digeser ${d > 0 ? "+" : ""}${d} dtk`); }
          break;
        }
        default: break;
      }
    }
    if (done.length) dirPush("sys", "✏️ Langsung kujalankan: " + done.join(" · ") + " — salah? pakai ↩ Undo di toolbar.");
  }

  async function sendDirectorStudio(text: string) {
    const msg = text.trim();
    if (!msg || dirBusy) return;
    dirPush("me", msg);
    // 🎧 v13.28: paham LOKAL (tanpa tunggu AI jauh, toleran typo) — keterangan otomatis langsung gas
    if (mintaKeteranganOtomatis(msg)) {
      dirPush("sys", "📝 Dipahami lokal: minta keterangan otomatis — langsung gas, tanpa antre AI jauh. Sumber dipilih otomatis (lirik/musik/suara), lirik lama otomatis diganti anti-dobel.");
      gasStudioOp({ op: "auto_caption" });
      return;
    }
    setDirBusy(true);
    const ac = new AbortController();
    const wd = setTimeout(() => ac.abort(), 45000); // keluarga anti-beku
    try {
      const ctx = {
        mode: "studio",
        jumlah_adegan: slides.length,
        rasio: ratio,
        transisi: { id: transition, dur: transitionDur },
        durasi_default_adegan: slideDuration,
        durasi_tiap_adegan: slides.map((s, i) => ({ n: i + 1, dur: (slideOptsById[s.id] as any)?.dur ?? slideDuration, ada_teks: !!((slideOptsById[s.id] as any)?.texts || []).length })),
        musik: { ada: !!musicUrl, nama: musicName, vol: musicVol, off: musicOff, fade_in: musicFadeIn, fade_out: musicFadeOut, muted: audMuted },
        filter: filterPreset,
        daftar_filter: (FILTERS as any[]).map((f) => f.id).slice(0, 24),
        kualitas_tajam: qualitySharp,
        bg: { mode: bgMode, color: bgColor },
        render_siap_download: !!videoUrl,
        adegan_hidup: slides.map((s, i) => (s.videoUrl ? i + 1 : 0)).filter(Boolean), // 🎬 v11.8: adegan yang SUDAH beranimasi AI
        animasi_sedang_jalan: animBusy, // 🎬 v11.9: FAKTA mesin — bukan tebakan AI
        kartu_gas_menunggu: dirPending.map((o) => o.op),
        hasil_animasi_terakhir: animLastRef.current || "belum pernah dianimasikan sesi ini",
      };
      // 🏦 v12.3: bansos chat (dari Dompet Bansos di menu Saya) — dipakai duluan kalau disetel
      const dhead: Record<string, string> = { "Content-Type": "application/json" };
      try { const bc = JSON.parse(localStorage.getItem("verve_bansos_chat_v1") || "null"); if (bc && bc.base && bc.key) { dhead["x-bansos-chat-base"] = String(bc.base); dhead["x-bansos-chat-key"] = String(bc.key); if (bc.model) dhead["x-bansos-chat-model"] = String(bc.model); } } catch {}
      const r = await fetch("/api/hcnsec/director", {
        method: "POST", headers: dhead, signal: ac.signal,
        body: JSON.stringify({ message: msg, ctx, history: dirLog.slice(-6) }),
      }).finally(() => clearTimeout(wd));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (j.reply) dirPush("ai", String(j.reply));
      if (Array.isArray(j.ops)) applyStudioOps(j.ops);
      if (Array.isArray(j.dropped) && j.dropped.length) dirPush("sys", "⚠️ Kusaring perintah aneh: " + j.dropped.slice(0, 2).join(" · "));
    } catch (e) {
      dirPush("sys", "❌ Sutradara gagal menjawab: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDirBusy(false);
    }
  }

  // 🎬 v11.8 ANIMASI STUDIO — animasikan gambar adegan jadi klip video AI ±5 dtk (image→video),
  // SATU-SATU (sopan di HP), hasil menempel di slide → preview + render ikut otomatis.
  // BAKAR KREDIT: selalu lewat kartu Gas/Batal. Gagal? gambar aman + gerak halus otomatis tetap jalan.
  async function animateSlidesStudio(idxList: number[], instruction?: string) {
    if (animBusy) { dirPush("sys", "⏳ Animasi lain masih jalan — tunggu selesai atau ketuk Urung dulu ya."); return; }
    const list = idxList.filter((i) => slides[i] && slides[i].imageUrl && !slides[i].videoUrl);
    if (!list.length) { dirPush("sys", "ℹ️ Tidak ada adegan yang perlu dianimasikan (sudah hidup semua / tanpa gambar)."); return; }
    const ac = new AbortController();
    animAbortRef.current = ac;
    setAnimBusy(true);
    pushHist(); // ↩ SATU snapshot untuk seluruh batch — Undo membatalkan semuanya sekaligus
    let ok = 0;
    const failed: string[] = [];
    dirPush("sys", `🎬 Menganimasikan ${list.length} adegan SATU-SATU (tiap klip ±5 dtk; total ±${list.length}–${list.length * 3} mnt — layar tetap nyala ya). Mau berhenti di tengah? ketuk ⏹ Urung — yang sudah jadi tetap kepakai.`);
    for (const i of list) {
      if (ac.signal.aborted) break;
      dirPush("sys", `🎥 Adegan ${i + 1} sedang dianimasikan… (${ok} jadi sejauh ini)`);
      try {
        const extra = (instruction || "").trim().slice(0, 160);
        const prompt = `Subtle living photo, gentle cinematic motion, slow stable camera, natural micro movement, no morphing faces${extra ? ": " + extra : ""}`;
        const vhdr: Record<string, string> = { "Content-Type": "application/json" };
        try { const kk = localStorage.getItem("verve_suno_key") || ""; if (kk) vhdr["X-Suno-Key"] = kk; } catch {} // 🔄 v12.1: pinjam kunci Kie/Suno buat sirkuit video
        // 🏹 v12.2: ikutkan pasukan provider bansos (maks 3 yang aktif) — dicoba server PALING AWAL
        const vbody: any = { prompt, imageUrl: slides[i].imageUrl, duration: 5, aspectRatio: ratio };
        try { const j = JSON.parse(localStorage.getItem("verve_video_providers_v1") || "[]"); if (Array.isArray(j)) { const c = j.filter((x: any) => x && x.aktif !== false && x.base && x.key).slice(0, 3); if (c.length) vbody.customProviders = c; } } catch {}
        let r = await fetch("/api/hcnsec/video", { method: "POST", headers: vhdr, body: JSON.stringify(vbody), signal: ac.signal });
        let d: any = await r.json().catch(() => ({}));
        let tries = 0;
        while (!d.video_url && (d.id || d.task_id) && tries < 8 && !ac.signal.aborted) { // LANJUT task yang sama — hemat kredit
          await new Promise((res) => setTimeout(res, 4000));
          r = await fetch("/api/hcnsec/video", { method: "POST", headers: vhdr, body: JSON.stringify({ pollOnly: true, taskId: d.id || d.task_id, endpoint: d.endpoint, provider: d.provider, cp: d.cp }), signal: ac.signal });
          d = await r.json().catch(() => ({}));
          tries++;
        }
        if (ac.signal.aborted) break;
        if (d.video_url) {
          const vu = String(d.video_url);
          setSlides((c) => c.map((s, j) => (j === i ? { ...s, videoUrl: vu } : s)));
          ok++;
          dirPush("sys", `✅ Adegan ${i + 1} hidup!${d.model && d.model !== "kling-v1" ? ` (model: ${d.model})` : " —"} badge 🎬 di track · ikut preview & render`);
        } else {
          failed.push(`adegan ${i + 1}: ${String(d.error || "model video sibuk").slice(0, 160)}`);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") break;
        failed.push(`adegan ${i + 1}: ${String(e?.message || e).slice(0, 160)}`);
      }
    }
    setAnimBusy(false);
    animAbortRef.current = null;
    // 🎬 v11.9: catat fakta hasil — Sutradara menjawab status DARI SINI, bukan dari tebakan
    animLastRef.current = ac.signal.aborted
      ? `diurungkan pembuat — ${ok} adegan sempat jadi`
      : ok === list.length
        ? `sukses semua: ${ok}/${list.length} adegan hidup`
        : ok > 0
          ? `sebagian jadi: ${ok}/${list.length}; gagal pertama: ${failed[0] || "-"}`
          : `gagal semua (${list.length} adegan) — error pertama: ${failed[0] || "tidak diketahui"}`;
    dirPush("sys", ac.signal.aborted
      ? `⏹ Diurungkan. ${ok} adegan sempat hidup & tetap dipakai; sisanya gambar biasa + gerak halus otomatis.`
      : ok === list.length
        ? `🏁 Selesai — SEMUA ${ok} adegan hidup! Play preview untuk lihat geraknya. Salah? ↩ Undo membatalkan semua. (URL klip bertahan jam-an — render/download sebaiknya hari ini)`
        : ok > 0
          ? `🏁 Selesai: ${ok}/${list.length} adegan hidup. Gagal: ${failed.slice(0, 2).join(" · ")} — sisanya tetap gambar + gerak halus otomatis.`
          : `⚠️ Semua gagal dianimasikan — ${failed[0] || "model video sibuk"}. Gambarmu aman kok. Coba lagi nanti ya bro.`);
  }

  function gasStudioOp(o: { op: string; slide?: any; instruction?: string }) {
    setDirPending((p) => p.filter((x) => x !== o));
    if (o.op === "animasikan_adegan") { // 🎬 v11.8
      const semua = o.slide === undefined || o.slide === null || String(o.slide) === "semua" || Number(o.slide) === 0;
      const idxs = semua ? slides.map((_, k) => k) : [Math.max(0, Math.round(Number(o.slide)) - 1)];
      dirPush("sys", "🔥 Oke — kredit AI dipakai, aku kerjakan satu-satu. Kalau ada yang gagal: gambarnya aman, gerak halus otomatis tetap jalan.");
      void animateSlidesStudio(idxs, typeof o.instruction === "string" ? o.instruction : undefined);
      return;
    }
    if (o.op === "render_now") {
      dirPush("sys", "🎬 Render dimulai — CPU HP yang bekerja. Selesai → tombol ⬇ Download menyala.");
      void doRender();
    } else if (o.op === "auto_caption") {
      // 🛡 v11.5 SUMBER PINTAR: proyek Cerita Jadi Lagu = lagu + lirik, tanpa suara TTS.
      // Dulu chat memanggil apa adanya (sumber 'suara') → ditolak 'Belum ada suara'. Sekarang memilih sendiri.
      const from = (mLyrics || "").trim() && musicUrl ? "lirik" : musicUrl ? "musik" : "suara";
      dirPush("sys", from === "lirik"
        ? "📝 Keterangan otomatis jalan — AI menyelaraskan LIRIK lagumu ke irama lagu (Whisper, dengan cadangan perkiraan cerdas). Hasilnya muncul sebagai karaoke di track teks."
        : "📝 Keterangan otomatis jalan — AI menyalin audio (±1–2 mnt). Hasilnya bisa dilihat/disetel lewat tombol Keterangan di toolbar.");
      void doAutoCaptions(from);
    } else if (o.op === "selaraskan_ulang") {
      // 🎬 v11.6 SELARAS: karaoke lama (id lyr_) disingkirkan DULU — anti karaoke dobel — baru sync dari nol
      const from = (mLyrics || "").trim() && musicUrl ? "lirik" : musicUrl ? "musik" : "suara";
      dirPush("sys", "🎯 Sinkron ulang dari nol — teks karaoke lama disingkirkan dulu (tidak ada yang dobel), lalu AI menyelaraskan lirik ke irama lagu (±1–2 mnt)…");
      setSlideOptsById((prev) => {
        const next: Record<string, SlideOpt> = { ...prev };
        for (const sid2 of Object.keys(next)) {
          const oo: any = next[sid2];
          if (!oo?.texts?.length) continue;
          const kept = oo.texts.filter((t: any) => !/^lyr_/.test(t?.id || ""));
          if (kept.length !== oo.texts.length) next[sid2] = { ...oo, texts: kept };
        }
        return next;
      });
      setLyrOff(0);
      void doAutoCaptions(from);
    }
  }

  function trimSlide(id: string, targetEffDur: number) {
    const sp = slideOptsById[id]?.speed || 1;
    setOpt(id, { dur: clampN(targetEffDur, 0.4, 600) * sp }); // sampai 10 menit — ngikutin lagu panjang
  }

  /* ---------- MEDIA ---------- */
  /* Pertahankan kualitas asli: TANPA crop paksa (mesin gambar sudah cover-fit saat preview/ekspor),
     hanya turun resolusi kalau foto kelewat raksasa (hemat RAM HP). PNG/WebP dipertahankan (transparansi). */
  function fitMax(img: HTMLImageElement, maxSide = 2048, mime: string = "image/jpeg", q = 0.92): string {
    const w = img.naturalWidth, h = img.naturalHeight;
    const sc = Math.min(1, maxSide / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * sc)), outH = Math.max(1, Math.round(h * sc));
    const c = document.createElement("canvas"); c.width = outW; c.height = outH;
    const cx = c.getContext("2d")!;
    if (mime === "image/jpeg") { cx.fillStyle = "#000"; cx.fillRect(0, 0, outW, outH); }
    cx.drawImage(img, 0, 0, outW, outH);
    return c.toDataURL(mime, q);
  }
  function addImageFiles(files: FileList | null, replaceId?: string) {
    if (!files || !files.length) return;
    pushHist();
    Promise.all(Array.from(files).slice(0, 14).map(f => new Promise<Slide>((res) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        const mime = (f.type === "image/png" || f.type === "image/webp") ? f.type : "image/jpeg";
        img.onload = () => res({ id: uid("up"), imageUrl: fitMax(img, 2048, mime) });
        img.onerror = () => res({ id: uid("bad"), imageUrl: "" });
        img.src = r.result as string;
      };
      r.readAsDataURL(f);
    }))).then(ss => {
      ss = ss.filter(s => s.imageUrl);
      if (!ss.length) return;
      if (replaceId) {
        setSlides(c => c.map(s => s.id === replaceId ? { ...s, imageUrl: ss[0].imageUrl } : s));
        flash("⇄ Media diganti");
      } else {
        setSlides(c => [...c, ...ss]);
        flash(`✅ ${ss.length} media ditambahkan`);
      }
    });
  }
  async function genImageForClip(prompt: string, style: string, replaceId?: string) {
    setLoading("image"); setError("");
    try {
      const res = await fetch("/api/hcnsec/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, title: prompt, style, niche }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
      const durl: string = data.url;
      const img = await new Promise<HTMLImageElement>((res2, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res2(im); im.onerror = () => rej(new Error("gagal memuat")); im.src = durl; });
      const cropped = fitMax(img, 2048);
      pushHist();
      if (replaceId) setSlides(c => c.map(s => s.id === replaceId ? { ...s, imageUrl: cropped } : s));
      else setSlides(c => [...c, { id: uid("ai"), imageUrl: cropped }]);
      flash("✨ Gambar AI siap");
      setModal(null);
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }

  /* ---------- AUDIO ---------- */
  function getAudioDuration(url: string): Promise<number> {
    return new Promise(res => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => res(0);
      a.src = proxifyAudioUrl(url);
    });
  }
  function uploadMusic(f: File | undefined) {
    if (!f) return;
    if (f.size > 18 * 1024 * 1024) return setErr({ message: "File musik terlalu besar (maks 18MB)" });
    const r = new FileReader();
    r.onload = () => { const u = r.result as string; setMusicUrl(u); setMusicOff(Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100); setMusicName(f.name.replace(/\.[^.]+$/, "").slice(0, 40)); flash(`🎵 Musik ditambahkan mulai ${formatDur(curTRef.current)}`); getAudioDuration(u).then(setMusicDur); };
    r.readAsDataURL(f);
  }
  async function mixAudioUrls(parts: { url: string; gain: number; fadeIn?: number; fadeOut?: number; off?: number }[]): Promise<string | null> {
    try {
      setStageText("Menggabungkan audio...");
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const bufs = await Promise.all(parts.map(p => fetch(p.url).then(r => r.arrayBuffer()).then(b => { void avPut(p.url, b, ""); return actx.decodeAudioData(b.slice(0)); }))); // 🛟 v13.7.1: jalur mix juga menabung ke brankas
      const sr = bufs[0].sampleRate; const ch = Math.min(2, bufs[0].numberOfChannels);
      const offs = parts.map(p => Math.max(0, Math.round((p.off || 0) * sr)));
      const maxLen = Math.max(...bufs.map((b, i) => offs[i] + b.length));
      const out = actx.createBuffer(ch, maxLen, sr);
      for (let c = 0; c < ch; c++) {
        const od = out.getChannelData(c);
        for (let bi = 0; bi < bufs.length; bi++) {
          const b = bufs[bi]; const d = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
          const p = parts[bi]; const g = p.gain;
          const fi = Math.max(0, p.fadeIn || 0), fo = Math.max(0, p.fadeOut || 0);
          const durS = d.length / sr;
          const o0 = offs[bi];
          for (let i = 0; i < d.length; i++) {
            let v = g;
            if (fi > 0 || fo > 0) {
              const t = i / sr;
              if (fi > 0 && t < fi) v *= t / fi;
              if (fo > 0 && t > durS - fo) v *= Math.max(0, (durS - t) / fo);
            }
            od[o0 + i] = Math.max(-1, Math.min(1, od[o0 + i] + d[i] * v));
          }
        }
      }
      const wav = bufferToWav(out); actx.close();
      return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    } catch { return parts[0]?.url || null; }
  }
  async function doTTS(text: string, voice: string) {
    setLoading("tts"); setError("");
    try {
      const r = await fetch("/api/hcnsec/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3500), voice }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || `Error ${r.status}`);
      setTtsUrl(data.url); setTtsText(text.slice(0, 3500));
      getAudioDuration(data.url).then(setTtsDur);
      flash("🗣️ Narasi AI siap — masuk track audio");
      setModal(null);
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }
  async function doEkstrak(f: File | undefined) {
    if (!f) return;
    setLoading("ekstrak"); setStageText("Mengekstrak audio dari video...");
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const buf = await actx.decodeAudioData(await f.arrayBuffer()).catch(() => null);
      if (!buf) throw new Error("Audio di video ini tidak bisa dibaca (codec tak didukung).");
      const wav = bufferToWav(buf);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      setMusicUrl(url); setMusicOff(Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100); setMusicName(f.name.replace(/\.[^.]+$/, "").slice(0, 40));
      getAudioDuration(url).then(setMusicDur);
      actx.close();
      flash(`🎬 Audio diekstrak — mulai ${formatDur(curTRef.current)}`);
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 100);
  }
  /* ---------- SUNO ---------- */
  async function doSuno() {
    const title = mTitle.trim() || projTitle;
    const style = mStyle.trim() || [mGenre, mMood, "indonesian, high quality"].join(", ");
    const lyr = mLyrics.trim();
    if (!title) return setErr({ message: "Judul lagu kosong" });
    if (mVocal !== "instrumental" && lyr.length < 20) return setErr({ message: "Lirik terlalu pendek (min ~20 karakter) atau pilih instrumen" });
    setLoading("suno"); setMStatus("memulai..."); setError("");
    try {
      const payload = {
        title: title.slice(0, 80), prompt: style, lyrics: mVocal === "instrumental" ? undefined : lyr,
        genre: mGenre, tags: style, custom: lyr.length > 30, model: mModel,
        instrumental: mVocal === "instrumental",
        _raw_title: title, _raw_lyrics: lyr, _raw_style: style,
      };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sunoKey) { headers["X-Suno-Key"] = sunoKey; headers["X-Suno-Provider"] = sunoProv; }
      const r = await fetch("/api/hcnsec/music", { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || data.message || `Error ${r.status}`);
      const id = data.taskId || data.task_id || data.id;
      if (!id) throw new Error("Server tidak kasih taskId — coba lagi.");
      setMTask(id);
      try { localStorage.setItem(SUNO_TASK_KEY, JSON.stringify({ id, title, ts: Date.now() })); } catch {}
      setMStatus("pending");
      flash("⏳ Lagu diolah server (1–6 mnt) — polling otomatis jalan");
      pollSuno(id, headers);
    } catch (e: any) { setErr(e); setMStatus("gagal"); }
    setLoading(null);
  }
  async function pollSuno(id: string, headers?: Record<string, string>) {
    const hdrs = headers || (sunoKey ? { "X-Suno-Key": sunoKey, "X-Suno-Provider": sunoProv } : {});
    setMStatus("pending");
    let tries = 0;
    const itv = setInterval(async () => {
      tries++;
      try {
        const pr = await fetch(`/api/hcnsec/music?id=${id}`, { headers: hdrs, cache: "no-store" });
        const pd = await pr.json().catch(() => ({}));
        const url = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
        if (url) {
          clearInterval(itv);
          setMusicUrl(url); setMusicOff(Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100); setMusicName(mTitle || "Lagu AI");
          getAudioDuration(url).then(setMusicDur);
          setMStatus("selesai"); setMTask("");
          try { localStorage.removeItem(SUNO_TASK_KEY); } catch {}
          flash("✅ Lagu AI selesai — masuk track audio");
        } else if (pd.status === "error" || pd.error) {
          clearInterval(itv); setMStatus("gagal"); setErr({ message: pd.error || "Gagal generate" });
        } else if (tries > 40) { // ~2 menit
          clearInterval(itv); setMStatus("pending");
          setStageText("⏳ Masih diolah server — task tersimpan, buka lagi Musik AI utk cek status");
          setTimeout(() => setStageText(""), 3000);
        }
      } catch { if (tries > 40) clearInterval(itv); }
    }, 8000);
  }
  async function cekSuno() { if (mTask) pollSuno(mTask); }

  /* ---------- KETERANGAN OTOMATIS ---------- */
  /** Sisipkan teks lepas (start/dur absolut) ke slide yang menaungi waktunya. */
  function insertFloatingTexts(texts: ClipText[]) {
    const durs = slides.map(s => {
      const o = slideOptsById[s.id];
      return Math.max(0.4, ((o?.dur ?? slideDuration) as number) / Math.max(0.25, (o as any)?.speed || 1));
    });
    const starts: number[] = [];
    let acc = 0;
    durs.forEach(d => { starts.push(acc); acc += d; });
    setSlideOptsById(prev => {
      const next: Record<string, SlideOpt> = { ...prev };
      for (const t of texts) {
        let idx = 0;
        for (let i = 0; i < starts.length; i++) { if (starts[i] + durs[i] > (t.start ?? 0) + 1e-6) { idx = i; break; } idx = i; }
        const sid = slides[idx]?.id;
        if (!sid) continue;
        const o: SlideOpt = { ...(next[sid] || {}) } as SlideOpt;
        (o as any).texts = [...((o as any).texts || []), t];
        next[sid] = o;
      }
      return next;
    });
  }

  // 📦 v13.21 SATU PINTU TRANSKRIPSI — URL online → JSON; blob:/data: (lagu dari HP/brankas) →
  // unggah BYTES langsung. ✂️ v13.22: blob >4,5MB TAK LAGI ditolak/didengarkan realtime —
  // lagu dipotong WAV 16kHz per 100 detik (audiocc.ts) & diunggah per bagian: tetap hitungan detik.
  async function transcribeAudio(src: string, hint = "", lang = "", onTahap?: (msg: string) => void): Promise<any | null> {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 75_000);
    try {
      if (/^https?:/.test(src)) {
        const r = await fetch("/api/hcnsec/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio_url: src, hint, lang }), signal: ctl.signal });
        return await r.json().catch(() => null);
      }
      const rb = await fetch(src).catch(() => null as any);
      if (!rb || !rb.ok) return null;
      const b = await rb.blob();
      if (!b || !b.size) return null;
      ccDiag("🧳", `lagu blob ${(b.size / 1e6).toFixed(2)}MB → ${b.size > 4_500_000 ? "jalur POTONG" : "unggah langsung"}`);
      if (b.size > 4_500_000) { // ✂️📦 v13.22: lagu BESAR dibaca di HP, dipotong WAV, diunggah per bagian — BUKAN didengarkan realtime
        clearTimeout(to);
        ccDiag("🚪", "masuk jalur potong WAV 16kHz per 100 detik");
        return await transcribeBlobBesar(b, hint, lang, onTahap);
      }
      const fd = new FormData();
      fd.append("file", b, "lagu.mp3");
      if (hint) fd.append("hint", hint);
      if (lang) fd.append("lang", lang);
      const r = await fetch("/api/hcnsec/transcribe", { method: "POST", body: fd, signal: ctl.signal });
      return await r.json().catch(() => null);
    } catch (e: any) {
      if (e?.name === "AbortError") return { ok: false, error: "AI kelamaan menjawab (>75 detik)" };
      return null;
    } finally { clearTimeout(to); }
  }

  // 📝👁️ v13.24 KETERANGAN TAMPIL — kata hasil AI → ClipText karaoke per baris (id lyr_),
  // persis artefak jalur Lirik: KELIHATAN di timeline track teks & menyala kata demi kata saat waktunya.
  // 🧹 v13.27 ANTI-ZOMBIE: jalankan keterangan = GANTI baris lirik lama (id lyr_), BUKAN menumpuk.
  //  (pola sama dengan "Sinkron ulang dari nol" Sutradara — satu pintu di sini biar SEMUA jalur ikut)
  function bersihkanLirikLama() {
    setSlideOptsById(prev => {
      const next: Record<string, SlideOpt> = { ...prev }; let ada = false;
      for (const sid of Object.keys(next)) {
        const o: any = next[sid];
        if (!o?.texts?.length) continue;
        const keep = o.texts.filter((t: any) => !/^lyr_/.test(t?.id || ""));
        if (keep.length !== o.texts.length) {
          ada = true;
          if (!keep.length) { const o2 = { ...o }; delete o2.texts; next[sid] = o2; }
          else next[sid] = { ...o, texts: keep };
        }
      }
      return ada ? next : prev;
    });
  }

  function capWordsToClips(ws2: CapWord[], tplId: string, sizeR: number, yR: number): ClipText[] {
    const lineIds = [...new Set(ws2.map(w => w.line))].sort((a, b) => a - b);
    const style = lyricTextStyle(tplId, sizeR, yR);
    return lineIds.map((li) => {
      const wsL = ws2.filter(w => w.line === li);
      const startM = wsL.length ? Math.min(...wsL.map(w => w.start)) : 0;
      const endM = wsL.length ? Math.max(...wsL.map(w => w.end)) : startM + 0.8;
      return {
        id: uid("lyr"),
        txt: wsL.map(w => w.text).join(" "),
        ...style,
        start: _r2(Math.max(0, startM)),
        dur: _r2(Math.max(0.8, endM - startM)),
        karaokeWords: wsL.map(w => ({ w: w.text, start: _r2(Math.max(0, w.start - startM)), end: _r2(Math.max(0.1, w.end - startM)) })),
      } as ClipText;
    }).filter(t => t.txt.trim().length > 0);
  }

  async function doAutoCaptions(forceFrom?: string) { // 🎬 v11.5: Sutradara boleh memilihkan sumber (lirik/musik/suara)
    const okFrom = typeof forceFrom === "string" && forceFrom ? forceFrom : ""; // 🩹 v13.27: tombol Hasilkan menyeret EVENT ketukan — BUKAN sumber!
    const from = okFrom || ccFrom;
    if (okFrom) setCcFrom(okFrom); // saklar UI ikut sinkron supaya panel Keterangan tidak bingung
    setLoading("cc"); setError("");
    ccDiagMulai(`keterangan:${from}`, `klik — templat ${ccTpl} · bahasa ${ccLang}`); // 🔬 v13.25
    try {
      const tpl = CC_TEMPLATES.find(t => t.id === ccTpl) || CC_TEMPLATES[0];
      setCapStyle(tpl.capStyle as any);

      /* ===== v8.2: DARI LIRIK LAGU — sinkron AI (Whisper HCNSEC) bila bisa, kalau tidak perkiraan cerdas.
         Hasil: SATU ClipText karaoke per baris, masuk TRACK TEKS (bisa digeser/edit satu-satu). ===== */
      if (from === "lirik") {
        if (!musicUrl) throw new Error("Belum ada musik di track — keterangan lirik butuh lagunya.");
        const lyrSrc = (mLyrics || "").trim();
        if (!lyrSrc) throw new Error("Proyek ini belum punya lirik. Bikin lagu lewat Lahan dulu, atau proyek lama belum menyimpan liriknya.");
        const dur = await getAudioDuration(musicUrl);
        if (!dur) throw new Error("Durasi lagu tidak terbaca.");
        const lines = parseLyricLines(lyrSrc);
        if (!lines.length) throw new Error("Lirik kosong setelah dibersihkan.");
        let spans: LineSpan[] | null = null;
        let engine: "ai" | "perkiraan" = "perkiraan";
        let engineName = "Whisper AI"; let whisperErr = ""; // 🔊🩹 v13.19: nama mesin & alasan gagal — jujur, bukan diam
        setStageText("🤖 AI menyelaraskan lirik dengan lagu (Whisper — hitungan detik)...");
        try {
          const j = await transcribeAudio(musicUrl, lines.slice(0, 8).map(l => l.text).join(" / "), "id", (m) => setStageText(m)); // 📦 v13.21: blob HP pun ikut AI · ✂️ v13.22: lagu BESAR dipotong per bagian
          if (j?.ok && Array.isArray(j.words) && j.words.length > 3) {
            spans = alignWordsToLines(lines, j.words, dur);
            if (spans) { engine = "ai"; engineName = String(j.engine || "Whisper AI"); }
          } else if (j?.error) {
            whisperErr = String(j.error).slice(0, 110);
          } else whisperErr = "AI tak terjangkau (jaringan)";
        } catch { whisperErr = "AI tak terjangkau (jaringan)"; }
        if (!spans) { setStageText("🧮 Menaksir irama lirik (perkiraan cerdas)..."); spans = estimateLyricLines(lines, dur); }
        const style = lyricTextStyle(ccTpl, ccSize, ccY);
        const texts: ClipText[] = spans.map((sp, i) => ({
          id: uid("lyr"),
          txt: lines[i].text,
          ...style,
          start: _r2(Math.max(0, sp.start)),
          dur: _r2(Math.max(0.8, sp.end - sp.start)),
          karaokeWords: sp.kws.map(k => ({ w: k.w, start: _r2(Math.max(0, k.start - sp.start)), end: _r2(Math.max(0.1, k.end - sp.start)) })),
        } as ClipText));
        pushHist();
        bersihkanLirikLama(); // 🧹 v13.27: zombie lama dibuang dulu — re-run tak menumpuk
        insertFloatingTexts(texts);
        ccDiag("📝", `${texts.length} baris lirik → TRACK TEKS (lirik lama diganti)`);
        flash(`💬 ${texts.length} baris lirik masuk track teks — ${engine === "ai" ? `diselaraskan ${engineName} 🤖 serasi otomatis!` : `⚠️ perkiraan cerdas — AI belum jalan: ${whisperErr || "kunci belum dipasang"}`}. Baris pertama mulai ${formatDur(texts[0]?.start || 0)} — poles di ⚓ panel ini`);
        setModal(null); setTool(null);
        setLoading(null); setTimeout(() => setStageText(""), 100);
        return;
      }

      const srcUrl = from === "suara" ? (ttsUrl || voiceUrl) : musicUrl;
      if (!srcUrl) throw new Error(from === "suara" ? "Belum ada suara (TTS/rekaman). Buat di menu Audio dulu." : "Belum ada musik di track.");
      const dur = await getAudioDuration(srcUrl);
      if (!dur) throw new Error("Durasi audio tidak terbaca.");

      if (from === "suara" && ttsText.trim() && (srcUrl === ttsUrl)) {
        // AKURAT: teks diketahui → distribusi waktu per karakter
        const sentences = ttsText.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
        const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
        let acc = 0.12;
        const words: CapWord[] = [];
        sentences.forEach((s, li) => {
          const seg = Math.max(0.7, (s.length / totalChars) * (dur - 0.3));
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
        pushHist();
        bersihkanLirikLama(); // 🧹 v13.27
        if (capWords.length) setCapWords([]); // 📝👁️ v13.24: lapisan melayang dikosongkan — tak dobel & tak ghost
        const textsSuara = capWordsToClips(words, ccTpl, ccSize, ccY);
        insertFloatingTexts(textsSuara);
        seekPreview(textsSuara[0]?.start || 0); // jarum lompat → TAMPIL seketika walau belum tekan ▶
        ccDiag("📝", `${textsSuara.length} baris narasi → TRACK TEKS`);
        flash(`💬 ${textsSuara.length} baris keterangan MASUK TRACK TEKS 🎼 (sinkron narasi) — menyala kata demi kata saat waktunya`);
      } else {
        // ⚡ v13.20 SERASI CAPCUT: transkripsi SERVER (Whisper cascade Groq→HCNSEC) — hitungan DETIK,
        // bukan dengar lagu sepanjang durasinya. Pendengar browser jadi cadangan terakhir (diberi tahu jujur).
        let words: CapWord[] = [];
        let gagalW = ""; let engineName2 = ""; let janganDengar = false; // 🔁 v13.23: unggahan potongan gagal → JANGAN lempar ke pendengar 4½ menit
        setStageText("🤖 AI menulis keterangan dari audio — hitungan detik, bukan dengar lagu sampai habis...");
        try {
          const j: any = await transcribeAudio(srcUrl, "", (ccLang || "id-ID").slice(0, 2).toLowerCase(), (m) => setStageText(m)); // 🌍 v14.6: saklar bahasa akhirnya dihormati SERVER (dulu non-id dikirim "" → server maksa "id") // 📦 v13.21: blob HP pun ikut AI · ✂️ v13.22: lagu BESAR dipotong per bagian
          janganDengar = !!(j && j.janganDengar); // 🔁 v13.23
          if (j?.ok && Array.isArray(j.words) && j.words.length) {
              const segs: any[] = Array.isArray(j.segments) ? j.segments : [];
              words = (j.words as any[]).map((w) => {
                let line = 0;
                for (let si = 0; si < segs.length; si++) { line = si; if ((Number(segs[si]?.end) || 0) >= (Number(w?.start) || 0) - 0.05) break; } // kata → baris segmennya
                return { text: String(w?.w || "").trim(), start: Math.max(0.05, Number(w?.start) || 0), end: Math.max(0.1, Number(w?.end) || 0), line };
              }).filter((w) => w.text);
              if (!segs.length && words.length > 8) { // 🧩 v13.27: segmen kosong → JANGAN satu baris raksasa selebar lagu
                let li = 0; let prevE = -99;
                words = words.map((w) => { if (prevE >= 0 && w.start - prevE > 1.1) li++; prevE = w.end; return { ...w, line: li }; });
                ccDiag("🧩", `tanpa segmen — dikelompokkan per jeda hening >1,1s → ${li + 1} baris`);
              }
              if (words.length) { engineName2 = String(j.engine || "Whisper AI"); ccDiag("🧮", `AI balas: ${words.length} kata, ${segs.length} segmen`); }
              else gagalW = "AI tidak menemukan ucapan di audio ini";
          } else gagalW = String(j?.error || "AI tak terjangkau (jaringan)").slice(0, 110);
        } catch { gagalW = "AI tak terjangkau (jaringan)"; }
        let lineNo = words.length ? (words[words.length - 1].line + 1) : 0;
        if (!words.length) {
        // 🔁 v13.23: unggahan potongan gagal = gangguan sesaat → jujur minta ketuk lagi, BUKAN dengar lagu 4½ menit
        if (janganDengar) ccDiag("🛑", "unggah potongan gagal → minta ketuk ulang (BUKAN dengar lagu)");
        if (janganDengar) throw new Error(`📦 ${(gagalW || "potongan lagu gagal terkirim").slice(0, 90)} — itu gangguan sesaat (jaringan/antre AI), bukan vonis harus dengar lagu. Ketuk "Buat keterangan" sekali lagi — potongan biasanya langsung lolos.`);
        ccDiag("🐌", `FALLBACK pendengar browser (cara LAMA) — alasan: ${gagalW.slice(0, 60)}`);
        if (gagalW) flash(`🐌 AI server tak tersedia (${gagalW.slice(0, 70)}) — jatuh ke pendengar browser: lagu DIDENGARKAN sepanjang durasinya, jangan ditutup...`);
        // speech recognition live (Chrome) — CADANGAN TERAKHIR (LAMA: 1× durasi lagu)
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) throw new Error(`Transkripsi AI belum jalan: ${gagalW || "tanpa sebab"} — pasang kunci Grok GRATIS (console.groq.com → API Keys → Vercel GROQ_API_KEY → Redeploy), atau pilih sumber "Lirik lagu" kalau lagunya dari Lahan.`);
        const rec = new SR();
        rec.lang = ccLang; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
        lineNo = 0;
        let lastEndAt = 0; let lastStartAt = 0;
        rec.onresult = (ev: any) => {
          const now = performance.now() / 1000 - t0;
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (!ev.results[i].isFinal) continue;
            const txt = ev.results[i][0].transcript.trim();
            if (!txt) continue;
            const segStart = lastEndAt || Math.max(0.1, lastStartAt);
            const segEnd = Math.max(segStart + 0.6, now - 0.35);
            txt.split(/\s+/).forEach((w: string, wi: number, arr: string[]) => {
              const a = segStart + (segEnd - segStart) * (wi / arr.length);
              const b = segStart + (segEnd - segStart) * ((wi + 1) / arr.length);
              words.push({ text: w, start: a, end: b, line: lineNo });
            });
            lastEndAt = segEnd; lineNo++;
          }
        };
        const a = new Audio(proxifyAudioUrl(srcUrl));
        const t0 = performance.now() / 1000;
        setStageText("🎧 Mendengarkan audio & menulis keterangan... (jangan tutup)");
        await new Promise<void>((res) => {
          a.onended = () => res();
          a.onerror = () => res();
          a.currentTime = 0;
          a.play().then(() => { try { rec.start(); } catch {} }).catch(() => res());
          lastStartAt = 0.1;
          setTimeout(res, (dur + 2) * 1000);
        });
        try { rec.stop(); } catch {}
        }
        if (!words.length) throw new Error(`Tidak ada ucapan terdeteksi${gagalW ? ` — AI server: ${gagalW.slice(0, 60)}` : ""}. Pastikan suara jelas & volume nyala.`);
        // 📝👁️ v13.24 KETERANGAN TAMPIL: tulis ke TRACK TEKS (bukan lapisan melayang tak-kelihatan) —
        // kelihatan LANGSUNG di timeline seperti CapCut + karaoke menyala selaras waktu nyanyi (stempel asli AI).
        pushHist();
        bersihkanLirikLama(); // 🧹 v13.27
        if (capWords.length) setCapWords([]);
        const textsCap = capWordsToClips(words, ccTpl, ccSize, ccY);
        insertFloatingTexts(textsCap);
        seekPreview(textsCap[0]?.start || 0);
        ccDiag("📝", `${textsCap.length} baris keterangan MASUK TRACK TEKS; jarum→${(textsCap[0]?.start || 0).toFixed(1)}s`);
        flash(engineName2 ? `💬 ${textsCap.length} baris keterangan MASUK TRACK TEKS 🎼 — ${engineName2} 🤖 kata demi kata berstempel asli, selaras suara nyanyi!` : `💬 ${textsCap.length} baris keterangan masuk TRACK TEKS (eksperimen — cek hasilnya)`);
      }
      setModal(null); setTool(null);
    } catch (e: any) { ccDiag("💥", String(e?.message || e || "galat tak dikenal").slice(0, 120)); setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 100);
  }
  function clearCaptions() { pushHist(); setCapWords([]); flash("Keterangan dihapus"); }

  /** v8.2.1: geser waktu lirik karaoke — SEMUA sekaligus (onlyId kosong) atau SATU baris. Musik & klip TIDAK ikut. */
  function nudgeLyrics(delta: number, onlyId?: string) {
    pushHist();
    setSlideOptsById(prev => {
      const next: Record<string, SlideOpt> = { ...prev };
      for (const sid of Object.keys(next)) {
        const o: any = next[sid];
        if (!o?.texts?.length) continue;
        let changed = false;
        const texts = o.texts.map((t: any) => {
          if (!/^lyr_/.test(t?.id || "")) return t;
          if (onlyId && t.id !== onlyId) return t;
          changed = true;
          return { ...t, start: Math.max(0, Math.round(((t.start || 0) + delta) * 100) / 100) };
        });
        if (changed) next[sid] = { ...o, texts };
      }
      return next;
    });
    if (!onlyId) setLyrOff(v => Math.round((v + delta) * 10) / 10);
  }
  /** 🎬 v15.4 LIRIK OTOMATIS PAS PER-DETIK — set start ABSOLUT (mis: 1:23.5) untuk satu baris.
   *  Pakai format "M:SS" atau "M:SS.s" atau detik desimal. Mis: "0:23", "1:05.5", "42.7" → 42.7 dtk. */
  function setLyricStart(onlyId: string, timeStr: string) {
    let t = 0;
    const s = String(timeStr || "").trim();
    if (!s) return;
    if (s.includes(":")) {
      const m = s.split(":");
      const mn = Math.max(0, parseInt(m[0] || "0", 10) || 0);
      const sc = Math.max(0, parseFloat(m[1] || "0") || 0);
      t = mn * 60 + sc;
    } else {
      t = Math.max(0, parseFloat(s) || 0);
    }
    pushHist();
    setSlideOptsById(prev => {
      const next: Record<string, SlideOpt> = { ...prev };
      for (const sid of Object.keys(next)) {
        const o: any = next[sid];
        if (!o?.texts?.length) continue;
        let changed = false;
        const texts = o.texts.map((tx: any) => {
          if (!/^lyr_/.test(tx?.id || "")) return tx;
          if (onlyId && tx.id !== onlyId) return tx;
          changed = true;
          return { ...tx, start: Math.max(0, Math.round(t * 100) / 100) };
        });
        if (changed) next[sid] = { ...o, texts };
      }
      return next;
    });
  }

  /** v8.2.1: bersihkan caption bawaan adegan yang MENEMPEL di klip (dari Lahan v8.0) — lirik karaoke baru aman. */
  function clearLegacyPills() {
    const n = lyrScan.legacy;
    if (!n) return;
    if (!confirm(`Hapus ${n} tulisan caption bawaan adegan (yang menempel di tiap klip)? Lirik karaoke baru TIDAK ikut terhapus.\n\nCaption bawaan memang menyatu dengan klipnya — itu yang bikin terasa "lirik gabung sama lagu".`)) return;
    pushHist();
    setSlideOptsById(prev => {
      const next: Record<string, SlideOpt> = { ...prev };
      for (const sid of Object.keys(next)) {
        const o: any = next[sid];
        if (!o?.texts?.length) continue;
        const keep = o.texts.filter((t: any) => !(t.start == null && !(t.karaokeWords?.length) && t.bg === true && typeof t.y === "number" && Math.abs(t.y - 0.84) < 0.02));
        if (keep.length !== o.texts.length) {
          const o2 = { ...o, texts: keep };
          if (!keep.length) delete o2.texts;
          next[sid] = o2;
        }
      }
      return next;
    });
    flash("🧹 Caption bawaan adegan dibersihkan — lirik kini bebas dari klip");
  }

  /* ---------- AKHIRAN (outro) ---------- */
  function makeOutroImage(txt: string): string {
    const ar = ratio === "9:16" ? [720, 1280] : ratio === "1:1" ? [1080, 1080] : [1280, 720];
    const c = document.createElement("canvas"); c.width = ar[0]; c.height = ar[1];
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#0b3b3a"); g.addColorStop(1, "#0b0b14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 2;
    for (let i = -8; i < 14; i++) { ctx.beginPath(); ctx.moveTo(i * 120, 0); ctx.lineTo(i * 120 + 400, c.height); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#19c2b8";
    ctx.font = `900 ${Math.round(c.width * 0.09)}px 'Anton',Impact,sans-serif`;
    ctx.fillText("VERVE", c.width / 2, c.height * 0.42);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `600 ${Math.round(c.width * 0.032)}px 'Poppins',sans-serif`;
    ctx.fillText(txt || "Terima kasih sudah menonton 🙏", c.width / 2, c.height * 0.55);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = `600 ${Math.round(c.width * 0.024)}px 'Poppins',sans-serif`;
    ctx.fillText("dibuat dengan VERVE di HP 📱", c.width / 2, c.height * 0.62);
    return c.toDataURL("image/jpeg", 0.85);
  }
  function addOutro() {
    pushHist();
    const txt = prompt("Teks penutup:", "Terima kasih sudah menonton 🙏");
    if (txt === null) return;
    const o = { id: uid("outro"), imageUrl: makeOutroImage(txt) };
    setSlides(c => [...c, o]);
    setOpt(o.id, { dur: 2.2, trans: "fadeblack" });
    flash("🏁 Akhiran ditambahkan");
  }

  /* ---------- TEKS (MULTI-LAPIS: satu klip bisa banyak teks) ---------- */
  const [textEditingId, setTextEditingId] = useState("");
  const [textEditingTid, setTextEditingTid] = useState(""); // "" = lapisan utama
  // akses teks per-lapisan (lapisan utama = SlideOpt.text · tambahan = SlideOpt.texts[])
  function getTextOf(sid: string, tid: string): ClipText | null {
    const o = slideOptsById[sid]; if (!o) return null;
    if (!tid) return o.text || null;
    return (o.texts || []).find(x => x.id === tid) || null;
  }
  function setTextObj2(sid: string, tid: string, patch: Partial<ClipText>) {
    const o = slideOptsById[sid]; if (!o) return;
    if (!tid) { const cur = o.text || { ...DEFAULT_TEXT }; setOpt(sid, { text: { ...cur, ...patch } }); return; }
    setOpt(sid, { texts: (o.texts || []).map(x => x.id === tid ? { ...x, ...patch } : x) } as Partial<SlideOpt>);
  }
  function delTextObj(sid: string, tid: string) {
    if (!tid) { setOpt(sid, { text: null } as Partial<SlideOpt>); return; }
    setOpt(sid, { texts: (slideOptsById[sid]?.texts || []).filter(x => x.id !== tid) } as Partial<SlideOpt>);
  }

  /* ===== v8.3: OBJEK TERPILIH — aksi cepat (Edit / Duplikat / Hapus) ala CapCut ===== */
  function selTextInfo(): { sid: string; tid: string } | null {
    const raw = selTextSidRef.current;
    if (!raw) return null;
    const ci = raw.indexOf("::");
    return { sid: ci < 0 ? raw : raw.slice(0, ci), tid: ci < 0 ? "" : raw.slice(ci + 2) };
  }
  function editSelText() {
    const inf = selTextInfo(); if (!inf) return;
    startTextEdit(inf.sid, inf.tid);
  }
  function dupSelText() {
    const inf = selTextInfo(); if (!inf) return;
    const cur = getTextOf(inf.sid, inf.tid); if (!cur) return;
    pushHist();
    const nid = uid("tx");
    const clone: ClipText = { ...cur, id: nid, start: _r2((cur.start ?? 0) + 0.4) };
    const o = slideOptsById[inf.sid] || {};
    setOpt(inf.sid, { texts: [...((o as any).texts || []), clone] } as Partial<SlideOpt>);
    setSelTextSid(selTextEncode(inf.sid, nid));
    flash("⧉ Teks digandakan — jalur baru dibuat di track");
  }
  function delSelObj() {
    if (selStik) {
      pushHist();
      delSticker(selStik.sid, selStik.stid);
      setSelStik(null);
      flash("🗑 Stiker dihapus");
      return;
    }
    const inf = selTextInfo(); if (!inf) return;
    pushHist();
    delTextObj(inf.sid, inf.tid);
    setSelTextSid("");
    flash("🗑 Teks dihapus dari track");
  }
  const selTextEncode = (sid: string, tid: string) => (tid ? `${sid}::${tid}` : sid);
  // id = klip (opsional) · tid = lapisan tertentu (opsional — kalau diisi, langsung edit lapisan itu, tanpa bikin baru)
  function startTextEdit(id?: string, tid?: string | null) {
    let sid = id || selId;
    if (!sid) {
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      sid = L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id || "";
      if (sid) setSelId(sid);
    }
    if (!sid) return;
    if (tid !== undefined && tid !== null) {
      setTextEditingId(sid); setTextEditingTid(tid);
      setTool("teksedit"); setClipBar(false);
      return;
    }
    const o = slideOptsById[sid];
    // TEKS BARU selalu lahir sebagai TEKS LEPAS mulai di POSISI PENANDA (rol) — bukan nempel di awal klip
    const startAt = Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100;
    if (!o?.text) {
      setOpt(sid, { text: { ...DEFAULT_TEXT, txt: "", start: startAt, dur: 3 } });
      setTextEditingId(sid); setTextEditingTid("");
      setSelTextSid(sid);
      flash(`🔤 Teks baru mulai di ${formatDur(startAt)} — jalur baru dibuat, geser sesukamu!`);
    } else if (o.text.txt?.trim()) {
      // lapisan utama sudah berisi → buat LAPISAN BARU (maks 8 teks per klip, jalur total tak terbatas)
      const layers = (o.texts || []).filter(x => x.txt?.trim()).length + 1;
      if (layers >= 8) { flash("🚫 Maksimal 8 lapisan teks per klip bro"); return; }
      const nt: ClipText = { ...DEFAULT_TEXT, id: uid("tx"), txt: "", y: Math.max(0.08, (o.text.y ?? 0.82) - 0.16 * layers), start: startAt, dur: 3 };
      setOpt(sid, { texts: [...(o.texts || []), nt] } as Partial<SlideOpt>);
      setTextEditingId(sid); setTextEditingTid(nt.id!);
      setSelTextSid(selTextEncode(sid, nt.id!));
      flash(`🔤 Lapisan teks #${layers + 1} mulai di ${formatDur(startAt)}!`);
    } else {
      // lapisan utama ada tapi masih kosong → pakai, jadikan lepas di penanda kalau belum punya waktu
      setOpt(sid, { text: { ...o.text, start: o.text.start ?? startAt, dur: o.text.dur ?? 3 } });
      setTextEditingId(sid); setTextEditingTid("");
      setSelTextSid(sid);
    }
    setTool("teksedit"); setClipBar(false);
  }
  function setTextObj(id: string, patch: Partial<ClipText>) {
    setTextObj2(id, "", patch);
  }
  // ketuk chip teks di track → PILIH teksnya di layar (bingkai muncul, jarum pindah ke teksnya);
  // ketuk chip yang sama lagi → buka editor teks. tid = id lapisan ("" = utama)
  function onTextChipTap(sid: string, tid: string = "") {
    const o = getTextOf(sid, tid);
    if (!o?.txt?.trim()) { startTextEdit(sid, tid); return; }
    const enc = selTextEncode(sid, tid);
    if (selTextSidRef.current === enc && selId === sid) { startTextEdit(sid, tid); return; }
    setSelTextSid(enc);
    if (selId !== sid) setSelId(sid);
    const i = slides.findIndex(s => s.id === sid);
    const st = o.start ?? (timeline?.starts?.[i] || 0);
    const dd = o.dur ?? (timeline?.durs?.[i] || 3);
    seekPreview(st + Math.max(0.01, Math.min(dd / 2, dd - 0.05)));
    flash("🔤 Teks dipilih — seret 1 jari utk geser · cubit 2 jari utk ukuran · ketuk chip lagi utk edit");
  }

  /* ---------- STIKER ---------- */
  function addSticker(emoji: string, img?: string) {
    let sid = selId;
    if (!sid) {
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      sid = L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id || "";
      if (sid) setSelId(sid);
    }
    if (!sid) { flash("Tambahkan klip dulu"); return; }
    const cur = slideOptsById[sid]?.stickers || [];
    const startAt = Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100; // lahir di posisi penanda
    const st: StickerItem = { id: uid("st"), emoji, x: 0.5,
      y: emoji === "@bars" ? 0.86 : emoji === "@cta" ? 0.14 : emoji === "@wavepro" ? 0.8 : emoji === "@ring" ? 0.46 : emoji.startsWith("@") ? 0.72 : 0.4, // 🎬 v13.4/v13.8: posisi lahir tiap stiker musik-CTA
      size: emoji === "@bars" ? 0.17 : emoji === "@cta" ? 0.13 : emoji === "@wavepro" || emoji === "@ring" ? 0.2 : emoji.startsWith("@") ? 0.07 : 0.12,
      rot: 0, img, start: startAt, dur: emoji === "@bars" || emoji === "@cta" || emoji === "@wavepro" || emoji === "@ring" ? 6 : 3 };
    setOpt(sid, { stickers: [...cur, st] } as Partial<SlideOpt>);
    setSelStik({ sid, stid: st.id }); // langsung terpilih → bisa digeser/di-cubit saat itu juga
    flash(img ? `🖼️ Overlay foto ditambahkan mulai ${formatDur(startAt)}` : `${emoji.startsWith("@") ? "✨ Stiker animasi" : emoji} ditambahkan mulai ${formatDur(startAt)} — jalur baru dibuat!`);
  }
  function moveSticker(sid: string, stid: string, x: number, y: number) {
    const stks = (slideOptsById[sid]?.stickers || []).map(s => s.id === stid ? { ...s, x: clampN(x, 0.05, 0.95), y: clampN(y, 0.05, 0.95) } : s);
    setOpt(sid, { stickers: stks } as Partial<SlideOpt>);
  }
  // geser chip TEKS di track → teks punya waktu mulai sendiri (lepas dari klip) — per lapisan
  function moveTextStart(sid: string, tid: string, sec: number) {
    const cur = getTextOf(sid, tid); if (!cur) return;
    const i = slides.findIndex(x => x.id === sid);
    const clipDur = timeline?.durs?.[i] || 3;
    setTextObj2(sid, tid, { start: Math.round(clampN(sec, 0, 7190) * 100) / 100, dur: cur.dur ?? clipDur });
  }
  // tarik ujung kanan chip teks → durasi tampilnya
  function moveTextDur(sid: string, tid: string, sec: number) {
    const cur = getTextOf(sid, tid); if (!cur) return;
    const i = slides.findIndex(x => x.id === sid);
    const clipStart = timeline?.starts?.[i] || 0;
    setTextObj2(sid, tid, { dur: Math.round(clampN(sec, 0.5, 600) * 10) / 10, start: cur.start ?? clipStart });
  }
  // v8.5: objek pindah BARIS jalur — berbagi jalur BOLEH, yang dilarang cuma NUMPUK waktu dengan objek lain
  function moveTextRow(sid: string, tid: string, row: number) {
    const r = Math.max(0, Math.round(row));
    setTextObj2(sid, tid, { row: r } as Partial<ClipText>);
    flash("🔤 Teks pindah ke jalur " + (r + 1));
  }
  function moveStickerRow(sid: string, stid: string, row: number) {
    const r = Math.max(0, Math.round(row));
    const list = slideOptsById[sid]?.stickers || [];
    setOpt(sid, { stickers: list.map(x => x.id === stid ? { ...x, row: r } : x) } as Partial<SlideOpt>);
    flash("😀 Stiker pindah ke jalur " + (r + 1));
  }
  // geser chip STIKER di track → stiker punya waktu mulai sendiri (lepas dari klip)
  function moveStickerStart(sid: string, stid: string, sec: number) {
    const i = slides.findIndex(x => x.id === sid);
    const clipDur = timeline?.durs?.[i] || 3;
    const list = slideOptsById[sid]?.stickers || [];
    setOpt(sid, { stickers: list.map(x => x.id === stid ? { ...x, start: Math.round(clampN(sec, 0, 7190) * 100) / 100, dur: x.dur ?? clipDur } : x) } as Partial<SlideOpt>);
  }
  // tarik ujung kanan chip stiker → durasi tampilnya
  function moveStickerDur(sid: string, stid: string, sec: number) {
    const i = slides.findIndex(x => x.id === sid);
    const clipStart = timeline?.starts?.[i] || 0;
    const list = slideOptsById[sid]?.stickers || [];
    setOpt(sid, { stickers: list.map(x => x.id === stid ? { ...x, dur: Math.round(clampN(sec, 0.3, 600) * 10) / 10, start: x.start ?? clipStart } : x) } as Partial<SlideOpt>);
  }
  // ketuk chip stiker di track → PILIH stikernya di layar (bingkai); ketuk chip lagi → buka panel stiker
  function onStickerChipTap(sid: string, stid: string) {
    const already = selStikRef.current;
    if (already && already.sid === sid && already.stid === stid && selId === sid) { setTool("stiker"); setSheetTab(""); setClipBar(false); return; }
    const st = (slideOptsById[sid]?.stickers || []).find(x => x.id === stid);
    if (!st) return;
    pilihObjek("stiker"); setSelStik({ sid, stid });
    if (selId !== sid) setSelId(sid);
    const i = slides.findIndex(s => s.id === sid);
    const t0 = st.start ?? (timeline?.starts?.[i] || 0);
    const dd = st.dur ?? (timeline?.durs?.[i] || 3);
    seekPreview(t0 + Math.max(0.01, Math.min(dd / 2, dd - 0.05)));
    flash("😀 Stiker dipilih — seret 1 jari utk geser · cubit = ukuran · putar 2 jari = rotasi · ketuk chip lagi utk kelola");
  }
  function delSticker(sid: string, stid: string) {
    setOpt(sid, { stickers: (slideOptsById[sid]?.stickers || []).filter(s => s.id !== stid) } as Partial<SlideOpt>);
  }
  function uploadOverlayImg(f: FileList | null) {
    if (!f || !f.length) return;
    const r = new FileReader();
    r.onload = () => addSticker("@img", r.result as string ? (r.result as string) : undefined);
    r.readAsDataURL(f[0]);
  }

  /* ---------- METADATA YOUTUBE ---------- */
  const [meta, setMeta] = useState<any | null>(null);
  const [copiedFld, setCopiedFld] = useState("");
  async function genMetadata() {
    setLoading("meta"); setError(""); setMeta(null);
    try {
      const r = await fetch("/api/hcnsec/metadata", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: projTitle, keyword: niche || projTitle, niche: niche || projTitle }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `Error ${r.status}`);
      // 🏷 v13.7 JUDUL TERKUNCI — judul utama SELALU persis judul pilihanmu di tahap Judul (Lahan);
      // AI hanya membantu deskripsi/tags/hashtags + usulan alternatif di bawahnya.
      const locked = (projTitle || "").trim();
      if (locked) {
        d.titleHighCTR = locked;
        d.titleAlternatives = (d.titleAlternatives || []).filter((t: string) => (t || "").trim() && (t || "").trim() !== locked);
      }
      setMeta(d);
      flash("📋 Metadata siap — judul mengikuti judul terkuncimu ✓");
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }
  /* 🖼 v13.7 THUMBNAIL OTOMATIS — High-CTR dari judul terkunci + adegan video */
  const [thumbU, setThumbU] = useState("");
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbIdx, setThumbIdx] = useState(0);
  const [thumbSalt, setThumbSalt] = useState(0);
  const thumbBlobRef = useRef<Blob | null>(null);
  async function genThumb(saltOv?: number, idxOv?: number, quiet?: boolean) {
    if (!slides.length) { if (!quiet) flash("Belum ada adegan — tambahkan klip dulu bro"); return; }
    const s2 = saltOv ?? thumbSalt;
    const i2 = (((idxOv ?? thumbIdx) % slides.length) + slides.length) % slides.length;
    setThumbSalt(s2); setThumbIdx(i2);
    setThumbBusy(true);
    try {
      const img = getImage(slides[i2]?.imageUrl || "");
      const blob = await makeAutoThumbBlob(img, projTitle || "Cerita Jadi Lagu", niche || "cerita jadi lagu", s2);
      thumbBlobRef.current = blob;
      setThumbU((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
      if (!quiet) flash("🖼 Thumbnail High-CTR siap — tinggal download!");
    } catch { if (!quiet) flash("⚠️ Thumbnail gagal dirakit — coba lagi ya bro"); }
    setThumbBusy(false);
  }
  function downloadThumb() {
    const b = thumbBlobRef.current; if (!b) return;
    downloadBlob(b, `thumb_${(projTitle || "verve").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 30) || "verve"}_${Date.now()}.jpg`);
    flash("⬇ Thumbnail 1280×720 terdownload — tinggal pasang di YouTube");
  }
  async function copyFld(k: string, t: string) {
    if (await copyTxt(t)) { setCopiedFld(k); setTimeout(() => setCopiedFld(""), 1400); }
  }
  function downloadMetaTxt() {
    if (!meta) return;
    const txt = `=== JUDUL (High CTR) ===\n${meta.titleHighCTR || ""}\n\n=== ALTERNATIF ===\n${(meta.titleAlternatives || []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}\n\n=== DESKRIPSI ===\n${meta.description || ""}\n\n=== TAGS ===\n${(meta.tags || []).join(", ")}\n\n=== HASHTAGS ===\n${meta.hashtags || ""}\n\nDibuat dengan VERVE`;
    downloadBlob(new Blob([txt], { type: "text/plain;charset=utf-8" }), `meta_${Date.now()}.txt`);
  }

  /* ---------- RENDER VIDEO ---------- */
  async function doRender() {
    if (!slides.length) return setErr({ message: "Belum ada media — tambahkan klip dulu" });
    setLoading("render"); setError(""); setProgress(0);
    setVideoUrl(u => { if (u) URL.revokeObjectURL(u); return ""; });
    setVideoBlob(null);
    setStageText("Menyiapkan render...");
    let wakeLock: any = null;
    let lastBeat = 0; let rendering = false; let relock: any = null; let macetItv: any = null; // 🛡 v14.7 RENDER JAGA
    try {
      await ensureFontsLoaded().catch(() => {});
      // v8.1: tahan layar tetap menyala selama render (HP lock = render rusak/kepotong)
      try { wakeLock = await (navigator as any).wakeLock?.request?.("screen"); } catch {}
      // 🛡 v14.7 RENDER JAGA — (a) layar DITAHAN ULANG otomatis tiap kembali dari minimize/lock (HP mencabut izin diam-diam)
      lastBeat = performance.now(); rendering = true;
      relock = async () => { if (rendering && document.visibilityState === "visible") { try { wakeLock = await (navigator as any).wakeLock?.request?.("screen"); } catch {} } };
      document.addEventListener("visibilitychange", relock);
      // 🛡 (c) DETEKTOR MACET JUJUR: frame diam >4dtk saat layar terlihat = dikabari manusiawi, tak lagi diam membisu
      macetItv = setInterval(() => { const diam = (performance.now() - lastBeat) / 1000; if (rendering && diam > 4 && document.visibilityState === "visible") setStageText(`⚠️ Render tampak macet ${Math.round(diam)} dtk — usahakan TIDAK pindah aplikasi; kalau diam terus, ulangi render ya bro`); }, 1500);
      // v8.1: lewati klip tanpa gambar (dataURL raksasa dipangkas hemat memori saat simpan draf)
      const useSlides = slides.filter(s => s.imageUrl && s.imageUrl.length > 8);
      if (!useSlides.length) throw new Error("Semua klip tidak punya gambar (data terpangkas hemat memori) — rakit ulang draf dari Lahan ya bro.");
      if (useSlides.length !== slides.length) flash(`⚠️ ${slides.length - useSlides.length} klip tanpa gambar dilewati`);
      const duck = (ttsUrl || voiceUrl) ? 0.4 : 1; // musik diturunkan tipis kalau ada suara
      const parts: { url: string; gain: number; fadeIn?: number; fadeOut?: number; off?: number }[] = [];
      if (musicUrl) parts.push({ url: proxifyAudioUrl(musicUrl), gain: musicVol * duck, fadeIn: musicFadeIn, fadeOut: musicFadeOut, off: musicOff });
      if (ttsUrl) parts.push({ url: proxifyAudioUrl(ttsUrl), gain: voiceVol, off: ttsOff });
      if (voiceUrl) parts.push({ url: proxifyAudioUrl(voiceUrl), gain: voiceVol, off: voiceOff });
      let audioUrl: string | null = null;
      const single = parts.length === 1 ? parts[0] : null;
      const singleClean = single && Math.abs(single.gain - 1) < 0.01 && !single.fadeIn && !single.fadeOut && !(single.off && single.off > 0.01);
      if (singleClean) audioUrl = single!.url;
      else if (parts.length >= 1) audioUrl = await mixAudioUrls(parts);

      const orderedOpts: SlideOpt[] = useSlides.map(s => {
        const o = { ...(slideOptsById[s.id] || {}) } as SlideOpt;
        if (o.text && !o.text.txt?.trim()) delete o.text;
        if (o.texts) { o.texts = o.texts.filter((x: ClipText) => x?.txt?.trim()); if (!o.texts.length) delete o.texts; }
        return o;
      });
      const gf = buildClipFilter(filterPreset, qualitySharp ? { ...adj } : adj);
      const resMap: Record<number, [number, number]> = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
      const [w, h] = resMap[exRes] || [1280, 720];
      // ⏱ v13.10 ETA JUJUR — jam baru berjalan saat FRAME PERTAMA keluar. Dulu dihitung sejak tombol
      // dipencet → setup (decode lagu + analisis FFT + muat gambar ≈ 30–60d) ikut terproyeksi →
      // ETA bohong menjerit "34 menit" di progres 2% (laporan bro). Sekarang: laju frame murni.
      let rEta0 = 0;
      const renderEta = (p: number): string => {
        if (!rEta0) return "menghitung…";
        const dt = (performance.now() - rEta0) / 1000;
        const eta = Math.ceil((dt / Math.max(p, 0.01)) * (1 - p));
        return formatDur(Math.max(0, Math.min(eta, 5999)));
      };
      const blob = await renderSlideshow({
        images: useSlides.map(s => s.imageUrl),
        videos: useSlides.map(s => s.videoUrl || null), // 🎬 v11.8: klip animasi ikut di-render
        audioUrl: audioUrl || undefined,
        slideDuration,
        transitionDuration: transitionDur,
        slideOpts: orderedOpts,
        cinebars: cineBars, // 🎬 v13.5
        videoFilter: gf === "none" ? undefined : gf,
        vignetteStrength: clampN((adj.vig / 100) * 0.8, 0, 1),
        grainAmt: adj.grain,
        vizStyle: "minimal" as any, vizColor: "#19c2b8",
        lyrics: undefined,
        captions: capWords.length ? capWords as any : undefined,
        captionStyle: (capWords.length ? capStyle : "none") as any,
        quality: "high", ratio, aspectRatio: ratio,
        transition: "fade" as any,
        showTitle: false, showLyrics: false,
        custom: { w, h, fps: exFps, videoBitrate: exMbps * 1_000_000 },
        bgMode, bgColor,
        sharpen: qualitySharp,
        mobileOptimized: isMobile,
        onProgress: (p: number) => { lastBeat = performance.now(); /* 🛡 v14.7 denyut */ if (!rEta0 && p > 0) rEta0 = performance.now(); setProgress(p); if (p > 0.005 && p < 0.98) setStageText(`⚡ Rendering ${Math.round(p * 100)}% · ± sisa ${renderEta(p)}`); },
        onStage: (s: string) => setStageText(s),
      } as any);
      // v8.1 SANITY: file super-kecil untuk durasi panjang = render busuk (frame kosong)
      const durGuess = Math.max(clipsTotal || 0, musicDur || 0);
      if (durGuess > 15 && blob.size < 150_000) {
        throw new Error(`File render cuma ${(blob.size / 1024).toFixed(0)} KB untuk video ${Math.round(durGuess)} detik — ada yang ganjil. Coba Render Ulang ya bro.`);
      }
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      // 📼🔒 v13.6: SALIN ke brankas — hasil selamat walau Chrome keburu ditutup sebelum download
      vaultSave(blob, `${(projTitle || "verve").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 40)}_${Date.now()}.${(blob.type || "").includes("mp4") ? "mp4" : "webm"}`);
      setProgress(1); flash("✅ Video selesai!");
      persistSnapshot(true);
      genMetadata().catch(() => {});
    } catch (e: any) { setErr(e); }
    finally { rendering = false; if (relock) document.removeEventListener("visibilitychange", relock); if (macetItv) clearInterval(macetItv); try { wakeLock?.release?.(); } catch {} } // 🛡 v14.7: jagaan dicopot rapi
    setLoading(null); setTimeout(() => setStageText(""), 2500);
  }
  async function doRenderGif() {
    if (!slides.length) return setErr({ message: "Belum ada media" });
    if ((timeline?.total || 0) > 8.2) { if (!confirm("GIF dibatasi 8 detik pertama. Lanjut?")) return; }
    setLoading("gif"); setError(""); setProgress(0);
    setStageText("Merangkai GIF...");
    try {
      await ensureFontsLoaded().catch(() => {});
      const orderedOpts = slides.map(s => ({ ...(slideOptsById[s.id] || {}) } as SlideOpt));
      const gf = buildClipFilter(filterPreset, adj);
      const blob = await renderGif({
        images: slides.map(s => s.imageUrl),
        slideOpts: orderedOpts as any,
        cinebars: cineBars, // 🎬 v13.5
        slideDuration, transition, transitionDur,
        ratio, videoFilter: gf === "none" ? undefined : gf,
        grainAmt: adj.grain, bgMode, bgColor,
        onProgress: (p: number) => setProgress(p),
      } as any);
      downloadBlob(blob, `verve_${Date.now()}.gif`);
      flash("✅ GIF terunduh");
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 1500);
  }
  function downloadVideo() {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${projTitle.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 40) || "verve"}_${Date.now()}.${ext}`);
  }

  /* ---------- WIZARD AI ---------- */
  const [wzNiche, setWzNiche] = useState("");
  const [wzN, setWzN] = useState(4);
  const [wzStyle, setWzStyle] = useState("cinematic");
  const [wzAudio, setWzAudio] = useState<"none" | "tts" | "suno">("tts");
  async function runWizard() {
    if (!wzNiche.trim()) return setErr({ message: "Isi ide/niche dulu bro" });
    setLoading("wizard"); setError("");
    try {
      setNiche(wzNiche);
      setStageText("🧠 Menulis judul...");
      const kr = await fetch("/api/hcnsec/titles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: wzNiche, niche: wzNiche, n: 1 }) });
      const kd = await kr.json().catch(() => ({}));
      const title = (kd.titles?.[0] || wzNiche).slice(0, 90);
      setProjTitle(title);
      setStageText(`🎨 Generate ${wzN} gambar AI...`);
      const newSlides: Slide[] = [];
      for (let i = 0; i < wzN; i++) {
        setStageText(`🎨 Gambar ${i + 1}/${wzN}...`);
        try {
          const res = await fetch("/api/hcnsec/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, keyword: wzNiche, niche: wzNiche, style: wzStyle }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error) continue;
          const img = await new Promise<HTMLImageElement>((res2, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res2(im); im.onerror = rej; im.src = data.url; });
          newSlides.push({ id: uid("ai"), imageUrl: fitMax(img, 2048) });
        } catch {}
      }
      if (!newSlides.length) throw new Error("Semua gambar gagal dibuat — coba style Studio atau upload manual.");
      pushHist();
      setSlides(newSlides);
      if (wzAudio === "tts") {
        setStageText("📝 Menulis naskah narasi...");
        try {
          const sr = await fetch("/api/hcnsec/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, keyword: wzNiche, slides: wzN }) });
          const sd = await sr.json().catch(() => ({}));
          const text = (sd.lines || []).join(" ").trim();
          if (text) {
            setTtsText(text);
            setStageText("🗣️ Membuat suara narasi...");
            const tr = await fetch("/api/hcnsec/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3500), voice: "nova" }) });
            const td = await tr.json().catch(() => ({}));
            if (td.url) { setTtsUrl(td.url); getAudioDuration(td.url).then(setTtsDur); }
          }
        } catch {}
      } else if (wzAudio === "suno") {
        setStageText("🎼 Menulis lirik lagu...");
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const lr = await fetch("/api/hcnsec/lyrics", { method: "POST", headers, body: JSON.stringify({ title, keyword: wzNiche, niche: wzNiche, genre: mGenre, mood: mMood }) });
          const ld = await lr.json().catch(() => ({}));
          if (ld.lyrics) setMLyrics(ld.lyrics);
          if (ld.title) setMTitle(ld.title.slice(0, 80)); else setMTitle(title);
          setMStyle(ld.style_prompt_suno || [mGenre, mMood, "indonesian"].join(", "));
          setTimeout(() => doSuno(), 300);
        } catch {}
      }
      setModal(null);
      flash(`✅ Proyek "${title.slice(0, 30)}" siap diedit!`);
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 2000);
  }

  /* ================= UI (JSX) ================= */
  const uhdLabel = exRes >= 1440 ? (exRes === 1440 ? "2K" : "4K") : `${exRes}p`;
  const estMB = (exMbps * 1_000_000 / 8) * Math.max(clipsTotal, 1) / (1024 * 1024);
  // 🎬 v15.5 RENDER CEPAT — estimasi kasar durasi render (detik). Faktor kasar: makin kecil
  // resolusi + fps → makin cepet. 480p·18 di HP mid = ~6× real-time, 1080p·30 = ~1× real-time.
  const renderSpeedFactor = exRes <= 480 && exFps <= 20 ? 6 : exRes <= 720 && exFps <= 24 ? 2.5 : exRes <= 1080 && exFps <= 30 ? 1 : 0.5;
  const estRenderSec = Math.max(2, Math.round(clipsTotal / renderSpeedFactor));
  void histTick;

  function stagePoint(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = canvasRef.current; if (!cv) return null;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  const dragSt = useRef<{ sid: string; stid: string; x0: number; y0: number; moved: boolean; wasSel: boolean } | null>(null);
  const dragTx = useRef<{ sid: string; tid: string; x0: number; y0: number; moved: boolean; wasSel: boolean } | null>(null);
  const pinchTxtRef = useRef<{ sid: string; tid: string; d0: number; s0: number } | null>(null);
  const pinchStikRef = useRef<{ sid: string; stid: string; d0: number; size0: number; ang0: number; rot0: number } | null>(null);
  // ambil teks yang sedang terpilih (multi-lapis aware: "sid" atau "sid::tid")
  function getSelText(): { sid: string; tid: string; ct: ClipText | null } {
    const raw = selTextSidRef.current;
    if (!raw) return { sid: "", tid: "", ct: null };
    const ci = raw.indexOf("::");
    const sid = ci < 0 ? raw : raw.slice(0, ci);
    const tid = ci < 0 ? "" : raw.slice(ci + 2);
    return { sid, tid, ct: getTextOf(sid, tid) };
  }
  /* ---- GESER & CUBIT GAMBAR di dalam bingkai rasio (ala CapCut) ----
     1 jari = geser posisi gambar, 2 jari = zoom gambar.
     Nilai tersimpan per-klip (tx/ty/tz di slideOpts) → terkunci & ikut terekspor. */
  const ptrsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ sid: string; d0: number; tz0: number } | null>(null);
  const panClipRef = useRef<{ sid: string; x0: number; y0: number; tx0: number; ty0: number; w: number; h: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  function clipAtPlayhead(): string | null {
    const tl = timelineRef.current;
    if (!tl || !slidesRef.current.length) return null;
    const L = locate(tl, Math.min(curTRef.current, Math.max(0, tl.total - 0.001)));
    return slidesRef.current[L.idx]?.id || null;
  }
  function resetClipTransform(sid?: string | null) {
    const id = sid || selId || clipAtPlayhead();
    if (!id) return;
    setOpt(id, { tx: 0, ty: 0, tz: 1 });
    flash("↺ Posisi & ukuran gambar dikembalikan");
  }
  function pinchDist(): number | null {
    const pts = [...ptrsRef.current.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : null;
  }
  function pinchAngle(): number | null {
    const pts = [...ptrsRef.current.values()];
    return pts.length >= 2 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : null;
  }
  function onStageDown(e: React.PointerEvent) {
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
    if (ptrsRef.current.size >= 2) {
      // jari ke-2 → cubit: TEKS terpilih = ukuran huruf · STIKER terpilih = ukuran + PUTARAN · selain itu = zoom GAMBAR klip
      const d = pinchDist();
      const tsel = getSelText();
      const tct = tsel.ct;
      const ssel = selStikRef.current;
      const sstk = ssel ? (slideOptsById[ssel.sid]?.stickers || []).find(x => x.id === ssel.stid) : null;
      if (tsel.sid && tct?.txt?.trim() && d) {
        pinchTxtRef.current = { sid: tsel.sid, tid: tsel.tid, d0: Math.max(10, d), s0: tct.size || 0.055 };
      } else if (ssel && sstk && d) {
        const a0 = pinchAngle() ?? 0;
        pinchStikRef.current = { sid: ssel.sid, stid: ssel.stid, d0: Math.max(10, d), size0: sstk.size || 0.12, ang0: a0, rot0: sstk.rot || 0 };
      } else {
        const sid = clipAtPlayhead();
        if (sid && d) {
          pinchRef.current = { sid, d0: Math.max(10, d), tz0: slideOptsById[sid]?.tz ?? 1 };
          setSelId(sid);
        }
      }
      dragSt.current = null; dragTx.current = null; panClipRef.current = null;
      return;
    }
    // ketuk ganda cepat → reset ukuran TEKS (kalau ada teks terpilih) / reset transform klip
    const nowT = performance.now();
    const dtap = nowT - lastTapRef.current < 320;
    lastTapRef.current = nowT;
    const pt = stagePoint(e); if (!pt) return;
    const tl = timelineRef.current;
    if (!tl || !slidesRef.current.length) return;
    const L = locate(tl, Math.min(curT, Math.max(0, tl.total - 0.001)));
    const sid = slidesRef.current[L.idx]?.id;
    if (!sid) return;
    if (dtap) {
      const tsel = getSelText();
      if (tsel.sid && tsel.ct?.txt?.trim()) {
        setTextObj2(tsel.sid, tsel.tid, { size: DEFAULT_TEXT.size });
        flash("↺ Ukuran teks dikembalikan");
        return;
      }
      const ssel0 = selStikRef.current;
      const sstk0 = ssel0 ? (slideOptsById[ssel0.sid]?.stickers || []).find(x => x.id === ssel0.stid) : null;
      if (ssel0 && sstk0) {
        const list = slideOptsById[ssel0.sid]?.stickers || [];
        setOpt(ssel0.sid, { stickers: list.map(x => x.id === ssel0.stid ? { ...x, size: 0.12, rot: 0 } : x) } as Partial<SlideOpt>);
        flash("↺ Ukuran & putaran stiker dikembalikan");
        return;
      }
      resetClipTransform(sid); return;
    }
    // === HIT DULU (anti "saling keterikatan"): sentuhan MENANG — kena teks/stiker mana pun
    // langsung PINDAH seleksi ke situ & seret itu, walau sebelumnya elemen lain yang terpilih ===
    const tNowT = Math.min(curT, Math.max(0, tl.total - 0.001));
    // kandidat teks terlihat (semua lapisan klip aktif + lepas waktu)
    const tCands: { sid: string; tid: string; ct: ClipText }[] = [];
    const oCur = slideOptsById[sid];
    if (oCur?.text?.txt?.trim() && oCur.text.start == null) tCands.push({ sid, tid: "", ct: oCur.text });
    (oCur?.texts || []).forEach((x: ClipText) => { if (x?.txt?.trim() && x.start == null) tCands.push({ sid, tid: x.id || "", ct: x }); });
    for (const sl0 of slidesRef.current) {
      const o0 = slideOptsById[sl0.id];
      for (const ct0 of allClipTexts(o0)) {
        if (ct0.start == null) continue;
        const dd0 = ct0.dur && ct0.dur > 0 ? ct0.dur : 3;
        if (tNowT >= ct0.start && tNowT < ct0.start + dd0) {
          tCands.push({ sid: sl0.id, tid: o0?.text === ct0 ? "" : (ct0.id || ""), ct: ct0 });
        }
      }
    }
    for (let ci = tCands.length - 1; ci >= 0; ci--) {
      const cd = tCands[ci];
      if (Math.abs(pt.y - cd.ct.y) < 0.08 && Math.abs(pt.x - (cd.ct.x ?? 0.5)) < 0.32) {
        const enc = selTextEncode(cd.sid, cd.tid);
        const wasSel = selTextSidRef.current === enc;
        if (!wasSel) { pilihObjek("teks"); setSelTextSid(enc); if (selId !== cd.sid) setSelId(cd.sid); }
        dragTx.current = { sid: cd.sid, tid: cd.tid, x0: e.clientX, y0: e.clientY, moved: false, wasSel };
        return;
      }
    }
    // kandidat stiker terlihat (ikut klip aktif + lepas waktu)
    const visStks: { sid: string; s: any }[] = [];
    (slideOptsById[sid]?.stickers || []).forEach((s: any) => { if (s.start == null) visStks.push({ sid, s }); });
    for (const sl0 of slidesRef.current) {
      for (const s of (slideOptsById[sl0.id]?.stickers || []) as any[]) {
        if (s.start == null) continue;
        const dd = s.dur && s.dur > 0 ? s.dur : 3;
        if (tNowT >= s.start && tNowT < s.start + dd) visStks.push({ sid: sl0.id, s });
      }
    }
    for (let i = visStks.length - 1; i >= 0; i--) {
      const it = visStks[i]; const s = it.s;
      const rx = (s.size + 0.03) * (canvasRef.current!.height / canvasRef.current!.width) * 2;
      if (Math.abs(pt.x - s.x) < Math.max(0.09, rx) && Math.abs(pt.y - s.y) < s.size + 0.06) {
        const wasSelS = selStikRef.current?.sid === it.sid && selStikRef.current?.stid === s.id;
        if (!wasSelS) { pilihObjek("stiker"); setSelStik({ sid: it.sid, stid: s.id }); if (selId !== it.sid) setSelId(it.sid); }
        dragSt.current = { sid: it.sid, stid: s.id, x0: e.clientX, y0: e.clientY, moved: false, wasSel: wasSelS };
        return;
      }
    }
    // TIDAK KENA ELEMEN: seleksi lama tetap bisa diseret dari mana pun (tap kosong nanti = lepas seleksi)
    const tsel0 = getSelText();
    if (tsel0.sid && tsel0.ct?.txt?.trim()) {
      dragTx.current = { sid: tsel0.sid, tid: tsel0.tid, x0: e.clientX, y0: e.clientY, moved: false, wasSel: true };
      return;
    }
    const sselG = selStikRef.current;
    const sstkG = sselG ? (slideOptsById[sselG.sid]?.stickers || []).find(x => x.id === sselG.stid) : null;
    if (sselG && sstkG) {
      dragSt.current = { sid: sselG.sid, stid: sselG.stid, x0: e.clientX, y0: e.clientY, moved: false, wasSel: true };
      return;
    }
    // siapkan geser gambar (kalau jari bergerak) — kalau diam = tap pilih klip
    const r = canvasRef.current!.getBoundingClientRect();
    panClipRef.current = { sid, x0: e.clientX, y0: e.clientY, tx0: slideOptsById[sid]?.tx ?? 0, ty0: slideOptsById[sid]?.ty ?? 0, w: r.width || 1, h: r.height || 1, moved: false };
  }
  function onStageMove(e: React.PointerEvent) {
    if (ptrsRef.current.has(e.pointerId)) ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // cubit: UKURAN TEKS terpilih (2 jari)
    if (pinchTxtRef.current && ptrsRef.current.size >= 2) {
      const d = pinchDist();
      if (d) {
        const pz = pinchTxtRef.current;
        const ns = clampN(pz.s0 * (d / pz.d0), 0.018, 0.16);
        setTextObj2(pz.sid, pz.tid, { size: Number(ns.toFixed(3)) });
      }
      return;
    }
    // cubit + putar: UKURAN & ROTASI STIKER terpilih (2 jari)
    if (pinchStikRef.current && ptrsRef.current.size >= 2) {
      const pz = pinchStikRef.current;
      const d = pinchDist(); const a = pinchAngle();
      const list = slideOptsById[pz.sid]?.stickers || [];
      setOpt(pz.sid, { stickers: list.map(x => x.id === pz.stid ? {
        ...x,
        size: d ? Number(clampN(pz.size0 * (d / pz.d0), 0.03, 0.6).toFixed(3)) : x.size,
        rot: a !== null ? Math.round((((pz.rot0 + (a - pz.ang0) * 180 / Math.PI) + 540) % 360 - 180) * 10) / 10 : x.rot,
      } : x) } as Partial<SlideOpt>);
      return;
    }
    // cubit: zoom gambar klip
    if (pinchRef.current && ptrsRef.current.size >= 2) {
      const d = pinchDist();
      if (d) {
        const nz = clampN(pinchRef.current.tz0 * (d / pinchRef.current.d0), 0.5, 6);
        setOpt(pinchRef.current.sid, { tz: Number(nz.toFixed(3)) });
      }
      return;
    }
    // geser: posisi gambar klip di dalam bingkai
    if (panClipRef.current) {
      const pc = panClipRef.current;
      const dxPx = e.clientX - pc.x0, dyPx = e.clientY - pc.y0;
      if (pc.moved || Math.hypot(dxPx, dyPx) > 4) {
        pc.moved = true;
        const ntx = clampN(pc.tx0 + dxPx / pc.w, -0.6, 0.6);
        const nty = clampN(pc.ty0 + dyPx / pc.h, -0.6, 0.6);
        setOpt(pc.sid, { tx: Number(ntx.toFixed(3)), ty: Number(nty.toFixed(3)) });
      }
      return;
    }
    const pt = stagePoint(e); if (!pt) return;
    if (dragTx.current) {
      const g = dragTx.current;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 3) g.moved = true;
      setTextObj2(g.sid, g.tid, { x: Math.round(clampN(pt.x, 0.05, 0.95) * 1000) / 1000, y: Math.round(clampN(pt.y, 0.06, 0.94) * 1000) / 1000 });
      return;
    }
    if (!dragSt.current) return;
    const g2 = dragSt.current;
    if (!g2.moved && Math.hypot(e.clientX - g2.x0, e.clientY - g2.y0) > 3) g2.moved = true;
    moveSticker(g2.sid, g2.stid, pt.x, pt.y);
  }
  function onStageUp(e?: any) {
    if (e?.pointerId !== undefined) ptrsRef.current.delete(e.pointerId);
    const hadTxtPinch = !!pinchTxtRef.current;
    const hadStikPinch = !!pinchStikRef.current;
    if (ptrsRef.current.size < 2) { pinchRef.current = null; pinchTxtRef.current = null; pinchStikRef.current = null; }
    if (ptrsRef.current.size === 0 && hadTxtPinch) { flash("🔠 Ukuran teks dikunci ✓"); persistSnapshot(); }
    if (ptrsRef.current.size === 0 && hadStikPinch) { flash("😀 Ukuran & putaran stiker dikunci ✓"); persistSnapshot(); }
    if (ptrsRef.current.size === 0 && panClipRef.current) {
      const pc = panClipRef.current;
      panClipRef.current = null;
      if (pc.moved) { setSelId(pc.sid); flash("📐 Posisi gambar dikunci ke klip ini ✓"); persistSnapshot(); }
      else setSelId(pc.sid); // tap = pilih klip
    }
    // teks: tap tanpa geser saat SUDAH terpilih → lepas seleksi; habis digeser → simpan
    const g = dragTx.current;
    if (g && ptrsRef.current.size === 0) {
      if (!g.moved && g.wasSel) setSelTextSid("");
      else if (g.moved) { flash("🔤 Posisi teks dikunci ✓"); persistSnapshot(); }
    }
    // stiker: pola sama — tap = lepas seleksi, geser = simpan
    const g2 = dragSt.current;
    if (g2 && ptrsRef.current.size === 0) {
      if (!g2.moved && g2.wasSel) setSelStik(null);
      else if (g2.moved) { flash("😀 Posisi stiker dikunci ✓"); persistSnapshot(); }
    }
    dragSt.current = null; dragTx.current = null;
  }

  return (
    <div className="v6e-root">
      {/* ============ TOPBAR ============ */}
      <header className="v6e-top">
        {loading === "render" && (
          <div style={{ position: "fixed", left: 0, right: 0, top: 0, zIndex: 95, background: "linear-gradient(90deg,#7f1d1d,#b91c1c)", color: "#fff", fontSize: 12, fontWeight: 800, padding: "7px 10px", textAlign: "center", letterSpacing: 0.2, boxShadow: "0 2px 12px rgba(0,0,0,.5)", pointerEvents: "none" }}>
            🔴 RENDER JALAN — JANGAN tutup / minimize / pindah aplikasi (HP suka membunuh proses lama)
          </div>
        )}
        <button className="v6e-tbtn" title="Tutup" onClick={() => { persistSnapshot(true); stopPreview(); onExit(); }}>✕</button>
        <button className="v6e-tbtn" title="Cari alat" onClick={() => flash("🔍 Ketuk alat di toolbar bawah ya bro")}>🔍</button>
        <button className="v6e-tbtn" title="Judul proyek" onClick={() => {
          const t = prompt("Judul proyek:", projTitle);
          if (t !== null) { setProjTitle(t.slice(0, 80) || "Proyek Tanpa Judul"); persistSnapshot(true); }
        }}>✏️</button>
        <div className="spacer" />
        <button className="v6e-tbtn" title="Simpan" onClick={() => persistSnapshot(true)}>💾</button>
        <button className="v6e-uhd" onClick={() => { setTool("ekspor"); setSheetTab(""); }}>
          {qualitySharp ? "UHD ✨" : uhdLabel} <span className="dd">▾</span>
        </button>
        <button className="v6e-export" onClick={() => { setTool("ekspor"); setSheetTab(""); setExTab("video"); }} disabled={!slides.length}>Ekspor</button>
      </header>

      {/* ============ STAGE ============ */}
      <div className={`v6e-stage-wrap ${fullStage ? "" : ""}`} ref={stageWrapRef}
           style={fullStage ? { position: "fixed", inset: 0, zIndex: 55, background: "#000" } : undefined}
           onClick={fullStage ? () => setFullStage(false) : undefined}>
        <div className="v6e-stage">
          <canvas ref={canvasRef}
            onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp}
            style={{ touchAction: "none" }} />
          <div className={`selbox ${selId ? "on" : ""}`} />
          {/* v8.3: tombol hapus CEPAT di panggung saat objek (teks/stiker) terpilih */}
          {(selTextSid || selStik) && !tool && (
            <button className="v6e-stagedel" title="Hapus objek terpilih" onClick={(e) => { e.stopPropagation(); delSelObj(); }}>🗑</button>
          )}
          {!slides.length && (
            <div className="v6e-stage-empty">
              <div style={{ fontSize: 40 }}>🎬</div>
              <div style={{ fontSize: 12 }}>Tambahkan media untuk mulai mengedit</div>
              <button onClick={() => setTool("media")}>＋ Tambah media</button>
            </div>
          )}
        </div>
        {(() => {
          const o = selOpt as any;
          const hasTr = o && ((o.tx ?? 0) !== 0 || (o.ty ?? 0) !== 0 || (o.tz ?? 1) !== 1);
          return hasTr ? (
            <button className="v6e-zoomreset" onClick={(e) => { e.stopPropagation(); resetClipTransform(selId); }} title="Kembalikan posisi & ukuran gambar (atau ketuk 2×)">
              ⟲ {Math.round((o.tz ?? 1) * 100)}%
            </button>
          ) : null;
        })()}
      </div>

      {/* ============ CONTROL ROW ============ */}
      <div className="v6e-ctrl">
        <button className="cbtn" title="Layar penuh" onClick={() => setFullStage(v => !v)}>⛶</button>
        <button className="cbtn play" onClick={togglePreview} disabled={!slides.length}>{playing ? "⏸" : "▷"}</button>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className={`cbtn ${pipOn ? "" : ""}`} title="Penanda REC" onClick={() => setPipOn(v => !v)}>
            🎦<span className="mini">{pipOn ? "ON" : "OFF"}</span>
          </button>
          <button className="cbtn" onClick={undo} disabled={!canUndo} title="Urungkan">↶</button>
          <button className="cbtn" onClick={redo} disabled={!canRedo} title="Ulangi">↷</button>
        </div>
      </div>

      {/* ============ WAKTU — v12.8 SATU ROL: rol kosmetik pembagian-genap DIHAPUS (angka 00:34/01:08 bukan detik nyata
          dan membingungkan). Satu-satunya penggaris = skala detik asli di dalam track, persis seperti CapCut. ============ */}
      <div className="v6e-timerow">
        <span><b>{formatDur(curT)}</b> / {formatDur(durT)}</span>
        <span className="v6e-timerow-tip">🕒 penggaris detik di track — cubit utk zoom</span>
      </div>

      {/* ============ TIMELINE ============ */}
      <TimelineV6
        slides={slides} slideOptsById={slideOptsById} timeline={timeline} selId={selId} curT={curT} playing={playing}
        onPlayStop={() => stopPreview()} // 🎬 v15.3C — handler track manggil ini kalau user sentuh/geser saat playing
        selTextSid={selTextSid} selStik={selStik}
        laneOrder={laneOrder} onLaneOrder={(o: string[]) => { saveLaneOrder(o); flash("⠿ Susunan jalur disimpan — track kini ngikut tatananmu"); }}
        pxs={tlPxs} onZoom={(v: number) => setTlPxs(clampN(v, 0.6, 140))}
        musicUrl={musicUrl} musicName={musicName} ttsUrl={ttsUrl} voiceUrl={voiceUrl}
        musicDur={musicDur} ttsDur={ttsDur} voiceDur={voiceDur}
        musicOff={musicOff} ttsOff={ttsOff} voiceOff={voiceOff}
        musicPeaks={musicPeaks} ttsPeaks={ttsPeaks} voicePeaks={voicePeaks}
        musicBeats={musicBeats?.beats || null} musicBpm={musicBeats?.bpm || 0}
        onAudioOff={(k: "m" | "t" | "v", sec: number) => { const v = Math.round(sec * 100) / 100; if (k === "m") setMusicOff(v); else if (k === "t") setTtsOff(v); else setVoiceOff(v); }}
        onAudioMoved={(k: string) => flash(`${k === "m" ? "🎵 Musik" : k === "t" ? "🗣️ Narasi" : "🎙️ Rekaman"} digeser — mulai di ${formatDur((k === "m" ? musicOff : k === "t" ? ttsOff : voiceOff))}`)}
        onTextStart={moveTextStart} onTextDur={moveTextDur}
        onTextMoved={(sid: string, tid: string = "") => { pilihObjek("teks"); setSelTextSid(selTextEncode(sid, tid)); if (selId !== sid) setSelId(sid); const t = getTextOf(sid, tid); flash("🔤 Teks ditaruh mulai " + formatDur(t?.start ?? 0) + (t?.dur ? " · " + formatDur(t.dur) : "") + " — ketuk chip utk edit"); }}
        onTextRow={moveTextRow} onStickerRow={moveStickerRow} audRow={audRow} onAudRow={moveAudRow} onRowBad={() => flash("⚠️ Nggak bisa numpuk — di jalur itu sudah ada objek di waktu yang sama")}
        onSel={(id: string) => { pilihObjek("clip"); setSelId(id); setClipBar(true); }}
        onTrim={(id: string, d: number) => trimSlide(id, d)}
        onMove={moveSlide}
        onSeek={(t: number) => seekPreview(t)}
        onSplit={doSplitAtPlayhead} // ✂ v12.7: tombol ╫ melayang di track — sekali ketuk tepat di penanda
        onAddClip={() => setTool("media")}
        onAddAudio={() => { setTool("audio"); }}
        onDelAudio={() => { pushHist(); setMusicUrl(""); setMusicName(""); setTtsUrl(""); setVoiceUrl(""); setCapWords([]); setMusicDur(0); setTtsDur(0); setVoiceDur(0); setMusicOff(0); setTtsOff(0); setVoiceOff(0); flash("🗑 Track audio dikosongkan"); }}
        onAddText={() => startTextEdit()}
        onEditText={(sid: string, tid: string = "") => onTextChipTap(sid, tid)}
        onStickerStart={moveStickerStart} onStickerDur={moveStickerDur}
        onStickerMoved={(sid: string, stid: string) => { pilihObjek("stiker"); setSelStik({ sid, stid }); if (selId !== sid) setSelId(sid); const st = (slideOptsById[sid]?.stickers || []).find((x: any) => x.id === stid); flash("😀 Stiker ditaruh mulai " + formatDur(st?.start ?? 0) + (st?.dur ? " · " + formatDur(st.dur) : "") + " — ketuk chip utk kelola"); }}
        onStickerChipTap={(sid: string, stid: string) => onStickerChipTap(sid, stid)}
        onAddSticker={() => { setTool("stiker"); setSheetTab(""); setClipBar(false); }}
        onAddOutro={addOutro}
        onTrans={(sid: string) => { pilihObjek("clip"); setSelId(sid); setClipBar(true); onClipTool("transisi"); }}
        onMute={() => setAudMuted(v => !v)} audMuted={audMuted}
        onAiCut={() => {
          const src = musicUrl || ttsUrl || voiceUrl;
          if (!src || !slides.length) { flash("⚠️ Tambahkan audio & klip dulu"); return; }
          getAudioDuration(src).then(d => {
            if (!d) { flash("⚠️ Durasi audio tak terbaca"); return; }
            pushHist();
            const per = d / slides.length;
            const upd: Record<string, SlideOpt> = { ...slideOptsById };
            slides.forEach(s => { upd[s.id] = { ...(upd[s.id] || {}), dur: clampN(per, 0.4, 600) * (upd[s.id]?.speed || 1) }; });
            setSlideOptsById(upd);
            flash(`🤖 ${slides.length} klip otomatis pas durasi audio (${formatDur(d)})`);
          });
        }}
        onCover={() => setModal("sampul")}
        hapticSel={() => { pilihObjek("clip"); setClipBar(true); }}
        transition={transition}
      />

      {/* ============ TOOLBAR ============ */}
      <div className="v6e-toolbar">
        {selTextSid && !tool ? (
          /* v8.3: OBJEK TERPILIH (teks) → bar aksi cepat: lepas / edit / duplikat / hapus */
          <div className="v6e-tools">
            <button className="v6e-tlbtn v6e-tlback" onClick={() => setSelTextSid("")}>‹<span>Lepas</span></button>
            <button className="v6e-tlbtn" onClick={editSelText}>✏️<span>Edit</span></button>
            <button className="v6e-tlbtn" onClick={dupSelText}>⧉<span>Duplikat</span></button>
            <button className="v6e-tlbtn" style={{ color: "#f87171" }} onClick={delSelObj}>🗑<span>Hapus</span></button>
          </div>
        ) : selStik && !tool ? (
          /* v8.3: OBJEK TERPILIH (stiker) → bar aksi cepat */
          <div className="v6e-tools">
            <button className="v6e-tlbtn v6e-tlback" onClick={() => setSelStik(null)}>‹<span>Lepas</span></button>
            <button className="v6e-tlbtn" onClick={() => onStickerChipTap(selStik.sid, selStik.stid)}>✏️<span>Kelola</span></button>
            <button className="v6e-tlbtn" style={{ color: "#f87171" }} onClick={delSelObj}>🗑<span>Hapus</span></button>
          </div>
        ) : clipBar && selId ? (
          <div className="v6e-tools">
            <button className="v6e-tlbtn v6e-tlback" onClick={() => { setClipBar(false); setSelId(""); }}>‹<span>Tutup</span></button>
            {CLIP_TOOLS.map(t => (
              <button key={t.id} className="v6e-tlbtn" onClick={() => onClipTool(t.id)}>
                {t.icon}{t.bdg && <span className={`bdg ${t.bdgCls || ""}`}>{t.bdg}</span>}<span>{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="v6e-tools">
            {MAIN_TOOLS.map(t => (
              <button key={t.id} className={`v6e-tlbtn ${tool === t.id ? "on" : ""}`} disabled={t.disabled}
                onClick={() => {
                  if (t.disabled) { flash("👤 Avatar AI segera hadir di versi berikutnya 🙏"); return; }
                  onMainTool(t.id);
                }}>
                {t.icon}{t.bdg && <span className={`bdg ${t.bdgCls || ""}`}>{t.bdg}</span>}<span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 🎬 v11.1 SUTRADARA STUDIO — tombol melayang + panel chat */}
      <button
        onClick={() => setDirOpen((v) => !v)}
        style={{ position: "fixed", right: 12, bottom: 96, zIndex: 75, width: 48, height: 48, borderRadius: "50%", border: "1px solid #14b8a688", background: "linear-gradient(135deg,#0d9488,#14b8a6)", color: "#052a26", fontSize: 20, fontWeight: 900, boxShadow: "0 6px 18px #0009", cursor: "pointer" }}
        title="Sutradara Chat — perintah AI, langsung dieksekusi"
      >🎬</button>
      {dirOpen && (
        <div style={{ position: "fixed", right: 10, bottom: 152, zIndex: 75, width: "min(340px, 92vw)", background: "#10141b", border: "1px solid #ffffff1f", borderRadius: 14, padding: 10, boxShadow: "0 10px 30px #000c", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <b style={{ fontSize: 14 }}>🎬 Sutradara</b>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => { const ORD = ["id", "en", "jv", "su", "ms"]; const nx = ORD[(ORD.indexOf(micLang) + 1) % ORD.length]; setMicLang(nx); try { localStorage.setItem("verve_miclang_v1", nx); } catch {} }} title="🌐 Bahasa suara mic — ketuk ganti (buat 🎤 di bawah)" style={{ background: "#12151c", border: "1px solid #ffffff22", color: "#e8edf5", borderRadius: 7, padding: "3px 8px", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>🌐 {({ id: "🇮🇩ID", en: "🇬🇧EN", jv: "JV", su: "SU", ms: "🇲🇾MS" } as any)[micLang] || "🇮🇩ID"}</button> {/* v14.6 */}
              <span style={{ fontSize: 10.5, color: "#8b93a3" }}>perintah → langsung dieksekusi · ↩ Undo toolbar</span>
            </span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: 8, background: "#0b0e13", borderRadius: 10, border: "1px solid #ffffff12" }}>
            {!dirLog.length && (
              <div style={{ color: "#8b93a3", fontSize: 12 }}>Contoh: "animasikan semua gambar jadi video hidup" · "hidupkan adegan 2" · "matikan animasi adegan 1" · "zoom pelan semua" · "keterangan otomatis" · "musiknya kecilin 40%" · "render sekarang". 🏦 Kunci bansos (video/chat) diatur di menu Saya — bukan lewat chat ini.</div>
            )}
            {dirLog.map((m, i) => (
              m.me === "me" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "86%", background: "linear-gradient(135deg,#0d9488,#14b8a6)", color: "#052a26", borderRadius: "10px 10px 3px 10px", padding: "6px 10px", fontSize: 13, fontWeight: 600 }}>{m.text}</div>
              ) : m.me === "ai" ? (
                <div key={i} style={{ alignSelf: "flex-start", maxWidth: "92%", background: "#161b24", color: "#e8edf5", borderRadius: "10px 10px 10px 3px", padding: "6px 10px", fontSize: 13, border: "1px solid #ffffff12", whiteSpace: "pre-wrap" }}>{m.text}</div>
              ) : (
                <div key={i} style={{ alignSelf: "center", maxWidth: "96%", color: "#98a2b3", fontSize: 11, textAlign: "center" }}>{m.text}</div>
              )
            ))}
            {dirBusy && <div style={{ color: "#8b93a3", fontSize: 12 }}>🎬 mikir…</div>}
            {animBusy && <div style={{ display: "flex", justifyContent: "center" }}><button onClick={() => animAbortRef.current?.abort()} style={{ background: "none", color: "#fca5a5", border: "1px solid #7f1d1d", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>⏹ Urungkan animasi (yang sudah jadi tetap dipakai)</button></div>}
            <div ref={dirEndRef} />
          </div>
          {dirPending.map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, background: "#1a1207", border: "1px solid #f59e0b44", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}>
              <span>{o.op === "auto_caption" ? "📝 Keterangan otomatis — AI transkripsi audio (±1–2 mnt)" : o.op === "selaraskan_ulang" ? "🎯 Sinkron ulang karaoke ke irama lagu (AI, ±1–2 mnt)" : o.op === "animasikan_adegan" ? `🎬 Animasi AI ${(o.slide === undefined || o.slide === null || String(o.slide) === "semua" || Number(o.slide) === 0) ? "SEMUA adegan" : `adegan ${o.slide}`} — ⚠️ BAKAR KREDIT video AI (±1–3 mnt/adegan)` : "🔥 Render video sekarang (berat di HP)"}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button onClick={() => gasStudioOp(o)} style={{ background: "linear-gradient(135deg,#0d9488,#14b8a6)", color: "#052a26", border: "none", borderRadius: 6, padding: "4px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Gas</button>
                <button onClick={() => setDirPending((p) => p.filter((x) => x !== o))} style={{ background: "none", color: "#cbd5e1", border: "1px solid #ffffff2a", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Batal</button>
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={dirInp}
              onChange={(e) => setDirInp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { const v = dirInp; setDirInp(""); void sendDirectorStudio(v); } }}
              placeholder="perintah… (Enter)"
              style={{ flex: 1, background: "#12151c", color: "#e8edf5", border: "1px solid #ffffff22", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
            />
            <Ngomong lang={micLang} onText={(t) => setDirInp((v) => (v ? v + " " : "") + t)} hint="perintah edit video bahasa Indonesia gaya santai (boleh salah ketik): keterangan otomatis, transisi, zoom pelan, animasikan adegan, kecilkan musik, render, karaoke, lirik, narasi" title="🎤 Bicara perintah ke Sutradara — ketuk, ngomong, ketuk ⏹ (<60d)" /> {/* v14.5 */}
            <button onClick={() => { const v = dirInp; setDirInp(""); void sendDirectorStudio(v); }} disabled={dirBusy} style={{ background: "linear-gradient(135deg,#0d9488,#14b8a6)", color: "#052a26", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 800, cursor: "pointer" }}>➤</button>
          </div>
          {videoUrl ? <div style={{ fontSize: 11, color: "#86efac" }}>✅ Hasil render siap — tombol ⬇ Download aktif.</div> : null}
        </div>
      )}

      {/* ============ SHEETS & MODALS ============ */}
      {tool && tool !== "teksedit" && (
        <EditorSheets
          tool={tool} setTool={setTool} sheetTab={sheetTab} setSheetTab={setSheetTab}
          api={{
            slides, selId, selOpt, selIndex, setOpt, pushHist, setSlides, moveSlide, removeSlideAt,
            filterPreset, setFilterPreset, adj, setAdj, qualitySharp, setQualitySharp,
            presets, setPresets,
            ratio, setRatio, bgMode, setBgMode, bgColor, setBgColor,
            ccFrom, setCcFrom, ccLang, setCcLang, ccTpl, setCcTpl, ccSize, setCcSize, ccY, setCcY,
            capWords, capStyle, doAutoCaptions, clearCaptions,
            lyrOff, lyrList: lyrScan.list, legacyPills: lyrScan.legacy, nudgeLyrics, setLyricStart, clearLegacyPills,
            addSticker, delSticker, uploadOverlayImg, moveSticker,
            slideOptsById,
            exTab, setExTab, exRes, setExRes, exFps, setExFps, exMbps, setExMbps,
            estMB, estRenderSec, clipsTotal, doRender, doRenderGif, downloadVideo, videoUrl, videoBlob, progress, loading, stageText,
            openModal: setModal, addImageFiles, genImageForClip, uploadMusic, doEkstrak,
            musicUrl, hasVoice: !!(ttsUrl || voiceUrl),
            musicVol, setMusicVol, voiceVol, setVoiceVol, musicFadeIn, setMusicFadeIn, musicFadeOut, setMusicFadeOut,
            delAudio: () => { pushHist(); setMusicUrl(""); setMusicName(""); setTtsUrl(""); setVoiceUrl(""); setCapWords([]); setMusicDur(0); setTtsDur(0); setVoiceDur(0); setMusicOff(0); setTtsOff(0); setVoiceOff(0); setMusicVol(1); setVoiceVol(1); setMusicFadeIn(0); setMusicFadeOut(0); flash("🗑 Track audio dikosongkan"); },
            startTextEdit, doSplitAtPlayhead, trimSlide,
            slideDuration, setSlideDuration, transition, setTransition, transitionDur, setTransitionDur,
            captionStyle: capStyle, setCaptionStyle: setCapStyle,
            meta, genMetadata, copiedFld, copyFld, downloadMetaTxt, projTitle,
            thumbU, thumbBusy, thumbIdx, thumbSalt, genThumb, downloadThumb,
          }}
        />
      )}
      {tool === "teksedit" && textEditingId && (
        <TextEditSheet
          slideId={textEditingId}
          layerLbl={textEditingTid ? `⧉ Lapisan ${(slideOptsById[textEditingId]?.texts || []).findIndex(x => x.id === textEditingTid) + 2}` : "Lapisan utama"}
          text={getTextOf(textEditingId, textEditingTid) || { ...DEFAULT_TEXT }}
          onChange={(patch: Partial<ClipText>) => setTextObj2(textEditingId, textEditingTid, patch)}
          onDone={() => { setTool(null); setTextEditingId(""); setTextEditingTid(""); persistSnapshot(); }}
          onDelete={() => { delTextObj(textEditingId, textEditingTid); setTool(null); setTextEditingId(""); setTextEditingTid(""); flash("🗑 Lapisan teks dihapus"); }}
        />
      )}

      {/* modal-modul */}
      {modal === "rekam" && <RekamModal onClose={() => setModal(null)} onUse={(u: string) => { setVoiceUrl(u); setVoiceOff(Math.round(clampN(curTRef.current, 0, 7190) * 100) / 100); setModal(null); flash(`🎙️ Rekaman masuk jalur audio mulai ${formatDur(curTRef.current)}`); getAudioDuration(u).then(setVoiceDur); }} />}
      {modal === "tts" && <TtsModal initial={ttsText} onClose={() => setModal(null)} onGen={doTTS} loading={loading} voice={ttsVoice} setVoice={setTtsVoice} />}
      {modal === "musik" && <MusikModal
        onClose={() => setModal(null)} sunoKey={sunoKey} setSunoKey={setSunoKey} sunoProv={sunoProv} setSunoProv={setSunoProv}
        mTitle={mTitle} setMTitle={setMTitle} mLyrics={mLyrics} setMLyrics={setMLyrics} mStyle={mStyle} setMStyle={setMStyle}
        mGenre={mGenre} setMGenre={setMGenre} mMood={mMood} setMMood={setMMood} mModel={mModel} setMModel={setMModel}
        mVocal={mVocal} setMVocal={setMVocal} mTask={mTask} mStatus={mStatus} onGen={doSuno} onCek={cekSuno} loading={loading}
        musicUrl={musicUrl} />}
      {modal === "kamera" && <KameraModal onClose={() => setModal(null)} onPhoto={(dataUrl: string) => { pushHist(); setSlides(c => [...c, { id: uid("cam"), imageUrl: dataUrl }]); flash("📷 Foto masuk timeline"); }} />}
      {modal === "wizard" && <WizardModal onClose={() => setModal(null)} niche={wzNiche} setNiche={setWzNiche} n={wzN} setN={setWzN} styleId={wzStyle} setStyle={setWzStyle} audio={wzAudio} setAudio={setWzAudio} onRun={runWizard} loading={loading} stageText={stageText} />}
      {modal === "sampul" && <SampulModal slides={slides} slideOptsById={slideOptsById} timeline={timeline} ratio={ratio} getImage={getImage} onClose={() => setModal(null)} onSave={(dataUrl: string) => { setCoverThumb(dataUrl); persistSnapshot(true); setModal(null); flash("✏️ Sampul disimpan"); }} />}
      {modal === "ganti" && (
        <MiniModal title="⇄ Ganti media klip" onClose={() => setModal(null)}>
          <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
            📥 Pilih foto dari galeri
            <input type="file" accept="image/*" hidden onChange={e => { addImageFiles(e.target.files, selId); setModal(null); }} />
          </label>
          <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setModal("gambarai")}>✨ Generate dengan AI</button>
        </MiniModal>
      )}
      {modal === "gambarai" && <GambarAiModal onClose={() => setModal(null)} onGen={(pr: string, st: string) => genImageForClip(pr, st, selId || undefined)} loading={loading} />}
      {modal === "videoai" && <VideoAiModal onClose={() => setModal(null)} />}
      {modal === "hakcipta" && <HakCiptaModal musicUrl={musicUrl} musicName={musicName} ttsUrl={ttsUrl} voiceUrl={voiceUrl} onClose={() => setModal(null)} />}

      {/* toast & loading bar */}
      {!!stageText && <div style={{ position: "fixed", left: "50%", bottom: 118, transform: "translateX(-50%)", zIndex: 80, background: "rgba(10,10,14,.92)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "9px 16px", borderRadius: 999, maxWidth: "88vw", textAlign: "center" }}>{stageText}</div>}
      {!!error && <div style={{ position: "fixed", left: "50%", bottom: 118, transform: "translateX(-50%)", zIndex: 81, background: "rgba(90,15,15,.95)", border: "1px solid rgba(248,113,113,.5)", color: "#fecaca", fontSize: 11.5, fontWeight: 600, padding: "10px 16px", borderRadius: 14, maxWidth: "88vw", textAlign: "center" }} onClick={() => setError("")}>{error} ✕</div>}
    </div>
  );
}

/* ==================================================================
   TIMELINE v6 — rail kiri + 3 track + playhead + seek ruler
   ================================================================== */
const PXS = 72; // v15.2B px per detik (CapCut-style — gambar lebih besar di track, enak dilihat tanpa zoom)
const TL_MIN_PXS = 0.6, TL_MAX_PXS = 180; // v15.2B batas zoom (0.6px/d → 1 jam muat; 180px/d → klip pendek tetap jelas)
/* v8.5 PEMADAT JALUR: objek boleh berbagi baris KALAU waktunya tidak numpuk — ala CapCut.
   Baris 0 diisi dulu; objek dengan row pilihan pengguna dihormati; celah kosong dirapikan. */
function packRows(items: { st: number; dd: number; row?: number }[]): number[] {
  const rowsInt: { st: number; end: number }[][] = [];
  const res = new Array<number>(items.length).fill(-1);
  const ord = items.map((_, i) => i).sort((a, b) => ((items[a].row != null ? 0 : 1) - (items[b].row != null ? 0 : 1)) || (items[a].st - items[b].st));
  for (const i of ord) {
    const it = items[i]; const end = it.st + it.dd;
    if (it.row != null && isFinite(it.row)) {
      const r = Math.max(0, Math.round(it.row));
      while (rowsInt.length <= r) rowsInt.push([]);
      rowsInt[r].push({ st: it.st, end }); res[i] = r; continue;
    }
    let r = 0;
    for (;;) {
      if (r >= rowsInt.length) rowsInt.push([]);
      if (!rowsInt[r].some(iv => it.st < iv.end - 0.04 && iv.st < end - 0.04)) { rowsInt[r].push({ st: it.st, end }); res[i] = r; break; }
      r++;
    }
  }
  const used = [...new Set(res)].sort((a, b) => a - b);
  const remap = new Map(used.map((r, i2) => [r, i2]));
  return res.map(r => remap.get(r) ?? 0);
}

function TimelineV6(p: any) {
  const { slides, slideOptsById, timeline, selId, curT, musicUrl, musicName, ttsUrl, voiceUrl } = p;
  const PXS0 = clampN(Number(p.pxs) || PXS, TL_MIN_PXS, TL_MAX_PXS);
  // 💡 v13.18: panduan gestur sekali-tampil (fitur track SUDAH ada — masalahnya orang tak tahu)
  const [hintOn, setHintOn] = useState<boolean>(() => { try { return localStorage.getItem("verve_tlhint_v1") !== "0"; } catch { return true; } });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [halfW, setHalfW] = useState(160);
  const total = timeline?.total || 0;
  // total tampilan: ikut elemen terpanjang (video ATAU audio — lagu 5 menit = track 5 menit)
  const dispTotal = Math.max(total, Number(p.musicDur) || 0, Number(p.ttsDur) || 0, Number(p.voiceDur) || 0);
  let contentW = Math.max(320, dispTotal * PXS0 + halfW * 2 + 16);
  const dragRef = useRef<{ kind: "trim" | "reorder" | "aud" | "txt" | "txtd" | "stk" | "stkd"; i: number; startX: number; startDur: number; to?: number; moved?: boolean; side?: "l" | "r"; armed?: boolean; lastX?: number; audioKind?: "m" | "t" | "v"; off0?: number; sid?: string; tid?: string; stid?: string; st0?: number; dur0?: number } | null>(null);
  const scrubHoldRef = useRef(false);
  // pinch-zoom skala timeline (persempit/perlebar penggaris ala CapCut)
  const tlPtrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchZRef = useRef<{ d0: number; vx: number; base: number } | null>(null);
  const zoomAnchorRef = useRef<{ t: number; vx: number } | null>(null);
  const suppressSeekRef = useRef(false);
  const [, force] = useState(0);
  // v8.4 ANGKAT JALUR: tekan-tahan objek lalu seret VERTIKAL (atau tahan lama diam) = SELURUH jalurnya ikut jari, bebas dipindah ke mana saja
  const laneLiftRef = useRef<{ id: string } | null>(null);
  const [laneLift, setLaneLift] = useState<string>("");
  const lanePreviewRef = useRef<string[] | null>(null);
  const [lanePreview, setLanePreview] = useState<string[] | null>(null);
  const laneRowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dispOrderRef = useRef<string[]>([]);
  // v8.6: SATU kolam jalur bebas utk SEMUA objek + sorotan target jatuh (teal=boleh, merah=numpuk)
  const elmRowEls = useRef<Map<number, HTMLElement>>(new Map());
  const elmPoolRef = useRef<any[]>([]);
  const rowDropRef = useRef<any>(null);
  const [rowDrop, setRowDrop] = useState<any>(null);
  // 🧲 v12.7 MAGNET & GARIS (inspirasi snap-indicator OpenCut, ditulis ulang 100%): saat seret teks/stiker/audio,
  // waktu ikut NEMPEL ke tepi klip / penanda waktu / titik irama — serasi irama tanpa koreksi berulang
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const snapCands = useMemo(() => {
    const c: number[] = [0, dispTotal];
    (timeline?.starts || []).forEach((st: number, i: number) => { c.push(st); c.push(st + (timeline?.durs?.[i] || 0)); });
    (p.musicBeats || []).slice(0, 240).forEach((b: number) => { const t = (p.musicOff || 0) + b; if (t >= 0 && t <= dispTotal) c.push(t); });
    return c;
  }, [timeline, p.musicBeats, p.musicOff, dispTotal]);
  function doSnap(v: number): number {
    const th = Math.min(0.35, 9 / PXS0); // ambang magnet: 9px (maks 0,35d biar zoom-jauh tak serakah)
    let best: number | null = null, bd = th;
    for (const c of snapCands) { const d = Math.abs(c - v); if (d <= bd) { bd = d; best = c; } }
    const dc = Math.abs(curT - v); if (dc <= bd) { bd = dc; best = curT; }
    if (best !== snapAt) setSnapAt(best);
    return best === null ? v : best;
  }

  // ukur setengah lebar viewport → konten diberi ruang kiri-kanan supaya detik 0 & akhir bisa tepat di garis tengah
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const fit = () => setHalfW(el.clientWidth / 2);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // jangkar zoom: titik di bawah cubitan jari tetap di tempat setelah skala berubah
  useEffect(() => {
    const el = scrollRef.current;
    const a = zoomAnchorRef.current;
    if (!el || !a) return;
    suppressSeekRef.current = true;
    el.scrollLeft = clampN(a.t * PXS0 + halfW - a.vx, 0, Math.max(0, contentW - el.clientWidth));
    requestAnimationFrame(() => { suppressSeekRef.current = false; });
  }, [PXS0, halfW, contentW]);

  // saat diputar: KONTEN yang bergerak di bawah garis penanda (garis tetap diam di tengah, ala CapCut)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !p.playing || scrubHoldRef.current) return;
    const target = clampN(curT * PXS0, 0, Math.max(0, contentW - el.clientWidth));
    if (Math.abs(el.scrollLeft - target) > 0.5) el.scrollLeft = target;
  }, [curT, p.playing, contentW, PXS0]);

  // saat tidak diputar: geser konten = geser waktu (garis tengah sebagai penanda posisi)
  function onTlScroll(e: any) {
    if (p.playing || suppressSeekRef.current || pinchZRef.current || dragRef.current) return; // v12.5: jari drag (trim/asset) → scroll tak boleh memicu loncat waktu
    const sl = e.target.scrollLeft;
    p.onSeek(clampN(sl / PXS0, 0, Math.max(0, dispTotal - 0.01)));
  }

  // ---- pinch zoom skala di area track ----
  function onWrapDown(e: React.PointerEvent) {
    // 🎬 v15.3D PLAY STOP — sentuh/geser di MANA PUN di track (seluruh scrollwrap) = stop preview.
    // PENTING: dipasang di level wrapper, bukan di handler khusus, supaya tetap kena walau
    // drag dibatalin (mis: onClipMove batal kalau gerak > 12px sebelum 220ms).
    if (p.playing && p.onPlayStop) { p.onPlayStop(); }
    scrubHoldRef.current = true;
    tlPtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
    if (tlPtrs.current.size >= 2) {
      const pts = [...tlPtrs.current.values()];
      const el = scrollRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const vx = ((pts[0].x + pts[1].x) / 2) - r.left;
        pinchZRef.current = { d0: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), vx, base: PXS0 };
        zoomAnchorRef.current = { t: (el.scrollLeft + vx - halfW) / PXS0, vx };
      }
      dragRef.current = null; // batalkan drag klip/trim saat mencubit
      clearTimeout(armTRef.current);
    }
  }
  function onWrapMove(e: React.PointerEvent) {
    // 🎬 v15.3E — JAMINAN: pointer move di MANA PUN di track (area kosong atau objek, di luar canvas) = stop.
    if (p.playing && p.onPlayStop) { p.onPlayStop(); }
    if (!tlPtrs.current.has(e.pointerId)) return;
    tlPtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinchZRef.current;
    if (pz && tlPtrs.current.size >= 2) {
      const pts = [...tlPtrs.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const el = scrollRef.current;
      if (el) zoomAnchorRef.current = { t: (el.scrollLeft + pz.vx - halfW) / PXS0, vx: pz.vx };
      // STABIL: skala = SKALA AWAL CUBIT × rasio jari (bukan skala sekarang — dulu majemuk & "nyelonong")
      p.onZoom(Math.round(clampN(pz.base * (d / pz.d0), TL_MIN_PXS, TL_MAX_PXS) * 100) / 100);
    }
  }
  function onWrapUp(e: React.PointerEvent) {
    tlPtrs.current.delete(e.pointerId);
    if (tlPtrs.current.size < 2) { pinchZRef.current = null; zoomAnchorRef.current = null; }
    if (tlPtrs.current.size === 0) scrubHoldRef.current = false;
  }

  function clipW(i: number): number { return Math.max(80, (timeline?.durs?.[i] || 0) * PXS0); } // v15.2B min 80px (gambar jelas walau klip 1dt)

  /* ---- TEKAN-TAHAN & SERET (klip reorder / trim / audio offset) + AUTO-SCROLL tepi ---- */
  const armTRef = useRef<any>(null);
  const edgeDirRef = useRef(0);
  const edgeRafRef = useRef(0);
  const suppressClickRef = useRef(false);
  // 🚪 v9.1 SATU PINTU — satu-satunya gerbang gesture: begitu jari menyentuh objek, kendali pindah ke pendengar WINDOW
  // yang mengunci ID jari itu saja sampai lepas/batal. Telapak & jari kedua diabaikan total; pembatalan browser dibersihkan tuntas.
  const gstRef = useRef<{ pid: number } | null>(null);
  function gstBind(e: React.PointerEvent, mv: (ev: any) => void, up: (cancelled: boolean, ev?: any) => void): boolean {
    if (gstRef.current) return false; // sedang ada jari lain bekerja → sentuhan ini diabaikan total
    const pid = e.pointerId;
    gstRef.current = { pid };
    const mvH = (ev: PointerEvent) => { if (ev.pointerId === pid) mv(ev); };
    const upH = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return; // jari lain yang lepas → abaikan
      gstRef.current = null;
      window.removeEventListener("pointermove", mvH);
      window.removeEventListener("pointerup", upH);
      window.removeEventListener("pointercancel", upH);
      up(ev.type === "pointercancel", ev);
    };
    window.addEventListener("pointermove", mvH);
    window.addEventListener("pointerup", upH);
    window.addEventListener("pointercancel", upH);
    return true;
  }

  function applyReorder(d: any, clientX: number) {
    const dx = clientX - d.startX;
    if (Math.abs(dx) > 8) d.moved = true;
    if (!d.moved) return;
    const w = clipW(d.i) + 4;
    const to = clampN(d.i + Math.round(dx / w), 0, slides.length - 1);
    if (to !== d.to) { d.to = to; force(v => v + 1); }
  }
  function applyTrim(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    const nd = clampN(d.startDur + (d.side === "l" ? -dxT : dxT), 0.4, 600);
    p.onTrim(slides[d.i].id, nd);
  }
  function applyAud(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    p.onAudioOff(d.audioKind, doSnap(clampN(d.off0 + dxT, 0, 7200)));
  }
  function applyTxt(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    p.onTextStart(d.sid, d.tid || "", doSnap(clampN((d.st0 || 0) + dxT, 0, 7190)));
  }
  function applyTxtD(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    const st0 = d.st0 || 0;
    const end = doSnap(clampN(st0 + (d.dur0 || 3) + dxT, st0, 7190 + (d.dur0 || 3))); // magnet di tepi AKHIR
    p.onTextDur(d.sid, d.tid || "", clampN(end - st0, 0.5, 600));
  }
  function applyStk(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    p.onStickerStart(d.sid, d.stid, doSnap(clampN((d.st0 || 0) + dxT, 0, 7190)));
  }
  function applyStkD(d: any, clientX: number) {
    const dxT = (clientX - d.startX) / PXS0;
    const st0 = d.st0 || 0;
    const end = doSnap(clampN(st0 + (d.dur0 || 3) + dxT, st0, 7190 + (d.dur0 || 3))); // magnet di tepi AKHIR
    p.onStickerDur(d.sid, d.stid, clampN(end - st0, 0.3, 600));
  }
  // jari mentok ke tepi layar → timeline ikut jalan terus (perpanjang/pindah tanpa angkat jari)
  function edgeLoop() {
    const el = scrollRef.current; const dir = edgeDirRef.current; const d = dragRef.current as any;
    if (!el || !dir || !d || !d.armed) { edgeDirRef.current = 0; return; }
    const ds = dir * 13;
    el.scrollLeft += ds;
    d.startX -= ds; // dx terus tumbuh walau jari diam → durasi/offset jalan terus
    if (d.kind === "trim") applyTrim(d, d.lastX);
    else if (d.kind === "reorder") applyReorder(d, d.lastX);
    else if (d.kind === "aud") applyAud(d, d.lastX);
    else if (d.kind === "txt") applyTxt(d, d.lastX);
    else if (d.kind === "txtd") applyTxtD(d, d.lastX);
    else if (d.kind === "stk") applyStk(d, d.lastX);
    else if (d.kind === "stkd") applyStkD(d, d.lastX);
    edgeRafRef.current = requestAnimationFrame(edgeLoop);
  }
  function updEdge(clientX: number) {
    const el = scrollRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dir = clientX > r.right - 34 ? 1 : clientX < r.left + 34 ? -1 : 0;
    if (dir && !edgeDirRef.current) { edgeDirRef.current = dir; cancelAnimationFrame(edgeRafRef.current); edgeRafRef.current = requestAnimationFrame(edgeLoop); }
    else edgeDirRef.current = dir;
  }
  function stopEdge() { edgeDirRef.current = 0; cancelAnimationFrame(edgeRafRef.current); }

  /* ---- v8.4 JALUR BEBAS: promosi drag objek → angkat & pindahkan SELURUH jalur ---- */
  function laneIdOfDrag(d: any): string {
    if (d.kind === "reorder" || d.kind === "trim") return "vid";
    return "elm"; // v8.6: selain jalur video, SEMUA objek elemen = satu kolam bebas
  }
  function maybePromoteLane(e: React.PointerEvent, d: any): boolean {
    if (!d.armed || laneLiftRef.current) return false;
    if (!(d.kind === "reorder" || d.kind === "aud" || d.kind === "txt" || d.kind === "stk")) return false;
    const dy = e.clientY - (d.startY || 0); const dx = e.clientX - d.startX;
    // klip: geser vertikal = ANGKAT jalur video; SEMUA objek elemen (audio/teks/stiker): vertikal = pindah BARIS
    const vertikal = d.kind === "reorder" && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) + 6;
    const tahanLama = d.kind === "reorder" && (d.t0 ? Date.now() - d.t0 : 0) > 620 && Math.abs(dx) < 10 && Math.abs(dy) < 12; // v9.0: "angkat kolam" CUMA klip video — objek elemen TAK PERNAH dicuri dari genggaman jari
    if (!vertikal && !tahanLama) return false;
    startLaneLift(laneIdOfDrag(d), e.clientY);
    return true;
  }
  // v8.6: baris tujuan saat objek diseret vertikal di KOLAM BEBAS + VALIDASI tabrakan waktu semua jenis objek
  function applyObjRow(e: React.PointerEvent, d: any) {
    const list = [...elmRowEls.current.entries()].sort((a, b) => a[0] - b[0]);
    if (!list.length) return;
    let to = list[list.length - 1][0] + 1; // di bawah baris terakhir → jalur BARU
    for (const [r, el] of list) { const rc = el.getBoundingClientRect(); if (e.clientY <= rc.top + rc.height / 2) { to = r; break; } }
    const stNow = clampN(((d.kind === "aud" ? d.off0 : d.st0) || 0) + (d.lastX - d.startX) / PXS0, 0, 7190);
    const ddNow = d.dur0 || (elmPoolRef.current.find((x: any) => x.key === d.key)?.dd) || 3;
    const bad = (elmPoolRef.current || []).some((it: any) => it.key !== d.key && it.row === to && stNow < it.st + it.dd - 0.04 && it.st < stNow + ddNow - 0.04);
    d.rowTo = to; d.rowBad = bad;
    const cur = rowDropRef.current;
    if (!cur || cur.r !== to || cur.bad !== bad) { const nv = { r: to, bad }; rowDropRef.current = nv; setRowDrop(nv); }
    force(v => v + 1); // v8.9: chip visual IKUT jari naik-turun — terasa ringan di tangan
    // jari mendekati tepi atas/bawah → daftar jalur ikut menggulir (tak perlu angkat jari)
    const el2 = scrollRef.current;
    if (el2) { const r2 = el2.getBoundingClientRect(); if (e.clientY > r2.bottom - 30) el2.scrollTop += 15; else if (e.clientY < r2.top + 30) el2.scrollTop -= 15; }
  }
  // lepas jari → sahkan pindah jalur (atau tolak sopan kalau NUMPUK)
  function commitObjRow(d: any) {
    setSnapAt(null);
    if (rowDropRef.current) { rowDropRef.current = null; setRowDrop(null); }
    if (!d || !d.armed || !(d.kind === "aud" || d.kind === "txt" || d.kind === "stk") || d.rowTo == null) return;
    if ((d.maxD || 0) > 6) suppressClickRef.current = true; // v9.0: tahan lama TANPA gerak lalu lepas = tetap TAP → setting
    if (d.rowBad) { p.onRowBad?.(); return; }
    const cur = elmPoolRef.current.find((x: any) => x.key === d.key);
    if (cur && cur.row === d.rowTo) return;
    if (d.kind === "aud") p.onAudRow?.(d.audioKind, d.rowTo);
    else if (d.kind === "txt") p.onTextRow?.(d.sid, d.tid || "", d.rowTo);
    else p.onStickerRow?.(d.sid, d.stid, d.rowTo);
  }
  function startLaneLift(id: string, y: number) {
    clearTimeout(armTRef.current); dragRef.current = null; stopEdge();
    laneLiftRef.current = { id }; lanePreviewRef.current = null;
    setLaneLift(id); setLanePreview(null); suppressClickRef.current = true;
    try { (navigator as any).vibrate?.(12); } catch {}
    const move = (ev: PointerEvent) => laneLiftDrag(ev.clientY);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); commitLaneLift(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    laneLiftDrag(y);
  }
  function laneLiftDrag(y: number) {
    const st = laneLiftRef.current; if (!st) return;
    const base = (dispOrderRef.current || []).filter((x: string) => x !== st.id);
    let over = 0;
    base.forEach((lid: string) => { const el = laneRowRefs.current.get(lid); if (!el) return; const r = el.getBoundingClientRect(); if (r.top + r.height / 2 < y) over++; });
    const next = [...base]; next.splice(over, 0, st.id);
    lanePreviewRef.current = next; setLanePreview(next);
  }
  function commitLaneLift() {
    const st = laneLiftRef.current; const prev = lanePreviewRef.current;
    laneLiftRef.current = null; lanePreviewRef.current = null;
    setLaneLift(""); setLanePreview(null);
    if (st && prev && typeof p.onLaneOrder === "function") p.onLaneOrder(prev);
  }
  const laneRowRef = (lid: string) => (el: HTMLElement | null) => { if (el) laneRowRefs.current.set(lid, el); else laneRowRefs.current.delete(lid); };
  function dragUpdate(e: React.PointerEvent, d: any) {
    // 🎬 v15.3D PLAY STOP — JAMINAN: kalau drag beneran jalan (armed), stop SEKALIGUS.
    // Idempoten sama onWrapDown di atas — kalau drag dibatalin, onWrapDown yang handle.
    if (p.playing && p.onPlayStop) { p.onPlayStop(); }
    d.lastX = e.clientX; (d as any).lastY = e.clientY; updEdge(e.clientX);
    d.maxD = Math.max(d.maxD || 0, Math.abs(e.clientX - d.startX), Math.abs(e.clientY - (d.startY || 0))); // v9.0: total gerak dua sumbu — penentu TAP vs DRAG
    if (!d.armed) return;
    if (maybePromoteLane(e, d)) return; // vertikal / tahan lama → angkat jalur
    if (d.kind === "trim") applyTrim(d, e.clientX);
    else if (d.kind === "reorder") applyReorder(d, e.clientX);
    else if (d.kind === "aud") { applyAud(d, e.clientX); applyObjRow(e, d); }
    else if (d.kind === "txt") { applyTxt(d, e.clientX); applyObjRow(e, d); }
    else if (d.kind === "txtd") applyTxtD(d, e.clientX);
    else if (d.kind === "stk") { applyStk(d, e.clientX); applyObjRow(e, d); }
    else if (d.kind === "stkd") applyStkD(d, e.clientX);
  }
  function armDrag(d: any, el: HTMLElement | null, pid: number, ms: number) {
    clearTimeout(armTRef.current);
    armTRef.current = setTimeout(() => {
      if (dragRef.current === d) { d.armed = true; if (el) { try { el.setPointerCapture?.(pid); } catch {} } try { (navigator as any).vibrate?.(10); } catch {} force(v => v + 1); } // v9.0: GETAR = kegenggam, silakan bawa
    }, ms);
  }

  function onClipDown(e: React.PointerEvent, i: number) {
    if (gstRef.current) return; // v9.1: SATU gesture — jari kedua/telapak diabaikan total
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — sentuh/geser klip di track = stop preview
    const sid = slides[i].id;
    p.onSel(sid);
    const target = e.target as HTMLElement;
    if (target.classList.contains("hdl")) return; // handle di-handle sendiri
    const d: any = { kind: "reorder", i, startX: e.clientX, startY: e.clientY, t0: Date.now(), startDur: 0, to: i, moved: false, armed: false, lastX: e.clientX };
    dragRef.current = d;
    armDrag(d, target, e.pointerId, 220); // v8.9: tekan-tahan 0,22d → klip "terangkat" & bisa diseret
    gstBind(e, onClipMove, onClipUp); // v9.1: SATU PINTU — kendali via window + kunci id jari
  }
  function onClipMove(e: React.PointerEvent) {
    const d = dragRef.current as any;
    if (!d || d.kind !== "reorder") return;
    if (!d.armed) {
      if (Math.abs(e.clientX - d.startX) > 12) { dragRef.current = null; clearTimeout(armTRef.current); } // niat scroll timeline
      return;
    }
    dragUpdate(e, d);
  }
  function onClipUp(cancelled?: boolean) {
    clearTimeout(armTRef.current);
    const d = dragRef.current as any;
    dragRef.current = null;
    stopEdge();
    if (cancelled) return; // v9.1: dibatalkan browser (notif/multitouch) → JANGAN commit apa pun
    if (d && d.kind === "reorder" && d.armed && d.moved && typeof d.to === "number") p.onMove(d.i, d.to);
  }
  function onHdlDown(e: React.PointerEvent, i: number, side: "l" | "r") {
    if (gstRef.current) return; // v9.1: SATU gesture
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — tarik handle pangkas = stop preview
    e.stopPropagation();
    const sid = slides[i].id;
    p.onSel(sid);
    dragRef.current = { kind: "trim", i, startX: e.clientX, startDur: timeline?.durs?.[i] || 1, side, armed: true, lastX: e.clientX } as any;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    gstBind(e, onHdlMove, onHdlUp); // v9.1: SATU PINTU
  }
  function onHdlMove(e: React.PointerEvent) {
    const d = dragRef.current as any;
    if (!d || d.kind !== "trim") return;
    dragUpdate(e, d);
  }
  function onHdlUp() { dragRef.current = null; stopEdge(); }

  // seret balok audio (tekan-tahan → geser posisi mulai)
  function onAudDown(e: React.PointerEvent, kind: "m" | "t" | "v") {
    if (gstRef.current) return; // v9.1: SATU gesture — jari kedua/telapak diabaikan total
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — sentuh balok audio = stop preview
    e.stopPropagation(); // v9.1: dulu BOCOR ke pembungkus jalur — sumber 'kadang kaku/ngaco'
    const off0 = kind === "m" ? (p.musicOff || 0) : kind === "t" ? (p.ttsOff || 0) : (p.voiceOff || 0);
    const d: any = { kind: "aud", i: 0, startX: e.clientX, startY: e.clientY, t0: Date.now(), startDur: 0, armed: false, lastX: e.clientX, audioKind: kind, key: "aud:" + kind, off0 };
    dragRef.current = d;
    suppressClickRef.current = false; // v9.0: gesture BARU → bersihkan sisa suppress, TAP tak ketelan
    armDrag(d, e.currentTarget as HTMLElement, e.pointerId, 160); // v8.9: lebih ringan — 0,16d langsung "terangkat"
    gstBind(e, onAudMove, onAudUp); // v9.1: SATU PINTU
  }
  function onAudMove(e: React.PointerEvent) {
    const d = dragRef.current as any;
    if (!d || d.kind !== "aud") return;
    if (!d.armed) {
      const dx0 = e.clientX - d.startX, dy0 = e.clientY - (d.startY || 0);
      if (Math.abs(dx0) > 12) { dragRef.current = null; clearTimeout(armTRef.current); } // niat geser waktu/scroll
      else if (Math.abs(dy0) > 10 && Math.abs(dy0) > Math.abs(dx0) + 4) {
        // v8.9: niat VERTIKAL jelas → objek LANGSUNG terangkat tanpa menunggu jeda — ringan!
        d.armed = true; clearTimeout(armTRef.current); try { (navigator as any).vibrate?.(10); } catch {} // v9.0: getar = KEGENGGAM
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
      }
      return;
    }
    dragUpdate(e, d);
  }
  function onAudUp(cancelled?: boolean) {
    clearTimeout(armTRef.current);
    const d = dragRef.current as any;
    dragRef.current = null; stopEdge();
    if (cancelled) { if (rowDropRef.current) { rowDropRef.current = null; setRowDrop(null); } return; } // v9.1: batal → bersih total, tanpa commit
    if (d?.kind === "aud" && d.armed && (d.maxD || 0) > 6) { suppressClickRef.current = true; p.onAudioMoved?.(d.audioKind); } // v9.0: gerak vertikal pun = drag (dulu bocor jadi tap!)
    commitObjRow(d);
  }

  // seret chip TEKS di track: mode "move" (ubah menit mulai) / "dur" (tarik durasi) — per lapisan (tid)
  function onTxtDown(e: React.PointerEvent, sid: string, mode: "move" | "dur", t: any, tid: string = "") {
    if (gstRef.current) return; // v9.1: SATU gesture — jari kedua/telapak diabaikan total
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — sentuh chip teks = stop preview
    e.stopPropagation();
    const i = slides.findIndex((x: Slide) => x.id === sid);
    const st0 = t.start ?? (timeline?.starts?.[i] || 0);
    const dur0 = t.dur ?? (timeline?.durs?.[i] || 3);
    const d: any = { kind: mode === "move" ? "txt" : "txtd", i: 0, startX: e.clientX, startY: e.clientY, t0: Date.now(), startDur: 0, armed: mode === "dur", lastX: e.clientX, sid, tid, key: sid + "|" + (tid || ""), st0, dur0 };
    dragRef.current = d;
    suppressClickRef.current = false; // v9.0: gesture BARU → bersihkan sisa suppress, TAP tak ketelan
    if (mode === "dur") { try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {} }
    else armDrag(d, e.currentTarget as HTMLElement, e.pointerId, 160); // v8.9: lebih ringan — 0,16d langsung "terangkat"
    gstBind(e, onTxtMove, onTxtUp); // v9.1: SATU PINTU — kendali via window + kunci id jari
  }
  function onTxtMove(e: React.PointerEvent) {
    const d = dragRef.current as any;
    if (!d || (d.kind !== "txt" && d.kind !== "txtd")) return;
    if (!d.armed) {
      const dx0 = e.clientX - d.startX, dy0 = e.clientY - (d.startY || 0);
      if (Math.abs(dx0) > 12) { dragRef.current = null; clearTimeout(armTRef.current); } // niat geser waktu/scroll
      else if (Math.abs(dy0) > 10 && Math.abs(dy0) > Math.abs(dx0) + 4) {
        // v8.9: niat VERTIKAL jelas → objek LANGSUNG terangkat tanpa menunggu jeda — ringan!
        d.armed = true; clearTimeout(armTRef.current); try { (navigator as any).vibrate?.(10); } catch {} // v9.0: getar = KEGENGGAM
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
      }
      return;
    }
    dragUpdate(e, d);
  }
  function onTxtUp(cancelled?: boolean) {
    clearTimeout(armTRef.current);
    const d = dragRef.current as any;
    dragRef.current = null; stopEdge();
    if (cancelled) { if (rowDropRef.current) { rowDropRef.current = null; setRowDrop(null); } return; } // v9.1: batal → bersih total, tanpa commit
    if ((d?.kind === "txt" || d?.kind === "txtd") && d.armed && (d.maxD || 0) > 6) { suppressClickRef.current = true; p.onTextMoved?.(d.sid, d.tid || ""); } // v9.0: gerak vertikal pun = drag
    commitObjRow(d);
  }

  // seret chip STIKER di track: mode "move" (ubah menit mulai) / "dur" (tarik durasi tampil)
  function onStkDown(e: React.PointerEvent, sid: string, stid: string, mode: "move" | "dur", st: any) {
    if (gstRef.current) return; // v9.1: SATU gesture — jari kedua/telapak diabaikan total
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — sentuh chip stiker = stop preview
    e.stopPropagation();
    const i = slides.findIndex((x: Slide) => x.id === sid);
    const st0 = st.start ?? (timeline?.starts?.[i] || 0);
    const dur0 = st.dur ?? (timeline?.durs?.[i] || 3);
    const d: any = { kind: mode === "move" ? "stk" : "stkd", i: 0, startX: e.clientX, startY: e.clientY, t0: Date.now(), startDur: 0, armed: mode === "dur", lastX: e.clientX, sid, stid, key: stid, st0, dur0 };
    dragRef.current = d;
    suppressClickRef.current = false; // v9.0: gesture BARU → bersihkan sisa suppress, TAP tak ketelan
    if (mode === "dur") { try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {} }
    else armDrag(d, e.currentTarget as HTMLElement, e.pointerId, 160); // v8.9: lebih ringan — 0,16d langsung "terangkat"
    gstBind(e, onStkMove, onStkUp); // v9.1: SATU PINTU — kendali via window + kunci id jari
  }
  function onStkMove(e: React.PointerEvent) {
    const d = dragRef.current as any;
    if (!d || (d.kind !== "stk" && d.kind !== "stkd")) return;
    if (!d.armed) {
      const dx0 = e.clientX - d.startX, dy0 = e.clientY - (d.startY || 0);
      if (Math.abs(dx0) > 12) { dragRef.current = null; clearTimeout(armTRef.current); } // niat geser waktu/scroll
      else if (Math.abs(dy0) > 10 && Math.abs(dy0) > Math.abs(dx0) + 4) {
        // v8.9: niat VERTIKAL jelas → objek LANGSUNG terangkat tanpa menunggu jeda — ringan!
        d.armed = true; clearTimeout(armTRef.current); try { (navigator as any).vibrate?.(10); } catch {} // v9.0: getar = KEGENGGAM
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
      }
      return;
    }
    dragUpdate(e, d);
  }
  function onStkUp(cancelled?: boolean) {
    clearTimeout(armTRef.current);
    const d = dragRef.current as any;
    dragRef.current = null; stopEdge();
    if (cancelled) { if (rowDropRef.current) { rowDropRef.current = null; setRowDrop(null); } return; } // v9.1: batal → bersih total, tanpa commit
    if ((d?.kind === "stk" || d?.kind === "stkd") && d.armed && (d.maxD || 0) > 6) { suppressClickRef.current = true; p.onStickerMoved?.(d.sid, d.stid); } // v9.0: gerak vertikal pun = drag
    commitObjRow(d);
  }

  function rulerDown(e: React.PointerEvent) {
    if (p.playing && p.onPlayStop) { p.onPlayStop(); } // 🎬 v15.3C — sentuh ruler = stop preview (biar gak lompat sendiri)
    const el = scrollRef.current; if (!el || !dispTotal) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left + el.scrollLeft - halfW;
    p.onSeek(clampN(x / PXS0, 0, Math.max(0, dispTotal - 0.01)));
    const move = (ev: PointerEvent) => {
      const xx = ev.clientX - r.left + el.scrollLeft - halfW;
      p.onSeek(clampN(xx / PXS0, 0, Math.max(0, dispTotal - 0.01)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  // penggaris adaptif: makin di-zoom keluar, label makin jarang (per 2d/5d/10d/…/10 menit)
  const tickStep = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => s * PXS0 >= 42) || 600;
  const nTicks = Math.ceil(dispTotal / tickStep) + 1;

  const hasAudio = !!(musicUrl || ttsUrl || voiceUrl);
  // semua lapisan teks semua klip (utama + tambahan) — tiap lapisan jadi chip sendiri
  const clipTexts = slides.flatMap((s: Slide) => {
    const o = slideOptsById[s.id];
    const out: any[] = [];
    if (o?.text?.txt?.trim()) out.push({ s, t: o.text, tid: "" });
    (o?.texts || []).forEach((x: any) => { if (x?.txt?.trim()) out.push({ s, t: x, tid: x.id || "" }); });
    return out;
  });
  const clipStiks = slides.flatMap((s: Slide) => (slideOptsById[s.id]?.stickers || []).map((st: any) => ({ s, st })));

  /* ---- v8.4 SUSUNAN JALUR BEBAS: semua jalur (video/audio/teks/stiker) satu sistem urutan ---- */
  const laneIds: string[] = ["vid"];
  if (musicUrl) laneIds.push("aud:m");
  if (ttsUrl) laneIds.push("aud:t");
  if (voiceUrl) laneIds.push("aud:v");
  if (musicUrl || ttsUrl || voiceUrl || clipTexts.length || clipStiks.length) laneIds.push("elm"); // v8.6: SATU kolam bebas semua objek
  const savedLanes: string[] = Array.isArray(p.laneOrder) ? p.laneOrder : [];
  const laneOrd: string[] = savedLanes.filter((x: string) => laneIds.includes(x));
  laneIds.forEach((x: string) => { if (!laneOrd.includes(x)) laneOrd.push(x); }); // jalur baru → nempel di bawah, bebas dipindah
  const dispOrder: string[] = lanePreview || laneOrd;
  dispOrderRef.current = dispOrder;
  const laneIdx: Record<string, number> = {};
  dispOrder.forEach((x: string, i: number) => { laneIdx[x] = i; });
  // lebar kolom konten: ikut elemen terpanjang (klip / audio / teks / stiker)
  let maxEndAll = dispTotal;
  clipTexts.forEach(({ s, t }: any) => { const i = slides.findIndex((x: Slide) => x.id === s.id); maxEndAll = Math.max(maxEndAll, (t.start ?? (timeline?.starts?.[i] || 0)) + (t.dur ?? (timeline?.durs?.[i] || 3))); });
  clipStiks.forEach(({ s, st }: any) => { const i = slides.findIndex((x: Slide) => x.id === s.id); maxEndAll = Math.max(maxEndAll, (st.start ?? (timeline?.starts?.[i] || 0)) + (st.dur ?? (timeline?.durs?.[i] || 3))); });
  if (musicUrl) maxEndAll = Math.max(maxEndAll, (p.musicOff || 0) + (p.musicDur || 4));
  if (ttsUrl) maxEndAll = Math.max(maxEndAll, (p.ttsOff || 0) + (p.ttsDur || 4));
  if (voiceUrl) maxEndAll = Math.max(maxEndAll, (p.voiceOff || 0) + (p.voiceDur || 4));
  const clipsTotW = slides.reduce((a: number, _s: Slide, i: number) => a + clipW(i) + 4, 0) + 170;
  const colW = Math.max(320, maxEndAll * PXS0 + 96, clipsTotW);
  contentW = Math.max(contentW, colW + halfW * 2);

  return (
    <div className="v6e-tl">
      <div className="v6e-tl-inner">
        {/* rail kiri */}
        <div className="v6e-tl-rail" style={{ paddingTop: 0 }}>
          <button className={`v6e-rail-tile ${p.audMuted ? "" : ""}`} onClick={p.onMute} title="Bisukan audio">
            {p.audMuted ? "🔇" : "🔊"}<span>{p.audMuted ? "Dibisukan" : "Bisukan audio"}</span>
          </button>
          <button className="v6e-rail-tile" onClick={p.onAiCut} title="Pemotong klip AI">
            ✂️<span>Pemotong klip AI</span><b className="new">New</b>
          </button>
          <button className="v6e-rail-tile" onClick={p.onCover} title="Sampul proyek">
            ✏️<span>Sampul</span>
          </button>
        </div>

        {/* tracks (garis penanda DIAM di tengah — konten yang bergerak di bawahnya) */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div className="v6e-tl-scrollwrap" ref={scrollRef} onScroll={onTlScroll}
            onPointerDown={onWrapDown} onPointerMove={onWrapMove} onPointerUp={onWrapUp} onPointerCancel={onWrapUp}
            style={{ position: "relative", touchAction: "pan-x pan-y" }}>
            <div style={{ position: "relative", width: contentW, display: "flex" }}>
              <div style={{ width: halfW, flex: "0 0 auto" }} />
              <div style={{ position: "relative", flex: "0 0 auto", display: "flex", flexDirection: "column", width: colW }}>
                {/* 🧲 v12.7 GARIS MAGNET — muncul sekilas ketika seretan nempel (tepi klip / penanda / irama) */}
                {snapAt !== null && <div className="v6e-snapline" style={{ left: snapAt * PXS0 }} />}
                {/* ruler waktu (adaptif ikut zoom) */}
                <div style={{ height: 16, position: "relative", marginBottom: 2, touchAction: "none", order: -1 }} onPointerDown={rulerDown}>
                  {Array.from({ length: nTicks }).map((_, k) => { const sec = k * tickStep; return (
                    <span key={k} style={{ position: "absolute", left: sec * PXS0, top: 0, transform: "translateX(-4px)", fontSize: 8.5, color: "#6b7280", fontWeight: 600 }}>
                      {formatDur(sec)}
                    </span>
                  ); })}
                  {tickStep >= 2 && Array.from({ length: nTicks }).map((_, k) => { const sec = k * tickStep + tickStep / 2; return sec < dispTotal ? (
                    <span key={`m${k}`} style={{ position: "absolute", left: sec * PXS0, top: 0, transform: "translateX(-2px)", fontSize: 8.5, color: "#4b5260", fontWeight: 600 }}>·</span>
                  ) : null; })}
                  {/* penanda ketukan musik (estimasi dari gelombang) — bantu potong/teks pas irama */}
                  {p.musicBeats?.length ? p.musicBeats.slice(0, 900).map((b: number, bi: number) => {
                    const bx = ((p.musicOff || 0) + b) * PXS0;
                    return bx >= 0 && bx <= dispTotal * PXS0 ? <i key={`b${bi}`} className="v6e-beat" style={{ left: bx }} /> : null;
                  }) : null}
                </div>

            {/* JALUR VIDEO — ikut susunan bebas, bisa diangkat & dipindah juga */}
            <div ref={laneRowRef("vid")} className={`v6e-track ${laneLift === "vid" ? "lanelift" : ""}`} style={{ order: laneIdx["vid"] ?? 0, position: "relative" }}>
              {/* v12.4 KEPALA REL — label jalur ala OpenCut: sticky kiri, 0 lebar → waktu klip tidak bergeser, pointer-events none → gesture tak tersentuh */}
              <div className="v6e-lanehead" aria-hidden="true"><span><b className="dot" />Visual · {slides.length}</span></div>
              {slides.map((s: Slide, i: number) => {
                const sel = s.id === selId;
                const isOutro = s.id.startsWith("outro");
                const d = dragRef.current;
                const ghost = d?.kind === "reorder" && d.moved && d.to === i && d.i !== i;
                const lifting = d?.kind === "reorder" && (d as any).armed && d.i === i;
                return (
                  <div
                    key={s.id}
                    className={`v6e-clip ${sel ? "sel" : ""} ${lifting ? "lift" : ""}`}
                    style={{ width: clipW(i), opacity: ghost ? 0.35 : 1, flex: "0 0 auto" }}
                    onPointerDown={(e) => onClipDown(e, i)}
                  >
                    {s.imageUrl ? <i className="v6e-clipface" style={{ backgroundImage: `url(${s.imageUrl})` }} title="Filmstrip — jangkar kiri: memendek/memanjang tidak mengubah wajah klip" /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏁</div>}
                    {!!s.videoUrl && <span style={{ position: "absolute", left: 3, bottom: 3, fontSize: 10, lineHeight: 1, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 3px", pointerEvents: "none" }} title="Animasi AI — klip video hidup">🎬</span>}
                    <span className="dur">{(timeline?.durs?.[i] || 0).toFixed(1)}d</span>
                    {sel && <>
                      <span className="hdl l" onPointerDown={(e) => onHdlDown(e, i, "l")}>‹</span>
                      <span className="hdl r" onPointerDown={(e) => onHdlDown(e, i, "r")}>›</span>
                    </>}
                  </div>
                );
              })}
              {/* 🔀 v15.2D TRANSISI TENGAH STICKY ala CapCut — overlay absolute 1 layer, render SEMUA chip sekaligus di LUAR clip.
                  Posisinya dihitung dari TRACK (bukan dari clip), jadi BERGERAK otomatis saat handle pangkas / drag clip.
                  parent .v6e-track: display:flex, gap:4px → tiap clip dipisah 4px. offL = sum(clipW 0..i-1) + (i * 4px gap). */}
              {slides.length > 1 && (() => {
                const chips: any[] = [];
                for (let i = 0; i < slides.length - 1; i++) {
                  let offL = 0;
                  for (let k = 0; k < i; k++) offL += clipW(k) + 4;
                  const wL = clipW(i);
                  // celah 4px → centerX = ujung kanan clip-i + 2px (tengah celah)
                  const centerX = offL + wL + 2;
                  const tr = canonicalTrans(slideOptsById[slides[i].id]?.trans ?? p.transition ?? "dissolve");
                  chips.push({ i, s: slides[i], centerX, tr });
                }
                return (
                  <div className="v6e-trans-overlay" style={{ position: "absolute", left: 0, top: 0, bottom: 0, right: 0, pointerEvents: "none" }}>
                    {chips.map(c => (
                      <button
                        key={"tmid-" + c.s.id}
                        className={`v6e-trans-mid ${c.tr === "none" ? "off" : ""}`}
                        style={{ left: c.centerX, pointerEvents: "auto" }}
                        title={`Transisi: ${c.tr} — ketuk untuk ganti`}
                        onClick={(e) => { e.stopPropagation(); p.onTrans(c.s.id); }}
                        aria-label="Garis transisi"
                      />
                    ))}
                  </div>
                );
              })()}
              {slides.length > 0 && (
                <button className="v6e-outro" onClick={p.onAddOutro} title="Akhiran">
                  🏁<span>Akhiran</span>
                </button>
              )}
              <button className="v6e-addclip" onClick={p.onAddClip}>＋</button>
            </div>

            {/* TRACKS ELEMEN: jalur GENERIK tak terbatas — tiap elemen (audio/teks/stiker)
                punya jalur sendiri-sendiri, bebas diisi apa pun, jumlah jalur mengikuti isi */}
            <div className="v6e-track-add" style={{ display: "contents" }}>
              {(() => {
                const hasAny = hasAudio || !!clipTexts.length || !!clipStiks.length;
                if (!hasAny) {
                  return (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", order: 9999 }}>
                      <button className="v6e-track-addbtn" onClick={p.onAddAudio}><i>🎵</i> ＋ Audio</button>
                      <button className="v6e-track-addbtn" onClick={p.onAddText}><i>🔤</i> ＋ Teks</button>
                      <button className="v6e-track-addbtn" onClick={p.onAddSticker}><i>😀</i> ＋ Stiker</button>
                    </div>
                  );
                }
                const rows: { key: "m" | "t" | "v"; grad: string; col: string; icon: string; nm: string; dur: number; off: number }[] = [];
                if (musicUrl) rows.push({ key: "m", grad: "linear-gradient(90deg,#0f766e,#14b8a6)", col: "#04211f", icon: "♪", nm: musicName || "Musik", dur: p.musicDur || 0, off: p.musicOff || 0 });
                if (ttsUrl) rows.push({ key: "t", grad: "linear-gradient(90deg,#7c3aed,#a855f7)", col: "#fff", icon: "🗣️", nm: "Narasi AI", dur: p.ttsDur || 0, off: p.ttsOff || 0 });
                if (voiceUrl) rows.push({ key: "v", grad: "linear-gradient(90deg,#b91c1c,#ef4444)", col: "#fff", icon: "🎙️", nm: "Rekaman", dur: p.voiceDur || 0, off: p.voiceOff || 0 });
                const textItems = clipTexts.map(({ s, t, tid }: any) => {
                  const i = slides.findIndex((x: Slide) => x.id === s.id);
                  return { s, t, tid, st: t.start ?? (timeline?.starts?.[i] || 0), dd: t.dur ?? (timeline?.durs?.[i] || 3), free: t.start != null };
                });
                const stikItems = clipStiks.map(({ s, st }: any) => {
                  const i = slides.findIndex((x: Slide) => x.id === s.id);
                  return { s, st, t0: st.start ?? (timeline?.starts?.[i] || 0), dd: st.dur ?? (timeline?.durs?.[i] || 3), free: st.start != null };
                });
                return (
                  <>
                    {/* KOLAM BEBAS (v8.6): musik/narasi/rekaman/teks/lirik/stiker SEMUA bisa taruh di jalur mana pun — yang dilarang cuma NUMPUK waktu */}
                    {(() => {
                      const pool: any[] = [];
                      rows.forEach((r: any) => pool.push({ id: "aud:" + r.key, kind: "aud", st: r.off, dd: r.dur || 4, row: (p.audRow || {})[r.key], payload: r, key: "aud:" + r.key }));
                      textItems.forEach((x: any) => pool.push({ id: "txt:" + x.s.id + "|" + (x.tid || ""), kind: "txt", st: x.st, dd: x.dd, row: x.t?.row, payload: x, key: x.s.id + "|" + (x.tid || "") }));
                      stikItems.forEach((x: any) => pool.push({ id: "stk:" + x.st.id, kind: "stk", st: x.t0, dd: x.dd, row: x.st?.row, payload: x, key: x.st.id }));
                      if (!pool.length) return null;
                      const pack = packRows(pool.map((x: any) => ({ st: x.st, dd: x.dd, row: x.row })));
                      elmPoolRef.current = pool.map((x: any, ii: number) => ({ key: x.key, st: x.st, dd: x.dd, row: pack[ii], kind: x.kind }));
                      const nRows = Math.max(...pack) + 1;
                      return (
                        <div ref={laneRowRef("elm")} className={`v6e-lanerow ${laneLift === "elm" ? "lanelift" : ""}`} style={{ order: laneIdx["elm"] ?? 0, height: "auto", marginBottom: 0, position: "relative" }}>
                          {Array.from({ length: nRows }).map((_, r) => (
                            <div key={r}
                              ref={(el) => { if (el) elmRowEls.current.set(r, el); else elmRowEls.current.delete(r); }}
                              className={`v6e-lanerow ${rowDrop && rowDrop.r === r ? "dropr" + (rowDrop.bad ? " bad" : "") : ""}`}
                              style={{ position: "relative", height: 54, marginBottom: 6 }}>
                              {/* v12.4 KEPALA REL — label isi baris: ikon tiap jenis objek (×n bila lebih dari satu) */}
                              {(() => {
                                const cnt: Record<string, number> = {};
                                pool.forEach((it2: any, ii2: number) => {
                                  if (pack[ii2] !== r) return;
                                  const ic = it2.kind === "aud" ? (it2.key === "aud:m" ? "🎵" : it2.key === "aud:t" ? "🗣️" : "🎙️") : it2.kind === "txt" ? "🔤" : "😀";
                                  cnt[ic] = (cnt[ic] || 0) + 1;
                                });
                                const ks = Object.keys(cnt);
                                if (!ks.length) return null;
                                return (
                                  <div className="v6e-lanehead" aria-hidden="true" style={{ marginTop: 27 }}>
                                    <span>{ks.map((k) => (cnt[k] > 1 ? `${k}×${cnt[k]}` : k)).join(" ")}</span>
                                  </div>
                                );
                              })()}
                              {pool.map((it: any, ii: number) => {
                                if (pack[ii] !== r) return null;
                                /* ---- balok AUDIO ---- */
                                if (it.kind === "aud") {
                                  const rd = it.payload;
                                  const dd3 = dragRef.current as any;
                                  const lifting = dd3?.kind === "aud" && dd3.armed && dd3.audioKind === rd.key;
                                  const aDragY = lifting && dd3.kind === "aud" && typeof dd3.lastY === "number" ? Math.round(dd3.lastY - (dd3.startY || 0)) : 0; // v9.0: IKUT jari terus — tanpa syarat
                                  const wpx = Math.max(90, (rd.dur || 4) * PXS0);
                                  return (
                                    <div key={it.id} className={`v6e-audioclip ${lifting ? "lift" : ""}`} title={rd.nm + " — TAP = setting audio · TAHAN = GENGGAM — ikut jari bebas (⇄ maju/mundur · ⇅ jalur)"}
                                      onPointerDown={(e) => onAudDown(e, rd.key)}
                                      onClick={() => { if (gstRef.current) return; if (suppressClickRef.current) { suppressClickRef.current = false; return; } p.onAddAudio(); }}
                                      style={{ position: "absolute", left: rd.off * PXS0, top: 4, width: wpx, height: 46, background: rd.grad, color: rd.col, overflow: "hidden", transform: lifting ? `translateY(${aDragY}px) scale(1.05)` : undefined, zIndex: lifting ? 9 : undefined }}>
                                      <i style={{ fontStyle: "normal" }}>{rd.icon}</i>
                                      <span className="wv" style={{ flex: 1, minWidth: 0 }}>{
                                        (() => {
                                          const pk: number[] | null = (rd.key === "m" ? p.musicPeaks : rd.key === "t" ? p.ttsPeaks : p.voicePeaks) || null;
                                          if (pk && pk.length) {
                                            const bars = Math.max(24, Math.min(190, Math.floor(wpx / 4.2)));
                                            return Array.from({ length: bars }).map((_, k2) => {
                                              const v = pk[Math.min(pk.length - 1, Math.floor(k2 / bars * pk.length))];
                                              return <i key={k2} style={{ height: Math.max(3, Math.round(v * 28)) }} />;
                                            });
                                          }
                                          return Array.from({ length: 14 }).map((_, k2) => <i key={k2} style={{ height: 4 + ((k2 * 37) % 26) }} />);
                                        })()
                                      }</span>
                                      <span className="nm" style={{ fontSize: 11 }}>
                                        {rd.nm}{rd.key === "m" && p.musicBpm ? ` · 🥁${p.musicBpm}` : ""}{rd.dur ? ` · ${formatDur(rd.dur)}` : ""}{rd.off > 0.05 ? ` · ▶${formatDur(rd.off)}` : ""}
                                      </span>
                                      <b className="v6e-chipvs">⇅</b>
                                    </div>
                                  );
                                }
                                /* ---- chip TEKS / LIRIK ---- */
                                if (it.kind === "txt") {
                                  const { s, t, tid, st, dd, free } = it.payload;
                                  const dd4 = dragRef.current as any;
                                  const lifting = (dd4?.kind === "txt" || dd4?.kind === "txtd") && dd4.armed && dd4.sid === s.id && (dd4.tid || "") === tid;
                                  const enc = tid ? `${s.id}::${tid}` : s.id;
                                  const isSel = p.selTextSid === enc;
                                  const isLyr = /^lyr_/.test(t?.id || tid || "");
                                  const tDragY = lifting && dd4.kind === "txt" && typeof dd4.lastY === "number" ? Math.round(dd4.lastY - (dd4.startY || 0)) : 0; // v9.0: IKUT jari terus
                                  return (
                                    <div key={it.id} className={`v6e-textchip asbtn ${lifting ? "lift" : ""} ${free ? "free" : ""} ${isSel ? "sel" : ""} ${isLyr ? "lyr" : ""}`} title="TAP = setting · TAHAN = GENGGAM — objek ikut jari ke mana aja (⇄ waktu · ⇅ jalur bebas, asal tak numpuk) · ⋮ ujung = durasi"
                                      onPointerDown={(e) => onTxtDown(e, s.id, "move", t, tid)}
                                      onClick={() => { if (gstRef.current) return; if (suppressClickRef.current) { suppressClickRef.current = false; return; } p.onEditText(s.id, tid); }}
                                      style={{ position: "absolute", left: st * PXS0, top: 4, width: Math.max(64, dd * PXS0), height: 46, overflow: "hidden", justifyContent: "flex-start", whiteSpace: "nowrap", margin: 0, transform: lifting ? `translateY(${tDragY}px) scale(1.05)` : undefined, zIndex: lifting ? 9 : undefined }}>
                                      {isLyr ? "🎤 " : (tid ? "⧉ " : "")}“{String(t.txt).slice(0, 14)}{String(t.txt).length > 14 ? "…" : ""}”
                                      <b className="v6e-chipvs" style={{ marginRight: 12 }}>⇅</b>
                                      <span className="txtdur" title="Tarik untuk ubah durasi teks"
                                        onPointerDown={(e) => onTxtDown(e, s.id, "dur", t, tid)}>⋮</span>
                                    </div>
                                  );
                                }
                                /* ---- chip STIKER ---- */
                                const { s, st, t0, dd, free } = it.payload;
                                const dd5 = dragRef.current as any;
                                const lifting = (dd5?.kind === "stk" || dd5?.kind === "stkd") && dd5.armed && dd5.stid === st.id;
                                const isSel = !!(p.selStik && p.selStik.sid === s.id && p.selStik.stid === st.id);
                                const sDragY = lifting && dd5.kind === "stk" && typeof dd5.lastY === "number" ? Math.round(dd5.lastY - (dd5.startY || 0)) : 0; // v9.0: IKUT jari terus
                                return (
                                  <div key={it.id} className={`v6e-textchip asbtn stik ${lifting ? "lift" : ""} ${free ? "free" : ""} ${isSel ? "sel" : ""}`} title="TAP = setting · TAHAN = GENGGAM — objek ikut jari ke mana aja (⇄ waktu · ⇅ jalur bebas, asal tak numpuk) · ⋮ ujung = durasi"
                                    onPointerDown={(e) => onStkDown(e, s.id, st.id, "move", st)}
                                    onClick={() => { if (gstRef.current) return; if (suppressClickRef.current) { suppressClickRef.current = false; return; } p.onStickerChipTap?.(s.id, st.id); }}
                                    style={{ position: "absolute", left: t0 * PXS0, top: 4, width: Math.max(52, dd * PXS0), height: 46, overflow: "hidden", justifyContent: "flex-start", whiteSpace: "nowrap", fontSize: 20, margin: 0, transform: lifting ? `translateY(${sDragY}px) scale(1.05)` : undefined, zIndex: lifting ? 9 : undefined }}>
                                    {st.img ? "🖼️" : (typeof st.emoji === "string" && st.emoji.startsWith("@") ? "✨" : st.emoji)}
                                    <b className="v6e-chipvs" style={{ marginRight: 12 }}>⇅</b>
                                    <span className="txtdur" title="Tarik untuk ubah durasi stiker"
                                      onPointerDown={(e) => onStkDown(e, s.id, st.id, "dur", st)}>⋮</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* jalur tambah elemen: bebas pilih jenis apa pun */}
                    <div style={{ position: "relative", height: 48, order: 9999 }}>
                      <button className="v6e-track-addbtn" style={{ position: "absolute", left: 0, top: 2, minWidth: 44, width: 44, height: 44, padding: 0 }} onClick={p.onAddAudio} title="Tambah audio (jalur baru, mulai di posisi penanda)">🎵</button>
                      <button className="v6e-track-addbtn" style={{ position: "absolute", left: 50, top: 2, minWidth: 44, width: 44, height: 44, padding: 0 }} onClick={p.onAddText} title="Tambah teks (jalur baru, mulai di posisi penanda)">🔤</button>
                      <button className="v6e-track-addbtn" style={{ position: "absolute", left: 100, top: 2, minWidth: 44, width: 44, height: 44, padding: 0 }} onClick={p.onAddSticker} title="Tambah stiker (jalur baru, mulai di posisi penanda)">😀</button>
                      {hasAudio && <button className="v6e-track-addbtn" style={{ position: "absolute", left: 150, top: 2, minWidth: 44, width: 44, height: 44, padding: 0 }} onClick={p.onDelAudio} title="Hapus semua audio">🗑</button>}
                    </div>
                  </>
                );
              })()}
            </div>

              </div>
              <div style={{ width: halfW, flex: "0 0 auto" }} />
            </div>
          </div>
          {/* garis penanda tetap di tengah layar */}
          {hintOn && (
            <div className="v6e-tlhint">
              <span>💡 <b>Cubit</b> track = zoom · <b>tahan TEPI</b> klip = pangkas · <b>tahan TENGAH</b> klip = pindah urutan · <b>⤢</b> muat 1 layar · <b>╫ Bagi</b> di garis · ketuk klip = buka alat di bawah</span>
              <button aria-label="tutup panduan" onClick={() => { setHintOn(false); try { localStorage.setItem("verve_tlhint_v1", "0"); } catch {} }}>✕</button>
            </div>
          )}
          {dispTotal > 0 && <div className="v6e-playhead-fixed" style={{ left: "50%" }} />}
          {/* tombol zoom: ketuk → semua proyek muat 1 layar; cubit di track = perbesar/persempit */}
          {dispTotal > 0 && (
            <button className="v6e-tlfit" title="Tampilkan seluruh proyek dalam 1 layar (cubit track untuk zoom manual)"
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                zoomAnchorRef.current = { t: curT, vx: el.clientWidth / 2 };
                p.onZoom(clampN((el.clientWidth - 24) / dispTotal, TL_MIN_PXS, TL_MAX_PXS));
              }}>⤢ Pas</button>
          )}
          {dispTotal > 0 && (
            <button className="v6e-tlsplit" title="✂ Bagi klip tepat di garis penanda waktu (ala OpenCut/CapCut)"
              onClick={() => p.onSplit && p.onSplit()}>╫ Bagi</button>
          )}
          {Math.abs(PXS0 - PXS) > 1 && (
            <button className="v6e-tlfp" title="Kembali ke skala normal" onClick={() => {
              const el = scrollRef.current;
              if (el) zoomAnchorRef.current = { t: curT, vx: el.clientWidth / 2 };
              p.onZoom(PXS);
            }}>{PXS0 > PXS ? "🔍+" : "🔍−"}</button>
          )}
          {/* 🔎 v13.18: zoom ketuk BERLABEL (cubit tetap jalan — ini buat yang tak menemukannya) */}
          {dispTotal > 0 && (
            <button className="v6e-tlzm v6e-tlzm-out" title="Persempit timeline (zoom out)"
              onClick={() => { const el = scrollRef.current; if (el) zoomAnchorRef.current = { t: curT, vx: el.clientWidth / 2 }; p.onZoom(clampN(PXS0 * 0.72, TL_MIN_PXS, TL_MAX_PXS)); }}>−</button>
          )}
          {dispTotal > 0 && (
            <button className="v6e-tlzm v6e-tlzm-in" title="Perbesar timeline (zoom in)"
              onClick={() => { const el = scrollRef.current; if (el) zoomAnchorRef.current = { t: curT, vx: el.clientWidth / 2 }; p.onZoom(clampN(PXS0 / 0.72, TL_MIN_PXS, TL_MAX_PXS)); }}>+</button>
          )}
          {!hintOn && (
            <button className="v6e-tlhelp" title="Tampilkan panduan gestur track"
              onClick={() => { setHintOn(true); try { localStorage.removeItem("verve_tlhint_v1"); } catch {} }}>?</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   SHELL SHEET + KOMPONEN UI KECIL
   ================================================================== */
function SheetShell({ title, onClose, onOk, children, tall }: any) {
  return (
    <>
      <div className="v6-sheet-back" onClick={onClose} />
      <div className="v6-sheet" style={tall ? { maxHeight: "82dvh" } : undefined}>
        <div className="v6-sheet-head">
          <button className="x" onClick={onClose}>✕</button>
          <div className="t">{title}</div>
          {onOk ? <button className="v" onClick={onOk}>✓</button> : <div style={{ width: 34 }} />}
        </div>
        {children}
      </div>
    </>
  );
}
function TabBar({ tabs, cur, onPick }: { tabs: string[]; cur: string; onPick: (t: string) => void }) {
  return <div className="v6-tabs">{tabs.map(t => <button key={t} className={`v6-tab ${cur === t ? "on" : ""}`} onClick={() => onPick(t)}>{t}</button>)}</div>;
}
function ChipRow({ items, cur, onPick }: { items: { id: string; label: string }[]; cur: string; onPick: (id: string) => void }) {
  return <div className="v6-chips" style={{ padding: "10px 2px 2px" }}>{items.map(c => <button key={c.id} className={`v6-chip ${cur === c.id ? "on" : ""}`} onClick={() => onPick(c.id)}>{c.label}</button>)}</div>;
}
const ANIM_STICKER_PREVIEW: Record<string, string> = {
  "@ikuti": "🔴👆", "@like": "👍", "@lonceng": "🔔", "@rec": "🔴", "@wave": "🎚️", "@eq": "📶",
  "@butterfly": "🦋", "@confetti": "🎉", "@kaset": "📼", "@panah": "⬇️", "@love": "❤️", "@kilau": "✨",
  "@nada": "🎵", "@api": "🔥", "@subs": "👍🔔",
};

/* ==================================================================
   EDITOR SHEETS (semua panel alat)
   ================================================================== */
function DiagPanel() { // 🔬 v13.25 LOG KLINIS — bukti tiap langkah di HP; foto/salin → bro (berhenti nebak)
  const [ketuk, setKetuk] = useState(0);
  const [tersalin, setTersalin] = useState(false);
  void ketuk;
  const lines = ccDiagBaca();
  if (!lines.length) return null;
  return (
    <div style={{ marginTop: 10, border: "1px solid rgba(56,189,248,.4)", borderRadius: 12, padding: "8px 10px", background: "rgba(8,47,73,.4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <b style={{ fontSize: 10.5, color: "#7dd3fc", lineHeight: 1.4 }}>{lines[0]}</b>
        <span style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
          <button style={{ fontSize: 10, padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,.08)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.15)" }} onClick={() => setKetuk(v => v + 1)}>🔄</button>
          <button style={{ fontSize: 10, padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,.08)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.15)" }} onClick={() => { try { navigator.clipboard?.writeText(lines.join("\n")); } catch { /* diam */ } setTersalin(true); setTimeout(() => setTersalin(false), 1500); }}>{tersalin ? "✅" : "📋 salin"}</button>
        </span>
      </div>
      <div style={{ marginTop: 6, maxHeight: 128, overflowY: "auto", fontFamily: "ui-monospace,monospace", fontSize: 9.5, lineHeight: 1.6, color: "#bae6fd", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{lines.slice(1).join("\n")}</div>
    </div>
  );
}

function EditorSheets({ tool, setTool, sheetTab, setSheetTab, api }: any) {
  const A = api;
  const close = () => setTool(null);

  /* ---------------- AUDIO ---------------- */
  if (tool === "audio") return (
    <SheetShell title="Audio" onClose={close}>
      <div className="v6-sheet-body">
        {AUDIO_MENU.map(m => {
          if (m.id === "upload") return (
            <label className="v6-cardrow" key={m.id}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">{m.label}</div><span className="arr">›</span>
              <input type="file" accept="audio/*" hidden onChange={e => { A.uploadMusic(e.target.files?.[0]); close(); }} />
            </label>
          );
          if (m.id === "ekstrak") return (
            <label className="v6-cardrow" key={m.id}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">Ekstrak audio dari file video (MP3)</div>
              {m.bdg && <span style={{ fontSize: 8.5, fontWeight: 800, background: "var(--v6-teal)", color: "#04211f", padding: "1px 7px", borderRadius: 999 }}>{m.bdg}</span>}
              <input type="file" accept="video/*,audio/*" hidden onChange={e => { A.doEkstrak(e.target.files?.[0]); close(); }} />
            </label>
          );
          return (
            <div className="v6-cardrow" key={m.id} onClick={() => {
              if (m.id === "rekam") A.openModal("rekam");
              else if (m.id === "tts") A.openModal("tts");
              else if (m.id === "musik") A.openModal("musik");
              else if (m.id === "hakcipta") A.openModal("hakcipta");
              else if (m.id === "hapusAudio") A.delAudio();
              close();
            }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">{m.label}</div>
              {m.bdg && <span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>{m.bdg}</span>}
              <span className="arr">›</span>
            </div>
          );
        })}
        {(A.musicUrl || A.hasVoice) && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: .65, margin: "2px 2px 8px" }}>🔊 VOLUME & FADE</div>
            {A.musicUrl ? (
              <>
                <div className="v6-slider-row">
                  <div className="lr"><span>🎵 Volume musik</span><b style={{ color: "var(--v6-teal)" }}>{Math.round(A.musicVol * 100)}%</b></div>
                  <input type="range" min={0} max={1.5} step={0.05} value={A.musicVol} onChange={e => A.setMusicVol(Number(e.target.value))} />
                </div>
                <div className="v6-slider-row">
                  <div className="lr"><span>🌊 Fade masuk musik</span><b>{A.musicFadeIn.toFixed(1)} detik</b></div>
                  <input type="range" min={0} max={5} step={0.1} value={A.musicFadeIn} onChange={e => A.setMusicFadeIn(Number(e.target.value))} />
                </div>
                <div className="v6-slider-row">
                  <div className="lr"><span>🌅 Fade keluar musik</span><b>{A.musicFadeOut.toFixed(1)} detik</b></div>
                  <input type="range" min={0} max={5} step={0.1} value={A.musicFadeOut} onChange={e => A.setMusicFadeOut(Number(e.target.value))} />
                </div>
              </>
            ) : null}
            {A.hasVoice ? (
              <div className="v6-slider-row">
                <div className="lr"><span>🗣️ Volume narasi / rekaman</span><b style={{ color: "var(--v6-teal)" }}>{Math.round(A.voiceVol * 100)}%</b></div>
                <input type="range" min={0} max={1.5} step={0.05} value={A.voiceVol} onChange={e => A.setVoiceVol(Number(e.target.value))} />
              </div>
            ) : null}
            <div className="v6-note">💡 Perubahan volume langsung terdengar di pratinjau ▷ — fade otomatis diterapkan saat ekspor.</div>
          </div>
        )}
        <div className="v6-note">✋ <b>Tekan-tahan balok audio di track</b> lalu geser kiri/kanan — posisi mulainya bebas (misal narasi mulai detik ke-5). Offset ikut tersimpan & dipakai saat ekspor.</div>
        <div className="v6-note">💡 Rekam suara asli, narasi AI, lagu AI (Suno) sampai musik upload — semua muncul di <b>track audio</b> dan bisa dimix otomatis saat ekspor. Tile 🏁 <b>Akhiran</b> ada di ujung track 1.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- TEKS (menu) ---------------- */
  if (tool === "teks") return (
    <SheetShell title="Teks" onClose={close}>
      <div className="v6-sheet-body">
        {[
          { ic: "🔤", lb: "Tambahkan teks", act: () => { A.startTextEdit(); } },
          { ic: "💬", lb: "Keterangan otomatis", act: () => setTool("keterangan"), ai: true },
          { ic: "😀", lb: "Stiker", act: () => setTool("stiker") },
          { ic: "🧩", lb: "Template teks", act: () => { A.startTextEdit(); } },
        ].map(r => (
          <div className="v6-cardrow" key={r.lb} onClick={r.act}>
            <span style={{ fontSize: 20 }}>{r.ic}</span><div className="tt">{r.lb}</div>{r.ai && <span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>AI</span>}<span className="arr">›</span>
          </div>
        ))}
      </div>
    </SheetShell>
  );

  /* ---------------- EFEK ---------------- */
  if (tool === "efek") return <EfekSheet api={A} onClose={close} />;

  /* ---------------- ANIMASI KLIP ---------------- */
  if (tool === "animasi") return <AnimasiSheet api={A} tab0={sheetTab || "masuk"} onClose={close} />;

  /* ---------------- KETERANGAN OTOMATIS ---------------- */
  if (tool === "keterangan") return <KeteranganSheet api={A} onClose={close} />;

  /* ---------------- FILTER / SESUAIKAN / KUALITAS ---------------- */
  if (tool === "filter") return <FilterSheet api={A} tab0={sheetTab || "filter"} onClose={close} />;

  /* ---------------- STIKER / OVERLAY ---------------- */
  if (tool === "stiker") return <StikerSheet api={A} tab0={sheetTab || "stiker"} onClose={close} />;

  /* ---------------- HASILKAN MEDIA ---------------- */
  if (tool === "media") return (
    <SheetShell title="Hasilkan media" onClose={close} tall>
      <div className="v6-sheet-body">
        <label className="v6-cardrow">
          <span style={{ fontSize: 20 }}>🖼️</span>
          <div className="tt">Upload foto dari galeri</div><span className="arr">›</span>
          <input type="file" accept="image/*" multiple hidden onChange={e => { A.addImageFiles(e.target.files, undefined); close(); }} />
        </label>
        <div className="v6-cardrow" onClick={() => { A.openModal("kamera"); }}>
          <span style={{ fontSize: 20 }}>📷</span><div className="tt">Ambil gambar (kamera)</div><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => { A.openModal("gambarai"); }}>
          <span style={{ fontSize: 20 }}>🎨</span><div className="tt">Gambar AI (tulis konsep sendiri)</div><span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>AI</span><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => { A.openModal("videoai"); }}>
          <span style={{ fontSize: 20 }}>🎬</span><div className="tt">Video AI (beta)</div><span className="arr">›</span>
        </div>
        <div className="v6-note">✅ Media yang ditambahkan langsung masuk <b>track 1</b> sebagai klip baru. Tarik ujungnya untuk atur durasi.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- RASIO ---------------- */
  if (tool === "rasio") return (
    <SheetShell title="Rasio aspek" onClose={close} onOk={close}>
      <div className="v6-sheet-body">
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {([["16:9", "▭", "YouTube"], ["9:16", "▯", "Shorts/Reels"], ["1:1", "⬜", "Feed IG"]] as any[]).map(([r, ic, d]) => (
            <button key={r} className={`v6-gcell ${A.ratio === r ? "on" : ""}`} style={{ aspectRatio: "1" }} onClick={() => A.setRatio(r)}>
              <span style={{ fontSize: 26 }}>{ic}</span>
              <b style={{ fontSize: 12 }}>{r}</b>
              <span className="l">{d}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">⚠️ Mengganti rasio setelah media masuk akan memotong tepi visual (mode isi penuh). Atau pakai menu <b>Latar belakang</b> → Blur supaya tidak terpotong.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- LATAR BELAKANG ---------------- */
  if (tool === "latar") return (
    <SheetShell title="Latar belakang" onClose={close} onOk={close}>
      <div className="v6-sheet-body">
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {([["cover", "⛶", "Isi penuh"], ["blur", "🌫️", "Blur"], ["color", "🎨", "Warna"]] as any[]).map(([m, ic, lb]) => (
            <button key={m} className={`v6-gcell ${A.bgMode === m ? "on" : ""}`} style={{ aspectRatio: "1" }} onClick={() => A.setBgMode(m)}>
              <span style={{ fontSize: 26 }}>{ic}</span><span className="l">{lb}</span>
            </button>
          ))}
        </div>
        {A.bgMode === "color" && (
          <>
            <div className="v6-lbl">WARNA LATAR</div>
            <div className="v6-rows">
              {["#000000", "#ffffff", "#16162a", "#0e7490", "#7c3aed", "#be185d", "#065f46", "#92400e"].map(c => (
                <button key={c} className={`v6-swatch ${A.bgColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => A.setBgColor(c)} />
              ))}
              <span className="v6-swatch on" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                <input type="color" value={A.bgColor} onChange={e => A.setBgColor(e.target.value)} />
              </span>
            </div>
          </>
        )}
        <div className="v6-note">Mode <b>Blur/Warna</b> membuat video jadi letterbox (gambar utuh tidak terpotong) — pas kalau konten beda rasio.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- PANGKAS ---------------- */
  if (tool === "pangkas" && A.selId) {
    const dur = A.selOpt?.dur ?? A.slideDuration;
    return (
      <SheetShell title="Pangkas klip" onClose={close} onOk={close}>
        <div className="v6-sheet-body">
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi klip terpilih</span><b style={{ color: "var(--v6-teal)" }}>{dur >= 60 ? formatDur(dur) : `${dur.toFixed(1)} detik`}</b></div>
            <input type="range" min={0.4} max={300} step={0.1} value={dur} onChange={e => A.setOpt(A.selId, { dur: Number(e.target.value) })} />
          </div>
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi default klip baru</span><b>{A.slideDuration} detik</b></div>
            <input type="range" min={1} max={10} step={0.5} value={A.slideDuration} onChange={e => A.setSlideDuration(Number(e.target.value))} />
          </div>
          <div className="v6-note">💡 Cara cepat: tarik langsung <b>handle putih</b> di ujung klip pada timeline.</div>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- SPEED ---------------- */
  if (tool === "speed" && A.selId) {
    const sp = A.selOpt?.speed ?? 1;
    return (
      <SheetShell title="Kecepatan klip" onClose={close} onOk={close}>
        <div className="v6-sheet-body">
          <div className="v6-slider-row">
            <div className="lr"><span>⚡ Kecepatan</span><b style={{ color: "var(--v6-teal)" }}>{sp.toFixed(2)}×</b></div>
            <input type="range" min={0.3} max={3} step={0.05} value={sp} onChange={e => A.setOpt(A.selId, { speed: Number(e.target.value) })} />
          </div>
          <div className="v6-chips" style={{ padding: 0 }}>
            {[0.5, 0.7, 1, 1.5, 2, 3].map(v => <button key={v} className={`v6-chip ${sp === v ? "on" : ""}`} onClick={() => A.setOpt(A.selId, { speed: v })}>{v}×</button>)}
          </div>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- TRANSISI ---------------- */
  if (tool === "transisi" && A.selId) {
    const cur = canonicalTrans(A.selOpt?.trans ?? A.transition);
    const td = A.selOpt?.transDur ?? A.transitionDur;
    return (
      <SheetShell title="Transisi" onClose={close} onOk={close} tall>
        <div className="v6-sheet-body">
          <ChipRow items={[{ id: "semua", label: "Semua" }, ...["AI ✨", "Dasar", "Geser", "Zoom", "Cahaya", "Efek"].map(x => ({ id: x, label: x }))]} cur={sheetTab || "semua"} onPick={setSheetTab} />
          <div className="v6-grid4">
            {TRANSITIONS.filter((t: any) => !sheetTab || sheetTab === "semua" || t.cat === sheetTab).map((t: any) => (
              <button key={t.id} className={`v6-gcell ${cur === t.id ? "on" : ""}`} onClick={() => A.setOpt(A.selId, { trans: t.id })}>
                <span className="e">{t.emoji}</span><span className="l">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi transisi</span><b style={{ color: "var(--v6-teal)" }}>{td.toFixed(1)}d</b></div>
            <input type="range" min={0.15} max={2.5} step={0.05} value={td} onChange={e => A.setOpt(A.selId, { transDur: Number(e.target.value) })} />
          </div>
          {sheetTab === "AI ✨" && (
            <div className="v6-note">🧬 <b>Transisi AI ✨</b> = efek lanjutan 100% buatan VERVE (morph cair, partikel, hologram, tinta…) — dirender langsung di HP, bukan template curian. Cobain aja, gratis semua!</div>
          )}
          <button className="v6-btn ghost" style={{ width: "100%" }} onClick={() => {
            A.pushHist();
            const upd: Record<string, any> = {};
            A.slides.forEach((s: any) => { upd[s.id] = { trans: cur, transDur: td }; });
            A.slides.forEach((s: any) => A.setOpt(s.id, upd[s.id]));
          }}>🌍 Terapkan ke semua sambungan</button>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- EKSPOR ---------------- */
  if (tool === "ekspor") return <EksporSheet api={A} onClose={close} />;

  return null;
}

/* ---------------- EFEK ---------------- */
function EfekSheet({ api: A, onClose }: any) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("semua");
  if (!A.selId) return (
    <SheetShell title="Efek" onClose={onClose}>
      <div className="v6-sheet-body"><div className="v6-empty"><div className="big">☆</div>Pilih klip dulu di timeline, baru kasih efek ya bro.</div></div>
    </SheetShell>
  );
  const curEf = A.selOpt?.effect || "";
  const cats = ["semua", ...Array.from(new Set(EFFECTS.map((e: any) => e.cat || "Lain")))] as string[];
  const items = EFFECTS.filter((e: any) => (cat === "semua" || e.cat === cat) && (!q || e.label.toLowerCase().includes(q.toLowerCase())));
  return (
    <SheetShell title="Efek video" onClose={onClose} onOk={onClose}>
      <div className="v6-sheet-body" style={{ paddingTop: 0 }}>
        <div className="v6-searchbar">🔍<input placeholder="Orang-orang sedang mencari blur…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <ChipRow items={cats.map(c => ({ id: c, label: c === "semua" ? "Sedang tren" : c }))} cur={cat} onPick={setCat} />
        <div className="v6-grid4">
          {items.map((e: any) => (
            <button key={e.id || "none"} className={`v6-gcell ${curEf === e.id ? "on" : ""}`} onClick={() => { A.setOpt(A.selId, { effect: e.id }); }}>
              <span className="e">{e.emoji}</span><span className="l">{e.label}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">Efek diterapkan ke klip terpilih dan ikut terekspor. Pilih 🚫 untuk menghapus efek.</div>
      </div>
    </SheetShell>
  );
}

/* ---------------- ANIMASI (Masuk/Keluar/Kombinasi) ---------------- */
function AnimasiSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0);
  if (!A.selId) return (
    <SheetShell title="Animasi" onClose={onClose}><div className="v6-sheet-body"><div className="v6-empty"><div className="big">▷</div>Pilih klip dulu ya bro.</div></div></SheetShell>
  );
  const list = tab === "masuk" ? ANIM_IN : tab === "keluar" ? ANIM_OUT : ANIM_LOOP;
  const cur = tab === "masuk" ? (A.selOpt?.animIn || "none") : tab === "keluar" ? (A.selOpt?.animOut || "none") : (A.selOpt?.loop || "none");
  const pick = (id: string) => {
    if (tab === "masuk") A.setOpt(A.selId, { animIn: id });
    else if (tab === "keluar") A.setOpt(A.selId, { animOut: id });
    else A.setOpt(A.selId, { loop: id });
  };
  const dur = A.selOpt?.animDur ?? 0.6;
  return (
    <SheetShell title="Animasi" onClose={onClose} onOk={onClose}>
      <TabBar tabs={["masuk", "keluar", "kombinasi"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body">
        <ChipRow items={[{ id: "x", label: "Sedang tren" }, { id: "y", label: "Dasar" }]} cur="x" onPick={() => {}} />
        <div className="v6-grid4">
          {list.map((a: any) => (
            <button key={a.id} className={`v6-gcell ${cur === a.id ? "on" : ""}`} onClick={() => pick(a.id)}>
              <span className="e">{a.emoji}</span><span className="l">{a.label}</span>
            </button>
          ))}
        </div>
        {tab !== "kombinasi" && (
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi animasi</span><b style={{ color: "var(--v6-teal)" }}>{dur.toFixed(1)}d</b></div>
            <input type="range" min={0.2} max={2.5} step={0.1} value={dur} onChange={e => A.setOpt(A.selId, { animDur: Number(e.target.value) })} />
          </div>
        )}
        {tab === "kombinasi" && <div className="v6-note">💫 Animasi berulang berjalan terus sepanjang klip (denyut, goyang halus, zoom pelan…) — pas buat foto diam jadi hidup.</div>}
      </div>
    </SheetShell>
  );
}

/* ---------------- KETERANGAN OTOMATIS ---------------- */
function KeteranganSheet({ api: A, onClose }: any) {
  const tpl = CC_TEMPLATES.find(t => t.id === A.ccTpl) || CC_TEMPLATES[0];
  const [adv, setAdv] = useState(false);
  return (
    <SheetShell title="Keterangan otomatis" onClose={onClose}>
      <div className="v6-sheet-body">
        <div className="v6-cardrow" onClick={() => { const ids = CC_SOURCES.map(s => s.id); A.setCcFrom(ids[(ids.indexOf(A.ccFrom) + 1) % ids.length]); }}>
          <span style={{ fontSize: 18 }}>⊞</span>
          <div className="tt">Hasilkan dari</div>
          <span className="val">{CC_SOURCES.find(s => s.id === A.ccFrom)?.lb || "Audio musik"}</span><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => {
          const langs = ["id-ID", "en-US", "jv-ID", "su-ID", "ms-MY"];
          const i = langs.indexOf(A.ccLang);
          A.setCcLang(langs[(i + 1) % langs.length]);
        }}>
          <span style={{ fontSize: 18 }}>🗣</span>
          <div className="tt">Bahasa sumber</div>
          <span className="val">{A.ccLang === "id-ID" ? "Bahasa Indonesia" : A.ccLang}</span><span className="arr">›</span>
        </div>
        <div style={{ marginTop: 14, border: "1px solid var(--v6-line)", borderRadius: 14, padding: "12px 12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 12.5 }}>💬 Template</b><span style={{ fontSize: 10, color: "#6b7280" }}>›</span>
          </div>
          <div className="v6-rows" style={{ marginTop: 10 }}>
            {CC_TEMPLATES.map(t => (
              <button key={t.id} className={`v6-gcell ${A.ccTpl === t.id ? "on" : ""}`} style={{ width: 104, height: 74, flex: "0 0 auto", aspectRatio: "auto" }} onClick={() => A.setCcTpl(t.id)}>
                <span style={{ fontSize: 11, fontWeight: 800, color: t.color, textShadow: "0 1px 3px #000" }}>{t.sample}</span>
                <span className="l">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="v6-cardrow" onClick={() => setAdv(v => !v)}>
          <span style={{ fontSize: 16 }}>💎</span><div className="tt" style={{ color: "#a78bfa" }}>Opsi lanjutan</div><span className="arr">{adv ? "⌄" : "›"}</span>
        </div>
        {adv && (
          <>
            <div className="v6-slider-row">
              <div className="lr"><span>Ukuran teks</span><b>{Math.round(A.ccSize * 1000)}</b></div>
              <input type="range" min={0.03} max={0.09} step={0.005} value={A.ccSize} onChange={e => A.setCcSize(Number(e.target.value))} />
            </div>
            <div className="v6-slider-row">
              <div className="lr"><span>Posisi vertikal</span><b>{Math.round(A.ccY * 100)}%</b></div>
              <input type="range" min={0.55} max={0.92} step={0.01} value={A.ccY} onChange={e => A.setCcY(Number(e.target.value))} />
            </div>
          </>
        )}
        <button className="v6-bigcta" onClick={A.doAutoCaptions} disabled={A.loading === "cc"}>
          {A.loading === "cc" ? "⏳ Membuat keterangan…" : "Hasilkan"}
          <span className="std">❤ Standar</span>
        </button>
        {!!A.capWords.length && (
          <div className="v6-okbox">✅ {A.capWords.length} kata keterangan aktif (gaya: {tpl.label}). <b onClick={A.clearCaptions} style={{ cursor: "pointer", textDecoration: "underline" }}>Hapus</b></div>
        )}
        <DiagPanel />
        {!!A.lyrList?.length && (
          <div style={{ marginTop: 12, border: "1px solid var(--v6-line)", borderRadius: 14, padding: 12 }}>
            <b style={{ fontSize: 12.5 }}>⚓ Geser waktu lirik</b>
            <div style={{ fontSize: 10.5, color: "#9aa0ab", marginTop: 3, lineHeight: 1.5 }}>Lirik muncul kecepatan / telat? Geser <b>SEMUA baris sekaligus</b> di sini — musik & klip TIDAK ikut berubah.</div>
            <div style={{ display: "flex", gap: 6, marginTop: 9, alignItems: "center" }}>
              <button className="v6-chip" style={{ flex: 1 }} onClick={() => A.nudgeLyrics(-0.5)}>−0.5</button>
              <button className="v6-chip" style={{ flex: 1 }} onClick={() => A.nudgeLyrics(-0.1)}>−0.1</button>
              <b style={{ flex: 1.4, textAlign: "center", fontSize: 12.5, color: "#22d3ee" }}>{A.lyrOff > 0 ? "+" : ""}{Number(A.lyrOff || 0).toFixed(1)} dtk</b>
              <button className="v6-chip" style={{ flex: 1 }} onClick={() => A.nudgeLyrics(0.1)}>+0.1</button>
              <button className="v6-chip" style={{ flex: 1 }} onClick={() => A.nudgeLyrics(0.5)}>+0.5</button>
            </div>
            <div style={{ fontSize: 10, color: "#8b8b98", marginTop: 9 }}>Per baris (geser halus ±0,3 dtk — baris lain diam):</div>
            <div style={{ marginTop: 6, maxHeight: 210, overflowY: "auto", display: "grid", gap: 5 }}>
              {A.lyrList.map((L: any, i: number) => (
                <div key={L.id || i} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "5px 8px" }}>
                  {/* 🎬 v15.4 — input waktu mulai per baris (format M:SS atau detik) — user bisa ketik 0:23 langsung */}
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={formatDur(L.start || 0)}
                    onBlur={(ev) => { if (ev.target.value !== formatDur(L.start || 0)) A.setLyricStart(L.id, ev.target.value); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                    style={{ fontSize: 9.5, color: "#22d3ee", width: 42, flex: "0 0 auto", background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.3)", borderRadius: 6, padding: "2px 4px", textAlign: "center", fontFamily: "ui-monospace,monospace" }}
                    title="Ketik waktu mulai (mis: 0:23, 1:05.5, atau 42.7) lalu ketuk luar / Enter"
                  />
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{L.txt}</span>
                  <button className="v6-chip" style={{ padding: "2px 9px", flex: "0 0 auto" }} onClick={() => A.nudgeLyrics(-0.3, L.id)}>◀</button>
                  <button className="v6-chip" style={{ padding: "2px 9px", flex: "0 0 auto" }} onClick={() => A.nudgeLyrics(0.3, L.id)}>▶</button>
                </div>
              ))}
            </div>
            {!!A.legacyPills && (
              <button className="v6-chip" style={{ marginTop: 10, width: "100%", borderColor: "rgba(239,68,68,.4)" }} onClick={A.clearLegacyPills}>
                🧹 Bersihkan {A.legacyPills} caption bawaan adegan (nempel di klip — inilah yang bikin lirik terasa "gabung sama lagu")
              </button>
            )}
          </div>
        )}
        <div className="v6-note">📌 <b>🎵 Lirik lagu (baru)</b>: lirik dari Lahan/Suno disinkronkan ke lagu — AI Whisper dulu, kalau sibuk pakai perkiraan cerdas. Hasilnya masuk <b>TRACK TEKS</b> per baris dengan kata menyala satu-satu — bisa digeser/edit. <b>Narasi AI</b>: akurat dari teks aslinya. <b>Musik/rekaman</b>: transkrip live browser (eksperimental).</div>
      </div>
    </SheetShell>
  );
}

/* ---------------- FILTER + SESUAIKAN + KUALITAS (4 tab) ---------------- */
function FilterSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0);
  const [cat, setCat] = useState("semua");
  function savePreset() {
    const name = prompt("Nama preset:", "Gaya saya");
    if (!name) return;
    const p = { id: uid("pr"), name: name.slice(0, 24), filter: A.filterPreset, adj: { ...A.adj } };
    const arr = [...A.presets, p];
    A.setPresets(arr);
    try { localStorage.setItem("verve_filter_presets", JSON.stringify(arr)); } catch {}
  }
  return (
    <SheetShell title="Filter" onClose={onClose} onOk={onClose}>
      <TabBar tabs={["preset", "filter", "sesuaikan", "kualitas"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body">
        {tab === "preset" && (
          <>
            <button className="v6-bigcta" style={{ marginTop: 4 }} onClick={savePreset}>＋ Simpan gaya sekarang jadi preset</button>
            <div className="v6-grid4">
              {!A.presets.length && <div className="v6-note" style={{ gridColumn: "1/-1" }}>Belum ada preset. Atur filter + sesuaikan, lalu simpan di sini biar tinggal 1 tap nanti.</div>}
              {A.presets.map((p: any) => (
                <button key={p.id} className="v6-gcell" onClick={() => { A.setFilterPreset(p.filter); A.setAdj({ ...DEFAULT_ADJUST, ...p.adj }); }}
                  onContextMenu={e => { e.preventDefault(); A.setPresets(A.presets.filter((x: any) => x.id !== p.id)); try { localStorage.setItem("verve_filter_presets", JSON.stringify(A.presets.filter((x: any) => x.id !== p.id))); } catch {} }}>
                  <span className="e">🎨</span><span className="l">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "filter" && (
          <>
            <ChipRow items={[{ id: "semua", label: "Unggulan" }, { id: "baru", label: "BARU" }, { id: "hidup", label: "Kehidupan" }]} cur={cat} onPick={setCat} />
            <div className="v6-grid4">
              {FILTERS.map((f: any) => (
                <button key={f.id} className={`v6-gcell ${A.filterPreset === f.id ? "on" : ""}`} onClick={() => { A.pushHist(); A.setFilterPreset(f.id); }}>
                  <span className="e">{f.emoji}</span><span className="l">{f.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "sesuaikan" && (
          <>
            {ADJUST_DEFS.map((d: any) => (
              <div className="v6-slider-row" key={d.key}>
                <div className="lr"><span>{d.emoji} {d.label}</span><b>{(A.adj as any)[d.key]}</b></div>
                <input type="range" min={d.min} max={d.max} value={(A.adj as any)[d.key]} onChange={e => A.setAdj({ ...A.adj, [d.key]: Number(e.target.value) })} />
              </div>
            ))}
            <button className="v6-btn ghost" style={{ width: "100%" }} onClick={() => A.setAdj({ ...DEFAULT_ADJUST })}>↺ Reset semua</button>
          </>
        )}
        {tab === "kualitas" && (
          <>
            <div className="v6-cardrow" onClick={() => A.setQualitySharp(!A.qualitySharp)}>
              <span style={{ fontSize: 20 }}>✨</span>
              <div className="tt">Peningkat ketajaman AI-lite<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Video lebih jernih & tajam saat diekspor</div></div>
              <button className={`v6-toggle ${A.qualitySharp ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" onClick={() => { A.setAdj({ b: 6, c: 14, s: 10, e: 4, tem: 2, hue: 0, fade: 0, vig: 30, grain: A.adj.grain }); A.setQualitySharp(true); }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <div className="tt">Koreksi otomatis<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Warna + kontras + ketajaman sekali tap</div></div>
              <span className="arr">›</span>
            </div>
            <div className="v6-note">Jujur ya bro: ini peningkatan ketajaman & kejernihan via filter konvolusi kanvas — bukan upscale AI beneran kayak di aplikasi berbayar 💎. Hasil tetap terasa lebih crisp.</div>
          </>
        )}
      </div>
    </SheetShell>
  );
}

/* ---------------- STIKER + GIPHY + OVERLAY FOTO ---------------- */
function StikerSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0 === "overlayimg" ? "overlay" : "stiker");
  const [cat, setCat] = useState("sosmed");
  const [q, setQ] = useState("");
  const curSticks = A.selId ? (A.selOpt?.stickers || []) : [];
  return (
    <SheetShell title="Stiker" onClose={onClose} onOk={onClose} tall>
      <TabBar tabs={["stiker", "overlay", "giphy"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body" style={{ paddingTop: 0 }}>
        {tab === "stiker" && (
          <>
            <div className="v6-searchbar">🔍<input placeholder="Cari: subscribe, rec, kupu, api…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <ChipRow items={[...STICKER_ANIM_CATS.map(c => ({ id: c.id, label: c.label })), ...STICKER_CATS.map(c => ({ id: c.id, label: c.label }))]} cur={cat} onPick={setCat} />
            <div className="v6-grid4">
              {["sosmed", "musik", "suasana"].includes(cat) && ANIM_STICKERS
                .filter(a => a.cat === cat && (!q || a.label.toLowerCase().includes(q.toLowerCase())))
                .map(a => (
                  <button key={a.id} className="v6-gcell" onClick={() => A.addSticker(a.id)} title="Stiker animasi — bergerak di video!">
                    <span className="e">{ANIM_STICKER_PREVIEW[a.id] || "✨"}</span><span className="l">{a.label} ✨</span>
                  </button>
                ))}
              {(STICKER_CATS.find(c => c.id === cat)?.items || []).map((em: string, i: number) => (
                <button key={`${em}${i}`} className="v6-gcell" onClick={() => A.addSticker(em)}>
                  <span className="e">{em}</span>
                </button>
              ))}
            </div>
            <div className="v6-note">✨ Stiker dengan tanda bintang adalah <b>stiker animasi</b> — tetap bergerak di video hasil ekspor. Seret langsung di layar pratinjau untuk memposisikan.</div>
          </>
        )}
        {tab === "overlay" && (
          <>
            <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
              🖼️ Tambahkan foto sebagai overlay (PiP)
              <input type="file" accept="image/*" hidden onChange={e => A.uploadOverlayImg(e.target.files)} />
            </label>
            <div className="v6-lbl">OVERLAY & STIKER DI KLIP TERPILIH ({curSticks.length})</div>
            {!A.selId && <div className="v6-note">Pilih klip dulu untuk mengelola overlay-nya.</div>}
            <div className="v6-grid4">
              {curSticks.map((s: any) => (
                <button key={s.id} className="v6-gcell" onClick={() => A.delSticker(A.selId, s.id)} title="Tap buat hapus">
                  {s.img ? <span style={{ fontSize: 20 }}>🖼️</span> : <span className="e">{ANIM_STICKER_PREVIEW[s.emoji] || s.emoji}</span>}
                  <span className="l">🗑 Hapus</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "giphy" && (
          <div className="v6-empty">
            <div className="big">🌐</div>
            Integrasi GIPHY butuh API key GIPHY (gratis). Sementara pakai tab <b>Stiker</b> (animasi orisinal kita) — jumlahnya bakal terus ditambah! 🚀
          </div>
        )}
      </div>
    </SheetShell>
  );
}

/* ---------------- EKSPOR (video | GIF, slider resolusi/fps/bitrate) ---------------- */
function EksporSheet({ api: A, onClose }: any) {
  useEffect(() => { if (!A.thumbU && (A.slides || []).length) { try { A.genThumb(0, 0, true); } catch {} } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const resIdx = RES_STOPS.indexOf(A.exRes);
  const fpsIdx = FPS_STOPS.indexOf(A.exFps);
  const mbIdx = MBPS_STOPS.indexOf(A.exMbps);
  return (
    <SheetShell title="Ekspor" onClose={onClose}>
      <div style={{ padding: "0 14px" }}>
        <div className="v6-xp-tabs">
          <button className={`v6-xp-tab ${A.exTab === "video" ? "on" : ""}`} onClick={() => A.setExTab("video")}>video</button>
          <button className={`v6-xp-tab ${A.exTab === "gif" ? "on" : ""}`} onClick={() => A.setExTab("gif")}>GIF</button>
        </div>
      </div>
      <div className="v6-sheet-body" style={{ paddingTop: 4 }}>
        {A.exTab === "video" ? (
          <>
            <div className="v6-cardrow" onClick={() => A.setQualitySharp(!A.qualitySharp)}>
              <span style={{ fontSize: 18 }}>💎</span>
              <div className="tt">Peningkat Ketajaman ✨<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Video lebih jernih & halus (filter ketajaman saat render)</div></div>
              <button className={`v6-toggle ${A.qualitySharp ? "on" : ""}`} />
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Resolusi</b><span>Definisi tinggi — pengalaman menonton terbaik</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={resIdx < 0 ? 2 : resIdx} onChange={e => A.setExRes(RES_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{RES_STOPS.map(r => <span key={r}>{r >= 1440 ? (r === 1440 ? "2k" : "4k") : `${r}p`}{A.exRes === r ? <>{""}<b>✔</b></> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Tingkat bingkai</b><span>Pemutaran lebih lancar</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={fpsIdx < 0 ? 2 : fpsIdx} onChange={e => A.setExFps(FPS_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{FPS_STOPS.map(f => <span key={f}>{f}{A.exFps === f ? <b>✔</b> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Bitrate (Mbps)</b><span>Konten lagu/statik: 8–12 sudah kinclong</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={mbIdx < 0 ? 1 : mbIdx} onChange={e => A.setExMbps(MBPS_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{MBPS_STOPS.map(m => <span key={m}>{m}{A.exMbps === m ? <b>✔</b> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-est">Perkiraan ukuran file: <b style={{ color: "#fff" }}>{A.estMB.toFixed(A.estMB > 80 ? 0 : 1)} MB</b> · durasi {formatDur(A.clipsTotal)} · ⏱ estimasi render ≈ <b style={{ color: A.estRenderSec < 60 ? "#22c55e" : A.estRenderSec < 180 ? "#fbbf24" : "#ef4444" }}>{A.estRenderSec < 60 ? `${A.estRenderSec} dtk` : `${Math.round(A.estRenderSec/60)} mnt`}</b> {A.estRenderSec < 60 ? "✅ target < 1 mnt tercapai" : ""}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="v6-chip" style={{ flex: 1, padding: "9px 4px", borderColor: "rgba(239,68,68,.55)", background: "rgba(239,68,68,.08)" }} onClick={() => { A.setExRes(480); A.setExFps(18); A.setExMbps(5); }}>🚀 Turbo &lt; 1 mnt 480p·18·5</button>
              <button className="v6-chip" style={{ flex: 1, padding: "9px 4px", borderColor: "rgba(34,197,94,.5)" }} onClick={() => { A.setExRes(720); A.setExFps(24); A.setExMbps(8); }}>⚡ Mode Ngebut 720p·24·8</button>
              <button className="v6-chip" style={{ flex: 1, padding: "9px 4px" }} onClick={() => { A.setExRes(1080); A.setExFps(30); A.setExMbps(12); }}>💎 Tajam 1080p·30·12</button>
            </div>
            <div style={{ fontSize: 10, color: "#8b8b98", marginTop: 6, lineHeight: 1.5 }}>
              🚀 Turbo = 480p·18fps·5Mbps — khusus target render &lt; 1 menit untuk video 5 menit. Kualitas pas-pasan (cocok share cepat), 4-6× lebih cepat dari Mode Ngebut. HP Kentang pun kuat.
              <br />⚡ Mode Ngebut = 720p·24fps·8Mbps — sweet spot YouTube/Reels, 2-3× lebih cepat dari Tajam.
              <br />💎 Tajam = 1080p·30fps·12Mbps — kualitas penuh, render paling lama.
            </div>
            <div style={{ fontSize: 10, color: "#8b8b98", marginTop: 6, lineHeight: 1.5 }}>Untuk video lagu, Mode Ngebut selesai ≈ 2–3× lebih cepat & tetap mulus buat YouTube/Reels. Render offline tetap butuh waktu nyata per durasi video — jangan kunci layar ya bro.</div>
            {A.estMB > 800 && <div className="v6-risk">🐘 Estimasi {A.estMB.toFixed(0)} MB itu RAKSASA buat HP (memori penuh, render lambat). Turunkan bitrate ke 8–12 Mbps — buat video lagu tetap kinclong.</div>}
            {A.exRes >= 1440 && <div className="v6-risk">⚠️ Render 2K/4K di HP butuh waktu & RAM besar. Kalau gagal, turunkan ke 1080p ya bro.</div>}
            <button className="v6-bigcta" onClick={A.doRender} disabled={A.loading === "render"}>
              {A.loading === "render" ? `⏳ Rendering… ${Math.round(A.progress * 100)}%` : A.videoUrl ? "🔄 Render Ulang" : "Ekspor"}</button>
            {!!A.videoUrl && (
              <>
                <video src={A.videoUrl} controls style={{ width: "100%", borderRadius: 12, marginTop: 10, border: "1px solid var(--v6-line)" }} />
                <button className="v6-bigcta" style={{ background: "#22c55e", color: "#052e16" }} onClick={A.downloadVideo}>⬇️ Download video {A.videoBlob ? `(${(A.videoBlob.size / 1048576).toFixed(1)} MB)` : ""}</button>
                {!A.meta && <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} disabled={A.loading === "meta"} onClick={A.genMetadata}>
                  {A.loading === "meta" ? "⏳ Menulis metadata…" : "📋 Metadata YouTube (judul + deskripsi + tags)"}</button>}
                {!!A.meta && (
                  <div style={{ marginTop: 10, border: "1px solid var(--v6-line)", borderRadius: 14, padding: 12 }}>
                    <b style={{ fontSize: 12 }}>📋 Metadata YouTube</b>
                    {([["t", "🏷️ Judul", A.meta.titleHighCTR], ["d", "📝 Deskripsi", A.meta.description], ["g", "#️⃣ Tags", (A.meta.tags || []).join(", ")], ["h", "🔖 Hashtags", A.meta.hashtags]] as any[]).map(([k, lb, val]) => (
                      <div key={k} style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#9ca3af" }}>{lb}</span>
                          <button className="v6-chip" style={{ padding: "3px 10px" }} onClick={() => A.copyFld(k, val || "")}>{A.copiedFld === k ? "✓" : "SALIN"}</button>
                        </div>
                        <div style={{ fontSize: 11, background: "rgba(0,0,0,.35)", borderRadius: 10, padding: 9, marginTop: 4, lineHeight: 1.55, whiteSpace: k === "d" ? "pre-wrap" : "normal" }}>{val}</div>
                      </div>
                    ))}
                    <button className="v6-btn" style={{ width: "100%", marginTop: 8 }} onClick={A.downloadMetaTxt}>📥 Download metadata (.txt)</button>
                  </div>
                )}
                {/* 🖼 v13.7 THUMBNAIL OTOMATIS — High-CTR dari judul terkunci + adegan video */}
                <div style={{ marginTop: 10, border: "1px solid rgba(255,214,10,.35)", borderRadius: 14, padding: 12 }}>
                  <b style={{ fontSize: 12 }}>🖼 Thumbnail YouTube otomatis</b>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, lineHeight: 1.5 }}>🧠 Dia MEMBACA adeganmu: ukur kecerahan kiri-kanan, taruh teks di sisi paling kontras, hitung kekuatan gradasinya — font Anton ala thumbnail viral, maks 3 kata emosional.</div>
                  {A.thumbU
                    ? <img src={A.thumbU} alt="thumbnail" style={{ width: "100%", borderRadius: 10, marginTop: 8, border: "1px solid var(--v6-line)" }} />
                    : <div className="v6-note" style={{ marginTop: 8 }}>{A.thumbBusy ? "⏳ Merakit thumbnail…" : "Thumbnail dirakit otomatis begitu ada adegan."}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="v6-chip" style={{ flex: 1 }} disabled={!!A.thumbBusy} onClick={() => A.genThumb(A.thumbSalt, A.thumbIdx + 1)}>🎬 Adegan lain</button>
                    <button className="v6-chip" style={{ flex: 1 }} disabled={!!A.thumbBusy} onClick={() => A.genThumb(A.thumbSalt + 1, A.thumbIdx)}>🔀 Urutan kata lain</button>
                  </div>
                  <button className="v6-bigcta" style={{ marginTop: 8 }} disabled={!A.thumbU || !!A.thumbBusy} onClick={A.downloadThumb}>⬇ Download thumbnail (1280×720 JPG)</button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="v6-empty" style={{ margin: "12px 0 0" }}>
              <div className="big">🎞️</div>
              GIF dibuat dari <b>8 detik pertama</b> timeline, resolusi ringkas, 10 fps, tanpa audio.<br />Pas buat sticker/share cepat.
            </div>
            <button className="v6-bigcta" onClick={A.doRenderGif} disabled={A.loading === "gif"}>
              {A.loading === "gif" ? `⏳ Merangkai… ${Math.round(A.progress * 100)}%` : "Unduh GIF"}</button>
            <div style={{ height: 6 }} />
          </>
        )}
      </div>
    </SheetShell>
  );
}

/* ==================================================================
   TEXT EDIT SHEET — Template · Font · Gaya · Animasi · Gelembung · Preset
   ================================================================== */
function TextEditSheet({ slideId, text, onChange, onDone, onDelete, layerLbl }: any) {
  const [tab, setTab] = useState("template");
  const [presets, setPresets] = useState<any[]>([]);
  useEffect(() => { try { setPresets(JSON.parse(localStorage.getItem("verve_text_presets") || "[]")); } catch {} }, []);
  const ct = text as ClipText;
  function savePreset() {
    const name = prompt("Nama preset teks:", "Gaya saya"); if (!name) return;
    const arr = [...presets, { id: uid("tp"), name: name.slice(0, 20), st: { ...ct, txt: "" } }];
    setPresets(arr);
    try { localStorage.setItem("verve_text_presets", JSON.stringify(arr)); } catch {}
  }
  const tabs = ["template", "font", "gaya", "animasi", "gelembung", "preset"];
  return (
    <>
      <div className="v6-sheet-back" style={{ background: "rgba(0,0,0,.15)" }} onClick={onDone} />
      <div className="v6-sheet" style={{ maxHeight: "66dvh" }}>
        <div className="v6-sheet-head">
          <button className="x" onClick={onDelete} title="Hapus lapisan teks ini">🗑</button>
          {layerLbl ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--v6-teal)", whiteSpace: "nowrap" }}>{layerLbl}</span> : null}
          <input className="v6-inp" style={{ flex: 1, borderRadius: 999, padding: "9px 16px" }} placeholder="Masukkan teks"
            value={ct.txt} onChange={e => onChange({ txt: e.target.value })} autoFocus />
          <button className="v" onClick={onDone}>✓</button>
        </div>
        <TabBar tabs={tabs.map(t => t[0].toUpperCase() + t.slice(1))} cur={tab[0].toUpperCase() + tab.slice(1)} onPick={t => setTab(t.toLowerCase())} />
        <div className="v6-sheet-body">
          {tab === "template" && (
            <div className="v6-grid4">
              {TEXT_TEMPLATES.map((t: any) => (
                <button key={t.id} className="v6-gcell" onClick={() => onChange({ ...t.st })}>
                  <span className="prev-txt" style={{ color: t.st.color || "#fff", textShadow: t.st.shadow ? "0 2px 6px #000" : "none", WebkitTextStroke: t.st.stroke ? `1px ${t.st.strokeColor || "#000"}` : "0" }}>Aa</span>
                  <span className="l">{t.label}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "font" && (
            <div className="v6-grid4">
              {TEXT_FONTS.map((f: any) => (
                <button key={f.id} className={`v6-gcell ${ct.font === f.id ? "on" : ""}`} onClick={() => onChange({ font: f.id })}>
                  <span className="prev-txt" style={{ fontFamily: f.stack, fontSize: 13 }}>{f.label}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "gaya" && (
            <>
              <div className="v6-lbl">WARNA TEKS</div>
              <div className="v6-rows">
                {TEXT_COLORS.map((c: string) => <button key={c} className={`v6-swatch ${ct.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ color: c })} />)}
                <span className="v6-swatch" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                  <input type="color" value={ct.color} onChange={e => onChange({ color: e.target.value })} />
                </span>
              </div>
              <div className="v6-slider-row"><div className="lr"><span>Ukuran</span><b>{Math.round(ct.size * 1000)}</b></div>
                <input type="range" min={0.025} max={0.09} step={0.005} value={ct.size} onChange={e => onChange({ size: Number(e.target.value) })} /></div>
              <div className="v6-slider-row"><div className="lr"><span>Posisi vertikal</span><b>{Math.round(ct.y * 100)}%</b></div>
                <input type="range" min={0.08} max={0.92} step={0.01} value={ct.y} onChange={e => onChange({ y: Number(e.target.value) })} /></div>
              <div className="v6-slider-row"><div className="lr"><span>Posisi horizontal</span><b>{Math.round((ct.x ?? 0.5) * 100)}%</b></div>
                <input type="range" min={0.05} max={0.95} step={0.01} value={ct.x ?? 0.5} onChange={e => onChange({ x: Number(e.target.value) })} /></div>
              {ct.start != null && (
                <div style={{ background: "rgba(25,194,184,.08)", border: "1px solid rgba(25,194,184,.3)", borderRadius: 12, padding: "8px 10px", marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--v6-teal)", marginBottom: 6 }}>⏱ TEKS LEPAS — punya waktu sendiri (digeser di track)</div>
                  <div className="v6-slider-row"><div className="lr"><span>Mulai di detik</span><b style={{ color: "var(--v6-teal)" }}>{formatDur(ct.start)}</b></div>
                    <input type="range" min={0} max={600} step={0.1} value={ct.start} onChange={e => onChange({ start: Number(e.target.value) })} /></div>
                  <div className="v6-slider-row"><div className="lr"><span>Durasi tampil</span><b>{formatDur(ct.dur ?? 3)}</b></div>
                    <input type="range" min={0.5} max={120} step={0.1} value={ct.dur ?? 3} onChange={e => onChange({ dur: Number(e.target.value) })} /></div>
                  <button className="v6-btn ghost" style={{ width: "100%", marginTop: 2 }} onClick={() => onChange({ start: null, dur: undefined })}>↩ Kembali ikuti klip (teks nempel klip lagi)</button>
                </div>
              )}
              <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                <button className={`v6-chip ${ct.bold ? "on" : ""}`} onClick={() => onChange({ bold: !ct.bold })}><b>B</b> Tebal</button>
                <button className={`v6-chip ${ct.italic ? "on" : ""}`} onClick={() => onChange({ italic: !ct.italic })}><i>I</i> Miring</button>
                <button className={`v6-chip ${ct.shadow ? "on" : ""}`} onClick={() => onChange({ shadow: !ct.shadow })}>🌑 Bayangan</button>
                <button className={`v6-chip ${ct.align === "left" ? "on" : ""}`} onClick={() => onChange({ align: "left" })}>⇤</button>
                <button className={`v6-chip ${ct.align === "center" ? "on" : ""}`} onClick={() => onChange({ align: "center" })}>≡</button>
                <button className={`v6-chip ${ct.align === "right" ? "on" : ""}`} onClick={() => onChange({ align: "right" })}>⇥</button>
              </div>
              <div className="v6-lbl">GARIS TEPI (STROKE)</div>
              <div className="v6-rows" style={{ alignItems: "center" }}>
                <button className={`v6-chip ${ct.stroke ? "on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => onChange({ stroke: !ct.stroke })}>{ct.stroke ? "✓" : "○"}</button>
                {["#000000", "#ffffff", "#ef4444", "#f59e0b", "#0e7490", "#7c3aed"].map(c => (
                  <button key={c} className={`v6-swatch ${ct.strokeColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ stroke: true, strokeColor: c })} />
                ))}
              </div>
              {ct.stroke && <div className="v6-slider-row"><div className="lr"><span>Ketebalan</span><b>{ct.strokeW}px</b></div>
                <input type="range" min={1} max={12} step={1} value={ct.strokeW} onChange={e => onChange({ strokeW: Number(e.target.value) })} /></div>}
            </>
          )}
          {tab === "animasi" && (
            <>
              <div className="v6-tabs" style={{ padding: "0 0 6px", border: "none" }}>
                <span className="v6-tab on">Masuk</span>
                <span className="v6-tab" style={{ cursor: "default", opacity: .5 }}>Keluar • otomatis memudar</span>
              </div>
              <div className="v6-grid4">
                {TEXT_ANIMS.map((a: any) => (
                  <button key={a.id} className={`v6-gcell ${ct.anim === a.id ? "on" : ""}`} onClick={() => onChange({ anim: a.id })}>
                    <span className="e">{a.emoji}</span><span className="l">{a.label}</span>
                  </button>
                ))}
              </div>
              <div className="v6-note">💫 Animasi <b>berulang</b> (denyut/goyang) ada di menu Animasi klip → tab Kombinasi.</div>
            </>
          )}
          {tab === "gelembung" && (
            <>
              <div className="v6-lbl">LATAR BALON TEKS</div>
              <div className="v6-rows" style={{ alignItems: "center" }}>
                <button className={`v6-chip ${!ct.bg ? "on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => onChange({ bg: false })}>🚫</button>
                {["#000000", "#ffffff", "#ef4444", "#f59e0b", "#22c55e", "#0e7490", "#7c3aed", "#ec4899"].map(c => (
                  <button key={c} className={`v6-swatch ${ct.bg && ct.bgColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ bg: true, bgColor: c })} />
                ))}
              </div>
              <div className="v6-note">Gelembung = kotak latar membulat di belakang teks (semi-transparan) — bagus buat caption di atas video ramai.</div>
            </>
          )}
          {tab === "preset" && (
            <>
              <button className="v6-bigcta" style={{ marginTop: 2 }} onClick={savePreset}>＋ Simpan gaya teks ini</button>
              <div className="v6-grid4">
                {!presets.length && <div className="v6-note" style={{ gridColumn: "1/-1" }}>Belum ada preset tersimpan.</div>}
                {presets.map((p: any) => (
                  <button key={p.id} className="v6-gcell" onClick={() => onChange({ ...p.st })}>
                    <span className="prev-txt" style={{ color: p.st.color, fontFamily: TEXT_FONTS.find((f: any) => f.id === p.st.font)?.stack }}>Aa</span>
                    <span className="l">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ==================================================================
   MODAL KECIL / UTIL
   ================================================================== */
function MiniModal({ title, children, onClose }: any) {
  return (
    <div className="v6-modal-back" onClick={onClose}>
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ flex: 1 }}>{title}</h3>
          <button className="v6-tbtn v6e-tbtn" onClick={onClose} style={{ color: "#fff" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- REKAM ---------- */
function RekamModal({ onClose, onUse }: any) {
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [tele, setTele] = useState("");
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itvRef = useRef<any>(null);
  useEffect(() => () => { stopAll(); }, []); // eslint-disable-line
  function stopAll() {
    clearInterval(itvRef.current);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  async function start() {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = st;
      const mr = new MediaRecorder(st);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }));
        onUse(url);
      };
      mrRef.current = mr; mr.start();
      setRec(true); setSec(0);
      itvRef.current = setInterval(() => setSec(s => s + 1), 1000);
    } catch { alert("🎙️ Izin mikrofon ditolak. Aktifkan di pengaturan browser ya bro."); }
  }
  function stop() {
    clearInterval(itvRef.current);
    setRec(false);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={() => { stopAll(); onClose(); }}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>Rekam</h3>
          <div style={{ width: 38 }} />
        </div>
        <div className="v6-rec">
          {tele !== "" && <div className="v6-inp v6-ta" style={{ width: "100%", marginBottom: 14, color: "#c7c7d2", fontSize: 12 }}>{tele || "…"}</div>}
          <button className={`mic ${rec ? "stop" : ""}`} onClick={rec ? stop : start}>{rec ? "⏹" : "🎙"}</button>
          <div className="tm">{rec ? `0:${String(sec).padStart(2, "0")}` : ""}</div>
          <div className="hint">{rec ? "Merekam… tap untuk berhenti & pakai" : "Ketuk atau tekan dan tahan untuk merekam"}</div>
          <div className="side">
            <button className="sbtn" onClick={() => { setTele(tele === "" ? "Ketik naskahmu di sini…\nBiar gak lupa pas rekam 😄" : ""); }}>
              📜<span>Teleprompter</span>
            </button>
            <button className="sbtn" onClick={() => alert("🎚️ Sempurnakan suara: hasil rekaman otomatis dinormalisasi ringan saat digabung musik saat ekspor.")}>🎚️<span>Sempurnakan</span></button>
            <button className="sbtn" onClick={() => alert("🎭 Pengubah suara segera hadir — sementara pakai Teks-ke-audio untuk suara AI.")}>🎭<span>Pengubah</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- TEKS KE AUDIO (TTS) ---------- */
function TtsModal({ initial, onClose, onGen, loading, voice, setVoice }: any) {
  const [txt, setTxt] = useState(initial || "");
  const [narr, setNarr] = useState(true);
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
        <div className="t">Teks ke audio</div>
        <button className="v6-btn" style={{ padding: "8px 16px" }} onClick={() => txt.trim().length >= 4 ? onGen(txt, voice) : alert("Isi teks dulu bro")} disabled={loading === "tts"}>
          {loading === "tts" ? "⏳" : "Berikutnya"}
        </button>
      </div>
      <div className="fb">
        <div style={{ border: "1px solid var(--v6-line)", borderRadius: 16, padding: 14, background: "#14141b" }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>❝</div>
          <textarea className="v6-inp v6-ta" style={{ border: "none", background: "none", padding: 0, fontSize: 13.5 }}
            placeholder="Tempelkan teks Anda di sini, lalu masukkan jeda baris untuk memisahkannya menjadi keterangan terpisah…"
            value={txt} onChange={e => setTxt(e.target.value)} />
          <button className="v6-chip" style={{ marginTop: 6 }} onClick={() => setTxt("Hai teman-teman, selamat datang kembali di channel kita. Kali ini kita akan bahas sesuatu yang sangat menyentuh hati. Jadi simak sampai habis ya!")}>✨ Coba sebuah contoh</button>
        </div>
        <div className="v6-cardrow" style={{ cursor: "default" }}>
          <span style={{ fontSize: 18 }}>🗣</span>
          <div className="tt">Pengisi suara</div>
          <button className={`v6-toggle ${narr ? "on" : ""}`} onClick={() => setNarr(!narr)} />
        </div>
        <div className="v6-lbl">DIBUAT OLEH: TEKS KE UCAPAN ▾ &nbsp;&nbsp;<span style={{ color: "#6b7280" }}>Lainnya ›</span></div>
        <div className="v6-rows">
          {VOICES.map(v => (
            <button key={v.id} className={`v6-voice-chip ${voice === v.id ? "on" : ""}`} onClick={() => setVoice(v.id)}>
              <span className="av" style={{ background: v.bg }}>{v.av}</span>
              <span className="nm">{v.name}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">💡 Hasilnya masuk sebagai <b>narasi di track audio</b>. Lanjutkan ke menu 💬 <b>Keterangan otomatis</b> → keterangan karaoke sinkron otomatis dibuat dari teks ini!</div>
      </div>
    </div>
  );
}

/* ---------- MUSIK AI (SUNO) ---------- */
function MusikModal(p: any) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={p.onClose}>✕</button>
        <div className="t">Musik AI (Suno)</div>
        <button className="v6-btn" style={{ padding: "8px 16px" }} onClick={p.onGen} disabled={p.loading === "suno"}>{p.loading === "suno" ? "⏳" : "🎵 Buat lagu"}</button>
      </div>
      <div className="fb">
        <button className="v6-chip" onClick={() => setShowKey(!showKey)}>🔑 API Key Suno {p.sunoKey ? "✅" : "(mode gratis)"} {showKey ? "▴" : "▾"}</button>
        {showKey && (
          <div style={{ marginTop: 8 }}>
            <input className="v6-inp" placeholder="API key (kosongkan = mode gratis)" value={p.sunoKey}
              onChange={e => { p.setSunoKey(e.target.value); try { localStorage.setItem("verve_suno_key", e.target.value.trim()); } catch {} }} />
            <select className="v6-inp" style={{ marginTop: 6 }} value={p.sunoProv}
              onChange={e => { p.setSunoProv(e.target.value); try { localStorage.setItem("verve_suno_provider", e.target.value); } catch {} }}>
              <option value="kie">🥇 Kie.ai (rekomendasi)</option><option value="apiframe">Apiframe.ai</option><option value="sunor">Sunor.cc</option>
            </select>
          </div>
        )}
        <div className="v6-lbl">JUDUL LAGU</div>
        <input className="v6-inp" placeholder="cth: Rindu Ibu di Ujung Doa" value={p.mTitle} onChange={e => p.setMTitle(e.target.value)} />
        <div className="v6-lbl">MODE</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          <button className={`v6-chip ${p.mVocal === "vocal" ? "on" : ""}`} onClick={() => p.setMVocal("vocal")}>🎤 Vokal + Lirik</button>
          <button className={`v6-chip ${p.mVocal === "instrumental" ? "on" : ""}`} onClick={() => p.setMVocal("instrumental")}>🎹 Instrumen saja</button>
        </div>
        {p.mVocal === "vocal" && <>
          <div className="v6-lbl">LIRIK (orisinal — aman hak cipta ✅)</div>
          <textarea className="v6-inp v6-ta" placeholder="Tulis lirik di sini…" value={p.mLyrics} onChange={e => p.setMLyrics(e.target.value)} />
        </>}
        <div className="v6-lbl">GENRE</div>
        <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
          {MUSIC_GENRES.map(g => <button key={g} className={`v6-chip ${p.mGenre === g ? "on" : ""}`} onClick={() => p.setMGenre(g)}>{g}</button>)}
        </div>
        <div className="v6-lbl">SUASANA</div>
        <input className="v6-inp" placeholder="cth: melankolis, menyentuh, epik" value={p.mMood} onChange={e => p.setMMood(e.target.value)} />
        <div className="v6-lbl">STYLE PROMPT (otomatis — boleh diedit)</div>
        <textarea className="v6-inp" style={{ minHeight: 60 }} value={p.mStyle} placeholder={""} onChange={e => p.setMStyle(e.target.value)} />
        <div className="v6-lbl">MODEL</div>
        <select className="v6-inp" value={p.mModel} onChange={e => p.setMModel(e.target.value)}>
          {["suno-v5.5", "suno-v5", "suno-v4.5", "suno-v4", "suno-v3.5"].map(m => <option key={m} value={m}>{m}{m === "suno-v5.5" ? " 💎 terbaik" : m === "suno-v3.5" ? " ⚡ tercepat" : ""}</option>)}
        </select>
        {p.mStatus && (
          <div className={p.mStatus === "selesai" ? "v6-okbox" : "v6-risk"}>
            {p.mStatus === "selesai" ? "✅ Lagu selesai & sudah masuk track audio!" : p.mStatus === "gagal" ? "❌ Gagal — coba lagi atau ganti model/provider." : p.mStatus === "memulai..." ? "⏳ Memulai…" : "⏳ Lagu sedang diolah server (1–6 menit). Polling jalan otomatis — silakan lanjut edit yang lain."}
          </div>
        )}
        {p.mTask && <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={p.onCek}>🔄 Cek status lagu (gratis)</button>}
        {p.musicUrl && <div className="v6-okbox">🎵 Musik aktif di track audio ✅</div>}
        <div className="v6-note">🛡️ Lagu yang dibuat AI di sini adalah <b>orisinal</b> — bebas kamu pakai di YouTube/TikTok tanpa klaim (versi gratis & berbayar sama-sama aman dipakai komersial sesuai ketentuan provider).</div>
      </div>
    </div>
  );
}

/* ---------- KAMERA ---------- */
function KameraModal({ onClose, onPhoto }: any) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const stRef = useRef<MediaStream | null>(null);
  const [face, setFace] = useState<"user" | "environment">("environment");
  useEffect(() => {
    let off = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: face }, audio: false }).then(st => {
      if (off) { st.getTracks().forEach(t => t.stop()); return; }
      stRef.current = st;
      if (vidRef.current) vidRef.current.srcObject = st;
    }).catch(() => alert("📷 Kamera tidak bisa diakses (izin ditolak?)."));
    return () => { off = true; stRef.current?.getTracks().forEach(t => t.stop()); };
  }, [face]);
  function snap() {
    const v = vidRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    onPhoto(c.toDataURL("image/jpeg", 0.9));
  }
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>Ambil gambar</h3>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={() => setFace(f => f === "user" ? "environment" : "user")}>🔄</button>
        </div>
        <video ref={vidRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 14, background: "#000", aspectRatio: "3/4", objectFit: "cover" }} />
        <button className="v6-bigcta" onClick={snap}>📸 Jepret & masukkan ke timeline</button>
      </div>
    </div>
  );
}

/* ---------- WIZARD PEMBUAT AI ---------- */
function WizardModal(p: any) {
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={p.onClose}>✕</button>
        <div className="t">🧠 Pembuat AI</div>
        <div style={{ width: 38 }} />
      </div>
      <div className="fb">
        <div className="v6-lbl">IDE / NICHE KONTEN</div>
        <textarea className="v6-inp" style={{ minHeight: 70 }} placeholder="cth: cerita sedih perjuangan ibu membesarkan anak" value={p.niche} onChange={e => p.setNiche(e.target.value)} />
        <div className="v6-note" style={{ marginTop: 2 }}>aksi: AI bikin <b>judul → visual → audio</b> otomatis jadi proyek siap edit.</div>
        <div className="v6-lbl">JUMLAH KLIP</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          {[3, 4, 6, 8].map(n => <button key={n} className={`v6-chip ${p.n === n ? "on" : ""}`} onClick={() => p.setN(n)}>{n} klip</button>)}
        </div>
        <div className="v6-lbl">GAYA VISUAL</div>
        <div className="v6-grid4">
          {IMG_STYLE_PRESETS.map(s => (
            <button key={s.id} className={`v6-gcell ${p.styleId === s.id ? "on" : ""}`} onClick={() => p.setStyle(s.id)}>
              <span style={{ fontSize: 18 }}>{s.label.split(" ")[0]}</span><span className="l">{s.label.split(" ").slice(1).join(" ")}</span>
            </button>
          ))}
        </div>
        <div className="v6-lbl">AUDIO</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          {([["tts", "🗣️ Narasi AI"], ["suno", "🎵 Lagu AI"], ["none", "🔇 Tanpa audio"]] as any[]).map(([id, lb]) => (
            <button key={id} className={`v6-chip ${p.audio === id ? "on" : ""}`} onClick={() => p.setAudio(id)}>{lb}</button>
          ))}
        </div>
        <button className="v6-bigcta" onClick={p.onRun} disabled={p.loading === "wizard"}>
          {p.loading === "wizard" ? "⏳ Menggenerasi…" : "🚀 Buat proyek sekarang"}</button>
        {p.loading === "wizard" && !!p.stageText && <div className="v6-okbox">{p.stageText}</div>}
        <div className="v6-note">⏱ Proses 1–3 menit (gambar satu-satu). Untuk lagu AI, task berlanjut di background — cek di menu Musik AI.</div>
      </div>
    </div>
  );
}

/* ---------- SAMPUL ---------- */
function SampulModal({ slides, slideOptsById, timeline, ratio, getImage, onClose, onSave }: any) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [t, setT] = useState(0);
  const [txt, setTxt] = useState("");
  const total = timeline?.total || 0;
  const cw = ratio === "9:16" ? 270 : ratio === "1:1" ? 320 : 426;
  const ch = ratio === "9:16" ? 480 : ratio === "1:1" ? 320 : 240;
  useEffect(() => {
    const paint = () => {
      const cv = cvRef.current; if (!cv) return;
      const ctx = cv.getContext("2d") as CanvasRenderingContext2D | null; if (!ctx) return;
      const W = cv.width, H = cv.height;
      ctx.fillStyle = "#0a0a0e"; ctx.fillRect(0, 0, W, H);
      const tl = timeline; if (!tl || !slides.length) return;
      const L = locate(tl, Math.min(t, Math.max(0, tl.total - 0.001)));
      const opt = slideOptsById[slides[L.idx].id] || null;
      const cur = getImage(slides[L.idx].imageUrl);
      paintClips(ctx, W, H, cur, null, {
        clipT: L.clipT, clipDur: L.clipDur, inTrans: false, transT: 0, transId: "none",
        optCur: opt, optNxt: null, globalFilter: "none", absT: t, isMobile: true, beat: false, grain: 0, kbZoom: 1,
      } as any);
      paintFloatingStickers(ctx, W, H, slides.map((x: Slide) => slideOptsById[x.id]), t);
      paintFloatingTexts(ctx, W, H, slides.map((x: Slide) => slideOptsById[x.id]), t);
      if (txt.trim()) {
        const ct: ClipText = { ...DEFAULT_TEXT, txt, size: 0.085, y: 0.85, karaokeWords: undefined };
        paintClipTextSafe(ctx, W, H, ct);
      }
    };
    paint();
    const itv = setInterval(paint, 400); // gambar async loading
    return () => clearInterval(itv);
  }, [t, txt, slides, slideOptsById, timeline]); // eslint-disable-line
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>✏️ Sampul proyek</h3>
          <div style={{ width: 38 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <canvas ref={cvRef} width={cw} height={ch} style={{ borderRadius: 12, border: "1px solid var(--v6-line)", maxWidth: "78vw" }} />
        </div>
        <div className="v6-slider-row"><div className="lr"><span>Pilih frame</span><b>{formatDur(t)}</b></div>
          <input type="range" min={0} max={Math.max(0.1, total - 0.01)} step={0.05} value={t} onChange={e => setT(Number(e.target.value))} /></div>
        <input className="v6-inp" placeholder="Teks judul di sampul (opsional)" value={txt} onChange={e => setTxt(e.target.value)} />
        <button className="v6-bigcta" onClick={() => onSave(cvRef.current!.toDataURL("image/jpeg", 0.82))}>✓ Simpan sampul</button>
        <div className="v6-note">Sampul tampil di <b>strip proyek terakhir</b> & halaman Proyek — jadi gampang dikenali.</div>
      </div>
    </div>
  );
}
function paintClipTextSafe(ctx: CanvasRenderingContext2D, W: number, H: number, ct: ClipText) {
  try { paintClipText(ctx, W, H, ct, 1, 10, 1, 1); } catch {}
}

/* ---------- GAMBAR AI (satu) ---------- */
function GambarAiModal({ onClose, onGen, loading }: any) {
  const [pr, setPr] = useState("");
  const [st, setSt] = useState("cinematic");
  return (
    <MiniModal title="🎨 Gambar AI" onClose={onClose}>
      <textarea className="v6-inp v6-ta" style={{ minHeight: 80 }} placeholder="Konsep gambar, cth: seorang ibu tua tersenyum memegang foto lama, cahaya senja hangat dari jendela" value={pr} onChange={e => setPr(e.target.value)} />
      <div className="v6-lbl">GAYA</div>
      <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
        {IMG_STYLE_PRESETS.map(s => <button key={s.id} className={`v6-chip ${st === s.id ? "on" : ""}`} onClick={() => setSt(s.id)}>{s.label}</button>)}
      </div>
      <button className="v6-bigcta" disabled={loading === "image" || pr.trim().length < 8} onClick={() => onGen(pr, st)}>
        {loading === "image" ? "⏳ Membuat…" : "✨ Generate"}</button>
    </MiniModal>
  );
}

/* ---------- VIDEO AI ---------- */
function VideoAiModal({ onClose }: any) {
  const [pr, setPr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  async function gen() {
    if (pr.trim().length < 8) return alert("Tulis konsep dulu bro");
    setBusy(true); setResult("");
    try {
      const r = await fetch("/api/hcnsec/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: pr, duration: 5, aspectRatio: "9:16" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `Error ${r.status}`);
      if (d.video_url) setResult(d.video_url);
      else if (d.task_id || d.id) setResult("pending");
      else setResult("pending");
    } catch (e: any) { alert("Gagal: " + e.message); }
    setBusy(false);
  }
  return (
    <MiniModal title="🎬 Video AI (beta)" onClose={onClose}>
      <textarea className="v6-inp v6-ta" style={{ minHeight: 80 }} placeholder="cth: hujan turun di jendela kafe yang hangat, sinematik" value={pr} onChange={e => setPr(e.target.value)} />
      <button className="v6-bigcta" disabled={busy} onClick={gen}>{busy ? "⏳…" : "✨ Generate video pendek"}</button>
      {result === "pending" && <div className="v6-okbox">⏳ Video sedang dibuat server. Karena klip video AI belum bisa disisipkan langsung ke timeline (timeline kita berbasis foto klip), hasilnya dibuka di tab baru.</div>}
      {result && result !== "pending" && <a className="v6-okbox" style={{ display: "block" }} href={result} target="_blank" rel="noreferrer">▶️ Buka hasil video AI</a>}
    </MiniModal>
  );
}

/* ==================================================================
   EDIT FOTO (mini page)
   ================================================================== */
function EditFotoPage({ onExit }: any) {
  const [imgUrl, setImgUrl] = useState("");
  const [flt, setFlt] = useState("none");
  const [adjL, setAdjL] = useState<AdjustState>({ ...DEFAULT_ADJUST });
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    if (!imgUrl) { ctx.fillStyle = "#101016"; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const side = Math.min(720, Math.max(img.naturalWidth, 1));
      const ar = img.naturalWidth / img.naturalHeight;
      cv.width = ar >= 1 ? side : Math.round(side * ar);
      cv.height = ar >= 1 ? Math.round(side / ar) : side;
      ctx.filter = buildClipFilter(flt, adjL);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      ctx.filter = "none";
    };
    img.src = imgUrl;
  }, [imgUrl, flt, adjL]);
  return (
    <div className="v6-root" style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={onExit}>✕</button>
        <div className="spacer" />
        <b style={{ fontSize: 13 }}>Edit foto</b>
        <div className="spacer" />
        <button className="v6e-export" disabled={!imgUrl} onClick={() => {
          const cv = cvRef.current; if (!cv) return;
          cv.toBlob(b => { if (b) downloadBlob(b, `foto_verve_${Date.now()}.jpg`); }, "image/jpeg", 0.92);
        }}>Simpan</button>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", minHeight: 0, padding: 12 }}>
        {imgUrl ? <canvas ref={cvRef} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} /> : (
          <label style={{ textAlign: "center", color: "#9ca3af", cursor: "pointer" }}>
            <div style={{ fontSize: 42 }}>🖼️</div>
            <div style={{ fontSize: 12, marginBottom: 12 }}>Pilih foto untuk diedit</div>
            <span className="v6-btn">📥 Buka galeri</span>
            <input type="file" accept="image/*" hidden onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader(); r.onload = () => setImgUrl(r.result as string); r.readAsDataURL(f);
            }} />
          </label>
        )}
      </div>
      <div style={{ background: "#0b0b10", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", maxHeight: "46%", overflowY: "auto" }}>
        <div className="v6-chips" style={{ padding: "0 0 6px" }}>
          {FILTERS.map((f: any) => <button key={f.id} className={`v6-chip ${flt === f.id ? "on" : ""}`} onClick={() => setFlt(f.id)}>{f.emoji} {f.label}</button>)}
        </div>
        {ADJUST_DEFS.slice(0, 6).map((d: any) => (
          <div className="v6-slider-row" key={d.key} style={{ margin: "6px 2px" }}>
            <div className="lr"><span>{d.emoji} {d.label}</span><b>{(adjL as any)[d.key]}</b></div>
            <input type="range" min={d.min} max={d.max} value={(adjL as any)[d.key]} onChange={e => setAdjL({ ...adjL, [d.key]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================
   TRANSKRIPSIKAN (speech-to-text eksperimen)
   ================================================================== */
function TranskripPage({ onExit }: any) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("id-ID");
  async function transcribe(f: File) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Browser ini belum dukung transkripsi (pakai Chrome)."); return; }
    setBusy(true); setOut("");
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    const rec = new SR();
    rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) setOut(o => (o ? o + "\n" : "") + ev.results[i][0].transcript.trim());
      }
    };
    a.onended = () => { try { rec.stop(); } catch {}; setBusy(false); };
    a.onerror = () => { try { rec.stop(); } catch {}; setBusy(false); alert("Audio tidak terbaca."); };
    await a.play().then(() => { try { rec.start(); } catch {} }).catch(() => { setBusy(false); alert("Gagal memutar file."); });
  }
  return (
    <div className="v6-root" style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={onExit}>✕</button>
        <div className="spacer" /><b style={{ fontSize: 13 }}>📝 Transkripsikan</b><div className="spacer" />
        <button className="v6e-export" disabled={!out} onClick={() => copyTxt(out)}>Salin</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <div className="v6-cardrow" style={{ cursor: "default" }}>
          <span style={{ fontSize: 18 }}>🗣</span><div className="tt">Bahasa</div>
          <select className="v6-inp" style={{ width: 130, padding: "7px 10px" }} value={lang} onChange={e => setLang(e.target.value)}>
            <option value="id-ID">Indonesia</option><option value="en-US">English</option>
            <option value="jv-ID">Jawa</option><option value="su-ID">Sunda</option><option value="ms-MY">Melayu</option>
          </select>
        </div>
        <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
          {busy ? "🎧 Mendengarkan… jangan tutup" : "📥 Pilih file audio/video"}
          <input type="file" accept="audio/*,video/*" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) transcribe(f); }} />
        </label>
        <div className="v6-lbl">HASIL TRANSKRIP</div>
        <div className="v6-inp v6-ta" style={{ minHeight: 220, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{out || <span style={{ opacity: .4 }}>Teks akan muncul di sini…</span>}</div>
        <div className="v6-note">⚠️ Fitur ini memakai pengenal suara bawaan browser (eksperimen, paling akurat di Chrome). Verifikasi manual tetap disarankan.</div>
      </div>
    </div>
  );
}

/* ==================================================================
   HAK CIPTA — panduan status audio (jujur: bukan fingerprint scanner)
   ================================================================== */
function HakCiptaModal({ musicUrl, musicName, ttsUrl, voiceUrl, onClose }: any) {
  const isSuno = !!musicUrl && /^https?:/i.test(musicUrl) && /kie\.ai|suno|apiframe|sunor|aimusic|cdn|r2\.dev/i.test(musicUrl);
  const isEkstrak = !!musicUrl && musicUrl.startsWith("blob:");
  const isUpload = !!musicUrl && musicUrl.startsWith("data:");
  const rows: { ic: string; t: string; d: string; ok: "ok" | "warn" }[] = [];
  if (isSuno) rows.push({ ic: "✅", t: `Musik: "${musicName || "Lagu AI"}"`, d: "Dibuat AI (Suno) = orisinal buatanmu — risiko klaim sangat rendah. Aman buat YouTube/TikTok/monetisasi.", ok: "ok" });
  if (isEkstrak) rows.push({ ic: "⚠️", t: "Audio hasil ekstrak video", d: "Pastikan video sumbernya milikmu sendiri atau bebas lisensi. Mengekstrak lagu orang lain tetap berisiko klaim.", ok: "warn" });
  if (isUpload) rows.push({ ic: "⚠️", t: "Musik upload dari HP", d: "Status hak cipta mengikuti file aslinya. Kalau itu lagu artis/karya orang lain, YouTube bisa memberi klaim — pakai musik AI lebih aman.", ok: "warn" });
  if (ttsUrl) rows.push({ ic: "✅", t: "Narasi suara AI", d: "Suara sintetis dari teks kamu sendiri — aman.", ok: "ok" });
  if (voiceUrl) rows.push({ ic: "✅", t: "Rekaman suara sendiri", d: "Suara kamu sendiri — 100% aman.", ok: "ok" });
  if (!rows.length) rows.push({ ic: "ℹ️", t: "Belum ada audio", d: "Tambahkan audio dulu — nanti statusnya dicek di sini.", ok: "ok" });
  return (
    <MiniModal title="🛡 Cek Hak Cipta" onClose={onClose}>
      {rows.map(r => (
        <div key={r.t} className="v6-cardrow" style={{ cursor: "default", alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>{r.ic}</span>
          <div className="tt" style={{ fontSize: 12 }}>{r.t}
            <div style={{ fontSize: 10.5, color: r.ok === "ok" ? "#86efac" : "#fbbf24", fontWeight: 500, lineHeight: 1.5, marginTop: 2 }}>{r.d}</div>
          </div>
        </div>
      ))}
      <div className="v6-lbl">CHECKLIST AMAN UPLOAD</div>
      {["Gunakan musik dari Musik AI / instrumen bebas royalti", "Narasi = teks kamu sendiri atau TTS VERVE", "Visual = foto sendiri atau Gambar AI", "Hindari lagu artis & cuplikan film/orang lain"].map(c => (
        <div key={c} style={{ fontSize: 11.5, padding: "5px 2px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>✅ {c}</div>
      ))}
      <div className="v6-note">Catatan jujur bro: VERVE tidak memiliki database fingerprint seperti YouTube Content ID. Panel ini <b>panduan status berdasar SUMBER audio</b> yang kamu pakai — keputusan akhir tetap di sistem platform tujuan.</div>
    </MiniModal>
  );
}
