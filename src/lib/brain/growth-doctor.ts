/* 🩺 VERVE GROWTH DOCTOR v1
   Diagnosis performa YouTube/Shorts berbasis metrik manual. Tidak mengarang angka.
   Tujuan: jawab Kenapa → Kok Bisa → Seharusnya → Aksi. */

export type GrowthMode = "long" | "shorts" | "reels";
export type GrowthLevel = "ok" | "warn" | "danger" | "unknown";

export type GrowthInput = {
  mode?: GrowthMode;
  title?: string;
  niche?: string;
  views?: number;
  impressions?: number;
  ctrPct?: number;
  durationSec?: number;
  avgViewSec?: number;
  retention30Pct?: number;
  likes?: number;
  comments?: number;
  subs?: number;
  uploadAgeHours?: number;
  symptom?: string;
};

export type GrowthScore = { id: string; label: string; value: number; level: GrowthLevel; note: string };
export type GrowthAction = { id: string; title: string; detail: string; cta: string; priority: number };
export type GrowthDiagnosis = {
  status: { level: GrowthLevel; title: string; summary: string };
  derived: { ctrPct: number | null; avdPct: number | null; engagementPct: number | null; viewsPerHour: number | null };
  scores: GrowthScore[];
  kenapa: string[];
  kokBisa: string[];
  seharusnya: string[];
  actions: GrowthAction[];
  planText: string;
};

const n = (v: unknown, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(x)));
const pct = (x: number | null | undefined) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10;

function levelFromScore(s: number): GrowthLevel { return s >= 70 ? "ok" : s >= 40 ? "warn" : "danger"; }
function fmt(x: number | null, suffix = "%") { return x == null ? "?" : `${x}${suffix}`; }

export function parseClockToSec(v: string | number | undefined): number {
  if (typeof v === "number") return Math.max(0, v);
  const s = String(v || "").trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((x) => !Number.isFinite(x))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function diagnoseGrowth(input: GrowthInput): GrowthDiagnosis {
  const mode = input.mode || "long";
  const views = Math.max(0, n(input.views));
  const impressions = Math.max(0, n(input.impressions));
  const ctrGiven = n(input.ctrPct, NaN);
  const ctr = Number.isFinite(ctrGiven) && ctrGiven > 0 ? ctrGiven : (impressions > 0 ? (views / impressions) * 100 : null);
  const duration = Math.max(0, n(input.durationSec));
  const avd = Math.max(0, n(input.avgViewSec));
  const avdPct = duration > 0 && avd > 0 ? (avd / duration) * 100 : null;
  const ret30 = n(input.retention30Pct, NaN);
  const retention30 = Number.isFinite(ret30) && ret30 >= 0 ? ret30 : null;
  const engagement = views > 0 ? ((Math.max(0, n(input.likes)) + Math.max(0, n(input.comments))) / views) * 100 : null;
  const vph = n(input.uploadAgeHours) > 0 ? views / n(input.uploadAgeHours) : null;

  const ctrTarget = mode === "long" ? 5 : 7;
  const retTarget = mode === "long" ? 45 : 70;
  const avdTarget = mode === "long" ? 35 : 75;
  const ctrScore = ctr == null ? 50 : clamp((ctr / ctrTarget) * 100);
  const retScore = retention30 == null ? (avdPct == null ? 50 : clamp((avdPct / avdTarget) * 100)) : clamp((retention30 / retTarget) * 100);
  const avdScore = avdPct == null ? 50 : clamp((avdPct / avdTarget) * 100);
  const engScore = engagement == null ? 50 : clamp((engagement / 4) * 100);
  const distScore = impressions > 0 ? clamp(Math.log10(impressions + 1) * 22) : (views > 0 ? clamp(Math.log10(views + 1) * 20) : 20);

  const scores: GrowthScore[] = [
    { id: "ctr", label: "CTR / Klik", value: ctrScore, level: levelFromScore(ctrScore), note: ctr == null ? "CTR belum diisi" : `CTR ${fmt(pct(ctr))}; target awal ${ctrTarget}%+` },
    { id: "hook", label: "Hook 30 detik", value: retScore, level: levelFromScore(retScore), note: retention30 == null ? "Retention 30d belum diisi" : `Retention 30d ${fmt(pct(retention30))}; target ${retTarget}%+` },
    { id: "avd", label: mode === "long" ? "Avg View" : "Completion", value: avdScore, level: levelFromScore(avdScore), note: avdPct == null ? "AVD belum diisi" : `AVD ${fmt(pct(avdPct))} dari durasi` },
    { id: "eng", label: "Engagement", value: engScore, level: levelFromScore(engScore), note: engagement == null ? "Like/comment belum cukup" : `Engagement ${fmt(pct(engagement))}` },
    { id: "dist", label: "Distribusi", value: distScore, level: levelFromScore(distScore), note: impressions ? `${impressions.toLocaleString("id-ID")} impressions` : "Impressions belum diisi" },
  ];

  const kenapa: string[] = [];
  const kokBisa: string[] = [];
  const seharusnya: string[] = [];
  const actions: GrowthAction[] = [];

  const lowCtr = ctr != null && ctr < 3;
  const weakCtr = ctr != null && ctr >= 3 && ctr < ctrTarget;
  const lowRet = retention30 != null && retention30 < 30;
  const weakRet = retention30 != null && retention30 >= 30 && retention30 < retTarget;
  const lowAvd = avdPct != null && avdPct < (mode === "long" ? 25 : 55);
  const hasImpr = impressions >= 1000;
  const lowDist = impressions > 0 && impressions < 500;

  if (views <= 0 && impressions <= 0) {
    kenapa.push("Data performa belum cukup. Isi minimal views + impressions/CTR agar diagnosis lebih tajam.");
    kokBisa.push("Tanpa impressions/CTR/retention, VERVE belum bisa membedakan masalah packaging, distribusi, atau hook.");
    seharusnya.push("Ambil angka dari YouTube Studio: impressions, CTR, average view duration, retention 30 detik.");
    actions.push({ id: "collect", title: "Ambil data Studio", detail: "Screenshot/isi angka CTR, impressions, AVD, dan retention 30 detik.", cta: "Lengkapi data", priority: 1 });
  }

  if (lowCtr && hasImpr) {
    kenapa.push(`Views rendah terutama karena CTR ${fmt(pct(ctr))} terlalu kecil. Orang melihat thumbnail/judul, tapi tidak cukup tertarik klik.`);
    kokBisa.push("Impressions sudah ada, berarti YouTube sempat menampilkan video. Masalah paling kuat ada di packaging: thumbnail + judul.");
    seharusnya.push(`Untuk niche awal, target CTR minimal ${ctrTarget}%–8%. Ganti judul/thumbnail sebelum mengubah isi video.`);
    actions.push({ id: "thumbnail", title: "Buat thumbnail baru", detail: "Close-up emosi lebih kuat, teks 2–4 kata, kontras tinggi, satu fokus visual.", cta: "🎨 Thumbnail baru", priority: 1 });
    actions.push({ id: "title", title: "Rewrite judul", detail: "Bikin 10 judul baru: lebih spesifik, emosional, dan punya janji yang jelas.", cta: "🏷 Judul baru", priority: 2 });
  } else if (weakCtr) {
    kenapa.push(`CTR ${fmt(pct(ctr))} belum cukup kuat. Klik ada, tapi belum layak untuk scale.`);
    kokBisa.push("Judul/thumbnail mungkin sudah relevan, tapi belum punya rasa penasaran/emosi yang cukup tajam.");
    seharusnya.push(`Naikkan CTR ke ${ctrTarget}%+ lewat variasi judul dan thumbnail yang lebih kontras.`);
    actions.push({ id: "ab_packaging", title: "A/B packaging", detail: "Siapkan 3 variasi judul + 3 variasi thumbnail untuk diuji manual.", cta: "🧪 A/B packaging", priority: 2 });
  }

  if (lowRet || lowAvd) {
    kenapa.push("Penonton yang klik tidak bertahan cukup lama. Masalah ada di hook/opening atau pacing awal.");
    kokBisa.push("Isi awal kemungkinan tidak langsung memenuhi janji thumbnail/judul, intro terlalu lama, atau visual berubah terlalu lambat.");
    seharusnya.push(`Retention 30 detik ideal minimal ${retTarget}%${mode === "long" ? ", dan AVD minimal 35% dari durasi" : ", Shorts idealnya mendekati selesai tonton"}.`);
    actions.push({ id: "hook", title: "Buat hook 3 detik", detail: "Langsung buka dengan konflik/kalimat paling emosional, jangan intro panjang.", cta: "🎣 Hook baru", priority: 1 });
    actions.push({ id: "shorts", title: "Buat versi Shorts", detail: "Potong bagian paling kuat jadi 25–45 detik untuk mengangkat traffic balik.", cta: "✂️ Shorts draft", priority: 3 });
  } else if (weakRet) {
    kenapa.push("Retention belum buruk, tapi belum cukup kuat untuk dorongan rekomendasi besar.");
    kokBisa.push("Opening mungkin oke, tetapi bagian tengah butuh pattern interrupt: visual change, teks besar, atau beat shift.");
    seharusnya.push("Tambahkan perubahan visual/teks setiap 3–6 detik agar perhatian tidak turun.");
    actions.push({ id: "pacing", title: "Percepat pacing", detail: "Tambah zoom/potongan visual, kurangi jeda, dan perkuat subtitle/hook line.", cta: "⚡ Pacing", priority: 3 });
  }

  if (lowDist && !lowCtr) {
    kenapa.push("Masalah utama kemungkinan distribusi awal: impressions masih kecil, jadi YouTube belum banyak mengetes video.");
    kokBisa.push("Topik/keyword/channel authority mungkin belum cukup jelas, atau video butuh pemicu dari Shorts/komunitas eksternal.");
    seharusnya.push("Perkuat metadata, buat Shorts pendukung, dan hubungkan video ke topik/niche yang konsisten.");
    actions.push({ id: "seo", title: "Perkuat SEO", detail: "Tambahkan keyword utama di judul, 2 baris pertama deskripsi, tags, dan pinned comment.", cta: "🔎 SEO", priority: 2 });
  }

  if (engagement != null && engagement < 1 && views >= 100) {
    kenapa.push("Engagement rendah: orang menonton tapi sedikit yang memberi like/komentar/subs.");
    kokBisa.push("CTA mungkin tidak spesifik atau emosi akhir belum memancing respons.");
    seharusnya.push("Gunakan pinned comment berupa pertanyaan emosional dan CTA singkat di akhir video.");
    actions.push({ id: "pin", title: "Buat pinned comment", detail: "Tanya satu hal yang mudah dijawab, misalnya: 'Kalau ibu masih ada, apa yang ingin kamu ucapkan?'", cta: "📌 Pin comment", priority: 4 });
  }

  if (!actions.length) {
    kenapa.push("Metrik utama terlihat cukup sehat atau data belum lengkap untuk diagnosis tajam.");
    kokBisa.push("Kalau CTR dan retention sudah kuat, fokus berikutnya adalah konsistensi topik dan distribusi lintas format.");
    seharusnya.push("Scale dengan membuat seri lanjutan, Shorts pendukung, dan upload pada jam penonton aktif.");
    actions.push({ id: "scale", title: "Scale konten", detail: "Buat 3 ide lanjutan dari video ini dan jadwalkan upload berikutnya.", cta: "🚀 Scale", priority: 5 });
  }

  actions.sort((a, b) => a.priority - b.priority);
  const danger = (lowCtr && hasImpr) || lowRet || lowAvd;
  const warn = weakCtr || weakRet || lowDist;
  const status = danger
    ? { level: "danger" as GrowthLevel, title: "🚨 Masalah utama terdeteksi", summary: lowCtr && (lowRet || lowAvd) ? "CTR dan hook sama-sama lemah." : lowCtr ? "Packaging thumbnail/judul lemah." : "Hook/retention awal lemah." }
    : warn
      ? { level: "warn" as GrowthLevel, title: "⚠️ Perlu optimasi", summary: "Video punya sinyal, tapi belum cukup kuat untuk scale." }
      : { level: "ok" as GrowthLevel, title: "✅ Cukup sehat", summary: "Fokus ke konsistensi dan scale konten." };

  const planText = [
    `STATUS: ${status.title}`,
    status.summary,
    "",
    "KENAPA:", ...kenapa.map((x) => `- ${x}`),
    "",
    "KOK BISA:", ...kokBisa.map((x) => `- ${x}`),
    "",
    "SEHARUSNYA:", ...seharusnya.map((x) => `- ${x}`),
    "",
    "AKSI:", ...actions.map((a, i) => `${i + 1}. ${a.title} — ${a.detail}`),
  ].join("\n");

  return {
    status,
    derived: { ctrPct: pct(ctr), avdPct: pct(avdPct), engagementPct: pct(engagement), viewsPerHour: pct(vph) },
    scores,
    kenapa,
    kokBisa,
    seharusnya,
    actions,
    planText,
  };
}
