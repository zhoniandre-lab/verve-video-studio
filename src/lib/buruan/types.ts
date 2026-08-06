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

/** Nama status untuk badge */
export const STATUS_LABEL: Record<StatusBuruan, string> = {
  baru: "🆕 Baru", coba: "🔁 Dicoba", berhasil: "✅ Berhasil", mati: "💀 Mati",
};
