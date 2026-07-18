"use client";

/**
 * Crop/pad gambar 1024x1024 (native hasil AI) ke rasio target.
 * @param src data URL / blob URL gambar
 * @param ratio "16:9" | "9:16" | "1:1"
 * @returns data URL JPEG hasil crop
 */
export async function cropImageToRatio(src: string, ratio: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
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
      const cx = (srcW - cropW) / 2;
      const cy = (srcH - cropH) / 2;

      // Ukuran output sesuai rasio
      const outW = targetRatio >= 1 ? 1280 : Math.round(1280 * targetRatio);
      const outH = targetRatio >= 1 ? Math.round(1280 / targetRatio) : 1280;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, cx, cy, cropW, cropH, 0, 0, outW, outH);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("Gagal memuat gambar untuk crop"));
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
