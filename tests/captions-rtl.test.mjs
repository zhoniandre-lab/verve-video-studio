import { readFileSync } from "node:fs";

const editing = readFileSync(new URL("../src/lib/editing.ts", import.meta.url), "utf8");
const recorder = readFileSync(new URL("../src/lib/recorder.ts", import.meta.url), "utf8");
let failed = 0;
function T(name, ok) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (!ok) failed++; }

T("editing punya deteksi aksara RTL", /function isRtlCaptionText[\s\S]*\\u0590-\\u08FF/.test(editing));
T("preview caption mengaktifkan direction rtl", /const isRTL = lineWords\.some[\s\S]*ctx\.direction = isRTL \? "rtl"/.test(editing));
T("preview memakai font Arab", /Noto Naskh Arabic.*Amiri.*Scheherazade New/.test(editing));
T("preview membalik urutan posisi kata RTL", /x \+= isRTL \? -\(widths\[wi\] \+ gap\)/.test(editing));
T("export recorder memakai deteksi RTL", /isRtlCaptionText/.test(recorder));
T("export recorder memakai font RTL", /const fontStack = isRTL \?/.test(recorder));
T("export recorder menggambar kata RTL dari kanan", /x = isRTL \? W\/2 \+ totalTextW\/2/.test(recorder));

if (failed) process.exit(1);
console.log("\n🕌 Semua kontrak caption Arabic RTL hijau.");
