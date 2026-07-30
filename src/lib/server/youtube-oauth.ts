import crypto from "crypto";
import { NextResponse } from "next/server";

export const YT_TOKEN_COOKIE = "verve_yt_token_v1";
export const YT_STATE_COOKIE = "verve_yt_state_v1";
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export type YoutubeOAuthConfig = {
  configured: boolean;
  missing: string[];
  clientId: string;
  clientSecret: string;
  cookieSecret: string;
  redirectUri: string;
};

export type StoredYoutubeToken = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
  channel?: { id: string; title: string; thumbnail?: string };
};

export type YoutubeAuthResult =
  | { ok: true; accessToken: string; token: StoredYoutubeToken; refreshed?: StoredYoutubeToken }
  | { ok: false; status: number; error: string; missing?: string[] };

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unbase64url(s: string): Buffer {
  const b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "===".slice((b64.length + 3) % 4), "base64");
}
function key(secret: string): Buffer { return crypto.createHash("sha256").update(secret).digest(); }

export function encryptJson(data: unknown, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${base64url(iv)}.${base64url(tag)}.${base64url(enc)}`;
}

export function decryptJson<T>(packed: string, secret: string): T | null {
  try {
    const [ivS, tagS, encS] = String(packed || "").split(".");
    if (!ivS || !tagS || !encS) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), unbase64url(ivS));
    decipher.setAuthTag(unbase64url(tagS));
    const dec = Buffer.concat([decipher.update(unbase64url(encS)), decipher.final()]).toString("utf8");
    return JSON.parse(dec) as T;
  } catch { return null; }
}

export function parseCookieHeader(req: Request): Record<string, string> {
  const raw = req.headers.get("cookie") || "";
  const out: Record<string, string> = {};
  raw.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i <= 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function originFromReq(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  return `${proto}://${host}`;
}

export function youtubeOAuthConfig(req: Request): YoutubeOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_OAUTH_CLIENT_SECRET || "";
  const cookieSecret = process.env.YT_OAUTH_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
  const redirectUri = process.env.YT_OAUTH_REDIRECT_URI || `${originFromReq(req)}/api/youtube/oauth/callback`;
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!cookieSecret) missing.push("YT_OAUTH_COOKIE_SECRET atau NEXTAUTH_SECRET");
  return { configured: missing.length === 0, missing, clientId, clientSecret, cookieSecret, redirectUri };
}

export function setEncryptedTokenCookie(res: NextResponse, token: StoredYoutubeToken, secret: string) {
  res.cookies.set(YT_TOKEN_COOKIE, encryptJson(token, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 45,
  });
}

export function clearYoutubeCookies(res: NextResponse) {
  res.cookies.set(YT_TOKEN_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
  res.cookies.set(YT_STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
}

export function readStoredToken(req: Request, secret: string): StoredYoutubeToken | null {
  const raw = parseCookieHeader(req)[YT_TOKEN_COOKIE];
  if (!raw) return null;
  const t = decryptJson<StoredYoutubeToken>(raw, secret);
  if (!t?.access_token) return null;
  return t;
}

export function signState(state: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(state).digest("hex");
}

async function googleTokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error_description === "string" ? data.error_description : `Google token HTTP ${res.status}`);
  return data as Record<string, unknown>;
}

export async function exchangeCodeForToken(code: string, cfg: YoutubeOAuthConfig): Promise<StoredYoutubeToken> {
  const data = await googleTokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error("Google tidak mengirim access token.");
  const expiresIn = Number(data.expires_in || 3600);
  return {
    access_token: accessToken,
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expires_at: Date.now() + Math.max(60, expiresIn - 45) * 1000,
    scope: typeof data.scope === "string" ? data.scope : undefined,
    token_type: typeof data.token_type === "string" ? data.token_type : "Bearer",
  };
}

export async function refreshYoutubeToken(token: StoredYoutubeToken, cfg: YoutubeOAuthConfig): Promise<StoredYoutubeToken> {
  if (!token.refresh_token) throw new Error("Refresh token tidak ada. Hubungkan YouTube ulang.");
  const data = await googleTokenRequest({
    refresh_token: token.refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error("Google tidak mengirim access token baru.");
  const expiresIn = Number(data.expires_in || 3600);
  return {
    ...token,
    access_token: accessToken,
    expires_at: Date.now() + Math.max(60, expiresIn - 45) * 1000,
    scope: typeof data.scope === "string" ? data.scope : token.scope,
    token_type: typeof data.token_type === "string" ? data.token_type : token.token_type,
  };
}

export async function ensureYoutubeAccess(req: Request): Promise<YoutubeAuthResult> {
  const cfg = youtubeOAuthConfig(req);
  if (!cfg.configured) return { ok: false, status: 500, error: "YouTube OAuth belum dikonfigurasi.", missing: cfg.missing };
  const stored = readStoredToken(req, cfg.cookieSecret);
  if (!stored) return { ok: false, status: 401, error: "YouTube belum terhubung." };
  if (stored.expires_at > Date.now() + 60_000) return { ok: true, accessToken: stored.access_token, token: stored };
  try {
    const refreshed = await refreshYoutubeToken(stored, cfg);
    return { ok: true, accessToken: refreshed.access_token, token: refreshed, refreshed };
  } catch (e) {
    return { ok: false, status: 401, error: e instanceof Error ? e.message : "Token YouTube kedaluwarsa." };
  }
}

export async function ytAuthedGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error?.message === "string" ? data.error.message : `YouTube API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function isoDurToSec(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + +(m[3] || 0);
}

export function dateDaysAgo(days: number): string {
  const d = new Date(Date.now() - Math.max(1, days) * 864e5);
  return d.toISOString().slice(0, 10);
}
export function todayDate(): string { return new Date().toISOString().slice(0, 10); }
