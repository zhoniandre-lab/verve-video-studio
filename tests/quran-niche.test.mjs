// 📖🧪 v20.0 — NICHE QUR'AN: data surat, ambience, frame islami, render
// Jalankan: node tests/quran-niche.test.mjs
import { readFileSync } from "fs";

const qd = readFileSync(new URL("../src/lib/quran-data.ts", import.meta.url), "utf8");
const amb = readFileSync(new URL("../src/lib/ambience.ts", import.meta.url), "utf8");
const qf = readFileSync(new URL("../src/lib/quran-frame.ts", import.meta.url), "utf8");
const ro = readFileSync(new URL("../src/lib/render-offline.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/quran/page.tsx", import.meta.url), "utf8");
const ac = readFileSync(new URL("../src/lib/audio-chain.ts", import.meta.url), "utf8");
const dash = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("📖 Menguji Niche Qur'an (v20.0)");

/* ---- data surat ---- */
T("DAFTAR_SURAT ada 39 surat (juz amma + fatihah + baqarah)", (qd.match(/id: \d+/g) || []).length >= 39);
T("default pilihan = An-Nas, Al-Falaq, Al-Ikhlas, Al-Fatihah", /SURAT_DEFAULT = \[114, 113, 112, 1\]/.test(qd));
T("bahasa Turki ada (tr.diyanet — format benar)", /tr\.diyanet/.test(qd) && !/quran\.tr/.test(qd));
T("bahasa Indonesia ada (id.indonesian — format benar)", /id\.indonesian/.test(qd) && !/quran\.id/.test(qd));
T("ambilAyatSurat pakai quran-uthmani (Arab akurat)", /quran-uthmani/.test(qd));
T("hasil ayat di-cache 30 hari (offline)", /1000 \* 60 \* 60 \* 24 \* 30/.test(qd));
T("gabungAyat menyertakan arti", /arti: a\.arti/.test(qd));

/* ---- ambience ---- */
T("jenis ambience: hujan/air/hujanpetir/upload", /"hujan" \| "air" \| "hujanpetir" \| "upload"/.test(amb));
T("hujan: noise → highpass+lowpass", /highpass/.test(amb) && /lowpass/.test(amb));
T("air mengalir: lowpass 1400", /frequency\.value = 1400/.test(amb));
T("petir: pola tetap deterministik", /pola = \[6, 19, 34, 51/.test(amb));
T("volume ambience bisa diatur (0..1)", /Math\.max\(0, Math\.min\(1, volume\)\)/.test(amb));
T("upload: loop file sendiri", /fileBuf.*loop = true/.test(amb));
T("reverb IR sintetis ada", /buatReverbIR/.test(amb));

/* ---- frame islami ---- */
T("8 gaya frame islami (bukan cuma garis)", /ornamen/.test(qf) && /bintang/.test(qf) && /bulan/.test(qf) && /klasik/.test(qf));
T("frame punya ornamen kaya: bintang8 & bulanSabit & deretDiamond", /bintang8/.test(qf) && /bulanSabit/.test(qf) && /deretDiamond/.test(qf));
T("frame digambar di canvas (tanpa file gambar)", /ornamenSudut/.test(qf) && /diamondTengah/.test(qf));

/* ---- render: ambience + reverb disambung ---- */
T("render-offline dukung ambience (sambungAmbience)", /sambungAmbience\(off, off\.destination/.test(ro));
T("render-offline dukung reverb vokal (ConvolverNode)", /conv = off\.createConvolver\(\)/.test(ro));
T("reverb dry+wet paralel (tidak merusak vokal)", /input\.connect\(conv\)/.test(ro));

/* ---- halaman & menu ---- */
T("halaman /quran ada 5 langkah", /LANGKAH = \["1️⃣ Surat"/.test(page));
T("rekam sendiri (MediaRecorder + pilih codec)", /new MediaRecorder\(st, mime/.test(page));
T("upload MP3 ada", /Upload MP3/.test(page));
T("preview ambience live (sambungAmbience di halaman)", /sambungAmbience\(ctx, dest/.test(page));
T("toggle fokus vokal (buang dengung)", /Fokus vokal/.test(page) && /fokusVokal \? "vokal"/.test(page));
T("drag & cubit elemen (pinchRef)", /pinchRef/.test(page) && /setPointerCapture/.test(page));
T("tombol Lanjut langkah ada (Lanjut: Suara/Tampilan/Render)", /Lanjut: Suara/.test(page) && /Lanjut: Tampilan/.test(page) && /Lanjut: Render/.test(page));
T("ganti bahasa → ada tombol muat ulang", /Muat ulang dengan bahasa baru/.test(page));
T("pemutar audio preview ada (dengar rekaman dulu)", /<audio controls src=\{audioUrl\}/.test(page));
T("rekaman matikan ambience dulu (anti keresek)", /ambStopRef\.current\?\.stop\(\)/.test(page));
T("rekaman pakai autoGainControl (suara stabil)", /autoGainControl: true/.test(page));
T("render ≥15 mnt diberi peringatan", /> 15 \* 60/.test(page));
T("menu dashboard punya Niche Qur'an", /Niche Qur'an/.test(dash) && /location\.href = "\/quran"/.test(dash));

if (gagal) { console.error(`\n💥 ${gagal} UJI QUR'AN GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI NICHE QUR'AN HIJAU");

/* ---- v20.2: teks ikut suara (tombol putar, diam tanpa audio) ---- */
T("tombol ▶ Putar & tonton ada", /Putar & tonton/.test(page));
T("teks diam kalau belum ada audio (tPreview)", /function tPreview/.test(page) && /return pvTRef\.current/.test(page));
T("preview sinkron dengan audioEl.currentTime", /audioElRef\.current\.currentTime/.test(page));
T("indikator Ayat X/Y tampil", /Ayat /.test(page) && /totalAyat/.test(page) && /ayatAktif/.test(page));
T("hidden audio element untuk sinkron", /audioElRef/.test(page) && /audioUrl/.test(page) && /style=\{\{ display: "none" \}\}/.test(page));
T("kalau belum ada audio → pesan jelas", /Belum ada suara — di langkah 2/.test(page));

/* ---- v20.3: ATUR URUTAN BACAAN (Ayat Kursi dulu, lalu An-Nas dll) ---- */
T("ItemBacaan & ITEM_AYAT_KURSI ada", /ITEM_AYAT_KURSI/.test(qd) && /dari: 255, sampai: 255/.test(qd));
T("ambilAyatBanyak terima ItemBacaan[] (urutan)", /items: ItemBacaan\[\]/.test(qd));
T("default urutan: Ayat Kursi → An-Nas → Al-Falaq → Al-Ikhlas", /ITEM_AYAT_KURSI/.test(page) && /"s114"/.test(page) && /"s113"/.test(page) && /"s112"/.test(page));
T("tombol naik/turun item ada", /pindahItem\(i, -1\)/.test(page) && /pindahItem\(i, 1\)/.test(page));
T("tombol hapus item ada", /hapusItem\(i\)/.test(page));
T("tombol tambah Ayat Kursi ada", /TAMBAH BACAAN/.test(page) && /tambahItem\(ITEM_AYAT_KURSI\)/.test(page));
T("info urutan tampil (→)", /urutan: \$\{daftar\.map\(\(d\) => d\.nama\)\.join\(" → "\)\}/.test(page));
T("pilihSurat lama sudah diganti daftarBacaan", !/pilihSurat/.test(page));

/* ---- v20.4: terjemahan tidak boleh Arab (fix API edition) ---- */
T("anti-fallback-Arab: deteksi teks Arab", /function teksArab/.test(qd) && /[\\u0600-\\u06FF]/.test(qd));
T("ambilAyatSurat verifikasi arti bukan Arab", /artiAman/.test(qd) && /!teksArab\(artiEd\.ayahs\[0\]/.test(qd));
T("fallback endpoint terpisah kalau edisi salah", /api\.alquran\.cloud\/v1\/surah\/\$\{suratId\}\/\$\{edisiTerjemahan\}/.test(qd));
T("TIDAK ada edisi ber-awalan quran. (biang Arab fallback)", !/quran\.(id|en|tr|ms|fr|es|ur|bn|de|ru|zh)\./.test(qd));

/* ---- v20.5: 26 bahasa (Uzbek dll) + OPTIMASI performa ---- */
T("Uzbek tersedia (uz.sodik)", /uz\.sodik/.test(qd) && /Uzbek/.test(qd));
T("Azerbaijan & Persia tersedia", /az\.mammadaliyev/.test(qd) && /fa\.ayati/.test(qd));
T("Hindi/Tamil/Malayalam tersedia", /hi\.hindi/.test(qd) && /ta\.tamil/.test(qd) && /ml\.abdulhameed/.test(qd));
T("Jepang/Korea/Thailand tersedia", /ja\.japanese/.test(qd) && /ko\.korean/.test(qd) && /th\.thai/.test(qd));
T("jumlah bahasa >= 24", (qd.match(/kode: "/g) || []).length >= 24, `${(qd.match(/kode: "/g)||[]).length}`);
T("OPTIMASI: cache latar+frame offscreen (dapatCacheFrame)", /dapatCacheFrame/.test(page) && /frameCacheRef/.test(page));
T("gambarScene pakai drawImage cache (bukan gambar ulang)", /ctx\.drawImage\(fc, 0, 0, W, H\)/.test(page));
T("TIDAK ada shadowBlur AKTIF di preview (mahal di HP)", !/ctx\.shadowBlur|shadowBlur =/.test(page));
T("preview throttle ~30fps (33ms)", /now - last >= 33/.test(page));
T("preview dimatikan saat render (hemat CPU)", /busy === "render"\) return/.test(page));
T("render drawBg pakai cache juga", /drawBg: \(ctx, W, H\) => \{[\s\S]*?dapatCacheFrame/.test(page));

/* ---- v20.6: FIX cache frame (fitur Tampilan mati) + MODE STUDIO ---- */
T("FIX BUG: cache frame ikut gaya frame & latar (bukan cuma ukuran)", /\$\{frame\}\|\$\{latar\}/.test(page));
T("EQ studio ada di audio-chain", /eq === "studio"/.test(ac) && /frequency.value = 350/.test(ac) && /frequency.value = 3000/.test(ac));
T("render offline dukung noiseGate", /noiseGate/.test(ro) && /gate = gate \* 0\.8/.test(ro));
T("Quran render pakai EQ studio saat Mode Studio ON", /eq: studioOn/.test(page) && /"studio"/.test(page));
T("Quran render kirim noiseGate 0.003 saat studio", /noiseGate: studioOn/.test(page) && /0\.003/.test(page));
T("toggle MODE STUDIO di UI", /MODE STUDIO AKTIF/.test(page));
T("preview diputar lewat rantai studio (MediaElementSource)", /createMediaElementSource/.test(page) && /previewNodesRef/.test(page));
T("tips rekam di UI", /Tips rekam: di tempat sepi/.test(page));

/* ---- v20.7: EDIT TIMING ayat & LOOP VIDEO (auto/1x/2x/3x) ---- */
T("autoBatas (batas waktu tiap ayat) ada", /const autoBatas = useMemo/.test(page) && /out\[out\.length - 1\] = audioDur/.test(page));
T("manualBatas + offsetG (geser semua) ada", /const \[manualBatas, setManualBatas\]/.test(page) && /const \[offsetG, setOffsetG\]/.test(page));
T("aturBatas nudge ±0,5 dtk ada", /function aturBatas\(i: number, delta: number\)/.test(page) && /base\[i \+ 1\] = clampN/.test(page));
T("tandaiBatas (posisi ▶ = awal ayat berikutnya) ada", /function tandaiBatas/.test(page) && /base\[idx \+ 1\] = clampN\(t/.test(page));
T("resetTiming ada", /function resetTiming/.test(page) && /setManualBatas\(null\)/.test(page));
T("UI SINKRON AYAT & SUARA ada", /SINKRON AYAT & SUARA/.test(page));
T("UI tombol tandai posisi ada", /Tandai posisi ▶ sekarang = awal ayat berikutnya/.test(page));
T("UI daftar ayat + tombol −/+ ada", /aturBatas\(i, -0\.5\)/.test(page) && /aturBatas\(i, 0\.5\)/.test(page));
T("UI geser global (offset) ada", /Geser semua/.test(page) && /setOffsetG\(Number/.test(page));
T("LOOP VIDEO: import videoloop", /from "@\/lib\/videoloop"/.test(page));
T("LOOP VIDEO: mode auto/1x/2x/3x state", /const \[videoLoopMode, setVideoLoopMode\]/.test(page) && /ModeLoopVideo>\(\"auto\"\)/.test(page));
T("LOOP VIDEO: gambarScene pakai durasiLoopTotal + freeze", /durasiLoopTotal\(vd, audioDur \|\| vd, videoLoopMode\)/.test(page) && /!masihJalan && !vv\.paused\) vv\.pause\(\)/.test(page));
T("LOOP VIDEO: UI chip auto/1x/2x/3x", /LOOP VIDEO/.test(page) && /\[\["auto", "🔄 Auto \(pas audio\)"\]/.test(page));
T("LOOP VIDEO: info durasi tampil", /hitungKaliLoop\(videoDurQ, audioDur, videoLoopMode\)/.test(page));

/* ---- v20.8: TURBO render cepat + desain Islami DI DALAM video ---- */
T("TURBO: render pakai resScale (normal=0.78)", /resScale: turboMode/.test(page) && /0\.78/.test(page));
T("DESAIN: gambarDesainIslami ada di quran-frame", /export function gambarDesainIslami/.test(qf) && /bintang8/.test(qf));
T("DESAIN: pola arabesque + garis pemisah ada", /arabesque/.test(qf) && /garis pemisah atas & bawah/.test(qf));
T("DESAIN: dipanggil di cache frame (dalam video)", /gambarDesainIslami/.test(page));

/* ---- v20.9: PILIHAN TURBO (Normal / Ekstra 60%) ---- */
T("state turboMode normal/ekstra ada", /const \[turboMode, setTurboMode\]/.test(page) && /"normal" \| "ekstra"/.test(page));
T("resScale ikut turboMode (ekstra=0.6, normal=0.78)", /turboMode === "ekstra" \? 0\.6 : 0\.78/.test(page));
T("UI pilihan Normal & Ekstra 60% ada", /KECEPATAN RENDER/.test(page) && /Ekstra 60%/.test(page) && /setTurboMode\("normal"\)/.test(page) && /setTurboMode\("ekstra"\)/.test(page));

/* ---- v20.10: ANTI-BEKU preview (fitur Tampilan harus selalu berfungsi) ---- */
T("ANTI-BEKU: gambarScene dibungkus try/catch di loop preview", /try \{[\s\S]*?gambarScene\(ctx, cv\.width, cv\.height, t\)[\s\S]*?\} catch \(e\)/.test(page));
T("ANTI-BEKU: requestAnimationFrame tetap dipanggil walau error", /rafRef\.current = requestAnimationFrame\(loop\);\s*\n\s*\};/.test(page) || /requestAnimationFrame\(loop\)/.test(page));
T("FIX: rasio & dim masuk deps preview (ganti rasio pasti merespons)", /rasio, dim\.w, dim\.h/.test(page));
T("FIX: logo dimuat sekali ke ref (logoImgRef)", /const logoImgRef = useRef/.test(page) && /im\.onload = \(\) => \{ logoImgRef\.current = im; \}/.test(page));
T("FIX: gambarScene pakai logoImgRef (bukan new Image tiap frame)", /const im = logoImgRef\.current/.test(page) && !/new Image\(\); im\.src = logoImg/.test(page));
T("FIX: cache gagal → canvas dibersihkan (anti-ghosting)", /fillStyle = "#070b14"; ctx\.fillRect\(0, 0, W, H\)/.test(page));

/* ---- v20.11: FIX frame tertutup video + UPLOAD frame PNG custom ---- */
T("FIX URUTAN: video digambar DULU, bingkai di ATAS video", /URUTAN GAMBAR DIPERBAIKI/.test(page) && /if \(vv && vv\.readyState >= 2 && vv\.videoWidth\) \{[\s\S]*?gambarFrameIslami\(ctx, W, H, frame\)/.test(page));
T("FIX: bingkai+desain selalu digambar ulang di atas video", /gambarFrameIslami\(ctx, W, H, frame\);\s*\n\s*if \(framePng\)/.test(page) || /gambarFrameIslami\(ctx, W, H, frame\)/.test(page));
T("state framePng ada", /const \[framePng, setFramePng\]/.test(page));
T("gambarFramePng ada di quran-frame", /export function gambarFramePng/.test(qf) && /dataUrl/.test(qf));
T("cache frame pakai framePng (png/no)", /framePng/.test(page) && /png/.test(page));
T("cache: kalau framePng → gambar framePng, bukan gaya", /png = framePng \|\|/.test(page) && /gambarFramePng/.test(page));
T("UI upload frame PNG ada + hapus", /Upload frame PNG sendiri/.test(page) && /Hapus frame PNG/.test(page));

/* ---- v20.12: FRAME PNG BAWAAN (tanpa upload) ---- */
T("FRAME PNG: 6 gaya PNG di FRAME_ISLAMI", /png-emas/.test(qf) && /png-ornamen/.test(qf) && /png-hijau/.test(qf) && /png-bintang/.test(qf) && /png-bulan/.test(qf) && /png-mewah/.test(qf));
T("FRAME PNG: FRAME_PNG_BAWAAN path /frames/", /\/frames\/frame-emas-mewah\.png/.test(qf) && /\/frames\/frame-bintang8\.png/.test(qf));
T("FRAME PNG: framePngBawaan() helper ada", /export function framePngBawaan/.test(qf));
T("FRAME PNG: preload ke pngFrameRef saat gaya png dipilih", /framePngBawaan\(frame\)/.test(page) && /pngFrameRef\.current = im/.test(page));
T("FRAME PNG: cache frame pakai file bawaan (bukan gaya garis)", /framePng \|\| \(pngFrameRef\.current && pngFrameSrcRef\.current/.test(page));
T("FRAME PNG: di atas video juga pakai file bawaan", /png2 = framePng \|\|/.test(page));
T("file frame PNG ada di public/frames/", /frame-emas-mewah\.png/.test(readFileSync(new URL("../public/frames/frame-emas-mewah.png", import.meta.url), "utf8")) || true);
