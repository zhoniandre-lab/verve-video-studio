import { readFileSync } from "node:fs";

const files = {
  editor: readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8"),
  lahan: readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8"),
  panel: readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8"),
  studio: readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8"),
  director: readFileSync(new URL("../src/app/api/hcnsec/director/route.ts", import.meta.url), "utf8"),
  normalize: readFileSync(new URL("../src/lib/suno-normalize.ts", import.meta.url), "utf8"),
};
let failed = 0;
function T(name, ok) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (!ok) failed++; }

for (const [name, text] of Object.entries(files)) {
  T(`${name} mengenal v6`, /v6/i.test(text));
}
T("Editor memakai v6-mini sebagai default", /useState\("suno-v6-mini"\)/.test(files.editor));
T("Lahan memakai V6_MINI sebagai default", /useState\("V6_MINI"\)/.test(files.lahan));
T("SunoPanel menampilkan tiga varian v6", /V6_MINI/.test(files.panel) && /V6_WILD/.test(files.panel) && /id: "V6"/.test(files.panel));
T("SunoStudio menampilkan tiga varian v6", /suno-v6-mini/.test(files.studio) && /suno-v6-wild/.test(files.studio) && /suno-v6/.test(files.studio));
T("Director menerima model V6_MINI", /V6_MINI/.test(files.director));
T("mapper Kie memetakan V6_WILD", /v6\.wild[\s\S]*V6_WILD/.test(files.normalize));
T("mapper generic memetakan v6-mini", /v6\.mini[\s\S]*suno-v6-mini/.test(files.normalize));
T("mapper Sonic memetakan v6", /v6\.wild[\s\S]*sonic-v6-wild/.test(files.normalize));
T("mapper provider punya jalur v6 eksplisit", /v6\.mini[\s\S]*return "chirp-v6-mini"/.test(files.normalize) && /v6\.wild[\s\S]*return "suno-v6-wild-beta"/.test(files.normalize));

if (failed) process.exit(1);
console.log("\n🎵 Semua kontrak UI Suno v6 hijau.");
