/* 🛡️ VERVE GUARD · PRODUCTION
   MoneyPrinter-inspired helpers: 3 variasi draft, checklist produksi, dan Upload Kit YouTube.
   Pure/lightweight — aman dipakai di browser HP. */

export type VideoVariant = {
  id: "emosi" | "cinematic" | "shorts";
  label: string;
  ratio: "16:9" | "9:16" | "1:1";
  globalSpeed: number;
  transition: string;
  transitionDur: number;
  captionStyle: string;
  note: string;
};

export function moneyPrinterVariants(): VideoVariant[] {
  return [
    { id: "emosi", label: "Versi Emosional", ratio: "16:9", globalSpeed: 0.75, transition: "dissolve", transitionDur: 0.85, captionStyle: "karaoke", note: "slow cinematic untuk lagu/cerita sedih" },
    { id: "cinematic", label: "Versi Sinematik", ratio: "16:9", globalSpeed: 1.0, transition: "zoomin", transitionDur: 0.65, captionStyle: "capcut", note: "rasa film rapi untuk YouTube" },
    { id: "shorts", label: "Versi Shorts Cepat", ratio: "9:16", globalSpeed: 1.18, transition: "push-l", transitionDur: 0.35, captionStyle: "boldwhite", note: "lebih padat untuk Reels/Shorts" },
  ];
}

export type ProductionChecklistInput = {
  hasScript?: boolean;
  hasMaterials?: boolean;
  hasAudio?: boolean;
  hasSubtitle?: boolean;
  hasRender?: boolean;
  hasMetadata?: boolean;
  hasThumbnail?: boolean;
};

export function productionChecklist(i: ProductionChecklistInput): { id: string; label: string; done: boolean }[] {
  return [
    { id: "script", label: "Naskah/cerita siap", done: !!i.hasScript },
    { id: "materials", label: "Bahan visual siap", done: !!i.hasMaterials },
    { id: "audio", label: "Audio/lagu siap", done: !!i.hasAudio },
    { id: "subtitle", label: "Subtitle/karaoke siap", done: !!i.hasSubtitle },
    { id: "render", label: "Video sudah dirender", done: !!i.hasRender },
    { id: "metadata", label: "Metadata YouTube siap", done: !!i.hasMetadata },
    // Thumbnail kini fitur Studio Thumbnail (layar tersendiri) — tampil HANYA kalau pemanggil masih mengirim statusnya
    ...(i.hasThumbnail === undefined ? [] : [{ id: "thumbnail", label: "Thumbnail siap", done: !!i.hasThumbnail }]),
  ];
}

export type UploadKitInput = {
  title: string;
  description?: string;
  tags?: string[];
  hashtags?: string;
  projectTitle?: string;
  ratio?: string;
  durationSec?: number;
  hasVideo?: boolean;
  hasThumbnail?: boolean;
  health?: { label?: string; short?: string; level?: string } | null;
  checklist?: { id: string; label: string; done: boolean }[];
  sources?: { scene?: number; provider?: string; by?: string; link?: string; id?: number | string; dur?: number }[];
  audioSources?: { kind: string; name?: string; status?: "ok" | "warn" | "info"; note?: string; urlKind?: string }[];
};

export type ProductionReportInput = UploadKitInput & {
  reportAt?: number;
  render?: { resolution?: number; fps?: number; mbps?: number; estMB?: number; qualitySharp?: boolean; transition?: string; transitionDur?: number; bgMode?: string };
  healthIssues?: { level?: string; code?: string; message?: string }[];
  jobLogs?: string[];
  cloud?: { backupCount?: number; musicCloud?: boolean; lastBackupUrl?: string };
  draft?: { id?: string; title?: string; slides?: number; mirrored?: boolean };
};

function fmtDur(s?: number): string {
  const n = Math.max(0, Number(s) || 0);
  const m = Math.floor(n / 60), sec = Math.round(n % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function applyMoneyPrinterVariant<T extends { id?: string; title?: string; updatedAt?: number; ratio?: string; transition?: string; transitionDur?: number; capStyle?: string; slideOptsById?: Record<string, any> }>(snap: T, variant: VideoVariant, makeId: (prefix: string) => string): T {
  const slideOptsById: Record<string, any> = {};
  Object.entries(snap.slideOptsById || {}).forEach(([sid, opt]) => {
    slideOptsById[sid] = { ...(opt || {}), speed: variant.globalSpeed, trans: variant.transition, transDur: variant.transitionDur };
  });
  return {
    ...snap,
    id: makeId("d"),
    title: `${String(snap.title || "VERVE").slice(0, 62)} · ${variant.label}`.slice(0, 80),
    updatedAt: Date.now(),
    ratio: variant.ratio,
    transition: variant.transition,
    transitionDur: variant.transitionDur,
    capStyle: variant.captionStyle,
    slideOptsById,
  };
}

export function makeUploadKitText(i: UploadKitInput): string {
  const checklist = i.checklist || [];
  const sources = (i.sources || []).filter((s) => s && (s.provider || s.by || s.link || s.id));
  const audioSources = (i.audioSources || []).filter((s) => s && (s.kind || s.name || s.note));
  return [
    "=== VERVE UPLOAD KIT ===",
    `Proyek: ${i.projectTitle || i.title || "VERVE"}`,
    `Rasio: ${i.ratio || "?"}`,
    `Durasi: ${fmtDur(i.durationSec)}`,
    `Video: ${i.hasVideo ? "SIAP" : "belum dirender / belum diunduh"}`,
    ...(i.hasThumbnail === undefined ? [] : [`Thumbnail: ${i.hasThumbnail ? "SIAP" : "belum dibuat"}`]),
    i.health ? `Health: ${i.health.label || i.health.level || "?"} — ${i.health.short || ""}` : "Health: belum dicek",
    "",
    "=== CHECKLIST ===",
    ...(checklist.length ? checklist.map((c) => `${c.done ? "✅" : "⬜"} ${c.label}`) : ["(belum ada checklist)"]),
    "",
    "=== JUDUL ===",
    i.title || "",
    "",
    "=== DESKRIPSI ===",
    i.description || "",
    "",
    "=== TAGS ===",
    (i.tags || []).join(", "),
    "",
    "=== HASHTAGS ===",
    i.hashtags || "",
    "",
    "=== SUMBER STOCK VIDEO ===",
    ...(sources.length ? sources.map((s) => `${s.scene ? `Adegan ${s.scene}: ` : ""}${s.provider || "stock"}${s.by ? ` · ${s.by}` : ""}${s.id ? ` · id ${s.id}` : ""}${s.dur ? ` · ${s.dur}s` : ""}${s.link ? ` · ${s.link}` : ""}`) : ["Tidak ada stock video tercatat / proyek memakai gambar lokal atau AI."]),
    "",
    "=== SUMBER AUDIO / HAK CIPTA ===",
    ...(audioSources.length ? audioSources.map((s) => `${s.status === "warn" ? "⚠️" : s.status === "ok" ? "✅" : "ℹ️"} ${s.kind}${s.name ? `: ${s.name}` : ""}${s.urlKind ? ` · ${s.urlKind}` : ""}${s.note ? ` — ${s.note}` : ""}`) : ["Tidak ada audio tercatat."]),
    "",
    "=== CATATAN UPLOAD ===",
    "1. Upload video MP4 dari tombol Download video.",
    "2. Upload thumbnail JPG 1280×720 bila tersedia.",
    "3. Tempel judul/deskripsi/tags dari paket ini.",
    "4. Cek ulang hak cipta audio sebelum publish.",
    "",
    "Dibuat dengan VERVE.",
  ].join("\n");
}
export function makeProductionReportText(i: ProductionReportInput): string {
  const checklist = i.checklist || [];
  const sources = (i.sources || []).filter((s) => s && (s.provider || s.by || s.link || s.id));
  const audioSources = (i.audioSources || []).filter((s) => s && (s.kind || s.name || s.note));
  const issues = i.healthIssues || [];
  const done = checklist.filter((c) => c.done).length;
  const reportDate = new Date(i.reportAt || Date.now()).toISOString();
  return [
    "=== VERVE PRODUCTION REPORT ===",
    `Dibuat: ${reportDate}`,
    `Proyek: ${i.projectTitle || i.title || "VERVE"}`,
    `Draft ID: ${i.draft?.id || "?"}`,
    `Adegan: ${i.draft?.slides ?? "?"}`,
    `Durasi timeline: ${fmtDur(i.durationSec)}`,
    `Rasio: ${i.ratio || "?"}`,
    "",
    "=== STATUS PRODUKSI ===",
    `Checklist: ${done}/${checklist.length}`,
    ...(checklist.length ? checklist.map((c) => `${c.done ? "✅" : "⬜"} ${c.label}`) : ["(belum ada checklist)"]),
    "",
    "=== HEALTH / GUARD ===",
    i.health ? `${i.health.level || "?"} · ${i.health.label || "?"} — ${i.health.short || ""}` : "Belum dicek",
    ...(issues.length ? issues.map((x) => `${x.level || "?"} · ${x.code || "?"} · ${x.message || ""}`) : ["Tidak ada issue health yang tercatat." ]),
    "",
    "=== RENDER SETTINGS ===",
    `Resolusi: ${i.render?.resolution || "?"}p`,
    `FPS: ${i.render?.fps || "?"}`,
    `Bitrate: ${i.render?.mbps || "?"} Mbps`,
    `Estimasi ukuran: ${i.render?.estMB != null ? `${Number(i.render.estMB).toFixed(Number(i.render.estMB) > 80 ? 0 : 1)} MB` : "?"}`,
    `Ketajaman: ${i.render?.qualitySharp ? "ON" : "OFF"}`,
    `Transisi: ${i.render?.transition || "?"} (${i.render?.transitionDur ?? "?"}s)`,
    `Background: ${i.render?.bgMode || "?"}`,
    "",
    "=== METADATA YOUTUBE ===",
    `Judul: ${i.title || ""}`,
    "Deskripsi:",
    i.description || "",
    `Tags: ${(i.tags || []).join(", ")}`,
    `Hashtags: ${i.hashtags || ""}`,
    "",
    "=== SUMBER STOCK VIDEO ===",
    ...(sources.length ? sources.map((s) => `${s.scene ? `Adegan ${s.scene}: ` : ""}${s.provider || "stock"}${s.by ? ` · ${s.by}` : ""}${s.id ? ` · id ${s.id}` : ""}${s.dur ? ` · ${s.dur}s` : ""}${s.link ? ` · ${s.link}` : ""}`) : ["Tidak ada stock video tercatat / proyek memakai gambar lokal atau AI."]),
    "",
    "=== SUMBER AUDIO / HAK CIPTA ===",
    ...(audioSources.length ? audioSources.map((s) => `${s.status === "warn" ? "⚠️" : s.status === "ok" ? "✅" : "ℹ️"} ${s.kind}${s.name ? `: ${s.name}` : ""}${s.urlKind ? ` · ${s.urlKind}` : ""}${s.note ? ` — ${s.note}` : ""}`) : ["Tidak ada audio tercatat."]),
    "",
    "=== CLOUD / BACKUP ===",
    `Backup cloud terdaftar: ${i.cloud?.backupCount ?? 0}`,
    `Musik cloud: ${i.cloud?.musicCloud ? "YA" : "TIDAK / belum dicek"}`,
    `IndexedDB mirror: ${i.draft?.mirrored ? "YA" : "cadangan berjalan di background"}`,
    "",
    "=== JOB LOG TERAKHIR ===",
    ...((i.jobLogs || []).length ? (i.jobLogs || []).slice(-20) : ["Belum ada job log render tercatat."]),
    "",
    "=== CATATAN ===",
    "Report ini untuk arsip produksi. Video final tetap harus disimpan/download terpisah.",
    "Dibuat dengan VERVE.",
  ].join("\n");
}
