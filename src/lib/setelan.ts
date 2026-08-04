import { klienLayanan } from "./ledger";

/**
 * 🎛 SETELAN PANEL BOS (L3.5) — tombol kendali pemilik yang dibaca mesin AI.
 * Disimpan di tabel app_settings (satu baris kunci "panel_bos").
 * Dibaca mesin lewat cache 45 detik — tombol bos terasa ≤1 menit, mesin tak terbebani.
 */

export interface SetelanPanel {
  mati: string[];                // fitur yang dimatikan bos: teks | gambar | suara-tts | video | musik
  batas: Record<string, number>; // batas panggilan SUKSES per hari per fitur (tak ada/0 = tanpa batas)
  pengumuman: string;            // teks banner untuk semua pengunjung ("" = tak ada banner)
}
export const SETELAN_DEFAULT: SetelanPanel = { mati: [], batas: {}, pengumuman: "" };

/** Bersihkan input apapun jadi SetelanPanel yang aman (murni — diuji di tests/). */
export function normalisasiSetelan(x: any): SetelanPanel {
  const o = x && typeof x === "object" ? x : {};
  const mati: string[] = Array.isArray(o.mati)
    ? o.mati.filter((f: any) => typeof f === "string" && f.trim()).map((f: string) => f.trim()).slice(0, 12)
    : [];
  const batas: Record<string, number> = {};
  if (o.batas && typeof o.batas === "object") {
    for (const [k, v] of Object.entries(o.batas)) {
      const n = Math.floor(Number(v));
      if (typeof k === "string" && k.trim() && isFinite(n) && n > 0) batas[k.trim()] = Math.min(n, 100000);
    }
  }
  const pengumuman = typeof o.pengumuman === "string" ? o.pengumuman.slice(0, 300) : "";
  return { mati, batas, pengumuman };
}

const KUNCI_PANEL = "panel_bos";
const CACHE_MS = 45_000;
let _cache: { t: number; v: SetelanPanel } | null = null;

/** Baca segar dari Supabase (dipakai dasbor bos). Gagal → DEFAULT (mesin tetap jalan). */
export async function getSetelanPaksa(): Promise<SetelanPanel> {
  const s = klienLayanan();
  if (!s) return SETELAN_DEFAULT;
  try {
    const { data, error } = await s.from("app_settings").select("nilai").eq("kunci", KUNCI_PANEL).maybeSingle();
    if (error) { console.warn("[setelan] baca gagal:", error.message); return SETELAN_DEFAULT; }
    return normalisasiSetelan(data?.nilai);
  } catch (e: any) { console.warn("[setelan] baca gagal:", e?.message || e); return SETELAN_DEFAULT; }
}

/** Baca lewat cache 45 detik (dipakai mesin AI pada tiap panggilan). */
export async function getSetelan(): Promise<SetelanPanel> {
  if (_cache && Date.now() - _cache.t < CACHE_MS) return _cache.v;
  const v = await getSetelanPaksa();
  _cache = { t: Date.now(), v };
  return v;
}

/** Tulis setelan baru (hanya dari rute bos yang sudah menjaga pintu). */
export async function setSetelan(baru: any): Promise<{ ok: boolean; alasan?: string }> {
  const s = klienLayanan();
  if (!s) return { ok: false, alasan: "SUPABASE service belum di-set" };
  try {
    const v = normalisasiSetelan(baru);
    const { error } = await s.from("app_settings")
      .upsert({ kunci: KUNCI_PANEL, nilai: v as any, updated_at: new Date().toISOString() });
    if (error) return { ok: false, alasan: error.message };
    _cache = { t: Date.now(), v };
    return { ok: true };
  } catch (e: any) { return { ok: false, alasan: e?.message || String(e) }; }
}

/** Awal hari INI versi WIB (Asia/Jakarta), sebagai ISO UTC — murni, diuji di tests/. */
export function mulaiHariIniWIB(ms?: number): string {
  const sekarang = typeof ms === "number" ? ms : Date.now();
  const wib = new Date(sekarang + 7 * 3600_000);
  const tgl = wib.toISOString().slice(0, 10); // tanggal versi WIB
  return new Date(Date.parse(tgl + "T00:00:00Z") - 7 * 3600_000).toISOString();
}

/** Keputusan gerbang (murni — diuji di tests/). terpakai=null → batas tak bisa dinilai → lolos. */
export function batasiFitur(fitur: string, s: SetelanPanel, terpakai: number | null): { blokir: boolean; alasan?: string } {
  if (!s) return { blokir: false };
  if (Array.isArray(s.mati) && s.mati.includes(fitur))
    return { blokir: true, alasan: `Fitur ${fitur} dimatikan sementara oleh pemilik 🔧 Coba lagi nanti ya.` };
  const b = s.batas?.[fitur];
  if (typeof b === "number" && b > 0 && typeof terpakai === "number" && terpakai >= b)
    return { blokir: true, alasan: `Kuota harian fitur ${fitur} habis (${b}/hari). Kembali lagi besok ya 🙏` };
  return { blokir: false };
}

async function terpakaiHariIni(fitur: string): Promise<number | null> {
  const s = klienLayanan();
  if (!s) return null;
  try {
    const { count, error } = await s.from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("fitur", fitur).eq("ok", true)
      .gte("created_at", mulaiHariIniWIB());
    if (error) { console.warn("[setelan] hitung gagal:", error.message); return null; }
    return typeof count === "number" ? count : null;
  } catch { return null; }
}

/**
 * GERBANG FITUR — dipanggil mesin SEBELUM keluar duit AI.
 * Gagal membaca apa pun → { blokir: false } (jangan pernah menghukum pengguna karena panel bos error).
 * Panggilan yang diblokir TIDAK dicatat di ledger (blokir bukan panggilan gateway — %gagal tetap jujur).
 */
export async function gerbangFitur(fitur: string): Promise<{ blokir: boolean; alasan?: string }> {
  try {
    const s = await getSetelan();
    const perluHitung = typeof s.batas?.[fitur] === "number" && (s.batas[fitur] as number) > 0;
    const terpakai = perluHitung ? await terpakaiHariIni(fitur) : null;
    return batasiFitur(fitur, s, terpakai);
  } catch { return { blokir: false }; }
}
