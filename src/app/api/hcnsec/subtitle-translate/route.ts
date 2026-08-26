import { NextResponse } from "next/server";
import { bansosChatConfig } from "@/lib/bansos";
import { chat } from "@/lib/hcnsec";
import { chatOpenAiCompatible, type Pesan } from "@/lib/openai-compat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Mode = "translate" | "transliterate";
type InputCue = { id: string; start?: number; end?: number; original?: string; text?: string };
type OutputCue = { id: string; text: string };

const MAX_CUES = 120;
const MAX_CUE_CHARS = 700;
const MAX_TOTAL_CHARS = 45_000;
const CHUNK_SIZE = 8;

const LANG_NAMES: Record<string, string> = {
  id: "Bahasa Indonesia",
  en: "English",
  ms: "Bahasa Melayu",
  tr: "Türkçe",
  ur: "Urdu",
  fa: "Bahasa Persia",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  bn: "Bengali",
  hi: "Hindi",
  zh: "Mandarin Chinese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  ar: "Bahasa Arab",
};

function languageName(value: unknown): string {
  const raw = String(value || "").trim();
  if (raw.toLowerCase() === "auto") return "bahasa yang terdeteksi otomatis";
  return LANG_NAMES[raw.toLowerCase()] || raw.slice(0, 80);
}

function parseJsonArray(raw: string): OutputCue[] {
  const cleaned = String(raw || "").replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Respons terjemahan bukan JSON array");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.translations) ? parsed.translations : null;
  if (!rows) throw new Error("Respons terjemahan tidak punya daftar translations");
  return rows.map((row: any) => ({ id: String(row?.id || ""), text: String(row?.text || "").replace(/\s+/g, " ").trim() }));
}

async function askTranslator(req: Request, messages: Pesan[]): Promise<{ text: string; engine: string }> {
  let hcnError = "";
  if (process.env.HCNSEC_API_KEY) {
    try {
      return { text: await chat(messages, process.env.HCNSEC_TRANSLATE_MODEL || undefined), engine: "HCNSEC" };
    } catch (error: any) {
      hcnError = String(error?.message || "HCNSEC gagal").slice(0, 120);
    }
  }

  const bansos = bansosChatConfig(req.headers);
  if (bansos) {
    try {
      return { text: await chatOpenAiCompatible(bansos.base, bansos.key, bansos.model, messages, 45), engine: "Dompet Bansos" };
    } catch (error: any) {
      throw new Error(String(error?.message || "Dompet Bansos gagal").slice(0, 160));
    }
  }

  throw new Error(hcnError || "Mesin terjemahan belum tersedia. Isi HCNSEC_API_KEY di server atau sambungkan Dompet Bansos.");
}

function cleanInputCues(value: unknown): InputCue[] {
  if (!Array.isArray(value)) return [];
  const result: InputCue[] = [];
  let total = 0;
  for (const raw of value) {
    const id = String((raw as any)?.id || `sub_${result.length + 1}`).slice(0, 80);
    const text = String((raw as any)?.original || (raw as any)?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CUE_CHARS);
    if (!text) continue;
    total += text.length;
    if (total > MAX_TOTAL_CHARS || result.length >= MAX_CUES) break;
    result.push({ id, text, start: Number((raw as any)?.start), end: Number((raw as any)?.end) });
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cues = cleanInputCues(body?.cues);
    const target = languageName(body?.targetLanguage);
    const source = languageName(body?.sourceLanguage || "ar") || "Bahasa Arab";
    const mode: Mode = body?.mode === "transliterate" ? "transliterate" : "translate";
    if (!cues.length) return NextResponse.json({ ok: false, error: "Tidak ada segmen subtitle untuk diterjemahkan." }, { status: 400 });
    if (!target || target.length < 2) return NextResponse.json({ ok: false, error: "Bahasa tujuan belum dipilih." }, { status: 400 });

    const system = mode === "transliterate"
      ? `Kamu adalah editor transliterasi. Ubah teks ${source} ke huruf Latin yang mudah dibaca, tanpa menerjemahkan maknanya. Pertahankan urutan, nama, dan istilah agama. Jangan meringkas, menjelaskan, atau menambah isi.`
      : `Kamu adalah penerjemah subtitle ${source} ke ${target}. Terjemahkan secara akurat, natural, dan ringkas agar nyaman dibaca di video. Jangan meringkas, menggabungkan, menghapus, atau menambah makna. Pertahankan nama orang, doa, kutipan ayat, hadis, dan istilah agama dengan hati-hati. Bila ada bagian yang tidak jelas, terjemahkan sedekat mungkin dan jangan mengarang.`;
    const instructions = `${system}\n\nBalas HANYA JSON array valid dengan format [{"id":"id_asli","text":"hasil"}]. Satu input harus menghasilkan tepat satu output dengan id yang sama. Jangan gunakan markdown.`;
    const chunks: InputCue[][] = [];
    for (let i = 0; i < cues.length; i += CHUNK_SIZE) chunks.push(cues.slice(i, i + CHUNK_SIZE));

    const translated = await Promise.all(chunks.map(async (chunk) => {
      const prompt = `Bahasa sumber: ${source}\nBahasa hasil: ${target}\nMode: ${mode}\n\nINPUT:\n${JSON.stringify(chunk.map((cue) => ({ id: cue.id, text: cue.text })))}\n\nTerjemahkan sekarang.`;
      const answer = await askTranslator(req, [
        { role: "system", content: instructions },
        { role: "user", content: prompt },
      ]);
      const rows = parseJsonArray(answer.text);
      const byId = new Map(rows.map((row) => [row.id, row.text]));
      return { engine: answer.engine, rows: chunk.map((cue) => {
        const text = String(byId.get(cue.id) || "").trim();
        if (!text) throw new Error(`Segmen ${cue.id} tidak mendapat hasil`);
        return { id: cue.id, text };
      }) };
    }));

    const byId = new Map(translated.flatMap((part) => part.rows.map((row) => [row.id, row.text])));
    const result = cues.map((cue) => ({ id: cue.id, start: cue.start, end: cue.end, original: cue.text, text: byId.get(cue.id) || cue.text }));
    return NextResponse.json({ ok: true, cues: result, language: target, mode, engine: Array.from(new Set(translated.map((part) => part.engine))).join(" + ") });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Terjemahan subtitle gagal").slice(0, 240) }, { status: 502 });
  }
}
