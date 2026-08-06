"use client";
/* =====================================================================
   🏹 BOT BURUAN AI — panel (v19.35) — 100% orisinal
   Cari penyedia AI yang kasih kredit gratis + tutorial klaim + simpan
   ke Dompet Bansos (chat: verve_bansos_chat_v1, video: verve_video_providers_v1).
   Data dari /api/buruan (kurasi + sinkron repo komunitas).
   ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { KATEGORI, BURUAN_KEY_STATUS, BURUAN_KEY_SEEN, STATUS_LABEL } from "@/lib/buruan/types";
import type { BuruanItem, KategoriId, StatusBuruan } from "@/lib/buruan/types";

const JENIS_LABEL: Record<string, string> = {
  permanen: "♾️ Permanen", harian: "🌅 Harian", mingguan: "📅 Mingguan", bulanan: "🗓️ Bulanan", sekali: "🎁 Sekali",
};

function bacaStatus(): Record<string, StatusBuruan> {
  try { return JSON.parse(localStorage.getItem(BURUAN_KEY_STATUS) || "{}"); } catch { return {}; }
}

export default function BuruanPanel({ onExit }: { onExit?: () => void }) {
  const [items, setItems] = useState<BuruanItem[]>([]);
  const [q, setQ] = useState("");
  const [kat, setKat] = useState<KategoriId | "">("");
  const [statusMap, setStatusMap] = useState<Record<string, StatusBuruan>>({});
  const [detail, setDetail] = useState<BuruanItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState("");
  const [cache, setCache] = useState(false);
  const [sumberOk, setSumberOk] = useState<string[]>([]);
  const [sumberErr, setSumberErr] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  // Dompet Bansos — kolom isi key buat item yang mau disimpan
  const [keyIsi, setKeyIsi] = useState("");
  const [modelIsi, setModelIsi] = useState("");
  const [tesInfo, setTesInfo] = useState("");

  useEffect(() => {
    setStatusMap(bacaStatus());
    try { setSeen(JSON.parse(localStorage.getItem(BURUAN_KEY_SEEN) || "[]") as string[]); } catch { setSeen([]); }
    muat(false);
  }, []);

  async function muat(sync: boolean) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/buruan" + (sync ? "?sync=1" : ""), { cache: "no-store" });
      const j: any = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setItems(j.item || []);
      setCache(!!j.cache);
      setSumberOk(j.sumber || []);
      setSumberErr(j.error || []);
      // tandai "baru" yang belum pernah dilihat (id yang ada sekarang tapi belum di seen)
      const daftarBaru: BuruanItem[] = j.item || [];
      const ids: string[] = daftarBaru.map((i) => i.id);
      const baru = daftarBaru.filter((i) => !seen.includes(i.id));
      setInfo(baru.length ? `🆕 ${baru.length} buruan baru dari sinkronisasi!` : "");
      // simpan seen = semua id yang terlihat
      const gabung: string[] = Array.from(new Set<string>([...seen, ...ids]));
      setSeen(gabung);
      try { localStorage.setItem(BURUAN_KEY_SEEN, JSON.stringify(gabung)); } catch {}
    } catch (e: any) {
      setMsg(`⚠️ ${e?.message || "Gagal ambil data"}`);
    }
    setBusy(false);
  }

  const hasil = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((i) => {
      if (kat && i.kategori !== kat) return false;
      if (!qq) return true;
      const tags = (i.tags || []).join(" ");
      return (i.nama + " " + i.desc + " " + i.gratis + " " + tags).toLowerCase().includes(qq);
    });
  }, [items, q, kat]);

  /* 🎯 Panduan cepat per kebutuhan — pilih "mau bikin apa" → langsung set pencarian */
  const PANDUAN = [
    { emoji: "🖼️➡️🎬", judul: "Bikin gambar jadi BERGERAK", q: "gambar bergerak", desc: "Kling · Hailuo · Vidu · PixVerse · Viggle — upload foto, jadi video" },
    { emoji: "🎬✨", judul: "Bikin video AI dari teks", q: "text-to-video", desc: "Hailuo · Pika · Wan · Haiper · InVideo" },
    { emoji: "🧑‍💬", judul: "Bikin orang bicara (avatar)", q: "avatar", desc: "HeyGen · D-ID — foto jadi presenter ngomong" },
    { emoji: "🎵", judul: "Bikin lagu / musik", q: "musik", desc: "Suno · Udio — lagu orisinal dari prompt" },
    { emoji: "🗣️", judul: "Bikin narasi suara", q: "suara", desc: "ElevenLabs · Edge TTS — suara natural" },
    { emoji: "💬🧠", judul: "Otak/chat gratis buat Verve", q: "llm", desc: "Groq · Cerebras · Gemini · Mistral — simpan ke Dompet Bansos" },
  ];

  function setStatus(id: string, s: StatusBuruan) {
    const next = { ...statusMap, [id]: s };
    setStatusMap(next);
    try { localStorage.setItem(BURUAN_KEY_STATUS, JSON.stringify(next)); } catch {}
  }

  /* 🔑 Simpan ke Dompet Bansos — chat → verve_bansos_chat_v1; video → verve_video_providers_v1 */
  function simpanDompet(item: BuruanItem) {
    const k = keyIsi.trim();
    if (!k) { setTesInfo("⚠️ Tempel API key kamu di kolom di atas dulu (dari situsnya)."); return; }
    try {
      if (item.kategori === "chat" || item.baseUrl) {
        const base = (item.baseUrl || "").trim();
        if (!base) { setTesInfo("⚠️ Item ini nggak punya base URL OpenAI-compatible — key-nya simpan manual aja."); return; }
        localStorage.setItem("verve_bansos_chat_v1", JSON.stringify({ base, key: k, model: modelIsi.trim() }));
        setTesInfo(`✅ Tersimpan ke Dompet Bansos (chat) — Sutradara di Studio & wizard bakal coba ini duluan! Base: ${base}`);
      } else {
        // simpan sebagai provider video (pakai format yang dipahami Verve)
        const list = JSON.parse(localStorage.getItem("verve_video_providers_v1") || "[]");
        let host = "provider"; try { host = new URL(item.url || item.nama).hostname || host; } catch {}
        list.push({ id: "vp" + Date.now().toString(36), label: item.nama, base: item.baseUrl || "", key: k, model: modelIsi.trim(), aktif: true });
        localStorage.setItem("verve_video_providers_v1", JSON.stringify(list));
        setTesInfo(`✅ ${item.nama} masuk pasukan provider video! Dicoba PALING AWAL saat minta animasi.`);
      }
    } catch { setTesInfo("⚠️ Gagal simpan (storage penuh?)."); }
  }

  /* 🔌 Tes koneksi OpenAI-compatible via server (anti CORS) */
  async function tesKoneksi(item: BuruanItem) {
    const k = keyIsi.trim();
    if (!k) { setTesInfo("⚠️ Tempel API key dulu buat tes."); return; }
    const base = (item.baseUrl || "").trim();
    if (!base) { setTesInfo("⚠️ Item ini nggak punya base URL buat dites."); return; }
    setTesInfo("🔍 Tes koneksi…");
    try {
      const r = await fetch("/api/buruan/tes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base, key: k }) });
      const j = await r.json();
      if (j.ok) setTesInfo(`✅ Nyambung! Model yang kelihatan: ${(j.models || []).slice(0, 5).join(", ") || "?"}`);
      else setTesInfo(`❌ ${j.error || "Gagal"}`);
    } catch (e: any) { setTesInfo(`❌ ${e?.message || e}`); }
  }

  if (detail) {
    const i = detail;
    const st = statusMap[i.id];
    return (
      <div className="v6e-root" style={{ background: "#07070c" }}>
        <header className="v6e-top">
          <button className="v6e-tbtn" onClick={() => { setDetail(null); setTesInfo(""); }}>‹</button>
          <b style={{ fontSize: 13, flex: 1 }}>🏹 {i.nama}</b>
          <a className="v6e-export" style={{ textDecoration: "none" }} href={i.url} target="_blank" rel="noreferrer">Buka situs ↗</a>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 90px" }}>
          <div className="v6-cardrow" style={{ cursor: "default", marginTop: 4 }}>
            <span style={{ fontSize: 20 }}>{KATEGORI.find((k) => k.id === i.kategori)?.emoji || "🧰"}</span>
            <div className="tt">
              <b>{i.nama}</b>
              <div style={{ fontSize: 10.5, color: "#8b8b98", fontWeight: 500 }}>{JENIS_LABEL[i.jenis]} · syarat: {i.syarat} {i.berlaku ? `· berlaku: ${i.berlaku}` : ""}</div>
            </div>
            <b style={{ color: "#4ade80", fontSize: 13 }}>{"⭐".repeat(i.mudah)}{"☆".repeat(5 - i.mudah)}</b>
          </div>
          <div className="v6-note" style={{ marginTop: 8 }}>🎁 {i.gratis}</div>
          <p style={{ fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.5 }}>{i.desc}</p>
          {i.baseUrl && (
            <div className="v6-note" style={{ fontFamily: "monospace", fontSize: 10.5 }}>🔗 Base URL: {i.baseUrl}{i.contohModel ? `\n🧩 Model contoh: ${i.contohModel}` : ""}</div>
          )}
          <div className="v6-lbl" style={{ marginTop: 12 }}>📖 TUTORIAL KLAIM (langkah demi langkah)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {i.tutorial.map((t, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, fontSize: 12, color: "#e2e8f0", lineHeight: 1.45, background: "rgba(255,255,255,.045)", padding: "8px 10px", borderRadius: 10 }}>
                <span style={{ background: "#8b5cf6", color: "#fff", borderRadius: 999, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, marginTop: 1 }}>{idx + 1}</span>
                <span>{t.t}</span>
              </div>
            ))}
          </div>
          {/* Dompet Bansos */}
          {(i.baseUrl || i.kategori === "chat") && (
            <>
              <div className="v6-lbl" style={{ marginTop: 14 }}>🔑 SIMPAN KE DOMPET BANSOS {i.baseUrl ? "(chat — langsung dipakai Verve)" : ""}</div>
              <input className="v6-inp" placeholder="Tempel API key di sini (dari situsnya)" value={keyIsi} onChange={(e) => setKeyIsi(e.target.value)} />
              <input className="v6-inp" style={{ marginTop: 6 }} placeholder={i.contohModel ? `Model (contoh: ${i.contohModel})` : "Model (opsional)"} value={modelIsi} onChange={(e) => setModelIsi(e.target.value)} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button className="v6-bigcta" style={{ flex: 1, background: "#22c55e", color: "#052e16" }} onClick={() => simpanDompet(i)}>💾 Simpan ke Dompet Bansos</button>
                {i.baseUrl && <button className="v6-btn" onClick={() => tesKoneksi(i)}>🔌 Tes</button>}
              </div>
              {!!tesInfo && <p style={{ fontSize: 11, color: tesInfo.startsWith("✅") ? "#86efac" : tesInfo.startsWith("❌") ? "#fca5a5" : "#fbbf24", margin: "6px 0 0" }}>{tesInfo}</p>}
            </>
          )}
          <div className="v6-lbl" style={{ marginTop: 14 }}>📌 STATUS (untuk dirimu sendiri)</div>
          <div className="v6-chips" style={{ padding: 0 }}>
            {(Object.keys(STATUS_LABEL) as StatusBuruan[]).map((s) => (
              <button key={s} className={`v6-chip ${st === s ? "on" : ""}`} onClick={() => setStatus(i.id, s)}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
          <p style={{ fontSize: 10, opacity: .6, margin: "8px 0 0" }}>Sumber: {i.sumber} · dicek {new Date(i.dicek).toLocaleString()}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="v6e-root" style={{ background: "#07070c" }}>
      <header className="v6e-top">
        <button className="v6e-tbtn" onClick={() => onExit?.()}>✕</button>
        <b style={{ fontSize: 13, flex: 1 }}>🏹 Bot Buruan AI</b>
        <button className="v6e-export" disabled={busy} onClick={() => muat(true)}>{busy ? "⏳ …" : "🔍 Cari buruan baru"}</button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 90px" }}>
        <div className="v6-note" style={{ fontSize: 11.5 }}>💡 Cari penyedia AI yang kasih <b>kredit / kuota gratis</b> (secara sah) — lengkap dengan tutorial klaim. Ketemu yang OpenAI-compatible? <b>Simpan ke Dompet Bansos</b> → langsung dipakai fitur Verve. {cache ? "Data dari cache." : ""}</div>
        {/* 🎯 v19.35.1: panduan per kebutuhan — "mau bikin apa" langsung dikasih jawaban */}
        <div className="v6-lbl" style={{ marginTop: 8 }}>🎯 MAU BIKIN APA? (ketuk → langsung muncul daftarnya)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PANDUAN.map((p) => (
            <button key={p.q} onClick={() => { setQ(p.q); setKat(""); }}
              style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "rgba(139,92,246,.08)", border: "1px solid rgba(139,92,246,.35)", borderRadius: 12, padding: "9px 12px", cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 12.5, color: "#e9d5ff", display: "block" }}>{p.judul}</b>
                <span style={{ fontSize: 10.5, color: "#a78bfa" }}>{p.desc}</span>
              </span>
              <span style={{ color: "#a78bfa", fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
        <input className="v6-inp" style={{ marginTop: 10 }} placeholder="🔎 Cari bebas: groq, gambar bergerak, avatar, musik…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="v6-chips" style={{ padding: 0, flexWrap: "wrap", marginTop: 6 }}>
          <button className={`v6-chip ${kat === "" ? "on" : ""}`} onClick={() => setKat("")}>Semua ({items.length})</button>
          {KATEGORI.map((k) => (
            <button key={k.id} className={`v6-chip ${kat === k.id ? "on" : ""}`} onClick={() => setKat(k.id)}>{k.emoji} {k.label}</button>
          ))}
        </div>
        {!!msg && <div className="v6-risk" onClick={() => setMsg("")}>{msg} ✕</div>}
        {!!info && <div className="v6-okbox" style={{ fontSize: 12 }}>{info}</div>}
        {!!sumberOk.length && (
          <p style={{ fontSize: 10, opacity: .65, margin: "8px 0 0" }}>🌐 Sinkron dari: {sumberOk.join(" · ")}{sumberErr.length ? ` · ❌ gagal: ${sumberErr.join(", ")}` : ""}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {hasil.map((i) => {
            const st = statusMap[i.id];
            return (
              <div key={i.id} className="v6-cardrow" style={{ cursor: "pointer" }} onClick={() => { setDetail(i); setKeyIsi(""); setModelIsi(""); setTesInfo(""); }}>
                <span style={{ fontSize: 18 }}>{KATEGORI.find((k) => k.id === i.kategori)?.emoji || "🧰"}</span>
                <div className="tt">
                  <b>{i.nama} {st ? `· ${STATUS_LABEL[st]}` : ""}</b>
                  <div style={{ fontSize: 10, color: "#8b8b98", fontWeight: 500 }}>{JENIS_LABEL[i.jenis]} · {i.syarat} · {i.sumber}</div>
                  <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 2 }}>🎁 {i.gratis.slice(0, 90)}{i.gratis.length > 90 ? "…" : ""}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <b style={{ color: "#fbbf24", fontSize: 11 }}>{"⭐".repeat(i.mudah)}{"☆".repeat(5 - i.mudah)}</b>
                  {!seen.includes(i.id) && <span style={{ background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 999 }}>NEW</span>}
                  <span className="arr">›</span>
                </div>
              </div>
            );
          })}
          {!busy && !hasil.length && <div className="v6-note" style={{ textAlign: "center" }}>Nggak ada yang cocok — coba kata kunci lain, atau tekan "🔍 Cari buruan baru".</div>}
        </div>
        {!!busy && <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 10 }}>⏳ Menarik data dari repo komunitas…</p>}
      </div>
    </div>
  );
}
