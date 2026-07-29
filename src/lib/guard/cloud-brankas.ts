/* ☁️ VERVE GUARD · CLOUD BRANKAS
   Helper murni untuk Supabase Storage brankas cloud. Tahap awal: backup JSON proyek.
   Media besar (audio/video) akan menyusul bertahap supaya tidak membuka celah abuse. */

export const CLOUD_BRANKAS_BUCKET = "verve-brankas";
export const CLOUD_BACKUP_MAX_BYTES = 2_000_000; // backup JSON proyek: cukup lega, tetap aman untuk serverless
export const CLOUD_MEDIA_MAX_BYTES = 25 * 1024 * 1024; // tahap audio/lagu: cukup utk MP3 lagu 3-6 menit, tetap hemat free tier

export function cloudConfigured(url?: string, serviceKey?: string): boolean {
  return /^https:\/\//i.test(String(url || "")) && String(serviceKey || "").length > 20;
}

export function safeCloudName(name: string, fallback = "verve_project.json"): string {
  const raw = String(name || fallback).trim() || fallback;
  const dot = raw.toLowerCase().endsWith(".json") ? "" : ".json";
  const clean = raw
    .replace(/[^\w\- .]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 90)
    .replace(/^\.+/, "") || fallback;
  return clean.toLowerCase().endsWith(".json") ? clean : `${clean}${dot}`;
}

function utcParts(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return {
    yyyy: d.getUTCFullYear(),
    mm: String(d.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(d.getUTCDate()).padStart(2, "0"),
    stamp: `${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

export function cloudBackupPath(fileName: string, nowMs = Date.now()): string {
  const p = utcParts(nowMs);
  return `backups/${p.yyyy}/${p.mm}/${p.dd}/${p.stamp}_${safeCloudName(fileName)}`;
}

export function safeMediaName(name: string, mime = "audio/mpeg", fallback = "verve_audio"): string {
  const ext = mediaExtFromMime(mime) || "bin";
  const raw = String(name || fallback).trim() || fallback;
  const withoutExt = raw.replace(/\.[a-z0-9]{2,5}$/i, "");
  const clean = withoutExt.replace(/[^\w\- .]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, 70).replace(/^\.+/, "") || fallback;
  return `${clean}.${ext}`;
}

export function cloudMediaPath(fileName: string, kind: "audio" | "video" | "image" = "audio", nowMs = Date.now(), mime = "audio/mpeg"): string {
  const p = utcParts(nowMs);
  return `media/${kind}/${p.yyyy}/${p.mm}/${p.dd}/${p.stamp}_${safeMediaName(fileName, mime)}`;
}

export function mediaExtFromMime(mime: string): string {
  const m = String(mime || "").toLowerCase().split(";")[0].trim();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("aac")) return "aac";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  return "";
}

export function mediaKindFromMime(mime: string): "audio" | "video" | "image" | "unknown" {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  return "unknown";
}

export function safeRemoteMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^(0|10|127)\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return false;
    return true;
  } catch { return false; }
}

export function byteLen(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}
