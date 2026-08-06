/* =====================================================================
   BOT BURUAN AI — tipe dasar (v19.35) — 100% orisinal
   ===================================================================== */

export type KategoriId = "chat" | "gambar-video" | "musik" | "gambar" | "suara" | "lain";

export const KATEGORI: { id: KategoriId; emoji: string; label: string }[] = [
  { id: "chat", emoji: "💬", label: "Chat / LLM API" },
  { id: "gambar-video", emoji: "🎬", label: "Gambar → Video" },
  { id: "musik", emoji: "🎵", label: "Musik / Lagu" },
  { id: "gambar", emoji: "🖼️", label: "Gambar / Foto" },
  { id: "suara", emoji: "🎙️", label: "Suara / TTS" },
  { id: "lain", emoji: "🧰", label: "Lainnya" },
];

export type JenisGratis = "permanen" | "harian" | "mingguan" | "bulanan" | "sekali";

export type StatusBuruan = "baru" | "coba" | "berhasil" | "mati";

/** Cara pakai di Verve:
 *  - "api-key" → OpenAI-compatible → bisa disimpan ke Dompet Bansos (dipakai otomatis fitur)
 *  - "api"     → punya API/REST sendiri (key dipakai manual / tool lain)
 *  - "ui"      → tool situs (bikin & download di situsnya, lalu import hasilnya ke Verve) */
export type Integrasi = "api-key" | "api" | "ui";

/** 🛡 v19.35.3: tingkat kepercayaan "gratis"-nya (jujur, bukan klaim).
 *  - "stabil" → masih dikonfirmasi jalan (daily/monthly refresh) saat ini
 *  - "ubah"   → kebijakan sering berubah / pernah dihapus (mis. Hailuo daily credits)
 *  - "cek"    → belum sempat diverifikasi ulang */
export type TingkatStabil = "stabil" | "ubah" | "cek";

export interface LangkahTutorial {
  /** teks langkah; {LINK} diganti tombol buka situs */
  t: string;
}

export interface BuruanItem {
  id: string;
  nama: string;
  url: string;
  kategori: KategoriId;
  /** apa yang gratis — contoh: "1.000 call/bulan, tanpa kartu" */
  gratis: string;
  jenis: JenisGratis;
  /** syarat klaim — contoh: "email doang", "butuh kartu", "login GitHub" */
  syarat: string;
  /** masa berlaku deal (untuk jenis sekali/bulanan) — boleh kosong */
  berlaku?: string;
  /** skor kemudahan 1..5 (5 = paling gampang) */
  mudah: number;
  /** base URL kalau OpenAI-compatible (bisa disimpan ke Dompet Bansos) */
  baseUrl?: string;
  /** model contoh (opsional) */
  contohModel?: string;
  /** deskripsi singkat */
  desc: string;
  /** cara pakai di Verve (api-key / api / ui) */
  integrasi: Integrasi;
  /** 🛡 tingkat kepercayaan "gratis"-nya (stabil/ubah/cek) */
  stabil: TingkatStabil;
  /** tautan LANGSUNG ke halaman buat/lihat API key (kalau punya) */
  keyUrl?: string;
  /** kata kunci tambahan buat pencarian (mis. "gambar bergerak", "animasi", "avatar") */
  tags?: string[];
  /** langkah tutorial (urutan) */
  tutorial: LangkahTutorial[];
  /** sumber data: "kurasi" | nama repo */
  sumber: string;
  /** kapan terakhir dicek (epoch ms) */
  dicek: number;
}

export const BURUAN_KEY_STATUS = "verve_buruan_status_v1";
export const BURUAN_KEY_SEEN = "verve_buruan_seen_v1";
export const BURUAN_KEY_LAPOR = "verve_buruan_lapor_v1"; // { id: timestamp } — user lapor "sudah tidak gratis"

/** Nama status untuk badge */
export const STATUS_LABEL: Record<StatusBuruan, string> = {
  baru: "🆕 Baru", coba: "🔁 Dicoba", berhasil: "✅ Berhasil", mati: "💀 Mati",
};

/** Label tingkat stabilitas */
export const STABIL_LABEL: Record<TingkatStabil, string> = {
  stabil: "✅ Terverifikasi masih gratis",
  ubah: "⚠️ Sering berubah — cek dulu sebelum daftar",
  cek: "🔍 Perlu dicek",
};

/** Murni (diuji di tests/): tandai laporan "sudah tidak gratis" */
export function tandaiLapor(lapor: Record<string, number>, id: string): Record<string, number> {
  return { ...lapor, [id]: Date.now() };
}
/** Murni (diuji di tests/): batalkan laporan */
export function hapusLapor(lapor: Record<string, number>, id: string): Record<string, number> {
  const n = { ...lapor };
  delete n[id];
  return n;
}
