"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * 👑 /bos — HALAMAN KHUSUS PEMILIK (L3.5).
 * Masuk lewat Google (atau link ajaib email) → server hanya membuka untuk email di BOS_EMAILS.
 * Isi: pantau pemakaian AI · tombol ON/OFF fitur · batas harian · pengumuman untuk semua pengunjung.
 */

const FITUR: { id: string; ikon: string; label: string }[] = [
  { id: "teks", ikon: "✍️", label: "Teks & naskah" },
  { id: "gambar", ikon: "🎨", label: "Gambar & adegan" },
  { id: "suara-tts", ikon: "🎙", label: "Suara TTS" },
  { id: "video", ikon: "🎬", label: "Video AI" },
  { id: "musik", ikon: "🎵", label: "Musik Suno" },
];

type Fase = "muat" | "masuk" | "ditolak" | "siap";

export default function HalamanBos() {
  // Klien Supabase dibuat MALAS — hanya saat ada interaksi/efek di browser.
  // (Kalau dibuat saat render, prerender build Vercel meledak karena env belum tentu ada.)
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const sb = () => { if (!sbRef.current) sbRef.current = createClient(); return sbRef.current; };
  const [fase, setFase] = useState<Fase>("muat");
  const [email, setEmail] = useState("");
  const [emailLogin, setEmailLogin] = useState("");
  const [pesanLogin, setPesanLogin] = useState("");
  const [sibukLogin, setSibukLogin] = useState(false);
  const [data, setData] = useState<any>(null);
  const [mati, setMati] = useState<string[]>([]);
  const [batas, setBatas] = useState<Record<string, string>>({});
  const [pengumuman, setPengumuman] = useState("");
  const [tost, setTost] = useState("");
  const [sibukSimpan, setSibukSimpan] = useState(false);

  const kabar = (t: string) => { setTost(t); window.setTimeout(() => setTost(""), 2600); };

  async function muatData() {
    try {
      const r = await fetch("/api/bos/ringkas?hari=14", { cache: "no-store" });
      if (r.status === 401) { setFase("masuk"); return; }
      if (r.status === 403) { setFase("ditolak"); return; }
      const j = await r.json();
      if (!r.ok) { setPesanLogin(j?.error || "Gagal memuat"); setFase("masuk"); return; }
      setData(j);
      setMati(Array.isArray(j?.setelan?.mati) ? j.setelan.mati : []);
      const b: Record<string, string> = {};
      for (const f of FITUR) b[f.id] = j?.setelan?.batas?.[f.id] ? String(j.setelan.batas[f.id]) : "";
      setBatas(b);
      setPengumuman(j?.setelan?.pengumuman || "");
      setEmail(j?.email || "");
      setFase("siap");
    } catch { setPesanLogin("Jaringan bermasalah, coba lagi"); setFase("masuk"); }
  }

  useEffect(() => {
    let hidup = true;
    (async () => {
      const { data: { session } } = await sb().auth.getSession();
      if (!hidup) return;
      if (!session) { setFase("masuk"); return; }
      setEmail(session.user?.email || "");
      await muatData();
    })();
    const { data: sub } = sb().auth.onAuthStateChange((_e, sesi) => {
      if (!sesi) setFase("masuk");
    });
    return () => { hidup = false; sub?.subscription?.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginGoogle() {
    setSibukLogin(true); setPesanLogin("");
    const { error } = await sb().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?lanjut=/bos`, queryParams: { prompt: "select_account" } },
    });
    if (error) { setPesanLogin(error.message); setSibukLogin(false); }
  }

  async function loginEmail() {
    const em = emailLogin.trim();
    if (!em || !em.includes("@")) { setPesanLogin("Isi email yang benar dulu ya"); return; }
    setSibukLogin(true); setPesanLogin("");
    const { error } = await sb().auth.signInWithOtp({
      email: em,
      options: { emailRedirectTo: `${location.origin}/auth/callback?lanjut=/bos` },
    });
    setSibukLogin(false);
    setPesanLogin(error ? error.message : `✉️ Link ajaib sudah dikirim ke ${em} — buka emailmu lalu ketuk linknya.`);
  }

  async function keluar() {
    await sb().auth.signOut();
    setData(null); setFase("masuk");
  }

  function togelFitur(id: string) {
    setMati((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  async function simpan() {
    setSibukSimpan(true);
    const batasNum: Record<string, number> = {};
    for (const f of FITUR) {
      const n = Math.floor(Number(batas[f.id]));
      if (isFinite(n) && n > 0) batasNum[f.id] = n;
    }
    try {
      const r = await fetch("/api/bos/setelan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mati, batas: batasNum, pengumuman }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { kabar("💥 Gagal simpan: " + (j?.error || r.status)); }
      else {
        if (j?.setelan) { setMati(j.setelan.mati); setPengumuman(j.setelan.pengumuman || ""); }
        kabar("✅ Tersimpan — berlaku ≤1 menit ke semua pengguna");
      }
    } catch { kabar("💥 Jaringan bermasalah"); }
    setSibukSimpan(false);
  }

  const hariUrut = useMemo(() => {
    const ph = data?.perHari || {};
    return Object.entries(ph).sort((a: any, b: any) => a[0].localeCompare(b[0])).slice(-14) as [string, { total: number; gagal: number }][];
  }, [data]);
  const maksHari = Math.max(1, ...hariUrut.map(([, v]) => v.total));

  return (
    <main className="bos-wrap">
      <header className="bos-kepala">
        <h1>👑 Panel Bos</h1>
        <p>Halaman khusus pemilik VERVE — lihat semua, atur semua.</p>
      </header>

      {fase === "muat" && <div className="bos-kartu bos-memuat">⏳ Memeriksa kunci kerajaan…</div>}

      {fase === "masuk" && (
        <div className="bos-kartu">
          <h2>🔐 Masuk dulu, Bos</h2>
          <p className="bos-sub">Hanya email pemilik yang dibukakan pintunya.</p>
          <button type="button" className="bos-btn bos-btn-utama" onClick={loginGoogle} disabled={sibukLogin}>
            {sibukLogin ? "⏳ Membuka Google…" : "🚀 Masuk dengan Google"}
          </button>
          <div className="bos-atau"><span>atau tanpa ribet —</span></div>
          <input className="bos-input" type="email" inputMode="email" placeholder="emailkamu@gmail.com"
            value={emailLogin} onChange={(e) => setEmailLogin(e.target.value)} />
          <button type="button" className="bos-btn" onClick={loginEmail} disabled={sibukLogin}>✉️ Kirim link ajaib ke email</button>
          {pesanLogin && <p className="bos-pesan">{pesanLogin}</p>}
        </div>
      )}

      {fase === "ditolak" && (
        <div className="bos-kartu">
          <h2>🚫 Khusus pemilik</h2>
          <p className="bos-sub">Kamu masuk sebagai <b>{email || "?"}</b> — email ini tidak terdaftar sebagai pemilik.</p>
          <button type="button" className="bos-btn" onClick={keluar}>Keluar & coba email lain</button>
        </div>
      )}

      {fase === "siap" && data && (
        <>
          <div className="bos-kartu bos-baris">
            <div className="bos-angka-besar">{data.totalSemua}</div>
            <div className="bos-sub2">panggilan AI · {data.hari} hari terakhir<br />
              <span className={data.gagalSemua ? "bos-merah" : "bos-hijau"}>{data.gagalSemua} gagal</span></div>
            <button type="button" className="bos-btn bos-btn-mini" onClick={muatData} title="Segarkan">↻</button>
          </div>

          <div className="bos-kartu">
            <h2>🎛 Kendali Fitur</h2>
            <p className="bos-sub">Matikan fitur boros kapan pun, atau batasi jatah hariannya. Kosongkan = tanpa batas.</p>
            {FITUR.map((f) => {
              const pakai = data?.perFitur?.[f.id];
              const dimatikan = mati.includes(f.id);
              return (
                <div key={f.id} className={`bos-fitur ${dimatikan ? "bos-fitur-mati" : ""}`}>
                  <button type="button" role="switch" aria-checked={!dimatikan}
                    className={`bos-saklar ${dimatikan ? "" : "bos-saklar-on"}`}
                    onClick={() => togelFitur(f.id)}
                    aria-label={`Saklar fitur ${f.label}`}><span /></button>
                  <div className="bos-fitur-info">
                    <b>{f.ikon} {f.label}</b>
                    <small>{pakai ? `${pakai.total} pakai · ${pakai.gagal} gagal (${data.hari} hari)` : "belum pernah dipakai"}</small>
                  </div>
                  <input className="bos-input bos-input-mini" type="number" min={0} inputMode="numeric"
                    placeholder="∞" value={batas[f.id] || ""}
                    onChange={(e) => setBatas((b) => ({ ...b, [f.id]: e.target.value }))}
                    aria-label={`Batas harian ${f.label}`} />
                </div>
              );
            })}
          </div>

          <div className="bos-kartu">
            <h2>📢 Pengumuman untuk semua pengunjung</h2>
            <textarea className="bos-input bos-area" rows={2} maxLength={300}
              placeholder="Contoh: Sabtu 21.00-22.00 maintenance, fitur musik istirahat dulu 🙏"
              value={pengumuman} onChange={(e) => setPengumuman(e.target.value)} />
            <small className="bos-sub">{pengumuman.length}/300 · kosongkan & simpan untuk menghapus banner</small>
          </div>

          <button type="button" className="bos-btn bos-btn-utama" onClick={simpan} disabled={sibukSimpan}>
            {sibukSimpan ? "⏳ Menyimpan…" : "💾 Simpan semua pengaturan"}
          </button>

          <div className="bos-kartu">
            <h2>📈 Panggilan 14 hari</h2>
            <div className="bos-grafik">
              {hariUrut.length === 0 && <p className="bos-sub">Belum ada panggilan tercatat.</p>}
              {hariUrut.map(([t, v]) => (
                <div key={t} className="bos-batang-wrap" title={`${t}: ${v.total} panggilan, ${v.gagal} gagal`}>
                  <div className="bos-batang" style={{ height: `${Math.max(4, Math.round((v.total / maksHari) * 100))}%` }}>
                    {v.gagal > 0 && <div className="bos-batang-gagal" style={{ height: `${Math.min(100, (v.gagal / v.total) * 100)}%` }} />}
                  </div>
                  <small>{t.slice(5)}</small>
                </div>
              ))}
            </div>
            <small className="bos-sub">label tanggal UTC · batang merah = porsi gagal</small>
          </div>

          <div className="bos-footer">
            <span>Masuk sebagai <b>{email}</b></span>
            <button type="button" className="bos-btn" onClick={keluar}>Keluar</button>
          </div>
        </>
      )}

      {tost && <div className="bos-tost" role="status">{tost}</div>}
    </main>
  );
}
