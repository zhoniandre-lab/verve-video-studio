/**
 * 🖼 OTAK CTR STUDIO THUMBNAIL (L5) — murni, tanpa jaringan, diuji di tests/.
 * Prinsip CTR YouTube nyata: 1 subjek jelas + kontras tinggi + RUANG KOSONG
 * (teks power-words digambar terpisah oleh lib/thumb di kanvas — jadi AI DIMINTA JANGAN menggambar teks).
 */

export interface VarianThumb { id: number; nama: string; arah: string; }

export const VARIAN_THUMB: VarianThumb[] = [
  { id: 1, nama: "Ledakan Kontras", arah: "pencahayaan dramatis rim-light, warna komplementer jingga-biru yang bertabrakan, subjek paling terang di frame" },
  { id: 2, nama: "Detik Menegangkan", arah: "momen tepat SEBELUM kejadian puncak, ekspresi atau objek dibekukan di puncak aksi, motion blur tipis di latar" },
  { id: 3, nama: "Bukti Besar", arah: "satu objek bukti/hasil utama diperbesar nyaris memenuhi setengah kanan frame, sisanya ruang kosong bersih" },
];

/** Kamus arahan visual per niche (kunci lowercase). */
export const NICHE_GAYA: Record<string, string> = {
  motivasi: "siluet tokoh kuat backlight emas, kabut tipis, aura berkabar",
  horor: "rumah tua gelap, satu cahaya lilin, vignette berat, hijau-merah gelap",
  misteri: "lorong remang, kabut, satu sumber cahaya dingin, siluet misterius",
  dapur: "close-up makanan mengilap, uap mengepul, warna hangat menggugah",
  masak: "close-up makanan mengilap, uap mengepul, warna hangat menggugah",
  uang: "grafik naik hijau neon, koin emas beterbangan, latar gelap kontras",
  bisnis: "grafik naik hijau neon, koin emas beterbangan, latar gelap kontras",
  teknologi: "gadget futuristik menyala biru-ungu, refleksi tajam, panel hologram",
  kesehatan: "tubuh sehat backlight matahari terbit, hijau segar, cahaya bersih",
  pendidikan: "ilustrasi modern rapi, ikon besar sederhana, biru-kuning cerah",
  hiburan: "ekspresi wajah terkejut close-up, warna pop kuning-magenta",
  gaming: "karakter epik, neon ungu-biru, partikel cahaya, pose dinamis",
  berita: "foto jurnalistik tajam, koreksi warna sinematik, depth tajam",
  travel: "pemandangan epik golden hour, ultra lebar, warna kaya",
  islam: "cahaya lembut keemasan, arsitektur indah, nuansa tenang damai",
  umum: "subjek utama menonjol tajam, latar blur sinematik, kontras tinggi",
};

/** Cari arahan visual niche; tak kenal → "umum". Murni — diuji. */
export function gayaNiche(niche: string): string {
  const n = String(niche || "").toLowerCase().trim();
  if (!n) return NICHE_GAYA.umum;
  for (const k of Object.keys(NICHE_GAYA)) {
    if (k !== "umum" && n.includes(k)) return NICHE_GAYA[k];
  }
  return NICHE_GAYA.umum;
}

/**
 * Bangun prompt latar thumbnail untuk AI gambar (SENGJA bahasa Inggris — model gambar lebih patuh).
 * varian: 1..3 (selain itu diputar ke 1). Murni — diuji.
 */
export function promptLatarThumb(judul: string, niche: string, varian: number): string {
  const v = VARIAN_THUMB.find((x) => x.id === varian) || VARIAN_THUMB[0];
  const tema = String(judul || "").replace(/["\n\r]+/g, " ").trim().slice(0, 90) || "topik menarik";
  return [
    `Ultra high-CTR YouTube thumbnail background photo, 16:9 widescreen.`,
    `Subject scene: "${tema}", gaya visual: ${gayaNiche(niche)}.`,
    `Komposisi: ${v.arah}.`,
    `ATURAN KERAS: subjek utama di KANAN frame, KOSONGKAN 40% area KIRI untuk teks nanti, ` +
    `kontras sangat tinggi, warna jenuh berani, fokus tajam di subjek, bokeh latar, kualitas majalah.`,
    `DILARANG: teks, tulisan, huruf, kata, logo, watermark, bingkai, tangan palsu, wajah rusak, gaya kartun datar.`,
  ].join(" ");
}

/** 3 opsi kata penguat CTR untuk badge kecil di pojok (murni — diuji). */
export function badgeCtr(niche: string): string {
  const n = String(niche || "").toLowerCase();
  if (n.includes("horor") || n.includes("misteri")) return "⚠️ JANGAN NONTON SENDIRIAN";
  if (n.includes("uang") || n.includes("bisnis")) return "💰 PROVEN 2026";
  if (n.includes("motivasi")) return "🔥 WAJIB TAHU";
  if (n.includes("dapur") || n.includes("masak")) return "😋 AUTO NGILER";
  if (n.includes("gaming")) return "🎮 EPIC MOMENT";
  return "✨ VIRAL HARI INI";
}
