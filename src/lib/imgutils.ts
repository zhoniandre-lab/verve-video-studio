"use client";

/**
 * Crop/pad gambar (data URL / blob URL / URL biasa) ke rasio target.
 * Sudah menangani CORS dengan accept-server-proxy (data URL).
 * @param src data URL / blob URL / http URL
 * @param ratio "16:9" | "9:16" | "1:1"
 * @returns data URL JPEG hasil crop (quality 0.9)
 */
export async function cropImageToRatio(src: string, ratio: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Hanya set crossOrigin kalau URL http(s) (bukan data:/blob:)
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Timeout memuat gambar (coba lagi / ganti style)"));
    }, 30000);
    img.onload = () => {
      if (timedOut) return;
      clearTimeout(timer);
      try {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) {
          reject(new Error("Gambar tidak memiliki dimensi valid"));
          return;
        }
        let targetRatio = 1;
        if (ratio === "1792x1024" || ratio === "16:9") targetRatio = 16 / 9;
        else if (ratio === "1024x1792" || ratio === "9:16") targetRatio = 9 / 16;
        else targetRatio = 1;

        // Crop tengah
        let cropW = srcW, cropH = srcH;
        if (srcW / srcH > targetRatio) {
          cropW = srcH * targetRatio;
        } else {
          cropH = srcW / targetRatio;
        }
        const cx = Math.max(0, (srcW - cropW) / 2);
        const cy = Math.max(0, (srcH - cropH) / 2);

        // Ukuran output sesuai rasio (maks 1280 di sisi terpendek untuk hemat memori di HP)
        const outW = targetRatio >= 1 ? 1280 : Math.round(1280 * targetRatio);
        const outH = targetRatio >= 1 ? Math.round(1280 / targetRatio) : 1280;

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Browser tidak mendukung canvas"));
          return;
        }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, cx, cy, cropW, cropH, 0, 0, outW, outH);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (e: any) {
        reject(new Error(`Gagal crop: ${e?.message || "canvas error"}`));
      }
    };
    img.onerror = (e) => {
      if (timedOut) return;
      clearTimeout(timer);
      // Detect CORS
      const isCors = /^https?:\/\//i.test(src) && !src.includes(location.hostname);
      reject(new Error(
        isCors
          ? "Gambar di-block CORS browser. Coba refresh / generate ulang."
          : "Gagal memuat gambar (format rusak / network error)"
      ));
    };
    // Cache buster untuk URL remote
    img.src = src;
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch { return false; }
}
