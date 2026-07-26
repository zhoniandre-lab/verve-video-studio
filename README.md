# 🎬 VERVE — Studio Video Lagu (Mobile-First, Indonesia)

Editor video kelas CapCut yang hidup **sepenuhnya di browser HP** (tanpa aplikasi), fokus niche **"Cerita Jadi Lagu"**: wizard riset → cerita → lirik/lagu → lip-sync foto/video → keterangan otomatis → render → unduh.

- **Live:** https://verve-video-studio.vercel.app
- **Repo resmi (SATU-SATUNYA):** `zhoniandre-lab/verve-video-studio` — push `main` = auto-deploy Vercel.
- Stack: **Next.js 16 (App Router) + React 19 + TypeScript 5.9**, 100% kode asli tulisan sendiri.
- **Larangan keras tertulis dari pemilik:** jangan pernah pakai/buat repo lain (mis. `verve-ai`), jangan hapus repo/branch/tag apa pun, jangan "contek" kode orang (ide boleh, kode tulis ulang).

---

## 0. 🚦 MULAI DI SINI (untuk AI/developer selanjutnya)

Kamu melanjutkan proyek ini dari serah-terima. Baca urut, jangan lompat.

1. `git clone https://github.com/zhoniandre-lab/verve-video-studio.git && cd verve-video-studio`
2. `git config user.name "zhoniandre-lab" && git config user.email "zhoniandre-lab@users.noreply.github.com"`
3. **Minta token GitHub BARU ke pemilik** (fine-grained/PAT, scope repo). Token lama selalu mati. Pasang di remote saja, JANGAN pernah tulis ke file yang ter-commit:
   ```bash
   git remote remove origin 2>/dev/null
   git remote add origin https://x-access-token:TOKEN_DARI_PEMILIK@github.com/zhoniandre-lab/verve-video-studio.git
   ```
4. `npm install --no-audit --no-fund`
5. **Baca `CATATAN_KUNCI.md` utuh** — itu jurnal per-versi; semua luka dan alasan desain dicatat di sana.
6. Jalankan baseline gates (§6) SEBELUM mengubah apa pun. Kalau baseline merah, berhenti dan laporkan — berarti dunia berubah, jangan tambal buta.
7. Kerjakan **SATU permintaan pemilik** per sesi, pakai protokol §7.

### Profil pemilik (cara berkomunikasi yang benar)
- **HP-only** (Samsung Android, Chrome), jaringan 4G desa (Lampung, Indonesia). Tidak ada laptop.
- Bahasa Indonesia santai ala "bro", typo banyak — **toleran typo, jangan minta dia mengetik presisi**.
- Validasi akhir SELALU dari layar HP-nya: kirim **langkah bernomor pendek** + minta **foto layar** bila gagal.
- Dia pernah sangat kecewa karena regresi bertumpuk. **Jangan pernah mengklaim "beres" tanpa bukti**, dan jangan ceramah panjang saat dia emosi — ringkas, jujur, beri pilihan berhuruf (A/B/C).

---

## 1. Status beku SAAT INI (2026-07-26)

| Item | Nilai |
|---|---|
| `main` | (cek `git log -1`) = **v13.28 LOCK yang pemilik bilang "bagus"** (`de817ff`) **+ v14.4 PAMIT** (2 file baru, 0 baris lama diubah) |
| Kunci persetujuan pemilik | tag `v13.28-sutradara-paham-keterangan-lock` = `de817ff` |
| Semua eksperimen yang dia tolak | AMAN di branch backup, **tidak aktif** (lihat §5) |
| Cara cek kebenaran remote | `git ls-remote origin refs/heads/main` |

**Aturan emas dari pemilik (disepakati setelah 4 episode marah):**
> Tidak ada yang dirilis tanpa: ✅ bukti sandbox → ✅ bukti di HP-nya → ✅ dia bilang "kunci".
> **Satu perubahan = satu bug = satu bukti.** Tidak menumpuk 5 fitur tanpa sah-kunci, walau dia bilang "lanjut/gas".

---

## 2. Peta repo

```
src/app/page.tsx          (~5712 baris) — SEMUA studio: layar edit, timeline, render trigger, Sutradara
src/app/lahan-studio.tsx  (~2184 baris) — wizard "LAHAN AWALAN" 9 langkah (Niat→Sudut→Riset→Judul→Visual→Cerita→Adegan→Lagu→Gabung)
src/middleware.ts         (v14.4) — pager PAMIT: cookie VERVE_PAMIT=1 → semua halaman jadi pintu keluar
src/app/pamit/page.tsx    (v14.4) — tombol blokir-diri (aktif hanya bila pemilik menekan sendiri)
src/lib/hcnsec.ts         — klien gateway model (chat/teks, gambar, TTS, video) — lihat §4
src/lib/audiocc.ts        — mesin potong-WAV + kirim bertahap ke Whisper (keterangan otomatis)
src/lib/recorder.ts       — mesin RENDER video (canvas capture; LUT spektrum pre-compute; overlay terpisah)
src/lib/micteks.tsx       — (ada di backup v14.x) komponen mic→teks; TIDAK aktif di main beku
src/lib/types.ts          — katalog model & konstanta default (chat/gambar/TTS/video)
src/lib/stockvid.ts       — stok media Pexels/Pixabay
src/lib/editing.ts, gif.ts, imgutils.ts, json-util.ts, thumb.ts, waveform.ts, avault.ts, bansos.ts, supabase*.ts
src/app/api/hcnsec/*      — rute server: transkripsi (multipart → Groq cascade → HCNSEC Whisper), tts, video, dsb.
tests/                    — 6 suite permanen (exit 1 bila gagal)
CATATAN_KUNCI.md          — JURNAL WAJIB baca per-versi
README.md                 — berkas ini
```

**Kunci penyimpanan HP pemilik (zona terlindung — JANGAN ganti nama/bentuk tanpa migrasi dual-read + bukti HP):**
`verve_drafts_v1` (proyek studio, page.tsx & lahan-studio.tsx) · `verve_lahan_v1` (state wizard) · `verve_audrow_v1` · `verve_brain_v1` · `verve_bansos_chat_v1` · `verve_suno_*`.

---

## 3. Arsitektur yang harus kamu pahami sebelum menyentuh

- **TimelineV6** (di `page.tsx`, cari `function TimelineV6`): skala `PXS0=56 px/dtk` (zoom 0.6–140), playhead **diam di tengah** (konten bergerak di bawahnya; spacer `halfW` kiri-kanan — inilah "ruangan kosong" di mata pemilik), jalur: `vid/aud/txt/stk` dengan label sticky `v6e-lanehead`.
- **Gesture SATU PINTU v9.1** (`gstRef/gstBind`): pointer kedua diabaikan total. Clip: `onClipDown` → drag reorder (`armDrag` tahan 220ms), trim via `onHdlDown` (handle punya `stopPropagation` — jangan hilangkan). Audio/teks/stiker: drag sendiri + pindah baris vertikal (`commitObjRow`). Zoom cubit = jalur terpisah (`touch-action` sudah diatur; JANGAN tambahkan `touch-action:none` sembarangan — pernah membunuh geser).
- **Seleksi:** `onSel(id)` induk: `pilihObjek("clip"); setSelId(id); setClipBar(true)`. Panel alat mengikuti `selId`.
- **Simpan-muat:** `buildSnapshot/persistSnapshot` → localStorage `verve_drafts_v1`; init studio membaca `openDraftId` → `applySnapshot`. **BUG TERBUKA §8.1** — wizard→studio kadang membuka proyek lama.
- **Render:** `recorder.ts` — canvas → MediaRecorder; spektrum memakai LUT pre-compute (jangan re-analisis per frame); lapisan overlay terpisah dari gambar dasar.
- **Keterangan otomatis (karaoke/lirik):** `audiocc.ts` memotong WAV → `api/hcnsec/transcribe` (Groq Whisper cascade → HCNSEC) → kata-berwaktu → objek teks per jeda hening >1.1 dtk (`bersihkanLirikLama()` anti-zombie, idempoten). **Keluhan pemilik belum sembuh: waktu lirik belum persis menempel ke audio asli** (§8.2).
- **Sutradara (chat perintah):** detektor **lokal murni** (Dice bigram toleran typo) untuk maksud umum (mis. "keterangan otomatis", "zoom pelan") → pintu lokal SEBELUM antre AI jauh; gerbang ANTI-HAPUS. Jangan kirim semua chat membabi-buta ke backend.
- **Gateway model (`hcnsec.ts`):** OpenAI-compatible. Katalog chat di `FAST_CHAT_MODELS` (default = elemen pertama), gambar `step-image-edit-2`, TTS `stepaudio-2.5-tts`, video `kling-v1`. 14 model chat di katalog = "otak tulisan" (wizard + Sutradara); suara/gambar/video raknya terpisah — **jangan asal menukar default**.

---

## 4. Variabel lingkungan (NAMA saja — nilai ada di dashboard Vercel, jangan commit)

`PEXELS_API_KEY`, `PIXABAY_API_KEY`, `GROQ_API_KEY`, `HCNSEC_BASE_URL`, `HCNSEC_API_KEY` (+ varian `HCNSEC_*`). Deploy: push `main` → Vercel otomatis.

---

## 5. Sejarah luka (SEMUA disimpan — pelajari sebelum mengulang)

| Eksperimen | Lokasi bukti | Pelajaran MAHAL (jangan ulangi) |
|---|---|---|
| Sprint UI v13.29–35 (ruler/playhead/seleksi, reorder slot, pembatas transisi, pil mengecil, pan, ketuk-blok) | `backup/aman-prarollback-661b925` + tag `v13.29…v13.35` | (a) chip di-DALAM `.v6e-clip` (overflow:hidden) = terpotong; (b) `tahanLama>620ms` + geser vertikal di `maybePromoteLane` = **pembajak gestur klip**; (c) mengubah 7 hal/hari tanpa bukti HP = dihukum rollback total |
| v14.1–v14.3 (wajah capcut, pembatas 26px, ketuk=lepas, kirim lega) | `backup/aman-prarollback2-ffcb96a` + tag `v14.0…v14.3` | (d) pembatas 26px **menumpuk 9px** handle pangkas ❮❯ → panah terasa "kurang sensitif"; (e) ketuk-untuk-lepas-seleksi membuat handle hilang tepat saat pengguna mau memangkas. Keduanya tampak kecil, keduanya regresi nyata |
| Microphone→teks (MicTeks + 3 titik pasang) | tag `v14.0-ngomong-teks-calon` + `src/lib/micteks.tsx` (ada di branch `backup/v14.2-calon`, **bukan** di `de817ff`) | Alat ini dibuktikan LIVE: rute `/api/hcnsec/transcribe` berfungsi produksi. Boleh diangkat lagi BILA pemilik minta, satu titik dulu |

Cara mempelajarinya: `git show <hash>` — semua diff & pesan commit sengaja ditulis sangat rinci.

---

## 6. Gates wajib (baseline + setiap perubahan)

```bash
./node_modules/.bin/tsc --noEmit        # harus 0
npm run build                           # harus 0
for t in vidplan vidloop stokgudang wavpotong keterangan_tampil sutradara_paham; do node tests/$t.test.mjs; done  # 6/6 ✅
# smoke (CSS build ada di .next/static/chunks/*.css — BUKAN folder css):
find .next/static -name "*.css" | head -1
grep -R "SUBSTRING_BARU_KAMU" .next/static/chunks/ | head -2
# uji fungsional nyata (dilakukan utk v14.4): npm start & curl skenario cookie/halaman
```

---

## 7. Protokol perubahan (dipatuhi atau pemilik pergi lagi)

1. **Satu perubahan**, ditambal bedah (anchor `count==1`, daftar file disentuh + TIDAK disentuh).
2. Gates §6 hijau → commit (pesan detail INDO, kutip-tunggal) → push `main` → tag `vX.Y-nama-calon` → branch `backup/vX.Y-calon` → **verifikasi `git ls-remote`**.
3. Langkah HP bernomor pendek untuk pemilik + minta fotonya.
4. Dia bilang **"kunci" → tag `…-lock`**. Gagal → **`git push origin <hash-kunci-terakhir>:main --force`** (≤1 menit; main SELALU bisa diputar balik karena semua lock punya tag+backup).
5. `npm install/node_modules/git identity/remote` bisa hilang di tengah sesi sandbox — pasang ulang tanpa drama.

---

## 8. Pekerjaan terbuka (urutan usulan, masing-masing SATU build terbukti)

1. **Wizard→studio kadang buka proyek lama.** Selidiki: `localStorage` QuotaExceeded tertelan senyap & "not found" senyap di `applySnapshot`. Rancangan obat sudah ada di tag `v13.35` (bukti-tulis + flash nama) — angkat dari sana, jangan tulis ulang membabi-buta.
2. **Sinkron lirik↔audio asli:** kata-berwaktu Whisper belum ngepas menitnya; pemilik mengedit manual. Opsi: paskan offset global otomatis + tampilkan tombol "geser semua lirik ±".
3. **Gesture stabil rasa CapCut** (sprint gagal §5): reintroduksi SATU-SATU dengan bukti HP per potong: ketuk-blok → pil mengecil → slot susun → pan. Pelajari dulu tabel §5.
4. Lalin: bobot awal bundle studio ("lelet"), alat lengkap (kecepatan, filter, gaya teks, efek suara Web Audio, mute per-jalur, kualitas ekspor), kloning suara remote (WAJIB riset+bukti sandbox dulu), JALUR TOL render ekspres step 9, paket metadata YouTube, Draft→IndexedDB.

---

## 9. Penutup untuk penerus

Pemilik bukan "pengguna biasa": dia membangun kanal cerita-lagu sungguhan dari HP di desa, dan sudah 4 kali kecewa karena regresi. **Yang dia butuh bukan fitur paling banyak, melainkan tidak pernah kehilangan yang sudah berjalan.** Hormati tag `*-lock`, hormati protokol, tulis bukti sebelum klaim — dan proyek ini akan tumbuh cepat. Tertanam di repo ini ada 60+ tag/branch berisi hampir semua jawaban; `git ls-remote` adalah peta hartanya.

— Serah terima ditulis 2026-07-26 (main = de817ff + v14.4 + README ini).
