/* 🛡️ VERVE GUARD · TIMELINE HEALTH
   Audit ringan proyek sebelum preview/export: durasi, teks/stiker keluar jalur, audio terlalu panjang,
   dan sinyal stabilitas. Pure function — tidak menyentuh UI, tidak menyentuh render. */

export type HealthLevel = "ok" | "warn" | "error";

export type HealthIssue = {
  level: HealthLevel;
  code: string;
  message: string;
};

export type HealthSummary = {
  level: HealthLevel;
  icon: string;
  label: string;
  short: string;
  issues: HealthIssue[];
  warn: number;
  error: number;
};

type AnySlide = { id?: string; imageUrl?: string; videoUrl?: string; dur?: number };
type AnyLayer = { id?: string; txt?: string; start?: number | null; dur?: number | null; row?: number | null };
type AnySticker = { id?: string; start?: number | null; dur?: number | null; row?: number | null };
type AnyOpt = { dur?: number; text?: AnyLayer | null; texts?: AnyLayer[]; stickers?: AnySticker[] };

type AudioTrack = { kind: string; url?: string; dur?: number; off?: number };

export type TimelineHealthInput = {
  slides: AnySlide[];
  slideOptsById?: Record<string, AnyOpt | undefined>;
  slideDuration?: number;
  total?: number;
  audios?: AudioTrack[];
  capWords?: unknown[];
};

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function push(issues: HealthIssue[], level: HealthLevel, code: string, message: string): void {
  issues.push({ level, code, message });
}

function clipDur(slide: AnySlide, opt: AnyOpt | undefined, fallback: number): number {
  return num(opt?.dur ?? slide.dur ?? fallback, fallback);
}

function layerWindow(layer: AnyLayer | AnySticker): { st: number; en: number; dur: number } {
  const st = Math.max(0, num(layer.start, 0));
  const dur = Math.max(0, num(layer.dur, 0));
  return { st, en: st + dur, dur };
}

export function auditTimelineHealth(input: TimelineHealthInput): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const slides = Array.isArray(input.slides) ? input.slides : [];
  const opts = input.slideOptsById || {};
  const fallbackDur = Math.max(0.2, num(input.slideDuration, 3));
  const total = Math.max(0, num(input.total, 0) || slides.reduce((a, s) => a + Math.max(0, clipDur(s, opts[String(s.id || "")], fallbackDur)), 0));

  if (!slides.length) {
    push(issues, "warn", "NO_SLIDES", "Belum ada klip media di timeline.");
    return issues;
  }

  const ids = new Set<string>();
  slides.forEach((s, i) => {
    const id = String(s.id || "");
    if (!id) push(issues, "error", "SLIDE_NO_ID", `Klip ${i + 1} tidak punya id.`);
    else if (ids.has(id)) push(issues, "error", "SLIDE_DUP_ID", `Id klip dobel: ${id}`);
    else ids.add(id);

    if (!s.imageUrl && !s.videoUrl) push(issues, "error", "SLIDE_NO_MEDIA", `Klip ${i + 1} tidak punya gambar/video.`);
    const d = clipDur(s, opts[id], fallbackDur);
    if (!(d > 0)) push(issues, "error", "SLIDE_BAD_DUR", `Durasi klip ${i + 1} tidak sah.`);
    else if (d < 0.35) push(issues, "warn", "SLIDE_TOO_SHORT", `Klip ${i + 1} sangat pendek (${d.toFixed(2)}s).`);
    else if (d > 90) push(issues, "warn", "SLIDE_TOO_LONG", `Klip ${i + 1} sangat panjang (${Math.round(d)}s) — render HP bisa berat.`);
  });

  let layerCount = 0;
  for (const s of slides) {
    const id = String(s.id || "");
    const opt = opts[id] || {};
    const layers: AnyLayer[] = [];
    if (opt.text?.txt?.trim()) layers.push(opt.text);
    if (Array.isArray(opt.texts)) layers.push(...opt.texts.filter((x) => x?.txt?.trim()));
    layers.forEach((t) => {
      layerCount++;
      const w = layerWindow(t);
      if (t.start != null && !(w.dur > 0)) push(issues, "warn", "TEXT_ZERO_DUR", `Teks ${t.id || "?"} durasinya kosong.`);
      if (w.en > total + 0.2) push(issues, "warn", "TEXT_OUTSIDE", `Teks ${t.id || "?"} lewat ujung video (${w.en.toFixed(1)}s > ${total.toFixed(1)}s).`);
      if (num(t.row, 0) > 12) push(issues, "warn", "TEXT_ROW_DEEP", `Teks ${t.id || "?"} berada di jalur sangat bawah.`);
    });

    const stickers = Array.isArray(opt.stickers) ? opt.stickers : [];
    stickers.forEach((st) => {
      const w = layerWindow(st);
      if (!(w.dur > 0)) push(issues, "warn", "STICKER_ZERO_DUR", `Stiker ${st.id || "?"} durasinya kosong.`);
      if (w.en > total + 0.2) push(issues, "warn", "STICKER_OUTSIDE", `Stiker ${st.id || "?"} lewat ujung video.`);
    });
  }

  if (Array.isArray(input.capWords) && input.capWords.length > 0 && layerCount === 0) {
    push(issues, "warn", "CAPWORDS_FLOATING", "Ada kata caption melayang, tapi belum terlihat sebagai track teks.");
  }

  for (const a of input.audios || []) {
    if (!a?.url) continue;
    const off = Math.max(0, num(a.off, 0));
    const dur = Math.max(0, num(a.dur, 0));
    if (!dur) push(issues, "warn", "AUDIO_UNKNOWN_DUR", `${a.kind} belum terbaca durasinya.`);
    else if (total > 0 && off + dur > total + 120) push(issues, "warn", "AUDIO_LONG", `${a.kind} jauh lebih panjang dari video — timeline ikut memanjang.`);
  }

  // Jangan banjiri UI: error tetap semua, warning dibatasi agar chip ringan.
  const errs = issues.filter((x) => x.level === "error");
  const warns = issues.filter((x) => x.level !== "error").slice(0, 8);
  return [...errs, ...warns];
}

export function ringkasTimelineHealth(input: TimelineHealthInput): HealthSummary {
  const issues = auditTimelineHealth(input);
  const error = issues.filter((x) => x.level === "error").length;
  const warn = issues.filter((x) => x.level === "warn").length;
  const level: HealthLevel = error ? "error" : warn ? "warn" : "ok";
  const icon = level === "error" ? "🧯" : level === "warn" ? "🛡️" : "✅";
  const label = level === "error" ? "Cek proyek" : level === "warn" ? "Stabil + catatan" : "Stabil";
  const short = issues[0]?.message || "Timeline sehat: durasi, media, teks, audio terbaca aman.";
  return { level, icon, label, short, issues, warn, error };
}
