"use client";
/* 🎯 NICHE UMUM STUDIO (v20.50) — Click-worthy Ideation & Metadata Generator */
import { useState } from "react";

const NICHES = [
  { id: "religi", label: "🕌 Religi (Hidayah, Taubat, Keajaiban)", emoji: "🕌" },
  { id: "rakyat", label: "📜 Cerita Rakyat (Kisah Daerah, Mitos)", emoji: "📜" },
  { id: "komentar", label: "💬 Lagu dari Komentar Netizen (Curhat)", emoji: "💬" },
  { id: "parodi", label: "🎭 Parodi Kejadian Viral (Trending)", emoji: "🎭" },
  { id: "misteri", label: "🕵️ Misteri & Konspirasi (ASMR/Horor)", emoji: "🕵️" }
];

const PRESET_TITLES: Record<string, string[]> = {
  religi: [
    "Tangisan Pendosa di Sepertiga Malam: Kisah Taubat yang Diterima Allah",
    "Mukjizat Sedekah Subuh: Keajaiban Pemberian di Kala Sempit",
    "Ketika Surga Merindukanmu: Kisah Haru Pemuda yang Terkenal di Langit",
    "Jawaban Atas Doa Ibu yang Sunyi: Kesuksesan Anak yang Berbakti"
  ],
  rakyat: [
    "Kisah Tragis Malin Kundang: Kutukan Ibu yang Mengguncang Samudra",
    "Legenda Sangkuriang & Tangkuban Perahu: Cinta Buta yang Berakhir Tragis",
    "Asal-Usul Danau Toba: Janji yang Diingkari Membawa Air Bah Dahsyat",
    "Legenda Roro Jonggrang: Seribu Candi dalam Semalam yang Mengelabui Jin"
  ],
  komentar: [
    "Lagu dari Komentar Netizen Sedih: Curhat Pilu Diputusin Pas Lagi Sayang-Sayangnya",
    "Ketika Komentar Lucu Jadi Lagu Syahdu: Drama Ojol dan Penumpang yang Bikin Ketawa",
    "Lagu Curhat Netizen Ter-Tragis: Kisah Perjuangan Ayah yang Menyentuh Hati",
    "Dari Kolom Komentar: Kisah Sahabat yang Menikung di Sepertiga Malam"
  ],
  parodi: [
    "Parodi Viral Jargon Kocak Bulan Ini: Melodi Ceria yang Bikin Terngiang-Ngiang",
    "Lagu Plesetan Kejadian Terhangat di Sosial Media (Koplo Asyik)",
    "Parodi Drama Selebritis Paling Ramai: Sisi Kocak Netizen Indonesia",
    "Lagu Parodi Tren Sound TikTok Paling Gacor (Remix Koplo)"
  ],
  misteri: [
    "Misteri Malam Satu Suro: Kisah Horor Kampung Mati di Lereng Gunung",
    "Legenda Nyi Roro Kidul: Mitos Pakaian Hijau di Pantai Selatan",
    "Konspirasi Kota Hilang Wentira: Negeri Jin Megah di Tengah Hutan Sulawesi",
    "Kisah Seram Pendakian Gunung Lawu: Pasar Setan di Puncak Sunyi"
  ]
};

export default function NicheUmumPage() {
  const [niche, setNiche] = useState("religi");
  const [titles, setTitles] = useState<string[]>(PRESET_TITLES["religi"]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [status, setStatus] = useState("");

  const dapatkanJudul = () => {
    const list = PRESET_TITLES[niche] || [];
    setTitles(list);
    setSelectedTitle("");
    setCustomTitle("");
    setStatus(`✅ Berhasil merumuskan 4 Judul Terbaik untuk Niche ${niche.toUpperCase()}`);
  };

  const pilihJudul = (t: string) => {
    setSelectedTitle(t);
    setCustomTitle(t);
    // Auto-generate Metadata SEO
    setDesc(`🎥 Video ASMR & Musik Religi: ${t}\n\nKisah penuh hikmah yang dibalut dengan alunan musik syahdu orisinal AI dan visualisasi cozy alami yang menenangkan jiwa. Sangat cocok diputar sebelum tidur atau saat santai.\n\nSemoga video ini bermanfaat dan menjadi ladang amal jariyah untuk kita semua. Aamiin.\n\nDon't forget to Like, Comment, and Subscribe! 🔔`);
    setTags(`${niche}, asmr indonesia, cerita jadi lagu, ${t.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").slice(0, 4).join(", ")}, lagu viral, visualizer syahdu`);
    setThumbPrompt(`High quality realistic YouTube thumbnail, representing: ${t}, dramatic emotional cinematic lighting, highly detailed faces, 8k resolution.`);
  };

  const salinText = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    alert(`✅ ${label} berhasil disalin ke clipboard!`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07070c", color: "#fff", fontFamily: "system-ui, sans-serif", padding: "16px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 }}>
          <b style={{ fontSize: 16 }}>🎯 Niche Umum Studio (Click-worthy Ideation)</b>
          <button style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "none", color: "#fff", cursor: "pointer", fontSize: 12 }} onClick={() => { location.href = "/"; }}>✕ Kembali</button>
        </header>

        {/* LANGKAH 1: PILIH NICHE & DAPATKAN JUDUL */}
        <div style={{ background: "#0c0d14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <b style={{ fontSize: 13, color: "#c4b5fd", display: "block", marginBottom: 10 }}>Langkah 1: Pilih Kategori Niche & Rumuskan Judul</b>
          
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select className="v6-inp" style={{ flex: 1, margin: 0, padding: 8, fontSize: 12 }} value={niche} onChange={(e) => setNiche(e.target.value)}>
              {NICHES.map((n) => (
                <option key={n.id} value={n.id}>{n.emoji} {n.label}</option>
              ))}
            </select>
            <button className="v6-bigcta" style={{ marginTop: 0, padding: "8px 18px", fontSize: 11.5 }} onClick={dapatkanJudul}>
              🔍 Dapatkan Judul Terbaik
            </button>
          </div>

          {status && <p style={{ fontSize: 11, color: "#86efac", margin: "4px 0 10px" }}>{status}</p>}

          <b style={{ fontSize: 11, color: "#8b8b98", display: "block", marginBottom: 6 }}>Pilih Salah Satu Judul Rekomendasi AI (Atau Ketik Manual Di Bawah):</b>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {titles.map((t) => (
              <button
                key={t}
                onClick={() => pilihJudul(t)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: selectedTitle === t ? "1px solid #c4b5fd" : "1px solid rgba(255,255,255,0.06)", background: selectedTitle === t ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.02)", color: "#fff", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}
              >
                {t}
              </button>
            ))}
          </div>

          <b style={{ fontSize: 11, color: "#8b8b98", display: "block", marginBottom: 4 }}>✍️ Ketik / Modifikasi Judul Bebas:</b>
          <input
            className="v6-inp"
            style={{ margin: 0, fontSize: 11.5 }}
            value={customTitle}
            onChange={(e) => {
              setCustomTitle(e.target.value);
              pilihJudul(e.target.value);
            }}
            placeholder="Tulis judul cover/remix manual di sini..."
          />
        </div>

        {/* LANGKAH 2: METADATA SEO & THUMBNAIL PROMPT */}
        {customTitle && (
          <div style={{ background: "#0c0d14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <b style={{ fontSize: 13, color: "#c4b5fd", display: "block", marginBottom: 10 }}>Langkah 2: Metadata SEO & Prompt Gambar Thumbnail</b>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: "bold" }}>🏷️ JUDUL OPTIMAL</span>
                  <button style={{ padding: "2px 6px", fontSize: 9.5, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer" }} onClick={() => salinText(customTitle, "Judul")}>📋 Salin</button>
                </div>
                <input className="v6-inp" style={{ margin: 0, fontSize: 11.5 }} value={customTitle} readOnly />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: "bold" }}>📝 DESKRIPSI VIDEO</span>
                  <button style={{ padding: "2px 6px", fontSize: 9.5, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer" }} onClick={() => salinText(desc, "Deskripsi")}>📋 Salin</button>
                </div>
                <textarea className="v6-inp" rows={4} style={{ margin: 0, fontSize: 11, minHeight: 90 }} value={desc} readOnly />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: "bold" }}>🏷️ TAGS / HASHTAGS</span>
                  <button style={{ padding: "2px 6px", fontSize: 9.5, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer" }} onClick={() => salinText(tags, "Tags")}>📋 Salin</button>
                </div>
                <input className="v6-inp" style={{ margin: 0, fontSize: 11.5 }} value={tags} readOnly />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: "bold" }}>🎨 PROMPT AI THUMBNAIL REALISTIS</span>
                  <button style={{ padding: "2px 6px", fontSize: 9.5, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer" }} onClick={() => salinText(thumbPrompt, "Prompt")}>📋 Salin</button>
                </div>
                <textarea className="v6-inp" rows={2} style={{ margin: 0, fontSize: 11, minHeight: 50 }} value={thumbPrompt} readOnly />
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, display: "flex", gap: 8 }}>
              <button className="v6-bigcta" style={{ flex: 1, marginTop: 0 }} onClick={() => {
                // Simpan draf & beralih ke editor ASMR / Spectrum untuk ekspor visual
                alert("✨ Metadata SEO siap! Beralih ke ASMR Studio untuk merakit videomu...");
                location.href = "/asmr";
              }}>
                🎧 Buka ASMR Studio & Edit Visual ›
              </button>
              <button className="v6-bigcta" style={{ flex: 1, marginTop: 0, background: "#059669" }} onClick={() => {
                alert("✨ Metadata SEO siap! Beralih ke Spectrum Studio untuk membuat visualizer...");
                location.href = "/";
              }}>
                📊 Buka Spectrum Studio ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
