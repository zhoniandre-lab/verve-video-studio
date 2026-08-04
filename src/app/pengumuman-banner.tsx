"use client";
import { useEffect, useState } from "react";

/** 📢 Banner pengumuman dari Panel Bos — tampil di semua halaman, bisa ditutup (ditutup per-versi teks). */
export default function PengumumanBanner() {
  const [teks, setTeks] = useState("");
  const [tutup, setTutup] = useState(false);
  const kunci = "verve_pengumuman_" + teks.length + "_" + teks.slice(0, 24);

  useEffect(() => {
    let hidup = true;
    const baca = () =>
      fetch("/api/pengumuman", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (hidup && j?.teks) setTeks(String(j.teks).slice(0, 300)); })
        .catch(() => {});
    baca();
    const iv = setInterval(baca, 120_000); // segar tiap 2 menit
    return () => { hidup = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    try { if (teks && sessionStorage.getItem(kunci) === "1") setTutup(true); else setTutup(false); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teks]);

  if (!teks || tutup) return null;
  return (
    <div className="bos-pengumuman" role="status">
      <span className="bos-pengumuman-teks">📢 {teks}</span>
      <button
        type="button"
        className="bos-pengumuman-x"
        aria-label="Tutup pengumuman"
        onClick={() => { setTutup(true); try { sessionStorage.setItem(kunci, "1"); } catch {} }}
      >✕</button>
    </div>
  );
}
