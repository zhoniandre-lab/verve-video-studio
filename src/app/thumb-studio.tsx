"use client";
import { useEffect, useRef, useState } from "react";
import { drawAutoThumb, pickPowerWords } from "@/lib/thumb";
import { VARIAN_THUMB, promptLatarThumb, badgeCtr, FONT_THUMB, bagiBarisTeks } from "@/lib/thumbstudio";

/**
 * 🖼 STUDIO THUMBNAIL (L5.2) — dasbor paket upload high-CTR.
 * AI melukis 3 KONSEP BEDA (wajah emosi 85mm · adegan sinematik 24mm · simbol still life).
 * Teks power-words digambar kanvas → owner kontrol penuh: manual/auto, 8 font tampilan,
 * posisi kiri/kanan, besar-kecil slider — semua INSTAN tanpa memanggil AI lagi.
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
  // 🎛 studio teks (instan, gratis)
  const [teksMode, setTeksMode] = useState<"auto" | "manual">("auto");
  const [teksManual, setTeksManual] = useState("");
  const [fontId, setFontId] = useState("anton");
  const [posisi, setPosisi] = useState<"kiri" | "kanan">("kiri");
  const [skala, setSkala] = useState(100);
  const [titles, setTitles] = useState<string[]>([]);
  const [deskripsi, setDeskripsi] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sibukTeks, setSibukTeks] = useState(false);
  const [tost, setTost] = useState("");
  const tik = useRef(0);
  const kabar = (t: string) => { setTost(t); window.setTimeout(() => setTost(""), 2400); };

  // pulihkan sesi terakhir
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || "null");
      if (j) {
        setJudul(j.judul || ""); setNiche(j.niche || ""); setKeyword(j.keyword || "");
        if (j.teksMode) setTeksMode(j.teksMode);
        if (typeof j.teksManual === "string") setTeksManual(j.teksManual);
        if (j.fontId) setFontId(j.fontId);
        if (j.posisi) setPosisi(j.posisi);
        if (typeof j.skala === "number") setSkala(j.skala);
      }
    } catch {}
  }, []);
  function simpan(over: any = {}) {
    try {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({
        judul, niche, keyword, teksMode, teksManual, fontId, posisi, skala, ...over,
      }));
    } catch {}
  }

  function ambilDariLahan() {
    try {
      const j = JSON.parse(localStorage.getItem(KUNCI_LAHAN) || "null");
      if (!j || (!j.topic && !j.selTitle)) { kabar("🌱 Lahan masih kosong — isi dulu di Lahan Awalan"); return; }
      const jd = j.selTitle || j.topic || "";
      setJudul(jd); setNiche(j.topic || ""); setKeyword(j.selKeyword || "");
      simpan({ judul: jd, niche: j.topic || "", keyword: j.selKeyword || "" });
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

  /** Tempel teks (auto power-words / manual) + badge CTR → PNG 1280×720. Instan, tanpa AI. */
  async function komposisi(dataUrl: string, vId: number, st?: { teksMode?: string; teksManual?: string; fontId?: string; posisi?: string; skala?: number }): Promise<string> {
    const im = await muatGambar(dataUrl);
    const cv = document.createElement("canvas");
    cv.width = 1280; cv.height = 720;
    const ctx = cv.getContext("2d")!;
    try { await (document as any).fonts?.ready; } catch {}
    const m = st?.teksMode || teksMode;
    const manual = m === "manual" ? bagiBarisTeks(st?.teksManual ?? teksManual) : null;
    const fam = FONT_THUMB.find((f) => f.id === (st?.fontId || fontId))?.fam;
    const side = (st?.posisi || posisi) === "kanan" ? "right" as const : "left" as const;
    const sk = ((st?.skala ?? skala) || 100) / 100;
    drawAutoThumb(ctx, 1280, 720, im, judul, niche, vId - 1, side, {
      teksKustom: manual && manual.length ? manual : undefined,
      fontFam: fam,
      skala: sk,
    });
    const badge = badgeCtr(niche);
    ctx.save();
    ctx.font = "800 26px Poppins, sans-serif";
    const w = ctx.measureText(badge).width + 36;
    const bx = side === "left" ? 24 : 1280 - 24 - w;
    ctx.fillStyle = "rgba(8,10,16,0.82)";
    (ctx as any).roundRect ? (ctx as any).roundRect(bx, 24, w, 48, 14) : ctx.rect(bx, 24, w, 48);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,0.9)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.fillText(badge, bx + 18, 57);
    ctx.restore();
    return cv.toDataURL("image/png");
  }

  async function buatVarian() {
    if (!judul.trim()) { kabar("✍️ Isi judul dulu ya"); return; }
    if (sibuk) return;
    setSibuk(true); simpan();
    setVarian([{ status: "muat" }, { status: "kosong" }, { status: "kosong" }]);
    for (let i = 0; i < 3; i++) {
      const v = VARIAN_THUMB[i];
      setProgres(`🎨 Melukis konsep ${i + 1}/3 — ${v.nama}…`);
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
    kabar("✅ Selesai — atur teks/font/posisi sesukamu di bawah, GRATIS");
  }

  // ♻️ RE-KOMPOSISI INSTAN: ganti teks/font/posisi/skala → gambar ulang dari latar yang sama (tanpa AI)
  useEffect(() => {
    const ada = varian.some((v) => v.status === "ok" && v.url);
    if (!ada) return;
    const tand = ++tik.current;
    const timer = window.setTimeout(async () => {
      for (let i = 0; i < 3; i++) {
        const v = varian[i];
        if (v.status === "ok" && v.url) {
          try {
            const final = await komposisi(v.url, i + 1);
            if (tik.current === tand) setVarian((s) => s.map((x, xi) => (xi === i ? { ...x, final } : x)));
          } catch {}
        }
      }
    }, 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teksMode, teksManual, fontId, posisi, skala, judul]);

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

  const saranTeks = () => pickPowerWords(judul, 0).filter((w) => !w.includes("😭")).join("\n");

  return (
    <div className="tub-wrap">
      <header className="tub-kepala">
        <button type="button" className="tub-balik" onClick={onExit} aria-label="Kembali">‹</button>
        <div>
          <h1>🖼 Studio Thumbnail</h1>
          <p>Paket upload high-CTR: 3 konsep AI + teks/font/posisi kendali penuh.</p>
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
          <input className="tub-input" value={niche} placeholder="Niche (mis: ibu, horor, uang)…"
            onChange={(e) => setNiche(e.target.value)} />
          <input className="tub-input" value={keyword} placeholder="Kata kunci (opsional)…"
            onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </div>

      <div className="tub-kartu">
        <div className="tub-baris-atas">
          <h2>2 · Thumbnail AI ×3 konsep</h2>
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
      </div>

      <div className="tub-kartu">
        <h2>3 · Teks & gayamu <small className="tub-label-mini">— instan, tanpa AI, Geser langsung berubah</small></h2>

        <div className="tub-seg">
          {([["auto", "🤖 Otomatis"], ["manual", "✍️ Tulis sendiri"]] as const).map(([id, lb]) => (
            <button key={id} type="button" className={`tub-seg-item ${teksMode === id ? "tub-seg-on" : ""}`}
              onClick={() => { setTeksMode(id); simpan({ teksMode: id }); }}>{lb}</button>
          ))}
        </div>
        {teksMode === "manual" && (
          <>
            <textarea className="tub-area" rows={3} maxLength={90}
              placeholder={"Satu baris = satu baris teks besar (maks 3)\nContoh:\nIBU\nAKU RINDU"}
              value={teksManual} onChange={(e) => { setTeksManual(e.target.value); simpan({ teksManual: e.target.value }); }} />
            <button type="button" className="tub-btn-mini" onClick={() => { const s = saranTeks(); setTeksManual(s); simpan({ teksManual: s }); }}>
              ✨ Isi saran dari judul
            </button>
          </>
        )}

        <small className="tub-label">FONT</small>
        <div className="tub-fonts">
          {FONT_THUMB.map((f) => (
            <button key={f.id} type="button"
              className={`tub-font ${fontId === f.id ? "tub-font-on" : ""}`}
              style={{ fontFamily: f.fam }}
              onClick={() => { setFontId(f.id); simpan({ fontId: f.id }); }}>Ag</button>
          ))}
        </div>

        <div className="tub-duo-kontrol">
          <div>
            <small className="tub-label">POSISI TEKS</small>
            <div className="tub-seg">
              {([["kiri", "◀ Kiri"], ["kanan", "Kanan ▶"]] as const).map(([id, lb]) => (
                <button key={id} type="button" className={`tub-seg-item ${posisi === id ? "tub-seg-on" : ""}`}
                  onClick={() => { setPosisi(id); simpan({ posisi: id }); }}>{lb}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <small className="tub-label">BESAR TEKS: {skala}%</small>
            <input className="tub-slider" type="range" min={70} max={140} step={5} value={skala}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setSkala(v); simpan({ skala: v }); }} />
          </div>
        </div>
      </div>

      <div className="tub-kartu">
        <div className="tub-baris-atas">
          <h2>4 · Paket teks upload</h2>
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
