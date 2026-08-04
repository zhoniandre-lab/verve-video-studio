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

## v13.19 (2026-07-25) 🔧 PERBAIKAN FITUR MATI: Whisper cascade + Gambar AI sadar katalog
- Diagnosa 1 (screenshot bro): Gambar AI gagal "No available channel for step-image-edit-2/step-1.5v-image" = gatewaynya TIDAK menjual model itu. hcnsec.ts IMAGE_MODELS loop menawar model yang tak dijual → semua gagal.
- Obat 1: generateImage kini SADAR KATALOG — `katalogGambar()` (cache 10 mnt, pakai listGatewayModels v12.0 yang sudah ada): model dagangan nyata didahulukan + model image-ish lain dari katalog (regex: image|flux|seedream|doubao|dall|sdxl|sd3|imagen|kolors|hunyuan|ideogram|recraft|playground|dreamina, maks 4) ikut dicoba, daftar lama jadi ekor cadangan. Error sekarang menampilkan 5 entri katalog (minta bro kirim daftar itu kalau masih gagal).
- Diagnosa 2: Keterangan otomatis "dari kemaren blm berhasil" = transcribe cuma kenal HCNSEC; gagal → klien DIAM-DIAM pakai perkiraan cerdas ("nggak serasi").
- Obat 2: route transcribe cascade GROQ (GROQ_API_KEY, model whisper-large-v3-turbo, stempel per-kata — cara CapCut menyeraskan) → HCNSEC. Respons +`engine`. Kode jujur: TANPA_KUNCI_WHISPER / WHISPER_GAGAL (berisi alasan tiap mesin). Klien doAutoCaptions: engineName+whisperErr masuk flash ("diselaraskan X" vs "⚠️ perkiraan cerdas — AI belum jalan: ...").
- AKSI BRO: buat kunci Groq gratis (console.groq.com → API Keys) → Vercel env GROQ_API_KEY → Redeploy. Itu jawaban "CapCut pakai apa": ASR keluarga Whisper ber-stempel kata; Groq menghostingnya gratis.
- tsc 0 build 0; smoke server: api.groq.com+whisper-large-v3-turbo+Katalog gateway-mu ✓ client: flash jujur ✓.

## v13.20 (2026-07-25) ⚡ KETERANGAN OTOMATIS KILAT — biang "dengar lagu sampai habis" dibunuh
- Biang (bukti kode): jalur "Audio musik/suara" memutar lagu REALTIME + webkitSpeechRecognition → 1× durasi lagu (4½ mnt!) & waktu kata di-fake per segmen. Itu keluhan bro "harus dengar sampai habis + nggak serasi".
- Bedah: jalur itu kini panggil /api/hcnsec/transcribe (cascade Groq→HCNSEC — pembaca kata per kata hitungan detik), kata dipetakan ke baris via segmen; pendengar browser jadi CADANGAN dengan flash jujur "🐌 lagu didengarkan sepanjang durasi". Suara+teks TTS dikenal: instan (tak diubah). Whitelist transcribe +vercel.app (jalur proxy sendiri).
- Cara CapCut memang begitu: ASR ber-stempel waktu kata diproses server-side lebih cepat dari realtime — bukan mendengarkan ulang.
- tsc 0 build 0; smoke client ("hitungan detik, bukan dengar lagu", "jatuh ke pendengar browser") + server ✓.

## v13.21 (2026-07-25) 📦 WHISPER TERIMA BYTES — TERBUKTI live sebelum klaim
- Biang (screenshot bro): lagu proyek berbentuk blob:/upload HP → helper menolak "audio bukan URL online" → jatuh ke pendengar browser = "dengar lagu sampai habis". Dalih "Lirik lagu" pun diam-diam skip AI bila lagu blob (perkiraan = tak serasi).
- Bedah: route transcribe dukung multipart/form-data (bytes langsung) DI SAMPING JSON URL; fd per kandidat; helper klien transcribeAudio(src,hint,lang) SATU PINTU utk lirik & musik/suara; guard >4,5MB (batas body Vercel hobby) pesan jujur.
- BUKTI live (dites sebelum klaim): multipart file 2.100.342B → ok:true engine "Groq Whisper (gratis)" 19 kata; pintu URL lama tetap ok:true 18 kata (tak ada yang rusak).
- Catatan jujur: lagu HP >4,5MB ditolak dengan pesan (Vercel hobby body limit) — pakai link lagu online/generate.

## v13.22 (2026-07-25) ✂️📦 WHISPER LAGU BESAR — batas 4,5MB DITEMBUS (potong per bagian), TERBUKTI live
- Biang (keluhan bro "masih harus dengar lagu"): lagu HP 4–5 mnt (Suno dll) = 5–8MB → kena pagar unggah Vercel 4,5MB → v13.21 menolak jujur → klien jatuh ke pendengar browser 🐌 = "dengar lagu sampai habis" lagi.
- Bedah (5 titik page.tsx + 2 file BARU): src/lib/audiocc.ts — decode lagu SEKALI di HP (WebAudio, BUKAN didengarkan) → mono 16kHz (telinga asli Whisper) → potong per 100 detik → WAV PCM16 ±3,2MB/potong (di bawah pagar) → unggah multipart BERURUTAN → kata & segmen disatukan + offset waktu potong. Pagar >4,5MB di transcribeAudio kini manggil transcribeBlobBesar; dua panggilan (lirik & musik/suara) ikut melaporkan tahap ("📦 bagian 1/3").
- BUKTI live (tes_sebelum_klaim): WAV 16kHz mono PCM16 dirakit FUNGSI ASLI audiocc.ts → unggah multipart filename bagian-1.wav + hint + lang=id ke verve-video-studio.vercel.app/api/hcnsec/transcribe → HTTP 200 dalam **2,1 detik**, ok:true, **34 kata** berstempel per kata, engine "Groq Whisper (gratis)" — ucapan Indonesia ("Masih tersimpan bajumu...") tertangkap akurat. Rute server TAK disentuh.
- Estimasi lagu 277 detik: 3 potong × ±2–4 dtk → total ±10–15 detik (vs dulu 277 detik dengar realtime).
- Uji: tests/wavpotong.test.mjs BARU 29 cek 🏁 (rencana potong menutup durasi tanpa celah/tumpang, ukuran WAV ≤ pagar, PCM16 jepit, tajuk RIFF sah) + vidplan/vidloop/stokgudang tetap ✅; tsc 0; build 0; smoke literal "Lagu besar — AI membaca bagian" & "lagu tak bisa dibuka di HP ini" ✓.
- Benang merah file: DITAMBAH audiocc.ts & wavpotong.test.mjs; DISENTUH page.tsx (import, komentar+tanda, pagar→potong, 2 panggilan) & catatan ini; TAK disentuh: api/hcnsec/*, lahan-studio, recorder, editing, stockvid, hcnsec, css.
- Cadangan jujur: kalau decode gagal (format aneh/memori HP habis) atau AI server down → pesan jujur → fallback 🐌 pendengar browser tetap ada (tak dihapus).

## v13.23 (2026-07-25) 🔁 POTONG GAGAL ≠ VONIS DENGAR LAGU — coba-ulang otomatis + pesan jujur
- Momen: bro kirim screenshot toast "📦 Lagu besar — AI membaca bagian 3/3" → mesin potong JALAN sampai potong terakhir, tapi keterangan tak muncul; chip masih "148 kata" (sisa percobaan LAMA).
- BUKTI live skenario persis (lagu tiruan 277,5s, 3 potong berurutan 3,20/3,20/2,48MB ke transkripsi live): SEMUA ok 5,1–7,1 detik/potong, total ±19 detik, 372 kata tersambung offset benar (kata pertama @0,38s — terakhir @277,98s). ⇒ sisi server+format+multipotong sehat; kalau di HP macet di potong 3 = jaringan perangkat.
- Bedah (4 titik, 2 file): transcribeBlobBesar kini COBA-ULANG 1× otomatis per potong (jeda 2 detik, tahap "🔁 mencoba ulang sekali lagi"); kalau tetap gagal → hasil {ok:false, janganDengar:true, error:"bagian X/Y gagal 2× (...)"}; jalur musik/suara menangkap janganDengar → lempar error jujur merah "ketuk Buat keterangan sekali lagi" — TAK lagi lempar diam-diam ke pendengar browser 4½ menit. Pendengar 🐌 tetap ada untuk kasus non-unggahan (decode gagal / AI server down / lagu kecil).
- tsc 0 build 0; 4 suite ✅ (vidplan, vidloop, stokgudang, wavpotong); smoke ("mencoba ulang sekali lagi", "gangguan sesaat", janganDengar) ✓.
- MENUNGGU jawaban diagnostik bro (a/b/c/d): toast hijau→sukses? / 🐌? / merah? untuk menentukan sentuhan berikut (visibility sukses vs jaringan).

## v13.24 (2026-07-25) 📝👁️ KETERANGAN TAMPIL — hasil AI pindah dari "lapisan melayang" ke TRACK TEKS (akar keluhan bro: "proses sampai 3/3 tapi tidak tampil")
- Diagnosis jujur: periksa pelukis satu-satu — paintPreviewCaptions sehat, template "Default"→capStyle "capcut" kepilih, ccY 0,78 di-layar, ccSize normal, drawFrame memanggilnya tiap frame. MASALAH STRUKTURAL: jalur musik/suara menaruh hasil di capWords = lapisan melayang yang TIDAK kelihatan di timeline & hanya tampak kalau playhead melintas — pengguna menatap track dan melihat KOSONG = "keterangan tidak muncul". Beda dengan jalur Lirik yang menulis ClipText karaoke ke TRACK TEKS (kelihatan jelas di timeline).
- Bedah (3 titik page.tsx, REUSE 100% mesin Lirik — tak ada roda baru): helper capWordsToClips(ws,ccTpl,ccSize,ccY) → ChartText karaoke id lyr_ per baris segmen (karaokeWords dari stempel Whisper asli, offset potong sudah terbukti 0,38→277,98s); jalur musik/suara & suara+teks kini: pushHist → setCapWords([]) (lapisan melayang dikosongkan, tak dobel/ghost — konsekuensi: chip "N kata keterangan aktif" hilang, diganti baris NYATA di track) → insertFloatingTexts → seekPreview(baris pertama) = jarum lompat, keterangan TAMPIL SEKETIKA walau belum tekan ▶ → flash "💬 N baris keterangan MASUK TRACK TEKS 🎼".
- Bonus konsistensi: teks keterangan kini bisa digeser/edit satu-satu + ikut alat ⚓ nudge & export (jalur ClipText yang sama dengan Lirik).
- tsc 0 build 0; 4 suite ✅; smoke "MASUK TRACK TEKS 🎼" ✓.

## v13.25 (2026-07-25) 🔬 MODE KLINIS — berhenti nebak: setiap langkah keterangan otomatis direkam DI HP
- Konteks: bro murka "zonk, hapus semua aplikasi". Jawaban tim: TOLAK menghapus (aset kerja berminggu-minggu + 8 tag backup). Akar kegagalan debug selama ini: semua bukti hanya dari SISI SERVER (lulus), sisi HP buta → zonk beruntun. Solusi profesional: instrumentasi, bukan tebakan ke-4.
- Mesin (additive, 2 file): audiocc.ts — diagGaris(dtMs,ikon,teks) MURNI ("+12.3s ✅ ...", waktu dijepit ≥0, teks ≤140) + ccDiagMulai/ccDiag/ccDiagBaca (ring localStorage verve_cc_diag_v1, maks 90 baris); ccDiag tersebar di decode/rencana/per-bagian/unggah/gabungan + napas upload per potong 90s→150s (4G lambat). page.tsx — ccDiagMulai saat klik (jalur,templat,bahasa), log ukuran blob & pintu potong, balasan AI (kata/segmen), insert TRACK TEKS (+jarum), 🛑 janganDengar, 🐌 fallback, 💥 catch GLOBAL (catch kini ikut merekam!), panel <DiagPanel/> (biru, di DALAM sheet Keterangan — tak bisa terlewat/ketutup) dengan 🔄 segarkan & 📋 salin (clipboard).
- Insiden jujur: patch awal meletakkan ccDiag di ANTARA if/else → TS1128 → KETANGKAP gerbang tsc (tsc:2), diperbaiki in-place → tsc:0. Gerbang berfungsi persis seperti amanat bro.
- CATATAN diagnosa: flash hijau hanya 1,8 detik (setStageText timeout 1800) → konfirmasi sukses memang kilat; Log Klinis kini yang jadi bukti abadi sukses/gagal. Toast merah zIndex 81 DI ATAS sheet (toast 📦 tampak di screenshot bro) → batal dugaan ketutup.
- tsc 0 build 0; 4 suite ✅ (wavpotong 34 cek: +5 uji diagGaris); smoke "LOG KLINIS · jalur" & "verve_cc_diag_v1" ✓.
- MENUNGGU: satu foto/salinan LOG KLINIS dari HP bro kalau gagal lagi → bedah SATU titik pasti. Opsi B (sembunyikan tombol keterangan otomatis sementara) ditawarkan, belum dipilih.

## v13.26 (2026-07-25) 🧪 UJI KETERANGAN TAMPIL HULU→HILIR — PUTUSAN SANDBOX: rantai SEHAT
- Laporan bro paling jernih: "lirik itu memang ADA tapi TIDAK TAMPIL di videonya" + dugaannya "masih perlu edit-edit, nggak otomatis sesuai suara masuk".
- Pemeriksaan kode: paintFloatingTexts (editing.ts) melukis teks lepas-waktu pada jendelanya (start..start+dur, paintClipText clipT=t−start) dan dipanggil PREVIEW (page.tsx drawFrame) & EKSPOR (recorder renderSlideshow) — fungsi sama.
- Uji baru tests/keterangan_tampil.test.mjs (ekstrak+eval KODE ASLI: lyricTextStyle, capWordsToClips, insertFloatingTexts dari page.tsx + allClipTexts, paintFloatingTexts dari editing.ts): skenario bro 7 slide × 39,64s + 139 kata → 20 baris lyr_ karaoke sah (gaya #ffd93d, karaoke relatif pas) → 20/20 masuk track NOL dibuang diam-diam, mapping jendela benar → SEMUA 20 baris TERLUKIS pada detiknya (stub lukis perekam), tak bocor waktu, slide dipangkas pun tetap terlukis. 13 cek ✅.
- PUTUSAN DIDUKUNG BUKTI: kalau baris ADA dengan waktu X → PASTI dilukis pada X (preview & ekspor). ⇒ "lirik ada tapi tak tampil" berarti: (a) baris itu artifak "⚠️ perkiraan cerdas" lama (waktu MERATA — memang meleset = persis keluhan "perlu edit-edit"), atau (b) run tak pernah sukses sampai insert, atau (c) preview tak diputar ke detik baris itu. Penentu pasti: 🔬 LOG KLINIS (v13.25) di sheet.
- Dua macam keterangan dijelaskan ke bro: 🤖 serasi otomatis (stempel AI per kata — selaras, tanpa edit) vs ⚠️ perkiraan cerdas (meleset — perlu ⚓ geser).
- tsc 0 build 0; 5 suite ✅ (keterangan_tampil jadi permanen ke-5). Tidak ada perubahan src produk (tambah test + catatan).

## v13.27 (2026-07-25) 🧹 ANTI-ZOMBIE + EVENT ≠ SUMBER + TANPA SEGMEN ≠ SATU BATANG RAKSASA — screenshot bro jadi saksi ahli
- BUKTI HIDUP DI HP BRO (screenshot 14:58): Log Klinis jalan — lagu blob 6,26MB dibuka 1,5 detik, 3 potong direncanakan, bagian 1/3 beres 33 kata Groq · lirik ASLI berwaktu nyata di ⚓ (00:46 "kasih", 01:01, 01:09, 01:16) · screenshot 14:59 karaoke "Lagi-lagi Terima" TAMPIL KUNING DI VIDEO. Rantai resmi hidup di perangkat nyata.
- Tiga biang dibedah dari screenshot yang sama: (A) teks zombie raksasa (label potongan "Lagi-lagi Teri", durasi ≈ lagu penuh) dari percobaan gagal lama MENUMPUK tak pernah dibersihkan → abc ×29 & track tampak satu batang teal (chip teal bertumpuk sama warna); (B) bila segmen kosong SEMUA kata jatuh ke baris 0 → 1 teks selebar lagu (pabrik zombie); (C) onClick={A.doAutoCaptions} menyeret EVENT ketukan sebagai forceFrom → sumber tombol terbajak + ccFrom terkontaminasi objek (judul log "[object Object]").
- Tambal (6 titik, reuse pola "Sinkron ulang" Sutradara): bersihkanLirikLama() dipanggil sebelum insert DI KETIGA jalur (lirik/musik/suara) → re-run = GANTI, idempoten, zombie termusnahkan; fallback pengelompok per jeda hening >1,1 detik bila segmen kosong (tak ada lagi baris tunggal raksasa); okFrom hanya menerima string (event diabaikan → pilihan sumber dihiraukan lagi & judul log benar).
- tsc 0 build 0; 5 suite ✅; smoke ("typeof forceFrom", "tanpa segmen", "jeda hening", "lirik lama diganti") ✓.
- Catatan UX jujur utk bro: waktu unggah di 4G-nya ±23 detik/potong (sandbox 5–7) → total run ±60–70 detik; itu batas jaringan, bukan kode.

## v13.28 (2026-07-25) 🎧 SUTRADARA PAHAM LOKAL + KUNCI STABIL — permintaan bro setelah murka reda ("skrng dah berhasil")
- Momen: bro kembali — keterangan otomatis BERHASIL di HP-nya (zombie ×29 terbuang, lirik menyala di video). Minta: (1) kunci biar tak rusak lagi, (2) Sutradara langsung paham "keterangan otomatis", (3) boleh tambah spektrum? tak merusak render kan?
- Bedah: sendDirectorStudio dulu MENGIRIM SEMUA ke /api/hcnsec/director — tanpa kunci bansos/HCNSEC, paham-tidak-paham terserah AI jauh. Tambal (2 titik, additive): detektor MURNI tingkat modul — gram2/miripKata (Dice bigram)/adaKataMirip/mintaKeteranganOtomatis — objek {keterangan,caption,subtitle,lirik,karaoke}×{otomatis,sinkron,selaras,pasang,buat(‑kan),bikinkan,nyalakan,jadi,gas}, ambang 0,55/0,58, gerbang ANTI-HAPUS ({hapus,buang,hilangkan,bersihkan,delete,reset} ≥0,62 → tolak). Pintu lokal SEBELUM antre AI: dirPush "📝 Dipahami lokal" + gasStudioOp({op:"auto_caption"}) (mesin lama — sumber pintar lirik/musik/suara + anti-zombie v13.27 ikut otomatis). Rute AI/ops lain TAK disentuh.
- Uji baru tests/sutradara_paham.test.mjs (suite ke-6, kode ASLI): 13 frasa positif (termasuk "ketermgan otimatis") + 12 frasa harus-tolak (hapus/geser/curhat/transisi/filter) + satuan miripKata — 30 ✅.
- KUNCI: tag v13.28-sutradara-paham-keterangan-lock + backup branch + ls-remote (ritual sama, HEAD stabil 6 suite 🏁).
- Spektrum (jawaban berbasis kode, recorder.ts): render SUDAH pre-compute spectrum LUT di awal ("Menganalisis audio" — downsample 11kHz mono), stiker @bars/@wavepro/@ring dilukis dari data musik RIIL per frame pada lapisan overlay terpisah (cache A/OV1/B/OV2) → gambar video dasar TAK tersentuh; ongkos hanya analisis beberapa detik. Keluhan lawas "bar dikit & ngk jelas" pernah ditambal (v13.9, batang tak menciut jadi titik). ⇒ tambah spektrum AMAN utk kualitas render.
- tsc 0 build 0; 6 suite ✅; smoke "Dipahami lokal: minta keterangan otomatis" ✓.

## v14.0 NGOMONG = TEKS (2026-07-26) — CALON, menunggu sah-kunci bro
Permintaan bro: alat-alat Voicebox (46.8k★) yang bisa jalan di kita. Dikerjakan PERTAMA (protokol: satu-satu): 🎤 tombol mic → rekam → Whisper rute sendiri → teks terisi. Kode 100% tulisan sendiri (ide saja diambil). Komponen mandiri src/lib/micteks.tsx (MediaRecorder + FormData → /api/hcnsec/transcribe; auto-stop 60d; pesan jujur tiap tahap). Dipasang 3 titik: input Sutradara (bicara perintah!), niat cerita (step 1), naskah (baris adegan). BUKTI LIVE pre-deploy: tes_bicara.wav → produksi: HTTP 200 "Masih tersimpan bajumu di lemari kamar ibu…" + per-kata. Gerbang: tsc 0, build 0, 6 suite ✅, smoke css+js ✓. Dirilis di atas dasar beku v13.28 (de817ff). Tag CALON (bukan lock) — lock sesudah bro buktikan di HP.

## v14.1 WAJAH CAPCUT (2026-07-26) — CALON, menunggu sah-kunci bro (GERBANG 1 rencana induk)
Bro pilih "GAS 1": studio bagus + lengkap + tampilannya, mulai gerbang visual (risiko NOL). Isi: penggaris 26px + angka 10.5px terang bergaris tick, playhead PUTIH + kepala segitiga drop-shadow (dulu teal menumpuk balok lagu), klip terpilih bingkai PUTIH + handle 22px sasaran jari, rail kiri 46px, kontrol bulat konsisten, timer 14.5px tabular, toolbar seragam, chip teks/balok audio dihaluskan. PEMBATAS TRANSISI: chip 26px utuh SELALU tampil tepat di tengah sambungan antar objek — LEBIH AMAN dari rancangan sprint lama (v13.32 menempel di .v6e-track + mengubah position track): kini chip menjadi anak BARIS klip (memang position:relative) → .v6e-track, txtdur, lanehead, playback, simpan-muatan, gesture (gstBind/armDrag/reorder/trim/pan) = NOL disentuh. Gelembung-waktu-seret sengaja DITAHAN untuk gerbang 2 (disiplin satu-perubahan). Bukti sandbox: geometri pembatas 5/5 ✓ (chip center = pusat celah, tumpang simetris 9px, celah 8px tertutup), tsc 0, build 0, 6 suite ✅, smoke: divider ada di JS+CSS, gelembung 0, chip lama 0, track-tanpa-relative ✓. Diff: hanya page.tsx + globals.css (append-only). Dirilis di atas 8b0e253 (v13.28+v14.0). LOCK menunggu bukti foto HP bro + v14.0 mic juga masih CALON.

## v14.2 KETUK = BLOK / LEPAS (2026-07-26) — CALON, menunggu sah-kunci bro (GERBANG 2 sub-A)
Bro: "Lanjut". Sub paling kecil & aman dulu: ketuk 1x gambar = BLOK (bingkai putih + handle + bar alat), ketuk gambar yang sama lagi = LEPAS semua blok → normal biasa; ketuk gambar lain = pindah blok. Persis 2 baris: induk onSel paham id kosong (setSelId("") + setClipBar(false)); onClipDown kirim "" bila sid === selId. Audit: onHdlDown sudah stopPropagation → ketuk handle ❮❯ TIDAK ikut toggle (dibiarkan utuh: selalu memilih klipnya sendiri). Gesture/simpan/playback/rute = NOL disentuh (diff 2 baris, 1 file). Bukti: truth-table toggle 4/4 ✓, tsc 0, build 0, 6 suite ✅, smoke sumber 1+1 & onSel terhubung 6 titik ✓. Menumpuk CALON di atas v14.1 (bukti HP bro utk 14.0/14.1 masih ditunggu).

## v14.3 TOMBOL KIRIM LEGA (2026-07-26) — CALON (bukti HP bro: ➤ sebelah mic kepesek/kepotong)
Foto HP bro 15.26: baris input Sutradara meluber, ➤ terpotong ujung. Biang: input punya min-width bawaan UA (~180px) tak bisa menyusut → mendorong ➤ keluar; 🎤/➤ tanpa flexShrink. Obat struktural (mustahil meluber di layar selebar apa pun): input minWidth:0 (menyerap sisa), baris alignItems center, 🎤 span flexShrink:0 (berlaku 3 titik: Sutradara/niat/naskah), ➤ flexShrink:0 + terkunci 44x40px sasaran ibu jari + title "Kirim perintah ke Sutradara". Layout panel/positioning/gesture/data = NOL disentuh. Jujur: simulasi angka sandbox tak mereproduksi piksel HP bro persis; jaminan bersifat struktural (tombol terkunci, input elastis). Bukti: tsc 0 build 0, 6 suite ✅, smoke sumber 1+1+1 + chunk "Kirim perintah ke Sutradara" ✓. Menumpuk CALON di atas v14.2.

## v14.4 PAMIT — pagar blokir-diri (2026-07-26) — atas permintaan tertulis bro
Episode marah ke-4: bro putuskan pergi & minta (1) hapus semua (TETAP kami tolak — langkah hapus-diri 30 dtk sudah diserahkan sepenuhnya ke tangannya), (2) blokir aksesnya ("tolong blokir ip saya agar tidak bisa masuk", lalu "lanjutkan dan buat sekarang"). IP HP operator ID berputar & tak bisa kulihat dari sini → solusi lebih kuat & jujur: BLOKIR-DIRI per-perangkat. 2 file BARU, 0 baris lama disentuh: src/middleware.ts (cookie VERVE_PAMIT=1 → semua halaman diganti pintu keluar 🚪; tanpa cookie = aplikasi 100% normal; /pamit diloloskan) + src/app/pamit/page.tsx (tombol merah BLOKIR SAYA SEKARANG + batal; cookie 10 thn + localStorage). JUJUR disampaikan ke bro: blokir terbuka lagi bila data situs dibersihkan — karyanya tidak pernah dihapus (tag & branch utuh). Bukti live server produksi di sandbox: tanpa-cookie=normal ✓, cookie=pintu ✓, /pamit=tombol ✓, /pamit+cookie=lolos ✓; tsc 0, build 0, 6 suite ✅. Dasar beku v13.28 lock (de817ff). Tag CALON — aktif HANYA bila bro sendiri menekan tombol.

## v14.4.1 PAMIT BERSIH + README SERAH-TERIMA (2026-07-26) — PENGAKUAN & PERBAIKAN KELIRU DEPLOY
Kesalahan milik sendiri, kuakui: rolbalik kemarin hanya memaksa REMOTE ke de817ff; copy lokal tertinggal di ffcb96a → commit PAMIT f5395bf tanpa sadar menempel DI ATAS lapisan tolak v14.0–v14.3 (micteks, pembatas-tumpuk, ketuk-lepas ikut hidup lagi). Terbukti via `git diff de817ff..f5395bf --stat` (micteks.tsx +95). f5395bf diabadikan di branch `backup/keliru-ffcb96a` sebagai pelajaran: SELESAI force-push, SELALU `git reset --hard` ke hash kunci & verifikasi `git diff kunci..HEAD --stat` sebelum menambal. PERBAIKAN: main dibangun ulang murni = de817ff + src/middleware.ts + src/app/pamit + README.md + CATATAN — bukti `git diff de817ff..HEAD --stat` tepat 4 berkas, micteks lenyap dari pohon. README.md = SERAH TERIMA penuh untuk AI selanjutnya (bro lanjut dengan Claude): status beku, ritual sesi, peta repo, arsitektur (TimelineV6/gstBind/simpan-muat/render/gateway), tabel SEJARAH LUKA (5 pelajaran + lokasi bukti tiap eksperimen), gates 6 suite + live-server, protokol 1-perubahan-1-bukti, pekerjaan terbuka berurutan, kunci localStorage terlindung, daftar 60+ tag/branch sebagai peta harta, profil HP-only bro. Gates: tsc 0, build 0, 6 suite ✅, live 4 skenario pamit ✅ (diulang pada pohon final). Tag v14.4-pamit-calon dipindah ke komit bersih ini.

## v14.5 SUARA PAHAM + SIMPAN JUJUR (2026-07-26) — CALON, menunggu kunci bro (2 pesanan bro)
PESANAN-1: "suara tadi buat aja lagi, kualitas lebih bagus & lebih paham maksud pengguna, tanpa merusak struktur". Jawaban = src/lib/ngomong.tsx (NGOMONG v2, tulis ulang dari nol): penangkap echoCancellation+noiseSuppression+autoGainControl+mono; pilih mime berlapis (opus→webm→mp4→ogg); hint kamus dunia-studio per konteks (Sutradara/niat/naskah) disuntik ke Whisper → kata fitur lebih tertangkap; teks diteruskan ke mesin maksud yang ada (Sutradara Dice-bigram toleran typo); gerbang hemat <0,7dtk/blob<4KB tak bakar kuota; auto-stop 60dtk; abort 25dtk anti-gantung 4G; pesan jujur tiap kegagalan; bersih total saat lepas komponen. Terpasang 3 titik, 0 struktur diubah (diff 4 berkas: 1 baru, 3 sisipan 1–2 baris + CSS append). Rute server tak disentuh — dibuktikan LIVE produksi: wav+hint baru → HTTP 200 kata-berwaktu ("Masih tersimpan bajumu…").
PESANAN-2 (audit busuk): hasil = (a) TAK ADA service worker/PWA/CSS busuk aktif; (b) TERTUDAK "setting balik ke versi sebelum di-edit": persistSnapshot menelan gagal-tulis via catch{} DIAM-DIAM (manual 💾/autosave/tutup) → diperbaiki SIMPAN-JUJUR: gagal setItem = flash ⚠️+instruksi, sukses = dibuktikan baca-balik sebelum bilang "✅"; (c) draft titipan tak ketemu = kini dikabari (tidak senyap). Proses sempat terhenti gerbang sendiri (jangkar setItem 2× — fungsi di baris 492 sengaja TIDAK disentuh), diteruskan jangkar konteks ketat. Bukti: replika simpan 2 kasus ✓, lab mime+durasi 5/5 ✓, smoke JS 6/6 + CSS 7 ✓, tsc 0, build 0, 6 suite ✅. README status diperbarui.

## v14.6 INTERNASIONAL A — SAKLAR BAHASA (2026-07-26) — CALON, menunggu kunci bro
Bro: "Saya mau go internasional" → tangga A (kecil & aman). TEMUAN: saklar bahasa keterangan otomatis (ccLang 5 bahasa) SUDAH ADA di UI sejak lama, TAPI bug laten: pilihan non-id dikirim "" → rute server maksa "id" (baris 81 default) → lagu Inggris ditranskrip seolah Indonesia. PERBAIKAN 1 baris: kirim (ccLang).slice(0,2) — bukti tabel dulu-vs-kini: en/jv/su/ms kini dihormati server ✓. TAMBAHAN: 🎤 NGOMONG ikut saklar — chip 🌐 di header Sutradara memutar 🇮🇩ID 🇬🇧EN JV SU 🇲🇾MS (ingat verve_miclang_v1); komponen kini menerima prop lang (default id); kamus hint Indonesia HANYA dikirim utk id (bahasa lain dibiarkan bersih anti-bias). Wizard niat/naskah SENGAJA tetap Indonesia (niche konten bro). Struktur/data/gesture = NOL (6 titik kecil; diff: page.tsx 4, ngomong.tsx 2). Bukti: tabel bug ✓, putaran 5 ✓, hint-bersih ✓, tsc 0 build 0, 6 suite ✅, smoke miclang+chip ✓, pipa live terima lang=en ✓. JUJUR: kualitas transkripsi bahasa asing yang sesungguhnya dinilai dari HP bro (ngomong/lagu Inggris) — itu gerbang kuncinya.

## v14.7 RENDER JAGA (2026-07-26) — CALON, menunggu kunci bro
Luka semalam (nyata & menyakitkan): render 5–20 mnt mati saat bro menunggu & mulai dari awal → jadwal upload YouTube kesiangan. Diagnosis berbasis kode: (1) wake-lock ADA tapi HP mencabutnya diam-diam saat minimize/pindah aplikasi & kita tak pernah memasangnya ulang; (2) render = perekaman waktu-nyata (lagu 7 mnt = render 7+ mnt) → minimize membekukan kanvas+audio; (3) TIDAK ada mesin lanjut-dari-titik-mati (diakui hutang teknis;olahan penuh = rencana C render-per-bagian, bedah lebih besar, belum dijanjikan). Isi v14.7 (satu fungsi doRender + 1 banner, diff 1 berkas): (a) wake-lock dipasang ULANG otomatis tiap kembali visible (visibilitychange); (b) banner merah "🔴 RENDER JALAN — JANGAN tutup/minimize/pindah" pointer-events:none; (c) DETEKTOR MACET JUJUR: denyut onProgress, frame diam >4dtk saat layar terlihat → kabar manusiawi (bukan diam membisu); semua jagaan dicopot rapi di finally. Proses: 1 bug buatanku sendiri tertangkap gerbang (komentar // tengah baris memotong fungsi) → diperbaiki jadi blok, tsc pun hijau. Bukti: replika penjaga 6/6 ✓, tsc 0, build 0, 6 suite ✅, smoke 2 string ✓. JUJUR: ini mengurangi kematian & mengabari — BUKAN lanjut dari titik mati. Panduan malam aman sudah diberikan (charger + layar 10mnt + jangan pindah aplikasi + Mode Ngebut + RAM lega).

## v15.0 KUNCI v14.5/6/7 (2026-07-26) — angkat 3 CALON ke LOCK
Setelah 7 permintaan bro dijelaskan dengan bahasa sendiri ("tombol transisi tidak ganggu / handle pangkas sensitif / geser kemana saja / play stop saat disentuh / lirik pas audio / render cepat / kunci + 2 arah / sutradara pintar"), kami sepakati: kunci dulu 3 CALON yang sudah jadi (v14.5 SUARA PAHAM + SIMPAN JUJUR, v14.6 SAKLAR BAHASA, v14.7 RENDER JAGA) supaya ndak rusak lagi, BARU kerjakan 7 permintaan berurutan. v15.0 = KOMIT DOKUMENTASI MURNI, tidak ada perubahan kode. Diff: hanya CATATAN_KUNCI.md (catatan ini). Bukti: tsc 0, build 0, 6 suite ✅ (vidplan, vidloop, stokgudang, wavpotong, keterangan_tampil, sutradara_paham), smoke css chunk ✓. Tag lock: v15.0-kunci-v14-lock; backup branch: backup/v15.0-kunci-v14-calon. Setelah bro kunci di HP → masuk v15.1 (handle pangkas sensitif), v15.2 (transisi tengah), v15.3 (play stop), v15.4 (lirik pas), v15.5 (render cepat — Combo C Web Worker + frame skip + audio parallel), v15.6 (sutradara pintar 8 niat). 1 perubahan = 1 bukti = 1 tag, ndak ada klaim "beres" tanpa bukti HP.

## v15.1B HANDLE PANGKAS LEBIH SENSITIF + ANTI-BINGUNG ARAH (2026-07-26) — CALON
Bro: v15.1 (22px) masih KURANG SENSITIP. Permintaan: (1) lebih mudah dicubit, (2) saat jari sudah kena, ngikut kemana-mana, (3) JANGAN bingung arah (kiri yang diperpanjang, bukan kanan). Bedah CSS (.v6e-clip .hdl, 1 file globals.css, REPLACE v15.1): LEBAR 22px → 28px; IKON PANAH JELAS ‹ (kiri) / › (kanan) — BUKAN ‖ ambigu; font 14px → 20px, :active 28px; glow tosca 2.5px ring; ZONA TANGKAP +10px → +24px (di LUAR visual, jari tidak pernah lepas); transition 120ms → 80ms (responsif); background alpha .92 → .96. TIDAK disentuh: gesture handler onHdlDown (v13.28), page.tsx, semua 6 suite. Bukti: tsc 0, build 0, 6/6 suite hijau, smoke hdl.l::after{content:‹} + hdl.r::after{content:›} di chunk CSS ✓. Diff: 14 baris +, 11 baris -. Tag calon: v15.1B-handle-pangkas-sensitif. Lock final: setelah bro cubit & konfirmasi "lebih gampang" + "tidak bingung arah".

## v15.1 HANDLE PANGKAS SENSITIF (2026-07-26) — lebih mudah dicubit (CALON, DITOLAK bro)
Permintaan bro: "tombol kayak pemanah di ujung objek buat panjang pendek bisa atur, lebih mudah saat saya mau btarik gambar, lebih sensitip". Bedah CSS PURE (.v6e-clip .hdl, 1 file globals.css, append-only): LEBAR 15px → 22px (standar CapCut, gampang dicubit ibu jari Samsung); font 10px → 14px + berat 900 (simbol ‖ lebih jelas); glow tosca + box-shadow 0 0 0 2px + 0 2px 8px (kelihatan di timeline gelap); AREA TANGKAP +10px via ::before (di LUAR visual, TIDAK motong clip); :active = teal + scaleX 1.18 (umpan balik saat disentuh). TIDAK disentuh: .v6e-clip JSX/page.tsx (gesture handler onHdlDown sudah ada di v13.28), .v6e-track, .v6e-trans-chip, .v6e-playhead, simpan-muat, semua 6 suite. Bukti: tsc 0, build 0, 6/6 suite hijau, smoke .v6e-clip .hdl di chunk CSS ✓. Diff: 13 baris +, 4 baris -. Tag calon: v15.1-handle-pangkas-sensitif. Lock final: setelah bro cubit handle di HP & konfirmasi "lebih gampang". Lanjut v15.2 TRANSISI TENGAH.

## v15.2 TRANSISI TENGAH (2026-07-26) — chip pindah ke BARIS BARU (CALON)
Bro: "Tombol transisi tadi berada di tengah antara objek biar tidak ganggu saat saya mau geser objek mau perpanjang atau mau pendekin". Bedah (1 file page.tsx + 1 file globals.css):
- HAPUS chip .v6e-trans-chip dari DALAM .v6e-clip (yang dulu ketutup handle pangkas/geser)
- TAMBAH chip .v6e-trans-mid di PARENT .v6e-track, posisi absolute tepat di tengah celah antara 2 klip
- Class baru .v6e-trans-mid: 22px tosca, border tosca, scale 1.18 saat disentuh
- Posisi centerX = sum(clipW 0..i) + clipW(i) + 2 (tengah celah 4px)
- click handler → p.onTrans(s.id) → sheet Transisi dengan klip-i aktif
TIDAK disentuh: handle pangkas (.hdl) tetap di dalam clip; gesture drag/reorder clip; sheet Transisi (tool === 'transisi'); .v6e-clip JSX; semua 6 suite. Bukti: tsc 0, build 0, 6/6 suite hijau, smoke .v6e-trans-mid di chunk CSS ✓. Diff: 36 baris +, 11 baris -. Tag calon: v15.2-transisi-tengah. Lock final: setelah bro cubit chip tengah & konfirmasi "tidak ganggu handle pangkas/geser".

## v15.2B TRANSISI TENGAH ALA CAPCUT + GAMBAR LEBIH BESAR (2026-07-26) — CALON
Bro kirim contoh CapCut sebagai referensi. 2 keluhan:
1. Chip transisi di VERVE (tosca 22px) KEBESARAN — CapCut cuma garis putih TIPIS
2. Gambar di track VERVE (default 56px/dtk) KEKECILAN — CapCut tampil ukuran sebenarnya

PERBAIKAN ALA CAPCUT (1 file page.tsx + 1 file globals.css):
- 🔀 v15.2 (tosca 22px chip) → v15.2B (GARIS PUTIH TIPIS 3px ala CapCut, glow tosca saat disentuh jadi 5px)
- 📏 Default PXS 56 → 72 (CapCut-style: gambar lebih besar di track, enak dilihat tanpa zoom)
- 📏 Min clipW 38 → 80 (gambar tetap jelas walau klip 1 detik)
- 📏 Max zoom PXS 140 → 180 (makin deket = makin gede, bisa lihat detail)
- 📏 Default tlPxs 56 → 72 (sesuai PXS)

TIDAK disentuh: handle pangkas (.hdl), gesture drag/reorder/trim, sheet Transisi, semua 6 suite. Bukti: tsc 0, build 0, 6/6 suite hijau, smoke `v6e-trans-mid{width:3px;background:#fff}` + hover `width:5px;background:#19c2b8` di chunk CSS ✓. Diff: 17 baris +, 16 baris -. Tag calon: v15.2B-transisi-capcut. Lock final: setelah bro bilang "garis putih sudah pas & gambar lebih besar".

## v15.2C TRANSISI TENGAH STICKY (2026-07-26) — CALON
Bro perbandingan CapCut vs VERVE: "Tombol transisinya mandak situ aja terus dan belum berada di posisi tengah tengah antar objek, dia kayak masih masuk di dalam objek, itu slah. Dan cukup kecil aja sebagai penanda, nanti ketika saya pilih transisi baru dia mengikuti gambar transisinya apa".

MASALAH: chip diam di posisi awal (offsetX statis), tidak bergerak saat handle pangkas / drag clip. CSS .v6e-track tidak punya position:relative, jadi child absolute jadi ke-anchor ke parent lain.

PERBAIKAN (1 file page.tsx + 1 file globals.css):
- v15.2B (garis 3px) → v15.2C (tetap garis 3px, TAPI POSISI STICKY ke ujung kanan clip-i)
- offL = sum(clipW 0..i-1) + (i * 4px gap) → memperhitungkan gap 4px di flex parent
- centerX = offL + clipW(i) + 2 → titik tengah celah antara clip-i dan clip-(i+1)
- Chip OTOMATIS bergerak saat handle pangkas / drag clip (re-render dari parent reaktif)
- CSS: .v6e-track tambah position:relative → anchor posisi absolute child

TIDAK disentuh: handle pangkas (.hdl), gesture, sheet Transisi, semua 6 suite. Bukti: tsc 0, build 0, 6/6 suite hijau. Tag calon: v15.2C-transisi-sticky.

## v15.2D TRANSISI TENGAH STICKY ala CapCut — FIX POSISI CHIP (2026-07-26) — CALON
MASALAH v15.2C: chip transisi di-render DI DALAM wrapper per-klip `<div style={{display:"flex", position:"relative"}}>`. Wrapper ini child dari `.v6e-track` (display:flex, gap:4px). Karena wrapper punya position:relative sendiri, chip `position:absolute; left:centerX` dihitung dari wrapper (lebar = clipW(i)), BUKAN dari track. MAKANYA CHIP DIAM DI TEMPAT (centerX selalu pas di ujung wrapper yang cuma selebar klip).

Solusi v15.2D (RESET PENDEKATAN):
1. **Hapus wrapper per-klip** — render clip LANGSUNG sebagai flex child di `.v6e-track` (sibling flex)
2. **1 OVERLAY absolute** 1 layer (di LUAR slides.map) yang nge-render SEMUA chip transisi sekaligus — child absolute di-anchor ke `.v6e-track` (position:relative) → BERGERAK otomatis saat handle pangkas / drag clip
3. Clip tetap flex item dengan `flex:0 0 auto` dan `width: clipW(i)` → layout track tetap, gap:4px tetap
4. Chip 2px putih tipis (ala CapCut mobile), 5px tosca saat disentuh, TIDAK ada wrapper yang nge-block
5. Pointer events: overlay=none, chip=auto → tap ke clip gak keganggu, tap ke chip kena

Bukti: tsc 0, build 0, 6/6 suite hijau, smoke `v6e-trans-overlay + v6e-trans-mid{width:2px}` di chunk CSS ✓.
Diff: page.tsx (1 blok) hapus wrapper per-klip + tambah overlay absolute di .v6e-track; globals.css tweak chip 3px→2px + .v6e-trans-overlay class.
Tag calon: v15.2D-transisi-capcut-fix. Lock final: setelah bro bilang "kunci".

## FASE-A + A.2 (2026-08-04, malam) — jam tunggal & berhenti di ujung
- **FASE-A `6ba91fb` (tag `v15.3-jamtunggal-calon`)**: keputusan jam preview diekstrak ke modul murni `src/lib/studio/clock.ts` (totalAllOf / decideTick / resolveSeekTarget / manualAfterMasterEnd) — 1 pintu keputusan, tanpa ubah perilaku. v15.3 tap-panggung=stop dikirim (stopPreview di baris pertama onStageDown; idempoten). Penjaga: `tests/jamtunggal.test.mjs` (33 cek).
- **FASE-A.2 (tag `v28.7-berhenti-ujung-calon`)**: BUKTI rekam layar user (frame-by-frame): saat PLAY sinkron SEHAT; saat film habis → garis melejit ke 00:00 & panggung melompat ke frame basi tengah klip-1. Keputusan user: ala CapCut. Bedah 3 stub: (1) cabang end tick() → setCurT(totalAll)+drawFrame(totalAll) (tetap di ujung; play lagi → resolveSeekTarget → 0); (2)+(3) repaint terjadwal 150ms di stopPreview & seekPreview (deck video parkir ASYNC → anti frame basi). Penjaga: `tests/berhentiujung.test.mjs`.
- Pelajaran: rekaman layar via link Google Drive + bongkar frame (ffmpeg tile + md5) = cara pasti diagnosis bug sync tanpa nebak. Simpan metodenya.
- **FASE-A.3 (tag `v28.8-satu-penggaris-calon`)**: BUKTI rekam layar user dibongkar per-0,1d (python+pillow): panggung jalan 3,6d/objek (3,0+transisi 0,6), strip melabeli 3,0d → drift menumpuk +0,6d/objek, film "habis" di rasa-tengah. AKAR: DUA penggaris — mesin buildTimeline plus-model (starts/total memuat tdurs; dipakai panggung+eksportir+gif) vs clipW() strip yang menghitung durasi murni. BEDAH 1 garis: clipW = (durs+tdurs)×PXS0 → SEMUA geometri strip (lebar, drag, chip, konten) turunan clipW otomatis sepenggaris. Ruler ticks & dispTotal memang sudah pakai timeline.total; garis penanda fixed-tengah + scrollLeft=curT×PXS0 sudah skala sama. Penjaga: tests/satupenggaris.test.mjs (Σ strip == timeline.total×PXS; pembatas objek == starts).
- **FASE-A.4 (tag `v28.9-persis-pas-calon`)**: penyempurnaan presisi — celah flex 4px antar-thumbnail menggeser pembatas ~0,06d/klip (chip pun menghitung +4px). Bedah: jalur video gap:0 (jalur lain tak diubah), napas visual 4px jadi border transparan border-box DI DALAM clipW (border-box → tak menggeser skala), chip transisi tepat di pembatas mesin, pitch reorder = clipW murni. Test: satupenggaris ditambah cek wiring A.4 + bukti ∀t (strip-objek == mesin-objek di semua sampel waktu). CATATAN SESI: workspace snapshot bisa mengembalikan git ke titik lama — selalu verifikasi log lokal vs remote sebelum bedah (insiden A.3 hilang lokal, aman di remote → dipulihkan via fetch+ff).
- **FASE-LAHAN BEBAS LONCAT (2026-08-04, tag `v29.0-lahan-bebas-loncat-calon`)**: wizard 9 langkah Lahan Studio kini BEBAS DIKETUK semua (permintaan user: "ke 3 bisa, langsung ke 9 juga bisa"). canGo (gembok berurutan) dimusnahkan → langkahSiap[] menghitung kesiapan dari DATA (✓ jujur, anti done-palsu). Rel jadi sticky kaca + bar kemajuan X/9 + tooltip per langkah. Loncat ke langkah 4/9 tanpa bahan → kartu peta-bahan (chip lompat ke langkah prasyarat), BUKAN halaman kosong. Aksi final tetap digembok syarat datanya sendiri (merge dkk). CSS baru: lh-steps-wrap/lh-prog*/lh-empty/lh-chip.ok/kurang. Penjaga: tests/lahan-bebas-loncat.test.mjs (rumus ASLI diekstrak + wiring bebas + persist step). CATATAN SESI: rollback snapshot ketiga kalinya — ritual pemulihan fetch+ff lagi-lagi menyelamatkan (remote tak pernah terkontaminasi).
- **FASE-LAHAN L2 PROFESIONAL (2026-08-04, tag `v29.1-lahan-profesional-calon`)**: tiap langkah kini berkepala seragam profesional (kepalaLangkah: LANGKAH k/9 · status bahan ✓/⬜ · tujuan blak-blakan · chip 'butuh' lompat ke prasyarat) + peta LANGKAH_BUTUH eksplisit (2←1, 3←2, 4←1,2, 5←4, 6←4, 7←6, 8←6, 9←7,8). Micro-copy jujur: 3 titik cetak judul kosong diberi fallback. CSS lh-stephead*. Konten & alur aksi tiap langkah TIDAK diubah. CATATAN SESI: rollback snapshot ke-4 — file kembali ke 4ea8002; pulih dengan trik patch-vs-base (git show 4ea8002:file sebagai base, diff → apply ke tree b42c4e4). DIFERENSIAL selalu diverifikasi visual sebelum commit.

---

## FASE LAHAN L3 — FONDASI KREDIT/SALDO (2026-08-04)
- TUJUAN: persiapan monetisasi Fase D — setiap panggilan AI berbayar TERCATAT otomatis (fitur, model, penyedia, ok/gagal, durasi ms, err tersensor). BELUM ada blokir/saldo/harga — murni fondasi pencatatan.
- DISENTUH: src/lib/ledger.ts (BARU — catatKredit fire-and-forget + potongErr sensor kunci + fiturDariPath + agregatRingkas murni), src/lib/hcnsec.ts (stub 3 titik di postJson: sukses teks, sukses biner TTS, gagal — mencakup teks/gambar/tts/video), src/app/api/hcnsec/music/route.ts (stub 1 titik di create-loop, mencatat per provider kie/apiframe/suno/aimusic), src/app/api/kredit-ringkas/route.ts (BARU — dasbor HTML bos, wajib ?kunci=KREDIT_ADMIN_KEY, no-store), supabase-jalankan-sekali.sql (BARU — tabel credit_ledger + indeks + RLS tanpa policy), tests/kredit-ledger.test.mjs (BARU — 31 cek).
- TIDAK DISENTUH: page.tsx editor, lahan-studio.tsx, semua rute API lain, sistem login, Midtrans (itu Fase D).
- KAIDAH: catatKredit TANPA await di mana pun (fire-and-forget), dibungkus try/catch total, gagal mencatat = cuma console.warn — panggilan AI tidak pernah terganggu.
- PR BOS (sekali): 1) Jalankan supabase-jalankan-sekali.sql di Supabase SQL Editor. 2) Set env KREDIT_ADMIN_KEY di Vercel. 3) Buka /api/kredit-ringkas?kunci=<isi> di HP.
- GERBANG: tsc --noEmit 0 (1 error PromiseLike.catch diperbaiki pakai Promise.resolve) · 21/21 suite tes hijau · npm run build 0 (rute /api/kredit-ringkas terdaftar di manifest).
- INSIDEN SANDBOX hari ini: rollback git spontan 2× DI TENGAH giliran (HEAD meloncat 33b5697→4ea8002 antar perintah, .git/config ikut mundur membawa token mati). Ritus: re-add remote token hidup → fetch --depth=12 → ff-only. VERTIKA: selalu verifikasi `git log -1` TEPAT sebelum commit.

---

## FASE L3.5 — PANEL BOS: HALAMAN KHUSUS PEMILIK (2026-08-04)
- PERMINTAAN BOS: "buat fitur khusus saya sebagai pemilik, bisa atur semua, dasbor khusus, tinggal login masuk terus bisa atur-atur; bisa lihat pemakaian; kamu lebih paham UI/UX untuk pemilik." Keputusan bos via tanya-jawab: pintu=LOGIN GOOGLE (email dikenali) · isi=SEMUA SEKALIGUS · per-orang=NANTI bareng Fase D.
- DISENTUH: src/lib/setelan.ts (BARU — normalisasiSetelan/batasiFitur/mulaiHariIniWIB murni + getSetelan cache 45d + gerbangFitur; blokir TIDAK dicatat ledger), src/lib/bos.ts (BARU — emailBos/apakahBos murni + mintaBos via getUser), src/lib/ledger.ts (klien→export klienLayanan, isi identik), src/lib/hcnsec.ts (gerbangFitur SEBELUM try di postJson; clearTimeout saat blokir), music/route.ts (gerbang "musik" sebelum loop endpoint, 503 fitur_dimatikan), rute BARU: /api/bos/ringkas, /api/bos/setelan (GET+POST), /api/pengumuman (publik), /auth/callback (PKCE exchange + anti open-redirect), src/app/bos/page.tsx (BARU — klien Supabase dibuat MALAS via useRef agar prerender build tak meledak), src/app/pengumuman-banner.tsx (BARU, dipasang di layout), globals.css (+~90 baris .bos-*), supabase-bos-jalankan-sekali.sql (BARU: app_settings + panel_bos + RLS), tests/bos-panel.test.mjs (BARU — 29 cek).
- TIDAK DISENTUH: page.tsx, lahan-studio.tsx, rute API lain, /api/kredit-ringkas (dasbor kunci-rahasia LAMA TETAP JALAN sebagai cadangan pintu), pricing/Midtrans (Fase D).
- PR BOS: 1) Run supabase-bos-jalankan-sekali.sql. 2) Vercel env BOS_EMAILS=<gmail bos> (redeploy/picu). 3) Supabase → Auth → URL Configuration: tambah https://verve-video-studio.vercel.app/auth/callback. 4) Google button butuh provider Google di Supabase Auth (client ID/secret); link ajaib jalan TANPA konfigurasi apa pun.
- INSIDEN BUILD: prerender /bos meledak (createBrowserClient tanpa env di build) → klien dibuat malas (useRef + panggil hanya di efek/handler). GERBANG: tsc 0 · 29/29 tes baru · 22/22 suite · build 0 (◌ /bos statis-shell).
- PRINSIP GERBANG: panel bos error/tabel belum ada → semua fitur LOLOS (jangan hukum pengguna karena alat bos rusak). Setelan berlaku ≤1 menit (cache 45d). Kuota dihitung "hari ini WIB", hanya panggilan SUKSES.

---

## FASE L5 — STUDIO THUMBNAIL: DASBOR KHUSUS PAKET CTR (2026-08-04)
- PESANAN BOS (verbatim): "buat khusus thumbnailnya biar high CTR sesuai niche, berada di menu dasbor khusus thumbnail deskripsi tag; yang ada berada di export itu hapus aja, kita ganti baru di rumah baru". Keputusan bos: sumber=AI gambar dari nol · paket=LENGKAP (thumbnail+judul+deskripsi+tag) · mesin Sampul lama=HAPUS TOTAL dari editor.
- DISENTUH: src/lib/thumbstudio.ts (BARU — otak CTR murni: VARIAN_THUMB 3 arah komposisi, NICHE_GAYA 15 kamus, gayaNiche, promptLatarThumb [16:9, ruang kosong kiri 40%, AI dilarang gambar teks], badgeCtr), src/app/thumb-studio.tsx (BARU — dasbor: amunisi judul/niche/keyword + jembatan Lahan verve_brain_v1, 3 varian latar via /api/hcnsec/image _rawPrompt, komposisi kanvas drawAutoThumb 1280×720 + badge CTR, unduh PNG, paket teks via /api/hcnsec/titles + metadata, salin clipboard, sesi tersimpan), src/app/page.tsx (import+ScreenId+inSub+cabang render+tombol hub oranye di HomeDash → go("thumbnail"); AMPUTASI mesin Sampul lama: tile rel p.onCover, callsite onCover, render modal sampul — fungsi SampulModal dibiarkan dorman tak terpanggil, 0 error tsc), globals.css (+~70 baris .tub-*), tests/thumb-studio.test.mjs (BARU — 27 cek).
- TIDAK DISENTUH: lib/thumb.ts (UTUH — dipakai studio baru), rute /api/hcnsec/* (0 perubahan — studio memakai kontrak yang SUDAH ADA), editor timeline/preview/ekspor, semua fitur L3/L3.5.
- GERBANG: tsc 0 · 27/27 tes baru · 23/23 suite · build 0.

---

## FASE L5.1 — THUMBNAIL: BUKTI LAPANGAN → PERBAIKAN (2026-08-04)
- BUKTI BOS (screenshot): 3 varian "ibu aku rindu" — datar (niche tak dikenal) + huruf palsu AI "Itur:lu" (AI diam-diam menggambar teks meski dilarang). Bos suka 3 konsep demo (foto ibu golden hour / pelukan senja / kursi kosong) dan meminta: gaya berubah-ubah sesuai niche + tulisan hook CTR sesuai niche.
- DISENTUH: thumbstudio.ts (kamus niche +10 kunci emosional: ibu/ayah/rindu/sedih/keluarga/emosi/cinta/pernikahan/persahabatan/anak; prompt anti-huruf-palsu diperkeras "ABSOLUTELY NO alphabet characters… PURE photographic scene only"; badgeCtr +hook emosional "SIAPKAN TISU"/"KELUARGA NO.1", emoji dibuang agar pill tak jegeg), thumb.ts (drawAutoThumb +preferSide opsional — bawaan luminansi UTUH 0 regresi), thumb-studio.tsx (teks dipaksa "left" sesuai janji prompt + await fonts.ready sebelum ukur badge), tests/thumb-studio.test.mjs (+9 cek → 36).
- TIDAK DISENTUH: perilaku bawaan drawAutoThumb untuk pemanggil lama, rute API, L3/L3.5.
- PELAJARAN TEST: ambang "< 700" pecah karena prompt memang sengaja diperpanjang — ganti cek properti sesungguhnya (judul ≤90 char masuk prompt).
- GERBANG: tsc 0 · 36/36 tes baru · 23/23 suite · build 0.

---

## FASE L5.2 — STUDIO TEKS THUMBNAIL (2026-08-04)
- KRITIK BOS (screenshot 2): "belum puas, tidak ada juansa CTR & waw, bagusan ChatGPT; saya mau generate benar-benar mikir tidak terpaku satu sisi; tulisan bisa sesuai gaya; HARUS ada isi manual teks; font mantap & bisa pilih; bisa taruh kiri/kanan; besar kecil tulisan bisa diatur."
- DISENTUH: thumbstudio.ts (VARIAN 3 konsep mikir: Wajah&Emosi 85mm / Adegan Sinematik 24mm / Simbol&Bukti still life tanpa manusia; FONT_THUMB 8 font yang SUDAH dimuat layout; bagiBarisTeks murni), thumb.ts (drawAutoThumb +opsi {teksKustom,fontFam,skala} — default utuh 0 regresi), thumb-studio.tsx (DITULIS ULANG: kartu 3 studio teks — segmented oto/manual + textarea 3 baris + isi-saran pickPowerWords, 8 chip font berhuruf aslinya, posisi ◀kiri/kanan▶, slider 70–140%; RE-KOMPOSISI INSTAN: kontrol berubah → gambar ulang dari latar tersimpan TANPA panggil AI, debounce 180ms + token anti-balapan; sesi kontrol ikut tersimpan), globals.css (+~20 baris .tub-seg/.tub-fonts/.tub-slider), tests/thumb-studio.test.mjs (+10 cek → 46).
- TIDAK DISENTUH: pickPowerWords/drawAutoThumb perilaku bawaan, rute API, editor, L3/L3.5.
- GERBANG: tsc 0 · 46/46 · 23/23 suite · build 0.

---

## FASE L5.3 — GESER JARI BEBAS + PROMPT DARI LAHAN (2026-08-04)
- KRITIK BOS #3 (screenshot): "belum bisa edit benar-benar manual; tulisan harus bisa kuklik lalu kuarahkan ke mana-mana (atas bawah bebas); ada tombol prompt otomatis dari Lahan khusus thumbnail yang dipanggil ke thumbnail". Bonus bug dari screenshot: badge melebar dari pill, varian "Failed to fetch" tanpa coba-ulang, AI masih menyelipkan huruf.
- DISENTUH: thumbstudio.ts (+bangunPromptDariLahan murni: selTitle/topic + board.style_visual + color_grade + charLock, batas 340 char), thumb.ts (opsi +anchorX/anchorY 0..1: sisi teks & scrim & garis-tumpuk mengikuti jangkar — default utuh 0 regresi), thumb-studio.tsx (✋ GESER JARI: pointer capture di slot → fraksi kanvas 10-90%/14-92% → re-komposisi debounce 140ms; 🪄 tombol Susun dari Lahan + textarea prompt khusus + centang "pakai prompt ini" → generate memakai tema lahan, judul tetap untuk teks; coba-ulang 2× per varian dengan jeda 2.2d + status "mencoba ulang…"; fonts.load("800 26px Poppins") sebelum ukur badge — anti pill jegeg; badge width di-clamp 380), globals.css (.tub-slot-geser touch-action:none, .tub-prompt-lahan, .tub-cek), tests/thumb-studio.test.mjs (+11 cek → 57).
- TIDAK DISENTUH: perilaku bawaan drawAutoThumb, rute API, editor, L3/L3.5.
- PELAJARAN TEST: ekstrak fungsi baru lupa kupas `const bag: string[]` → SyntaxError; cek kontraktual harus ikut versi pemanggil baru (promptLatarThumb(tema,…)).
- GERBANG: tsc 0 · 57/57 · 23/23 suite · build 0.

═══════════════════════════════════════════════
## v29.8 — AMPUTASI thumbnail pasca-render + FACELIFT WAH Studio Thumbnail (4 Agu 2026)
Kritik bos: (1) "setelah render muncul thumbnail, minta dihapus, ternyata masih ada" → benar:
yang diamputasi di v29.4 hanya SampulModal; mesin v13.7 (auto-thumbnail di layar Ekspor) masih hidup.
Sekarang ditebas total: thumbU/genThumb/downloadThumb/props/kartu ekspor/auto-gen = 0 jejak di page.tsx.
production.ts: item "Thumbnail" di checklist & teks paket jadi kondisional (tampil hanya kalau pemanggil kirim status).
(2) "tampilan studio buruk & kaku" → facelift total: panggung besar bingkai conic + strip 3 konsep,
hero gradien, font-chip sampel+nama, slider custom, aksi-bar lengket (unduh/varian), toast kapsul blur,
kartu beranimasi, safe-area. Mesin/fungsi studio dipertahankan (57/57 tes).
Disentuh: page.tsx, production.ts, thumb-studio.tsx, globals.css.
TIDAK disentuh: thumb.ts, thumbstudio.ts, editor, lahan, spektrum, bos, semua api.
Gerbang: tsc 0 · 23/23 tes hijau · build 0.
