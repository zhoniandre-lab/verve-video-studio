"use client";

/**
 * LAHAN AWALAN v2 — mesin produksi AI VERVE (semua niche).
 * Alur: Niat → Sudut → Riset → Judul → Visual (prompt engine) → Cerita → Adegan.
 *
 * Otak: VERVE Brain (src/lib/brain/*) — skor dari HITUNGAN NYATA, bukan ngarang.
 * "Script di dalam script": kartu karakter + gaya visual disuntik ke prompt
 * naskah, storyboard, DAN tiap prompt gambar adegan — biar visual konsisten WAW.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { avWarm } from "@/lib/avault";
import { cariStokVideoSmart, kueriDariScene, pilihKlipBervariasi, temaDariKarakter, GAYA_EN, type VidPick } from "@/lib/stockvid";
import {
  analyzeAngle, buildCandidates, scoreTitleV2, uniq,
  type Angle, type ScoredTitle, type BrainMemory, type BrainResult,
} from "@/lib/brain/yie-score";
import {
  detectAudienceIntent, audienceCard, dominantEmotion, watchActivity,
  solutionFor, monetizationHint, deviceAdvice, DATA_GAPS,
} from "@/lib/brain/audience";
import { analyzeBrainPatterns } from "@/lib/brain/pattern-insight";
import { gabungChunksDataUrl } from "@/lib/gabung-audio"; // 🧩 v19.49 gabung potongan TTS
import { suggestTitlesFromBrain, type GuruSuggestion } from "@/lib/brain/title-guru";
import { NICHES, isSongNiche, nicheAiLabel, nicheById, wizardSteps } from "@/lib/brain/niche";
import { resetJikaPerangkatBeda, tandaiPerangkat, deviceSama } from "@/lib/device-scope";
import { bestUploadDay, bestUploadWindows, brainLevel, buildBrainReport, idealDuration, jadwalUpload, predictCtrBayes, velocityLabel, videoVelocity } from "@/lib/brain/deep-dive";
import { ambilSnapshotTrend, bandingkanGelombang, cocokNiche, skorTrend, simpanSnapshotTrend, type TrendGelombang, type TrendItem } from "@/lib/brain/trend-radar";
import { kompetitorVelocity } from "@/lib/brain/competitor-rss";
import { rencanaKonten } from "@/lib/brain/content-factory";
import { analisaHook, upgradeAdegan1 } from "@/lib/brain/hook-engine";
import { radarKompetitor } from "@/lib/brain/kompetitor-radar";
import { saranThumbnail, type SaranThumbnail } from "@/lib/brain/thumb-trend";
import { cekNotifikasiHarian, notifEnabled, notifSupported, requestNotifPermission, setNotifEnabled } from "@/lib/brain/daily-notify";
import { analisisPolaKompetitor, angkaPopulerDariJudul, bandingkanJudul, deteksiUploadBaru, extractChannelId, KOMP_SEEN_KEY, KOMP_TITLES_KEY, kumpulkanJudul, ringkasanScan, serangBalikJudul, simJudul, tandaiTerlihat, waktuLalu, type HasilBanding, type HasilSerang, type KompChannel, type KompFeed, type KompTitleRow, type PolaKompetitor } from "@/lib/brain/competitor-rss";
import { BRAIN_KEY, loadBrain, lastSyncTime, markSyncDone, persistBrain, syncYtBrain } from "@/lib/brain/auto-sync";
import { getAudioPeaks } from "@/lib/waveform";
import { mirrorDraft } from "@/lib/guard/draft-idb";
import Ngomong from "@/lib/ngomong"; // 🎤🧠 v14.5 SUARA PAHAM

const LAHAN_KEY = "verve_lahan_v1";

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
/* 🧠 v13.1: kunci judul dinormalkan — dipakai dedupe otak & lapor performa */
function normTitleKey(t: string): string {
  return String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
}
/* 🧠 v13.1: gabung memori HP + brankas — yang TERBARU menang, maks 200 judul + 25 riset */
function mergeBrain(a: BrainMemory, b: BrainMemory): BrainMemory {
  const map = new Map<string, BrainResult>();
  [...(a.results || []), ...(b.results || [])].forEach((r) => {
    const k = normTitleKey(r.title || "");
    if (!k) return;
    const old = map.get(k);
    if (!old || (+r.time! || 0) >= (+old.time! || 0)) map.set(k, { ...old, ...r });
  });
  const results = [...map.values()].sort((x, y) => (+y.time! || 0) - (+x.time! || 0)).slice(0, 200);
  const researches = [...(a.researches || []), ...(b.researches || [])].slice(0, 25);
  return { researches, results };
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
  vid?: VidPick | null; vidOn?: boolean; vidSpd?: number; // 🎞️ v13.11 LEMARI VIDEO · ⏱ v13.13 kecepatan manual klip stok
};
type Board = { style_visual: string; color_grade: string; scenes: Scene[] };

type SongTask = { id: string; title: string; ts: number };
// 🎬 v11.0 SUTRADARA CHAT — perintah terstruktur dari otak /api/hcnsec/director
type DirOp = {
  op: string; scene?: number; title?: string; style_visual?: string; color_grade?: string;
  visual_en?: string; lyric_line?: string; lyrics?: string; mStyle?: string;
  era?: string; tempo?: string; instruments?: string; vocal?: string; model?: string; instruction?: string;
};
type DirSnap = {
  board: Board | null; lyrics: string; mStyle: string; selTitle: string;
  sEra: string; sTempo: string; sInstr: string[]; vocal: "auto" | "male" | "female" | "instrumental"; sunoModel: string;
};
type SongResult = { url: string; title: string; duration?: number; image?: string; audio?: string };
type SunoKey = { key: string; provider: string };

const SUNO_KEYS_KEY = "verve_suno_keys_v1";
/** Link resmi buat ambil/generate API key — satu klik, kayak panel Kampung Music */
const PROVIDER_KEY_LINK: Record<string, { url: string; hint: string }> = {
  kie: { url: "https://kie.ai/api-key", hint: "Login kie.ai → menu API Key → Generate (kalau tautan 404, dari kie.ai pilih menu API Key)" },
  sunor: { url: "https://sunor.cc", hint: "Login sunor.cc → dashboard → API Key" },
  musicapi: { url: "https://musicapi.ai", hint: "Daftar musicapi.ai → dashboard → API key" },
  aimusicapi: { url: "https://aimusicapi.ai", hint: "Daftar aimusicapi.ai → dashboard → API key" },
  sunoapi: { url: "https://sunoapi.org/api-key", hint: "Daftar sunoapi.org → API Key Management (akun terpisah dari Kie)" },
  evolink: { url: "https://evolink.ai/dashboard", hint: "Daftar evolink.ai → Dashboard → API Keys (umumnya berbayar)" },
  cometapi: { url: "https://www.cometapi.com/console/token", hint: "Daftar cometapi.com → Console → Token" },
  ttapi: { url: "https://dashboard.ttapi.io/", hint: "Daftar dashboard.ttapi.io → Get API key" },
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
  { id: "sunor", label: "☀️ Sunor.cc" },
  { id: "musicapi", label: "🎧 MusicAPI (75 kredit uji)" },
  { id: "aimusicapi", label: "🎧 AIMusicAPI (30 kredit uji)" },
  { id: "sunoapi", label: "🟣 SunoAPI.org (akun terpisah)" },
  { id: "evolink", label: "🧬 EvoLink (Suno v5/v5.5)" },
  { id: "cometapi", label: "☄️ CometAPI (Suno)" },
  { id: "ttapi", label: "🧩 TTAPI (Suno v5)" },
];
const GENRES = ["pop ballad Melayu sedih", "akustik mellow piano", "orkes melankolis", "pop religi lembut", "folk sendu"];
const MOODS = ["haru", "rindu", "sedih", "menyentuh", "tenang"];
// 🎚 v10.3 SUNO LENGKAP — panel ala proyek pertama + picker versi sampai yang terbaru
const SUNO_MODELS = [
  { id: "V4_5PLUS", label: "v4.5+", note: "✦ stabil & jernih" },
  { id: "V5_5", label: "v5.5", note: "🆕 terbaru" },
  { id: "V5", label: "v5.0", note: "baru" },
  { id: "V4_5ALL", label: "v4.5-all", note: "vokal lebih fokus" },
  { id: "V4_5", label: "v4.5", note: "" },
  { id: "V4", label: "v4.0", note: "hemat kredit" },
  { id: "V3_5", label: "v3.5", note: "klasik" },
];
const SUNO_ERAS = [
  { id: "2020s", label: "modern 2020-an" }, { id: "2010s", label: "2010-an" },
  { id: "2000s", label: "2000-an" }, { id: "90s", label: "90-an" }, { id: "80s", label: "80-an" },
];
const SUNO_TEMPOS = [
  { id: "slow", label: "🐢 Lambat" }, { id: "mid", label: "🚶 Sedang" }, { id: "fast", label: "🏃 Cepat" },
];
const SUNO_INSTRS = ["piano akustik", "gitar akustik", "biola & strings", "orkestra penuh", "suling", "gendang melayu", "synth ambient", "drum halus"];
/** Interval polling cerdas (detik): rapat di awal, makin jarang makin lama — total sabar ±6 mnt (putaran 2 s.d. 9 mnt). v10.6: tiap cek bertenggat 40 dtk + batas sabar dijaga timer, tidak bisa beku */
const POLL_DELTAS = [5, 8, 10, 12, 15, 15, 20, 20, 25, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];

type LahanState = {
  step: number; topic: string; angles: string[]; selKeyword: string;
  angle: Angle | null; researchAt: string; selTitle: string;
  naskah: string; board: Board | null;
  lyrics: string; lyricMode: "auto" | "manual"; mStyle: string;
  genre: string; mood: string; vocal: string;
  task: SongTask | null; song: SongResult | null;
  charLock?: string; modelPinned?: string; // 🔒 v10.0 SATU WAJAH
  sunoModel?: string; sEra?: string; sTempo?: string; sInstr?: string[]; // 🎚 v10.3 SUNO LENGKAP
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

// 🎨 v19.22: GAYA VISUAL NETRAL (semua niche) — bukan lagi "mood haru/anime sedih" yang lagu-centric.
const GAYA_VISUAL = [
  "Sinematik realistis, cahaya warm golden hour, lensa 35mm, depth of field lembut, palet hangat",
  "Ilustrasi cat air emosional, tekstur kertas, sapuan lembut, palet warm pastel",
  "Anime kualitas layar lebar, pencahayaan dramatis, palet kaya, detail ekspresi halus",
  "3D animasi lembut, lighting cinematic, render halus kualitas film pendek",
  "Dokumenter jurnalistik, pencahayaan natural, warna tajam, kesan nyata & serius",
  "Neon & kontras tinggi, cahaya kota malam, palet cyan-magenta, energi modern",
];
/** kode style untuk mesin gambar hcnsec (IMAGE_STYLES ids) */
const GAYA_TO_STYLE = ["cinematic", "oil", "anime", "3d"];

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

export default function LahanStudio({ onExit, gotoEditor, gotoThumb }: { onExit: () => void; gotoEditor?: (id?: string, cmd?: { tool?: string; newProject?: number; applyAdjust?: number }) => void; gotoThumb?: () => void }) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  // 📱 v19.23 ANTI-INTIP: kalau buka di HP/browser BEDA → semua data pribadi di-reset ke default
  useEffect(() => { resetJikaPerangkatBeda(); tandaiPerangkat(); }, []);
  // 🎯 v19.20 SEMUA NICHE: pilihan niche pengguna (default Kisah & Lagu, bisa ganti)
  const [nicheId, setNicheId] = useState<string>(() => {
    try { return deviceSama() ? (localStorage.getItem("verve_lahan_niche_v1") || "story_song") : "story_song"; } catch { return "story_song"; }
  });
  const [nicheCustom, setNicheCustom] = useState<string>(() => { try { return deviceSama() ? (localStorage.getItem("verve_lahan_niche_custom_v1") || "") : ""; } catch { return ""; } });
  const nicheDef = nicheById(nicheId);
  const nicheAI = nicheAiLabel(nicheId, nicheCustom);
  const songNiche = isSongNiche(nicheId); // 🎵 v19.21: alur lagu vs audio
  const stepLabels = useMemo(() => wizardSteps(nicheId), [nicheId]);
  function gantiNiche(id: string) {
    setNicheId(id);
    try { localStorage.setItem("verve_lahan_niche_v1", id); } catch { /* abaikan */ }
  }
  const [angles, setAngles] = useState<string[]>([]);
  const [selKeyword, setSelKeyword] = useState("");
  const [angle, setAngle] = useState<Angle | null>(null);
  const [researchAt, setResearchAt] = useState("");
  const [selTitle, setSelTitle] = useState("");
  const [naskah, setNaskah] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [genAllBusy, setGenAllBusy] = useState(false);
  /* 🎞️ v13.11 LEMARI VIDEO — pencarian & pemilih stock video (gerbang /api/hcnsec/stock-video) */
  const [vidSheet, setVidSheet] = useState<number | null>(null); // indeks adegan yang lagi milih
  const [vidQ, setVidQ] = useState("");
  const [vidRes, setVidRes] = useState<VidPick[]>([]);
  const [vidBusy, setVidBusy] = useState(false);
  const [vidErr, setVidErr] = useState("");
  const [vidAllBusy, setVidAllBusy] = useState(false);
  const [vidNote, setVidNote] = useState("");
  // 🇮🇩 v13.11.1: mode RASA INDONESIA (default NYALA) — pilihan bro diingat HP
  const [rasaIndo, setRasaIndo] = useState<boolean>(() => { try { return localStorage.getItem("verve_vidindo_v1") !== "0"; } catch { return true; } });
  // 🧯 v13.11.1 ANTI-KEMBAR: id klip yang sudah dipakai adegan mana pun — dilarang kepilih ulang
  const vDipakai = useMemo(() => { const t = new Set<number>(); board?.scenes.forEach((sc) => { if (sc.vidOn && sc.vid) t.add(sc.vid.id); }); return t; }, [board]);
  const [busy, setBusy] = useState<"" | "suggest" | "research" | "cerita" | "board" | "lyrics" | "song" | "charlock">("");
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);
  /* ---- SUNO ---- */
  const [lyrics, setLyrics] = useState("");
  const [lyricMode, setLyricMode] = useState<"auto" | "manual">("auto");
  const [mStyle, setMStyle] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [vocal, setVocal] = useState<"auto" | "male" | "female" | "instrumental">("auto");
  const [sunoModel, setSunoModel] = useState("V4_5PLUS"); // 🎚 v10.3: versi Suno yang DIPAKAI (tampil & bisa dipilih sampai terbaru)
  const [sEra, setSEra] = useState("");
  const [sTempo, setSTempo] = useState("");
  const [sInstr, setSInstr] = useState<string[]>([]);
  const [songModelUsed, setSongModelUsed] = useState(""); // 🎚 v10.3: versi yang dipakai generate terakhir
  const [sunoKey, setSunoKey] = useState("");
  const [sunoProv, setSunoProv] = useState("kie");
  const [task, setTask] = useState<SongTask | null>(null);
  // 🎬 v11.0 SUTRADARA CHAT
  const [chatLog, setChatLog] = useState<{ me: "me" | "ai" | "sys"; text: string }[]>([]);
  const [chatInp, setChatInp] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingOps, setPendingOps] = useState<DirOp[]>([]);
  const [undoSnap, setUndoSnap] = useState<DirSnap | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [song, setSong] = useState<SongResult | null>(null);
  // 🎙️ v19.24 NARASI TTS (niche non-lagu: horor/cerita/tutorial pakai suara narasi, bukan lagu)
  const [ttsNarasi, setTtsNarasi] = useState("");
  const [ttsVoice, setTtsVoice] = useState("gadis");
  const [ttsStyle, setTtsStyle] = useState("normal");
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsMsg, setTtsMsg] = useState("");
  const [narasiUrl, setNarasiUrl] = useState("");
  const [narasiName, setNarasiName] = useState("");
  const [narasiDur, setNarasiDur] = useState(0);
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
  const [pvErr, setPvErr] = useState("");   // 🛡 v11.2: kegagalan audio TIDAK BOLEH diam-diam lagi
  const [pvProxy, setPvProxy] = useState(false); // 🛡 v11.2: percobaan kedua lewat jalur proxy
  const launchKeyRef = useRef("");
  const [toast, setToast] = useState("");
  const [chars, setChars] = useState<CharCard[]>(DEFAULT_CHARS);
  const [charLock, setCharLock] = useState(""); // 🔒 v10.0: kalimat identitas BEKU (Inggris) — disuntik kata-per-kata SAMA ke tiap gambar
  const [modelPinned, setModelPinned] = useState(""); // 🔒 v10.0: model pertama yang BERHASIL di-pin → semua adegan semodel
  const ensureLockCacheRef = useRef<string>(""); // 🔒 v10.0: cache lock milik sesi menggambar berjalan
  const [gaya, setGaya] = useState(0);
  const [expanded, setExpanded] = useState<string>("");
  const [brain, setBrain] = useState<BrainMemory>(() => loadBrain());
  const [showLapor, setShowLapor] = useState(false);
  const [perfSel, setPerfSel] = useState("");
  const [perfCtr, setPerfCtr] = useState("");
  const [perfImp, setPerfImp] = useState("");
  const [perfAvd, setPerfAvd] = useState("");
  // 🔄 v19.0 FEEDBACK LOOP: otak belajar sendiri dari data YouTube (read-only)
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncLast, setSyncLast] = useState<number | null>(() => lastSyncTime());
  // 🧠 v19.1: INSIGHT POLA + TITLE GURU — otak pamer catatan & menulis judul baru
  const insight = useMemo(() => analyzeBrainPatterns(brain), [brain]);
  const [guru, setGuru] = useState<GuruSuggestion[]>([]);
  const [guruMsg, setGuruMsg] = useState("");
  // 🔮 v19.3: DEEP DIVE — velocity, jam hoki, durasi ideal, prediksi CTR
  const deep = useMemo(() => {
    const fastest = (brain.results || []).reduce<{ r: (typeof brain.results)[number] | null; vel: number | null }>(
      (acc, r) => {
        const vel = videoVelocity(r);
        if (vel != null && (acc.vel == null || vel > acc.vel)) return { r, vel };
        return acc;
      },
      { r: null, vel: null }
    );
    return {
      level: brainLevel(insight.withCtr),
      windows: bestUploadWindows(brain),
      day: bestUploadDay(brain),
      dur: idealDuration(brain),
      fastest,
      report: buildBrainReport(brain),
    };
  }, [brain, insight]);
  const [predTitle, setPredTitle] = useState("");
  const [predRes, setPredRes] = useState<{ est: number; low: number; high: number; n: number; why: string } | null>(null);
  // 🔥 v19.4/19.5: TREND RADAR — topik hangat dari Google Trends RSS (multi-negara)
  const [trends, setTrends] = useState<TrendItem[] | null>(null);
  const [trendBusy, setTrendBusy] = useState(false);
  const [trendMsg, setTrendMsg] = useState("");
  const [trendGeo, setTrendGeo] = useState("ID");
  const [thumbTrend, setThumbTrend] = useState<{ title: string; saran: SaranThumbnail } | null>(null);
  const jadwal = useMemo(() => jadwalUpload(brain, 7), [brain]);
  const [showJadwal, setShowJadwal] = useState(false);
  // ⚡ v19.5: RADAR KOMPETITOR — 3 kompetitor tercepat dari riset
  const radar = useMemo(() => (angle ? radarKompetitor(angle.qualified || [], 3) : null), [angle]);
  // 🔔 v19.5: NOTIFIKASI HARIAN OTAK
  const [notifOn, setNotifOn] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");
  // 🌊 v19.9: RADAR GELOMBANG — status trend (naik/baru/turun) + pabrik konten
  const [gelombang, setGelombang] = useState<TrendGelombang[] | null>(null);
  const [showPabrik, setShowPabrik] = useState(false);
  const pabrik = useMemo(() => (trends?.length ? rencanaKonten(brain, trends, gelombang, 7, nicheId) : []), [brain, trends, gelombang, nicheId]);
  // 🪝 v19.10: HOOK ENGINE — analisis 3 detik pertama storyboard
  const hook = useMemo(() => analisaHook(board), [board]);
  // 🛰️ v19.6: RADAR KOMPETITOR RSS — pantau upload channel lawan (gratis, tanpa kuota API)
  const KOMP_KEY = "verve_kompetitor_v1";
  const [kompCh, setKompCh] = useState<KompChannel[]>(() => {
    try { const j = JSON.parse(localStorage.getItem(KOMP_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; }
  });
  const [kompUrl, setKompUrl] = useState("");
  const [kompBusy, setKompBusy] = useState(false);
  const [kompMsg, setKompMsg] = useState("");
  const [kompFeeds, setKompFeeds] = useState<KompFeed[] | null>(null);
  const [kompScanAt, setKompScanAt] = useState<number | null>(null);
  // 🛰️ v19.7: koleksi judul lawan (untuk analisis pola) + hasil banding judul
  const [kompTitles, setKompTitles] = useState<KompTitleRow[]>(() => {
    try { const j = JSON.parse(localStorage.getItem(KOMP_TITLES_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; }
  });
  const [kompPola, setKompPola] = useState<PolaKompetitor | null>(null);
  const [banding, setBanding] = useState<HasilBanding | null>(null);
  const [serang, setSerang] = useState<HasilSerang[] | null>(null);
  const [serangBatch, setSerangBatch] = useState(0);
  function simpanKomp(next: KompChannel[]) {
    setKompCh(next);
    try { localStorage.setItem(KOMP_KEY, JSON.stringify(next)); } catch { /* penuh? abaikan */ }
  }
  async function tambahKomp() {
    const input = kompUrl.trim();
    if (!input) { flash("Tempel link channel YouTube dulu bro"); return; }
    if (kompBusy) return;
    setKompBusy(true); setKompMsg("");
    try {
      let id = extractChannelId(input) || "";
      let name = "";
      if (!id) {
        // 🧭 v19.8: kalau ini link video, bilang dulu — sistem akan cari channel pemiliknya
        if (/(watch\?v=|youtu\.be\/|shorts\/)/i.test(input)) {
          setKompMsg("🔎 Itu link video — saya cari channel pemiliknya dari halamannya…");
        }
        const r = await fetch("/api/competitor-rss", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: input }) });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal resolve");
        id = j.channelId; name = j.name || "";
      }
      if (kompCh.some((k) => k.id === id)) { setKompMsg("⚠️ Channel ini sudah dipantau."); return; }
      const next = [...kompCh, { id, name, addedAt: Date.now() }];
      simpanKomp(next);
      setKompUrl("");
      flash(`🛰️ "${name || id}" masuk radar!`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Jujur & ramah: "fetch failed" bawaan browser/server dibungkus pesan jelas
      const msg = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|Failed to fetch/i.test(raw)
        ? "⚠️ Koneksi ke YouTube gagal (jaringan/diblokir). Coba lagi nanti, atau pakai link youtube.com/channel/UC... langsung."
        : `⚠️ ${raw}`;
      setKompMsg(msg);
    } finally {
      setKompBusy(false);
    }
  }
  async function scanKomp() {
    if (!kompCh.length) { setKompMsg("Tambah minimal 1 channel dulu bro."); return; }
    if (kompBusy) return;
    setKompBusy(true); setKompMsg("");
    try {
      const ids = kompCh.map((k) => k.id).join("|");
      const r = await fetch(`/api/competitor-rss?ids=${encodeURIComponent(ids)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal scan");
      const feeds: KompFeed[] = j.feeds || [];
      setKompFeeds(feeds);
      setKompScanAt(Date.now());
      // 🛰️ v19.7: kumpulkan judul lawan & deteksi upload BARU sejak scan terakhir
      let alertBaru = 0;
      try {
        const seen = JSON.parse(localStorage.getItem(KOMP_SEEN_KEY) || "{}");
        const baru = deteksiUploadBaru(feeds, seen);
        alertBaru = baru.length;
        localStorage.setItem(KOMP_SEEN_KEY, JSON.stringify(tandaiTerlihat(feeds, seen)));
        const all = kumpulkanJudul(feeds, kompTitles);
        setKompTitles(all);
        try { localStorage.setItem(KOMP_TITLES_KEY, JSON.stringify(all)); } catch { /* penuh? abaikan */ }
        setKompPola(analisisPolaKompetitor(all));
      } catch { /* jangan gagalkan scan */ }
      const msg = ringkasanScan(feeds, brain);
      setKompMsg(alertBaru ? `🛰️ ${alertBaru} upload BARU dari kompetitor! ${msg.split("\n")[0]}` : msg.split("\n")[0]);
      if (msg.includes("⚠️")) flash("🛰️ Ada upload kompetitor mirip judulmu!");
    } catch (e) {
      setKompMsg(`⚠️ ${e instanceof Error ? e.message : "Gagal scan"}`);
    } finally {
      setKompBusy(false);
    }
  }
  /* ⚖️ v19.7: bandingkan judulmu vs judul lawan pakai mesin otak */
  function bandingDenganLawan(lawanTitle: string) {
    const judulSaya = selTitle || (brain.results?.[0]?.title) || topic.trim() || "";
    if (!judulSaya) { setKompMsg("Kunci judul dulu di langkah 4 (atau isi topik) biar bisa dibandingkan."); return; }
    // 🐛 FIX v19.8.5: dulu (lawan, judulSaya) — kebalik dari label UI (KIRI=judulmu).
    // Sekarang a = JUDULMU, b = LAWAN → skor & verdict jadi benar.
    setBanding(bandingkanJudul(judulSaya, lawanTitle, brain));
    setSerang(null);
    setSerangBatch(0);
  }
  /* ⚔️ v19.8.3/19.8.4: SERANG BALIK — judul penyerang berbasis DATA judul lawan */
  function serangBalik() {
    const lawan = banding?.b.title;
    if (!lawan) { setKompMsg("Klik ⚖️ di salah satu judul lawan dulu ya bro."); return; }
    const kw = topic.trim() || selTitle || (brain.results?.[0]?.title || "");
    // 🧠 v19.8.4: angka diambil dari DATA judul lawan (bukan template tebakan)
    const angka = angkaPopulerDariJudul(kompTitles);
    const hasil = serangBalikJudul(lawan, kw, brain, 3, angka, 0, nicheId);
    setSerang(hasil);
    setSerangBatch(0);
    flash(angka.length ? `⚔️ Saran jadi — angka ${angka.join(", ")} diambil dari judul lawan!` : "⚔️ Saran judul penyerang jadi — pilih yang paling kuat!");
  }
  /* 🔁 v19.8.6: GENERATE LAGI — varian baru sampai nemu yang menang besar */
  function serangLagi() {
    const lawan = banding?.b.title;
    if (!lawan) { setKompMsg("Klik ⚖️ di salah satu judul lawan dulu ya bro."); return; }
    const kw = topic.trim() || selTitle || (brain.results?.[0]?.title || "");
    const angka = angkaPopulerDariJudul(kompTitles);
    const nextBatch = serangBatch + 1;
    const hasil = serangBalikJudul(lawan, kw, brain, 3, angka, nextBatch, nicheId);
    // Gabung dengan hasil lama (jangan dobel), urut skor, tunjuk yang menang besar
    const lama = serang || [];
    const gabung = [...lama, ...hasil].filter(
      (x, i, arr) => arr.findIndex((y) => y.saran.a.title === x.saran.a.title) === i
    );
    const urut = gabung.sort((x, y) => y.saran.a.skor - x.saran.a.skor);
    setSerang(urut);
    setSerangBatch(nextBatch);
    const menangBesar = urut.find((x) => x.menang && x.selisih >= 3);
    if (menangBesar) flash(`🏆 Nemu yang MENANG BESAR: "${menangBesar.saran.a.title}" (+${menangBesar.selisih} poin)!`);
    else if (urut.some((x) => x.menang)) flash(`⚔️ Varian baru masuk — masih ada yang menang tipis, coba generate lagi buat cari yang besar!`);
    else flash(`🔁 Varian baru masuk — belum ada yang menang, generate lagi?`);
  }
  function pakaiJudulSerang(t: string) {
    setSelTitle(t);
    saveBrain((b) => ({
      ...b,
      results: [{ title: t, time: Date.now() }, ...b.results.filter((r) => normTitleKey(r.title) !== normTitleKey(t))].slice(0, 200),
    }));
    flash("⚔️ Judul serangan dipakai — tercatat di otak 🧠");
  }

  // 🧠 v13.1: KABEL TULIS otak — simpan ke HP (localStorage) + brankas Supabase (gagal brankas = abaikan, HP tetap jalan)
  function saveBrain(up: (b: BrainMemory) => BrainMemory) {
    setBrain((prev) => {
      const next = up(prev);
      persistBrain(next);
      return next;
    });
  }

  // 🧠 v13.1: hidrasi dari brankas (kalau sudah ada), gabung dengan memori HP — terbaru menang
  useEffect(() => {
    let live = true;
    fetch("/api/hcnsec/brain").then((r) => r.json()).then((j) => {
      if (!live || !j.ok || !j.brain) return;
      setBrain((prev) => {
        const merged = mergeBrain(prev, j.brain as BrainMemory);
        try { localStorage.setItem(BRAIN_KEY, JSON.stringify(merged)); } catch { /* abaikan */ }
        return merged;
      });
    }).catch(() => { /* brankas tak ada -> pakai memori HP saja */ });
    return () => { live = false; };
  }, []);

  // 🔄 v19.0: AUTO-SYNC OTAK — sekali sehari otak menarik data performa dari YouTube
  // (kalau sudah terhubung) tanpa diminta. Ini "murid yang baca buku sendiri tiap hari".
  useEffect(() => {
    try {
      const last = lastSyncTime() || 0;
      if (Date.now() - last < 24 * 3600 * 1000) return; // sudah sync < 24 jam lalu
    } catch { /* abaikan */ }
    fetch("/api/youtube/status").then((r) => r.json()).then((st) => {
      if (!st?.configured || !st?.connected) return; // belum bisa — nanti coba lagi besok
      void syncBrainFromYT(true);
    }).catch(() => { /* offline — nanti coba lagi */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔔 v19.5: NOTIFIKASI HARIAN OTAK — sekali sehari, kalau diaktifkan & diizinkan
  useEffect(() => {
    setNotifOn(notifEnabled());
    if (!notifEnabled() || !notifSupported()) return;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;
    void cekNotifikasiHarian(brain).then((r) => {
      if (r.ok) flash("🔔 Laporan otak harian terkirim!");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // 🎵 v19.87: draft lama bisa punya durasi dari header yang bohong (17:23 vs
      // isi 8:03) dan blob preview mati setelah reload → ukur ulang + buat WAV
      // preview baru (tanpa motong) biar player & timeline ikut durasi asli.
      const rs = j.song;
      if (rs?.url) {
        void (async () => {
          try {
            const { ukurDanPreviewWav } = await import("@/lib/gabung-audio");
            const r = await ukurDanPreviewWav(rs.url, (u: string) => `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`);
            if (r && r.dur > 0.5) setSong((s) => (s && s.url === rs.url ? { ...s, duration: r.dur, audio: r.previewUrl } : s));
          } catch { /* biarkan */ }
        })();
      }
      setCharLock(j.charLock || ""); // 🔒 v10.0
      setModelPinned(j.modelPinned || "");
      setSunoModel(j.sunoModel && SUNO_MODELS.some((m) => m.id === j.sunoModel) ? (j.sunoModel as string) : "V4_5PLUS"); // 🎚 v10.3
      setSEra(j.sEra && SUNO_ERAS.some((e) => e.id === j.sEra) ? (j.sEra as string) : "");
      setSTempo(j.sTempo && SUNO_TEMPOS.some((t) => t.id === j.sTempo) ? (j.sTempo as string) : "");
      setSInstr(Array.isArray(j.sInstr) ? (j.sInstr as string[]).filter((x) => typeof x === "string" && SUNO_INSTRS.includes(x)) : []);
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
      const payload: LahanState = { step, topic, angles: angles.slice(0, 40), selKeyword, angle: slimAngle, researchAt, selTitle, naskah, board: slimBoard, lyrics, lyricMode, mStyle, genre, mood, vocal, task, song, charLock, modelPinned, sunoModel, sEra, sTempo, sInstr };
      localStorage.setItem(LAHAN_KEY, JSON.stringify(payload));
    };
    try {
      save(true);
    } catch {
      try { save(false); } catch { /* storage penuh total — sesi jalan terus */ }
    }
  }, [step, topic, angles, selKeyword, angle, researchAt, selTitle, naskah, board, lyrics, lyricMode, mStyle, genre, mood, vocal, task, song, sunoModel, sEra, sTempo, sInstr]);

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

  /* 🛡 v10.7 BANGUN SIGAP: Android menidurkan semua timer saat layar mati / tab di background —
     jangan andalkan antrean tick. Begitu aplikasi tampil lagi & masih memantau → restart rantai
     (cek pertama jalan seketika). Kalau user sengaja "Batal pantau" (polling=false), kita diam hormat. */
  useEffect(() => {
    const awake = () => {
      if (document.visibilityState === "visible" && polling && task && !song) startPolling(task, 1);
    };
    document.addEventListener("visibilitychange", awake);
    window.addEventListener("focus", awake);
    return () => {
      document.removeEventListener("visibilitychange", awake);
      window.removeEventListener("focus", awake);
    };
  }, [polling, task, song]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ticker detik berjalan selama polling */
  useEffect(() => {
    if (!polling || !task) return;
    const it = setInterval(() => setPollUi((p) => ({ ...p, elapsed: Math.round((Date.now() - task.ts) / 1000) })), 1000);
    return () => clearInterval(it);
  }, [polling, task]);

  /* ---------- intent audiens (v19.20: ikut niche pilihan; custom = deteksi dari topik) ---------- */
  const intentId = nicheId === "custom"
    ? (topic.trim() ? detectAudienceIntent(topic) : "general")
    : (topic.trim() ? (nicheId === "story_song" ? detectAudienceIntent(topic) : nicheId) : nicheId);
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
  const doneScenes = useMemo(() => (board ? board.scenes.filter((s) => (s.status === "done" && !!s.url) || (s.vidOn && !!s.vid)) : []), [board]); // 🎞️ v13.11: adegan video stok ikut sah
  const totalDur = song?.duration && song.duration > 0 ? Math.round(song.duration) : Math.max(1, doneScenes.length) * 6;
  // 🛡 v11.2: sumber audio pratinjau — langsung dulu, otomatis pindah ke proxy kalau link langsung gagal
  const pvSrc = song ? (song.audio || (pvProxy ? `/api/hcnsec/proxy-audio?url=${encodeURIComponent(song.url)}` : song.url)) : "";
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
      const extra = nicheId === "custom" ? [] : (/cerita jadi lagu/i.test(topic) ? [] : [`${topic.trim()} | ${nicheAI}`]);
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
        nicheNote: nicheAI || "topik",
        suggest: angles,
      });
      setAngle(a);
      setResearchAt(j.fetchedAt || new Date().toISOString());
      setSelTitle("");
      saveBrain((b) => ({ ...b, researches: [{ topic: topic.trim(), kw: selKeyword, time: Date.now() }, ...(b.researches || [])].slice(0, 25) }));
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
    // 🧠 v13.1: CATAT judul terkunci ke otak (dedupe, terbaru di depan, maks 200)
    // -> memoryPenalty otomatis hidup (judul kembar dihukum) & jadi riwayat buat lapor performa
    saveBrain((b) => ({
      ...b,
      results: [{ title: t, time: Date.now() }, ...b.results.filter((r) => normTitleKey(r.title) !== normTitleKey(t))].slice(0, 200),
    }));
    flash("★ Judul dikunci — tercatat di otak 🧠");
  }

  /* 🧠 v13.1: LAPOR PERFORMa — angka asli YouTube Studio menghidupkan learningBoostV2 (Bayes CTR + hukuman judul gagal) */
  function savePerf() {
    if (!perfSel) { flash("Pilih judulnya dulu bro"); return; }
    const num = (s: string): number | "" => {
      const t = s.trim().replace(",", ".");
      if (!t) return "";
      const v = +t;
      return isFinite(v) ? v : "";
    };
    const ctr = num(perfCtr), imp = num(perfImp), avd = num(perfAvd);
    const nt = normTitleKey(perfSel);
    saveBrain((b) => ({
      ...b,
      results: b.results.map((r) =>
        normTitleKey(r.title) === nt
          ? { title: r.title, ctr, impressions: imp, avdSec: avd, time: r.time || Date.now() }
          : r
      ),
    }));
    flash("📊 Tersimpan — otak makin paham pola judulmu!");
  }

  /* 🔄 v19.2 FEEDBACK LOOP OTOMATIS — otak "makan" data performa asli dari YouTube.
     Logika sync dipakai bersama (Lahan + Dokter Channel) lewat lib/brain/auto-sync. */
  async function syncBrainFromYT(auto = false) {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const r = await syncYtBrain(brain);
      if (!r.ok) { setSyncMsg(r.msg); return; }
      saveBrain((b) => ({ ...b, results: r.merged }));
      markSyncDone();
      setSyncLast(lastSyncTime());
      setSyncMsg(r.msg);
      if (!auto) flash(`🧠 Feedback loop ON — otak belajar dari ${r.merged.length} video asli!`);
    } finally {
      setSyncBusy(false);
    }
  }

  /* 🎯 v19.1 TITLE GURU — otak menulis judul baru dari pola yang TERBUKTI tembus
     di channelmu (hasil analisis brain), disaring: jangan mirip judul gagal,
     jangan kembar dengan yang sudah dipakai. Offline, gratis, instan. */
  function mintaSaranGuru() {
    const kw = selKeyword || topic.trim() || "";
    if (!kw) { setGuruMsg("Pilih keyword/sudut dulu di langkah 2 biar sarannya nyambung ke topikmu."); return; }
    const list = suggestTitlesFromBrain(kw, brain, 4, nicheId);
    if (!list.length) { setGuruMsg("Semua pola yang dicoba mirip judul yang pernah gagal — coba keyword lain atau sync dulu biar otak punya data baru."); return; }
    setGuru(list);
    setGuruMsg("");
    flash("🎯 Saran judul dari pola yang terbukti!");
  }
  function pakaiSaranGuru(t: string) {
    setSelTitle(t);
    saveBrain((b) => ({
      ...b,
      results: [{ title: t, time: Date.now() }, ...b.results.filter((r) => normTitleKey(r.title) !== normTitleKey(t))].slice(0, 200),
    }));
    flash("🎯 Judul dipakai — tercatat di otak 🧠");
  }

  /* 🔮 v19.3 DEEP DIVE: prediksi CTR sebelum tayang + salin laporan otak */
  function cekPrediksi() {
    if (!predTitle.trim()) { setPredRes(null); flash("Ketik judulnya dulu bro"); return; }
    setPredRes(predictCtrBayes(predTitle, brain));
  }
  function salinLaporanOtak() {
    void navigator.clipboard?.writeText(deep.report).then(() => flash("📋 Laporan otak tersalin — siap dibagikan!"));
  }

  /* 🖼️ v19.8.8: buka Thumb Studio + tandai "dari Lahan" biar auto-tarik data */
  function bukaThumb() {
    try { localStorage.setItem("verve_thumb_dari_lahan_v1", "1"); } catch { /* abaikan */ }
    gotoThumb?.();
  }
  /* 🎯 v19.8.8: pakai judul kompetitor sebagai topik baru (pilih arah: lawan vs niche) */
  function pakaiJudulLawan(t: string) {
    setTopic(t);
    setSelTitle("");
    setAngle(null);
    flash(`🎯 Judul lawan jadi topik: "${t.slice(0, 40)}..." — lanjut Cari Sudut 🔍`);
  }
  /* 🪝 v19.10: upgrade adegan 1 biar hook-nya nancap (close-up emosi) */
  function upgradeAdeganSatu() {
    setBoard((b) => b && ({
      ...b,
      scenes: b.scenes.map((sc, i) => (i === 0 ? { ...sc, visual_prompt: upgradeAdegan1(sc), status: sc.status === "done" ? "idle" : sc.status, url: undefined } : sc)),
    }));
    flash("🪝 Adegan 1 di-upgrade (close-up emosi) — tekan ↻ ulangi adegan 1 buat gambar baru");
  }

  /* 🔥 v19.4/19.5 TREND RADAR — topik hangat Google Trends (multi-negara) */
  async function muatTrend(geo?: string) {
    const g = geo || trendGeo;
    if (trendBusy) return;
    setTrendBusy(true); setTrendMsg("");
    try {
      const r = await fetch(`/api/trends?geo=${g}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal ambil trend");
      setTrends(j.items || []);
      setTrendMsg(j.note || "");
      // 🌊 v19.9: bandingkan dengan snapshot kemarin → deteksi gelombang naik/baru
      const kemarin = ambilSnapshotTrend();
      setGelombang(bandingkanGelombang(j.items || [], kemarin));
      simpanSnapshotTrend(j.items || []);
      const naik = bandingkanGelombang(j.items || [], kemarin).filter((g) => g.status === "naik" || g.status === "baru").length;
      if (naik > 0) flash(`🌊 ${naik} gelombang baru/naik terdeteksi!`);
    } catch (e) {
      setTrendMsg(`⚠️ ${e instanceof Error ? e.message : "Gagal ambil trend"} — coba lagi nanti.`);
    } finally {
      setTrendBusy(false);
    }
  }
  function gantiGeo(g: string) {
    if (g === trendGeo) return;
    setTrendGeo(g); setTrends(null); setThumbTrend(null); setTrendMsg("");
    void muatTrend(g);
  }
  function pakaiTrend(t: string) {
    setTopic(t);
    flash(`🔥 Trend dipakai: "${t}" — gas cari sudutnya!`);
  }
  function lihatThumbTrend(t: TrendItem) {
    const saran = saranThumbnail(t.title, skorTrend(t.title));
    setThumbTrend((prev) => (prev?.title === t.title ? null : { title: t.title, saran }));
  }
  /* 🔔 v19.5 NOTIFIKASI HARIAN */
  async function toggleNotif() {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      if (notifOn) {
        setNotifEnabled(false); setNotifOn(false);
        setNotifMsg("🔕 Notifikasi harian dimatikan.");
        return;
      }
      const granted = await requestNotifPermission();
      if (!granted) { setNotifMsg("⚠️ Izin notifikasi ditolak browser — aktifkan lewat pengaturan browser."); return; }
      setNotifEnabled(true); setNotifOn(true);
      const r = await cekNotifikasiHarian(brain);
      setNotifMsg(r.ok ? "🔔 Notifikasi pertama terkirim — cek layarmu!" : r.msg);
    } finally {
      setNotifBusy(false);
    }
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
          niche: nicheDef.label + (nicheId === "story_song" ? " / lagu emosional" : ""),
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
          niche: nicheDef.label + (nicheId === "story_song" ? " / lagu emosional" : ""),
          slides: sceneCount,
          naskah: (naskah || "").slice(0, 1500), // 🎬 v13.2: naskah jadi SUMBER ALUR storyboard — adegan berantai seperti film
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
      // 🧯 v13.11.1 DETEKTOR KEMBAR: Sutradara ngulang adegan (desc+lirik nyaris sama) → lapor jujur & suruh kocok ulang
      const kunci: string[] = [];
      const kembar: number[] = [];
      scenes.forEach((s2) => {
        const k = `${s2.scene_desc}||${s2.lyric_line}`.toLowerCase().replace(/\s+/g, " ").trim();
        if (kunci.includes(k)) kembar.push(s2.scene); else kunci.push(k);
      });
      if (kembar.length) flash(`⚠️ Adegan ${kembar.join(", ")} isinya KEMBAR dengan adegan sebelumnya — tekan "↻ Susun ulang" ya bro, adegan wajib beda-beda!`);
      else flash(`🎬 ${scenes.length} adegan tersusun — tinggal digambar`);
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
  const ensureLockCache = ensureLockCacheRef; // 🔒 v10.0

  async function genScene(i: number, sc: Scene, extra?: string) { // 🎬 v11.0: arahan Sutradara (opsional)
    setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, status: "loading", err: undefined } : s)) }));
    let lastMsg = "gagal, coba lagi";
    for (let attempt = 1; attempt <= 3; attempt++) { // 🎬 v13.2: ANTRE OTOMATIS — server penuh/channel habis = sabar tunggu & coba lagi, bukan langsung menyerah
      const ac = new AbortController(); const watchdog = setTimeout(() => ac.abort(), 55000); // v10.1: jam pengaman TIAP percobaan
      try {
        ensureLockCache.current = await ensureCharLock(); // 🔒 v10.0: bekukan dulu — sumber tunggal kebenaran wajah
        const r = await fetch("/api/hcnsec/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal, // v10.1: terhubung ke jam pengaman
          body: JSON.stringify({
            _storyScene: {
              // lock aktif → adegan MURNI (identitas HANYA dari _charLock, tanpa dobel injeksi); lock gagal → jalan lama
              visual_prompt: (ensureLockCache.current || charLock ? sc.visual_prompt : injectCharacter(sc.visual_prompt, chars, GAYA_VISUAL[gaya])) + (extra ? `, ${extra}` : ""), // 🎬 v11.0: arahan regen dari Sutradara ikut dibawa
              scene_desc: sc.scene_desc,
              mood: sc.mood,
            },
            _charLock: ensureLockCache.current || charLock || undefined,
            _modelFirst: modelPinned || undefined,
            _mood: sc.mood,
            style: GAYA_TO_STYLE[gaya] || "cinematic",
            title: selTitle,
            keyword: selKeyword,
            niche: nicheAI || nicheDef.label,
          }),
        });
        clearTimeout(watchdog);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (!modelPinned && j.model) setModelPinned(String(j.model)); // 🔒 v10.0: pin model yang BERHASIL
        const url = await shrinkImage(j.url);
        setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "done", url } : s)) }));
        return true;
      } catch (e) {
        clearTimeout(watchdog);
        let msg = e instanceof Error ? e.message : String(e);
        const busySrv = /concurrency|available channel|429|rate limit|overload|too many|antri/i.test(msg); // 🎬 v13.2: deteksi "antrian server penuh"
        if (/failed to fetch|abort/i.test(msg)) msg = "⏱ Koneksi kepotong (proses kelamaan) — provider gambar lagi lambat. Coba lagi adegan ini."; // v10.1: pesan manusiawi, bukan bahasa mesin
        lastMsg = busySrv
          ? "⏳ Antrian server gambar penuh (sudah 3x coba otomatis). Tunggu 1-2 menit lalu tekan lagi — bukan salah koneksimu."
          : msg;
        if (busySrv && attempt < 3) {
          setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "loading", err: `⏳ Server penuh — ngantri otomatis (percobaan ${attempt + 1}/3)...` } : s)) }));
          await new Promise((r) => setTimeout(r, 15000 * attempt)); // makin sabar: 15 detik, lalu 30 detik
          continue;
        }
        setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "error", err: lastMsg } : s)) }));
        return false;
      }
    }
    setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, jj) => (jj === i ? { ...s, status: "error", err: lastMsg } : s)) }));
    return false;
  }

  async function genAllScenes() {
    if (!board || genAllBusy) return;
    setGenAllBusy(true);
    let ok = 0;
    const targets = board.scenes.map((sc, i) => ({ sc, i })).filter(({ sc }) => !(sc.status === "done" || (sc.vidOn && sc.vid)));
    // ⚡ SWARM PARALLEL WORKERS: eksekusi 2 adegan serentak agar 2x lebih cepat & bebas antrean panjang
    for (let j = 0; j < targets.length; j += 2) {
      const batch = targets.slice(j, j + 2);
      const res = await Promise.all(batch.map(({ i, sc }) => genScene(i, sc)));
      ok += res.filter(Boolean).length;
      if (j + 2 < targets.length) await new Promise((r) => setTimeout(r, 400));
    }
    setGenAllBusy(false);
    flash(ok === board.scenes.length ? `✅ Swarm Paralel: ${ok}/${board.scenes.length} adegan siap!` : `⚠️ ${ok}/${board.scenes.length} jadi — ulangi yang gagal`);
  }

  function updateScene(i: number, patch: Partial<Scene>) {
    setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }

  /* 🎞️ v13.11 LEMARI VIDEO — otomatis sarankan + BISA diganti manual (keputusan final di tangan bro) */
  function bukaVidSheet(i: number) {
    if (!board) return;
    const sc = board.scenes[i];
    setVidSheet(i); setVidErr(""); setVidRes([]); setVidNote("");
    const q0 = kueriDariScene(sc.visual_prompt, sc.scene_desc, temaDariKarakter(chars), sc.mood); // 🎬 v13.11.2 sinematik
    setVidQ(q0);
    void jalankanCariVid(q0);
  }
  async function jalankanCariVid(q: string) {
    setVidBusy(true); setVidErr(""); setVidNote("");
    const r = await cariStokVideoSmart(q, rasaIndo); // 🇮🇩 v13.11.1: Nusantara dulu, habis → dilebarkan (dilapor)
    setVidBusy(false);
    if (!r.ok) { setVidErr(r.err); setVidRes([]); return; }
    setVidRes(r.hasil);
    if (r.lebar) setVidNote("🇮🇩 Stok rasa Indonesia habis buat kata itu — dilebarkan ke gudang dunia. Coba kata lain kalau mau tetap Nusantara.");
    if (!r.hasil.length) setVidErr("Gudang kosong buat kata itu — coba kata lain (Inggris) ya bro.");
  }
  function pilihVid(i: number | null, v: VidPick) {
    if (i == null || !board) return;
    updateScene(i, { vid: v, vidOn: true });
    setVidSheet(null);
    flash(`🎞️ Adegan ${i + 1} pakai video ${v.dur} detik dari gudang (bebas pakai)`);
  }
  async function saranVidSemua() {
    if (!board || vidAllBusy) return;
    setVidAllBusy(true);
    const tema = temaDariKarakter(chars); // 🎬 v13.11.2: jangkar ibu&anak di semua kueri
    let ok = 0; let lebar = 0;
    const dipakai = new Set<number>(); // 🧯 v13.11.1 ANTI-KEMBAR: satu klip hanya boleh tampil SEKALI se-film
    board.scenes.forEach((sc) => { if (sc.vidOn && sc.vid) dipakai.add(sc.vid.id); });
    // ⚡ SWARM PARALLEL STOCK VIDEO SEARCH: cari dan pilih klip video stok serentak dalam sekejap
    const targetIdxs = board.scenes.map((sc, i) => ({ sc, i })).filter(({ sc }) => !(sc.vidOn && sc.vid));
    const searchResults = await Promise.all(
      targetIdxs.map(({ sc, i }) => {
        const gaya = GAYA_EN[i % GAYA_EN.length];
        return cariStokVideoSmart(kueriDariScene(sc.visual_prompt, sc.scene_desc, tema, sc.mood, gaya), rasaIndo);
      })
    );
    targetIdxs.forEach(({ sc }, idx) => {
      const r = searchResults[idx];
      if (r.ok && r.hasil.length) {
        if (r.lebar) lebar++;
        const best = pilihKlipBervariasi(r.hasil, perScene, dipakai);
        if (best) {
          dipakai.add(best.id);
          sc.vid = best;
          sc.vidOn = true;
          ok++;
        }
      }
    });
    setBoard((b) => b && ({ ...b, scenes: [...board.scenes] }));
    setVidAllBusy(false);
    flash((ok === board.scenes.length
      ? `🎞️ Swarm Paralel: ${ok}/${board.scenes.length} adegan kebagian video BEDA-BEDA dalam sekejap!`
      : `⚠️ ${ok}/${board.scenes.length} adegan dapat video — yang kosong cari manual dari kartunya`)
      + (lebar ? ` · 🇮🇩 ${lebar} adegan dilebarkan (stok Nusantara tipis kata itu)` : ""));
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
      // 🧠 v19.38: bawa key Dompet Bansos (OpenAI-compatible) → lirik jalan tanpa key server
      const hdrBansos: Record<string, string> = {};
      try {
        const bc = JSON.parse(localStorage.getItem("verve_bansos_chat_v1") || "null");
        if (bc && bc.base && bc.key) {
          hdrBansos["x-bansos-chat-base"] = String(bc.base);
          hdrBansos["x-bansos-chat-key"] = String(bc.key);
          if (bc.model) hdrBansos["x-bansos-chat-model"] = String(bc.model);
        }
      } catch { /* abaikan */ }
      const r = await fetch("/api/hcnsec/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrBansos },
        body: JSON.stringify({ title: selTitle, keyword: selKeyword, niche: nicheDef.label + (nicheId === "story_song" ? " / lagu emosional" : ""), genre, mood }),
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

  // 🎵 v19.77: JANGAN gabung 2 variasi Suno. Satu generate = satu lagu (versi pertama).
  async function laguUtuh(pd: any): Promise<{ url: string; notice?: string }> {
    const { pilihKlipDariHasil } = await import("@/lib/suno-normalize");
    const clips = pilihKlipDariHasil(pd);
    if (!clips.length) return { url: "" };
    const notice = clips.length > 1
      ? `🎵 Dipakai versi A (1 lagu). Provider kasih ${clips.length} variasi terpisah — tidak digabung jadi dua nada.`
      : undefined;
    return { url: clips[0].url, notice };
  }

  async function checkOnce(id: string): Promise<"done" | "pending"> {
    // 🛡 v10.6 ANTI-BEKU: tiap cek punya tenggat 40 dtk — sinyal 4G nyangkut tidak
    // lagi menggantung monitor tanpa akhir (kasus beku 10+ mnt di "Cek #1").
    const ac = new AbortController();
    const wd = setTimeout(() => ac.abort(), 40000);
    const r = await fetch(`/api/hcnsec/music?id=${encodeURIComponent(id)}`, { headers: sunoHeaders(), cache: "no-store", signal: ac.signal })
      .finally(() => clearTimeout(wd));
    const pd = await r.json().catch(() => ({}));
    const url = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url || (pd.audio_urls?.length ? pd.audio_urls[0] : "");
    if (url) {
      const u = await laguUtuh(pd);
      if (u.notice) setTtsMsg(u.notice);
      finishSong({ url: u.url || url, title: pd.title || selTitle || (songNiche ? "Lagu AI" : "Audio AI"), duration: pd.duration, image: pd.image_url });
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
    // 🎵 v19.87: ukur durasi REAL dari isi file + buat WAV preview (tanpa motong)
    // — header provider bisa bohong (klaim 17:23 padahal isi 8:03). Player &
    // angka durasi konsisten dengan isi lagu asli.
    void (async () => {
      try {
        const { ukurDanPreviewWav } = await import("@/lib/gabung-audio");
        const r = await ukurDanPreviewWav(res.url, (u: string) => `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`);
        if (r && r.dur > 0.5) setSong((s) => (s && s.url === res.url ? { ...s, duration: r.dur, audio: r.previewUrl } : s));
      } catch { /* biarkan durasi dari provider */ }
    })();
  }

  function startPolling(t: SongTask, round = 1, base = 0) {
    clearPollTimer();
    pollStop.current = false;
    setPolling(true);
    setErr(null);
    setPollUi({ attempt: base, elapsed: Math.round((Date.now() - t.ts) / 1000), last: "antre" });
    let idx = base; // 🛡 v10.7: nomor cek terusan antar-putaran — tidak ada lagi "Cek #0" yang bikin panik
    let checks = 0; // 🛡 v10.7: tiap rantai WAJIB minimal 1 cek NYATA ke provider (anti "drama tanpa cek")
    let fails = 0; // 🛡 v10.6: hitung cek gagal karena jaringan (bukan fatal provider)
    const limitMs = round === 1 ? 6 * 60 * 1000 : 9 * 60 * 1000; // sabar 6 mnt, auto-lanjut s.d. 9 mnt
    const overLimit = (attemptNow: number, elapsedNow: number): boolean => {
      if (elapsedNow <= limitMs) return false;
      if (round === 1) {
        // AUTO-LANJUT putaran 2 (cuma polling — tidak membakar kredit generate baru; nomor cek diteruskan)
        setPollUi({ attempt: attemptNow, elapsed: Math.round(elapsedNow / 1000), last: "auto-lanjut putaran 2" });
        pollTimer.current = setTimeout(() => { if (!pollStop.current) startPolling(t, 2, idx); }, 20000);
      } else {
        setPolling(false);
        setErr({ code: "suno_sibuk", msg: "Provider masih sibuk >9 menit. Task tersimpan aman — lagu sering jadi di belakang; tap 🔍 Cek manual sebentar lagi." });
      }
      return true;
    };
    const tick = async () => {
      if (pollStop.current) return;
      // 🛡 v10.7: batas sabar ditegakkan ANTAR cek (v10.6), TAPI cek PERTAMA tiap rantai SELALU
      // benar-benar menanya provider — task dari draf / HP habis standby tidak boleh "didramatisir"
      // 0 cek (regresi v10.6 yang ketahuan dari screenshot user: 9:32 jalan, "Cek #0").
      if (checks > 0 && overLimit(idx, Date.now() - t.ts)) return;
      try {
        const st = await checkOnce(t.id);
        checks++;
        if (st === "done") return;
        fails = 0;
      } catch (e) {
        checks++;
        const msg = e instanceof Error ? e.message : String(e);
        // Error FATAL provider (quota habis, generate gagal) = berhenti seperti dulu.
        // Error SESAAT (jaringan putus / cek kepotong tenggat) = lanjut pantau, jangan bunuh monitor.
        if (!/fetch|abort|network|load failed|timed?\s?out|kepotong|koneksi/i.test(msg)) {
          setPolling(false);
          setErr({ code: "suno", msg });
          return;
        }
        fails++;
      }
      idx++;
      const elapsed = Date.now() - t.ts;
      setPollUi({ attempt: idx, elapsed: Math.round(elapsed / 1000), last: fails ? `cek gagal×${fails} (jaringan) — tetap dipantau` : "pending" });
      if (overLimit(idx, elapsed)) return;
      pollTimer.current = setTimeout(tick, POLL_DELTAS[Math.min(idx, POLL_DELTAS.length - 1)] * 1000);
    };
    pollTimer.current = setTimeout(tick, 0); // 🛡 v10.7: cek pertama SEGERA — HP baru bangun = kabar instan
  }

  function cancelPolling() {
    pollStop.current = true;
    clearPollTimer();
    setPolling(false);
  }

  // ================= 🎬 v11.0 SUTRADARA CHAT =================
  function pushChat(me: "me" | "ai" | "sys", text: string) {
    setChatLog((l) => [...l.slice(-40), { me, text }]);
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog, chatBusy]);

  function snapNow(): DirSnap {
    return { board, lyrics, mStyle, selTitle, sEra, sTempo, sInstr, vocal, sunoModel };
  }

  /** Perintah GRATIS → langsung jalan + sediakan ↩ Urungkan (satu langkah). */
  function applyFreeOps(ops: DirOp[]) {
    if (!ops.length) return;
    setUndoSnap(snapNow());
    const done: string[] = [];
    for (const o of ops) {
      if (o.op === "set_title" && o.title) { setSelTitle(o.title); done.push(`judul → "${o.title}"`); }
      else if (o.op === "set_visual_style") {
        setBoard((b) => b && ({ ...b, style_visual: o.style_visual || b.style_visual, color_grade: o.color_grade || b.color_grade }));
        done.push("gaya visual diubah (berlaku ke regen berikutnya)");
      } else if (o.op === "edit_scene_prompt" && o.scene && o.visual_en) {
        const i = o.scene - 1;
        if (board?.scenes[i]) {
          setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, visual_prompt: o.visual_en!, status: "idle", url: undefined } : s)) }));
          done.push(`prompt adegan ${o.scene} ditulis ulang (gambar lama dilepas supaya tidak basi)`);
        }
      } else if (o.op === "edit_scene_line" && o.scene && o.lyric_line !== undefined) {
        const i = o.scene - 1;
        if (board?.scenes[i]) {
          setBoard((b) => b && ({ ...b, scenes: b.scenes.map((s, j) => (j === i ? { ...s, lyric_line: o.lyric_line! } : s)) }));
          done.push(`baris karaoke adegan ${o.scene} diubah`);
        }
      } else if (o.op === "edit_lyrics" && o.lyrics) { setLyrics(o.lyrics); done.push("lirik lagu ditulis ulang"); }
      else if (o.op === "set_style" && o.mStyle) { setMStyle(o.mStyle); done.push("style musik manual diubah"); }
      else if (o.op === "set_music_knobs") {
        if (o.era) setSEra(o.era);
        if (o.tempo) setSTempo(o.tempo);
        if (o.instruments) setSInstr(o.instruments.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4));
        if (o.vocal && ["auto", "male", "female", "instrumental"].includes(o.vocal)) setVocal(o.vocal as "auto" | "male" | "female" | "instrumental");
        if (o.model) setSunoModel(o.model);
        done.push("kenop musik disetel ulang");
      }
    }
    if (done.length) pushChat("sys", "✏️ Langsung kujalankan: " + done.join(" · ") + " — salah langkah? ketuk ↩ Urungkan di bawah.");
  }

  async function sendDirector(text: string) {
    const msg = text.trim();
    if (!msg || chatBusy || !board) return;
    pushChat("me", msg);
    setChatBusy(true);
    const ac = new AbortController();
    const wd = setTimeout(() => ac.abort(), 45000); // keluarga anti-beku: chat juga bertenggat
    try {
      const ctx = {
        judul: selTitle,
        style_visual: board.style_visual, color_grade: board.color_grade,
        scenes: board.scenes.map((s) => ({ n: s.scene, desc: s.scene_desc, lirik: s.lyric_line, visual_en: s.visual_prompt, mood: s.mood, ada_gambar: s.status === "done" })),
        lagu: song ? { judul: song.title, durasi: song.duration || null, model: songModelUsed || null } : null,
        lirik_full: lyrics,
        setelan: { genre, mood, vokal: vocal, model: sunoModel, era: sEra, tempo: sTempo, instrumen: sInstr, style_manual: mStyle },
      };
      // 🏦 v12.3: bansos chat dari Dompet Bansos (menu Saya) — dipakai duluan kalau disetel
      const dhead: Record<string, string> = { "Content-Type": "application/json" };
      try { const bc = JSON.parse(localStorage.getItem("verve_bansos_chat_v1") || "null"); if (bc && bc.base && bc.key) { dhead["x-bansos-chat-base"] = String(bc.base); dhead["x-bansos-chat-key"] = String(bc.key); if (bc.model) dhead["x-bansos-chat-model"] = String(bc.model); } } catch {}
      const r = await fetch("/api/hcnsec/director", {
        method: "POST", headers: dhead, signal: ac.signal,
        body: JSON.stringify({ message: msg, ctx, history: chatLog.slice(-6) }),
      }).finally(() => clearTimeout(wd));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (j.reply) pushChat("ai", String(j.reply));
      const ops: DirOp[] = Array.isArray(j.ops) ? j.ops : [];
      applyFreeOps(ops.filter((o) => !["regen_scene", "regen_song"].includes(o.op)));
      const cost = ops.filter((o) => ["regen_scene", "regen_song"].includes(o.op));
      if (cost.length) {
        setPendingOps(cost);
        pushChat("sys", "🔥 Ada usulan yang membakar kredit — keputusan 100% di tanganmu (Gas / Batal di bawah gelembung).");
      }
      if (Array.isArray(j.dropped) && j.dropped.length) pushChat("sys", "⚠️ Kusaring perintah aneh dari model: " + j.dropped.slice(0, 2).join(" · "));
    } catch (e) {
      pushChat("sys", "❌ Sutradara gagal menjawab: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setChatBusy(false);
    }
  }

  /** Tombol Gas untuk perintah BAKAR KREDIT — hanya dari ketukan pembuat. */
  async function gasOp(o: DirOp) {
    setPendingOps((p) => p.filter((x) => x !== o));
    if (o.op === "regen_scene" && o.scene) {
      const i = o.scene - 1;
      if (!board?.scenes[i]) return;
      pushChat("sys", `🔥 Regen adegan ${o.scene} jalan (kredit gambar) — arahan: "${o.instruction || "-"}"`);
      const ok = await genScene(i, board.scenes[i], o.instruction || "");
      pushChat("sys", ok ? `✅ Adegan ${o.scene} bergambar baru` : `⚠️ Regen adegan ${o.scene} gagal — bisa diulang dari kartu adegan`);
    } else if (o.op === "regen_song") {
      const add = (o.instruction || "").slice(0, 280);
      const next = (mStyle.trim() ? mStyle.trim() + ", " : "") + add;
      setMStyle(next);
      pushChat("sys", `🔥 Lagu diulang dengan arahan: "${add}" (kredit lagu) — pantau di kartu atas`);
      void launchSong(next);
    }
    pushChat("sys", "🧾 Jujur: kredit yang telanjur terpakai tidak bisa kembali — ↩ Urungkan hanya memulihkan teks & setelan.");
  }

  function undoDirector() {
    const s = undoSnap;
    if (!s) return;
    setBoard(s.board); setLyrics(s.lyrics); setMStyle(s.mStyle); setSelTitle(s.selTitle);
    setSEra(s.sEra); setSTempo(s.sTempo); setSInstr(s.sInstr); setVocal(s.vocal); setSunoModel(s.sunoModel);
    setUndoSnap(null);
    pushChat("sys", "↩ Perubahan AI dibatalkan — kembali seperti semula.");
  }

  // 🎚 v10.3: pratinjau style AKHIR yang benar-benar dikirim (gender + manual + era/tempo/instrumen)
  function composeFinalStyle(): string {
    const gw = vocal === "male" ? "male vocalist, deep male voice" : vocal === "female" ? "female vocalist, soft female voice" : "";
    const tempoW = sTempo === "fast" ? "uptempo" : sTempo === "mid" ? "mid-tempo" : sTempo === "slow" ? "slow tempo" : "";
    return [
      gw,
      mStyle.trim() || [genre, mood, "indonesian, emotional, high quality"].join(", "),
      sEra ? `era ${sEra}` : "", tempoW,
      sInstr.length ? `instruments: ${sInstr.join(", ")}` : "",
      "professional studio recording, high quality audio",
    ].filter(Boolean).join(", ");
  }

  /* 🎙️ v19.24 NARASI TTS — ubah naskah jadi suara narasi (niche non-lagu: horor/cerita/tutorial) */
  async function buatNarasiTTS() {
    const teks = (ttsNarasi || naskah || "").trim();
    if (!teks) { setTtsMsg("⚠️ Tulis/isi naskah dulu (atau generate naskah di langkah 6)."); return; }
    setTtsBusy(true); setTtsMsg("🎙️ Mengubah naskah jadi suara narasi…");
    try {
      const r = await fetch("/api/hcnsec/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: teks.slice(0, 3500), voice: ttsVoice, style: ttsStyle }) });
      const j = await r.json();
      if (!r.ok || (!j?.url && !j?.chunks?.length)) throw new Error(j?.error || `HTTP ${r.status}`);
      let url = j.url;
      if (!url && j.chunks?.length) url = await gabungChunksDataUrl(j.chunks); // 🧩 v19.49 gabung potongan
      setNarasiUrl(url); setNarasiName(`Narasi: ${(selTitle || "cerita").slice(0, 40)}`);
      setNarasiDur(j.duration || Math.ceil(teks.length / 12));
      setTtsMsg(j.notice ? `${j.notice}` : `✅ Narasi jadi (±${Math.ceil(teks.length / 12)} dtk) — lanjut Gabung Video.`);
    } catch (e) {
      setTtsMsg(`⚠️ Gagal TTS: ${e instanceof Error ? e.message : "coba lagi"}`);
    } finally { setTtsBusy(false); }
  }

  async function launchSong(styleOverride?: string) { // 🎬 v11.0: Sutradara boleh menyuntik style revisi
    if (!selTitle) return;
    const instrumental = vocal === "instrumental";    const lyr = lyrics.trim();
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
    const styleStr = ((styleOverride ?? mStyle.trim()) || [genre, mood, "indonesian, emotional, high quality"].join(", ")).slice(0, 480);
    const payload = {
      title: selTitle.slice(0, 80),
      prompt: styleStr,
      lyrics: instrumental ? undefined : lyr,
      genre, tags: styleStr,
      custom: lyr.length > 30, instrumental,
      vocalGender: instrumental ? undefined : vocal === "auto" ? undefined : vocal,
      model: sunoModel, // 🎚 v10.3: versi Suno pilihan user (v3.5 → v5.5 terbaru)
      style_bits: { era: sEra || undefined, tempo: sTempo || undefined, instruments: sInstr.length ? sInstr.join(", ") : undefined }, // 🎚 v10.3: panel lengkap ala proyek pertama
      _raw_title: selTitle.slice(0, 80), _raw_lyrics: lyr, _raw_style: styleStr,
    };
    setSongModelUsed(sunoModel); // 🎚 v10.3: catat versi yang dipakai (ditampilkan di hasil)
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
        const keyProblem = er.code === "quota_error" || er.code === "auth_error" || er.code === "need_key" || /401|402|kredit|habis|invalid|credit|insufficient|balance/i.test(er.message); // v10.4: istilah Inggris provider ikut dikenali
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
        // 🛡 v10.7: POST generate juga punya tenggat 65 dtk (server maks 55) — tombol tidak "busy" selamanya
        const acg = new AbortController();
        const wdg = setTimeout(() => acg.abort(), 65000);
        r = await fetch("/api/hcnsec/music", { method: "POST", headers: sunoHeaders(key), body: JSON.stringify(payload), signal: acg.signal })
          .finally(() => clearTimeout(wdg));
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
    if (j.audio_url || j.audio_urls?.length) { // provider langsung kasih audio tanpa polling
      const u = await laguUtuh(j); // 🎵 v19.77: satu lagu (versi A)
      if (u.notice) setTtsMsg(u.notice);
      finishSong({ url: u.url || j.audio_url, title: j.title || selTitle, duration: isFinite(dur) && dur > 0 ? dur : undefined, image: j.image_url });
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
  function pvFailMsg(fromProxy: boolean): string {
    // Pesan jujur (bukan bahasa mesin): link hasil generate penyedia umumnya hanya awet beberapa jam.
    return `${fromProxy ? "Lagu tetap tidak bisa dimuat walau lewat jalur aman" : "Lagu tidak bisa dimuat"}. Kemungkinan besar LINK LAGU dari penyedia sudah kedaluwarsa (tautan hasil generate hanya awet beberapa jam). Solusi jujur: generate lagu baru di langkah Lagu — adeganmu tidak hilang.`;
  }

  function togglePreview() {
    const a = pvAudioRef.current;
    if (!a) return;
    if (pvPlaying) {
      a.pause();
      setPvPlaying(false);
      return;
    }
    if (!song?.url) { setPvErr("Link lagu kosong di draf — lagu perlu digenerate ulang (adeganmu aman)."); return; }
    setPvErr("");
    setPvT(a.currentTime || 0);
    void a.play()
      .then(() => setPvPlaying(true))
      .catch(() => {
        setPvPlaying(false);
        // 🛡 v11.2: jangan langsung menyerah & jangan diam — coba SEKALI lewat jalur proxy otomatis
        if (!pvProxy) { setPvProxy(true); return; } // efek di bawah yang mencoba memutar ulang
        setPvErr(pvFailMsg(true));
      });
  }

  /* 🛟 v13.7.1 BRANKAS LAGU — begitu lagu jadi/dipilih, byte-nya LANGSUNG diamankan selagi link masih segar.
     (Sumber fatal "corrupt/CORS" tadi malam: link mati sebelum sempat disalin. Tak akan terulang.) */
  useEffect(() => { if (song?.url) void avWarm(song.url); }, [song?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 🛡 v11.2: begitu jalur proxy diaktifkan, muat & coba putar otomatis — hasilnya dilaporkan jujur */
  useEffect(() => {
    if (!pvProxy || !pvAudioRef.current) return;
    const a = pvAudioRef.current;
    a.load();
    void a.play()
      .then(() => { setPvErr(""); setPvPlaying(true); })
      .catch((e) => { setPvPlaying(false); setPvErr(pvFailMsg(true) + ` (${String((e as Error)?.name || e || "error")})`); });
  }, [pvProxy]); // eslint-disable-line react-hooks/exhaustive-deps
  function seekPreview(i: number) {
    const t = i * perScene + 0.01;
    const a = pvAudioRef.current;
    if (a) a.currentTime = t;
    setPvT(t);
  }

  function uidL(p = "lh"): string {
    return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /** 📻 v13.7: ukur durasi lagu dari metadata audio (langsung → GERBANG) — lagu wizard bisa datang TANPA durasi. */
  async function probeSongDur(url: string): Promise<number> {
    // 🎵 v19.86: decode dulu → durasi REAL (header metadata bisa bohong 17:23 vs isi 8:03)
    try {
      const { ukurDurasiReal } = await import("@/lib/gabung-audio");
      const d = await ukurDurasiReal(url, (u: string) => `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`);
      if (d > 0.5) return d;
    } catch { /* lanjut fallback metadata */ }
    const cands = /^https?:/i.test(url) ? [url, `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`] : [url];
    return new Promise((res) => {
      let settled = false;
      const done = (d: number) => { if (!settled) { settled = true; res(d); } };
      const tryOne = (i: number) => {
        if (settled) return;
        if (i >= cands.length) return done(0);
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => { const d = a.duration; done(isFinite(d) && d > 0.5 ? d : 0); };
        a.onerror = () => tryOne(i + 1);
        setTimeout(() => tryOne(i + 1), 12000);
        a.src = cands[i];
      };
      tryOne(0);
    });
  }

  /** Bangun draf studio PENUH: gambar→Track 1, lagu→jalur musik, lirik→lapisan teks per klip. */
  async function masukStudio() {
    if (!board || !song) return;
    if ((masukStudio as any)._busy) return; (masukStudio as any)._busy = true;
    try {
      if (!doneScenes.length) {
        setErr({ code: "merge", msg: "Belum ada adegan bergambar — kembali ke langkah Adegan dulu bro." });
        return;
      }
      // 🩹 v13.7 SELARAS LAGU: durasi lagu HARUS terukur sebelum bagi rata — dulu lagu tanpa durasi →
      // 7 adegan × 6d = 42 detik doang dari lagu 4+ menit (laporan bro: "tidak mengikuti audio panjangnya").
      let durEff = song.duration && song.duration > 1 ? song.duration : 0;
      if (!durEff) {
        flash("📻 Mengukur durasi lagu dulu ya bro…");
        durEff = await probeSongDur(song.url);
        if (durEff > 1) { setSong((s) => (s ? { ...s, duration: durEff } : s)); flash(`🎵 Lagu terukur ${Math.round(durEff)} detik — adegan aku selaraskan`); }
      }
      const totalEff = durEff > 1 ? Math.round(durEff) : totalDur;
      const per = Math.round((totalEff / doneScenes.length) * 100) / 100;
      const builtSlides = doneScenes.map((sc) => ({
        id: uidL("c"),
        imageUrl: sc.vidOn && sc.vid ? sc.vid.thumb : (sc.url as string), // 🎞️ poster = pengganti gambar (fallback aman)
        ...(sc.vidOn && sc.vid ? { videoUrl: sc.vid.src } : {}), // 🎬 v13.11.2 FASE 2: pipa resmi v11.8 — Studio & render melukis VIDEO BERGERAK
      }));
      const slideOptsById: Record<string, unknown> = {};
      builtSlides.forEach((sl, i) => {
        const sc = doneScenes[i];
        const cap = (sc.lyric_line || sc.scene_desc || "").trim().slice(0, 80);
        slideOptsById[sl.id] = {
          dur: per,
          trans: "dissolve",
          ...(sc.vidOn && sc.vid && sc.vidSpd && sc.vidSpd !== 1 ? { spd: sc.vidSpd } : {}), // ⏱ v13.13: kecepatan manual ikut ke render
          ...(sc.vidOn && sc.vid ? { stock: { provider: sc.vid.provider || (sc.vid.by || "").split("·").pop()?.trim().toLowerCase() || "stock", by: sc.vid.by, link: sc.vid.link, id: sc.vid.id, dur: sc.vid.dur } } : {}), // 🧾 v18.5: jejak sumber stock ikut ke Studio/Upload Kit
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
        musicDur: Math.round((durEff || song.duration || 0) * 100) / 100 || 0,
        musicOff: 0, musicVol: 1, musicFadeIn: 0, musicFadeOut: 0,
        ttsUrl: "", ttsText: "", voiceUrl: "", ttsDur: 0, voiceDur: 0, ttsOff: 0, voiceOff: 0, voiceVol: 1,
        filterPreset: "none", qualitySharp: false, audMuted: false,
        capWords: [], capStyle: "capcut", ccTpl: "standar", ccSize: 0.055, ccY: 0.78,
        niche: nicheAI || nicheDef.label,
        coverThumb: (builtSlides[0]?.imageUrl || "").slice(0, 40000),
        adj: { b: 0, c: 6, s: 4, e: 0, tem: 4, hue: 0, fade: 0, vig: 12, grain: 0 },
        mTitle: selTitle, mLyrics: lyrics, mStyle, mGenre: genre, mMood: mood,
        mModel: "suno-" + sunoModel.toLowerCase().replace(/_/g, "."), mVocal: vocal === "instrumental" ? "instrumental" : "vocal", // 🎚 v10.3: meta ikut versi asli
      };
      try {
        const arr = JSON.parse(localStorage.getItem("verve_drafts_v1") || "[]");
        arr.unshift(draft);
        while (arr.length > 12) arr.pop();
        localStorage.setItem("verve_drafts_v1", JSON.stringify(arr));
        void mirrorDraft(draft).catch(() => {});
        if (pvAudioRef.current) { pvAudioRef.current.pause(); setPvPlaying(false); }
        flash("🎬 Proyek gabungan terkirim ke Studio!");
        if (gotoEditor) gotoEditor(draft.id);
        else flash("📁 Draf tersimpan — buka dari tab Proyek");
      } catch (e) {
        setErr({ code: "merge", msg: "Gagal simpan draf gabungan (storage penuh? hapus draf lama): " + (e instanceof Error ? e.message : String(e)) });
      }
    } finally { (masukStudio as any)._busy = false; } // v13.7: tutup gerbang anti dobel-klik
  }

  // 🧭 FASE-LAHAN BEBAS LONCAT (permintaan user 2026-08-04): SEMUA langkah SELALU boleh dibuka —
  //    yang digembok hanya AKSI di dalam langkah (tombol riset/generate/gabung punya syaratnya sendiri).
  //    Kesiapan dihitung dari DATA (jujur), bukan posisi — anti "done palsu".
  //    Indeks 0 = langkah 1 (Niat) … indeks 8 = langkah 9 (Video). Dijaga: tests/lahan-bebas-loncat.test.mjs.
  const langkahSiap: boolean[] = [
    topic.trim().length >= 3,                 // 1 Niat
    selKeyword.trim().length > 0,             // 2 Sudut
    !!angle && (researchAt || "").length > 0, // 3 Riset
    selTitle.trim().length > 0,               // 4 Judul
    selTitle.trim().length > 0,               // 5 Visual (konfig suntik konsistensi — butuh judul terkunci)
    naskah.trim().length >= 10,               // 6 Cerita
    doneScenes.length > 0,                    // 7 Adegan
    !!song,                                   // 8 Lagu
    doneScenes.length > 0 && !!song,          // 9 Video
  ];
  const siapCount = langkahSiap.filter(Boolean).length;

  // 🧭 Kartu "bahan langkah" — tujuan mendarat saat user melompat bebas ke langkah
  //    yang prasyaratnya belum terisi (bukan halaman kosong/bingung, tapi peta jalan).
  const kartuKurang = (judul: string, kebutuhan: number[], pesan: string) => (
    <div className="lh-card lh-empty">
      <div className="lh-h1">{judul}</div>
      <p className="lh-sub">{pesan} Melompat ke sini <b>boleh &amp; bebas</b> 🙌 — ini bahan yang langkah ini pakai:</p>
      <div className="lh-chips">
        {kebutuhan.map((k) => (
          <button key={k} className={`lh-chip ${langkahSiap[k - 1] ? "ok" : "kurang"}`} onClick={() => setStep(k)}>
            {langkahSiap[k - 1] ? "✅" : "⬜"} {k}. {stepLabels[k - 1]}
          </button>
        ))}
      </div>
    </div>
  );

  // 🧭 FASE-LAHAN L2 PROFESIONAL: kepala seragam tiap langkah — nomor jelas, tujuan blak-blakan,
  //    bahan yang hilang tinggal diketuk untuk lompat mengisi. Konten & alur tiap langkah TIDAK diubah.
  const LANGKAH_BUTUH: Record<number, number[]> = { 1: [], 2: [1], 3: [2], 4: [1, 2], 5: [4], 6: [4], 7: [6], 8: [6], 9: [7, 8] };
  const kepalaLangkah = (k: number, judul: string, tujuan: string) => {
    const kurang = (LANGKAH_BUTUH[k] || []).filter((x) => !langkahSiap[x - 1]);
    return (
      <div className="lh-stephead">
        <div className="lh-stephead-top">
          <span className="lh-stepnum">LANGKAH {k}/9</span>
          <span className={`lh-stepstat ${langkahSiap[k - 1] ? "ok" : ""}`}>{langkahSiap[k - 1] ? "✅ bahan siap" : "⬜ belum terisi"}</span>
        </div>
        <div className="lh-stephead-t">{judul}</div>
        <p className="lh-stephead-d">{tujuan}</p>
        {kurang.length > 0 && (
          <div className="lh-chips" style={{ marginTop: 7 }}>
            {kurang.map((x) => (
              <button key={x} className="lh-chip kurang" onClick={() => setStep(x)}>⬜ butuh: {x}. {stepLabels[x - 1]}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ================= RENDER ================= */
  return (
    <div className="lh-wrap">
      <div className="lh-top">
        <button className="lh-back" onClick={onExit}>‹</button>
        <div className="lh-top-t">
          <b>🌱 Lahan Awalan</b>
          <span>{nicheDef.emoji} {nicheDef.label} · wizard produksi AI</span>
        </div>
        <button className="lh-reset" title="Lahan baru" onClick={resetLahan}>↺</button>
      </div>

      {/* 🧭 REL LANGKAH BEBAS — ketuk nomor mana pun, kapan pun (FASE-LAHAN BEBAS LONCAT).
          Titik = status DATA (jujur): ✓ siap · angka = belum terisi tapi TETAP boleh dibuka. */}
      <div className="lh-steps-wrap">
        <div className="lh-steps">
          {stepLabels.map((lb, i) => {
            const k = i + 1;
            const on = step === k;
            const done = langkahSiap[i] && !on;
            return (
              <button key={lb} className={`lh-dot ${on ? "on" : ""} ${done ? "done" : ""}`} onClick={() => setStep(k)}
                aria-current={on ? "step" : undefined}
                title={`Langkah ${k}: ${lb} — ${langkahSiap[i] ? "siap ✅" : "belum terisi (tetap boleh dibuka)"}`}>
                <i>{done ? "✓" : k}</i>
                <span>{lb}</span>
              </button>
            );
          })}
        </div>
        <div className="lh-prog" title={`Kesiapan lahan: ${siapCount}/9`}><div className="lh-progfill" style={{ width: `${Math.round((siapCount / 9) * 100)}%` }} /></div>
        <p className="lh-progtext"><b>{siapCount}/9</b> bahan siap · ketuk langkah mana pun — bebas loncat ✦</p>
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
          {kepalaLangkah(1, "Niat, inspirasi & topik 🌱", "Kompas seluruh produksi: cerita ini tentang apa. Tulis niatmu sendiri — atau ambil dari Inspirasi Trend di bawah (klik = niat terisi).")}
          <div className="lh-card">
            <div className="lh-h1">Apa niat ceritamu, bro? 🌱</div>
            <p className="lh-sub">Pilih <b>niche-mu</b> dulu — seluruh alur (riset, trend, judul, hashtag) ikut niche ini. Bisa diganti kapan saja.</p>
            <div className="lh-chips" style={{ flexWrap: "wrap" }}>
              {NICHES.map((n) => (
                <button key={n.id} className={`lh-chip ${nicheId === n.id ? "on" : ""}`} style={nicheId === n.id ? { borderColor: "#f59e0b", color: "#f59e0b" } : undefined} onClick={() => gantiNiche(n.id)}>
                  {n.emoji} {n.label}
                </button>
              ))}
            </div>
            {nicheId === "custom" && (
              <input className="lh-in" style={{ marginTop: 8 }} placeholder="Tulis niche-mu (mis. 'otomotif', 'gaming', 'memasak')" value={nicheCustom} onChange={(e) => { setNicheCustom(e.target.value); try { localStorage.setItem("verve_lahan_niche_custom_v1", e.target.value); } catch { /* abaikan */ } }} />
            )}
            <textarea
              className="lh-ta"
              rows={3}
              placeholder='contoh: "ibu aku rindu" · "maaf ibu aku terlambat" · "ayah yang tak pernah kukenal"'
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Ngomong onText={(t) => setTopic((v) => (v ? v + " " : "") + t)} hint={`niat ${nicheAI || nicheDef.label}: ${nicheDef.contoh.slice(0, 3).join(", ")}`} title="🎤 Ngomong niat ceritamu — teks terisi otomatis" /> {/* v14.5 */}
            <div className="lh-chips">
              {nicheDef.contoh.map((p) => (
                <button key={p} className="lh-chip" onClick={() => setTopic(p)}>{p}</button>
              ))}
            </div>
            <button className="lh-btn" disabled={topic.trim().length < 3 || busy === "suggest"} onClick={() => { void fetchSuggest().then(() => setStep(2)); }}>
              {busy === "suggest" ? "⏳ Nyari sudut..." : "Cari Sudut 🔍"}
            </button>
            <p className="lh-note" style={{ color: "rgba(255,255,255,.45)" }}>👇 Nggak ada ide? Ambil dari <b style={{ color: "#f59e0b" }}>Inspirasi Trend</b> di bawah — klik satu trend = niat di atas langsung terisi.</p>
          </div>

          {/* 🔥 v19.8 INSPIRASI DARI TREND — nyambung ke niat di atas: yang cocok niche diurutkan paling atas */}
          <div className="lh-card" style={{ borderColor: "rgba(245,158,11,.25)" }}>
            <div className="lh-h1">🔥 Inspirasi dari Trend <span style={{ fontSize: 9, background: "rgba(245,158,11,.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>GOOGLE TRENDS 🌏</span></div>
            <p className="lh-sub">Topik hangat hari ini — yang <b>{nicheDef.emoji} cocok niche-mu ({nicheDef.label})</b> diurutkan paling atas. <b>Klik trend → langsung terisi ke niat di atas</b>, lalu gas cari sudutnya. Pilih negara, kasih 🎨 untuk saran thumbnail.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {[["ID", "🇮🇩 Indonesia"], ["US", "🇺🇸 US"], ["JP", "🇯🇵 Jepang"], ["MY", "🇲🇾 Malaysia"]].map(([g, lb]) => (
                <button key={g} onClick={() => gantiGeo(g)} style={{ fontSize: 10.5, fontWeight: 800, padding: "5px 11px", borderRadius: 999, cursor: "pointer", color: trendGeo === g ? "#0a0a14" : "#c7c7d4", background: trendGeo === g ? "#f59e0b" : "var(--v6-card)", border: trendGeo === g ? "1px solid #f59e0b" : "1px solid var(--v6-line)" }}>
                  {lb}
                </button>
              ))}
              <button className="lh-mini ok" onClick={() => muatTrend()} disabled={trendBusy} style={{ padding: "7px 14px", marginLeft: "auto" }}>
                {trendBusy ? "⏳ Menarik..." : "🔥 Muat Trend"}
              </button>
            </div>
            {!!trends?.length && (() => {
              // 🧠 v19.8: sortir kecerdasan — yang cocok niche (bisa jadi lagu) paling atas
              const sorted = [...trends].sort((a, b) => (cocokNiche(b.title, nicheId) ? 1 : 0) - (cocokNiche(a.title, nicheId) ? 1 : 0));
              const cocok = sorted.filter((t) => cocokNiche(t.title, nicheId)).length;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {cocok > 0 && <p className="lh-note" style={{ color: "#f59e0b", margin: 0 }}>{nicheDef.emoji} {cocok} trend cocok niche-mu — diprioritaskan otak.</p>}
                  {sorted.slice(0, 12).map((t) => {
                    const tg = skorTrend(t.title);
                    const active = thumbTrend?.title === t.title;
                    const g = gelombang?.find((x) => x.title === t.title);
                    return (
                      <div key={t.title} style={{ background: "var(--v6-card)", border: active ? "2px solid rgba(245,158,11,.6)" : cocokNiche(t.title, nicheId) ? "1px solid rgba(245,158,11,.4)" : "1px solid var(--v6-line)", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px" }}>
                          <button onClick={() => pakaiTrend(t.title)} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: "#fff", padding: 0 }}>
                            <span style={{ fontSize: 16 }}>{tg.emoji}</span>
                            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{t.title}</span>
                            {g?.status === "baru" && <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>🆕 BARU</span>}
                            {g?.status === "naik" && <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>🌊 NAIK</span>}
                            {g?.status === "turun" && <span style={{ fontSize: 9, background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>📉 turun</span>}
                            <span style={{ fontSize: 9.5, opacity: .55 }}>{t.traffic || ""}</span>
                            <span style={{ fontSize: 10, color: tg.cocokLagu ? "#f59e0b" : "rgba(255,255,255,.4)", whiteSpace: "nowrap" }}>{cocokNiche(t.title, nicheId) ? "🎯 cocok niche?" : tg.label}</span>
                          </button>
                          <button onClick={() => lihatThumbTrend(t)} title="Saran thumbnail dari trend ini" style={{ fontSize: 13, background: active ? "rgba(245,158,11,.2)" : "transparent", border: "1px solid rgba(245,158,11,.35)", borderRadius: 999, padding: "3px 8px", cursor: "pointer" }}>🎨</button>
                        </div>
                        {active && thumbTrend && (
                          <div style={{ padding: "9px 10px", borderTop: "1px dashed rgba(245,158,11,.3)", background: "rgba(245,158,11,.06)" }}>
                            <div style={{ fontSize: 10.5, opacity: .8 }}>{thumbTrend.saran.alasan}</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                              <span style={{ background: thumbTrend.saran.warna, color: "#fff", fontWeight: 900, fontSize: 11, padding: "5px 10px", borderRadius: 8 }}>{thumbTrend.saran.overlay}</span>
                              <span style={{ fontSize: 9.5, opacity: .6 }}>warna {thumbTrend.saran.warna}</span>
                            </div>
                            <div style={{ fontSize: 10, fontFamily: "monospace", background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "7px 9px", marginTop: 6, color: "#c7c7d4" }}>{thumbTrend.saran.prompt}</div>
                            <button className="lh-mini" style={{ marginTop: 6 }} onClick={() => { void navigator.clipboard?.writeText(thumbTrend.saran.prompt).then(() => flash("📋 Prompt thumbnail tersalin")); }}>📋 Salin prompt thumbnail</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {!!trendMsg && <p className="lh-note" style={{ color: trendMsg.startsWith("⚠️") ? "#e8a15a" : "rgba(255,255,255,.5)", marginTop: 8 }}>{trendMsg}</p>}
            <p className="lh-note">Data dari RSS publik Google Trends (read-only, gratis). Tag & saran thumbnail pakai kamus audiens VERVE.</p>
          </div>

          {/* 📅 v19.9 PABRIK KONTEN 7 HARI — auto-pilot konten dari trend + pola + jam hoki */}
          <div className="lh-card" style={{ borderColor: "rgba(139,92,246,.3)" }}>
            <div className="lh-h1">📅 Pabrik Konten 7 Hari <span style={{ fontSize: 9, background: "rgba(139,92,246,.15)", color: "#8b5cf6", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>v19.9 · AUTO-PILOT</span></div>
            <p className="lh-sub">Otak menyusun <b>7 slot konten</b> sekaligus: topik dari gelombang trend 🆕/🌊 + pola tembus channelmu, judul saran + skor, dan jam upload golden-hour. <b>Satu klik → topik & judul langsung ke Lahan.</b></p>
            <button className="lh-mini" onClick={() => setShowPabrik((v) => !v)} style={{ padding: "7px 12px", borderColor: "rgba(139,92,246,.5)", color: "#c7c7d4", background: "rgba(139,92,246,.08)" }}>
              {showPabrik ? "Tutup rencana ▴" : "📅 Lihat Rencana 7 Hari"}
            </button>
            {showPabrik && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {pabrik.map((s) => (
                  <div key={s.index} style={{ background: "var(--v6-card)", border: s.hoki ? "1px solid rgba(245,158,11,.4)" : "1px solid var(--v6-line)", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: 10.5, minWidth: 84 }}>{s.tanggal.slice(5)} · {s.hari}</span>
                      <span style={{ fontSize: 10, opacity: .8, flex: 1 }}>{s.jendela}</span>
                      {s.hoki && <span style={{ fontSize: 9, color: "#f59e0b", whiteSpace: "nowrap" }}>⭐ terbaik</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>🎯 {s.topik}</div>
                    <div style={{ fontSize: 10.5, opacity: .85, marginTop: 2 }}>💡 {s.judul} <span style={{ color: "var(--v6-teal)", fontWeight: 700 }}>({s.predCtr})</span></div>
                    <div style={{ fontSize: 9.5, opacity: .6, marginTop: 3 }}>{s.alasan}</div>
                    <button className="lh-mini" style={{ marginTop: 6, padding: "5px 10px", fontSize: 10 }} onClick={() => { pakaiTrend(s.topik); setSelTitle(s.judul); flash("📅 Slot diisi ke Lahan — gas produksi!"); }}>➕ Isi ke Lahan</button>
                  </div>
                ))}
              </div>
            )}
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
        <>
          {kepalaLangkah(2, "Pilih sudut emas 🎯", "AI mengusulkan sudut pandang berbeda untuk topikmu — pilih yang paling pantas diklik penonton.")}
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
        </>
      )}

      {/* ============ LANGKAH 3: RISET ============ */}
      {step === 3 && (
        <>
          {kepalaLangkah(3, "Riset bukti lapangan 📊", "Data nyata: video serupa yang meledak, view-nya berapa, dan kenapa. Keputusan dari bukti — bukan feeling.")}
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

              {/* ⚡ v19.5 RADAR KOMPETITOR — 3 tercepat + pola judulnya */}
              {!!radar?.top.length && (
                <div className="lh-card" style={{ borderColor: "rgba(25,194,184,.3)" }}>
                  <div className="lh-h2">⚡ Radar kompetitor tercepat <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>v19.5</span></div>
                  <p className="lh-note">Bukan sekadar yang muncul pertama — ini 3 yang <b>paling cepat ngumpulin view</b>. Belajar dari yang paling laku di lapanganmu.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {radar.top.map((t, i) => (
                      <div key={t.video.id || i} style={{ background: "var(--v6-card)", border: "1px solid var(--v6-line)", borderRadius: 12, padding: "9px 11px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 13 }}>{["🥇", "🥈", "🥉"][i] || `#${i + 1}`}</span>
                          <a href={t.video.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none" }}>{t.video.title}</a>
                          <b style={{ color: "var(--v6-teal)", fontSize: 12, whiteSpace: "nowrap" }}>{fmtNum(t.video.vpd)}/hr</b>
                        </div>
                        <div style={{ fontSize: 10, opacity: .65, marginTop: 4 }}>{t.insight}</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: .8 }}>Kata khas: <b>{t.tokens.join(" · ")}</b></div>
                        {!!t.phrases.length && <div style={{ fontSize: 10, marginTop: 2, opacity: .8 }}>Frasa: <b>{t.phrases.join(" · ")}</b></div>}
                      </div>
                    ))}
                  </div>
                  {!!radar.polaBersama.length && (
                    <p className="lh-note" style={{ marginTop: 8 }}>🧬 Pola bersama para juara: <b>{radar.polaBersama.map((p) => `${p.token} ×${p.count}`).join(" · ")}</b> — pertimbangkan dipakai di judulmu.</p>
                  )}
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

          {/* 🛰️ v19.6 RADAR KOMPETITOR RSS — pantau upload channel lawan via RSS gratis */}
          <div className="lh-card" style={{ borderColor: "rgba(25,194,184,.25)" }}>
            <div className="lh-h1">🛰️ Radar Kompetitor — pantauan live lawanmu <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>PELENGKAP RISET</span></div>
            <p className="lh-sub">Riset di atas = <b>potret statis</b> (hasil pencarian). Radar ini = <b>pantauan hidup</b>: begitu lawan upload, otak tahu judulnya & cek <b>mirip nggak dengan judulmu</b>. <b>Gratis via RSS, tanpa nyentuh kuota API risetmu.</b> Data pola lawan dipakai saat riset ulang & duel judul.</p>
            <p className="lh-note" style={{ color: "rgba(255,255,255,.55)", marginTop: 4 }}>Aksi per judul lawan: <b>⚖️</b> = duel dengan judulmu · <b>🎯</b> = <b>pilih arah</b>: pakai judul ini jadi topik produksi (ganti niat) — atau tetap pakai pilihan dari niche-mu.</p>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input className="lh-sel" style={{ flex: 1 }} placeholder="Link channel (@nama / UC...) — link video juga bisa" value={kompUrl} onChange={(e) => setKompUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void tambahKomp(); }} />
              <button className="lh-mini ok" onClick={tambahKomp} disabled={kompBusy} style={{ padding: "7px 12px" }}>+ Pantau</button>
            </div>
            {!!kompCh.length && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {kompCh.map((k) => (
                  <span key={k.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--v6-card)", border: "1px solid var(--v6-line)", borderRadius: 999, padding: "4px 10px", fontSize: 11 }}>
                    {k.name || k.id}
                    <button onClick={() => simpanKomp(kompCh.filter((x) => x.id !== k.id))} style={{ background: "none", border: "none", color: "#e85c5c", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="lh-mini ok" onClick={scanKomp} disabled={kompBusy} style={{ padding: "7px 14px" }}>
                {kompBusy ? "⏳ Scanning..." : "🛰️ Scan Sekarang"}
              </button>
              {!!kompScanAt && <span className="lh-note" style={{ marginTop: 0 }}>Terakhir: {new Date(kompScanAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            {!!kompMsg && <p className="lh-note" style={{ color: kompMsg.startsWith("⚠️") ? "#e8a15a" : "var(--v6-teal)", marginTop: 8 }}>{kompMsg}</p>}
            {!!kompFeeds?.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {kompFeeds.map((f) => (
                  <div key={f.channelId} style={{ background: "var(--v6-card)", border: "1px solid var(--v6-line)", borderRadius: 12, padding: "9px 11px" }}>
                    <b style={{ fontSize: 12 }}>📺 {f.channelName || f.channelId}</b>
                    {f.note && <span style={{ fontSize: 9, opacity: .55, marginLeft: 6 }}>🛟 {f.note}</span>}
                    {f.error ? <p className="lh-note" style={{ color: "#e8a15a", marginTop: 4 }}>⚠️ {f.error}</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                        {f.items.slice(0, 5).map((it) => {
                          const sim = simJudul(it.title, brain);
                          const bahaya = sim.max >= 60;
                          const vel = kompetitorVelocity(it.views, it.publishedAt);
                          return (
                            <div key={it.videoId} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <a href={it.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "#fff", flex: 1 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5 }}>
                                  <span style={{ flex: 1 }}>{it.title}</span>
                                  {vel != null && <span style={{ fontSize: 9, color: vel >= 50 ? "var(--v6-teal)" : "rgba(255,255,255,.5)", whiteSpace: "nowrap", fontWeight: 700 }}>{vel >= 1000 ? "🚀" : vel >= 200 ? "🔥" : vel >= 50 ? "👍" : ""}{fmtNum(vel)}/hr</span>}
                                  {bahaya && <span style={{ fontSize: 9, background: "rgba(232,92,92,.15)", color: "#e85c5c", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>⚠️ mirip</span>}
                                  <span style={{ fontSize: 9.5, opacity: .55, whiteSpace: "nowrap" }}>{waktuLalu(it.publishedAt)}</span>
                                </div>
                                {bahaya && sim.match && <div style={{ fontSize: 9.5, opacity: .6, marginTop: 2 }}>vs "{sim.match}" ({sim.max}%)</div>}
                              </a>
                              <button className="lh-mini" onClick={() => bandingDenganLawan(it.title)} title="Bandingkan dengan judulmu" style={{ padding: "4px 8px", fontSize: 10 }}>⚖️</button>
                              <button className="lh-mini" onClick={() => pakaiJudulLawan(it.title)} title="Jadikan topik produksi (pilih arah: dari lawan, bukan niche)" style={{ padding: "4px 8px", fontSize: 10, borderColor: "rgba(139,92,246,.5)", color: "#c7c7d4" }}>🎯</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* ⚖️ v19.7: HASIL BANDING — judulmu vs judul lawan */}
            {banding && (
              <div style={{ marginTop: 10, background: "rgba(25,194,184,.06)", border: "1px solid rgba(25,194,184,.3)", borderRadius: 12, padding: "10px 12px" }}>
                <b style={{ fontSize: 12 }}>⚖️ Duel judul</b>
                <div style={{ fontSize: 9.5, opacity: .6, marginTop: 2 }}>KIRI = judul yang kamu kunci · KANAN = video terbaru lawan (klik judulnya untuk buka). Mesin otak: prediksi CTR + fitur judul (angka/emosi/panjang).</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, background: "rgba(25,194,184,.08)", border: "1px solid rgba(25,194,184,.3)", borderRadius: 10, padding: 8 }}>
                    <span style={{ fontSize: 9, opacity: .6 }}>JUDULMU</span>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>{banding.a.title}</div>
                    <div style={{ fontSize: 10, opacity: .75, marginTop: 4 }}>Skor <b style={{ color: "var(--v6-teal)" }}>{banding.a.skor}</b> · pred CTR ~{banding.a.predCtr}% · {banding.a.kata} kata{banding.a.angka ? " · angka" : ""}{banding.a.emosi ? " · emosi" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", fontSize: 10, fontWeight: 900, color: "#f59e0b", whiteSpace: "nowrap" }}>VS<br />{banding.sim}%</div>
                  <div style={{ flex: 1, background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.3)", borderRadius: 10, padding: 8 }}>
                    <span style={{ fontSize: 9, opacity: .6 }}>LAWAN</span>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>{banding.b.title}</div>
                    <div style={{ fontSize: 10, opacity: .75, marginTop: 4 }}>Skor <b style={{ color: "#8b5cf6" }}>{banding.b.skor}</b> · pred CTR ~{banding.b.predCtr}% · {banding.b.kata} kata{banding.b.angka ? " · angka" : ""}{banding.b.emosi ? " · emosi" : ""}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, marginTop: 8, color: banding.pemenang === "a" ? "var(--v6-teal)" : banding.pemenang === "b" ? "#e85c5c" : "#f59e0b", fontWeight: 700 }}>
                  {banding.pemenang === "a" ? "🏆 " : banding.pemenang === "b" ? "🛡️ " : "⚖️ "}{banding.alasan}
                </div>
                {/* ⚔️ v19.8.3: SERANG BALIK — judul rekomendasi yang menyerang lawan */}
                <div style={{ marginTop: 10, borderTop: "1px dashed rgba(255,255,255,.12)", paddingTop: 8 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <button className="lh-mini" onClick={serangBalik} style={{ padding: "7px 12px", borderColor: "rgba(245,158,11,.5)", color: "#f59e0b", background: "rgba(245,158,11,.08)" }}>
                      ⚔️ Serang Balik
                    </button>
                    <button className="lh-mini" onClick={serangLagi} style={{ padding: "7px 12px", borderColor: "rgba(25,194,184,.5)", color: "var(--v6-teal)", background: "rgba(25,194,184,.08)" }}>
                      🔁 Generate Lagi {serangBatch > 0 ? `(${serangBatch}×)` : ""}
                    </button>
                  </div>
                  {!!serang?.length && (() => {
                    const menangBesar = serang.find((x) => x.menang && x.selisih >= 3);
                    const adaMenang = serang.some((x) => x.menang);
                    return (
                      <>
                        <p className="lh-note" style={{ marginTop: 8, color: menangBesar ? "var(--v6-teal)" : adaMenang ? "#f59e0b" : "rgba(255,255,255,.55)", fontWeight: 700 }}>
                          {menangBesar ? `🏆 Ada yang MENANG BESAR (+${menangBesar.selisih} poin): "${menangBesar.saran.a.title}"` : adaMenang ? `⚔️ Sudah ada yang menang — generate lagi buat cari yang menang lebih besar!` : `Belum ada yang menang vs lawan (skor terbaik ${Math.max(...serang.map((x) => x.saran.a.skor))}). Coba generate lagi — tiap putaran varian baru.`}
                        </p>
                        {menangBesar && (
                          <button className="lh-mini" style={{ marginTop: 6, padding: "7px 12px", borderColor: "rgba(245,158,11,.5)", color: "#f59e0b", background: "rgba(245,158,11,.08)" }} onClick={() => { pakaiJudulSerang(menangBesar.saran.a.title); bukaThumb(); }}>
                            🖼️ Pakai & Bikin Thumbnail-nya
                          </button>
                        )}
                        <button className="lh-mini" style={{ marginTop: 6, padding: "7px 12px", borderColor: "rgba(139,92,246,.5)", color: "#c7c7d4", background: "rgba(139,92,246,.08)" }} onClick={() => pakaiJudulLawan(banding.b.title)}>
                          🎯 Jadikan topik produksi (ganti niat)
                        </button>
                      </>
                    );
                  })()}
                  <p className="lh-note" style={{ marginTop: 6 }}>Jujur: frasa viral & angka di judul saran diambil dari <b>data judul lawan</b> yang terkumpul (bukan tebakan) — di-score mesin otak vs judul lawan sebelum kamu pakai.</p>
                  {!!serang?.length && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {serang.map((s) => (
                        <div key={s.saran.a.title} style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--v6-card)", border: s.menang ? "1px solid rgba(25,194,184,.5)" : "1px solid var(--v6-line)", borderRadius: 10, padding: "8px 10px" }}>
                          <span style={{ fontSize: 15 }}>{s.menang ? "⚔️" : "🗡️"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{s.saran.a.title}</div>
                            <div style={{ fontSize: 9.5, opacity: .7, marginTop: 2 }}>
                              Skor <b style={{ color: s.menang ? "var(--v6-teal)" : "#f59e0b" }}>{s.saran.a.skor}</b> vs lawan {s.saran.b.skor} · pred CTR ~{s.saran.a.predCtr}% · {s.saran.a.kata} kata
                              {s.menang ? <b style={{ color: "var(--v6-teal)" }}> — MENANG vs lawan</b> : <b style={{ color: "#e8a15a" }}> — masih kalah, coba varian lain</b>}
                            </div>
                          </div>
                          <button className="lh-mini ok" onClick={() => pakaiJudulSerang(s.saran.a.title)} style={{ padding: "5px 10px", fontSize: 10 }}>Pakai →</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* 🧬 v19.7: POLA JUDUL KOMPETITOR — dari judul yang terkumpul */}
            {kompPola && kompPola.total > 0 && (
              <div style={{ marginTop: 10, background: "var(--v6-card)", border: "1px solid var(--v6-line)", borderRadius: 12, padding: "10px 12px" }}>
                <b style={{ fontSize: 12 }}>🧬 Pola judul lawan <span style={{ fontSize: 9, opacity: .6 }}>(dari {kompPola.total} judul terkumpul)</span></b>
                {!!kompPola.pola.length && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    {kompPola.pola.slice(0, 6).map((p) => (
                      <span key={p.key} style={{ fontSize: 10, background: "rgba(139,92,246,.12)", border: "1px solid rgba(139,92,246,.3)", color: "#c7c7d4", borderRadius: 999, padding: "3px 9px" }}>{p.label} {p.count}× ({p.pct}%)</span>
                    ))}
                  </div>
                )}
                {!!kompPola.topTokens.length && <p className="lh-note" style={{ marginTop: 6 }}>Kata khas: <b>{kompPola.topTokens.join(" · ")}</b></p>}
                {!!kompPola.naik.length && (
                  <p className="lh-note" style={{ color: "#f59e0b", marginTop: 4 }}>📈 Sedang naik: <b>{kompPola.naik.map((x) => `${x.phrase} ×${x.count}`).join(" · ")}</b></p>
                )}
              </div>
            )}
            <p className="lh-note">Channel @nama otomatis di-resolve jadi ID (sekali, tanpa API key). Data RSS publik — murah, stabil, legal. Upload baru terdeteksi otomatis & masuk notifikasi harian.</p>
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
      {/* 🧭 Mendarat bebas di langkah 4 tanpa sudut → peta bahan, bukan halaman kosong */}
      {step === 4 && !angle && kartuKurang("Hitung Judul Juara 🏆", [1, 2], "Mesin judul minum dari sudut yang kamu pilih & risetnya.")}
      {step === 4 && angle && (
        <>
          {kepalaLangkah(4, "Judul juara 🏆", songNiche ? "Tiap kandidat judul diskor dari hasil risetmu — yang kaupilih jadi kompas visual, naskah, dan lagu." : "Tiap kandidat judul diskor dari hasil risetmu — yang kaupilih jadi kompas visual & naskah.")}
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
          {!!brain.results.length && (
            <div className="lh-card">
              <button className="lh-btn sec" onClick={() => setShowLapor((v) => !v)}>{showLapor ? "Tutup laporan ▴" : "📊 Lapor performa video (dari YouTube Studio)"}</button>
              {showLapor && (
                <div style={{ marginTop: 10 }}>
                  <p className="lh-note">Isi angka asli dari YouTube Studio → otak VERVE belajar pola judulmu (CTR Bayes + hukuman judul gagal). Daftar skor di atas langsung ikut berubah. Judul tanpa angka tetap tercatat sebagai riwayat.</p>
                  <select className="lh-sel" value={perfSel} onChange={(e) => {
                    const t = e.target.value; setPerfSel(t);
                    const r = brain.results.find((x) => normTitleKey(x.title) === normTitleKey(t));
                    setPerfCtr(r && r.ctr !== undefined && r.ctr !== "" ? String(r.ctr) : "");
                    setPerfImp(r && r.impressions !== undefined && r.impressions !== "" ? String(r.impressions) : "");
                    setPerfAvd(r && r.avdSec !== undefined && r.avdSec !== "" ? String(r.avdSec) : "");
                  }}>
                    <option value="">— pilih judul yang sudah tayang —</option>
                    {brain.results.slice(0, 24).map((r) => <option key={normTitleKey(r.title)} value={r.title}>{r.title}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input className="lh-sel" style={{ flex: 1 }} inputMode="decimal" placeholder="CTR % (mis 6.2)" value={perfCtr} onChange={(e) => setPerfCtr(e.target.value)} />
                    <input className="lh-sel" style={{ flex: 1 }} inputMode="numeric" placeholder="Tayangan" value={perfImp} onChange={(e) => setPerfImp(e.target.value)} />
                    <input className="lh-sel" style={{ flex: 1 }} inputMode="numeric" placeholder="AVD dtk" value={perfAvd} onChange={(e) => setPerfAvd(e.target.value)} />
                  </div>
                  <button className="lh-mini ok" style={{ marginTop: 8 }} onClick={savePerf}>💾 Simpan ke otak 🧠</button>
                </div>
              )}
            </div>
          )}
          {/* 🔄 v19.0 FEEDBACK LOOP — otak belajar sendiri dari YouTube */}
          <div className="lh-card" style={{ borderColor: "rgba(25,194,184,.35)" }}>
            <div className="lh-h1">🧠 Otak belajar otomatis <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>v19.0 · FEEDBACK LOOP</span></div>
            <p className="lh-sub">Otak VERVE menarik sendiri data performa video channelmu (views, AVD, likes, impressions/CTR yang tersedia) → langsung belajar pola judul yang tembus & yang gagal. <b>Tanpa isi manual, tanpa buka YouTube Studio.</b> Read-only, aman.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="lh-mini ok" onClick={() => syncBrainFromYT(false)} disabled={syncBusy} style={{ padding: "7px 14px" }}>
                {syncBusy ? "⏳ Menarik data & belajar..." : "🔄 Sync & Belajar Sekarang"}
              </button>
              {!!syncLast && (
                <span className="lh-note" style={{ marginTop: 0 }}>Terakhir belajar: {new Date(syncLast).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              )}
              <span className="lh-note" style={{ marginTop: 0 }}>Otak punya {brain.results.length}/200 slot memori</span>
            </div>
            {!!syncMsg && <p className="lh-note" style={{ color: syncMsg.startsWith("⚠️") || syncMsg.startsWith("🔗") ? "#e8a15a" : "var(--v6-teal)", marginTop: 8 }}>{syncMsg}</p>}
            <p className="lh-note">Otomatis sync sekali sehari saat app dibuka (kalau YouTube sudah dihubungkan di 🩺 Dokter Channel). Yang sync manual bisa kapan saja. Data lama bobotnya turun (half-life 30 hari) — otak selalu ikut tren terbaru.</p>
          </div>

          {/* 🧠 v19.1 INSIGHT POLA — otak buka buku catatannya */}
          <div className="lh-card">
            <div className="lh-h1">🧠 Pola yang dipelajari otak</div>
            <p className="lh-sub">{insight.summary}</p>
            {insight.withCtr > 0 && insight.baselineCtr != null && (
              <p className="lh-note">Dasar: rata-rata CTR channelmu <b>{insight.baselineCtr}%</b> dari {insight.withCtr} judul berangka · otak menyimpan {insight.n}/200 judul</p>
            )}
            {insight.top.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {insight.top.map((p) => (
                  <div key={p.key} style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(25,194,184,.08)", border: "1px solid rgba(25,194,184,.25)", borderRadius: 10, padding: "7px 10px" }}>
                    <span style={{ color: "var(--v6-teal)", fontWeight: 800, fontSize: 12 }}>▲ +{p.delta}%</span>
                    <span style={{ flex: 1, fontSize: 12 }}>{p.label} <span style={{ opacity: .6 }}>(CTR {p.avgCtr}% · {p.n} judul)</span></span>
                    <span style={{ fontSize: 10, opacity: .55, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>cth: {p.examples[0]}</span>
                  </div>
                ))}
              </div>
            )}
            {insight.worst.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {insight.worst.map((p) => (
                  <div key={p.key} style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(232,92,92,.07)", border: "1px solid rgba(232,92,92,.22)", borderRadius: 10, padding: "7px 10px" }}>
                    <span style={{ color: "#e85c5c", fontWeight: 800, fontSize: 12 }}>▼ {p.delta}%</span>
                    <span style={{ flex: 1, fontSize: 12 }}>{p.label} <span style={{ opacity: .6 }}>(CTR {p.avgCtr}% · {p.n} judul)</span></span>
                    <span style={{ fontSize: 10, opacity: .55, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>cth: {p.examples[0]}</span>
                  </div>
                ))}
              </div>
            )}
            {insight.best && insight.bestCtr != null && (
              <p className="lh-note" style={{ marginTop: 8 }}>🏆 Judul terbaik di otakmu: <b>“{insight.best.title}”</b> (CTR {insight.bestCtr}%) — jadikan kompas gaya judul.</p>
            )}
          </div>

          {/* 🔮 v19.3 DEEP DIVE — kecepatan tayang, jam hoki, durasi ideal, prediksi CTR */}
          <div className="lh-card" style={{ borderColor: "rgba(245,158,11,.3)" }}>
            <div className="lh-h1">🔮 Otak berpikir lebih dalam <span style={{ fontSize: 9, background: "rgba(245,158,11,.15)", color: "#f59e0b", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>v19.3 · DEEP DIVE</span></div>
            <p className="lh-sub">Bukan saran generik — semua di bawah ini otak pelajari dari <b>datamu sendiri</b>: kecepatan tayang, jam upload, durasi video.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 22 }}>{deep.level.emoji}</span>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>Level otak: {deep.level.label}</b>
                <div style={{ fontSize: 10, opacity: .6 }}>{deep.level.next ? `${insight.withCtr}/${deep.level.next} judul berangka untuk naik level` : "Level maksimal — otakmu udah jago 😎"}</div>
              </div>
              <button className="lh-mini" onClick={salinLaporanOtak} style={{ padding: "6px 10px" }}>📋 Salin Laporan</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <button className="lh-mini" onClick={toggleNotif} disabled={notifBusy} style={{ padding: "6px 10px", borderColor: notifOn ? "rgba(25,194,184,.5)" : undefined, color: notifOn ? "var(--v6-teal)" : undefined }}>
                {notifBusy ? "⏳..." : notifOn ? "🔔 Notifikasi harian ON" : "🔔 Aktifkan notifikasi harian"}
              </button>
              {!!notifMsg && <span className="lh-note" style={{ marginTop: 0 }}>{notifMsg}</span>}
            </div>
            {deep.windows.best && (
              <p className="lh-note" style={{ color: "#f59e0b", marginTop: 8 }}>⏰ Jam hoki channelmu: <b>{deep.windows.best.label}</b> — rata-rata {deep.windows.best.avgVelocity} view/hari ({deep.windows.best.n} video){deep.day ? `, hari terbaik ${deep.day.label}` : ""}. Upload di jam ini = peluang tembus lebih besar.</p>
            )}
            {deep.dur.best && (
              <p className="lh-note">⏱️ Durasi yang paling nempel: <b>{deep.dur.best.label}</b> ({deep.dur.best.avgVelocity} view/hari){deep.dur.best.avgAvd != null ? `, AVD ${deep.dur.best.avgAvd} dtk` : ""}.</p>
            )}
            {deep.fastest.r && deep.fastest.vel != null && (
              <p className="lh-note">🚀 Video tercepatmu: <b>“{deep.fastest.r.title}”</b> — {deep.fastest.vel} view/hari ({velocityLabel(deep.fastest.vel)}). Pelajari kenapa dia laku: judul, thumbnail, jam uploadnya.</p>
            )}
            <div style={{ marginTop: 10, borderTop: "1px dashed rgba(255,255,255,.1)", paddingTop: 10 }}>
              <p className="lh-sub" style={{ margin: 0 }}>🔮 <b>Prediksi CTR sebelum tayang</b> — ketik judul calon videomu, otak nebak performanya dari riwayat channelmu:</p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input className="lh-sel" style={{ flex: 1 }} placeholder="Ketik judul yang mau dicek…" value={predTitle} onChange={(e) => setPredTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cekPrediksi(); }} />
                <button className="lh-mini ok" onClick={cekPrediksi}>🔮 Cek</button>
              </div>
              {predRes && (
                <div style={{ marginTop: 8, background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 10, padding: "9px 11px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <b style={{ fontSize: 20, color: "#f59e0b" }}>~{predRes.est}%</b>
                    <span style={{ fontSize: 11, opacity: .7 }}>rentang {predRes.low}–{predRes.high}% · {predRes.n} judul mirip</span>
                  </div>
                  <div style={{ fontSize: 10.5, opacity: .75, marginTop: 4 }}>{predRes.why} {predRes.est >= 5.5 ? "Bisa jadi jagoan — gas!" : predRes.est >= 3.5 ? "Standar channelmu — boleh dicoba, tapi cari angle yang lebih kuat." : "Prediksi lemah — ganti angle / ikuti pola tembus di atas."}</div>
                </div>
              )}
            </div>
            {/* 📅 v19.4 JADWAL UPLOAD — golden hour dari datamu sendiri */}
            <div style={{ marginTop: 10, borderTop: "1px dashed rgba(255,255,255,.1)", paddingTop: 10 }}>
              <button className="lh-mini" onClick={() => setShowJadwal((v) => !v)} style={{ padding: "6px 10px" }}>
                {showJadwal ? "📅 Tutup jadwal upload ▴" : "📅 Jadwal upload 7 hari terbaik"}
              </button>
              {showJadwal && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {jadwal.slots.map((s) => (
                      <div key={s.tanggal} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, background: s.hoki ? "rgba(245,158,11,.08)" : "var(--v6-card)", border: s.hoki ? "1px solid rgba(245,158,11,.4)" : "1px solid var(--v6-line)", borderRadius: 9, padding: "7px 10px" }}>
                        <span style={{ fontWeight: 800, minWidth: 96 }}>{s.tanggal.slice(5)} · {s.hari}</span>
                        <span style={{ opacity: .85, flex: 1 }}>{s.jendela}</span>
                        <span style={{ fontSize: 10, opacity: .7 }}>{s.hoki ? "⭐ TERBAIK" : ""}</span>
                      </div>
                    ))}
                  </div>
                  <p className="lh-note" style={{ marginTop: 8 }}>{jadwal.sumber} · Kalender ini lahir dari jam upload video-video lamamu.</p>
                </div>
              )}
            </div>
          </div>

          {/* 🎯 v19.1 TITLE GURU — otak menulis judul baru dari pola tembus */}
          <div className="lh-card">
            <div className="lh-h1">🎯 Saran judul dari otak</div>
            <p className="lh-sub">Otak menulis 4 judul baru memakai pola yang <b>terbukti tembus di channelmu</b> — bukan template asal. Disaring: nggak mirip judul yang gagal, nggak kembar dengan yang sudah dipakai.</p>
            <button className="lh-mini ok" onClick={mintaSaranGuru} style={{ padding: "7px 14px" }}>🎯 Minta saran judul</button>
            {!!guruMsg && <p className="lh-note" style={{ color: "#e8a15a", marginTop: 8 }}>{guruMsg}</p>}
            {!!guru.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {guru.map((s) => (
                  <div key={s.title} style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--v6-card)", border: "1px solid var(--v6-line)", borderRadius: 10, padding: "9px 11px" }}>
                    <span className={`lh-sc ${s.score >= 70 ? "ok" : s.score >= 45 ? "warn" : "err"}`} style={{ minWidth: 34 }}>{s.score}</span>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 13 }}>{s.title}</b>
                      <div style={{ fontSize: 10, opacity: .6 }}>{s.alasan}</div>
                    </div>
                    <button className="lh-mini ok" onClick={() => pakaiSaranGuru(s.title)}>Pakai →</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selTitle && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="lh-btn" style={{ flex: 2 }} onClick={() => setStep(5)}>Lanjut: Rancang Visual 🎨</button>
              <button className="lh-btn sec" style={{ flex: 1, borderColor: "rgba(245,158,11,.5)", color: "#f59e0b", background: "rgba(245,158,11,.08)" }} onClick={bukaThumb}>
                🖼️ Thumbnail
              </button>
            </div>
          )}
        </>
      )}

      {/* ============ LANGKAH 5: MESIN VISUAL WAW (PROMPT ENGINE) ============ */}
      {step === 5 && (
        <>
          {kepalaLangkah(5, "Mesin visual konsisten 🎬", "Kunci karakter & gayamu: wajah, pakaian, suasana SAMA dari adegan pertama sampai akhir — ciri video mahal.")}
          <div className="lh-card">
            <div className="lh-h1">Mesin visual WAW 🎬</div>
            <p className="lh-sub">Judul terkunci: <b>{selTitle || "— (belum ada, pilih dulu di langkah 4)"}</b></p>
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
            {modelPinned && <p className="lh-note">🤖 Model terkunci: <b>{modelPinned}</b> — dipin dari gambar pertama yang berhasil, semua adegan memakainya</p>}
          </div>

          <button className="lh-btn" onClick={() => setStep(6)}>Lanjut: Naskah Cerita 📝</button>
        </>
      )}

      {/* ============ LANGKAH 6: NASKAH CERITA ============ */}
      {step === 6 && (
        <>
          {kepalaLangkah(6, "Naskah cerita 📝", "Alur yang menjaga retensi: hook kuat → masalah → puncak emosi → pesan yang membekas.")}
          <div className="lh-card">
            <div className="lh-h1">Naskah cerita 📝</div>
            <p className="lh-sub">Untuk judul: <b>{selTitle || "— (belum, pilih di langkah 4)"}</b></p>
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
            <Ngomong onText={(t) => setNaskah((v) => (v ? v + "\n" : "") + t)} hint="naskah adegan cerita bahasa Indonesia: baris pembuka hook, tiap baris satu adegan" title="🎤 Dikte naskah per adegan — kalimatmu jadi baris baru" /> {/* v14.5 */}
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
          {kepalaLangkah(7, "Adegan bergambar 🎞️", "Naskah dipecah jadi adegan; tiap adegan digambar konsisten mengikuti kartu karakter yang kaubekukan.")}
          <div className="lh-card">
            <div className="lh-h1">Adegan & gambar 🎬</div>
            <p className="lh-sub">Naskah dipotong jadi adegan, tiap adegan digambar AI dengan <b>kartu karakter + gaya visual terinjeksi</b> — biar karakter nyambung antar adegan. Yang kurang pas tinggal <b>↻ ulangi</b> adegan itu saja.</p>
            {!board ? (
              <button className="lh-btn" disabled={busy === "board"} onClick={buildBoard}>
                {busy === "board" ? "⏳ Sutradara AI menyusun..." : "🎬 Susun Storyboard (AI)"}
              </button>
            ) : (
              <>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "board" || genAllBusy} onClick={buildBoard}>↻ Susun ulang</button>
                <button className="lh-btn" style={{ flex: 2 }} disabled={genAllBusy} onClick={genAllScenes}>
                  {genAllBusy ? `⏳ Menggambar ${boardDone}/${board.scenes.length}...` : boardDone === board.scenes.length ? `✅ ${board.scenes.length}/${board.scenes.length} siap` : `🖼 Generate SEMUA (${boardDone}/${board.scenes.length})`}
                </button>
              </div>
              <button className="lh-btn sec" style={{ width: "100%" }} disabled={vidAllBusy || busy === "board"} onClick={() => void saranVidSemua()}>
                {vidAllBusy ? "⏳ Mengaduk-aduk gudang video..." : "🎞️ Sarankan video stok SEMUA adegan (gratis, bebas pakai)"}
              </button>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8, fontSize: 12, color: "#cbd5e1", cursor: "pointer" }} onClick={() => { const nx = !rasaIndo; setRasaIndo(nx); try { localStorage.setItem("verve_vidindo_v1", nx ? "1" : "0"); } catch { /* abaikan */ } }}>
                <span style={{ fontSize: 16 }}>{rasaIndo ? "☑️" : "⬜"}</span>
                <span>🇮🇩 <b>Rasa Indonesia</b> — cari stok wajah/lokasi Nusantara dulu. Stok habis → otomatis dilebarkan ke dunia (dilapor jujur).</span>
              </label>
              {board && board.scenes.some((sc) => sc.vid) ? (
                <button className="lh-btn sec" style={{ width: "100%", marginTop: 6, opacity: 0.85 }} onClick={() => { setBoard((b) => b && ({ ...b, scenes: b.scenes.map((sc) => (sc.vid ? { ...sc, vid: null, vidOn: false } : sc)) })); flash("🧹 Semua pilihan video dilupakan — tekan Sarankan SEMUA lagi buat saran SINEMATIK baru"); }}>
                  🧹 Lupakan semua pilihan video (buat di-sarankan ulang)
                </button>
              ) : null}
              </>
            )}
          </div>

          {board && (
            <>
              {/* 🪝 v19.10 HOOK ENGINE — cek 3 detik pertama (ilmu Short-Video Coach) */}
              {hook.adegan1 && (
                <div className="lh-card" style={{ borderColor: hook.adegan1.verdict === "kuat" ? "rgba(25,194,184,.4)" : hook.adegan1.verdict === "sedang" ? "rgba(245,158,11,.4)" : "rgba(232,92,92,.45)" }}>
                  <div className="lh-h1">🪝 Cek Hook 3 Detik Pertama <span style={{ fontSize: 9, background: "rgba(25,194,184,.15)", color: "var(--v6-teal)", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>v19.10</span></div>
                  <p className="lh-sub" style={{ color: hook.adegan1.verdict === "kuat" ? "var(--v6-teal)" : hook.adegan1.verdict === "sedang" ? "#f59e0b" : "#e85c5c", fontWeight: 800 }}>
                    {hook.ringkasan}
                  </p>
                  {!!hook.adegan1.alasan.length && (
                    <ul className="lh-reasons" style={{ marginTop: 6 }}>
                      {hook.adegan1.alasan.map((a, i) => <li key={i} className={a.startsWith("⚠️") ? "bad" : "good"}>{a}</li>)}
                    </ul>
                  )}
                  {!!hook.saran.length && (
                    <div style={{ marginTop: 6 }}>
                      {hook.saran.map((s, i) => <p key={i} className="lh-note" style={{ color: "#e8a15a", marginTop: 3 }}>💡 {s}</p>)}
                    </div>
                  )}
                  {hook.adegan1.verdict !== "kuat" && (
                    <button className="lh-mini" style={{ marginTop: 8, padding: "7px 12px", borderColor: "rgba(245,158,11,.5)", color: "#f59e0b", background: "rgba(245,158,11,.08)" }} onClick={upgradeAdeganSatu}>
                      🪝 Upgrade Adegan 1 (close-up emosi)
                    </button>
                  )}
                  {hook.semua.length > 1 && (
                    <p className="lh-note" style={{ marginTop: 6 }}>Adegan lain: {hook.semua.slice(1).map((a) => `${a.scene}:${a.verdict === "kuat" ? "✅" : a.verdict === "sedang" ? "🟡" : "🔴"}`).join(" · ")}</p>
                  )}
                </div>
              )}
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
                  <p className="lh-note" style={{ margin: "6px 0 2px" }}>🎬 <b>Alur adegan {sc.scene}</b> — aksi nyata lanjutan cerita (boleh diedit kalau kurang pas):</p>
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
                  {/* 🎞️ v13.11 LEMARI VIDEO — campur bebas: adegan ini boleh video stok ATAU gambar AI */}
                  <div style={{ marginTop: 8, borderTop: "1px dashed rgba(255,255,255,.14)", paddingTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="lh-mini">🎞️ <b>Video stok</b> (bebas pakai)</span>
                      <div style={{ flex: 1 }} />
                      {sc.vidOn && sc.vid ? <span className="lh-mini ok">dipakai ✅</span> : null}
                    </div>
                    {sc.vidOn && sc.vid ? (
                      <video className="lh-scene-img" style={{ marginTop: 6 }} src={sc.vid.sd} poster={sc.vid.thumb} muted loop playsInline autoPlay />
                    ) : sc.vid ? (
                      <img className="lh-scene-img" style={{ marginTop: 6, opacity: 0.5 }} src={sc.vid.thumb} alt="calon video" />
                    ) : null}
                    {sc.vid ? <p className="lh-note" style={{ margin: "4px 0" }}>⏱ {sc.vid.dur} detik · 🎬 {sc.vid.by} · stock bebas pakai sesuai lisensi provider</p> : null}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} onClick={() => bukaVidSheet(i)}>
                        {sc.vid ? "🔄 Ganti / cari lagi" : "🎞️ Cari video buat adegan ini"}
                      </button>
                      {sc.vid ? (
                        <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} onClick={() => updateScene(i, { vidOn: !sc.vidOn })}>
                          {sc.vidOn ? "🎨 Balik ke gambar AI" : "🎞️ Pakai video ini"}
                        </button>
                      ) : null}
                    </div>
                    {sc.vidOn && sc.vid && !sc.url ? <p className="lh-note" style={{ margin: "6px 0 0" }}>ℹ️ Adegan ini tanpa gambar AI — hemat kredit gambar.</p> : null}
                    {sc.vidOn && sc.vid ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <span className="lh-mini">⏱</span>
                        <select className="lh-sel" style={{ flex: 1 }} value={sc.vidSpd ?? 1} onChange={(e) => updateScene(i, { vidSpd: +e.target.value })}>
                          <option value={1}>Kecepatan: Otomatis pas slot (disaranin)</option>
                          <option value={0.75}>Lebih lambat 0.75× (dreamy)</option>
                          <option value={0.5}>Sangat lambat 0.5× (puisi)</option>
                          <option value={1.25}>Lebih cepat 1.25×</option>
                          <option value={1.6}>Cepat 1.6×</option>
                        </select>
                      </div>
                    ) : null}
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

              {vidSheet !== null && (
                <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(3,6,12,0.92)", overflowY: "auto", padding: "14px 14px 90px" }}>
                  <div className="lh-card" style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <div className="lh-h2">🎞️ Lemari Video — Adegan {vidSheet + 1}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="lh-ta" style={{ flex: 1, height: 42, minHeight: 0, padding: "8px 10px" }} value={vidQ} onChange={(e) => setVidQ(e.target.value)} placeholder="kata kunci Inggris · mis: elderly woman rain" />
                      <button className="lh-btn" style={{ marginTop: 0, width: 90 }} disabled={vidBusy} onClick={() => void jalankanCariVid(vidQ)}>{vidBusy ? "⏳" : "🔍 Cari"}</button>
                    </div>
                    <button className="lh-btn sec" style={{ width: "100%" }} onClick={() => setVidSheet(null)}>✕ Tutup</button>
                  </div>
                  {vidErr ? <p className="lh-note" style={{ color: "#ffb199" }}>{vidErr}</p> : null}
                  {vidBusy ? <p className="lh-note">⏳ Mengaduk-aduk gudang…</p> : null}
                  {vidNote ? <p className="lh-note" style={{ color: "#9fd3ff" }}>{vidNote}</p> : null}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                    {vidRes.filter((v) => { const punya = vidSheet != null ? board?.scenes[vidSheet]?.vid : null; return !vDipakai.has(v.id) || (punya != null && punya.id === v.id); }).map((v) => (
                      <button key={v.id} onClick={() => pilihVid(vidSheet, v)} style={{ padding: 0, border: "1px solid rgba(255,255,255,.15)", borderRadius: 12, overflow: "hidden", background: "#0b1220", textAlign: "left", cursor: "pointer" }}>
                        <img src={v.thumb} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
                        <div style={{ padding: "6px 8px", fontSize: 11, color: "#cbd5e1" }}>⏱ {v.dur}d · 🎬 {v.by}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button className="lh-btn" onClick={() => setStep(8)}>Lanjut: Panggung Lagu 🎵</button>
            </>
          )}
        </>
      )}

      {/* ============ LANGKAH 8: LAGU (SUNO) ============ */}
      {step === 8 && (
        <>
          {kepalaLangkah(8, songNiche ? "Panggung lagu 🎵" : "Audio & musik 🔉", songNiche ? "Lirik & ceritamu jadi lagu utuh — musik yang membawa emosi video dari detik pertama." : "Isi musik/narasi videomu (opsional) — atau kosongkan lalu lanjut ke video.")}
          <div className="lh-card">
            <div className="lh-h1">{songNiche ? "Panggung lagu 🎵" : "Audio & musik 🔉"}</div>
            <p className="lh-sub">Judul: <b>{selTitle || "— (belum, pilih di langkah 4)"}</b> — {songNiche ? "lagu diolah Suno lewat provider pilihanmu" : "pilih SUARA NARASI (TTS) atau LAGU — atau kosongkan untuk video tanpa audio"}. API key disimpan <b>di HP-mu saja</b> (localStorage), bukan di server.</p>

            {/* 🎙️ v19.24 NARASI TTS — khusus niche non-lagu (horor/cerita/tutorial) */}
            {!songNiche && (
              <div className="lh-card" style={{ borderColor: "rgba(34,197,94,.4)", marginTop: 8, background: "rgba(34,197,94,.05)" }}>
                <div className="lh-h2">🎙️ Narasi Suara (TTS) — baca naskah jadi suara</div>
                <p className="lh-note" style={{ marginTop: 4 }}>Cocok buat cerita horor/tutorial/dokumenter: naskahmu dibacakan narator (bukan dinyanyikan).</p>
                <textarea className="lh-ta" rows={4} style={{ marginTop: 6 }} placeholder="Teks narasi — kosongkan = pakai naskah dari langkah 6" value={ttsNarasi} onChange={(e) => setTtsNarasi(e.target.value)} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <select className="lh-sel" style={{ flex: 1, minWidth: 120 }} value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
                    {[
                      { id: "gadis", n: "Gadis — Perempuan (🇮🇩)" },
                      { id: "ardi", n: "Ardi — Laki-laki (🇮🇩)" },
                      { id: "aria", n: "Aria — Perempuan (🇬🇧)" },
                      { id: "guy", n: "Guy — Laki-laki (🇬🇧)" },
                      { id: "jenny", n: "Jenny — Perempuan (🇬🇧)" },
                      { id: "christopher", n: "Christopher — Kisah (🇬🇧)" },
                      { id: "michelle", n: "Michelle — Perempuan (🇬🇧)" },
                    ].map((v) => <option key={v.id} value={v.id}>{v.n}</option>)}
                  </select>
                  <select className="lh-sel" style={{ minWidth: 130 }} value={ttsStyle} onChange={(e) => setTtsStyle(e.target.value)}>
                    {[
                      { id: "normal", n: "Gaya: Normal" },
                      { id: "berita", n: "Gaya: 📰 Berita" },
                      { id: "kisah", n: "Gaya: 📖 Kisah" },
                      { id: "cepat", n: "Gaya: ⚡ Cepat" },
                      { id: "tenang", n: "Gaya: 🌙 Tenang" },
                    ].map((s) => <option key={s.id} value={s.id}>{s.n}</option>)}
                  </select>
                  <button className="lh-mini ok" disabled={ttsBusy} onClick={buatNarasiTTS} style={{ padding: "8px 14px" }}>
                    {ttsBusy ? "⏳ Membuat suara…" : "🎙️ Generate Narasi Suara"}
                  </button>
                </div>
                {!!narasiUrl && (
                  <div className="lh-note" style={{ color: "#6ee7b7", marginTop: 6 }}>
                    ✅ Narasi siap: {narasiName} (±{narasiDur} dtk) — <a href={narasiUrl} target="_blank" rel="noreferrer" style={{ color: "#6ee7b7" }}>dengar</a>
                  </div>
                )}
                {!!ttsMsg && <p className="lh-note" style={{ color: ttsMsg.startsWith("⚠️") ? "#fbbf24" : "#6ee7b7", marginTop: 4 }}>{ttsMsg}</p>}
                <p className="lh-note" style={{ marginTop: 4 }}>Narasi ini yang akan digabung ke video (bukan lagu). Masih bisa juga pakai lagu di bawah kalau mau.</p>
              </div>
            )}

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
                  <p className="lh-note">Pilih provider di atas, lalu tap tautan Ambil API key.</p>
                )}
                <p className="lh-note">1. Tap link di atas → login → {PROVIDER_KEY_LINK[sunoProv]?.hint}.<br />2. Tempel <b>satu kunci per baris</b> di bawah → <b>+ Tambah</b>. Bisa BANYAK kunci: kalau satu habis/ditolak, mesin <b>otomatis pindah kunci berikutnya</b>.</p>
                <textarea
                  className="lh-ta"
                  rows={3}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
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
            <div className="lh-h2" style={{ marginTop: 10 }}>🤖 Versi Suno</div>
            <select className="lh-sel" value={sunoModel} onChange={(e) => setSunoModel(e.target.value)}>
              {SUNO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>Suno {m.label}{m.note ? ` — ${m.note}` : ""}</option>
              ))}
            </select>
            <p className="lh-note">Yang dipakai: <b>{sunoModel}</b> — dari v3.5 klasik sampai v5.5 🆕 terbaru.</p>
            <div className="lh-h2" style={{ marginTop: 10 }}>🕰 Era & tempo</div>
            <div className="lh-chips">
              {SUNO_ERAS.map((e) => (
                <button key={e.id} className={`lh-chip ${sEra === e.id ? "on" : ""}`} onClick={() => setSEra(sEra === e.id ? "" : e.id)}>{e.label}</button>
              ))}
              {SUNO_TEMPOS.map((t) => (
                <button key={t.id} className={`lh-chip ${sTempo === t.id ? "on" : ""}`} onClick={() => setSTempo(sTempo === t.id ? "" : t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="lh-h2" style={{ marginTop: 10 }}>🎻 Instrumen pilihan <span className="lh-note">(boleh pilih banyak)</span></div>
            <div className="lh-chips">
              {SUNO_INSTRS.map((ins) => (
                <button key={ins} className={`lh-chip ${sInstr.includes(ins) ? "on" : ""}`} onClick={() => setSInstr(sInstr.includes(ins) ? sInstr.filter((x) => x !== ins) : [...sInstr, ins])}>{ins}</button>
              ))}
            </div>
            <p className="lh-note">🎼 Style akhir yang dikirim: <b>{composeFinalStyle().slice(0, 240)}</b></p>
            <p className="lh-note">ℹ️ ±12 kredit Kie per generate · tulisan manualmu SELALU di urutan depan · gender vokal + lawan gender terlarang ikut tertanam (v10.2).</p>
            <button className="lh-btn" disabled={polling || busy === "song"} onClick={() => void launchSong()}>
              {busy === "song" ? "⏳ Mengirim ke dapur musik..." : (songNiche ? "🎵 Generate Lagu" : "🎵 Generate Musik")}
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
                    ? `Cek #${pollUi.attempt} · polling anti-beku (tiap cek 40 dtk, sabar dijaga timer, HP bangun langsung dicek) · sabar maks 9 mnt. Menit 2–5 itu antrean PENYEDIA — di luar kendali aplikasi.${pollUi.last !== "antre" && pollUi.last !== "pending" ? ` · ${pollUi.last}` : ""}`
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
              <div className="lh-h2">✅ Lagu jadi: {song.title || selTitle}{songModelUsed ? ` · 🤖 Suno ${songModelUsed}` : ""}</div>
              {!!peaks?.length && (
                <div className="lh-wave">{peaks.map((p, i) => <i key={i} style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />)}</div>
              )}
              <audio
                className="lh-audio"
                controls
                preload="metadata"
                src={song.audio || song.url}
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

          {(song || (narasiUrl && !songNiche)) && board && (
            <button className="lh-btn" onClick={() => setStep(9)}>Gabung Jadi Video 🎬</button>
          )}
          {!songNiche && (
            <button className="lh-btn sec" style={{ width: "100%", marginTop: 8 }} onClick={() => setStep(9)}>
              ⏭️ Lewati audio — video tanpa musik (adegan tetap jalan)
            </button>
          )}
          <p className="lh-note" style={{ textAlign: "center" }}>Langkah terakhir: {songNiche ? "lagu" : "audio (opsional)"} + adegan digabung otomatis → tombol <b>Masuk Studio Edit</b> (elemen terpisah ke jalurnya masing-masing).</p>
        </>
      )}

      {/* ============ LANGKAH 9: GABUNG OTOMATIS → STUDIO EDIT ============ */}
      {/* 🧭 Mendarat bebas di langkah 9 tanpa adegan/lagu → peta kesiapan akhir */}
      {step === 9 && !(board && song) && kartuKurang("Gabung Jadi Video 🎬", [6, 7, 8], "Video digabung dari adegan bergambar + lagu jadi. Keduanya lahir di:")}
      {step === 9 && board && song && (
        <>
          {kepalaLangkah(9, "Video utuh 🎬", songNiche ? "Lagu + adegan digabung otomatis dengan pembagian durasi rata — poles halusnya lanjut di Studio Edit." : "Audio + adegan digabung otomatis dengan pembagian durasi rata — poles halusnya lanjut di Studio Edit.")}
          <div className="lh-card">
            <div className="lh-h1">Video utuh 🎬</div>
            <p className="lh-sub">{songNiche ? "Lagu" : "Audio"} + {doneScenes.length} adegan digabung otomatis: tiap adegan dapat ±{perScene.toFixed(1)} detik mengikuti durasi {songNiche ? "lagu" : "audio"} {fmtClock(totalDur)}. Jujur bro — pembagiannya rata; sinkron halus bisa kau poles di Studio{ songNiche ? " (ada penanda BPM)" : "" }.</p>
            <div className="lh-kv"><span>✅ Adegan</span><b>{doneScenes.length}/{board.scenes.length} bergambar</b></div>
            <div className="lh-kv"><span>{songNiche ? "✅ Lagu" : "✅ Audio"}</span><b>{(narasiUrl && !songNiche) ? narasiName : (song.title || selTitle)} · {(narasiUrl && !songNiche) ? fmtClock(Math.round(narasiDur)) : (song.duration ? fmtClock(Math.round(song.duration)) : "-")}</b></div>
            {songNiche ? <div className="lh-kv"><span>✅ Lirik karaoke</span><b>tiap adegan jadi lapisan teks sendiri di Studio</b></div> : <div className="lh-kv"><span>✅ Narasi</span><b>{narasiUrl ? "suara narasi siap digabung" : "belum ada (bisa lewati / isi di langkah 8)"}</b></div>}
          </div>

          <div className="lh-card">
            <div className="lh-h2">▶ Pratinjau gabungan</div>
            <div className="lh-player">
              {doneScenes[pvIdx] && (doneScenes[pvIdx].vidOn && doneScenes[pvIdx].vid ? (
                <video key={pvIdx} className="lh-pv-img" src={doneScenes[pvIdx].vid!.sd} poster={doneScenes[pvIdx].vid!.thumb} muted loop playsInline autoPlay />
              ) : (
                <img key={pvIdx} className="lh-pv-img" src={doneScenes[pvIdx].url} alt={`adegan ${doneScenes[pvIdx].scene}`} />
              ))}
              {!!doneScenes[pvIdx]?.lyric_line && (
                <div className="lh-pv-cap"><span>🎵 {doneScenes[pvIdx].lyric_line}</span></div>
              )}
            </div>
            <div className="lh-pv-bar"><i style={{ width: `${Math.min(100, (pvT / Math.max(1, totalDur)) * 100)}%` }} /></div>
            {!!pvErr && (
              <p className="lh-note" style={{ color: "#fca5a5", marginTop: 8 }}>🔇 {pvErr} <b>Peringatan:</b> kalau dipaksa Masuk Studio, hasil render kemungkinan TANPA SUARA.</p>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="lh-btn" style={{ flex: 1, marginTop: 0 }} onClick={togglePreview}>{pvPlaying ? "⏸ Jeda" : "▶ Putar"}</button>
              <span className="lh-note" style={{ margin: 0 }}>{fmtClock(Math.floor(pvT))} / {fmtClock(totalDur)}</span>
            </div>
            <div className="lh-dotnav">
              {doneScenes.map((_, i) => (
                <button key={i} className={i === pvIdx ? "on" : ""} onClick={() => seekPreview(i)}>{i + 1}</button>
              ))}
            </div>
            <audio
              ref={pvAudioRef}
              src={pvSrc}
              preload="auto"
              onEnded={() => setPvPlaying(false)}
              onError={() => {
                // 🛡 v11.2: kegagalan terdeteksi TANPA menunggu tombol Putar ditekan
                setPvPlaying(false);
                if (!pvProxy && song?.url) setPvProxy(true); // kesempatan kedua lewat proxy
                else setPvErr(song?.url ? pvFailMsg(true) : "Link lagu kosong di draf — lagu perlu digenerate ulang (adeganmu aman).");
              }}
            />
          </div>

          {/* 🎬 v11.0 SUTRADARA CHAT — setelah video jadi, AI yang bekerja */}
          <div className="lh-card">
            <div className="lh-h1">🎬 Sutradara Chat</div>
            <p className="lh-note">Video jadi tapi belum puas? <b>Bilang saja apa yang mau diubah</b> — Sutradara menerjemahkan jadi perintah editing. Perintah gratis langsung jalan (ada ↩ Urungkan) · perintah bakar kredit <b>selalu minta izin dulu</b>. Otak: model cepat gateway kita — tanpa biaya baru.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px" }}>
              {["adegan 2 diganti dia berdiri di sawah pas senja", "lagunya kurang sedih, tambah biola", "baris karaoke adegan 1 diganti: aku pulang membawa luka"].map((q, i) => (
                <button key={i} className="lh-chip" onClick={() => void sendDirector(q)}>{q}</button>
              ))}
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "#0b0e13", borderRadius: 12, border: "1px solid #ffffff14" }}>
              {!chatLog.length && (
                <div style={{ color: "#8b93a3", fontSize: 13 }}>Contoh perintah: "judulnya ganti …" · "ganti vokal ke wanita" · "adegan 3 promptnya kurang hujan" · "tempo lagunya pelanin". Kamu nyutradarai, AI yang kerja.</div>
              )}
              {chatLog.map((m, i) => (
                m.me === "me" ? (
                  <div key={i} style={{ alignSelf: "flex-end", maxWidth: "86%", background: "linear-gradient(135deg,#0d9488,#14b8a6)", color: "#052a26", borderRadius: "12px 12px 4px 12px", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}>{m.text}</div>
                ) : m.me === "ai" ? (
                  <div key={i} style={{ alignSelf: "flex-start", maxWidth: "92%", background: "#161b24", color: "#e8edf5", borderRadius: "12px 12px 12px 4px", padding: "8px 12px", fontSize: 14, border: "1px solid #ffffff12", whiteSpace: "pre-wrap" }}>{m.text}</div>
                ) : (
                  <div key={i} style={{ alignSelf: "center", maxWidth: "96%", color: "#98a2b3", fontSize: 12, textAlign: "center" }}>{m.text}</div>
                )
              ))}
              {chatBusy && <div style={{ color: "#8b93a3", fontSize: 13 }}>🎬 Sutradara mikir…</div>}
              <div ref={chatEndRef} />
            </div>
            {!!pendingOps.length && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingOps.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", background: "#1a1207", border: "1px solid #f59e0b44", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}>
                    <span>🔥 {o.op === "regen_scene" ? `Regen adegan ${o.scene}` : "Ulang lagu"}{o.instruction ? ` — "${o.instruction}"` : ""} <b>(±kredit)</b></span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="lh-mini ok" onClick={() => void gasOp(o)}>Gas</button>
                      <button className="lh-mini" onClick={() => setPendingOps((p) => p.filter((x) => x !== o))}>Batal</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={chatInp}
                onChange={(e) => setChatInp(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { const v = chatInp; setChatInp(""); void sendDirector(v); } }}
                placeholder="tulis perintahmu… lalu Enter"
                style={{ flex: 1, background: "#12151c", color: "#e8edf5", border: "1px solid #ffffff22", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
              />
              <button className="lh-btn" style={{ marginTop: 0, whiteSpace: "nowrap" }} disabled={chatBusy} onClick={() => { const v = chatInp; setChatInp(""); void sendDirector(v); }}>Kirim</button>
            </div>
            {undoSnap && <button className="lh-mini" style={{ marginTop: 8 }} onClick={undoDirector}>↩ Urungkan perubahan AI</button>}
            <p className="lh-note" style={{ marginTop: 8 }}>Jujur fase 1: riwayat chat belum disimpan saat halaman ditutup · perubahan struktur timeline Studio (potong/geser klip) menyusul fase 2.</p>
          </div>

          <div className={`lh-card lh-verdict ${doneScenes.length === board.scenes.length ? "ok" : "warn"}`}>
            <div className="lh-vscore">🎬</div>
            <div>
              <b>{doneScenes.length === board.scenes.length ? "Siap masuk Studio Edit" : `Baru ${doneScenes.length}/${board.scenes.length} adegan bergambar`}</b>
              <p>Masuk Studio: gambar → <b>Track 1</b> · lagu → <b>jalur musik</b> (gelombang asli + BPM) · lirik tiap adegan → <b>lapisan teks terpisah</b> (bisa kau geser/edit hapus satu-satu). Belum cocok = edit, cocok = ekspor.</p>
            </div>
          </div>
          <button className="lh-btn" onClick={() => void masukStudio()}>🎬 MASUK STUDIO EDIT</button>
        </>
      )}

      <p className="lh-note" style={{ textAlign: "center", marginTop: 14 }}>
        🧠 VERVE Brain + Prompt Engine · kartu karakter disuntik ke tiap adegan · skor & prompt bisa diaudit
      </p>
      {toast && <div className="lh-toast">{toast}</div>}
    </div>
  );
}
