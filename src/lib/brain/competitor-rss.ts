/**
 * 🛰️ VERVE KOMPETITOR RSS v19.6 — "mata-mata" real-time untuk channel lawan.
 * Prinsip OSINT: data publik termurah & paling stabil = RSS.
 * Setiap channel YouTube punya RSS gratis: youtube.com/feeds/videos.xml?channel_id=...
 * → pantau upload kompetitor TANPA menyentuh kuota YouTube API (yang cuma 10rb/hari).
 *
 * Modul ini PURE & offline (parser + logika). Route /api/competitor-rss yang fetch.
 * Saat kompetitor upload video baru:
 *   - otak langsung tahu judul & kapan
 *   - dibandingkan dengan judul-judulmu (jaccard) → peringatan kalau mirip
 */

import { cap, ent, jaccardSim, ng, norm, tok } from "./yie-score";
import { wordCount } from "./pattern-insight";
import { predictCtrBayes } from "./deep-dive";
import type { BrainMemory } from "./yie-score";

// Stopword lokal untuk analisis frasa — ANGKA 1 digit (5, 3, 7...) TETAP dihitung,
// karena "5 Kisah" adalah pola judul yang penting (tok() bawaan membuangnya).
const STOP2 = new Set("yang dan di ke dari ini itu untuk dengan pada akan ada adalah the of and in to a is or for an".split(" "));
function kata2(t: string): string[] {
  return norm(t).split(/\s+/).filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOP2.has(w));
}

// v19.7: kunci localStorage untuk koleksi judul & jejak video yang sudah dilihat
export const KOMP_TITLES_KEY = "verve_kompetitor_titles_v1";
export const KOMP_SEEN_KEY = "verve_kompetitor_seen_v1";

export type KompItem = {
  title: string;
  videoId: string;
  url: string;
  published: string; // ISO
  publishedAt: number;
  views?: number; // v19.9: dari scrape halaman (viewCountText)
  velocity?: number; // v19.9: perkiraan view/hari (ilmu "kecepatan lawan")
};

/** Parse angka view "1.7K" / "818" / "39K" → angka baku. */
export function parseViewCount(text: string): number | undefined {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const m = t.match(/([\d.,]+)\s*([kmb]?)\s*views?/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, "."));
  if (!Number.isFinite(n)) return undefined;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Math.round(n * mult);
}

/** Kecepatan tayang kompetitor: views / umur (hari). Semua dari data publik. */
export function kompetitorVelocity(views: number | undefined, publishedAt: number): number | null {
  if (views == null || views <= 0) return null;
  const umurHari = Math.max(0.5, (Date.now() - publishedAt) / 864e5);
  return Math.round((views / umurHari) * 10) / 10;
}

export type KompFeed = {
  channelId: string;
  channelName?: string;
  items: KompItem[];
  error?: string;
  source?: "rss" | "scrape";
  note?: string;
};

export type KompChannel = { id: string; name: string; addedAt: number };

/** Parse RSS YouTube (Atom) → daftar video terbaru. Deterministic, tanpa dependency. */
export function parseYtRss(xml: string, limit = 15): KompItem[] {
  const blocks = String(xml || "").match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const out: KompItem[] = [];
  for (const b of blocks) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const videoId = (b.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/) || [])[1];
    const published = (b.match(/<published>([\s\S]*?)<\/published>/) || [])[1];
    if (!title || !videoId) continue;
    const ts = published ? +new Date(published) : Date.now();
    out.push({
      title: decodeXml(title).trim(),
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published: published || "",
      publishedAt: Number.isFinite(ts) ? ts : Date.now(),
    });
  }
  return out.slice(0, limit);
}

function decodeXml(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Ambil channel ID murni dari input (URL atau ID langsung). Null kalau butuh resolve server. */
export function extractChannelId(input: string): string | null {
  const s = String(input || "").trim();
  if (/^UC[\w-]{22}$/.test(s)) return s;
  let m = s.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]channel_id=(UC[\w-]+)/);
  if (m) return m[1];
  return null;
}

/** Apakah input ini URL YouTube yang butuh resolve (mis. @handle, /c/...)? */
export function butuhResolve(input: string): boolean {
  const s = String(input || "").trim();
  return !extractChannelId(s) && /youtube\.com|youtu\.be/i.test(s);
}

/** Judul kompetitor mirip nggak dengan judul-judul yang pernah kamu pakai? */
export function simJudul(title: string, brain: BrainMemory): { max: number; match: string | null } {
  let max = 0;
  let match: string | null = null;
  for (const r of brain.results || []) {
    const s = jaccardSim(String(title || ""), r.title || "");
    if (s > max) { max = s; match = r.title || null; }
  }
  return { max: Math.round(max * 100), match };
}

/** Format "x jam / x hari lalu" untuk UI. */
export function waktuLalu(ts: number): string {
  const d = Math.max(0, Date.now() - ts);
  const mnt = Math.floor(d / 60000);
  if (mnt < 60) return `${mnt} mnt lalu`;
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

/* ================= FALLBACK SCRAPE HALAMAN /videos (saat RSS 404) ================= */

/** Ubah teks relatif YouTube ("1 day ago", "2 weeks ago"…) → timestamp perkiraan. */
export function relTimeToTs(text: string): number {
  const t = String(text || "").toLowerCase();
  const num = Number((t.match(/(\d+)/) || [])[1] || 1);
  const now = Date.now();
  if (t.includes("minute")) return now - num * 60e3;
  if (t.includes("hour")) return now - num * 36e5;
  if (t.includes("day")) return now - num * 864e5;
  if (t.includes("week")) return now - num * 7 * 864e5;
  if (t.includes("month")) return now - num * 30 * 864e5;
  if (t.includes("year")) return now - num * 365 * 864e5;
  return now;
}

/**
 * Ekstrak daftar video dari HTML halaman `youtube.com/channel/ID/videos`.
 * YouTube tidak selalu menyediakan RSS (404 untuk sebagian channel) — halaman
 * ini adalah cadangan andal. Murni regex per-blok compactVideoRenderer.
 */
export function parseYtVideosPage(html: string, limit = 10): KompItem[] {
  let s = String(html || "")
    .replace(/\\x22/g, '"')
    .replace(/\\x2f/g, "/")
    .replace(/\\x5b/g, "[")
    .replace(/\\x5d/g, "]")
    .replace(/\\x7b/g, "{")
    .replace(/\\x7d/g, "}")
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "");
  const chunks = s.split('"compactVideoRenderer":{').slice(1);
  const out: KompItem[] = [];
  for (const c of chunks) {
    const vid = c.match(/"videoId":"([\w-]{11})"/);
    const title = c.match(/"title":\{"runs":\[\{"text":"([^"]{2,150})"/);
    const time = c.match(/"publishedTimeText":\{"runs":\[\{"text":"([^"]+)"/);
    const viewsRaw = c.match(/"viewCountText":\{"runs":\[\{"text":"([^"]+)"/);
    if (!vid || !title) continue;
    const ts = time ? relTimeToTs(time[1]) : Date.now();
    const views = viewsRaw ? parseViewCount(viewsRaw[1]) : undefined;
    out.push({
      title: decodeXml(title[1]).replace(/\\\//g, "/").trim(),
      videoId: vid[1],
      url: `https://www.youtube.com/watch?v=${vid[1]}`,
      published: new Date(ts).toISOString(),
      publishedAt: ts,
      views, // v19.9: ilmu "kecepatan lawan"
      velocity: kompetitorVelocity(views, ts) ?? undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Nama channel dari halaman apa pun (og:title / microformat). */
export function channelNameFromPage(html: string): string {
  const m = html.match(/<meta property="og:title" content="([^"]+)"/);
  return (m?.[1] || "").replace(/\s*-\s*YouTube$/, "").trim();
}

/** Ringkasan teks hasil scan — siap salin/share. */
export function ringkasanScan(feeds: KompFeed[], brain: BrainMemory): string {
  const L: string[] = [];
  let total = 0;
  feeds.forEach((f) => {
    if (!f.items.length) return;
    total += f.items.length;
    L.push(`📺 ${f.channelName || f.channelId}: ${f.items[0].title} (${waktuLalu(f.items[0].publishedAt)})`);
  });
  if (!total) return "Belum ada upload baru dari kompetitor.";
  const warn = feeds
    .flatMap((f) => f.items)
    .map((it) => ({ it, sim: simJudul(it.title, brain) }))
    .filter((x) => x.sim.max >= 60);
  if (warn.length) L.push(`⚠️ ${warn.length} video kompetitor mirip judulmu (≥60%): "${warn[0].it.title}" vs "${warn[0].sim.match}"`);
  return L.join("\n");
}

/* ================= v19.7: KOLEKSI JUDUL + DETEKSI UPLOAD BARU ================= */

export type KompTitleRow = { title: string; publishedAt: number; channelId: string; channelName?: string };

/** Kumpulkan semua judul kompetitor dari scan → dedupe by judul, terbaru di depan, maks 200. */
export function kumpulkanJudul(feeds: KompFeed[], prev: KompTitleRow[] = []): KompTitleRow[] {
  const map = new Map<string, KompTitleRow>();
  (prev || []).forEach((r) => map.set(r.title.toLowerCase().trim(), r));
  (feeds || []).forEach((f) => {
    const name = f.channelName || f.channelId;
    (f.items || []).forEach((it) => {
      const k = it.title.toLowerCase().trim();
      if (!k) return;
      const old = map.get(k);
      if (!old || it.publishedAt > old.publishedAt)
        map.set(k, { title: it.title, publishedAt: it.publishedAt, channelId: f.channelId, channelName: name });
    });
  });
  return [...map.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 200);
}

/** Upload yang BELUM pernah dilihat (beda dari jejak `seen`) — bahan alert. */
export function deteksiUploadBaru(feeds: KompFeed[], seen: Record<string, string[]>): KompItem[] {
  const baru: KompItem[] = [];
  (feeds || []).forEach((f) => {
    const s = new Set(seen?.[f.channelId] || []);
    (f.items || []).forEach((it) => { if (!s.has(it.videoId)) baru.push(it); });
  });
  return baru.sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Tandai semua videoID yang terlihat sekarang sebagai sudah dilihat. */
export function tandaiTerlihat(feeds: KompFeed[], prev: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = { ...(prev || {}) };
  (feeds || []).forEach((f) => {
    const s = new Set(next[f.channelId] || []);
    (f.items || []).forEach((it) => { if (it.videoId) s.add(it.videoId); });
    next[f.channelId] = [...s].slice(-50);
  });
  return next;
}

/* ================= v19.7: ANALISIS POLA JUDUL KOMPETITOR ================= */

const POLA_RE: { key: string; label: string; re?: RegExp; w?: (wc: number) => boolean }[] = [
  { key: "angka", label: "pakai angka", re: /\d/ },
  { key: "tanya", label: "kata tanya", re: /\b(apa|kenapa|mengapa|bagaimana|cara|berapa|kapan|kok)\b/i },
  { key: "emosi", label: "kata emosi", re: /\b(rindu|ibu|ayah|sedih|nangis|menangis|maaf|doa|haru|cinta|takut|hantu|kehilangan)\b/i },
  { key: "penasaran", label: "pola penasaran", re: /\b(ternyata|jangan|rahasia|akhirnya|baru|ini dia|wajib)\b/i },
  { key: "pendek", label: "pendek ≤5 kata", w: (w) => w <= 5 },
  { key: "panjang", label: "panjang 9+ kata", w: (w) => w >= 9 },
];

export type PolaKompetitor = {
  total: number;
  topTokens: string[];
  topPhrases: string[];
  pola: { key: string; label: string; count: number; pct: number }[];
  naik: { phrase: string; count: number }[];
};

/** Deteksi pola yang sedang naik dari judul-judul kompetitor (20 terbaru). */
export function analisisPolaKompetitor(rows: KompTitleRow[]): PolaKompetitor {
  const all = rows || [];
  const recent = all.slice(0, 20);
  const tokCnt: Record<string, number> = {};
  const phCnt: Record<string, number> = {};
  recent.forEach((r) => {
    const tk = tok(r.title);
    tk.forEach((w) => { tokCnt[w] = (tokCnt[w] || 0) + 1; });
    ng(kata2(r.title), 2).concat(ng(kata2(r.title), 3)).forEach((p) => { phCnt[p] = (phCnt[p] || 0) + 1; });
  });
  const topTokens = ent(tokCnt).filter(([, c]) => c >= 2).slice(0, 6).map(([w]) => cap(w));
  const topPhrases = ent(phCnt).filter(([, c]) => c >= 2).slice(0, 6).map(([p]) => cap(p));

  const pola = POLA_RE
    .map((r) => {
      let count = 0;
      recent.forEach((x) => {
        const wc = wordCount(x.title);
        if (r.re ? r.re.test(x.title) : r.w!(wc)) count++;
      });
      return { key: r.key, label: r.label, count, pct: Math.round((count / Math.max(1, recent.length)) * 100) };
    })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);

  const last10 = recent.slice(0, 10);
  const naikMap: Record<string, number> = {};
  last10.forEach((r) => {
    const tk = kata2(r.title);
    if (tk.length < 3) return;
    ng(tk, 2).forEach((p) => { naikMap[p] = (naikMap[p] || 0) + 1; });
  });
  const naik = ent(naikMap).filter(([, c]) => c >= 2).slice(0, 5).map(([p, c]) => ({ phrase: cap(p), count: c }));

  return { total: all.length, topTokens, topPhrases, pola, naik };
}

/* ================= v19.7: BANDINGKAN JUDULMU VS JUDUL LAWAN ================= */

export type HasilBanding = {
  a: { title: string; skor: number; kata: number; angka: boolean; emosi: boolean; pendek: boolean; predCtr: number };
  b: { title: string; skor: number; kata: number; angka: boolean; emosi: boolean; pendek: boolean; predCtr: number };
  sim: number;
  pemenang: "a" | "b" | "seri";
  alasan: string;
};

/** Bandingkan judulmu (a) vs judul lawan (b) pakai mesin otak: prediksi CTR + fitur judul. */
export function bandingkanJudul(a: string, b: string, brain: BrainMemory): HasilBanding {
  const predA = predictCtrBayes(a, brain);
  const predB = predictCtrBayes(b, brain);
  const sim = Math.round(jaccardSim(a, b) * 100);
  const info = (t: string) => {
    const wc = wordCount(t);
    return {
      kata: wc,
      angka: /\d/.test(t),
      emosi: /(rindu|ibu|ayah|sedih|nangis|menangis|maaf|doa|haru|cinta|takut|kehilangan)/i.test(t),
      pendek: wc <= 5,
    };
  };
  const ia = info(a), ib = info(b);
  const skorA = Math.round(predA.est + (ia.angka ? 6 : 0) + (ia.emosi ? 5 : 0) + (ia.pendek ? 4 : 0));
  const skorB = Math.round(predB.est + (ib.angka ? 6 : 0) + (ib.emosi ? 5 : 0) + (ib.pendek ? 4 : 0));
  const selisih = Math.abs(skorA - skorB);
  // 🐛 FIX v19.8.3: dulu selisih ≤2 selalu "seri" walau salah satu unggul → membingungkan.
  // Sekarang pemenang jujur: unggul tipis (±1-2) vs unggul jelas (>2).
  const pemenang: HasilBanding["pemenang"] = skorA > skorB ? "a" : skorB > skorA ? "b" : "seri";
  const alasan =
    pemenang === "a"
      ? selisih <= 2
        ? `Judulmu unggul tipis (+${selisih}) — gas, tapi tetap bedakan angle.`
        : `Judulmu lebih kuat (+${selisih} poin) — gas!`
      : pemenang === "b"
        ? selisih <= 2
          ? `Lawan unggul tipis (+${selisih}) — masih bisa disalip: coba ⚔️ Serang Balik.`
          : `Judul lawan lebih kuat (+${selisih} poin) — ⚔️ Serang Balik atau ambil angle beda.`
        : "Imbang (skor sama) — bedakan angle biar beda kelas dari lawan.";
  return {
    a: { title: a, skor: skorA, ...ia, predCtr: predA.est },
    b: { title: b, skor: skorB, ...ib, predCtr: predB.est },
    sim,
    pemenang,
    alasan,
  };
}

/* ================= v19.8.3: SERANG BALIK (⚔️) — rekomendasi judul pengganti ================= */

export type HasilSerang = {
  saran: HasilBanding; // a = judul rekomendasi, b = judul lawan
  menang: boolean;
  selisih: number;
};

const KATA_VIRAL = new Set(["viral", "tiktok", "terbaru", "2026", "2025", "paling", "cover", "remix", "slowed", "full", "sound", "trend", "lagu"]);

/** Ambil frasa "viral" dari judul lawan (mis. "Viral TikTok Terbaru 2026") — pola yang lagi laku. */
export function ambilFrasaViral(title: string): string {
  const found = tok(String(title || "")).filter((w) => KATA_VIRAL.has(w.toLowerCase()));
  if (found.length >= 2) return cap(found.slice(0, 4).join(" "));
  return "";
}

/**
 * 🎯 v19.8.4: Ambil ANGKA yang paling sering dipakai di judul kompetitor
 * (bukan tebakan template!). Tahun (2026) & angka besar dibuang.
 * Contoh: judul lawan "5 Kisah...", "3 Doa...", "7 Hal..." → ["5","3","7"].
 */
export function angkaPopulerDariJudul(rows: KompTitleRow[]): string[] {
  const cnt: Record<string, number> = {};
  (rows || []).forEach((r) => {
    const m = String(r.title || "").match(/\d+/g) || [];
    m.forEach((n) => {
      const v = Number(n);
      if (v >= 1 && v <= 99) cnt[n] = (cnt[n] || 0) + 1;
    });
  });
  return Object.entries(cnt)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, 3)
    .map(([n]) => n);
}

/**
 * 🧠 v19.8.5: Ambil INTI judul dari judul user (buang label niche "| Cerita Jadi
 * Lagu" & kata sambung di awal) → buat judul saran yang NATURAL sesuai niche,
 * bukan menyalin judul panjang mentah.
 * Contoh: "Ibu Engkau Yang Terbaik | Kisah & Lagu | Dengarkan Sampai Habis"
 *   → penuh: "Ibu Engkau Yang Terbaik" · inti1: "Ibu"
 */
export function intiJudulUntukSerang(title: string): { penuh: string; inti1: string } {
  const seg = String(title || "").split("|")[0].trim() || String(title || "").trim();
  const STOP_AWAL = new Set(["yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "pada", "akan", "adalah", "sebuah", "saat", "kisah"]);
  const words = seg.split(/\s+/).filter(Boolean);
  const tanpa = words.filter((w) => !STOP_AWAL.has(w.toLowerCase()));
  const inti1 = cap((tanpa.length ? tanpa : words)[0] || "Kisah");
  return { penuh: cap(seg), inti1 };
}

/**
 * ⚔️ Buat 3-4 judul rekomendasi yang MENYERANG judul lawan — TETAP NATURAL
 * sesuai NICHE pilihan (story_song = puitis; horor = JANGAN; tutorial = Cara;
 * dj = FULL BASS; custom = generik). Bukan lagi template lagu untuk semua.
 * Semua di-score mesin otak vs judul lawan; yang paling kuat di depan.
 */
export function serangBalikJudul(lawanTitle: string, keyword: string, brain: BrainMemory, n = 3, angkaPopuler?: string[], batch = 0, nicheId = "story_song"): HasilSerang[] {
  const { penuh, inti1 } = intiJudulUntukSerang(keyword);
  const frasaViral = ambilFrasaViral(lawanTitle) || "Viral TikTok Terbaru 2026";
  const angka = (angkaPopuler && angkaPopuler.length ? angkaPopuler : ["3", "5", "7"]);
  // 🎯 v19.22: template serang per NICHE (bukan "Rindu/Doa/Cerita Jadi Lagu" untuk semua)
  const EMO = ["Rindu", "Maaf", "Doa Terakhir untuk", "Air Mata"]; // dipakai niche lagu
  const PENS = ["Ternyata", "Jangan Nonton", "Akhirnya", "Ini Dia"];
  const songNiche = nicheId === "story_song" || nicheId === "dj" || nicheId === "family" || nicheId === "muslim";
  const tpls: string[] = songNiche
    ? (batch === 0
      ? [
          `${penuh} - ${frasaViral}`,
          `${penuh} - ${frasaViral} | Kisah & Lagu`,
          `Rindu ${inti1} - ${frasaViral}`,
          `${angka[0]} Kisah ${inti1} - ${frasaViral}`,
        ]
      : [
          `${EMO[(batch - 1) % EMO.length]} ${inti1} - ${frasaViral}`,
          `${PENS[(batch - 1) % PENS.length]} ${inti1} - ${frasaViral}`,
          `${EMO[(batch + 1) % EMO.length]} ${inti1} - ${frasaViral} | Kisah & Lagu`,
          `${angka[0]} Kisah ${inti1} yang Menyentuh - ${frasaViral}`,
        ])
    : (batch === 0
      ? [
          `${penuh} - ${frasaViral}`,
          `${penuh} - ${frasaViral} | Wajib Tonton`,
          `${PENS[1]} ${inti1} - ${frasaViral}`, // Jangan Nonton...
          `${angka[0]} Hal tentang ${inti1} - ${frasaViral}`,
        ]
      : [
          `${PENS[(batch - 1) % PENS.length]} ${inti1} - ${frasaViral}`,
          `Cara ${inti1} - ${frasaViral}`,
          `${angka[0]} Tips ${inti1} - ${frasaViral}`,
          `${inti1} ${frasaViral} | Jangan Lewatkan`,
        ]);
  const seen = new Set<string>();
  const out: HasilSerang[] = [];
  for (const t of tpls) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const h = bandingkanJudul(t, lawanTitle, brain);
    out.push({ saran: h, menang: h.pemenang === "a", selisih: Math.abs(h.a.skor - h.b.skor) });
  }
  return out.sort((x, y) => y.saran.a.skor - x.saran.a.skor).slice(0, n);
}
