/* 💎 VERVE — Dashboard Penjual / Demo Showcase (v19.1)
   Halaman presentasi buat calon pembeli: nunjukin kecanggihan otak,
   fitur, dan teknologi tanpa harus bongkar kode. Mobile-first. */
"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeBrainPatterns } from "@/lib/brain/pattern-insight";
import styles from "./jualan.module.css";

type BrainMemory = { researches?: unknown[]; results?: { title?: string; ctr?: number | ""; time?: number }[] };

const FITUR = [
  { ic: "🧠", t: "Otak yang Belajar Sendiri", d: "Feedback loop otomatis: performa video channel ditarik dari YouTube (read-only) dan diubah jadi pola. Judul yang tembus makin diprioritaskan, yang gagal otomatis dihukum. Tanpa isi manual." },
  { ic: "🎬", t: "Editor Kelas CapCut di Browser", d: "Potong, timeline, lirik karaoke, transisi sinematik, visualizer musik, thumbnail — semua jalan di HP, tanpa install. PWA offline-ready." },
  { ic: "🎵", t: "Cerita Jadi Lagu AI", d: "Ketik cerita → judul juara → naskah → adegan bergambar → lagu AI lengkap dengan lirik yang sinkron ke ketukan. Satu alur utuh dari nol sampai video jadi." },
  { ic: "🏆", t: "Mesin Judul Juara", d: "Setiap judul diskor 6 dimensi (Search, Browse, Unik, Gap, Hook, Kualitas) dengan alasan yang bisa diaudit. Bukan kotak hitam — semua angka bisa diperiksa." },
  { ic: "🩺", t: "Dokter Channel (Growth Doctor)", d: "Tempel angka/URL/screenshot YouTube Studio → VERVE jawab Kenapa sepi, Kok bisa, Seharusnya apa, lalu kasih aksi konkret + eksperimen yang bisa diukur." },
  { ic: "👤", t: "Karakter Konsisten 90–95%", d: "Kartu karakter + kalimat identitas beku disuntik ke tiap prompt gambar. Wajah, pakaian, suasana SAMA dari adegan 1 sampai akhir — ciri video mahal." },
];

const LANGKAH = [
  { ic: "👀", t: "Otak Menonton", d: "Setiap hari (atau sekali klik) otak menarik data asli channel: views, AVD, likes, impressions, CTR." },
  { ic: "🧠", t: "Otak Belajar", d: "Bayesian CTR + analisis pola: mana gaya judul yang tembus, mana yang gagal. Data lama meluruh — selalu ikut tren." },
  { ic: "🎯", t: "Otak Menyarankan", d: "Judul baru ditulis memakai pola yang terbukti, disaring dari judul gagal & duplikat. Makin dipakai, makin tajam." },
];

const TEKNO = [
  "18 model AI · auto-fallback", "OAuth YouTube read-only (aman)", "Token AES-256-GCM", "Bayes CTR + time-decay",
  "Kill-switch BOS + ledger kredit", "Parser CSV/OCR YouTube Studio", "Anti-halusinasi: semua skor punya reasons[]",
  "Render realtime anti-crash HP", "Memori brankas Supabase", "PWA auto-update",
];

const EDISI = [
  { ic: "🚀", name: "Personal", tag: "Rp 499rb", tagSmall: "sekali bayar", hot: false,
    list: ["Semua fitur AI + otak belajar", "Editor + lagu + analitik dalam 1 app", "Update 6 bulan", "1 perangkat / channel", "Tanpa source code"],
    cta: "Tanya via Pemilik", href: "#", ghost: false },
  { ic: "💼", name: "Pro / Reseller", tag: "Rp 1,5jt", tagSmall: "sekali bayar", hot: true,
    list: ["Semua fitur Personal", "Lisensi hingga 3 channel/pengguna", "Panduan deploy (Vercel + Supabase)", "Update 1 tahun + prioritas support", "Boleh jual jasa produksi"],
    cta: "Paling Laris →", href: "#", ghost: false },
  { ic: "👑", name: "Lisensi Penuh (White-label)", tag: "Hubungi", tagSmall: "negosiasi", hot: false,
    list: ["Source code penuh", "Branding sendiri (nama, logo, warna)", "Pendampingan deploy 3 bulan", "Cocok agency / startup", "Kontrak & dukungan khusus"],
    cta: "Diskusi Khusus", href: "#", ghost: true },
];

/* 🧠 Mockup panel otak — wajah asli di dalam app (contoh ilustrasi). */
function BrainMockupSvg() {
  return (
    <svg viewBox="0 0 340 700" className="mockup" role="img" aria-label="Mockup panel otak VERVE di dalam app">
      {/* Frame HP */}
      <rect x="18" y="18" width="304" height="664" rx="26" fill="#0a0a14" stroke="#23233a" strokeWidth="1.5" />
      <rect x="30" y="96" width="280" height="238" rx="14" fill="#12121e" stroke="#1d1d2c" />
      <rect x="30" y="348" width="280" height="216" rx="14" fill="#12121e" stroke="#1d1d2c" />
      <rect x="18" y="640" width="304" height="42" fill="#0d0d18" stroke="#1d1d2c" />

      {/* Header */}
      <text x="46" y="62" fontSize="14" fontWeight="800" fill="#ffffff">🏆 Pilih judul juara</text>
      <text x="46" y="80" fontSize="8.5" fill="#77778a">Semua kandidat diskor vs pola &amp; kompetitor</text>

      {/* Card 1: Pola yang dipelajari otak */}
      <text x="46" y="122" fontSize="12.5" fontWeight="800" fill="#ffffff">🧠 Pola yang dipelajari otak</text>
      <text x="46" y="140" fontSize="8.5" fill="#77778a">Dasar: CTR channel 3.9% · 12 judul berangka</text>

      <rect x="44" y="152" width="252" height="40" rx="9" fill="#052e2c" stroke="#19c2b855" />
      <text x="54" y="177" fontSize="10.5" fontWeight="800" fill="#19c2b8">▲ +2.4%</text>
      <text x="112" y="177" fontSize="9" fill="#d6f5f2">pakai ANGKA · CTR 6.8% (3 judul)</text>

      <rect x="44" y="200" width="252" height="40" rx="9" fill="#052e2c" stroke="#19c2b855" />
      <text x="54" y="225" fontSize="10.5" fontWeight="800" fill="#19c2b8">▲ +1.9%</text>
      <text x="112" y="225" fontSize="9" fill="#d6f5f2">kata EMOSI · CTR 5.8% (4 judul)</text>

      <rect x="44" y="248" width="252" height="40" rx="9" fill="#2b1214" stroke="#e85c5c66" />
      <text x="54" y="273" fontSize="10.5" fontWeight="800" fill="#e85c5c">▼ -1.8%</text>
      <text x="112" y="273" fontSize="9" fill="#f2d6d6">judul PANJANG · CTR 2.1% (2 judul)</text>

      <text x="46" y="322" fontSize="8.5" fill="#fde68a">🏆 Judul terbaik: “5 Ibu yang Bikin Nangis” (CTR 7.2%)</text>

      {/* Card 2: Saran judul dari otak */}
      <text x="46" y="374" fontSize="12.5" fontWeight="800" fill="#ffffff">🎯 Saran judul dari otak</text>
      <text x="46" y="392" fontSize="8.5" fill="#77778a">Ditulis dari pola yang TERBUKTI tembus di channelmu</text>

      <rect x="44" y="404" width="252" height="40" rx="9" fill="#12121e" stroke="#8b5cf633" />
      <circle cx="62" cy="424" r="11" fill="#19c2b822" stroke="#19c2b8" />
      <text x="62" y="428" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="middle">87</text>
      <text x="84" y="428" fontSize="10" fontWeight="700" fill="#ffffff">5 Ibu yang Bikin Nangis</text>
      <text x="288" y="428" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="end">Pakai →</text>

      <rect x="44" y="452" width="252" height="40" rx="9" fill="#12121e" stroke="#8b5cf633" />
      <circle cx="62" cy="472" r="11" fill="#19c2b822" stroke="#19c2b8" />
      <text x="62" y="476" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="middle">82</text>
      <text x="84" y="476" fontSize="10" fontWeight="700" fill="#ffffff">3 Kisah Ibu yang Tak Terlupakan</text>
      <text x="288" y="476" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="end">Pakai →</text>

      <rect x="44" y="500" width="252" height="40" rx="9" fill="#12121e" stroke="#8b5cf633" />
      <circle cx="62" cy="520" r="11" fill="#19c2b822" stroke="#19c2b8" />
      <text x="62" y="524" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="middle">76</text>
      <text x="84" y="524" fontSize="10" fontWeight="700" fill="#ffffff">Rindu Ibu Sampai Menangis</text>
      <text x="288" y="524" fontSize="8.5" fontWeight="800" fill="#19c2b8" textAnchor="end">Pakai →</text>

      <text x="46" y="550" fontSize="8.5" fill="#77778a">Disaring: nggak mirip judul gagal · nggak kembar</text>

      {/* Bottom nav */}
      {[[48.4, "✂️", "Edit"], [109.2, "🧬", "Lab AI"], [170, "⭐", "Template"], [230.8, "📁", "Proyek"], [291.6, "👤", "Saya"]].map(([cx, ic, lb]) => (
        <g key={lb as string}>
          <text x={cx as number} y="662" fontSize="13" textAnchor="middle">{ic as string}</text>
          <text x={cx as number} y="676" fontSize="7" fill="#77778a" textAnchor="middle">{lb as string}</text>
        </g>
      ))}
    </svg>
  );
}

export default function JualanPage() {
  const [brain, setBrain] = useState<BrainMemory>({ results: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("verve_brain_v1");
      if (raw) setBrain(JSON.parse(raw) as BrainMemory);
    } catch { /* no-op */ }
  }, []);
  const insight = useMemo(() => {
    try { return analyzeBrainPatterns(brain as never); } catch { return null; }
  }, [brain]);

  return (
    <div className={styles.page}>
      {/* ── Topbar ── */}
      <header className={styles.topbar}>
        <div className={styles.logo}>🎬 VERVE <span>Studio Video & Musik AI</span></div>
        <a className={styles.ctaTop} href="/">Coba Langsung →</a>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.badge}>🧠 AI yang belajar dari CHANNEL KAMU — bukan template asal</div>
        <h1>Studio Video AI dengan <span>Otak yang Belajar Sendiri</span></h1>
        <p>Dari cerita jadi lagu, adegan, sampai video jadi — dengan mesin judul yang makin pintar tiap kali channelmu dapat view. Semua di browser HP, tanpa install.</p>
        <div className={styles.heroCtas}>
          <a className={styles.btnPrimary} href="/">🚀 Coba Sekarang</a>
          <a className={styles.btnGhost} href="#fitur">Lihat Fitur</a>
        </div>
        <div className={styles.stats}>
          <div><b>18</b><span>model AI + fallback</span></div>
          <div><b>3-in-1</b><span>edit · musik · analitik</span></div>
          <div><b>100%</b><span>browser, tanpa install</span></div>
          <div><b>0</b><span>ngarang angka — semua teraudit</span></div>
        </div>
      </section>

      {/* ── Fitur ── */}
      <section className={styles.section} id="fitur">
        <h2>Bukan sekadar editor video</h2>
        <p className={styles.sub}>Ini satu-satunya studio yang <b>belajar dari hasil channelmu sendiri</b> dan memakai ilmunya untuk video berikutnya.</p>
        <div className={styles.grid}>
          {FITUR.map((f) => (
            <div key={f.t} className={styles.card}>
              <div className={styles.cardIc}>{f.ic}</div>
              <b>{f.t}</b>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cara otak belajar ── */}
      <section className={styles.section}>
        <h2>Gimana otaknya bekerja?</h2>
        <div className={styles.steps}>
          {LANGKAH.map((s, i) => (
            <div key={s.t} className={styles.step}>
              <div className={styles.stepNum}>{i + 1}</div>
              <div className={styles.stepIc}>{s.ic}</div>
              <b>{s.t}</b>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
        <p className={styles.loopNote}>↻ Loop ini berjalan otomatis — sekali hubungkan YouTube, otak makan data tiap hari.</p>
      </section>

      {/* ── Mockup: wajah aslinya di dalam app ── */}
      <section className={styles.section}>
        <h2>Ini wajahnya di dalam app</h2>
        <p className={styles.sub}>Bukan konsep — panel ini benar-benar ada di Lahan Awalan. Otak menunjukkan pola yang dipelajarinya dan langsung menulis judul baru dari pola itu.</p>
        <div className={styles.mockupWrap}>
          <BrainMockupSvg />
          <p className={styles.mockupCaption}>Contoh ilustrasi dengan data tiruan — di perangkatmu, angkanya berasal dari channel YouTube-mu sendiri.</p>
        </div>
      </section>

      {/* ── Bukti otak bekerja (live dari HP ini) ── */}
      <section className={styles.section}>
        <h2>Bukti otak bekerja — live dari perangkat ini</h2>
        <p className={styles.sub}>Kalau kamu buka halaman ini dari HP yang sama dengan app VERVE, ini catatan otak yang sebenarnya:</p>
        <div className={styles.live}>
          {!insight || insight.withCtr === 0 ? (
            <p className={styles.liveEmpty}>📭 Belum ada data performa di otak perangkat ini. Di app, tekan <b>“Sync & Belajar”</b> — otak langsung makan data channel YouTube-mu.</p>
          ) : (
            <>
              <div className={styles.liveRow}><span>Judul dipelajari</span><b>{insight.n}</b></div>
              <div className={styles.liveRow}><span>Dengan CTR asli</span><b>{insight.withCtr}</b></div>
              <div className={styles.liveRow}><span>Baseline CTR</span><b>{insight.baselineCtr}%</b></div>
              {insight.top[0] && <div className={styles.liveWin}>▲ Pola tembus: <b>{insight.top[0].label}</b> — CTR {insight.top[0].avgCtr}% vs baseline {insight.baselineCtr}%</div>}
              {insight.worst[0] && <div className={styles.liveLose}>▼ Pola gagal: <b>{insight.worst[0].label}</b> — CTR {insight.worst[0].avgCtr}%</div>}
              {insight.best && <div className={styles.liveBest}>🏆 Judul terbaik: <b>“{insight.best.title}”</b> (CTR {insight.bestCtr}%)</div>}
            </>
          )}
        </div>
      </section>

      {/* ── Teknologi ── */}
      <section className={styles.section}>
        <h2>Teknologi di balik layar</h2>
        <div className={styles.chips}>
          {TEKNO.map((t) => <span key={t}>{t}</span>)}
        </div>
      </section>

      {/* ── Harga / edisi ── */}
      <section className={styles.section} id="harga">
        <h2>Pilih edisimu</h2>
        <p className={styles.sub}>Semua edisi = sekali bayar, tanpa langganan. Harga indikatif — negosiasi terbuka, terutama untuk lisensi penuh.</p>
        <div className={styles.priceGrid}>
          {EDISI.map((e) => (
            <div key={e.name} className={`${styles.priceCard} ${e.hot ? styles.hot : ""}`}>
              <div className={styles.priceIc}>{e.ic}</div>
              <div className={styles.priceName}>{e.name}</div>
              <div className={styles.priceTag}>{e.tag} <small>{e.tagSmall}</small></div>
              <ul className={styles.priceList}>{e.list.map((l) => <li key={l}>{l}</li>)}</ul>
              <a className={`${styles.priceCta} ${e.ghost ? styles.ghost : ""}`} href={e.href}>{e.cta}</a>
            </div>
          ))}
        </div>
        <p className={styles.priceNote}>💡 Semua harga termasuk pemasangan bantuan + garansi otak belajar aktif. Untuk penawaran resmi & kontrak, hubungi pemilik langsung.</p>
      </section>

      {/* ── CTA akhir ── */}
      <section className={styles.cta}>
        <h2>Mau lihat langsung dari tangan sendiri?</h2>
        <p>Buka app, buat satu cerita jadi lagu, hubungkan YouTube, dan lihat otaknya makin pintar tiap minggu.</p>
        <a className={styles.btnPrimary} href="/">🎬 Buka VERVE</a>
        <p className={styles.sell}>💎 Tertarik lisensi / white-label / demo khusus? Hubungi pemilik — harga menyesuaikan kebutuhan.</p>
      </section>

      <footer className={styles.footer}>VERVE Video Studio · Dibuat dengan ❤️ di Indonesia · v19.1</footer>
    </div>
  );
}
