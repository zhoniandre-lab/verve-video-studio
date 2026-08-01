/* =====================================================================
   VERVE Studio — Media Duration Extraction
   - Detect durasi asli file video/audio pakai HTMLMediaElement
   - Browser-only, returns Promise<number> (detik)
   - Fallback: 0 kalau gagal
   ===================================================================== */

export function extractMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(file);
    const el =
      file.type.startsWith("video/") || file.type.startsWith("audio/")
        ? document.createElement(file.type.startsWith("video/") ? "video" : "audio")
        : document.createElement("video");

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(0);
    }, 8000); // 8s timeout

    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => {
      clearTimeout(timeout);
      const d = (el as HTMLMediaElement).duration;
      cleanup();
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    el.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(0);
    };
  });
}

export function detectMediaKind(type: string): "video" | "audio" | "image" {
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "image";
}
