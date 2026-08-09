"use server";
import { NextResponse } from "next/server";
import { generateSpeech } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { text, voice } = await req.json();
    const dataUrl = await generateSpeech(text, voice || "alloy");
    return NextResponse.json({ url: dataUrl });
  } catch (e: any) {
    // 🐛 FIX v19.48: pesan error JELAS (bukan "Audio 400" mentah) — user tahu harus apa
    const status = e?.status;
    const msg = status === 400
      ? "Suara AI ditolak penyedia (400) — kemungkinan model TTS sedang berubah. Sudah dicoba beberapa model otomatis; coba lagi beberapa saat."
      : status === 401 || status === 403
        ? "API key AI tidak valid/kedaluwarsa — cek HCNSEC_API_KEY di Vercel → Settings → Environment Variables."
        : status === 402
          ? "Saldo API AI habis — top up dulu ya."
          : (e?.message || "Gagal buat suara");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
