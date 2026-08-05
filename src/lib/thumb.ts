/* ============================================================
   🖼 v13.8 THUMBNAIL OTOMATIS — OTAK & PSIKOLOGI (100% orisinal VERVE)
   Perkembangan dari v13.7, kini thumbnail "membaca & menghitung":
   - MEMBACA adegan: ukur luminansi sisi kiri vs kanan pakai getImageData,
     teks otomatis ditaruh di sisi yang LEBIH GELAP (kontras = mata langsung nangkap)
   - KEKUATAN SCRIM DIHITUNG dari luminansi adegan (makin terang fotonya,
     makin pekat gradasinya — teks tak pernah tenggelam)
   - Font WAH: Anton (font klasik thumbnail CTR, sudah dimuat aplikasi, OFL)
   - Tetap: maks 2–3 kata emosional + pil niche merah + vinyet fokus
   ============================================================ */

import { ensureFontsLoaded } from "./editing";

const STOPWORDS = new Set(
  ("yang dan di ke dari untuk dengan ini itu mu ku nya aku kamu kau kita kami mereka dia ia atau pada dalam tak tidak bukan " +
   "masih akan sudah telah karena agar saat ketika adalah menjadi ada juga pun para sang si oleh buat setelah sebelum sampai " +
   "hingga tetapi namun serta yaitu ialah punya ter cerita jadi lagu official music video lyric lirik lyrics full album hd").split(" "),
);
const EMO = new Set(
  ("ibu ayah mama papa bapak bunda sedih nangis menangis rindu kangen pergi perpisahan pisah cerai sakit hilang terakhir tersimpan " +
   "baju rumah doa doaku cinta hancur patah sendiri sepi luka pengorbanan maaf ampun pulang meninggal kenangan air mata bahagia janji " +
   "anak anakku istri suami kakek nenek sahabat teman perjuangan janda duda miskin kaya hutang utang").split(" "),
);

/** Pilih 2–3 kata paling kuat dari judul (bagian sebelum "|"). salt = kocokan urutan. */
export function pickPowerWords(title: string, salt = 0): string[] {
  const main = ((title || "").split("|")[0] || title || "").trim();
  const words = main.replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter(Boolean);
  const cands = words.filter((w) => !STOPWORDS.has(w.toLowerCase()) && w.length > 1);
  const scored = cands.map((w, i) => ({
    w,
    s: (EMO.has(w.toLowerCase()) ? 100 : 0) + Math.min(30, w.length * 3) + (cands.length - i),
  }));
  scored.sort((a, b) => b.s - a.s || a.w.localeCompare(b.w));
  let top = scored.slice(0, 3).map((x) => x.w.toUpperCase());
  if (!top.length) top = ["KISAH", "PALING", "MENYENTUH"];
  if (top.length === 1) top = [top[0], "😭"];
  if (salt > 0 && top.length > 1) { const r = top.shift()!; top.splice(salt % (top.length + 1), 0, r); }
  return top;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Font tampilan WAH untuk thumbnail (Anton = legenda CTR; Bebas untuk pil niche). */
const THUMB_FONT_BIG = "'Anton',Impact,sans-serif";
const THUMB_FONT_KICK = "'Bebas Neue',Impact,sans-serif";

/** Gambar thumbnail ke context (panggil dengan canvas 1280×720). img boleh null → latar gradien gelap.
 *  preferSide (opsional, L5): paksa sisi teks ("left"/"right") — bila tidak diisi, otak luminansi tetap yang memutuskan (perilaku lama utuh).
 *  opsi (opsional, L5.2/L5.3): teksKustom (baris manual), fontFam, skala (pengali besar huruf),
 *      anchorX/anchorY (0..1 — titik bebas hasil geser jari; bila diisi, sisi & posisi bawaan ditimpa). Tanpa opsi → perilaku lama 100% utuh. */
export function drawAutoThumb(ctx: CanvasRenderingContext2D, W: number, H: number, img: CanvasImageSource | null, title: string, niche: string, salt = 0, preferSide?: "left" | "right", opsi?: { teksKustom?: string[]; fontFam?: string; skala?: number; anchorX?: number; anchorY?: number }) {
  // 1) Latar: foto adegan cover-fit
  if (img) {
    const iw = (img as any).naturalWidth || (img as any).width || W;
    const ih = (img as any).naturalHeight || (img as any).height || H;
    const sc = Math.max(W / iw, H / ih), dw = iw * sc, dh = ih * sc;
    try { ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
    catch { ctx.fillStyle = "#12141c"; ctx.fillRect(0, 0, W, H); }
  } else {
    const g0 = ctx.createLinearGradient(0, 0, W, H);
    g0.addColorStop(0, "#1e293b"); g0.addColorStop(1, "#0f172a");
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
  }

  // 2) 🧠 BACA GAMBARNYA — luminansi kiri vs kanan → teks ke sisi gelap, scrim dihitung
  let leftDark = true, scrimA = 0.8;
  try {
    const wHalf = (W / 2) | 0;
    const d1 = ctx.getImageData(0, 0, wHalf, H).data;
    const d2 = ctx.getImageData(wHalf, 0, W - wHalf, H).data;
    const lum = (d: Uint8ClampedArray) => {
      let acc = 0, n = 0;
      for (let i = 0; i < d.length; i += 256) { acc += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
      return n ? acc / n : 128;
    };
    const L = lum(d1), R = lum(d2);
    leftDark = preferSide === "left" ? true : preferSide === "right" ? false : L <= R;
    const dl = Math.min(L, R);
    scrimA = Math.max(0.58, Math.min(0.95, 0.5 + (dl / 255) * 0.6)); // adegan makin terang → scrim makin pekat
  } catch { /* canvas tainted → pakai default aman */ }

  // 2b) ⚓ JANGKAR BEBAS (L5.3) — hasil geser jari: jika ada, sisi teks & scrim mengikutinya
  const anchor = (typeof opsi?.anchorX === "number" && typeof opsi?.anchorY === "number")
    ? { x: Math.min(0.95, Math.max(0.05, opsi.anchorX)), y: Math.min(0.95, Math.max(0.12, opsi.anchorY)) }
    : null;
  if (anchor) leftDark = anchor.x < 0.5;

  // 3) Gradien gelap dari sisi gelap (arah mengikuti hasil hitungan)
  const gx0 = leftDark ? 0 : W, gx1 = leftDark ? W * 0.8 : W * 0.2;
  const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
  g.addColorStop(0, `rgba(4,7,14,${scrimA.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(4,7,14,${(scrimA * 0.7).toFixed(3)})`); // v19.10.1: scrim lebih pekat biar teks nempel di gambar terang
  g.addColorStop(1, "rgba(4,7,14,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const gb = ctx.createLinearGradient(0, H * 0.55, 0, H);
  gb.addColorStop(0, "rgba(4,7,14,0)"); gb.addColorStop(1, "rgba(4,7,14,0.78)"); // v19.10.1: dasar bawah lebih pekat
  ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);

  const align: CanvasTextAlign = anchor ? "center" : leftDark ? "left" : "right";
  const tx = anchor ? anchor.x * W : leftDark ? W * 0.045 : W * 0.955;
  ctx.textAlign = align;

  // 4) Pil niche merah (branding ala kartu penting — kontras bikin berhenti scrolling)
  const kick = (niche || "cerita jadi lagu").toUpperCase().slice(0, 26);
  const kfs = Math.round(H * 0.045);
  ctx.font = `${kfs}px ${THUMB_FONT_KICK}`;
  ctx.textBaseline = "middle";
  const kw = ctx.measureText(kick).width;
  const kx = leftDark ? W * 0.045 : W * 0.955 - kw - H * 0.07;
  ctx.fillStyle = "#e11d48";
  rr(ctx, kx, H * 0.055, kw + H * 0.07, H * 0.088, H * 0.044); ctx.fill();
  // v19.10.1: stroke hitam tipis di badge — nempel di gambar terang, nggak "mengambang"
  ctx.strokeStyle = "rgba(4,7,14,0.85)"; ctx.lineWidth = Math.max(3, H * 0.008); ctx.lineJoin = "round";
  rr(ctx, kx, H * 0.055, kw + H * 0.07, H * 0.088, H * 0.044); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText(kick, kx + H * 0.035, H * 0.055 + H * 0.047);

  // 5) Kata-kata raksasa — ANTON (psikologi: huruf condensed tebal = terbaca sekejap di feed)
  const kustom = opsi?.teksKustom && opsi.teksKustom.length ? opsi.teksKustom.slice(0, 3) : null;
  const words = kustom || pickPowerWords(title, salt);
  const bigFam = opsi?.fontFam || THUMB_FONT_BIG;
  const maxW = W * 0.62;
  let fs = Math.round(H * 0.17 * (opsi?.skala || 1));
  ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
  const fits = (size: number) => { ctx.font = `${size}px ${bigFam}`; return words.every((w) => ctx.measureText(w).width <= maxW); };
  while (fs > 30 && !fits(fs)) fs -= 4;
  ctx.font = `${fs}px ${bigFam}`;
  const emoHit = words.some((w) => EMO.has(w.toLowerCase()));
  let y = (anchor ? anchor.y * H : H - H * 0.06) - (words.length - 1) * fs * 1.06;
  words.forEach((w, i) => {
    // v19.10.1: stroke & shadow lebih tegas — teks "nancap" di gambar terang & feed
    ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = fs * 0.24; ctx.shadowOffsetY = fs * 0.06;
    ctx.strokeStyle = "#0b0f1a"; ctx.lineWidth = fs * 0.17;
    ctx.strokeText(w, tx, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // dua nada: kata pertama GRADIENT kuning→oranye (urgensi menyala), sisanya putih-bersih
    if (i === 0) {
      const gy = ctx.createLinearGradient(tx, y - fs, tx, y);
      gy.addColorStop(0, "#ffe600"); gy.addColorStop(0.55, "#ffb300"); gy.addColorStop(1, "#ff8c00");
      ctx.fillStyle = gy;
    } else {
      ctx.fillStyle = "#ffffff";
    }
    ctx.fillText(w, tx, y);
    y += fs * 1.06;
  });
  if (!kustom && emoHit && !words[words.length - 1].includes("😭")) { ctx.font = `${Math.round(fs * 0.68)}px system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText("😭", tx, y - fs * 0.28); }

  // 6) Vinyet fokus halus
  const rad = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 1.05);
  rad.addColorStop(0, "rgba(0,0,0,0)"); rad.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
}

/** Rakit thumbnail → Blob JPEG 1280×720 siap download/upload YouTube. */
export async function makeAutoThumbBlob(img: CanvasImageSource | null, title: string, niche: string, salt = 0): Promise<Blob> {
  try { await ensureFontsLoaded(); } catch {} // pastikan Anton/Bebas sudah dimuat sebelum menggambar
  const cv = document.createElement("canvas");
  cv.width = 1280; cv.height = 720;
  const ctx = cv.getContext("2d")!;
  drawAutoThumb(ctx, 1280, 720, img, title, niche, salt);
  return await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("gagal membuat thumbnail"))), "image/jpeg", 0.92));
}
