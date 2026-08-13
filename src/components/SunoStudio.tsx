"use client";
/* 🎵 v19.61 SUNO STUDIO — menu KHUSUS Generate Lagu di dashboard.
   🎵 v19.77: SATU generate = SATU lagu. Provider Suno kasih 2 variasi —
   ditampilkan TERPISAH (A/B), JANGAN digabung jadi 1 file dua nada.
   Hasil tersimpan di localStorage 'verve_suno_hasil' → Spectrum / Editor. */
import { useEffect, useRef, useState } from "react";
import { pilihKlipDariHasil, type KlipLagu } from "@/lib/suno-normalize";
import { META_PROV_SUNO } from "@/lib/suno-providers";

const PROVIDERS = META_PROV_SUNO;
const MODELS = ["suno-v5.5", "suno-v5", "suno-v4.5", "suno-v4", "suno-v3.5"];

export default function SunoStudio({ onExit }: { onExit?: () => void }) {
  const [prov, setProv] = useState(() => { try { return localStorage.getItem("verve_suno_provider") || "kie"; } catch { return "kie"; } });
  const [key, setKey] = useState(() => { try { return localStorage.getItem("verve_suno_key") || ""; } catch { return ""; } });
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  // 🎤 v19.62: pilihan VOKAL — auto / pria / wanita / instrumen
  const [vokal, setVokal] = useState<"auto" | "male" | "female" | "instrumental">("auto");
  const [model, setModel] = useState("suno-v5");
  // 🔑 v19.62: gerbang ganti key — muncul otomatis kalau kredit habis
  const [gantiKey, setGantiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [taskId, setTaskId] = useState("");
  const [pollUi, setPollUi] = useState<{ attempt: number; elapsed: number; last: string }>({ attempt: 0, elapsed: 0, last: "" });
  const [hasil, setHasil] = useState<{ url: string; urls?: string[]; previewUrl?: string; title: string; dur: number } | null>(null);
  const [klipList, setKlipList] = useState<KlipLagu[]>([]);
  const [klipIdx, setKlipIdx] = useState(0);
  const [modeHasil, setModeHasil] = useState<"satu" | "dua">("satu");
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
    setBusy(true); setStatus("⏳ Mengirim ke provider…"); setHasil(null); setKlipList([]); setKlipIdx(0); setTaskId("");
    const ts = Date.now();
    const tick = setInterval(() => setPollUi((p) => ({ ...p, elapsed: Math.round((Date.now() - ts) / 1000) })), 1000);
    tickTimer.current = tick;
    try {
      const instrumental = vokal === "instrumental";
      const r = await fetch("/api/hcnsec/music", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Suno-Key": key.trim(), "X-Suno-Provider": prov },
        body: JSON.stringify({
          title: title.trim(), prompt: style.trim(), lyrics: instrumental ? undefined : lyrics.trim(),
          genre: "", tags: style.trim(), custom: lyrics.trim().length > 30 && !instrumental,
          model, instrumental,
          vocalGender: vokal === "male" ? "male" : vokal === "female" ? "female" : undefined,
          _raw_title: title.trim(), _raw_style: style.trim(), _raw_lyrics: lyrics.trim(),
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
      const msg = e?.message || "Gagal generate";
      setStatus(`❌ ${msg}`);
      // 🔑 v19.62: kredit habis / key ditolak → langsung tawarkan GANTI KEY tanpa keluar
      if (/kredit|credit|quota|saldo|balance|insufficient|habis|401|402|403|invalid/i.test(msg)) {
        setGantiKey(true);
      }
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
        if (r.status === 401 || r.status === 402) throw new Error((j?.error || "Kredit habis / key ditolak"));
      } catch (e: any) {
        if (i >= 60) throw e;
      }
      await new Promise((res) => setTimeout(res, 8000));
    }
  };

  // 🎵 v19.77: JANGAN gabung 2 variasi Suno jadi 1 file. Satu URL = satu lagu.
  // 🎵 v19.63: validasi decode sebelum bilang berhasil.
  const pakaiHasil = async (j: any) => {
    const clips = pilihKlipDariHasil(j);
    if (!clips.length) throw new Error("Provider tidak kasih audio.");
    setKlipList(clips);
    const idx = 0;
    setKlipIdx(idx);
    await kunciKlip(clips[idx], clips, j?.title);
  };

  const kunciKlip = async (klip: KlipLagu, semua: KlipLagu[], judulInduk?: string, idxPakai?: number) => {
    const url = klip.url;
    if (!url) throw new Error("Provider tidak kasih audio.");
    const idx = typeof idxPakai === "number" ? idxPakai : Math.max(0, semua.findIndex((c) => c.url === klip.url));
    setKlipIdx(idx);
    let dur = 0;
    let bytes = 0;
    let lastErr = "gagal";
    const cobaDecode = async (src: string): Promise<boolean> => {
      try {
        const r = await fetch(src);
        const ab = await r.arrayBuffer();
        bytes = ab.byteLength;
        if (bytes < 1000) { lastErr = `file terlalu kecil (${bytes} byte)`; return false; }
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ac = new AC();
        const buf = await ac.decodeAudioData(ab);
        dur = buf.duration; ac.close();
        return true;
      } catch (e: any) { lastErr = e?.message || "gagal decode"; return false; }
    };
    const okDecode = url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")
      ? await cobaDecode(url)
      : (await cobaDecode(url)) || (await cobaDecode(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`));
    if (!okDecode) {
      throw new Error(`Audio hasil tidak valid (${(bytes / 1024).toFixed(0)} KB, ${lastErr.slice(0, 60)}) — link provider rusak/kadaluarsa atau butuh auth. Kredit mungkin kepakai. Coba generate ulang / ganti provider.`);
    }
    let previewUrl: string | undefined;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new AC();
      const r = await fetch(url.startsWith("/") ? url : `/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`);
      const buf = await ac.decodeAudioData(await r.arrayBuffer());
      const mono = ac.createBuffer(1, buf.length, 22050);
      const src = buf.getChannelData(0), dst = mono.getChannelData(0);
      const step = buf.sampleRate / 22050;
      for (let i = 0; i < dst.length; i++) dst[i] = src[Math.min(src.length - 1, Math.floor(i * step))];
      const { bufferToWav } = await import("@/lib/gabung-audio");
      previewUrl = URL.createObjectURL(new Blob([bufferToWav(mono)], { type: "audio/wav" }));
      ac.close();
    } catch { previewUrl = undefined; }
    const huruf = idx === 0 ? "A" : idx === 1 ? "B" : String(idx + 1);
    const notice = semua.length > 1
      ? (modeHasil === "dua" ? ` · versi ${huruf} (ada ${semua.length} pilihan terpisah)` : ` · versi ${huruf} (1 lagu, bukan digabung)`)
      : "";
    const h = { url, urls: [url], previewUrl, title: klip.title || judulInduk || title || "Lagu AI", dur };
    setHasil(h);
    setStatus(`✅ Lagu jadi${notice} — ±${Math.round(dur)} dtk (${(bytes / 1048576).toFixed(1)} MB).`);
    try {
      localStorage.setItem("verve_suno_hasil", JSON.stringify({
        url, urls: [url], clips: semua, pilih: idx, title: h.title, dur, at: Date.now(),
      }));
    } catch {}
  };

  // 🐛 v19.72 FIX: blob:/data: TIDAK boleh lewat proxy (proxy tolak → 'URL tidak valid').
  // Download & player harus fetch blob/data langsung.
  const srcAman = (u: string) =>
    u.startsWith("blob:") || u.startsWith("data:") || u.startsWith("/")
      ? u
      : `/api/hcnsec/proxy-audio?url=${encodeURIComponent(u)}`;

  const simpanHasil = async () => {
    if (!hasil) return;
    try {
      const r = await fetch(srcAman(hasil.url));
      const blob = await r.blob();
      if (!blob.size || blob.size < 1000 || (blob.type || "").includes("json")) {
        setStatus("❌ Download gagal — file yang dikasih provider tidak valid. Coba pakai '🎧 Pakai di Spectrum' (biasanya jalan), atau generate ulang.");
        return;
      }
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
        <div className="gd-label">PROVIDER & KEY</div>
        <select className="v6-inp" value={prov} onChange={(e) => saveKey(e.target.value, key)}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <p style={{ fontSize: 10.5, color: "#8b8b98", margin: "6px 0" }}>{PROVIDERS.find((p) => p.id === prov)?.hint}</p>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="v6-inp" style={{ flex: 1, minWidth: 0 }} placeholder={prov === "suno-resmi" ? "Tempel COOKIE session suno.com" : "Tempel API key"} value={key} onChange={(e) => saveKey(prov, e.target.value)} />
          {prov === "suno-resmi" ? (
            <a className="v6-btn" style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }} href="https://suno.com" target="_blank" rel="noreferrer">🔗 Buka suno.com & login ↗</a>
          ) : (
            <a className="v6-btn" style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }} href={PROVIDERS.find((p) => p.id === prov)?.keyUrl} target="_blank" rel="noreferrer">🔗 Ambil key ↗</a>
          )}
        </div>
        <div className="v6-note" style={{ marginTop: 6 }}>Apiframe & Mureka tetap mati/berbayar API. Provider yang bisa kamu AMBIL KEY-nya: 🥇 Kie · ☀️ Sunor · 🎧 MusicAPI · 🎧 AIMusicAPI · 🟣 SunoAPI.org · 🧬 EvoLink · ☄️ CometAPI · 🧩 TTAPI. Tap 🔗 Ambil key ↗ → daftar di situsnya → salin key → tempel di sini. Jujur: yang gratis cuma kredit uji (Kie/Sunor/MusicAPI/AIMusicAPI). EvoLink/Comet/TTAPI/SunoAPI.org umumnya berbayar setelah uji. Kalau kredit habis: akun email baru di situsnya, atau ganti provider.</div>
        {prov === "suno-resmi" && (
          <div style={{ marginTop: 8, border: "1px solid #ffffff1a", borderRadius: 12, padding: 10, background: "#0a0e16" }}>
            <b style={{ fontSize: 11.5, color: "#a5f3fc" }}>📋 CARA AMBIL COOKIE SUNO (5 langkah)</b>
            <ol style={{ fontSize: 10.5, color: "#cbd5e1", lineHeight: 1.6, margin: "6px 0 0", paddingLeft: 18 }}>
              <li>Buka <b>suno.com</b> di HP → login akun (bisa pakai Google).</li>
              <li>Ketuk ikon <b>⋮ / menu browser</b> → pilih <b>"Situs" / "Site settings"</b> (Chrome) atau <b>"Pengaturan situs"</b>.</li>
              <li>Cari bagian <b>Cookie</b> → ketuk <b>"Lihat semua cookie"</b>.</li>
              <li>Salin <b>SEMUA teks cookie</b> yang muncul (format: nama=nilai; nama2=nilai2…).</li>
              <li>Tempel di kolom di atas → Generate. (Akun gratis: 50 kredit/hari ±10 lagu.)</li>
            </ol>
            <p style={{ fontSize: 10, color: "#8b8b98", margin: "6px 0 0" }}>⚠️ Cookie ini rahasia — jangan dibagikan ke siapa pun.</p>
          </div>
        )}
        {/* 🔑 v19.62: GERBANG GANTI KEY — muncul otomatis kalau kredit habis/key ditolak */}
        {gantiKey && (
          <div style={{ marginTop: 10, border: "1px solid rgba(251,191,36,.5)", borderRadius: 12, padding: 10, background: "rgba(251,191,36,.08)" }}>
            <b style={{ fontSize: 12, color: "#fde68a" }}>🔑 Ganti key / pindah provider — biar langsung lanjut</b>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {PROVIDERS.map((p) => (
                <button key={p.id} className={`v6-chip ${prov === p.id ? "on" : ""}`} onClick={() => saveKey(p.id, "")}>
                  {p.label}
                </button>
              ))}
            </div>
            <input className="v6-inp" style={{ marginTop: 8 }} placeholder="Tempel key/cookie BARU di sini…" onChange={(e) => saveKey(prov, e.target.value)} />
            <button className="v6-chip" style={{ marginTop: 8, borderColor: "#fde68a55", color: "#fde68a" }} onClick={() => setGantiKey(false)}>✅ Selesai — tutup panel</button>
          </div>
        )}
      </div>

      <div className="gd-card">
        <div className="gd-label">LAGU</div>
        <label className="gd-field wide"><span>Judul</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Rindu Ibu di Ujung Doa" /></label>
        <label className="gd-field wide"><span>Style / prompt</span><input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="cth: pop ballad, sedih, piano, female vocal, high quality" /></label>
        <label className="gd-field wide"><span>Lirik (kosongkan = instrumental / gaya bebas)</span>
          <textarea className="v6-inp v6-ta" rows={4} style={{ minHeight: 90 }} value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder={"Tulis lirik (≥30 huruf biar mode custom aktif)…\n[Verse]\nIbu…"} />
        </label>
        <div className="v6-lbl" style={{ marginTop: 6 }}>VOKAL</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          {([["auto", "🎤 Auto"], ["male", "👨 Pria"], ["female", "👩 Wanita"], ["instrumental", "🎹 Instrumen"]] as const).map(([id, lb]) => (
            <button key={id} className={`v6-chip ${vokal === id ? "on" : ""}`} onClick={() => setVokal(id)}>{lb}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 800 }}>Model</span>
          <select className="v6-inp" style={{ flex: 1, minWidth: 0 }} value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m} value={m}>{m}{m === "suno-v5.5" ? " 💎" : ""}</option>)}
          </select>
        </div>
        <div className="v6-lbl" style={{ marginTop: 8 }}>HASIL GENERATE</div>
        <div className="v6-chips" style={{ padding: 0 }}>
          <button className={`v6-chip ${modeHasil === "satu" ? "on" : ""}`} onClick={() => setModeHasil("satu")}>1️⃣ Satu lagu</button>
          <button className={`v6-chip ${modeHasil === "dua" ? "on" : ""}`} onClick={() => setModeHasil("dua")}>🆎 2 pilihan terpisah</button>
        </div>
        <p style={{ fontSize: 10.5, color: "#8b8b98", margin: "6px 0 0", lineHeight: 1.45 }}>
          Provider Suno selalu bikin 2 variasi. Dulu dua-duanya <b>digabung 1 file</b> (jadi ±13 menit, dua nada beda). Sekarang: <b>satu lagu</b> = pakai versi A saja. <b>2 pilihan</b> = A dan B terpisah, kamu pilih. Tidak pernah disambung.
        </p>
        <button className="gd-diagnose" disabled={busy} onClick={generate}>{busy ? "⏳ Lagi bikin lagu…" : "🎵 Generate Lagu"}</button>
        {!!status && <p style={{ fontSize: 12, color: status.startsWith("✅") ? "#86efac" : status.startsWith("❌") ? "#fca5a5" : "#fbbf24", margin: "8px 0 0", lineHeight: 1.5 }}>{status}</p>}
        {!!taskId && busy && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cek #{pollUi.attempt} · {pollUi.elapsed}s · {pollUi.last} — lagu panjang bisa 2-5 menit</p>}
      </div>

      {hasil && (
        <div className="gd-card" style={{ borderColor: "rgba(34,197,94,.4)" }}>
          <div className="gd-label">✅ LAGU JADI</div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{hasil.title}{hasil.dur ? ` · ±${Math.round(hasil.dur)} dtk` : ""}</div>
          {klipList.length > 1 && (
            <div style={{ margin: "6px 0 10px" }}>
              <p style={{ fontSize: 11, color: "#86efac", margin: "0 0 6px", lineHeight: 1.45 }}>
                Ada {klipList.length} versi <b>terpisah</b> (bukan 1 file dua lagu). Pilih yang mau dipakai:
              </p>
              <div className="v6-chips" style={{ padding: 0 }}>
                {klipList.map((c, i) => (
                  <button
                    key={c.url + i}
                    className={`v6-chip ${klipIdx === i ? "on" : ""}`}
                    onClick={() => { void kunciKlip(c, klipList, hasil.title, i).catch((e: any) => setStatus(`❌ ${e?.message || "Gagal buka versi"}`)); }}
                  >
                    {i === 0 ? "🅰️ Versi A" : i === 1 ? "🅱️ Versi B" : `Versi ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <audio controls preload="metadata" src={hasil.previewUrl || srcAman(hasil.url)} style={{ width: "100%", margin: "4px 0" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <button className="v6-bigcta" style={{ flex: 1, padding: "10px", background: "#22c55e", color: "#052e16" }} onClick={simpanHasil}>📥 Download MP3</button>
            <button className="v6-bigcta" style={{ flex: 1, padding: "10px" }} onClick={() => { try { localStorage.setItem("verve_suno_hasil", JSON.stringify({ urls: [hasil.url], url: hasil.url, title: hasil.title, dur: hasil.dur, at: Date.now() })); } catch {} location.href = "/#spectrum"; }}>🎧 Pakai di Spectrum</button>
          </div>
          <p style={{ fontSize: 10.5, color: "#8b8b98", marginTop: 6 }}>Yang tersimpan = lagu yang sedang dipilih (satu file, satu gaya). Tidak disambung ke versi lain.</p>
        </div>
      )}
    </div>
  );
}
