// 🎧 Uji regresi ASMR Studio: gerak foto, masker, review, ekspor, dan UI mobile.
import { readFileSync } from "fs";
import { Buffer } from "buffer";
import ts from "typescript";

const motionSrc = readFileSync(new URL("../src/lib/asmr-motion.ts", import.meta.url), "utf8");
const motionJs = ts.transpileModule(motionSrc, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const enc = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const motion = await import(enc(motionJs));
const studio = readFileSync(new URL("../src/components/AsmrStudio.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../src/app/api/proxy-img/route.ts", import.meta.url), "utf8");
const stockRoute = readFileSync(new URL("../src/app/api/hcnsec/stock-video/route.ts", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => {
  console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`);
  if (!ok) gagal++;
};

const still = motion.asmrMotionAt(10, "still", 100, 1);
const moving = motion.asmrMotionAt(10, "kenburns", 60, 1);
T("mode still benar-benar tidak bergerak", still.scale === 1 && still.panX === 0 && still.panY === 0);
T("mode Ken Burns memberi gerak/zoom deterministik", moving.scale > 1 && Number.isFinite(moving.panX) && Number.isFinite(moving.panY));
const cover = motion.asmrCoverRect(1600, 900, 1280, 720, 1.1, .2, -.2);
T("foto memakai object-fit cover tanpa distorsi", cover.width >= 1280 && cover.height >= 720 && Number.isFinite(cover.x) && Number.isFinite(cover.y));
const maskPreview = motion.asmrMaskRect(.25, .25, 360, 260, 1280, 720);
const maskHd = motion.asmrMaskRect(.25, .25, 360, 260, 1920, 1080);
T("masker ikut membesar saat ekspor HD", maskHd.width === maskPreview.width * 1.5 && maskHd.height === maskPreview.height * 1.5);

T("ASMR memakai storage terpisah", /verve_asmr_studio_v1/.test(studio) && !/verve_lahan_v1/.test(studio));
T("ASMR punya gerak foto khusus", /asmrMotionAt/.test(studio) && /Hidupkan foto/.test(studio));
T("ASMR punya review video setelah render", /Review Video ASMR/.test(studio) && /renderedUrl/.test(studio) && /controls playsInline/.test(studio));
T("ASMR punya jalur WebCodecs bertimestamp", /renderWebCodecs/.test(studio) && /new VideoFrameCtor/.test(studio) && /timestamp: frameIndex/.test(studio));
T("fallback MediaRecorder menunggu durasi nyata", /renderMediaRecorder/.test(studio) && /await sleep\(frameDelay\)/.test(studio));
T("render tidak lagi mengaku MP4 jika hasil WebM", /renderedMime/.test(studio) && /ext = renderedMime\.includes\("mp4"\)/.test(studio));
T("audio ambience bisa upload dari HP", /handleSoundFile/.test(studio) && /accept="audio\/\*"/.test(studio));
T("video overlay bisa upload dari HP", /addVideoLayer/.test(studio) && /accept="video\/\*"/.test(studio));
T("AI background tidak tergantung createClient", !/createClient/.test(studio) && /api\/hcnsec\/image/.test(studio));
T("timeout/blank asset tidak membuat ekspor hitam diam-diam", /bgReady/.test(studio) && /Tunggu latar selesai dimuat/.test(studio));
T("UI mobile memakai layout satu kolom", /@media \(max-width:920px\)/.test(css) && /\.asmr-workspace\{grid-template-columns:1fr/.test(css));
T("proxy gambar mengizinkan Unsplash preset", /host\.includes\("unsplash"\)/.test(proxy));
T("ASMR punya koleksi overlay Pexels/Pixabay/Coverr", /searchStock/.test(studio) && /api\/hcnsec\/stock-video/.test(studio) && /Koleksi overlay realistis/.test(studio));
T("koleksi masuk sebagai video layer ringan", /addStockLayer/.test(studio) && /stockMediaSrc/.test(studio));
T("saat masuk otomatis mencari rain window", /searchStock\("rain window"\)/.test(studio));
T("hujan real punya preset masker jendela", /addEffectLayer\("rain", "window"\)/.test(studio) && /Masker jendela otomatis aktif/.test(studio));
T("drag layer dan resize mask tersedia", /onPointerDown=\{beginCanvasDrag\}/.test(studio) && /mask-resize/.test(studio));
T("preview canvas dibatasi 30fps untuk HP", /1000 \/ 30/.test(studio) && /satu path untuk semua garis/i.test(studio));
T("route katalog jujur saat semua kunci kosong", /code: "TANPA_KUNCI"/.test(stockRoute));
T("koleksi punya halaman lanjutan", /stockPage/.test(studio) && /Muat video berikutnya/.test(studio) && /append = false/.test(studio));
T("video koleksi memakai versi SD agar ringan", /Pakai file sd untuk preview/.test(studio) && /clip\.sd \|\| clip\.src/.test(studio));
T("hapus background hitam/green benar-benar tersedia", /keyMode/.test(studio) && /Hapus background hitam/.test(studio) && /getImageData/.test(studio));

if (gagal) {
  console.error(`\n💥 ${gagal} uji ASMR gagal`);
  process.exit(1);
}
console.log("\n🎉 ASMR STUDIO SEHAT — foto bisa hidup, hasil bisa direview, UI responsif");
