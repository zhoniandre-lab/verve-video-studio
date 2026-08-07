/* =====================================================================
   CHAT OPENAI-COMPATIBLE (v19.38) — 100% orisinal, MURNI (bisa diuji)
   Dipakai untuk API key gratis dari Dompet Bansos (Groq, Gemini, Cerebras,
   dll) sebagai sumber AI cadangan saat HCNSEC_API_KEY tidak di-set.
   ===================================================================== */

export interface Pesan { role: string; content: string }

/** Panggil /chat/completions gaya OpenAI. Kembalikan teks balasan. */
export async function chatOpenAiCompatible(
  base: string,
  key: string,
  model: string,
  messages: Pesan[],
  timeoutSec = 40,
): Promise<string> {
  const b = String(base || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(b)) throw new Error("Base URL tidak valid");
  if (!key) throw new Error("API key kosong");
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  try {
    const r = await fetch(b + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages,
        temperature: 0.9,
        max_tokens: 900,
        stream: false,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`);
    }
    const j = await r.json().catch(() => ({}));
    const out = (j.choices?.[0]?.message?.content || "").trim();
    if (!out) throw new Error("Balasan kosong");
    return out;
  } finally {
    clearTimeout(to);
  }
}
