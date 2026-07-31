"use client";
import { useEffect, useMemo, useState } from "react";
import { diagnoseGrowth, parseClockToSec, type GrowthInput, type GrowthMode } from "@/lib/brain/growth-doctor";
import { addExperimentToLedger, addSnapshotToLedger, computeGrowthBaseline, compareSnapshotToBaseline, createExperimentFromDiagnosis, createGrowthSnapshot, emptyGrowthLedger, gradeExperiment, GROWTH_LEDGER_KEY, updateExperimentInLedger, type GrowthExperiment, type GrowthLedger } from "@/lib/brain/growth-ledger";
import { extractStudioRows, summarizeStudioRow, type YtStudioCsvRow } from "@/lib/brain/yt-studio-csv";
import { extractStudioText, summarizeStudioText, type YtStudioTextResult } from "@/lib/brain/yt-studio-text";
import { extractYoutubeVideoId } from "@/lib/brain/youtube-url";

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
function readFileDataUrl(f: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Gagal membaca file"));
    r.readAsDataURL(f);
  });
}
async function makeOcrBlob(file: File, crop?: { y: number; h: number }, tag = "full"): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const dataUrl = await readFileDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Gagal memuat gambar"));
      im.src = dataUrl;
    });
    const sx = 0;
    const sy = Math.max(0, Math.round((crop?.y || 0) * img.height));
    const sw = img.width;
    const sh = Math.max(1, Math.min(img.height - sy, Math.round((crop?.h || 1) * img.height)));
    // Crop di-upscale supaya OCR lebih mudah baca teks kecil di screenshot HP.
    const targetW = Math.min(1080, Math.max(img.width, 720));
    const scale = targetW / sw;
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    let q = 0.88;
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    while (blob && blob.size > 1_150_000 && q > 0.54) {
      q -= 0.08;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    }
    return blob ? new File([blob], `studio-ocr-${tag}.jpg`, { type: "image/jpeg" }) : file;
  } catch { return file; }
}
async function makeOcrImages(file: File): Promise<File[]> {
  // Full + crop overlap. Crop membantu OCR.space membaca teks kecil dari screenshot YouTube Studio di HP.
  const variants = await Promise.all([
    makeOcrBlob(file, undefined, "full"),
    makeOcrBlob(file, { y: 0, h: 0.62 }, "top"),
    makeOcrBlob(file, { y: 0.34, h: 0.66 }, "bottom"),
  ]);
  const seen = new Set<string>();
  return variants.filter((f) => {
    const k = `${f.name}:${f.size}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}
function csvCoverageText(r: YtStudioCsvRow): string {
  const c = summarizeStudioRow(r);
  const found = c.found.length ? c.found.join(", ") : "belum ada";
  const missing = c.missing.length ? c.missing.join(", ") : "lengkap";
  return `Terbaca: ${found}. Belum ada: ${missing}`;
}
function textCoverageText(r: YtStudioTextResult): string {
  const c = summarizeStudioText(r);
  const found = c.found.length ? c.found.join(", ") : "belum ada";
  const missing = c.missing.length ? c.missing.join(", ") : "lengkap";
  return `Terbaca: ${found}. Belum ada: ${missing}`;
}

type YtStatus = { configured: boolean; connected: boolean; missing?: string[]; error?: string; channel?: { id?: string; title?: string; thumbnail?: string } | null };
type YtVideo = { id: string; title: string; publishedAt?: string; durationSec?: number; viewCount?: number; likeCount?: number; commentCount?: number; url?: string };
type YtMetricPayload = { ok?: boolean; error?: string; video?: Partial<YtVideo>; metrics?: { views?: number | null; analyticsViews?: number | null; publicViews?: number | null; impressions?: number | null; ctrPct?: number | null; avgViewSec?: number | null; averageViewPercentage?: number | null; likes?: number | null; comments?: number | null; subscribersGained?: number | null }; traffic?: YtStudioTextResult["traffic"]; warnings?: string[] };

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
  const [csvRows, setCsvRows] = useState<YtStudioCsvRow[]>([]);
  const [csvMsg, setCsvMsg] = useState("");
  const [studioText, setStudioText] = useState("");
  const [studioTextResult, setStudioTextResult] = useState<YtStudioTextResult | null>(null);
  const [studioTextMsg, setStudioTextMsg] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");
  const [ocrPreview, setOcrPreview] = useState("");
  const [trafficFacts, setTrafficFacts] = useState<YtStudioTextResult["traffic"]>([]);
  const [audienceFacts, setAudienceFacts] = useState<YtStudioTextResult["audience"]>([]);
  const [ytStatus, setYtStatus] = useState<YtStatus | null>(null);
  const [ytVideos, setYtVideos] = useState<YtVideo[]>([]);
  const [ytUrl, setYtUrl] = useState("");
  const [ytRange, setYtRange] = useState<"lifetime" | "7" | "28" | "90">("lifetime");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytMsg, setYtMsg] = useState("");

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
  const parseStudioTextBox = () => {
    const raw = studioText.trim();
    if (!raw) { setStudioTextMsg("Paste/koreksi teks OCR dulu"); return null; }
    const out = extractStudioText(raw, mode);
    setStudioTextResult(out);
    setStudioTextMsg(out.parsedFields.length ? `📋 Teks terbaca. ${textCoverageText(out)}` : "⚠️ Teks terbaca, tapi metrik YouTube Studio belum dikenali.");
    return out;
  };
  const applyStudioText = (r: YtStudioTextResult, replace = false) => {
    if (replace) {
      setTitle(""); setViews(""); setImpressions(""); setCtr(""); setDur(""); setAvd(""); setRet30(""); setLikes(""); setComments(""); setSubs(""); setAge("");
      setTrafficFacts([]); setAudienceFacts([]);
    }
    if (r.title) setTitle(r.title);
    if (r.views != null) setViews(String(r.views));
    if (r.impressions != null) setImpressions(String(r.impressions));
    if (r.ctrPct != null) setCtr(String(r.ctrPct));
    if (r.durationSec != null) setDur(secToClock(r.durationSec));
    if (r.avgViewSec != null) setAvd(secToClock(r.avgViewSec));
    if (r.retention30Pct != null) setRet30(String(r.retention30Pct));
    if (r.likes != null) setLikes(String(r.likes));
    if (r.comments != null) setComments(String(r.comments));
    if (r.subs != null) setSubs(String(r.subs));
    if (r.uploadAgeHours != null) setAge(String(r.uploadAgeHours));
    if (r.traffic.length) setTrafficFacts(r.traffic);
    if (r.audience.length) setAudienceFacts(r.audience);
    setRan(true);
    setStudioTextMsg(`${replace ? "🧹 Reset + " : "✅ "}Data teks dipakai. ${textCoverageText(r)}`);
  };
  const ocrStudioShot = async (f?: File | null) => {
    if (!f) return;
    setOcrBusy(true); setOcrMsg("⏳ Membaca screenshot...");
    try {
      setOcrPreview(await readFileDataUrl(f));
      const fullBlob = await makeOcrBlob(f, undefined, "full");
      const fdFull = new FormData();
      fdFull.set("image", fullBlob);
      const resFull = await fetch("/api/hcnsec/studio-ocr", { method: "POST", body: fdFull });
      const jFull = await resFull.json().catch(() => ({}));
      let text = resFull.ok && jFull?.ok && jFull.text ? String(jFull.text) : "";
      let out = text ? extractStudioText(text, mode) : null;
      let lastError = jFull?.error || "OCR gagal membaca screenshot";

      if (!out || (out.views == null && out.ctrPct == null && out.avgViewSec == null && out.durationSec == null)) {
        setOcrMsg("⏳ Membaca area angka...");
        const variants = await makeOcrImages(f);
        const texts: string[] = text ? [text] : [];
        for (let i = 0; i < variants.length; i++) {
          if (variants[i].name === fullBlob.name) continue;
          setOcrMsg(`⏳ Membaca area angka (${i + 1}/${variants.length})...`);
          const fd = new FormData();
          fd.set("image", variants[i]);
          const res = await fetch("/api/hcnsec/studio-ocr", { method: "POST", body: fd });
          const j = await res.json().catch(() => ({}));
          if (res.ok && j?.ok && j.text) texts.push(String(j.text));
          else lastError = j?.error || lastError;
        }
        if (!texts.length) throw new Error(lastError);
        text = Array.from(new Set(texts.flatMap((x) => x.split("\n").map((l) => l.trim()).filter(Boolean)))).join("\n");
        out = extractStudioText(text, mode);
      }
      setStudioText(text);
      setStudioTextResult(out);
      applyStudioText(out, false);
      setOcrMsg(out.parsedFields.length ? `✅ Screenshot terbaca otomatis. ${textCoverageText(out)}` : "⚠️ OCR jalan, tapi angka Studio belum dikenali. Coba screenshot lebih dekat/crop bagian analytics.");
    } catch (e) {
      setOcrMsg(`⚠️ ${e instanceof Error ? e.message : "OCR gagal"}`);
    } finally { setOcrBusy(false); }
  };
  const loadYtStatus = async () => {
    try {
      const r = await fetch("/api/youtube/status", { cache: "no-store" });
      const j = await r.json();
      setYtStatus(j);
      if (j?.connected) loadYtVideos();
      else if (j?.configured === false) setYtMsg(`OAuth belum aktif: ${(j.missing || []).join(", ")}`);
    } catch { setYtMsg("Status YouTube belum bisa dicek."); }
  };
  const loadYtVideos = async () => {
    setYtBusy(true); setYtMsg("⏳ Membaca channel read-only...");
    try {
      const r = await fetch("/api/youtube/channel", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Gagal membaca channel");
      setYtVideos(Array.isArray(j.videos) ? j.videos : []);
      setYtStatus((s) => ({ ...(s || { configured: true, connected: true }), connected: true, channel: j.channel || s?.channel || null }));
      setYtMsg(`✅ Terhubung read-only${j.channel?.title ? `: ${j.channel.title}` : ""}`);
    } catch (e) { setYtMsg(`⚠️ ${e instanceof Error ? e.message : "Gagal membaca YouTube"}`); }
    finally { setYtBusy(false); }
  };
  const disconnectYt = async () => {
    setYtBusy(true);
    try {
      await fetch("/api/youtube/disconnect", { method: "POST" });
      setYtStatus((s) => ({ ...(s || { configured: true, connected: false }), connected: false, channel: null }));
      setYtVideos([]); setYtMsg("✅ YouTube diputus dari browser ini.");
    } finally { setYtBusy(false); }
  };
  const applyYoutubeVideo = async (v: YtVideo) => {
    const rangeLabel = ytRange === "lifetime" ? "sejak publish" : `${ytRange} hari`;
    setYtBusy(true); setYtMsg(`⏳ Membaca analytics ${rangeLabel}: ${v.title || v.id}`);
    try {
      // Reset dulu supaya data video lama/placeholder tidak terlihat seperti hasil video baru.
      setTitle(v.title || ""); setViews(""); setImpressions(""); setCtr(""); setDur(""); setAvd(""); setRet30(""); setLikes(""); setComments(""); setSubs(""); setAge("");
      setTrafficFacts([]); setAudienceFacts([]);
      if (v.title) setTitle(v.title);
      if (v.durationSec) setDur(secToClock(v.durationSec));
      if (v.likeCount != null) setLikes(String(v.likeCount));
      if (v.commentCount != null) setComments(String(v.commentCount));
      if (v.publishedAt) {
        const h = Math.max(1, Math.round((Date.now() - +new Date(v.publishedAt)) / 36e5));
        if (Number.isFinite(h)) setAge(String(h));
      }
      const r = await fetch(`/api/youtube/analytics/video?videoId=${encodeURIComponent(v.id)}&range=${ytRange}&days=${ytRange === "lifetime" ? 28 : ytRange}`, { cache: "no-store" });
      const j: YtMetricPayload = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Analytics belum bisa dibaca");
      const meta = j.video || {};
      if (meta.title) setTitle(String(meta.title));
      if (typeof meta.durationSec === "number" && meta.durationSec > 0) setDur(secToClock(meta.durationSec));
      if (typeof meta.likeCount === "number") setLikes(String(meta.likeCount));
      if (typeof meta.commentCount === "number") setComments(String(meta.commentCount));
      if (meta.publishedAt) {
        const h = Math.max(1, Math.round((Date.now() - +new Date(String(meta.publishedAt))) / 36e5));
        if (Number.isFinite(h)) setAge(String(h));
      }
      const m = j.metrics || {};
      if (m.views != null) setViews(String(m.views));
      else if (typeof meta.viewCount === "number") setViews(String(meta.viewCount));
      else if (v.viewCount != null) setViews(String(v.viewCount));
      if (m.impressions != null) setImpressions(String(m.impressions)); else setImpressions("");
      if (m.ctrPct != null) setCtr(String(m.ctrPct)); else setCtr("");
      if (m.avgViewSec != null) setAvd(secToClock(m.avgViewSec));
      if (m.averageViewPercentage != null) setRet30(String(m.averageViewPercentage));
      if (m.likes != null) setLikes(String(m.likes));
      if (m.comments != null) setComments(String(m.comments));
      if (m.subscribersGained != null) setSubs(String(m.subscribersGained));
      if (Array.isArray(j.traffic) && j.traffic.length) setTrafficFacts(j.traffic);
      setRan(true);
      const viewNote = m.analyticsViews != null && m.publicViews != null && m.publicViews > m.analyticsViews ? ` Views pakai public terbaru ${m.publicViews} (Analytics finalized ${m.analyticsViews}).` : "";
      const warn = j.warnings?.length ? j.warnings[0] : "Read-only, aman.";
      setYtMsg(`✅ Data analytics masuk.${viewNote} ${warn}`);
    } catch (e) { setYtMsg(`⚠️ ${e instanceof Error ? e.message : "Gagal membaca analytics"}`); }
    finally { setYtBusy(false); }
  };
  const applyYoutubeUrl = async () => {
    const id = extractYoutubeVideoId(ytUrl);
    if (!id) { setYtMsg("Tempel URL YouTube/videoId yang valid dulu."); return; }
    await applyYoutubeVideo({ id, title: "Video dari URL" });
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROWTH_LEDGER_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        setLedger({ snapshots: Array.isArray(j.snapshots) ? j.snapshots : [], experiments: Array.isArray(j.experiments) ? j.experiments : [] });
      }
    } catch { /* no-op */ }
  }, []);
  useEffect(() => { loadYtStatus(); }, []);
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
    trafficSources: trafficFacts,
    audienceFacts,
  }), [mode, title, symptom, views, impressions, ctr, dur, avd, ret30, likes, comments, subs, age, trafficFacts, audienceFacts]);

  const dx = useMemo(() => diagnoseGrowth(input), [input]);
  const baseline = useMemo(() => computeGrowthBaseline(ledger.snapshots || [], { mode }), [ledger.snapshots, mode]);
  const currentSnap = useMemo(() => createGrowthSnapshot(input, dx), [input, dx]);
  const baselineCmp = useMemo(() => compareSnapshotToBaseline(currentSnap, baseline), [currentSnap, baseline]);
  const show = ran || !!views || !!ctr || !!ret30 || !!impressions;
  const studioTextSummary = studioTextResult ? summarizeStudioText(studioTextResult) : null;
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

      <div className="gd-card gd-youtube">
        <div className="gd-label">🔐 YOUTUBE RESMI — READ ONLY</div>
        <p>Aman untuk channel: VERVE cuma minta izin baca data analytics. Tidak ada scope upload, edit, hapus, atau komentar.</p>
        {!ytStatus?.configured ? (
          <div className="gd-ytnote warn">Belum aktif di server: {(ytStatus?.missing || ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "YT_OAUTH_COOKIE_SECRET"]).join(", ")}</div>
        ) : ytStatus.connected ? (
          <div className="gd-ytconnected">
            <b>✅ Terhubung{ytStatus.channel?.title ? `: ${ytStatus.channel.title}` : ""}</b>
            <span>Mode read-only · YouTube Analytics API resmi</span>
            <div className="gd-textactions"><button onClick={loadYtVideos} disabled={ytBusy}>📺 Muat Video</button><button className="muted" onClick={disconnectYt} disabled={ytBusy}>Putus</button></div>
            <div className="gd-yturl"><input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="Tempel URL video YouTube" /><button onClick={applyYoutubeUrl} disabled={ytBusy}>Baca URL</button></div>
          </div>
        ) : (
          <button className="gd-ytconnect" onClick={() => { location.href = "/api/youtube/oauth/start"; }}>🔗 Hubungkan YouTube</button>
        )}
        {!!ytMsg && <em>{ytMsg}</em>}
        {!!ytVideos.length && (
          <div className="gd-ytvideos">
            {ytVideos.slice(0, 8).map((v) => (
              <button key={v.id} onClick={() => applyYoutubeVideo(v)} disabled={ytBusy}>
                <b>{v.title}</b>
                <span>{v.viewCount?.toLocaleString("id-ID") || 0} views · {v.likeCount ?? "?"} likes · {v.commentCount ?? "?"} comments</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="gd-card gd-ocrbox">
        <div className="gd-label">⚡ BACA SCREENSHOT OTOMATIS</div>
        <p>Upload screenshot YouTube Studio apa saja. VERVE akan OCR, ambil angka yang terbaca, lalu isi form otomatis. Bisa upload beberapa screenshot satu per satu.</p>
        <label className={`gd-ocrpick ${ocrBusy ? "busy" : ""}`}>{ocrBusy ? "⏳ Membaca..." : "📸 Upload Screenshot"}
          <input type="file" accept="image/*" hidden disabled={ocrBusy} onChange={(e) => { ocrStudioShot(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </label>
        {ocrPreview ? <img className="gd-ocrpreview" src={ocrPreview} alt="preview screenshot" /> : null}
        {!!ocrMsg && <em>{ocrMsg}</em>}
        {studioTextResult && studioTextSummary && (
          <div className="gd-textpreview">
            <b>Aku membaca:</b>
            <div className="gd-textmetrics">
              <span>Views <strong>{studioTextResult.views ?? "?"}</strong></span>
              <span>Impr <strong>{studioTextResult.impressions ?? "?"}</strong></span>
              <span>CTR <strong>{studioTextResult.ctrPct ?? "?"}%</strong></span>
              <span>Avg <strong>{studioTextResult.avgViewSec != null ? secToClock(studioTextResult.avgViewSec) : "?"}</strong></span>
              <span>Watch <strong>{studioTextResult.watchTimeHours != null ? `${studioTextResult.watchTimeHours} jam` : "?"}</strong></span>
              <span>Ret <strong>{studioTextResult.retention30Pct ?? "?"}%</strong></span>
              <span>Dur <strong>{studioTextResult.durationSec != null ? secToClock(studioTextResult.durationSec) : "?"}</strong></span>
            </div>
            <small>Terbaca: {studioTextSummary.found.join(", ") || "belum ada"}</small>
            <small>Belum ada: {studioTextSummary.missing.join(", ") || "lengkap"}</small>
            {!!studioTextSummary.extra.length && <small>Ekstra: {studioTextSummary.extra.slice(0, 6).join(" · ")}</small>}
            {studioTextResult.notes.map((n, i) => <small key={i}>Catatan: {n}</small>)}
            <div className="gd-textactions">
              <button onClick={() => applyStudioText(studioTextResult)}>✅ Pakai/Gabung</button>
              <button className="muted" onClick={() => applyStudioText(studioTextResult, true)}>🧹 Reset + Pakai</button>
            </div>
          </div>
        )}
        <details className="gd-textedit">
          <summary>✏️ Koreksi teks OCR / paste manual</summary>
          <textarea value={studioText} onChange={(e) => setStudioText(e.target.value)} placeholder={"Kalau OCR kurang rapi, edit/paste teks di sini lalu tekan Baca Ulang."} />
          <div className="gd-textactions">
            <button onClick={() => { const out = parseStudioTextBox(); if (out) applyStudioText(out); }}>🔎 Baca Ulang</button>
            <button className="muted" onClick={() => { setStudioText(""); setStudioTextResult(null); setStudioTextMsg(""); setOcrMsg(""); }}>hapus teks</button>
          </div>
          {!!studioTextMsg && <em>{studioTextMsg}</em>}
        </details>
      </div>

      <details className="gd-card gd-csvbox gd-advanced">
        <summary>📥 Opsional: CSV YouTube Studio</summary>
        <p>Kalau bro punya CSV dari Studio desktop/laptop, upload di sini. Mode utama sekarang cukup upload screenshot otomatis.</p>
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
      </details>

      <div className="gd-card">
        <div className="gd-label">DATA CEPAT</div>
        <label className="gd-field wide"><span>Judul video</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="contoh: Doa Ibu, Warisan Terindah" /></label>
        <div className="gd-grid">
          {metric("Views", views, setViews, "120")}
          {metric("Impressions", impressions, setImpressions, "—")}
          {metric("CTR %", ctr, setCtr, "—")}
          {metric("Durasi", dur, setDur, "—", "text")}
          {metric("Avg View", avd, setAvd, "—", "text")}
          {metric("Retention/Avg %", ret30, setRet30, "—")}
          {metric("Likes", likes, setLikes, "—")}
          {metric("Comments", comments, setComments, "—")}
          {metric("Subs +", subs, setSubs, "—")}
          {metric("Umur upload (jam)", age, setAge, "—")}
        </div>
        {!!(trafficFacts.length || audienceFacts.length) && (
          <div className="gd-extra-facts">
            {trafficFacts.slice(0, 4).map((x) => <span key={`t-${x.key}`}>Traffic: {x.label} {x.pct}%</span>)}
            {audienceFacts.slice(0, 4).map((x, i) => <span key={`a-${x.key}-${i}`}>Audiens: {x.label} {x.pct}%</span>)}
          </div>
        )}
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
