# RENCANA v15.3 — PLAY STOP SAAT SENTUH PANGGUNG

> Dokumen kerja internal. Tunggu ACC user ("GO") sebelum dieksekusi.

## Permintaan user (sesuai ringkasan)
> "Saat saya mau geser vidio play nya langsung brenti stop jangan terus menrus jalan maksa"

## Keputusan klarifikasi (sudah ditanyakan ke user)
- **Area tap**: SELURUH panggung + tombol play juga kena (paling konsisten, sentuh di mana pun di panggung = stop)
- **Cue visual**: TANPA (stop diam-diam, minimalis)

## Pendekatan teknis
Edit **1 titik saja** di `src/app/page.tsx`:

### Lokasi
Function `onStageDown` di **line 3049-3055** (saat ini kosong/stub, baru di bawahnya yang handle pinch + drag). Saya tambah **SATU BLOK PENDEK** di AWAL function, SEBELUM logika pinch/pan yang sudah ada. Itu cara paling aman — tidak mengganggu handler apapun (pinch, pan, drag teks, drag stiker tetap jalan).

### Pseudocode (yang akan ditambahkan)
```ts
function onStageDown(e: React.PointerEvent) {
  // 🎬 v15.3 PLAY STOP SAAT SENTUH PANGGUNG — sentuh di mana pun di panggung = stop
  // (ala CapCut: tahan sentuh untuk seret; sekali sentuh = berhenti)
  if (playingRef.current) {
    stopPreview();
  }
  ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // ... (kode yang sudah ada di bawahnya, TIDAK diubah)
}
```

### Kenapa taruh di AWAL function?
- `stopPreview()` idempotent (boleh dipanggil berulang)
- User merasa "1 sentuh = 1 reaksi" — sentuh sekilas = berhenti
- Logika pinch/pan tetap jalan kalau user tahan 2 jari (setelah stop, kalau cubit, tetap cubit)
- Tap tombol play = function `onStageDown` jalan → stop dulu → terus logika lain jalan (tidak apa-apa, `togglePreview` di tombol play BUKAN handler stage — tombol play di panggil `onClick={togglePreview}` yang BUKAN di `onPointerDown={onStageDown}`)

### Yang TIDAK diubah
- Logika pinch (cubit 2 jari = zoom/putar)
- Logika pan (geser 1 jari = geser gambar klip)
- Logika drag teks / stiker
- Tombol play/pause di header (cbtn play line 3308) — jalan terpisah
- Tombol hapus (v6e-stagedel) — jalan terpisah
- Track timeline, transisi, dll — semua aman

## Bukti yang akan dikumpulkan (protokol PATUH README)
1. ✅ `tsc --noEmit` exit 0
2. ✅ `npm run build` exit 0
3. ✅ 6/6 test suite hijau (vidplan, vidloop, stokgudang, wavpotong, keterangan_tampil, sutradara_paham)
4. ✅ Smoke CSS: verifikasi tidak ada CSS rusak
5. ✅ Commit + push + tag `v15.3-play-stop-calon`
6. ✅ Branch `backup/v15.3-play-stop-calon`
7. ⏳ Minta user screenshot HP (validasi)
8. ⏳ Tunggu "kunci" → push tag `v15.3-play-stop-lock`

## Risiko & mitigasi
- **Risiko**: user mau play lagi setelah stop — harus tap tombol play manual.
  **Mitigasi**: ini memang perilaku CapCut (1 tap = stop, play lagi via tombol). User sudah ACC area "tombol play juga kena".
- **Risiko**: ada case edge dimana `playingRef.current === true` tapi `stopPreview` sudah dipanggil.
  **Mitigasi**: `stopPreview` cek `rafRef.current` & state internal, idempotent.
- **Risiko**: multitouch — kalau 2 jari langsung cubit saat play, apakah 1 sentuh pertama = stop, terus cubit = zoom?
  **Mitigasi**: ini SENGAJA — user "maksa" mau stop, terus mulai cubit. Perilaku yang masuk akal.
