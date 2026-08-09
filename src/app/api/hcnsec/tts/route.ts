import { NextResponse } from "next/server";
import { generateSpeech } from "@/lib/hcnsec";
import { edgeTTS, NEW_TO_LEGACY } from "@/lib/edge-tts";

// ⏱ Vercel Hobby maks 60 detik — TTS panjang butuh waktu
export const maxDuration = 60;

export async function POST(req: Request) {
  const { text, voice, style } = await req.json().catch(() => ({}));
  const teks = String(text || "").slice(0, 3500);
  if (!teks.trim()) return NextResponse.json({ error: "Teks kosong — isi teks dulu ya." }, { status: 400 });

  // 1️⃣ PRIORITAS: suara utama hcnsec (multi-model × multi-format, v19.48)
  try {
    const voiceHcnsec = NEW_TO_LEGACY[String(voice || "").toLowerCase()] || voice || "alloy";
    const dataUrl = await generateSpeech(teks, voiceHcnsec);
    return NextResponse.json({ url: dataUrl, source: "hcnsec" });
  } catch (e: any) {
    const st = e?.status;
    // 2️⃣ FALLBACK OTOMATIS: Edge TTS (neural natural, gratis) — biar Teks ke Audio TETAP JADI
    try {
      const res = await edgeTTS(teks, voice, style);
      const notice =
        (st === 401 || st === 403
          ? "⚠️ Suara utama (hcnsec): API key tidak valid — cek HCNSEC_API_KEY di Vercel. "
          : st === 402
            ? "⚠️ Suara utama (hcnsec): saldo habis. "
            : st === 503
              ? "⚠️ Suara utama (hcnsec) sedang gangguan (503). "
              : "⚠️ Suara utama (hcnsec) gagal. ") +
        `Dipakai suara cadangan: ${res.voiceName} (${res.style}).`;
      if (res.chunks.length === 1) {
        return NextResponse.json({ url: res.url, chunks: res.chunks, source: "edge", voice: res.voice, voiceName: res.voiceName, style: res.style, notice });
      }
      return NextResponse.json({ chunks: res.chunks, source: "edge", voice: res.voice, voiceName: res.voiceName, style: res.style, notice });
    } catch (e2: any) {
      // 3️⃣ dua-duanya gagal → pesan JELAS per status hcnsec
      const msg =
        st === 401 || st === 403
          ? "API key AI utama tidak valid/kedaluwarsa — cek HCNSEC_API_KEY di Vercel → Settings → Environment Variables. (Suara cadangan juga gagal.)"
          : st === 402
            ? "Saldo API AI utama habis — top up dulu ya. (Suara cadangan juga gagal.)"
            : st === 503
              ? "Penyedia suara utama sedang gangguan (503) dan suara cadangan gagal juga. Coba lagi beberapa saat."
              : `Gagal buat suara: ${e?.message || "?"} — cadangan juga gagal: ${e2?.message || "?"}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }
}
