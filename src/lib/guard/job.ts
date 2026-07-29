/* 🛡️ VERVE GUARD · JOB
   MoneyPrinter-inspired task log untuk proses panjang: tahap, progress, retry, recovery.
   Browser-only persistence via localStorage, tapi fungsi murninya tetap bisa dites Node. */

export type JobStageState = "todo" | "running" | "done" | "error" | "skipped";

export type JobStage = {
  id: string;
  label: string;
  progress: number; // 0..100
  state: JobStageState;
  message?: string;
  t?: number;
};

export type GuardJob = {
  id: string;
  kind: string;
  title: string;
  state: "running" | "done" | "error";
  progress: number;
  current?: string;
  startedAt: number;
  updatedAt: number;
  stages: JobStage[];
  logs: string[];
  meta?: Record<string, unknown>;
};

export const JOB_KEY = "verve_guard_job_v1";
export const JOB_LOG_MAX = 80;

const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
const now = () => Date.now();

export function defaultProductionStages(): Omit<JobStage, "state">[] {
  return [
    { id: "script", label: "Naskah/script", progress: 10 },
    { id: "terms", label: "Kata kunci visual", progress: 20 },
    { id: "materials", label: "Bahan video/gambar", progress: 40 },
    { id: "audio", label: "Suara/lagu", progress: 55 },
    { id: "subtitle", label: "Subtitle/karaoke", progress: 70 },
    { id: "render", label: "Render video", progress: 90 },
    { id: "package", label: "Paket upload", progress: 100 },
  ];
}

export function createJob(kind: string, title: string, stages = defaultProductionStages(), meta?: Record<string, unknown>): GuardJob {
  const t = now();
  return {
    id: `job_${t.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title: title || "Proses VERVE",
    state: "running",
    progress: 0,
    startedAt: t,
    updatedAt: t,
    stages: stages.map((s) => ({ ...s, progress: clamp(s.progress), state: "todo" })),
    logs: [`+0.0s 🎬 ${title || kind} dimulai`],
    meta,
  };
}

export function jobLine(job: GuardJob, icon: string, msg: string): string {
  const dt = ((now() - job.startedAt) / 1000).toFixed(1);
  return `+${dt}s ${icon} ${String(msg || "").slice(0, 180)}`;
}

export function appendJobLog(job: GuardJob, icon: string, msg: string): GuardJob {
  const logs = [...(job.logs || []), jobLine(job, icon, msg)];
  while (logs.length > JOB_LOG_MAX) logs.shift();
  return { ...job, logs, updatedAt: now() };
}

export function setJobStage(job: GuardJob, id: string, state: JobStageState, message = ""): GuardJob {
  let progress = job.progress;
  const stages = job.stages.map((s) => {
    if (s.id !== id) return s;
    if (state === "running" || state === "done") progress = Math.max(progress, s.progress);
    return { ...s, state, message, t: now() };
  });
  const icon = state === "done" ? "✅" : state === "error" ? "❌" : state === "running" ? "⏳" : state === "skipped" ? "⏭️" : "•";
  return appendJobLog({ ...job, stages, progress: clamp(progress), current: id, state: state === "error" ? "error" : job.state, updatedAt: now() }, icon, message || stages.find((s) => s.id === id)?.label || id);
}

export function finishJob(job: GuardJob, message = "Selesai"): GuardJob {
  const stages = job.stages.map((s) => s.state === "todo" || s.state === "running" ? { ...s, state: "done" as const, t: now() } : s);
  return appendJobLog({ ...job, stages, state: "done", progress: 100, updatedAt: now() }, "🏁", message);
}

export function failJob(job: GuardJob, stageId: string, message: string): GuardJob {
  return setJobStage({ ...job, state: "error" }, stageId, "error", message);
}

export function summarizeJob(job: GuardJob | null): string {
  if (!job) return "Belum ada proses panjang tercatat.";
  const done = job.stages.filter((s) => s.state === "done").length;
  const err = job.stages.filter((s) => s.state === "error").length;
  const icon = job.state === "done" ? "🏁" : job.state === "error" ? "🧯" : "⏳";
  return `${icon} ${job.title} · ${Math.round(job.progress)}% · ${done}/${job.stages.length} tahap beres${err ? ` · ${err} error` : ""}`;
}

export function saveJob(job: GuardJob): void {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(JOB_KEY, JSON.stringify(job)); } catch { /* no-op */ }
}

export function readJob(): GuardJob | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && Array.isArray(j.stages) ? j : null;
  } catch { return null; }
}

export function clearJob(): void {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(JOB_KEY); } catch { /* no-op */ }
}
