/**
 * 🖼 OTAK CTR STUDIO THUMBNAIL (L5) — murni, tanpa jaringan, diuji di tests/.
 * Prinsip CTR YouTube nyata: 1 subjek jelas + kontras tinggi + RUANG KOSONG
 * (teks power-words digambar terpisah oleh lib/thumb di kanvas — jadi AI DIMINTA JANGAN menggambar teks).
 */

export interface VarianThumb { id: number; nama: string; arah: string; }

export const VARIAN_THUMB: VarianThumb[] = [
  { id: 1, nama: "Wajah & Emosi", arah: "CLOSE-UP 85mm wajah penuh cerita, mata tajam menatap ke area kosong, air mata atau tekad tertahan, cahaya jendela dramatis memahat pipi, pori-pori terasa, rim light emas hangat membingkai rambut, bayangan lembut sisi gelap, latar bokeh dangkal, ekspresi menggantung antara haru dan tegar" },
  { id: 2, nama: "Adegan Sinematik", arah: "WIDE SHOT 24mm epik golden hour, sosok kecil dalam ruang/lanskap besar, kabut tipis menyelimuti, cahaya matahari masuk dramatis menembus awan, skala megah seperti poster film, langit jingga-ungu gradasi, siluet hangat, kedalaman atmosferis yang terasa" },
  { id: 3, nama: "Simbol & Bukti", arah: "STILL LIFE simbolik satu objek penuh makna (foto berbingkai/surat lama/barang kenangan/sepatu usang) dibakar cahaya jendela sore, bayangan panjang, TANPA manusia, tekstur tua terasa (debu, serat kertas, kayu lapuk), debu melayang di berkas cahaya, nuansa melankolis yang menyengat" },
];

/** Font tampilan untuk teks thumbnail — semua SUDAH dimuat aplikasi di layout (gratis, OFL). */
export interface FontThumb { id: string; label: string; fam: string; }
export const FONT_THUMB: FontThumb[] = [
  { id: "anton", label: "Anton", fam: "'Anton',Impact,sans-serif" },
  { id: "archivo", label: "Archivo", fam: "'Archivo Black',Impact,sans-serif" },
  { id: "bebas", label: "Bebas", fam: "'Bebas Neue',Impact,sans-serif" },
  { id: "oswald", label: "Oswald", fam: "'Oswald',Impact,sans-serif" },
  { id: "montserrat", label: "Montserrat", fam: "'Montserrat',Arial,sans-serif" },
  { id: "righteous", label: "Righteous", fam: "'Righteous',Impact,sans-serif" },
  { id: "bangers", label: "Bangers", fam: "'Bangers',Impact,sans-serif" },
  { id: "poppins", label: "Poppins", fam: "'Poppins',Arial,sans-serif" },
];

/** Pecah teks manual jadi baris (maks 3, kosong dibuang). Murni — diuji. */
export function bagiBarisTeks(t: string): string[] {
  return String(t || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

/** Susun prompt thumbnail dari data Lahan (judul terpilih + gaya visual storyboard + kunci karakter). Murni — diuji. */
export function bangunPromptDariLahan(l: any): string {
  if (!l || typeof l !== "object") return "";
  const bag: string[] = [];
  const judulL = String(l.selTitle || "").trim();
  const topik = String(l.topic || "").trim();
  const tema = judulL || topik;
  if (tema) bag.push(`tema thumbnail: "${tema.slice(0, 90)}"`);
  const sv = String(l?.board?.style_visual || "").trim();
  if (sv) bag.push(`gaya visual ${sv.slice(0, 90)}`);
  const cg = String(l?.board?.color_grade || "").trim();
  if (cg) bag.push(`color grading ${cg.slice(0, 60)}`);
  const cl = String(l.charLock || "").trim();
  if (cl) bag.push(`karakter subjek: ${cl.slice(0, 140)}`);
  return bag.join(", ").slice(0, 340);
}

/** Kamus arahan visual per niche (kunci lowercase). */
export const NICHE_GAYA: Record<string, string> = {
  ibu: "anak dewasa menatap foto ibu, cahaya golden hour lewat jendela kayu desa, debu di berkas cahaya, syahdu mengharukan",
  ayah: "punggung ayah di teras senja, cahaya hangat oranye, nuansa perjuangan diam-diam, sinematik",
  rindu: "kursi kosong + foto berbingkai + hujan rintik di kaca jendela, satu lampu kuning redup, kehilangan yang dalam",
  sedih: "wajah menahan air mata di samping jendela hujan, rim-light dingin dan lampu hangat berjauhan, melodrama sinematik",
  keluarga: "kehangatan keluarga di rumah sederhana, cahaya jendela sore emas, tulus apa adanya",
  emosi: "close-up mata berkaca-kaca menatap jauh, depth of field sangat dangkal, cahaya jendela dramatis",
  cinta: "sepasang siluet berjauhan dibelah cahaya senja, jarak dan kerinduan, jingga-biru berani",
  pernikahan: "detail cincin dan kain putih di cahaya jendela lembut, romantis elegan, emas hangat",
  persahabatan: "dua siluet sahabat di atap senja, tawa dan nostalgia, jingga keunguan",
  anak: "tangan kecil menggenggam jari orang tua, cahaya lembut keemasan, polos menyentuh",
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
  // 🎬 v19.10.1: lapisan "sinematik" yang kaya — biar gambar AI keluar kayak punya
  // ChatGPT/DALL-E (lighting dramatis + mood + palet warna + atmosfer + tekstur),
  // BUKAN sekadar "background photo" generik.
  const SINEMATIK = [
    "Cinematic portrait lighting: single warm window light sculpting the face, soft golden rim light, deep emotional mood, color palette warm amber + deep teal shadows, atmosphere intimate and heart-touching, subtle film grain, razor-sharp focus on the eyes, 8K cinematic quality",
    "Epic movie lighting: golden hour sun flare, volumetric god rays through mist, mood grand and nostalgic, color palette burnt orange + violet sky, atmosphere vast and cinematic, subtle film grain, ultra-detailed landscape, 8K cinematic quality",
    "Moody still-life lighting: single shaft of warm window light on the object, long shadows, mood melancholic and nostalgic, color palette sepia + amber + soft shadow blue, atmosphere quiet and emotional, visible dust particles in the light beam, film grain, 8K cinematic quality",
  ];
  return [
    `Ultra high-CTR YouTube thumbnail photo, 16:9 widescreen, cinematic film still, shot on professional camera.`,
    `Subject scene: "${tema}", gaya visual: ${gayaNiche(niche)}.`,
    `Sinematik: ${SINEMATIK[varian >= 1 && varian <= 3 ? varian - 1 : 0]}.`,
    `Komposisi: ${v.arah}.`,
    `ATURAN KERAS: subjek utama di KANAN frame, KOSONGKAN 40% area KIRI untuk teks nanti, ` +
    `kontras sangat tinggi, warna jenuh berani, fokus tajam di subjek, bokeh latar, kualitas majalah.`,
    `DILARANG: teks, tulisan, huruf, kata, logo, watermark, bingkai, tangan palsu, wajah rusak, gaya kartun datar.`,
    `ABSOLUTELY NO alphabet characters or letters anywhere in the scene — PURE photographic scene only, as if shot by a human photographer.`,
  ].join(" ");
}

/** 3 opsi kata penguat CTR untuk badge kecil di pojok (murni — diuji). */
export function badgeCtr(niche: string): string {
  const n = String(niche || "").toLowerCase();
  if (n.includes("ibu") || n.includes("ayah") || n.includes("rindu") || n.includes("sedih")) return "SIAPKAN TISU";
  if (n.includes("keluarga") || n.includes("anak")) return "KELUARGA NO.1";
  if (n.includes("horor") || n.includes("misteri")) return "JANGAN NONTON SENDIRIAN";
  if (n.includes("uang") || n.includes("bisnis")) return "PROVEN 2026";
  if (n.includes("motivasi")) return "WAJIB TAHU";
  if (n.includes("dapur") || n.includes("masak")) return "AUTO NGILER";
  if (n.includes("gaming")) return "EPIC MOMENT";
  return "VIRAL HARI INI";
}
