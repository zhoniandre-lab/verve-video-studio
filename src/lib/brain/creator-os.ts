/* 🧠 VERVE Creator OS
   Mengubah prompt-prompt YouTube strategis menjadi sistem kerja produk:
   roadmap, niche, viral engine, algorithm, production, monetization, review.
   Deterministic + jujur: memakai data yang ada, tidak mengarang metrik. */

import type { GrowthDiagnosis, GrowthInput, GrowthMode } from "./growth-doctor";

export type CreatorStage = "zero" | "traction" | "monetizing" | "scaling";
export type CreatorOsSectionId = "roadmap" | "niche" | "viral" | "algorithm" | "production" | "money" | "review";

export type CreatorOsInput = GrowthInput & {
  niche?: string;
  audience?: string;
  goal?: string;
  resources?: string;
  uploadsPerWeek?: number;
  stage?: CreatorStage;
  mode?: GrowthMode;
};

export type CreatorOsSection = {
  id: CreatorOsSectionId;
  title: string;
  subtitle: string;
  why: string[];
  system: string[];
  checklist: string[];
  kpis: string[];
  prompts: string[];
};

export type CreatorOsPlan = {
  title: string;
  summary: string;
  stage: CreatorStage;
  niche: string;
  audience: string;
  next7Days: string[];
  sections: CreatorOsSection[];
  weeklyReviewTemplate: string;
  fullText: string;
};

const n = (v: unknown, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const pct = (v: unknown): number | null => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null;
const clip = (s: string, max = 180) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

function inferStage(input: CreatorOsInput): CreatorStage {
  if (input.stage) return input.stage;
  const views = n(input.views);
  const subs = n(input.subs);
  if (subs >= 1000 || views >= 100_000) return "monetizing";
  if (views >= 1000 || subs >= 100) return "traction";
  return "zero";
}
function stageLabel(s: CreatorStage): string {
  return s === "zero" ? "Awal/validasi" : s === "traction" ? "Mulai dapat traction" : s === "monetizing" ? "Menuju/aktif monetisasi" : "Scale";
}
function baseNiche(input: CreatorOsInput): string { return clip(input.niche || input.title || "cerita emosional keluarga", 80); }
function baseAudience(input: CreatorOsInput): string { return clip(input.audience || "penonton Indonesia yang suka cerita emosional, musik, dan kisah menyentuh", 120); }

function metricSignals(input: CreatorOsInput, dx?: GrowthDiagnosis): string[] {
  const out: string[] = [];
  if (input.views != null) out.push(`views ${n(input.views).toLocaleString("id-ID")}`);
  if (input.impressions != null) out.push(`impressions ${n(input.impressions).toLocaleString("id-ID")}`);
  if (input.ctrPct != null) out.push(`CTR ${pct(input.ctrPct)}%`);
  if (input.avgViewSec != null) out.push(`AVD ${Math.round(n(input.avgViewSec))}s`);
  if (input.retention30Pct != null) out.push(`retention/avg ${pct(input.retention30Pct)}%`);
  const issue = dx?.issues?.[0]?.code;
  if (issue) out.push(`isu utama ${issue}`);
  return out;
}

function viralIdeas(niche: string, audience: string): string[] {
  const base = [
    `Saat ${niche} berubah jadi keputusan terakhir`,
    `Kesalahan kecil yang membuat ${audience} menangis di akhir`,
    `Satu kalimat yang tidak pernah sempat diucapkan`,
    `Sebelum terlambat: pesan terakhir untuk orang tersayang`,
    `Apa yang terjadi setelah semua orang menganggapnya kuat`,
    `Cerita 60 detik: dari diam → konflik → twist emosional`,
    `Judul kontra: dia terlihat biasa, tapi menyimpan luka besar`,
    `Opening brutal: mulai dari akibat, baru bongkar sebab`,
    `Versi Shorts: 3 adegan paling menyakitkan dari video panjang`,
    `Seri lanjutan: penonton memilih akhir cerita berikutnya`,
    `Thumbnail wajah/objek kunci + 3 kata janji emosional`,
    `Komentar pinned: pertanyaan yang memancing cerita penonton`,
  ];
  return base;
}

function section(id: CreatorOsSectionId, title: string, subtitle: string, why: string[], system: string[], checklist: string[], kpis: string[], prompts: string[]): CreatorOsSection {
  return { id, title, subtitle, why, system, checklist, kpis, prompts };
}

export function buildCreatorOS(input: CreatorOsInput = {}, dx?: GrowthDiagnosis): CreatorOsPlan {
  const stage = inferStage(input);
  const niche = baseNiche(input);
  const audience = baseAudience(input);
  const uploads = Math.max(1, Math.min(14, Math.round(n(input.uploadsPerWeek, 3))));
  const goal = clip(input.goal || "mencapai monetisasi YouTube dengan konten yang konsisten dan punya retention kuat", 160);
  const resources = clip(input.resources || "HP, VERVE Studio, YouTube Studio, waktu produksi terbatas", 140);
  const signals = metricSignals(input, dx);
  const ideas = viralIdeas(niche, audience);
  const ctr = pct(input.ctrPct);
  const ret = pct(input.retention30Pct);
  const weakPackaging = ctr != null && ctr < 5;
  const weakRetention = ret != null && ret < 45;

  const sections: CreatorOsSection[] = [
    section(
      "roadmap",
      "🧭 Roadmap Monetisasi",
      "Sistem 30/60/90 hari dari nol menuju syarat monetisasi.",
      [`Stage sekarang: ${stageLabel(stage)}.`, `Goal: ${goal}.`, signals.length ? `Sinyal data: ${signals.join(" · ")}.` : "Data Studio masih minim, jadi roadmap dibuat sebagai hipotesis kerja."],
      [
        `30 hari: validasi 3 pilar konten ${niche}, unggah ${uploads} video/minggu, ukur CTR + AVD + komentar.`,
        "60 hari: gandakan format yang menang, buat seri, repurpose tiap video panjang menjadi 2–4 Shorts.",
        "90 hari: sistem upload tetap, eksperimen thumbnail/judul mingguan, kumpulkan aset monetisasi awal.",
      ],
      ["Tentukan 3 pilar konten", "Buat kalender 4 minggu", "Simpan baseline CTR/AVD/retention", "Buat 1 eksperimen per minggu", "Repurpose video terbaik jadi Shorts"],
      ["CTR target awal 5%+", "AVD long target 35%+ durasi", "Retention/avg viewed 45%+", "Upload konsisten 3–5/minggu", "1 seri konten berulang"],
      ["Act as a world-class YouTube strategist and monetization consultant. Build my 30/60/90-day roadmap using my niche, audience, resources, and current analytics."],
    ),
    section(
      "niche",
      "🎯 Niche Domination",
      "Menemukan posisi channel yang jelas, monetizable, dan beda dari pesaing.",
      [`Niche kerja: ${niche}.`, `Target viewer: ${audience}.`, "Niche kuat bukan cuma ramai, tapi punya sudut berbeda + bisa dibuat seri."],
      [
        "Positioning: satu kalimat janji channel yang mudah dipahami penonton baru.",
        "Content pillars: 3 kategori tetap supaya algoritma dan penonton paham channel ini tentang apa.",
        "Differentiation: emosi, gaya visual, struktur cerita, atau data/riset yang pesaing tidak lakukan.",
      ],
      ["Tulis janji channel 1 kalimat", "Pilih 3 pilar", "Daftar 10 kompetitor", "Cari celah: judul, hook, durasi, visual", "Buat 20 ide seri"],
      ["Topik repeatable", "Penonton spesifik", "Kompetisi ada tapi tidak mustahil", "Peluang sponsor/affiliate/produk jelas"],
      ["Act as an elite YouTube market researcher. Find my best niche positioning, target viewer profile, content categories, and video ideas ranked by growth potential."],
    ),
    section(
      "viral",
      "🔥 Viral Video Engine",
      "Mesin ide, hook, judul, thumbnail, opening, struktur cerita, dan CTA.",
      [weakPackaging ? "CTR masih perlu diperkuat, jadi packaging wajib jadi prioritas." : "Packaging tetap diuji mingguan agar video layak scale.", weakRetention ? "Retention/AVD lemah, jadi opening dan pacing harus dipotong lebih tajam." : "Retention belum terbukti lemah dari data yang ada."],
      [
        "Formula opening: akibat besar dulu → konflik → janji jawaban → masuk cerita.",
        "Thumbnail: satu subjek/objek, emosi jelas, teks 2–4 kata, kontras tinggi.",
        "Script: beat visual/teks berubah tiap 3–6 detik, jangan intro panjang.",
      ],
      ideas.slice(0, 8),
      ["10 hook sebelum produksi", "3 judul + 3 thumbnail per video", "Opening 0–5 detik menjawab janji", "CTA komentar satu pertanyaan"],
      ["Act as a top 1% YouTube content strategist. Generate viral concepts, hooks, titles, thumbnail concepts, opening scenes, storytelling structure, CTAs, and explain why each could retain viewers."],
    ),
    section(
      "algorithm",
      "📈 Algorithm Doctor",
      "Membaca impressions, CTR, AVD, traffic source, suggested/search, dan subscriber conversion.",
      ["YouTube biasanya menguji video lewat permukaan kecil dulu; sinyal klik + tonton menentukan scale.", weakPackaging ? "Klik belum cukup kuat, kemungkinan judul/thumbnail belum memicu rasa penasaran." : "CTR tidak buruk dari data yang tersedia atau belum cukup data.", weakRetention ? "Penonton belum bertahan cukup lama, fokus ke hook/pacing." : "Retention perlu terus dipantau dari grafik Studio."],
      [
        "Browse/Suggested: utamakan packaging + kepuasan awal.",
        "Search: utamakan keyword, pertanyaan jelas, jawaban cepat.",
        "Returning viewers: bikin seri, karakter, format tetap, dan ending yang mengundang episode berikutnya.",
      ],
      ["Catat sumber traffic utama", "Bandingkan CTR per surface", "Lihat cliff retention", "Uji ulang thumbnail 24–72 jam", "Buat versi Shorts dari momen puncak"],
      ["CTR", "AVD", "Average viewed", "Traffic source", "Returning viewers", "Subscribers gained"],
      ["Act as a YouTube algorithm expert. Explain how to grow using impressions, CTR, watch time, retention, returning viewers, suggested videos, search traffic, and recommendation systems."],
    ),
    section(
      "production",
      "🏭 AI Production System",
      "Workflow produksi cepat: riset → script → voice/music → edit → thumbnail → upload → repurpose.",
      [`Resources: ${resources}.`, "VERVE harus jadi sistem kerja, bukan cuma editor."],
      [
        "Riset: pilih topik + angle + bukti demand.",
        "Produksi: script/hook, visual, voice/music, edit, caption, thumbnail.",
        "Distribusi: upload kit, Shorts, pinned comment, review 48–72 jam.",
      ],
      ["Riset topik", "Script selesai", "Voice/music selesai", "Visual/stock jelas sumbernya", "Edit + caption", "Thumbnail + judul", "Upload kit", "Shorts repurpose"],
      ["Waktu produksi/video", "Checklist selesai", "Versi Shorts per video", "Jumlah eksperimen aktif"],
      ["Act as a professional YouTube production manager. Build an AI-assisted workflow for topic research, scripting, voiceovers, editing, thumbnail creation, publishing, analytics review, and repurposing."],
    ),
    section(
      "money",
      "💰 Monetization Machine",
      "Tahapan monetisasi: YPP, AdSense, affiliate, sponsor, produk digital, membership.",
      ["Monetisasi terbaik mengikuti stage channel, jangan terlalu cepat menjual sebelum trust terbentuk."],
      [
        stage === "zero" ? "Stage awal: bangun positioning, seri, dan trust. Monetisasi halus: affiliate relevan + lead magnet ringan." : "Stage traction/monetisasi: siapkan sponsor deck, affiliate, produk digital kecil, dan community.",
        "YPP: siapkan konsistensi upload + retention + watch time.",
        "Sponsor: mulai dari niche jelas + data performa + paket penawaran sederhana.",
      ],
      ["Cek syarat YPP", "Daftar affiliate relevan", "Buat media kit 1 halaman", "Buat produk digital kecil", "Bangun list/community"],
      ["Subscribers", "Watch hours / Shorts views", "RPM/CPM nanti", "Affiliate clicks", "Sponsor leads"],
      ["Act as a creator business strategist. Build a monetization system including YPP preparation, AdSense, affiliate marketing, sponsorships, digital products, courses, memberships, newsletters, and communities."],
    ),
    section(
      "review",
      "🔬 Analytics Optimizer",
      "Review mingguan/bulanan untuk menemukan pola menang dan memperbaiki video lemah.",
      [signals.length ? `Data terbaru: ${signals.join(" · ")}.` : "Belum ada data cukup; mulai dengan baseline manual/screenshot/OAuth."],
      [
        "Weekly: ranking 5 video terbaru berdasarkan CTR, AVD, retention, comments/subs.",
        "Monthly: cari pola topik, durasi, judul, thumbnail, hook yang menang.",
        "Action: 1 eksperimen per video lemah; scale 1 format yang menang.",
      ],
      ["Simpan snapshot", "Grade eksperimen", "Catat video menang", "Catat video lemah", "Tentukan 3 action minggu depan"],
      ["CTR median", "AVD median", "Engagement", "Views/hour", "Traffic source", "Subscriber conversion"],
      ["Act as a YouTube data analyst. Build weekly and monthly review frameworks that identify winning content patterns and improve weak videos using impressions, CTR, AVD, retention graphs, traffic sources, engagement, and revenue."],
    ),
  ];

  const next7Days = [
    `Hari 1: rapikan positioning ${niche} + 3 pilar konten.`,
    "Hari 2: buat 10 ide + 10 hook + 10 judul.",
    "Hari 3: produksi 1 video utama + 2 Shorts pendukung.",
    "Hari 4: buat 3 thumbnail/judul untuk eksperimen.",
    "Hari 5: upload + pinned comment + link seri berikutnya.",
    "Hari 6: baca analytics 24–48 jam, catat CTR/AVD/traffic.",
    "Hari 7: scale yang menang, ubah packaging yang lemah.",
  ];
  const weeklyReviewTemplate = [
    "WEEKLY CREATOR OS REVIEW",
    `Niche: ${niche}`,
    `Audience: ${audience}`,
    `Stage: ${stageLabel(stage)}`,
    "1) Video menang minggu ini:",
    "2) Video lemah minggu ini:",
    "3) Pola CTR/thumbnail/judul:",
    "4) Pola AVD/retention/hook:",
    "5) Traffic source utama:",
    "6) Eksperimen minggu depan:",
  ].join("\n");
  const fullText = [
    `CREATOR OS — ${niche}`,
    `Audience: ${audience}`,
    `Stage: ${stageLabel(stage)}`,
    `Goal: ${goal}`,
    "",
    "NEXT 7 DAYS:", ...next7Days.map((x) => `- ${x}`),
    "",
    ...sections.flatMap((s) => [
      s.title,
      s.subtitle,
      "Kenapa:", ...s.why.map((x) => `- ${x}`),
      "Sistem:", ...s.system.map((x) => `- ${x}`),
      "Checklist:", ...s.checklist.map((x) => `- ${x}`),
      "KPI:", ...s.kpis.map((x) => `- ${x}`),
      "",
    ]),
  ].join("\n");

  return {
    title: `Creator OS: ${niche}`,
    summary: `Sistem kerja YouTube untuk ${stageLabel(stage)} — ${uploads} upload/minggu, fokus ke positioning, viral engine, produksi, monetisasi, dan review data.`,
    stage,
    niche,
    audience,
    next7Days,
    sections,
    weeklyReviewTemplate,
    fullText,
  };
}
