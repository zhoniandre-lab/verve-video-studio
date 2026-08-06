/* =====================================================================
   BOT BURUAN AI — API (v19.35)
   GET  /api/buruan            → daftar item (kurasi + sinkron sumber, cache 12 jam)
   GET  /api/buruan?sync=1     → paksa sinkron ulang dari sumber eksternal
   POST /api/buruan/tes        → tes koneksi OpenAI-compatible {base,key}
   Semua fetch dijalankan SERVER-SIDE (anti-CORS, anti blokir browser).
   ===================================================================== */
import { NextRequest, NextResponse } from "next/server";
import { katalogKurasi } from "@/lib/buruan/katalog";
import { SUMBER_EKSTERNAL, parseAwesomeFreeLlmApis, parseFreeForDev, parseFreeAiTools, gabungItems, MAKS_BYTE } from "@/lib/buruan/parse";
import type { Mentah } from "@/lib/buruan/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // cache manual di globalThis

const CACHE_MS = 12 * 60 * 60 * 1000; // 12 jam
const g = globalThis as any;
const KUNCI_CACHE = "verve_buruan_cache_v1";

async function ambilTeks(url: string): Promise<string> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "verve-buruan/1.0" } });
    if (!r.ok) return "";
    const t = await r.text();
    return t.length > MAKS_BYTE ? t.slice(0, MAKS_BYTE) : t;
  } catch {
    return "";
  } finally {
    clearTimeout(tm);
  }
}

async function sinkron(): Promise<{ item: ReturnType<typeof katalogKurasi>; sumber: string[]; error: string[] }> {
  const kurasi = katalogKurasi();
  const semuaMentah: Mentah[] = [];
  const error: string[] = [];
  const sumberOk: string[] = [];
  for (const s of SUMBER_EKSTERNAL) {
    try {
      const teks = await ambilTeks(s.url);
      if (!teks) { error.push(s.label); continue; }
      if (s.id === "awesome-free-llm-apis") semuaMentah.push(...parseAwesomeFreeLlmApis(teks));
      else if (s.id === "free-for-dev") semuaMentah.push(...parseFreeForDev(teks));
      else semuaMentah.push(...parseFreeAiTools(teks));
      sumberOk.push(s.label);
    } catch { error.push(s.label); }
  }
  return { item: gabungItems(kurasi, semuaMentah), sumber: sumberOk, error };
}

export async function GET(req: NextRequest) {
  const sync = req.nextUrl.searchParams.get("sync") === "1";
  const now = Date.now();
  let cache = g[KUNCI_CACHE] as { at: number; data: ReturnType<typeof sinkron> } | undefined;
  if (!sync && cache && now - cache.at < CACHE_MS) {
    return NextResponse.json({ ok: true, ...cache.data, cache: true, at: cache.at });
  }
  const data = await sinkron();
  g[KUNCI_CACHE] = { at: now, data };
  return NextResponse.json({ ok: true, ...data, cache: false, at: now });
}
