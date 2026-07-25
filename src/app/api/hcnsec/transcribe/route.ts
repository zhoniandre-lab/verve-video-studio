import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1";
const KEY = process.env.HCNSEC_API_KEY || "";

/**
 * TRANSKRIPSI LAGU (Whisper via kunci HCNSEC milik user) — untuk Keterangan otomatis
 * "🎵 Dari lirik lagu". Klien kirim URL audio (bukan file, biar ringan); server unduh
 * lalu teruskan ke /audio/transcriptions dengan timestamp per KATA. Hasil dipakai
 * klien untuk menyelaraskan lirik asli — teks tetap dari lirik asli (100% benar),
 * AI hanya dipakai mencari WAKTUNYA. Gagal/sibuk → klien jatuh ke perkiraan cerdas.
 */
export async function POST(req: Request) {
  try {
    // 🔊🩹 v13.19 CASCADE WHISPER — dulu cuma HCNSEC; bila mati → klien diam-diam pakai perkiraan.
    // Urutan: GROQ (whisper-large-v3-turbo — tier gratis console.groq.com, stempel per-KATA,
    // persis cara CapCut menyerasikan keterangan) lalu HCNSEC lama. Engine dilaporkan jujur.
    const calon: { nama: string; base: string; key: string; model: string }[] = [];
    if (process.env.GROQ_API_KEY)
      calon.push({ nama: "Groq Whisper (gratis)", base: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: "whisper-large-v3-turbo" });
    if (KEY) calon.push({ nama: "HCNSEC Whisper", base: BASE, key: KEY, model: "" }); // model diisi dari request di bawah
    if (!calon.length)
      return NextResponse.json({ ok: false, code: "TANPA_KUNCI_WHISPER", error: "Belum ada kunci Whisper (GROQ_API_KEY/HCNSEC_API_KEY) di server — perkiraan cerdas dipakai. Isi kunci Groq GRATIS (console.groq.com → API Keys) lalu Redeploy, biar serasi otomatis ala CapCut." });

    const j = await req.json().catch(() => ({}));
    const u = String(j.audio_url || "");
    if (!/^https?:\/\//.test(u)) {
      return NextResponse.json({ ok: false, error: "audio_url harus URL http(s) — audio lokal pakai perkiraan cerdas" });
    }
    // Whitelist longgar (CDN AI) — anti open-proxy
    let allowed = false;
    try {
      const h = new URL(u).hostname.toLowerCase();
      allowed = h.includes("hcnsec") || h.includes("kie.ai") || h.includes("suno") || h.includes("apiframe")
        || h.includes("sunor") || h.includes("cdn") || h.includes("r2") || h.includes("s3")
        || h.includes("oss") || h.includes("aliyuncs") || h.includes("blob") || h.includes("aimusic")
        || h.includes("googleapis") || h.includes("googleusercontent");
    } catch { allowed = false; }
    if (!allowed) return NextResponse.json({ ok: false, error: "domain_not_allowed" });

    // 1) Unduh audio dari CDN provider
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30_000);
    const ar = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "audio/*,*/*" }, signal: ac.signal, cache: "no-store" });
    clearTimeout(t);
    if (!ar.ok) return NextResponse.json({ ok: false, error: `fetch audio upstream ${ar.status}` });
    const ab = await ar.arrayBuffer();
    if (!ab || ab.byteLength < 10_000) return NextResponse.json({ ok: false, error: "audio terlalu kecil/kosong" });
    if (ab.byteLength > 40 * 1024 * 1024) return NextResponse.json({ ok: false, error: "audio terlalu besar (>40MB)" });

    // 2) Teruskan ke Whisper (OpenAI-compatible via HCNSEC) — minta timestamp per kata + segmen
    const fd = new FormData();
    fd.append("file", new Blob([ab], { type: ar.headers.get("content-type") || "audio/mpeg" }), "lagu.mp3");
    fd.append("model", String(j.model || "whisper-1"));
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "word");
    fd.append("timestamp_granularities[]", "segment");
    fd.append("language", String(j.lang || "id"));
    if (j.hint) fd.append("prompt", String(j.hint).slice(0, 700)); // bias lirik asli → akurasi naik

    const salah: string[] = [];
    let wj: any = null; let mesin = "";
    for (const c of calon) {
      try {
        const fd2 = new FormData();
        fd.forEach((v, k) => { if (k !== "file") fd2.append(k, v); });
        fd2.append("file", new Blob([ab], { type: ar.headers.get("content-type") || "audio/mpeg" }), "lagu.mp3");
        fd2.set("model", c.model || String(j.model || "whisper-1"));
        const wc = new AbortController();
        const wt = setTimeout(() => wc.abort(), 50_000);
        const wr = await fetch(`${c.base}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${c.key}` },
          body: fd2,
          signal: wc.signal,
        });
        clearTimeout(wt);
        const cand = await wr.json().catch(() => null);
        if (wr.ok && cand) { wj = cand; mesin = c.nama; break; }
        salah.push(`${c.nama}: ${(cand?.error?.message || `HTTP ${wr.status}`).slice(0, 70)}`);
      } catch (e: any) {
        salah.push(`${c.nama}: ${e?.name === "AbortError" ? "timeout 50d" : (e?.message || "gagal").slice(0, 60)}`);
      }
    }
    if (!wj) {
      return NextResponse.json({ ok: false, code: "WHISPER_GAGAL", error: `Semua mesin Whisper gagal — ${salah.join(" · ") || "tak ada kandidat"}` });
    }
    const segments = Array.isArray(wj.segments)
      ? wj.segments.map((s: any) => ({ text: String(s?.text || "").trim(), start: Number(s?.start) || 0, end: Number(s?.end) || 0 })).filter((s: any) => s.end > s.start)
      : [];
    const words = Array.isArray(wj.words)
      ? wj.words.map((w: any) => ({ w: String(w?.word || "").trim(), start: Number(w?.start) || 0, end: Number(w?.end) || 0 })).filter((w: any) => w.w && w.end >= w.start)
      : [];
    return NextResponse.json({ ok: true, words, segments, text: String(wj.text || ""), engine: mesin });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "whisper timeout (lagu panjang) — pakai perkiraan cerdas" : (e?.message || "transcribe gagal");
    return NextResponse.json({ ok: false, error: msg });
  }
}
