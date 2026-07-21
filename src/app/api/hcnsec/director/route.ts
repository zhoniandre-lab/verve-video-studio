// 🎬 v11.0 SUTRADARA CHAT — OTAK penerjemah bahasa manusia → perintah editing terstruktur.
// Prinsip: AI TIDAK menyentuh video langsung. AI menjawab JSON murni { reply, ops[] } —
// mesin klien yang memvalidasi & mengeksekusi. Perintah bakar kredit HANYA diusulkan
// (klien menampilkan tombol Gas/Batal). Self-contained: tidak mengubah lib bersama.
import { NextResponse } from "next/server";
import { FAST_CHAT_MODELS } from "@/lib/types";
import { safeParseJSON } from "@/lib/json-util";

export const maxDuration = 60;

const BASE_URL = (process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1").replace(/\/$/, "");

const SYS = `Kamu SUTRADARA — asisten penyunting video di aplikasi VERVE (dipakai di HP, niche "cerita jadi lagu").
Gayamu santai Indonesia ala "bro", singkat, jujur. Video pembuat dibangun dari: ADEGAN bergambar (tiap adegan punya prompt Inggris + baris karaoke), satu LAGU AI (lirik berstruktur [Verse]/[Chorus]), dan SETELAN musik.

ATURAN OUTPUT KERAS (tidak boleh dilanggar):
- Jawab HANYA JSON murni satu objek. TANPA markdown, TANPA teks di luar JSON:
  {"reply":"jawaban singkat untuk pembuat","ops":[ ...perintah... ]}

KAMUS PERINTAH — hanya ini yang boleh keluar:
GRATIS (langsung dijalankan aplikasi, tanpa kredit):
- {"op":"set_title","title":"judul baru"}
- {"op":"set_visual_style","style_visual":"gaya sinematik","color_grade":"#hex"}
- {"op":"edit_scene_prompt","scene":N,"visual_en":"prompt Inggris pengganti untuk adegan N"}
- {"op":"edit_scene_line","scene":N,"lyric_line":"baris karaoke pengganti untuk adegan N"}
- {"op":"edit_lyrics","lyrics":"lirik utuh hasil tulis ulang — WAJIB mempertahankan tag [Verse]/[Chorus]"}
- {"op":"set_style","mStyle":"style musik bebas bahasa Inggris"}
- {"op":"set_music_knobs","era":"2020s|2010s|2000s|90s|80s","tempo":"slow|mid|fast","instruments":"dipisah koma","vocal":"male|female|auto|instrumental","model":"V4_5PLUS|V5_5|V5|V4_5ALL|V4_5|V4|V3_5"}
  (isikan HANYA kenop yang diminta berubah)
BAKAR KREDIT (aplikasi hanya MENAMPILKAN tombol Gas/Batal — keputusan di tangan pembuat):
- {"op":"regen_scene","scene":N,"instruction":"arahan perubahan gambar adegan N"}
- {"op":"regen_song","instruction":"arahan perubahan lagu (gaya/mood/vokal)"}

LARANGAN:
- Jangan mengarang perintah di luar kamus. Kalau permintaan pembuat di luar kemampuan ini, jelaskan jujur di "reply" dan keluarkan "ops":[].
- Kalau pembuat cuma bertanya/ngobrol/minta saran → jawab di "reply", "ops":[].
- Nomor adegan HARUS ada di KONTEKS (1..N). Jangan mengubah yang tidak diminta.
- Untuk "lagunya kurang sedih/galau/dll" → biasanya cukup set_style atau regen_song; pilih SATU yang paling pas, jangan dobel.
- "reply" maksimal 2 kalimat, sebutkan apa yang kamu lakukan/usulkan.`;

type Op = Record<string, unknown>;
const FREE_OPS = new Set(["set_title", "set_visual_style", "edit_scene_prompt", "edit_scene_line", "edit_lyrics", "set_style", "set_music_knobs"]);
const COST_OPS = new Set(["regen_scene", "regen_song"]);
const ERAS = new Set(["2020s", "2010s", "2000s", "90s", "80s"]);
const TEMPOS = new Set(["slow", "mid", "fast"]);
const VOCALS = new Set(["male", "female", "auto", "instrumental"]);
const MODELS = new Set(["V4_5PLUS", "V5_5", "V5", "V4_5ALL", "V4_5", "V4", "V3_5"]);

function s(v: unknown, max: number): string { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

/** Validasi + bersihkan ops dari model. Yang aneh dibuang dengan alasan — transparan ke pembuat. */
function cleanOps(raw: unknown, nScenes: number): { ops: Op[]; dropped: string[] } {
  const ops: Op[] = [];
  const dropped: string[] = [];
  if (!Array.isArray(raw)) return { ops, dropped };
  for (const item of raw.slice(0, 8)) {
    const o = (item || {}) as Op;
    const name = String(o.op || "");
    if (!FREE_OPS.has(name) && !COST_OPS.has(name)) { dropped.push(`op tak dikenal: ${name}`); continue; }
    const out: Op = { op: name };
    const sc = Number(o.scene);
    if (["edit_scene_prompt", "edit_scene_line", "regen_scene"].includes(name)) {
      if (!Number.isInteger(sc) || sc < 1 || sc > nScenes) { dropped.push(`${name}: adegan ${o.scene} tidak ada`); continue; }
      out.scene = sc;
    }
    if (name === "set_title") { const v = s(o.title, 90); if (!v) { dropped.push("set_title kosong"); continue; } out.title = v; }
    if (name === "set_visual_style") { if (s(o.style_visual, 80)) out.style_visual = s(o.style_visual, 80); if (s(o.color_grade, 9)) out.color_grade = s(o.color_grade, 9); if (!out.style_visual && !out.color_grade) { dropped.push("set_visual_style kosong"); continue; } }
    if (name === "edit_scene_prompt") { const v = s(o.visual_en, 700); if (v.length < 8) { dropped.push("visual_en kependekan"); continue; } out.visual_en = v; }
    if (name === "edit_scene_line") { out.lyric_line = s(o.lyric_line, 160); }
    if (name === "edit_lyrics") { const v = s(o.lyrics, 4000); if (v.length < 30) { dropped.push("lirik terlalu pendek"); continue; } out.lyrics = v; }
    if (name === "set_style") { const v = s(o.mStyle, 480); if (v.length < 4) { dropped.push("style kependekan"); continue; } out.mStyle = v; }
    if (name === "set_music_knobs") {
      let any = false;
      if (o.era && ERAS.has(String(o.era))) { out.era = String(o.era); any = true; }
      if (o.tempo && TEMPOS.has(String(o.tempo))) { out.tempo = String(o.tempo); any = true; }
      if (o.vocal && VOCALS.has(String(o.vocal))) { out.vocal = String(o.vocal); any = true; }
      if (o.model && MODELS.has(String(o.model))) { out.model = String(o.model); any = true; }
      const ins = s(o.instruments, 200); if (ins) { out.instruments = ins; any = true; }
      if (!any) { dropped.push("set_music_knobs tanpa nilai sah"); continue; }
    }
    if (name === "regen_scene" || name === "regen_song") { const v = s(o.instruction, 300); if (v.length < 3) { dropped.push(`${name} tanpa arahan`); continue; } out.instruction = v; }
    ops.push(out);
  }
  return { ops, dropped };
}

export async function POST(req: Request) {
  try {
    const key = process.env.HCNSEC_API_KEY || "";
    if (!key) return NextResponse.json({ error: "HCNSEC_API_KEY belum di-set di Vercel → Settings → Environment Variables." }, { status: 500 });
    const body = await req.json().catch(() => ({}));
    const message = s(body.message, 800);
    if (!message) return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
    const ctx = body.ctx || {};
    const nScenes = Array.isArray(ctx.scenes) ? ctx.scenes.length : 0;
    const hist: { me?: string; text?: string }[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages = [
      { role: "system", content: SYS },
      ...hist.map((h) => ({ role: h.me === "me" ? "user" : "assistant", content: s(h.text, 600) })).filter((h) => h.content),
      { role: "user", content: `KONTEKS PROYEK SAAT INI:\n${JSON.stringify(ctx).slice(0, 6000)}\n\nPERINTAH PEMBUAT: ${message}` },
    ];

    // Fallback antarmodel cepat (pola sama seperti lib chat, tapi parameter milik route ini sendiri)
    const models = FAST_CHAT_MODELS.slice(0, 5);
    const timeouts = [20, 25, 30, 40, 45];
    const errs: string[] = [];
    for (let i = 0; i < models.length; i++) {
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), timeouts[Math.min(i, timeouts.length - 1)] * 1000);
        let data: any;
        try {
          const r = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: models[i], messages, temperature: 0.35, max_tokens: 1600, stream: false }),
            signal: ac.signal,
          });
          const txt = await r.text();
          try { data = JSON.parse(txt); } catch { data = {}; }
          if (!r.ok) throw new Error(String(data?.error?.message || data?.message || `HTTP ${r.status}`).slice(0, 200));
        } finally { clearTimeout(to); }
        const content = data?.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);
        if (!parsed || typeof parsed !== "object") throw new Error("jawaban bukan JSON");
        const reply = s(parsed.reply, 600) || "Siap bro.";
        const { ops, dropped } = cleanOps(parsed.ops, nScenes);
        return NextResponse.json({ reply, ops, dropped, model_used: models[i] });
      } catch (e) {
        errs.push(`${models[i]}: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
      }
    }
    return NextResponse.json({ error: `Sutradara lagi pusing — semua model gagal. Coba sebentar lagi. (${errs[0] || ""})` }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server Sutradara error" }, { status: 500 });
  }
}
