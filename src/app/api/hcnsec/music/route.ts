
import { NextResponse } from "next/server";
import { catatKredit } from "../../../../lib/ledger";
import { gerbangFitur } from "../../../../lib/setelan";
import { normalizeLagu as normalize, mapModelKie, mapModelGeneric } from "../../../../lib/suno-normalize";

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

type Provider = "kie" | "apiframe" | "sunor";

const PROVIDERS: Record<Provider, { base: string; label: string }> = {
  kie:      { base: "https://api.kie.ai/api/v1", label: "Kie.ai" },
  apiframe: { base: "https://apiframe.ai/api",   label: "apiframe.ai" },
  sunor:    { base: "https://sunor.cc",            label: "Sunor.cc" }, // v10.5: subdomain api.* MATI di DNS — endpoint resmi ada di domain utama
};

/** 🛡 v19.35.4: provider yang TERVERIFIKASI mati (semua endpoint 404) — jangan pernah dipakai.
 *  Cek via /api/hcnsec/music/health (health-check otomatis dari server). */
export const PROVIDER_MATI: Record<string, string> = {
  aimusic: "aimusic.so — endpoint API sudah MATI (404 semua). Hapus dari daftar & pakai Kie/Sunor.",
};

function detectProvider(rawKey: string, hdrProvider?: string): Provider {
  if (hdrProvider && PROVIDERS[hdrProvider as Provider]) return hdrProvider as Provider;
  const k = rawKey.toLowerCase().trim();
  if (k.startsWith("kie") || k.startsWith("sk-kie")) return "kie";
  if (k.startsWith("snr_") || k.startsWith("sunor_") || k.startsWith("sk_live")) return "sunor"; // v10.5: kunci asli Sunor = sk_live_…
  if (k.startsWith("afk_") || k.startsWith("af_")) return "apiframe";
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
  const provider = detectProvider(key, hdrProvider);
  let base = hdrBase || envBase;
  if (!base) base = PROVIDERS[provider].base;
  base = base.replace(/\/$/, "");
  return { key, base, provider };
}

function buildBody(payload: any, provider: Provider): any {
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

  if (provider === "kie") {
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

function buildHeaders(key: string): Record<string,string> {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  if (key) {
    const rawKey = key.replace(/^Bearer\s+/i, "");
    h["Authorization"] = key.startsWith("Bearer ") ? key : `Bearer ${rawKey}`;
    h["apikey"] = rawKey;
    h["x-api-key"] = rawKey;
  }
  return h;
}

function getEndpoints(provider: Provider, base: string, forStatus?: string): string[] {
  if (forStatus) {
    if (provider === "sunor") return [`${base}/api/v1/task/${forStatus}`]; // v10.5: GET task/{id}
    if (provider === "kie") {
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
  if (provider === "kie") {
    return [`${base}/generate`];
  }
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
    const body = buildBody(payload, provider);
    const headers = buildHeaders(key);
    const endpoints = getEndpoints(provider, base);

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
            const msg = provider === "kie"
              ? `API Key Kie.ai invalid/expired. Cek key di dashboard kie.ai ya bro.`
              : `API Key invalid. Cek di dashboard ${PROVIDERS[provider].label}.`;
            return NextResponse.json({ error: msg, status: "auth_error", provider }, { status: 401 });
          }
          if (r.status === 402) {
            return NextResponse.json({
              error: `Kredit ${PROVIDERS[provider].label} habis bro. Top up dulu di dashboard.`,
              status: "quota_error", provider,
            }, { status: 402 });
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
          // 💳 v10.4: kredit/saldo habis kadang datang sebagai HTTP 200 ber-code error (bukan 402).
          // Kenali → petakan ke 402 quota_error + pesan Indonesia, supaya klien membuka panel kunci,
          // BUKAN memuntahkan bahasa mentah Inggris seperti 'Credits insufficient'.
          if (/insufficient|not enough|balance|quota|kredit/i.test(String(n.error))) {
            return NextResponse.json({
              error: `Kredit ${PROVIDERS[provider].label} habis bro — provider bilang saldo tidak cukup untuk request ini. Top up saldo di dashboard ${PROVIDERS[provider].label}, atau tambah kunci/provider lain lewat 🔑 Setelan API Key di langkah ini.`,
              status: "quota_error", provider,
            }, { status: 402 });
          }
          lastErr = `${url}: ${n.error}`; continue;
        }
        if (n.id || n.audio_url) {
          n.provider = provider;
          return NextResponse.json(n);
        }
        lastErr = `Empty response from ${url}: ${txt.slice(0,200)}`;
      } catch(e:any){
        lastErr = `${PROVIDERS[provider].label} tidak bisa dihubungi dari server (koneksi gagal) — coba lagi, atau ganti provider lain.`; // v10.5: bahasa manusia, bukan bahasa mesin
        // retry endpoint berikutnya kalau abort/network
      }
    }

    return NextResponse.json({ error: `AI music error (${PROVIDERS[provider].label}): ${lastErr}`, provider }, { status: 502 });
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
    const headers = buildHeaders(key);
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
        if (!r.ok) continue;
        const txt = await r.text().catch(()=>"");
        let data: any = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { continue; }
        const n = normalize(data, provider);
        n.provider = provider;
        if (n.audio_url || n.status === "error" || n.status === "completed") return NextResponse.json(n);
        if (n.id) return NextResponse.json({ status: "pending", id: n.id, provider });
      } catch {}
    }
    return NextResponse.json({ status: "pending", provider });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message });
  }
}
