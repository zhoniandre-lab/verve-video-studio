/* 📒 VERVE GROWTH LEDGER v1
   Baseline channel + snapshot + eksperimen before/after.
   Tujuan: Growth Doctor belajar dari data channel sendiri, bukan benchmark umum doang. */

import type { GrowthDiagnosis, GrowthInput, GrowthMode } from "./growth-doctor";

export const GROWTH_LEDGER_KEY = "verve_growth_ledger_v1";
export const GROWTH_LEDGER_MAX_SNAPSHOTS = 120;
export const GROWTH_LEDGER_MAX_EXPERIMENTS = 80;

export type GrowthMetrics = {
  views: number;
  impressions: number;
  ctrPct: number | null;
  durationSec: number;
  avgViewSec: number;
  avdPct: number | null;
  retention30Pct: number | null;
  likes: number;
  comments: number;
  subs: number;
  engagementPct: number | null;
  viewsPerHour: number | null;
  // 👨‍🏫 v19.59: metrik inti Analis Channel — biar tren mingguan lengkap
  watchTimeHours: number | null;
  returningPct: number | null;
};

export type GrowthSnapshot = {
  id: string;
  at: number;
  title: string;
  mode: GrowthMode;
  niche?: string;
  symptom?: string;
  metrics: GrowthMetrics;
  diagnosisLevel: string;
  topIssue?: string;
};

export type GrowthBaseline = {
  sample: number;
  mode?: GrowthMode;
  niche?: string;
  ctrMedian: number | null;
  retention30Median: number | null;
  avdPctMedian: number | null;
  engagementMedian: number | null;
  viewsPerHourMedian: number | null;
};

export type GrowthExperiment = {
  id: string;
  createdAt: number;
  videoTitle: string;
  issueCode: string;
  hypothesis: string;
  action: string;
  targetMetric: "ctrPct" | "retention30Pct" | "avdPct" | "engagementPct" | "viewsPerHour";
  targetValue: number;
  before: GrowthSnapshot;
  after?: GrowthSnapshot;
  status: "pending" | "success" | "partial" | "failed";
  resultNote?: string;
};

export type GrowthLedger = { snapshots: GrowthSnapshot[]; experiments: GrowthExperiment[] };

const hasNum = (v: unknown) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const num = (v: unknown, d = 0) => hasNum(v) ? Number(v) : d;
const round1 = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;

export function emptyGrowthLedger(): GrowthLedger { return { snapshots: [], experiments: [] }; }

function median(vals: (number | null | undefined)[]): number | null {
  const a = vals.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return round1(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2);
}

export function metricsFromInput(input: GrowthInput): GrowthMetrics {
  const views = Math.max(0, num(input.views));
  const impressions = Math.max(0, num(input.impressions));
  const ctrGiven = num(input.ctrPct, NaN);
  const ctrPct = Number.isFinite(ctrGiven) && ctrGiven > 0 ? ctrGiven : (impressions > 0 ? (views / impressions) * 100 : null);
  const durationSec = Math.max(0, num(input.durationSec));
  const avgViewSec = Math.max(0, num(input.avgViewSec));
  const avdPct = durationSec > 0 && avgViewSec > 0 ? (avgViewSec / durationSec) * 100 : null;
  const retGiven = num(input.retention30Pct, NaN);
  const retention30Pct = Number.isFinite(retGiven) && retGiven >= 0 ? retGiven : null;
  const likesKnown = hasNum(input.likes);
  const commentsKnown = hasNum(input.comments);
  const likes = likesKnown ? Math.max(0, num(input.likes)) : 0;
  const comments = commentsKnown ? Math.max(0, num(input.comments)) : 0;
  const subs = hasNum(input.subs) ? Math.max(0, num(input.subs)) : 0;
  const engagementPct = views > 0 && (likesKnown || commentsKnown) ? ((likes + comments) / views) * 100 : null;
  const viewsPerHour = num(input.uploadAgeHours) > 0 ? views / num(input.uploadAgeHours) : null;
  const wtGiven = num(input.watchTimeHours, NaN);
  const watchTimeHours = Number.isFinite(wtGiven) && wtGiven > 0 ? Math.round(wtGiven * 10) / 10 : null;
  const rpGiven = num(input.returningPct, NaN);
  const returningPct = Number.isFinite(rpGiven) && rpGiven >= 0 ? Math.round(rpGiven * 10) / 10 : null;
  return { views, impressions, ctrPct: round1(ctrPct), durationSec, avgViewSec, avdPct: round1(avdPct), retention30Pct: round1(retention30Pct), likes, comments, subs, engagementPct: round1(engagementPct), viewsPerHour: round1(viewsPerHour), watchTimeHours, returningPct };
}

export function createGrowthSnapshot(input: GrowthInput, diagnosis?: GrowthDiagnosis, nowMs = Date.now()): GrowthSnapshot {
  return {
    id: `gs_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: nowMs,
    title: String(input.title || "Video tanpa judul").slice(0, 120),
    mode: input.mode || "long",
    niche: input.niche || "",
    symptom: input.symptom || "",
    metrics: metricsFromInput(input),
    diagnosisLevel: diagnosis?.status?.level || "unknown",
    topIssue: diagnosis?.issues?.[0]?.code || "",
  };
}

export function computeGrowthBaseline(snapshots: GrowthSnapshot[], opts: { mode?: GrowthMode; niche?: string } = {}): GrowthBaseline {
  const rows = (snapshots || []).filter((s) => {
    if (!s?.metrics) return false;
    if (opts.mode && s.mode !== opts.mode) return false;
    if (opts.niche && s.niche && opts.niche && s.niche !== opts.niche) return false;
    return true;
  });
  return {
    sample: rows.length,
    mode: opts.mode,
    niche: opts.niche,
    ctrMedian: median(rows.map((s) => s.metrics.ctrPct)),
    retention30Median: median(rows.map((s) => s.metrics.retention30Pct)),
    avdPctMedian: median(rows.map((s) => s.metrics.avdPct)),
    engagementMedian: median(rows.map((s) => s.metrics.engagementPct)),
    viewsPerHourMedian: median(rows.map((s) => s.metrics.viewsPerHour)),
  };
}

function idx(cur: number | null, base: number | null): number | null {
  if (cur == null || base == null || base <= 0) return null;
  return round1(cur / base);
}

export function compareSnapshotToBaseline(s: GrowthSnapshot, b: GrowthBaseline) {
  return {
    ctrIndex: idx(s.metrics.ctrPct, b.ctrMedian),
    retentionIndex: idx(s.metrics.retention30Pct, b.retention30Median),
    avdIndex: idx(s.metrics.avdPct, b.avdPctMedian),
    engagementIndex: idx(s.metrics.engagementPct, b.engagementMedian),
    velocityIndex: idx(s.metrics.viewsPerHour, b.viewsPerHourMedian),
  };
}

function metricValue(s: GrowthSnapshot, metric: GrowthExperiment["targetMetric"]): number | null {
  return s.metrics[metric] ?? null;
}

export function createExperimentFromDiagnosis(input: GrowthInput, diagnosis: GrowthDiagnosis, baseline: GrowthBaseline, nowMs = Date.now()): GrowthExperiment {
  const before = createGrowthSnapshot(input, diagnosis, nowMs);
  const issue = diagnosis.issues[0];
  const action = diagnosis.actions[0];
  let targetMetric: GrowthExperiment["targetMetric"] = "ctrPct";
  if (/RETENTION|AVD|HOOK/i.test(issue?.code || "")) targetMetric = "retention30Pct";
  else if (/ENGAGEMENT/i.test(issue?.code || "")) targetMetric = "engagementPct";
  else if (/DISTRIBUTION/i.test(issue?.code || "")) targetMetric = "viewsPerHour";
  const cur = metricValue(before, targetMetric) || 0;
  const base = targetMetric === "ctrPct" ? baseline.ctrMedian : targetMetric === "retention30Pct" ? baseline.retention30Median : targetMetric === "engagementPct" ? baseline.engagementMedian : baseline.viewsPerHourMedian;
  const sensibleFloor = targetMetric === "ctrPct" ? 3 : targetMetric === "retention30Pct" ? 35 : targetMetric === "engagementPct" ? 1.5 : 1;
  const targetValue = round1(Math.max(cur * 1.25, (base || 0) * 0.8, sensibleFloor)) || sensibleFloor;
  return {
    id: `gx_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: nowMs,
    videoTitle: before.title,
    issueCode: issue?.code || "NO_CRITICAL_ISSUE",
    hypothesis: issue ? `${issue.title}: ${issue.evidence.join("; ")}` : "Video cukup sehat; uji scale konten.",
    action: action ? `${action.title}: ${action.detail}` : "Scale konten",
    targetMetric,
    targetValue,
    before,
    status: "pending",
  };
}

export function gradeExperiment(exp: GrowthExperiment, after: GrowthSnapshot): GrowthExperiment {
  const beforeVal = metricValue(exp.before, exp.targetMetric) || 0;
  const afterVal = metricValue(after, exp.targetMetric) || 0;
  let status: GrowthExperiment["status"] = "failed";
  if (afterVal >= exp.targetValue) status = "success";
  else if (afterVal > beforeVal) status = "partial";
  const delta = round1(afterVal - beforeVal) || 0;
  return { ...exp, after, status, resultNote: `${exp.targetMetric}: ${beforeVal} → ${afterVal} (${delta >= 0 ? "+" : ""}${delta}) target ${exp.targetValue}` };
}

export function addSnapshotToLedger(ledger: GrowthLedger, snap: GrowthSnapshot): GrowthLedger {
  const snapshots = [snap, ...(ledger.snapshots || [])].slice(0, GROWTH_LEDGER_MAX_SNAPSHOTS);
  return { snapshots, experiments: (ledger.experiments || []).slice(0, GROWTH_LEDGER_MAX_EXPERIMENTS) };
}

export function updateExperimentInLedger(ledger: GrowthLedger, exp: GrowthExperiment): GrowthLedger {
  const exists = (ledger.experiments || []).some((x) => x.id === exp.id);
  const experiments = exists
    ? (ledger.experiments || []).map((x) => x.id === exp.id ? exp : x)
    : [exp, ...(ledger.experiments || [])];
  return { snapshots: ledger.snapshots || [], experiments: experiments.slice(0, GROWTH_LEDGER_MAX_EXPERIMENTS) };
}

export function addExperimentToLedger(ledger: GrowthLedger, exp: GrowthExperiment): GrowthLedger {
  const experiments = [exp, ...(ledger.experiments || [])].slice(0, GROWTH_LEDGER_MAX_EXPERIMENTS);
  return { snapshots: ledger.snapshots || [], experiments };
}
