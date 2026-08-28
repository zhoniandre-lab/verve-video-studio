import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLOUD_BRANKAS_BUCKET, CLOUD_MEDIA_MAX_BYTES, cloudConfigured, cloudMediaPath, mediaKindFromMime, safeMediaName } from "@/lib/guard/cloud-brankas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Admin = ReturnType<typeof createClient>;
const MAX_UPLOADS_PER_WINDOW = 12;
const uploadLog = new Map<string, number[]>();
const ALLOWED_MIME = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a",
  "video/mp4", "video/webm", "video/quicktime",
]);

function canUpload(ip: string): boolean {
  const now = Date.now();
  const recent = (uploadLog.get(ip) || []).filter((at) => now - at < 10 * 60 * 1000);
  if (recent.length >= MAX_UPLOADS_PER_WINDOW) return false;
  recent.push(now);
  uploadLog.set(ip, recent);
  return true;
}

function adminClient(): { ok: true; supabase: Admin } | { ok: false; error: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!cloudConfigured(url, key)) {
    return { ok: false, error: "Penyimpanan upload belum aktif. Pasang Supabase Storage di Environment Variables server." };
  }
  return { ok: true, supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

async function ensureBucket(supabase: Admin): Promise<void> {
  const opts = {
    public: true,
    fileSizeLimit: CLOUD_MEDIA_MAX_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME),
  };
  const got = await supabase.storage.getBucket(CLOUD_BRANKAS_BUCKET);
  if (!got.error) {
    await supabase.storage.updateBucket(CLOUD_BRANKAS_BUCKET, opts).catch(() => null as any);
    return;
  }
  const made = await supabase.storage.createBucket(CLOUD_BRANKAS_BUCKET, opts);
  if (made.error && !/already/i.test(made.error.message || "")) throw made.error;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  if (!canUpload(ip)) return NextResponse.json({ ok: false, error: "Upload terlalu sering. Tunggu beberapa menit lalu coba lagi." }, { status: 429 });
  const admin = adminClient();
  if (!admin.ok) return NextResponse.json({ ok: false, code: "STORAGE_NOT_CONFIGURED", error: admin.error }, { status: 503 });

  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (!entry || typeof (entry as any).arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "File audio/video wajib diisi." }, { status: 400 });
    }
    const file = entry as File;
    const mime = String(file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) return NextResponse.json({ ok: false, error: "Format tidak didukung. Gunakan MP3, WAV, M4A, OGG, MP4, atau WebM." }, { status: 415 });
    if (file.size <= 0) return NextResponse.json({ ok: false, error: "File kosong." }, { status: 400 });
    if (file.size > CLOUD_MEDIA_MAX_BYTES) return NextResponse.json({ ok: false, error: `File terlalu besar. Batas ${(CLOUD_MEDIA_MAX_BYTES / 1048576).toFixed(0)} MB.` }, { status: 413 });

    await ensureBucket(admin.supabase);
    const rawKind = mediaKindFromMime(mime);
    const kind = rawKind === "video" ? "video" : "audio";
    const name = safeMediaName(String(file.name || "reference"), mime, "music_reference");
    const path = cloudMediaPath(name, kind, Date.now(), mime);
    const data = await file.arrayBuffer();
    const uploaded = await admin.supabase.storage.from(CLOUD_BRANKAS_BUCKET).upload(path, new Blob([data], { type: mime }), {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const publicUrl = admin.supabase.storage.from(CLOUD_BRANKAS_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, url: publicUrl, path, kind, mime, bytes: data.byteLength });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Upload referensi gagal").slice(0, 240) }, { status: 500 });
  }
}
