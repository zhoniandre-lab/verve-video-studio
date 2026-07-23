import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 🎞️ LEMARI VIDEO (fase 0 — pintu gerbang) — pencarian stock video Pexels.
 * Lisensi Pexels: bebas pakai semua durasi, bebas edit, tanpa atribusi, aman monetisasi.
 *
 * Kenapa lewat server (bukan langsung dari HP)?
 *  (1) Kunci API rahasia — nggak pernah bocor ke browser user.
 *  (2) Kuota Pexels kita jaga sendiri (rate limit per IP).
 *  (3) Respons dinormalin jadi kecil (irit kuota seluler user): cuma id, durasi,
 *      link file paling pas buat HP, thumbnail, dan nama kreator.
 *
 * Butuh env: PEXELS_API_KEY (gratis, daftar di https://www.pexels.com/api/).
 * Tanpa kunci → 503 {ok:false, code:"TANPA_KUNCI"} biar UI bisa tampilkan panduan jujur.
 */

const PEXELS = "https://api.pexels.com/videos/search";

// 🛡️ Penjaga kuota sederhana (per instance serverless): maks 60 cari / 10 menit / IP.
// Bukan keamanan tingkat bank — cuma biar kuota gratis nggak disedot bot lain.
const jejak = new Map<string, number[]>();
function bolehLewat(ip: string) {
  const skrg = Date.now();
  const arr = (jejak.get(ip) || []).filter((t) => skrg - t < 10 * 60 * 1000);
  if (arr.length >= 60) return false;
  arr.push(skrg);
  jejak.set(ip, arr);
  return true;
}

// Pilih file paling pas buat HP: video/mp4, lebar ideal 640–1280 (cukup tajam, tetap enteng seek).
function pilihFile(files: any[]): { src: string; sd: string; w: number; h: number } | null {
  const mp4 = (files || []).filter((f) => /mp4/i.test(f?.file_type || "") && f?.link);
  if (!mp4.length) return null;
  const kecilKeBesar = [...mp4].sort((a, b) => (a?.width || 0) - (b?.width || 0));
  const layak = kecilKeBesar.filter((f) => (f?.width || 99999) >= 640);
  const utama = layak.find((f) => (f?.width || 0) >= 850) || layak[0] || kecilKeBesar[kecilKeBesar.length - 1];
  const ringan = kecilKeBesar.find((f) => (f?.width || 99999) >= 480) || kecilKeBesar[0];
  return { src: utama.link, sd: ringan.link, w: utama?.width || 0, h: utama?.height || 0 };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 80);
    const page = Math.max(1, Math.min(40, parseInt(searchParams.get("page") || "1", 10) || 1));
    const per = Math.max(3, Math.min(15, parseInt(searchParams.get("per") || "8", 10) || 8));
    if (!q)
      return NextResponse.json({ ok: false, error: "q (kata kunci) wajib diisi" }, { status: 400 });

    const kunci = process.env.PEXELS_API_KEY || "";
    if (!kunci)
      return NextResponse.json(
        {
          ok: false,
          code: "TANPA_KUNCI",
          error:
            "Kunci Pexels belum dipasang di server (PEXELS_API_KEY). Gratis kok bro — ikuti panduan 5 menitnya 🔑",
        },
        { status: 503 },
      );

    const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
    if (!bolehLewat(ip))
      return NextResponse.json(
        { ok: false, code: "KECEPETAN", error: "Kebanyakan cari dalam 10 menit — tarik napas dulu bro 😄" },
        { status: 429 },
      );

    const url = `${PEXELS}?query=${encodeURIComponent(q)}&per_page=${per}&page=${page}&orientation=landscape&size=medium`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const r = await fetch(url, { headers: { Authorization: kunci }, signal: ac.signal, cache: "no-store" });
    clearTimeout(t);

    if (!r.ok)
      return NextResponse.json(
        {
          ok: false,
          code: `PEXELS_${r.status}`,
          error: `Pexels jawab ${r.status} — kemungkinan: kunci salah/tiket salah tempel (401), kuota bulanan habis (429), atau gangguan sesaat`,
        },
        { status: 502 },
      );

    const j: any = await r.json();
    const hasil = ((j.videos || []) as any[])
      .map((v) => {
        const f = pilihFile(v.video_files);
        if (!f) return null;
        return { id: v.id, dur: v.duration, src: f.src, sd: f.sd, w: f.w, h: f.h, thumb: v.image, by: v.user?.name || "Pexels", link: v.url };
      })
      .filter(Boolean);

    return NextResponse.json(
      { ok: true, q, page, total: j.total_results ?? hasil.length, hasil },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e: any) {
    const timeout = e?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        code: timeout ? "LAMBAT" : "ERROR",
        error: timeout ? "Pexels lambat merespons (>12 detik) — coba lagi ya bro" : e?.message || "error tak dikenal",
      },
      { status: 504 },
    );
  }
}
