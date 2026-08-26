/* =====================================================================
   VERVE Studio — Subtitle & Translation primitives
   - Cue dengan timing absolut di timeline
   - Normalisasi hasil Whisper menjadi baris subtitle
   - Export SRT
   ===================================================================== */

export type SubtitleMode = "translate" | "transliterate";
export type SubtitleRenderStyle = "box" | "clean" | "yellow";

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  original: string;
  text: string;
}

export interface TranscriptionSegment {
  text?: string;
  start?: number;
  end?: number;
}

export interface TranscriptionWord {
  w?: string;
  word?: string;
  start?: number;
  end?: number;
}

export const SUBTITLE_LANGUAGES: { code: string; label: string }[] = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "tr", label: "Türkçe" },
  { code: "ur", label: "اردو / Urdu" },
  { code: "fa", label: "فارسی / Persia" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "bn", label: "বাংলা / Bengali" },
  { code: "hi", label: "हिन्दी / Hindi" },
  { code: "zh", label: "中文 / Mandarin" },
  { code: "ja", label: "日本語 / Japanese" },
  { code: "ko", label: "한국어 / Korean" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية / Arab" },
];

export const SOURCE_LANGUAGES: { code: string; label: string }[] = [
  { code: "ar", label: "العربية / Arab" },
  { code: "auto", label: "Deteksi otomatis" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
];

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanCueText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function makeCue(index: number, start: number, end: number, text: string): SubtitleCue | null {
  const clean = cleanCueText(text);
  if (!clean) return null;
  const st = Math.max(0, finiteNumber(start, 0));
  const en = Math.max(st + 0.25, finiteNumber(end, st + 1));
  return { id: `sub_${index + 1}`, start: st, end: en, original: clean, text: clean };
}

/**
 * Ambil segmen timestamp dari Whisper. Kalau provider hanya mengirim word
 * timestamps, kata-kata digabung menjadi baris yang nyaman dibaca.
 */
export function transcriptionToCues(
  segments: TranscriptionSegment[] = [],
  words: TranscriptionWord[] = [],
): SubtitleCue[] {
  const direct = segments
    .map((s, i) => makeCue(i, finiteNumber(s.start, 0), finiteNumber(s.end, 0), s.text || ""))
    .filter((s): s is SubtitleCue => !!s);
  if (direct.length) return direct;

  const cleanWords = words
    .map((w) => ({
      text: cleanCueText(w.w ?? w.word),
      start: finiteNumber(w.start, 0),
      end: finiteNumber(w.end, 0),
    }))
    .filter((w) => w.text && w.end >= w.start);
  const out: SubtitleCue[] = [];
  let group: typeof cleanWords = [];
  const flush = () => {
    if (!group.length) return;
    const cue = makeCue(out.length, group[0].start, group[group.length - 1].end, group.map((w) => w.text).join(" "));
    if (cue) out.push(cue);
    group = [];
  };
  for (const word of cleanWords) {
    const candidate = group.map((w) => w.text).concat(word.text).join(" ");
    const previous = group[group.length - 1];
    const longGap = !!previous && word.start - previous.end > 0.8;
    const sentenceEnd = /[.!?؟؛]$/.test(word.text);
    if (group.length && (candidate.length > 92 || word.end - group[0].start > 6.5 || longGap)) flush();
    group.push(word);
    if (sentenceEnd) flush();
  }
  flush();
  return out;
}

export function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(finiteNumber(seconds, 0) * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function cuesToSrt(cues: SubtitleCue[], field: "text" | "original" = "text"): string {
  return cues
    .filter((cue) => cleanCueText(cue[field]))
    .map((cue, index) => [
      String(index + 1),
      `${formatSrtTime(cue.start)} --> ${formatSrtTime(Math.max(cue.start + 0.25, cue.end))}`,
      cleanCueText(cue[field]),
    ].join("\n"))
    .join("\n\n") + (cues.length ? "\n" : "");
}

export function subtitleLanguageLabel(codeOrLabel: string): string {
  const raw = String(codeOrLabel || "").trim();
  return SUBTITLE_LANGUAGES.find((x) => x.code === raw)?.label || raw || "bahasa tujuan";
}
