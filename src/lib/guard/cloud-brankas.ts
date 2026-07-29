/* ☁️ VERVE GUARD · CLOUD BRANKAS
   Helper murni untuk Supabase Storage brankas cloud. Tahap awal: backup JSON proyek.
   Media besar (audio/video) akan menyusul bertahap supaya tidak membuka celah abuse. */

export const CLOUD_BRANKAS_BUCKET = "verve-brankas";
export const CLOUD_BACKUP_MAX_BYTES = 2_000_000; // backup JSON proyek: cukup lega, tetap aman untuk serverless

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

export function cloudBackupPath(fileName: string, nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const stamp = `${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
  return `backups/${yyyy}/${mm}/${dd}/${stamp}_${safeCloudName(fileName)}`;
}

export function byteLen(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}
