"use client";
import { useEffect, useMemo, useState } from "react";
import { diagnoseGrowth, parseClockToSec, type GrowthInput, type GrowthMode } from "@/lib/brain/growth-doctor";
import { addExperimentToLedger, addSnapshotToLedger, computeGrowthBaseline, compareSnapshotToBaseline, createExperimentFromDiagnosis, createGrowthSnapshot, emptyGrowthLedger, gradeExperiment, GROWTH_LEDGER_KEY, updateExperimentInLedger, type GrowthExperiment, type GrowthLedger } from "@/lib/brain/growth-ledger";
import { extractStudioRows, summarizeStudioRow, type YtStudioCsvRow } from "@/lib/brain/yt-studio-csv";

type ShotKey = "ringkasan" | "jangkauan" | "interaksi" | "audiens";
const SHOTS: { id: ShotKey; label: string; hint: string; need: string }[] = [
  { id: "ringkasan", label: "Ringkasan", hint: "Views, watch time, traffic ringkas", need: "Views" },
  { id: "jangkauan", label: "Jangkauan", hint: "Tayangan/impressions, CTR, traffic source", need: "Impressions + CTR" },
  { id: "interaksi", label: "Interaksi", hint: "AVD, retention, durasi tonton", need: "AVD + Retention" },
  { id: "audiens", label: "Audiens", hint: "Subscriber vs non-sub, geografi, subtitle", need: "Opsional" },
];

function num(v: string): number | undefined {
  const raw = String(v ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
function clockInput(v: string): number | undefined {
  if (!String(v || "").trim()) return undefined;
  const sec = parseClockToSec(v);
  return sec > 0 ? sec : undefined;
}
function copy(t: string) { try { navigator.clipboard.writeText(t); } catch {} }
function secToClock(v?: number): string {
  if (v == null || !Number.isFinite(v)) return "";
  const n = Math.max(0, Math.round(v));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function csvCoverageText(r: YtStudioCsvRow): string {
  const c = summarizeStudioRow(r);
  const found = c.found.length ? c.found.join(", ") : "belum ada";
  const missing = c.missing.length ? c.missing.join(", ") : "lengkap";
  return `Terbaca: ${found}. Belum ada: ${missing}`;
}

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
  const [shots, setShots] = useState<Partial<Record<ShotKey, string>>>({});
  const [activeShot, setActiveShot] = useState<ShotKey | null>(null);
  const [csvRows, setCsvRows] = useState<YtStudioCsvRow[]>([]);
  const [csvMsg, setCsvMsg] = useState("");

  const applyRow = (r: YtStudioCsvRow) => {
    // CSV harus jujur: field yang tidak ada di CSV dikosongkan, bukan dibiarkan dari input lama/placeholder.
    setTitle(r.title || "");
    setViews(r.views != null ? String(r.views) : "");
    setImpressions(r.impressions != null ? String(r.impressions) : "");
    setCtr(r.ctrPct != null ? String(r.ctrPct) : "");
    setDur(r.durationSec != null ? secToClock(r.durationSec) : "");
    setAvd(r.avgViewSec != null ? secToClock(r.avgViewSec) : "");
    setRet30(r.retention30Pct != null ? String(r.retention30Pct) : "");
    setLikes(r.likes != null ? String(r.likes) : "");
    setComments(r.comments != null ? String(r.comments) : "");
    setSubs(r.subs != null ? String(r.subs) : "");
    setAge(r.uploadAgeHours != null ? String(r.uploadAgeHours) : "");
    setRan(true);
    setCsvMsg(`✅ Baris ${r.rowIndex} dipakai: ${r.title}. ${csvCoverageText(r)}`);
  };
  const importCsv = async (f?: File | null) => {
    if (!f) return;
    try {
      const text = await f.text();
      const rows = extractStudioRows(text, mode);
      setCsvRows(rows.slice(0, 50));
      setCsvMsg(rows.length ? `📥 ${rows.length} baris CSV terbaca. Pilih video atau simpan jadi baseline.` : "⚠️ CSV terbaca tapi kolom video/metrik tidak dikenali.");
      if (rows.length === 1) applyRow(rows[0]);
    } catch { setCsvMsg("⚠️ Gagal membaca CSV. Pastikan file dari YouTube Studio / format CSV."); }
  };
  const saveCsvBaseline = () => {
    if (!csvRows.length) { setCsvMsg("Belum ada CSV yang terbaca"); return; }
    let next = ledger;
    csvRows.forEach((r) => { next = addSnapshotToLedger(next, createGrowthSnapshot(r, diagnoseGrowth(r))); });
    persistLedger(next, `📊 ${csvRows.length} baris CSV masuk baseline channel`);
  };

  const pickShot = (id: ShotKey, f?: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setShots((s) => ({ ...s, [id]: String(r.result || "") })); setActiveShot(id); };
    r.readAsDataURL(f);
  };
  const clearShot = (id: ShotKey) => setShots((s) => { const n = { ...s }; delete n[id]; return n; });

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
    durationSec: clockInput(dur),
    avgViewSec: clockInput(avd),
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
  const shotChecklist = [
    { label: "Views/Ringkasan", ok: !!shots.ringkasan || !!views },
    { label: "Impressions", ok: !!shots.jangkauan || !!impressions },
    { label: "CTR", ok: !!shots.jangkauan || !!ctr },
    { label: "AVD/Retention", ok: !!shots.interaksi || !!avd || !!ret30 },
    { label: "Audiens opsional", ok: !!shots.audiens },
  ];
  const saveSnapshot = () => {
    if (!input.views && !input.impressions && !input.ctrPct) { setSavedMsg("Isi minimal views/impressions/CTR dulu"); return; }
    persistLedger(addSnapshotToLedger(ledger, createGrowthSnapshot(input, dx)), "📊 Snapshot performa tersimpan");
  };
  const makeExperiment = () => {
    if (!show) { setSavedMsg("Diagnosa dulu sebelum bikin eksperimen"); return; }
    const exp = createExperimentFromDiagnosis(input, dx, baseline);
    persistLedger(addExperimentToLedger(addSnapshotToLedger(ledger, exp.before), exp), "🧪 Eksperimen dibuat: cek ulang 48–72 jam");
  };
  const clearLedger = () => {
    if (!confirm("Hapus baseline & eksperimen Growth Doctor di HP ini? Pakai ini kalau sempat menyimpan data placeholder/salah.")) return;
    persistLedger(emptyGrowthLedger(), "🧹 Baseline Growth Doctor dibersihkan");
  };
  const gradePendingExperiment = (exp: GrowthExperiment) => {
    if (!input.views && !input.impressions && !input.ctrPct && !input.retention30Pct) { setSavedMsg("Isi data terbaru dulu untuk menilai eksperimen"); return; }
    const after = createGrowthSnapshot(input, dx);
    const graded = gradeExperiment(exp, after);
    const next = updateExperimentInLedger(addSnapshotToLedger(ledger, after), graded);
    persistLedger(next, graded.status === "success" ? "🏆 Eksperimen berhasil" : graded.status === "partial" ? "🟡 Eksperimen naik sebagian" : "🔴 Eksperimen belum berhasil");
  };
  const statusEmoji = (s: string) => s === "success" ? "🏆" : s === "partial" ? "🟡" : s === "failed" ? "🔴" : "⏳";

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

      <div className="gd-card gd-shotbox">
        <div className="gd-label">📷 SCREENSHOT STUDIO COMPANION</div>
        <p>Upload screenshot dari tab YouTube Studio. Belum OCR — lihat preview sambil isi angka di form bawah.</p>
        <div className="gd-shotgrid">
          {SHOTS.map((s) => (
            <div className={`gd-shot ${shots[s.id] ? "ok" : ""}`} key={s.id}>
              <b>{s.label}</b><span>{s.hint}</span><em>{s.need}</em>
              {shots[s.id] ? <img src={shots[s.id]} alt={s.label} onClick={() => setActiveShot(activeShot === s.id ? null : s.id)} /> : null}
              <label>{shots[s.id] ? "Ganti" : "Upload"}<input type="file" accept="image/*" hidden onChange={(e) => { pickShot(s.id, e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
              {shots[s.id] ? <button onClick={() => clearShot(s.id)}>hapus</button> : null}
            </div>
          ))}
        </div>
        {activeShot && shots[activeShot] ? <img className="gd-shotbig" src={shots[activeShot]} alt="preview besar" /> : null}
        <div className="gd-shotchecks">
          {shotChecklist.map((c) => <span key={c.label} className={c.ok ? "ok" : ""}>{c.ok ? "✅" : "⬜"} {c.label}</span>)}
        </div>
      </div>

      <div className="gd-card gd-csvbox">
        <div className="gd-label">📥 CSV YOUTUBE STUDIO</div>
        <p>Kalau bro punya CSV dari Studio desktop/laptop, upload di sini. VERVE akan baca baris video dan bisa simpan semuanya jadi baseline channel.</p>
        <label className="gd-csvpick">📂 Import CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { importCsv(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
        {!!csvMsg && <em>{csvMsg}</em>}
        {!!csvRows.length && (
          <div className="gd-csvrows">
            <button className="save" onClick={saveCsvBaseline}>📊 Simpan {csvRows.length} baris jadi baseline</button>
            {csvRows.slice(0, 8).map((r) => {
              const c = summarizeStudioRow(r);
              return (
                <button key={`${r.rowIndex}-${r.title}`} onClick={() => applyRow(r)}>
                  <b>{r.title}</b>
                  <span>Views {r.views ?? "?"} · Impr {r.impressions ?? "?"} · CTR {r.ctrPct ?? "?"}% · Ret {r.retention30Pct ?? "?"}%</span>
                  <small>CSV isi: {c.found.join(", ") || "belum ada"}</small>
                </button>
              );
            })}
          </div>
        )}
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
          <button className="danger" onClick={clearLedger}>🧹 Reset Baseline</button>
        </div>
        {!!savedMsg && <p>{savedMsg}</p>}
        {!!ledger.experiments.length && <small>Eksperimen aktif: {ledger.experiments.filter(e => e.status === "pending").length} pending · total {ledger.experiments.length}</small>}
        {!!ledger.experiments.length && (
          <div className="gd-exp-list">
            {ledger.experiments.slice(0, 5).map((e) => (
              <div className={`gd-exp ${e.status}`} key={e.id}>
                <b>{statusEmoji(e.status)} {e.videoTitle}</b>
                <span>{e.issueCode} · target {e.targetMetric} ≥ {e.targetValue}</span>
                <em>{e.resultNote || e.action}</em>
                {e.status === "pending" ? <button onClick={() => gradePendingExperiment(e)}>Nilai pakai data sekarang</button> : <button onClick={() => copy(`${e.videoTitle}\n${e.status}\n${e.resultNote || ""}`)}>Salin hasil</button>}
              </div>
            ))}
          </div>
        )}
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
