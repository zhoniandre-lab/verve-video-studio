"use client";
/* 🎵 v19.61 SUNO STUDIO — menu KHUSUS Generate Lagu di dashboard.
   🎵 v19.77: SATU generate = SATU lagu. Provider Suno kasih 2 variasi —
   ditampilkan TERPISAH (A/B), JANGAN digabung jadi 1 file dua nada.
   🎵 v19.85: KEMBALI NORMAL — lagu dipakai apa adanya, tidak ada rute
   ke Spectrum (di Spectrum sudah ada generate lagu sendiri). */
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

  // 🧹 v19.85: tidak ada lagi hasil tersimpan di localStorage (rute ke Spectrum dihapus)
  useEffect(() => {
    return () => {
      clearInterval(pollTimer.current);
      clearInterval(tickTimer.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (backingAudioRef.current) {
        try { backingAudioRef.current.pause(); } catch {}
      }
    };
  }, []);

  // 🎤 Studio Vokal & Aransemen Cover States
  const [recState, setRecState] = useState<"idle" | "recording" | "mixed">("idle");
  const [vocalBlob, setVocalBlob] = useState<Blob | null>(null);
  const [vocalBuffer, setVocalBuffer] = useState<AudioBuffer | null>(null);
  const [backingBuffer, setBackingBuffer] = useState<AudioBuffer | null>(null);
  const [coverUrl, setCoverUrl] = useState<string>("");
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [reverbAmt, setReverbAmt] = useState<number>(30); // 0-100%
  const [eqAmt, setEqAmt] = useState<number>(50); // 0-100%
  const [glueAmt, setGlueAmt] = useState<number>(50); // 0-100%
  const [vocalVol, setVocalVol] = useState<number>(100); // 0-150%
  const [backingVol, setBackingVol] = useState<number>(80); // 0-150%
  const [recordingElapsed, setRecordingElapsed] = useState<number>(0);
  const [mixingBusy, setMixingBusy] = useState<boolean>(false);

  // 🔗 Aransemen Lanjutan / Remix (Method 2) States
  const [audioUrlRef, setAudioUrlRef] = useState("");
  const [continueAt, setContinueAt] = useState("0");
  const [isExtendMode, setIsExtendMode] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<any>(null);
  const backingAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const fmtD = (s: number): string => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const startRecording = async () => {
    if (!hasil) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      
      const options = { mimeType: "audio/webm" };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
        setVocalBlob(blob);
        
        // Decode the vocal blob
        try {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AC();
          const arrayBuffer = await blob.arrayBuffer();
          const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
          setVocalBuffer(decodedBuffer);
          ctx.close();
        } catch (e: any) {
          console.error("Gagal decode vokal:", e);
        }
        
        // Stop backing track
        if (backingAudioRef.current) {
          try { backingAudioRef.current.pause(); backingAudioRef.current.currentTime = 0; } catch {}
        }
        
        setRecState("mixed");
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
      
      // Play backing track
      const audio = new Audio(hasil.previewUrl || srcAman(hasil.url));
      audio.preload = "auto";
      audio.play().catch((e) => console.warn("Audio autoplay blocked or failed:", e));
      backingAudioRef.current = audio;
      
      setRecordingElapsed(0);
      setRecState("recording");
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingElapsed((p) => p + 1);
      }, 1000);
      
    } catch (e: any) {
      alert("Gagal mengakses microphone: " + (e?.message || e));
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (backingAudioRef.current) {
      try { backingAudioRef.current.pause(); } catch {}
    }
  };

  const prosesGabungCover = async () => {
    if (!vocalBuffer || !hasil) return;
    setMixingBusy(true);
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AC();
      
      // Fetch and decode the backing track if not already decoded
      let backBuf = backingBuffer;
      if (!backBuf) {
        const r = await fetch(hasil.previewUrl || srcAman(hasil.url));
        const ab = await r.arrayBuffer();
        backBuf = await tempCtx.decodeAudioData(ab);
        setBackingBuffer(backBuf);
      }
      
      const sampleRate = backBuf.sampleRate;
      const duration = Math.max(backBuf.duration, vocalBuffer.duration);
      
      const OfflineAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const ctx = new OfflineAC(2, sampleRate * duration, sampleRate);
      
      // 1. Backing track source
      const backSource = ctx.createBufferSource();
      backSource.buffer = backBuf;
      const backGain = ctx.createGain();
      backGain.gain.value = backingVol / 100;
      backSource.connect(backGain);
      
      // 2. Vocal source
      const vocSource = ctx.createBufferSource();
      vocSource.buffer = vocalBuffer;
      const vocGain = ctx.createGain();
      vocGain.gain.value = vocalVol / 100;
      
      // 3. EQ: High-pass at 120Hz + High-shelf boost at 8kHz
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 120;
      
      const hsFilter = ctx.createBiquadFilter();
      hsFilter.type = "highshelf";
      hsFilter.frequency.value = 8000;
      hsFilter.gain.value = (eqAmt / 100) * 6; // up to +6dB boost
      
      // Connect vocal to EQ
      vocSource.connect(hpFilter);
      hpFilter.connect(hsFilter);
      hsFilter.connect(vocGain);
      
      // 4. Studio Reverb (Convolver)
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = (reverbAmt / 100) * 0.45; // Wet level
      
      // Generate synthetic reverb impulse response
      const impulseLength = sampleRate * 2.0; // 2 seconds reverb
      const impulse = ctx.createBuffer(2, impulseLength, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      const decay = 4.0;
      for (let i = 0; i < impulseLength; i++) {
        const pct = i / impulseLength;
        const dec = Math.exp(-pct * decay);
        left[i] = (Math.random() * 2 - 1) * dec;
        right[i] = (Math.random() * 2 - 1) * dec;
      }
      
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      
      vocGain.connect(convolver);
      convolver.connect(reverbGain);
      
      // 5. Master / Glue Compressor
      const masterCompressor = ctx.createDynamicsCompressor();
      masterCompressor.threshold.value = -16 - (glueAmt / 100) * 12; // -16dB to -28dB
      masterCompressor.knee.value = 8;
      masterCompressor.ratio.value = 3 + (glueAmt / 100) * 3; // 3 to 6
      masterCompressor.attack.value = 0.02;
      masterCompressor.release.value = 0.12;
      
      // Connect outputs to master compressor
      backGain.connect(masterCompressor);
      vocGain.connect(masterCompressor);
      reverbGain.connect(masterCompressor);
      
      // Connect master compressor to destination
      masterCompressor.connect(ctx.destination);
      
      // Start sources
      backSource.start(0);
      vocSource.start(0);
      
      // Render
      const renderedBuffer = await ctx.startRendering();
      
      // Convert rendered buffer to WAV
      const { bufferToWav } = await import("@/lib/gabung-audio");
      const wav = bufferToWav(renderedBuffer);
      const blob = new Blob([wav], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setCoverBlob(blob);
      setCoverUrl(url);
      
      try { tempCtx.close(); } catch {}
    } catch (e: any) {
      alert("Gagal proses cover: " + (e?.message || e));
    } finally {
      setMixingBusy(false);
    }
  };

  const downloadCover = () => {
    if (!coverBlob || !hasil) return;
    const a = document.createElement("a");
    a.href = coverUrl;
    a.download = `cover_${hasil.title.replace(/[^\w\- ]+/g, "").slice(0, 30)}_${Date.now()}.wav`;
    a.click();
  };

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
          audio_url: isExtendMode && audioUrlRef.trim() ? audioUrlRef.trim() : undefined,
          continue_at: isExtendMode && continueAt ? Number(continueAt) : undefined,
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
    let bytes = 0;
    let lastErr = "gagal";
    const cobaDecode = async (src: string): Promise<{ buf: AudioBuffer; ac: AudioContext; bytes: number } | null> => {
      try {
        const r = await fetch(src);
        const ab = await r.arrayBuffer();
        bytes = ab.byteLength;
        // 🐛 v19.81: file lagu beneran > 2 KB — 2048 byte pas = stub kosong 0 detik.
        if (bytes < 2048) { lastErr = `file terlalu kecil (${bytes} byte)`; return null; }
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ac = new AC();
        const buf = await ac.decodeAudioData(ab);
        // 🐛 v19.81: decode "sukses" tapi durasi < 1 detik = lagu kosong (0:00).
        // Provider nyata minimal 1-8 menit — jangan bilang "jadi" buat yang 0 detik.
        if (!(buf.duration >= 1)) { lastErr = `lagu kosong (${buf.duration.toFixed(2)} dtk)`; try { ac.close(); } catch {} return null; }
        return { buf, ac, bytes };
      } catch (e: any) { lastErr = e?.message || "gagal decode"; return null; }
    };
    const langsung = url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:");
    const dek = langsung
      ? await cobaDecode(url)
      : ((await cobaDecode(`/api/hcnsec/proxy-audio?url=${encodeURIComponent(url)}`)) || (await cobaDecode(url)));
    if (!dek) {
      throw new Error(`Audio hasil tidak valid (${(bytes / 1024).toFixed(0)} KB, ${lastErr.slice(0, 60)}) — link provider rusak/kadaluarsa atau butuh auth. Kredit mungkin kepakai. Coba generate ulang / ganti provider.`);
    }
    const { buf, ac } = dek;
    // 🎵 v19.86: player pakai WAV dari ISI file (decode) — durasi header provider
    // bisa bohong (mis. 17:23 padahal isi 8:03). Satu decode, TANPA motong apa pun.
    // 🐛 v19.87: FIX durasi DOBEL — createBuffer(1, buf.length, 22050) salah
    // (buf.length = sampel @44100 → 13:54 padahal isi 6:57). wavDariBuffer
    // hitung panjang dari durasi × rate tujuan.
    const dur = buf.duration;
    let previewUrl: string | undefined;
    try {
      const { wavDariBuffer } = await import("@/lib/gabung-audio");
      previewUrl = wavDariBuffer(buf, ac)?.url;
    } catch { previewUrl = undefined; }
    try { ac.close(); } catch {}
    const huruf = idx === 0 ? "A" : idx === 1 ? "B" : String(idx + 1);
    const notice = semua.length > 1
      ? (modeHasil === "dua" ? ` · versi ${huruf} (ada ${semua.length} pilihan terpisah)` : ` · versi ${huruf} (1 lagu, bukan digabung)`)
      : "";
    const h = { url, urls: [url], previewUrl, title: klip.title || judulInduk || title || "Lagu AI", dur };
    setHasil(h);
    setStatus(`✅ Lagu jadi${notice} — ±${Math.round(dur)} dtk (${(bytes / 1048576).toFixed(1)} MB).`);
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
      if (!blob.size || blob.size < 2048 || (blob.type || "").includes("json")) {
        setStatus("❌ Download gagal — file yang dikasih provider tidak valid. Coba generate ulang, atau ganti provider.");
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
        {/* Presets Aransemen (Metode 1) */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, padding: "0 4px" }}>
          <span style={{ fontSize: 10.5, color: "#8b8b98", alignSelf: "center", fontWeight: "bold" }}>Aransemen Cepat (Preset):</span>
          {[
            { label: "🕌 Arab", style: "arabic desert pop, oud, darbuka, middle eastern scale, emotional, high quality" },
            { label: "🥁 Koplo", style: "dangdut koplo, kendang, rampak, indonesian upbeat, energetic, high quality" },
            { label: "🎸 Rock", style: "symphonic rock, melodic electric guitar, powerful drums, intense, high quality" },
            { label: "🎹 Akustik", style: "acoustic cover, emotional solo piano, violin strings, soft, high quality" },
            { label: "🌇 Retro 80s", style: "synthwave, retro synthesizer, electronic drums, neon vibe, high quality" }
          ].map((preset) => (
            <button
              key={preset.label}
              className="v6-chip"
              style={{ fontSize: 9.5, padding: "2px 8px", cursor: "pointer", border: style === preset.style ? "1px solid #c4b5fd" : undefined, color: style === preset.style ? "#c4b5fd" : undefined }}
              onClick={() => setStyle(preset.style)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className="gd-field wide"><span>Lirik (kosongkan = instrumental / gaya bebas)</span>
          <textarea className="v6-inp v6-ta" rows={4} style={{ minHeight: 90 }} value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder={"Tulis lirik (≥30 huruf biar mode custom aktif)…\n[Verse]\nIbu…"} />
        </label>

        {/* Metode 2: Aransemen Lanjutan (Extend / Remix) */}
        <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,0.15)", marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={isExtendMode} onChange={(e) => setIsExtendMode(e.target.checked)} />
            <b style={{ fontSize: 11, color: isExtendMode ? "#c4b5fd" : "#8b8b98" }}>🔗 Aktifkan Aransemen Lanjutan (Extend / Remix)</b>
          </label>
          {isExtendMode && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="gd-field wide" style={{ margin: 0 }}>
                <span>URL Lagu Referensi</span>
                <input value={audioUrlRef} onChange={(e) => setAudioUrlRef(e.target.value)} placeholder="Tempel URL audio/lagu Suno asli di sini..." />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: "bold" }}>Mulai Lanjutkan di Detik ke-</span>
                <input type="number" className="v6-inp" style={{ width: 80, margin: 0, padding: "4px 8px", textAlign: "center" }} value={continueAt} onChange={(e) => setContinueAt(e.target.value)} />
              </div>
              <p style={{ fontSize: 9.5, color: "#8b8b98", margin: "2px 0 0", lineHeight: 1.35 }}>
                Suno akan mengambil melodi & aransemen dari lagu referensi di atas, lalu melanjutkannya dengan lirik baru yang kamu tulis.
              </p>
            </div>
          )}
        </div>
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
            <button className="v6-chip" style={{ flex: 1, padding: "10px", height: "auto", border: "1px solid rgba(139,92,246,.5)", borderRadius: 10, background: "none", color: "#c4b5fd", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAudioUrlRef(hasil.url); setIsExtendMode(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>🔗 Lanjutkan Lagu Ini (Extend)</button>
          </div>
          <p style={{ fontSize: 10.5, color: "#8b8b98", marginTop: 6 }}>Lagu dipakai apa adanya dari provider (satu file, satu gaya). Tidak disambung ke versi lain.</p>
          
          {/* 🎤 STUDIO VOKAL & ARANSEMEN COVER (PREMIUM) */}
          <div style={{ marginTop: 12, border: "1.5px solid rgba(139,92,246,.5)", borderRadius: 14, padding: 12, background: "rgba(139,92,246,.06)" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>🎤</span>
              <div style={{ textAlign: "left" }}>
                <b style={{ fontSize: 13, color: "#c4b5fd", display: "block" }}>Studio Vokal & Aransemen (Cover)</b>
                <small style={{ fontSize: 9.5, color: "#94a3b8" }}>Nyanyikan & aransemen suaramu sendiri di atas musik Suno!</small>
              </div>
            </div>
            
            <p style={{ fontSize: 10, color: "#fbbf24", margin: "4px 0 10px", lineHeight: 1.45, textAlign: "left" }}>
              🎧 <b>PENTING:</b> Gunakan headset atau earphone saat merekam agar suara musik pengiring dari HP tidak ikut terekam masuk ke mikrofon!
            </p>

            {recState === "idle" && (
              <button className="v6-bigcta" style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={startRecording}>
                <span style={{ fontSize: 14 }}>🎙️</span> Mulai Rekam Vokal Cover
              </button>
            )}

            {recState === "recording" && (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                  <b style={{ fontSize: 13, color: "#ef4444" }}>SEDANG MEREKAM VOKAL...</b>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 12 }}>{fmtD(recordingElapsed)}</div>
                <button className="v6-bigcta" style={{ background: "#ef4444", color: "#fff", marginTop: 0 }} onClick={stopRecording}>
                  🛑 Selesai & Poles Vokal
                </button>
              </div>
            )}

            {recState === "mixed" && (
              <div style={{ marginTop: 8, textAlign: "left" }}>
                <b style={{ fontSize: 11, color: "#a7f3d0", display: "block", marginBottom: 8 }}>✅ Vokal Terekam (±{vocalBuffer ? Math.round(vocalBuffer.duration) : 0} dtk) — Poles Mixer di Bawah:</b>
                
                {/* Sliders */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(0,0,0,0.25)", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="v6-slider-row" style={{ margin: 0 }}>
                    <div className="lr"><span>🎙️ Volume Vokalku</span><b>{vocalVol}%</b></div>
                    <input type="range" min={0} max={150} value={vocalVol} onChange={e => setVocalVol(Number(e.target.value))} />
                  </div>
                  
                  <div className="v6-slider-row" style={{ margin: 0 }}>
                    <div className="lr"><span>🎼 Volume Musik Pengiring</span><b>{backingVol}%</b></div>
                    <input type="range" min={0} max={150} value={backingVol} onChange={e => setBackingVol(Number(e.target.value))} />
                  </div>

                  <div className="v6-slider-row" style={{ margin: 0 }}>
                    <div className="lr"><span>🕌 Gema Ruang (Studio Reverb)</span><b>{reverbAmt}%</b></div>
                    <input type="range" min={0} max={100} value={reverbAmt} onChange={e => setReverbAmt(Number(e.target.value))} />
                  </div>

                  <div className="v6-slider-row" style={{ margin: 0 }}>
                    <div className="lr"><span>🌈 Kejernihan & EQ (Filter)</span><b>{eqAmt}%</b></div>
                    <input type="range" min={0} max={100} value={eqAmt} onChange={e => setEqAmt(Number(e.target.value))} />
                  </div>

                  <div className="v6-slider-row" style={{ margin: 0 }}>
                    <div className="lr"><span>🔗 Glue Compressor (Pelekat)</span><b>{glueAmt}%</b></div>
                    <input type="range" min={0} max={100} value={glueAmt} onChange={e => setGlueAmt(Number(e.target.value))} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="v6-bigcta" style={{ flex: 1.5, background: "#22c55e", color: "#052e16", marginTop: 0 }} disabled={mixingBusy} onClick={prosesGabungCover}>
                    {mixingBusy ? "⏳ Sedang Memproses..." : "🤝 Proses & Gabung Lagu Cover"}
                  </button>
                  <button className="v6-chip" style={{ flex: 1, padding: "10px", height: "auto", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, background: "none", color: "#fff", cursor: "pointer", fontWeight: 700 }} onClick={() => setRecState("idle")}>
                    🔄 Rekam Ulang
                  </button>
                </div>

                {coverUrl && (
                  <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
                    <b style={{ fontSize: 11, color: "#86efac", display: "block", marginBottom: 6 }}>🎧 HASIL LAGU COVER-MU SIAP:</b>
                    <audio controls src={coverUrl} style={{ width: "100%", marginBottom: 8 }} />
                    <button className="v6-bigcta" style={{ background: "linear-gradient(135deg,#ec4899,#f97316)", color: "#fff" }} onClick={downloadCover}>
                      ⬇️ Download Lagu Cover (MP3/WAV)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
