/* 🎞️ LEMARI VIDEO — klien pencarian stock video Pexels lewat gerbang /api/hcnsec/stock-video.
   Lisensi Pexels: bebas pakai SEMUA durasi, bebas edit, TANPA atribusi wajib, aman monetisasi YouTube.
   (BUKAN video berhak cipta — jadi aturan "berapa detik boleh" tidak berlaku, semuanya halal.) */

export type VidPick = { id: number; src: string; sd: string; thumb: string; dur: number; by: string; link: string; w?: number; h?: number };

export type CariHasil = { ok: boolean; hasil: VidPick[]; total: number; err: string };

export async function cariStokVideo(q: string, page = 1, per = 8): Promise<CariHasil> {
  const query = q.trim().replace(/\s+/g, " ").slice(0, 60);
  if (query.length < 2) return { ok: false, hasil: [], total: 0, err: "Kata kunci terlalu pendek bro." };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000); // jam pengaman per pencarian
  try {
    const r = await fetch(`/api/hcnsec/stock-video?q=${encodeURIComponent(query)}&page=${page}&per=${per}`, { signal: ac.signal });
    clearTimeout(t);
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      if (j.code === "TANPA_KUNCI")
        return { ok: false, hasil: [], total: 0, err: "🔑 Kunci Pexels belum terpasang di server — lapor admin ya bro." };
      if (j.code === "KECEPETAN")
        return { ok: false, hasil: [], total: 0, err: "⏳ Terlalu sering cari dalam 10 menit — tarik napas dulu ya bro." };
      return { ok: false, hasil: [], total: 0, err: j.error || `Gudang gagal dihubungi (HTTP ${r.status})` };
    }
    return { ok: true, hasil: j.hasil || [], total: j.total || 0, err: "" };
  } catch (e: any) {
    clearTimeout(t);
    return {
      ok: false, hasil: [], total: 0,
      err: e?.name === "AbortError" ? "⏱ Koneksi lambat (>15 detik) — coba lagi ya bro." : (e?.message || "Koneksi gagal"),
    };
  }
}

/* Kata "gaya diri" (bukan ISI adegan) — dibuang dari kueri biar hasil gudang relevan.
   wp animal: woman/man SENGAJA tidak dibuang — "elderly woman crying" justru kueri emas. */
const KATA_BUANG = new Set(
  (
    "cinematic,vertical,8k,4k,uhd,ultra,hd,realistic,hyperrealistic,detailed,sharp,style,stylized," +
    "lighting,glow,colorful,color,colour,grading,grade,tones,tone,photo,photography,photorealistic,render,rendering," +
    "shot,scene,frame,film,movie,cinema,aesthetic,portrait,landscape,background,atmosphere,mood,moody," +
    "dramatic,epic,professional,masterpiece,best,quality,high,indonesia,indonesian"
  ).split(","),
);

/* Terjemahan mini: kata yang sering muncul di deskripsi adegan (Indonesia) → Inggris (bahasa gudang).
   Sengaja kecil & jujur — bukan kamus lengkap, tapi cukup untuk niche "cerita jadi lagu". */
const ID_EN: Record<string, string> = {
  sedih: "sad", menangis: "crying", tangis: "crying", senang: "happy", bahagia: "happy", marah: "angry", takut: "scared",
  ibu: "mother", bapak: "father", ayah: "father", anak: "child", kakek: "grandfather", nenek: "grandmother", tua: "elderly", orang: "person", pria: "man", wanita: "woman",
  rumah: "house", dapur: "kitchen", kamar: "bedroom", desa: "village", kota: "city", sawah: "rice field", ladang: "farm", pantai: "beach", laut: "sea", gunung: "mountain", hutan: "forest", sungai: "river",
  hujan: "rain", gerimis: "drizzle", petir: "storm", matahari: "sun", senja: "sunset", fajar: "sunrise", malam: "night", bulan: "moon", bintang: "stars", langit: "sky", awan: "clouds",
  jalan: "street", berjalan: "walking", berlari: "running", duduk: "sitting", memasak: "cooking", tidur: "sleeping", menunggu: "waiting", bekerja: "working",
  baju: "clothes", pakaian: "clothes", foto: "photo", surat: "letter", lagu: "song", musik: "music", gitar: "guitar", radio: "radio", televisi: "television",
  rindu: "longing", kenangan: "memories", penyesalan: "regret", sendiri: "alone", kesepian: "lonely", merantau: "wanderer",
  miskin: "poor", kaya: "rich", berdagang: "selling", pasar: "market", sekolah: "school", pulang: "homecoming",
};

/** Bangun kueri Inggris dari adegan. Sumber emas: visual_prompt (SUDAH Inggris), dibersihkan dari kata gaya. */
export function kueriDariScene(visualPrompt: string, sceneDesc: string): string {
  const kata = (visualPrompt || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length > 2 && !KATA_BUANG.has(w));
  const unik: string[] = [];
  for (const w of kata) {
    if (!unik.includes(w)) unik.push(w);
    if (unik.length >= 5) break; // kueri pendek = hasil gudang lebih luas
  }
  if (unik.length >= 2) return unik.join(" ");
  // Cadangan: terjemahan mini dari scene_desc Indonesia
  const u2: string[] = [];
  for (const w of (sceneDesc || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean)) {
    const t = ID_EN[w];
    if (t && !u2.includes(t)) u2.push(t);
    if (u2.length >= 4) break;
  }
  if (u2.length) return u2.join(" ");
  return "cinematic nature"; // cadangan terakhir — netral, pasti ada hasil
}

/** Pilih klip paling pas buat durasi adegan: cukup panjang (biar bisa dipotong), sedekat mungkin target. */
export function pilihKlipTerbaik(hasil: VidPick[], targetDur: number): VidPick | null {
  if (!hasil.length) return null;
  const t = targetDur > 0 ? targetDur : 6;
  let best = hasil[0];
  let bestSkor = -Infinity;
  for (const v of hasil) {
    const cukup = v.dur >= t * 0.9 ? 100 : 0; // klip lebih panjang dari adegan = aman dipotong
    const skor = cukup - Math.abs(v.dur - t) * 5 + Math.min(v.w || 0, 1280) / 100;
    if (skor > bestSkor) {
      bestSkor = skor;
      best = v;
    }
  }
  return best;
}
