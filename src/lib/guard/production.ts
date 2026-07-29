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
    { id: "thumbnail", label: "Thumbnail siap", done: !!i.hasThumbnail },
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
};

function fmtDur(s?: number): string {
  const n = Math.max(0, Number(s) || 0);
  const m = Math.floor(n / 60), sec = Math.round(n % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function makeUploadKitText(i: UploadKitInput): string {
  const checklist = i.checklist || [];
  return [
    "=== VERVE UPLOAD KIT ===",
    `Proyek: ${i.projectTitle || i.title || "VERVE"}`,
    `Rasio: ${i.ratio || "?"}`,
    `Durasi: ${fmtDur(i.durationSec)}`,
    `Video: ${i.hasVideo ? "SIAP" : "belum dirender / belum diunduh"}`,
    `Thumbnail: ${i.hasThumbnail ? "SIAP" : "belum dibuat"}`,
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
    "=== CATATAN UPLOAD ===",
    "1. Upload video MP4 dari tombol Download video.",
    "2. Upload thumbnail JPG 1280×720 bila tersedia.",
    "3. Tempel judul/deskripsi/tags dari paket ini.",
    "4. Cek ulang hak cipta audio sebelum publish.",
    "",
    "Dibuat dengan VERVE.",
  ].join("\n");
}
