/* 🔗 YouTube URL helpers — ambil videoId dari link/teks user tanpa nebak metrik. */

export function extractYoutubeVideoId(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const direct = raw.match(/^[a-zA-Z0-9_-]{10,20}$/)?.[0];
  if (direct) return direct;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const v = url.searchParams.get("v") || "";
    if (/youtube\.com$|youtube-nocookie\.com$/.test(host) && /^[a-zA-Z0-9_-]{10,20}$/.test(v)) return v;

    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ["shorts", "live", "embed", "v"].includes(p));
    const id = host === "youtu.be" ? parts[0] : idx >= 0 ? parts[idx + 1] : "";
    const clean = String(id || "").replace(/[^a-zA-Z0-9_-].*$/, "");
    return /^[a-zA-Z0-9_-]{10,20}$/.test(clean) ? clean : "";
  } catch {
    const m = raw.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([a-zA-Z0-9_-]{10,20})/);
    return m?.[1] || "";
  }
}
