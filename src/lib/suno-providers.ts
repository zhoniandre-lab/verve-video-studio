/* =====================================================================
   🎵 v19.78 META PENYEDIA LAGU — daftar UI + tautan ambil API key
   Hanya yang endpoint-nya DICEK HIDUP dari server (401 tanpa key = hidup)
   + punya halaman daftar/dashboard buat GENERATE key sendiri.
   ===================================================================== */

export type MetaProvSuno = {
  id: string;
  label: string;
  hint: string;
  keyUrl: string;
  dash?: string;
};

/** Provider yang ditawarkan di dropdown (bisa tempel key + generate). */
export const META_PROV_SUNO: MetaProvSuno[] = [
  {
    id: "kie",
    label: "🥇 Kie.ai (utama)",
    hint: "Login kie.ai → menu API Key → Generate. Daftar baru sering dapat 5.000 kredit.",
    keyUrl: "https://kie.ai/api-key",
    dash: "https://kie.ai/playground",
  },
  {
    id: "sunor",
    label: "☀️ Sunor.cc",
    hint: "Login sunor.cc → Dashboard → API Keys (sk_live_…). Daftar baru ~25 kredit sekali.",
    keyUrl: "https://sunor.cc",
    dash: "https://sunor.cc",
  },
  {
    id: "musicapi",
    label: "🎧 MusicAPI (75 kredit uji)",
    hint: "Daftar musicapi.ai → dashboard → API key (Bearer). Klaim mereka: 75 kredit uji, tanpa kartu.",
    keyUrl: "https://musicapi.ai",
    dash: "https://musicapi.ai",
  },
  {
    id: "aimusicapi",
    label: "🎧 AIMusicAPI (30 kredit uji)",
    hint: "Daftar aimusicapi.ai → dashboard → API key (Bearer). Klaim mereka: 30 kredit uji.",
    keyUrl: "https://aimusicapi.ai",
    dash: "https://aimusicapi.ai",
  },
  {
    id: "sunoapi",
    label: "🟣 SunoAPI.org (akun terpisah)",
    hint: "Daftar sunoapi.org → API Key Management. Format API sama seperti Kie — daftar akun BARU = kredit terpisah. Umumnya berbayar setelah uji.",
    keyUrl: "https://sunoapi.org/api-key",
    dash: "https://sunoapi.org",
  },
  {
    id: "evolink",
    label: "🧬 EvoLink (Suno v5/v5.5)",
    hint: "Daftar evolink.ai → Dashboard → API Keys. Suno v4–v5.5. Umumnya BERBAYAR (~$0.12/generate). Free credits tidak dijamin.",
    keyUrl: "https://evolink.ai/dashboard",
    dash: "https://evolink.ai/suno",
  },
  {
    id: "cometapi",
    label: "☄️ CometAPI (Suno)",
    hint: "Daftar cometapi.com → Console → Token. Buat API key, tempel di sini. Endpoint Suno dicek hidup dari server. Umumnya berbayar + kadang trial.",
    keyUrl: "https://www.cometapi.com/console/token",
    dash: "https://www.cometapi.com",
  },
  {
    id: "ttapi",
    label: "🧩 TTAPI (Suno v5)",
    hint: "Daftar dashboard.ttapi.io → Get API key. Tempel key di sini (header TT-API-KEY). Model chirp-v5 / v5.5. Cek kredit di dashboard mereka.",
    keyUrl: "https://dashboard.ttapi.io/",
    dash: "https://dashboard.ttapi.io/",
  },
];

export function metaProv(id: string): MetaProvSuno | undefined {
  return META_PROV_SUNO.find((p) => p.id === id);
}

export const LINK_AMBIL_KEY: Record<string, { url: string; hint: string }> = Object.fromEntries(
  META_PROV_SUNO.map((p) => [p.id, { url: p.keyUrl, hint: p.hint }]),
);

export const LINK_DASH_PROV: Record<string, string> = Object.fromEntries(
  META_PROV_SUNO.filter((p) => p.dash).map((p) => [p.id, p.dash as string]),
);
