import { NextRequest, NextResponse } from "next/server";
import { tarikBarisKredit, agregatRingkas } from "../../../lib/ledger";

/**
 * 🧾 L3 — DASBOR KREDIT MINI buat BOS (bukan buat user biasa).
 * Buka dari HP: /api/kredit-ringkas?kunci=<KREDIT_ADMIN_KEY>&hari=14
 * Tambah &format=json kalau mau data mentah.
 * Wajib set env KREDIT_ADMIN_KEY di Vercel; kalau belum → rute ini kasih instruksi.
 */
export const dynamic = "force-dynamic";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function esc(s: any) { return String(s ?? "").replace(/[&<>"]/g, (c) => ESC[c] ?? c); }

export async function GET(req: NextRequest) {
  const kunciBenar = process.env.KREDIT_ADMIN_KEY;
  const url = new URL(req.url);
  const kunci = url.searchParams.get("kunci") || "";
  const hari = Math.min(Math.max(parseInt(url.searchParams.get("hari") || "14", 10) || 14, 1), 90);
  const mauJson = url.searchParams.get("format") === "json";

  if (!kunciBenar) {
    return new NextResponse(
      "KREDIT_ADMIN_KEY belum di-set. Isi dulu di Vercel → Settings → Environment Variables, " +
      "lalu buka: /api/kredit-ringkas?kunci=<isinya>",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  if (kunci !== kunciBenar) return NextResponse.json({ error: "kunci salah" }, { status: 401 });

  const hasil = await tarikBarisKredit(hari);
  if (!hasil.siap) {
    return new NextResponse(`Ledger belum siap: ${hasil.alasan}\n\n` +
      "Kalau pesannya soal tabel → jalankan supabase-jalankan-sekali.sql di Supabase SQL Editor (sekali saja).",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const r = agregatRingkas(hasil.baris || []);
  if (mauJson) return NextResponse.json({ hari, ...r });

  const ikon: Record<string, string> = { teks: "✍️", gambar: "🎨", "suara-tts": "🎙", video: "🎬", musik: "🎵", lainnya: "🧩" };
  const barisFitur = Object.entries(r.perFitur)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([f, v]) => `<tr><td>${ikon[f] || "🧩"} ${esc(f)}</td><td>${v.total}</td><td class="ok">${v.ok}</td>` +
      `<td class="${v.gagal ? "bad" : ""}">${v.gagal}</td><td>${v.ok ? Math.round(v.msTotal / v.ok / 100) / 10 + "d" : "—"}</td>` +
      `<td>${v.total ? Math.round((v.gagal / v.total) * 100) : 0}%</td></tr>`).join("");
  const barisHari = Object.entries(r.perHari).sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 21)
    .map(([t, v]) => `<tr><td>${esc(t)}</td><td>${v.total}</td><td class="${v.gagal ? "bad" : ""}">${v.gagal}</td></tr>`).join("");

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verve — Dasbor Kredit</title>
<style>
  body{background:#0b0d12;color:#e8ebf2;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#8b93a7;margin:0 0 16px}
  .kartu{background:#141824;border:1px solid #232a3d;border-radius:14px;padding:14px;margin:0 0 14px}
  .angka{font-size:28px;font-weight:800} .ok{color:#37d67a}.bad{color:#ff5d5d}
  table{width:100%;border-collapse:collapse} td,th{padding:7px 6px;text-align:left;border-bottom:1px solid #1d2436}
  th{color:#8b93a7;font-weight:600;font-size:12px} tr:last-child td{border-bottom:0}
</style></head><body>
<h1>🧾 Dasbor Kredit Verve</h1>
<p class="sub">${hari} hari terakhir · diperbarui ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · hanya bos yang bisa lihat halaman ini</p>
<div class="kartu"><span class="angka">${r.totalSemua}</span> panggilan AI · <span class="${r.gagalSemua ? "bad" : "ok"}">${r.gagalSemua} gagal</span></div>
<div class="kartu"><table><tr><th>Fitur</th><th>Pakai</th><th>OK</th><th>Gagal</th><th>Rata²</th><th>%Gagal</th></tr>${barisFitur || '<tr><td colspan="6">Belum ada panggilan tercatat</td></tr>'}</table></div>
<div class="kartu"><table><tr><th>Tanggal</th><th>Panggilan</th><th>Gagal</th></tr>${barisHari || '<tr><td colspan="3">—</td></tr>'}</table></div>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
