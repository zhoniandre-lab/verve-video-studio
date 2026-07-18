import { NextResponse } from "next/server";
import { generateImage, IMAGE_STYLES } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

async function proxyImageToBase64(url: string): Promise<string> {
  // Fetch remote image server-side (no CORS), convert ke data URL agar client aman
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VerveProxy/1.0)" },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`Gagal download gambar: HTTP ${r.status}`);
  const contentType = r.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await r.arrayBuffer());
  // Kalau sudah besar (>4MB), re-encode ke JPEG quality 0.9 untuk hemat bandwidth
  if (buf.length > 4 * 1024 * 1024 || !contentType.startsWith("image/")) {
    // Biarkan client handle re-encode; kita return apa adanya
  }
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, style } = await req.json();
    const styleObj = IMAGE_STYLES.find(s => s.id === style) || IMAGE_STYLES[0];
    const base = `${title || ""} ${keyword || ""} ${niche || ""}`.trim();
    try {
      const { url, model, size: usedSize, prompt } = await generateImage(base, styleObj.suffix);

      // Kalau hasilnya URL remote (http/https), proxy lewat server agar tidak CORS di browser
      let dataUrl = url;
      if (url.startsWith("http")) {
        try {
          dataUrl = await proxyImageToBase64(url);
        } catch (proxyErr: any) {
          console.warn("[image] proxy gagal, coba kirim URL asli:", proxyErr.message);
          // Fallback: kirim URL asli; client akan coba load (bisa gagal di beberapa browser)
        }
      }

      return NextResponse.json({
        url: dataUrl,
        originalUrl: url.startsWith("http") ? url : null,
        model,
        size: usedSize,
        prompt,
        styleLabel: styleObj.label,
        cached: dataUrl.startsWith("data:"),
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal generate gambar" }, { status: 500 });
  }
}
