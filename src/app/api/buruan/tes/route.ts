/* =====================================================================
   BOT BURUAN AI — TES KONEKSI (v19.35)
   POST /api/buruan/tes  { base, key } → cek /models server-side (anti CORS)
   ===================================================================== */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { base, key } = await req.json().catch(() => ({}));
    const b = String(base || "").trim().replace(/\/+$/, "");
    const k = String(key || "").trim();
    if (!/^https?:\/\/.+/.test(b)) return NextResponse.json({ ok: false, error: "Base URL aneh" });
    if (!k) return NextResponse.json({ ok: false, error: "API key kosong" });
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await fetch(b + "/models", {
        headers: { Authorization: `Bearer ${k}` },
        signal: ctrl.signal,
      });
      const j = await r.json().catch(() => ({}));
      const models = Array.isArray(j?.data)
        ? j.data.map((m: any) => m.id || m).slice(0, 30)
        : Array.isArray(j?.models) ? j.models.slice(0, 30) : [];
      return NextResponse.json({
        ok: r.ok,
        status: r.status,
        models,
        error: r.ok ? "" : (j?.error?.message || j?.message || `HTTP ${r.status}`),
      });
    } finally {
      clearTimeout(tm);
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Gagal tes" });
  }
}
