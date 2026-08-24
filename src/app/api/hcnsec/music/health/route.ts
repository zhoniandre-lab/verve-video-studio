/* =====================================================================
   🩺 HEALTH CHECK PROVIDER MUSIK (v19.35.4 / v19.78)
   GET /api/hcnsec/music/health
   Cek dari SERVER apakah endpoint generate tiap provider HIDUP atau MATI.
   Logika: POST minimal tanpa key → 401/400/422 = endpoint ADA (hidup, cuma
   butuh auth) · 404/timeout = MATI. Timeout 6s/provider, jalan PARALEL.
   ===================================================================== */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CEK: { id: string; label: string; url: string; body?: any }[] = [
  { id: "kie", label: "Kie.ai", url: "https://api.kie.ai/api/v1/generate", body: { title: "t", customMode: false, instrumental: false, prompt: "p", style: "s" } },
  { id: "apiframe", label: "apiframe.ai", url: "https://apiframe.ai/api/v1/generate", body: { title: "t", prompt: "p", tags: "t", make_instrumental: false, wait_audio: false } },
  { id: "sunor", label: "Sunor.cc", url: "https://sunor.cc/api/v1/task", body: { model: "suno", task_type: "music", input: { gpt_description_prompt: "p" } } },
  { id: "musicapi", label: "MusicAPI", url: "https://api.musicapi.ai/api/v1/sonic/create", body: { task_type: "create_music", custom_mode: false, gpt_description_prompt: "p", mv: "sonic-v5" } },
  { id: "aimusicapi", label: "AIMusicAPI", url: "https://api.aimusicapi.ai/api/v1/sonic/create", body: { task_type: "create_music", custom_mode: false, gpt_description_prompt: "p", mv: "sonic-v5" } },
  { id: "sunoapi", label: "SunoAPI.org", url: "https://api.sunoapi.org/api/v1/generate", body: { prompt: "p", customMode: false, instrumental: false, model: "V5", callBackUrl: "https://example.com/cb" } },
  { id: "evolink", label: "EvoLink", url: "https://api.evolink.ai/v1/audios/generations", body: { model: "suno-v5-beta", prompt: "p" } },
  { id: "cometapi", label: "CometAPI", url: "https://api.cometapi.com/suno/submit/music", body: { gpt_description_prompt: "p", mv: "chirp-crow" } },
  { id: "ttapi", label: "TTAPI", url: "https://api.ttapi.io/suno/v1/music", body: { custom: false, mv: "chirp-v5", gpt_description_prompt: "p" } },
];

export async function GET() {
  const providers: Record<string, { hidup: boolean; kode: number | string; label: string }> = {};
  await Promise.all(CEK.map(async (c) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: c.body ? JSON.stringify(c.body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      // 401/400/403/422 = endpoint ADA tapi butuh key (HIDUP) · 404/5xx = mati/bermasalah
      const hidup = r.status !== 404 && r.status !== 410 && r.status < 500;
      providers[c.id] = { hidup, kode: r.status, label: c.label };
    } catch (e: any) {
      providers[c.id] = { hidup: false, kode: e?.name === "AbortError" ? "timeout" : "gagal", label: c.label };
    }
  }));
  return NextResponse.json({ ok: true, providers, at: Date.now() });
}
