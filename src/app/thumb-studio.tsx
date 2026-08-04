"use client";
import { useEffect, useRef, useState } from "react";
import { drawAutoThumb, pickPowerWords } from "@/lib/thumb";
import { VARIAN_THUMB, promptLatarThumb, badgeCtr, FONT_THUMB, bagiBarisTeks, bangunPromptDariLahan } from "@/lib/thumbstudio";

/**
 * 🖼 STUDIO THUMBNAIL (L5.3) — dasbor paket upload high-CTR.
 * Teks bisa DIGESER PAKAI JARI ke mana saja di atas thumbnail (anchor bebas di kanvas).
 * Tombol "Susun dari Lahan" merangkai prompt thumbnail dari judul+gaya visual+kunci karakter Lahan.
 * Semua kontrol teks instan tanpa memanggil AI lagi; generate punya coba-ulang otomatis.
 */

type VarState = { status: "kosong" | "muat" | "ok" | "gagal"; url?: string; final?: string; pesan?: string };
type Pos = { x: number; y: number };
const KUNCI_SIMPAN = "verve_thumb_paket_v1";
const KUNCI_LAHAN = "verve_brain_v1";
const PRESET: Record<string, Pos> = { kiri: { x: 0.27, y: 0.82 }, kanan: { x: 0.73, y: 0.82 } };

export default function ThumbStudio({ onExit }: { onExit: () => void }) {
  const [judul, setJudul] = useState("");
  const [niche, setNiche] = useState("");
  const [keyword, setKeyword] = useState("");
  const [varian, setVarian] = useState<VarState[]>([{ status: "kosong" }, { status: "kosong" }, { status: "kosong" }]);
  const [sibuk, setSibuk] = useState(false);
  const [progres, setProgres] = useState("");
  const [teksMode, setTeksMode] = useState<"auto" | "manual">("auto");
  const [teksManual, setTeksManual] = useState("");
  const [fontId, setFontId] = useState("anton");
  const [pos, setPos] = useState<Pos>(PRESET.kiri);
  const [skala, setSkala] = useState(100);
  const [promptTxt, setPromptTxt] = useState("");
  const [pakaiPrompt, setPakaiPrompt] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const [deskripsi, setDeskripsi] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sibukTeks, setSibukTeks] = useState(false);
  const [tost, setTost] = useState("");
  const tik = useRef(0);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const geser = useRef(false);
  const [aktifIdx, setAktifIdx] = useState(0); // 🎭 konsep yang tampil di panggung besar
  const sentuh = useRef(false); // strip pernah disentuh manual → jangan auto-pindah panggung
  const kabar = (t: string) => { setTost(t); window.setTimeout(() => setTost(""), 2400); };

  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || "null");
      if (j) {
        setJudul(j.judul || ""); setNiche(j.niche || ""); setKeyword(j.keyword || "");
        if (j.teksMode) setTeksMode(j.teksMode);
        if (typeof j.teksManual === "string") setTeksManual(j.teksManual);
        if (j.fontId) setFontId(j.fontId);
        if (j.pos && typeof j.pos.x === "number") setPos(j.pos);
        if (typeof j.skala === "number") setSkala(j.skala);
        if (typeof j.promptTxt === "string") setPromptTxt(j.promptTxt);
        if (typeof j.pakaiPrompt === "boolean") setPakaiPrompt(j.pakaiPrompt);
      }
    } catch {}
  }, []);
  function simpan(over: any = {}) {
    try {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({
        judul, niche, keyword, teksMode, teksManual, fontId, pos, skala, promptTxt, pakaiPrompt, ...over,
      }));
    } catch {}
  }

  function bacaLahan(): any | null {
    try { return JSON.parse(localStorage.getItem(KUNCI_LAHAN) || "null"); } catch { return null; }
  }

  function ambilDariLahan() {
    const j = bacaLahan();
    if (!j || (!j.topic && !j.selTitle)) { kabar("🌱 Lahan masih kosong — isi dulu di Lahan Awalan"); return; }
    const jd = j.selTitle || j.topic || "";
    setJudul(jd); setNiche(j.topic || ""); setKeyword(j.selKeyword || "");
    simpan({ judul: jd, niche: j.topic || "", keyword: j.selKeyword || "" });
    kabar("🌱 Ditarik dari Lahan: " + (jd ? jd.slice(0, 32) + "…" : "topik"));
  }

  function susunPromptLahan() {
    const j = bacaLahan();
    if (!j) { kabar("🌱 Lahan masih kosong"); return; }
    const p = bangunPromptDariLahan(j);
    if (!p) { kabar("🌱 Belum ada judul/topik di Lahan"); return; }
    setPromptTxt(p); setPakaiPrompt(true);
    simpan({ promptTxt: p, pakaiPrompt: true });
    kabar("🪄 Prompt tersusun dari Lahan — tinggal Buat 3 varian");
  }

  function muatGambar(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("gambar gagal dimuat"));
      im.src = src;
    });
  }

  /** Tempel teks + badge CTR → PNG 1280×720. Instan, tanpa AI. */
  async function komposisi(dataUrl: string, vId: number, st?: Partial<{ teksMode: string; teksManual: string; fontId: string; pos: Pos; skala: number }>): Promise<string> {
    const im = await muatGambar(dataUrl);
    const cv = document.createElement("canvas");
    cv.width = 1280; cv.height = 720;
    const ctx = cv.getContext("2d")!;
    try {
      await (document as any).fonts?.load?.("800 26px Poppins");
      await (document as any).fonts?.ready;
    } catch {}
    const m = st?.teksMode || teksMode;
    const manual = m === "manual" ? bagiBarisTeks(st?.teksManual ?? teksManual) : null;
    const fam = FONT_THUMB.find((f) => f.id === (st?.fontId || fontId))?.fam;
    const p = st?.pos || pos;
    const sk = ((st?.skala ?? skala) || 100) / 100;
    drawAutoThumb(ctx, 1280, 720, im, judul, niche, vId - 1, p.x < 0.5 ? "left" : "right", {
      teksKustom: manual && manual.length ? manual : undefined,
      fontFam: fam,
      skala: sk,
      anchorX: p.x, anchorY: p.y,
    });
    const badge = badgeCtr(niche);
    ctx.font = "800 26px Poppins, sans-serif";
    const w = Math.min(ctx.measureText(badge).width + 36, 380);
    const bx = p.x < 0.5 ? 24 : 1280 - 24 - w;
    ctx.fillStyle = "rgba(8,10,16,0.82)";
    (ctx as any).roundRect ? (ctx as any).roundRect(bx, 24, w, 48, 14) : ctx.rect(bx, 24, w, 48);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,0.9)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.fillText(badge, bx + 18, 57);
    return cv.toDataURL("image/png");
  }

  function temaGenerate(): string {
    const t = promptTxt.trim();
    return pakaiPrompt && t ? t : judul;
  }

  async function buatVarian() {
    if (!judul.trim() && !(pakaiPrompt && promptTxt.trim())) { kabar("✍️ Isi judul (atau susun prompt Lahan) dulu ya"); return; }
    if (sibuk) return;
    setSibuk(true); simpan(); sentuh.current = false; setAktifIdx(0);
    const tema = temaGenerate() || judul;
    setVarian([{ status: "muat" }, { status: "kosong" }, { status: "kosong" }]);
    for (let i = 0; i < 3; i++) {
      const v = VARIAN_THUMB[i];
      setProgres(`🎨 Melukis konsep ${i + 1}/3 — ${v.nama}…`);
      if (!sentuh.current) setAktifIdx(i);
      setVarian((s) => s.map((x, xi) => (xi === i ? { status: "muat" } : x)));
      let berhasil = false, errTerakhir = "";
      for (let coba = 1; coba <= 2 && !berhasil; coba++) {
        try {
          if (coba === 2) {
            setVarian((s) => s.map((x, xi) => (xi === i ? { status: "muat", pesan: "mencoba ulang…" } : x)));
            await new Promise((r) => setTimeout(r, 2200));
          }
          const r = await fetch("/api/hcnsec/image", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: judul || "thumbnail", keyword, niche, _rawPrompt: true, prompt: promptLatarThumb(tema, niche, v.id) }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
          const final = await komposisi(j.url, v.id);
          setVarian((s) => s.map((x, xi) => (xi === i ? { status: "ok", url: j.url, final } : x)));
          berhasil = true;
        } catch (e: any) { errTerakhir = String(e?.message || e).slice(0, 80); }
      }
      if (!berhasil) setVarian((s) => s.map((x, xi) => (xi === i ? { status: "gagal", pesan: errTerakhir } : x)));
    }
    setProgres(""); setSibuk(false);
    kabar("✅ Selesai — geser teksnya pakai jari sesukamu, GRATIS");
  }

  // ♻️ RE-KOMPOSISI INSTAN saat kontrol berubah (termasuk posisi hasil geser)
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
    }, 140);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teksMode, teksManual, fontId, pos.x, pos.y, skala, judul]);

  // ✋ GESER TEKS PAKAI JARI — tekan & seret di atas thumbnail mana pun
  function arahkan(i: number, ev: any) {
    const el = slotRefs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (ev.clientX ?? ev.touches?.[0]?.clientX) as number;
    const cy = (ev.clientY ?? ev.touches?.[0]?.clientY) as number;
    if (typeof cx !== "number" || typeof cy !== "number") return;
    const p = {
      x: Math.min(0.9, Math.max(0.1, (cx - r.left) / r.width)),
      y: Math.min(0.92, Math.max(0.14, (cy - r.top) / r.height)),
    };
    setPos(p); simpan({ pos: p });
  }
  function dragMulai(i: number, ev: any) {
    if (varian[i]?.status !== "ok") return;
    geser.current = true;
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch {}
    arahkan(i, ev);
  }
  function dragGerak(i: number, ev: any) { if (geser.current) arahkan(i, ev); }
  function dragSelesai() { geser.current = false; }

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

  const aktif: VarState = varian[aktifIdx] || { status: "kosong" };
  const adaHasil = varian.some((v) => v.status === "ok" && !!v.final);

  return (
    <div className="tub-wrap">
      <header className="tub-kepala">
        <button type="button" className="tub-balik" onClick={onExit} aria-label="Kembali">‹</button>
        <div className="tub-kepala-teks">
          <h1>Studio Thumbnail</h1>
          <p>Bikin orang berhenti scroll, lalu klik videomu.</p>
        </div>
        <span className="tub-lencana">HI-CTR</span>
      </header>

      {/* 1 · AMUNISI */}
      <section className="tub-kartu tub-muncul">
        <div className="tub-sek">
          <span className="tub-nomor">1</span>
          <h2>Amunisi video</h2>
          <button type="button" className="tub-pil" onClick={ambilDariLahan}>🌱 Tarik dari Lahan</button>
        </div>
        <input className="tub-input" value={judul} placeholder="Judul video kamu…"
          onChange={(e) => setJudul(e.target.value)} />
        <div className="tub-duo">
          <input className="tub-input" value={niche} placeholder="Niche (mis: ibu, horor)"
            onChange={(e) => setNiche(e.target.value)} />
          <input className="tub-input" value={keyword} placeholder="Kata kunci (opsional)"
            onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </section>

      {/* 2 · PANGGUNG KONSEP */}
      <section className="tub-kartu tub-muncul" style={{ animationDelay: "70ms" }}>
        <div className="tub-sek">
          <span className="tub-nomor">2</span>
          <h2>Panggung konsep</h2>
          <span className="tub-pil-info">✥ tahan &amp; geser teks</span>
        </div>

        <div className="tub-panggung-bingkai">
          <div ref={(el) => { slotRefs.current[aktifIdx] = el; }}
            className={`tub-panggung ${aktif.status === "ok" ? "tub-slot-geser" : ""}`}
            onPointerDown={(e) => dragMulai(aktifIdx, e)}
            onPointerMove={(e) => dragGerak(aktifIdx, e)}
            onPointerUp={dragSelesai}
            onPointerCancel={dragSelesai}>
            {aktif.status === "ok" && aktif.final ? (
              <>
                <img src={aktif.final} alt={`Thumbnail ${VARIAN_THUMB[aktifIdx].nama}`} draggable={false} />
                <span className="tub-panggung-nama">{VARIAN_THUMB[aktifIdx].nama} · ✥ geser</span>
                <button type="button" className="tub-bulat" aria-label="Unduh PNG"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => unduh(aktif.final!, `thumbnail-verve-v${aktifIdx + 1}.png`)}>⬇</button>
              </>
            ) : aktif.status === "muat" ? (
              <div className="tub-menunggu"><span className="tub-blink">🎨</span><small>{aktif.pesan || "Melukis " + VARIAN_THUMB[aktifIdx].nama + "…"}</small></div>
            ) : aktif.status === "gagal" ? (
              <div className="tub-menunggu">💥<small>{aktif.pesan || "konsep ini gagal — coba lukis ulang"}</small></div>
            ) : (
              <div className="tub-menunggu">🖼<small>{VARIAN_THUMB[aktifIdx].nama}<br />menunggu dilukis</small></div>
            )}
          </div>
        </div>

        <div className="tub-strip">
          {varian.map((v, i) => (
            <button key={i} type="button"
              className={`tub-strip-item ${aktifIdx === i ? "tub-strip-on" : ""}`}
              onClick={() => { sentuh.current = true; setAktifIdx(i); }}>
              <span className="tub-strip-kotak">
                {v.status === "ok" && v.final ? <img src={v.final} alt="" draggable={false} />
                  : v.status === "muat" ? <span className="tub-blink">🎨</span>
                  : v.status === "gagal" ? <span>💥</span>
                  : <span>{i + 1}</span>}
              </span>
              <span className="tub-strip-lbl">{VARIAN_THUMB[i].nama}</span>
            </button>
          ))}
        </div>

        <button type="button" className="tub-hero" onClick={buatVarian} disabled={sibuk}>
          {sibuk ? "⏳ Sedang melukis 3 konsep — tunggu ya…" : "🎨 Lukis 3 Konsep Sekaligus"}
        </button>
        {progres && <p className="tub-progres">{progres}</p>}

        <div className="tub-prompt-lahan">
          <div className="tub-sek-dalam">
            <small className="tub-label">PROMPT KHUSUS THUMBNAIL · OPSIONAL</small>
            <button type="button" className="tub-pil tub-pil-sihir" onClick={susunPromptLahan}>🪄 Susun dari Lahan</button>
          </div>
          {promptTxt ? (
            <>
              <textarea className="tub-area" rows={3} value={promptTxt}
                onChange={(e) => { setPromptTxt(e.target.value); simpan({ promptTxt: e.target.value }); }} />
              <label className="tub-cek">
                <input type="checkbox" checked={pakaiPrompt}
                  onChange={(e) => { setPakaiPrompt(e.target.checked); simpan({ pakaiPrompt: e.target.checked }); }} />
                Pakai prompt ini untuk 3 varian (judul tetap dipakai untuk teks)
              </label>
            </>
          ) : (
            <small className="tub-catatan">Ketuk 🪄 — prompt disusun dari judul + gaya visual + kunci karakter hasil Lahan, masih bisa kamu edit dulu.</small>
          )}
        </div>
      </section>

      {/* 3 · TEKS & GAYA */}
      <section className="tub-kartu tub-muncul" style={{ animationDelay: "140ms" }}>
        <div className="tub-sek">
          <span className="tub-nomor">3</span>
          <h2>Teks &amp; gayamu</h2>
          <span className="tub-pil-info">gratis · instan tanpa AI</span>
        </div>

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
            <button type="button" className="tub-pil" style={{ marginTop: 8 }} onClick={() => { const s = saranTeks(); setTeksManual(s); simpan({ teksManual: s }); }}>
              ✨ Isi saran dari judul
            </button>
          </>
        )}

        <small className="tub-label">FONT — GESER SAMPING</small>
        <div className="tub-fonts">
          {FONT_THUMB.map((f) => (
            <button key={f.id} type="button"
              className={`tub-font ${fontId === f.id ? "tub-font-on" : ""}`}
              onClick={() => { setFontId(f.id); simpan({ fontId: f.id }); }}>
              <span className="tub-font-ag" style={{ fontFamily: f.fam }}>Ag</span>
              <span className="tub-font-nama">{f.id}</span>
            </button>
          ))}
        </div>

        <div className="tub-duo-kontrol">
          <div>
            <small className="tub-label">POSISI CEPAT</small>
            <div className="tub-seg">
              {([["kiri", "◀ Kiri"], ["kanan", "Kanan ▶"]] as const).map(([id, lb]) => (
                <button key={id} type="button" className={`tub-seg-item ${pos.x < 0.5 === (id === "kiri") ? "tub-seg-on" : ""}`}
                  onClick={() => { const p = PRESET[id]; setPos(p); simpan({ pos: p }); }}>{lb}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <small className="tub-label">BESAR TEKS · {skala}%</small>
            <input className="tub-slider" type="range" min={70} max={140} step={5} value={skala}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setSkala(v); simpan({ skala: v }); }} />
          </div>
        </div>
        <small className="tub-catatan">✥ Cara paling bebas: tahan jari tepat DI ATAS teks di panggung, lalu seret ke mana pun.</small>
      </section>

      {/* 4 · PAKET UPLOAD */}
      <section className="tub-kartu tub-muncul" style={{ animationDelay: "210ms" }}>
        <div className="tub-sek">
          <span className="tub-nomor">4</span>
          <h2>Paket upload</h2>
          <button type="button" className="tub-pil" onClick={buatPaketTeks} disabled={sibukTeks}>
            {sibukTeks ? "⏳ Menulis…" : "📝 Judul · deskripsi · tag"}
          </button>
        </div>
        {titles.length > 0 && (
          <div className="tub-blok">
            <small className="tub-label">OPSI JUDUL — KETUK UNTUK PAKAI</small>
            {titles.map((t, i) => (
              <button key={i} type="button" className="tub-judul" onClick={() => { setJudul(t); kabar("✍️ Judul diganti"); }}>{t}</button>
            ))}
          </div>
        )}
        {deskripsi && (
          <div className="tub-blok">
            <div className="tub-sek-dalam">
              <small className="tub-label">DESKRIPSI</small>
              <button type="button" className="tub-pil" onClick={() => salin(deskripsi, "Deskripsi")}>📋 Salin</button>
            </div>
            <textarea className="tub-area" rows={5} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
          </div>
        )}
        {tags.length > 0 && (
          <div className="tub-blok">
            <div className="tub-sek-dalam">
              <small className="tub-label">{tags.length} TAG</small>
              <button type="button" className="tub-pil" onClick={() => salin(tags.join(", "), "Semua tag")}>📋 Salin semua</button>
            </div>
            <div className="tub-tags">
              {tags.map((t, i) => <span key={i} className="tub-tag">{t}</span>)}
            </div>
          </div>
        )}
      </section>

      {/* AKSIBAR lengket — unduh selalu dalam jangkauan jempol */}
      {adaHasil && (
        <div className="tub-aksibar">
          <button type="button" className="tub-pil" onClick={buatVarian} disabled={sibuk}>🔄 Varian baru</button>
          <button type="button" className="tub-hero tub-hero-kecil"
            disabled={aktif.status !== "ok" || !aktif.final}
            onClick={() => aktif.final && unduh(aktif.final, `thumbnail-verve-v${aktifIdx + 1}.png`)}>
            ⬇ Unduh PNG 1280×720
          </button>
        </div>
      )}

      {tost && <div className="tub-tost" role="status">{tost}</div>}
    </div>
  );
}
