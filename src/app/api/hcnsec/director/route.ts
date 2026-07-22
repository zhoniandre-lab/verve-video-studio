// 🎬 v11.0 SUTRADARA CHAT — OTAK penerjemah bahasa manusia → perintah editing terstruktur.
// Prinsip: AI TIDAK menyentuh video langsung. AI menjawab JSON murni { reply, ops[] } —
// mesin klien yang memvalidasi & mengeksekusi. Perintah bakar kredit HANYA diusulkan
// (klien menampilkan tombol Gas/Batal). Self-contained: tidak mengubah lib bersama.
import { NextResponse } from "next/server";
import { FAST_CHAT_MODELS } from "@/lib/types";
import { bansosChatConfig } from "@/lib/bansos";
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
- {"op":"set_motion","slide":N,"mode":"zoom_in|zoom_out|selangseling|geser_kiri|geser_kanan|naik|turun|sinematik|zoompelan|denyut|goyang|melayang|berkedip|ayun|none"}   (GERAK PADA GAMBARNYA ala CapCut, ZOOM KERAS TERLIHAT JELAS. slide kosong = SEMUA adegan. "zoom in dan zoom out biar gambar bergerak bagus" → mode selangseling (masuk/keluar bergantian per adegan). BUKAN set_transition. 🎬 v13.3 GERAK WAH: geser_kiri/geser_kanan/naik/turun = kamera mengalir satu arah; "sinematik" (slide kosong) = TIAP ADEGAN beda gerakan otomatis — zoom masuk → geser kiri → zoom keluar → geser kanan → naik → turun, kekuatan bervariasi. Untuk "lebih wah / variatif / jangan bolak-balik monoton / bosan gitu-gitu aja" → WAJIB mode sinematik, JANGAN selangseling berulang)
- {"op":"add_spectrum"}  (🌈 SPEKTRUM MUSIK ikut irama lagu — equalizer bergerak di video; untuk "spektrum/visualizer/equalizer/bars musik". GRATIS; pembuat bisa geser & atur waktunya di track)
- {"op":"add_cta"}  (▶️ TOMBOL CTA YOUTUBE nyatu: 👍 suka → SUBSCRIBE → 🔔 lonceng, dengan TANGAN yang mengklik berurutan; untuk "tombol subscribe/like/lonceng/CTA ajakan". GRATIS)
- {"op":"set_letterbox","on":true|false}  (🎬 LETTERBOX BIOSKOP: garis hitam atas-bawah layar lebar, ikut preview & render — untuk "seperti film/bioskop/sinematik layar lebar". GRATIS. PADUKAN dgn set_motion sinematik utk rasa film penuh: kirim KEDUA op ini bersamaan)
- {"op":"clear_caption"}                (hapus keterangan otomatis — gratis)
- {"op":"geser_keterangan","detik":-10..10}    (geser timing karaoke +-N detik — untuk "karaoke kecepetan/kelambatan/tidak pas dengan suara". NEGATIF = lebih awal/maju, POSITIF = lebih lambat/mundur)
- {"op":"matikan_animasi","slide":N}     (matikan klip video AI di adegan N — slide kosong = SEMUA. Gratis; gambar kembali biasa)
BERAT TAPI GRATIS (aplikasi hanya menampilkan tombol Gas/Batal — kerja keras HP, BUKAN kredit):
- {"op":"render_now"}  (hanya bila pembuat minta render/ekspor/download/jadikan video)
- {"op":"auto_caption"} (keterangan/karaoke otomatis dari AUDIO — transkripsi AI whisper, ±1–2 menit; hanya bila pembuat minta keterangan/lirik jalan/karaoke otomatis DAN belum ada karaoke)
- {"op":"selaraskan_ulang"} (karaoke SUDAH ADA tapi tidak pas — sinkron ulang lirik ke irama lagu dari nol; teks lama disingkirkan dulu, anti dobel)
BERAT + BAKAR KREDIT (kartu Gas/Batal juga, tapi ini KREDIT AI SUNGGUHAN — WAJIB jujur di "reply" bahwa ini memakai kredit):
- {"op":"animasikan_adegan","slide":N,"instruction":"arahan gerak opsional (Inggris)"} atau {"op":"animasikan_adegan","slide":"semua"}  (🎬 ANIMASI HIDUP: gambar adegan diubah jadi klip video bergerak AI ±5 detik yang ikut preview & render — untuk "jadikan semua gambar animasi bergerak / hidupkan adegan N / bikin video tiap gambar". Gagal? gambar aman + gerak halus otomatis tetap jalan)
CATATAN SELARAS: kalau karaoke sudah ada tapi timingnya tidak pas → pakai geser_keterangan (tawarkan 0.5–1 dtk) dan/atau selaraskan_ulang — JANGAN auto_caption polos (itu menambah teks baru di atas yang lama = karaoke dobel).
Nomor adegan HARUS 1..KONTEKS.jumlah_adegan.
PENTING soal zoom: "zoom/gerak pada GAMBAR" = set_motion (set_transition HANYA sambungan antar-adegan). zoom MASUK = zoom_in, zoom KELUAR = zoom_out (keduanya SUDAH ADA & keras terlihat), campuran keren = selangseling. Untuk "keterangan otomatis / karaoke otomatis / lirik jalan" pakai auto_caption, JANGAN ngaku sudah selesai tanpa ops. BEDAkan baik-baik: "zoom/efek gerak cepat ala CapCut" = set_motion (gratis, instan); "animasi bergerak sungguhan / video hidup / jadikan tiap gambar animasi seperti film" = animasikan_adegan (BAKAR KREDIT — selalu lewat kartu Gas/Batal). KONTEKS.adegan_hidup = nomor adegan yang SUDAH beranimasi AI: jangan tawarkan ulang; bila pembuat tidak puas dengan hasilnya, tawarkan matikan_animasi untuk adegan itu. ATURAN STATUS (WAJIB, anti ngarang): kamu TIDAK punya proses background — animasi hanya berjalan SETELAH pembuat menekan tombol Gas, dan kemajuannya ditampilkan aplikasi (bukan kamu). (1) Tepat setelah mengeluarkan op animasikan_adegan, "reply" WAJIB menyebut kartu Gas/Batal sudah muncul dan proses BARU mulai setelah Gas ditekan — DILARANG bilang "sedang berjalan" atau "sudah selesai". (2) Ditanya "udah belum / sudah jadi / gimana hasilnya" → jawab HANYA dari KONTEKS: animasi_sedang_jalan=true → "masih dikerjakan aplikasi, tunggu sampai pesan selesai muncul"; kartu_gas_menunggu mengandung animasikan_adegan → "belum mulai apa-apa — ketuk Gas dulu di kartu oranye"; hasil_animasi_terakhir bukan "belum pernah" → sebutkan persis isinya (kalau tertulis gagal → minta maaf, teruskan pesan errornya apa adanya, tawari coba lagi); adegan_hidup tak kosong → sebut nomor adegan yang sudah hidup. Tidak ada satupun yang cocok → jujur "belum ada proses animasi di sesi ini". CONTOH WAJIB — pesan pembuat: "animasikan semua gambar jadi video hidup" → jawaban benar: {"reply":"Siap! Ini bakar kredit video AI ya — kartu Gas/Batal sudah muncul di bawah. Ketuk Gas dan aplikasi mengerjakan satu per satu sampai selesai; kalau ada yang gagal, gambarnya aman.","ops":[{"op":"animasikan_adegan","slide":"semua"}]}

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
- "reply" maksimal 2 kalimat, sebutkan apa yang kamu lakukan/usulkan.
- DILARANG KERAS mengaku proses "sedang berjalan di background" / "sudah selesai diubah" / "hasilnya sudah ada" — kamu tidak menjalankan apa pun; kenyataan hanya dari KONTEKS (animasi_sedang_jalan / kartu_gas_menunggu / hasil_animasi_terakhir / adegan_hidup). Mengarang status = membohongi pembuat.`;

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
  "geser_keterangan", "selaraskan_ulang", // 🎬 v11.6: perkakas selaras karaoke
  "add_spectrum", "add_cta", // 🌈▶️ v13.4.1: buka pintu satpam utk spektrum & tombol CTA YouTube
  "set_letterbox", // 🎬 v13.5: letterbox bioskop
  "animasikan_adegan", "matikan_animasi", // 🎬 v11.8: ANIMASI STUDIO (kredit video AI / matikan gratis)
]);
const MOTIONS = new Set(["none", "denyut", "goyang", "zoompelan", "melayang", "berkedip", "ayun", "zoom_in", "zoom_out", "selangseling", "geser_kiri", "geser_kanan", "naik", "turun", "sinematik"]); // 🎬 v11.4 + v13.4.2: mode GERAK WAH v13.3 masuk daftar putih
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
    if (name === "set_letterbox") { out.on = o.on !== false; } // 🎬 v13.5
    if (name === "edit_caption") { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } out.slide = Math.round(Number(o.slide)); out.text = s(o.text, 120); }
    if (name === "move_slide") { const f = Math.round(Number(o.from)), t = Math.round(Number(o.to)); if (!slideOk(f) || !slideOk(t)) { dropped.push("move_slide di luar jangkauan"); continue; } out.from = f; out.to = t; }
    if (name === "delete_slide") { if (!slideOk(o.slide)) { dropped.push(`adegan ${o.slide} tidak ada`); continue; } if (nSlides <= 1) { dropped.push("menolak hapus adegan terakhir"); continue; } out.slide = Math.round(Number(o.slide)); }
    if (name === "set_motion") {
      const mv = String(o.mode || "");
      if (!MOTIONS.has(mv)) { dropped.push(`mode gerak aneh: ${o.mode}`); continue; }
      out.mode = mv;
      // 🛡 v11.4: slide kosong/null/0 ATAU mode selangseling = SEMUA adegan — BUKAN kesalahan,
      // tidak di-drop, tidak menakuti pembuat dengan peringatan "adegan 0 tidak ada".
      const rawSc = o.slide;
      const semuaAdegan = rawSc === undefined || rawSc === null || rawSc === "" || Number(rawSc) === 0 || mv === "selangseling" || mv === "sinematik"; // 🎬 v13.4.2: sinematik jua selalu SEMUA adegan
      if (!semuaAdegan) {
        if (!slideOk(rawSc)) { dropped.push(`adegan ${rawSc} tidak ada`); continue; }
        out.slide = Math.round(Number(rawSc));
      }
    }
    if (name === "geser_keterangan") { const d = num(o.detik, -10, 10); if (d === null) { dropped.push("geser tanpa detik"); continue; } out.detik = d; }
    if (name === "animasikan_adegan" || name === "matikan_animasi") { // 🎬 v11.8: slide kosong/"semua"/0 = SEMUA adegan (BUKAN kesalahan); bila angka wajib sah
      const rs = o.slide;
      const semua = rs === undefined || rs === null || rs === "" || String(rs) === "semua" || Number(rs) === 0;
      if (semua) out.slide = "semua";
      else { if (!slideOk(rs)) { dropped.push(`adegan ${rs} tidak ada`); continue; } out.slide = Math.round(Number(rs)); }
      if (name === "animasikan_adegan") { const ins = s(o.instruction, 160); if (ins) out.instruction = ins; }
    }
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
    // 🏦 v12.3: kalau pembuat punya bansos chat (base+key sendiri), ia DIDAHULUKAN — pilihan sadarnya.
    const models = FAST_CHAT_MODELS.slice(0, 5);
    const timeouts = [20, 25, 30, 40, 45];
    const bansos = bansosChatConfig(req.headers);
    const plan: { url: string; key: string; model: string; tag: string; to: number }[] = [
      ...(bansos ? [{ url: `${bansos.base}/chat/completions`, key: bansos.key, model: bansos.model || "auto", tag: `bansos:${bansos.model || "auto"}`, to: 45 }] : []),
      ...models.map((m, i) => ({ url: `${BASE_URL}/chat/completions`, key, model: m, tag: m, to: timeouts[Math.min(i, timeouts.length - 1)] })),
    ];
    const errs: string[] = [];
    for (let i = 0; i < plan.length; i++) {
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), plan[i].to * 1000);
        let data: any;
        try {
          const r = await fetch(plan[i].url, {
            method: "POST",
            headers: { Authorization: `Bearer ${plan[i].key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: plan[i].model, messages, temperature: 0.35, max_tokens: 1600, stream: false }),
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
        return NextResponse.json({ reply, ops, dropped, model_used: plan[i].tag });
      } catch (e) {
        errs.push(`${plan[i].tag}: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
      }
    }
    return NextResponse.json({ error: `Sutradara lagi pusing — semua model gagal. Coba sebentar lagi. (${errs[0] || ""})` }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server Sutradara error" }, { status: 500 });
  }
}
