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

async function kieCreate(key: string, payload: unknown): Promise<string> {
  const r = await fetch(`${KIE_BASE}/jobs/createTask`, {
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

async function kiePoll(key: string, taskId: string): Promise<{ video_url: string; status: string; fail?: string }> {
  try {
    const r = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
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

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, duration, model, aspectRatio, poll, negativePrompt, enhance,
      taskId, endpoint, pollOnly, provider } = await req.json();

    // 🎬 v11.8: LANJUTKAN polling task yang SUDAH dibuat (tanpa bikin task baru = hemat kredit).
    if (pollOnly && taskId) {
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
      if (err0) {
        const guide = kieKey
          ? ""
          : " · 💡 Grup hcnsec-mu tanpa video sama sekali. Sirkuit cadangan (kie.ai — rumah resmi Kling) butuh kunci Kie/Suno-mu di HP ini (biasa diisi di tempat kunci lagu).";
        throw new Error(String(err0.message || "Gagal generate video") + guide);
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
