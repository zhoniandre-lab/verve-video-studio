/* =====================================================================
   BOT BURUAN AI — KATALOG KURASI MANUAL (v19.35) — 100% orisinal
   Daftar penyedia AI yang kasih kredit GRATIS secara sah + tutorial
   langkah-demi-langkah cara klaim. Disusun manual biar presisi.
   ===================================================================== */
import type { BuruanItem, KategoriId, JenisGratis } from "./types";

interface Kasar {
  id: string; nama: string; url: string; kategori: KategoriId; gratis: string;
  jenis: JenisGratis; syarat: string; berlaku?: string; mudah: number;
  baseUrl?: string; contohModel?: string; desc: string;
  tutorial: { t: string }[]; sumber: string;
}

const K = (x: Omit<Kasar, "sumber" | "dicek">): Kasar => ({ ...x, sumber: "kurasi" });

/** Katalog kurasi — urutkan yang paling gampang & berguna di atas. */
const KATALOG_ASLI: Kasar[] = [
  // ---------------- CHAT / LLM API (OpenAI-compatible → Dompet Bansos) ----------------
  K({
    id: "groq", nama: "Groq", url: "https://groq.com", kategori: "chat",
    gratis: "Llama 3.3 70B & model cepat gratis (trial: 30 RPM, 14.400 req/hari)", jenis: "permanen",
    syarat: "Email doang (Google/GitHub bisa)", mudah: 5,
    baseUrl: "https://api.groq.com/openai/v1", contohModel: "llama-3.3-70b-versatile",
    desc: "Inferensi paling ngebut di kelasnya (LPU). Level gratisnya dipakai banyak orang buat chat/teks tanpa bayar.",
    tutorial: [
      { t: "Buka https://console.groq.com — daftar (email/Google/GitHub, bebas kartu)." },
      { t: "Masuk → klik API Keys → Create API Key → salin key-nya." },
      { t: "Di Verve: buka Bot Buruan → Groq → 🔑 Simpan ke Dompet Bansos → tempel key & base URL di atas." },
      { t: "Model contoh: llama-3.3-70b-versatile — kalau kosong, Verve auto-pilih." },
    ],
  }),
  K({
    id: "cerebras", nama: "Cerebras", url: "https://cloud.cerebras.ai", kategori: "chat",
    gratis: "gpt-oss-120b & lain (5 RPM, 30K TPM, 1M token/hari)", jenis: "permanen",
    syarat: "Email doang", mudah: 5,
    baseUrl: "https://api.cerebras.ai/v1", contohModel: "gpt-oss-120b",
    desc: "Model open-source tercepat via wafer-scale engine. Free tier tanpa kartu, OpenAI-compatible.",
    tutorial: [
      { t: "Buka https://cloud.cerebras.ai — daftar dengan email." },
      { t: "Menu API Keys → buat key baru → salin." },
      { t: "Simpan ke Dompet Bansos Verve dengan base https://api.cerebras.ai/v1" },
    ],
  }),
  K({
    id: "huggingface", nama: "Hugging Face (Serverless)", url: "https://huggingface.co/inference-providers", kategori: "chat",
    gratis: "100K kredit/bulan (auto-refresh) — Llama, Gemma, Phi, Qwen, dll", jenis: "bulanan",
    syarat: "Email doang", berlaku: "100K kredit per bulan", mudah: 4,
    baseUrl: "https://api-inference.huggingface.co/v1", contohModel: "meta-llama/Llama-3.1-8B-Instruct",
    desc: "Ribuan model komunitas via API serverless. Kredit gratis ditambah otomatis tiap bulan — tanpa kartu.",
    tutorial: [
      { t: "Buka https://huggingface.co — daftar (email doang)." },
      { t: "Settings → Access Tokens → New token (read) → salin." },
      { t: "Simpan ke Dompet Bansos: base https://api-inference.huggingface.co/v1" },
      { t: "Catatan: antrian kadang lambat (shared queue) — cocok buat teks, bukan realtime." },
    ],
  }),
  K({
    id: "nvidia", nama: "NVIDIA NIM", url: "https://build.nvidia.com", kategori: "chat",
    gratis: "Llama 3.3 70B & lainnya — 40 RPM free, tanpa kartu", jenis: "permanen",
    syarat: "Email doang", mudah: 5,
    baseUrl: "https://integrate.api.nvidia.com/v1", contohModel: "meta/llama-3.3-70b-instruct",
    desc: "Endpoint API gratis NVIDIA untuk model besar populer. OpenAI-compatible & stabil.",
    tutorial: [
      { t: "Buka https://build.nvidia.com — daftar dengan email." },
      { t: "Pilih model (mis. Llama 3.3 70B) → Get API Key → salin." },
      { t: "Simpan ke Dompet Bansos: base https://integrate.api.nvidia.com/v1" },
    ],
  }),
  K({
    id: "cohere", nama: "Cohere", url: "https://dashboard.cohere.com", kategori: "chat",
    gratis: "Trial key 1.000 call/bulan (non-komersial)", jenis: "bulanan",
    syarat: "Email doang", berlaku: "1.000 call per bulan", mudah: 4,
    baseUrl: "https://api.cohere.com/v2",
    desc: "Model teks enterprise. Trial API key tanpa kartu — cukup buat eksperimen & tugas ringan.",
    tutorial: [
      { t: "Buka https://dashboard.cohere.com — daftar." },
      { t: "API Keys → Trial key → salin." },
      { t: "Simpan ke Dompet Bansos: base https://api.cohere.com/v2 (catatan: non-komersial)." },
    ],
  }),
  K({
    id: "github-models", nama: "GitHub Models", url: "https://github.com/marketplace/models", kategori: "chat",
    gratis: "GPT, Llama, Mistral, Gemini (rate limit per akun — 40 RPM kredit)", jenis: "permanen",
    syarat: "Akun GitHub gratis", mudah: 4,
    baseUrl: "https://models.github.ai/v1",
    desc: "Model dari banyak vendor lewat 1 key GitHub. Kredit rate-limit di-refresh berkala.",
    tutorial: [
      { t: "Login GitHub (akun gratis cukup)." },
      { t: "Buka https://github.com/marketplace/models → Settings → Tokens → Generate (read:models)." },
      { t: "Simpan ke Dompet Bansos: base https://models.github.ai/v1" },
    ],
  }),
  K({
    id: "google-ai-studio", nama: "Google AI Studio (Gemini)", url: "https://aistudio.google.com", kategori: "chat",
    gratis: "Gemini 2.5 Flash — 15 RPM, 1M TPM tanpa kartu", jenis: "permanen",
    syarat: "Akun Google", mudah: 5,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", contohModel: "gemini-2.5-flash",
    desc: "Level gratis Gemini paling lega. Ada endpoint OpenAI-compatible resmi.",
    tutorial: [
      { t: "Buka https://aistudio.google.com — login Google." },
      { t: "Get API key → Create → salin." },
      { t: "Simpan ke Dompet Bansos: base https://generativelanguage.googleapis.com/v1beta/openai (mode openai-compat)." },
    ],
  }),
  K({
    id: "together", nama: "Together AI", url: "https://www.together.ai", kategori: "chat",
    gratis: "$1 kredit sekali (trial)", jenis: "sekali",
    syarat: "Email doang", berlaku: "Sekali klaim", mudah: 4,
    baseUrl: "https://api.together.xyz/v1", contohModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    desc: "Inference cloud murah dengan kredit sambutan $1 — cukup buat tes beberapa puluh video/teks.",
    tutorial: [
      { t: "Buka https://www.together.ai — daftar." },
      { t: "API Keys → buat → salin." },
      { t: "Simpan ke Dompet Bansos: base https://api.together.xyz/v1" },
    ],
  }),
  K({
    id: "openrouter", nama: "OpenRouter", url: "https://openrouter.ai", kategori: "chat",
    gratis: "Model :free (200+ model, tanpa kartu)", jenis: "permanen",
    syarat: "Login (Google/GitHub)", mudah: 5,
    baseUrl: "https://openrouter.ai/api/v1",
    desc: "Gateway 300+ model — banyak yang gratis permanen (akhiran :free). 1 key buat semua.",
    tutorial: [
      { t: "Buka https://openrouter.ai — login." },
      { t: "Keys → Create key → salin." },
      { t: "Simpan ke Dompet Bansos: base https://openrouter.ai/api/v1 — model pakai nama ber-akhiran :free." },
    ],
  }),

  // ---------------- GAMBAR → VIDEO ----------------
  K({
    id: "hailuo", nama: "Hailuo AI (MiniMax)", url: "https://hailuoai.video", kategori: "gambar-video",
    gratis: "Kredit harian gratis (beberapa video/hari)", jenis: "harian",
    syarat: "Email doang", mudah: 5,
    desc: "Image-to-video & text-to-video populer. Kredit di-refresh tiap hari — cocok produksi rutin.",
    tutorial: [
      { t: "Buka https://hailuoai.video — daftar dengan email." },
      { t: "Tiap hari login → klaim kredit harian (biasanya otomatis)." },
      { t: "Upload gambar / ketik prompt → generate → download videonya → pakai di Verve." },
    ],
  }),
  K({
    id: "luma", nama: "Luma Dream Machine", url: "https://lumalabs.ai/dream-machine", kategori: "gambar-video",
    gratis: "Kredit bulanan gratis (120 kredit/refresh)", jenis: "bulanan",
    syarat: "Email doang", berlaku: "Di-refresh berkala", mudah: 4,
    desc: "Image-to-video berkualitas sinematik. Kredit gratis ditambah tiap periode.",
    tutorial: [
      { t: "Buka https://lumalabs.ai/dream-machine — daftar." },
      { t: "Klik gambar → pilih foto → Generate → tunggu → download." },
      { t: "Kredit gratis muncul di dashboard; kalau habis, tunggu refresh atau pakai alternatif." },
    ],
  }),
  K({
    id: "kling", nama: "Kling AI", url: "https://klingai.com", kategori: "gambar-video",
    gratis: "Kredit gratis tiap login (beberapa generate/hari)", jenis: "harian",
    syarat: "Email/HP", mudah: 4,
    desc: "Video AI dari gambar dengan kualitas tinggi (Kling 1.6/2.x). Ada kredit gratis harian.",
    tutorial: [
      { t: "Buka https://klingai.com — daftar." },
      { t: "Login tiap hari → klaim kredit harian." },
      { t: "Image-to-Video → upload gambar → generate → download." },
    ],
  }),
  K({
    id: "pika", nama: "Pika", url: "https://pika.art", kategori: "gambar-video",
    gratis: "Kredit mingguan gratis", jenis: "mingguan",
    syarat: "Email doang", berlaku: "Di-refresh tiap minggu", mudah: 4,
    desc: "Image-to-video dengan kontrol gerakan. Kredit gratis mingguan cukup buat beberapa video.",
    tutorial: [
      { t: "Buka https://pika.art — daftar." },
      { t: "Create → upload gambar → generate → download." },
    ],
  }),
  K({
    id: "runway", nama: "Runway", url: "https://runwayml.com", kategori: "gambar-video",
    gratis: "125 kredit sekali (trial)", jenis: "sekali",
    syarat: "Email doang", berlaku: "Sekali klaim", mudah: 4,
    desc: "Gen-3 Alpha — kualitas sinematik. 125 kredit sambutan cukup buat beberapa generate.",
    tutorial: [
      { t: "Buka https://runwayml.com — daftar." },
      { t: "Generate video (image-to-video) — kredit 125 terpakai otomatis." },
    ],
  }),
  K({
    id: "krea", nama: "Krea AI", url: "https://krea.ai", kategori: "gambar-video",
    gratis: "Kredit harian (real-time & generator)", jenis: "harian",
    syarat: "Email doang", mudah: 4,
    desc: "Generator gambar + video + upscale. Ada kredit harian gratis untuk pemakaian ringan.",
    tutorial: [
      { t: "Buka https://krea.ai — daftar." },
      { t: "Pakai kredit harian buat generate — perhatikan sisa di dashboard." },
    ],
  }),

  // ---------------- MUSIK ----------------
  K({
    id: "suno", nama: "Suno", url: "https://suno.com", kategori: "musik",
    gratis: "50 kredit/hari (≈10 lagu) free tier", jenis: "harian",
    syarat: "Email doang", mudah: 5,
    desc: "Bikin lagu dari prompt — free tier 50 kredit tiap hari, cukup produksi lagu rutin.",
    tutorial: [
      { t: "Buka https://suno.com — daftar." },
      { t: "Create → ketik prompt/style → Generate (10 lagu/hari gratis)." },
      { t: "Download lagunya → upload di Verve Spectrum/Lahan." },
    ],
  }),
  K({
    id: "udio", nama: "Udio", url: "https://www.udio.com", kategori: "musik",
    gratis: "Kredit bulanan gratis (free plan)", jenis: "bulanan",
    syarat: "Email doang", berlaku: "Per bulan", mudah: 4,
    desc: "Alternatif Suno dengan kualitas bagus. Kredit free plan ditambah tiap bulan.",
    tutorial: [
      { t: "Buka https://www.udio.com — daftar." },
      { t: "Create → prompt → Generate → download." },
    ],
  }),

  // ---------------- GAMBAR ----------------
  K({
    id: "ideogram", nama: "Ideogram", url: "https://ideogram.ai", kategori: "gambar",
    gratis: "Kredit harian (beberapa generate)", jenis: "harian",
    syarat: "Email doang", mudah: 5,
    desc: "Generator gambar dengan teks paling rapi — gratis harian.",
    tutorial: [
      { t: "Buka https://ideogram.ai — daftar." },
      { t: "Prompt → Generate → download PNG." },
    ],
  }),
  K({
    id: "leonardo", nama: "Leonardo AI", url: "https://leonardo.ai", kategori: "gambar",
    gratis: "150 token/hari", jenis: "harian",
    syarat: "Email doang", mudah: 4,
    desc: "Image gen ala midjourney dengan token harian gratis.",
    tutorial: [
      { t: "Buka https://leonardo.ai — daftar." },
      { t: "Image Generation → prompt → Generate → download." },
    ],
  }),
  K({
    id: "bing-designer", nama: "Microsoft Designer (Bing Image)", url: "https://designer.microsoft.com", kategori: "gambar",
    gratis: "15 boost/hari (gambar gratis tanpa batas dengan antrean)", jenis: "harian",
    syarat: "Akun Microsoft gratis", mudah: 5,
    desc: "Image Creator (DALL·E) — 15 boost cepat per hari, sisanya tetap jalan pelan.",
    tutorial: [
      { t: "Login akun Microsoft (hotmail/outlook gratis)." },
      { t: "Buka Designer → Create image → prompt → Save." },
    ],
  }),

  // ---------------- SUARA ----------------
  K({
    id: "elevenlabs", nama: "ElevenLabs", url: "https://elevenlabs.io", kategori: "suara",
    gratis: "±10 menit TTS/bulan (free plan)", jenis: "bulanan",
    syarat: "Email doang", berlaku: "Per bulan", mudah: 4,
    desc: "TTS paling natural. Free plan cukup buat narasi pendek tiap bulan.",
    tutorial: [
      { t: "Buka https://elevenlabs.io — daftar." },
      { t: "Text to Speech → pilih suara → Generate → download MP3." },
      { t: "Pakai di Verve (Audio → Narasi)." },
    ],
  }),
  K({
    id: "edge-tts", nama: "Edge TTS (bawaan gratis)", url: "https://github.com/rany2/edge-tts", kategori: "suara",
    gratis: "Gratis selamanya (pakai suara Microsoft Edge)", jenis: "permanen",
    syarat: "Tanpa daftar", mudah: 5,
    desc: "Suara natural Microsoft gratis tanpa daftar — banyak yang pakai buat narasi.",
    tutorial: [
      { t: "Cukup pakai dari aplikasi yang sudah menyediakan (banyak tool TTS gratis memakainya)." },
      { t: "Alternatif: install edge-tts (Python) kalau suka otak-atik sendiri." },
    ],
  }),
];

/** Item kurasi siap pakai (dengan timestamp dicek). */
export function katalogKurasi(now = Date.now()): BuruanItem[] {
  return KATALOG_ASLI.map((k) => ({
    ...k,
    dicek: now,
  }));
}
