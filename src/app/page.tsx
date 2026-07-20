"use client";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { renderSlideshow, downloadBlob } from "@/lib/recorder";
import { renderGif } from "@/lib/gif";
import SpectrumStudio from "./spectrum-studio";
import {
  TRANSITIONS, ANIM_IN, ANIM_OUT, ANIM_LOOP, EFFECTS, FILTERS, TEXT_FONTS, TEXT_ANIMS,
  TEXT_TEMPLATES, TEXT_COLORS, STICKER_CATS, ANIM_STICKERS, STICKER_ANIM_CATS,
  ADJUST_DEFS, DEFAULT_ADJUST, DEFAULT_TEXT, buildClipFilter, canonicalTrans, effDur,
  buildTimeline, locate, paintClips, paintClipText, CC_TEMPLATES, paintPreviewCaptions,
  ensureFontsLoaded, setDrawBg,
} from "@/lib/editing";
import type { SlideOpt, ClipText, AdjustState, Timeline, CapWord, StickerItem } from "@/lib/editing";

/* =====================================================================
   VERVE v6 — Studio Video & Musik AI (100% kode & aset orisinal)
   Layar: Dashboard (Edit/Template/Lab AI/Proyek/Saya) → Editor studio
   lengkap (timeline, per-klip edit, auto caption, stiker animasi, ekspor
   resolusi kustom) + Spectrum Studio (modul terpisah).
   ===================================================================== */

interface Slide { id: string; imageUrl: string; }
interface Draft0 { id: string; title: string; slides: number; updatedAt: number; thumb?: string; }
type ScreenId = "home" | "template" | "lab" | "proyek" | "saya" | "editor" | "spectrum" | "editfoto" | "transkrip";

const DRAFTS_KEY = "verve_drafts_v1";
const SESSION_KEY = "verve_session_v6";
const SUNO_TASK_KEY = "verve_suno_task_v1";
const MAX_DRAFTS = 12;

/* ---------------- helpers ---------------- */
function uid(p = "s"): string { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function formatDur(s: number): string { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; }
function clampN(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }
function proxifyAudioUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const h = new URL(url).hostname.toLowerCase();
    const need = h.includes("kie.ai") || h.includes("suno") || h.includes("apiframe") || h.includes("sunor") || h.includes("aimusic") || h.includes("r2.dev") || h.includes("cdn2") || h.includes("cdn.");
    return need ? `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
}
function bufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, samples = buf.length;
  const blockAlign = numCh * 2, dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize); const v = new DataView(out);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44; const ch: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) ch.push(buf.getChannelData(c));
  for (let i = 0; i < samples; i++) for (let c = 0; c < numCh; c++) {
    const s = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return out;
}
function useIsMobile(): boolean {
  const [m, setM] = useState(true);
  useEffect(() => {
    const chk = () => setM(window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    chk(); window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);
  return m;
}
function dateLabel(ts: number): string {
  const d = new Date(ts); const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}
async function copyTxt(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

/* ==================================================================
   SHELL APLIKASI
   ================================================================== */
export default function Page() {
  const [screen, setScreen] = useState<ScreenId>("home");
  const [drafts, setDrafts] = useState<Draft0[]>([]);
  const [openDraft, setOpenDraft] = useState<string>("");
  const [editorCmd, setEditorCmd] = useState<{ tool?: string; newProject?: number; applyAdjust?: number }>({});

  const refreshDrafts = useCallback(() => {
    try {
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
      setDrafts((Array.isArray(arr) ? arr : []).map((d: any) => ({ id: d.id, title: d.title || "Draft", slides: Array.isArray(d.slides) ? d.slides.length : 0, updatedAt: d.updatedAt || 0, thumb: d.thumb || "" })).sort((a: Draft0, b: Draft0) => b.updatedAt - a.updatedAt));
    } catch { setDrafts([]); }
  }, []);
  useEffect(() => { refreshDrafts(); }, [refreshDrafts, screen]);

  function gotoEditor(draftId?: string, cmd?: { tool?: string; newProject?: number; applyAdjust?: number }) {
    setOpenDraft(draftId || "");
    setEditorCmd(cmd || (draftId ? {} : { newProject: Date.now() }));
    setScreen("editor");
  }

  const inSub = screen === "editor" || screen === "spectrum" || screen === "editfoto" || screen === "transkrip";
  return (
    <div className="v6-root">
      <div className="v6-app">
        {screen === "home" && <HomeDash drafts={drafts} go={setScreen} gotoEditor={gotoEditor} />}
        {screen === "template" && <TemplatePage gotoEditor={gotoEditor} />}
        {screen === "lab" && <LabPage gotoEditor={gotoEditor} go={setScreen} />}
        {screen === "proyek" && <ProyekPage drafts={drafts} gotoEditor={gotoEditor} refresh={refreshDrafts} go={setScreen} />}
        {screen === "saya" && <SayaPage refresh={refreshDrafts} />}
        {screen === "editor" && <EditorScreen onExit={() => { setScreen("home"); }} openDraftId={openDraft} cmd={editorCmd} onSaved={refreshDrafts} />}
        {screen === "spectrum" && <SpectrumStudio onExit={() => setScreen("home")} />}
        {screen === "editfoto" && <EditFotoPage onExit={() => setScreen("home")} />}
        {screen === "transkrip" && <TranskripPage onExit={() => setScreen("home")} />}
        {!inSub && (
          <nav className="v6-nav">
            {([
              ["home", "✂️", "Edit"],
              ["template", "▦", "Template"],
              ["lab", "🧬", "Lab AI"],
              ["proyek", "📁", "Proyek"],
              ["saya", "👤", "Saya"],
            ] as [ScreenId, string, string][]).map(([id, ic, lb]) => (
              <button key={id} className={screen === id ? "on" : ""} onClick={() => setScreen(id)}>{ic}<span>{lb}</span></button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   DASHBOARD / HOME
   ================================================================== */
function HomeDash({ drafts, go, gotoEditor }: { drafts: Draft0[]; go: (s: ScreenId) => void; gotoEditor: (id?: string, cmd?: any) => void }) {
  const tools: { ic: string; lb: string; bb?: string; act: () => void }[] = [
    { ic: "⚡", lb: "AutoCut", act: () => gotoEditor(undefined, { tool: "media", newProject: Date.now() }) },
    { ic: "🪄", lb: "Retouch", act: () => gotoEditor(undefined, { tool: "filter", applyAdjust: Date.now() }) },
    { ic: "🧠", lb: "Pembuat AI", bb: "AI", act: () => gotoEditor(undefined, { tool: "wizard", newProject: Date.now() }) },
    { ic: "🖼️", lb: "Alat foto", act: () => go("editfoto") },
    { ic: "📷", lb: "Ambil gambar & rekam", act: () => gotoEditor(undefined, { tool: "kamera", newProject: Date.now() }) },
    { ic: "✨", lb: "Sempurnakan otomatis", act: () => gotoEditor(undefined, { applyAdjust: Date.now() }) },
    { ic: "💬", lb: "Keterangan", act: () => gotoEditor(undefined, { tool: "keterangan" }) },
    { ic: "🫥", lb: "Hapus latar", act: () => alert("🫥 Hapus latar otomatis butuh layanan khusus — untuk sekarang gunakan stiker/overlay kustom ya bro. Versi ini akan hadir berikutnya!") },
    { ic: "📝", lb: "Transkripsikan", act: () => go("transkrip") },
  ];
  return (
    <div className="v6-body">
      <div className="v6-promo">
        <button className="v6-search-fab" onClick={() => go("lab")}>🔍</button>
        <span className="v6-promo-badge">💎 BARU · Spectrum Studio</span>
        <div className="v6-promo-title">Bikin Video Musik<br />Spectrum + Auto Lirik</div>
        <div className="v6-promo-sub">Ala tools PC, tapi cukup dari HP. Overlay hujan, salju, karaoke lirik, mastering ringan.</div>
        <button className="v6-promo-go" onClick={() => go("spectrum")}>Coba sekarang ›</button>
      </div>

      <div className="v6-cards2">
        <button className="v6-bigcard" onClick={() => gotoEditor(undefined, { newProject: Date.now() })}>
          <span className="ic" style={{ background: "var(--v6-teal)", color: "#04211f" }}>＋</span>
          <span className="lb">Video baru</span>
        </button>
        <button className="v6-bigcard" onClick={() => go("editfoto")}>
          <span className="tag">BARU</span>
          <span className="ic">🖼️</span>
          <span className="lb">Edit foto</span>
        </button>
      </div>

      <div className="v6-sec-title">
        <h3>Proyek terakhir</h3>
        {!!drafts.length && <button className="v6-sec-more" onClick={() => go("proyek")}>Semua ›</button>}
      </div>
      <div className="v6-recents">
        {drafts.slice(0, 8).map(d => (
          <div className="v6-recent" key={d.id} onClick={() => gotoEditor(d.id)}>
            <div className="th">
              {d.thumb ? <img src={d.thumb} alt="" /> : <span className="ph">🎬</span>}
              <span className="go">▶</span>
            </div>
            <div className="nm">{d.title}</div>
            <div className="dt">🗂 {dateLabel(d.updatedAt)}</div>
          </div>
        ))}
        {!drafts.length && (
          <div className="v6-recent" onClick={() => gotoEditor(undefined, { newProject: Date.now() })}>
            <div className="th"><span className="ph">＋</span></div>
            <div className="nm">Buat proyek pertamamu</div>
          </div>
        )}
        {!!drafts.length && <button className="chev" onClick={() => go("proyek")}>›</button>}
      </div>

      <div className="v6-sec-title"><h3>Semua alat</h3></div>
      <div className="v6-tools">
        {tools.map(t => (
          <button className="v6-tool" key={t.lb} onClick={t.act}>
            <span className="ic">{t.ic}</span>
            <span className="lb">{t.lb}</span>
            {t.bb && <span className="bb">{t.bb}</span>}
          </button>
        ))}
      </div>

      <button className="v6-banner-spec" onClick={() => go("spectrum")}>
        <div className="ttl">SPECTRUM STUDIO</div>
        <div className="sub">Musik → video spectrum keren: auto lirik karaoke, overlay suasana, mastering ringan, loop mulus.</div>
        <div className="cta">🎧 Buka Studio ›</div>
        <div className="bars">{[0,1,2,3,4,5,6].map(i => <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />)}</div>
      </button>
    </div>
  );
}

/* ==================================================================
   TEMPLATE (kerangka siap pakai — orisinal)
   ================================================================== */
const TEMPLATE_PRESETS = [
  { id: "sedih", icon: "🥀", name: "Klip Sedih Sinematik", desc: "9:16 · transisi lembut · vignette · cap karaoke kuning", cfg: { ratio: "9:16", transition: "fadeblack", transitionDur: 0.7, adj: { ...DEFAULT_ADJUST, vig: 90, fade: 18 }, caption: "karaoke" } },
  { id: "energi", icon: "⚡", name: "Shorts Energi", desc: "9:16 · denyut · denyar beat · teks pop", cfg: { ratio: "9:16", transition: "glitch", transitionDur: 0.35, adj: { ...DEFAULT_ADJUST, vig: 40 }, effect: "pulse", caption: "pop" } },
  { id: "asmr", icon: "🌧️", name: "Suasana Hujan Santai", desc: "16:9 · hujan + kabut · fade lambat", cfg: { ratio: "16:9", transition: "dissolve", transitionDur: 1.2, adj: { ...DEFAULT_ADJUST, b: -8 }, effect: "hujan", caption: "boldwhite" } },
  { id: "cerita", icon: "📖", name: "Storytelling Narasi", desc: "16:9 · zoom pelan · caption standar", cfg: { ratio: "16:9", transition: "zoomin", transitionDur: 0.8, adj: { ...DEFAULT_ADJUST }, loop: "zoompelan", caption: "capcut" } },
  { id: "motivasi", icon: "💬", name: "Quotes Motivasi", desc: "9:16 · dissolve lembut · caption neon", cfg: { ratio: "9:16", transition: "dissolve", transitionDur: 0.5, adj: { ...DEFAULT_ADJUST, c: 18, vig: 55 }, caption: "neon" } },
  { id: "produk", icon: "🛍️", name: "Jualan Produk", desc: "1:1 · wipe kiri · warna pop · caption gradasi", cfg: { ratio: "1:1", transition: "wipe-l", transitionDur: 0.45, adj: { ...DEFAULT_ADJUST, s: 15, c: 10 }, caption: "gradient" } },
  { id: "vlog", icon: "🚶", name: "Vlog Harian", desc: "16:9 · mix halus · caption putih tebal", cfg: { ratio: "16:9", transition: "dissolve", transitionDur: 0.5, adj: { ...DEFAULT_ADJUST, b: 4 }, loop: "zoompelan", caption: "boldwhite" } },
  { id: "game", icon: "🎮", name: "Gaming Hype", desc: "9:16 · glitch cepat · caption pop", cfg: { ratio: "9:16", transition: "glitch", transitionDur: 0.3, adj: { ...DEFAULT_ADJUST, c: 12, s: 8 }, caption: "pop" } },
];
function TemplatePage({ gotoEditor }: { gotoEditor: (id?: string, cmd?: any) => void }) {
  const [cat, setCat] = useState("semua");
  const CHIPS = [
    { id: "semua", label: "Untuk kamu" }, { id: "9:16", label: "Reel/Shorts" },
    { id: "16:9", label: "Cerita/Vlog" }, { id: "1:1", label: "Feed" },
  ];
  const list = TEMPLATE_PRESETS.filter(t => cat === "semua" || t.cfg.ratio === cat);
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Template</h2><span style={{ fontSize: 11, opacity: .5 }}>resep siap pakai</span></div>
      <div className="v6-chips">{CHIPS.map(c => <button key={c.id} className={`v6-chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
      <div className="v6-proj-grid">
        {list.map(t => (
          <div className="v6-proj" key={t.id} onClick={() => gotoEditor(undefined, { newProject: Date.now(), preset: { ...t.cfg, name: t.name } } as any)}>
            <div className="th" style={{ background: "linear-gradient(145deg,#1c1c26,#101016)", fontSize: 42 }}>{t.icon}</div>
            <div className="inf">
              <div className="nm">{t.name}</div>
              <div className="st"><span>{t.desc}</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="v6-empty">
        <div className="big">🚧</div>
        Galeri template komunitas <b>segera hadir</b> — kerangkanya sudah disiapkan.<br />Delapan resep di atas langsung bisa dipakai: tap → proyek baru auto-terkonfigurasi.
      </div>
    </div>
  );
}

/* ==================================================================
   LAB AI
   ================================================================== */
function LabPage({ gotoEditor, go }: { gotoEditor: (id?: string, cmd?: any) => void; go: (s: ScreenId) => void }) {
  const cards = [
    { ic: "🧠", t: "Pembuat AI", d: "Ide → judul → visual → musik otomatis jadi proyek", act: () => gotoEditor(undefined, { tool: "wizard", newProject: Date.now() }) },
    { ic: "🎵", t: "Musik AI (Suno)", d: "Buat lagu/instrumen orisinal bebas royalti", act: () => gotoEditor(undefined, { tool: "musik" }) },
    { ic: "🗣️", t: "Teks ke Audio", d: "Narasi suara AI dari teks (id-ID)", act: () => gotoEditor(undefined, { tool: "tts" }) },
    { ic: "🎨", t: "Gambar AI", d: "Generate visual sinematik utk klip", act: () => gotoEditor(undefined, { tool: "media" }) },
    { ic: "🎬", t: "Video AI", d: "Teks/gambar → video pendek (beta)", act: () => gotoEditor(undefined, { tool: "videoai" }) },
    { ic: "🎧", t: "Spectrum Studio", d: "Video spectrum musik + auto lirik", act: () => go("spectrum") },
    { ic: "💬", t: "Keterangan Otomatis", d: "Caption nyala mengikuti suara", act: () => gotoEditor(undefined, { tool: "keterangan" }) },
    { ic: "📝", t: "Transkripsikan", d: "Audio/video → teks (eksperimen)", act: () => go("transkrip") },
  ];
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Lab AI</h2></div>
      <div className="v6-proj-grid">
        {cards.map(c => (
          <div className="v6-proj" key={c.t} onClick={c.act}>
            <div className="th" style={{ background: "linear-gradient(145deg,#1c1c26,#101016)", fontSize: 40 }}>{c.ic}</div>
            <div className="inf"><div className="nm">{c.t}</div><div className="st"><span>{c.d}</span></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================
   PROYEK
   ================================================================== */
function ProyekPage({ drafts, gotoEditor, refresh, go }: { drafts: Draft0[]; gotoEditor: (id?: string) => void; refresh: () => void; go: (s: ScreenId) => void }) {
  function delDraft(id: string) {
    if (!confirm("Hapus proyek ini?")) return;
    try {
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]").filter((d: any) => d.id !== id);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(arr));
      refresh();
    } catch {}
  }
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Proyek</h2>
        <button className="v6-btn" onClick={() => gotoEditor()}>＋ Baru</button>
      </div>
      {!drafts.length && <div className="v6-empty"><div className="big">🎬</div>Belum ada proyek. Buat yang pertama bro!</div>}
      <div className="v6-proj-grid">
        {drafts.map(d => (
          <div className="v6-proj" key={d.id} onClick={() => gotoEditor(d.id)}>
            <div className="th">{d.thumb ? <img src={d.thumb} alt="" /> : <span style={{ fontSize: 34, opacity: .35 }}>🎬</span>}</div>
            <div className="inf">
              <div className="nm">{d.title}</div>
              <div className="st"><span>🎞 {d.slides} · {dateLabel(d.updatedAt)}</span>
                <button onClick={(e) => { e.stopPropagation(); delDraft(d.id); }} style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="v6-banner-spec" onClick={() => go("spectrum")} style={{ width: "calc(100% - 28px)" }}>
        <div className="ttl">SPECTRUM STUDIO</div><div className="sub">Proyek musik spectrum — studio terpisah, khusus konten musik.</div>
        <div className="bars">{[0,1,2,3,4].map(i => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      </button>
    </div>
  );
}

/* ==================================================================
   SAYA
   ================================================================== */
function SayaPage({ refresh }: { refresh: () => void }) {
  const [key, setKey] = useState("");
  const [prov, setProv] = useState("kie");
  useEffect(() => {
    try { setKey(localStorage.getItem("verve_suno_key") || ""); setProv(localStorage.getItem("verve_suno_provider") || "kie"); } catch {}
  }, []);
  function save() {
    try {
      if (key.trim()) { localStorage.setItem("verve_suno_key", key.trim()); localStorage.setItem("verve_suno_provider", prov); alert("✅ API key Suno tersimpan."); }
      else { localStorage.removeItem("verve_suno_key"); localStorage.removeItem("verve_suno_provider"); alert("API key dihapus — mode gratis aktif."); }
    } catch {}
  }
  function wipe() {
    if (!confirm("Hapus SEMUA proyek & data lokal?")) return;
    try { [DRAFTS_KEY, SESSION_KEY, SUNO_TASK_KEY].forEach(k => localStorage.removeItem(k)); refresh(); alert("Bersih! ✨"); } catch {}
  }
  return (
    <div className="v6-body">
      <div className="v6-pagehead"><h2>Saya</h2></div>
      <div className="v6-cardrow" style={{ cursor: "default" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,var(--v6-teal),#0e7490)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#04211f" }}>V</div>
        <div className="tt">Kreator VERVE<div style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: 500 }}>Studio video & musik di HP kamu 🚀</div></div>
      </div>
      <div style={{ padding: "0 2px" }}>
        <div className="v6-lbl">🔑 API KEY SUNO (buat musik AI)</div>
        <input className="v6-inp" placeholder="Tempel API key di sini (kosongkan = mode gratis)" value={key} onChange={e => setKey(e.target.value)} />
        <div className="v6-lbl">PROVIDER</div>
        <select className="v6-inp" value={prov} onChange={e => setProv(e.target.value)}>
          <option value="kie">🥇 Kie.ai (direkomendasikan, gratis 5.000 kredit)</option>
          <option value="apiframe">Apiframe.ai</option>
          <option value="sunor">Sunor.cc</option>
        </select>
        <div className="v6-note">💡 Tanpa key, VERVE pakai generator musik gratis (lebih lambat). Key disimpan <b>hanya di HP kamu</b> (localStorage), tidak dikirim ke mana pun kecuali ke provider musik saat generate.</div>
        <button className="v6-btn" style={{ marginTop: 10, width: "100%" }} onClick={save}>💾 Simpan</button>
      </div>
      <div className="v6-cardrow" style={{ cursor: "default", marginTop: 14 }}>
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div className="tt" style={{ fontSize: 12 }}>Hak cipta<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Musik dari generator AI (Suno) = orisinal milikmu. Hati-hati saat upload lagu orang lain — risiko klaim hak cipta tetap tanggung jawab pengguna.</div></div>
      </div>
      <div className="v6-cardrow" onClick={wipe}>
        <span style={{ fontSize: 20 }}>🗑</span><div className="tt">Bersihkan semua data lokal</div><span className="arr">›</span>
      </div>
      <div className="v6-cardrow" style={{ cursor: "default" }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div className="tt" style={{ fontSize: 12 }}>VERVE v6 <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>100% kode, desain, & aset orisinal. Dibuat dengan ♥ untuk kreator Indonesia. 🇮🇩</div></div>
      </div>
    </div>
  );
}

/* ==================================================================
   EDITOR SCREEN v6
   ================================================================== */
const MAIN_TOOLS: { id: string; icon: string; label: string; bdg?: string; bdgCls?: string; disabled?: boolean }[] = [
  { id: "edit",    icon: "✂️",  label: "Edit" },
  { id: "audio",   icon: "🎵",  label: "Audio" },
  { id: "teks",    icon: "🔤",  label: "Teks" },
  { id: "efek",    icon: "☆",   label: "Efek" },
  { id: "overlay", icon: "🖼️", label: "Overlay" },
  { id: "keterangan", icon: "💬", label: "Keterangan" },
  { id: "filter",  icon: "🎨",  label: "Filter" },
  { id: "sesuaikan", icon: "🎚️", label: "Sesuaikan" },
  { id: "stiker",  icon: "😀",  label: "Stiker" },
  { id: "media",   icon: "✨",  label: "Hasilkan media", bdg: "AI", bdgCls: "ai" },
  { id: "avatar",  icon: "👤",  label: "Avatar AI", bdg: "PRO", bdgCls: "pro", disabled: true },
  { id: "rasio",   icon: "⬜",  label: "Rasio aspek" },
  { id: "latar",   icon: "▱",   label: "Latar belakang" },
];
const CLIP_TOOLS: { id: string; icon: string; label: string; bdg?: string; bdgCls?: string }[] = [
  { id: "split",   icon: "╫",   label: "Bagi" },
  { id: "animasi", icon: "▷",   label: "Animasi" },
  { id: "efek",    icon: "☆",   label: "Efek" },
  { id: "gambarai", icon: "🖼️", label: "Gambar AI", bdg: "✦", bdgCls: "ai" },
  { id: "hapus",   icon: "▢",   label: "Hapus" },
  { id: "pangkas", icon: "▭",   label: "Pangkas" },
  { id: "dup",     icon: "⧉",   label: "Duplikat" },
  { id: "ganti",   icon: "⇄",   label: "Ganti" },
  { id: "teks",    icon: "🔤",  label: "Teks" },
  { id: "stiker",  icon: "😀",  label: "Stiker" },
  { id: "speed",   icon: "⚡",  label: "Speed" },
  { id: "transisi", icon: "🔀", label: "Transisi" },
];
const AUDIO_MENU: { id: string; icon: string; label: string; bdg?: string }[] = [
  { id: "upload",  icon: "🎵", label: "Suara (upload dari HP)" },
  { id: "rekam",   icon: "🎙️", label: "Rekam" },
  { id: "tts",     icon: "🗣️", label: "Teks ke audio" },
  { id: "ekstrak", icon: "🎬", label: "Ekstrak", bdg: "MP3" },
  { id: "musik",   icon: "✨", label: "Musik AI (Suno)", bdg: "AI" },
  { id: "hakcipta", icon: "🛡", label: "Cek Hak Cipta" },
  { id: "hapusAudio", icon: "🗑", label: "Hapus semua audio" },
];
const RES_STOPS = [480, 720, 1080, 1440, 2160];
const FPS_STOPS = [24, 25, 30, 50, 60];
const MBPS_STOPS = [5, 10, 20, 50, 100];
const IMG_STYLE_PRESETS = [
  { id: "cinematic", label: "🎬 Cinematic" }, { id: "studio", label: "📸 Studio" },
  { id: "epic",      label: "⚔️ Fantasy" },  { id: "anime", label: "🌸 Anime" },
  { id: "cyberpunk", label: "🌃 Cyber" },    { id: "oil",   label: "🎨 Oil" },
  { id: "minimalist",label: "◻️ Minimal" },  { id: "3d",    label: "🧊 3D" },
];
const VOICES: { id: string; name: string; av: string; bg: string }[] = [
  { id: "alloy", name: "Nadia", av: "👩", bg: "#0e7490" },
  { id: "nova", name: "Laras", av: "👩‍🦰", bg: "#7c3aed" },
  { id: "shimmer", name: "Sinta", av: "👱‍♀️", bg: "#be185d" },
  { id: "echo", name: "Dimas", av: "🧑", bg: "#1d4ed8" },
  { id: "onyx", name: "Bara", av: "👨", bg: "#111827" },
  { id: "fable", name: "Pandu", av: "🧔", bg: "#065f46" },
];
const MUSIC_GENRES = ["pop ballad", "slow rock", "dangdut koplo", "akustik", "religi", "trap edm", "lofi", "cinematic epic"];

function EditorScreen({ onExit, openDraftId, cmd, onSaved }: { onExit: () => void; openDraftId: string; cmd: any; onSaved: () => void }) {
  const isMobile = useIsMobile();
  /* ---------- state proyek ---------- */
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideOptsById, setSlideOptsById] = useState<Record<string, SlideOpt>>({});
  const [selId, setSelId] = useState<string>("");
  const [ratio, setRatio] = useState<"16:9" | "9:16" | "1:1">("9:16");
  const [slideDuration, setSlideDuration] = useState(3);
  const [transition, setTransition] = useState("dissolve");
  const [transitionDur, setTransitionDur] = useState(0.6);
  const [bgMode, setBgMode] = useState<"cover" | "blur" | "color">("cover");
  const [bgColor, setBgColor] = useState("#000000");
  /* ---------- audio ---------- */
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [ttsUrl, setTtsUrl] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [voiceUrl, setVoiceUrl] = useState(""); // rekaman
  const [audMuted, setAudMuted] = useState(false);
  const [musicVol, setMusicVol] = useState(1);        // 0..1.5
  const [voiceVol, setVoiceVol] = useState(1);        // 0..1.5 (tts+rekaman)
  const [musicFadeIn, setMusicFadeIn] = useState(0);  // detik
  const [musicFadeOut, setMusicFadeOut] = useState(0); // detik
  /* ---------- gaya global ---------- */
  const [filterPreset, setFilterPreset] = useState("none");
  const [adj, setAdj] = useState<AdjustState>({ ...DEFAULT_ADJUST });
  const [qualitySharp, setQualitySharp] = useState(() => { try { return !!JSON.parse(localStorage.getItem("verve_export_v1") || "{}").s; } catch { return false; } });
  const [presets, setPresets] = useState<{ id: string; name: string; filter: string; adj: AdjustState }[]>([]);
  /* ---------- caption ---------- */
  const [capWords, setCapWords] = useState<CapWord[]>([]);
  const [capStyle, setCapStyle] = useState("capcut");
  const [ccFrom, setCcFrom] = useState("suara"); // suara | musik
  const [ccLang, setCcLang] = useState("id-ID");
  const [ccTpl, setCcTpl] = useState("standar");
  const [ccSize, setCcSize] = useState(0.055);
  const [ccY, setCcY] = useState(0.78);
  /* ---------- judul/proyek ---------- */
  const [projTitle, setProjTitle] = useState("Proyek Tanpa Judul");
  const [niche, setNiche] = useState("");
  const [coverThumb, setCoverThumb] = useState("");
  /* ---------- preview ---------- */
  const [playing, setPlaying] = useState(false);
  const [curT, setCurT] = useState(0);
  const [durT, setDurT] = useState(0);
  const [pipOn, setPipOn] = useState(true);
  const [fullStage, setFullStage] = useState(false);
  /* ---------- UI panels ---------- */
  const [tool, setTool] = useState<string | null>(null);
  const [clipBar, setClipBar] = useState(false);
  const [sheetTab, setSheetTab] = useState("");
  const [modal, setModal] = useState<string | null>(null); // rekam|tts|musik|kamera|wizard|sampul|videoai|ganti|gambarai
  const [loading, setLoading] = useState<string | null>(null);
  const [stageText, setStageText] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  /* ---------- ekspor v6 ---------- */
  const [exTab, setExTab] = useState<"video" | "gif">("video");
  const [exRes, setExRes] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").r || 1080; } catch { return 1080; } });
  const [exFps, setExFps] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").f || 30; } catch { return 30; } });
  const [exMbps, setExMbps] = useState(() => { try { return JSON.parse(localStorage.getItem("verve_export_v1") || "{}").m || 10; } catch { return 10; } });
  // ingat pengaturan ekspor terakhir
  useEffect(() => { try { localStorage.setItem("verve_export_v1", JSON.stringify({ r: exRes, f: exFps, m: exMbps, s: qualitySharp ? 1 : 0 })); } catch {} }, [exRes, exFps, exMbps, qualitySharp]);
  /* ---------- suno ---------- */
  const [sunoKey, setSunoKey] = useState("");
  const [sunoProv, setSunoProv] = useState("kie");
  const [mTitle, setMTitle] = useState("");
  const [mLyrics, setMLyrics] = useState("");
  const [mStyle, setMStyle] = useState("");
  const [mGenre, setMGenre] = useState("pop ballad");
  const [mMood, setMMood] = useState("emotional, menyentuh");
  const [mModel, setMModel] = useState("suno-v5");
  const [mVocal, setMVocal] = useState<"vocal" | "instrumental">("vocal");
  const [mTask, setMTask] = useState("");
  const [mStatus, setMStatus] = useState("");
  /* ---------- tts modal ---------- */
  const [ttsVoice, setTtsVoice] = useState("alloy");
  /* ---------- draft ---------- */
  const [draftId, setDraftId] = useState("");
  /* ---------- refs ---------- */
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const imgsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const musicEl = useRef<HTMLAudioElement | null>(null);
  const voiceEls = useRef<HTMLAudioElement[]>([]);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<Float32Array>(new Float32Array(48));
  const clockRef = useRef<{ audio: HTMLAudioElement | null; t0: number; base: number }>({ audio: null, t0: 0, base: 0 });
  const slidesRef = useRef(slides); useEffect(() => { slidesRef.current = slides; }, [slides]);
  const curTRef = useRef(0); useEffect(() => { curTRef.current = curT; }, [curT]);
  const durTRef = useRef(0); useEffect(() => { durTRef.current = durT; }, [durT]);
  const optsRef = useRef(slideOptsById); useEffect(() => { optsRef.current = slideOptsById; }, [slideOptsById]);
  const adjRef = useRef(adj); useEffect(() => { adjRef.current = adj; }, [adj]);
  const filterRef = useRef(filterPreset); useEffect(() => { filterRef.current = filterPreset; }, [filterPreset]);
  const ratioRef = useRef(ratio); useEffect(() => { ratioRef.current = ratio; }, [ratio]);
  const bgRef = useRef({ bgMode, bgColor }); useEffect(() => { bgRef.current = { bgMode, bgColor }; }, [bgMode, bgColor]);
  const capRef = useRef(capWords); useEffect(() => { capRef.current = capWords; }, [capWords]);
  const capStyleRef = useRef(capStyle); useEffect(() => { capStyleRef.current = capStyle; }, [capStyle]);
  const ccRef = useRef({ ccSize, ccY }); useEffect(() => { ccRef.current = { ccSize, ccY }; }, [ccSize, ccY]);
  const pipRef = useRef(pipOn); useEffect(() => { pipRef.current = pipOn; }, [pipOn]);
  const musicVolRef = useRef(musicVol); const voiceVolRef = useRef(voiceVol);
  useEffect(() => { musicVolRef.current = musicVol; if (musicEl.current) musicEl.current.volume = Math.min(1, musicVol); }, [musicVol]);
  useEffect(() => { voiceVolRef.current = voiceVol; voiceEls.current.forEach(a => { a.volume = Math.min(1, voiceVol); }); }, [voiceVol]);
  const audMutedRef = useRef(audMuted); useEffect(() => {
    audMutedRef.current = audMuted;
    if (musicEl.current) musicEl.current.muted = audMuted;
    voiceEls.current.forEach(a => { a.muted = audMuted; });
  }, [audMuted]);

  /* ---------- HISTORY (undo/redo) ---------- */
  const histRef = useRef<{ stk: string[]; i: number }>({ stk: [], i: -1 });
  const [histTick, setHistTick] = useState(0);
  const snapNow = useCallback(() => JSON.stringify({ s: slides, o: slideOptsById, c: capWords, cs: capStyle }), [slides, slideOptsById, capWords, capStyle]);
  const pushHist = useCallback(() => {
    try {
      const snap = snapNow();
      if (histRef.current.stk[histRef.current.i] === snap) return;
      histRef.current.stk = histRef.current.stk.slice(0, histRef.current.i + 1);
      histRef.current.stk.push(snap);
      if (histRef.current.stk.length > 42) histRef.current.stk.shift();
      histRef.current.i = histRef.current.stk.length - 1;
      setHistTick(v => v + 1);
    } catch {}
  }, [snapNow]);
  const applySnap = useCallback((snap: string) => {
    try {
      const d = JSON.parse(snap);
      setSlides(d.s || []); setSlideOptsById(d.o || {}); setCapWords(d.c || []); setCapStyle(d.cs || "capcut");
      setSelId("");
    } catch {}
  }, []);
  const undo = useCallback(() => { const h = histRef.current; if (h.i > 0) { h.i--; applySnap(h.stk[h.i]); setHistTick(v => v + 1); } }, [applySnap]);
  const redo = useCallback(() => { const h = histRef.current; if (h.i < h.stk.length - 1) { h.i++; applySnap(h.stk[h.i]); setHistTick(v => v + 1); } }, [applySnap]);
  const canUndo = histTick >= 0 && histRef.current.i > 0;
  const canRedo = histRef.current.i >= 0 && histRef.current.i < histRef.current.stk.length - 1;

  /* ---------- TIMELINE ---------- */
  const timeline: Timeline | null = useMemo(() => {
    if (!slides.length) return null;
    const durs = slides.map(s => effDur(slideOptsById[s.id], slideDuration));
    const tdurs = slides.map((s, i) => {
      if (i >= slides.length - 1) return 0;
      const tid = canonicalTrans(slideOptsById[s.id]?.trans ?? transition);
      if (tid === "none") return 0;
      return clampN(slideOptsById[s.id]?.transDur ?? transitionDur, 0.15, durs[i] * 0.9);
    });
    const tids = slides.map(s => canonicalTrans(slideOptsById[s.id]?.trans ?? transition));
    return buildTimeline(durs, tdurs, tids);
  }, [slides, slideOptsById, slideDuration, transitionDur, transition]);
  const timelineRef = useRef<Timeline | null>(null); useEffect(() => { timelineRef.current = timeline; }, [timeline]);
  const clipsTotal = timeline?.total || 0;
  const selIndex = useMemo(() => slides.findIndex(s => s.id === selId), [slides, selId]);
  const selOpt = selId ? slideOptsById[selId] : undefined;

  const lastOptKey = useRef<{ k: string; t: number }>({ k: "", t: 0 });
  const setOpt = useCallback((id: string, patch: Partial<SlideOpt>) => {
    const k = `${id}:${Object.keys(patch).join(",")}`;
    const now = Date.now();
    if (lastOptKey.current.k !== k || now - lastOptKey.current.t > 650) {
      pushHist();
      lastOptKey.current = { k, t: now };
    }
    setSlideOptsById(cur => ({ ...cur, [id]: { ...(cur[id] || {}), ...patch } }));
  }, [pushHist]);
  useEffect(() => { if (selId && !slides.some(s => s.id === selId)) { setSelId(""); setClipBar(false); } }, [slides, selId]);

  /* ---------- PREVIEW (canvas + rAF + audio clock) ---------- */
  const drawFrameRefCb = useRef<(t: number) => void>(() => {});
  function getImage(url: string): HTMLImageElement | null {
    if (!url) return null;
    const c = imgsRef.current.get(url);
    if (c) return c.complete && c.naturalWidth ? c : null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { drawFrameRefCb.current(curTRef.current); } catch {} };
    img.src = url;
    imgsRef.current.set(url, img);
    return img.complete && img.naturalWidth ? img : null;
  }
  const getClockT = useCallback((): number => {
    const c = clockRef.current;
    if (c.audio) return c.audio.currentTime;
    if (playing) return c.base + (performance.now() - c.t0) / 1000;
    return curT;
  }, [playing, curT]);

  const drawFrame = useCallback((t: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext("2d") as CanvasRenderingContext2D | null; if (!ctx) return;
    const sl = slidesRef.current, tl = timelineRef.current;
    const bg = bgRef.current;
    setDrawBg(bg.bgMode, bg.bgColor);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (!sl.length || !tl) {
      // layar kosong
      ctx.fillStyle = "#0a0a0e"; ctx.fillRect(0, 0, W, H);
      return;
    }
    const tt = Math.min(t, Math.max(0, tl.total - 0.001));
    const L = locate(tl, tt);
    const optCur = optsRef.current[sl[L.idx].id] || null;
    const optNxt = sl[L.nextIdx] ? optsRef.current[sl[L.nextIdx].id] : null;
    const cur = getImage(sl[L.idx].imageUrl);
    const nxt = (L.nextIdx !== L.idx && sl[L.nextIdx]) ? getImage(sl[L.nextIdx].imageUrl) : null;
    const gf = buildClipFilter(filterRef.current, adjRef.current);
    const kb = (optCur?.loop === "zoompelan" || !optCur?.loop) ? 1 + Math.min(0.06, (tt / Math.max(1, tl.total)) * 0.06) : 1;
    paintClips(ctx, W, H, cur, nxt, {
      clipT: L.clipT, clipDur: L.clipDur, inTrans: L.inTrans, transT: L.transT,
      transId: L.inTrans ? canonicalTrans(optCur?.trans ?? "dissolve") : "none",
      optCur: optCur as any, optNxt: optNxt as any,
      globalFilter: gf, absT: tt, isMobile: true, beat: false,
      grain: adjRef.current.grain, kbZoom: kb,
    } as any);
    // captions
    if (capRef.current.length) paintPreviewCaptions(ctx, W, H, capRef.current, tt, capStyleRef.current, { sizeRatio: ccRef.current.ccSize, yRatio: ccRef.current.ccY });
    // indikator PiP mini style (jam kecil kiri atas — elemen gaya hidup)
    if (pipRef.current && playing) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(8, 8, 54, 18);
      ctx.fillStyle = "#fff"; ctx.font = "700 10px ui-monospace,monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("● REC", 13, 17);
    }
  }, [playing]);

  useEffect(() => { drawFrameRefCb.current = drawFrame; }, [drawFrame]);

  const tick = useCallback(() => {
    // jika master audio selesai tapi klip masih panjang → lanjut jam manual
    const aud0 = clockRef.current.audio;
    if (aud0 && aud0.ended) {
      clockRef.current = { audio: null, t0: performance.now(), base: aud0.duration || 0 };
    }
    const t = getClockT();
    const tl = timelineRef.current;
    const total = tl?.total || 0;
    const aud = clockRef.current.audio;
    const audioDur = aud && isFinite(aud.duration) ? aud.duration : 0;
    const totalAll = Math.max(total, audioDur);
    setDurT(totalAll);
    if (totalAll > 0 && t >= totalAll - 0.02) { stopPreview(true); setCurT(0); drawFrame(0); return; }
    setCurT(t);
    drawFrame(t);
    rafRef.current = requestAnimationFrame(tick);
  }, [getClockT, drawFrame]); // eslint-disable-line

  const stopPreview = useCallback((ended = false) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
    if (clockRef.current.audio) { try { clockRef.current.audio.pause(); } catch {} }
    voiceEls.current.forEach(a => { try { a.pause(); } catch {} });
    voiceEls.current = [];
    clockRef.current.audio = null;
    setPlaying(false);
    if (!ended) {/* tetap di posisi */}
  }, []);

  const seekPreview = useCallback((t: number) => {
    const tl = timelineRef.current;
    const total = Math.max(tl?.total || 0, clockRef.current.audio && isFinite(clockRef.current.audio.duration) ? clockRef.current.audio.duration : 0);
    const tt = clampN(t, 0, Math.max(0, total - 0.001));
    if (clockRef.current.audio) try { clockRef.current.audio.currentTime = tt; } catch {}
    voiceEls.current.forEach(a => { try { a.currentTime = tt; } catch {} });
    clockRef.current.base = tt; clockRef.current.t0 = performance.now();
    setCurT(tt); drawFrame(tt);
  }, [drawFrame]);

  const togglePreview = useCallback(() => {
    if (!slidesRef.current.length) return;
    if (playing) { stopPreview(); return; }
    // buat/reset sumber audio
    let seekTo = curT;
    if (durTRef.current > 0.3 && curT >= durTRef.current - 0.06) { seekTo = 0; setCurT(0); }
    let master: HTMLAudioElement | null = null;
    voiceEls.current = [];
    try {
      if (!actxRef.current) actxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      actxRef.current.resume().catch(() => {});
      if (musicUrl) {
        if (!musicEl.current || musicEl.current.src !== proxifyAudioUrl(musicUrl)) {
          musicEl.current = new Audio(proxifyAudioUrl(musicUrl));
          musicEl.current.crossOrigin = "anonymous";
          // analyser utk beat (dipakai some effects later)
          try {
            const src = actxRef.current.createMediaElementSource(musicEl.current);
            analyserRef.current = actxRef.current.createAnalyser();
            src.connect(analyserRef.current); analyserRef.current.connect(actxRef.current.destination);
          } catch {}
        }
        musicEl.current.muted = audMutedRef.current;
        musicEl.current.volume = Math.min(1, musicVolRef.current);
        master = musicEl.current;
      }
      [ttsUrl, voiceUrl].forEach(u => {
        if (!u) return;
        const a = new Audio(proxifyAudioUrl(u)); a.crossOrigin = "anonymous"; a.muted = audMutedRef.current;
        a.volume = Math.min(1, voiceVolRef.current);
        voiceEls.current.push(a);
        if (!master) master = a;
      });
    } catch {}
    clockRef.current.audio = master;
    clockRef.current.base = seekTo; clockRef.current.t0 = performance.now();
    if (master) {
      try { master.currentTime = seekTo; master.play().catch(() => {}); } catch {}
      voiceEls.current.forEach(a => { try { a.currentTime = seekTo; a.play().catch(() => {}); } catch {} });
    }
    setPlaying(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [playing, curT, musicUrl, ttsUrl, voiceUrl, stopPreview, tick]);

  // ukuran canvas mengikuti rasio
  useEffect(() => {
    const cv = canvasRef.current; const wrap = stageWrapRef.current;
    if (!cv || !wrap) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const ar = ratio === "9:16" ? 9 / 16 : ratio === "1:1" ? 1 : 16 / 9;
      let w = r.width, h = w / ar;
      if (h > r.height) { h = r.height; w = h * ar; }
      const sc = Math.min(1, 640 / w);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
      drawFrame(curT);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(wrap);
    return () => ro.disconnect();
  }, [ratio]); // eslint-disable-line

  useEffect(() => () => { stopPreview(); }, []); // eslint-disable-line

  /* ---------- DRAFT persist ---------- */
  const didInit = useRef(false);
  const saveTimer = useRef<any>(null);
  const buildSnapshot = useCallback((thumbOverride?: string) => {
    const compactSlides = slides.slice(0, 16).map(s => (s.imageUrl.startsWith("data:") && s.imageUrl.length > 500_000) ? { ...s, imageUrl: "" } : s);
    const first = slides[0]?.imageUrl || "";
    const thumb = thumbOverride ?? (coverThumb || (first.startsWith("data:") ? first.slice(0, 40000) : first));
    return { v: 6, id: draftId || uid("d"), title: projTitle.slice(0, 80), updatedAt: Date.now(),
      slides: compactSlides, slideOptsById, ratio, slideDuration, transition, transitionDur, bgMode, bgColor,
      musicUrl, musicName, ttsUrl, ttsText, voiceUrl: "", filterPreset, adj, qualitySharp,
      musicVol, voiceVol, musicFadeIn, musicFadeOut,
      capWords, capStyle, ccTpl, ccSize, ccY, niche, coverThumb: thumb, audMuted,
      mTitle, mLyrics, mStyle, mGenre, mMood, mModel, mVocal };
  }, [slides, slideOptsById, ratio, slideDuration, transition, transitionDur, bgMode, bgColor, musicUrl, musicName, ttsUrl, ttsText, filterPreset, adj, qualitySharp, capWords, capStyle, ccTpl, ccSize, ccY, niche, coverThumb, draftId, projTitle, mTitle, mLyrics, mStyle, mGenre, mMood, mModel, mVocal, audMuted]);
  function applySnapshot(d: any) {
    if (!d) return;
    stopPreview();
    setSlides(d.slides || []); setSlideOptsById(d.slideOptsById || {});
    setRatio(d.ratio || "9:16"); setSlideDuration(d.slideDuration || 3);
    setTransition(d.transition || "dissolve"); setTransitionDur(d.transitionDur ?? 0.6);
    setBgMode(d.bgMode || "cover"); setBgColor(d.bgColor || "#000000");
    setMusicUrl(d.musicUrl || ""); setMusicName(d.musicName || "");
    setTtsUrl(d.ttsUrl || ""); setTtsText(d.ttsText || ""); setVoiceUrl(d.voiceUrl || "");
    setFilterPreset(d.filterPreset || "none"); setAdj({ ...DEFAULT_ADJUST, ...(d.adj || {}) });
    setQualitySharp(!!d.qualitySharp);
    setMusicVol(d.musicVol ?? 1); setVoiceVol(d.voiceVol ?? 1);
    setMusicFadeIn(d.musicFadeIn ?? 0); setMusicFadeOut(d.musicFadeOut ?? 0);
    setCapWords(d.capWords || []); setCapStyle(d.capStyle || "capcut");
    setCcTpl(d.ccTpl || "standar"); setCcSize(d.ccSize || 0.055); setCcY(d.ccY || 0.78);
    setNiche(d.niche || ""); setCoverThumb(d.coverThumb || "");
    setProjTitle(d.title || "Proyek Tanpa Judul"); setDraftId(d.id || "");
    setMTitle(d.mTitle || ""); setMLyrics(d.mLyrics || ""); setMStyle(d.mStyle || "");
    setMGenre(d.mGenre || "pop ballad"); setMMood(d.mMood || "emotional, menyentuh");
    setMModel(d.mModel || "suno-v5"); setMVocal(d.mVocal || "vocal");
    setSelId(""); setClipBar(false); setCurT(0);
    (window as any).__v6prevlen = fromArrayLen((d.slides || []));
    histRef.current = { stk: [], i: -1 }; setHistTick(v => v + 1);
  }
  function fromArrayLen(a: any[]): number { return Array.isArray(a) ? a.length : 0; }
  function persistSnapshot(manual = false) {
    try {
      const snap = buildSnapshot();
      if (!snap.slides.length && !manual) return;
      const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
      const idx = arr.findIndex((d: any) => d.id === snap.id);
      const prevThumb = idx >= 0 ? arr[idx].coverThumb : "";
      if (!snap.coverThumb && prevThumb) snap.coverThumb = prevThumb;
      if (idx >= 0) arr[idx] = snap; else arr.unshift(snap);
      while (arr.length > MAX_DRAFTS) arr.pop();
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(arr));
      if (!draftId) setDraftId(snap.id);
      onSaved();
      if (manual) flash("✅ Proyek tersimpan");
    } catch {}
  }
  const flash = (t: string) => { setStageText(t); setTimeout(() => setStageText(""), 1800); };
  const setErr = (e: any) => setError(e?.message || e?.error || String(e || "Terjadi kesalahan"));

  /* ---------- INIT ---------- */
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    ensureFontsLoaded().then(() => drawFrame(0)).catch(() => {});
    try {
      setSunoKey(localStorage.getItem("verve_suno_key") || "");
      setSunoProv(localStorage.getItem("verve_suno_provider") || "kie");
      setPresets(JSON.parse(localStorage.getItem("verve_filter_presets") || "[]"));
      const tk = JSON.parse(localStorage.getItem(SUNO_TASK_KEY) || "null");
      if (tk?.id && Date.now() - tk.ts < 30 * 60 * 1000) { setMTask(tk.id); setMStatus("pending"); }
    } catch {}
    // buka draft / sesi / proyek baru
    if (openDraftId) {
      try {
        const arr = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
        const d = arr.find((x: any) => x.id === openDraftId);
        if (d) applySnapshot(d);
      } catch {}
    }
    if (cmd?.preset) {
      const c = cmd.preset;
      if (c.ratio) setRatio(c.ratio);
      if (c.transition) setTransition(c.transition);
      if (c.transitionDur) setTransitionDur(c.transitionDur);
      if (c.adj) setAdj({ ...DEFAULT_ADJUST, ...c.adj });
      if (c.caption) setCapStyle(c.caption);
      flash(`✨ Template "${c.name || c.caption || ""}" diterapkan — tambahkan media!`);
    }
    if (cmd?.applyAdjust) {
      setAdj({ b: 6, c: 14, s: 10, e: 4, tem: 2, hue: 0, fade: 0, vig: 30, grain: 0 });
      setQualitySharp(true);
      flash("✨ Otomatis disempurnakan: warna + ketajaman");
    }
    if (cmd?.tool) setTimeout(() => openToolCmd(cmd.tool), 450);
    pushHist();
  }, []); // eslint-disable-line

  // auto-AKHIRAN: saat media pertama ditambahkan pada proyek kosong (ala CapCut)
  const prevLenRef = useRef<number | null>(null);
  useEffect(() => {
    const w = window as any;
    if (typeof w.__v6prevlen === "number") { prevLenRef.current = w.__v6prevlen; w.__v6prevlen = undefined; }
    const n = slides.length;
    if (prevLenRef.current === 0 && n > 0 && !slides.some(x => x.id.startsWith("outro"))) {
      const o = { id: uid("outro"), imageUrl: makeOutroImage("Terima kasih sudah menonton 🙏") };
      setSlides(c => c.some(x => x.id.startsWith("outro")) ? c : [...c, o]);
      setSlideOptsById(c => ({ ...c, [o.id]: { dur: 2.2, trans: "fadeblack" } }));
      flash("🏁 Akhiran otomatis ditambahkan (tap untuk ganti/hapus)");
    }
    prevLenRef.current = n;
  }, [slides]); // eslint-disable-line

  // autosave (debounce) setiap perubahan struktural
  useEffect(() => {
    if (!didInit.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSnapshot(), 1200);
    return () => clearTimeout(saveTimer.current);
  }, [slides, slideOptsById, capWords, capStyle, adj, filterPreset, bgMode, bgColor, ratio, musicUrl, ttsUrl]); // eslint-disable-line

  /* ---------- TOOL ROUTER ---------- */
  function openToolCmd(t: string) {
    switch (t) {
      case "media": setTool("media"); break;
      case "kamera": setModal("kamera"); break;
      case "wizard": setModal("wizard"); break;
      case "musik": setModal("musik"); break;
      case "tts": setModal("tts"); break;
      case "rekam": setModal("rekam"); break;
      case "keterangan": setTool("keterangan"); break;
      case "filter": setTool("filter"); setSheetTab("filter"); break;
      case "videoai": setModal("videoai"); break;
      default: setTool(t);
    }
  }
  function onMainTool(t: string) {
    if (t === "edit") {
      if (!slides.length) { setTool("media"); return; }
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      const sid = selId || (L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id) || "";
      if (sid) { setSelId(sid); setClipBar(true); }
      return;
    }
    if (t === "avatar") return;
    if (t === "sesuaikan") { setTool("filter"); setSheetTab("sesuaikan"); return; }
    if (t === "overlay") { setTool("stiker"); setSheetTab("overlayimg"); return; }
    setTool(cur => cur === t ? null : t); setSheetTab("");
    if (t === "teks" && !slides.length) setTool("media");
  }
  function onClipTool(t: string) {
    const id = selId; if (!id) return;
    switch (t) {
      case "split": doSplitAtPlayhead(); break;
      case "animasi": setTool("animasi"); setSheetTab("masuk"); break;
      case "efek": setTool("efek"); break;
      case "gambarai": setModal("gambarai"); break;
      case "hapus": pushHist(); setSlides(c => c.filter(s => s.id !== id)); flash("🗑 Klip dihapus"); break;
      case "pangkas": setTool("pangkas"); break;
      case "dup": pushHist(); {
        const i = selIndex; const src = slides[i];
        if (i < 0) break;
        const ns = { id: uid("c"), imageUrl: src.imageUrl };
        setSlides(c => { const a = [...c]; a.splice(i + 1, 0, ns); return a; });
        setSlideOptsById(c => ({ ...c, [ns.id]: { ...(c[id] || {}) } }));
        setSelId(ns.id); flash("⧉ Diduplikat");
        break;
      }
      case "ganti": setModal("ganti"); break;
      case "teks": startTextEdit(id); break;
      case "stiker": setTool("stiker"); break;
      case "speed": setTool("speed"); break;
      case "transisi": setTool("transisi"); break;
    }
  }

  /* ---------- AKSI KLIP ---------- */
  function doSplitAtPlayhead() {
    const tl = timelineRef.current; if (!tl || !slidesRef.current.length) return;
    const t = Math.min(curT, tl.total - 0.001);
    const L = locate(tl, t);
    const i = L.idx; const sid = slidesRef.current[i].id;
    const d = tl.durs[i];
    const local = t - tl.starts[i];
    if (local < 0.15 || d - local < 0.15) { flash("⚠️ Geser playhead ke tengah klip dulu (min 0,15d dari ujung)"); return; }
    pushHist();
    const speed = slideOptsById[sid]?.speed || 1;
    const src = slidesRef.current[i];
    const left: Slide = { id: uid("c"), imageUrl: src.imageUrl };
    const right: Slide = { id: uid("c"), imageUrl: src.imageUrl };
    const oldOpts = { ...(slideOptsById[sid] || {}) };
    const leftOpts: SlideOpt = { ...oldOpts, dur: local * speed, trans: "none", animOut: "none" };
    const rightOpts: SlideOpt = { ...oldOpts, dur: (d - local) * speed, animIn: "none" };
    setSlides(c => { const a = [...c]; a.splice(i, 1, left, right); return a; });
    setSlideOptsById(c => {
      const n = { ...c };
      delete n[sid];
      n[left.id] = leftOpts;
      n[right.id] = rightOpts;
      return n;
    });
    setSelId(left.id);
    flash("╫ Klip dibagi di posisi playhead");
  }
  function removeSlideAt(i: number) {
    pushHist();
    setSlides(c => c.filter((_, k) => k !== i));
  }
  function moveSlide(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    pushHist();
    setSlides(c => { const a = [...c]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  }
  function trimSlide(id: string, targetEffDur: number) {
    const sp = slideOptsById[id]?.speed || 1;
    setOpt(id, { dur: clampN(targetEffDur, 0.4, 60) * sp });
  }

  /* ---------- MEDIA ---------- */
  function cropToRatio(img: HTMLImageElement, ar: number, maxSide = 1280): string {
    const w = img.naturalWidth, h = img.naturalHeight; const ir = w / h;
    let cw = w, ch = h;
    if (ir > ar) cw = h * ar; else ch = w / ar;
    const outW = ar >= 1 ? maxSide : Math.round(maxSide * ar);
    const outH = ar >= 1 ? Math.round(maxSide / ar) : maxSide;
    const c = document.createElement("canvas"); c.width = outW; c.height = outH;
    const cx = c.getContext("2d")!;
    cx.fillStyle = "#000"; cx.fillRect(0, 0, outW, outH);
    cx.drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, outW, outH);
    return c.toDataURL("image/jpeg", 0.88);
  }
  function addImageFiles(files: FileList | null, replaceId?: string) {
    if (!files || !files.length) return;
    pushHist();
    const ar = ratio === "9:16" ? 9 / 16 : ratio === "1:1" ? 1 : 16 / 9;
    Promise.all(Array.from(files).slice(0, 14).map(f => new Promise<Slide>((res) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => res({ id: uid("up"), imageUrl: cropToRatio(img, ar) });
        img.onerror = () => res({ id: uid("bad"), imageUrl: "" });
        img.src = r.result as string;
      };
      r.readAsDataURL(f);
    }))).then(ss => {
      ss = ss.filter(s => s.imageUrl);
      if (!ss.length) return;
      if (replaceId) {
        setSlides(c => c.map(s => s.id === replaceId ? { ...s, imageUrl: ss[0].imageUrl } : s));
        flash("⇄ Media diganti");
      } else {
        setSlides(c => [...c, ...ss]);
        flash(`✅ ${ss.length} media ditambahkan`);
      }
    });
  }
  async function genImageForClip(prompt: string, style: string, replaceId?: string) {
    setLoading("image"); setError("");
    try {
      const res = await fetch("/api/hcnsec/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, title: prompt, style, niche }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
      const durl: string = data.url;
      const img = await new Promise<HTMLImageElement>((res2, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res2(im); im.onerror = () => rej(new Error("gagal memuat")); im.src = durl; });
      const ar = ratio === "9:16" ? 9 / 16 : ratio === "1:1" ? 1 : 16 / 9;
      const cropped = cropToRatio(img, ar);
      pushHist();
      if (replaceId) setSlides(c => c.map(s => s.id === replaceId ? { ...s, imageUrl: cropped } : s));
      else setSlides(c => [...c, { id: uid("ai"), imageUrl: cropped }]);
      flash("✨ Gambar AI siap");
      setModal(null);
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }

  /* ---------- AUDIO ---------- */
  function getAudioDuration(url: string): Promise<number> {
    return new Promise(res => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => res(0);
      a.src = proxifyAudioUrl(url);
    });
  }
  function uploadMusic(f: File | undefined) {
    if (!f) return;
    if (f.size > 18 * 1024 * 1024) return setErr({ message: "File musik terlalu besar (maks 18MB)" });
    const r = new FileReader();
    r.onload = () => { setMusicUrl(r.result as string); setMusicName(f.name.replace(/\.[^.]+$/, "").slice(0, 40)); flash("🎵 Musik ditambahkan"); };
    r.readAsDataURL(f);
  }
  async function mixAudioUrls(parts: { url: string; gain: number; fadeIn?: number; fadeOut?: number }[]): Promise<string | null> {
    try {
      setStageText("Menggabungkan audio...");
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const bufs = await Promise.all(parts.map(p => fetch(p.url).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b.slice(0)))));
      const maxLen = Math.max(...bufs.map(b => b.length));
      const sr = bufs[0].sampleRate; const ch = Math.min(2, bufs[0].numberOfChannels);
      const out = actx.createBuffer(ch, maxLen, sr);
      for (let c = 0; c < ch; c++) {
        const od = out.getChannelData(c);
        for (let bi = 0; bi < bufs.length; bi++) {
          const b = bufs[bi]; const d = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
          const p = parts[bi]; const g = p.gain;
          const fi = Math.max(0, p.fadeIn || 0), fo = Math.max(0, p.fadeOut || 0);
          const durS = d.length / sr;
          for (let i = 0; i < d.length; i++) {
            let v = g;
            if (fi > 0 || fo > 0) {
              const t = i / sr;
              if (fi > 0 && t < fi) v *= t / fi;
              if (fo > 0 && t > durS - fo) v *= Math.max(0, (durS - t) / fo);
            }
            od[i] = Math.max(-1, Math.min(1, od[i] + d[i] * v));
          }
        }
      }
      const wav = bufferToWav(out); actx.close();
      return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    } catch { return parts[0]?.url || null; }
  }
  async function doTTS(text: string, voice: string) {
    setLoading("tts"); setError("");
    try {
      const r = await fetch("/api/hcnsec/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3500), voice }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || `Error ${r.status}`);
      setTtsUrl(data.url); setTtsText(text.slice(0, 3500));
      flash("🗣️ Narasi AI siap — masuk track audio");
      setModal(null);
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }
  async function doEkstrak(f: File | undefined) {
    if (!f) return;
    setLoading("ekstrak"); setStageText("Mengekstrak audio dari video...");
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AC();
      const buf = await actx.decodeAudioData(await f.arrayBuffer()).catch(() => null);
      if (!buf) throw new Error("Audio di video ini tidak bisa dibaca (codec tak didukung).");
      const wav = bufferToWav(buf);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      setMusicUrl(url); setMusicName(f.name.replace(/\.[^.]+$/, "").slice(0, 40));
      actx.close();
      flash("🎬 Audio dari video berhasil diekstrak");
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 100);
  }
  /* ---------- SUNO ---------- */
  async function doSuno() {
    const title = mTitle.trim() || projTitle;
    const style = mStyle.trim() || [mGenre, mMood, "indonesian, high quality"].join(", ");
    const lyr = mLyrics.trim();
    if (!title) return setErr({ message: "Judul lagu kosong" });
    if (mVocal !== "instrumental" && lyr.length < 20) return setErr({ message: "Lirik terlalu pendek (min ~20 karakter) atau pilih instrumen" });
    setLoading("suno"); setMStatus("memulai..."); setError("");
    try {
      const payload = {
        title: title.slice(0, 80), prompt: style, lyrics: mVocal === "instrumental" ? undefined : lyr,
        genre: mGenre, tags: style, custom: lyr.length > 30, model: mModel,
        instrumental: mVocal === "instrumental",
        _raw_title: title, _raw_lyrics: lyr, _raw_style: style,
      };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sunoKey) { headers["X-Suno-Key"] = sunoKey; headers["X-Suno-Provider"] = sunoProv; }
      const r = await fetch("/api/hcnsec/music", { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || data.message || `Error ${r.status}`);
      const id = data.taskId || data.task_id || data.id;
      if (!id) throw new Error("Server tidak kasih taskId — coba lagi.");
      setMTask(id);
      try { localStorage.setItem(SUNO_TASK_KEY, JSON.stringify({ id, title, ts: Date.now() })); } catch {}
      setMStatus("pending");
      flash("⏳ Lagu diolah server (1–6 mnt) — polling otomatis jalan");
      pollSuno(id, headers);
    } catch (e: any) { setErr(e); setMStatus("gagal"); }
    setLoading(null);
  }
  async function pollSuno(id: string, headers?: Record<string, string>) {
    const hdrs = headers || (sunoKey ? { "X-Suno-Key": sunoKey, "X-Suno-Provider": sunoProv } : {});
    setMStatus("pending");
    let tries = 0;
    const itv = setInterval(async () => {
      tries++;
      try {
        const pr = await fetch(`/api/hcnsec/music?id=${id}`, { headers: hdrs, cache: "no-store" });
        const pd = await pr.json().catch(() => ({}));
        const url = pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
        if (url) {
          clearInterval(itv);
          setMusicUrl(url); setMusicName(mTitle || "Lagu AI");
          setMStatus("selesai"); setMTask("");
          try { localStorage.removeItem(SUNO_TASK_KEY); } catch {}
          flash("✅ Lagu AI selesai — masuk track audio");
        } else if (pd.status === "error" || pd.error) {
          clearInterval(itv); setMStatus("gagal"); setErr({ message: pd.error || "Gagal generate" });
        } else if (tries > 40) { // ~2 menit
          clearInterval(itv); setMStatus("pending");
          setStageText("⏳ Masih diolah server — task tersimpan, buka lagi Musik AI utk cek status");
          setTimeout(() => setStageText(""), 3000);
        }
      } catch { if (tries > 40) clearInterval(itv); }
    }, 8000);
  }
  async function cekSuno() { if (mTask) pollSuno(mTask); }

  /* ---------- KETERANGAN OTOMATIS ---------- */
  async function doAutoCaptions() {
    setLoading("cc"); setError("");
    try {
      const tpl = CC_TEMPLATES.find(t => t.id === ccTpl) || CC_TEMPLATES[0];
      setCapStyle(tpl.capStyle as any);
      const srcUrl = ccFrom === "suara" ? (ttsUrl || voiceUrl) : musicUrl;
      if (!srcUrl) throw new Error(ccFrom === "suara" ? "Belum ada suara (TTS/rekaman). Buat di menu Audio dulu." : "Belum ada musik di track.");
      const dur = await getAudioDuration(srcUrl);
      if (!dur) throw new Error("Durasi audio tidak terbaca.");

      if (ccFrom === "suara" && ttsText.trim() && (srcUrl === ttsUrl)) {
        // AKURAT: teks diketahui → distribusi waktu per karakter
        const sentences = ttsText.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
        const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
        let acc = 0.12;
        const words: CapWord[] = [];
        sentences.forEach((s, li) => {
          const seg = Math.max(0.7, (s.length / totalChars) * (dur - 0.3));
          const ws = s.split(/\s+/).filter(Boolean);
          const wchars = ws.reduce((a, w) => a + w.length, 0) || 1;
          let wacc = acc;
          ws.forEach(w => {
            const wd = (w.length / wchars) * seg;
            words.push({ text: w, start: wacc, end: wacc + wd, line: li });
            wacc += wd;
          });
          acc += seg;
        });
        pushHist();
        setCapWords(words);
        flash(`💬 ${sentences.length} baris keterangan dibuat (sinkron narasi)`);
      } else {
        // speech recognition live (Chrome)
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) throw new Error("Browser ini belum dukung transkripsi otomatis. Pakai Chrome Android/PC, atau audio TTS yang teksnya diketahui.");
        const rec = new SR();
        rec.lang = ccLang; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
        const words: CapWord[] = [];
        let lineNo = 0;
        let lastEndAt = 0; let lastStartAt = 0;
        rec.onresult = (ev: any) => {
          const now = performance.now() / 1000 - t0;
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (!ev.results[i].isFinal) continue;
            const txt = ev.results[i][0].transcript.trim();
            if (!txt) continue;
            const segStart = lastEndAt || Math.max(0.1, lastStartAt);
            const segEnd = Math.max(segStart + 0.6, now - 0.35);
            txt.split(/\s+/).forEach((w: string, wi: number, arr: string[]) => {
              const a = segStart + (segEnd - segStart) * (wi / arr.length);
              const b = segStart + (segEnd - segStart) * ((wi + 1) / arr.length);
              words.push({ text: w, start: a, end: b, line: lineNo });
            });
            lastEndAt = segEnd; lineNo++;
          }
        };
        const a = new Audio(proxifyAudioUrl(srcUrl));
        const t0 = performance.now() / 1000;
        setStageText("🎧 Mendengarkan audio & menulis keterangan... (jangan tutup)");
        await new Promise<void>((res) => {
          a.onended = () => res();
          a.onerror = () => res();
          a.currentTime = 0;
          a.play().then(() => { try { rec.start(); } catch {} }).catch(() => res());
          lastStartAt = 0.1;
          setTimeout(res, (dur + 2) * 1000);
        });
        try { rec.stop(); } catch {}
        if (!words.length) throw new Error("Tidak ada ucapan terdeteksi. Pastikan suara jelas & volume nyala.");
        pushHist();
        setCapWords(words);
        flash(`💬 ${lineNo} baris keterangan terdeteksi (eksperimen — cek hasilnya)`);
      }
      setModal(null); setTool(null);
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 100);
  }
  function clearCaptions() { pushHist(); setCapWords([]); flash("Keterangan dihapus"); }

  /* ---------- AKHIRAN (outro) ---------- */
  function makeOutroImage(txt: string): string {
    const ar = ratio === "9:16" ? [720, 1280] : ratio === "1:1" ? [1080, 1080] : [1280, 720];
    const c = document.createElement("canvas"); c.width = ar[0]; c.height = ar[1];
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#0b3b3a"); g.addColorStop(1, "#0b0b14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 2;
    for (let i = -8; i < 14; i++) { ctx.beginPath(); ctx.moveTo(i * 120, 0); ctx.lineTo(i * 120 + 400, c.height); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#19c2b8";
    ctx.font = `900 ${Math.round(c.width * 0.09)}px 'Anton',Impact,sans-serif`;
    ctx.fillText("VERVE", c.width / 2, c.height * 0.42);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `600 ${Math.round(c.width * 0.032)}px 'Poppins',sans-serif`;
    ctx.fillText(txt || "Terima kasih sudah menonton 🙏", c.width / 2, c.height * 0.55);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = `600 ${Math.round(c.width * 0.024)}px 'Poppins',sans-serif`;
    ctx.fillText("dibuat dengan VERVE di HP 📱", c.width / 2, c.height * 0.62);
    return c.toDataURL("image/jpeg", 0.85);
  }
  function addOutro() {
    pushHist();
    const txt = prompt("Teks penutup:", "Terima kasih sudah menonton 🙏");
    if (txt === null) return;
    const o = { id: uid("outro"), imageUrl: makeOutroImage(txt) };
    setSlides(c => [...c, o]);
    setOpt(o.id, { dur: 2.2, trans: "fadeblack" });
    flash("🏁 Akhiran ditambahkan");
  }

  /* ---------- TEKS ---------- */
  const [textEditingId, setTextEditingId] = useState("");
  function startTextEdit(id?: string) {
    let sid = id || selId;
    if (!sid) {
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      sid = L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id || "";
      if (sid) setSelId(sid);
    }
    if (!sid) return;
    const cur = slideOptsById[sid]?.text;
    if (!cur) setOpt(sid, { text: { ...DEFAULT_TEXT, txt: "" } });
    setTextEditingId(sid);
    setTool("teksedit"); setClipBar(false);
  }
  function setTextObj(id: string, patch: Partial<ClipText>) {
    const cur = slideOptsById[id]?.text || { ...DEFAULT_TEXT };
    setOpt(id, { text: { ...cur, ...patch } });
  }

  /* ---------- STIKER ---------- */
  function addSticker(emoji: string, img?: string) {
    let sid = selId;
    if (!sid) {
      const tl = timelineRef.current;
      const L = tl ? locate(tl, Math.min(curT, Math.max(0, tl.total - 0.01))) : null;
      sid = L ? slidesRef.current[L.idx]?.id : slidesRef.current[0]?.id || "";
      if (sid) setSelId(sid);
    }
    if (!sid) { flash("Tambahkan klip dulu"); return; }
    const cur = slideOptsById[sid]?.stickers || [];
    const st: StickerItem = { id: uid("st"), emoji, x: 0.5, y: emoji.startsWith("@") ? 0.72 : 0.4, size: emoji.startsWith("@") ? 0.07 : 0.12, rot: 0, img };
    setOpt(sid, { stickers: [...cur, st] } as Partial<SlideOpt>);
    flash(img ? "🖼️ Overlay foto ditambahkan (seret di layar!)" : `${emoji.startsWith("@") ? "✨ Stiker animasi" : emoji} ditambahkan — seret di layar!`);
  }
  function moveSticker(sid: string, stid: string, x: number, y: number) {
    const stks = (slideOptsById[sid]?.stickers || []).map(s => s.id === stid ? { ...s, x: clampN(x, 0.05, 0.95), y: clampN(y, 0.05, 0.95) } : s);
    setOpt(sid, { stickers: stks } as Partial<SlideOpt>);
  }
  function delSticker(sid: string, stid: string) {
    setOpt(sid, { stickers: (slideOptsById[sid]?.stickers || []).filter(s => s.id !== stid) } as Partial<SlideOpt>);
  }
  function uploadOverlayImg(f: FileList | null) {
    if (!f || !f.length) return;
    const r = new FileReader();
    r.onload = () => addSticker("@img", r.result as string ? (r.result as string) : undefined);
    r.readAsDataURL(f[0]);
  }

  /* ---------- METADATA YOUTUBE ---------- */
  const [meta, setMeta] = useState<any | null>(null);
  const [copiedFld, setCopiedFld] = useState("");
  async function genMetadata() {
    setLoading("meta"); setError(""); setMeta(null);
    try {
      const r = await fetch("/api/hcnsec/metadata", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: projTitle, keyword: niche || projTitle, niche: niche || projTitle }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `Error ${r.status}`);
      setMeta(d);
      flash("📋 Metadata YouTube dibuat");
    } catch (e: any) { setErr(e); }
    setLoading(null);
  }
  async function copyFld(k: string, t: string) {
    if (await copyTxt(t)) { setCopiedFld(k); setTimeout(() => setCopiedFld(""), 1400); }
  }
  function downloadMetaTxt() {
    if (!meta) return;
    const txt = `=== JUDUL (High CTR) ===\n${meta.titleHighCTR || ""}\n\n=== ALTERNATIF ===\n${(meta.titleAlternatives || []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}\n\n=== DESKRIPSI ===\n${meta.description || ""}\n\n=== TAGS ===\n${(meta.tags || []).join(", ")}\n\n=== HASHTAGS ===\n${meta.hashtags || ""}\n\nDibuat dengan VERVE`;
    downloadBlob(new Blob([txt], { type: "text/plain;charset=utf-8" }), `meta_${Date.now()}.txt`);
  }

  /* ---------- RENDER VIDEO ---------- */
  async function doRender() {
    if (!slides.length) return setErr({ message: "Belum ada media — tambahkan klip dulu" });
    setLoading("render"); setError(""); setProgress(0);
    setVideoUrl(u => { if (u) URL.revokeObjectURL(u); return ""; });
    setVideoBlob(null);
    setStageText("Menyiapkan render...");
    try {
      await ensureFontsLoaded().catch(() => {});
      const duck = (ttsUrl || voiceUrl) ? 0.4 : 1; // musik diturunkan tipis kalau ada suara
      const parts: { url: string; gain: number; fadeIn?: number; fadeOut?: number }[] = [];
      if (musicUrl) parts.push({ url: proxifyAudioUrl(musicUrl), gain: musicVol * duck, fadeIn: musicFadeIn, fadeOut: musicFadeOut });
      if (ttsUrl) parts.push({ url: proxifyAudioUrl(ttsUrl), gain: voiceVol });
      if (voiceUrl) parts.push({ url: proxifyAudioUrl(voiceUrl), gain: voiceVol });
      let audioUrl: string | null = null;
      const single = parts.length === 1 ? parts[0] : null;
      const singleClean = single && Math.abs(single.gain - 1) < 0.01 && !single.fadeIn && !single.fadeOut;
      if (singleClean) audioUrl = single!.url;
      else if (parts.length >= 1) audioUrl = await mixAudioUrls(parts);

      const orderedOpts: SlideOpt[] = slides.map(s => {
        const o = { ...(slideOptsById[s.id] || {}) } as SlideOpt;
        if (o.text && !o.text.txt?.trim()) delete o.text;
        return o;
      });
      const gf = buildClipFilter(filterPreset, qualitySharp ? { ...adj } : adj);
      const resMap: Record<number, [number, number]> = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
      const [w, h] = resMap[exRes] || [1280, 720];
      const blob = await renderSlideshow({
        images: slides.map(s => s.imageUrl),
        audioUrl: audioUrl || undefined,
        slideDuration,
        transitionDuration: transitionDur,
        slideOpts: orderedOpts,
        videoFilter: gf === "none" ? undefined : gf,
        vignetteStrength: clampN((adj.vig / 100) * 0.8, 0, 1),
        grainAmt: adj.grain,
        vizStyle: "minimal" as any, vizColor: "#19c2b8",
        lyrics: undefined,
        captions: capWords.length ? capWords as any : undefined,
        captionStyle: (capWords.length ? capStyle : "none") as any,
        quality: "high", ratio, aspectRatio: ratio,
        transition: "fade" as any,
        showTitle: false, showLyrics: false,
        custom: { w, h, fps: exFps, videoBitrate: exMbps * 1_000_000 },
        bgMode, bgColor,
        sharpen: qualitySharp,
        mobileOptimized: isMobile,
        onProgress: (p: number) => { setProgress(p); if (p > 0.02 && p < 0.98) setStageText(`Rendering ${Math.round(p * 100)}%`); },
        onStage: (s: string) => setStageText(s),
      } as any);
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setProgress(1); flash("✅ Video selesai!");
      persistSnapshot(true);
      genMetadata().catch(() => {});
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 2500);
  }
  async function doRenderGif() {
    if (!slides.length) return setErr({ message: "Belum ada media" });
    if ((timeline?.total || 0) > 8.2) { if (!confirm("GIF dibatasi 8 detik pertama. Lanjut?")) return; }
    setLoading("gif"); setError(""); setProgress(0);
    setStageText("Merangkai GIF...");
    try {
      await ensureFontsLoaded().catch(() => {});
      const orderedOpts = slides.map(s => ({ ...(slideOptsById[s.id] || {}) } as SlideOpt));
      const gf = buildClipFilter(filterPreset, adj);
      const blob = await renderGif({
        images: slides.map(s => s.imageUrl),
        slideOpts: orderedOpts as any,
        slideDuration, transition, transitionDur,
        ratio, videoFilter: gf === "none" ? undefined : gf,
        grainAmt: adj.grain, bgMode, bgColor,
        onProgress: (p: number) => setProgress(p),
      } as any);
      downloadBlob(blob, `verve_${Date.now()}.gif`);
      flash("✅ GIF terunduh");
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 1500);
  }
  function downloadVideo() {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(videoBlob, `${projTitle.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 40) || "verve"}_${Date.now()}.${ext}`);
  }

  /* ---------- WIZARD AI ---------- */
  const [wzNiche, setWzNiche] = useState("");
  const [wzN, setWzN] = useState(4);
  const [wzStyle, setWzStyle] = useState("cinematic");
  const [wzAudio, setWzAudio] = useState<"none" | "tts" | "suno">("tts");
  async function runWizard() {
    if (!wzNiche.trim()) return setErr({ message: "Isi ide/niche dulu bro" });
    setLoading("wizard"); setError("");
    try {
      setNiche(wzNiche);
      setStageText("🧠 Menulis judul...");
      const kr = await fetch("/api/hcnsec/titles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: wzNiche, niche: wzNiche, n: 1 }) });
      const kd = await kr.json().catch(() => ({}));
      const title = (kd.titles?.[0] || wzNiche).slice(0, 90);
      setProjTitle(title);
      setStageText(`🎨 Generate ${wzN} gambar AI...`);
      const newSlides: Slide[] = [];
      for (let i = 0; i < wzN; i++) {
        setStageText(`🎨 Gambar ${i + 1}/${wzN}...`);
        try {
          const res = await fetch("/api/hcnsec/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, keyword: wzNiche, niche: wzNiche, style: wzStyle }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error) continue;
          const img = await new Promise<HTMLImageElement>((res2, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res2(im); im.onerror = rej; im.src = data.url; });
          const ar = ratio === "9:16" ? 9 / 16 : ratio === "1:1" ? 1 : 16 / 9;
          newSlides.push({ id: uid("ai"), imageUrl: cropToRatio(img, ar) });
        } catch {}
      }
      if (!newSlides.length) throw new Error("Semua gambar gagal dibuat — coba style Studio atau upload manual.");
      pushHist();
      setSlides(newSlides);
      if (wzAudio === "tts") {
        setStageText("📝 Menulis naskah narasi...");
        try {
          const sr = await fetch("/api/hcnsec/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, keyword: wzNiche, slides: wzN }) });
          const sd = await sr.json().catch(() => ({}));
          const text = (sd.lines || []).join(" ").trim();
          if (text) {
            setTtsText(text);
            setStageText("🗣️ Membuat suara narasi...");
            const tr = await fetch("/api/hcnsec/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3500), voice: "nova" }) });
            const td = await tr.json().catch(() => ({}));
            if (td.url) { setTtsUrl(td.url); }
          }
        } catch {}
      } else if (wzAudio === "suno") {
        setStageText("🎼 Menulis lirik lagu...");
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const lr = await fetch("/api/hcnsec/lyrics", { method: "POST", headers, body: JSON.stringify({ title, keyword: wzNiche, niche: wzNiche, genre: mGenre, mood: mMood }) });
          const ld = await lr.json().catch(() => ({}));
          if (ld.lyrics) setMLyrics(ld.lyrics);
          if (ld.title) setMTitle(ld.title.slice(0, 80)); else setMTitle(title);
          setMStyle(ld.style_prompt_suno || [mGenre, mMood, "indonesian"].join(", "));
          setTimeout(() => doSuno(), 300);
        } catch {}
      }
      setModal(null);
      flash(`✅ Proyek "${title.slice(0, 30)}" siap diedit!`);
    } catch (e: any) { setErr(e); }
    setLoading(null); setTimeout(() => setStageText(""), 2000);
  }

  /* ================= UI (JSX) ================= */
  const uhdLabel = exRes >= 1440 ? (exRes === 1440 ? "2K" : "4K") : `${exRes}p`;
  const estMB = (exMbps * 1_000_000 / 8) * Math.max(clipsTotal, 1) / (1024 * 1024);
  void histTick;

  function stagePoint(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = canvasRef.current; if (!cv) return null;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  const dragSt = useRef<{ sid: string; stid: string } | null>(null);
  const dragTx = useRef<{ sid: string } | null>(null);
  function onStageDown(e: React.PointerEvent) {
    const pt = stagePoint(e); if (!pt) return;
    const tl = timelineRef.current;
    if (!tl || !slidesRef.current.length) return;
    const L = locate(tl, Math.min(curT, Math.max(0, tl.total - 0.001)));
    const sid = slidesRef.current[L.idx]?.id;
    if (!sid) return;
    // drag TEKS (posisi vertikal) kalau sentuh area teks
    const cts = slideOptsById[sid]?.text;
    if (cts?.txt?.trim() && Math.abs(pt.y - cts.y) < 0.07) {
      dragTx.current = { sid };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    const stks = slideOptsById[sid]?.stickers || [];
    for (let i = stks.length - 1; i >= 0; i--) {
      const s = stks[i];
      const rx = (s.size + 0.03) * (canvasRef.current!.height / canvasRef.current!.width) * 2;
      if (Math.abs(pt.x - s.x) < Math.max(0.09, rx) && Math.abs(pt.y - s.y) < s.size + 0.06) {
        dragSt.current = { sid, stid: s.id };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }
    }
    // tap kosong → pilih klip di playhead
    setSelId(sid);
  }
  function onStageMove(e: React.PointerEvent) {
    const pt = stagePoint(e); if (!pt) return;
    if (dragTx.current) {
      const sid = dragTx.current.sid;
      const cur = slideOptsById[sid]?.text || { ...DEFAULT_TEXT };
      setOpt(sid, { text: { ...cur, y: clampN(pt.y, 0.06, 0.94) } });
      return;
    }
    if (!dragSt.current) return;
    moveSticker(dragSt.current.sid, dragSt.current.stid, pt.x, pt.y);
  }
  function onStageUp() { dragSt.current = null; dragTx.current = null; }

  return (
    <div className="v6e-root">
      {/* ============ TOPBAR ============ */}
      <header className="v6e-top">
        <button className="v6e-tbtn" title="Tutup" onClick={() => { persistSnapshot(true); stopPreview(); onExit(); }}>✕</button>
        <button className="v6e-tbtn" title="Cari alat" onClick={() => flash("🔍 Ketuk alat di toolbar bawah ya bro")}>🔍</button>
        <button className="v6e-tbtn" title="Judul proyek" onClick={() => {
          const t = prompt("Judul proyek:", projTitle);
          if (t !== null) { setProjTitle(t.slice(0, 80) || "Proyek Tanpa Judul"); persistSnapshot(true); }
        }}>✏️</button>
        <div className="spacer" />
        <button className="v6e-tbtn" title="Simpan" onClick={() => persistSnapshot(true)}>💾</button>
        <button className="v6e-uhd" onClick={() => { setTool("ekspor"); setSheetTab(""); }}>
          {qualitySharp ? "UHD ✨" : uhdLabel} <span className="dd">▾</span>
        </button>
        <button className="v6e-export" onClick={() => { setTool("ekspor"); setSheetTab(""); setExTab("video"); }} disabled={!slides.length}>Ekspor</button>
      </header>

      {/* ============ STAGE ============ */}
      <div className={`v6e-stage-wrap ${fullStage ? "" : ""}`} ref={stageWrapRef}
           style={fullStage ? { position: "fixed", inset: 0, zIndex: 55, background: "#000" } : undefined}
           onClick={fullStage ? () => setFullStage(false) : undefined}>
        <div className="v6e-stage">
          <canvas ref={canvasRef}
            onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp}
            style={{ touchAction: "none" }} />
          <div className={`selbox ${selId ? "on" : ""}`} />
          {!slides.length && (
            <div className="v6e-stage-empty">
              <div style={{ fontSize: 40 }}>🎬</div>
              <div style={{ fontSize: 12 }}>Tambahkan media untuk mulai mengedit</div>
              <button onClick={() => setTool("media")}>＋ Tambah media</button>
            </div>
          )}
        </div>
      </div>

      {/* ============ CONTROL ROW ============ */}
      <div className="v6e-ctrl">
        <button className="cbtn" title="Layar penuh" onClick={() => setFullStage(v => !v)}>⛶</button>
        <button className="cbtn play" onClick={togglePreview} disabled={!slides.length}>{playing ? "⏸" : "▷"}</button>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className={`cbtn ${pipOn ? "" : ""}`} title="Penanda REC" onClick={() => setPipOn(v => !v)}>
            🎦<span className="mini">{pipOn ? "ON" : "OFF"}</span>
          </button>
          <button className="cbtn" onClick={undo} disabled={!canUndo} title="Urungkan">↶</button>
          <button className="cbtn" onClick={redo} disabled={!canRedo} title="Ulangi">↷</button>
        </div>
      </div>

      {/* ============ WAKTU + RULER ============ */}
      <div className="v6e-timerow">
        <span><b>{formatDur(curT)}</b> / {formatDur(durT)}</span>
        <div className="v6e-ruler">
          {Array.from({ length: 30 }).map((_, i) => (
            <i key={i} className={i % 5 === 0 ? "big" : ""} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={`t${i}`} style={{ position: "absolute", fontSize: 9, left: `${12 + i * (86 / 4)}%`, color: "#6b7280", fontWeight: 600 }}>
              {formatDur((durT || clipsTotal || 0) * (i / 4))}
            </span>
          ))}
        </div>
      </div>

      {/* ============ TIMELINE ============ */}
      <TimelineV6
        slides={slides} slideOptsById={slideOptsById} timeline={timeline} selId={selId} curT={curT} playing={playing}
        musicUrl={musicUrl} musicName={musicName} ttsUrl={ttsUrl} voiceUrl={voiceUrl}
        onSel={(id: string) => { setSelId(id); setClipBar(true); }}
        onTrim={(id: string, d: number) => trimSlide(id, d)}
        onMove={moveSlide}
        onSeek={(t: number) => seekPreview(t)}
        onAddClip={() => setTool("media")}
        onAddAudio={() => { setTool("audio"); }}
        onDelAudio={() => { pushHist(); setMusicUrl(""); setMusicName(""); setTtsUrl(""); setVoiceUrl(""); setCapWords([]); flash("🗑 Track audio dikosongkan"); }}
        onAddText={() => startTextEdit()}
        onEditText={(sid: string) => startTextEdit(sid)}
        onAddOutro={addOutro}
        onTrans={(sid: string) => { setSelId(sid); setClipBar(true); onClipTool("transisi"); }}
        onMute={() => setAudMuted(v => !v)} audMuted={audMuted}
        onAiCut={() => {
          const src = musicUrl || ttsUrl || voiceUrl;
          if (!src || !slides.length) { flash("⚠️ Tambahkan audio & klip dulu"); return; }
          getAudioDuration(src).then(d => {
            if (!d) { flash("⚠️ Durasi audio tak terbaca"); return; }
            pushHist();
            const per = d / slides.length;
            const upd: Record<string, SlideOpt> = { ...slideOptsById };
            slides.forEach(s => { upd[s.id] = { ...(upd[s.id] || {}), dur: clampN(per, 0.4, 60) * (upd[s.id]?.speed || 1) }; });
            setSlideOptsById(upd);
            flash(`🤖 ${slides.length} klip otomatis pas durasi audio (${formatDur(d)})`);
          });
        }}
        onCover={() => setModal("sampul")}
        hapticSel={() => { setClipBar(true); }}
        transition={transition}
      />

      {/* ============ TOOLBAR ============ */}
      <div className="v6e-toolbar">
        {clipBar && selId ? (
          <div className="v6e-tools">
            <button className="v6e-tlbtn v6e-tlback" onClick={() => { setClipBar(false); setSelId(""); }}>‹<span>Tutup</span></button>
            {CLIP_TOOLS.map(t => (
              <button key={t.id} className="v6e-tlbtn" onClick={() => onClipTool(t.id)}>
                {t.icon}{t.bdg && <span className={`bdg ${t.bdgCls || ""}`}>{t.bdg}</span>}<span>{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="v6e-tools">
            {MAIN_TOOLS.map(t => (
              <button key={t.id} className={`v6e-tlbtn ${tool === t.id ? "on" : ""}`} disabled={t.disabled}
                onClick={() => {
                  if (t.disabled) { flash("👤 Avatar AI segera hadir di versi berikutnya 🙏"); return; }
                  onMainTool(t.id);
                }}>
                {t.icon}{t.bdg && <span className={`bdg ${t.bdgCls || ""}`}>{t.bdg}</span>}<span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ============ SHEETS & MODALS ============ */}
      {tool && tool !== "teksedit" && (
        <EditorSheets
          tool={tool} setTool={setTool} sheetTab={sheetTab} setSheetTab={setSheetTab}
          api={{
            slides, selId, selOpt, selIndex, setOpt, pushHist, setSlides, moveSlide, removeSlideAt,
            filterPreset, setFilterPreset, adj, setAdj, qualitySharp, setQualitySharp,
            presets, setPresets,
            ratio, setRatio, bgMode, setBgMode, bgColor, setBgColor,
            ccFrom, setCcFrom, ccLang, setCcLang, ccTpl, setCcTpl, ccSize, setCcSize, ccY, setCcY,
            capWords, capStyle, doAutoCaptions, clearCaptions,
            addSticker, delSticker, uploadOverlayImg, moveSticker,
            slideOptsById,
            exTab, setExTab, exRes, setExRes, exFps, setExFps, exMbps, setExMbps,
            estMB, clipsTotal, doRender, doRenderGif, downloadVideo, videoUrl, videoBlob, progress, loading, stageText,
            openModal: setModal, addImageFiles, genImageForClip, uploadMusic, doEkstrak,
            musicUrl, hasVoice: !!(ttsUrl || voiceUrl),
            musicVol, setMusicVol, voiceVol, setVoiceVol, musicFadeIn, setMusicFadeIn, musicFadeOut, setMusicFadeOut,
            delAudio: () => { pushHist(); setMusicUrl(""); setMusicName(""); setTtsUrl(""); setVoiceUrl(""); setCapWords([]); setMusicVol(1); setVoiceVol(1); setMusicFadeIn(0); setMusicFadeOut(0); flash("🗑 Track audio dikosongkan"); },
            startTextEdit, doSplitAtPlayhead, trimSlide,
            slideDuration, setSlideDuration, transition, setTransition, transitionDur, setTransitionDur,
            captionStyle: capStyle, setCaptionStyle: setCapStyle,
            meta, genMetadata, copiedFld, copyFld, downloadMetaTxt, projTitle,
          }}
        />
      )}
      {tool === "teksedit" && textEditingId && (
        <TextEditSheet
          slideId={textEditingId}
          text={slideOptsById[textEditingId]?.text || { ...DEFAULT_TEXT }}
          onChange={(patch: Partial<ClipText>) => setTextObj(textEditingId, patch)}
          onDone={() => { setTool(null); setTextEditingId(""); persistSnapshot(); }}
          onDelete={() => { setOpt(textEditingId, { text: null } as Partial<SlideOpt>); setTool(null); setTextEditingId(""); }}
        />
      )}

      {/* modal-modul */}
      {modal === "rekam" && <RekamModal onClose={() => setModal(null)} onUse={(u: string) => { setVoiceUrl(u); setModal(null); flash("🎙️ Rekaman masuk track audio"); }} />}
      {modal === "tts" && <TtsModal initial={ttsText} onClose={() => setModal(null)} onGen={doTTS} loading={loading} voice={ttsVoice} setVoice={setTtsVoice} />}
      {modal === "musik" && <MusikModal
        onClose={() => setModal(null)} sunoKey={sunoKey} setSunoKey={setSunoKey} sunoProv={sunoProv} setSunoProv={setSunoProv}
        mTitle={mTitle} setMTitle={setMTitle} mLyrics={mLyrics} setMLyrics={setMLyrics} mStyle={mStyle} setMStyle={setMStyle}
        mGenre={mGenre} setMGenre={setMGenre} mMood={mMood} setMMood={setMMood} mModel={mModel} setMModel={setMModel}
        mVocal={mVocal} setMVocal={setMVocal} mTask={mTask} mStatus={mStatus} onGen={doSuno} onCek={cekSuno} loading={loading}
        musicUrl={musicUrl} />}
      {modal === "kamera" && <KameraModal onClose={() => setModal(null)} onPhoto={(dataUrl: string) => { pushHist(); setSlides(c => [...c, { id: uid("cam"), imageUrl: dataUrl }]); flash("📷 Foto masuk timeline"); }} />}
      {modal === "wizard" && <WizardModal onClose={() => setModal(null)} niche={wzNiche} setNiche={setWzNiche} n={wzN} setN={setWzN} styleId={wzStyle} setStyle={setWzStyle} audio={wzAudio} setAudio={setWzAudio} onRun={runWizard} loading={loading} stageText={stageText} />}
      {modal === "sampul" && <SampulModal slides={slides} slideOptsById={slideOptsById} timeline={timeline} ratio={ratio} getImage={getImage} onClose={() => setModal(null)} onSave={(dataUrl: string) => { setCoverThumb(dataUrl); persistSnapshot(true); setModal(null); flash("✏️ Sampul disimpan"); }} />}
      {modal === "ganti" && (
        <MiniModal title="⇄ Ganti media klip" onClose={() => setModal(null)}>
          <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
            📥 Pilih foto dari galeri
            <input type="file" accept="image/*" hidden onChange={e => { addImageFiles(e.target.files, selId); setModal(null); }} />
          </label>
          <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setModal("gambarai")}>✨ Generate dengan AI</button>
        </MiniModal>
      )}
      {modal === "gambarai" && <GambarAiModal onClose={() => setModal(null)} onGen={(pr: string, st: string) => genImageForClip(pr, st, selId || undefined)} loading={loading} />}
      {modal === "videoai" && <VideoAiModal onClose={() => setModal(null)} />}
      {modal === "hakcipta" && <HakCiptaModal musicUrl={musicUrl} musicName={musicName} ttsUrl={ttsUrl} voiceUrl={voiceUrl} onClose={() => setModal(null)} />}

      {/* toast & loading bar */}
      {!!stageText && <div style={{ position: "fixed", left: "50%", bottom: 118, transform: "translateX(-50%)", zIndex: 80, background: "rgba(10,10,14,.92)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "9px 16px", borderRadius: 999, maxWidth: "88vw", textAlign: "center" }}>{stageText}</div>}
      {!!error && <div style={{ position: "fixed", left: "50%", bottom: 118, transform: "translateX(-50%)", zIndex: 81, background: "rgba(90,15,15,.95)", border: "1px solid rgba(248,113,113,.5)", color: "#fecaca", fontSize: 11.5, fontWeight: 600, padding: "10px 16px", borderRadius: 14, maxWidth: "88vw", textAlign: "center" }} onClick={() => setError("")}>{error} ✕</div>}
    </div>
  );
}

/* ==================================================================
   TIMELINE v6 — rail kiri + 3 track + playhead + seek ruler
   ================================================================== */
const PXS = 56; // px per detik
function TimelineV6(p: any) {
  const { slides, slideOptsById, timeline, selId, curT, musicUrl, musicName, ttsUrl, voiceUrl } = p;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [halfW, setHalfW] = useState(160);
  const total = timeline?.total || 0;
  const contentW = Math.max(320, total * PXS + halfW * 2 + 16);
  const dragRef = useRef<{ kind: "trim" | "reorder"; i: number; startX: number; startDur: number; to?: number; moved?: boolean } | null>(null);
  const scrubHoldRef = useRef(false);
  const [, force] = useState(0);

  // ukur setengah lebar viewport → konten diberi ruang kiri-kanan supaya detik 0 & akhir bisa tepat di garis tengah
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const fit = () => setHalfW(el.clientWidth / 2);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // saat diputar: KONTEN yang bergerak di bawah garis penanda (garis tetap diam di tengah, ala CapCut)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !p.playing || scrubHoldRef.current) return;
    const target = clampN(curT * PXS, 0, Math.max(0, contentW - el.clientWidth));
    if (Math.abs(el.scrollLeft - target) > 0.5) el.scrollLeft = target;
  }, [curT, p.playing, contentW]);

  // saat tidak diputar: geser konten = geser waktu (garis tengah sebagai penanda posisi)
  function onTlScroll(e: any) {
    if (p.playing) return;
    const sl = e.target.scrollLeft;
    p.onSeek(clampN(sl / PXS, 0, Math.max(0, total - 0.01)));
  }

  function clipW(i: number): number { return Math.max(30, (timeline?.durs?.[i] || 0) * PXS); }

  function onClipDown(e: React.PointerEvent, i: number) {
    const sid = slides[i].id;
    p.onSel(sid);
    const target = e.target as HTMLElement;
    if (target.classList.contains("hdl")) return; // handle di-handle sendiri
    dragRef.current = { kind: "reorder", i, startX: e.clientX, startDur: 0, to: i, moved: false };
    target.setPointerCapture?.(e.pointerId);
  }
  function onClipMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "reorder") {
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 14) d.moved = true;
      if (d.moved) {
        const w = clipW(d.i) + 4;
        let to = d.i + Math.round(dx / w);
        to = clampN(to, 0, slides.length - 1);
        if (to !== d.to) { d.to = to; force(v => v + 1); }
      }
    }
  }
  function onClipUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.kind === "reorder" && d.moved && typeof d.to === "number") p.onMove(d.i, d.to);
  }
  function onHdlDown(e: React.PointerEvent, i: number) {
    e.stopPropagation();
    const sid = slides[i].id;
    p.onSel(sid);
    dragRef.current = { kind: "trim", i, startX: e.clientX, startDur: timeline?.durs?.[i] || 1 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onHdlMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.kind !== "trim") return;
    const nd = clampN(d.startDur + (e.clientX - d.startX) / PXS, 0.4, 90);
    p.onTrim(slides[d.i].id, nd);
  }
  function onHdlUp() { dragRef.current = null; }

  function rulerDown(e: React.PointerEvent) {
    const el = scrollRef.current; if (!el || !total) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left + el.scrollLeft - halfW;
    p.onSeek(clampN(x / PXS, 0, Math.max(0, total - 0.01)));
    const move = (ev: PointerEvent) => {
      const xx = ev.clientX - r.left + el.scrollLeft - halfW;
      p.onSeek(clampN(xx / PXS, 0, Math.max(0, total - 0.01)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  const secs = Math.ceil(total) + 1;

  const hasAudio = !!(musicUrl || ttsUrl || voiceUrl);
  const clipTexts = slides.map((s: Slide) => ({ s, t: slideOptsById[s.id]?.text })).filter((x: any) => x.t && x.t.txt?.trim());

  return (
    <div className="v6e-tl">
      <div className="v6e-tl-inner">
        {/* rail kiri */}
        <div className="v6e-tl-rail" style={{ paddingTop: 0 }}>
          <button className={`v6e-rail-tile ${p.audMuted ? "" : ""}`} onClick={p.onMute} title="Bisukan audio">
            {p.audMuted ? "🔇" : "🔊"}<span>{p.audMuted ? "Dibisukan" : "Bisukan audio"}</span>
          </button>
          <button className="v6e-rail-tile" onClick={p.onAiCut} title="Pemotong klip AI">
            ✂️<span>Pemotong klip AI</span><b className="new">New</b>
          </button>
          <button className="v6e-rail-tile" onClick={p.onCover} title="Sampul proyek">
            ✏️<span>Sampul</span>
          </button>
        </div>

        {/* tracks (garis penanda DIAM di tengah — konten yang bergerak di bawahnya) */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div className="v6e-tl-scrollwrap" ref={scrollRef} onScroll={onTlScroll}
            onPointerDown={() => { scrubHoldRef.current = true; }}
            onPointerUp={() => { scrubHoldRef.current = false; }}
            onPointerCancel={() => { scrubHoldRef.current = false; }}
            style={{ position: "absolute", inset: 0 }}>
            <div style={{ position: "relative", width: contentW, display: "flex" }}>
              <div style={{ width: halfW, flex: "0 0 auto" }} />
              <div style={{ position: "relative", flex: "0 0 auto" }}>
                {/* ruler detik */}
            <div style={{ height: 16, position: "relative", marginBottom: 2, touchAction: "none" }} onPointerDown={rulerDown}>
              {Array.from({ length: secs + 1 }).map((_, i) => (
                <span key={i} style={{ position: "absolute", left: i * PXS, top: 0, transform: "translateX(-4px)", fontSize: 8.5, color: "#6b7280", fontWeight: 600 }}>
                  {i % 2 === 0 ? formatDur(i) : "·"}
                </span>
              ))}
            </div>

            {/* TRACK 1: video */}
            <div className="v6e-track">
              {slides.map((s: Slide, i: number) => {
                const sel = s.id === selId;
                const isOutro = s.id.startsWith("outro");
                const d = dragRef.current;
                const ghost = d?.kind === "reorder" && d.moved && d.to === i && d.i !== i;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", position: "relative" }}>
                    <div
                      className={`v6e-clip ${sel ? "sel" : ""}`}
                      style={{ width: clipW(i), opacity: ghost ? 0.35 : 1 }}
                      onPointerDown={(e) => onClipDown(e, i)}
                      onPointerMove={onClipMove} onPointerUp={onClipUp}
                    >
                      {s.imageUrl ? <img src={s.imageUrl} alt="" draggable={false} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏁</div>}
                      <span className="dur">{(timeline?.durs?.[i] || 0).toFixed(1)}d</span>
                      {sel && <>
                        <span className="hdl l" onPointerDown={(e) => onHdlDown(e, i)} onPointerMove={onHdlMove} onPointerUp={onHdlUp}>❮</span>
                        <span className="hdl r" onPointerDown={(e) => onHdlDown(e, i)} onPointerMove={onHdlMove} onPointerUp={onHdlUp}>❯</span>
                      </>}
                      {i < slides.length - 1 && (() => {
                        const tr = canonicalTrans(slideOptsById[s.id]?.trans ?? p.transition ?? "dissolve");
                        const em = tr === "none" ? "✂" : ((TRANSITIONS as any[]).find(t => t.id === tr)?.emoji || "🔀");
                        return (
                          <span className={`v6e-trans-chip ${tr === "none" ? "off" : ""}`} title="Transisi — ketuk untuk ganti"
                            onClick={(e) => { e.stopPropagation(); p.onTrans(s.id); }}>{em}</span>
                        );
                      })()}
                    </div>
                    <div style={{ width: 4 }} />
                  </div>
                );
              })}
              {slides.length > 0 && (
                <button className="v6e-outro" onClick={p.onAddOutro} title="Akhiran">
                  🏁<span>Akhiran</span>
                </button>
              )}
              <button className="v6e-addclip" onClick={p.onAddClip}>＋</button>
            </div>

            {/* TRACK 2: audio */}
            <div className="v6e-track-add">
              {!hasAudio ? (
                <button className="v6e-track-addbtn" onClick={p.onAddAudio}><i>🎵</i> ＋ Tambahkan audio</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  {!!musicUrl && (
                    <div className="v6e-audioclip" onClick={p.onAddAudio} title="Musik">
                      <i style={{ fontStyle: "normal" }}>♪</i>
                      <span className="wv">{Array.from({ length: 16 }).map((_, k) => <i key={k} style={{ height: 5 + ((k * 37) % 16) }} />)}</span>
                      <span className="nm">{musicName || "Musik"}</span>
                    </div>
                  )}
                  {!!ttsUrl && <div className="v6e-audioclip" style={{ background: "linear-gradient(90deg,#7c3aed,#a855f7)", color: "#fff" }} onClick={p.onAddAudio}><span className="nm">🗣️ Narasi AI</span></div>}
                  {!!voiceUrl && <div className="v6e-audioclip" style={{ background: "linear-gradient(90deg,#b91c1c,#ef4444)", color: "#fff" }} onClick={p.onAddAudio}><span className="nm">🎙️ Rekaman</span></div>}
                  <button className="v6e-track-addbtn" style={{ minWidth: 42, width: 42, padding: 0 }} onClick={p.onAddAudio}>＋</button>
                  <button className="v6e-track-addbtn" style={{ minWidth: 42, width: 42, padding: 0 }} onClick={p.onDelAudio} title="Hapus audio">🗑</button>
                </div>
              )}
            </div>

            {/* TRACK 3: teks */}
            <div className="v6e-track-add">
              <button className="v6e-track-addbtn" onClick={p.onAddText}><i>🔤</i> ＋ Tambahkan teks</button>
              {clipTexts.map(({ s, t }: any) => (
                <button key={s.id} className="v6e-textchip" style={{ marginLeft: 6 }} onClick={() => p.onEditText(s.id)}>
                  “{String(t.txt).slice(0, 14)}{String(t.txt).length > 14 ? "…" : ""}”
                </button>
              ))}
            </div>

              </div>
              <div style={{ width: halfW, flex: "0 0 auto" }} />
            </div>
          </div>
          {/* garis penanda tetap di tengah layar */}
          {total > 0 && <div className="v6e-playhead-fixed" style={{ left: "50%" }} />}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   SHELL SHEET + KOMPONEN UI KECIL
   ================================================================== */
function SheetShell({ title, onClose, onOk, children, tall }: any) {
  return (
    <>
      <div className="v6-sheet-back" onClick={onClose} />
      <div className="v6-sheet" style={tall ? { maxHeight: "82dvh" } : undefined}>
        <div className="v6-sheet-head">
          <button className="x" onClick={onClose}>✕</button>
          <div className="t">{title}</div>
          {onOk ? <button className="v" onClick={onOk}>✓</button> : <div style={{ width: 34 }} />}
        </div>
        {children}
      </div>
    </>
  );
}
function TabBar({ tabs, cur, onPick }: { tabs: string[]; cur: string; onPick: (t: string) => void }) {
  return <div className="v6-tabs">{tabs.map(t => <button key={t} className={`v6-tab ${cur === t ? "on" : ""}`} onClick={() => onPick(t)}>{t}</button>)}</div>;
}
function ChipRow({ items, cur, onPick }: { items: { id: string; label: string }[]; cur: string; onPick: (id: string) => void }) {
  return <div className="v6-chips" style={{ padding: "10px 2px 2px" }}>{items.map(c => <button key={c.id} className={`v6-chip ${cur === c.id ? "on" : ""}`} onClick={() => onPick(c.id)}>{c.label}</button>)}</div>;
}
const ANIM_STICKER_PREVIEW: Record<string, string> = {
  "@ikuti": "🔴👆", "@like": "👍", "@lonceng": "🔔", "@rec": "🔴", "@wave": "🎚️", "@eq": "📶",
  "@butterfly": "🦋", "@confetti": "🎉", "@kaset": "📼", "@panah": "⬇️", "@love": "❤️", "@kilau": "✨",
  "@nada": "🎵", "@api": "🔥", "@subs": "👍🔔",
};

/* ==================================================================
   EDITOR SHEETS (semua panel alat)
   ================================================================== */
function EditorSheets({ tool, setTool, sheetTab, setSheetTab, api }: any) {
  const A = api;
  const close = () => setTool(null);

  /* ---------------- AUDIO ---------------- */
  if (tool === "audio") return (
    <SheetShell title="Audio" onClose={close}>
      <div className="v6-sheet-body">
        {AUDIO_MENU.map(m => {
          if (m.id === "upload") return (
            <label className="v6-cardrow" key={m.id}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">{m.label}</div><span className="arr">›</span>
              <input type="file" accept="audio/*" hidden onChange={e => { A.uploadMusic(e.target.files?.[0]); close(); }} />
            </label>
          );
          if (m.id === "ekstrak") return (
            <label className="v6-cardrow" key={m.id}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">Ekstrak audio dari file video (MP3)</div>
              {m.bdg && <span style={{ fontSize: 8.5, fontWeight: 800, background: "var(--v6-teal)", color: "#04211f", padding: "1px 7px", borderRadius: 999 }}>{m.bdg}</span>}
              <input type="file" accept="video/*,audio/*" hidden onChange={e => { A.doEkstrak(e.target.files?.[0]); close(); }} />
            </label>
          );
          return (
            <div className="v6-cardrow" key={m.id} onClick={() => {
              if (m.id === "rekam") A.openModal("rekam");
              else if (m.id === "tts") A.openModal("tts");
              else if (m.id === "musik") A.openModal("musik");
              else if (m.id === "hakcipta") A.openModal("hakcipta");
              else if (m.id === "hapusAudio") A.delAudio();
              close();
            }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="tt">{m.label}</div>
              {m.bdg && <span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>{m.bdg}</span>}
              <span className="arr">›</span>
            </div>
          );
        })}
        {(A.musicUrl || A.hasVoice) && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: .65, margin: "2px 2px 8px" }}>🔊 VOLUME & FADE</div>
            {A.musicUrl ? (
              <>
                <div className="v6-slider-row">
                  <div className="lr"><span>🎵 Volume musik</span><b style={{ color: "var(--v6-teal)" }}>{Math.round(A.musicVol * 100)}%</b></div>
                  <input type="range" min={0} max={1.5} step={0.05} value={A.musicVol} onChange={e => A.setMusicVol(Number(e.target.value))} />
                </div>
                <div className="v6-slider-row">
                  <div className="lr"><span>🌊 Fade masuk musik</span><b>{A.musicFadeIn.toFixed(1)} detik</b></div>
                  <input type="range" min={0} max={5} step={0.1} value={A.musicFadeIn} onChange={e => A.setMusicFadeIn(Number(e.target.value))} />
                </div>
                <div className="v6-slider-row">
                  <div className="lr"><span>🌅 Fade keluar musik</span><b>{A.musicFadeOut.toFixed(1)} detik</b></div>
                  <input type="range" min={0} max={5} step={0.1} value={A.musicFadeOut} onChange={e => A.setMusicFadeOut(Number(e.target.value))} />
                </div>
              </>
            ) : null}
            {A.hasVoice ? (
              <div className="v6-slider-row">
                <div className="lr"><span>🗣️ Volume narasi / rekaman</span><b style={{ color: "var(--v6-teal)" }}>{Math.round(A.voiceVol * 100)}%</b></div>
                <input type="range" min={0} max={1.5} step={0.05} value={A.voiceVol} onChange={e => A.setVoiceVol(Number(e.target.value))} />
              </div>
            ) : null}
            <div className="v6-note">💡 Perubahan volume langsung terdengar di pratinjau ▷ — fade otomatis diterapkan saat ekspor.</div>
          </div>
        )}
        <div className="v6-note">💡 Rekam suara asli, narasi AI, lagu AI (Suno) sampai musik upload — semua muncul di <b>track audio</b> dan bisa dimix otomatis saat ekspor. Tile 🏁 <b>Akhiran</b> ada di ujung track 1.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- TEKS (menu) ---------------- */
  if (tool === "teks") return (
    <SheetShell title="Teks" onClose={close}>
      <div className="v6-sheet-body">
        {[
          { ic: "🔤", lb: "Tambahkan teks", act: () => { A.startTextEdit(); } },
          { ic: "💬", lb: "Keterangan otomatis", act: () => setTool("keterangan"), ai: true },
          { ic: "😀", lb: "Stiker", act: () => setTool("stiker") },
          { ic: "🧩", lb: "Template teks", act: () => { A.startTextEdit(); } },
        ].map(r => (
          <div className="v6-cardrow" key={r.lb} onClick={r.act}>
            <span style={{ fontSize: 20 }}>{r.ic}</span><div className="tt">{r.lb}</div>{r.ai && <span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>AI</span>}<span className="arr">›</span>
          </div>
        ))}
      </div>
    </SheetShell>
  );

  /* ---------------- EFEK ---------------- */
  if (tool === "efek") return <EfekSheet api={A} onClose={close} />;

  /* ---------------- ANIMASI KLIP ---------------- */
  if (tool === "animasi") return <AnimasiSheet api={A} tab0={sheetTab || "masuk"} onClose={close} />;

  /* ---------------- KETERANGAN OTOMATIS ---------------- */
  if (tool === "keterangan") return <KeteranganSheet api={A} onClose={close} />;

  /* ---------------- FILTER / SESUAIKAN / KUALITAS ---------------- */
  if (tool === "filter") return <FilterSheet api={A} tab0={sheetTab || "filter"} onClose={close} />;

  /* ---------------- STIKER / OVERLAY ---------------- */
  if (tool === "stiker") return <StikerSheet api={A} tab0={sheetTab || "stiker"} onClose={close} />;

  /* ---------------- HASILKAN MEDIA ---------------- */
  if (tool === "media") return (
    <SheetShell title="Hasilkan media" onClose={close} tall>
      <div className="v6-sheet-body">
        <label className="v6-cardrow">
          <span style={{ fontSize: 20 }}>🖼️</span>
          <div className="tt">Upload foto dari galeri</div><span className="arr">›</span>
          <input type="file" accept="image/*" multiple hidden onChange={e => { A.addImageFiles(e.target.files, undefined); close(); }} />
        </label>
        <div className="v6-cardrow" onClick={() => { A.openModal("kamera"); }}>
          <span style={{ fontSize: 20 }}>📷</span><div className="tt">Ambil gambar (kamera)</div><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => { A.openModal("gambarai"); }}>
          <span style={{ fontSize: 20 }}>🎨</span><div className="tt">Gambar AI (tulis konsep sendiri)</div><span style={{ fontSize: 8.5, fontWeight: 800, background: "#a855f7", padding: "1px 7px", borderRadius: 999 }}>AI</span><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => { A.openModal("videoai"); }}>
          <span style={{ fontSize: 20 }}>🎬</span><div className="tt">Video AI (beta)</div><span className="arr">›</span>
        </div>
        <div className="v6-note">✅ Media yang ditambahkan langsung masuk <b>track 1</b> sebagai klip baru. Tarik ujungnya untuk atur durasi.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- RASIO ---------------- */
  if (tool === "rasio") return (
    <SheetShell title="Rasio aspek" onClose={close} onOk={close}>
      <div className="v6-sheet-body">
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {([["16:9", "▭", "YouTube"], ["9:16", "▯", "Shorts/Reels"], ["1:1", "⬜", "Feed IG"]] as any[]).map(([r, ic, d]) => (
            <button key={r} className={`v6-gcell ${A.ratio === r ? "on" : ""}`} style={{ aspectRatio: "1" }} onClick={() => A.setRatio(r)}>
              <span style={{ fontSize: 26 }}>{ic}</span>
              <b style={{ fontSize: 12 }}>{r}</b>
              <span className="l">{d}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">⚠️ Mengganti rasio setelah media masuk akan memotong tepi visual (mode isi penuh). Atau pakai menu <b>Latar belakang</b> → Blur supaya tidak terpotong.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- LATAR BELAKANG ---------------- */
  if (tool === "latar") return (
    <SheetShell title="Latar belakang" onClose={close} onOk={close}>
      <div className="v6-sheet-body">
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {([["cover", "⛶", "Isi penuh"], ["blur", "🌫️", "Blur"], ["color", "🎨", "Warna"]] as any[]).map(([m, ic, lb]) => (
            <button key={m} className={`v6-gcell ${A.bgMode === m ? "on" : ""}`} style={{ aspectRatio: "1" }} onClick={() => A.setBgMode(m)}>
              <span style={{ fontSize: 26 }}>{ic}</span><span className="l">{lb}</span>
            </button>
          ))}
        </div>
        {A.bgMode === "color" && (
          <>
            <div className="v6-lbl">WARNA LATAR</div>
            <div className="v6-rows">
              {["#000000", "#ffffff", "#16162a", "#0e7490", "#7c3aed", "#be185d", "#065f46", "#92400e"].map(c => (
                <button key={c} className={`v6-swatch ${A.bgColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => A.setBgColor(c)} />
              ))}
              <span className="v6-swatch on" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                <input type="color" value={A.bgColor} onChange={e => A.setBgColor(e.target.value)} />
              </span>
            </div>
          </>
        )}
        <div className="v6-note">Mode <b>Blur/Warna</b> membuat video jadi letterbox (gambar utuh tidak terpotong) — pas kalau konten beda rasio.</div>
      </div>
    </SheetShell>
  );

  /* ---------------- PANGKAS ---------------- */
  if (tool === "pangkas" && A.selId) {
    const dur = A.selOpt?.dur ?? A.slideDuration;
    return (
      <SheetShell title="Pangkas klip" onClose={close} onOk={close}>
        <div className="v6-sheet-body">
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi klip terpilih</span><b style={{ color: "var(--v6-teal)" }}>{dur.toFixed(1)} detik</b></div>
            <input type="range" min={0.4} max={20} step={0.1} value={dur} onChange={e => A.setOpt(A.selId, { dur: Number(e.target.value) })} />
          </div>
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi default klip baru</span><b>{A.slideDuration} detik</b></div>
            <input type="range" min={1} max={10} step={0.5} value={A.slideDuration} onChange={e => A.setSlideDuration(Number(e.target.value))} />
          </div>
          <div className="v6-note">💡 Cara cepat: tarik langsung <b>handle putih</b> di ujung klip pada timeline.</div>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- SPEED ---------------- */
  if (tool === "speed" && A.selId) {
    const sp = A.selOpt?.speed ?? 1;
    return (
      <SheetShell title="Kecepatan klip" onClose={close} onOk={close}>
        <div className="v6-sheet-body">
          <div className="v6-slider-row">
            <div className="lr"><span>⚡ Kecepatan</span><b style={{ color: "var(--v6-teal)" }}>{sp.toFixed(2)}×</b></div>
            <input type="range" min={0.3} max={3} step={0.05} value={sp} onChange={e => A.setOpt(A.selId, { speed: Number(e.target.value) })} />
          </div>
          <div className="v6-chips" style={{ padding: 0 }}>
            {[0.5, 0.7, 1, 1.5, 2, 3].map(v => <button key={v} className={`v6-chip ${sp === v ? "on" : ""}`} onClick={() => A.setOpt(A.selId, { speed: v })}>{v}×</button>)}
          </div>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- TRANSISI ---------------- */
  if (tool === "transisi" && A.selId) {
    const cur = canonicalTrans(A.selOpt?.trans ?? A.transition);
    const td = A.selOpt?.transDur ?? A.transitionDur;
    return (
      <SheetShell title="Transisi" onClose={close} onOk={close} tall>
        <div className="v6-sheet-body">
          <ChipRow items={[{ id: "semua", label: "Semua" }, ...["AI ✨", "Dasar", "Geser", "Zoom", "Cahaya", "Efek"].map(x => ({ id: x, label: x }))]} cur={sheetTab || "semua"} onPick={setSheetTab} />
          <div className="v6-grid4">
            {TRANSITIONS.filter((t: any) => !sheetTab || sheetTab === "semua" || t.cat === sheetTab).map((t: any) => (
              <button key={t.id} className={`v6-gcell ${cur === t.id ? "on" : ""}`} onClick={() => A.setOpt(A.selId, { trans: t.id })}>
                <span className="e">{t.emoji}</span><span className="l">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi transisi</span><b style={{ color: "var(--v6-teal)" }}>{td.toFixed(1)}d</b></div>
            <input type="range" min={0.15} max={2.5} step={0.05} value={td} onChange={e => A.setOpt(A.selId, { transDur: Number(e.target.value) })} />
          </div>
          {sheetTab === "AI ✨" && (
            <div className="v6-note">🧬 <b>Transisi AI ✨</b> = efek lanjutan 100% buatan VERVE (morph cair, partikel, hologram, tinta…) — dirender langsung di HP, bukan template curian. Cobain aja, gratis semua!</div>
          )}
          <button className="v6-btn ghost" style={{ width: "100%" }} onClick={() => {
            A.pushHist();
            const upd: Record<string, any> = {};
            A.slides.forEach((s: any) => { upd[s.id] = { trans: cur, transDur: td }; });
            A.slides.forEach((s: any) => A.setOpt(s.id, upd[s.id]));
          }}>🌍 Terapkan ke semua sambungan</button>
        </div>
      </SheetShell>
    );
  }

  /* ---------------- EKSPOR ---------------- */
  if (tool === "ekspor") return <EksporSheet api={A} onClose={close} />;

  return null;
}

/* ---------------- EFEK ---------------- */
function EfekSheet({ api: A, onClose }: any) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("semua");
  if (!A.selId) return (
    <SheetShell title="Efek" onClose={onClose}>
      <div className="v6-sheet-body"><div className="v6-empty"><div className="big">☆</div>Pilih klip dulu di timeline, baru kasih efek ya bro.</div></div>
    </SheetShell>
  );
  const curEf = A.selOpt?.effect || "";
  const cats = ["semua", ...Array.from(new Set(EFFECTS.map((e: any) => e.cat || "Lain")))] as string[];
  const items = EFFECTS.filter((e: any) => (cat === "semua" || e.cat === cat) && (!q || e.label.toLowerCase().includes(q.toLowerCase())));
  return (
    <SheetShell title="Efek video" onClose={onClose} onOk={onClose}>
      <div className="v6-sheet-body" style={{ paddingTop: 0 }}>
        <div className="v6-searchbar">🔍<input placeholder="Orang-orang sedang mencari blur…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <ChipRow items={cats.map(c => ({ id: c, label: c === "semua" ? "Sedang tren" : c }))} cur={cat} onPick={setCat} />
        <div className="v6-grid4">
          {items.map((e: any) => (
            <button key={e.id || "none"} className={`v6-gcell ${curEf === e.id ? "on" : ""}`} onClick={() => { A.setOpt(A.selId, { effect: e.id }); }}>
              <span className="e">{e.emoji}</span><span className="l">{e.label}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">Efek diterapkan ke klip terpilih dan ikut terekspor. Pilih 🚫 untuk menghapus efek.</div>
      </div>
    </SheetShell>
  );
}

/* ---------------- ANIMASI (Masuk/Keluar/Kombinasi) ---------------- */
function AnimasiSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0);
  if (!A.selId) return (
    <SheetShell title="Animasi" onClose={onClose}><div className="v6-sheet-body"><div className="v6-empty"><div className="big">▷</div>Pilih klip dulu ya bro.</div></div></SheetShell>
  );
  const list = tab === "masuk" ? ANIM_IN : tab === "keluar" ? ANIM_OUT : ANIM_LOOP;
  const cur = tab === "masuk" ? (A.selOpt?.animIn || "none") : tab === "keluar" ? (A.selOpt?.animOut || "none") : (A.selOpt?.loop || "none");
  const pick = (id: string) => {
    if (tab === "masuk") A.setOpt(A.selId, { animIn: id });
    else if (tab === "keluar") A.setOpt(A.selId, { animOut: id });
    else A.setOpt(A.selId, { loop: id });
  };
  const dur = A.selOpt?.animDur ?? 0.6;
  return (
    <SheetShell title="Animasi" onClose={onClose} onOk={onClose}>
      <TabBar tabs={["masuk", "keluar", "kombinasi"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body">
        <ChipRow items={[{ id: "x", label: "Sedang tren" }, { id: "y", label: "Dasar" }]} cur="x" onPick={() => {}} />
        <div className="v6-grid4">
          {list.map((a: any) => (
            <button key={a.id} className={`v6-gcell ${cur === a.id ? "on" : ""}`} onClick={() => pick(a.id)}>
              <span className="e">{a.emoji}</span><span className="l">{a.label}</span>
            </button>
          ))}
        </div>
        {tab !== "kombinasi" && (
          <div className="v6-slider-row">
            <div className="lr"><span>⏱ Durasi animasi</span><b style={{ color: "var(--v6-teal)" }}>{dur.toFixed(1)}d</b></div>
            <input type="range" min={0.2} max={2.5} step={0.1} value={dur} onChange={e => A.setOpt(A.selId, { animDur: Number(e.target.value) })} />
          </div>
        )}
        {tab === "kombinasi" && <div className="v6-note">💫 Animasi berulang berjalan terus sepanjang klip (denyut, goyang halus, zoom pelan…) — pas buat foto diam jadi hidup.</div>}
      </div>
    </SheetShell>
  );
}

/* ---------------- KETERANGAN OTOMATIS ---------------- */
function KeteranganSheet({ api: A, onClose }: any) {
  const tpl = CC_TEMPLATES.find(t => t.id === A.ccTpl) || CC_TEMPLATES[0];
  const [adv, setAdv] = useState(false);
  return (
    <SheetShell title="Keterangan otomatis" onClose={onClose}>
      <div className="v6-sheet-body">
        <div className="v6-cardrow" onClick={() => A.setCcFrom(A.ccFrom === "suara" ? "musik" : "suara")}>
          <span style={{ fontSize: 18 }}>⊞</span>
          <div className="tt">Hasilkan dari</div>
          <span className="val">{A.ccFrom === "suara" ? "Pengisi suara (narasi/rekaman)" : "Audio musik"}</span><span className="arr">›</span>
        </div>
        <div className="v6-cardrow" onClick={() => {
          const langs = ["id-ID", "en-US", "jv-ID", "su-ID", "ms-MY"];
          const i = langs.indexOf(A.ccLang);
          A.setCcLang(langs[(i + 1) % langs.length]);
        }}>
          <span style={{ fontSize: 18 }}>🗣</span>
          <div className="tt">Bahasa sumber</div>
          <span className="val">{A.ccLang === "id-ID" ? "Bahasa Indonesia" : A.ccLang}</span><span className="arr">›</span>
        </div>
        <div style={{ marginTop: 14, border: "1px solid var(--v6-line)", borderRadius: 14, padding: "12px 12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 12.5 }}>💬 Template</b><span style={{ fontSize: 10, color: "#6b7280" }}>›</span>
          </div>
          <div className="v6-rows" style={{ marginTop: 10 }}>
            {CC_TEMPLATES.map(t => (
              <button key={t.id} className={`v6-gcell ${A.ccTpl === t.id ? "on" : ""}`} style={{ width: 104, height: 74, flex: "0 0 auto", aspectRatio: "auto" }} onClick={() => A.setCcTpl(t.id)}>
                <span style={{ fontSize: 11, fontWeight: 800, color: t.color, textShadow: "0 1px 3px #000" }}>{t.sample}</span>
                <span className="l">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="v6-cardrow" onClick={() => setAdv(v => !v)}>
          <span style={{ fontSize: 16 }}>💎</span><div className="tt" style={{ color: "#a78bfa" }}>Opsi lanjutan</div><span className="arr">{adv ? "⌄" : "›"}</span>
        </div>
        {adv && (
          <>
            <div className="v6-slider-row">
              <div className="lr"><span>Ukuran teks</span><b>{Math.round(A.ccSize * 1000)}</b></div>
              <input type="range" min={0.03} max={0.09} step={0.005} value={A.ccSize} onChange={e => A.setCcSize(Number(e.target.value))} />
            </div>
            <div className="v6-slider-row">
              <div className="lr"><span>Posisi vertikal</span><b>{Math.round(A.ccY * 100)}%</b></div>
              <input type="range" min={0.55} max={0.92} step={0.01} value={A.ccY} onChange={e => A.setCcY(Number(e.target.value))} />
            </div>
          </>
        )}
        <button className="v6-bigcta" onClick={A.doAutoCaptions} disabled={A.loading === "cc"}>
          {A.loading === "cc" ? "⏳ Membuat keterangan…" : "Hasilkan"}
          <span className="std">❤ Standar</span>
        </button>
        {!!A.capWords.length && (
          <div className="v6-okbox">✅ {A.capWords.length} kata keterangan aktif (gaya: {tpl.label}). <b onClick={A.clearCaptions} style={{ cursor: "pointer", textDecoration: "underline" }}>Hapus</b></div>
        )}
        <div className="v6-note">📌 <b>Narasi AI (Teks-ke-audio)</b>: keterangan dibuat AKURAT dari teks aslinya, sinkron kata demi kata. <b>Musik/rekaman</b>: ditranskrip live pakai pengenal suara browser (paling lancar di Chrome, hasilnya eksperimental tapi nyata).</div>
      </div>
    </SheetShell>
  );
}

/* ---------------- FILTER + SESUAIKAN + KUALITAS (4 tab) ---------------- */
function FilterSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0);
  const [cat, setCat] = useState("semua");
  function savePreset() {
    const name = prompt("Nama preset:", "Gaya saya");
    if (!name) return;
    const p = { id: uid("pr"), name: name.slice(0, 24), filter: A.filterPreset, adj: { ...A.adj } };
    const arr = [...A.presets, p];
    A.setPresets(arr);
    try { localStorage.setItem("verve_filter_presets", JSON.stringify(arr)); } catch {}
  }
  return (
    <SheetShell title="Filter" onClose={onClose} onOk={onClose}>
      <TabBar tabs={["preset", "filter", "sesuaikan", "kualitas"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body">
        {tab === "preset" && (
          <>
            <button className="v6-bigcta" style={{ marginTop: 4 }} onClick={savePreset}>＋ Simpan gaya sekarang jadi preset</button>
            <div className="v6-grid4">
              {!A.presets.length && <div className="v6-note" style={{ gridColumn: "1/-1" }}>Belum ada preset. Atur filter + sesuaikan, lalu simpan di sini biar tinggal 1 tap nanti.</div>}
              {A.presets.map((p: any) => (
                <button key={p.id} className="v6-gcell" onClick={() => { A.setFilterPreset(p.filter); A.setAdj({ ...DEFAULT_ADJUST, ...p.adj }); }}
                  onContextMenu={e => { e.preventDefault(); A.setPresets(A.presets.filter((x: any) => x.id !== p.id)); try { localStorage.setItem("verve_filter_presets", JSON.stringify(A.presets.filter((x: any) => x.id !== p.id))); } catch {} }}>
                  <span className="e">🎨</span><span className="l">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "filter" && (
          <>
            <ChipRow items={[{ id: "semua", label: "Unggulan" }, { id: "baru", label: "BARU" }, { id: "hidup", label: "Kehidupan" }]} cur={cat} onPick={setCat} />
            <div className="v6-grid4">
              {FILTERS.map((f: any) => (
                <button key={f.id} className={`v6-gcell ${A.filterPreset === f.id ? "on" : ""}`} onClick={() => { A.pushHist(); A.setFilterPreset(f.id); }}>
                  <span className="e">{f.emoji}</span><span className="l">{f.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "sesuaikan" && (
          <>
            {ADJUST_DEFS.map((d: any) => (
              <div className="v6-slider-row" key={d.key}>
                <div className="lr"><span>{d.emoji} {d.label}</span><b>{(A.adj as any)[d.key]}</b></div>
                <input type="range" min={d.min} max={d.max} value={(A.adj as any)[d.key]} onChange={e => A.setAdj({ ...A.adj, [d.key]: Number(e.target.value) })} />
              </div>
            ))}
            <button className="v6-btn ghost" style={{ width: "100%" }} onClick={() => A.setAdj({ ...DEFAULT_ADJUST })}>↺ Reset semua</button>
          </>
        )}
        {tab === "kualitas" && (
          <>
            <div className="v6-cardrow" onClick={() => A.setQualitySharp(!A.qualitySharp)}>
              <span style={{ fontSize: 20 }}>✨</span>
              <div className="tt">Peningkat ketajaman AI-lite<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Video lebih jernih & tajam saat diekspor</div></div>
              <button className={`v6-toggle ${A.qualitySharp ? "on" : ""}`} />
            </div>
            <div className="v6-cardrow" onClick={() => { A.setAdj({ b: 6, c: 14, s: 10, e: 4, tem: 2, hue: 0, fade: 0, vig: 30, grain: A.adj.grain }); A.setQualitySharp(true); }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <div className="tt">Koreksi otomatis<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Warna + kontras + ketajaman sekali tap</div></div>
              <span className="arr">›</span>
            </div>
            <div className="v6-note">Jujur ya bro: ini peningkatan ketajaman & kejernihan via filter konvolusi kanvas — bukan upscale AI beneran kayak di aplikasi berbayar 💎. Hasil tetap terasa lebih crisp.</div>
          </>
        )}
      </div>
    </SheetShell>
  );
}

/* ---------------- STIKER + GIPHY + OVERLAY FOTO ---------------- */
function StikerSheet({ api: A, tab0, onClose }: any) {
  const [tab, setTab] = useState(tab0 === "overlayimg" ? "overlay" : "stiker");
  const [cat, setCat] = useState("sosmed");
  const [q, setQ] = useState("");
  const curSticks = A.selId ? (A.selOpt?.stickers || []) : [];
  return (
    <SheetShell title="Stiker" onClose={onClose} onOk={onClose} tall>
      <TabBar tabs={["stiker", "overlay", "giphy"]} cur={tab} onPick={setTab} />
      <div className="v6-sheet-body" style={{ paddingTop: 0 }}>
        {tab === "stiker" && (
          <>
            <div className="v6-searchbar">🔍<input placeholder="Cari: subscribe, rec, kupu, api…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <ChipRow items={[...STICKER_ANIM_CATS.map(c => ({ id: c.id, label: c.label })), ...STICKER_CATS.map(c => ({ id: c.id, label: c.label }))]} cur={cat} onPick={setCat} />
            <div className="v6-grid4">
              {["sosmed", "musik", "suasana"].includes(cat) && ANIM_STICKERS
                .filter(a => a.cat === cat && (!q || a.label.toLowerCase().includes(q.toLowerCase())))
                .map(a => (
                  <button key={a.id} className="v6-gcell" onClick={() => A.addSticker(a.id)} title="Stiker animasi — bergerak di video!">
                    <span className="e">{ANIM_STICKER_PREVIEW[a.id] || "✨"}</span><span className="l">{a.label} ✨</span>
                  </button>
                ))}
              {(STICKER_CATS.find(c => c.id === cat)?.items || []).map((em: string, i: number) => (
                <button key={`${em}${i}`} className="v6-gcell" onClick={() => A.addSticker(em)}>
                  <span className="e">{em}</span>
                </button>
              ))}
            </div>
            <div className="v6-note">✨ Stiker dengan tanda bintang adalah <b>stiker animasi</b> — tetap bergerak di video hasil ekspor. Seret langsung di layar pratinjau untuk memposisikan.</div>
          </>
        )}
        {tab === "overlay" && (
          <>
            <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
              🖼️ Tambahkan foto sebagai overlay (PiP)
              <input type="file" accept="image/*" hidden onChange={e => A.uploadOverlayImg(e.target.files)} />
            </label>
            <div className="v6-lbl">OVERLAY & STIKER DI KLIP TERPILIH ({curSticks.length})</div>
            {!A.selId && <div className="v6-note">Pilih klip dulu untuk mengelola overlay-nya.</div>}
            <div className="v6-grid4">
              {curSticks.map((s: any) => (
                <button key={s.id} className="v6-gcell" onClick={() => A.delSticker(A.selId, s.id)} title="Tap buat hapus">
                  {s.img ? <span style={{ fontSize: 20 }}>🖼️</span> : <span className="e">{ANIM_STICKER_PREVIEW[s.emoji] || s.emoji}</span>}
                  <span className="l">🗑 Hapus</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "giphy" && (
          <div className="v6-empty">
            <div className="big">🌐</div>
            Integrasi GIPHY butuh API key GIPHY (gratis). Sementara pakai tab <b>Stiker</b> (animasi orisinal kita) — jumlahnya bakal terus ditambah! 🚀
          </div>
        )}
      </div>
    </SheetShell>
  );
}

/* ---------------- EKSPOR (video | GIF, slider resolusi/fps/bitrate) ---------------- */
function EksporSheet({ api: A, onClose }: any) {
  const resIdx = RES_STOPS.indexOf(A.exRes);
  const fpsIdx = FPS_STOPS.indexOf(A.exFps);
  const mbIdx = MBPS_STOPS.indexOf(A.exMbps);
  return (
    <SheetShell title="Ekspor" onClose={onClose}>
      <div style={{ padding: "0 14px" }}>
        <div className="v6-xp-tabs">
          <button className={`v6-xp-tab ${A.exTab === "video" ? "on" : ""}`} onClick={() => A.setExTab("video")}>video</button>
          <button className={`v6-xp-tab ${A.exTab === "gif" ? "on" : ""}`} onClick={() => A.setExTab("gif")}>GIF</button>
        </div>
      </div>
      <div className="v6-sheet-body" style={{ paddingTop: 4 }}>
        {A.exTab === "video" ? (
          <>
            <div className="v6-cardrow" onClick={() => A.setQualitySharp(!A.qualitySharp)}>
              <span style={{ fontSize: 18 }}>💎</span>
              <div className="tt">Peningkat Ketajaman ✨<div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>Video lebih jernih & halus (filter ketajaman saat render)</div></div>
              <button className={`v6-toggle ${A.qualitySharp ? "on" : ""}`} />
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Resolusi</b><span>Definisi tinggi — pengalaman menonton terbaik</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={resIdx < 0 ? 2 : resIdx} onChange={e => A.setExRes(RES_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{RES_STOPS.map(r => <span key={r}>{r >= 1440 ? (r === 1440 ? "2k" : "4k") : `${r}p`}{A.exRes === r ? <>{""}<b>✔</b></> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Tingkat bingkai</b><span>Pemutaran lebih lancar</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={fpsIdx < 0 ? 2 : fpsIdx} onChange={e => A.setExFps(FPS_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{FPS_STOPS.map(f => <span key={f}>{f}{A.exFps === f ? <b>✔</b> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-block">
              <div className="bh"><b>Bitrate (Mbps)</b><span>Direkomendasikan: 10–20</span></div>
              <div className="v6-xp-slider">
                <input type="range" min={0} max={4} step={1} value={mbIdx < 0 ? 1 : mbIdx} onChange={e => A.setExMbps(MBPS_STOPS[Number(e.target.value)])} />
                <div className="v6-xp-ticks">{MBPS_STOPS.map(m => <span key={m}>{m}{A.exMbps === m ? <b>✔</b> : null}</span>)}</div>
              </div>
            </div>
            <div className="v6-xp-est">Perkiraan ukuran file: <b style={{ color: "#fff" }}>{A.estMB.toFixed(A.estMB > 80 ? 0 : 1)} MB</b> · durasi {formatDur(A.clipsTotal)}</div>
            {A.exRes >= 1440 && <div className="v6-risk">⚠️ Render 2K/4K di HP butuh waktu & RAM besar. Kalau gagal, turunkan ke 1080p ya bro.</div>}
            <button className="v6-bigcta" onClick={A.doRender} disabled={A.loading === "render"}>
              {A.loading === "render" ? `⏳ Rendering… ${Math.round(A.progress * 100)}%` : A.videoUrl ? "🔄 Render Ulang" : "Ekspor"}</button>
            {!!A.videoUrl && (
              <>
                <video src={A.videoUrl} controls style={{ width: "100%", borderRadius: 12, marginTop: 10, border: "1px solid var(--v6-line)" }} />
                <button className="v6-bigcta" style={{ background: "#22c55e", color: "#052e16" }} onClick={A.downloadVideo}>⬇️ Download video {A.videoBlob ? `(${(A.videoBlob.size / 1048576).toFixed(1)} MB)` : ""}</button>
                {!A.meta && <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} disabled={A.loading === "meta"} onClick={A.genMetadata}>
                  {A.loading === "meta" ? "⏳ Menulis metadata…" : "📋 Metadata YouTube (judul + deskripsi + tags)"}</button>}
                {!!A.meta && (
                  <div style={{ marginTop: 10, border: "1px solid var(--v6-line)", borderRadius: 14, padding: 12 }}>
                    <b style={{ fontSize: 12 }}>📋 Metadata YouTube</b>
                    {([["t", "🏷️ Judul", A.meta.titleHighCTR], ["d", "📝 Deskripsi", A.meta.description], ["g", "#️⃣ Tags", (A.meta.tags || []).join(", ")], ["h", "🔖 Hashtags", A.meta.hashtags]] as any[]).map(([k, lb, val]) => (
                      <div key={k} style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#9ca3af" }}>{lb}</span>
                          <button className="v6-chip" style={{ padding: "3px 10px" }} onClick={() => A.copyFld(k, val || "")}>{A.copiedFld === k ? "✓" : "SALIN"}</button>
                        </div>
                        <div style={{ fontSize: 11, background: "rgba(0,0,0,.35)", borderRadius: 10, padding: 9, marginTop: 4, lineHeight: 1.55, whiteSpace: k === "d" ? "pre-wrap" : "normal" }}>{val}</div>
                      </div>
                    ))}
                    <button className="v6-btn" style={{ width: "100%", marginTop: 8 }} onClick={A.downloadMetaTxt}>📥 Download metadata (.txt)</button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="v6-empty" style={{ margin: "12px 0 0" }}>
              <div className="big">🎞️</div>
              GIF dibuat dari <b>8 detik pertama</b> timeline, resolusi ringkas, 10 fps, tanpa audio.<br />Pas buat sticker/share cepat.
            </div>
            <button className="v6-bigcta" onClick={A.doRenderGif} disabled={A.loading === "gif"}>
              {A.loading === "gif" ? `⏳ Merangkai… ${Math.round(A.progress * 100)}%` : "Unduh GIF"}</button>
            <div style={{ height: 6 }} />
          </>
        )}
      </div>
    </SheetShell>
  );
}

/* ==================================================================
   TEXT EDIT SHEET — Template · Font · Gaya · Animasi · Gelembung · Preset
   ================================================================== */
function TextEditSheet({ slideId, text, onChange, onDone, onDelete }: any) {
  const [tab, setTab] = useState("template");
  const [presets, setPresets] = useState<any[]>([]);
  useEffect(() => { try { setPresets(JSON.parse(localStorage.getItem("verve_text_presets") || "[]")); } catch {} }, []);
  const ct = text as ClipText;
  function savePreset() {
    const name = prompt("Nama preset teks:", "Gaya saya"); if (!name) return;
    const arr = [...presets, { id: uid("tp"), name: name.slice(0, 20), st: { ...ct, txt: "" } }];
    setPresets(arr);
    try { localStorage.setItem("verve_text_presets", JSON.stringify(arr)); } catch {}
  }
  const tabs = ["template", "font", "gaya", "animasi", "gelembung", "preset"];
  return (
    <>
      <div className="v6-sheet-back" style={{ background: "rgba(0,0,0,.15)" }} onClick={onDone} />
      <div className="v6-sheet" style={{ maxHeight: "66dvh" }}>
        <div className="v6-sheet-head">
          <button className="x" onClick={onDelete} title="Hapus teks">🗑</button>
          <input className="v6-inp" style={{ flex: 1, borderRadius: 999, padding: "9px 16px" }} placeholder="Masukkan teks"
            value={ct.txt} onChange={e => onChange({ txt: e.target.value })} autoFocus />
          <button className="v" onClick={onDone}>✓</button>
        </div>
        <TabBar tabs={tabs.map(t => t[0].toUpperCase() + t.slice(1))} cur={tab[0].toUpperCase() + tab.slice(1)} onPick={t => setTab(t.toLowerCase())} />
        <div className="v6-sheet-body">
          {tab === "template" && (
            <div className="v6-grid4">
              {TEXT_TEMPLATES.map((t: any) => (
                <button key={t.id} className="v6-gcell" onClick={() => onChange({ ...t.st })}>
                  <span className="prev-txt" style={{ color: t.st.color || "#fff", textShadow: t.st.shadow ? "0 2px 6px #000" : "none", WebkitTextStroke: t.st.stroke ? `1px ${t.st.strokeColor || "#000"}` : "0" }}>Aa</span>
                  <span className="l">{t.label}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "font" && (
            <div className="v6-grid4">
              {TEXT_FONTS.map((f: any) => (
                <button key={f.id} className={`v6-gcell ${ct.font === f.id ? "on" : ""}`} onClick={() => onChange({ font: f.id })}>
                  <span className="prev-txt" style={{ fontFamily: f.stack, fontSize: 13 }}>{f.label}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "gaya" && (
            <>
              <div className="v6-lbl">WARNA TEKS</div>
              <div className="v6-rows">
                {TEXT_COLORS.map((c: string) => <button key={c} className={`v6-swatch ${ct.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ color: c })} />)}
                <span className="v6-swatch" style={{ background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
                  <input type="color" value={ct.color} onChange={e => onChange({ color: e.target.value })} />
                </span>
              </div>
              <div className="v6-slider-row"><div className="lr"><span>Ukuran</span><b>{Math.round(ct.size * 1000)}</b></div>
                <input type="range" min={0.025} max={0.09} step={0.005} value={ct.size} onChange={e => onChange({ size: Number(e.target.value) })} /></div>
              <div className="v6-slider-row"><div className="lr"><span>Posisi vertikal</span><b>{Math.round(ct.y * 100)}%</b></div>
                <input type="range" min={0.08} max={0.92} step={0.01} value={ct.y} onChange={e => onChange({ y: Number(e.target.value) })} /></div>
              <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
                <button className={`v6-chip ${ct.bold ? "on" : ""}`} onClick={() => onChange({ bold: !ct.bold })}><b>B</b> Tebal</button>
                <button className={`v6-chip ${ct.italic ? "on" : ""}`} onClick={() => onChange({ italic: !ct.italic })}><i>I</i> Miring</button>
                <button className={`v6-chip ${ct.shadow ? "on" : ""}`} onClick={() => onChange({ shadow: !ct.shadow })}>🌑 Bayangan</button>
                <button className={`v6-chip ${ct.align === "left" ? "on" : ""}`} onClick={() => onChange({ align: "left" })}>⇤</button>
                <button className={`v6-chip ${ct.align === "center" ? "on" : ""}`} onClick={() => onChange({ align: "center" })}>≡</button>
                <button className={`v6-chip ${ct.align === "right" ? "on" : ""}`} onClick={() => onChange({ align: "right" })}>⇥</button>
              </div>
              <div className="v6-lbl">GARIS TEPI (STROKE)</div>
              <div className="v6-rows" style={{ alignItems: "center" }}>
                <button className={`v6-chip ${ct.stroke ? "on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => onChange({ stroke: !ct.stroke })}>{ct.stroke ? "✓" : "○"}</button>
                {["#000000", "#ffffff", "#ef4444", "#f59e0b", "#0e7490", "#7c3aed"].map(c => (
                  <button key={c} className={`v6-swatch ${ct.strokeColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ stroke: true, strokeColor: c })} />
                ))}
              </div>
              {ct.stroke && <div className="v6-slider-row"><div className="lr"><span>Ketebalan</span><b>{ct.strokeW}px</b></div>
                <input type="range" min={1} max={12} step={1} value={ct.strokeW} onChange={e => onChange({ strokeW: Number(e.target.value) })} /></div>}
            </>
          )}
          {tab === "animasi" && (
            <>
              <div className="v6-tabs" style={{ padding: "0 0 6px", border: "none" }}>
                <span className="v6-tab on">Masuk</span>
                <span className="v6-tab" style={{ cursor: "default", opacity: .5 }}>Keluar • otomatis memudar</span>
              </div>
              <div className="v6-grid4">
                {TEXT_ANIMS.map((a: any) => (
                  <button key={a.id} className={`v6-gcell ${ct.anim === a.id ? "on" : ""}`} onClick={() => onChange({ anim: a.id })}>
                    <span className="e">{a.emoji}</span><span className="l">{a.label}</span>
                  </button>
                ))}
              </div>
              <div className="v6-note">💫 Animasi <b>berulang</b> (denyut/goyang) ada di menu Animasi klip → tab Kombinasi.</div>
            </>
          )}
          {tab === "gelembung" && (
            <>
              <div className="v6-lbl">LATAR BALON TEKS</div>
              <div className="v6-rows" style={{ alignItems: "center" }}>
                <button className={`v6-chip ${!ct.bg ? "on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => onChange({ bg: false })}>🚫</button>
                {["#000000", "#ffffff", "#ef4444", "#f59e0b", "#22c55e", "#0e7490", "#7c3aed", "#ec4899"].map(c => (
                  <button key={c} className={`v6-swatch ${ct.bg && ct.bgColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ bg: true, bgColor: c })} />
                ))}
              </div>
              <div className="v6-note">Gelembung = kotak latar membulat di belakang teks (semi-transparan) — bagus buat caption di atas video ramai.</div>
            </>
          )}
          {tab === "preset" && (
            <>
              <button className="v6-bigcta" style={{ marginTop: 2 }} onClick={savePreset}>＋ Simpan gaya teks ini</button>
              <div className="v6-grid4">
                {!presets.length && <div className="v6-note" style={{ gridColumn: "1/-1" }}>Belum ada preset tersimpan.</div>}
                {presets.map((p: any) => (
                  <button key={p.id} className="v6-gcell" onClick={() => onChange({ ...p.st })}>
                    <span className="prev-txt" style={{ color: p.st.color, fontFamily: TEXT_FONTS.find((f: any) => f.id === p.st.font)?.stack }}>Aa</span>
                    <span className="l">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ==================================================================
   MODAL KECIL / UTIL
   ================================================================== */
function MiniModal({ title, children, onClose }: any) {
  return (
    <div className="v6-modal-back" onClick={onClose}>
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ flex: 1 }}>{title}</h3>
          <button className="v6-tbtn v6e-tbtn" onClick={onClose} style={{ color: "#fff" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- REKAM ---------- */
function RekamModal({ onClose, onUse }: any) {
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [tele, setTele] = useState("");
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itvRef = useRef<any>(null);
  useEffect(() => () => { stopAll(); }, []); // eslint-disable-line
  function stopAll() {
    clearInterval(itvRef.current);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  async function start() {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = st;
      const mr = new MediaRecorder(st);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }));
        onUse(url);
      };
      mrRef.current = mr; mr.start();
      setRec(true); setSec(0);
      itvRef.current = setInterval(() => setSec(s => s + 1), 1000);
    } catch { alert("🎙️ Izin mikrofon ditolak. Aktifkan di pengaturan browser ya bro."); }
  }
  function stop() {
    clearInterval(itvRef.current);
    setRec(false);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
  }
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={() => { stopAll(); onClose(); }}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>Rekam</h3>
          <div style={{ width: 38 }} />
        </div>
        <div className="v6-rec">
          {tele !== "" && <div className="v6-inp v6-ta" style={{ width: "100%", marginBottom: 14, color: "#c7c7d2", fontSize: 12 }}>{tele || "…"}</div>}
          <button className={`mic ${rec ? "stop" : ""}`} onClick={rec ? stop : start}>{rec ? "⏹" : "🎙"}</button>
          <div className="tm">{rec ? `0:${String(sec).padStart(2, "0")}` : ""}</div>
          <div className="hint">{rec ? "Merekam… tap untuk berhenti & pakai" : "Ketuk atau tekan dan tahan untuk merekam"}</div>
          <div className="side">
            <button className="sbtn" onClick={() => { setTele(tele === "" ? "Ketik naskahmu di sini…\nBiar gak lupa pas rekam 😄" : ""); }}>
              📜<span>Teleprompter</span>
            </button>
            <button className="sbtn" onClick={() => alert("🎚️ Sempurnakan suara: hasil rekaman otomatis dinormalisasi ringan saat digabung musik saat ekspor.")}>🎚️<span>Sempurnakan</span></button>
            <button className="sbtn" onClick={() => alert("🎭 Pengubah suara segera hadir — sementara pakai Teks-ke-audio untuk suara AI.")}>🎭<span>Pengubah</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- TEKS KE AUDIO (TTS) ---------- */
function TtsModal({ initial, onClose, onGen, loading, voice, setVoice }: any) {
  const [txt, setTxt] = useState(initial || "");
  const [narr, setNarr] = useState(true);
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
        <div className="t">Teks ke audio</div>
        <button className="v6-btn" style={{ padding: "8px 16px" }} onClick={() => txt.trim().length >= 4 ? onGen(txt, voice) : alert("Isi teks dulu bro")} disabled={loading === "tts"}>
          {loading === "tts" ? "⏳" : "Berikutnya"}
        </button>
      </div>
      <div className="fb">
        <div style={{ border: "1px solid var(--v6-line)", borderRadius: 16, padding: 14, background: "#14141b" }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>❝</div>
          <textarea className="v6-inp v6-ta" style={{ border: "none", background: "none", padding: 0, fontSize: 13.5 }}
            placeholder="Tempelkan teks Anda di sini, lalu masukkan jeda baris untuk memisahkannya menjadi keterangan terpisah…"
            value={txt} onChange={e => setTxt(e.target.value)} />
          <button className="v6-chip" style={{ marginTop: 6 }} onClick={() => setTxt("Hai teman-teman, selamat datang kembali di channel kita. Kali ini kita akan bahas sesuatu yang sangat menyentuh hati. Jadi simak sampai habis ya!")}>✨ Coba sebuah contoh</button>
        </div>
        <div className="v6-cardrow" style={{ cursor: "default" }}>
          <span style={{ fontSize: 18 }}>🗣</span>
          <div className="tt">Pengisi suara</div>
          <button className={`v6-toggle ${narr ? "on" : ""}`} onClick={() => setNarr(!narr)} />
        </div>
        <div className="v6-lbl">DIBUAT OLEH: TEKS KE UCAPAN ▾ &nbsp;&nbsp;<span style={{ color: "#6b7280" }}>Lainnya ›</span></div>
        <div className="v6-rows">
          {VOICES.map(v => (
            <button key={v.id} className={`v6-voice-chip ${voice === v.id ? "on" : ""}`} onClick={() => setVoice(v.id)}>
              <span className="av" style={{ background: v.bg }}>{v.av}</span>
              <span className="nm">{v.name}</span>
            </button>
          ))}
        </div>
        <div className="v6-note">💡 Hasilnya masuk sebagai <b>narasi di track audio</b>. Lanjutkan ke menu 💬 <b>Keterangan otomatis</b> → keterangan karaoke sinkron otomatis dibuat dari teks ini!</div>
      </div>
    </div>
  );
}

/* ---------- MUSIK AI (SUNO) ---------- */
function MusikModal(p: any) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={p.onClose}>✕</button>
        <div className="t">Musik AI (Suno)</div>
        <button className="v6-btn" style={{ padding: "8px 16px" }} onClick={p.onGen} disabled={p.loading === "suno"}>{p.loading === "suno" ? "⏳" : "🎵 Buat lagu"}</button>
      </div>
      <div className="fb">
        <button className="v6-chip" onClick={() => setShowKey(!showKey)}>🔑 API Key Suno {p.sunoKey ? "✅" : "(mode gratis)"} {showKey ? "▴" : "▾"}</button>
        {showKey && (
          <div style={{ marginTop: 8 }}>
            <input className="v6-inp" placeholder="API key (kosongkan = mode gratis)" value={p.sunoKey}
              onChange={e => { p.setSunoKey(e.target.value); try { localStorage.setItem("verve_suno_key", e.target.value.trim()); } catch {} }} />
            <select className="v6-inp" style={{ marginTop: 6 }} value={p.sunoProv}
              onChange={e => { p.setSunoProv(e.target.value); try { localStorage.setItem("verve_suno_provider", e.target.value); } catch {} }}>
              <option value="kie">🥇 Kie.ai (rekomendasi)</option><option value="apiframe">Apiframe.ai</option><option value="sunor">Sunor.cc</option>
            </select>
          </div>
        )}
        <div className="v6-lbl">JUDUL LAGU</div>
        <input className="v6-inp" placeholder="cth: Rindu Ibu di Ujung Doa" value={p.mTitle} onChange={e => p.setMTitle(e.target.value)} />
        <div className="v6-lbl">MODE</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          <button className={`v6-chip ${p.mVocal === "vocal" ? "on" : ""}`} onClick={() => p.setMVocal("vocal")}>🎤 Vokal + Lirik</button>
          <button className={`v6-chip ${p.mVocal === "instrumental" ? "on" : ""}`} onClick={() => p.setMVocal("instrumental")}>🎹 Instrumen saja</button>
        </div>
        {p.mVocal === "vocal" && <>
          <div className="v6-lbl">LIRIK (orisinal — aman hak cipta ✅)</div>
          <textarea className="v6-inp v6-ta" placeholder="Tulis lirik di sini…" value={p.mLyrics} onChange={e => p.setMLyrics(e.target.value)} />
        </>}
        <div className="v6-lbl">GENRE</div>
        <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
          {MUSIC_GENRES.map(g => <button key={g} className={`v6-chip ${p.mGenre === g ? "on" : ""}`} onClick={() => p.setMGenre(g)}>{g}</button>)}
        </div>
        <div className="v6-lbl">SUASANA</div>
        <input className="v6-inp" placeholder="cth: melankolis, menyentuh, epik" value={p.mMood} onChange={e => p.setMMood(e.target.value)} />
        <div className="v6-lbl">STYLE PROMPT (otomatis — boleh diedit)</div>
        <textarea className="v6-inp" style={{ minHeight: 60 }} value={p.mStyle} placeholder={""} onChange={e => p.setMStyle(e.target.value)} />
        <div className="v6-lbl">MODEL</div>
        <select className="v6-inp" value={p.mModel} onChange={e => p.setMModel(e.target.value)}>
          {["suno-v5.5", "suno-v5", "suno-v4.5", "suno-v4", "suno-v3.5"].map(m => <option key={m} value={m}>{m}{m === "suno-v5.5" ? " 💎 terbaik" : m === "suno-v3.5" ? " ⚡ tercepat" : ""}</option>)}
        </select>
        {p.mStatus && (
          <div className={p.mStatus === "selesai" ? "v6-okbox" : "v6-risk"}>
            {p.mStatus === "selesai" ? "✅ Lagu selesai & sudah masuk track audio!" : p.mStatus === "gagal" ? "❌ Gagal — coba lagi atau ganti model/provider." : p.mStatus === "memulai..." ? "⏳ Memulai…" : "⏳ Lagu sedang diolah server (1–6 menit). Polling jalan otomatis — silakan lanjut edit yang lain."}
          </div>
        )}
        {p.mTask && <button className="v6-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={p.onCek}>🔄 Cek status lagu (gratis)</button>}
        {p.musicUrl && <div className="v6-okbox">🎵 Musik aktif di track audio ✅</div>}
        <div className="v6-note">🛡️ Lagu yang dibuat AI di sini adalah <b>orisinal</b> — bebas kamu pakai di YouTube/TikTok tanpa klaim (versi gratis & berbayar sama-sama aman dipakai komersial sesuai ketentuan provider).</div>
      </div>
    </div>
  );
}

/* ---------- KAMERA ---------- */
function KameraModal({ onClose, onPhoto }: any) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const stRef = useRef<MediaStream | null>(null);
  const [face, setFace] = useState<"user" | "environment">("environment");
  useEffect(() => {
    let off = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: face }, audio: false }).then(st => {
      if (off) { st.getTracks().forEach(t => t.stop()); return; }
      stRef.current = st;
      if (vidRef.current) vidRef.current.srcObject = st;
    }).catch(() => alert("📷 Kamera tidak bisa diakses (izin ditolak?)."));
    return () => { off = true; stRef.current?.getTracks().forEach(t => t.stop()); };
  }, [face]);
  function snap() {
    const v = vidRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    onPhoto(c.toDataURL("image/jpeg", 0.9));
  }
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>Ambil gambar</h3>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={() => setFace(f => f === "user" ? "environment" : "user")}>🔄</button>
        </div>
        <video ref={vidRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 14, background: "#000", aspectRatio: "3/4", objectFit: "cover" }} />
        <button className="v6-bigcta" onClick={snap}>📸 Jepret & masukkan ke timeline</button>
      </div>
    </div>
  );
}

/* ---------- WIZARD PEMBUAT AI ---------- */
function WizardModal(p: any) {
  return (
    <div className="v6-full">
      <div className="fh">
        <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={p.onClose}>✕</button>
        <div className="t">🧠 Pembuat AI</div>
        <div style={{ width: 38 }} />
      </div>
      <div className="fb">
        <div className="v6-lbl">IDE / NICHE KONTEN</div>
        <textarea className="v6-inp" style={{ minHeight: 70 }} placeholder="cth: cerita sedih perjuangan ibu membesarkan anak" value={p.niche} onChange={e => p.setNiche(e.target.value)} />
        <div className="v6-note" style={{ marginTop: 2 }}>aksi: AI bikin <b>judul → visual → audio</b> otomatis jadi proyek siap edit.</div>
        <div className="v6-lbl">JUMLAH KLIP</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          {[3, 4, 6, 8].map(n => <button key={n} className={`v6-chip ${p.n === n ? "on" : ""}`} onClick={() => p.setN(n)}>{n} klip</button>)}
        </div>
        <div className="v6-lbl">GAYA VISUAL</div>
        <div className="v6-grid4">
          {IMG_STYLE_PRESETS.map(s => (
            <button key={s.id} className={`v6-gcell ${p.styleId === s.id ? "on" : ""}`} onClick={() => p.setStyle(s.id)}>
              <span style={{ fontSize: 18 }}>{s.label.split(" ")[0]}</span><span className="l">{s.label.split(" ").slice(1).join(" ")}</span>
            </button>
          ))}
        </div>
        <div className="v6-lbl">AUDIO</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          {([["tts", "🗣️ Narasi AI"], ["suno", "🎵 Lagu AI"], ["none", "🔇 Tanpa audio"]] as any[]).map(([id, lb]) => (
            <button key={id} className={`v6-chip ${p.audio === id ? "on" : ""}`} onClick={() => p.setAudio(id)}>{lb}</button>
          ))}
        </div>
        <button className="v6-bigcta" onClick={p.onRun} disabled={p.loading === "wizard"}>
          {p.loading === "wizard" ? "⏳ Menggenerasi…" : "🚀 Buat proyek sekarang"}</button>
        {p.loading === "wizard" && !!p.stageText && <div className="v6-okbox">{p.stageText}</div>}
        <div className="v6-note">⏱ Proses 1–3 menit (gambar satu-satu). Untuk lagu AI, task berlanjut di background — cek di menu Musik AI.</div>
      </div>
    </div>
  );
}

/* ---------- SAMPUL ---------- */
function SampulModal({ slides, slideOptsById, timeline, ratio, getImage, onClose, onSave }: any) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [t, setT] = useState(0);
  const [txt, setTxt] = useState("");
  const total = timeline?.total || 0;
  const cw = ratio === "9:16" ? 270 : ratio === "1:1" ? 320 : 426;
  const ch = ratio === "9:16" ? 480 : ratio === "1:1" ? 320 : 240;
  useEffect(() => {
    const paint = () => {
      const cv = cvRef.current; if (!cv) return;
      const ctx = cv.getContext("2d") as CanvasRenderingContext2D | null; if (!ctx) return;
      const W = cv.width, H = cv.height;
      ctx.fillStyle = "#0a0a0e"; ctx.fillRect(0, 0, W, H);
      const tl = timeline; if (!tl || !slides.length) return;
      const L = locate(tl, Math.min(t, Math.max(0, tl.total - 0.001)));
      const opt = slideOptsById[slides[L.idx].id] || null;
      const cur = getImage(slides[L.idx].imageUrl);
      paintClips(ctx, W, H, cur, null, {
        clipT: L.clipT, clipDur: L.clipDur, inTrans: false, transT: 0, transId: "none",
        optCur: opt, optNxt: null, globalFilter: "none", absT: t, isMobile: true, beat: false, grain: 0, kbZoom: 1,
      } as any);
      if (txt.trim()) {
        const ct: ClipText = { ...DEFAULT_TEXT, txt, size: 0.085, y: 0.85, karaokeWords: undefined };
        paintClipTextSafe(ctx, W, H, ct);
      }
    };
    paint();
    const itv = setInterval(paint, 400); // gambar async loading
    return () => clearInterval(itv);
  }, [t, txt, slides, slideOptsById, timeline]); // eslint-disable-line
  return (
    <div className="v6-modal-back">
      <div className="v6-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="v6e-tbtn" style={{ color: "#fff" }} onClick={onClose}>✕</button>
          <h3 style={{ flex: 1, textAlign: "center" }}>✏️ Sampul proyek</h3>
          <div style={{ width: 38 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <canvas ref={cvRef} width={cw} height={ch} style={{ borderRadius: 12, border: "1px solid var(--v6-line)", maxWidth: "78vw" }} />
        </div>
        <div className="v6-slider-row"><div className="lr"><span>Pilih frame</span><b>{formatDur(t)}</b></div>
          <input type="range" min={0} max={Math.max(0.1, total - 0.01)} step={0.05} value={t} onChange={e => setT(Number(e.target.value))} /></div>
        <input className="v6-inp" placeholder="Teks judul di sampul (opsional)" value={txt} onChange={e => setTxt(e.target.value)} />
        <button className="v6-bigcta" onClick={() => onSave(cvRef.current!.toDataURL("image/jpeg", 0.82))}>✓ Simpan sampul</button>
        <div className="v6-note">Sampul tampil di <b>strip proyek terakhir</b> & halaman Proyek — jadi gampang dikenali.</div>
      </div>
    </div>
  );
}
function paintClipTextSafe(ctx: CanvasRenderingContext2D, W: number, H: number, ct: ClipText) {
  try { paintClipText(ctx, W, H, ct, 1, 10, 1, 1); } catch {}
}

/* ---------- GAMBAR AI (satu) ---------- */
function GambarAiModal({ onClose, onGen, loading }: any) {
  const [pr, setPr] = useState("");
  const [st, setSt] = useState("cinematic");
  return (
    <MiniModal title="🎨 Gambar AI" onClose={onClose}>
      <textarea className="v6-inp v6-ta" style={{ minHeight: 80 }} placeholder="Konsep gambar, cth: seorang ibu tua tersenyum memegang foto lama, cahaya senja hangat dari jendela" value={pr} onChange={e => setPr(e.target.value)} />
      <div className="v6-lbl">GAYA</div>
      <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap" }}>
        {IMG_STYLE_PRESETS.map(s => <button key={s.id} className={`v6-chip ${st === s.id ? "on" : ""}`} onClick={() => setSt(s.id)}>{s.label}</button>)}
      </div>
      <button className="v6-bigcta" disabled={loading === "image" || pr.trim().length < 8} onClick={() => onGen(pr, st)}>
        {loading === "image" ? "⏳ Membuat…" : "✨ Generate"}</button>
    </MiniModal>
  );
}

/* ---------- VIDEO AI ---------- */
function VideoAiModal({ onClose }: any) {
  const [pr, setPr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  async function gen() {
    if (pr.trim().length < 8) return alert("Tulis konsep dulu bro");
    setBusy(true); setResult("");
    try {
      const r = await fetch("/api/hcnsec/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: pr, duration: 5, aspectRatio: "9:16" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `Error ${r.status}`);
      if (d.video_url) setResult(d.video_url);
      else if (d.task_id || d.id) setResult("pending");
      else setResult("pending");
    } catch (e: any) { alert("Gagal: " + e.message); }
    setBusy(false);
  }
  return (
    <MiniModal title="🎬 Video AI (beta)" onClose={onClose}>
      <textarea className="v6-inp v6-ta" style={{ minHeight: 80 }} placeholder="cth: hujan turun di jendela kafe yang hangat, sinematik" value={pr} onChange={e => setPr(e.target.value)} />
      <button className="v6-bigcta" disabled={busy} onClick={gen}>{busy ? "⏳…" : "✨ Generate video pendek"}</button>
      {result === "pending" && <div className="v6-okbox">⏳ Video sedang dibuat server. Karena klip video AI belum bisa disisipkan langsung ke timeline (timeline kita berbasis foto klip), hasilnya dibuka di tab baru.</div>}
      {result && result !== "pending" && <a className="v6-okbox" style={{ display: "block" }} href={result} target="_blank" rel="noreferrer">▶️ Buka hasil video AI</a>}
    </MiniModal>
  );
}

/* ==================================================================
   EDIT FOTO (mini page)
   ================================================================== */
function EditFotoPage({ onExit }: any) {
  const [imgUrl, setImgUrl] = useState("");
  const [flt, setFlt] = useState("none");
  const [adjL, setAdjL] = useState<AdjustState>({ ...DEFAULT_ADJUST });
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    if (!imgUrl) { ctx.fillStyle = "#101016"; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const side = Math.min(720, Math.max(img.naturalWidth, 1));
      const ar = img.naturalWidth / img.naturalHeight;
      cv.width = ar >= 1 ? side : Math.round(side * ar);
      cv.height = ar >= 1 ? Math.round(side / ar) : side;
      ctx.filter = buildClipFilter(flt, adjL);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      ctx.filter = "none";
    };
    img.src = imgUrl;
  }, [imgUrl, flt, adjL]);
  return (
    <div className="v6-root" style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={onExit}>✕</button>
        <div className="spacer" />
        <b style={{ fontSize: 13 }}>Edit foto</b>
        <div className="spacer" />
        <button className="v6e-export" disabled={!imgUrl} onClick={() => {
          const cv = cvRef.current; if (!cv) return;
          cv.toBlob(b => { if (b) downloadBlob(b, `foto_verve_${Date.now()}.jpg`); }, "image/jpeg", 0.92);
        }}>Simpan</button>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", minHeight: 0, padding: 12 }}>
        {imgUrl ? <canvas ref={cvRef} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} /> : (
          <label style={{ textAlign: "center", color: "#9ca3af", cursor: "pointer" }}>
            <div style={{ fontSize: 42 }}>🖼️</div>
            <div style={{ fontSize: 12, marginBottom: 12 }}>Pilih foto untuk diedit</div>
            <span className="v6-btn">📥 Buka galeri</span>
            <input type="file" accept="image/*" hidden onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader(); r.onload = () => setImgUrl(r.result as string); r.readAsDataURL(f);
            }} />
          </label>
        )}
      </div>
      <div style={{ background: "#0b0b10", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", maxHeight: "46%", overflowY: "auto" }}>
        <div className="v6-chips" style={{ padding: "0 0 6px" }}>
          {FILTERS.map((f: any) => <button key={f.id} className={`v6-chip ${flt === f.id ? "on" : ""}`} onClick={() => setFlt(f.id)}>{f.emoji} {f.label}</button>)}
        </div>
        {ADJUST_DEFS.slice(0, 6).map((d: any) => (
          <div className="v6-slider-row" key={d.key} style={{ margin: "6px 2px" }}>
            <div className="lr"><span>{d.emoji} {d.label}</span><b>{(adjL as any)[d.key]}</b></div>
            <input type="range" min={d.min} max={d.max} value={(adjL as any)[d.key]} onChange={e => setAdjL({ ...adjL, [d.key]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================
   TRANSKRIPSIKAN (speech-to-text eksperimen)
   ================================================================== */
function TranskripPage({ onExit }: any) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("id-ID");
  async function transcribe(f: File) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Browser ini belum dukung transkripsi (pakai Chrome)."); return; }
    setBusy(true); setOut("");
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    const rec = new SR();
    rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) setOut(o => (o ? o + "\n" : "") + ev.results[i][0].transcript.trim());
      }
    };
    a.onended = () => { try { rec.stop(); } catch {}; setBusy(false); };
    a.onerror = () => { try { rec.stop(); } catch {}; setBusy(false); alert("Audio tidak terbaca."); };
    await a.play().then(() => { try { rec.start(); } catch {} }).catch(() => { setBusy(false); alert("Gagal memutar file."); });
  }
  return (
    <div className="v6-root" style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={onExit}>✕</button>
        <div className="spacer" /><b style={{ fontSize: 13 }}>📝 Transkripsikan</b><div className="spacer" />
        <button className="v6e-export" disabled={!out} onClick={() => copyTxt(out)}>Salin</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <div className="v6-cardrow" style={{ cursor: "default" }}>
          <span style={{ fontSize: 18 }}>🗣</span><div className="tt">Bahasa</div>
          <select className="v6-inp" style={{ width: 130, padding: "7px 10px" }} value={lang} onChange={e => setLang(e.target.value)}>
            <option value="id-ID">Indonesia</option><option value="en-US">English</option>
            <option value="jv-ID">Jawa</option><option value="su-ID">Sunda</option><option value="ms-MY">Melayu</option>
          </select>
        </div>
        <label className="v6-bigcta" style={{ display: "block", textAlign: "center" }}>
          {busy ? "🎧 Mendengarkan… jangan tutup" : "📥 Pilih file audio/video"}
          <input type="file" accept="audio/*,video/*" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) transcribe(f); }} />
        </label>
        <div className="v6-lbl">HASIL TRANSKRIP</div>
        <div className="v6-inp v6-ta" style={{ minHeight: 220, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{out || <span style={{ opacity: .4 }}>Teks akan muncul di sini…</span>}</div>
        <div className="v6-note">⚠️ Fitur ini memakai pengenal suara bawaan browser (eksperimen, paling akurat di Chrome). Verifikasi manual tetap disarankan.</div>
      </div>
    </div>
  );
}

/* ==================================================================
   HAK CIPTA — panduan status audio (jujur: bukan fingerprint scanner)
   ================================================================== */
function HakCiptaModal({ musicUrl, musicName, ttsUrl, voiceUrl, onClose }: any) {
  const isSuno = !!musicUrl && /^https?:/i.test(musicUrl) && /kie\.ai|suno|apiframe|sunor|aimusic|cdn|r2\.dev/i.test(musicUrl);
  const isEkstrak = !!musicUrl && musicUrl.startsWith("blob:");
  const isUpload = !!musicUrl && musicUrl.startsWith("data:");
  const rows: { ic: string; t: string; d: string; ok: "ok" | "warn" }[] = [];
  if (isSuno) rows.push({ ic: "✅", t: `Musik: "${musicName || "Lagu AI"}"`, d: "Dibuat AI (Suno) = orisinal buatanmu — risiko klaim sangat rendah. Aman buat YouTube/TikTok/monetisasi.", ok: "ok" });
  if (isEkstrak) rows.push({ ic: "⚠️", t: "Audio hasil ekstrak video", d: "Pastikan video sumbernya milikmu sendiri atau bebas lisensi. Mengekstrak lagu orang lain tetap berisiko klaim.", ok: "warn" });
  if (isUpload) rows.push({ ic: "⚠️", t: "Musik upload dari HP", d: "Status hak cipta mengikuti file aslinya. Kalau itu lagu artis/karya orang lain, YouTube bisa memberi klaim — pakai musik AI lebih aman.", ok: "warn" });
  if (ttsUrl) rows.push({ ic: "✅", t: "Narasi suara AI", d: "Suara sintetis dari teks kamu sendiri — aman.", ok: "ok" });
  if (voiceUrl) rows.push({ ic: "✅", t: "Rekaman suara sendiri", d: "Suara kamu sendiri — 100% aman.", ok: "ok" });
  if (!rows.length) rows.push({ ic: "ℹ️", t: "Belum ada audio", d: "Tambahkan audio dulu — nanti statusnya dicek di sini.", ok: "ok" });
  return (
    <MiniModal title="🛡 Cek Hak Cipta" onClose={onClose}>
      {rows.map(r => (
        <div key={r.t} className="v6-cardrow" style={{ cursor: "default", alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>{r.ic}</span>
          <div className="tt" style={{ fontSize: 12 }}>{r.t}
            <div style={{ fontSize: 10.5, color: r.ok === "ok" ? "#86efac" : "#fbbf24", fontWeight: 500, lineHeight: 1.5, marginTop: 2 }}>{r.d}</div>
          </div>
        </div>
      ))}
      <div className="v6-lbl">CHECKLIST AMAN UPLOAD</div>
      {["Gunakan musik dari Musik AI / instrumen bebas royalti", "Narasi = teks kamu sendiri atau TTS VERVE", "Visual = foto sendiri atau Gambar AI", "Hindari lagu artis & cuplikan film/orang lain"].map(c => (
        <div key={c} style={{ fontSize: 11.5, padding: "5px 2px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>✅ {c}</div>
      ))}
      <div className="v6-note">Catatan jujur bro: VERVE tidak memiliki database fingerprint seperti YouTube Content ID. Panel ini <b>panduan status berdasar SUMBER audio</b> yang kamu pakai — keputusan akhir tetap di sistem platform tujuan.</div>
    </MiniModal>
  );
}
