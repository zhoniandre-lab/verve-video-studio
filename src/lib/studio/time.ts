/* =====================================================================
   VERVE Studio — Time utilities
   ===================================================================== */

export const fmtTime = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${cs}`;
};

export const parseTime = (str: string): number => {
  // "1:23.4" or "0:08.4" or "8.4"
  const trimmed = str.trim();
  if (trimmed.includes(":")) {
    const [m, rest] = trimmed.split(":");
    const min = parseInt(m, 10) || 0;
    const sec = parseFloat(rest) || 0;
    return min * 60 + sec;
  }
  return parseFloat(trimmed) || 0;
};
