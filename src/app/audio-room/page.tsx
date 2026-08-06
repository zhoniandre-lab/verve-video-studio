"use client";
/* 🎛️ AUDIO ROOM — halaman penuh (v19.37) */
import { useState } from "react";
import AudioRoomPanel from "@/components/AudioRoomPanel";

export default function AudioRoomPage() {
  const [tutup, setTutup] = useState(false);
  if (tutup) {
    return (
      <div style={{ minHeight: "100vh", background: "#07070c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, fontFamily: "system-ui" }}>
        <div style={{ fontSize: 40 }}>🎛️</div>
        <p style={{ fontSize: 14, opacity: .8 }}>Kembali ke dashboard…</p>
        <button style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid #ffffff2a", background: "none", color: "#fff", cursor: "pointer" }} onClick={() => { location.href = "/"; }}>Buka Dashboard</button>
      </div>
    );
  }
  return <AudioRoomPanel onExit={() => setTutup(true)} />;
}
