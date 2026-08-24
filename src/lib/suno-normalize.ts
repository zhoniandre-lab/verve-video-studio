/* =====================================================================
   NORMALISASI RESPONS PROVIDER LAGU (v19.35.6) — 100% orisinal
   Dipakai route /api/hcnsec/music (POST generate + GET polling).
   Dipisah ke lib MURNI supaya bisa diuji di Node dengan sampel respons
   asli tiap provider (tests/suno-normalize.test.mjs).
   ===================================================================== */

export type ProvLagu = "kie" | "apiframe" | "sunor" | "suno-resmi" | "mureka" | "musicapi" | "aimusicapi" | "sunoapi" | "evolink" | "cometapi" | "ttapi";

export interface KlipLagu {
  url: string;
  title?: string;
  duration?: number;
  image_url?: string;
  id?: string;
}

export interface HasilNormal {
  id?: string;
  status: "pending" | "completed" | "error";
  audio_url?: string;
  /** URL tiap VERSI lagu (bukan potongan). JANGAN digabung jadi 1 file. */
  audio_urls?: string[];
  /** 🎵 v19.77: tiap item = SATU lagu utuh (Suno selalu kasih 2 variasi). */
  clips?: KlipLagu[];
  title?: string;
  image_url?: string;
  duration?: number;
  error?: string;
  /** ditambahkan route sesudahnya (asal provider) */
  provider?: string;
}

/** Cari URL audio di kedalaman mana pun (sunoData → songs → clips → data → result → …).
 *  Tidak bergantung satu format saja — wrapper Suno/Kie sering beda versi. */
export function cariAudioRekursif(o: any, dalem = 0, cakup?: Set<any>): string {
  if (!o || typeof o !== "object" || dalem > 7) return "";
  const seen = cakup || new Set<any>();
  if (seen.has(o)) return "";
  seen.add(o);
  if (Array.isArray(o)) {
    for (const it of o) { const u = cariAudioRekursif(it, dalem + 1, seen); if (u) return u; }
    return "";
  }
  for (const k of ["audio_url", "audioUrl", "stream_url", "streamUrl", "streamAudioUrl", "url", "audio"]) {
    const v = o[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  for (const k of Object.keys(o)) {
    const u = cariAudioRekursif(o[k], dalem + 1, seen);
    if (u) return u;
  }
  return "";
}

/** 🐛 v19.61: KUMPULKAN SEMUA URL audio di kedalaman mana pun (bukan cuma pertama).
 *  Lagu Suno panjang (4-8 menit) sering dikembalikan provider sebagai BEBERAPA segmen —
 *  dulu cuma segmen pertama yang diambil → lagu 'kepotong tidak tuntas'. */
export function kumpulAudioRekursif(o: any, dalem = 0, cakup?: Set<any>): string[] {
  const out: string[] = [];
  if (!o || typeof o !== "object" || dalem > 8) return out;
  const seen = cakup || new Set<any>();
  if (seen.has(o)) return out;
  seen.add(o);
  if (Array.isArray(o)) {
    for (const it of o) out.push(...kumpulAudioRekursif(it, dalem + 1, seen));
    return out;
  }
  for (const k of ["audio_url", "audioUrl", "stream_url", "streamUrl", "streamAudioUrl", "url", "audio"]) {
    const v = o[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) out.push(v);
  }
  for (const k of Object.keys(o)) out.push(...kumpulAudioRekursif(o[k], dalem + 1, seen));
  return out;
}
function unik(list: string[]): string[] {
  return Array.from(new Set(list.filter((x) => typeof x === "string" && x.startsWith("http"))));
}

const KEY_AUDIO_UTAMA = ["audio_url", "audioUrl"] as const;
const KEY_AUDIO_STREAM = ["stream_url", "streamUrl", "streamAudioUrl"] as const;

/** Satu URL terbaik per objek lagu — utamakan file jadi, bukan stream preview. */
export function urlAudioDariObj(o: any): string {
  if (!o || typeof o !== "object") return "";
  const bagus = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v) && !/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(v);
  for (const k of KEY_AUDIO_UTAMA) { if (bagus(o[k])) return o[k]; }
  for (const k of KEY_AUDIO_STREAM) { if (bagus(o[k])) return o[k]; }
  for (const k of ["url", "audio"]) {
    const v = o[k];
    if (bagus(v) && /\.(mp3|wav|m4a|ogg|flac|aac|opus)(\?|$)/i.test(String(v))) return String(v);
  }
  return "";
}

function objekLagu(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  return KEY_AUDIO_UTAMA.some((k) => typeof o[k] === "string") || KEY_AUDIO_STREAM.some((k) => typeof o[k] === "string");
}

/**
 * 🎵 v19.77: ambil KLIP = satu lagu utuh per item (sunoData/songs/clips/data).
 * Bukan dump semua URL (audio+stream+variasi) — itu yang bikin 2 lagu beda
 * kesambung jadi 1 file ±13 menit.
 */
export function ambilKlipLagu(root: any): KlipLagu[] {
  const clips: KlipLagu[] = [];
  const seenUrl = new Set<string>();
  const seenId = new Set<string>();
  const push = (o: any) => {
    const url = urlAudioDariObj(o);
    if (!url) return;
    const id = String(o.id || o.clip_id || o.clipId || o.song_id || o.songId || "");
    if (id && seenId.has(id)) return;
    if (seenUrl.has(url)) return;
    if (id) seenId.add(id);
    seenUrl.add(url);
    const dur = Number(o.duration || o.duration_seconds || o.durationSeconds);
    clips.push({
      url,
      title: typeof o.title === "string" ? o.title : (typeof o.name === "string" ? o.name : undefined),
      duration: isFinite(dur) && dur > 0 ? dur : undefined,
      image_url: o.image_url || o.imageUrl || o.cover_url || o.image || undefined,
      id: id || undefined,
    });
  };
  const walk = (o: any, dalem = 0, seen?: Set<any>) => {
    if (!o || typeof o !== "object" || dalem > 8) return;
    const cakup = seen || new Set<any>();
    if (cakup.has(o)) return;
    cakup.add(o);
    if (Array.isArray(o)) {
      const lagu = o.filter(objekLagu);
      if (lagu.length) {
        for (const it of lagu) push(it);
        for (const it of o) { if (!objekLagu(it)) walk(it, dalem + 1, cakup); }
        return;
      }
      for (const it of o) walk(it, dalem + 1, cakup);
      return;
    }
    for (const k of ["sunoData", "songs", "clips", "tracks", "result_data", "musics"]) {
      if (Array.isArray(o[k])) walk(o[k], dalem + 1, cakup);
    }
    if (objekLagu(o)) push(o);
    for (const k of Object.keys(o)) {
      if (k === "sunoData" || k === "songs" || k === "clips" || k === "tracks" || k === "result_data" || k === "musics") continue;
      walk(o[k], dalem + 1, cakup);
    }
  };
  walk(root);
  return clips;
}

/** Kalau struktur aneh (tidak ada objek lagu), jatuh ke kumpulan URL unik — tetap 1 URL = 1 versi. */
export function clipsDariRespons(d: any): KlipLagu[] {
  const clips = ambilKlipLagu(d);
  if (clips.length) return clips;
  return unik(kumpulAudioRekursif(d)).map((url) => ({ url }));
}

/** Client: ambil daftar versi dari jawaban API / storage. JANGAN concat. */
export function pilihKlipDariHasil(j: any): KlipLagu[] {
  if (Array.isArray(j?.clips) && j.clips.length) {
    return j.clips.filter((c: any) => c && typeof c.url === "string" && /^https?:\/\//.test(c.url));
  }
  const dariObj = clipsDariRespons(j);
  if (dariObj.length) return dariObj;
  const urls: string[] = [];
  if (Array.isArray(j?.audio_urls)) {
    for (const u of j.audio_urls) if (typeof u === "string" && u.startsWith("http")) urls.push(u);
  } else if (typeof j?.audio_url === "string" && j.audio_url.startsWith("http")) {
    urls.push(j.audio_url);
  }
  return unik(urls).map((url) => ({
    url,
    title: typeof j?.title === "string" ? j.title : undefined,
    duration: Number(j?.duration) > 0 ? Number(j.duration) : undefined,
    image_url: j?.image_url,
  }));
}
/** Normalisasi respons Kie.ai — generate & poll. */
export function normalizeKie(d: any): HasilNormal {
  if (d?.code !== 200 && d?.code !== 0) {
    return { status: "error", error: d?.msg || "Kie error" };
  }
  const data = d.data || {};
  if ((data.taskId || data.id) && !data.response) {
    return { id: data.taskId || data.id, status: "pending" };
  }
  const st = String(data.status || "pending").toUpperCase();
  if (st === "SUCCESS" || st === "FIRST_SUCCESS" || st === "COMPLETED" || st === "DONE") {
    const items = data.response?.sunoData || data.response?.data || data.sunoData || data.response || [];
    const first: any = Array.isArray(items) ? (items[0] || {}) : items;
    let clips = clipsDariRespons(data.response?.sunoData ? data.response : data);
    if (!clips.length) clips = clipsDariRespons(data);
    return {
      id: data.taskId || data.id || first.id || "",
      status: "completed",
      audio_url: clips[0]?.url || "",
      audio_urls: clips.map((c) => c.url),
      clips,
      title: clips[0]?.title || first.title || "",
      image_url: clips[0]?.image_url || first.imageUrl || "",
      duration: clips[0]?.duration ?? (first.duration && clips.length ? first.duration / clips.length : first.duration),
    };
  }
  if (st.includes("FAIL") || st.includes("ERROR")) {
    return { status: "error", error: data.errorMessage || st };
  }
  return { id: data.taskId || data.id, status: "pending" };
}

/** 🎵 v19.64 Normalisasi respons Mureka — generate {task_id?} & poll
 *  GET /v1/song/query/{id} → {status: "success"|"running"|"pending", data:[{song:{audio_url,…}}]…}
 *  Toleran: pakai kumpulAudioRekursif + deteksi status teks. */
export function normalizeMureka(d: any): HasilNormal {
  const statusRaw = String(d?.status || d?.state || d?.code || "").toLowerCase();
  const taskId = d?.task_id || d?.taskId || d?.id || "";
  if (statusRaw && /success|succeeded|completed|done|finished/.test(statusRaw)) {
    const clips = clipsDariRespons(d);
    return {
      id: taskId,
      status: "completed",
      audio_url: clips[0]?.url || "",
      audio_urls: clips.map((c) => c.url),
      clips,
      title: clips[0]?.title || d?.title || d?.song?.title || "",
      image_url: clips[0]?.image_url || d?.cover_url || d?.image_url || "",
      duration: clips[0]?.duration || Number(d?.duration || d?.song?.duration || 0) || undefined,
    };
  }
  if (statusRaw && /fail|error|exception/.test(statusRaw)) {
    return { id: taskId, status: "error", error: d?.message || d?.error || statusRaw };
  }
  // belum selesai / task baru dibuat
  return { id: taskId || (d?.data?.task_id || ""), status: taskId ? "pending" : "pending" };
}

/** Normalisasi respons Sunor.cc — generate {data:{task_id}} & poll {data:{status, output}}. */
export function normalizeSunor(d: any): HasilNormal {
  const d0 = d.data || d || {};
  if ((d0.task_id || d0.id) && !d0.status && !d0.state) return { id: d0.task_id || d0.id, status: "pending" };
  const st = String(d0.status || d0.state || "pending").toLowerCase();
  if (st === "success" || st === "completed" || st === "succeeded" || st === "complete" || st === "done") {
    const out = d0.output ?? d0.result ?? d0.data ?? {};
    const first: any = Array.isArray(out) ? (out[0] || {})
      : (out.sunoData?.[0] || out.songs?.[0] || out.clips?.[0] || (Array.isArray(out.data) ? out.data[0] : null) || out || {});
    const clips = clipsDariRespons(out.sunoData || out.songs || out.clips || out);
    return {
      id: d0.task_id || d0.id || first.id || "",
      status: "completed",
      audio_url: clips[0]?.url || "",
      audio_urls: clips.map((c) => c.url),
      clips,
      title: clips[0]?.title || first.title || d0.title || "",
      image_url: clips[0]?.image_url || first.image_url || first.imageUrl || first.cover_url || "",
      duration: clips[0]?.duration ?? (first.duration && clips.length ? first.duration / clips.length : first.duration),
    };
  }
  if (st === "failure" || st === "error" || st === "failed" || st === "timeout") {
    return { status: "error", error: d0.error || d0.message || d0.fail_reason || `Sunor: ${st}` };
  }
  return { id: d0.task_id || d0.id || "", status: "pending" };
}

/** Normalisasi provider generik (MusicAPI / AIMusicAPI / suno-resmi). */
export function normalizeGeneric(d: any): HasilNormal {
  const items = d.data || (Array.isArray(d) ? d : [d]);
  const first = items[0] || d || {};
  const clips = clipsDariRespons(d); // 🎵 v19.77: tiap URL = 1 versi, bukan segmen
  const audioUrl = clips[0]?.url || cariAudioRekursif(first) || cariAudioRekursif(d);
  // MusicAPI/AIMusicAPI menyebut status task sebagai `state`, bukan `status`.
  const rawStatus = first.status || first.state || d.status || d.state || "pending";
  let status = String(rawStatus).toLowerCase();
  if (audioUrl && (status === "pending" || status === "processing" || status === "submitted" || status === "queued" || status === "running")) {
    status = "completed";
  }
  if (/complete|success|succeed|done/i.test(status)) status = "completed";
  if (/error|fail|cancel/i.test(status)) status = "error";
  return {
    id: first.id || d.id || d.task_id || "",
    status: status as any,
    audio_url: audioUrl,
    audio_urls: clips.length ? clips.map((c) => c.url) : (audioUrl ? [audioUrl] : []),
    clips,
    title: clips[0]?.title || first.title || d.title || "",
    image_url: clips[0]?.image_url || first.image_url || first.cover || first.image || d.image_url || "",
    duration: clips[0]?.duration ?? (first.duration && clips.length ? first.duration / clips.length : first.duration),
    error: status === "error" ? String(first.error || first.message || d.error || d.message || status) : undefined,
  };
}

/** 🎵 v19.78 EvoLink — POST /v1/audios/generations → {id,status:pending}
 *  GET /v1/tasks/{id} → {status:completed, result_data:[{audio_url,…}]} */
export function normalizeEvolink(d: any): HasilNormal {
  const id = String(d?.id || d?.task_id || d?.data?.id || "");
  const st = String(d?.status || d?.data?.status || "pending").toLowerCase();
  if (/fail|error|cancel/.test(st)) {
    const err = (typeof d?.error === "object" ? d.error?.message : d?.error) || d?.message || st;
    return { id, status: "error", error: String(err) };
  }
  const clips = clipsDariRespons(d);
  if (clips.length && (/complete|success|done/.test(st) || Number(d?.progress) === 100)) {
    return {
      id, status: "completed",
      audio_url: clips[0].url, audio_urls: clips.map((c) => c.url), clips,
      title: clips[0].title, image_url: clips[0].image_url, duration: clips[0].duration,
    };
  }
  if (id) return { id, status: "pending" };
  return { id: "", status: "pending" };
}

/** 🎵 v19.78 CometAPI — POST /suno/submit/music → {data:"taskId"}
 *  GET /suno/fetch/{id} → {data:{status, data:[{audio_url}]}} */
export function normalizeComet(d: any): HasilNormal {
  const id = typeof d?.data === "string" && d.data
    ? String(d.data)
    : String(d?.data?.task_id || d?.data?.id || d?.task_id || d?.id || "");
  const inner = d?.data && typeof d.data === "object" ? d.data : d;
  const st = String(inner?.status || d?.status || d?.code || "").toLowerCase();
  if (/fail|error/.test(st) && st !== "success") {
    return { id, status: "error", error: String(inner?.fail_reason || inner?.message || d?.message || st) };
  }
  const clips = clipsDariRespons(inner?.data || inner || d);
  if (clips.length) {
    return {
      id, status: "completed",
      audio_url: clips[0].url, audio_urls: clips.map((c) => c.url), clips,
      title: clips[0].title || inner?.title, image_url: clips[0].image_url, duration: clips[0].duration,
    };
  }
  if (id) return { id, status: "pending" };
  return { id: "", status: "pending" };
}

/** 🎵 v19.78 TTAPI — POST /suno/v1/music → {status:SUCCESS, data:{jobId}}
 *  (SUCCESS di sini = job diterima, BUKAN lagu jadi.)
 *  GET /suno/v2/fetch?jobId= → {status:ON_QUEUE|SUCCESS|FAILED, data:{musics:[{audioUrl}]}} */
export function normalizeTtapi(d: any): HasilNormal {
  const jobId = String(d?.data?.jobId || d?.jobId || d?.data?.id || d?.id || "");
  const st = String(d?.status || d?.data?.status || "").toUpperCase();
  if (st === "FAILED" || st === "ERROR" || /FAIL/.test(st)) {
    return { id: jobId, status: "error", error: String(d?.message || d?.data?.failReason || d?.data?.message || st) };
  }
  const clips = clipsDariRespons(d?.data?.musics || d?.data || d);
  if (clips.length && (st === "SUCCESS" || st === "COMPLETED" || st === "DONE")) {
    return {
      id: jobId, status: "completed",
      audio_url: clips[0].url, audio_urls: clips.map((c) => c.url), clips,
      title: clips[0].title, image_url: clips[0].image_url, duration: clips[0].duration,
    };
  }
  if (jobId) return { id: jobId, status: "pending" };
  return { id: "", status: "pending" };
}

/** Normalisasi utuh per provider. */
export function normalizeLagu(d: any, provider: ProvLagu): HasilNormal {
  if (provider === "kie" || provider === "sunoapi") return normalizeKie(d);
  if (provider === "sunor") return normalizeSunor(d);
  if (provider === "mureka") return normalizeMureka(d);
  if (provider === "evolink") return normalizeEvolink(d);
  if (provider === "cometapi") return normalizeComet(d);
  if (provider === "ttapi") return normalizeTtapi(d);
  return normalizeGeneric(d);
}

/** 🐛 v19.80 Probe Range audio: CDN Suno/TTAPI balas 206 Partial Content
 *  + tepat 2048 byte (ukuran potongan yang KITA minta). Itu BUKAN file kosong.
 *  Dulu cuma terima 200 → lagu jadi malah ditolak. */
export function probeAudioCukup(status: number, bytes: number): boolean {
  if (!Number.isFinite(status) || !Number.isFinite(bytes) || bytes < 200) return false;
  return status === 200 || status === 206;
}

/** 🐛 v19.81 PROBE LENGKAP — INI yang dipakai route (v19.80 cuma bikin
 *  probeAudioCukup tapi LUPA dipasang → lagu jadi masih dibilang kosong).
 *  total = ukuran file ASLI dari header Content-Range ("bytes 0-2047/5242880").
 *  - 206 + 2048 byte = CDN kirim potongan yang kita minta → file ≥ 2048 (VALID).
 *  - 206 + total ≤ 2048 = file beneran cuma 2048 byte (stub kosong) → TOLAK.
 *  - 200 = file utuh; harus > 2048 byte biar bukan stub 0 detik. */
export interface ProbeAudio { status: number; bytes: number; total?: number }
export function audioProbeCukup(p: ProbeAudio): boolean {
  if (!p || !probeAudioCukup(p.status, p.bytes)) return false;
  if (typeof p.total === "number" && Number.isFinite(p.total)) return p.total > 2048;
  if (p.status === 206) return p.bytes >= 2048;
  return p.bytes > 2048;
}

/** Model key seragam: UI lama memakai underscore (V4_5PLUS), provider memakai titik/hyphen. */
function normalisasiModel(modelId: string, fallback = "v5.5"): string {
  return String(modelId || fallback)
    .toLowerCase()
    .replace(/_/g, ".")
    .replace(/v(\d+)-(\d+)/g, "v$1.$2");
}

/** Peta model ke format Kie. */
export function mapModelKie(modelId: string): string {
  const m = normalisasiModel(modelId);
  if (m.includes("v5.5")) return "V5_5";
  if (m.includes("v5")) return "V5";
  if (m.includes("v4.5plus")) return "V4_5PLUS";
  if (m.includes("v4.5all")) return "V4_5ALL";
  if (m.includes("v4.5")) return "V4_5";
  if (m.includes("v4")) return "V4";
  if (m.includes("v3.5")) return "V3_5";
  return "V5_5";
}

/** Peta model ke format generik suno-compatible. */
export function mapModelGeneric(modelId: string): string {
  const m = normalisasiModel(modelId);
  if (m.includes("v5.5")) return "suno-v5.5";
  if (m.includes("v5")) return "suno-v5";
  if (m.includes("v4.5plus")) return "suno-v4.5plus";
  if (m.includes("v4.5all")) return "suno-v4.5all";
  if (m.includes("v4.5")) return "suno-v4.5";
  if (m.includes("v4")) return "suno-v4";
  if (m.includes("v3.5")) return "chirp-v3.5";
  return m;
}

/** Peta model MusicAPI (sonic-v*). */
export function mapModelMusicApi(modelId: string): string {
  const m = normalisasiModel(modelId);
  if (m.includes("v5.5")) return "sonic-v5-5";
  if (m.includes("v5")) return "sonic-v5";
  if (m.includes("v4.5plus")) return "sonic-v4-5-plus";
  if (m.includes("v4.5")) return "sonic-v4-5";
  if (m.includes("v4")) return "sonic-v4";
  return "sonic-v3-5";
}

/** Peta model AIMusicAPI (kontrak Sonic memakai sonic-v* pada reference API). */
export function mapModelAimusicApi(modelId: string): string {
  return mapModelMusicApi(modelId);
}

/** 🎵 v19.78 EvoLink: suno-v5.5-beta dst. */
export function mapModelEvolink(modelId: string): string {
  const m = normalisasiModel(modelId);
  if (m.includes("v5.5")) return "suno-v5.5-beta";
  if (m.includes("v5")) return "suno-v5-beta";
  if (m.includes("v4.5plus")) return "suno-v4.5plus-beta";
  if (m.includes("v4.5all")) return "suno-v4.5all-beta";
  if (m.includes("v4.5")) return "suno-v4.5-beta";
  if (m.includes("v4")) return "suno-v4-beta";
  return "suno-v5.5-beta";
}

/** 🎵 v19.78 CometAPI mv: chirp-crow = v5, chirp-auk = v4.5. */
export function mapModelComet(modelId: string): string {
  const m = normalisasiModel(modelId, "v5");
  if (m.includes("v5.5") || m.includes("v5")) return "chirp-crow";
  if (m.includes("v4.5plus")) return "chirp-bluejay";
  if (m.includes("v4.5")) return "chirp-auk";
  if (m.includes("v4")) return "chirp-v4";
  if (m.includes("v3.5")) return "chirp-v3-5";
  return "chirp-crow";
}

/** 🎵 v19.78 TTAPI mv: names from the current TTAPI enum. */
export function mapModelTtapi(modelId: string): string {
  const m = normalisasiModel(modelId);
  if (m.includes("v5.5")) return "chirp-v5-5";
  if (m.includes("v5")) return "chirp-v5";
  if (m.includes("v4.5plus")) return "chirp-v4-5+";
  if (m.includes("v4.5all")) return "chirp-v4-5-all";
  if (m.includes("v4.5")) return "chirp-v4-5";
  if (m.includes("v4")) return "chirp-v4";
  if (m.includes("v3.5")) return "chirp-v3-5";
  return "chirp-v5-5";
}
