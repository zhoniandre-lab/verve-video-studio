"use client";
/**
 * 🎵 SUNO PANEL v19.29 — panel generate lagu yang SAMA PERSIS dengan fitur
 * "Generate Lagu" di Lahan Awalan, tapi MANDIRI (bisa dipasang di Spectrum
 * Studio / layar mana pun). Provider, API key multi-kunci, model v3.5-v5.5,
 * era/tempo/instrumen, genre/mood/vokal, lirik AI, generate + polling cerdas.
 * Hasil dikirim lewat callback `onSong(url, title, duration)`.
 */
import { useEffect, useRef, useState } from "react";
import { META_PROV_SUNO, LINK_AMBIL_KEY, LINK_DASH_PROV } from "@/lib/suno-providers";

const SUNO_KEYS_KEY = "verve_suno_keys_v1";
const SUNO_PROVIDERS = META_PROV_SUNO;
const PROVIDER_KEY_LINK = LINK_AMBIL_KEY;
/** 🛡 v19.35.4: dashboard tempat cek hasil manual kalau polling lama */
const PROVIDER_DASH: Record<string, string> = { ...LINK_DASH_PROV, apiframe: "https://apiframe.ai" };
const GENRES = ["pop ballad Melayu sedih", "akustik mellow piano", "orkes melankolis", "pop religi lembut", "folk sendu"];
const MOODS = ["haru", "rindu", "sedih", "menyentuh", "tenang"];
const SUNO_MODELS = [
  { id: "V4_5PLUS", label: "v4.5+", note: "✦ stabil & jernih" },
  { id: "V5_5", label: "v5.5", note: "🆕 terbaru" },
  { id: "V5", label: "v5.0", note: "baru" },
  { id: "V4_5ALL", label: "v4.5-all", note: "vokal lebih fokus" },
  { id: "V4_5", label: "v4.5", note: "" },
  { id: "V4", label: "v4.0", note: "hemat kredit" },
  { id: "V3_5", label: "v3.5", note: "klasik" },
];
const SUNO_ERAS = [
  { id: "2020s", label: "modern 2020-an" }, { id: "2010s", label: "2010-an" },
  { id: "2000s", label: "2000-an" }, { id: "90s", label: "90-an" }, { id: "80s", label: "80-an" },
];
const SUNO_TEMPOS = [{ id: "slow", label: "🐢 Lambat" }, { id: "mid", label: "🚶 Sedang" }, { id: "fast", label: "🏃 Cepat" }];
const SUNO_INSTRS = ["piano akustik", "gitar akustik", "biola & strings", "orkestra penuh", "suling", "gendang melayu", "synth ambient", "drum halus"];
const VOICES = [["auto", "🎭 Auto"], ["male", "👨 Pria"], ["female", "👩 Wanita"], ["instrumental", "🎼 Instrumental"]] as const;

function detectProvClient(k: string, fallback: string): string {
  const s = k.toLowerCase().trim();
  if (s.startsWith("kie") || s.startsWith("sk-kie")) return "kie";
  if (s.startsWith("afk_") || s.startsWith("af_")) return "apiframe";
  if (s.startsWith("snr_") || s.startsWith("sunor_")) return "sunor";
  if (/^[a-f0-9]{24,}$/i.test(k.trim())) return "kie";
  return fallback;
}

function proxify(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    return `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}

type SunoKey = { key: string; provider: string };
type Props = {
  defaultTitle?: string;
  defaultLyrics?: string;
  onSong: (url: string, title: string, duration?: number) => void;
  onClose?: () => void;
};

export default function SunoPanel({ defaultTitle = "", defaultLyrics = "", onSong, onClose }: Props) {
  const [sunoProv, setSunoProv] = useState(() => { try { return localStorage.getItem("verve_suno_provider") || "kie"; } catch { return "kie"; } });
  const [sunoModel, setSunoModel] = useState("V4_5PLUS");
  const [keyPool, setKeyPool] = useState<SunoKey[]>(() => { try { return JSON.parse(localStorage.getItem(SUNO_KEYS_KEY) || "[]"); } catch { return []; } });
  const [keyDraft, setKeyDraft] = useState("");
  const [keyPanel, setKeyPanel] = useState(false);
  const [creditInfo, setCreditInfo] = useState<Record<string, string>>({});
  const [checkingCredit, setCheckingCredit] = useState(false);
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [sEra, setSEra] = useState("");
  const [sTempo, setSTempo] = useState("");
  const [sInstr, setSInstr] = useState<string[]>([]);
  const [vocal, setVocal] = useState<"auto" | "male" | "female" | "instrumental">("auto");
  const [lyrics, setLyrics] = useState(defaultLyrics);
  const [mStyle, setMStyle] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState("");
  const [done, setDone] = useState<{ url: string; title: string; duration?: number } | null>(null);
  const pollTimer = useRef<any>(null);
  const launchKeyRef = useRef("");
  /* 🛡 v19.35.4: health check provider (hidup/mati) + polling jujur */
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);
  const lastTaskRef = useRef("");
  const MAX_POLL = 40;

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  /* 🛡 v19.35.4: cek status hidup/mati provider dari server */
  useEffect(() => { cekHealth(); }, []);
  async function cekHealth() {
    setCheckingHealth(true);
    try {
      const r = await fetch("/api/hcnsec/music/health", { cache: "no-store" });
      const j = await r.json();
      const m: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(j.providers || {})) m[k] = !!(v as any).hidup;
      setHealth(m);
    } catch { /* biarkan netral */ }
    setCheckingHealth(false);
  }
  function terjemahErr(msg: string): string {
    if (/failed to fetch/i.test(msg)) return "Koneksi ke server terputus — cek internet kamu, lalu tap 'Cek ulang' di bawah.";
    if (/abort|timed out|timeout/i.test(msg)) return "Server terlalu lama merespons — tap 'Cek ulang' di bawah.";
    return msg;
  }

  function savePool(next: SunoKey[]) {
    setKeyPool(next);
    try { localStorage.setItem(SUNO_KEYS_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }
  function keysForProvider(): SunoKey[] {
    const pooled = keyPool.filter((k) => k.provider === sunoProv);
    if (pooled.length) return pooled;
    return [];
  }
  function sunoHeaders(keyOverride?: string): Record<string, string> {
    const k = (keyOverride ?? (launchKeyRef.current || keysForProvider()[0]?.key || "")).trim();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (k) { h["X-Suno-Key"] = k; h["X-Suno-Provider"] = sunoProv; }
    return h;
  }
  /* 🧠 v19.38: bawa key Dompet Bansos (OpenAI-compatible) — dipakai route lyrics
     sebagai sumber AI utama biar generate lirik JALAN tanpa key server. */
  function bansosHeaders(): Record<string, string> {
    try {
      const bc = JSON.parse(localStorage.getItem("verve_bansos_chat_v1") || "null");
      if (bc && bc.base && bc.key) {
        const h: Record<string, string> = { "x-bansos-chat-base": String(bc.base), "x-bansos-chat-key": String(bc.key) };
        if (bc.model) h["x-bansos-chat-model"] = String(bc.model);
        return h;
      }
    } catch { /* abaikan */ }
    return {};
  }
  function addKeysFromDraft() {
    const lines = keyDraft.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const next = [...keyPool];
    let added = 0;
    lines.forEach((k) => {
      if (next.some((x) => x.key === k)) return;
      next.push({ key: k, provider: detectProvClient(k, sunoProv) });
      added++;
    });
    savePool(next);
    setKeyDraft("");
    flash(added ? `🔑 ${added} kunci ditambah` : "Semua kunci sudah ada");
  }
  function removeKey(key: string) { savePool(keyPool.filter((k) => k.key !== key)); }
  function clearKeys() { savePool(keyPool.filter((k) => k.provider !== sunoProv)); setCreditInfo({}); }
  function flash(t: string) { setPollMsg(t); setTimeout(() => setPollMsg((m) => (m === t ? "" : m)), 2500); }

  async function cekKredit() {
    const keys = keysForProvider().map((k) => k.key);
    if (!keys.length) { setErr("Belum ada kunci tersimpan"); return; }
    setCheckingCredit(true); setErr("");
    try {
      const r = await fetch("/api/hcnsec/music-credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: sunoProv, keys }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const map: Record<string, string> = {};
      (j.results || []).forEach((res: { key: string; status: string; credit?: number; msg?: string }) => {
        map[res.key] = res.status === "ok" ? `💳 ${res.credit}` : (res.msg || "");
      });
      setCreditInfo(map);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal cek kredit"); }
    finally { setCheckingCredit(false); }
  }

  async function genLyrics() {
    if (!defaultTitle.trim()) { setErr("Judul belum ada — isi judul dulu."); return; }
    setBusy("lyrics"); setErr("");
    try {
      const r = await fetch("/api/hcnsec/lyrics", { method: "POST", headers: { "Content-Type": "application/json", ...bansosHeaders() }, body: JSON.stringify({ title: defaultTitle, keyword: defaultTitle, niche: "cerita jadi lagu / lagu emosional", genre, mood }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLyrics(j.lyrics || "");
      if (j.style_prompt_suno) setMStyle(j.style_prompt_suno);
      flash("✨ Lirik jadi — cek & poles sesukamu");
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal buat lirik"); }
    finally { setBusy(""); }
  }

  async function checkOnce(id: string): Promise<"done" | "pending"> {
    const ac = new AbortController();
    const wd = setTimeout(() => ac.abort(), 40000);
    const r = await fetch(`/api/hcnsec/music?id=${encodeURIComponent(id)}`, { headers: sunoHeaders(), cache: "no-store", signal: ac.signal }).finally(() => clearTimeout(wd));
    const pd = await r.json().catch(() => ({}));
    const { pilihKlipDariHasil } = await import("@/lib/suno-normalize");
    const clips = pilihKlipDariHasil(pd);
    const url = clips[0]?.url || pd.audio_url || pd.audioUrl || pd.url || pd.stream_url;
    if (url) {
      const dur = Number(clips[0]?.duration ?? (pd.duration && clips.length ? Number(pd.duration) / clips.length : Number(pd.duration)));
      finishSong({ url, title: clips[0]?.title || pd.title || defaultTitle || "Lagu AI", duration: isFinite(dur) && dur > 0 ? dur : undefined });
      return "done";
    }
    if (pd.status === "error" || pd.error) throw new Error(pd.error || "Provider gagal generate");
    return "pending";
  }

  function finishSong(res: { url: string; title: string; duration?: number }) {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setPolling(false);
    setDone(res);
    onSong(res.url, res.title, res.duration);
    setPollMsg("✅ Lagu jadi! Auto-terpasang sebagai audio.");
  }

  function startPolling(id: string) {
    setPolling(true);
    setErr("");
    lastTaskRef.current = id;
    const tMulai = Date.now();
    setPollMsg("⏳ Lagu sedang diolah… (bisa 1-6 menit, tergantung provider)");
    let idx = 0;
    const tick = async () => {
      idx++;
      // 🕐 v19.35.5: tampilkan DURASI proses yang sudah berjalan — user tahu nunggu berapa lama
      const detik = Math.floor((Date.now() - tMulai) / 1000);
      setPollMsg(`⏳ Mengecek hasil… (#${idx} · sudah ${Math.floor(detik / 60)}m ${String(detik % 60).padStart(2, "0")}s)`);
      try {
        const r = await checkOnce(id);
        if (r === "pending") {
          // 🛡 v19.35.4: batas polling wajar — jangan nunggu selamanya
          if (idx >= MAX_POLL) {
            setPolling(false);
            setErr(`⏱ Provider belum selesai setelah ${Math.round((Date.now() - tMulai) / 60000)} menit. Lagu MUNGKIN sudah jadi di dashboard provider — cek manual via tautan di bawah, atau tap "Cek ulang".`);
            return;
          }
          // 🐛 FIX v19.35.5: interval lebih cepat (5s awal → 12s maks) — hasil cepat kedeteksi
          pollTimer.current = setTimeout(tick, Math.min(5000 + idx * 700, 12000));
        }
      } catch (e) {
        setPolling(false);
        setErr("⚠️ " + terjemahErr(e instanceof Error ? e.message : "Gagal cek hasil"));
      }
    };
    pollTimer.current = setTimeout(tick, 4000);
  }
  function pollUlang() {
    if (lastTaskRef.current) startPolling(lastTaskRef.current);
  }

  async function generate() {
    const title = defaultTitle.trim();
    if (!title) { setErr("Isi judul dulu."); return; }
    const instrumental = vocal === "instrumental";
    const lyr = lyrics.trim();
    if (!instrumental && lyr.length < 30) { setErr("Lirik terlalu pendek (min 30 karakter) — generate lirik AI dulu atau pilih 🎼 Instrumental."); return; }
    const keys = keysForProvider();
    // 🛡 v19.35.4: provider yang terdeteksi mati → tolak lebih dulu (jangan buang waktu)
    if (health[sunoProv] === false) {
      setErr("⚠️ Provider ini lagi MATI (cek status 🩺 di atas). Pilih Kie.ai atau Sunor.cc — jangan buang waktumu.");
      return;
    }
    if (!keys.length) { setKeyPanel(true); setErr("Belum ada API key — buka 🔑 Setelan API Key di bawah, tempel key → Tambah. (Cara dapat gratis: daftar Kie.ai → 5.000 kredit → salin key di kie.ai/api-key)"); return; }
    setErr(""); setBusy("song"); setDone(null);
    const styleStr = (mStyle.trim() || [genre, mood, "indonesian, emotional, high quality"].join(", ")).slice(0, 480);
    const payload = {
      title: title.slice(0, 80),
      prompt: styleStr,
      lyrics: instrumental ? undefined : lyr,
      genre, tags: styleStr,
      custom: lyr.length > 30, instrumental,
      vocalGender: instrumental ? undefined : vocal === "auto" ? undefined : vocal,
      model: sunoModel,
      style_bits: { era: sEra || undefined, tempo: sTempo || undefined, instruments: sInstr.length ? sInstr.join(", ") : undefined },
      _raw_title: title.slice(0, 80), _raw_lyrics: lyr, _raw_style: styleStr,
    };
    const tries = Math.max(1, keys.length);
    let lastErr: Error | null = null;
    for (let ki = 0; ki < tries; ki++) {
      try {
        const acg = new AbortController();
        const wdg = setTimeout(() => acg.abort(), 65000);
        const r = await fetch("/api/hcnsec/music", { method: "POST", headers: sunoHeaders(keys[ki]?.key || ""), body: JSON.stringify(payload), signal: acg.signal }).finally(() => clearTimeout(wdg));
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { code: j.status });
        const dur = Number(j.duration);
        if (j.audio_url) {
          const { pilihKlipDariHasil } = await import("@/lib/suno-normalize");
          const clips = pilihKlipDariHasil(j);
          const singleDur = clips[0]?.duration || (j.duration && clips.length ? Number(j.duration) / clips.length : dur);
          finishSong({ url: j.audio_url, title: j.title || title, duration: isFinite(singleDur) && singleDur > 0 ? singleDur : undefined });
          setBusy(""); return;
        }
        const id = j.id || j.taskId || j.task_id;
        if (!id) throw new Error("Server tidak kasih taskId — coba lagi.");
        launchKeyRef.current = keys[ki]?.key || "";
        setBusy("");
        startPolling(id);
        return;
      } catch (e) {
        const er = e as Error & { code?: string };
        lastErr = er;
        const keyProblem = er.code === "quota_error" || er.code === "auth_error" || er.code === "need_key" || /401|402|kredit|habis|invalid|credit|insufficient|balance/i.test(er.message);
        if (keyProblem && ki < tries - 1) { flash(`🔑 Kunci ${ki + 1} ditolak — pindah kunci ${ki + 2}/${tries}…`); continue; }
        break;
      }
    }
    setBusy("");
    setErr(lastErr?.message || "Gagal generate");
  }

  const maskKey = (k: string) => (k.length > 10 ? `${k.slice(0, 5)}…${k.slice(-4)}` : k);

  return (
    <div className="lh-card" style={{ borderColor: "rgba(139,92,246,.4)", marginTop: 10 }}>
      <div className="lh-h1">🎵 Generate Lagu (Suno) <span style={{ fontSize: 9, background: "rgba(139,92,246,.15)", color: "#8b5cf6", padding: "2px 8px", borderRadius: 999, verticalAlign: "middle" }}>SAMA SEPERTI DI LAHAN</span></div>
      {!!onClose && <button className="lh-mini" style={{ float: "right" }} onClick={onClose}>✕</button>}
      <p className="lh-sub">Judul: <b>{defaultTitle || "— (isi judul dulu)"}</b> · lagu diolah Suno lewat provider pilihanmu. API key disimpan di HP-mu saja.</p>

      <div className="lh-kv"><span>Provider</span><b>
        <select className="lh-sel" value={sunoProv} onChange={(e) => { setSunoProv(e.target.value); try { localStorage.setItem("verve_suno_provider", e.target.value); } catch { /* abaikan */ } setCreditInfo({}); }}>
          {SUNO_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}{health[p.id] === false ? " — 💀 MATI" : health[p.id] === true ? " — ✅ hidup" : ""}</option>)}
        </select>
      </b>
        <button className="lh-mini" onClick={cekHealth} disabled={checkingHealth} title="Cek status provider dari server">{checkingHealth ? "⏳…" : "🩺 Cek status"}</button>
      </div>
      {health[sunoProv] === false && (
        <p className="lh-note" style={{ color: "#fca5a5", border: "1px solid rgba(239,68,68,.4)", padding: "6px 8px", borderRadius: 8, marginTop: 4 }}>
          💀 Provider ini terdeteksi MATI dari server — ganti ke <b>Kie.ai</b> (🥇 utama) atau <b>Sunor.cc</b>. Klik 🩺 Cek status untuk memastikan.
        </p>
      )}

      <button className="lh-btn sec" onClick={() => setKeyPanel(!keyPanel)}>
        🔑 Setelan API Key — {keysForProvider().length} kunci tersimpan {keyPanel ? "▴" : "▾"}
      </button>
      {keyPanel && (
        <div className="lh-keypanel">
          {PROVIDER_KEY_LINK[sunoProv]?.url && (
            <a className="lh-keylink" href={PROVIDER_KEY_LINK[sunoProv].url} target="_blank" rel="noreferrer">
              🔑 Ambil API key di {SUNO_PROVIDERS.find((p) => p.id === sunoProv)?.label.replace(/^🥇 /, "")} ↗
            </a>
          )}
          <p className="lh-note">{PROVIDER_KEY_LINK[sunoProv]?.hint || ""}<br />2. Tempel <b>satu kunci per baris</b> → + Tambah. Bisa BANYAK kunci: kalau satu habis, mesin otomatis pindah berikutnya.</p>
          <textarea className="lh-ta" rows={3} placeholder={sunoProv === "kie" ? "sk-kie-xxx\nsk-kie-yyy" : "kunci_baris_1\nkunci_baris_2"} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="lh-btn" style={{ flex: 1.4, marginTop: 0 }} disabled={!keyDraft.trim()} onClick={addKeysFromDraft}>＋ Tambah</button>
            <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} disabled={checkingCredit || !keysForProvider().length} onClick={cekKredit}>{checkingCredit ? "⏳…" : "🔄 Cek Kredit"}</button>
            <button className="lh-btn sec" style={{ flex: 1, marginTop: 0 }} disabled={!keysForProvider().length} onClick={clearKeys}>🗑 Hapus</button>
          </div>
          <div className="lh-keyshead"><span>KUNCI TERSIMPAN</span><span>{keysForProvider().length} kunci</span></div>
          {!keysForProvider().length && <p className="lh-note" style={{ textAlign: "center" }}><i>Belum ada kunci.</i></p>}
          {keysForProvider().map((k) => (
            <div key={k.key} className="lh-keyrow">
              <span className="k">{maskKey(k.key)}</span>
              <span className="cr">{creditInfo[k.key] || ""}</span>
              <button className="lh-mini" onClick={() => removeKey(k.key)}>🗑</button>
            </div>
          ))}
        </div>
      )}

      <div className="lh-h2" style={{ marginTop: 10 }}>🎚️ Versi model</div>
      <div className="lh-chips" style={{ flexWrap: "wrap" }}>
        {SUNO_MODELS.map((m) => (
          <button key={m.id} className={`lh-chip ${sunoModel === m.id ? "on" : ""}`} onClick={() => setSunoModel(m.id)}>{m.label} <small style={{ opacity: .6 }}>{m.note}</small></button>
        ))}
      </div>

      <div className="lh-h2" style={{ marginTop: 10 }}>🎼 Gaya & suasana</div>
      <div className="lh-chips" style={{ flexWrap: "wrap" }}>
        {GENRES.map((g) => <button key={g} className={`lh-chip ${genre === g ? "on" : ""}`} onClick={() => setGenre(g)}>{g}</button>)}
      </div>
      <div className="lh-chips" style={{ flexWrap: "wrap", marginTop: 6 }}>
        {MOODS.map((m) => <button key={m} className={`lh-chip ${mood === m ? "on" : ""}`} onClick={() => setMood(m)}>{m}</button>)}
      </div>

      <div className="lh-h2" style={{ marginTop: 10 }}>🎚️ Era · Tempo · Instrumen <span className="lh-note">(boleh pilih banyak instrumen)</span></div>
      <div className="lh-chips" style={{ flexWrap: "wrap" }}>
        {SUNO_ERAS.map((e) => <button key={e.id} className={`lh-chip ${sEra === e.id ? "on" : ""}`} onClick={() => setSEra(sEra === e.id ? "" : e.id)}>{e.label}</button>)}
        {SUNO_TEMPOS.map((t) => <button key={t.id} className={`lh-chip ${sTempo === t.id ? "on" : ""}`} onClick={() => setSTempo(sTempo === t.id ? "" : t.id)}>{t.label}</button>)}
      </div>
      <div className="lh-chips" style={{ flexWrap: "wrap", marginTop: 6 }}>
        {SUNO_INSTRS.map((ins) => <button key={ins} className={`lh-chip ${sInstr.includes(ins) ? "on" : ""}`} onClick={() => setSInstr(sInstr.includes(ins) ? sInstr.filter((x) => x !== ins) : [...sInstr, ins])}>{ins}</button>)}
      </div>

      <div className="lh-h2" style={{ marginTop: 10 }}>🎤 Vokal</div>
      <div className="lh-chips">
        {VOICES.map(([id, lb]) => <button key={id} className={`lh-chip ${vocal === id ? "on" : ""}`} onClick={() => setVocal(id)}>{lb}</button>)}
      </div>

      <div className="lh-h2" style={{ marginTop: 10 }}>📝 Lirik {vocal !== "instrumental" && <button className="lh-mini" onClick={genLyrics} disabled={busy === "lyrics"}>{busy === "lyrics" ? "⏳…" : "✨ Generate lirik AI"}</button>}</div>
      <textarea className="lh-ta" rows={5} placeholder={vocal === "instrumental" ? "Instrumental — tanpa lirik" : "Lirik lagu… (min 30 karakter) — bisa di-generate otomatis"} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      <div className="lh-h2" style={{ marginTop: 10 }}>🎨 STYLE LAGU (bebas — tulis apa saja)</div>
      <textarea className="lh-ta" rows={2} placeholder="Contoh: epic orchestral, female vocal, dramatic build-up, emotional piano&#10;Atau: orkestra megah, vokal wanita, piano sendu, sedih mengharu" value={mStyle} onChange={(e) => setMStyle(e.target.value)} />
      <p className="lh-note" style={{ marginTop: 4 }}>Kosongkan = pakai genre + mood di atas. Style ini yang dikirim ke Suno (bebas bahasa Inggris/Indonesia).</p>

      {!!err && <p className="lh-note" style={{ color: "#e85c5c", marginTop: 8 }}>⚠️ {err}</p>}
      {!!pollMsg && <p className="lh-note" style={{ color: "#6ee7b7", marginTop: 6 }}>{pollMsg}</p>}
      {done && <p className="lh-note" style={{ color: "#6ee7b7" }}>✅ {done.title} siap — dipakai sebagai audio video.</p>}
      {/* 🛡 v19.35.4: polling berhenti (error/batas) → kasih aksi: cek ulang + cek manual */}
      {!!err && !!lastTaskRef.current && !polling && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <button className="lh-btn sec" style={{ marginTop: 0, flex: 1 }} onClick={pollUlang}>🔁 Cek ulang</button>
          {!!PROVIDER_DASH[sunoProv] && (
            <a className="lh-btn sec" style={{ marginTop: 0, textDecoration: "none", textAlign: "center", flex: 1 }} href={PROVIDER_DASH[sunoProv]} target="_blank" rel="noreferrer">
              👀 Cek manual di {SUNO_PROVIDERS.find((p) => p.id === sunoProv)?.label.replace(/^🥇 /, "")}
            </a>
          )}
        </div>
      )}

      <button className="lh-btn" style={{ marginTop: 10 }} disabled={busy === "song" || polling} onClick={generate}>
        {busy === "song" ? "⏳ Mengirim ke dapur lagu…" : polling ? "⏳ Lagu sedang diolah…" : "🎵 Generate Lagu"}
      </button>
    </div>
  );
}
