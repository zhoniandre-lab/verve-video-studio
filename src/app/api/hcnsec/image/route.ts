import { NextResponse } from "next/server";
import { generateImage, IMAGE_STYLES } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

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
    const { title, keyword, niche, style, prompt, _rawPrompt } = await req.json();
    const styleObj = _rawPrompt ? null : (IMAGE_STYLES.find(s => s.id === style) || IMAGE_STYLES[0]);
    // Jika _rawPrompt=true, gunakan `title` atau `prompt` sebagai prompt penuh (dari visual_prompt storyboard)
    let userPrompt = _rawPrompt
      ? (prompt || title || "").toString()
      : `${title || ""} ${keyword || ""} ${niche || ""}`.trim();

    if (!userPrompt) return NextResponse.json({ error: "Prompt kosong" }, { status: 400 });

    try {
      const { url, model, size: usedSize, prompt: usedPrompt } = await generateImage(
        userPrompt,
        styleObj ? styleObj.suffix : undefined
      );

      let dataUrl = url;
      if (url.startsWith("http")) {
        try {
          dataUrl = await proxyImageToBase64(url);
        } catch (proxyErr: any) {
          console.warn("[image] proxy gagal:", proxyErr.message);
        }
      }

      return NextResponse.json({
        url: dataUrl,
        originalUrl: url.startsWith("http") ? url : null,
        model, size: usedSize, prompt: usedPrompt,
        styleLabel: styleObj?.label || "Custom",
        cached: dataUrl.startsWith("data:"),
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
