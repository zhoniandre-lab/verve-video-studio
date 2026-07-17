# 🚀 Panduan Deploy ke GitHub + Vercel (step-by-step)

## 1. Persiapan Akun (gratis)
- GitHub: https://github.com/signup
- Vercel: https://vercel.com/signup (bisa login dengan akun GitHub)
- Supabase (opsional): https://supabase.com/dashboard (free tier 500MB DB + 1GB storage)
- API Key dari https://api.hcnsec.cn (login ke akunmu, copy API key)

## 2. Push ke GitHub
Buka terminal di folder `video_app`:
```bash
git init
git add .
git commit -m "feat: Verve AI Video Studio v1.0"
git branch -M main
```

Buat repo baru di GitHub (misal nama: `verve-video-studio`) — JANGAN centang "Add README".
Setelah repo dibuat, jalankan:
```bash
git remote add origin https://github.com/USERNAMAMU/verve-video-studio.git
git push -u origin main
```

## 3. Deploy ke Vercel
1. Login ke https://vercel.com
2. Klik **Add New... → Project**
3. Klik **Import Git Repository** → pilih repo `verve-video-studio` → klik **Import**
4. Di halaman **Configure Project**, isi **Environment Variables**:
   - `HCNSEC_API_KEY`   = (API key dari akun api.hcnsec.cn kamu)
   - `HCNSEC_BASE_URL`  = `https://api.hcnsec.cn/v1`
   - `NEXTAUTH_SECRET`  = isi random string panjang (bisa generate di https://1password.com/password-generator)
5. (Opsional, kalau pakai Supabase) tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`        = dari Supabase → Project Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`   = dari halaman yang sama → anon public key
6. Klik **Deploy** 🎉 — tunggu 1-2 menit.
7. Setelah selesai, Vercel kasih URL seperti `verve-video-studio-xxx.vercel.app`. Aplikasi sudah online!

## 4. (Opsional) Setup Supabase
1. Login ke Supabase → **New Project** (pilih org, isi nama + password DB, region Singapore deket Indonesia)
2. Tunggu project ready (~2 menit)
3. Di sidebar kiri → **SQL Editor** → **New query**
4. Copy seluruh isi file `supabase_setup.sql`, paste → klik **Run**
5. Ke **Project Settings → API**:
   - Copy `Project URL` dan `anon public key`
6. Di Vercel → buka project kamu → **Settings → Environment Variables**
   - Masukkan kedua key di atas
   - Klik **Save**, lalu ke tab **Deployments** → klik titik 3 di deploy terbaru → **Redeploy**

## 5. (Opsional) Custom Domain
Di Vercel → Settings → Domains → tambah domain kamu, ikuti instruksi DNS.

## 6. Update Kode Nanti
Setelah edit file di lokal:
```bash
git add .
git commit -m "fix/update: ..."
git push
```
Vercel otomatis deploy ulang dalam 1-2 menit! 🚀

## ❓ Troubleshooting
- **API error 401/403**: Cek `HCNSEC_API_KEY` di Vercel env var, pastikan benar & saldo cukup.
- **Model not found**: Buka `src/lib/types.ts`, ganti `DEFAULT_IMAGE_MODEL` / `DEFAULT_VIDEO_MODEL` / `CHAT_MODELS[0]` dengan nama model yang tersedia di akun kamu.
- **Video hanya keluar WebM**: Chrome/Edge di Windows/Mac biasanya produce MP4. Firefox memproduksi WebM (tetap bisa di-upload YouTube).
- **T2V gagal**: Tidak semua provider mendukung `/videos/generations`. Cek di dashboard hcnsec apakah ada model video (Kling, Wan, Sora, dsb) lalu ganti `DEFAULT_VIDEO_MODEL` di `src/lib/types.ts`.
- **Build error lokal**: Pastikan Node.js >= 18.17 (`node -v`). Jalankan `npm install` ulang.
