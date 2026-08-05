/**
 * 🎯 VERVE NICHE v19.20 — DUKUNGAN SEMUA NICHE (nggak terpaku satu niche).
 * Pengguna bebas pilih niche di Lahan (step 1); seluruh alur mengikuti pilihan:
 * prompt AI, riset, trend, judul saran, hashtag. Kustom = tulis niche sendiri.
 * Murni klien & offline.
 */

export type NicheId = "story_song" | "family" | "horror" | "dj" | "tutorial" | "muslim" | "custom";

export type NicheDef = {
  id: NicheId;
  label: string; // tampilan
  aiLabel: string; // untuk prompt AI & suffix riset
  emoji: string;
  desc: string;
  contoh: string[]; // chip contoh niat di step 1
  tags: string[]; // hashtag niche (buat Hashtag Pintar)
};

export const NICHES: NicheDef[] = [
  { id: "story_song", label: "Kisah & Lagu", aiLabel: "cerita jadi lagu", emoji: "🎵", desc: "Kisah emosional yang menyentuh", tags: ["kisahnyata", "kisahmenyentuh", "laguemosional"], contoh: ["kisah ibu yang mengharukan", "maaf yang terlambat", "perjuangan seorang ayah", "rindu yang tak tersampaikan"] },
  { id: "family", label: "Keluarga", aiLabel: "kisah keluarga", emoji: "👨‍👩‍👧", desc: "Kisah keluarga mengharukan", tags: ["kisahkeluarga", "keluargaharu", "kisahnyata"], contoh: ["kisah ibu single parent", "ayah pulang setelah bertahun-tahun", "anak mencari orang tuanya", "kehangatan keluarga sederhana"] },
  { id: "horror", label: "Horor / Mistis", aiLabel: "cerita horor", emoji: "👻", desc: "Cerita horor & mistis", tags: ["ceritahoror", "mistis", "scarystory"], contoh: ["hantu di rumah kosong", "kuntilanak di kebun belakang", "mistis kamar kos", "pocong di jalan desa"] },
  { id: "dj", label: "DJ / Remix", aiLabel: "musik dj remix", emoji: "🎧", desc: "Musik DJ & remix", tags: ["djremix", "fullbass", "musikviral"], contoh: ["dj remix viral terbaru", "full bass nonstop", "dj slow sedih", "remix lagu indonesia"] },
  { id: "tutorial", label: "Tutorial / Edukasi", aiLabel: "tutorial edukasi", emoji: "📚", desc: "Cara & tips", tags: ["tutorial", "tips", "caramudah"], contoh: ["cara edit video di hp", "tips cepat belajar bahasa inggris", "tutorial desain canva", "resep masakan simple"] },
  { id: "muslim", label: "Religi / Islami", aiLabel: "religi islami", emoji: "🕌", desc: "Konten islami", tags: ["islami", "doa", "nasihat"], contoh: ["kisah nabi yang mengharukan", "doa ibu untuk anak", "nasihat singkat penyejuk hati", "kajian tentang sabar"] },
  { id: "custom", label: "Kustom", aiLabel: "", emoji: "✏️", desc: "Tulis niche sendiri", tags: ["kontenviral", "fyp", "shorts"], contoh: ["topik yang sedang kamu geluti", "cerita dari pengalamanmu", "ide konten andalanmu", "sesuatu yang kamu kuasai"] },
];

export function nicheById(id: string): NicheDef {
  return NICHES.find((n) => n.id === id) || NICHES[0];
}

export function nicheLabel(id: string): string {
  return nicheById(id).label;
}

/** aiLabel untuk prompt AI — custom pakai label kustom yang ditulis user. */
export function nicheAiLabel(id: string, customLabel: string): string {
  const d = nicheById(id);
  if (id === "custom") return (customLabel || "topik").trim().toLowerCase();
  return d.aiLabel;
}

/** 🎵 v19.21: niche yang alurnya "cerita → lagu" (Suno penuh) vs yang lain (audio/narasi). */
export function isSongNiche(id: string): boolean {
  return id === "story_song" || id === "dj" || id === "family" || id === "muslim";
}

/** Langkah wizard per niche — langkah 8 = "Lagu" (song) atau "Audio" (lainnya). */
export function wizardSteps(id: string): string[] {
  const base = ["Niat", "Sudut", "Riset", "Judul", "Visual", "Cerita", "Adegan", "Lagu", "Video"];
  if (!isSongNiche(id)) base[7] = "Audio";
  return base;
}
