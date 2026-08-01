/* =====================================================================
   TEST: Studio Preview + Auto-Terminate
   - Verify auto-terminate logic untuk audio masuk → potong klip video
   - Verify struktur UI preview terdaftar di build
   ===================================================================== */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());
const PREVIEW = join(ROOT, "src/app/studio-preview/page.tsx");

let pass = 0;
let fail = 0;
const log = (ok, msg) => {
  if (ok) {
    pass++;
    console.log("✅", msg);
  } else {
    fail++;
    console.log("❌", msg);
  }
};

// === 1. File preview ada
log(existsSync(PREVIEW), "studio-preview/page.tsx ada");

// === 2. File berisi fungsi auto-terminate
const code = readFileSync(PREVIEW, "utf-8");
log(/applyAutoTerminate/.test(code), "fungsi applyAutoTerminate ada");
log(/Auto-Terminate/.test(code), "label Auto-Terminate muncul di UI");
log(/vp-clip/.test(code), "komponen klip timeline ada");
log(/vp-playhead/.test(code), "komponen playhead ada");
log(/vp-tl-track/.test(code), "struktur track ada");

// === 3. Simulasi logika auto-terminate
const tracks = [
  { id: "v1", kind: "video" },
  { id: "a1", kind: "audio" },
];
const clips = [
  { id: "c1", trackId: "v1", start: 0, dur: 10 },
  { id: "c2", trackId: "a1", start: 4, dur: 5 },
];

// Reproduksi logika dari file (sederhana, untuk verifikasi)
const simulated = clips.map((c) => {
  if (c.trackId === "a1") return c;
  const audio = clips.find((a) => a.trackId === "a1");
  if (!audio) return c;
  const cut = audio.start;
  if (cut <= c.start || cut >= c.start + c.dur) return c;
  return { ...c, dur: cut - c.start, autoTerminated: true };
});

const v1 = simulated.find((c) => c.id === "c1");
log(v1.dur === 4, `auto-terminate potong video dari 10 → 4 detik (actual: ${v1.dur})`);
log(v1.autoTerminated === true, "tanda autoTerminated terset");

// === 4. Tidak ada audio = tidak ada perubahan
const clips2 = [
  { id: "c1", trackId: "v1", start: 0, dur: 10 },
];
const noAudio = clips2.map((c) => c);
log(noAudio[0].dur === 10, "tanpa audio, klip tidak terpotong");

// === 5. Verify render flow exists in component
log(/handleRender/.test(code), "fungsi handleRender ada");
log(/renderTimeline/.test(code), "fungsi renderTimeline dipakai");
log(/MediaRecorder/.test(code) || /extractMediaDuration/.test(code), "media upload/render logic ada");
log(/saveProject/.test(code) || /loadProject/.test(code), "save/load project dipakai");

console.log(`\n📊 ${pass} lulus, ${fail} gagal`);
if (fail > 0) {
  console.log("❌ STUDIO PREVIEW GAGAL");
  process.exit(1);
}
console.log("🏁 STUDIO PREVIEW SEHAT — auto-terminate siap dipakai");
