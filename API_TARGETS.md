# Batas Paket API yang Diambil untuk VERVE

Sumber awal: `cporter202/API-mega-list`.

Tujuan file ini: mengunci **6 kebutuhan API** yang dipilih untuk pengembangan VERVE berikutnya. Ini bukan rombak UI dan bukan pemasangan semua API sekaligus.

## 1. Riset video YouTube lebih kuat

Target:
- Cari video kompetitor/topik.
- Ambil judul, channel, views, durasi, tanggal upload, thumbnail, deskripsi.
- Bantu Growth Doctor membaca pola video yang menang.

Kandidat utama:
- `nexgendata/youtube-media-mcp-server` — YouTube search + channel stats + transcript + comments.

Cadangan:
- `aimscrape/youtube-search-video-scraper`
- `powerai/youtube-video-search-scraper`
- `taroyamada/youtube-channel-analytics`

Catatan:
- Jalur resmi `YOUTUBE_API_KEY` yang sudah ada tetap dipertahankan.
- Scraper hanya pelengkap, bukan pengganti total.

## 2. Ambil transcript video

Target:
- Ambil caption/transcript YouTube.
- Bedah hook, struktur cerita, ide ulang, dan repurpose script.

Kandidat utama:
- `nexgendata/youtube-transcript-scraper`

Cadangan:
- `powerai/youtube-transcript-scraper`
- `supreme_coder/youtube-transcript-scraper`
- `dz_omar/youtube-subtitle-translator`

Catatan:
- Transcript dipakai untuk riset dan ide, bukan klaim ulang karya orang.

## 3. Analisis komentar

Target:
- Ambil komentar YouTube/TikTok.
- Cari keresahan penonton, pertanyaan yang sering muncul, emosi, dan ide video baru.

Kandidat utama:
- `dz_omar/youtube-comments-scraper`

Cadangan:
- `scrape-creators/best-youtube-comments-scraper`
- `apidojo/tiktok-comments-scraper`
- `nexgendata/ai-sentiment-analyzer`

Catatan:
- Data personal komentar jangan ditampilkan berlebihan di UI.

## 4. Cari ide konten dari TikTok/YouTube

Target:
- Cari video/topik yang sedang naik.
- Ambil caption, views, likes, comments, shares, music, hashtag.
- Ubah menjadi ide original untuk VERVE.

Kandidat utama:
- `apidojo/tiktok-scraper`

Cadangan:
- `powerai/tiktok-videos-search-scraper`
- `data-slayer/tiktok-video-search`
- `aimscrape/youtube-search-video-scraper`
- `apidojo/tiktok-music-scraper`

Catatan:
- Jangan reupload mentah. Pakai untuk inspirasi dan pola.

## 5. Rekomendasi keyword/judul

Target:
- Cari autocomplete YouTube dan keyword long-tail.
- Bantu bikin judul, angle, dan query riset.

Kandidat utama:
- `sian.agency/youtube-auto-complete-and-query-suggestion`

Cadangan:
- `easyapi/all-in-one-autocomplete-keywords-tool`
- `powerai/long-tail-keyword-discovery`
- route internal VERVE: `/api/hcnsec/titles`, `/api/hcnsec/metadata`, `/api/hcnsec/keywords`

Catatan:
- Keyword hanya bahan. Final judul tetap harus dicek manual agar tidak ngawur/clickbait kosong.

## 6. Cari bahan video/audio/asset

Target:
- Perluas bahan visual/audio.
- Tetap jaga jalur stock video VERVE yang sudah ada.

Jalur utama yang sudah ada:
- `/api/hcnsec/stock-video`
- Provider: Pexels, Pixabay, Coverr.

Cadangan dari API-mega-list:
- `igolaizola/adobe-stock-scraper`
- `easyapi/adobe-stock-search-scraper`
- `easyapi/unsplash-image-scraper`
- `automation-lab/soundcloud-scraper`

Catatan:
- Lisensi asset wajib dicek.
- Jangan otomatis masukkan media berbayar/berhak cipta ke render.

## Batas teknis

- Env opsional untuk integrasi berikutnya: `APIFY_TOKEN`.
- Registry teknis disimpan di: `src/lib/brain/content-api-targets.ts`.
- Endpoint baca registry: `/api/content-targets`.
- Endpoint ini hanya menampilkan target; belum menjalankan API berbayar.
- Integrasi runner berbayar harus dibuat terpisah dengan guard, rate limit, dan persetujuan pemilik proyek.
