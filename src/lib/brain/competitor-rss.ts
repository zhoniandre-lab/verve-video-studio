/**
 * 🛰️ VERVE KOMPETITOR RSS v19.6 — "mata-mata" real-time untuk channel lawan.
 * Prinsip OSINT: data publik termurah & paling stabil = RSS.
 * Setiap channel YouTube punya RSS gratis: youtube.com/feeds/videos.xml?channel_id=...
 * → pantau upload kompetitor TANPA menyentuh kuota YouTube API (yang cuma 10rb/hari).
 *
 * Modul ini PURE & offline (parser + logika). Route /api/competitor-rss yang fetch.
 * Saat kompetitor upload video baru:
 *   - otak langsung tahu judul & kapan
 *   - dibandingkan dengan judul-judulmu (jaccard) → peringatan kalau mirip
 */

import { jaccardSim } from "./yie-score";
import type { BrainMemory } from "./yie-score";

export type KompItem = {
  title: string;
  videoId: string;
  url: string;
  published: string; // ISO
  publishedAt: number;
};

export type KompFeed = {
  channelId: string;
  channelName?: string;
  items: KompItem[];
  error?: string;
};

export type KompChannel = { id: string; name: string; addedAt: number };

/** Parse RSS YouTube (Atom) → daftar video terbaru. Deterministic, tanpa dependency. */
export function parseYtRss(xml: string, limit = 15): KompItem[] {
  const blocks = String(xml || "").match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const out: KompItem[] = [];
  for (const b of blocks) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const videoId = (b.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/) || [])[1];
    const published = (b.match(/<published>([\s\S]*?)<\/published>/) || [])[1];
    if (!title || !videoId) continue;
    const ts = published ? +new Date(published) : Date.now();
    out.push({
      title: decodeXml(title).trim(),
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published: published || "",
      publishedAt: Number.isFinite(ts) ? ts : Date.now(),
    });
  }
  return out.slice(0, limit);
}

function decodeXml(s: string): string {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Ambil channel ID murni dari input (URL atau ID langsung). Null kalau butuh resolve server. */
export function extractChannelId(input: string): string | null {
  const s = String(input || "").trim();
  if (/^UC[\w-]{22}$/.test(s)) return s;
  let m = s.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]channel_id=(UC[\w-]+)/);
  if (m) return m[1];
  return null;
}

/** Apakah input ini URL YouTube yang butuh resolve (mis. @handle, /c/...)? */
export function butuhResolve(input: string): boolean {
  const s = String(input || "").trim();
  return !extractChannelId(s) && /youtube\.com|youtu\.be/i.test(s);
}

/** Judul kompetitor mirip nggak dengan judul-judul yang pernah kamu pakai? */
export function simJudul(title: string, brain: BrainMemory): { max: number; match: string | null } {
  let max = 0;
  let match: string | null = null;
  for (const r of brain.results || []) {
    const s = jaccardSim(String(title || ""), r.title || "");
    if (s > max) { max = s; match = r.title || null; }
  }
  return { max: Math.round(max * 100), match };
}

/** Format "x jam / x hari lalu" untuk UI. */
export function waktuLalu(ts: number): string {
  const d = Math.max(0, Date.now() - ts);
  const mnt = Math.floor(d / 60000);
  if (mnt < 60) return `${mnt} mnt lalu`;
  const jam = Math.floor(mnt / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

/** Ringkasan teks hasil scan — siap salin/share. */
export function ringkasanScan(feeds: KompFeed[], brain: BrainMemory): string {
  const L: string[] = [];
  let total = 0;
  feeds.forEach((f) => {
    if (!f.items.length) return;
    total += f.items.length;
    L.push(`📺 ${f.channelName || f.channelId}: ${f.items[0].title} (${waktuLalu(f.items[0].publishedAt)})`);
  });
  if (!total) return "Belum ada upload baru dari kompetitor.";
  const warn = feeds
    .flatMap((f) => f.items)
    .map((it) => ({ it, sim: simJudul(it.title, brain) }))
    .filter((x) => x.sim.max >= 60);
  if (warn.length) L.push(`⚠️ ${warn.length} video kompetitor mirip judulmu (≥60%): "${warn[0].it.title}" vs "${warn[0].sim.match}"`);
  return L.join("\n");
}
