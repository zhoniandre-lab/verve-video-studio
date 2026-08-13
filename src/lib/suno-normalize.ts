/* =====================================================================
   NORMALISASI RESPONS PROVIDER LAGU (v19.35.6) — 100% orisinal
   Dipakai route /api/hcnsec/music (POST generate + GET polling).
   Dipisah ke lib MURNI supaya bisa diuji di Node dengan sampel respons
   asli tiap provider (tests/suno-normalize.test.mjs).
   ===================================================================== */

export type ProvLagu = "kie" | "apiframe" | "sunor" | "suno-resmi" | "mureka";

export interface HasilNormal {
  id?: string;
  status: "pending" | "completed" | "error";
  audio_url?: string;
  /** 🐛 v19.61 FIX KEPOTONG: SEMUA URL audio yang ditemukan (lagu panjang =
     beberapa segmen). Client GABUNG kalau >1 → lagu 8 menit tuntas. */
  audio_urls?: string[];
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
    const urls = unik([...kumpulAudioRekursif(data.response), ...kumpulAudioRekursif(data)]);
    return {
      id: data.taskId || data.id || first.id || "",
      status: "completed",
      audio_url: urls[0] || "",
      audio_urls: urls,
      title: first.title || "",
      image_url: first.imageUrl || "",
      duration: first.duration,
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
    const urls = unik(kumpulAudioRekursif(d));
    return {
      id: taskId,
      status: "completed",
      audio_url: urls[0] || "",
      audio_urls: urls,
      title: d?.title || d?.song?.title || "",
      image_url: d?.cover_url || d?.image_url || "",
      duration: Number(d?.duration || d?.song?.duration || 0) || undefined,
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
    const urls = unik([...kumpulAudioRekursif(out), ...kumpulAudioRekursif(d0)]);
    return {
      id: d0.task_id || d0.id || first.id || "",
      status: "completed",
      audio_url: urls[0] || "",
      audio_urls: urls,
      title: first.title || d0.title || "",
      image_url: first.image_url || first.imageUrl || first.cover_url || "",
      duration: first.duration,
    };
  }
  if (st === "failure" || st === "error" || st === "failed" || st === "timeout") {
    return { status: "error", error: d0.error || d0.message || d0.fail_reason || `Sunor: ${st}` };
  }
  return { id: d0.task_id || d0.id || "", status: "pending" };
}

/** Normalisasi provider generik suno-compatible (dipakai apiframe dulu — sekarang mati, tapi dijaga). */
export function normalizeGeneric(d: any): HasilNormal {
  const items = d.data || (Array.isArray(d) ? d : [d]);
  const first = items[0] || d || {};
  const audioUrl = cariAudioRekursif(first) || cariAudioRekursif(d);
  let status = (first.status || d.status || "pending").toString().toLowerCase();
  if (audioUrl && (status === "pending" || status === "processing" || status === "submitted" || status === "queued")) {
    status = "completed";
  }
  if (/complete|success|done/i.test(status)) status = "completed";
  if (/error|fail/i.test(status)) status = "error";
  return {
    id: first.id || d.id || d.task_id || "",
    status: status as any,
    audio_url: audioUrl,
    title: first.title || d.title || "",
    image_url: first.image_url || first.cover || first.image || d.image_url || "",
  };
}

/** Normalisasi utuh per provider. */
export function normalizeLagu(d: any, provider: ProvLagu): HasilNormal {
  if (provider === "kie") return normalizeKie(d);
  if (provider === "sunor") return normalizeSunor(d);
  if (provider === "mureka") return normalizeMureka(d); // 🎵 v19.64
  // suno-resmi (studio-api) respons {id} / {clips:[{audio_url}]} — mirip generic
  return normalizeGeneric(d);
}

/** Peta model ke format Kie. */
export function mapModelKie(modelId: string): string {
  const m = String(modelId || "v5.5").toLowerCase();
  if (m.includes("v5.5") || m.includes("v5_5")) return "V5_5";
  if (m.includes("v5")) return "V5";
  if (m.includes("v4.5plus") || (m.includes("v4.5") && m.includes("plus"))) return "V4_5PLUS";
  if (m.includes("v4.5all") || (m.includes("v4.5") && m.includes("all"))) return "V4_5ALL";
  if (m.includes("v4.5")) return "V4_5";
  if (m.includes("v4")) return "V4";
  if (m.includes("v3.5") || m.includes("v3_5")) return "V3_5";
  return "V5_5";
}

/** Peta model ke format generik suno-compatible. */
export function mapModelGeneric(modelId: string): string {
  const m = String(modelId || "v5.5").toLowerCase();
  if (m.includes("v5.5")) return "suno-v5.5";
  if (m.includes("v5")) return "suno-v5";
  if (m.includes("v4.5")) return "suno-v4.5";
  if (m.includes("v4")) return "suno-v4";
  if (m.includes("v3.5")) return "chirp-v3.5";
  return m;
}
