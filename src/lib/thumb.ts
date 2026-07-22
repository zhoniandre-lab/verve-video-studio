/* ============================================================
   🖼 v13.7 THUMBNAIL OTOMATIS (100% kode orisinal VERVE)
   Merakit thumbnail YouTube 1280×720 dari judul terkunci +
   adegan video. Prinsip psikologi CTR yang dipakai:
   - Maks 2–3 kata EMOSIONAL ukuran raksasa (otak baca < 1 detik)
   - Kuning peringatan (#ffd60a) di atas gelap = magnet mata
   - Gradien gelap di kiri → teks kebaca tanpa nutupin wajah/adegan
   - Pil niche merah kiri-atas = sinyal "penting" ala breaking news
   ============================================================ */

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

/** Gambar thumbnail ke context (panggil dengan canvas 1280×720). img boleh null → latar gradien gelap. */
export function drawAutoThumb(ctx: CanvasRenderingContext2D, W: number, H: number, img: CanvasImageSource | null, title: string, niche: string, salt = 0) {
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
  // 2) Gradien gelap dari kiri (teks kebaca, kanan tetap pamer adegan)
  const g = ctx.createLinearGradient(0, 0, W * 0.8, 0);
  g.addColorStop(0, "rgba(4,7,14,0.88)"); g.addColorStop(0.55, "rgba(4,7,14,0.45)"); g.addColorStop(1, "rgba(4,7,14,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const gb = ctx.createLinearGradient(0, H * 0.55, 0, H);
  gb.addColorStop(0, "rgba(4,7,14,0)"); gb.addColorStop(1, "rgba(4,7,14,0.72)");
  ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);
  // 3) Pil niche merah kiri-atas
  const kick = (niche || "cerita jadi lagu").toUpperCase().slice(0, 26);
  const kfs = Math.round(H * 0.038);
  ctx.font = `800 ${kfs}px system-ui, sans-serif`;
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const kw = ctx.measureText(kick).width;
  ctx.fillStyle = "#e11d48";
  rr(ctx, W * 0.045, H * 0.055, kw + H * 0.07, H * 0.085, H * 0.042); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(kick, W * 0.045 + H * 0.035, H * 0.055 + H * 0.046);
  // 4) Kata-kata raksasa (auto-fit lebar, stroke gelap tebal biar terbaca di HP kecil)
  const words = pickPowerWords(title, salt);
  const maxW = W * 0.62;
  let fs = Math.round(H * 0.155);
  ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
  const fits = (size: number) => { ctx.font = `900 ${size}px system-ui, sans-serif`; return words.every((w) => ctx.measureText(w).width <= maxW); };
  while (fs > 30 && !fits(fs)) fs -= 4;
  ctx.font = `900 ${fs}px system-ui, sans-serif`;
  const emoHit = words.some((w) => EMO.has(w.toLowerCase()));
  let y = H - H * 0.06 - (words.length - 1) * fs * 1.1;
  words.forEach((w, i) => {
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = fs * 0.18; ctx.shadowOffsetY = fs * 0.05;
    ctx.strokeStyle = "#0b0f1a"; ctx.lineWidth = fs * 0.16;
    ctx.strokeText(w, W * 0.045, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = i === 0 ? "#ffd60a" : "#ffffff";
    ctx.fillText(w, W * 0.045, y);
    y += fs * 1.1;
  });
  if (emoHit && !words[words.length - 1].includes("😭")) { ctx.font = `${Math.round(fs * 0.72)}px system-ui, sans-serif`; ctx.fillText("😭", W * 0.045, y - fs * 0.3); }
  // 5) Vinyet fokus halus
  const rad = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 1.05);
  rad.addColorStop(0, "rgba(0,0,0,0)"); rad.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
}

/** Rakit thumbnail → Blob JPEG 1280×720 siap download/upload YouTube. */
export async function makeAutoThumbBlob(img: CanvasImageSource | null, title: string, niche: string, salt = 0): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = 1280; cv.height = 720;
  const ctx = cv.getContext("2d")!;
  drawAutoThumb(ctx, 1280, 720, img, title, niche, salt);
  return await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("gagal membuat thumbnail"))), "image/jpeg", 0.92));
}
