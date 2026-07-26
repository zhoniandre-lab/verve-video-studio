"use client";
// 🚪 v14.4 PAMIT — tombol blokir-diri yang dia minta ("buat sekarang").
// Sekali tekan: cookie VERVE_PAMIT=1 (10 tahun) → middleware langsung menutup semua halaman untuk perangkat ini.
export default function PamitPage() {
  const blokirSaya = () => {
    document.cookie = "VERVE_PAMIT=1; max-age=315360000; path=/; SameSite=Lax";
    try { localStorage.setItem("verve_pamit", "1"); } catch { /* abaikan */ }
    window.location.href = "/";
  };
  return (
    <main style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0e13", color: "#e8edf5", fontFamily: "system-ui,-apple-system,sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 44 }}>🚫</div>
        <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>Blokir VERVE dari HP ini?</h1>
        <p style={{ color: "#8b93a3", fontSize: 13.5, lineHeight: 1.6 }}>
          Sekali tekan, perangkat ini <b>tidak bisa membuka VERVE lagi</b>. Tidak ada pemberitahuan, tidak ada tarik-tarik balik.
          Karyamu <b>tidak dihapus</b> satu pun. Kalau suatu hari benar-benar rindu: bersihkan data situs ini di pengaturan browser = blokir terbuka lagi.
        </p>
        <button onClick={blokirSaya}
          style={{ width: "100%", marginTop: 16, padding: "14px 16px", borderRadius: 12, border: "1px solid #7f1d1d", background: "linear-gradient(135deg,#991b1b,#dc2626)", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>
          🚫 BLOKIR SAYA SEKARANG
        </button>
        <button onClick={() => history.back()}
          style={{ width: "100%", marginTop: 10, padding: "12px 16px", borderRadius: 12, border: "1px solid #ffffff22", background: "none", color: "#cbd5e1", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Batal — kembali
        </button>
      </div>
    </main>
  );
}
