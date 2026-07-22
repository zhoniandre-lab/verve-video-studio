/* 🏦 v12.3 DOMPET BANSOS — konfigurasi kunci & base URL hasil buruan pembuat.
   Datang dari header yang dikirim klien HP-nya sendiri (localStorage), BUKAN disimpan server.
   Fase 1: chat/teks (OpenAI-compatible /chat/completions). */

export interface BansosChat { base: string; key: string; model: string }

export function bansosChatConfig(h: Headers): BansosChat | null {
  const base0 = (h.get("x-bansos-chat-base") || "").trim().replace(/\/+$/, "");
  const key = (h.get("x-bansos-chat-key") || "").trim();
  const model = (h.get("x-bansos-chat-model") || "").trim();
  if (!base0 || !key || !/^https?:/.test(base0)) return null;
  const base = /\/v1$/.test(base0) ? base0 : base0 + "/v1";
  return { base, key, model };
}
