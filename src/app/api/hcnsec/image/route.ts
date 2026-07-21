import { NextResponse } from "next/server";
import { generateImage, IMAGE_STYLES } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // v10.1: tegas — jangan pernah lewat anggaran serverless

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
      const { url, model, size: usedSize, prompt: usedPrompt } = await generateImage(
        userPrompt,
        (styleObj ? styleObj.suffix : "") + negSuffix,
        { modelFirst: _modelFirst ? String(_modelFirst) : undefined } // 🔒 v10.1: pin model saja
      );

      let dataUrl = url;
      if (url.startsWith("http")) {
        try { dataUrl = await proxyImageToBase64(url); }
        catch (e) { /* fallback URL asli */ }
      }
      return NextResponse.json({
        url: dataUrl, originalUrl: url.startsWith("http")?url:null,
        model, size: usedSize, prompt: usedPrompt, styleLabel: styleObj?.label,
        cached: dataUrl.startsWith("data:"),
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
