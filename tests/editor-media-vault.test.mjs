import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const vault = readFileSync(new URL("../src/lib/media-vault.ts", import.meta.url), "utf8");
let failed = 0;
function T(name, ok, info = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) failed++;
}

T("Slide menyimpan assetId terpisah dari preview", /interface Slide \{[^}]*assetId\?: string/.test(page));
T("media vault memakai IndexedDB", /indexedDB\.open\(DB_NAME/.test(vault));
T("upload menyimpan file asli ke vault", /putMediaAsset\(f, f\.name\)/.test(page));
T("preview memakai sumber asset asli bila tersedia", /function slideImageSource[\s\S]*mediaAssetUrlsRef\.current\.get/.test(page));
T("video memakai poster untuk Image dan Blob asli hanya untuk video deck", /if \(slide\.videoUrl\) return slide\.imageUrl/.test(page));
T("video bersih memakai native preview", /nativeVideoRef[\s\S]*<video[\s\S]*nativeVideoMode/.test(page));
T("render memakai sumber image asli", /images: useSlides\.map\(s => slideImageSource\(s\)\)/.test(page));
T("render memakai sumber video asli", /videos: useSlides\.map\(s => slideVideoSource\(s\)/.test(page));
T("asset yang hilang tidak mematikan seluruh proyek", /\(s\.imageUrl && s\.imageUrl\.length > 8\) \|\| s\.assetId/.test(page));

if (failed) process.exit(1);
console.log("\n🎞️ Semua kontrak media vault editor hijau.");
