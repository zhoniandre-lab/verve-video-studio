import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 🧾 FONDASI KREDIT (L3) — pencatat diam-diam tiap panggilan AI berbayar.
 *
 * Prinsip keras (perintah bro: jangan ganggu mesin yang sudah jalan):
 *  1. Fire-and-forget — catatKredit() TIDAK PERNAH ditunggu (tanpa await di titik panggil).
 *  2. Tidak pernah melempar error — kalau Supabase down/belum siap, cukup console.warn.
 *  3. Menggunakan SUPABASE_SERVICE_ROLE_KEY (lewat RLS) — tabel ledger tertutup untuk user biasa.
 *  4. Tidak ada blokir/saldo — murni fondasi pencatatan untuk Fase D (paket & harga).
 */

let _cli: SupabaseClient | null | undefined;

function klien(): SupabaseClient | null {
  if (_cli !== undefined) return _cli;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[ledger] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set → pencatatan kredit nonaktif");
    _cli = null;
    return null;
  }
  _cli = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _cli;
}

export type FiturKredit = "teks" | "gambar" | "suara-tts" | "video" | "musik" | "lainnya";

/** Petakan endpoint gateway → fitur yang dipahami manusia (dipakai stub postJson). */
export function fiturDariPath(path: string): FiturKredit {
  const p = String(path || "").toLowerCase();
  if (p.includes("/chat/completions")) return "teks";
  if (p.includes("/images/")) return "gambar";
  if (p.includes("/audio/speech")) return "suara-tts";
  if (p.includes("/videos/")) return "video";
  if (p.includes("suno") || p.includes("music")) return "musik";
  return "lainnya";
}

/** Potong & sensor pesan error — buang kemungkinan bocoran kunci sebelum masuk tabel. */
export function potongErr(e: any): string {
  const s = String(e?.message || e || "error")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
  return s.slice(0, 200);
}

export interface CatatanKredit {
  fitur: FiturKredit | string;
  model?: string | null;
  endpoint?: string | null;
  penyedia?: string | null; // "hcnsec" | "kie" | "apiframe" | ...
  ok: boolean;
  ms?: number | null;       // durasi panggilan (mendetik) — deteksi tersangka lemot
  err?: string | null;
}

/** 🔥 Catat 1 panggilan AI berbayar. JANGAN di-await. TIDAK PERNAH throw. */
export function catatKredit(c: CatatanKredit): void {
  try {
    const s = klien();
    if (!s) return;
    void Promise.resolve(
      s.from("credit_ledger").insert({
        fitur: String(c.fitur),
        model: c.model || null,
        endpoint: c.endpoint ? String(c.endpoint).slice(0, 200) : null,
        penyedia: c.penyedia || null,
        ok: !!c.ok,
        ms: typeof c.ms === "number" && isFinite(c.ms) ? Math.max(0, Math.round(c.ms)) : null,
        err: c.err ? String(c.err).slice(0, 300) : null,
      }) as any
    )
      .then(({ error }: any) => { if (error) console.warn("[ledger] gagal catat:", error.message); })
      .catch((e: any) => console.warn("[ledger] gagal catat:", e?.message || e));
  } catch (e: any) {
    console.warn("[ledger] gagal catat:", e?.message || e);
  }
}

/** Ambil baris mentah N hari terakhir (dipakai rute /api/kredit-ringkas). */
export async function tarikBarisKredit(hari = 14): Promise<{ siap: boolean; alasan?: string; baris?: any[] }> {
  const s = klien();
  if (!s) return { siap: false, alasan: "SUPABASE service belum di-set" };
  const sejak = new Date(Date.now() - hari * 86400_000).toISOString();
  const { data, error } = await s
    .from("credit_ledger")
    .select("fitur, ok, ms, created_at")
    .gte("created_at", sejak)
    .limit(20000);
  if (error) return { siap: false, alasan: error.message };
  return { siap: true, baris: data || [] };
}

/** Agregasi murni (diuji di tests/) → ringkasan per fitur + per hari. */
export function agregatRingkas(baris: any[]): {
  perFitur: Record<string, { total: number; ok: number; gagal: number; msTotal: number }>;
  perHari: Record<string, { total: number; gagal: number }>;
  totalSemua: number; gagalSemua: number;
} {
  const perFitur: Record<string, { total: number; ok: number; gagal: number; msTotal: number }> = {};
  const perHari: Record<string, { total: number; gagal: number }> = {};
  let totalSemua = 0, gagalSemua = 0;
  for (const b of baris || []) {
    const f = String(b?.fitur || "lainnya");
    const pf = (perFitur[f] ||= { total: 0, ok: 0, gagal: 0, msTotal: 0 });
    pf.total++; if (b.ok) pf.ok++; else pf.gagal++;
    const msd = Number(b?.ms || 0); if (isFinite(msd)) pf.msTotal += msd;
    const t = String(b?.created_at || "").slice(0, 10) || "tanpa-tanggal";
    const ph = (perHari[t] ||= { total: 0, gagal: 0 });
    ph.total++; if (!b.ok) ph.gagal++;
    totalSemua++; if (!b.ok) gagalSemua++;
  }
  return { perFitur, perHari, totalSemua, gagalSemua };
}
