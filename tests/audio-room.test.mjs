// 🎛️🧪 UJI AUDIO ROOM (v19.37) — driver zona, hit-test, deteksi lingkaran
// Jalankan: node tests/audio-room.test.mjs
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
function tr(rel) {
  return ts.transpileModule(readFileSync(new URL(rel, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const D = await import(enc(tr("../src/lib/audio-room/zonedriver.ts")));
const { deteksiLingkaran } = await import(enc(tr("../src/lib/audio-room/detect.ts")));
const { newZone } = await import(enc(tr("../src/lib/audio-room/types.ts")));

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🎛️ Menguji Audio Room (zona reaksi lokal)");

/* 1. titikDalamZona — circle & oval */
const zc = { ...newZone("circle", 0.5, 0.5), rx: 0.1, ry: 0.1 };
T("circle: titik di dalam", D.titikDalamZona(zc, 0.52, 0.52) === true);
T("circle: titik di luar", D.titikDalamZona(zc, 0.7, 0.5) === false);
const zo = { ...newZone("oval", 0.5, 0.5), rx: 0.2, ry: 0.05 };
T("oval: dalam secara horizontal, luar vertikal", D.titikDalamZona(zo, 0.65, 0.5) === true && D.titikDalamZona(zo, 0.5, 0.58) === false);

/* 2. polygon ray casting */
const poly = { x: 0.3, y: 0.3 }, p2 = { x: 0.7, y: 0.3 }, p3 = { x: 0.5, y: 0.7 };
T("polygon: titik di dalam", D.titikDalamPolygon([poly, p2, p3], 0.5, 0.4) === true);
T("polygon: titik di luar", D.titikDalamPolygon([poly, p2, p3], 0.15, 0.6) === false);

/* 3. driver zona: pulse naik saat bass tinggi, deterministik, smoothing */
const z = newZone("circle", 0.5, 0.5);
z.efek = ["pulse", "deform", "glow"]; z.kekuatan = 1; z.deform = 0.6; z.glow = 1; z.smooth = 0.3;
// jalankan 20 langkah (dt 0.1) sampai mendekati steady state
const st = { prev: {} };
let drv = null;
for (let i = 0; i < 20; i++) {
  drv = D.hitungDriver(z, { bass: 0.9, beat: 1, treble: 0.3, rms: 0.8, flux: 0.9 }, 1 + i * 0.1, st, 0.1);
}
T("pulse > 1.05 saat bass tinggi (steady)", drv.pulse > 1.05, `pulse=${drv.pulse.toFixed(3)}`);
T("deform > 0.2 saat bass tinggi (steady)", drv.deform > 0.2, `deform=${drv.deform.toFixed(3)}`);
T("glow > 0.2 saat flux (steady)", drv.glow > 0.2, `glow=${drv.glow.toFixed(3)}`);
// smoothing: 1 langkah kecil belum penuh
const stAwal = { prev: {} };
const drv1 = D.hitungDriver(z, { bass: 0.9, beat: 1, treble: 0.3, rms: 0.8, flux: 0.9 }, 1.0, stAwal, 0.1);
T("smoothing: 1 langkah belum penuh", drv1.pulse < 1.1, `pulse=${drv1.pulse.toFixed(3)}`);
// deterministik: state baru → hasil sama
const st2 = { prev: {} };
const drvA = D.hitungDriver(z, { bass: 0.5, beat: 0, treble: 0.2, rms: 0.4, flux: 0.3 }, 2.5, st2, 0.1);
const st3 = { prev: {} };
const drvB = D.hitungDriver(z, { bass: 0.5, beat: 0, treble: 0.2, rms: 0.4, flux: 0.3 }, 2.5, st3, 0.1);
T("deterministik (state sama → hasil sama)", Math.abs(drvA.pulse - drvB.pulse) < 1e-9);
// getar deterministik juga
const st4 = { prev: {} };
const gA = D.hitungDriver(z, { bass: 0.5, beat: 0, treble: 0.2, rms: 0.6, flux: 0.3 }, 3.0, st4, 0.1);
const st5 = { prev: {} };
const gB = D.hitungDriver(z, { bass: 0.5, beat: 0, treble: 0.2, rms: 0.6, flux: 0.3 }, 3.0, st5, 0.1);
T("getar deterministik", Math.abs(gA.getarX - gB.getarX) < 1e-9);
// tanpa efek pulse → pulse = 1
const zNo = newZone("circle", 0.5, 0.5); zNo.efek = ["glow"];
const st6 = { prev: {} };
const dNo = D.hitungDriver(zNo, { bass: 0.9, beat: 1, treble: 0.3, rms: 0.8, flux: 0.9 }, 1, st6, 0.1);
T("tanpa efek pulse → pulse tetap 1 (hanya zona ber-efek yang bergerak)", dNo.pulse === 1);

/* 4. deteksi lingkaran — gambar sintetis: 2 lingkaran gelap di latar terang */
const w = 200, h = 200;
const img = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  let lumV = 0.8; // latar terang
  const d1 = Math.hypot(x - 60, y - 100);
  const d2 = Math.hypot(x - 140, y - 100);
  if (d1 < 25 || d2 < 25) lumV = 0.15; // dua bulatan gelap
  img[i] = img[i + 1] = img[i + 2] = Math.round(lumV * 255);
  img[i + 3] = 255;
}
const det = deteksiLingkaran(img, w, h, { minR: 0.06, maxR: 0.2 });
T("deteksi menemukan 2 lingkaran", det.length >= 2, `${det.length} ditemukan`);
if (det.length >= 2) {
  const dekat = (a, b, t) => Math.abs(a - b) < t;
  const ok1 = det.some((d) => dekat(d.x, 60 / w, 0.06) && dekat(d.y, 0.5, 0.06));
  const ok2 = det.some((d) => dekat(d.x, 140 / w, 0.06) && dekat(d.y, 0.5, 0.06));
  T("lingkaran kiri & kanan terdeteksi di posisi benar", ok1 && ok2, JSON.stringify(det.map((d) => [d.x.toFixed(2), d.y.toFixed(2)])));
}
// gambar polos terang → tidak ada deteksi
const polos = new Uint8ClampedArray(w * h * 4).fill(220);
for (let i = 3; i < polos.length; i += 4) polos[i] = 255;
T("gambar polos → tidak ada lingkaran", deteksiLingkaran(polos, w, h).length === 0);

if (gagal) { console.error(`\n💥 ${gagal} UJI AUDIO ROOM GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI AUDIO ROOM HIJAU — zona reaksi lokal siap!");
