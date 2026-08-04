import { createSupabaseServerClient } from "./supabase-server";

/**
 * 👑 PENJAGA PINTU BOS (L3.5) — hanya email yang terdaftar di env BOS_EMAILS
 * (pisahkan koma) yang boleh mengakses rute /api/bos/*. Selain itu: 401/403.
 */

/** Daftar email bos dari env (murni — diuji di tests/). */
export function emailBos(envVal?: string): string[] {
  return String(envVal !== undefined ? envVal : (process.env.BOS_EMAILS || ""))
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Cocokkan email terhadap daftar bos (murni — diuji di tests/). */
export function apakahBos(email: string | null | undefined, envVal?: string): boolean {
  if (!email) return false;
  const list = emailBos(envVal);
  if (list.length === 0) return false;
  return list.includes(String(email).trim().toLowerCase());
}

/** Cek sesi + kepemilikan untuk rute server. */
export async function mintaBos(): Promise<{ ok: boolean; email?: string; alasan?: string }> {
  try {
    if (emailBos().length === 0) return { ok: false, alasan: "BOS_EMAILS belum di-set di Vercel" };
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || undefined;
    if (!apakahBos(email)) return { ok: false, email, alasan: email ? "bukan pemilik" : "belum login" };
    return { ok: true, email };
  } catch (e: any) {
    return { ok: false, alasan: e?.message || String(e) };
  }
}
