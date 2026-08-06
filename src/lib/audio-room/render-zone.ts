/* =====================================================================
   AUDIO ROOM — render zona (v19.37) — 100% orisinal, deterministik
   Teknik "Local Re-Projection + Depth Overlay":
   - gambar dasar digambar sekali (diam)
   - tiap zona: patch di dalam zona digambar ulang dari GAMBAR ASLI dengan
     scale lokal (pulse), deform vertikal (cone memompa), getar halus
   - masking bentuk (circle/oval/polygon) + blur tepi
   - depth overlay: bayangan radial (cekung), highlight cincin (beat), glow
   Satu fungsi dipakai preview & render → WYSIWYG.
   ===================================================================== */
import type { AudioZone } from "./types";
import type { DriverZona } from "./zonedriver";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Gambar semua zona reaktif di atas gambar dasar. img = gambar asli ruangan. */
export function gambarZonaReaktif(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number, imgH: number,   // ukuran natural gambar
  W: number, H: number,         // ukuran kanvas
  zones: { z: AudioZone; d: DriverZona }[],
  opt: { glowWarna: string },
): void {
  for (const { z, d } of zones) {
    if (!z.visible) continue;
    const cx = z.x * W, cy = z.y * H;
    const rx = z.rx * W, ry = z.ry * H;
    const K = z.kekuatan;

    // --- patch source (dari gambar asli, dengan margin 1.35×) ---
    const m = 1.35;
    const sx0 = Math.max(0, (z.x - z.rx * m) * imgW);
    const sy0 = Math.max(0, (z.y - z.ry * m) * imgH);
    const sw = Math.min(imgW - sx0, z.rx * 2 * m * imgW);
    const sh = Math.min(imgH - sy0, z.ry * 2 * m * imgH);

    // --- transform lokal: pulse + deform + getar ---
    const scale = Math.max(0.7, d.pulse);
    const scaleY = scale * (1 - d.deform * 0.35);
    const dw = sw * scale;
    const dh = sh * scaleY;
    const dx = cx + d.getarX * W - dw / 2;
    const dy = cy + d.getarY * H - dh / 2;

    // --- mask bentuk ---
    ctx.save();
    buatPath(ctx, z, W, H, 0, 0);
    ctx.clip();
    // soft edge: gradient radial di tepi (buat circle/oval)
    if (z.blurEdge > 0.02 && z.shape !== "polygon") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const g = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * (1 - z.blurEdge), cx, cy, Math.max(rx, ry));
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // --- re-project patch (gambar ulang dari sumber asli) ---
    ctx.drawImage(img, sx0, sy0, sw, sh, dx, dy, dw, dh);
    ctx.restore();

    // --- depth overlay (di dalam mask, tanpa clip ulang di luar zona) ---
    ctx.save();
    buatPath(ctx, z, W, H, 0, 0);
    ctx.clip();
    // bayangan cekung: gelap di tengah, alpha ikut deform
    const shA = d.shadow;
    if (shA > 0.02) {
      const sg = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.15, cx, cy, Math.max(rx, ry));
      sg.addColorStop(0, `rgba(0,0,0,${(0.28 * shA).toFixed(3)})`);
      sg.addColorStop(0.55, `rgba(0,0,0,${(0.16 * shA).toFixed(3)})`);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
    }
    // highlight cincin saat beat / dorongan
    const hA = Math.max(d.beat * 0.5, d.push * 0.5);
    if (hA > 0.03) {
      ctx.strokeStyle = `rgba(255,255,255,${(hA * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2 + d.push * 6;
      ctx.beginPath();
      if (z.shape === "circle" || z.shape === "oval") {
        ctx.ellipse(cx, cy, rx * (1 - d.push * 0.12), ry * (1 - d.push * 0.12), z.rotation, 0, Math.PI * 2);
      } else {
        ctx.ellipse(cx, cy, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();

    // --- glow belakang (lighter) ---
    if (d.glow > 0.04) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.3, cx, cy, Math.max(rx, ry) * 2.1);
      gg.addColorStop(0, hexA(opt.glowWarna, Math.min(0.85, d.glow * 0.55)));
      gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

/** Bangun path bentuk zona di kanvas (koordinat kanvas). */
export function buatPath(
  ctx: CanvasRenderingContext2D,
  z: AudioZone,
  W: number, H: number,
  offX = 0, offY = 0,
): void {
  const cx = z.x * W + offX, cy = z.y * H + offY;
  const rx = z.rx * W, ry = z.ry * H;
  ctx.beginPath();
  if (z.shape === "polygon" && z.points && z.points.length >= 3) {
    ctx.moveTo(z.points[0].x * W + offX, z.points[0].y * H + offY);
    for (let i = 1; i < z.points.length; i++) ctx.lineTo(z.points[i].x * W + offX, z.points[i].y * H + offY);
    ctx.closePath();
  } else {
    ctx.ellipse(cx, cy, Math.max(2, rx), Math.max(2, ry), z.rotation, 0, Math.PI * 2);
  }
}

function hexA(h: string, a: number): string {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  if (isNaN(n)) return `rgba(120,120,130,${clamp01(a).toFixed(3)})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(a).toFixed(3)})`;
}
