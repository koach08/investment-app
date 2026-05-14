/**
 * Zaim API クライアント (OAuth 1.0a, 手書き署名)
 *
 * oauth-1.0a パッケージ経由で 401 Consumer not found が出たので、
 * RFC 5849 に従って手書き実装。oauth_callback を確実に header に入れる。
 */

import crypto from "crypto";

const REQUEST_TOKEN_URL = "https://api.zaim.net/v2/auth/request";
const ACCESS_TOKEN_URL = "https://api.zaim.net/v2/auth/access";
const AUTH_URL = "https://auth.zaim.net/users/auth";
const API_BASE = "https://api.zaim.net/v2";

/** RFC 3986 準拠 URL エンコード (encodeURIComponent では足りない !'()* も変換) */
function rfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

interface SigningOptions {
  /** OAuth params (oauth_callback, oauth_token, oauth_verifier 等) */
  oauthExtra?: Record<string, string>;
  /** リクエスト body / query の追加パラメータ (signature 計算に含める) */
  bodyParams?: Record<string, string>;
  /** Access Token (Step 2 以降) */
  tokenSecret?: string;
}

function buildAuthHeader(
  method: "GET" | "POST",
  url: string,
  consumerKey: string,
  consumerSecret: string,
  opts: SigningOptions = {}
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...(opts.oauthExtra ?? {}),
  };

  // signature base string 用に全パラメータを集約 (body + query + oauth)
  const u = new URL(url);
  const queryParams: Record<string, string> = {};
  for (const [k, v] of u.searchParams.entries()) queryParams[k] = v;

  const allParams: Record<string, string> = {
    ...queryParams,
    ...(opts.bodyParams ?? {}),
    ...oauthParams,
  };

  // RFC 5849 Section 3.4.1: ソート → エンコード → join
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(allParams[k])}`)
    .join("&");

  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const baseString = [
    method.toUpperCase(),
    rfc3986Encode(baseUrl),
    rfc3986Encode(paramString),
  ].join("&");

  const signingKey = `${rfc3986Encode(consumerSecret)}&${rfc3986Encode(opts.tokenSecret ?? "")}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  // Authorization header (oauth_* のみ、ソート不要だが慣習で)
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${rfc3986Encode(k)}="${rfc3986Encode(oauthParams[k])}"`);

  return "OAuth " + headerParts.join(", ");
}

function getCreds(): { key: string; secret: string } {
  const key = process.env.ZAIM_CONSUMER_KEY;
  const secret = process.env.ZAIM_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("ZAIM_CONSUMER_KEY / ZAIM_CONSUMER_SECRET 未設定");
  return { key, secret };
}

function parseFormResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split("&")) {
    const [k, v] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}

/** Step 1: request token */
export async function getRequestToken(callbackUrl: string): Promise<{
  requestToken: string;
  requestSecret: string;
  authorizeUrl: string;
}> {
  const { key, secret } = getCreds();
  const authHeader = buildAuthHeader("POST", REQUEST_TOKEN_URL, key, secret, {
    oauthExtra: { oauth_callback: callbackUrl },
  });

  const res = await fetch(REQUEST_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim request token 失敗 HTTP ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = parseFormResponse(text);
  const requestToken = parsed.oauth_token;
  const requestSecret = parsed.oauth_token_secret;
  if (!requestToken || !requestSecret) {
    throw new Error(`Zaim request token レスポンス不正: ${text}`);
  }

  return {
    requestToken,
    requestSecret,
    authorizeUrl: `${AUTH_URL}?oauth_token=${encodeURIComponent(requestToken)}`,
  };
}

/** Step 2: access token */
export async function getAccessToken(
  requestToken: string,
  requestSecret: string,
  oauthVerifier: string,
): Promise<{ accessToken: string; accessSecret: string }> {
  const { key, secret } = getCreds();
  const authHeader = buildAuthHeader("POST", ACCESS_TOKEN_URL, key, secret, {
    oauthExtra: { oauth_token: requestToken, oauth_verifier: oauthVerifier },
    tokenSecret: requestSecret,
  });

  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim access token 失敗 HTTP ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = parseFormResponse(text);
  const accessToken = parsed.oauth_token;
  const accessSecret = parsed.oauth_token_secret;
  if (!accessToken || !accessSecret) {
    throw new Error(`Zaim access token レスポンス不正: ${text}`);
  }

  return { accessToken, accessSecret };
}

export async function callZaim<T = unknown>(
  path: string,
  accessToken: string,
  accessSecret: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const { key, secret } = getCreds();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const queryParams: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) queryParams[k] = v;

  const authHeader = buildAuthHeader("GET", url.toString(), key, secret, {
    oauthExtra: { oauth_token: accessToken },
    bodyParams: queryParams,
    tokenSecret: accessSecret,
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim API ${path} HTTP ${res.status}: ${body}`);
  }

  return await res.json();
}

export interface ZaimAccount {
  id: number;
  name: string;
  active: number;
  parent_account_id: number;
  modified: string;
  sort: number;
  amount?: number;
  currency_code?: string;
}

export async function fetchAccounts(
  accessToken: string,
  accessSecret: string,
): Promise<ZaimAccount[]> {
  const data = await callZaim<{ accounts: ZaimAccount[] }>("/home/account", accessToken, accessSecret);
  return data.accounts.filter((a) => a.active === 1);
}

interface ZaimMoneyRecord {
  id: number;
  mode: "income" | "payment" | "transfer";
  amount: number;
  from_account_id?: number; // payment / outgoing transfer
  to_account_id?: number;   // income / incoming transfer
  date: string;
}

/** 口座別残高を money records から集計. 365日 さかのぼり. */
export async function fetchAccountBalances(
  accessToken: string,
  accessSecret: string,
): Promise<Map<number, number>> {
  const balances = new Map<number, number>();
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  // ページング (Zaim の money は 1 リクエスト最大 100 件)
  for (let page = 1; page <= 50; page++) {
    const data = await callZaim<{ money: ZaimMoneyRecord[] }>("/home/money", accessToken, accessSecret, {
      mapping: 1,
      start_date: startDate,
      end_date: endDate,
      limit: 100,
      page,
    }).catch(() => ({ money: [] as ZaimMoneyRecord[] }));

    if (!data.money || data.money.length === 0) break;

    for (const r of data.money) {
      const amount = Number(r.amount ?? 0);
      // income → to_account_id にプラス
      if (r.mode === "income" && r.to_account_id) {
        balances.set(r.to_account_id, (balances.get(r.to_account_id) ?? 0) + amount);
      }
      // payment → from_account_id にマイナス
      if (r.mode === "payment" && r.from_account_id) {
        balances.set(r.from_account_id, (balances.get(r.from_account_id) ?? 0) - amount);
      }
      // transfer → from -, to +
      if (r.mode === "transfer") {
        if (r.from_account_id) balances.set(r.from_account_id, (balances.get(r.from_account_id) ?? 0) - amount);
        if (r.to_account_id) balances.set(r.to_account_id, (balances.get(r.to_account_id) ?? 0) + amount);
      }
    }

    if (data.money.length < 100) break;
  }

  return balances;
}
