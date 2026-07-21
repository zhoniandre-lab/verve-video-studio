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

KAMUS PERINTAH — pilih SATU set sesuai KONTEKS.mode:
* KONTEKS.mode == "studio"  → pakai SET STUDIO (video dari adegan gambar + lagu di timeline editor)
* selain itu ("wizard")     → pakai SET WIZARD di bawah

SET STUDIO (GRATIS, langsung jalan, bisa di-Undo kecuali diberi tanda):
- {"op":"set_ratio","ratio":"16:9|9:16|1:1"}
- {"op":"set_transition","transition":"zoom|fade|slide|blur|glitch|dissolve|none","dur":0.2..3}
- {"op":"set_slide_dur","detik":0.5..30}      (durasi default tiap adegan)
- {"op":"set_slide_time","slide":N,"detik":0.5..30}
- {"op":"set_music_vol","vol":0..1.5}         (1 = 100%)
- {"op":"set_voice_vol","vol":0..1.5}
- {"op":"set_music_fade","fade_in":0..15,"fade_out":0..15}
- {"op":"set_music_off","detik":0..300}
- {"op":"set_muted","on":true}
- {"op":"edit_caption","slide":N,"text":"teks karaoke baru adegan N"}
- {"op":"move_slide","from":A,"to":B}
- {"op":"delete_slide","slide":N}             (hanya bila pembuat meminta; masih bisa di-Undo)
- {"op":"set_bg","mode":"cover|blur|color","color":"#hex"}
- {"op":"set_filter","preset":"id dari KONTEKS.daftar_filter"}
- {"op":"set_quality","sharp":true}
- {"op":"set_motion","slide":N,"mode":"zoompelan|denyut|goyang|melayang|berkedip|ayun|none"}   (GERAK GAMBARNYA ala CapCut — slide boleh dikosongkan = SEMUA adegan. Untuk permintaan "zoom in/out pada gambar" pakai INI, BUKAN set_transition)
- {"op":"clear_caption"}                (hapus keterangan otomatis — gratis)
BERAT TAPI GRATIS (aplikasi hanya menampilkan tombol Gas/Batal — kerja keras HP, BUKAN kredit):
- {"op":"render_now"}  (hanya bila pembuat minta render/ekspor/download/jadikan video)
- {"op":"auto_caption"} (keterangan/karaoke otomatis dari AUDIO — transkripsi AI whisper, ±1–2 menit; hanya bila pembuat minta keterangan/lirik jalan/karaoke otomatis)
Nomor adegan HARUS 1..KONTEKS.jumlah_adegan.
PENTING soal zoom: "zoom in/out pada GAMBAR / biar gambarnya gerak keren" = set_motion mode zoompelan — set_transition HANYA sambungan antar-adegan. Kalau pembuat minta zoom KELUAR, pasang zoompelan lalu di "reply" jujur bahwa arah keluar belum ada (gerak masuk dulu). Untuk "keterangan otomatis / karaoke otomatis / lirik jalan" pakai auto_caption, JANGAN ngaku sudah selesai tanpa ops.

SET WIZARD — GRATIS (langsung dijalankan aplikasi, tanpa kredit):
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

/** 🎬 v11.1: validator SET STUDIO — angka dijepit, nomor adegan wajib sah, perintah aneh dibuang transparan. */
const TRANS = new Set(["zoom", "fade", "slide", "blur", "glitch", "dissolve", "none"]);
const STUDIO_OPS = new Set([
  "set_ratio", "set_transition", "set_slide_dur", "set_slide_time", "set_music_vol", "set_voice_vol",
  "set_music_fade", "set_music_off", "set_muted", "edit_caption", "move_slide", "delete_slide",
  "set_bg", "set_filter", "set_quality", "render_now",
  "set_motion", "auto_caption", "clear_caption", // 🎬 v11.3: gerak gambar + keterangan otomatis
]);
const MOTIONS = new Set(["none", "denyut", "goyang", "zoompelan", "melayang", "berkedip", "ayun"]);
const num = (v: unknown, a: number, b: number): number | null => {
  const n = Number(v);
  return isFinite(n) ? Math.min(b, Math.max(a, n)) : null;
};
function cleanStudioOps(raw: unknown, nSlides: number): { ops: Op[]; dropped: string[] } {
  const ops: Op[] = [];
  const dropped: string[] = [];
  if (!Array.isArray(raw)) return { ops, dropped };
  const slideOk = (v: unknown) => { const n = Math.round(Number(v)); return Number.isInteger(n) && n >= 1 && n <= nSlides; };
  for (const item of raw.slice(0, 8)) {
    const o = (item || {}) as Op;
    const name = String(o.op || "");
    if (!STUDIO_OPS.has(name)) { dropped.push(`op studio tak dikenal: ${name}`); continue; }
    const out: Op = { op: name };
    if (name === "set_ratio") { if (!["16:9", "9:16", "1:1"].includes(String(o.ratio))) { dropped.push("rasio aneh"); continue; } out.ratio = String(o.ratio); }
    if (name === "set_transition") { if (!TRANS.has(String(o.transition))) { dropped.push(`transisi aneh: ${o.transition}`); continue; } out.transition = String(o.transition); const d = num(o.dur, 0.2, 3); if (d !== null) out.dur = d; }
    if (name === "set_slide_dur") { const d = num(o.detik, 0.5, 30); if (d === null) { dropped.push("durasi aneh"); continue; } out.detik = d; }
    if (name === "set_slide_time") { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } out.slide = Math.round(Number(o.slide)); const d = num(o.detik, 0.5, 30); if (d === null) { dropped.push("durasi aneh"); continue; } out.detik = d; }
    if (name === "set_music_vol" || name === "set_voice_vol") { const v = num(o.vol, 0, 1.5); if (v === null) { dropped.push("volume aneh"); continue; } out.vol = v; }
    if (name === "set_music_fade") { const fi = num(o.fade_in, 0, 15); const fo = num(o.fade_out, 0, 15); if (fi === null && fo === null) { dropped.push("fade tanpa nilai"); continue; } if (fi !== null) out.fade_in = fi; if (fo !== null) out.fade_out = fo; }
    if (name === "set_music_off") { const d = num(o.detik, 0, 300); if (d === null) { dropped.push("offset aneh"); continue; } out.detik = d; }
    if (name === "set_muted") { out.on = !!o.on; }
    if (name === "edit_caption") { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } out.slide = Math.round(Number(o.slide)); out.text = s(o.text, 120); }
    if (name === "move_slide") { const f = Math.round(Number(o.from)), t = Math.round(Number(o.to)); if (!slideOk(f) || !slideOk(t)) { dropped.push("move_slide di luar jangkauan"); continue; } out.from = f; out.to = t; }
    if (name === "delete_slide") { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } if (nSlides <= 1) { dropped.push("menolak hapus adegan terakhir"); continue; } out.slide = Math.round(Number(o.slide)); }
    if (name === "set_motion") { if (!MOTIONS.has(String(o.mode))) { dropped.push(`mode gerak aneh: ${o.mode}`); continue; } out.mode = String(o.mode); if (o.slide !== undefined) { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } out.slide = Math.round(Number(o.slide)); } }
    if (name === "set_bg") { if (!["cover", "blur", "color"].includes(String(o.mode))) { dropped.push("mode latar aneh"); continue; } out.mode = String(o.mode); const c = s(o.color, 20); if (c) out.color = c; }
    if (name === "set_filter") { const f = s(o.preset, 30); if (!f) { dropped.push("filter kosong"); continue; } out.preset = f; }
    if (name === "set_quality") { out.sharp = !!o.sharp; }
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
        const isStudio = String(ctx.mode || "") === "studio";
        const nSlides = Array.isArray(ctx.durasi_tiap_adegan) ? ctx.durasi_tiap_adegan.length : (Number(ctx.jumlah_adegan) || 0);
        const { ops, dropped } = isStudio ? cleanStudioOps(parsed.ops, nSlides) : cleanOps(parsed.ops, nScenes);
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
