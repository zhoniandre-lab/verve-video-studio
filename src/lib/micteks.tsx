// 🎤📝 v14.0 NGOMONG = TEKS — tombol mic mini: rekam suara → Whisper rute kita sendiri → teks terisi.
// Terinspirasi konsep "voice input" Voicebox (46k★); KODE 100% TULISAN SENDIRI, jalan penuh di HP
// (MediaRecorder bawaan browser + rute /api/hcnsec/transcribe yang SUDAH teruji perang & live).
"use client";
import React, { useEffect, useRef, useState } from "react";

type Stt = "" | "rec" | "up";

export default function MicTeks(p: {
  onText: (t: string) => void; // dipanggil sekali dengan hasil akhir (sudah dipangkas spasi liar)
  lang?: string;               // bahasa suara — default "id"
  hint?: string;               // petunjuk konteks ke Whisper biar akurat (mis. "perintah studio")
  title?: string;              // tooltip tombol
}) {
  const [stt, setStt] = useState<Stt>("");
  const [sec, setSec] = useState(0);
  const [msg, setMsg] = useState("");
  const mrRef = useRef<MediaRecorder | null>(null);
  const stRef = useRef<MediaStream | null>(null);
  const itvRef = useRef<any>(null);

  useEffect(() => () => { bersih(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function bersih() {
    clearInterval(itvRef.current);
    try { mrRef.current?.stop(); } catch {}
    try { stRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    mrRef.current = null; stRef.current = null;
  }
  function info(m: string, ms = 3200) { setMsg(m); if (ms) setTimeout(() => setMsg(""), ms); }

  async function mulai() {
    setMsg("");
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      stRef.current = st;
      const mr = new MediaRecorder(st);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { const b = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }); void unggah(b); };
      mrRef.current = mr; mr.start();
      setSec(0); setStt("rec");
      itvRef.current = setInterval(() => {
        setSec((s) => { if (s >= 59) { selesai(); return s; } return s + 1; }); // auto-stop 60 detik — hemat HP & hemat kuota
      }, 1000);
    } catch { info("🎙️ Izin mikrofon ditolak — aktifkan di pengaturan browser ya bro", 4200); }
  }

  function selesai() {
    clearInterval(itvRef.current);
    try { mrRef.current?.stop(); } catch {}
    try { stRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    mrRef.current = null; stRef.current = null;
    setStt((s) => (s === "rec" ? "up" : s));
  }

  async function unggah(b: Blob) {
    if (!b.size) { setStt(""); info("🔇 Rekamannya kosong — coba ngomong lebih dekat mic", 3800); return; }
    setStt("up");
    try {
      const fd = new FormData();
      fd.append("file", b, "suara.webm");
      fd.append("lang", p.lang || "id");
      if (p.hint) fd.append("hint", p.hint);
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60_000);
      const r = await fetch("/api/hcnsec/transcribe", { method: "POST", body: fd, signal: ctl.signal });
      clearTimeout(to);
      const j: any = await r.json().catch(() => null);
      setStt("");
      const t = String(j?.text || "").trim();
      if (j?.ok && t) {
        p.onText(t.replace(/\s+/g, " "));
        info("✅ Teks masuk — cek dulu ya 🙏", 2600);
      } else {
        info(j?.error ? `⚠️ ${String(j.error).slice(0, 70)}` : "⚠️ Kurang jelas kedengarnya — ulangi lebih pelan ya bro", 4600);
      }
    } catch { setStt(""); info("⚠️ Gangguan jaringan — coba sekali lagi ya bro", 4200); }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <button
        type="button"
        onClick={() => { if (stt === "rec") selesai(); else if (stt !== "up") void mulai(); }}
        disabled={stt === "up"}
        className={`v6-micteks ${stt}`}
        title={p.title || "Ngomong jadi teks — ketuk, ngomong, ketuk lagi untuk kirim"}
      >
        {stt === "up" ? "⏳" : stt === "rec" ? "⏹" : "🎤"}
        {stt === "rec" && <em>{sec}d</em>}
      </button>
      {!!msg && <span className="v6-micteks-msg">{msg}</span>}
    </span>
  );
}
