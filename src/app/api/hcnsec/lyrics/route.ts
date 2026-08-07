import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";
import { buildSystemPrompt, parseLyrics } from "@/lib/lyrics-prompt";
import { chatOpenAiCompatible } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";

/** 🧠 v19.38.1: urutan sumber AI yang BENAR:
 *  1) HCNSEC (mesin bawaan — key server Vercel) → INI AI UTAMA user.
 *  2) BANSOS (OpenAI-compatible dari Dompet Bansos) → HANYA cadangan kalau
 *     hcnsec gagal (mis. key server kosong). BUKAN pengganti utama.
 */
async function cobaBansos(req: Request, title: string, keyword: string, niche: string, genre: string, mood: string) {
  const base = (req.headers.get("x-bansos-chat-base") || "").trim().replace(/\/+$/, "");
  const key = (req.headers.get("x-bansos-chat-key") || "").trim();
  const model = (req.headers.get("x-bansos-chat-model") || "").trim();
  if (!/^https?:\/\//.test(base) || !key) return null;
  try {
    const sys = buildSystemPrompt(title, keyword, niche, genre, mood);
    const raw = await chatOpenAiCompatible(base, key, model, [{ role: "user", content: sys }]);
    return parseLyrics(raw);
  } catch (e) {
    console.warn("[lyrics] bansos gagal:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function cobaHcnsec(title: string, keyword: string, niche: string, genre: string, mood: string) {
  const sys = buildSystemPrompt(title, keyword, niche, genre, mood);
  const raw = await chat([{ role: "user", content: sys }]);
  return parseLyrics(raw);
}

export async function POST(req: Request) {
  try {
    const { title, keyword, niche, genre, mood } = await req.json();
    if (!title) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });

    let lastErr: any = null;

    // 1) AI UTAMA: hcnsec (key server) — yang selama ini jalan di Lahan
    for (let i = 1; i <= 3; i++) {
      try {
        const parsed = await cobaHcnsec(title, keyword || "", niche || "", genre || "", mood || "");
        return NextResponse.json({ ...parsed, sumber: "hcnsec" });
      } catch (e) { lastErr = e; }
    }

    // 2) CADANGAN: bansos (kalau hcnsec benar-benar gagal)
    const viaBansos = await cobaBansos(req, title, keyword || "", niche || "", genre || "", mood || "");
    if (viaBansos) return NextResponse.json({ ...viaBansos, sumber: "bansos" });

    return NextResponse.json(
      { error: `Lirik gagal: ${lastErr?.message || "coba lagi"}.` },
      { status: 500 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Gagal buat lirik" }, { status: 500 });
  }
}
