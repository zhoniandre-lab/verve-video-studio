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
