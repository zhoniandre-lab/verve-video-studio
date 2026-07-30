/* 📥 YouTube Studio CSV Parser v2
   Membaca CSV export YouTube Studio (Indonesia/English) → Growth Doctor input.
   Fokus: aman, deterministic, tidak mengarang. */

import type { GrowthInput, GrowthMode } from "./growth-doctor";

export type YtStudioCsvMetricKey = "title" | "views" | "impressions" | "ctr" | "duration" | "avd" | "retention" | "likes" | "comments" | "subs" | "age";
type CsvColKey = YtStudioCsvMetricKey | "watchTimeHours";

export type YtStudioCsvRow = GrowthInput & {
  rowIndex: number;
  raw: Record<string, string>;
  source: "csv";
  /** Kolom/metrik yang benar-benar terbaca dari CSV/hasil hitung aman. */
  parsedFields: YtStudioCsvMetricKey[];
  /** Kolom/metrik yang belum ada / belum dikenali dari CSV. */
  missingFields: YtStudioCsvMetricKey[];
};

export const CSV_METRIC_LABELS: Record<YtStudioCsvMetricKey, string> = {
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
};

const REQUIRED_ROW_FIELDS: YtStudioCsvMetricKey[] = ["views", "impressions", "ctr"];
const OPTIONAL_ROW_FIELDS: YtStudioCsvMetricKey[] = ["duration", "avd", "retention", "likes", "comments", "subs", "age"];
const ALL_ROW_FIELDS: YtStudioCsvMetricKey[] = ["title", ...REQUIRED_ROW_FIELDS, ...OPTIONAL_ROW_FIELDS];

const stripBom = (s: string) => s.replace(/^\uFEFF/, "");
const norm = (s: string) => stripBom(String(s || ""))
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[%()\[\]{}]/g, " ")
  .replace(/[^a-z0-9\p{L}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

function countDelimiters(line: string): Record<string, number> {
  const out: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') i++;
      else if (ch === '"') q = false;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" || ch === "\t") out[ch]++;
  }
  return out;
}

export function detectCsvDelimiter(text: string): "," | ";" | "\t" {
  const lines = stripBom(String(text || "")).split(/\r?\n/).filter((x) => x.trim()).slice(0, 6);
  const total: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  lines.forEach((line) => {
    const c = countDelimiters(line);
    total[","] += c[","];
    total[";"] += c[";"];
    total["\t"] += c["\t"];
  });
  // YouTube/Excel Indonesia sering pakai semicolon supaya angka 3,2% tidak pecah.
  if (total["\t"] > 0 && total["\t"] >= total[";"] && total["\t"] >= total[","]) return "\t";
  if (total[";"] > 0 && total[";"] >= total[","]) return ";";
  return ",";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const s = stripBom(String(text || ""));
  const delimiter = detectCsvDelimiter(s);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === delimiter) { row.push(cur.trim()); cur = ""; }
      else if (ch === "\n") { row.push(cur.trim()); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") cur += ch;
    }
  }
  row.push(cur.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows.filter((r) => r.some((x) => String(x || "").trim() !== ""));
}

function findCol(headers: string[], keys: string[]): number {
  const H = headers.map(norm);
  for (const k of keys) {
    const nk = norm(k);
    const exact = H.findIndex((h) => h === nk);
    if (exact >= 0) return exact;
  }
  for (const k of keys) {
    const nk = norm(k);
    if (!nk) continue;
    // Fuzzy match jangan terlalu agresif: "durasi" tidak boleh mencuri kolom
    // "Durasi tonton rata-rata" yang sebenarnya adalah Avg View.
    const shortSingleWord = !nk.includes(" ") && nk.length < 10;
    if (shortSingleWord) continue;
    const idx = H.findIndex((h) => h.includes(nk) || nk.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseStudioNumber(v: string): number | undefined {
  let s = String(v || "").trim().toLowerCase();
  if (!s || s === "-" || s === "—") return undefined;
  let mul = 1;
  if (/\brb\b|ribu|\bk\b/.test(s)) mul = 1000;
  if (/\bjt\b|juta|\bm\b/.test(s)) mul = 1_000_000;
  s = s.replace(/%/g, "").replace(/[^0-9,.-]/g, "");
  if (!s) return undefined;
  // Indonesian decimal: 10,6. English thousands: 10,600. Ambil heuristik.
  if (s.includes(",") && s.includes(".")) {
    // 1.234,5 -> 1234.5 ; 1,234.5 -> 1234.5
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) s = parts[0].replace(/\./g, "") + "." + parts[1];
    else s = s.replace(/,/g, "");
  } else {
    // 1.234 likely thousands if 3 digits after dot, otherwise decimal/time handled elsewhere.
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3) s = parts.join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mul * 10) / 10 : undefined;
}

export function parseStudioDuration(v: string): number | undefined {
  const raw = String(v || "").trim();
  if (!raw || raw === "-" || raw === "—") return undefined;
  const colon = raw.match(/(\d{1,2}:)?\d{1,2}:\d{2}/);
  if (colon) {
    const p = colon[0].split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  // YouTube Studio ID mobile often displays 2.18 for 2:18. Treat as m.ss if exactly 1-2 digits after dot.
  const m = raw.match(/\b(\d{1,2})[.,](\d{2})\b/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = parseStudioNumber(raw);
  return n;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const COLS: Record<CsvColKey, string[]> = {
  title: ["title", "video title", "judul", "judul video", "konten", "content", "video"],
  views: ["views", "penayangan", "tayangan video", "video views", "ditonton"],
  impressions: ["impressions", "impression", "tayangan", "impresi"],
  ctr: ["impressions click through rate", "impressions ctr", "ctr", "rasio klik tayang dari tayangan", "rasio klik tayang", "klik tayang"],
  duration: ["duration", "video duration", "durasi", "durasi video", "panjang video", "video length", "length", "panjang"],
  avd: ["average view duration", "avg view duration", "rata rata durasi tonton", "durasi tonton rata rata", "durasi tonton rata rata detik", "rata rata waktu tonton", "average watch time"],
  retention: ["average percentage viewed", "average view percentage", "avg percentage viewed", "retention", "retensi", "retensi penonton", "persentase ditonton", "rata rata persentase ditonton", "persentase ditonton rata rata"],
  likes: ["likes", "likes added", "suka", "suka ditambahkan", "jumlah suka"],
  comments: ["comments", "comments added", "komentar", "komentar ditambahkan", "komentar yang ditambahkan"],
  subs: ["subscribers", "subscriber", "subscriber gained", "subscribers gained", "subscriber diperoleh", "subscriber didapat", "perubahan subscriber", "subs", "subs +"],
  age: ["age hours", "umur upload", "hours since upload", "upload age", "usia upload"],
  watchTimeHours: ["watch time hours", "watch time", "waktu tonton jam", "waktu tonton"],
};

function hasMetric(row: Partial<YtStudioCsvRow>, key: YtStudioCsvMetricKey): boolean {
  switch (key) {
    case "title": return !!String(row.title || "").trim() && !/^video baris \d+$/i.test(String(row.title || "").trim());
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
  }
}

export function summarizeStudioRow(row: Pick<YtStudioCsvRow, "parsedFields" | "missingFields">): { found: string[]; missing: string[] } {
  return {
    found: row.parsedFields.map((k) => CSV_METRIC_LABELS[k]),
    missing: row.missingFields.map((k) => CSV_METRIC_LABELS[k]),
  };
}

export function extractStudioRows(csvText: string, mode: GrowthMode = "long"): YtStudioCsvRow[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const ix: Record<CsvColKey, number> = Object.fromEntries(Object.entries(COLS).map(([k, keys]) => [k, findCol(headers, keys)])) as Record<CsvColKey, number>;
  return rows.slice(1).map((r, i) => {
    const val = (k: CsvColKey) => ix[k] >= 0 ? (r[ix[k]] || "") : "";
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[h || `col_${j}`] = r[j] || ""; });

    const views = parseStudioNumber(val("views"));
    const retention30Pct = parseStudioNumber(val("retention"));
    const watchTimeHours = parseStudioNumber(val("watchTimeHours"));
    const avdFromColumn = parseStudioDuration(val("avd"));
    const avgViewSec = avdFromColumn ?? (watchTimeHours != null && views != null && views > 0 ? round1((watchTimeHours * 3600) / views) : undefined);
    const durationSec = parseStudioDuration(val("duration"));

    const rowObj: YtStudioCsvRow = {
      source: "csv" as const,
      rowIndex: i + 1,
      mode,
      title: val("title") || `Video baris ${i + 1}`,
      views,
      impressions: parseStudioNumber(val("impressions")),
      ctrPct: parseStudioNumber(val("ctr")),
      durationSec,
      avgViewSec,
      retention30Pct,
      likes: parseStudioNumber(val("likes")),
      comments: parseStudioNumber(val("comments")),
      subs: parseStudioNumber(val("subs")),
      uploadAgeHours: parseStudioNumber(val("age")),
      raw,
      parsedFields: [],
      missingFields: [],
    };
    rowObj.parsedFields = ALL_ROW_FIELDS.filter((key) => hasMetric(rowObj, key));
    rowObj.missingFields = ALL_ROW_FIELDS.filter((key) => key !== "title" && !hasMetric(rowObj, key));
    return rowObj;
  }).filter((x) => x.parsedFields.length > 0);
}
