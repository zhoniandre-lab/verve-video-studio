// 📡 VERVE Content API Targets
// Daftar kandidat API yang DIAMBIL dari API-mega-list untuk 6 kebutuhan VERVE.
// File ini hanya registry aman: tidak memanggil API berbayar dan tidak mengubah UI.

export type ContentApiFeature =
  | "youtube_video_research"
  | "youtube_transcript"
  | "comment_analysis"
  | "content_ideas_tiktok_youtube"
  | "keyword_title_recommendation"
  | "video_audio_asset_search";

export type ProviderKind = "official" | "apify" | "built_in" | "ai";

export type ContentApiProvider = {
  id: string;
  name: string;
  kind: ProviderKind;
  url: string;
  actorId?: string;
  useFor: string;
  note: string;
};

export type ContentApiTarget = {
  key: ContentApiFeature;
  label: string;
  goal: string;
  priority: "now" | "next" | "later";
  primary: ContentApiProvider;
  backups: ContentApiProvider[];
  outputFields: string[];
  env: string[];
  safety: string;
};

function apify(actorId: string, name: string, useFor: string, note = "Perlu APIFY_TOKEN dan wajib dites biaya/limit sebelum dipasang ke UI."): ContentApiProvider {
  return {
    id: actorId.replace(/[^a-z0-9_./-]/gi, "_"),
    name,
    kind: "apify",
    actorId,
    url: `https://apify.com/${actorId}`,
    useFor,
    note,
  };
}

export const CONTENT_API_TARGETS: ContentApiTarget[] = [
  {
    key: "youtube_video_research",
    label: "Riset video YouTube lebih kuat",
    goal: "Cari video kompetitor/topik, baca judul, channel, views, durasi, tanggal upload, thumbnail, dan sinyal awal untuk Growth Doctor.",
    priority: "now",
    primary: apify(
      "nexgendata/youtube-media-mcp-server",
      "YouTube MCP — AI Video Search & Transcripts",
      "All-in-one search YouTube + channel stats + transcript + comments. Cocok sebagai otak riset utama."
    ),
    backups: [
      apify("aimscrape/youtube-search-video-scraper", "YouTube Advanced Search Scraper", "Search YouTube by keyword dengan metadata video bersih."),
      apify("powerai/youtube-video-search-scraper", "YouTube Video Search Scraper", "Cadangan untuk riset video dan market analysis."),
      apify("taroyamada/youtube-channel-analytics", "YouTube Channel Analytics Scraper", "Benchmark channel kompetitor: subscriber, views, recent uploads, Shorts."),
    ],
    outputFields: ["videoId", "url", "title", "channel", "views", "duration", "publishedAt", "thumbnail", "description"],
    env: ["APIFY_TOKEN", "YOUTUBE_API_KEY (jalur resmi yang sudah ada tetap dipertahankan)"],
    safety: "Pakai sebagai pelengkap jalur resmi YouTube Data API; jangan ganti total agar software tetap stabil.",
  },
  {
    key: "youtube_transcript",
    label: "Ambil transcript video",
    goal: "Ambil teks/caption YouTube untuk bedah hook, struktur cerita, ide ulang, dan repurpose script.",
    priority: "now",
    primary: apify(
      "nexgendata/youtube-transcript-scraper",
      "YouTube Transcript Scraper — Captions & Text",
      "Ambil full transcript/caption, termasuk auto-generated subtitle dan bulk processing."
    ),
    backups: [
      apify("powerai/youtube-transcript-scraper", "YouTube Transcript Scraper", "Cadangan transcript dengan time markers."),
      apify("supreme_coder/youtube-transcript-scraper", "Youtube Transcript Scraper - $0.5 per 1k", "Cadangan murah untuk bulk transcript."),
      apify("dz_omar/youtube-subtitle-translator", "Youtube Subtitle Translator", "Ambil transcript lalu terjemahkan SRT banyak bahasa."),
    ],
    outputFields: ["videoId", "language", "segments", "text", "startSec", "durationSec", "srt"],
    env: ["APIFY_TOKEN"],
    safety: "Hanya proses video publik dan hormati hak cipta; transcript dipakai untuk riset/ide, bukan klaim ulang karya orang.",
  },
  {
    key: "comment_analysis",
    label: "Analisis komentar",
    goal: "Ambil komentar YouTube/TikTok untuk membaca keresahan penonton, pertanyaan, emosi, dan ide video berikutnya.",
    priority: "now",
    primary: apify(
      "dz_omar/youtube-comments-scraper",
      "YouTube Comments Scraper",
      "Ambil komentar YouTube, author info, likes, timestamps, nested replies untuk market research."
    ),
    backups: [
      apify("scrape-creators/best-youtube-comments-scraper", "Best Youtube Comments Scraper", "Cadangan scrape komentar YouTube cepat skala besar."),
      apify("apidojo/tiktok-comments-scraper", "TikTok Comments Scraper", "Ambil komentar TikTok untuk riset ide dan sentiment."),
      apify("nexgendata/ai-sentiment-analyzer", "Sentiment Analyzer — VADER", "Skor sentiment komentar tanpa LLM mahal."),
    ],
    outputFields: ["platform", "videoUrl", "comment", "author", "likeCount", "replyCount", "publishedAt", "sentiment"],
    env: ["APIFY_TOKEN"],
    safety: "Komentar dipakai agregat; jangan tampilkan data personal berlebihan di UI.",
  },
  {
    key: "content_ideas_tiktok_youtube",
    label: "Cari ide konten dari TikTok/YouTube",
    goal: "Cari pola video yang sedang naik dari YouTube dan TikTok lalu ubah menjadi ide konten VERVE.",
    priority: "now",
    primary: apify(
      "apidojo/tiktok-scraper",
      "TikTok Scraper (Pay Per Result)",
      "Ambil video/profil/hashtag/metadata TikTok untuk trend dan ide konten."
    ),
    backups: [
      apify("powerai/tiktok-videos-search-scraper", "TikTok Video Search Scraper", "Search TikTok by keyword dengan engagement dan music metadata."),
      apify("data-slayer/tiktok-video-search", "TikTok Video Search Scraper · No Cookies", "Search TikTok tanpa login/cookies; cocok untuk riset aman."),
      apify("aimscrape/youtube-search-video-scraper", "YouTube Advanced Search Scraper", "Search YouTube untuk bandingkan topik lintas platform."),
      apify("apidojo/tiktok-music-scraper", "TikTok Music & Sound Scraper", "Cari sound/music yang sedang banyak dipakai."),
    ],
    outputFields: ["platform", "keyword", "titleOrCaption", "url", "views", "likes", "comments", "shares", "music", "hashtags"],
    env: ["APIFY_TOKEN"],
    safety: "Jangan download/reupload mentah; pakai untuk inspirasi, pattern, dan ide original.",
  },
  {
    key: "keyword_title_recommendation",
    label: "Rekomendasi keyword/judul",
    goal: "Bikin keyword, query, judul, dan angle video dari autocomplete/search intent agar Growth Doctor lebih action-first.",
    priority: "now",
    primary: apify(
      "sian.agency/youtube-auto-complete-and-query-suggestion",
      "Youtube Auto Complete And Query Suggestion",
      "Ambil autocomplete YouTube untuk SEO keyword dan ide konten."
    ),
    backups: [
      apify("easyapi/all-in-one-autocomplete-keywords-tool", "All-in-One Autocomplete Keywords Tool", "Autocomplete multi-platform: Google, TikTok, Instagram, Amazon, dll."),
      apify("powerai/long-tail-keyword-discovery", "Long-Tail Keyword Discovery", "Cari long-tail keyword dengan analisis peluang."),
      {
        id: "verve_titles_builtin",
        name: "VERVE built-in title/metadata routes",
        kind: "built_in",
        url: "/api/hcnsec/titles + /api/hcnsec/metadata + /api/hcnsec/keywords",
        useFor: "Jalur internal yang sudah ada untuk judul, metadata, dan keyword.",
        note: "Tetap dipakai sebagai fallback lokal/server HCNSEC.",
      },
    ],
    outputFields: ["seed", "suggestions", "longTailKeywords", "titleAngles", "searchIntent", "country", "language"],
    env: ["APIFY_TOKEN", "HCNSEC_API_KEY (fitur lama tetap dipakai)"],
    safety: "Keyword hanya bahan; final judul harus tetap dicek manual agar tidak clickbait ngawur.",
  },
  {
    key: "video_audio_asset_search",
    label: "Cari bahan video/audio/asset",
    goal: "Perluas pencarian bahan visual/audio, tapi tetap pertahankan Pexels/Pixabay/Coverr yang sudah ada.",
    priority: "next",
    primary: {
      id: "verve_stock_video_builtin",
      name: "VERVE built-in stock video route",
      kind: "built_in",
      url: "/api/hcnsec/stock-video",
      useFor: "Pencarian stock video yang sudah ada: Pexels, Pixabay, Coverr.",
      note: "Ini tetap jalur utama karena sudah terpasang dan stabil di VERVE.",
    },
    backups: [
      apify("igolaizola/adobe-stock-scraper", "Adobe Stock Scraper", "Metadata/previews dari Adobe Stock untuk riset asset; lisensi wajib dicek."),
      apify("easyapi/adobe-stock-search-scraper", "Adobe Stock Search Scraper", "Cadangan pencarian image/video/illustration Adobe Stock."),
      apify("easyapi/unsplash-image-scraper", "Unsplash Image Scraper", "Cari gambar high-quality dari Unsplash untuk referensi visual."),
      apify("automation-lab/soundcloud-scraper", "SoundCloud Scraper", "Riset track/artist/trend audio; hak pakai wajib dicek."),
    ],
    outputFields: ["provider", "assetType", "title", "previewUrl", "downloadUrl", "author", "license", "sourceUrl", "tags"],
    env: ["PEXELS_API_KEY", "PIXABAY_API_KEY", "COVERR_API_KEY", "APIFY_TOKEN (opsional untuk perluasan)"],
    safety: "Asset berlisensi harus dicek; jangan otomatis masukkan media berbayar/berhak cipta ke render.",
  },
];

export function listContentApiTargets(): ContentApiTarget[] {
  return CONTENT_API_TARGETS;
}

export function getContentApiTarget(key: string): ContentApiTarget | null {
  return CONTENT_API_TARGETS.find((target) => target.key === key) || null;
}

export function listApifyActors(): string[] {
  const actors = new Set<string>();
  for (const target of CONTENT_API_TARGETS) {
    for (const provider of [target.primary, ...target.backups]) {
      if (provider.kind === "apify" && provider.actorId) actors.add(provider.actorId);
    }
  }
  return [...actors].sort();
}

export function toApifyActorPath(actorId: string): string {
  return actorId.trim().replace(/^https?:\/\/apify\.com\//, "").replace(/\/+$/g, "").replace("/", "~");
}

export function isAllowedApifyActor(actorId: string): boolean {
  const clean = actorId.trim().replace(/^https?:\/\/apify\.com\//, "").replace(/\/+$/g, "").replace("~", "/");
  return listApifyActors().includes(clean);
}
