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

export function parseStudioNumber(v: string): number | undefined {
  let s = String(v || "").trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  // deteksi satuan: rb/ribu/k → ×1000, jt/juta/m → ×1jt
  let mul = 1;
  if (/\b(rb|ribu|k)\b/.test(s)) mul = 1000;
  if (/\b(jt|juta|m)\b/.test(s)) mul = 1_000_000;
  s = s.replace(/%/g, "").replace(/[^0-9,.-]/g, "");
  if (!s) return undefined;
  // normalisasi pemisah desimal vs ribuan (konvensi Indonesia: titik=ribuan, koma=desimal)
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
  const raw = Number(s);
  if (!Number.isFinite(raw)) return undefined;
  // 🐛 FIX v19.55: kalau angka SUDAH besar (≥1000), satuan "rb/jt" itu DUPLIKAT dari
  // OCR (mis. "169,063 rb" → 169063) → JANGAN dikali lagi. Dulu: 169063 × 1000 = 169.063.000!
  const hasil = raw >= 1000 ? raw : round1(raw * mul);
  return Number.isFinite(hasil) ? round1(hasil) : undefined;
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
  const isRet = isRetention(norm(cur));
  const out = [cur];
  for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
    const next = lines[j] || "";
    const nNext = norm(next);
    if (j > i && isAnyMetricLabel(nNext) && !hasNumeric(next)) {
      if (!(isRet && isAvgView(nNext))) {
        break;
      }
    }
    // 🐛 v19.55.1 FIX: skip baris yang mirip JAM (pojok screenshot HP, mis. "01.19" / "18.01")
    // — dulu baris ini diambil sebagai angka metrik (views jadi "18" dari jam!)
    // TAPI jangan skip kalau label saat ini = durasi (mis. "Rata-rata durasi tonton 1.47" = 1:47, bukan jam)
    if (looksLikeClock(next) && !isAvgView(norm(cur)) && !isDuration(norm(cur))) {
      continue;
    }
    out.push(next);
    if (hasNumeric(next)) break;
  }
  return out.join(" ").trim();
}

/** Deteksi teks yang berbentuk jam (HH:MM / HH.MM) — bukan data metrik. */
function looksLikeClock(s: string): boolean {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{1,2})[.:](\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]), mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm <= 59;
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

function countValue(text: string): number | undefined {
  const all = [...String(text || "").matchAll(/[-+]?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta|k|m))?(?:\s*%)?/gi)].map((m) => m[0]);
  for (const item of all) {
    if (!/%/.test(item)) {
      const n = parseStudioNumber(item);
      if (n != null) return n;
    }
  }
  return undefined;
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
const isViews = (n: string) => (/\bpenayangan\b|\bviews\b|\bditonton\b/.test(n)) && !/lebih|biasanya|impression|rasio|klik|ctr|waktu|durasi|penonton unik|peringkat|menurut|rank|ranking|dari \d/i.test(n);
const isImpressions = (n: string) => (/\btayangan\b|\bimpressions?\b|\bimpresi\b/.test(n)) && !/penayangan|views|rasio|klik|ctr|waktu|durasi|peringkat|menurut|rank|ranking|dari \d/i.test(n);
const isCtr = (n: string) => (/rasio klik|klik tayang|click through|click thru|\bctr\b/.test(n)) && !/peringkat|menurut|rank|ranking/i.test(n);
const isWatchTime = (n: string) => /\bwaktu tonton\b|\bwatch time\b/.test(n) && !/rata rata|average|avg|durasi tonton/.test(n);
const isAvgView = (n: string) => ((/rata rata durasi tonton|durasi tonton rata rata|average view duration|avg view duration|average watch time/.test(n) || (/rata rat/.test(n) && /durasi|tonton|view|watch/.test(n))) && !/semua|all|retensi|retention/.test(n));
const isRetention = (n: string) => /retensi|retention|average percentage viewed|persentase ditonton/.test(n);
const isDuration = (n: string) => /durasi video|video duration|panjang video|video length|\bduration\b|\bdurasi\b/.test(n) && !/rata rata|average|avg|durasi tonton|watch time|waktu tonton|retensi|retention/.test(n);
const isLikes = (n: string) => /\bsuka\b|\blikes?\b/.test(n) && !/tidak suka|dislike/.test(n);
const isComments = (n: string) => /\bkomentar\b|\bcomments?\b/.test(n);
const isSubs = (n: string) => (/subscriber diperoleh|subscriber didapat|subscriber gained|subscribers gained|perubahan subscriber|\bsubs \+\b/.test(n)) && !/tidak|not |disubscribe|subscribed/.test(n);
const isAge = (n: string) => /umur upload|usia upload|hours since upload|upload age|jam sejak|setelah dipublikasikan|hari.*jam pertama|jam pertama/.test(n);

function isAnyMetricLabel(n: string): boolean {
  return isViews(n) || isImpressions(n) || isCtr(n) || isWatchTime(n) || isAvgView(n) || isRetention(n) || isDuration(n) || isLikes(n) || isComments(n) || isSubs(n) || isAge(n);
}

function parseStudioAge(v: string): number | undefined {
  const raw = String(v || "").trim();
  if (!raw || raw === "-" || raw === "—") return undefined;
  const mHariJam = raw.match(/\b(\d+)\s*hari(?:\s*(\d+)\s*jam)?/i);
  if (mHariJam) {
    const days = Number(mHariJam[1] || 0);
    const hrs = Number(mHariJam[2] || 0);
    return days * 24 + hrs;
  }
  const mJam = raw.match(/\b(\d+)\s*jam\b/i);
  if (mJam) return Number(mJam[1]);
  return countValue(raw);
}

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

  const views = countValue(viewsLine);
  const watchTimeHours = countValue(watchTimeLine);
  const avgViewFromLine = durationValue(avdLine);
  const avgViewSec = avgViewFromLine ?? (watchTimeHours != null && views != null && views > 0 ? round1((watchTimeHours * 3600) / views) : undefined);
  let durationSec = durationValue(durationLine);
  if (durationSec == null) {
    for (let i = 2; i < lines.length; i++) {
      const l = lines[i];
      if (l === avdLine || isAge(norm(l))) continue;
      const m = l.match(/^\s*(\d{1,2})[.:](\d{2})\s*$/);
      if (m) {
        const d = Number(m[1]) * 60 + Number(m[2]);
        if (d >= 5 && d <= 3600 && d !== avgViewSec) {
          durationSec = d;
          break;
        }
      }
    }
  }
  const traffic = parseTraffic(lines);
  const audience = parseAudience(lines);

  const row: YtStudioTextResult = {
    source: "studioText",
    rawText,
    mode,
    title: titleValue(titleLine),
    views,
    impressions: countValue(impressionsLine),
    ctrPct: pctValue(ctrLine),
    durationSec,
    avgViewSec,
    watchTimeHours,
    retention30Pct: pctValue(retentionLine),
    likes: countValue(likesLine),
    comments: countValue(commentsLine),
    subs: countValue(subsLine),
    uploadAgeHours: parseStudioAge(ageLine),
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
