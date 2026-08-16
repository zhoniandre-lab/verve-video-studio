/* =====================================================================
   📖 DATA AL-QUR'AN (v20.0) — daftar surat + ambil ayat & terjemahan
   dari API publik alquran.cloud (tepercaya, dipakai banyak aplikasi).
   - Teks Arab: quran-uthmani (akurat)
   - Terjemahan: edisi per bahasa (id/en/tr/fr/es/ur/bn/de/ru/zh/ms)
   Hasil di-cache di localStorage biar offline setelah pertama kali.
   ===================================================================== */

export type SuratQ = { id: number; nama: string; arab: string; ayat: number; turun: string };

/** Surat pendek (juz amma) + Al-Fatihah + Al-Baqarah (Ayat Kursi) — urut umum dipakai */
export const DAFTAR_SURAT: SuratQ[] = [
  { id: 1, nama: "Al-Fatihah", arab: "الفاتحة", ayat: 7, turun: "Makkiyah" },
  { id: 2, nama: "Al-Baqarah", arab: "البقرة", ayat: 286, turun: "Madaniyah" },
  { id: 78, nama: "An-Naba'", arab: "النبأ", ayat: 40, turun: "Makkiyah" },
  { id: 79, nama: "An-Nazi'at", arab: "النازعات", ayat: 46, turun: "Makkiyah" },
  { id: 80, nama: "'Abasa", arab: "عبس", ayat: 42, turun: "Makkiyah" },
  { id: 81, nama: "At-Takwir", arab: "التكوير", ayat: 29, turun: "Makkiyah" },
  { id: 82, nama: "Al-Infitar", arab: "الانفطار", ayat: 19, turun: "Makkiyah" },
  { id: 83, nama: "Al-Mutaffifin", arab: "المطففين", ayat: 36, turun: "Makkiyah" },
  { id: 84, nama: "Al-Insyiqaq", arab: "الانشقاق", ayat: 25, turun: "Makkiyah" },
  { id: 85, nama: "Al-Buruj", arab: "البروج", ayat: 22, turun: "Makkiyah" },
  { id: 86, nama: "At-Tariq", arab: "الطارق", ayat: 17, turun: "Makkiyah" },
  { id: 87, nama: "Al-A'la", arab: "الأعلى", ayat: 19, turun: "Makkiyah" },
  { id: 88, nama: "Al-Ghasyiyah", arab: "الغاشية", ayat: 26, turun: "Makkiyah" },
  { id: 89, nama: "Al-Fajr", arab: "الفجر", ayat: 30, turun: "Makkiyah" },
  { id: 90, nama: "Al-Balad", arab: "البلد", ayat: 20, turun: "Makkiyah" },
  { id: 91, nama: "Asy-Syams", arab: "الشمس", ayat: 15, turun: "Makkiyah" },
  { id: 92, nama: "Al-Lail", arab: "الليل", ayat: 21, turun: "Makkiyah" },
  { id: 93, nama: "Ad-Duha", arab: "الضحى", ayat: 11, turun: "Makkiyah" },
  { id: 94, nama: "Asy-Syarh", arab: "الشرح", ayat: 8, turun: "Makkiyah" },
  { id: 95, nama: "At-Tin", arab: "التين", ayat: 8, turun: "Makkiyah" },
  { id: 96, nama: "Al-'Alaq", arab: "العلق", ayat: 19, turun: "Makkiyah" },
  { id: 97, nama: "Al-Qadr", arab: "القدر", ayat: 5, turun: "Makkiyah" },
  { id: 98, nama: "Al-Bayyinah", arab: "البينة", ayat: 8, turun: "Madaniyah" },
  { id: 99, nama: "Az-Zalzalah", arab: "الزلزلة", ayat: 8, turun: "Madaniyah" },
  { id: 100, nama: "Al-'Adiyat", arab: "العاديات", ayat: 11, turun: "Makkiyah" },
  { id: 101, nama: "Al-Qari'ah", arab: "القارعة", ayat: 11, turun: "Makkiyah" },
  { id: 102, nama: "At-Takasur", arab: "التكاثر", ayat: 8, turun: "Makkiyah" },
  { id: 103, nama: "Al-'Asr", arab: "العصر", ayat: 3, turun: "Makkiyah" },
  { id: 104, nama: "Al-Humazah", arab: "الهمزة", ayat: 9, turun: "Makkiyah" },
  { id: 105, nama: "Al-Fil", arab: "الفيل", ayat: 5, turun: "Makkiyah" },
  { id: 106, nama: "Quraisy", arab: "قريش", ayat: 4, turun: "Makkiyah" },
  { id: 107, nama: "Al-Ma'un", arab: "الماعون", ayat: 7, turun: "Makkiyah" },
  { id: 108, nama: "Al-Kautsar", arab: "الكوثر", ayat: 3, turun: "Makkiyah" },
  { id: 109, nama: "Al-Kafirun", arab: "الكافرون", ayat: 6, turun: "Makkiyah" },
  { id: 110, nama: "An-Nasr", arab: "النصر", ayat: 3, turun: "Madaniyah" },
  { id: 111, nama: "Al-Lahab", arab: "المسد", ayat: 5, turun: "Makkiyah" },
  { id: 112, nama: "Al-Ikhlas", arab: "الإخلاص", ayat: 4, turun: "Makkiyah" },
  { id: 113, nama: "Al-Falaq", arab: "الفلق", ayat: 5, turun: "Makkiyah" },
  { id: 114, nama: "An-Nas", arab: "الناس", ayat: 6, turun: "Makkiyah" },
];

/** Surat yang umum dipilih (default): An-Nas, Al-Falaq, Al-Ikhlas, Al-Fatihah */
export const SURAT_DEFAULT = [114, 113, 112, 1];

/** Peta bahasa → edisi terjemahan di alquran.cloud (format: {lang}.{identifier} —
 *  JANGAN pakai awalan "quran." — API tidak mengenali & fallback ke Arab!) */
export const BAHASA: { kode: string; label: string; bendera: string; edisi: string }[] = [
  { kode: "id", label: "Indonesia", bendera: "🇮🇩", edisi: "id.indonesian" },
  { kode: "en", label: "Inggris (Amerika/UK)", bendera: "🇺🇸", edisi: "en.sahih" },
  { kode: "tr", label: "Turki", bendera: "🇹🇷", edisi: "tr.diyanet" },
  { kode: "ms", label: "Melayu", bendera: "🇲🇾", edisi: "ms.basmeih" },
  { kode: "fr", label: "Prancis", bendera: "🇫🇷", edisi: "fr.hamidullah" },
  { kode: "es", label: "Spanyol", bendera: "🇪🇸", edisi: "es.cortes" },
  { kode: "ur", label: "Urdu", bendera: "🇵🇰", edisi: "ur.jalandhry" },
  { kode: "bn", label: "Bengali", bendera: "🇧🇩", edisi: "bn.bengali" },
  { kode: "de", label: "Jerman", bendera: "🇩🇪", edisi: "de.aburida" },
  { kode: "ru", label: "Rusia", bendera: "🇷🇺", edisi: "ru.kuliev" },
  { kode: "zh", label: "Tionghoa", bendera: "🇨🇳", edisi: "zh.jian" },
];

export type AyatQ = { nomor: number; arab: string; arti: string };

const CACHE_KEY = "verve_quran_cache_v1";
type CacheEntry = { k: string; v: AyatQ[]; at: number };
function bacaCache(k: string): AyatQ[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const arr: CacheEntry[] = JSON.parse(raw);
    const e = arr.find((x) => x.k === k);
    if (e && Date.now() - e.at < 1000 * 60 * 60 * 24 * 30) return e.v;
    return null;
  } catch { return null; }
}
function tulisCache(k: string, v: AyatQ[]) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const arr: CacheEntry[] = raw ? JSON.parse(raw) : [];
    arr.unshift({ k, v, at: Date.now() });
    localStorage.setItem(CACHE_KEY, JSON.stringify(arr.slice(0, 60)));
  } catch { /* penuh — abaikan */ }
}

/** 🐛 v20.4: deteksi teks Arab (fallback API yang salah) — kalau "terjemahan"
 *  ternyata masih Arab, berarti edisi tidak dikenali → jangan dipakai. */
function teksArab(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s || "");
}

/** Ambil ayat satu surat (Arab + terjemahan) dari alquran.cloud. Cache 30 hari.
 *  🐛 v20.4: verifikasi terjemahan BUKAN Arab (edisi salah → API fallback Arab). */
export async function ambilAyatSurat(suratId: number, edisiTerjemahan: string): Promise<AyatQ[]> {
  const key = `${suratId}|${edisiTerjemahan}`;
  const c = bacaCache(key);
  if (c) return c;
  const url = `https://api.alquran.cloud/v1/surah/${suratId}/editions/quran-uthmani,${edisiTerjemahan}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Gagal ambil ayat (HTTP ${r.status})`);
  const j = await r.json();
  const arabEd = j?.data?.[0], artiEd = j?.data?.[1];
  if (!arabEd?.ayahs?.length) throw new Error("Data ayat kosong");
  const artiAman = artiEd?.ayahs?.length === arabEd.ayahs.length && !teksArab(artiEd.ayahs[0]?.text || "")
    ? artiEd.ayahs
    : null;
  if (!artiAman) {
    // edisi tidak dikenali → API fallback Arab. Coba sekali lagi pakai endpoint terpisah.
    const r2 = await fetch(`https://api.alquran.cloud/v1/surah/${suratId}/${edisiTerjemahan}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    const j2 = r2 && r2.ok ? await r2.json().catch(() => null) : null;
    const fallback = j2?.data?.ayahs;
    if (fallback && fallback.length === arabEd.ayahs.length && !teksArab(fallback[0]?.text || "")) {
      const out: AyatQ[] = arabEd.ayahs.map((a: any, i: number) => ({
        nomor: a.numberInSurah,
        arab: a.text,
        arti: fallback[i]?.text ?? "",
      }));
      tulisCache(key, out);
      return out;
    }
    throw new Error(`Terjemahan "${edisiTerjemahan}" tidak tersedia — coba pilih bahasa lain.`);
  }
  const out: AyatQ[] = arabEd.ayahs.map((a: any, i: number) => ({
    nomor: a.numberInSurah,
    arab: a.text,
    arti: artiAman[i]?.text ?? "",
  }));
  tulisCache(key, out);
  return out;
}

/** Ambil beberapa surat sekaligus (berurutan sesuai urutan pilihan). */
/** 📌 Item bacaan — urutan array = urutan baca (atas = duluan). */
export type ItemBacaan = {
  id: string;
  suratId: number;
  nama: string;
  arab?: string;
  /** rentang ayat (opsional) — mis. Ayat Kursi = { dari: 255, sampai: 255 } */
  dari?: number;
  sampai?: number;
};

/** Ayat Kursi (Al-Baqarah 255) — item siap pakai. */
export const ITEM_AYAT_KURSI: ItemBacaan = { id: "kursi", suratId: 2, nama: "Ayat Kursi (Al-Baqarah 255)", arab: "آية الكرسي", dari: 255, sampai: 255 };

/** Ambil ayat sesuai daftar item bacaan (urutan array = urutan baca). */
export async function ambilAyatBanyak(items: ItemBacaan[], edisi: string): Promise<{ suratId: number; nama: string; arab: string; ayat: AyatQ[] }[]> {
  const out: { suratId: number; nama: string; arab: string; ayat: AyatQ[] }[] = [];
  for (const it of items) {
    const s = DAFTAR_SURAT.find((x) => x.id === it.suratId);
    const semua = await ambilAyatSurat(it.suratId, edisi);
    let ayat = semua;
    const dari = it.dari && it.dari > 0 ? it.dari : 0;
    if (dari > 0) {
      ayat = semua.filter((a) => a.nomor >= dari && a.nomor <= (it.sampai || dari));
    }
    out.push({ suratId: it.suratId, nama: it.nama || s?.nama || `Surat ${it.suratId}`, arab: it.arab || s?.arab || "", ayat });
  }
  return out;
}

export type AyatGabung = { teks: string; arti: string; nomor: number; surat: string };

/** Gabungkan semua ayat dari beberapa surat jadi satu daftar berurutan (label surat di awal). */
export function gabungAyat(daftar: { suratId: number; nama: string; arab: string; ayat: AyatQ[] }[]): AyatGabung[] {
  const out: AyatGabung[] = [];
  for (const d of daftar) {
    for (const a of d.ayat) {
      out.push({ teks: a.arab, arti: a.arti, nomor: a.nomor, surat: d.nama });
    }
  }
  return out;
}
