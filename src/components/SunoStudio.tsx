"use client";
/* 🎵 v19.61 SUNO STUDIO — menu KHUSUS Generate Lagu di dashboard.
   Fokus satu hal: bikin lagu AI → dapat audio UTUH (segmen digabung) → pakai.
   Provider: Kie.ai · Sunor.cc · Suno Resmi (cookie akun suno.com, 50 kredit/hari).
   Hasil tersimpan di localStorage 'verve_suno_hasil' → bisa langsung dipakai
   di Spectrum Studio / Editor (mereka baca storage ini). */
import { useEffect, useRef, useState } from "react";

const PROVIDERS = [
  { id: "kie", label: "🥇 Kie.ai (utama)", hint: "Key dari kie.ai → API Keys", keyUrl: "https://kie.ai/api-key" },
  { id: "sunor", label: "☀️ Sunor.cc", hint: "Key dari sunor.cc (sk_live_…)", keyUrl: "https://sunor.cc" },
  { id: "suno-resmi", label: "🎵 Suno Resmi (cookie akun)", hint: "Cookie session suno.com — akun gratis 50 kredit/hari (lihat Bot Buruan → Suno)", keyUrl: "https://suno.com" },
];
const MODELS = ["suno-v5.5", "suno-v5", "suno-v4.5", "suno-v4", "suno-v3.5"];

export default function SunoStudio({ onExit }: { onExit?: () => void }) {
  const [prov, setProv] = useState(() => { try { return localStorage.getItem("verve_suno_provider") || "kie"; } catch { return "kie"; } });
  const [key, setKey] = useState(() => { try { return localStorage.getItem("verve_suno_key") || ""; } catch { return ""; } });
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [model, setModel] = useState("suno-v5");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [taskId, setTaskId] = useState("");
  const [pollUi, setPollUi] = useState<{ attempt: number; elapsed: number; last: string }>({ attempt: 0, elapsed: 0, last: "" });
  const [hasil, setHasil] = useState<{ url: string; title: string; dur: number } | null>(null);
  const pollTimer = useRef<any>(null);
  const tickTimer = useRef<any>(null);

  // baca hasil terakhir dari storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("verve_suno_hasil");
      if (raw) { const h = JSON.parse(raw); if (h?.url) setHasil(h); }
    } catch {}
    return () => { clearInterval(pollTimer.current); clearInterval(tickTimer.current); };
  }, []);

  const saveKey = (p: string, k: string) => {
    setProv(p); setKey(k);
    try { localStorage.setItem("verve_suno_provider", p); localStorage.setItem("verve_suno_key", k.trim()); } catch {}
  };

  const generate = async () => {
    if (!title.trim()) { setStatus("⚠️ Isi judul lagu dulu."); return; }
    if (!key.trim() && prov !== "suno-resmi") { setStatus("⚠️ Tempel API key provider dulu (atau pilih Suno Resmi + cookie akun)."); return; }
    setBusy(true); setStatus("⏳ Mengirim ke provider…"); setHasil(null); setTaskId("");
    const ts = Date.now();
    const tick = setInterval(() => setPollUi((p) => ({ ...p, elapsed: Math.round((Date.now() - ts) / 1000) })), 1000);
    tickTimer.current = tick;
    try {
      const r = await fetch("/api/hcnsec/music", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Suno-Key": key.trim(), "X-Suno-Provider": prov },
        body: JSON.stringify({
          title: title.trim(), prompt: style.trim(), lyrics: instrumental ? undefined : lyrics.trim(),
          genre: "", tags: style.trim(), custom: lyrics.trim().length > 30 && !instrumental,
          model, instrumental, _raw_title: title.trim(), _raw_style: style.trim(), _raw_lyrics: lyrics.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (j.audio_url || j.audio_urls?.length) {
        await pakaiHasil(j);
        return;
      }
      const id = j.id || j.taskId || j.task_id;
      if (!id) throw new Error("Server tidak kasih taskId.");
      setTaskId(id); setStatus("⏳ Lagu diproses — polling jalan…");
      await poll(id);
    } catch (e: any) {
      setStatus(`❌ ${e?.message || "Gagal generate"}`);
    } finally { setBusy(false); clearInterval(tick); }
  };

  const poll = async (id: string, attempt = 1) => {
    for (let i = attempt; i <= 60; i++) {
      setPollUi((p) => ({ ...p, attempt: i, last: i === 1 ? "menghubungi server" : `cek #${i}` }));
      try {
        const r = await fetch(`/api/hcnsec/music?id=${encodeURIComponent(id)}`, { headers: { "X-Suno-Key": key.trim(), "X-Suno-Provider": prov }, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j.audio_url || j.audio_urls?.length) { await pakaiHasil(j); return; }
        if (j.status === "error" || j.error) throw new Error(j.error || "Provider error");
      } catch (e: any) {
        if (i >= 60) throw e;
      }
      await new Promise((res) => setTimeout(res, 8000));
    }
  };

  // 🎵 v19.61: gabung segmen kalau >1 → lagu utuh
  const pakaiHasil = async (j: any) => {
    let urls: string[] = [];
    if (Array.isArray(j?.audio_urls) && j.audio_urls.length) urls = j.audio_urls.filter((u: any) => typeof u === "string" && u.startsWith("http"));
    else if (typeof j?.audio_url === "string" && j.audio_url.startsWith("http")) urls = [j.audio_url];
    let url = urls[0] || "";
    let notice = "";
    if (urls.length > 1) {
      const { gabungUrlAudio } = await import("@/lib/gabung-audio");
      const g = await gabungUrlAudio(urls, (u) => `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`).catch(() => null);
      if (g) { url = g; notice = ` (digabung ${urls.length} segmen — utuh)`; }
    }
    if (!url) throw new Error("Provider tidak kasih audio.");
    // ukur durasi
    let dur = 0;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new AC();
      const r = await fetch(url.startsWith("/") ? url : `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`);
      const buf = await ac.decodeAudioData(await r.arrayBuffer());
      dur = buf.duration; ac.close();
    } catch {}
    const h = { url, title: j?.title || title || "Lagu AI", dur };
    setHasil(h); setStatus(`✅ Lagu jadi${notice} — ${dur ? `±${Math.round(dur)} dtk` : ""}. Bisa langsung dipakai di bawah.`);
    try { localStorage.setItem("verve_suno_hasil", JSON.stringify({ ...h, at: Date.now() })); } catch {}
  };

  const simpanHasil = async () => {
    if (!hasil) return;
    try {
      const r = await fetch(hasil.url.startsWith("/") ? hasil.url : `/api/hcnsec/proxy-audio?url=${encodeURIComponent(hasil.url)}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${(hasil.title || "lagu").replace(/[^\w\- ]+/g, "").slice(0, 40)}.mp3`;
      a.click();
      setStatus("📥 Download dimulai — cek folder Download HP.");
    } catch { setStatus("⚠️ Gagal download — coba buka Spectrum lalu pakai hasilnya."); }
  };

  return (
    <div className="gd-wrap">
      <div className="gd-top">
        <button onClick={() => onExit?.()}>×</button>
        <div><b>🎵 Generate Lagu (Suno)</b><span>Bikin lagu AI → utuh, nggak kepotong → langsung pakai</span></div>
      </div>

      <div className="gd-card">
        <div className="gd-label">PROVIDER</div>
        <select className="v6-inp" value={prov} onChange={(e) => saveKey(e.target.value, key)}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <p style={{ fontSize: 10.5, color: "#8b8b98", margin: "6px 0" }}>{PROVIDERS.find((p) => p.id === prov)?.hint}</p>
        <input className="v6-inp" style={{ marginTop: 4 }} placeholder={prov === "suno-resmi" ? "Tempel COOKIE session suno.com (buka suno.com → login → DevTools → Application → Cookies → salin semua)" : "Tempel API key"} value={key} onChange={(e) => saveKey(prov, e.target.value)} />
        <div className="v6-note" style={{ marginTop: 6 }}>Apiframe sudah MATI (blok) — dipakai Kie / Sunor / Suno Resmi.</div>
      </div>

      <div className="gd-card">
        <div className="gd-label">LAGU</div>
        <label className="gd-field wide"><span>Judul</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Rindu Ibu di Ujung Doa" /></label>
        <label className="gd-field wide"><span>Style / prompt</span><input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="cth: pop ballad, sedih, piano, female vocal, high quality" /></label>
        <label className="gd-field wide"><span>Lirik (kosongkan = instrumental / gaya bebas)</span>
          <textarea className="v6-inp v6-ta" rows={4} style={{ minHeight: 90 }} value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder={"Tulis lirik (≥30 huruf biar mode custom aktif)…\n[Verse]\nIbu…"} />
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button className={`v6-chip ${instrumental ? "on" : ""}`} onClick={() => setInstrumental(!instrumental)}>🎹 Instrumen saja</button>
          <select className="v6-inp" style={{ flex: 1, minWidth: 130 }} value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m} value={m}>{m}{m === "suno-v5.5" ? " 💎" : ""}</option>)}
          </select>
        </div>
        <button className="gd-diagnose" disabled={busy} onClick={generate}>{busy ? "⏳ Lagi bikin lagu…" : "🎵 Generate Lagu"}</button>
        {!!status && <p style={{ fontSize: 12, color: status.startsWith("✅") ? "#86efac" : status.startsWith("❌") ? "#fca5a5" : "#fbbf24", margin: "8px 0 0", lineHeight: 1.5 }}>{status}</p>}
        {!!taskId && busy && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cek #{pollUi.attempt} · {pollUi.elapsed}s · {pollUi.last} — lagu panjang bisa 2-5 menit</p>}
      </div>

      {hasil && (
        <div className="gd-card" style={{ borderColor: "rgba(34,197,94,.4)" }}>
          <div className="gd-label">✅ LAGU JADI</div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{hasil.title}{hasil.dur ? ` · ±${Math.round(hasil.dur)} dtk` : ""}</div>
          <audio controls src={hasil.url.startsWith("/") ? hasil.url : `/api/hcnsec/proxy-audio?url=${encodeURIComponent(hasil.url)}`} style={{ width: "100%", margin: "4px 0" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <button className="v6-bigcta" style={{ flex: 1, padding: "10px", background: "#22c55e", color: "#052e16" }} onClick={simpanHasil}>📥 Download MP3</button>
            <button className="v6-bigcta" style={{ flex: 1, padding: "10px" }} onClick={() => { try { localStorage.setItem("verve_suno_hasil", JSON.stringify({ ...hasil, at: Date.now() })); } catch {} location.href = "/#spectrum"; }}>🎧 Pakai di Spectrum</button>
          </div>
          <p style={{ fontSize: 10.5, color: "#8b8b98", marginTop: 6 }}>Hasil tersimpan otomatis — Spectrum & Editor bakal nawarin "Pakai hasil generate" pas dibuka.</p>
        </div>
      )}
    </div>
  );
}
