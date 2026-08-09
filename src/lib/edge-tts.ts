// 🎙️ v19.49 EDGE TTS — suara cadangan NATURAL (neural Microsoft), gratis tanpa API key.
// Dipakai OTOMATIS kalau hcnsec TTS sedang 503/down, biar Teks ke Audio tetap jadi.
// Catatan jujur: ini endpoint tidak resmi (Edge Read Aloud) — dipakai komunitas developer
// bertahun-tahun & gratis; kualitas neural (bukan robot). Bisa berubah sewaktu-waktu.
import WebSocket from "ws";
import crypto from "crypto";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const CHROMIUM_VER = "143.0.3650.75";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_VER}`;
const WIN_EPOCH = 11644473600; // selisih epoch Unix → Windows file time (1601)

// 🛡 anti-bot Microsoft: token Sec-MS-GEC (SHA256 dari file-time dibulatkan 5 menit + token klien)
function generateSecMsGec(): string {
  const ticks = Date.now() / 1000 + WIN_EPOCH;
  const rounded = ticks - (ticks % 300);
  const ticks100ns = rounded * 1e7;
  const str = `${ticks100ns.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash("sha256").update(str, "ascii").digest("hex").toUpperCase();
}

export interface EdgeVoiceDef {
  id: string;
  name: string;
  gender: string;
  lang: string;
  desc: string;
  edge: string;
  av: string;
  bg: string;
}

// 🗣 Daftar suara cadangan (natural, neural) — termasuk 2 suara BAHASA INDONESIA
export const EDGE_VOICES: EdgeVoiceDef[] = [
  { id: "gadis", name: "Gadis", gender: "Perempuan", lang: "Indonesia", edge: "id-ID-GadisNeural", av: "👩", bg: "#0e7490", desc: "Natural & hangat" },
  { id: "ardi", name: "Ardi", gender: "Laki-laki", lang: "Indonesia", edge: "id-ID-ArdiNeural", av: "👨", bg: "#1d4ed8", desc: "Natural & tenang" },
  { id: "aria", name: "Aria", gender: "Perempuan", lang: "Inggris", edge: "en-US-AriaNeural", av: "👩‍🦰", bg: "#7c3aed", desc: "Cerah & jernih" },
  { id: "guy", name: "Guy", gender: "Laki-laki", lang: "Inggris", edge: "en-US-GuyNeural", av: "🧑", bg: "#111827", desc: "Tegas & mantap" },
  { id: "jenny", name: "Jenny", gender: "Perempuan", lang: "Inggris", edge: "en-US-JennyNeural", av: "👱‍♀️", bg: "#be185d", desc: "Ramah & halus" },
  { id: "christopher", name: "Christopher", gender: "Laki-laki", lang: "Inggris", edge: "en-US-ChristopherNeural", av: "🧔", bg: "#065f46", desc: "Khas pembaca kisah" },
  { id: "michelle", name: "Michelle", gender: "Perempuan", lang: "Inggris", edge: "en-US-MichelleNeural", av: "👩🏻", bg: "#b45309", desc: "Hangat & dewasa" },
];

// suara lama (alloy/nova/dll) → suara cadangan terdekat, biar yang lama tetap jalan
export const LEGACY_TO_EDGE: Record<string, string> = {
  alloy: "gadis", nova: "gadis", shimmer: "aria",
  echo: "christopher", onyx: "guy", fable: "michelle",
};

// arah sebaliknya: suara cadangan → voice gaya OpenAI (dikirim ke hcnsec saat hcnsec hidup)
export const NEW_TO_LEGACY: Record<string, string> = {
  gadis: "alloy", ardi: "onyx", aria: "shimmer",
  guy: "onyx", jenny: "nova", christopher: "echo", michelle: "fable",
};

// 🎚 GAYA BACA — atur kecepatan & nada → nuansa pembaca berita / kisah / dll
export interface GayaTtsDef { id: string; name: string; rate: string; pitch: string; desc: string }
export const GAYA_TTS: GayaTtsDef[] = [
  { id: "normal", name: "Normal", rate: "+0%", pitch: "+0Hz", desc: "Biasa" },
  { id: "berita", name: "📰 Pembaca Berita", rate: "+8%", pitch: "+0Hz", desc: "Tegas & jelas" },
  { id: "kisah", name: "📖 Pembaca Kisah", rate: "-12%", pitch: "+2Hz", desc: "Pelan & menghayati" },
  { id: "cepat", name: "⚡ Cepat", rate: "+18%", pitch: "+2Hz", desc: "Energik" },
  { id: "tenang", name: "🌙 Tenang", rate: "-20%", pitch: "-2Hz", desc: "Santai & dalam" },
];

export function edgeVoiceIdDari(voice?: string): string {
  if (!voice) return "gadis";
  const v = voice.trim().toLowerCase();
  if (EDGE_VOICES.some((x) => x.id === v)) return v;
  if (LEGACY_TO_EDGE[v]) return LEGACY_TO_EDGE[v];
  if (v.includes("-neural")) {
    const found = EDGE_VOICES.find((x) => x.edge.toLowerCase() === v);
    if (found) return found.id;
  }
  return "gadis";
}

export function gayaTtsDari(style?: string): GayaTtsDef {
  return GAYA_TTS.find((g) => g.id === style) || GAYA_TTS[0];
}

// ✂️ Pecah teks jadi potongan ≤ max karakter, rapi di batas kalimat
export function chunkTeks(teks: string, max = 900): string[] {
  const bersih = teks.trim().replace(/\s+/g, " ");
  if (!bersih) return [];
  const parts = bersih.split(/(?<=[.!?…。！？])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > max) {
      if (cur) chunks.push(cur.trim());
      if (p.length > max) {
        let sisa = p;
        while (sisa.length > max) {
          let cut = sisa.lastIndexOf(" ", max);
          if (cut < max * 0.5) cut = max;
          chunks.push(sisa.slice(0, cut).trim());
          sisa = sisa.slice(cut).trim();
        }
        cur = sisa;
      } else cur = p;
    } else {
      cur = (cur + " " + p).trim();
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// 🔌 satu permintaan sintesis (1 chunk) lewat WebSocket Edge Read Aloud
function sintesisSatu(teks: string, edgeVoice: string, rate: string, pitch: string, timeoutMs = 30000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID();
    const reqId = crypto.randomUUID();
    const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, {
        headers: {
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VER.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_VER.split(".")[0]}.0.0.0`,
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
        },
      });
    } catch (e: any) {
      reject(new Error(`Edge TTS gagal konek: ${e?.message}`));
      return;
    }
    const to = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("Edge TTS timeout"));
    }, timeoutMs);
    const audio: Buffer[] = [];
    let done = false;
    const fail = (e: Error) => {
      if (done) return; done = true; clearTimeout(to);
      try { ws.close(); } catch {}
      reject(e);
    };
    const ok = (buf: Buffer) => {
      if (done) return; done = true; clearTimeout(to);
      try { ws.close(); } catch {}
      resolve(buf);
    };
    ws.on("open", () => {
      const date = new Date().toISOString();
      const cfg =
        `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      const lang = edgeVoice.split("-").slice(0, 2).join("-");
      const ssml =
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${edgeVoice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(teks)}</prosody></voice></speak>`;
      try { ws.send(cfg); ws.send(ssml); } catch (e: any) { fail(new Error(`Edge TTS kirim gagal: ${e?.message}`)); }
    });
    ws.on("message", (data: any, isBinary: boolean) => {
      const raw = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
      if (isBinary) {
        // format frame audio: [2B panjang header BE][header "Path:audio..." SUDAH termasuk \r\n\r\n][data audio]
        if (raw.length < 4) return;
        const hl = raw.readUInt16BE(0);
        if (hl < 2 || 2 + hl > raw.length) return;
        const body = raw.subarray(2 + hl);
        if (body.length) audio.push(body);
        return;
      }
      // frame teks: header \r\n\r\n body (turn.start / response / turn.end)
      const idx = raw.indexOf(Buffer.from("\r\n\r\n"));
      if (idx === -1) return;
      const head = raw.subarray(0, idx).toString("utf8");
      if (head.includes("Path:turn.end")) return ok(Buffer.concat(audio));
      // turn.start & response = metadata — diabaikan
    });
    ws.on("error", (e) => fail(new Error(`Edge TTS: ${e?.message || e}`)));
    ws.on("close", () => {
      if (!done && audio.length) ok(Buffer.concat(audio));
      else if (!done) fail(new Error("Edge TTS koneksi ditutup"));
    });
  });
}

export interface EdgeTtsResult {
  url: string; // data URL potongan pertama (kalau cuma 1 potongan = audio penuh)
  chunks: string[]; // semua potongan (kalau >1, client wajib menggabung)
  voice: string; // nama edge asli (mis. id-ID-GadisNeural)
  voiceName: string;
  style: string;
}

// 🎙️ API utama: teks → MP3 (bisa beberapa potongan). Paralel 2 per batch, aman dari rate-limit.
export async function edgeTTS(
  teks: string,
  voice?: string,
  style?: string,
  opts?: { timeoutMs?: number }
): Promise<EdgeTtsResult> {
  const vid = edgeVoiceIdDari(voice);
  const v = EDGE_VOICES.find((x) => x.id === vid)!;
  const g = gayaTtsDari(style);
  const chunks = chunkTeks(teks.slice(0, 3500), 900);
  if (!chunks.length) throw new Error("Teks kosong — isi teks narasi dulu ya.");
  const timeoutMs = opts?.timeoutMs ?? 50000;
  const deadline = Date.now() + timeoutMs;
  const bufs: Buffer[] = [];
  let detail = "";
  for (let i = 0; i < chunks.length; i += 2) {
    const batch = chunks.slice(i, i + 2);
    const sisa = Math.max(15000, deadline - Date.now());
    const results = await Promise.allSettled(
      batch.map((c) => sintesisSatu(c, v.edge, g.rate, g.pitch, sisa))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        bufs.push(r.value);
      } else {
        if (!detail) detail = (r.reason as any)?.message || String(r.reason || "?");
        // coba ulang berurutan (rate-limit sesaat)
        try {
          bufs.push(await sintesisSatu(batch[j], v.edge, g.rate, g.pitch, Math.max(15000, deadline - Date.now())));
        } catch (e2: any) { if (!detail) detail = e2?.message || "?"; }
      }
    }
  }
  if (!bufs.length) throw new Error(`Edge TTS gagal total: ${detail || "jaringan/timeout"}. Coba lagi beberapa saat.`);
  const urls = bufs.map((b) => `data:audio/mpeg;base64,${b.toString("base64")}`);
  return { url: urls[0], chunks: urls, voice: v.edge, voiceName: v.name, style: g.id };
}
