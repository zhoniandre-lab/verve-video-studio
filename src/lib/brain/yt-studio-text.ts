/* 📋 YouTube Studio Text Parser v1
   Membaca teks hasil OCR/Google Lens/Samsung Gallery dari screenshot YouTube Studio.
   Prinsip: hanya isi metrik yang benar-benar terbaca; yang tidak ada tetap unknown. */

import type { GrowthInput, GrowthMode } from "./growth-doctor";

export type YtStudioTextMetricKey =
  | "title" | "views" | "impressions" | "ctr" | "duration" | "avd" | "retention"
  | "likes" | "comments" | "subs" | "age" | "watchTime" | "traffic" | "audience";

export type YtStudioTrafficSource = {
  key: "suggested" | "browse" | "search" | "direct" | "youtubeOther" | "external" | "shorts" | "other";
  label: string;
  pct: number;
};

export type YtStudioAudienceFact = {
  key: "subscribed" | "notSubscribed" | "country" | "noCc" | "cc" | "other";
  label: string;
  pct: number;
};

export type YtStudioTextResult = GrowthInput & {
  source: "studioText";
  rawText: string;
  parsedFields: YtStudioTextMetricKey[];
  missingFields: YtStudioTextMetricKey[];
  traffic: YtStudioTrafficSource[];
  audience: YtStudioAudienceFact[];
  watchTimeHours?: number;
  notes: string[];
  confidenceScore: number;
};

export const TEXT_METRIC_LABELS: Record<YtStudioTextMetricKey, string> = {
  title: "Judul",
  views: "Views",
  impressions: "Impressions",
  ctr: "CTR",
  duration: "Durasi",
  avd: "Avg View",
  retention: "Retention",
  likes: "Likes",
  comments: "Comments",
  subs: "Subs +",
  age: "Umur upload",
  watchTime: "Watch time",
  traffic: "Traffic source",
  audience: "Audiens",
};

const BASE_FIELDS: YtStudioTextMetricKey[] = ["views", "impressions", "ctr", "duration", "avd", "retention", "likes", "comments", "subs", "age"];

const stripBom = (s: string) => String(s || "").replace(/^\uFEFF/, "");
const norm = (s: string) => stripBom(s)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\-–—_/()\[\]{}:%]/g, " ")
  .replace(/[^a-z0-9\p{L}\s,.]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

function round1(n: number): number { return Math.round(n * 10) / 10; }

function parseStudioNumber(v: string): number | undefined {
  let s = String(v || "").trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  let mul = 1;
  if (/\brb\b|ribu|\bk\b/.test(s)) mul = 1000;
  if (/\bjt\b|juta|\bm\b/.test(s)) mul = 1_000_000;
  s = s.replace(/%/g, "").replace(/[^0-9,.-]/g, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) s = parts[0].replace(/\./g, "") + "." + parts[1];
    else s = s.replace(/,/g, "");
  } else {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3) s = parts.join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? round1(n * mul) : undefined;
}

function parseStudioDuration(v: string): number | undefined {
  const raw = String(v || "").trim();
  if (!raw || raw === "-" || raw === "—") return undefined;
  const colon = raw.match(/(\d{1,2}:)?\d{1,2}:\d{2}/);
  if (colon) {
    const p = colon[0].split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  const m = raw.match(/\b(\d{1,2})[.,](\d{2})\b/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = parseStudioNumber(raw);
  return n;
}

function linesFromText(text: string): string[] {
  return stripBom(text)
    .replace(/[•·]/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 220);
}

const hasNumeric = (s: string) => /\d/.test(s);
function candidate(lines: string[], i: number): string {
  const cur = lines[i] || "";
  if (hasNumeric(cur)) return cur;
  const out = [cur];
  for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
    out.push(lines[j] || "");
    if (hasNumeric(lines[j] || "")) break;
  }
  return out.join(" ").trim();
}

function findCandidate(lines: string[], ok: (normalizedLine: string, rawLine: string) => boolean): string {
  for (let i = 0; i < lines.length; i++) {
    if (ok(norm(lines[i]), lines[i])) return candidate(lines, i);
  }
  return "";
}

function firstNumber(text: string): number | undefined {
  const m = String(text || "").match(/[-+]?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta|k|m))?\s*%?/i);
  return m ? parseStudioNumber(m[0]) : undefined;
}

function lastNumber(text: string): number | undefined {
  const all = [...String(text || "").matchAll(/[-+]?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta|k|m))?\s*%?/gi)].map((m) => m[0]);
  return all.length ? parseStudioNumber(all[all.length - 1]) : undefined;
}

function lastPercent(text: string): number | undefined {
  const all = [...String(text || "").matchAll(/[-+]?\d[\d.,]*\s*%/g)].map((m) => m[0]);
  return all.length ? parseStudioNumber(all[all.length - 1]) : undefined;
}

function durationValue(text: string): number | undefined { return parseStudioDuration(text); }
function pctValue(text: string): number | undefined { return lastPercent(text) ?? lastNumber(text); }

const isTitle = (n: string) => /\bjudul video\b|\bvideo title\b|\btitle\b/.test(n);
const isViews = (n: string) => (/\bpenayangan\b|\bviews\b|\bditonton\b/.test(n)) && !/lebih|biasanya|impression|rasio|klik|ctr|waktu|durasi|penonton unik/.test(n);
const isImpressions = (n: string) => (/\btayangan\b|\bimpressions?\b|\bimpresi\b/.test(n)) && !/penayangan|views|rasio|klik|ctr|waktu|durasi/.test(n);
const isCtr = (n: string) => /rasio klik|klik tayang|click through|click thru|\bctr\b/.test(n);
const isWatchTime = (n: string) => /\bwaktu tonton\b|\bwatch time\b/.test(n) && !/rata rata|average|avg|durasi tonton/.test(n);
const isAvgView = (n: string) => /rata rata durasi tonton|durasi tonton rata rata|average view duration|avg view duration|average watch time/.test(n) || (/rata rat/.test(n) && /durasi|tonton|view|watch/.test(n));
const isRetention = (n: string) => /retensi|retention|average percentage viewed|persentase ditonton/.test(n);
const isDuration = (n: string) => /durasi video|video duration|panjang video|video length|\bduration\b|\bdurasi\b/.test(n) && !/rata rata|average|avg|durasi tonton|watch time|waktu tonton|retensi|retention/.test(n);
const isLikes = (n: string) => /\bsuka\b|\blikes?\b/.test(n) && !/tidak suka|dislike/.test(n);
const isComments = (n: string) => /\bkomentar\b|\bcomments?\b/.test(n);
const isSubs = (n: string) => (/subscriber diperoleh|subscriber didapat|subscriber gained|subscribers gained|perubahan subscriber|\bsubs \+\b/.test(n)) && !/tidak|not |disubscribe|subscribed/.test(n);
const isAge = (n: string) => /umur upload|usia upload|hours since upload|upload age|jam sejak|setelah dipublikasikan/.test(n);

function titleValue(raw: string): string | undefined {
  const cleaned = raw.replace(/^(judul video|video title|title)\s*[:\-–—]?\s*/i, "").trim();
  if (!cleaned || hasNumeric(cleaned) || cleaned.length < 3) return undefined;
  return cleaned.slice(0, 120);
}

function parseTraffic(lines: string[]): YtStudioTrafficSource[] {
  const out: YtStudioTrafficSource[] = [];
  const seen = new Set<string>();
  const add = (key: YtStudioTrafficSource["key"], label: string, pct?: number) => {
    if (pct == null || !Number.isFinite(pct) || seen.has(key)) return;
    seen.add(key); out.push({ key, label, pct: round1(pct) });
  };
  lines.forEach((line, i) => {
    const n = norm(line);
    const c = candidate(lines, i);
    const pct = lastPercent(c);
    if (pct == null) return;
    if (/rekomendasi video|suggested videos?|video recommendations?/.test(n)) add("suggested", "Rekomendasi video", pct);
    else if (/fitur jelajah|browse features?|browse/.test(n)) add("browse", "Fitur jelajah", pct);
    else if (/penelusuran youtube|youtube search|search/.test(n)) add("search", "Penelusuran YouTube", pct);
    else if (/langsung atau tidak diketahui|direct or unknown|direct/.test(n)) add("direct", "Langsung/tidak diketahui", pct);
    else if (/fitur youtube lainnya|other youtube features?/.test(n)) add("youtubeOther", "Fitur YouTube lainnya", pct);
    else if (/eksternal|external/.test(n)) add("external", "Eksternal", pct);
    else if (/feed shorts|shorts feed|shorts/.test(n)) add("shorts", "Feed Shorts", pct);
    else if (/\blainnya\b|\bother\b/.test(n)) add("other", "Lainnya", pct);
  });
  return out;
}

function parseAudience(lines: string[]): YtStudioAudienceFact[] {
  const out: YtStudioAudienceFact[] = [];
  const seen = new Set<string>();
  const add = (key: YtStudioAudienceFact["key"], label: string, pct?: number) => {
    const id = `${key}:${label}`;
    if (pct == null || !Number.isFinite(pct) || seen.has(id)) return;
    seen.add(id); out.push({ key, label, pct: round1(pct) });
  };
  lines.forEach((line, i) => {
    const n = norm(line);
    const c = candidate(lines, i);
    const pct = lastPercent(c);
    if (pct == null) return;
    if (/tidak subscribe|not subscribed|not subscribe/.test(n)) add("notSubscribed", "Tidak subscribe", pct);
    else if (/disubscribe|subscribed/.test(n) && !/tidak|not /.test(n)) add("subscribed", "Subscribe", pct);
    else if (/tanpa subtitle|no subtitles|no cc|tanpa cc/.test(n)) add("noCc", "Tanpa subtitle/CC", pct);
    else if (/subtitle|\bcc\b/.test(n)) add("cc", line.replace(/\s*[-:–—]?\s*\d[\d.,]*\s*%.*$/i, "").trim() || "Subtitle/CC", pct);
    else if (/^indonesia\b/.test(n)) add("country", "Indonesia", pct);
  });
  return out;
}

function hasMetric(row: Partial<YtStudioTextResult>, key: YtStudioTextMetricKey): boolean {
  switch (key) {
    case "title": return !!String(row.title || "").trim();
    case "views": return row.views != null;
    case "impressions": return row.impressions != null;
    case "ctr": return row.ctrPct != null;
    case "duration": return row.durationSec != null;
    case "avd": return row.avgViewSec != null;
    case "retention": return row.retention30Pct != null;
    case "likes": return row.likes != null;
    case "comments": return row.comments != null;
    case "subs": return row.subs != null;
    case "age": return row.uploadAgeHours != null;
    case "watchTime": return row.watchTimeHours != null;
    case "traffic": return !!row.traffic?.length;
    case "audience": return !!row.audience?.length;
  }
}

export function summarizeStudioText(row: Pick<YtStudioTextResult, "parsedFields" | "missingFields" | "traffic" | "audience">): { found: string[]; missing: string[]; extra: string[] } {
  return {
    found: row.parsedFields.map((k) => TEXT_METRIC_LABELS[k]),
    missing: row.missingFields.map((k) => TEXT_METRIC_LABELS[k]),
    extra: [
      ...(row.traffic || []).map((x) => `${x.label} ${x.pct}%`),
      ...(row.audience || []).map((x) => `${x.label} ${x.pct}%`),
    ],
  };
}

export function extractStudioText(text: string, mode: GrowthMode = "long"): YtStudioTextResult {
  const rawText = stripBom(text).slice(0, 30_000);
  const lines = linesFromText(rawText);
  const titleLine = lines.find((line) => isTitle(norm(line))) || "";
  const viewsLine = findCandidate(lines, isViews);
  const impressionsLine = findCandidate(lines, isImpressions);
  const ctrLine = findCandidate(lines, isCtr);
  const durationLine = findCandidate(lines, isDuration);
  const avdLine = findCandidate(lines, isAvgView);
  const retentionLine = findCandidate(lines, isRetention);
  const watchTimeLine = findCandidate(lines, isWatchTime);
  const likesLine = findCandidate(lines, isLikes);
  const commentsLine = findCandidate(lines, isComments);
  const subsLine = findCandidate(lines, isSubs);
  const ageLine = findCandidate(lines, isAge);

  const views = firstNumber(viewsLine);
  const watchTimeHours = firstNumber(watchTimeLine);
  const avgViewFromLine = durationValue(avdLine);
  const avgViewSec = avgViewFromLine ?? (watchTimeHours != null && views != null && views > 0 ? round1((watchTimeHours * 3600) / views) : undefined);
  const traffic = parseTraffic(lines);
  const audience = parseAudience(lines);

  const row: YtStudioTextResult = {
    source: "studioText",
    rawText,
    mode,
    title: titleValue(titleLine),
    views,
    impressions: firstNumber(impressionsLine),
    ctrPct: pctValue(ctrLine),
    durationSec: durationValue(durationLine),
    avgViewSec,
    watchTimeHours,
    retention30Pct: pctValue(retentionLine),
    likes: firstNumber(likesLine),
    comments: firstNumber(commentsLine),
    subs: firstNumber(subsLine),
    uploadAgeHours: firstNumber(ageLine),
    traffic,
    audience,
    notes: [],
    confidenceScore: 0,
    parsedFields: [],
    missingFields: [],
  };
  row.parsedFields = (["title", ...BASE_FIELDS] as YtStudioTextMetricKey[]).filter((key) => hasMetric(row, key));
  if (watchTimeHours != null && !row.parsedFields.includes("watchTime")) row.parsedFields.push("watchTime");
  if (traffic.length) row.parsedFields.push("traffic");
  if (audience.length) row.parsedFields.push("audience");
  row.missingFields = BASE_FIELDS.filter((key) => !hasMetric(row, key));
  row.confidenceScore = Math.min(100, Math.round((row.parsedFields.filter((x) => BASE_FIELDS.includes(x) || x === "title").length / (BASE_FIELDS.length + 1)) * 80 + (traffic.length ? 10 : 0) + (audience.length ? 10 : 0)));
  if (watchTimeHours != null && avgViewFromLine == null && avgViewSec != null) row.notes.push(`Avg View dihitung dari waktu tonton ${watchTimeHours} jam / ${views} views.`);
  if (!row.parsedFields.length) row.notes.push("Belum ada metrik YouTube Studio yang dikenali dari teks ini.");
  return row;
}
