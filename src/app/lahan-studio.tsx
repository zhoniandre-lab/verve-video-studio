"use client";

/**
 * LAHAN AWALAN v2 — mesin produksi AI VERVE (niche: Cerita Jadi Lagu).
 * Alur: Niat → Sudut → Riset → Judul → Visual (prompt engine) → Cerita → Adegan.
 *
 * Otak: VERVE Brain (src/lib/brain/*) — skor dari HITUNGAN NYATA, bukan ngarang.
 * "Script di dalam script": kartu karakter + gaya visual disuntik ke prompt
 * naskah, storyboard, DAN tiap prompt gambar adegan — biar visual konsisten WAW.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeAngle, buildCandidates, scoreTitleV2, uniq,
  type Angle, type ScoredTitle, type BrainMemory, type AnalyzedVideo,
} from "@/lib/brain/yie-score";
import {
  detectAudienceIntent, audienceCard, dominantEmotion, watchActivity,
  solutionFor, monetizationHint, deviceAdvice, DATA_GAPS,
} from "@/lib/brain/audience";
import { getAudioPeaks } from "@/lib/waveform";

const LAHAN_KEY = "verve_lahan_v1";
const BRAIN_KEY = "verve_brain_v1";

/* ---------- util ---------- */
function fmtNum(n: number): string {
  n = +n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "Jt";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "rb";
  return String(Math.round(n));
}
function scoreTone(s: number): string {
  return s >= 70 ? "ok" : s >= 45 ? "warn" : "err";
}
function loadBrain(): BrainMemory {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return { researches: [], results: [] };
    const j = JSON.parse(raw);
    return { researches: j.researches || [], results: j.results || [] };
  } catch {
    return { researches: [], results: [] };
  }
}
/** Kompres gambar ke 768×432 jpeg (cover 16:9) — hemat localStorage & siap jadi slide video. */
function shrinkImage(dataUrl: string, w = 768, h = 432, q = 0.78): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d");
      if (!cx) return resolve(dataUrl);
      const ir = img.width / img.height, tr = w / h;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; }
      else { sh = img.width / tr; sy = (img.height - sh) / 2; }
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      try { resolve(cv.toDataURL("image/jpeg", q)); } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    // v8.1: wajib crossOrigin untuk URL remote — tanpa ini toDataURL SELALU dilempar
    // (canvas tainted) sehingga gambar adegan tersimpan sebagai URL mentah yang bisa
    // kedaluwarsa / membuat render hitam. Kalau server tak kirim header CORS, kode
    // tetap jatuh ke URL asli lewat catch — dan recorder punya proxy cadangan.
    if (/^https?:/.test(dataUrl)) img.crossOrigin = "anonymous";
    img.src = dataUrl;
  });
}

/* ---------- tipe ---------- */
type CharCard = { nama: string; peran: string; usia: string; ciri: string; pakaian: string; suasana: string };

type Scene = {
  scene: number; scene_desc: string; lyric_line: string; visual_prompt: string; mood: string;
  status: "idle" | "loading" | "done" | "error";
  url?: string; err?: string;
};
type Board = { style_visual: string; color_grade: string; scenes: Scene[] };

type SongTask = { id: string; title: string; ts: number };
type SongResult = { url: string; title: string; duration?: number; image?: string };
type SunoKey = { key: string; provider: string };

const SUNO_KEYS_KEY = "verve_suno_keys_v1";
/** Link resmi buat ambil/generate API key — satu klik, kayak panel Kampung Music */
const PROVIDER_KEY_LINK: Record<string, { url: string; hint: string }> = {
  kie: { url: "https://kie.ai/api-key", hint: "Login kie.ai → menu API Key → Generate (kalau tautan 404, dari kie.ai pilih menu API Key)" },
  apiframe: { url: "https://apiframe.ai", hint: "Login apiframe.ai → dashboard → API Keys" },
  sunor: { url: "https://sunor.cc", hint: "Login sunor.cc → dashboard → API Key" },
  aimusic: { url: "", hint: "mode gratis — tanpa key (sering penuh)" },
};
function detectProvClient(k: string, fallback: string): string {
  const s = k.toLowerCase().trim();
  if (s.startsWith("kie") || s.startsWith("sk-kie")) return "kie";
  if (s.startsWith("afk_") || s.startsWith("af_")) return "apiframe";
  if (s.startsWith("snr_") || s.startsWith("sunor_")) return "sunor";
  if (/^[a-f0-9]{24,}$/i.test(k.trim())) return "kie";
  return fallback;
}
function maskKey(k: string): string {
  return k.length > 10 ? `${k.slice(0, 7)}…${k.slice(-3)}` : "••••";
}

const SUNO_PROVIDERS = [
  { id: "kie", label: "🥇 Kie.ai (utama — lancar dari Indo)" },
  { id: "apiframe", label: "apiframe.ai" },
  { id: "sunor", label: "Sunor.cc" },
  { id: "aimusic", label: "aimusic.so (gratis — sering penuh)" },
];
const GENRES = ["pop ballad Melayu sedih", "akustik mellow piano", "orkes melankolis", "pop religi lembut", "folk sendu"];
const MOODS = ["haru", "rindu", "sedih", "menyentuh", "tenang"];
/** Interval polling cerdas (detik): rapat di awal, makin jarang makin lama — total sabar ±6 mnt (putaran 2 s.d. 9 mnt) */
const POLL_DELTAS = [5, 8, 10, 12, 15, 15, 20, 20, 25, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];

type LahanState = {
  step: number; topic: string; angles: string[]; selKeyword: string;
  angle: Angle | null; researchAt: string; selTitle: string;
  naskah: string; board: Board | null;
  lyrics: string; lyricMode: "auto" | "manual"; mStyle: string;
  genre: string; mood: string; vocal: string;
  task: SongTask | null; song: SongResult | null;
  charLock?: string; modelPinned?: string; refUrl?: string; // 🔒 v10.0 SATU WAJAH
};

const DEFAULT_CHARS: CharCard[] = [
  {
    nama: "Ibu",
    peran: "tokoh utama",
    usia: "wanita 55-65 tahun, wajah lembut penuh kerinduan",
    ciri: "rambut beruban diikat rapi, mata berkaca-kaca, senyum hangat menahan sedih",
    pakaian: "daster batik cokelat sederhana",
    suasana: "rumah kayu sederhana, cahaya senja keemasan masuk lewat jendela",
  },
];

const GAYA_VISUAL = [
  "Sinematik realistis, cahaya warm golden hour, lensa 35mm, depth of field lembut, palet hangat, mood haru",
  "Ilustrasi cat air emosional, tekstur kertas, sapuan lembut, palet warm pastel",
  "Anime film sedih kualitas layar lebar, pencahayaan senja, palet warm, detail ekspresi halus",
  "3D animasi lembut, lighting golden hour, render halus kualitas film pendek",
];
/** kode style untuk mesin gambar hcnsec (IMAGE_STYLES ids) */
const GAYA_TO_STYLE = ["cinematic", "oil", "anime", "3d"];

const STEP_LABEL = ["Niat", "Sudut", "Riset", "Judul", "Visual", "Cerita", "Adegan", "Lagu", "Video"];

/** Perintah konsistensi yang disuntik ke prompt (untuk preview/salin di langkah Visual). */
function composeVisualPrompt(scene: string, chars: CharCard[], gaya: string): string {
  const charBlock = chars
    .filter((c) => c.nama.trim())
    .map((c) => `${c.nama} (${c.peran}): ${c.usia}; ${c.ciri}; pakaian ${c.pakaian}; latar khas ${c.suasana}`)
    .join(" || ");
  return (
    `GAYA VISUAL WAJIB: ${gaya}. ` +
    `KARAKTER WAJIB (jangan diganti/ditambah): ${charBlock || "belum diisi"}. ` +
    `ADEGAN: ${scene}. ` +
    `ATURAN KERAS: wajah, ciri, dan pakaian karakter HARUS identik di semua adegan; ` +
    `ekspresi mengikuti emosi naskah (haru, rindu, penyesalan); tanpa teks, tanpa watermark; ` +
    `rasio 16:9; kualitas layak tonton.`
  );
}
/** Versi Inggris-kompak yang disuntik ke prompt gambar mesin (konsistensi karakter). */
function injectCharacter(sceneVisual: string, chars: CharCard[], gaya: string): string {
  const block = chars
    .filter((c) => c.nama.trim())
    .map((c) => `${c.nama} (${c.peran}): ${c.usia}; ${c.ciri}; always wearing ${c.pakaian}; signature setting ${c.suasana}`)
    .join(" | ");
  return (
    `the exact same main character in every single scene (${block}), ` +
    `${sceneVisual}, story emotion: haru, rindu, penyesalan, ` +
    `consistent art direction: ${gaya}`
  );
}

export default function LahanStudio({ onExit, gotoEditor }: { onExit: () => void; gotoEditor?: (id?: string, cmd?: { tool?: string; newProject?: number; applyAdjust?: number }) => void }) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [angles, setAngles] = useState<string[]>([]);
  const [selKeyword, setSelKeyword] = useState("");
  const [angle, setAngle] = useState<Angle | null>(null);
  const [researchAt, setResearchAt] = useState("");
  const [selTitle, setSelTitle] = useState("");
  const [naskah, setNaskah] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [genAllBusy, setGenAllBusy] = useState(false);
  const [busy, setBusy] = useState<"" | "suggest" | "research" | "cerita" | "board" | "lyrics" | "song" | "charlock">("");
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);
  /* ---- SUNO ---- */
  const [lyrics, setLyrics] = useState("");
  const [lyricMode, setLyricMode] = useState<"auto" | "manual">("auto");
  const [mStyle, setMStyle] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [vocal, setVocal] = useState<"auto" | "male" | "female" | "instrumental">("auto");
  const [sunoKey, setSunoKey] = useState("");
  const [sunoProv, setSunoProv] = useState("kie");
  const [task, setTask] = useState<SongTask | null>(null);
  const [song, setSong] = useState<SongResult | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollUi, setPollUi] = useState<{ attempt: number; elapsed: number; last: string }>({ attempt: 0, elapsed: 0, last: "antre" });
  const pollStop = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* ---- pool multi-key (satu per baris) + rotasi otomatis ---- */
  const [keyPool, setKeyPool] = useState<SunoKey[]>([]);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyPanel, setKeyPanel] = useState(false);
  const [creditInfo, setCreditInfo] = useState<Record<string, string>>({});
  const [checkingCredit, setCheckingCredit] = useState(false);
  /* ---- GABUNG & PREVIEW (langkah 9) ---- */
  const pvAudioRef = useRef<HTMLAudioElement | null>(null);
  const [pvPlaying, setPvPlaying] = useState(false);
  const [pvT, setPvT] = useState(0);
  const launchKeyRef = useRef("");
  const [toast, setToast] = useState("");
  const [chars, setChars] = useState<CharCard[]>(DEFAULT_CHARS);
  const [charLock, setCharLock] = useState(""); // 🔒 v10.0: kalimat identitas BEKU (Inggris) — disuntik kata-per-kata SAMA ke tiap gambar
  const [modelPinned, setModelPinned] = useState(""); // 🔒 v10.0: model pertama yang BERHASIL di-pin → semua adegan semodel
  const [refUrl, setRefUrl] = useState(""); // 🔒 v10.0: gambar adegan pertama = kandidat acuan wajah (percobaan, fallback aman)
  const ensureLockCacheRef = useRef<string>(""); // 🔒 v10.0: cache lock milik sesi menggambar berjalan
  const [gaya, setGaya] = useState(0);
  const [expanded, setExpanded] = useState<string>("");
  const brain = useMemo(loadBrain, []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 2400);
  }

  /* ---------- restore & persist ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAHAN_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as LahanState;
      setStep(j.step || 1);
      setTopic(j.topic || "");
      setAngles(j.angles || []);
      setSelKeyword(j.selKeyword || "");
      setAngle(j.angle || null);
      setResearchAt(j.researchAt || "");
      setSelTitle(j.selTitle || "");
      setNaskah(j.naskah || "");
      setBoard(j.board || null);
      setLyrics(j.lyrics || "");
      setLyricMode(j.lyricMode === "manual" ? "manual" : "auto");
      setMStyle(j.mStyle || "");
      setGenre(j.genre && GENRES.includes(j.genre) ? j.genre : GENRES[0]);
      setMood(j.mood && MOODS.includes(j.mood) ? j.mood : MOODS[0]);
      setVocal((["auto", "male", "female", "instrumental"] as const).includes(j.vocal as never) ? (j.vocal as never) : "auto");
      setTask(j.task || null);
      setSong(j.song || null);
      setCharLock(j.charLock || ""); // 🔒 v10.0
      setModelPinned(j.modelPinned || "");
      setRefUrl(j.refUrl || "");
    } catch { /* draf korup → mulai bersih */ }
    try {
      setSunoKey(localStorage.getItem("verve_suno_key") || "");
      setSunoProv(localStorage.getItem("verve_suno_provider") || "kie");
      const rawKeys = localStorage.getItem(SUNO_KEYS_KEY);
      if (rawKeys) setKeyPool(JSON.parse(rawKeys));
    } catch { /* abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const save = (withImages: boolean) => {
      let slimAngle: Angle | null = angle;
      if (angle) {
        slimAngle = {
          ...angle,
          videos: angle.videos.slice(0, 30),
          qualified: angle.qualified.slice(0, 30),
          rejected: angle.rejected.slice(0, 10),
          rawVideos: angle.rawVideos.slice(0, 30),
        };
      }
      let slimBoard: Board | null = board;
      if (board && !withImages) {
        slimBoard = { ...board, scenes: board.scenes.map((s) => ({ ...s, url: undefined, status: s.status === "done" ? "idle" : s.status })) };
      }
      const payload: LahanState = { step, topic, angles: angles.slice(0, 40), selKeyword, angle: slimAngle, researchAt, selTitle, naskah, board: slimBoard, lyrics, lyricMode, mStyle, genre, mood, vocal, task, song, charLock, modelPinned, refUrl };
      localStorage.setItem(LAHAN_KEY, JSON.stringify(payload));
    };
    try {
      save(true);
    } catch {
      try { save(false); } catch { /* storage penuh total — sesi jalan terus */ }
    }
  }, [step, topic, angles, selKeyword, angle, researchAt, selTitle, naskah, board, lyrics, lyricMode, mStyle, genre, mood, vocal, task, song]);

  /* bersihkan timer saat keluar layar — task tetap tersimpan di draf (bisa dipantau ulang) */
  useEffect(() => () => {
    pollStop.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (pvAudioRef.current) pvAudioRef.current.pause();
  }, []);

  /* ticker pratinjau gabungan */
  useEffect(() => {
    if (!pvPlaying) return;
    const it = setInterval(() => {
      const a = pvAudioRef.current;
      if (a) setPvT(a.currentTime);
    }, 200);
    return () => clearInterval(it);
  }, [pvPlaying]);

  /* ticker detik berjalan selama polling */
  useEffect(() => {
    if (!polling || !task) return;
    const it = setInterval(() => setPollUi((p) => ({ ...p, elapsed: Math.round((Date.now() - task.ts) / 1000) })), 1000);
    return () => clearInterval(it);
  }, [polling, task]);

  /* ---------- intent audiens (niche terkunci story_song) ---------- */
  const intentId = topic.trim() ? detectAudienceIntent(topic + " cerita jadi lagu") : "story_song";
  const intentEff = intentId === "general" ? "story_song" : intentId;
  const card = audienceCard(intentEff);

  /* ---------- kandidat judul + skor ---------- */
  const scored: ScoredTitle[] = useMemo(() => {
    if (!angle) return [];
    const compTitles = angle.qualified.slice(0, 6).map((v) => v.title || "").filter(Boolean);
    const cands = uniq([...buildCandidates(angle), ...compTitles]).slice(0, 24);
    const used = brain.results.map((r) => r.title);
    return cands.map((t) => scoreTitleV2(t, angle, brain, used)).sort((a, b) => b.score - a.score);
  }, [angle, brain]);

  const verdict = angle ? (angle.score >= 70 ? { t: "GAS 🔥", c: "ok", d: "Sudut ini layak ditanam. Lanjut tanam cerita!" } : angle.score >= 45 ? { t: "PERTIMBANGKAN 🧐", c: "warn", d: "Bisa jalan, tapi pakai judul yang benar-benar beda dari kompetitor." } : { t: "TAHAN DULU ✋", c: "err", d: "Sinyal pasar lemah/terlalu padat. Coba sudut lain (long-tail)." }) : null;

  const naskahLines = useMemo(() => naskah.split("\n").map((l) => l.trim()).filter(Boolean), [naskah]);
  const estDurSec = useMemo(() => Math.round(naskah.split(/\s+/).filter(Boolean).length / 2.6), [naskah]);
  const boardDone = board ? board.scenes.filter((s) => s.status === "done").length : 0;
  /* ---- garis waktu gabungan (pembagian rata mengikuti durasi lagu) ---- */
  const doneScenes = useMemo(() => (board ? board.scenes.filter((s) => s.status === "done" && !!s.url) : []), [board]);
  const totalDur = song?.duration && song.duration > 0 ? Math.round(song.duration) : Math.max(1, doneScenes.length) * 6;
  const perScene = totalDur / Math.max(1, doneScenes.length);
  const pvIdx = Math.max(0, Math.min(doneScenes.length - 1, Math.floor(pvT / perScene)));

  /* ---------- aksi: sudut & riset ---------- */
  async function fetchSuggest() {
    if (topic.trim().length < 3) { setErr({ code: "topik", msg: "Tulis niat/topik dulu minimal 3 huruf ya bro." }); return; }
    setErr(null);
    setBusy("suggest");
    try {
      const r = await fetch(`/api/yt-suggest?q=${encodeURIComponent(topic.trim())}&hl=id&gl=ID&limit=30`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || `HTTP ${r.status}`);
      const list: string[] = Array.isArray(j.suggestions) ? j.suggestions : [];
      const extra = /cerita jadi lagu/i.test(topic) ? [] : [`${topic.trim()} | cerita jadi lagu`];
      setAngles(uniq([topic.trim(), ...extra, ...list]).slice(0, 30));
      flash("🔍 Sudut ketemu dari YouTube autocomplete");
    } catch (e) {
      setErr({ code: "suggest", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  async function runResearch() {
    if (!selKeyword) { setErr({ code: "sudut", msg: "Pilih satu sudut/keyword dulu bro." }); return; }
    setErr(null);
    setBusy("research");
    try {
      const r = await fetch(`/api/yt-research?q=${encodeURIComponent(selKeyword)}&region=ID&lang=id&max=25&order=relevance`);
      const j = await r.json();
      if (!r.ok) {
        const hint = j.hint ? ` ${j.hint}` : "";
        throw Object.assign(new Error((j.message || j.error || `HTTP ${r.status}`) + hint), { code: j.error || "upstream" });
      }
      const a = analyzeAngle(selKeyword, { videos: j.videos || [] }, {
        seed: topic.trim(),
        nicheNote: "cerita jadi lagu",
        suggest: angles,
      });
      setAngle(a);
      setResearchAt(j.fetchedAt || new Date().toISOString());
      setSelTitle("");
      flash(`📊 ${a.total} kompetitor relevan dihitung (dibuang ${a.rejected.length})`);
    } catch (e) {
      const er = e as Error & { code?: string };
      setErr({ code: er.code || "research", msg: er.message });
    } finally {
      setBusy("");
    }
  }

  function lockTitle(t: string) {
    setSelTitle(t);
    setStep(5);
    flash("★ Judul dikunci — siap dirancang visualnya");
  }

  function resetLahan() {
    if (!confirm("Mulai lahan baru? Draf riset, naskah & adegan sekarang dihapus.")) return;
    setStep(1); setTopic(""); setAngles([]); setSelKeyword(""); setAngle(null);
    setResearchAt(""); setSelTitle(""); setNaskah(""); setBoard(null);
    setLyrics(""); setLyricMode("auto"); setMStyle(""); setTask(null); setSong(null); setPeaks(null);
    cancelPolling();
    try { localStorage.removeItem(LAHAN_KEY); } catch { /* abaikan */ }
  }

  /* ---------- aksi: cerita ---------- */
  async function writeNaskah() {
    if (!selTitle) return;
    setErr(null);
    setBusy("cerita");
    try {
      const r = await fetch("/api/hcnsec/cerita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selTitle,
          keyword: selKeyword,
          niche: "Cerita jadi lagu / lagu emosional",
          chars: chars.filter((c) => c.nama.trim()).map((c) => ({ nama: c.nama, peran: c.peran, usia: c.usia, ciri: c.ciri })),
          audience: { emotion: dominantEmotion(intentEff), fears: card.fears, desires: card.desires, cta: card.ctas[0] },
          lines: Math.max(6, Math.min(10, angle ? 6 + Math.floor(angle.total / 8) : 8)),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setNaskah((j.lines as string[]).join("\n"));
      setBoard(null);
      flash("📝 Naskah jadi — baca, edit sesukamu, lalu susun adegan");
    } catch (e) {
      setErr({ code: "cerita", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  /* ---------- aksi: storyboard & gambar ---------- */
  async function buildBoard() {
    if (!selTitle) return;
    setErr(null);
    setBusy("board");
    try {
      const sceneCount = Math.max(4, Math.min(10, naskahLines.length || 6));
      const charLine = chars.filter((c) => c.nama.trim()).map((c) => `${c.nama} (${c.usia})`).join(", ");
      const r = await fetch("/api/hcnsec/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selTitle,
          keyword: `${selKeyword} | karakter wajib konsisten: ${charLine || "sesuai judul"} | arah gaya: ${GAYA_VISUAL[gaya]}`,
          niche: "Cerita jadi lagu / lagu emosional",
          slides: sceneCount,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const scenes: Scene[] = (j.scenes || []).map((s: { scene: number; scene_desc?: string; lyric_line?: string; visual_prompt?: string; mood?: string }) => ({
        scene: s.scene,
        scene_desc: s.scene_desc || "",
        lyric_line: s.lyric_line || "",
        visual_prompt: s.visual_prompt || "",
        mood: s.mood || "haru",
        status: "idle",
      }));
      if (!scenes.length) throw new Error("Adegan kosong dari AI, coba lagi.");
      setBoard({ style_visual: j.style_visual || "cinematic", color_grade: j.color_grade || "#f59e0b", scenes });
      flash(`🎬 ${scenes.length} adegan tersusun — tinggal digambar`);
    } catch (e) {
      setErr({ code: "board", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  // 🔒 v10.0 SATU WAJAH — bekukan kartu karakter → SATU kalimat identitas Inggris, disuntik kata-per-kata SAMA ke tiap gambar
  async function ensureCharLock(force = false): Promise<string> {
    if (!force && charLock.trim().length > 10) return charLock.trim();
    setBusy("charlock");
    try {
      const r = await fetch("/api/hcnsec/charlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chars, gaya: GAYA_VISUAL[gaya] }),
      });
      const j = await r.json();
      if (r.ok && j.identity && String(j.identity).trim().length > 10) {
        const id = String(j.identity).trim();
        setCharLock(id);
        return id;
      }
      throw new Error(j.error || " bekukan gagal");
    } catch {
      // fallback lokal deterministik — tetap terkunci + token Indonesia pasti ada
      const named = chars.filter((c) => c.nama.trim());
      const c0 = named[0] || DEFAULT_CHARS[0];
      const id = `the exact same main character in every image, Indonesian, Southeast Asian facial features, warm tan skin (sawo matang), dark brown eyes, ${c0.nama} (${c0.peran}): ${c0.usia}, consistent face and hairstyle (${c0.ciri}), always wearing ${c0.pakaian}, recurring setting: ${c0.suasana}` +
        (named.length > 1 ? ` | supporting characters: ${named.slice(1).map((c) => `${c.nama} (${c.usia}, ${c.ciri}, wearing ${c.pakaian})`).join(" | ")}` : "");
      setCharLock(id);
      return id;
    } finally { setBusy(""); }
  }
  const ensureLockCache = ensureLockCacheRef; // alias lama dipertahankan
  // seed stabil dari judul → kalau gateway muafakat, semua adegan lahir dari benih yang sama
  function stableSeed(s2: string): number { let h = 5381; for (let k = 0; k < s2.length; k++) h = (((h << 5) + h) + s2.charCodeAt(k)) >>> 0; return 1000000 + (h % 9000000); }

  async function genScene(i: number, sc: Scene) {
    setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, status: "loading", err: undefined } : s)) }));
    try {
      ensureLockCache.current = await ensureCharLock(); // 🔒 v10.0: bekukan dulu — sumber tunggal kebenaran wajah
      const r = await fetch("/api/hcnsec/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _storyScene: {
            // lock aktif → adegan MURNI (identitas HANYA dari _charLock, tanpa dobel injeksi); lock gagal → jalan lama
            visual_prompt: ensureLockCache.current || charLock ? sc.visual_prompt : injectCharacter(sc.visual_prompt, chars, GAYA_VISUAL[gaya]),
            scene_desc: sc.scene_desc,
            mood: sc.mood,
          },
          _charLock: ensureLockCache.current || charLock || undefined,
          _seed: stableSeed(selTitle || "verve"),
          _modelFirst: modelPinned || undefined,
          _ref: refUrl || undefined,
          _mood: sc.mood,
          style: GAYA_TO_STYLE[gaya] || "cinematic",
          title: selTitle,
          keyword: selKeyword,
          niche: "cerita jadi lagu",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!modelPinned && j.model) setModelPinned(String(j.model)); // 🔒 v10.0: pin model yang BERHASIL
      if (!refUrl && j.originalUrl) setRefUrl(j.originalUrl); // 🔒 v10.0: gambar pertama = kandidat acuan wajah
      const url = await shrinkImage(j.url);
      setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "done", url } : s)) }));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "error", err: msg } : s)) }));
      return false;
    }
  }

  async function genAllScenes() {
    if (!board || genAllBusy) return;
    setGenAllBusy(true);
    let ok = 0;
    for (let i = 0; i < board.scenes.length; i++) {
      const sc = board.scenes[i];
      if (sc.status === "done") { ok++; continue; }
      const good = await genScene(i, sc);
      if (good) ok++;
      await new Promise((r) => setTimeout(r, 500));
    }
    setGenAllBusy(false);
    flash(ok === board.scenes.length ? `✅ ${ok}/${board.scenes.length} adegan siap!` : `⚠️ ${ok}/${board.scenes.length} jadi — ulangi yang gagal`);
  }

  function updateScene(i: number, patch: Partial<Scene>) {
    setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }

  /* ================= SUNO (dengan pengerasan anti-macet) ================= */
  function sunoHeaders(keyOverride?: string): Record<string, string> {
    const k = (keyOverride ?? (launchKeyRef.current || keysForProvider()[0]?.key || "")).trim();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (k) { h["X-Suno-Key"] = k; h["X-Suno-Provider"] = sunoProv; }
    return h;
  }

  /* ---- pool multi-key (model Kampung Music: satu kunci per baris + rotasi otomatis) ---- */
  function savePool(next: SunoKey[]) {
    setKeyPool(next);
    try { localStorage.setItem(SUNO_KEYS_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }
  function keysForProvider(): SunoKey[] {
    const pooled = keyPool.filter((k) => k.provider === sunoProv);
    if (pooled.length) return pooled;
    if (sunoKey.trim()) return [{ key: sunoKey.trim(), provider: sunoProv }];
    return [];
  }
  function addKeysFromDraft() {
    const lines = keyDraft.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const next = [...keyPool];
    let added = 0;
    lines.forEach((k) => {
      if (next.some((x) => x.key === k)) return;
      next.push({ key: k, provider: detectProvClient(k, sunoProv) });
      added++;
    });
    savePool(next);
    setKeyDraft("");
    const first = next.filter((x) => x.provider === sunoProv)[0];
    if (first) {
      setSunoKey(first.key);
      try { localStorage.setItem("verve_suno_key", first.key); } catch { /* abaikan */ }
    }
    flash(added ? `🔑 ${added} kunci ditambah` : "Semua kunci sudah ada di daftar");
  }
  function removeKey(key: string) { savePool(keyPool.filter((k) => k.key !== key)); }
  function clearKeysCurrentProv() {
    savePool(keyPool.filter((k) => k.provider !== sunoProv));
    setCreditInfo({});
    flash("🗑 Kunci provider ini dihapus semua");
  }

  async function cekKredit() {
    const keys = keysForProvider().map((k) => k.key);
    if (!keys.length) { setErr({ code: "key", msg: "Belum ada kunci tersimpan — tambah dulu lewat kolom atas." }); return; }
    setCheckingCredit(true);
    setErr(null);
    try {
      const r = await fetch("/api/hcnsec/music-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: sunoProv, keys }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const map: Record<string, string> = {};
      (j.results || []).forEach((res: { key: string; status: string; credit?: number; msg?: string }) => {
        map[res.key] = res.status === "ok" ? `💳 ${res.credit}` : (res.msg || "tidak terekspos");
      });
      setCreditInfo(map);
      flash("💳 Cek kredit selesai — angka cuma tampil kalau provider memang mengekspos");
    } catch (e) {
      setErr({ code: "credit", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setCheckingCredit(false);
    }
  }
  function fmtClock(sec: number): string {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function manualLyrics() {
    setLyricMode("manual");
    if (!lyrics.trim()) {
      const fromBoard = (board?.scenes || []).map((s) => s.lyric_line).filter(Boolean).join("\n");
      if (fromBoard) setLyrics(fromBoard);
    }
  }

  async function genLyrics() {
    if (!selTitle) return;
    setErr(null);
    setBusy("lyrics");
    try {
      const r = await fetch("/api/hcnsec/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: selTitle, keyword: selKeyword, niche: "Cerita jadi lagu / lagu emosional", genre, mood }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLyrics(j.lyrics || "");
      if (j.style_prompt_suno) setMStyle(j.style_prompt_suno);
      setLyricMode("auto");
      flash("✨ Lirik jadi — cek & poles sesukamu");
    } catch (e) {
      setErr({ code: "lyrics", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  function clearPollTimer() {
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
  }

  async function checkOnce(id: string): Promise<"done" | "pending"> {
    const r = await fetch(`/api/hcnsec/music?id=${encodeURIComponent(id)}`, { headers: sunoHeaders(), cache: "no-store" });
    const pd = await r.json().catch(() => ({}));
    const url = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
    if (url) {
      finishSong({ url, title: pd.title || selTitle || "Lagu AI", duration: pd.duration, image: pd.image_url });
      return "done";
    }
    if (pd.status === "error" || pd.error) throw new Error(pd.error || "Provider gagal generate");
    return "pending";
  }

  function finishSong(res: SongResult) {
    pollStop.current = true;
    clearPollTimer();
    setPolling(false);
    setTask(null);
    setSong(res);
    flash("✅ Lagu jadi! Auto-terpasang di lahan");
    void getAudioPeaks(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(res.url)}`, 96)
      .then((p) => setPeaks(p && p.length ? p : null))
      .catch(() => setPeaks(null));
  }

  function startPolling(t: SongTask, round = 1) {
    clearPollTimer();
    pollStop.current = false;
    setPolling(true);
    setErr(null);
    setPollUi({ attempt: 0, elapsed: Math.round((Date.now() - t.ts) / 1000), last: "antre" });
    let idx = 0;
    const limitMs = round === 1 ? 6 * 60 * 1000 : 9 * 60 * 1000; // sabar 6 mnt, auto-lanjut s.d. 9 mnt
    const tick = async () => {
      if (pollStop.current) return;
      try {
        const st = await checkOnce(t.id);
        if (st === "done") return;
      } catch (e) {
        setPolling(false);
        setErr({ code: "suno", msg: e instanceof Error ? e.message : String(e) });
        return;
      }
      idx++;
      const elapsed = Date.now() - t.ts;
      setPollUi({ attempt: idx, elapsed: Math.round(elapsed / 1000), last: "pending" });
      if (elapsed > limitMs) {
        if (round === 1) {
          // AUTO-LANJUT putaran 2 (cuma polling — tidak membakar kredit generate baru)
          setPollUi({ attempt: idx, elapsed: Math.round(elapsed / 1000), last: "auto-lanjut putaran 2" });
          pollTimer.current = setTimeout(() => { if (!pollStop.current) startPolling(t, 2); }, 20000);
          return;
        }
        setPolling(false);
        setErr({ code: "suno_sibuk", msg: "Provider masih sibuk >9 menit. Task tersimpan aman — lagu sering jadi di belakang; tap 🔍 Cek manual sebentar lagi." });
        return;
      }
      pollTimer.current = setTimeout(tick, POLL_DELTAS[Math.min(idx, POLL_DELTAS.length - 1)] * 1000);
    };
    pollTimer.current = setTimeout(tick, POLL_DELTAS[0] * 1000);
  }

  function cancelPolling() {
    pollStop.current = true;
    clearPollTimer();
    setPolling(false);
  }

  async function launchSong() {
    if (!selTitle) return;
    const instrumental = vocal === "instrumental";
    const lyr = lyrics.trim();
    if (!instrumental && lyr.length < 30) {
      setErr({ code: "suno", msg: "Lirik masih terlalu pendek (min 30 karakter) — generate lirik AI dulu atau pilih 🎼 Instrumental." });
      return;
    }
    const keys = keysForProvider();
    if (sunoProv !== "aimusic" && !keys.length) {
      setKeyPanel(true);
      setErr({ code: "need_key", msg: "Belum ada API key. Di panel 🔑 Setelan API Key di atas: tap link provider untuk ambil key → tempel satu per baris → Tambah." });
      return;
    }
    setErr(null);
    setBusy("song");
    const styleStr = (mStyle.trim() || [genre, mood, "indonesian, emotional, high quality"].join(", ")).slice(0, 480);
    const payload = {
      title: selTitle.slice(0, 80),
      prompt: styleStr,
      lyrics: instrumental ? undefined : lyr,
      genre, tags: styleStr,
      custom: lyr.length > 30, instrumental,
      vocalGender: instrumental ? undefined : vocal === "auto" ? undefined : vocal,
      _raw_title: selTitle.slice(0, 80), _raw_lyrics: lyr, _raw_style: styleStr,
    };
    // ROTASI OTOMATIS: kunci habis/ditolak → langsung pindah kunci berikutnya
    const tries = Math.max(1, keys.length);
    let lastErr: (Error & { code?: string }) | null = null;
    for (let ki = 0; ki < tries; ki++) {
      try {
        await launchWithKey(payload, keys[ki]?.key || "", ki, tries);
        setBusy("");
        return;
      } catch (e) {
        const er = e as Error & { code?: string };
        lastErr = er;
        const keyProblem = er.code === "quota_error" || er.code === "auth_error" || er.code === "need_key" || /401|402|kredit|habis|invalid/i.test(er.message);
        if (keyProblem && ki < tries - 1) { flash(`🔑 Kunci ${ki + 1} ditolak — pindah kunci ${ki + 2}/${tries}…`); continue; }
        break;
      }
    }
    setBusy("");
    if (tries > 1 && lastErr && (lastErr.code === "quota_error" || lastErr.code === "auth_error")) {
      setErr({ code: "quota", msg: `Semua ${tries} kunci ditolak/habis. Terakhir: ${lastErr.message}. Tambah kunci baru lewat 🔑 Setelan API Key (ada link ambil key-nya).` });
    } else if (lastErr && lastErr.code === "need_key") {
      setKeyPanel(true);
      setErr({ code: "need_key", msg: lastErr.message });
    } else if (lastErr && lastErr.code === "quota_error") {
      setKeyPanel(true);
      setErr({ code: "quota", msg: lastErr.message });
    } else {
      setErr({ code: "suno", msg: lastErr ? lastErr.message : "Gagal generate lagu" });
    }
  }

  async function launchWithKey(payload: Record<string, unknown>, key: string, ki: number, total: number) {
    // auto-retry SEKALI kalau server provider 5xx / jaringan putus (bukan salah key/kredit)
    let r: Response | null = null;
    let j: Record<string, string> = {};
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        r = await fetch("/api/hcnsec/music", { method: "POST", headers: sunoHeaders(key), body: JSON.stringify(payload) });
        j = await r.json().catch(() => ({}));
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      if (r.ok || r.status === 401 || r.status === 402) break;
      if (attempt < 2) await new Promise((res) => setTimeout(res, 3000));
    }
    if (!r || !r.ok || j.error) throw Object.assign(new Error(j.error || `HTTP ${r ? r.status : "?"}`), { code: j.status });
    const dur = Number(j.duration);
    if (j.audio_url) { // provider langsung kasih audio tanpa polling
      finishSong({ url: j.audio_url, title: j.title || selTitle, duration: isFinite(dur) && dur > 0 ? dur : undefined, image: j.image_url });
      return;
    }
    const id = j.id || j.taskId || j.task_id;
    if (!id) throw new Error("Server tidak kasih taskId — coba lagi.");
    launchKeyRef.current = key;
    const t: SongTask = { id, title: selTitle, ts: Date.now() };
    setSong(null);
    setPeaks(null);
    setTask(t);
    flash(total > 1
      ? `⏳ Lagu diolah pakai kunci ${ki + 1}/${total} — polling sabar jalan`
      : "⏳ Lagu diolah — polling sabar jalan (sering jadi menit 2–5)");
    startPolling(t);
  }

  /* ================= GABUNG OTOMATIS → STUDIO EDIT ================= */
  function togglePreview() {
    const a = pvAudioRef.current;
    if (!a) return;
    if (pvPlaying) {
      a.pause();
      setPvPlaying(false);
    } else {
      setPvT(a.currentTime || 0);
      void a.play().then(() => setPvPlaying(true)).catch(() => setPvPlaying(false));
    }
  }
  function seekPreview(i: number) {
    const t = i * perScene + 0.01;
    const a = pvAudioRef.current;
    if (a) a.currentTime = t;
    setPvT(t);
  }

  function uidL(p = "lh"): string {
    return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Bangun draf studio PENUH: gambar→Track 1, lagu→jalur musik, lirik→lapisan teks per klip. */
  function masukStudio() {
    if (!board || !song) return;
    if (!doneScenes.length) {
      setErr({ code: "merge", msg: "Belum ada adegan bergambar — kembali ke langkah Adegan dulu bro." });
      return;
    }
    const per = Math.round((totalDur / doneScenes.length) * 100) / 100;
    const builtSlides = doneScenes.map((sc) => ({ id: uidL("c"), imageUrl: sc.url as string }));
    const slideOptsById: Record<string, unknown> = {};
    builtSlides.forEach((sl, i) => {
      const sc = doneScenes[i];
      const cap = (sc.lyric_line || sc.scene_desc || "").trim().slice(0, 80);
      slideOptsById[sl.id] = {
        dur: per,
        trans: "dissolve",
          texts: cap
          ? [{
              id: uidL("t"), txt: cap, font: "sistem", size: 0.062, color: "#ffffff",
              bold: true, italic: false, shadow: true, stroke: true, strokeColor: "#000000", strokeW: 5,
              bg: true, bgColor: "rgba(0,0,0,0.45)", y: 0.84, align: "center", anim: "none",
              lahanPill: true, // v8.2.1: penanda caption bawaan adegan (untuk tombol 🧹 di Keterangan otomatis)
            } as any]
          : [],
      };
    });
    const draft = {
      v: 6, id: uidL("d"), title: selTitle.slice(0, 80), updatedAt: Date.now(),
      slides: builtSlides, slideOptsById,
      ratio: "16:9", slideDuration: per, transition: "dissolve", transitionDur: 0.6,
      bgMode: "cover", bgColor: "#000000",
      musicUrl: song.url, musicName: (song.title || selTitle).slice(0, 60),
      musicDur: Math.round((song.duration || 0) * 100) / 100 || 0,
      musicOff: 0, musicVol: 1, musicFadeIn: 0, musicFadeOut: 0,
      ttsUrl: "", ttsText: "", voiceUrl: "", ttsDur: 0, voiceDur: 0, ttsOff: 0, voiceOff: 0, voiceVol: 1,
      filterPreset: "none", qualitySharp: false, audMuted: false,
      capWords: [], capStyle: "capcut", ccTpl: "standar", ccSize: 0.055, ccY: 0.78,
      niche: "cerita jadi lagu",
      coverThumb: (builtSlides[0]?.imageUrl || "").slice(0, 40000),
      adj: { b: 0, c: 6, s: 4, e: 0, tem: 4, hue: 0, fade: 0, vig: 12, grain: 0 },
      mTitle: selTitle, mLyrics: lyrics, mStyle, mGenre: genre, mMood: mood,
      mModel: "suno-v5", mVocal: vocal === "instrumental" ? "instrumental" : "vocal",
    };
    try {
      const arr = JSON.parse(localStorage.getItem("verve_drafts_v1") || "[]");
      arr.unshift(draft);
      while (arr.length > 12) arr.pop();
      localStorage.setItem("verve_drafts_v1", JSON.stringify(arr));
      if (pvAudioRef.current) { pvAudioRef.current.pause(); setPvPlaying(false); }
      flash("🎬 Proyek gabungan terkirim ke Studio!");
      if (gotoEditor) gotoEditor(draft.id);
      else flash("📁 Draf tersimpan — buka dari tab Proyek");
    } catch (e) {
      setErr({ code: "merge", msg: "Gagal simpan draf gabungan (storage penuh? hapus draf lama): " + (e instanceof Error ? e.message : String(e)) });
    }
  }

  const canGo = (k: number): boolean =>
    k === 1 ||
    (k === 2 && topic.trim().length >= 3) ||
    (k === 3 && !!selKeyword) ||
    (k === 4 && !!angle) ||
    (k === 5 && !!selTitle) ||
    (k === 6 && !!selTitle) ||
    (k === 7 && naskah.trim().length >= 10) ||
    (k === 8 && naskah.trim().length >= 10) ||
    (k === 9 && doneScenes.length > 0 && !!song);

  /* ================= RENDER ================= */
  return (
    <div className="lh-wrap">
      <div className="lh-top">
        <button className="lh-back" onClick={onExit}>‹</button>
        <div className="lh-top-t">
          <b>🌱 Lahan Awalan</b>
          <span>Cerita Jadi Lagu · wizard produksi AI</span>
        </div>
        <button className="lh-reset" title="Lahan baru" onClick={resetLahan}>↺</button>
      </div>

      <div className="lh-steps">
        {STEP_LABEL.map((lb, i) => {
          const k = i + 1;
          const on = step === k;
          const done = k < step && canGo(k + 1);
          return (
            <button key={lb} className={`lh-dot ${on ? "on" : ""} ${done ? "done" : ""}`} disabled={!canGo(k)} onClick={() => setStep(k)}>
              <i>{done ? "✓" : k}</i>
              <span>{lb}</span>
            </button>
          );
        })}
      </div>

      {err && (
        <div className="lh-card lh-errcard">
          <b>⚠️ {err.code === "missing_api_key" ? "API key YouTube belum terpasang" : err.code === "quota_exceeded" ? "Kuota YouTube API habis hari ini" : "Ada kendala"}</b>
          <p>{err.msg}</p>
          {err.code === "missing_api_key" && (
            <p className="lh-note">Cara pasang: Vercel → Project → Settings → Environment Variables → tambah <code>YOUTUBE_API_KEY</code> → Redeploy. Kunci didapat gratis dari Google Cloud Console (aktifkan YouTube Data API v3).</p>
          )}
        </div>
      )}

      {/* ============ LANGKAH 1: NIAT & TOPIK ============ */}
      {step === 1 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Apa niat ceritamu, bro? 🌱</div>
            <p className="lh-sub">Niche terkunci dulu: <b>🎵 Cerita Jadi Lagu</b> — biar fokus & dalam. Nanti merambah.</p>
            <textarea
              className="lh-ta"
              rows={3}
              placeholder='contoh: "ibu aku rindu" · "maaf ibu aku terlambat" · "ayah yang tak pernah kukenal"'
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div className="lh-chips">
              {["rindu ibu cerita jadi lagu", "maaf ibu aku terlambat", "lagu untuk ayah tersayang", "ibu engkau yang terbaik"].map((p) => (
                <button key={p} className="lh-chip" onClick={() => setTopic(p)}>{p}</button>
              ))}
            </div>
            <button className="lh-btn" disabled={topic.trim().length < 3 || busy === "suggest"} onClick={() => { void fetchSuggest().then(() => setStep(2)); }}>
              {busy === "suggest" ? "⏳ Nyari sudut..." : "Cari Sudut 🔍"}
            </button>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🎯 Kenali penontonmu dulu</div>
            <div className="lh-kv"><span>Niche</span><b>{card.label}</b></div>
            <div className="lh-kv"><span>Penonton</span><b>{card.audience}</b></div>
            <div className="lh-kv"><span>Usia · perangkat</span><b>{card.age} · {card.device}</b></div>
            <div className="lh-kv"><span>Emosi utama</span><b>{dominantEmotion(intentEff)}</b></div>
            <div className="lh-kv"><span>Nonton sambil</span><b>{watchActivity(intentEff)}</b></div>
            <div className="lh-kv"><span>Jam upload</span><b>{card.upload}</b></div>
            <div className="lh-kv"><span>Solusi konten</span><b>{solutionFor(intentEff)}</b></div>
            <div className="lh-kv"><span>Cuan ke depan</span><b>{monetizationHint(intentEff)}</b></div>
          </div>
        </>
      )}

      {/* ============ LANGKAH 2: SUDUT ============ */}
      {step === 2 && (
        <div className="lh-card">
          <div className="lh-h1">Pilih sudut pandang 🔍</div>
          <p className="lh-sub">Ini kata kunci asli yang orang ketik di YouTube (autocomplete), bukan tebakan. Pilih satu sebagai arah riset.</p>
          {!angles.length && (
            <button className="lh-btn" disabled={busy === "suggest"} onClick={fetchSuggest}>
              {busy === "suggest" ? "⏳ Nyari sudut..." : `Cari sudut untuk "${topic}" 🔍`}
            </button>
          )}
          <div className="lh-rows">
            {angles.map((a) => (
              <button key={a} className={`lh-row ${selKeyword === a ? "on" : ""}`} onClick={() => setSelKeyword(a)}>
                <span className="t">{a}</span>
                <span className="lh-badge">{a === topic.trim() ? "niat awal" : "youtube"}</span>
              </button>
            ))}
          </div>
          {!!angles.length && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "suggest"} onClick={fetchSuggest}>↻ Muat ulang</button>
              <button className="lh-btn" style={{ flex: 2 }} disabled={!selKeyword} onClick={() => setStep(3)}>Riset Sudut Ini 📊</button>
            </div>
          )}
        </div>
      )}

      {/* ============ LANGKAH 3: RISET ============ */}
      {step === 3 && (
        <>
          {!angle && (
            <div className="lh-card">
              <div className="lh-h1">Riset kompetitor 📊</div>
              <p className="lh-sub">Mesin mengambil video kompetitor untuk <b>"{selKeyword}"</b>, lalu menghitung demand, ruang lawan, kesegaran & pola judul. 1 riset ≈ 102 unit kuota (gratis 10.000/hari). Angka asli dari YouTube Data API — bukan karangan.</p>
              <button className="lh-btn" disabled={busy === "research"} onClick={runResearch}>
                {busy === "research" ? "⏳ Menghitung ladang..." : "Mulai Riset 📊"}
              </button>
            </div>
          )}

          {angle && verdict && (
            <>
              <div className={`lh-card lh-verdict ${verdict.c}`}>
                <div className="lh-vscore">{angle.score}</div>
                <div>
                  <b>{verdict.t}</b>
                  <p>{verdict.d}</p>
                  <p className="lh-note">Niche: {angle.niche.label} ({angle.niche.confidence}/100) · Format: {angle.format.label}</p>
                </div>
              </div>

              <div className="lh-kpis">
                <div className="lh-kpi"><span>Demand pasar</span><b className={scoreTone(angle.metrics.demand)}>{angle.metrics.demand}</b><i>{angle.metrics.demand >= 75 ? "TINGGI" : angle.metrics.demand >= 50 ? "SEDANG" : "RENDAH"}</i></div>
                <div className="lh-kpi"><span>Ruang lawan</span><b className={scoreTone(angle.metrics.low)}>{angle.metrics.low}</b><i>{angle.metrics.low >= 65 ? "LONGGAR" : angle.metrics.low >= 35 ? "SEDANG" : "PADAT"}</i></div>
                <div className="lh-kpi"><span>Bukti channel kecil</span><b className={scoreTone(angle.metrics.smallProof)}>{angle.metrics.smallProof}</b><i>views &gt; subs</i></div>
                <div className="lh-kpi"><span>Kesegaran</span><b className={scoreTone(angle.metrics.fresh)}>{angle.metrics.fresh}</b><i>video ≤120 hari</i></div>
                <div className="lh-kpi"><span>Celah pola</span><b className={scoreTone(angle.metrics.gap)}>{angle.metrics.gap}</b><i>ruang beda</i></div>
                <div className="lh-kpi"><span>Keyakinan data</span><b className={scoreTone(angle.metrics.confidence)}>{angle.metrics.confidence}</b><i>{angle.total} kompetitor</i></div>
              </div>

              <div className="lh-card">
                <div className="lh-h2">🧠 Kenapa skornya segitu</div>
                <ul className="lh-reasons">
                  {angle.reasons.map((r, i) => (
                    <li key={i} className={r.c}>{r.t}</li>
                  ))}
                </ul>
              </div>

              {!!angle.patterns.titlePatterns.length && (
                <div className="lh-card">
                  <div className="lh-h2">🧩 Pola judul kompetitor</div>
                  <div className="lh-chips">
                    {angle.patterns.titlePatterns.slice(0, 8).map((p) => (
                      <span key={p.id} className="lh-chip" title={p.examples.slice(0, 3).join("\n")}>{p.label} ×{p.count}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="lh-card">
                <div className="lh-h2">👀 Lawan terlaris (per hari)</div>
                <div className="lh-tbl">
                  {[...angle.qualified].sort((a, b) => b.vpd - a.vpd).slice(0, 10).map((v, i) => (
                    <a key={v.id || i} className="lh-trow" href={v.url} target="_blank" rel="noreferrer">
                      <span className="n">{i + 1}</span>
                      <span className="tt">{v.title}</span>
                      <span className="st">{fmtNum(v.views)} 👁<br />{fmtNum(v.vpd)}/hr · {fmtNum(v.subs)} subs</span>
                    </a>
                  ))}
                </div>
                <p className="lh-note">{DATA_GAPS.join(" ")}</p>
              </div>

              <div className="lh-card">
                <div className="lh-h2">🎯 Audiens & CTA</div>
                <div className="lh-kv"><span>Yang mereka takutkan</span><b>{card.fears.join(" · ")}</b></div>
                <div className="lh-kv"><span>Yang mereka inginkan</span><b>{card.desires.join(" · ")}</b></div>
                <div className="lh-kv"><span>CTA ampuh</span><b>{card.ctas[0]}</b></div>
                <div className="lh-kv"><span>Arah thumbnail</span><b>{card.thumb}</b></div>
                <div className="lh-kv"><span>Saran perangkat</span><b>{deviceAdvice(card.device).join(" · ")}</b></div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "research"} onClick={runResearch}>↻ Riset ulang</button>
                <button className="lh-btn" style={{ flex: 2 }} onClick={() => setStep(4)}>Hitung Judul Juara 🏆</button>
              </div>
              {researchAt && <p className="lh-note" style={{ textAlign: "center" }}>Riset: {new Date(researchAt).toLocaleString("id-ID")}</p>}
            </>
          )}
        </>
      )}

      {/* ============ LANGKAH 4: JUDUL JUARA ============ */}
      {step === 4 && angle && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Pilih judul juara 🏆</div>
            <p className="lh-sub">Semua kandidat diskor mesin vs pola & kemiripan kompetitor. Buka “audit” untuk lihat hitungannya — transparan, bukan kotak hitam.</p>
          </div>
          <div className="lh-rows">
            {scored.map((s, i) => (
              <div key={s.title} className={`lh-srow ${selTitle === s.title ? "on" : ""}`}>
                <button className="lh-smain" onClick={() => setSelTitle(s.title)}>
                  <span className="lh-medal">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <span className="tt">{s.title}</span>
                  <span className={`lh-sc ${scoreTone(s.score)}`}>{s.score}</span>
                </button>
                <div className="lh-bars">
                  <div className="lh-bar" title={`Search ${s.search}`}><i style={{ width: `${s.search}%` }} /><span>S</span></div>
                  <div className="lh-bar" title={`Browse ${s.browse}`}><i style={{ width: `${s.browse}%` }} /><span>B</span></div>
                  <div className="lh-bar" title={`Unik ${s.unique}`}><i style={{ width: `${s.unique}%` }} /><span>U</span></div>
                  <div className="lh-bar" title={`Hook ${s.hookScore}`}><i style={{ width: `${s.hookScore}%` }} /><span>H</span></div>
                </div>
                <div className="lh-sactions">
                  <button className="lh-mini" onClick={() => setExpanded(expanded === s.title ? "" : s.title)}>{expanded === s.title ? "tutup ▴" : "audit ▾"}</button>
                  <span className="lh-strat">{s.strategy}</span>
                  <button className="lh-mini ok" onClick={() => lockTitle(s.title)}>★ Kunci</button>
                </div>
                {expanded === s.title && (
                  <div className="lh-audit">
                    <ul className="lh-reasons">
                      {s.reasons.map((r, j) => <li key={j} className={r.c}>{r.t}</li>)}
                    </ul>
                    {!!s.gap_words.length && <p className="lh-note">Kata celah: {s.gap_words.join(", ")}</p>}
                    {!!s.gap_phrases.length && <p className="lh-note">Frasa celah: {s.gap_phrases.join(", ")}</p>}
                    <div className="lh-kv"><span>Hook thumbnail</span><b>{s.hook}</b></div>
                    <div className="lh-kv"><span>Tags</span><b>{s.tags.split(", ").slice(0, 8).join(", ")}…</b></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {selTitle && (
            <button className="lh-btn" onClick={() => setStep(5)}>Lanjut: Rancang Visual 🎨</button>
          )}
        </>
      )}

      {/* ============ LANGKAH 5: MESIN VISUAL WAW (PROMPT ENGINE) ============ */}
      {step === 5 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Mesin visual WAW 🎬</div>
            <p className="lh-sub">Judul terkunci: <b>{selTitle}</b></p>
            <p className="lh-sub">Di sinilah “script di dalam script” bekerja: <b>kartu karakter + gaya visual</b> di bawah ini disuntik ke prompt naskah, storyboard, dan TIAP gambar adegan — jadi wajah, pakaian & suasana <b>konsisten</b> dari adegan 1 sampai akhir.</p>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🎨 Gaya visual</div>
            <div className="lh-rows">
              {GAYA_VISUAL.map((g, i) => (
                <button key={g} className={`lh-row ${gaya === i ? "on" : ""}`} onClick={() => setGaya(i)}>
                  <span className="t">{g}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🧍 Kartu karakter <button className="lh-mini" onClick={() => setChars([...chars, { nama: "", peran: "pendukung", usia: "", ciri: "", pakaian: "", suasana: "" }])}>＋ tambah</button></div>
            {chars.map((c, i) => (
              <div key={i} className="lh-char">
                <div className="lh-char-head">
                  <input className="lh-in" placeholder="Nama (mis. Ibu)" value={c.nama} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, nama: e.target.value } : x))} />
                  {chars.length > 1 && <button className="lh-mini" onClick={() => setChars(chars.filter((_, j) => j !== i))}>🗑</button>}
                </div>
                <input className="lh-in" placeholder="Peran & rentang usia (mis. tokoh utama, wanita 55-65 th)" value={c.usia} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, usia: e.target.value } : x))} />
                <input className="lh-in" placeholder="Ciri wajib konsisten (rambut, mata, senyum...)" value={c.ciri} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, ciri: e.target.value } : x))} />
                <input className="lh-in" placeholder="Pakaian khas" value={c.pakaian} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, pakaian: e.target.value } : x))} />
                <input className="lh-in" placeholder="Suasana latar khas" value={c.suasana} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, suasana: e.target.value } : x))} />
              </div>
            ))}
          </div>

          <div className="lh-card">
            <div className="lh-h2">📜 Contoh perintah terinjeksi (adegan 1)</div>
            <pre className="lh-prompt">{composeVisualPrompt(`Opening: ${selTitle} — suasana awal cerita, ekspresi utama rindu`, chars, GAYA_VISUAL[gaya])}</pre>
            <button className="lh-btn sec" onClick={() => { void navigator.clipboard?.writeText(composeVisualPrompt(`Opening: ${selTitle}`, chars, GAYA_VISUAL[gaya])).then(() => flash("📋 Prompt tersalin")); }}>📋 Salin prompt</button>
            <p className="lh-note">Jujur bro: konsistensi karakter AI itu ~90-95% — kartu karakter + tombol ↻ ulangi per adegan adalah obatnya. Detail kartu makin spesifik = hasil makin akur.</p>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🔒 Kunci identitas (satpam wajah)</div>
            <p className="lh-note">Kalimat BEKU ini dirakit algoritma dari kartu karaktermu + kunci "Indonesia" di dalamnya, lalu disuntik <b>kata-per-kata SAMA di urutan PERTAMA</b> tiap prompt gambar. Inilah yang bikin wajah & pakaian konsisten dan orangnya beneran orang Indonesia. Boleh diedit — tapi jangan ubah-ubah di tengah proyek.</p>
            <textarea className="lh-ta" rows={3} placeholder="Tekan tombol BEKUKAN di bawah — kalimat identitas terisi otomatis dari kartu karakter…" value={charLock} onChange={(e) => setCharLock(e.target.value)} />
            <button className="lh-btn sec" disabled={busy === "charlock"} onClick={() => void ensureCharLock(true).then(() => flash("🔒 Identitas dibekukan — disuntik ke SEMUA gambar"))}>
              {busy === "charlock" ? "⏳ Membekukan..." : charLock ? "⤿ Bekukan ULANG dari kartu" : "🔒 Bekukan dari kartu karakter"}
            </button>
            {modelPinned && <p className="lh-note">🤖 Model terkunci: <b>{modelPinned}</b> (dipin dari gambar pertama yang berhasil → semua adegan semodel){refUrl ? " · 🖼 gambar adegan pertama ikut dikirim sebagai acuan wajah (percobaan; kalau gateway menolak, otomatis jalan biasa)" : ""}</p>}
          </div>

          <button className="lh-btn" onClick={() => setStep(6)}>Lanjut: Naskah Cerita 📝</button>
        </>
      )}

      {/* ============ LANGKAH 6: NASKAH CERITA ============ */}
      {step === 6 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Naskah cerita 📝</div>
            <p className="lh-sub">Untuk judul: <b>{selTitle}</b></p>
            <p className="lh-sub">AI menulis pakai perintah khusus: <b>hook 3 detik</b>, alur emosi (pembuka → konflik → klimaks haru → pesan), karakter konsisten, kalimat yang bisa dinyanyikan, dan CTA dari kartu audiens. Hasilnya bisa kau edit bebas — kau tetap sutradaranya.</p>
            <button className="lh-btn" disabled={busy === "cerita"} onClick={writeNaskah}>
              {busy === "cerita" ? "⏳ AI lagi nulis..." : naskah ? "✨ Tulis ulang naskah (AI)" : "✨ Tulis Naskah (AI)"}
            </button>
          </div>

          <div className="lh-card">
            <div className="lh-h2">📖 Naskah (bisa diedit)</div>
            <textarea
              className="lh-ta"
              rows={Math.max(8, Math.min(14, naskahLines.length + 2))}
              placeholder={"Baris 1 = hook pembuka...\nTiap baris = satu adegan...\nTulis/sendiri atau generate AI di atas."}
              value={naskah}
              onChange={(e) => setNaskah(e.target.value)}
            />
            <p className="lh-note">{naskahLines.length} adegan · ±{estDurSec} detik narasi (kecepatan baca normal) · {naskah.split(/\s+/).filter(Boolean).length} kata</p>
            <div className="lh-kv"><span>Cek hook</span><b>{naskahLines[0] ? (naskahLines[0].length > 5 ? `“${naskahLines[0]}” — bayangkan ini muncul 3 detik pertama, cukup bikin berhenti scroll?` : "…") : "Belum ada naskah"}</b></div>
            <div className="lh-kv"><span>Saran audiens</span><b>{solutionFor(intentEff)}</b></div>
          </div>

          {naskah.trim().length >= 10 && (
            <button className="lh-btn" onClick={() => setStep(7)}>Susun Jadi Adegan 🎬</button>
          )}
        </>
      )}

      {/* ============ LANGKAH 7: STORYBOARD & GAMBAR ADEGAN ============ */}
      {step === 7 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Adegan & gambar 🎬</div>
            <p className="lh-sub">Naskah dipotong jadi adegan, tiap adegan digambar AI dengan <b>kartu karakter + gaya visual terinjeksi</b> — biar karakter nyambung antar adegan. Yang kurang pas tinggal <b>↻ ulangi</b> adegan itu saja.</p>
            {!board ? (
              <button className="lh-btn" disabled={busy === "board"} onClick={buildBoard}>
                {busy === "board" ? "⏳ Sutradara AI menyusun..." : "🎬 Susun Storyboard (AI)"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "board" || genAllBusy} onClick={buildBoard}>↻ Susun ulang</button>
                <button className="lh-btn" style={{ flex: 2 }} disabled={genAllBusy} onClick={genAllScenes}>
                  {genAllBusy ? `⏳ Menggambar ${boardDone}/${board.scenes.length}...` : boardDone === board.scenes.length ? `✅ ${board.scenes.length}/${board.scenes.length} siap` : `🖼 Generate SEMUA (${boardDone}/${board.scenes.length})`}
                </button>
              </div>
            )}
          </div>

          {board && (
            <>
              {board.scenes.map((sc, i) => (
                <div key={i} className="lh-card lh-scene">
                  <div className="lh-scene-head">
                    <span className="lh-scene-no">{sc.scene}</span>
                    <span className="lh-chip" style={{ borderColor: board.color_grade }}>{sc.mood}</span>
                    <div style={{ flex: 1 }} />
                    {sc.status === "done" && <span className="lh-mini ok">✅</span>}
                    {sc.status === "loading" && <span className="lh-mini">⏳</span>}
                    {sc.status === "error" && <span className="lh-mini">❌</span>}
                  </div>
                  {sc.url && <img className="lh-scene-img" src={sc.url} alt={`adegan ${sc.scene}`} />}
                  {sc.status === "error" && <p className="lh-note" style={{ color: "#ff9b9b" }}>{sc.err}</p>}
                  <textarea className="lh-ta" rows={2} value={sc.scene_desc} onChange={(e) => updateScene(i, { scene_desc: e.target.value })} />
                  {!!sc.lyric_line && <p className="lh-lyric">🎵 “{sc.lyric_line}”</p>}
                  <details className="lh-details">
                    <summary>prompt gambar (🔒 kunci identitas + adegan) ▾</summary>
                    <pre className="lh-prompt">{charLock ? `🔒 IDENTITAS BEKU: ${charLock}\n\n+ ADEGAN MURNI: ${sc.visual_prompt}` : injectCharacter(sc.visual_prompt, chars, GAYA_VISUAL[gaya])}</pre>
                    <textarea className="lh-ta" rows={2} value={sc.visual_prompt} onChange={(e) => updateScene(i, { visual_prompt: e.target.value })} />
                  </details>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} disabled={sc.status === "loading" || genAllBusy} onClick={() => void genScene(i, sc)}>
                      {sc.status === "loading" ? "⏳ Menggambar..." : sc.status === "done" ? "↻ Ulangi adegan ini" : "🖼 Generate gambar"}
                    </button>
                  </div>
                </div>
              ))}

              <div className="lh-card">
                <div className="lh-h2">📊 Status ladang</div>
                <div className="lh-kv"><span>Adegan siap</span><b className={boardDone === board.scenes.length ? "ok" : "warn"}>{boardDone}/{board.scenes.length}</b></div>
                <div className="lh-kv"><span>Gaya visual</span><b>{GAYA_VISUAL[gaya].split(",")[0]}</b></div>
                <div className="lh-kv"><span>Karakter</span><b>{chars.filter((c) => c.nama.trim()).map((c) => c.nama).join(", ") || "-"}</b></div>
                <p className="lh-note">Berikutnya: <b>🎵 Panggung Lagu</b> (lirik 2 pilihan + kredit jujur + polling sabar anti-macet) → lalu <b>v8.0</b>: lagu & adegan otomatis nyatu → tombol <b>Masuk Studio Edit</b>.</p>
              </div>

              <button className="lh-btn" onClick={() => setStep(8)}>Lanjut: Panggung Lagu 🎵</button>
            </>
          )}
        </>
      )}

      {/* ============ LANGKAH 8: LAGU (SUNO) ============ */}
      {step === 8 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Panggung lagu 🎵</div>
            <p className="lh-sub">Judul: <b>{selTitle}</b> — lagu diolah Suno lewat provider pilihanmu. API key disimpan <b>di HP-mu saja</b> (localStorage), bukan di server.</p>
            <div className="lh-kv">
              <span>Provider</span>
              <b>
                <select className="lh-sel" value={sunoProv} onChange={(e) => { setSunoProv(e.target.value); try { localStorage.setItem("verve_suno_provider", e.target.value); } catch { /* abaikan */ } setCreditInfo({}); }}>
                  {SUNO_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </b>
            </div>

            <button className="lh-btn sec" onClick={() => setKeyPanel(!keyPanel)}>
              🔑 Setelan API Key — {keysForProvider().length} kunci tersimpan {keyPanel ? "▴" : "▾"}
            </button>

            {keyPanel && (
              <div className="lh-keypanel">
                {PROVIDER_KEY_LINK[sunoProv]?.url ? (
                  <a className="lh-keylink" href={PROVIDER_KEY_LINK[sunoProv].url} target="_blank" rel="noreferrer">
                    🔑 Ambil API key di {SUNO_PROVIDERS.find((p) => p.id === sunoProv)?.label.replace(/^🥇 /, "")} ↗
                  </a>
                ) : (
                  <p className="lh-note">aimusic.so = mode gratis tanpa key (sering penuh). Mau lancar: pakai Kie.ai.</p>
                )}
                <p className="lh-note">1. Tap link di atas → login → {PROVIDER_KEY_LINK[sunoProv]?.hint}.<br />2. Tempel <b>satu kunci per baris</b> di bawah → <b>+ Tambah</b>. Bisa BANYAK kunci: kalau satu habis/ditolak, mesin <b>otomatis pindah kunci berikutnya</b>.</p>
                <textarea
                  className="lh-ta"
                  rows={3}
                  placeholder={sunoProv === "kie" ? "sk-kie-xxx\nsk-kie-yyy" : sunoProv === "apiframe" ? "afk_xxx\nafk_yyy" : "kunci_baris_1\nkunci_baris_2"}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="lh-btn" style={{ flex: 1.4, marginTop: 0 }} disabled={!keyDraft.trim()} onClick={addKeysFromDraft}>＋ Tambah</button>
                  <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} disabled={checkingCredit || !keysForProvider().length} onClick={cekKredit}>{checkingCredit ? "⏳ Mengecek…" : "🔄 Cek Kredit"}</button>
                  <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} disabled={!keysForProvider().length} onClick={clearKeysCurrentProv}>🗑 Hapus</button>
                </div>
                <div className="lh-keyshead">
                  <span>KUNCI TERSIMPAN</span>
                  <span>{keysForProvider().length} kunci</span>
                </div>
                {!keysForProvider().length && <p className="lh-note" style={{ textAlign: "center" }}><i>Belum ada kunci.</i></p>}
                {keysForProvider().map((k) => (
                  <div key={k.key} className="lh-keyrow">
                    <span className="k">{maskKey(k.key)}</span>
                    <span className="cr">{creditInfo[k.key] || creditInfo[maskKey(k.key)] || ""}</span>
                    <button className="lh-mini" onClick={() => removeKey(k.key)}>🗑</button>
                  </div>
                ))}
                <p className="lh-note">💳 <b>Kredit jujur</b>: nominal cuma ditampilkan kalau provider mengeksposnya via API — kalau tidak, kami bilang jujur & kunci tetap bisa dipakai. 1 lagu = 1 panggilan API. Kunci disimpan DI HP-mu saja (localStorage), dipakai bareng studio.</p>
              </div>
            )}
          </div>

          {err && (err.code === "need_key" || err.code === "quota") && (
            <div className="lh-card lh-errcard">
              <b>{err.code === "need_key" ? "🔑 Butuh API key" : "💳 Kredit provider habis"}</b>
              <p>{err.msg}</p>
              <p className="lh-note">Saran: buka 🔑 Setelan API Key di atas → tap link provider (Kie.ai gratis & lancar dari Indo) → generate key → tempel satu per baris → Tambah. Kalau kunci lama habis, mesin otomatis pindah ke kunci berikutnya.</p>
            </div>
          )}

          <div className="lh-card">
            <div className="lh-h2">📝 Lirik lagu</div>
            <div className="lh-tabs">
              <button className={`lh-tab ${lyricMode === "auto" ? "on" : ""}`} onClick={() => setLyricMode("auto")}>✨ Generate lirik (AI)</button>
              <button className={`lh-tab ${lyricMode === "manual" ? "on" : ""}`} onClick={manualLyrics}>✍️ Tulis sendiri</button>
            </div>
            {lyricMode === "auto" && (
              <>
                <div className="lh-duo">
                  <select className="lh-sel" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className="lh-sel" value={mood} onChange={(e) => setMood(e.target.value)}>
                    {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <button className="lh-btn sec" disabled={busy === "lyrics"} onClick={genLyrics}>
                  {busy === "lyrics" ? "⏳ Pujangga AI menulis..." : "✨ Generate lirik dari judul & niche"}
                </button>
              </>
            )}
            <textarea
              className="lh-ta"
              rows={10}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={"[Intro]\n...\n[Verse 1]\n...\n[Chorus]\n..."}
            />
            {!!lyrics.trim() && <p className="lh-note">{lyrics.split("\n").filter(Boolean).length} baris · {lyrics.trim().length} karakter — boleh diedit bebas</p>}
          </div>

          <div className="lh-card">
            <div className="lh-h2">🎚 Gaya musik & vokal</div>
            <input className="lh-in" value={mStyle} onChange={(e) => setMStyle(e.target.value)} placeholder="contoh: sad indonesian pop ballad, piano, strings, emotional female vocal" />
            <div className="lh-chips">
              {(["auto", "male", "female", "instrumental"] as const).map((v) => (
                <button key={v} className={`lh-chip ${vocal === v ? "on" : ""}`} onClick={() => setVocal(v)}>
                  {v === "auto" ? "👫 Auto" : v === "male" ? "👨 Pria" : v === "female" ? "👩 Wanita" : "🎼 Instrumental"}
                </button>
              ))}
            </div>
            <button className="lh-btn" disabled={polling || busy === "song"} onClick={launchSong}>
              {busy === "song" ? "⏳ Mengirim ke dapur lagu..." : "🎵 Generate Lagu"}
            </button>
            {vocal !== "instrumental" && lyrics.trim().length < 30 && (
              <p className="lh-note">⚠️ Lirik masih terlalu pendek (min 30 karakter) — generate lirik AI/tulis sendiri dulu, atau pilih 🎼 Instrumental.</p>
            )}
          </div>

          {task && !song && (
            <div className="lh-card lh-verdict warn">
              <div className="lh-vscore">⏳</div>
              <div style={{ flex: 1 }}>
                <b>{polling ? `Mengolah lagu… ${fmtClock(pollUi.elapsed)}` : "Task tersimpan — tidak sedang dipantau"}</b>
                <div className="lh-pollbar"><i style={{ width: `${Math.min(100, (pollUi.elapsed / 540) * 100)}%` }} /></div>
                <p>
                  {polling
                    ? `Cek #${pollUi.attempt} · polling cerdas (rapat di awal, renggang kemudian) · batas sabar 9 menit. Lagu sering jadi di menit 2–5, aman ditinggal — task tersimpan di draf.`
                    : "Kamu keluar saat lagu diolah / polling dihentikan. Task aman tersimpan."}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {polling
                    ? <button className="lh-mini" onClick={cancelPolling}>✋ Batal pantau</button>
                    : <button className="lh-mini ok" onClick={() => task && startPolling(task)}>▶ Lanjut pantau</button>}
                  <button className="lh-mini" onClick={() => task && void checkOnce(task.id).catch((e) => setErr({ code: "suno", msg: e instanceof Error ? e.message : String(e) }))}>🔍 Cek manual</button>
                  <button className="lh-mini" onClick={() => { cancelPolling(); setTask(null); }}>🗑 Lepaskan</button>
                </div>
              </div>
            </div>
          )}

          {song && (
            <div className="lh-card">
              <div className="lh-h2">✅ Lagu jadi: {song.title || selTitle}</div>
              {!!peaks?.length && (
                <div className="lh-wave">{peaks.map((p, i) => <i key={i} style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />)}</div>
              )}
              <audio
                className="lh-audio"
                controls
                preload="metadata"
                src={song.url}
                onLoadedMetadata={(e) => {
                  if (!song.duration) {
                    const d = e.currentTarget.duration;
                    if (isFinite(d)) setSong((s) => (s ? { ...s, duration: d } : s));
                  }
                }}
              />
              <div className="lh-kv"><span>Durasi</span><b>{song.duration ? `${Math.round(song.duration)} detik` : "terbaca saat diputar…"}</b></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} onClick={() => { setSong(null); setPeaks(null); }}>↻ Buat ulang</button>
                <button className="lh-btn" style={{ flex: 2, marginTop: 0 }} onClick={() => flash("📌 Lagu terpasang di lahan — digabung ke video di v8.0")}>✅ Pakai lagu ini</button>
              </div>
            </div>
          )}

          {song && board && (
            <button className="lh-btn" onClick={() => setStep(9)}>Gabung Jadi Video 🎬</button>
          )}
          <p className="lh-note" style={{ textAlign: "center" }}>Langkah terakhir: lagu + adegan digabung otomatis → tombol <b>Masuk Studio Edit</b> (elemen terpisah ke jalurnya masing-masing).</p>
        </>
      )}

      {/* ============ LANGKAH 9: GABUNG OTOMATIS → STUDIO EDIT ============ */}
      {step === 9 && board && song && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Video utuh 🎬</div>
            <p className="lh-sub">Lagu + {doneScenes.length} adegan digabung otomatis: tiap adegan dapat ±{perScene.toFixed(1)} detik mengikuti durasi lagu {fmtClock(totalDur)}. Jujur bro — pembagiannya rata; sinkron halus per ketukan/emosi bisa kau poles di Studio (ada penanda BPM).</p>
            <div className="lh-kv"><span>✅ Adegan</span><b>{doneScenes.length}/{board.scenes.length} bergambar</b></div>
            <div className="lh-kv"><span>✅ Lagu</span><b>{song.title || selTitle} · {song.duration ? fmtClock(Math.round(song.duration)) : "-"}</b></div>
            <div className="lh-kv"><span>✅ Lirik karaoke</span><b>tiap adegan jadi lapisan teks sendiri di Studio</b></div>
          </div>

          <div className="lh-card">
            <div className="lh-h2">▶ Pratinjau gabungan</div>
            <div className="lh-player">
              {doneScenes[pvIdx] && <img key={pvIdx} className="lh-pv-img" src={doneScenes[pvIdx].url} alt={`adegan ${doneScenes[pvIdx].scene}`} />}
              {!!doneScenes[pvIdx]?.lyric_line && (
                <div className="lh-pv-cap"><span>🎵 {doneScenes[pvIdx].lyric_line}</span></div>
              )}
            </div>
            <div className="lh-pv-bar"><i style={{ width: `${Math.min(100, (pvT / Math.max(1, totalDur)) * 100)}%` }} /></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="lh-btn" style={{ flex: 1, marginTop: 0 }} onClick={togglePreview}>{pvPlaying ? "⏸ Jeda" : "▶ Putar"}</button>
              <span className="lh-note" style={{ margin: 0 }}>{fmtClock(Math.floor(pvT))} / {fmtClock(totalDur)}</span>
            </div>
            <div className="lh-dotnav">
              {doneScenes.map((s, i) => (
                <button key={i} className={i === pvIdx ? "on" : ""} onClick={() => seekPreview(i)}>{i + 1}</button>
              ))}
            </div>
            <audio ref={pvAudioRef} src={song.url} preload="auto" onEnded={() => setPvPlaying(false)} />
          </div>

          <div className={`lh-card lh-verdict ${doneScenes.length === board.scenes.length ? "ok" : "warn"}`}>
            <div className="lh-vscore">🎬</div>
            <div>
              <b>{doneScenes.length === board.scenes.length ? "Siap masuk Studio Edit" : `Baru ${doneScenes.length}/${board.scenes.length} adegan bergambar`}</b>
              <p>Masuk Studio: gambar → <b>Track 1</b> · lagu → <b>jalur musik</b> (gelombang asli + BPM) · lirik tiap adegan → <b>lapisan teks terpisah</b> (bisa kau geser/edit hapus satu-satu). Belum cocok = edit, cocok = ekspor.</p>
            </div>
          </div>
          <button className="lh-btn" onClick={masukStudio}>🎬 MASUK STUDIO EDIT</button>
        </>
      )}

      <p className="lh-note" style={{ textAlign: "center", marginTop: 14 }}>
        🧠 VERVE Brain + Prompt Engine · kartu karakter disuntik ke tiap adegan · skor & prompt bisa diaudit
      </p>
      {toast && <div className="lh-toast">{toast}</div>}
    </div>
  );
}
