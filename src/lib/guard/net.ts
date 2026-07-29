/* 🛡️ VERVE GUARD · NET
   Fondasi jaringan stabil: timeout, retry, backoff, hasil jujur, batch limiter.
   Sengaja universal (browser + server) dan tanpa dependency supaya aman dipakai bertahap. */

export type GuardedJsonOk<T> = {
  ok: true;
  data: T;
  status: number;
  attempts: number;
  ms: number;
};

export type GuardedJsonFail = {
  ok: false;
  error: string;
  status: number;
  attempts: number;
  ms: number;
  aborted?: boolean;
};

export type GuardedJsonResult<T> = GuardedJsonOk<T> | GuardedJsonFail;

export type GuardedFetchOptions = RequestInit & {
  /** Lama maksimal per percobaan. */
  timeoutMs?: number;
  /** Jumlah coba ulang SETELAH percobaan pertama. retries=1 berarti total 2 percobaan. */
  retries?: number;
  /** Label manusiawi untuk pesan error. */
  label?: string;
  /** Jeda awal retry; percobaan berikutnya naik exponential backoff. */
  retryDelayMs?: number;
  /** Kalau true, jangan otomatis tambah Content-Type JSON meskipun body object/string. */
  rawBody?: boolean;
};

export class GuardedFetchError extends Error {
  status: number;
  attempts: number;
  ms: number;
  aborted: boolean;
  body: unknown;

  constructor(message: string, meta: { status: number; attempts: number; ms: number; aborted?: boolean; body?: unknown }) {
    super(message);
    this.name = "GuardedFetchError";
    this.status = meta.status;
    this.attempts = meta.attempts;
    this.ms = meta.ms;
    this.aborted = !!meta.aborted;
    this.body = meta.body;
  }
}

const tidur = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function humanErrorMessage(label: string, err: unknown, status = 0): string {
  const anyErr = err as any;
  const msg = String(anyErr?.message || anyErr?.error || anyErr || "gagal").slice(0, 220);
  if (anyErr?.name === "AbortError" || anyErr?.aborted) return `⏱ ${label} timeout — koneksi lambat, coba lagi.`;
  if (status === 429) return `⏳ ${label} terlalu ramai / rate limit — coba ulang sebentar lagi.`;
  if (status >= 500) return `🧱 ${label} server sedang goyang (HTTP ${status}) — coba ulang.`;
  if (status >= 400) return `⚠️ ${label} ditolak (HTTP ${status}): ${msg}`;
  return `🔌 ${label} gagal dihubungi: ${msg}`;
}

function hasHeader(headers: HeadersInit | undefined, key: string): boolean {
  if (!headers) return false;
  const low = key.toLowerCase();
  if (headers instanceof Headers) return headers.has(key);
  if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === low);
  return Object.keys(headers).some((k) => k.toLowerCase() === low);
}

function withJsonHeader(init: RequestInit, rawBody?: boolean): RequestInit {
  if (rawBody || !init.body || hasHeader(init.headers, "content-type") || typeof FormData !== "undefined" && init.body instanceof FormData) return init;
  if (typeof Blob !== "undefined" && init.body instanceof Blob) return init;
  if (init.body instanceof URLSearchParams) return init;
  if (typeof init.body !== "string") return init;
  return { ...init, headers: { "Content-Type": "application/json", ...(init.headers as any || {}) } };
}

async function bacaBody(res: Response): Promise<{ text: string; json: unknown }> {
  const text = await res.text().catch(() => "");
  if (!text) return { text: "", json: null };
  try { return { text, json: JSON.parse(text) }; }
  catch { return { text, json: text }; }
}

export async function fetchJsonGuarded<T = unknown>(url: string, options: GuardedFetchOptions = {}): Promise<GuardedJsonOk<T>> {
  const started = Date.now();
  const label = options.label || "API";
  const timeoutMs = Math.max(500, Number(options.timeoutMs) || 15_000);
  const retries = Math.max(0, Math.round(Number(options.retries) || 0));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 600);
  const { timeoutMs: _t, retries: _r, label: _l, retryDelayMs: _d, rawBody: _raw, ...rest } = options;
  let lastErr: unknown = null;
  let lastStatus = 0;
  let aborted = false;
  let usedAttempts = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    usedAttempts = attempt + 1;
    const ac = new AbortController();
    const upstream = rest.signal;
    let lepasUpstream: (() => void) | null = null;
    if (upstream) {
      const onAbort = () => ac.abort();
      if (upstream.aborted) ac.abort();
      else { upstream.addEventListener("abort", onAbort, { once: true }); lepasUpstream = () => upstream.removeEventListener("abort", onAbort); }
    }
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const init = withJsonHeader({ ...rest, signal: ac.signal }, _raw);
      const res = await fetch(url, init);
      lastStatus = res.status;
      const body = await bacaBody(res);
      if (!res.ok) {
        const bodyMsg = typeof body.json === "object" && body.json !== null
          ? ((body.json as any).error || (body.json as any).message || (body.json as any).code || body.text)
          : body.text;
        throw new GuardedFetchError(humanErrorMessage(label, bodyMsg || res.statusText, res.status), {
          status: res.status,
          attempts: attempt + 1,
          ms: Date.now() - started,
          body: body.json,
        });
      }
      return { ok: true, data: body.json as T, status: res.status, attempts: attempt + 1, ms: Date.now() - started };
    } catch (e: any) {
      lastErr = e;
      aborted = aborted || e?.name === "AbortError" || !!e?.aborted;
      lastStatus = Number(e?.status || lastStatus || 0);
      const retryable = aborted || isRetryableStatus(lastStatus);
      if (attempt >= retries || !retryable) break;
      await tidur(retryDelayMs * Math.pow(2, attempt));
    } finally {
      clearTimeout(timer);
      lepasUpstream?.();
    }
  }

  const msg = lastErr instanceof GuardedFetchError
    ? lastErr.message
    : humanErrorMessage(label, lastErr, lastStatus);
  throw new GuardedFetchError(msg, {
    status: lastStatus,
    attempts: usedAttempts || 1,
    ms: Date.now() - started,
    aborted,
    body: (lastErr as any)?.body,
  });
}

export async function fetchJsonResult<T = unknown>(url: string, options: GuardedFetchOptions = {}): Promise<GuardedJsonResult<T>> {
  const started = Date.now();
  try {
    return await fetchJsonGuarded<T>(url, options);
  } catch (e: any) {
    return {
      ok: false,
      error: String(e?.message || e || "gagal"),
      status: Number(e?.status || 0),
      attempts: Number(e?.attempts || ((options.retries || 0) + 1)),
      ms: Number(e?.ms || (Date.now() - started)),
      aborted: !!e?.aborted,
    };
  }
}

/** Jalankan banyak job dengan batas paralel. Penting buat HP: banyak fetch sekaligus = panas, RAM naik, request gampang tumbang. */
export async function batchLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const n = items.length;
  const out = new Array<R>(n);
  const max = Math.max(1, Math.min(Math.floor(limit) || 1, n || 1));
  let next = 0;
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: max }, runner));
  return out;
}

/** Cadangan terakhir: kalau simpan cloud/local gagal, user masih bisa unduh JSON proyek/log. Browser-only, aman no-op di server. */
export function downloadJsonBackup(data: unknown, filename = `verve-backup-${Date.now()}.json`): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
