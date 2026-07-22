import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🧠🔒 BRANKAS OTAK (v13.1) — salinan memori VERVE Brain ke Supabase,
 * supaya memori tidak hilang saat ganti HP / clear cache.
 * Memori utama tetap di HP (localStorage) — route ini cuma BRANKAS.
 * Kalau env/tabel belum siap → { ok:false } jujur; klien tetap jalan normal.
 * Tabel: public.verve_brain — jalankan supabase_brain.sql di SQL Editor.
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function hdrs(): Record<string, string> {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function GET() {
  if (!SUPA_URL || !SUPA_KEY)
    return NextResponse.json({ ok: false, msg: "Supabase belum diatur" });
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/verve_brain?id=eq.main&select=payload`,
      { headers: hdrs(), cache: "no-store" }
    );
    if (!r.ok)
      return NextResponse.json({ ok: false, msg: `Supabase ${r.status}: ${(await r.text()).slice(0, 120)}` });
    const rows = await r.json();
    return NextResponse.json({ ok: true, brain: rows?.[0]?.payload ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, msg: String((e as Error)?.message || e) });
  }
}

export async function POST(req: Request) {
  if (!SUPA_URL || !SUPA_KEY)
    return NextResponse.json({ ok: false, msg: "Supabase belum diatur" });
  try {
    const payload = await req.json(); // BrainMemory { researches, results } — sudah dibatasi klien (200+25)
    const r = await fetch(`${SUPA_URL}/rest/v1/verve_brain`, {
      method: "POST",
      headers: { ...hdrs(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ id: "main", payload, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok)
      return NextResponse.json({ ok: false, msg: `Supabase ${r.status}: ${(await r.text()).slice(0, 120)}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, msg: String((e as Error)?.message || e) });
  }
}
