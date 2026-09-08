import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
let failed = 0;
function T(name, ok, info = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) failed++;
}

T("Video Baru membuka EditorScreen lama", /gotoEditor\(undefined, \{ newProject: Date\.now\(\) \}\)/.test(page));
T("duplikat mempertahankan videoUrl", /const ns: Slide = \{ id: uid\("c"\), imageUrl: src\.imageUrl, videoUrl: src\.videoUrl/.test(page));
T("duplikat mempertahankan assetId", /videoUrl: src\.videoUrl, dur: src\.dur, assetId: src\.assetId/.test(page));
T("split mempertahankan sumber video di kiri dan kanan", (page.match(/const (left|right): Slide = \{ id: uid\("c"\), imageUrl: src\.imageUrl, videoUrl: src\.videoUrl/g) || []).length === 2);
T("hapus membersihkan opsi klip", /setSlideOptsById\(c => \{ const n = \{ \.\.\.c \}; delete n\[id\]; return n; \}\)/.test(page));
T("hapus pilihan membersihkan selection", /setSelId\(""\); setClipBar\(false\);/.test(page));
T("pindah klip hanya mendorong satu history", /case "geserkir"[\s\S]*moveSlide\(selIndex, selIndex - 1\)/.test(page) && !/case "geserkir"[\s\S]*pushHist\(\); moveSlide/.test(page));

if (failed) process.exit(1);
console.log("\n✂️ Semua kontrak kontrol timeline editor hijau.");
