# 🎞️ Verve AI Video Studio

Web app untuk generate video slideshow otomatis + **AI Text-to-Video** + **Audio Spectrum Visualizer** keren (seperti channel YouTube musik luar negeri). Dibuat dengan **Next.js 14**, siap deploy ke **Vercel**, dengan database/storage via **Supabase**.

## ✨ Fitur

| Fitur | Detail |
|---|---|
| 🔑 Keyword AI | Generate keyword/topik otomatis dari niche |
| 📝 Judul AI | Generate judul clickbait per keyword |
| 🎨 Gambar AI | Generate gambar via `step-image-edit-2` (bisa pilih style + rasio) |
| 📁 Upload sendiri | Bisa campur gambar AI dengan gambar upload |
| 🔊 TTS Narasi | Narasi suara otomatis (6 pilihan voice) |
| 🎵 Background music | Upload musik sendiri (volume otomatis diturunkan) |
| 🎛️ **Spectrum Visualizer** | 3 style: **Classic Bars**, **Circular Wave**, **Particles** — semuanya realtime ikut beat |
| ✨ Transisi | Ken Burns slow-zoom / fade / cut |
| 🎬 Text-to-Video | Prompt langsung jadi video (kling/wan/step-video, customizable) |
| 📱 Responsif | Mobile & desktop |
| 🗄️ Supabase | Simpan project history + video storage (opsional) |
| ⚡ Vercel-ready | Satu klik deploy |

## 🚀 Quick Start (Lokal)

```bash
# 1. Install
npm install

# 2. Setup env
cp .env.example .env.local
# isi HCNSEC_API_KEY dengan key dari api.hcnsec.cn

# 3. Jalankan dev
npm run dev
# buka http://localhost:3000
```

## 🚀 Deploy ke Vercel

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "initial: verve ai video studio"
git branch -M main
git remote add origin https://github.com/USERMU/verve-video-studio.git
git push -u origin main
```

### 2. Deploy ke Vercel
1. Buka https://vercel.com/new
2. Import repo GitHub kamu
3. Di bagian **Environment Variables**, masukkan:
   - `HCNSEC_API_KEY` = API key dari api.hcnsec.cn
   - `HCNSEC_BASE_URL` = `https://api.hcnsec.cn/v1`
   - `NEXT_PUBLIC_SUPABASE_URL` (opsional)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (opsional)
   - `NEXTAUTH_SECRET` = isi random string panjang
4. Klik **Deploy** — selesai!

## 🗄️ Setup Supabase (Opsional, untuk simpan project + auth)

1. Buka https://supabase.com → New Project (free tier OK)
2. Setelah project jadi, buka **SQL Editor** → New Query
3. Copy-paste isi file [`supabase_setup.sql`](./supabase_setup.sql) → Run
4. Di **Project Settings → API**, copy:
   - `Project URL` → masukkan ke `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → masukkan ke `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Tambahkan kedua env var itu ke Vercel (Settings → Environment Variables)
6. Redeploy.

## ⚙️ Environment Variables

| Variable | Wajib? | Deskripsi |
|---|---|---|
| `HCNSEC_API_KEY` | ✅ | API key dari akun api.hcnsec.cn |
| `HCNSEC_BASE_URL` | ❌ (default `https://api.hcnsec.cn/v1`) | Base URL API |
| `NEXT_PUBLIC_SUPABASE_URL` | ❌ | URL Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ❌ | Anon key Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | Service role (untuk admin/server) |
| `NEXTAUTH_SECRET` | ❌ | Random string untuk session |

## 🎨 Spectrum Styles

- **Classic Bars** — Bar vertikal naik-turun ikut beat dengan glow neon + refleksi cermin di bawah (paling mirip Trap Nation / xKito style)
- **Circular Wave** — Lingkaran spectrum yang berdenyut dari tengah dengan radial beam, glow center berdenyut ikut bass
- **Particles** — 180+ partikel yang menari ikut frekuensi + lingkaran titik-titik spectrum + waveform ring + flash putih saat bass drop

Semua style bisa ganti warna (7 preset + color picker bebas).

## 📁 Struktur Project

```
src/
├── app/
│   ├── api/
│   │   └── hcnsec/         # proxy API ke api.hcnsec.cn (keywords/titles/image/tts/video)
│   │   └── projects/       # CRUD project ke Supabase
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx            # Studio UI (single page)
├── components/
│   └── SpectrumVisualizer.tsx  # Canvas visualizer (Web Audio API)
└── lib/
    ├── hcnsec.ts           # server-side wrapper ke API hcnsec
    ├── recorder.ts         # client-side video renderer (canvas + MediaRecorder)
    ├── supabase.ts         # client supabase
    └── types.ts
supabase_setup.sql          # SQL script setup database
vercel.json                 # config function timeout
```

## 🎬 Cara Pakai

### Mode Slideshow + Spectrum
1. **Tab "Slideshow + Spectrum"** → masukkan niche/topik
2. Step 1: Generate keyword (AI atau manual)
3. Step 2: Pilih judul video yang diinginkan
4. Step 3: Generate gambar AI / upload gambar sendiri
5. Step 4: Pilih audio (TTS, musik, keduanya, atau tanpa audio). Bisa auto-generate script dari judul.
6. Step 5: Pilih style spectrum, warna, durasi slide, transisi → klik **Render Video Sekarang**
7. Preview hasilnya → **Download MP4/WebM**

### Mode Text-to-Video
1. **Tab "Text-to-Video AI"**
2. Tulis prompt detail (contoh: *"cinematic drone shot tropical beach sunset, slow waves, 4k"*)
3. Atur durasi + rasio → Generate
4. Video langsung bisa di-download.

## ⚠️ Catatan

- Video render berjalan **di browser client** (Canvas + MediaRecorder) sehingga tidak membebani server Vercel.
- Hasil codec tergantung browser: Chrome/Edge umumnya menghasilkan MP4 (H.264), Firefox/West menghasilkan WebM (VP9/VP8). Keduanya bisa di-upload ke YouTube/Shorts.
- Pastikan saldo `api.hcnsec.cn` kamu cukup.
- Model default bisa diganti di `src/lib/types.ts` (CHAT_MODELS, DEFAULT_IMAGE_MODEL, dll).
- Text-to-Video default memakai model `kling-v1`. Jika akun kamu punya model video lain (misal `wan-v1`, `step-video-v1`, `sora-*`), ganti `DEFAULT_VIDEO_MODEL` di `src/lib/types.ts`.

## 🛠️ Development

```bash
npm run dev      # start dev server
npm run build    # production build
npm run start    # start production server
npm run lint     # lint
```

## 📝 Todo / Next Steps (bisa ditambah nanti)

- [ ] Login page dengan Supabase Auth (Google/Email)
- [ ] Dashboard "My Projects" untuk melihat history
- [ ] Upload video hasil ke Supabase Storage otomatis
- [ ] Background musik AI (generate via audio API)
- [ ] Auto-upload ke YouTube/TikTok via API
- [ ] Subtitle burn-in
- [ ] Lebih banyak transisi (slide, glitch, blur)

---
Made with 💜 using Next.js + Supabase + Web Audio API.
