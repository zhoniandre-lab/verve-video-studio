/* =====================================================================
   BOT BURUAN AI — PARSER SUMBER EKSTERNAL (v19.35) — 100% orisinal
   Mengurai README dari repo kurasi komunitas (free-for-dev,
   awesome-free-llm-apis, free-ai-tools) jadi item buruan.
   Semua fungsi MURNI (input teks → output array) — mudah diuji.
   ===================================================================== */
import type { BuruanItem, KategoriId, JenisGratis } from "./types";

export interface Mentah {
  nama: string; url: string; gratis: string; kategori: KategoriId; jenis: JenisGratis; syarat: string; mudah: number; desc: string; sumber: string;
  baseUrl?: string;
}

/** Bersihkan nama item dari markdown link "[Nama](url) - deskripsi" */
export function pisahLink(bullet: string): { nama: string; url: string; desc: string } {
  const m = bullet.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!m) return { nama: bullet.trim(), url: "", desc: "" };
  const sisa = bullet.replace(m[0], "").replace(/^[\s\-–:]+/, "").trim();
  return { nama: m[1].trim(), url: m[2].trim(), desc: sisa };
}

/** Tebak kategori dari teks deskripsi/nama — murni heuristik. */
export function tebakKategori(teks: string): KategoriId {
  const t = teks.toLowerCase();
  if (/video|animation|animate|image-to-video|text-to-video|kling|runway|pika|hailuo|luma/.test(t)) return "gambar-video";
  if (/tts|voice|speech|narration|read aloud/.test(t)) return "suara";
  if (/music|song|audio|sing/.test(t)) return "musik";
  if (/image|photo|picture|art|draw|generate image/.test(t)) return "gambar";
  if (/llm|chat|language model|gpt|api|completion|inference|token/.test(t)) return "chat";
  return "lain";
}

/** Tebak jenis gratis dari teks: permanen/harian/mingguan/bulanan/sekali. */
export function tebakJenis(teks: string): JenisGratis {
  const t = teks.toLowerCase();
  if (/daily|per day|hari/.test(t)) return "harian";
  if (/weekly|minggu/.test(t)) return "mingguan";
  if (/monthly|per month|bulan/.test(t)) return "bulanan";
  if (/trial|once|one-time|sekali|welcome|signup/.test(t)) return "sekali";
  return "permanen";
}

/** Skor kemudahan 1..5 dari teks (murni, diuji). */
export function skorMudah(teks: string): number {
  const t = teks.toLowerCase();
  let s = 3;
  if (/no credit card|tanpa kartu|free signup|email|github account|google account/.test(t)) s += 2;
  // hukuman kartu HANYA kalau bukan "no credit card" (kata "no" membatalkan)
  if (/credit card required|kartu kredit/.test(t) && !/no credit card|tanpa kartu/.test(t)) s -= 2;
  if (/trial|limited|waitlist/.test(t)) s -= 1;
  return Math.max(1, Math.min(5, s));
}

const GITHUB_RAW = "https://raw.githubusercontent.com";

/** Sumber-sumber kurasi komunitas yang disinkronkan (server-side, anti-CORS). */
export const SUMBER_EKSTERNAL = [
  { id: "awesome-free-llm-apis", label: "awesome-free-llm-apis (mnfst)", url: `${GITHUB_RAW}/mnfst/awesome-free-llm-apis/main/README.md` },
  { id: "free-for-dev", label: "free-for-dev (ripienaar)", url: `${GITHUB_RAW}/ripienaar/free-for-dev/master/README.md` },
  { id: "free-ai-tools", label: "free-ai-tools (ShaikhWarsi)", url: `${GITHUB_RAW}/ShaikhWarsi/free-ai-tools/main/README.md` },
  { id: "awesome-image-to-video", label: "awesome-image-to-video (wqooops)", url: `${GITHUB_RAW}/wqooops/awesome-image-to-video/main/README.md` },
  { id: "awesome-ai-tools-video", label: "awesome-ai-tools/Video.md (tankvn)", url: `${GITHUB_RAW}/tankvn/awesome-ai-tools/main/Video.md` },
];

/** Batas ukuran teks yang diambil (README raksasa) */
export const MAKS_BYTE = 2_000_000;

/** 1) awesome-free-llm-apis: ambil bagian "## Provider APIs" / "## Inference providers",
 *  baris "### Nama", "Free ...", "Base URL: ..." */
export function parseAwesomeFreeLlmApis(teks: string): Mentah[] {
  const out: Mentah[] = [];
  const lines = teks.split(/\r?\n/);
  let seksi = "";
  let nama = "";
  let gratis = "";
  let base = "";
  for (const raw of lines) {
    const line = raw.trim();
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      if (nama && gratis) {
        out.push(buatMentah(nama, gratis, base, seksi, "awesome-free-llm-apis"));
      }
      // 🐛 FIX: heading bisa berupa "[Nama](url)" → ambil nama & url-nya
      const hteks = h3[1].replace(/[🇺🇸🇩🇪🇨🇦🇮🇳🇸🇬🇫🇷🇬🇧🇯🇵🇰🇷]+/g, "");
      const hl = hteks.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (hl) {
        nama = hl[1].trim();
        base = hl[2].trim().startsWith("http") ? hl[2].trim() : "";
      } else {
        nama = hteks.trim();
        base = "";
      }
      gratis = ""; base = base || "";
    } else if (/^##\s+/.test(line)) {
      seksi = line.replace(/^##\s+/, "").trim();
    } else if (nama) {
      const b = line.match(/Base URL:\s*`?([^`\s]+)`?/);
      if (b) base = b[1].replace(/`/g, "");
      if (/free/i.test(line) && line.length < 200 && !line.startsWith("|")) {
        if (!gratis) gratis = line.replace(/^[-•*]\s*/, "");
        else gratis += " · " + line.replace(/^[-•*]\s*/, "").slice(0, 80);
      }
    }
  }
  if (nama && gratis) out.push(buatMentah(nama, gratis, base, seksi, "awesome-free-llm-apis"));
  return out;
}

/** 2) free-for-dev: cari bagian "## AI" / "## Machine Learning", parse bullet "- [Nama](url) - desc" */
export function parseFreeForDev(teks: string): Mentah[] {
  const out: Mentah[] = [];
  const lines = teks.split(/\r?\n/);
  let diAi = false;
  for (const raw of lines) {
    const line = raw.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const judul = h2[1].toLowerCase();
      diAi = /ai|machine learning|deep learning|llm|generative/.test(judul);
      continue;
    }
    if (!diAi) continue;
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!bullet) continue;
    const { nama, url, desc } = pisahLink(bullet[1]);
    if (!url || !/^https?:/.test(url)) continue;
    const gabung = `${nama} ${desc}`;
    if (!/free|trial|no credit/.test(gabung.toLowerCase())) continue;
    out.push({
      nama: nama.slice(0, 60), url, desc: desc.slice(0, 200), kategori: tebakKategori(gabung),
      jenis: tebakJenis(gabung), syarat: /no credit card/i.test(gabung) ? "Tanpa kartu" : "Cek di situs",
      mudah: skorMudah(gabung), gratis: (desc || nama).slice(0, 160), sumber: "free-for-dev",
    });
  }
  return out;
}

/** 3) free-ai-tools: parse tabel markdown "| Tool | ... | Free ... | ... |" + baris bullet biasa */
export function parseFreeAiTools(teks: string): Mentah[] {
  const out: Mentah[] = [];
  const lines = teks.split(/\r?\n/);
  let nama = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("|") && !line.startsWith("| ---") && !line.startsWith("|--")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2 && cells[0] !== "Tool" && cells[0] !== "Tools") {
        const [tool, ...sisa] = cells;
        // kolom terakhir sering "No" = tanpa kartu → dihitung gratis
        const kartu = sisa[sisa.length - 1] || "";
        const tanpaKartu = /^no$/i.test(kartu);
        const gabung = sisa.join(" ").toLowerCase();
        if (/free|credit/i.test(gabung) || tanpaKartu) {
          out.push({
            nama: tool.replace(/`/g, "").slice(0, 60), url: "",
            desc: sisa.join(" · ").slice(0, 200),
            gratis: sisa.join(" · ").slice(0, 160),
            kategori: tebakKategori(tool + " " + gabung),
            jenis: tebakJenis(gabung), syarat: tanpaKartu ? "Tanpa kartu" : "Cek di situs",
            mudah: skorMudah(tanpaKartu ? gabung + " no credit card" : gabung), sumber: "free-ai-tools",
          });
        }
      }
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) { nama = h[1]; continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!bullet || !/free/i.test(bullet[1])) continue;
    const { nama: nm, url, desc } = pisahLink(bullet[1]);
    if (!url || !/^https?:/.test(url)) continue;
    const gabung = `${nm} ${desc}`;
    out.push({
      nama: nm.slice(0, 60), url, desc: desc.slice(0, 200), gratis: (desc || nm).slice(0, 160),
      kategori: tebakKategori(gabung), jenis: tebakJenis(gabung),
      syarat: /no credit card/i.test(gabung) ? "Tanpa kartu" : "Cek di situs",
      mudah: skorMudah(gabung), sumber: "free-ai-tools",
    });
  }
  return out;
}

/** 4) awesome-image-to-video: tabel markdown
 *  | # | Name | URL | Description | Free tier summary | */
export function parseI2vTable(teks: string): Mentah[] {
  const out: Mentah[] = [];
  const lines = teks.split(/\r?\n/);
  let diTabel = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("| #") || line.startsWith("|#")) { diTabel = true; continue; }
    if (diTabel && line.startsWith("|") && !line.includes("---")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 5) {
        const [, nama, url, desc, gratis] = cells;
        if (/^https?:/.test(url)) {
          const gabung = `${nama} ${desc} ${gratis}`;
          out.push({
            nama: nama.slice(0, 60), url, desc: desc.slice(0, 200),
            gratis: gratis.slice(0, 160), kategori: "gambar-video",
            jenis: tebakJenis(gabung + " " + gratis),
            syarat: /no credit card/i.test(gabung) ? "Tanpa kartu" : "Cek di situs",
            mudah: skorMudah(gabung), sumber: "awesome-image-to-video",
          });
        }
      }
    }
  }
  return out;
}

/** 5) awesome-ai-tools (tankvn): bullet "- [Nama](url) - desc.. [Tag]"
 *  Tag: Free / Freemium / Free Trial / Paid → hanya yang gratis masuk. */
export function parseAwesomeAiTools(teks: string): Mentah[] {
  const out: Mentah[] = [];
  const lines = teks.split(/\r?\n/);
  let judul = "";
  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^#{2,3}\s+(.+)$/);
    if (h) { judul = h[1].trim(); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!bullet) continue;
    const tag = (line.match(/\[(Free|Freemium|Free Trial)\]/i) || [])[1];
    if (!tag) continue;
    const { nama, url, desc } = pisahLink(bullet[1]);
    if (!url || !/^https?:/.test(url)) continue;
    const gabung = `${nama} ${desc} ${judul} ${tag}`;
    out.push({
      nama: nama.slice(0, 60), url, desc: desc.slice(0, 200), gratis: `${tag} — ${(desc || nama).slice(0, 130)}`,
      kategori: tebakKategori(gabung), jenis: tebakJenis(gabung),
      syarat: "Cek di situs", mudah: skorMudah(gabung), sumber: "awesome-ai-tools",
    });
  }
  return out;
}

function buatMentah(nama: string, gratis: string, base: string, seksi: string, sumber: string): Mentah {
  const gabung = `${nama} ${gratis} ${seksi}`;
  return {
    nama: nama.slice(0, 60),
    url: /^https?:/.test(nama) ? nama : "",
    desc: (gratis + (seksi ? ` (bagian ${seksi})` : "")).slice(0, 220),
    gratis: gratis.slice(0, 160),
    kategori: tebakKategori(gabung),
    jenis: tebakJenis(gabung),
    syarat: /no credit card/i.test(gabung) ? "Tanpa kartu" : "Cek di situs",
    mudah: skorMudah(gabung),
    sumber,
    baseUrl: base || undefined,
  };
}

/** Dedupe item hasil parse — sama nama+url disatukan, prefer yang punya base URL. */
export function dedupeMentah(list: Mentah[]): Mentah[] {
  const seen = new Map<string, Mentah>();
  for (const m of list) {
    const kunci = (m.nama + "|" + m.url).toLowerCase();
    const lama = seen.get(kunci);
    if (!lama || (m.url && !lama.url)) seen.set(kunci, m);
  }
  return [...seen.values()];
}

/** Ubah Mentah → BuruanItem (id stabil dari nama). */
export function mentahKeItem(m: Mentah, now = Date.now()): BuruanItem {
  const id = "src_" + m.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "_" + (m.url ? m.url.length : 0);
  return {
    id, nama: m.nama, url: m.url, kategori: m.kategori, gratis: m.gratis, jenis: m.jenis,
    syarat: m.syarat, mudah: m.mudah, desc: m.desc, baseUrl: m.baseUrl,
    tutorial: m.url
      ? [{ t: `Buka situs (tombol di atas) — daftar & klaim gratisnya sesuai petunjuk situs.` }, { t: `Kalau OpenAI-compatible & dapat API key → simpan ke Dompet Bansos Verve.` }]
      : [{ t: `Cari tahu lewat nama "${m.nama}" di mesin pencari — dapatkan tautan resminya.` }],
    sumber: m.sumber, dicek: now,
  };
}

/** Gabung: kurasi dulu, lalu item sumber (yang belum ada di kurasi).
 *  Item "lain" dari sumber TANPA url dibuang (kebanyakan baris tabel gagal
 *  dapat kategori → noise). Sisanya tetap masuk. */
export function gabungItems(kurasi: BuruanItem[], mentah: Mentah[], now = Date.now()): BuruanItem[] {
  const ada = new Set(kurasi.map((k) => k.nama.toLowerCase()));
  const items = [...kurasi];
  for (const m of dedupeMentah(mentah)) {
    const kunci = m.nama.toLowerCase();
    if (ada.has(kunci)) continue;
    // jangan masukkan nama aneh (baris yang gagal di-parse)
    if (kunci.length < 3 || /^\d+$/.test(kunci)) continue;
    if (m.kategori === "lain" && !m.url) continue;
    items.push(mentahKeItem(m, now));
    ada.add(kunci);
  }
  return items;
}
