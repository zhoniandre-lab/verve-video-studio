/* 👨‍🏫 v19.60 ANALIS CHANNEL — MODE KONSULTASI
   POST /api/analis/chat  { question, data }
   - AI online (hcnsec chat) dengan SYSTEM PROMPT ala profesor + data channel
     user sebagai konteks → jawaban nyambung, bukan generik.
   - Kalau AI gagal (internet/key mati) → fallback OFFLINE (mesin aturan) —
     tetap jawab pakai data, jujur. */
import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";
import { jawabOffline, type AnalisData } from "@/lib/brain/analis-offline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Kamu adalah "Analis Channel" — konsultan YouTube pribadi di aplikasi Verve.
GAYA: bahasa Indonesia kasual tapi profesional, panggil user "bro". Jelasin dulu KENAPA (2-3 kalimat), lalu STEP BY STEP (3-5 langkah bernomor), tutup dengan 1 TARGET terukur. Jangan lebay, jangan janji palsu.

ATURAN KERAS:
1. HANYA pakai data yang diberikan. JANGAN mengarang angka. Kalau data kurang → bilang jujur & minta data itu.
2. Framework 3 pintu channel naik:
   - Packaging (CTR): ≥5% hijau · 3-5% kuning · <3% merah
   - Isi (retensi): ≥60% hijau · 40-60% kuning · <40% merah
   - Komunitas (penonton kembali): ≥15% hijau · 8-15% kuning · <8% merah
   - Konversi subscriber: ≥2% hijau · <1% merah
3. Konten user = long-form cerita/lagu (niche "Cerita Jadi Lagu"). Resep yang terbukti:
   judul [Emosi] + (kurung penasaran), thumbnail wajah + teks 3 kata + kontras,
   durasi 5-7 menit, hook 3 detik, end screen saling nyambung, CTA subscribe
   di detik 10-20, playlist sendiri.
4. Jawab pertanyaan yang ditanya user SAJA — jangan nglantur.`;

export async function POST(req: Request) {
  const { question, data } = await req.json().catch(() => ({}));
  const q = String(question || "").trim();
  if (!q) return NextResponse.json({ ok: false, error: "Pertanyaan kosong." }, { status: 400 });
  const d: AnalisData = (data && typeof data === "object" ? data : {}) as AnalisData;

  // 🔌 AI online dulu
  try {
    const konteks = [
      `Data channel user (hanya ini yang boleh dipakai):`,
      `- Judul: ${d.title || "(tidak diisi)"}`,
      `- Views: ${d.views ?? "?"}`,
      `- Waktu tonton (jam/28hr): ${d.watchTimeHours ?? "?"}`,
      `- CTR: ${d.ctrPct ?? "?"}%`,
      `- Retensi: ${d.retention30Pct ?? "?"}%`,
      `- Subscriber +: ${d.subs ?? "?"}`,
      `- Penonton kembali: ${d.returningPct ?? "?"}%`,
      d.traffic?.length ? `- Sumber tayangan: ${d.traffic.slice(0, 3).map((t) => `${t.label} ${t.pct}%`).join(", ")}` : "",
      "",
      `Pertanyaan user: ${q}`,
    ].filter(Boolean).join("\n");
    const reply = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: konteks },
    ]);
    if (reply && reply.trim().length > 3) {
      return NextResponse.json({ ok: true, reply: reply.trim(), source: "ai" });
    }
  } catch { /* jatuh ke offline */ }

  // 🛡 Offline / AI mati → mesin aturan
  return NextResponse.json({ ok: true, reply: jawabOffline(d, q), source: "offline" });
}
