import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { byteLen, CLOUD_BACKUP_MAX_BYTES, CLOUD_BRANKAS_BUCKET, CLOUD_MEDIA_MAX_BYTES, cloudBackupPath, cloudConfigured, cloudMediaPath, mediaExtFromMime, mediaKindFromMime, safeCloudName, safeRemoteMediaUrl } from "@/lib/guard/cloud-brankas";
import { makeProjectBackupEnvelope, normalizeProjectBackupPayload } from "@/lib/guard/project-backup";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createClient>;

const jejak = new Map<string, number[]>();
function bolehUpload(ip: string): boolean {
  const now = Date.now();
  const arr = (jejak.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length >= 20) return false;
  arr.push(now); jejak.set(ip, arr); return true;
}

function adminClient(): { ok: true; supabase: Admin; url: string } | { ok: false; error: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!cloudConfigured(url, key)) return { ok: false, error: "Supabase Storage belum aktif: pasang NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel Env." };
  return { ok: true, url, supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

const ALLOWED_MIME = [
  "application/json", "text/json", "text/plain", "application/octet-stream",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a", "video/mp4", "image/jpeg", "image/png", "image/webp",
];

async function ensureBucket(supabase: Admin): Promise<void> {
  const opts = { public: true, fileSizeLimit: CLOUD_MEDIA_MAX_BYTES, allowedMimeTypes: ALLOWED_MIME };
  const got = await supabase.storage.getBucket(CLOUD_BRANKAS_BUCKET);
  if (!got.error) {
    await supabase.storage.updateBucket(CLOUD_BRANKAS_BUCKET, opts).catch(() => null as any);
    return;
  }
  const made = await supabase.storage.createBucket(CLOUD_BRANKAS_BUCKET, opts);
  if (made.error && !/already/i.test(made.error.message || "")) throw made.error;
}

export async function GET() {
  const a = adminClient();
  if (!a.ok) return NextResponse.json({ ok: false, configured: false, bucket: CLOUD_BRANKAS_BUCKET, backupMaxBytes: CLOUD_BACKUP_MAX_BYTES, mediaMaxBytes: CLOUD_MEDIA_MAX_BYTES, error: a.error }, { status: 503 });
  try {
    await ensureBucket(a.supabase);
    return NextResponse.json({ ok: true, configured: true, bucket: CLOUD_BRANKAS_BUCKET, backupMaxBytes: CLOUD_BACKUP_MAX_BYTES, mediaMaxBytes: CLOUD_MEDIA_MAX_BYTES, note: "☁️ Cloud Brankas Supabase aktif" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, configured: true, bucket: CLOUD_BRANKAS_BUCKET, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  if (!bolehUpload(ip)) return NextResponse.json({ ok: false, error: "Terlalu sering upload backup cloud — tunggu sebentar ya bro." }, { status: 429 });

  const a = adminClient();
  if (!a.ok) return NextResponse.json({ ok: false, code: "SUPABASE_BELUM_AKTIF", error: a.error }, { status: 503 });

  try {
    const rawText = await req.text();
    if (byteLen(rawText) > CLOUD_BACKUP_MAX_BYTES * 1.25) return NextResponse.json({ ok: false, error: "Payload terlalu besar untuk Cloud Brankas tahap ini." }, { status: 413 });
    const body = JSON.parse(rawText || "{}");

    // Tahap media: salin URL audio/video online ke Supabase Storage agar link provider yang kedaluwarsa punya salinan cloud.
    if (body.mediaUrl) {
      const mediaUrl = String(body.mediaUrl || "");
      const kind = body.kind === "video" || body.kind === "image" ? body.kind : "audio";
      if (!safeRemoteMediaUrl(mediaUrl)) return NextResponse.json({ ok: false, error: "URL media tidak aman / bukan http(s) publik. Untuk blob/upload lokal akan dibuat jalur khusus nanti." }, { status: 400 });
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 45_000);
      const rr = await fetch(mediaUrl, { signal: ac.signal, cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 VERVE-Brankas", "Accept": "audio/*,video/*,image/*,*/*" } });
      clearTimeout(timer);
      if (!rr.ok) return NextResponse.json({ ok: false, error: `Media gagal diambil (HTTP ${rr.status})` }, { status: 502 });
      const clen = Number(rr.headers.get("content-length") || 0);
      if (clen && clen > CLOUD_MEDIA_MAX_BYTES) return NextResponse.json({ ok: false, error: `Media ${(clen / 1048576).toFixed(1)}MB melebihi batas ${(CLOUD_MEDIA_MAX_BYTES / 1048576).toFixed(0)}MB.` }, { status: 413 });
      const mime = (rr.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
      const mk = mediaKindFromMime(mime);
      if (mk !== "unknown" && mk !== kind && !(kind === "audio" && mime === "application/octet-stream")) return NextResponse.json({ ok: false, error: `Tipe media tidak cocok: ${mime}` }, { status: 415 });
      const ab = await rr.arrayBuffer();
      if (ab.byteLength > CLOUD_MEDIA_MAX_BYTES) return NextResponse.json({ ok: false, error: `Media ${(ab.byteLength / 1048576).toFixed(1)}MB melebihi batas ${(CLOUD_MEDIA_MAX_BYTES / 1048576).toFixed(0)}MB.` }, { status: 413 });
      await ensureBucket(a.supabase);
      const fileName = String(body.fileName || `verve_${kind}.${mediaExtFromMime(mime) || "bin"}`);
      const path = cloudMediaPath(fileName, kind, Date.now(), mime);
      const up = await a.supabase.storage.from(CLOUD_BRANKAS_BUCKET).upload(path, new Blob([ab], { type: mime }), {
        contentType: mime,
        cacheControl: "31536000",
        upsert: false,
      });
      if (up.error) throw up.error;
      const pub = a.supabase.storage.from(CLOUD_BRANKAS_BUCKET).getPublicUrl(path);
      return NextResponse.json({ ok: true, kind, mime, bucket: CLOUD_BRANKAS_BUCKET, path, url: pub.data.publicUrl, bytes: ab.byteLength });
    }

    const snap = normalizeProjectBackupPayload(body.project ?? body.backup ?? body);
    if (!snap) return NextResponse.json({ ok: false, error: "Payload bukan proyek VERVE yang sah." }, { status: 400 });

    const envelope = makeProjectBackupEnvelope(snap);
    const text = JSON.stringify(envelope, null, 2);
    const bytes = byteLen(text);
    if (bytes > CLOUD_BACKUP_MAX_BYTES) return NextResponse.json({ ok: false, error: `Backup ${(bytes / 1048576).toFixed(1)}MB melebihi batas cloud ${(CLOUD_BACKUP_MAX_BYTES / 1048576).toFixed(1)}MB.` }, { status: 413 });

    await ensureBucket(a.supabase);
    const fileName = safeCloudName(body.fileName || `${snap.title || "verve_project"}.json`);
    const path = cloudBackupPath(fileName);
    const up = await a.supabase.storage.from(CLOUD_BRANKAS_BUCKET).upload(path, new Blob([text], { type: "application/json" }), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw up.error;
    const pub = a.supabase.storage.from(CLOUD_BRANKAS_BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, bucket: CLOUD_BRANKAS_BUCKET, path, url: pub.data.publicUrl, bytes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e || "cloud upload gagal") }, { status: 500 });
  }
}
