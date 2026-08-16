import { NextResponse } from "next/server";
import { generateImage, IMAGE_STYLES } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // v10.1: tegas — jangan pernah lewat anggaran serverless

/** 🎨 v19.89 GENERATE VIA BANSOS (Dompet Bansos dari HP) — OpenAI-compatible
 *  /images/generations. Coba beberapa model umum; kalau gateway tidak support
 *  gambar, gagal → route lanjut fallback ke hcnsec env (tidak merusak apa pun). */
const BANSOS_IMG_MODELS = ["gpt-image-1", "dall-e-3", "dall-e-2", "flux", "flux-schnell", "sdxl", "step-image-edit-2", "step-1.5v-image"];
// 🐛 v19.93: batasi percobaan & timeout pendek — bansos yang bukan gateway gambar
// tidak boleh bikin route hang melewati maxDuration 60s (dulu 8 model × 2 format ×
// 45s = bisa > 60s → Vercel timeout → "generate gambar gagal").
async function generateImageBansos(prompt: string, suffix: string, base: string, key: string, modelFirst?: string): Promise<string> {
  const full = suffix ? `${prompt}, ${suffix}` : prompt;
  const models = [...new Set([modelFirst, ...BANSOS_IMG_MODELS].filter((m): m is string => !!m))].slice(0, 4);
  let lastErr = "";
  const t0 = Date.now();
  for (const model of models) {
    if (Date.now() - t0 > 25000) break; // pagar total 25 dtk — sisakan waktu utk fallback hcnsec
    for (const fmt of ["url", "b64_json"] as const) {
      try {
        const r = await fetch(`${base}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: full, size: "1024x1024", n: 1, response_format: fmt }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
        const j = await r.json();
        const item = j?.data?.[0] ?? j;
        const u = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
        if (u && u.length > 100) return u;
        lastErr = "respons kosong";
      } catch (e: any) {
        lastErr = e?.message || "gagal";
        if (/model.*not.*found|unknown.*model|invalid.*model/i.test(lastErr)) break;
        continue;
      }
    }
  }
  throw new Error(`Bansos gambar tidak support /images/generations (${lastErr.slice(0, 60)})`);
}

async function proxyImageToBase64(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VerveProxy/1.0)" },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`Gagal download gambar: HTTP ${r.status}`);
  const contentType = r.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export async function POST(req: Request) {
  try {
    const {
      title, keyword, niche, style, prompt, _rawPrompt, _storyScene, _mood,
      _charLock, _modelFirst, // 🔒 v10.1: cukup kunci identitas + pin model — percobaan seed/referensi DICABUT (biang nggantung)
    } = await req.json();
    const styleObj = IMAGE_STYLES.find(s => s.id === style) || IMAGE_STYLES[0];

    // Build prompt:
    // - Normal: title keyword niche + style suffix
    // - Raw: prompt apa adanya + style suffix
    // - Story scene: gabung visual_en + deskripsi adegan + mood + composition guides
    let userPrompt: string;
    if (_storyScene) {
      // Gambar cerita (storyboard) → prompt cinematic kuat
      const sc = _storyScene;
      const eng = (sc.visual_prompt || sc.visual_en || "").trim();
      const idDesc = (sc.scene_desc || sc.deskripsi || "").trim();
      const mood = (_mood || sc.mood || "emotional, cinematic").trim();
      // Susun komposisi: [shot type + subject + action + environment + lighting + mood + color + lens + quality]
      const parts: string[] = [];
      // 🔒 v10.0 SATU WAJAH: identitas BEKU di URUTAN PERTAMA — model paling patuh pada awal prompt
      const lockTxt = String(_charLock || "").trim();
      if (lockTxt.length > 10) {
        parts.push(`IDENTICAL MAIN CHARACTER IN EVERY IMAGE (same exact face, same hair, same skin tone, same outfit — non-negotiable): ${lockTxt}${/indonesian/i.test(lockTxt) ? "" : ", Indonesian, Southeast Asian facial features, warm tan skin (sawo matang), dark brown eyes"}.`);
      }
      parts.push(eng || `cinematic shot of ${idDesc.slice(0, 80)}`);
      if (idDesc && eng.length < 120) {
        // Tambahkan detail adegan bila visual_en pendek
        parts.push(`scene: ${idDesc.slice(0, 120)}`);
      }
      parts.push(`mood: ${mood}, powerful emotional expression, authentic human gesture`);
      parts.push(`cinematic composition, rule of thirds, leading lines, depth of field`);
      parts.push(`dramatic lighting, volumetric light, color graded, emotionally resonant`);
      parts.push(`hyper detailed, photorealistic, 8k, shot on ARRI Alexa Mini, 50mm f/1.4 lens, film grain, natural skin texture, correct anatomy, perfect hands, detailed face`);
      userPrompt = parts.join(", ");
    } else if (_rawPrompt) {
      userPrompt = String((prompt || title || "")).trim();
    } else {
      userPrompt = `${title || ""} ${keyword || ""} ${niche || ""}`.trim();
    }
    if (!userPrompt) return NextResponse.json({ error: "Prompt kosong" }, { status: 400 });

    // Negative prompt bawaan (mengurangi cacat wajah/tangan)
    let negSuffix =
      ", no text, no watermark, no logo, no signature, no distorted face, no deformed hands, " +
      "no extra fingers, no missing fingers, no blurry face, no ugly, no mutated, no bad anatomy, " +
      "sharp focus on subject, centered emotional composition";
    if (String(_charLock || "").trim().length > 10) negSuffix += ", no face swap, no different person, no inconsistent face, no changing hairstyle, no changing hair color, no changing outfit, no caucasian features, no western facial features"; // 🔒 v10.0: penjaga identitas

    try {
      // 🎨 v19.89: kalau HP punya bansos gambar (Dompet Bansos), coba DULU —
      // gambar jalan tanpa bergantung env server. Gagal → fallback hcnsec.
      const bKey = (req.headers.get("x-bansos-img-key") || "").trim();
      const bBase = (req.headers.get("x-bansos-img-base") || "").trim().replace(/\/+$/, "");
      const bModel = (req.headers.get("x-bansos-img-model") || "").trim();
      if (bKey && bBase) {
        try {
          const u = await generateImageBansos(userPrompt, (styleObj ? styleObj.suffix : "") + negSuffix, bBase, bKey, bModel || undefined);
          return NextResponse.json({ url: u, originalUrl: null, model: bModel || "bansos", size: "1024x1024", prompt: userPrompt, styleLabel: styleObj?.label, cached: u.startsWith("data:"), sumber: "bansos" });
        } catch (eB: any) {
          console.warn("[image] bansos gagal, fallback hcnsec:", eB?.message?.slice(0, 80));
        }
      }
      const { url, model, size: usedSize, prompt: usedPrompt } = await generateImage(
        userPrompt,
        (styleObj ? styleObj.suffix : "") + negSuffix,
        { modelFirst: _modelFirst ? String(_modelFirst) : undefined } // 🔒 v10.1: pin model saja
      );

      // 🐛 v20.17/20.18: JANGAN proxy → base64 & JANGAN HEAD cek (biang timeout Vercel).
      // URL asli dikirim; client memuat via /api/proxy-img kalau CORS.
      return NextResponse.json({
        url, originalUrl: url.startsWith("http")?url:null,
        model, size: usedSize, prompt: usedPrompt, styleLabel: styleObj?.label,
        cached: url.startsWith("data:"),
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
