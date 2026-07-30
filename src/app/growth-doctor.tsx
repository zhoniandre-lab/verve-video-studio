"use client";
import { useEffect, useMemo, useState } from "react";
import { diagnoseGrowth, parseClockToSec, type GrowthInput, type GrowthMode } from "@/lib/brain/growth-doctor";
import { addExperimentToLedger, addSnapshotToLedger, computeGrowthBaseline, compareSnapshotToBaseline, createExperimentFromDiagnosis, createGrowthSnapshot, emptyGrowthLedger, GROWTH_LEDGER_KEY, type GrowthLedger } from "@/lib/brain/growth-ledger";

function num(v: string): number | undefined { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : undefined; }
function copy(t: string) { try { navigator.clipboard.writeText(t); } catch {} }

export default function GrowthDoctor({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<GrowthMode>("long");
  const [symptom, setSymptom] = useState("video sepi");
  const [title, setTitle] = useState("");
  const [views, setViews] = useState("");
  const [impressions, setImpressions] = useState("");
  const [ctr, setCtr] = useState("");
  const [dur, setDur] = useState("");
  const [avd, setAvd] = useState("");
  const [ret30, setRet30] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [subs, setSubs] = useState("");
  const [age, setAge] = useState("");
  const [ran, setRan] = useState(false);
  const [ledger, setLedger] = useState<GrowthLedger>(() => emptyGrowthLedger());
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROWTH_LEDGER_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        setLedger({ snapshots: Array.isArray(j.snapshots) ? j.snapshots : [], experiments: Array.isArray(j.experiments) ? j.experiments : [] });
      }
    } catch { /* no-op */ }
  }, []);
  const persistLedger = (next: GrowthLedger, msg: string) => {
    setLedger(next);
    try { localStorage.setItem(GROWTH_LEDGER_KEY, JSON.stringify(next)); } catch { /* penuh? tetap tampil sesi ini */ }
    setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 2200);
  };

  const input: GrowthInput = useMemo(() => ({

    mode,
    title,
    symptom,
    views: num(views),
    impressions: num(impressions),
    ctrPct: num(ctr),
    durationSec: parseClockToSec(dur),
    avgViewSec: parseClockToSec(avd),
    retention30Pct: num(ret30),
    likes: num(likes),
    comments: num(comments),
    subs: num(subs),
    uploadAgeHours: num(age),
  }), [mode, title, symptom, views, impressions, ctr, dur, avd, ret30, likes, comments, subs, age]);

  const dx = useMemo(() => diagnoseGrowth(input), [input]);
  const baseline = useMemo(() => computeGrowthBaseline(ledger.snapshots || [], { mode }), [ledger.snapshots, mode]);
  const currentSnap = useMemo(() => createGrowthSnapshot(input, dx), [input, dx]);
  const baselineCmp = useMemo(() => compareSnapshotToBaseline(currentSnap, baseline), [currentSnap, baseline]);
  const show = ran || !!views || !!ctr || !!ret30 || !!impressions;
  const saveSnapshot = () => {
    if (!input.views && !input.impressions && !input.ctrPct) { setSavedMsg("Isi minimal views/impressions/CTR dulu"); return; }
    persistLedger(addSnapshotToLedger(ledger, createGrowthSnapshot(input, dx)), "📊 Snapshot performa tersimpan");
  };
  const makeExperiment = () => {
    if (!show) { setSavedMsg("Diagnosa dulu sebelum bikin eksperimen"); return; }
    const exp = createExperimentFromDiagnosis(input, dx, baseline);
    persistLedger(addExperimentToLedger(addSnapshotToLedger(ledger, exp.before), exp), "🧪 Eksperimen dibuat: cek ulang 48–72 jam");
  };

  const metric = (label: string, value: string, set: (v: string) => void, ph: string, inputMode: "decimal" | "text" = "decimal") => (
    <label className="gd-field">
      <span>{label}</span>
      <input inputMode={inputMode} value={value} onChange={(e) => set(e.target.value)} placeholder={ph} />
    </label>
  );

  return (
    <div className="gd-wrap">
      <div className="gd-top">
        <button onClick={onExit}>×</button>
        <div><b>🩺 Dokter Channel</b><span>Kenapa video sepi? Aku baca gejalanya & kasih tindakan.</span></div>
      </div>

      <div className="gd-hero">
        <i />
        <b>Growth Doctor</b>
        <p>Bukan cuma analytics. VERVE menjawab: <strong>Kenapa</strong>, <strong>Kok bisa</strong>, <strong>Seharusnya</strong>, lalu kasih aksi.</p>
      </div>

      <div className="gd-card">
        <div className="gd-label">MODE VIDEO</div>
        <div className="gd-seg">
          {([["long", "YouTube Long"], ["shorts", "Shorts"], ["reels", "Reels/TikTok"]] as [GrowthMode, string][]).map(([id, lb]) => (
            <button key={id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{lb}</button>
          ))}
        </div>
      </div>

      <div className="gd-card">
        <div className="gd-label">GEJALA CEPAT</div>
        <div className="gd-chips">
          {["video sepi", "klik rendah", "keluar awal", "view turun", "shorts mentok", "judul lemah", "thumbnail lemah"].map((s) => (
            <button key={s} className={symptom === s ? "on" : ""} onClick={() => setSymptom(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="gd-card">
        <div className="gd-label">DATA CEPAT</div>
        <label className="gd-field wide"><span>Judul video</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="contoh: Doa Ibu, Warisan Terindah" /></label>
        <div className="gd-grid">
          {metric("Views", views, setViews, "120")}
          {metric("Impressions", impressions, setImpressions, "8000")}
          {metric("CTR %", ctr, setCtr, "1.2")}
          {metric("Durasi", dur, setDur, "04:30", "text")}
          {metric("Avg View", avd, setAvd, "00:27", "text")}
          {metric("Retention 30s %", ret30, setRet30, "18")}
          {metric("Likes", likes, setLikes, "20")}
          {metric("Comments", comments, setComments, "3")}
          {metric("Subs +", subs, setSubs, "1")}
          {metric("Umur upload (jam)", age, setAge, "24")}
        </div>
        <button className="gd-diagnose" onClick={() => setRan(true)}>🩺 Diagnosa Sekarang</button>
      </div>

      <div className="gd-ledger">
        <div className="gd-label">BASELINE CHANNEL</div>
        <div className="gd-basegrid">
          <span><b>{baseline.sample}</b><em>snapshot</em></span>
          <span><b>{baseline.ctrMedian ?? "?"}%</b><em>CTR median</em></span>
          <span><b>{baseline.retention30Median ?? "?"}%</b><em>Ret30 median</em></span>
          <span><b>{baseline.avdPctMedian ?? "?"}%</b><em>AVD median</em></span>
        </div>
        <div className="gd-indexes">
          <i>CTR index: {baselineCmp.ctrIndex ?? "?"}×</i>
          <i>Hook index: {baselineCmp.retentionIndex ?? "?"}×</i>
          <i>Eng index: {baselineCmp.engagementIndex ?? "?"}×</i>
        </div>
        <div className="gd-ledger-actions">
          <button onClick={saveSnapshot}>💾 Simpan Snapshot</button>
          <button onClick={makeExperiment}>🧪 Buat Eksperimen</button>
        </div>
        {!!savedMsg && <p>{savedMsg}</p>}
        {!!ledger.experiments.length && <small>Eksperimen aktif: {ledger.experiments.filter(e => e.status === "pending").length} pending · total {ledger.experiments.length}</small>}
      </div>

      {show && (
        <div className="gd-result">
          <div className={`gd-status ${dx.status.level}`}>
            <span>{dx.status.level === "danger" ? "🚨" : dx.status.level === "warn" ? "⚠️" : "✅"}</span>
            <div><b>{dx.status.title}</b><p>{dx.status.summary}</p></div>
          </div>

          <div className={`gd-proof ${dx.confidence.level}`}>
            <div className="head"><b>🔬 Bukti & Keyakinan</b><span>{dx.confidence.level.toUpperCase()} · {dx.confidence.score}/100</span></div>
            <p>{dx.confidence.reason}</p>
            <details open>
              <summary>Fakta yang dipakai ({dx.facts.length || 0})</summary>
              {(dx.facts.length ? dx.facts : ["Belum ada fakta metrik yang cukup."]).map((f, i) => <em key={i}>• {f}</em>)}
            </details>
            <details>
              <summary>Issue + bukti ({dx.issues.length || 0})</summary>
              {dx.issues.map((iss) => <em key={iss.code}>• {iss.code} [{iss.confidence}] — {iss.evidence.join("; ")}</em>)}
            </details>
            <details>
              <summary>Data yang masih kurang</summary>
              {dx.missingData.slice(0, 8).map((m, i) => <em key={i}>• {m}</em>)}
            </details>
          </div>

          <div className="gd-scoregrid">
            {dx.scores.map((s) => (
              <div className={`gd-score ${s.level}`} key={s.id}>
                <span>{s.label}</span><b>{s.value}</b><em>{s.note}</em>
                <i style={{ width: `${s.value}%` }} />
              </div>
            ))}
          </div>

          <div className="gd-kkk">
            <section><b>❓ Kenapa</b>{dx.kenapa.map((x, i) => <p key={i}>{x}</p>)}</section>
            <section><b>🧠 Kok Bisa</b>{dx.kokBisa.map((x, i) => <p key={i}>{x}</p>)}</section>
            <section><b>🎯 Seharusnya</b>{dx.seharusnya.map((x, i) => <p key={i}>{x}</p>)}</section>
          </div>

          <div className="gd-actions">
            <div className="gd-label">AKSI CEPAT</div>
            {dx.actions.map((a) => (
              <button key={a.id} onClick={() => copy(`${a.title}\n${a.detail}`)}>
                <b>{a.cta}</b><span>{a.detail}</span>
              </button>
            ))}
          </div>
          <button className="gd-copy" onClick={() => copy(dx.planText)}>📋 Salin Rencana Aksi Lengkap</button>
        </div>
      )}
    </div>
  );
}
