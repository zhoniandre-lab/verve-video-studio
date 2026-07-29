"use client";
/**
 * 🎤🧠 NGOMONG v2 (v14.5 SUARA PAHAM) — bicara → teks, dibangun ulang dari nol.
 * Naik kelas tanpa menyentuh struktur:
 *  1) KUALITAS TANGKAP: peredam gema + penekan bising + penguat otomatis + 1 kanal → Whisper lebih jelas mendengar.
 *  2) PAHAM MAKSUD: prop `hint` = kamus dunia-studio disuntik ke AI transkripsi → kata fitur ("keterangan otomatis",
 *     "transisi", "adegan") lebih sering tertangkap benar; teks lalu diproses mesin maksud LOKAL (Sutradara Dice-bigram
 *     toleran typo) — rantai paham ujung-ke-ujung.
 *  3) JUJUR & HEMAT: <0,7dtk/blob mini = tak bakar kuota; 25dtk anti-gantung 4G; auto-stop 60dtk; pesan status apa adanya.
 * Rute server /api/hcnsec/transcribe TIDAK diubah (sudah terbukti live: wav → teks Indonesia per-kata).
 */
import { useEffect, useRef, useState } from "react";
import { fetchJsonResult } from "@/lib/guard/net";

type Stt = "" | "rec" | "up";

function pilihMime(): string {
  try {
    const M: any = (window as any).MediaRecorder;
    if (!M || !M.isTypeSupported) return "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (M.isTypeSupported(m)) return m;
  } catch { /* abaikan */ }
  return "";
}

export default function Ngomong(p: { onText: (t: string) => void; hint?: string; title?: string; lang?: string }) {
  const [stt, setStt] = useState<Stt>("");
  const [msg, setMsg] = useState("");
  const [sec, setSec] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const t0Ref = useRef(0);
  const itvRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const bersih = () => {
    try { if (itvRef.current) clearInterval(itvRef.current); } catch { /* abaikan */ }
    itvRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* abaikan */ }
    streamRef.current = null;
    try { abortRef.current?.abort(); } catch { /* abaikan */ }
    abortRef.current = null;
  };
  useEffect(() => bersih, []); // lepas komponen = mic & jaringan dilepas

  const say = (t: string, ms = 2800) => { setMsg(t); if (ms) setTimeout(() => setMsg((m) => (m === t ? "" : m)), ms); };

  async function startRec() {
    setMsg("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof (window as any).MediaRecorder === "undefined") {
      return say("❌ Browser HP ini belum bisa merekam — ketik manual dulu ya");
    }
    try {
      // (1) KUALITAS: mic diminta bersih-bersih sebelum direkam
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mime = pilihMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec; chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { void kirim(); };
      t0Ref.current = Date.now(); setSec(0); setStt("rec");
      itvRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - t0Ref.current) / 1000);
        setSec(s);
        if (s >= 60) stopRec(); // auto-stop 60dtk agar tidak membengkak
      }, 250);
      rec.start(250);
    } catch {
      bersih(); setStt("");
      say("🎙 Mic belum diizinkan — ketuk ikon gembok di kolom alamat → izinkan mikrofon");
    }
  }

  function stopRec() { try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch { /* abaikan */ } }

  async function kirim() {
    const durasi = (Date.now() - t0Ref.current) / 1000;
    const blob = new Blob(chunksRef.current, { type: (recRef.current as any)?.mimeType || "audio/webm" });
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* abaikan */ }
    streamRef.current = null;
    try { if (itvRef.current) clearInterval(itvRef.current); } catch { /* abaikan */ }
    itvRef.current = null; recRef.current = null;
    // (3) HEMAT & JUJUR: rekaman nyaris kosong jangan dibakar ke server
    if (durasi < 0.7 || blob.size < 4000) { setStt(""); return say("🤏 Terlalu pendek — ketuk 🎤, ngomong dulu, baru ⏹"); }
    setStt("up");
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "suara.webm", { type: blob.type })); // nama .webm → rute mengurai dengan benar
      const lg = (p.lang || "id").toLowerCase(); // 🌍 v14.6: bahasa dari saklar (default Indonesia)
      fd.append("lang", lg);
      if (p.hint && lg === "id") fd.append("hint", p.hint); // (2) kamus Indonesia HANYA utk Indonesia — bahasa lain dibiarkan bersih biar AI tak bias
      const ac = new AbortController(); abortRef.current = ac;
      const res = await fetchJsonResult<any>("/api/hcnsec/transcribe", {
        method: "POST",
        body: fd,
        signal: ac.signal,
        timeoutMs: 25_000, // anti-gantung di 4G desa
        retries: 1,
        retryDelayMs: 700,
        label: "Ngomong → teks",
        rawBody: true,
      });
      bersih(); setStt("");
      const j = res.ok ? res.data : null;
      const t = (j?.text || "").trim(); // teks apa adanya dari mesin — tidak dipoles-sembunyi
      if (t) { p.onText(t); say("✅ Terisi — cek dulu lalu lanjut"); }
      else say(res.ok && j?.error ? `⚠️ ${String(j.error).slice(0, 80)}` : (res.ok ? "⚠️ Suara tak terbaca — coba lebih dekat ke mic" : res.error.slice(0, 96)));
    } catch (e: any) {
      bersih(); setStt("");
      say(e?.name === "AbortError" ? "🐌 Jaringan lambat — coba lagi pas sinyal bagus" : "⚠️ Gagal mengirim suara — coba sekali lagi");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
      <button
        type="button"
        className={`v6-micteks ${stt}`}
        title={p.title || "🎤 Bicara → jadi teks — ketuk, ngomong, ketuk ⏹"}
        disabled={stt === "up"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); if (stt === "rec") stopRec(); else if (!stt) void startRec(); }}
      >
        {stt === "rec" ? <>⏹ <em>{sec}d</em></> : stt === "up" ? "⏳" : "🎤"}
      </button>
      {!!msg && <span className="v6-micteks-msg">{msg}</span>}
    </span>
  );
}
