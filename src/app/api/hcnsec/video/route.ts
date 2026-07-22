"use server";
import { NextResponse } from "next/server";
import { generateVideo, pollVideo, listGatewayModels } from "@/lib/hcnsec";

// 🔄 v12.1 SIRKUIT 2 — kie.ai (rumah resmi Kling): dipakai saat gateway utama tak punya
// model video sama sekali. Kunci = milik pembuat (header X-Suno-Key — kunci yang sama dgn musik).
const KIE_BASE = "https://api.kie.ai/api/v1";
const KIE_I2V_MODELS = ["kling/v2-1-standard", "kling-2.6/image-to-video"]; // murah → baru
const KIE_NEG = "blurry, low quality, distorted, deformed, watermark, text, ugly";

function kiePayload(model: string, prompt: string, imageUrl: string, dur: number, aspect: string) {
  const d = dur >= 10 ? "10" : "5"; // kling hanya menerima "5" | "10"
  if (model === "kling/v2-1-standard") {
    return { model, input: { prompt, image_url: imageUrl, duration: d, negative_prompt: KIE_NEG, cfg_scale: 0.5 } };
  }
  const input: Record<string, unknown> = { prompt, image_urls: [imageUrl], sound: false, duration: d };
  if (aspect) input.aspect_ratio = aspect;
  return { model, input };
}

async function kieCreate(key: string, payload: unknown, base: string = KIE_BASE): Promise<string> {
  const r = await fetch(`${base}/jobs/createTask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || (d.code !== 200 && d.code !== 0)) {
    throw new Error(`kie ${d.code ?? r.status}: ${String(d.msg || d.message || "createTask gagal").slice(0, 120)}`);
  }
  const tid = d.data?.taskId || d.data?.task_id || "";
  if (!tid) throw new Error("kie: createTask tanpa taskId");
  return String(tid);
}

async function kiePoll(key: string, taskId: string, base: string = KIE_BASE): Promise<{ video_url: string; status: string; fail?: string }> {
  try {
    const r = await fetch(`${base}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(25_000),
    });
    const d: any = await r.json().catch(() => ({}));
    const data = d.data || {};
    const state = String(data.state || data.status || "").toLowerCase();
    if (state === "success" || state === "succeeded" || state === "done") {
      let url = "";
      try {
        const rj = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
        url = rj?.resultUrls?.[0] || rj?.resultUrl || rj?.urls?.[0] || "";
      } catch { /* resultJson rusak */ }
      return { video_url: url, status: url ? "ready" : "error", fail: url ? undefined : "sukses tanpa URL hasil" };
    }
    if (state === "fail" || state === "failed" || state === "error") {
      return { video_url: "", status: "failed", fail: String(data.failMsg || data.errorMessage || d.msg || "gagal di kie").slice(0, 160) };
    }
    return { video_url: "", status: "pending" };
  } catch { return { video_url: "", status: "pending" }; }
}

// 🏹 v12.2 PROVIDER BAWAAN (BANSOS): pembuat boleh membawa base URL + API key penyedia mana pun
// (kredit gratis hasil buruan). Dua dialek API yang dipahami: "openai" (gaya /v1/videos/generations
// ala one-api/hcnsec) dan "kie" (gaya /api/v1/jobs/createTask + recordInfo ala kie.ai).
type CP = { base: string; key: string; model?: string; jenis?: string; label?: string; endpoint?: string };

const baseV1Compat = (raw: string) => {
  const b = String(raw || "").trim().replace(/\/+$/, "");
  return /\/v1$/.test(b) ? b : b + "/v1";
};
const baseKieCompat = (raw: string) => {
  const b = String(raw || "").trim().replace(/\/+$/, "");
  return /\/api\/v1$/.test(b) ? b : b + "/api/v1";
};
function cpJenis(p: CP): "kie" | "openai" {
  if (p.jenis === "kie" || p.jenis === "openai") return p.jenis;
  if (/kie\.ai/i.test(p.base) || /^(sk-kie|kie)/i.test(String(p.key))) return "kie";
  return "openai";
}
const cpLabel = (p: CP) => { try { return String(p.label || new URL(String(p.base)).hostname).slice(0, 40); } catch { return "provider"; } };

async function cpOpenAICall(b1: string, key: string, body: any): Promise<any> {
  for (const ep of ["/videos/generations", "/video/generations"]) {
    const r = await fetch(b1 + ep, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (!r) continue;
    const d: any = await r.json().catch(() => ({}));
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(String(d?.error?.message || d?.message || `HTTP ${r.status}`).slice(0, 140));
    const item = d?.data?.[0] ?? d ?? {};
    return { video_url: item.url || item.video_url || item.output?.url || "", id: item.id || d.id || d.task_id || "", status: item.status || d.status || "pending", endpoint: ep };
  }
  throw new Error("endpoint /videos/generations 404 — penyedia ini bukan dialek openai-video");
}

async function cpOpenAIPoll(b1: string, key: string, id: string, ep: string): Promise<{ video_url: string; status: string }> {
  try {
    const r = await fetch(`${b1}${ep}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { video_url: "", status: "pending" };
    const d: any = await r.json().catch(() => ({}));
    const item = d?.data?.[0] ?? d ?? {};
    const u = item.url || item.video_url || "";
    const st = String(item.status || d.status || "pending").toLowerCase();
    return { video_url: u, status: u ? "ready" : st };
  } catch { return { video_url: "", status: "pending" }; }
}

// Mencoba SATU provider bawaan sampai tuntas: sukses (200) / pending (202 + descriptor cp) / gagal (err)
async function tryCustomProvider(p: CP, a: { prompt: string; imageUrl: string; dur: number; aspect: string }): Promise<{ ok: boolean; payload?: any; http?: number; err?: string }> {
  const jn = cpJenis(p);
  const label = cpLabel(p);
  const mk = (payload: any, http = 200) => ({ ok: true as const, payload, http });
  try {
    if (jn === "kie") {
      const kb = baseKieCompat(p.base);
      const payload = kiePayload(String(p.model || "kling/v2-1-standard"), a.prompt, a.imageUrl, a.dur, a.aspect || "9:16");
      const tid = await kieCreate(String(p.key), payload, kb);
      const t0 = Date.now();
      while (Date.now() - t0 < 50_000) {
        await new Promise((r) => setTimeout(r, 4000));
        const pl = await kiePoll(String(p.key), tid, kb);
        if (pl.video_url) return mk({ video_url: pl.video_url, status: "ready", id: tid, provider: "cp", model: `cp:${label}` });
        if (pl.status === "failed") return { ok: false, err: `${label}: ${pl.fail || "gagal"}` };
      }
      return mk({ id: tid, provider: "cp", cp: { base: p.base, key: p.key, model: p.model || "", jenis: "kie" }, model: `cp:${label}`, status: "pending", video_url: "", error: "Klip masih dimasak server — pantau terus ya bro." }, 202);
    }
    const b1 = baseV1Compat(p.base);
    const made = await cpOpenAICall(b1, String(p.key), {
      model: p.model || undefined, prompt: a.prompt,
      ...(a.imageUrl && !a.imageUrl.startsWith("data:") ? { image_url: a.imageUrl } : {}),
      duration: a.dur, aspect_ratio: a.aspect || "9:16",
    });
    if (made.video_url) return mk({ video_url: made.video_url, status: "ready", id: made.id || "", provider: "cp", model: `cp:${label}` });
    if (!made.id) return { ok: false, err: `${label}: jawaban tanpa task id` };
    const t0 = Date.now();
    while (Date.now() - t0 < 50_000) {
      await new Promise((r) => setTimeout(r, 4000));
      const pl = await cpOpenAIPoll(b1, String(p.key), String(made.id), made.endpoint);
      if (pl.video_url) return mk({ video_url: pl.video_url, status: "ready", id: made.id, provider: "cp", model: `cp:${label}` });
      if (pl.status === "failed" || pl.status === "error") return { ok: false, err: `${label}: task gagal` };
    }
    return mk({ id: made.id, provider: "cp", cp: { base: p.base, key: p.key, model: p.model || "", jenis: "openai", endpoint: made.endpoint }, model: `cp:${label}`, status: "pending", video_url: "", error: "Klip masih dimasak server — pantau terus ya bro." }, 202);
  } catch (e: any) {
    return { ok: false, err: `${label}: ${String(e?.message || e).slice(0, 140)}` };
  }
}

async function pollCustomProvider(p: CP, taskId: string, epHint: string): Promise<{ payload: any; http: number }> {
  const t0 = Date.now();
  while (Date.now() - t0 < 26_000) {
    await new Promise((r) => setTimeout(r, 4000));
    if (cpJenis(p) === "kie") {
      const pl = await kiePoll(String(p.key), taskId, baseKieCompat(p.base));
      if (pl.video_url) return { http: 200, payload: { id: taskId, provider: "cp", video_url: pl.video_url, status: "ready" } };
      if (pl.status === "failed") return { http: 500, payload: { id: taskId, provider: "cp", error: `cp: ${pl.fail || "gagal"}`, video_url: "", status: "error" } };
    } else {
      const pl = await cpOpenAIPoll(baseV1Compat(p.base), String(p.key), taskId, epHint || p.endpoint || "/videos/generations");
      if (pl.video_url) return { http: 200, payload: { id: taskId, provider: "cp", video_url: pl.video_url, status: "ready" } };
      if (pl.status === "failed" || pl.status === "error") return { http: 500, payload: { id: taskId, provider: "cp", error: "task gagal di penyedia bawaan", video_url: "", status: "error" } };
    }
  }
  return { http: 202, payload: { id: taskId, provider: "cp", cp: p, status: "pending", video_url: "", error: "Klip masih dimasak server — pantau terus ya bro." } };
}

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, duration, model, aspectRatio, poll, negativePrompt, enhance,
      taskId, endpoint, pollOnly, provider, customProviders, cp, probeModels } = await req.json();

    // 🏹 v12.2: CEK KATALOG GRATIS — nanya daftar model milik penyedia bawaan pembuat (dialek openai),
    // tanpa membuat task video = tanpa bakar kredit. Bukti bansos hidup/tidak sebelum dipakai.
    if (probeModels && cp && cp.base && cp.key) {
      try {
        const b0 = String(cp.base).trim().replace(/\/+$/, "");
        const b1 = baseV1Compat(b0);
        const r = await fetch(`${b1}/models`, { headers: { Authorization: `Bearer ${String(cp.key)}` }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(b0).hostname}`);
        const d: any = await r.json().catch(() => ({}));
        const arr = (d && (d.data || d.models)) || [];
        const ids = Array.isArray(arr) ? arr.map((m: any) => String(m?.id || m?.name || m || "")).filter(Boolean) : [];
        const video = ids.filter((x) => /kling|wan2?|hailuo|vidu|luma|runway|veo|sora|pixverse|cogvideo|seedance|hunyuan|kwaivgi|video/i.test(x));
        return NextResponse.json({ total: ids.length, models: ids.slice(0, 200), video_candidates: video });
      } catch (e: any) {
        return NextResponse.json({ error: `Probe gagal: ${String(e?.message || e).slice(0, 140)} — cek base URL & key-nya ya bro.` }, { status: 502 });
      }
    }

    // 🎬 v11.8: LANJUTKAN polling task yang SUDAH dibuat (tanpa bikin task baru = hemat kredit).
    if (pollOnly && taskId) {
      // 🏹 v12.2: task milik provider bawaan — descriptor cp dibawa klien dari localStorage
      if (provider === "cp" && cp && cp.base && cp.key) {
        const out2 = await pollCustomProvider(cp as CP, String(taskId), String(endpoint || (cp as any).endpoint || ""));
        return NextResponse.json(out2.payload, { status: out2.http });
      }
      // 🔄 v12.1: task milik kie.ai (sirkuit 2) — dipoll lewat recordInfo, bukan gateway utama
      if (provider === "kie") {
        const kieKey = (req.headers.get("x-suno-key") || process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "").trim();
        if (!kieKey) return NextResponse.json({ error: "Kunci kie.ai tidak ikut — pantau ulang tak bisa jalan.", status: "error", video_url: "" }, { status: 401 });
        let waited = 0; const interval = 4000; const maxWait = 26000;
        let last: any = { video_url: "", status: "pending" };
        while (waited < maxWait) {
          await new Promise((r) => setTimeout(r, interval));
          waited += interval;
          last = await kiePoll(kieKey, String(taskId));
          if (last.video_url || last.status === "failed") break;
        }
        if (last.video_url) return NextResponse.json({ id: taskId, provider: "kie", video_url: last.video_url, status: "ready" });
        if (last.status === "failed") return NextResponse.json({ id: taskId, provider: "kie", error: `kie: ${last.fail || "gagal"}`, video_url: "", status: "error" }, { status: 500 });
        return NextResponse.json({ id: taskId, provider: "kie", status: "pending", video_url: "", error: "Klip masih dimasak server (kie) — pantau terus ya bro." }, { status: 202 });
      }
      const pollEp: string = endpoint || "/videos/generations";
      let res: any = { id: taskId, endpoint: pollEp, status: "pending", video_url: "" };
      let waited = 0; const interval = 3000; const maxWait = 26000;
      while (waited < maxWait) {
        await new Promise((r) => setTimeout(r, interval));
        waited += interval;
        const p = await pollVideo(String(taskId), pollEp);
        res = { ...res, ...p };
        if (res.video_url || res.status === "ready" || res.status === "succeeded") break;
        if (res.status === "error" || res.status === "failed") break;
      }
      if (!res.video_url && res.status !== "ready" && res.status !== "succeeded") {
        return NextResponse.json({ ...res, error: "Klip masih dimasak server — pantau terus ya bro." }, { status: 202 });
      }
      return NextResponse.json(res);
    }

    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: "Prompt tidak boleh kosong", video_url: "", status: "error" }, { status: 400 });
    }
    // Batasi durasi agar tidak terlalu berat (khususnya di HP)
    const safeDur = Math.min(Math.max(Number(duration) || 5, 2), 8);

    // 🔍 v12.0 BERBURU MODEL: kalau model yang diminta ditolak grup distributor
    // ("No available channel for model X under group ..."), tanya KATALOG gateway lalu
    // coba kandidat model video lain satu-satu — channel-error gagalnya CEPAT & gratis.
    const VIDEO_HINT = /kling|wan2?|hailuo|minimax|vidu|luma|runway|veo|sora|pixverse|cogvideo|seedance|hunyuan|hailuo|kwaivgi|video/i;
    const CHANNEL_ERR = /no available channel|not[ -]?available|unknown.*model|invalid.*model|model.*not.*found|belum tersedia|404/i;
    const askedModel = String(model || "").trim() || undefined;
    const tryGen = (m?: string) => generateVideo(prompt, { imageUrl, duration: safeDur, model: m, aspectRatio, negativePrompt });

    let res: any = null;
    let err0: any = null;
    const tried: string[] = [];
    let cpErr = "";
    // 🏹 v12.2 BANSOS DULU: provider bawaan pembuat (key + base URL sendiri) dicoba PALING AWAL —
    // itu pilihan sadar pembuat; gateway/kie hanyalah cadangan.
    {
      const cps: CP[] = Array.isArray(customProviders) ? customProviders.slice(0, 3).filter((x: any) => x && x.base && x.key) : [];
      for (const p of cps) {
        const out = await tryCustomProvider(p, { prompt, imageUrl: String(imageUrl || ""), dur: safeDur, aspect: String(aspectRatio || "") });
        if (out.ok && out.payload) return NextResponse.json(out.payload, { status: out.http || 200 });
        if (out.err) cpErr = out.err;
      }
    }
    try {
      res = await tryGen(askedModel);
      tried.push(res?.model || askedModel || "?");
    } catch (e: any) {
      err0 = e;
      tried.push(askedModel || "(default)");
    }
    if (!res && err0 && CHANNEL_ERR.test(String(err0.message || ""))) {
      try {
        const ids = await listGatewayModels();
        const cand = ids.filter((x) => VIDEO_HINT.test(x) && !tried.includes(x)).slice(0, 6);
        for (const idd of cand) {
          try { res = await tryGen(idd); err0 = null; tried.push(idd); break; }
          catch { tried.push(idd); }
        }
      } catch { /* katalog pun tak bisa dibaca — teruskan error asli apa adanya */ }
    }
    // 🔄 v12.1 SIRKUIT 2 — kie.ai (rumah resmi Kling): gateway utama tanpa video → pakai kunci musik pembuat
    const kieKey = (req.headers.get("x-suno-key") || process.env.SUNO_API_KEY || process.env.MUSIC_API_KEY || "").trim();
    if (!res && kieKey && imageUrl && !String(imageUrl).startsWith("data:")) {
      let kieTask = "";
      let kieModel = "";
      let kieErr = "";
      for (const m of KIE_I2V_MODELS) {
        try {
          kieTask = await kieCreate(kieKey, kiePayload(m, prompt, String(imageUrl), safeDur, String(aspectRatio || "")));
          kieModel = m;
          break;
        } catch (e2: any) { kieErr = String(e2?.message || e2).slice(0, 140); }
      }
      if (kieTask) {
        const t0 = Date.now();
        while (Date.now() - t0 < 50_000) {
          await new Promise((r2) => setTimeout(r2, 4000));
          const p = await kiePoll(kieKey, kieTask);
          if (p.video_url) return NextResponse.json({ video_url: p.video_url, status: "ready", id: kieTask, provider: "kie", model: `kie:${kieModel}` });
          if (p.status === "failed") return NextResponse.json({ error: `kie (${kieModel}): ${p.fail || "gagal membuat klip"}`, video_url: "", status: "error" }, { status: 500 });
        }
        return NextResponse.json({ id: kieTask, provider: "kie", model: `kie:${kieModel}`, status: "pending", video_url: "", error: "Klip masih dimasak server (kie) — pantau terus ya bro." }, { status: 202 });
      }
      if (kieErr) err0 = new Error(`kie.ai menolak: ${kieErr}`);
    }
    if (!res) {
      if (err0 || cpErr) {
        const guide = kieKey
          ? ""
          : " · 💡 Grup hcnsec-mu tanpa video. Dua serangan balik: (1) kunci Kie/Suno di tempat kunci lagu, (2) menu Saya → 🏹 Provider Video — tempel base URL + key hasil buruan bansos penyedia mana pun.";
        throw new Error((cpErr ? `Provider bawaan gagal: ${cpErr} · ` : "") + String(err0?.message || "Gagal generate video") + guide);
      }
      throw new Error("Tidak ada model video yang menjawab di gateway ini");
    }

    // Auto-poll sampai siap (maks 60s untuk UX cepat)
    const shouldPoll = poll !== false;
    if (shouldPoll && res.id && res.status !== "ready" && res.status !== "succeeded" && res.video_url === "") {
      const pollEp: string = res.endpoint || "/videos/generations";
      const taskId: string = res.id;
      let waited = 0;
      const interval = 3000;
      const maxWait = 45000;
      while (waited < maxWait) {
        await new Promise((r) => setTimeout(r, interval));
        waited += interval;
        const p = await pollVideo(taskId, pollEp);
        res = { ...res, ...p };
        if (res.status === "ready" || res.status === "succeeded" || res.video_url) break;
        if (p.status === "error" || p.status === "failed") break;
      }
    }
    // Tambahkan flag jika gagal
    if (!res.video_url && res.status !== "ready") {
      return NextResponse.json(
        {
          ...res,
          error:
            "Video belum siap / model video tidak tersedia. TIPS: coba durasi 5s, rasio 16:9, prompt lebih sederhana, atau gunakan mode Slideshow yang lebih stabil.",
        },
        { status: 202 }
      );
    }
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Gagal generate video", video_url: "", status: "error" },
      { status: e.status || 500 }
    );
  }
}

// 🔍 v12.0 DIAGNOSTIK (buka URL ini langsung di browser HP):
// menampilkan daftar model yang BENAR-BENAR dibuka grup akun gateway + saringan kandidat video.
// Tidak membocorkan apa pun selain NAMA model — aman dilihat pembuat.
export async function GET() {
  try {
    const ids = await listGatewayModels();
    const video = ids.filter((x) => /kling|wan2?|hailuo|minimax|vidu|luma|runway|veo|sora|pixverse|cogvideo|seedance|hunyuan|kwaivgi|video/i.test(x));
    return NextResponse.json({ total_model: ids.length, kandidat_video: video, semua_model: ids.slice(0, 300) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "gagal membaca katalog" }, { status: e.status || 500 });
  }
}
