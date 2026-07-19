# 🎬 CapCut-Style Studio (`capcut-studio/`)

Modul standalone baru di repo ini: **editor video web dengan tampilan & workflow ala CapCut**, dibuat untuk melengkapi suite `verve-video-studio` yang sudah ada (Next.js). 100% HTML/CSS/JS murni — tanpa build step, langsung buka `index.html`-nya di browser.

> Modul ini tidak mengubah kode/memori proyek utama — benar-benar tambahan terpisah.

## ✨ Fitur Editor (ala CapCut)

- **Top bar** — nama proyek editable + tombol **Export** hijau.
- **Activity bar kiri** — Media · Audio · Teks · Stiker · Efek · Transisi · Filter · **Suno AI**.
- **Preview player** — canvas real-time + transport (play/pause, frame step, fullscreen).
- **Inspector kanan** — nama, waktu mulai, durasi, volume, opacity, fade in/out, filter, isi/ukuran/warna/posisi teks.
- **Timeline multi-track** (Teks/Stiker — Video Utama — Audio):
  - Drag untuk geser klip + **magnetic snapping** (ke klip lain & playhead)
  - Trim tepi klip, **✂ Potong (Ctrl+B)** di playhead, hapus (Delete)
  - Zoom 10–200 px/detik, ruler timecode untuk scrub
- **Efek/Filter/Transisi** — B&W, Sepia, Vivid, Sinematik, Retrowave, Noir, Blur, Fade, dst.
- **Export WebM** video+audio termix (MediaRecorder + Web Audio).

## 🎵 Bagian Suno — Generate Lagu

Tab **🎵 Suno AI** adalah bagian khusus untuk bikin lagu:

1. Isi **Endpoint API** + **API Key** gateway Suno pihak ketiga milikmu
   (Suno tidak punya API resmi publik → pakai provider seperti sunoapi/GoAPI; request
   dipost sebagai `{prompt, style, title, instrumental, model}` dan URL audio otomatis
   dideteksi dari respons / polling task).
2. Tulis **judul, prompt, style/tags**, pilih **model (v3.5/v4/v4.5)**, centang *Instrumental* bila perlu.
3. Klik **🎵 Generate Lagu** → hasil tampil sebagai kartu lagu ber-audio-player, dengan tombol **➕ Timeline** (langsung masuk track audio editor) dan **⬇ Unduh**.
4. **Mode Demo** (tanpa API): lagu *disintesis sungguhan di browser* (melodi/bass/drum di-seed dari prompt via Web Audio API → file WAV). Cocok untuk tes alur tanpa menunggu API.

Endpoint & key hanya tersimpan di `localStorage` browser sendiri.

## 🚀 Menjalankan

```bash
cd capcut-studio
# langsung buka index.html, atau:
npx serve .
python3 -m http.server 8080
```

Bisa juga di-host statis (Vercel/Netlify/Pages) — tidak ada dependency.

## ⌨ Shortcut

`Spasi` play/pause · `Ctrl/Cmd+B` potong · `Delete` hapus klip · `←/→` frame step · `Home` ke awal · dobel-klik klip → playhead lompat

## ⚖️ Catatan

Implementasi **orisinal** yang terinspirasi tata letak editor modern seperti CapCut — tanpa menyalin kode, logo, nama, atau aset pihak manapun. CapCut adalah merek dagang ByteDance; modul ini tidak berafiliasi.
