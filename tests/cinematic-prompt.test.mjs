// 🎬 UJI CINEMATIC PROMPT KIT — prompt aman: subject unchanged + mood/lighting/camera.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

async function loadTs(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const C = await loadTs("../src/lib/guard/cinematic-prompt.ts");
let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎬 Menguji Cinematic Prompt Kit");

const p = C.buildCinematicEditPrompt({ mainSubject: "my face and outfit", lightingStyle: "warm sunset light", cameraMovement: "slow cinematic camera movement", colourStyle: "soft contrast", visualMood: "luxury visual mood", keepDetails: "the background or my body movement" });
T("prompt menjaga subject", /Keep my face and outfit unchanged/.test(p), p);
T("prompt lighting", /warm sunset light/.test(p), p);
T("prompt larangan ubah detail", /Do not change the background or my body movement/.test(p), p);
T("adjust cinematic hangat", C.VERVE_CINEMATIC_ADJUST.tem > 0 && C.VERVE_CINEMATIC_ADJUST.vig >= 75 && C.VERVE_CINEMATIC_ADJUST.grain > 0, JSON.stringify(C.VERVE_CINEMATIC_ADJUST));
T("summary menyebut letterbox", C.buildVerveCinematicStudioSummary().toLowerCase().includes("letterbox"));

if (gagal) { console.error(`\n💥 ${gagal} UJI CINEMATIC KIT GAGAL`); process.exit(1); }
console.log("\n🏁 CINEMATIC PROMPT KIT SEHAT");
