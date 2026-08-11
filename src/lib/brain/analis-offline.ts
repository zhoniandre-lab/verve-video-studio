/* 👨‍🏫 v19.60 ANALIS CHANNEL — JAWABAN OFFLINE (mesin aturan)
   Dipakai saat AI online gagal (internet/key mati): jawab pertanyaan user
   dengan template CERDAS berbasis data channel — bukan basa-basi.
   Murni (diuji di tests/). */

export type AnalisData = {
  title?: string;
  views?: number;
  watchTimeHours?: number;
  ctrPct?: number;
  retention30Pct?: number;
  subs?: number;
  returningPct?: number;
  impressions?: number;
  traffic?: { label: string; pct: number }[];
};

// format Indonesia: koma desimal, titik ribuan
const idNum = (n: number, dec = 0) => n.toLocaleString("id-ID", { maximumFractionDigits: dec });
function fmt(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".", ",")} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",")} rb`;
  return idNum(n);
}
const pct = (n: number | undefined | null) => (n == null || !Number.isFinite(n) ? "?" : `${(Math.round(n * 10) / 10).toString().replace(".", ",")}%`);

/** Jawab offline: cek kata kunci pertanyaan → jawab pakai data. Jujur kalau data kurang. */
export function jawabOffline(d: AnalisData, pertanyaan: string): string {
  const q = String(pertanyaan || "").toLowerCase();
  const ada = (v: number | undefined | null) => v != null && Number.isFinite(v);
  const topTraffic = (d.traffic || []).slice(0, 2).map((t) => `${t.label} ${t.pct}%`).join(" · ");

  // 🔁 penonton kembali
  if (/(penonton kembali|balik lagi|kembali|returning|orang nggak balik|penonton baru)/.test(q)) {
    if (!ada(d.returningPct)) return "Bro, buat jawab ini aku butuh angka **Penonton kembali %** (tab Audiens di YouTube Studio — 'Penonton biasa'). Isi kolom itu dulu, nanti aku analisis lebih tajam. 📊";
    const r = d.returningPct!;
    if (r >= 15) return `Penonton kembali lo ${pct(r)} — ini SUDAH di atas ambang sehat (15%). Artinya channel lo mulai jadi komunitas, bukan singgahan. 🎉 Pertahankan: rutin upload, end screen saling nyambung, dan balas komentar. Sekarang tinggal perbanyak varian tema yang sama biar makin nempel.`;
    return `Penonton kembali lo cuma ${pct(r)} — di bawah ambang sehat 15%. Artinya dari 100 orang yang nonton, cuma ~${Math.round(r)} yang balik lagi; sisanya mampir sekali lalu pergi. Penyebab paling umum: (1) CTA subscribe lemah — orang nggak diingetin buat langganan, (2) video nggak saling nyambung — habis nonton, nggak ada yang ngarahin ke video lo yang lain, jadinya pergi ke channel sebelah. Step by step: 1) Pasang end screen di tiap video → arahin ke video lain lo (2 elemen video + 1 subscribe). 2) Minta subscribe di detik 10–20 (pas 86% penonton masih nempel). 3) Bikin playlist sendiri biar orang muter beruntun. Target 2 minggu: 15%. 📈`;
  }

  // 🎯 CTR
  if (/(ctr|klik|click|thumbnail|judul|packaging|rasio klik)/.test(q)) {
    if (!ada(d.ctrPct)) return "Buat nilai CTR aku butuh angka **CTR %** (bisa dari koneksi YouTube/screenshot/manual). Isi dulu ya bro, baru aku kasih resep yang pas. 🎯";
    const c = d.ctrPct!;
    if (c >= 5) return `CTR lo ${pct(c)} — di atas ambang 5%, ini KELAS ATAS untuk konten long-form. Packaging lo (thumbnail + judul) menang di feed. 🏆 Jangan ganti formula: wajah + emosi + teks 3 kata + kontras. Sekarang fokusnya pindah ke bikin orang BETAH (retensi) & BALIK (penonton kembali).`;
    if (c >= 3) return `CTR lo ${pct(c)} — masuk zona kuning (target 5%+). Packaging lo oke tapi belum menang telak. Coba: (1) Thumbnail pakai WAJAH dengan ekspresi jelas + teks maks 3 kata besar. (2) Judul pakai pola [Emosi] + [Aku/Kamu] + (kurung penasaran) — misal "IBU Aku Kangen (Lagu yang Bikin Menyesal)". (3) Pakai fitur Uji Thumbnail YouTube: upload 3 versi, biarkan data yang milih. Target: 5%+.`;
    return `CTR lo ${pct(c)} — di bawah 3%, ini MERAH. Artinya dari banyak orang yang lihat thumbnail lo, hampir nggak ada yang klik. Masalahnya di PACKAGING, bukan isi. Step by step: 1) Ganti thumbnail: wajah dengan ekspresi kuat + latar kontras + teks gede maks 3 kata ("IBU AKU KANGEN"). 2) Judul: emosi di depan + kurung penasaran. 3) Pakai fitur Uji Thumbnail (3 versi). 4) Cek thumbnail lo di ukuran HP — kalau nggak kebaca dalam 1 detik, ganti. Target: 5%.`;
  }

  // ⏱ retensi
  if (/(retensi|retention|betah|hook|awal|durasi tonton|keluar)/.test(q)) {
    if (!ada(d.retention30Pct)) return "Buat analisis retensi aku butuh angka **Retensi %** (Rata-rata durasi tonton / durasi video). Isi kolomnya dulu ya bro. ⏱";
    const r = d.retention30Pct!;
    if (r >= 60) return `Retensi lo ${pct(r)} — ini TOP 10% untuk long-form (ambang sehat 60%)! Orang yang nonton BETAH banget. 🎉 Isi lo juara — pertahankan gaya cerita + musiknya. Yang perlu diperhatikan sekarang: pastikan 30 detik PERTAMA langsung masuk cerita (hook), biar yang baru datang juga nempel.`;
    if (r >= 40) return `Retensi lo ${pct(r)} — masuk zona kuning (40–60%). Isi oke tapi belum bikin orang tahan sampai habis. Cek 2 hal: (1) 3 detik pertama — harus langsung masuk cerita/emosi, jangan basa-basi. (2) Jeda antar bagian — kalau ada bagian panjang yang datar, potong/percepat. Target: 60%.`;
    return `Retensi lo ${pct(r)} — di bawah 40%, ini MERAH. Orang masuk tapi cepet keluar. Penyebab paling umum di konten cerita/lagu: (1) Hook 3 detik pertama lambat — penonton nggak langsung dapat "kenapa harus nonton ini". (2) Intro kebanyakan basa-basi. Step by step: 1) Pindahkan momen paling emosional ke 3 detik PERTAMA. 2) Potong semua bagian yang nggak mendukung cerita. 3) Jaga lagu/visual tetap sinkron dari awal. Target: 60%.`;
  }

  // ➕ subscriber / konversi
  if (/(subscriber|subscribe|langganan|konversi|followers)/.test(q)) {
    const conv = ada(d.views) && ada(d.subs) && d.views! > 0 ? (d.subs! / d.views!) * 100 : null;
    if (conv == null) return "Buat analisis subscriber aku butuh angka **Views** & **Subscriber +**. Isi dulu ya bro. ➕";
    if (conv >= 2) return `Konversi subscriber lo ${pct(conv)} (${fmt(d.subs)} sub dari ${fmt(d.views)} views) — di atas ambang sehat 2%, bagus! 🎉 Orang yang nonton lo mau langganan. Tinggal perbanyak exposure (CTR + retensi) biar makin banyak yang masuk.`;
    return `Konversi subscriber lo ${pct(conv)} (${fmt(d.subs)} sub dari ${fmt(d.views)} views) — di bawah ambang 2%. Artinya banyak yang nonton tapi nggak diingetin buat subscribe. Step by step: 1) Minta subscribe di detik 10–20, bukan cuma di akhir: "Kalau suka lagu kayak gini, subscribe dulu ya — gratis, biar nggak ketinggalan part selanjutnya." 2) Pasang end screen subscribe. 3) Bikin SERI (Part 1, Part 2...) biar orang mau langganan biar nggak ketinggalan. Target: 2%.`;
  }

  // 🕐 waktu tonton / monetisasi
  if (/(waktu tonton|watch time|monetisasi|jam tonton|4.000 jam|4000 jam)/.test(q)) {
    if (!ada(d.watchTimeHours)) return "Buat analisis waktu tonton aku butuh angka **Waktu tonton (jam)** (rentang 28 hari di Ringkasan Studio). Isi dulu ya bro. 🕐";
    const perHari = d.watchTimeHours! / 28;
    if (perHari >= 11) return `Waktu tonton lo ${fmt(d.watchTimeHours)} jam/28 hari = ±${Math.round(perHari)} jam/HARI — ini ${Math.round(perHari / 11)}× di atas ambang monetisasi (11 jam/hari). 💰 Channel lo dari sisi jam tonton sudah layak YPP. Tinggal kejar subscriber 1.000 (CTA subscribe) & jaga konsistensi.`;
    return `Waktu tonton lo ${fmt(d.watchTimeHours)} jam/28 hari = ±${Math.round(perHari)} jam/hari. Ambang monetisasi = 11 jam/hari, jadi masih ${perHari >= 4 ? "mendekati" : "jauh dari"} target. Biar naik: perbaiki CTR (biar makin banyak masuk) + retensi (biar makin lama nonton) — dua-duanya naik, jam tonton otomatis naik.`;
  }

  // 📈 views naik/turun
  if (/(views|penayangan|view|rame|sepi|naik|turun)/.test(q)) {
    if (!ada(d.views)) return "Buat analisis views aku butuh angka **Views** dulu bro. Isi kolomnya, nanti aku bedah. 👁";
    const parts = [`Views lo ${fmt(d.views)}.`];
    if (ada(d.ctrPct)) parts.push(d.ctrPct! >= 5 ? `CTR ${pct(d.ctrPct)} = packaging kuat.` : `CTR ${pct(d.ctrPct)} = packaging masih jadi ganjalan (target 5%).`);
    if (ada(d.retention30Pct)) parts.push(d.retention30Pct! >= 60 ? `Retensi ${pct(d.retention30Pct)} = isi juara.` : `Retensi ${pct(d.retention30Pct)} = isi perlu dirapikan (target 60%).`);
    parts.push("Step by step: 1) Kalau CTR rendah → ganti thumbnail/judul (pakai fitur Uji Thumbnail). 2) Kalau retensi rendah → perbaiki hook 3 detik. 3) Kalau dua-duanya oke → perbanyak varian tema yang sama + end screen saling nyambung biar 1 video yang rame narik video lain.");
    return parts.join(" ");
  }

  // 🎬 konten baru / ide
  if (/(konten baru|ideo|bikin video|part 2|lanjutan|judul baru|mau bikin)/.test(q)) {
    return "Buat ide konten yang pas, aku saranin ngaca ke video lo yang PALING MELEDAK — dari data yang udah lo analisis. Pola umum yang bikin konten cerita/lagu nembus: (1) tema emosional dekat (ibu/ayah/rindu/kampung), (2) judul [Emosi] + (kurung penasaran), (3) thumbnail wajah + teks 3 kata, (4) durasi 5–7 menit, (5) hook 3 detik langsung masuk cerita. Coba: 'IBU Aku Kangen (Part 2) — Air Mata di Keheningan Malam' atau 'Surat Untuk Ibu di Surga (Lagu yang Bikin Haru)'. Pasang end screen ke video yang meledak biar dapat alirannya. 🎬";
  }

  // generik
  const punya = [ada(d.ctrPct) ? `CTR ${pct(d.ctrPct)}` : null, ada(d.retention30Pct) ? `retensi ${pct(d.retention30Pct)}` : null, ada(d.returningPct) ? `penonton kembali ${pct(d.returningPct)}` : null, ada(d.watchTimeHours) ? `waktu tonton ${fmt(d.watchTimeHours)} jam/28hr` : null].filter(Boolean).join(" · ");
  return `Bro, dari data yang ada${punya ? ` (${punya})` : " (belum ada angka yang diisi — isi dulu kolom di Langkah 2 biar analisisku tajam)"}, prinsipnya channel naik lewat 3 pintu: (1) Packaging — CTR ≥5% (thumbnail+judul), (2) Isi — retensi ≥60% (hook 3 detik + cerita), (3) Komunitas — penonton kembali ≥15% (end screen + CTA subscribe + playlist). Kalau salah satu merah, benahi yang itu dulu; sisanya pertahankan. Mau tanya spesifik yang mana? (ctr/retensi/subscriber/penonton kembali/ide konten) 👍`;
}
