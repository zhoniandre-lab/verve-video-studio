# 🎛️ RENCANA FITUR: AUDIO ROOM — Zona Reaksi Audio Lokal (v19.37 draft)

> Konteks: pengembangan pada software VERVE yang SUDAH ADA (bukan dari nol).
> Target: HP/Android, mobile-first. Tujuan user: konten ASMR / music room / visual audio
> dengan **animasi LOKAL pada area tertentu** dalam satu gambar ruangan (khususnya bulatan speaker).

---

## 1. Ringkasan Pemahaman Kebutuhan

| Poin user | Pemahaman saya |
|---|---|
| Software dasar sudah ada | Ya — VERVE (web app jalan di HP). Kita TAMBAH fitur, bukan bikin baru |
| Upload 1 gambar ruangan | Background statis: kamar/studio/ruang santai (foto user) |
| Tandai bagian tertentu (bulatan speaker) | **Zona** (lingkaran/oval/polygon) di atas gambar — per zona punya koordinat & bentuk sendiri |
| Efek reaksi audio cuma di zona itu | **Animasi LOKAL**: hanya patch gambar di dalam zona yang bergerak; sisa ruangan DIAM |
| Speaker kiri = zona 1, kanan = zona 2 | Banyak zona, tiap zona punya binding audio + parameter sendiri |
| Realistis | Bukan gerak kasar/global — cone terlihat "memompa" (deform lokal + pencahayaan) |
| Mobile | Sentuh: tap pilih, drag geser zona, pinch zoom/pan gambar, panel bottom-sheet |
| Preview + render di HP | Preview realtime (audio clock) + render offline (mesin render v19.33/34 yang sudah ada) |

**Kunci yang tidak boleh salah:** efek menempel ke **area** (bagian gambar), bukan ke objek utuh.

---

## 2. Daftar Fitur yang Ditambahkan ke VERVE

### A. Mobile-first / HP friendly
- Gesture: tap (pilih), drag 1 jari (geser zona / geser gambar saat zoom), pinch 2 jari (zoom), long-press (buat zona baru)
- Toolbar mode: ✋ Pilih/geser · ➕ Buat zona · 🔍 Zoom · ▶ Preview
- Panel setting = **bottom sheet** (kebawah, muncul saat zona dipilih) — jempol gampang jangkau
- Tombol besar, spacing lega, haptics ringan kalau bisa

### B. Upload gambar & edit area
- Upload 1 gambar ruangan (PNG/JPG/WEBP) — jadi background layer
- **Zona** dengan bentuk: ⭕ lingkaran · ⬭ oval · ⬠ polygon (custom, tap-tap sudut)
- Setiap zona bisa: geser, ubah ukuran (handle), rotasi, hapus, duplikat
- Zoom gambar (pinch) untuk menandai area kecil (bulatan speaker) dengan presisi

### C. Zona Reaksi Audio (inti)
- Setiap zona punya: `sumber audio` (satu lagu — bisa beda zona beda lagu [advanced]),
  `respon` (bass/beat/treble/rms), `kekuatan`, `kecepatan`, `smoothness`
- Efek yang bisa ditempel ke zona (drag dari palette): 
  - 💥 Pulse/scale (pompa)
  - 📉 Dorongan bass (tekan ke dalam)
  - 📳 Getar halus
  - 🌀 Deform lokal (cone memompa)
  - ✨ Glow saat beat
  - 🌗 Bayangan/light reaction
- Konsep drag: dari palette efek (di bawah) → jari seret ke zona yang dipilih → zona kena efek
  (atau alternatif sentuh: pilih zona → ketuk efek → otomatis nempel; drag = bonus)

### D. Parameter per zona (semua bisa diatur)
`bass/beat/treble/rm respons · kekuatan gerak (0-200%) · kecepatan · smoothness ·
skala deform (cone depth) · intensitas glow · blur/softness tepi · sinkron ke ritme (snap beat)`

### E. Scene editing lain (tidak dominan, tapi ada)
- Tambah layer gambar lain (tanaman/dekorasi/lampu/meja) — PNG transparan
- Teks, logo, partikel (ember/bintang), efek cahaya (god rays/spotlight)
- Ganti background (solid/gradient/foto/video)
- Layer system (atas-bawah, visibilitas, transparansi) — reuse pola v19.36

---

## 3. Konsep UI Mobile (layout)

```
┌────────────────────────────────────┐
│ [‹]  🎛️ Audio Room       [▶][🚀]  │  ← top bar: kembali, play, render
├────────────────────────────────────┤
│                                    │
│   ┌──────────────────────────┐     │
│   │                          │     │
│   │   GAMBAR RUANGAN         │     │
│   │   (pinch zoom / pan)     │     │
│   │   ⭕ zona speaker kiri    │     │
│   │      ⭕ zona kanan        │     │
│   │                          │     │
│   └──────────────────────────┘     │
│                                    │
│  [✋ Pilih][➕ Zona][🔍 Zoom][🎨 Efek]│  ← toolbar mode (bawah, gampang dipegang)
├────────────────────────────────────┤
│  🎨 EFEEK:  💥Pulse  📳Getar  ✨Glow │  ← palette efek (drag ke zona)
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬     │  ← waveform + beat markers + playhead
└────────────────────────────────────┘
      (saat zona dipilih → bottom sheet muncul dari bawah)
┌────────────────────────────────────┐
│ 🎯 ZONA 1 · speaker kiri           │
│ Respon: [Bass ▾]  Kekuatan: ──●──  │
│ Kecepatan: ──●──  Smooth: ──●──    │
│ Deform: ──●──  Glow: ──●──  Blur:──│
│ [🗑 Hapus][⧉ Duplikat][✓ Selesai]   │
└────────────────────────────────────┘
```

---

## 4. Arsitektur Fitur Audio-Reactive Area

### 4.1 Data model (state)

```ts
// Zona — area reaktif di atas gambar
interface AudioZone {
  id: string;
  name: string;                       // "Speaker Kiri"
  shape: "circle" | "oval" | "polygon";
  // posisi & ukuran RELATIF terhadap gambar (0..1) — aman saat ganti resolusi
  x: number; y: number;               // pusat (circle/oval) atau centroid (polygon)
  rx: number; ry: number;             // jari-jari X & Y (circle/oval)
  points?: { x: number; y: number }[]; // polygon
  rotation: number;
  // binding audio
  audioSrc: string;                   // id audio (satu lagu utama; multi = advanced)
  respon: "bass" | "beat" | "treble" | "rms";
  // parameter gerak
  kekuatan: number;                   // 0..2 (gain)
  kecepatan: number;                  // 0.5..2 (pengali waktu/smoothing)
  smooth: number;                     // 0..1 (attack/release)
  deform: number;                     // 0..1 (kedalaman cone)
  glow: number;                       // 0..2
  blurEdge: number;                   // 0..1 (softness tepi zona)
  snapBeat: boolean;                  // ikut ritme
  // efek aktif (drag dari palette)
  efek: ("pulse" | "basspush" | "getar" | "deform" | "glow" | "shadow")[];
  visible: boolean;
}

interface AudioRoomProject {
  bgImage: string;                    // dataURL gambar ruangan
  bgBlur?: number; bgDim?: number;
  zones: AudioZone[];
  layers: Layer[];                    // reuse layer v19.36 (tanaman/teks/logo/partikel)
  audioUrl: string;
  // setelan global
  beatMode: boolean;                  // tampilkan beat markers
}
```

### 4.2 Mesin animasi (satu sumber, preview == render)

```
audio (AudioBuffer) → hitungPuncak() (0.25s) + deteksiBeats() [sudah ada di lib]
   → setiap frame t:
        feat = fiturAudio(zone.respon, t)   // bass/beat/treble/rms + beatStrength
        → per zona: nilai driver = smooth(zone, feat)  // attack/release
        → renderZona(ctx, bgImage, zone, driver, t)
```

### 4.3 Render zona — teknik LOKAL (kunci "realistis", lihat §5)

---

## 5. Solusi Teknis Paling Realistis: "Local Re-Projection + Depth Overlay"

Karena target HP (Canvas 2D, tanpa WebGL berat), ini pendekatan terbaik:

1. **Gambar dasar digambar sekali** (base image + layer lain).
2. Untuk tiap zona reaktif, **hanya patch di dalam zona yang digambar ulang**
   dari GAMBAR ASLI dengan transformasi lokal:
   - **Pulse (scale)**: `drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh)` — sumber = potongan
     gambar di sekitar zona, tujuan = potongan yang sama tapi di-`scale` terhadap
     pusat zona sebesar `1 + bass*kekuatan`. Hasilnya: bulatan speaker membesar
     seperti mendekat ke kamera — sisa gambar diam.
   - **Deform cone (memompa)**: di dalam zona, gambar ulang patch dengan
     `scaleY = 1 - deform*bass` (menyusut vertikal = cone "masuk") ATAU
     radial bulge: gambar 3 lapis cincin dengan scale berbeda → kesan cekung/cembung.
   - **Getar**: offset kecil `(sin(t*71)+sin(t*57))*kekuatan*rms` pada posisi patch.
3. **Masking halus**: `ctx.save(); ctx.beginPath(); (bentuk zona); ctx.clip();`
   + `blurEdge` via `ctx.filter = blur(...)` di tepi (atau gradient mask radial
   untuk circle/oval: `createRadialGradient` alpha 1→0 di tepi).
4. **Depth overlay** (ini yang bikin "hidup" & realistis):
   - **Bayangan radial di tengah** yang gelapnya berubah `(0.2 + 0.5*bass)` →
     cone terlihat makin cekung saat bass.
   - **Highlight cincin** di tepi zona yang menyala saat beat → kesan cahaya pantul.
   - **Glow** di belakang zona: `globalCompositeOperation="lighter"` + radial gradient
     warna tema, alpha ikut flux.
5. Semua animasi **deterministik** (sinus seeded, bukan Math.random) — konsisten
   antara preview & render, anti "patah-patah" (pelajaran v19.34).

> Ini memakai teknik yang sama dengan `src/lib/speaker.ts` v19.36 (sudah terbukti
> & teruji), tapi diterapkan ke **area di dalam foto user** (bukan speaker vektor).
> Kalau nanti mau lebih halus: **mesh warp ringan** (WebGL, fase advanced) — grid
> 8×8 di dalam zona, vertex di-deform ikut bass → gerakan paling organik.

### Kenapa ini yang paling realistis di HP
- Hanya area zona yang berubah → ruangan/dekorasi diam (permintaan inti).
- Deform + bayangan + highlight = ilusi "diafragma bergerak" tanpa butuh 3D.
- Biaya render rendah (1 drawImage per zona + 2-3 overlay) → mulus di HP & render cepat.

---

## 6. Roadmap Implementasi

### 🟢 FASE 1 — Dasar jalan (prioritas)
- [ ] Modul baru **🎛️ Audio Room** (folder terpisah `src/lib/audio-room/` + halaman `src/app/audio-room/`)
- [ ] Upload gambar ruangan + tampil full-screen
- [ ] Buat zona: ⭕ lingkaran & ⬭ oval (tap tempatkan, handle ubah ukuran, geser)
- [ ] Pinch zoom/pan gambar (gesture) + mode toolbar
- [ ] Zona reaktif: pulse + deform cone + glow (respon bass/beat/rms) — pakai teknik §5
- [ ] Parameter per zona (kekuatan/kecepatan/smooth/deform/glow) — bottom sheet
- [ ] Preview realtime (audio) + render offline (reuse mesin render v19.33)
- [ ] Test (unit: model zona, driver animasi) + demo render

### 🟡 FASE 2 — Lengkap & fleksibel
- [ ] Palette efek + **drag efek ke zona** (pulse/getar/basspush/glow/shadow)
- [ ] Bentuk polygon (tap-tap sudut) + auto-snap ke lingkaran
- [ ] Respon treble + snap beat + sinkron ritme
- [ ] Layer lain (tanaman/dekor/teks/logo/partikel/lighting) — reuse v19.36
- [ ] Preset zona (simpan/muat), multi zona cepat (duplikat kiri→kanan mirror)
- [ ] Timeline: durasi zona, fade, beat markers di panel bawah

### 🔴 FASE 3 — Advanced
- [ ] **Deteksi otomatis bulatan speaker** (scan gambar → cari lingkaran kontras → saran zona)
- [ ] Mesh warp lokal (WebGL) — deform paling organik
- [ ] Multi-audio per zona (beda lagu beda zona)
- [ ] Template "Music Room" (kamar siap pakai) + AI auto-zone (reuse `climax.ts`)
- [ ] Ekspor batch + preset kamera (pan/zoom ikut beat)

---

## 7. Reuse dari Kode yang Sudah Ada (biar cepat & tidak dari nol)

| Sudah ada di VERVE | Dipakai untuk |
|---|---|
| `src/lib/climax.ts` (hitungPuncak, energi) | driver bass/beat/treble per zona |
| `src/lib/beats.ts` (v19.36) | beat markers + snap beat |
| `src/lib/speaker.ts` (v19.36, teknik deform+glow teruji) | basis teknik render zona |
| `src/lib/render-offline.ts` (v19.33/34) | render video di HP (tanpa kepotong) |
| `src/lib/audio-chain.ts` | EQ/kompresor saat render |
| `spectrum-studio.tsx` (lapisan, preset, timeline) | pola UI/state yang bisa ditiru |
| `device-scope.ts` | simpan proyek per perangkat |

---

## 8. Definisi Selesai (DoD)
User upload foto ruangan → tandai 2 bulatan speaker → atur kekuatan/glow →
preview: speaker kiri & kanan memompa ikut bass, ruangan diam →
render 1080p → video jadi. Semua test hijau, tsc 0 error, build sukses.
