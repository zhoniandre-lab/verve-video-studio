
import { NextResponse } from "next/server";
import { catatKredit } from "../../../../lib/ledger";
import { gerbangFitur } from "../../../../lib/setelan";
import { normalizeLagu as normalize, mapModelKie, mapModelGeneric, mapModelMusicApi, mapModelAimusicApi, mapModelEvolink, mapModelComet, mapModelTtapi, audioProbeCukup } from "../../../../lib/suno-normalize";

/**
 * Generate AI music via Suno-compatible API.
 * Multi-provider: kie.ai, apiframe.ai, sunor.cc.
 * (aimusic.so DIHAPUS v19.35.4 — endpoint API-nya mati total, 404 semua.)
 *
 * Credentials priority:
 *   1. Header X-Suno-Key
 *   2. Header X-Suno-Provider ("kie" | "apiframe" | "sunor") — opsional, kalau dikirim
 *      client akan dipakai; kalau tidak, dideteksi dari prefix key.
 *   3. Env: SUNO_API_KEY / MUSIC_API_KEY
 *   Tanpa key sama sekali → error need_key + panduan dapat key gratis.
 */
export const dynamic = "force-dynamic";

type Provider = "kie" | "apiframe" | "sunor" | "suno-resmi" | "mureka" | "musicapi" | "aimusicapi" | "sunoapi" | "evolink" | "cometapi" | "ttapi";

const PROVIDERS: Record<Provider, { base: string; label: string }> = {
  kie:      { base: "https://api.kie.ai/api/v1", label: "Kie.ai" },
  apiframe: { base: "https://apiframe.ai/api",   label: "apiframe.ai" },
  sunor:    { base: "https://sunor.cc",            label: "Sunor.cc" }, // v10.5: subdomain api.* MATI di DNS — endpoint resmi ada di domain utama
  // 🎵 v19.61 PROVIDER BARU: SUNO RESMI (studio-api) — pakai COOKIE akun suno.com
  // gratis (50 kredit/hari). Key = cookie session dari suno.com (lihat Bot Buruan → Suno).
  "suno-resmi": { base: "https://studio-api.suno.ai", label: "Suno Resmi (cookie akun)" },
  // 🎵 v19.64 PROVIDER BARU: MUREKA (API RESMI) — platform.mureka.ai/apiKeys,
  // free credits tanpa kartu, lagu vokal + lirik + instrumental.
  mureka: { base: "https://api.mureka.ai", label: "Mureka" },
  // 🎵 v19.69 PROVIDER BARU (diuji hidup dari server): MusicAPI & AIMusicAPI —
  // reseller Suno API dengan kredit gratis (75 & 30), key di dashboard masing-masing.
  musicapi:  { base: "https://api.musicapi.ai",    label: "MusicAPI (75 kredit gratis)" },
  aimusicapi: { base: "https://api.aimusicapi.ai", label: "AIMusicAPI (30 kredit gratis)" },
  // 🎵 v19.78 PROVIDER BARU (dicek hidup 2026-08-14: 401 tanpa key = endpoint ADA)
  // sunoapi.org = format Kie (akun/kredit terpisah kalau daftar di sana).
  sunoapi:  { base: "https://api.sunoapi.org/api/v1", label: "SunoAPI.org" },
  evolink:  { base: "https://api.evolink.ai",         label: "EvoLink" },
  cometapi: { base: "https://api.cometapi.com",       label: "CometAPI" },
  ttapi:    { base: "https://api.ttapi.io",           label: "TTAPI" },
};

/** 🛡 v19.35.4: provider yang TERVERIFIKASI mati (semua endpoint 404) — jangan pernah dipakai.
 *  Cek via /api/hcnsec/music/health (health-check otomatis dari server). */
export const PROVIDER_MATI: Record<string, string> = {
  aimusic: "aimusic.so — endpoint API sudah MATI (404 semua). Hapus dari daftar & pakai Kie/Sunor.",
};

function detectProvider(rawKey: string, hdrProvider?: string): Provider {
  if (hdrProvider && PROVIDERS[hdrProvider as Provider]) return hdrProvider as Provider;
  // Prefix Bearer/bearer bukan bagian key dan tidak boleh menggagalkan auto-detect.
  const k = stripBearer(rawKey).toLowerCase();
  if (k.startsWith("kie") || k.startsWith("sk-kie")) return "kie";
  if (k.startsWith("snr_") || k.startsWith("sunor_") || k.startsWith("sk_live")) return "sunor"; // v10.5: kunci asli Sunor = sk_live_…
  if (k.startsWith("afk_") || k.startsWith("af_")) return "apiframe";
  if (k.startsWith("__secure-") || k.includes("session=") || (k.includes("suno") && k.includes("="))) return "suno-resmi"; // cookie suno.com, bukan key sunoapi.org
  if (k.startsWith("mrk_") || k.startsWith("mureka")) return "mureka"; // 🎵 v19.64
  if (k.startsWith("mus_") || k.startsWith("musicapi")) return "musicapi"; // 🎵 v19.69
  if (k.startsWith("aimus") || k.startsWith("aimusicapi")) return "aimusicapi"; // 🎵 v19.69
  if (k.startsWith("ttapi") || k.startsWith("tt-") || k.startsWith("tta_")) return "ttapi"; // 🎵 v19.78
  if (k.startsWith("evo_") || k.startsWith("evolink")) return "evolink";
  if (k.startsWith("comet") || k.startsWith("sk-comet")) return "cometapi";
  // Hex 32+ tanpa prefix — asumsikan Kie.ai (Kie ngasih key hex murni).
  if (/^[a-f0-9]{24,}$/i.test(k)) return "kie";
  return "kie";
}

function getCreds(req: Request) {
  const hdrKey = req.headers.get("x-suno-key") || "";
  const hdrProvider = (req.headers.get("x-suno-provider") || "").toLowerCase();
  const hdrBase = req.headers.get("x-suno-base") || "";
  const envKey = process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "";
  const envBase = process.env.SUNO_BASE_URL || "";
  const key = (hdrKey || envKey || "").trim();
  const explicitProvider = !!(hdrProvider && PROVIDERS[hdrProvider as Provider]);
  const provider = detectProvider(key, hdrProvider);
  // URL env lama hanya berlaku untuk mode server-key. Kalau UI mengirim
  // provider yang dipilih user, wajib gunakan base provider tersebut; kalau
  // tidak, semua provider selain default bisa nyasar ke endpoint Kie.
  let base = hdrBase || (!explicitProvider ? envBase : "");
  if (!base) base = PROVIDERS[provider].base;
  base = base.replace(/\/$/, "");
  return { key, base, provider };
}

// Provider yang punya kontrak audio-reference/cover yang terdokumentasi.
// EvoLink saat ini tetap Simple: endpoint Suno publiknya mendokumentasikan prompt,
// custom lyrics, instrumental, dan persona, bukan upload-cover/sample.
const REFERENCE_PROVIDERS = new Set<Provider>(["musicapi", "aimusicapi", "kie", "sunoapi", "cometapi", "ttapi"]);

function buildReferenceBody(payload: any, provider: Provider): any {
  const audioUrl = String(payload.audio_url || payload.audioUrl || "").trim();
  const title = String(payload.title || "Verve Reference Song").trim().slice(0, 80);
  const lyrics = String(payload.lyrics || payload.prompt || "").trim();
  const style = String(payload.style || payload.tags || "professional song, clean arrangement").trim();
  const instrumental = !!payload.instrumental;
  const vocalGender = String(payload.vocalGender || "");
  const start = Math.max(0, Number(payload.sample_start ?? payload.chop_sample_start_s) || 0);
  const requestedEnd = Number(payload.sample_end ?? payload.chop_sample_end_s);
  const end = Math.max(start + 0.5, Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : start + 30);
  const custom = !instrumental && lyrics.length > 0;
  const numberOr = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const audioWeight = Math.max(0, Math.min(1, numberOr(payload.audio_weight, 0.75)));
  const styleWeight = Math.max(0, Math.min(1, numberOr(payload.style_weight, 0.65)));
  const weirdness = Math.max(0, Math.min(1, numberOr(payload.weirdness_constraint, 0.3)));

  if (provider === "musicapi" || provider === "aimusicapi") {
    const body: any = {
      url: audioUrl,
      chop_sample_start_s: start,
      chop_sample_end_s: end,
      custom_mode: custom,
      mv: provider === "musicapi" ? mapModelMusicApi(payload.model) : mapModelAimusicApi(payload.model),
      make_instrumental: instrumental,
      title,
      tags: style.slice(0, 1000),
      style_weight: styleWeight,
      weirdness_constraint: weirdness,
      audio_weight: audioWeight,
    };
    if (!instrumental && vocalGender === "male") body.vocal_gender = "m";
    if (!instrumental && vocalGender === "female") body.vocal_gender = "f";
    if (custom) body.prompt = lyrics.slice(0, 3000);
    else body.gpt_description_prompt = style.slice(0, 200);
    return body;
  }

  if (provider === "kie" || provider === "sunoapi") {
    const body: any = {
      uploadUrl: audioUrl,
      customMode: custom,
      instrumental,
      model: mapModelKie(payload.model),
      title,
      style: style.slice(0, 1000),
      audioWeight,
      styleWeight,
      weirdnessConstraint: weirdness,
      callBackUrl: "playground",
    };
    if (!instrumental && vocalGender === "male") body.vocalGender = "m";
    if (!instrumental && vocalGender === "female") body.vocalGender = "f";
    body.prompt = custom ? lyrics.slice(0, 5000) : style.slice(0, 500);
    return body;
  }

  if (provider === "ttapi") {
    const body: any = {
      custom: custom,
      instrumental,
      mv: mapModelTtapi(payload.model),
      audio_url: audioUrl,
      title,
      tags: style.slice(0, 1000),
      negative_tags: "heavy metal, distorted, off-key",
      style_weight: styleWeight,
      weirdness_constraint: weirdness,
      audio_weight: audioWeight,
      duration: 120,
      auto_lyrics: false,
      isStorage: true,
    };
    if (custom) body.prompt = lyrics.slice(0, 5000);
    else body.gpt_description_prompt = style.slice(0, 3000);
    if (!instrumental && vocalGender === "male") body.vocal_gender = "Male";
    if (!instrumental && vocalGender === "female") body.vocal_gender = "Female";
    return body;
  }

  if (provider === "cometapi") {
    const body: any = {
      prompt: custom ? lyrics.slice(0, 5000) : style.slice(0, 3000),
      generation_type: "TEXT",
      tags: style.slice(0, 1000),
      negative_tags: "heavy metal, distorted, off-key",
      mv: mapModelComet(payload.model),
      title,
      task: "cover",
      cover_clip_id: String(payload.cover_clip_id || ""),
      make_instrumental: instrumental,
      style_weight: styleWeight,
      weirdness_constraint: weirdness,
      audio_weight: audioWeight,
      metadata: {
        create_mode: custom ? "custom" : "inspiration",
        control_sliders: { style_weight: styleWeight, audio_weight: audioWeight, weirdness_constraint: weirdness },
        can_control_sliders: ["style_weight", "audio_weight", "weirdness_constraint"],
        is_remix: true,
      },
    };
    if (!custom) body.prompt = style.slice(0, 3000);
    return body;
  }
  return null;
}

function findStringByKeys(value: any, keys: string[], depth = 0, seen = new Set<any>()): string {
  if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1, seen);
      if (found) return found;
    }
    return "";
  }
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const key of Object.keys(value)) {
    const found = findStringByKeys(value[key], keys, depth + 1, seen);
    if (found) return found;
  }
  return "";
}

async function uploadCometReference(audioUrl: string, base: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(`${base}/suno/uploads/audio-url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: audioUrl }),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const directClipId = findStringByKeys(body, ["clip_id", "clipId", "music_id", "musicId"]);
    if (directClipId) return directClipId;
    const uploadTaskId = findStringByKeys(body, ["task_id", "taskId", "jobId"]);
    if (!uploadTaskId) throw new Error("upload tidak mengembalikan clip_id");

    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt ? 1800 : 500));
      const poll = await fetch(`${base}/suno/fetch/${encodeURIComponent(uploadTaskId)}`, { headers, cache: "no-store" });
      const pollBody = await poll.json().catch(() => ({}));
      const clipId = findStringByKeys(pollBody, ["clip_id", "clipId", "music_id", "musicId"]);
      if (clipId) return clipId;
      const state = String(pollBody?.status || pollBody?.state || "").toLowerCase();
      if (/fail|error|cancel/.test(state)) throw new Error(String(pollBody?.message || "upload Comet gagal"));
    }
    throw new Error("Comet belum mengembalikan clip_id setelah upload");
  } finally {
    clearTimeout(timeout);
  }
}

function getReferenceEndpoints(provider: Provider, base: string): string[] {
  if (provider === "musicapi" || provider === "aimusicapi") return [`${base}/api/v1/sonic/sample`];
  if (provider === "kie" || provider === "sunoapi") return [`${base}/generate/upload-cover`];
  if (provider === "ttapi") return [`${base}/suno/v1/upload-cover`];
  if (provider === "cometapi") return [`${base}/suno/submit/music`];
  return [];
}

function buildBody(payload: any, provider: Provider): any {
  const result = buildBodyRaw(payload, provider);
  if (result && typeof result === "object") {
    const audioUrl = payload.audio_url || payload.audioUrl || "";
    const continueAt = payload.continue_at !== undefined ? Number(payload.continue_at) : undefined;
    if (audioUrl) {
      if (provider === "kie" || provider === "sunoapi") {
        result.audioUrl = audioUrl;
        if (continueAt !== undefined) result.continueAt = continueAt;
      } else if (provider === "sunor") {
        if (!result.input) result.input = {};
        result.input.audio_url = audioUrl;
        if (continueAt !== undefined) result.input.continue_at = continueAt;
      } else {
        result.audio_url = audioUrl;
        if (continueAt !== undefined) result.continue_at = continueAt;
      }
    }
  }
  return result;
}

function buildBodyRaw(payload: any, provider: Provider): any {
  // Dukung payload "Kampung-style" yang pisah title, lyrics, deskripsi utama
  const rawTitle = (payload._raw_title || payload.title || "").toString().trim();
  const rawLyrics = (payload._raw_lyrics || payload.lyrics || "").toString().trim();
  const rawStyle = (payload._raw_style || payload.prompt || payload.tags || "").toString().trim();

  const {
    genre, tags, custom, model, instrumental, vocalGender, style_bits,
  } = payload;

  const sb = style_bits || {};
  const tempoWord = sb.tempo === "fast" ? "uptempo" : sb.tempo === "mid" ? "mid-tempo" : "slow tempo";
  const eraWord = sb.era ? `era ${sb.era}` : "";
  const instrWord = sb.instruments ? `instruments: ${sb.instruments}` : "";

  const autoStyleParts = [genre || "", eraWord, tempoWord, instrWord].map(s=>(s||"").trim()).filter(Boolean);
  // 🎤 v10.2 LAGU NURUT: kata kunci gender IKUT DITANAM di style/tags di urutan DEPAN — tuas yang dituruti
  // SEMUA provider & versi Suno. Jangan cuma andalkan param vocalGender (dok resmi: hanya 'preferred'/best-effort).
  const genderWords = instrumental ? "" :
    vocalGender === "male" ? "male vocalist, deep male voice" :
    vocalGender === "female" ? "female vocalist, soft female voice" : "";
  // Gabung: gender + style manual user (prioritas!) + auto bits + mutu
  const styleStr = [genderWords, rawStyle, autoStyleParts.join(", "), "professional studio recording, high quality audio"]
    .map(s=>(s||"").trim()).filter(Boolean).join(", ");
  // tags versi ber-gender untuk jalur suno-compatible generik
  const tagsStr = [genderWords, tags || styleStr].map(s=>(s||"").trim()).filter(Boolean).join(", ");

  // Title pakai rawTitle
  const finalTitle = (rawTitle || "Verve AI Song").slice(0, 80);
  const finalPrompt = rawStyle || [finalTitle, styleStr].filter(Boolean).join(", ");
  const finalLyrics = rawLyrics;
  // Custom mode AKTIF kalau lirik terisi (>30 char) dan bukan instrumental
  const isCustom = (custom !== false) && finalLyrics.length > 30 && !instrumental;

  if (provider === "kie" || provider === "sunoapi") {
    const body: any = {
      model: mapModelKie(model),
      customMode: isCustom,
      instrumental: !!instrumental,
      title: finalTitle,
      callBackUrl: "playground",
      // negativeTags default: hal2 yang bikin lirik ngawur / bahasa asing
      // 🎤 v10.2: lawan gender di-NEGATIF-kan — pria pilih? wanita masuk daftar larangan. Dan sebaliknya.
      negativeTags: "korean, japanese, chinese, heavy metal, edm, autotune, robotic, off-key, distorted" +
        (!instrumental && vocalGender === "male" ? ", female vocals, female voice" : "") +
        (!instrumental && vocalGender === "female" ? ", male vocals, male voice" : ""),
    };
    if (isCustom) {
      // PENTING (docs Kie): di custom mode, `prompt` WAJIB diisi lirik yang sama dg `lyrics`
      // — "prompt will be strictly used as the lyrics". Kalau diisi style desc, AI nyanyi deskripsi & jadinya ngawur/Korea.
      body.prompt = finalLyrics.slice(0, 5000);
      body.lyrics = finalLyrics.slice(0, 5000);
      body.style = styleStr.slice(0, 200); // ⚡ OPTIMIZE: Batasi ke 200 karakter (dari 480) untuk mematuhi limitasi API Kie.ai! Mencegah kegagalan generate di langkah 8 Lahan Awalan.
      // styleWeight rendah = lebih patuh ke lirik; audioWeight normal; weirdness rendah biar gak aneh
      body.styleWeight = 0.65; // v10.2: style manual user dituruti lebih keras (dulu 0.55 → gaya mengambang)
      body.audioWeight = 0.7;
      body.weirdnessConstraint = 0.3;
    } else {
      body.prompt = finalPrompt.slice(0,500);
      body.style = styleStr.slice(0, 200); // ⚡ OPTIMIZE: Batasi ke 200 karakter (dari 480) untuk mematuhi limitasi API Kie.ai!
    }
    if (!instrumental) {
      // v10.2: dok resmi hanya 'm'/'f' — 'mf' invalid (diabaikan/ditolak). Auto = biarkan provider memilih.
      if (vocalGender === "male") body.vocalGender = "m";
      else if (vocalGender === "female") body.vocalGender = "f";
    }
    return body;
  }

  // 🎵 v19.69 MUSICAPI & AIMUSICAPI — Suno-compatible (Bearer key, kredit gratis)
  // 🐛 v19.74 FIX KUALITAS: dulu pakai sonic-v3-5 (LEGACY) → hasil 'band jelek',
  // nggak patuh prompt. Sekarang pilih MODEL TERBARU sesuai pilihan user:
  //   musicapi & aimusicapi: sonic-v5/sonic-v4-5/sonic-v4/sonic-v3-5
  // Model V4_5PLUS/V5_5 dipetakan ke nama Sonic resmi, bukan nama model UI.
  // Tags: v4.5+ limit 1000 char; description mode tetap dibatasi agar kompatibel.
  if (provider === "musicapi" || provider === "aimusicapi") {
    // MusicAPI dan AIMusicAPI memakai kontrak Sonic yang sama. Sebelumnya
    // task_type hilang, model V4_5PLUS salah menjadi V4, dan field `model`
    // ekstra ikut dikirim; sebagian akun membalas validation/auth error.
    const mv = provider === "musicapi" ? mapModelMusicApi(model) : mapModelAimusicApi(model);
    const tagsPenuh = styleStr.slice(0, 1000);
    const body: any = {
      task_type: "create_music",
      custom_mode: isCustom,
      mv,
      make_instrumental: !!instrumental,
    };
    if (isCustom) {
      body.prompt = finalLyrics.slice(0, 5000);
      body.title = finalTitle;
      body.tags = tagsPenuh;
      if (vocalGender === "male") body.vocal_gender = "m";
      else if (vocalGender === "female") body.vocal_gender = "f";
    } else {
      // Description mode memakai gpt_description_prompt; title/tags/style
      // tidak dikirim agar sesuai schema provider dan tidak dianggap custom.
      body.gpt_description_prompt = finalPrompt.slice(0, 500);
    }
    return body;
  }

  // 🎵 v19.64 MUREKA — POST /v1/song/generate (Bearer key, free credits)
  if (provider === "mureka") {
    const body: any = {
      lyrics: (finalLyrics || "Instrumental").slice(0, 5000), // lirik WAJIB (kalau kosong → hint instrumental)
      prompt: [genderWords, styleStr, instrumental ? "instrumental music, no vocals" : ""].map(x => (x || "").trim()).filter(Boolean).join(", ").slice(0, 500) || "pop song",
      model: "auto",
      n: 1,
    };
    return body;
  }

  // 🎵 v19.61 SUNO RESMI (studio-api) — POST /api/v1/music (cookie akun suno.com)
  if (provider === "suno-resmi") {
    const body: any = {
      title: finalTitle,
      prompt: isCustom ? finalLyrics.slice(0, 5000) : finalPrompt.slice(0, 500),
      tags: styleStr.slice(0, 480),
      mv: "chirp-v3-5",
      instrumental: !!instrumental,
    };
    if (isCustom) {
      body.lyrics = finalLyrics.slice(0, 5000);
      body.custom = true;
      body.prompt = finalLyrics.slice(0, 5000);
      body.style = styleStr.slice(0, 480);
      body.tags = styleStr.slice(0, 480);
    }
    if (vocalGender === "male") body.gender = "male";
    else if (vocalGender === "female") body.gender = "female";
    return body;
  }

  // 🎵 v19.78 EVOLINK — POST /v1/audios/generations
  if (provider === "evolink") {
    const body: any = {
      model: mapModelEvolink(model),
      custom_mode: isCustom,
      instrumental: !!instrumental,
      prompt: isCustom ? finalLyrics.slice(0, 5000) : finalPrompt.slice(0, 500),
    };
    // EvoLink menolak style/title pada simple mode; keduanya hanya untuk custom.
    if (isCustom) {
      body.title = finalTitle;
      body.style = styleStr.slice(0, 1000);
      if (vocalGender === "male") body.vocal_gender = "m";
      else if (vocalGender === "female") body.vocal_gender = "f";
    }
    return body;
  }

  // 🎵 v19.78 COMETAPI — POST /suno/submit/music
  if (provider === "cometapi") {
    const mv = mapModelComet(model);
    if (isCustom) {
      return { prompt: finalLyrics.slice(0, 5000), tags: styleStr.slice(0, 480), mv, title: finalTitle, make_instrumental: !!instrumental };
    }
    return { gpt_description_prompt: finalPrompt.slice(0, 500), mv, make_instrumental: !!instrumental, title: finalTitle };
  }

  // 🎵 v19.78 TTAPI — POST /suno/v1/music
  if (provider === "ttapi") {
    const mv = mapModelTtapi(model);
    if (isCustom) {
      return { custom: true, instrumental: !!instrumental, mv, title: finalTitle, tags: styleStr.slice(0, 480), prompt: finalLyrics.slice(0, 5000) };
    }
    return { custom: false, instrumental: !!instrumental, mv, gpt_description_prompt: finalPrompt.slice(0, 500) };
  }

  // ☀️ v10.5 SUNOR RESMI — POST /api/v1/task {model:"suno", task_type:"music", input:{…}} (dok sunor.cc/suno-api)
  if (provider === "sunor") {
    const input: any = { make_instrumental: !!instrumental, tags: styleStr.slice(0, 480) };
    if (isCustom) { input.prompt = finalLyrics.slice(0, 5000); input.tags = styleStr.slice(0, 480); } // Custom Mode: lirik [Verse]/[Chorus] + tags
    else input.gpt_description_prompt = finalPrompt.slice(0, 500); // mode deskripsi bebas
    return { model: "suno", task_type: "music", input };
  }

  // apiframe — suno-compatible
  const body: any = {
    prompt: isCustom ? finalLyrics : finalPrompt,
    title: finalTitle,
    tags: tagsStr, // v10.2: gender tertanam
    make_instrumental: !!instrumental,
    wait_audio: false,
    mv: "chirp-v3-5",
    model: mapModelGeneric(model),
  };
  if (vocalGender === "male") body.gender = "male";
  else if (vocalGender === "female") body.gender = "female";

  if (isCustom) {
    body.lyrics = finalLyrics;
    body.custom_mode = true;
    body.prompt = finalLyrics;
    body.style = styleStr;
    body.tags = tagsStr; // v10.2: gender tertanam
  }
  return body;
}

/** 🐛 v19.63 FIX "lagu jadi tapi kosong": VALIDASI URL audio provider SEBELUM
 *  dikasih ke user. Strategi: coba TANPA auth dulu (simulasi kondisi download
 *  user lewat proxy — paling umum). Kalau gagal, coba DENGAN header provider
 *  untuk diagnosis (link yang butuh auth tidak bisa diunduh publik = beri tahu
 *  jujur, bukan bilang "jadi").
 *  🐛 v19.81: v19.80 bikin probeAudioCukup (terima 206 Partial Content) tapi
 *  LUPA DIPAKAI di sini → CDN Suno/TTAPI balas 206 untuk Range 0-2047, lagu
 *  yang sudah jadi malah ditolak "file audio tidak valid/kosong (2048 byte)".
 *  Sekarang pakai audioProbeCukup + baca ukuran asli dari Content-Range. */
async function cekUrlAudioValid(url: string, headers: Record<string,string>): Promise<{ ok: boolean; msg?: string; bytes?: number; requiresAuth?: boolean }> {
  const coba = async (h: Record<string,string>): Promise<{ status: number; bytes: number; total?: number } | null> => {
    try {
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 10000);
      const r = await fetch(url, { headers: { ...h, Range: "bytes=0-2047" }, signal: ac.signal, cache: "no-store" });
      clearTimeout(tm);
      const buf = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
      // total = ukuran file asli dari "Content-Range: bytes 0-2047/5242880"
      const cr = r.headers.get("content-range") || "";
      const m = /\/(\d+)\s*$/.exec(cr);
      const total = m ? Number(m[1]) : undefined;
      return { status: r.status, bytes: buf.byteLength, total: Number.isFinite(total) ? total : undefined };
    } catch { return null; }
  };
  const tanpa = await coba({});
  if (tanpa && audioProbeCukup(tanpa)) return { ok: true, bytes: tanpa.bytes };
  const dengan = await coba(headers);
  if (dengan && audioProbeCukup(dengan)) {
    // Valid bila provider memang menjaga CDN dengan API key. Client akan
    // mengambilnya kembali lewat gerbang proxy ber-auth, bukan membuang hasil.
    return { ok: true, requiresAuth: true, bytes: dengan.bytes };
  }
  const st = tanpa?.status || dengan?.status || 0;
  if (st === 401 || st === 403) return { ok: false, msg: "link audio butuh autentikasi (401/403) — tidak bisa diunduh publik." };
  if (st === 404) return { ok: false, msg: "link audio sudah hilang (404) — kemungkinan kedaluwarsa." };
  if (st >= 500) return { ok: false, msg: `server audio error (HTTP ${st}).` };
  return { ok: false, msg: `file audio tidak valid/kosong (${tanpa?.bytes ?? 0} byte) — link provider rusak/kadaluarsa atau cuma stub kosong.` };
}

function stripBearer(value: string): string {
  let out = String(value || "").replace(/^\uFEFF/, "").trim();
  // Toleransi paste berupa `Authorization: Bearer ...`, `Bearer ...`,
  // atau token yang ikut dibungkus tanda kutip dari JSON/dashboard.
  out = out.replace(/^Authorization\s*:\s*/i, "").trim();
  if ((out.startsWith("\"") && out.endsWith("\"")) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }
  out = out.replace(/^Bearer\s+/i, "").trim();
  if ((out.startsWith("\"") && out.endsWith("\"")) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function buildHeaders(key: string, provider?: Provider): Record<string,string> {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  if (!key) return h;
  // 🎵 v19.61: Suno Resmi pakai COOKIE (session suno.com), bukan Authorization.
  if (provider === "suno-resmi") {
    h["Cookie"] = stripBearer(key);
    return h;
  }
  // Semua provider Bearer dinormalisasi case-insensitive. Sebelumnya paste
  // "bearer sk-..." menghasilkan "Bearer bearer sk-..." dan pasti 401.
  const rawKey = stripBearer(key);
  // 🎵 v19.78 TTAPI wajib header TT-API-KEY (Authorization hanya cadangan).
  if (provider === "ttapi") {
    h["TT-API-KEY"] = rawKey;
    h["Authorization"] = `Bearer ${rawKey}`;
    return h;
  }
  // Sunor membaca x-api-key; provider lain memakai Bearer. Header tambahan
  // untuk provider Sunor dipertahankan agar key lama tetap kompatibel.
  if (provider === "sunor") {
    h["x-api-key"] = rawKey;
    h["apikey"] = rawKey;
  }
  h["Authorization"] = `Bearer ${rawKey}`;
  return h;
}

function getEndpoints(provider: Provider, base: string, forStatus?: string): string[] {
  if (forStatus) {
    if (provider === "musicapi") return [`${base}/api/v1/sonic/task/${forStatus}`]; // 🎵 v19.69 (terverifikasi 401=hidup)
    if (provider === "aimusicapi") return [`${base}/api/v1/sonic/task/${forStatus}`]; // 🎵 API reference AIMusicAPI
    if (provider === "mureka") return [`${base}/v1/song/query/${forStatus}`]; // 🎵 v19.64 GET /v1/song/query/{task_id}
    if (provider === "suno-resmi") return [`${base}/api/v1/feed/${forStatus}`, `${base}/api/v1/feed/${forStatus}/clips`]; // 🎵 v19.61
    if (provider === "sunor") return [`${base}/api/v1/task/${forStatus}`]; // v10.5: GET task/{id}
    if (provider === "evolink") return [`${base}/v1/tasks/${forStatus}`];
    if (provider === "cometapi") return [`${base}/suno/fetch/${forStatus}`];
    if (provider === "ttapi") return [`${base}/suno/v2/fetch?jobId=${encodeURIComponent(forStatus)}`];
    if (provider === "kie" || provider === "sunoapi") {
      return [
        `${base}/generate/record-info?taskId=${forStatus}`,
      ];
    }
    return [
      `${base}/v1/status/${forStatus}`,
      `${base}/v1/music/status/${forStatus}`,
      `${base}/api/v1/status/${forStatus}`,
      `${base}/status/${forStatus}`,
      `${base}/api/status/${forStatus}`,
      `${base}/feed/${forStatus}`,
      `${base}/v1/feed/${forStatus}`,
    ];
  }
  if (provider === "suno-resmi") {
    return [`${base}/api/v1/music`, `${base}/api/v1/music/custom`]; // 🎵 v19.61 (custom dipakai kalau lirik)
  }
  if (provider === "mureka") {
    return [`${base}/v1/song/generate`]; // 🎵 v19.64
  }
  if (provider === "musicapi") {
    return [`${base}/api/v1/sonic/create`]; // 🎵 v19.69 (terverifikasi 401=hidup)
  }
  if (provider === "aimusicapi") {
    return [`${base}/api/v1/sonic/create`]; // 🎵 API reference AIMusicAPI
  }
  if (provider === "kie" || provider === "sunoapi") {
    return [`${base}/generate`];
  }
  // 🎵 v19.79: JANGAN jatuh ke daftar generik — itu yang bikin TTAPI
  // nyasar ke /v1/suno/generate (404 Route Not Found).
  if (provider === "evolink") return [`${base}/v1/audios/generations`];
  if (provider === "cometapi") return [`${base}/suno/submit/music`];
  if (provider === "ttapi") return [`${base}/suno/v1/music`];
  if (provider === "sunor") return [`${base}/api/v1/task`]; // v10.5: POST task — satu-satunya jalur resmi
  return [
    `${base}/v1/generate`,
    `${base}/v1/music/generate`,
    `${base}/api/generate`,
    `${base}/generate`,
    `${base}/suno/generate`,
    `${base}/v1/suno/generate`,
  ];
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { key, base, provider } = getCreds(req);
    // 🐛 FIX v19.35.6: apiframe MATI (404) — tolak lebih dulu, jangan buang waktu
    if (provider === "apiframe") {
      return NextResponse.json({ error: "apiframe.ai sudah MATI (endpoint 404). Pilih 🥇 Kie.ai atau Sunor.cc di panel Provider — dan tambah key-nya di 🔑 Setelan API Key.", status: "provider_mati", provider }, { status: 502 });
    }
    const referenceMode = payload?.operation === "sample";
    if (referenceMode && !/^https?:\/\//i.test(String(payload?.audio_url || payload?.audioUrl || ""))) {
      return NextResponse.json({ error: "Audio reference belum punya URL publik. Upload/rekam lewat panel Audio Reference dulu.", status: "reference_url_required", provider }, { status: 400 });
    }
    if (referenceMode) {
      const sampleStart = Number(payload?.sample_start ?? 0);
      const sampleEnd = Number(payload?.sample_end ?? 0);
      if (!Number.isFinite(sampleStart) || !Number.isFinite(sampleEnd) || sampleEnd - sampleStart < 6 || sampleEnd - sampleStart > 60) {
        return NextResponse.json({ error: "Audio reference harus berdurasi antara 6 dan 60 detik.", status: "reference_duration_invalid", provider }, { status: 400 });
      }
    }
    if (referenceMode && !REFERENCE_PROVIDERS.has(provider)) {
      return NextResponse.json({
        error: `Mode Audio Reference belum didukung oleh ${PROVIDERS[provider].label}. Pilih MusicAPI, AIMusicAPI, Kie.ai, CometAPI, atau TTAPI untuk mode ini.`,
        status: "reference_unsupported", provider,
      }, { status: 422 });
    }
    const headers = buildHeaders(key, provider);

    // 🎛 BOS (L3.5): kill switch + batas harian untuk fitur musik — sebelum keluar duit Suno
    const _g = await gerbangFitur("musik");
    if (_g.blokir) {
      return NextResponse.json({ error: _g.alasan, status: "fitur_dimatikan", provider }, { status: 503 });
    }

    // 🛡 v19.35.4: tanpa key SAMA SEKALI → jangan coba-coba ke provider (buang waktu),
    // langsung kasih tahu cara dapat key gratis. (Dulu diam-diam nyoba provider mati.)
    if (!key) {
      return NextResponse.json({
        error: "Generate lagu butuh API key provider. Cara dapat GRATIS: daftar Kie.ai (dapat 5.000 kredit) → buka https://kie.ai/api-key → salin key → di sini tap 🔑 Setelan API Key → tempel key → Tambah. (Provider 'gratis tanpa key' sudah tidak tersedia.)",
        status: "need_key", provider,
      }, { status: 401 });
    }

    let requestPayload = payload;
    if (referenceMode && provider === "cometapi") {
      try {
        const coverClipId = await uploadCometReference(String(payload?.audio_url || payload?.audioUrl || ""), base, headers);
        requestPayload = { ...payload, cover_clip_id: coverClipId };
      } catch (error: any) {
        return NextResponse.json({
          error: `CometAPI gagal menyiapkan upload audio: ${String(error?.message || "clip_id tidak diterima").slice(0, 180)}`,
          status: "reference_upload_failed", provider,
        }, { status: 502 });
      }
    }
    const body = referenceMode ? buildReferenceBody(requestPayload, provider) : buildBody(requestPayload, provider);
    if (referenceMode && !body) {
      return NextResponse.json({ error: "Konfigurasi Audio Reference provider tidak tersedia.", status: "reference_unsupported", provider }, { status: 422 });
    }
    const endpoints = referenceMode ? getReferenceEndpoints(provider, base) : getEndpoints(provider, base);

    let lastErr: any = null;
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        // Vercel serverless punya batas ~60s. Kasih timeout 55s biar masih sempat balas.
        const timeout = setTimeout(()=>controller.abort(), 55000);
        const _t0 = Date.now(); // 🧾 L3: timer pencatat kredit
        const r = await fetch(url, {
          method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: `Non-JSON (${r.status}): ${txt.slice(0,200)}` }; }
        // 🧾 L3: catat panggilan musik berbayar (fire-and-forget — tak mengubah alur rute)
        catatKredit({ fitur: "musik", model: (body as any)?.model || (body as any)?.mv || null,
          endpoint: url, penyedia: provider, ok: r.ok, ms: Date.now() - _t0,
          err: r.ok ? null : (typeof data?.error === "string" ? data.error : `HTTP ${r.status}`) });

        if (!r.ok) {
          if (r.status === 401 || r.status === 403) {
            // Sebagian provider memakai 403 untuk kredit habis, bukan auth.
            if (r.status === 403 && /credit|quota|balance|subscription|insufficient/i.test(txt)) {
              return NextResponse.json({
                error: `Kredit ${PROVIDERS[provider].label} habis atau akun belum aktif. Cek saldo/dashboard provider, lalu coba lagi.`,
                status: "quota_error", provider,
              }, { status: 402 });
            }
            const msg = `API key ${PROVIDERS[provider].label} ditolak. Pastikan key dibuat di dashboard ${PROVIDERS[provider].label} (bukan key provider lain), lalu tempel tokennya tanpa kata Bearer atau tanda kutip.`;
            return NextResponse.json({ error: msg, status: "auth_error", provider }, { status: 401 });
          }
          if (r.status === 402) {
            return NextResponse.json({
              error: `Kredit ${PROVIDERS[provider].label} habis bro. Top up dulu di dashboard.`,
              status: "quota_error", provider,
            }, { status: 402 });
          }
          // 🐛 v19.67: 429 = kuota/rate-limit habis (banyak provider balas 429, bukan 402) —
          // dulu jadi error mentah bahasa Inggris. Sekarang pesan Indonesia + status quota_error
          // biar client otomatis buka panel GANTI KEY.
          if (r.status === 429) {
            const isQuota = /quota|limit|exceeded|credit/i.test(txt);
            const pesan = isQuota
              ? (provider === "mureka"
                  ? "Kredit Mureka habis / rate limit — free credits udah kepakai. Bikin akun BARU (email baru) di platform.mureka.ai buat free credits lagi, atau ganti provider di atas."
                  : `Kredit ${PROVIDERS[provider].label} habis / rate limit. Top up, atau daftar akun baru (email baru) buat free credits lagi.`)
              : `${PROVIDERS[provider].label} nolak (429). Coba lagi sebentar, atau ganti provider.`;
            return NextResponse.json({ error: pesan, status: "quota_error", provider }, { status: 402 });
          }
          if (r.status === 504 || r.status === 503 || r.status === 408) {
            lastErr = `${PROVIDERS[provider].label} sedang sibuk (${r.status}), coba lagi...`;
            continue;
          }
          lastErr = `${url} → ${r.status}: ${txt.slice(0,200)}`;
          continue;
        }

        const n = normalize(data, provider);
        if (n.status === "error") {
          const providerError = String(n.error || data?.msg || data?.message || "");
          const providerCode = Number(data?.code);
          // Beberapa gateway mengirim HTTP 200 dengan code=401/403/402.
          if (providerCode === 401 || /unauthori[sz]|authentication.*(?:fail|required)|api.?key.*(?:incorrect|invalid)|invalid.*(?:api.?key|token)|missing.*(?:api.?key|authorization)|no token provided/i.test(providerError)) {
            return NextResponse.json({
              error: `API key ${PROVIDERS[provider].label} ditolak. Pastikan key dibuat di dashboard ${PROVIDERS[provider].label} (bukan key provider lain), lalu tempel tokennya tanpa kata Bearer atau tanda kutip.`,
              status: "auth_error", provider,
            }, { status: 401 });
          }
          // 💳 Kredit/saldo habis kadang datang sebagai HTTP 200 ber-code error.
          if (providerCode === 402 || /insufficient|not enough|balance|quota|kredit/i.test(providerError)) {
            return NextResponse.json({
              error: `Kredit ${PROVIDERS[provider].label} habis atau saldo tidak cukup. Cek dashboard, atau tambah kunci/provider lain lewat 🔑 Setelan API Key.`,
              status: "quota_error", provider,
            }, { status: 402 });
          }
          lastErr = `${url}: ${providerError}`; continue;
        }
        if (n.id || n.audio_url) {
          n.provider = provider;
          // 🐛 v19.63: kalau provider KASIH AUDIO LANGSUNG → validasi dulu, jangan "jadi" palsu
          if (n.audio_url) {
            const urls = (Array.isArray(n.audio_urls) && n.audio_urls.length) ? n.audio_urls : [n.audio_url];
            const cek = await cekUrlAudioValid(urls[0], headers);
            if (!cek.ok) {
              return NextResponse.json({
                error: `Provider selesai tapi audio-nya ${cek.msg} Ini bukan salah aplikasi — provider yang kasih link rusak. Coba generate ulang, atau ganti provider.`,
                status: "audio_rusak", provider,
              }, { status: 502 });
            }
            n.audio_needs_auth = !!cek.requiresAuth;
          }
          return NextResponse.json(n);
        }
        lastErr = `Empty response from ${url}: ${txt.slice(0,200)}`;
      } catch(e:any){
        lastErr = `${PROVIDERS[provider].label} tidak bisa dihubungi dari server (koneksi gagal) — coba lagi, atau ganti provider lain.`; // v10.5: bahasa manusia, bukan bahasa mesin
        // retry endpoint berikutnya kalau abort/network
      }
    }

    const rawLast = String(lastErr || "");
    const pesan404 = /404|Route Not Found|Interface Not Found/i.test(rawLast)
      ? `Endpoint ${PROVIDERS[provider].label} salah/404. Coba generate ulang setelah update, atau ganti provider (Kie/Sunor).`
      : rawLast;
    return NextResponse.json({ error: `AI music error (${PROVIDERS[provider].label}): ${pesan404}`, provider }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: `AI music gagal: ${e.message}` }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id diperlukan" }, { status: 400 });
    const { key, base, provider } = getCreds(req);
    // 🐛 FIX v19.35.6: apiframe MATI — tolak lebih dulu
    if (provider === "apiframe") {
      return NextResponse.json({ status: "error", error: "apiframe.ai sudah MATI — pilih Kie.ai atau Sunor.cc." });
    }
    const headers = buildHeaders(key, provider);
    const endpoints = getEndpoints(provider, base, id);

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        // 🛡 v19.35.4: timeout polling DIPERCEPAT ke 8s — respons server harus cepat,
        // biar muat di Vercel & client nggak nunggu lama (dulu 15s × beberapa endpoint
        // = bisa bikin client "Failed to fetch").
        const t = setTimeout(()=>controller.abort(), 8000);
        const r = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
        clearTimeout(t);
        const txt = await r.text().catch(() => "");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = {}; }
        if (!r.ok) {
          // Jangan mengubah 401/402 menjadi "pending" selamanya. Ini yang
          // membuat key MusicAPI yang ditolak terlihat seperti server timeout.
          if (r.status === 401 || r.status === 403) {
            if (r.status === 403 && /credit|quota|balance|subscription|insufficient/i.test(txt)) {
              return NextResponse.json({ status: "error", error: `Kredit ${PROVIDERS[provider].label} habis atau akun belum aktif. Cek dashboard provider.`, provider }, { status: 402 });
            }
            return NextResponse.json({ status: "error", error: `API key ${PROVIDERS[provider].label} ditolak. Pastikan key dibuat di dashboard provider yang sama.`, provider }, { status: 401 });
          }
          if (r.status === 402 || r.status === 429) {
            return NextResponse.json({ status: "error", error: `Kredit ${PROVIDERS[provider].label} habis atau sedang rate-limit. Cek dashboard provider.`, provider }, { status: 402 });
          }
          continue;
        }
        const n = normalize(data, provider);
        n.provider = provider;
        if (n.status === "error") {
          const providerError = String(n.error || data?.msg || data?.message || "");
          const providerCode = Number(data?.code);
          if (providerCode === 401 || /unauthori[sz]|authentication.*(?:fail|required)|api.?key.*(?:incorrect|invalid)|invalid.*(?:api.?key|token)|missing.*(?:api.?key|authorization)|no token provided/i.test(providerError)) {
            return NextResponse.json({ status: "error", error: `API key ${PROVIDERS[provider].label} ditolak. Pastikan key dibuat di dashboard provider yang sama.`, provider }, { status: 401 });
          }
          if (providerCode === 402 || /insufficient|not enough|balance|quota|kredit/i.test(providerError)) {
            return NextResponse.json({ status: "error", error: `Kredit ${PROVIDERS[provider].label} habis atau saldo tidak cukup.`, provider }, { status: 402 });
          }
        }
        if (n.audio_url || n.status === "error" || n.status === "completed") {
          // 🐛 v19.63: validasi audio sebelum "jadi" — cegah "0:00 / 0:00" palsu
          if (n.audio_url) {
            const urls = (Array.isArray(n.audio_urls) && n.audio_urls.length) ? n.audio_urls : [n.audio_url];
            const cek = await cekUrlAudioValid(urls[0], headers);
            if (!cek.ok) {
              return NextResponse.json({
                status: "error",
                error: `Lagu selesai dibuat tapi file audio-nya ${cek.msg} (kredit mungkin kepakai). Coba generate ulang, atau ganti provider.`,
                provider,
              });
            }
            n.audio_needs_auth = !!cek.requiresAuth;
          }
          return NextResponse.json(n);
        }
        if (n.id) return NextResponse.json({ status: "pending", id: n.id, provider });
      } catch {}
    }
    return NextResponse.json({ status: "pending", provider });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}
