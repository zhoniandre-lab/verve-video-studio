"use client";
import { useEffect, useRef, useState } from "react";
import { drawAutoThumb } from "@/lib/thumb";
import { VARIAN_THUMB, promptLatarThumb, badgeCtr } from "@/lib/thumbstudio";

/**
 * 🖼 STUDIO THUMBNAIL (L5) — dasbor khusus paket upload high-CTR.
 * Sumber: AI melukis 3 varian latar dari judul+niche (teks power-words digambar kanvas oleh lib/thumb).
 * Paket lengkap: thumbnail 1280×720 + 5 opsi judul + deskripsi + tag — siap tempel ke YouTube.
 * Jembatan: tombol "Ambil dari Lahan" menarik topik/judul/keyword hasil Lahan Awalan.
 */

type VarState = { status: "kosong" | "muat" | "ok" | "gagal"; url?: string; final?: string; pesan?: string };
const KUNCI_SIMPAN = "verve_thumb_paket_v1";
const KUNCI_LAHAN = "verve_brain_v1";

export default function ThumbStudio({ onExit }: { onExit: () => void }) {
  const [judul, setJudul] = useState("");
  const [niche, setNiche] = useState("");
  const [keyword, setKeyword] = useState("");
  const [varian, setVarian] = useState<VarState[]>([{ status: "kosong" }, { status: "kosong" }, { status: "kosong" }]);
  const [sibuk, setSibuk] = useState(false);
  const [progres, setProgres] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [deskripsi, setDeskripsi] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sibukTeks, setSibukTeks] = useState(false);
  const [tost, setTost] = useState("");
  const kabar = (t: string) => { setTost(t); window.setTimeout(() => setTost(""), 2400); };

  // pulihkan sesi terakhir
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || "null");
      if (j) { setJudul(j.judul || ""); setNiche(j.niche || ""); setKeyword(j.keyword || ""); }
    } catch {}
  }, []);
  function simpan(j: string, n: string, k: string) {
    try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ judul: j, niche: n, keyword: k })); } catch {}
  }

  function ambilDariLahan() {
    try {
      const j = JSON.parse(localStorage.getItem(KUNCI_LAHAN) || "null");
      if (!j || (!j.topic && !j.selTitle)) { kabar("🌱 Lahan masih kosong — isi dulu di Lahan Awalan"); return; }
      const jd = j.selTitle || j.topic || "";
      setJudul(jd); setNiche(j.topic || ""); setKeyword(j.selKeyword || "");
      simpan(jd, j.topic || "", j.selKeyword || "");
      kabar("🌱 Ditarik dari Lahan: " + (jd ? jd.slice(0, 32) + "…" : "topik"));
    } catch { kabar("🌱 Gagal membaca Lahan"); }
  }

  function muatGambar(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("gambar gagal dimuat"));
      im.src = src;
    });
  }

  /** Tempel power-words + badge CTR di atas latar AI → PNG 1280×720. */
  async function komposisi(dataUrl: string, vId: number): Promise<string> {
    const im = await muatGambar(dataUrl);
    const cv = document.createElement("canvas");
    cv.width = 1280; cv.height = 720;
    const ctx = cv.getContext("2d")!;
    try { await (document as any).fonts?.ready; } catch {} // font Anton/Poppins siap sebelum diukur-digambar
    drawAutoThumb(ctx, 1280, 720, im, judul, niche, vId - 1, "left"); // prompt MENJANJIKAN kiri kosong → teks wajib kiri
    // badge CTR kecil pojok kiri atas
    const badge = badgeCtr(niche);
    ctx.save();
    ctx.font = "800 26px Poppins, sans-serif";
    const w = ctx.measureText(badge).width + 36;
    ctx.fillStyle = "rgba(8,10,16,0.82)";
    (ctx as any).roundRect ? (ctx as any).roundRect(24, 24, w, 48, 14) : ctx.rect(24, 24, w, 48);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,0.9)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.fillText(badge, 42, 57);
    ctx.restore();
    return cv.toDataURL("image/png");
  }

  async function buatVarian() {
    if (!judul.trim()) { kabar("✍️ Isi judul dulu ya"); return; }
    if (sibuk) return;
    setSibuk(true);
    simpan(judul, niche, keyword);
    const nv: VarState[] = [{ status: "muat" }, { status: "kosong" }, { status: "kosong" }];
    setVarian(nv);
    for (let i = 0; i < 3; i++) {
      const v = VARIAN_THUMB[i];
      setProgres(`🎨 Melukis varian ${i + 1}/3 — ${v.nama}…`);
      setVarian((s) => s.map((x, xi) => (xi === i ? { status: "muat" } : x)));
      try {
        const r = await fetch("/api/hcnsec/image", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: judul, keyword, niche, _rawPrompt: true, prompt: promptLatarThumb(judul, niche, v.id) }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const final = await komposisi(j.url, v.id);
        setVarian((s) => s.map((x, xi) => (xi === i ? { status: "ok", url: j.url, final } : x)));
      } catch (e: any) {
        setVarian((s) => s.map((x, xi) => (xi === i ? { status: "gagal", pesan: String(e?.message || e).slice(0, 80) } : x)));
      }
    }
    setProgres(""); setSibuk(false);
    kabar("✅ Selesai — unduh yang paling nendang");
  }

  async function buatPaketTeks() {
    if (!judul.trim()) { kabar("✍️ Isi judul dulu ya"); return; }
    if (sibukTeks) return;
    setSibukTeks(true);
    try {
      const kw = keyword.trim() || niche.trim() || judul.slice(0, 40);
      const [r1, r2] = await Promise.all([
        fetch("/api/hcnsec/titles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: kw, niche, n: 5 }) }),
        fetch("/api/hcnsec/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: judul, keyword: kw, niche }) }),
      ]);
      const j1 = await r1.json().catch(() => ({}));
      const j2 = await r2.json().catch(() => ({}));
      if (r1.ok && Array.isArray(j1?.titles)) setTitles(j1.titles.filter(Boolean));
      if (r2.ok) {
        setDeskripsi(String(j2?.description || j2?.deskripsi || j2?.desc || ""));
        setTags(Array.isArray(j2?.tags) ? j2.tags.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean) : []);
      }
      if (!r1.ok && !r2.ok) kabar("💥 Paket teks gagal: " + (j1?.error || j2?.error || "coba lagi"));
      else kabar("✅ Paket upload siap ditempel");
    } catch (e: any) { kabar("💥 " + String(e?.message || e).slice(0, 60)); }
    setSibukTeks(false);
  }

  async function salin(teks: string, apa: string) {
    try { await navigator.clipboard.writeText(teks); kabar(`📋 ${apa} tersalin`); }
    catch { kabar("💥 Gagal menyalin — tahan lama lalu salin manual"); }
  }

  function unduh(dataUrl: string, nama: string) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = nama;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="tub-wrap">
      <header className="tub-kepala">
        <button type="button" className="tub-balik" onClick={onExit} aria-label="Kembali">‹</button>
        <div>
          <h1>🖼 Studio Thumbnail</h1>
          <p>Paket upload high-CTR: thumbnail + judul + deskripsi + tag, sesuai niche-mu.</p>
        </div>
      </header>

      <div className="tub-kartu">
        <div className="tub-baris-atas">
          <h2>1 · Amunisi</h2>
          <button type="button" className="tub-btn-mini" onClick={ambilDariLahan}>🌱 Ambil dari Lahan</button>
        </div>
        <input className="tub-input" value={judul} placeholder="Judul video (wajib)…"
          onChange={(e) => setJudul(e.target.value)} />
        <div className="tub-duo">
          <input className="tub-input" value={niche} placeholder="Niche (mis: horor, uang, dapur)…"
            onChange={(e) => setNiche(e.target.value)} />
          <input className="tub-input" value={keyword} placeholder="Kata kunci (opsional)…"
            onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </div>

      <div className="tub-kartu">
        <div className="tub-baris-atas">
          <h2>2 · Thumbnail AI ×3</h2>
          <button type="button" className="tub-btn tub-btn-utama" onClick={buatVarian} disabled={sibuk}>
            {sibuk ? "⏳ Melukis…" : "🎨 Buat 3 varian"}
          </button>
        </div>
        {progres && <p className="tub-progres">{progres}</p>}
        <div className="tub-grid">
          {varian.map((v, i) => (
            <div key={i} className="tub-slot">
              {v.status === "ok" && v.final ? (
                <>
                  <img src={v.final} alt={`Thumbnail varian ${i + 1}`} />
                  <div className="tub-slot-aksi">
                    <small>{VARIAN_THUMB[i].nama}</small>
                    <button type="button" className="tub-btn-mini" onClick={() => unduh(v.final!, `thumbnail-verve-v${i + 1}.png`)}>⬇ PNG 1280×720</button>
                  </div>
                </>
              ) : v.status === "muat" ? (
                <div className="tub-slot-kosong"><span className="tub-blink">🎨</span><small>{VARIAN_THUMB[i].nama}…</small></div>
              ) : v.status === "gagal" ? (
                <div className="tub-slot-kosong">💥<small>{v.pesan || "gagal"}</small></div>
              ) : (
                <div className="tub-slot-kosong">🖼<small>{VARIAN_THUMB[i].nama}</small></div>
              )}
            </div>
          ))}
        </div>
        <small className="tub-catatan">Teks power-words & badge CTR digambar otomatis — AI dilarang menaruh tulisan sendiri biar bersih.</small>
      </div>

      <div className="tub-kartu">
        <div className="tub-baris-atas">
          <h2>3 · Paket teks upload</h2>
          <button type="button" className="tub-btn" onClick={buatPaketTeks} disabled={sibukTeks}>
            {sibukTeks ? "⏳ Menulis…" : "📝 Judul + deskripsi + tag"}
          </button>
        </div>
        {titles.length > 0 && (
          <div className="tub-blok">
            <small className="tub-label">OPSIL JUDUL (ketuk untuk pakai)</small>
            {titles.map((t, i) => (
              <button key={i} type="button" className="tub-judul" onClick={() => { setJudul(t); kabar("✍️ Judul diganti"); }}>{t}</button>
            ))}
          </div>
        )}
        {deskripsi && (
          <div className="tub-blok">
            <div className="tub-baris-atas">
              <small className="tub-label">DESKRIPSI</small>
              <button type="button" className="tub-btn-mini" onClick={() => salin(deskripsi, "Deskripsi")}>📋 Salin</button>
            </div>
            <textarea className="tub-area" rows={5} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
          </div>
        )}
        {tags.length > 0 && (
          <div className="tub-blok">
            <div className="tub-baris-atas">
              <small className="tub-label">{tags.length} TAG</small>
              <button type="button" className="tub-btn-mini" onClick={() => salin(tags.join(", "), "Semua tag")}>📋 Salin semua</button>
            </div>
            <div className="tub-tags">
              {tags.map((t, i) => <span key={i} className="tub-tag">{t}</span>)}
            </div>
          </div>
        )}
      </div>

      {tost && <div className="tub-tost" role="status">{tost}</div>}
    </div>
  );
}
