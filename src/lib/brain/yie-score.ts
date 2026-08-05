/**
 * VERVE BRAIN v1 — Mesin skor & riset judul based-data (bukan chatbot).
 * Diport 1:1 dari otak YouTube Intelligence Engine v22 milik zhoniandre-lab
 * ke TypeScript murni (tanpa DOM). Prinsip: AI TIDAK MENGARANG ANGKA —
 * semua skor punya `reasons[]` yang bisa diaudit.
 *
 * Dipakai oleh Lahan Awalan (semua niche).
 */

/* ================= UTIL DASAR ================= */

const STOP = new Set(
  "yang dan di ke dari ini itu untuk dengan pada ada akan jadi bisa tidak tak nya se ber me ter per kan lah pun atau karena agar sebagai dalam saat ketika the of and in to a is are was were be for on by an it this that you your our new full video official lyrics lirik part episode shorts short و في من على إلى الى عن هذا هذه ذلك تلك مع أن ان كان كانت هو هي لا ما كل uchun bilan va yoki ham bu shu bir edi bor yoq juda".split(" ")
);

export function norm(s: unknown): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}0-9\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function tok(s: unknown): string[] {
  return norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
}
export function ng(t: string[], n: number): string[] {
  const o: string[] = [];
  for (let i = 0; i <= t.length - n; i++) o.push(t.slice(i, i + n).join(" "));
  return o;
}
export function cnt(a: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  a.forEach((x) => (m[x] = (m[x] || 0) + 1));
  return m;
}
export function ent(m: Record<string, number>): [string, number][] {
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
export function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
export function days(d?: string): number {
  const x = new Date(d || "");
  return isNaN(+x) ? 365 : Math.max(1, Math.round((Date.now() - +x) / 864e5));
}
export function avg(a: number[]): number {
  const f = a.filter(Number.isFinite);
  return f.length ? f.reduce((x, y) => x + y, 0) / f.length : 0;
}
export function med(a: number[]): number {
  const f = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!f.length) return 0;
  const m = Math.floor(f.length / 2);
  return f.length % 2 ? f[m] : (f[m - 1] + f[m]) / 2;
}
export function slog(n: number, k = 15): number {
  return clamp(Math.log10(Math.max(1, n) + 1) * k);
}
export function cap(s: string): string {
  return String(s || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export function uniq(a: string[]): string[] {
  const s: Record<string, boolean> = {};
  return a.filter((x) => x && !s[norm(x)] && (s[norm(x)] = true));
}
export function yearOf(s: unknown): string {
  const m = String(s || "").match(/20\d{2}/);
  return m ? m[0] : "";
}
export function jaccardSim(a: string, b: string): number {
  const A = new Set(tok(a)), B = new Set(tok(b));
  if (!A.size || !B.size) return 0;
  let i = 0;
  A.forEach((x) => B.has(x) && i++);
  return i / new Set([...A, ...B]).size;
}

/* ================= PROFIL NICHE ================= */

export type NicheId = "dj" | "horror" | "family" | "street" | "gaming" | "finance" | "general";

export const PROFILES: Record<NicheId, { label: string; keys: string[]; baseTags: Record<string, string[]> }> = {
  dj: { label: "DJ / Remix Music", keys: ["dj", "remix", "full bass", "jedag", "jedug", "tiktok", "tik tok", "nonstop", "dugem", "party mix", "club mix", "bass"], baseTags: { id: ["dj terbaru", "dj remix", "dj viral", "dj tiktok", "full bass", "dj jedag jedug", "remix terbaru", "dj nonstop"], en: ["dj remix", "latest dj remix", "full bass", "viral dj", "tiktok remix", "party mix", "nonstop dj"] } },
  horror: { label: "Horror / Ghost Story", keys: ["hantu", "horor", "horror", "mistis", "angker", "pocong", "kuntilanak", "setan", "jin", "rumah kosong", "ghost", "haunted", "scary", "creepy"], baseTags: { id: ["cerita hantu", "cerita horor", "kisah mistis", "hantu", "horor indonesia", "rumah angker", "cerita seram"], en: ["horror story", "scary story", "haunted house", "mystery story", "ghost story", "midnight horror", "true horror story"] } },
  family: { label: "Family Emotional Story", keys: ["ibu", "ayah", "orang tua", "anak yatim", "mother", "father", "family", "maaf", "rindu", "pesan terakhir"], baseTags: { id: ["cerita keluarga", "kisah menyentuh", "cerita sedih", "pesan terakhir", "kisah nyata"], en: ["family story", "emotional story", "sad story", "last message", "true story"] } },
  street: { label: "Street / Life Story", keys: ["anak jalanan", "jalanan", "pengamen", "gelandangan", "street child", "street singer"], baseTags: { id: ["anak jalanan", "kisah inspiratif", "cerita kehidupan", "perjuangan hidup", "kisah nyata"], en: ["street story", "life story", "inspiring story", "street child"] } },
  gaming: { label: "Gaming", keys: ["game", "gaming", "mobile legends", "free fire", "pubg", "roblox", "minecraft"], baseTags: { id: ["gaming", "gameplay", "tips game", "game viral"], en: ["gaming", "gameplay", "game tips", "viral game"] } },
  finance: { label: "Finance / Business", keys: ["uang", "bisnis", "finance", "investasi", "crypto", "saham", "usaha", "money", "business"], baseTags: { id: ["bisnis", "uang", "usaha", "tips finansial"], en: ["finance", "business", "money tips"] } },
  general: { label: "General Story", keys: [], baseTags: { id: ["cerita", "kisah", "informasi", "viral"], en: ["story", "information", "viral"] } },
};

/* ================= DETEKSI FORMAT & NICHE ================= */

export type ContentFormat = { id: string; label: string; queryBoost: string[]; titleBias: string[]; thumbBias: string; forceFamily: boolean };

export function detectContentFormat(seed: string, note?: string): ContentFormat {
  const t = norm((note || "") + " " + (seed || ""));
  const auto: ContentFormat = { id: "auto", label: "Auto", queryBoost: [], titleBias: [], thumbBias: "", forceFamily: false };
  if (/cerita jadi lagu|kisah jadi lagu|story to song|jadi lagu|lagu cerita|lagu sedih|musik sedih|lirik sedih|cover lagu|lagu untuk ibu|lagu ibu/.test(t) || (/lagu|song|lirik/.test(norm(note || "")) && !/dj|remix|bass|jedag/.test(t))) {
    return { id: "story_song", label: "Cerita jadi lagu / lagu sedih", queryBoost: ["lagu sedih", "cerita jadi lagu", "lagu untuk ibu", "lirik sedih", "musik sedih", "lagu viral sedih"], titleBias: ["lagu", "lirik", "cerita jadi lagu", "untuk ibu"], thumbBias: "emotional song cover art mood, not horror, not DJ club", forceFamily: true };
  }
  if (/cerita horor|cerita hantu|horror story|kisah mistis|true horror/.test(t) || /horor|hantu|horror|mistis/.test(norm(note || ""))) {
    return { id: "horror_story", label: "Cerita horor", queryBoost: ["cerita horor", "cerita hantu", "kisah mistis", "rumah angker"], titleBias: ["cerita", "hantu", "horor", "malam"], thumbBias: "cinematic horror story thumbnail", forceFamily: false };
  }
  if (/tutorial|cara |how to|tips |belajar /.test(t) && !/lagu|hantu|dj/.test(norm(note || ""))) {
    return { id: "tutorial", label: "Tutorial / edukasi", queryBoost: ["tutorial", "cara", "tips", "pemula"], titleBias: ["cara", "tutorial", "tips"], thumbBias: "clear tutorial thumbnail", forceFamily: false };
  }
  if (/podcast|bicara|curhat channel|vlog /.test(t)) {
    return { id: "talk", label: "Podcast / curhat", queryBoost: ["podcast", "curhat", "bicara"], titleBias: ["curhat", "podcast"], thumbBias: "talking head emotional podcast", forceFamily: false };
  }
  if (/dj|remix|full bass|jedag/.test(t)) {
    return { id: "dj", label: "DJ / Remix", queryBoost: ["dj terbaru", "dj remix", "full bass", "dj viral"], titleBias: ["dj", "remix", "bass"], thumbBias: "neon DJ visual", forceFamily: false };
  }
  return auto;
}

export function isExplicitDJText(t: string): boolean {
  return /(^|\s)dj(\s|$)|remix|full bass|jedag|jedug|tik ?tok|nonstop|dugem|club mix|party mix|bass mantap/.test(t);
}
export function isFamilyIntentText(t: string): boolean {
  return /ibu|mama|bunda|ayah|papa|orang tua|mother|father|mom|dad|sebelum aku lahir|sebelum lahir|mati sebelum|meninggal sebelum|wafat sebelum|pergi sebelum aku lahir|lahir tanpa|engkau yang terbaik|kau yang terbaik|terima kasih ibu|maaf ibu|rindu ibu/.test(t);
}
export function isHorrorText(t: string): boolean {
  return /hantu|horor|horror|mistis|angker|pocong|kuntilanak|setan|jin|rumah kosong|ghost|haunted|scary|creepy/.test(t);
}
export function isStreetText(t: string): boolean {
  return /anak jalanan|jalanan|pengamen|gelandangan|street child|street singer/.test(t);
}

export type NicheInfo = { id: NicheId; label: string; confidence: number; guardrail?: string; format?: ContentFormat };

export function detectNiche(textSeed: string, videos: AnalyzedVideo[], nicheNote = ""): NicheInfo {
  const seedOnly = norm(textSeed || "");
  const text = seedOnly + " " + norm(nicheNote);
  const fmt = detectContentFormat(textSeed, nicheNote);
  if (fmt.id === "story_song") return { id: "family", label: PROFILES.family.label + " · Cerita jadi lagu", confidence: 100, guardrail: "format_story_song", format: fmt };
  if (fmt.id === "horror_story") return { id: "horror", label: PROFILES.horror.label, confidence: 100, guardrail: "format_horror_story", format: fmt };
  if (fmt.id === "dj") return { id: "dj", label: PROFILES.dj.label, confidence: 100, guardrail: "format_dj", format: fmt };
  if (fmt.id === "tutorial") return { id: "general", label: "Tutorial / edukasi", confidence: 90, guardrail: "format_tutorial", format: fmt };
  if (fmt.id === "talk") return { id: "general", label: "Podcast / curhat", confidence: 85, guardrail: "format_talk", format: fmt };
  if (isFamilyIntentText(seedOnly)) return { id: "family", label: PROFILES.family.label, confidence: 100, guardrail: "family_intent", format: fmt };
  if (isExplicitDJText(seedOnly) && fmt.id === "auto") return { id: "dj", label: PROFILES.dj.label, confidence: 100, guardrail: "explicit_dj", format: fmt };
  if (isHorrorText(seedOnly) && fmt.id === "auto") return { id: "horror", label: PROFILES.horror.label, confidence: 100, guardrail: "horror_intent", format: fmt };
  if (isStreetText(seedOnly)) return { id: "street", label: PROFILES.street.label, confidence: 95, guardrail: "street_intent", format: fmt };

  const scores: Record<string, number> = {};
  (Object.keys(PROFILES) as NicheId[]).forEach((id) => (scores[id] = 0));
  (Object.entries(PROFILES) as [NicheId, (typeof PROFILES)[NicheId]][]).forEach(([id, p]) =>
    p.keys.forEach((k) => { if (text.includes(norm(k))) scores[id] += id === "dj" ? 18 : 24; })
  );
  videos.slice(0, 12).forEach((v, i) => {
    const w = 1 + (12 - i) / 12;
    (Object.entries(PROFILES) as [NicheId, (typeof PROFILES)[NicheId]][]).forEach(([id, p]) =>
      p.keys.forEach((k) => { if (v.normTitle.includes(norm(k))) scores[id] += w * (id === "dj" ? 3 : 5); })
    );
  });
  // Proteksi: kata "lagu" sendiri tak boleh menarik family/story jadi DJ.
  if (/lagu|song|music|musik/.test(text) && !isExplicitDJText(text)) { scores.dj = Math.min(scores.dj || 0, 10); scores.family = (scores.family || 0) + 18; }
  if (fmt.id === "story_song") { scores.family = (scores.family || 0) + 40; scores.dj = Math.min(scores.dj || 0, 5); }
  if (fmt.id === "horror_story") { scores.horror = (scores.horror || 0) + 40; }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0] || ["general", 0];
  const second = sorted[1] || ["general", 0];
  const conf = clamp(best[1] * 2 + (best[1] - second[1]) * 2);
  if (best[1] < 12) return { id: "general", label: PROFILES.general.label, confidence: 45 };
  return { id: best[0] as NicheId, label: PROFILES[best[0] as NicheId].label, confidence: Math.max(55, conf), guardrail: "score_based" };
}

/* ================= TIPE VIDEO & ANGLE ================= */

export type RawVideo = {
  id?: string; title?: string; url?: string; publishedAt?: string;
  channelTitle?: string; viewCount?: number; durationSec?: number;
  channel?: { subscriberCount?: number };
};

export type AnalyzedVideo = RawVideo & {
  age: number; views: number; subs: number; vpd: number; vpm: number;
  tokens: string[]; phr: string[]; normTitle: string;
  relevance?: number; manual?: boolean;
};

export type Reason = { c: "good" | "yellow" | "bad" | "info"; t: string };

export type TitlePattern = {
  id: string; label: string; count: number; weight: number;
  examples: string[]; slots: Record<string, Record<string, number>>;
};

export type Patterns = {
  topWords: [string, number][]; signals: string[]; titlePatterns: TitlePattern[]; year: string | number;
};

export type Metrics = {
  sumVpm: number; demand: number; medSubs: number; exact: number; competition: number;
  low: number; smallProof: number; fresh: number; gap: number; confidence: number;
  specificity: number; reality: number; attentionLow: number; attentionHigh: number;
};

export type Angle = {
  keyword: string; seed: string; lang: string; region: string; nicheInput: string;
  format: ContentFormat; niche: NicheInfo;
  videos: AnalyzedVideo[]; total: number; rawVideos: AnalyzedVideo[];
  qualified: AnalyzedVideo[]; rejected: AnalyzedVideo[]; manualTitles: string[];
  top: [string, number][]; freq: Record<string, number>; patterns: Patterns;
  suggest: string[]; score: number; metrics: Metrics; reasons: Reason[];
};

/* ================= ANALISIS KOMPETITOR ================= */

function keywordIntentObj(seed: string, keyword: string, nicheNote: string, fmt: ContentFormat) {
  const x = norm((seed || "") + " " + (keyword || "") + " " + (nicheNote || ""));
  return {
    deathBeforeBirth: /sebelum aku lahir|sebelum lahir|mati sebelum|meninggal sebelum|wafat sebelum|pergi sebelum aku lahir|lahir tanpa/.test(x),
    bestMother: /ibu.*terbaik|engkau yang terbaik|kau yang terbaik|mama terbaik|terima kasih ibu|ibu hebat|ibu tersayang/.test(x),
    apology: /maaf|ampuni|menyesal|terlambat/.test(x),
    longing: /rindu|kangen|merindukan|ingin bertemu/.test(x),
    song: fmt.id === "story_song" || /jadi lagu|cerita jadi lagu|lagu sedih|lirik/.test(x),
    prayer: /doa|mendoakan/.test(x),
    format: fmt.id,
  };
}
export function keywordIntent(a: Angle) {
  return keywordIntentObj(a.seed, a.keyword, a.nicheInput, a.format);
}

function competitorRelevance(v: AnalyzedVideo, seed: string, angle: string, niche: NicheInfo, manual: string[], nicheNote: string, fmt: ContentFormat): number {
  const t = v.normTitle || norm(v.title);
  const seedTok = tok(seed), angleTok = tok(angle);
  let score = 20;
  angleTok.forEach((x) => { if (t.includes(x)) score += 7; });
  seedTok.forEach((x) => { if (t.includes(x)) score += 4; });
  const id = niche.id;
  if (id === "family") {
    if (/ibu|ayah|mama|bunda|papa|orang tua|mother|father|mom|dad|maaf|mati|meninggal|wafat|sedih|doa|anak|pesan|titip/.test(t)) score += 35;
    if (/virgoun|official mv|ost|galau|cinta|pacar/.test(t) && !/ibu|ayah|maaf|mati|meninggal|anak|doa/.test(t)) score -= 28;
    const it = keywordIntentObj(seed, angle, nicheNote, fmt);
    if (it.deathBeforeBirth && /ibu|lahir|mati|meninggal|maaf|anak/.test(t)) score += 18;
    if (it.bestMother && /ibu|terima kasih|terbaik|doa/.test(t)) score += 18;
  } else if (id === "dj") {
    if (/dj|remix|bass|tiktok|jedag|nonstop/.test(t)) score += 45; else score -= 30;
  } else if (id === "horror") {
    if (/hantu|horor|seram|mistis|angker|rumah|suara|pintu|sosok|malam|ghost|haunted/.test(t)) score += 40; else score -= 18;
  } else if (id === "street") {
    if (/anak jalanan|jalanan|pengamen|perjuangan/.test(t)) score += 40;
  }
  manual.forEach((m) => {
    const mt = norm(m), mTok = tok(mt);
    const hit = mTok.filter((x) => t.includes(x)).length;
    if (hit >= 2) score += 18;
    if (mt && t.includes(mt.slice(0, 18))) score += 25;
  });
  return clamp(score);
}

function keywordExactRate(videos: AnalyzedVideo[], kw: string): number {
  const k = tok(kw);
  if (!k.length) return 0;
  return videos.filter((v) => k.every((x) => v.normTitle.includes(x))).length / Math.max(1, videos.length);
}

function classifyTitlePattern(title: string, nicheId: string): { id: string; label: string; slots: Record<string, string> } {
  const n = norm(title);
  const slots: Record<string, string> = {};
  const pickFirst = (text: string, items: string[]): string => {
    for (const x of items) { if (text.includes(norm(x))) return x; }
    return "";
  };
  if (nicheId === "dj") {
    slots.year = yearOf(title) || "";
    if (/full bass|bass/.test(n)) { slots.feature = "full bass"; return { id: "DJ_YEAR_FEATURE", label: "DJ + Tahun + Full Bass", slots }; }
    if (/tiktok|viral/.test(n)) { slots.feature = "viral tiktok"; return { id: "DJ_VIRAL_TIKTOK", label: "DJ + Viral/TikTok", slots }; }
    if (/jedag|jedug|nonstop/.test(n)) { slots.feature = "jedag nonstop"; return { id: "DJ_NONSTOP", label: "DJ + Jedag/Nonstop", slots }; }
    return { id: "DJ_REMIX_GENERAL", label: "DJ + Remix General", slots };
  }
  if (nicheId === "horror") {
    if (/jangan|do not/.test(n)) {
      slots.action = pickFirst(n, ["buka pintu", "open door"]) || "aksi";
      slots.time = pickFirst(n, ["tengah malam", "midnight", "malam"]) || "malam";
      return { id: "WARNING_ACTION_TIME", label: "Peringatan + Aksi + Waktu", slots };
    }
    if (/suara|sound/.test(n)) {
      slots.object = "suara";
      slots.place = pickFirst(n, ["rumah kosong", "rumah angker", "empty house", "haunted house"]) || "tempat gelap";
      return { id: "SOUND_PLACE", label: "Suara + Tempat", slots };
    }
    if (/aku kira|i thought/.test(n)) return { id: "FIRST_PERSON_TWIST", label: "Aku Kira + Ternyata", slots };
    if (/rumah|house/.test(n)) {
      slots.place = pickFirst(n, ["rumah kosong", "rumah angker", "empty house", "haunted house"]) || "rumah";
      return { id: "PLACE_MYSTERY", label: "Tempat + Misteri", slots };
    }
    return { id: "HORROR_STORY_GENERAL", label: "Cerita Horor General", slots };
  }
  if (nicheId === "family") {
    if (/sebelum.*lahir|before.*born|lahir tanpa/.test(n)) return { id: "LOSS_BEFORE_BIRTH", label: "Kehilangan sebelum lahir", slots };
    if (/terima kasih|thank you|terbaik|best/.test(n)) return { id: "THANKS_TARGET", label: "Terima kasih + Target", slots };
    if (/maaf|sorry|forgive/.test(n)) return { id: "APOLOGY_TARGET", label: "Maaf + Target", slots };
    if (/rindu|kangen|miss|merindukan/.test(n)) return { id: "LONGING_TARGET", label: "Rindu + Target", slots };
    if (/pesan|message/.test(n)) return { id: "MESSAGE_TARGET", label: "Pesan + Target", slots };
    if (/doa|prayer/.test(n)) return { id: "PRAYER_TARGET", label: "Doa + Target", slots };
    if (/lagu|lirik|song/.test(n)) return { id: "SONG_STORY", label: "Lagu bercerita", slots };
    return { id: "FAMILY_EMOTION_GENERAL", label: "Family Emotional General", slots };
  }
  if (nicheId === "street") {
    if (/jalan|street/.test(n)) return { id: "STREET_STRUGGLE", label: "Street + Perjuangan", slots };
    return { id: "LIFE_STORY_GENERAL", label: "Life Story General", slots };
  }
  if (/cara|how to/.test(n)) return { id: "HOW_TO_RESULT", label: "Cara + Hasil", slots };
  if (/kenapa|why/.test(n)) return { id: "WHY_SUBJECT", label: "Kenapa + Subjek", slots };
  if (/rahasia|secret/.test(n)) return { id: "SECRET_SUBJECT", label: "Rahasia + Subjek", slots };
  return { id: "GENERAL_STORY", label: "General Story Pattern", slots };
}

function mineTitlePatterns(keyword: string, videos: AnalyzedVideo[], niche: NicheInfo): TitlePattern[] {
  void keyword;
  const map: Record<string, TitlePattern> = {};
  videos.slice(0, 20).forEach((v, idx) => {
    const pat = classifyTitlePattern(v.title || "", niche.id);
    const weight = Math.log10((v.vpd || 0) + 10) + Math.log10((v.views || 0) + 10) * 0.25 + (idx < 5 ? 1.2 : 0);
    if (!map[pat.id]) map[pat.id] = { id: pat.id, label: pat.label, count: 0, weight: 0, examples: [], slots: {} };
    const m = map[pat.id];
    m.count++;
    m.weight += weight;
    m.examples.push(v.title || "");
    Object.keys(pat.slots || {}).forEach((k) => {
      m.slots[k] = m.slots[k] || {};
      const val = pat.slots[k];
      m.slots[k][val] = (m.slots[k][val] || 0) + 1;
    });
  });
  return Object.values(map).sort((a, b) => b.weight - a.weight || b.count - a.count).slice(0, 12);
}

export function extractPatterns(keyword: string, videos: AnalyzedVideo[], niche: NicheInfo): Patterns {
  const topWords = ent(cnt(videos.slice(0, 12).flatMap((v) => [...v.tokens, ...v.phr]))).filter(([t]) => t.length > 2).slice(0, 30);
  const titlePatterns = mineTitlePatterns(keyword, videos, niche);
  return { topWords, signals: topWords.map((x) => x[0]), titlePatterns, year: yearOf(keyword) || new Date().getFullYear() };
}

function gapScoreOld(freq: Record<string, number>, total: number, patterns: Patterns, niche: NicheInfo): number {
  void freq;
  let base = 60;
  if (niche.id === "dj") base += 14;
  if (niche.id === "horror") base += 12;
  const rare = patterns.topWords.filter(([, c]) => c / total < 0.22).length;
  return clamp(base + rare);
}

export function gapWords(a: Angle): string[] {
  // kata yang kemungkinan dicari orang (dari keyword/suggest) tapi jarang di judul kompetitor
  const comps = norm((a.qualified || a.videos || []).slice(0, 20).map((v) => v.title).join(" "));
  const cand = uniq([...tok(a.keyword), ...tok(a.seed || ""), ...(a.suggest || []).flatMap((x) => tok(x))]);
  return cand.filter((w) => w.length > 2 && !comps.includes(w)).slice(0, 10);
}

function kpiDemandLabel(v: number): { tag: string; tip: string } {
  v = +v || 0;
  if (v >= 75) return { tag: "TINGGI", tip: "Banyak perhatian di pasar (proxy dari performa kompetitor)." };
  if (v >= 50) return { tag: "SEDANG", tip: "Perhatian pasar cukup, masih bisa digarap." };
  return { tag: "RENDAH", tip: "Sinyal perhatian lemah — validasi long-tail dulu." };
}
function kpiLowCompLabel(v: number): { tag: string; tip: string } {
  // low = 100 - competition. Angka kecil = pasar BERAT.
  v = +v || 0;
  if (v >= 65) return { tag: "LONGGAR", tip: "Lawan relatif lebih longgar — peluang channel kecil lebih masuk akal." };
  if (v >= 35) return { tag: "SEDANG", tip: "Ada lawan, tapi masih bisa beda lewat angle/judul." };
  if (v >= 15) return { tag: "PADAT", tip: "Kompetisi tinggi — jangan jiplak SERP, wajib diferensiasi." };
  return { tag: "SANGAT PADAT", tip: "Bukan “gampang”. Demand bisa tinggi tapi masuknya susah. Kejar long-tail + judul beda." };
}
export function demandLabel(v: number) { return kpiDemandLabel(v); }
export function lowCompLabel(v: number) { return kpiLowCompLabel(v); }

export type AnalyzeOpts = {
  seed?: string; lang?: string; region?: string; nicheNote?: string;
  manualTitles?: string[]; suggest?: string[];
};

export function analyzeAngle(keyword: string, raw: { videos?: RawVideo[] }, opts: AnalyzeOpts = {}): Angle {
  const seed = opts.seed || keyword;
  const nicheNote = opts.nicheNote || "";
  const manual = (opts.manualTitles || []).filter(Boolean);
  const fmt = detectContentFormat(seed, nicheNote);

  const rawVideos: AnalyzedVideo[] = (raw.videos || [])
    .map((v) => {
      const age = days(v.publishedAt);
      const views = +v.viewCount! || 0;
      const subs = (v.channel && v.channel.subscriberCount != null ? +v.channel.subscriberCount : 0) || 0;
      const vpd = views / age, vpm = vpd * 30;
      const tokenList = tok(v.title);
      const phr = [...ng(tokenList, 2), ...ng(tokenList, 3)];
      return { ...v, age, views, subs, vpd, vpm, tokens: tokenList, phr, normTitle: norm(v.title) } as AnalyzedVideo;
    })
    .sort((a, b) => b.vpd - a.vpd);

  const preliminaryNiche = detectNiche(seed + " " + keyword, rawVideos, nicheNote);
  const scored = rawVideos
    .map((v) => ({ ...v, relevance: competitorRelevance(v, seed, keyword, preliminaryNiche, manual, nicheNote, fmt) }))
    .sort((a, b) => b.relevance! - a.relevance! || b.vpd - a.vpd);
  const threshold = 45;
  let qualified = scored.filter((v) => v.relevance! >= threshold);
  let fallbackUsed = false;
  if (qualified.length < 3) {
    qualified = scored.slice(0, Math.min(8, scored.length));
    fallbackUsed = true;
  }
  const rejected = scored.filter((v) => !qualified.some((q) => (q.id || q.title) === (v.id || v.title))).slice(0, 20);
  const manualVideos: AnalyzedVideo[] = manual.map((t, i) => {
    const tks = tok(t);
    return {
      id: "manual-" + i, title: t, channelTitle: "Manual YouTube Search", url: "#",
      publishedAt: new Date().toISOString(), views: 0, subs: 0, vpd: 0, vpm: 0,
      tokens: tks, phr: [...ng(tks, 2), ...ng(tks, 3)], normTitle: norm(t),
      manual: true, relevance: 100, age: 1,
    } as AnalyzedVideo;
  });
  const patternVideos = [...qualified, ...manualVideos];

  const videos = qualified;
  const total = Math.max(1, videos.length);
  const all = patternVideos.flatMap((v) => [...v.tokens, ...v.phr]);
  const freq = cnt(all);
  const top = ent(freq);
  const topVideos = videos.slice(0, Math.min(10, total));
  const sumVpm = topVideos.reduce((a, v) => a + v.vpm, 0);
  const demand = clamp(slog(sumVpm, 14) * 0.75 + slog(med(topVideos.map((v) => v.vpm)), 18) * 0.25);
  const medSubs = med(videos.map((v) => v.subs).filter(Boolean));
  const exact = keywordExactRate(videos, keyword);
  const saturated = top.filter(([, c]) => c / Math.max(1, patternVideos.length) >= 0.25).slice(0, 25);
  const competition = clamp(slog(medSubs, 15) + saturated.length * 3 + exact * 25);
  const low = 100 - competition;
  const small = videos.filter((v) => v.subs > 0 && v.subs < 100000 && v.views > v.subs * 1.2).length;
  const smallProof = clamp(small * 14);
  const fresh = clamp((videos.filter((v) => v.age <= 120).length / total) * 100);
  const niche = detectNiche(seed + " " + keyword, patternVideos, nicheNote);
  const patterns = extractPatterns(keyword, patternVideos, niche);
  const gap = gapScoreOld(freq, total, patterns, niche);
  const confidence = clamp(Math.min(55, total * 8) + Math.min(20, top.length * 0.4) + 25 - (fallbackUsed ? 20 : 0));
  const specificity = clamp((tok(keyword).length - tok(seed).length + 2) * 18);
  const reality = clamp(avg(qualified.map((v) => v.relevance || 0)));
  const score = clamp(demand * 0.24 + low * 0.16 + smallProof * 0.12 + gap * 0.14 + fresh * 0.08 + confidence * 0.08 + specificity * 0.04 + reality * 0.14);

  const m: Metrics = { sumVpm, demand, medSubs, exact, competition, low, smallProof, fresh, gap, confidence, specificity, reality, attentionLow: sumVpm * 0.1, attentionHigh: sumVpm * 0.35 };

  const reasons: Reason[] = [
    { c: score >= 70 ? "good" : "yellow", t: `Sudut "${keyword}" mendapat skor ${score}/100.` },
    { c: "info", t: `Niche terdeteksi: ${niche.label} (${niche.confidence}/100).${niche.guardrail && niche.guardrail !== "score_based" ? ` Guardrail aktif: ${niche.guardrail}.` : ""}` },
    { c: m.reality >= 65 ? "good" : "yellow", t: `Reality relevance ${m.reality}/100. Kompetitor dipakai ${qualified.length}, dibuang ${rejected.length}.` },
    { c: m.demand >= 65 ? "good" : "yellow", t: `Demand ${m.demand}/100 (${kpiDemandLabel(m.demand).tag}) · Ruang lawan ${m.low}/100 (${kpiLowCompLabel(m.low).tag}). Angka ruang lawan kecil = kompetisi berat.` },
    { c: fallbackUsed ? "yellow" : "good", t: fallbackUsed ? "Data relevan sedikit, mesin memakai fallback top relevance." : "Data kompetitor cukup relevan untuk dihitung." },
  ];

  return {
    keyword, seed, lang: opts.lang || "id", region: opts.region || "ID", nicheInput: nicheNote,
    format: niche.format || fmt, niche, videos, total, rawVideos: scored, qualified, rejected,
    manualTitles: manual, top, freq, patterns, suggest: opts.suggest || [],
    score, metrics: m, reasons,
  };
}

/* ================= SKOR JUDUL (HELPER v21) ================= */

function languageFit(title: string, lang: string): number {
  const t = String(title || ""), n = norm(t);
  const indo = /\b(cerita|kisah|hantu|suara|pintu|rumah|malam|aku|itu|yang|dari|jangan|terbaru|paling|enak|buat|diputar|ibu|engkau|terima kasih|lahir|lagu|lirik|rindu|ayah)\b/.test(n);
  if (lang === "en") {
    if (indo) return 20;
    if (/\b(the|sound|door|house|story|wind|midnight|latest|viral|remix|bass|mother|mom|born)\b/.test(n)) return 100;
    return 70;
  }
  // default id
  return indo || /[a-z]/.test(n) ? 100 : 65;
}

function intentFitScore(title: string, a: Angle): number {
  const it = keywordIntent(a), n = norm(title);
  if (a.niche.id !== "family") return 65;
  if (it.deathBeforeBirth) return /sebelum aku lahir|lahir tanpa|tak pernah mengenal|tak pernah sempat|pergi sebelum/.test(n) ? 100 : 25;
  if (it.bestMother) return /terbaik|terima kasih|doa|rumah|engkau yang terbaik/.test(n) ? 100 : 30;
  if (it.apology) return /maaf|ampuni|menyesal|terlambat|sorry|forgive/.test(n) ? 100 : 35;
  if (it.longing) return /rindu|kangen|miss/.test(n) ? 100 : 40;
  return 65;
}

function creatorHookScore(title: string, a: Angle): number {
  const n = norm(title), id = a.niche.id;
  const it = keywordIntent(a);
  let score = 48;
  if (title.length >= 32 && title.length <= 82) score += 12;
  if (/[?؟]/.test(title)) score += 6;
  if (id === "dj") {
    if (/full bass|bass/.test(n)) score += 22;
    if (/viral|tiktok/.test(n)) score += 18;
    if (/nonstop|jedag|jedug|remix/.test(n)) score += 14;
  }
  if (id === "horror") {
    if (/suara|sound/.test(n)) score += 22;
    if (/pintu|door/.test(n)) score += 18;
    if (/malam|midnight|rumah|house/.test(n)) score += 18;
    if (/jangan|do not/.test(n)) score += 14;
  }
  if (id === "family") {
    if (it.deathBeforeBirth && /lahir|born|mengenal/.test(n)) score += 26;
    if (it.bestMother && /terbaik|best|terima kasih/.test(n)) score += 24;
    if (it.apology && /maaf|sorry|menyesal/.test(n)) score += 24;
    if (it.longing && /rindu|miss/.test(n)) score += 20;
    if (/ibu|mother|mom|ayah/.test(n)) score += 12;
  }
  if (/kisah|cerita|story/.test(n)) score += 7;
  if (/yang jarang|rahasia di balik|hidden side/.test(n)) score -= 8;
  return clamp(score);
}

function titleQuality(t: string): number {
  const n = norm(t), w = n.split(" ");
  let score = 100;
  const seen: Record<string, number> = {};
  w.forEach((x) => {
    seen[x] = (seen[x] || 0) + 1;
    if (seen[x] > 1 && x.length > 3) score -= 25;
  });
  if (/hantu hantu|dj dj|story story|ini ini/.test(n)) score -= 70;
  if (t.length < 18) score -= 8;
  if (t.length > 105) score -= 20;
  return clamp(score);
}

function nicheTitleFit(t: string, a: Angle): number {
  const n = norm(t), id = a.niche.id;
  if (id === "dj") return /dj|remix|bass|tiktok|jedag|nonstop/.test(n) ? 95 : 25;
  if (id === "horror") return /hantu|horor|suara|pintu|rumah|sosok|malam|ghost|horror|door|sound/.test(n) ? 92 : 35;
  if (id === "family") return /pesan|doa|maaf|terakhir|ibu|ayah|family|lagu|lirik|rindu/.test(n) ? 88 : 40;
  if (id === "street") return /jalanan|street|perjuangan|suara/.test(n) ? 88 : 40;
  return 65;
}

function patternFitScore(t: string, a: Angle): number {
  const n = norm(t);
  let hit = 0;
  a.patterns.signals.slice(0, 18).forEach((x) => { if (n.includes(x)) hit++; });
  return clamp(hit * 12 + 45);
}

function patternBornFit(t: string, a: Angle): number {
  const n = norm(t);
  let best = 35;
  (a.patterns.titlePatterns || []).slice(0, 5).forEach((p, i) => {
    const b = 45 + (5 - i) * 7;
    if (p.id === "DJ_YEAR_FEATURE" && /dj|remix/.test(n) && /bass/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "DJ_VIRAL_TIKTOK" && /dj|remix/.test(n) && /viral|tiktok/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "DJ_NONSTOP" && /nonstop|jedag|jedug/.test(n)) best = Math.max(best, b + 18);
    if (p.id === "WARNING_ACTION_TIME" && /jangan|do not|pintu|door/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "SOUND_PLACE" && /suara|sound/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "FIRST_PERSON_TWIST" && /aku kira|i thought/.test(n)) best = Math.max(best, b + 18);
    if (p.id === "PLACE_MYSTERY" && /rumah|house|misteri|secret/.test(n)) best = Math.max(best, b + 15);
    if (p.id === "LOSS_BEFORE_BIRTH" && /lahir|born/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "THANKS_TARGET" && /terima kasih|thank|terbaik|best/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "APOLOGY_TARGET" && /maaf|sorry/.test(n)) best = Math.max(best, b + 20);
    if (p.id === "MESSAGE_TARGET" && /pesan|message/.test(n)) best = Math.max(best, b + 15);
    if (p.id === "LONGING_TARGET" && /rindu|kangen|miss/.test(n)) best = Math.max(best, b + 18);
    if (p.id === "SONG_STORY" && /lagu|lirik/.test(n)) best = Math.max(best, b + 18);
  });
  return clamp(best);
}

function ctrScore(t: string, a: Angle): number {
  const n = norm(t), id = a.niche.id;
  let s = 45;
  if (/[?؟]/.test(t)) s += 7;
  if (id === "dj" && /full bass|viral|tiktok|nonstop|jedag|remix/.test(n)) s += 35;
  if (id === "horror" && /suara|pintu|malam|sendiri|sosok|rumah|door|midnight|sound/.test(n)) s += 35;
  if (id === "family" && /terakhir|maaf|doa|rahasia|rindu/.test(n)) s += 25;
  return clamp(s);
}

function titleStrategy(search: number, browse: number, a: Angle): string {
  let base = search >= browse + 10 ? "Search-led" : browse >= search + 10 ? "Browse-led" : "Search + Browse Hybrid";
  if (a.niche.id === "horror") base += " / Curiosity Hook";
  if (a.niche.id === "family") base += " / Emotional Storytelling";
  if (a.niche.id === "dj") base += " / Trend Search Hook";
  return base;
}

/* ================= PAKET UPLOAD (DESKRIPSI/TAG/HOOK) ================= */

function validTag(t: string): boolean {
  return !!t && t.length >= 2 && t.length <= 36 && t.split(" ").length <= 4 && !/official|download|mp3|mp4/.test(t);
}
function buildTags(a: Angle): string[] {
  const base = (PROFILES[a.niche.id].baseTags[a.lang] || PROFILES[a.niche.id].baseTags.id || []) as string[];
  const tags = [...base, ...tok(a.keyword), ...a.patterns.signals.slice(0, 8)].map(norm).filter(validTag);
  const out: string[] = [];
  tags.forEach((t) => { if (out.indexOf(t) < 0 && out.length < 22) out.push(t); });
  return out;
}
function descriptionFor(title: string, a: Angle, hash: string): string {
  const id = a.niche.id;
  if (id === "dj") {
    return `${title}\n\nNikmati DJ remix terbaru dengan beat full bass yang cocok buat santai, party, perjalanan malam, atau nemenin aktivitas kamu. Dengarkan pakai headset atau speaker biar bass-nya lebih terasa.\n\nKalau kamu suka vibe DJ seperti ini, jangan lupa like, komentar bagian favorit kamu, dan subscribe untuk update DJ remix terbaru berikutnya.\n\n${hash}`;
  }
  if (id === "horror") {
    return `${title}\n\nTidak semua cerita horor dimulai dengan teriakan. Kadang semuanya bermula dari suara kecil, bayangan yang lewat sebentar, atau pintu yang seharusnya tetap tertutup.\n\nTonton sampai akhir, karena detail kecil di awal bisa berubah makna setelah kamu tahu apa yang sebenarnya terjadi. Kalau kamu suka cerita hantu dan kisah mistis, jangan lupa subscribe.\n\n${hash}`;
  }
  if (id === "family") {
    const it = keywordIntent(a);
    if (it.deathBeforeBirth) return `${title}\n\nCerita ini tentang seorang anak yang tidak pernah mendapat kesempatan mengenal ibunya sejak lahir. Ada rindu yang tidak pernah sempat diucapkan, ada doa yang hanya bisa disampaikan lewat cerita dan lagu.\n\nDengarkan sampai akhir, karena pesan terdalamnya ada pada rasa kehilangan yang tidak pernah bisa diganti. Jika cerita ini menyentuh hatimu, tulis doa terbaik untuk ibu di komentar.\n\n${hash}`;
    if (it.bestMother) return `${title}\n\nVideo ini adalah ungkapan terima kasih untuk ibu: sosok yang selalu memberi, mendoakan, dan menjadi tempat pulang terbaik dalam hidup. Kadang kata sederhana seperti "terima kasih" terasa tidak cukup untuk semua pengorbanannya.\n\nTonton sampai akhir dan kirimkan video ini untuk seseorang yang ingin kamu ingatkan tentang hebatnya seorang ibu.\n\n${hash}`;
    if (it.apology) return `${title}\n\nAda penyesalan yang datang terlambat, terutama saat kita baru sadar betapa besar cinta seorang ibu. Video ini mengangkat rasa maaf, rindu, dan harapan agar kita tidak terlambat menghargai orang yang paling tulus mencintai kita.\n\nTonton sampai akhir, lalu tulis satu kalimat yang ingin kamu sampaikan untuk ibu.\n\n${hash}`;
    if (it.longing) return `${title}\n\nRindu itu tidak selalu bisa diucapkan langsung. Video ini mengubah rindu menjadi cerita dan lagu, buat kamu yang sedang menahan rindu yang sama.\n\nDengarkan sampai akhir. Kalau kamu juga sedang rindu, tulis namanya di komentar — semoga rindumu tersampaikan.\n\n${hash}`;
  }
  return `${title}\n\nVideo ini dibuat untuk membahas ${a.keyword} dengan gaya yang mudah dipahami dan tetap menarik untuk ditonton sampai akhir.\n\nKalau video ini bermanfaat atau menghibur, tinggalkan komentar dan subscribe untuk update berikutnya.\n\n${hash}`;
}
function hookFor(title: string, a: Angle): string {
  const n = norm(title), id = a.niche.id;
  if (id === "dj") {
    const y = yearOf(title) || yearOf(a.keyword);
    if (/full bass|bass/.test(n)) return y ? `FULL BASS ${y}` : "FULL BASS";
    if (/tiktok|viral/.test(n)) return "DJ VIRAL";
    if (/jedag|jedug/.test(n)) return "JEDAG JEDUG";
    return y ? `DJ ${y}` : "DJ REMIX";
  }
  if (id === "horror") {
    if (/suara/.test(n)) return "SUARA ITU";
    if (/pintu/.test(n)) return "PINTU TERBUKA";
    return "KISAH HANTU";
  }
  if (id === "family") {
    const it = keywordIntent(a);
    if (it.deathBeforeBirth) return "SEBELUM AKU LAHIR";
    if (it.bestMother) return "IBU TERBAIK";
    if (it.apology) return "MAAF IBU";
    if (it.longing) return "AKU RINDU";
  }
  return tok(title).slice(0, 3).map((x) => x.toUpperCase()).join(" ");
}
export function makePack(title: string, a: Angle): { desc: string; tags: string; hook: string } {
  const tags = buildTags(a);
  const hash = tags.slice(0, 5).map((t) => "#" + t.replace(/\s+/g, "")).join(" ");
  return { desc: descriptionFor(title, a, hash), tags: tags.join(", "), hook: hookFor(title, a) };
}

/* ================= KANDIDAT JUDUL ================= */

function candidateFromPattern(p: TitlePattern, a: Angle): string[] {
  const id = a.niche.id, y = yearOf(a.keyword) || String(a.patterns.year) || String(new Date().getFullYear());
  const topSlot = (pattern: TitlePattern, key: string, fallback: string): string => {
    const obj = pattern && pattern.slots && pattern.slots[key];
    if (!obj) return fallback;
    const topE = Object.entries(obj).sort((x, z) => z[1] - x[1])[0];
    return topE ? topE[0] : fallback;
  };
  if (id === "dj") {
    const feat = topSlot(p, "feature", "full bass");
    if (p.id === "DJ_YEAR_FEATURE") return [`DJ Terbaru ${y} ${cap(feat)} Viral`, `DJ Remix ${y} ${cap(feat)} Paling Dicari`];
    if (p.id === "DJ_VIRAL_TIKTOK") return [`DJ Viral TikTok ${y} Full Bass`, `DJ TikTok ${y} Remix Terbaru`];
    return [`DJ Jedag Jedug ${y} Nonstop Full Bass`, `DJ Remix ${y} Nonstop Party`];
  }
  if (id === "horror") {
    const place = topSlot(p, "place", "Rumah Kosong"), time = topSlot(p, "time", "Tengah Malam");
    if (p.id === "WARNING_ACTION_TIME") return [`Jangan Buka Pintu Setelah ${cap(time)}`, `Jangan Pernah Buka Pintu Itu Saat ${cap(time)}`];
    if (p.id === "SOUND_PLACE") return [`Suara Itu Datang dari ${cap(place)}`, `Aku Mendengar Suara dari ${cap(place)}`];
    if (p.id === "FIRST_PERSON_TWIST") return ["Aku Kira Itu Angin, Ternyata Ada yang Mengikuti"];
    return [`Misteri di Balik ${cap(place)}`, `Warga Tidak Pernah Cerita Tentang ${cap(place)}`];
  }
  if (id === "family") {
    const it = keywordIntent(a);
    if (p.id === "LOSS_BEFORE_BIRTH" || it.deathBeforeBirth) return ["Ibu, Engkau Pergi Sebelum Aku Lahir", "Aku Lahir Tanpa Sempat Mengenal Ibu"];
    if (p.id === "THANKS_TARGET" || it.bestMother) return ["Terima Kasih Ibu, Engkau yang Terbaik", "Lagu untuk Ibu Terbaik dalam Hidupku"];
    if (p.id === "APOLOGY_TARGET" || it.apology) return ["Maaf Ibu, Aku Terlambat Mengerti"];
    if (p.id === "LONGING_TARGET" || it.longing) return ["Ibu Aku Rindu | Kisah & Lagu", "Rindu Ibu yang Tak Pernah Hilang"];
    if (p.id === "SONG_STORY") return [`${cap(a.keyword)} | Kisah & Lagu`];
    return ["Pesan Terakhir yang Tak Pernah Terbaca"];
  }
  return [];
}

export function buildPatternBornCandidates(a: Angle): string[] {
  const pats = (a.patterns && a.patterns.titlePatterns) || [];
  const out: string[] = [];
  pats.slice(0, 6).forEach((p) => { out.push(...candidateFromPattern(p, a)); });
  return out;
}

function titleBankFamilyIntent(a: Angle): string[] {
  const it = keywordIntent(a);
  if (it.deathBeforeBirth) return [
    "Ibu, Engkau Pergi Sebelum Aku Lahir", "Aku Lahir Tanpa Sempat Mengenal Ibu",
    "Lagu untuk Ibu yang Tak Pernah Sempat Kupeluk", "Sebelum Aku Lahir, Ibu Sudah Pergi",
    "Doa Anak untuk Ibu yang Tak Pernah Ia Kenal", "Kisah & Lagu: Ibu yang Pergi Sebelum Aku Lahir",
  ];
  if (it.bestMother) return [
    "Ibu, Engkau yang Terbaik", "Terima Kasih Ibu, Engkau yang Terbaik",
    "Lagu untuk Ibu Terbaik dalam Hidupku", "Ibu Terbaik, Doamu Selalu Menjagaku",
    "Kisah & Lagu: Ibu, Engkau yang Terbaik", "Untuk Ibu yang Selalu Menjadi Rumah",
  ];
  if (it.apology) return [
    "Maaf Ibu, Aku Terlambat Mengerti", "Ibu, Maafkan Aku yang Pernah Menyakitimu",
    "Aku Menyesal Setelah Mengerti Cinta Ibu", "Maaf Ibu, Doamu Baru Aku Sadari",
  ];
  if (it.longing) return [
    "Ibu, Aku Rindu Suaramu", "Rindu Ibu yang Tak Pernah Hilang",
    "Lagu Rindu untuk Ibu", "Aku Ingin Sekali Bertemu Ibu",
  ];
  return [
    "Pesan Terakhir yang Tak Pernah Terbaca", "Aku Baru Mengerti Setelah Terlambat",
    "Rahasia di Balik Senyum yang Selalu Kuat", "Sebelum Terlambat, Pesan Ini Ditinggalkan",
  ];
}

function keywordBasedVariants(kw: string, id: string, y: string | number, a: Angle): string[] {
  void kw;
  const it = keywordIntent(a);
  if (id === "family" && it.deathBeforeBirth) return ["Ibu Pergi Sebelum Aku Lahir", "Aku Tak Pernah Sempat Memanggilmu Ibu", "Lagu Anak yang Tak Pernah Mengenal Ibunya"];
  if (id === "family" && it.bestMother) return ["Ibu Engkau yang Terbaik", "Terima Kasih Untuk Ibu Terbaik", "Lagu Untuk Ibu Terbaik"];
  if (id === "family" && it.longing) return [`${cap(a.keyword)} | Kisah & Lagu`, "Lagu Rindu yang Bikin Nangis"];
  if (id === "dj") return [`DJ ${y} Full Bass`, `DJ ${y} Nonstop`, `DJ ${y} Viral TikTok`];
  if (id === "horror") return ["Cerita Hantu Rumah Kosong", "Suara Misterius Tengah Malam", "Jangan Buka Pintu Malam Hari"];
  return [];
}

export function buildCandidates(a: Angle): string[] {
  const id = a.niche.id, kw = a.keyword, y = yearOf(kw) || new Date().getFullYear();
  let out: string[] = [];
  if (id === "dj") {
    out = [`DJ Terbaru ${y} Full Bass Viral`, `DJ Remix ${y} Paling Enak Buat Diputar`, `DJ Viral TikTok ${y} Full Bass`, `DJ Jedag Jedug ${y} Nonstop Full Bass`, `DJ Remix Terbaru ${y} Bass Mantap`, `DJ Full Bass ${y} Buat Santai dan Party`];
  } else if (id === "horror") {
    out = ["Suara Itu Datang dari Rumah Kosong", "Aku Kira Itu Angin, Ternyata Ada yang Mengikuti", "Jangan Buka Pintu Setelah Tengah Malam", "Ada Sosok di Ujung Lorong Malam Itu", "Lampu Padam, Lalu Suara Itu Muncul Lagi", "Rumah Itu Kosong Bukan Tanpa Alasan"];
  } else if (id === "family") {
    out = titleBankFamilyIntent(a);
  } else if (id === "street") {
    out = ["Kisah Anak Jalanan yang Tak Pernah Menyerah", "Suara dari Jalanan yang Membuat Orang Terdiam", "Dari Jalanan ke Lagu: Perjalanan yang Menyentuh"];
  } else {
    out = ["Kisah yang Jarang Orang Ceritakan", "Sisi Tersembunyi yang Mulai Terlihat", "Satu Detail Kecil yang Mengubah Cerita Ini", "Kenapa Topik Ini Banyak Dicari?"];
  }
  // varian berbasis keyword + kandidat dari pola kompetitor + versi "| Cerita Jadi Lagu"
  const songForm = a.format.id === "story_song" && !/cerita jadi lagu/i.test(kw) ? [`${cap(kw)} | Cerita Jadi Lagu`] : [];
  return uniq([...out, ...keywordBasedVariants(kw, id, y, a), ...buildPatternBornCandidates(a), ...songForm]);
}

/* ================= OTAK v22: DNA, UNIQUENESS, GAP, HOOK, BELAJAR ================= */

export type Dna = { search: number; browse: number; unique: number; gap: number; hook: number; quality: number; label: string };

export function channelDNA(nicheId: string, formatId: string): Dna {
  if (nicheId === "family" || formatId === "story_song") {
    return { search: 0.12, browse: 0.20, unique: 0.18, gap: 0.10, hook: 0.14, quality: 0.07, label: "Family/Story Song - Browse+Emotion first" };
  }
  if (nicheId === "horror") {
    return { search: 0.11, browse: 0.22, unique: 0.16, gap: 0.09, hook: 0.16, quality: 0.06, label: "Horror - CTR/Curiosity first" };
  }
  if (nicheId === "dj") {
    return { search: 0.20, browse: 0.14, unique: 0.12, gap: 0.08, hook: 0.10, quality: 0.06, label: "DJ - Search first" };
  }
  return { search: 0.14, browse: 0.17, unique: 0.15, gap: 0.10, hook: 0.10, quality: 0.07, label: "General" };
}

export type BrainResult = {
  title: string; ctr?: number | ""; impressions?: number | ""; avdSec?: number | ""; time?: number;
};
export type BrainMemory = { researches: unknown[]; results: BrainResult[] };

function titlePerformanceStats(title: string, brain: BrainMemory) {
  const nt = norm(title);
  if (!nt) return null;
  const rows: (BrainResult & { _sim: number })[] = [];
  (brain.results || []).forEach((res) => {
    const tnorm = norm(res.title || "");
    if (!tnorm) return;
    const s = jaccardSim(nt, tnorm);
    if (s >= 0.55) rows.push({ ...res, _sim: s });
  });
  if (!rows.length) return null;
  let wSum = 0, ctr = 0, imp = 0, avd = 0, ageSum = 0, n = 0;
  const now = Date.now();
  rows.forEach((r) => {
    const ageDays = Math.max(0, Math.round((now - (+r.time! || now)) / 864e5));
    const timeDecay = Math.pow(0.5, ageDays / 30); // half-life 30 hari
    const w = r._sim * timeDecay;
    if (r.ctr != null && r.ctr !== "") ctr += (+r.ctr) * w;
    if (r.impressions != null && r.impressions !== "") imp += (+r.impressions) * w;
    if (r.avdSec != null && r.avdSec !== "") avd += (+r.avdSec) * w;
    ageSum += ageDays * w;
    wSum += w; n++;
  });
  if (wSum <= 0) return { n: rows.length } as const;
  return { n, avgCtr: ctr / wSum, avgImp: imp / wSum, avgAvd: avd / wSum, avgAgeDays: ageSum / wSum } as const;
}

export function learningBoostV2(title: string, brain: BrainMemory): { delta: number; why: string; bayesCtr?: number } {
  const st = titlePerformanceStats(title, brain);
  if (!st || !st.n) return { delta: 0, why: "" };

  const priorCtr = 4.5, priorN = 5;
  const n = st.n;
  const observed = ("avgCtr" in st && st.avgCtr) || 0;
  const weight = n / (n + priorN);
  const bayesCtr = weight * observed + (1 - weight) * priorCtr;

  let delta = 0;
  const why: string[] = [];
  if (bayesCtr >= 8.0) { delta += 22; why.push(`CTR Bayes tinggi ~${bayesCtr.toFixed(1)}%`); }
  else if (bayesCtr >= 5.5) { delta += 14; why.push(`CTR Bayes oke ~${bayesCtr.toFixed(1)}%`); }
  else if (bayesCtr >= 3.5) { delta += 4; why.push(`CTR Bayes sedang ~${bayesCtr.toFixed(1)}%`); }
  else if (bayesCtr >= 2.0) { delta -= 4; why.push(`CTR Bayes rendah ~${bayesCtr.toFixed(1)}%`); }
  else { delta -= 18; why.push(`CTR Bayes lemah ~${bayesCtr.toFixed(1)}%`); }

  if (n >= 3) { delta += 3; why.push(`n=${n} sampel, confidence naik`); }

  try {
    const recentFail = (brain.results || []).slice(0, 12).some((r) => {
      const age = (Date.now() - (+r.time! || 0)) / 864e5;
      if (age > 14) return false;
      const s = jaccardSim(title, r.title || "");
      return s >= 0.60 && r.ctr != null && r.ctr !== "" && +r.ctr < 3.0;
    });
    if (recentFail) { delta -= 8; why.push("Fail CTR <3% dalam 14 hari terakhir, mirip judul"); }
  } catch { /* abaikan */ }

  if ("avgAvd" in st && st.avgAvd != null && st.avgAvd > 0 && st.avgAvd < 25) {
    delta -= 5; why.push("AVD historis pendek");
  }

  delta = Math.max(-24, Math.min(26, Math.round(delta)));
  return { delta, why: why.join(" · "), bayesCtr };
}

export function uniquenessV2(title: string, comps: AnalyzedVideo[]): { unique: number; maxSim: number; serpPenalty: number; bonus: number } {
  let maxSim = 0;
  (comps || []).slice(0, 12).forEach((v) => { maxSim = Math.max(maxSim, jaccardSim(title, v.title || "")); });
  const unique = clamp(98 - maxSim * 85);
  let serpPenalty = 0;
  if (maxSim >= 0.85) serpPenalty = 32;
  else if (maxSim >= 0.72) serpPenalty = 20;
  else if (maxSim >= 0.60) serpPenalty = 10;
  const bonus = maxSim < 0.45 ? 4 : 0;
  return { unique, maxSim, serpPenalty, bonus };
}

function gapPhrasesV2(a: Angle): string[] {
  const comps = norm((a.qualified || a.videos || []).slice(0, 15).map((v) => v.title).join(" "));
  const phrases: string[] = [];
  ((a.patterns && a.patterns.signals) || []).forEach((s) => {
    const w = String(s).split(/\s+/).length;
    if (w >= 2 && w <= 4 && !comps.includes(norm(s))) phrases.push(s);
  });
  return [...new Set(phrases)].slice(0, 8);
}

export function gapScoreV2(a: Angle): { words: string[]; phrases: string[]; count_words: number; count_phrases: number } {
  const gw = gapWords(a);
  const gp = gapPhrasesV2(a);
  return { words: gw, phrases: gp, count_words: gw.length, count_phrases: gp.length };
}

export function psychologyHookScoreV2(title: string, a: Angle): number {
  let base = creatorHookScore(title, a);
  const n = norm(title);
  let delta = 0;
  if (/anakmu menangis|jangan pergi|terlambat minta maaf|dengar sampai habis|air mata ibu|rindu yang membunuh|ibu di mana/.test(n)) delta += 14;
  if (/^(maaf ibu|rindu ibu|big hook|maafkan aku ibu)$/i.test(String(title).trim())) delta -= 35;
  const fmt = a.format.id;
  if (fmt === "story_song") {
    if (/lagu|lirik|nangis|dengar|cerita jadi lagu/.test(n)) delta += 8;
    if (/dj|remix|bass|hantu|horor/.test(n)) delta -= 22;
  }
  return clamp(base + delta);
}

/* ================= SKOR JUDUL v22 (UTAMA) ================= */

export type ScoredTitle = {
  title: string; score: number; search: number; browse: number; algo: number;
  quality: number; langFit: number; intentFit: number; patternBorn: number; hookScore: number;
  unique: number; maxCompSim: number; gapBoost: number; formatBoost: number;
  strategy: string; desc: string; tags: string; hook: string; reasons: Reason[];
  dna: string; learningDelta: number; learningWhy: string; confidencePenalty: number;
  gap_words: string[]; gap_phrases: string[];
};

export function scoreTitleV2(title: string, a: Angle, brain: BrainMemory = { researches: [], results: [] }, usedTitles: string[] = []): ScoredTitle {
  const nt = norm(title);
  const kwTok = tok(a.keyword || "");
  const terms = tok(title);
  const cover = kwTok.length ? kwTok.filter((k) => terms.some((t) => t.includes(k) || k.includes(t))).length / kwTok.length : 0.4;

  const titleQ = titleQuality(title);
  const langFit = languageFit(title, a.lang || "id");
  const intentFit = intentFitScore(title, a);
  const nicheFit = nicheTitleFit(title, a);
  const patternFit = patternFitScore(title, a);
  const patternBorn = patternBornFit(title, a);
  const ctr = ctrScore(title, a);

  const comps = a.qualified || a.videos || [];
  const uniqR = uniquenessV2(title, comps);

  const gap = gapScoreV2(a);
  const wc = title.split(/\s+/).length;
  const gapBoost = clamp(gap.count_words * 10 + gap.count_phrases * 16 + (wc >= 4 && wc <= 12 ? 6 : 0));

  const hookScore = psychologyHookScoreV2(title, a);

  let formatBoost = 0;
  const fmt = a.format.id || "auto";
  if (fmt === "story_song") {
    if (/lagu|lirik|cerita jadi lagu|dengar|nyanyi|musik/.test(nt)) formatBoost = 18;
    else formatBoost = -8;
    if (/dj|remix|bass|jedag|hantu|horor/.test(nt)) formatBoost = -24;
  }
  if (fmt === "horror_story") {
    if (/hantu|horor|seram|mistis|pintu|suara/.test(nt)) formatBoost = 16;
    else if (/lagu|dj/.test(nt)) formatBoost = -14;
  }

  let memoryPenalty = 0;
  if ((usedTitles || []).some((m) => norm(m) === nt)) memoryPenalty = 14;

  const languagePenalty = langFit < 50 ? 38 : 0;

  const dna = channelDNA(a.niche.id, fmt);

  const search = clamp(cover * 34 + nicheFit * 0.16 + langFit * 0.07 + intentFit * 0.18 + patternBorn * 0.07 + hookScore * 0.05 + gapBoost * 0.10 - uniqR.serpPenalty * 0.15);
  const browse = clamp(ctr * 0.24 + hookScore * 0.18 + uniqR.unique * 0.24 + patternFit * 0.08 + patternBorn * 0.08 + titleQ * 0.05 + intentFit * 0.05 + gapBoost * 0.06 - uniqR.serpPenalty * 0.12);
  const algo = clamp(search * 0.20 + browse * 0.30 + (a.metrics.demand || 0) * 0.14 + (a.metrics.low || 0) * 0.14 + (a.metrics.fresh || 0) * 0.07 + patternBorn * 0.05 + uniqR.unique * 0.08 + hookScore * 0.04);

  const learn = learningBoostV2(title, brain);

  const qualifiedN = (a.qualified || []).length;
  let confidencePenalty = 0;
  if (qualifiedN >= 5) confidencePenalty = 0;
  else if (qualifiedN >= 3) confidencePenalty = 5;
  else if (qualifiedN >= 1) confidencePenalty = 14;
  else confidencePenalty = 28;

  let score =
    search * dna.search +
    browse * dna.browse +
    algo * 0.14 +
    titleQ * 0.07 +
    uniqR.unique * dna.unique +
    (a.metrics.demand || 0) * 0.06 +
    langFit * 0.03 +
    intentFit * 0.08 +
    patternBorn * 0.05 +
    hookScore * dna.hook +
    gapBoost * dna.gap +
    formatBoost +
    (learn.delta || 0) -
    memoryPenalty -
    languagePenalty -
    uniqR.serpPenalty * 0.35 +
    uniqR.bonus -
    confidencePenalty;

  score = clamp(score);

  const reasons: Reason[] = [];
  reasons.push({ c: uniqR.unique >= 65 ? "good" : uniqR.unique >= 50 ? "yellow" : "bad", t: `Uniqueness ${uniqR.unique}/100 (kemiripan maks kompetitor ${Math.round(uniqR.maxSim * 100)}%)` });
  reasons.push({ c: gapBoost >= 20 ? "good" : "info", t: `Gap ${gapBoost}/100 — kata: ${gap.words.join(", ") || "-"} | frasa: ${gap.phrases.join(", ") || "-"}` });
  if (formatBoost) reasons.push({ c: formatBoost > 0 ? "good" : "bad", t: `Format channel boost ${formatBoost > 0 ? "+" : ""}${formatBoost}` });
  if (learn.delta) reasons.push({ c: learn.delta >= 0 ? "good" : "bad", t: `Memori otak: ${learn.why} (Δ ${learn.delta >= 0 ? "+" : ""}${learn.delta})` });
  if (confidencePenalty) reasons.push({ c: "yellow", t: `Data kompetitor tipis (${qualifiedN} video) — penalti keyakinan -${confidencePenalty}` });
  reasons.push({ c: "info", t: `DNA ${dna.label} — Search×${dna.search} Browse×${dna.browse} Hook×${dna.hook}` });
  reasons.push({ c: "info", t: `Skor ${score} · Search ${search} · Browse ${browse} · Pola ${patternBorn} · Hook ${hookScore} · Mutu ${titleQ}` });

  const pack = makePack(title, a);

  return {
    title, score, search, browse, algo,
    quality: titleQ, langFit, intentFit, patternBorn, hookScore,
    unique: uniqR.unique, maxCompSim: uniqR.maxSim, gapBoost, formatBoost,
    strategy: titleStrategy(search, browse, a),
    desc: pack.desc, tags: pack.tags, hook: pack.hook,
    reasons, dna: dna.label, learningDelta: learn.delta || 0, learningWhy: learn.why || "",
    confidencePenalty, gap_words: gap.words, gap_phrases: gap.phrases,
  };
}
