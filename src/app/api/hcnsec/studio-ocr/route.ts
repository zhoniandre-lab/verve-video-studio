import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 35;

const MAX_IMAGE_BYTES = 2_500_000;
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanOcrText(s: string): string {
  return String(s || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 30_000);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image");
    if (!(image instanceof File)) return json(400, { ok: false, error: "File screenshot belum ada." });
    if (!image.type.startsWith("image/")) return json(400, { ok: false, error: "File harus berupa gambar screenshot." });
    if (image.size > MAX_IMAGE_BYTES) return json(413, { ok: false, error: "Gambar masih terlalu besar. Coba screenshot dipotong/kompres dulu." });

    const envKey = process.env.OCR_SPACE_API_KEY || process.env.OCRSPACE_API_KEY || "";
    const apiKey = envKey || "helloworld"; // demo key OCR.space: cukup untuk uji, sebaiknya pasang env sendiri.
    const fd = new FormData();
    fd.set("apikey", apiKey);
    fd.set("language", "eng");
    fd.set("OCREngine", "2");
    fd.set("scale", "true");
    fd.set("detectOrientation", "true");
    fd.set("isOverlayRequired", "false");
    fd.set("file", image, image.name || "studio-screenshot.jpg");

    const res = await fetch(OCR_ENDPOINT, { method: "POST", body: fd, signal: AbortSignal.timeout(30_000) });
    const data = await res.json().catch(() => null) as null | {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string[] | string;
      ParsedResults?: { ParsedText?: string }[];
    };
    if (!res.ok || !data) return json(502, { ok: false, error: "Server OCR belum merespons normal." });
    if (data.IsErroredOnProcessing) {
      const raw = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(" ") : String(data.ErrorMessage || "OCR gagal membaca gambar.");
      return json(502, { ok: false, error: raw || "OCR gagal membaca gambar.", demo: !envKey });
    }

    const text = cleanOcrText((data.ParsedResults || []).map((x) => x.ParsedText || "").filter(Boolean).join("\n"));
    if (!text) return json(422, { ok: false, error: "OCR selesai, tapi teks tidak terbaca. Coba crop bagian angka atau pakai screenshot lebih jelas.", demo: !envKey });
    return json(200, { ok: true, text, provider: "ocr.space", demo: !envKey });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "OCR timeout. Coba gambar lebih kecil/jaringan lebih stabil." : "OCR gagal diproses.";
    return json(500, { ok: false, error: msg });
  }
}
