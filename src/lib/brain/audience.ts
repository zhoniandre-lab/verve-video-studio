/**
 * VERVE AUDIENCE BRAIN v1 — kartu audiens berbasis aturan (tanpa API, tanpa ngarang).
 * Diport dari audience-brain YIE v23. story_song ditaruh paling depan karena
 * Lahan Awalan fokus niche "Cerita Jadi Lagu".
 *
 * Aturan produk: modul ini TIDAK mengarang metrik YouTube. Ia memberi konteks
 * audiens, CTA, saran thumbnail, jam upload, dan risiko — semuanya heuristik
 * yang bisa diaudit.
 */

import { norm, cap } from "./yie-score";

export type AudienceCard = {
  label: string;
  keys: string[];
  audience: string;
  age: string;
  device: string;
  goal: string[];
  fears: string[];
  desires: string[];
  ctas: string[];
  thumb: string;
  upload: string;
};

export const INTENTS: Record<string, AudienceCard> = {
  story_song: {
    label: "Cerita jadi lagu / lagu emosional",
    keys: ["cerita jadi lagu", "lagu sedih", "lirik sedih", "lagu ibu", "lagu ayah", "musik sedih"],
    audience: "penonton emosional yang mencari lagu/cerita menyentuh",
    age: "18-45",
    device: "HP",
    goal: ["healing", "menangis lega", "mengenang orang tua/keluarga", "mendengar lagu sampai selesai"],
    fears: ["kehilangan orang tua", "terlambat meminta maaf", "rindu yang tidak tersampaikan"],
    desires: ["tersentuh", "merasa dipahami", "mendapat ruang untuk meluapkan emosi"],
    ctas: ["Tulis satu doa untuk ibu/ayah di komentar", "Dengarkan sampai akhir jika pernah merasakan ini", "Share ke orang yang sedang rindu keluarganya"],
    thumb: "wajah emosi besar, air mata, cahaya hangat, ruang teks kanan, jangan horor/DJ",
    upload: "18:00-22:00, terutama malam Jumat/Sabtu/Minggu saat orang lebih emosional dan santai",
  },
  family: {
    label: "Keluarga emosional",
    keys: ["ibu", "ayah", "mama", "bunda", "orang tua", "anak", "rindu", "maaf", "doa", "sedih"],
    audience: "remaja/dewasa yang dekat dengan tema keluarga, rindu, maaf, dan penyesalan",
    age: "18-45",
    device: "HP",
    goal: ["healing", "refleksi", "mencari cerita yang menyentuh"],
    fears: ["kehilangan", "menyesal terlambat sadar", "tidak sempat membahagiakan orang tua"],
    desires: ["menangis lega", "lebih menghargai keluarga", "merasa tidak sendirian"],
    ctas: ["Komentar satu kalimat untuk ibu/ayah", "Kirim video ini ke orang yang kamu sayang", "Subscribe untuk kisah keluarga menyentuh"],
    thumb: "close-up ekspresi sedih/menyesal, warna hangat, teks pendek 2-4 kata",
    upload: "18:00-22:00 WIB, akhir pekan biasanya lebih cocok untuk konten emosional",
  },
  horror: {
    label: "Horor / cerita mistis",
    keys: ["hantu", "horor", "horror", "mistis", "angker", "pocong", "kuntilanak", "rumah kosong", "ghost", "haunted"],
    audience: "penonton yang mencari rasa takut, penasaran, dan cerita malam",
    age: "16-35",
    device: "HP + TV",
    goal: ["hiburan malam", "rasa penasaran", "cerita seram sebelum tidur"],
    fears: ["sendirian malam hari", "suara misterius", "rumah kosong", "sosok tak terlihat"],
    desires: ["tegang", "penasaran sampai akhir", "mendapat twist cerita"],
    ctas: ["Komentar kalau kamu berani nonton sendirian", "Subscribe untuk cerita horor malam berikutnya", "Share ke teman yang takut gelap"],
    thumb: "kontras gelap, siluet, pintu/suara, mata takut, teks larangan seperti JANGAN BUKA",
    upload: "20:00-23:30, cocok malam hari saat mood horor naik",
  },
  dj: {
    label: "DJ / remix",
    keys: ["dj", "remix", "full bass", "jedag", "jedug", "tiktok", "nonstop", "bass"],
    audience: "pendengar musik remix yang butuh beat untuk aktivitas, santai, party, atau perjalanan",
    age: "13-34",
    device: "HP + speaker/headset",
    goal: ["musik", "teman aktivitas", "party", "mencari sound viral"],
    fears: ["beat kurang nendang", "audio pecah", "judul tidak sesuai isi"],
    desires: ["bass kuat", "versi viral", "durasi enak diputar ulang"],
    ctas: ["Komentar request DJ berikutnya", "Subscribe untuk remix full bass terbaru", "Putar pakai headset/speaker biar bass terasa"],
    thumb: "neon, speaker, DJ booth, warna cyan/magenta, teks FULL BASS/VIRAL",
    upload: "16:00-22:00, Jumat-Minggu cocok untuk musik hiburan",
  },
  tutorial: {
    label: "Tutorial / edukasi praktis",
    keys: ["cara", "tutorial", "tips", "belajar", "how to", "pemula", "buat", "setting"],
    audience: "pemula yang butuh solusi cepat dan jelas",
    age: "17-40",
    device: "HP + laptop",
    goal: ["belajar", "menyelesaikan masalah", "mengikuti langkah praktis"],
    fears: ["bingung", "takut salah langkah", "buang waktu"],
    desires: ["langsung bisa", "panduan singkat", "hasil terlihat"],
    ctas: ["Simpan video ini untuk dipraktikkan", "Komentar bagian yang masih bingung", "Subscribe untuk tutorial praktis berikutnya"],
    thumb: "visual jelas, before-after, angka langkah, teks besar maksimal 4 kata",
    upload: "07:00-10:00 atau 19:00-21:00 saat orang mencari solusi",
  },
  muslim: {
    label: "Muslim / religi",
    keys: ["murottal", "quran", "alquran", "doa", "sholawat", "dzikir", "muslim", "islam", "rezeki", "toko sepi"],
    audience: "penonton muslim yang mencari ketenangan, doa, murottal, atau suasana religius",
    age: "18-55",
    device: "HP + speaker/toko/TV",
    goal: ["religi", "healing", "ketenangan", "diputar di rumah/usaha"],
    fears: ["hati gelisah", "usaha sepi", "rumah/toko terasa berat"],
    desires: ["tenang", "berkah", "semangat ibadah", "suasana damai"],
    ctas: ["Putar setiap pagi sebelum mulai aktivitas", "Tulis Aamiin jika ikut berdoa", "Share ke keluarga atau teman yang butuh ketenangan"],
    thumb: "cahaya hangat, mushaf/masjid/toko damai, jangan klaim berlebihan",
    upload: "04:30-07:00, 11:30-13:00, atau 18:00-21:00",
  },
  facts: {
    label: "Fakta unik / wawasan ringan",
    keys: ["fakta", "unik", "jarang diketahui", "misteri dunia", "pengetahuan", "tubuh manusia"],
    audience: "pelajar dan penonton umum yang ingin hiburan singkat plus wawasan",
    age: "13-35",
    device: "HP",
    goal: ["hiburan singkat", "menambah wawasan", "bahan obrolan"],
    fears: ["bosan", "konten terlalu berat", "informasi bertele-tele"],
    desires: ["cepat paham", "terkejut", "dapat fakta baru"],
    ctas: ["Share ke teman yang suka fakta unik", "Komentar fakta nomor berapa yang paling kaget", "Subscribe untuk fakta singkat lainnya"],
    thumb: "angka besar, objek jelas, warna kontras, teks 2-4 kata",
    upload: "12:00-14:00 atau 18:00-21:00",
  },
};

const GENERAL_CARD: AudienceCard = {
  label: "Umum",
  keys: [],
  audience: "penonton umum — niche belum spesifik",
  age: "13-45",
  device: "HP",
  goal: ["hiburan", "jawaban cepat"],
  fears: ["bosan", "waktu terbuang"],
  desires: ["tertarik sejak detik awal"],
  ctas: ["Komentar pendapatmu", "Subscribe untuk konten berikutnya"],
  thumb: "visual jelas, teks besar, kontras tinggi",
  upload: "18:00-21:00",
};

export function audienceCard(intentId: string): AudienceCard {
  return INTENTS[intentId] || GENERAL_CARD;
}

export function detectAudienceIntent(textInput: string): string {
  const text = norm(textInput);
  if (!text) return "general";
  if (/cerita jadi lagu|lagu sedih|lirik sedih|lagu ibu|lagu ayah/.test(text)) return "story_song";
  const scores: Record<string, number> = {};
  Object.entries(INTENTS).forEach(([id, cfg]) => {
    scores[id] = 0;
    (cfg.keys || []).forEach((k) => {
      const nk = norm(k);
      if (nk && text.includes(nk)) scores[id] += nk.split(" ").length > 1 ? 18 : 10;
    });
  });
  if (/ibu|ayah|mama|bunda|rindu|maaf|menyesal|anak/.test(text) && !/dj|remix|bass/.test(text)) {
    scores.family = (scores.family || 0) + 24;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] <= 0) return "general";
  return best[0];
}

export function dominantEmotion(intentId: string): string {
  return ({
    story_song: "haru, rindu, penyesalan",
    family: "rindu, maaf, haru",
    horror: "takut, penasaran, tegang",
    dj: "semangat, hype, energi",
    tutorial: "bingung → lega",
    muslim: "tenang, berharap, religius",
    facts: "penasaran, terkejut",
    general: "penasaran / kebutuhan cepat",
  } as Record<string, string>)[intentId] || "penasaran";
}

export function watchActivity(intentId: string): string {
  return ({
    story_song: "sendiri, malam hari, pakai headset, sambil healing",
    family: "sendiri/keluarga, sering malam hari",
    horror: "malam hari, sendirian atau bareng teman",
    dj: "sambil aktivitas, perjalanan, kerja, santai, party",
    tutorial: "sambil praktik di HP/laptop",
    muslim: "diputar di rumah, toko, perjalanan, atau saat ibadah ringan",
    facts: "scroll santai, istirahat, sekolah/kampus",
    general: "scroll santai atau mencari jawaban cepat",
  } as Record<string, string>)[intentId] || "scroll santai";
}

export function solutionFor(intentId: string): string {
  return ({
    story_song: "buat cerita/lagu yang langsung menyentuh masalah emosi audiens, dengan hook kuat sejak awal",
    family: "angkat konflik keluarga yang spesifik lalu beri ruang refleksi/haru",
    horror: "bangun rasa takut dari objek sederhana, jaga misteri sampai akhir",
    dj: "beri audio yang sesuai janji judul: bass, viral, nonstop, atau mood tertentu",
    tutorial: "beri langkah praktis, contoh visual, dan hasil akhir yang jelas",
    muslim: "beri suasana tenang dan arahan pemakaian tanpa klaim berlebihan",
    facts: "beri fakta singkat, visual jelas, dan urutan yang bikin penasaran",
    general: "perjelas masalah audiens sebelum membuat konten",
  } as Record<string, string>)[intentId] || "perjelas masalah audiens sebelum membuat konten";
}

export function monetizationHint(intentId: string): string {
  return ({
    story_song: "playlist lagu/cerita emosional, membership request lagu, digital product lirik/backsound bila legal",
    family: "playlist kisah emosional, membership/supporter, kompilasi cerita",
    horror: "playlist series horor, membership cerita malam, live premiere",
    dj: "playlist remix, request remix, live set; pastikan hak cipta aman",
    tutorial: "affiliate tools, template, kelas, konsultasi",
    muslim: "playlist murottal/dzikir, donasi/support; hindari klaim spiritual berlebihan",
    facts: "Shorts funnel ke long-form, sponsorship edukasi ringan",
    general: "tentukan niche dulu agar monetisasi lebih jelas",
  } as Record<string, string>)[intentId] || "tentukan niche dulu agar monetisasi lebih jelas";
}

export function deviceAdvice(device: string): string[] {
  const d = norm(device);
  if (d.includes("hp") || d.includes("mobile") || d.includes("phone")) {
    return ["teks thumbnail besar", "opening 3 detik harus jelas", "jangan pakai detail kecil", "kontras tinggi"];
  }
  if (d.includes("tv")) return ["visual besar dan sinematik", "judul jangan terlalu kecil di thumbnail", "audio harus bersih"];
  if (d.includes("laptop")) return ["struktur jelas", "detail boleh lebih lengkap", "chapter/outline membantu"];
  return ["mobile-first", "teks besar", "visual jelas", "pembukaan cepat"];
}

export type ContentIdea = {
  problem: string; solution: string; content: string;
  title_seed: string; thumbnail: string; cta: string; audience_score: number;
};

export function buildContentIdeas(intentId: string, seed: string): ContentIdea[] {
  const cfg = audienceCard(intentId);
  const base = cap(seed) || cfg.label;
  const ideas: ContentIdea[] = [];
  const add = (problem: string, solution: string, content: string, title_seed: string, thumbnail: string, cta: string, audience_score: number) =>
    ideas.push({ problem, solution, content, title_seed, thumbnail, cta, audience_score });

  if (intentId === "story_song" || intentId === "family") {
    add("rindu/penyesalan kepada orang tua", "buat konten yang memberi ruang emosi", `Cerita emosional dari sudut pandang anak/orang tua: ${base}`, "Maaf Ibu, Aku Terlambat Mengerti", "wajah menangis, cahaya hangat, teks TERLAMBAT MINTA MAAF", cfg.ctas[0], 92);
    add("butuh lagu sedih yang relate", "pakai hook lagu + cerita", `${base} dibuat sebagai cerita jadi lagu`, `${base} | Cerita Jadi Lagu`, "cover art emosional, ruang teks kanan", cfg.ctas[1] || cfg.ctas[0], 88);
  } else if (intentId === "horror") {
    add("ingin sensasi takut/penasaran", "bangun misteri dari awal", `Cerita horor dengan opening suara/pintu: ${base}`, "Jangan Buka Pintu Setelah Tengah Malam", "pintu gelap, siluet, teks JANGAN BUKA", cfg.ctas[0], 91);
    add("mencari kisah seram singkat", "buat twist akhir", `${base} dengan twist di 30 detik terakhir`, "Suara Itu Datang dari Rumah Kosong", "rumah kosong, cahaya biru dingin", cfg.ctas[1], 86);
  } else if (intentId === "dj") {
    add("butuh musik enak diputar", "tekankan bass/viral/nonstop", `${base} versi full bass`, `${base} Full Bass Viral`, "neon DJ, speaker, teks FULL BASS", cfg.ctas[0], 88);
    add("mencari remix terbaru", "pakai tahun/trend", `DJ/remix trend dari ${base}`, `DJ ${base} Viral TikTok`, "warna cyan magenta, efek energi", cfg.ctas[1], 84);
  } else if (intentId === "tutorial") {
    add("bingung mulai dari mana", "beri langkah praktis", `Tutorial step-by-step: ${base}`, `Cara ${base} untuk Pemula`, "before-after, angka 1-2-3, teks besar", cfg.ctas[0], 90);
    add("ingin hasil cepat", "beri checklist", `Checklist cepat agar ${base} berhasil`, `3 Kesalahan Saat ${base}`, "ikon warning + contoh jelas", cfg.ctas[1], 84);
  } else if (intentId === "muslim") {
    add("hati gelisah/ingin tenang", "beri audio/visual religi yang damai", `${base} untuk ketenangan`, `${base} Penenang Hati`, "cahaya hangat, mushaf/masjid/toko damai", cfg.ctas[0], 88);
    add("butuh diputar saat aktivitas/usaha", "beri instruksi pemakaian", `${base} diputar pagi/sore`, `${base} untuk Suasana Tenang`, "toko/rumah damai, tidak berlebihan klaim", cfg.ctas[1], 82);
  } else if (intentId === "facts") {
    add("butuh hiburan singkat berwawasan", "buat daftar fakta cepat", `Fakta singkat tentang ${base}`, `7 Fakta ${base} yang Jarang Diketahui`, "angka besar + objek jelas", cfg.ctas[0], 86);
    add("ingin sesuatu yang mengejutkan", "mulai dari fakta paling aneh", `${base} dari sudut yang mengejutkan`, `${base}: Nomor 3 Bikin Kaget`, "ekspresi kaget + visual kontras", cfg.ctas[1], 80);
  }
  return ideas;
}

/** Catatan jujur: data yang TIDAK tersedia dari API publik. */
export const DATA_GAPS = [
  "Demografi real channel perlu divalidasi dari YouTube Analytics.",
  "CTR dan retensi kompetitor tidak tersedia di API publik.",
  "Jam upload terbaik harus diuji dari histori channel sendiri.",
];
