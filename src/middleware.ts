import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 🚪 v14.4 PAMIT — pagar BLOKIR-DIRI atas permintaan tertulis pemilik (pesannya: "lanjutkan dan buat sekarang").
// Perangkat dengan cookie VERVE_PAMIT=1 → SEMUA halaman digantikan pintu keluar. Tanpa cookie itu:
// aplikasi jalan 100% normal — orang lain & file lama tidak tersentuh sama sekali.
const PINTU = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pamit — VERVE</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e13;color:#e8edf5;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px"><div><div style="font-size:44px">🚪</div><h2 style="margin:12px 0 8px">Perangkat ini sudah pamit dari VERVE</h2><p style="color:#8b93a3;font-size:13.5px;line-height:1.6;max-width:320px;margin:0 auto">Blokir ini kamu pasang sendiri atas permintaanmu.<br>Karyamu tidak dihapus — tetap utuh. Kalau suatu hari berubah pikiran: bersihkan data situs ini di pengaturan browser, lalu buka lagi.</p></div></body></html>`;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/pamit")) return NextResponse.next();
  if (req.cookies.get("VERVE_PAMIT")?.value === "1") {
    return new NextResponse(PINTU, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const res = NextResponse.next();
  res.headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return res;
}

// Blokir berlaku untuk halaman & API; aset statis diloloskan agar pintu keluar tampil rapi.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
