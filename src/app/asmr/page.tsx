"use client";
/* 🎧 v20.50 ASMR STUDIO — halaman khusus Editor ASMR di dashboard */
import { useState } from "react";
import AsmrStudio from "@/components/AsmrStudio";

export default function AsmrPage() {
  const [tutup, setTutup] = useState(false);
  if (tutup) {
    return (
      <div style={{ minHeight: "100vh", background: "#07070c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, fontFamily: "system-ui" }}>
        <div style={{ fontSize: 40 }}>🎧</div>
        <p style={{ fontSize: 14, opacity: .8 }}>Kembali ke dashboard…</p>
        <button style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid #ffffff2a", background: "none", color: "#fff", cursor: "pointer" }} onClick={() => { location.href = "/"; }}>Buka Dashboard</button>
      </div>
    );
  }
  return <AsmrStudio onExit={() => setTutup(true)} />;
}
