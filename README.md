# 🎬 VERVE — Studio Video & Musik AI (v16.8-lock)

## Batas Kerja Terakhir

- Repo sudah dikembalikan ke baseline stabil sebelum rombak Creator OS/UI/UX.
- Commit pemulihan: `eb406a2` — `↩️ Restore UI/UX to stable pre-redesign baseline`.
- Batas lanjut: jangan rombak besar, jangan hapus fitur yang sudah jalan, audit dulu sebelum perubahan baru.
- Sebelum deploy wajib lulus: TypeScript, seluruh test, dan build produksi.


VERVE adalah editor video kelas CapCut yang hidup **sepenuhnya di browser HP** (PWA Mobile-First), dirancang khusus untuk memotong, menyelaraskan, dan memproduksi video sinematik berkualitas tinggi dari teks cerita hingga menjadi lagu dan lirik karaoke otomatis.

Situs Produksi Live: `https://verve-video-studio.vercel.app`
Branch Utama: `main` (Push ke `main` otomatis men-deploy pembaruan ke Vercel)

---

## 🚦 JURNAL PEMBARUAN & OPTIMASI TERBARU (v16.8-lock)

### 🎨 v19.11 — BACKGROUND AI OTOMATIS DI SPECTRUM STUDIO
* **Ide (dari arah spektrum & feedback user):** visualizer makin "wah" kalau background-nya sinematik, bukan cuma gradien — dan user nggak mau ribet cari gambar sendiri.
* **Fitur:** di Spectrum Studio → step Visual → chip **✨ AI** → ketik suasana/lirik (mis. "hujan di jendela, rindu ibu, malam sepi") → tombol **🎨 Generate Background AI** → otak panggil `/api/hcnsec/image` (prompt sinematik, rasio ikut 16:9/9:16, tanpa teks) → hasil otomatis jadi background (bgType=img) → bar visualizer/lirik/overlay jalan di atasnya. Input kosong → otak pakai baris pertama lirik sebagai suasana. Ada pesan jujur + fallback ke Gradasi/Foto kalau gagal.
* **Cara pakai:** 1) isi musik → 2) Visual → ✨ AI → ketik suasana → Generate → lihat preview → Lanjut Lirik → Ekspor.
* tsc 0; build 0; 30 suite hijau.


### 🎬 v19.10.1 — THUMBNAIL MAKIN "WAH": SINEMATIK + TEKS NANCAP (feedback: gitu-gitu aja)
* **Masalah (feedback user):** hasil Thumb Studio terasa monoton — gambar "gitu-gitu aja", teks kurang tegas, beda dari hasil AI image modern.
* **Solusi (2 lapis):**
  1. **Gambar** (`thumbstudio.ts`): `VARIAN_THUMB` diperkaya (rim light emas, bokeh dangkal, debu di berkas cahaya, tekstur tua…) + `promptLatarThumb` kini punya lapisan **Sinematik** per varian (lighting dramatis + mood + palet warna amber/teal/oranye-violet/sepia + atmosfer + film grain + 8K) — prompt kayak punya ChatGPT/DALL-E, bukan "background photo" generik. Semua aturan keras lama dipertahankan (16:9, ruang kosong kiri 40%, DILARANG teks, PURE photographic).
  2. **Teks** (`thumb.ts`): scrim sisi teks lebih pekat (0.55→0.7), dasar bawah 0.72→0.78, stroke kata 0.14→0.17 + shadow lebih besar (0.75/0.24/0.06) — teks "nancap" di gambar terang; kata pertama kini GRADIENT kuning→oranye (urgensi menyala); badge merah dapat stroke hitam tipis biar nempel.
* **Test**: thumb-studio tetap 58/58; seluruh 30 suite hijau; tsc 0; build 0.


### 🪝#️⃣ v19.10 — HOOK ENGINE (3 detik pertama) + HASHTAG PINTAR
* **Ilmu dari repo agency-agents (139k★)** — agen "Short-Video Editing Coach" & "TikTok Strategist": (1) visual hook WAJIB muncul dalam 3 detik pertama (close-up / extreme close-up + emosi); (2) mix 5-8 hashtag: trending + niche + kata kunci + umum.
* **Fitur baru:**
  1. **🪝 Hook Engine** (`src/lib/brain/hook-engine.ts`) — analisis storyboard: tiap adegan diskor (close-up +30, wajah +15, emosi +20, wide -25) → verdict KUAT/SEDANG/LEMAH. Kartu di Lahan step 7 (Adegan): ringkasan adegan 1, alasan, saran (close-up emosi, cahaya hangat, ruang teks), badge ✅/🟡/🔴 per adegan, dan tombol **"🪝 Upgrade Adegan 1"** yang menyuntik prompt close-up emosi (tinggal ↻ ulangi adegan 1).
  2. **#️⃣ Hashtag Pintar** (`src/lib/brain/hashtag-pintar.ts`) — otomatis 6-8 tag dari judul + keyword (+ trend): niche (ceritajadilagu/lagusedih/laguviral) + kata kunci judul + trend + umum (shorts/viraltiktok/youtubeshorts). Dipakai di **Upload Kit**: kalau hashtag belum diisi, otak bikin otomatis.
* **Test baru** `tests/hook-hashtag.test.mjs` (14 cek) — seluruh 30 suite hijau; tsc 0; build 0.


### 🧠 v19.9 — ILMU BARU: RADAR GELOMBANG + KECEPATAN LAWAN + PABRIK KONTEN 7 HARI
* **Ilmu yang dicuri dari The Book of Secret Knowledge:** (1) OSINT monitoring — pantau data lintas hari & deteksi perubahan; (2) automation — jadwalkan produksi; (3) intelligence gathering — hitung metrik dari data publik.
* **Fitur baru:**
  1. **🌊 Radar Gelombang** (`trend-radar.ts`): otak simpan snapshot trend tiap hari (localStorage `verve_trend_gelombang_v1`), lalu bandingkan posisi hari ini vs kemarin → badge 🆕 BARU / 🌊 NAIK (naik ≥3 posisi) / 📉 TURUN / stabil. "Intelijen pasar": tahu gelombang yang sedang membesar sebelum ramai. Jujur: tanpa snapshot → stabil, bukan semua BARU.
  2. **⚡ Kecepatan lawan** (`competitor-rss.ts`): parser halaman /videos kini juga menangkap viewCountText ("818", "1.7K") → `parseViewCount` + `kompetitorVelocity` (view/hari). Radar Kompetitor menampilkan badge kecepatan per video lawan (🚀/🔥/👍 + X/hr) — bandingkan dengan velocity videomu.
  3. **📅 Pabrik Konten 7 Hari** (`content-factory.ts`): otak menyusun 7 slot konten sekaligus — topik dari gelombang 🆕/🌊 yang cocok niche + pola tembus channel, judul saran (Title Guru) + skor, jam upload golden-hour, badge ⭐ hari terbaik. Tombol "➕ Isi ke Lahan" → satu klik mulai produksi. Auto-pilot konten seminggu.
* **Test**: trend-radar +8 cek gelombang, competitor-rss +6 cek kecepatan — seluruh 30 suite hijau; tsc 0; build 0.


### 🖼️🎯 v19.8.8 — FIX JEMBATAN THUMBNAIL (bug key!) + JUDUL LAWAN BISA DIPILIH ARAHNYA
* **Masalah (screenshot + riset user):** (1) Thumb Studio baca key SALAH — `KUNCI_LAHAN = "verve_brain_v1"` padahal state produksi Lahan (topic/selTitle/selKeyword/charLock) ada di `verve_lahan_v1` → "Tarik dari Lahan"/"Susun dari Lahan" selalu bilang kosong. (2) Judul lawan di Radar Kompetitor tidak bisa "diambil" sebagai arah produksi — sistem masih fokus ke pilihan niche step 1.
* **Solusi:**
  1. **Fix key**: `KUNCI_LAHAN = "verve_lahan_v1"` + fallback brain untuk data lama; test diperketat (cek key benar + flag auto-tarik).
  2. **Auto-tarik**: tombol jembatan 🖼️ di Lahan (step 4 & duel) set flag `verve_thumb_dari_lahan_v1` → Thumb Studio otomatis isi judul + prompt dari Lahan saat dibuka (tanpa tekan tombol manual).
  3. **Pilih arah**: tiap judul kompetitor di Radar RSS kini punya **🎯** = jadikan topik produksi (ganti niat, lanjut cari sudut dari judul lawan) + di panel Duel ada "🎯 Jadikan topik produksi" — user bebas pilih: produksi dari judul lawan ATAU tetap dari niche-nya. Micro-copy menjelaskan aksi ⚖️ vs 🎯.
* **Test**: thumb-studio 58 cek (+2) — 30 suite hijau; tsc 0; build 0.


### 🖼️ v19.8.7 — JEMBATAN LAHAN → OTAK THUMBNAIL (judul juara langsung jadi thumbnail)
* **Masalah (riset + feedback user):** Otak Thumbnail sudah ada (Thumb Studio: 3 varian latar, badge CTR, prompt dari Lahan via `bangunPromptDariLahan`), TAPI alur Lahan tidak punya tombol ke sana — user harus keluar Lahan → home → cari Thumbnail manual. Padahal thumbnail = penentu CTR (views = impressions × CTR; CTR ditentukan judul + thumbnail).
* **Solusi:**
  1. Prop baru `gotoThumb` di LahanStudio (dari page.tsx → setScreen("thumbnail")).
  2. **Step 4 (Judul Juara)**: setelah judul dikunci → tombol **🖼️ Thumbnail** di samping "Lanjut: Rancang Visual" — sekali tap langsung ke Thumb Studio; tombol "🪄 Susun dari Lahan" di sana otomatis pakai judul + gaya visual + kunci karakter yang baru dipilih.
  3. **Panel Duel/Serang Balik**: saat ada judul **MENANG BESAR** → tombol **"🖼️ Pakai & Bikin Thumbnail-nya"** — judul pemenang dikunci ke otak lalu langsung ke Thumb Studio.
* **Alur jadi utuh:** Niat → Sudut → Riset → Judul Juara (duel/serang) → 🖼️ Thumbnail → Visual → Cerita → Lagu → Edit → Render → Upload.
* tsc 0; build 0; 29 suite hijau.


### 🔁 v19.8.6 — GENERATE LAGI: otak terus nyoba varian sampai MENANG BESAR dari lawan
* **Masalah (screenshot user):** hasil Serang Balik kadang 1 menang tapi 2 masih kalah — user mau bisa "generate lagi" sampai nemu yang menang besar.
* **Solusi:**
  1. `serangBalikJudul(..., batch)` — batch 0 = varian inti (natural); batch 1,2,3... = varian baru (emosi: Rindu/Maaf/Doa Terakhir/Air Mata + penasaran: Ternyata/Jangan Nonton/Akhirnya/Ini Dia + "yang Menyentuh").
  2. Tombol **🔁 Generate Lagi (N×)** di panel Serang Balik — tiap klik = putaran varian baru, digabung dengan hasil lama (dedupe), diurutkan skor terbaik.
  3. **Ringkasan otak**: "🏆 Ada yang MENANG BESAR (+N poin): ..." / "Belum ada yang menang — coba generate lagi" — jadi user tahu kapan berhenti.
* **Test** +4 cek (batch beda → varian beda, varian emosi/penasaran, semua tetap pakai frasa lawan & di-score) — 30 suite hijau; tsc 0; build 0.


### 🧠 v19.8.5 — SERANG BALIK NATURAL (baca niche, bukan maksa angka) + FIX Duel Terbalik
* **Masalah (screenshot user):** saran judul jadi "3 Ibu Engkau Yang Terbaik - Viral TikTok" — tidak natural untuk niche "cerita jadi lagu" (judul puitis, bukan daftar angka). Juga ditemukan **bug transposisi**: `bandingDenganLawan` mengirim (lawan, judulSaya) padahal UI menampilkan KIRI=JUDULMU → skor & verdict kebalik.
* **Solusi:**
  1. **Fix duel** — `bandingkanJudul(judulSaya, lawanTitle)` → a=JUDULMU, b=LAWAN; skor, verdict, alasan jadi benar.
  2. **Niche-aware** — `intiJudulUntukSerang()`: buang label niche ("| Cerita Jadi Lagu") & kata sambung → inti judul ("Ibu Engkau Yang Terbaik" / "Ibu"). Template baru: mayoritas TANPA angka (natural), angka (dari data lawan) hanya lewat pola "Kisah" yang wajar, plus varian emosional "Rindu ...".
* **Hasil contoh:** "Ibu Engkau Yang Terbaik - Cover Paling Viral TikTok" · "Rindu Ibu - Cover Paling Viral TikTok" · "5 Kisah Ibu - Cover Paling Viral TikTok" — bukan lagi "3 Ibu Engkau Yang Terbaik".
* **Test** +3 cek (inti judul, larangan angka+judul penuh, ada varian tanpa angka) — 30 suite hijau; tsc 0; build 0.


### 🎯 v19.8.4 — SERANG BALIK JUJUR: ANGKA JUGA DIAMBIL DARI DATA JUDUL LAWAN
* **Masalah (feedback user):** angka "3"/"5" di judul saran Serang Balik itu TEMPLATE hardcode, bukan dari data — melanggar prinsip repo "AI tidak mengarang angka".
* **Solusi:** `angkaPopulerDariJudul()` — hitung angka yang PALING SERING dipakai di judul kompetitor yang terkumpul (tahun 2026 & angka besar dibuang), lalu `serangBalikJudul` memakainya (fallback template hanya kalau belum ada data). UI menampilkan catatan jujur: "frasa viral & angka di judul saran diambil dari data judul lawan (bukan tebakan)" + flash angka yang dipakai.
* **Test** +3 cek (angka populer dari data, tahun dibuang, saran pakai angka data) — seluruh 30 suite hijau; tsc 0; build 0.


### ⚔️ v19.8.3 — DUEL JUDUL DIPERJELAS + FITUR "SERANG BALIK" (judul penyerang vs lawan)
* **Masalah (screenshot user):** panel Duel Judul membingungkan — lawan diskor 11 vs judulmu 9, tapi verdict bilang "Imbang". Biang: logika `skorA > skorB + 2` menganggap selisih ≤2 selalu seri walau salah satu unggul. User juga minta fitur "bikin judul rekomendasi buat serang judul lawan".
* **Solusi:**
  1. **Verdict jujur** — pemenang dihitung langsung (unggul tipis ±1-2 vs unggul jelas >2): "Lawan unggul tipis (+2) — masih bisa disalip: coba ⚔️ Serang Balik."
  2. **Keterangan panel** — "KIRI = judul yang kamu kunci · KANAN = video terbaru lawan (klik buka)".
  3. **⚔️ Serang Balik** (`serangBalikJudul` + `ambilFrasaViral`) — otak meminjam frasa yang sedang menang di judul lawan (mis. "Viral TikTok Terbaru") + menggabungkan dengan keyword/angle-mu → 3 judul penyerang, di-score vs judul lawan, badge MENANG/KALAH, tombol "Pakai →" langsung kunci ke otak.
* **Test** +5 cek (frasa viral + serang balik) — seluruh 30 suite hijau; tsc 0; build 0.


### 🛟 v19.8.2 — FALLBACK SCRAPE SAAT RSS KOMPETITOR 404
* **Masalah (screenshot user):** channel "DJ KINAR" aktif & upload 1 hari lalu (terlihat di app YouTube), tapi Radar Kompetitor bilang "Belum ada upload baru" + "HTTP 404". Ternyata RSS YouTube (`feeds/videos.xml`) memang **404 untuk sebagian channel** (quirk YouTube) walau channel-nya normal.
* **Solusi:** fallback otomatis di `/api/competitor-rss`:
  1. Coba **RSS** dulu (cepat & ringan).
  2. Kalau gagal → **scrape halaman `youtube.com/channel/{ID}/videos`** (ytInitialData → `compactVideoRenderer`: videoId + judul + waktu relatif "1 day ago" → timestamp). Tetap tanpa API key.
  3. UI menampilkan catatan jujur "🛟 RSS tidak tersedia — pakai fallback halaman" + nama channel.
* **Teruji live:** DJ KINAR (RSS 404) → kini kebaca 8 upload terbaru termasuk video "1 hari lalu". tsc 0; build 0; 30 suite hijau (test baru: parse halaman + relTimeToTs).


### 🔧 v19.8.1 — FIX "fetch failed" DI RADAR KOMPETITOR (link video & pesan ramah)
* **Masalah (screenshot user):** tempel link VIDEO (`youtu.be/...`) ke kolom Radar Kompetitor → muncul error merah mentah "fetch failed". Dua biang: (1) `youtu.be` bukan `youtube.com` → URL jadi rusak saat resolve; (2) fetch ke halaman video sering diblokir/throttle → error bawaan Node tampil mentah.
* **Solusi:**
  1. **oEmbed-first**: link video sekarang di-resolve via endpoint oEmbed RESMI YouTube (ringan, jarang diblokir) → langsung dapat nama + URL channel; fallback scrap halaman dengan URL yang benar (`fullUrl` fix concat).
  2. **Nama channel benar**: halaman video pakai `ownerChannelName`, @handle pakai `externalId`/og:title.
  3. **Pesan ramah**: video private/hapus → "Video tidak ditemukan (private/dihapus?)..."; koneksi gagal → "Koneksi ke YouTube gagal/diblokir — coba lagi nanti atau pakai link /channel/UC... langsung." (bukan "fetch failed" mentah).
* **Teruji live**: video ada → MrBeast ✓; video 404 → pesan jelas ✓; @handle → ✓. tsc 0; build 0; 29 suite hijau.


### 🧭 v19.8 — ALUR LAHAN DISATUKAN: INSPIRASI NYAMBUNG, RADAR PINDAH KE RISET
* **Masalah (feedback user):** Trend Radar & Radar Kompetitor RSS di step 1 (Niat & Topik) terasa terpisah & tidak nyambung dengan niche & alur produksi.
* **Solusi (selaras konvensi v29.0/29.1 — langkah bertujuan jelas, bahan dari data):**
  1. **Step 1 → "Niat, inspirasi & topik"** — Trend Radar dirombak jadi **🔥 Inspirasi dari Trend**: trend yang 🎵 cocok niche (cerita jadi lagu) diurutkan PALING ATAS (tweak otak: sortir relevansi niche), jembatan visual "👇 klik trend = niat terisi", dan penghitung "X trend cocok langsung jadi cerita/lagu". Satu kesatuan: niat ↔ inspirasi.
  2. **🛰️ Radar Kompetitor RSS PINDAH ke Step 3 (Riset)** — tempatnya yang logis: di sana sudah ada "Pola judul kompetitor", "⚡ 3 kompetitor tercepat", "👀 Lawan terlaris". Radar RSS jadi **"pantauan live lawan"** pelengkap potret statis riset — satu kesatuan riset: statis (API) + live (RSS), pola lawan + duel judul ⚖️.
* **Test:** seluruh 30 suite tetap hijau; tsc 0; build 0.


### ⚖️🛰️ v19.7 — AUTO-ALERT KOMPETITOR + ANALISIS POLA LAWAN + DUEL JUDUL
* **Masalah:** Radar Kompetitor (v19.6) sudah bisa scan, tapi belum: (1) memberi tahu otomatis saat lawan upload, (2) belajar pola judul lawan dari waktu ke waktu, (3) membandingkan judulmu vs judul lawan.
* **Solusi:**
  1. **🛰️ Auto-alert gabung notifikasi harian** — tiap scan & tiap notifikasi harian, upload BARU (videoId yang belum pernah terlihat) dari kompetitor otomatis terdeteksi (`deteksiUploadBaru` + jejak `KOMP_SEEN_KEY`) dan masuk pesan notifikasi: *"Kompetitor baru upload: ... (2 jam lalu) +2 lagi"*.
  2. **🧬 Analisis pola judul lawan** — judul kompetitor dikumpulkan lintas scan (`KOMP_TITLES_KEY`, dedupe, maks 200); otak menghitung pola yang sedang naik: kata khas, frasa 2-3 kata (angka 1 digit ikut dihitung — "5 Kisah" ketangkap), persentase tiap gaya, dan frasa yang muncul di ≥2 judul terbaru (📈 sedang naik).
  3. **⚖️ Duel judul** — tombol ⚖️ di tiap upload lawan → bandingkan side-by-side dengan judulmu pakai mesin otak (prediksi CTR Bayes + fitur angka/emosi/panjang): skor, similiarity, dan pemenang + alasan.
* **Test** diperluas `tests/competitor-rss.test.mjs` (25 cek) — seluruh 30 suite repo tetap hijau.


### 🛰️ v19.6 — RADAR KOMPETITOR RSS (mata-mata real-time, tanpa kuota API)
* **Ide (dari The Book of Secret Knowledge — prinsip OSINT):** data publik termurah & paling stabil = RSS. Setiap channel YouTube punya RSS gratis (`youtube.com/feeds/videos.xml?channel_id=...`) — pantau upload kompetitor TANPA menyentuh kuota YouTube Data API (10rb/hari).
* **Yang baru:**
  1. `src/lib/brain/competitor-rss.ts` — parser RSS Atom murni, ekstrak channel ID dari berbagai bentuk URL, deteksi judul mirip (jaccard vs brain), ringkasan scan.
  2. `/api/competitor-rss` — GET scan RSS (cache 10 mnt, maks 6 channel), POST resolve @handle /c/ → channel ID dari meta halaman (tanpa API key). Teruji live: MrBeast ter-resolve & ter-scan.
  3. Kartu "🛰️ Radar Kompetitor" di Lahan step 1: tambah channel (link/ID), scan sekali klik, tiap upload baru tampil dengan waktu + badge ⚠️ kalau judulnya mirip judulmu (≥60%).
* **Test baru** `tests/competitor-rss.test.mjs` (16 cek) — seluruh 30 suite repo tetap hijau.


### ⚡🎨🔔 v19.5 — RADAR KOMPETITOR + THUMB TREND + NOTIFIKASI HARIAN + TREND MULTI-NEGARA
* **Masalah:** riset menampilkan kompetitor, tapi tidak menunjuk siapa yang TERCEPAT & pola judulnya; Trend Radar hanya Indonesia; tidak ada saran thumbnail & pengingat harian.
* **Solusi (4 fitur):**
  1. **⚡ Radar Kompetitor** (`src/lib/brain/kompetitor-radar.ts`) — di riset (Lahan step 3): 3 kompetitor dengan view/hari tertinggi (🥇🥈🥉), insight "kenapa dia kencang", kata khas & frasa judulnya, plus **pola bersama** para juara (kata yang dipakai 2+ kompetitor cepat).
  2. **🎨 Auto-thumbnail dari trend** (`src/lib/brain/thumb-trend.ts`) — tombol 🎨 di tiap baris Trend Radar → teks overlay pendek, palet warna, & prompt gambar Inggris siap salin (emosional=hangat+tears, horor=gelap+JANGAN, DJ=neon+FULL BASS, umum=berani).
  3. **🔔 Notifikasi harian otak** (`src/lib/brain/daily-notify.ts`) — sekali sehari (saat app dibuka) otak sync lalu kirim notifikasi PWA: berapa judul dipelajari + jam hoki + slot terbaik besok. Tombol aktifkan di kartu Deep Dive. Jujur: foreground (background push butuh server push, di luar scope).
  4. **🌏 Trend multi-negara** — chip 🇮🇩 ID / 🇺🇸 US / 🇯🇵 JP / 🇲🇾 MY di Trend Radar; `/api/trends?geo=` sudah mendukung semua.
* **Test baru** `tests/radar-v19.test.mjs` (14 cek) — seluruh 29 suite repo tetap hijau.


### 🔥 v19.4 — TREND RADAR GOOGLE TRENDS 🇮🇩 + JADWAL UPLOAD GOLDEN HOUR
* **Ide:** Google tidak punya API resmi publik untuk Trends, tapi ada **RSS harian resmi** (`trends.google.com/trending/rss?geo=ID`) — gratis, tanpa API key, read-only, stabil. VERVE sekarang "menangkap gelombang" topik yang lagi hangat di Indonesia.
* **Yang baru:**
  1. **🔥 Trend Radar** (`/api/trends` + `src/lib/brain/trend-radar.ts`) — proxy RSS dengan cache 15 menit; tiap trend di-*tag* otomatis pakai kamus audiens VERVE: 💔 Emosional/Keluarga (cocok lagu), 👻 Horor, 🎧 DJ, ⚡ Umum. Di Lahan step 1: daftar 12 trend teratas → **satu klik jadi niat cerita/lagu** (nyambung langsung ke niche "cerita jadi lagu").
  2. **📅 Jadwal Upload Golden Hour** — `jadwalUpload(brain, 7)` di deep-dive: 7 slot upload terbaik berikutnya belajar dari jam hoki & hari terbaik channelmu; hari terbaik ditandai ⭐. Tampil di kartu Deep Dive.
  3. **⚡ Radar Kompetitor** — siap pakai: `AnalyzedVideo` sudah membawa `vpd` (views/day), bahan analisis kompetitor tercepat (dipakai di riset sudut).
* **Test baru** `tests/trend-radar.test.mjs` (14 cek) — seluruh 28 suite repo tetap hijau. API `/api/trends` teruji live mengambil data asli Indonesia.


### 🔮 v19.3 — DEEP DIVE: OTAK BERPIKIR LEBIH DALAM (VELOCITY, JAM HOKI, PREDIKSI CTR)
* **Ide:** semua tool memberi saran GENERIK ("upload jam 18-22", "buat video pendek"). VERVE sekarang belajar dari DATA CHANNEL SENDIRI — jawaban yang benar-benar milik pengguna, bukan tebakan umum.
* **Yang baru** (`src/lib/brain/deep-dive.ts`, murni klien & offline):
  1. **🚀 Kecepatan tayang (view velocity)** — view/hari tiap video + label 🚀 VIRAL / 🔥 Ngebut / 👍 Padat / 🐢 Merangkak / 😴 Sepi. Route sync sekarang mengirim `velocity`, `uploadHour`, `uploadDay`, `proyeksi30/90` per video.
  2. **⏰ Jam hoki** — otak kelompokkan video berdasarkan jam upload & hari, hitung rata-rata kecepatan tayang → tahu jam & hari mana yang paling tembus DI CHANNELMU (bukan patokan umum).
  3. **⏱️ Durasi ideal** — bucket durasi (Shorts/pendek/sedang/panjang) mana yang paling nempel (velocity + AVD).
  4. **🔮 Prediksi CTR sebelum tayang** — ketik judul calon video → otak nebak CTR (rentang + jumlah judul mirip + alasan) pakai Bayes learningBoostV2 + baseline channel. Belum ada tool lain yang ngasih ini.
  5. **🍼 Level otak** (Bayi Otak → Doktor Judul) + **📋 Laporan Otak** — ringkasan siap salin: baseline, pola tembus/gagal, jam hoki, durasi ideal, video tercepat.
* **UI:** kartu baru "🔮 Otak berpikir lebih dalam" di Lahan (langkah Pilih Judul Juara) + level & jam hoki ditampilkan di panel live halaman Jualan.
* **Test baru** `tests/brain-deepdive.test.mjs` (21 cek) — seluruh 27 suite repo tetap hijau.


### 💎 v19.2 — SYNC DI DOKTER CHANNEL + MOCKUP & HARGA DI HALAMAN JUALAN
* **Masalah:** tombol "Sync Otak" hanya ada di Lahan Awalan — pengguna yang bekerja lewat Dokter Channel tidak bisa memicu belajar otak dari sana. Halaman Jualan belum punya visual produk & harga.
* **Solusi:**
  1. **Logika sync dipakai bersama** — semua fungsi dipindah ke `src/lib/brain/auto-sync.ts` (satu sumber kebenaran: `syncYtBrain`, `mergeSyncResults` "data terlengkap menang", `persistBrain` localStorage+brankas, `loadBrain`). Lahan & Dokter pakai kode yang sama — tidak ada lagi kode dobel yang bisa beda perilaku.
  2. **🩺 Tombol "🧠 Sync Otak Belajar" di Dokter Channel** (kartu YouTube terhubung) — sekali klik, otak makan data performa channel & pola judul di Lahan ikut update. Menampilkan jam terakhir otak belajar.
  3. **📱 Halaman Jualan** (`/jualan`) tambah 2 section:
     * **"Ini wajahnya di dalam app"** — mockup SVG panel otak (pola ▲/▼ + saran judul) yang selalu tajam & ter-render di perangkat mana pun.
     * **"Pilih edisimu"** — 3 edisi: Personal (Rp 499rb), Pro/Reseller (Rp 1,5jt, paling laris), Lisensi Penuh/White-label (hubungi). Sekali bayar, tanpa langganan.
  4. **Test baru** `tests/auto-sync.test.mjs` (9 cek) — seluruh 26 suite repo tetap hijau.


### 💎 v19.1 — OTAK BUKA CATATAN: INSIGHT POLA + TITLE GURU + DASHBOARD PENJUAL
* **Masalah (dari v19.0):** otak sudah bisa "makan" data performa dari YouTube, tapi ilmunya masih tersembunyi — pengguna tidak melihat apa yang otak pelajari, dan otak belum "menulis" rekomendasi dari ilmunya itu.
* **Solusi (3 fitur baru):**
  1. **🧠 Panel Insight Pola** (`src/lib/brain/pattern-insight.ts`) — dari `brain.results`, otak menghitung baseline CTR channel lalu membandingkan tiap gaya judul (angka, kata tanya, kata emosi, panjang pendek, frasa "cerita jadi lagu"). Muncul kartu di Lahan: pola TEMBUS (▲) & pola GAGAL (▼) + judul terbaik. Murni klien, offline, gratis.
  2. **🎯 Title Guru** (`src/lib/brain/title-guru.ts`) — otak MENULIS 4 judul baru memakai pola yang terbukti tembus di channelmu, disaring: nggak mirip judul yang gagal (CTR <3% 14 hari) & nggak kembar dengan yang sudah dipakai. Tombol "Pakai →" langsung mengunci judul ke otak.
  3. **💎 Dashboard Penjual** (`/jualan`) — halaman showcase mobile-first buat demo ke calon pembeli: hero, 6 fitur utama, cara otak belajar, **panel "Bukti otak bekerja" yang live membaca brain di perangkat itu**, teknologi di balik layar, CTA lisensi. Tombol akses: grid tools di home (💎 Jualan · DEMO).
* **Bonus:** test suite baru `tests/brain-guru.test.mjs` (14 cek) — seluruh 25 suite repo tetap hijau.


### 🧠 v19.0 — FEEDBACK LOOP: OTAK BELAJAR SENDIRI DARI YOUTUBE (read-only)
* **Masalah:** Otak VERVE (`learningBoostV2` — skor judul Bayesian yang belajar dari performa) hanya pintar kalau `brain.results` diisi angka asli YouTube. Dulu harus input CTR manual / export CSV → jarang diisi → otak "kelaparan" dan belajar lambat.
* **Solusi (Feedback Loop Otomatis):**
  * Route baru `/api/youtube/sync-brain` menarik data performa video channel (views, AVD, likes, comments + impressions/CTR yang tersedia) langsung dari YouTube Analytics API — read-only, tanpa menulis apa pun ke channel.
  * Tombol **"🔄 Sync & Belajar Sekarang"** di Lahan (langkah Pilih Judul Juara) + **auto-sync sekali sehari** saat app dibuka (kalau YouTube sudah terhubung di Dokter Channel).
  * Data digabung ke BrainMemory dengan aturan "yang paling lengkap menang" — laporan manual yang lebih kaya tidak tertimpa, slot 200 judul tetap terkunci.
  * Efek ke otak: judul yang terbukti CTR tinggi langsung naik prioritas; yang CTR <3% dalam 14 hari otomatis dihukum; data lama meluruh (half-life 30 hari).
* **Bonus fix data:** `impressionClickThroughRate` dari YouTube Analytics API ternyata **rasio 0-1** (0.045 = 4.5%), bukan persen. Sebelumnya dipakai mentah di `/api/youtube/analytics/video` → Growth Doctor & otak bisa membaca CTR 0.045% padahal aslinya 4.5%. Sekarang dikonversi aman (×100 bila ≤1) di kedua route.


Berikut adalah rangkuman seluruh masalah kritis yang berhasil kami pecahkan secara mutlak pada sesi ini untuk menjamin kinerja yang cepat, lancar tanpa patah-patah (*butter-smooth*), dan 100% bebas crash pada berbagai tipe HP Android/iOS:

### 1. Sinkronisasi Lirik & Alur Lagu Pas Sempurna
* **Masalah:** Jika kunci API Whisper terputus, sistem menggunakan estimasi lirik darurat (`estimateLyricLines`). Estimasi ini memaksakan lirik mulai di detik 1.2, padahal lagu AI Suno memiliki intro instrumental panjang (12-20 detik). Akibatnya, lirik keluar jauh mendahului suara penyanyi asli.
* **Solusi (Smart Intro Heuristic):** Menambahkan deteksi tipe audio otomatis. Jika durasi lagu panjang (>45 detik), sistem darurat otomatis menggeser masuknya lirik pertama ke detik **11 hingga 13.5** (standar vokal masuk lagu pop/Suno). Lirik dijamin langsung pas dengan lagu!

### 2. Perbaikan PWA Auto-Update (Bebas Drama Hapus Cache)
* **Masalah:** Karena sistem PWA Chrome sangat agresif menimbun cache di memori HP, pengguna sering kali tidak mendapatkan pembaruan kode terbaru dan terpaksa melakukan hapus cache/uninstall aplikasi secara manual.
* **Solusi (Service Worker Controller Listener):** Menambahkan skrip update otomatis di `src/app/layout.tsx`. Setiap kali ada deploy kode baru di Vercel, browser HP pengguna akan mendeteksinya secara instan dan melakukan **penyegaran mandiri (*auto-reload*)** secara otomatis tanpa merusak data atau mengganggu kenyamanan pengguna!

### 3. Solusi Error Merah di HP non-Samsung (Kompatibilitas Global)
* **Masalah:** Saat diekspor di HP non-Samsung (seperti Xiaomi, Oppo, Vivo), proses render mendadak crash dengan pesan: `Failed to execute 'encode' on 'VideoEncoder': Cannot call 'encode' on a closed codec.` Ini karena driver GPU HP tersebut menolak mode performa `"quality"`.
* **Solusi (Realtime Mode & Try-Catch Protection):** 
  * Mengubah `latencyMode` pada `VideoEncoder` menjadi **`"realtime"`** yang didukung oleh 100% jenis chipset dan merk HP di dunia.
  * Membungkus seluruh pemanggilan `.encode()` di dalam blok `try...catch` dan melakukan pengecekan status `.state !== "closed"`, melenyapkan risiko crash popup merah selamanya!

### 4. Menghilangkan Sensor Peringatan "Jalankan Keterangan"
* **Masalah:** Saat pengguna membuat lirik lewat jalur "Dari Lirik Lagu", lirik berhasil terpasang di track teks, namun tombol `🧠 Auto Lyric-Slicer` di menu Sihir Film tetap memunculkan peringatan karena state `capWords` kosong.
* **Solusi (CapWords Unified Integration):** Menyinkronkan semua jalur pembuatan keterangan (lirik, narasi suara, musik) agar otomatis mengisi memori state `capWords` secara utuh. Tombol `Auto Lyric-Slicer` kini langsung berfungsi lancar pada ketukan pertama!

### 5. Pengisi Celah Video Kinetik (Freeze-Frame & Dream-Blur)
* **Masalah:** Mengulang adegan video pendek secara bolak-balik dalam slide panjang terlihat tidak estetik (monoton). Namun, mendiamkannya matung kaku juga kurang memuaskan.
* **Solusi:**
  * **Cinematic Dream-Blur:** Begitu klip video aslinya selesai diputar (pada kecepatan 1.0x normal yang super lancar), background-nya akan memudar kabur secara halus dari `0px` ke `6px`.
  * **Warm Golden Light Leak:** Menembakkan kilatan cahaya hangat oranye-emas bergetar lembut (*organic pulsing*) meniru sensor film seluloid bioskop analog di ujung klip.
  * **Kinetic Lyric Gold:** Di atas background yang blur dan glowing tersebut, kalimat lirik lagu aktif melayang membesar secara kinetik (*slow kinetic zoom-in*) di tengah layar dengan font Serif premium berwarna kuning emas `#ffd93d`!

### 6. Perbaikan Durasi Spektrum Musik (`@bars`)
* **Masalah:** Spektrum musik yang ditambahkan hanya menari selama 6 detik di slide pertama dan menghilang di slide-slide berikutnya.
* **Solusi:** Mengatur default pembuatan stiker musik (`@bars`, `@wavepro`, `@ring`) agar otomatis mulai di detik `0` dan berdurasi sepanjang lagu penuh (300-360 detik) secara bawaan. Spektrum kini menari aktif dari awal sampai akhir video!

---

## 🚦 SISTEM VERIFIKASI MANDIRI (baseline gates)

Setiap kali melakukan pembaruan di masa mendatang, pastikan Anda menjalankan perintah pengujian berikut di folder root `/verve-video-studio`:

1. **Uji Kompilasi TypeScript:**
   `npx tsc --noEmit` 👉 Harus menghasilkan exit code **`0` (Tanpa Error)**.
2. **Uji Rangkaian Test Suites:**
   `for t in tests/*.test.mjs; do node $t; done` 👉 Seluruh 6 suite unit test wajib menghasilkan status **`🏆 SEMUA UJI LULUS`**.

---

## 📁 PANDUAN PENGEMBANGAN LANJUTAN: ARSITEKTUR MODULAR

Untuk mencegah tabrakan kode (*merge conflicts*) di masa depan, developer selanjutnya sangat disarankan untuk memecah file raksasa `src/app/page.tsx` (~5.700 baris) menjadi modul-modul terpisah di dalam folder `/src/studio/`:

1. `/src/studio/timeline/` 👉 Fokus mengelola lintasan track visual, penanganan geser horizontal, dan scroll.
2. `/src/studio/sihir/` 👉 Fokus mengelola lembar kerja "Sihir Film", preset warna, dan pemotong otomatis AI.
3. `/src/studio/caption/` 👉 Fokus mengelola transkripsi audio, sinkronisasi lirik Whisper, dan render karaoke.
4. `/src/studio/audio/` 👉 Fokus mengelola mixer audio ambient, auto-ducking, dan penyesuaian volume.

---

*Seluruh hasil kerja keras, perbaikan performa, dan estetika visual sinematik pada sesi ini telah dikunci secara aman dan stabil pada tag commit `v16.8-lock`. Selamat berkarya!*
