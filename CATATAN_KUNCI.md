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

## v13.29 RASA CAPCUT (2026-07-25)
Minta bro: UI/UX studio dirasakan kurang nyaman; suka gaya track CapCut; mau track stabil digeser/dipanjang-pendekkan + playhead stabil berpenggaris. Referensi: CapCut mobile (playhead putih, bingkai seleksi putih, handle gemuk, gelembung waktu saat seret), VN (angka detik saat seret), InShot (toolbar rata rapi).
ISI (murni visual + 1 overlay render-only — LOGIKA GESTURE/STATE NOL disentuh):
- Ruler 26px, angka 10.5px terang + garis tick, titik minor terang, tabular-nums.
- Playhead PUTIH + bayangan gelap (dulu teal menumpuk warna bar lagu teal).
- Klip terpilih: bingkai PUTIH ala CapCut; handle pangkas 15px→22px (sasaran jari).
- Rail kiri 56→46px; kontrol play/undo/redo bulat konsisten; timer berjalan 14.5px tabular; toolbar label 9.5px #b7bdc9; chip teks/audio radius diperhalus.
- GELEMBUNG WAKTU .v6e-draginfo: angka detik LIVE melayang di tengah atas track saat objek digeser/panjang-pendekkan (trim/txt/txtd/stk/stkd/aud). Hanya MEMBACA dragRef hasil mesin gesture v9.1 — tidak menulis apa pun; hilang sendiri saat jari lepas.
Tidak disentuh: gstBind/armDrag/apply*/packRows/lane-lift/magnet/seek/zoom, Sutradara, audiocc, recorder, routes, wizard.
Gerbang: tsc 0, build 0, 6 suite ✅, smoke CSS+JS chunk ✓ (cls .next/static/chunks/2aur_kg5kdgcy.css).

## v13.30 SUSUN & BLOK (2026-07-25)
4 pintu bro dari screenshot 16:01: (1) susun ulang klip ala CapCut — tahan, seret ke tengah/ujung, yang lain manggung geser otomatis; dulu sasaran dihitung dari LEBAR KLIP SENDIRI (klip beda durasi = jatuh ngaco) + klip tak ikut jari → kini sasaran dari titik TENGAH tiap klip (slot=kept-array), klip IKUT jari (translateX), garis sisip teal berpendar di slot jatuh, getar tipis tiap pindah slot. (2) Handle pangkas lebih peka: 26px + zona jari ::after melebar 16px KELUAR tepi klip. (3) Pembatas antar-gambar = tombol transisi 26px putih (dulu 16px — nyaris tak terlihat), ketuk → pemilih transisi (onTrans lama tak disentuh). (4) Ketuk lagu = BLOK dulu (outline putih + ⚙), setting buka via ketuk-ulang/⚙ (dulu langsung lempar ke menu = keluhan "ribet"). Blok lepas saat sentuh di luar bar. BONUS perbaikan nyata: total timer basi (durT hanya diisi saat PLAY → '00:10 / 00:06') kini = penggaris (max klip/musik/narasi/rekaman). Tertangkap gate sendiri: map implicit-any → tsc blok, diperbaiki (anotasi Slide/number).
Tidak disentuh: onTrans/moveSlide-splice/gstBind/applyTrim-audio-txt/seek/zoom/magnet, Sutradara, audiocc, wizard. Gerbang: tsc 0, build 0, 6 suite ✅, smoke CSS+JS ✓.

## v13.31 SENTUH=TUMBU (2026-07-25)
3 hal dari screenshot 16:20: (1) chip transisi 26px "ganggu" handle pangkas → ANTI-GANGGU: chip minggir (tak dirender) bila klip tetangganya sedang terpilih; muncul lagi saat lepas pilih. (2) Lagi PLAY, jari geser track → dulu timeline dikunci pelacak (terasa ngadat); kini SENTUH=TUMBU: deteksi scroll	jari (beda >4px dari scroll program bertanda progScrollRef) → stopPreview + seekPreview ikut jari, ala CapCut. (3) Kekhawatiran "klip balik ke ukuran awal setelah pindah posisi": BUKTIAN — src/app/page.tsx:980 durs = effDur(slideOptsById[s.id]) → durasi/trim terkunci ke ID klip BUKAN nomor urut, moveSlide hanya tukar posisi → pengaturan SELALU ikut. Yang bikin tampak membesar: pelebar scale(1.06) saat seret → DIBUANG; klip kini tetap seukuran setting asli sepanjang jalan. Gerbang: tsc 0, build 0, 6 suite ✅, smoke onScrub ✓.

## v13.32 PEMBATAS & PIL (2026-07-25)
Koreksi atas salah-tafsir v13.31 (bro: "slah semua bro"): (1) chip transisi ternyata selama ini di DALAM kotak klip ber-overflow:hidden → kepotong separo & makan ketukan handle — dipindah KELUAR klip jadi chip ABSOLUT utuh 26px persis di TENGAH garis pembatas antar-objek, SELALU tampil (hilang-tampil ala v13.31 DIBATALKAN), handle pangkas tetap leluasa dari atas/bawah chip. (2) Maksud asli poin-3 pesan sebelumnya: tekan-lama utk pindah posisi → klip NGE-KECIL jadi pil ringkas (≤86px) ikut jari, klip panjang mudah dibawa; lepas jari → balik PENUH ke ukuran SETTING (durasi terkunci ID klip via slideOptsById — bukan reset awal). scale-tetap ala v13.31 dibuang. Sentuh=tumbu & timer total tetap. Gerbang: tsc 0, build 0, 6 suite ✅, smoke v6e-trans-divider ✓.

## v13.33 GESER DI MANA SAJA (2026-07-25)
Keluhan bro: "kalau jari ngk menyentuh di luar objek dia ngk bisa geser" — BIANG NYATA ditemukan: klip/audio/teks/stiker track ber-touch-action:none (scroll bawaan dikunci) DAN gesture yang dibatalkan karena 'niat scroll' (dx>12px) DIMATIKAN begitu saja (dragRef=null) → geser dari atas objek = NGADAT total. Fix: mode 'pan' — jari langsung bergerak horizontal sebelum objek terangkat → kendali diserahkan ke penggulir manual di ke-4 jenis objek (clip/aud/txt/stk); supresi tap-palsu setelah gulir; mode pan tak pernah commit (onClipUp guard + commitObjRow guard satu titik). Beda gestur kini jelas: SENGGOL-LANGSUNG-GESER = gulir track (ke menit berapa pun, dari objek mana pun, saat play pun = stop+ikut jari via onScrub) · TAHAN-DIAM 0,22d sampai BERGETAR = genggam objek (pil + garis sisip). Pil seret dipertajam: ciut proporsional (86px × tinggi 0,74×) + melayang + bayangan — bukan sliver. Gerbang: tsc 0, build 0, 6 suite ✅, smoke "pan"+pil ✓ (nama fungsi terminify — literal "pan" yang dicek).

## v13.34 ANTI-BAJAK + KETUK-BLOK (2026-07-25)
Bro: "udh tekan lama tetap tidak bisa pindah" — DUA pembajak gestur ditemukan di maybePromoteLane (fitur angkat-jalur tua): (a) tahan-diam >620ms & dx<10 → gestur klip DIRAMPAS jadi angkat-jalur-video (persis gejala: tahan niat2 lama malah tak bisa pindah); (b) geser agak MIRING vertikal (dy>dx+6) saat bawa klip → dirampas juga. KINI keduanya DIBONGKAR untuk kind reorder: gestur klip video tak pernah dicuri — tahan selama apa pun, geser serong pun, tetap murni pindah klip (pil + garis sisip). Jalur ELEMEN (aud/txt/stk) tetap bisa pindah baris vertikal seperti biasa. (2) Ketuk-blok: onClipDown kini toggle — ketuk = BLOK, ketuk objek sama lagi = LEPAS (onSel induk paham id kosong → setSelId("")+setClipBar(false)). Gerbang: tsc 0, build 0, 6 suite ✅, smoke pola ">620" HILANG dari chunk ✓ (tandingan palsu 0262 dijelaskan).
