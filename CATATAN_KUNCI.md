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
- Fase 2.4 (SELESAI @v13.13-unduh-utuh-lock): recorder.ts — prepareVideos UNDUH-UTUH ke blob-URL (biang "awal lancar belakangan patah" = Android memangkas buffer media pas render; blob lokal → seek 100% offline; streaming+buffer-gate tetap jadi cadangan; objUrl direvoke seusai render; VidDeck+objUrl). vidPlan+spd MANUAL [0.25..2] dari slideOpts (kedua mesin teruskan). seek timeout 260→400. lahan: Scene.vidSpd + select ⏱Kecepatan per adegan + slideOpts.spd mengalir. 🧪 tests/vidplan.test.mjs PERMANEN di repo (ekstrak+eval vidPlan asli; 14 skenario lulus incl. spd).
- Fase 2.3 LOOP LUMAT A/B (SELESAI @v13.12-loop-lumat-ab-lock): recorder.ts — vidPlan (rate jepit [0.5,1.4], cyc/pos/inX/x/act) DITES sandbox SEBELUM rilis (uji ekstrak+eval kode asli recorder.ts, semua lulus; harness /tmp/vidplan_test.mjs); VidDeck{a,b,c}: 2 elemen video per slide (v2 pakai srcFix yang terbukti); crossfade sambungan siklus (aktif penuh + pasangan alpha x, vignetta sekali); webcodecs seek-deck & mediarecorder playbackRate-deck + pause hemat. route stock-video bidik HD ≥1100 ("nggak jelas" hilang). pilihKlipTerbaik +bonus durasi mendekati slot ×20. Gejala user "awal lancar belakangan patah" = slide awal klip panjang, belakangan klip 6s stepping rate 0.15 → dijawab jepit 0.5 + crossfade.
- Fase 2.2 (SELESAI @v13.11.4-pas-panjang-lagu-lock): recorder.ts — vidStretchWant: klip DIREGANG pas slot lagu (rate=durKlip/durSlot jepit [0.3,1.5]; webcodecs seek waktu regang; mediarecorder pakai playbackRate = slow-mo mulus bawaan; ekstrem → loop pasca-regang). Ide user: "di-slow-kan biar pas audio". Tanpa edit ulang draf.
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

## v13.14 (2026-07-24) 🎞️ PREVIEW STUDIO VIDEO HIDUP — koreksi diagnosis PENTING
- KELIRU besar sesi sebelumnya: v13.11.3–v13.13 menambal jalur RENDER, padahal keluhan bro = **PREVIEW di STUDIO saat edit**. Dua jalur beda!
- Biang nyata di preview (page.tsx lama): `syncPrevVideos` mainkan klip 1× natural & `currentTime` dijepit `duration-0.06` → klip 6-30 detik di slot 39,6s **jalan sebentar lalu MEMBEKU sisa slot**; tanpa rate, tanpa loop; smoothing "low" → buram; streaming → scrub patah (buffer-trim Android).
- Bedah (7 titik): `vidPlan` diekspor dari recorder.ts; preview `syncPrevVideos(clipT,clipDur,spd)` kini pakai vidPlan (rate slow/cepat + `loop=true` + resync drift >0.45s + posisi scrub persis rencana); `queueVidBlob` unduh-utuh di latar → blob lokal (seek/scrub offline); smoothing "high".
- Reuse murni mesin render. Tak disentuh: renderWebCodecs/renderMediaRecorder, lahan, storyboard, stockvid, avault, editing.ts.
- Uji: tests/vidplan.test.mjs 🏆 lulus; tsc:0 build:0; smoke `__blobOk`/`__blobQ`/"high"/loop=!0 di chunk.
- Catatan jujur: crossfade siklus di preview BELUM ada (single deck + loop native; render tetap A/B crossfade). Misteri "durasi 07:03" & telemetri mesin masih belum dijawab bro.

## v13.15 (2026-07-24) 🌀 LOOP LUMAT PREVIEW — sambungan loop di-studio di-crossfade kontinyu
- Laporan bro: gerak-terus v13.14 "sudah bagus", tapi pergantian loop masih KASAR (loop native HP = potongan keras). Minta: "buat sehalus banget".
- Solusi: `vidLoopPrev(st,vd)` (recorder.ts, ADDITIF — vidPlan/render tak disentuh): 2 deck/slide + crossfade KONTINYU; pemenang fade LANJUT tanpa rewind (periode = vd−XF, XF=min(0.5, vd·0.15)). Target tiap deck monoton → realtime tanpa seek terlihat. Alpha pakai smoothstep.
- page.tsx: `getDeckPair(slideId,url)` (2 slide boleh pakai klip sama), `syncPrevDecks(pr,vidN,role,rate)`, drawFrame komposit out+in(alpha), slot buffer ke-3 utk pasangan, unduh-utuh dibagi via `vidBlobP(url)` (SATU unduhan per URL utk 2 deck — irit data/RAM).
- TEST DULU sesuai perintah: `tests/vidloop.test.mjs` permanen — kontinuitas posisi tiap deck, NOL rewind terlihat, NOL lompatan besar, alpha kontinu, klip 6/30/45/1s + degenerate → 🏆 lulus. vidPlan 14/14 tetap lulus. tsc 0, build 0, smoke `outPos`/`inD`/globalAlpha/`__blobOk` OK.
- Beda jujur preview vs render: render (vidPlan) me-rewind XF kecil tiap sambungan (deterministik utk ekspor); preview lebih sutra (kontinyu). Kalau bro mau ekspor ikut skema ini → kerjaan v13.16 (ubah vidPlan + uji).

## v13.16 (2026-07-24) 🌉 TRANSISI ANTAR-VIDEO LUMAT
- Laporan bro: loop sudah halus, giliran transisi video→video berikutnya kasar.
- 3 biang (diagnosa dari kode): ① video lama MEMBEKU selama dissolve (locate menjepit clipT di clipDur); ② video baru masuk dari 0 @ rate 1× lalu saat serah-terima deck-nya REWIND + ganti ke rate rencana (pop ganda); ③ alpha dissolve linear.
- Bedah: preview kini pakai WAKTU MUNCUL VISUAL absolut (st = tt − starts[i] + transDur sebelum) → video lama terus bergerak selama memudar; slide BERIKUTNYA juga deck kembar dengan rate & posisi NYAMBUNG sejak detik pertama muncul (nol rewind saat flip); syncPrevDecks mengelola 2 pasangan deck. editing.ts: alpha dissolve & zoom sinematik pakai smoothstep (ujung tetap 0→1 — berlaku preview DAN render, jadi ekspor ikut lebih sutra).
- Tak disentuh: locate/buildTimeline (matematika timeline aman), vidPlan render, lahan, storyboard.
- Uji: vidloop 🏆 + vidplan 🏆 (tak berubah), tsc 0 build 0, smoke `*(3-2*` + `1.06-.06*l` OK. getVideo kini tak dipakai preview (dibiarkan — bisa berguna; vidsRef pauser tetap jalan).

## v13.17 (2026-07-24) 🧺 GUDANG GANDA + VARIASI — bahan film makin kaya
- Keluhan bro: klip "itu-itu aja" tiap generate. Solusi 2 lapis (mesin preview/render/transisi v13.14-16 TIDAK disentuh — sesuai perintah kunci).
- LAYER 1 — PIXABAY jadi gudang ke-2 (BUKTI dulu, bukan nebak): API videos terdokumentasi (per_page 3-200, 100req/mnt, CDN cdn.pixabay.com); dicek via curl → TANPA header CORS → SEMUA URL Pixabay (video+thumb) server-rewrite lewat GERBANG `/api/hcnsec/proxy-audio` (regex-nya sudah loloskan video/mp4 & octet-stream — 0 bedah). Hasil Pexels+Pixabay DIANYAM selang-seling; id Pixabay +900.000.000 (anti-tabrakan anti-kembar); `by` diberi "· Pixabay" (permintaan lisensinya: tampilkan sumber). Kunci opsional: tanpa PIXABAY_API_KEY → Pexels saja; tanpa dua-duanya → 503 TANPA_KUNCI (pesan baru). Gudang satu jatuh tak menyeret lainnya. `sumber:{pexels,pixabay}` jujur di respons.
- LAYER 2 — VARIASI pencarian: GAYA_EN 6 gaya sinematik bergilir per adegan (cinematic/slow motion/close up/wide shot/golden hour/aerial view) → kueri tiap adegan beda; `kueriDariScene(+gaya)` (≤6 kata, tema&emosi didahulukan); `pilihKlipBervariasi` = peringkat lama tapi juara DIACAK dari 5 kandidat terbaik (anti-kembar hindariId tetap prioritas). Sheet 🔄 manual & pilihKlipTerbaik lama tak diubah.
- UJI DULU: tests/stokgudang.test.mjs permanen (12 uji: jangkar tema, kata gaya, hemat kata, fallback, variasi >1 & ≤5, anti-kembar 0 bocor, fallback penuh, deterministik lama) 🏆; vidloop 🏆; vidplan 🏆; tsc 0 build 0; smoke PIXABAY_API_KEY di server chunk + "slow motion" di client chunk.
- PANDUAN KUNCI PIXABAY (kirim ke bro): pixabay.com → daftar gratis → buka pixabay.com/api/docs/ (key tampil di halaman itu) → Vercel project → Settings → Environment Variables → `PIXABAY_API_KEY` → Save → Redeploy (aktif setelah redeploy; tanpa key pun app tetap jalan Pexels-only).

### v13.17.1 tambalan — thumbnail Pixabay diblok GERBANG (415)
- Bukti live: video Pixabay via proxy 200/mp4 ✅, tapi thumb 415 — cdn.pixabay kadang mengirim `image/jpeg` dan regex media GERBANG belum mengakui `image`. Risiko: poster rusak → render bisa menggantung menunggu gambar.
- Bedah 1 baris: regex proxy-audio + `image|jpe?g|png|webp`. tsc 0 build 0 smoke OK.

## v13.18 (2026-07-25) 🗺️ SPRINT A ep.1: TRACK KETEMUAN — fitur yang ADA dibuat ketemuan
- Diagnosa jujur: track TERNYATA sudah CapCut-class (pinch zoom berjangkar + tombol fit ╫split, press-hold trim handle, reorder seret + auto-scroll tepi, magnet snap, split/dup/hapus/speed/transisi per klip, undo). Biang keluhan bro = PENEMUAN & label, bukan fitur minim.
- Bedah ADDITIF (mesin gesture CSS/JS tak disentuh): chip panduan gestur timeline (ditutup-able, persist `verve_tlhint_v1`, buka lagi via tombol "?" selalu-ada); tombol zoom −/+ berjangkar playhead + label "⤢ Pas" & "╫ Bagi" (dulu ikon murni); alat CLIP_TOOLS baru ◀Kiri/▶Kanan (moveSlide ketuk + pushHist, guard ujung).
- 7 patch page.tsx + CSS append-only (globals.css). tsc 0 build 0; smoke chunk ("Cubit", "Persempit timeline")+css chunk ✓; 3 suite uji video/stok tetap 🏆.
- Struktur penting TimelineV6 utk sesi depan: TL_MIN_PXS 0.6/MAX 140, PXS default, zoomAnchorRef, gstBind SATU PINTU gesture, CLIP_TOOLS@689/MAIN_TOOLS@674, onClipTool@1641, moveSlide@1699, removeSlideAt@1695, doSplitAtPlayhead, CLIP_TOOLS bar JSX@3226, Sutradara sendDirectorStudio@1811 (ctx kaya + ops + BANSOS CHAT verve_bansos_chat_v1 sudah ada sejak v12.3!), EditorSheets@3310, CSS .v6e-tl* di globals.
- LANJUTAN SPRINT B (disepakati berurutan): Sutradara — toleran typo, FAQ edit diperkaya di mesin bawaan /api/hcnsec/director, kartu perintah cepat di atas chat, ingatkan bro isi Dompet Bansos (menu Saya). LALU SPRINT C: tooltip "?", bersih label, tema.
