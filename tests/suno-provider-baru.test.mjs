// 🎵🧪 v19.78 — provider baru (sunoapi / evolink / cometapi / ttapi)
// Jalankan: node tests/suno-provider-baru.test.mjs
import { readFileSync } from "fs";

const route = readFileSync(new URL("../src/app/api/hcnsec/music/route.ts", import.meta.url), "utf8");
const norm = readFileSync(new URL("../src/lib/suno-normalize.ts", import.meta.url), "utf8");
const meta = readFileSync(new URL("../src/lib/suno-providers.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const health = readFileSync(new URL("../src/app/api/hcnsec/music/health/route.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎵 Menguji provider lagu baru (v19.78)");

/* ---- daftar UI: 4 lama + 4 baru, bukan yang mati ---- */
for (const id of ["kie", "sunor", "musicapi", "aimusicapi", "sunoapi", "evolink", "cometapi", "ttapi"]) {
  T(`meta UI punya ${id}`, new RegExp(`id: "${id}"`).test(meta));
}
T("meta punya tautan ambil key sunoapi.org", /sunoapi\.org\/api-key/.test(meta));
T("meta punya tautan evolink dashboard", /evolink\.ai\/dashboard/.test(meta));
T("meta punya tautan comet console/token", /cometapi\.com\/console\/token/.test(meta));
T("meta punya tautan ttapi dashboard", /dashboard\.ttapi\.io/.test(meta));
T("SunoStudio pakai META_PROV_SUNO", /META_PROV_SUNO/.test(studio));
T("SunoPanel pakai META_PROV_SUNO", /META_PROV_SUNO/.test(panel));
T("Lahan dropdown punya evolink+ttapi+comet+sunoapi", /evolink/.test(lahan) && /ttapi/.test(lahan) && /cometapi/.test(lahan) && /sunoapi/.test(lahan));
T("Lahan TIDAK tawarkan apiframe/aimusic.so di dropdown", !/id: "apiframe"/.test(lahan) && !/aimusic\.so/.test(lahan));

/* ---- route: endpoint + body + header ---- */
T("route: base sunoapi.org", /api\.sunoapi\.org\/api\/v1/.test(route));
T("route: base evolink", /api\.evolink\.ai/.test(route));
T("route: base cometapi", /api\.cometapi\.com/.test(route));
T("route: base ttapi", /api\.ttapi\.io/.test(route));
T("route: generate evolink /v1/audios/generations", /\/v1\/audios\/generations/.test(route));
T("route: poll evolink /v1/tasks/", /\/v1\/tasks\//.test(route));
T("route: generate comet /suno/submit/music", /\/suno\/submit\/music/.test(route));
T("route: poll comet /suno/fetch/", /\/suno\/fetch\//.test(route));
T("route: generate ttapi /suno/v1/music", /\/suno\/v1\/music/.test(route));
T("route: poll ttapi /suno/v2/fetch", /\/suno\/v2\/fetch/.test(route));
T("route: TT-API-KEY header", /TT-API-KEY/.test(route));
T("route: sunoapi pakai body Kie", /provider === "kie" \|\| provider === "sunoapi"/.test(route));
T("route: apiframe TETAP ditolak", /provider === "apiframe"/.test(route));

/* ---- normalize ---- */
T("normalize: ProvLagu berisi 4 baru", /"sunoapi"/.test(norm) && /"evolink"/.test(norm) && /"cometapi"/.test(norm) && /"ttapi"/.test(norm));
T("normalize: ada normalizeEvolink/Comet/Ttapi", /normalizeEvolink/.test(norm) && /normalizeComet/.test(norm) && /normalizeTtapi/.test(norm));
T("normalize: TTAPI SUCCESS tanpa audio = pending (bukan jadi palsu)", /SUCCESS di sini = job diterima/.test(norm));
T("normalize: walk result_data + musics", /result_data/.test(norm) && /musics/.test(norm));
T("normalize: mapModelEvolink/Comet/Ttapi", /mapModelEvolink/.test(norm) && /mapModelComet/.test(norm) && /mapModelTtapi/.test(norm));

/* ---- health ---- */
T("health cek 4 provider baru", /sunoapi/.test(health) && /evolink/.test(health) && /cometapi/.test(health) && /ttapi/.test(health));
T("health tetap cek kie+sunor+apiframe", /kie/.test(health) && /sunor/.test(health) && /apiframe/.test(health));
T("health jalan paralel", /Promise\.all/.test(health));
T("health timeout 6s", /setTimeout\(\(\) => ctrl\.abort\(\), 6000\)/.test(health));

/* ---- normalizer murni (inline, tanpa typescript) ---- */
function clipsDari(d) {
  const out = [];
  const seen = new Set();
  const walk = (o, n = 0) => {
    if (!o || typeof o !== "object" || n > 6) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, n + 1)); return; }
    const url = o.audio_url || o.audioUrl;
    if (typeof url === "string" && url.startsWith("http") && !seen.has(url)) {
      seen.add(url); out.push({ url, title: o.title, duration: o.duration });
    }
    for (const v of Object.values(o)) walk(v, n + 1);
  };
  walk(d);
  return out;
}
function normEvo(d) {
  const id = String(d?.id || "");
  const st = String(d?.status || "pending").toLowerCase();
  if (/fail|error/.test(st)) return { id, status: "error" };
  const clips = clipsDari(d);
  if (clips.length && /complete|success|done/.test(st)) return { id, status: "completed", clips };
  if (id) return { id, status: "pending" };
  return { status: "pending" };
}
function normComet(d) {
  const id = typeof d?.data === "string" ? d.data : String(d?.data?.task_id || d?.id || "");
  const inner = d?.data && typeof d.data === "object" ? d.data : d;
  const clips = clipsDari(inner?.data || inner);
  if (clips.length) return { id, status: "completed", clips };
  if (id) return { id, status: "pending" };
  return { status: "pending" };
}
function normTt(d) {
  const jobId = String(d?.data?.jobId || d?.jobId || "");
  const st = String(d?.status || "").toUpperCase();
  if (st === "FAILED") return { id: jobId, status: "error" };
  const clips = clipsDari(d?.data?.musics || d);
  if (clips.length && st === "SUCCESS") return { id: jobId, status: "completed", clips };
  if (jobId) return { id: jobId, status: "pending" };
  return { status: "pending" };
}

const evoCreate = normEvo({ id: "task-1", status: "pending", progress: 0 });
T("evolink create = pending + id", evoCreate.status === "pending" && evoCreate.id === "task-1");
const evoDone = normEvo({
  id: "task-1", status: "completed",
  result_data: [
    { result_id: "a", title: "A", duration: 140, audio_url: "https://cdn/a.mp3" },
    { result_id: "b", title: "B", duration: 138, audio_url: "https://cdn/b.mp3" },
  ],
});
T("evolink selesai = 2 klip terpisah", evoDone.status === "completed" && evoDone.clips.length === 2);
T("evolink tidak jumlahkan durasi", evoDone.clips[0].duration === 140);

const cometCreate = normComet({ code: "success", data: "tid_99" });
T("comet create string data = pending", cometCreate.status === "pending" && cometCreate.id === "tid_99");
const cometDone = normComet({
  data: { status: "SUCCESS", data: [{ id: "c1", audio_url: "https://cdn/c1.mp3", title: "C1" }] },
});
T("comet fetch = 1 klip", cometDone.status === "completed" && cometDone.clips[0].url === "https://cdn/c1.mp3");

const ttCreate = normTt({ status: "SUCCESS", data: { jobId: "job-7" } });
T("ttapi SUCCESS tanpa musics = PENDING (bukan jadi palsu)", ttCreate.status === "pending" && ttCreate.id === "job-7");
const ttQueue = normTt({ status: "ON_QUEUE", jobId: "job-7" });
T("ttapi ON_QUEUE = pending", ttQueue.status === "pending");
const ttDone = normTt({
  status: "SUCCESS",
  data: { jobId: "job-7", musics: [{ musicId: "m1", audioUrl: "https://cdn1.suno.ai/m1.mp3", title: "M", duration: 200 }] },
});
T("ttapi fetch SUCCESS + musics = completed", ttDone.status === "completed" && ttDone.clips[0].url.includes("m1.mp3"));
const ttFail = normTt({ status: "FAILED", data: { jobId: "job-7" } });
T("ttapi FAILED = error", ttFail.status === "error");

if (gagal) { console.error(`\n💥 ${gagal} UJI PROVIDER BARU GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI PROVIDER BARU HIJAU");
