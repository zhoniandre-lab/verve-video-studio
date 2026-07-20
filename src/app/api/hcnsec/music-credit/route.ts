import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/hcnsec/music-credit  { provider, keys: string[] }
 * Cek saldo kredit kunci Suno — JUJUR: kami probe endpoint saldo yang umum
 * diekspos provider. Kalau provider tidak mengekspos via API, kami bilang
 * "tidak terekspos" — BUKAN mengarang nominal. Kunci dimask sebelum dikembalikan.
 */

const BASE: Record<string, string> = {
  kie: "https://api.kie.ai/api/v1",
  apiframe: "https://apiframe.ai/api",
  sunor: "https://api.sunor.cc/v1",
};
const PROBE: Record<string, string[]> = {
  kie: ["/chat/credit", "/credit", "/user/credit"],
  apiframe: ["/credits", "/user/credits", "/credit"],
  sunor: ["/user/credits", "/credits", "/credit"],
};

function mask(k: string): string {
  return k.length > 10 ? `${k.slice(0, 7)}…${k.slice(-3)}` : "••••";
}

type AnyRec = Record<string, unknown>;

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
  return null;
}

function findCredit(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const rec = d as AnyRec;
  const data = (rec.data && typeof rec.data === "object" ? rec.data : {}) as AnyRec;
  const cands = [data.credit, data.balance, data.credits, data.quota, rec.credit, rec.balance, rec.credits, rec.quota];
  for (const c of cands) {
    const n = pickNumber(c);
    if (n != null) return n;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider = String(body.provider || "").toLowerCase();
    const keys: string[] = Array.isArray(body.keys) ? body.keys : [];
    const base = BASE[provider];
    if (!base || !keys.length) {
      return NextResponse.json({ error: "provider/keys tidak valid" }, { status: 400 });
    }

    const results: { key: string; status: "ok" | "unknown"; credit?: number; msg?: string }[] = [];
    for (const rawKey of keys.slice(0, 5)) {
      const key = String(rawKey || "").trim().replace(/^Bearer\s+/i, "");
      if (!key) continue;
      let done = false;
      for (const p of PROBE[provider]) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(`${base}${p}`, {
            headers: { Authorization: `Bearer ${key}`, apikey: key, "x-api-key": key },
            signal: ctrl.signal,
            cache: "no-store",
          });
          clearTimeout(to);
          if (!r.ok) continue;
          const j = await r.json().catch(() => ({}));
          const credit = findCredit(j);
          if (credit != null) {
            results.push({ key: mask(key), status: "ok", credit });
          } else {
            results.push({ key: mask(key), status: "unknown", msg: "saldo tak terekspos via API (validitas kunci terbukti saat generate)" });
          }
          done = true;
          break;
        } catch { /* probe jalur berikutnya */ }
      }
      if (!done) {
        results.push({ key: mask(key), status: "unknown", msg: "provider tak mengekspos saldo — cek dashboard" });
      }
    }
    return NextResponse.json({ results, honest: "Nominal hanya ditampilkan kalau provider memang mengeksposnya via API." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
