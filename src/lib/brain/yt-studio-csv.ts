/* 📥 YouTube Studio CSV Parser v1
   Membaca CSV export YouTube Studio (Indonesia/English) → Growth Doctor input.
   Fokus: aman, deterministic, tidak mengarang. */

import type { GrowthInput, GrowthMode } from "./growth-doctor";

export type YtStudioCsvRow = GrowthInput & {
  rowIndex: number;
  raw: Record<string, string>;
  source: "csv";
};

const stripBom = (s: string) => s.replace(/^\uFEFF/, "");
const norm = (s: string) => stripBom(String(s || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[%()\[\]{}]/g, " ").replace(/[^a-z0-9\p{L}\s/_-]/gu, " ").replace(/\s+/g, " ").trim();

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const s = stripBom(String(text || ""));
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === "," || ch === ";" || ch === "\t") { row.push(cur.trim()); cur = ""; }
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

const COLS = {
  title: ["title", "video title", "judul", "judul video", "konten", "video"],
  views: ["views", "penayangan", "tayangan video", "ditonton"],
  impressions: ["impressions", "tayangan", "impresi"],
  ctr: ["impressions click-through rate", "ctr", "rasio klik tayang", "rasio klik-tayang", "klik tayang"],
  duration: ["duration", "durasi", "panjang video"],
  avd: ["average view duration", "rata rata durasi tonton", "rata-rata durasi tonton", "avg view"],
  retention: ["average percentage viewed", "retention", "retensi", "persentase ditonton", "rata rata persentase ditonton"],
  likes: ["likes", "suka"],
  comments: ["comments", "komentar"],
  subs: ["subscribers", "subscriber", "subscriber gained", "subscribers gained", "perubahan subscriber"],
  age: ["age hours", "umur upload", "hours since upload", "upload age"],
};

export function extractStudioRows(csvText: string, mode: GrowthMode = "long"): YtStudioCsvRow[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const ix: Record<string, number> = Object.fromEntries(Object.entries(COLS).map(([k, keys]) => [k, findCol(headers, keys)]));
  return rows.slice(1).map((r, i) => {
    const val = (k: string) => ix[k] >= 0 ? (r[ix[k]] || "") : "";
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[h || `col_${j}`] = r[j] || ""; });
    return {
      source: "csv" as const,
      rowIndex: i + 1,
      mode,
      title: val("title") || `Video baris ${i + 1}`,
      views: parseStudioNumber(val("views")),
      impressions: parseStudioNumber(val("impressions")),
      ctrPct: parseStudioNumber(val("ctr")),
      durationSec: parseStudioDuration(val("duration")),
      avgViewSec: parseStudioDuration(val("avd")),
      retention30Pct: parseStudioNumber(val("retention")),
      likes: parseStudioNumber(val("likes")),
      comments: parseStudioNumber(val("comments")),
      subs: parseStudioNumber(val("subs")),
      uploadAgeHours: parseStudioNumber(val("age")),
      raw,
    } as YtStudioCsvRow;
  }).filter((x) => x.title || x.views || x.impressions || x.ctrPct);
}
