/* =====================================================================
   PEMBUNGKUS BARIS LIRIK (v19.41) — 100% orisinal, MURNI (bisa diuji)
   Masalah: lirik satu baris kepanjangan → melebar keluar video.
   Solusi: bagi kata menjadi maks 2 baris (wrap) yang muat dalam maxW.
   ===================================================================== */

/**
 * Bagi indeks kata menjadi kelompok baris. Setiap kelompok lebarnya ≤ maxW
 * (kecuali satu kata doang yang memang lebih lebar dari maxW).
 * @param widths lebar tiap kata (hasil measureText)
 * @param gap jarak antar kata
 * @param maxW lebar maksimum satu baris
 * @param maksBaris maksimum jumlah baris
 */
export function wrapIndices(widths: number[], gap: number, maxW: number, maksBaris = 2): number[][] {
  if (!widths.length) return [];
  const groups: number[][] = [];
  let cur: number[] = [];
  let curW = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] + (cur.length ? gap : 0);
    if (cur.length && curW + w > maxW && groups.length < maksBaris - 1) {
      groups.push(cur);
      cur = [i];
      curW = widths[i];
    } else {
      cur.push(i);
      curW += w;
    }
  }
  if (cur.length) groups.push(cur);
  // satu kata doang yang lebih lebar dari maxW — biarkan (jarang), jangan pecah kata
  return groups;
}

/** Lebar total satu kelompok indeks. */
export function lebarGroup(widths: number[], idx: number[], gap: number): number {
  return idx.reduce((a, i) => a + widths[i], 0) + gap * Math.max(0, idx.length - 1);
}

/** Skala font presisi agar SEMUA baris muat dalam maxW (tanpa clamp bawah —
 *  kalau butuh 0.3 ya 0.3, biar tidak pernah keluar video). */
export function skalaAgarMuat(widths: number[], groups: number[][], gap: number, maxW: number): number {
  let maxG = 0;
  for (const g of groups) maxG = Math.max(maxG, lebarGroup(widths, g, gap));
  if (maxG <= maxW) return 1;
  return maxW / maxG;
}
