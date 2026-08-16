import { NextResponse } from "next/server";
import { chat } from "@/lib/hcnsec";

export const dynamic = "force-dynamic";

// 🩹 v16.5 AI-POWERED QUERY TRANSLATOR (Kecerdasan Otak Sempurna):
// Kita panggil Chat AI (Llama/GPT) di backend secara serverless untuk menerjemahkan query lo
// dari bahasa Indonesia (atau bahasa lain) menjadi kata kunci pencarian visual Inggris (Pexels/Pixabay) yang super presisi!
async function translateQueryWithAI(q: string): Promise<string> {
  // 🐛 v20.18: dulu pakai chat() dengan timeout 120 dtk → kalau AI chat lambat/offline,
  // pencarian stok ngantuk lama / gagal. Sekarang fetch LANGSUNG, timeout 6 dtk,
  // gagal → langsung pakai kata asli (tidak ngeblok pencarian).
  try {
    const base = (process.env.HCNSEC_BASE_URL || "https://api.hcnsec.cn/v1").replace(/\/+$/, "");
    const key = process.env.HCNSEC_API_KEY || "";
    if (!key) return q;
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "auto",
        messages: [{ role: "user", content: `Translate this video search keyword into a highly descriptive English stock video query (1 to 4 words max, lowercase, no numbers, no punctuation): "${q}"` }],
        max_tokens: 30,
      }),
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    if (!r || !r.ok) return q;
    const j: any = await r.json().catch(() => null);
    const txt: string = j?.choices?.[0]?.message?.content || "";
    const clean = txt.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
    if (clean && clean.length > 1) return clean;
  } catch { /* fallback */ }
  return q; // Fallback jika AI gagal
}

/**
 * 🎞️🧺 LEMARI VIDEO — pencarian stock video dari TIGA gudang gratis/aman:
 *   1) Pexels  (PEXELS_API_KEY)  — CDN-nya CORS *, file dipakai LANGSUNG.
 *   2) Pixabay (PIXABAY_API_KEY) — CDN-nya TANPA header CORS (terbukti dicek 2026-07-24),
 *      jadi SEMUA URL-nya (video + thumbnail) dilewatkan GERBANG /api/hcnsec/proxy-audio
 *      supaya 100% aman canvas/fetch. Pixabay minta kredit sumber ditampilkan → kolom `by` diberi "· Pixabay".
 *   3) Coverr  (COVERR_API_KEY)  — gudang tambahan ala MoneyPrinterTurbo; URL mp4 signed dilewatkan GERBANG
 *      supaya aman canvas/fetch di HP. Kosong? VERVE tetap jalan Pexels/Pixabay.
 * Semuanya diperlakukan sebagai stock video bebas pakai sesuai lisensi masing-masing provider.
 *
 * Hasil gudang DIANYAM selang-seling (Pexels, Pixabay, Coverr, …) supaya bahan film
 * makin kaya & tidak "itu-itu aja". id Pixabay/Coverr digeser biar tak tabrakan
 * dengan id Pexels (penting untuk ANTI-KEMBAR lintas gudang).
 *
 * Salah satu kunci boleh kosong → gudang yang tersedia tetap bekerja (jujur lewat `sumber`).
 * Semua kunci kosong → 503 TANPA_KUNCI.
 */

const PEXELS = "https://api.pexels.com/videos/search";
const PIXABAY = "https://pixabay.com/api/videos/";
const COVERR = "https://api.coverr.co/videos";
const ID_GESER_PIXABAY = 900_000_000;
const ID_GESER_COVERR = 1_800_000_000;

// 🛡️ Penjaga kuota sederhana (per instance serverless): maks 300 cari / 10 menit / IP. 🐛 v20.18: dinaikkan (60 terlalu kencang saat coba-coba).
const jejak = new Map<string, number[]>();
function bolehLewat(ip: string) {
  const skrg = Date.now();
  const arr = (jejak.get(ip) || []).filter((t) => skrg - t < 10 * 60 * 1000);
  if (arr.length >= 300) return false;
  arr.push(skrg);
  jejak.set(ip, arr);
  return true;
}

// Pexels: pilih file paling pas buat HP — bidik HD ±1280 untuk hasil unduh (tajam),
// versi ±480-720 untuk preview (enteng). (tidak berubah sejak v13.12)
function pilihFile(files: any[]): { src: string; sd: string; w: number; h: number } | null {
  const mp4 = (files || []).filter((f) => /mp4/i.test(f?.file_type || "") && f?.link);
  if (!mp4.length) return null;
  const kecilKeBesar = [...mp4].sort((a, b) => (a?.width || 0) - (b?.width || 0));
  const layak = kecilKeBesar.filter((f) => (f?.width || 99999) >= 640);
  const utama = kecilKeBesar.find((f) => (f?.width || 99999) >= 1100) || layak[0] || kecilKeBesar[kecilKeBesar.length - 1];
  const ringan = kecilKeBesar.find((f) => (f?.width || 99999) >= 480) || kecilKeBesar[0];
  return { src: utama.link, sd: ringan.link, w: utama?.width || 0, h: utama?.height || 0 };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQ = (searchParams.get("q") || "").trim().slice(0, 80);
    const page = Math.max(1, Math.min(40, parseInt(searchParams.get("page") || "1", 10) || 1));
    const per = Math.max(3, Math.min(15, parseInt(searchParams.get("per") || "8", 10) || 8));

    // 🐛 v20.18: kunci dari header client (disimpan di HP user) ATAU env Vercel —
    // dulu cuma env → kalau user "sudah masukin" di aplikasi tetap gagal.
    const kunciP = process.env.PEXELS_API_KEY || req.headers.get("x-stok-pexels") || "";
    const kunciX = process.env.PIXABAY_API_KEY || req.headers.get("x-stok-pixabay") || "";
    const kunciC = process.env.COVERR_API_KEY || req.headers.get("x-stok-coverr") || "";
    if (searchParams.get("status") === "1" || searchParams.get("status") === "true") {
      const providers = { pexels: !!kunciP, pixabay: !!kunciX, coverr: !!kunciC };
      const active = Object.values(providers).filter(Boolean).length;
      return NextResponse.json({
        ok: true,
        providers,
        active,
        total: 3,
        note: active ? `${active}/3 gudang video aktif` : "Belum ada kunci gudang video aktif di server",
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!rawQ)
      return NextResponse.json({ ok: false, error: "q (kata kunci) wajib diisi" }, { status: 400 });

    const q = await translateQueryWithAI(rawQ);

    const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
    if (!bolehLewat(ip))
      return NextResponse.json(
        { ok: false, code: "KECEPETAN", error: "Kebanyakan cari dalam 10 menit — tarik napas dulu bro 😄" },
        { status: 429 },
      );

    const gerbang = (u: string) => `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`;

    // --- Gudang 1: PEXELS (langsung — CDN-nya CORS *) ---
    const janjiPexels: Promise<{ hasil: any[]; total: number } | null> = !kunciP
      ? Promise.resolve(null)
      : (async () => {
          const url = `${PEXELS}?query=${encodeURIComponent(q)}&per_page=${per}&page=${page}&orientation=landscape&size=medium`;
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 12_000);
          const r = await fetch(url, { headers: { Authorization: kunciP }, signal: ac.signal, cache: "no-store" });
          clearTimeout(t);
          if (!r.ok) throw new Error(`PEXELS_${r.status}`);
          const j: any = await r.json();
          const hasil = ((j.videos || []) as any[])
            .map((v) => {
              const f = pilihFile(v.video_files);
              if (!f) return null;
              return { id: v.id, dur: v.duration, src: f.src, sd: f.sd, w: f.w, h: f.h, thumb: v.image, by: v.user?.name || "Pexels", link: v.url, provider: "pexels" };
            })
            .filter(Boolean);
          return { hasil, total: j.total_results ?? hasil.length };
        })().catch(() => null); // satu gudang jatuh tak boleh menyeret gudang lain

    // --- Gudang 2: PIXABAY (semua media lewat GERBANG — CDN-nya tanpa CORS) ---
    const janjiPixabay: Promise<{ hasil: any[]; total: number } | null> = !kunciX
      ? Promise.resolve(null)
      : (async () => {
          const url = `${PIXABAY}?key=${encodeURIComponent(kunciX)}&q=${encodeURIComponent(q)}&per_page=${per}&page=${page}&safesearch=true&video_type=film`;
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 12_000);
          const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
          clearTimeout(t);
          if (!r.ok) throw new Error(`PIXABAY_${r.status}`);
          const j: any = await r.json();
          const hasil = ((j.hits || []) as any[])
            .map((h) => {
              const med = h?.videos?.medium || {}; // ~1920×1080 (lama 1280×720) — pas target HD kita
              const sml = h?.videos?.small || {};  // ~1280×720
              const tny = h?.videos?.tiny || {};   // ~960×540 — cadangan teringan
              const src = med.url || sml.url || tny.url;
              if (!src) return null;
              const sd = sml.url || tny.url || src;
              const thumb = med.thumbnail || sml.thumbnail || tny.thumbnail || "";
              return {
                id: ID_GESER_PIXABAY + (h.id || 0),
                dur: h.duration || 0,
                src: gerbang(src),
                sd: gerbang(sd),
                w: med.width || sml.width || 0,
                h: med.height || sml.height || 0,
                thumb: thumb ? gerbang(thumb) : "",
                by: `${h.user || "Pixabay"} · Pixabay`,
                link: h.pageURL || "",
                provider: "pixabay",
              };
            })
            .filter(Boolean);
          return { hasil, total: j.total ?? hasil.length };
        })().catch(() => null);

    // --- Gudang 3: COVERR (opsional — gudang tambahan ala MoneyPrinterTurbo, lewat GERBANG) ---
    const janjiCoverr: Promise<{ hasil: any[]; total: number } | null> = !kunciC
      ? Promise.resolve(null)
      : (async () => {
          const url = `${COVERR}?query=${encodeURIComponent(q)}&page_size=${per}&page=${page}&urls=true&sort=popular`;
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 12_000);
          const r = await fetch(url, { headers: { Authorization: `Bearer ${kunciC}` }, signal: ac.signal, cache: "no-store" });
          clearTimeout(t);
          if (!r.ok) throw new Error(`COVERR_${r.status}`);
          const j: any = await r.json();
          const hasil = ((j.hits || []) as any[])
            .map((v) => {
              const urls = v?.urls || {};
              const src = urls.mp4_download || urls.mp4 || urls.download || "";
              if (!src) return null;
              const dur = Math.round(Number.parseFloat(String(v.duration || 0)) || 0);
              const thumb = v.thumbnail || v.poster || v.image || v.cover || "";
              const creator = v?.creator?.name || v?.author?.name || v?.creator || v?.author || "Coverr";
              return {
                id: ID_GESER_COVERR + Math.abs(String(v.id || src).split("").reduce((a, ch) => ((a * 33) + ch.charCodeAt(0)) | 0, 5381)),
                dur,
                src: gerbang(src),
                sd: gerbang(src),
                w: Number(v.max_width || v.width || 0) || 0,
                h: Number(v.max_height || v.height || 0) || 0,
                thumb: thumb ? gerbang(String(thumb)) : "",
                by: `${typeof creator === "string" ? creator : "Coverr"} · Coverr`,
                link: v.canonical_url || v.url || "",
                provider: "coverr",
              };
            })
            .filter(Boolean);
          return { hasil, total: j.total || j.total_hits || hasil.length };
        })().catch(() => null);

    const [px, xb, cv] = await Promise.all([janjiPexels, janjiPixabay, janjiCoverr]);
    if (!px && !xb && !cv)
      return NextResponse.json(
        {
          ok: false,
          code: "GUDANG_SIBUK",
          error: "Semua gudang video gagal dihubungi — kemungkinan kunci salah/tiket salah tempel, kuota habis, atau gangguan sesaat. Coba lagi ya bro.",
        },
        { status: 502 },
      );

    // 🧺 ANYAM selang-seling: Pexels, Pixabay, Coverr, … → bahan film bercampur, variasi maksimal
    const A = px?.hasil || [];
    const B = xb?.hasil || [];
    const C = cv?.hasil || [];
    const gabung: any[] = [];
    for (let i = 0; i < Math.max(A.length, B.length, C.length); i++) {
      if (A[i]) gabung.push(A[i]);
      if (B[i]) gabung.push(B[i]);
      if (C[i]) gabung.push(C[i]);
    }

    return NextResponse.json(
      {
        ok: true,
        q,
        page,
        total: (px?.total || 0) + (xb?.total || 0) + (cv?.total || 0),
        hasil: gabung,
        sumber: { pexels: px ? A.length : -1, pixabay: xb ? B.length : -1, coverr: cv ? C.length : -1 }, // -1 = gudang tak tersedia/gagal (jujur)
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e: any) {
    const timeout = e?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        code: timeout ? "LAMBAT" : "ERROR",
        error: timeout ? "Gudang video lambat merespons (>12 detik) — coba lagi ya bro" : e?.message || "error tak dikenal",
      },
      { status: 504 },
    );
  }
}
