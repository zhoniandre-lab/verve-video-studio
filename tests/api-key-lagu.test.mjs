// 🔑🧪 v20.31 — API KEY LAGU: pastikan key bisa masuk & tersimpan
// Jalankan: node tests/api-key-lagu.test.mjs
import { readFileSync } from "fs";
const lahan = readFileSync(new URL("../src/app/lahan-studio.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/SunoPanel.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/SunoStudio.tsx", import.meta.url), "utf8");

let gagal = 0;
const T = (nama, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${nama}${info ? " — " + info : ""}`); if (!ok) gagal++; };
console.log("🔑 Menguji input API key lagu (v20.31)");

/* ---- Lahan: alur tambah key ---- */
T("Lahan: addKeysFromDraft ada & simpan", /function addKeysFromDraft/.test(lahan) && /savePool\(next\)/.test(lahan));
T("Lahan: deteksi provider (kie/sunor/hex)", /detectProvClient/.test(lahan) && /\[a-f0-9\]\{24,\}/.test(lahan));
T("Lahan: key yang sama di provider beda tetap boleh (v20.31)", /detectProvClient\(k, sunoProv\)/.test(lahan));
T("Lahan: pesan jelas saat kunci masuk", /kunci ditambah/.test(lahan) && /tersimpan di HP/.test(lahan));
T("Lahan: panel tetap terbuka biar user lihat", /setKeyPanel\(true\); \/\/ biar user LIHAT/.test(lahan));
T("Lahan: keyPool dimuat dari localStorage saat buka", /rawKeys = localStorage.getItem\(SUNO_KEYS_KEY\)/.test(lahan) && /setKeyPool\(JSON.parse\(rawKeys\)\)/.test(lahan));
T("Lahan: textarea key punya autocapitalize off", /autoCapitalize="off"/.test(lahan));
T("Lahan: tombol Tambah nonaktif saat kosong", /disabled=\{!keyDraft\.trim\(\)\}/.test(lahan));

/* ---- SunoPanel (Spectrum) ---- */
T("Panel: addKeysFromDraft ada & simpan", /function addKeysFromDraft/.test(panel) && /savePool\(next\)/.test(panel));
T("Panel: textarea key autocorrect off", /autoCorrect="off"/.test(panel));

/* ---- SunoStudio (/suno) ---- */
T("Studio: input key ada & saveKey simpan", /value=\{key\}/.test(studio) && /saveKey\(prov, e\.target\.value\)/.test(studio));
T("Studio: autocapitalize off", /autoCapitalize="off"/.test(studio));


/* ---- v20.32: key selalu masuk ke provider yang DIPILIH ---- */

/* ---- v20.32: key selalu masuk ke provider yang DIPILIH ---- */
T("FIX: SunoPanel key simpan ke provider aktif", /provider: sunoProv/.test(panel) && /next.push/.test(panel));
T("FIX: SunoPanel keysForProvider fallback", /verve_suno_key/.test(panel));
T("FIX: SunoPanel pesan jelas + panel tetap terbuka", /tersimpan di HP/.test(panel) && /setKeyPanel/.test(panel));

if (gagal) { console.error(`\n💥 ${gagal} UJI API KEY GAGAL`); process.exit(1); }
console.log("\n🎉 SEMUA UJI API KEY LAGU HIJAU");
