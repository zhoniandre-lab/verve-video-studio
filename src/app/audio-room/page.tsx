"use client";
/* 🎛️ AUDIO ROOM — halaman penuh (v19.37) + ERROR BOUNDARY biar nggak pernah blank */
import { Component, useState } from "react";
import type { ReactNode } from "react";
import AudioRoomPanel from "@/components/AudioRoomPanel";

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: "" };
  static getDerivedStateFromError(e: any) { return { err: e?.message || String(e) }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: "100vh", background: "#07070c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, fontFamily: "system-ui", padding: 20 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ fontSize: 13, opacity: .8, textAlign: "center" }}>Audio Room ketemu error:<br /><code style={{ color: "#fca5a5", fontSize: 11 }}>{this.state.err}</code></p>
          <button style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid #ffffff2a", background: "none", color: "#fff", cursor: "pointer" }} onClick={() => { try { localStorage.removeItem("verve_audioroom_v1"); } catch {} location.reload(); }}>🗑 Reset proyek & muat ulang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  return (
    <ErrorBoundary>
      <AudioRoomPanel onExit={() => setTutup(true)} />
    </ErrorBoundary>
  );
}
