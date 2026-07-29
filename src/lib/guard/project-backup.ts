/* 💾 VERVE GUARD · PROJECT BACKUP
   Backup/restore proyek JSON yang aman untuk pindah HP / selamat dari cache Chrome.
   Pure helpers — UI tinggal membungkus download/import. */

export const PROJECT_BACKUP_KIND = "verve.project.backup";
export const PROJECT_BACKUP_VERSION = 1;

export type ProjectBackupEnvelope<T = any> = {
  kind: typeof PROJECT_BACKUP_KIND;
  version: number;
  exportedAt: number;
  app: "VERVE";
  project: T;
};

export function looksLikeProjectSnapshot(x: any): boolean {
  return !!x && typeof x === "object" && Array.isArray(x.slides) && x.slides.length >= 0 && (!x.slideOptsById || typeof x.slideOptsById === "object");
}

export function makeProjectBackupEnvelope<T extends object>(project: T, nowMs = Date.now()): ProjectBackupEnvelope<T> {
  return { kind: PROJECT_BACKUP_KIND, version: PROJECT_BACKUP_VERSION, exportedAt: nowMs, app: "VERVE", project };
}

export function normalizeProjectBackupPayload(raw: any): any | null {
  if (looksLikeProjectSnapshot(raw)) return raw;
  if (raw?.kind === PROJECT_BACKUP_KIND && looksLikeProjectSnapshot(raw.project)) return raw.project;
  if (raw?.project && looksLikeProjectSnapshot(raw.project)) return raw.project;
  return null;
}

export function safeBackupName(title: string, nowMs = Date.now()): string {
  const base = String(title || "verve_project")
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 42) || "verve_project";
  return `${base}_${nowMs}.json`;
}

export function cloneImportedProject<T extends { id?: string; title?: string; updatedAt?: number }>(project: T, makeId: (prefix: string) => string, nowMs = Date.now()): T {
  const title = String(project.title || "Proyek Import").replace(/\s+/g, " ").trim().slice(0, 68) || "Proyek Import";
  return {
    ...(project as any),
    id: makeId("d"),
    title: title.endsWith("· Import") ? title : `${title} · Import`.slice(0, 80),
    updatedAt: nowMs,
  };
}
