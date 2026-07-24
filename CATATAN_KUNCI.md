# 🔒 CATATAN KUNCI PROYEK VERVE
> Dibikin: 2026-07-23 sebelum chat di-refresh. Tujuan: sesi berikutnya langsung nyambung tanpa lupa.

## Identitas Proyek (ATURAN EMAS)
- Repo RESMI **SATU-SATUNYA**: `zhoniandre-lab/verve-video-studio` → auto-deploy **https://verve-video-studio.vercel.app**
- ❌ JANGAN PERNAH push ke repo `verve-ai`.
- Kode 100% original. Setiap perbaikan **jangan merusak yang lain** → patch minimal/surgical ("stub-stub aja"), pakai mesin yang SUDAH ADA, jangan bikin roda paralel. Selalu sebutkan file yang disentuh & yang TIDAK disentuh.
- Proyek "LAHAN AWALAN": wizard 9 langkah (Niat→Sudut→Riset→Judul→Visual→Cerita→Adegan→Lagu→Video), niche "Cerita Jadi Lagu".
- User: HP only (Samsung + Chrome Android), Lampung/Curup, tes malam hari, kirim screenshot buat diagnosis. Bahasa: Indonesia santai "bro", JUJUR — akui kesalahan sendiri dengan bukti, jangan nebak ("kubuktikan dulu").

## Versi Terkunci Saat Ini
- **main = v13.10 TURBO JUJUR = commit `a6c1688`** (bersih, nothing to commit)
- Tag lock + backup branch (semua verified di remote):
  - `v13.7-rilis-sempurna-lock` (@e74a85a) — spektrum unit fix, SELARAS audio sync, judul terkunci, auto thumbnail
  - `v13.7.1-brankas-lagu-lock` (@a7482b5) — brankas IndexedDB buat link lagu AI yang kedaluwarsa (avault.ts)
  - `v13.8-panggung-mahal-lock` (@754f3e7) — FFT512 sungguhan, @waves/@wavepro/@ring premium, dissolve sinematik, thumbnail Anton + adaptif luminansi
  - `v13.9-panggung-hidup-lock` (@a6b8e94) — spektrum pindah ke layer OV2 (mulus 30fps), dynSlides pinned-only, kurva pow(0.72)×1.12
  - `v13.10-turbo-jujur-lock` (@a6c1688) — ETA jujur (dari frame pertama), telemetri berlabel mesin (WEBCODECS/MEDIARECORDER), shadowBlur diiritkan, cache gradient @bars

## Yang SUDAH JALAN (jangan dirusak)
- Spektrum: FFT512 (bukan band-RMS), bars 0..1, beats, bassLevels; @bars glass-plate + peak-caps; curve respons shared preview=render.
- Stiker musik melayang dilukis di layer OV2 tiap frame (hidup 30fps), stiker pinned tetap di layer A.
- Audio: GERBANG proxy (all-hosts, 502/415 jujur), decodeAudio multi-kandidat + fallback BRANKAS (avault IDB, avWarm di page/lahan/mixAudioUrls). Pesan error jujur per kandidat.
- Sinkron durasi: wizard probeSongDur (direct→proxy, timeout 12s), Studio one-time heal (flag audioSynced di snapshot, guard wizard-only, factor ≤10).
- Ekspor: judul terkunci tidak ditimpa AI; auto thumbnail (Anton/Bebas, baca luminansi → sisi gelap + scrim adaptif, 1280×720 JPEG).
- Render: webcodecs (mp4-muxer, prefer-hardware, backpressure 24) → fallback mediarecorder (realtime) dengan label mesin + telemetri fase (lukis/capture/antre-encoder). ETA dihitung dari tick frame pertama, bukan dari setup.

## PENDING — menunggu jawaban/bukti dari user
1. **Kecepatan render**: minta screenshot baris akhir `⏱ Telemetri:` → mesin apa? WEBCODECS atau MEDIARECORDER? + angka lukis vs antre-encoder. Itu penentu langkah turbo berikutnya.
2. **Misteri "durasi 07:03"** (padahal lagu ±04:3x): tanyakan apakah dia mengubah durasi adegan / nambah adegan manual. Kalau "tidak", berburu mekanisme penggembung durasi (maxEndAll/dispTotal vs clipsTotal).
3. **Validasi spektrum v13.9 di HP**: dia belum render ulang sejak fix layer OV2. Tunggu verdict screenshot.
4. Thumbnail v13.8 (Anton + auto sisi gelap) belum dites ulang.

## SEDANG DIBANGUN — 🎞️ LEMARI VIDEO (stock video Pexels)
Keputusan user 2026-07-23: provider **Pexels**, cara pilih **otomatis + bisa ganti**, visual **campur bebas per adegan** (video stock ↔ gambar AI).
- Fase 0 (SELESAI @kunci-2026-07-23): route `src/app/api/hcnsec/stock-video/route.ts` — butuh env `PEXELS_API_KEY` (✅ SUDAH TERPASANG & TERVERIFIKASI LIVE: cari "matahari" → 1364 hasil; file Pexels CORS `*`; GERBANG proxy lolos video/mp4).
- Fase 1 (SELESAI @v13.11-lemari-video-lock): `src/lib/stockvid.ts` (cariStokVideo / kueriDariScene id→en / pilihKlipTerbaik) + lahan-studio.tsx — tombol "Sarankan video SEMUA", blok 🎞️ per adegan (preview muter + 🔄 Ganti sheet + 🎨/🎞️ toggle campur), doneScenes sah tanpa gambar AI, genAll hemat kredit, pratinjau step-9 video muter, masukStudio: poster thumbnail jadi gambar slide + vidSrc/vidSd/vidDur ikut ke draft. KUNCI PEXELS ADA DI VERCEL ENV (jangan dicetak di mana pun).
- Fase 1.1 (SELESAI @v13.11.1-rasa-nusantara-lock): ANTI-KEMBAR — storyboard aturan 13 ANTI-KEMBAR KERAS (route.ts), detektor kembar di buildBoard (lapor + suruh ↻ Susun ulang), pilihKlipTerbaik(hasil,t,hindariId), sheet menyaring klip terpakai, saranVidSemua satu klip sekali se-film. RASA INDONESIA: cariStokVideoSmart (Indo dulu → dilebarkan jujur), saklar ☑️ default NYALA (localStorage verve_vidindo_v1), note biru saat dilebarkan.
- Fase 2.1 (SELESAI @v13.11.3-anti-beku-patah-lock): recorder.ts — LOOP waktu modulo durasi klip (slot 40d ÷ klip 6d: dulu BEKU frame akhir di KEDUA mesin), buffer-first di prepareVideos (tunggu 90% buffered/canplaythrough, modal 45d/klip, teks tahap "🧱 Menyangga klip video N (anti-patah)..."). Spektrum BUKAN penyebab patah (dijawab ke user).
- Fase 2 (SELESAI @v13.11.2-fase2-video-hidup-lock): lahan masukStudio kini pakai field RESMI Slide.videoUrl → pipa v11.8 (prepareVideos→vidMap; seek deterministik seekVid+blitVid per frame di renderWebCodecs; dynSlides repaint; fallback poster still kalau klip gagal dimuat). NO recorder/page/page-preview changes needed (applySnapshot pass-through; doRender videos[] sudah wired). Preview Studio masih poster (jujur — belum Fase 2.5). Kueri SINEMATIK: temaDariKarakter (ibu→mother) + MOOD_EN (sedih→sad/haru→emotional) didahulukan + tombol 🧹 reset saran. vidSrc/vidSd/vidDur/vidBy DIBUANG (wheel paralel hapus).
- Fase 2: render frame video (elemen <video> per slide; strategi blob-URL biar anti-CORS & seek enteng; jujur soal beratnya di HP — sarankan 720p buat HP).

## Backlog (pilihan user, belum dieksekusi)
- 🏦 Lemari besi lagu Supabase Storage (copy permanen, bunuh masalah link kedaluwarsa selamanya; butuh bucket + service key env; free 1GB)
- 🔇 Mute per-track di lanehead, karaoke per-line, hook overlay, Share, Sutradara cost-preview, credit chips
- Migrasi Draft ke IndexedDB (localStorage rawan penuh)
- Phase-2 bansos, fitur rekaman suara
- FB_POSTS_VERVE.md (di /home/user, 6 teaser siap tempel) sudah diserahkan, aturan 1 post/hari

## Ritual Teknis Tiap Sesi (WAJIB)
1. `git config user.name/user.email` = zhoniandre-lab & remote `x-access-token:TOKEN@github.com/zhoniandre-lab/verve-video-studio.git` (token sering dicabut antar sesi → minta token baru kalau 401).
2. cwd HARUS `/home/user/verve-video-studio`.
3. node_modules sering TERHAPUS di tengah sesi → cek `ls node_modules/.bin/tsc`; kalau hilang: `npm install --no-audit --no-fund --silent`; jalankan `./node_modules/.bin/tsc --noEmit` (JANGAN npx), cek exit code langsung tanpa pipe.
4. Alur: patch → tsc(0) → build(0) → smoke test grep literal minified di `.next/static/chunks/*.js` (chunk name REGENERATE tiap build, selalu grep -l segar) → commit pesan Indonesia kaya → push → tag lock + branch `backup/*` → `git ls-remote` verify.
5. Uji logika DSP dulu di Node sandbox sebelum shipping.
6. Akhiri tiap sesi: ringkasan bro + langkah tes di HP bernomor + pengingat 1 baris cabut token.
