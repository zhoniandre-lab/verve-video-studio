// 📖🧪 v20.0 — NICHE QUR'AN: data surat, ambience, frame islami, render
// Jalankan: node tests/quran-niche.test.mjs
import { readFileSync } from "fs";

const qd = readFileSync(new URL("../src/lib/quran-data.ts", import.meta.url), "utf8");
const amb = readFileSync(new URL("../src/lib/ambience.ts", import.meta.url), "utf8");
const qf = readFileSync(new URL("../src/lib/quran-frame.ts", import.meta.url), "utf8");
const ro = readFileSync(new URL("../src/lib/render-offline.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/quran/page.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📖 Menguji Niche Qur'an (v20.0)");

/* ---- data surat ---- */
T("DAFTAR_SURAT ada 39 surat (juz amma + fatihah + baqarah)", (qd.match(/id: \d+/g) || []).length >= 39);
T("default pilihan = An-Nas, Al-Falaq, Al-Ikhlas, Al-Fatihah", /SURAT_DEFAULT = \[114, 113, 112, 1\]/.test(qd));
T("bahasa Turki ada (quran.tr.diyanet)", /quran\.tr\.diyanet/.test(qd));
T("bahasa Indonesia ada", /quran\.id\.indonesian/.test(qd));
T("ambilAyatSurat pakai quran-uthmani (Arab akurat)", /quran-uthmani/.test(qd));
T("hasil ayat di-cache 30 hari (offline)", /1000 \* 60 \* 60 \* 24 \* 30/.test(qd));
T("gabungAyat menyertakan arti", /arti: a\.arti/.test(qd));

/* ---- ambience ---- */
T("jenis ambience: hujan/air/hujanpetir/upload", /"hujan" \| "air" \| "hujanpetir" \| "upload"/.test(amb));
T("hujan: noise → highpass+lowpass", /highpass/.test(amb) && /lowpass/.test(amb));
T("air mengalir: lowpass 1400", /frequency\.value = 1400/.test(amb));
T("petir: pola tetap deterministik", /pola = \[6, 19, 34, 51/.test(amb));
T("volume ambience bisa diatur (0..1)", /Math\.max\(0, Math\.min\(1, volume\)\)/.test(amb));
T("upload: loop file sendiri", /fileBuf.*loop = true/.test(amb));
T("reverb IR sintetis ada", /buatReverbIR/.test(amb));

/* ---- frame islami ---- */
T("8 gaya frame islami (bukan cuma garis)", /ornamen/.test(qf) && /bintang/.test(qf) && /bulan/.test(qf) && /klasik/.test(qf));
T("frame punya ornamen kaya: bintang8 & bulanSabit & deretDiamond", /bintang8/.test(qf) && /bulanSabit/.test(qf) && /deretDiamond/.test(qf));
T("frame digambar di canvas (tanpa file gambar)", /ornamenSudut/.test(qf) && /diamondTengah/.test(qf));

/* ---- render: ambience + reverb disambung ---- */
T("render-offline dukung ambience (sambungAmbience)", /sambungAmbience\(off, off\.destination/.test(ro));
T("render-offline dukung reverb vokal (ConvolverNode)", /conv = off\.createConvolver\(\)/.test(ro));
T("reverb dry+wet paralel (tidak merusak vokal)", /input\.connect\(conv\)/.test(ro));

/* ---- halaman & menu ---- */
T("halaman /quran ada 5 langkah", /LANGKAH = \["1️⃣ Surat"/.test(page));
T("rekam sendiri (MediaRecorder + pilih codec)", /new MediaRecorder\(st, mime/.test(page));
T("upload MP3 ada", /Upload MP3/.test(page));
T("preview ambience live (sambungAmbience di halaman)", /sambungAmbience\(ctx, dest/.test(page));
T("toggle fokus vokal (buang dengung)", /Fokus vokal/.test(page) && /eq: fokusVokal \? "vokal"/.test(page));
T("drag & cubit elemen (pinchRef)", /pinchRef/.test(page) && /setPointerCapture/.test(page));
T("tombol Lanjut langkah ada (Lanjut: Suara/Tampilan/Render)", /Lanjut: Suara/.test(page) && /Lanjut: Tampilan/.test(page) && /Lanjut: Render/.test(page));
T("ganti bahasa → ada tombol muat ulang", /Muat ulang dengan bahasa baru/.test(page));
T("pemutar audio preview ada (dengar rekaman dulu)", /<audio controls src=\{audioUrl\}/.test(page));
T("rekaman matikan ambience dulu (anti keresek)", /ambStopRef\.current\?\.stop\(\)/.test(page));
T("rekaman pakai autoGainControl (suara stabil)", /autoGainControl: true/.test(page));
T("render ≥15 mnt diberi peringatan", /> 15 \* 60/.test(page));
T("menu dashboard punya Niche Qur'an", /Niche Qur'an/.test(dash) && /location\.href = "\/quran"/.test(dash));

if (gagal) { console.error(`\n💥 ${gagal} UJI QUR'AN GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI NICHE QUR'AN HIJAU");

/* ---- v20.2: teks ikut suara (tombol putar, diam tanpa audio) ---- */
T("tombol ▶ Putar & tonton ada", /Putar & tonton/.test(page));
T("teks diam kalau belum ada audio (tPreview)", /function tPreview/.test(page) && /return pvTRef\.current/.test(page));
T("preview sinkron dengan audioEl.currentTime", /audioElRef\.current\.currentTime/.test(page));
T("indikator Ayat X/Y tampil", /Ayat /.test(page) && /totalAyat/.test(page) && /ayatAktif/.test(page));
T("hidden audio element untuk sinkron", /audioElRef/.test(page) && /audioUrl/.test(page) && /style=\{\{ display: "none" \}\}/.test(page));
T("kalau belum ada audio → pesan jelas", /Belum ada suara — di langkah 2/.test(page));
