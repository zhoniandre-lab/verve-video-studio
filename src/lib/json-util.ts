/**
 * Robust JSON extractor & parser — tahan trailing comma,
 * backtick fence, teks tambahan di luar JSON, comment dll.
 */
export function safeParseJSON(text: string): any {
  if (!text) return null;
  let s = String(text).trim();
  // Bersihkan code fence
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Cari kurung kurawal terluar
  const i1 = s.indexOf("{");
  const i2 = s.lastIndexOf("}");
  if (i1 < 0 || i2 < 0 || i2 <= i1) return null;
  s = s.slice(i1, i2 + 1);
  // Fix trailing koma sebelum ] atau }
  s = s.replace(/,(\s*[\]}])/g, "$1");
  try { return JSON.parse(s); } catch {}
  try {
    // Buang // komentar
    s = s.replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(s);
  } catch {}
  return null;
}
