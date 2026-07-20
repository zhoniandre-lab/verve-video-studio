"use client";

/**
 * LAHAN AWALAN v1 — mesin produksi AI VERVE (niche: Cerita Jadi Lagu).
 * Alur: Niat → Sudut → Riset Kompetitor → Judul Juara → Cerita & Visual WAW.
 *
 * Otak: VERVE Brain (src/lib/brain/*) — skor dari HITUNGAN NYATA (views, umur,
 * pola judul kompetitor), bukan ngarang. Semua skor bisa diaudit via reasons[].
 * Prompt Engine langkah 5 = "script di dalam script": kartu karakter + gaya
 * visual disuntik ke TIAP prompt adegan agar visual karakter konsisten & WAW.
 */

import { useEffect, useMemo, useState } from "react";
import {
  analyzeAngle, buildCandidates, scoreTitleV2, uniq, cap,
  type Angle, type ScoredTitle, type BrainMemory, type AnalyzedVideo,
} from "@/lib/brain/yie-score";
import {
  detectAudienceIntent, audienceCard, dominantEmotion, watchActivity,
  solutionFor, monetizationHint, deviceAdvice, DATA_GAPS,
} from "@/lib/brain/audience";

const LAHAN_KEY = "verve_lahan_v1";
const BRAIN_KEY = "verve_brain_v1";

/* ---------- util ---------- */
function fmtNum(n: number): string {
  n = +n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "Jt";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "rb";
  return String(Math.round(n));
}
function scoreTone(s: number): string {
  return s >= 70 ? "ok" : s >= 45 ? "warn" : "err";
}
function loadBrain(): BrainMemory {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return { researches: [], results: [] };
    const j = JSON.parse(raw);
    return { researches: j.researches || [], results: j.results || [] };
  } catch {
    return { researches: [], results: [] };
  }
}

/* ---------- tipe state wizard ---------- */
type CharCard = { nama: string; peran: string; usia: string; ciri: string; pakaian: string; suasana: string };

type LahanState = {
  step: number;
  topic: string;
  angles: string[];
  selKeyword: string;
  angle: Angle | null;
  researchAt: string;
  selTitle: string;
};

const DEFAULT_CHARS: CharCard[] = [
  {
    nama: "Ibu",
    peran: "tokoh utama",
    usia: "wanita 55-65 tahun, wajah lembut penuh kerinduan",
    ciri: "rambut beruban diikat rapi, mata berkaca-kaca, senyum hangat menahan sedih",
    pakaian: "daster batik cokelat sederhana",
    suasana: "rumah kayu sederhana, cahaya senja keemasan masuk lewat jendela",
  },
];

const GAYA_VISUAL = [
  "Sinematik realistis, cahaya warm golden hour, lensa 35mm, depth of field lembut, palet hangat, mood haru",
  "Ilustrasi cat air emosional, tekstur kertas, sapuan lembut, palet warm pastel",
  "Anime film sedih kualitas layar lebar, pencahayaan senja, palet warm, detail ekspresi halus",
  "3D animasi lembut, lighting golden hour, render halus kualitas film pendek",
];

const STEP_LABEL = ["Niat", "Sudut", "Riset", "Judul", "Visual"];

/** Kompos "script di dalam script": perintah konsistensi yang disuntik ke tiap prompt adegan. */
function composeVisualPrompt(scene: string, chars: CharCard[], gaya: string): string {
  const charBlock = chars
    .filter((c) => c.nama.trim())
    .map((c) => `${c.nama} (${c.peran}): ${c.usia}; ${c.ciri}; pakaian ${c.pakaian}; latar khas ${c.suasana}`)
    .join(" || ");
  return (
    `GAYA VISUAL WAJIB: ${gaya}. ` +
    `KARAKTER WAJIB (jangan diganti/ditambah): ${charBlock || "belum diisi"}. ` +
    `ADEGAN: ${scene}. ` +
    `ATURAN KERAS: wajah, ciri, dan pakaian karakter HARUS identik di semua adegan; ` +
    `ekspresi mengikuti emosi naskah (haru, rindu, penyesalan); tanpa teks, tanpa watermark; ` +
    `rasio 16:9; kualitas layak tonton.`
  );
}

export default function LahanStudio({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [angles, setAngles] = useState<string[]>([]);
  const [selKeyword, setSelKeyword] = useState("");
  const [angle, setAngle] = useState<Angle | null>(null);
  const [researchAt, setResearchAt] = useState("");
  const [selTitle, setSelTitle] = useState("");
  const [busy, setBusy] = useState<"" | "suggest" | "research" | "score">("");
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);
  const [toast, setToast] = useState("");
  const [chars, setChars] = useState<CharCard[]>(DEFAULT_CHARS);
  const [gaya, setGaya] = useState(0);
  const [expanded, setExpanded] = useState<string>("");
  const brain = useMemo(loadBrain, []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 2400);
  }

  /* ---------- restore & persist ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAHAN_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as LahanState;
      setStep(j.step || 1);
      setTopic(j.topic || "");
      setAngles(j.angles || []);
      setSelKeyword(j.selKeyword || "");
      setAngle(j.angle || null);
      setResearchAt(j.researchAt || "");
      setSelTitle(j.selTitle || "");
    } catch { /* draf korup → mulai bersih */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      let slimAngle: Angle | null = angle;
      if (angle) {
        const slim = (v: AnalyzedVideo): AnalyzedVideo => ({ ...v });
        slimAngle = {
          ...angle,
          videos: angle.videos.slice(0, 30).map(slim),
          qualified: angle.qualified.slice(0, 30).map(slim),
          rejected: angle.rejected.slice(0, 10).map(slim),
          rawVideos: angle.rawVideos.slice(0, 30).map(slim),
        };
      }
      const payload: LahanState = { step, topic, angles: angles.slice(0, 40), selKeyword, angle: slimAngle, researchAt, selTitle };
      localStorage.setItem(LAHAN_KEY, JSON.stringify(payload));
    } catch { /* storage penuh → abaikan, transaksi tetap jalan */ }
  }, [step, topic, angles, selKeyword, angle, researchAt, selTitle]);

  /* ---------- intent audiens (live dari topik; niche terkunci story_song) ---------- */
  const intentId = topic.trim() ? detectAudienceIntent(topic + " cerita jadi lagu") : "story_song";
  const card = audienceCard(intentId === "general" ? "story_song" : intentId);

  /* ---------- kandidat judul + skor ---------- */
  const scored: ScoredTitle[] = useMemo(() => {
    if (!angle) return [];
    const compTitles = angle.qualified.slice(0, 6).map((v) => v.title || "").filter(Boolean);
    const cands = uniq([...buildCandidates(angle), ...compTitles]).slice(0, 24);
    const used = brain.results.map((r) => r.title);
    return cands.map((t) => scoreTitleV2(t, angle, brain, used)).sort((a, b) => b.score - a.score);
  }, [angle, brain]);

  const verdict = angle ? (angle.score >= 70 ? { t: "GAS 🔥", c: "ok", d: "Sudut ini layak ditanam. Lanjut tanam cerita!" } : angle.score >= 45 ? { t: "PERTIMBANGKAN 🧐", c: "warn", d: "Bisa jalan, tapi pakai judul yang benar-benar beda dari kompetitor." } : { t: "TAHAN DULU ✋", c: "err", d: "Sinyal pasar lemah/terlalu padat. Coba sudut lain (long-tail)." }) : null;

  /* ---------- aksi ---------- */
  async function fetchSuggest() {
    if (topic.trim().length < 3) { setErr({ code: "topik", msg: "Tulis niat/topik dulu minimal 3 huruf ya bro." }); return; }
    setErr(null);
    setBusy("suggest");
    try {
      const r = await fetch(`/api/yt-suggest?q=${encodeURIComponent(topic.trim())}&hl=id&gl=ID&limit=30`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || `HTTP ${r.status}`);
      const list: string[] = Array.isArray(j.suggestions) ? j.suggestions : [];
      // Niche terkunci: pastikan varian "cerita jadi lagu" selalu tersedia
      const extra = /cerita jadi lagu/i.test(topic) ? [] : [`${topic.trim()} | cerita jadi lagu`];
      setAngles(uniq([topic.trim(), ...extra, ...list]).slice(0, 30));
      flash("🔍 Sudut ketemu dari YouTube autocomplete");
    } catch (e) {
      setErr({ code: "suggest", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("");
    }
  }

  async function runResearch() {
    if (!selKeyword) { setErr({ code: "sudut", msg: "Pilih satu sudut/keyword dulu bro." }); return; }
    setErr(null);
    setBusy("research");
    try {
      const r = await fetch(`/api/yt-research?q=${encodeURIComponent(selKeyword)}&region=ID&lang=id&max=25&order=relevance`);
      const j = await r.json();
      if (!r.ok) {
        const hint = j.hint ? ` ${j.hint}` : "";
        throw Object.assign(new Error((j.message || j.error || `HTTP ${r.status}`) + hint), { code: j.error || "upstream" });
      }
      const a = analyzeAngle(selKeyword, { videos: j.videos || [] }, {
        seed: topic.trim(),
        nicheNote: "cerita jadi lagu",
        suggest: angles,
      });
      setAngle(a);
      setResearchAt(j.fetchedAt || new Date().toISOString());
      setSelTitle("");
      flash(`📊 ${a.total} kompetitor relevan dihitung (dibuang ${a.rejected.length})`);
    } catch (e) {
      const er = e as Error & { code?: string };
      setErr({ code: er.code || "research", msg: er.message });
    } finally {
      setBusy("");
    }
  }

  function lockTitle(t: string) {
    setSelTitle(t);
    setStep(5);
    flash("★ Judul dikunci — siap dirancang visualnya");
  }

  function resetLahan() {
    if (!confirm("Mulai lahan baru? Draf riset sekarang dihapus.")) return;
    setStep(1); setTopic(""); setAngles([]); setSelKeyword(""); setAngle(null); setResearchAt(""); setSelTitle("");
    try { localStorage.removeItem(LAHAN_KEY); } catch { /* abaikan */ }
  }

  const canGo = (k: number): boolean =>
    k === 1 ||
    (k === 2 && topic.trim().length >= 3) ||
    (k === 3 && !!selKeyword) ||
    (k === 4 && !!angle) ||
    (k === 5 && !!selTitle);

  /* ================= RENDER ================= */
  return (
    <div className="lh-wrap">
      <div className="lh-top">
        <button className="lh-back" onClick={onExit}>‹</button>
        <div className="lh-top-t">
          <b>🌱 Lahan Awalan</b>
          <span>Cerita Jadi Lagu · wizard produksi AI</span>
        </div>
        <button className="lh-reset" title="Lahan baru" onClick={resetLahan}>↺</button>
      </div>

      <div className="lh-steps">
        {STEP_LABEL.map((lb, i) => {
          const k = i + 1;
          const on = step === k;
          const done = k < step && canGo(k + 1);
          return (
            <button key={lb} className={`lh-dot ${on ? "on" : ""} ${done ? "done" : ""}`} disabled={!canGo(k)} onClick={() => setStep(k)}>
              <i>{done ? "✓" : k}</i>
              <span>{lb}</span>
            </button>
          );
        })}
      </div>

      {err && (
        <div className="lh-card lh-errcard">
          <b>⚠️ {err.code === "missing_api_key" ? "API key YouTube belum terpasang" : err.code === "quota_exceeded" ? "Kuota YouTube API habis hari ini" : "Ada kendala"}</b>
          <p>{err.msg}</p>
          {err.code === "missing_api_key" && (
            <p className="lh-note">Cara pasang: Vercel → Project → Settings → Environment Variables → tambah <code>YOUTUBE_API_KEY</code> → Redeploy. Kunci didapat gratis dari Google Cloud Console (aktifkan YouTube Data API v3).</p>
          )}
        </div>
      )}

      {/* ============ LANGKAH 1: NIAT & TOPIK ============ */}
      {step === 1 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Apa niat ceritamu, bro? 🌱</div>
            <p className="lh-sub">Niche terkunci dulu: <b>🎵 Cerita Jadi Lagu</b> — biar fokus & dalam. Nanti merambah.</p>
            <textarea
              className="lh-ta"
              rows={3}
              placeholder='contoh: "ibu aku rindu" · "maaf ibu aku terlambat" · "ayah yang tak pernah kukenal"'
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div className="lh-chips">
              {["rindu ibu cerita jadi lagu", "maaf ibu aku terlambat", "lagu untuk ayah tersayang", "ibu engkau yang terbaik"].map((p) => (
                <button key={p} className="lh-chip" onClick={() => setTopic(p)}>{p}</button>
              ))}
            </div>
            <button className="lh-btn" disabled={topic.trim().length < 3 || busy === "suggest"} onClick={() => { void fetchSuggest().then(() => setStep(2)); }}>
              {busy === "suggest" ? "⏳ Nyari sudut..." : "Cari Sudut 🔍"}
            </button>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🎯 Kenali penontonmu dulu</div>
            <div className="lh-kv"><span>Niche</span><b>{card.label}</b></div>
            <div className="lh-kv"><span>Penonton</span><b>{card.audience}</b></div>
            <div className="lh-kv"><span>Usia · perangkat</span><b>{card.age} · {card.device}</b></div>
            <div className="lh-kv"><span>Emosi utama</span><b>{dominantEmotion(intentId === "general" ? "story_song" : intentId)}</b></div>
            <div className="lh-kv"><span>Nonton sambil</span><b>{watchActivity(intentId === "general" ? "story_song" : intentId)}</b></div>
            <div className="lh-kv"><span>Jam upload</span><b>{card.upload}</b></div>
            <div className="lh-kv"><span>Solusi konten</span><b>{solutionFor(intentId === "general" ? "story_song" : intentId)}</b></div>
            <div className="lh-kv"><span>Cuan ke depan</span><b>{monetizationHint(intentId === "general" ? "story_song" : intentId)}</b></div>
          </div>
        </>
      )}

      {/* ============ LANGKAH 2: SUDUT ============ */}
      {step === 2 && (
        <div className="lh-card">
          <div className="lh-h1">Pilih sudut pandang 🔍</div>
          <p className="lh-sub">Ini kata kunci asli yang orang ketik di YouTube (autocomplete), bukan tebakan. Pilih satu sebagai arah riset.</p>
          {!angles.length && (
            <button className="lh-btn" disabled={busy === "suggest"} onClick={fetchSuggest}>
              {busy === "suggest" ? "⏳ Nyari sudut..." : `Cari sudut untuk "${topic}" 🔍`}
            </button>
          )}
          <div className="lh-rows">
            {angles.map((a) => (
              <button key={a} className={`lh-row ${selKeyword === a ? "on" : ""}`} onClick={() => setSelKeyword(a)}>
                <span className="t">{a}</span>
                <span className="lh-badge">{a === topic.trim() ? "niat awal" : "youtube"}</span>
              </button>
            ))}
          </div>
          {!!angles.length && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "suggest"} onClick={fetchSuggest}>↻ Muat ulang</button>
              <button className="lh-btn" style={{ flex: 2 }} disabled={!selKeyword} onClick={() => setStep(3)}>Riset Sudut Ini 📊</button>
            </div>
          )}
        </div>
      )}

      {/* ============ LANGKAH 3: RISET ============ */}
      {step === 3 && (
        <>
          {!angle && (
            <div className="lh-card">
              <div className="lh-h1">Riset kompetitor 📊</div>
              <p className="lh-sub">Mesin mengambil video kompetitor untuk <b>"{selKeyword}"</b>, lalu menghitung demand, ruang lawan, kesegaran & pola judul. 1 riset ≈ 102 unit kuota (gratis 10.000/hari). Angka asli dari YouTube Data API — bukan karangan.</p>
              <button className="lh-btn" disabled={busy === "research"} onClick={runResearch}>
                {busy === "research" ? "⏳ Menghitung ladang..." : "Mulai Riset 📊"}
              </button>
            </div>
          )}

          {angle && verdict && (
            <>
              <div className={`lh-card lh-verdict ${verdict.c}`}>
                <div className="lh-vscore">{angle.score}</div>
                <div>
                  <b>{verdict.t}</b>
                  <p>{verdict.d}</p>
                  <p className="lh-note">Niche: {angle.niche.label} ({angle.niche.confidence}/100) · Format: {angle.format.label}</p>
                </div>
              </div>

              <div className="lh-kpis">
                <div className="lh-kpi"><span>Demand pasar</span><b className={scoreTone(angle.metrics.demand)}>{angle.metrics.demand}</b><i>{angle.metrics.demand >= 75 ? "TINGGI" : angle.metrics.demand >= 50 ? "SEDANG" : "RENDAH"}</i></div>
                <div className="lh-kpi"><span>Ruang lawan</span><b className={scoreTone(angle.metrics.low)}>{angle.metrics.low}</b><i>{angle.metrics.low >= 65 ? "LONGGAR" : angle.metrics.low >= 35 ? "SEDANG" : "PADAT"}</i></div>
                <div className="lh-kpi"><span>Bukti channel kecil</span><b className={scoreTone(angle.metrics.smallProof)}>{angle.metrics.smallProof}</b><i>views &gt; subs</i></div>
                <div className="lh-kpi"><span>Kesegaran</span><b className={scoreTone(angle.metrics.fresh)}>{angle.metrics.fresh}</b><i>video ≤120 hari</i></div>
                <div className="lh-kpi"><span>Celah pola</span><b className={scoreTone(angle.metrics.gap)}>{angle.metrics.gap}</b><i>ruang beda</i></div>
                <div className="lh-kpi"><span>Keyakinan data</span><b className={scoreTone(angle.metrics.confidence)}>{angle.metrics.confidence}</b><i>{angle.total} kompetitor</i></div>
              </div>

              <div className="lh-card">
                <div className="lh-h2">🧠 Kenapa skornya segitu</div>
                <ul className="lh-reasons">
                  {angle.reasons.map((r, i) => (
                    <li key={i} className={r.c}>{r.t}</li>
                  ))}
                </ul>
              </div>

              {!!angle.patterns.titlePatterns.length && (
                <div className="lh-card">
                  <div className="lh-h2">🧩 Pola judul kompetitor</div>
                  <div className="lh-chips">
                    {angle.patterns.titlePatterns.slice(0, 8).map((p) => (
                      <span key={p.id} className="lh-chip" title={p.examples.slice(0, 3).join("\n")}>{p.label} ×{p.count}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="lh-card">
                <div className="lh-h2">👀 Lawan terlaris (per hari)</div>
                <div className="lh-tbl">
                  {[...angle.qualified].sort((a, b) => b.vpd - a.vpd).slice(0, 10).map((v, i) => (
                    <a key={v.id || i} className="lh-trow" href={v.url} target="_blank" rel="noreferrer">
                      <span className="n">{i + 1}</span>
                      <span className="tt">{v.title}</span>
                      <span className="st">{fmtNum(v.views)} 👁<br />{fmtNum(v.vpd)}/hr · {fmtNum(v.subs)} subs</span>
                    </a>
                  ))}
                </div>
                <p className="lh-note">{DATA_GAPS.join(" ")}</p>
              </div>

              <div className="lh-card">
                <div className="lh-h2">🎯 Audiens & CTA</div>
                <div className="lh-kv"><span>Yang mereka takutkan</span><b>{card.fears.join(" · ")}</b></div>
                <div className="lh-kv"><span>Yang mereka inginkan</span><b>{card.desires.join(" · ")}</b></div>
                <div className="lh-kv"><span>CTA ampuh</span><b>{card.ctas[0]}</b></div>
                <div className="lh-kv"><span>Arah thumbnail</span><b>{card.thumb}</b></div>
                <div className="lh-kv"><span>Saran perangkat</span><b>{deviceAdvice(card.device).join(" · ")}</b></div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="lh-btn sec" style={{ flex: 1 }} disabled={busy === "research"} onClick={runResearch}>↻ Riset ulang</button>
                <button className="lh-btn" style={{ flex: 2 }} onClick={() => setStep(4)}>Hitung Judul Juara 🏆</button>
              </div>
              {researchAt && <p className="lh-note" style={{ textAlign: "center" }}>Riset: {new Date(researchAt).toLocaleString("id-ID")}</p>}
            </>
          )}
        </>
      )}

      {/* ============ LANGKAH 4: JUDUL JUARA ============ */}
      {step === 4 && angle && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Pilih judul juara 🏆</div>
            <p className="lh-sub">Semua kandidat diskor mesin vs pola & kemiripan kompetitor. Buka “audit” untuk lihat hitungannya — transparan, bukan kotak hitam.</p>
          </div>
          <div className="lh-rows">
            {scored.map((s, i) => (
              <div key={s.title} className={`lh-srow ${selTitle === s.title ? "on" : ""}`}>
                <button className="lh-smain" onClick={() => setSelTitle(s.title)}>
                  <span className="lh-medal">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <span className="tt">{s.title}</span>
                  <span className={`lh-sc ${scoreTone(s.score)}`}>{s.score}</span>
                </button>
                <div className="lh-bars">
                  <div className="lh-bar" title={`Search ${s.search}`}><i style={{ width: `${s.search}%` }} /><span>S</span></div>
                  <div className="lh-bar" title={`Browse ${s.browse}`}><i style={{ width: `${s.browse}%` }} /><span>B</span></div>
                  <div className="lh-bar" title={`Unik ${s.unique}`}><i style={{ width: `${s.unique}%` }} /><span>U</span></div>
                  <div className="lh-bar" title={`Hook ${s.hookScore}`}><i style={{ width: `${s.hookScore}%` }} /><span>H</span></div>
                </div>
                <div className="lh-sactions">
                  <button className="lh-mini" onClick={() => setExpanded(expanded === s.title ? "" : s.title)}>{expanded === s.title ? "tutup ▴" : "audit ▾"}</button>
                  <span className="lh-strat">{s.strategy}</span>
                  <button className="lh-mini ok" onClick={() => lockTitle(s.title)}>★ Kunci</button>
                </div>
                {expanded === s.title && (
                  <div className="lh-audit">
                    <ul className="lh-reasons">
                      {s.reasons.map((r, j) => <li key={j} className={r.c}>{r.t}</li>)}
                    </ul>
                    {!!s.gap_words.length && <p className="lh-note">Kata celah: {s.gap_words.join(", ")}</p>}
                    {!!s.gap_phrases.length && <p className="lh-note">Frasa celah: {s.gap_phrases.join(", ")}</p>}
                    <div className="lh-kv"><span>Hook thumbnail</span><b>{s.hook}</b></div>
                    <div className="lh-kv"><span>Tags</span><b>{s.tags.split(", ").slice(0, 8).join(", ")}…</b></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {selTitle && (
            <button className="lh-btn" onClick={() => setStep(5)}>Lanjut: Cerita & Visual WAW 🎬</button>
          )}
        </>
      )}

      {/* ============ LANGKAH 5: CERITA & VISUAL WAW (PROMPT ENGINE) ============ */}
      {step === 5 && (
        <>
          <div className="lh-card">
            <div className="lh-h1">Mesin visual WAW 🎬</div>
            <p className="lh-sub">Judul terkunci: <b>{selTitle}</b></p>
            <p className="lh-sub">Di sinilah “script di dalam script” bekerja: <b>kartu karakter + gaya visual</b> disuntik ke TIAP prompt adegan — jadi wajah, pakaian & suasana <b>konsisten</b> dari adegan 1 sampai akhir. Inilah yang bikin orang bilang <i>“kok cerdas banget software-nya”</i>.</p>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🎨 Gaya visual</div>
            <div className="lh-rows">
              {GAYA_VISUAL.map((g, i) => (
                <button key={g} className={`lh-row ${gaya === i ? "on" : ""}`} onClick={() => setGaya(i)}>
                  <span className="t">{g}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lh-card">
            <div className="lh-h2">🧍 Kartu karakter <button className="lh-mini" onClick={() => setChars([...chars, { nama: "", peran: "pendukung", usia: "", ciri: "", pakaian: "", suasana: "" }])}>＋ tambah</button></div>
            {chars.map((c, i) => (
              <div key={i} className="lh-char">
                <div className="lh-char-head">
                  <input className="lh-in" placeholder="Nama (mis. Ibu)" value={c.nama} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, nama: e.target.value } : x))} />
                  {chars.length > 1 && <button className="lh-mini" onClick={() => setChars(chars.filter((_, j) => j !== i))}>🗑</button>}
                </div>
                <input className="lh-in" placeholder="Peran & rentang usia (mis. tokoh utama, wanita 55-65 th)" value={c.usia} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, usia: e.target.value } : x))} />
                <input className="lh-in" placeholder="Ciri wajib konsisten (rambut, mata, senyum...)" value={c.ciri} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, ciri: e.target.value } : x))} />
                <input className="lh-in" placeholder="Pakaian khas" value={c.pakaian} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, pakaian: e.target.value } : x))} />
                <input className="lh-in" placeholder="Suasana latar khas" value={c.suasana} onChange={(e) => setChars(chars.map((x, j) => j === i ? { ...x, suasana: e.target.value } : x))} />
              </div>
            ))}
          </div>

          <div className="lh-card">
            <div className="lh-h2">📜 Contoh perintah terinjeksi (adegan 1)</div>
            <pre className="lh-prompt">{composeVisualPrompt(`Opening: ${selTitle} — suasana awal cerita, ekspresi utama rindu`, chars, GAYA_VISUAL[gaya])}</pre>
            <button className="lh-btn sec" onClick={() => { void navigator.clipboard?.writeText(composeVisualPrompt(`Opening: ${selTitle}`, chars, GAYA_VISUAL[gaya])).then(() => flash("📋 Prompt tersalin")); }}>📋 Salin prompt</button>
            <p className="lh-note">Generate gambar per adegan + lagu Suno + gabung otomatis & masuk Studio Edit = <b>update v7.8</b>. Fondasi prompt-nya sudah siap di sini.</p>
          </div>

          <div className="lh-card">
            <div className="lh-h2">📦 Paket upload (dari otak)</div>
            {(() => {
              const s = scored.find((x) => x.title === selTitle);
              if (!s) return <p className="lh-note">Skor judul tidak ditemukan — ulangi langkah Judul.</p>;
              return (
                <>
                  <div className="lh-kv"><span>Hook thumbnail</span><b>{s.hook}</b></div>
                  <div className="lh-kv"><span>Skor</span><b className={scoreTone(s.score)}>{s.score}/100 · {s.strategy}</b></div>
                  <div className="lh-kv"><span>Deskripsi</span><b style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{s.desc.slice(0, 300)}…</b></div>
                </>
              );
            })()}
          </div>
        </>
      )}

      <p className="lh-note" style={{ textAlign: "center", marginTop: 14 }}>
        🧠 VERVE Brain v1 · port mesin riset milik sendiri · skor bisa diaudit, tanpa mengarang angka
      </p>
      {toast && <div className="lh-toast">{toast}</div>}
    </div>
  );
}
