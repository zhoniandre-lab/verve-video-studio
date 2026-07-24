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
        return { ok: false, hasil: [], total: 0, err: "🔑 Kunci gudang video belum terpasang di server — lapor admin ya bro." };
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

/** 🇮🇩 Cari pintar RASA INDONESIA: coba dulu "+ indonesia"; stok Nusantara kosong → dilebarkan ke gudang dunia (dilapor JUJUR via lebar=true). */
export async function cariStokVideoSmart(q: string, rasaIndo: boolean): Promise<CariHasil & { lebar: boolean }> {
  const kunci = (q || "").trim();
  if (kunci.length < 2) return { ok: false, hasil: [], total: 0, err: "Kata kunci terlalu pendek bro.", lebar: false };
  if (!rasaIndo) { const r0 = await cariStokVideo(kunci); return { ...r0, lebar: false }; }
  const rIndo = await cariStokVideo(/indonesia|nusantara/i.test(kunci) ? kunci : `${kunci} indonesia`);
  if (rIndo.ok && rIndo.hasil.length) return { ...rIndo, lebar: false };
  // Stok Indo habis ATAU pencarian Indo gagal → lebarkan (tetap dicoba, pantang pulang kosong)
  const rLebar = await cariStokVideo(kunci);
  return { ...rLebar, lebar: rLebar.ok && rLebar.hasil.length > 0 };
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

/* 🎬 v13.11.2 PETA EMOJI KARAKTER & EMO — buat kueri sinematik "ibu & anak kenangan, sedih terasa". */
const PERAN_EN: Record<string, string> = {
  ibu: "mother", mama: "mother", mamah: "mother", emak: "mother",
  bapak: "father", ayah: "father", papa: "father", pake: "father",
  anak: "child", kakek: "grandfather", nenek: "grandmother",
  istri: "wife", suami: "husband", cucu: "grandchild", adik: "sibling", kakak: "sibling",
};
const MOOD_EN: Record<string, string> = {
  sedih: "sad", haru: "emotional", rindu: "longing", sepi: "lonely", kesepian: "lonely",
  bahagia: "happy", senang: "happy", marah: "angry", takut: "scared", cemas: "anxious",
  damai: "peaceful", romantis: "romantic", kecewa: "disappointed", syukur: "grateful",
};

/** Tema dari kartu karakter (maks 2 kata Inggris) — jangkar "ibu & anak" di TIAP kueri gudang. */
export function temaDariKarakter(karts: { nama?: string; peran?: string }[]): string {
  const kata: string[] = [];
  for (const k of karts || []) {
    const tok = `${k?.nama || ""} ${k?.peran || ""}`.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const w of tok) {
      const en = PERAN_EN[w];
      if (en && !kata.includes(en)) kata.push(en);
      if (kata.length >= 2) return kata.join(" ");
    }
  }
  return kata.join(" ");
}

/** Bangun kueri Inggris SINEMATIK: tema karakter + emosi DIDAHULUKAN, kata adegan menyusul hemat.
    Sumber adegan: visual_prompt (SUDAH Inggris), dibersihkan dari kata gaya. */
/* 🧺 v13.17 GAYA SINEMATIK BERGILIR — diputar per adegan (index % jumlah) supaya KUERI tiap adegan
   beda → klip yang keluar beda-beda, rasa film (bukan "itu-itu aja"). */
export const GAYA_EN = ["cinematic", "slow motion", "close up", "wide shot", "golden hour", "aerial view"];

export function kueriDariScene(visualPrompt: string, sceneDesc: string, tema = "", mood = "", gaya = ""): string {
  const kata = (visualPrompt || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length > 2 && !KATA_BUANG.has(w));
  const adegan: string[] = [];
  for (const w of kata) {
    if (!adegan.includes(w)) adegan.push(w);
    if (adegan.length >= 3) break; // adegan hemat — tema & emosi didahulukan
  }
  const temaW = (tema || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
  const moodW = MOOD_EN[(mood || "").toLowerCase().trim()];
  const gayaW = (gaya || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2); // 🧺 v13.17
  const gab: string[] = [];
  for (const w of [...temaW, ...(moodW ? [moodW] : []), ...gayaW, ...adegan]) {
    if (!gab.includes(w)) gab.push(w);
    if (gab.length >= 6) break; // slot +1 untuk gaya — tema & emosi tetap didahulukan
  }
  if (gab.length >= 2) return gab.join(" ");
  // Cadangan: terjemahan mini dari scene_desc Indonesia
  const u2: string[] = [];
  for (const w of (sceneDesc || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean)) {
    const t = ID_EN[w];
    if (t && !u2.includes(t)) u2.push(t);
    if (u2.length >= 3) break;
  }
  const gab2: string[] = [];
  for (const w of [...temaW, ...(moodW ? [moodW] : []), ...u2]) {
    if (!gab2.includes(w)) gab2.push(w);
    if (gab2.length >= 5) break;
  }
  if (gab2.length) return gab2.join(" ");
  return "emotional family memories"; // cadangan terakhir — tetap sinematik & mengharukan
}

/** Pilih klip paling pas buat durasi adegan: cukup panjang (biar bisa dipotong), sedekat mungkin target.
    🧯 v13.11.1 ANTI-KEMBAR: klip di `hindariId` (sudah dipakai adegan lain) DISINGKIRKAN dulu;
    kalau daftar jadi kosong total → baru boleh kembar (daripada adegan tanpa video). */
export function pilihKlipTerbaik(hasil: VidPick[], targetDur: number, hindariId?: Set<number>): VidPick | null {
  if (!hasil.length) return null;
  const segar = hindariId && hindariId.size ? hasil.filter((v) => !hindariId.has(v.id)) : hasil;
  const pool = segar.length ? segar : hasil;
  const t = targetDur > 0 ? targetDur : 6;
  let best = pool[0];
  let bestSkor = -Infinity;
  for (const v of pool) {
    const cukup = v.dur >= t * 0.9 ? 100 : 0; // klip lebih panjang dari adegan = aman dipotong
    const skor = cukup - Math.abs(v.dur - t) * 5 + Math.min(v.w || 0, 1280) / 100 + (Math.min(v.dur, t) / t) * 20; // 🌀 v13.12: makin mendekati slot makin juara
    if (skor > bestSkor) {
      bestSkor = skor;
      best = v;
    }
  }
  return best;
}

/** 🧺 v13.17 PILIH BERVARIASI — peringkat seperti pilihKlipTerbaik, tapi pemenangnya DIACAK dari
    5 kandidat terbaik (bukan juara 1 terus). Anti-kembar `hindariId` TETAP dihormati duluan.
    Efek: generate ulang / adegan lain tak lagi menampilkan klip yang itu-itu saja. */
export function pilihKlipBervariasi(hasil: VidPick[], targetDur: number, hindariId?: Set<number>, jumlahKandidat = 5): VidPick | null {
  if (!hasil.length) return null;
  const segar = hindariId && hindariId.size ? hasil.filter((v) => !hindariId.has(v.id)) : hasil;
  const pool = segar.length ? segar : hasil;
  const t = targetDur > 0 ? targetDur : 6;
  const skor = (v: VidPick) =>
    (v.dur >= t * 0.9 ? 100 : 0) - Math.abs(v.dur - t) * 5 + Math.min(v.w || 0, 1280) / 100 + (Math.min(v.dur, t) / t) * 20;
  const peringkat = [...pool].sort((a, b) => skor(b) - skor(a));
  const atas = peringkat.slice(0, Math.max(1, Math.min(jumlahKandidat, peringkat.length)));
  return atas[Math.floor(Math.random() * atas.length)];
}
